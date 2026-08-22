import { z } from "zod";
import { zId } from "../common";

/**
 * config.augment-filter@1 — 稜彩增益卡的敵方過濾器全域覆寫（批 1 決策點 1-1）。
 *
 * 目前只有一格:**殭屍算不算 `HookDef.victim: "enemyChampion"` 的敵人**。
 * 語意、owner 的裁決、以及「為什麼它不是一顆單一的全域布林」全部寫在
 * `sim/augmentEnemyFilter.ts`。
 *
 * 出貨值 `false` ＝ 字面語意 ＝ 這個欄位出現之前的行為，所以這份文件出現本身
 * **不改變任何一場比賽**（同 `config.shield@1`、與 `config.block@1` 相反）。
 *
 * 為什麼是自己一份文件而不是塞進 `config.combat-env@1`:那一份是**數值倍率
 * 表**（每一格都是一個 number，Go 平台 `apps/platform/internal/combatenv` 有一份
 * key 對 key 的鏡射，`keysync_test.go` 在守），塞一個 boolean 進去等於同時改
 * 三個語言的形狀。也不塞 `config.arena-rules@1`:那一份講的是**場地**（火圈、
 * 花、守衛塔、殭屍波），而這一格講的是**卡片文案怎麼解釋「敵」這個字**。
 *
 * **缺文件 = 出貨預設**，不是空表 —— 一個 `undefined` 的布林今天剛好等於
 * `false`，但那是巧合不是設計，而下一格（predicate 反過來的那種）不會這麼幸運。
 */
export const zConfigAugmentFilterDoc = z
  .object({
    id: zId,
    schema: z.literal("config.augment-filter@1"),
    note: z.string().optional(),
    /**
     * 打開之後，`victim: "enemyChampion"` 的 hook 也把敵對陣營的**小怪（殭屍）**
     * 算成合格目標。`"allyChampion"` 不受影響，`"enemy"` 本來就收。
     *
     * ⚠️ 它**不會**讓殭屍長出 `StatsComp`，所以掛在殭屍身上的 buff/status 照樣
     * 是靜默 no-op —— 這一格救得到的是「效果掛在自己身上」的那一族卡。
     */
    mobsCountAsEnemy: z.boolean(),
  })
  .strict();
export type ConfigAugmentFilterDoc = z.infer<typeof zConfigAugmentFilterDoc>;
