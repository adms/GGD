/**
 * EntityViewRegistry — diffs the authoritative entity set into Babylon views
 * and writes per-frame transforms IMPERATIVELY (never via React/Zustand).
 * Champions get a procedural voxel figure immediately (with an async .glb
 * upgrade once the entity's model doc is known); projectiles come from a
 * pooled billboard cache styled by their vfx doc; neutral healing flowers
 * (kind 2) come from a pooled FlowerView (voxel fallback + .glb upgrade);
 * revive circles (kind 3) come from a pooled ReviveCircleView, a purely
 * procedural team-tinted fire ring (no model doc at all).
 * Animation states are derived from authoritative flags + MSG.EVENT pulses.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { ModelDoc, VfxDoc } from "@ggd/shared/content";
import type { ProjectileFlight } from "@ggd/shared/content";
import type { VoxelSkinRecipe } from "@ggd/shared/content/voxelSkin";
import { TICK_MS } from "@ggd/shared/constants";
import { standinRelativeScaleOf } from "@ggd/shared/content/standinScale";
import { ChampionView, type FormAttachmentSpec } from "./views/ChampionView";
import { ProjectileView, type ProjectileMeshShape } from "./views/ProjectileView";
import { FlowerView } from "./views/FlowerView";
import { GuardianView } from "./views/GuardianView";
import { ReviveCircleView } from "./views/ReviveCircleView";
import { NightFlagView } from "./views/NightFlagView";
import { CoinView } from "./views/CoinView";
import { applyModelTint, releaseModelTint, type ModelTint } from "./views/modelTint";
import { mudTintFor, type GrowthTier } from "./views/growthTier";
import { growthTierFromFlags, formIndexFromFlags, ENTITY_FLAG, ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { stealthVisualFor } from "./stealthVisual";
import type { VoxelLook } from "./views/voxelLook";
import type { AssetManager } from "./AssetManager";
import {
  ATTACKER_FLASH_MS,
  ATTACKER_FLASH_RGB,
  asImpactProfile,
  planImpactFeedback,
} from "./combatFeedback";
import { TELEPORT_STEP_UNITS } from "./math/motion";
import { lifecycleLedger } from "./lifecycleLedger";

/** Per-champion vertex-tint bookkeeping (task #49). */
interface TintState {
  /** resolved tint, or null once we know the champion is untinted */
  tint: ModelTint | null;
  /** true once the tint has been applied to the .glb meshes (they arrive late) */
  glbPainted: boolean;
  /**
   * #244 — the GROWTH TIER the currently-painted colour includes. The mud
   * multiply is folded INTO the #49 tint rather than painted by a second
   * painter, so `applyModelTint`'s "always recompute from the remembered source
   * colour" rule keeps a tier change from compounding. This field is the
   * "has the composed colour changed" guard that keeps the per-frame cost at
   * one integer compare.
   */
  tier: GrowthTier;
}

/**
 * #244 — fold the growth-tier mud multiply into the #49 champion tint. Tier 0
 * returns the champion's own tint untouched (so 93 of 113 untinted champions
 * still resolve to `null` and never have their materials touched at all).
 */
function composeGrowth(tint: ModelTint | null, tier: GrowthTier): ModelTint | null {
  if (tier === 0) return tint;
  return { ...(tint ?? {}), tint: mudTintFor(tier, tint?.tint) };
}

/** EMA factor for the observed ground speed fed to run-rate sync. */
const SPEED_SMOOTH = 0.25;

/** Plain snapshot of one entity (adapter over the schema EntityState). */
export interface EntityViewState {
  id: number;
  kind: number; // 0 champion, 1 projectile, 2 flower, 3 revive circle
  seatId: number;
  key: string; // modelKey / projectileId
  teamId: number;
  x: number;
  z: number;
  fx: number;
  fz: number;
  alive: boolean;
  /**
   * The authoritative `EntityState.flags` word (task #244). Optional so every
   * existing fixture and caller stays valid; absent reads as 0 = no flags.
   * Two bit pairs are consumed here — GROWTH (#244, the mud tier) and FORM
   * (#249, 變身, which rebuilds the body outright) — the rest are read by GameApp.
   */
  flags?: number;
  /**
   * Champions only (task #247): fly height in GGD units and the AIRBORNE flag.
   * Absent = grounded, which is every other kind and every pre-#247 caller.
   *
   * `airborne` is deliberately a FLAG rather than `h > 0`: it is also true on the
   * takeoff and landing ticks, where the height is exactly 0, and locomotion has
   * to stay suppressed for the whole flight.
   */
  h?: number;
  airborne?: boolean;
  /**
   * Champions only (task #268): is this the LOCAL player's own champion?
   *
   * Optional, so every existing fixture and caller stays valid; absent reads as
   * "not mine", which is the correct answer for eleven of the twelve bodies in
   * a match and for every headless test. Supplied by GameApp, because the
   * entity → local-seat hop needs the HUD store that render/** is walled off
   * from (client-08) — the same seam `championTintFor` / `voxelSkinFor` use.
   */
  isLocal?: boolean;
  /**
   * Champions only (隱形原語): is this body on the VIEWING seat's team — which
   * includes the viewer's own champion?
   *
   * Optional, so every existing fixture and caller stays valid; absent reads as
   * "not friendly", i.e. an enemy, which is the conservative answer (a hidden
   * body defaults to fully hidden rather than accidentally shown). Supplied by
   * GameApp for exactly the reason `isLocal` is: the entity → local-team hop
   * needs the HUD store that render/** is walled off from (client-08).
   *
   * It is NOT `isLocal`: an invisible TEAMMATE must be visible to you too, and
   * `isLocal` is true for exactly one of the twelve bodies.
   */
  friendly?: boolean;
  /**
   * MOBS (kind 6) only — the 體型倍率 the server armed for this mob's KIND
   * (GH#192), decoded by the caller out of the reused `mana` slot (see protocol
   * ENTITY_KIND). Absent for every other kind and for any world that never
   * armed the mechanic; `mobModelSizeOverride` then falls back to the model
   * doc's own scale, which is exactly GH#262's behaviour.
   */
  mobScale?: number;
  /**
   * Revive circles (kind 3) only — decoded by the caller from the reused
   * EntityState float slots (see protocol ENTITY_KIND). Absent for every other
   * kind, so the shape stays a strict superset of the old one.
   */
  revive?: {
    /** channel fill 0..1 */
    progress: number;
    /** authoritative ring radius (world units) */
    radius: number;
    channelling: boolean;
    contested: boolean;
  };
  /**
   * 暗夜旗 (kind 7, 71-00 暗夜契約) only — decoded by the caller out of the same
   * reused float slots (see protocol ENTITY_KIND.NIGHT_FLAG). Absent for every
   * other kind, so the shape stays a strict superset of the old one.
   *
   * `radius` is AUTHORITATIVE and already post-`abilityRange`: the ring is drawn
   * at exactly this number so a player's read of "where does 黑夜靈氣 reach"
   * cannot disagree with the radius the sim tests.
   */
  nightFlag?: {
    radius: number;
    /** owning team, for a future tint; presentation only, never a filter */
    teamId: number;
  };
}

