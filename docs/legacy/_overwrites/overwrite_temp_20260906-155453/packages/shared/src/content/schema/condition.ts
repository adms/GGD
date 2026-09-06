/**
 * `condition@1` — the Zod mirror of `sim/content/condition.ts`'s
 * {@link EffectCondition}, i.e. the AUTHORING surface of the 觸發條件 system.
 *
 * TWO THINGS THIS FILE IS RESPONSIBLE FOR THAT A PLAIN MIRROR WOULD NOT BE:
 *
 * 1. ⭐ IT IS WHERE 「percent 只在有分母的屬性上開放」 IS *ENFORCED*, NOT DESCRIBED.
 *    `zStatLeaf` is a UNION of two shapes — the resource shape (hp/mp) which
 *    accepts `mode:"percent"`, and the plain shape whose `mode` is the literal
 *    "absolute" — so `{stat:"attackSpeed", mode:"percent"}` is a PARSE ERROR at
 *    content-load time and a red field in the console. A single object with a
 *    free `mode` plus a comment saying 「攻速沒有百分比」 would have been a
 *    comment, and comments lie (CLAUDE.md 第三守則).
 *
 * 2. ⭐ IT BOUNDS BOTH ENDS OF EVERY NUMBER. `value` is range-checked AGAINST
 *    THE MODE — a percent is a 0..1 ratio, an absolute is 0..1e6 — which is the
 *    only reason 「35」 typed where 「0.35」 was meant fails loudly instead of
 *    becoming a gate that is true for every living body. (`validateField` before
 *    2026-07-29 checked only `min`; this schema is what stops that class of bug
 *    reaching the sim.)
 *
 * DEPTH IS CAPPED, AND WITH A REAL WALK RATHER THAN A LAZY-RECURSION LIMIT.
 * `z.lazy` recursion has no natural floor, and an unbounded tree would reach the
 * evaluator, the describer AND the editor's renderer. {@link zEffectCondition}
 * therefore parses recursively and then runs ONE `superRefine` over the parsed
 * value that rejects anything past `CONDITION_MAX_DEPTH`, reusing
 * `conditionDepth` from the sim module so the two cannot drift.
 */
import { z } from "zod";
import type { AbilityId, ItemId, StatusId } from "../../ids";
// ⭐⭐ **兩條 lane 的合併（2026-09-02）—— 兩邊都對而且互補。**
//
// · GH#937（Lane A）：槽位那一格**共用既有的** `zCastableSlot`，⛔ 不是在這裡再寫
//   一份六個字串的 enum —— 兩份會在第七格出現的那天分歧，而分歧的樣子是
//   「這顆葉子收得下的槽位，跟 `scopeSlot` 收得下的不一樣」，⛔ 沒有任何東西會紅。
// · GH#936（Lane B）：`zRef` 從 **`./ref`** 拿，⛔ 不是 `./common` ——
//   `common.ts` 反過來需要這個檔的 `zEffectCondition`（`zScaling.ratios[].when`），
//   走 `./common` 就是一條**會炸**的 import 迴圈（實測 `TypeError: zRef is not a function`）。
//   理由與實測寫在 `ref.ts` 的檔頭；閘是 `schemaImportCycle.test.ts`。
//
// ⚠️ ⛔ 這裡**不可以**用 `--ours`／`--theirs` 解 —— 任一邊都會吃掉另一條 lane
// 的成果，⭐ 而且**不會有東西紅**（CLAUDE.md 記過那個形狀）。
import { zCastableSlot, zRef } from "./ref";
import {
  RECENT_CAST_WITHIN_MAX_SEC,
  RECENT_CAST_WITHIN_MIN_SEC,
  EQUIPMENT_TAG_MAX_LEN,
  EQUIPMENT_TAG_MIN_LEN,
  CONDITION_ABSOLUTE_MAX,
  CONDITION_ABSOLUTE_MIN,
  CONDITION_CHANCE_MAX,
  CONDITION_CHANCE_MIN,
  CONDITION_DISTANCE_MAX,
  CONDITION_DISTANCE_MIN,
  CONDITION_ENTITY_KINDS,
  CONDITION_MAX_CHILDREN,
  CONDITION_MAX_DEPTH,
  CONDITION_PERCENT_MAX,
  CONDITION_PERCENT_MIN,
  CONDITION_SCALE_MAX,
  CONDITION_SCALE_MIN,
  COMPARE_OPS,
  PLAIN_STATS,
  RESOURCE_STATS,
  STATUS_TAG_MAX_LEN,
  STATUS_TAG_MIN_LEN,
  conditionDepth,
  type EffectCondition,
} from "../../sim/content/condition";
// `minStacks` 的上界與 `applyStatus.stacks` **同一份表**（`sim/markLimits.ts`），
// 所以「寫得進去」與「問得出來」在結構上不可能各自漂移到不同的天花板。
import { MARK_MAX_COUNT } from "../../sim/markLimits";

