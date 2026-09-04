/**
 * EVASION (迴避) — the defender's pre-damage miss roll.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * 108 innate (天生技) docs were recovered and the 6th ability slot renders
 * in-game, but 29 of the 48 `innateKind: "passive"` ones ship EMPTY modifier
 * blocks — they have zero combat effect. The single biggest reason, measured
 * rather than assumed, is that **the sim had no evasion stat at all**: the
 * dominant inert group is 迴避 passives — `12-00 感應意脈` (+20% 迴避),
 * `74-00 JENOVA` (15%), `92-00 憂鬱的眼神` (18%). There was nothing for a
 * content author to point a modifier at, so the docs were written honest-empty.
 *
 * This file is the MECHANISM half. It writes no content: `Stat.Evasion` is 0 on
 * every champion today and this module is a strict no-op at 0 (see THE ZERO
 * GUARANTEE below). A later content lane fills the 29 blocks with
 * `{ stat: "evasion", op: "flat", value: 0.20 }` and they become live.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MODEL, AND WHY
 *
 * DECISION 1 — BASIC ATTACKS ONLY. Not abilities. Two independent reasons:
 *
 *   (a) SOURCE FIDELITY. Every one of these passives is WC3 `Evasion`
 *       (`Aevd` / the hero `ACev` 迴避 column). In WC3 that ability dodges
 *       ATTACKS and only attacks — a spell has never been evadable — so
 *       extending it to abilities would not be porting the passive, it would be
 *       inventing a stronger one and calling it 感應意脈.
 *
 *   (b) IT WOULD CONTRADICT THE TELEGRAPH DESIGN. `abilities/abilityRecovery.ts`
 *       (DECISION 1, closing paragraph) points at docs/design/cast-telegraph.md
 *       §4.5(a): 211 targeted abilities lock their victim at cast, so they
 *       "can't be dodged today". That is stated as a STRUCTURAL problem with a
 *       named structural fix — `resolveRecheck: "lock" | "range"`, i.e. give the
 *       victim POSITIONAL agency by re-checking range at resolve. The whole
 *       thesis of that document is 「公平性的終點不是『一定躲得掉』，是『躲不躲得掉
 *       取決於你』」 — dodging must be something the player DID. A hidden dice
 *       roll on ability damage would paper over the same complaint with the
 *       exact opposite property: unreadable, un-earnable, and it would make the
 *       whole telegraph/startup investment pointless (why read a 1.19 s warning
 *       if the outcome is a coin flip?). So this lane deliberately does NOT
 *       extend evasion to abilities. Ability agency stays §4.5(a)'s job.
 *
 *   Consequence, stated plainly so nobody has to rediscover it: an evasion
 *   champion is tanky against autos and exactly as fragile as anyone else
 *   against spells. That is the WC3 behaviour and it is a real, legible
 *   counter-play axis rather than a flat damage sponge.
 *
 * DECISION 2 — ROLLED WHEN THE HIT WOULD LAND, BY THE DEFENDER'S STAT.
 *   · MELEE: at the damage point (`BasicAttackSystem.resolveAttack`).
 *   · RANGED: at PROJECTILE IMPACT (`ProjectileSystem`), not at launch — the
 *     arrow is dodged when it arrives, which is also the only moment the victim
 *     is known (the missile can hit a body that walked into it).
 *   Reading the stat at landing time (not at swing start) means an evasion buff
 *   applied mid-flight protects you, which is the intuitive reading and matches
 *   how every other defensive stat in this sim is sampled (armor is read in
 *   `mitigate`, at resolve).
 *
 * DECISION 3 — A DODGE IS A TOTAL MISS, NOT MITIGATION. No damage packet is
 *   queued at all, so — for free, by construction — there is no lifesteal, no
 *   `onBasicAttack` hook, no on-hit item proc, no hitstop/knockback, no
 *   scoreboard `basicAttackHits`, and no `damage` event. That is the WC3
 *   semantic ("miss"), and it is why the roll lives at the two attack-landing
 *   sites rather than inside `combatResolveSystem`: by the time a packet
 *   reaches the damage queue the on-hit hooks have already fired.
 *
 * DECISION 4 — THE SWING IS STILL SPENT. The attacker's cooldown was committed
 *   at swing start and is not refunded, and a dodged ranged missile is consumed.
 *   A dodge costs the attacker a full attack cycle — that IS the stat's value.
 *   No melee whiff-lunge is triggered: the swing connected with a body, the body
 *   just slipped it; the lunge is specifically the over-commit of hitting air.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM (non-negotiable)
 *
 * The roll is `world.rng.chance(p)` on the seeded world RNG — the same stream
 * and the same call the crit roll has always used. No `Math.random`, no
 * `Date.now`, no iteration-order dependence: both call sites are inside systems
 * that already iterate deterministic component maps, and the roll happens at a
 * fixed point in each. Same seed ⇒ identical draw sequence ⇒ identical digest.
 * (`world.rng.state` is folded into `SimWorld.digest()`, so even a spurious
 * EXTRA draw on one replica surfaces immediately as a mismatch — which is what
 * the zero guarantee below is really protecting.)
 *
 * THE ZERO GUARANTEE: `p <= 0` returns false BEFORE touching the rng, so a unit
 * with no evasion consumes no random draws and perturbs nothing.
 *
 * ⚠️ 2026-07-30 CORRECTION (lane P5). The sentence that used to stand here —
 * "Evasion is 0 for every champion in the catalogue today" — WAS TRUE WHEN
 * WRITTEN AND IS NOW FALSE. The content lane it predicted has since landed:
 * `Stat.Evasion` is authored in 13 content files today — 3 champion docs
 * (`godie-e00l` / `godie-e002` 亞瑟王-Saber 0.07/0.14/0.21/0.28 by rank,
 * `godie-u00j` 賽菲洛斯), 8 ability docs (`godie-h02u.passive` 0.18, …) and the
 * `phantom-step` augment. The zero guarantee itself is unchanged and still
 * holds per-unit; only the "nobody has any" claim expired. Left in place rather
 * than deleted because the number of files is the thing a future reader will
 * want to re-check.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION 5 — THE TWO COVERAGE QUESTIONS ARE CONTENT FIELDS, NOT CONSTANTS.
 *
 * DECISION 1 above says "basic attacks only" and argues it well, but it argued
 * it as a HARD-CODED branch. Per the project's first rule (決策點要可調), the two
 * questions it settles are now `ModifierSource.evasionScope` fields:
 *
 *   · `abilities`  — may this evasion dodge ABILITY damage?      default false
 *   · `trueDamage` — may it dodge `type: "true"` packets?        default false
 *
 * Both default to false, so DECISION 1's model is still exactly what ships and
 * every currently authored evasion source behaves bit-identically. The defaults
 * ARE the argument in DECISION 1; the field is there so the owner can overrule
 * it per-source without a redeploy.
 *
 * WHERE THE ABILITY ROLL HAPPENS, AND WHY IT IS WEAKER. A basic attack rolls at
 * its landing site BEFORE any on-hit hook (DECISION 3), so a dodged auto is
 * invisible to the whole proc chain. An ability's only available seam is
 * `combatResolveSystem` — by then the cast already spent mana, played its VFX
 * and fired `onAbilityHit`. So a dodged ability reads as "the spell reached you
 * and fizzled", not "it never targeted you". That asymmetry is inherent to
 * where the two damage kinds become interceptable; it is documented rather than
 * papered over, and it is the reason `abilities` defaults OFF.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import type { ModifierSource, ModifierSourceKind } from "../stats/modifiers";
import { DEFAULT_STAT_CAPS, effectiveCap } from "../statCaps";

/* ═══════════════════════════════════════════════════════════════════════════
 * ⭐⭐ `evade` 的酬載型別 —— **住在發射站旁邊**（Codex 阻塞清單 P0-4）
 *
 * ⛔⛔ Codex 逐字：「它沒有指出是哪個技能、buff、道具或 grant 使本次迴避成功⋯
 * ⛔ 不得從聚合後的 `Stat.Evasion` 猜第一個、最高或任意來源。」
 *
 * ⛔ 為什麼要有這個介面：`SimWorld.emit(type: string, data: Record<string, unknown>)`
 * 與 `EventMessage.data` **都沒有型別** ⇒ 消費端想讀任何欄位就非 `as` 不可，
 * ⭐ 而每一個 `as` 都是一個**靜默的洞**（CLAUDE.md 失敗形態⑧）。
 * ⇒ 兩邊 import 同一個型別 ⇒ 欄位改名或消失是 **tsc 的紅**。
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * **哪一條通道**讓這一下沒打中 —— 三條，而它們的**主詞不同**：
 *
 * | channel | 誰的能力 | 抽的是 |
 * |---|---|---|
 * | `"basic"`   | **防禦者**的 `Stat.Evasion` | `rollEvade`（普攻落點） |
 * | `"ability"` | **防禦者**帶 `evasionScope.abilities` 的來源 | `rollEvadeAbility`（技能結算） |
 * | `"fumble"`  | ⭐ **攻擊者**身上的詛咒（`StatusEffect.missChance`） | `rollFumble` |
 *
 * ⚠️ `"fumble"` 的 `by` 指的是**攻擊者**身上的東西，⛔ 不是閃避者的 ——
 * 消費端要播「誰的」演出時必須先讀這一格，⛔ 不可以假設 `by` 屬於 `target`。
 */
