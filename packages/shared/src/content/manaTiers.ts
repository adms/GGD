/**
 * 耗魔級距（`config.mana-tiers@1`）—— 五軸裡**最後補上**的那一軸。
 *
 * ⭐ 為什麼它必須存在（量到的，2026-08-21）：
 * 冷卻 350 支填了級別、施法距離 186 支、AoE 96 支、傷害 199 支 —— 而耗魔是
 * **0 支**，因為 `ability@1` 上**根本沒有這一格**。它不是「大家忘了填」，是
 * 機制沒做：212 支要花魔力的技能各自帶著一個從 w3a 換算來的自由數字，
 * 級距表一改它們一動都不會動，而且 ⛔ 沒有任何東西會紅。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 五格是**推導**的，⛔ 不是我編的五個數字
 *
 * owner 2026-08-19 給了**兩個**耗魔錨（⛔ 不是五個）：
 * > 「範圍技**連續八次**施展完等回魔」　「連續**四個大範圍**技能施展完一定要等回魔」
 *
 * ⇒ 中 ＝ 魔力池 ÷ 8、大 ＝ 魔力池 ÷ 4。兩個錨相鄰一格且比值 2 ⇒ 幾何梯子
 * `池 ÷ {32, 16, 8, 4, 2}`。與 AoE／施法距離／位移三軸**同一個做法**
 *（owner 給兩個錨，其餘由一條規則長出來）。
 *
 * ⚠️ 這條梯子**比傷害那條陡的地方不一樣**：極大 ＝ 魔力池的一半，兩發清空魔條。
 * ⛔ 傷害那條梯子（600…6000，10 倍）直接抄過來的話極大會比整個魔力池還大
 *（`池÷8 × 10 = 池 × 1.25`），那支技能一輩子放不出來。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 這一格與 `manaCost[]` 的關係，與另外四軸**逐字相同**
 *
 *   · 沒填級別 → 手寫的 `manaCost[]` 原樣生效（一直都合法）
 *   · `enabled: false` → 級別不解析（＝一鍵回到舊的那一套數字）
 *   · **兩格都有 → 級別贏**，而且**每一階都寫同一個值**（級距是一支技能一格）
 *
 * ⭐ 「每一階同一個值」不是排版偏好，是 owner 2026-08-21 ① 的直接推論：
 * 「**除了冷卻以外 傷害跟耗魔是一起變動的**」+「B 全轉，接受升階只剩 ratios 成長」
 * ⇒ 傷害的 `perRank` 交出去了，耗魔的 `perRank` 就不可以留著自己漲 ——
 * 留著就變成「升階只多花錢、不多傷害」，那是把 owner 的連動關係**弄反**。
 */
import { HARD_ANCHOR_LEVEL, medianFinalMana } from "./balanceAnchors";
import { SKILL_TIER_NAMES, type SkillTierName } from "./skillTiers";

/** `content/config/mana-tiers.json` 的文件 id。 */
export const MANA_TIERS_DOC_ID = "mana-tiers";

/** 五個級別 —— 與另外四軸**同一份**（`skillTiers.ts`）。⛔ 不要在這裡另立一組。 */
export const MANA_TIER_NAMES = SKILL_TIER_NAMES;
export type ManaTierName = SkillTierName;

/**
 * owner 2026-08-19 的兩條耗魔規格 —— **唯一**的兩個錨，其餘三格由比值長出來。
 * `tier` 是它落在哪一格，`casts` 是「連續幾次施展完要等回魔」。
 */
export const MANA_CAST_ANCHORS: readonly { readonly tier: ManaTierName; readonly casts: number }[] =
  Object.freeze([
    Object.freeze({ tier: SKILL_TIER_NAMES[2]!, casts: 8 }),
    Object.freeze({ tier: SKILL_TIER_NAMES[3]!, casts: 4 }),
  ]);

/**
 * 五格耗魔 —— 從魔力池與 owner 的兩個錨推導。
 *
 * ⭐ 極小那一格算完之後，其餘四格用**整數比**展開（同 `ladderWindow`），
 * 這樣 `大 × 4 ≈ 池` 與 `中 × 8 ≈ 池` 兩條 owner 的規格才會同時成立 ——
 * 逐格各自四捨五入會讓它們差幾點而沒有人發現。
 */
export function manaTiersFromPool(pool: number): Readonly<Record<ManaTierName, number>> {
  const a = MANA_CAST_ANCHORS[0]!;
  const b = MANA_CAST_ANCHORS[1]!;
  const ia = SKILL_TIER_NAMES.indexOf(a.tier);
  const ib = SKILL_TIER_NAMES.indexOf(b.tier);
  // 每爬一格，「撐得住幾發」變成幾倍（owner 的兩個錨之間量出來的）。
  const perStep = ib === ia ? 1 : (b.casts / a.casts) ** (1 / (ib - ia));
  const castsAt = (i: number): number => a.casts * perStep ** (i - ia);
  const smallest = Math.max(1, Math.round(pool / castsAt(0)));
  const out = {} as Record<ManaTierName, number>;
  for (let i = 0; i < SKILL_TIER_NAMES.length; i++) {
    out[SKILL_TIER_NAMES[i]!] = Math.round(smallest * (castsAt(0) / castsAt(i)));
  }
  return Object.freeze(out);
}

