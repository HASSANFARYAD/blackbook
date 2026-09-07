/**
 * BLACKBOOK demo builder.
 *
 *   node demo/build.mjs --dry-run   gates + two identical assertion-only passes
 *   node demo/build.mjs             gates + narration + recording + mux + subtitles
 *
 * Design rules this file enforces:
 *  - Nothing is recorded until the pre-recording gate passes.
 *  - The video is never sped up or slowed down to fit the narration. Scene lengths
 *    are measured at runtime; the audio track is padded with silence to match them.
 *  - scenes.json is the single timing source for both the mux and the .srt.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_DIR = path.join(REPO_ROOT, "demo");
const OUTPUT_DIR = path.join(DEMO_DIR, "output");
const AUDIO_DIR = path.join(OUTPUT_DIR, "audio");
const RAW_DIR = path.join(OUTPUT_DIR, "raw");

const NARRATION_FILE = path.join(DEMO_DIR, "narration.json");
const DURATIONS_FILE = path.join(OUTPUT_DIR, "audio-durations.json");
const SCENES_FILE = path.join(OUTPUT_DIR, "scenes.json");
const VIDEO_FILE = path.join(OUTPUT_DIR, "demo.mp4");
const SUBTITLE_FILE = path.join(OUTPUT_DIR, "demo.srt");

const HARD_LIMIT_SECONDS = 180; // hackathon ceiling
const LEAD_IN_MS = 600; // a beat of settled UI before the first word
const TAIL_MS = 900; // a beat after the last word before the cut

const dryRun = process.argv.includes("--dry-run");
const skipGates = process.argv.includes("--skip-gates");
// Re-run the mux against the last capture without re-recording or re-narrating.
const muxOnly = process.argv.includes("--mux-only");

const log = (msg) => process.stdout.write(`${msg}\n`);
const section = (msg) => log(`\n\x1b[1m${msg}\x1b[0m`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    encoding: "utf-8",
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, ...(opts.env ?? {}) },
    shell: process.platform === "win32",
  });
  if (r.status !== 0 && !opts.allowFailure) {
    log(r.stdout ?? "");
    log(r.stderr ?? "");
    throw new Error(`${opts.label ?? cmd} failed with exit ${r.status}`);
  }
  return r;
}

const python = [
  path.join(REPO_ROOT, ".venv", "Scripts", "python.exe"),
  path.join(REPO_ROOT, ".venv", "bin", "python"),
].find((p) => fs.existsSync(p)) ?? (process.platform === "win32" ? "python" : "python3");

const probeDuration = (file) =>
  parseFloat(
    run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
      label: "ffprobe",
    }).stdout.trim()
  );

// ---------------------------------------------------------------- gate

function gate() {
  section("PHASE 4 GATE");
  if (skipGates) {
    log("  skipped (--skip-gates)");
    return;
  }

  const pytest = run(python, ["-m", "pytest", "-q"], { label: "pytest" });
  log(`  pytest .............. ${pytest.stdout.trim().split("\n").pop()}`);

  const e2e = run("npx", ["playwright", "test"], { cwd: path.join(REPO_ROOT, "web"), label: "playwright (web)" });
  log(`  web e2e ............. ${e2e.stdout.trim().split("\n").filter(Boolean).pop()}`);

  run("npm", ["run", "build"], { cwd: path.join(REPO_ROOT, "web"), label: "vite build" });
  log("  web bundle .......... rebuilt, so the recording shows current source");
}

// ---------------------------------------------------------------- narration

function synthesiseNarration(spec) {
  section("NARRATION");
  fs.rmSync(AUDIO_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  run("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", path.join(DEMO_DIR, "tts.ps1"),
    "-Json", NARRATION_FILE,
    "-Out", AUDIO_DIR,
  ], { label: "tts" });

  const durations = {};
  let total = 0;
  for (const scene of spec.scenes) {
    const file = path.join(AUDIO_DIR, `${scene.id}.wav`);
    if (!fs.existsSync(file)) throw new Error(`missing narration audio for ${scene.id}`);
    const seconds = probeDuration(file);
    durations[scene.id] = seconds;
    total += seconds;
    log(`  ${scene.id.padEnd(20)} ${seconds.toFixed(1)}s`);
  }
  log(`  narration speech total: ${total.toFixed(1)}s`);

  const ceiling = spec.maxTotalSeconds ?? HARD_LIMIT_SECONDS;
  if (total > ceiling) {
    throw new Error(`narration is ${total.toFixed(1)}s, over the ${ceiling}s budget -- trim the script`);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(DURATIONS_FILE, JSON.stringify(durations, null, 2));
  return durations;
}

// ---------------------------------------------------------------- recording

function record({ dry }) {
  const r = run("npx", [
    "playwright", "test",
    "--config", path.join(DEMO_DIR, "playwright.demo.config.ts"),
  ], {
    label: "recording",
    env: {
      DEMO_REPO_ROOT: REPO_ROOT,
      DEMO_OUTPUT_DIR: OUTPUT_DIR,
      DEMO_DRY_RUN: dry ? "1" : "0",
    },
  });
  log(r.stdout.split("\n").filter((l) => /^\s{2}\d{2}-|passed|failed/.test(l)).join("\n"));
}

/**
 * Finds the finished capture.
 *
 * `page.video().path()` names the file while the test is still running; Playwright
 * then moves it into the test's output directory on teardown, so the path recorded
 * inside the spec is stale by the time we get here. Search for the artefact instead.
 */
