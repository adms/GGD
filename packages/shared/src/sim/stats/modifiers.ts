/**
 * ModifierSource — THE unifier. Champion passives, items, augments, and
 * temporary buffs all reduce to this one shape: stat modifiers + event hooks +
 * granted abilities. `attachSource`/`detachSource` are the only equip/expire
 * entry points, so no content type ever needs bespoke wiring.
 */
import type { Stat } from "./statTypes";
import type { EffectDef } from "../effects/effect";
import type { AbilityId } from "../../ids";
import type { CastableSlot } from "../intents";
import type { AuraDef, AuraOrigin } from "../aura/aura";
import type { VisionGrant } from "../stealth";
import type { ClassRequirement } from "../content/requirement";
import type { EffectCondition } from "../content/condition";

export enum ModOp {
  Flat = "flat",
  PercentAdd = "pctAdd",
  PercentMult = "pctMult",
  Override = "override",
  /**
   * 解鎖上限 (GH#286). `value` 是「把這條屬性的上限**抬到多少**」—— 不是加成、
   * 不是倍率、不乘 `stacks`。多個來源取 **max**(5 和 7 給的是 7,不是 12),
   * 而且抬不過 `sim/statCaps.ts` 的 `unlocked` 硬上限(攻速 10.0)。
   *
   * owner:「一般上限是 4.0,搭配特殊條件如技能、道具...等效果,可以解鎖最多
   * 到 10.0」. 它是一個 op 而不是新的 effect kind,正是因為 `applyBuff` /
   * 道具 / 三選一 / 靈氣 全部已經吃 `StatModifier[]`,而 `zModOp` 是整份
   * enum —— 加在這裡就等於同時開放給每一種內容,content schema 不用動。
   *
   * ⚠️ 一個 `CapRaise` 自己**不會給任何數值**。它只是把天花板搬高;要真的打到
   * 新的上限,還是得有 Flat / PercentAdd 把值推上去。
   */
  CapRaise = "capRaise",
  /**
   * 衍生屬性 —— 「把 A 的 X% 加到 B」(78-00 銅皮鐵骨:「防禦力額外增加自身攻擊力
   * 的 50%」)。`stat` 是**目的地**,{@link StatModifier.from} 是**來源**,
   * `value` 是比例(0.5 = 50%)。
   *
   * ⚠️ 這是這一份 enum 裡**唯一**需要第二條屬性的 op,所以 `from` 是選用欄位而
   * 不是必填 —— 但 `statPipeline` 對「`percentOf` 沒帶 `from`」的處理是**當作
   * 沒有這一條**(而不是加 0 或丟例外),schema 那一層則直接拒收,見
   * `content/schema/common.ts::zStatModifier`。
   *
   * ── 為什麼它必須是一個 op,而不是內容自己算好一個數字 ──────────────────
   * 「攻擊力的 50%」在一場比賽裡**每一 tick 都在變**:買一把劍、吃一張三選一、
   * 升一級、對面上一個減攻 debuff。把它寫成 `Flat 11`(= 22 的一半)的那一刻,
   * 它就變成一個永遠停在開場的數字,而面板還是會理直氣壯地顯示它 —— 正是
   * CLAUDE.md 失敗形態 ④(斷言/數字跟缺陷無關)。
   *
   * ── 求值順序,以及為什麼它不會連鎖 ─────────────────────────────────────
   * `recomputeStats` 跑**兩趟**:第一趟完全忽略 `PercentOf`,第二趟只重算帶有
   * `PercentOf` 的那幾條屬性,而且讀的是**第一趟**的來源值。所以
   * 「armor ← 50% ad」與「ad ← 50% armor」同時存在時不會互相追著跑,也不會有
   * 順序相依 —— 兩者都讀同一份 pass-1 快照。代價寫在明處:一條 `PercentOf`
   * **讀不到另一條 `PercentOf` 的產出**。這是刻意的,收斂性比表達力重要。
   *
   * ⚠️ 乘 `stacks`(和 `Flat` / `PercentAdd` 一樣):三層同樣的衍生就是三倍。
   */
  PercentOf = "percentOf",
}

export interface StatModifier {
  stat: Stat;
  op: ModOp;
  value: number;
  /**
   * `ModOp.PercentOf` 專用:**來源**屬性。其餘 op 一律忽略它。
   * 見 {@link ModOp.PercentOf}。
   */
  from?: Stat;
}