export type EvadeChannel = "basic" | "ability" | "fumble";

/**
 * ⭐ 迴避來源的**種類**。`ModifierSourceKind` 的六種（champion／item／augment／
 * passive／buff／aura）＋ `"status"` —— 因為 `fumble` 那一條的來源是一則
 * `StatusEffect`，⛔ 它根本不是一份 `ModifierSource`。
 */
export type EvadeSourceKind = ModifierSourceKind | "status";

/**
 * ⭐⭐ **真正抽中的那一個來源**的穩定 identity。
 *
 * `id` 就是引擎裡那個東西自己的鍵，⛔ 不是一個為了這則事件新編的號碼：
 * · `ModifierSource.id` —— `"item:ember-rod#2"` / `"aug:phantom-step"` /
 *   `"passive:godie-e00l"` / `"buff:evasion:ability:godie-h02k.r"`
 * · `StatusEffect.sourceId`（`kind: "status"`，另帶 `statusId`）
 *
 * ⇒ ⭐ 客戶端／編輯器拿它去查專屬演出時，查的是**內容自己的鍵**，
 * ⛔ 不必再維護一張對照表（那張表就是第〇·四守則說的第二個住處）。
 */
export interface EvadeSourceRef {
  readonly id: string;
  readonly kind: EvadeSourceKind;
  /** `kind: "status"` 專屬 —— 那一則詛咒的 `statusId`。其餘種類缺席。 */
  readonly statusId?: string;
}

