#!/usr/bin/env tsx
/**
 * RUNTIME PROBE (diagnostic, not a test) for CAST FRAME DATA — "does the body
 * still lie about when the move comes out?"
 *
 * Unit tests have been green through every one of this project's "wired but
 * dead" bugs, so this deliberately stubs nothing that matters:
 *
 *   content/models/_index.json  → the REAL model docs
 *                               → the REAL .glb bytes on disk (glTF animation
 *                                 input accessors = authored clip lengths)
 *                               → the REAL `resolveClips` clipMap resolution
 *                               → the REAL `alignPulseClip` / `naiveStrikeErrorMs`
 *                               → the REAL `castStrikeFractionFor` table
 *
 * and then, if a client dev server is reachable, a SECOND leg that proves the
 * arithmetic above is the arithmetic the game runs:
 *
 *   REAL AssetManager → REAL Babylon AnimationGroups → REAL ClipAnimator
 *                     → REAL EntityViewRegistry.handleEvent("castBegin")
 *                     → the plan the animator actually started with
 *
 *   pnpm --filter @ggd/client exec tsx scripts/probeCastFrameData.ts
 *   GGD_CLIENT_URL=http://localhost:39527 …   (omit to skip the Babylon leg)
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";

import type { ModelDoc } from "@ggd/shared/content";
import { TICK_MS } from "@ggd/shared/constants";

// The client's settings store touches `localStorage` at import time; Node's
// stub is not a Storage. Install one BEFORE any client module loads (hence the
// dynamic imports) — the point of this probe is to run the SHIPPING code.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  get length() {
    return mem.size;
  },
};

const {
  resolveClips,
  alignPulseClip,
  naiveStrikeErrorMs,
  PULSE_RATE_MIN,
  PULSE_RATE_MAX,
  ClipAnimator,
} = await import("../src/render/ClipAnimator");
const { castStrikeFractionFor, DEFAULT_CAST_STRIKE_FRACTION, CAST_STRIKE_FRACTION_BY_MODEL } =
  await import("../src/render/anim/castStrike");
const { AssetManager } = await import("../src/render/AssetManager");
const { EntityViewRegistry } = await import("../src/render/EntityViewRegistry");

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(HERE, "../../../content");
const CLIENT_URL = process.env.GGD_CLIENT_URL ?? "http://localhost:39527";
/** the Babylon glTF loader resamples every clip to this rate (ClipAnimator) */
const GLTF_FPS = 60;

/* ----------------------------------------------------------- glb clip lengths */

interface GlbJson {
  animations?: { name?: string; samplers?: { input: number }[] }[];
  accessors?: { max?: number[] }[];
}

/** Parse only the glTF JSON chunk of a .glb (the binary chunk is not needed). */
function glbJson(buf: Buffer): GlbJson {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a glb");
  const chunkLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  return JSON.parse(buf.subarray(20, 20 + chunkLen).toString("utf8")) as GlbJson;
}

/** Duration of one glTF animation = the largest time in its input accessors. */
function animDurationSec(json: GlbJson, index: number): number {
  let max = 0;
  for (const s of json.animations?.[index]?.samplers ?? []) {
    const t = json.accessors?.[s.input]?.max?.[0];
    if (typeof t === "number" && t > max) max = t;
  }
  return max;
}

async function readJson<T>(rel: string): Promise<T> {
  return JSON.parse(await readFile(join(CONTENT_DIR, rel), "utf8")) as T;
}

/* ------------------------------------------------------------------- the sweep */

interface Row {
  id: string;
  glbPath: string;
  clipName: string | null;
  durSec: number;
  fellBackToIdle: boolean;
  error?: string;
}

const idx = await readJson<{ entries?: { id: string; path: string }[] }>("models/_index.json");
const docs: ModelDoc[] = [];
for (const e of idx.entries ?? []) {
  const d = await readJson<ModelDoc>(e.path).catch(() => null);
  if (d?.glbPath) docs.push(d);
}

const rows: Row[] = [];
for (const doc of docs) {
  const row: Row = {
    id: doc.id,
    glbPath: doc.glbPath,
    clipName: null,
    durSec: 0,
    fellBackToIdle: false,
  };
  try {
    const json = glbJson(await readFile(join(CONTENT_DIR, doc.glbPath)));
    const clips = (json.animations ?? []).map((a, i) => ({
      name: a.name ?? `anim-${i}`,
      durationSec: animDurationSec(json, i),
    }));
    const resolved = resolveClips(clips, doc.clipMap);
    const castIdx = resolved.get("cast");
    row.fellBackToIdle = castIdx === undefined;
    const useIdx = castIdx ?? resolved.get("idle");
    const clip = useIdx === undefined ? null : clips[useIdx];
    row.clipName = clip?.name ?? null;
    row.durSec = clip?.durationSec ?? 0;
  } catch (e) {
    row.error = e instanceof Error ? e.message : String(e);
  }
  rows.push(row);
}

