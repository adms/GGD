/**
 * 恐懼 —— 「嚇到轉頭就跑」。`berserk.ts` 的鏡像。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 擋住四支出貨文案（owner 2026-08-08 的 90 支技能規格）：
 *
 *   · 89-002 俄羅斯輪盤   剩餘 4/6 對方會陷入 [恐懼] 狀態，持續 2 秒
 *   · 52-02  蹂躪編年史   若自身在 [狂怒] 狀態則額外附加⋯[恐懼] 狀態，持續 3 秒
 *   · 52-04  巨神一擊     若敵人具有 [恐懼] 狀態，則額外追加⋯傷害
 *   · 52-002 射殺百頭     最後一擊附加⋯[恐懼] 3 秒
 *
 * ⚠️ 52-04 讀的是「有沒有恐懼」，那是 Lane A 的謂詞在讀 `StatusEffect.feared`；
 * 這一支只負責**它是什麼**。兩邊共用同一個旗標，所以「文案說的恐懼」與
 * 「條件判斷的恐懼」不可能是兩件事。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 它走 `berserk` 的那一條路，不是第二套模型。
 *
 * 暴走是「玩家的指令全部失效，身體自己**找**最近的敵人打」；
 * 恐懼是「玩家的指令全部失效，身體自己**遠離**最近的敵人，而且不打」。
 * 兩者的形狀完全一樣，所以答案也一樣：`applyStatus` 上的**一個布林**
 * （`feared`），不是第四種 CC、不是一條屬性、不是一個新元件。
 *
 * 住在 status 上換到的東西與暴走逐字相同：`statusExpirySystem` 已經擁有它的
 * 清除，所以「永久嚇到不能玩」在結構上不可能發生 —— 而那正是這一族機制唯一
 * 真正危險的失敗模式（2 秒的恐懼與永久的恐懼，程式碼上只差一個沒有到期）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⭐ 決策 1 —— 恐懼期間**能不能施放技能**？→ **能，除非那張卡自己說不能。**
 *
 * owner 的文案四支都沒有說。而「不能施法」這件事在這個引擎裡**已經有一個
 * 名字**：`silenced`（C1 沉默）。所以一張「連技能都放不出來」的恐懼卡寫的是
 *
 *     { "feared": true, "silenced": true }
 *
 * 這是 C2 混亂立下的同一個先例（`{ berserk: true, targetsAllies: true }`）：
 * 一個旗標只回答一件事，要更狠就疊。
 *
 * ⛔ 反面做法是在這裡多開一個 `fearBlocksCast` 布林。那會讓「不能施法」在引擎裡
 * 有**兩個來源**，而兩個來源必然漂走 —— 到時候免控擋掉了沉默、擋不掉恐懼裡那個
 * 一模一樣的沉默，沒有任何測試會紅。**同一個效果只能有一個住處。**
 *
 * 所以預設是「腳被嚇跑，手還在」：89-002 那 4/6 分支仍然很痛（2 秒不能普攻、
 * 被逼離戰場），而要做成「完全嚇傻」是內容那一行的事，不是程式的事 ——
 * 這正是第一守則要的那個方向：決策點留在編輯器上。
 *
 * ⭐ 決策 2 —— 往哪裡逃？→ **離開此刻最近的合法敵人**，不是離開施加者。
 *
 * 三個理由，最後一個才是決定性的：
 *   ① 施加者會消失。52-002 射殺百頭的最後一擊、89-002 的子彈都可能在恐懼還
 *      沒退之前就死掉／離場，那時「遠離施加者」沒有方向可回，只能退化成不動 ——
 *      而一個站著不動的恐懼跟壞掉的恐懼長得一模一樣（失敗形態 ②）。
 *   ② `StatusEffect` 上沒有施加者的 `EntityId`（只有 `sourceId`，那是**技能**的
 *      origin 字串）。要「遠離施加者」得先在 status 上多存一個實體 id，而那是
 *      為了一個更差的行為付出一個新欄位。
 *   ③ **玩家看得懂的是「他在逃」**。每 tick 重算最近的敵人，等於「怕的是眼前
 *      這個人」：追上來的人換了，逃的方向就跟著換。遠離施加者則會出現「一邊
 *      被 B 砍一邊朝 B 跑」，畫面上看起來像 bug。
 *
 * ⚠️ **確定性**（硬約束）：沒有 rng、沒有三角函式、沒有 `**`。
 *   · 候選來自 `queryOverlap` + `rankOf`（**唯一**那份「誰是合法目標」的規則，
 *     跟自動索敵同一支，所以隱形／召喚物／隊友的答案不可能有兩個）；
 *   · 挑的是 `d2` 最小者，平手用 **entity id** 決勝 —— 與 `targeting.ts` 的
 *     最終決勝鍵同一個，所以 grid 的回傳順序影響不了結果；
 *   · 方向是一個減法 + 一次 `Math.sqrt` 正規化（`sqrt` 是 IEEE-754 正確捨入的，
 *     `math/vec2.ts` 早就在用）。
 *   · 完全重疊（`l2 == 0`）時退回**自己面向的反方向**：被嚇的人多半正對著嚇他
 *     的東西，所以「往後退」是唯一有意義的猜測；面向也退化時才用 +x。
 *
 * ⭐ 決策 3 —— 恐懼**算** CC（會被 `refusesControl` 免控擋掉）。
 *
 * 暴走刻意不算，理由寫在 `schema/effect.ts`：它是**自我增益帶 downside**，
 * 一個魔免 buff 不該讓初號機自己的暴走落不到自己身上。恐懼把那段理由的每一個
 * 前提都反過來了 —— 它是**敵人施加**的、純減益、而且比 `moveSpeedMult: 0.7`
 * （已經算 CC）更徹底地拿走了控制權。免控擋得掉 30% 減速卻擋不掉「這 3 秒你
 * 不能操作」，那個組合對玩家無法解釋。
 *
 * 判定寫在 `effects/applyStatus.ts` 的 `isCc`（那是**唯一**一處），所以恐懼同時
 * 拿到兩件事：免控會拒絕它並發 `immuneControl`（玩家看得見自己免疫了），
 * 而且它會被記進 `ccAppliedTicks` 戰績。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 只讀 `world.status` / `world.transform` / `world.tick`。到期一律是絕對 tick
 * 比較（`expiresAtTick > world.tick`），與 `isBerserk` 逐字相同 —— 兩支在同一
 * tick 內對「還算不算生效」不會有兩個答案。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { queryOverlap } from "./collision/queries";
import { rankOf } from "./targeting";

/**
 * 「怕誰」的掃描半徑。
 *
 * ⚠️ 這**不是**平衡旋鈕，所以它不是欄位：48 是整個競技場的量級（與 bot 的
 * `AI_ENGAGE_RANGE` 同一個數，見 `OrderSystem.ts` 的 `seekRadius` 那一段）。
 * 恐懼的語意是「怕場上的人」而不是「怕靠得夠近的人」—— 一個會讓恐懼在敵人退開
 * 幾步之後就靜默失效的半徑，只會產生「有時候不逃」這種查不出來的行為。
 */
