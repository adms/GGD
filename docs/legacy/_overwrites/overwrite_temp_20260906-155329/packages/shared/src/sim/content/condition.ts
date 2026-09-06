/**
 * 觸發條件 (on-attack by condition) — 「這一下，這個效果到底該不該發生」, in ONE
 * place, as DATA the editor can build from dropdowns.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS — a real card the old model could only LIE about
 *
 * owner 2026-07-30:「`>= < =` 某個常數或某個數值條件，最常見是我方或敵人的屬性、
 * HP/MP 數值或百分比 … 當然機率也是 condition，甚至可以組合技」.
 *
 * The driving case is 蒼月潮 07-002 獸矛持有者, whose own shipped description says
 * 「在攻擊非英雄部隊時，當該部隊血量低於35%將直接死亡，並有1%機率造成英雄直接
 * 死亡」. Before this file the only vocabulary a proc had was `HookDef.chance` — a
 * bare probability — so the template card had to approximate an EXECUTE as
 * 「12.5% 機率造成 100 傷害」. That is not a weaker version of the ability, it is a
 * different ability, and owner said so plainly: 看不懂也不合理.
 *
 * With a condition the same card is honest, and it needs all four of the axes
 * owner listed AT ONCE:
 *
 *   any: [ all: [ 目標不是英雄, 目標生命 < 35% ],      ← 比較運算子 + 百分比
 *          all: [ 目標是英雄,   1% 機率      ] ]        ← 機率也是 condition
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS A SEPARATE FILE FROM `requirement.ts` AND NOT A SECOND COPY OF IT
 *
 * `ClassRequirement` (the 職業限定閘) answers 「這張卡，這位英雄配不配得上」 — a
 * question about the CARRIER and about CONTENT CURATION, whose answer barely
 * changes during a match and whose mismatch mode is 「不能用 / 只有一半效果」.
 * A condition answers 「這一次，這一下」 — a question about the MOMENT, re-asked
 * on every single swing, whose answer is a plain yes/no.
 *
 * They compose rather than compete: `fireHooks` evaluates `requires` first (it
 * is the cheaper, rng-free, carrier-level gate) and only then this. Folding the
 * two into one union would have made the class gate re-derivable per-swing and
 * the moment gate carry a `mismatchScale` that means nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ DECISION 1 — `chance` IS DRAWN UP FRONT, AND THE TREE DOES NOT SHORT-CIRCUIT
 *
 * THIS IS THE DETERMINISM DECISION OF THE WHOLE FILE. Read it before touching
 * {@link evaluateCondition}.
 *
 * A tree may contain several `chance` leaves. If evaluation short-circuited —
 * `all: [A, B]` skipping B once A is false — then HOW MANY DRAWS the world's
 * single shared `Rng` gives up on a given tick would depend on WORLD STATE (the
 * target's hp, whether the target is a hero, …) and on the AUTHORED ORDER of the
 * clauses. Two replicas that disagree about one hp value by one packet would
 * then desync their entire rng stream from that tick on, and the failure would
 * surface somewhere else entirely — a different crit, a different mob spawn.
 *
 * So evaluation is TWO PHASES:
 *
 *   1. {@link drawChances} walks the tree in a fixed PRE-ORDER (`all`/`any`
 *      children in authored array order; `not`'s single child) and draws exactly
 *      one `world.rng.chance(p)` per `chance` leaf, into a flat array.
 *   2. {@link evalNode} walks the SAME pre-order, consuming that array with a
 *      cursor, and DELIBERATELY DOES NOT SHORT-CIRCUIT: every child of an `all`
 *      is evaluated even after one is false, every child of an `any` even after
 *      one is true. It has to, or the cursor and the draw order would disagree.
 *
 * The invariant this buys, and the one `condition.test.ts` pins:
 *
 *     the number of rng draws a condition consumes is a pure function of the
 *     CONDITION TREE'S SHAPE — never of the world, the target, or the outcome.
 *
 * The cost is honest and small: a `chance` leaf behind a gate that is false
 * still consumes a draw. That cost buys a stream position that can be reasoned
 * about from the doc alone. Phase 2 is pure — no rng — so re-evaluating a tree
 * with the same draws always gives the same answer.
 *
 * ⚠️ NOT CONFIGURABLE, on purpose, and this is the one place in the system where
 * 「決策點做成後台欄位」 does NOT apply: a toggle between the two orders would
 * silently invalidate every replay recorded under the other setting, so the knob
 * would not be a design choice, it would be a way to corrupt saved matches.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ DECISION 2 — AN UNREADABLE LEAF IS FALSE (and `not` therefore flips it)
 *
 * `subject: "target"` on an event that carries no entity (an `onLevelUp` hook, a
 * `target: "self"` proc), a stat on a body that has no StatsComp, an hp percent
 * on a body whose maxHp is 0 — every one of these resolves to FALSE, never to
 * "skip" and never to "pass".
 *
 * This is the OPPOSITE of `requirement.ts`'s 「unknown passes」, and deliberately.
 * A class requirement is a statement about CONTENT that must not silently hand a
 * test harness an inert weapon, so it fails OPEN. A condition is a statement
 * about a MOMENT, and 「這一刻的目標血量低於 35%」 when there is no target at all
 * is not true — answering yes would fire an execute into the void. Failing
 * closed also makes a mis-authored condition visible the loud way (「它從來不
 * 觸發」) rather than the quiet way (「它每次都觸發」), which for a DAMAGE gate is
 * the safer direction.
 *
 * Consequence worth stating plainly, because it is the one thing that surprises:
 * `not(目標是英雄)` with NO target is TRUE. Two-valued logic has no third answer
 * and inventing an "unknown" that poisons every enclosing `not` would make the
 * dropdown UI unexplainable. Authors who need 「有目標而且不是英雄」 write
 * `all: [ 目標是小兵 ]` — every `kind` leaf is a POSITIVE test.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ DECISION 3 — `percent` ONLY EXISTS WHERE IT HAS A DENOMINATOR
 *
 * 「生命 < 35%」 has an obvious meaning: current / max. 「攻速 < 35%」 has none —
 * there is no maximum attack speed a champion is a fraction of. So `percent` is
 * offered on {@link RESOURCE_STATS} (hp, mp) and NOWHERE else, and that
 * restriction is expressed in the TYPE and in the Zod schema
 * (`content/schema/condition.ts`), not in a comment: `{stat:"ad", mode:"percent"}`
 * does not compile and does not parse. The editor's mode dropdown is driven off
 * {@link statSupportsPercent} for the same reason — one source, three surfaces.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PURITY: pure reads of world components + the content registry, plus `Rng`
 * draws in phase 1 only. No clock, no Math.random, no trig, no `**` — safe under
 * sim/purity.test.ts.
 */
import type { AbilityId, EntityId, ItemId, StatusId } from "../../ids";
import type { SimWorld } from "../SimWorld";
// 「這一筆狀態實例真的在做什麼」的真相就住在這個型別上，而它同時是
// {@link STATUS_FIELD_TAGS} 那道**編譯期**閘的來源：`Record<keyof StatusEffect, …>`
// 表示往它加一格旗標而不在推導表表態，`pnpm typecheck` 就回非零。型別 import，
// 執行期沒有這條邊。
import type { StatusEffect } from "../components";
// 「他身上帶著哪些道具」的**分類**要從道具文件上讀（`ItemDef.tags`），而登錄表
// 就是 sim 這一側的道具真相 —— `economy/itemSets.ts`（套裝：「同時裝備 A、B、C」）
// 走的是同一條路。⛔ 不要在這裡另外開一份 id→tag 表：那是第二個答案，而它只會在
// 某一份道具改了 tags 的那一天跟這裡分歧。
// 「他身上那些狀態各屬於哪一**類**」的真相同樣在登錄表上（`StatusMeta.tags`，
// 由 `content/registries.ts` 從 `status-effect@1.tags` 帶過來）。⛔ 同上：不要在
// 這裡另外開一份 id→tag 表。
import { Abilities, Items, Statuses } from "./registry";
import { Stat } from "../stats/statTypes";
import type { AttrKey } from "../stats/attributes";
import { liveAttribute } from "../stats/attrSources";
// ⛔ 不要在這裡再寫一次「他身上還有沒有這個 status」。`effects/effectCommon.ts`
// 的 `hasStatus` 已經是那個答案,而且它的檔頭記著一個很細的理由:
// `StatusSystem` 在 tick 開頭就把過期的清掉了,但它跑在技能結算**之前**,
// 所以 `> world.tick` 的**再**檢查才是「這一 tick 到底還算不算」的真答案。
// 抄第二份 = 兩個答案,而它們只會在某一 tick 的邊緣分歧 —— 那是查不出來的那種。
import { hasStatus, statusStacks } from "../effects/effectCommon";
import { CASTABLE_SLOTS, type CastableSlot } from "../intents";
import { lastCastTickInSlot, lastCastTickOfAbility } from "./castLedger";

// ---------------------------------------------------------------------------
// THE VOCABULARY
// ---------------------------------------------------------------------------

/** WHOSE number/kind a leaf reads. 「我方或敵人」 in owner's phrasing. */
export type ConditionSubject = "self" | "target";
export const CONDITION_SUBJECTS: readonly ConditionSubject[] = ["self", "target"];

/**
 * The two stats that HAVE a maximum, and therefore the only two on which
 * `mode: "percent"` means anything (DECISION 3).
 */
export type ResourceStat = "hp" | "mp";
export const RESOURCE_STATS: readonly ResourceStat[] = ["hp", "mp"];

/**
 * Everything else a condition may compare — absolute values only.
 *
 * `str`/`agi`/`int` are the 三圍 recovered in #248 and are read LIVE
 * (`championAttribute` including the points bought this match, #260), not off
 * the doc, so 「敏捷 >= 40」 responds to the shop. The six combat stats are read
 * off `StatsComp.final`, i.e. the post-pipeline, post-combat-env, post-clamp
 * number — THE SAME NUMBER THE PLAYER'S PANEL SHOWS (#125). A condition that
 * compared a pre-multiplier base would be a second, invisible stat model.
 */
export type PlainStat =
  | "str"
  | "agi"
  | "int"
  | "ad"
  | "ap"
  | "armor"
  | "magicResist"
  | "moveSpeed"
  | "attackSpeed"
  | "level";
export const PLAIN_STATS: readonly PlainStat[] = [
  "str",
  "agi",
  "int",
  "ad",
  "ap",
  "armor",
  "magicResist",
  "moveSpeed",
  "attackSpeed",
  "level",
];

export type ConditionStat = ResourceStat | PlainStat;
/** Editor dropdown order: the two resources first, they are the common case. */
export const CONDITION_STATS: readonly ConditionStat[] = [...RESOURCE_STATS, ...PLAIN_STATS];

/**
 * Does `stat` admit `mode: "percent"`? The ONE answer the type, the schema and
 * the UI share (DECISION 3).
 *
 * It is a TYPE PREDICATE rather than a plain boolean so the editor's
 * 「switch stat → repair mode」 branch narrows for free: without the predicate
 * that code has to cast, and a cast is exactly how 「攻速 percent」 would sneak
 * back past the type system into a doc that then fails Zod at save time.
 */
