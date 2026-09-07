/**
 * ⭐⭐ `round11` —— **第十一回合・生存模式的旋鈕**（GH#919 #920 #921 #922 #923 #924 #925）。
 *
 * ⛔⛔ **這是骨架，⛔ 不是實作。** `enabled` 出貨是 **`false`**，
 * ⭐ 而那讓整個區塊今天逐位元 no-op —— 沒有任何畫面、卡面或旁白在宣稱它會發生
 * （第一·五守則：⛔ 不放「說了但不會發生」的字）。
 *
 * ⭐ **它為什麼先存在**：六張票的參數**全部撞同一個檔**（`content/config/arena-rules.json`），
 * ⇒ 逐張加一格 = 六次同檔衝突；⭐ 一次把形狀定下來 = 之後每一張票只補**它自己的實作**。
 * ⚠️ 而每一格都引用得到 owner 的一句原話（下面逐格標）——
 * ⛔ 沒有一格是我挑的數字（第一守則：可調 ≠ 我可以轉）。
 *
 * ── owner 2026-09-02 的逐字裁決（六張票的留言合起來）────────────────────
 * · 「那就大膽一點 **直接卡上限 500個殭屍** 請你一起調整生成合理速度，
 *    但生成速度**不是一開始就拉滿 而是漸進式**」
 * · 「第十一回合 場上上限數量會解放到 200隻殭屍」→ 後來改成 500（⭐ 上面那則較新）
 * · 「[強度係數] **×2**」
 * · 「[兩隊還敵不敵對] **維持敵對一樣**」
 * · 「[影不影響最終勝負] 我說過了是**總分加倍的獎勵局**，所以影響最終計分的獎勵局」
 * · 「[進場狀態：全員滿血、寶具沿用前十回合買的] **yes**」
 * · 「[有沒有商店] **no**」
 */
import { z } from "zod";

/** ⭐ BR 大轟炸（GH#923）—— 極大範圍 · 紅圈倒數 · 真傷佔比。 */
const zBombardment = z
  .object({
    enabled: z
      .boolean()
      .describe(
        "@zh 大轟炸 · 開不開這個事件\n" +
          "@note 紅圈倒數後落下、對圈內造成一筆真實傷害的 BR 式轟炸（GH#923）。⛔ 關掉＝波次表抽到轟炸那一列時什麼都不會發生（⚠️ 而權重不會自動重新分配，那一次抽等於空過）。",
      ),
    /** ⭐ 紅圈出現到落下的秒數（票文：**10 秒**倒數）。 */
    telegraphSec: z
      .number()
      .min(0)
      .max(60)
      .describe(
        "@zh 大轟炸 · 紅圈出現到落下的倒數秒數\n" +
          "@note 玩家看到地上那一圈之後有幾秒可以跑（出貨 {{出貨值}}）。調短＝它變成無法反應的懲罰，調長＝所有人早就走開了，於是這個事件只是畫面上多一圈紅色。",
      ),
    /** ⭐ 真實傷害 ＝ 目標最大生命的幾成（票文：**50%**）。 */
    damagePctOfMaxHp: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "@zh 大轟炸 · 傷害＝目標最大生命的幾成\n" +
          "@note 落點內的目標挨的是**真實傷害**，量是自己最大生命的這個比例（出貨 {{出貨值}} ＝ 五成）。⚠️ 真實傷害不吃護甲魔抗，所以坦度高的英雄一樣是掉五成 —— 這一格改的是「站在圈裡的代價」，⛔ 不是誰比較耐打。",
      ),
    /** ⚠️ 半徑（格）—— 票文逐字「極大範圍」，⛔ 而「極大」需要一個數字。 */
    radius: z
      .number()
      .min(1)
      .max(60)
      .describe(
        "@zh 大轟炸 · 落點半徑（格）\n" +
          "@note 票文寫的是「極大範圍」，而那需要一個數字（出貨 {{出貨值}}）。調大＝場上幾乎沒有安全區，走位變成猜哪一半的地圖；調小＝紅圈變成可以無視的裝飾。",
      ),
    /** ⭐ 越聚集越容易被炸：落點偏向人多的地方的權重。0 ＝ 純隨機。 */
    crowdBias: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "@zh 大轟炸 · 落點偏向人多的地方的權重\n" +
          "@note 0 ＝ 純隨機落點；愈大愈會往人群密集處落（出貨 {{出貨值}}）。⭐ 它的作用是**逼隊伍散開**：調 0 的話大家會擠在一起抱團，而那正好是這個事件想拆掉的打法。",
      ),
  })
  .strict();

/** ⭐ 波次組合表（GH#924）—— ⭐ **一張表**，⛔ 不是一串 if。 */
const zWaveTable = z
  .object({
    /** 每隔幾秒一次事件（票文：**20 秒**）。 */
    eventIntervalSec: z.number().min(1).max(300),
    /** ⭐ 難度指數遞增的底數：第 n 次事件的強度 ＝ `base ^ n`。 */
    difficultyBase: z.number().min(1).max(3),
    /**
     * ⭐ 事件表 —— 每一列是「權重 × 一種事件」。
     * ⛔ 空表 ＝ 只生一般殭屍（那是一個**合法**的設定，不是缺陷）。
     */
    events: z
      .array(
        z
          .object({
            kind: z.enum(["normal", "special", "boss", "bombardment", "reviveCircle"]),
            weight: z.number().min(0).max(1000),
          })
          .strict(),
      )
      .max(32),
  })
  .strict();

