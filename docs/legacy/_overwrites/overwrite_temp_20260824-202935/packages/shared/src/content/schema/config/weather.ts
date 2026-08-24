/**
 * `config.weather@1` —— 逐場地的**天氣觀感**：濕地面 · 積水 · 霧濃度（GH#610 第二批）。
 *
 * ⭐ owner 2026-08-23（逐字，三則）：
 *
 * > 「**do it, 但有開關**」
 *
 * > 「但是**有些場景是室內**，請**不要下雨**會很奇怪」
 *
 * > 「另外一個天氣特效是**起霧** 你覺得如何？」
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ 為什麼是「天氣」而不是「光追」
 * ════════════════════════════════════════════════════════════════════════════
 * WebGPU 標準**沒有** ray query，而這一版相機俯角 68°／FOV 45.8° ⇒ 地面佔畫面
 * 八成，而地面在光追之前**沒有東西可以反射**。⇒ 螢幕空間反射在這個視角是最不
 * 划算的一項。⭐ 真正落在畫面裡的是**地面本身**：它濕不濕、有沒有積水、空氣有
 * 多濁。這三樣加起來是「光追的質感」裡玩家真的看得到的那一部分，而成本是
 * **零個額外 render pass**（材質參數 + 已經在跑的 `scene.fog`）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 🔢 第〇·四守則：文件只寫**級別名**，⛔ 不寫算好的數字
 * ════════════════════════════════════════════════════════════════════════════
 * 一張場地在這份文件裡只有**一格**：它是哪一種天氣（`WEATHER_KINDS` 六選一）。
 * 「那種天氣有多濕、積多少水、霧多濃」是**這份文件裡的七個純量**，而
 * 級別 → 權重的對照表是**下面那張推導表**（`WEATHER_KIND_WEIGHTS`）。
 *
 * ⛔ **不可以**在每一張場地上寫 `{"kind":"rain","fogDensity":0.004}` ——
 * 那個 `fogDensity` 是第二個住處，而它必然與級距表漂開。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 室內／室外是**內容事實**，⛔ 不是畫質開關
 * ════════════════════════════════════════════════════════════════════════════
 * owner 說「有些場景是室內，不要下雨」⇒ 那是**這張圖是什麼地方**的事實，
 * 所以它住內容（這份文件），⛔ 不住玩家的畫質設定。⭐ 兩者刻意分開：
 * 玩家關掉「濕地面」是他的機器的事；`indoor-dry` 是納薩力克大墳墓在地底的事。
 *
 * ⚠️ 判準寫進 **id 本身**（`indoor-*`），所以它是**機器可驗的**，⛔ 不是註解：
 * `weatherKindIsSheltered()` 只看前綴，而守衛斷言每一個 `indoor-*` 級別的
 * 降雨相關權重（`wet` / `puddle`）都**由 owner 明示**、⛔ 不會憑空出現。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 雷擊補光**刻意不在這份文件裡選**
 * ════════════════════════════════════════════════════════════════════════════
 * 「這張圖有沒有雷」在 GH#362 就已經有住處了：`scenery.lighting.wave === "storm"`
 * （出貨的無限城與終局大混戰兩張都宣告了它）。⇒ ⛔ 在這裡再開一格 `lightning`
 * 就是第二個住處，而且它們一定會互相打架（「天氣說沒雷、燈在閃」）。
 *
 * ⭐ 這份文件只提供**閃到多亮**（三個 boost 純量）。⇒ 於是「室內」與「有雷」
 * 天然是兩個獨立的軸 —— **無限城**（榻榻米地板 ＝ 室內的鐵證，而它宣告了
 * `wave: "storm"`）就同時是「⛔ 不下雨」與「⭐ 會閃電」，⛔ 不必為它開例外。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ 起霧是**一片飄過去**，⛔ 不是全場地一片均勻（owner 2026-08-23）
 * ════════════════════════════════════════════════════════════════════════════
 * owner 2026-08-23（逐字，⭐ 這一則**推翻**了上面那顆全域旋鈕的用法）：
 *
 * > 「⭐ 起霧＝空氣漫反射同一顆旋鈕轉大
 * >  => **不是全場地都霧喔，而是像真實一樣會有一片飄過去，隨機產生不規則形狀霧**」
 *
 * ⇒ 霧變成**兩層**，而它們**共用同一格開關與同一個權重**（⛔ 不是兩套會打架的濃度）：
 *
 * | 層 | 是什麼 | 住哪 |
 * |---|---|---|
 * | **① 空氣**（全域） | `scene.fog` EXP2 —— 遠處被空氣洗淡的那一半。⭐ 它是**基礎**，⛔ 不是「霧」 | `fogDensityAtFull` |
 * | **② 飄過去的那一片**（局部） | 貼著地面飄的不規則霧塊 | `fogBank*` 五格 |
 *
 * ⚠️ **① 的出貨值被這一則裁決調低了**（0.005 → 0.0025，上界 0.006 → 0.003）——
 * ⛔ 這不是我挑的品味，是他那句「不是全場地都霧」的字面實現：預算從均勻那一層
 * 搬到飄過去的那一層。⭐ 而搬得動的原因在下一節：兩層吃**同一條**玩法界線。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 霧的上界是**玩法**的界線，⛔ 不是品味 —— 而它現在是**一個共用預算**
 * ════════════════════════════════════════════════════════════════════════════
 * owner 2026-08-23：「理論上這個地圖是**全視野**，就算牆後也看得到」。
 * ⇒ 霧只可以影響**觀感**，⛔ 不可以讓玩家看不到該看到的敵人。
 *
 * ⭐ 兩層是**相乘**的（先被空氣洗淡，再被那一片霧蓋一次），所以界線也只有一條：
 * {@link fogSightTransmittance}。⛔ 分開各驗一半會兩邊都綠而合起來看不見人。
 *
 * ⭐ 局部那一層的最壞情況是**可以證明的**，⛔ 不是估的：霧片一片一條**互斥車道**、
 * 全部同一個高度 ⇒ 相機射線穿過那個高度**恰好一次** ⇒ 任何一點最多被**一片**蓋到。
 * ⇒ 局部殘留 = `1 − fogBankAlpha`（⛔ 不是 `(1−a)^N`）。
 * 那條「互斥」是**幾何上關死的**（車道寬度反推霧片外接半徑，見
 * `render/weatherFogBanks.ts` 的 `fogBankHalf()`），而守衛真的沿時間軸取樣去驗它。
 *
 * 守衛 `apps/client/src/render/weatherFogBanks.test.ts` 拿**出貨場地真的量得到的
 * 最遠對戰距離**去跑它 —— ⛔ 不是抄一個字面距離。
 */
