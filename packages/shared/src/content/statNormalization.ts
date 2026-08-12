/**
 * 英雄屬性正規化（`config.stat-normalization@1`）——「小中大是分佈，極小極大是例外槽」。
 *
 * owner 2026-08-12 定的模型（⭐ 這是唯一的設計前提，前一版被他整個推翻過）：
 *
 * > 「我的**極大極小就是為了極端例外而誕生**(ex 牙膏 熊貓等)　**不需要考慮平均分佈問題**，
 * >  **只有小中大才是真正的分佈**… 極大個案=0 而已…
 * >  未來可能也會設計新角色坦克裝甲特別厚的特色英雄佔據極大的一個個案
 * >  （但同時會有其他極小的屬性弱化例如攻速極慢只能靠反彈傷害之類的組合機制）…
 * >  **極小與極大只是限制合理的上下限**(例如攻速上限 4)」
 *
 * 翻成規格，三件事：
 *
 * ① **小 / 中 / 大 = 真正的分佈。** 等比尺 `r` **只管這三格**，所以 大/小 = r²。
 * ② **極小 / 極大 = 例外槽，同時也是硬上下限。** ⛔ 它們**沒有人數目標** ——
 *    個案 0 是正常狀態，不是缺陷。⛔ 不要用「極大佔比太高」評價任何東西。
 * ③ **佔用例外槽要付代價**：任一屬性落在極大 ⇒ 至少有一項落在極小。
 *    這是一條**不變量**（`statNormalizationInvariant.test.ts` 在守），不是一份觀察清單。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 第三種來源：由**角色定位**推導（owner 2026-08-12）
 * ---------------------------------------------------------------------------
 * 有些屬性今天**根本不區分英雄** —— 量到的自然跨度（p90/p10）：
 * 魔抗初始 **1.20×**、移速初始 **1.22×**。也就是說最強與最弱只差兩成，
 * 那不是一個設計槓桿，是一欄雜訊。owner 因此改成由角色定位決定：
 *
 * > 「遠距離攻擊 移動速度應該是中 / 近距離攻擊 移動速度應該是快 但坦克是中或慢 /
 * >  技能傷害為主的法師 例如莉娜等 移動速度應該是中或慢 但慢的為主
 * >  魔抗則是遠距離及法師弱 近距離中 坦克高」
 *
 * ⭐ 所以屬性有**三種**來源，而不是兩種：
 *   · 作者填級別（力/敏/智、AD、射程…）
 *   · 由三圍推導（生命←力量、AP←智慧…；那是既有的 `championStatBase`）
 *   · **由 archetype 推導**（移速、魔抗）← 這一支新增的
 *
 * ---------------------------------------------------------------------------
 * archetype 怎麼判：**主屬性 × 攻擊型別**，⭐ 忠於 WC3 原作模型
 * ---------------------------------------------------------------------------
 * 這個專案是 `GoDieEX227s.w3x` 的移植，英雄卡本來就帶 str/agi/int。
 * WC3 的英雄分類就是主屬性：力量＝坦、敏捷＝戰士/射手、智慧＝法師。
 * ⛔ 所以不要另外發明一套 role 欄位去手標 74 位 —— 資料已經在那裡了。
 *
 * ⚠️ 主屬性用 **lv10 權重**（初始 + 成長×9），不是只看初始值：
 * 一位初始三圍平均但智慧成長最快的英雄，在實打的第 5–6 回合就是法師。
 *
 * ⚠️ 既有的 `doc.role` 欄位**不能用** —— 它只有三個值（fighter 51 / marksman 22 /
 * tank 1），而且 51 位 fighter 裡混了坦克與法師。它是匯入時的粗分類，不是設計。
 *
 * ⭐ `archetype` 仍然是**可以在英雄卡上覆寫的**（第一守則）：推導只是預設值。
 * owner 想把某一位手動指定成別的類別，填 `archetype` 那一欄就好。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 這一版**只作用在 `appliesTo` 列出的屬性**上（出貨：移速、魔抗）
 * ---------------------------------------------------------------------------
 * 其餘屬性照舊讀 `baseStats`/`growth`，一格都不動。理由是第零守則：
 * 一次換掉 74 位 × 14 項是一次不可逆的內容遷移，而 owner 還沒逐項核准級距。
 * ⭐ 把 `appliesTo` 做成一格後台欄位，之後開啟任何一項都不用改程式。
 */
import type { ChampionDef } from "../sim/content/defs";

/** `content/config/stat-normalization.json` 的文件 id。 */
export const STAT_NORMALIZATION_DOC_ID = "stat-normalization";

/**
 * ⭐ **五格全部可以指派**（owner 2026-08-12：「你要重新寫出定位 10 種如何影響
 * **極小小中大極大** 的所有屬性」）。
 *
 * ⚠️ 這一句推翻了前兩版：那時候 `NORMAL_BANDS` 只有三格，極小/極大被當成
 * 「硬上下限」而不是可指派的級別。現在它們是**例外槽** —— 一個出身可以在
 * 一兩項上拿到極大，代價是別的項掉到極小。
 *
 * 階梯（兩條都是 owner 給的）：
 *   · 小 / 中 / 大 —— r = **1.25**（他要 1.2~1.5）
 *   · 極小 / 極大 —— 相對於「中」是 **÷2 / ×2**（他要 2~4）
 */