/**
 * ⭐ `world.emit("evade", …)` 的完整酬載。
 *
 * ⚠️ `by` 可以是 `null`，而那**不是缺陷**：迴避可能整份來自英雄的 `base.evasion`
 * （出貨的 `godie-u00j` 就是 `base.evasion: 0.15`，一份 `ModifierSource` 都沒有）。
 * ⇒ ⭐ `null` 的意思是「**沒有任何一份 grant 擁有這一次**」，
 *   消費端該做的是**維持既有的通用 MISS／迴避回饋**，⛔ 不是隨便挑一個來源。
 */
export interface EvadeEvent {
  /** 攻擊者。 */
  readonly source: number;
  /** 閃避者（`fumble` 時＝被打的那一位，他其實什麼都沒做）。 */
  readonly target: number;
  readonly x: number;
  readonly z: number;
  readonly channel: EvadeChannel;
  readonly by: EvadeSourceRef | null;
  /** 這一次**實際擲的**機率（已含 G13 `unavoidable` 折扣與上限夾取）。 */
  readonly chance: number;
}

/** 一份 source 在**這一 tick** 還活著嗎（與 `computeStat` 逐字同一條）。 */
function sourceActive(src: ModifierSource, tick: number): boolean {
  return !(src.expiresAtTick !== undefined && src.expiresAtTick <= tick);
}

/**
 * 這一份來源對 `Stat.Evasion` 的 **flat 貢獻**（含 `stacks`）。
 *
 * ⚠️ 三條過濾**逐字抄** `statPipeline.computeStat`，⛔ 不是「差不多的規則」：
 * 過期跳過 · 帶 `scopeSlot`/`scopeAbilityId` 的跳過（那是 G9，它根本不在
 * `sc.final` 裡）· `value × (stacks ?? 1)`。兩邊分岔的那一天，權重就會與
 * 玩家真正拿到的迴避率不一致 —— 而那是一個**只在演出上看得出來**的錯。
 *
 * ⛔ 只數 `Flat`：`pctAdd`／`pctMult` 是**放大器**，它們自己夠不出一次迴避
 * （一個只給 +50% 的來源，在沒有任何 flat 的身上給的是 0）。
 */
