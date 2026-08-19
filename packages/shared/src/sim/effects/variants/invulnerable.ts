/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

/**
 * invulnerable — 無敵 / 免疫 (lane P3, LANDED). Timed immunity.
 * `world.invulnerable` holds one ABSOLUTE expiry tick PER AXIS.
 *
 * 無敵與免疫**不是同一件事**,原作也不是:`Avul` 擋所有東西,魔法免疫只擋
 * 魔法,而 07-01 臨、兵、鬥「可抵擋對方負性魔法」只擋負面狀態、完全不擋
 * 傷害。所以這裡是三個正交的決策點欄位,不是一個 boolean。
 * 完整的考證與理由在 sim/effects/invulnerable.ts 的檔頭。
 */
export interface InvulnerableVariant {
  kind: "invulnerable";
  durationSec: number;
  /** the caster (default) or each resolved target */
  applyTo?: "self" | "target";
  /**
   * 傷害免疫的**範圍**。ABSENT = `"all"` = WC3 的 `Avul`。
   *
   *  · `"all"` —— 41-002 絕對屏障、29-03 有功夫無懦夫,以及 JASS 裡
   *    30+ 個 `SetUnitInvulnerable` / `'Avul'` 站點(天翔龍閃、ExcaliburMAX、
   *    百連我殺、蹂躪、蒼月潮 07-02 的衝刺…)。
   *  · `"magic"` —— 魔法免疫:47-04 天翔龍閃、97-04/97-002 火產靈神、
   *    99-04「不受任何魔法傷害」、道具 黃昏公主的血脈。
   *  · `"none"` —— **純免控**:07-01 臨、兵、鬥「可抵擋對方負性魔法」。
   *    這一支就是「免傷與免控必須能分開」的存在證明。
   *  · `"physical"` —— 對稱補完(目前沒有出貨文件用到)。
   */
  blocksDamage?: "all" | "none" | "physical" | "magic";
  /**
   * 真實傷害這一根軸。ABSENT = 跟著 `blocksDamage === "all"` 走
   * (WC3 `Avul` 擋所有東西)。
   *
   * ⚠️ 火圈是 #270 明確的**真實傷害**,而「無敵要不要免疫縮圈」是 owner 的
   * 平衡決定,所以它是欄位而不是程式裡的分支。
   * ✅ GH#287 起**它真的管得到火圈**:三條燒傷路徑都經過
   * `combat/environmentalBurn.ts`,那裡問的是同一個 `refusesDamage(…, "true")`。
   * (這一段以前寫著「今天它還管不到火圈」—— 那是真的,而且真了一年。)
   */
  blocksTrueDamage?: boolean;
  /**
   * 免控:拒絕敵方施加的 stun / root / 減速。**預設 false,而且是刻意的**
   * —— 讓它跟著免傷自動打開,等於把 14 支技能的免控變成後台看不見的隱性
   * 效果。想要 `Avul` 的完整語意就明寫 `true`。
   */
  blocksControl?: boolean;
}
