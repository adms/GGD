/**
 * 【混亂】—— 「完全搞不清楚狀況」。`fear.ts` 的第三個鏡像。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ owner 2026-08-09（GH#299 第 9 條 / GH#301-3）：
 *
 *   「混亂應該是**完全無法指定目標**，並且會**亂走路**，**跟恐懼效果一樣**」
 *
 * 規範原本寫的是「只影響自動選目標會不會挑到隊友」，而那正是 2026-08-05 這一格
 * 落地時的樣子：`targetsAllies` 打開 `targeting.ts` 的敵我閘，一個混亂的人於是
 * 「照常打架，只是有時候打到隊友」。owner 的裁決把它整個換掉 —— 混亂不是**挑錯
 * 人**，是**挑不了人**。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 它走 `fear.ts` 的那一條路，不是第四套模型（第〇·五守則）。
 *
 *   暴走：指令失效，身體自己**找**最近的敵人打。
 *   恐懼：指令失效，身體自己**遠離**最近的敵人，而且不打。
 *   混亂：指令失效，身體**隨便走**，而且不打、也選不到任何人。
 *
 * 三者的形狀完全一樣，所以三者的**接線**也一樣：一個 `orderSystem` 開頭的
 * 「丟掉這一格的指令」+ 一個跑在 `orderSystem` **最後**的 pass。差別只有一行 ——
 * 逃是「從最近的敵人指出來的方向」，混亂是「`world.rng` 抽的方向」。
 *
 * ⚠️ **必須是最後一步**，理由與 `fear.ts` 逐字相同：上面每一段都會寫
 * `nav.moveTarget`（追擊迴圈指向攻擊目標、抵達檢查清成 null）。跑在中間的話
 * 這一 tick 剛寫好的亂走點會被蓋回去 —— 而「被蓋回去」在畫面上就是**完全正常
 * 地打架**，狀態圖示還亮著（失敗形態 ②）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 決策 1 —— 「完全無法指定目標」寫在哪裡？→ `targeting.ts` 的**同一道閘**。
 *
 * `isAutoTargetable` 是**唯一**那份「誰算得上目標」的規則（自動索敵、逃跑的
 * 威脅掃描、小怪仇恨全部經過它）。混亂改成在那裡直接 `return false`，換到的是
 * 「這個人選不到任何人」在整個引擎裡**只有一個住處**。
 *
 * ⛔ 反面做法是只在這裡把 `nav.attackTarget` 清掉。那也會work —— 這一支跑在
 * 最後，所以清掉的目標活不過這一 tick —— 但 `autoAcquirePass` 仍然會每一 tick
 * 替他挑一個、寫進去、再被清掉，而 `isAutoTargetable` 裡那句「混亂的人隊友也
 * 算目標」會**繼續是綠的**，同時對玩家完全不可見。那是失敗形態 ④／⑤：一條
 * 斷言著沒有人看得到的行為的測試。⭐ 所以那一句被**刪掉**了，換成這一道閘。
 *
 * ⚠️ 這一支仍然清 `attackTarget`（跟恐懼一樣）：`isAutoTargetable` 管的是
 * 「**新的**目標挑不挑得到」，混亂**之前**手上那一個是既成事實，得有人拔掉。
 *
 * ⭐ 決策 2 —— 混亂期間**能不能施放技能**？→ **能，除非那張卡自己說不能。**
 *
 * 與 `fear.ts` 的決策 1 逐字相同的理由：「不能施法」在這個引擎裡已經有一個
 * 名字（`silenced`，C1 沉默），所以一張「連技能都放不出來」的混亂卡寫的是
 * `{ targetsAllies: true, silenced: true }`。⛔ 在這裡多開一個
 * `chaosBlocksCast` 會讓「不能施法」有兩個來源，而兩個來源必然漂走。
 *
 * ⭐ 決策 3 —— 混亂卡還需要寫 `berserk: true` 嗎？→ **不需要了，但寫了也沒事。**
 *
 * 2026-08-05 的慣例是 `{ berserk: true, targetsAllies: true }`（暴走負責丟指令，
 * 混亂只多改索敵那一步）。現在 `targetsAllies` 自己就負責丟指令 + 亂走，所以
 * `berserk` 是多餘的。兩個一起寫時**混亂贏**，而且是結構上的贏：`chaosPass`
 * 跑在 `berserkSeek` 之後，`berserkSeek` 剛挑好的目標會被這裡清掉。
 * ⚠️ `content/schema/effect.ts` 那句「要配 `berserk: true` 一起寫」現在只是
 * 過時的建議（不是謊話：那樣寫仍然是混亂）。契約層此刻正在改那個檔，所以那句
 * 話留給下一路改。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 確定性（硬約束）
 *
 *   · 方向來自 **`world.rng`**（`Math.random` 在 `sim/**` 被禁），抽的是一個
 *     8 格方位表的**索引** —— 一次 `rng.int(8)`，不是兩個浮點數再正規化。
 *     ⭐ 表裡沒有任何魔術數字：四個軸向 + 四個對角（`Math.SQRT1_2`，一個常數，
 *     不是三角函式）。「抽兩個座標再除以長度」也可以，但那要嘛偏袒對角線、
 *     要嘛需要一個次數不定的拒絕迴圈。
 *   · **不是每 tick 重抽。** 每 tick 換一個方向的身體淨位移趨近 0，畫面上是
 *     原地抽搐 —— 那看起來就是壞掉，不是混亂。重抽的時機是**絕對 tick**
 *     （`world.tick % CHAOS_REROLL_TICKS === 0`，CLAUDE.md「到期一律用絕對
 *     tick」），中間的 tick 沿用 `nav.moveTarget` 裡那個點。
 *   · 迭代 `world.nav` 前先排序（Map 的原生順序是生成順序），所以誰先抽是固定的。
 *   · ⚠️ 客戶端預測的影子世界 `status` 永遠是空的（`LocalPrediction` 自己 spawn
 *     一具身體），所以這支函式在影子裡**一次都不會跑** —— 它抽的 rng 不會讓
 *     預測與權威的 rng 流分家。恐懼今天也是這個處境。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { isConfused } from "./targeting";

/**
 * 隔多久換一個方向（tick）。15 ≈ 0.5 秒。
 *
 * ⚠️ 這**不是**平衡旋鈕，所以它不是欄位（同 `FEAR_FLEE_DISTANCE` 的理由）：
 * 它要滿足的只有兩件事 —— 短到看得出來是在亂走（不是直線衝出去），長到身體
 * 真的走得出一段距離（不是原地抖）。0.5 秒兩邊都滿足。
 */
