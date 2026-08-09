/**
 * 具名標記的**作者面 schema** —— `sim/marks.ts` 的 `MarkSpec` 在內容層的樣子。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼 `markId` 不是 `zRef(...)`
 *
 * owner 2026-08-08：「都可以任意替換設定為 **[技能編號/buff/debuff狀態]**」。
 * 所以一個標記的身分可能來自 `abilities`（`godie-hapm.passive`）**或**
 * `status-effects`（`berserk`）—— 兩個不同的 collection。
 *
 * `zRef` 的 target 是**單一**字串（`common.ts:33-43`，描述字串 `ref:<一個名字>`），
 * 沒有「二選一」這一格。硬綁其中一邊的代價是可量的：
 *   · 綁 `abilities` → 每一份用 buff 當標記的文件都是一筆 dangling ref
 *     （soft ref 會 WARN，於是 REFERENCES 表天天在喊狼來了）；
 *   · 綁 `status-effects` → 十二道試煉本身就違規。
 * 兩種都會逼作者改用「另一個 collection 的假文件」來繞過，而那正是 owner
 * 這句話要避免的東西。
 *
 * 所以這裡用 {@link zId}（**格式**驗證：小寫、`.` `_` `-`、≤64 字），
 * 不帶 ref 中繼資料。存在性由 sim 端「找不到就是一個沒有名字的計數器」承接，
 * 而那是無害的 —— 標記的機制不依賴那份文件，只有**顯示**依賴它。
 * ⚠️ 這是刻意的取捨：多 collection 的 ref 哪天做出來了，這一格就該換過去。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② 界限一律 import 常數，不抄字面值
 *
 * 上下界住在 `sim/markLimits.ts`（一份表兩個消費端：這裡的 Zod + sim 的夾取）。
 * 抄字面值進來 = 第三個住處，而它沒有守衛（CLAUDE.md 第零守則⑦）。
 */
import { z } from "zod";
import { ModOp } from "../../sim/stats/modifiers";
import {
  MARK_DURATION_PERMANENT,
  MARK_MAX_COUNT,
  MARK_MAX_DURATION_SEC,
  MARK_MAX_PER_STACK_VALUE,
  MARK_MIN_DURATION_SEC,
} from "../../sim/markLimits";
import type { MarkSpec } from "../../sim/marks";
import { zId, zStatModifier } from "./common";
import { zDamageType, zEffectDef, HOOK_INTERNAL_COOLDOWN_MAX_SEC } from "./effect";
import { SPREAD_MAX_RADIUS } from "../../sim/effects/spreadLimits";

/** 層數欄位共用的形狀：整數、非負、上界 = 打錯一個零的守衛。 */
const zMarkCount = z.number().int().min(0).max(MARK_MAX_COUNT);

/**
 * 「每失去一層」給的永久加成，單根 modifier。
 *
 * 絕對值上界 {@link MARK_MAX_PER_STACK_VALUE} 擋的是「0.1 打成 10」——
 * 一層就把人變成神的錯字。⚠️ **允許負值**：「每失去一層永久降低移速」是一個
 * 合法設計，不該由這一行否決。
 *
 * `capRaise` 跳過：它的 `value` 是「把上限抬到多少」，不是「給多少」——
 * 拿量級去量它是在比較兩種單位（同 GH#286 在 `refineItemModifierBand` 的推導）。
 */
export const zMarkPerStackModifier = zStatModifier.superRefine((m, ctx) => {
  if (m.op === ModOp.CapRaise) return;
  if (Math.abs(m.value) > MARK_MAX_PER_STACK_VALUE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["value"],
      message:
        `每失去一層的加成 ${m.stat} ${m.op} ${m.value} 超出 ±${MARK_MAX_PER_STACK_VALUE} —— ` +
        `這個量級通常是小數點打錯（0.1 寫成 10），而它會在第一層就結束一場比賽`,
    });
  }
});

