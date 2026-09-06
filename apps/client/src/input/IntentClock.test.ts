/**
 * #282 —— intent 的送出率與畫面更新率脫鉤。
 *
 * ── 這一支測的是出貨的那條管線,不是零件 ────────────────────────────────────
 * 下面的 `Harness` 是 `GameApp` 的三個方法逐字複製過來的形狀:
 *
 *     pumpInput(now)      → sampleInput(); intentClock.tick(now)
 *     sampleInput()       → (搖桿位置) → sender.setOrder(...)
 *     transmitIntents(b)  → sender.update(b)
 *     frame()             → driveFrame(now, last, fpsCap, { pump, render })
 *
 * 而且 `sender` 是**真的 `IntentSender`**、`clock` 是**真的 `IntentClock`**、
 * gate 是**真的 `driveFrame`** —— 沒有一個是為了測試手寫的替身(失敗形態 ⑤)。
 * 「送出率」量的是 transmit callback 真的被呼叫幾次,不是「某個欄位被設成 30」
 * (失敗形態 ⑦)。`GameApp.frameWiring.test.ts` 負責釘住這三個方法真的還接在
 * 出貨的那個檔案上。
 *
 * ── 缺陷長什麼樣 ──────────────────────────────────────────────────────────
 * BASELINE 那一組是**修正前的實作**(pump 直接 `sender.update(now)`),數字是
 * 這一支自己跑出來的,不是抄來的。它證明修正前**沒有一個組態達得到 30/s**,
 * 包括桌機。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { TICK_HZ } from "@ggd/shared/constants";
import { driveFrame } from "../render/frameCap";
import { TABLET_FPS_CAP, DESKTOP_FPS_CAP } from "../render/frameCap";
import { IntentSender } from "../net/IntentSender";
import {
  IntentClock,
  INTENT_HZ_DEFAULT,
  INTENT_HZ_MAX,
  INTENT_HZ_MIN,
  clampIntentHz,
  intentPeriodMs,
  type IntentClockEnv,
} from "./IntentClock";
import type { InputMessage } from "@ggd/shared/protocol/messages";

// ---------------------------------------------------------------------------
// harness — GameApp 的 frame / pumpInput / sampleInput / transmitIntents
// ---------------------------------------------------------------------------

/**
 * 決定性的 rAF 抖動,±j ms。真機的 rAF 從來不是等距的,而**等距正是缺陷藏身的
 * 地方** —— 只要抖動就會撞到節流的邊界。不用 Math.random:同一份輸入要能重跑。
 */
function jitter(i: number, j: number): number {
  if (j === 0) return 0;
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 * j - j;
}

interface RunOpts {
  /** 畫面更新率(rAF 一秒到幾次)。#282 的情境是 30。 */
  displayHz: number;
  /** 玩家的 fps 上限(#274:手機預設 30)。 */
  capFps: number;
  /** 送出率設定值。 */
  intentHz?: number;
  seconds?: number;
  jitterMs?: number;
  /** "clock" = 出貨的實作;"raf" = 缺陷原狀(pump 直接呼叫 sender.update)。 */
  mode?: "clock" | "raf";
}

interface RunResult {
  sentPerSec: number;
  drawnPerSec: number;
  samplesPerSec: number;
  /** 送出的封包彼此間隔的最大值(ms) —— 「有沒有斷手」的量法。 */
  worstGapMs: number;
}

