/**
 * GH#271 —— 「螢幕上那個 fps 數字」與「一秒真的畫了幾張」必須是同一件事。
 *
 * ── 缺陷的形狀（實測,不是推論）─────────────────────────────────────────────
 * owner 兩張截圖：pill 寫 **228 fps** / **197 fps**,而 #266/#274 說桌機鎖 60。
 * 探針量到的是：
 *   · `renderParams.fpsCap` 走出貨路徑解析出來執行期就是 **60**；
 *   · `driveFrame(cap=60)` 在 240 Hz 假時鐘上跑一秒,`render` 正好 **60** 次。
 * 上限一直是好的。假的是儀表 —— pill 讀 `perfBus.avgFps`,而它以前寫的是
 * `AdaptiveManager.stats().avgFps`,那個視窗裝的是 **`workMs`（一幀的工作成本）**,
 * 所以它其實是 `1000 / 成本` = **能力值**。4.40 ms → 227.3；5.08 ms → 196.9,
 * 正是 228 與 197。
 *
 * ── 這支測試打哪一層 ─────────────────────────────────────────────────────
 * ⚠️ **不**斷言 `shouldRenderFrame` 這個純函式回傳對不對 —— 那一層本來就是對的,
 * 對它斷言只會得到一條永遠綠的測試（失敗形態 ④）。這裡打的是兩個**餵值端**：
 *
 *   1. 上限：`capFps` 從**出貨的設定解析路徑**拿（SettingsStore → QualityController
 *      → renderParams.fpsCap），不是測試自己傳一個 60 進去（失敗形態 ⑤）。
 *      期望值也從那個 cap 推導,不寫死 60 —— owner 改預設值時這支不該紅。
 *   2. 數字：斷言的是 **`FrameRateMeter.publish` 真的寫進 perfBus 的那一格**,
 *      也就是 pill 讀的那一格,不是測試自己重算一遍。
 *
 * 兩條都用同一個假時鐘迴圈驅動,所以「上限生效」與「儀表誠實」是被**一起**
 * 量出來的：把 publish 改回讀能力值 → 第 2 條紅；把上限拆掉 → 兩條都紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stripComments } from "@ggd/shared/testkit/stripComments";
import { driveFrame } from "./frameCap";
import { AdaptiveManager } from "./AdaptiveQuality";
import { FrameRateMeter } from "./fpsMeter";
import { QualityController } from "./QualityController";
import { SettingsStore } from "../settings/SettingsStore";
import { perfBus, type PerfBus } from "../perfBus";

/** 出貨的設定解析路徑：localStorage 空的（全新安裝）→ 平台預設。 */
function shippedCap(touch: boolean): number {
  const controller = new QualityController(new SettingsStore(null, touch));
  return controller.getParams().fpsCap;
}

interface Run {
  drawn: number;
  bus: PerfBus;
}

/**
 * 跑 `seconds` 秒的 rAF,面板 `displayHz`,上限 `capFps`,每一張真的畫出去的幀
 * 花掉 `workMs` 的工作時間。回傳真的畫了幾張,以及 HUD 會讀到的 perfBus 快照。
 *
 * 迴圈的形狀刻意複製 `GameApp.frame` / `GameApp.renderFrame`：
 *   · `driveFrame(now, lastFrameMs, cap, work)`,回傳值指回 `lastFrameMs`；
 *   · `dtMs` 在 render 裡用**呼叫當下**的 `lastFrameMs` 算（GameApp 就是這樣,
 *     因為指派發生在 driveFrame 回來之後),並且照樣夾在 [1,100]。
 */
function runFrames(displayHz: number, capFps: number, seconds: number, workMs: number): Run {
  const meter = new FrameRateMeter();
  const adaptive = new AdaptiveManager(capFps > 0 ? capFps : 60);
  let lastFrameMs = 0;
  let drawn = 0;
  const frameMs = 1000 / displayHz;

  for (let i = 0; i < Math.round(displayHz * seconds); i++) {
    const nowMs = i * frameMs;
    const lastAtCall = lastFrameMs;
    lastFrameMs = driveFrame(nowMs, lastFrameMs, capFps, {
      pump: () => {},
      render: (t: number) => {
        drawn += 1;
        const dtMs = Math.min(Math.max(t - lastAtCall, 1), 100);
        meter.sample(dtMs);
        adaptive.sample(workMs, t);
      },
    });
  }

  const bus: PerfBus = { ...perfBus };
  meter.publish(bus, adaptive.stats(), capFps);
  return { drawn, bus };
}

describe("GH#271 fps 上限真的擋住繪製（餵值端,不是純函式）", () => {
  for (const touch of [false, true]) {
    const label = touch ? "手機" : "桌機";
    it(`${label}：出貨設定解析出的上限,在 240 Hz 面板上真的把 render 壓到 cap×秒`, () => {
      const cap = shippedCap(touch);
      // 期望值從設定推導 —— owner 改預設 fps 時這一行自己跟著走。
      expect(cap, "出貨預設不該是「無上限」").toBeGreaterThan(0);

      const seconds = 2;
      const { drawn } = runFrames(240, cap, seconds, 4.4);
      expect(drawn, `${label} 畫了 ${drawn} 張,上限 ${cap}/秒`).toBeLessThanOrEqual(
        cap * seconds + 1,
      );
      // 而且不可以「順便把幀砍掉太多」—— 上限要壓到接近 cap,不是遠低於。
      expect(drawn).toBeGreaterThanOrEqual(Math.floor(cap * seconds * 0.95));
    });
  }

  it("對照組：同一個迴圈在無上限（0）時真的跑滿面板 —— 這支測試分得出兩種實作", () => {
    const { drawn } = runFrames(240, 0, 2, 4.4);
    expect(drawn).toBe(480);
  });
});