/** Optional content lookups (return null until docs are fetched). */
export interface ViewContentHooks {
  /**
   * seatId lets the caller substitute per-seat skins (equipped cosmetics).
   *
   * `formIndex` (#223) is the 變身 ordinal the champion branch already decoded
   * from the FORM bits, and it is passed because the seat table ALONE gives the
   * wrong answer for a transformed body: `seat.championId` is frozen at
   * champ-select and never moves, so a resolver keyed on it asks about the
   * BASE hero while the ALTERNATE is the thing on screen. Absent/0 = base form,
   * which is what every non-champion caller (flower, guardian, the champ-select
   * and round-winner previews) means.
   *
   * ⚠️ A TWO-PARAMETER ARROW SILENTLY DROPS IT. TypeScript lets `(key, seatId)
   * => …` satisfy this signature, and that is exactly how the first #223 fix
   * shipped dead: the composition root wrapped its resolver in a 2-arity arrow,
   * `formIndex` fell back to its default 0, and every test stayed green. The
   * shipped implementation is therefore NOT written as a wrapper — it comes
   * whole out of `views/championBody.championBodyHooks`, which is unit-testable
   * (`views/formAwareModelResolve.test.ts`) precisely because GameApp is not.
   */
  modelDocFor?(modelKey: string, seatId?: number, formIndex?: number): ModelDoc | null;
  projectileVfxFor?(projectileKey: string): VfxDoc | null;
  /** 3D body shape of the flying missile (projectile@1 `meshShape`). */
  projectileMeshShapeFor?(projectileKey: string): ProjectileMeshShape | null;
  /**
   * #251 —— this missile's own `projectile@1.hitRadius`, which drives how big
   * it renders (`config.vfx-families@1.projectileRadiusGain`).
   *
   * Absent ⇒ the reference radius, i.e. every missile the same size — which is
   * exactly the shipped-before-#251 picture: a 0.9-radius PIERCING wave and a
   * 0.4-radius basic attack drew the identical comet.
   */
  projectileHitRadiusFor?(projectileKey: string): number | null;
  /**
   * #394 —— this missile's own `projectile@1.flight` (yaw offset / pitch /
   * spin). Absent ⇒ nose along the travel direction, level, no spin, i.e. the
   * shipped-before-#394 picture: a piercing WAVE and a dart drew the identical
   * nose-first bolt.
   */
  projectileFlightFor?(projectileKey: string): ProjectileFlight | null;
  /**
   * w3x vertex tint + alpha for a champion entity (task #49). The registry
   * CANNOT resolve this itself: the entity → championId step needs the seat
   * table, which lives in the HUD store, and client-08 keeps render/** out of
   * that store. GameApp supplies it (`championIdForSeat` + `championTintForId`);
   * headless tests either stub it or omit it to opt out of tinting entirely.
   * `undefined` = not resolvable yet (retry next frame), `null` = resolved and
   * untinted.
   */
  championTintFor?(e: EntityViewState): ModelTint | null | undefined;
  /**
   * Per-champion model/scale OVERRIDE (task #77). A stand-in champion shares one
   * of the four CC0 meshes via its `modelKey`, so `modelDocFor` (keyed only by
   * modelKey) cannot give it the size the MAP declared — e.g. 小叮噹/哆啦A夢
   * (godie-n00b) should render at ~0.6 scale, not the shared mage's 0.77, and 18
   * champions on `champ.sela` otherwise render identically sized. Because the
   * championId lives behind the seat table that render/** is walled off from
   * (client-08), the composition root (GameApp) resolves the override and injects
   * it here; the registry then applies it to the resolved doc so the fallback
   * PRESERVES the declared model+scale instead of dropping to the generic
   * stand-in size. Returns null/undefined for champions with no override (the
   * common case) — behaviour is then exactly as before.
   */
  modelOverrideFor?(e: EntityViewState): ModelDocOverride | null | undefined;
  /**
   * The champion's GENERATED VOXEL SKIN (task #231) — palette, face, outfit
   * blocking and motifs, derived deterministically from the champion's own
   * identity. Same shape of seam and same reason as `championTintFor`: the
   * entity → championId step needs the seat table, which lives in the HUD store
   * that render/** is walled off from (client-08), so GameApp supplies it.
   *
   * `undefined` = not resolvable yet (retry next frame), `null` = resolved and
   * this champion renders with the plain team-coloured figure.
   *
   * NEVER called for kind 4 (guardian) — a neutral objective takes no champion
   * identity, the same neutrality `championTintFor` is held to.
   */
  voxelSkinFor?(e: EntityViewState): VoxelSkinRecipe | null | undefined;
  /**
   * 變身球體掛件 (#249 GH#288) — 例:超級賽亞人悟空頭上那顆 `Goku3head`。
   *
   * 為什麼不能從 `e.key` 推:`godie-ogrh` 與 `godie-o00x` **共用**
   * `imported.goku`,所以 modelKey 對這一對根本不會變(和 FORM bits 存在的
   * 理由完全一樣)。而 alternate 的 championId 只有合成根算得出來
   * (seat 表 + FORM bits),於是又是同一條 client-08 的注入縫。
   *
   * `null` = 這個 body 沒有掛件。**基本型永遠是 null**,因為
   * `resolveFormVisual` 的第一道關卡是 `isAlternateForm` —— 「基本型悟空不可以
   * 長出超三的頭」在資料層就成立,不是靠這裡記得判斷。
   *
   * ⭐ GH#392 —— 回傳值是**一份或一串**。`attachment@1` 的 `points[]` 一格一份
   * (owner 的「雙手」= 兩份),而變身外觀表那一份仍然可以直接回單一物件。
   */
  formAttachmentFor?(
    e: EntityViewState,
  ): FormAttachmentSpec | readonly FormAttachmentSpec[] | null | undefined;

  /**
   * #247 —— 這具身體腳下的圈圈要畫多大 (GGD units, diameter). `null`/absent =
   * 「用 ChampionView 自己的預設」, which is every champion.
   *
   * A SEAM AND NOT A CALCULATION HERE, for the same client-08 reason
   * `championTintFor` is one: the answer needs `MatchState.mobVisualJson`, which
   * lives in the net layer that render/** is walled off from. GameApp supplies
   * `mobGroundRingDiameter(e.mobScale, this.mobVisual)`.
   *
   * ⚠️ THE RING IS NOT A HITBOX AND NOTHING HERE CAN MAKE IT ONE. It is a torus
   * on the client; the server never reads it and no client-side query does
   * either. That is the structural half of owner's 「圈圈比較大但不影響無碰撞」 —
   * see the guard in sim/mobBossRing.test.ts, which fails if a ring number ever
   * reaches `MobRules.radius` / `boss.radius`.
   */
  groundRingDiameterFor?(e: EntityViewState): number | null | undefined;
}

/**
 * A champion-specific override of the shared stand-in's model doc (task #77/#150).
 *
 * `relativeScale` (task #150) is the per-champion INTENTIONAL size multiplier on
 * top of ChampionView's height-normalization: 1.0 = the common target height,
 * <1 = deliberately smaller, >1 = bigger. It is the size-exception knob (small
 * creatures / large giants) and threads to `ChampionView.tryUpgradeToGlb`.
 *
 * The optional `glbPath`/`clipMap` swap in a genuinely different model when one
 * exists. `scale` is the LEGACY (pre-#150) absolute render scale — retained only
 * so `applyModelOverride` can still carry a swapped model's own declared scale
 * into the doc; it no longer sets the on-screen SIZE (normalization does). Any
 * omitted field keeps the doc's.
 */