import { z } from "zod";

export const WEATHER_DOC_ID = "weather";
export const WEATHER_SCHEMA_TAG = "config.weather@1";

// ---------------------------------------------------------------------------
// 級別 —— 六選一
// ---------------------------------------------------------------------------

/**
 * 一張場地的天氣級別。⭐ **`indoor-` 前綴是機器可驗的室內宣告**，⛔ 不是命名品味。
 */
export const WEATHER_KINDS = [
  "clear",
  "fog",
  "rain",
  "storm",
  "indoor-dry",
  "indoor-damp",
] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** 給人看的名字 —— 後台下拉選單與地圖編輯器共用同一份。 */
export const WEATHER_KIND_LABELS: Record<WeatherKind, string> = {
  clear: "晴朗（室外）—— 今天的樣子：地面不濕、沒有積水、沒有額外的霧",
  fog: "起霧（室外）—— 只有霧。地面**不濕**，所以它可以安全地用在你不確定是不是室內的圖上",
  rain: "下雨（室外）—— 濕地面 ＋ 積水 ＋ 薄霧",
  storm: "雷雨（室外）—— 濕地面 ＋ 積水 ＋ 中等霧。⚠️ 閃電本身由場地的 `scenery.lighting.wave = storm` 決定，不是這一格",
  "indoor-dry": "室內·乾（大廳／墓所／和室）—— ⛔ 不下雨、不濕、沒有積水、沒有霧",
  "indoor-damp":
    "室內·潮濕（洞窟／地窖）—— 地面濕、有積水、薄霧。⭐ 這是**滲水**不是雨，所以它不違反「室內不下雨」",
};

