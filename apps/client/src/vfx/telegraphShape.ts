/**
 * telegraphShape — the UNIVERSAL, CONTENT-DRIVEN derivation of a cast
 * telegraph's ground shape (task #228).
 *
 * WHY THIS FILE EXISTS. The telegraph used to be a side effect of ONE castType:
 * `VfxSystem` spawned a ring only when the `abilityCast` event happened to carry
 * a `point`, and the ring could only ever be a circle. The sim sets `point` for
 * `ground` (a real AoE) AND for `targeted` (the victim's feet — not an area at
 * all), so 90 single-target abilities on the open roster drew a fabricated
 * `1.2 × 0.6 = 0.72u` circle that LIED about the hit, while every `self`,
 * `skillshot` and `dash` cast drew nothing on the floor whatsoever. A player
 * cannot dodge what is not drawn, and cannot learn from a shape that is wrong.
 *
 * So the shape is DERIVED, per ability, from the data the ability already
 * carries — `castType`, `range`, `radius`, its `dash`/projectile effects — and
 * the derivation is a pure function with NO Babylon, NO DOM and no registry
 * lookups, so the whole enabled roster can be swept in a node test
 * (`telegraphCoverage.test.ts`). An ability whose shape cannot be derived
 * returns `null`, which is a TEST FAILURE — never a silent fallback that draws
 * a plausible-looking lie.
 *
 * HONESTY RULES (every constant below mirrors a real line of sim):
 *   • `ground`   → circle at the cast point, `(radius ?? 1) × abilityRange`.
 *     The `?? 1` is NOT an invention: it is the sim's own default, at
 *     `abilitySystem.ts` `enemiesInCircle(..., resolveAbilityRadius(world,
 *     def.radius ?? 1))` and re-applied in `CastResolveSystem.ts`. The old
 *     `?? 1.2` in VfxSystem matched nothing in the sim.
 *     ⭐ EXCEPT when the ability carries a `damageLine` — see the next block.
 *   • `ground` + `damageLine` → LINE. See `groundLashGeometry` below; this is
 *     the one place where the castType alone is NOT the whole answer.
 *   • `targeted` → LOCK: an arc at the victim's feet + a tether back to the
 *     caster. The sim hits exactly ONE entity, so there is no area to draw and
 *     a circle would teach a dodge that does not exist. The arc is the body
 *     radius (`spawnChampion.ts` `radius: 0.6`), NOT multiplied — a body is a
 *     body, `abilityRange` never touches it.
 *   • `skillshot`→ LINE along the aim, `projectile.maxRange × abilityRange`
 *     long (`effectRunner.ts` `remainingRange: resolveAbilityRange(world,
 *     def.maxRange)`) and `projectile.hitRadius × 2` wide (the sim does NOT
 *     scale hitRadius). No projectile effect ⇒ no derivable corridor ⇒ null.
 *   • `dash`     → LINE along the aim, `effect.maxDistance` long — deliberately
 *     UNMULTIPLIED, because `startDash` takes the raw `maxDistance` and
 *     `abilityRange` never reaches it. Width is the caster's own body diameter,
 *     which is exactly what a dash sweeps.
 *   • `self`     → a caster-centred marker at the body radius. `castType:
 *     "self"` targets `[caster]` and nothing else in the sim, so an authored
 *     `radius` on a self ability is decorative and drawing it would be the same
 *     class of lie the targeted circle was. The marker says "this champion is
 *     about to gain something", which is true, and its shape says "walking away
 *     does not help", which is also true.
 *
 * A PASSIVE-ONLY ability is never cast, therefore never telegraphs; it is
 * reported as PASSIVE by the audit rather than MISSING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ THE ONE REGISTRY READ (`uiCues()`), AND WHY THE SWEEP STILL RUNS HEADLESS
 *
 * The header above used to claim "no registry lookups". There is now exactly
 * one: `uiCues().telegraphGroundShape`, the rollback knob for the ground-lash
 * rule below (第一守則 — a decision point is a field, not a literal). It goes
 * through `ui/uiCuesConfig`, which is a LAZY `Configs.tryGet()` with a pure
 * shipped-default fallback, so in a node test with no content registered it
 * returns `DEFAULT_UI_CUES` and the whole-roster sweep still works — no
 * Babylon, no DOM, no `ContentLoader` boot required.
 */