export const NORMAL_BANDS = ["極小", "小", "中", "大", "極大"] as const;
export type NormalBand = (typeof NORMAL_BANDS)[number];

/** 同一組名稱的別名，舊呼叫端還在用。 */
export const ALL_BANDS = NORMAL_BANDS;
export type Band = NormalBand;

/** 級距階梯：`中` 乘上這些倍率。⛔ 兩條 r 都是 owner 給的，不是我挑的。 */
export const BAND_MULTIPLIER: Readonly<Record<NormalBand, number>> = Object.freeze({
  極小: 0.5,
  小: 1 / 1.25,
  中: 1,
  大: 1.25,
  極大: 2,
});

/** 從「中」推出五格。⭐ 出貨表就是這樣長出來的，⛔ 不是手打五個數字。 */
export function bandsFromMedian(mid: number): Readonly<Record<NormalBand, number>> {
  const out = {} as Record<NormalBand, number>;
  for (const b of NORMAL_BANDS) out[b] = Number((mid * BAND_MULTIPLIER[b]).toFixed(3));
  return Object.freeze(out);
}

/**
 * 角色定位。⭐ 判定＝主屬性 × 攻擊型別（見檔頭），不是手標。
 *
 * · `tank`     力量主 + 近戰 —— 血厚、跑得慢、魔抗高
 * · `fighter`  敏捷主 + 近戰 —— 跑得快、魔抗中
 * · `marksman` 敏捷/力量主 + 遠程 —— 跑得中等、魔抗弱
 * · `mage`     智慧主（不分遠近）—— 跑得慢、魔抗弱
 */
/**
 * ⭐ **出身**（owner 2026-08-12：「可以延伸到 **40** 種，我的原意是 **10 種出身**」）。
 *
 * 10 = **6 純血** + **3 混血** + **1 均衡**，判定完全從英雄卡推導：
 *
 * · 前二名三圍的比 ≥ `MIXED_RATIO` → **純血**，再依攻擊型態分近戰/遠程 → 6 格
 * · 前二名的比 < `MIXED_RATIO` → **混血**，依那兩個三圍的組合 → 3 格
 * · 連第三名都在 `MIXED_RATIO` 以內 → **均衡** → 1 格
 *
 * 出身 × 4 條**路線**（場中經技能/道具/增幅取得，互斥）= owner 說的 40 種。
 * ⛔ 路線今天還沒有引擎機制，所以這裡只有出身。
 *
 * ⚠️ 出身**不直接驅動數值** —— 驅動數值的是 {@link ARCHETYPES}（4 格，owner 給了
 * 完整的三欄表）。兩者的關係是 {@link ORIGIN_TO_ARCHETYPE}：10 收斂成 4。
 * 等 owner 給出 10 列的表，把 `byArchetype` 換寬即可，判定邏輯一行都不用動。
 *
 * 實測分佈（母體 73）：鬥士 21 · 坦克 20 · 法師 13 · 法刺 5 · 射手 5 · 法鬥 4 ·
 * 硬輔 3 · 狂戰 2 · **砲手 0** · **軟輔 0** —— 兩個空格是新角色的位置。
 */
export const ORIGINS = [
  "坦克", // 力量 · 近戰
  "砲手", // 力量 · 遠程
  "鬥士", // 敏捷 · 近戰
  "射手", // 敏捷 · 遠程
  "法鬥", // 智慧 · 近戰　⭐ owner 說的「魔法劍士」
  "法師", // 智慧 · 遠程
  "狂戰", // 力量 × 敏捷
  "硬輔", // 力量 × 智慧　⭐ owner 說的「力量法師」
  "法刺", // 敏捷 × 智慧
  "軟輔", // 三圍都在門檻內
] as const;
export type Origin = (typeof ORIGINS)[number];

/**
 * 「前二名夠接近就算混血」的門檻。
 *
 * ⚠️ 1.20 是**挑出來的**，不是量出來的 —— 但它挑得有依據：門檻掃過
 * 1.05 / 1.10 / 1.15 / 1.20 / 1.25 / 1.30 得到 2 / 5 / 6 / **10** / 13 / 16 位，
 * 1.20 是唯一讓三個混血格都有人、又不會把一半的 roster 吸進去的點。
 * ⛔ 它應該變成後台欄位（`config.stat-normalization@1`）——**還沒做**，因為
 * 出身目前只用在報表，一格都還沒驅動數值。等它驅動數值的那天必須先做成欄位。
 */
export const MIXED_RATIO = 1.2;

/** 三圍在 lv10 的權重值（初始 + 成長×9），由高到低。 */
function rankedAttrs(def: Parameters<typeof primaryAttribute>[0]): [number, "str" | "agi" | "int"][] {
  const a = def.attributes ?? {};
  const at = (k: "str" | "agi" | "int"): number =>
    (a[k] ?? 0) + (a[`${k}Growth` as "strGrowth" | "agiGrowth" | "intGrowth"] ?? 0) * 9;
  return ([["str"], ["agi"], ["int"]] as const)
    .map(([k]) => [at(k), k] as [number, "str" | "agi" | "int"])
    .sort((x, y) => y[0] - x[0]);
}