/** 這個級別宣告自己是室內嗎。⭐ 只看前綴 —— 判準住在 id 裡，⛔ 不住註解。 */
export function weatherKindIsSheltered(kind: WeatherKind): boolean {
  return kind.startsWith("indoor");
}

/** 一個級別的權重（0..1 的**比例**，⛔ 不是最終值）。 */
export interface WeatherWeights {
  /** 地面有多濕（0 = 乾） */
  wet: number;
  /** 積水有多滿（0 = 沒有積水） */
  puddle: number;
  /** 霧有多濃（0 = 只有空氣漫反射那一層） */
  fog: number;
  /**
   * 🌧️ 天上真的在**掉水**的強度（0 = 不下雨）。GH#654。
   *
   * ⚠️ 它與 `wet` / `puddle` **刻意分開**：owner 2026-08-23 的
   * 「有些場景是室內，請不要下雨」管的是**這一格**，而 `indoor-damp`（洞窟滲水）
   * 的地面濕、有積水卻 `rain: 0` —— ⭐ 滲水不是雨。合成一格就分不出這件事。
   */
  rain: number;
}

/**
 * 級別 → 權重。⭐ 這是第〇·四守則的那張**共用表**：420 支技能不會各自帶一份
 * 傷害數字，13 張場地也不會各自帶一份霧濃度。
 *
 * ⚠️ 兩個 `indoor-*` 的 `wet` / `puddle`：`indoor-dry` 是**全零**（owner 的
 * 「不要下雨」的字面實現）；`indoor-damp` 有濕度而**沒有降水** —— 洞窟牆上滲下來
 * 的水不是雨，而 owner 抱怨的「很奇怪」是**天上掉水**，⛔ 不是地上有水。
 * ⇒ 出貨時只有「大聖杯洞窟」用它，其餘室內圖一律 `indoor-dry`。
 */
export const WEATHER_KIND_WEIGHTS: Record<WeatherKind, WeatherWeights> = {
  clear: { wet: 0, puddle: 0, fog: 0 },
  fog: { wet: 0, puddle: 0, fog: 1 },
  rain: { wet: 1, puddle: 1, fog: 0.45 },
  storm: { wet: 1, puddle: 1, fog: 0.7 },
  "indoor-dry": { wet: 0, puddle: 0, fog: 0 },
  "indoor-damp": { wet: 0.65, puddle: 0.55, fog: 0.3 },
};

/** 沒有列在表上的場地走這一個。⭐ = 今天的行為，逐像素不變。 */
export const DEFAULT_WEATHER_KIND: WeatherKind = "clear";

// ---------------------------------------------------------------------------
// 霧的玩法界線
// ---------------------------------------------------------------------------

/**
 * Babylon `FOGMODE_EXP2` 的殘留比例：`exp(-(d·k)²)`。
 * 1 = 完全看得到原色，0 = 完全被霧蓋掉。**純算術**，測得到。
 */
export function fogTransmittance(density: number, distance: number): number {
  const x = density * distance;
  return Math.exp(-(x * x));
}

/**
 * 最遠對戰距離上，敵人至少要留下多少原色。
 *
 * ⚠️ 0.35 是一條**玩法**界線，⛔ 不是品味：低於它，一個英雄在最遠的交戰距離上
 * 會塌成一團與霧同色的剪影 —— 而 owner 2026-08-23 明說「這個地圖是全視野，
 * 就算牆後也看得到」。⇒ 霧可以讓遠方**朦朧**，⛔ 不可以讓遠方**消失**。
 *
 * ⭐ 它跟距離**分開**是刻意的：距離要從出貨場地量（守衛在做），這一格才是政策。
 */