import { clampSpreadRadius } from "@ggd/shared/sim/effects/spreadLimits";
import { uiCues } from "../ui/uiCuesConfig";

/** castType values, mirrored from `@ggd/shared/sim/content/defs` CastType. */
export type TelegraphCastType = "targeted" | "skillshot" | "ground" | "self" | "dash";

/**
 * The SIM's own default AoE radius for a `ground` ability with no authored
 * `radius` (`abilitySystem.ts` / `CastResolveSystem.ts`: `def.radius ?? 1`).
 * Pinned by `telegraphShape.test.ts` against the real sim source so the ring
 * can never silently drift away from the circle the damage query uses.
 */
export const SIM_GROUND_DEFAULT_RADIUS = 1;

/**
 * Champion body radius (`spawnChampion.ts` `radius: 0.6`). Used for the
 * targeted LOCK arc, the self marker and the dash corridor's half-width — all
 * three are "the size of a champion", not an ability AoE, so none of them is
 * scaled by `abilityRange`.
 */
export const BODY_RADIUS = 0.6;

/** Minimum drawable extent (world units) — below this nothing reads on screen. */
const MIN_EXTENT = 0.05;

/** Ability fields the derivation needs. Structurally satisfied by AbilityDef. */
export interface TelegraphAbilityLike {
  readonly castType: TelegraphCastType;
  readonly range: number;
  readonly radius?: number;
  readonly effects: readonly TelegraphEffectLike[];
  readonly passive?: unknown;
}

export interface TelegraphEffectLike {
  readonly kind?: string;
  readonly projectileId?: string;
  readonly maxDistance?: number;
  /**
   * GH#393 沿向量分段推進（`delayed` + `advance`）—— 走廊的長與寬從這三格算出來。
   * ⚠️ `count` 寫成聯集是**必要**的，⛔ 不是偷懶：`delayed.count` 是單一數字，
   * 而同一個 `EffectDef` union 裡的 `randomArea.count` 是 **per-rank 陣列**。
   * 窄成 `number` 會讓整個 union 賦值不過去 —— 使用端一律 `typeof === "number"` 才讀。
   */
  readonly count?: number | readonly number[];
  readonly radius?: number;
  readonly advance?: {
    readonly stepDist: number;
    readonly startDist?: number;
    readonly dir?: "facing" | "target";
  };
  /**
   * GH#553 **會動的模型**（`spawnModelFx`）—— 走廊的長與寬從這三格算出來。
   * ⚠️ `path` 寫成 `string` 而不是那個 enum 的聯集是刻意的：這個介面是**結構性**的
   * （`telegraphShape.ts` 不 import 內容 schema），窄成聯集會讓真的 `EffectDef`
   * 賦值不過去。使用端一律逐格比對字面值。
   */
  readonly path?: string;
  readonly distance?: number;
  readonly touchRadius?: number;
  /**
   * ⭐ `damageLine` 的膠囊 —— `length` 往前多遠、`width` 是**全寬**（⛔ 不是半徑，
   * sim 自己也寫 `capsule(start, end, width / 2)`），`fromCaster` 省略 = 從施法者
   * 身上出發。三格逐字對到 `sim/effects/variants/damageLine.ts` 的同名欄位。
   *
   * ⚠️ `length` / `width` 寫成 optional 是**結構性**的，⛔ 不是偷懶：這個介面要
   * 收得下整個 `EffectDef` union，而 union 裡只有 `damageLine` 這一個成員有這兩格。
   */
  readonly length?: number;
  readonly width?: number;
  readonly fromCaster?: boolean;
}

export interface TelegraphProjectileLike {
  readonly maxRange: number;
  readonly hitRadius: number;
}

/** Everything the derivation needs from the world outside the ability doc. */
export interface TelegraphEnv {
  /** #136 combat-env `abilityRange` factor (client: `envFactor("abilityRange")`). */
  readonly abilityRange: number;
  /** Projectile doc lookup, or null when the id is unknown. */
  projectile(id: string): TelegraphProjectileLike | null;
}

// ---------------------------------------------------------------------------
// Geometry: the data-only half (no positions) — this is what the audit sweeps
// ---------------------------------------------------------------------------

export type TelegraphKind = "circle" | "lock" | "line" | "self";

