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
import type { ProjectileId, StatusId } from "../../ids";
import type { TemplateDoc, ParamSlot } from "../schema/template";
import type { EffectCondition } from "../../sim/content/condition";
import { zEffectCondition } from "../schema/condition";

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
  /**
   * Set ONLY on a capability that is available but NOT whole: the sim honours
   * the common path and REFUSES a named sub-case loudly. Purely descriptive —
   * `missingCaps` still treats the capability as present, because a template
   * that stays off the named sub-case runs perfectly. The editor renders it as
   * 「部分可用」 next to the green ✓ so a designer meets the limit in the form
   * rather than in a stack trace.
   *
   * A capability whose caveat is empty is fully implemented. Do NOT use this
   * field to soften a capability that does not work at all — that is
   * `available: false`, which is a different colour on purpose.
   */
  readonly caveat?: string;
}

export const SIM_CAPABILITIES: Readonly<Record<string, SimCapability>> = {
  projectile: { p: 1, available: true },
  hooks: { p: 1, available: true },
  /**
   * 觸發條件 (owner 2026-07-30 「on-attack by condition」). `HookDef.condition`
   * + `sim/content/condition.ts` + the dropdown editor: comparison operators,
   * absolute vs percent, `chance` as a first-class leaf, and all/any/not
   * composition, evaluated inside the real `fireHooks` gate.
   *
   * The capability is declared SEPARATELY from `hooks` because a template can
   * need one without the other — `hooks` says 「這個行為靠事件驅動」, `conditions`
   * says 「它的觸發時機不是無條件的」 — and because the forge's ✓/✗ chips are the
   * only place a designer learns which vocabulary the engine has. Before this
   * lane, 攻擊觸發's own description had to confess 「HP% 執行門檻為紅色降級槽」;
   * that confession is what this flag retires.
   */
  conditions: { p: 1, available: true },
  applyBuff: { p: 1, available: true },
  applyStatus: { p: 1, available: true },
  auras: { p: 1, available: true },
  dash: { p: 2, available: true }, // kind exists; tpl-blink-strike is its P2 home
  // task #247 — the `leap` EffectDef, LeapSystem, the wire height channel and
  // the client arc all shipped, ported from the map's own TEN
  // SetUnitFlyHeightBJ parabolas (see the note on tpl-leap-strike's apexHeight
  // below for why an argument-grep finds only nine). Flipping this one flag is
  // load-bearing and free downstream: `missingCaps` stops returning "leap", so
  // the editor's degrade panel drops its red badge and grows a green ✓ chip
  // with NO editor change at all — which is exactly what the shared table was
  // for.
  leap: { p: 2, available: true },
  // ⚠️ THIS COMMENT USED TO SAY 「there is no `knockback` kind … False stays the
  // honest answer」. That was true when it was written and is FALSE NOW, which
  // is the whole of CLAUDE.md 第三守則 in one line: a flag defended by prose
  // outlives the prose's expiry date and nothing goes red.
  //
  // What exists today (lane P4, GH#193), verified by running it rather than by
  // reading it — `sim/effects/knockback.test.ts`, 16 behavioural cases, all
  // driving a real `SimWorld.step()` and reading `world.transform.pos`:
  //   · `kind: "knockback"` is a real member of the EffectDef union
  //     (content/schema/effect.ts) and of EFFECT_HANDLERS (effects/
  //     effectRegistry.ts), so a template author CAN emit one;
  //   · it does a directed impulse, which is exactly what #247's parabola is
  //     not — `from` selects push-away / along-facing / PULL;
  //   · `launchHeight > 0` turns the shove into 擊飛, and `uncontrollable`
  //     drives the shipped `world.knockdown` store.
  // The damage-reaction knockback in combat/damage.ts still exists and is still
  // a reaction; it is now the FLOOR this primitive maxes against, not a rival.
  knockback: { p: 2, available: true },
  // Lane P2 召喚物. `summon.test.ts` (20 behavioural cases) drives real bodies
  // onto the field through the shipped `runEffects` dispatch and watches them
  // fight, expire, hit the cap and despawn with their owner.
  //
  // PARTIAL, and the partiality is named rather than hidden: `killCredit:
  // "owner"` is accepted by the Zod schema and REFUSED by the handler
  // (effects/summon.ts:92 throws, guarded by summon.test.ts:475). It needs a
  // killer-rewrite seam in systems/DeathSystem.ts that does not exist. Every
  // other authoring path — including the default `killCredit: "none"` — runs.
  summon: {
    p: 3,
    available: true,
    caveat: "召喚物的擊殺歸屬 killCredit: \"owner\" 尚未實作（施放時會擲錯），其餘欄位皆可用",
  },
  // Lane P3 無敵/免疫. `kind: "invulnerable"` + SimWorld.invulnerable + the
  // three orthogonal axes (blocksDamage / blocksTrueDamage / blocksControl) all
  // shipped; `invulnerable.test.ts` drives them. The row was MISSING rather
  // than false — which is worse than false, because `missingCaps` reports an
  // unknown key as missing, so a template requiring it would have shown a red
  // badge for a capability the sim has had all along. Found by building
  // tpl-lock-combo, whose 7-of-8 members all wear `Avul` for the whole 演出.
  invulnerable: { p: 3, available: true },
  combo: { p: 3, available: false },
  // Lane P1 持續傷害: `kind: "dot"` + SimWorld.dot + dotTickSystem all shipped,
  // `dot.test.ts` (21 cases) green. Not named in the brief this landed under —
  // it was found by diffing EFFECT_HANDLERS against this table, which is the
  // only way a stale row in here is ever going to be noticed.
  periodicDamage: { p: 3, available: true },
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

/**
 * A 觸發條件 slot. Validated with the SAME `zEffectCondition` the ability doc and
 * the Forge form use — the expander is the last gate before a gate reaches the
 * sim, and a condition that parsed in the editor but not here (or vice versa)
 * would be exactly the 「編輯器顯示的和遊戲跑的不一樣」 split this whole module
 * exists to prevent.
 */
function condition(
  t: TemplateDoc,
  params: Record<string, unknown>,
  name: string,
): EffectCondition {
  const v = raw(t, params, name);
  const parsed = zEffectCondition.safeParse(v);
  if (!parsed.success) {
    throw new ExpandError(
      `template ${t.id}: param "${name}" is not a valid condition — ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  return parsed.data;
}

/** A damage effect built in the same key order content stores it (kind→type→amount). */
function damageEffect(dt: DamageType, amount: Scaling, canCrit?: boolean): EffectDef {
  return canCrit === undefined
    ? { kind: "damage", damageType: dt, amount }
    : { kind: "damage", damageType: dt, amount, canCrit };
}

/**
 * statusId → THE MECHANICAL FIELDS THAT MAKE IT DO SOMETHING (範圍逐一施法).
 *
 * ⚠️ A `status-effect@1` doc carries `tags: ["root"]` and NOTHING ELSE that the
 * sim reads. The behaviour lives on the EffectDef: `applyStatus` only holds a
 * body still when the EFFECT says `root: true`, only stuns when it says
 * `stun: true`, only slows when it carries `moveSpeedMult` (effects/
 * applyStatus.ts — `isCc` is computed from those three, never from the doc).
 *
 * So emitting `{statusId: "root", duration}` and stopping would attach a marker
 * that does nothing at all — a debuff the HUD draws and the sim ignores
 * (七種失敗形態 ②). That failure is not hypothetical: `godie-e00t.w` ships
 * `statusId: "slow30"` with NO `moveSpeedMult` and is slowing nobody today.
 *
 * Values are taken from what shipped content already pairs with each id:
 * `root`→`root:true` (22 docs), `burnstun`→`stun:true` (60 docs),
 * `slow30`→`moveSpeedMult: 0.7` (2/2 of the slow30 docs that carry a number).
 * Only these three ids are offered, because they are the three the family's
 * JASS actually uses (entanglingroots / sleep+impale+polymorph / cripple) AND
 * the three whose id maps to exactly one mechanic — the `slow25`/`slow40` ids
 * are shipped against six different multipliers, so their NAME is not evidence.
 */
const CC_MECHANIC: Readonly<Record<string, { root?: true; stun?: true; moveSpeedMult?: number }>> = {
  root: { root: true },
  burnstun: { stun: true },
  slow30: { moveSpeedMult: 0.7 },
};

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
  //
  // ⚠️ castType WAS `"self"`, AND THAT MADE THIS TEMPLATE HIT THE WRONG BODY.
  // `castAbility`'s `"self"` branch sets `targets = [caster]` and nothing else
  // (abilities/abilitySystem.ts) — `radius` is only ever read by the `"ground"`
  // branch. So the shipped expansion queued its own damage packet against the
  // CASTER and against nobody in the ring: a nova that hurts only the person
  // who cast it. Nothing went red, because every assertion about this family
  // was a property (`expect(ex.castType).toBe("self")`, `expect(ex.radius)
  // .toBeCloseTo(...)`) rather than a body losing HP — 七種失敗形態 ⑦.
  //
  // The exemplar itself is the proof: the shipped 呂布 80-03 doc
  // (content/abilities/godie-h01u.e.json) is hand-authored as `"castType":
  // "ground", "range": 0, "radius": 9.72` — the template never reproduced the
  // one skill it was extracted from.
  //
  // "ground" + the doc's own `range: 0` IS the self-centred nova: the ground
  // branch clamps the requested point to `range`, so a range-0 ability always
  // detonates on the caster's own feet. 原地 vs 指定點 therefore lives in the
  // ability's `range` — a SKELETON field (see the header of schema/template.ts:
  // range is never a template param) — and needs no slot here.
  "ground-nova": (t, p) => ({
    castType: "ground",
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
  //
  // ⭐ `condition` (owner 2026-07-30) is what made this card able to state its
  // own exemplar. 獸矛's shipped description is 「在攻擊非英雄部隊時，當該部隊
  // 血量低於35%將直接死亡，並有1%機率造成英雄直接死亡」 — an EXECUTE behind a
  // two-branch gate. With only `chance` in the vocabulary the card could express
  // that as 「12.5% 機率造成 100 傷害」 and nothing better, which is a different
  // ability wearing the same name (owner: 看不懂也不合理). The slot is OPTIONAL,
  // so a filled param is the only thing that produces a gate: every expansion
  // that omits it is byte-identical to the pre-condition expander.
  "on-attack": (t, p) => {
    const event = str(t, p, "event") as HookEvent;
    const hook: HookDef = {
      on: event,
      effects: [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "bonusDamage"))],
      ...(has(t, p, "chance") ? { chance: num(t, p, "chance") } : {}),
      ...(has(t, p, "condition") ? { condition: condition(t, p, "condition") } : {}),
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

  // 9. 跳躍落地 (task #247) — the map's own parabola.
  //
  // ⚠️ TWO CORRECTIONS to what this comment used to claim (CLAUDE.md 第三守則 —
  // both were re-measured against war3map.j, not re-read):
  //
  // (a) 「the map's own NINE parabolas」 → there are TEN. Nine are inline in a
  //     `SetUnitFlyHeightBJ` argument and a grep on that call finds them
  //     (j:25841, 30802, 30990, 33716, 34285, 36347, 39208, 49322, 51828). The
  //     tenth — 76-04 三檔.巨人迴旋彈, `-10(i-11)²+1000`, the TALLEST of the set
  //     — is invisible to that grep because its peak is computed on the line
  //     BEFORE the call, into `udg_Luffe_three_height` (j:36757), and the call
  //     itself (j:36758) just passes the variable. The map even comments it:
  //     「Index=11時高度=1000」. A census that greps arguments undercounts
  //     exactly the extreme it most needs to see.
  //
  // (b) 「`wc3u` slots go through `toLen`, so apexHeight 600 reaches the sim as
  //     11.00」 → apexHeight is a `wc3h` slot, not `wc3u`. It goes through
  //     `toApex` (GGD_APEX_PER_WC3 = 1/250), so 600 reaches the sim as **2.4**,
  //     not 11.00. The two rulers were split deliberately (the vertical axis is
  //     set by the camera, not the map); the comment simply never followed.
  //     landRadius IS `wc3u`, and 330 → 6.05 is still right.
  //
  // ── apexHeight's UPPER BOUND: 1000 → 2000, and why that number ────────────
  // CLAUDE.md 「欄位要有上界，不是只有下界」 has a second half that is easy to
  // satisfy on paper and miss in practice: the bound needs HEADROOM. This slot
  // shipped with `max: 1000` while the tallest parabola in the whole map is
  // EXACTLY 1000 (76-04 三檔.巨人迴旋彈, j:36757) — so the ceiling sat on the
  // data's own extreme and an operator asking for a jump one unit higher than
  // the source material got a validation error instead of a skill.
  //
  // 2000 = 2× the measured maximum. The bound is not a balance lever and must
  // not be read as one; its job is to catch a MIS-PASTE, and the specific
  // mis-paste this file is exposed to is real: `SetUnitFlyHeightBJ(u, height,
  // RATE)` takes the rate as its THIRD argument, and the map passes 5000 for it
  // all over (j:9848, 25206, 25214, 49425…). Someone porting a leap by reading
  // the JASS can very easily copy 5000. 2000 still rejects that, while leaving
  // room to author a jump twice as tall as anything 原作 ever shipped.
  // (4000 GGD-milli = 8.0 GGD units; the wire carries `h` as a float32, so
  // there is no encoding ceiling forcing a smaller number — this is a design
  // choice, not a technical limit.)
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

  // 10. 衝鋒推撞 — charge in, then shove whatever is standing there. The family's
  // 20 JASS members (`template: "衝鋒推撞"` in JASS_BEHAVIOR.json) split into a
  // caster-charge half (A0OG 邪王炎殺劍, A0ET 八刀一閃, A0I4 迴旋爪擊, A0CV 保齡球…)
  // and a victim-shove half (A092 巴歐．薩喀爾嘎, A049 一騎槍閃, A07F 神滅斬…);
  // most heroes do BOTH, which is why they are one family and not two.
  //
  // ── WHY THE CHARGE IS A `leap`, NOT A `dash` ─────────────────────────────
  // The census assigned this family `requires: ["dash", "knockback"]` and that
  // was wrong in a way worth writing down, because it is failure mode ④ (an
  // assertion pointed away from the defect) waiting to be baked into content.
  //
  // Every member of the charge half resolves its damage AT THE DESTINATION —
  // 「傷害在衝刺結束一次結算」 (A0OG j-note), 「到位後 250×250 rect 內結算」
  // (A0I1), 「終點對收集組一次判傷」(A0DO). `kind: "dash"` has no arrival hook
  // at all: `{ mode, speed, maxDistance }` and nothing else. An `effects:
  // [dash, damage]` expansion runs the damage on the CAST tick, at the ORIGIN —
  // a skill that looks right in a screenshot and hits the wrong half of the
  // arena. `kind: "leap"` already carries `landRadius` + `onLand`, and
  // LeapSystem's `detonate` re-resolves `enemiesInCircle` AT THE LANDING POINT
  // before running them, which is precisely the JASS's own shape.
  //
  // So the charge is a leap with an authored apex, and `apexHeight` defaults to
  // 0 = a FLAT ground charge (18 of the 20 members have no vertical component;
  // only 52-02 蹂躪編年史's `-3(i-11)²+300` throw does). Authoring a non-zero
  // apex turns the same template into that throw. `requires` is updated to
  // ["leap", "knockback"] to match what it actually emits — `dash` was never
  // the blocker anyway (it has read `available: true` all along); `knockback`
  // was, and that is the flag this change flipped.
  //
  // ── DECISION POINTS ARE FIELDS (CLAUDE.md 第一守則) ───────────────────────
  // `pushFrom` (推開 / 沿面向 / 拉近) and `pushDistance`-absent (charge with no
  // shove at all — A0U8 巨神一擊) are choices the 20 members disagree on, so
  // neither is a branch chosen here. `pushDistance` is an OPTIONAL slot, so
  // clearing it in the editor really does drop the knockback effect, the same
  // way clearing 瞬發點爆's radius really does drop its AoE.
  //
  // ⚠️ `pushFrom` DEFAULTS TO "facing", NOT "caster", and that default was
  // corrected by MEASUREMENT rather than by taste — the first build of this
  // template defaulted to "caster" and the behavioural guard caught it shoving
  // victims the wrong way (6.2 GGD units WEST of where the no-push control run
  // left them). Two independent reasons, and they agree:
  //   · THE JASS: six of the eight shove-half members push along the CAST
  //     ANGLE — 「沿施法者面向拋飛」(A0U1 蹂躪編年史), 「沿施法角度每tick前推
  //     50u」(A092 巴歐．薩喀爾嘎 / A0Y7 謝謝指教), 「沿施法方向推退」(A0L6),
  //     「沿施法角推 40u」(A07F 神滅斬). Only A049 一騎槍閃 and A05S 寒冰破碎,
  //     whose casters never move, push radially away.
  //   · THE GEOMETRY: "away from caster" is DEGENERATE for a charge. The
  //     charger finishes standing on top of the victim, so `victimPos -
  //     casterPos` is ~0 and `shoveDir` falls through to its zero-vector
  //     fallback (shove opposite the victim's own facing) — a direction that
  //     has nothing to do with the attack. "facing" is the only reading that
  //     stays well-defined at the moment a charge actually resolves.
  // The other two values remain one dropdown away, which is the point.
  "charge-push": (t, p) => {
    const radius = num(t, p, "radius");
    const dashDistance = num(t, p, "dashDistance");
    const dashDurationSec = num(t, p, "dashDurationSec");
    const onLand: EffectDef[] = [
      damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage")),
    ];
    // The shove rides in `onLand` so its subjects are the bodies standing at the
    // DESTINATION (LeapSystem re-resolves them there) — not whoever happened to
    // be next to the caster when the button was pressed.
    if (has(t, p, "pushDistance")) {
      onLand.push({
        kind: "knockback",
        distance: num(t, p, "pushDistance"),
        speed: num(t, p, "pushSpeed"),
        from: str(t, p, "pushFrom") as "caster" | "facing" | "pull",
        launchHeight: num(t, p, "pushLaunchHeight"),
      });
    }
    return {
      castType: "ground",
      targetsEnemies: true,
      radius,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [
        {
          kind: "leap",
          mode: "toPoint",
          applyTo: "self",
          // A ground charge is a leap whose parabola is flat. `toApex(0)` is 0,
          // and leapHeightMilli(k, N, 0) is 0 for every k, so the body slides.
          apexHeight: num(t, p, "apexHeight"),
          durationSec: dashDurationSec,
          throwDistance: dashDistance,
          landRadius: radius,
          onLand,
        },
      ],
    };
  },

  // 11. 環形放射陣 (GH#244 機器組 2/3) — N 道等角放射, 八張卡.
  //
  // ── THE ANGLE STEP IS DERIVED, AND THAT IS THE WHOLE POINT ────────────────
  // The census's own summary describes this family as 「12 道 × 30° 朝內」 and
  // 「18 道 × 20° 朝外」 as if the count and the step were two independent
  // numbers. They are not. Re-measured off war3map.j, every member closes the
  // circle exactly:
  //     A012 天翔龍閃  18 × 20° = 360   (j:43247-43248)
  //     A01W HolyShit  18 × 20° = 360   (j:44519-44527)
  //     A0ZK 霸王色    10 × 36° = 360   (j:36870-36874)
  //     A07Z 暴雷無限刃 15 × 24° = 360   (j:47295-47296)
  //     A0JN 竹蜻蜓    12 × 30° = 360   (j:45743-45757)
  //     A0FP 蒼龍破    12 × 30° = 360   (j:38875-38876)
  //     A091 及喀爾度  2L × (180/L)= 360 (j:28224-28225 — the map author wrote
  //                     the division ITSELF, so the ring stays closed as the
  //                     count doubles per rank; the strongest single piece of
  //                     evidence that the step is a function, not a choice)
  // 7/8 exact; the eighth (A106 鄉民的正義, 5 × 75° = 375, j:38079-38080) is a
  // 4% overshoot on a 5-ray fan. So `angleStep` is NOT a slot — giving an
  // operator a field whose only correct value is 360/rayCount is CLAUDE.md
  // 陷阱 ③ (導出值不是參數) in its purest form.
  //
  // `spawnRadius` is derived too, and measured 6/6: a ray either starts at the
  // centre and travels out (A012 0→300, A01W 0→256, A0ZK 0→256) or starts on
  // the rim and travels in (A07Z 650→0, A0JN 200→0, A106 200→0). One number,
  // `reach`, is the outer extent in BOTH readings.
  //
  // ── WHAT ACTUALLY LANDS, AND WHAT DOES NOT ───────────────────────────────
  // `spawnProjectile` (effects/spawnProjectile.ts) launches ONE missile, from
  // the caster's own position, along `ctx.direction`. There is no per-effect
  // angular offset, no count and no origin offset, so N distinct rays are not
  // expressible today. The P1 collapse is the DISC the rays sweep: inward and
  // outward arrays both cover a circle of radius `reach` about the origin, so
  // the hit SET is right and only the shape and the gaps between rays are lost
  // — the same governance 直線分段掃擊 already ships under. That is why `aim`
  // carries an `inert` reason: under the disc collapse the two values are
  // literally the same expansion, and paramsSchema.test.ts would not have
  // caught that on its own (it only probes NUMERIC slots).
  //
  // ── 齊發 vs 逐道 IS A REAL AXIS, AND IT IS THE ONE THAT LANDS ─────────────
  // 5 of the 8 fire the whole ring on one frame; 3 stagger it (A01W 0.05s,
  // A0FP 0.03s, A0JN a 0.30s PERIODIC trigger = 12 rays over 3.6 s). A staggered
  // array is not a bigger burst — a body that stands in it is crossed by ray
  // after ray, i.e. exactly a `dot` of `rayCount` payouts `rayIntervalSec`
  // apart. So `rayIntervalSec` present → dot; cleared → one blast.
  //
  // ⚠️ THE DEFAULT PRE-FILLS `rayIntervalSec` EVEN THOUGH 齊發 IS THE MODE
  // (5/8), and that is deliberate rather than sloppy. paramsSchema.test.ts's
  // anti-silence probe expands from `defaultParamsFor`, so a slot live only in
  // the non-default branch would be forced to carry an `inert` flag — and
  // `inert` means 「本版不生效」, a claim that would be FALSE the moment the
  // operator switched modes. A pre-filled optional slot keeps the label honest
  // and is one field-clear away from the 齊發 majority. The cost is named:
  // with the interval CLEARED, `rayCount` stops affecting anything.
  //
  // A0FP's 0.03 s is BELOW one sim tick (1/30 = 0.0333), which is why `min` is
  // 0.034 — that member has to be authored as 齊發. Measured, not rounded away.
  "orbit-array": (t, p) => {
    const dt = damageType(t, p, "damageType");
    const amount = scaling(t, p, "damage");
    const staggered = has(t, p, "rayIntervalSec");
    const effects: EffectDef[] = staggered
      ? [
          {
            kind: "dot",
            damageType: dt,
            amountPerTick: amount,
            intervalSec: num(t, p, "rayIntervalSec"),
            // 逐道連發的總長 = 道數 × 間隔。DERIVED, so there is no
            // `durationSec` slot for an operator to contradict it with.
            durationSec: round2(num(t, p, "rayCount") * num(t, p, "rayIntervalSec")),
            // The first ray leaves on the cast frame in all three staggered
            // members (the loop body runs BEFORE its sleep), so the first
            // payout is immediate rather than one interval late.
            tickOnApply: true,
          },
        ]
      : [damageEffect(dt, amount)];
    return {
      castType: "ground",
      targetsEnemies: true,
      radius: num(t, p, "reach"),
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects,
    };
  },

  // 12. 範圍逐一施法 (GH#244 機器組 2/3) — 15 張卡, the third-largest machine.
  //
  // ── THE DUMMY IS NOT PART OF THE DESIGN ──────────────────────────────────
  // The census labelled all 15 「召喚代理」 and a literal reading would give
  // this family `requires: ["summon"]`. Read the JASS and the summon vanishes.
  // Every member is the same six lines (A0JX 45-02 千鳥流, j:41741-41759 is the
  // exemplar):
  //     ForGroup( UnitsInRangeOfLoc(R, origin) ):
  //         create a HIDDEN dummy with 2/6/10 s timed life
  //         give it the payload ability at the caster's rank
  //         IssueTargetOrder(dummy, "<order>", theEnumUnit)
  //     …sleep, then kill every dummy
  // The dummy exists because WC3 has no multi-target order — it is the engine's
  // limitation showing through, not a mechanic. GGD resolves an area against
  // every body in it natively, so this expands to ZERO summons. (The 2/6/10 s
  // timed lives are 陷阱 ④ 複製貼上的漂移: three values for "long enough for the
  // order to fire", exposed as a parameter by nobody.)
  //
  // ── WHAT MAKES IT A DIFFERENT MACHINE FROM 原地震波 ───────────────────────
  // The payload. 4 of the 15 are pure damage (chainlightning), but 11 carry a
  // STATUS the nova family cannot express at all: entanglingroots ×2 (A0GR
  // j:47862, A00O j:28137), sleep (A054 j:34532), impale (A05H j:42320),
  // polymorph (A105 j:38010), cripple (S001 j:44442), soulburn (A102 j:42200).
  // `statusId` is OPTIONAL, so clearing it really does give back the plain
  // 4-member chain-lightning shape.
  //
  // ── A NAMED GAP, NOT A SILENT ONE ────────────────────────────────────────
  // 2 of the 15 fan out onto ALLIES — 53-03 破法對咒 (antimagicshell, A0DS's
  // `targets_allowed` is `friend,self`) and 99-03 初音戰意 (innerfire). There is
  // deliberately NO `affects: enemies|allies` slot, because `castAbility`'s
  // `"ground"` branch calls `enemiesInCircle` UNCONDITIONALLY
  // (abilities/abilitySystem.ts) — a friendly ground AoE is not expressible in
  // the sim at all today. A slot whose "allies" value silently still hit
  // enemies would be worse than its absence: it would look supported.
  "proxy-fanout": (t, p) => {
    const effects: EffectDef[] = [
      damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage")),
    ];
    if (has(t, p, "statusId")) {
      const id = str(t, p, "statusId");
      effects.push({
        kind: "applyStatus",
        statusId: id as StatusId,
        duration: num(t, p, "statusDurationSec"),
        ...CC_MECHANIC[id],
      });
    }
    return {
      castType: "ground",
      targetsEnemies: true,
      radius: num(t, p, "radius"),
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects,
    };
  },

  // 13. 瞬移貼身 (GH#244 機器組 1/3) — 17 張卡, the largest UNBUILT machine.
  //
  // ── WHAT IS ACTUALLY IN THE FAMILY (11 of the 17, and why not 17) ─────────
  // Read against war3map.j rather than against the census label. ELEVEN members
  // are one machine — a body is picked up and put down somewhere else, with no
  // travel in between:
  //   · 貼上目標   A07M 17-03 空破圓斬 (j:28570), A05T 08-02 萊丁快速劍
  //     (j:28790), AEtq 13-03 快步 (j:45067-45089), A0J8 34-冥道殘月破,
  //     A10H 阿福 EX 龍化標記, A0IS 76-01 橡膠戰斧 (j:36272), A030 27-04
  //     飛燕閃 (j:41669)
  //   · 指向點     A0PM 82-02 虛空瞬動 (j:35335-35336)
  //   · 集結隊友   A0EY 英雄之笛 (j:47065), A0YA 和諧世界 (j:54706-54708),
  //     A10U 84-002 我只想確定你在這裡 (j:51024)
  // The other six were routed here by the signature clustering and are NOT this
  // machine, so they are not modelled and must not be counted as covered:
  // A08Y 猜猜拳 (距離三分支), A0O0 賣扣 (標記→拋飛到固定 rect, a parabola),
  // A0RO 魔法鎖鏈 (勾子回拉 — tpl-pull-throw), Aphx 百連我殺 (假死, movement:
  // 「無」), 暴走 (死亡換陣營), A0MV 冥道殘月破 EX (隱藏+暫停, 不是位移).
  //
  // ── THE FIDELITY COST, STATED UP FRONT ───────────────────────────────────
  // All eleven do `SetUnitPositionLoc` — SAME FRAME. The sim has no same-tick
  // reposition primitive, so this expands to a FLAT `leap`, and
  // `MIN_LEAP_TICKS = 2` (sim/movement/leap.ts, whose own comment says 「a
  // 1-tick leap is a teleport, not an arc」) floors the flight at 2 ticks =
  // 0.067 s. That is the whole of the gap and it is exposed as `travelSec`'s
  // MINIMUM rather than hidden: the shipped default sits ON the floor, and an
  // author who wants a visible streak raises it.
  //
  // A `kind: "blink"` would close it, and deliberately was not added: the
  // effect union / Zod mirror / registry are three files under concurrent edit
  // by other lanes, and a 0.067 s warp is behaviourally a warp. Named in the
  // report as the owner's call, not silently decided here.
  //
  // ── WHAT IS **NOT** A PARAMETER (陷阱 ③ 導出值不是參數) ────────────────────
  //   · THE BLINK DISTANCE. 82-02 縮地 hops a fixed 200 u per order
  //     (PolarProjectionBJ(…, 200.00, …) j:35335) and it is tempting to expose
  //     that as `blinkDistance`. It is the ability's own RANGE: a "ground" cast
  //     already has its point clamped to `resolveAbilityRange(def.range)` by
  //     abilitySystem, so a second distance field would either duplicate it or
  //     silently disagree with the range shown on the tooltip.
  //   · THE ANGLE. Every member computes it (`AngleBetweenPoints(casterLoc,
  //     targetLoc)`), never authors it.
  //   · THE ARC. `apexHeight` is fixed at 0 and that is the one hardcode here,
  //     so it needs its reason (寫死才需要理由): all eleven members have zero
  //     vertical component, and an arc'd reposition IS a different machine that
  //     already exists twice (tpl-leap-strike / tpl-charge-push). Offering the
  //     knob would make three templates the same machine.
  //
  // ── NAMED GAPS (measured, not expressible) ───────────────────────────────
  //   · 27-04 飛燕閃 lands 150 u SHORT of the target (j:41669). `leap` aims at
  //     `ctx.point` with no stop-short term, so this member arrives ON the
  //     target instead of in front of it.
  //   · 82-02 / 13-03 are TIMED WINDOWS (0.5×lvl s / (1+2×lvl) s) that convert
  //     every subsequent move order into a blink. That is a stance, not a cast.
  //   · The rally members refill HP/mana (A0EY/A0YA to 100 %, A10U by +50 %).
  //     `restore` exists and is NOT wired here on purpose: it applies to
  //     `ctx.targets`, and with the shipped `destination: "targetUnit"` those
  //     are ENEMIES — a filled-in field would heal the man you just blinked
  //     onto. A field that is right for one enum value and harmful for the
  //     other two is worse than its absence.
  //   · 08-02 / 27-04 hang A09O/A09P/A0F3 on the caster for the warp (untargetable
  //     mid-blink). `invulnerable` could carry it; left out for the same
  //     one-slot-two-meanings reason, and named instead.
  "teleport": (t, p) => {
    const dest = str(t, p, "destination") as "targetUnit" | "castPoint" | "rallyToCaster";
    const arriveRadius = num(t, p, "arriveRadius");
    const rally = dest === "rallyToCaster";
    // The arrival payload rides in `onLand`, because every damaging member of
    // this family strikes AFTER the reposition, never before: 27-04 teleports
    // at j:41669 and only then calls UnitDamageTargetBJ at j:41671. A top-level
    // `damage` would resolve on the CAST tick, at the origin — the same
    // 起跳點/抵達點 defect the charge-push note documents.
    //
    // ⚠️ `landRadius` is why `arriveRadius` has `min: 50` and not 0:
    // `LeapSystem.detonate` collects its subjects with `enemiesInCircle(…,
    // landRadius)` and returns EMPTY at 0, so a 0 radius would accept the
    // damage in the form and silently deal none. The JASS members damage the
    // TARGET UNIT, not a circle; a tight circle around the landing point is the
    // closest the landing payload can express, and that substitution is the
    // reason this slot exists at all.
    const onLand: EffectDef[] = has(t, p, "damage")
      ? [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage"))]
      : [];
    return {
      // "castPoint" aims at the ground (82-02 reads GetOrderPointLoc); the other
      // two aim at a UNIT — an enemy to jump onto, or the ally being summoned in.
      castType: dest === "castPoint" ? "ground" : "targeted",
      targetsEnemies: !rally,
      radius: arriveRadius,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [
        {
          kind: "leap",
          // RALLY inverts the subject: the ALLY flies, and `dragToCaster` moves
          // the arc's ORIGIN to the caster so `mode: "inPlace"` (distance 0)
          // resolves to the caster's own feet — i.e. `SetUnitPositionLoc(ally,
          // GetUnitLoc(caster))`, j:51024, expressed with the shipped primitive.
          mode: rally ? "inPlace" : "toPoint",
          applyTo: rally ? "target" : "self",
          ...(rally ? { dragToCaster: true } : {}),
          apexHeight: 0,
          durationSec: num(t, p, "travelSec"),
          landRadius: arriveRadius,
          ...(onLand.length > 0 ? { onLand } : {}),
        },
      ],
    };
  },

  // 14. 鎖定連段 (GH#244 機器組 1/3) — 8 張卡.
  //
  // ── `requires: ["combo"]` WAS WRONG, AND THAT IS THE FINDING ──────────────
  // The census gave this family the `combo` capability, which is the ONE row in
  // SIM_CAPABILITIES that is honestly `false` (no kind, no handler). Taken at
  // face value the family is unbuildable. Read the eight JASS clusters and it
  // needs no new primitive at all — it is four SHIPPED ones in a list:
  //     victim locked      → applyStatus{stun|root}
  //     caster untouchable → invulnerable{applyTo:"self"}
  //     N hits over time   → dot{amountPerTick, intervalSec, durationSec}
  //     terminal burst     → leap{inPlace, apex 0}.onLand  ← the ONLY scheduler
  //                          the sim has for "run this in N ticks"
  // So `requires` is ["periodicDamage","invulnerable","applyStatus","leap"],
  // every one of them `available: true`, and `combo` stays honestly false for
  // whoever actually needs a combo COUNTER.
  //
  // ── WHY THE `leap` IS NOT A HACK ─────────────────────────────────────────
  // It is doing two real jobs, not one fake one. (1) The finisher has to land at
  // the END of the 演出 and `onLand` is the sim's only deferred payload. (2) All
  // eight members `PauseUnitBJ` the caster for the whole combo, and a leap
  // override is exactly that — MovementSystem skips an overridden body, so the
  // caster cannot walk out of his own ultimate. `apexHeight: 0` keeps him on the
  // floor (`leapHeightMilli(k,N,0) === 0` for every k).
  //
  // ── 整段長度 IS DERIVED (陷阱 ③) ──────────────────────────────────────────
  // `hitCount × hitIntervalSec` IS the combo length, so there is deliberately no
  // `durationSec` slot: two fields that can disagree about one quantity is how a
  // dot outlives its own finisher. The JASS agrees — 84-04 給我蜂蜜 is 0.4 s ×6
  // then the finisher (j:51125-51200), 24-002 is 0.10 s ×51 paying every 10th
  // (j:27379-27407).
  //
  // ── THE ONE THING COLLAPSED, AND WHY IT IS NOT A LIE ──────────────────────
  // Every member teleports the CASTER around the victim between hits — 100 u
  // behind (A0CX j:51131), 100 u in front (A0RX j:37409-37433), 70 u around
  // (A077), 300 u behind (A06P j:29105-29117). None of it is collapsed away
  // carelessly: during the lock BOTH bodies are `PauseUnitBJ` + `Avul`, so the
  // caster's position feeds nothing except the origin of the final AoE, which
  // is his own feet either way. The choreography is 演出; the outcome is
  // identical. `hitIntervalSec` being CONSTANT is the real loss — 52-002
  // 射殺百頭 accelerates (CD ×0.75 per段, j:52176) and 01-04 超究武神霸斬 uses
  // `sleep 1 - 0.5i`; `dot` has one cadence, so those two flatten to their
  // median interval.
  "lock-combo": (t, p) => {
    const hitCount = num(t, p, "hitCount");
    const hitIntervalSec = num(t, p, "hitIntervalSec");
    // DERIVED — never a slot. Exactly `hitCount` payouts land, because the dot's
    // deadline is INCLUSIVE (effects/dotTick.ts) and `tickOnApply` is left off:
    // payouts fall on 1·I … hitCount·I.
    const comboSec = hitCount * hitIntervalSec;
    const finisherRadius = num(t, p, "finisherRadius");
    const dt = damageType(t, p, "damageType");
    const lockTarget = str(t, p, "lockTarget") as "stun" | "root" | "none";
    const casterGuard = str(t, p, "casterGuard") as "all" | "magic" | "none";
    const effects: EffectDef[] = [];
    if (lockTarget !== "none") {
      effects.push({
        kind: "applyStatus",
        statusId: "lock-combo" as StatusId,
        duration: comboSec,
        applyTo: "target",
        ...(lockTarget === "stun" ? { stun: true } : { root: true }),
      });
    }
    if (casterGuard !== "none") {
      effects.push({
        kind: "invulnerable",
        durationSec: comboSec,
        applyTo: "self",
        blocksDamage: casterGuard,
      });
    }
    effects.push({
      kind: "dot",
      damageType: dt,
      amountPerTick: scaling(t, p, "perHitDamage"),
      intervalSec: hitIntervalSec,
      durationSec: comboSec,
    });
    effects.push({
      kind: "leap",
      mode: "inPlace",
      applyTo: "self",
      apexHeight: 0,
      durationSec: comboSec,
      landRadius: finisherRadius,
      onLand: [damageEffect(dt, scaling(t, p, "finisherDamage"))],
    });
    return {
      castType: "targeted",
      targetsEnemies: true,
      radius: finisherRadius,
      effects,
    };
  },

  // 代理錨點施法 (召喚代理, 23 張卡 —— 總類表第二大的一台機器).
  //
  // ── 這台機器保留了什麼, 又刻意丟掉了什麼 ──────────────────────────────────
  // 23 支成員在 JASS 裡長得一模一樣: `CreateNUnitsAtLoc('hfoo'/'ogru'/…)` →
  // `ShowUnitHide` → `UnitAddAbilityBJ(X)` → `SetUnitAbilityLevelSwapped(X,
  // dummy, 施法者的技能等級)` → `IssuePointOrder` → 幾秒後 `KillUnit`。
  // 那隻 dummy 是 **WC3 的實作繞道**, 不是設計: WC3 沒有「不掛在單位上的法術」,
  // 要在別的座標放一發效果就只能先造一個身體出來。GGD 的 EffectDef 本來就不需要
  // 身體, 所以這裡不召喚任何東西 —— 那些 1s/2s/3s/5s/8s/20s 的清理 sleep 也一樣
  // 不是參數(它們是各作者複製貼上後各自改壞的垃圾回收時間, 正是「複製貼上的漂移
  // ≠ 設計」那條陷阱)。
  //
  // 真正保留下來的是原作做的兩件事:
  //   ① 錨點與施法者脫鉤 —— 家族最大的分歧, 11 支在施法點 (A02D/A0ZV/A0SD/A03L/
  //      A0S3/A0KC/A0ZU/A0D3/A0NA/A0Z4/A0QG)、7 支在施法者腳下 (A0H5/A0I8/A0RR/
  //      A023/A0L2/A02K/EX 龍眼)、3 支在目標身上 (A0D6/A0LD/…)。三種都在出貨,
  //      所以它是一個 `anchor` 下拉選單, 不是三個模板。
  //   ② 代理的那個技能連**負面狀態**一起帶進來 —— 這是這台機器跟現有那幾台的
  //      分水嶺: 在它之前沒有任何 enabled 模板能表達「打完還定身/減速」。
  //
  // ⚠️ 沉默 (66-02 驚駭 A0I9 5s / 48-00 石化之眼 / EX 龍眼 A117 / 84-03 蜜汁的
  //    soulburn A0D8 3s) 是這個家族第二常見的 rider, 而 sim 的 StatusEffect 只有
  //    root / stun / moveSpeedMult 三根軸, **沒有沉默**。它沒有被偷偷折算成暈眩:
  //    `statusId` 的選項裡就是沒有它, 作者得自己決定退成哪一個。
  //
  // `statusId` 是 OPTIONAL: 清空它真的會讓 applyStatus 整個消失 (20/23 支成員是
  // 純傷害), 跟 衝鋒推撞 清空 pushDistance 的語意一致。
  "proxy-cast": (t, p) => {
    const anchor = str(t, p, "anchor") as "self" | "point" | "target";
    const effects: EffectDef[] = [
      damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage")),
    ];
    if (has(t, p, "statusId")) {
      // 減速倍率跟著 status 文件走, 不是另一個欄位 —— content/status-effects/ 的
      // slow25/30/40 把「顯示的百分比」寫死在名字裡, 再給操作者一個自由倍率就會
      // 讓 HUD 的標籤說謊 (#125「顯示值 == 實際值」)。
      // ⚠️ 原作唯一量到的減速幅度是 **50%** (84-03 癱瘓 S005 data1=0.5、
      // 42-04 世界終結 A0P6 data3/data4=0.5), 出貨的三份文件卻是 25/30/40 ——
      // 也就是這個家族真正的減速目前授權不出來。缺的是一份 slow50 文件。
      const SLOW: Readonly<Record<string, number>> = { slow25: 0.75, slow30: 0.7, slow40: 0.6 };
      const id = str(t, p, "statusId");
      const mult = SLOW[id];
      effects.push({
        kind: "applyStatus",
        statusId: id as StatusId,
        duration: num(t, p, "statusDurationSec"),
        ...(mult !== undefined ? { moveSpeedMult: mult } : {}),
        ...(id === "root" ? { root: true } : {}),
        ...(id === "burnstun" ? { stun: true } : {}),
      });
    }
    return {
      castType: anchor === "self" ? "self" : anchor === "point" ? "ground" : "targeted",
      targetsEnemies: true,
      radius: num(t, p, "radius"),
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects,
    };
  },

  // 亂數彈幕轟炸 (8 張卡). 一個區域, N 發隨機落點的爆炸, 每發之間隔一段時間。
  //
  // ── 為什麼是 `dot` 而不是 N 個 `damage` ───────────────────────────────────
  // sim 沒有「排程一串未來的空間事件」這種詞彙, 而 `dot` 有的正是這個家族需要的
  // 三樣東西: 每次付多少 (`amountPerTick`)、多久付一次 (`intervalSec`)、付到
  // 什麼時候 (`durationSec`)。所以一片轟炸區 = 掛在區域內每個人身上的一段短促
  // 連續傷害, 這是今天做得到的最忠實形狀。
  //
  // ── `durationSec` 不是欄位, 是導出的 ──────────────────────────────────────
  // 原作的迴圈只有兩個自由度: `exitwhen index > N` 與 `TriggerSleepAction(dt)`。
  // 總時長是 (N − 1) × dt, 不是第三個獨立的數字 —— 把導出值也做成欄位, 操作者就
  // 有三個會互相打架的輸入, 而且其中一個不是原作寫下來的東西。
  // `tickOnApply: true` 是同一個理由: 原作是「先放一發, 再 sleep」(74-03 闇之
  // 天使 j:48509-48514 的順序), 所以第 1 發落在施法 tick 上, N 發共佔 (N−1)×dt。
  //
  // ── 決策點: 傷害怎麼付 ────────────────────────────────────────────────────
  // 8 支裡有 3 支 (23-03 雷牙一閃 j:31309-31315、81-02 Acxel Shooter
  // j:35875-35880、53-01 獸王牙操彈 j:40146-40151) 的彈幕**只是演出** —— 它們的
  // 迴圈裡連一行 `UnitDamageTarget` 都沒有, 傷害是迴圈跑完後對一個矩形判一次
  // (A0K1 j:40158)。把那三支算成 N 段傷害會直接變成原作的 3–15 倍。所以 `payout`
  // 是欄位, 預設 `perImpact` (另外 5 支)。
  //
  // ⚠️ 兩個落差, 寫在模板 description 上讓操作者在表單裡就看得到:
  //   · `dot` 綁的是**施法當下解出來的目標**, 開炸後才走進來的人不會挨、先走
  //     出去的人還會繼續挨。
  //   · 每一發的隨機落點沒有被模擬: 區域內的人是**每一發都吃到**。42-04 世界終結
  //     的雷震半徑 375 本來就大於散佈半徑 225, 那一支剛好完全吻合; 21-002
  //     天破壤碎 (散佈 600 / 半徑 320) 是這個模型最不準的一支。
  "random-barrage": (t, p) => {
    const payout = str(t, p, "payout") as "perImpact" | "onceAtCast";
    const dt = damageType(t, p, "damageType");
    // `num` 已經做完單位換算: wc3u 走 toLen, count/s 原樣。
    const impactRadius = num(t, p, "impactRadius");
    const scatterRadius = num(t, p, "scatterRadius");
    const count = num(t, p, "count");
    const intervalSec = num(t, p, "intervalSec");
    const effects: EffectDef[] = [];
    // 開場直傷 (42-04 世界終結 的 智慧×4 起手, j:37776 + j:37782)。OPTIONAL 而且
    // **沒有預設值** —— 8 支裡只有 1 支有, 所以新開的卡是純轟炸。
    if (has(t, p, "openingDamage")) {
      effects.push(damageEffect(dt, scaling(t, p, "openingDamage")));
    }
    if (payout === "perImpact") {
      effects.push({
        kind: "dot",
        damageType: dt,
        amountPerTick: scaling(t, p, "impactDamage"),
        intervalSec,
        // 導出值。round2 是因為 (9−1)×0.1 在 IEEE754 下是 0.8000000000000001,
        // 而 world.digest() 會把它雜湊進去。
        durationSec: round2((count - 1) * intervalSec),
        tickOnApply: true,
        // ⚠️ 這裡**不寫** `stacking`: 模板不該覆寫原始詞彙自己已經裁決過的預設
        // (見 EffectDef.dot.stacking 上那段 owner-facing 的說明)。少寫這一行 =
        // "refresh", 而那正是那個欄位自己選好的預設值。
      });
    } else {
      effects.push(damageEffect(dt, scaling(t, p, "impactDamage")));
    }
    return {
      castType: "ground",
      targetsEnemies: true,
      // 逐發結算 = 一個身體只要落在「散佈半徑 + 單發半徑」內就可能被掃到;
      // 一次付清 = 就是那一發的判定圓 (A0K1 450×450 rect / A0LB 400×400)。
      radius: payout === "perImpact" ? round2(impactRadius + scatterRadius) : impactRadius,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects,
    };
  },
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