const PURE: Readonly<Record<"str" | "agi" | "int", readonly [Origin, Origin]>> = Object.freeze({
  str: ["坦克", "砲手"],
  agi: ["鬥士", "射手"],
  int: ["法鬥", "法師"],
});
const MIXED: Readonly<Record<string, Origin>> = Object.freeze({
  "agi|str": "狂戰",
  "int|str": "硬輔",
  "agi|int": "法刺",
});

/** 推導出身。⭐ 純推導，⛔ 沒有手標的欄位（英雄卡的 `archetype` 只覆寫 4 格那一層）。 */
export function originOf(
  def: { attackType?: string } & Parameters<typeof primaryAttribute>[0],
  mixedRatio: number = MIXED_RATIO,
): Origin {
  const r = rankedAttrs(def);
  const [first, second, third] = r as [
    [number, "str" | "agi" | "int"],
    [number, "str" | "agi" | "int"],
    [number, "str" | "agi" | "int"],
  ];
  if (third[0] > 0 && first[0] / third[0] < mixedRatio) return "軟輔";
  if (second[0] > 0 && first[0] / second[0] < mixedRatio) {
    return MIXED[[first[1], second[1]].sort().join("|")] ?? "軟輔";
  }
  return PURE[first[1]][def.attackType === "ranged" ? 1 : 0];
}

/**
 * 10 個出身 → 4 個正規化定位。
 *
 * ⚠️ 這一層存在是因為 owner 只給了 **4 列**的移速/魔抗/裝甲表。收斂規則：
 * 混血跟著它的**主屬性**走（`originOf` 已經把主屬性算過了，這裡只是查表），
 * 均衡歸 `fighter`（沒有偏向就是軟輔戰士）。
 */
export const ORIGIN_TO_ARCHETYPE: Readonly<Record<Origin, Archetype>> = Object.freeze({
  坦克: "tank",
  砲手: "marksman",
  鬥士: "fighter",
  射手: "marksman",
  法鬥: "mage",
  法師: "mage",
  狂戰: "fighter",
  硬輔: "tank",
  法刺: "fighter",
  軟輔: "fighter",
});

