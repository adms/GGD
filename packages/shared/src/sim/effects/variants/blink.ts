/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectDef } from "../effect";

/**
 * ⭐ blink — **真瞬移**（owner 2026-08-09 / GH#301-2）。
 *
 * ── 它為什麼不是 `leap` 的一個選項 ────────────────────────────────────────
 * 今天所有「瞬移」的技能都被展開成 `leap` 配一個極短的 `travelSec`，而
 * `MIN_LEAP_TICKS = 2`（`sim/movement/leap.ts`）把飛行時間**壓在地板上** ——
 * 身體真的存在於中間的每一個位置，0.067 秒。規範因此寫「不是瞬間傳送，是極短
 * 平移，過程看得見」，owner 的裁決是：**「是真的瞬移，不是平移」**。
 *
 * ⛔ 差別不是美術上的。中途位置存在 = 可以被打到、可以被範圍技掃到、
 * 會被地形擋（`leap` 的落點阻擋規則）。瞬移的定義就是那兩格不存在。
 * 把它做成 `leap` 的一個布林值會讓「有沒有中間位置」變成 `leap` 積分器內部
 * 的一個 if，而那正是第〇·五守則說的越線。
 *
 * ── `templates/expand.ts` 那句「deliberately was not added」已經被推翻 ─────
 * 那句話當時的理由是「effect union / Zod / registry 三個檔正被別的 lane 同時
 * 編輯」，並明說「Named in the report as the owner's call」。owner 2026-08-09
 * 做了那個 call。⛔ 註解已同步改掉 —— 一句不再成立的辯護留著就是第三守則講
 * 的那種謊。
 *
 * ── 欄位 ─────────────────────────────────────────────────────────────────
 * `shape` 是 E1 硬約束（A4b 之後每一個新 kind 都要講得清楚作用範圍，守衛
 * `content/schema/newKindShape.test.ts` 從出貨註冊表推導，不是抄名字）。
 * 它回答的是「**誰**被瞬移」：`single` = 一個身體（施法者，或這一次的目標）；
 * `circle` = 半徑內的一群（集結隊友那一族：A0EY 英雄之笛 / A0YA 和諧世界 /
 * A10U 84-002），沿用 Lane 1/2 那一組 `radius` / `side` / `maxTargets` 欄位
 * 與**同一份** `refineDispelShape` 檢查。
 */
export interface BlinkVariant {
  kind: "blink";
  /** ⭐ E1 硬約束：誰被瞬移 —— 一個身體，還是半徑內的一群。 */
  shape: "single" | "circle";
  /** `shape:"circle"` 的半徑，GGD 單位。單體時寫它會被 schema 擋下。 */
  radius?: number;
  /** `shape:"circle"` 收誰（集結隊友 = `"allies"`）。 */
  side?: "allies" | "enemies";
  /** `shape:"circle"` 最多帶幾個。 */
  maxTargets?: number;
  /**
   * 目的地。三個值對應 JASS 那 11 個成員真正做的三件事：
   *   · `"targetUnit"` 貼上目標（7 支，最大宗：17-03 空破圓斬、08-02
   *     萊丁快速劍、13-03 快步、34- 冥道殘月破、阿福 EX、76-01 橡膠戰斧、
   *     27-04 飛燕閃）
   *   · `"point"`      指向點（82-02 虛空瞬動，讀 `GetOrderPointLoc`）
   *   · `"caster"`     集結到施法者身邊（3 支，配 `applyTo:"target"`）
   */
  to: "point" | "targetUnit" | "caster";
  /** 誰移動：施法者（預設），或每一個解算出來的目標（集結／拉人）。 */
  applyTo?: "self" | "target";
  /**
   * 落在目的地**前面**多少單位。27-04 飛燕閃在 JASS 裡落在目標前 150 wc3
   * 單位（j:41669），而 `leap` 沒有這一格，所以那一支今天是**貼在對方身上**
   * 落地。ABSENT = 0 = 正好落在目的地。
   */
  stopShortUnits?: number;
  /**
   * 抵達之後**立刻**執行的效果，同一個 tick。
   *
   * ⚠️ 為什麼需要它、而不是把傷害寫在 `effects[]` 的下一格：這一族每一個
   * 會傷害的成員都是**先位移再打**（27-04 在 j:41669 瞬移，j:41671 才
   * `UnitDamageTargetBJ`）。寫在同一層的下一格會在**起跳點**解算，那正是
   * `leap.onLand` 存在的理由。
   *
   * ⛔ 這裡**沒有** `arriveRadius`（`leap.landRadius` 的對應物），是刻意的：
   * 落點的圓由 `damageArea` 自己的半徑表達，多一格半徑等於同一件事有兩個
   * 住處，而它們會分岔。
   */
  onArrive?: EffectDef[];
}