/** Turn a readonly string list into the non-empty tuple `z.enum` demands. */
function enumOf<T extends string>(values: readonly T[]): z.ZodEnum<[T, ...T[]]> {
  return z.enum([values[0]!, ...values.slice(1)] as [T, ...T[]]);
}

export const zConditionSubject = z.enum(["self", "target"]);
export const zCompareOp = enumOf(COMPARE_OPS);
export const zResourceStat = enumOf(RESOURCE_STATS);
export const zPlainStat = enumOf(PLAIN_STATS);
export const zConditionEntityKind = enumOf(CONDITION_ENTITY_KINDS);

/**
 * 機率 leaf. `p` is a RATIO like every other probability in the codebase
 * (`HookDef.chance`, `Stat.CritChance`, `Stat.Lifesteal`), so 0.01 is the 獸矛
 * hero-execute roll and 1 is 「一定」.
 */
export const zChanceLeaf = z
  .object({
    kind: z.literal("chance"),
    p: z.number().min(CONDITION_CHANCE_MIN).max(CONDITION_CHANCE_MAX),
  })
  .strict();

/**
 * ⭐ GH#354 / G4 —— 比較式右手邊的**第二個運算元**（`value + scale × 那個讀數`）。
 *
 * 兩個分支各自帶一份，⛔ 不是一份共用的：`stat` 必須跟左手邊**同一族**
 *（資源 vs 一般），而 Zod 表達「同族」的方式就是把它放進各自那一格的 enum ——
 * 一份共用的 `other` 會讓 `{stat:"hp", mode:"percent", other:{stat:"attackSpeed"}}`
 * 通過解析，而那個比較沒有意義（mode 對右手邊不適用），⛔ 而且在編輯器裡看起來
 * 完全正常。這跟 `zStatLeaf` 自己用 union 表達 DECISION 3 是同一個路數。
 */
function operandOf<T extends string>(stat: z.ZodEnum<[T, ...T[]]>) {
  return z
    .object({
      subject: zConditionSubject,
      stat: stat.optional().describe("讀哪一個屬性。留空 = 跟左邊比的是同一個。"),
      scale: z
        .number()
        .min(CONDITION_SCALE_MIN)
        .max(CONDITION_SCALE_MAX)
        .optional()
        .describe("乘上去的倍率，留空 = 1。「比對方少兩成」寫 0.8。"),
    })
    .strict()
    .describe(
      "跟另一個讀數比，而不是跟一個固定數字比（右手邊 = 這個讀數 × 倍率 + 上面那個數字）。" +
        "⭐ 這是「比較自身與目標」那一族唯一的寫法。",
    );
}

/** hp/mp — the only two stats with a maximum, so the only two offering `percent`. */
export const zResourceStatLeaf = z
  .object({
    kind: z.literal("stat"),
    subject: zConditionSubject,
    stat: zResourceStat,
    mode: z.enum(["absolute", "percent"]),
    op: zCompareOp,
    value: z.number(),
    other: operandOf(zResourceStat).optional(),
  })
  .strict()
  .superRefine((leaf, ctx) => {
    const [lo, hi] =
      leaf.mode === "percent"
        ? [CONDITION_PERCENT_MIN, CONDITION_PERCENT_MAX]
        : [CONDITION_ABSOLUTE_MIN, CONDITION_ABSOLUTE_MAX];
    if (leaf.value < lo || leaf.value > hi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message:
          leaf.mode === "percent"
            ? `百分比是 0..1 的比例（35% 要寫 0.35），收到 ${leaf.value}`
            : `絕對值必須在 ${lo}..${hi} 之間，收到 ${leaf.value}`,
      });
    }
  });

