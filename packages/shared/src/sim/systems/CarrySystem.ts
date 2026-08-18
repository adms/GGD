/**
 * 背負系統 —— 每 tick 把乘客的座標**從狀態重建**成載具的座標，並收掉到期的那些。
 *
 * ⚠️ **順序是語意的一部分**，而它由 `SimWorld.step()` 決定，⛔ 不由這個檔決定：
 * 它排在 `movementSystem`（5）**之後**、`dashOnEndSystem`（5′）之前。
 * 排在 movementSystem **之前**的話，乘客會被複製到載具**上一 tick** 的位置，
 * 而畫面上那是一個「跟著跑但慢半格」的抖動 —— 一個看得見卻很難歸因的缺陷，
 * 也正是 L4 守衛第一條斷言（同一 tick 內乘客座標逐位元等於載具座標）要抓的。
 *
 * ⚠️ **從狀態重建，⛔ 不訂閱事件**（抄 `aura/auraCarrier.ts` 的 DECISION 1）：
 * 事件會漏、會重複、會在 replay 上與現場不同步，而「誰在誰身上」是一個每 tick
 * 都問得出答案的狀態。到期、載具死亡、載具被 `world.destroy` 回收 —— 三條路
 * 在這裡收斂成同一段程式，⛔ 沒有一條可以被下一個功能忘記接上。
 *
 * ⭐ **升序 id 迭代，⛔ 不用 Map 插入順序**（逐字同 `auraCarrier` 的 DETERMINISM）：
 * 一名乘客下車再上車會被重新插到表尾，所以插入順序不是 id 順序。這裡的寫入
 * 彼此不重疊（一個乘客一列），但把順序釘死的成本是一次 sort，而它換掉的是
 * 「兩個 replica 只在某人重新上車之後才分岔」這種最難查的缺陷。
 *
 * ⚠️ **`onCarrierDeath` 的兩個成員在這裡的實際語意**（⛔ 不是我編的，是引擎做得到
 * 的那一半，逐字寫在這裡以免卡片與程式分岔）：
 *   · `release`（出貨預設）—— 載具一倒，乘客**立刻**下車、立刻恢復可選取。
 *   · `drop` —— 載具倒了乘客**留在箱子裡**（位置凍在箱子倒下的地方、仍不可選取）
 *     直到 `durationSec` 走完。⚠️ 這是「跟著倒」在**沒有「被擊倒」這個機制**的
 *     引擎裡最接近的一件事；⛔ 它不會讓乘客受傷或死亡。出貨的禰豆子的木箱走
 *     `release`，所以 `drop` 這條路依第〇·六守則**不測**。
 *
 * PURITY（sim/purity.test.ts）：不抽 rng、不看時鐘，到期走絕對 tick。
 */
import type { SimWorld } from "../SimWorld";
import { releaseCarried } from "../carry";

export function carrySystem(world: SimWorld): void {
  // 沒有人被背著的比賽（＝ [EX∅ 根源] 之前的每一場）在這裡就回去了 —— 零 sort、
  // 零寫入，所以既有錄影的 digest 逐位元不變。
  if (world.carried.size === 0) return;
  for (const id of [...world.carried.keys()].sort((a, b) => a - b)) {
    const st = world.carried.get(id)!;
    if (world.tick >= st.expiresAtTick) {
      releaseCarried(world, id);
      continue;
    }
    const ht = world.transform.get(st.carrier);
    // 載具已經被回收（`world.destroy`）—— ⛔ 不可以繼續掛著：entity id 會被
    // 重新發給下一具身體，而那一刻乘客會開始跟著一個素不相識的人跑，
    // 沿途沒有任何東西會報錯（同 `sim/taunt.ts::forgetTauntsBy` 的驗屍）。
    if (!ht) {
      releaseCarried(world, id);
      continue;
    }
    const hp = world.health.get(st.carrier);
    if (hp && !hp.alive) {
      // 見檔頭：`release` 立刻下車，`drop` 留在原地直到期滿。
      if (st.onCarrierDeath === "release") {
        releaseCarried(world, id);
        continue;
      }
    }
    const t = world.transform.get(id);
    if (!t) {
      releaseCarried(world, id);
      continue;
    }
    // ⭐ 這一行就是「背負」：乘客的座標不是他自己算出來的，是載具的複本。
    t.pos = { x: ht.pos.x, z: ht.pos.z };
    // 跟著換場（火圈把整區推走時，箱子裡的人不可以被留在上一個 zone —— 那會讓
    // 每一條 zone-scoped 的機制對他失效，而畫面上他明明就在載具身上）。
    t.zone = ht.zone;
    // ⛔ 速度歸零而不是複製載具的：乘客的 `vel` 只餵動畫層，一個「在箱子裡跑步」
    // 的角色比不動更難看，也更難歸因。
    t.vel = { x: 0, z: 0 };
  }
}