function evasionFlatOf(src: ModifierSource, stacks: number): number {
  let w = 0;
  for (const m of src.modifiers ?? []) {
    if (m.stat !== Stat.Evasion) continue;
    if (m.op !== ModOp.Flat) continue;
    if (m.scopeSlot !== undefined || m.scopeAbilityId !== undefined) continue;
    w += m.value * stacks;
  }
  return w;
}

/**
 * ⭐⭐ **普攻通道：把那**一次**擲出來的數字，分派給真正抽中的那一份來源。**
 *
 * ⛔⛔ 為什麼不能「取最高」或「取第一個」：Codex 逐字禁止，而且它是錯的 ——
 * 兩份 20% 的來源疊起來是 `Σflat = 0.4`，⭐ 而**兩份各自負責其中一半**。
 * 挑最高／挑第一個會讓其中一份**永遠不會演出**，即使它貢獻了一半的迴避。
 *
 * ⭐ 這裡做的是**分層歸因**：那一次 `rng.next()` 落在 `[0, p)` 裡，把這個區間
 * 按各來源的 flat 權重切段，看它落在誰的段裡。
 * ⇒ 每一份來源拿到的邊際機率**恰好等於它自己的貢獻**，
 * ⛔ 而且**一次抽籤都沒有多**（見 `rollEvade` 的註解）。
 *
 * ⚠️ `roll / p` 是**尺度無關**的，所以 G13 的 `unavoidable` 折扣與 `sc.final`
 * 的上限夾取都不會擾動歸因 —— 它們等比例地縮小每一段。
 *
 * ⚠️ `sc.sources` 是**陣列**（插入序，每個 replica 相同）⇒ ⛔ 不需要排序正規化。
 *
 * @returns 抽中的來源；`null` ＝ 這一份迴避沒有任何 `ModifierSource` 擁有它
 *          （純 `base.evasion`，或只有百分比放大器）。
 */
function basicEvadeSource(
  world: SimWorld,
  target: EntityId,
  roll: number,
  p: number,
): EvadeSourceRef | null {
  const sc = world.stats.get(target);
  if (!sc) return null;
  let total = 0;
  for (const src of sc.sources) {
    if (!sourceActive(src, world.tick)) continue;
    const w = evasionFlatOf(src, src.stacks ?? 1);
    if (w > 0) total += w;
  }
  if (!(total > 0)) return null; // 純 base.evasion ⇒ 沒有 grant 擁有這一次
  // `roll < p` 已由呼叫端保證 ⇒ `cut ∈ [0, total)`。
  const cut = (roll / p) * total;
  let cum = 0;
  for (const src of sc.sources) {
    if (!sourceActive(src, world.tick)) continue;
    const w = evasionFlatOf(src, src.stacks ?? 1);
    if (!(w > 0)) continue;
    cum += w;
    if (cut < cum) return { id: src.id, kind: src.kind };
  }
  // 浮點尾數讓 `cut` 剛好等於 `total` 時的收尾（機率 ~0，但要有出口）。
  for (let i = sc.sources.length - 1; i >= 0; i--) {
    const src = sc.sources[i]!;
    if (!sourceActive(src, world.tick)) continue;
    if (evasionFlatOf(src, src.stacks ?? 1) > 0) return { id: src.id, kind: src.kind };
  }
  return null;
}

