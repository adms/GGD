/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectDef } from "../effect";

/**
 * ── Lane 2（2026-08-08）三個新 kind ────────────────────────────────────
 * 與 Lane 1 **同一個形狀**（`shape` + 決策欄位 + 一個 handler），界一樣住在
 * `sim/effects/kindLimits.ts`（一份，schema 與 handler 共用）。
 */
export interface RandomAreaVariant {
  /**
   * 【隨機落點排程】(13-04 龍星群 · 70-04 千年練成)。
   * ⭐ draw 預算 = `2 × count`，而且**只在施法那一刻花掉** —— 完整的
   * 決定性推導見 `sim/effects/randomArea.ts` 檔頭②。
   */
  kind: "randomArea";
  /**
   * ⛔ **沒有 `shape` / `radius` / `side` / `maxTargets`**（2026-08-10 拿掉）。
   *
   * 它們曾經在這裡，而 `sim/effects/randomArea.ts` **一格都不讀** —— 這個 kind
   * 解的是**落點**不是**受害者**：到期時它用 `targets: []` + `point: hit.pos`
   * 跑 `effects`，「打到誰」是巢狀的 `damageArea` 自己拿 `ctx.point` 當圓心解的。
   * 作用範圍由 {@link scatterRadius} + {@link who} 講清楚（E1 要的東西，只是不叫
   * `shape`）。⛔ 想要「施放那一刻凍住的名單」請用 `delayed`，那正是它存在的理由。
   *
   * 以誰為圓心。省略 = `"self"`（兩支都是「自身[周圍]」）。
   */
  who?: "self" | "target";
  /** 逐階發數。70-04 的 4/6/8 就是 `[4,6,8]`；13-04 是 `[10]`。 */
  count: number[];
  /** 兩發之間隔幾秒。13-04 = 0.2。執行期夾成**至少 1 tick**。 */
  intervalSec: number;
  /** 落點的散佈半徑（以圓心為中心）。 */
  scatterRadius: number;
  /**
   * 第一發落在施法 tick 上。省略 = **true**，理由與 `random-barrage`
   * 模板的 `tickOnApply` 逐字相同（原作是「先放一發，再 sleep」）。
   */
  firstAtCast?: boolean;
  /**
   * 施法者陣亡就整波停掉。省略 = **false**（流星已經在天上了）。
   * ⚠️ 分區決鬥結束（`settledZones`）**一律**停，那不是欄位 ——
   * 回合結束後還在落東西是玩家看得見的缺陷（#100/#216）。
   */
  stopOnCasterDeath?: boolean;
  /** 每一發落地時跑的東西（傷害／召喚／特效走同一條路）。 */
  effects: EffectDef[];
}
