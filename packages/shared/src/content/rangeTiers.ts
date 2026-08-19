/**
 * 施法距離級距（`config.range-tiers@1`，GH#414）—— 四軸裡**最後補上**的那一軸。
 *
 * owner 2026-08-19：
 * > 「你的技能範圍轉換自 w3x 是不是有問題阿？
 * >  1. **可施展技能的距離普遍超遠** 2. **施法範圍也超大**」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 「普遍超遠」的根因**不是換算係數錯**
 *
 * 換算係數是對的：`GGD_PER_WC3 = 11/600`，29/29 支模板技驗證過，而且 owner 自己的
 * 校準點也對得上（04-02 炸彈陣 300 → 5.5 落「大」，04-03 龍破斬 450 → 8.25 落
 * 「超大」，剛好高一級，正是他說的「龍破斬應該高一級」）。
 *
 * 真正的根因是**這一軸從來沒有表**。量到的出貨分佈（`Abilities` 註冊後）：
 *
 *     404 筆有 range · 中位數 11 · p90 14 · **最大 29.33**
 *     決鬥區半徑 24  ⇒ 有技能的施法距離比整個決鬥區還大
 *
 * AoE 有四級距在收，位移有四級距在收，施法距離**一個都沒有** —— 216 支各自帶著
 * 一個從 w3a 換算來的自由數字。⇒ 補的是**級距**，⛔ 不是係數。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 梯級與 AoE **完全同一條**（`skillTiers.ts` 的橫木 [1..5]）
 *
 *     小 3 · 中 4.5 · 大 6 · 超大 8 · 極大 12   （決鬥區半徑 24 的 1/8…1/2）
 *
 * 為什麼施法距離與 AoE 用同一個視窗，而不是往上挪一格：
 *   · owner 要的是「**統一**五級距」。同一個字在兩軸上指向同一個絕對值，
 *     是這句話最強的讀法 —— 一支「大」的技能，打得到 6，炸開也是 6。
 *   · 「極大 = 12 = 決鬥區半徑的一半」對施法距離讀得通：站在中心能覆蓋半個場。
 *     ⛔ 而 29.33 那種值讀不通，它的意思是「整個決鬥區都在射程內」。
 *
 * ⚠️ 這四個字是**卡面值**。玩家實際吃到的是它再乘「戰鬥系統」頁的
 * `abilityRange`（出貨 0.8）—— 與 AoE 完全同一個形態，見 `aoeTiers.ts` 的說明。
 *
 * ⚠️ 上界 = 決鬥區半徑：大於它的施法距離就是「全場」，那不是一個距離級別。
 */
import {
  DUEL_ZONE_RADIUS_REF,
  SKILL_TIER_NAMES,
  ladderWindow,
  type SkillTierName,
} from "./skillTiers";

/** `content/config/range-tiers.json` 的文件 id。 */
export const RANGE_TIERS_DOC_ID = "range-tiers";

/** 五個級別 —— 與 AoE／位移**同一份**（`skillTiers.ts`）。⛔ 不要在這裡另立一組。 */
export const RANGE_TIER_NAMES = SKILL_TIER_NAMES;
export type RangeTierName = SkillTierName;

export interface RangeTiers {
  /**
   * 止血閥。false = `rangeTier` 不解析（填了也不生效，但**看得見它是關的**）。
   * ⚠️ 關掉**不會**讓技能失去射程 —— 手寫的 `range` 一直都在。
   */
  enabled: boolean;
  /** 級別 → 施法距離（GGD 單位）。五格都要有值。 */
  range: Readonly<Record<RangeTierName, number>>;
}

/**
 * 出貨值。⭐ 從梯子推導，⛔ 不抄字面值（同 `DEFAULT_AOE_TIERS`）。
 * 三個住處：`content/config/range-tiers.json` · 這裡 · `apps/admin` 的 `SHIPPED_*`。
 */
export const DEFAULT_RANGE_TIERS: RangeTiers = Object.freeze({
  enabled: true,
  range: ladderWindow(DUEL_ZONE_RADIUS_REF, 1),
});

/**
 * 單一級別的上下界。
 * 上界 **24 = 決鬥區半徑**（同 `AOE_TIER_RADIUS_MAX` 的理由）；
 * 下界 0.5 —— 比它更短的「距離」在碰撞半徑 0.6 之內，等於貼身。
 */
export const RANGE_TIER_MIN = 0.5;
export const RANGE_TIER_MAX = 24;

function clampRange(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(Math.max(v, RANGE_TIER_MIN), RANGE_TIER_MAX);
}

/** 把一份 `config.range-tiers@1` 文件正規化成級距表。認不得 → 出貨值。 */
export function rangeTiersFromDoc(doc: unknown): RangeTiers {
  const d = doc as { schema?: string; enabled?: unknown; range?: Record<string, unknown> } | undefined;
  if (!d || d.schema !== "config.range-tiers@1") return DEFAULT_RANGE_TIERS;
  const src = d.range ?? {};
  const range = {} as Record<RangeTierName, number>;
  for (const name of RANGE_TIER_NAMES) {
    range[name] = clampRange(src[name], DEFAULT_RANGE_TIERS.range[name]);
  }
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_RANGE_TIERS.enabled,
    range: Object.freeze(range),
  };
}

/**
 * 把一支技能上的 `rangeTier` 翻成 `range`。
 *
 * ⭐ 全專案**唯一**知道級別怎麼變成數字的地方（同 `resolveRadiusTier`）——
 * 註冊表、編輯器預覽、後台試算都呼叫它。兩份查表就是「編輯器顯示 6、
 * 場上打 8」的標準劇本。
 *
 * 規則（逐條都是決策點，寫在這裡而不是散在呼叫端）：
 *   · 沒有 `rangeTier` → 原樣返回。手寫 `range` 是完全合法的寫法。
 *   · `enabled: false` → 原樣返回。
 *   · **`range` 與 `rangeTier` 同時存在 → 級別贏**（與 AoE 同一個決定：
 *     讓手寫值蓋過級別＝這個機制對那支技能不存在，而且沒有人會發現）。
 */
export function resolveRangeTier<T extends Record<string, unknown>>(def: T, tiers: RangeTiers): T {
  if (!tiers.enabled) return def;
  return walk(def) as T;

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const rec = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = walk(v);
    const tier = rec["rangeTier"];
    if (typeof tier === "string") {
      const r = tiers.range[tier as RangeTierName];
      if (typeof r === "number") out["range"] = r;
    }
    return out;
  }
}
