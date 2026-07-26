/**
 * captureRealCamera — frame-stepped headless screenshots of a VFX effect
 * THROUGH THE REAL GAME CAMERA, plus a pixel diff against the same frame with
 * the effect switched off.
 *
 * WHY IT DIFFS. "The screenshot has a firework in it" is a judgement; "this
 * frame differs from the effect-off frame in N pixels" is a measurement, and it
 * is the only one that catches the #93 failure mode — an effect that is alive,
 * on-frame, correctly constructed, and contributing ZERO pixels because opaque
 * geometry is in front of it. A previous attempt at #235 shipped two
 * BYTE-IDENTICAL frames as before/after evidence; a diff would have caught that
 * in one line, so the diff is part of the tool rather than part of the review.
 *
 * Usage (dev server must already be running — see --base):
 *   node apps/client/scripts/captureRealCamera.mjs \
 *     --base http://127.0.0.1:5199 --out /tmp/shots \
 *     --shot volley-combat:'fx=volley&cam=combat&step=780'
 *
 * Technique notes (inherited from #93, kept because they were hard-won):
 *   · headless Chrome with SwiftShader; `--virtual-time-budget` times out on
 *     WebGL, so drive `Page.captureScreenshot` over CDP on demand instead.
 *   · the PAGE owns the clock (`?step=`), so the captured moment is independent
 *     of how slow software rendering is.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME =
  process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function parseArgs(argv) {
  const out = { shots: [], base: "http://127.0.0.1:5199", page: "presentation-audition.html", out: "./capture-out", profile: "./capture-profile", width: 1280, height: 720 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--shot") out.shots.push(argv[++i]);
    // which audition page to drive. Every such page exposes the same three
    // hooks (`__settled`, `__probe()`, a `#view` canvas), so the capture +
    // diff machinery is page-agnostic; #263 added `tint-audition.html`.
    else if (a === "--page") out.page = argv[++i];
    else if (a === "--base") out.base = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--profile") out.profile = argv[++i];
    else if (a === "--width") out.width = Number(argv[++i]);
    else if (a === "--height") out.height = Number(argv[++i]);
  }
  return out;
}

async function waitPort(port, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await new Promise((res) => {
      const s = createConnection({ port, host: "127.0.0.1" }, () => {
        s.end();
        res(true);
      });
      s.on("error", () => res(false));
    });
    if (ok) return true;
    await sleep(150);
  }
  return false;
}

/** Minimal CDP client over the DevTools WebSocket (no dependencies). */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  }
}

async function connect(port) {
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  return new Cdp(ws);
}

/** Count of pixels differing by more than `tol` on any channel. */
function diffPixels(a, b, tol = 6) {
  let n = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 4) {
    if (
      Math.abs(a[i] - b[i]) > tol ||
      Math.abs(a[i + 1] - b[i + 1]) > tol ||
      Math.abs(a[i + 2] - b[i + 2]) > tol
    ) {
      n++;
    }
  }
  return n;
}

async function main() {
  const args = parseArgs(process.argv);
  mkdirSync(args.out, { recursive: true });
  const devPort = 9333;
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${devPort}`,
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${args.profile}`,
      `--window-size=${args.width},${args.height}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  process.on("exit", () => chrome.kill());
  if (!(await waitPort(devPort))) throw new Error("headless chrome never opened its debug port");
  const cdp = await connect(devPort);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const results = [];
  for (const shot of args.shots) {
    const [name, query] = shot.split(/:(.+)/);
    const url = `${args.base}/${args.page}?${query}`;
    await cdp.send("Page.navigate", { url });
    // wait for the page's own frame-stepped clock to reach the target and freeze
    let settled = false;
    for (let i = 0; i < 400; i++) {
      await sleep(250);
      try {
        settled = await cdp.evaluate("window.__settled === true");
      } catch {
        settled = false;
      }
      if (settled) break;
    }
    const probe = settled ? await cdp.evaluate("JSON.stringify(window.__probe())") : null;
    const png = await cdp.send("Page.captureScreenshot", { format: "png" });
    const buf = Buffer.from(png.data, "base64");
    writeFileSync(`${args.out}/${name}.png`, buf);
    // A DOWNSAMPLED RGBA thumbnail read straight off the canvas, for the pixel
    // diff. Returning the full 1280×720 buffer over CDP is ~5 MB of base64 per
    // shot and stalls the connection; 160×90 is 57 KB and still resolves a
    // firework or a light column to dozens of cells. A PNG byte compare would
    // be defeated by encoder nondeterminism, which is exactly why the previous
    // #235 attempt could present two "identical" frames as evidence.
    const raw = await cdp.evaluate(`(() => {
      const c = document.getElementById("view");
      const g = c.getContext("webgl2") || c.getContext("webgl");
      const px = new Uint8Array(c.width * c.height * 4);
      g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
      const W = 160, H = 90;
      const out = new Uint8Array(W * H * 4);
      for (let y = 0; y < H; y++) {
        const sy = Math.floor((y / H) * c.height);
        for (let x = 0; x < W; x++) {
          const sx = Math.floor((x / W) * c.width);
          const si = (sy * c.width + sx) * 4, di = (y * W + x) * 4;
          out[di] = px[si]; out[di+1] = px[si+1]; out[di+2] = px[si+2]; out[di+3] = px[si+3];
        }
      }
      let s = ""; const CH = 4096;
      for (let i = 0; i < out.length; i += CH) s += String.fromCharCode.apply(null, out.subarray(i, i + CH));
      return btoa(s);
    })()`);
    results.push({ name, query, settled, probe: probe ? JSON.parse(probe) : null, raw });
    process.stderr.write(`captured ${name} settled=${settled}\n`);
  }

  const byName = new Map(results.map((r) => [r.name, r]));
  const report = results.map((r) => {
    const baseName = r.name.replace(/^[^-]+-/, "none-");
    const base = byName.get(baseName);
    const changed =
      base && base !== r
        ? diffPixels(Buffer.from(r.raw, "base64"), Buffer.from(base.raw, "base64"))
        : null;
    const total = 160 * 90;
    return {
      name: r.name,
      settled: r.settled,
      probe: r.probe,
      changedPixels: changed,
      changedFraction: changed === null ? null : changed / total,
    };
  });
  console.log(JSON.stringify(report, null, 2));
  chrome.kill();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