export type TelegraphGeometry =
  /** ground AoE: the real `enemiesInCircle` disc, at the cast point */
  | { kind: "circle"; radius: number; anchor: "point"; source: string }
  /** single target: arc at the victim + tether to the caster */
  | { kind: "lock"; radius: number; anchor: "point"; source: string }
  /** skillshot / dash corridor, cast from the caster along the aim */
  | {
      kind: "line";
      length: number;
      width: number;
      anchor: "caster";
      source: string;
      /**
       * TRUE when the corridor is pure movement and deals NO damage along its
       * path (castType `dash` — MovementSystem.startDash only sets nav.override).
       * The renderer must paint these in the neutral "someone is moving here"
       * channel, never the enemy DANGER channel: telling a player to dodge a
       * harmless line is the same lie as the fabricated `targeted` ring.
       */
      harmless?: boolean;
    }
  /** caster-centred marker (self buffs) */
  | { kind: "self"; radius: number; anchor: "caster"; source: string };

/**
 * PASSIVE-ONLY: a permanent WC3 passive with no castable effects. Mirrors
 * `sim/abilities/abilityPassives.isPassiveOnly` — a button that can never be
 * cast has no wind-up to warn about, so it is out of scope rather than missing.
 */
export function isPassiveOnlyAbility(def: TelegraphAbilityLike): boolean {
  return def.passive !== undefined && def.effects.length === 0;
}

/** First effect of a kind, or undefined. */
function firstEffect(
  def: TelegraphAbilityLike,
  pick: (e: TelegraphEffectLike) => boolean,
): TelegraphEffectLike | undefined {
  for (const e of def.effects) if (pick(e)) return e;
  return undefined;
}

/**
 * ⭐ A `ground` cast that carries a `damageLine` hits a CAPSULE, not the disc.
 *
 * ── 這不是裝飾問題，是「玩家被教錯閃避方向」 ────────────────────────────────
 * `castType: "ground"` 的圓盤（`abilitySystem.groundAoeTargets` 的
 * `resolveAbilityRadius(def.radius ?? 1)`）在這一族技能上**只負責挑人**：它算出
 * `ctx.targets`，而 `damageLine` 拿 `ctx.targets[0]` 只做一件事 —— 決定這條線
 * **往哪指**（`effectCommon.aimDirection`）。真正決定誰挨打的是
 * `sim/effects/damageLine.ts` 的 `queryOverlap(world, capsule(start, end, width / 2))`。
 *
 * ⇒ 畫圓盤等於在說「**往旁邊跑沒有用**」，而往旁邊跑正好是**唯一有用**的那個
 * 方向。owner 給這個 kind 的原始設計逐字說的就是這件事（`damageLine.ts` 檔頭）：
 * 一個以受害者為心的圓「也會打到站在他**背後**與**旁邊**的人，於是『站在他背後』
 * 就不再是對他的答案」。錄影回放讀同一支函式，所以它一樣是瞎的。
 *
 * ── ⛔ 長寬**不**乘 `abilityRange` ────────────────────────────────────────────
 * skillshot 的走廊乘、`delayed.advance` 乘、`spawnModelFx` 乘 —— 因為 sim 對那
 * 三條真的套了 `resolveAbilityRadius` / `resolveAbilityRange`。`damageLine`
 * **沒有**，而且那是刻意的（`sim/effects/damageLine.ts` 檔頭：「⚠️ NO
 * `combatEnv.abilityRange` FACTOR, deliberately」）。乘進去會讓走廊窄 1/0.6 ≈ 1.67 倍，
 * 也就是把一個「畫錯形狀」換成一個「形狀對但尺寸說謊」。
 *
 * ⭐ `clampSpreadRadius` 是**同一支函式**（⛔ 不是抄一個 24）：後台的覆蓋層寫入
 * 路徑今天不跑 Zod（見 `sim/effects/spreadLimits.ts` 檔頭），所以一份 `length: 500`
 * 真的進得了登錄表 —— sim 會夾到 24，而沒有夾的預告會畫 500。
 *
 * ── `fromCaster: false` 為什麼退回圓盤 ──────────────────────────────────────
 * 那種形狀的膠囊從**受害者**身上起算（`damageLine.ts` 的 `start = tt.pos`），而
 * 客戶端在起手那一刻還不知道受害者是誰。`TelegraphGeometry` 的 `line` 只錨在
 * 施法者身上 ⇒ 畫出來會是一條起點錯的線，那比圓盤更糟。出貨內容一支都沒有用它。
 *
 * 回 `null` = 這一支不走膠囊那條路（呼叫端接著畫圓盤），⛔ 不是「畫不出來」。
 */