/**
 * 「這個標記是一張免死牌」。缺席 = 純計數標記（風王結界 / 縮地），
 * 在傷害管線上完全不存在。逐欄語意見 `sim/combat/lethalSave.ts` 檔頭③。
 */
export const zMarkLethalRule = z
  .object({
    /** 一次免死消耗幾層。 */
    consume: z.number().int().min(1).max(MARK_MAX_COUNT),
    /**
     * 救活後留下最大生命的幾成（0 < x ≤ 1）。
     *
     * 不能是 0：那等於「救活成 0 血」，下一格 deathSystem 照樣把人判死，
     * 於是一層標記被燒掉而玩家什麼都沒拿到（失敗形態②）。
     */
    surviveHpPct: z.number().gt(0).max(1),
    /**
     * 對哪些傷害型別生效。**必填、明列**。
     *
     * 「真傷能不能被免死」= 這個陣列裡有沒有 `"true"`，**不是程式裡的一個分支**。
     * `.min(1)`：空陣列會讓這張免死牌永遠不觸發，而文件看起來設定完整。
     */
    damageTypes: z.array(zDamageType).min(1),
    /**
     * 內部冷卻（秒）。⚠️ 不要填 0：一次 AoE 在同一 tick 打出多發封包是常態
     * （`damageArea` 就是），0 會讓十二層在一次爆炸裡全部蒸發。
     */
    internalCooldown: z.number().min(0).max(HOOK_INTERNAL_COOLDOWN_MAX_SEC),
    /** 救活的同一刻落在**自己**身上的效果（無敵 / 回復）。 */
    selfEffects: z.array(zEffectDef),
    /** 救活的同一刻落在**周圍敵人**身上的效果（擊退 / 暈眩）。 */
    aoeEffects: z.array(zEffectDef),
    /**
     * `aoeEffects` 的半徑（GGD 單位）。**0 = 不做 AoE**（sim 端直接跳過）。
     * 上界沿用其他作者面半徑的同一個天花板，理由也一樣：擋 mis-parse，
     * 不是平衡政策。
     */
    aoeRadius: z.number().min(0).max(SPREAD_MAX_RADIUS),
  })
  .strict()
  .superRefine((r, ctx) => {
    // 寫了效果卻沒有半徑 = 那批效果永遠不會跑（`lethalSave.ts:162` 的
    // `aoeRadius > 0` 閘）。技能看起來設定好了，場上什麼都不會發生。
    if (r.aoeEffects.length > 0 && r.aoeRadius <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aoeRadius"],
        message: "有 aoeEffects 就一定要有 aoeRadius > 0 —— 否則那批效果永遠不會被執行",
      });
    }
  });