function findRecordedVideo(recordedPath) {
  if (recordedPath && fs.existsSync(recordedPath)) return recordedPath;
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".webm")) found.push(full);
    }
  };
  if (fs.existsSync(RAW_DIR)) walk(RAW_DIR);
  if (!found.length) throw new Error(`no .webm capture found under ${RAW_DIR}`);
  return found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

// ---------------------------------------------------------------- audio track

/**
 * Builds one narration track whose clips land exactly on their scene's measured
 * start. Silence is inserted between clips; the video is left untouched.
 */
function buildAudioTrack(scenes, trimStartMs) {
  const listFile = path.join(AUDIO_DIR, "concat.txt");
  const entries = [];
  let cursorMs = 0;

  scenes.forEach((scene, i) => {
    const targetMs = scene.audioStartMs - trimStartMs;
    const gapMs = Math.max(0, Math.round(targetMs - cursorMs));
    if (gapMs > 0) {
      const gapFile = path.join(AUDIO_DIR, `_gap-${i}.wav`);
      run("ffmpeg", [
        "-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono",
        "-t", (gapMs / 1000).toFixed(3), gapFile,
      ], { label: "silence" });
      entries.push(gapFile);
      cursorMs += gapMs;
    }
    const clip = path.join(AUDIO_DIR, `${scene.id}.wav`);
    entries.push(clip);
    cursorMs += Math.round(scene.audioSeconds * 1000);
  });

  fs.writeFileSync(listFile, entries.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  const narration = path.join(AUDIO_DIR, "narration.wav");
  run("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-ar", "44100", "-ac", "2", narration,
  ], { label: "concat" });
  return narration;
}

// ---------------------------------------------------------------- subtitles

const NL = String.fromCharCode(10); // a literal newline inside a cue
const MAX_CUE_CHARS = 96;
const MAX_LINE_CHARS = 46;

/** Splits an over-long sentence at its strongest internal clause boundary. */
function splitLongSentence(sentence) {
  const parts = sentence
    .split(/(?<=[—;:,])\s+/)
    .reduce((acc, piece) => {
      const last = acc[acc.length - 1];
      if (last && (last + " " + piece).length <= MAX_CUE_CHARS) acc[acc.length - 1] = `${last} ${piece}`;
      else acc.push(piece);
      return acc;
    }, []);
  return parts.length > 1 ? parts : [sentence];
}