function groundLashGeometry(def: TelegraphAbilityLike): TelegraphGeometry | null {
  // 第一守則 —— 「圓盤還是膠囊」是一個決策點,所以它是後台『畫面提示』頁的一格
  // 下拉,⛔ 不是這裡的一句 if。`"circle"` = rollback 到 #228 落地時的行為。
  if (uiCues().telegraphGroundShape !== "line") return null;
  const lash = firstEffect(
    def,
    (e) =>
      e.kind === "damageLine" &&
      typeof e.length === "number" &&
      e.length > 0 &&
      typeof e.width === "number" &&
      e.width > 0 &&
      e.fromCaster !== false,
  );
  if (!lash) return null;
  const length = clampSpreadRadius(lash.length as number);
  const width = clampSpreadRadius(lash.width as number);
  if (!(length >= MIN_EXTENT) || !(width >= MIN_EXTENT)) return null;
  return {
    kind: "line",
    length,
    width,
    anchor: "caster",
    source: `damageLine length ${length} × width ${width} (sim applies no abilityRange) — the capsule the damage query tests`,
  };
}

/**
 * Derive the ability's telegraph GEOMETRY from its own content, post-#136
 * multiplier. Returns null when the shape is NOT derivable — the single failure
 * mode, asserted against by `telegraphCoverage.test.ts`. There is deliberately
 * no "close enough" branch: a telegraph that guesses is worse than none,
 * because the player learns the wrong dodge.
 */
