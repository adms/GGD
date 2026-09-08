/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**（見同資料夾其他成員）。
 */

/**
 * ⭐【吸引】`pull`（#147）—— 把一組身體**搬到一個點**。
 *
 * ── 為什麼它不是 `knockback` 的 `from: "pull"` ────────────────────────────
 * 兩者回答的是不同的問題，而混用會安靜地做錯：
 *
 * | | `knockback` (`from:"pull"`) | `pull`（這一支） |
 * |---|---|---|
 * | 作者寫的是 | **一段長度**（推多遠） | **一個落點**（搬到哪） |
 * | 距離減法 | 走 GH#193 的 `afterGap`（離越遠移動越少）| ⛔ 不適用 —— 那對吸引是**反過來**的 |
 * | 目標從哪來 | 上游解好的 `ctx.targets` | 自己的圓（`shape:"circle"`）|
 * | 終點 | 算出來的（起點 + 方向 × 長度）| **指定的**（施法者／落點／錨點環）|
 *
 * ⇒ 用擊退去寫「把周圍 250+100×等級 內的人吸到 2×等級 個錨點上」（A091 05-03
 * 及喀爾度，war3map.j:28224-28233）會得到「每個人往我這邊挪一小段」——
 * 卡面看起來對，場上完全不是那個技能。
 *
 * ── 它**不新增**任何位移機制 ──────────────────────────────────────────────
 * 走的是 `knockback` 已經在用的那條地面滑行：`nav.override` 的
 * `DashOverride`（`authored: true`，讓 `combat/damage.ts` 的仲裁不覆寫它）
 * + `world.knockdown` 的行動鎖。⛔ 沒有新的 SimWorld 欄位、沒有新的 system。
 */
export interface PullVariant {
  kind: "pull";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`single` = 沿用上游解好的目標。 */
  shape: "single" | "circle";
  /** `shape:"circle"` 的作用半徑（A091 是 `250 + 100×等級` wc3 ⇒ 4.58…11.92）。 */
  radius?: number;
  side?: "enemies" | "allies";
  maxTargets?: number;
  /**
   * 搬到哪。**A DECISION POINT**，所以是一格下拉（第一守則）。
   *
   *   · `caster`（預設）—— 施法者腳下（WC3 鉤鎖那一族）
   *   · `point`         —— 這一次施法的落點（`ctx.point`），施法者可以站在別處
   *   · `anchorRing`    —— **錨點環**：以圓心為中心、半徑 `anchorRadius` 的
   *                        `anchorCount` 個等分點，第 i 個受害者去第
   *                        `i mod anchorCount` 個點（A091 的 `2×等級` 個錨點）
   */
  destination?: "caster" | "point" | "anchorRing";
  /** `anchorRing` 的點數。A091 = `2 × 等級`（1..4 階 ⇒ 2/4/6/8）。 */
  anchorCount?: number;
  /** `anchorRing` 的環半徑，GGD 單位。A091 是 200 wc3 ≈ 3.67。 */
  anchorRadius?: number;
  /** 被吸引時的移動速度，GGD 單位/秒。 */
  speed: number;
  /**
   * 到終點前要留幾格不要貼上去（省略 = 0，直接疊在落點上）。
   * ⚠️ 疊在同一格的身體會被 `relaxBody` 推開，所以這一格只是**演出**上的
   * 「圍成一圈」，⛔ 不是碰撞規則。
   */
  stopDistance?: number;
  /**
   * 期間不可控制。**預設 true**，與 `knockback` 同一個立場（owner
   *「期間不可控制」）：被拉走的人在飛行中不該還能施法與揮刀。
   */
  uncontrollable?: boolean;
  /** 落地後額外的不可控制 tick（爬起來的窗口）。需要 `uncontrollable`。 */
  getupTicks?: number;
}