/** Two readable lines rather than one long one. */
function wrapCue(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_LINE_CHARS) return clean;
  const words = clean.split(" ");
  const lines = [""];
  for (const word of words) {
    const line = lines[lines.length - 1];
    if (!line) lines[lines.length - 1] = word;
    else if ((line + " " + word).length <= MAX_LINE_CHARS) lines[lines.length - 1] = `${line} ${word}`;
    else lines.push(word);
  }
  // SRT renders at most two lines comfortably; fold any remainder into the second.
  return lines.length <= 2 ? lines.join(NL) : [lines[0], lines.slice(1).join(" ")].join(NL);
}

const srtStamp = (ms) => {
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor(ms / 60_000) % 60).padStart(2, "0");
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  const f = String(Math.floor(ms % 1000)).padStart(3, "0");
  return `${h}:${m}:${s},${f}`;
};

/** Splits a scene's line into readable cues spread across its speech window. */
function writeSubtitles(spec, scenes, trimStartMs) {
  const byId = Object.fromEntries(spec.scenes.map((s) => [s.id, s.text]));
  const cues = [];

  for (const scene of scenes) {
    const text = byId[scene.id];
    const startMs = scene.audioStartMs - trimStartMs;
    const spanMs = scene.audioSeconds * 1000;

    // Sentences first, then split anything still too long to read at a clause
    // boundary -- a 200-character cue is legal SRT and useless to a viewer.
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [text];
    const chunks = sentences.flatMap((sentence) =>
      sentence.length <= MAX_CUE_CHARS ? [sentence] : splitLongSentence(sentence)
    );
    const totalWords = chunks.reduce((n, s) => n + s.split(/\s+/).length, 0);
    let offset = 0;
    for (const chunk of chunks) {
      const share = (chunk.split(/\s+/).length / totalWords) * spanMs;
      cues.push({
        start: startMs + offset,
        end: startMs + offset + share - 60,
        text: wrapCue(chunk),
      });
      offset += share;
    }
  }

  const srt = cues
    .map((c, i) => `${i + 1}\n${srtStamp(c.start)} --> ${srtStamp(c.end)}\n${c.text}\n`)
    .join("\n");
  fs.writeFileSync(SUBTITLE_FILE, srt, "utf-8");
  log(`  ${path.relative(REPO_ROOT, SUBTITLE_FILE)} (${cues.length} cues)`);
}

// ---------------------------------------------------------------- main