export const FOG_MIN_TRANSMITTANCE = 0.35;

/**
 * ⭐ **兩層霧合起來**留下多少原色 —— 這是玩法界線唯一該對的那個數。
 *
 * ① 空氣（EXP2，跟距離走）× ② 飄過去的那一片（一片就是一次 alpha blend）。
 *
 * ⚠️ 局部那一層是 `1 − alpha` 而**不是** `(1 − alpha)^N`，理由是幾何而不是樂觀：
 * 霧片一片一條互斥車道、全部同一個高度 ⇒ 一條相機射線穿過那個高度恰好一次
 * ⇒ 畫面上任何一點最多被一片蓋到。⛔ 這個前提一旦被破壞（例如有人讓霧片高度
 * 隨機），這個公式就低估了 —— 所以守衛除了算它，還真的沿時間軸驗那個互斥。
 */
export function fogSightTransmittance(
  density: number,
  distance: number,
  bankAlpha: number,
): number {
  return fogTransmittance(density, distance) * (1 - bankAlpha);
}

// ---------------------------------------------------------------------------
// 文件
// ---------------------------------------------------------------------------

export const zConfigWeatherDoc = z
  .object({
    id: z.literal(WEATHER_DOC_ID),
    schema: z.literal(WEATHER_SCHEMA_TAG),
    note: z.string().max(2000).optional(),
    /**
     * ⛔ 關掉 = 三樣全部回到 GH#610 第二批之前的樣子（地面乾、沒有積水、
     * 霧只剩空氣漫反射那一層）。留著它是為了**一鍵回頭**（第〇·六守則）。
     */
    enabled: z.boolean(),
    /** 濕到底時，地板反照率乘多少。⚠️ 上界 1 = 不變亮：濕的東西只會**變深**。 */
    wetAlbedoMul: z.number().min(0.2).max(1),
    /** 濕到底時，地板粗糙度乘多少。⭐ 這一格是「濕」的**主要**來源 —— 低粗糙度 = 會反光。 */
    wetRoughnessMul: z.number().min(0.05).max(1),
    /** 濕到底時，地板的鏡面強度。乾的地板是 0.35（`ArenaGround.GROUND_SPECULAR_DRY`）。 */
    wetSpecular: z.number().min(0).max(2),
    /** 積水佔一個 zone 半徑的比例（一片水窪的大小）。0 = 不要積水。 */
    puddleCoverage: z.number().min(0).max(0.6),
    /** 一片積水最多幾片。⚠️ 每一片是一顆 mesh，所以這是**畫面上的物件數**。 */
    puddleCount: z.number().int().min(0).max(24),
    /** 積水的不透明度。1 = 完全蓋住底下的地板紋理（看起來像油漆不像水）。 */
    puddleAlpha: z.number().min(0).max(1),
    /** 積水的粗糙度。⭐ 越低越像鏡子；0.02 以下會只剩一顆太陽的亮點。 */
    puddleRoughness: z.number().min(0.01).max(0.6),
    /** 積水表面微光的擺幅（0 = 完全靜止）。⚠️ 它會動 ⇒ `prefers-reduced-motion` 會關掉它。 */
    puddleSheenAmp: z.number().min(0).max(1),
    /** 閃電峰值時主光額外乘多少。1 = 沒有額外補光（＝這一格關掉）。 */
    lightningKeyBoost: z.number().min(1).max(4),
    /** 閃電峰值時補光（半球光）額外乘多少。⚠️ 比主光低才有「一道光打進來」的方向感。 */
    lightningFillBoost: z.number().min(1).max(4),
    /** 閃電峰值時霧額外亮多少（空氣被閃電照亮的那一半）。 */
    lightningFogBoost: z.number().min(1).max(4),
    /**
     * ⭐ **第①層（空氣）**：霧權重 = 1 時，額外加在空氣漫反射之上的 EXP2 密度。
     *
     * ⚠️ 上界 **0.003** 不是隨手挑的：它是「最遠對戰距離上，**空氣 × 那一片霧**
     * 合起來還留得住 {@link FOG_MIN_TRANSMITTANCE}」反解出來的那個數
     * （{@link fogSightTransmittance}，守衛用出貨場地重算一次）。
     * Zod 的 max 只吃字面值，所以這裡是字面值而**閘在測試**。
     *
     * ⚠️ 它在 owner 2026-08-23「**不是全場地都霧**」那一則之後**從 0.006 降到 0.003**
     * —— 預算搬去了 `fogBank*` 那五格。⛔ 調回去會讓那一條合併的閘紅。
     */
    fogDensityAtFull: z.number().min(0).max(0.003),
    /**
     * ⭐ **第②層（飄過去的那一片）**：霧權重 = 1 時，場上同時有幾片。
     *
     * ⚠️ 它同時是**車道數** —— N 片就把場地橫切成 N 條互斥車道，一條一片。
     * ⇒ 調大**不會**讓某一點變濃，只會讓霧片變窄變多（見 `fogBankLaneFill`）。
     * 0 = 這一層關掉（回到只有第①層的均勻空氣）。
     */
    fogBankCount: z.number().int().min(0).max(8),
    /**
     * 一片霧最濃處的不透明度。
     *
     * ⚠️ 上界 **0.35** 與 `fogDensityAtFull` 的上界是**同一條**界線反解出來的兩半 ——
     * 動其中一格就要重解另一格，⛔ 不要只改一邊（守衛會紅，而它紅的訊息會指名兩邊）。
     *
     * ⭐⭐ **出貨值刻意離上界很遠**（0.1 vs 0.35）。owner 2026-08-23（逐字）：
     *
     * > 「**飄動霧 應該要很淡 不影響任何戰局只是裝飾 不計入也不影響重播**」
     *
     * ⇒ 上界是**防呆**（擋住「有人把它調爆」），⛔ 不是目標。
     * ⛔ 不要因為「閘還沒紅」就把出貨值往上推。
     */
    fogBankAlpha: z.number().min(0).max(0.35),
    /**
     * 一片霧佔滿自己那條車道的多少（1 = 塞滿）。
     *
     * ⭐ 這一格是**互斥車道**那條不變量的實作：霧片的**外接**半徑（⛔ 不是邊長）
     * 被夾在車道半寬之內，所以它轉到任何角度都不會越線 ⇒ 兩片永遠不重疊。
     */
    fogBankLaneFill: z.number().min(0.2).max(1),
    /** 一片霧從場地一頭飄到另一頭要幾秒。⚠️ 越小越像在跑，越大越像在呼吸。 */
    fogBankDriftSec: z.number().min(8).max(600),
    /**
     * 霧片離地板多高。⭐ 出貨值是**貼著地面的低伏霧**（英雄的上半身會穿出來），
     * ⛔ 不是蓋在頭上的一層天花板 —— 後者會把英雄整個蓋掉。
     */
    fogBankHeight: z.number().min(0.2).max(20),
    /**
     * 逐場地的天氣級別。⭐ 沒有列在這裡的場地 = {@link DEFAULT_WEATHER_KIND}
     * （晴朗）＝ 今天的行為 ⇒ 一張新地圖不會因為忘了填而突然下雨。
     */
    arenas: z.record(z.enum(WEATHER_KINDS)),
  })
  .strict();

