/**
 * `config.practice@1` —— 練習模式（GH#343，owner 2026-08-17：
 * 「新增練習模式，可以選擇場地及角色，但進入不會有對戰，可以使用各種功能測試碼
 *  （之前做過），以及即時生成殭屍等特殊單位」）。
 *
 * ⭐ 為什麼是一份 config 而不是幾個常數（第一守則）：練習房的每一格都是**決策點**
 * ——「時間到要不要被踢回商店」「殭屍要不要自己來」「火圈要不要燒」「死了要不要
 * 自己站起來」「一次生幾隻」。這五題沒有一題有客觀正解，而它們正是 owner 用起來
 * 之後第一批會想改的東西。寫死＝每改一次要重新部署一次映像。
 *
 * ⚠️ **這是 HOST 規則，不是 sim 規則**，所以解析器住在這裡而不是 `sim/`：
 * 練習房是「相位機要不要推進 / 要不要配對手 / 要不要復活」的問題，`SimWorld`
 * 從頭到尾不知道自己在不在練習房。唯一穿進 sim 的是 `autoMobWaves`，而它是
 * 透過既有的 `MobRules.autoWaves` 一格布林走進去的（見 `sim/mobs.ts`）。
 *
 * ⚠️ 出貨預設**不改變今天任何一場比賽**：一間房只有在被明確開成練習房時
 * （`MatchRoomOptions.practice`）才會拿到這份規則，其餘 `resolvePracticeRules`
 * 一律回 `null` ＝ 一個字都沒變。`enabled` 是總開關（把整個功能一鍵關掉），
 * 其餘四格的預設值選的是「**練習房裡最有用**」的那一個，不是「最像正式賽」。
 */
import { z } from "zod";

/** `config.practice@1` 的文件 id（與檔名 `content/config/practice.json` 對齊）。 */
export const PRACTICE_DOC_ID = "practice";

/**
 * 一次「生怪」指令最多生幾隻的**保險絲**上界。
 *
 * ⛔ 這不是平衡意見，是誤讀保險絲（同 #277 的口徑）：50 打成 500 會讓一個練習房
 * 在一 tick 內把自己打死，而那看起來會像伺服器壞掉而不是像手滑。真正的上限仍然
 * 是 `MobRules.maxAlivePerZone`（每個 zone 同時存活數），生怪指令一定吃它。
 */
export const PRACTICE_SPAWN_BATCH_MAX = 50;

export const zConfigPracticeDoc = z
  .object({
    id: z.literal(PRACTICE_DOC_ID),
    schema: z.literal("config.practice@1"),
    note: z.string().optional(),
    enabled: z
      .boolean()
      .describe(
        "練習模式的總開關。false = 大廳按了練習模式也只會開出一間普通的房" +
          "（有對手、時間到就結算、測試碼照舊只在 dev 開）—— 也就是這個功能出現" +
          "之前的行為，所以它就是一鍵 rollback。⚠️ 它**不影響**任何一場正式比賽：" +
          "一間房要先被開成練習房才會讀到這份文件。",
      ),
    endlessCombat: z
      .boolean()
      .describe(
        "練習房的戰鬥階段**永遠不結束**。true（出貨值）＝ 進去就一直待在場上，" +
          "不會因為時間到或場上只剩一隊而被踢回商店 —— 這是「進入不會有對戰」" +
          "那句話真正的機制。false ＝ 照正常回合流程跑（沒有對手所以第一 tick 就" +
          "結算完進中場），適合拿來測商店與三選一的接線。",
      ),
    autoMobWaves: z
      .boolean()
      .describe(
        "排程的殭屍波要不要自己來。false（出貨值）＝ 場上乾淨，殭屍**只由生怪" +
          "指令**產生，所以要測一隻特定的怪不會被一整波蓋掉。true ＝ 連波次排程" +
          "一起開，用來看「一波一波湧進來」在這張場地上長什麼樣子。" +
          "⚠️ 兩種模式下生怪指令都能用：練習房一律把小怪規則表備妥。",
      ),
    fireRing: z
      .boolean()
      .describe(
        "火圈要不要點燃。false（出貨值）＝ 不燒，因為練習房沒有「把回合逼到結束」" +
          "這件事要做，而一個會慢慢燒死你的沙盒沒辦法拿來慢慢看特效。" +
          "true ＝ 照這張場地的火圈設定走，用來確認縮圈半徑與燒傷節奏。",
      ),
    autoRevive: z
      .boolean()
      .describe(
        "自己倒下之後要不要自動站起來。true（出貨值）＝ 下一 tick 就滿血復活，" +
          "所以測到一半被自己召來的殭屍王打死不會讓整場練習卡住。" +
          "false ＝ 照正常規則（要隊友來復活圈救，而練習房沒有隊友），" +
          "適合拿來測死亡表演與觀戰畫面。",
      ),
    spawnBatch: z
      .number()
      .int()
      .min(1)
      .max(PRACTICE_SPAWN_BATCH_MAX)
      .describe(
        "生怪指令**沒有指定數量**時，一次生幾隻。⚠️ 它是預設值不是上限：真正的" +
          "天花板是小怪波設定裡的「每區同時存活上限」，生怪指令撞到就停，" +
          "所以這一格調大不會讓練習房被自己生出來的怪淹掉。",
      ),
  })
  .strict();

