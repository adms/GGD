/**
 * frameDataAudition — the data + drawing behind `public/frame-data.html`, the
 * dev-only review page for CAST FRAME DATA (same role as the task #80 ground
 * audition and the task #52 BGM audition: a place the change can actually be
 * LOOKED AT and approved, without playing a match to get there).
 *
 * WHY THIS PAGE HAS TO EXIST. The cast alignment is arithmetic a unit test can
 * check — `alignPulseClip` is pure and is tested directly. What a unit test
 * CANNOT check is whether 0.6 is the right strike fraction for a particular
 * artist's clip: that is an eyeball judgement about where the release pose sits
 * inside 2.5 s of keyframes. So the page draws each champion's real cast clip
 * against a real 30 Hz tick ruler, marks where the sim's damage tick falls, and
 * lets the fraction be scrubbed until the marker sits on the release pose. It
 * then prints the exact line to paste into anim/castStrike.ts.
 *
 * NOTHING HERE IS A MOCK-UP:
 *   - the model list is the shipped `content/models/_index.json`;
 *   - clip durations come from the shipped .glb bytes (the glTF JSON chunk's
 *     animation input accessors), and `verifyWithBabylon` re-measures a single
 *     model through the REAL AssetManager + REAL ClipAnimator so the fast path
 *     can be checked against what the game actually loads;
 *   - the plan comes from the REAL `alignPulseClip` the renderer calls;
 *   - the strike fraction comes from the REAL `castStrikeFractionFor` table;
 *   - the ruler is the REAL `TICK_MS`.
 * A prettier stand-in would be worse than useless — it could approve timing the
 * game never plays.
 *
 * Nothing in the shipped app imports this — `public/*.html` is not a build
 * entry, so it never reaches the bundle.
 */
import type { ModelDoc } from "@ggd/shared/content";
import { TICK_MS } from "@ggd/shared/constants";
// NullEngine, not Engine: this page never draws 3D, it only MEASURES clips.
// A real WebGL engine makes Babylon lazily fetch its post-process/rgbdDecode
// shader sources while decoding glb textures, and the dev server SPA-fallbacks
// those URLs to index.html — which Babylon then tries to compile as GLSL and
// floods the console with "Offending line [5] in vertex code: <!doctype html>".
// Nothing here needs a GPU, so don't ask for one.
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  alignPulseClip,
  naiveStrikeErrorMs,
  resolveClips,
  ClipAnimator,
  PULSE_RATE_MAX,
  PULSE_RATE_MIN,
  type ClipStrikePlan,
} from "./ClipAnimator";
import { castStrikeFractionFor, DEFAULT_CAST_STRIKE_FRACTION } from "./anim/castStrike";
import { AssetManager } from "./AssetManager";
import { EntityViewRegistry } from "./EntityViewRegistry";

const CONTENT = "/content/";
/** glTF clips are sampled at 60 fps by the Babylon loader (ClipAnimator). */
const GLTF_FPS = 60;

export interface ClipInfo {
  name: string;
  durationSec: number;
}

export interface FrameDataRow {
  modelId: string;
  glbPath: string;
  /** every clip in the .glb, in file order */
  clips: ClipInfo[];
  /** the clip "cast" resolves to through the doc's clipMap (ClipAnimator rules) */
  castClip: ClipInfo | null;
  /** true when no cast clip resolved and the animator would fall back to idle */
  fellBackToIdle: boolean;
  /** the clipMap entry the doc declares for cast, if any */
  mappedCastClip: string | null;
  /** load/parse failure, if any */
  error?: string;
}

export interface RowPlan {
  row: FrameDataRow;
  strikeFraction: number;
  plan: ClipStrikePlan;
  /** ms the clip's strike frame lands from the damage tick, ALIGNED (target 0) */
  alignedErrorMs: number;
  /** ms it landed from the damage tick BEFORE this lane (negative = early) */
  naiveErrorMs: number;
  /** clip time (s) at which the release frame plays */
  clipStrikeSec: number;
}

/* ------------------------------------------------------------------ glb IO */

interface GlbJson {
  animations?: { name?: string; samplers?: { input: number }[] }[];
  accessors?: { max?: number[] }[];
}

/**
 * Read the glTF JSON chunk of a .glb without downloading the whole binary.
 * Range requests keep a 117-model sweep cheap; a server that ignores Range
 * hands back the whole body, which still parses (we just slice it).
 */
async function fetchGlbJson(url: string): Promise<GlbJson> {
  const head = await fetchSlice(url, 0, 19);
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a glb");
  const chunkLen = dv.getUint32(12, true);
  const chunkType = dv.getUint32(16, true);
  if (chunkType !== 0x4e4f534a) throw new Error("first chunk is not JSON");
  const body = await fetchSlice(url, 20, 20 + chunkLen - 1);
  return JSON.parse(new TextDecoder().decode(body.subarray(0, chunkLen))) as GlbJson;
}