export type ConfigWeatherDoc = z.infer<typeof zConfigWeatherDoc>;

/** 程式讀的那一份（去掉 id/schema/note 的殼）。 */
export type WeatherPolicy = Omit<ConfigWeatherDoc, "id" | "schema" | "note">;

/**
 * 出貨預設。
 *
 * ⚠️ `arenas` 那張表的每一列都是**我**（Claude）依場地名稱、地板材質與作者已經
 * 畫好的天光判斷的，⛔ 不是 owner 的裁決 —— 唯一有逐字證據的是兩張：
 * `arena.castle` 的名字是「城堡競技場（**室內**）」、`arena.colosseum` 是
 * 「羅馬大擂台（**室外**）」。其餘每一列的理由寫在 GH#610 的報告裡，
 * 而它們全部是後台一格下拉選單（第〇·六守則：我挑錯的成本是他改一格）。
 *
 * ⭐ 判不出來的一律填 `clear` / `fog`（**兩者都不濕**）⇒ 就算我把某張室內圖
 * 誤判成室外，玩家也**不會**看到室內下雨。⛔ 保守的方向是刻意的。
 */
export const DEFAULT_WEATHER: WeatherPolicy = {
  enabled: true,
  wetAlbedoMul: 0.62,
  wetRoughnessMul: 0.45,
  wetSpecular: 0.85,
  puddleCoverage: 0.17,
  puddleCount: 5,
  puddleAlpha: 0.72,
  puddleRoughness: 0.06,
  puddleSheenAmp: 0.3,
  lightningKeyBoost: 1.7,
  lightningFillBoost: 1.25,
  lightningFogBoost: 1.5,
  // ⭐ owner 2026-08-23「不是全場地都霧」⇒ 均勻那一層砍半，預算搬到下面五格。
  fogDensityAtFull: 0.0025,
  fogBankCount: 4,
  // ⭐ owner 2026-08-23：「飄動霧 應該要**很淡** 不影響任何戰局只是裝飾」
  //    ⇒ 出貨值刻意只有上界（0.35）的不到三分之一。⛔ 上界是防呆，不是目標。
  fogBankAlpha: 0.1,
  fogBankLaneFill: 0.85,
  fogBankDriftSec: 90,
  fogBankHeight: 1.2,
  arenas: {
    // ⭐ 名字逐字寫著「（室內）」—— 這一列**不是**我猜的。
    "arena.castle": "indoor-dry",
    // ⭐ 名字逐字寫著「（室外）」。天光 #fff2d6 是晴天的暖光。
    "arena.colosseum": "clear",
    // 草地河道，天光 #dff0ff。
    "arena.dota": "clear",
    // ⚠️ 判不出來：「迷宮」像地牢，而它的遠景層是**山稜**（peaks）。
    //    ⇒ 選「起霧」——霧**不需要**室內／室外的判斷，而且它不濕。
    "arena.frieren": "fog",
    // ⚠️ 判不出來（沒有遠景層可以參考）⇒ 今天的行為。
    "arena.godie": "clear",
    // ⚠️ 原作是塔內擂台，而遠景層是雲海＋稲妻（＝高空露天）⇒ 兩邊都說得通，
    //    所以走不濕的那一邊。
    "arena.heavens-arena": "clear",
    // 「洞窟」＝ 洞穴，天光 #d8ffe0 是地底的螢光綠。⭐ 滲水，⛔ 不是雨。
    "arena.holy-grail": "indoor-damp",
    // ⭐ 榻榻米地板（groundStyle: tatami）＝ 室內的鐵證。
    //    它的 `wave: "storm"` 仍然給它閃電 —— 那一格**不吃**室內閘。
    "arena.infinity-castle": "indoor-dry",
    // 「大墳墓」＝ 地下墓所，黑曜石地板。
    "arena.nazarick": "indoor-dry",
    // ⭐ 場地**自己**宣告了 `wave: "storm"`（雷雨），而且沒有遠景層 ⇒ 露天。
    "arena.royale": "storm",
    // 天光 #cdd6e0 是 13 張裡**唯一**的無彩度灰 ⇒ 作者已經把它畫成陰天。
    "arena.shiganshina": "rain",
    // 骨架 fallback，沒有身分 ⇒ 今天的行為。
    "arena.skeleton": "clear",
    // 櫻花／雲海，天光 #e0ffd8。
    "arena.world-tree": "clear",
  },
};

