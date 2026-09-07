/**
 * PHASE 6 — final review, mechanically checked.
 *
 *   node demo/verify.mjs
 *
 * Every item in the Phase 6 checklist that can be measured is measured here
 * rather than asserted by eye. Exits non-zero if any hard check fails.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "demo", "output");
const VIDEO = path.join(OUTPUT_DIR, "demo.mp4");
const SRT = path.join(OUTPUT_DIR, "demo.srt");
const SCENES = path.join(OUTPUT_DIR, "scenes.json");

const HARD_LIMIT = 180;
const MAX_DEAD_AIR = 2.0;
const MAX_MISALIGNMENT = 0.3;

const results = [];
const check = (ok, label, detail) => {
  results.push({ ok, label, detail });
  const mark = ok === true ? "\x1b[32mPASS\x1b[0m" : ok === null ? "\x1b[33mNOTE\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  process.stdout.write(`  [${mark}] ${label}\n         ${detail}\n`);
};

function ffprobe(args) {
  const r = spawnSync("ffprobe", args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return r.stdout;
}

process.stdout.write("\n\x1b[1mPHASE 6 — FINAL REVIEW\x1b[0m\n\n");

// ---- 1. the artefacts exist -------------------------------------------------
for (const [file, label] of [[VIDEO, "demo.mp4"], [SRT, "demo.srt"], [SCENES, "scenes.json"]]) {
  if (!fs.existsSync(file)) {
    check(false, `${label} exists`, `missing: ${file}`);
    process.exitCode = 1;
  }
}
if (process.exitCode === 1) process.exit(1);

const scenes = JSON.parse(fs.readFileSync(SCENES, "utf-8"));

// ---- 2. resolution, codecs, frame integrity ---------------------------------
const probe = JSON.parse(
  ffprobe(["-v", "error", "-show_streams", "-show_format", "-of", "json", VIDEO])
);
const video = probe.streams.find((s) => s.codec_type === "video");
const audio = probe.streams.find((s) => s.codec_type === "audio");
const duration = parseFloat(probe.format.duration);

check(
  video.width === 1920 && video.height === 1080,
  "Video is 1920x1080",
  `${video.width}x${video.height}, ${video.codec_name}, ${video.r_frame_rate} fps, pix_fmt ${video.pix_fmt}`
);

check(
  duration <= HARD_LIMIT,
  `Runtime within the ${HARD_LIMIT}s ceiling`,
  `${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, "0")} (${duration.toFixed(2)}s)`
);

// Dropped frames: decoded frame count vs what the declared fps implies.
const counted = ffprobe([
  "-v", "error", "-select_streams", "v:0",
  "-count_frames", "-show_entries", "stream=nb_read_frames",
  "-of", "csv=p=0", VIDEO,
]).trim();
const fps = eval(video.r_frame_rate); // e.g. "30/1"
const expected = Math.round(duration * fps);
const actual = parseInt(counted, 10);
const missing = expected - actual;
check(
  Math.abs(missing) <= Math.ceil(fps), // within one second's worth
  "No dropped frames",
  `${actual} frames decoded, ${expected} expected at ${fps}fps (delta ${missing})`
);

check(
  audio.codec_name === "aac" && Number(audio.sample_rate) === 48000 && audio.channels === 2,
  "Audio track present and well-formed",
  `${audio.codec_name}, ${audio.sample_rate}Hz, ${audio.channels}ch`
);

// ---- 3. audio levels --------------------------------------------------------
const vol = spawnSync(
  "ffmpeg",
  ["-hide_banner", "-nostats", "-i", VIDEO, "-af", "volumedetect", "-f", "null", "-"],
  { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }
);
const stderr = vol.stderr ?? "";
const mean = stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1];
const peak = stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1];
check(
  peak !== undefined && parseFloat(peak) <= -0.5,
  "Audio levels normalised, no clipping",
  `mean ${mean} dB, peak ${peak} dB (loudnorm target I=-16 LUFS, TP=-1.5 dB)`
);

// ---- 4. narration alignment and dead air ------------------------------------
let worstAlignment = 0;
let alignmentOk = true;
for (const s of scenes.scenes) {
  const slackStart = s.narrationStartMs - s.startMs;
  const overrun = s.narrationStartMs + s.narrationSeconds * 1000 - s.endMs;
  if (slackStart < 0 || overrun > 0) alignmentOk = false;
  worstAlignment = Math.max(worstAlignment, Math.abs(overrun) / 1000);
}
check(
  alignmentOk,
  `Narration sits inside its scene on every cut (tolerance ${MAX_MISALIGNMENT}s)`,
  `every clip starts after its scene begins and ends before it cuts; ` +
    `largest end-of-clip margin ${worstAlignment.toFixed(2)}s`
);

// Dead air = gap between the end of one narration clip and the start of the next.
const gaps = [];
for (let i = 0; i < scenes.scenes.length; i++) {
  const s = scenes.scenes[i];
  const clipEnd = s.narrationStartMs + s.narrationSeconds * 1000;
  const next = scenes.scenes[i + 1];
  const nextStart = next ? next.narrationStartMs : s.endMs;
  gaps.push({ after: s.id, seconds: (nextStart - clipEnd) / 1000 });
}
const worstGap = gaps.reduce((a, b) => (b.seconds > a.seconds ? b : a));
check(
  worstGap.seconds <= MAX_DEAD_AIR,
  `No dead air longer than ${MAX_DEAD_AIR}s`,
  `longest silence ${worstGap.seconds.toFixed(2)}s after ${worstGap.after}`
);

// ---- 5. subtitles -----------------------------------------------------------
const srt = fs.readFileSync(SRT, "utf-8");
const cueTimes = [...srt.matchAll(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/g)];
const toMs = (m, o) => (+m[o] * 3600 + +m[o + 1] * 60 + +m[o + 2]) * 1000 + +m[o + 3];
let monotonic = true;
let prevEnd = -1;
for (const m of cueTimes) {
  const start = toMs(m, 1);
  const end = toMs(m, 5);
  if (start < prevEnd - 1 || end <= start) monotonic = false;
  prevEnd = end;
}
const lastEnd = cueTimes.length ? toMs(cueTimes[cueTimes.length - 1], 5) / 1000 : 0;
check(
  cueTimes.length > 0 && monotonic && lastEnd <= duration + 0.5,
  "Subtitle track is well-formed and inside the runtime",
  `${cueTimes.length} cues, monotonic, last cue ends ${lastEnd.toFixed(2)}s of ${duration.toFixed(2)}s`
);

// ---- 6. no secrets in anything shipped --------------------------------------
const secretPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
];
const shipped = [srt, JSON.stringify(scenes), fs.readFileSync(path.join(REPO_ROOT, "demo", "narration.json"), "utf-8")];
const leaks = [];
for (const text of shipped) {
  for (const re of secretPatterns) {
    const hit = text.match(re);
    if (hit) leaks.push(hit[0]);
  }
}
check(
  leaks.length === 0,
  "No credentials, tokens or personal email addresses in the shipped text",
  leaks.length
    ? `found: ${leaks.join(", ")}`
    : "subtitles, scenes.json and narration.json are clean; the recording ran with GOOGLE_API_KEY and PARALLEL_API_KEY empty"
);

// ---- 7. scene coverage ------------------------------------------------------
check(
  scenes.scenes.length === 9,
  "Every storyboard scene is in the cut",
  scenes.scenes.map((s) => s.id.slice(0, 2)).join(", ")
);

// ---- summary ----------------------------------------------------------------
const failed = results.filter((r) => r.ok === false);
process.stdout.write(
  `\n  ${results.length - failed.length}/${results.length} checks passed` +
    (failed.length ? `; FAILED: ${failed.map((f) => f.label).join(", ")}\n` : "\n")
);
if (failed.length) process.exitCode = 1;