/** ⭐ 計分（GH#925）—— 50% 存活時間 ＋ 50% 戰鬥貢獻。 */
const zScoring = z
  .object({
    /** ⭐ 存活時間佔比（票文：**50%**）。戰鬥貢獻 ＝ `1 − 這一格`。 */
    survivalWeight: z.number().min(0).max(1),
    /**
     * ⭐⭐ owner 逐字：「是**總分加倍的獎勵局**」⇒ 這一回合的分數乘這一格。
     */
    scoreMultiplier: z.number().min(0).max(10),
    /**
     * ⭐ 票文逐字：「**混到最後的人分數也不會高**」——
     * 戰鬥貢獻低於這一格時，存活那一半也跟著打折。
     */
    minContributionForFullSurvival: z.number().min(0).max(1),
  })
  .strict();

export const zRound11Config = z
  .object({
    /**
     * ⭐⭐ **總開關 —— 出貨 `false`。**
     * ⛔ 關著時整個區塊逐位元 no-op（回到今天的十回合）。
     */
    enabled: z.boolean(),
    /**
     * ⭐ 場地（GH#919）—— 票文逐字：「⛔ **但不要寫死它**：做成一格
     * `round11.arenaId`，**預設 `arena.royale`**」。
     */
    arenaId: z.string().min(1).max(64),
    /** ⭐ 這一回合多長（秒）—— 票文：**10 分鐘**。 */
    durationSec: z.number().min(30).max(3600),
    /** ⭐ 觸發條件：累計幾次王擊殺（票文：**3 次**）。 */
    triggerBossKills: z.number().int().min(0).max(20),
    /** ⭐ 橫幅文案。⛔ 空字串 ＝ 不顯示橫幅。 */
    bannerText: z.string().max(64),
    /**
     * ⭐⭐ 場上殭屍上限 —— owner 2026-09-02 逐字：
     * 「那就大膽一點 **直接卡上限 500個殭屍**」。
     */
    maxAliveZombies: z.number().int().min(1).max(2000),
    /**
     * ⭐⭐ 生成速度**漸進**到滿載要幾秒 —— owner 逐字：
     * 「生成速度**不是一開始就拉滿 而是漸進式**」。
     * ⛔ `0` ＝ 一開始就滿載（＝ owner 明說不要的那一種）。
     */
    spawnRampSec: z.number().min(0).max(600),
    /** ⭐⭐ 殭屍王強度係數 —— owner 逐字：「[強度係數] **×2**」。 */
    bossStrengthMult: z.number().min(0).max(10),
    /**
     * ⭐ 王的強度隨「場上**累積**已生成殭屍數」成長（GH#921）——
     * ⭐ 票文逐字「**兩端都要夾**」⇒ 這裡是上下界。
     */
    bossScaleFloor: z.number().min(0).max(10),
    bossScaleCeil: z.number().min(0).max(50),
    /**
     * ⭐ 死掉的玩家「換邊」操作殭屍王（GH#922）。
     * ⛔ 關著 ＝ 死了就是離場（今天的行為）。
     */
    deadPlayersControlBoss: z.boolean(),
    /** ⭐ BR 大轟炸（GH#923）。 */
    bombardment: zBombardment,
    /** ⭐ 波次組合表（GH#924）。 */
    waveTable: zWaveTable,
    /** ⭐ 計分（GH#925）。 */
    scoring: zScoring,
  })
  .strict();
export type Round11Config = z.infer<typeof zRound11Config>;

/**
 * ⭐ 出貨值 —— ⛔ 不抄字面量：它與 `content/config/arena-rules.json` 的
 * `round11` 每一格必須逐位元相同，而 drift 測試在守。
 *
 * ⚠️⚠️ ⭐ **`enabled: false`** —— 這是骨架，sim 那一半還沒做。
 * ⛔ 打開它今天不會發生任何事，⭐ 而那正是它關著的理由。
 */
export const SHIPPED_ROUND11: Round11Config = {
  enabled: false,
  arenaId: "arena.royale",
  durationSec: 600,
  triggerBossKills: 3,
  bannerText: "第十一回合・生存模式",
  maxAliveZombies: 500,
  spawnRampSec: 120,
  bossStrengthMult: 2,
  bossScaleFloor: 1,
  bossScaleCeil: 8,
  deadPlayersControlBoss: true,
  bombardment: {
    enabled: true,
    telegraphSec: 10,
    damagePctOfMaxHp: 0.5,
    radius: 12,
    crowdBias: 0.6,
  },
  waveTable: {
    eventIntervalSec: 20,
    difficultyBase: 1.15,
    events: [
      { kind: "normal", weight: 60 },
      { kind: "special", weight: 25 },
      { kind: "boss", weight: 5 },
      { kind: "bombardment", weight: 5 },
      { kind: "reviveCircle", weight: 5 },
    ],
  },
  scoring: {
    survivalWeight: 0.5,
    scoreMultiplier: 2,
    minContributionForFullSurvival: 0.2,
  },
};
