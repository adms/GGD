/**
 * VFX PRIMITIVE LIBRARY (task #123).
 *
 * A small set of REUSABLE, PARAMETERISED procedural effects — the common WC3
 * effects that hundreds of custom abilities transform-reuse (tornado /
 * shockwave / explosion / nova / beam / locust-swarm), plus the two melee
 * archetypes this roster leans on (slash / pulse). Each primitive is a PURE
 * function of its params → a `vfx@1` VfxDoc, so:
 *   · the SAME code that ships at runtime also generates the authored
 *     `content/vfx/*.json` docs (preview == ship — one source of truth), and
 *   · one primitive serves MANY abilities: an icy nova and a holy nova are the
 *     same `nova()` with different `color`/`scale`/`count` (task #50).
 *
 * NO @babylonjs import here on purpose (client-08 arch gate + so the doc
 * generator can run under tsx): a primitive returns DATA. The existing
 * `vfx/particleFactory.toParticleSystem` turns that data into a Babylon
 * ParticleSystem, exactly as it does for every hand-authored doc, and
 * `VfxSystem` front-loads + pools it. Element tinting, blend and default
 * texture come from `elements.ts`; per-invocation overrides come from
 * `artParams.ts`.
 *
 * House style (matches fx.ember-bolt-cast and the #33 impact-first retune):
 *   · every primitive is a one-shot `burst` (VfxSystem front-loads streams
 *     anyway; a burst reads as an impact, not fog);
 *   · a 4-stop colour ramp white-hot core → element tint → cooled → gone, so
 *     COLOUR IDENTITY is preserved (an ice nova flashes white then stays icy);
 *   · a 3-stop size ramp pops in large inside the first ~15% then shrinks to
 *     nothing (never the old grows-over-life mush).
 */
import type { VfxDoc, VfxBlendMode, VfxOrient } from "@ggd/shared/content";
// 純數學,沒有 @babylonjs import —— 上面那條「generator 要能在 tsx 下跑」的約束
// 仍然成立(`orient.ts` 只 import 一個型別)。
import { orientIsIdentity } from "../../vfx/orient";

export type Rgb = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

/** The primitive archetypes the roster binds against — one per readable SHAPE.
 *  nova/explosion/shockwave/tornado = point-blank AoE variants; beam = sustained
 *  line; bolt = a discrete travelling projectile; dash = a mobility afterimage
 *  streak; slash = a melee arc; pulse = a self-aura; swarm = many motes; summon
 *  = a conjure puff. bolt/dash/summon (task #123) close the two empty archetype
 *  cells — a travelling projectile and a mobility streak — that left ~113
 *  abilities unbindable, plus a real summon spawn distinct from the swarm proxy. */
export type PrimitiveKind =
  | "nova"
  | "explosion"
  | "shockwave"
  | "tornado"
  | "beam"
  | "bolt"
  | "dash"
  | "swarm"
  | "summon"
  | "slash"
  | "pulse"
  | "column"
  | "fall";

/**
 * Parameters every primitive accepts. Only `id` + `color` are required; the
 * rest default per-primitive. This is the #50 surface at authoring time — one
 * primitive, many looks — mirrored at play time by `artParams.applyArtParams`.
 */
export interface PrimitiveParams {
  /** vfx doc id — MUST equal the content filename stem (buildIndexes contract) */
  id: string;
  /** base element colour, 0..1 rgb (the ramp whitens the core / cools the tail) */
  color: Rgb;
  /** overall size + emitter-radius multiplier (default 1) */
  scale?: number;
  /** burst particle count override (default per-primitive) */
  count?: number;
  /** particle lifetime seconds (default per-primitive) */
  lifetime?: { min: number; max: number };
  /** emit power range (default per-primitive) */
  speed?: { min: number; max: number };
  /** blend mode (default additive; earth/dust pass alpha) */
  blend?: VfxBlendMode;
  /** content-relative texture path (default per-primitive) */
  texture?: string;
  /** peak alpha of the core/tint stops (default 1) */
  coreAlpha?: number;
  /** gravityY override (world-units/s²; negative = down) */
  gravityY?: number;
  /**
   * 方位/旋轉 (#366)。`{ pitchDeg: 0 }` 把任何柱狀 primitive 放倒成橫向,
   * `{ swirlDegPerSec }` 讓它繞自己的軸轉。⭐ **這一格就是「第二支只差參數」的
   * 那個參數** —— 龍捲風與橫放的柱狀砲共用同一段程式。
   */
  orient?: VfxOrient;
}

