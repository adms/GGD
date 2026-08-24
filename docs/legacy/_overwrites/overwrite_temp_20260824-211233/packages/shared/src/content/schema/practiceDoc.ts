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

/**
 * 練習靶最多幾個（GH#657）。⭐ **5**，照 owner 那張票的「靶子數量（0–5）」。
 *
 * ⚠️ 一支隊伍只有 `TEAM_SIZE`（3）個座位，所以 4、5 兩個靶會落到**第二支**敵隊。
 * 那不是缺陷：練習房沒有配對，「哪一隊」在這間房裡只決定「誰是敵人」，
 * 而 1 隊與 2 隊對玩家（0 隊）都是敵人。
 */
export const PRACTICE_DUMMY_MAX = 5;

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
    dummyCount: z
      .number()
      .int()
      .min(0)
      .max(PRACTICE_DUMMY_MAX)
      .describe(
        "練習房開場站幾個**靶子**（敵方英雄，⛔ 不移動 ⛔ 不普攻 ⛔ 不施放技能）。" +
          "3（出貨值）＝ owner 明說的「練習模式預設對方三個英雄」。" +
          "0 ＝ 對面空著，也就是這個功能出現之前的練習房 —— 它就是一鍵 rollback。" +
          "⚠️ 靶子是**完整的英雄實體**（有血條、有護甲、吃傷害、掛得上狀態），" +
          "所以量到的傷害數字與正式比賽一致。",
      ),
    dummyFightsBack: z
      .boolean()
      .describe(
        "靶子要不要**還手**。關掉（出貨值）＝ 站著不動被打不還手，這是「靶子」" +
          "這兩個字的全部意思。開著＝ 靶子拿的是一般的 bot 大腦，會走位、會普攻、" +
          "會施放技能 —— 也就是**今天的 vs bot 行為**，所以這一格是「我想要會動的" +
          "對手」時的切換，⛔ 不是另一種靶子。",
      ),
    dummyChampionId: z
      .string()
      .max(64)
      .describe(
        "每個靶子固定用**哪一隻**英雄。空字串（出貨值）＝ 每個各自隨機抽（和 bot " +
          "同一個池子：白名單 ∩ 有模型）。填一個英雄 id ＝ 全部都用那一隻，" +
          "用來把「血量／護甲」釘在一個已知的基準上量傷害。" +
          "⚠️ 填了一個不存在／未上架的 id 會被當成沒填（照樣隨機），" +
          "⛔ 不會讓練習房開不起來。",
      ),
    dummyRespawnSec: z
      .number()
      .min(0)
      .max(60)
      .describe(
        "靶子被打死之後幾秒**原地滿血**重生（GH#681，owner 2026-08-24" +
          "「被打死過五秒會重生」）。5（出貨值）＝ 那句話。0 ＝ 死掉的下一 tick " +
          "就站起來（＝這個功能出現之前的行為，一鍵 rollback）。" +
          "⚠️ 這一格**只管靶子**：玩家自己的自動復活是上面的 autoRevive，" +
          "而靶子的重生**不吃** autoRevive —— 關掉 autoRevive 測死亡表演時，" +
          "靶子照樣會回來（不然練到後面沒東西打）。",
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
  /** GH#657 —— 開場站幾個靶子（0 = 沒有，＝這個功能出現之前的練習房）。 */
  dummyCount: number;
  /** GH#657 —— 靶子拿一般 bot 大腦（＝今天的 vs bot 行為）。 */
  dummyFightsBack: boolean;
  /** GH#657 —— 靶子固定用哪一隻英雄；`""` = 各自隨機。 */
  dummyChampionId: string;
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
  // ⭐ owner 2026-08-24 逐字:「練習模式**預設**對方**三個英雄**但不會移動也不會
  // 攻擊、施放技能」—— 「預設」兩個字是他自己說的,所以這一格出貨就是 3
  // (第〇·六守則:優先權大的更新後都是預設啟動)。rollback 是把它調成 0。
  dummyCount: 3,
  dummyFightsBack: false,
  dummyChampionId: "",
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
    dummyCount: parsed.data.dummyCount,
    dummyFightsBack: parsed.data.dummyFightsBack,
    dummyChampionId: parsed.data.dummyChampionId,
  };
}
