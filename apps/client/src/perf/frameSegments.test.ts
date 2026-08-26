/**
 * 📏 GH#614 —— 量尺的守衛。⭐ 驗的是**機制會不會發生**，⛔ 不是「哪一段幾 ms」
 * （那是行為相依的量，寫進斷言就是第四個住處）。
 *
 * ⚠️ `GameApp` headless 起不來（它自己的註解就這麼寫），所以「八個 mark 有沒有
 * 接對」只能讀出貨原始碼 —— ⭐ 但驗的是**順序**，⛔ 不是「有沒有提到這個字」：
 * 一個擺錯位置的 mark 會安靜地把成本記到隔壁那一段，而那正是量尺會說謊的方式。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FrameSegments, FRAME_SEGMENTS, autoArmOnStall, frameSegments, AUTO_ARM_STALL_MS } from "./frameSegments";

describe("frameSegments", () => {
  it("⭐ 自證：燒進 draw 的時間要量回 draw（量不回來 ⇒ 這把尺的結論作廢）", () => {
    expect(new FrameSegments().calibrate()).toBe("ok");
  });

  it("把時間記在**正確**的那一段上（歸屬，⛔ 不是總量）", () => {
    let t = 0;
    const fs = new FrameSegments(() => t);
    fs.arm(true);
    fs.begin((t = 0));
    fs.mark("drain");
    t = 7; // drain 花了 7ms
    fs.mark("vfx");
    t = 8;
    fs.end();
    const rep = fs.report();
    const by = (s: string): number => rep.segments.find((x) => x.seg === s)?.p50Ms ?? 0;
    expect(by("drain")).toBeGreaterThan(by("vfx"));
    expect(rep.frames).toBe(1); // ⭐ 分母印得出來
  });

  it("⛔ 沒武裝 ⇒ 一次都不碰時鐘（量尺自己不可以變成成本）", () => {
    let calls = 0;
    const fs = new FrameSegments(() => (calls++, 0));
    fs.begin(0);
    for (const s of FRAME_SEGMENTS) fs.mark(s);
    fs.external("domAnchors", 5);
    fs.end();
    expect(calls).toBe(0);
    expect(fs.report().frames).toBe(0);
  });

  it("⭐ 凍結超過門檻就**自己武裝**（owner:「我不想當你的人肉測試機」）", () => {
    frameSegments.arm(false);
    expect(autoArmOnStall(AUTO_ARM_STALL_MS - 1)).toBe(false);
    expect(autoArmOnStall(AUTO_ARM_STALL_MS + 1)).toBe(true);
    expect(frameSegments.armed).toBe(true);
    expect(autoArmOnStall(9999)).toBe(false); // 已經開著就不重複武裝（⛔ 不清視窗）
    frameSegments.arm(false);
  });

  it("⭐ 出貨的 renderFrame 真的照**這個順序**打了八個點", () => {
    const src = readFileSync(new URL("../GameApp.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("private renderFrame("), src.indexOf("private drainNetworkEvents("));
    const seen = [...body.matchAll(/frameSegments\.(?:begin|mark|end)\(\s*(?:"(\w+)")?/g)].map((m) => m[1]);
    // begin → 七個 mark → end。⛔ 第一段（round）由 begin 開始，所以它不在 mark 裡。
    expect(seen).toEqual([undefined, ...FRAME_SEGMENTS.slice(1), undefined]);
  });
});