const PARTICLE_BASE = "assets/textures/particles/";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
/** Blend a colour toward white by `t` (the white-hot core stop). */
function whiten(c: Rgb, t: number): Rgb {
  return [clamp01(c[0] + (1 - c[0]) * t), clamp01(c[1] + (1 - c[1]) * t), clamp01(c[2] + (1 - c[2]) * t)];
}
/** Multiply a colour toward black by `k` (the cooled/dead tail stops). */
function dim(c: Rgb, k: number): Rgb {
  return [clamp01(c[0] * k), clamp01(c[1] * k), clamp01(c[2] * k)];
}

/**
 * The shared 4-stop colour ramp: white-hot core → element tint → cooled →
 * transparent. Preserves colour identity while giving every primitive the same
 * readable flash-then-settle shape. `alpha` is the peak (core/tint) alpha.
 */
function ramp(color: Rgb, alpha: number): [number, Rgba][] {
  const core = whiten(color, 0.82);
  const cool = dim(color, 0.5);
  const dead = dim(color, 0.18);
  return [
    [0, [core[0], core[1], core[2], alpha]],
    [0.2, [color[0], color[1], color[2], alpha]],
    [0.6, [cool[0], cool[1], cool[2], alpha * 0.42]],
    [1, [dead[0], dead[1], dead[2], 0]],
  ];
}

/**
 * The shared 3-stop size ramp: born small → pop to `peak` inside the first
 * `peakT` → shrink to nothing. `peakT` defaults to 0.14 (a sharp pop).
 */
function sizeRamp(peak: number, peakT = 0.14): [number, number][] {
  return [
    [0, peak * 0.42],
    [peakT, peak],
    [1, 0],
  ];
}

interface Shape {
  emitter: VfxDoc["emitter"];
  count: number;
  lifetime: { min: number; max: number };
  speed: { min: number; max: number };
  size: number; // peak size at scale 1
  gravityY: number;
  blend: VfxBlendMode;
  texture: string;
  stretched?: boolean;
  tailLength?: number;
  peakT?: number;
  /** 這個形狀天生的方位/旋轉 (#366)。省略 = 直立不轉 = 升級前的行為 */
  orient?: VfxOrient;
}