/**
 * Everything else. `mode` is the LITERAL "absolute" (optional) — that literal is
 * the enforcement of DECISION 3, and the reason a `percent` on 攻速 cannot be
 * authored at all rather than being silently reinterpreted.
 */
export const zPlainStatLeaf = z
  .object({
    kind: z.literal("stat"),
    subject: zConditionSubject,
    stat: zPlainStat,
    mode: z.literal("absolute").optional(),
    op: zCompareOp,
    value: z.number().min(CONDITION_ABSOLUTE_MIN).max(CONDITION_ABSOLUTE_MAX),
    other: operandOf(zPlainStat).optional(),
  })
  .strict();

export const zStatLeaf = z.union([zResourceStatLeaf, zPlainStatLeaf]);

/** 「目標不是英雄」 is `not` of this — every kind test is POSITIVE (DECISION 2). */
export const zKindLeaf = z
  .object({
    kind: z.literal("kind"),
    subject: zConditionSubject,
    is: zConditionEntityKind,
  })
  .strict();

/**
 * 「某個主體身上有某個狀態」—— owner 2026-08-08 那 90 支文案裡擋住最多支的
 * 一顆（至少 12 支：燃燒 / 破魔 / 破甲 / 恐懼 / 致盲 / 混亂 / 狂怒 …）。語意、
 * 為什麼共用 `subject`、以及為什麼「沒有」只走 `not` 而不多開一個欄位，全部
 * 寫在 `sim/content/condition.ts` 的 `StatusLeaf`。
 *
 * ⭐ `statusId` 是 **soft ref**，和 `applyStatus.statusId` / `damage.comboBonus`
 * 逐字相同。這一格不是隨手選的：條件端用 hard ref 而施加端用 soft，會長出
 * 「這個狀態掛得上去、卻寫不出一條讀它的條件」的不對稱，而那個不對稱從 schema
 * 上讀不出來，只有作者在後台被擋下來的那一刻才會發現。
 *
 * ⭐ **兩個分支各只帶一格**（`statusId` ＝這一份 / `tag` ＝這一類），而且都
 * `.strict()` —— 形狀跟同一檔的 `zEquipmentLeaf` 與 `zStatLeaf` 逐字一樣，不是
 * 第三套寫法。`{statusId, tag}` 兩格一起寫**兩個分支都不收**，所以「且？或？」
 * 這個沒有人定義過的語意在後台是當場紅一格，而不是安靜地由求值端替作者決定。
 * 為什麼需要「這一類」（暈眩在出貨內容裡是**五份**文件）寫在
 * `sim/content/condition.ts` 的 {@link StatusIdLeaf}。
 *
 * ⚠️ `statusId` 沒有數字，所以沒有上下界要訂；界由 `zRef` 底下的 `zId` 給
 * （≤64 字、限定字元集）。`tag` 不是 ref（`status-effect@1.tags` 是自由字串，
 * 沒有集合可以指），所以它自己要帶上下界 —— 見 `STATUS_TAG_MIN_LEN` / `MAX_LEN`。
 */
export const zStatusIdLeaf = z
  .object({
    kind: z.literal("status"),
    subject: zConditionSubject,
    statusId: zRef<StatusId>("status-effects", { soft: true }),
    /**
     * ⭐ 「至少疊了幾層」（GH#301-5 的**讀取端**）。缺席 = 只問有無 ——
     * 出貨的 2,030 份文件一份都沒寫，所以缺席那一條路逐字等於這一格出現之前。
     *
     * ⛔ 沒有這一格的話 `applyStatus.stacks` 是**只寫不讀**的：層數存進
     * `StatusEffect.stacks`、`statusStacks()` 讀得出來，而**沒有任何內容問得到它**
     * —— 那就是 CLAUDE.md 的失敗形態②（算出來了但沒人拿得到）。owner #299 第 8 條
     * 要的是「狀態除了『有無』也要是**數字**層數」，而一個比較不出來的數字仍然只是有無。
     *
     * ⚠️ **只掛在「這一份」那個分支，不掛在 `tag` 分支**：「【破甲】類的狀態合計
     * 幾層」沒有人定義過（三份不同的破甲各 2 層算 6 層還是 2 層？），而這個檔案
     * 的規矩就是把沒定義過的語意做成 PARSE ERROR，不是讓求值端替作者決定。
     *
     * 上界共用 `sim/markLimits.ts` 的 `MARK_MAX_COUNT`（與 `applyStatus.stacks`
     * 同一份表）；下界是 1，因為「≥0 層」對每一個身體都成立，那不是一個閘。
     */
    minStacks: z.number().int().min(1).max(MARK_MAX_COUNT).optional(),
  })
  .strict();