export interface ManaTiers {
  /**
   * 止血閥。false = `manaCostTier` 不解析（填了也不生效，但**看得見它是關的**）。
   * ⚠️ 關掉**不會**讓技能變免費 —— 手寫的 `manaCost[]` 一直都在。
   */
  enabled: boolean;
  /** 級別 → 耗魔點數。五格都要有值。 */
  manaCost: Readonly<Record<ManaTierName, number>>;
}

/**
 * 出貨值。⭐ 從魔力池推導，⛔ 不抄字面值（同 `DEFAULT_RANGE_TIERS`）。
 * 三個住處：`content/config/mana-tiers.json` · 這裡 · `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_MANA_TIERS: ManaTiers = Object.freeze({
  enabled: true,
  manaCost: manaTiersFromPool(medianFinalMana(HARD_ANCHOR_LEVEL)),
});

/**
 * 單一級別的上下界。
 * 下界 1 —— 0 是「免費技」，那要走**不填級別而且 `manaCost` 全 0** 的寫法，
 * ⛔ 不是把這一格填成 0（那會讓「填了級別」與「免費」變成同一件事）。
 * 上界 ＝ 魔力池：一發花光整條魔條已經是極端，超過就是永遠放不出來。
 */
export const MANA_TIER_MIN = 1;
export const MANA_TIER_MAX = Math.floor(medianFinalMana(HARD_ANCHOR_LEVEL));

function clampMana(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, MANA_TIER_MIN), MANA_TIER_MAX);
}

/** 把一份 `config.mana-tiers@1` 文件正規化成級距表。認不得 → 出貨值。 */
export function manaTiersFromDoc(doc: unknown): ManaTiers {
  const d = doc as
    | { schema?: string; enabled?: unknown; manaCost?: Record<string, unknown> }
    | undefined;
  if (!d || d.schema !== "config.mana-tiers@1") return DEFAULT_MANA_TIERS;
  const src = d.manaCost ?? {};
  const manaCost = {} as Record<ManaTierName, number>;
  for (const name of MANA_TIER_NAMES) {
    manaCost[name] = clampMana(src[name], DEFAULT_MANA_TIERS.manaCost[name]);
  }
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_MANA_TIERS.enabled,
    manaCost: Object.freeze(manaCost),
  };
}

/**
 * 把一支技能（或一件道具）上的 `manaCostTier` 翻成 `manaCost`。
 *
 * ⭐ 全專案**唯一**知道級別怎麼變成點數的地方（同 `resolveCooldownTier`）——
 * 註冊表、編輯器預覽、後台試算都呼叫它。
 *
 * 規則：
 *   · 沒有 `manaCostTier` → 原樣返回。手寫 `manaCost` 是完全合法的寫法。
 *   · `enabled: false` → 原樣返回（＝一鍵回到舊的那一套數字）。
 *   · 沒有 `manaCost` 陣列可以蓋 → 原樣返回。⛔ 不憑空長出一格耗魔。
 *   · **兩格都有 → 級別贏**，而且**每一階都寫同一個值**。
 *
 * ⚠️ 只看**頂層** —— `manaCost` 在 `ability@1` 與 `item@1` 都是頂層欄位，
 * 而深走訪會讓一個內嵌在 effect 裡的 `manaCost`（例如 `spendMana`）
 * 被誤當成技能本身的耗魔（同 `resolveCooldownTier` 踩過的那個坑）。
 */
export function resolveManaCostTier<T extends Record<string, unknown>>(
  def: T,
  tiers: ManaTiers,
): T {
  if (!tiers.enabled) return def;
  const tier = def["manaCostTier"];
  if (typeof tier !== "string") return def;
  const mp = def["manaCost"];
  if (!Array.isArray(mp) || mp.length === 0) return def;
  const cost = tiers.manaCost[tier as ManaTierName];
  if (typeof cost !== "number") return def;
  return { ...def, manaCost: mp.map(() => cost) };
}

/** 五格的一句話（後台說明 · Codex 契約 · 報告**共用**，⛔ 不各自寫一段）。 */
export function describeManaTiers(tiers: ManaTiers = DEFAULT_MANA_TIERS): string {
  return (
    `耗魔五級距 ${MANA_TIER_NAMES.map((t) => `${t} ${tiers.manaCost[t]}`).join(" / ")}` +
    `（＝魔力池 ÷ ${MANA_CAST_ANCHORS.map((a) => a.casts).join(" / ")} 那兩個 owner 錨長出來的）。` +
    `⚠️ 級距是一支技能一格 ⇒ 解析時每一階都寫同一個值。`
  );
}