async function fetchSlice(url: string, from: number, to: number): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // 206 → exactly the slice. 200 → Range ignored, we got everything: slice it.
  return res.status === 206 ? buf : buf.subarray(from, to + 1);
}

/** Duration of one glTF animation = the largest time in its input accessors. */
function animDurationSec(json: GlbJson, index: number): number {
  const anim = json.animations?.[index];
  let max = 0;
  for (const s of anim?.samplers ?? []) {
    const t = json.accessors?.[s.input]?.max?.[0];
    if (typeof t === "number" && t > max) max = t;
  }
  return max;
}

/* --------------------------------------------------------------- the sweep */

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(CONTENT + path);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** Every model doc in the shipped content index that declares a .glb. */
export async function loadModelDocs(): Promise<ModelDoc[]> {
  const idx = await fetchJson<{ entries?: { id: string; path: string }[] }>("models/_index.json");
  const docs = await Promise.all(
    (idx.entries ?? []).map((e) => fetchJson<ModelDoc>(e.path).catch(() => null)),
  );
  return docs.filter((d): d is ModelDoc => !!d && !!d.glbPath);
}

/**
 * Measure one model's clips and resolve which one "cast" plays, using the SAME
 * `resolveClips` the renderer uses (clipMap exact match → fuzzy fallback).
 */
export async function measureModel(doc: ModelDoc): Promise<FrameDataRow> {
  const base: FrameDataRow = {
    modelId: doc.id,
    glbPath: doc.glbPath,
    clips: [],
    castClip: null,
    fellBackToIdle: false,
    mappedCastClip: doc.clipMap?.cast ?? null,
  };
  let json: GlbJson;
  try {
    json = await fetchGlbJson(CONTENT + doc.glbPath);
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
  const clips: ClipInfo[] = (json.animations ?? []).map((a, i) => ({
    name: a.name ?? `anim-${i}`,
    durationSec: animDurationSec(json, i),
  }));
  const resolved = resolveClips(clips, doc.clipMap);
  const castIdx = resolved.get("cast");
  const idleIdx = resolved.get("idle");
  const fellBack = castIdx === undefined;
  const useIdx = fellBack ? idleIdx : castIdx;
  return {
    ...base,
    clips,
    castClip: useIdx === undefined ? null : (clips[useIdx] ?? null),
    fellBackToIdle: fellBack,
  };
}

/** Measure every model, sequentially enough to keep the dev server happy. */
export async function measureAll(
  docs: ModelDoc[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 8,
): Promise<FrameDataRow[]> {
  const out: FrameDataRow[] = new Array(docs.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < docs.length) {
      const i = next++;
      out[i] = await measureModel(docs[i]!);
      onProgress?.(++done, docs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, docs.length) }, worker));
  return out;
}

/* ---------------------------------------------------------------- planning */

/**
 * Run the REAL renderer arithmetic for one row at a given cast startup.
 * `fractionOverride` is the page's scrub slider; omit it to use the shipped
 * per-model table.
 */
export function planRow(row: FrameDataRow, startupMs: number, fractionOverride?: number): RowPlan {
  const f =
    typeof fractionOverride === "number" && fractionOverride > 0 && fractionOverride < 1
      ? fractionOverride
      : castStrikeFractionFor(row.modelId);
  const dur = row.castClip?.durationSec ?? 0;
  const plan = alignPulseClip(dur, startupMs / 1000, f);
  // Where the release frame lands in real time, from the plan the animator uses.
  const clipStrikeSec = f * dur;
  const strikeAtMs =
    dur > 0 ? (plan.delaySec + (clipStrikeSec - plan.skipSec) / plan.rate) * 1000 : startupMs;
  return {
    row,
    strikeFraction: f,
    plan,
    alignedErrorMs: strikeAtMs - startupMs,
    naiveErrorMs: naiveStrikeErrorMs(dur, startupMs / 1000, f),
    clipStrikeSec,
  };
}

/** A row worth flagging red: the clamp bit, or there is no usable cast clip. */
export function isFlagged(p: RowPlan): boolean {
  return (
    p.plan.clamped !== "none" ||
    p.row.fellBackToIdle ||
    !!p.row.error ||
    !(p.row.castClip && p.row.castClip.durationSec > 0)
  );
}

