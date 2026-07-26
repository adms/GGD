/**
 * 鑄技工坊 (Skill Forge) EXPANDER — the ONE pure function both the sim (registry
 * registration) and the editor (form preview / try-in-preview) import, so that
 *「what the form shows」==「what the game runs」 (design §2.2).
 *
 * `expand(template, params)` turns a template@1 doc + filled param slots into the
 * BEHAVIOUR half of an AbilityDef (castType / effects / radius / castTimeSec /
 * targetsEnemies / innateKind / passive). It is PURE: no I/O, no registry access,
 * no clock, no rng. It emits ONLY fields that exist on `zAbilityDef` — it never
 * invents a shape the schema would reject — and every emitted EffectDef is one of
 * the existing `zEffectDefUnion` kinds.
 *
 * The ability doc on disk stores `template:{ref,params}` and an empty `effects`;
 * registries.ts calls `expand` at registration time and merges the result in
 * (`mergeAndValidate`), so a template upgrade re-expands every referencing skill.
 */
import type { CastType, AbilityPassive, AbilityPassiveRank } from "../../sim/content/defs";
import type { EffectDef, DamageType, Scaling } from "../../sim/effects/effect";
import type { HookDef, HookEvent, StatModifier } from "../../sim/stats/modifiers";
import type { ProjectileId } from "../../ids";
import type { TemplateDoc, ParamSlot } from "../schema/template";

// ---------------------------------------------------------------------------
// LENGTH CONVERSION — load-bearing constant (design §四, verified in expand.test.ts)
// ---------------------------------------------------------------------------

/**
 * WC3 units → GGD units. EXACTLY 11/600. Verified against shipped content:
 *   450 × 11/600 = 8.25    (godie-h020.e radius)
 *   500 × 11/600 = 9.1667  → 9.17 (godie-hgam.e range, 靈壓 aura)
 *   763 × 11/600 = 13.99   → 14
 * Any other constant (e.g. /54.5 → 8.2568) breaks the diff=0 roundtrip.
 */
export const GGD_PER_WC3 = 11 / 600;

/** Round to 2 decimals — the precision content stores lengths at. */
export const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Convert a WC3-unit length to a GGD length, rounded to 2 decimals. */
export const toLen = (wc3: number): number => round2(wc3 * GGD_PER_WC3);

// ---------------------------------------------------------------------------
// ALTITUDE CONVERSION — the VERTICAL axis is NOT the planar axis (task #247b)
// ---------------------------------------------------------------------------