/** Game events hooks can react to. */
export type HookEvent =
  | "onAbilityCast"
  | "onAbilityHit"
  | "onBasicAttack"
  | "onDamageDealt"
  | "onDamageTaken"
  | "onKill"
  | "onLevelUp"
  /**
   * 週期 —— 每一 tick 對每一個活著、有 `StatsComp` 的單位發射一次
   * (`systems/IntervalHookSystem.ts`)。**節奏由 `internalCooldown` 表達**,
   * 不是由這個事件表達:`internalCooldown: 10` 就是「每 10 秒」,而那個欄位
   * 本來就存在、本來就在編輯器上、本來就吃 `combatEnv.itemCooldown`(道具來源)。
   *
   * 它補的是一個真的空洞:在它之前,`HookEvent` 的七個成員**全部**要有人動手
   * (攻擊/施法/受傷/擊殺/升級),所以 43-00 觀音大士「每 10 秒生成一個護盾」
   * 這種 WC3 最常見的一族只能被寫成「被打的時候才給」—— 那是另一支技能。
   *
   * ⚠️ 沒有 `internalCooldown` = **每一 tick 都發**(30 次/秒)。那是合法的
   * (03-00 相轉移裝甲的常駐魔免就要這樣),但寫的時候要知道自己在寫什麼:
   * 帶 `chance` 或 `condition` 的話,rng 會**每一 tick**被抽。
   */
  | "onInterval"
  /**
   * 被暈眩的那一刻 (勇者小呆 08-00 龍紋記憶:「被暈眩時，覺醒龍之力」).
   *
   * ⚠️ 這是這一份 enum 裡**唯一**「別人對我做了什麼」的事件 —— 其餘每一個都是
   * 持有者自己動手 (攻擊/施法/擊殺/升級) 或時間到了。這個不對稱正是它沒辦法用
   * 現有成員表達的原因:最接近的 `onDamageTaken` 錯兩次 ——
   * 暈眩不一定帶傷害 (07-04 靈壓震撼、每一支位移控場都是),而傷害**一直在來**,
   * 所以「被打就 ×2 三圍」會讓小呆整場常駐覺醒。封閉 enum 加成員要付一次代價;
   * 用內容硬湊則是往後每一個讀者都要付。
   *
   * 由 `systems/CcHookSystem.ts` 從 `effects/applyStatus.ts` 發的 `stunApplied`
   * 事件轉成 hook,而且**只在暈眩真的掛上去的時候** —— 續期不重觸發,否則連續
   * 暈眩會每一 tick 重新翻倍。hook 的 `target` 是「下暈眩的那個人」,所以自我
   * 增益的 payload 要寫 `target: "self"`。
   *
   * **刻意窄化,而且這是一個值得寫出來的決策**:纏繞/減速/擊退**不**觸發它。
   * owner 說的是「被暈眩」,而一個會讓小呆覺醒的減速等於把全遊戲的減速都變成
   * 送禮。「哪些控場算」是候選欄位,不是定案 —— 見 openQuestions。
   */
  | "onStunned";