export const zStatusTagLeaf = z
  .object({
    kind: z.literal("status"),
    subject: zConditionSubject,
    tag: z.string().min(STATUS_TAG_MIN_LEN).max(STATUS_TAG_MAX_LEN),
  })
  .strict();

export const zStatusLeaf = z.union([zStatusIdLeaf, zStatusTagLeaf]);

/**
 * 「某個主體身上裝備了某件／某類道具」—— 77-002 御雷劍那一張卡的閘。
 * 語意、為什麼是 UNION（同一張卡同時說了「某類」與「御雷劍」）、為什麼「類」
 * 讀 `tags` 而不是 `tier`、以及為什麼沒有「幾件」，全部寫在
 * `sim/content/condition.ts` 的 {@link EquipmentItemLeaf}。
 *
 * ⭐ **兩個分支各只帶一格**，而且都 `.strict()` —— 這才是「兩格一起寫」被擋下來
 * 的地方。寫成一個物件配兩個 optional 欄位加一句註解，那句註解就是 CLAUDE.md
 * 第三守則講的那種註解：`{itemId, tag}` 會安靜地解析成功，然後由求值端替作者
 * 決定哪一格贏。這裡它是 PARSE ERROR，後台當場紅一格。
 * （形狀跟同一檔的 `zStatLeaf` 逐字一樣，不是第二套寫法。）
 *
 * ⚠️ `itemId` 是 **soft ref**，跟 `zStatusLeaf.statusId` 同一個理由：御雷劍那一
 * 族的道具文件今天還沒進 `content/items/`，硬 ref 會讓「條件寫得出來」被「道具
 * 還沒上架」擋住。上下界由 `zRef` 底下的 `zId` 給（≤64 字、限定字元集）。
 * `tag` 不是 ref（`ItemDef.tags` 是自由字串，沒有集合可以指），所以它自己要帶
 * 上下界 —— 見 `EQUIPMENT_TAG_MIN_LEN` / `MAX_LEN`。
 */
export const zEquipmentItemLeaf = z
  .object({
    kind: z.literal("equipment"),
    subject: zConditionSubject,
    itemId: zRef<ItemId>("items", { soft: true }),
  })
  .strict();

export const zEquipmentTagLeaf = z
  .object({
    kind: z.literal("equipment"),
    subject: zConditionSubject,
    tag: z.string().min(EQUIPMENT_TAG_MIN_LEN).max(EQUIPMENT_TAG_MAX_LEN),
  })
  .strict();

export const zEquipmentLeaf = z.union([zEquipmentItemLeaf, zEquipmentTagLeaf]);

/**
 * 「最近 N 秒內施放過某技能」—— 連續技窗口（GH#937）。
 *
 * ⭐ **兩個分支各只帶一格**（`abilityId` ＝這一支 / `slot` ＝那一格），而且都
 * `.strict()` —— 形狀跟同一檔的 `zStatusLeaf` / `zEquipmentLeaf` 逐字一樣，
 * ⛔ 不是第三套寫法。`{abilityId, slot}` 兩格一起寫**兩個分支都不收**，所以
 * 「且？或？」這個沒有人定義過的語意在後台是當場紅一格，⛔ 而不是安靜地由求值
 * 端替作者決定。
 *
 * ⚠️ `abilityId` 是 **soft ref**，跟 `statusId` / `itemId` 同一個理由（條件寫得
 * 出來，⛔ 不被「那支技能還沒上架」擋住）；`slot` 的界由 `./common` 的
 * `zCastableSlot` 給 —— ⭐ 與 `scopeSlot` **同一份** enum，⛔ 不是第二份。
 *
 * ⚠️ `withinSec` **兩端都有界**（第一守則：⛔ 不是只有下界）。下界是一個 tick 的
 * 秒數 —— `0` 寫得進去的話那是一個永遠為假的閘（第一·五守則的空宣稱）。
 * 兩個界與求值端共用 `sim/content/condition.ts` 的同一對常數，⛔ 不是抄過來的
 * 兩個數字。
 *
 * ⛔ 為什麼**沒有** `tag` 分支：`ability@1` 今天沒有 `tags`
 * （2026-09-02 量到：出貨 421 份技能文件零份有這一格）。開一個比對不到任何東西
 * 的分支就是「卡面說了但不會發生」—— 見 `RecentCastSlotLeaf` 的說明。
 */