export function flagReason(p: RowPlan): string {
  if (p.row.error) return `載入失敗 ${p.row.error}`;
  if (!p.row.castClip) return "沒有任何可用動畫";
  if (p.row.fellBackToIdle) return "沒有 cast clip — 退回 idle";
  if (p.row.castClip.durationSec <= 0) return "clip 長度 0（空動畫）";
  if (p.plan.clamped === "slow")
    return `clip 太短，播放率被 ${PULSE_RATE_MIN}x 下限夾住 → 補 ${(p.plan.delaySec * 1000).toFixed(0)}ms 起手停頓`;
  if (p.plan.clamped === "fast")
    return `clip 太長，播放率被 ${PULSE_RATE_MAX}x 上限夾住 → 跳過前 ${(p.plan.skipSec * 1000).toFixed(0)}ms clip 時間`;
  return "";
}

/** The line to paste into anim/castStrike.ts for a scrubbed fraction. */
export function overrideSnippet(modelId: string, fraction: number): string {
  return `  "${modelId}": ${fraction.toFixed(2)},`;
}

/* -------------------------------------------------- babylon cross-check */

let verifyScene: { engine: NullEngine; scene: Scene; assets: AssetManager } | null = null;

/** Lazily build the measurement scene (headless — see the NullEngine note above). */
function measureScene(): { engine: NullEngine; scene: Scene; assets: AssetManager } {
  if (!verifyScene) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    verifyScene = { engine, scene, assets: new AssetManager(scene) };
  }
  return verifyScene;
}

/**
 * Re-measure ONE model the way the game does: load the .glb through the real
 * AssetManager, instantiate it exactly as ChampionView does, build a real
 * ClipAnimator with the doc's clipMap and ask it for the cast clip length.
 * This is the honesty check on the fast header-parse path above — if the two
 * disagree, the table is lying and the page says so.
 */
export async function verifyWithBabylon(
  doc: ModelDoc,
): Promise<{ durationSec: number; hasCast: boolean } | null> {
  const { assets } = measureScene();
  const container = await assets.load(doc.glbPath);
  if (!container) return null;
  const inst = container.instantiateModelsToScene((n) => `verify-${n}`, false, {
    doNotInstantiate: true,
  });
  try {
    const animator = new ClipAnimator(inst.animationGroups, doc.clipMap);
    const durationSec = animator.clipDurationSec("cast");
    // hasClips is false only when NOTHING resolved; a cast fallback still maps.
    const hasCast = animator.hasClips && durationSec > 0;
    animator.dispose();
    return { durationSec, hasCast };
  } finally {
    // Node disposal only — the cloned AnimationGroups were already freed by
    // `animator.dispose()`, and the container's own materials/textures belong
    // to the AssetManager cache (same ownership rule as ChampionView.dispose).
    for (const n of inst.rootNodes) n.dispose(false, false);
  }
}

/**
 * THE END-TO-END PROBE — drive the real renderer, not the arithmetic.
 *
 * Builds a real `EntityViewRegistry`, lets a real `ChampionView` upgrade to the
 * model's real .glb, then feeds it the real `castBegin` event payload the sim
 * emits (`{ caster, ticks, castTimeSec }`) and reads back the plan the real
 * `ClipAnimator` started with. If this disagrees with the table, the table is
 * describing code the game does not run.
 */