export function statSupportsPercent(stat: ConditionStat): stat is ResourceStat {
  return (RESOURCE_STATS as readonly string[]).includes(stat);
}

/** owner:「`>= < =` 某個常數」 — plus the two he implied by writing 「某個數值條件」. */
export type CompareOp = ">=" | "<=" | ">" | "<" | "==" | "!=";
export const COMPARE_OPS: readonly CompareOp[] = [">=", "<=", ">", "<", "==", "!="];

/**
 * WHAT a body is. Four positive tests; a body that is none of them (a flower, a
 * coin, a bare test entity) matches none — the same honest reading `HookDef.victim`
 * takes, and the reason there is no `"other"` member to invert against.
 */
export type ConditionEntityKind =
  | "champion"
  | "mob"
  | "summon"
  | "guardian"
  /**
   * ⭐ [EX∅ 根源]（2026-08-18）—— 「特殊殭屍」與「殭屍王」各自一格。
   *
   * ⚠️ 它們是 `"mob"` 的**子集**，⛔ 不是它的兄弟：一隻殭屍王同時滿足
   * `mob` 與 `mobBoss`。分開是因為卡片真的要分得開 —— 大師球的逆轉條件是
   * 「收服**殭屍王或特殊殭屍**」，而寫成 `mob` 的話那張卡在第一波雜兵身上
   * 就被用掉了（做得到、但不是卡面說的那件事）。
   *
   * ⛔ 不要用 `mobCountsAsChampion` 那兩格後台開關代替：那兩格回答的是
   * 「這隻算不算英雄單位」（一個**平衡**問題，操作者隨時會翻），這兩格問的是
   * 「牠是哪一種身體」（一個**事實**）。共用一格會讓後台一個勾把大師球的
   * 逆轉條件靜默改掉。
   */
  | "mobSpecial"
  | "mobBoss";
export const CONDITION_ENTITY_KINDS: readonly ConditionEntityKind[] = [
  "champion",
  "mob",
  "summon",
  "guardian",
  "mobSpecial",
  "mobBoss",
];

/**
 * BOUNDS. 「欄位要有上界，不是只有下界」 — `validateField` used to check only
 * `min`, so 0.35 typed as 35 sailed through the console and was silently
 * meaningless downstream.
 *
 * `percent` is a RATIO, exactly like `chance` and like `Stat.Lifesteal`: 0.35 is
 * 35%. The [0,1] ceiling is what turns 「35」 into a form error instead of a
 * condition that is true for every living body.
 *
 * `absolute` has no principled ceiling — 「生命 >= 4000」 is a normal late-game
 * gate — so 1e6 is a MIS-PARSE guard in the spirit of `zAuraDef.radius`'s 40: it
 * catches a raw un-converted number that leaked in from somewhere, not a balance
 * choice. The floor is 0 because every stat in {@link ConditionStat} is
 * non-negative by construction, so a negative bound could only ever be a typo.
 */
export const CONDITION_PERCENT_MIN = 0;
export const CONDITION_PERCENT_MAX = 1;
export const CONDITION_ABSOLUTE_MIN = 0;
export const CONDITION_ABSOLUTE_MAX = 1_000_000;
export const CONDITION_CHANCE_MIN = 0;
export const CONDITION_CHANCE_MAX = 1;

/**
 * How deep a tree may nest, and how many children one group may hold. Both are
 * structural sanity limits rather than design limits (the 獸矛 gate — the most
 * complex real card known — is depth 3 with 2+2 children), and both exist so a
 * hand-edited or machine-generated doc cannot hand the evaluator, the describer
 * or the editor an unbounded recursion.
 */
export const CONDITION_MAX_DEPTH = 5;
export const CONDITION_MAX_CHILDREN = 8;

/**
 * 「某一類道具」那一格（{@link EquipmentTagLeaf}）的字串長度上下界。
 *
 * 下界 1：空字串是一個**看起來寫好了、卻永遠比不中**的閘（失敗形態 ②），
 * 而且它在表單上跟「還沒填」長得一模一樣。
 * 上界 40：出貨的 `ItemDef.tags` 全是短 slug（`legendary` / `onhit` / `boots`
 * / `stat-path`），最長 11 字。40 是「這是把整段描述貼進來了」的那條線 ——
 * 誤植攔截，不是設計政策（同 `zAuraDef.radius` 的 40 的用法）。
 */
export const EQUIPMENT_TAG_MIN_LEN = 1;
export const EQUIPMENT_TAG_MAX_LEN = 40;

/**
 * 「某一類狀態」那一格（{@link StatusTagLeaf}）的字串長度上下界。
 *
 * 跟 {@link EQUIPMENT_TAG_MIN_LEN} / {@link EQUIPMENT_TAG_MAX_LEN} 是**兩對數字
 * 而不是共用一對**，理由是它們指的是兩個不同集合的自由字串：`ItemDef.tags` 與
 * `status-effect@1.tags` 沒有任何理由永遠同界，而共用一個常數會讓「調寬道具那
 * 一邊」在狀態這一邊產生一個沒有人要求過的副作用。
 *
 * 下界 1：空字串是一個**看起來寫好了、卻永遠比不中**的閘（失敗形態 ②），而且
 * 它在表單上跟「還沒填」長得一模一樣。
 * 上界 40：出貨的 `status-effect@1.tags` 全是短 slug（`stun` / `hard-cc` /
 * `slow` / `uncontrollable` / `antiheal`），最長 14 字。40 是「這是把整段描述
 * 貼進來了」的那條線 —— 誤植攔截，不是設計政策。
 */
export const STATUS_TAG_MIN_LEN = 1;
export const STATUS_TAG_MAX_LEN = 40;

// ---------------------------------------------------------------------------
// THE SHAPE
// ---------------------------------------------------------------------------

/** 機率 — owner:「當然機率也是 condition」. Drawn in phase 1; see DECISION 1. */
export interface ChanceLeaf {
  kind: "chance";
  /** 0..1. 0.01 = the 獸矛 hero-execute roll. */
  p: number;
}

/**
 * ⭐ GH#354 / G4 —— 比較式的**第二個運算元**。
 *
 * 在這一格之前，條件葉的右手邊只能是一個**常數**，所以整整一族「跟對方比」的
 * 設計寫不出來。owner 2026-08-17 的 [EX解放] 裡：
 *   · #67 兎月【雙弦月】「比較自身與攻擊目標的核心戰鬥屬性，每低於敵方一個
 *     差距階級⋯」——【下剋上】整張卡就是這件事，這是它**唯一**的缺口
 *   · #55 噬魂者「依自身攻擊力與 AP **較高者**」——同一主體、跨屬性
 *
 * ── 右手邊的完整式子是 `value + scale × 另一個讀數` ────────────────────────
 * `other` 缺席 → 右手邊就是 `value` = **今天**（既有的每一條條件逐位元不變）。
 *
 * ⛔ 刻意**不**把 `value` 變成選填、也不讓 `value` 在 `other` 出現時改讀成
 * 「倍率」—— 一個意思會隨著旁邊那一格而變的欄位，讀的人與編輯器都得先看另一格
 * 才知道自己在看什麼，而 `value` 的上下界檢查（percent 是 0..1、absolute 是
 * 0..1e6，那是「35 打成 0.35」唯一的攔截點）也會跟著失去意義。
 * 加法式讓兩者都成立：`value` 永遠是「同一個單位的一個量」。
 *
 * ⚠️ `stat` 缺席 = **跟左邊同一個屬性**（跨主體比較的常見情況）。
 * ⚠️ `mode` 沒有第二格：兩邊**一定**用左邊那一個。「我的血量%」對「他的血量絕對值」
 * 不是一個有意義的比較，而它看起來完全正常。
 * ⚠️ 型別上 `other.stat` 只收**同一族**的屬性（資源葉收資源、一般葉收一般），
 * 所以「hp percent 比 攻速」連寫都寫不出來 —— 與 DECISION 3 同一條路數。
 */
export interface ConditionOperand<S extends ConditionStat> {
  /** 讀誰的。`target` 不存在時整條葉子是 false（與左手邊同一條規矩）。 */
  subject: ConditionSubject;
  /** 讀哪一個屬性。省略 = 跟左邊同一個。 */
  stat?: S;
  /** 乘上去的倍率。省略 = 1。「比對方少 20%」= `scale: 0.8`。 */
  scale?: number;
}

/** {@link ConditionOperand.scale} 的上下界。⛔ 兩端都要有（第一守則）。 */
export const CONDITION_SCALE_MIN = 0.01;
export const CONDITION_SCALE_MAX = 10;

/** A number comparison on a body that HAS a maximum, so `percent` is offered. */
export interface ResourceStatLeaf {
  kind: "stat";
  subject: ConditionSubject;
  stat: ResourceStat;
  /** "percent" = current/max as a 0..1 ratio; "absolute" = the raw number. */
  mode: "absolute" | "percent";
  op: CompareOp;
  value: number;
  /** ⭐ G4 —— 右手邊 = `value + scale × other`。見 {@link ConditionOperand}。 */
  other?: ConditionOperand<ResourceStat>;
}

/** A number comparison on a stat with no denominator — absolute only (DECISION 3). */
export interface PlainStatLeaf {
  kind: "stat";
  subject: ConditionSubject;
  stat: PlainStat;
  /** Optional and only ever "absolute": there is no percent of an attack speed. */
  mode?: "absolute";
  op: CompareOp;
  value: number;
  /** ⭐ G4 —— 右手邊 = `value + scale × other`。見 {@link ConditionOperand}。 */
  other?: ConditionOperand<PlainStat>;
}

export type StatLeaf = ResourceStatLeaf | PlainStatLeaf;

/** 「目標不是英雄」 is `not` of this. Always a POSITIVE test — see DECISION 2. */
export interface KindLeaf {
  kind: "kind";
  subject: ConditionSubject;
  is: ConditionEntityKind;
}

