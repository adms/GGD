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
export const ARCHETYPES = ["tank", "fighter", "marksman", "mage"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const ARCHETYPE_LABEL_ZH: Readonly<Record<Archetype, string>> = Object.freeze({
  tank: "坦克",
  fighter: "近戰",
  marksman: "遠程",
  mage: "法師",
});

/** 這一版真的會被正規化的屬性。⛔ 不在名單上的照舊讀 `baseStats`。 */
export type NormalizedStatKey = "ms" | "mr";

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
  appliesTo: Object.freeze(["ms", "mr"] as const),
  bands: Object.freeze({
    ms: Object.freeze({ 小: 4.64, 中: 5.8, 大: 7.25 }),
    mr: Object.freeze({ 小: 31.04, 中: 38.8, 大: 48.5 }),
  }),
  byArchetype: Object.freeze({
    ms: Object.freeze({ tank: "小", fighter: "大", marksman: "中", mage: "小" } as const),
    mr: Object.freeze({ tank: "大", fighter: "中", marksman: "小", mage: "小" } as const),
  }),
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
  attributes?: { str?: number; agi?: number; int?: number };
  growth?: { str?: number; agi?: number; int?: number };
}): "str" | "agi" | "int" {
  const a = def.attributes ?? {};
  const g = def.growth ?? {};
  const at = (k: "str" | "agi" | "int"): number => (a[k] ?? 0) + (g[k] ?? 0) * 9;
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
  attributes?: { str?: number; agi?: number; int?: number };
  growth?: { str?: number; agi?: number; int?: number };
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
    (k): k is NormalizedStatKey => k === "ms" || k === "mr",
  );
  const bands = {} as Record<NormalizedStatKey, Record<NormalBand, number>>;
  const byArchetype = {} as Record<NormalizedStatKey, Record<Archetype, NormalBand>>;
  for (const key of ["ms", "mr"] as const) {
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
  const skip = d["skipTransformedBodies"];
  return {
    mode,
    appliesTo,
    bands,
    byArchetype,
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
export function resolveChampionStats<T extends Record<string, unknown>>(
  def: T,
  cfg: StatNormalization,
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
  let touched = false;
  for (const key of cfg.appliesTo) {
    const band = cfg.byArchetype[key]?.[arc];
    const value = band === undefined ? undefined : cfg.bands[key]?.[band];
    if (typeof value !== "number") continue;
    base[key] = value;
    touched = true;
  }
  if (!touched) return def;
  return { ...def, baseStats: base };
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
