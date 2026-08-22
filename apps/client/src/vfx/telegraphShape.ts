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
 */

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
