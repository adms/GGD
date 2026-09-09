/**
 * ⭐⭐ 第十一回合：**出貨設定真的走得到那個判定**（GH#1151 / GH#1165）。
 *
 * ⚠️ ⭐ 這條刻意驗的是**關係**，⛔ 不是名詞：
 * 「`round11.enabled` 這一格存在」證明不了任何事 —— CLAUDE.md 記過
 * `ap-coefficient.enabled` 三個住處齊全、後台看得到、兩張票全綠，
 * ⛔ **而沒有任何一行 production 讀它**，活了四天。
 *
 * ⇒ ⭐ 這裡走**出貨的那條路**：`content/config/arena-rules.json`
 *   → `rulesFromDoc()` → `shouldEnterRound11()`，⛔ 不自己造一份設定。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rulesFromDoc, DEFAULT_ARENA_RULES } from "./arenaRules";
import {
  shouldEnterRound11,
  round11SetupFrom,
  ROUND11_PRECEDING_ROUND,
} from "@ggd/shared/sim/round11Gate";
import { round11EventsDue, pickRound11Event } from "@ggd/shared/sim/round11Waves";
import { bombardmentHits, bombardmentPhase } from "@ggd/shared/sim/round11Bombardment";
import { round11Score } from "@ggd/shared/sim/round11Scoring";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOC = JSON.parse(readFileSync(join(REPO, "content/config/arena-rules.json"), "utf8"));

describe("第十一回合的設定 → 判定 接線（GH#1151）", () => {
  it("⭐ `rulesFromDoc` 真的把出貨的那兩格帶出來", () => {
    const r = rulesFromDoc(DOC);
    expect(r.round11.enabled).toBe(DOC.round11.enabled);
    expect(r.round11.triggerBossKills).toBe(DOC.round11.triggerBossKills);
  });

  it("⛔ 出貨設定今天是**關著**的 ⇒ 走完整條路仍然不進場", () => {
    const r = rulesFromDoc(DOC);
    expect(r.round11.enabled, "⛔ 出貨不可以是開的（sim 那一半還沒做完）").toBe(false);
    expect(shouldEnterRound11(r.round11, ROUND11_PRECEDING_ROUND, 999)).toBe(false);
  });

  it("⭐ 把開關打開（**只在測試裡**）⇒ 同一條路會進場 —— 證明它⛔不是裝飾", () => {
    const on = rulesFromDoc({ ...DOC, round11: { ...DOC.round11, enabled: true } });
    expect(on.round11.triggerBossKills).toBeGreaterThan(0);
    expect(shouldEnterRound11(on.round11, ROUND11_PRECEDING_ROUND, on.round11.triggerBossKills)).toBe(true);
    expect(shouldEnterRound11(on.round11, ROUND11_PRECEDING_ROUND, on.round11.triggerBossKills - 1)).toBe(false);
  });

  it("⛔ 沒有內容文件時的 fallback **也是關著的**", () => {
    expect(DEFAULT_ARENA_RULES.round11.enabled).toBe(false);
    expect(shouldEnterRound11(DEFAULT_ARENA_RULES.round11, ROUND11_PRECEDING_ROUND, 999)).toBe(false);
  });

  it("⭐ 進場後的場地／時限／橫幅也**走得到** —— 三格都從出貨設定來", () => {
    const r = rulesFromDoc(DOC).round11;
    const s = round11SetupFrom(r);
    expect(s.arenaId).toBe(DOC.round11.arenaId);
    expect(s.durationSec).toBe(DOC.round11.durationSec);
    expect(s.bannerText).toBe(DOC.round11.bannerText);
    // ⭐ 出貨值本身要是有意義的（⛔ 一個 0 秒的回合是設定壞了）。
    expect(s.durationSec).toBeGreaterThan(0);
    expect(s.arenaId.length).toBeGreaterThan(0);
    expect(s.bannerText.length).toBeGreaterThan(0);
  });

  it("⛔ 缺欄的設定 ⇒ fallback 是**不會動**的值（⛔ 不是一個看起來合理的預設）", () => {
    const bare = rulesFromDoc({ ...DOC, round11: undefined }).round11;
    expect(bare.durationSec).toBe(0);
    expect(bare.arenaId).toBe("");
    expect(bare.enabled).toBe(false);
  });
});

describe("第十一回合的生怪設定 → 排程 接線（GH#1151 B）", () => {
  it("⭐ 出貨的 `waveTable` 真的走得到排程器", () => {
    const r = rulesFromDoc(DOC).round11;
    expect(r.waveTable.eventIntervalSec).toBe(DOC.round11.waveTable.eventIntervalSec);
    expect(r.waveTable.difficultyBase).toBe(DOC.round11.waveTable.difficultyBase);
    expect(r.waveTable.events.length).toBe(DOC.round11.waveTable.events.length);
    expect(r.maxAliveZombies).toBe(DOC.round11.maxAliveZombies);
    expect(r.spawnRampSec).toBe(DOC.round11.spawnRampSec);
    // ⭐ 走一次真的排程：一個回合（durationSec）內會發幾個事件
    const n = round11EventsDue(r.durationSec, r.waveTable.eventIntervalSec);
    expect(n, "出貨設定一回合要發得出事件").toBeGreaterThan(0);
    // ⭐ 而它挑得出出貨表上的 kind
    expect(r.waveTable.events.map((e) => e.kind)).toContain(pickRound11Event(r.waveTable.events, 0.5));
  });

  it("⛔ 缺欄 ⇒ fallback 是**不會動**的值（0 隻上限、空事件表）", () => {
    const bare = rulesFromDoc({ ...DOC, round11: undefined }).round11;
    expect(bare.maxAliveZombies).toBe(0);
    expect(bare.waveTable.events).toEqual([]);
    expect(round11EventsDue(999, bare.waveTable.eventIntervalSec)).toBe(0);
    expect(pickRound11Event(bare.waveTable.events, 0.5)).toBeNull();
  });
});

describe("第十一回合的大轟炸設定 → 機制 接線（GH#1151 F）", () => {
  it("⭐ 出貨的 `bombardment` 真的走得到機制", () => {
    const b = rulesFromDoc(DOC).round11.bombardment;
    expect(b.enabled).toBe(DOC.round11.bombardment.enabled);
    expect(b.radius).toBe(DOC.round11.bombardment.radius);
    expect(b.telegraphSec).toBe(DOC.round11.bombardment.telegraphSec);
    // ⭐ 走一次真的判定：圈內／圈外
    expect(bombardmentHits({ x: 0, z: 0 }, 0, 0, b.radius)).toBe(true);
    expect(bombardmentHits({ x: b.radius + 1, z: 0 }, 0, 0, b.radius)).toBe(false);
    // ⭐ 倒數前不傷害
    expect(bombardmentPhase(0, 0, b.telegraphSec)).toBe("telegraph");
  });

  it("⛔⛔ **只有一個半徑** —— ⭐ 票逐字禁止「視覺一份、判定另一份」", () => {
    // ⚠️ ⭐ 這條是**結構**斷言：`ArenaRules.round11.bombardment` 上
    //   只有 `radius` 一格,⛔ 沒有 `visualRadius` / `damageRadius` 之類的第二格。
    const b = rulesFromDoc(DOC).round11.bombardment as Record<string, unknown>;
    const radiusKeys = Object.keys(b).filter((k) => /radius/i.test(k));
    expect(radiusKeys, "⛔ 半徑欄位只能有一個").toEqual(["radius"]);
  });

  it("⛔ 缺欄 ⇒ 轟炸**關著**且半徑 0（打不到任何人）", () => {
    const bare = rulesFromDoc({ ...DOC, round11: undefined }).round11;
    expect(bare.bombardment.enabled).toBe(false);
    expect(bombardmentHits({ x: 0, z: 0 }, 0, 0, bare.bombardment.radius)).toBe(false);
    expect(bare.deadPlayersControlBoss).toBe(false);
  });
});

describe("第十一回合的計分設定 → 機制 接線（GH#1151 G）", () => {
  it("⭐ 出貨的 `scoring` 真的走得到機制", () => {
    const sc = rulesFromDoc(DOC).round11.scoring;
    expect(sc.survivalWeight).toBe(DOC.round11.scoring.survivalWeight);
    expect(sc.scoreMultiplier).toBe(DOC.round11.scoring.scoreMultiplier);
    expect(sc.minContributionForFullSurvival).toBe(DOC.round11.scoring.minContributionForFullSurvival);
    // ⭐ 走一次真的計分：滿額 = 倍率
    expect(round11Score({ survivalFrac: 1, contributionFrac: 1 }, sc)).toBeCloseTo(sc.scoreMultiplier, 10);
  });

  it("⛔⛔ `round11Score` **不吃總分** —— ⭐ 重複乘算在型別上寫不出來", () => {
    // ⚠️ 票逐字：「⛔ 不能把總分與本回合分數混用而**重複乘算**」。
    //   ⭐ 這條是**結構**斷言：那支函式只有兩個參數（表現、設定）。
    expect(round11Score.length, "⛔ 多一個參數就是多一個出錯的入口").toBe(2);
  });

  it("⛔ 缺欄 ⇒ 計分**不影響勝負**（倍率 1、不折扣）", () => {
    const bare = rulesFromDoc({ ...DOC, round11: undefined }).round11.scoring;
    expect(bare.scoreMultiplier).toBe(1);
    expect(bare.survivalWeight).toBe(0);
  });
});
