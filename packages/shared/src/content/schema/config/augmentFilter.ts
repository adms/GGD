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
    mobsCountAsEnemy: z.boolean().describe(
      "@zh 殭屍算不算「敵方英雄」\n" +
      "@note 關著（出貨值）＝ 照字面：只有敵方**英雄**會觸發那些卡，殭屍潮裡一層都不疊。打開＝敵對陣營的殭屍也算，於是「打到敵人就疊一層」那一族卡在殭屍波裡會**非常快**滿層（一波三十隻）—— 那正是它要不要打開的全部：你想要那些卡在 PvE 段落也有存在感，還是想讓它們專門獎勵打人。⚠️ 它只影響寫 `enemyChampion` 的 hook；寫 `enemy` 的本來就收殭屍，寫 `allyChampion` 的永遠不受影響。",
    ),
  })
  .strict()
  // ⭐ 文件層的人話也住這裡（GH#992）：後台那一頁由 `specFromZod()` 整份推導。
  .describe(
    "@title 增益卡敵方過濾\n" +
    "@intro 稜彩增益卡上寫「敵方英雄」的那些 hook，在**殭屍波**裡到底算不算數。第 3 場之後場上最多的東西就是殭屍，所以這一格決定了那一族卡片在半個遊戲裡活不活。\n" +
    "@intro 真正的表達方式是**每張卡自己選**（那張卡的 hook 寫 `victim: \"enemy\"` 就連殭屍一起收，`\"enemyChampion\"` 只收敵方英雄）。這一頁是**全域覆寫**，給你打完一場覺得某一族卡太廢／太肥時現場翻一次，不用逐張改文件。\n" +
    "@intro ⚠️ 打開它**不會**讓殭屍長出屬性表，所以「對敵人上 debuff」那一類卡片還是打不到殭屍身上。它救得到的是效果掛在**自己**身上的那一族：疊層、充能、打到人就回血。\n" +
    "@intro ⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/augment-filter.json`** —— 線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。\n" +
    "@consumer packages/shared/src/sim/effects/hooks.ts 的 victimPasses()（每一次 hook 派發都會呼叫，讀 world.augmentEnemyFilter.mobsCountAsEnemy）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.augmentEnemyFilter\n" +
    "@effect **要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 格擋規則／護盾規則 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格。",
  );
export type ConfigAugmentFilterDoc = z.infer<typeof zConfigAugmentFilterDoc>;