export const CHAOS_REROLL_TICKS = 15;

/**
 * 每次把亂走的目標點放多遠。與 `FEAR_FLEE_DISTANCE` 同一個數字、同一個理由：
 * 只要「一個重抽窗口內走不完」就夠，否則身體會抵達、`moveTarget` 被清成 null、
 * 下一 tick 又重抽，變成走走停停。
 */
export const CHAOS_STEP_DISTANCE = 12;

/**
 * 八個方位。四軸 + 四對角，長度都恰好是 1。
 * ⚠️ `Math.SQRT1_2` 是一個**常數**（不在 `sim/purity.test.ts` 的禁用表裡），
 * 所以這張表不需要三角函式，也不需要抄一串小數點後 15 位的字面值。
 */
const S = Math.SQRT1_2;
const CHAOS_DIRS: readonly { x: number; z: number }[] = [
  { x: 1, z: 0 },
  { x: S, z: S },
  { x: 0, z: 1 },
  { x: -S, z: S },
  { x: -1, z: 0 },
  { x: -S, z: -S },
  { x: 0, z: -1 },
  { x: S, z: -S },
];

/**
 * 這個座位的 `order` 這一 tick 該不該被丟掉。
 *
 * 分成一支獨立函式（而不是讓 `orderSystem` 直接呼叫 {@link isConfused}）與
 * `berserk.ts` / `fear.ts` 同一個理由：讓呼叫點讀起來是一句話。
 */
export function chaosDropsOrders(world: SimWorld, id: EntityId): boolean {
  return isConfused(world, id);
}

/**
 * 把一個混亂的身體推去一個隨便的方向。每 tick 呼叫一次。
 *
 * 三件事，缺一個混亂就只是一個好看的圖示：
 *   ① **不打** —— `attackTarget` 清掉（`BasicAttackSystem` 沒有目標就不揮）。
 *      ⚠️ 「選不到新的」由 `targeting.ts` 的閘負責；這裡拔的是**混亂之前**手上
 *      那一個既成事實。
 *   ② **亂走** —— `moveTarget` 寫成一個隨機方位上的點，每 15 tick 換一次。
 *   ③ **丟掉玩家留下的指令**（`nav.order = null`）—— 否則混亂前最後那條 move
 *      會在 `updateWalkStall` / 自動接敵那邊繼續被當成「玩家正在走」。
 */
export function chaosWander(world: SimWorld, id: EntityId): void {
  const nav = world.nav.get(id);
  const t = world.transform.get(id);
  if (nav === undefined || t === undefined) return;

  // ① + ③ 手放開、方向盤沒收。
  nav.order = null;
  nav.attackTarget = null;
  nav.attackTargetAuto = false;
  world.autoEngaging.delete(id);

  // ② 亂走。沿用上一個方向，直到走到了（moveTarget 被抵達檢查清成 null）或
  //    重抽窗口到了 —— 見檔頭「不是每 tick 重抽」。
  if (nav.moveTarget !== null && world.tick % CHAOS_REROLL_TICKS !== 0) return;
  const dir = CHAOS_DIRS[world.rng.int(CHAOS_DIRS.length)] ?? CHAOS_DIRS[0]!;
  nav.moveTarget = {
    x: t.pos.x + dir.x * CHAOS_STEP_DISTANCE,
    z: t.pos.z + dir.z * CHAOS_STEP_DISTANCE,
  };
}

/**
 * 一整個 world 的混亂 pass（`orderSystem` 的最後一步，就在 `fearPass` 旁邊）。
 *
 * ⚠️ 掃的是 `world.nav` 而**不是** `world.champion`：#215 的殭屍也有 `nav`，
 * 而一支範圍混亂打到的多半正是它們。只掃英雄的話，對群體下混亂會對整個畫面上
 * 的敵人完全沒有效果，而測試若只擺英雄就一樣是綠的（失敗形態 ⑤）。
 *
 * ⚠️ 迭代前先排序：`world.nav` 是 Map，原生順序是生成順序，而這一支**會抽
 * rng** —— 沒排序的話兩台機器抽的順序不同，整條 rng 流當場分家。
 */
export function chaosPass(world: SimWorld): void {
  const ids: EntityId[] = [...world.nav.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    if (isConfused(world, id)) chaosWander(world, id);
  }
}