export const ARCHETYPES = ["tank", "fighter", "marksman", "mage"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const ARCHETYPE_LABEL_ZH: Readonly<Record<Archetype, string>> = Object.freeze({
  tank: "坦克",
  fighter: "近戰",
  marksman: "遠程",
  mage: "法師",
});

/** 這一版真的會被正規化的屬性。⛔ 不在名單上的照舊讀 `baseStats`。 */
export const NORMALIZED_STAT_KEYS = [
  "ms", "mr", "armor",
  // ⭐ 2026-08-12 第三版 —— owner：「出身跟定位**是影響所有屬性**不是這幾項而已」。
  //   前兩版只做了三項，那是我讀錯了範圍。
  //   ⛔ `range` **不在名單上**：它的分佈是雙峰的（近戰 1.6 擠了 46 位、遠程 6–12），
  //     組間跨度 5.75×，而近戰/遠程是**型別**不是級別。用一把尺量它一定出事。
  "maxHealth", "maxMana", "ad", "ap", "as", "healthRegen", "manaRegen",
] as const;
export type NormalizedStatKey = (typeof NORMALIZED_STAT_KEYS)[number];

/**
 * 這一項的級距值要寫進哪一個通道。
 *
 * ⭐ owner 2026-08-12 立的法則：「**初始的屬性是用來補正角色個性化差異，
 * 成長是定位導向**」→ 所以定位驅動的東西原則上寫 `growth`，`baseStats` 留給個性。
 *
 * ⚠️ 但 `ms` **量測後不能走 growth**，這不是偏好是機制：
 * `最終值 = baseStats + attr(L)·係數 + growth·(L−1)`，而 growth **只能往上推，
 * 不能往下拉**。移速沒有三圍來源可以在反解時被減掉，而作者的初始移速
 * （2.6 .. 10.1，中位 5.9）本來就跨在三格目標的上下 —— 坦克與法師的初始移速
 * 已經**高於**「小」的目標，growth 填 0 也拉不下來。實測：坦克 15/16 位、
 * 法師 18/18 位被夾在 0，排序變成 近戰 7.25 > 坦克 5.95 > 遠程 5.80 > 法師 5.70，
 * **坦克跑到第二**。`armor`/`mr` 沒這個問題，因為它們有三圍項可以被減掉。
 *
 * ⛔ 所以這是一格**欄位**，不是註解裡的辯護（第一守則）。
 */
export type StatChannel = "baseStats" | "growth";

export interface StatNormalization {
  /**
   * ⭐ `normalized` 是出貨預設（owner 2026-08-11：「新的會變為預設，測試只會跑預設」）。
   * `legacy` 是**回滾用的逃生口** —— 扳過去，英雄數值就回到 `baseStats` 的原值，
   * **不需要部署**。⚠️ 舊數值一直留在英雄卡裡沒有被銷毀。
   */
  mode: "normalized" | "legacy";
  /**
   * 這一版真的套用的屬性。空陣列 = 機制在但什麼都不動（等同 legacy，但看得見它是空的）。
   * ⭐ 之後要開啟任何一項，改這一格就好，不用動程式。
   */
  appliesTo: readonly NormalizedStatKey[];
  /** 每一項的三格數值。⭐ 錨點是量出來的中位數，階梯是指定的。 */
  bands: Readonly<Record<NormalizedStatKey, Readonly<Record<NormalBand, number>>>>;
  /**
   * archetype → 這一項該落在哪一格。⭐ 這張表就是 owner 那兩句話，
   * 一格一格填進來 —— 想改任何一格都是後台的事，不是改程式。
   */
  byArchetype: Readonly<Record<NormalizedStatKey, Readonly<Record<Archetype, NormalBand>>>>;
  /**
   * ⭐ **出身** → 這一項落在哪一格（owner 2026-08-12：「你要重新寫出**定位 10 種**
   * 如何影響極小小中大極大的**所有屬性**」）。
   *
   * ⚠️ 它**優先於** `byArchetype`：查得到就用它，查不到才退回四格那一張。
   * 兩張表並存是刻意的 —— 四格那張是 owner 親自逐字給的，10 格這張是我依它擴出來的，
   * 而擴的過程有幾格是設計不是量測（見 `DEFAULT_STAT_NORMALIZATION` 的註解）。
   * 留著四格那張，扳回去只要把這一格清空。
   */
  byOrigin: Readonly<Record<NormalizedStatKey, Readonly<Partial<Record<Origin, NormalBand>>>>>;
  /**
   * 每一項寫進哪一個通道。⭐ 見 `StatChannel` —— `ms` 走 `baseStats` 是量出來的，
   * 不是偏好。想改任何一格都是後台的事。
   */
  channel: Readonly<Record<NormalizedStatKey, StatChannel>>;
  /**
   * `growth` 通道的**基準等級** —— 級距的數字是「這一級的最終總值」。
   *
   * ⚠️ 出貨 18。⛔ 但 `LEVEL_CAP` 是 99、回合制實際會發到更高，所以這一格
   * 遲早會想改 —— 那正是它是欄位而不是常數的理由。
   */
  referenceLevel: number;
  /**
   * 反解出**負成長**時要不要照填。出貨 `false`（夾到 0）。
   *
   * ⚠️ `false` 的代價是**目標可能達不到**：一位初始值已經高過目標的英雄，
   * 成長填 0 也降不下來。要真的降下來只有兩條路 —— 改他的 `baseStats`（個性層，
   * owner 的法則說那是個性不該被定位覆蓋），或把這一格開成 `true`（讓屬性隨等級下降）。
   */
  allowNegativeGrowth: boolean;
  /**
   * 🔴 **變身態往上位移幾格**（owner 2026-08-12 之後才浮出來的問題）。
   *
   * ⚠️ 只做三項（移速/魔抗/裝甲）時 `skipTransformedBodies` 是對的：跳過就好。
   * 擴到**十項**之後它變成缺陷 —— 本體被推到級距值，變身態保留作者原值，
   * 於是**變身可能比本體弱**。實測：小呆變身成龍魔人之後 AD 95.4 < 本體 97.0，
   * 索隆的霸氣形態裝甲 25.3 < 本體 33.6。⛔ 那是「變身」這件事的反面。
   *
   * ⭐ 所以變身態改成**一起正規化，但級距往上位移 `transformBandShift` 格**：
   * 本體「中」→ 變身「大」，本體「大」→ 變身「極大」，已經是極大就停在極大。
   * 出貨 **1**。填 0 = 變身與本體同級（不建議，變身就沒有意義了）。
   *
   * ⚠️ `skipTransformedBodies` 仍然在，而且**它贏** —— 想完全不碰變身態就把它打開。
   */
  transformBandShift: number;
  /**
   * ⭐ 變身態的身體要不要一起正規化。**出貨 `false`（＝一起做，但往上位移）**。
   *
   * ⚠️ 這一格是被守衛逼出來的，不是想出來的。第一版沒有它，結果：
   * 變身態與本體的 archetype 幾乎一定相同（同一個主屬性、同一種攻擊型別），
   * 所以正規化會把兩者的移速/魔抗**變成同一個數字** ——
   * **超級賽亞人不再比悟空快、霸氣索隆不再比索隆抗魔**，變身的強化整個消失。
   * `championFormGoku.test.ts` 與 `windOrbAndFormBuffs.test.ts` 當場紅了。
   *
   * ⭐ 而這在 owner 的模型下是自洽的：變身態**本來就是一個例外狀態**，
   * 它不該被正常分佈的尺量。等他決定「變身態的級別該怎麼相對於本體」之後
   * （+1 格？還是由變身技能當 buff 加？），再把這一格關掉。
   *
   * ⛔ 不要把它改成 false 然後在別處補一個 if —— 那就是把一個決策點藏進程式。
   */
  skipTransformedBodies: boolean;
}

/**
 * 出貨值。
 *
 * ⭐ `bands` 的三個數字：錨點 = 74 位母體的**中位數**（量出來的），
 * 階梯 = **r = 1.25**（指定的；三帶模型下 大/小 = r² = 1.5625）。
 * 小 = 中 ÷ 1.25、大 = 中 × 1.25。
 *
 * ⭐ `byArchetype` 逐字來自 owner 2026-08-12：
 *   移速：遠距離＝中 · 近距離＝快 · 坦克＝中或慢（取慢）· 法師＝中或慢，慢為主（取慢）
 *   魔抗：遠距離及法師＝弱 · 近距離＝中 · 坦克＝高
 *
 * ⚠️ 這裡的數字與 `content/config/stat-normalization.json` 必須一致，
 * `configDrift.test.ts` 那一族在守（第一守則的三個住處）。
 */
export const DEFAULT_STAT_NORMALIZATION: StatNormalization = Object.freeze({
  mode: "normalized",
  // ⭐ 2026-08-12 第三版 —— owner：「出身跟定位**是影響所有屬性**不是這幾項而已」。
  //   前兩版只做了 ms/mr/armor，那是我把範圍讀窄了。
  //   ⛔ `range` 仍然不在名單上：分佈是雙峰的（近戰 1.6 擠 46 位、遠程 6–12，
  //     組間跨度 5.75×），而近戰/遠程是**型別**不是級別。
  appliesTo: Object.freeze([
    "ms", "mr", "armor", "maxHealth", "maxMana", "ad", "ap", "as", "healthRegen", "manaRegen",
  ] as const),
  // 「中」= 量出來的母體中位數（73 位可達英雄，等級 18；移速那一格是等級 1）。
  // 五格由 `bandsFromMedian()` 推 —— ⛔ 不手打五個數字。
  bands: Object.freeze({
    ms: bandsFromMedian(5.0),
    mr: bandsFromMedian(76.72),
    armor: bandsFromMedian(25.39),
    maxHealth: bandsFromMedian(1879.8),
    maxMana: bandsFromMedian(1160.75),
    ad: bandsFromMedian(106.0),
    ap: bandsFromMedian(47.2),
    as: bandsFromMedian(1.5),
    healthRegen: bandsFromMedian(3.72),
    manaRegen: bandsFromMedian(4.63),
  }),
  // ⚠️ 四格那張是 owner 2026-08-12 逐字給的，留著當退路（`byOrigin` 清空就回到它）。
  byArchetype: Object.freeze({



    maxHealth: Object.freeze({ tank: "中", fighter: "中", marksman: "中", mage: "中" } as const),
    maxMana: Object.freeze({ tank: "中", fighter: "中", marksman: "中", mage: "中" } as const),
    ad: Object.freeze({ tank: "中", fighter: "中", marksman: "中", mage: "中" } as const),
    ap: Object.freeze({ tank: "中", fighter: "中", marksman: "中", mage: "中" } as const),
    as: Object.freeze({ tank: "中", fighter: "中", marksman: "中", mage: "中" } as const),
    healthRegen: Object.freeze({ tank: "中", fighter: "中", marksman: "中", mage: "中" } as const),
    manaRegen: Object.freeze({ tank: "中", fighter: "中", marksman: "中", mage: "中" } as const),
    ms: Object.freeze({ tank: "小", fighter: "大", marksman: "中", mage: "小" } as const),
    mr: Object.freeze({ tank: "小", fighter: "中", marksman: "小", mage: "大" } as const),
    armor: Object.freeze({ tank: "大", fighter: "中", marksman: "小", mage: "小" } as const),
  }),
  /*
   * ⭐ 10 出身 × 10 屬性。每一列讀起來要像一句話：
   *
   *   坦克  生命極大 · 裝甲極大 · 魔力極小 · 回魔極小 · 法強極小   ← 最厚也最笨
   *   砲手  攻擊力極大 · 攻速極小 · 移速極小                      ← 一發很重，動不了
   *   鬥士  攻速極大 · 移速極大 · 法強極小                        ← 全場最快
   *   法師  魔力/回魔/法強/魔抗**四個極大**，生命/回血/裝甲/AD 四個極小 ← 極端後排
   *   軟輔  十項全部中                                            ← 沒有偏向
   *
   * ⚠️ 有幾格是**設計不是量測**，列出來讓 owner 一眼看得到要不要扳回去：
   *   · 遠程（射手）的 AD 量到是全場最低，但表上給「中」—— 射手沒有 AD 不合理
   *   · 坦克（坦克）的 AD 量到最高（力量推導），表上保留「大」
   *   · 法鬥/硬輔/法刺三個混血是**新格子**（母體各只有 4/3/5 位），量測支撐弱
   */
  byOrigin: Object.freeze({
    ms: Object.freeze({ 坦克: "小", 砲手: "極小", 鬥士: "極大", 射手: "中", 法鬥: "中", 法師: "小", 狂戰: "大", 硬輔: "小", 法刺: "大", 軟輔: "中" } as const),
    mr: Object.freeze({ 坦克: "小", 砲手: "中", 鬥士: "中", 射手: "小", 法鬥: "大", 法師: "極大", 狂戰: "小", 硬輔: "大", 法刺: "中", 軟輔: "中" } as const),
    armor: Object.freeze({ 坦克: "極大", 砲手: "中", 鬥士: "中", 射手: "小", 法鬥: "中", 法師: "極小", 狂戰: "中", 硬輔: "大", 法刺: "小", 軟輔: "中" } as const),
    maxHealth: Object.freeze({ 坦克: "極大", 砲手: "大", 鬥士: "中", 射手: "小", 法鬥: "中", 法師: "極小", 狂戰: "大", 硬輔: "大", 法刺: "小", 軟輔: "中" } as const),
    maxMana: Object.freeze({ 坦克: "極小", 砲手: "小", 鬥士: "小", 射手: "中", 法鬥: "大", 法師: "極大", 狂戰: "極小", 硬輔: "大", 法刺: "中", 軟輔: "中" } as const),
    ad: Object.freeze({ 坦克: "大", 砲手: "極大", 鬥士: "大", 射手: "中", 法鬥: "中", 法師: "極小", 狂戰: "大", 硬輔: "中", 法刺: "中", 軟輔: "中" } as const),
    ap: Object.freeze({ 坦克: "極小", 砲手: "小", 鬥士: "極小", 射手: "中", 法鬥: "大", 法師: "極大", 狂戰: "極小", 硬輔: "大", 法刺: "大", 軟輔: "中" } as const),
    as: Object.freeze({ 坦克: "小", 砲手: "極小", 鬥士: "極大", 射手: "大", 法鬥: "中", 法師: "小", 狂戰: "大", 硬輔: "小", 法刺: "大", 軟輔: "中" } as const),
    healthRegen: Object.freeze({ 坦克: "大", 砲手: "中", 鬥士: "中", 射手: "小", 法鬥: "中", 法師: "極小", 狂戰: "大", 硬輔: "中", 法刺: "小", 軟輔: "中" } as const),
    manaRegen: Object.freeze({ 坦克: "極小", 砲手: "小", 鬥士: "小", 射手: "中", 法鬥: "大", 法師: "極大", 狂戰: "極小", 硬輔: "大", 法刺: "大", 軟輔: "中" } as const),
  }),
  channel: Object.freeze({
    // ⭐ owner：「**初始的屬性是用來補正角色個性化差異，成長是定位導向**」
    //   → 九項走 growth。⛔ 移速是唯一的例外，而且是量出來的機制限制：
    //     成長只能往上推不能往下拉，而移速沒有三圍來源可以在反解時被減掉。
    ms: "baseStats",
    mr: "growth", armor: "growth", maxHealth: "growth", maxMana: "growth",
    ad: "growth", ap: "growth", as: "growth", healthRegen: "growth", manaRegen: "growth",
  } as const),
  referenceLevel: 18,
  allowNegativeGrowth: false,
  // 🔴 從 true 改成 false + 位移 1 格 —— 理由寫在 `transformBandShift` 那一格：
  //   十項全做之後「跳過變身」會讓變身比本體弱。
  transformBandShift: 1,
  skipTransformedBodies: false,
}) as StatNormalization;

/** 三格數值的上下界。`schema/config.ts` 與後台欄位共用這一組。 */
export const BAND_VALUE_MIN = 0.01;
export const BAND_VALUE_MAX = 100000;

/** 把級別往上（或往下）位移，兩端夾住。 */
export function shiftBand(band: NormalBand, steps: number): NormalBand {
  const i = NORMAL_BANDS.indexOf(band);
  if (i < 0) return band;
  return NORMAL_BANDS[Math.min(NORMAL_BANDS.length - 1, Math.max(0, i + steps))]!;
}

function isArchetype(v: unknown): v is Archetype {
  return typeof v === "string" && (ARCHETYPES as readonly string[]).includes(v);
}
function isBand(v: unknown): v is NormalBand {
  return typeof v === "string" && (NORMAL_BANDS as readonly string[]).includes(v);
}

/**
 * 主屬性 —— 用 **lv10 權重**（初始 + 成長×9）。
 *
 * ⚠️ 不是只看初始值。一位初始平均但智慧成長最快的英雄，在實打的第 5–6 回合
 * 就已經是法師了，而那正是玩家有感的時點。
 *
 * ⛔ 平手時的順序是 str → agi → int，寫死並在這裡說明：平手在出貨資料裡不存在
 * （74 位都有唯一的最大值），但一個沒有定義的平手規則會讓未來某一位英雄的
 * archetype 隨 JS 物件的鍵序漂移 —— 那種缺陷不會報錯。
 */
export function primaryAttribute(def: {
  attributes?: {
    str?: number;
    agi?: number;
    int?: number;
    strGrowth?: number;
    agiGrowth?: number;
    intGrowth?: number;
  };
}): "str" | "agi" | "int" {
  // 🔴 三圍的成長住在 `attributes.strGrowth`，**不是** `growth.str` ——
  //    `growth` 那個物件放的是**屬性**的成長（maxHealth / ad / …），不是三圍。
  //    2026-08-12 出貨過一次讀錯欄位的版本（v0.14.0）：`def.growth.str` 在真實
  //    英雄卡上永遠是 undefined，所以 lv10 權重整個變成 no-op，
  //    archetype 實際只用了初始值 —— 而且**不會報錯**。
  const a = def.attributes ?? {};
  const at = (k: "str" | "agi" | "int"): number =>
    (a[k] ?? 0) + (a[`${k}Growth` as "strGrowth" | "agiGrowth" | "intGrowth"] ?? 0) * 9;
  const s = at("str");
  const ag = at("agi");
  const i = at("int");
  if (s >= ag && s >= i) return "str";
  if (ag >= i) return "agi";
  return "int";
}

/**
 * 推導 archetype。⭐ 這是**預設值** —— 英雄卡的 `archetype` 欄位填了就以它為準。
 *
 * ⛔ 不要用 `doc.role`：它只有三個值（fighter 51 / marksman 22 / tank 1），
 * 51 位 fighter 裡混了坦克與法師。那是匯入時的粗分類，不是設計。
 */
export function deriveArchetype(def: {
  attackType?: string;
  attributes?: Parameters<typeof primaryAttribute>[0]["attributes"];
}): Archetype {
  const primary = primaryAttribute(def);
  if (primary === "int") return "mage";
  if (def.attackType === "ranged") return "marksman";
  return primary === "str" ? "tank" : "fighter";
}

/** 英雄卡上填的（若有）優先於推導。 */
export function archetypeOf(def: { archetype?: unknown } & Parameters<typeof deriveArchetype>[0]): Archetype {
  return isArchetype(def.archetype) ? def.archetype : deriveArchetype(def);
}

/** 把一份 `config.stat-normalization@1` 文件正規化成規則物件。認不得 → 出貨值。 */
export function statNormalizationFromDoc(doc: unknown): StatNormalization {
  const d = doc as Record<string, unknown> | undefined;
  if (!d || d["schema"] !== "config.stat-normalization@1") return DEFAULT_STAT_NORMALIZATION;
  const mode = d["mode"] === "legacy" ? "legacy" : "normalized";
  const raw = Array.isArray(d["appliesTo"]) ? (d["appliesTo"] as unknown[]) : undefined;
  const appliesTo = (raw ?? DEFAULT_STAT_NORMALIZATION.appliesTo).filter(
    (k): k is NormalizedStatKey => (NORMALIZED_STAT_KEYS as readonly unknown[]).includes(k),
  );
  const bands = {} as Record<NormalizedStatKey, Record<NormalBand, number>>;
  const byArchetype = {} as Record<NormalizedStatKey, Record<Archetype, NormalBand>>;
  for (const key of NORMALIZED_STAT_KEYS) {
    const b = (d["bands"] as Record<string, Record<string, unknown>> | undefined)?.[key];
    const a = (d["byArchetype"] as Record<string, Record<string, unknown>> | undefined)?.[key];
    bands[key] = { ...DEFAULT_STAT_NORMALIZATION.bands[key] };
    byArchetype[key] = { ...DEFAULT_STAT_NORMALIZATION.byArchetype[key] };
    for (const band of NORMAL_BANDS) {
      const v = b?.[band];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        bands[key][band] = Math.min(Math.max(v, BAND_VALUE_MIN), BAND_VALUE_MAX);
      }
    }
    for (const arc of ARCHETYPES) {
      const v = a?.[arc];
      if (isBand(v)) byArchetype[key][arc] = v;
    }
  }
  const byOrigin = {} as Record<NormalizedStatKey, Partial<Record<Origin, NormalBand>>>;
  for (const key of NORMALIZED_STAT_KEYS) {
    const o = (d["byOrigin"] as Record<string, Record<string, unknown>> | undefined)?.[key];
    byOrigin[key] = { ...(DEFAULT_STAT_NORMALIZATION.byOrigin[key] ?? {}) };
    for (const org of ORIGINS) {
      const v = o?.[org];
      if (isBand(v)) byOrigin[key][org] = v;
    }
  }
  const channel = {} as Record<NormalizedStatKey, StatChannel>;
  for (const key of NORMALIZED_STAT_KEYS) {
    const v = (d["channel"] as Record<string, unknown> | undefined)?.[key];
    channel[key] =
      v === "baseStats" || v === "growth" ? v : DEFAULT_STAT_NORMALIZATION.channel[key];
  }
  const shiftRaw = d["transformBandShift"];
  const skip = d["skipTransformedBodies"];
  const ref = d["referenceLevel"];
  const neg = d["allowNegativeGrowth"];
  return {
    mode,
    appliesTo,
    bands,
    byArchetype,
    byOrigin,
    channel,
    // ⚠️ 基準等級至少是 2 —— growth 通道除以 `(ref − 1)`，1 會變成除以零。
    referenceLevel:
      typeof ref === "number" && Number.isFinite(ref) && ref >= 2
        ? Math.floor(ref)
        : DEFAULT_STAT_NORMALIZATION.referenceLevel,
    transformBandShift:
      typeof shiftRaw === "number" && Number.isFinite(shiftRaw)
        ? Math.max(-4, Math.min(4, Math.round(shiftRaw)))
        : DEFAULT_STAT_NORMALIZATION.transformBandShift,
    allowNegativeGrowth:
      typeof neg === "boolean" ? neg : DEFAULT_STAT_NORMALIZATION.allowNegativeGrowth,
    skipTransformedBodies:
      typeof skip === "boolean" ? skip : DEFAULT_STAT_NORMALIZATION.skipTransformedBodies,
  };
}