/** Assemble a VfxDoc from a resolved shape + the caller's params. */
function build(kind: PrimitiveKind, p: PrimitiveParams, base: Shape): VfxDoc {
  const scale = p.scale ?? 1;
  const alpha = p.coreAlpha ?? 1;
  const peak = base.size * scale;
  const emitter =
    base.emitter.shape === "sphere"
      ? { shape: "sphere" as const, radius: round(base.emitter.radius * scale) }
      : base.emitter.shape === "cone"
        ? { shape: "cone" as const, radius: round(base.emitter.radius * scale), angleDeg: base.emitter.angleDeg }
        : { shape: "point" as const };
  const lifetime = p.lifetime ?? base.lifetime;
  const speed = p.speed ?? base.speed;
  const colorStops: [number, [number, number, number, number]][] = ramp(p.color, alpha).map(([t, c]) => [
    t,
    [round4(c[0]), round4(c[1]), round4(c[2]), round4(c[3])],
  ]);
  const sizeStops: [number, number][] = sizeRamp(peak, base.peakT).map(([t, s]) => [t, round(s)]);
  const doc: VfxDoc = {
    id: p.id,
    schema: "vfx@1",
    emitter,
    mode: "burst",
    burstCount: Math.max(1, Math.round(p.count ?? base.count)),
    lifetimeSec: { min: round(lifetime.min), max: round(lifetime.max) },
    // legacy 2-stop fields mirror the multi-stop ramp (2-stop consumers still read)
    size: { start: round(peak * 0.42), end: 0 },
    color: { start: colorStops[0]![1], end: colorStops[colorStops.length - 1]![1] },
    sizeStops,
    colorStops,
    blendMode: p.blend ?? base.blend,
    gravityY: p.gravityY ?? base.gravityY,
    speed: { min: round(speed.min), max: round(speed.max) },
    texture: p.texture ?? PARTICLE_BASE + base.texture,
  };
  if (base.stretched) {
    doc.stretched = true;
    if (base.tailLength !== undefined) doc.tailLength = base.tailLength;
  }
  // #366 —— 呼叫端的 `orient` 蓋過形狀自己的。⚠️ 恆等時**不寫這個 key**,否則
  // 633 份沒有方位的出貨文件會全部多出一個 `orient: {}`,而 `fx.fam.*` 那 78 份
  // 是被逐位元組釘住的(`familyArtCoverage.test.ts`)。
  const orient = p.orient ?? base.orient;
  if (orient && !orientIsIdentity(orient)) doc.orient = { ...orient };
  // `kind` kept for callers/tests that want to assert which primitive built a doc
  void kind;
  return doc;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// The primitives. Each is a thin parameterisation of `build`.
// ---------------------------------------------------------------------------

/** NOVA — a radial ring/dome of particles blooming outward from a point.
 *  Ice frost-nova, holy nova, storm nova, void nova: all the same shape. */
export function nova(p: PrimitiveParams): VfxDoc {
  return build("nova", p, {
    emitter: { shape: "sphere", radius: 0.55 },
    count: 40,
    lifetime: { min: 0.18, max: 0.5 },
    speed: { min: 4, max: 9 },
    size: 0.7,
    gravityY: 0,
    blend: "additive",
    texture: "light_01.png",
  });
}

/** EXPLOSION — an omnidirectional blast + rising embers. Fireball, boom, EX. */
export function explosion(p: PrimitiveParams): VfxDoc {
  return build("explosion", p, {
    emitter: { shape: "sphere", radius: 0.35 },
    count: 48,
    lifetime: { min: 0.16, max: 0.46 },
    speed: { min: 5, max: 11 },
    size: 0.85,
    gravityY: 1.6, // embers lift as the blast dissipates
    blend: "additive",
    texture: "flame_04.png",
  });
}

/** SHOCKWAVE — a ground-hugging outward kick that settles to the floor.
 *  Earth slams, impact rings, heavy landings. */
export function shockwave(p: PrimitiveParams): VfxDoc {
  return build("shockwave", p, {
    emitter: { shape: "sphere", radius: 0.3 },
    count: 36,
    lifetime: { min: 0.2, max: 0.52 },
    speed: { min: 6, max: 12 }, // fast + mostly horizontal
    size: 0.62,
    gravityY: -3, // debris falls back to the ground
    blend: "additive",
    texture: "dirt_02.png",
  });
}

/**
 * TORNADO — a rising SWIRLING column. Wind gusts, gales, whirlwinds.
 *
 * ⚠️ 「swirling」這個字在 2026-08-18 之前是**謊話**(第一·五守則的形狀:卡片上
 * 說了但不會發生)。這支 primitive 只是一個往上噴的錐 —— `w3xArtFamilies.tornado`
 * 的 note 寫著「**旋轉**上升的柱狀氣流」,而整條管線裡**沒有任何東西會轉**:
 * `vfx@1` 沒有方位欄位、`particleFactory` 零個 rotation 呼叫、`facingDeg` 是死的。
 *
 * 現在旋轉是 `orient.swirlDegPerSec`,而它是**引擎機制**不是這支技能的特例:
 * 同一個欄位讓 `column` 加一格 `pitchDeg: 0` 就變成 owner 點名的「橫放的柱狀砲」。
 * 540°/s = 每秒一圈半,在 0.3–0.72 秒的粒子壽命裡剛好轉到看得出是螺旋、又不會
 * 快到變成一圈糊掉的環。⭐ 它是**出貨預設**,不是硬編碼:後台
 * `config.vfx-families@1` 與每一層 `vfxLayers` 都蓋得掉。
 */
export function tornado(p: PrimitiveParams): VfxDoc {
  return build("tornado", p, {
    emitter: { shape: "cone", radius: 0.28, angleDeg: 34 },
    count: 44,
    lifetime: { min: 0.3, max: 0.72 },
    speed: { min: 3, max: 7 },
    size: 0.55,
    gravityY: 4.2, // the column climbs
    blend: "additive",
    texture: "smoke_03.png",
    stretched: true,
    tailLength: 2,
    peakT: 0.1,
    orient: { swirlDegPerSec: 540 },
  });
}

/** BEAM — a fast directed lance of stretched billboards. Lasers, bolts,
 *  breath streams, thrust attacks, kamehameha. */
export function beam(p: PrimitiveParams): VfxDoc {
  return build("beam", p, {
    emitter: { shape: "cone", radius: 0.12, angleDeg: 9 },
    count: 32,
    lifetime: { min: 0.14, max: 0.4 },
    speed: { min: 12, max: 20 },
    size: 0.5,
    gravityY: 0,
    blend: "additive",
    texture: "trace_03.png",
    stretched: true,
    tailLength: 3.5,
    peakT: 0.1,
  });
}

/** BOLT — a single travelling projectile: a bright stretched head with a short
 *  trail, launched forward from the caster. Magic missiles, energy bullets,
 *  loosed arrows, thrown 彈/砲. Distinct from BEAM (a sustained lance): a bolt
 *  is a fatter, discrete round-headed shot with a shorter tail. Fills the
 *  travelling-projectile archetype cell (task #123). */
export function bolt(p: PrimitiveParams): VfxDoc {
  return build("bolt", p, {
    emitter: { shape: "cone", radius: 0.14, angleDeg: 6 },
    count: 18,
    lifetime: { min: 0.18, max: 0.46 },
    speed: { min: 9, max: 15 },
    size: 0.62,
    gravityY: 0,
    blend: "additive",
    texture: "spark_04.png",
    stretched: true,
    tailLength: 2,
    peakT: 0.12,
  });
}

/** DASH — a mobility afterimage streak: a fast, low fan of stretched billboards
 *  smearing behind the caster along the movement line, gone in a blink. Blinks,
 *  charges, 突進/瞬移/飛踢, gear-second lunges. Fills the dash/mobility archetype
 *  cell (task #123); distinct from BEAM by being wider, lower, and fading fast. */
export function dash(p: PrimitiveParams): VfxDoc {
  return build("dash", p, {
    emitter: { shape: "cone", radius: 0.22, angleDeg: 22 },
    count: 22,
    lifetime: { min: 0.1, max: 0.28 },
    speed: { min: 6, max: 12 },
    size: 0.5,
    gravityY: 0,
    blend: "additive",
    texture: "trace_05.png",
    stretched: true,
    tailLength: 3,
    peakT: 0.08,
  });
}

/** SWARM — many small erratic motes. Locust swarms, spores, soul flurries,
 *  clones, gatling-punch flurries. */
export function locustSwarm(p: PrimitiveParams): VfxDoc {
  return build("swarm", p, {
    emitter: { shape: "sphere", radius: 0.72 },
    count: 52,
    lifetime: { min: 0.34, max: 0.82 },
    speed: { min: 2, max: 6 },
    size: 0.3,
    gravityY: 0.4,
    blend: "additive",
    texture: "star_04.png",
    peakT: 0.2,
  });
}

/** SLASH — a wide, thin crescent of stretched billboards. Sword/claw/fist
 *  melee arcs (刀光劍影), the single most common shape in this roster. */
export function slash(p: PrimitiveParams): VfxDoc {
  return build("slash", p, {
    emitter: { shape: "cone", radius: 0.5, angleDeg: 92 },
    count: 26,
    lifetime: { min: 0.12, max: 0.34 },
    speed: { min: 7, max: 13 },
    size: 0.72,
    gravityY: 0,
    blend: "additive",
    texture: "slash_01.png",
    stretched: true,
    tailLength: 2.6,
    peakT: 0.1,
  });
}

/** SUMMON — a conjure puff: an upward bloom of motes + smoke as something is
 *  spawned onto the field. Beast/clone/spirit summons, 召喚/招喚. A real spawn
 *  burst distinct from the SWARM proxy (many drifting motes) and PULSE (a calm
 *  self-aura): summon rises fast off the ground and settles. */
export function summon(p: PrimitiveParams): VfxDoc {
  return build("summon", p, {
    emitter: { shape: "sphere", radius: 0.45 },
    count: 42,
    lifetime: { min: 0.28, max: 0.66 },
    speed: { min: 3, max: 7 },
    size: 0.6,
    gravityY: 5, // the conjured form rises off the ground
    blend: "additive",
    texture: "magic_05.png",
    peakT: 0.16,
  });
}

/** PULSE — a gentle rising self-aura. Buffs, transformations, passive "on"
 *  states (passive == self-buff, per the content convention). */
export function pulse(p: PrimitiveParams): VfxDoc {
  return build("pulse", p, {
    emitter: { shape: "sphere", radius: 0.6 },
    count: 32,
    lifetime: { min: 0.3, max: 0.7 },
    speed: { min: 1.5, max: 4 },
    size: 0.5,
    gravityY: 1, // the aura drifts up off the body
    blend: "additive",
    texture: "magic_02.png",
    peakT: 0.2,
  });
}

/**
 * COLUMN — a VERTICAL pillar standing on the ground and climbing. The two
 * empty silhouette cells the w3x census (L1) exposed, filled once each:
 * `FlameStrikeTarget` (火柱), `TomeOfRetrainingCaster` (光柱),
 * `ResurrectTarget`/`ResurrectCaster` (復活光), `LevelupCaster` (升級光) and
 * `DarkPortalTarget` (傳送門) are all the SAME shape — a tight column of
 * particles rising off the floor — and none of the 11 existing primitives is
 * one. BEAM is a horizontal directed lance; TORNADO is a wide swirling cone
 * that reads as wind, not as a shaft of light. 97 census reference points sit
 * on this shape, which is why it is new rather than a re-parameterised BEAM.
 */
export function column(p: PrimitiveParams): VfxDoc {
  return build("column", p, {
    // narrow footprint on the floor; the RISE is what reads, not the spread
    emitter: { shape: "cone", radius: 0.22, angleDeg: 8 },
    count: 38,
    lifetime: { min: 0.34, max: 0.78 },
    speed: { min: 6, max: 11 },
    size: 0.6,
    gravityY: 7.5, // straight up, hard — a shaft, not a puff
    blend: "additive",
    texture: "light_02.png",
    stretched: true,
    tailLength: 2.8,
    peakT: 0.12,
  });
}

/**
 * FALL — motes arriving from ABOVE and hitting the ground. `MonsoonBoltTarget`
 * (雷擊, 42 refs) and `StarfallTarget` (星墜, 9 refs) both play downward, and
 * every existing primitive either blooms outward from a point or climbs. The
 * downward read comes from a hard negative gravity plus a HIGH spawn: the
 * family prototype spawns this one at `heightY` ~3 (see `w3xArtFamilies`), so
 * the particles are born overhead and land.
 */
export function fall(p: PrimitiveParams): VfxDoc {
  return build("fall", p, {
    emitter: { shape: "sphere", radius: 0.34 },
    count: 30,
    lifetime: { min: 0.22, max: 0.5 },
    speed: { min: 2, max: 5 },
    size: 0.66,
    gravityY: -26, // the strike comes DOWN, and fast
    blend: "additive",
    texture: "trace_01.png",
    stretched: true,
    tailLength: 3.2,
    peakT: 0.08,
  });
}

/** Every primitive, keyed by kind — the dispatch table the binding generator
 *  and tests iterate over. */
export const PRIMITIVES: Record<PrimitiveKind, (p: PrimitiveParams) => VfxDoc> = {
  nova,
  explosion,
  shockwave,
  tornado,
  beam,
  bolt,
  dash,
  swarm: locustSwarm,
  summon,
  slash,
  pulse,
  column,
  fall,
};

export const PRIMITIVE_KINDS = Object.keys(PRIMITIVES) as PrimitiveKind[];
