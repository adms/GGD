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
 *    這是一條**不變量**（`statNormalization.test.ts` 的例外槽那條在守），不是一份觀察清單。
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
import { Stat } from "../sim/stats/statTypes";

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

/**
 * ⭐ 五格的**語意**（owner 2026-08-15，第一次給名稱以外的意思）：
 *
 * > 「極小=缺陷 小=偏低 中=標準 大=優勢 極大=特化」
 *
 * ⚠️ 這不是裝飾字。它改變了「一格該填什麼」的判準 ——
 * 「極大」讀成**特化**（少數、而且有明顯代價）而不是「這一格比較強」，
 * 「極小」讀成**缺陷**（刻意的弱點）而不是「還沒調好」。
 * owner 2026-08-12 同一個意思：「極大極小就是為了**極端例外**而誕生」。
 *
 * ⛔ 所以它必須跟 `NORMAL_BANDS` 住在一起並且一起出口 ——
 * 後台、外部編輯器合約與文件都要印同一組字，抄第二份就會分家。
 */
export const BAND_MEANING: Readonly<Record<NormalBand, string>> = Object.freeze({
  極小: "缺陷",
  小: "偏低",
  中: "標準",
  大: "優勢",
  極大: "特化",
});

/**
 * 級距值保留幾位小數。⭐ owner 2026-08-13：「你**計算的位數太多了**，
 * 我建議**最多取小數點兩位**就好」。
 *
 * ⚠️ 這一格只管**級距值**（＝那三十個數字，也就是他會在後台/Excel 上看到並編輯的）。
 * ⛔ 它**不套用在反解出來的每級成長**上 —— 那是引擎內部算出來的中間值，
 * 而且對小數值的屬性會被捨掉：攻速「中」的每級成長是 **0.0133**，
 * 取兩位就變成 0.01，等級 99 的終值從 2.00 掉到 1.68（差 16%）。
 * 級距值本身取兩位是安全的（268.83 / 8477.97 / 4.00 都不失真）。
 */
export const BAND_DECIMALS = 2;

/** 級距階梯：`中` 乘上這些倍率。⛔ 兩條 r 都是 owner 給的，不是我挑的。 */
export const BAND_MULTIPLIER: Readonly<Record<NormalBand, number>> = Object.freeze({
  極小: 0.5,
  小: 1 / 1.25,
  中: 1,
  大: 1.25,
  極大: 2,
});

/**
 * 從「中」推出五格。⭐ 出貨表就是這樣長出來的，⛔ 不是手打五個數字。
 *
 * ⭐ `cap` 是那條屬性的**系統上限**（`config.stat-caps@1` 的 base）。
 * owner 2026-08-13：「攻速等數值有**系統上限 4 不應該成長超過**，
 * 其他也是請設 cap **不要顯示超過**」。
 *
 * ⚠️ 處理方式是**把整把梯子錨到上限上**（極大 = cap），⛔ 不是把超出的那幾格砍平。
 * 砍平會讓 中/大/極大 變成同一個數字，級距就消失了；錨定則保住五格的相對形狀。
 *
 * 實例：攻速在 L99 的母體中位數是 **9.98**，而系統上限是 **4** ——
 *   ⛔ 砍平：極小 2 / 小 3.2 / 中 4 / 大 4 / 極大 4　（三格黏在一起）
 *   ✅ 錨定：極小 1 / 小 1.6 / 中 2 / 大 2.5 / 極大 4　（五格都在，頂到上限為止）
 */
