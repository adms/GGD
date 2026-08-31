/**
 * game/commsWheel —— 通訊／表情輪盤的**決策層**（GH#731）。
 *
 * ⭐ **為什麼是一個機制而不是五條線**：`spatialPolicy` 裡 `retreat` / `watch` /
 * `love` / `puzzled` 四格都標著 `dormant: { cause: "no-signal" }`，⭐ 而它們的
 * 理由**是同一句** ——「沒有隊友指令／表情輪」。
 * ⇒ 逐格接線是 5 次改動，做一個輪盤是 1 次（第〇·五守則）。
 *
 * ⭐ **每一格是資料**（`config.ui-cues@1` 的 `commsWheel.entries`）——
 * ⛔ 這個檔裡沒有任何一句寫著「retreat 要播哪一句」。
 *
 * ⚠️ ⭐ 這裡**不播**，只回答「指到第幾格」。播的那一行屬於持有音訊層的呼叫端 ——
 * 與 `statusVoiceEdges` 同一條規矩（那個檔的檔頭記著為什麼）。
 */

/** 一格。⭐ 全部從 config 來。 */
export interface CommsWheelEntry {
  readonly id: string;
  readonly zh: string;
  readonly voiceCategory: string;
}

export interface CommsWheelConfig {
  readonly enabled: boolean;
  readonly holdKey: string;
  readonly entries: readonly CommsWheelEntry[];
}

/**
 * 指標落在哪一格。
 *
 * ⭐ 幾何：12 點鐘方向是第 0 格，順時針。回 `null` 代表**在死區裡**
 * （放開＝取消）—— ⚠️ 那一格是必要的：⛔ 沒有死區的話，玩家一按 V 就立刻
 * 「指著」第 0 格，於是**每一次打開輪盤都會喊撤退**。
 *
 * @param dx 指標相對圓心的位移（螢幕座標，y 向下）
 * @param deadZonePx 死區半徑
 */
export function wheelIndexAt(
  dx: number,
  dy: number,
  count: number,
  deadZonePx = 28,
): number | null {
  if (count <= 0) return null;
  if (Math.hypot(dx, dy) < deadZonePx) return null;
  // atan2(dx, -dy)：把「上」變成 0、順時針為正。
  let a = Math.atan2(dx, -dy);
  if (a < 0) a += Math.PI * 2;
  const slice = (Math.PI * 2) / count;
  // ⭐ 半格偏移：讓第 0 格**跨過**正上方，⛔ 不是從正上方開始往右
  // （否則正上方是兩格的邊界，最直覺的方向反而最難選）。
  const idx = Math.floor((a + slice / 2) / slice) % count;
  return idx;
}

/**
 * 輪盤的狀態機。⭐ 按住開、放開送出、Esc 取消。
 *
 * ⚠️ ⭐ `holdKey` 比對 `KeyboardEvent.code`，⛔ 不是 `key`：
 * `key` 會被輸入法與鍵盤配置改寫（注音下按 V 得到的 `key` 不是 "v"）。
 */
export class CommsWheelState {
  private openAt: { x: number; y: number } | null = null;
  private hovered: number | null = null;

  constructor(private cfg: CommsWheelConfig) {}

  setConfig(cfg: CommsWheelConfig): void {
    this.cfg = cfg;
    if (!cfg.enabled) this.cancel();
  }

  get isOpen(): boolean {
    return this.openAt !== null;
  }
  get centre(): { x: number; y: number } | null {
    return this.openAt;
  }
  get hoveredIndex(): number | null {
    return this.hovered;
  }
  get entries(): readonly CommsWheelEntry[] {
    return this.cfg.entries;
  }

  /** 按鍵按下。回 true = 這一下被輪盤吃掉了（⇒ 呼叫端別再拿去做別的）。 */
  keyDown(code: string, at: { x: number; y: number }): boolean {
    if (!this.cfg.enabled || code !== this.cfg.holdKey) return false;
    if (this.openAt === null) {
      this.openAt = at;
      this.hovered = null;
    }
    return true;
  }

  /** 指標移動。 */
  pointerMove(x: number, y: number): void {
    if (this.openAt === null) return;
    this.hovered = wheelIndexAt(x - this.openAt.x, y - this.openAt.y, this.cfg.entries.length);
  }

  /**
   * 放開按鍵。回**要播的那一格**（⛔ 死區＝null＝取消）。
   * ⭐ 回傳之後輪盤自動關上。
   */
  keyUp(code: string): CommsWheelEntry | null {
    if (code !== this.cfg.holdKey || this.openAt === null) return null;
    const idx = this.hovered;
    this.cancel();
    return idx === null ? null : (this.cfg.entries[idx] ?? null);
  }

  /** Esc／失焦／換場：關掉且**不送出**。 */
  cancel(): void {
    this.openAt = null;
    this.hovered = null;
  }
}
