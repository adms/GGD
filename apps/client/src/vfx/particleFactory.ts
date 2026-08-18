/**
 * particleFactory — toParticleSystem(vfxDoc, scene, opts): THE data-driven
 * mapping from a content vfx@1 doc onto a Babylon ParticleSystem. This is the
 * single implementation for the whole repo: the client's VfxSystem/AmbientVfx
 * consume it directly and the editor's preview3d/particles.ts is a thin
 * adapter over it (preview == ship). One place defines how emitter shape /
 * mode / lifetime / size / color / blendMode / texture translate — plus the
 * WC3 extensions from task #30: gravityY, multi-stop color/size gradients,
 * modulate/alphaKey blends, sprite-sheet flipbooks, stretched (tail)
 * billboards and speed (emit-power) ranges. Unit-tested on NullEngine.
 */
import type { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { VfxDoc, VfxBlendMode, VfxOrient } from "@ggd/shared/content";
import { addSwirl, orientAxis, orientDirection, orientIsIdentity } from "./orient";

const CONTENT_BASE = "/content/";

/**
 * 把方位/旋轉裝到一個已經建好的 ParticleSystem 上 (#366)。
 *
 * Babylon 的 emitter type 決定每顆粒子的**初始方向**,而它永遠是繞著局部 +Y 的
 * (cone / sphere / point 都是)。所以方位不是改一個屬性,是**包住那支函式**:
 * 先讓原本的 emitter 算出它的方向(錐角的隨機散開要留著),再把結果轉進世界基底、
 * 加上切線速度。
 *
 * ⚠️ 用的是 system 層的 `ps.startDirectionFunction` —— Babylon 的
 * `thinParticleSystem` 有它就**不呼叫** emitter type 的那支(見該檔 :1178),
 * 所以我們必須自己轉呼叫一次,⛔ 不可以只加不減。
 *
 * ⚠️ 位置先於方向:同一支函式裡 `particle.position` 已經被 `startPositionFunction`
 * 填好了(thinParticleSystem.js :1170-1183),所以切線算得到半徑。順序反過來的話
 * 旋轉會靜靜地變成 0 —— 而畫面上看起來只是「這支龍捲風不太轉」。
 */
function applyOrient(ps: ParticleSystem, orient: VfxOrient): void {
  const type = ps.particleEmitterType;
  const swirl = orient.swirlDegPerSec ?? 0;
  const axis = orientAxis(orient);
  const radial = { x: 0, y: 0, z: 0 };
  const local = { x: 0, y: 0, z: 0 };
  ps.startDirectionFunction = (worldMatrix, direction, particle, isLocal): void => {
    type.startDirectionFunction(worldMatrix, direction, particle, isLocal, worldMatrix);
    local.x = direction.x;
    local.y = direction.y;
    local.z = direction.z;
    orientDirection(local, orient);
    if (swirl !== 0) {
      const e = ps.emitter as Vector3 | null;
      radial.x = particle.position.x - (e?.x ?? 0);
      radial.y = particle.position.y - (e?.y ?? 0);
      radial.z = particle.position.z - (e?.z ?? 0);
      addSwirl(local, radial, axis, swirl);
    }
    direction.set(local.x, local.y, local.z);
  };
}

/** Assumed sheet-cell pixels until the real texture size is known (async). */
const FALLBACK_CELL_PX = 64;

export interface ToParticleSystemOptions {
  /** quality-tier particle budget multiplier (RenderConfig), default 1 */
  scale?: number;
  name?: string;
  /** initial emitter position (callers reposition via `ps.emitter`) */
  position?: { x: number; y: number; z: number };
  /**
   * Content-relative texture path → URL. Client default mounts content at
   * "/content/"; the editor adapter injects its content-api mapping.
   */
  resolveTextureUrl?: (contentPath: string) => string;
  /**
   * Test seam: how to turn a resolved texture URL into a Babylon texture.
   * Defaults to `new Texture(url, scene)`; NullEngine tests inject a stub so
   * no image decode is attempted in Node.
   */
  createTexture?: (url: string, scene: Scene) => BaseTexture | null;
}

/** Scaled burst count (mobile tier halves particle budgets; min 1). */
export function scaledBurstCount(doc: VfxDoc, scale = 1): number {
  return Math.max(1, Math.ceil((doc.burstCount ?? 24) * scale));
}

// ---------------------------------------------------------------------------
// A BURST SYSTEM CANNOT RATE-EMIT (task #33; verified on NullEngine — see
// particleFactory.test.ts "burst emission contract"). Babylon LATCHES
// `manualEmitCount`: the first manual burst resets it to 0, not back to -1, and
// from then on `animate()` always takes the manual branch, so `emitRate` is
// inert for the rest of that system's life. A burst doc's `rate` is therefore
// IGNORED here — "front-loaded burst + trailing ember trickle" is not
// expressible on one ParticleSystem.
//
// `targetStopDuration` is not a workaround either: it auto-stops the system
// mid-flight and, because `animate()` zeroes `newParticles` while `_stopped`,
// it then silently SWALLOWS the next burst fired on that pooled instance.
//
// The ember tail is a wide `lifetimeSec` spread on the ONE burst instead: every
// particle is born on the impact frame, the short-lived majority carries the
// hit and the long-lived minority reads as the tail (see fx.firestorm, and
// VfxSystem.frontLoadDoc which shapes imported stream docs the same way).
// ---------------------------------------------------------------------------

/** Capacity that comfortably fits the doc's emission profile (scaled). */
export function capacityFor(doc: VfxDoc, scale = 1): number {
  // burst: room for 2 bursts in flight (a pooled instance can be re-fired
  // while the previous burst is still alive)
  if (doc.mode === "burst") return Math.max(8, scaledBurstCount(doc, scale) * 2);
  return Math.max(16, Math.ceil((doc.rate ?? 30) * scale * doc.lifetimeSec.max) + 8);
}

/**
 * WC3 filter modes → Babylon particle blend modes (task #30 contract):
 * additive → ONEONE · alpha → STANDARD · modulate → MULTIPLY ·
 * alphaKey → STANDARD (the texture carries hard 0/1 alpha).
 */
export function blendModeFor(mode: VfxBlendMode): number {
  switch (mode) {
    case "additive":
      return ParticleSystem.BLENDMODE_ONEONE;
    case "modulate":
      return ParticleSystem.BLENDMODE_MULTIPLY;
    case "alpha":
    case "alphaKey":
      return ParticleSystem.BLENDMODE_STANDARD;
  }
}

export type ColorStop = readonly [number, readonly [number, number, number, number]];
export type SizeStop = readonly [number, number];

/** Effective color gradient: multi-stop when authored, legacy 2-stop else. */
export function colorStopsFor(doc: VfxDoc): readonly ColorStop[] {
  if (doc.colorStops && doc.colorStops.length > 0) return doc.colorStops;
  return [
    [0, doc.color.start],
    [1, doc.color.end],
  ];
}

/** Effective size gradient: multi-stop when authored, legacy 2-stop else. */
export function sizeStopsFor(doc: VfxDoc): readonly SizeStop[] {
  if (doc.sizeStops && doc.sizeStops.length > 0) return doc.sizeStops;
  return [
    [0, doc.size.start],
    [1, doc.size.end],
  ];
}

export interface SpriteCellMapping {
  startCell: number;
  endCell: number;
  cellWidth: number;
  cellHeight: number;
  /** Babylon spriteCellChangeSpeed: 1 = one cycle per particle lifetime */
  changeSpeed: number;
}

/**
 * Pure sprite-sheet math (exported for tests): rows×cols over the texture
 * pixel size → Babylon cell ids/sizes; `cycleSec` → cell change speed
 * relative to the doc's average particle lifetime.
 */
export function spriteCellMapping(
  sheet: NonNullable<VfxDoc["spriteSheet"]>,
  avgLifeSec: number,
  texWidth: number,
  texHeight: number,
): SpriteCellMapping {
  return {
    startCell: 0,
    endCell: sheet.rows * sheet.cols - 1,
    cellWidth: Math.max(1, Math.round(texWidth / sheet.cols)),
    cellHeight: Math.max(1, Math.round(texHeight / sheet.rows)),
    changeSpeed: sheet.cycleSec !== undefined ? avgLifeSec / sheet.cycleSec : 1,
  };
}

function applySpriteSheet(ps: ParticleSystem, doc: VfxDoc): void {
  const sheet = doc.spriteSheet!;
  const avgLife = (doc.lifetimeSec.min + doc.lifetimeSec.max) / 2;
  ps.isAnimationSheetEnabled = true;
  ps.spriteCellLoop = true;
  ps.spriteRandomStartCell = sheet.randomStartCell ?? false;

  const apply = (w: number, h: number): void => {
    const m = spriteCellMapping(sheet, avgLife, w, h);
    ps.startSpriteCellID = m.startCell;
    ps.endSpriteCellID = m.endCell;
    ps.spriteCellWidth = m.cellWidth;
    ps.spriteCellHeight = m.cellHeight;
    ps.spriteCellChangeSpeed = m.changeSpeed;
  };
  // apply immediately with an assumed cell size; refine once the texture
  // reports its real pixel dimensions (textures load async in the browser)
  apply(FALLBACK_CELL_PX * sheet.cols, FALLBACK_CELL_PX * sheet.rows);
  const tex = ps.particleTexture;
  if (!tex) return;
  const refine = (): void => {
    const s = tex.getSize();
    if (s.width > 0 && s.height > 0) apply(s.width, s.height);
  };
  if (tex.isReady()) refine();
  // onLoadObservable lives on Texture (not BaseTexture) — injected test
  // textures may not carry it, hence the optional structural access
  else (tex as { onLoadObservable?: { addOnce(cb: () => void): unknown } }).onLoadObservable?.addOnce(refine);
}

/**
 * Build a (stopped) ParticleSystem from a vfx doc. Caller owns lifecycle.
 * `opts` may be the legacy bare quality-tier scale number.
 */
export function toParticleSystem(
  doc: VfxDoc,
  scene: Scene,
  opts: ToParticleSystemOptions | number = {},
): ParticleSystem {
  const o: ToParticleSystemOptions = typeof opts === "number" ? { scale: opts } : opts;
  const scale = o.scale ?? 1;
  const ps = new ParticleSystem(o.name ?? `vfx-${doc.id}`, capacityFor(doc, scale), scene);

  if (doc.texture) {
    const url = (o.resolveTextureUrl ?? ((p: string): string => CONTENT_BASE + p))(doc.texture);
    const make =
      o.createTexture ?? ((u: string, s: Scene): BaseTexture => new Texture(u, s, false, false));
    ps.particleTexture = make(url, scene) as Texture | null;
  }

  // emitter shape (position is set by the caller via ps.emitter)
  const p = o.position ?? { x: 0, y: 1, z: 0 };
  ps.emitter = new Vector3(p.x, p.y, p.z);
  switch (doc.emitter.shape) {
    case "point":
      ps.createPointEmitter(new Vector3(-1, 0.4, -1), new Vector3(1, 1.4, 1));
      break;
    case "sphere":
      ps.createSphereEmitter(doc.emitter.radius, 0.4);
      break;
    case "cone":
      ps.createConeEmitter(doc.emitter.radius, (doc.emitter.angleDeg * Math.PI) / 180);
      break;
  }

  ps.minLifeTime = doc.lifetimeSec.min;
  ps.maxLifeTime = doc.lifetimeSec.max;

  for (const [t, s] of sizeStopsFor(doc)) ps.addSizeGradient(t, s);
  for (const [t, c] of colorStopsFor(doc)) ps.addColorGradient(t, new Color4(c[0], c[1], c[2], c[3]));

  ps.blendMode = blendModeFor(doc.blendMode);

  if (doc.mode === "continuous") {
    ps.emitRate = Math.max(1, Math.ceil((doc.rate ?? 30) * scale));
  } else {
    // bursts fire via burstNow() / ps.manualEmitCount (see VfxSystem). No
    // emitRate, no targetStopDuration — see the burst-emission note above:
    // a rate would be inert, an auto-stop would eat later bursts on this
    // pooled instance, and pooled instances must stay re-fireable forever.
    ps.emitRate = 0;
    ps.manualEmitCount = 0;
  }

  // WC3 speed ± variation → emit power range
  ps.minEmitPower = doc.speed?.min ?? 1.2;
  ps.maxEmitPower = doc.speed?.max ?? 3.2;
  ps.updateSpeed = 0.016;

  // WC3 gravity (negative = downward) — 方位 (#366) 也轉這一條:一支柱狀特效
  // 「往哪邊長」靠的就是重力,所以 `pitchDeg: 0` 一格就把直立的光柱放倒成橫向的
  // 柱狀砲,⛔ 不需要第二支 primitive。
  const g = doc.gravityY !== undefined ? { x: 0, y: doc.gravityY, z: 0 } : { x: 0, y: 0, z: 0 };
  if (!orientIsIdentity(doc.orient)) orientDirection(g, doc.orient);
  ps.gravity = new Vector3(g.x, g.y, g.z);

  // 方位/旋轉 (#366)。恆等時**完全不裝這個 hook**,所以沒有寫 `orient` 的 633
  // 份出貨文件走的是升級前一模一樣的那條路(連一次多餘的函式呼叫都沒有)。
  if (!orientIsIdentity(doc.orient)) applyOrient(ps, doc.orient!);

  // WC3 tail particles: stretch along the velocity vector
  if (doc.stretched) {
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    if (doc.tailLength !== undefined) {
      ps.minScaleY = doc.tailLength;
      ps.maxScaleY = doc.tailLength;
    }
  }

  if (doc.spriteSheet) applySpriteSheet(ps, doc);

  return ps;
}

/**
 * Fire one burst (burst-mode docs only). Returns the particle count queued so
 * callers/tests can assert it. No-op (0) for continuous docs.
 */
export function burstNow(ps: ParticleSystem, doc: VfxDoc, scale = 1): number {
  if (doc.mode !== "burst") return 0;
  const n = scaledBurstCount(doc, scale);
  ps.manualEmitCount = n;
  return n;
}
