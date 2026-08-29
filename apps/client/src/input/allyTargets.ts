/**
 * 友方目標候選（GH#722）—— `castType:"targeted"` + `targetsEnemies:false` 的技能
 * 按下去要指得到**隊友**。
 *
 * ⛔ **在此之前輸入層一條友方路徑都沒有。** 全 client 樹只有一份候選清單
 * （`GameApp.enemyUnitsFor`），而它逐字寫著
 * `if ((this.teamBySeat.get(es.seatId) ?? -1) === myTeam) return;` ——
 * **隊友被明確排除**。三條輸入路徑（滑鼠 `pickEnemyAt`、手把瞄準輔助與觸控自動
 * 取得 `pickNearestUnit`）共用那一份清單 ⇒ 任何裝置都指不到隊友 ⇒
 * `resolveCastTarget` 的 `targeted` 分支永遠拿到 null ⇒ **零反應**。
 *
 * ⭐ **為什麼候選來源是 `frameBus.champions` 而不是第二份隊伍判定**：
 * 那張表是 `game/frameBusProjection` **每一幀**重建的，而且它重建的正是
 * 「這個玩家現在看得到的實體」——已經吃過 zone cull、隱形、視野遮蔽與出界閘。
 * `frameBus.ts` 自己的 `relationToLocal` 檔頭把這個性質寫成規矩：
 * 「它是同一張渲染器投影用的表，所以從這裡解出來的敵友關係不可能與畫面不一致」。
 * ⇒ ⭐ 沿用它，「玩家指得到的東西 = 玩家看得到的東西」這條不變量就**不必再寫一次**
 *   （第〇·四守則：同一個事實不可以有第二個住處）。
 *
 * ⚠️ **中立單位（治療花、守護塔）不是隊友。** 它們在錨點表裡帶 `teamId: -1`
 * （`frameBusProjection`: `teamId: isNeutral ? -1 : …`），而 sim 端對友方技能
 * **明確拒絕**花（`abilitySystem.ts` 的 `world.flower.has(...) → "bad-target"`）。
 * ⇒ 這裡用 `teamId >= 0 && teamId === 我的` 把兩者一起擋掉，
 *   ⛔ 不必 import render 層的 KIND_* 常數（那會是第二個會漂的判準）。
 *
 * ⭐ **自己也在清單裡，而且那是刻意的**：sim 的友方分支只擋「敵隊」與「花」，
 * 施法者對自己永遠合法（同隊 + 距離 0）。⇒ 對著自己按治療就要放得出去。
 */
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import { frameBus } from "../frameBus";
import { playerView } from "../game/gameAppQueries";
import { pickNearestUnit, pickUnit, type PickableUnit } from "./Picking";

/**
 * 挑選用的碰撞半徑 —— 與 `GameApp.enemyUnitsFor` 推的那一份**同一個值**。
 * ⚠️ 兩側的點擊模型必須一致：友方比敵方好點（或難點）都是一個看不出來的偏差。
 */
const PICK_RADIUS = 0.6;

/**
 * 這一發的**施法者** —— ⛔ 不是「本機玩家」。
 *
 * ⚠️⚠️ ⭐ **這個區別就是併機同樂（couch）那條路徑的全部**：`frameBus` 的
 * `isLocal` 逐字是 `es.id === hudStore.localEntityId`（`GameApp` 的錨點迴圈）
 * ⇒ **一場四人併機裡它永遠只有 1P 那一具是 true**。而 2..4P 各有自己的
 * `IntentSender`、自己的座位、**而且可以在另一隊**（`MultiGamepadSystem` 的
 * `ctxProvider(player)` 逐字用 `playerTeam(player)` 推敵方候選）。
 *
 * ⇒ 拿 `isLocal` 當「我是誰」會同時弄壞兩件事，而兩件都是**送得出去但錯的**：
 *   ① 讓路那一格記到 1P ⇒ 2P 與自己的距離永遠 0 又沒被扣分 ⇒ **只治療得到自己**
 *   ② 隊伍取到 1P 的 ⇒ 2P 在另一隊時整份候選是**敵隊** ⇒ 伺服器 `bad-target`
 */
export interface AllyCaster {
  entityId: number;
  teamId: number;
}

/**
 * 第 `player` 位本機玩家（0 = 滑鼠/鍵盤/觸控那一位）現在的身分。
 * ⛔ 還沒有錨點／座位時回 null（比賽還沒開始、觀戰、剛換體的那幾幀）。
 *
 * ⚠️ 隊伍**以錨點表為準**而不是座位：錨點那一格吃過 [陣營轉換] 的覆寫
 * （`GameApp`：「全客戶端 teamId 的唯一擴散點」）⇒ 一具被搶過去的身體，
 * 它指得到的隊友要跟**畫面上的顏色**一致。錨點還沒建好才退回座位的隊伍。
 */