console.log(`content dir:           ${CONTENT_DIR}`);
console.log(`model docs with a glb: ${docs.length}`);
console.log(`default strike f:      ${DEFAULT_CAST_STRIKE_FRACTION}`);
console.log(`per-model overrides:   ${Object.keys(CAST_STRIKE_FRACTION_BY_MODEL).length}`);

const usable = rows.filter((r) => !r.error && r.durSec > 0);
console.log(
  `cast clip resolved:    ${rows.filter((r) => !r.fellBackToIdle && !r.error).length}` +
    `   fell back to idle: ${rows.filter((r) => r.fellBackToIdle && !r.error).length}` +
    `   unreadable: ${rows.filter((r) => r.error).length}`,
);
{
  const sorted = [...usable].sort((a, b) => a.durSec - b.durSec);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  console.log(
    `clip length range:     ${lo?.durSec.toFixed(3)}s (${lo?.id} "${lo?.clipName}")` +
      ` … ${hi?.durSec.toFixed(3)}s (${hi?.id} "${hi?.clipName}")`,
  );
}

function report(startupMs: number): void {
  const s = startupMs / 1000;
  let early = 0;
  let worstNaive = 0;
  let worstNaiveId = "";
  let worstAligned = 0;
  let worstAlignedId = "";
  let slow = 0;
  let fast = 0;
  let worstSlow: { id: string; err: number } | null = null;
  let worstFast: { id: string; err: number } | null = null;
  for (const r of usable) {
    const f = castStrikeFractionFor(r.id);
    const plan = alignPulseClip(r.durSec, s, f);
    // replay the plan by hand — where the release frame ACTUALLY lands
    const strikeMs = (plan.delaySec + (f * r.durSec - plan.skipSec) / plan.rate) * 1000;
    const aligned = strikeMs - startupMs;
    const naive = naiveStrikeErrorMs(r.durSec, s, f);
    if (naive < -1) early++;
    if (Math.abs(naive) > Math.abs(worstNaive)) {
      worstNaive = naive;
      worstNaiveId = `${r.id} "${r.clipName}" ${r.durSec.toFixed(3)}s`;
    }
    if (Math.abs(aligned) > Math.abs(worstAligned)) {
      worstAligned = aligned;
      worstAlignedId = r.id;
    }
    if (plan.clamped === "slow") {
      slow++;
      if (!worstSlow || Math.abs(naive) > Math.abs(worstSlow.err))
        worstSlow = { id: `${r.id} "${r.clipName}" ${r.durSec.toFixed(3)}s`, err: naive };
    }
    if (plan.clamped === "fast") {
      fast++;
      if (!worstFast || Math.abs(naive) > Math.abs(worstFast.err))
        worstFast = { id: `${r.id} "${r.clipName}" ${r.durSec.toFixed(3)}s`, err: naive };
    }
  }
  console.log(`\n=== startup ${startupMs}ms (${(startupMs / TICK_MS).toFixed(1)} ticks @30Hz) ===`);
  console.log(`  measurable cast clips:      ${usable.length}`);
  console.log(`  BEFORE strike EARLY (<-1ms):${String(early).padStart(4)}  of ${usable.length}`);
  console.log(`  BEFORE worst error:         ${worstNaive.toFixed(1)}ms   ${worstNaiveId}`);
  console.log(`  AFTER  worst error:         ${worstAligned.toFixed(6)}ms  ${worstAlignedId}`);
  console.log(
    `  rate clamp bit:             ${slow + fast}  (slow/${PULSE_RATE_MIN}x floor: ${slow}, fast/${PULSE_RATE_MAX}x ceiling: ${fast})`,
  );
  if (worstSlow) console.log(`    worst too-short: ${worstSlow.id} → BEFORE ${worstSlow.err.toFixed(0)}ms`);
  if (worstFast) console.log(`    worst too-long:  ${worstFast.id} → BEFORE ${worstFast.err.toFixed(0)}ms`);
  if (process.env.GGD_LIST) {
    console.log(`  --- every clamped model at ${startupMs}ms ---`);
    for (const r of usable) {
      const f = castStrikeFractionFor(r.id);
      const p = alignPulseClip(r.durSec, s, f);
      if (p.clamped === "none") continue;
      console.log(
        `    ${p.clamped.padEnd(4)} ${r.id.padEnd(26)} "${r.clipName}" ${r.durSec.toFixed(3)}s ` +
          `hold=${(p.delaySec * 1000).toFixed(0)}ms skip=${(p.skipSec * 1000).toFixed(0)}ms ` +
          `BEFORE ${naiveStrikeErrorMs(r.durSec, s, f).toFixed(0)}ms`,
      );
    }
    const zero = rows.filter((r) => !r.error && r.durSec <= 0);
    console.log(`  --- ${zero.length} model(s) whose resolved cast clip has length 0 ---`);
    for (const r of zero) console.log(`    ${r.id} "${r.clipName ?? "(none)"}"`);
    const fell = rows.filter((r) => r.fellBackToIdle && !r.error);
    console.log(`  --- ${fell.length} model(s) with NO cast clip (idle fallback) ---`);
    for (const r of fell) console.log(`    ${r.id} → "${r.clipName ?? "(none)"}"`);
  }
}