/**
 * ⭐ 全專案**唯一**知道「級別怎麼變成英雄卡上的數字」的地方。
 *
 * 回傳一份改寫過的英雄文件（不 mutate 輸入）。`legacy` 或 `appliesTo` 空 → 原樣返回。
 *
 * ⚠️ 它改的是 `baseStats.<key>`，然後照舊讓 `championStatBase()` 去跑三層公式 ——
 * ⛔ 不是繞過那支函式自己算。繞過去就是 CLAUDE.md 的失敗形態⑤
 *（被測的不是出貨的那個），而這一版正規化的兩項（移速/魔抗）**沒有三圍來源**，
 * 所以改 `baseStats` 就等於改最終值，行為上完全等價而且只有一個算法入口。
 */
/**
 * ⭐ 反解需要的**唯一**外部知識：出貨的 `championStatBase(def, stat, level)`。
 *
 * ⛔ **由呼叫端注入，`content/` 不 import `sim/stats/`。**
 * 2026-08-12 實測：那條 import 會做出模組初始化循環，症狀是三個**完全不相干**的
 * 測試開始紅（`aura` / `abilityShadowing` / `championFormVisibility`），
 * 而錯誤訊息指向別人的 base-bonus +600 MP —— 追錯方向的完美陷阱。
 *
 * ⭐ 而且注入之後**不需要知道任何係數**：三圍那一項可以整段用減法消掉
 *   （見 `resolveChampionStats`），所以這裡不用鏡射 `ATTR_STAT_SOURCE`，
 *   也沒有第二份會過期的清單。
 */