export const FEAR_SCAN_RADIUS = 48;

/**
 * 每 tick 把逃跑目標點放多遠。
 *
 * ⚠️ 同樣**不是**平衡旋鈕：逃多快由角色自己的移動速度決定，這個數字只要
 * 「一個 tick 走不完」就夠（否則身體會抵達、`moveTarget` 被清成 null、下一 tick
 * 又重寫，走走停停）。12 是英雄體半徑的一個數量級以上，也遠大於 `ARRIVE_EPS`。
 */
export const FEAR_FLEE_DISTANCE = 12;

/**
 * 這個單位現在是不是恐懼狀態。
 *
 * 過濾條件與 `statusExpirySystem` / `isBerserk` **逐字相同**（`expiresAtTick >
 * world.tick`），所以「這一 tick 到底算不算恐懼」不會因為系統跑的先後而有兩個
 * 答案 —— Lane A 的 52-04 條件謂詞讀的也是這一支。
 */
export function isFeared(world: SimWorld, id: EntityId): boolean {
  const st = world.status.get(id);
  if (st === undefined) return false;
  for (const e of st.effects) {
    if (e.feared === true && e.expiresAtTick > world.tick) return true;
  }
  return false;
}

/**
 * 這個座位的 `order` 這一 tick 該不該被丟掉。
 *
 * 分成兩支函式（而不是讓 `orderSystem` 直接呼叫 {@link isFeared}）與 `berserk.ts`
 * 同一個理由：讓呼叫點讀起來是一句話「嚇到了就不收指令」。
 */
export function fearDropsOrders(world: SimWorld, id: EntityId): boolean {
  return isFeared(world, id);
}

/**
 * 此刻最近的**合法敵人** —— 逃離的參考點。
 *
 * 合法性完全交給 `rankOf`（→ `isAutoTargetable`），這裡只換一個比較鍵：
 * 自動索敵挑的是「該打誰」（威脅 → 低血 → 最近），逃跑要的是**最近**。
 * 這是刻意的第二個比較器而不是第二份索敵規則 —— 誰算敵人只有一份。
 */