/**
 * The ceiling BOTH dodge channels answer to, for one unit.
 *
 * ⚠️ 2026-07-30. This function exists because the ability channel used to have
 * NO ceiling and the three places that claimed otherwise were all wrong. Measured
 * (not reasoned): `evasion { chance: 1, dodgesAbilities: true }` produced
 * `abilityEvasionOf === 1`, and 2,000 × 50 magic packets in one stepped world
 * cost the defender **0 hp**. That is total invulnerability, which is P3's
 * `invulnerable` job — this primitive must not be a second way to mint it.
 *
 * Why THIS number and not a fresh constant: `finalizeStat` clamps
 * `sc.final[Stat.Evasion]` with exactly `effectiveCap(world.statCaps, …)`, so
 * reusing it is what makes the two channels answer to ONE ceiling instead of two
 * that can drift apart. It is also already the editor's knob — `Evasion` is in
 * `CAPPABLE_STATS`, so `config.stat-caps@1` can raise or lower it from the admin
 * page without a redeploy (第一守則). Shipping default: 0.8, from
 * `STAT_CLAMPS[Stat.Evasion]`.
 *
 * `raised` is the unit's own `ModOp.CapRaise` max for Evasion — the same input
 * `recomputeStats` folds — so an unlock that legitimately lifts the auto-dodge
 * ceiling lifts the spell-dodge ceiling by the same amount, and neither channel
 * can be unlocked behind the other's back.
 */
function evasionCeiling(world: SimWorld, raised: number): number {
  return effectiveCap(world.statCaps ?? DEFAULT_STAT_CAPS, Stat.Evasion, raised);
}

/**
 * The defender's effective dodge chance, 0..1. Reads the RESOLVED stat, so the
 * ceiling has already been applied by `finalizeStat` — MEASURED, not assumed:
 * `evasion { chance: 1 }` reads back 0.8 here and dodges 81.5% of 4,000 rolls.
 * (`effects/evasion.test.ts` 「THE CEILING BINDS ON BOTH CHANNELS」 keeps it so.)
 * The `> 1` fold below is unreachable while `sc.final` is fresh; it is kept only
 * for a caller holding a StatsComp not recomputed since a source attached.
 *
 * ⚠️ This is the channel the [0, 0.8] clamp ALWAYS bound. `abilityEvasionOf`
 * below is the one that did not, and that is a repaired bug, not a design.
 *
 * A target with no `StatsComp` (guardians/structures, flowers, projectiles)
 * has no evasion by construction — they cannot dodge.
 */
export function evasionOf(world: SimWorld, target: EntityId): number {
  const sc = world.stats.get(target);
  if (!sc) return 0;
  const v = sc.final[Stat.Evasion];
  if (!(v > 0)) return 0; // also rejects NaN
  return v > 1 ? 1 : v;
}

/**
 * Roll the defender's evasion for ONE landing basic attack.
 *
 * Returns true when the attack MISSES — the caller must then queue no damage,
 * fire no on-hit hooks and emit no hit event (see DECISION 3).
 *
 * Emits `evade { source, target, x, z }` on a successful dodge so the client can
 * draw the 「MISS」 floating text / play the slip cue. Events are presentation
 * only and are not part of `SimWorld.digest()`.
 *
 * BASIC ATTACKS ONLY — do not call this from an ability/DoT/proc path
 * (DECISION 1). Consumes exactly one rng draw when `evasion > 0`, and none at 0.
 */
/**
 * ⭐ G13（GH#354）—— **攻擊方**的「無法被迴避」折扣，0..1。
 *
 * #51 神槍・金剛徹「滿層後普攻無法被迴避，仍可被格擋、護盾抵消」。
 *
 * ⛔ 它**不是第三種迴避率**（那會踩到本檔 DECISION 2 的整段推導：`evasionOf` 與
 * `missChanceOf` 已經是方向相反的兩個數，第三個同族的數字只會讓它們更難分）。
 * 它是**對方那一格的折扣**，套在兩支 roll 函式裡、`p` 算完之後：
 *
 *     p_effective = p_evade × (1 - unavoidable)
 *
 * ⭐ 這個形狀讓「絕對命中」在**重播位元層**上等於「對方本來就沒有迴避」——
 * `unavoidable = 1` 時 `p` 變 0，於是走的是既有的 **ZERO GUARANTEE**
 *（不抽 rng、不動狀態）。換句話說它不會像一個「命中後再抽一次」的實作那樣
 * 多消耗一次亂數而讓每一場既有錄影 desync。
 *
 * ⚠️ 讀的是**攻擊者**的 `sc.final`。攻擊者沒有 StatsComp（殭屍、守衛塔）→ 0。
 */
function unavoidableOf(world: SimWorld, source: EntityId): number {
  const v = world.stats.get(source)?.final[Stat.UnavoidablePct];
  if (v === undefined || v <= 0) return 0;
  return v >= 1 ? 1 : v;
}