export interface ModelDocOverride {
  scale?: number;
  relativeScale?: number;
  /**
   * Task #77 — the size multiplier for the champion's STAND-IN body (the
   * generated box-man it falls back to when its own model is not there).
   * A separate number because `relativeScale` stopped describing that body at
   * GH#31; see `packages/shared/src/content/standinScale.ts` for why copying
   * one into the other renders 死亡騎士 at 12.2u. Rides straight through from
   * `_standin-overrides.json` (ContentDb stores the entry object as authored),
   * so no adapter step can drop it.
   */
  standinRelativeScale?: number;
  glbPath?: string;
  clipMap?: ModelDoc["clipMap"];
  /**
   * Per-champion look for the generated blocky humanoids (#226): palette,
   * proportions and prop mask, derived deterministically from the championId by
   * `views/voxelLook.voxelLookFor`.
   *
   * It rides THIS seam, and not `model@1`, on purpose. 44 champions share four
   * model docs, so a content-schema field could not express a per-champion
   * look without splitting the docs — and two of those doc ids are frozen by
   * `packages/shared/src/sim/**`. This interface is already the client-side
   * place where the entity → championId hop happens, so the look arrives with
   * zero content-schema surface and nothing in the sim is touched.
   *
   * Absent for imported champions (which wear their own mesh) and for mobs.
   */
  voxel?: VoxelLook;
}

/**
 * The per-champion relative size multiplier from an override (task #150), or 1.0
 * when there is none / it is non-positive. Prefers the #150 `relativeScale`; a
 * legacy override that only carries `scale` is treated as normal-sized (1.0), so
 * an old absolute scale is never mistaken for a relative multiplier.
 */
export function relativeScaleOf(override: ModelDocOverride | null | undefined): number {
  const r = override?.relativeScale;
  return typeof r === "number" && r > 0 ? r : 1;
}

/**
 * SIZE OVERRIDE FOR A MOB (task #262) — why 一般殭屍 / 特殊殭屍 / 殭屍王 are
 * three different sizes on screen instead of three names for the same one.
 *
 * #262 gave each mob kind its own model doc (`champ.godie-zombiex` scale 1.0 /
 * `champ.mob.zombie-special` 1.22 / `champ.mob.zombie-king` 2.45) and routed the
 * kind onto the wire through `EntityState.key`. That is necessary and NOT
 * sufficient: since #150 `ChampionView.tryUpgradeToGlb` HEIGHT-NORMALIZES every
 * adopted .glb to `TARGET_HEIGHT` (1.8u) and treats `doc.scale` as dead data —
 * the on-screen size comes from `relativeScale` alone. All three mob docs point
 * at the SAME `blocky-undead.glb`, so all three normalized to the identical
 * 1.8u: a 6,000 hp king that looked exactly like the 100 hp zombie next to it.
 * (`mobModelKeyFor` returning three distinct strings is an ATTRIBUTE, not the
 * behaviour — the three keys resolved to three docs that rendered the same.)
 *
 * The per-champion override path cannot cover this: it is keyed by championId
 * via the seat table, and a mob has `seatId === -1` and no seat. So for a MOB —
 * and ONLY a mob — the doc's declared `scale` becomes the relative multiplier,
 * i.e. 「這隻是普通殭屍的 N 倍大」. Champions are untouched (`kind !== MOB`
 * returns null here), which is what keeps #150's normalization intact for the
 * roster it was written for.
 *
 * ── GH#192: THE DOC'S SCALE IS NO LONGER SUFFICIENT ────────────────────────
 *
 * A mob now wears the model OF A CHAMPION, so 一般 / 特殊 / 王 normally resolve
 * to the SAME model doc and the doc's `scale` says the same thing about all
 * three. The per-kind 體型倍率 therefore rides the wire (`EntityState.mana`,
 * decoded into `e.mobScale`) and MULTIPLIES the doc's scale here:
 *
 *     relativeScale = docScale × sizeMult
 *
 * Two factors and not one, deliberately: `docScale` is 「this mesh's natural
 * size」 (a doc authored for a small creature stays small) and `sizeMult` is
 * 「this KIND is N× a normal one of me」 (an admin knob). Collapsing them would
 * make the king's 10× mean something different for every champion the operator
 * picks.
 *
 * `mobScale` absent (a pre-GH#192 server, or a world that never armed the
 * mechanic) falls back to the doc's scale alone = GH#262's exact behaviour.
 */
export function mobModelSizeOverride(
  e: Pick<EntityViewState, "kind" | "mobScale">,
  doc: ModelDoc | null | undefined,
): ModelDocOverride | null {
  if (e.kind !== ENTITY_KIND.MOB) return null;
  const raw = doc?.scale;
  const docScale = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 1;
  const m = e.mobScale;
  const sizeMult = typeof m === "number" && Number.isFinite(m) && m > 0 ? m : 1;
  const relativeScale = docScale * sizeMult;
  // Both degenerate ⇒ 1×, which is what `relativeScaleOf` already defaults to;
  // returning null there keeps the "no override" branch byte-identical.
  return relativeScale === 1 ? null : { relativeScale };
}

/** Apply a per-champion override to a resolved model doc (task #77). */
export function applyModelOverride(
  doc: ModelDoc | null,
  override: ModelDocOverride | null | undefined,
): ModelDoc | null {
  if (!doc || !override) return doc;
  const next: ModelDoc = { ...doc };
  if (typeof override.scale === "number" && override.scale > 0) next.scale = override.scale;
  if (override.glbPath) next.glbPath = override.glbPath;
  if (override.clipMap) next.clipMap = override.clipMap;
  return next;
}

export interface SyncArgs {
  entities: Iterable<EntityViewState>;
  /** pose override seam: interpolation (remotes) / prediction (local) */
  poseFor: (
    e: EntityViewState,
  ) => { x: number; z: number; fx: number; fz: number; h?: number };
  nowMs: number;
  dtMs: number;
  /** try to upgrade champions to .glb models (disabled in headless tests) */
  loadModels?: boolean;
  /**
   * Draw-distance cull: hide champions farther than `maxDistance` planar units
   * from `(cx, cz)` (the followed champion). Omit for no culling.
   */
  cull?: { cx: number; cz: number; maxDistance: number };
  /**
   * ⭐ GH#324 —— **視野遮蔽**：躲在牆後的敵人不畫出來。
   *
   * ⚠️ 這是**純視覺**的，⛔ 不是權威視野：伺服器照樣把每個人的位置送給每個人
   * （快照是一份共用 state，per-client 過濾要 `@filter`／StateView，那會讓編碼
   * 從 O(1) 變成 O(玩家數)）。⇒ 一個改過的客戶端仍然看得到 —— 這個部署是
   * friends-only 的私人站，那個取捨是划算的，但**不可以寫成「有視野系統」**。
   *
   * ⛔ 只遮**敵方**：隊友與自己永遠看得見（隊伍視野）。
   */
  occlude?: { cx: number; cz: number; blocked: (x: number, z: number) => boolean };
  /**
   * SEATS THAT STILL HAVE A CLAIMABLE REVIVE CIRCLE this frame (task #220's
   * exemption). A revive circle is a kind-3 entity whose `seatId` IS THE DEAD
   * OWNER'S SEAT — the wire carries no ownerId, so the SEAT is the only join
   * key. A corpse whose seat is in this set never dissolves: the circle is the
   * anchor a teammate channels on (#84/#206) and #196 gave it no expiry.
   *
   * Supplied by the caller (GameApp.collectEntities already walks every entity
   * and decodes kind 3) rather than derived here, because `entities` is typed
   * `Iterable` — a generator caller would be consumed by a pre-pass.
   *
   * Omitted = no exemption (headless tests / callers with no circles).
   */
  reviveSeats?: ReadonlySet<number>;
}