/**
 * WC3 FLY HEIGHT → GGD altitude. EXACTLY 1/250, i.e. the vertical axis is
 * compressed 4.58× relative to the planar `GGD_PER_WC3` = 11/600.
 *
 * THIS IS A DELIBERATE OVERRIDE OF THE FAITHFUL-IMPORT RULE, AND ONLY ON THIS
 * ONE AXIS. Read the reasoning before changing it.
 *
 * What went wrong. #247 ported the ten `SetUnitFlyHeightBJ` apexes through the
 * PLANAR scale (A=600 → 11.00 u) on the assumption that one map has one scale.
 * Measured through the game's real CameraRig at the shipped default
 * (DOLLY_DEFAULT = DOLLY_MIN = 10, pitch 68°, fov 0.8 rad), 蒼月潮's 07-03 was
 * off-screen for 73% of its 44 ticks and spent part of the arc FULLY BEHIND THE
 * NEAR PLANE — the model turns inside-out and vanishes. That is #93 again: a
 * spectacle nobody can see. The rule this project recorded from #93 is
 * 「驗證畫面必須用遊戲真正的 68° 鏡頭拍」, and this constant is what that rule
 * costs when the two cameras disagree.
 *
 * Why a second scale is CORRECT and not a fudge. The planar scale is fixed by
 * the map's own geometry: 763 → 14.00 u because the arena has that shape. The
 * vertical scale is fixed by the CAMERA, and GGD's camera is not WC3's:
 *
 *                        pitch      eye→target     vertical FOV
 *     WC3 default        ~30°       1650 u         ~70°
 *     GGD combat          68°         10 u         ~45.8° (0.8 rad)
 *
 * Solving "how far above the camera target may a body rise and stay inside the
 * frustum" for each rig gives the VERTICAL HEADROOM, and that is the quantity a
 * fly height is really expressed in:
 *
 *     WC3  ≈ 950 WC3 u of headroom      GGD ≈ 5.51 GGD u of headroom
 *
 * So one unit of GGD headroom buys ~172 WC3 units of headroom — not 54.5. The
 * planar constant is simply the wrong ruler for this axis; using it inflated
 * every apex by ~3.2× in screen terms. Porting the value at 1/250 keeps every
 * arc inside the frame the player actually has, which is the behaviour the
 * source had on the screen the source shipped with.
 *
 * Why 1/250 exactly. It is the round number that puts the LARGEST arc in the
 * whole JASS family (A0RZ, A = 1000, 76-04 巨人迴旋彈) at 4.00 u — under the
 * 4.61 u ceiling where a champion's mid-body leaves the viewport, and above the
 * 3.71 u ceiling where the top of its head does, so the biggest leap in the game
 * (and only that one) gets the dramatic apex peek. Every other site is framed
 * head-to-toe for its entire flight. All of it is measured, not asserted:
 * apps/client/src/render/leapFraming.test.ts drives the real CameraRig and the
 * real client-side interpolation over EVERY leap in content.
 *
 * ORDERING IS PRESERVED, which is the part of faithfulness that survives: the
 * map's own hierarchy of arcs (1000 > 600 > 400 > 300 > 250) is intact, because
 * this is one linear factor and not a per-ability hand-tune.
 *
 * NOT APPLIED TO ANYTHING ELSE. `range`, `radius`, `landRadius` and
 * `throwDistance` are planar and keep `GGD_PER_WC3` untouched.
 */
export const GGD_APEX_PER_WC3 = 1 / 250;

/**
 * Round to 3 decimals — MILLI-units, which is the resolution the leap actually
 * runs at: `startLeap` stores `Math.round(apexHeight * 1000)` and integrates in
 * integer milli-units for determinism (sim/movement/leap.ts). Planar lengths use
 * `round2` because that is the precision content stores lengths at, but reusing
 * it here would quantise altitude to 2.5 WC3 units per step and silently swallow
 * small authored changes — the exact "live form field the expander ignores"
 * failure paramsSchema.test.ts exists to catch.
 */
export const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Convert a WC3 fly height to a GGD altitude, at the sim's own milli resolution. */
export const toApex = (wc3: number): number => round3(wc3 * GGD_APEX_PER_WC3);

// ---------------------------------------------------------------------------
// SIM CAPABILITY TABLE (design §2.4) — the editor colours a template's
// requires[] badge red when a required capability is not `available`.
// ---------------------------------------------------------------------------

export interface SimCapability {
  /** which phase the capability lands in */
  readonly p: 1 | 2 | 3;
  /** whether the sim can honour it TODAY */
  readonly available: boolean;
}

export const SIM_CAPABILITIES: Readonly<Record<string, SimCapability>> = {
  projectile: { p: 1, available: true },
  hooks: { p: 1, available: true },
  applyBuff: { p: 1, available: true },
  applyStatus: { p: 1, available: true },
  auras: { p: 1, available: true },
  dash: { p: 2, available: true }, // kind exists, but no P1 family uses it
  // task #247 — the `leap` EffectDef, LeapSystem, the wire height/scale channel
  // and the client arc all shipped, ported from the map's own nine
  // SetUnitFlyHeightBJ parabolas. Flipping this one flag is load-bearing and
  // free downstream: `missingCaps` stops returning "leap", so the editor's
  // degrade panel drops its red badge and grows a green ✓ chip with NO editor
  // change at all — which is exactly what the shared table was for.
  leap: { p: 2, available: true },
  // UNCHANGED, deliberately. The knockback in combat/damage.ts is a REACTION to
  // a landed hit, not an EffectDef a template author can emit — there is no
  // `knockback` kind. #247's `applyTo: "target"` is not it either: that is a
  // parabola, not a directed impulse. False stays the honest answer.
  knockback: { p: 2, available: false },
  summon: { p: 3, available: false },
  combo: { p: 3, available: false },
  periodicDamage: { p: 3, available: false },
};