export function rollEvade(world: SimWorld, source: EntityId, target: EntityId): boolean {
  // ⭐ G13 —— 折扣在 ZERO GUARANTEE **之前**乘進去，這樣「完全無法被迴避」
  // 才會走那條「不抽 rng」的路（見 `unavoidableOf` 檔頭）。
  const p = evasionOf(world, target) * (1 - unavoidableOf(world, source));
  if (p <= 0) return false; // THE ZERO GUARANTEE: no rng draw, no state change
  /**
   * ⭐⭐ **這一行與 `world.rng.chance(p)` 逐位元等價** —— `Rng.chance` 的
   * 檔案裡逐字是 `return this.next() < p;`（`sim/math/rng.ts:32`）。
   *
   * ⛔ 抽籤的**次數與位置一個都沒有變**：同一個 `next()`、同一個位置、同一個
   * 比較（`!(roll < p)` 是 `!chance(p)` 的逐位元否定，連 `p` 為 NaN 時的
   * 行為都相同）。⇒ ⭐ 每一場既有錄影的 digest 不動。
   *
   * ⭐ 換來的是**那個擲出來的數字**，而它是「哪一份來源抽中了」唯一誠實的
   * 答案 —— ⛔ 不是「取最高」也不是「取第一個」（Codex 逐字禁止）。
   * 守衛：`evadeProvenanceWireContract.test.ts` ①「⛔ 一次抽籤都沒有多」。
   */
  const roll = world.rng.next();
  if (!(roll < p)) return false;
  emitEvade(world, source, target, "basic", p, basicEvadeSource(world, target, roll, p));
  return true;
}

/**
 * 失手率 (WC3 `Acrs` 詛咒) — the ATTACKER's own fumble chance, 0..1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SECOND FUNCTION AND NOT A TERM INSIDE `evasionOf`
 *
 * The two numbers point in OPPOSITE directions and it is not a stylistic
 * distinction — folding them would invert a mechanic:
 *
 *   evasionOf(defender)   「瞄我的攻擊會落空」 → makes the carrier HARDER to kill
 *   missChanceOf(attacker)「我打出去的攻擊會落空」→ makes the carrier WORSE at killing
 *
 * 貞子's 66-00 恐懼 curses whoever hit her. If that had been written as
 * "give the attacker evasion" the passive would have handed her aggressor a
 * defensive buff — a bug that reads as balanced-looking numbers in the doc and
 * as nonsense in the match. Hence a separate read, a separate roll, and a
 * separate call site argument (`attacker`, never `target`).
 *
 * MAX, NOT SUM, over the active statuses. WC3 miss sources do not stack
 * (`Acrs`, `AUdr` Drunken Haze, `Absk` — the strongest applies), and summing
 * would let two 4-second curses reach a permanent 66 % whiff on a chain of
 * attackers. Also clamped to [0,1] here even though the Zod field already
 * bounds it: a doc can reach the sim through the admin overlay path, and this
 * is the last line before an rng draw.
 *
 * Statuses whose `expiresAtTick` has already passed are skipped rather than
 * trusted to `statusExpirySystem` — the two run at different points in the tick
 * and a one-tick-stale curse must not eat a swing.
 */
export function missChanceOf(world: SimWorld, attacker: EntityId): number {
  return missChancePick(world, attacker).chance;
}

/**
 * {@link missChanceOf} 的來源版 —— **同一次掃描**回傳機率與那一則詛咒的 identity。
 *
 * ⭐⭐ 這裡的「取最高」**不是猜**，而 Codex 禁的那一種是猜：他禁的是
 * 「從**聚合後的** `Stat.Evasion` 挑一個」（那個聚合把來源資訊丟掉了，
 * 挑哪一個都只是編的）。⛔ 這一條路**根本沒有聚合** —— WC3 的 miss 來源
 * 不疊加、**最強的那一則生效**（見上面的檔頭），⇒ 最高的那一則就是
 * **真正生效**的那一則，⛔ 不是一個代表。
 *
 * ⚠️ 平手時取**先出現**的那一則。`st.effects` 是陣列（插入序、每個 replica
 * 相同）⇒ 決定性成立，且與 {@link missChanceOf} 原本的 `v > best` 逐字同義。
 */