/**
 * 「這個主體身上**現在**有沒有某個狀態」—— owner 2026-08-08 那 90 支文案裡
 * 出現最多次的閘（至少 12 支）：
 *
 *   45-04 千鳥「命中帶[燃燒]標記的敵人」· 79-02/79-03「若對方在[破魔]狀態」·
 *   80-03「若對方在[破甲]狀態」· 52-02/52-04「若敵人具有[恐懼]狀態」·
 *   13-002「對[致盲]狀態的敵人」· 92-04「身上有[致盲]標記」·
 *   12-03「敵人身上有[混亂]標記時」·
 *   89-00/89-01/89-02/89-04（熊貓整隻英雄就是暈眩→致盲→混亂的狀態連鎖）
 *
 * ⭐ 為什麼是 `subject` 而不是「目標專用」：52-02 的另一半是「若**自身**在
 * [狂怒]狀態」。同一個機制的兩半，共用 {@link ConditionSubject}（跟 `stat` /
 * `kind` 兩顆葉子逐字一樣的寫法），而不是開第二套詞彙。
 *
 * ⭐ 為什麼**沒有** `has: boolean` 之類的欄位：`not` 組合子已經存在而且包得住
 * 一顆葉子（`{ not: { kind:"status", … } }`），所以「沒有[破甲]」是既有語法的
 * 一個用法，不是一個新欄位。多開一格 = 同一件事有兩種寫法，而兩種寫法的內容
 * 遲早會分歧（`describeCondition` 也得跟著長出兩條分支）。
 *
 * ⚠️ 讀的是**還沒到期**的那一筆（`expiresAtTick > world.tick`，見
 * `effects/effectCommon.ts` 的 `hasStatus`）。沒有 `StatusComp` 的身體永遠回
 * false —— 那是 DECISION 2 的同一個方向：讀不到就是 false，而不是「跳過」或
 * 「通過」。
 *
 * ⚠️ **2026-08-09 更正（第三守則）**：這一段原本寫著「小兵一個都沒有
 * （`SimWorld.ts:941`）」，而那句話從 2026-08-04 起就是假的 ——
 * `sim/mobs.ts::spawnMobBody` 會替每一隻殭屍建 `world.status.set(id, {effects:[]})`
 * （A3a，守衛 `sim/mobs.status.test.ts`）。所以【破甲】【破防】【破魔】這一族
 * **掛得上殭屍，也查得到**（GH#301-6，owner：「這三個雖然是無效，但還是可以有
 * buff 被 check」）。真正對殭屍無效的是**屬性**那一半（`applyBuff` →
 * `attachSource` 第一句 `if (!sc) return;`），因為殭屍沒有 `StatsComp`。
 * 兩件事在這一顆葉子上有相反的答案，而舊註解把它們混成一句。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 決策點（2026-08-08）：「這一份」還是「這一類」—— 兩種都做
 *
 * 上面那張清單裡的**熊貓六支有五支**（89-00/01/02/04/002）與 92-04 卡在同一個
 * 地方，而且卡點不是「條件葉不存在」，是**它只吃 exact id**：
 *
 *   89-00「敵方[暈眩]狀態下額外追加[致盲]」
 *
 * 「暈眩」在出貨內容裡**不是一份文件**，是五份（`burnstun` / `fang-stun` /
 * `ingredient` / `omnislash-lock` / `trial-stun`），因為每一支施加暈眩的技能都
 * 帶著自己的文案與圖示。所以 exact id 逼作者寫成 `any:[五個 id]`，而那張卡會在
 * **第六份暈眩上架的那一天安靜地漏掉它** —— 沒有任何東西會紅，卡片看起來也
 * 完全正常（失敗形態 ②：算出來了但這一半從沒送到）。
 *
 * 所以這顆葉子跟 {@link EquipmentItemLeaf} 一樣是一個 UNION，寫法逐字相同
 * （兩個分支各只帶**一格**，都 `.strict()`）：
 *
 *   `{ kind:"status", subject:"target", statusId:"trial-stun" }` ← 這一份
 *   `{ kind:"status", subject:"target", tag:"stun"            }` ← 這一類
 *
 * `{statusId, tag}` 兩格一起寫兩個分支都不收 —— 那是一個**沒有人定義過**的語意
 * （且？或？），而它在表單上看起來完全正常。這跟 `zStatLeaf` 用 union 表達
 * 「percent 只在有分母的屬性上開放」是同一個手法，不是第二套寫法。
 *
 * ⭐ 為什麼「類」讀 `status-effect@1.tags` 而不是 `polarity`：polarity 只有
 * buff/debuff 兩格，它回答的是 HUD 要畫紅框還是綠框，不是「這是哪一族的東西」。
 * tags 才是內容真的帶著的語意分類（`stun` / `hard-cc` / `cc` / `slow` /
 * `antiheal` / `uncontrollable` …），而且它已經在出貨文件上了。
 *
 * ⭐ 為什麼是**單一 tag** 而不是一個陣列 + `mode:"any"|"all"`：owner 那 90 支
 * 文案裡**沒有一句**在問兩個類別（每一句都是「[暈眩]狀態下」「帶[致盲]標記」）。
 * 真的需要那一天，加的是**一格 `mode`**（配一個陣列），不是第二顆葉子 —— 兩顆
 * 葉子會讓 `describeCondition`、編輯器與求值端各長出兩條分支，而它們只會分歧。
 */
export interface StatusIdLeaf {
  kind: "status";
  subject: ConditionSubject;
  /** `status-effect@1` 的編號 —— 跟 `applyStatus.statusId` 是同一個命名空間。 */
  statusId: StatusId;
  /**
   * ⭐ 「至少疊了幾層」（GH#301-5）。缺席 = 只問有無，逐字等於這一格出現之前。
   *
   * 讀的是 {@link statusStacks}（`effects/effectCommon.ts`）—— **同一個讀取器**，
   * 不是第二份層數規則：多來源相加、過期不算、上界夾在 `MARK_MAX_COUNT`。
   * ⛔ 不要在這裡自己走一遍 `world.status`：那會長出第二套「哪一筆還算數」，
   * 而兩套遲早對「剛好這一 tick 到期」給出不同答案。
   *
   * ⚠️ 只有這個分支有；`tag` 那個分支刻意沒有（見 schema 那一格的說明）。
   */
  minStacks?: number;
}

/** 「某一類狀態」—— 比對 `status-effect@1.tags`。見 {@link StatusIdLeaf} 的說明。 */
export interface StatusTagLeaf {
  kind: "status";
  subject: ConditionSubject;
  /** 狀態文件上的一個 tag（`stun` / `hard-cc` / `slow` …）。逐字比對。 */
  tag: string;
}

export type StatusLeaf = StatusIdLeaf | StatusTagLeaf;

/** 這顆葉子問的是哪一種？型別謂詞，讓求值端與編輯器共用同一個答案。 */
export function isStatusIdLeaf(leaf: StatusLeaf): leaf is StatusIdLeaf {
  return (leaf as StatusIdLeaf).statusId !== undefined;
}

/**
 * 「某個主體身上**現在**裝備著某件／某類道具」——
 * owner 2026-08-08 那 90 支文案裡 **77-002 御雷劍** 的閘：
 *
 *   [被動][機率][裝備了某類道具時]
 *   「使用從者道具"御雷劍"的剎那，其雷鳴劍發動[機率]上升至50%，
 *    [GLADIARIA ALAT] 持續時間增加至30秒。」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 決策點：「這一件」還是「這一類」—— 兩種都做，因為**同一張卡同時說了兩句**
 *
 * 那張卡的方括號標籤寫的是「裝備了**某類**道具時」，而它的內文指名的是**一件**
 * （御雷劍）。這不是文案不精確，這是這個閘真正的形狀：owner 在寫規格的時候
 * 想的就是「一族」，落到這一支英雄身上剛好只有一件。
 *
 * 所以這顆葉子是一個 UNION，寫法跟同一檔的 {@link StatLeaf} 逐字一樣
 * （`ResourceStatLeaf | PlainStatLeaf`，Zod 那側 `z.union`），兩個分支各只帶
 * **一格**：
 *
 *   `{ kind:"equipment", subject:"self", itemId:"godie-i0xx" }`  ← 這一件
 *   `{ kind:"equipment", subject:"self", tag:"onhit"         }`  ← 這一類
 *
 * `.strict()` 讓「兩格一起寫」兩個分支都不收 —— 那是一個**沒有人定義過**的
 * 語意（且？或？），而它在表單上看起來完全正常。
 *
 * ⭐ 為什麼「類」讀 `ItemDef.tags` 而不是 `tier`：`tier` 是 #82 訂的**價格帶**
 * （1..5，商店貨架用的），不是「這是哪一族的東西」。tags 才是內容真的帶著的
 * 語意分類（`legendary` / `onhit` / `boots` / `stat-path` …），而且它已經是
 * `economy/legendaryTags.ts` 讀的那一格。要是哪天 owner 真的要「第 5 階的任何
 * 道具」，那是這個 union 的**第三個分支**，不是把 tags 硬掰成價格。
 *
 * ⭐ 為什麼**沒有**「幾件」（`op` + `count`）：出貨文案沒有一句在數件數，而一個
 * 數量比較會是 {@link StatLeaf} 那套 `op`/`value` 詞彙的第二份抄本 —— 兩份遲早
 * 分歧。「一件都沒有」已經有寫法：`not` 包住它（跟 {@link StatusLeaf} 同一個
 * 理由）。真的需要數的那天，加的是一格 `minCount`，不是一整套比較運算子。
 *
 * ⚠️ `itemId` 是 **soft ref**（跟 `StatusLeaf.statusId` 同一個理由）：御雷劍
 * 這一族的道具文件今天還沒進 `content/items/`，硬 ref 會讓「條件寫得出來」被
 * 「道具還沒上架」擋住，而那兩件事沒有先後關係。
 *
 * ⚠️ 讀的是 `ChampionComp.items`（`sim/components.ts`），也就是**背包那 6 格**
 * ——「裝備了」在這個遊戲裡就是「在背包裡」，沒有第二層穿戴欄。小兵／召喚物／
 * 守護者身上沒有 `ChampionComp`，所以對它們永遠回 false：DECISION 2 的同一個
 * 方向（讀不到就是 false，不是「跳過」也不是「通過」）。
 */
export interface EquipmentItemLeaf {
  kind: "equipment";
  subject: ConditionSubject;
  /** 指名的那一件道具編號 —— 跟 `champion.buildPriority` 同一個命名空間。 */
  itemId: ItemId;
}

/** 「某一類道具」—— 比對 `ItemDef.tags`。見 {@link EquipmentItemLeaf} 的說明。 */
export interface EquipmentTagLeaf {
  kind: "equipment";
  subject: ConditionSubject;
  /** 道具文件上的一個 tag（`onhit` / `legendary` / `boots` …）。逐字比對。 */
  tag: string;
}

export type EquipmentLeaf = EquipmentItemLeaf | EquipmentTagLeaf;

/** 這顆葉子問的是哪一種？型別謂詞，讓求值端與編輯器共用同一個答案。 */
export function isEquipmentItemLeaf(leaf: EquipmentLeaf): leaf is EquipmentItemLeaf {
  return (leaf as EquipmentItemLeaf).itemId !== undefined;
}

// ---------------------------------------------------------------------------
// 連續技窗口 —— 「最近 N 秒內施放過某技能」（GH#937）
// ---------------------------------------------------------------------------

/**
 * `withinSec` 的上下界。
 *
 * **下界 = 一個 tick 的秒數**（30 tick/s ⇒ 0.034），⛔ 不是 0：`0` 的意思是
 * 「同一個 tick 內」，而那條路寫不出任何一個連續技（第二支技能一定在下一個
 * tick 才按得下去）—— 一個永遠為假的閘就是第一·五守則講的空宣稱。
 *
 * **上界 30 秒**：連續技窗口是「接得上嗎」，⛔ 不是「這一場放過嗎」。想問後者的
 * 內容要的是一個標記（`applyStatus` ＋ `condition.status`），⛔ 不是這顆葉子 ——
 * 而那條路今天就走得通。把上界開到幾百秒等於讓這兩件事看起來可以互相取代。
 */
export const RECENT_CAST_WITHIN_MIN_SEC = 0.034;
export const RECENT_CAST_WITHIN_MAX_SEC = 30;

