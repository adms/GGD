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

/** 三格分佈（小/中/大）。⛔ 極小/極大**不在這裡** —— 它們是上下限，不是格。 */
export const NORMAL_BANDS = ["小", "中", "大"] as const;
export type NormalBand = (typeof NORMAL_BANDS)[number];

/** 完整的五個名稱（含兩個例外槽），給落點表與後台下拉用。 */
export const ALL_BANDS = ["極小", "小", "中", "大", "極大"] as const;
export type Band = (typeof ALL_BANDS)[number];

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
 * 實測分佈（母體 73）：刃舞 21 · 壁壘 20 · 咒術 13 · 影術 5 · 遊獵 5 · 魔劍 4 ·
 * 符將 3 · 狂鬥 2 · **重砲 0** · **全能 0** —— 兩個空格是新角色的位置。
 */
export const ORIGINS = [
  "壁壘", // 力量 · 近戰
  "重砲", // 力量 · 遠程
  "刃舞", // 敏捷 · 近戰
  "遊獵", // 敏捷 · 遠程
  "魔劍", // 智慧 · 近戰　⭐ owner 說的「魔法劍士」
  "咒術", // 智慧 · 遠程
  "狂鬥", // 力量 × 敏捷
  "符將", // 力量 × 智慧　⭐ owner 說的「力量法師」
  "影術", // 敏捷 × 智慧
  "全能", // 三圍都在門檻內
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
  str: ["壁壘", "重砲"],
  agi: ["刃舞", "遊獵"],
  int: ["魔劍", "咒術"],
});
const MIXED: Readonly<Record<string, Origin>> = Object.freeze({
  "agi|str": "狂鬥",
  "int|str": "符將",
  "agi|int": "影術",
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
  if (third[0] > 0 && first[0] / third[0] < mixedRatio) return "全能";
  if (second[0] > 0 && first[0] / second[0] < mixedRatio) {
    return MIXED[[first[1], second[1]].sort().join("|")] ?? "全能";
  }
  return PURE[first[1]][def.attackType === "ranged" ? 1 : 0];
}

/**
 * 10 個出身 → 4 個正規化定位。
 *
 * ⚠️ 這一層存在是因為 owner 只給了 **4 列**的移速/魔抗/裝甲表。收斂規則：
 * 混血跟著它的**主屬性**走（`originOf` 已經把主屬性算過了，這裡只是查表），
 * 均衡歸 `fighter`（沒有偏向就是全能戰士）。
 */
export const ORIGIN_TO_ARCHETYPE: Readonly<Record<Origin, Archetype>> = Object.freeze({
  壁壘: "tank",
  重砲: "marksman",
  刃舞: "fighter",
  遊獵: "marksman",
  魔劍: "mage",
  咒術: "mage",
  狂鬥: "fighter",
  符將: "tank",
  影術: "fighter",
  全能: "fighter",
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
export const NORMALIZED_STAT_KEYS = ["ms", "mr", "armor"] as const;
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
   * ⭐ 變身態的身體要不要一起正規化。**出貨 `true`（＝跳過）**。
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
  // ⭐ 2026-08-12 第二版：魔抗解禁 + 裝甲加入。
  //
  //   v0.14.0 把魔抗鎖起來的理由是「智慧推導會讓法師魔抗最高，與設計相反」。
  //   owner 當天的裁決把那個前提整個換掉了：
  //     「是我忘了這個設定，我們**引入防禦/裝甲來平衡這個現象**」
  //   → 順著智慧推導讓**法師魔抗大**，改用**裝甲**把坦克撐起來。
  //   於是引擎本來就在做的事變成**對的**，不再需要對抗它。⭐ 魔抗鎖解除。
  appliesTo: Object.freeze(["ms", "mr", "armor"] as const),
  bands: Object.freeze({
    // ⚠️ 語意逐通道不同：
    //   · `baseStats` 通道（ms）→ 「等級 1 的最終值」
    //   · `growth` 通道（mr/armor）→ 「**基準等級的最終總值**」（出貨基準 = 18）
    //   兩者不可混用，改通道就要換整組數字。
    ms: Object.freeze({ 小: 4.64, 中: 5.8, 大: 7.25 }),
    mr: Object.freeze({ 小: 61.38, 中: 76.72, 大: 95.9 }),
    armor: Object.freeze({ 小: 20.96, 中: 26.2, 大: 32.75 }),
  }),
  byArchetype: Object.freeze({
    // ⭐ 逐字來自 owner 2026-08-12 的四列表：
    //   坦克 力量主+近戰  移速 小 · 魔抗 小 · 裝甲 大
    //   近戰 敏捷主+近戰  移速 大 · 魔抗 中 · 裝甲 中
    //   法師 智慧主       移速 小 · 魔抗 大 · 裝甲 小
    //   遠程 敏捷主+遠程  移速 中 · 魔抗 小 · 裝甲 小
    ms: Object.freeze({ tank: "小", fighter: "大", marksman: "中", mage: "小" } as const),
    mr: Object.freeze({ tank: "小", fighter: "中", marksman: "小", mage: "大" } as const),
    armor: Object.freeze({ tank: "大", fighter: "中", marksman: "小", mage: "小" } as const),
  }),
  channel: Object.freeze({ ms: "baseStats", mr: "growth", armor: "growth" } as const),
  referenceLevel: 18,
  allowNegativeGrowth: false,
  skipTransformedBodies: true,
}) as StatNormalization;

/** 三格數值的上下界。`schema/config.ts` 與後台欄位共用這一組。 */
export const BAND_VALUE_MIN = 0.01;
export const BAND_VALUE_MAX = 100000;

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
  const channel = {} as Record<NormalizedStatKey, StatChannel>;
  for (const key of NORMALIZED_STAT_KEYS) {
    const v = (d["channel"] as Record<string, unknown> | undefined)?.[key];
    channel[key] =
      v === "baseStats" || v === "growth" ? v : DEFAULT_STAT_NORMALIZATION.channel[key];
  }
  const skip = d["skipTransformedBodies"];
  const ref = d["referenceLevel"];
  const neg = d["allowNegativeGrowth"];
  return {
    mode,
    appliesTo,
    bands,
    byArchetype,
    channel,
    // ⚠️ 基準等級至少是 2 —— growth 通道除以 `(ref − 1)`，1 會變成除以零。
    referenceLevel:
      typeof ref === "number" && Number.isFinite(ref) && ref >= 2
        ? Math.floor(ref)
        : DEFAULT_STAT_NORMALIZATION.referenceLevel,
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
  if (cfg.skipTransformedBodies) {
    const role = (def["transform"] as { role?: unknown } | undefined)?.role;
    if (role === "alternate") return def;
  }
  const arc = archetypeOf(def as never);
  const base = { ...((def["baseStats"] as Record<string, number> | undefined) ?? {}) };
  const growth = { ...((def["growth"] as Record<string, number> | undefined) ?? {}) };
  let touchedBase = false;
  let touchedGrowth = false;
  for (const key of cfg.appliesTo) {
    const band = cfg.byArchetype[key]?.[arc];
    const target = band === undefined ? undefined : cfg.bands[key]?.[band];
    if (typeof target !== "number") continue;

    if (cfg.channel[key] === "growth") {
      // ⭐ 反解「基準等級的最終總值」。
      //
      //   最終值(L) = baseStats + attr(L)·係數 + growth·(L−1)
      //   ⇒ 拿掉作者的成長項之後剩下的 = baseStats + attr(ref)·係數
      //   ⇒ 要達到 target，需要的成長 = (target − 那個剩下的) / (ref − 1)
      //
      // ⛔ 這裡**一個係數都沒有出現** —— 三圍那一項整段被減法消掉了，
      //    所以這段程式對「哪些屬性由哪個三圍推導」完全無知，也就不會過期。
      if (!deps) continue; // 沒注入就什麼都不做（fail-safe，⛔ 不猜）
      const ref = cfg.referenceLevel;
      const atRef = deps.statAt(def, key, ref);
      const authoredGrowthTerm = (growth[key] ?? 0) * (ref - 1);
      const withoutGrowth = atRef - authoredGrowthTerm;
      const needed = (target - withoutGrowth) / (ref - 1);
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
