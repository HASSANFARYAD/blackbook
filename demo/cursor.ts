import type { Locator, Page } from "@playwright/test";

/**
 * Synthetic cursor, highlight ring and smooth scrolling for screen recordings.
 *
 * Playwright's video recorder captures page content only -- the real OS pointer is
 * never in the frame. So the "cursor" a viewer sees has to be a DOM element we
 * drive ourselves, which also lets us move it at a readable speed rather than
 * teleporting it the way a raw `click()` would.
 */

const OVERLAY_ID = "__demo_overlay";

/** Injects the cursor + highlight overlay. Call once, before the first navigation. */
export async function installOverlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const build = () => {
      if (document.getElementById("__demo_overlay")) return;

      const style = document.createElement("style");
      style.textContent = `
        #__demo_overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
        #__demo_cursor {
          position: fixed; top: 0; left: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px;
          border-radius: 50%; opacity: 0;
          background: radial-gradient(circle at 50% 50%, rgba(242,179,26,.95) 0 28%, rgba(242,179,26,.28) 30% 62%, rgba(242,179,26,0) 64%);
          box-shadow: 0 0 18px 5px rgba(242,179,26,.32);
          transition: transform 600ms cubic-bezier(.33,0,.2,1), opacity 260ms linear;
          will-change: transform;
        }
        #__demo_cursor.__click { animation: __demo_pulse 420ms ease-out; }
        @keyframes __demo_pulse {
          0%   { box-shadow: 0 0 18px 5px rgba(242,179,26,.32); }
          38%  { box-shadow: 0 0 0 16px rgba(242,179,26,.20); }
          100% { box-shadow: 0 0 18px 5px rgba(242,179,26,.32); }
        }
        #__demo_ring {
          position: fixed; border: 2px solid rgba(242,179,26,.95); border-radius: 10px;
          box-shadow: 0 0 0 5px rgba(242,179,26,.14); opacity: 0;
          transition: opacity 240ms linear, top 380ms ease, left 380ms ease,
                      width 380ms ease, height 380ms ease;
        }
      `;
      document.head.appendChild(style);

      const overlay = document.createElement("div");
      overlay.id = "__demo_overlay";
      overlay.innerHTML = `<div id="__demo_ring"></div><div id="__demo_cursor"></div>`;
      document.body.appendChild(overlay);
    };

    if (document.body) build();
    else document.addEventListener("DOMContentLoaded", build, { once: true });
  });
}

/** Re-attaches the overlay after a client-side render has replaced the body. */
export async function ensureOverlay(page: Page): Promise<void> {
  await page.waitForFunction((id) => !!document.getElementById(id), OVERLAY_ID, {
    timeout: 5000,
  });
}

async function centreOf(target: Locator): Promise<{ x: number; y: number }> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("cannot locate target for the demo cursor");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Glides the cursor to an element's centre and waits for the travel to finish. */
export async function moveTo(page: Page, target: Locator, travelMs = 600): Promise<void> {
  const { x, y } = await centreOf(target);
  await page.evaluate(
    ([px, py, ms]) => {
      const cursor = document.getElementById("__demo_cursor");
      if (!cursor) return;
      cursor.style.transitionDuration = `${ms}ms, 260ms`;
      cursor.style.opacity = "1";
      cursor.style.transform = `translate(${px}px, ${py}px)`;
    },
    [x, y, travelMs] as const
  );
  // Pacing: let the CSS transition actually play out before anything else happens.
  await page.waitForTimeout(travelMs + 120);
}

/** Draws the highlight ring around an element. Pass null to clear it. */
export async function highlight(page: Page, target: Locator | null): Promise<void> {
  if (!target) {
    await page.evaluate(() => {
      const ring = document.getElementById("__demo_ring");
      if (ring) ring.style.opacity = "0";
    });
    await page.waitForTimeout(240); // pacing: let the ring fade out
    return;
  }
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("cannot locate target for the highlight ring");
  await page.evaluate(
    ([x, y, w, h]) => {
      const ring = document.getElementById("__demo_ring");
      if (!ring) return;
      Object.assign(ring.style, {
        left: `${x - 6}px`,
        top: `${y - 6}px`,
        width: `${w + 12}px`,
        height: `${h + 12}px`,
        opacity: "1",
      });
    },
    [box.x, box.y, box.width, box.height] as const
  );
  await page.waitForTimeout(380); // pacing: let the ring settle on the target
}

/** Moves the cursor to an element, pulses it, and performs a single real click. */
export async function clickTarget(page: Page, target: Locator, travelMs = 600): Promise<void> {
  await moveTo(page, target, travelMs);
  await page.evaluate(() => {
    const cursor = document.getElementById("__demo_cursor");
    if (!cursor) return;
    cursor.classList.remove("__click");
    void cursor.offsetWidth; // restart the animation
    cursor.classList.add("__click");
  });
  await page.waitForTimeout(180); // pacing: the click pulse reads as intent
  await target.click();
}

/** Hides the cursor, e.g. across a route change. */
export async function hideCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const cursor = document.getElementById("__demo_cursor");
    const ring = document.getElementById("__demo_ring");
    if (cursor) cursor.style.opacity = "0";
    if (ring) ring.style.opacity = "0";
  });
}

/** Eased scroll to an absolute Y offset, so the recording pans instead of jumping. */
export async function glide(page: Page, to: number, ms: number): Promise<void> {
  await page.evaluate(
    ([target, duration]) =>
      new Promise<void>((done) => {
        const from = window.scrollY;
        const delta = target - from;
        if (Math.abs(delta) < 2) return done();
        const started = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - started) / duration);
          const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          window.scrollTo(0, from + delta * eased);
          if (p < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [to, ms] as const
  );
  await page.waitForTimeout(160); // pacing: let scroll momentum and any animation settle
}