/**
 * 「**這一支**技能在最近 N 秒內被施放過」。
 *
 * ⭐ 這顆葉子問的是**施放**，⛔ 不是命中 —— 連續技的窗口從按下去那一刻開始算，
 * 而「者、皆、陣」那一類的鋪場技可能一個人都沒打到卻仍然開了窗口。
 *
 * ⚠️ 讀的是**已提交**的施放（`castLedger.noteAbilityCast` 的呼叫點在每一道拒絕
 * 閘之後），所以一次因為沒魔力而被拒的按鍵不會開窗口。
 *
 * ⚠️ `abilityId` 是 **soft ref**，跟 `StatusIdLeaf.statusId` / `EquipmentItemLeaf
 * .itemId` 逐字同一個理由：條件寫得出來，⛔ 不該被「那支技能還沒進 registry」
 * （編輯器沙盒、還沒上架的英雄）擋住。
 *
 * ⚠️ `subject` 跟這一檔每一顆葉子共用同一個語意：`self` = 施法者 / hook 的持有
 * 者，`target` = 這次事件的對手。⭐ `target` 是**真的有用**的一半 ——
 * 「對手剛剛交了位移技」是一個閘，⛔ 不是一個湊出來的對稱。
 */
export interface RecentCastAbilityLeaf {
  kind: "recentCast";
  subject: ConditionSubject;
  /** 指名的那一支技能編號。 */
  abilityId: AbilityId;
  /** 窗口長度（秒）。⭐ 換算成 tick 在求值端做，⛔ 不烘進文件。 */
  withinSec: number;
}

/**
 * 「**那一格**在最近 N 秒內被施放過」——⭐ owner 要的「**一組**技能」那一半。
 *
 * ⭐ 為什麼是槽位而不是一個自由字串的技能標籤：**`ability@1` 今天沒有 `tags`**
 * （2026-09-02 量到：出貨 421 份技能文件**零份**有這一格；`template` 那一格在
 * `registerAll` 展開時就被吃掉了，`AbilityDef` 上讀不到）。
 * ⛔ 開一個比對不到任何東西的 `tag` 分支＝第一·五守則的空宣稱：schema 收得下、
 * 後台存得起來、卡面印得出來，而它永遠是 false。
 *
 * ⇒ 槽位是**今天真的活著**的那一種分組，而且它已經是這個引擎的分組單位：
 * `systems/WorldHookSystem.ts` 的 `onUltimateCast` 逐字就是
 * `when: (_w, d) => d.slot === "R"`。「終極技之後 1 秒內」對全 111 位英雄一次寫成。
 *
 * ⚠️ `ability@1` 長出 `tags` 的那一天，這裡多**一個** union 成員就好
 * （形狀跟 `StatusLeaf` / `EquipmentLeaf` 的「一份 vs 一類」逐字相同）——
 * ⛔ 不必動求值端的結構，也⛔ 不必回頭改任何一份既有內容。
 */
export interface RecentCastSlotLeaf {
  kind: "recentCast";
  subject: ConditionSubject;
  /** 哪一格按鈕（Q / W / E / R / EX / PASSIVE）。 */
  slot: CastableSlot;
  withinSec: number;
}

export type RecentCastLeaf = RecentCastAbilityLeaf | RecentCastSlotLeaf;

/** 這顆葉子問的是哪一種？型別謂詞，讓求值端、說明端與編輯器共用同一個答案。 */
export function isRecentCastAbilityLeaf(leaf: RecentCastLeaf): leaf is RecentCastAbilityLeaf {
  return (leaf as RecentCastAbilityLeaf).abilityId !== undefined;
}

export type ConditionLeaf =
  | ChanceLeaf
  | StatLeaf
  | KindLeaf
  | StatusLeaf
  | EquipmentLeaf
  | RecentCastLeaf;

/** 且 — every child must hold. Schema requires ≥1 child, so it is never vacuous. */
export interface AllCondition {
  all: EffectCondition[];
}
/** 或 — at least one child must hold. */
export interface AnyCondition {
  any: EffectCondition[];
}
/** 非 — inverts its child, including an unreadable one (DECISION 2). */
export interface NotCondition {
  not: EffectCondition;
}

export type EffectCondition = AllCondition | AnyCondition | NotCondition | ConditionLeaf;

export const isAll = (c: EffectCondition): c is AllCondition =>
  (c as AllCondition).all !== undefined;
export const isAny = (c: EffectCondition): c is AnyCondition =>
  (c as AnyCondition).any !== undefined;
export const isNot = (c: EffectCondition): c is NotCondition =>
  (c as NotCondition).not !== undefined;
export const isLeaf = (c: EffectCondition): c is ConditionLeaf =>
  !isAll(c) && !isAny(c) && !isNot(c);

/** Children of a group, or `[]` for a leaf — the ONE traversal both phases use. */
function childrenOf(c: EffectCondition): readonly EffectCondition[] {
  if (isAll(c)) return c.all;
  if (isAny(c)) return c.any;
  if (isNot(c)) return [c.not];
  return [];
}

/** Nesting depth of a tree (a bare leaf is 1). Shared with the Zod depth check. */
export function conditionDepth(c: EffectCondition): number {
  let deepest = 0;
  for (const child of childrenOf(c)) {
    const d = conditionDepth(child);
    if (d > deepest) deepest = d;
  }
  return deepest + 1;
}

/** How many `chance` leaves — i.e. exactly how many rng draws it costs (DECISION 1). */
export function conditionChanceCount(c: EffectCondition): number {
  if (isLeaf(c)) return c.kind === "chance" ? 1 : 0;
  let n = 0;
  for (const child of childrenOf(c)) n += conditionChanceCount(child);
  return n;
}

// ---------------------------------------------------------------------------
// READING THE WORLD — every reader returns null for "cannot be read" (DECISION 2)
// ---------------------------------------------------------------------------

/** `PlainStat` → the `Stat` enum member it reads off `StatsComp.final`. */
const PLAIN_TO_STAT: Partial<Record<PlainStat, Stat>> = {
  ad: Stat.AttackDamage,
  ap: Stat.AbilityPower,
  armor: Stat.Armor,
  magicResist: Stat.MagicResist,
  moveSpeed: Stat.MoveSpeed,
  attackSpeed: Stat.AttackSpeed,
};

/** `PlainStat` → the 三圍 key it reads live off the champion (#248 + #260). */
const PLAIN_TO_ATTR: Partial<Record<PlainStat, AttrKey>> = {
  str: "str",
  agi: "agi",
  int: "int",
};

/** This body's level — champion level, else summon level, else unreadable. */
function readLevel(world: SimWorld, id: EntityId): number | null {
  const champ = world.champion.get(id);
  if (champ) return champ.level;
  // A summon's level is optional on SummonComp (a body summoned by non-champion
  // content has none), so `?? null` rather than a cast: an absent level is
  // UNREADABLE, not level 0, and level 0 would make 「等級 >= 1」 quietly false.
  const summon = world.summon.get(id);
  if (summon) return summon.level ?? null;
  return null;
}

/**
 * The number `stat` currently has on `id` under `mode`, or null when this body
 * has no such number at all.
 *
 * `percent` divides by the CURRENT maximum, so it tracks a maxHealth buff the
 * moment it lands — which is what 「血量低於 35%」 has to mean for an execute to
 * stay fair when the target grows.
 */
export function readConditionStat(
  world: SimWorld,
  id: EntityId,
  stat: ConditionStat,
  mode: "absolute" | "percent",
): number | null {
  if (stat === "hp" || stat === "mp") {
    const h = world.health.get(id);
    if (!h) return null;
    const cur = stat === "hp" ? h.hp : h.mana;
    if (mode === "absolute") return cur;
    const max = stat === "hp" ? h.maxHp : h.maxMana;
    // A body with no mana pool has no mana PERCENT — 0/0 is not "empty", it is
    // meaningless, and answering 0 would make 「魔力 < 20%」 true for every mob
    // in the game.
    if (!(max > 0)) return null;
    return cur / max;
  }
  if (stat === "level") return readLevel(world, id);

  const attr = PLAIN_TO_ATTR[stat];
  if (attr !== undefined) {
    // 「總」 — innate + growth + 能力屬性強化 picks + EQUIPMENT (`liveAttribute`
    // at basis "total", stats/attrSources.ts). A condition editor row labelled
    // 力量 has to mean the number the player's panel shows him, and the source
    // map agrees: its damage/condition formulas read
    // `GetHeroStatBJ(stat, u, true)` — bonuses INCLUDED. (The one place WC3
    // passes `false` is 獸化心靈's hidden ceiling, which is why the ceiling in
    // `effects/grantAttribute.ts` reads basis "base" and this does not.)
    // Nothing in the shipped catalogue moves: no item granted 三圍 before the
    // two legendary weapons that landed with this field, so total ≡ base for
    // every pre-existing condition.
    return liveAttribute(world, id, attr, "total");
  }

  const s = PLAIN_TO_STAT[stat];
  if (s === undefined) return null;
  const sc = world.stats.get(id);
  if (!sc) return null;
  return sc.final[s];
}

/** Is `id` a body of kind `is`? Four positive tests, no fallthrough. */
/**
 * 這一隻小怪**被算成英雄單位**嗎？（owner 2026-08-13 的兩格獨立欄位）
 *
 * ⚠️ 缺 `mobRules` 的世界（單元測試夾具、客戶端預測影子、#215 之前的存檔）
 * 一律 false —— 沒有小怪規則就沒有精英怪，也就沒有這個問題。
 *
 * 純度：讀兩個 Map + 兩個布林，沒有 rng、沒有時鐘、沒有 Map 迭代。
 */
function mobCountsAsChampion(world: SimWorld, id: EntityId): boolean {
  const mob = world.mob.get(id);
  if (mob === undefined) return false;
  const rules = world.mobRules;
  if (rules === null) return false;
  if (mob.kind === "special") return rules.special?.countsAsChampion ?? true;
  if (mob.kind === "boss") return rules.boss?.countsAsChampion ?? true;
  return false; // 一般殭屍永遠不是英雄單位
}

export function entityIsKind(world: SimWorld, id: EntityId, is: ConditionEntityKind): boolean {
  switch (is) {
    case "champion":
      // ⭐ owner 2026-08-13：「只能吃掉英雄，**特殊殭屍跟殭屍王可以被考慮是英雄
      //    單位**」，而且「**這兩個是獨立欄位，都要有**」。
      //
      // ⛔ 沒有把精英怪搬進 `world.champion` —— 那個 Map 是「有 ChampionComp 的
      //    身體」，一隻殭屍沒有背包、沒有座位、沒有技能欄，硬塞進去會讓每一個
      //    讀 `world.champion` 的地方（結算、排行、商店、復活圈）多出一個不存在
      //    的玩家。這裡回答的是**這一格條件**的問題，不是身分的問題。
      //
      // ⚠️ 兩格分開讀，⛔ 不共用一個布林：owner 明說是獨立欄位，
      //    「只讓殭屍王算英雄、特殊殭屍不算」必須寫得出來。
      // ⚠️ `?? true` 是預設啟動（第〇·六守則），⛔ 不是 `=== true`：
      //    一份沒有這格的舊 config 應該拿到他現在要的行為，不是舊行為。
      if (world.champion.has(id)) return true;
      return mobCountsAsChampion(world, id);
    case "mob":
      return world.mob.has(id);
    // ⭐ [EX∅ 根源]：`MobComp.kind` 是 spawn 時寫死、之後**永不變動**的那一格
    //（`sim/components.ts`），所以這兩顆葉子在一場比賽裡對同一具身體永遠是
    // 同一個答案 —— ⛔ 這不是缺點，是它們能當「逆轉條件」的原因。
    case "mobSpecial":
      return world.mob.get(id)?.kind === "special";
    case "mobBoss":
      return world.mob.get(id)?.kind === "boss";
    case "summon":
      return world.summon.has(id);
    case "guardian":
      return world.structure.has(id);
  }
}

