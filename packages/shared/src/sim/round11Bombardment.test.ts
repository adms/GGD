/**
 * ⭐⭐ 大轟炸的守衛（GH#1151 F）—— 每一條對著票上的**一句原話**。
 */
import { describe, it, expect } from "vitest";
import {
  bombardmentPhase,
  bombardmentHits,
  pickBombardmentTarget,
  bombardmentDamage,
  type BombardmentCandidate,
} from "./round11Bombardment";

const at = (x: number, z: number): BombardmentCandidate => ({ x, z });

describe("① 預警與結算 —— ⭐「倒數前不傷害」「只結算一次」", () => {
  it("⛔ 倒數期間是 `telegraph`（⛔ 不傷害）", () => {
    expect(bombardmentPhase(0, 0, 10)).toBe("telegraph");
    expect(bombardmentPhase(9.8, 9.9, 10)).toBe("telegraph");
  });

  it("⭐ **跨過門檻的那一 tick** 回 `impact`", () => {
    expect(bombardmentPhase(9.9, 10, 10)).toBe("impact");
    expect(bombardmentPhase(9.9, 10.5, 10)).toBe("impact");
  });

  it("⛔⛔ 之後**不再結算** —— ⭐「事件只結算一次」", () => {
    expect(bombardmentPhase(10, 10.1, 10)).toBe("done");
    expect(bombardmentPhase(10.5, 99, 10)).toBe("done");
  });

  it("⭐⭐ **長 tick 也只炸一次** —— ⛔ 跳過整個倒數也不會炸兩發", () => {
    // 一個 tick 從 0 跳到 30 ⇒ ⭐ impact 一次
    expect(bombardmentPhase(0, 30, 10)).toBe("impact");
    // ⭐ 下一 tick 就是 done
    expect(bombardmentPhase(30, 31, 10)).toBe("done");
  });

  it("⛔ `telegraphSec` 0 ⇒ 第一 tick 就落地（⭐ 而仍然只有一次）", () => {
    expect(bombardmentPhase(-1, 0, 0)).toBe("impact");
    expect(bombardmentPhase(0, 0.1, 0)).toBe("done");
  });
});

describe("② 命中判定 —— ⭐「圈外不命中」，⭐ 而且只有**一個**半徑", () => {
  it("⭐ 圈內命中、⛔ 圈外不命中", () => {
    expect(bombardmentHits(at(0, 0), 0, 0, 12)).toBe(true);
    expect(bombardmentHits(at(11.9, 0), 0, 0, 12)).toBe(true);
    expect(bombardmentHits(at(12.1, 0), 0, 0, 12)).toBe(false);
  });

  it("⭐ 邊界**含**在內（`<=`）—— ⛔ 站在圈線上要被打到", () => {
    expect(bombardmentHits(at(12, 0), 0, 0, 12)).toBe(true);
  });

  it("⛔ 半徑 <= 0 ⇒ 打不到任何人（⭐ ＝ 機制關著）", () => {
    expect(bombardmentHits(at(0, 0), 0, 0, 0)).toBe(false);
    expect(bombardmentHits(at(0, 0), 0, 0, -1)).toBe(false);
  });
});

describe("③ 選點 —— ⭐「密集人群偏向」", () => {
  it("⛔ `crowdBias = 0` ⇒ 每個人等權（⭐ 純隨機挑一個**人**）", () => {
    const c = [at(0, 0), at(100, 0), at(200, 0)];
    expect(pickBombardmentTarget(c, 12, 0, 0.1)).toEqual(at(0, 0));
    expect(pickBombardmentTarget(c, 12, 0, 0.5)).toEqual(at(100, 0));
    expect(pickBombardmentTarget(c, 12, 0, 0.9)).toEqual(at(200, 0));
  });

  it("⭐⭐ `crowdBias = 1` ⇒ **擠的那一團**壓倒性地容易被選中", () => {
    // 三個人擠在一起 + 一個人在遠處
    const c = [at(0, 0), at(1, 0), at(2, 0), at(500, 0)];
    let lonely = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickBombardmentTarget(c, 12, 1, i / 1000)!.x === 500) lonely++;
    }
    // ⭐ 擠的三個各得分 3、孤單那個得分 1 ⇒ 1/(3+3+3+1) = 10%
    expect(lonely / 1000).toBeCloseTo(0.1, 1);
  });

  it("⭐⭐ 回傳的是**某個人的座標**，⛔ 不是重心", () => {
    // ⚠️ 三個人圍成三角形時,重心那一點**沒有人站**⇒ 炸重心等於炸空地。
    const c = [at(0, 0), at(10, 0), at(5, 10)];
    for (let i = 0; i < 200; i++) {
      const p = pickBombardmentTarget(c, 3, 1, i / 200)!;
      expect(c).toContainEqual(p);
    }
  });

  it("⛔ 沒有候選 ⇒ `null`（⭐ 這一次不炸），⛔ 不是炸原點", () => {
    expect(pickBombardmentTarget([], 12, 0.6, 0.5)).toBeNull();
  });

  it("⭐ `roll` 邊界：1.0 ⛔ 不可以掉出去", () => {
    const c = [at(0, 0), at(100, 0)];
    expect(pickBombardmentTarget(c, 12, 0, 1)).toEqual(at(100, 0));
    expect(pickBombardmentTarget(c, 12, 0, -1)).toEqual(at(0, 0));
  });
});

describe("④ 傷害 —— ⭐ 只算數字，⛔ 不繞過傷害管線", () => {
  it("⭐ `maxHp × pct`", () => {
    expect(bombardmentDamage(4000, 0.5)).toBe(2000);
  });

  it("⛔ 0 或負的輸入 ⇒ 0（⭐ ＝ 不打）", () => {
    expect(bombardmentDamage(0, 0.5)).toBe(0);
    expect(bombardmentDamage(4000, 0)).toBe(0);
    expect(bombardmentDamage(4000, -1)).toBe(0);
  });

  it("⭐⭐ ⛔ 這一支**不夾免死** —— 那是傷害管線的事", () => {
    // ⚠️ 票要求「沿用**合法環境傷害入口**」⇒ 這裡回的是傷害量,
    //   ⛔ 不是「扣完血之後的結果」。⭐ 100% 的設定就回滿血的量。
    expect(bombardmentDamage(4000, 1)).toBe(4000);
  });
});
