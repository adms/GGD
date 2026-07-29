/**
 * 一幀要做哪些事 —— intent 送出率不可以被 fps 上限綁住 (task #282).
 *
 * ── 缺陷的形狀 ───────────────────────────────────────────────────────────────
 * `GameApp.frame` 的第一行是 `if (!shouldRenderFrame(...)) return;`,而搖桿/
 * 虛擬搖桿的取樣與 `IntentSender` 的 flush 都在那一行**之後**。`IntentSender`
 * 自己是 30Hz 節流的,但它只有被呼叫才可能送 —— 於是 #274 的省電上限
 * (手機預設 30fps)順手把操作解析度砍了一半:量到的送出率從桌機 60fps 的
 * ~25/s 掉到 30fps 的 15.6–21.8/s。兩件事在同一個 `if` 的同一側,所以沒有
 * 任何測試看得見。
 *
 * ── 這一支測的是出貨的東西 ────────────────────────────────────────────────
 * 「一幀做哪些事」現在是 `driveFrame`(render/frameCap.ts)這個有名字的決定,
 * 而 `GameApp.frame` 的全部內容就是呼叫它。下面用**真的 `IntentSender`**
 * 當 pump,以真實的 rAF 節奏跑一整秒,量真正送出去的封包數。把 pump 移到
 * gate 之後(缺陷的實作),送出率立刻掉一半 —— 這條測試分得出兩種實作。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { driveFrame, MOBILE_FPS_CAP, DESKTOP_FPS_CAP, shouldRenderFrame } from "./frameCap";
import { IntentSender } from "../net/IntentSender";
import type { InputMessage } from "@ggd/shared/protocol/messages";

/**
 * Run one second of animation frames at `displayHz`, capping the DRAW at
 * `capFps`, with an analog stick held down the whole time.
 *
 * `pumpOrder` picks which of the two shapes runs:
 *   "before" — the fix: sample + transmit on every frame (driveFrame);
 *   "after"  — the bug: the whole body, transmit included, sits behind the cap.
 */
function runSecond(
  displayHz: number,
  capFps: number,
  pumpOrder: "before" | "after",
): { sent: number; drawn: number; sampled: number } {
  const sent: InputMessage[] = [];
  const sender = new IntentSender((m) => sent.push(m));
  let drawn = 0;
  let sampled = 0;
  let lastRenderMs = -Infinity;

  const pump = (nowMs: number): void => {
    // an analog stick held down: the input layer re-issues an order every frame
    sampled += 1;
    sender.setOrder({ kind: "move", point: { x: 1, z: 0 } });
    sender.update(nowMs);
  };
  const render = (): void => {
    drawn += 1;
  };

  const frameMs = 1000 / displayHz;
  for (let i = 0; i < displayHz; i++) {
    const nowMs = i * frameMs;
    if (pumpOrder === "before") {
      lastRenderMs = driveFrame(nowMs, lastRenderMs, capFps, { pump, render });
    } else {
      // THE BUG, reproduced exactly: the gate comes first and eats everything.
      if (!shouldRenderFrame(nowMs, lastRenderMs, capFps)) continue;
      lastRenderMs = nowMs;
      pump(nowMs);
      render();
    }
  }
  return { sent: sent.length, drawn, sampled };
}

/**
 * 面板取 120Hz —— 這正是 frameCap 自己的檔頭寫的情境(「手機的 ProMotion /
 * 高刷面板是 120 Hz」),也是 #274 那個上限真正在省電的機器。rAF 的節奏就是
 * 取樣的上限,所以差距在高刷面板上最清楚。
 */
const PHONE_HZ = 120;