function run(opts: RunOpts): RunResult {
  const {
    displayHz,
    capFps,
    intentHz = INTENT_HZ_DEFAULT,
    seconds = 5,
    jitterMs = 3,
    mode = "clock",
  } = opts;

  const sent: { at: number }[] = [];
  const sender = new IntentSender((m: InputMessage) => sent.push({ at: sentAt }));
  let sentAt = 0;
  let samples = 0;
  let drawn = 0;
  let lastRenderMs = -Infinity;

  // GameApp.sampleInput —— 一根按住的搖桿:每次取樣都重新丟出一個 move order
  const sampleInput = (): void => {
    samples += 1;
    sender.setOrder({ kind: "move", point: { x: 1, z: 0 } });
  };
  // GameApp.transmitIntents —— 拿到的是**拍點時刻**,不是牆上時刻
  const transmitIntents = (beatMs: number): void => {
    sentAt = beatMs;
    sender.update(beatMs);
  };

  const clock = new IntentClock({ sample: sampleInput, beat: transmitIntents }, intentHz, stubEnv());

  // GameApp.pumpInput
  const pumpInput = (nowMs: number): void => {
    sampleInput();
    if (mode === "clock") clock.tick(nowMs);
    else {
      // 缺陷原狀:每一幀直接問一次 sender,用牆上時刻。
      sentAt = nowMs;
      sender.update(nowMs);
    }
  };
  const render = (): void => {
    drawn += 1;
  };

  const frameMs = 1000 / displayHz;
  const frames = Math.round(displayHz * seconds);
  for (let i = 0; i < frames; i++) {
    const nowMs = i * frameMs + jitter(i, jitterMs);
    lastRenderMs = driveFrame(nowMs, lastRenderMs, capFps, { pump: pumpInput, render });
  }

  let worstGapMs = 0;
  for (let i = 1; i < sent.length; i++) {
    worstGapMs = Math.max(worstGapMs, sent[i]!.at - sent[i - 1]!.at);
  }
  return {
    sentPerSec: sent.length / seconds,
    drawnPerSec: drawn / seconds,
    samplesPerSec: samples / seconds,
    worstGapMs,
  };
}