export function deriveTelegraphGeometry(
  def: TelegraphAbilityLike,
  env: TelegraphEnv,
): TelegraphGeometry | null {
  const mult = env.abilityRange;
  if (!(mult > 0) || !Number.isFinite(mult)) return null;

  switch (def.castType) {
    case "ground": {
      // ⭐ 膠囊優先於圓盤:圓盤挑人,膠囊打人 —— 見 `groundLashGeometry` 檔頭。
      const lash = groundLashGeometry(def);
      if (lash) return lash;
      const raw = typeof def.radius === "number" && def.radius > 0 ? def.radius : SIM_GROUND_DEFAULT_RADIUS;
      const radius = raw * mult;
      if (!(radius >= MIN_EXTENT)) return null;
      return {
        kind: "circle",
        radius,
        anchor: "point",
        source:
          def.radius !== undefined
            ? `radius ${def.radius} × abilityRange ${mult}`
            : `sim default radius ${SIM_GROUND_DEFAULT_RADIUS} × abilityRange ${mult}`,
      };
    }
    case "targeted": {
      // The hit set is exactly one entity; the only honest geometry is "that
      // champion, right there". Range is NOT drawn as a disc — it is not an
      // area anyone can be hit inside.
      return {
        kind: "lock",
        radius: BODY_RADIUS,
        anchor: "point",
        source: `single target — body radius ${BODY_RADIUS} (no AoE exists)`,
      };
    }
    case "skillshot": {
      const eff = firstEffect(def, (e) => typeof e.projectileId === "string" && e.projectileId.length > 0);
      const proj = eff?.projectileId ? env.projectile(eff.projectileId) : null;
      if (!proj) {
        // ⭐ GH#401（2026-08-30）—— **沿線推進轉換之後沒有投射物了**。
        //
        // ⚠️ 量到的：`godie-hgam.r` / `godie-ogrh.r` 從投射物翻成 `damageLine` 之後
        //   這一支推導不出走廊 ⇒ 回 null ⇒ ⭐ **玩家閃不掉一個沒有被畫出來的東西**。
        // ⭐ 而走廊的兩個尺寸 `damageLine` **自己就帶著**（`length` / `width`）——
        //   ⛔ 不必為它發明新欄位，也⛔ 不必假裝有投射物。
        // ⇒ 借 `groundLashGeometry()`（同一份幾何，⛔ 不是第二個住處）。
        const lash = groundLashGeometry(def);
        if (lash) return lash;

        // ⭐ GH#393（2026-08-19）—— 沿向量分段推進（`delayed` + `advance`）。
        // 它**不是**投射物：沒有飛行體、沒有 projectileId，而是「一條線上逐段落點、
        // 每段各結算一次」。⛔ 但玩家要閃的東西完全一樣是一條走廊，而走廊的兩個
        // 尺寸**全部推導得出來**，⛔ 不必為它發明一格新欄位：
        //   長 = 段數 × 每段位移（＋起始位移）· 寬 = 每段半徑 × 2
        // ⚠️ 兩者都要吃 `mult`（`abilityRange`），理由同下面投射物那段 ——
        // sim 的 `resolveAbilityRadius` 對兩者都套，只縮長不縮寬會讓走廊說謊。
        const adv = firstEffect(
          def,
          (e) => e.kind === "delayed" && e.advance != null && typeof e.advance.stepDist === "number",
        );
        if (adv?.advance) {
          const steps = typeof adv.count === "number" ? adv.count : 0;
          const reach = ((adv.advance.startDist ?? 0) + steps * adv.advance.stepDist) * mult;
          const span = (typeof adv.radius === "number" ? adv.radius : 0) * 2 * mult;
          if (reach >= MIN_EXTENT && span >= MIN_EXTENT) {
            return {
              kind: "line",
              length: reach,
              width: span,
              anchor: "caster",
              source: `delayed.advance ${steps}×${adv.advance.stepDist}（起始 ${adv.advance.startDist ?? 0}）× abilityRange ${mult}, radius ${String(adv.radius)} ×2 × abilityRange ${mult}`,
            };
          }
        }
        // ⭐ GH#553（2026-08-22）—— **會動的模型**（`spawnModelFx`）。同一個形狀第三次
        // 出現：沒有 projectileId、沒有 delayed.advance，而玩家要閃的仍然是一條走廊。
        // 三個模板家族（三條黑龍／衝擊波／動地剁）全部走它，所以修在這裡 = 一次解掉
        // 整族，⛔ 不是替某一支塞一個不存在的投射物（第〇·五守則）。
        //   長 = `distance` · 寬 = `touchRadius × 2`
        // ⚠️ 只認 `path: "forward"` 且**真的會傷人**（有 `touchRadius`）的那一顆 ——
        // `radial`／純裝飾的那幾顆畫成走廊會教錯閃法（同一段註解上面那句「猜的預告
        // 比沒有更糟」）。⚠️ 兩個尺寸都吃 `mult`，理由同下面投射物那段。
        const fx = firstEffect(
          def,
          (e) =>
            e.kind === "spawnModelFx" &&
            e.path === "forward" &&
            typeof e.distance === "number" &&
            e.distance > 0 &&
            typeof e.touchRadius === "number" &&
            e.touchRadius > 0,
        );
        if (fx) {
          const reach = (fx.distance as number) * mult;
          const span = (fx.touchRadius as number) * 2 * mult;
          if (reach >= MIN_EXTENT && span >= MIN_EXTENT) {
            return {
              kind: "line",
              length: reach,
              width: span,
              anchor: "caster",
              source: `spawnModelFx distance ${String(fx.distance)} × abilityRange ${mult}, touchRadius ${String(fx.touchRadius)} ×2 × abilityRange ${mult}`,
            };
          }
        }
        // 三條都推不出來 ⇒ 內容沒有講這一發飛多遠多寬。**大聲失敗**，
        // ⛔ 不要拿施法距離當走廊畫（那會讓玩家閃錯地方）。
        return null;
      }
      const length = proj.maxRange * mult;
      // The WIDTH is scaled too. An earlier revision multiplied only the length
      // and justified it with "the sim does NOT scale hitRadius" — that was
      // wrong by 1.67× and made the corridor lie about how wide it hits.
      // ProjectileSystem.ts collides at
      //   `proj.basic ? proj.hitRadius : resolveAbilityRadius(world, proj.hitRadius)`
      // and spawnProjectile (effectRunner.ts) never sets `basic`, so EVERY
      // ability skillshot collides at hitRadius × abilityRange.
      const width = proj.hitRadius * 2 * mult;
      if (!(length >= MIN_EXTENT) || !(width >= MIN_EXTENT)) return null;
      return {
        kind: "line",
        length,
        width,
        anchor: "caster",
        source: `${eff!.projectileId!} maxRange ${proj.maxRange} × abilityRange ${mult}, hitRadius ${proj.hitRadius} ×2 × abilityRange ${mult}`,
      };
    }
    case "dash": {
      const eff = firstEffect(def, (e) => e.kind === "dash" && typeof e.maxDistance === "number");
      if (!eff || typeof eff.maxDistance !== "number") return null;
      const length = eff.maxDistance; // startDash takes the RAW distance
      const width = BODY_RADIUS * 2;
      if (!(length >= MIN_EXTENT)) return null;
      return {
        kind: "line",
        // A dash is pure MOVEMENT: MovementSystem.startDash only sets
        // nav.override and deals no damage along the corridor. Painting it in
        // the enemy DANGER channel would tell players to dodge something
        // harmless — the same over-claim as the fabricated `targeted` ring this
        // module exists to kill. `harmless` demotes it to the neutral
        // "someone is moving here" channel instead of "get out of this line".
        harmless: true,
        length,
        width,
        anchor: "caster",
        source: `dash maxDistance ${eff.maxDistance} (sim applies no abilityRange), body width ${width} — movement only, no damage`,
      };
    }
    case "self": {
      return {
        kind: "self",
        radius: BODY_RADIUS,
        anchor: "caster",
        source: `self-target — body radius ${BODY_RADIUS} (sim hits only the caster)`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Placement: geometry + the cast event's own point/direction → world shape
// ---------------------------------------------------------------------------

/** The cast, as the client already receives it (abilityCast + entity views). */
export interface TelegraphCastAt {
  readonly casterX: number;
  readonly casterZ: number;
  /** `abilityCast.point` — set by the sim for `ground` and `targeted`. */
  readonly point?: { x: number; z: number } | null;
  /** `abilityCast.direction` — set for `targeted` / `skillshot` / `dash`. */
  readonly direction?: { x: number; z: number } | null;
}

export type TelegraphShape =
  | { kind: "circle"; x: number; z: number; radius: number }
  | { kind: "self"; x: number; z: number; radius: number }
  | { kind: "lock"; x: number; z: number; radius: number; fromX: number; fromZ: number }
  | {
      kind: "line";
      fromX: number;
      fromZ: number;
      dirX: number;
      dirZ: number;
      length: number;
      width: number;
    };

function finite(p: { x: number; z: number } | null | undefined): p is { x: number; z: number } {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

/** Unit-length aim direction, or null when the cast carries no usable aim. */
function aimOf(at: TelegraphCastAt): { x: number; z: number } | null {
  const d = at.direction;
  if (finite(d)) {
    const len = Math.hypot(d.x, d.z);
    if (len > 1e-6) return { x: d.x / len, z: d.z / len };
  }
  // The sim always sends `direction` for skillshot/dash/targeted, but a
  // point-aimed cast is recoverable from the point itself.
  const p = at.point;
  if (finite(p)) {
    const dx = p.x - at.casterX;
    const dz = p.z - at.casterZ;
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) return { x: dx / len, z: dz / len };
  }
  return null;
}

/**
 * Place a derived geometry in the world using the cast's own point/direction.
 * Returns null when the event cannot position the shape (no point for a ground
 * AoE, no aim for a corridor) — again a hard failure, never a guess.
 */
export function placeTelegraph(
  geom: TelegraphGeometry,
  at: TelegraphCastAt,
): TelegraphShape | null {
  if (!Number.isFinite(at.casterX) || !Number.isFinite(at.casterZ)) return null;
  switch (geom.kind) {
    case "circle": {
      if (!finite(at.point)) return null;
      return { kind: "circle", x: at.point.x, z: at.point.z, radius: geom.radius };
    }
    case "lock": {
      if (!finite(at.point)) return null;
      return {
        kind: "lock",
        x: at.point.x,
        z: at.point.z,
        radius: geom.radius,
        fromX: at.casterX,
        fromZ: at.casterZ,
      };
    }
    case "self":
      return { kind: "self", x: at.casterX, z: at.casterZ, radius: geom.radius };
    case "line": {
      const dir = aimOf(at);
      if (!dir) return null;
      return {
        kind: "line",
        fromX: at.casterX,
        fromZ: at.casterZ,
        dirX: dir.x,
        dirZ: dir.z,
        length: geom.length,
        width: geom.width,
      };
    }
  }
}

/** Derive + place in one step (the call site VfxSystem uses). */
export function resolveTelegraphShape(
  def: TelegraphAbilityLike,
  at: TelegraphCastAt,
  env: TelegraphEnv,
): TelegraphShape | null {
  const geom = deriveTelegraphGeometry(def, env);
  return geom === null ? null : placeTelegraph(geom, at);
}