/** 內容層宣告一個具名標記。mirrors `MarkSpec` in `sim/marks.ts`。 */
export const zMarkSpec = z
  .object({
    /** 借用哪一份既有文件當身分（技能編號 或 status-effect id）。見檔頭①。 */
    markId: zId,
    /** 進場時發幾層。0 是合法的（「打中才給」）。 */
    initial: zMarkCount,
    /** 疊到幾層封頂 —— `grantMark` 加不過這個數。 */
    max: zMarkCount,
    /**
     * 每一層自己活多久（秒）。**`-1` = 永久**（{@link MARK_DURATION_PERMANENT}）。
     *
     * ⚠️ 這一根跟 `resetOn` 是**兩根獨立的軸**：這裡管「自己什麼時候消失」，
     * `resetOn` 管「回合邊界要不要補回來」。十二道試煉是 `-1` + `"match"`。
     */
    durationSec: z.number().min(MARK_DURATION_PERMANENT).max(MARK_MAX_DURATION_SEC),
    /**
     * 回合邊界怎麼處理它：
     *   · `"match"` 跨回合共享 —— 一場發一次，用掉就是用掉了（十二道試煉）；
     *   · `"round"` 每回合補回 `initial`；
     *   · `"never"` 從不自動補，只有內容明寫 `grantMark` 才會長回來。
     * ⚠️ 三者都**不會**還原 `perStackLost` 累積的永久加成 —— 那是照文案的「永久」。
     */
    resetOn: z.enum(["match", "round", "never"]),
    /**
     * ⭐ 軸③【隨回合】(GH#304，owner 2026-08-09「疊層可能會隨回合增加/減少」)
     * —— 每一個回合開始時 **±N**。省略／0 = 回合邊界不動它（＝這一格出現之前
     * 的每一份文件）。
     *
     * ⚠️ 與 `resetOn: "round"` **互斥**（下面的 refine 擋）：一個「每回合補回
     * 12 層」又「每回合 -1」的計數器沒有可以寫出來的語意，而執行期靜默挑一邊
     * 就是 CLAUDE.md 失敗形態④（斷言方向跟缺陷無關的那一族）。
     * `resetOn: "match"` / `"never"` 配 `roundDelta` 才是這條軸的正常寫法：
     * 「跨回合共享的那 12 層，每回合自己掉 1 層」。
     *
     * 界共用 `MARK_MAX_COUNT`（±999）——「一個計數器一次最多動幾層」與
     * 「最多疊幾層」是同一個問題的兩半，抄第二個數字就是第四個住處。
     */
    roundDelta: z
      .number()
      .int()
      .min(-MARK_MAX_COUNT)
      .max(MARK_MAX_COUNT)
      .optional(),
    /**
     * 每**失去**一層永久獲得的加成（累計，不會隨層數加回而倒退）。
     * 省略 / 空陣列 = 沒有這個機制。
     */
    perStackLost: z.array(zMarkPerStackModifier).optional(),
    /** 讓這個標記變成一張免死牌。省略 = 純計數標記。 */
    lethal: zMarkLethalRule.optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    // ⚠️ 半 tick 以下的持續時間會 `Math.round` 成 **0 tick**，標記掛上去的同一
    // 瞬間就過期，玩家永遠拿不到（失敗形態②）。`(-1, MIN)` 這整段區間都要拒絕，
    // 因為 `-1` 是哨兵而不是「一個很小的秒數」—— `.min(-1)` 一個人擋不住 0.01。
    if (
      s.durationSec !== MARK_DURATION_PERMANENT &&
      s.durationSec < MARK_MIN_DURATION_SEC
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationSec"],
        message:
          `durationSec 只能是 ${MARK_DURATION_PERMANENT}（永久）或 ` +
          `≥ ${MARK_MIN_DURATION_SEC} 秒（一個 tick）—— ${s.durationSec} 秒不到半個 tick，` +
          `標記會在掛上去的同一瞬間過期，玩家永遠看不到它`,
      });
    }
    // ⭐ 軸③的互斥閘。兩個都填 = 兩條相反的回合政策，執行期一定要挑一邊挑，
    // 而挑哪一邊都是一個沒有人看得出來的靜默決定。
    if (s.resetOn === "round" && s.roundDelta !== undefined && s.roundDelta !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roundDelta"],
        message:
          `resetOn:"round"（每回合補回 initial）與 roundDelta(${s.roundDelta})（每回合 ±N）` +
          `是兩條相反的回合政策，只能擇一 —— 要「跨回合共享而且每回合自己掉層」` +
          `請把 resetOn 改成 "match" 或 "never"`,
      });
    }
    // 靜默夾取的另一半：`installMark` 走 `Math.min(initial, max)`，所以
    // `initial: 12, max: 5` 會安靜地變成 5 層，而文件寫著 12。
    if (s.initial > s.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initial"],
        message: `initial(${s.initial}) 不可以大於 max(${s.max}) —— 執行期會安靜地夾成 max`,
      });
    }
  });

/**
 * 編譯期對齊：schema 解出來的東西必須直接餵得進 sim 的 `MarkSpec`。
 * 這一行不產生執行期成本，但任何一邊改了欄位名就會在 `tsc` 紅。
 */
export type MarkSpecDoc = z.infer<typeof zMarkSpec>;
const _markSpecCompat: (s: MarkSpecDoc) => MarkSpec = (s) => s;
void _markSpecCompat;