export interface HookDef {
  on: HookEvent;
  /** optional condition: restrict to a specific ability slot (incl. "PASSIVE") */
  abilitySlot?: CastableSlot;
  /** effects run with the hook owner as caster and the event target as target */
  effects: EffectDef[];
  /**
   * Who the hook's effects RESOLVE against. Default "event" = the entity the
   * event was about (the unit you hit / killed / were hit by). "self" points
   * them back at the hook's owner, which is the only way to express WC3's very
   * common "on kill, YOU gain X" passives (呂布's 飛將神弓 `A0AU`: +10 attack
   * damage for 15 s per kill) — with the default the buff lands on the corpse.
   */
  target?: "self" | "event";
  /**
   * WHAT the event's entity has to BE for this hook to fire (task #244).
   * "champion" = only an entity carrying a ChampionComp; "mob" = only a
   * roguelite mob (`world.mob`); "any"/absent = no filter, which is what every
   * pre-#244 hook means and why the field is optional.
   *
   * The reason it exists: 黑泥吞噬 pays +8 max health for a mob kill and +40 for
   * a champion kill, and one `onKill` event cannot express two payouts. Chosen
   * over inventing an `onMobKill` event so there stays ONE event, one doc shape
   * and one place to reason about firing order. It also lets a hook that was
   * authored when mob kills never fired keep its exact old behaviour by pinning
   * `victim: "champion"`.
   *
   * The filter is skipped when the event carries no entity at all (a hook with
   * `target: "self"` on an entity-less event still fires, as before).
   */
  victim?: "champion" | "mob" | "any";
  /** internal cooldown in seconds (0/undefined = every trigger) */
  internalCooldown?: number;
  /**
   * Proc probability 0..1, rolled on the seeded `world.rng` every time the hook
   * would otherwise fire (absent = always). This is the WC3 proc-chance column
   * (`Hbh1` 狂怒擊機率 for Bash, `Ocr1` 致命一擊機率 for Critical Strike,
   * `War1` 動地跺機率 for Pulverize …) — without it a "10 % chance to deal +75"
   * on-attack passive can only be ported as an unconditional bonus, which is a
   * different ability. Rolled AFTER the internal-cooldown gate, and the ICD
   * clock only starts when the roll SUCCEEDS (WC3 semantics: a failed proc does
   * not consume the cooldown).
   */
  chance?: number;
  /**
   * 觸發條件 — WHEN this hook pays out (owner 2026-07-30:「on-attack by
   * condition 這個一定要實作 … `>= < =` 某個常數或某個數值條件，最常見是我方或
   * 敵人的屬性、HP/MP 數值或百分比 … 當然機率也是 condition，甚至可以組合技」).
   * Absent = always, which is every hook authored before this field existed.
   *
   * WHY IT DOES NOT REPLACE `chance` ABOVE. `chance` is the WC3 proc COLUMN —
   * one number lifted straight out of `Hbh1`/`Ocr1`/`War1`, and 100+ ported
   * passives carry it. `condition` is the general gate, and `{kind:"chance"}` is
   * one leaf of it. Both are evaluated and BOTH must pass; keeping them separate
   * means a faithful WC3 import never has to be rewritten into a tree, while a
   * card that needs 「非英雄 且 血量 < 35%」 is not forced to launder itself
   * through a bare probability (which is exactly the lie 獸矛 was shipping).
   *
   * ⚠️ CONSUMES `world.rng` — see DECISION 1 in sim/content/condition.ts for the
   * draw order, and `effects/hooks.ts` for where it sits relative to the ICD.
   */
  condition?: EffectCondition;
  /**
   * 職業限定閘 — WHO this hook pays out for (owner 2026-07-30's 近戰專用擴散 /
   * 法師保命 / 坦克衝刺 / 射手百分比傷害). Absent = everybody, which is every
   * hook authored before this field existed, so arming it is a strict no-op
   * until content opts in.
   *
   * Evaluated per FIRE against the source's carrier — see
   * `sim/content/requirement.ts` for the axes (and for why `role` is not one)
   * and `effects/hooks.ts` for the ordering. Authorable today only on
   * `item@1.passive` and `item@1.auras[].hooks` (`schema/item.ts`); abilities
   * and augments share the runtime type but have no authoring surface for it.
   */
  requires?: ClassRequirement;
}

/**
 * `"aura"` is the only kind the sim WRITES rather than content authoring: it
 * marks a source PROJECTED onto a unit by somebody else's `auras` block while
 * that unit stands inside the radius. `auraSystem` owns every one of them and
 * removes them the moment membership lapses — nothing else may create, mutate or
 * detach a source of this kind. See sim/aura/aura.ts.
 */
export type ModifierSourceKind = "champion" | "item" | "augment" | "passive" | "buff" | "aura";