describe("GH#271 pill 印的是送出去的幀率,不是「畫得動幾張」", () => {
  it("60 上限 + 4.4 ms 的幀：avgFps ≈ 60,而 228 只出現在 capabilityFps", () => {
    const cap = shippedCap(false);
    const workMs = 4.4; // owner 那張 228 fps 截圖對應的工作成本
    const { bus, drawn } = runFrames(240, cap, 2, workMs);

    // 送出去的幀率（pill 讀的那一格）
    expect(bus.avgFps).toBeGreaterThan(cap * 0.95);
    expect(bus.avgFps).toBeLessThan(cap * 1.05);
    expect(bus.minFps).toBeGreaterThan(cap * 0.9);
    // 它必須和真的畫出去的張數對得上（不然就是另一種說謊）
    expect(Math.abs(bus.avgFps - drawn / 2)).toBeLessThan(2);

    // 能力值沒有被丟掉,只是不准再叫 fps —— 這就是 owner 螢幕上那個 228
    expect(Math.round(bus.capabilityFps)).toBe(Math.round(1000 / workMs));
    expect(bus.capabilityFps).toBeGreaterThan(bus.avgFps * 3);
    // 上限本身也上得了畫面,pill 的數字才有辦法被當場否證
    expect(bus.fpsCap).toBe(cap);
  });

  it("真的掉幀時 avgFps 跟著掉（不是被能力值撐住）", () => {
    const cap = shippedCap(false);
    // 一幀要 33 ms 才做得完 → 60 上限也只可能畫到 ~30
    const { bus } = runFrames(240, cap, 2, 33);
    const meter = new FrameRateMeter();
    // 每一張都晚到 33 ms
    for (let i = 0; i < 90; i++) meter.sample(33);
    const bus2: PerfBus = { ...perfBus };
    meter.publish(bus2, new AdaptiveManager(cap).stats(), cap);
    expect(bus2.avgFps).toBeLessThan(cap * 0.6);
    expect(bus2.avgFps).toBeGreaterThan(25);
    // 上一個 run 的能力值是 1000/33 ≈ 30 —— 兩個數字這時才該接近
    expect(bus.capabilityFps).toBeLessThan(cap * 0.6);
  });
});

describe("GH#271 接線：GameApp 真的把間隔餵給幀率計,而不是把能力值寫進 fps 欄位", () => {
  const SRC = stripComments(
    readFileSync(fileURLToPath(new URL("../GameApp.ts", import.meta.url)), "utf8"),
  );

  /** 切出 `header` 後面那個大括號區塊（沿用 GameApp.frameWiring.test.ts 的做法）。 */
  function bodyAfter(header: string): string {
    const at = SRC.indexOf(header);
    if (at < 0) throw new Error(`GameApp.ts no longer contains \`${header}\``);
    const open = SRC.indexOf("{", at + header.length - 1);
    let depth = 0;
    for (let i = open; i < SRC.length; i++) {
      if (SRC[i] === "{") depth++;
      else if (SRC[i] === "}" && --depth === 0) return SRC.slice(open + 1, i);
    }
    throw new Error(`unbalanced braces after \`${header}\``);
  }

  /**
   * ⚠️ 這一條是源碼掃描（失敗形態 ⑥）,明說。`GameApp` 抓 Babylon engine /
   * canvas / socket,headless 建構不出來,repo 對這個檔案的既有做法就是掃描
   * （見 `GameApp.frameWiring.test.ts` 的檔頭）。上面兩個 describe 才是行為守衛;
   * 這一條只補「行為守衛打得到的那個物件,出貨的迴圈真的有在用」這一段。
   */
  it("samplePerf 用 dtMs 餵 frameRate,並且由 frameRate.publish 寫 fps 欄位", () => {
    const body = bodyAfter("private samplePerf(nowMs: number, dtMs: number, workMs: number): void");
    // 餵的是「間隔」,不是「成本」—— 這一行就是修正本身
    expect(body).toMatch(/this\.frameRate\.sample\(\s*dtMs\s*\)/);
    expect(body, "workMs 是成本,餵進幀率計就會再變成 228").not.toMatch(
      /this\.frameRate\.sample\(\s*workMs\s*\)/,
    );
    expect(body).toMatch(/this\.frameRate\.publish\(\s*perfBus\s*,\s*stats\s*,\s*p\.fpsCap\s*\)/);

    // ⛔ 缺陷的原狀:直接把 adaptive 的能力值指進 fps 欄位
    for (const field of ["fps", "avgFps", "minFps"]) {
      expect(
        body,
        `perfBus.${field} 又被 samplePerf 直接指派了 —— 它只能由 FrameRateMeter.publish 寫`,
      ).not.toMatch(new RegExp(`perfBus\\.${field}\\s*=`));
    }
  });
});