export function casterOf(player: number): AllyCaster | null {
  // 1P：錨點表自己就答得出來（`isLocal` 就是它）。⚠️ 走錨點而不是 hudStore 的
  // `localEntityId`，是因為錨點表是**同一幀**寫的 —— 兩個來源在重連/換體的那幾幀
  // 會短暫不一致，而那正是「指到一個畫面上不存在的人」。
  if (player === 0) {
    for (const a of frameBus.champions.values()) {
      if (a.isLocal) return a.teamId >= 0 ? { entityId: a.entityId, teamId: a.teamId } : null;
    }
    return null;
  }
  // 2..4P（couch）：`localPlayers` 是**唯一**一份「第 k 位是哪一具身體」的投影
  // （`game/gameAppQueries.playerView`）。⛔ 不在這裡自己再 find 一次座位表。
  const lp = playerView(player);
  if (!lp || lp.entityId === null) return null;
  const teamId = frameBus.champions.get(lp.entityId)?.teamId ?? lp.teamId;
  return teamId >= 0 ? { entityId: lp.entityId, teamId } : null;
}

/**
 * 現在**指得到的隊友**（含自己）作為可挑選的圓 —— 友方指定技能唯一的候選來源。
 *
 * ⛔ 查不到施法者 / 沒有隊友時回空陣列，⛔ 不是回全部單位：
 * 一個「查不到我是誰就放行所有人」的退回值，會讓治療技能指到敵人身上
 * （而 sim 會拒絕它 ⇒ 玩家看到的仍然是零反應，只是更難查）。
 */
export function allyPickablesFor(player: number): PickableUnit[] {
  const me = casterOf(player);
  if (!me) return [];
  const units: PickableUnit[] = [];
  for (const a of frameBus.champions.values()) {
    if (!a.alive) continue;
    // 中立（花／守護塔）帶 teamId -1 ⇒ 這一行同時擋掉它們。
    if (a.teamId < 0 || a.teamId !== me.teamId) continue;
    units.push({
      id: a.entityId,
      x: a.worldX,
      z: a.worldZ,
      radius: PICK_RADIUS,
      // 隊友清單裡不可能有小怪（錨點表只收英雄與中立），而中立上面已經擋掉了。
      kind: "champion",
      // ⭐⭐ **自己在自動索敵裡讓路給真正的隊友**（量出來的，⛔ 不是設計偏好）：
      //   自己與自己的距離**永遠是 0**，而 `pickNearestUnit` 挑的是最近的 ⇒
      //   ⛔ 沒有這一格，觸控與手把**永遠只治療得到自己**，一次都碰不到隊友。
      //   ⚠️ 這一格是**既有機制**（`PickableUnit.priority`，小怪讓路給英雄用的那個），
      //     ⛔ 不是新概念：`pickUnit`（滑鼠直接點）**刻意不讀它** ⇒ 點自己就是自己，
      //     而 `pickNearestUnit` 讀它 ⇒ 隊友在射程內就贏，沒有隊友時自己仍然被選上
      //     （它是**扣分**⛔ 不是過濾 —— 場上只剩自己時自己就是最佳候選）。
      //   ⭐ 比的是 `me.entityId`（**這一發的施法者**），⛔ 不是 `a.isLocal`
      //     —— 見 {@link casterOf}：後者在併機同樂裡永遠指著 1P。
      priority: a.entityId === me.entityId ? 1 : 0,
    });
  }
  return units;
}

/**
 * 滑鼠：地面點下的隊友（與敵方那條路同一支 `pickUnit`、同一個圓模型）。
 *
 * ⚠️ ⛔ 沒有 `player` 參數是刻意的：滑鼠／鍵盤**只屬於 1P**
 * （`MultiGamepadSystem` 的檔頭逐字「player 0 additionally has mouse/keyboard」，
 * couch 的 2..4P 是純手把）。
 */
export function pickAllyAt(ground: Vec2): number | null {
  return pickUnit(ground, allyPickablesFor(0));
}

/**
 * 手把／觸控：`from` 附近最近的隊友，有瞄準方向時沿方向偏壓。
 *
 * @param player ⭐ **這一發是第幾位本機玩家按的**（0 = 1P）。⛔ 它**不是選用的**：
 *   一個 `= 0` 的預設值會讓每一個忘了填的呼叫端**靜默地變成 1P 的答案** ——
 *   而那正是併機同樂那兩個缺陷的形狀（見 {@link casterOf}）。⇒ 讓編譯器問。
 *
 * ⚠️ ⛔ 不傳 `mobPenalty`：隊友清單裡沒有小怪，讓路幅度對它整組是死的。
 */
export function nearestAllyTo(
  from: Vec2,
  maxRange: number,
  aimDir: Vec2 | null,
  player: number,
): number | null {
  return pickNearestUnit(from, allyPickablesFor(player), maxRange, aimDir);
}