export async function probeRealCast(
  doc: ModelDoc,
  startupMs: number,
): Promise<{
  animState: string;
  strikeFraction: number;
  clipDurationSec: number;
  plan: (ClipStrikePlan & { state: string }) | null;
} | null> {
  const { scene, assets } = measureScene();
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
  const poseFor = (s: typeof e): { x: number; z: number; fx: number; fz: number } => ({
    x: s.x,
    z: s.z,
    fx: s.fx,
    fz: s.fz,
  });
  try {
    let view = null;
    for (let i = 0; i < 400; i++) {
      registry.sync({ entities: [e], poseFor, nowMs: i * 16, dtMs: 16, loadModels: true });
      view = registry.getChampionView(1) ?? null;
      if (view?.hasGlb) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    if (!view?.hasGlb) return null;
    // exactly what abilitySystem emits: an integer tick count at the sim's dt
    const ticks = Math.max(1, Math.round(startupMs / TICK_MS));
    registry.handleEvent(
      {
        type: "castBegin",
        data: { caster: 1, ticks, castTimeSec: startupMs / 1000 },
      } as never,
      10_000,
    );
    registry.sync({ entities: [e], poseFor, nowMs: 10_016, dtMs: 16, loadModels: true });
    return {
      animState: view.anim.state,
      strikeFraction: view.castStrikeFraction,
      clipDurationSec: view.animator?.clipDurationSec("cast") ?? 0,
      plan: view.animator?.lastPlan ?? null,
    };
  } finally {
    registry.dispose();
  }
}

/* ------------------------------------------------------------------ drawing */

export interface TimelineTheme {
  bg: string;
  grid: string;
  tick: string;
  clip: string;
  clipDim: string;
  strike: string;
  damage: string;
  text: string;
  bad: string;
}

export const DARK_THEME: TimelineTheme = {
  bg: "#11141f",
  grid: "#232a3e",
  tick: "#3a4568",
  clip: "#4c8fd6",
  clipDim: "#2a4a6b",
  strike: "#f0c674",
  damage: "#7dd3fc",
  text: "#e8ecf6",
  bad: "#e2564a",
};

/**
 * Draw one champion's cast clip against the 30 Hz tick ruler: the BEFORE row
 * (the clip spanned across the startup — where the body threw the move early)
 * and the AFTER row (the aligned plan). The damage tick is the vertical line
 * both rows are judged against.
 */
export function drawTimeline(
  canvas: HTMLCanvasElement,
  p: RowPlan,
  startupMs: number,
  theme: TimelineTheme = DARK_THEME,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 220;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const padL = 92;
  const padR = 18;
  const w = cssW - padL - padR;
  const naiveSpanMs = naiveSpanOf(p, startupMs);
  const spanMs = Math.max(startupMs * 1.6, p.plan.spanSec * 1000, naiveSpanMs, 1);
  const x = (ms: number): number => padL + (ms / spanMs) * w;

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, cssW, cssH);

  // ---- 30 Hz tick ruler (the sim's real resolution) ----
  ctx.font = "10px ui-monospace,SFMono-Regular,Menlo,monospace";
  for (let t = 0; t * TICK_MS <= spanMs; t++) {
    const px = x(t * TICK_MS);
    const major = t % 5 === 0;
    ctx.strokeStyle = major ? theme.tick : theme.grid;
    ctx.beginPath();
    ctx.moveTo(px, 20);
    ctx.lineTo(px, cssH - 22);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = theme.text;
      ctx.globalAlpha = 0.55;
      ctx.fillText(`${t}`, px + 2, 14);
      ctx.globalAlpha = 1;
    }
  }
  ctx.fillStyle = theme.text;
  ctx.globalAlpha = 0.55;
  ctx.fillText("tick (30Hz)", 8, 14);
  ctx.globalAlpha = 1;

  const rowH = 34;
  const y0 = 34;
  const y1 = y0 + rowH + 26;

  // ---- BEFORE: clip stretched across the startup ----
  const dur = p.row.castClip?.durationSec ?? 0;
  const naiveRate = clampRate(dur > 0 && startupMs > 0 ? dur / (startupMs / 1000) : 1);
  const naivePlayedMs = naiveRate > 0 ? (dur / naiveRate) * 1000 : 0;
  bar(ctx, padL, y0, x(naivePlayedMs) - padL, rowH, theme.clipDim);
  label(ctx, theme, 8, y0 + 21, "BEFORE");
  marker(ctx, x(p.strikeFraction * naivePlayedMs), y0, rowH, theme.bad, "strike");

  // ---- AFTER: the aligned plan ----
  const delayMs = p.plan.delaySec * 1000;
  const playedMs = ((dur - p.plan.skipSec) / p.plan.rate) * 1000;
  if (delayMs > 0) {
    bar(ctx, padL, y1, x(delayMs) - padL, rowH, theme.grid);
  }
  bar(ctx, x(delayMs), y1, Math.max(1, x(delayMs + playedMs) - x(delayMs)), rowH, theme.clip);
  label(ctx, theme, 8, y1 + 21, "AFTER");
  const strikeMs = delayMs + ((p.clipStrikeSec - p.plan.skipSec) / p.plan.rate) * 1000;
  marker(ctx, x(strikeMs), y1, rowH, theme.strike, "strike");

  // ---- the damage tick both rows are judged against ----
  const dx = x(startupMs);
  ctx.strokeStyle = theme.damage;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dx, 20);
  ctx.lineTo(dx, cssH - 20);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = theme.damage;
  ctx.fillText(`damage tick ${startupMs.toFixed(0)}ms`, dx + 4, cssH - 8);
}

function naiveSpanOf(p: RowPlan, startupMs: number): number {
  const dur = p.row.castClip?.durationSec ?? 0;
  const rate = clampRate(dur > 0 && startupMs > 0 ? dur / (startupMs / 1000) : 1);
  return rate > 0 ? (dur / rate) * 1000 : 0;
}

function clampRate(r: number): number {
  return Math.min(PULSE_RATE_MAX, Math.max(PULSE_RATE_MIN, r));
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.max(1, w), h);
}

function label(
  ctx: CanvasRenderingContext2D,
  theme: TimelineTheme,
  x: number,
  y: number,
  text: string,
): void {
  ctx.fillStyle = theme.text;
  ctx.fillText(text, x, y);
}

function marker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  color: string,
  text: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x - 1, y - 6, 3, h + 12);
  ctx.fillText(text, x + 5, y - 8);
}

export { DEFAULT_CAST_STRIKE_FRACTION, TICK_MS };
