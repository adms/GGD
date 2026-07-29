/**
 * GameApp 的兩條**接線**守衛 (tasks #281 / #282) —— 稽核補的 (verifier).
 *
 * ── 為什麼非有不可 ───────────────────────────────────────────────────────────
 * #281 與 #282 的修正各自有一支很紮實的行為測試:
 *   · `render/frameDrive.test.ts` 用真的 `IntentSender` 跑一整秒,證明
 *     `driveFrame` 的 pump 在 fps gate **之前**;
 *   · `predict/predictionAim.test.ts` 跑真的預測重播,證明 `LocalPrediction`
 *     吃得下 aim。
 * 兩支都是好測試 —— 但它們測的都是**零件**。把 `GameApp.ts` 這個**出貨的**
 * 檔案改回缺陷原狀:
 *   (a) `sender.onSent` 回到 `if (msg.order) recordInput(msg.seq, msg.order)`
 *       (aim 在這裡被丟掉,影子永遠拿不到瞄準),以及
 *   (b) 把 `gamepads.poll / touch.poll / sessions.update` 從 `pumpInput` 移回
 *       `renderFrame`(取樣與送出重新被 fps 上限擋住),
 * 之後 client 套件 **341 檔 / 4093 條全綠**。也就是說這兩個修正**玩家拿不拿得到
 * ,一條測試都看不見** —— 正是這個 repo 列的失敗形狀 ⑤(受測的不是出貨的東西)。
 *
 * ── 為什麼是源碼掃描(而且這是這個檔案唯一的槓桿)───────────────────────────
 * 掃字串是失敗形狀 ⑥,這裡明說。`GameApp` 抓 Babylon engine / canvas / socket,
 * headless 起不來,repo 對這個檔案的既有做法就是源碼掃描
 * (`GameApp.batch1Wiring.test.ts`、`architecture.test.ts`)。
 *
 * 但這一支不是「grep 有沒有出現某個字」:它**切出方法的大括號區塊**,斷言
 * 每個呼叫落在**哪一個方法裡**,並且斷言它**不在**另一個方法裡。「pump 裡有」
 * 與「render 裡沒有」是一組互補的斷言 —— 把呼叫搬家會同時打破兩邊,而單純
 * 加一行註解或改個變數名不會。註解在比對前先被 `stripComments` 拿掉,所以
 * 散文永遠滿足不了任何一條。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { stripComments } from "@ggd/shared/testkit/stripComments";

const SRC = stripComments(
  readFileSync(fileURLToPath(new URL("./GameApp.ts", import.meta.url)), "utf8"),
);

/**
 * Cut out the `{ … }` block that follows `header`, brace-matched. Returns the
 * body WITHOUT the outer braces. Throws when the header is absent, so a rename
 * of the method fails loudly instead of silently passing on an empty string.
 */
function bodyAfter(header: string): string {
  const at = SRC.indexOf(header);
  if (at < 0) throw new Error(`GameApp.ts no longer contains \`${header}\``);
  const open = SRC.indexOf("{", at + header.length - 1);
  if (open < 0) throw new Error(`no block after \`${header}\``);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return SRC.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after \`${header}\``);
}