async function main() {
  const spec = JSON.parse(fs.readFileSync(NARRATION_FILE, "utf-8"));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (!muxOnly) gate();

  if (dryRun) {
    const dryPath = path.join(OUTPUT_DIR, "scenes.dryrun.json");
    section("DRY RUN 1 of 2");
    record({ dry: true });
    const first = JSON.parse(fs.readFileSync(dryPath, "utf-8"));
    section("DRY RUN 2 of 2");
    record({ dry: true });
    const second = JSON.parse(fs.readFileSync(dryPath, "utf-8"));

    section("DRY RUN COMPARISON");
    // Wall-clock totals always differ by a few hundred ms; what has to be identical
    // is that both passes reached every scene, in order, with every assertion met.
    const shape = (r) => JSON.stringify(r.scenes);
    if (shape(first) !== shape(second)) {
      log(shape(first));
      log(shape(second));
      throw new Error("the two dry runs did not reach the same scenes");
    }
    log(`  pass 1: ${first.scenes.length} scenes, all assertions met, ${(first.totalMs / 1000).toFixed(1)}s`);
    log(`  pass 2: ${second.scenes.length} scenes, all assertions met, ${(second.totalMs / 1000).toFixed(1)}s`);
    log(`  identical scene order; wall-clock variance ${Math.abs(first.totalMs - second.totalMs)}ms`);
    log("\nGate satisfied. Run `node demo/build.mjs` to record.");
    return;
  }

  if (!muxOnly) {
    synthesiseNarration(spec);

    section("RECORDING (native 1920x1080)");
    fs.rmSync(RAW_DIR, { recursive: true, force: true });
    record({ dry: false });
  } else {
    section("MUX ONLY -- reusing the last capture and narration");
  }

  const recorded = JSON.parse(fs.readFileSync(SCENES_FILE, "utf-8"));
  // A completed build rewrites scenes.json in final-cut coordinates, dropping the
  // raw capture offsets. Detect that shape so --mux-only can be run again on the
  // same take instead of failing on a missing field.
  const alreadyRebased = recorded.scenes[0].audioStartMs === undefined;
  const scenes = alreadyRebased
    ? recorded.scenes.map((s) => ({ ...s, audioStartMs: s.narrationStartMs, audioSeconds: s.narrationSeconds }))
    : recorded.scenes;

  section("MUX");
  const rawVideo = findRecordedVideo(recorded.videoPath);
  log(`  capture ${path.relative(REPO_ROOT, rawVideo)}`);
  const rawSeconds = probeDuration(rawVideo);
  if (recorded.totalMs) {
    const wallSeconds = recorded.totalMs / 1000;
    log(`  raw capture ${rawSeconds.toFixed(2)}s vs wall clock ${wallSeconds.toFixed(2)}s ` +
        `(drift ${(rawSeconds - wallSeconds).toFixed(2)}s)`);
  } else {
    log(`  raw capture ${rawSeconds.toFixed(2)}s (re-muxing a take already measured)`);
  }

  // Already-rebased timings are relative to the cut, so there is nothing left to trim.
  const trimStartMs = alreadyRebased ? 0 : Math.max(0, scenes[0].audioStartMs - LEAD_IN_MS);
  const lastScene = scenes[scenes.length - 1];
  const outSeconds = (lastScene.endMs + TAIL_MS - trimStartMs) / 1000;

  const narration = buildAudioTrack(scenes, trimStartMs);
  log(`  narration track ${probeDuration(narration).toFixed(2)}s, picture ${outSeconds.toFixed(2)}s`);

  run("ffmpeg", [
    "-y",
    "-ss", (trimStartMs / 1000).toFixed(3),
    "-t", outSeconds.toFixed(3),
    "-i", rawVideo,
    "-i", narration,
    // No setpts, no atempo: the picture plays at exactly the speed it was captured.
    "-filter:v", "fps=30",
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart",
    VIDEO_FILE,
  ], { label: "mux" });

  section("SUBTITLES");
  writeSubtitles(spec, scenes, trimStartMs);

  // Rebase scenes.json onto the final cut so it describes the shipped file.
  const rebased = {
    recordedAt: recorded.recordedAt,
    video: path.relative(REPO_ROOT, VIDEO_FILE).replace(/\\/g, "/"),
    subtitles: path.relative(REPO_ROOT, SUBTITLE_FILE).replace(/\\/g, "/"),
    resolution: "1920x1080",
    fps: 30,
    durationSeconds: probeDuration(VIDEO_FILE),
    scenes: scenes.map((s) => ({
      id: s.id,
      feature: s.feature,
      startMs: s.startMs - trimStartMs,
      narrationStartMs: s.audioStartMs - trimStartMs,
      endMs: s.endMs - trimStartMs,
      narrationSeconds: Number(s.audioSeconds.toFixed(3)),
    })),
  };
  fs.writeFileSync(SCENES_FILE, JSON.stringify(rebased, null, 2));

  section("RESULT");
  const finalSeconds = rebased.durationSeconds;
  log(`  ${path.relative(REPO_ROOT, VIDEO_FILE)}`);
  log(`  ${Math.floor(finalSeconds / 60)}:${String(Math.round(finalSeconds % 60)).padStart(2, "0")} ` +
      `(hard limit ${HARD_LIMIT_SECONDS / 60}:00)`);
  if (finalSeconds > HARD_LIMIT_SECONDS) log("  WARNING: over the 3 minute limit");
}

main().catch((e) => {
  process.stderr.write(`\nFailed: ${e.message}\n`);
  process.exitCode = 1;
});