/** `content/config/weather.json` 的內容，一字不差（drift 測試比對這一份）。 */
export const SHIPPED_WEATHER_JSON: ConfigWeatherDoc = {
  id: WEATHER_DOC_ID,
  schema: WEATHER_SCHEMA_TAG,
  ...DEFAULT_WEATHER,
};

/**
 * 文件 → 政策。缺席／壞掉一律退回出貨預設，理由與 `resolveScreenFx` 同源：
 * 內容載不到是 2026-08-01 骨架事故那條路，而在那條路上把天氣變成「全部關掉」
 * 會讓「內容全毀」看起來像「這一版把天氣拿掉了」。
 */
export function resolveWeather(doc: ConfigWeatherDoc | null | undefined): WeatherPolicy {
  if (!doc) return DEFAULT_WEATHER;
  const { id: _id, schema: _schema, note: _note, ...policy } = doc;
  return policy;
}

/** 這張場地是哪一種天氣。未列出 = 晴朗（今天的行為）。 */
export function weatherKindFor(policy: WeatherPolicy, arenaId: string): WeatherKind {
  return policy.arenas[arenaId] ?? DEFAULT_WEATHER_KIND;
}

/** 這一場**解析過後**的天氣觀感 —— 呼叫端直接用，⛔ 不再乘第二次。 */
export interface WeatherLook {
  kind: WeatherKind;
  /** 0..1 —— 地面濕度（已經吃過總開關與玩家設定） */
  wet: number;
  /** 0..1 —— 積水強度（同上） */
  puddle: number;
  /** ①層 —— 額外的 EXP2 霧密度（**絕對值**，加在空氣漫反射之上） */
  fogDensity: number;
  /**
   * ②層 —— 這一場**同時飄幾片**霧（已經吃過同一格開關與同一個權重）。
   *
   * ⭐ 它與 `fogDensity` 由**同一個**權重 × 同一格開關算出來，⛔ 不是第二套設定：
   * 玩家關掉「霧」那一格 ⇒ 兩層一起是 0；一張晴朗的圖 ⇒ 兩層一起是 0。
   */
  fogBanks: number;
}