describe("#282 一幀的兩半真的接在 GameApp 上 (frame-drive-wiring)", () => {
  it("frame 的全部工作就是 driveFrame(…, this.frameWork) —— 沒有第二條路徑", () => {
    cover("frame-drive-intent");
    const frame = bodyAfter("private readonly frame = (): void =>");
    expect(frame).toMatch(
      /this\.lastFrameMs\s*=\s*driveFrame\(\s*nowMs,\s*this\.lastFrameMs,\s*this\.renderParams\.fpsCap,\s*this\.frameWork,?\s*\)/,
    );
    // 而且 frameWork.pump 接的是輸入泵、render 接的是繪製 —— 不是接反了
    const work = bodyAfter("private readonly frameWork: FrameWork =");
    expect(work).toMatch(/pump:\s*\(nowMs: number\)\s*=>\s*this\.pumpInput\(nowMs\)/);
    expect(work).toMatch(/render:\s*\(nowMs: number\)\s*=>\s*this\.renderFrame\(nowMs\)/);
  });

  it("取樣 + intent flush 都掛在 pumpInput 那一側,不在 renderFrame 裡(被上限擋)", () => {
    cover("frame-drive-intent");
    const pump = bodyAfter("private pumpInput(nowMs: number): void");
    const sample = bodyAfter("private sampleInput(): void");
    const transmit = bodyAfter("private transmitIntents(beatMs: number): void");
    const render = bodyAfter("private renderFrame(nowMs: number): void");

    // pumpInput 的兩件事:取樣 + 敲時鐘。兩者都在 gate 之前。
    expect(pump).toContain("this.sampleInput(");
    expect(pump).toContain("this.intentClock.tick(nowMs)");
    // 取樣本體
    for (const call of ["this.gamepads.poll(", "this.touch.poll("]) {
      expect(sample, `${call} 不在 sampleInput 裡`).toContain(call);
    }
    // flush 本體
    expect(transmit).toContain("this.sessions.update(");

    // ⛔ 這四件事一件都不可以回到 renderFrame —— 那就是 #282 的缺陷原狀
    for (const call of [
      "this.gamepads.poll(",
      "this.touch.poll(",
      "this.sessions.update(",
      "this.intentClock.tick(",
    ]) {
      expect(
        render,
        `${call} 回到了 renderFrame —— 手機 30fps 的 intent 送出率會再掉一半 (#282)`,
      ).not.toContain(call);
    }
    // 手把自由視角的 latch 也要在**取樣之前**清掉,否則搖桿放開後鏡頭會漂
    expect(sample).toMatch(/this\.padCameraPan\.length = 0;[\s\S]{0,200}this\.gamepads\.poll\(/);
  });

  /**
   * #282 第二段的**接線**守衛:flush 必須走 IntentClock 的拍點,不可以退回
   * 「每一幀直接 sessions.update(nowMs)」。這兩件事在 GameApp 裡長得幾乎一樣,
   * 而差別就是手機 19.6/s 與 30/s。
   */
  it("flush 走的是 IntentClock 的拍點,不是 rAF 的 nowMs", () => {
    cover("intent-clock-rate");
    const pump = bodyAfter("private pumpInput(nowMs: number): void");
    const transmit = bodyAfter("private transmitIntents(beatMs: number): void");

    // pumpInput 不可以自己送 —— 它只准敲時鐘
    expect(
      pump.includes("this.sessions.update("),
      "pumpInput 又直接呼叫 sessions.update 了 —— 送出率退回綁 rAF (#282)",
    ).toBe(false);
    // 而送出的那一刻用的是**拍點**參數,不是 nowMs
    expect(transmit).toMatch(/this\.sessions\.update\(beatMs\)/);
    expect(
      /this\.sessions\.update\(nowMs\)/.test(SRC),
      "sessions.update 又拿到牆上時刻了 —— 節流會再被幀的抖動打散 (#282)",
    ).toBe(false);

    // 時鐘的兩個 sink 真的接到那兩個方法上(不是接反、不是接到 lambda 空殼)
    expect(SRC).toMatch(/sample:\s*\(\)\s*=>\s*this\.sampleInput\(\)/);
    expect(SRC).toMatch(/beat:\s*\(beatMs\)\s*=>\s*this\.transmitIntents\(beatMs\)/);
    // 速率是**設定值**,不是寫死的字面量(第一守則)
    expect(SRC).toMatch(/new IntentClock\([\s\S]{0,240}this\.renderParams\.intentHz/);
    expect(SRC).toMatch(/this\.intentClock\.setHz\(p\.intentHz\)/);
    // 與 rAF 無關的第二個時鐘來源真的被裝上,而且離場時被拆掉
    expect(SRC).toMatch(/this\.intentClock\.start\(\)/);
    expect(SRC).toMatch(/this\.intentClock\.stop\(\)/);
  });

  it("結算凍結仍然停止送出 —— 修正沒有把 #100 的凍結一起拆掉", () => {
    cover("frame-drive-intent");
    const transmit = bodyAfter("private transmitIntents(beatMs: number): void");
    expect(transmit).toMatch(
      /outcomeDecided !== true\s*\)\s*\{[\s\S]{0,200}this\.sessions\.update\(beatMs\)/,
    );
  });
});

describe("#281 送出去的 aim 真的餵給了本地預測 (predict-aim-wiring)", () => {
  it("onSent 把 msg.aim 一起交給 recordInput,而且 aim-only 的訊息也記", () => {
    cover("predict-aim");
    // 出貨的那一行:三個參數,不是兩個
    expect(SRC).toMatch(
      /this\.prediction\.recordInput\(\s*msg\.seq,\s*msg\.order,\s*msg\.aim\s*\)/,
    );
    // 而且守門條件必須放行「只有 aim、沒有 order」的訊息(站定瞄準)
    expect(SRC).toMatch(/if \(msg\.order \|\| msg\.aim\)\s*this\.prediction\.recordInput\(/);
    // 缺陷原狀:兩個參數的呼叫不可以再存在
    expect(
      /this\.prediction\.recordInput\(\s*msg\.seq,\s*msg\.order\s*\)/.test(SRC),
      "onSent 回到了只記 order 的舊寫法 —— 影子又看不到瞄準了 (#281)",
    ).toBe(false);
  });
});