export type ConfigPracticeDoc = z.infer<typeof zConfigPracticeDoc>;

/**
 * 一間**練習房**的規則。`null` 的意思是「這不是練習房」——⛔ 不是「練習房但全關」，
 * 那兩件事在 `MatchController` 裡走的是完全不同的路。
 */
export interface PracticeRules {
  endlessCombat: boolean;
  autoMobWaves: boolean;
  fireRing: boolean;
  autoRevive: boolean;
  spawnBatch: number;
}

/**
 * 出貨預設 —— 也是單元測試與骨架開機唯一會拿到的那一份。
 * ⚠️ 這裡的值必須與 `content/config/practice.json` 逐格相同（drift 測試在守）。
 */
export const DEFAULT_PRACTICE_RULES: PracticeRules = {
  endlessCombat: true,
  autoMobWaves: false,
  fireRing: false,
  autoRevive: true,
  spawnBatch: 3,
};

/**
 * **唯一**決定「這間房是不是練習房、規則是什麼」的地方。
 *
 * ⚠️ 兩個條件是 AND，而且刻意合在**一支**函式裡：房間側問「使用者要開練習房嗎」，
 * 內容側問「這個功能有沒有被總開關關掉」。分成兩處判斷，就會出現「房間以為自己是
 * 練習房、控制器以為不是」那種只有在線上才看得到的半開狀態。
 *
 * @param isPracticeRoom 房間**伺服器端**解析出來的身分。⛔ 不可以是客戶端訊息裡的
 *   旗標 —— 客戶端說自己是練習房不算數（見 `cheatGate.ts` 的檔頭）。
 */
export function resolvePracticeRules(isPracticeRoom: boolean, doc: unknown): PracticeRules | null {
  if (!isPracticeRoom) return null;
  const parsed = zConfigPracticeDoc.safeParse(doc);
  // 文件不存在 / 壞掉 → 用出貨預設繼續開練習房。fail-open 是刻意的（練習房不碰
  // 經濟與排名，一份壞文件不該讓「我想去打樁」整個失效），而它**不是靜默的**：
  // 這條路只有在 content 已經整份載入失敗的情況下才走得到，而那件事本身已經被
  // `/healthz` 的 `content.ok` 大聲說出來了。
  if (!parsed.success) return { ...DEFAULT_PRACTICE_RULES };
  if (!parsed.data.enabled) return null;
  return {
    endlessCombat: parsed.data.endlessCombat,
    autoMobWaves: parsed.data.autoMobWaves,
    fireRing: parsed.data.fireRing,
    autoRevive: parsed.data.autoRevive,
    spawnBatch: parsed.data.spawnBatch,
  };
}