/** 三樣各自的開關（玩家設定 × 畫質梯子解析過後的布林）。 */
export interface WeatherToggles {
  wetGround: boolean;
  puddles: boolean;
  fog: boolean;
}

export const WEATHER_LOOK_NONE: WeatherLook = {
  kind: DEFAULT_WEATHER_KIND,
  wet: 0,
  puddle: 0,
  fogDensity: 0,
  fogBanks: 0,
};

/**
 * 級別 × 純量 × 開關 → 這一場的觀感。**純函式**，⛔ 沒有 Babylon、⛔ 沒有 store。
 *
 * ⚠️ 三個開關**各自**歸零而不是一起 —— 濕地面幾乎免費、積水最貴，綁在一起等於
 * 讓玩家沒辦法只留便宜的那一個。
 */
export function weatherLookFor(
  policy: WeatherPolicy,
  arenaId: string,
  toggles: WeatherToggles,
): WeatherLook {
  const kind = weatherKindFor(policy, arenaId);
  if (!policy.enabled) return { ...WEATHER_LOOK_NONE, kind };
  const w = WEATHER_KIND_WEIGHTS[kind];
  return {
    kind,
    wet: toggles.wetGround ? w.wet : 0,
    puddle: toggles.puddles ? w.puddle : 0,
    fogDensity: toggles.fog ? w.fog * policy.fogDensityAtFull : 0,
    // ⭐ 同一格開關、同一個權重 —— ⛔ 霧不可以有第二套設定（owner：「同一顆旋鈕」）。
    fogBanks: toggles.fog ? Math.round(w.fog * policy.fogBankCount) : 0,
  };
}