/**
 * `id` 的背包裡有沒有符合 `leaf` 的道具？
 *
 * ⚠️ 讀的是**真的裝備欄** `ChampionComp.items`（6 格，`null` = 空），跟
 * `economy/itemSets.ts` 判斷「套裝湊齊了沒」讀的是同一個陣列 —— 所以買、賣、
 * 三選一免費發、傳說寶玉、撤銷一次購買，全部不必知道這顆葉子存在就會被看見。
 *
 * 沒有 `ChampionComp` 的身體（小兵一個都沒有）回 false，不是「跳過」（DECISION 2）。
 *
 * 純度：依索引走固定長度陣列 + 讀登錄表，沒有 Map 迭代順序、沒有 rng、沒有時鐘。
 */
export function hasEquipment(world: SimWorld, id: EntityId, leaf: EquipmentLeaf): boolean {
  const champ = world.champion.get(id);
  if (!champ) return false;
  for (let slot = 0; slot < champ.items.length; slot++) {
    const itemId = champ.items[slot];
    if (!itemId) continue;
    if (isEquipmentItemLeaf(leaf)) {
      if (itemId === leaf.itemId) return true;
      continue;
    }
    // 道具文件還沒註冊（白名單關掉、內容改壞）→ 它沒有 tags 可以比，就是不算。
    const def = Items.tryGet(itemId);
    if (def !== undefined && def.tags.includes(leaf.tag)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 推導的狀態 tag —— 「這一筆狀態實例真的在做什麼」
// ---------------------------------------------------------------------------

/**
 * ⭐ 決策（2026-08-08）：一個 tag 查詢同時看**兩個來源**。
 *
 *   (a) **宣告的** —— `status-effect@1.tags`，作者手寫在文件上的分類。
 *   (b) **推導的** —— 這一筆**真的掛上去的** {@link StatusEffect} 實例上的機制
 *       旗標（`stun` / `root` / `silenced` / `berserk` / `feared` /
 *       `moveSpeedMult` / `missChance` / 三格治療倍率）。
 *
 * ⛔ 只做 (a) 有一個**靜默失效**，而且它不是假設：出貨內容裡「暈眩」是**五份**
 * 不同文件（`stun` / `burnstun` / `fang-stun` / `ingredient` / `omnislash-lock`
 * / `trial-stun` 其實是六份），而 `applyStatus` 的 `stun: true` 寫在**技能**上，
 * 不在狀態文件上。所以一支技能完全可以拿一份**沒有標 `stun` tag** 的文件掛出
 * 一個貨真價實的暈眩 —— 畫面上兩者一模一樣，而「敵方暈眩時」那個條件查不到它。
 * 靠作者記憶補 tag 一定會漏（失敗形態 ②：算出來了，但這一半從沒送到）。
 *
 * (b) 讓「這個狀態會不會暈眩人」變成**事實**而不是**宣告**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 決策：**不加前綴**，兩個來源共用同一個命名空間
 *
 * 推導出來的 tag 就叫 `stun`、`slow`、`cc`，不是 `cc:stun`。理由是 owner 的用意
 * （2026-08-08）：「讓其他技能透過 **check tag 是否存在** 來交互延伸效果判斷」。
 * 寫卡的人問的是「他暈了沒」，他**不該需要知道**這個答案是文件宣告的還是實例
 * 推導的 —— 那是實作細節，而把它洩漏到內容裡等於逼每一張卡寫
 * `any:[宣告的, 推導的]`，也就是把這裡省下的那個洞原封不動搬到內容層。
 *
 * **撞名時會發生什麼**：一份宣告了 `stun` 的文件被 `stun: true` 掛上來 → 兩個
 * 來源都說是 → `hasStatusTag` 回 true。兩者是 **OR**，沒有計數、沒有堆疊，所以
 * 重複是**無害**的（這也是為什麼 (b) 可以安全地當成 (a) 的補網，而不是替代品）。
 *
 * ⚠️ 代價講清楚：作者**不能**用「不標 tag」來讓一個真的會暈人的狀態躲開
 * 「敵方暈眩時」的查詢。那是刻意的 —— 那種躲藏能力正是這一段要消滅的東西。
 * 真的需要一個「暈了但不算暈眩」的機制，那要的是一個**新的旗標**（於是它在下面
 * 這張表裡有自己的一行），不是一份少標一個字的文件。
 */
export interface DerivedStatusTagRule {
  /** 推導出來的 tag，跟 `status-effect@1.tags` 同一個命名空間（見上）。 */
  readonly tag: string;
  /** 這一筆實例符不符合。純函式，只讀那一格。 */
  readonly when: (s: StatusEffect) => boolean;
}

/**
 * 倍率的中性值。**`< 它` = 打折**（減速 / 禁療），**`> 它` = 加成**（加速）。
 *
 * ⚠️ 這個門檻是這張表裡最容易寫錯的一格，而錯法是**有方向的**：
 * `moveSpeedMult: 1.3` 的加速與 `0.7` 的減速在結構上長得一模一樣（`components.ts`
 * 的 `polarity` 註解為了同一個理由拒絕從欄位猜增益/減益）。用 `!== 1` 或
 * `!== undefined` 當門檻，會讓每一張加速卡都被標成 `slow`，於是「對減速中的敵人
 * 追加」在**幫隊友加速**的那一刻誤觸 —— 那是一個看不出來的錯誤。
 *
 * 1 而不是 0.999：倍率的單位就是「原本的幾倍」，等於 1 就是沒有改變它，
 * 這不是一個平衡數值（沒有人會想調它），所以它不進後台。
 */
export const DERIVED_NEUTRAL_MULT = 1;

/**
 * 失手率的「沒有」。**`> 它` 才算失手。**
 *
 * `missChance` 是 0..1 的機率（`components.ts`：攻擊者的失手，不是防禦者的閃避），
 * 而 `0` 同時是「這一格沒填」與「填了 0」的答案 —— 兩者都是「他沒有比較容易打空」，
 * 所以同一條線切得乾淨。用 `!== undefined` 當門檻會讓一份寫了 `missChance: 0` 的
 * 文件被標成 `miss`，那是一句假話。
 */
export const DERIVED_NO_MISS_CHANCE = 0;

/**
 * ⭐ **每一格 `StatusEffect` 都必須在這裡表態** —— 這是這張表最重要的性質，
 * 而它是一道**閘**不是一個判準：型別是
 * `Record<keyof StatusEffect, …>`，所以下一個往 `components.ts` 加旗標的人
 * **不加這裡的一行就 `pnpm typecheck` 回非零**。他不需要記得這張表存在。
 *
 * ⛔ 這正是「不要把推導表寫成一張會漂的手抄清單」的意思：一張 `Partial<>` 或一個
 * 裸物件字面值會在新旗標上架的那一天安靜地少一格，而少的那一格長得跟「這個旗標
 * 刻意不推導 tag」一模一樣。空陣列 `[]` 是一個**寫下來的決定**，缺一格不是。
 *
 * ⚠️ `cc` 這個 tag 的成員必須跟 `effects/applyStatus.ts` 的 `isCc` **一致**
 * （那是「免控擋不擋得掉」與「記不記 ccAppliedTicks」的同一個問題）。
 * 守衛在 `conditionDerivedStatusTag.test.ts`：它走出貨的 `applyStatus`，逐條
 * 把這裡標了 `cc` 的旗標打到一個免控的身體上，掛得上去就紅。
 * ⛔ 沉默**不在** `cc` 裡，那不是漏掉：`components.ts` 的 `silenced` 註解明說
 * 「暈眩是硬控（記 ccAppliedTicks、被免控攔），沉默不是」。
 */
export const STATUS_FIELD_TAGS: Readonly<
  Record<keyof StatusEffect, readonly DerivedStatusTagRule[]>
> = {
  // ── 身分與記帳：不是「它在做什麼」，一個 tag 都不推導 ──────────────────
  /** 哪一份文件。`statusId` 那顆葉子（{@link StatusIdLeaf}）已經在問這件事。 */
  statusId: [],
  /** 誰掛的。它回答的是歸屬，不是效果。 */
  sourceId: [],
  /** 到期。`hasStatusTag` 已經先用它篩過「這一 tick 還算不算」。 */
  expiresAtTick: [],

  // ── 硬控 / 失控：owner 那 90 支文案裡最常被問的一族 ────────────────────
  stun: [
    { tag: "stun", when: (s) => s.stun === true },
    { tag: "hard-cc", when: (s) => s.stun === true },
    { tag: "cc", when: (s) => s.stun === true },
  ],
  root: [
    { tag: "root", when: (s) => s.root === true },
    { tag: "cc", when: (s) => s.root === true },
  ],
  feared: [
    { tag: "fear", when: (s) => s.feared === true },
    { tag: "uncontrollable", when: (s) => s.feared === true },
    { tag: "cc", when: (s) => s.feared === true },
  ],
  /** 暴走拿走方向盤但**不算 CC**（自己給自己的增益，`sim/fear.ts` 決策 3）。 */
  berserk: [
    { tag: "berserk", when: (s) => s.berserk === true },
    { tag: "uncontrollable", when: (s) => s.berserk === true },
  ],
  /**
   * ⭐【繳械】S8 —— 打不出普通攻擊。`cc` 那一條**必須**與
   * `effects/applyStatus.ts` 的 `isCc` 一致（見這張表的檔頭）：繳械是敵人塞過來
   * 的純減益，免控擋得掉。⛔ 它不是 `hard-cc`（人還走得動、技能還放得出來）。
   */
  disarmed: [
    { tag: "disarm", when: (s) => s.disarmed === true },
    { tag: "cc", when: (s) => s.disarmed === true },
  ],
  /** 「不分敵我」是【混亂】唯一的那一格，所以它推導的就是那個名字。 */
  targetsAllies: [{ tag: "confusion", when: (s) => s.targetsAllies === true }],
  /** 沉默：不能放技能，但走得動也打得到 —— 所以有自己的 tag，不進 `cc`。 */
  silenced: [{ tag: "silence", when: (s) => s.silenced === true }],
  /** ⚠️ 兩個方向是**兩條規則**：加速不是減速的反面標籤，是另一件事。 */
  moveSpeedMult: [
    {
      tag: "slow",
      when: (s) => s.moveSpeedMult !== undefined && s.moveSpeedMult < DERIVED_NEUTRAL_MULT,
    },
    {
      tag: "cc",
      when: (s) => s.moveSpeedMult !== undefined && s.moveSpeedMult < DERIVED_NEUTRAL_MULT,
    },
    {
      tag: "haste",
      when: (s) => s.moveSpeedMult !== undefined && s.moveSpeedMult > DERIVED_NEUTRAL_MULT,
    },
  ],
  /**
   * 推導的是**族名** `miss`，不是【致盲】/【詛咒】那兩個**名字** ——
   * 出貨的兩份文件各自宣告了自己的名字（`blind` / `curse`）而**共用** `miss`，
   * 所以名字那一半本來就是文件的權力（`ggd-naming-layer`：改名不是缺陷）。
   * 從一個數字推導一個名字才是越權。
   */
  missChance: [
    {
      tag: "miss",
      when: (s) => s.missChance !== undefined && s.missChance > DERIVED_NO_MISS_CHANCE,
    },
    // ⭐ GH#1041（2026-09-06）：致盲／詛咒也是控場 —— `applyStatus.ts::isCc` 從這一天起認 `missChance>0`，
    //   `cc` 家族要跟它雙向一致（檔頭逐字：cc 的成員必須跟 isCc 一致）。
    {
      tag: "cc",
      when: (s) => s.missChance !== undefined && s.missChance > DERIVED_NO_MISS_CHANCE,
    },
  ],

  // ── 【重創】三格獨立倍率：任何一格打折都是「他被禁療了」 ──────────────
  healingTakenMult: [
    {
      tag: "antiheal",
      when: (s) => s.healingTakenMult !== undefined && s.healingTakenMult < DERIVED_NEUTRAL_MULT,
    },
  ],
  lifestealMult: [
    {
      tag: "antiheal",
      when: (s) => s.lifestealMult !== undefined && s.lifestealMult < DERIVED_NEUTRAL_MULT,
    },
  ],
  regenMult: [
    {
      tag: "antiheal",
      when: (s) => s.regenMult !== undefined && s.regenMult < DERIVED_NEUTRAL_MULT,
    },
  ],

  // ── 表態成「不推導」的那幾格，各自帶著理由 ────────────────────────────
  /**
   * 「怎麼結束」不是「它在做什麼」。一份會被打醒的標記可能是睡眠，也可能是
   * 任何一個作者想讓傷害打斷的標記 —— 從這一格推 `sleep` 是替內容取名字。
   * 睡眠要自己的 tag，就在它的文件上宣告一個。
   */
  breakOnDamage: [],
  /** 上面那一格的門檻。門檻不是第二個機制。 */
  breakOnDamageMin: [],
  /** 淨化拔不拔得掉 —— 那是**別人**能對它做什麼，不是它對身體做什麼。 */
  dispellable: [],
  /**
   * 增益還是減益。⛔ 刻意不推導成 `buff` / `debuff` tag：它已經是一格有自己
   * 讀者的欄位（`clearPools` 的極性過濾），再開一個 tag 等於同一件事有兩種問法，
   * 而兩種問法遲早分歧（`hasStatusTag` 與 `polarityPasses` 對「不知道」的處理
   * 本來就不同：這裡是 false，那裡是「不當成是」）。
   */
  polarity: [],
  /** 標記**帶的一個數字**（`spendMana.bankAs` 的存款）。一筆金額不是一個分類。 */
  magnitude: [],
  /**
   * 疊了幾層（GH#301-5）。⛔ 與 `magnitude` 同一個理由：**一個計數不是一個分類**。
   * 「他身上有幾層破甲」是一個數字問題，而 tag 回答的是「這是哪一族的東西」。
   * 想問層數的那一天，加的是一格數字比較（`statusStacks` 已經在
   * `effects/effectCommon.ts` 等著），不是一個 `stacked` tag —— 那會讓「1 層」與
   * 「12 層」在條件端變成同一件事。
   */
  stacks: [],
};

/**
 * 這一筆**實例**推不推得出 `tag`？（來源 (b)）
 *
 * 先比 `tag` 再跑謂詞，所以一次查詢只執行同名規則的那幾個閉包 —— 常見情況是 0
 * 或 1 個。走的是物件字面值的固定鍵序，沒有 Map 迭代、沒有 rng、沒有時鐘。
 */
export function statusInstanceHasTag(s: StatusEffect, tag: string): boolean {
  for (const rules of Object.values(STATUS_FIELD_TAGS)) {
    for (const rule of rules) {
      if (rule.tag === tag && rule.when(s)) return true;
    }
  }
  return false;
}

/**
 * `id` 身上**現在**有沒有一份帶著 `tag` 的狀態？
 *
 * ⚠️ 到期規則跟 `effects/effectCommon.ts` 的 `hasStatus` **逐字相同**
 * （`expiresAtTick > world.tick`），而且必須相同：`StatusSystem` 在 tick 開頭就
 * 把過期的清掉了，但它跑在技能結算**之前**，所以這裡的再檢查才是「這一 tick 到底
 * 還算不算」的真答案。
 *
 * ⛔ 這裡沒有轉呼叫 `hasStatus`，不是因為想要第二個答案，是因為**問的方向相反**：
 * `hasStatus` 拿著一個 id 去找，這裡拿著一個 tag，而「哪些 id 帶著這個 tag」只有
 * 走完身上這幾筆才知道。共用的是那條到期規則，而它就是上面那一行 —— 改到期語意
 * 的人請一起改這裡（`conditionStatusTag.test.ts` 走的是出貨的 `applyStatus`，
 * 所以到期算法變了它會紅）。
 *
 * 登錄表查不到（狀態文件還沒上架、骨架內容、單元測試沒註冊）→ 宣告的那一半沒有
 * tags 可以比，**但推導的那一半照常成立**（它讀的是實例，不是登錄表）。沒有
 * `StatusComp` 的身體回 false，不是「跳過」（DECISION 2）。
 *
 * ⭐ 兩個來源是 **OR**：文件宣告的 tag（{@link Statuses} → `status-effect@1.tags`）
 * 或這一筆實例推導出來的 tag（{@link STATUS_FIELD_TAGS}）。為什麼要兩個、為什麼
 * 不加前綴、撞名會怎樣，全部寫在 {@link DerivedStatusTagRule} 上面那一段。
 *
 * 純度：走一個陣列 + 讀登錄表 + 跑一組純謂詞。沒有 Map 迭代順序、沒有 rng、
 * 沒有時鐘。
 */
export function hasStatusTag(world: SimWorld, id: EntityId, tag: string): boolean {
  const st = world.status.get(id);
  if (!st) return false;
  for (const s of st.effects) {
    if (!(s.expiresAtTick > world.tick)) continue;
    // (a) 宣告的 —— 作者寫在狀態文件上的分類。
    const meta = Statuses.tryGet(s.statusId);
    if (meta?.tags?.includes(tag) === true) return true;
    // (b) 推導的 —— 這一筆實例真的帶著的機制旗標。作者漏標也查得到。
    if (statusInstanceHasTag(s, tag)) return true;
  }
  return false;
}

function compare(op: CompareOp, left: number, right: number): boolean {
  switch (op) {
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case "<":
      return left < right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
  }
}

// ---------------------------------------------------------------------------
// EVALUATION — the two phases of DECISION 1
// ---------------------------------------------------------------------------

/** WHO the two subjects resolve to for one evaluation. `target` may be absent. */
export interface ConditionContext {
  /** 我方 — the hook's owner / the effect's caster. Always present. */
  self: EntityId;
  /** 敵人 — the entity the event was about. Absent on entity-less events. */
  target?: EntityId;
}

function subjectOf(ctx: ConditionContext, s: ConditionSubject): EntityId | undefined {
  return s === "self" ? ctx.self : ctx.target;
}

/**
 * PHASE 1 — the ONLY rng in this file. Draws one `chance` per `chance` leaf, in
 * a fixed pre-order, regardless of what any other leaf will answer.
 *
 * Exported for the guard: `condition.test.ts` calls it directly to assert the
 * draw COUNT is a function of the tree alone.
 */
export function drawChances(
  cond: EffectCondition,
  rng: { chance(p: number): boolean },
  out: boolean[],
): void {
  if (isLeaf(cond)) {
    if (cond.kind === "chance") out.push(rng.chance(cond.p));
    return;
  }
  for (const child of childrenOf(cond)) drawChances(child, rng, out);
}

/** Cursor into the phase-1 draws. Mutable so the pre-order walk stays in step. */
interface RollCursor {
  readonly rolls: readonly boolean[];
  i: number;
}

/**
 * PHASE 2 — pure. Walks the SAME pre-order as {@link drawChances} and
 * DOES NOT SHORT-CIRCUIT (see DECISION 1): `ok = ok && evalNode(...)` would skip
 * children and desynchronise the cursor, so every child is evaluated into a
 * local first and combined afterwards.
 */
function evalNode(
  world: SimWorld,
  cond: EffectCondition,
  ctx: ConditionContext,
  cur: RollCursor,
): boolean {
  if (isAll(cond)) {
    let ok = true;
    for (const child of cond.all) {
      const r = evalNode(world, child, ctx, cur);
      ok = ok && r;
    }
    return ok;
  }
  if (isAny(cond)) {
    let ok = false;
    for (const child of cond.any) {
      const r = evalNode(world, child, ctx, cur);
      ok = ok || r;
    }
    return ok;
  }
  if (isNot(cond)) return !evalNode(world, cond.not, ctx, cur);

  if (cond.kind === "chance") {
    const v = cur.rolls[cur.i];
    cur.i++;
    // Phase 1 drew one per leaf, so this is unreachable; false rather than a
    // throw keeps a mid-match desync from becoming a crashed shard.
    return v ?? false;
  }
  if (cond.kind === "kind") {
    const id = subjectOf(ctx, cond.subject);
    if (id === undefined) return false;
    return entityIsKind(world, id, cond.is);
  }
  if (cond.kind === "status") {
    const id = subjectOf(ctx, cond.subject);
    if (id === undefined) return false;
    if (!isStatusIdLeaf(cond)) return hasStatusTag(world, id, cond.tag);
    // ⛔ `minStacks` 缺席時走的是**原本那一行**，不是 `statusStacks(...) >= 1`：
    // 兩者在今天等價，但 `hasStatus` 是「有沒有」的唯一定義，而層數是另一個問題。
    // 合成一行等於把兩個問題綁在一起，之後任何一邊改語意都會安靜地拖動另一邊。
    if (cond.minStacks === undefined) return hasStatus(world, id, cond.statusId);
    return statusStacks(world, id, cond.statusId) >= cond.minStacks;
  }
  if (cond.kind === "equipment") {
    const id = subjectOf(ctx, cond.subject);
    if (id === undefined) return false;
    return hasEquipment(world, id, cond);
  }
  if (cond.kind === "recentCast") {
    const id = subjectOf(ctx, cond.subject);
    if (id === undefined) return false;
    const at = isRecentCastAbilityLeaf(cond)
      ? lastCastTickOfAbility(world, id, cond.abilityId)
      : lastCastTickInSlot(world, id, cond.slot);
    // 「從來沒放過」與「放過但太久了」合流成同一個 false —— 而它們在型別上
    // 分得開（`null` vs 一個數字），所以這個合流是看得見的一行，⛔ 不是一次
    // 「sentinel 夠不夠負」的算術巧合（見 `castLedger.lastCastTickInSlot`）。
    if (at === null) return false;
    // ⭐ 絕對 tick 相減（CLAUDE.md 硬約束：⛔ 不用遞減計數器），而窗口在**讀的
    // 當下**才換算 —— 所以 tick 率或內容改了窗口長度，⛔ 不必回頭重寫紀錄。
    // ⚠️ `<=` 而不是 `<`：`withinSec` 是「幾秒內」，邊界那一 tick 要算在裡面。
    return world.tick - at <= Math.round(cond.withinSec / world.dt);
  }
  const id = subjectOf(ctx, cond.subject);
  if (id === undefined) return false;
  const mode = cond.mode ?? "absolute";
  const have = readConditionStat(world, id, cond.stat, mode);
  if (have === null) return false;
  // ⭐ G4 —— 右手邊 = `value + scale × 另一個讀數`。`other` 缺席 = 就是 `value`
  // = 今天。⚠️ 讀不到（沒有 target、對方沒有那一池）時整條葉子 **false**，
  // ⛔ 不是「當成 0 再比一次」—— 後者會讓「我的血比對方多」對著一個不存在的
  // 對手回 true，而那是最難查的那種：只在事件沒有 target 的那幾發上發生。
  let want = cond.value;
  if (cond.other !== undefined) {
    const otherId = subjectOf(ctx, cond.other.subject);
    if (otherId === undefined) return false;
    const read = readConditionStat(world, otherId, cond.other.stat ?? cond.stat, mode);
    if (read === null) return false;
    want += (cond.other.scale ?? 1) * read;
  }
  return compare(cond.op, have, want);
}

/**
 * Does this condition hold RIGHT NOW? `undefined` = no condition = true, which
 * is what every hook authored before this field existed means, so arming the
 * field is a strict no-op until content opts in.
 *
 * ⚠️ CONSUMES `world.rng` — exactly `conditionChanceCount(cond)` draws, always.
 * Call it once per decision, never twice for the same swing, and never from a
 * display/preview path (use {@link describeCondition} there).
 */
export function evaluateCondition(
  world: SimWorld,
  cond: EffectCondition | undefined,
  ctx: ConditionContext,
): boolean {
  if (cond === undefined) return true;
  const rolls: boolean[] = [];
  drawChances(cond, world.rng, rolls);
  return evalNode(world, cond, ctx, { rolls, i: 0 });
}

// ---------------------------------------------------------------------------
// EDITING A LEAF — the two repairs a dropdown UI cannot skip
// ---------------------------------------------------------------------------

/**
 * Point a stat leaf at a DIFFERENT stat, repairing `mode` and `value` so the
 * result is always authorable.
 *
 * WHY THIS LIVES IN SHARED AND NOT IN THE REACT COMPONENT. Two silent-corruption
 * paths run through this one transition and both are load-bearing:
 *
 *   1. 「目標生命 < 35%」 → switch the stat dropdown to 攻速. `percent` has no
 *      denominator there (DECISION 3), so the leaf is now UNPARSEABLE — the form
 *      looks fine and the save 422s, or worse, a laxer surface writes it through.
 *      This forces `mode: "absolute"`.
 *   2. The VALUE means something different on the other side of that switch:
 *      0.35 was 35 %, and as an absolute it is a third of one hit point, i.e. a
 *      gate that is false forever. Carrying it over would be a card that
 *      silently stopped working. It resets instead.
 *
 * Putting it here rather than inside the widget means the ADMIN port (#272) and
 * any future surface get the same repair, and — more to the point — that it is
 * testable against the real Zod schema instead of through a DOM.
 */
/**
 * ⭐ G4 —— 換屬性時**第二個運算元**怎麼搬。
 *
 * ⛔ 一律丟掉是**資料損失**：hp→mp 之後「我的 X 比對方的 X 低」仍然完全合法。
 * ⛔ 一律留著會做出**一張存不回去的卡**：`other.stat` 是資源屬性而葉子換成了
 * 攻速時，`zStatLeaf` 的兩個分支都不收它（那是 DECISION 3 的閘）。
 * ⚠️ `other.stat` 缺席 = **跟著左邊走**，所以它永遠合法，一定留著。
 *
 * ⚠️ 這裡是這個機制唯一的型別斷言，而它斷言的正是上一行那個**執行期等式**：
 * 「兩邊 `statSupportsPercent` 相同」就是「同族」的定義，TypeScript 追不進去。
 * ⛔ 拿掉那個檢查只留斷言 = 前一段講的那張存不回去的卡。
 */
function carryOperand<S extends ConditionStat>(
  other: ConditionOperand<ConditionStat> | undefined,
  stat: ConditionStat,
): { other?: ConditionOperand<S> } {
  if (other === undefined) return {};
  if (other.stat !== undefined && statSupportsPercent(other.stat) !== statSupportsPercent(stat)) {
    return {};
  }
  return { other: other as ConditionOperand<S> };
}

export function retargetStatLeaf(leaf: StatLeaf, stat: ConditionStat): StatLeaf {
  const mode = leaf.mode ?? "absolute";
  if (statSupportsPercent(stat)) {
    return {
      kind: "stat",
      subject: leaf.subject,
      stat,
      mode,
      op: leaf.op,
      value: leaf.value,
      ...carryOperand<ResourceStat>(leaf.other, stat),
    };
  }
  return {
    kind: "stat",
    subject: leaf.subject,
    stat,
    mode: "absolute",
    op: leaf.op,
    value: mode === "percent" ? 0 : leaf.value,
    ...carryOperand<PlainStat>(leaf.other, stat),
  };
}

/**
 * Switch a stat leaf between 絕對值 and 百分比, or return it UNCHANGED when the
 * stat does not admit percent. The value is clamped into the destination mode's
 * range for the same reason {@link retargetStatLeaf} resets it — 0.35 is a legal
 * percent and a nonsense absolute.
 */
export function setStatLeafMode(leaf: StatLeaf, mode: "absolute" | "percent"): StatLeaf {
  if (!statSupportsPercent(leaf.stat)) return leaf;
  // ⭐ G4 —— 這裡的 `other` **一定**留著：族沒有變（能走到這裡的葉子必是資源葉，
  // 而資源葉的 `other.stat` 也只收得到資源屬性），而且兩邊共用同一個 `mode`，
  // 所以切換絕對值/百分比對它是逐位元無害的。⛔ 跟著重建卻不複製 = 靜默丟掉
  // 作者剛設好的比較對象。（`carryOperand` 的同族檢查在這裡恆真，走它是為了
  // 讓那個斷言只存在一處。）
  const other = carryOperand<ResourceStat>(leaf.other, leaf.stat);
  if (mode === "percent") {
    const v = leaf.value < CONDITION_PERCENT_MIN ? CONDITION_PERCENT_MIN : leaf.value;
    return {
      kind: "stat",
      subject: leaf.subject,
      stat: leaf.stat,
      mode: "percent",
      op: leaf.op,
      value: v > CONDITION_PERCENT_MAX ? CONDITION_PERCENT_MAX : v,
      ...other,
    };
  }
  return {
    kind: "stat",
    subject: leaf.subject,
    stat: leaf.stat,
    mode: "absolute",
    op: leaf.op,
    value: 0,
    ...other,
  };
}

// ---------------------------------------------------------------------------
// THE VISIBLE HALF — 「條件一定要看得見」
// ---------------------------------------------------------------------------

const SUBJECT_LABEL: Record<ConditionSubject, string> = { self: "自己", target: "目標" };

const STAT_LABEL: Record<ConditionStat, string> = {
  hp: "生命",
  mp: "魔力",
  str: "力量",
  agi: "敏捷",
  int: "智力",
  ad: "攻擊力",
  ap: "法術強度",
  armor: "護甲",
  magicResist: "魔法抗性",
  moveSpeed: "移動速度",
  attackSpeed: "攻擊速度",
  level: "等級",
};

/** `==`/`!=` read badly in a tooltip; the other four are already the maths sign. */
const OP_LABEL: Record<CompareOp, string> = {
  ">=": "≥",
  "<=": "≤",
  ">": ">",
  "<": "<",
  "==": "=",
  "!=": "≠",
};

const KIND_LABEL: Record<ConditionEntityKind, string> = {
  champion: "英雄",
  mob: "小兵",
  summon: "召喚物",
  guardian: "守護者",
  mobSpecial: "特殊殭屍",
  mobBoss: "殭屍王",
};

/** Trim a ratio to a percent without trailing zeros: 0.35 → "35%", 0.125 → "12.5%". */
function pct(ratio: number): string {
  const v = ratio * 100;
  const rounded = Math.round(v * 100) / 100;
  return `${rounded}%`;
}

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/**
 * 狀態在句子裡怎麼稱呼它。**今天印的是編號**（`armor-break`），不是顯示名
 * （【破甲】），而這是一個知情的取捨，不是漏掉：
 *
 *   · sim 這一側的 `Statuses` 登錄表**只有 `polarity` 一格** ——
 *     `sim/content/defs.ts` 的 `StatusMeta` 檔頭明說那是刻意的，名字/圖示由
 *     UI 側的 `content/registries.ts` 的 `StatusEffects` 拿，而 `sim/**` 不
 *     import `content/**`（那條分層今天是乾淨的）。
 *   · 所以「印出【破甲】」需要的是**替 `StatusMeta` 加一格 `name` 並在
 *     `registries.ts` 註冊它**，那是另一條線的檔案，不是這顆葉子的事。
 *
 * ⚠️ 留成一支具名函式而不是把 `leaf.statusId` 直接塞進樣板字串，是為了讓那一
 * 天只要改這裡一行 —— 而且讓「卡片上是編號」是一件**看得見的、寫下來的**事，
 * 不是散落在字串裡的意外（#202 / #227 就是這個形態）。
 */
function statusLabel(statusId: StatusId): string {
  return statusId;
}

/** 「帶有…」那一句的受詞 —— 一份是【編號】，一類是【tag】類的狀態。 */
function statusMatchLabel(leaf: StatusLeaf): string {
  if (!isStatusIdLeaf(leaf)) return `【${leaf.tag}】類的狀態`;
  // ⛔ 層數一定要進句子：一張「疊到 5 層才引爆」的卡如果印成「帶有【破甲】」，
  // 那句文案對玩家與作者**兩邊**都是假的（#202 / #227 是同一個形態）。
  return leaf.minStacks === undefined
    ? `【${statusLabel(leaf.statusId)}】`
    : `${leaf.minStacks} 層以上的【${statusLabel(leaf.statusId)}】`;
}

/**
 * 道具在句子裡怎麼稱呼它 —— **印名字**（御雷劍），不是編號。
 *
 * ⚠️ 這一格跟 {@link statusLabel} 的取捨**故意相反**，而理由是可以查證的：
 * `StatusMeta`（`sim/content/defs.ts`）身上只有 `polarity`，**沒有 name**，所以
 * 狀態那一行印不出中文；`ItemDef` 有 `name`，而 `Items` 登錄表就在這一層
 * （`./registry`，同一個 import）。既然拿得到就要拿 —— 卡片上出現原始 id 是
 * 這個專案已經修過兩次的缺陷（#202 商店顯示 item ID、#227 大廳商店顯示 ID）。
 *
 * 登錄表沒註冊時（編輯器沙盒、道具還沒上架）退回 id：那是一個**看得出來**的
 * 退化（畫面上就是那串編號），不是一句假話。
 */
function itemLabel(itemId: ItemId): string {
  return Items.tryGet(itemId)?.name ?? itemId;
}

/** 「裝備了…」那一句的受詞 —— 一件是【名字】，一類是【tag】類的道具。 */
function equipmentLabel(leaf: EquipmentLeaf): string {
  return isEquipmentItemLeaf(leaf)
    ? `【${itemLabel(leaf.itemId)}】`
    : `【${leaf.tag}】類的道具`;
}

/**
 * 技能在句子裡怎麼稱呼它 —— **印名字**（者、皆、陣），⛔ 不是編號。
 * 與 {@link itemLabel} 逐字同一個取捨與同一個理由：`AbilityDef` 身上有 `name`，
 * 而 `Abilities` 登錄表就在同一個 import。登錄表沒註冊時退回 id ——
 * 那是一個**看得出來**的退化，⛔ 不是一句假話。
 */
function abilityLabel(abilityId: AbilityId): string {
  return Abilities.tryGet(abilityId)?.name ?? abilityId;
}

const SLOT_LABEL: Record<CastableSlot, string> = {
  Q: "Q",
  W: "W",
  E: "E",
  R: "終極技",
  EX: "EX 技能",
  PASSIVE: "天生技",
};

/** 「最近…施放過…」那一句的受詞 —— 一支是【名字】，一格是那顆按鈕。 */
function recentCastMatchLabel(leaf: RecentCastLeaf): string {
  return isRecentCastAbilityLeaf(leaf)
    ? `【${abilityLabel(leaf.abilityId)}】`
    : `${SLOT_LABEL[leaf.slot]}`;
}

function describeLeaf(leaf: ConditionLeaf): string {
  if (leaf.kind === "chance") return `${pct(leaf.p)} 機率`;
  if (leaf.kind === "recentCast") {
    // ⛔ 秒數一定要進句子：一張「1 秒內接上才有追加」的卡如果印成「最近施放過
    // X」，那句文案對玩家與作者**兩邊**都是假的（同 `statusMatchLabel` 的層數）。
    return `${SUBJECT_LABEL[leaf.subject]}在 ${num(leaf.withinSec)} 秒內施放過${recentCastMatchLabel(leaf)}`;
  }
  if (leaf.kind === "kind") return `${SUBJECT_LABEL[leaf.subject]}是${KIND_LABEL[leaf.is]}`;
  if (leaf.kind === "status") {
    return `${SUBJECT_LABEL[leaf.subject]}帶有${statusMatchLabel(leaf)}`;
  }
  if (leaf.kind === "equipment") {
    return `${SUBJECT_LABEL[leaf.subject]}裝備了${equipmentLabel(leaf)}`;
  }
  const who = SUBJECT_LABEL[leaf.subject];
  const what = STAT_LABEL[leaf.stat];
  const op = OP_LABEL[leaf.op];
  const percent = (leaf.mode ?? "absolute") === "percent";
  const konst = percent ? pct(leaf.value) : num(leaf.value);
  // ⭐ G4 —— 第二個運算元一定要進句子。少了它，「自己攻擊力 < 0」印在卡片上
  // 是一句**假話**（真正的閘是「< 目標攻擊力 ×0.8」），而那正是這個專案已經修過
  // 三次的形態（#202 / #227 / `statusMatchLabel` 的層數）。
  if (leaf.other === undefined) return `${who}${what} ${op} ${konst}`;
  const oWho = SUBJECT_LABEL[leaf.other.subject];
  const oWhat = STAT_LABEL[leaf.other.stat ?? leaf.stat];
  const scale = leaf.other.scale ?? 1;
  const term = scale === 1 ? `${oWho}${oWhat}` : `${oWho}${oWhat} ×${num(scale)}`;
  // 常數項為 0 是跨主體比較的常見寫法，這時候不要印出一個沒有意義的「0 +」。
  return leaf.value === 0
    ? `${who}${what} ${op} ${term}`
    : `${who}${what} ${op} ${term} + ${konst}`;
}

/**
 * The human sentence for a condition — 「目標不是英雄 且 目標生命 < 35%」.
 *
 * THIS IS NOT DECORATION, and it is not typed into any doc by hand. owner asked
 * for 「即時把條件翻成人話」 in the editor AND for the player to see it on the
 * card; both read THIS function, over THE SAME OBJECT the sim gates on. A
 * hand-written condition sentence is a comment, and comments lie (CLAUDE.md
 * 第三守則) — change the gate and every surface changes with it.
 *
 * `not` of a `kind` leaf is special-cased to 「目標不是英雄」 rather than
 * 「非（目標是英雄）」 because that exact phrase is the one the 獸矛 card has to
 * print, and 「非（…）」 around the single most common negation would read like a
 * machine translation of itself.
 */
export function describeCondition(cond: EffectCondition | undefined): string | null {
  if (cond === undefined) return null;
  return describeNode(cond, 0);
}

function describeNode(cond: EffectCondition, depth: number): string {
  if (isLeaf(cond)) return describeLeaf(cond);
  if (isNot(cond)) {
    const inner = cond.not;
    if (isLeaf(inner) && inner.kind === "kind") {
      return `${SUBJECT_LABEL[inner.subject]}不是${KIND_LABEL[inner.is]}`;
    }
    // 「沒有這個狀態」是這顆葉子**一半的用法**（79-03 反面、破甲未上時的分支），
    // 而 `not` 是它唯一的寫法（見 StatusLeaf 的說明）。所以它跟 `kind` 一樣要有
    // 自己的句子 —— 「非（目標帶有【破甲】）」把最常見的一句話寫成了機器翻譯。
    if (isLeaf(inner) && inner.kind === "status") {
      return `${SUBJECT_LABEL[inner.subject]}沒有${statusMatchLabel(inner)}`;
    }
    // 同理:「沒有裝備 X」是這顆葉子的另一半用法(而 `not` 是它唯一的寫法),
    // 「非（自己裝備了【御雷劍】）」把最常見的一句話寫成了機器翻譯。
    if (isLeaf(inner) && inner.kind === "equipment") {
      return `${SUBJECT_LABEL[inner.subject]}沒有裝備${equipmentLabel(inner)}`;
    }
    // 同理：「沒接上連續技」是這顆葉子的另一半用法（窗口關著時走另一條分支），
    // 而 `not` 是它唯一的寫法。「非（自己在 1 秒內施放過【者、皆、陣】）」
    // 把最常見的一句話寫成了機器翻譯。
    if (isLeaf(inner) && inner.kind === "recentCast") {
      return `${SUBJECT_LABEL[inner.subject]}在 ${num(inner.withinSec)} 秒內沒有施放過${recentCastMatchLabel(inner)}`;
    }
    return `非（${describeNode(inner, depth + 1)}）`;
  }
  const joiner = isAll(cond) ? " 且 " : " 或 ";
  const kids = isAll(cond) ? cond.all : cond.any;
  const body = kids.map((k) => describeNode(k, depth + 1)).join(joiner);
  // Only parenthesise NESTED groups: the top-level sentence should read as prose,
  // an inner one has to bind visibly or 「A 且 B 或 C」 is ambiguous.
  return depth === 0 || kids.length < 2 ? body : `（${body}）`;
}

/**
 * The condition sentence prefixed for a card/tooltip — 「觸發條件：…」 — or null.
 * One helper so the ability tooltip, the item card and the codex cannot drift
 * into three different prefixes for the same fact.
 */
export function conditionLabel(cond: EffectCondition | undefined): string | null {
  const s = describeCondition(cond);
  return s === null ? null : `觸發條件：${s}`;
}

/**
 * Every distinct condition sentence a hook-carrying doc holds, in authored
 * order, de-duplicated — what a shop card / skill tooltip prints.
 *
 * Structural parameter type so ONE function serves both sides of the content
 * boundary (the loaded doc and the registered def), exactly like
 * `itemRequirementLabels`.
 */
export function hookConditionLabels(def: {
  passive?: readonly { condition?: EffectCondition }[];
  auras?: readonly { hooks?: readonly { condition?: EffectCondition }[] }[];
}): string[] {
  const out: string[] = [];
  const push = (c: EffectCondition | undefined): void => {
    const s = conditionLabel(c);
    if (s !== null && !out.includes(s)) out.push(s);
  };
  for (const h of def.passive ?? []) push(h.condition);
  for (const a of def.auras ?? []) for (const h of a.hooks ?? []) push(h.condition);
  return out;
}

/**
 * The same list for an ABILITY, whose hooks are nested one level deeper
 * (`passive.ranks[N].hooks[]` plus each rank's `auras[].hooks[]`).
 *
 * ⚠️ WALKS EVERY RANK, NOT JUST THE LEARNED ONE. A tooltip is read BEFORE the
 * point is spent, and a gate that only appears at rank 3 is exactly the thing a
 * player needs to know while deciding whether to spend there. Dedup collapses
 * the common case where every rank carries the identical gate.
 *
 * Structural parameter type, like `itemRequirementLabels` — one function for the
 * loaded `AbilityDoc` and the registered `AbilityDef`.
 */
export function abilityConditionLabels(def: {
  passive?: {
    ranks: readonly {
      hooks?: readonly { condition?: EffectCondition }[];
      auras?: readonly { hooks?: readonly { condition?: EffectCondition }[] }[];
    }[];
  };
}): string[] {
  const out: string[] = [];
  const push = (c: EffectCondition | undefined): void => {
    const s = conditionLabel(c);
    if (s !== null && !out.includes(s)) out.push(s);
  };
  for (const rank of def.passive?.ranks ?? []) {
    for (const h of rank.hooks ?? []) push(h.condition);
    for (const a of rank.auras ?? []) for (const h of a.hooks ?? []) push(h.condition);
  }
  return out;
}

/**
 * ⭐⭐ **`ratios[].when` 的求值器工廠**（2026-09-03，GH#937 的前提回驗挖出來的）。
 *
 * ⛔⛔ 量到的缺口：`resolveScaling` 的第五參 `holds` 是 **fail-CLOSED**
 * （檔頭那張表逐字：`when` 有而 `holds` 沒有 ⇒ **不計入**），
 * ⭐ 而全 repo **零個 production 呼叫點傳它** ——
 * ⇒ ⭐⭐ GH#936／#944 落地的四筆條件式係數在遊戲裡**永遠是 0**。
 *
 * ⚠️ ⭐ 而它**測不出來**：內容在、schema 收、`resolveScaling` 有那一行、
 * 四條守衛全綠 —— ⭐ 那正是失敗形態⑧（消費端存在，但它消費不到）。
 *
 * ⭐ 為什麼是工廠而不是讓 `resolveScaling` 自己查：
 * ⛔ `effects/effect.ts` 不可以 import 這個檔 —— **這個檔已經 import 它了**
 * （`hasStatus` / `statusStacks` 走 `effects/effectCommon`）⇒ 那是一個環，
 * 而同型的環在這個 repo 炸過三次（`zRef` / `zCastableSlot` / `PULSE_MS`）。
 * ⇒ ⭐ **依賴注入**：呼叫端（有 `ctx` 的那 9 個 effect handler）把它傳進去。
 *
 * ⚠️ ⭐ 顯示／預覽路徑**刻意不傳** —— 它們沒有 world 可問，
 * 而 fail-closed 在那裡是誠實的答案：「**保證拿得到的那一份**」。
 */
export function scalingOracle(
  world: SimWorld,
  self: EntityId,
  target?: EntityId,
): (cond: EffectCondition) => boolean {
  return (cond) => evaluateCondition(world, cond, { self, target });
}
