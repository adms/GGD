/**
 * Seat — binds a seat index to its champion entity and its current driver.
 * `setDriver()` is THE takeover seam: all gameplay state lives in the sim, so
 * swapping the driver between ticks is the entire Human<->AI handover.
 */
import type { EntityId, SeatId, TeamId } from "@ggd/shared/ids";
import type { IntentFrame } from "@ggd/shared/sim/intents";
import type { SimWorld } from "@ggd/shared/sim/SimWorld";

export interface SeatDriver {
  readonly kind: "human" | "ai";
  onAttach(seat: Seat): void;
  onDetach(): void;
  produceIntent(seat: Seat, world: SimWorld, tick: number): IntentFrame;
}

export class Seat {
  entityId: EntityId | null = null;
  championId = "";
  sessionId: string | null = null; // colyseus client session (humans)
  accountId = "";
  displayName = "";
  /**
   * 這個座位的**積分**（平台的 MMR），GH#492。
   *
   * owner 2026-08-21:「若有其他玩家一起進入房間遊戲，也請出現明顯提示**姓名與積分**、
   * 所選英雄」—— 名字這一格早就有了，積分沒有。
   *
   * ⚠️ 平台**一直都有送**（`gamelink.Seat.MMR`，`json:"mmr"`），只是 game-server
   * 從來沒有讀它 —— 失敗形態②（算出來了但從沒送到下游）的教科書形狀，只是這一次
   * 停在更上游。0 = 平台沒給（bot 座位、dev/LAN 直連），名冊上不畫數字。
   */
  rating = 0;
  /**
   * 這個位子**屬於一個人**嗎（GH#492）。
   *
   * ⛔ 不是 `driverKind !== "ai"` —— `onLeave` 斷線的瞬間就把 driver 換成 AI，
   * 於是一個斷線的真人在那之後和一個天生的 bot 長得一模一樣。owner 2026-08-21
   * 明說要能看出「有可能斷線離開或連線回來」，所以那個區別必須是一格自己的資料。
   *
   * ⚠️ **只會 false → true**：斷線不會讓一個位子不再屬於他。
   */
  humanSeat = false;
  ready = false;
  private driver: SeatDriver;
  /** driver swap requests applied at the next tick boundary */
  private pendingDriver: SeatDriver | null = null;

  constructor(
    public readonly seatId: SeatId,
    public readonly teamId: TeamId,
    initialDriver: SeatDriver,
  ) {
    this.driver = initialDriver;
    initialDriver.onAttach(this);
  }

  get driverKind(): "human" | "ai" {
    return this.driver.kind;
  }

  /** Request a driver swap; applied at the top of the next tick (never mid-tick). */
  setDriver(next: SeatDriver): void {
    this.pendingDriver = next;
  }

  /** Called by the runner at the tick boundary before intents are gathered. */
  applyPendingDriver(): boolean {
    if (!this.pendingDriver) return false;
    this.driver.onDetach();
    this.driver = this.pendingDriver;
    this.pendingDriver = null;
    this.driver.onAttach(this);
    return true;
  }

  produceIntent(world: SimWorld, tick: number): IntentFrame {
    return this.driver.produceIntent(this, world, tick);
  }
}
