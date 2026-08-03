/**
 * 面向鎖 FACING LOCK (task #264 「揮劍/施法時角色沒有轉向目標」).
 *
 * 為什麼需要一個獨立的「鎖」而不是直接寫 `t.facing`
 * ---------------------------------------------------------------------------
 * 面向是 **模擬狀態**（`Transform.facing`，走 protocol 的 `fx/fz`；client 只是
 * 用 70ms 的 nlerp 去追它，見 ChampionView.stepFacing）。所以「沒有轉向目標」
 * 不可能在渲染層修 —— 權威值本身就是錯的。
 *
 * 而權威值之所以錯，是因為面向**沒有擁有權模型**：`MovementSystem` 每一 tick 都
 * 會無條件把 facing 轉向「移動方向」(MovementSystem 步驟 2)。於是：
 *
 *   • `castAbility` 在 step slot 3 寫進去的施法面向，會在同一 tick 的 slot 5 被
 *     移動方向蓋掉 —— 而搖桿/觸控**每一幀**都會合成一筆 `move` 訂單
 *     (OrderSystem 的 #274 註解白紙黑字寫著)，所以只要玩家在走路，施法的轉身
 *     存活 0 tick；
 *   • 有吟唱時間的技能會走 `!moved` 分支，那裡是轉向 `nav.attackTarget`（可能是
 *     另一個單位），整段吟唱都在把身體轉離施法方向；
 *   • 普攻（揮劍）從頭到尾**沒有任何一行**寫過面向。站定時碰巧由 `!moved` 分支
 *     轉向攻擊目標，但 #274 明確支援「邊走邊順手砍」，那條路徑上人是面向走路
 *     方向揮劍的。
 *
 * 所以修法是給面向一個**優先權**：一次「出手」(施法 / 揮劍) 會 commit 一個短暫
 * 的瞄準方向，在鎖有效期間移動方向不得覆蓋它。這就是 LoL/格鬥遊戲的做法 ——
 * 走位歸走位，出手的那一刻身體朝著目標。
 *
 * 決定性 (rule 3)
 * ---------------------------------------------------------------------------
 * 只有向量與整數 tick 比較，沒有三角函數、沒有 Math.pow、沒有 wall-clock。
 * 到期用**絕對 tick**（`untilTick`）而不是每 tick 遞減的計數器 —— 這樣就不需要
 * 新的 decay system，也就沒有「arm 在 slot 6、decay 在 slot 7b 會不會同一 tick
 * 就被扣掉」這種順序陷阱。過期的項目在 MovementSystem 讀到時順手刪除。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { Vec2 } from "./math/vec2";
import { lenSq } from "./math/vec2";
import { DEFAULT_FACING, type FacingRules } from "./combatFeel";

/** 一次出手所 commit 的瞄準方向 + 絕對到期 tick。 */
export interface FacingLock {
  /** 單位向量（呼叫端負責 normalize） */
  dir: Vec2;
  /** `world.tick < untilTick` 時鎖有效 */
  untilTick: number;
}

/**
 * 出手後的「收招」餘韻 tick 數。揮劍在傷害點那一刻就結束了，但如果鎖也同時放掉，
 * 身體會在命中的同一幀就被移動方向拉走 —— 看起來就像根本沒轉過。3 tick (100ms)
 * 剛好蓋過 client 那段 70ms 的 yaw 平滑，出手才讀得出來。
 *
 * ⚠️ 這兩個 `const` 現在只是**出貨預設的鏡子**(`DEFAULT_FACING`),不是真值來源。
 * 出貨路徑一律走 `facingTicks(world)` 讀 `world.combatFeel.facing`,否則後台調了
 * 窗口長度、玩家那一場卻沒變(第②種故障:算出來但沒送到)。它們留著是因為測試
 * 與舊呼叫端還在讀,而且 `DEFAULT_FACING` 必須和它們相等 —— 有守衛釘住。
 */
export const FACING_FOLLOW_THROUGH_TICKS = 3;

/**
 * 瞬發技能 (castTimeSec = 0) 的最低鎖定長度。瞬發技沒有吟唱可以撐住面向，
 * 若只給 follow-through，走位中的玩家幾乎看不到轉身。6 tick = 200ms，和
 * MovementSystem 的 TURN_FACTOR 轉完 90° 所需的時間同一個量級。
 */
export const FACING_INSTANT_CAST_TICKS = 6;

/**
 * 這一場實際生效的面向鎖窗口長度(後台可調,`config.combat-feel@1` 的 `facing`)。
 *
 * 為什麼是一支函式而不是直接讀欄位:`world.combatFeel` 在 `MatchController`
 * 建構時才被換成文件的值,而 `SimWorld` 的預設是 `DEFAULT_COMBAT_FEEL`。舊測試
 * 造出來的 world 可能整個 `facing` 都沒有(手寫 `world.combatFeel = {...}` 只填
 * 兩格的寫法在 repo 裡真的存在),所以這裡對缺格回退到出貨預設,而不是給 undefined
 * 讓它一路變成 `NaN` tick —— `world.tick + NaN` 之後每一個到期比較都是 false,
 * 鎖會**永遠不過期**,而且完全無聲。
 */
export function facingTicks(world: SimWorld): FacingRules {
  return world.combatFeel?.facing ?? DEFAULT_FACING;
}