describe("intent 送出率與 fps 上限無關 (frame-drive-intent)", () => {
  it("手機 120Hz 面板 + 30fps 上限:送出率貼著 IntentSender 自己的 30Hz", () => {
    cover("frame-drive-intent");
    const fixed = runSecond(PHONE_HZ, MOBILE_FPS_CAP, "before");
    expect(fixed.sent, `30fps 上限下只送了 ${fixed.sent} 筆/秒`).toBeGreaterThanOrEqual(26);
    // 而且畫面真的有被節流(省電改動沒有被這次修正拆掉)
    expect(fixed.drawn).toBeLessThanOrEqual(MOBILE_FPS_CAP + 1);
  });

  /**
   * ⚠️ 這一條在 2026-07-30 換了斷言的**對象**,理由要寫清楚(#282 第二段)。
   *
   * 原本它斷言「舊順序少送三成」。那在當時是真的,但那個差距有一半來自
   * `IntentSender` 節流沒有 slack —— 呼叫早 0.03 ms 到就整拍被丟掉。slack 補上
   * 之後(`net/IntentSender.SEND_SLACK_MS`),**送出率**在這個組態下兩種順序都
   * 到得了 30,所以舊斷言變成「對兩種實作都不成立」的那一種,不是「對兩種實作
   * 都成立」—— 它會紅,而且紅得沒有意義。
   *
   * 送出率的守衛已經搬到 `input/IntentClock.test.ts`(那裡用絕對拍點,是真正
   * 讓 30 fps 手機拿到 30/s 的東西)。`driveFrame` 的順序**仍然**控制一件別人
   * 控制不了的事:**取樣的新鮮度**。gate 在前的話,一拍送出去的搖桿方向是
   * 「上一次准許繪製時」讀到的,在 120Hz 面板 + 30fps 上限下等於舊四倍。
   */
  it("gate 在前會把**取樣**砍成四分之一 —— 送出去的是過期的搖桿方向", () => {
    cover("frame-drive-intent");
    const buggy = runSecond(PHONE_HZ, MOBILE_FPS_CAP, "after");
    const fixed = runSecond(PHONE_HZ, MOBILE_FPS_CAP, "before");
    expect(fixed.sampled, "pump 沒有每一幀都取樣").toBe(PHONE_HZ);
    expect(buggy.sampled, `舊順序竟然也取樣了 ${buggy.sampled} 次`).toBeLessThanOrEqual(
      MOBILE_FPS_CAP + 1,
    );
    expect(fixed.sampled).toBeGreaterThan(buggy.sampled * 3);
    // 兩種實作畫的張數一模一樣 —— 差別**只**在輸入這一半(斷言方向對著缺陷)
    expect(fixed.drawn).toBe(buggy.drawn);
  });

  it("120Hz 面板 + 桌機 60fps 上限:畫面砍半,取樣與送出都不受影響", () => {
    cover("frame-drive-intent");
    const fixed = runSecond(PHONE_HZ, DESKTOP_FPS_CAP, "before");
    const buggy = runSecond(PHONE_HZ, DESKTOP_FPS_CAP, "after");
    expect(fixed.sent).toBeGreaterThanOrEqual(26);
    expect(fixed.sampled).toBe(PHONE_HZ);
    expect(fixed.sampled).toBeGreaterThan(buggy.sampled);
    expect(fixed.drawn).toBeLessThanOrEqual(DESKTOP_FPS_CAP + 2);
  });

  it("沒有輸入時不會憑空送封包(pump 每幀跑,但 sender 自己會閉嘴)", () => {
    cover("frame-drive-intent");
    const sent: InputMessage[] = [];
    const sender = new IntentSender((m) => sent.push(m));
    let last = -Infinity;
    for (let i = 0; i < PHONE_HZ; i++) {
      last = driveFrame(i * (1000 / PHONE_HZ), last, MOBILE_FPS_CAP, {
        pump: (t) => sender.update(t),
        render: () => {},
      });
    }
    expect(sent).toHaveLength(0);
  });

  it("被跳過的幀不會推進 lastRenderMs —— 上限本身沒有被 driveFrame 破壞", () => {
    cover("frame-drive-intent");
    let pumps = 0;
    let draws = 0;
    let last = -Infinity;
    for (let i = 0; i < PHONE_HZ; i++) {
      last = driveFrame(i * (1000 / PHONE_HZ), last, MOBILE_FPS_CAP, {
        pump: () => {
          pumps += 1;
        },
        render: () => {
          draws += 1;
        },
      });
    }
    expect(pumps, "pump 沒有每一幀都跑").toBe(PHONE_HZ);
    expect(draws).toBeLessThanOrEqual(MOBILE_FPS_CAP + 1);
    expect(draws).toBeGreaterThan(20);
  });
});
