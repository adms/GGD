/**
 * BLINK — 真瞬移的**機制**（owner 2026-08-09 / GH#301-2）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  它與 `movement/leap.ts` 的差別，一句話：中間位置不存在
 * ═══════════════════════════════════════════════════════════════════════════
 * `leap` 是一條**積分**出來的拋物線：`MIN_LEAP_TICKS = 2` 把飛行時間壓在地板上，
 * 所以就算內容寫 `travelSec: 0.001`，身體仍然真的存在於中間的每一格 —— 會被範圍
 * 技掃到、會被 `queryOverlap` 找到、會被追擊迴圈追上。規範因此寫「不是瞬間傳送，
 * 是極短平移，過程看得見」，而 owner 的裁決是「**是真的瞬移，不是平移**」。
 *
 * 所以這支函式做的事只有一件：**在同一個 tick 之內把 `Transform.pos` 換掉**
 * （WC3 `SetUnitPositionLoc` 的語意）。⛔ 它不寫 `nav.override`、不排任何進度，
 * 因為只要經過那個積分器，「瞬移」就只是換了名字的 `leap`。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  同一 tick 改座標的三個問題（blink.ts 檔頭點名的那三個），逐一回答
 * ═══════════════════════════════════════════════════════════════════════════
 * ① **碰撞：目的地被佔住怎麼辦？**
 *    → 走 **`resolveLandingPoint`**，也就是 `leap` 用的**同一支**函式：把一個
 *      本人半徑的圓推出每一個障礙、再夾回決鬥區邊界（`relaxBody`，與走路的人
 *      共用）。所以瞬移**永遠不會結束在牆裡、也不會結束在場外**。
 *
 *    ⚠️ 為什麼不是「取消」或「多一格欄位」：`effects/blink.ts` 的契約層檔頭把
 *    「落點合法性」列成一個決策點。但這一題的兩個選項不對等 —— 「取消」會讓
 *    一支保命技在最需要它的貼牆situation 靜默失效（玩家看到的是「按了沒反應」），
 *    而「再瞄準」是 `leap` 在 #247 已經替整個遊戲做過的裁決，理由寫在
 *    `movement/leap.ts`：落地時才修正會產生 touchdown snap。⛔ 更重要的是
 *    **兩套落點合法性規則必然分岔**（第〇·五守則），而分岔的那一天沒有人會發現。
 *    真正該是欄位的是「撞到障礙時要不要停在障礙前」，而那一格已經存在，叫
 *    `stopShortUnits`。
 *
 *    ⛔ 身體重疊**不**在這裡處理：`relaxBody` 只推障礙與邊界，不推別人。這是
 *    刻意與 `leap` 一致 —— 兩個身體疊在一起由碰撞的軟分離在接下來幾 tick 推開，
 *    而「目的地站著人就取消瞬移」會讓集結類技能（`to: "caster"`，三支）在隊友
 *    站得近的時候隨機失敗。
 *
 * ② **網路：客戶端會不會把瞬移插值成一條快速滑行？**
 *    → **不會，而且不需要新的 wire 欄位。** `apps/client/src/net/
 *      InterpolationBuffer.ts` 從 #43 起就在做 TELEPORT SNAP：任何**單 tick**
 *      位移超過 `TELEPORT_STEP_UNITS`（render/math/motion.ts，出貨 4）的樣本
 *      會被標記成 discontinuous，插值器改成「停在跳之前那一格、在 tick 邊界
 *      直接跳過去」，而且把被標記的鄰居踢出 Catmull-Rom 的切線估計。
 *      那一段檔頭甚至逐字寫著它就是為 「blink/teleport abilities」 寫的。
 *
 *    ⚠️ 所以這裡刻意**沒有**發任何「不要插值」的事件：加一格 wire 欄位去講一件
 *    客戶端已經能從位置本身推導出來的事，等於同一個事實有兩個住處（而
 *    `defineTypes` 是 APPEND-ONLY，加錯回不去）。
 *    ⚠️ 已知邊界：短於 4 單位的瞬移仍然會被插值成 33 ms 的滑行。那是**渲染**的
 *    門檻，不是模擬的 —— 模擬裡中間位置一格都不存在（守衛就是釘這件事），
 *    而 4 單位以下的滑行在 33 ms 內肉眼分不出來。要改的是那個常數，不是這裡。
 *
 * ③ **決定性：落點怎麼算的？**
 *    → 完全沒有 rng。`resolveLandingPoint` 只有 + − × ÷ 與比較，
 *      `world.rng` 一次都沒被碰到，所以瞬移**不會把任何其他系統的擲骰移位**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  為什麼要先取消 `nav.override`
 * ═══════════════════════════════════════════════════════════════════════════
 * `LeapOverride` 的位置是 `from`/`to`/`elapsed` 的**絕對函式**（見 leap.ts 的
 * 決定性註記 3）—— 也就是說一個飛行中的身體，下一 tick 的座標與「它現在在哪」
 * 完全無關。不取消的話，瞬移會在同一個 tick 之後被積分器**原樣抹掉**，而畫面上
 * 看起來就是「這支技能有時候沒有效果」（失敗形態 ②）。`DashOverride` 沒有這個
 * 問題（它從當下位置繼續磨 `remaining`），但一段「衝刺到 A」的剩餘距離在人已經
 * 被傳到 B 之後就沒有意義了，所以一起取消：**瞬移結束當下的位移**。
 */
import type { EntityId } from "../../ids";
import type { Vec2 } from "../math/vec2";
import type { SimWorld } from "../SimWorld";
import { cancelLeap, resolveLandingPoint } from "./leap";

/**
 * 把 `id` 的身體**在這一個 tick 之內**搬到 `requested`（落點會先被證明合法）。
 *
 * 回傳實際落點；沒有 transform（不是一具身體）時回 `null`，呼叫端因此可以把
 * 「沒有搬成」與「搬到哪」分開處理 —— `onArrive` 只在真的搬了之後才跑。
 */
export function teleportBody(world: SimWorld, id: EntityId, requested: Vec2): Vec2 | null {
  const t = world.transform.get(id);
  if (t === undefined) return null;

  // 見檔頭：飛行中的身體位置是 elapsed 的絕對函式，不取消的話瞬移會被積分器
  // 在下一 tick 原樣抹掉。`cancelLeap` 同時清掉 `world.airborne`（死亡／復活／
  // 回合重置走的也是這一支），所以不會留下一筆永遠飄在空中的登錄。
  const nav = world.nav.get(id);
  if (nav?.override?.kind === "leap") cancelLeap(world, id);
  else if (nav?.override != null) nav.override = null;

  // 落點合法性走 `leap` 的**同一支**函式（障礙推出 + 邊界夾限，用走路的人用的
  // 那份 `relaxBody`）。⛔ 不要在這裡再寫一份。
  const to = resolveLandingPoint(world, id, requested);

  // ⭐ 承重的那一行：**同一個 tick**，位置就是新的了。中間位置一格都不存在。
  t.pos = { x: to.x, z: to.z };
  return t.pos;
}
