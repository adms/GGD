/**
 * 瞄準保持 AIM HOLD (task #280) —— 把「玩家正在瞄」從**訊息節奏**還原成**意圖**。
 *
 * ── 這個檔案存在的理由 ────────────────────────────────────────────────────────
 * `IntentFrame.aim` 是一個 per-tick 欄位,而 `MovementSystem` 用
 * `world.aimTick.get(id) === world.tick` 判斷「這一 tick 玩家正在瞄」(#275 的
 * 瞄準優先)。這個等式假設**每一 tick 都會收到一筆帶 aim 的輸入**。
 *
 * 實務上不會。`IntentSender` 以 30Hz 合併送出,sim 也是 30Hz,兩個 30Hz 的節拍
 * 只要相位一漂,就會出現「這一 tick 兩筆、下一 tick 零筆」。零筆的那一 tick
 * `aim` 是 undefined,於是面向落回 #264 的面向鎖方向;下一 tick aim 又到了,
 * 面向再跳回瞄準方向。在鎖的 6 tick 窗口裡,身體每隔一 tick 硬跳一次
 * —— owner 看到的是「施法時角色抽搐」。
 *
 * ── 這個類別怎麼修 ───────────────────────────────────────────────────────────
 * 它坐在**網路訊息**與**per-tick IntentFrame**之間,把三種狀況分開:
 *
 *   1. 這一 tick 收到帶 aim 的訊息  → 用它,並記下絕對 tick;
 *   2. 這一 tick 收到訊息但**沒有** aim → 玩家放開類比了,立刻交還控制權
 *      (這正是 `aimPriority.test.ts` 第 3 條在斷言的行為,不可以退化);
 *   3. 這一 tick **一筆訊息都沒到** → 沿用最近一次的 aim,最多 `AIM_HOLD_TICKS`
 *      個 tick。這是 30Hz-vs-30Hz 的相位縫隙,不是玩家放手。
 *
 * 2 和 3 的差別是這個修法的全部:在 sim 內部它們長得一模一樣(都是
 * `frame.aim === undefined`),只有在**輸入邊界**才分得出來。所以修在這裡,
 * 而不是在 `MovementSystem` 加一個「最近 N tick」的模糊窗口 —— 那個窗口會把
 * 「放開類比」也延後 N tick,是另一種手感缺陷。
 *
 * ── 決定性 ──────────────────────────────────────────────────────────────────
 * 過期一律用**絕對 tick 相減**,沒有每 tick 遞減的計數器,所以沒有「誰先跑」的
 * 順序陷阱。沒有時鐘、沒有亂數、沒有三角函數。它產出的 frame 就是 recorder 錄
 * 下來的 frame(MatchController 錄的是 `seat.produceIntent` 的原始輸出),所以
 * 重播與現場逐 tick 相同。
 */
import type { Vec2 } from "./math/vec2";