/** 不會自己跑的計時器環境 —— watchdog 由測試手動敲。 */
function stubEnv(over: Partial<IntentClockEnv> = {}): IntentClockEnv {
  return {
    now: () => 0,
    setInterval: () => 1,
    clearInterval: () => undefined,
    hidden: () => false,
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe("#282 送出率不受畫面更新率影響 (intent-clock-rate)", () => {
  /**
   * ⭐ 主守衛。任務說的正是這一句:「模擬 30fps 的畫面更新 → intent 送出率仍
   * ≥30/s」。`mode: "raf"` 是同一條管線的缺陷原狀,量到 19.6 —— 所以這一條
   * **分得出兩種實作**,不是對兩邊都會過。
   */
  it("30fps 畫面 + 30fps 上限:送出率 ≥ 30/s(缺陷原狀只有 ~20/s)", () => {
    cover("intent-clock-rate");
    const fixed = run({ displayHz: 30, capFps: TABLET_FPS_CAP });
    const buggy = run({ displayHz: 30, capFps: TABLET_FPS_CAP, mode: "raf" });

    expect(fixed.sentPerSec, `30fps 手機只送了 ${fixed.sentPerSec}/s`).toBeGreaterThanOrEqual(
      TICK_HZ,
    );
    expect(buggy.sentPerSec, "缺陷原狀竟然也達標 —— 這條測試分不出兩種實作").toBeLessThan(
      TICK_HZ - 5,
    );
    // 畫面完全沒有被動到:兩種實作畫一樣多張(斷言方向對著缺陷,不是對著畫質)
    expect(fixed.drawnPerSec).toBe(buggy.drawnPerSec);
  });

  /**
   * BASELINE(第三守則:數字自己量,不要抄註解)。
   *
   * ⚠️ 這一條量的是「**只**修好 `IntentSender` 的 slack、送出仍綁在 rAF 上」的
   * 中間狀態 —— 因為 slack 在出貨的 `IntentSender` 裡,harness 不會為了製造
   * 舊數字去複製一份假的 sender(那就是失敗形態 ⑤)。所以這裡的數字比檔頭
   * 記錄的「兩個缺陷都在」時**好一些**,而結論不變:
   *
   *   綁 rAF 的話,**沒有一種面板**達得到 sim 的 tick 率,桌機也一樣。
   */
  it("BASELINE:只要送出還綁在 rAF 上,30/60/120Hz 面板都達不到 30/s(桌機也一樣)", () => {
    cover("intent-clock-rate");
    for (const displayHz of [30, 60, 120]) {
      const buggy = run({ displayHz, capFps: TABLET_FPS_CAP, mode: "raf" });
      expect(
        buggy.sentPerSec,
        `${displayHz}Hz 面板綁 rAF 竟然送到 ${buggy.sentPerSec}/s —— 基準要重新量`,
      ).toBeLessThan(TICK_HZ);
      expect(buggy.sentPerSec).toBeGreaterThan(10);
    }
    // 而且**桌機也中招** —— 這不是手機獨有的問題,只是手機最嚴重
    const desktopBug = run({ displayHz: 60, capFps: DESKTOP_FPS_CAP, mode: "raf" });
    expect(desktopBug.sentPerSec).toBeLessThan(TICK_HZ);
  });

  it("修好之後:30 / 60 / 120Hz 面板送出率都貼著 30/s,而畫面上限照樣生效", () => {
    cover("intent-clock-rate");
    for (const displayHz of [30, 60, 120]) {
      const r = run({ displayHz, capFps: TABLET_FPS_CAP });
      expect(r.sentPerSec, `${displayHz}Hz 面板只送 ${r.sentPerSec}/s`).toBeGreaterThanOrEqual(
        TICK_HZ,
      );
      // 省電的那一半沒有被拆掉(#266 / #274)
      expect(r.drawnPerSec, `${displayHz}Hz 面板畫了 ${r.drawnPerSec}/s`).toBeLessThanOrEqual(
        TABLET_FPS_CAP + 1,
      );
    }
  });

  /**
   * 「每兩個 tick 才有一次輸入」是缺陷的**體感**。平均值達標但節奏是
   * 「連兩發、停 66ms」的話,伺服器的信箱一個 tick 只吃一筆,多的那一筆照樣
   * 是丟掉的 —— 所以要量最壞間隔,不是只量平均。
   */
  it("節奏也要對:兩筆之間最壞不超過一個 sim tick 的兩倍", () => {
    cover("intent-clock-rate");
    const fixed = run({ displayHz: 30, capFps: TABLET_FPS_CAP });
    const buggy = run({ displayHz: 30, capFps: TABLET_FPS_CAP, mode: "raf" });
    expect(fixed.worstGapMs).toBeLessThanOrEqual((2 * 1000) / TICK_HZ);
    expect(buggy.worstGapMs, "缺陷原狀的最壞間隔竟然不比修正差").toBeGreaterThan(
      fixed.worstGapMs,
    );
  });

  /**
   * 發熱降頻的手機 rAF 掉到 15 fps —— **比送出率還低**。這是「補拍」
   * (`while (this.firedBeats < dueBeats)`)唯一能被看見的地方:一次 tick 只發
   * 一拍的話,送出率就等於 rAF 的 15/s;補拍才能把積欠的那一拍補回來。
   *
   * ⚠️ 這裡刻意**不**斷言節奏 —— 15 次取樣要生 30 筆,必然是「兩發一停」。
   * 節奏要靠 watchdog(第二個時鐘)才救得回來,而 watchdog 有自己的測試。
   * 把兩件事寫成同一條斷言就會變成一條對誰都不準的測試。
   */
  it("rAF 掉到 15fps(發熱降頻)時,補拍仍然把送出率撐在 30/s", () => {
    cover("intent-clock-rate");
    const r = run({ displayHz: 15, capFps: TABLET_FPS_CAP });
    // > 29:量到 29.8(5 秒 149 筆 —— 第一拍是對拍那一拍)。缺陷是 15.0,
    // 兩者差一倍,所以這條門檻分得出來,不是「調到剛好會過」。
    expect(r.sentPerSec, `15fps 下只送了 ${r.sentPerSec}/s —— 補拍沒有作用`).toBeGreaterThan(
      TICK_HZ - 1,
    );
    // 而且**每一拍都有自己的取樣** —— 補出來的那一拍不是上一拍的舊方向
    expect(r.samplesPerSec).toBeGreaterThan(TICK_HZ - 1);
  });

  /**
   * #266 的顧慮:修正不可以拿發燙換送出率。量的是每秒真的做了幾次工作。
   */
  it("120Hz 手機的送出次數變成**設定值**,而不是面板刷新率 —— 不會更燙", () => {
    cover("intent-clock-rate");
    const fixed = run({ displayHz: 120, capFps: TABLET_FPS_CAP });
    // 送出次數貼著 30,不是貼著 120 —— 面板越高刷,省下來的封包越多
    expect(fixed.sentPerSec).toBeLessThanOrEqual(INTENT_HZ_MAX + 2);
    // 調低設定值 = 真的少送(而不是像缺陷那樣「多跑很多次、剛好少送很多筆」)
    const thrifty = run({ displayHz: 120, capFps: TABLET_FPS_CAP, intentHz: 15 });
    expect(thrifty.sentPerSec).toBeLessThanOrEqual(16);
    expect(thrifty.sentPerSec).toBeGreaterThanOrEqual(14);
  });
});

describe("#282 送出率是設定值,不是寫死的 (intent-clock-tunable)", () => {
  it("每一個合法設定值都真的落在送出率上 —— 不是只有預設值有效", () => {
    cover("intent-clock-rate");
    for (const hz of [10, 15, 20, 24, 30]) {
      const r = run({ displayHz: 30, capFps: TABLET_FPS_CAP, intentHz: hz });
      expect(Math.abs(r.sentPerSec - hz), `intentHz=${hz} 量到 ${r.sentPerSec}/s`).toBeLessThan(
        1.5,
      );
    }
  });

  it("上下界都夾(不是只有下界)—— 50 打成 500 不會讓手機每秒噴 500 個封包", () => {
    cover("intent-clock-rate");
    expect(clampIntentHz(500)).toBe(INTENT_HZ_MAX);
    expect(clampIntentHz(0)).toBe(INTENT_HZ_MIN);
    expect(clampIntentHz(-5)).toBe(INTENT_HZ_MIN);
    // 壞值回**預設**,不是 0:靜默關掉輸入會被讀成 bug,不會被讀成設定
    expect(clampIntentHz(Number.NaN)).toBe(INTENT_HZ_DEFAULT);
    expect(clampIntentHz(Number.POSITIVE_INFINITY)).toBe(INTENT_HZ_DEFAULT);
    // 上界有理由:超過 sim 的 tick 率就是保證被伺服器丟掉的封包
    expect(INTENT_HZ_MAX).toBe(TICK_HZ);
    expect(INTENT_HZ_DEFAULT).toBe(TICK_HZ);
    expect(intentPeriodMs(30)).toBeCloseTo(1000 / 30, 9);
  });

  it("setHz 當場生效 —— 不用重開一場", () => {
    cover("intent-clock-rate");
    const beats: number[] = [];
    const clock = new IntentClock(
      { sample: () => {}, beat: (b) => beats.push(b) },
      30,
      stubEnv(),
    );
    for (let t = 0; t <= 1000; t += 1000 / 120) clock.tick(t);
    const at30 = beats.length;
    beats.length = 0;
    clock.setHz(10);
    for (let t = 2000; t <= 3000; t += 1000 / 120) clock.tick(t);
    expect(at30).toBeGreaterThanOrEqual(30);
    expect(beats.length).toBeLessThanOrEqual(12);
    expect(clock.rateHz).toBe(10);
  });
});

describe("#282 時鐘本身的性質 (intent-clock-core)", () => {
  it("拍點時刻永遠 ≤ 牆上時刻 —— 時鐘不可能讓送出率超過設定值", () => {
    cover("intent-clock-rate");
    let worstAhead = -Infinity;
    let now = 0;
    const clock = new IntentClock(
      { sample: () => {}, beat: (b) => (worstAhead = Math.max(worstAhead, b - now)) },
      30,
      stubEnv(),
    );
    for (let i = 0; i < 600; i++) {
      now = i * (1000 / 17) + jitter(i, 7); // 一個很不規則的來源
      clock.tick(now);
    }
    expect(worstAhead).toBeLessThanOrEqual(0);
  });

  it("長時間停擺回來不會一次噴幾百拍(切到別的 app)", () => {
    cover("intent-clock-rate");
    let beats = 0;
    const clock = new IntentClock({ sample: () => {}, beat: () => (beats += 1) }, 30, stubEnv());
    clock.tick(0);
    beats = 0;
    clock.tick(30_000); // 30 秒之後回來 = 積欠 900 拍
    expect(beats).toBe(1);
  });

  it("同一個時刻餵兩次不會發兩拍 —— rAF 與 watchdog 可以同時存在", () => {
    cover("intent-clock-rate");
    let beats = 0;
    const clock = new IntentClock({ sample: () => {}, beat: () => (beats += 1) }, 30, stubEnv());
    clock.tick(0);
    const after = beats;
    clock.tick(0);
    clock.tick(0);
    expect(beats).toBe(after);
  });

  it("watchdog:rAF 健康時是 no-op,rAF 停擺時接手(而且自己補一次取樣)", () => {
    cover("intent-clock-rate");
    let samples = 0;
    let beats = 0;
    const clock = new IntentClock(
      { sample: () => (samples += 1), beat: () => (beats += 1) },
      30,
      stubEnv(),
    );
    const period = intentPeriodMs(30);

    clock.tick(0);
    // rAF 剛餵過 → watchdog 什麼都不做,連取樣都不做
    expect(clock.wake(period / 2)).toBe(0);
    expect(samples).toBe(0);

    // rAF 停了一整個拍期 → watchdog 接手,而且**每一拍都先取樣再發拍**
    // (否則送出去的是上一拍的舊搖桿方向,或者根本送不出去 —— 見 fire())
    const before = beats;
    const fired = clock.wake(period * 2);
    expect(fired).toBeGreaterThan(0);
    expect(beats - before).toBe(fired);
    expect(samples, "watchdog 補的拍沒有各自取樣").toBe(fired);
  });

  /**
   * rAF **死在兩拍之間**:它取樣過了(所以旗標是 true),但那一刻沒有拍到期。
   * 接手的 watchdog 如果沿用那個旗標,送出去的就是 rAF 斷氣前的舊讀數 ——
   * 至少一個拍期以前的搖桿方向。`wake` 裡那一行 `sampledSinceBeat = false`
   * 就是為了這一格。
   */
  it("rAF 死在兩拍之間時,watchdog 那一拍重新取樣(不沿用斷氣前的舊讀數)", () => {
    cover("intent-clock-rate");
    let samples = 0;
    let beats = 0;
    const clock = new IntentClock(
      { sample: () => (samples += 1), beat: () => (beats += 1) },
      30,
      stubEnv(),
    );
    const period = intentPeriodMs(30);
    clock.tick(0); // 對拍 + 拍 0
    // rAF 又來了一幀,取樣過,但這一刻還沒有下一拍到期
    expect(clock.tick(period * 0.3)).toBe(0);
    samples = 0;
    beats = 0;
    // rAF 就死在這裡。watchdog 在下一拍接手:
    expect(clock.wake(period * 1.5)).toBe(1);
    expect(beats).toBe(1);
    expect(samples, "watchdog 沿用了 rAF 斷氣前的舊取樣").toBe(1);
  });

  it("分頁隱藏時 watchdog 完全不跑 —— 背景分頁不該還在送操作", () => {
    cover("intent-clock-rate");
    let beats = 0;
    let hidden = false;
    const clock = new IntentClock(
      { sample: () => {}, beat: () => (beats += 1) },
      30,
      stubEnv({ hidden: () => hidden }),
    );
    clock.tick(0);
    beats = 0;
    hidden = true;
    expect(clock.wake(1000)).toBe(0);
    expect(beats).toBe(0);
  });

  it("start/stop 真的裝上/拆掉那個與 rAF 無關的計時器", () => {
    cover("intent-clock-rate");
    const installed: number[] = [];
    let cleared = 0;
    const clock = new IntentClock({ sample: () => {}, beat: () => {} }, 30, {
      now: () => 0,
      setInterval: (_fn, ms) => {
        installed.push(ms);
        return installed.length;
      },
      clearInterval: () => (cleared += 1),
      hidden: () => false,
    });
    clock.start();
    clock.start(); // idempotent
    expect(installed).toEqual([intentPeriodMs(30)]);
    clock.stop();
    expect(cleared).toBe(1);
  });
});
