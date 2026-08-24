import { z } from "zod";
import { zId } from "../common";

/**
 * config.roster@1 — **哪些英雄已經下架**（owner 2026-08-02:「預設不應該再有」）。
 *
 * ── 為什麼這是一份文件而不是一張寫死的表 ─────────────────────────────────
 *
 * 前例是 `championForms.ts` 的 `CHAMPION_FORM_PAIRS`：那也是一條「這隻不可以被
 * 選」的規則，而它寫死在 TS 裡。下架**不一樣** —— 它是 owner 的內容裁決，會隨
 * 內容補完而改變（今天下架是因為技能沒做完，做完就該上架），寫死等於每改一次
 * 主意就要 rebuild + 重啟容器。`content/` 是 host 上的 live bind-mount，
 * 這一份存檔就生效。CLAUDE.md 第一守則。
 *
 * ── 為什麼不是白名單就好 ─────────────────────────────────────────────────
 *
 * ⚠️ 白名單**擋不住這件事**，兩個洞：
 *   ① 平台連不上時客戶端退到 `NO_FILTER`（champSelectFilter 的 `NO_FILTER`），
 *      **整份 119 隻全開**。localhost 與任何一次平台故障都走這條，
 *      而我們的試玩幾乎都在 localhost —— 也就是白名單那一格在我們自己看得到的
 *      環境裡永遠是 no-op。
 *   ② 伺服器端 `CurationWhitelist.bypass` 同理。
 * 而且白名單是**營運狀態**（後台勾選、可被一鍵重設覆蓋），下架是**內容事實**。
 * 一個手滑的勾選不應該把技能名字全是 `"none"` 的半成品放回選人畫面。
 * 所以這條規則刻意放在白名單**之外**，兩邊都擋。
 *
 * ── 出貨的兩隻 ───────────────────────────────────────────────────────────
 *
 * `godie-e00u` 十六夜Sakuya 與 `godie-u01f` 黑化張飛：各 5 支技能裡有 **4 支
 * `name: "none"`**（QWER 全部），也就是選到就是四格空技能。owner 2026-07-30
 * 說下架，2026-08-02 再確認一次「預設不應該再有」。
 */
export const zConfigRosterDoc = z
  .object({
    id: zId,
    schema: z.literal("config.roster@1"),
    note: z.string().optional(),
    /**
     * 已下架的英雄 id。這些 id **不會**出現在選人畫面、大廳英靈殿、商店英雄列，
     * 隨機也抽不到，伺服器直接拒絕，**不管白名單是什麼狀態**。
     *
     * ⚠️ 這裡放的是 id 不是名字：名字有 19 組重複（變身對），用名字會誤傷本體。
     * ⚠️ 空陣列 = 沒有人下架，是合法且有意義的狀態（全部上架）。
     */
    retiredChampions: z.array(z.string()),
    /**
     * 隱藏英雄 id：**隨機抽得到、手動選不到**（彩蛋）。
     *
     * ⚠️ 與上面那一格（`retiredChampions` 下架）的差別是**擋幾條路**：
     * 下架把手動與隨機兩條路都擋掉，隱藏只擋手動那一條 —— 所以一位隱藏英雄
     * 仍然會出現在別人的隨機結果裡，那正是「彩蛋」的定義。
     * 缺席時的退路是 {@link DEFAULT_HIDDEN_CHAMPIONS}。
     *
     * ⚠️ **必須 `.optional()`**：`config.roster@1` 線上已經有耐久覆蓋層（後台存過
     * 就有），一份存於這個欄位出現之前的 override 少了必填欄就會整份被 Zod 退回
     * → 內容載入失敗 → fail-open 退回 2 隻骨架英雄。那是 2026-08-02 兩次事故的
     * 形狀，不要再走一次。
     */
    hiddenChampions: z
      .array(z.string())
      .optional()
      .describe(
        "隱藏英雄 id：**隨機抽得到、手動選不到**（彩蛋）。" +
          "⚠️ 與 retiredChampions 的差別是後者手動與隨機兩條路都擋。",
      ),
    /**
     * 殭屍/小兵的外觀池要不要包含隱藏英雄。**出貨 `false`（＝不包含）。**
     *
     * ⭐ owner 2026-08-17 開 GH#348 時問的是「**要不要一格開關**」，⇒ 這就是那一格。
     * 預設值是我挑的（依 owner 2026-08-23 常設指令：「沒做完以前別問我了自己判斷
     * 但是**留後台開關可以簡易 rollback**」），理由：⭐ 彩蛋的價值在「第一次遇到」，
     * 而殭屍是**每一場、每一回合**都在刷的東西 —— 一位隱藏英雄的臉出現在雜兵身上，
     * 玩家在自己抽到他之前就已經看膩了，那個彩蛋當場就沒了。
     *
     * ⛔ 這一格**不影響**玩家自己的 🎲 隨機（`autoPickAndSpawn`）——
     * owner 2026-08-17 逐字：「隱藏角色**可以隨機到** 但不能選到」，那條路照舊。
     * 兩條路在 2026-08-24 之前共用同一個 `randomChampionPool()`，這一格把它們分開。
     *
     * ⚠️ **必須 `.optional()`**：理由同 `hiddenChampions`（線上已有耐久覆蓋層）。
     */
    hiddenChampionsInMobPool: z
      .boolean()
      .optional()
      .describe(
        "殭屍/小兵的外觀池要不要包含隱藏英雄。⛔ 出貨關（彩蛋的價值在第一次遇到，" +
          "而殭屍每回合都在刷）。⚠️ 與玩家自己的 🎲 隨機無關 —— 那條路一律抽得到。",
      ),
  })
  .strict();

/** 出貨值：殭屍**不**穿隱藏英雄的皮（GH#348）。 */
export const DEFAULT_HIDDEN_CHAMPIONS_IN_MOB_POOL = false;

/**
 * 出貨的隱藏名單 —— **空的**。
 *
 * ⛔ 缺欄位（舊 override）與空陣列是**同一個意思**：沒有人被藏起來。
 * 兩者刻意不分家，因為「未設定」與「設定成空」在這個機制上沒有可觀測差異，
 * 而多一種狀態就是多一條沒有人測的路。
 */
export const DEFAULT_HIDDEN_CHAMPIONS: readonly string[] = [];
export type ConfigRosterDoc = z.infer<typeof zConfigRosterDoc>;
