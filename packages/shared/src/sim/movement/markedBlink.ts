/**
 * ⭐⭐ GH#448 —— 「**標記 → 順移**」的旋鈕（`config.displacement-tiers@1` 的 `markedBlink` 區塊）。
 *
 * owner 2026-08-19（逐字）：
 *
 * > 「30-00 攝影機 => 因為**已經不是 dota 大地圖**，請你幫我這招改成
 * >  **給予指定敵方英雄標記**，之後施展**若無指定敵方英雄單位代表順移至敵方身邊**」
 *
 * ⭐ **為什麼旋鈕住在這裡而不是新開一份 config**：`blink` 是位移，
 * 而 `config.displacement-tiers@1` 已經裝著 `wallBlock`（同樣是「位移的規則」而不是級距）。
 * ⛔ 新開一份 config 會多一個要記得同步的住處（第〇·四守則）。
 *
 * ⭐ **它是 rollback 開關**（`/goal`：「留後台開關可簡易 rollback」）：
 * `enabled: false` ⇒ `to: "markedUnit"` 的 blink **一律不發生**
 * ⇒ 攝影機退回「只標記、不順移」，⛔ 而卡面的第二句會變成謊話 ——
 * ⚠️ 所以關掉它是**應急**，⛔ 不是一個長期形狀（第一·五守則）。
 */

/** 「標記→順移」這一族的規則。 */
export interface MarkedBlinkRules {
  /**
   * 總開關。⭐ **關掉 = rollback**：`to: "markedUnit"` 的 blink 解析一律回 `null`
   * ⇒ 施法者原地不動。⛔ 它不會退回舊的「真視」行為（那一份在內容裡，⛔ 不在這裡）。
   */
  readonly enabled: boolean;
  /**
   * 只認**自己這支技能**施加的標記（`StatusEffect.sourceId === ctx.origin`）。
   * ⛔ 關掉 ⇒ 兩位臭作會互相搶對方標記的目標 —— ⭐ 出貨值是 `true`。
   */
  readonly requireOwnMark: boolean;
}

/** ⭐ 出貨值。⛔ 缺文件時回這一份（＝功能開著），⛔ 不是空的。 */
export const DEFAULT_MARKED_BLINK: MarkedBlinkRules = {
  enabled: true,
  requireOwnMark: true,
};

const bool = (v: unknown, dflt: boolean): boolean => (typeof v === "boolean" ? v : dflt);

/**
 * 從 `config.displacement-tiers@1` 文件讀出來。缺文件／缺區塊 = 出貨預設。
 *
 * ⚠️ 逐格 `typeof`，⛔ 不整份 Zod parse —— 與 `wallBlockFromDoc` 同一個理由：
 * 一份**部分**壞掉的 config 不應該讓整場比賽失去這條規則。
 */
export function markedBlinkFromDoc(doc: unknown): MarkedBlinkRules {
  const d = doc as { schema?: string; markedBlink?: Record<string, unknown> } | undefined;
  if (!d || d.schema !== "config.displacement-tiers@1") return DEFAULT_MARKED_BLINK;
  const m = d.markedBlink;
  if (!m || typeof m !== "object") return DEFAULT_MARKED_BLINK;
  return {
    enabled: bool(m["enabled"], DEFAULT_MARKED_BLINK.enabled),
    requireOwnMark: bool(m["requireOwnMark"], DEFAULT_MARKED_BLINK.requireOwnMark),
  };
}