report(600); // the owner's new default cast time
report(900); // 0.6 + 0.3, the largest "already set" case after the rule

/* ------------------------------------------- leg 2: the REAL renderer, live */

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${CLIENT_URL}/content/models/_index.json`);
    return res.ok;
  } catch {
    return false;
  }
}

if (!(await reachable())) {
  console.log(
    `\n[babylon leg SKIPPED] no client dev server at ${CLIENT_URL}\n` +
      `  start one:  pnpm --filter @ggd/client dev --port 39527 --strictPort`,
  );
  process.exit(0);
}

console.log(`\n=== REAL renderer leg (glb over ${CLIENT_URL}) ===`);
const engine = new NullEngine();
const scene = new Scene(engine);
const assets = new AssetManager(scene, `${CLIENT_URL}/content/`);

/** Pick a few models that exercise every branch: unclamped, too short, too long. */
const picks = (() => {
  const byLen = [...usable].sort((a, b) => a.durSec - b.durSec);
  const startup = 0.6;
  const wanted = new Map<string, Row>();
  const mid = usable.find((r) => alignPulseClip(r.durSec, startup, 0.6).clamped === "none");
  if (mid) wanted.set(mid.id, mid);
  const sela = usable.find((r) => r.id === "champ.sela");
  if (sela) wanted.set(sela.id, sela);
  const tooShort = byLen.find((r) => alignPulseClip(r.durSec, startup, 0.6).clamped === "slow");
  if (tooShort) wanted.set(tooShort.id, tooShort);
  const tooLong = [...byLen]
    .reverse()
    .find((r) => alignPulseClip(r.durSec, startup, 0.6).clamped === "fast");
  if (tooLong) wanted.set(tooLong.id, tooLong);
  return [...wanted.values()];
})();

const STARTUP_MS = 600;
let agree = 0;
for (const row of picks) {
  const doc = docs.find((d) => d.id === row.id)!;
  const registry = new EntityViewRegistry(scene, assets, { modelDocFor: () => doc });
  const e = {
    id: 1,
    kind: 0,
    seatId: 0,
    key: doc.id,
    teamId: 1,
    x: 0,
    z: 0,
    fx: 1,
    fz: 0,
    alive: true,
  };
  const poseFor = (x: typeof e): { x: number; z: number; fx: number; fz: number } => ({
    x: x.x,
    z: x.z,
    fx: x.fx,
    fz: x.fz,
  });
  try {
    let view = registry.getChampionView(1);
    for (let i = 0; i < 400; i++) {
      registry.sync({ entities: [e], poseFor, nowMs: i * 16, dtMs: 16, loadModels: true });
      view = registry.getChampionView(1);
      if (view?.hasGlb) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    if (!view?.hasGlb) {
      console.log(`  ${row.id.padEnd(24)} glb did not load — SKIPPED`);
      continue;
    }
    // exactly the payload abilitySystem emits
    const ticks = Math.max(1, Math.round(STARTUP_MS / TICK_MS));
    registry.handleEvent(
      { type: "castBegin", data: { caster: 1, ticks, castTimeSec: STARTUP_MS / 1000 } } as never,
      10_000,
    );
    registry.sync({ entities: [e], poseFor, nowMs: 10_016, dtMs: 16, loadModels: true });
    const anim = view.animator;
    const plan = anim?.lastPlan ?? null;
    const babylonDur = anim?.clipDurationSec("cast") ?? 0;
    const f = view.castStrikeFraction;
    const expect = alignPulseClip(row.durSec, STARTUP_MS / 1000, f);
    const strikeMs = plan
      ? (plan.delaySec + (f * babylonDur - plan.skipSec) / plan.rate) * 1000
      : NaN;
    const same =
      !!plan &&
      Math.abs(plan.rate - expect.rate) < 1e-6 &&
      Math.abs(plan.delaySec - expect.delaySec) < 1e-6 &&
      Math.abs(plan.skipSec - expect.skipSec) < 1e-6;
    if (same) agree++;
    console.log(
      `  ${row.id.padEnd(24)} state=${view.anim.state.padEnd(5)} clip(disk)=${row.durSec.toFixed(3)}s ` +
        `clip(babylon)=${babylonDur.toFixed(3)}s f=${f} ` +
        `rate=${plan?.rate.toFixed(3)} hold=${((plan?.delaySec ?? 0) * 1000).toFixed(0)}ms ` +
        `skip=${((plan?.skipSec ?? 0) * 1000).toFixed(0)}ms clamped=${plan?.clamped} ` +
        `strike=${strikeMs.toFixed(1)}ms (target ${STARTUP_MS}) ${same ? "MATCHES table" : "DISAGREES"}`,
    );
    // the naive BEFORE, from the same real numbers
    console.log(
      `  ${" ".repeat(24)} BEFORE would have struck at ` +
        `${(STARTUP_MS + naiveStrikeErrorMs(babylonDur, STARTUP_MS / 1000, f)).toFixed(1)}ms ` +
        `(${naiveStrikeErrorMs(babylonDur, STARTUP_MS / 1000, f).toFixed(0)}ms off)`,
    );
  } finally {
    registry.dispose();
  }
}
console.log(`  agree with the table: ${agree}/${picks.length}`);

// a direct ClipAnimator read on a real container, independent of the registry
{
  const doc = docs.find((d) => d.id === "champ.sela");
  if (doc) {
    const c = await assets.load(doc.glbPath);
    if (c) {
      const inst = c.instantiateModelsToScene((n) => `probe-${n}`, false, {
        doNotInstantiate: true,
      });
      const animator = new ClipAnimator(inst.animationGroups, doc.clipMap);
      const dur = animator.clipDurationSec("cast");
      console.log(
        `  direct ClipAnimator: champ.sela cast clip ${dur.toFixed(4)}s ` +
          `(= ${(dur * GLTF_FPS).toFixed(0)} frames @${GLTF_FPS}fps)`,
      );
      animator.dispose();
      for (const n of inst.rootNodes) n.dispose(false, false);
    }
  }
}

/* --------------------------- leg 3: the AUDITION PAGE's own data layer ------ */

/**
 * `public/frame-data.html` imports `src/render/frameDataAudition.ts` directly.
 * Nothing else does — so without this leg a broken page would ship silently and
 * the "go look at it and approve" workflow would be a dead link. Run the page's
 * REAL loader/measurer against the dev server and cross-check its answers
 * against the disk sweep above.
 */
{
  // the page fetches CONTENT-relative URLs; give the bare fetch an origin
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    realFetch(
      typeof input === "string" && input.startsWith("/") ? `${CLIENT_URL}${input}` : input,
      init,
    )) as typeof fetch;

  const page = await import("../src/render/frameDataAudition");
  const pageDocs = await page.loadModelDocs();
  const pageRows = await page.measureAll(pageDocs);
  let disagree = 0;
  for (const pr of pageRows) {
    const mine = rows.find((r) => r.id === pr.modelId);
    if (!mine) continue;
    if (Math.abs((pr.castClip?.durationSec ?? 0) - mine.durSec) > 1e-6) disagree++;
  }
  const plans = pageRows.map((r) => page.planRow(r, STARTUP_MS));
  const worstAfter = plans.reduce((m, p) => Math.max(m, Math.abs(p.alignedErrorMs)), 0);
  const earlyBefore = plans.filter((p) => p.naiveErrorMs < -1).length;
  console.log(`\n=== audition page data layer (/frame-data.html) ===`);
  console.log(
    `  page measured ${pageRows.length} models; clip lengths disagreeing with the disk sweep: ${disagree}`,
  );
  console.log(
    `  page reports: BEFORE early ${earlyBefore}, AFTER worst |error| ${worstAfter.toFixed(6)}ms, ` +
      `flagged ${plans.filter(page.isFlagged).length}`,
  );
}

scene.dispose();
engine.dispose();
process.exit(0);
