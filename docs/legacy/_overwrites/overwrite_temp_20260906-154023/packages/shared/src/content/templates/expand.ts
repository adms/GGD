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
import type { AbilityId, ProjectileId, StatusId, VfxId } from "../../ids";
import { DELAYED_MAX_COUNT } from "../../sim/effects/kindLimits";


/**
 * ⭐ 直線分段掃擊的**每段間隔**（秒）。
 *
 * ⚠️ 模板的 `params` 裡**沒有**這一格（`tpl-line-sweep.json` 只有
 * `segmentCount`/`stepSize`/`segmentAoe`/`damage`/`damageType`/`castTimeSec`），
 * ⛔ 而 `delayed` 需要一個節奏。
 *
 * ⭐ 0.05 秒的出處：`traveling-wave` 家族的出貨卡片用的就是這個量級
 * （`godie-e002.e` 的 `jumpIntervalSec: 0.05`），⭐ 而原作的分段推進是
 * **逐 tick 硬推**（`PolarProjection(pos, i×step, angle)`）—— 一個 WC3 tick 是
 * 0.04 秒（GH#840 逐行讀到的 `TriggerRegisterTimerEventPeriodic(…, 0.04)`）。
 * ⇒ 0.05 是「一段一 tick」的最近可用值，⛔ 不是一個好看的數字。
 *
 * ⚠️ ⭐ 它**該不該變成模板參數**是一個真的問題（第一守則：可調 > 寫死）——
 * ⛔ 但那要動 `tpl-line-sweep.json` 的 schema 與所有引用它的卡，
 * ⭐ 而這一輪的範圍是「把 inert 那三格接上」。⇒ 留一格 TODO，⛔ 不順手擴。
 */
const LINE_SWEEP_STEP_SEC = 0.05;
import type {
  TemplateDoc,
  ParamSlot,
  AbilityTemplateCard,
  TemplateConflictPolicy,
} from "../schema/template";
import {
  DEFAULT_TEMPLATE_CONFLICT,
  TEMPLATE_STACK_MAX_CARDS,
  zAbilityTemplateBinding,
} from "../schema/template";
import type { EffectCondition } from "../../sim/content/condition";
import type { MarkResetPolicy, MarkSpec } from "../../sim/marks";
import type { MarkLethalRule } from "../../sim/combat/lethalSave";
import { zEffectCondition } from "../schema/condition";
import { zId } from "../schema/common";
// ⭐【週期領域】的 schema 過門用它，⛔ 不是在這裡抄一張半徑表：
//    `resolveRadiusTier` 在載入時會用**出貨的** `config.aoe-tiers@1` 覆寫，
//    這裡只是為了讓 `shape:"circle"` 通過 refine（見 `periodic-field` 家族）。
import { DEFAULT_AOE_TIERS, type AoeTierName } from "../aoeTiers";

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
 * (closest zoom DOLLY_MIN = 10, pitch 68°, fov 0.8 rad), 蒼月潮's 07-03 was
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
  // ⭐ 2026-08-22 (#541) —— 這一列曾經是這張表裡**唯一誠實的 false**，現在它是
  // true。`kind: "comboStrikes"` 出貨了：N 段各自結算（各自的命中判定、各自的
  // on-hit 扇出、各自的減傷與記分）+ 可省的收尾 + 不等間隔 `steps[]` +
  // 家族節奏表 `config.combo-strikes@1`（第〇·四守則）。
  // ⚠️ 它**沒有自己的排程器**：班表推進 `SimWorld.delayed`，付款的是同一支
  // `delayedSystem`（第零守則⑨）。⛔ 所以 `travelingWave` 那一列指向 `delayed`、
  // 這一列指向 `comboStrikes` 並不矛盾 —— 兩個作者介面，一個引擎。
  combo: { p: 3, available: true },
  // ⭐ 2026-08-22 (#147) —— 【吸引】。⛔ 它**不是** `knockback` 的一個模式：
  // 擊退的作者寫的是一段長度（而且走 GH#193 的距離減法，那對拉是反過來的），
  // 吸引寫的是一個**落點**（施法者／落點／等分錨點環）。A091 05-03 及喀爾度
  // 的「2×等級 個錨點 + 250+100×等級 半徑」用擊退寫不出來。
  // ⚠️ 這一列在此之前**整列不存在**，而 `missingCaps` 把未知 key 當成缺失 ——
  // 也就是 `invulnerable` 踩過的那個更糟的形狀（見它上面那一段）。
  pull: { p: 2, available: true },
  // 具名標記 (2026-08-08). `SimWorld.marks` + `sim/marks.ts` 的 install/grant/
  // consume/reset + `combat/lethalSave.ts` 的免死攔截全部已經出貨。
  //
  // 它**不在** simCapabilityDrift 的 `CAPABILITY_KIND` 裡，理由與 `hooks` /
  // `auras` 相同：標記不是一個 `EffectDef.kind`，而是技能文件上的一個結構欄位
  // (`ability@1.marks`)，所以拿 `EFFECT_HANDLERS` 去對它只會得到假精確。守衛在
  // `sim/combat/lethalSave.test.ts` 與這一路自己的 `markStacks.test.ts`。
  marks: { p: 1, available: true },
  // Lane P1 持續傷害: `kind: "dot"` + SimWorld.dot + dotTickSystem all shipped,
  // `dot.test.ts` (21 cases) green. Not named in the brief this landed under —
  // it was found by diffing EFFECT_HANDLERS against this table, which is the
  // only way a stale row in here is ever going to be noticed.
  periodicDamage: { p: 3, available: true },
  /**
   * ⭐ 行進波動 —— 「傷害點沿一條線**逐段推進**，每一段各播一次特效並各結算
   * 一次」(GH#393, owner 2026-08-19)。`delayed.advance` + `hitOncePerTarget`
   * (sim/effects/delayed.ts 檔頭⑤) 出貨之後，`tpl-traveling-wave` 那三格
   * `inert`（「逐步推進未支援：每跳幾何折算為單發投射」）就過期了。
   *
   * ⚠️ 它與 `projectile` 是**兩件事**，而這個家族原本 `requires: ["projectile"]`
   * 正是那句折算的殘骸：一顆投射體會被碰撞與地形影響、有一顆會被看見的彈體；
   * 原作這 13 支是 locust dummy 每 tick 硬推固定距離
   *（`PolarProjection(pos, i×step, angle)`），**沒有一支是投射體**。
   *
   * ⚠️ 一次施放最多 `DELAYED_MAX_COUNT` 段（今天 32）。原作有兩支超過 ——
   * 04-03 龍破斬 70（那是迴圈保險絲不是實際步數）、02-002 神通眼 40 ——
   * 展開時會**擲一個指名的錯誤**，⛔ 不會被靜默夾掉。要放寬得先動 kindLimits。
   */
  travelingWave: { p: 3, available: true },
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
  /**
   * ⭐ **施法距離**（2026-09-02，GH#916 的 `blink-strike` 帶進來的）。
   *
   * ⛔⛔ 在此之前模板**表達不了它** —— 而「瞬移到目標身邊」這一族的
   * 距離就是它的定義（出貨五支 6／6／8／12／4.5 各不相同）。
   * ⇒ 沒有這一格，模板產出的技能會**沒有施法距離**，
   * 而那是一個 `params` 裡有、輸出裡沒有的**空宣稱**（第一·五守則）。
   *
   * ⚠️ 它進 {@link STACK_SCALAR_KEYS}：兩張卡各說一個距離 ⇒ 衝突要被指名，
   * ⛔ 不是靜靜取其中一個。
   */
  range?: number;
  castTimeSec?: number;
  targetsEnemies?: boolean;
  /** proc families (on-attack / on-hit-react) are PASSIVE; effects stays [] */
  innateKind?: "passive";
  passive?: AbilityPassive;
  /**
   * 進場時要裝在持有者身上的具名標記（【試煉】【風王結界】【縮地】——
   * `sim/marks.ts`）。`effects` 是「施放時做什麼」，這裡是「一開始身上有什麼」，
   * 所以一張只發標記的卡 `effects` 是空的而**不是**一個什麼都不做的技能。
   *
   * ⚠️ LIST-VALUED, 所以它跟 `effects` 一樣**串接**而不是走 `STACK_SCALAR_KEYS`
   * 的衝突政策（見 `expandStack`）。兩張卡各發一個標記 = 兩個標記。
   */
  marks?: MarkSpec[];
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

/**
 * 一個 `docRef` 槽 —— 另一份文件的編號（技能編號 或 status-effect id）。
 *
 * 驗**格式**不驗**存在**，而那個界線是刻意的：一個標記的身分可以來自
 * `abilities` 或 `status-effects` 兩個不同的 collection（owner 2026-08-08
 * 「都可以任意替換設定為 [技能編號/buff/debuff狀態]」），所以綁不到單一
 * collection 的存在性檢查上（完整推導見 `schema/mark.ts` 檔頭①）。
 * 用的是 `zId` 本人 —— 和編輯器表單那一側（`paramsSchema.ts` 的 `docRef` 分支）
 * 同一個 schema，這樣「表單收得下的」與「展開收得下的」不可能分岔。
 */
function docRef(t: TemplateDoc, params: Record<string, unknown>, name: string): string {
  const v = str(t, params, name);
  const parsed = zId.safeParse(v);
  if (!parsed.success) {
    throw new ExpandError(
      `template ${t.id}: param "${name}"="${v}" 不是合法的文件編號（小寫 a-z0-9 與 . _ -，1–64 字）`,
    );
  }
  return parsed.data;
}

/**
 * ⭐ 一個 `rgb` 槽（GH#693）—— 一組線性 RGB，三個 0…1。
 *
 * ⚠️ 範圍在這裡**再驗一次**而不是只信 schema：模板文件的 `default` 是
 * `z.unknown()`（`zParamSlot` 刻意扁平，見 `schema/template.ts` 檔頭），所以一份
 * 手寫的模板可以塞 `[255,100,100]` 進去而 Zod 不會擋 —— 而那在畫面上是「乘 255」
 * ＝一具過曝到全白的模型，⛔ 不會有任何錯誤訊息（失敗形態①）。
 */
function rgb(
  t: TemplateDoc,
  params: Record<string, unknown>,
  name: string,
): [number, number, number] {
  const v = raw(t, params, name);
  if (!Array.isArray(v) || v.length !== 3) {
    throw new ExpandError(`template ${t.id}: param "${name}" must be [r,g,b]`);
  }
  const out = v.map((c) => {
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 1) {
      throw new ExpandError(
        `template ${t.id}: param "${name}" 的每一格都要是 0…1 的線性色（原作的 0–255 要先 ÷255）`,
      );
    }
    return c;
  });
  return [out[0]!, out[1]!, out[2]!];
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

/**
 * 免死牌吃哪幾種傷害 —— 一個下拉選單 → `MarkLethalRule.damageTypes`。
 *
 * ⚠️ 為什麼是 enum 而不是「三個勾選框」：`damageTypes: []` 是一張永遠不觸發的
 * 免死牌，而文件看起來設定完整（`schema/mark.ts` 用 `.min(1)` 擋這件事）。三個
 * 各自獨立的布林槽可以組出那個空集合；一個下拉選單組不出來。
 *
 * 「真傷能不能被免死」因此是**選單上的一個選項**，不是程式裡的一個分支
 * （`combat/lethalSave.ts` 檔頭③）。
 */