export const zRecentCastAbilityLeaf = z
  .object({
    kind: z.literal("recentCast"),
    subject: zConditionSubject,
    abilityId: zRef<AbilityId>("abilities", { soft: true }),
    withinSec: z
      .number()
      .min(RECENT_CAST_WITHIN_MIN_SEC)
      .max(RECENT_CAST_WITHIN_MAX_SEC)
      .describe("窗口幾秒內接上算數。1 = 前一招放完一秒內按下去才有追加。"),
  })
  .strict();

export const zRecentCastSlotLeaf = z
  .object({
    kind: z.literal("recentCast"),
    subject: zConditionSubject,
    slot: zCastableSlot.describe("哪一格按鈕。R = 終極技，對全體英雄一次寫成。"),
    withinSec: z
      .number()
      .min(RECENT_CAST_WITHIN_MIN_SEC)
      .max(RECENT_CAST_WITHIN_MAX_SEC)
      .describe("窗口幾秒內接上算數。1 = 前一招放完一秒內按下去才有追加。"),
  })
  .strict();

export const zRecentCastLeaf = z.union([zRecentCastAbilityLeaf, zRecentCastSlotLeaf]);

export const zConditionLeaf = z.union([
  zChanceLeaf,
  zStatLeaf,
  zKindLeaf,
  zStatusLeaf,
  zEquipmentLeaf,
  zRecentCastLeaf,
]);

/**
 * The recursive tree. `.min(1)` on both group arrays is load-bearing: an empty
 * `all` is vacuously TRUE and an empty `any` vacuously FALSE, and either one is
 * a card that silently stopped meaning what its author thought — exactly the
 * 「內容刪掉時測試不是失敗，是根本不存在」 shape. Making it unauthorable is
 * cheaper than detecting it later.
 */
/**
 * ⚠️ 第三個型別參數（INPUT）是 `unknown`，不是 `EffectCondition`。
 *
 * `zStatusLeaf.statusId` 走 `zRef<StatusId>`，而 `zRef` 的**輸入是沒有品牌的
 * `string`**、輸出才是 `StatusId` —— 那正是每一份從磁碟讀進來的 JSON 的形狀。
 * 把 INPUT 也釘成 `EffectCondition` 等於宣稱「餵進來的東西已經是加好品牌的」，
 * 而 `safeParse(未知的 JSON)` 這個唯一的真實用法從來不是那樣，union 也因此整個
 * 賦值不上去。
 */
const zConditionInner: z.ZodType<EffectCondition, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    zConditionLeaf,
    z.object({ all: z.array(zConditionInner).min(1).max(CONDITION_MAX_CHILDREN) }).strict(),
    z.object({ any: z.array(zConditionInner).min(1).max(CONDITION_MAX_CHILDREN) }).strict(),
    z.object({ not: zConditionInner }).strict(),
  ]),
);

/**
 * The authorable condition. Depth-capped — see the header for why the cap is a
 * post-parse walk rather than a recursion limit.
 */
export const zEffectCondition: z.ZodType<
  EffectCondition,
  z.ZodTypeDef,
  unknown
> = zConditionInner.superRefine(
  (cond, ctx) => {
    const d = conditionDepth(cond);
    if (d > CONDITION_MAX_DEPTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `條件巢狀深度 ${d} 超過上限 ${CONDITION_MAX_DEPTH}`,
      });
    }
  },
);