export interface ModifierSource {
  /** unique instance id, e.g. "item:ember-rod#2", "aug:bloodlust", "buff:slow#t123" */
  id: string;
  kind: ModifierSourceKind;
  modifiers?: StatModifier[];
  hooks?: HookDef[];
  grantedAbilities?: AbilityId[];
  /** for buffs: expiry tick (undefined = permanent) */
  expiresAtTick?: number;
  stacks?: number;
  /**
   * PRESENTATION tag (task #244): this source's `stacks` are meant to be SEEN.
   * `visualStackCount` sums them and the snapshot turns the total into two
   * ENTITY_FLAG threshold bits, so a "the silhouette walking at you is getting
   * bigger" mechanic needs no new wire field and no per-champion netcode. Set
   * from the content's `applyBuff.stackVisual`. Never alters the stat pipeline.
   */
  visualStacks?: boolean;
  /**
   * Pure PRESENTATION tag (does NOT alter the stat pipeline or any damage
   * number): marks this source as a "damage-reduction / guard" buff. While an
   * active source with this flag is on a target, incoming hits read as
   * `blocked` in the damage/hitImpact events (guard spark + lighter knockback),
   * exactly as a shield-absorb does. Lets content express a defensive buff as a
   * block without inventing a new mitigation mechanic. Default (absent) = off.
   */
  damageReduction?: boolean;
  /**
   * AURAS (靈氣) this source PROJECTS onto other units — the only way a
   * ModifierSource reaches past the unit carrying it. Each entry names a radius,
   * a team filter and a payload; `auraSystem` applies that payload as its own
   * `kind: "aura"` source to everyone inside, every tick, and removes it as they
   * leave or die. Absent on almost everything; see sim/aura/aura.ts for the
   * model. Authored via `ability@1.passive.ranks[N].auras`.
   */
  auras?: AuraDef[];
  /** runtime: last tick each hook fired (internal-cooldown bookkeeping) */
  hookLastFired?: number[];
  /**
   * RUNTIME, `kind: "aura"` only: which emitter/aura projected this source.
   * Written by `auraSystem` when it attaches, read by it when it removes (the
   * linger tail). Never authored, never present on any other kind.
   */
  auraOrigin?: AuraOrigin;
  /**
   * 迴避的**涵蓋範圍** (lane P5) — the two DECISION POINTS of evasion, carried on
   * the source that grants it rather than hard-coded in the roll.
   *
   * WHY IT LIVES HERE AND NOT IN A CONFIG. `Stat.Evasion` is ONE aggregated
   * number (`final = clamp((base+Σflat)·…)`), so it cannot remember that buff A
   * was "dodges spells too" while champion passive B was not. The capability has
   * to ride the SOURCE. `sim/combat/evasion.ts` scans for it; nothing in the
   * stat pipeline reads it, so it changes no stat number and no panel value.
   *
   * ABSENT = TODAY'S SHIPPING BEHAVIOUR, EXACTLY: basic attacks only, true
   * damage never dodged (`combat/evasion.ts` DECISION 1). Every one of the
   * currently authored evasion sources — 3 champion docs, 8 abilities, 1 augment
   * — omits it, so arming this field is a strict no-op until content opts in.
   */
  evasionScope?: EvasionScope;
  /**
   * 隱形 / 真視 capability this source grants (see sim/stealth.ts).
   *
   * WHY IT RIDES THE SOURCE, exactly like `evasionScope`: 「這個 buff 讓我隱形」
   * and 「這個 buff 讓我看得見隱形」 are properties OF THE BUFF. There is no
   * aggregated stat that could carry them, and if there were, a 3-second
   * true-sight consumable would silently promote a permanent-invisibility
   * passive on the same body. `stealthSystem` scans for it once a tick and
   * writes the two derived maps; NOTHING in the stat pipeline reads it, so it
   * changes no stat number and no displayed value.
   *
   * ABSENT (every source in the catalogue today) = today's behaviour exactly:
   * nobody is invisible, nobody has true sight, and `world.stealth` /
   * `world.trueSight` stay empty — which is what keeps every existing replay
   * and digest bit-identical.
   */
  vision?: VisionGrant;
  /**
   * 飛行 (無視碰撞) this source grants — 04-00 翔封界. Rides the source for the
   * exact reason `vision` does: 「碰不碰得到」 is a property OF THE SOURCE, there
   * is no aggregated stat that could carry it, and if there were, a 3-second
   * flight consumable would silently promote a permanent grant on the same body.
   * `flightSystem` scans for it once a tick and writes `world.flight`; NOTHING
   * in the stat pipeline reads it, so no stat number and no displayed value
   * moves. ABSENT on every source in the catalogue except 翔封界's two docs.
   */
  flight?: import("../flight").FlightGrant;
}

/**
 * WHAT a given evasion source is allowed to dodge. Both flags default to FALSE,
 * which reproduces WC3 `Evasion` (`Aevd`) semantics — attacks only.
 */
export interface EvasionScope {
  /**
   * Also roll against ABILITY damage (any packet whose origin is not `"basic"`).
   * The roll then happens at damage RESOLVE, not at cast — see
   * `combat/evasion.ts` DECISION 5 for why that is a different (and weaker)
   * moment than the basic-attack roll, and what it means for on-hit hooks.
   */
  abilities?: boolean;
  /**
   * Also roll against `type: "true"` packets. OFF by default on purpose: the
   * arena fire-ring burn is true damage (#270), and a dodge chance against the
   * closing ring would be a balance hole, not a defensive stat.
   */
  trueDamage?: boolean;
}