const LETHAL_DAMAGE_TYPES: Readonly<Record<string, DamageType[]>> = {
  all: ["physical", "magic", "true"],
  physicalMagic: ["physical", "magic"],
  physical: ["physical"],
  magic: ["magic"],
  true: ["true"],
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

/**
 * ⭐【動畫特效家族】—— owner 2026-08-22 逐字點名的三支驗收技能共用的**一個**建構器：
 *
 * > 「**Saber約束勝利之劍(翻滾光束), 依文世界終結(圓周噴發大冰塊),
 * >  莉娜龍破斬(一直線火球衝擊波後目的地火焰大爆炸) 都是動畫特效**，
 * >  產出**技能與特效模板**還有**檢查script**，別忘了還有**特效文字**」
 *
 * 三支的共同形狀是同一句話：**沿路徑推進的模型 · 沿途掃到人 · 到點爆發**。
 * ⇒ 它們是**一個機制的三組參數**，⛔ 不是三份程式（CLAUDE.md 第〇·五守則）。
 *
 * ── ⛔ 為什麼這支函式存在（第零守則⑨）────────────────────────────────────────
 * 在它之前 `beam-roll` 與 `radial-burst` 是**兩段幾乎逐字相同**的分支，差別只有
 * 兩處：`castType` 與有沒有 `count`。再抄第三份（`line-blast`）就是那條規則
 * 逐字說的反面標記：「⛔ 如果我要寫的第二個東西跟第一個只差**參數**，停手，
 * 先抽模板」。⇒ 三個家族鍵指向**同一個** `Family`，差異全部由**模板宣告了哪幾格
 * params** 決定，⛔ 沒有一個 `if (t.family === …)`（那正是第〇·五說的越線）。
 *
 * ── 每一格差異怎麼被**推導**出來，⛔ 而不是被寫死 ────────────────────────────
 * | 差異 | 從哪裡推導 | ⛔ 不是 |
 * |---|---|---|
 * | `castType` | `path` —— `radial`/`orbit` 從施法者身上往外炸 ⇒ **沒有落點可以瞄** ⇒ `skillshot`；`forward`/`toTarget` 需要一個落點 ⇒ `ground` | 一張 family→castType 的手寫表 |
 * | `count`（等分幾具） | 模板有沒有宣告 `count` 這一格 | `family === "radial-burst"` |
 * | 落點大爆炸 | 模板有沒有宣告 `blastDamageTier` 這一格 | `family === "line-blast"` |
 *
 * ⚠️ 推導出來的 `castType` 與改動前**逐位元相同**：`tpl-beam-roll` 的 `path`
 * 預設是 `forward` ⇒ `ground`（原本寫死 `ground`）；`tpl-radial-burst` 的預設是
 * `radial` ⇒ `skillshot`（原本寫死 `skillshot`）。
 *
 * ── ⭐ 這一族存在的**第二個**理由，比「可以用它做一支新技能」更要緊 ──────────
 * 這三份 `content/ability-templates/tpl-*.json` **同時**是 `spawnModelFx.preset`
 * 的共用表（第〇·四守則，解析在 `content/modelFxPreset.ts`），而
 * `editorCapabilities.test.ts` 明文要求「**被出貨內容真的引用的家族必須展開得
 * 出來**」—— 一份對外契約上不存在的家族，外部編輯器看不到它，照著做的內容上線
 * 就是死的。⇒ 引用它就要能展開它，⛔ 不可以只放一張表。
 * ⚠️ 所以新增一份 fx 模板時**三件事一起做**：模板文件 · 這裡的家族鍵 ·
 * `editorCapabilities.ts` 的 `FAMILY_PROBE_LIST`。漏第三件 → 那條守衛紅。
 *
 * ── ⛔ 它不產生「傷害數字」──────────────────────────────────────────────────
 * 兩段傷害都走**級距**（`touchDamageTier` / `blastDamageTier`），爆炸範圍走 AoE
 * **級距**（`blastRadiusTier`）。⛔ 這裡一個算好的數字都沒有（第〇·四守則）。
 */
const modelFxFamily: Family = (t, p) => {
  const path = str(t, p, "path");
  if (
    path !== "forward" && path !== "toTarget" && path !== "orbit" && path !== "radial" &&
    // ⭐ GH#649/#673 —— `static`（原地開火,tpl-beam-roll 2026-08-24 的新預設）。
    //    這一格漏掉的症狀是:模板表單的**預設值本身**展不開（paramsSchema 守衛紅）,
    //    也就是編輯器開一張新卡就直接炸。
    path !== "static" &&
    // ⭐ GH#916 —— `fan`（以施法者面向為中心的等角扇）。這一格漏掉的症狀與
    //    `static` 那次一樣：模板表單的**預設值本身**展不開（paramsSchema 守衛紅）。
    path !== "fan"
  ) {
    throw new ExpandError(`template ${t.id}: param "path"="${path}" 不是合法的路徑`);
  }
  // ⭐「往哪裡去」決定「要不要瞄」：radial/orbit/static/fan 從施法者身上往外/原地，
  //    ⛔ 根本不讀目標點；forward/toTarget 需要一個落點。⇒ castType 是 path 的函數。
  // ⚠️ ⭐ `fan` 站在 skillshot 這邊是**推導的**，⛔ 不是挑的：它的方向來自
  //    `frame.facing`（`modelFxPlacement` 的 fan 分支逐字），⇒ 它一個目標點都不讀。
  const castType =
    path === "radial" || path === "orbit" || path === "static" || path === "fan"
      ? "skillshot"
      : "ground";
  // 落點大爆炸 —— ⭐ 由「模板宣告了 blastDamageTier 沒有」決定，⛔ 不是家族名。
  // ⚠️ `radius` 是 `zDamageArea` 的**必填**格，而真正說話的是 `radiusTier`
  //    （`resolveRadiusTier` 在載入時把 radius 蓋掉）。留著它是因為 AoE 級距表
  //    被關掉的那天，一個 0 半徑的爆炸與「這支技能沒有爆炸」長得一模一樣。
  const blast: EffectDef[] | undefined = has(t, p, "blastDamageTier")
    ? [
        {
          kind: "damageArea",
          damageType: damageType(t, p, "damageType"),
          amount: {
            damageTier: str(t, p, "blastDamageTier"),
            ...(has(t, p, "blastApRatio")
              ? { ratios: [{ stat: "ap", coeff: num(t, p, "blastApRatio") }] }
              : {}),
          } as unknown as Scaling,
          radius: num(t, p, "blastRadius"),
          radiusTier: str(t, p, "blastRadiusTier"),
          // ⭐ 爆炸要打到站在落點上的那個人。⛔ 省略它 = 震央本人不吃這一發，
          //    而「打到了但少一個人」在畫面上看不出來（失敗形態②）。
          includeOrigin: true,
        } as unknown as EffectDef,
      ]
    : undefined;
  // ⭐ GH#1047 —— `spacing` 只在 `count ≥ 2` 時發出。schema 的 refine 逐字
  //    「只有 path:"static" 且 count≥2 讀得到 spacing」⇒ 家族預設 count=1 卻照發
  //    spacing，預設展開就過不了 zAbilityDoc（tpl-beam-roll 在 2026-09-06 之前每一次
  //    開新卡都是這樣）。⛔ 不是拿掉 spacing 那一格：逐支把 count 覆寫成 >1 仍讀得到它
  //    （`paramsSchema.test.ts` 的 PROBE_COMPANION 帶著 count:2 驗它是活的）。
  const count = has(t, p, "count") ? num(t, p, "count") : 1;
  return {
    castType,
    targetsEnemies: true,
    ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
    effects: [
      {
        kind: "spawnModelFx",
        shape: "single",
        modelKey: docRef(t, p, "modelKey"),
        path,
        // ⭐ `static` 不位移（GH#649/#673）：speed/distance 是死欄位（schema 反過來
        //    禁填）,它的唯一終止條件是 lifeSec。⛔ 其他路徑照舊 —— rollback 到
        //    forward 時這兩格還在。
        ...(path === "static"
          ? {
              ...(has(t, p, "lifeSec") ? { lifeSec: num(t, p, "lifeSec") } : {}),
              // ⭐ GH#688 機制①：沿線 N 具的間距（count 在下面那行,兩者成對）。
              //    GH#1047：一具沒有間距可言 ⇒ count<2 不發（見上面 `count` 的註解）。
              ...(has(t, p, "spacing") && count >= 2 ? { spacing: num(t, p, "spacing") } : {}),
              // ⭐ GH#698 —— 落點（`self`／`point`／`target`）。**只有 static 讀得到**
              //    （`zSpawnModelFx.anchor` 的說明逐字），所以它住在這個分支裡而不是
              //    外面 —— 掛在外面的話，一份 `forward` 模板宣告了 anchor 就會展開出
              //    一格沒有人讀的欄位（這張家族表整篇在避免的形狀）。
              //    ⚠️ 既有四族一格都沒宣告 ⇒ `has()` 回 false ⇒ 展開結果逐位元不變。
              ...(has(t, p, "anchor")
                ? { anchor: str(t, p, "anchor") as "self" | "point" | "target" }
                : {}),
            }
          : {
              speed: num(t, p, "speed"),
              distance: num(t, p, "distance"),
              // ⭐ GH#693 —— `lifeSec` **不是 static 專屬**：`orbit` 的 schema 明文
              //    「繞圈沒有終點，缺了它這一具模型當場就消失」。在此之前它只在
              //    static 分支發出，於是一份宣告了 lifeSec 的 orbit 模板展開出來的
              //    節點會被 refine 擋下 —— 而「球體定點」正是 census 最大的一群
              //    （static-single 165 隻），出貨的六支球體用的就是 orbit 編碼。
              //    ⚠️ 三份既有模板（beam-roll static／radial-burst／line-blast）
              //    逐位元不變:後兩者根本沒宣告 lifeSec。
              ...(has(t, p, "lifeSec") ? { lifeSec: num(t, p, "lifeSec") } : {}),
            }),
        // ⚠️ `count` 是**傷害次數的乘數**，⛔ 不是一個純視覺的數字：十二具各掃
        //    一次 = 42-04 卡面承諾的「隨機12次區域傷害」。調小它總輸出跟著掉。
        ...(has(t, p, "count") ? { count: num(t, p, "count") } : {}),
        // ⭐ GH#916 —— 槍口偏移／扇形弧半徑。⚠️ ⭐ 這一行是被
        //    `paramsSchema.test.ts` 逼出來的（「a live form field the expander
        //    IGNORES」）—— 少了它 `path:"fan"` 的弧半徑是 **0**，
        //    ⇒ 三條龍**疊在同一個點**，而畫面上與「只有一條龍」一模一樣（失敗形態②）。
        //    ⛔ 既有八族一格都沒宣告 ⇒ `has()` 回 false ⇒ 展開結果逐位元不變。
        ...(has(t, p, "offsetForwardU") ? { offsetForwardU: num(t, p, "offsetForwardU") } : {}),
        // ⭐ GH#916 —— 扇形的相鄰臂間角。⛔ 只有 `fan` 讀得到它（schema 的
        //    `spreadDeg` 說明逐字），所以它由「模板有沒有宣告」決定，
        //    ⛔ 不是家族名。⚠️ 既有八族一格都沒宣告 ⇒ 展開結果逐位元不變。
        ...(has(t, p, "spreadDeg") ? { spreadDeg: num(t, p, "spreadDeg") } : {}),
        ...(has(t, p, "spinDegPerSec") ? { spinDegPerSec: num(t, p, "spinDegPerSec") } : {}),
        ...(has(t, p, "scale") ? { scale: num(t, p, "scale") } : {}),
        // ⭐ GH#698【剪輯那兩格】—— `clip` / `clipTimeScale` 在 2026-08-25 之前**只**住
        //    `content/modelFxPreset.ts` 的 `PRESET_FIELDS`，也就是說：走 `preset:` 引用
        //    的節點拿得到它們，而**編輯器用同一份模板新建一張卡拿不到** —— 同一份模板
        //    兩條路產出兩種節點，而兩邊都不會有東西紅（第三守則的形狀）。
        //    ⚠️ 既有四族一格都沒宣告 ⇒ `has()` 回 false ⇒ 展開結果逐位元不變。
        ...(has(t, p, "clip") ? { clip: str(t, p, "clip") } : {}),
        ...(has(t, p, "clipTimeScale") ? { clipTimeScale: num(t, p, "clipTimeScale") } : {}),
        // ⭐ GH#693【外觀那兩格】—— 顏色與透明度是**逐支技能**的參數,⛔ 不是
        //    「換一份已經染好色的模型」。census 量到 133/236 隻 dummy 非白,而且
        //    每一具都不同 ⇒ 沒有這兩格,一個家族的每一種顏色都要多開一份
        //    `model@1` 文件(第〇·四守則說的第二個住處)。
        //    ⚠️ 三份既有模板一格都沒宣告 ⇒ 展開結果逐位元不變。
        ...(has(t, p, "tint") ? { tint: rgb(t, p, "tint") } : {}),
        ...(has(t, p, "alpha") ? { alpha: num(t, p, "alpha") } : {}),
        // ⭐ 聲音跟著模板走（`content/modelFxPreset.ts` 的 SOUND_FIELDS 是同一件
        //    事的另一半）。⛔ 漏掉這兩行 = 表單上有一格 soundKey、展開出來的技能
        //    卻是啞的 —— 那正是這一批要修的那個病，只是換到編輯器那條路上。
        ...(has(t, p, "soundKey") ? { soundKey: docRef(t, p, "soundKey") } : {}),
        ...(has(t, p, "arriveSoundKey")
          ? { arriveSoundKey: docRef(t, p, "arriveSoundKey") }
          : {}),
        // ⭐「沿路掃到人」才是這一族與一發直線傷害的差別 —— 傷害走**級距**
        //    （damageTier），⛔ 這裡不算出數字（第〇·四守則）。
        // ⭐⭐ GH#693 —— 這一整段由「**模板有沒有宣告 `touchDamageTier`**」決定,
        //    ⛔ 不是家族名（與上面 `blast` 那一格逐字同一個推導）。
        //    ⚠️ 它不是潔癖:`tpl-locust-*` 那四份是**純演出**模板（owner 逐字
        //    「球體、蝗蟲群特效都要變成模板」），而 `tpl-beam-roll` 的檔頭已經
        //    立過這條規矩 ——「⛔ 不自動塞傷害:那會替每一支引用它的技能各加一份
        //    沒有人裁決過的傷害」（第一守則:出貨數值要引用得到 owner 的原話）。
        //    在此之前這一段是**無條件**的,於是一份不宣告傷害的模板連展開都會炸
        //    （`str()` 對缺席的槽擲 ExpandError）。
        //    三份既有模板全部宣告了 `touchDamageTier` ⇒ 逐位元不變。
        ...(has(t, p, "touchDamageTier")
          ? {
              onTouch: [
                damageEffect(damageType(t, p, "damageType"), {
                  damageTier: str(t, p, "touchDamageTier"),
                } as unknown as Scaling),
              ],
              touchRadius: num(t, p, "touchRadius"),
              ...(has(t, p, "touchSide")
                ? { touchSide: str(t, p, "touchSide") as "enemies" | "allies" }
                : {}),
            }
          : {}),
        // ⭐ 到點爆發 —— 與 `onTouch` 是**兩串班表**而不是一串：合成一串的話，
        //    路上已經被掃到的人會被「一人一次」的過濾器擋在爆炸外面。
        ...(blast !== undefined ? { onArrive: blast } : {}),
      },
    ],
  };
};

/**
 * ⭐ `body:"self"` 的 `championId` 佔位。
 * ⚠️ `summon` 的 schema 是 soft ref（⛔ 不驗存在），⭐ 而它是 `min(1)` ⇒ 空字串會炸。
 * ⛔ 這個 id 刻意**指不到任何文件** —— 它是「這一格不該被讀」的宣告，
 *    ⛔ 不是一個真的英雄；`self` 那條路在 sim 端一個字都不讀它。
 */
const SUMMON_SELF_PLACEHOLDER = "self";

const FAMILIES: Readonly<Record<string, Family>> = {
  /**
   * ⭐⭐ **召喚代理**（GH#898 / GH#903）—— 生出 N 具會自己打的身體。
   *
   * ── ⛔ 在此之前 ─────────────────────────────────────────────────────────
   * `tpl-summon-agent.json` 是一份 **`status: "draft"` 的空殼**（`params: {}`），
   * ⇒ ⭐ 引擎有 `summon` 機制（`schema/effects/summon.ts`，20 個決策點全部是資料），
   * ⛔ 而**沒有任何一支出貨技能用得到它** —— 因為沒有模板把它組起來。
   * ⇒ 於是 9 支召喚／分身技能被丟進**別的**模板：普屋 E 拿到的是
   *   `tpl-single-strike`（⭐ **單體打擊**）⇒ 卡面說「創造出 2 個實體」而它只打一下。
   *
   * ── ⭐ 為什麼每一格都是參數 ────────────────────────────────────────────
   * `summon` 的 schema 檔頭逐字寫著：那 20 個 enum「是 52 個召喚代理**互相不同意**
   * 的地方，所以沒有一個可以是程式裡的分支」。⇒ 這裡**一個 `if` 都沒有**：
   * 有沒有宣告那一格，決定它出不出現（同 `radial-burst` 的 `count` 判準）。
   *
   * ⭐ `body: "self"` 是**分身**那一族的答案（複製施法者自己的身體）——
   * ⛔ 那些文件不必再指名一次自己的英雄 id。
   *
   * ⚠️ `cleanse` 是**獨立的一格**：卡面上「並除掉身上的所有法術效果」與召喚是
   * 兩件事，⛔ 綁死在一起就表達不出「只召喚、不淨化」那一半的技能。
   */
  "summon-agent": (t, p) => {
    const self = has(t, p, "body") && str(t, p, "body") === "self";
    const summon: Record<string, unknown> = {
      kind: "summon",
      count: has(t, p, "count") ? num(t, p, "count") : 1,
      // ⭐ `body:"self"` 時 `championId` 由 sim 端填施法者自己 —— ⛔ 這裡不編一個 id。
      // ⭐ `body:"self"` 時 sim 端用施法者自己的身體 —— ⛔ 而 `summon` 的 schema 仍然
      //   要一格 `championId`（soft ref）。⇒ 填**施法者自己的技能所屬英雄**表達不出來，
      //   所以這裡填一個**明說是佔位**的 id：`self` 那條路一個字都不讀它。
      //   ⚠️ ⛔ 不可以填空字串 —— `zRef` 是 `min(1)`，⭐ 而那會讓整個模板展開失敗
      //   （2026-09-01 實測：整支技能被降級成「完全沒有效果」，而畫面上看不出來）。
      ...(self
        ? { body: "self", championId: SUMMON_SELF_PLACEHOLDER }
        : { championId: str(t, p, "championId") }),
      ...(has(t, p, "durationSec") ? { durationSec: num(t, p, "durationSec") } : {}),
      ...(has(t, p, "damageMult") ? { damageMult: num(t, p, "damageMult") } : {}),
      ...(has(t, p, "hpMult") ? { hpMult: num(t, p, "hpMult") } : {}),
      ...(has(t, p, "formation") ? { formation: str(t, p, "formation") } : {}),
      ...(has(t, p, "spread") ? { spread: num(t, p, "spread") } : {}),
      ...(has(t, p, "maxAlive") ? { maxAlive: num(t, p, "maxAlive") } : {}),
      ...(has(t, p, "onOwnerDeath") ? { onOwnerDeath: str(t, p, "onOwnerDeath") } : {}),
    };
    const cleanse = has(t, p, "cleanse") && str(t, p, "cleanse") !== "none";
    return {
      castType: "self",
      targetsEnemies: false,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [
        summon as never,
        ...(cleanse
          ? [
              {
                kind: "dispel",
                // ⭐ `single` ＝ 只清施法者自己（卡面：「除掉**身上**的所有法術效果」）。
                // ⚠️ ⛔ 不可以加 `side` —— Zod 逐字：「`shape:"single"` 讀不到 `side`⋯
                //    否則這一格是一個看起來有設、其實沒有人讀的數字」（第一·五守則）。
                // ⚠️ ⛔ 也沒有 `applyTo` —— `dispel` 的 schema 是 `.strict()` 而它不收那一格。
                shape: "single",
                pools: { status: true, dot: str(t, p, "cleanse") === "all" },
              } as never,
            ]
          : []),
      ],
    };
  },

  // 1. 單體斬擊 — one targeted magic strike. IMPURE-EXEMPLAR: 菲特 23-04 also
  // self-buffs + execute-gates; only the numeric core is seeded here.
  /**
   * ⭐⭐ **瞬移突斬**（GH#916）—— 瞬移到目標身邊、停在他前面一點點，落地打一發。
   *
   * ⛔⛔ 在 2026-09-02 之前它是一份 **`params: {}` 的空殼**（`status: "draft"`）
   * ⇒ ⭐ 對編輯器來說這塊積木**不存在**，而樹上有 **5 支**技能是手刻同一個形狀。
   * ⚠️ 那正是 `ggd-brick-census.json` 的 `shells: 17` 那一族 ——
   * ⭐ 而這一份是其中**唯一一個有真需求**的（其餘 16 份今天擋住 0 支）。
   *
   * ⭐ 每一格預設都**引用得到出處**（第一守則規矩 5，⛔ 沒有出處的預設會被
   * 後來的自己當成證據）：`stopShortUnits: 1.8` 是出貨 4/5 支的逐位元值、
   * `damage` 三支全部是 `damageTier:"小"` ＋ `coeff 0.5`、`range` 取中位數 6。
   *
   * ⚠️ ⛔ **另有 7 支純位移**（`to:"point"`、零 `onArrive`、`range 12`）——
   * 那是**另一個家族**，⛔ 不要把它們塞進這一份：這一份的 `onArrive` 是承重的，
   * 而它們一個 `onArrive` 都沒有。
   */
  "blink-strike": (t, p) => {
    const onArrive: EffectDef[] = [
      { kind: "spawnVfx", vfxId: str(t, p, "arriveVfxId"), at: "point" } as EffectDef,
      damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage")),
    ];
    return {
      castType: "targeted",
      targetsEnemies: true,
      range: num(t, p, "range"),
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [
        {
          kind: "blink",
          shape: "single",
          to: "targetUnit",
          applyTo: "self",
          stopShortUnits: num(t, p, "stopShortUnits"),
          onArrive,
        } as EffectDef,
      ],
    };
  },

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
  // (content/abilities/godie-h01u.e.json — a `skillremake:json` product
  // regenerated from tools/skill-remake/batch1.py, ⛔ NOT hand-authored) ships
  // `"castType": "ground", "range": 0, "radius": 9.72` — the template never
  // reproduced the one skill it was extracted from.
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

  // 4. 直線分段掃擊 — segmented line sweep.
  //
  // ⭐⭐ GH#401 ① —— 這一族的三格（`segmentCount`/`stepSize`/`segmentAoe`）
  // 在 2026-08-31 之前掛著 `inert`，逐字寫著：
  //
  //     「分段時序未支援：6 段掃擊折算為單發穿透投射，命中集合等價但逐段推進不表現」
  //
  // ⚠️ ⭐ 那不是一句 caveat，那是**整個家族被折算掉了**：一顆投射體的命中集合與
  // 「6 段各自結算一次」在紙上等價，⛔ 在畫面上完全不同 ——
  // 而且它會被碰撞與地形影響，⛔ 原作的 `PolarProjection(pos, i×step, angle)` 不會。
  //
  // ⭐ 而**機制早在 GH#393 就做出來了**（`delayed` + `advance`），
  // 只是這一族沒有跟上 ⇒ ⛔ 這裡沒有新引擎工作，⭐ 也沒有為任何一支技能寫一行 if
  //（第〇·五守則）：段數、步距、每段半徑全部是這張卡的參數。
  //
  // ⭐ 與 `traveling-wave` 走**同一條路**（⛔ 不是第二份實作）——
  // 兩族的差別只在參數名（`segmentCount` vs `stepCount`）與有沒有終點爆發。
  //
  // ⚠️ 單位：模板的 `stepSize`/`segmentAoe` 是 **wc3u**（模板 JSON 的 `unit` 逐字寫著），
  // 而 `advance.stepDist` 與 `delayed.radius` 吃 **GGD 單位** —— ⭐ 而 `num()` 在
  // `slot.unit === "wc3u"` 時**已經**跑過 `toLen()`（:387）⇒ ⛔ 這裡**不可以再除一次**。
  // ⚠️ 我第一版自己定義了一個 `WC3U_PER_GGD = 54.545` 又除了一遍 —— 那同時是
  //   **第二個住處**（`GGD_PER_WC3` 早就存在，第〇·四守則）**與**一次雙重換算
  //   ⇒ 半徑 0.067 而不是 7.33，⭐ 而畫面上「有東西在動」。
  // ⛔ 忘了換算會得到一條 54 倍長的線（而它「有東西在動」，看起來像對的）。
  "line-sweep": (t, p) => {
    const segments = num(t, p, "segmentCount");
    // ⛔ 大聲擋下，⛔ 不靜默夾掉（同 `traveling-wave` 的理由）。
    if (segments > DELAYED_MAX_COUNT) {
      throw new ExpandError(
        `template ${t.id}: segmentCount=${segments} 超過模擬器一次施放能排的段數 ` +
          `(DELAYED_MAX_COUNT=${DELAYED_MAX_COUNT})。把段數調低、或把 stepSize 加大 ` +
          `換取同樣的總射程；真的需要更多段要先改 sim/effects/kindLimits.ts 的上界。`,
      );
    }
    return {
      castType: "skillshot",
      targetsEnemies: true,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [
        {
          kind: "delayed",
          shape: "circle",
          // ⚠️⚠️ ⛔ **這裡不可以再除一次** —— `num()` 在 `slot.unit === "wc3u"`
          //   時**已經**跑過 `toLen()`（`expand.ts:387`）。
          // ⭐ 我第一版寫了 `/ WC3U_PER_GGD` ⇒ 除了兩次 ⇒ 半徑 0.067 而不是 7.33，
          //   而畫面上「有東西在動」—— ⭐ 抓到它的是 golden 那一條的數字斷言。
          radius: num(t, p, "segmentAoe"),
          side: "enemies",
          delaySec: LINE_SWEEP_STEP_SEC,
          count: segments,
          intervalSec: LINE_SWEEP_STEP_SEC,
          targetMode: "reresolve",
          // ⭐ 原作的規則，⛔ 不是我的偏好：站在線上的人被 N 段各打一次，
          //   而卡片寫的是**一次**的數字（同 `traveling-wave` 的註解）。
          hitOncePerTarget: true,
          advance: { stepDist: num(t, p, "stepSize"), dir: "facing" },
          effects: [damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage"))],
        },
      ],
    };
  },
  // 5. 行進波動 — travelling wave. 莉娜 04-03 龍破斬 (design canonical example).
  //
  // ⭐ GH#393（owner 2026-08-19，34-04 蒼龍破）：「JASS 應該有安排**位置移動**
  // 播放的**多次特效搭配傷害**」。在這一天之前，這個家族的三格
  // (`stepSize`/`stepCount`/`aoePerStep`) 全部掛著 `inert`：
  //
  //     「逐步推進未支援：每跳幾何折算為單發投射，推進節奏不表現」
  //
  // 那不是一句 caveat，那是**這個家族整個折算掉了** —— 一顆投射體的命中集合與
  // 「20 段各自結算一次」在紙上等價，在畫面上完全不同，而 `JASS_BEHAVIOR.json`
  // 裡有 **13 支**是這個形狀（龍破斬 45u×70 / 月牙天衝 50u×20 / 三千世界
  // 50u×15 / 光牙 50u×16 / 龍氣爆發 75u×25 / 神通眼 100u×40 / …），
  // 每一支都是 `PolarProjection(pos, i×step, angle)` 的逐 tick 硬推，
  // ⛔ 不是一顆會被碰撞與地形影響的投射體。
  //
  // 現在它展開成 `delayed` + `advance`（sim/effects/delayed.ts 檔頭⑤）——
  // ⛔ **這裡沒有為任何一支技能寫一行 if**（第〇·五守則）：段數、步距、每段
  // 半徑、節奏、終點爆發全部是這張卡的參數。
  //
  // ⭐ `hitOncePerTarget: true` 是**原作的**規則不是我的偏好：11-04 三千世界
  // (`ThworldGroup`)、27-01 風魔手裡劍 (`safe-group`)、60-01 迴旋鏢
  // (`SafeTargets`) 三支自己就帶著去重表。少了它，站在線上的人會被 N 段各打一次，
  // 而卡片寫的是**一次**的數字。
  "traveling-wave": (t, p) => {
    const stepCount = num(t, p, "stepCount");
    // ⛔ 大聲擋下，⛔ 不靜默夾掉：`delayed.count` 的上界是模擬器排程的預算
    // (`DELAYED_MAX_COUNT`)，而一個被偷偷夾成 32 的 70 段會少掉一半射程，
    // 畫面上跟「這支技能射程就是這樣」一模一樣（失敗形態②）。
    if (stepCount > DELAYED_MAX_COUNT) {
      throw new ExpandError(
        `template ${t.id}: stepCount=${stepCount} 超過模擬器一次施放能排的段數 ` +
          `(DELAYED_MAX_COUNT=${DELAYED_MAX_COUNT})。把段數調低、或把 stepSize 加大 ` +
          `換取同樣的總射程；真的需要更多段要先改 sim/effects/kindLimits.ts 的上界。`,
      );
    }
    const stepVfx = has(t, p, "stepVfx") ? docRef(t, p, "stepVfx") : undefined;
    const perStep: EffectDef[] = [
      damageEffect(damageType(t, p, "damageType"), scaling(t, p, "damage")),
    ];
    // ② 玩家要**看得見**那條線在走，不是只是挨打。一發一個 one-shot 落在
    // 那一段自己的落點上（`at: "point"`），所以畫面上的位置與判定的位置是
    // 同一個座標，⛔ 不是客戶端事後從面向猜出來的。
    if (stepVfx !== undefined) {
      perStep.push({ kind: "spawnVfx", vfxId: stepVfx as VfxId, at: "point" });
    }
    return {
      castType: "skillshot",
      targetsEnemies: true,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [
        {
          kind: "delayed",
          shape: "circle",
          radius: num(t, p, "aoePerStep"),
          side: "enemies",
          delaySec: num(t, p, "stepIntervalSec"),
          count: stepCount,
          intervalSec: num(t, p, "stepIntervalSec"),
          targetMode: "reresolve",
          hitOncePerTarget: true,
          advance: { stepDist: num(t, p, "stepSize"), dir: "facing" },
          effects: perStep,
          // 終點爆發 —— 只有最後一段追加，這正是 `finalEffects` 存在的理由
          // （龍破斬 j:「終點爆發: 收集450」/ 真-雷光劍「終點爆發: 500 AoE」）。
          ...(has(t, p, "terminalBurst")
            ? {
                finalEffects: [
                  {
                    kind: "damageArea",
                    radius: num(t, p, "terminalBurst"),
                    damageType: damageType(t, p, "damageType"),
                    amount: scaling(t, p, "damage"),
                  },
                ] as EffectDef[],
              }
            : {}),
        },
      ],
    };
  },

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

  /**
   * ⭐⭐【成長蓄能】GH#916 收斂 —— 每擊殺 N 次，永久 +1 點三圍（07-00 獸化心靈）。
   *
   * ⛔ 這個空殼從 GH#244 的 JASS 分群留到今天（`status:"draft"` ＋ **0 個參數**），
   * ⭐ 而機制**早就 100% 出貨了**：`schema/effects/grantAttribute.ts` 的檔頭
   * 第 9 行逐字寫著 `grantAttribute (07-00 獸化心靈)` —— 八個欄位全部是資料。
   * ⇒ 缺的從來不是機制，是**沒有人把它組成一個可挑的積木**（owner 逐字：
   * 「特效分析製作完**沒有收斂成果變成積木重複使用**」）。
   *
   * ── ⭐ 每一格 default 都指得到 war3map.j 的某一行 ────────────────────────
   *   j:14163 `ModuloInteger( udg_killUnit[…], **8** ) == 0`        → everyNth
   *   j:14166 `GetHeroStatBJ( bj_HEROSTAT_AGI, …, **false** ) < **120**`
   *                                        → maxAttribute ＋ maxAttributeBasis
   *   j:14225 `ModifyHeroStat( **bj_HEROSTAT_AGI**, …, **bj_MODIFYMETHOD_ADD**, **1** )`
   *                                        → attr ＋ mode ＋ amount
   *
   * ⚠️ ⭐ `everyNth` 是**這個 type 存在的理由**：出貨母體逐支不同（獸化心靈 8 ·
   * 鮮血神殿 14 · 賽亞人 15）—— ⛔ 逐支手刻 `grantAttribute` 是三份會各自腐爛的
   * JSON，⭐ 一格下拉選單是一個住處。
   *
   * ⛔ `attr` **沒有 `"all"`**：`grantAttribute.ts:24` 的 enum 逐字是
   * `["str","agi","int"]` —— 「三圍全加」在出貨內容裡是**三個 effect**
   * （48-03 鮮血神殿），⛔ 不是一個 enum 值。⇒ 這裡不發明第四個值。
   */
  "growth-charge": (t, p) => {
    const grant = {
      kind: "grantAttribute",
      attr: str(t, p, "attr"),
      amount: num(t, p, "amount"),
      ...(has(t, p, "mode") ? { mode: str(t, p, "mode") } : {}),
      ...(has(t, p, "everyNth") ? { everyNth: num(t, p, "everyNth") } : {}),
      ...(has(t, p, "maxAttribute") ? { maxAttribute: num(t, p, "maxAttribute") } : {}),
      ...(has(t, p, "maxAttributeBasis")
        ? { maxAttributeBasis: str(t, p, "maxAttributeBasis") }
        : {}),
      // ⭐ 缺席 ＝ **永久**（`grantAttribute.ts:38` 逐字：「缺省 = 永久(獸化心靈)」）
      ...(has(t, p, "durationSec") ? { durationSec: num(t, p, "durationSec") } : {}),
    } as unknown as EffectDef;
    const hook: HookDef = {
      on: "onKill",
      effects: [grant],
      // ⭐ 受害者過濾 —— 原作 j:14163-14171 的三條條件**只過濾殺手**
      //    （`GetUnitTypeId(GetKillingUnitBJ()) == 'Hpb1'`），⛔ 一條都沒有過濾
      //    受害者 ⇒ 家族預設不宣告它（任何擊殺都算）。
      ...(has(t, p, "victim") ? { victim: str(t, p, "victim") as never } : {}),
      ...(has(t, p, "internalCooldown") ? { internalCooldown: num(t, p, "internalCooldown") } : {}),
    };
    return { castType: "self", innateKind: "passive", effects: [], passive: procPassive(hook) };
  },

  /**
   * ⭐⭐【汲取吸附】GH#916 收斂 —— 掛上一段持續傷害，同時把血轉給施法者。
   * exemplar 90-00 寄生種子（`A0KV`，妙蛙種子／妙蛙花）。
   *
   * ── ⭐ 為什麼值得收（判準是「**它擋住幾支**」，⛔ 不是「看起來重要」）────
   * 2026-09-04 量到：`content/abilities/` 底下描述含
   * 「吸取／汲取／寄生／吸血／吸收生命」的有 **18 支**，
   * ⛔ 而今天**只有 2 份文件**（同一支的兩個鏡像）真的編成了 `dot`＋`heal`。
   * ⇒ ⭐ 那 16 支的落差就是這個 type 的存在理由。
   * （對照：`team-synergy` 與 `resource-ops` 各只有 **2 支** ⇒ ⛔ 那兩個不建。）
   *
   * ── ⭐ 形狀是**從出貨內容逐位元抄**的，⛔ 不是我設計的 ──────────────────
   * `godie-hgam.passive` 與 `godie-h02r.passive`（兩份逐位元相同）：
   *   `damage`（初擊）→ `heal{flat}`（回施法者）→ `dot`（每跳）
   * ⇒ 這一族展開出來的三個 effect **與那兩份對得起來**（diff=0 的目標）。
   *
   * ── ⚠️ `intervalSec` 的兩個來源打架，⭐ 而階梯決定了誰贏 ────────────────
   * 出貨 JSON 是 **1.0**；原作 `j:26604` 是 `TriggerSleepAction( **0.95** )`。
   * ⇒ 第〇·六守則：**編輯器產生的 JSON ＞ JASS 實際效果** ⇒ 取 **1.0**。
   * ⛔ 而 0.95 這個事實寫進 origin 保留著（⛔ 不是無聲丟掉）。
   */
  "drain-leech": (t, p) => {
    const dmgType = damageType(t, p, "damageType");
    const tierAmount = {
      damageTier: str(t, p, "damageTier"),
      ...(has(t, p, "apRatio") ? { ratios: [{ stat: "ap", coeff: num(t, p, "apRatio") }] } : {}),
    } as unknown as Scaling;
    const effects: EffectDef[] = [
      // ⭐ 初擊 —— 出貨那兩份的 effects[0]。⛔ 這一族不是「只有 dot」：
      //    原作 j:26608 的迴圈之前就先打了一下（w3a 的 data.1.1 = 50）。
      damageEffect(dmgType, tierAmount),
      // ⭐ 回施法者。⚠️ 出貨把「每跳回 50」**收斂成一次回滿** —— 那是既有的
      //    近似，⛔ 而我照抄它（diff=0 優先於「更像原作」）。
      {
        kind: "heal",
        amount: { flat: num(t, p, "leechFlat") },
      } as unknown as EffectDef,
      {
        kind: "dot",
        damageType: dmgType,
        amountPerTick: tierAmount,
        intervalSec: num(t, p, "intervalSec"),
        durationSec: num(t, p, "durationSec"),
        ...(has(t, p, "stacking") ? { stacking: str(t, p, "stacking") } : {}),
      } as unknown as EffectDef,
    ];
    return {
      castType: "targeted",
      targetsEnemies: true,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects,
    };
  },

  /**
   * ⭐⭐【生命操作】GH#916 收斂 —— 把生命／魔力**回到某個比例**。
   * exemplar 99-002 把你給MikuMiku掉（`A11F`，初音未來）。
   *
   * ── ⭐ 需求（量到的，⛔ 不是估的）────────────────────────────────────
   * `content/abilities/` 底下**已經有 14 支**在用 `restore` effect，
   * ⛔ 而它們全部是逐支手刻的 —— 沒有任何一支走模板。
   * ⇒ ⭐ 這一族的價值是把那 14 支的**共同形狀**收成一格下拉，
   * ⛔ 不是「多一個沒人用的名字」。（描述含「回滿／生命互換」的另有 15 支。）
   *
   * ── ⭐ 每一格的出處 ───────────────────────────────────────────────────
   *   j:55013 `SetUnitLifePercentBJ( GetSpellTargetUnit(), **100** )` → healthPct 1.0
   *   j:55014 `SetUnitManaPercentBJ( GetSpellTargetUnit(), **100** )` → manaPct 1.0
   *   兩行的對象都是 `GetSpellTargetUnit()`（⛔ 不是 `GetTriggerUnit()`）→ applyTo "target"
   *
   * ── ⛔ 它刻意**不含**「生命互換」與「以命換招」───────────────────────
   * 那兩個是 `swapResource` 與 `damage{hpPct}` —— **不同的 effect kind**，
   * ⭐ 而把三種塞進一個 `mode` enum 會讓這一族的每一格都變成「只有某個 mode 讀得到」
   * （＝一格看起來有設、其實沒有人讀的數字，第一·五守則）。
   * ⇒ 它們各自該是自己的積木，⛔ 不是這一族的第二條路。
   */
  "life-manipulate": (t, p) => {
    const restore = {
      kind: "restore",
      ...(has(t, p, "healthPct") ? { healthPct: num(t, p, "healthPct") } : {}),
      ...(has(t, p, "manaPct") ? { manaPct: num(t, p, "manaPct") } : {}),
      ...(has(t, p, "applyTo") ? { applyTo: str(t, p, "applyTo") } : {}),
    } as unknown as EffectDef;
    const applyTo = has(t, p, "applyTo") ? str(t, p, "applyTo") : "target";
    return {
      // ⭐ 「回誰的血」決定「要不要瞄」—— ⛔ 不是一張手寫的 family→castType 表
      //    （同 `modelFxFamily` 由 `path` 推導 castType 的那條規矩）。
      castType: applyTo === "self" ? "self" : "targeted",
      targetsEnemies: false,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [restore],
    };
  },

  /**
   * ⭐⭐【抓取投擲】GH#916 收斂 —— 抓住目標、拋出去、落地結算。
   * exemplar 52-02 蹂躪編年史（`A0U1`，`content/abilities/godie-hapm.w.json`）。
   *
   * ── ⭐ 為什麼這一族**不是** `barrier-domain` 那種專屬積木 ──────────────
   * ⚠️ 出貨編碼今天只有 **1 個節點**（`leap{applyTo:"target"}`）——
   * ⛔ 而那不是判準。判準是「**它擋住幾支**」，量到的是：
   *   · 描述含「抓住／拉近／投擲／丟出／擊飛」的 **9 支**
   *   · `docs/design/grab-family.md`（70KB，2026-07-26）逐格帶 j: 行號，
   *     而它的值來自 **A0Y7 · A0CX · A0L6 · A0SQ · A0U5 · A06P** 六支以上
   *     （例：`throwDistance` 共用引擎 500、A0L6 800、A0SQ 600、A0U5 200）
   * ⇒ ⭐ 每一格 default 引用得到**多支**技能的 JASS，
   * ⛔ 不是「17 格裡 13 格出處是同一支」那種形狀。
   *
   * ── ⛔ 只做 `leap` 載得動的那幾格 ──────────────────────────────────────
   * `grab-family.md` 的表有 `throwStepDistance` / `throwStepIntervalSec` /
   * `collisionEps` / `onCollide` / `approach*` —— ⭐ 而 `zLeap` 只有
   * `mode / apexHeight / durationSec / throwDistance / dragToCaster /
   * landRadius / onLand`（schema:16-26）。
   * ⇒ ⛔ 多宣告的每一格都會是「填了不會發生」（第一·五守則）——
   *    ⭐ 缺的那幾格是**下一個機制票**，⛔ 不是這一族的參數。
   */
  "pull-throw": (t, p) => {
    const leap = {
      kind: "leap",
      applyTo: "target",
      mode: str(t, p, "mode"),
      apexHeight: num(t, p, "apexHeight"),
      durationSec: num(t, p, "durationSec"),
      ...(has(t, p, "throwDistance") ? { throwDistance: num(t, p, "throwDistance") } : {}),
      // ⭐ `zParamType` 沒有 boolean（`schema/template.ts:63-71` 逐字七個值）
      //    ⇒ 用 enum 表達，⛔ 不是為了一格布林去改 schema。
      ...(has(t, p, "grabMode") ? { dragToCaster: str(t, p, "grabMode") === "dragToCaster" } : {}),
      ...(has(t, p, "landRadius") ? { landRadius: num(t, p, "landRadius") } : {}),
      // ⭐ 落地那一發走**級距**，⛔ 這裡一個算好的數字都沒有（第〇·四守則）。
      ...(has(t, p, "landDamageTier")
        ? {
            onLand: [
              damageEffect(damageType(t, p, "damageType"), {
                damageTier: str(t, p, "landDamageTier"),
                ...(has(t, p, "landApRatio")
                  ? { ratios: [{ stat: "ap", coeff: num(t, p, "landApRatio") }] }
                  : {}),
              } as unknown as Scaling),
            ],
          }
        : {}),
    } as unknown as EffectDef;
    // ⭐ 抓取期間施法者無敵 —— 出貨那一支的 `effects[0]` 就是它
    //    （`invulnerable{durationSec:1.05, applyTo:"self", blocksControl:true}`）。
    //    ⛔ 由「模板有沒有宣告 `grabInvulnSec`」決定，⛔ 不是無條件塞。
    const guard: EffectDef[] = has(t, p, "grabInvulnSec")
      ? [
          {
            kind: "invulnerable",
            durationSec: num(t, p, "grabInvulnSec"),
            applyTo: "self",
            blocksDamage: "all",
            blocksTrueDamage: false,
            blocksControl: true,
          } as unknown as EffectDef,
        ]
      : [];
    return {
      castType: "ground",
      targetsEnemies: true,
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [...guard, leap],
    };
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
  /**
   * ⭐⭐ **連段收尾**（GH#916）—— 「放招之後自動打打打打，最後一個重招結尾」。
   *
   * ── ⭐ owner 2026-08-23 逐字（模板文件的 description 抄著同一段）────────
   * 「龍虎亂舞是這個模板的**俗稱**，意思是類似**格鬥天王**裡的角色招式龍虎亂舞，
   *  **放招之後自動打打打打最後一個重招或大招結尾**」
   *
   * ── ⛔ 為什麼它在 2026-09-02 之前是「有模板、沒有積木」──────────────────
   * ⭐ 機制**早就做好了**：`comboStrikes` 的 schema（`effects/comboStrikes.ts`）
   * 與 sim 都在出貨。模板文件也有**13 格填好預設的參數**。
   * ⛔ 缺的只有**這一條接線** —— 而 `FAMILIES` 裡沒有它 ⇒ `isExpandable` 回 false
   * ⇒ ⭐ 對編輯器來說「連段收尾」這塊積木**不存在**。
   *
   * ⚠️ ⭐ 而出貨有 **1 支**技能在用 `comboStrikes`（`godie-hart.r` 01-04 超究武神霸斬）——
   * ⛔ 它是**手寫**的。⇒ ⭐ 這一條接線讓下一支不必再手刻一遍。
   *
   * ── ⛔ 它刻意**不**參數化的東西 ─────────────────────────────────────────
   * `strikes` / `damage` / `strikeReposition` **不在這 13 格裡** ——
   * ⭐ 它們是**這一支技能**的節奏與數值，⛔ 不是「連段收尾」這個家族的形狀。
   * ⇒ 文件用 `comboStrikes` 節點自己帶（`mergeExpansion` 會保留，見那一支的註解）。
   */
  "combo-finisher": (t, p) => {
    const hitText = str(t, p, "hitText");
    return {
      castType: "targeted",
      effects: [
        // ⚠️ ⭐ `as unknown as EffectDef` 與這個檔裡其餘家族同一個做法：
        //   `str()` 回 `string`，⛔ 而 schema 的 `damageType` / `at` 是**窄 union**。
        //   ⭐ 收窄的責任在 **Zod**（展開結果會過 `zAbilityDoc.safeParse`，
        //   見 `expandIfTemplated`）⇒ ⛔ 這裡再寫一次型別守衛是第二個住處。
        {
          kind: "comboStrikes",
          shape: "single",
          family: str(t, p, "comboFamily"),
          // ⭐ 每一下：傷害 → 打擊特效 → 跳字。⛔ 順序不是隨意的 ——
          //   特效要在傷害**之後**（傷害決定了有沒有命中），跳字最後。
          perStrike: [
            { kind: "damage", damageType: str(t, p, "damageType"), amount: { damageTier: "極小" } },
            {
              kind: "spawnVfx",
              vfxId: str(t, p, "hitVfx"),
              at: "bone",
              attach: "chest",
              boneOn: "victim",
            },
            {
              kind: "floatingText",
              shape: "single",
              text: hitText,
              applyTo: "victim",
              colorRgb: [255, 255, 255],
              sizeScale: num(t, p, "hitTextSizeScale"),
              riseSpeed: num(t, p, "hitTextRiseSpeed"),
              durationSec: num(t, p, "hitTextDurationSec"),
            },
          ],
          // ⭐ 收尾：重招 ＋ 全螢幕的兩件事（閃光與震動）——
          //   ⚠️ 那兩件是 `applyTo: "all"`，⛔ 不是只給受害者：
          //   owner 說的是「**大招結尾**」，而一個只有受害者看得到的收尾不是大招。
          finisher: [
            { kind: "damage", damageType: str(t, p, "damageType"), amount: { damageTier: "極小" } },
            { kind: "spawnVfx", vfxId: str(t, p, "finisherVfx"), at: "target" },
            {
              kind: "floatingText",
              shape: "single",
              text: hitText,
              applyTo: "victim",
              colorRgb: [255, 236, 168],
              sizeScale: num(t, p, "hitTextSizeScale") * num(t, p, "hitTextSizeGrowth") ** 0.5,
              riseSpeed: num(t, p, "hitTextRiseSpeed"),
              durationSec: num(t, p, "hitTextDurationSec"),
            },
            {
              kind: "screenFlash",
              shape: "single",
              colorRgb: [217, 235, 255],
              peakAlpha: num(t, p, "finisherFlashAlpha"),
              durationSec: num(t, p, "finisherFlashSec"),
              applyTo: "all",
            },
            {
              kind: "screenShake",
              shape: "single",
              amplitude: num(t, p, "finisherShakeAmplitude"),
              durationSec: num(t, p, "finisherShakeSec"),
              applyTo: "all",
            },
          ],
        } as unknown as EffectDef,
      ],
    };
  },

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
  // ⚠️ 2026-08-09 —— **owner 推翻了這一段原本的辯護**（GH#301-2）。
  // 原文是「A `kind: "blink"` would close it, and DELIBERATELY was not added …
  // a 0.067 s warp is behaviourally a warp. Named in the report as the owner's
  // call」。owner 做了那個 call，而答案是相反的：**「是真的瞬移，不是平移」**。
  // 0.067 秒的中間位置不是美術問題 —— 那兩格身體真的存在，會被範圍技掃到、
  // 會被地形擋，而瞬移的定義就是那兩格不存在。
  //
  // `kind: "blink"` 已經在 `sim/effects/effect.ts` / `content/schema/effect.ts`
  // / `effectRegistry.ts` 上（契約層 2026-08-09），行為是 GH#301-2。
  // ⛔ 這個模板**還沒**改接 `blink` —— 遷移那 11 支要連同行為一起驗，屬於
  // GH#301-2 的範圍。這段註解留在這裡是為了說明「為什麼還是 leap」，
  // 不是為了替它辯護（第三守則：一句不再成立的辯護留著就是謊）。
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
    // ⭐ 終結技 —— owner 2026-08-13 逐字：
    //   「砍 N 下, 第 N+1 下是**某個技能** 不是寫死約束勝利之劍吧?」
    //
    // 填了 `finisherAbility` ⇒ 收尾是一發 `proxyCast`，代放**那一支具名技能**；
    // 留空 ⇒ 沿用 `finisherDamage` 那個數字（84-04 給我蜂蜜那種沒有具名收尾的）。
    //
    // ⛔ 為什麼不可以「把那支技能的傷害抄一份進來」（20-002 上一版就是這樣，
    //    把 20-03 約束與勝利之劍的 damageLine 內嵌複製了一份）：那份複本與本尊
    //    **從此各走各的**。owner 調 20-03 的時候，連段裡的那一刀不會跟著改，
    //    而且沒有任何東西會紅 —— 兩份都合法、都會發、只是不再是同一招。
    //    這正是第〇·五守則「技能是資料不是程式」在**引用**這一邊的樣子。
    //
    // ⚠️ `payCosts: "none"`：代放是這一段連段的一部分，不是玩家又放了一次那支
    //    技能。付魔／轉冷卻會讓「放了大招結果大招自己鎖住自己」。
    const finisher: EffectDef = has(t, p, "finisherAbility")
      ? {
          kind: "proxyCast",
          shape: "single",
          abilityId: docRef(t, p, "finisherAbility") as AbilityId,
          payCosts: "none",
        }
      : damageEffect(dt, scaling(t, p, "finisherDamage"));
    effects.push({
      kind: "leap",
      mode: "inPlace",
      applyTo: "self",
      apexHeight: 0,
      durationSec: comboSec,
      landRadius: finisherRadius,
      onLand: [finisher],
    });
    // ⭐ 發動條件 —— owner 同一則：「而且超究**發動條件也不一樣**」。
    //
    // 上一版把「主動施放」寫死在回傳值裡，所以一段**由某個時刻觸發**的連段
    // （20-002：反彈成功才發）根本套不上這個模板，只能手刻一份 JSON。
    // 現在它是一格下拉：非 `onCast` 就整段掛進被動 hook，⛔ 不是複製一份模板。
    const trigger = str(t, p, "trigger");
    if (trigger !== "onCast") {
      return {
        castType: "self",
        innateKind: "passive",
        effects: [],
        passive: { ranks: [{ hooks: [{ on: trigger as HookEvent, effects, target: "event" }] }] },
      };
    }
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

  // 具名標記 (owner 2026-08-08) —— 一個有層數、會被消耗、可以跨回合的計數器，
  // 外加一張**可選的**免死牌。第一個使用者是海克力斯 52-00【十二道試煉】。
  //
  // ── 為什麼它是一個家族，而不是「十二道試煉」這一支 ────────────────────────
  // owner 的原話是「[試煉] 可以是任意技能的標記 like [風王結界] [縮地]」「都可以
  // 任意替換設定為 [技能編號/buff/debuff狀態]」。也就是**標記的身分本身**就是
  // 一個參數，而不是三支各寫一次的技能。所以 `markId` 是一個 `docRef` 槽（新增
  // 的槽型別，見 schema/template.ts）而不是一份白名單 —— `CC_MECHANIC` 那種
  // 「只有我列進去的三個 id 能用」的形狀正好是這條需求要避免的東西。
  //
  // ── 這張卡**不產生 `effects`**，而那不是空技能 ───────────────────────────
  // `effects` 是「施放時做什麼」，`marks` 是「一開始身上有什麼」。天生技把標記
  // 發下去之後，真正會動的是傷害管線上的 `lethalSaveFor` 與屬性管線上的
  // `syncPerStackSource`，兩者都不經過 `runEffects`。所以 `castType: "self"` +
  // `innateKind: "passive"` + 空 `effects`，跟 攻擊觸發 / 受擊反應 同一個形狀。
  //
  // ── 免死那一條鏈，逐段對照 owner 的規格 ──────────────────────────────────
  //   「受到致命傷害時消耗一層試煉」        → lethal.consume / damageTypes
  //   「進入 [無敵] 狀態1.5秒」             → selfEffects[0] invulnerable
  //   「隨後 [回復] 50%最大生命」           → selfEffects[1] restore.healthPct
  //   「並[擊退]並[暈眩] 0.5秒 [周圍]敵人」 → aoeEffects knockback + applyStatus
  //   「每失去一層永久提升10%攻/血」        → perStackLost（`spent` 乘在 sim 端）
  //   「跨回合共享12次」                    → resetOn: "match" + durationSec: -1
  //
  // ⚠️ 兩個**已知的落差**，寫在這裡而不是留給下一個人自己發現：
  //   · 「隨後」不存在。`lethalSaveFor` 把 selfEffects 與 aoeEffects 都跑在**救活
  //     的同一格**，sim 沒有「N tick 之後再跑這批效果」的排程器（鎖定連段是拿
  //     `leap.onLand` 當排程器用的，而這裡沒有位移可以掛）。所以無敵、回血、擊退
  //     同時發生。玩家看得到的差別：無敵的那 1.5 秒是**回血之後**才開始保護他。
  //   · `surviveHpPct` 與 `restoreHealthPct` 是**兩個**旋鈕而不是一個。前者是
  //     「扣血那一刻血條停在哪」（沒有它人就死了），後者是緊接著的回復。十二道
  //     試煉把前者設在 1%、後者 50%，所以畫面上是「剩一絲血 → 回到半血」。
  //     兩個都設 0.5 也是合法的（直接停在半血，不演那一下）。
  // 17.5 ⭐【週期領域】—— 一片每 `intervalSec` 就把圈內重算一次的傷害場。
  //      04-02 炸彈陣 · 37-03 災難之牆（anchor:"point"，放完留在原地）／
  //      90-01 飛葉快刀 · 92-04 馬勒戈壁 · 99-04「初音週遭的部隊每秒受到傷害」
  //      （anchor:"caster"，圈跟著施法者走）。
  //
  // ── ⛔ 這一族在 2026-08-30 之前**不存在**，而 `tpl-periodic-field.json` 已經
  //    出貨了 ⇒ 任何技能寫下 `template.ref="tpl-periodic-field"` 都會在
  //    `registerAll` 展開時擲 `family "periodic-field" has no P1 expand path`，
  //    然後被 `expandIfTemplated` 的 fail-open **降級成一支空技能**。
  //    ⇒ GH#648 的 38 支「卡面宣稱迴圈、JSON 一格機制都沒有」全部卡在這一列。
  //
  // ── ⭐⭐ 這一族存在的**第二個**理由：它是一個平衡決策的**唯一住處** ────────
  //
  //  ⭐【決策】`damageTier` 名的是**整段**的預算，⛔ 不是**逐發**的量。
  //     每一發拿到的是 `整段 ÷ 發數`，而那個除法寫成 `Scaling.mult` ——
  //     一個**運算子**，⛔ 不是一個算好的數字（第〇·四守則）。
  //
  //  為什麼是「整段」而不是「逐發」（⛔ 不是我挑的，這條有出處）：
  //  `content/config/damage-tier-exemptions.json` 的 `dot-per-tick` 逐字寫著
  //  「五級距的錨點是『20 發打死中位英雄』，那把尺量的是**單發**；把每跳拉到
  //   級距等於整條 DoT 乘上跳數」。⇒ 一片跳 5 發的領域若每發都吃滿級距，
  //  它就是設計預算的 **5 倍**，而 ⛔ **沒有任何既有的閘會紅**
  //  （`tierFlatExclusive` 只問「有沒有第二個住處」，⛔ 不問「乘了幾次」）。
  //
  //  ⚠️ ⛔ **不可以把這個決策抄進 N 份技能 JSON**（＝在每一支上手寫
  //  `damage{flat: 整段÷發數}`）—— 那正是第〇·四守則的 O(N) 第二住處：
  //  owner 改一格級距表，N 份 JSON 一起變成謊話，而全部是綠的。
  //  ⇒ 它住在**這一列**，而發數由 `durationSec / intervalSec` **算出來**
  //    （⛔ 所以模板沒有 `count` 這一格 —— 算得出來的值不進文件）。
  //
  //  ⭐ 回頭的成本：改**這一行**（把 `mult` 拿掉 = 回到逐發吃滿級距），
  //  ⛔ 不是去改 N 份內容。
  //
  // ── ⚠️ `shape:"circle"` **一定要帶字面 `radius`** ───────────────────────
  //  `schema/effects/_shared.ts:286` 的 refine 逐字要求它（「沒有半徑的圓在執行期
  //  會直接 return」），⛔ 而它跑在 `withTiers` 的 `resolveRadiusTier` **之前**
  //  （`registries.ts::expandIfTemplated` 的 `zAbilityDoc.safeParse`）——
  //  ⇒ 只填 `radiusTier` 的圓**連載入都載不了**，而且是**靜默降級**。
  //  ⭐ 所以兩格都填，而 `resolveRadiusTier` 在載入時會**覆寫** `radius`
  //    ⇒ 級距仍然是唯一的住處，字面值只是 schema 的過門。
  //    這與 8 個出貨 circle 節點（`godie-e007.r` / `godie-o00k.r` …）逐字同形。
  "periodic-field": (t, p) => {
    const intervalSec = num(t, p, "intervalSec");
    const durationSec = num(t, p, "durationSec");
    // 落幾發 —— **算出來的**，⛔ 不是一格參數（第〇·四守則）。
    const ticks = Math.max(1, Math.round(durationSec / intervalSec));
    // ⛔ 大聲擋下，⛔ 不靜默夾掉（同 `traveling-wave` 的 stepCount）：一片被偷偷
    // 夾成 32 發的 60 秒領域，畫面上跟「這支技能就是這樣」一模一樣（失敗形態②）。
    if (ticks > DELAYED_MAX_COUNT) {
      throw new ExpandError(
        `template ${t.id}: durationSec=${durationSec} ÷ intervalSec=${intervalSec} = ${ticks} 發，` +
          `超過模擬器一次施放能排的段數 (DELAYED_MAX_COUNT=${DELAYED_MAX_COUNT})。` +
          `把 durationSec 調短、或把 intervalSec 加大。`,
      );
    }
    const anchor = str(t, p, "anchor") as "point" | "caster";
    const side = str(t, p, "applyTo") as "enemies" | "allies";
    const radiusTier = str(t, p, "radiusTier") as AoeTierName;
    // schema 的過門（見上）——`resolveRadiusTier` 在載入時覆寫它。
    // ⭐ 讀的是 `DEFAULT_AOE_TIERS`（級距表的唯一住處），⛔ 不是抄一張數字表。
    const radius = DEFAULT_AOE_TIERS.radius[radiusTier];
    const perTick: EffectDef[] = [
      damageEffect(damageType(t, p, "damageType"), {
        damageTier: str(t, p, "damageTier"),
        // ⭐ 整段 ÷ 發數（見上面的決策）。1 發時整格省略 ⇒ 逐位元等於沒有這一格。
        ...(ticks > 1 ? { mult: 1 / ticks } : {}),
      } as unknown as Scaling),
    ];
    // 每一發要**看得見**（同 `traveling-wave` 的 stepVfx）：落在那一發自己的
    // 圓心上，所以畫面上的位置與判定的位置是同一個座標。
    if (has(t, p, "hitVfx")) {
      perTick.push({ kind: "spawnVfx", vfxId: docRef(t, p, "hitVfx") as VfxId, at: "point" });
    }
    return {
      // ⭐ 圓心跟著人走 ⇒ 沒有東西要瞄（`delayed` 自己每發重讀施法者位置）；
      //    釘在地上 ⇒ 要一個落點，而 `ground` 那條分支才會把點交出來。
      castType: anchor === "caster" ? "self" : "ground",
      targetsEnemies: side === "enemies",
      // ⚠️ 施法指示器的走廊是從**技能自己的** `radius` 推導的（#401 的教訓：
      //    「a player cannot dodge what is not drawn」）⇒ 地上型一定要帶它。
      ...(anchor === "point" ? { radius } : {}),
      ...(has(t, p, "castTimeSec") ? { castTimeSec: num(t, p, "castTimeSec") } : {}),
      effects: [
        {
          kind: "delayed",
          shape: "circle",
          radius,
          radiusTier,
          side,
          // 第一發等一個間隔（＝「每秒」的第一秒），之後每 intervalSec 一發。
          delaySec: intervalSec,
          count: ticks,
          intervalSec,
          // ⭐ 這兩格合起來才是【週期領域】：`reresolve` 決定「到期重算誰在圈裡」，
          //    `anchor` 決定「那個圈在哪裡」（`schema/effects/delayed.ts` 檔頭⑥）。
          targetMode: "reresolve",
          ...(anchor === "caster" ? { anchor } : {}),
          effects: perTick,
        },
      ],
    };
  },

  // 18. 翻滾光束（橫放光束砲）—— 一具沿路徑硬推的模型，穿透式地掃過整條線。
  //     20-03 約束與勝利之劍（A0D5）是 exemplar；59-04 陽電子砲 / 08-03 龍鬥氣砲
  //     咒文 / 09-04 龜派氣功是同一個形狀（owner 2026-08-23 點名的四支經典）。
  //
  // ⭐ 這個家族存在的**第二個**理由，比「可以用它做一支新技能」更要緊：
  //    `content/ability-templates/tpl-beam-roll.json` 同時是
  //    `spawnModelFx.preset` 的**共用表**（第〇·四守則），而
  //    `editorCapabilities.test.ts` 明文要求「被出貨內容真的引用的家族必須展開
  //    得出來」—— 一份對外契約上不存在的家族，外部編輯器看不到它，
  //    照著做的內容上線就是死的。⇒ 引用它就要能展開它，⛔ 不可以只放一張表。
  //
  // ⚠️ `castType: "ground"` 而不是 `"skillshot"`：這一族的四支出貨技能全部是
  //    ground（59-04 / 20-03 是 `"ground"`，另外兩支是投射物 + 這道光束的疊加），
  //    而 `path:"toTarget"` 需要一個落點才瞄得到。
  //     ⇒ 三支共用 `modelFxFamily`（宣告在 FAMILIES 上面），差異全部由模板
  //       宣告了哪幾格 params 推導。⛔ 這裡沒有第二份程式。
  "beam-roll": modelFxFamily,

  // 19. 圓周噴發（大冰塊）—— 同一具模型等分成 `count` 具，從施法者身上**同時**朝
  //     四面八方推出去，每一具各自穿透式地掃過自己那條線。
  //     42-04 世界終結（A05D，十二道寒冰）是 exemplar；owner 2026-08-23 逐字點名
  //     「依文世界終結(圓周噴發大冰塊)」為三支驗收技能之一。
  //
  // ⭐ 它與上面那一族（翻滾光束）**共用同一個機制**，差別只有兩個參數：`path`
  //    （`radial` vs `forward`）與 `count`（等分幾具）。等分角度讀的是引擎共用的
  //    單位旋轉常數表（`sim/effects/spawnModelFx.ts`），⛔ 沒有第二份三角函式，
  //    也⛔ 沒有第二個 effect kind —— 第〇·五守則的形狀：機制在引擎、技能是資料。
  //
  // ⭐ 這一族存在的**第二個**理由與 beam-roll 逐字相同，而且它是硬的：
  //    `content/ability-templates/tpl-radial-burst.json` 同時是 `spawnModelFx.preset`
  //    的**共用表**（第〇·四守則），而 `editorCapabilities.test.ts` 明文要求
  //    「被出貨內容真的引用的家族必須展開得出來」。⇒ 出貨內容一引用它，這個家族就
  //    必須存在、必須進 `FAMILY_PROBE_LIST`。⛔ 不可以只放一張表。
  //
  // ⚠️ `count` 是**傷害次數的乘數**，⛔ 不是一個純視覺的數字：十二具各掃一次 =
  //    卡面承諾的「隨機12次區域傷害」。把它調小，那一支的總輸出跟著掉。
  //
  // ⚠️ `castType: "skillshot"` 而不是 `"ground"`：這一族從**施法者身上**往外炸，
  //    ⛔ 沒有落點可以瞄（`path:"radial"` 根本不讀目標點）。出貨的 42-04 兩份抄本
  //    也都是 `skillshot`。
  "radial-burst": modelFxFamily,

  // 20. 直線衝擊波（落點大爆炸）—— 同一個機制的第三組參數：沿面向推一具模型，
  //     路上穿透式掃人，飛完全程後在**落點**炸開一個範圍。
  //     04-03 龍破斬（A04R）是 exemplar；owner 2026-08-22 逐字點名
  //     「莉娜龍破斬(一直線火球衝擊波後**目的地火焰大爆炸**)」為三支驗收技能之一。
  //
  // ⭐ 它與上面兩族的差別**只有一格**：模板宣告了 `blastDamageTier`
  //    ⇒ `modelFxFamily` 自動掛上 `onArrive` 的 `damageArea`。
  //    ⛔ 沒有 `if (family === "line-blast")`，也⛔ 沒有第二個 effect kind ——
  //    落點爆炸用的是既有的 `spawnModelFx.onArrive` + `damageArea`（第〇·五守則）。
  //
  // ⚠️ `onArrive` 與 `onTouch` 是**兩串**班表：合成一串的話，路上已經被掃到的人
  //    會被「一人一次」的過濾器擋在爆炸外面 —— 而卡面承諾的是兩段。
  "line-blast": modelFxFamily,

  // ── ⭐⭐ 21–24. 蝗蟲群／球體特效四族（GH#693）────────────────────────────────
  //
  // owner 2026-08-25（逐字）：
  // > 「[重要]記得**所有這些球體、蝗蟲群特效 都要變成模板，可以被編輯器複用、
  // >  成為JSON設定模板標籤**」
  //
  // ⭐【分群是**推導**出來的，⛔ 不是我挑的四個名字】`tools/locust-census/gen.mjs`
  //    掃 236 隻 dummy × 644 個 JASS 生成點，對每一隻算兩根**引擎表達得出來**的軸：
  //      · 位移 —— 那個 rawcode 的生成點有沒有 `SetUnitPosition`（census `calls.moves`）
  //      · 多具 —— 生成點在不在 `loop` 裡（census `inLoop`）
  //    2×2 ⇒ 四群，而量到的分佈是
  //    **static-single 165 · static-line 15 · travel-single 12 · travel-line 4**
  //    （另 40 隻 `modelKind` 是隱形/承襲 ⇒ ⛔ 不進模板：那是 proxyCast 的活，
  //     零視覺移植工作，synthesis §2 逐字）。
  //
  // ⚠️ **⛔ 沒有第六個家族**，而那是刻意的取捨，⛔ 不是還沒做完：
  //    census 還量得到「有 timedLife」「有 anim/timeScale」兩根軸，但
  //      · `timedLife` 與 sleep-清場在 GGD 這一側是**同一格** `lifeSec`
  //        ⇒ 分開就是「一支技能一個模板」（票上的 ≤6 上限正是在擋這個）；
  //      · `anim`/`timeScale`（GH#689 的 `clip`／`clipTimeScale`）是**一格參數**
  //        ⇒ 四族各加一格就吃得到，⛔ 不需要一個家族。
  //
  // ⭐【與 beam-roll／radial-burst／line-blast 的分界線是**傷害**，⛔ 不是形狀】
  //    四族共用**同一支** `modelFxFamily`（⛔ 零行新程式），差別只有模板宣告了哪幾格：
  //    既有三族宣告 `touchDamageTier` ⇒ 展開出 `onTouch` 傷害（它們是**行為**模板）；
  //    這四族一格都不宣告 ⇒ **純演出**（`tpl-beam-roll` 檔頭立的那條規矩逐字：
  //    「⛔ 不自動塞傷害 —— 那會替每一支引用它的技能各加一份沒有人裁決過的傷害」）。
  //    ⇒ 要沿路掃傷害的技能自己寫 `onTouch`，或疊一張帶傷害的卡。
  //
  // ⚠️ 新增一份 fx 模板要**三件事一起做**：模板文件 · 這裡的家族鍵 ·
  //    `editorCapabilities.ts` 的 `FAMILY_PROBE_LIST`。漏第三件 → 那條守衛紅。

  // 21. 球體定點（census static-single，**165 隻，最大的一群**）——
  //     一具（或環上 N 具）擺在原地播完 `lifeSec` 就收。
  //     ⚠️ `path` 預設是 **`orbit`** 而不是 `static`，而那是**量出來的**，⛔ 不是
  //     偏好：出貨的六支球體（`godie-e00x.q` / `etyr.q` / `h01o.e` / `h020.r` /
  //     `hjai.r` / `u01u.r`）逐支寫的是 `orbit + count:1 + distance:0.1`，
  //     那是「定點」在這個引擎裡**既有的**編碼（`dx=dz=0`，與 static 同族線路）。
  //     改成 `static` 會動到那六支的線路酬載 ⇒ ⛔ 不是逐位元等價的 retrofit。
  "locust-orb": modelFxFamily,

  // 22. 沿線 N 具（census static-line，15 隻）—— `static + count × spacing`，
  //     原作「一次擺出整條線」（09-04 h006 `loop i=1..6 × 200`）。
  //     出貨採用者：`godie-ogrh.r` / `godie-o00x.r` 的火柱層。
  "locust-line": modelFxFamily,

  // 23. 推進單具（census travel-single，12 隻）—— 一具沿面向推出去。
  //     出貨採用者：`godie-u010.e` / `godie-uvng.e` 的黑洞層。
  "locust-travel": modelFxFamily,

  // 24. 推進多具（census travel-line，4 隻）—— `radial + count` 等分散開各自推進。
  //     出貨採用者：`godie-u010.ex` / `godie-uvng.ex` 的黑洞層。
  //     ⚠️ 它與 `radial-burst` 的**形狀**確實相同 —— 差別在上面那條分界線：
  //     radial-burst 宣告 `touchDamageTier`（一次施放 = 12 次區域傷害，卡面承諾），
  //     這一族一格傷害都沒有。⇒ 兩份**資料**，⛔ 零份重複的程式。
  "locust-swarm": modelFxFamily,

  // 25. 定點打擊（census static-single 的**誠實編碼**）—— GH#698。
  //     `static + anchor + clip`：一具擺在 self／point／target 腳下，播一條剪輯，
  //     活 `lifeSec` 就收。出貨採用者是 o00E 那一族「打雷」的 13 個節點。
  //
  //     ⭐【它為什麼**不是**把 anchor 加進 `locust-orb` 就好】—— 量到的，⛔ 不是偏好：
  //     `tpl-locust-orb` 的六格預設（`path:"orbit"` · `count:1` · `distance:0.1` ·
  //     `speed:1` · `lifeSec:2.5`，而且沒有 `clip`/`scale`）**逐格都不是**這 13 個
  //     節點要的值。所以「orb + anchor」對這 13 個節點收攏的欄位數是 **0** ——
  //     每一個仍然要自己寫 path／anchor／clip／lifeSec／scale（＋tint），而且還會被
  //     `fillOne` 補進 `count`/`distance`/`speed` 三格 **static 沒有人讀**的惰性幾何
  //     （第一·五守則正在擋的形狀）。`tpl-locust-strike` 收攏的是 78 → 19 格，
  //     其中 6 個節點變成只寫 `preset` ＋ `modelKey`。
  //
  //     ⚠️ **anchor 不是 census 的第三根軸**（票上的風險欄擔心「165 隻被再切一半」——
  //     那不成立）：`anchor` 來自**GGD 技能的 castType**（self→self／ground→point／
  //     targeted→target，`tools/skill-remake/common.py::static_model` 的檔頭逐字），
  //     ⛔ 不是那隻 dummy 在 JASS 裡的性質。⇒ 它是一格 param，分群不動。
  //
  //     ⚠️ 誠實記一筆：`locust-orb` 與這一族是**同一個 census 群（static-single）的
  //     兩種編碼** —— orb 的 `orbit + 環半徑 0.1` 是為了六支既有節點的**逐位元等價**
  //     而留下的 legacy 編碼。哪一天可以動那六支的線路酬載，orb 應該被這一族吸收，
  //     家族數回到 4。⛔ 在那之前合併它＝把六個節點的等價比對 golden 改掉，
  //     而那正是「改測試讓它變綠」。
  "locust-strike": modelFxFamily,
  /**
   * ⭐⭐【三條並排黑龍】38-002 究極暴走黑龍波（`A09I`）—— GH#916 收斂。
   *
   * ⭐ **零行新程式**：它是 `modelFxFamily` 的第 9 把鑰匙，差異全部由模板宣告了
   * 哪幾格決定（`path:"fan"` ＋ `spreadDeg` ＋ `offsetForwardU`）。
   *
   * ⚠️⚠️ ⭐ 它的形狀是 2026-09-04 **逐行讀 war3map.j** 才定案的，⛔ 而我第一次
   * 讀錯過：模板的 `inert` 散文寫「兩條側龍正是 facing±45」，⭐ 而那 ±45 是
   * **生成點的方位角**（j:44068/44069），⛔ 不是行進方向 —— j:44070 的
   * `CreateNUnitsAtLoc(…, **GetUnitFacing(施法者)**)` 說三具的 facing 是同一個。
   * ⇒ 起點排成弧、方向平行。⛔ 做成「方向扇」是近似，⛔ 不是翻譯。
   *
   * ⛔ **純演出**（同五份 `tpl-locust-*`）：模板不宣告 `touchDamageTier`
   * ⇒ `modelFxFamily` 不掛任何傷害。原作那一發在 j:44307
   * （`400 + 250×level`，移動觸發器裡逐 tick 結算）—— ⭐ 要接它得先有一格
   * 「沿路週期結算」，⛔ 而且傷害數字是 owner 的旋鈕（第一守則）。
   */
  "dragon-serpent": modelFxFamily,
  /**
   * ⭐⭐【環上十二個落點】38-03 邪王炎殺黑龍波的地面段（`A09I` 的第二半）。
   *
   * ⭐ 同樣**零行新程式**（第 10 把鑰匙）。`path:"orbit"` 是**推導**的，⛔ 不是挑的：
   * j:44087 的迴圈 `PolarProjectionBJ(udg_BlackDGP, 350.00, I2R(i) * 30.00)`
   * 生完就 `UnitApplyTimedLifeBJ(3.00)`（j:44088）—— ⭐ **一次 `SetUnitPosition`
   * 都沒有** ⇒ 環上不動、終點只有壽命 ＝ `orbit` 的定義。
   * ⛔ 做成 `radial` 會讓那 12 具往外飛。
   *
   * ⚠️ 每 30° 一具是 `count`(12) 推出來的（360÷12 = j:44087 的 `* 30.00`）——
   * ⛔ 不需要第二格。
   */
  "dragon-quake": modelFxFamily,

  "mark-stacks": (t, p) => {
    const lethalOn = str(t, p, "lethalMode") === "save";
    let lethal: MarkLethalRule | undefined;
    if (lethalOn) {
      const selfEffects: EffectDef[] = [
        {
          kind: "invulnerable",
          durationSec: num(t, p, "invulnerableSec"),
          // `invulnerable` 的 applyTo 預設就是 self，寫出來是因為隔壁的
          // `knockback`/`applyStatus` 預設是 target —— 這一組效果同時有兩種
          // 受詞，讓它們各自沉默地吃預設值是這段最容易讀錯的地方。
          applyTo: "self",
          // 免控與免傷是兩根獨立的軸（sim/effects/invulnerable.ts 檔頭②），
          // 而「被救回來的同一刻立刻被暈住」是不是可接受，是設計偏好。
          blocksControl: str(t, p, "invulnerableScope") === "damageAndControl",
        },
      ];
      // 0 = 不回復（純靠 surviveHpPct 停血）。一個 healthPct: 0 的 restore 是
      // 一個什麼都不做的效果，留著只會讓稽核以為回血壞了。
      const restoreHealthPct = num(t, p, "restoreHealthPct");
      if (restoreHealthPct > 0) selfEffects.push({ kind: "restore", healthPct: restoreHealthPct });

      // 0 = 不做 AoE。schema 那一側也擋了反過來的組合（有 aoeEffects 卻沒有
      // 半徑 → `lethalSave.ts:162` 的閘會讓那批效果永遠不跑）。
      const aoeRadius = num(t, p, "aoeRadius");
      const aoeEffects: EffectDef[] = [];
      if (aoeRadius > 0) {
        // 清空 `knockbackDistance` 真的會拿掉擊退，語意跟 衝鋒推撞 清空
        // `pushDistance` 一致。
        if (has(t, p, "knockbackDistance")) {
          aoeEffects.push({
            kind: "knockback",
            distance: num(t, p, "knockbackDistance"),
            speed: num(t, p, "knockbackSpeed"),
            // 免死的「施法者」是被救回來的那個人自己，所以 "caster" = 以他為圓心
            // 向外推。"pull"（把人拉進來）與 "facing"（照他的面向推）都是合法
            // 設計，所以這是一個下拉選單而不是一行寫死的方向。
            from: str(t, p, "knockbackFrom") as "caster" | "facing" | "pull",
          });
        }
        if (has(t, p, "stunSec")) {
          aoeEffects.push({
            kind: "applyStatus",
            // status 文件只帶 tags，真正會暈的是**效果上的** `stun: true`
            // （見 CC_MECHANIC 上面那段）。所以 statusId 在這裡只決定 HUD 上
            // 掛哪一個名字，機制不跟著它跑 —— 這也是它可以是自由 docRef 的原因。
            statusId: docRef(t, p, "stunStatusId") as StatusId,
            duration: num(t, p, "stunSec"),
            applyTo: "target",
            stun: true,
          });
        }
      }
      lethal = {
        consume: num(t, p, "lethalConsume"),
        surviveHpPct: num(t, p, "surviveHpPct"),
        damageTypes: LETHAL_DAMAGE_TYPES[str(t, p, "lethalDamageTypes")] ?? [],
        internalCooldown: num(t, p, "internalCooldown"),
        selfEffects,
        aoeEffects,
        aoeRadius,
      };
    }
    const spec: MarkSpec = {
      markId: docRef(t, p, "markId"),
      initial: num(t, p, "initial"),
      max: num(t, p, "max"),
      durationSec: num(t, p, "durationSec"),
      resetOn: str(t, p, "resetOn") as MarkResetPolicy,
      ...(has(t, p, "perStackLost") ? { perStackLost: modifiers(t, p, "perStackLost") } : {}),
      ...(lethal !== undefined ? { lethal } : {}),
    };
    return { castType: "self", innateKind: "passive", effects: [], marks: [spec] };
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
// 模板複數套用 — the STACK expander (owner 2026-07-31)
// ---------------------------------------------------------------------------

/**
 * `ability@1.template` in any of its three accepted shapes → ONE ordered card
 * list + the policy that governs it. This is the single place the three shapes
 * collapse, so no consumer ever has to branch on them.
 *
 * BACK-COMPAT IS THIS FUNCTION. A doc written before the stack existed carries
 * `{ref, params}` and comes out of here as a 1-card stack — and a 1-card stack
 * provably expands byte-identically to the old `expand(t, params)`
 * (`stack.test.ts`, over every enabled shipped template).
 */
export interface NormalizedTemplateBinding {
  readonly cards: readonly AbilityTemplateCard[];
  readonly onConflict: TemplateConflictPolicy;
  /** which of the three shapes the doc actually used — diagnostics only */
  readonly form: "single" | "array" | "stack";
}

export function normalizeTemplateBinding(binding: unknown): NormalizedTemplateBinding {
  const parsed = zAbilityTemplateBinding.safeParse(binding);
  if (!parsed.success) {
    throw new ExpandError(
      `ability.template is not a valid template binding — ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  const v = parsed.data;
  if (Array.isArray(v)) {
    return { cards: v, onConflict: DEFAULT_TEMPLATE_CONFLICT, form: "array" };
  }
  if ("cards" in v) {
    return { cards: v.cards, onConflict: v.onConflict ?? DEFAULT_TEMPLATE_CONFLICT, form: "stack" };
  }
  return { cards: [v], onConflict: DEFAULT_TEMPLATE_CONFLICT, form: "single" };
}

/**
 * The inverse of `normalizeTemplateBinding`: an ordered card list + a policy →
 * the SMALLEST binding shape that expresses it.
 *
 * ⚠️ ONE card at the default policy comes back out as the LEGACY `{ref,params}`
 * object, and that is the point rather than a nicety: re-saving a single-card
 * skill through the Forge must not rewrite it into a new shape and produce a
 * spurious diff on every ability the migration touches. `normalize(denormalize
 * (x)) === x` is checked in stack.test.ts.
 */
export function denormalizeTemplateBinding(
  cards: readonly AbilityTemplateCard[],
  onConflict: TemplateConflictPolicy = DEFAULT_TEMPLATE_CONFLICT,
): unknown {
  if (cards.length === 1 && onConflict === DEFAULT_TEMPLATE_CONFLICT) return cards[0];
  if (onConflict === DEFAULT_TEMPLATE_CONFLICT) return [...cards];
  return { cards: [...cards], onConflict };
}

/**
 * The SCALAR half of an ExpandResult — the keys where two cards can genuinely
 * disagree. Every one of them is primitive-valued on `ExpandResult`, which is
 * why `===` is a sufficient「same value」test and no deep compare is needed here.
 *
 * `effects` and `passive` are deliberately NOT in this list: they are the
 * LIST-valued half and they MERGE (see `mergePassive`). Order matters and is the
 * card order.
 */
const STACK_SCALAR_KEYS = [
  "castType",
  "radius",
  // ⭐ 2026-09-02 —— 見 `ExpandResult.range` 的理由。
  "range",
  "castTimeSec",
  "targetsEnemies",
  "innateKind",
] as const;
type StackScalarKey = (typeof STACK_SCALAR_KEYS)[number];

/** Where one value in the merged result came from. */
export interface StackValueSource {
  readonly cardIndex: number;
  readonly templateId: string;
  readonly value: unknown;
}

/** Provenance for ONE scalar key of the merged expansion. */
export interface StackKeyTrace {
  readonly key: string;
  /** the card whose value is in the merged result */
  readonly winner: StackValueSource;
  /** later cards that emitted the SAME value — agreement, never a collision */
  readonly agreed: readonly StackValueSource[];
  /** values that lost a real collision (empty unless `conflicts` names this key) */
  readonly shadowed: readonly StackValueSource[];
}

/** Two cards emitted DIFFERENT values for one scalar key. */
export interface StackConflict {
  readonly key: string;
  readonly kept: StackValueSource;
  readonly dropped: StackValueSource;
}

/** Provenance for ONE emitted EffectDef. */
export interface StackEffectTrace {
  /** index into the merged `result.effects` */
  readonly index: number;
  readonly cardIndex: number;
  readonly templateId: string;
  readonly kind: string;
}

/** What one card contributed, for the「第二張卡真的有被吃進去」panel. */
export interface StackCardTrace {
  readonly index: number;
  readonly templateId: string;
  readonly family: string;
  /** scalar keys this card emitted, whether or not it kept them */
  readonly emitted: readonly string[];
  /** scalar keys this card OWNS in the merged result */
  readonly owns: readonly string[];
  /** EffectDefs it contributed to the merged `effects` */
  readonly effectCount: number;
  /** passive hooks it contributed */
  readonly hookCount: number;
  /**
   * 具名標記它貢獻了幾個。⚠️ 這一格是必要的而不是裝飾：一張只發標記的卡
   * （mark-stacks 家族）`effectCount` 與 `hookCount` **都是 0**，而那個組合正是
   * 「這張卡被靜默丟掉了」的訊號。少了這一欄，展開來源面板會對一張完全正常的
   * 卡片說謊。
   */
  readonly markCount: number;
}

/**
 * The diagnostic record of a stacked expansion. It is what the Forge's 展開來源
 * panel renders and what proves a second card was actually consumed — an
 * expansion that silently dropped card 2 would leave `cards[1]` with
 * `effectCount: 0`, `hookCount: 0` and `owns: []`, which is an assertion a test
 * can make and a screenshot cannot.
 */
export interface ExpandStackTrace {
  readonly onConflict: TemplateConflictPolicy;
  readonly cards: readonly StackCardTrace[];
  /** scalar provenance in STACK_SCALAR_KEYS order — stable, never Map order */
  readonly keys: readonly StackKeyTrace[];
  readonly effects: readonly StackEffectTrace[];
  readonly conflicts: readonly StackConflict[];
}

export interface ExpandStackResult {
  readonly result: ExpandResult;
  readonly trace: ExpandStackTrace;
}

/** One entry of the stack, already resolved from `ref` to the template doc. */
export interface TemplateStackCard {
  readonly template: TemplateDoc;
  readonly params: Record<string, unknown>;
}

interface MutableKeyTrace {
  key: string;
  winner: StackValueSource;
  agreed: StackValueSource[];
  shadowed: StackValueSource[];
}

/**
 * The bookkeeping a single card's merge needs. Passed rather than closed over so
 * `mergePassive` stays a plain function with all its inputs visible.
 */
interface MergeCtx {
  readonly cardIndex: number;
  readonly templateId: string;
  readonly onConflict: TemplateConflictPolicy;
  /** who currently owns each NON-array passive key — exact provenance, not a guess */
  readonly owners: Map<string, StackValueSource>;
  readonly conflicts: StackConflict[];
}

/**
 * Resolve one scalar collision under the active policy, record it, and return
 * the surviving value. Shared by the passive merge and (in spirit) the scalar
 * loop below.
 */
function resolveScalar(ctx: MergeCtx, key: string, nextValue: unknown): unknown {
  const source: StackValueSource = {
    cardIndex: ctx.cardIndex,
    templateId: ctx.templateId,
    value: nextValue,
  };
  const held = ctx.owners.get(key);
  if (held === undefined) {
    ctx.owners.set(key, source);
    return nextValue;
  }
  if (held.value === nextValue) return held.value;
  const keepsHeld = ctx.onConflict !== "lastWins";
  ctx.conflicts.push({
    key,
    kept: keepsHeld ? held : source,
    dropped: keepsHeld ? source : held,
  });
  if (!keepsHeld) ctx.owners.set(key, source);
  return keepsHeld ? held.value : nextValue;
}

/**
 * Merge two passives. RANK-WISE, because a rank IS an ability level: card A's
 * rank 2 and card B's rank 2 describe the same level of the same skill and must
 * end up in the same `ranks[1]`, not appended after each other.
 *
 * Within a rank every ARRAY-valued key (`hooks`, `modifiers`, `auras`, and
 * anything AbilityPassiveRank grows later) concatenates in card order; a
 * non-array key that both sides set and disagree on is a real conflict and goes
 * through the SAME policy and the same `conflicts` list as a scalar collision,
 * keyed `passive.ranks[i].<key>`. Handling rank keys GENERICALLY rather than
 * naming hooks/modifiers/auras is deliberate: a list-valued rank field added
 * later would otherwise be silently dropped here, which is precisely the
 *「做了但玩家拿不到」shape this module is supposed to be immune to.
 *
 * Every non-array key it emits CLAIMS ownership through `ctx.owners`, so when a
 * third card collides with it the report names the card that really set the
 * value rather than「whichever card was merged last」.
 */
function mergePassive(
  acc: AbilityPassive | undefined,
  next: AbilityPassive | undefined,
  ctx: MergeCtx,
): AbilityPassive | undefined {
  if (next === undefined) return acc;
  if (acc === undefined) {
    if (next.name !== undefined) resolveScalar(ctx, "passive.name", next.name);
    for (const [r, rank] of next.ranks.entries()) {
      for (const [k, v] of Object.entries(rank as Record<string, unknown>)) {
        if (!Array.isArray(v) && v !== undefined) resolveScalar(ctx, `passive.ranks[${r}].${k}`, v);
      }
    }
    return next;
  }
  const name =
    next.name === undefined
      ? acc.name
      : (resolveScalar(ctx, "passive.name", next.name) as string | undefined);
  const depth = Math.max(acc.ranks.length, next.ranks.length);
  const ranks: AbilityPassiveRank[] = [];
  for (let r = 0; r < depth; r++) {
    const a = (acc.ranks[r] ?? {}) as Record<string, unknown>;
    const b = (next.ranks[r] ?? {}) as Record<string, unknown>;
    // Sorted union so the emitted key order is deterministic regardless of how
    // the two source objects were built (CLAUDE.md: Map/key iteration is sorted).
    const merged: Record<string, unknown> = {};
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const av = a[k];
      const bv = b[k];
      if (bv === undefined) merged[k] = av;
      else if (av === undefined && Array.isArray(bv)) merged[k] = bv;
      else if (Array.isArray(av) && Array.isArray(bv)) merged[k] = [...av, ...bv];
      else merged[k] = resolveScalar(ctx, `passive.ranks[${r}].${k}`, bv);
    }
    ranks.push(merged as AbilityPassiveRank);
  }
  return name === undefined ? { ranks } : { name, ranks };
}

/** Count the hooks a passive carries, across every rank. */
function hookCount(p: AbilityPassive | undefined): number {
  if (p === undefined) return 0;
  let n = 0;
  for (const r of p.ranks) n += r.hooks?.length ?? 0;
  return n;
}

/**
 * Expand an ORDERED STACK of template cards into one ExpandResult, plus the
 * trace that says which card produced which part of it.
 *
 * ⚠️ This never throws on a CONFLICT — it records one. The UI needs the merged
 * result AND the collision list on screen at the same time, and a throw can only
 * deliver one of them. `expandStackOrThrow` is the loader-side wrapper that
 * turns a `reject`-policy conflict into a hard failure.
 *
 * Under `reject` the FIRST writer keeps the key, so `result` is still a
 * well-defined object to render; under `lastWins` the LAST writer keeps it, and
 * the shadowed value stays visible in `keys[].shadowed` so「我填的數字去哪了」
 * has an answer instead of a shrug.
 */
export function expandStack(
  cards: readonly TemplateStackCard[],
  onConflict: TemplateConflictPolicy = DEFAULT_TEMPLATE_CONFLICT,
): ExpandStackResult {
  if (cards.length === 0) {
    throw new ExpandError(
      "template stack is empty — omit `template` entirely rather than storing zero cards",
    );
  }
  if (cards.length > TEMPLATE_STACK_MAX_CARDS) {
    throw new ExpandError(
      `template stack has ${cards.length} cards, over the ${TEMPLATE_STACK_MAX_CARDS} ceiling`,
    );
  }

  const keyTraces = new Map<string, MutableKeyTrace>();
  const conflicts: StackConflict[] = [];
  const passiveOwners = new Map<string, StackValueSource>();
  const effectTraces: StackEffectTrace[] = [];
  const cardTraces: StackCardTrace[] = [];
  const effects: EffectDef[] = [];
  const marks: MarkSpec[] = [];
  let passive: AbilityPassive | undefined;

  for (const [index, card] of cards.entries()) {
    const templateId = card.template.id;
    const ex = expand(card.template, card.params);

    for (const e of ex.effects) {
      effectTraces.push({ index: effects.length, cardIndex: index, templateId, kind: e.kind });
      effects.push(e);
    }
    // 標記跟 effects 一樣是 LIST-VALUED，所以**串接**而不是走 STACK_SCALAR_KEYS
    // 的衝突政策：兩張卡各發一個標記是兩個標記，不是一場衝突。
    for (const m of ex.marks ?? []) marks.push(m);

    const before = hookCount(passive);
    passive = mergePassive(passive, ex.passive, {
      cardIndex: index,
      templateId,
      onConflict,
      owners: passiveOwners,
      conflicts,
    });
    const contributedHooks = hookCount(passive) - before;

    const emitted: string[] = [];
    for (const key of STACK_SCALAR_KEYS) {
      const value = (ex as unknown as Record<StackScalarKey, unknown>)[key];
      if (value === undefined) continue;
      emitted.push(key);
      const source: StackValueSource = { cardIndex: index, templateId, value };
      const held = keyTraces.get(key);
      if (held === undefined) {
        keyTraces.set(key, { key, winner: source, agreed: [], shadowed: [] });
        continue;
      }
      if (held.winner.value === value) {
        held.agreed.push(source);
        continue;
      }
      // A REAL collision: two cards, same key, different values.
      const keepsHeld = onConflict !== "lastWins";
      conflicts.push({
        key,
        kept: keepsHeld ? held.winner : source,
        dropped: keepsHeld ? source : held.winner,
      });
      if (keepsHeld) {
        held.shadowed.push(source);
      } else {
        held.shadowed.push(held.winner);
        held.winner = source;
      }
    }

    cardTraces.push({
      index,
      templateId,
      family: card.template.family,
      emitted,
      // filled in below, once every card has had its turn at the keys
      owns: [],
      effectCount: ex.effects.length,
      hookCount: contributedHooks,
      markCount: ex.marks?.length ?? 0,
    });
  }

  // `owns` can only be known after the LAST card, because `lastWins` moves
  // ownership backwards in time. Recomputed rather than patched incrementally.
  const owners = new Map<number, string[]>();
  const keys: StackKeyTrace[] = [];
  for (const key of STACK_SCALAR_KEYS) {
    const held = keyTraces.get(key);
    if (held === undefined) continue;
    keys.push({ key, winner: held.winner, agreed: held.agreed, shadowed: held.shadowed });
    const list = owners.get(held.winner.cardIndex) ?? [];
    list.push(key);
    owners.set(held.winner.cardIndex, list);
  }

  const result: Record<string, unknown> = { effects };
  for (const k of keys) result[k.key] = k.winner.value;
  if (passive !== undefined) result["passive"] = passive;
  // 只在真的有標記時才寫這個鍵 —— 一張標記卡都沒有的堆疊必須跟從前**逐鍵相同**
  // （stack.test.ts 的 1-card byte-identical 宣稱就靠這個）。
  if (marks.length > 0) result["marks"] = marks;

  return {
    result: result as unknown as ExpandResult,
    trace: {
      onConflict,
      cards: cardTraces.map((c) => ({ ...c, owns: owners.get(c.index) ?? [] })),
      keys,
      effects: effectTraces,
      conflicts,
    },
  };
}

/** Human-readable collision report — one line per conflict, used by both sides. */
export function describeStackConflicts(trace: ExpandStackTrace): string {
  return trace.conflicts
    .map(
      (c) =>
        `${c.key}: 卡片 ${c.dropped.cardIndex + 1} (${c.dropped.templateId}) 的 ${JSON.stringify(c.dropped.value)} ` +
        `與卡片 ${c.kept.cardIndex + 1} (${c.kept.templateId}) 的 ${JSON.stringify(c.kept.value)} 衝突`,
    )
    .join("\n");
}

/**
 * The LOADER-side stack expansion: same merge, but a `reject`-policy collision
 * is fatal instead of merely reported. Content that reaches the sim has already
 * been through the editor, so an unresolved collision here is content nobody
 * looked at — failing loudly is the whole point of the default policy.
 */
export function expandStackOrThrow(
  cards: readonly TemplateStackCard[],
  onConflict: TemplateConflictPolicy = DEFAULT_TEMPLATE_CONFLICT,
): ExpandResult {
  const { result, trace } = expandStack(cards, onConflict);
  if (onConflict === "reject" && trace.conflicts.length > 0) {
    throw new ExpandError(
      `template stack has ${trace.conflicts.length} unresolved conflict(s) under onConflict="reject":\n${describeStackConflicts(trace)}`,
    );
  }
  return result;
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
  // ⚠️ 少了這一列，mark-stacks 展開出來的標記會在 merge 時被整包丟掉：
  // `expand()` 產出了它、`ExpandResult` 帶著它，而寫進技能文件的那一步不認得它
  // ——「做了但玩家拿不到」的失敗形態②，而且四個層面都會自洽地全綠。
  "marks",
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
/** 一個 `spawnModelFx` 節點（⛔ 只認**這一層**，巢狀的那些跟著它們的宿主走）。 */
function isSpawnModelFx(n: unknown): n is Record<string, unknown> {
  return n !== null && typeof n === "object" && (n as Record<string, unknown>)["kind"] === "spawnModelFx";
}

/** ⭐ 一個效果節點的 kind（認不出來 ⇒ `null`）。 */
function kindOf(n: unknown): string | null {
  if (n === null || typeof n !== "object") return null;
  const k = (n as Record<string, unknown>)["kind"];
  return typeof k === "string" ? k : null;
}

export function mergeExpansion(
  skeleton: Record<string, unknown>,
  ex: ExpandResult,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...skeleton };
  // ⭐⭐ GH#698 —— **文件自帶的 `spawnModelFx` 要活下來**。
  //
  // ⚠️ 在此之前 `effects` 是 `EXPANDED_KEYS` 的一員 ⇒ 先整格刪掉再貼上展開結果
  //    ⇒ 一份 `template:` 文件上手寫的 `spawnModelFx`**在註冊表裡逐字消失**，
  //    而 JSON 上看起來完全正確、Zod 收得下、卡片印得出來、遊戲裡不存在
  //    （第一·五守則最貴的那個形狀）。2026-08-25 量到兩個受害者：
  //    `godie-udea.ex`（65-002）與 `godie-udre.r`（11-04）。
  //
  // ⭐ 為什麼是**保留節點**而不是「替 `tpl-buff-self` 那族加一組 modelFx 參數」：
  //    行為模板（45 份）× 演出（locust 五族）是一個**外積** —— 逐族加參數等於把
  //    第零守則⑨的「N 個同型」搬進模板層。⇒ 兩者**正交**才對：行為來自
  //    `template.ref`，演出來自節點自己的 `preset:`（`content/modelFxPreset.ts`）。
  //
  // ⚠️ 三條性質（缺一條就會變成下一個「兩邊都對、組合是空的」）：
  //  ① **展開自己產出了 `spawnModelFx` 時 ⛔ 不保留** —— 那是 `modelFxFamily` 那五族，
  //     兩個節點會變成兩具模型（打架）。這種文件的正解是走模板參數。
  //  ② **展開沒有 `effects` 時 ⛔ 不保留** —— 純被動／純標記的模板不跑 `effects`，
  //     硬塞進去只是把「被洗掉」換成「留著但沒有人跑」（同一個謊，更難查）。
  //     ⇒ 讓 `w3xDummyModelWiring` 那條守衛紅並指名它，⛔ 不要靜默。
  //  ③ **冪等** —— ①保證重新 merge 一份已經 merge 過的文件不會疊出第二具：
  //     那時 `effects` 裡已經有一個 spawnModelFx，而展開仍然沒有 ⇒ 保留同一個。
  const authoredEffects = Array.isArray(out["effects"]) ? (out["effects"] as unknown[]) : [];
  // ⚠️ `castTimeSec` 是**推導**欄位，不是作者的行為選擇：它由
  //    `packages/shared/scripts/deriveCastTimes.ts` 從 `castTimeFormula` 蓋進每一份文件。
  //    而 `castTimeSec` 在模板裡是一格 `optional` 參數 —— 文件沒填時
  //    `has()` 回 false，展開結果就沒有它。
  // ⛔ 於是下面的「先全刪、只放回展開有產出的」會把文件層那一格**無聲抹掉**，
  //    而模板技能佔全 repo 一大半 ⇒ 它們一律變成瞬發。
  // ⚠️ 2026-08-13 實測 5 支（godie-zombiex.q/e、godie-umal.q、godie-ubal.e、
  //    godie-huth.q）：JSON 上有 0.2 秒，註冊表裡是 undefined，
  //    客戶端畫不出吟唱條、sim 也沒有前搖 —— 兩邊一致地錯，所以看不出來。
  // ⇒ 只有這一格保留：展開沒產出時，**文件自己的值贏**。
  const authoredCastTime = out["castTimeSec"];
  for (const k of EXPANDED_KEYS) delete out[k];
  const exRec = ex as unknown as Record<string, unknown>;
  for (const k of EXPANDED_KEYS) {
    if (exRec[k] !== undefined) out[k] = exRec[k];
  }
  if (out["castTimeSec"] === undefined && authoredCastTime !== undefined) {
    out["castTimeSec"] = authoredCastTime;
  }
  // ⭐⭐ **2026-09-02 —— 把 GH#698 的保留從「只有 `spawnModelFx`」推廣到「任何 kind」。**
  //
  // ── ⛔ 量到的（12 份文件同時有 `template` 與自己的 `effects`）──────────────
  // 9 份只帶 `spawnModelFx`（上面那條規則救得到），⭐ 而**另外 3 份帶的是行為**：
  //   · `godie-etyr.r`（14-04 聖夜降臨）`damageArea` —— 卡面逐字「召喚瞬間會造成
  //     周圍 {{dmg}} 傷害」，⛔ 而註冊表裡那一格**整個不在**
  //     ⇒ 玩家看到的是裸的 `{{dmg}}`，而且**真的沒有傷害**（第一·五守則）
  //   · `godie-nbbc.w` `blink` · `godie-udea.w` `dash`
  //
  // ⭐ 而這正是 owner 要的積木語意：「像 JASS 一樣可以呼叫設定 **來拼湊組合**」——
  //   ⛔ 一個「用了模板就不准再加任何東西」的展開器**表達不出**組合。
  //
  // ⚠️ 三條性質**逐字沿用** GH#698（它們本來就與 kind 無關）：
  //  ① 展開**自己產出同一個 kind** ⇒ ⛔ 不保留（兩個節點會打架；正解是走模板參數）
  //  ② 展開**沒有 `effects`** ⇒ ⛔ 不保留（純被動／純標記的模板不跑 effects，
  //     硬塞只是把「被洗掉」換成「留著但沒有人跑」——同一個謊，更難查）
  //  ③ **冪等** —— ①保證重新 merge 一份已經 merge 過的文件不會疊出第二份
  //
  // ⭐ 保留的節點**接在後面**：模板的行為先跑，作者的追加後跑
  //   （`godie-etyr.r` 的語意正是「召喚**瞬間**造成傷害」）。
  if (authoredEffects.length > 0 && Array.isArray(out["effects"])) {
    const expanded = out["effects"] as unknown[];
    const expandedKinds = new Set(expanded.map(kindOf).filter((k): k is string => k !== null));
    const keep = authoredEffects.filter((n) => {
      const k = kindOf(n);
      return k !== null && !expandedKinds.has(k);
    });
    if (keep.length > 0) out["effects"] = [...expanded, ...keep];
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