function missChancePick(
  world: SimWorld,
  attacker: EntityId,
): { chance: number; by: EvadeSourceRef | null } {
  const st = world.status.get(attacker);
  if (!st) return { chance: 0, by: null };
  let best = 0;
  let by: EvadeSourceRef | null = null;
  for (const s of st.effects) {
    if (s.expiresAtTick <= world.tick) continue;
    const v = s.missChance;
    if (v !== undefined && v > best) {
      best = v;
      by = { id: s.sourceId, kind: "status", statusId: s.statusId };
    }
  }
  if (!(best > 0)) return { chance: 0, by: null }; // also rejects NaN
  return { chance: best > 1 ? 1 : best, by };
}

/**
 * Roll the ATTACKER's fumble for ONE landing basic attack.
 *
 * Returns true when the swing WHIFFS — the caller must then queue no damage,
 * fire no on-hit hook and emit no hit event, exactly like {@link rollEvade}.
 *
 * ORDER AT THE CALL SITES: fumble is rolled BEFORE evasion. A cursed attacker
 * swinging at a dodgy defender should not consume the defender's evasion draw —
 * the blow never arrived to be dodged. Rolling the other way round would make
 * the seed stream depend on a status the defender cannot see, and would also
 * (harmlessly but confusingly) credit an `evade` cue to a swing that fumbled.
 *
 * THE ZERO GUARANTEE holds identically: no status ⇒ no draw, no state change,
 * so every existing replay is bit-identical.
 */
export function rollFumble(world: SimWorld, attacker: EntityId, target: EntityId): boolean {
  const { chance: p, by } = missChancePick(world, attacker);
  if (p <= 0) return false; // THE ZERO GUARANTEE: no rng draw, no state change
  if (!world.rng.chance(p)) return false;
  // Reuses the `evade` cue rather than minting a second one: what the player
  // needs to see is 「這一下沒有打中」 over the two bodies involved, and the
  // client already draws exactly that for `evade`. Documented here because the
  // event's NAME now covers two different causes.
  // ⭐ P0-4 —— 而**哪一個原因**現在寫在酬載裡（`channel: "fumble"`），
  //   ⛔ 不再是消費端猜不到的東西。`by` 是**攻擊者**身上那則詛咒。
  emitEvade(world, attacker, target, "fumble", p, by);
  return true;
}

/**
 * Shared `evade` presentation cue. Not part of `SimWorld.digest()`.
 *
 * ⭐ 型別化的送出 —— `satisfies` 讓欄位漏掉或打錯字變成 **tsc 的紅**
 * （形狀抄 `effects/shield.ts` 的 `ShieldGainedEvent`）。
 */
function emitEvade(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  channel: EvadeChannel,
  chance: number,
  by: EvadeSourceRef | null,
): void {
  const tt = world.transform.get(target);
  const payload = {
    source,
    target,
    x: tt?.pos.x ?? 0,
    z: tt?.pos.z ?? 0,
    channel,
    by,
    chance,
  } satisfies EvadeEvent;
  world.emit("evade", payload);
}

/**
 * The target's ABILITY-dodge chance, 0..1 — the DECISION 5 opt-in channel.
 *
 * NOT the aggregated `Stat.Evasion`. A capability that arrives on one buff must
 * not silently promote every OTHER evasion source the unit happens to carry:
 * if it read the aggregate, a 5% "dodges spells" buff would hand Saber's 28%
 * auto-dodge to the spell channel too. So the chance is the **highest `chance`
 * among the active sources that actually carry `evasionScope.abilities`**.
 *
 * Max-not-sum is also the WC3 rule for evasion abilities (they famously do not
 * stack — only the strongest applies), so two spell-dodge buffs cannot ADD
 * their way to immunity. `trueDamage` is asked of the SAME winning source set: a
 * packet of `type: "true"` is dodgeable only while a scoped source opts into it.
 *
 * ⚠️ MAX-NOT-SUM IS NOT A CEILING, AND FOR ONE VERSION THIS FUNCTION HAD NONE.
 * It reads a source's RAW authored `chance`, which never went through
 * `finalizeStat` — so a single `{ chance: 1, dodgesAbilities: true }` returned
 * 1.0 and made the target flatly immune to every ability packet (measured: 0 hp
 * lost out of 2,000 × 50 magic). The `[0, 0.8]` clamp that three comments
 * claimed "still applies downstream" only ever bound `evasionOf`, because that
 * one reads `sc.final`. `evasionCeiling` is the repair: BOTH channels now answer
 * to the same editor-adjustable number (`config.stat-caps@1`, default 0.8), so
 * total immunity stays P3's `invulnerable` unless the owner deliberately raises
 * the cap on the admin page.
 *
 * Sorted-iteration note: this walks `sc.sources`, an ARRAY (insertion-ordered
 * and identical on every replica), not a Map — so no ordering normalisation is
 * needed and `max` is order-independent anyway.
 */
