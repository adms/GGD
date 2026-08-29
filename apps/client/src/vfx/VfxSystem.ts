/**
 * VfxSystem — consumes the MSG.EVENT fanout (abilityCast / projectileHit /
 * damage / death) drained once per frame by the GameApp:
 *   ability casts       → Telegraph ring (ground reads stay king) + the
 *                         ability's vfx doc played at the caster (EX casts
 *                         scale the burst up and add a layered shockwave pop).
 *                         The 30 abilities promoted to the map's OWN art
 *                         (render/vfx/w3xAbilityArt) instead play their whole
 *                         emitter SET through `W3xEmitterRig` — see
 *                         `playCastVfx`, whose fallback ladder guarantees a
 *                         promoted cast can never draw nothing.
 *   projectile hits     → the projectile's vfx doc burst at the target
 *                         (layered HitSpark impact as the doc-less fallback;
 *                         every landed hit also layers via `hitImpact`)
 *   damage              → damage number into the frameBus (world-anchored DOM)
 *   death               → layered kill pop: EX-grade impact + ash plume
 *   flowerSpawn/Burst   → dirt-kick sprout puff / layered heal pop (#34)
 *
 * IMPACT-FIRST PLAYBACK (task #33). Every doc played here is a ONE-SHOT, so
 * playback is retuned at THIS layer instead of hand-editing 228 imported
 * WC3 docs:
 *   · continuous → burst + tail: a stream doc's authored density
 *     (rate × avg life) is fired as ONE front-loaded burst on the impact frame
 *     (capped at MAX_FRONT_LOAD_BURST) instead of the old flat 650ms trickle.
 *     The ember tail is the burst's own WIDE lifetime spread — a burst system
 *     can never rate-emit afterwards (Babylon latches manualEmitCount; see
 *     particleFactory), so the short-lived majority carries the hit and the
 *     long-lived minority reads as the tail.
 *   · lifetime clamp: no one-shot particle outlives `oneShotMaxLifeSec()`, so
 *     imported 1–6s lifetimes stop hanging around as fog. That ceiling is a
 *     BACKSTAGE FIELD (`config.vfx-families@1.oneShotMaxLifeSec`, shipped 0.6) —
 *     owner's 「先蓄力光柱 → 再爆炸 → 再留一圈餘燼」 needs the ember layer to
 *     outlive the pop, and before it was a field nothing on the console could
 *     reach it (a layer's `timeScale: 4` saturated at 0.6 s).
 *   · layering hooks: deaths, heal pickups and EX casts fire the pooled
 *     ImpactComposer (white-hot core flash + gravity/drag spark streaks +
 *     low-alpha smoke body + expanding ground shockwave) through HitSpark on
 *     the SAME frame as the doc, so hitstop/shake/flash/sound/particles land
 *     together. Tints are per-event constants (or quantized from the doc's own
 *     first color key) so the composer's pooled keys stay bounded.
 *
 * Particle systems are pooled per vfx doc id as a small FREE-LIST (cap 4
 * instances/doc): same-frame replays each get their own system, and when the
 * cap is hit the least-recently-used instance is stolen (its particles are
 * the oldest on screen).
 */
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities, Projectiles } from "@ggd/shared/sim/content/registry";
import type { AbilityId, ProjectileId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
// ⭐ GH#649/#565 —— vfxSpawn 的酬載型別住在 sim 的 emit 站旁邊（GH#608 的規矩）
import type { VfxSpawnEvent } from "@ggd/shared/sim/effects/spawnVfx";
import { Configs as ContentConfigs, VfxScripts } from "@ggd/shared/content/registries";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { DEFAULT_VFX_SCRIPTS } from "@ggd/shared/content/schema/config/vfxScripts";
import { VfxScriptPlayer } from "./VfxScriptPlayer";
import { TICK_MS } from "@ggd/shared/constants";
// GH#649/#565 —— WC3 掛點字串 → glb 骨頭節點（正規化＋fallback 鏈，#98 的那一半）
import { resolveAttachment } from "../render/vfx/attachment";
import { frameBus, pushCombatText } from "../frameBus";
import type { CombatTextRelation } from "../ui/combatText";
import { envFactor } from "../ui/displayFinal";
import { particleBudgetScale } from "../render/RenderConfig";
import { KIND_FLOWER, KIND_GUARDIAN } from "../render/overheadAnchors";
import { qualityController } from "../render/QualityController";
import { poseLookingAt, verticalHeadroom } from "../render/effectFraming";
import {
  ShadowLayer,
  SHADOW_CHAMPION_RADIUS,
  SHADOW_FLOWER_RADIUS,
  type ShadowInput,
} from "../render/shadows";
import {
  Telegraph,
  telegraphPaletteFor,
  trimTelegraphPools,
  disposeTelegraphShared,
} from "./Telegraph";
import {
  vfxCleanupPolicy,
  ringCapForRoundBoundary,
  oneShotEmitterCap,
  emitterSweepMs,
  purgeImpactPoolOnRoundEnd,
  vfxHardMaxLifeSec,
} from "./vfxCleanupPolicy";
import { resetVfxHardCapClocks, sweepVfxHardCap, noteVfxRefired} from "./vfxHardCap";
import { TelegraphLayer } from "./TelegraphLayer";
import { resolveTelegraphShape, type TelegraphAbilityLike } from "./telegraphShape";
import type { TelegraphRelation } from "./telegraphChannel";
import { HitSpark, impactComposerFor } from "./HitSpark";
import { scaledBurstCount, toParticleSystem } from "./particleFactory";
// ⭐ GH#567 —— 守衛塔的來源指引：伸縮動作（bus → GuardianView）＋ 投射物。
import { GuardianVolleyFx } from "./GuardianVolleyFx";
import { clearGuardianRecoils, pulseGuardian } from "./guardianRecoilBus";
import { volleyTiming, WAKE_MS } from "./guardianVolley";
import { frontLoadCounts, IMPACT_TINTS, type ImpactIntensity, type Rgb } from "./vfxPresets";
import { asImpactProfile, type SparkKind } from "../render/combatFeedback";
import {
  abilityOrientOverrideFor,
  extraVfxDocIds,
  primitiveFallbackFor,
  w3xArtFor,
} from "../render/vfx/w3xAbilityArt";
import { familyCastHeightY } from "../render/vfx/familyCastHeight";
import {
  applyLayerOverrides,
  applyVfxOverrides,
  abilityVfxSourceFor,
  castLayersFor,
  layerHeightY,
  layerPosition,
  maxAbilityVfxLayers,
  type ResolvedVfxLayer,
} from "../render/vfx/abilityLayers";
import { applyAimYaw } from "../render/vfx/artParams";
import { applyFamilyOrient } from "../render/vfx/familyOrient";
import { yawDegToward } from "./orient";
import { isLegacySingleVfx, type AbilityVfxSource } from "@ggd/shared/content/schema/abilityVfx";
import { W3xCastFx } from "./W3xCastFx";
import { BloodFx } from "./BloodFx";
import { CombatFeedbackFx } from "./CombatFeedbackFx";
import { GroundDecalPool } from "./GroundDecalPool";
import { castScorchSpec } from "./feedbackPresets";
import { StatusAuraFx } from "./StatusAuraFx";
import { CastPillarFx } from "./CastPillarFx";
import { ArcBoltFx } from "./ArcBoltFx";
import { GoldPickupFx } from "./GoldPickupFx";
import { arcBoltSpec, arcCastPlan, ARC_TINTS, type ArcBoltOptions } from "./arcBolt";
import { reflectArcBurstPlan } from "./reflectArcBurst";
import { pillarPalette, pillarTintFromRamp, type PillarPalette } from "./castPillar";
import { severityForHit, sprayDirection, damageScale, type Vec2 } from "./bloodPresets";
import { goreConfig, resolveGore } from "./goreConfig";
import { clampOneShotLife, DEFAULT_ONE_SHOT_MAX_LIFE_SEC, oneShotMaxLifeSec } from "./oneShotLife";
/**
 * ⭐ 2026-08-23 稽核 —— **世界演出**的兩個模板 + 一張表（`worldCues.ts`）。
 * ⛔ 六則同型的事件**不是**六個 `case`（第零守則⑨）。
 */
import { worldCueLine, worldCuePoint, worldCues, type ConfigWorldCuesDoc } from "./worldCues";
// ⭐ GH#551/#543/#549 —— 三個「演出」層。⛔ 在 2026-08-22 之前它們的唯一 import 端
//    是自己的測試（失敗形態③：整組刪掉只有測試會紅，而畫面上本來就什麼都沒有）。
import { ModelFxRig } from "../render/modelFxRig";
import type { ModelFxSpawnEvent } from "../render/modelFxPath";
/**
 * 浮動文字掛在錨點上方多高。⛔ 舊碼是 `ev.data.y ?? 2` 而 **sim 從來沒送過 `y`**
 * ⇒ 它恆為 2。這裡把那個 2 具名，⛔ 不是新增一個可調參數（第二守則:一個
 * 沒有人會改的數字不需要三個住處）。
 */
const FLOATING_TEXT_ANCHOR_Y = 2;
import type {
  FloatingTextEvent,
  ScreenCueRecipients,
  ScreenFlashEvent,
  ScreenShakeEvent,
} from "@ggd/shared/sim/effects/clientCues";
import { ScreenFxLayer } from "./ScreenFxLayer";
import { FloatingTextFx } from "./FloatingTextFx";
import { MoveTrailFx } from "./MoveTrailFx";
import {
  screenCueIsForViewer,
  screenCuePolicyFromContent,
  screenFlashSpecFromEvent,
  screenShakeSpecFromEvent,
} from "../render/screenFx";

/** Reusable scratch for the #233 headroom probe — no per-frame allocation. */
const HEADROOM_F = new Vector3();

export interface VfxContext {
  /** rendered position of an entity (view space), or null if unknown */
  entityPos(id: number): { x: number; z: number } | null;
  /** authored vfx doc for a vfxKey, or null (docs are optional content) */
  vfxDoc?(key: string): VfxDoc | null;
  /**
   * OPTIONAL championId of an entity, used ONLY to resolve the per-champion
   * gore override (mechanical/undead champions spray sparks/ichor, never
   * blood — see goreConfig). Absent ⇒ every champion uses the global style.
   */
  championIdOf?(id: number): string | null;
  /**
   * Local player's entity id, or null before the match seat is known.
   * Floating combat text (task #92) is keyed on the RELATIONSHIP to the local
   * player — that is RO's axis and the axis the request names (造成/受到傷害,
   * 補血, 補魔 are relationships, not damage schools). Absent ⇒ every event
   * resolves as "unknown" and only the amount is drawn.
   */
  localEntityId?(): number | null;
  /** Team of an entity; null for neutrals (flowers) and unknown ids. */
  teamOf?(id: number): number | null;
  /**
   * ⭐ GH#551/#543 —— `spawnModelFx` 要的兩個內容/資產接縫。
   *
   * ⚠️ 它們是**注入**的（⛔ VfxSystem 自己不去拿內容）：這個檔已經有 `vfxDoc?()`
   * 同一個立場 —— 特效層知道「要播什麼」，⛔ 不知道「內容從哪來」。
   * ⚠️ 兩個都缺席 ⇒ 移動模型特效整條**靜靜不生**（⛔ 不是崩潰）：
   *    測試環境與早期開機沒有 AssetManager，而一個會崩潰的特效層會弄壞一場遊戲。
   *    ⭐ 但那條路有守衛在數（`shippedModelFxAbilities.test.ts`），⛔ 不是無聲。
   */
  modelDocFor?(modelKey: string): { glbPath: string; scale?: number } | null;
  loadModelContainer?(glbPath: string): Promise<unknown | null>;
  /**
   * The CAST BAR's own 0→1 wind-up fraction for an entity (task #228), or null
   * when it is not casting. Injected — never re-derived here — so the ground
   * telegraph fills over the SAME window the bar above the caster's head does
   * and can never drift from when the damage actually lands. GameApp passes
   * `CastTracker.progressFor`; absent ⇒ telegraphs still draw their shape but
   * cannot animate a wind-up.
   */
  castProgress?(id: number, nowMs: number): number | null;
  /**
   * ⭐ GH#494 —— 播一發 SFX，走**既有**的音訊管線（總音量、SFX 開關、SfxGate 的
   * 冷卻與同時發聲數全部自動適用）。注入而不是在 vfx/** 裡 import `audioSystem`：
   * 一條繞過玩家設定的新音訊路徑就是缺陷（`audio/vfxSound.ts` 檔頭第 ③ 條）。
   *
   * 缺席 ⇒ 金幣照飛，只是**沒有聲音** —— 這是 headless 測試與舊接線的樣子，
   * ⛔ 不是「整個功能不生效」。
   */
  playSfx?(event: string, opts: { volume?: number; gateKey?: string; semitones?: number }): boolean;
  /**
   * ⭐ GH#838 M4 —— 讓某個實體播一次動畫脈衝（受害者被劈的那一下、慢動作定格）。
   * 注入而不是在 vfx/** 裡拿 `EntityViewRegistry`：特效層知道「要演什麼」，
   * ⛔ 不知道「view 從哪來」（同 `vfxDoc` / `modelDocFor` 一字不差的理由）。
   * 缺席 ⇒ 動畫段是 no-op（headless 測試與舊接線的樣子，⛔ 不是整個功能不生效）。
   */
  pulseAnim?(id: number, kind: "attack" | "cast" | "hurt", opts?: { clipWindowMs?: number }): void;
  /**
   * ⭐ GH#838 N6 —— 演出用的暫時隱形（阿邦快速劍X：人消失 1 秒，只剩劍氣）。
   * ⚠️ 這**不是**權威隱身；缺席 ⇒ 段是 no-op（headless 測試的樣子）。
   */
  hideBody?(id: number, durationMs: number): void;
}

// ---------------------------------------------------------------------------
// Impact-first one-shot playback knobs
// ---------------------------------------------------------------------------

/**
 * Lifetime ceiling for ONE-SHOT particles (seconds) — **後台可調**,
 * `config.vfx-families@1.oneShotMaxLifeSec`,出貨 0.6(見 `./oneShotLife`).
 *
 * Impact particles read best at 0.15–0.5s; imported docs run 1–6s, which is
 * what made casts hang around as fog. Everything is gone within this long of
 * the impact frame.
 *
 * ⚠️ 讀的是 `oneShotMaxLifeSec()`,**不是**一個模組常數 —— 常數版本的代價是
 * owner 想把餘燼從 0.6 拉到 2 秒就得 rebuild + 重啟容器。
 * `DEFAULT_ONE_SHOT_MAX_LIFE_SEC` 只是「沒人動過後台時的值」,不要拿它當
 * 生效值來用。
 */
export { DEFAULT_ONE_SHOT_MAX_LIFE_SEC, oneShotMaxLifeSec };

/** Ceiling on a front-loaded burst (AAA impact band is ~24–80 particles). */
export const MAX_FRONT_LOAD_BURST = 80;

/**
 * Ember-tail spread for a converted stream doc: the burst's shortest life as a
 * fraction of its longest. Every particle is born on the impact frame; this
 * spread is what makes the majority die fast (the hit) while a minority lives
 * on (the tail) — the only tail a manually-burst system can have.
 */
export const TAIL_SPREAD = 0.3;

/** EX casts fire a bigger burst of their own doc (the fight-defining moment). */
export const EX_BURST_BOOST = 1.6;

/** Kill-pop tint: warm ash ember over the gray plume. */
const DEATH_TINT: Rgb = [1, 0.7, 0.42];

/** Heal-pickup tint: bright leaf green (flower color identity). */
const HEAL_TINT: Rgb = [0.5, 1, 0.55];

/** EX cast tint when the ability has no vfx doc to take a color from. */
const EX_DEFAULT_TINT: Rgb = [1, 0.95, 0.75];

/** Quantization step for doc-derived tints — bounds pooled composer keys. */
const TINT_STEP = 0.25;

/**
 * Built-in death pop (not content-authored: deaths always read the same).
 * The ash PLUME layer only — the bright core flash, ember streaks and ground
 * shockwave come from the EX-grade composer fired on the same frame. Pops in
 * large and shrinks (never the old grows-over-life mush), hot ash → gray →
 * gone in ≤0.55s; the wide lifetime spread leaves a sparse ash tail after the
 * bulk of the puff has already died.
 */
const DEATH_SMOKE: VfxDoc = {
  id: "fx.builtin-death-smoke",
  schema: "vfx@1",
  emitter: { shape: "sphere", radius: 0.45 },
  mode: "burst",
  burstCount: 26,
  lifetimeSec: { min: 0.16, max: 0.55 },
  // pop in large on the kill frame, then shrink to nothing (never the old
  // grows-over-life fog); legacy 2-stop fields mirror the tint/dead keys
  size: { start: 0.5, end: 0 },
  sizeStops: [
    [0, 0.5],
    [0.12, 1.15],
    [1, 0],
  ],
  color: { start: [0.62, 0.6, 0.62, 0.6], end: [0.2, 0.2, 0.24, 0] },
  colorStops: [
    [0, [1, 0.95, 0.86, 0.9]],
    [0.16, [0.62, 0.6, 0.62, 0.6]],
    [0.55, [0.4, 0.4, 0.46, 0.34]],
    [1, [0.2, 0.2, 0.24, 0]],
  ],
  blendMode: "alpha",
  gravityY: 1.1, // ash lifts as it dissipates
  speed: { min: 1.6, max: 4.2 },
  texture: "assets/textures/particles/smoke_05.png",
};

/**
 * Healing-flower lifecycle (task #34) reuses EXISTING hand-authored green
 * docs from content/vfx — no new vfx content: barkskin's green mote burst
 * reads as the heal, root-snare's dirt kick marks the sprout.
 */
export const FLOWER_BURST_VFX = "fx.barkskin";
export const FLOWER_SPAWN_VFX = "fx.root-snare";

/**
 * Revive circles (task #84). The RING itself is a persistent world view
 * (render/views/ReviveCircleView), not a particle one-shot — these are only
 * the punctuation at each end of its life:
 *   drop     — a modest flame kick, so the ring's arrival is noticed without
 *              competing with the death VFX firing on the same corpse;
 *   complete — the loudest cue in the mechanic: an EX-grade layered pop, i.e.
 *              the same weight as a kill, because it undoes one;
 *   fizzle   — nothing loud. A ring that expires is a non-event by design and
 *              must not read like something happened.
 */
const REVIVE_TINT: Rgb = [1, 0.72, 0.28];
/** Neutral guardian (task #89) — warm stone-bronze, matching its health bar. */
const GUARDIAN_TINT: Rgb = [0.95, 0.72, 0.42];
/** 陣亡投幣 (task #191) — bright gold, matching CoinView's own palette. */
const COIN_TINT: Rgb = [1, 0.88, 0.55];
export const REVIVE_SPAWN_VFX = "fx.root-snare";
export const REVIVE_COMPLETE_VFX = "fx.barkskin";

/**
 * 鍊金術之盾 (godie-i06q) 的兩個節拍 —— 嘲弄的拉扯與煉金的付款。
 *
 * 兩個都**重用既有的 content/vfx 文件**，理由和 `FLOWER_*_VFX` 一樣：一份 vfx 文
 * 件是編輯器裡改得到的東西，而一組寫死在這裡的粒子參數不是（第一守則）。要換掉
 * 這兩個節拍長什麼樣子，改的是那份文件，不是這個檔。
 *
 *   嘲弄 —— 火色衝擊環。它畫在**嘲弄者**身上而不是被拉走的人身上，因為事件只帶
 *           得到嘲弄者（見 eventFanout.ts 的 payload 段）：`world.taunt` 是
 *           sim 側的 Map，被拉走的那幾隻的 id 從來沒有上過線。
 *   煉金 —— 金色爆發，配 `COIN_TINT` 的層疊 pop，和 `coinPickedUp` 同一套金色語
 *           言，因為玩家看到的是同一件事：錢進來了。
 */
export const TAUNT_VFX = "fx.fam.shockwave-ring.fire.s150";
export const GOLD_GRANT_VFX = "fx.fam.burst.holy.s100";
/** 嘲弄 (godie-i06q) — 挑釁的火紅，和敵方施法預告同一個「危險」色語言。 */
const TAUNT_TINT: Rgb = [1, 0.42, 0.2];

/** Max pooled ParticleSystem instances per doc id (LRU-stolen beyond). */
export const MAX_POOL_PER_DOC = 4;

/**
 * Aim memory used by the muzzle flash (task #39). `projectileSpawn` carries
 * only `{ id, owner, projectileId }` — no direction — so the last aim the
 * owner committed to (an ability's `direction`/`point`, or the position of a
 * basic attack's target) is remembered per entity and consumed on spawn.
 * Bounded by the number of live entities; cleared on death and on dispose.
 */
const AIM_FALLBACK: Vec2 = { x: 0, z: 1 };

/** Normalize an enriched dmgType (or the sim's raw `type`) to the union. */
function normalizeDmgType(v: unknown): "physical" | "magic" | "true" {
  return v === "magic" ? "magic" : v === "true" ? "true" : "physical";
}

/** Impact-particle tint by damage type: physical spark / arcane pop / white. */
function impactSparkColor(dmgType: "physical" | "magic" | "true"): [number, number, number] {
  if (dmgType === "magic") return [0.68, 0.5, 1]; // arcane
  if (dmgType === "true") return [1, 1, 1]; // white
  return [1, 0.72, 0.28]; // physical spark
}

/**
 * DEFENSIVE finite-position guard for the pooled-emitter spawn sites. NOTE: this
 * is NOT the fix for task #131 — the reproduced "persistent bright-white burst
 * stuck in a corner" was an orphaned CONTINUOUS ambient emitter left running at
 * world origin (0,0,0), a perfectly-FINITE position a check like this can never
 * catch (root cause + fix live in AmbientVfx.tick()'s orphan guard). This guard
 * stays as belt-and-braces: a NaN/Infinity emitter (a mid-despawn entity, an
 * un-interpolated pose, a corrupt event) would still get GPU-clamped to a screen
 * corner, so no spawn site here is allowed to place an emitter off the world.
 */
function isFinitePos(p: { x: number; z: number } | null): p is { x: number; z: number } {
  return p !== null && Number.isFinite(p.x) && Number.isFinite(p.z);
}

/**
 * 電弧預設的離地高度 —— 軀幹，不是腳下。#150 把每位英雄正規化到約 1.7 u 的
 * 螢幕高度，所以「胸口」在這附近；一條爬過地板的閃電讀起來是地面特效，
 * 而它明明打在人身上。呼叫端可以逐次覆寫（`strikeArc` 的 `from.y` / `to.y`）。
 */
export const ARC_BODY_Y = 0.95;

// ---------------------------------------------------------------------------
// Ground-follow layer (task #147): blob shadows + velocity-gated walking dust.
// Both are driven from a SINGLE per-frame pass over the live bodies the render
// layer already exposes (frameBus.champions → fresh pos via ctx.entityPos), so
// nothing here reads ChampionView or feeds the sim.
// ---------------------------------------------------------------------------

/**
 * A ROOTED PROP (healing flower / neutral guardian): a smaller blob shadow and
 * never any walking dust. Decided on the anchor's KIND rather than on
 * `teamId === -1`, which used to mean "flower" only because the flower was the
 * one team-less anchor — the guardian then arrived with seatId -1 and silently
 * inherited a flower-sized shadow under a 3u statue.
 */
function isRootedProp(kind: number | undefined, teamId: number): boolean {
  if (kind !== undefined) return kind === KIND_FLOWER || kind === KIND_GUARDIAN;
  return teamId < 0; // hand-built anchor (tests) — the legacy rule
}
/** Champion strides this far (world units) between walking-dust puffs. */
const WALK_STRIDE = 0.55;
/** Never more than one puff this often (ms) — caps a sprint's emit rate. */
const WALK_MIN_INTERVAL_MS = 120;
/** A jump larger than this is a teleport/respawn: re-baseline, emit nothing. */
const WALK_TELEPORT_DIST = 3.0;
/** How far BEHIND the foot the puff kicks up (world units, along −velocity). */
const WALK_PUFF_TRAIL = 0.22;
/** Ground-scorch footprint fallback when an ability declares no radius. */
const CAST_SCORCH_RADIUS = 0.9;
/** Concurrent cast-scorch decals (hard cap; LRU-stolen by the pool beyond). */
const MAX_CAST_DECALS = 12;

/** World y of a hit's contact point — torso height for a grounded fighter. */
const CONTACT_Y = 1.0;
/** How far toward the attacker to bloom the spark (body radius, world units). */
const CONTACT_OFFSET = 0.45;

/**
 * The CONTACT SURFACE for a hit: the victim's body edge FACING the attacker,
 * not its centre of mass. `dir` is the attacker→victim vector, so we step BACK
 * along it from the victim centre — the point where steel meets body (audit P1
 * 力量感). Degenerate `dir` (a self/degenerate hit) falls back to the centre.
 */
function contactPoint(pos: { x: number; z: number }, dir: Vec2): { x: number; z: number } {
  const len = Math.hypot(dir.x, dir.z);
  if (!(len > 1e-6)) return { x: pos.x, z: pos.z };
  return { x: pos.x - (dir.x / len) * CONTACT_OFFSET, z: pos.z - (dir.z / len) * CONTACT_OFFSET };
}

/**
 * Map the sim's resolved `sparkKind` to a DISTINCT spark tint + layered
 * intensity, so every situational hit reads instantly at the contact point:
 *   block   → cool-white steel (light) — a deflection, paired with a rebound fan
 *   counter → saturated RED, max layers (ex) — the punish flash
 *   magic   → arcane violet ; ice → icy cyan-white (opt-in element)
 *   heavy   → dmgType spark, heavy layers (+ ground ring)
 *   hit     → dmgType spark, light
 */
function sparkStyleFor(
  kind: SparkKind,
  dmgType: "physical" | "magic" | "true",
): { tint: Rgb; intensity: ImpactIntensity } {
  switch (kind) {
    case "block":
      return { tint: IMPACT_TINTS.guardBreak, intensity: "light" };
    case "counter":
      return { tint: IMPACT_TINTS.counter, intensity: "ex" };
    case "magic":
      return { tint: IMPACT_TINTS.magic, intensity: "heavy" };
    case "ice":
      return { tint: IMPACT_TINTS.ice, intensity: "heavy" };
    case "heavy":
      return { tint: impactSparkColor(dmgType), intensity: "heavy" };
    case "hit":
    default:
      return { tint: impactSparkColor(dmgType), intensity: "light" };
  }
}

/**
 * COLOR IDENTITY hook: a doc's own first color key, normalized to full
 * brightness and quantized, used to tint the layered pop fired alongside it —
 * an icy ability keeps an icy flash, a fire one stays fiery. Quantization
 * keeps the composer's per-tint pooled keys to a handful.
 */
export function tintOfDoc(doc: VfxDoc): Rgb {
  const stops = doc.colorStops;
  const rgb = stops && stops.length > 0 ? stops[0]![1] : doc.color.start;
  const peak = Math.max(rgb[0], rgb[1], rgb[2]);
  if (peak < 0.05) return EX_DEFAULT_TINT; // near-black key → no usable hue
  const q = (c: number): number => Math.min(1, Math.round(c / peak / TINT_STEP) * TINT_STEP);
  return [q(rgb[0]), q(rgb[1]), q(rgb[2])];
}

/**
 * Clamp a one-shot's particle lifetime to the impact band. Returns the SAME
 * object when it already fits (identity = "nothing to retune").
 *
 * GH#270: the implementation moved to `./oneShotLife` so that
 * `vfxPresets.makeBurstSystem` (the whole `vfx-preset-*` family) can apply the
 * SAME ceiling without a circular import back through this module. Re-exported
 * here because every existing caller and test imports it from `VfxSystem`.
 */
export { clampOneShotLife };

/**
 * 被夾過的 doc 在粒子池裡的 id。
 *
 * ⚠️ 這不是裝飾。`VfxSystem.pool` 是**用 doc.id 當 key**、而且池裡那個
 * `ParticleSystem` 的 `minLifeTime`/`maxLifeTime` 是**建立當下**烘進去的。天花板
 * 從 0.6 改成 2.0 之後若沿用同一個 id,`play()` 會撈到那個照 0.6 建好的 system,
 * 於是後台顯示 2.0、schema 收下 2.0、`frontLoadDoc` 也算出 2.0,**而畫面上的粒子
 * 仍然 0.6 秒就消失** —— 第②號故障(算了但沒送到)加第⑤號(被測的不是出貨的
 * 那個)。和 `applyLayerOverrides` 給覆寫過的層換 id 是同一條規則。
 *
 * 天花板等於出貨預設時 id 一個字都不改,所以沒人動後台的畫面、池 key、
 * `ParticleSystem.name` 全部和升級前一位元不差。
 */
function lifeShapedId(id: string, maxLifeSec: number): string {
  return maxLifeSec === DEFAULT_ONE_SHOT_MAX_LIFE_SEC ? id : `${id}#life=${maxLifeSec}`;
}

/**
 * Impact-first playback shape for a one-shot doc (PURE, unit-tested).
 * A `continuous` doc becomes ONE front-loaded burst carrying the SAME authored
 * density (rate × avg AUTHORED life, so clamping never thins the pop out) with
 * a wide lifetime spread standing in for the tail; a `burst` doc keeps its
 * authored counts and lifetime shape, and is only clamped when it runs long.
 */
export function frontLoadDoc(doc: VfxDoc, maxLifeSec = oneShotMaxLifeSec()): VfxDoc {
  const lifetimeSec = clampOneShotLife(doc.lifetimeSec, maxLifeSec);
  // 真的被夾到了才換 id：沒被夾的 doc 在任何天花板下都是同一份東西，換 id 只會
  // 憑空多開一格池（和 `applyVfxOverrides` 的 identity 快速路徑同一個判斷）。
  const id = lifetimeSec === doc.lifetimeSec ? doc.id : lifeShapedId(doc.id, maxLifeSec);
  if (doc.mode === "burst") {
    return lifetimeSec === doc.lifetimeSec ? doc : { ...doc, id, lifetimeSec };
  }
  const avgLife = (doc.lifetimeSec.min + doc.lifetimeSec.max) / 2;
  // tailShare 0: a burst system can't rate-emit a tail, so ALL of the authored
  // energy lands on the impact frame and the spread below carries the tail
  const { burstCount } = frontLoadCounts(doc.rate ?? 30, avgLife, 0);
  // the authored stream rate is CONSUMED into burstCount — drop it so nothing
  // downstream can resurrect it as a trickle
  const { rate: _streamRate, ...rest } = doc;
  return {
    ...rest,
    id,
    mode: "burst",
    burstCount: Math.min(MAX_FRONT_LOAD_BURST, burstCount),
    lifetimeSec: {
      min: Math.min(lifetimeSec.min, lifetimeSec.max * TAIL_SPREAD),
      max: lifetimeSec.max,
    },
  };
}

interface PooledSystem {
  ps: ParticleSystem;
  lastUsedMs: number;
}

/** 一層排程中的特效 —— `delayMs` 到了才播(見 `VfxSystem.pendingLayers`)。 */
interface PendingLayer {
  doc: VfxDoc;
  x: number;
  z: number;
  y: number;
  boost: number;
  /** 絕對時間(ms),不是遞減計數器 */
  atMs: number;
}

/**
 * 同時最多幾層在等待播出。12 位英雄 × 一支 `ABILITY_VFX_LAYER_HARD_CAP` 層的
 * 技能 = 72,再留一倍餘裕給連續施法。滿了丟最舊的,不是拒收新的 —— 拒收新的
 * 會讓「剛剛那一下」沒有畫面,而那正是這整批要消滅的失敗。
 */
const MAX_PENDING_LAYERS = 144;

/**
 * ⭐ GH#702 —— **一份宣告 `gore: true` 的文件現在能不能播。**
 *
 * ⛔ 在這一行之前 `config.gore@1.style` 只閘得到 `bloodSpray()`（`hitImpact`
 * 那條血路）。而**文件驅動**的血 —— 幻之匕首 `godie-i039` 的 `spawnVfx →
 * fx.prim.blood.spray-back` —— 走的是另一條路，於是選了「無血」的玩家
 * **照樣看得到一蓬紅血往受害者背後噴**：一格登記在驗收帳本上的 rollback 開關，
 * 而它是假的（GH#696 的 `rollback-note` 逐字記著這件事）。
 *
 * ⚠️ **為什麼閘在 `play()` 而不是閘在 `vfxSpawn` 那個 case**：一份 vfx 文件
 * 有七個地方會被播（施法階梯、層堆疊、`pendingLayers`、一次性…）。閘在事件
 * 入口只關掉**今天**那一條路，下一支把血指到施法階梯的技能會安靜地繞過它 ——
 * 而「它有在噴，只是那格開關沒反應」是最難看出來的一種錯。`play()` 是所有
 * 粒子文件變成粒子的**同一個門**，所以閘只有一道。
 *
 * ⚠️ **為什麼 championId 是 null**：`vfxSpawn` 的酬載帶的是 **caster**，
 * ⛔ 不是受害者，而 `championStyles` 的語意是「**這具身體**不流紅血」
 * （機械/不死）。拿施法者去查會narrow錯人 ⇒ 這裡只吃**全域**那一層。
 *
 * ⚠️ **`stylized` 也關**：`stylized` 的契約是「同一下、但**沒有紅**」，
 * 而一份 `vfx@1` 的顏色是**烘在文件裡**的 —— 播下去就是紅的。
 * 「玩家的選擇是地板，不是建議」（`goreConfig.ts` 檔頭）⇒ 播不出無紅的版本
 * 就不播。⛔ 命中仍然讀得出來：task #33 的 impact kit 與傷害數字都不在這道閘裡。
 *
 * 出貨預設 `style: "blood"` ⇒ **預設路徑一位元不差**。
 */
export function goreDocPlayable(doc: { gore?: boolean } | null | undefined): boolean {
  if (!doc?.gore) return true; // 不是血 ⇒ 這道閘不管它
  return resolveGore(goreConfig(), null).style === "blood";
}

export class VfxSystem {
  /**
   * Un-owned one-shot rings (guardianMark's pre-land punish warning), which
   * have a real TICK-derived window and no per-entity cast to track.
   * Champion casts do NOT live here any more — they go through
   * `telegraphLayer`, which cancels on interrupt and fills off the cast bar.
   */
  private telegraphs: Telegraph[] = [];
  private sparks: HitSpark[] = [];
  /**
   * 多層特效模板 (#205) 裡 `delayMs > 0` 的層,等著在 `update()` 被放出來。
   *
   * ⚠️ 有界:`MAX_PENDING_LAYERS`。一個壞掉的內容(12 個人狂按一支 6 層全帶
   * delay 的技能)不可以讓這個陣列無限長 —— 滿了就丟掉最舊的那一筆,因為最舊
   * 的那一筆本來也最接近該播的時間、丟掉的代價最小。回合切換與 dispose 都會
   * 清空它,否則上一回合排定的餘燼會在商店場景裡爆出來(#216 / #259 的病)。
   */
  private pendingLayers: PendingLayer[] = [];
  /** per-doc-id free-list of pooled systems (cap MAX_POOL_PER_DOC) */
  private readonly pool = new Map<string, PooledSystem[]>();
  /** doc id → its impact-first playback shape (derived once per doc) */
  private readonly shaped = new Map<string, VfxDoc>();
  /** 濺血 / impact-debris layer (task #39) — pooled, allocates on first hit */
  private readonly blood: BloodFx;
  /** muzzle flash / landing dust / block clink (task #39) */
  private readonly feedback: CombatFeedbackFx;
  /** stun/root/slow/dash body auras (task #39) — inert until `status.set` is fed */
  private readonly status: StatusAuraFx;
  /** soft blob shadow under every live body (task #147) */
  private readonly shadows: ShadowLayer;
  /** fading ground scorch where an ability lands/casts (task #147) */
  private readonly castDecals: GroundDecalPool;
  /** 0.6s cast-telegraph light pillar, driven by the real castBegin window */
  private readonly pillars: CastPillarFx;
  /**
   * ⚡ 一段一段的電弧（`ArcBoltFx`）。**一個機制，不是一支技能**：
   * 引擎每要求一段（A→B）就長一段，一條連鎖 = 逐跳各要求一次，
   * 跳與跳之間的**極小時間間隔**由發出要求的那一側決定 —— ⛔ 不在這裡排程。
   * 建構它不配置任何東西：沒有人請求過弧的那一場，池子是空的。
   */
  private readonly arcs: ArcBoltFx;
  /** ⭐ GH#551 —— 移動中的**模型**特效（翻滾光束／圓周冰塊／直線火球）。null = 沒有內容接縫。 */
  private readonly modelFx: ModelFxRig | null;
  /** GH#838 特效工坊的演出腳本播放器（constructor 尾建）。 */
  private readonly scriptPlayer!: VfxScriptPlayer;
  /** ⭐ GH#549 —— 全螢幕閃爍 + 相機震動。owner：「不然都不知道發生什麼事情有沒有反擊成功」 */
  private readonly screenFx: ScreenFxLayer;
  /** ⭐ 特效文字（原作 CreateTextTagUnitBJ）。 */
  private readonly floatingText: FloatingTextFx;
  /**
   * ⭐ GH#494 —— 殭屍的錢：掉在屍體上 → 停 1 秒 → 貝茲曲線加速吸回擊殺者 →
   * 輕音效（連段音階升高）。⛔ 它碰不到任何一塊錢（賞金在 sim 早就發完了），
   * 所以 `enabled: false` 是逐位元回到這一版之前的止血閥。
   */
  private readonly gold: GoldPickupFx;
  /**
   * ⭐ GH#567 —— 守衛塔齊射的**投射物**。owner 2026-08-23:「場上打贏可以補血的
   * 物件也會攻擊英雄，但沒有明顯的動作跟投射物指引⋯看起來只會覺得有隱形英雄在
   * 打我」。預告圈一直都有（畫在**你腳下**），缺的是把它跟**塔**連起來的那條線。
   */
  private readonly guardianVolley: GuardianVolleyFx;
  /**
   * UNIVERSAL CAST TELEGRAPH (task #228): the ground shape every ability draws
   * while it winds up, derived from the ability doc and filled off the cast
   * bar's own progress. Owns the per-caster lifecycle the old ad-hoc
   * `telegraphs.push()` never had (it could not cancel on interrupt).
   */
  private readonly telegraphLayer: TelegraphLayer;
  /** vfxKey → resolved pillar palette (so a cast allocates nothing) */
  private readonly pillarPalettes = new Map<string, PillarPalette>();
  /** entityId → last walking-dust EMIT baseline {x,z} + time (task #147) */
  private readonly walkTrail = new Map<number, { ex: number; ez: number; lastMs: number }>();
  /**
   * ⭐ GH#661 —— 【身體移動拖曳光束】。⛔ 它不是上面那格走路灰塵的兄弟：
   * 灰塵是**腳下的一撮**、按步幅發，這一層是**跟著整具身體**的緞帶，按
   * **絕對世界速度**變亮（走路淡、衝刺全亮），而且靠 sim 的心跳綁在**狀態**上。
   * 見 `MoveTrailFx.ts` 的檔頭。
   */
  private readonly moveTrail: MoveTrailFx;
  /** reused per-frame scratch for the shadow inputs (no per-frame alloc) */
  private readonly shadowScratch: ShadowInput[] = [];
  /** entityId → last committed aim, consumed by the muzzle flash */
  private readonly aim = new Map<number, Vec2>();
  /**
   * THE RIG PATH (task #182/#183 → combat). Promoted casts play their WHOLE
   * w3x emitter set through `W3xEmitterRig` instead of N pooled front-loaded
   * bursts. Constructing this allocates nothing: the rig itself is built on the
   * first promoted cast and stays null in a match that has none.
   */
  private readonly w3xCast: W3xCastFx;

  /**
   * ⭐ **世界演出表**（`content/config/world-cues.json`）—— 解析**一次**
   * （第〇·四守則），⛔ 不是每一則事件都去查一次登錄表。
   * 後台存檔之後**玩家下一次重新整理**生效，與 `screenCuePolicyFromContent()`
   * 和 `feelFx()` 那一族同一個語意。
   */
  private readonly worldCueTable: ConfigWorldCuesDoc = worldCues();
  /** last `update()` timestamp — the rig ticks on dt, not on absolute time */
  private lastUpdateMs: number | null = null;
  /** GH#270: wall clock of the last one-shot emitter sweep (`-Infinity` = never). */
  private lastSweepMs = -Infinity;
  /**
   * GH#270: how many pooled one-shot emitters the hard cap has thrown away in
   * this match. **This number exists so the cap is not silent** (CLAUDE.md:
   * fail-open is fine, silent is the defect). `vfxDebugBus`'s panel reads it,
   * so an owner who set `maxOneShotEmitters` too low sees the eviction counter
   * climbing instead of wondering why impacts flicker.
   */
  private oneShotEvictions = 0;

  /**
   * ⭐ GH#661 —— 【移動拖曳光束】那一層（守衛的接縫）。
   * ⛔ 守衛讀的是**這一層自己的帳**（誰在拖、拖的是哪一份文件、有沒有真的畫），
   * ⛔ 不是「`mark()` 被呼叫了幾次」（失敗形態③：整條接線可以刪掉而測試全綠）。
   */
  get moveTrailLayer(): MoveTrailFx {
    return this.moveTrail;
  }

  /** Pooled one-shot emitters evicted by the hard cap so far (diagnostic). */
  get oneShotEvictionCount(): number {
    return this.oneShotEvictions;
  }

  /**
   * ⏳ GH#570: 三秒兜底到目前為止強制回收了幾個粒子系統。
   *
   * 同上面那個計數器的理由（⛔ 一個靜默的夾子跟沒有夾子長得一模一樣）：
   * 這個數字如果一直在爬，代表有一條路徑正在生產「沒有人收」的特效 ——
   * 那是要去修的**根因**，⛔ 不是「兜底有在做事所以沒問題」。
   */
  private vfxHardCapReclaims = 0;

  /** Particle systems force-reclaimed by the 3-second backstop (diagnostic). */
  get vfxHardCapReclaimCount(): number {
    return this.vfxHardCapReclaims;
  }

  constructor(
    private readonly scene: Scene,
    private readonly ctx: VfxContext,
  ) {
    this.blood = new BloodFx(scene);
    this.moveTrail = new MoveTrailFx(scene);
    // ⭐ GH#551/#549 —— 三個「演出」層。⚠️ `modelFx` 只在**兩個內容接縫都在**時才建：
    //    缺任一個就整條靜靜不生（⛔ 不是崩潰）—— 測試環境與早期開機沒有 AssetManager。
    this.modelFx =
      ctx.modelDocFor !== undefined && ctx.loadModelContainer !== undefined
        ? new ModelFxRig(scene, {
            resolveModel: (k) => ctx.modelDocFor!(k),
            loadContainer: (p) => ctx.loadModelContainer!(p) as never,
            // ⏳ GH#570 —— 「模型即特效」那條通道的硬壽命也吃**同一格**
            // （它自己的出貨預設是 8 秒）。⛔ 不要在 `modelFxRig` 裡再抄一個
            // 數字：那就是第〇·四守則說的第二個住處。
            maxEffectSec: vfxHardMaxLifeSec(),
            // ⭐ GH#838 M11 —— 沿路拖尾走 **VfxSystem 自己的 `play`**：同一個
            //    文件查詢、同一套壽命夾限、同一份粒子密度上限、同一個池。
            //    ⛔ 不另開一條渲染路（那會是第二個腐爛速度）。
            spawnTrail: (vfxId, tx, ty, tz) => {
              const doc = this.doc(vfxId);
              if (doc) this.play(doc, tx, tz, this.lastUpdateMs ?? 0, ty);
            },
          })
        : null;
    // ⭐ GH#549 —— `config.screen-fx@1` 的**唯一** production 消費端。
    //    ⛔ 在這三行出現之前，那份文件的 10 格是「後台存得起來、遊戲一輩子看不到」
    //    （第一·五守則）：出貨的理想鄉反彈寫了 `peakAlpha: 0.62`，而全域上界
    //    是 0.55 —— 少了這一段，那個上界一次都沒有被套用過。
    //    ⚠️ 解析**一次**（第〇·四守則）：⛔ 不是每一發特效都去查一次登錄表。
    const cue = screenCuePolicyFromContent();
    this.screenFx = new ScreenFxLayer();
    this.screenFx.setLimits(cue.limits);
    this.floatingText = new FloatingTextFx({
      capacity: cue.floatingTextMaxOnScreen,
      scaleMult: cue.floatingTextScale,
    });
    this.feedback = new CombatFeedbackFx(scene);
    this.status = new StatusAuraFx(scene);
    this.shadows = new ShadowLayer(scene);
    this.castDecals = new GroundDecalPool(scene, { maxDecals: MAX_CAST_DECALS });
    this.pillars = new CastPillarFx(
      scene,
      {
        entityPos: (id) => this.ctx.entityPos(id),
        // TASK #233 — the beam is framed against the camera that is actually
        // presenting. `scene.activeCamera` is the right one in the single-view
        // case and the last-rendered viewport in the 4-up couch split; in the
        // split the four rigs share a pitch and a dolly, so the height they
        // disagree about is at most the difference their targets make, which is
        // far smaller than the 6.4 u constant this replaces.
        headroomAt: (x, z) => this.headroomAt(x, z),
        // ✨ GH#788 —— 蓄力集氣層的**隊伍顏色**來源（owner 2026-08-27:「顏色是隊伍顏色光芒」）。
        // ⭐ 集氣層刻意只在 teamOf 有供應時才建：拿不到隊色就不畫，⛔ 不畫一個猜的顏色。
        // ⚠️ 少了這一行整層線上不存在，而畫面上與「還沒做」長得一模一樣（失敗形態⑧）。
        teamOf: (id) => this.ctx.teamOf?.(id) ?? null,
      },
      { getScale: () => this.budgetScale() },
    );
    this.arcs = new ArcBoltFx(scene);
    this.guardianVolley = new GuardianVolleyFx(scene);
    // ⭐ GH#494 掉錢 → 停 1 秒 → 貝茲加速吸回擊殺者 + 輕音效（連擊音階升高）。
    this.gold = new GoldPickupFx(scene, {
      entityPos: (id) => this.ctx.entityPos(id),
      playSfx: (event, opts) => this.ctx.playSfx?.(event, opts) ?? false,
    });
    this.w3xCast = new W3xCastFx(scene, { getQualityScale: () => this.budgetScale() });
    this.telegraphLayer = new TelegraphLayer(scene, {
      entityPos: (id) => this.ctx.entityPos(id),
      castProgress: (id, nowMs) => this.ctx.castProgress?.(id, nowMs) ?? null,
    });
    // ⭐ GH#838 特效工坊 —— 演出腳本播放器。它自己不畫任何東西：把
    //    `content/vfx-scripts/` 的 segment 翻成既有 wire payload **回餵
    //    handleEvent**（modelFxSpawn/vfxSpawn/floatingText/screenFlash|Shake
    //    —— 全是出貨消費端，⛔ 沒有第二條渲染路）。沒有 script 的技能與
    //    開關關掉的世界都是零成本路（`scriptFor` 查不到就 return）。
    this.scriptPlayer = new VfxScriptPlayer({
      scriptFor: (abilityId) => this.vfxScriptIndex().get(abilityId),
      allScripts: () => VfxScripts.all(),
      projectileIdsOf: (abilityId) => this.abilityProjectileIds(abilityId),
      entityPos: (id) => this.ctx.entityPos(id),
      dispatch: (sev, t) => this.handleEvent(sev, t),
      playSfx: (event, opts) => this.ctx.playSfx?.(event, opts ?? {}) ?? false,
      pulseAnim: (id, kind, opts) => this.ctx.pulseAnim?.(id, kind, opts),
      hideBody: (id, ms) => this.ctx.hideBody?.(id, ms),
      enabled: () =>
        (ContentConfigs.tryGet("vfx-scripts") as { enabled?: boolean } | undefined)?.enabled ??
        DEFAULT_VFX_SCRIPTS.enabled,
    });
  }

  private scriptIndexCache: Map<string, VfxScriptDoc> | null = null;
  private projectileIdsCache = new Map<string, ReadonlySet<string>>();

  /** abilityId → script（懶建；forge 熱改後 `invalidateVfxScripts()` 重建）。 */
  private vfxScriptIndex(): Map<string, VfxScriptDoc> {
    if (this.scriptIndexCache === null) {
      this.scriptIndexCache = new Map();
      for (const s of VfxScripts.all()) this.scriptIndexCache.set(s.abilityId, s);
    }
    return this.scriptIndexCache;
  }

  /** forge 編輯器存檔後叫這一支 —— script 索引與彈道歸屬全部重建。 */
  invalidateVfxScripts(): void {
    this.scriptIndexCache = null;
    this.projectileIdsCache.clear();
    this.scriptPlayer.invalidate();
  }

  /**
   * 這支技能的 effects deep-scan 收集到的 projectileId 集合 —— wire 的
   * `projectileSpawn/Hit` 只帶 `projectileId`，歸屬**從技能 JSON 推導**（⛔ 不猜）。
   */
  private abilityProjectileIds(abilityId: string): ReadonlySet<string> {
    const hit = this.projectileIdsCache.get(abilityId);
    if (hit) return hit;
    const out = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const n of node) walk(n);
        return;
      }
      if (node === null || typeof node !== "object") return;
      const rec = node as Record<string, unknown>;
      if (rec.kind === "spawnProjectile" && typeof rec.projectileId === "string")
        out.add(rec.projectileId);
      for (const v of Object.values(rec)) walk(v);
    };
    walk(Abilities.tryGet(abilityId as AbilityId)?.effects);
    this.projectileIdsCache.set(abilityId, out);
    return out;
  }

  /**
   * Vertical budget above a ground point through the LIVE camera (task #233).
   *
   * Reads the real camera's eye + fov + aspect rather than reconstructing the
   * rig from constants, so a zoomed-out or panned camera gets the budget it
   * really has. Returns null when there is no camera (NullEngine tests), and
   * `castBeamPlan` falls back to the shipped default.
   */
  private headroomAt(x: number, z: number): number | null {
    const cam = this.scene.activeCamera;
    if (!cam) return null;
    const eye = cam.globalPosition;
    const m = cam.getWorldMatrix();
    const fwd = Vector3.TransformNormalFromFloatsToRef(0, 0, 1, m, HEADROOM_F).normalize();
    const target = {
      x: eye.x + fwd.x,
      y: eye.y + fwd.y,
      z: eye.z + fwd.z,
    };
    const pose = poseLookingAt({ x: eye.x, y: eye.y, z: eye.z }, target);
    return verticalHeadroom(pose, { x, z }, {
      fovRad: (cam as unknown as { fov?: number }).fov ?? undefined,
      aspect: this.scene.getEngine().getAspectRatio(cam),
    });
  }

  /** The universal cast-telegraph layer (test/observability seam, task #228). */
  get telegraphs228(): TelegraphLayer {
    return this.telegraphLayer;
  }

  /** ⭐ 特效文字的目前清單 —— 由 `ui/WorldAnchorLayer` 每幀讀（GH#543）。 */
  get floatingTextEntries(): readonly unknown[] {
    return this.floatingText.entries;
  }

  /** ⭐ 全螢幕閃爍／震動那一層（守衛量它 —— 後台上界真的套用了沒有）。 */
  get screenFxLayer(): ScreenFxLayer {
    return this.screenFx;
  }

  /** ⭐ 相機震動的出口安裝（出貨接 `CameraRig.addShake`）。 */
  /** 🔥 GH#703 —— 把出貨內容的 modelKey 名單餵給 modelFx 容器快取（進場預熱）。 */
  warmModelFx(keys: readonly string[]): void {
    this.modelFx?.warm(keys);
  }

  /**
   * 🧹 GH#819 —— 回合間完整清理：模型即特效那一條路的**硬重置**（活的＋free-list
   * ＋軌全部 dispose、容器引用整批放手；rig 繼續可用）。
   * ⛔ 共用容器本身在 `AssetManager.purgeFxContainers()` 那一端收（GH#558①）。
   */
  hardResetModelFx(): void {
    this.modelFx?.hardReset();
  }

  installShakeSink(fn: (amplitude: number, durationMs: number) => void): void {
    this.screenFx.setShakeSink(fn);
  }

  /** The w3x rig path (test/observability seam). */
  get w3xCastFx(): W3xCastFx {
    return this.w3xCast;
  }

  /**
   * STATUS BODY AURAS (task #39). The authoritative CC bitmask
   * (`EntitySchema.flags`: 1 dashing / 2 rooted / 4 stunned / 8 slowed) has
   * shipped on the wire since the protocol was written. The game loop's
   * per-frame champion pass now feeds it in (GameApp step 4b:
   *   `vfx.statusFx.set(es.id, es.flags, pos.x, pos.z, nowMs)`),
   * so a stun/root/slow finally reads on the body; `update` below pumps the
   * pulses and `forget` (on despawn) sweeps them.
   */
  get statusFx(): StatusAuraFx {
    return this.status;
  }

  /** The blood layer (test/observability seam). */
  get bloodFx(): BloodFx {
    return this.blood;
  }

  /** The muzzle/dust/block layer (test/observability seam). */
  get feedbackFx(): CombatFeedbackFx {
    return this.feedback;
  }

  /** The blob-shadow layer (test/observability seam). */
  get shadowLayer(): ShadowLayer {
    return this.shadows;
  }

  /** Live cast-scorch decals on the floor (test/observability seam). */
  get castDecalCount(): number {
    return this.castDecals.activeCount;
  }

  /** The cast-telegraph pillar layer (test/observability seam). */
  get castPillarFx(): CastPillarFx {
    return this.pillars;
  }

  /** ⭐ GH#567 —— 場上還在飛的守衛砲彈數（守衛／診斷用的接縫）。 */
  get guardianBoltCount(): number {
    return this.guardianVolley.activeCount;
  }

  /** 場上還在跑的一次性地面預告圈數（守衛用：圈與球必須**同時**出現）。 */
  get groundTelegraphCount(): number {
    return this.telegraphs.length;
  }

  /**
   * The pillar palette for an ability, memoized by vfxKey.
   *
   * The element comes from the ability's OWN `fx.prim.<element>.…` binding
   * (task #79) so an ice spell erupts in white-blue and a fire spell in
   * white-gold — 依文潔琳's ice reading as orange fire is precisely the
   * mismatch the owner has rejected before. Imported docs with no element in
   * their id fall back to the doc's own colour RAMP, and only then to the FF7
   * limit-break gold. Memoized because this fires on EVERY cast now.
   *
   * The ramp, NOT `tintOfDoc`. `tintOfDoc` returns `colorStops[0]`, which is
   * correct for a particle system (the birth colour) and wrong for a light
   * column: every imported WC3 flame doc is authored white-hot → hue → black,
   * so stop 0 is `[1,1,1]`. Measured in a live match, that made 297 of 554
   * abilities (53.6%, incl. all 285 still on the `fx.ember-bolt-cast`
   * placeholder) erupt as a colourless white column. `pillarTintFromRamp`
   * scans the whole ramp for the most chromatic stop instead — for
   * `fx.ember-bolt-cast` that is `[1,0.6,0.2]`, the flame gold the doc was
   * always describing.
   */
  private pillarPaletteFor(abilityId: string | undefined): PillarPalette {
    const def = abilityId ? Abilities.tryGet(abilityId as AbilityId) : undefined;
    const key = def?.vfxKey;
    const cacheKey = key ?? "";
    let p = this.pillarPalettes.get(cacheKey);
    if (!p) {
      const doc = this.doc(key);
      p = pillarPalette(key, doc ? pillarTintFromRamp(doc.colorStops, doc.color.start) : null);
      this.pillarPalettes.set(cacheKey, p);
    }
    return p;
  }

  /**
   * Memoized impact-first shape of a doc (gradients are baked per system).
   *
   * ⚠️ memo key 帶著**當下生效的壽命天花板**。只用 `doc.id` 當 key 的話,後台把
   * 上限從 0.6 改成 2.0 之後,這個 map 會把 0.6 那一版原封不動遞回去 —— 「後台
   * 存了、頁面顯示 2.0、場上沒變」正是這條 lane 要消滅的失敗形態。天花板沒被動
   * 過時 key 就是 `<id>|0.6`,一份 doc 一格,和升級前一樣。
   */
  private shapeOf(doc: VfxDoc): VfxDoc {
    const maxLifeSec = oneShotMaxLifeSec();
    const key = `${doc.id}|${maxLifeSec}`;
    let shaped = this.shaped.get(key);
    if (!shaped) {
      shaped = frontLoadDoc(doc, maxLifeSec);
      this.shaped.set(key, shaped);
    }
    return shaped;
  }

  /** ms after a play() during which an instance still shows live particles. */
  private busyWindowMs(doc: VfxDoc): number {
    // every particle is born on the impact frame → the longest life IS the run
    return doc.lifetimeSec.max * 1000;
  }

  /**
   * Fire a vfx doc at a world position, front-loaded (see frontLoadDoc).
   * Pooled per doc id with a small free-list so the same doc can play several
   * times in the same frame; when all instances are busy the least-recently-
   * used one is stolen. `boost` scales the burst (EX casts). Returns the
   * system used (test/observability seam).
   */
  play(
    rawDoc: VfxDoc | null,
    x: number,
    z: number,
    nowMs: number,
    y = 1.0,
    boost = 1,
  ): ParticleSystem | null {
    if (!rawDoc) return null;
    // ⭐ GH#702 —— 玩家選了無血 ⇒ 宣告 `gore` 的文件**一顆粒子都不生**
    // （⛔ 連池子都不開）。判準住文件身上，⛔ 不是一張 id 名單。
    if (!goreDocPlayable(rawDoc)) return null;
    // FIX #131: never place a pooled system at a non-finite world position.
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) return null;
    const doc = this.shapeOf(rawDoc);
    // live particle-density setting (0–1), driven by preset / adaptive manager
    const scale = particleBudgetScale(qualityController.getParams().particleDensity);
    let list = this.pool.get(doc.id);
    if (!list) {
      list = [];
      this.pool.set(doc.id, list);
    }
    // 1) an idle instance (its particles have all expired)
    let entry = list.find((e) => nowMs - e.lastUsedMs >= this.busyWindowMs(doc));
    // 2) grow the free-list up to the cap
    if (!entry && list.length < MAX_POOL_PER_DOC) {
      entry = { ps: toParticleSystem(doc, this.scene, { scale }), lastUsedMs: -Infinity };
      list.push(entry);
    }
    // 3) steal the least-recently-used (oldest particles on screen)
    if (!entry) {
      entry = list[0]!;
      for (const e of list) if (e.lastUsedMs < entry.lastUsedMs) entry = e;
    }
    entry.lastUsedMs = nowMs;
    const ps = entry.ps;
    (ps.emitter as Vector3).set(x, y, z);
    // a stopped system swallows bursts (animate() zeroes newParticles while
    // stopped), so always restart before firing — pooled instances outlive
    // many plays and must stay re-fireable forever
    ps.start();
    // ⭐ GH#842 —— **這一發是新的一次演出**，三秒碼表歸零。
    //    ⚠️ 池化實例重新點燃時 ⛔ 不排空 ⇒ `isAlive()` 一直 true ⇒ 碼表會從
    //    **第一次**點燃一路數下去 ⇒ 連續戰鬥 3 秒後，硬上限掃描會對**正在播的
    //    那一發**做 stop()+reset()。那正是 owner 說的「打一打動畫就消失沒播完」。
    //    ⛔ 這不是放寬鐵則：一發真的播超過三秒的仍然會被回收。
    noteVfxRefired(ps);
    // ALL of the burst lands on this frame — that IS the impact
    ps.manualEmitCount = Math.max(1, Math.round(scaledBurstCount(doc, scale) * boost));
    return ps;
  }

  /**
   * 解一份 vfx 文件。
   *
   * ⭐ GH#379 —— **家族仰角在這裡套**,也就是這個系統解文件的唯一入口:
   * `beam`/`bolt`/`dash`/`slash` 躺下來(於是 GH#377 的瞄準不再是恆等變換),
   * `tornado` 維持直立。沒有東西要套時 `applyFamilyOrient` 回傳同一個物件
   * reference,所以其他 579 份文件走的是一位元不差的舊路徑。
   *
   * ⚠️ 套在這裡而不是套在每一個播放點,是因為 `playCastVfx` 的四級階梯 + 層堆疊
   * 一共有七個地方會解文件 —— 漏掉任何一個,那條路上的技能就會安靜地不瞄準
   * (而畫面上「它有在動、只是沒轉」是最難看出來的一種錯)。
   */
  private doc(key: string | undefined): VfxDoc | null {
    if (!key) return null;
    return applyFamilyOrient(this.ctx.vfxDoc?.(key) ?? null);
  }

  /**
   * THE CAST'S OWN ART — a four-rung ladder that can never end in silence.
   *
   * 1. PROMOTED + RIG. When `w3xAbilityArt` says this ability owns the map's
   *    own effect, the WHOLE emitter set goes to `W3xEmitterRig` (see
   *    `W3xCastFx`): the docs' authored emission streams, planned against the
   *    screen particle budget, with a per-effect lifetime. A WC3 effect is a
   *    SET — `vfxKey` names only its dominant emitter — so this is the only rung
   *    that plays 世界終結's frost nova as the four emitters it really is.
   * 2. PROMOTED, RIG REFUSED. The rig says no when 12 effects are already live
   *    (or it could not be built at all). The docs still resolved, so they play
   *    through the ordinary pooled path — `frontLoadDoc` collapses each authored
   *    stream into ONE capped burst, which is cheap and still the right art.
   * 3. PROMOTED, ART MISSING. The content docs did not resolve (content not
   *    rebuilt, an older `contentVersion` still served). The ability's own
   *    `vfxKey` names the w3x doc, so there is nothing left on the doc side —
   *    fall back to the `fx.prim.*` key this row overrode.
   * 4. NOTHING LEFT. A hit spark, because a cast that draws literally nothing is
   *    the failure this whole batch exists to remove. Reached only for the 17
   *    off-roster rows, whose champions cannot be picked in a match.
   *
   * An ability with NO promotion is untouched: rung 1–4 do not apply and it
   * plays its one primitive exactly as before.
   */
  /**
   * GH#392 —— 這一次施法要掛在誰的哪一根骨頭上，或 null。
   *
   * ⭐ 節點是從 **scene 自己**查的（`champ-<entityId>`，`ChampionView` 的
   * 建構子就是這樣命名的），⛔ 不必新增一條 `VfxContext` 回呼 ——
   * 多一條可選回呼就等於多一個「上游忘了接就靜靜地什麼都不發生」的洞
   * （失敗形態②），而這一條路的證據（掛點字串）本來就已經在 `art` 上了。
   *
   * ⚠️ 查不到節點（體素替身、模型還在載、觀戰視角）→ null → 走世界座標，
   * 也就是這一版之前一位元不差的行為。⛔ 不丟例外、⛔ 不吞掉這一次施法。
   */
  private castAnchor(
    art: { anchor?: string } | undefined,
    casterId: number | undefined,
  ): { root: TransformNode; attach: string } | null {
    const attach = art?.anchor;
    if (!attach || casterId === undefined) return null;
    const root = this.scene.getTransformNodeByName(`champ-${casterId}`);
    return root ? { root, attach } : null;
  }

  /** 已經警告過的掛點退路（key = `attach|落點`）—— log 一次就夠，⛔ 不是每發一次。 */
  private readonly boneFallbackWarned = new Set<string>();

  /**
   * ⭐ GH#649/#565 —— `spawnVfx at:"bone"` 的骨頭解析：一次性特效掛在
   * **施法者模型**的骨頭上（chest / hand / weapon / …）。
   *
   * 回傳的是**世界座標**（骨頭節點此刻的絕對位置），⛔ 不是把 pooled
   * ParticleSystem 認父到節點 —— 這條路上的每一份 doc 都被 `frontLoadDoc`
   * 壓成「所有粒子誕生在同一幀」的 one-shot，所以「掛著跟隨」與「在骨頭
   * 此刻的位置爆開」逐位元等價，而 pool 的 `(ps.emitter as Vector3).set`
   * 契約不必被打破（emitter 換成節點後，下一次複用就是一次 TypeError）。
   *
   * 退路階梯（⚠️ 每一格都**畫**，差別只有落點；記 log，⛔ 不吞）：
   *   1. 掛點字串正規化＋WC3 fallback 鏈（`resolveAttachment`）命中節點 → 節點位置
   *   2. 模型在、鏈上一根都沒有（替身骨架）→ **模型根 + 胸口高度**，log 一次
   *   3. 連 `champ-<id>` 節點都沒有（體素替身、模型還在載）→ 事件座標 + 胸口高度，log 一次
   */
  private boneSpawnPos(
    attach: string,
    casterId: number | undefined,
    fallbackX: number,
    fallbackZ: number,
  ): { x: number; y: number; z: number } {
    const warnOnce = (key: string, msg: string): void => {
      if (this.boneFallbackWarned.has(key)) return;
      this.boneFallbackWarned.add(key);
      console.warn(`[vfx] bone anchor "${attach}": ${msg}`);
    };
    const root = casterId !== undefined ? this.scene.getTransformNodeByName(`champ-${casterId}`) : null;
    if (!root || root.isDisposed()) {
      warnOnce(`${attach}|no-model`, "施法者無模型節點（替身/載入中）→ 退回胸口高度");
      return { x: fallbackX, y: ARC_BODY_Y, z: fallbackZ };
    }
    const nodes = root.getChildTransformNodes(false);
    const res = resolveAttachment(attach, [root.name, ...nodes.map((n) => n.name)]);
    let node: TransformNode | null = null;
    if (res.node !== null) {
      const want = res.node;
      if (root.name === want) node = root;
      if (!node) for (const n of nodes) if (n.name === want) { node = n; break; }
      // glb 實例化會給節點加前綴（`"7-Hand Right Ref"`）—— 與 findBoneNode 同一招
      if (!node) for (const n of nodes) if (n.name.endsWith(want)) { node = n; break; }
    }
    if (!node) {
      warnOnce(`${attach}|no-bone|${root.name}`, `模型上沒有對應骨（${res.reason}）→ 退回胸口`);
      root.computeWorldMatrix(true);
      const p = root.getAbsolutePosition();
      return { x: p.x, y: p.y + ARC_BODY_Y, z: p.z };
    }
    if (!res.exact) warnOnce(`${attach}|chain|${res.matched}`, res.reason);
    node.computeWorldMatrix(true);
    const p = node.getAbsolutePosition();
    return { x: p.x, y: p.y, z: p.z };
  }

  private playCastVfx(
    abilityId: string | undefined,
    doc: VfxDoc | null,
    pos: { x: number; z: number },
    nowMs: number,
    boost: number,
    layers?: readonly ResolvedVfxLayer[] | null,
    point?: { x: number; z: number } | null,
    /**
     * #377 —— 這一次施法瞄的方位角(世界座標,度),沒有方向可言時 `null`。
     * ⚠️ 它**不是**一條新的空間參數管線:它只走到 `applyAimYaw`,而那支把它
     * 折進 `doc.orient.yawDeg`,也就是 `scale`/`tint`/`alpha` 那條既有的路。
     * 宣告 `orient.yawFrom: "aim"` 的文件才會被動到,其餘一位元不變。
     */
    aimYawDeg?: number | null,
    /**
     * GH#392 —— 誰在施法。⭐ 它**只**用來找那名英雄的模型節點
     * （`champ-<id>`，`ChampionView` 建的），好讓帶掛點的技能把特效掛在
     * 胸口／手／武器的骨骼上並跟著動。undefined = 走世界座標。
     */
    casterId?: number,
  ): void {
    // ---- RUNG 0: 技能自己寫了 `vfxLayers` (#205) ---------------------------
    // 一份 doc 寫了層堆疊,那就是作者對「這一招施法時畫什麼」的完整陳述 ——
    // 所以它蓋過下面那條晉升階梯,而不是被它蓋過。**只有**這種 doc 會走到這裡:
    // 646 支只有 `vfxKey` 的技能 `layers` 是 null(見 `handleEvent` 的
    // `isLegacySingleVfx` 分支),一個位元都不經過新程式碼。
    if (layers && layers.length > 0) {
      this.playLayeredCast(layers, pos, point ?? null, nowMs, boost, aimYawDeg ?? null);
      return;
    }
    const art = w3xArtFor(abilityId);
    // GH#391 —— 這一支技能自己的仰角/方位角(`config.vfx-families@1.abilities`)。
    // ⭐ 取在 `if (!art)` **之前**是這一格的全部重點:41 支揮砍裡有 16 支沒有家族列,
    // 而它們正是「只剩 primitive、最需要一個自己的角度」的那一半 —— 取在後面等於
    // 讓覆寫只對已經有原作藝術的技能生效。
    const orient = abilityOrientOverrideFor(abilityId);
    // #230 —— 施法高度從**一個有名字的接縫**來,不是四個匿名的 `1.0`。今天它回傳
    // 出貨值,所以行為一位元不差;`familyCastHeight.ts` 的檔頭記著量到的落差
    // (258 支家族技能有 229 支的 `heightY` 不是 1.0),以及為什麼接上去是 owner
    // 的視覺決定。`familyCastOnScreen.test.ts` 斷言「宣稱的高度 == Babylon 拿到的
    // 高度」,所以接上去的那一天,②號故障(算了但沒送到)不可能再發生一次。
    const castY = familyCastHeightY(art);
    if (!art) {
      // GH#391 —— 方位覆寫走的是 `applyVfxOverrides`(=`applyArtParams`)那條**既有**
      // 的路:換 pool key、保住文件自己宣告的 `yawFrom`、沒有覆寫時回傳同一個物件。
      // ⛔ 不是第二條平行的空間參數管線 —— `flyHeight` 當年就是那樣蒸發的。
      const tuned = doc && orient ? applyVfxOverrides(doc, orient) : doc;
      this.play(tuned ? applyAimYaw(tuned, aimYawDeg) : tuned, pos.x, pos.z, nowMs, castY, boost);
      return;
    }
    // #205 —— 鑄技工坊那張表的 per-ability α / 時間倍率。**兩個都沒設時
    // `applyVfxOverrides` 回傳同一個物件**,所以沒被碰過的技能連 pool key 都
    // 不變(升級前後一位元不差)。設了才會拿到一份改過的 doc + 自己的 pool key。
    // #377 —— 瞄準疊在後台覆寫**之後**:`applyVfxOverrides` 可能把作者寫的偏移
    // 換掉,而瞄準是加在最終偏移上的。兩者共用同一支 `applyArtParams`,所以只有
    // 一份乘法/合併邏輯。
    const tune = (d: VfxDoc): VfxDoc =>
      applyAimYaw(
        applyVfxOverrides(d, {
          ...(art.alpha !== undefined ? { alpha: art.alpha } : {}),
          ...(art.timeScale !== undefined ? { timeScale: art.timeScale } : {}),
          // GH#391 —— 同一格覆寫也套在晉升過的藝術與 rung 3 的 primitive 上。
          ...orient,
        }),
        aimYawDeg,
      );
    const set: VfxDoc[] = [];
    // `doc` IS the primary for every promoted row (the ability's `vfxKey` is
    // the family's dominant emitter, by construction). Reuse it rather than
    // resolving the same id twice — `ctx.vfxDoc` is a live content lookup, and
    // a double read would double-count in anything observing it.
    const primary = doc?.id === art.primary ? doc : this.doc(art.primary);
    if (primary) set.push(tune(primary));
    for (const id of extraVfxDocIds(abilityId)) {
      const d = this.doc(id);
      if (d) set.push(tune(d));
    }
    // 1
    // GH#392 —— 這一招宣告了掛點就把整個效果掛到施法者身上（附著＋跟隨＋
    // 特效自己的動畫軌），⛔ 沒宣告就一位元不差地走世界座標那條路。
    if (this.w3xCast.play(art.family, set, pos.x, castY, pos.z, nowMs, this.castAnchor(art, casterId)))
      return;
    // 2
    if (set.length > 0) {
      for (const d of set) this.play(d, pos.x, pos.z, nowMs, castY, boost);
      return;
    }
    // 3
    const primitive = this.doc(primitiveFallbackFor(abilityId));
    if (primitive) {
      this.play(tune(primitive), pos.x, pos.z, nowMs, castY, boost);
      return;
    }
    // 4
    this.sparks.push(new HitSpark(this.scene, pos.x, pos.z, nowMs));
  }

  /**
   * 播一支技能的多層特效堆疊 (#205)。
   *
   * 每一層各自:解出自己的文件 → 套自己的參數覆寫(`applyLayerOverrides`,
   * 覆寫過的文件會拿到自己的 pool key,否則兩層會共用同一個
   * `ParticleSystem`、第二層的參數整個被吃掉)→ 算自己的位置與高度 →
   * `delayMs` 是 0 就當場播,大於 0 就排進 `pendingLayers`。
   *
   * 解不出文件的層被跳過而不是讓整支技能沉默:一層指到不存在的 vfx id 是
   * 內容錯誤,不該連累其他層。整堆都解不出來時退到 hit spark,和階梯第 4 級
   * 同一個理由 —— 施法畫不出任何東西是這批要消滅的失敗。
   */
  private playLayeredCast(
    layers: readonly ResolvedVfxLayer[],
    pos: { x: number; z: number },
    point: { x: number; z: number } | null,
    nowMs: number,
    boost: number,
    /** #377 這一次施法的瞄準方位角(度),沒有方向可言時 null。 */
    aimYawDeg: number | null = null,
  ): void {
    let drawn = 0;
    for (const layer of layers) {
      const base = this.doc(layer.vfxKey);
      if (!base) continue;
      // #377 —— 瞄準疊在這一層自己的 `facingDeg` **之後**,所以層寫的角度是
      // 「偏離瞄準多少」(一把三段的斬擊 = 同一份 doc 的 −25 / 0 / +25 三層)。
      const doc = applyAimYaw(applyLayerOverrides(base, layer), aimYawDeg);
      const p = layerPosition(layer, pos, point);
      const y = layerHeightY(layer);
      drawn += 1;
      if (layer.delayMs > 0) {
        if (this.pendingLayers.length >= MAX_PENDING_LAYERS) this.pendingLayers.shift();
        this.pendingLayers.push({ doc, x: p.x, z: p.z, y, boost, atMs: nowMs + layer.delayMs });
        continue;
      }
      this.play(doc, p.x, p.z, nowMs, y, boost);
    }
    if (drawn === 0) this.sparks.push(new HitSpark(this.scene, pos.x, pos.z, nowMs));
  }

  /** 放出所有到期的延遲層。絕對時間比較,不是遞減計數器。 */
  private drainPendingLayers(nowMs: number): void {
    if (this.pendingLayers.length === 0) return;
    const due = this.pendingLayers.filter((p) => p.atMs <= nowMs);
    if (due.length === 0) return;
    this.pendingLayers = this.pendingLayers.filter((p) => p.atMs > nowMs);
    for (const p of due) this.play(p.doc, p.x, p.z, nowMs, p.y, p.boost);
  }

  /**
   * Resolve an event's world position: the enriched payload's own x/z when
   * present (the sim now stamps the impact point on the damage event), else the
   * rendered position of the referenced entity, else null.
   */
  private posFromEvent(ev: EventMessage, id: number | undefined): { x: number; z: number } | null {
    const x = ev.data.x;
    const z = ev.data.z;
    // FIX #131: reject a non-finite coordinate so it can never park an emitter
    // off-world (which renders as a stuck bright burst at a screen corner).
    if (typeof x === "number" && typeof z === "number") return isFinitePos({ x, z }) ? { x, z } : null;
    const p = id !== undefined ? this.ctx.entityPos(id) : null;
    return isFinitePos(p) ? p : null;
  }

  /**
   * How an entity relates to the local player — the axis floating combat text
   * is coloured on (task #92). "unknown" whenever the seat/team wiring is not
   * up yet or the entity is a neutral (a flower has no team): those events fall
   * into the low-priority third-party band rather than being mislabelled as
   * yours, which would put a stranger's chip damage in the biggest, reddest,
   * highest-priority slot on screen.
   */
  private relationOf(id: number | undefined): CombatTextRelation {
    if (id === undefined) return "unknown";
    const local = this.ctx.localEntityId?.() ?? null;
    if (local === null) return "unknown";
    if (id === local) return "self";
    const mine = this.ctx.teamOf?.(local) ?? null;
    const theirs = this.ctx.teamOf?.(id) ?? null;
    if (mine === null || theirs === null) return "unknown";
    return mine === theirs ? "ally" : "enemy";
  }

  /**
   * 一具身體上的一個【交換】變化量（GH#406）。
   *
   * ⚠️ **kind 由「方向」決定，⛔ 不是由 resource 決定**，而理由不是美觀：
   * `combatTextCategory` 對 `heal`/`mana` 在**敵人**身上分別回 `other` / `null`，
   * 而 `other` 不在出貨預設 scope（`team`）裡 —— 也就是說走 heal 的那一格在
   * 敵人身上**畫不出來**。付出去的那一邊改走 `damage`，於是（我是施法者時）
   * 它落在 `dealt`、（我是被交換的那個時）落在 `taken`，兩個都在預設 scope 裡。
   *
   * ⚠️ 兩邊都覆蓋 `label`（「交換 +107」），因為交換**既不是治療也不是傷害** ——
   * 卡片上寫的是交換，而 sim 那一側正是為了這個理由拒絕發 `damage`/`heal`
   * （sim/effects/swapResource.ts 檔頭第二段）。少了這行字，畫面會宣稱剛剛
   * 發生了一次治療加一次傷害，而那句話是假的。
   *
   * ⚠️ **已知限制（誠實寫下來）**：我是施法者、而**對方拿到**的那一格
   * （＝我原本比較健康）走 heal → 在敵人身上是 `other` → 預設 scope 不畫。
   * 那與既有政策一致（別人回血不是你能反應的資訊），⛔ 但它是一個選擇不是疏漏；
   * 要改的話是給「交換」自己一個 category，不是在這裡繞過去。
   */
  private pushSwapDelta(
    id: unknown,
    from: unknown,
    to: unknown,
    isMana: boolean,
    caster: unknown,
    nowMs: number,
  ): void {
    if (typeof id !== "number" || typeof from !== "number" || typeof to !== "number") return;
    const delta = to - from;
    const amount = Math.abs(delta);
    // 一個四捨五入後是 0 的交換沒有可畫的東西（夾在上限上的那一邊會這樣）。
    if (Math.round(amount) < 1) return;
    const pos = this.ctx.entityPos(id);
    if (!isFinitePos(pos)) return;
    const gained = delta > 0;
    pushCombatText({
      kind: gained ? (isMana ? "mana" : "heal") : "damage",
      amount,
      label: `交換 ${gained ? "+" : "-"}${Math.round(amount)}`,
      sourceRel: this.relationOf(typeof caster === "number" ? caster : undefined),
      targetRel: this.relationOf(id),
      crit: false,
      blocked: false,
      killingBlow: false,
      targetId: id,
      worldX: pos.x,
      worldZ: pos.z,
      nowMs,
    });
  }

  /** Fire the pooled layered impact kit (flash + sparks + smoke [+ ring]). */
  private layeredPop(
    x: number,
    z: number,
    nowMs: number,
    intensity: ImpactIntensity,
    tint: Rgb,
    /**
     * 接觸面高度（世界單位）。省略 = `HitSpark` 的預設胸口高度,這是死亡 /
     * 拾取 / 復活那些**發生在角色身上**的合成器該用的值。只有施法那一條要傳,
     * 因為只有它的另一層(技能美術)會跟著 `castHeightSource` 移動。
     */
    y?: number,
  ): void {
    // FIX #131 (root cause): the abilityCast/flowerBurst/reviveComplete paths
    // reach here after only a NULL check on their position — but `entityPos`
    // can return a truthy `{x:NaN,z:NaN}` for a mid-spawn / un-interpolated
    // entity. `play()` already refuses a non-finite emitter, but this composer
    // fire (the BRIGHTEST, white-hot additive core — "ex" on an EX cast) did
    // NOT, so an EX cast by a not-yet-posed champion parked a persistent white
    // burst at the GPU-clamped screen corner and RE-FIRED it every cast. Guard
    // the single chokepoint so every current and future caller is covered.
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.sparks.push(new HitSpark(this.scene, x, z, nowMs, intensity, 260, tint, y));
  }

  /** Live quality-tier particle budget (shared by every layer). */
  private budgetScale(): number {
    return particleBudgetScale(qualityController.getParams().particleDensity);
  }

  /** Remember an entity's aim so its next projectile knows where it's going. */
  private noteAim(id: number | undefined, dir: Vec2 | null): void {
    if (id === undefined || !dir) return;
    const len = Math.hypot(dir.x, dir.z);
    if (!(len > 0)) return;
    this.aim.set(id, { x: dir.x / len, z: dir.z / len });
  }

  /**
   * The DAMAGE VECTOR for a hit: attacker → victim in rendered space, falling
   * back to the attacker's last aim and finally to a fixed direction, so a
   * spray is always aimed at SOMETHING rather than degenerating to a ball.
   */
  private damageVector(
    source: number | undefined,
    target: number | undefined,
    hitPos: { x: number; z: number },
  ): Vec2 {
    const from = source !== undefined ? this.ctx.entityPos(source) : null;
    const remembered = source !== undefined ? this.aim.get(source) : undefined;
    return sprayDirection(from, hitPos, remembered ?? AIM_FALLBACK);
  }

  /**
   * 濺血: the directional spray for a landed hit. Style + intensity come from
   * the gore config, narrowed by the VICTIM's per-champion override (a
   * mechanical champion never bleeds red). Fires ALONGSIDE the impact kit.
   */
  private bloodSpray(
    pos: { x: number; z: number },
    dir: Vec2,
    amount: number,
    dmgType: "physical" | "magic" | "true",
    opts: { crit?: boolean; killingBlow?: boolean; target?: number },
    nowMs: number,
  ): void {
    const championId = opts.target !== undefined ? (this.ctx.championIdOf?.(opts.target) ?? null) : null;
    const gore = resolveGore(goreConfig(), championId);
    if (gore.style === "off") return; // OFF EMITS NOTHING — not even a decal
    this.blood.fire({
      x: pos.x,
      z: pos.z,
      dir,
      severity: severityForHit(amount, opts),
      style: gore.style,
      // magnitude within the band: a poke drips, a big swing sprays
      intensity: gore.intensity * (0.55 + 0.45 * damageScale(amount)),
      dmgType,
      scale: this.budgetScale(),
      nowMs,
    });
  }

  /**
   * Derive + spawn the #228 telegraph for one cast.
   *
   * Everything it needs is already on the wire (`abilityCast` carries
   * `point`/`direction`) or in the ability doc the client already loaded — so
   * the drawn shape is the same geometry `abilitySystem`/`CastResolveSystem`
   * query, at the same post-`abilityRange` size (#136/#125). A shape that
   * cannot be derived draws NOTHING and is a red `telegraphCoverage.test.ts`,
   * never a plausible-looking guess.
   */
  private spawnTelegraph(
    caster: number,
    def: TelegraphAbilityLike,
    pos: { x: number; z: number },
    point: { x: number; z: number } | undefined,
    direction: { x: number; z: number } | undefined,
    nowMs: number,
  ): void {
    const shape = resolveTelegraphShape(
      def,
      {
        casterX: pos.x,
        casterZ: pos.z,
        point: point ?? null,
        direction: direction ?? null,
      },
      {
        abilityRange: envFactor("abilityRange"),
        projectile: (id) => Projectiles.tryGet(id as ProjectileId) ?? null,
      },
    );
    if (!shape) return;
    // `CombatTextRelation` and `TelegraphRelation` are the same four-way axis
    // (self/ally/enemy/unknown); the annotation keeps them from drifting apart.
    const relation: TelegraphRelation = this.relationOf(caster);
    const windupMs = ((def as { castTimeSec?: number }).castTimeSec ?? 0) * 1000;
    this.telegraphLayer.begin(caster, shape, relation, windupMs, nowMs);
  }

  /**
   * ⚡ **一段電弧：從 A 打到 B。**
   *
   * 這是這一族視覺**唯一**的入口，而它只認識「兩個點」—— ⛔ 不認識鏈、不認識
   * 哪一支技能、也不排任何時序（第〇·五守則）。連鎖類技能的一條鏈是**逐跳**
   * 各叫一次，跳與跳之間的極小間隔由發出要求的那一側掌握；同一支方法也直接
   * 服務鎖鏈、牽引、電纜、雷擊補刀這些同型的東西。
   *
   * 高度預設在軀幹（`ARC_BODY_Y`）——「打在身上」比「爬過地板」讀得清楚，
   * 而呼叫端可以逐次指定 `y`（`from.y` / `to.y`）覆寫。
   */
  strikeArc(
    from: { x: number; z: number; y?: number },
    to: { x: number; z: number; y?: number },
    nowMs: number,
    opts: ArcBoltOptions & { tint?: Rgb; seed?: number } = {},
  ): number {
    if (!isFinitePos(from) || !isFinitePos(to)) return 0; // #131：非有限座標一律不畫
    const spec = arcBoltSpec(opts.tint ?? ARC_TINTS.lightning, opts);
    return this.arcs.strike(
      { x: from.x, y: from.y ?? ARC_BODY_Y, z: from.z },
      { x: to.x, y: to.y ?? ARC_BODY_Y, z: to.z },
      spec,
      nowMs,
      opts.seed,
    );
  }

  handleEvent(ev: EventMessage, nowMs: number): void {
    // ⭐ GH#838 —— 演出腳本的觸發器抽取。⛔ 不會迴圈：播放器合成的事件型別
    //    （modelFxSpawn/vfxSpawn/…）不在它自己的觸發器集合裡。
    this.scriptPlayer.onEvent(ev, nowMs);
    switch (ev.type) {
      case "abilityCast": {
        const abilityId = ev.data.abilityId as string | undefined;
        const def = abilityId ? Abilities.tryGet(abilityId as AbilityId) : undefined;
        const point = ev.data.point as { x: number; z: number } | undefined;
        const caster = ev.data.caster as number | undefined;
        const pos = caster !== undefined ? this.ctx.entityPos(caster) : null;
        // ---- UNIVERSAL CAST TELEGRAPH (task #228) --------------------------
        // Every cast, every castType, derived from the ability doc — no longer
        // "whatever happened to carry a `point`" (which drew a FABRICATED
        // 0.72 u ring on 93 single-target cells and nothing at all on the 118
        // self/skillshot/dash ones). See telegraphShape.ts for the honesty
        // rules; the fill comes from the cast bar, not a local clock.
        if (typeof caster === "number" && def && isFinitePos(pos)) {
          this.spawnTelegraph(caster, def, pos, point, ev.data.direction as
            | { x: number; z: number }
            | undefined, nowMs);
        }
        // ⭐⭐ GH#741（舊 #42）—— **EX 的變暗／去飽和 backdrop。**
        //
        // 推鏡（`CameraRig.exPunchIn`）2026 年初就上線了,而「畫面壓暗」那一半
        // 從來沒有消費端。⛔ 它**不**跟著上面的 `isFinitePos(pos)` 走:壓暗是
        // 螢幕空間的,施法者的世界座標算不出來（剛生成、剛換場）**不該**讓
        // 特寫的另一半消失。⇒ 放在那道 break 的**前面**。
        //
        // ⚠️ 觀眾判定與 `combatFeedback.wantsExPunch` **同一條**:只有**本機自己**
        // 的 EX 壓暗。⛔ 廣播每一個人的 EX = 團戰時畫面整場是暗的。
        // ⚠️ 節流交給 `ScreenFxLayer.exDim()`（重放而不是疊加）。
        if (ev.data.slot === "EX" && caster !== undefined && caster === (this.ctx.localEntityId?.() ?? null))
          this.screenFx.exDim();
        // FIX #131: a null OR non-finite caster position spawns nothing — an
        // un-interpolated {x:NaN} would otherwise park the EX white-hot pop
        // (layeredPop) off-world at a screen corner.
        if (!isFinitePos(pos)) break;
        // remember where this cast was aimed — the muzzle flash of any
        // projectile it spawns reads the direction back off this
        const dir = ev.data.direction as { x: number; z: number } | undefined;
        this.noteAim(caster, dir ?? (point ? { x: point.x - pos.x, z: point.z - pos.z } : null));
        // #377 —— 這一次施法的**世界方位角**。三條來源按可信度排:事件自己帶的
        // `direction`(技能射線)> caster→落點 > 這名施法者上一次瞄的方向
        // (`noteAim` 剛剛才更新過,所以 self / dash 這些不帶方向的 castType
        // 也指得出一個方向,而不是退回「永遠朝 +Z」)。三條都沒有 = null =
        // 文件保留自己寫的角度,⛔ 不是憑空編一個。
        const aim = dir ?? (point ? { x: point.x - pos.x, z: point.z - pos.z } : null) ??
          (caster !== undefined ? (this.aim.get(caster) ?? null) : null);
        const aimYawDeg = aim ? yawDegToward(aim.x, aim.z) : null;
        const doc = this.doc(def?.vfxKey);
        // 這一招的家族列 —— 高度（#251）與地面痕跡（GH#439）都從這裡讀，
        // ⛔ 不是各自再查一次（兩次查詢 = 兩個會漂開的答案）。
        const art = w3xArtFor(def?.id);
        // EX = the fight-defining cast: scale the doc's burst up AND layer the
        // max-intensity pop (core flash + streaks + smoke + ground shockwave),
        // tinted from the ability's own color so its identity is preserved.
        const isEx = def?.slot === "EX";
        // #251 —— 打擊感那一層要和技能美術**同一個高度**。它以前吃 `HitSpark`
        // 的預設 y=1.0,而技能美術現在會依 `castHeightSource` 貼回地板,兩層就
        // 會在畫面上脫開。這個後果不是我發現的:`familyCastOnScreen.test.ts`
        // 的檔頭在 2026-07-30 就寫下「接 heightY 的那個 PR 要一起處理
        // layeredPop 的高度」—— 這裡就是那一行。
        if (isEx) {
          this.layeredPop(
            pos.x,
            pos.z,
            nowMs,
            "ex",
            doc ? tintOfDoc(doc) : EX_DEFAULT_TINT,
            familyCastHeightY(art),
          );
        }
        // #205 多層特效模板。`isLegacySingleVfx` 為真 = 這份 doc 只有舊的單值
        // `vfxKey`,`layers` 保持 null,`playCastVfx` 走的是升級前一字未改的那
        // 條路 —— 646 支現有技能的向後相容是靠這個分支,不是靠新程式碼「碰巧
        // 算出一樣的結果」。
        // ⭐ GH#529 —— 綁定表要在 legacy 判斷**之前**套用:一支只有舊式單值
        // `vfxKey` 的技能,被綁定表換成原作那一組之後就**不再是** legacy 了。
        // 順序反了 = 綁定表逐位元組等於不存在(而畫面看起來完全正常)。
        const vfxSrc = abilityVfxSourceFor(def as AbilityVfxSource | undefined, def?.id);
        const layers = isLegacySingleVfx(vfxSrc)
          ? null
          : castLayersFor(def as AbilityVfxSource | undefined, maxAbilityVfxLayers(), def?.id);
        this.playCastVfx(
          def?.id,
          doc,
          pos,
          nowMs,
          isEx ? EX_BURST_BOOST : 1,
          layers,
          point,
          aimYawDeg,
          // GH#392 —— 施法者。帶掛點的技能靠它找到 `champ-<id>` 節點。
          typeof caster === "number" ? caster : undefined,
        );
        // ⚡⚡ GH#571 —— **雷神之槌／皮卡丘那一族的閃電**。
        //
        // 上一輪接上的是「鏈」那一種（`case "chainLightning"`），而**只有兩支**
        // 技能在用它（86-04 打雷絕招 / 65-04 天譴＝飛鼠先生）。帶著
        // `fx.prim.lightning.*` 的技能有 **28 支**，它們的「閃電」逐字只是一份
        // **粒子預設** —— 粒子做不出一道有分岔的鋸齒電弧。
        // ⇒ owner 點名的三個例子裡有兩個（皮卡丘 58-xx、雷神之槌 15-01）到這一行
        //   出現之前仍然沒有電弧。這一行接上 **28/28**（11 道直擊 + 17 道爆散）。
        //
        // ⭐ 一條**家族規則**，⛔ 不是 26 個 `if` 也⛔ 不是 26 份 JSON：
        //   決定權在 `arcCastPlan` 的那張表（`arcBolt.ts`），這裡只負責把
        //   「這次施法用到哪幾個 vfxKey」與兩個世界座標交給它。
        //   ⚠️ 26 份 JSON 那條路本來就走不通 —— 其中 8 份（含雷神之槌）是
        //   `tools/skill-remake/batch1.py` 的產物，手改會被下一次 sync 覆寫。
        //
        // 種子與 `chainLightning` 同一條公式（tick + 施法者）：決定性，
        // 所以同一場重播長出同一條折線，⛔ 而且這裡沒有 `Math.random`。
        const arcKeys: (string | null | undefined)[] = layers ? layers.map((l) => l.vfxKey) : [];
        arcKeys.push(vfxSrc?.vfxKey);
        const arcSeed = ((ev.tick | 0) * 131 + (typeof caster === "number" ? caster : 0) * 17) | 0;
        for (const req of arcCastPlan(arcKeys, pos, point, arcSeed, ARC_BODY_Y)) {
          this.strikeArc(req.from, req.to, nowMs, {
            tint: req.tint,
            power: req.power,
            forks: req.forks,
            seed: req.seed,
          });
        }
        // GROUND SCORCH (task #147): stamp a fading dark mark where the ability
        // lands (its ground `point` when it targets the floor) or, failing that,
        // under the caster — so a cast scars the arena instead of leaving it
        // pristine. Pooled + hard-capped like the blood splats.
        //
        // GH#439 —— **哪一種**痕跡由這一招所屬的家族說了算（`groundDecal`）。
        // 在此之前這一行對 661 支技能回同一張焦痕，所以「地面震裂」在畫面上
        // 不存在,而且⛔ 沒有任何一格後台改得到它。`null` = 這一族說了不留痕跡。
        const markX = point && isFinitePos(point) ? point.x : pos.x;
        const markZ = point && isFinitePos(point) ? point.z : pos.z;
        const decal = castScorchSpec(def?.radius ?? CAST_SCORCH_RADIUS, art?.groundDecal);
        if (decal) this.castDecals.spawn(markX, markZ, decal, nowMs);
        break;
      }
      // ---- CAST TELEGRAPH: the 0.6 s light pillar ------------------------
      // 「施展技能的時候都要帶一段 0.6秒的施展光柱光芒來提示」. Driven by the
      // AUTHORITATIVE cast window, never a timer of our own: `castBegin`
      // carries the sim's `castTimeSec` (and its exact tick count as the
      // fallback), so the column rises and intensifies across the REAL window
      // for any cast length. MatchRoom fans these three events out to every
      // client — the same stream the overhead cast bar rides — so the pillar
      // appears for EVERY champion, which is the whole point: the victim is
      // the one who has to see it.
      //
      // An ability with NO cast time emits no `castBegin` at all and therefore
      // gets no pillar. That is deliberate: a telegraph for a window that does
      // not exist would be a lie about a dodge the victim cannot make.
      case "castBegin": {
        const caster = ev.data.caster as number | undefined;
        if (typeof caster !== "number") break;
        const secs = typeof ev.data.castTimeSec === "number" ? ev.data.castTimeSec : 0;
        const ticks = typeof ev.data.ticks === "number" ? ev.data.ticks : 0;
        const durationMs = secs > 0 ? secs * 1000 : ticks * TICK_MS;
        if (!(durationMs > 0)) break;
        this.pillars.begin(caster, durationMs, this.pillarPaletteFor(ev.data.abilityId as string | undefined), nowMs);
        break;
      }
      // resolved → a short outward release flash on the frame the effects land
      case "castEnd": {
        const caster = ev.data.caster as number | undefined;
        if (typeof caster === "number") {
          this.pillars.finish(caster, nowMs);
          // the ground shape pops on the SAME frame the sim runs the effects
          this.telegraphLayer.resolve(caster, nowMs);
        }
        break;
      }
      // stunned / knocked down / killed mid-cast → snuffed, never a flash.
      // A pillar that keeps burning after an interrupt is a lie.
      case "castInterrupt": {
        const caster = ev.data.caster as number | undefined;
        if (typeof caster === "number") {
          this.pillars.interrupt(caster, nowMs);
          // …and neither may the ground shape. Before #228 nothing removed a
          // telegraph, so a stunned caster's ring kept filling and still fired
          // its "it lands HERE" resolve pop for damage that never happened.
          this.telegraphLayer.interrupt(caster);
        }
        break;
      }
      // `basicAttackHit` is the RANGED AUTO's impact — the same shape as an
      // ability projectile landing, and it used to fall through to `default`,
      // so a ranged auto arrived with no arrival at all (task #60).
      case "projectileHit":
      case "basicAttackHit": {
        const target = ev.data.target as number | undefined;
        const pos = target !== undefined ? this.ctx.entityPos(target) : null;
        if (!isFinitePos(pos)) break; // #131
        const projectileId = ev.data.projectileId as string | undefined;
        const projDef = projectileId ? Projectiles.tryGet(projectileId as ProjectileId) : undefined;
        const doc = this.doc(projDef?.vfxKey);
        // landed hits ALSO get the layered pop via `hitImpact` (sim fires it
        // for every hit) — no second layer here, only the doc-less fallback
        if (doc) this.play(doc, pos.x, pos.z, nowMs);
        else this.sparks.push(new HitSpark(this.scene, pos.x, pos.z, nowMs));
        break;
      }
      // A missile that expired on a wall / at max range: a small FIZZLE so the
      // shot resolves visually instead of blinking out. `hit` is true when the
      // same event ends a projectile that already connected — that one keeps
      // its impact fx and gets nothing extra here.
      case "projectileEnd": {
        if (ev.data.hit) break;
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break; // #131
        this.sparks.push(new HitSpark(this.scene, x, z, nowMs, false, 140));
        break;
      }
      // FLOATING COMBAT TEXT (task #92). One code path for all four categories
      // the request names: 造成傷害 and 受到傷害 are the SAME `damage` event
      // split by whether the local player is the source or the target, and
      // 補血/補魔 arrive on the sim events added for this task.
      //
      // A fully-blocked hit (amount 0) is deliberately NOT skipped when it
      // landed on YOU — "that was absorbed" is information; a 0 on someone
      // else's body is not, and combatTextCategory drops it.
      case "damage": {
        const target = ev.data.target as number | undefined;
        const amount = ev.data.amount as number | undefined;
        if (amount === undefined) break;
        const blocked = Boolean(ev.data.blocked);
        if (amount <= 0 && !blocked) break;
        const pos = this.posFromEvent(ev, target);
        if (pos && target !== undefined) {
          pushCombatText({
            kind: "damage",
            amount,
            sourceRel: this.relationOf(ev.data.source as number | undefined),
            targetRel: this.relationOf(target),
            crit: Boolean(ev.data.crit),
            blocked,
            killingBlow: Boolean(ev.data.killingBlow),
            targetId: target,
            worldX: pos.x,
            worldZ: pos.z,
            nowMs,
            // 魔法傷害 overlay (owner 2026-07-31) — same `dmgType` hitImpact
            // already reads off this event for IMPACT_TINTS, just not
            // previously threaded through to the floating number.
            dmgType: normalizeDmgType(ev.data.dmgType),
          });
        }
        break;
      }
      // 補血 / 補魔 — see packages/shared/src/sim/combat/restore.ts. Discrete
      // restores only (ability heals, `restore` percentages, lifesteal, flower
      // bursts); per-tick passive regen is never emitted, so this cannot become
      // a 30 Hz stream of "+0" over every champion on the field.
      case "heal":
      case "manaRestore": {
        const target = ev.data.target as number | undefined;
        const amount = ev.data.amount as number | undefined;
        if (target === undefined || amount === undefined || amount <= 0) break;
        const pos = this.posFromEvent(ev, target);
        if (!pos) break;
        pushCombatText({
          kind: ev.type === "heal" ? "heal" : "mana",
          amount,
          sourceRel: this.relationOf(ev.data.source as number | undefined),
          targetRel: this.relationOf(target),
          crit: false,
          blocked: false,
          killingBlow: false,
          targetId: target,
          worldX: pos.x,
          worldZ: pos.z,
          nowMs,
        });
        break;
      }
      // ⭐ GH#411 —— 扣魔。`manaRestore` 的**鏡像**，共用同一條 `pushCombatText`
      // 管線與同一個 `mana` category，差別只有一格 `label`：那個 category 的字首
      // 寫死是 `+`，而少掉的東西必須讀起來像少掉。沒有這一段，71-00 暗夜契約的
      // 【魔力全失】就是一整條藍條在一個 tick 內無聲清空（sim/effects/spendMana.ts
      // 的 VISIBILITY 段），而風王結界的每擊扣魔同樣一個字都沒有。
      case "manaSpend": {
        const target = ev.data.target as number | undefined;
        const amount = ev.data.amount as number | undefined;
        if (target === undefined || amount === undefined || !(amount > 0)) break;
        const pos = this.posFromEvent(ev, target);
        if (!pos) break;
        pushCombatText({
          kind: "mana",
          amount,
          label: `-${Math.round(amount)}`,
          sourceRel: this.relationOf(ev.data.source as number | undefined),
          targetRel: this.relationOf(target),
          crit: false,
          blocked: false,
          killingBlow: false,
          targetId: target,
          worldX: pos.x,
          worldZ: pos.z,
          nowMs,
        });
        break;
      }
      // ⭐ GH#406 —— 交換筆記本（44-002）：**兩具身上各一個變化量**。
      // `swapResource` 刻意繞開傷害／治療佇列，所以既有的飄字一個都不會出現 ——
      // 玩家看到的只有兩條血條突然對調，跟一次掉包或一個 bug 無法區分。
      case "resourceSwap": {
        const isMana = ev.data.resource === "mana";
        const caster = ev.data.caster;
        this.pushSwapDelta(caster, ev.data.fromCaster, ev.data.toCaster, isMana, caster, nowMs);
        this.pushSwapDelta(ev.data.target, ev.data.fromTarget, ev.data.toTarget, isMana, caster, nowMs);
        break;
      }
      // IMPACT PARTICLES by dmgType (fires alongside `damage` on any landed hit;
      // hitImpact is the sim's dedicated "impact frame" timing event).
      case "hitImpact": {
        const target = ev.data.target as number | undefined;
        const source = ev.data.source as number | undefined;
        const pos = this.posFromEvent(ev, target ?? source);
        if (!isFinitePos(pos)) break;
        const dmgType = normalizeDmgType(ev.data.dmgType);
        const heavy = Boolean(ev.data.crit) || Boolean(ev.data.killingBlow);
        const amount = typeof ev.data.amount === "number" ? ev.data.amount : 0;
        const dir = this.damageVector(source, target, pos);
        // CONTACT-POINT SPARK (audit P1): bloom the spark at the strike SURFACE
        // facing the attacker, not the victim's centre of mass.
        const contact = contactPoint(pos, dir);
        // The sim's ImpactProfile resolves the DISTINCT spark identity
        // (block/counter/magic/ice/heavy/hit — content `hitFeel`-overridable);
        // fall back to the legacy blocked/heavy/type read for a pre-#133 replay.
        const profile = asImpactProfile(ev.data.profile);
        const kind: SparkKind = profile
          ? profile.sparkKind
          : ev.data.blocked
            ? "block"
            : heavy
              ? "heavy"
              : dmgType === "magic"
                ? "magic"
                : "hit";
        const isBlock = kind === "block" || Boolean(ev.data.blocked);
        const { tint, intensity } = sparkStyleFor(kind, dmgType);
        this.sparks.push(
          // 🔵 GH#617 —— **最後那個 `amount` 是承重的**:少了它,五級距加速逐位元
          //    等於不存在(失敗形態②:算出來了但從沒送到播放端)。
          new HitSpark(
            this.scene,
            contact.x,
            contact.z,
            nowMs,
            intensity,
            260,
            tint,
            CONTACT_Y,
            amount,
          ),
        );
        // BLOCKED (task #39): a guard is metal on metal — the cool-white spark
        // above PLUS a spark fan REBOUNDING at the attacker, and NO blood.
        if (isBlock) {
          this.feedback.block({
            x: contact.x,
            z: contact.z,
            dir,
            power: 0.5 + 0.5 * damageScale(amount),
            scale: this.budgetScale(),
            nowMs,
          });
          break;
        }
        // …and the 濺血 layer on the SAME frame, never instead of the kit
        this.bloodSpray(
          pos,
          dir,
          amount,
          dmgType,
          { crit: Boolean(ev.data.crit), killingBlow: Boolean(ev.data.killingBlow), target },
          nowMs,
        );
        break;
      }
      // MUZZLE FLASH at the cast origin (task #39): projectiles used to appear
      // out of thin air. The payload carries no direction, so the owner's last
      // committed aim (ability direction / basic-attack target) supplies it.
      case "projectileSpawn": {
        const owner = ev.data.owner as number | undefined;
        const pos = owner !== undefined ? this.ctx.entityPos(owner) : null;
        if (!pos) break;
        const dir = (owner !== undefined ? this.aim.get(owner) : undefined) ?? AIM_FALLBACK;
        this.feedback.muzzle({ x: pos.x, z: pos.z, dir, scale: this.budgetScale(), nowMs });
        break;
      }
      // a basic attack commits an aim (used by the muzzle flash of the
      // projectile a ranged attack spawns a frame later)
      case "basicAttack":
      case "attackWindup": {
        const source = ev.data.source as number | undefined;
        const targetId = ev.data.target as number | undefined;
        const from = source !== undefined ? this.ctx.entityPos(source) : null;
        const to = targetId !== undefined ? this.ctx.entityPos(targetId) : null;
        if (from && to) this.noteAim(source, { x: to.x - from.x, z: to.z - from.z });
        break;
      }
      // LANDING DUST (task #39): a body slamming into the floor had no floor
      // reaction at all. The payload carries the impact point directly.
      case "knockdown": {
        const pos = this.posFromEvent(ev, ev.data.target as number | undefined);
        if (!pos) break;
        this.feedback.landingDust({ x: pos.x, z: pos.z, scale: this.budgetScale(), nowMs });
        break;
      }
      // 破防 guardBreak — a bigger cool-white shatter pop.
      case "guardBreak": {
        const pos = this.posFromEvent(ev, ev.data.target as number | undefined);
        if (pos) this.sparks.push(new HitSpark(this.scene, pos.x, pos.z, nowMs, true, 280, [0.9, 0.95, 1]));
        break;
      }
      case "death": {
        const id = ev.data.id as number | undefined;
        if (id !== undefined) {
          this.aim.delete(id); // aim memory dies with the entity
          this.status.forget(id); // …and so does any CC aura it was wearing
          // dying mid-cast snuffs the column even if the sim's castInterrupt
          // is dropped on the wire — a pillar over a corpse is the worst lie
          // of all (it says "still coming" about damage that never will)
          this.pillars.interrupt(id, nowMs);
          // …same reasoning for the ground shape (task #228)
          this.telegraphLayer.interrupt(id);
        }
        const pos = id !== undefined ? this.ctx.entityPos(id) : null;
        if (!isFinitePos(pos)) break; // #131
        // the ground under a corpse (the killing blow's own hitImpact already
        // sprayed the crit-grade blood on the previous frame)
        this.feedback.landingDust({ x: pos.x, z: pos.z, power: 0.75, scale: this.budgetScale(), nowMs });
        // a kill is the loudest moment in the fight: EX-grade layered pop
        // (white-hot core + ember streaks + ground shockwave) on the SAME
        // frame as the ash plume — never the old lone gray puff
        this.layeredPop(pos.x, pos.z, nowMs, "ex", DEATH_TINT);
        this.play(DEATH_SMOKE, pos.x, pos.z, nowMs);
        break;
      }
      // healing flowers (task #34): both events carry the flower's x/z
      // directly (the entity may already be despawned on burst)
      case "flowerSpawn": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (x === undefined || z === undefined) break;
        // low-stakes cue: the dirt-kick doc alone (no layered pop to pay for)
        this.play(this.doc(FLOWER_SPAWN_VFX), x, z, nowMs, 0.4);
        break;
      }
      case "flowerBurst": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (x === undefined || z === undefined) break;
        // heal pickup: green core flash + ground ring from the composer under
        // the rising green mote burst (doc-less → the pop alone still reads)
        this.layeredPop(x, z, nowMs, "heavy", HEAL_TINT);
        this.play(this.doc(FLOWER_BURST_VFX), x, z, nowMs, 0.9);
        break;
      }
      // ⭐ GH#494 —— 殭屍死掉掉小金幣（owner 2026-08-21：「提高爽度 模仿肉鴿遊戲的
      // 氛圍感」）。⛔ 這裡**沒有讀 `ev.data.gold`**，而且不可以讀：賞金在伺服器的
      // `sim/systems/MobSystem.ts` 就發完了，這一層只是把那一刻畫出來。一旦金幣的
      // 顆數或軌跡開始跟金額有關，畫面就變成經濟的第二個描述，而兩個描述遲早打架。
      case "mobSlain": {
        const id = ev.data.id as number | undefined;
        const killer = ev.data.killer as number | null | undefined;
        if (typeof id !== "number") break;
        // `killer === null` = 火圈／環境擊殺：沒有人可以吸，什麼都不畫。
        // `gold` 原封不動交出去，而那一層**一行都不讀**（守衛在 feelFx.test.ts）。
        this.gold.spawn(
          { mobId: id, killer: typeof killer === "number" ? killer : null, gold: ev.data.gold as number | undefined },
          nowMs,
        );
        break;
      }
      // ⭐ GH#494 第五段 —— 連段音階。**數字來自 sim**（sim/combat/killCombo.ts 用
      // `world.tick` 量 5 秒視窗），⛔ 客戶端不自己數：同一 tick 的 AoE 連殺在網路上
      // 是一批事件，用到達時間分辨「一次橫掃」與「兩次擊殺」是猜的。
      // 這一層只把數字翻成音高，⛔ 不影響 HUD 上那個連殺數字，也不影響任何結算。
      case "killCombo": {
        const killer = ev.data.killer as number | undefined;
        const count = ev.data.count as number | undefined;
        if (typeof killer !== "number" || typeof count !== "number") break;
        this.gold.noteCombo(killer, count, nowMs);
        break;
      }
      // 陣亡投幣 (task #191). Both events carry x/z BECAUSE the entity is gone
      // (or, on the drop, has only just appeared): the pickup destroys the coin
      // in the same sim tick it pays out, so there is nothing left to anchor to.
      case "coinDropped": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        // a small gold flare where it lands — the coin's own view carries the
        // steady 閃光, so this is only the arrival beat
        this.layeredPop(x, z, nowMs, "light", COIN_TINT);
        break;
      }
      case "coinPickedUp": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        // 撿到金幣 — a bright gold nova, the kill-grade pop, because someone just
        // walked off with a hundred gold and that should be unmissable.
        this.layeredPop(x, z, nowMs, "ex", COIN_TINT);
        break;
      }
      // 鍊金術之盾 (godie-i06q). Both of these are ANCHORED ON A LIVE ENTITY
      // rather than on x/z, and that is the difference from the coin pair above:
      // a coin is destroyed in the same tick it pays out, whereas the taunter and
      // the payee are both still standing when the event arrives.
      //
      // 嘲弄 —— 「每秒吸引周圍敵人優先攻擊自己」. This is the ONLY thing a client
      // can see: the pull lives in `world.taunt` (a sim-side Map, no snapshot
      // field, no ENTITY_FLAG bit — sim/taunt.ts DECISION 1), so with no ring
      // here the mechanic is enemies mysteriously changing their minds.
      // `source` is the TAUNTER; the pulled bodies' ids are not on the payload.
      case "taunt": {
        const source = ev.data.source as number | undefined;
        const pos = source !== undefined ? this.ctx.entityPos(source) : null;
        if (!isFinitePos(pos)) break;
        // The ring reads as 「來打我」 and the pop gives it weight. `heavy`, not
        // `ex`: a taunt is loud, but it is not a kill and must not out-shout one.
        this.layeredPop(pos.x, pos.z, nowMs, "heavy", TAUNT_TINT);
        this.play(this.doc(TAUNT_VFX), pos.x, pos.z, nowMs, 0.5);
        break;
      }
      // 煉金術 —— 「將 HP 低於 5% 的敵人變成黃金」. The AMOUNT is not drawn here on
      // purpose: the purse is replicated (`SeatState.gold`) and the HUD already
      // paints it, so this supplies only the half that was missing — the WHEN.
      // Two renderers of one number would be two chances to disagree.
      //
      // ⚠️ `target` is the PAYEE, not the transmuted victim (grantGold.ts loops
      // over payees). The victim's id never crosses the wire, so the burst
      // cannot be put on the body that turned into gold.
      case "goldGrant": {
        const payee = ev.data.target as number | undefined;
        const amount = ev.data.amount as number | undefined;
        // ⚠️ THIS COMMENT HAS BEEN WRONG TWICE (第三守則). Current, measured:
        //
        //   A ZERO PAYOUT **IS** SOMETHING THE SIM EMITS.
        //
        // `sim/effects/grantGold.ts` does `if (amount <= 0) return;` before its
        // emit loop — but that gate reads the REQUESTED amount, and since the
        // 金錢發放倍率 round (owner 2026-08-04) the event carries the PAID one.
        // With 「打一般殭屍發放倍率」 set to 0, transmuting a level-3 zombie is
        // requested=3 (passes the gate) → paid=0 → `goldGrant { amount: 0 }`
        // really crosses the wire. Measured in
        // packages/shared/src/sim/alchemyShieldShipped.test.ts.
        //
        // (The previous version of this comment said the opposite in as many
        // words, and it was self-consistent with the paired test's title — both
        // are corrected. The version before THAT claimed the zombie case paid
        // `flat` alone, which was also false. Two different wrong stories about
        // the same three lines is why this one cites a test that runs.)
        //
        // So the branch below now guards TWO things, and both are real:
        //   · a malformed / renamed wire payload;
        //   · a legitimate 0-gold grant — the purse did not move, so a coin
        //     burst would be the display lying (owner 2026-08-04「顯示不說謊」).
        if (typeof amount !== "number" || !(amount > 0)) break;
        const pos = payee !== undefined ? this.ctx.entityPos(payee) : null;
        if (!isFinitePos(pos)) break;
        this.layeredPop(pos.x, pos.z, nowMs, "heavy", COIN_TINT);
        this.play(this.doc(GOLD_GRANT_VFX), pos.x, pos.z, nowMs, 1.1);
        break;
      }
      // revive circles (task #84): the events carry the circle's own x/z, so
      // the cue plays even though the entity is already gone on complete/end.
      case "reviveCircleSpawn": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (x === undefined || z === undefined) break;
        this.play(this.doc(REVIVE_SPAWN_VFX), x, z, nowMs, 0.5);
        break;
      }
      case "reviveComplete": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (x === undefined || z === undefined) break;
        // a rescue undoes a kill, so it gets a kill's weight
        this.layeredPop(x, z, nowMs, "ex", REVIVE_TINT);
        this.play(this.doc(REVIVE_COMPLETE_VFX), x, z, nowMs, 1);
        break;
      }
      // `reviveCircleEnd` is deliberately SILENT: a circle burning out is a
      // non-event and must not read as if something landed.

      // NEUTRAL GUARDIAN (task #89). The PRE-LAND punish telegraph: a ground
      // ring at every marked target that FILLS over the exact wind-up window
      // (impactTick − now), so a player can SEE the volley coming and step out —
      // consistent with the cast-telegraph contract (a dodge you cannot see is
      // not a dodge). `radius` is the post-abilityRange value (#125), so the ring
      // is exactly where the damage query will hit.
      case "guardianMark": {
        const targets = ev.data.targets as { x: number; z: number }[] | undefined;
        if (!Array.isArray(targets)) break;
        const radius = typeof ev.data.radius === "number" ? ev.data.radius : 3;
        const impactTick = typeof ev.data.impactTick === "number" ? ev.data.impactTick : ev.tick;
        const windupMs = Math.max(1, (impactTick - ev.tick) * TICK_MS);
        // ⭐ GH#567 —— 來源指引。owner 2026-08-23:「請補上該物件**伸縮抖一下**
        // 然後出現**投射物飛向被攻擊方**的攻擊效果吧」。
        //
        // ⚠️ 圈與球必須說**同一句話**：`volleyTiming` 從同一個 `windupMs` 切出
        // 「蓄力」與「飛行」，兩段加起來恰好等於圈填滿的時間，所以球在傷害落地
        // 的那一幀到站。⛔ 給球一格速度就會讓兩個訊號互相矛盾。
        const guardianId = ev.data.id as number | undefined;
        const muzzle = guardianId !== undefined ? this.ctx.entityPos(guardianId) : null;
        if (guardianId !== undefined && muzzle) {
          pulseGuardian(guardianId, nowMs, volleyTiming(windupMs).launchMs, "fire");
        }
        for (const t of targets) {
          if (!isFinitePos(t)) continue;
          // Same DANGER channel as an enemy champion's cast (#228): a neutral
          // guardian's volley is incoming damage to whoever is standing in it,
          // and one colour language for "get out" beats two.
          this.telegraphs.push(
            new Telegraph(this.scene, t.x, t.z, radius, nowMs, windupMs, undefined, {
              palette: telegraphPaletteFor("enemy"),
            }),
          );
          // ⛔ 沒有塔的座標時**不畫球**（⛔ 不要退回一個猜的原點）—— 一顆從錯的
          // 地方飛出來的球比沒有球更糟：它會指著一個沒有東西的方向。
          if (muzzle) this.guardianVolley.fire(muzzle, t, nowMs, windupMs);
        }
        break;
      }
      // the volley LANDS: a hit pop at the guardian's centre (the marks already
      // paid off their own resolve shockwave when their telegraphs fired).
      case "guardianImpact": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        this.layeredPop(x, z, nowMs, "heavy", GUARDIAN_TINT);
        break;
      }
      // ⭐ GH#567 —— 「它醒了」。這個事件在此之前是**零消費端**：sim 每次都發、
      // eventFanout 也放行，而畫面上什麼都不會發生（失敗形態②）。而「這座塔現在
      // 會還手了」正是玩家需要先知道的那一件事 —— 不知道它醒了，第一輪齊射就
      // 一定讀成「隱形英雄」。
      //
      // ⚠️ 幅度只有發射動作的一半（`wakeScale`）：醒來是一個**狀態改變**，
      // ⛔ 不可以看起來像一次攻擊（那會讓人往旁邊跳而其實沒事）。
      case "guardianWake": {
        const id = ev.data.id as number | undefined;
        if (id === undefined) break;
        pulseGuardian(id, nowMs, WAKE_MS, "wake");
        break;
      }
      // the guardian was SLAIN (last-hit reward, task #89) — a kill-grade pop so
      // the payoff moment reads as loudly as a champion kill.
      case "guardianSlain": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        this.layeredPop(x, z, nowMs, "ex", GUARDIAN_TINT);
        break;
      }
      // the 鎮守之力 heir buff FIRED an AoE pulse (task #89): a light aura pop at
      // the bearer so the invisible enemies-only volley reads as a real burst of
      // guardian power radiating off the buff-holder — otherwise the damage lands
      // with no visual and looks like nothing happened. Kept at "light" (not the
      // "heavy" impact / "ex" slain pops) because it RECURS every volley period —
      // a loud pop each tick would fatigue rather than inform.
      case "guardianHeirPulse": {
        const x = ev.data.x as number | undefined;
        const z = ev.data.z as number | undefined;
        if (typeof x !== "number" || typeof z !== "number" || !isFinitePos({ x, z })) break;
        this.layeredPop(x, z, nowMs, "light", GUARDIAN_TINT);
        break;
      }

      // WC3 dummy-effect-unit one-shots (task #9): the sim's spawnVfx effect
      // emits a world point + a vfx@1 doc id — play the doc there (HitSpark as
      // the doc-less fallback, matching projectileHit).
      //
      // ⭐ GH#649/#565 —— `attach` 有值（`at:"bone"`）時改掛**施法者模型的骨頭**：
      //    `resolveAttachment` 走 WC3 的正規化＋fallback 鏈（hand→weapon→chest→
      //    origin），所以 19 種原始寫法都解得開。⚠️ 替身骨架（體素替身、模型還在
      //    載）沒有對應骨 ⇒ **退回胸口高度並記 log**，⛔ 不是不畫。
      //    payload 型別＝sim emit 站旁邊的 `VfxSpawnEvent`（GH#608），
      //    ⛔ 這裡不 `as` 任何 sim 沒送過的欄位（失敗形態⑧）。
      case "vfxSpawn": {
        const data = ev.data as Partial<VfxSpawnEvent>;
        const x = data.x;
        const z = data.z;
        if (x === undefined || z === undefined || !isFinitePos({ x, z })) break; // #131
        const vfxId = data.vfxId;
        // ⭐ GH#661 —— 【移動拖曳光束】的心跳。判準是「這個 id 是不是一份
        //    `ribbon@1`」，⛔ 不是一張名單、⛔ 更不是任何技能 id 的 if。
        //    ⚠️ 在這一行之前，把 `spawnVfx.vfxId` 指到一份緞帶文件是**靜靜的
        //    no-op**：`VfxDefs` 查不到 ⇒ 掉到下面的 `HitSpark` 退路，於是畫面上
        //    出現一顆與「條件沒成立」長得一模一樣的火花（失敗形態②）。
        //    ⭐ `break` 是承重的：認領了就⛔ 不要再走定點那條路，否則同一則
        //    心跳會既拖曳、又每 0.25 秒噴一顆火花。
        if (this.moveTrail.mark(vfxId, data.caster, nowMs, data.durationSec)) break;
        const doc = this.doc(vfxId);
        const anchor =
          typeof data.attach === "string"
            ? this.boneSpawnPos(data.attach, data.caster, x, z)
            : { x, y: 1.0, z };
        // ⭐ GH#641 —— 一次性特效也認 `orient.yawFrom:"aim"`。在此之前只有施法
        //    階梯那條路會走 `applyAimYaw`，於是 hook／道具觸發的 spawnVfx 一律朝
        //    世界方向噴 ——「受傷角色**背後**大量噴血」在文件裡寫不出來。
        //    瞄準向量＝發射者（攻擊者）→ 落點（受害者），正是這一下的行進方向，
        //    所以錐口指向受害者背後。⛔ 這裡沒有任何道具/技能 id 的 if：文件宣告
        //    aim 才轉（`applyAimYaw` 對其餘文件回傳同一個物件 = 一位元不差的舊路）；
        //    發射者位置未知 → null → 世界方位（退路，⛔ 不是不畫）。
        if (doc) {
          const cpos = data.caster !== undefined ? this.ctx.entityPos(data.caster) : null;
          const aimYaw = cpos ? yawDegToward(x - cpos.x, z - cpos.z) : null;
          // ⭐ GH#838 —— 演出腳本可以逐段覆寫這一發的連續參數（大小/透明度/顏色/
          //    轉向/高度/動畫速度）。⛔ 這裡**不寫第二套套用邏輯**：走的是家族層
          //    在用的同一支 `applyVfxOverrides`（它連池 key 的簽章都算好了，所以
          //    同樣的覆寫共用同一格池，⛔ 不會每一發多開一個池）。
          //    缺席 ⇒ identity 快速路徑 ⇒ 逐位元同這一格出現之前。
          const ov = data.overrides;
          const tuned = ov ? applyVfxOverrides(doc, ov as never) : doc;
          this.play(applyAimYaw(tuned, aimYaw), anchor.x, anchor.z, nowMs, anchor.y);
        } else this.sparks.push(new HitSpark(this.scene, anchor.x, anchor.z, nowMs));
        // ⚡🌈 GH#549 —— 「**反彈成功**」那一族的**真的電弧**（owner 2026-08-22：
        //    「被反彈的敵方單位 身上要有明顯的**七彩閃電爆炸**」）。
        // ⛔ 這裡沒有任何技能 id 的 if：`reflectArcBurstPlan` 查的是**演出文件的
        //    id**，所以護盾反射／格擋反擊指到同一份文件就共用同一套演出
        //    （第〇·五守則 + 第零守則⑨：K 個模板 + 一張表）。
        // ⚠️ 粒子那一份文件做不出「一道有分岔的鋸齒電弧」，而 `colorStops` 的
        //    上界是 4 ⇒ 七個顏色也寫不進一份文件裡。兩件事都在這一層解決。
        // ⭐ 種子＝tick + 施法者（與 `chainLightning` 同一個做法）⇒ 決定性，
        //    ⛔ 不是 `Math.random`，也⛔ 不是常數（常數 = 每一發長成同一朵）。
        const rSeed = (ev.tick | 0) * 149 + ((ev.data.caster as number | undefined) ?? 0) * 31;
        for (const req of reflectArcBurstPlan(vfxId, { x, z }, rSeed, ARC_BODY_Y)) {
          this.strikeArc(req.from, req.to, nowMs, {
            tint: req.tint,
            power: req.power,
            forks: req.forks,
            seed: req.seed,
          });
        }
        break;
      }

      /**
       * ⚡ 一段電弧的**通用**要求（和上面的 `vfxSpawn` 是同一個形狀：引擎送
       * 世界座標，客戶端畫）。差別只有一個 —— 弧有**兩端**。
       *
       * 一條連鎖 = 引擎**逐跳各送一則**，跳與跳之間的極小間隔由引擎的時序
       * 決定，⛔ 不是客戶端自己排的。所以這個 case 裡沒有「鏈」的概念，
       * 換成鎖鏈 / 牽引 / 電纜也是同一則事件（第〇·五守則）。
       */
      // ── ⭐ GH#551/#543/#549 —— 四個「演出」事件 ────────────────────────
      //
      // ⛔ 在 2026-08-22 之前這四個事件**沒有任何客戶端消費端**：sim 每次都發、
      //    `eventFanout` 也放行了,而畫面上什麼都不會出現（失敗形態②：
      //    算出來了但從沒送到 —— 而傷害照樣掉血,所以它看起來完全正常）。
      // ⛔⛔ GH#606 —— 這一段在 2026-08-23 之前**每一次都在第一行跳出**。
      //
      // 舊碼：`const spec = ev.data.spec` → `if (!spec) break;`
      // 而 sim 送的是 `{ caster, modelKey, path, speed, x, z, zone, instances }`
      // —— ⛔ **全 repo 沒有任何地方寫過 `spec`**（`facingRad` / `arriveVfxKey`
      // 也一樣）。⇒ 龜派氣功 · 約束與勝利之劍 · 野戰型陽電子砲 · 龍鬥氣砲咒文 ·
      // 邪王炎殺黑龍波 · 龍破斬 · 世界終結（12 支 ability 文件）畫面上一具模型
      // 都沒出現過，而**傷害照樣掉血**,所以它看起來完全正常（失敗形態②）。
      //
      // ⚠️ 既有守衛全綠：`performanceEventsHaveConsumers` 問的是「有沒有一個
      // case」—— 有。⛔ 「那個 case 的第一個 `if` 會不會立刻 break」不是任何
      // 斷言的反面。⇒ 根治是**兩邊 import 同一個型別**（`ModelFxSpawnEvent`
      // 住 `sim/effects/spawnModelFx.ts`），打錯字從此是 tsc 的紅。
      case "modelFxSpawn": {
        if (!this.modelFx) break;
        const p = ev.data as unknown as ModelFxSpawnEvent;
        // ⚠️ 只擋「線路上真的沒有實例」這一種（sim 的 `instances.length===0`
        // 早退場路徑）。⛔ 不要再加「防禦性」的欄位存在檢查 —— 那正是舊碼
        // 靜靜吃掉整族的方式。
        if (!p.modelKey || !p.instances?.length) break;
        // ⭐ 位置**照抄 sim 解算完的結果**，⛔ 不從 `entityPos(caster)` 重算：
        //    模型要出現在傷害真的發生的地方，而施法者在飛行途中會移動。
        //
        // ⛔ **落點特效不在這裡。** 舊碼還讀了一個 `ev.data.arriveVfxKey`
        //    ——同樣是零個寫入端的幽靈欄位。落點視覺的住處是技能 JSON 的
        //    `onArrive: [{ kind: "spawnVfx", … }]`：它走 sim 的延遲班表，
        //    於是**特效與傷害在同一 tick 同一點**發生（第〇·五守則）。
        //    客戶端自己再排一次 = 第二個住處，而且會跟傷害差幾幀。
        //    ⚠️ 出貨的 12 支目前 `onArrive` 只有 `damageArea`/`screenShake`
        //    ⇒ 「光束打到底沒有爆炸」是**內容缺口**，⛔ 不是引擎缺口。
        this.modelFx.spawn(p);
        break;
      }
      // ⛔⛔ GH#608 —— 這兩個 case 在 2026-08-23 之前**擲 TypeError**。
      //
      // 舊碼 `this.screenFx.flash(ev.data.spec as never, viewer)`：sim 送的是
      // `{colorRgb, peakAlpha, durationSec, broadcast, subjects, caster, zone}`，
      // ⛔ **沒有 `spec`** ⇒ `ScreenFxLayer.flash()` 第一行 `spec.applyTo` 對
      // `undefined` 取值。⚠️ `as never` 讓 tsc 完全沉默。
      //
      // ⭐ 而它的代價遠大於它自己：`GameApp.handleDrainedEvent` 第一行就是
      // `this.vfx.handleEvent(ev)`，而 **`GameApp.ts` 全檔零個 `try`** ⇒ 一次
      // throw 帶走同一批**後面每一個事件**與**後面每一個 sink**（動畫脈衝／
      // 施法條／相機回饋／SFX 佇列／HUD 記錄器）。
      //
      // ⭐ 觀眾判定改由**權威側**決定：sim 早就把 `applyTo` 解算成
      // `subjects`/`broadcast` 了。⛔ 客戶端不再有第二份觀眾規則 ——
      // 舊碼的 `viewer.isVictim` 讀 `ev.data.victim`，**同樣零寫入端**，
      // 所以「受害者畫面變紅」從來沒有對過人。
      case "screenFlash":
      case "screenShake": {
        const cue = ev.data as unknown as ScreenCueRecipients;
        const me = this.ctx.localEntityId?.() ?? null;
        if (!screenCueIsForViewer(cue as never, me)) break;
        // 觀眾已經判完 ⇒ 圖層那一層一律「看得到」（`applyTo` 缺席 = `"all"`）。
        const seen = { isCaster: true, isVictim: true };
        if (ev.type === "screenFlash") {
          this.screenFx.flash(screenFlashSpecFromEvent(ev.data as unknown as ScreenFlashEvent), seen);
        } else {
          this.screenFx.shake(screenShakeSpecFromEvent(ev.data as unknown as ScreenShakeEvent), seen);
        }
        break;
      }
      // ⛔ GH#608 —— 舊碼讀 `ev.data.at`（零寫入端）⇒ `pos` 恆為 null ⇒ 每一次都
      //    `break`。⇒ **全遊戲每一個作者寫過的浮動文字都沒有出現過**（靜默那一種，
      //    ⛔ 所以它不像上面兩個會炸掉整批 —— 它只是不存在）。
      // ⭐ sim 送的是 `subjects: [{id,x,z}]` —— **一則事件可以帶好幾個錨**
      //    （`applyTo:"victim"` 打中五個人 = 五個字）。舊碼就算接對 `at` 也只會
      //    生一個（`entityPos` 還要客戶端自己查，而 sim 已經把座標算好送來了）。
      case "floatingText": {
        const p = ev.data as unknown as FloatingTextEvent;
        if (!p.text || !p.subjects?.length) break;
        for (const s of p.subjects) {
          this.floatingText.spawn({
            text: p.text,
            x: s.x,
            y: FLOATING_TEXT_ANCHOR_Y,
            z: s.z,
            colorRgb: p.colorRgb,
            sizeScale: p.sizeScale,
            riseSpeed: p.riseSpeed,
            durationSec: p.durationSec,
            // ⭐ GH#853 —— 地面平面的飄移（原作 `SetTextTagVelocityBJ`）。
            //    ⛔ 少了這一行，schema 收得下、sim 送得出、池子算得對，
            //    而畫面上每一個字仍然直升（失敗形態⑧）。
            drift: p.drift,
          });
        }
        break;
      }
      // ⚡⚡ GH#571 —— 連鎖閃電那一束**真的畫出來**。
      //
      // owner 2026-08-23:「一堆閃電特效如**皮卡丘 飛鼠先生 雷神之槌** 等雷電特效
      // **都沒有真的出現**」。⛔ 根因不是「沒有演算法」:`arcBolt` / `ArcBoltFx`
      // 早就做完了(鋸齒折線 + 分岔 + 加法混合 + 決定性雜湊),而 sim 也早就
      // `world.emit("chainLightning", { segments })` 並且過了 `eventFanout` 的白名單。
      // ⭐ **兩半被接到兩個不同的事件名上**:客戶端唯一的入口是 `vfxArc`,
      // 而**沒有任何東西發過 `vfxArc`** ⇒ 整族閃電逐位元組等於不存在(失敗形態②)。
      // `eventFanout.ts` 自己的註解逐字記著這件事:「⚠️ **客戶端目前還沒有這個 case**」。
      //
      // CADENCE:sim 是**每一跳一則**(`chains`/`hits` 恆為 1、`segments` 恆為一段),
      // 所以這裡不排任何時序 —— 逐跳各畫一段,間隔由 sim 的 `jumpIntervalSec` 決定。
      // ⛔ 這裡沒有「鏈」的概念(第〇·五守則),`segments` 是一個陣列只是因為
      // payload 保留了「一次送整段」的表達力。
      case "chainLightning": {
        const segs = ev.data.segments as
          | readonly { x: number; z: number; x2: number; z2: number }[]
          | undefined;
        if (!segs || segs.length === 0) break;
        // 每一跳一顆種子。⛔ 不是 `Math.random`,也⛔ 不是常數(常數 = 每一跳
        // 長成同一條折線,讀起來是複製貼上)——tick + 跳序已經是決定性的。
        const base = (ev.tick | 0) * 131 + ((ev.data.caster as number | undefined) ?? 0) * 17;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i]!;
          this.strikeArc({ x: s.x, z: s.z }, { x: s.x2, z: s.z2 }, nowMs, {
            tint: ARC_TINTS.lightning,
            seed: base + i,
          });
          // ⭐ **兩端的爆點輝光**(owner 的參考圖第三層)。只打**落點**那一端:
          // 一條鏈裡第 N 跳的起點就是第 N−1 跳的終點,所以每一個節點都會亮,
          // 而整條鏈唯一沒有輝光的那個點是施法者自己 —— 那裡本來就有施法特效。
          // ⛔ 兩端各放一顆 = 每個節點兩顆 HitSpark,而一次施放最多 320 跳。
          this.layeredPop(s.x2, s.z2, nowMs, "light", ARC_TINTS.lightning, ARC_BODY_Y);
        }
        break;
      }
      // ⚠️ `vfxArc` —— **今天 sim 端零個發射者**（`eventFanout` 的白名單也沒有它）。
      // 它留著是因為它是「sim 自己算出兩個端點」那一類機制未來唯一的入口
      // （牽引光束、鎖鏈、雷擊補刀）。⛔ 但在有人發它之前，它對玩家不存在 ——
      // 所以⛔ 不要因為「這個 case 在」就以為某支技能的電弧是從這裡來的：
      // 出貨的兩條真路是 `case "chainLightning"`（連鎖）與 `abilityCast` 裡的
      // `arcCastPlan`（施法電弧）。
      case "vfxArc": {
        const fx = ev.data.fromX as number | undefined;
        const fz = ev.data.fromZ as number | undefined;
        const tx = ev.data.toX as number | undefined;
        const tz = ev.data.toZ as number | undefined;
        if (fx === undefined || fz === undefined || tx === undefined || tz === undefined) break;
        this.strikeArc(
          { x: fx, z: fz, y: ev.data.fromY as number | undefined },
          { x: tx, z: tz, y: ev.data.toY as number | undefined },
          nowMs,
          {
            // 顏色/強度/壽命都是**逐次**可帶的（第一守則）。沒帶就是參數表的
            // 出貨值 —— ⛔ 不是在這裡編一個。
            tint: ev.data.tint as Rgb | undefined,
            power: ev.data.power as number | undefined,
            lifeMs: ev.data.lifeMs as number | undefined,
            seed: ev.data.seed as number | undefined,
          },
        );
        break;
      }
      /**
       * ⭐⭐ **世界演出** —— 一張表，⛔ 不是六個 `case`（2026-08-23 稽核）。
       *
       * ── 為什麼它在 `default` 裡 ─────────────────────────────────────────
       * `mobSpawn` · `summonSpawn` · `summonDespawn` · `deathWardSpawn` ·
       * `guardianSleep` · `damageLine` 六則在做**同一件事**：「某個東西在某個
       * 座標出現／消失／掃過了，放一個演出」。六則在這一段出現之前 sim 都發了、
       * `eventFanout` 都放行了、線路上真的都送到了，而客戶端**零個消費端**
       * （失敗形態②：傷害照樣掉血，所以它看起來完全正常）。
       *
       * 第零守則⑨逐字：「N 個同型項目 = K 個模板 + 一張表，⛔ 不是 N 輪」。
       * ⇒ 這裡是 **K = 2**（點／線），而**哪一則畫成什麼**住 JSON
       * （`content/config/world-cues.json`，第〇·四守則）。
       *
       * ⭐ 加第七列**不必動這裡一行** —— 這一段裡沒有任何一個事件名。
       * ⛔ 而「不接」也是一個要**寫下來**的決定：`worldCues.ts` 的
       * `WORLD_CUE_EXEMPTIONS`（出貨只有 `guardianSpawn` 一列，帶著理由與
       * 到期條件）。閘：`performanceEventsHaveConsumers.test.ts`。
       *
       * ⚠️ 放在 `default` 而不是排在上面：上面每一個具名 `case` 都**贏**這張表。
       * 一則事件哪天需要一段真的專屬邏輯時，寫一個 `case` 就自動接管，
       * ⛔ 不會變成「兩個地方各畫一次」。
       */
      default: {
        const data = ev.data as Record<string, unknown>;
        const point = worldCuePoint(this.worldCueTable, ev.type, data, (id) =>
          this.ctx.entityPos(id),
        );
        if (point) {
          this.layeredPop(
            point.at.x,
            point.at.z,
            nowMs,
            point.intensity,
            point.tint,
            point.heightY,
          );
          break;
        }
        const line = worldCueLine(this.worldCueTable, ev.type, data);
        if (line) {
          this.strikeArc({ ...line.from, y: line.heightY }, { ...line.to, y: line.heightY }, nowMs, {
            tint: line.tint,
            power: line.power,
            lifeMs: line.lifeMs,
          });
        }
        break;
      }
    }
  }

  /**
   * GROUND-FOLLOW pass (task #147): one walk over the live bodies the render
   * layer exposes (frameBus.champions), reading each body's FRESH rendered
   * position via `ctx.entityPos` (the champion views are synced earlier in the
   * frame). It drives BOTH the blob shadows and the velocity-gated walking
   * dust, then prunes the per-entity walk state for bodies that despawned.
   */
  /**
   * ⭐ GH#575 —— **殭屍的身體也要記**（owner：「我殺死的殭屍 金幣卻不是飛向我
   * 並且沒有金幣音效跟音階」）。
   *
   * ⛔ `syncGroundEntities()` 只走 `frameBus.champions`，而**殭屍從來不在裡面**
   * （`GameApp` 的小怪迴圈是另一條，而且它還有分區剔除與界外閘會提早 `return`）
   * ⇒ `GoldPickupFx.lastBody` **從沒記過任何一隻殭屍** ⇒ `spawn()` 的 `from` 是 null
   * ⇒ 金幣不生、音效與音階都不播。
   *
   * ⚠️ 同一個檔裡那一行的註解**早就寫著**「少了這一行，金幣不是掉錯地方就是根本不掉 ——
   * 而畫面上看起來只會像『這個功能有時候沒作用』」。⭐ 那句話是對的，只是它守的是英雄那一半。
   *
   * ⭐ 這裡刻意**不吃分區剔除**：金幣的歸屬與音階是**擊殺者**的回饋，
   * ⛔ 與「這一隻的血條有沒有畫在螢幕上」無關。
   */
  noteGoldBody(id: number, x: number, z: number): void {
    this.gold.noteBody(id, { x, z });
  }

  private syncGroundEntities(nowMs: number, dtMs: number): void {
    const scratch = this.shadowScratch;
    scratch.length = 0;
    for (const anchor of frameBus.champions.values()) {
      const id = anchor.entityId;
      const pos = this.ctx.entityPos(id);
      if (!isFinitePos(pos)) continue;
      // ⭐ GH#494 —— 記下每一具身體這一幀在哪。`mobSlain` 的 payload **沒有 x/z**，
      // 而殭屍在事件到達時通常已經從快照裡消失了（sim 同一個 tick 就
      // `destroyAfterHooks`），`entityPos()` 會回 null。少了這一行，金幣不是掉錯
      // 地方就是根本不掉 —— 而畫面上看起來只會像「這個功能有時候沒作用」。
      this.gold.noteBody(id, pos);
      const prop = isRootedProp(anchor.kind, anchor.teamId);
      // shadow under every LIVE body (a corpse/despawned body drops its shadow)
      if (anchor.alive) {
        scratch.push({ id, x: pos.x, z: pos.z, radius: prop ? SHADOW_FLOWER_RADIUS : SHADOW_CHAMPION_RADIUS });
        // walking dust: champions only (a rooted prop never kicks dust)
        if (!prop) this.emitWalkDust(id, pos, nowMs);
        // ⭐ GH#661 —— 拖曳光束的錨點跟著這一幀**算繪出來的**位置走。
        //    ⚠️ ⛔ 不是「sim 送來的那個座標」：心跳每 0.25 秒才一則，而拖曳要的
        //    是**每一幀**的位移（那就是它量得到速度的唯一來源）。
        this.moveTrail.syncBody(id, pos.x, pos.z, nowMs, dtMs);
      }
    }
    this.shadows.sync(scratch, nowMs);
    // prune walk state for bodies that are no longer on the field
    if (this.walkTrail.size > 0) {
      for (const id of this.walkTrail.keys()) {
        if (!frameBus.champions.has(id)) this.walkTrail.delete(id);
      }
    }
  }

  /**
   * Velocity-gated walking dust for ONE body. Gated on STRIDE distance (a still
   * body never accumulates it) paced by a min interval, so it reads like
   * footsteps and is frame-rate independent. A teleport/respawn jump re-baselines
   * without emitting. The puff kicks up slightly BEHIND the foot.
   */
  private emitWalkDust(id: number, pos: { x: number; z: number }, nowMs: number): void {
    const st = this.walkTrail.get(id);
    if (!st) {
      this.walkTrail.set(id, { ex: pos.x, ez: pos.z, lastMs: -Infinity });
      return;
    }
    const dx = pos.x - st.ex;
    const dz = pos.z - st.ez;
    const dist = Math.hypot(dx, dz);
    if (dist > WALK_TELEPORT_DIST) {
      st.ex = pos.x; // teleport/respawn — re-baseline, no puff
      st.ez = pos.z;
      return;
    }
    if (dist < WALK_STRIDE || nowMs - st.lastMs < WALK_MIN_INTERVAL_MS) return;
    const inv = 1 / dist;
    this.feedback.walkDust({
      x: pos.x - dx * inv * WALK_PUFF_TRAIL,
      z: pos.z - dz * inv * WALK_PUFF_TRAIL,
      scale: this.budgetScale(),
      nowMs,
    });
    st.ex = pos.x;
    st.ez = pos.z;
    st.lastMs = nowMs;
  }

  update(nowMs: number): void {
    // The rig advances on dt (KP2 tracks, effect durations, drains) — never on
    // wall clock, so a paused match or a hand-stepped replay stays in step. A
    // backgrounded tab returns with a huge dt, which RELEASES the live effects
    // rather than stranding them: the safe direction, deliberately not clamped
    // down to a small step here (`W3xCastFx` caps it at one second).
    const dtMs = this.lastUpdateMs === null ? 0 : nowMs - this.lastUpdateMs;
    this.lastUpdateMs = nowMs;
    this.w3xCast.tick(dtMs, nowMs);
    // ⭐ GH#838 —— 到期的演出腳本 segment 在這裡 fire（atMs 的時鐘）。
    this.scriptPlayer.update(nowMs);
    // ⏳ GH#570 —— **終極**三秒兜底。owner 2026-08-23:「不管什麼特效⋯產生後
    // 生命週期最多維持三秒，三秒後一律強制清理回收」。
    // ⭐ 它掃的是 `scene.particleSystems`（Babylon 自己維護的登錄表），所以
    // ⛔ 沒有任何一條建立路徑逃得掉 —— 包含不走 vfx 管線的場地特效。
    // 常駐特效靠兩格顯式旗標豁免，見 `vfxHardCap.ts` 的檔頭。
    this.vfxHardCapReclaims += sweepVfxHardCap(this.scene, nowMs / 1000).reclaimed;
    // ⭐ 三個「演出」層也要推進 —— ⛔ 少了這三行,模型永遠停在起點、
    //    閃爍永遠不退、文字永遠不上浮（而且都不會有人報錯）。
    this.modelFx?.tick(dtMs);
    this.screenFx.tick(dtMs);
    this.floatingText.tick(dtMs);
    for (const t of this.telegraphs) t.update(nowMs);
    this.telegraphs = this.telegraphs.filter((t) => !t.done);
    // ⭐ GH#567 —— 守衛塔的投射物（到站那一幀自己 dispose）。
    this.guardianVolley.update(nowMs);
    // #228: re-reads the cast bar's fraction per caster and advances/reaps
    this.telegraphLayer.update(nowMs);
    for (const s of this.sparks) s.update(nowMs);
    this.sparks = this.sparks.filter((s) => !s.done);
    // GH#270 ①: pump the SHARED ImpactComposer **unconditionally**.
    //
    // It used to be pumped only from `HitSpark.update()`, i.e. only while at
    // least one per-hit handle was still alive. Its reaper (`BurstPool.update`,
    // 8 s idle) therefore stopped running the moment the fight went quiet —
    // exactly when the debris should have been collected. `HitSpark.update()`
    // still pumps at most once per frame (`kit.lastPumpMs`), so this is not a
    // double tick; it just guarantees there IS one.
    impactComposerFor(this.scene).update(nowMs);
    // GH#270 ②: the hard cap. See `sweepOneShotEmitters`.
    this.sweepOneShotEmitters(nowMs);
    // decal fades + idle-pool reaping for the task #39 layers
    this.blood.update(nowMs);
    this.feedback.update(nowMs);
    this.status.update(nowMs);
    // ground-follow layer (task #147): shadows + walking dust + cast-scorch fades
    this.syncGroundEntities(nowMs, dtMs);
    // ⭐ GH#661 —— 心跳停了（或身體離場）的拖曳**當場**拆掉。⚠️ 一定要在
    //    `syncGroundEntities` **之後**：那一圈才是這一幀「誰還在場上」的答案。
    this.moveTrail.update(nowMs);
    this.castDecals.update(nowMs);
    this.pillars.update(nowMs);
    // ⚡ 電弧：推進亮度,壽命到的還回 free-list。**一跳一閃**,所以絕大多數幀
    // 這一圈走的是空陣列。
    this.arcs.update(nowMs);
    // ⭐ GH#494 金幣：停留 → 貝茲加速 → 到站播音效並 `dispose()` 那一枚 instance。
    // ⚠️ 放在 `syncGroundEntities` **之後**，這樣目標讀到的是這一幀的英雄位置
    // （英雄邊打邊跑，用上一幀的位置會讓金幣永遠差一格）。
    this.gold.update(nowMs);
    // #205 多層特效模板:到期的延遲層。放在最後,所以一層在它被排定的那一幀
    // 之後才會播 —— delay 0 的層走的是 playLayeredCast 的立即分支,不經過這裡。
    this.drainPendingLayers(nowMs);
  }

  /**
   * GH#270 —— 一次性發射器的**硬上限**（`config.vfx-cleanup@1`）。
   *
   * owner 2026-08-04 在線上量到：Round 2 = 144 個發射器 / 2,819 顆活粒子，
   * Round 4 = 266 / 5,975。線性成長。
   *
   * 上面那兩個池子（`this.pool` per doc id、rig 的 per doc id）在回合邊界會被
   * 整個還回去，所以它們不是兇手。真正只增不減的是 `HitSpark` 的**共用**
   * `ImpactComposer`：它掛在 per-Scene 的 WeakMap 上、**不屬於這個 class**，
   * 而它的 key 把 intensity **和 tint** 一起烘進去（`ex/1,0.2,0.15/sparks`）。
   * 一場比賽會一直遇到新的 tint（英雄升級解鎖 R/EX、每支技能自己的
   * `tintOfDoc`、殭屍加入），所以「每個 key 上限 4 個」根本不構成上界 ——
   * key 的數量本身沒有上界。
   *
   * 這一格把它變成有界的：**超過上限就回收最久沒用的**，而且回收數字被記在
   * `oneShotEvictions` 上讓診斷面板讀得到。這不是修法本身（修法是上面那個
   * 無條件打點 + 下面的回合邊界清空），它是 fail-safe：就算之後又有人新增
   * 一個沒人管的池子，成長也只會撞到這條線而不是一路長到手機發燙。
   *
   * 掃描頻率也是後台可調的（`emitterSweepSec`），因為「多久掃一次」是體感與
   * 開銷的取捨，不是事實。`enabled=false` ⇒ 上限 `Infinity` + 間隔 `Infinity`，
   * 也就是一鍵回到這一段存在之前的行為（止血閥）。
   */
  private sweepOneShotEmitters(nowMs: number): void {
    const policy = vfxCleanupPolicy();
    const everyMs = emitterSweepMs(policy);
    if (!Number.isFinite(everyMs)) return;
    if (nowMs - this.lastSweepMs < everyMs) return;
    this.lastSweepMs = nowMs;
    const cap = oneShotEmitterCap(policy);
    if (!Number.isFinite(cap)) return;
    this.oneShotEvictions += impactComposerFor(this.scene).trimIdleTo(cap, nowMs);
  }

  /**
   * ROUND BOUNDARY CLEANUP (task #16 / #259 —— owner:「戰鬥開始前/結束 特效、
   * 物件單位是否都有清理乾淨的機制？」).
   *
   * 查證的結果是：**完全沒有**。在這之前，這個 class 唯一的回收路徑是
   * `dispose()`，而 `dispose()` 只在整個 GameApp 被銷毀（離開比賽）時被呼叫。
   * 回合切換一次也沒有清過。
   *
   * 量到的後果（`VfxSystem.roundReset.test.ts` 就是釘這件事的）：
   * `pool` 是「每個 vfx doc id 一條 free-list、最多 4 個 ParticleSystem」，
   * 而且**只會長不會縮**。一場比賽裡出現過的技能種類是一直增加的 —— 英雄
   * 升級解鎖 R/EX、第 3 回合起殭屍加入、每回合換地圖 —— 所以
   * `scene.particleSystems` 是單調成長的。在測試 harness 裡跑四個回合，
   * 每回合 40 種效果，數字是 40 → 80 → 120 → 160，中間就算閒置 30 秒也不會掉。
   * 那些系統早就沒人會再用到，但每一張 frame 仍然在場景裡被走訪 ——
   * 這就是「越打越鈍」。
   *
   * 第二類問題是**正確性**而不是效能：回合結束那一瞬間還在飛的預告圈、
   * 施法光柱、焦痕、暈眩光環，會整個被帶進商店場景（#216 修的是同一種病，
   * 只是修在血條那一半）。
   *
   * 所以這個 method 做兩件事：
   *   1. 把「一次性、有生命週期」的東西全部就地結束（telegraph / spark /
   *      cast 光柱 / 焦痕 / 狀態光環 / 腳下影子）；
   *   2. 把「只會長不會縮的池子」整個還給 Babylon（`pool` 與 rig）。
   *      下一次 `play()` 會自然重建 —— 池子本來就是 lazy 的。
   *
   * ⚠️ **這一段以前寫著「blood / feedback / 打擊感這些 BurstPool 有 per-key
   * 上限，是有界的」—— 那句話是假的**（GH#270，owner 在線上量到發射器數
   * 144 → 266 線性成長）。per-key 上限只有在 **key 的數量有上界**時才構成上界，
   * 而打擊感的 key 把 tint 烘進去（`ex/1,0.2,0.15/sparks`），一場比賽會一直
   * 遇到新的 tint。血/打擊回饋的 key 是有限的列舉，那兩個確實有界；
   * **打擊感不是**，所以現在它也在回合邊界被還回去（後台可切）。
   */
  resetForRound(): void {
    // 1) 一次性效果：就地結束（dispose 會把 pooled mesh 還回 free-list）
    for (const t of this.telegraphs) t.dispose();
    this.telegraphs = [];
    for (const s of this.sparks) s.dispose();
    this.sparks = [];
    this.telegraphLayer.clear(); // 每個施法者的地面預告圈
    this.pillars.clear(); // 向天光束（#233）
    this.arcs.clear(); // ⚡ 上一回合最後一跳的電，⛔ 不可以跟著進商店（#216 / #259）
    // ⭐ GH#567 —— 還在飛的守衛砲彈與還在演的伸縮動作都不跨回合（同上一行的理由）。
    this.guardianVolley.resetForRound();
    clearGuardianRecoils();
    // ⭐ GH#494 —— 還在飛的錢不留到下一回合（#262：mesh 一定要回收）。錢本身早就
    // 進了口袋，這裡丟掉的只是那一枚 instance。
    this.gold.reset();
    this.castDecals.clear(); // 地面焦痕 —— 下一回合可能是完全不同的地圖
    this.status.clear(); // 暈/定身/緩速光環
    // ⭐ GH#661 —— 上一回合最後一秒的暴走拖曳光束⛔ 不可以跟著進商店。
    this.moveTrail.clear();
    this.shadows.sync([]); // 腳下影子：這一刻場上沒有任何身體
    // #205：上一回合排定的延遲層。不清掉的話「大招 3 秒後的餘燼」會在商店
    // 場景裡爆出來 —— 和 #216 / #259 抓到的殘留是同一種病。
    this.pendingLayers = [];

    // 2) 只會長不會縮的池子：整個還回去
    for (const list of this.pool.values()) for (const e of list) e.ps.dispose();
    this.pool.clear();
    this.w3xCast.resetForRound();
    // ⛔ 回合邊界不清 = 上一回合的光束／閃爍／文字活過來（#131 孤兒發射器的形狀）。
    this.modelFx?.resetForRound();
    this.screenFx.resetForRound();
    this.floatingText.resetForRound();
    // 2b) #262 —— #259 漏掉的那一層：`Telegraph` 的預告圈網格 free-list 不屬於
    //     任何一個 Telegraph 實例，它掛在 `sharedByScene`（per-scene WeakMap）
    //     上、以**半徑字串**為 key，一個 key 上限 8 個網格、每個網格自帶一份
    //     StandardMaterial。上面第 1 步的 `telegraphLayer.clear()` 只是把場上
    //     的圈 release 回這個 free-list —— 也就是說 #259 之後，網格照樣一個都
    //     沒有離開 scene。實測 60 個不同半徑打完，連 dispose() 之後 scene 上
    //     都還留著 72 mesh / 73 material。上限是後台可調的（第一守則）。
    const policy = vfxCleanupPolicy();
    trimTelegraphPools(this.scene, ringCapForRoundBoundary(policy));
    // ⚡ 電弧的網格 free-list 走**同一格政策** —— 它和預告圈是同一種東西
    // （閒置的池化網格 + 每個自帶一份材質），⛔ 不需要第二個寫死的上限。
    this.arcs.trimTo(ringCapForRoundBoundary(policy));
    // ⭐ GH#429 —— 移動模型特效的 free-list **也**走同一格政策。它與預告圈/電弧
    //    是同一種東西（閒置的池化節點，每個帶著一份 glb 實例）。⚠️ 它自己的
    //    `maxPooledPerModel` **不是**上界：modelKey 的數量在一場比賽裡無界，
    //    而 12 × 無界 = 無界（GH#270 逐字記過的同一個錯，換一層再犯一次）。
    //    實測：每回合 3 個新 modelKey ⇒ 場上的 `modelfx-*` 節點 72/回合線性成長。
    this.modelFx?.trimPoolTo(ringCapForRoundBoundary(policy));
    // 2c) GH#270 —— 打擊感的共用池（`vfx-preset-*`）。它掛在 per-Scene 的
    //     WeakMap 上，所以上面那一輪 `this.pool` / rig 的回收一個都沒碰到它，
    //     而 `for (const s of this.sparks) s.dispose()` 只是把**每一拳的把手**
    //     標成 done —— `HitSpark.dispose()` 的註解自己就寫著「pooled systems
    //     live on with the scene」。owner 量到的那 144 → 266 個發射器裡，
    //     粒子數最高的九列全部是這個池子。
    if (purgeImpactPoolOnRoundEnd(policy)) impactComposerFor(this.scene).purge();
    // ⏳ GH#570 —— 碼表歸零。回合邊界剛把一堆池子還回去，留著上一回合的碼表
    //     等於讓下一回合第一發特效繼承別人的年齡（⛔ 不會漏收，會**早收**）。
    resetVfxHardCapClocks(this.scene);
    this.lastSweepMs = -Infinity; // 下一幀就掃一次，不必等滿一個間隔

    // 3) 上一回合的 per-entity 記憶。entity id 不會跨回合重用，留著只是
    //    永遠不會被讀到的垃圾（殭屍每回合最多 30 隻，都是新 id）。
    this.aim.clear();
    this.walkTrail.clear();
    // dt 從下一次 update() 重新起算，否則跨越整段商店時間的 dt 會被算進去
    this.lastUpdateMs = null;
  }

  dispose(): void {
    this.pendingLayers = []; // #205：離場時排隊中的延遲層
    for (const t of this.telegraphs) t.dispose();
    this.telegraphLayer.dispose();
    for (const s of this.sparks) s.dispose();
    for (const list of this.pool.values()) for (const e of list) e.ps.dispose();
    this.blood.dispose();
    this.feedback.dispose();
    this.status.dispose();
    this.moveTrail.dispose();
    this.shadows.dispose();
    this.castDecals.dispose();
    this.pillars.dispose();
    this.arcs.dispose();
    // ⭐ GH#567 —— 來源網格 + 共用材質（instance 在 resetForRound 裡已經丟了）。
    this.guardianVolley.dispose();
    clearGuardianRecoils();
    // The rig owns its own ParticleSystems and emitter meshes — its dispose()
    // walks every system it EVER built, pooled or live, so nothing can survive
    // this call by being in a state we forgot about (task #131's lesson).
    this.w3xCast.dispose();
    this.modelFx?.dispose();
    this.screenFx.dispose();
    this.floatingText.dispose();
    // ⭐ GH#494 —— 金幣的來源網格 + 那一份共用材質（instance 已經在 reset 裡丟了）。
    this.gold.dispose();
    // #262: the per-scene telegraph free-lists + the magic-circle Texture + the
    // kick BurstPool. `TelegraphLayer.dispose()` above only walks its own `live`
    // map — everything already released into the shared pool survived it, and
    // survived `VfxSystem.dispose()` too until this line existed.
    disposeTelegraphShared(this.scene);
    this.lastUpdateMs = null;
    this.telegraphs = [];
    this.sparks = [];
    this.pool.clear();
    this.shaped.clear();
    this.aim.clear();
    this.walkTrail.clear();
  }
}