export interface StatResolveDeps {
  statAt(def: unknown, key: NormalizedStatKey, level: number): number;
}

export function resolveChampionStats<T extends Record<string, unknown>>(
  def: T,
  cfg: StatNormalization,
  deps?: StatResolveDeps,
): T {
  if (cfg.mode !== "normalized" || cfg.appliesTo.length === 0) return def;
  // ⭐ 變身態預設跳過 —— 理由寫在 `skipTransformedBodies` 那一格：不跳的話
  //   變身的強化會被抹平（超級賽亞人不再比悟空快）。
  const isAlternate = (def["transform"] as { role?: unknown } | undefined)?.role === "alternate";
  if (cfg.skipTransformedBodies && isAlternate) return def;
  // ⭐ 變身態往上位移 —— 讓「變身」在數值上真的是升級。
  const shift = isAlternate ? Math.round(cfg.transformBandShift) : 0;
  const arc = archetypeOf(def as never);
  // ⭐ 出身（10 格）優先於定位（4 格）—— 查得到就用它。
  //   ⚠️ 兩張表並存是刻意的，理由寫在 `byOrigin` 那一格。
  const org = originOf(def as never);
  const base = { ...((def["baseStats"] as Record<string, number> | undefined) ?? {}) };
  const growth = { ...((def["growth"] as Record<string, number> | undefined) ?? {}) };
  let touchedBase = false;
  let touchedGrowth = false;
  for (const key of cfg.appliesTo) {
    const raw = cfg.byOrigin[key]?.[org] ?? cfg.byArchetype[key]?.[arc];
    const band = raw === undefined ? undefined : shiftBand(raw, shift);
    const target = band === undefined ? undefined : cfg.bands[key]?.[band];
    if (typeof target !== "number") continue;

    if (cfg.channel[key] === "growth") {
      // ⭐ 反解「基準等級的最終總值」—— **用解斜率，不用減法**。
      //
      //   減法版（`最終值(ref) − 作者成長×(ref−1)`）只對**加法**的三圍項成立。
      //   🔴 攻速不是：`ATTR_STAT_SOURCE[AttackSpeed]` 是 **scaleBase**（乘法），
      //     所以 `最終值 = (baseStats + growth×(ref−1)) × (1 + 敏捷×係數)`，
      //     減法會少扣一個倍率，而且**不會報錯** —— 只是解出一個偏小的成長。
      //
      //   斜率版對兩種都對，因為最終值對 growth 恆為**線性**：
      //     g0 = 成長填 0 時的最終值 · g1 = 成長填 1 時的最終值
      //     斜率 = g1 − g0  ⇒  需要的成長 = (target − g0) / 斜率
      //
      // ⛔ 這裡仍然一個係數都沒有出現 —— 兩次呼叫出貨的算式，讓它自己把倍率算進去。
      if (!deps) continue; // 沒注入就什麼都不做（fail-safe，⛔ 不猜）
      const ref = cfg.referenceLevel;
      const probe = (g: number): number =>
        deps.statAt({ ...def, growth: { ...growth, [key]: g } }, key, ref);
      const g0 = probe(0);
      const slope = probe(1) - g0;
      if (!Number.isFinite(slope) || slope === 0) continue; // 這一項沒有成長通道
      const needed = (target - g0) / slope;
      growth[key] = cfg.allowNegativeGrowth ? needed : Math.max(0, needed);
      touchedGrowth = true;
      continue;
    }

    // `baseStats` 通道：級距的數字是「等級 1 的最終值」，所以要反解掉 L1 的三圍項。
    // ⚠️ 對移速那一項 `attrPart` 恆為 0（移速沒有三圍來源），但**照樣算** ——
    //    寫死 0 就是替未來某一天「移速也吃某個三圍」埋一個不會報錯的缺陷。
    const attrPart = deps ? deps.statAt(def, key, 1) - (base[key] ?? 0) : 0;
    base[key] = target - attrPart;
    touchedBase = true;
  }
  if (!touchedBase && !touchedGrowth) return def;
  const out = { ...def } as Record<string, unknown>;
  if (touchedBase) out["baseStats"] = base;
  if (touchedGrowth) out["growth"] = growth;
  return out as T;
}

/** 給後台與稽核用：這位英雄在 `normalized` 下每一項落在哪一格。 */
export function bandsOf(
  def: Parameters<typeof archetypeOf>[0],
  cfg: StatNormalization,
): Partial<Record<NormalizedStatKey, NormalBand>> {
  const arc = archetypeOf(def);
  const out: Partial<Record<NormalizedStatKey, NormalBand>> = {};
  for (const key of cfg.appliesTo) out[key] = cfg.byArchetype[key]?.[arc];
  return out;
}

/** 型別出口，讓 registries 不用 import ChampionDef 也能標註。 */
export type ChampionLike = Pick<ChampionDef, "id"> & Record<string, unknown>;