export function abilityEvasionOf(world: SimWorld, target: EntityId, isTrue: boolean): number {
  return abilityEvasionPick(world, target, isTrue).chance;
}

/**
 * {@link abilityEvasionOf} 的來源版 —— **同一次掃描**回傳機率與那一份來源。
 *
 * ⭐ 這裡的「取最高」與 {@link missChancePick} 同一個理由，⛔ 不是猜：
 * 這條通道**本來就不聚合**（檔頭逐字：「⛔ NOT the aggregated `Stat.Evasion`」），
 * 而 WC3 的迴避不疊加、最強的生效 ⇒ ⭐ 最高的那一份**就是生效的那一份**。
 * ⚠️ 上限（`evasionCeiling`）夾的是**數字**，⛔ 夾不掉 identity —— 被夾住的
 * 那一份仍然是抽中的那一份。
 */
function abilityEvasionPick(
  world: SimWorld,
  target: EntityId,
  isTrue: boolean,
): { chance: number; by: EvadeSourceRef | null } {
  const sc = world.stats.get(target);
  if (!sc) return { chance: 0, by: null };
  // CHEAP GATE FIRST: a unit with no evasion at all never pays for the scan.
  // Any scoped source also contributes its `chance` to Stat.Evasion, so a zero
  // aggregate provably means zero scoped sources.
  if (!(sc.final[Stat.Evasion] > 0)) return { chance: 0, by: null };
  let best = 0;
  let by: EvadeSourceRef | null = null;
  // Same `ModOp.CapRaise` fold `recomputeStats` does — collected in the pass we
  // already make, so the ceiling below is this unit's real ceiling and not the
  // table's default. Unscoped sources count here on purpose: a cap unlock is a
  // property of the UNIT, not of one buff.
  let maxCapRaise = 0;
  for (const src of sc.sources) {
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    for (const m of src.modifiers ?? []) {
      if (m.stat !== Stat.Evasion) continue;
      if (m.op === ModOp.CapRaise && m.value > maxCapRaise) maxCapRaise = m.value;
    }
    const scope = src.evasionScope;
    if (!scope?.abilities) continue;
    if (isTrue && !scope.trueDamage) continue;
    const stat = src.modifiers?.find((m) => m.stat === Stat.Evasion && m.op === ModOp.Flat);
    const v = stat ? stat.value : 0;
    if (v > best) best = v;
  }
  if (!(best > 0)) return 0; // also rejects NaN
  // THE CEILING. Without this line `chance: 1` is invulnerability — see above.
  const cap = evasionCeiling(world, maxCapRaise);
  return best > cap ? cap : best;
}

/**
 * Roll the target's evasion for ONE landing ABILITY damage packet.
 *
 * Returns true when the packet should be DROPPED entirely (no hp loss, no
 * shield spend, no impact cosmetics). Strictly opt-in: with no
 * `evasionScope.abilities` source on the target this returns false having
 * consumed ZERO rng draws, which is what keeps every existing replay and digest
 * bit-identical (no content authors the flag today).
 *
 * Never call this for `origin === "basic"` — those already rolled at their own
 * landing site and a second roll would dodge one swing twice.
 */
export function rollEvadeAbility(
  world: SimWorld,
  source: EntityId,
  target: EntityId,
  isTrue: boolean,
): boolean {
  // ⭐ G13 —— 技能通道走**同一個**折扣，⛔ 不是第二套 scope 詞彙。
  const p = abilityEvasionOf(world, target, isTrue) * (1 - unavoidableOf(world, source));
  if (p <= 0) return false; // THE ZERO GUARANTEE
  if (!world.rng.chance(p)) return false;
  emitEvade(world, source, target);
  return true;
}