export class EntityViewRegistry {
  private readonly champions = new Map<number, ChampionView>();
  private readonly projectiles = new Map<number, ProjectileView>();
  private readonly pool: ProjectileView[] = [];
  private readonly flowers = new Map<number, FlowerView>();
  private readonly flowerPool: FlowerView[] = [];
  private readonly guardians = new Map<number, GuardianView>();
  private readonly guardianPool: GuardianView[] = [];
  private readonly reviveCircles = new Map<number, ReviveCircleView>();
  private readonly revivePool: ReviveCircleView[] = [];
  /** 暗夜旗 (71-00 暗夜契約) — pooled exactly like the revive circles. */
  private readonly nightFlags = new Map<number, NightFlagView>();
  private readonly nightFlagPool: NightFlagView[] = [];
  private readonly coins = new Map<number, CoinView>();
  private readonly coinPool: CoinView[] = [];
  private readonly lastPos = new Map<number, { x: number; z: number }>();
  /** smoothed ground speed (units/s) per champion for run-rate sync. */
  private readonly speedEma = new Map<number, number>();
  /** last-applied cull visibility per champion (avoid redundant setEnabled). */
  private readonly culled = new Map<number, boolean>();
  /**
   * 這一幀被 **GH#324 視野遮蔽**藏起來的英雄（⛔ 不含被繪製距離剔除的）。
   *
   * ⭐ 兩者分開記是刻意的：繪製距離是一格**畫質設定**（遠處的敵人血條照樣要看得到），
   * 視野遮蔽是一條**遊戲機制**（「牆後的敵人不畫」）—— 而一條浮在牆後、底下沒有身體
   * 的血條，正是那條機制要藏的東西的完美位置讀數。同一個判斷這個檔案對「隱形」
   * 已經下過一次（見 `setStealthAlpha` 上面那段），這裡只是把它補給遮蔽。
   */
  private readonly occludedIds = new Set<number>();
  /** w3x vertex tint state per champion (task #49); see `applyTint`. */
  private readonly tinted = new Map<number, TintState>();
  /**
   * 變身 (task #249) — the FORM INDEX the live ChampionView for this entity was
   * BUILT with. Half of the rebuild identity; the other half (`modelKey`) is
   * read straight off the view, which has it as a readonly ctor field.
   *
   * A map rather than a field on ChampionView because the form is a REGISTRY
   * concern: the view is a body, and it does not care which of a hero's bodies
   * it happens to be. Absent = 0 = base form, so every pre-#249 entity and every
   * fixture with no `flags` compares equal on the first sync and nothing is
   * rebuilt for free.
   */
  private readonly builtForm = new Map<number, number>();

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetManager,
    private readonly content: ViewContentHooks = {},
  ) {
    // 🔬 GH#610 —— 一行接上生命週期登記表。⭐ 這一整族容器在**場景上看不見**
    // （它們裝的是 view 物件與 per-entity 狀態，⛔ 不是 mesh），所以普查
    // `scene.meshes` 抓不到它們的成長 —— 而「實體走了但這裡沒刪掉」正是
    // 「到第七回合就很難動作」最典型的形狀（每一格都掛著一個活的 view）。
    // ⛔ 沒有對應的 `release()`：讀的是容器**當下**的大小，所以「忘了刪」
    // 這件事本身就是被量的東西，⛔ 不是一個要記得配對的呼叫。
    lifecycleLedger.gaugeContainers("view", {
      champions: this.champions,
      projectiles: this.projectiles,
      projPool: this.pool,
      flowers: this.flowers,
      guardians: this.guardians,
      revives: this.reviveCircles,
      nightFlags: this.nightFlags,
      coins: this.coins,
      lastPos: this.lastPos,
      speedEma: this.speedEma,
      culled: this.culled,
      occluded: this.occludedIds,
      tinted: this.tinted,
      builtForm: this.builtForm,
    });
  }

  get championCount(): number {
    return this.champions.size;
  }

  get projectileCount(): number {
    return this.projectiles.size;
  }

  get flowerCount(): number {
    return this.flowers.size;
  }

  get guardianCount(): number {
    return this.guardians.size;
  }

  get reviveCircleCount(): number {
    return this.reviveCircles.size;
  }

  get coinCount(): number {
    return this.coins.size;
  }

  getChampionView(entityId: number): ChampionView | undefined {
    return this.champions.get(entityId);
  }

  /** Last rendered planar position of an entity (view space), if known. */
  posOf(entityId: number): { x: number; z: number } | null {
    const p = this.lastPos.get(entityId);
    return p ? { x: p.x, z: p.z } : null;
  }

  /**
   * 這具身體這一幀被 **GH#324 視野遮蔽**藏起來了嗎？（⛔ 繪製距離剔除不算）
   *
   * 消費者是 `GameApp.updateFrameBus`：藏起來的身體**不掛血條**。少了這一格，
   * 牆後的敵人會留下一條浮在半空、底下沒有東西的血條 —— 那就是 owner
   * 2026-08-19「模型都沒畫出來但[血條]在」的那一半。
   */
  isOccluded(entityId: number): boolean {
    return this.occludedIds.has(entityId);
  }

  /** Event fanout → animation pulses on the affected views. */
  handleEvent(ev: EventMessage, nowMs: number): void {
    switch (ev.type) {
      // castBegin carries the real cast STARTUP: the sim resolves the ability
      // exactly that long from now. `beginCast` plans the clip so its release
      // frame lands ON that damage tick (see views/ChampionView + anim/castStrike)
      // instead of spanning the clip across the startup, which threw the move
      // ~0.24 s early on a 0.6 s cast. abilityCast (instant abilities, ct = 0)
      // keeps the short default pulse — there is no wind-up to align to.
      //
      // `ticks` is the authority when both are present: it is the integer tick
      // count CastResolveSystem actually counts down (`round(castTimeSec / dt)`),
      // so it already carries the sim's rounding. castTimeSec is the fallback for
      // an older/partial payload.
      case "castBegin": {
        const caster = ev.data.caster as number | undefined;
        if (caster === undefined) break;
        const secs = typeof ev.data.castTimeSec === "number" ? ev.data.castTimeSec : 0;
        const ticks = typeof ev.data.ticks === "number" ? ev.data.ticks : 0;
        const startupMs = Math.max(1, ticks > 0 ? ticks * TICK_MS : secs * 1000);
        this.champions.get(caster)?.beginCast(startupMs, nowMs);
        break;
      }
      case "abilityCast": {
        const caster = ev.data.caster as number | undefined;
        if (caster !== undefined) this.champions.get(caster)?.pulse("cast", nowMs);
        break;
      }
      // castEnd and castInterrupt are NOT the same moment and must not share a
      // branch any more. castEnd = the sim resolved the ability, so the release
      // frame is playing right now and the follow-through has to finish (cutting
      // it here reintroduces the lie from the other side). castInterrupt = the
      // cast was BROKEN by a stun/knockdown/death, so the move never comes out
      // and the pose is cut.
      case "castEnd": {
        const caster = ev.data.caster as number | undefined;
        if (caster !== undefined) this.champions.get(caster)?.releaseCast(nowMs);
        break;
      }
      case "castInterrupt": {
        const caster = ev.data.caster as number | undefined;
        if (caster !== undefined) this.champions.get(caster)?.endCast();
        break;
      }
      // attackWindup leads the swing: PLAN the attack clip so its contact frame
      // lands on the damage tick `basicAttack` fires at (GH#40). This used to
      // pass `windowMs: windupMs / 0.5` and let `pulseSpeedRatio` stretch the
      // clip to fill it — which the animator's [0.5x, 3x] rate clamp then broke
      // without saying so, exactly as it did for casts before `alignPulseClip`.
      // `beginAttack` goes through the same plan the cast path does, and reads
      // the per-model fraction from `anim/castStrike` instead of a fixed 0.5.
      case "attackWindup": {
        const source = ev.data.source as number | undefined;
        if (source === undefined) break;
        const ticks = typeof ev.data.ticks === "number" ? ev.data.ticks : 0;
        this.champions.get(source)?.beginAttack(Math.max(1, ticks * TICK_MS), nowMs);
        break;
      }
      // basicAttack fires at the swing/damage point. If a wind-up already
      // started the clip, just extend the attack state — restarting here
      // would visibly reset the swing mid-strike.
      case "basicAttack": {
        const source = ev.data.source as number | undefined;
        if (source !== undefined) {
          const view = this.champions.get(source);
          // ATTACKER FLASH (task #69): the swing connects → a brief white impact
          // pop on the attacker. Melee autos never flashed the attacker before,
          // so the strike read only on the victim. `[...]` copies the readonly
          // tunable into the mutable tuple `flash` expects.
          view?.pulse("attack", nowMs, { restartClip: false });
          view?.flash([...ATTACKER_FLASH_RGB], nowMs, ATTACKER_FLASH_MS);
        }
        break;
      }
      // hitImpact → the ONE orchestrated on-hit moment. combatFeedback turns the
      // sim's single ImpactProfile into ONE coordinated set of reactions; here we
      // DISPATCH the three we own onto the two views — hurt flinch + victim flash
      // + AUTHORITATIVE hitstop on the victim, and a matching freeze + white "I
      // connected" pop on the attacker (Capcom "both freeze") — all scaled by the
      // SAME tier. The freeze comes VERBATIM from profile.hitstopTicks (never
      // re-derived from the damage amount), so a fully-blocked hit (dmg 0 but
      // impact ≥ the sim floor) still freezes both bodies and the pose un-freezes
      // exactly with the body. `hitImpact` co-ticks with `damage`, and always
      // carries the profile, so it is the single source for the freeze window.
      // The plan's `shake` REQUEST + spark/camera/sfx/number hooks are consumed
      // by later waves (GameApp/VfxSystem/UI), not here.
      case "hitImpact": {
        const profile = asImpactProfile(ev.data.profile);
        if (!profile) break; // pre-profile replay / malformed payload → no-op
        const target = ev.data.target as number | undefined;
        const source = ev.data.source as number | undefined;
        const dmgType = (ev.data.dmgType ?? ev.data.type) as string | undefined;
        const plan = planImpactFeedback(profile, { dmgType, tickMs: TICK_MS });
        if (target !== undefined) {
          const view = this.champions.get(target);
          if (view) {
            view.triggerHurt(nowMs);
            view.flash(plan.victimFlash.rgb, nowMs, plan.victimFlash.ms, plan.victimFlash.alpha);
            view.setHitstop(plan.freezeMs, nowMs);
          }
        }
        if (source !== undefined) {
          const sourceView = this.champions.get(source);
          sourceView?.flash(
            plan.attackerFlash.rgb,
            nowMs,
            plan.attackerFlash.ms,
            plan.attackerFlash.alpha,
          );
          sourceView?.setHitstop(plan.freezeMs, nowMs);
        }
        break;
      }
      // unblocked heavy hit → KNOCKDOWN: a longer prone/getup flinch on the victim.
      case "knockdown": {
        const target = ev.data.target as number | undefined;
        if (target !== undefined) this.champions.get(target)?.triggerKnockdown(nowMs);
        break;
      }
      // CORPSE DISSOLVE (playtest directive #220) — arm the 3 s lie-down clock.
      // The EVENT is the only honest "this body died" signal: `alive === false`
      // is also true in champ-select, through the whole intermission, for a
      // bye/parked seat (MatchController.enterCombat parks every seat dead) and
      // during settlement, and dissolving those would empty the screen outside
      // combat. Exactly the signal task #85 arms its death-spectator wash with.
      case "death": {
        const id = ev.data.id as number | undefined;
        if (id !== undefined) this.champions.get(Number(id))?.noteDeath(nowMs);
        break;
      }
      default:
        break;
    }
  }

  /**
   * w3x VERTEX TINT (task #49) — multiply the champion's materials by its
   * ported `tint` and set `alpha` when it is translucent.
   *
   * Two things make this a small state machine rather than a one-liner:
   *   1. the seat table behind `championTintFor` is not populated the instant
   *      the entity appears, so an unresolved lookup must be RETRIED, not
   *      cached as "untinted";
   *   2. the .glb arrives asynchronously (`tryUpgradeToGlb`), so the tint has
   *      to be re-applied once its meshes exist. `applyModelTint` is
   *      idempotent, so the second pass only touches the new meshes.
   * Untinted champions (93 of 113) settle to `tint: null` and cost one map
   * lookup per frame from then on.
   */
  private applyTint(e: EntityViewState, view: ChampionView, tier: GrowthTier): void {
    let st = this.tinted.get(e.id);
    if (!st) {
      const resolved = this.content.championTintFor?.(e);
      if (resolved === undefined) return; // seat/content not known yet — retry
      st = { tint: resolved, glbPainted: false, tier: 0 };
      this.tinted.set(e.id, st);
      if (!resolved && tier === 0) return; // untinted AND unmudded: never touch
      applyModelTint(view.root, composeGrowth(resolved, tier)); // procedural / early meshes
      st.tier = tier;
    }
    // #244: a tier change repaints EVERY time, glb or not — `applyModelTint`
    // recomputes from each material's remembered source colour, so this cannot
    // compound and re-entering tier 0 restores the plain champion colour.
    if (st.tier !== tier) {
      st.tier = tier;
      applyModelTint(view.root, composeGrowth(st.tint, tier));
      st.glbPainted = view.hasGlb;
      return;
    }
    if ((!st.tint && tier === 0) || st.glbPainted || !view.hasGlb) return;
    st.glbPainted = true;
    applyModelTint(view.root, composeGrowth(st.tint, tier)); // the .glb meshes just landed
  }

  /**
   * THE CHAMPION EXIT SEQUENCE — the one place a ChampionView is torn down.
   *
   * Extracted (task #249) so the 變身 REBUILD below and the ordinary
   * "entity left the snapshot" removal cannot drift apart. They must not: the
   * hazard here is not the dispose, it is the FIVE per-entity maps keyed by the
   * same id. Miss `culled` and the rebuilt body inherits a stale visibility
   * compare (`culled.get(id) !== hidden` is false, so `setEnabled` is never
   * written and an out-of-range champion renders anyway); miss `tinted` and
   * `applyTint` believes the fresh materials are already painted; miss
   * `speedEma`/`lastPos` and the new body inherits the old one's motion history.
   * A single teardown means the next map added to this class is impossible to
   * half-wire.
   *
   * `releaseModelTint` runs BEFORE dispose: `ChampionView.dispose()` only frees
   * the materials it created itself, so an unreleased tint clone would leak and
   * leave the cached .glb material swapped out of the meshes that still need it.
   *
   * ⚠️ #262 —— 這裡以前寫的是 `if (this.tinted.get(id)?.tint) release…`，而那個
   * 條件是**錯的**：clone 材質不是只有「有 w3x 顏色的英雄」才會產生。
   * `applyTint` 走的是 `composeGrowth(tint, tier)`，只要成長階級 > 0（#244
   * 黑泥吞噬，殭屍每一場都在餵），`tint === null` 的英雄一樣會被 clone 一輪
   * 材質 —— 而 113 位裡有 93 位就是 `tint === null`。於是那一群的 clone 從來
   * 沒有被歸還過。entity id 每次重生都是新的，所以每一次死亡/重生都留下一組。
   *
   * 量到的（`EntityViewRegistry.tintLeak.test.ts`，10 具身體 × 6 回合）：
   * `scene.materials` 30 → 60 → 90 → 120 → 150 → 180，完美線性，而且
   * `registry.dispose()` 之後仍然是 180。這就是「越打越鈍」的單調成長。
   *
   * 現在**無條件**呼叫。`releaseModelTint` 只認材質上的 `ggdTint` 標記，沒有
   * 標記的它一個都不碰，所以對真的沒上色的身體是 no-op；而把條件寫在這裡等於
   * 每加一個新的 tint 來源就要記得回來改一次 —— #244 就是這樣漏掉的。
   */
  private retireChampion(id: number, view: ChampionView): void {
    releaseModelTint(view.root);
    view.dispose();
    this.champions.delete(id);
    this.lastPos.delete(id);
    this.speedEma.delete(id);
    this.culled.delete(id);
    this.occludedIds.delete(id);
    this.tinted.delete(id);
    this.builtForm.delete(id);
  }

  /** Per-frame diff + imperative transform/animation write. */
  sync(args: SyncArgs): void {
    const seen = new Set<number>();

    for (const e of args.entities) {
      seen.add(e.id);
      if (e.kind === 1) {
        let view = this.projectiles.get(e.id);
        if (!view) {
          view = this.pool.pop() ?? new ProjectileView(this.scene);
          view.activate(
            this.content.projectileVfxFor?.(e.key) ?? null,
            this.content.projectileMeshShapeFor?.(e.key) ?? "bolt",
            this.content.projectileHitRadiusFor?.(e.key) ?? undefined,
            this.content.projectileFlightFor?.(e.key) ?? null,
          );
          this.projectiles.set(e.id, view);
        }
        const pose = args.poseFor(e);
        view.setPose(pose.x, pose.z);
        continue;
      }

      if (e.kind === 2) {
        // neutral healing flower — pooled like projectiles, .glb-upgraded
        // like champions (model doc keyed by es.key = "prop.flower")
        let view = this.flowers.get(e.id);
        if (!view) {
          view = this.flowerPool.pop() ?? new FlowerView(this.scene);
          view.activate(e.id);
          this.flowers.set(e.id, view);
        }
        if (args.loadModels !== false && !view.upgradeAttempted) {
          view.tryUpgradeToGlb(this.assets, this.content.modelDocFor?.(e.key) ?? null);
        }
        const pose = args.poseFor(e);
        view.setPose(pose.x, pose.z);
        view.setAlive(e.alive);
        view.update(args.nowMs);
        this.lastPos.set(e.id, { x: pose.x, z: pose.z });
        continue;
      }

      if (e.kind === 4) {
        // NEUTRAL duel-zone GUARDIAN (task #89/#105) — pooled like the flower,
        // .glb-upgraded like champions (per-arena model doc keyed by es.key:
        // 樹人 / 石頭人 / 巨獸人). NEVER team-tinted — its neutrality is the
        // contract, so it deliberately skips applyTint and the seatId path.
        let view = this.guardians.get(e.id);
        if (!view) {
          view = this.guardianPool.pop() ?? new GuardianView(this.scene);
          view.activate(e.id);
          this.guardians.set(e.id, view);
        }
        if (args.loadModels !== false && !view.upgradeAttempted) {
          view.tryUpgradeToGlb(this.assets, this.content.modelDocFor?.(e.key) ?? null);
        }
        const pose = args.poseFor(e);
        view.setPose(pose.x, pose.z);
        view.setAlive(e.alive);
        view.update(args.nowMs);
        this.lastPos.set(e.id, { x: pose.x, z: pose.z });
        continue;
      }

      if (e.kind === 5) {
        // DROPPED GOLD COIN (task #191) — pooled, fully procedural (there is no
        // coin asset, and no GlowLayer in this scene, so CoinView builds its own
        // 閃光 out of additive emissive). No .glb upgrade, no health, no bar.
        let view = this.coins.get(e.id);
        if (!view) {
          view = this.coinPool.pop() ?? new CoinView(this.scene);
          view.activate(e.id);
          this.coins.set(e.id, view);
        }
        const pose = args.poseFor(e);
        view.setPose(pose.x, pose.z);
        view.update(args.nowMs);
        this.lastPos.set(e.id, { x: pose.x, z: pose.z });
        continue;
      }

      if (e.kind === ENTITY_KIND.NIGHT_FLAG) {
        // 暗夜旗 (71-00 暗夜契約) — pooled, fully procedural. The ring's SIZE is
        // the aura radius and comes off the wire (`nightFlag.radius`, packed by
        // the server into `EntityState.shield` AFTER the #136 range factor), so
        // the circle a player reads is exactly the circle the sim tests.
        let view = this.nightFlags.get(e.id);
        if (!view) {
          view = this.nightFlagPool.pop() ?? new NightFlagView(this.scene);
          view.activate(e.nightFlag?.radius ?? 0);
          this.nightFlags.set(e.id, view);
        }
        const pose = args.poseFor(e);
        view.setPose(pose.x, pose.z);
        view.update(args.nowMs);
        this.lastPos.set(e.id, { x: pose.x, z: pose.z });
        continue;
      }

      if (e.kind === 3) {
        // revive circle — pooled, fully procedural (no model doc). Progress /
        // lifetime / contest all come off the wire; the view only paints them.
        const rv = e.revive;
        let view = this.reviveCircles.get(e.id);
        if (!view) {
          view = this.revivePool.pop() ?? new ReviveCircleView(this.scene);
          view.activate(e.id, e.teamId, rv?.radius ?? 2);
          this.reviveCircles.set(e.id, view);
        }
        const pose = args.poseFor(e);
        view.setPose(pose.x, pose.z);
        view.update(args.nowMs, {
          progress: rv?.progress ?? 0,
          channelling: rv?.channelling ?? false,
          contested: rv?.contested ?? false,
        });
        this.lastPos.set(e.id, { x: pose.x, z: pose.z });
        continue;
      }

      let view = this.champions.get(e.id);
      // 變身 BODY SWAP (task #249) — THE REBUILD. Everything that decides what a
      // champion body looks like is a CONSTRUCTION-TIME input to ChampionView:
      // `modelKey` is a readonly ctor parameter with no setter (it picks the glb
      // yaw offset and the fallback accent), the voxel skin decides the boxes and
      // their UVs, and the .glb load is behind a one-way `upgradeStarted` latch
      // that `tryUpgradeToGlb` is only asked about while `!view.upgradeAttempted`.
      // So a transformed champion whose identity changed would keep its OLD body
      // forever: the sim swaps, the snapshot ships it, every test stays green, and
      // the player watches the wrong model. The only honest fix is to throw the
      // view away and let the construction branch below run again — on the new
      // view the latch is false, so the glb reloads, and growthTier / applyTint /
      // selfMarker are written every frame and catch up on their own.
      //
      // IDENTITY = (modelKey, form index). Both halves are load-bearing:
      //   · `e.key` — the sim's `Champions.get(championId).modelKey`, recomputed
      //     from `ChampionComp.championId` every tick by the snapshot;
      //   · the FORM bits — because all four shipped transform pairs share ONE
      //     modelKey between their halves (see ENTITY_FLAG.FORM_A), so `key`
      //     alone provably never changes for the content that exists today.
      // `view.modelKey` is read off the LIVE VIEW rather than off a bookkeeping
      // map, so the compare is against what was actually constructed.
      const form = formIndexFromFlags(e.flags ?? 0);
      if (view && (view.modelKey !== e.key || (this.builtForm.get(e.id) ?? 0) !== form)) {
        this.retireChampion(e.id, view);
        view = undefined;
      }
      if (!view) {
        // The skin is a CONSTRUCTION-TIME input: it decides the boxes, their
        // UVs and the motif geometry, so it cannot be applied after the fact.
        // `undefined` (seat table not filled in yet) resolves to no skin for
        // this view — the plain figure — which is the same graceful degradation
        // the tint path has, and the view is rebuilt on the next respawn.
        const skin = this.content.voxelSkinFor?.(e) ?? null;
        view = new ChampionView(this.scene, e.id, e.key, e.teamId, { skin });
        this.champions.set(e.id, view);
        this.builtForm.set(e.id, form);
      }
      // idempotent: no-ops once started or while no model doc is available.
      // A per-champion override (task #77) preserves the map's declared model
      // (glbPath/clipMap) over the shared stand-in doc; its `relativeScale`
      // (task #150) is threaded through as the intentional size multiplier on top
      // of ChampionView's height-normalization, before the glb is adopted.
      if (args.loadModels !== false && !view.upgradeAttempted) {
        const override = this.content.modelOverrideFor?.(e);
        // #223 —— `form` (decoded above) rides along so the resolver can ask
        // about the body that is ACTUALLY on screen. See `modelDocFor`'s doc.
        const baseDoc = this.content.modelDocFor?.(e.key, e.seatId, form) ?? null;
        const doc = applyModelOverride(baseDoc, override);
        // #226: the per-champion blocky look is adopted BEFORE the glb load is
        // kicked off, so the procedural fallback is already in the champion's
        // own colours while the mesh is still in flight.
        view.setVoxelLook(override?.voxel);
        // #77: TWO numbers, because there are two bodies. `relativeScale` sizes
        // the champion's own model; `standinRelativeScaleOf` sizes the generated
        // box-man it falls back to. The view picks per body — it is the only
        // layer that knows which one actually rendered (the glb may still be in
        // flight, or `preferVoxelBody` may decline it outright).
        view.tryUpgradeToGlb(
          this.assets,
          doc,
          relativeScaleOf(override),
          standinRelativeScaleOf(override),
        );
      }
      // #249 GH#288 變身球體掛件 —— OUTSIDE the `!upgradeAttempted` gate above,
      // and that is load-bearing: the attach point lives in the body glb's own
      // frame, so it can only be hung AFTER the async adopt resolves, which is
      // strictly LATER than the frame that started it. Inside that gate the
      // call would happen exactly once, always too early, and 悟空 would
      // transform into an identically-headed 悟空 with every test still green
      // (失敗形態 ②). `setFormAttachment` is idempotent and only latches once
      // it has really started a load, so asking every frame is free.
      if (args.loadModels !== false) {
        view.setFormAttachment(this.assets, this.content.formAttachmentFor?.(e) ?? null);
      }
      // #244 — the growth tier, read from two bits of the authoritative flags
      // word. Ordered AFTER the tint on purpose: `applyTint` owns the composed
      // colour (mud is folded into the #49 multiply), and `setGrowthTier` owns
      // the size, so the two never race for the same material.
      const tier = growthTierFromFlags(e.flags ?? 0);
      this.applyTint(e, view, tier);
      view.setGrowthTier(tier, args.nowMs);
      // #247 「殭屍王底下圈圈會比較大」 —— written every sync (the setter
      // early-returns when the number has not moved), so a king whose
      // `mobVisualJson` arrives a frame after its entity still gets its ring.
      view.setGroundRingDiameter(this.content.groundRingDiameterFor?.(e) ?? null);
      // #268 「自己角色更顯眼」 — the halo + caret that say WHICH of the twelve
      // bodies is yours. Driven by a flag on the entity rather than resolved
      // here: `localEntityId` lives in the HUD store that render/** is walled
      // off from (client-08), exactly like the tint / voxel-look seams above.
      // Written every sync (the method early-returns on no change), so a
      // champion that becomes local mid-match — the entity id is re-issued on
      // every respawn — picks the marker up on the next frame.
      view.setSelfMarker(e.isLocal === true);
      // 隱形 (owner 2026-07-30 「選小的就好」) —— the render half. Read off the
      // SAME authoritative flags word #244/#249 use, so the body the client
      // fades out is exactly the body the server's targeting refuses to
      // acquire. `friendly` decides WHICH of the two opacities applies: your
      // own team keeps a translucent silhouette, the enemy gets `enemyAlpha`
      // (0 = gone). Written every sync, never latched — 破隱 is a per-tick fact.
      view.setStealthAlpha(
        stealthVisualFor((e.flags ?? 0) & ENTITY_FLAG.INVISIBLE ? true : false, e.friendly === true)
          .alpha,
      );
      const pose = args.poseFor(e);
      // #247: the interpolated height rides the same pose seam as x/z. The
      // AIRBORNE flag comes off the entity (not off `h > 0`) so takeoff and
      // landing ticks, where h is exactly 0, still count as in-flight.
      view.setPose(pose.x, pose.z, pose.fx, pose.fz, pose.h ?? e.h ?? 0, e.airborne === true);

      // ⭐ `lastPos` 是 {@link posOf} **唯一**的答案，而 `posOf()` 正是血條錨點、
      // 施法特效（`VfxSystem` 的 `entityPos`）、狀態光環、遠端腳步與空間音訊
      // 讀位置的地方。所以它必須為**每一個同步到的實體**寫下去，
      // ⛔ 不可以留在下面那個 `if (hidden) continue` 的後面。
      //
      // ⚠️ 留在後面的後果 owner 2026-08-19 逐字描述過：「兩個 bot **在界外**並且
      // **模型都沒畫出來但有施法特效**⋯**過了一陣子才突然出現在場內**」。
      // 大聖杯洞窟開場那一刻，從我方出生點 (-19,1) 看過去，牆剛好擋住敵方的
      // (19,-3) 與 (19,5) 兩個座位 ⇒ 那兩具身體被遮蔽剔除 ⇒ 這一行不跑 ⇒
      // 血條與施法特效被釘在**上一次看得到他們的位置**，而回合交界時那個位置
      // 屬於**上一張場地**（中場是 arena.skeleton 的 x=-24），於是它落在
      // 大聖杯洞窟地板外面的虛空上。走出牆後才「突然出現在場內」。
      //
      // ⚠️ `last` 必須在覆寫**之前**取，否則位移永遠是 0，跑步動畫整個消失。
      const last = this.lastPos.get(e.id);
      this.lastPos.set(e.id, { x: pose.x, z: pose.z });

      // draw-distance cull: hide champions beyond the configured radius
      // ⭐ GH#324 —— 牆後的敵人不畫。⛔ 只遮敵方（`friendly !== true` 且不是自己），
      // 而且是**純視覺**：伺服器照樣送位置，這裡只是不畫。
      const occluded =
        args.occlude !== undefined &&
        e.friendly !== true &&
        e.isLocal !== true &&
        args.occlude.blocked(pose.x, pose.z);
      if (occluded) this.occludedIds.add(e.id);
      else this.occludedIds.delete(e.id);
      if (args.cull || occluded) {
        const dx = pose.x - (args.cull?.cx ?? pose.x);
        const dz = pose.z - (args.cull?.cz ?? pose.z);
        const far =
          args.cull !== undefined &&
          dx * dx + dz * dz > args.cull.maxDistance * args.cull.maxDistance;
        const hidden = far || occluded;
        if (this.culled.get(e.id) !== hidden) {
          view.root.setEnabled(!hidden);
          this.culled.set(e.id, hidden);
        }
        if (hidden) continue; // skip anim work for culled champions
      } else if (this.culled.get(e.id)) {
        view.root.setEnabled(true);
        this.culled.set(e.id, false);
      }

      // authoritative anim inputs: alive flag + observed movement (`last` was
      // read above, BEFORE this frame's position overwrote it)
      const distSq = last
        ? (pose.x - last.x) * (pose.x - last.x) + (pose.z - last.z) * (pose.z - last.z)
        : 0;
      // A relocation (spawn/respawn/zone change/blink) is not locomotion: the
      // pose seam SNAPS across it by design, so feeding that one-frame jump
      // into the run-rate EMA would fire off a phantom sprint. Ignore the frame
      // for animation purposes and resync from the new position next frame.
      const teleported = distSq > TELEPORT_STEP_UNITS * TELEPORT_STEP_UNITS;
      // #247: a LEAPING champion is not locomoting. It covers ~0.33 u/tick of
      // planar distance — comfortably under TELEPORT_STEP_UNITS — so without
      // this gate the run clip would play and the champion would run through the
      // air with its legs cycling. Forced to standing for the whole flight, the
      // flag being true on the takeoff/landing ticks too.
      const flying = e.airborne === true;
      const moving = last && !teleported && !flying ? distSq > 1e-6 * args.dtMs : false;
      // smoothed ground speed (u/s) → run-clip rate sync (foot-slide fix)
      const instSpeed =
        last && !teleported && !flying ? (Math.sqrt(distSq) / Math.max(args.dtMs, 1)) * 1000 : 0;
      const prevSpeed = this.speedEma.get(e.id) ?? instSpeed;
      const speed = prevSpeed + (instSpeed - prevSpeed) * SPEED_SMOOTH;
      this.speedEma.set(e.id, speed);
      const state = view.anim.update({ alive: e.alive, moving }, args.nowMs);
      // #220 revive exemption, re-evaluated EVERY frame (never latched): the
      // `death` event and the snapshot patch carrying the circle can land in
      // either order, and the circle ends the moment the rescue is spent.
      view.setReviveProtected(e.seatId >= 0 && args.reviveSeats?.has(e.seatId) === true);
      view.update(state, args.nowMs, args.dtMs, speed);
    }

    // removals
    for (const [id, view] of this.champions) {
      if (!seen.has(id)) this.retireChampion(id, view);
    }
    for (const [id, view] of this.projectiles) {
      if (!seen.has(id)) {
        view.deactivate();
        this.projectiles.delete(id);
        this.pool.push(view);
      }
    }
    for (const [id, view] of this.flowers) {
      if (!seen.has(id)) {
        view.deactivate();
        this.flowers.delete(id);
        this.lastPos.delete(id);
        this.flowerPool.push(view);
      }
    }
    for (const [id, view] of this.guardians) {
      if (!seen.has(id)) {
        view.deactivate();
        this.guardians.delete(id);
        this.lastPos.delete(id);
        this.guardianPool.push(view);
      }
    }
    for (const [id, view] of this.reviveCircles) {
      if (!seen.has(id)) {
        view.deactivate();
        this.reviveCircles.delete(id);
        this.lastPos.delete(id);
        this.revivePool.push(view);
      }
    }
    for (const [id, view] of this.coins) {
      if (!seen.has(id)) {
        view.deactivate();
        this.coins.delete(id);
        this.lastPos.delete(id);
        this.coinPool.push(view);
      }
    }
    // 暗夜旗: the sim destroys every flag at combat exit (endCombatNightPact),
    // so the entity simply stops being published and this sweep retires the
    // ring. Without the sweep a black circle would sit on the arena floor
    // through the shop and into the next round.
    for (const [id, view] of this.nightFlags) {
      if (!seen.has(id)) {
        view.deactivate();
        this.nightFlags.delete(id);
        this.lastPos.delete(id);
        this.nightFlagPool.push(view);
      }
    }
  }

  dispose(): void {
    // #262: unconditional, same reason as `retireChampion` — a growth-tier
    // clone exists on bodies whose `tinted` entry has `tint: null`, and the old
    // `?.tint` guard walked straight past every one of them.
    for (const v of this.champions.values()) releaseModelTint(v.root);
    this.tinted.clear();
    this.builtForm.clear();
    for (const v of this.champions.values()) v.dispose();
    for (const v of this.projectiles.values()) v.dispose();
    for (const v of this.pool) v.dispose();
    for (const v of this.flowers.values()) v.dispose();
    for (const v of this.flowerPool) v.dispose();
    for (const v of this.guardians.values()) v.dispose();
    for (const v of this.guardianPool) v.dispose();
    for (const v of this.reviveCircles.values()) v.dispose();
    for (const v of this.revivePool) v.dispose();
    for (const v of this.coins.values()) v.dispose();
    for (const v of this.coinPool) v.dispose();
    for (const v of this.nightFlags.values()) v.dispose();
    for (const v of this.nightFlagPool) v.dispose();
    this.champions.clear();
    this.projectiles.clear();
    this.pool.length = 0;
    this.flowers.clear();
    this.flowerPool.length = 0;
    this.guardians.clear();
    this.guardianPool.length = 0;
    this.reviveCircles.clear();
    this.revivePool.length = 0;
    this.coins.clear();
    this.coinPool.length = 0;
    this.nightFlags.clear();
    this.nightFlagPool.length = 0;
  }
}