/** The subset of `reqs` the sim cannot honour today (degrade note source). */
export function missingCaps(reqs: readonly string[]): string[] {
  return reqs.filter((r) => !SIM_CAPABILITIES[r]?.available);
}

// ---------------------------------------------------------------------------
// ExpandResult — the BEHAVIOUR half of an AbilityDef (fields of zAbilityDef only)
// ---------------------------------------------------------------------------

export interface ExpandResult {
  castType: CastType;
  effects: EffectDef[];
  radius?: number;
  castTimeSec?: number;
  targetsEnemies?: boolean;
  /** proc families (on-attack / on-hit-react) are PASSIVE; effects stays [] */
  innateKind?: "passive";
  passive?: AbilityPassive;
}

// ---------------------------------------------------------------------------
// slot reading
// ---------------------------------------------------------------------------

class ExpandError extends Error {}

/** Read a slot value from params, falling back to the slot's default. */
function raw(t: TemplateDoc, params: Record<string, unknown>, name: string): unknown {
  const slot = t.params[name];
  if (slot === undefined) {
    throw new ExpandError(`template ${t.id}: unknown param slot "${name}"`);
  }
  const v = params[name];
  if (v !== undefined && v !== null) return v;
  return slot.default;
}

/**
 * Is a slot value present? A supplied value always counts. For a REQUIRED slot a
 * default counts too (the fallback). For an OPTIONAL slot the default is only an
 * editor pre-fill SUGGESTION, not a fallback — omitting the param means absent,
 * which is how godie-hgam.e (no radius) round-trips through tpl-instant-blast.
 */
function has(t: TemplateDoc, params: Record<string, unknown>, name: string): boolean {
  const slot: ParamSlot | undefined = t.params[name];
  if (slot === undefined) return false;
  const v = params[name];
  if (v !== undefined && v !== null) return true;
  if (slot.optional === true) return false;
  return slot.default !== undefined && slot.default !== null;
}

/**
 * A numeric slot, range-checked. `wc3u` slots are PLANAR-length-converted;
 * `wc3h` slots are ALTITUDE-converted (a different ruler — see GGD_APEX_PER_WC3).
 */
function num(t: TemplateDoc, params: Record<string, unknown>, name: string): number {
  const slot = t.params[name]!;
  const v = raw(t, params, name);
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ExpandError(`template ${t.id}: param "${name}" must be a finite number`);
  }
  if (slot.min !== undefined && v < slot.min) {
    throw new ExpandError(`template ${t.id}: param "${name}"=${v} below min ${slot.min}`);
  }
  if (slot.max !== undefined && v > slot.max) {
    throw new ExpandError(`template ${t.id}: param "${name}"=${v} above max ${slot.max}`);
  }
  if (slot.unit === "wc3u") return toLen(v);
  if (slot.unit === "wc3h") return toApex(v);
  return v;
}

function str(t: TemplateDoc, params: Record<string, unknown>, name: string): string {
  const v = raw(t, params, name);
  if (typeof v !== "string") {
    throw new ExpandError(`template ${t.id}: param "${name}" must be a string`);
  }
  return v;
}

function damageType(t: TemplateDoc, params: Record<string, unknown>, name: string): DamageType {
  const v = str(t, params, name);
  if (v !== "physical" && v !== "magic" && v !== "true") {
    throw new ExpandError(`template ${t.id}: param "${name}"="${v}" is not a damage type`);
  }
  return v;
}

function scaling(t: TemplateDoc, params: Record<string, unknown>, name: string): Scaling {
  const v = raw(t, params, name);
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new ExpandError(`template ${t.id}: param "${name}" must be a Scaling object`);
  }
  return v as Scaling;
}

function modifiers(t: TemplateDoc, params: Record<string, unknown>, name: string): StatModifier[] {
  const v = raw(t, params, name);
  if (!Array.isArray(v)) {
    throw new ExpandError(`template ${t.id}: param "${name}" must be a StatModifier[]`);
  }
  return v as StatModifier[];
}