/**
 * Commit 一個瞄準方向：立刻寫進 `t.facing`（出手要的是**即時**回饋，client 端的
 * 70ms nlerp 會把這個 snap 渲染成一次快速轉身，不會硬切），並鎖住 `ticks` tick
 * 不讓移動方向覆蓋。
 *
 * 退化方向 (長度 0) 直接忽略 —— 不寫 facing 也不 arm，免得把身體轉到一個沒有
 * 意義的方向去。
 */
export function armFacingLock(
  world: SimWorld,
  id: EntityId,
  dir: Vec2,
  ticks: number,
): void {
  if (lenSq(dir) < 1e-12 || ticks <= 0) return;
  const t = world.transform.get(id);
  if (!t) return;
  t.facing = { x: dir.x, z: dir.z };
  const untilTick = world.tick + ticks;
  const cur = world.facingLock.get(id);
  // 後面的出手一律覆蓋前面的（新的瞄準才是玩家現在的意圖），但到期時間取較晚者，
  // 這樣「長吟唱中途被短普攻覆寫」不會把整段吟唱的鎖提前放掉。
  world.facingLock.set(id, {
    dir: { x: dir.x, z: dir.z },
    untilTick: cur && cur.untilTick > untilTick ? cur.untilTick : untilTick,
  });
}

/**
 * 決策點 (GH#281 / owner 2026-08-03「攻擊面向卻是錯誤的」)：
 * **自己的英雄**那具身體的面向，要用哪一條路。
 *
 * 為什麼這是一個決策點而不是一個實作細節 —— 遠端英雄沒有這個問題（`GameApp`
 * 的 `poseFor` 對他們讀權威快照的 `fx/fz`），只有玩家自己的英雄走客戶端預測。
 * 而預測那具「影子」只重播 `orderSystem` + `movementSystem`，所以：
 *
 *   · 走路時 `movementSystem` 會寫 facing（朝移動方向）→ 走路面向是對的；
 *   · **站定出手**時 `movementSystem` 走 `!moved` 分支，那裡只認
 *     `aimTick` / 面向鎖 / `nav.attackTarget`，而影子世界裡**三個都沒有**
 *     （敵人不在影子裡，`orderSystem` 因此立刻把 `attackTarget` 清成 null）
 *     → **沒有任何一行程式寫 facing**，身體凍在最後一次走路的方向。
 *
 * 三條路各自的代價是真的不一樣，所以它是欄位不是常數：
 *
 * | 模式 | 誰決定自己英雄的面向 | 代價 |
 * |---|---|---|
 * | `predicted` | 只有影子 | 零延遲，但站定出手仍然不轉身（= 這個缺陷本身） |
 * | `authoritative` | 只有伺服器快照 | 永遠正確，但**每一次轉身都晚一趟 RTT** |
 * | `hybrid`（出貨） | 影子為主 + 每張快照校正 | 跟手且最後一定轉對；兩者互補 |
 *
 * ⚠️ 這個列舉住在 `sim/` 而不是 client，是因為**出貨值與上下界要和權威端同一份
 * 真值**（`config.combat-feel@1` 的 `facing.localMode`）。client 端的解析與
 * 現值在 `apps/client/src/predict/localFacingMode.ts`。
 */
export type LocalFacingMode = "predicted" | "authoritative" | "hybrid";

/** 合法值，依後台下拉選單要顯示的順序。 */
export const LOCAL_FACING_MODES: readonly LocalFacingMode[] = [
  "predicted",
  "authoritative",
  "hybrid",
];

/**
 * 出貨值 = `hybrid`（owner 2026-08-03 的裁決：「(a) 與 (b) 兩個都做」）。
 * (b) 讓它跟手，(a) 讓它可校正 —— 不是二選一。
 */
export const DEFAULT_LOCAL_FACING_MODE: LocalFacingMode = "hybrid";

/**
 * 把一個來路不明的值收斂成合法模式。**認不得就回出貨預設**，不是丟例外：
 * 這條路上唯一的呼叫端是內容文件（後台可改），而一個打錯字的字串不應該讓整場
 * 比賽的自己英雄失去面向。
 *
 * ⚠️ 這是刻意的 fail-open，所以它**有聲**：呼叫端 `localFacingMode.ts` 會在
 * 落回預設時 warn 一次（CLAUDE.md「fail-open 沒錯，靜默才是缺陷」）。
 */
export function parseLocalFacingMode(v: unknown): LocalFacingMode {
  return LOCAL_FACING_MODES.includes(v as LocalFacingMode)
    ? (v as LocalFacingMode)
    : DEFAULT_LOCAL_FACING_MODE;
}

/** `hybrid` / `authoritative` 才把權威快照的面向 snap 進影子（(a) 校正路徑）。 */
export function facingModeSnapsFromAuthority(mode: LocalFacingMode): boolean {
  return mode !== "predicted";
}

/** `hybrid` / `predicted` 才讓影子自己朝攻擊目標轉身（(b) 跟手路徑）。 */
export function facingModePredictsLocally(mode: LocalFacingMode): boolean {
  return mode !== "authoritative";
}

/**
 * 這個 tick 這個單位的瞄準方向，沒有（或已過期）則回 null。過期項目順手刪除，
 * 所以這張表不會隨著一場比賽無限長大。
 */
export function facingLockDir(world: SimWorld, id: EntityId): Vec2 | null {
  const lock = world.facingLock.get(id);
  if (!lock) return null;
  if (world.tick >= lock.untilTick) {
    world.facingLock.delete(id);
    return null;
  }
  return lock.dir;
}