/**
 * 沒有新訊息時,最多沿用幾個 tick 的舊瞄準方向。
 *
 * ⚠️ 這個數字是 8,不是 3 —— 3 是錯的,而且是**量出來**錯的(2026-07-30)。
 *
 * 第一版寫 3 tick,理由是「最壞情況是連續兩 tick 沒訊息」。那個假設只在
 * **桌機 30Hz 送出 / 30Hz 模擬**時成立。實測(用出貨的 AimHold → IntentFrame →
 * `world.step()`,面向鎖朝南 600 tick、玩家瞄北、腳往東走):
 *
 *     訊息只在 tick 1/5/9 抵達(= 每 4 tick 一筆)
 *     tick 1,2,3  facing = (0, +1)   北 —— 沿用中
 *     tick 4      facing = (0, −1)   南 —— 沿用到期,掉回面向鎖  ← 硬跳 180°
 *     tick 5,6,7  facing = (0, +1)   北
 *     tick 8      facing = (0, −1)   南                        ← 又跳一次
 *
 * 也就是 #280 的抽搐**在 3 tick 這個值下依然存在**,只是從「每隔一 tick」變成
 * 「每隔三 tick」。而 4 tick 一筆正是手機的常態:#282 量到手機 30fps 把送出率
 * 打到 15.6–21.8 訊息/秒,對 30Hz 的 sim 就是平均每 1.4–1.9 tick 一筆,再加上
 * frame pacing 的抖動,連續 3–4 個 tick 沒訊息是常態而不是例外。
 *
 * 8 tick @30Hz = 267ms,蓋得住上面整個範圍還有餘裕。
 *
 * 上界由什麼決定:這個窗口**只**在「完全沒有訊息」時才會走到(見 `drain` 分支 3)。
 * 玩家真的放開類比會送出一筆不帶 aim 的訊息,那是分支 2,**立刻**交還,和這個
 * 數字無關。所以這裡真正在防的是「連線斷了/切到背景」,267ms 之後交還完全夠快。
 *
 * ⚠️ 為什麼這個值**不是**後台可調的(第一守則的例外,有理由):
 * `AimHold` 坐在輸入邊界,伺服器那份在 `game-server/seat/InputMailbox`,客戶端
 * 那份在 `client/predict/LocalPrediction`。而**客戶端沒有任何 config 通道** ——
 * `combat-feel` 只在 `MatchController` 讀進 `world.combatFeel`,從來沒有送給
 * client(2026-07-30 查證:`apps/client` 底下 0 個 combatFeel 參照)。把它做成
 * 後台欄位的話,操作者一改,伺服器用新窗口、預測用舊窗口,自己的角色面向會和
 * 權威長期不同意,每一次 reconcile 都在打架 —— 那比寫死更糟。
 * 要讓它可調,先做「client 收得到 config」這件事;在那之前共用同一個常數才是對的。
 */
export const AIM_HOLD_TICKS = 8;

/** 退化向量(長度 0)不算瞄準 —— 類比回中時某些驅動會送 {0,0}。 */
function isRealAim(v: Vec2 | undefined): v is Vec2 {
  return v !== undefined && (v.x !== 0 || v.z !== 0);
}

export class AimHold {
  /** 最近一次真的收到的瞄準方向 */
  private held: Vec2 | null = null;
  /** `held` 是在哪一個絕對 tick 收到的 */
  private heldAtTick = 0;
  /** 自上次 `drain` 之後有沒有任何訊息進來 */
  private sawMessage = false;
  /** 自上次 `drain` 之後最後一筆訊息帶的 aim */
  private pending: Vec2 | undefined;

  /**
   * 一筆輸入訊息抵達。`aim` 缺席代表**這筆訊息沒有在瞄** —— 那是放開類比,
   * 不是縫隙,所以它會清掉 hold(見 `drain` 的分支 2)。
   */
  push(aim: Vec2 | undefined): void {
    this.sawMessage = true;
    if (isRealAim(aim)) this.pending = { x: aim.x, z: aim.z };
  }

  /**
   * 這一 tick 要放進 `IntentFrame.aim` 的方向。每 tick 恰好呼叫一次。
   * `tick` 是**絕對** sim tick。
   */
  drain(tick: number): Vec2 | undefined {
    const saw = this.sawMessage;
    const pending = this.pending;
    this.sawMessage = false;
    this.pending = undefined;

    // 1) 這一 tick 真的有瞄準輸入
    if (pending) {
      this.held = pending;
      this.heldAtTick = tick;
      return { x: pending.x, z: pending.z };
    }
    // 2) 有訊息但沒有 aim = 放開類比 → 立刻交還
    if (saw) {
      this.held = null;
      return undefined;
    }
    // 3) 完全沒有訊息 = 節拍縫隙 → 沿用,最多 AIM_HOLD_TICKS 個 tick
    if (this.held !== null && tick - this.heldAtTick < AIM_HOLD_TICKS) {
      return { x: this.held.x, z: this.held.z };
    }
    this.held = null;
    return undefined;
  }

  /** 忘掉一切(接管 / 斷線 / 回合重置)。 */
  clear(): void {
    this.held = null;
    this.heldAtTick = 0;
    this.sawMessage = false;
    this.pending = undefined;
  }
}