export function fearNearestThreat(world: SimWorld, id: EntityId): EntityId | null {
  const t = world.transform.get(id);
  if (t === undefined) return null;
  const ids = queryOverlap(
    world,
    { kind: "circle", center: t.pos, radius: FEAR_SCAN_RADIUS },
    { zone: t.zone, aliveOnly: true },
  );
  let best: EntityId | null = null;
  let bestD2 = 0;
  for (const cand of ids) {
    const r = rankOf(world, id, cand);
    if (r === null) continue;
    // 平手用 entity id 決勝(升冪)—— grid 的回傳順序是空間分桶的產物,不是規則。
    if (best === null || r.d2 < bestD2 || (r.d2 === bestD2 && cand < best)) {
      best = cand;
      bestD2 = r.d2;
    }
  }
  return best;
}

/**
 * 把一個嚇壞的身體推離戰場。每 tick 呼叫一次。
 *
 * 三件事，缺一個恐懼就只是一個好看的圖示：
 *   ① **不打** —— `attackTarget` 清掉（`BasicAttackSystem` 沒有目標就不揮，
 *      追擊迴圈也沒有東西可以追）。⚠️ 這是「恐懼」與「暴走」唯一真正的行為
 *      分歧，也是最容易被寫漏的那一件：只做 ②（逃）的話，一個被恐懼的近戰
 *      會一邊後退一邊繼續砍，玩家完全看不出他中了什麼。
 *   ② **逃** —— `moveTarget` 寫成「從最近的敵人指向自己」那個方向上的一點。
 *   ③ **丟掉玩家留下的指令**（`nav.order = null`）—— 否則恐懼前最後那條 move
 *      會在 `updateWalkStall` / 自動接敵那邊繼續被當成「玩家正在走」，而
 *      `berserk.ts` 已經記錄過那條路的代價（身體忠實地走向三秒前點的地方）。
 *
 * ⚠️ 它必須跑在 `orderSystem` 的**最後**：追擊迴圈（`nav.attackTarget` → 寫
 * `moveTarget`）與自動索敵都在它前面，跑在中間的話這一 tick 剛寫好的逃跑點會
 * 被追擊蓋回去，而「蓋回去」在畫面上就是**完全不逃**。
 */
export function fearFlee(world: SimWorld, id: EntityId): void {
  const nav = world.nav.get(id);
  const t = world.transform.get(id);
  if (nav === undefined || t === undefined) return;

  // ① + ③ 手放開、方向盤沒收。
  nav.order = null;
  nav.attackTarget = null;
  nav.attackTargetAuto = false;
  world.autoEngaging.delete(id);

  // ② 逃。沒有任何敵人在場 = 沒有東西可怕,站著就好(仍然不聽指令、不攻擊)。
  const from = fearNearestThreat(world, id);
  if (from === null) {
    nav.moveTarget = null;
    return;
  }
  const src = world.transform.get(from);
  if (src === undefined) {
    nav.moveTarget = null;
    return;
  }
  const dx = t.pos.x - src.pos.x;
  const dz = t.pos.z - src.pos.z;
  const l2 = dx * dx + dz * dz;
  let ux: number;
  let uz: number;
  if (l2 > 1e-12) {
    const l = Math.sqrt(l2);
    ux = dx / l;
    uz = dz / l;
  } else {
    // 完全重疊 —— 見檔頭決策 2 的最後一段。往自己面向的反方向退。
    const fl2 = t.facing.x * t.facing.x + t.facing.z * t.facing.z;
    if (fl2 > 1e-12) {
      const fl = Math.sqrt(fl2);
      ux = -t.facing.x / fl;
      uz = -t.facing.z / fl;
    } else {
      ux = 1;
      uz = 0;
    }
  }
  nav.moveTarget = {
    x: t.pos.x + ux * FEAR_FLEE_DISTANCE,
    z: t.pos.z + uz * FEAR_FLEE_DISTANCE,
  };
}

/**
 * 一整個 world 的恐懼 pass（`orderSystem` 的最後一步）。
 *
 * ⚠️ 掃的是 `world.nav` 而**不是** `world.champion`：#215 的殭屍也有 `nav`，
 * 而 52-002 / 52-02 的範圍恐懼打到的多半正是它們。只掃英雄的話，一支對群體
 * 下恐懼的技能會對整個畫面上的敵人**完全沒有效果**，而測試若只擺英雄就一樣是
 * 綠的（失敗形態 ⑤：被測的不是出貨的那個）。
 *
 * ⚠️ 迭代前先排序:`world.nav` 是 Map,原生順序是生成順序。
 */
export function fearPass(world: SimWorld): void {
  const ids: EntityId[] = [...world.nav.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    if (isFeared(world, id)) fearFlee(world, id);
  }
}