/** A damage effect built in the same key order content stores it (kind→type→amount). */
function damageEffect(dt: DamageType, amount: Scaling, canCrit?: boolean): EffectDef {
  return canCrit === undefined
    ? { kind: "damage", damageType: dt, amount }
    : { kind: "damage", damageType: dt, amount, canCrit };
}

/** Wrap one damage effect in a proc hook rank. */
function procPassive(hook: HookDef): AbilityPassive {
  const rank: AbilityPassiveRank = { hooks: [hook] };
  return { ranks: [rank] };
}

// ---------------------------------------------------------------------------
// the family switch
// ---------------------------------------------------------------------------

type Family = (t: TemplateDoc, p: Record<string, unknown>) => ExpandResult;

const FAMILIES: Readonly<Record<string, Family>> = {
  // 1. 單體斬擊 — one targeted magic strike. IMPURE-EXEMPLAR: 菲特 23-04 also
  // self-buffs + execute-gates; only the numeric core is seeded here.
  "single-strike": (t, p) => ({
    castType: "targeted",
    targetsEnemies: true,
    ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
    effects: [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage"))],
  }),

  // 2. 瞬發點爆 — instant point/target burst. radius present → ground AoE, absent
  // → single target. **diff=0 roundtrip target** (godie-hgam.e 藤鞭).
  "instant-blast": (t, p) => {
    const withRadius = has(t, p, "radius");
    return {
      castType: withRadius ? "ground" : "targeted",
      targetsEnemies: true,
      ...(withRadius ? { radius: num(t, p, "radius") } : {}),
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage"))],
    };
  },

  // 3. 原地震波 — nova around the caster. 呂布 80-03 鬼神烈戟.
  "ground-nova": (t, p) => ({
    castType: "self",
    targetsEnemies: true,
    radius: num(t, p, "radius"),
    ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
    effects: [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage"))],
  }),

  // 4. 直線分段掃擊 — segmented line sweep approximated by one wave projectile
  // (matches godie-e002.e). SABER 20-03 約束與勝利之劍.
  "line-sweep": (t, p) => ({
    castType: "skillshot",
    targetsEnemies: true,
    ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
    effects: [
      {
        kind: "spawnProjectile",
        projectileId: "imported.wave" as ProjectileId,
        onHit: [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage"))],
      },
    ],
  }),

  // 5. 行進波動 — travelling wave. 莉娜 04-03 龍破斬 (design canonical example).
  // Per-step collect + terminal burst collapse to one wave, as current content
  // does; terminalBurst is carried as the AoE radius when present.
  "traveling-wave": (t, p) => ({
    castType: "skillshot",
    targetsEnemies: true,
    ...(has(t, p, "terminalBurst") ? { radius: num(t, p, "terminalBurst") } : {}),
    effects: [
      {
        kind: "spawnProjectile",
        projectileId: "imported.wave" as ProjectileId,
        onHit: [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage"))],
      },
    ],
  }),

  // 6. 攻擊觸發 — on-attack proc (PASSIVE). 蒼月潮 獸矛.
  "on-attack": (t, p) => {
    const event = str(t, p, "event") as HookEvent;
    const hook: HookDef = {
      on: event,
      effects: [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "bonusDamage"))],
      ...(has(t, p, "chance") ? { chance: num(t, p, "chance") } : {}),
      ...(has(t, p, "internalCooldown") ? { internalCooldown: num(t, p, "internalCooldown") } : {}),
    };
    return { castType: "self", innateKind: "passive", effects: [], passive: procPassive(hook) };
  },

  // 7. 受擊反應 — on-hit reactive counter (PASSIVE). SABER 20-04 Avalon.
  "on-hit-react": (t, p) => {
    const hook: HookDef = {
      on: "onDamageTaken",
      target: "event",
      effects: [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "reflectDamage"))],
      ...(has(t, p, "chance") ? { chance: num(t, p, "chance") } : {}),
      ...(has(t, p, "internalCooldown") ? { internalCooldown: num(t, p, "internalCooldown") } : {}),
    };
    return { castType: "self", innateKind: "passive", effects: [], passive: procPassive(hook) };
  },

  // 9. 跳躍落地 (task #247) — the map's own parabola. Every default is the REAL
  // A0G3 number, so an empty form expands to 蒼月潮's 07-03 列、在、前 and the
  // template documents itself against the source. `wc3u` slots go through
  // `toLen`, so apexHeight 600 reaches the sim as 11.00 and landRadius 330 as
  // 6.05 — no second conversion constant anywhere.
  //
  // castType is always "ground": a leap targets a POINT (the JASS reads
  // GetSpellTargetLoc at j:34196), never a unit.
  "leap-strike": (t, p) => {
    const landRadius = num(t, p, "landRadius");
    const mode = str(t, p, "mode") as "toPoint" | "inPlace";
    const applyTo = str(t, p, "applyTo") as "self" | "target";
    const onLand: EffectDef[] = [
      damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage")),
    ];
    return {
      castType: "ground",
      targetsEnemies: true,
      radius: landRadius,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [
        {
          kind: "leap",
          mode,
          applyTo,
          apexHeight: num(t, p, "apexHeight"),
          durationSec: num(t, p, "durationSec"),
          landRadius,
          onLand,
        },
      ],
    };
  },

  // 8. 變身強化(數值面) — self stat buff, NUMERIC side only. 戰鬥涅吉 82-04 闇之魔法.
  // Ability-set swap / model morph is explicitly OUT of P1 (design non-goal §六).
  "buff-self": (t, p) => ({
    castType: "self",
    ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
    effects: [
      { kind: "applyBuff", modifiers: modifiers(t, p, "modifiers"), duration: num(t, p, "duration") },
    ],
  }),
};

