/**
 * GH#838 —— 粒子密度上限的**承重守衛**（owner 2026-08-28）。
 *
 * owner 逐字：「所有特效粒子特效密度要受到上限值管制，後台可設定，這次的特效
 * 編輯器裡設定共同遵守上限值，這個上限值也會**卡入實際遊戲前端執行的單個特效
 * 上限值**」
 *
 * ⭐ 驗的是**機制**（有沒有被夾住、兩個軸都夾、開關轉得動），⛔ 不驗數字
 * （1200/600 是內容，住 content/config/vfx-budget.json，第二守則）。
 *
 * 突變驗證（2026-08-28）：把 `capacityFor` 的 `Math.min(cap, …)` 拿掉 ⇒ ①② 紅；
 * 把 `rateFor` 的 `Math.min(maxRatePerSystem(), …)` 拿掉 ⇒ ③ 紅。
 */
import { describe, it, expect, afterEach } from "vitest";
import type { VfxDoc } from "@ggd/shared/content";
import {
  capacityFor,
  rateFor,
  setParticleDensityCaps,
  maxParticlesPerSystem,
  maxRatePerSystem,
} from "./particleFactory";

/** 一份**故意超量**的文件（作者打錯字／原作匯入的極端值都長這樣）。 */
const HUGE_BURST = {
  id: "test.huge-burst",
  schema: "vfx@1",
  mode: "burst",
  burstCount: 999_999,
  lifetimeSec: { min: 0.2, max: 0.6 },
} as unknown as VfxDoc;

const HUGE_STREAM = {
  id: "test.huge-stream",
  schema: "vfx@1",
  mode: "stream",
  rate: 999_999,
  lifetimeSec: { min: 0.2, max: 4 },
} as unknown as VfxDoc;

afterEach(() => setParticleDensityCaps(undefined));

describe("GH#838 粒子密度上限", () => {
  it("① 爆量的 burst 文件被夾在生效中的上限內（⛔ 不是照作者寫的配一百萬顆）", () => {
    setParticleDensityCaps(undefined); // 出貨預設
    const cap = maxParticlesPerSystem();
    expect(capacityFor(HUGE_BURST), "burst 容量沒有被上限夾住").toBeLessThanOrEqual(cap);
    expect(capacityFor(HUGE_BURST, 4), "scale 放大之後就繞過上限了").toBeLessThanOrEqual(cap);
  });

  it("② 後台調小 ⇒ 容量跟著變小（開關真的轉得動，⛔ 不是印出來好看的）", () => {
    setParticleDensityCaps({ maxParticlesPerSystem: 64 });
    const small = capacityFor(HUGE_BURST);
    setParticleDensityCaps({ maxParticlesPerSystem: 2000 });
    const big = capacityFor(HUGE_BURST);
    expect(small, "調小之後容量沒有變小 —— 這一格是死的").toBeLessThan(big);
    expect(small).toBeLessThanOrEqual(64);
  });

  it("③ 噴發率也被夾（兩個軸都要 —— 只夾顆數會讓高噴發率系統一直撞天花板）", () => {
    setParticleDensityCaps({ maxRatePerSystem: 50 });
    expect(rateFor(HUGE_STREAM), "每秒噴發沒有被夾").toBeLessThanOrEqual(50);
    expect(maxRatePerSystem()).toBe(50);
    // 持續型的容量從**夾過的**噴發率算 ⇒ 兩個軸一致
    expect(capacityFor(HUGE_STREAM)).toBeLessThanOrEqual(maxParticlesPerSystem());
  });

  it("④ 界外的後台值被夾回範圍（50 打成 500000 不會變成一次分頁當機）", () => {
    setParticleDensityCaps({ maxParticlesPerSystem: 10_000_000 });
    const v = maxParticlesPerSystem();
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(20_000);
  });
});