export function bandsFromMedian(mid: number, cap?: number): Readonly<Record<NormalBand, number>> {
  const top = BAND_MULTIPLIER["極大"];
  // 極大會超過上限 → 反推一個讓極大正好落在上限上的「中」。
  const anchored = cap !== undefined && mid * top > cap ? cap / top : mid;
  const out = {} as Record<NormalBand, number>;
  for (const b of NORMAL_BANDS) {
    const v = anchored * BAND_MULTIPLIER[b];
    // ⚠️ 再夾一次是保險絲不是政策：`cap/top × top` 的浮點誤差可能高出上限 1e-13，
    //   而那一格會在面板上顯示成「超過上限」。
    out[b] = Number(Math.min(v, cap ?? v).toFixed(BAND_DECIMALS));
  }
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

/** 一個值是不是合法的出身。 */
export function isOrigin(v: unknown): v is Origin {
  return typeof v === "string" && (ORIGINS as readonly string[]).includes(v);
}

/**
 * 出身。⭐ **英雄卡上的 `origin` 優先**（owner 2026-08-16 逐隻指派），
 * 填了就用它，沒填才推導 —— 跟 {@link archetypeOf} 同一個形狀（第一守則：
 * 推導是預設值，不是唯一來源）。
 *
 * ⚠️ 這一格在 2026-08-16 之前**不存在**，而那是一個真的洞：`byOrigin` 在正規化裡
 * 優先於 `byArchetype`，所以填 `archetype`（只有 4 格）**覆寫不到出身**（10 格），
 * 會靜靜地沒有作用。owner 這一批改動了 36/49 位，全部要靠這一格。
 */
export function originOf(
  def: { attackType?: string; origin?: unknown } & Parameters<typeof primaryAttribute>[0],
  mixedRatio: number = MIXED_RATIO,
): Origin {
  if (isOrigin(def.origin)) return def.origin;
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
/**
 * **尺標** —— {@link StatNormalization.bandsByScale} 的兩把階梯照這個分。
 *
 * ⚠️ 名字跟 `champion@1` 的 `attackType` 一樣，但它**不是**同一個東西，
 * ⛔ 也**不是**由它決定的。走哪一把由 {@link StatNormalization.scaleByOrigin}
 * 從**出身**查表（owner 2026-08-16：「依出身套用普攻距離」）。
 *
 * 🔴 這個區別是量出來的，不是潔癖：owner 那張表裡 **10/49 位**的 `attackType`
 * 與其出身的尺標**相反** —— 妙蛙種子／初音／南野秀一／巴恩／哆拉A夢 是 `melee`
 * 卻要走遠程尺（8.2），皮卡娘／傑洛士／白木卡迪那／死之王／涅吉 是 `ranged`
 * 卻要走近戰尺（1.4~1.6）。`attackType` 決定的是**投射物 vs 近身揮擊**，
 * 尺標決定的是**這個位置的距離量級**，兩者本來就獨立。
 */
export const SCALE_KEYS = ["melee", "ranged"] as const;
export type ScaleKey = (typeof SCALE_KEYS)[number];

export const NORMALIZED_STAT_KEYS = [
  "ms", "mr", "armor",
  // ⭐ 2026-08-12 第三版 —— owner：「出身跟定位**是影響所有屬性**不是這幾項而已」。
  //   前兩版只做了三項，那是我讀錯了範圍。
  "maxHealth", "maxMana", "ad", "ap", "as", "healthRegen", "manaRegen",
  // ⭐ 2026-08-16 第十一項 —— owner：「你補充第十一個屬性 攻擊距離 進來」。
  //
  //   ⚠️ 它在此之前被**刻意排除**，理由寫在這裡沒有失效：分佈是**雙峰**的。
  //   2026-08-16 重量（53 位可選本體）：
  //     近戰 n=39 → 1.2(×1) · 1.6(×31) · 2.0(×7)，中位 **1.6**
  //     遠程 n=14 → 6.0 ~ 12.0，中位 **8.2**
  //   組間跨度 **5.1×**，而近戰/遠程是**型別**不是級別。
  //
  //   ⭐ 解法不是「硬塞一把尺」，是**兩把尺**（{@link StatNormalization.bandsByScale}）：
  //   出身給的級距意思變成「**以你的型別而言**算遠還算近」，由英雄自己的
  //   `attackType` 選階梯。這同時解掉一個單尺絕對做不到的情況 ——
  //   **硬輔這個出身裡近戰遠程都有**（賈修貝爾 6.4 遠程 vs 另外兩位 1.6 近戰），
  //   任何單一絕對值都會把其中一半打成另一種型別。
  "range",
] as const;
export type NormalizedStatKey = (typeof NORMALIZED_STAT_KEYS)[number];

/**
 * 正規化鍵 → `Stat`。⭐ **全專案唯一一份**（`registries.ts` 的注入、守衛、
 * 文件產生器全部讀它）—— ⛔ 不要在別處再打一次這張表：它有 11 列，
 * 抄第二份的那一刻就開始有兩個答案，而且不會有任何東西紅。
 */
export const NORMALIZED_STAT_TO_STAT: Readonly<Record<NormalizedStatKey, Stat>> = Object.freeze({
  ms: Stat.MoveSpeed,
  mr: Stat.MagicResist,
  armor: Stat.Armor,
  maxHealth: Stat.MaxHealth,
  maxMana: Stat.MaxMana,
  ad: Stat.AttackDamage,
  ap: Stat.AbilityPower,
  as: Stat.AttackSpeed,
  healthRegen: Stat.HealthRegen,
  manaRegen: Stat.ManaRegen,
  range: Stat.AttackRange,
});

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
   * ⭐ **分成兩把階梯**的屬性（2026-08-16 加入，今天只有 `range`）。
   *
   * 查得到（而且 {@link scaleByOrigin} 說得出走哪一把）就**優先於** {@link bands}：
   * `bandsByScale[key][尺標]`。任何一步查不到就退回 `bands[key]`。
   *
   * ⚠️ 這**不是**為某一項屬性寫的 if（第〇·五守則）—— 它是一個**機制**：
   * 「這條屬性的分佈是雙峰的，兩群各有一把尺」。任何一項屬性只要填進這張表
   * 加上 {@link scaleByOrigin} 就會走這條路，⛔ 程式裡沒有任何一行提到 `range`。
   */
  bandsByScale: Readonly<
    Partial<Record<NormalizedStatKey, Readonly<Record<ScaleKey, Readonly<Record<NormalBand, number>>>>>>
  >;
  /**
   * ⭐ **出身 → 走哪一把尺**（owner 2026-08-16：「**依出身**套用普攻距離」）。
   *
   * 與 {@link byOrigin} 合起來，一個出身就完整決定了這一項的絕對值：
   * `bandsByScale[key][scaleByOrigin[key][出身]][byOrigin[key][出身]]`。
   * 例：砲手 → `ranged` × `極大` = **12**；法刺 → `melee` × `小` = **1.4**。
   *
   * 🔴 **為什麼鍵是出身而不是 `attackType`**（這是量出來的，⛔ 不是口味）：
   * owner 那張 49 位的表裡 **10 位**兩者相反 —— 妙蛙種子是 `melee` 但軟輔要 8.2，
   * 皮卡娘是 `ranged` 但法刺要 1.4。用 `attackType` 選尺，這 10 位會靜靜地
   * 落在**另一群**的量級上（差 5 倍），而且沒有任何東西會紅（第②號故障形態）。
   *
   * ⚠️ 缺一格出身 ⇒ 那個出身退回單尺 `bands[key]`，⛔ 不猜一把。
   */
  scaleByOrigin: Readonly<Partial<Record<NormalizedStatKey, Readonly<Partial<Record<Origin, ScaleKey>>>>>>;
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
   * ⭐ 出貨 **99**（owner 2026-08-13：「我**不要用等級 18 作為終值假設，我要等級 99**」）。
   * 那也正好是 `LEVEL_CAP`。
   *
   * ⚠️ 改這一格會讓 `bands` 的三十個數字**整組換一個意思** —— 它們是
   * 「**這一級**的最終總值」。18→99 之後全部重新量過（母體 L99 中位數）：
   *   魔抗 76.72 → 268.83 · 裝甲 25.39 → 131.36 · 生命 1,879.8 → 8,478.0
   *
   * 🔴 **攻速在 L99 的中位數是 9.98**，而 stat-caps 的解鎖上限是 10 ——
   *   也就是說到了 99 級每個人的攻速都貼在天花板上，攻速的級距在那一級
   *   **完全沒有作用**。那是內容的成長值本來就很大，不是這一版造成的，
   *   但 owner 應該知道。
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
   * ⭐ **出貨 0**（owner 2026-08-13）：變身態一視同仁，強化改由**變身技能的 buff**
   * 負責（技能標籤組合），卡片不必為變身留一份特例。
   * 填 1 = 回到「變身級距往上一格」的模型（本體中 → 變身大）。
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
  /**
   * ⭐ **`role` 由出身推導**（GH#1024 A4，2026-09-06）。出貨 `true`。
   *
   * 量到的（⛔ 不是估的）：71 份英雄卡的 `role` 有 **36 份**與
   * `ORIGIN_TO_ARCHETYPE[originOf(doc)]` 不一致 —— 因為 `role` 是匯入時的粗分類
   * （66/71 逐字等於 `attackType` 的別名：melee→fighter / ranged→marksman），
   * 而 `origin` 是 owner 2026-08-16 逐隻指派的**設計**。兩格各自為政 ⇒ 第〇·四守則的
   * 「兩份會漂的真相」；第〇·六守則的階梯說設計（第 1 層）贏過匯入（第 5 層）。
   *
   * `true`  ⇒ 註冊表上的 `role` ＝ `ORIGIN_TO_ARCHETYPE[originOf(doc)]`（四格：
   *           tank / fighter / marksman / mage），英雄卡上的 `role` 格**只是退路原始值**。
   * `false` ⇒ 回到今天：註冊表照抄英雄卡的 `role`（缺席才推導）。
   *
   * ⚠️ 消費端在 `registries.ts`（`resolveChampionRole`）；讀 `role` 的下游是圖鑑的
   * 定位篩選／標籤（`codexLabels.ts`）與戰後評分的權重向量（`sim/stats/rating.ts`）
   * ⇒ 開著時那 36 位的圖鑑標籤與評分權重會變 —— 這就是它是一格開關而不是一行程式的理由。
   */
  roleFromOrigin: boolean;
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
 * ⚠️ 這裡的數字與 `content/config/stat-normalization.json` 必須一致 ——
 * 閘：`statNormalizationShipped.test.ts`（讀出貨檔過 fromDoc 與 DEFAULT 逐位元比對；
 * statNormalization.test.ts 只用 DEFAULT_ 推導，不讀出貨 JSON）。
 */
export const DEFAULT_STAT_NORMALIZATION: StatNormalization = Object.freeze({
  mode: "normalized",
  // ⭐ 2026-08-12 第三版 —— owner：「出身跟定位**是影響所有屬性**不是這幾項而已」。
  //   前兩版只做了 ms/mr/armor，那是我把範圍讀窄了。
  //   ⛔ `range` 仍然不在名單上：分佈是雙峰的（近戰 1.6 擠 46 位、遠程 6–12，
  //     組間跨度 5.75×），而近戰/遠程是**型別**不是級別。
  // 🔴 **攻速最終仍然不在名單裡 —— 第二次量出來的理由和第一次不同。**
  //
  //   第一次拿掉：`agiToAttackSpeed = 0.02` 讓 L99 攻速中位到 12.2（上限的 3 倍），
  //   梯子錨到上限後 36/53 位的成長被夾成 0，L18 中位 −40%。
  //   → owner 修好了根因（係數砍半到 0.01），歸零只剩 2/53，於是攻速被加回來。
  //
  //   ⛔ 但加回來之後**三個懲罰疊在一起**，量到的結果是普攻整個死掉：
  //     `strToAttackDamage` 1→0.4 · `multipliers.attackDamage` 1.0→0.6
  //     · 攻速正規化把 L18 中位再從 1.26 壓到 0.78
  //     ⇒ 普攻只剩原本的 **15%**（不是設計時估的 43%）。
  //     ⇒ 法師 L18 每秒普攻 **23 點**，一發技能 = 普攻 **17 秒**（目標是 1.68 秒）。
  //
  //   ⭐ 根因是**層數**：攻速已經有 `stat-caps` 的兩層（4 一般 / 10 解鎖 + 標籤
  //     「解鎖上限」）在管，正規化是**第三層**。三層疊起來就是上面那個數字。
  //   ⇒ 攻速退出正規化，讓 stat-caps 那兩層單獨負責。
  //   ⚠️ `bands.as` 與 `byOrigin.as` 都留著 —— 要開只要把 "as" 加回這個陣列。
  // ⭐ 2026-08-16 `range` **進名單**（owner：「依出身套用普攻距離」，逐格給了 49 位）。
  //   ⚠️ 上面那條「range 不在名單上」的理由是**雙峰**，它沒有失效，是被
  //   `bandsByScale` + `scaleByOrigin` 正面解掉了（兩把尺，出身選）。
  //   量到的證據：owner 那張表裡射程是**出身的純函數** —— 10 個出身各只有一個值
  //   （鬥士/法鬥/硬輔 1.6 · 坦克/狂戰/法刺 1.4 · 法師/射手/軟輔 8.2 · 砲手 12），
  //   49/49 位零例外。⇒ 這一項本來就該由出身驅動，逐隻寫值是在抄同一張表 49 遍。
  // ⭐ 2026-08-21 **攻速（`as`）進名單**，owner 逐字：
  //   「看不懂你第二第三選項，**請你照出身表的規劃來設定就好**」
  //   ⚠️ 下面那一大段「攻速最終仍不在名單」的紀錄**沒有被刪掉**（知識不可以無聲
  //   消失），但它的兩個前提都已經不成立：
  //     ① 那時 `growth.as` 是 **49 位共用的 0.02**（一個常數），所以正規化是
  //        「第三層尺」。2026-08-21 的架構裁決（三圍成長歸 0）之後，`growth.as`
  //        本來就已經被重推導成十出身五級距的 **0.003–0.0281** —— 卡上那個數字
  //        一直在，只是**沒有生效**（`resolveSpeedGrowthTiers` 包在外面，用
  //        `asGrowthTier` 的 0.02 蓋過去）。
  //     ② `agiToAttackSpeed` 已經從 0.02 降到 0.01，負成長的規模小很多。
  //   ⇒ 進名單之後 `speedtiers:build` **不再敲 `asGrowthTier`**（它從這個陣列
  //     推導自己該管哪幾條軸），所以「兩個系統同時寫 `growth.as`」在結構上不可能。
  appliesTo: Object.freeze([
    "ms", "mr", "armor", "maxHealth", "maxMana", "ad", "ap", "as", "healthRegen", "manaRegen", "range",
  ] as const),
  // 🔴 **攻速曾經被拿掉，然後 owner 修好了根因，它就回來了。** 這段留著當紀錄：
  //
  //   拿掉的理由：owner 的兩條規則在攻速上互相矛盾 ——「終值用 L99」與
  //   「攻速上限 4」，而 L99 攻速中位數是 **12.2**（上限的 3 倍）。梯子錨到
  //   上限之後每個人的目標都遠低於三圍自然值 → 反解出負成長 → 夾成 0 →
  //   實測 **36/53 的 `growth.as` 歸零、L18 攻速中位 1.67 → 1.01（−40%）**。
  //
  //   ⭐ owner 2026-08-13 指出根因不在正規化，在**係數**：
  //     「我覺得問題應該是**敏捷提升攻擊速度的屬性該調整**吧，畢竟之前**等級上限只有 30**」
  //   → `agiToAttackSpeed` 0.02 → **0.01**（`combat-env.json`）。
  //     L99 倍率 4.95× → 2.97×，攻速中位 12.2 → **7.34**。
  //
  //   ⚠️ 7.34 仍然高於上限 4，所以梯子照樣錨在 4 —— 但**負成長的規模小很多**，
  //     而且它現在描述的是一個真實的張力（攻速就是會頂到上限），不是一個
  //     由過期係數造出來的假象。
  // 「中」= 量出來的母體中位數 —— ⭐ **53 位本體、作者原值、等級 99**
  //   （移速那一格是等級 1，因為它走 baseStats 通道）。
  //
  // ⚠️ 三個「不是」很重要：
  //   ⛔ **不含變身態**（owner 2026-08-13：「變身也不採計了」）——
  //      變身是同一位英雄的第二張卡，放進去等於重複計數。
  //      ⚠️ 但正規化仍然**套用**到變身態（`skipTransformedBodies: false`）：
  //      不採計是統計層，一視同仁是套用層，兩層不同。
  //   ⛔ **不含未上架的 41 位**（已搬進 `content/_legacy/`）。
  //   ⛔ **不是從已正規化的註冊表量的** —— 那會是循環（量到自己的輸出）。
  //      這一組數字是直接讀英雄卡算的。
  // 五格由 `bandsFromMedian()` 推 —— ⛔ 不手打五個數字。
  // ⚠️ 第二個參數是那條屬性的**系統上限**（`config.stat-caps@1` 的 base）。
  //   ⛔ 這是一份鏡射，而 `statCapsAreFences.test.ts` 對照真的那張表 —— 說謊就紅。
  //
  // ⭐ **`ms` 是這十項裡唯一的例外**。owner 2026-08-15 當天改了兩次：
  //
  //   第一版「極小5/小7/中10/大14/極大18，一般上限24，解鎖上限30」——
  //   極大 18 正好是**穿牆平手線**（30Hz tick × 0.6 身體半徑 = 18.0，
  //   離散碰撞 `relax()` 在這個速度下「走路 100% 必穿」），解鎖上限 30
  //   更是遠在線外（每 tick 1.0u = 半徑 167%）。這件事被指出來之後，
  //
  //   第二版「極小=缺陷/小=偏低/中=標準/大=優勢/極大=特化 ——
  //   極小5/小6/中8/大10/極大12，上限18」—— 極大 12 退回**跟事故發生前
  //   一模一樣的安全解鎖值**（每 tick 0.4u = 半徑 67%），上限 18 貼著平手線
  //   本身但不超過。⭐ 這一版是現在出貨的這一組。
  //
  // 兩版都不是等比階梯（第二版：6/5=1.2、8/6=1.33、10/8=1.25、12/10=1.2，
  // 不是常數比），`bandsFromMedian()` 產生不出這一組 ⇒ 改成手寫表，
  // ⛔ 不是先反推一個「中位數」再假裝是推導出來的（那種倒推法在下一次 owner
  // 微調時會產生一個沒人看得懂的中間值）。
  bands: Object.freeze({
    ms: Object.freeze({ 極小: 5, 小: 6, 中: 8, 大: 10, 極大: 12 }),
    mr: bandsFromMedian(258.7, 15344),
    armor: bandsFromMedian(90.09, 5078),
    maxHealth: bandsFromMedian(8149.2, 375960),
    maxMana: bandsFromMedian(4985.5, 232150),
    ad: bandsFromMedian(420, 21200),
    ap: bandsFromMedian(188.5, 100000),
    as: bandsFromMedian(7.34, 4),
    // ⚠️ `range` 的**真正**階梯是下面的 `bandsByScale`（兩把）。這一格是
    //   「`scaleByOrigin` 沒有這個出身」時的退路，刻意填**近戰**那一把 ——
    //   不明時把人變成遠程，是遠比變成近戰嚴重的事故。
    range: Object.freeze({ 極小: 1.2, 小: 1.4, 中: 1.6, 大: 1.8, 極大: 2 }),
    healthRegen: bandsFromMedian(16.85, 744),
    manaRegen: bandsFromMedian(20.22, 926),
  }),
  /**
   * ⭐ 攻擊距離的**兩把階梯**（2026-08-16）。錨點都是量出來的（53 位可選本體）：
   *
   *   近戰 n=39：1.2(×1) · 1.6(×31) · 2.0(×7)　⇒ 中位 **1.6**，實際跨度只有 1.67×
   *   遠程 n=14：6.0 · 6.4 · 7.3 · 8.2 · 9.2 · 10.1 · 12.0　⇒ 中位 **8.2**
   *
   * ⚠️ 兩把都**不是**等比階梯，而是直接貼著觀測到的實際值鋪 ——
   * 近戰那把整個區間只有 1.2~2.0，硬套 ÷2/×2 會產生 0.8 與 3.2 兩個
   * 「這個遊戲裡不存在的近戰距離」。
   *
   * ⭐ 遠程的 極大 = **12** 不是我挑的：那是 owner 2026-08-12 自己給的卡面上限
   * （「上限是黑人牙膏 12」，見 `statCaps.ts` 的 `AttackRange` 那一段），
   * 而黑人牙膏正是母體裡唯一的 12.0。極大這一格因此**剛好等於現存的最遠那位**。
   */
  bandsByScale: Object.freeze({
    range: Object.freeze({
      melee: Object.freeze({ 極小: 1.2, 小: 1.4, 中: 1.6, 大: 1.8, 極大: 2 }),
      ranged: Object.freeze({ 極小: 6, 小: 7, 中: 8.2, 大: 10, 極大: 12 }),
    }),
  }),
  /**
   * ⭐ 出身 → 走哪一把尺（owner 2026-08-16 逐格給的 49 位，反推出來的 10 格）。
   *
   * ⚠️ 六個近戰位裡 **法鬥（智慧·近戰）與硬輔** 走近戰、四個遠程位裡
   * **軟輔** 走遠程 —— 前六個純血出身（坦克/砲手/鬥士/射手/法鬥/法師）的尺標
   * 正好等於它們名字裡那一半，四個混血（狂戰/硬輔/法刺/軟輔）是 owner 指定的。
   *
   * 🔴 ⛔ 這一格**不可以**改成讀 `attackType`：owner 那張表裡 10/49 位兩者相反。
   */
  scaleByOrigin: Object.freeze({
    range: Object.freeze({
      坦克: "melee", 狂戰: "melee", 法刺: "melee",
      鬥士: "melee", 法鬥: "melee", 硬輔: "melee",
      法師: "ranged", 射手: "ranged", 軟輔: "ranged", 砲手: "ranged",
    } as const),
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
    // ⚠️ 級距的意思是「**以你的攻擊型別而言**算遠還算近」（見 `bandsByScale`），
    //   所以近戰的「大」是 1.8 而不是把他變成遠程。
    range: Object.freeze({ tank: "中", fighter: "中", marksman: "大", mage: "中" } as const),
  }),
  /*
   * ⭐ 10 出身 × 11 屬性。**2026-08-16 owner 逐格重寫了整張表**，並且第一次
   * 給了五個級距語意標籤：**極小=缺陷 · 小=偏低 · 中=標準 · 大=優勢 · 極大=特化**。
   *
   * ⚠️ 這一版與前一版差了 **67/100 格** —— ⛔ 不是微調，是重寫。方向上最大的改變是
   * **極端值變少了**：前一版鬥士拿「移速極大 + 攻速極大」、法師拿四個極大，
   * 這一版把它們拉回中段，把「極大」留給真正的特化位（狂戰的攻速與回血、
   * 射手/砲手的 AD、坦克的雙防、法刺的 AP）。
   *
   * 每一列讀起來像一句話：
   *
   *   鬥士  AD大 · 回血大 · 其餘全中          ← 站得住又打得動的標準近戰
   *   狂戰  攻速極大 · 回血極大 · 防禦全小     ← 拿命換輸出
   *   射手  AD極大 · 攻速大 · 三防極小/小      ← 最高輸出、最脆
   *   砲手  AD極大 · 移速大 · HP與雙防極小     ← 站得遠、一碰就碎
   *   坦克  雙防極大 · HP大 · 回血大           ← 最厚
   *   法鬥  AD大 + AP大                        ← 雙修
   *   法師  AP大，其餘幾乎全中/小              ← 標準後排
   *   法刺  AP極大，攻速/AD/HP/三防全極小      ← 一發定生死
   *   硬輔  AP大 · HP大 · 雙防大               ← 站得住的輔助
   *   軟輔  AP大 · 回血大 · 回魔大             ← 續航型輔助
   *
   * ⚠️ 有幾格仍然是**設計不是量測**（母體支撐弱），列出來讓 owner 看得到：
   *   · 砲手 / 軟輔兩個出身**目前 0 人**，整列都是純設計
   *   · 法鬥/硬輔/法刺三個混血母體各只有 4/3/3 位
   */
  byOrigin: Object.freeze({
    ms: Object.freeze({ 坦克: "小", 砲手: "大", 鬥士: "中", 射手: "中", 法鬥: "小", 法師: "中", 狂戰: "大", 硬輔: "小", 法刺: "大", 軟輔: "小" } as const),
    mr: Object.freeze({ 坦克: "極大", 砲手: "極小", 鬥士: "中", 射手: "極小", 法鬥: "小", 法師: "小", 狂戰: "小", 硬輔: "大", 法刺: "極小", 軟輔: "小" } as const),
    armor: Object.freeze({ 坦克: "極大", 砲手: "極小", 鬥士: "中", 射手: "極小", 法鬥: "小", 法師: "小", 狂戰: "小", 硬輔: "大", 法刺: "極小", 軟輔: "小" } as const),
    maxHealth: Object.freeze({ 坦克: "大", 砲手: "極小", 鬥士: "中", 射手: "小", 法鬥: "中", 法師: "中", 狂戰: "小", 硬輔: "大", 法刺: "極小", 軟輔: "小" } as const),
    maxMana: Object.freeze({ 坦克: "極小", 砲手: "小", 鬥士: "中", 射手: "中", 法鬥: "中", 法師: "中", 狂戰: "極小", 硬輔: "小", 法刺: "小", 軟輔: "小" } as const),
    ad: Object.freeze({ 坦克: "小", 砲手: "極大", 鬥士: "大", 射手: "極大", 法鬥: "大", 法師: "小", 狂戰: "大", 硬輔: "小", 法刺: "極小", 軟輔: "小" } as const),
    ap: Object.freeze({ 坦克: "小", 砲手: "小", 鬥士: "小", 射手: "極小", 法鬥: "大", 法師: "大", 狂戰: "小", 硬輔: "大", 法刺: "極大", 軟輔: "大" } as const),
    as: Object.freeze({ 坦克: "小", 砲手: "小", 鬥士: "中", 射手: "大", 法鬥: "小", 法師: "小", 狂戰: "極大", 硬輔: "小", 法刺: "極小", 軟輔: "小" } as const),
    healthRegen: Object.freeze({ 坦克: "大", 砲手: "小", 鬥士: "大", 射手: "小", 法鬥: "中", 法師: "中", 狂戰: "極大", 硬輔: "小", 法刺: "小", 軟輔: "大" } as const),
    manaRegen: Object.freeze({ 坦克: "極小", 砲手: "小", 鬥士: "中", 射手: "中", 法鬥: "中", 法師: "中", 狂戰: "極小", 硬輔: "小", 法刺: "小", 軟輔: "大" } as const),
    /*
     * ⭐ **第 11 項，這一列是我提的**（owner 2026-08-16 只說「你補充第十一個屬性
     * 攻擊距離進來」，沒有給逐格的值）。
     *
     * ⚠️ 級距的意思是「**以你的攻擊型別而言**算遠還算近」，⛔ 不是絕對距離 ——
     * 近戰的「大」是 1.8u，遠程的「大」是 10u，兩把階梯見 `bandsByScale`。
     * 這正是為什麼**硬輔**（近戰遠程都有）也能給一個級距而不出事。
     *
     * 逐格理由：
     *   砲手 極大  ← 砲手的定義特徵就是站得最遠（0 人，純設計）
     *   射手 大    ← 遠程輸出的身分：比法師更該有安全距離
     *   軟輔 大    ← 站最後排
     *   狂戰 小 / 法刺 小 ← 兩者都必須貼身才成立，短射程是他們的代價
     *   其餘 中    ← 標準
     */
    range: Object.freeze({ 坦克: "小", 砲手: "極大", 鬥士: "中", 射手: "中", 法鬥: "中", 法師: "中", 狂戰: "小", 硬輔: "中", 法刺: "小", 軟輔: "中" } as const),
  }),
  channel: Object.freeze({
    // ⭐ owner：「**初始的屬性是用來補正角色個性化差異，成長是定位導向**」
    //   → 九項走 growth。⛔ 移速與攻擊距離是例外，而且都是量出來的機制限制：
    //     成長只能往上推不能往下拉，而這兩項沒有三圍來源可以在反解時被減掉。
    //     ⚠️ `range` 更直接：**53 位可選英雄裡 0 位有 `growth.range`**，
    //     它從來就只是一個初始值。
    ms: "baseStats",
    range: "baseStats",
    mr: "growth", armor: "growth", maxHealth: "growth", maxMana: "growth",
    ad: "growth", ap: "growth", as: "growth", healthRegen: "growth", manaRegen: "growth",
  } as const),
  referenceLevel: 99,
  allowNegativeGrowth: false,
  // ⭐ 2026-08-13 owner 裁決 —— 變身態**一視同仁**，兩格都關掉：
  //
  //   「請把變身也排除考慮行列，我決定**變身所有的屬性改變都用技能標籤組合到
  //     該變身技能中**就好，所以**屬性不用多一份考量，都是一樣**」
  //
  //   ⇒ 變身態不再是「數值上的另一張卡」，它就是一張照自己出身正規化的普通卡；
  //     「變身比較強」這件事改由**變身技能本身的 buff**負責（技能標籤組合）。
  //
  // ⚠️ 這推翻了同一天稍早的 `transformBandShift: 1`。那一格當時是為了修
  //   「十項全做之後變身比本體弱」，而 owner 的解法比它乾淨：讓強化住在技能裡，
  //   卡片不必為變身留一份特例。⛔ 兩個欄位都留著（不是刪掉）——
  //   要回到位移模型只要把這兩格改回去，不用動程式。
  transformBandShift: 0,
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
  // ⭐ 雙階梯（2026-08-16）。⚠️ 逐格夾同一組上下界，理由跟 `bands` 那一圈一樣：
  //   這是**繞過後台與 Zod 的第三層**（手改 overlay、舊主機寫下的文件、測試夾具）。
  const bandsByScale = {} as Record<
    NormalizedStatKey,
    Record<ScaleKey, Record<NormalBand, number>>
  >;
  for (const key of NORMALIZED_STAT_KEYS) {
    const fallback = DEFAULT_STAT_NORMALIZATION.bandsByScale[key];
    const given = (d["bandsByScale"] as Record<string, Record<string, Record<string, unknown>>> | undefined)?.[key];
    if (!fallback && !given) continue; // 這一項沒有雙階梯 —— 走單一 `bands`
    const out = {} as Record<ScaleKey, Record<NormalBand, number>>;
    for (const t of SCALE_KEYS) {
      out[t] = { ...(fallback?.[t] ?? bands[key]) };
      for (const band of NORMAL_BANDS) {
        const v = given?.[t]?.[band];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          out[t][band] = Math.min(Math.max(v, BAND_VALUE_MIN), BAND_VALUE_MAX);
        }
      }
    }
    bandsByScale[key] = out;
  }
  // ⭐ 出身 → 走哪一把尺。⚠️ 只收 `SCALE_KEYS` 裡的字串，其餘一律留預設，
  //   ⛔ 不把亂填的值當成「沒有尺標」（那會靜靜退回單尺 = 差 5 倍的射程）。
  const scaleByOrigin = {} as Record<NormalizedStatKey, Partial<Record<Origin, ScaleKey>>>;
  for (const key of NORMALIZED_STAT_KEYS) {
    const fallback = DEFAULT_STAT_NORMALIZATION.scaleByOrigin[key];
    const given = (d["scaleByOrigin"] as Record<string, Record<string, unknown>> | undefined)?.[key];
    if (!fallback && !given) continue;
    const out: Partial<Record<Origin, ScaleKey>> = { ...(fallback ?? {}) };
    for (const org of ORIGINS) {
      const v = given?.[org];
      if (v === "melee" || v === "ranged") out[org] = v;
    }
    scaleByOrigin[key] = out;
  }
  const shiftRaw = d["transformBandShift"];
  const skip = d["skipTransformedBodies"];
  const ref = d["referenceLevel"];
  const neg = d["allowNegativeGrowth"];
  return {
    mode,
    appliesTo,
    bands,
    bandsByScale,
    scaleByOrigin,
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
    // ⭐ 兩把階梯優先：`bandsByScale[key][ scaleByOrigin[key][出身] ]`，
    //   ⛔ 任何一步查不到就退回單尺 `bands[key]`。
    //   🔴 選尺的鍵是**出身**不是 `attackType` —— 理由（10/49 位相反）寫在
    //     `scaleByOrigin` 那一格。⛔ 程式裡沒有任何一行提到 `range`：
    //     是不是雙階梯、走哪一把，全部由**資料**決定（第〇·五守則）。
    const scale = cfg.scaleByOrigin[key]?.[org];
    const ladder =
      (scale !== undefined ? cfg.bandsByScale[key]?.[scale] : undefined) ?? cfg.bands[key];
    const target = band === undefined ? undefined : ladder?.[band];
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