/**
 * Expand a template + params into the behaviour half of an AbilityDef. Throws on
 * an unknown/draft family or a param value outside its slot's range.
 */
export function expand(t: TemplateDoc, params: Record<string, unknown>): ExpandResult {
  const fam = FAMILIES[t.family];
  if (fam === undefined) {
    throw new ExpandError(
      `template ${t.id}: family "${t.family}" has no P1 expand path (status=${t.status})`,
    );
  }
  return fam(t, params);
}

/** Whether a family has an implemented expand path (enabled in P1). */
export function isExpandable(family: string): boolean {
  return FAMILIES[family] !== undefined;
}

// ---------------------------------------------------------------------------
// merge + eject
// ---------------------------------------------------------------------------

/**
 * The keys `expand` OWNS on an AbilityDef. Merging strips any stale value the
 * skeleton carried for these (a placeholder `castType`, an empty `effects`) and
 * lets the freshly-expanded value win, so a template upgrade fully re-expands.
 */
const EXPANDED_KEYS = [
  "castType",
  "effects",
  "radius",
  "castTimeSec",
  "targetsEnemies",
  "innateKind",
  "passive",
] as const;

/**
 * skeleton ⊕ ExpandResult. `skeleton` is the on-disk doc (still carrying
 * `template:{ref,params}` and its placeholder behaviour fields); the returned
 * object drops the expander-owned keys and overlays the expansion. The caller
 * (registries.ts) then runs it through `zAbilityDoc`/`zAbilityDef` parse.
 *
 * `template` is KEPT on the merged doc so the sim's registered def still records
 * which template produced it (and re-expansion stays possible). It is a valid
 * optional field on zAbilityDef.
 */
export function mergeExpansion(
  skeleton: Record<string, unknown>,
  ex: ExpandResult,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...skeleton };
  for (const k of EXPANDED_KEYS) delete out[k];
  const exRec = ex as unknown as Record<string, unknown>;
  for (const k of EXPANDED_KEYS) {
    if (exRec[k] !== undefined) out[k] = exRec[k];
  }
  return out;
}

/**
 * EJECT (design §2.2): inline the expansion as raw EffectDef and DROP the
 * `template` link, so the doc becomes an ordinary hand-authored ability that can
 * be freely special-cased. Reversible in one git commit.
 */
export function eject(
  doc: Record<string, unknown>,
  t: TemplateDoc,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const merged = mergeExpansion(doc, expand(t, params));
  delete merged["template"];
  return merged;
}
