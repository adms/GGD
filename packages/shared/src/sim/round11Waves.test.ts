/**
 * ⭐⭐ 第十一回合生怪時序的守衛（GH#1151 B）。
 *
 * ⭐ 每一條都對著票上的**一句原話**，⛔ 不是「這個函式回了一個數字」。
 */
import { describe, it, expect } from "vitest";
import {
  round11EventsDue,
  round11Difficulty,
  pickRound11Event,
  round11AliveCap,
  round11MobRulesPatch,
  round11BossScale,
  type Round11WaveEvent,
} from "./round11Waves";

/** 出貨的那張表（`content/config/arena-rules.json` 的 `round11.waveTable`）。 */
const SHIPPED: readonly Round11WaveEvent[] = [
  { kind: "normal", weight: 60 },
  { kind: "special", weight: 25 },
  { kind: "boss", weight: 5 },
  { kind: "bombardment", weight: 5 },
  { kind: "reviveCircle", weight: 5 },
];

describe("① 事件排程 —— ⭐ 長 tick ⛔ 不可以漏掉事件", () => {
  it("⭐ 回傳「到現在應該發過幾個」，⛔ 不是「這一 tick 發不發」", () => {
    expect(round11EventsDue(0, 20)).toBe(0);
    expect(round11EventsDue(19.9, 20)).toBe(0);
    expect(round11EventsDue(20, 20)).toBe(1);
    expect(round11EventsDue(59, 20)).toBe(2);
  });

  it("⭐⭐ 伺服器卡了 100 秒 ⇒ **補 5 個**，⛔ 不是只補 1 個", () => {
    // ⚠️ #1151 B 逐字：「測試密集生成、死亡補位和**長 tick 不超額**」。
    //   ⛔ 「這一 tick 發不發」的寫法在這裡會漏掉四個事件。
    expect(round11EventsDue(100, 20)).toBe(5);
  });

  it("⛔ 間隔 <= 0 ⇒ 0（⛔ 不是無限發）", () => {
    expect(round11EventsDue(999, 0)).toBe(0);
    expect(round11EventsDue(999, -1)).toBe(0);
  });
});

describe("② 難度成長 —— ⭐ 整數指數用連乘（`sim` 禁 `Math.pow` / `**`）", () => {
  it("⭐ base^n，第 0 波是 1", () => {
    expect(round11Difficulty(1.15, 0)).toBe(1);
    expect(round11Difficulty(1.15, 1)).toBeCloseTo(1.15, 10);
    expect(round11Difficulty(1.15, 2)).toBeCloseTo(1.3225, 10);
    expect(round11Difficulty(2, 10)).toBe(1024);
  });

  it("⛔ base <= 0 ⇒ **1**（不成長），⛔ 不是 0", () => {
    // ⚠️ 難度乘成 0 的話,整個第十一回合**一隻怪都不出**。
    expect(round11Difficulty(0, 5)).toBe(1);
    expect(round11Difficulty(-2, 3)).toBe(1);
  });

  it("⭐ 連乘是**精確**的 —— 2^n 逐位元相符（⛔ 浮點近似會在這裡露餡）", () => {
    let ref = 1;
    for (let n = 0; n <= 20; n++) {
      expect(round11Difficulty(2, n)).toBe(ref);
      ref = ref * 2;
    }
  });
});

describe("③ 加權挑事件 —— ⭐ 契約語意", () => {
  it("⭐ roll 落在各自的區間（出貨表 60/25/5/5/5）", () => {
    expect(pickRound11Event(SHIPPED, 0)).toBe("normal");
    expect(pickRound11Event(SHIPPED, 0.59)).toBe("normal");
    expect(pickRound11Event(SHIPPED, 0.61)).toBe("special");
    expect(pickRound11Event(SHIPPED, 0.86)).toBe("boss");
    expect(pickRound11Event(SHIPPED, 0.91)).toBe("bombardment");
    expect(pickRound11Event(SHIPPED, 0.96)).toBe("reviveCircle");
  });

  it("⛔ **權重 0 的不會被選中** —— 那是它的契約語意", () => {
    const off = SHIPPED.map((e) => (e.kind === "boss" ? { ...e, weight: 0 } : e));
    for (let i = 0; i < 1000; i++) {
      expect(pickRound11Event(off, i / 1000)).not.toBe("boss");
    }
  });

  it("⛔ 空表／全 0 ⇒ `null`（**這一波不發**），⛔ 不是退回第一個", () => {
    expect(pickRound11Event([], 0.5)).toBeNull();
    expect(pickRound11Event(SHIPPED.map((e) => ({ ...e, weight: 0 })), 0.5)).toBeNull();
  });

  it("⭐ roll 的邊界：`1.0` ⛔ 不可以掉出最後一格", () => {
    expect(pickRound11Event(SHIPPED, 1)).toBe("reviveCircle");
    expect(pickRound11Event(SHIPPED, 1.5)).toBe("reviveCircle");
    expect(pickRound11Event(SHIPPED, -1)).toBe("normal");
  });

  it("⭐ 分佈大致照權重（1 萬次均勻抽樣）", () => {
    const c = new Map<string, number>();
    for (let i = 0; i < 10000; i++) {
      const k = pickRound11Event(SHIPPED, i / 10000)!;
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    expect(c.get("normal")! / 10000).toBeCloseTo(0.6, 2);
    expect(c.get("special")! / 10000).toBeCloseTo(0.25, 2);
    expect(c.get("boss")! / 10000).toBeCloseTo(0.05, 2);
  });
});

describe("④ 同時存活上限 —— ⭐ 漸進生成", () => {
  it("⭐ 從 0 線性長到上限", () => {
    expect(round11AliveCap(0, 120, 500)).toBe(0);
    expect(round11AliveCap(60, 120, 500)).toBe(250);
    expect(round11AliveCap(120, 120, 500)).toBe(500);
    expect(round11AliveCap(600, 120, 500)).toBe(500);
  });

  it("⛔⛔ 一開場**不可以**就允許 500 隻 —— 那是「開場即團滅」", () => {
    expect(round11AliveCap(1, 120, 500)).toBeLessThan(10);
  });

  it("⛔ rampSec <= 0 ⇒ 直接給滿（⭐ ＝「不漸進」，是一個合法的設定）", () => {
    expect(round11AliveCap(0, 0, 500)).toBe(500);
  });

  it("⛔ maxAlive <= 0 ⇒ 0（⭐ ＝ 這個機制關著）", () => {
    expect(round11AliveCap(999, 120, 0)).toBe(0);
  });
});

describe("⑤ 翻譯成出貨的 `MobRules` —— ⛔ 不寫第二個生怪器", () => {
  const TABLE = { eventIntervalSec: 20, difficultyBase: 1.15, events: SHIPPED };

  it("⭐ 間隔／上限／回合都翻過去了", () => {
    const p = round11MobRulesPatch(11, TABLE, 500, 30);
    expect(p.fromRound).toBe(11);
    expect(p.waveIntervalTicks).toBe(600); // 20s × 30Hz
    expect(p.firstWaveTicks).toBe(600);
    expect(p.maxAlivePerZone).toBe(500);
    expect(p.autoWaves).toBe(true);
  });

  it("⛔ 第一波**不在第 0 tick** —— 開場那一刻同時進場又爆怪", () => {
    expect(round11MobRulesPatch(11, TABLE, 500, 30).firstWaveTicks).toBeGreaterThan(0);
  });

  it("⛔ 間隔 0 ⇒ 至少 1 tick（⭐ 不是每 tick 生一波）", () => {
    const p = round11MobRulesPatch(11, { ...TABLE, eventIntervalSec: 0 }, 500, 30);
    expect(p.waveIntervalTicks).toBe(1);
  });

  it("⛔ `maxAliveZombies` 0 或負 ⇒ 0（機制關著）", () => {
    expect(round11MobRulesPatch(11, TABLE, 0, 30).maxAlivePerZone).toBe(0);
    expect(round11MobRulesPatch(11, TABLE, -5, 30).maxAlivePerZone).toBe(0);
  });

  it("⚠️⭐ `spawnRampSec` **翻不過去** —— 這一支回滿載，⛔ 不假裝漸進", () => {
    // ⭐ 出貨的 `MobRules.maxAlivePerZone` 是**靜態**的 ⇒ 漸進要靠呼叫端每 tick
    //   用 `round11AliveCap()` 夾一次。這一條把那個界線寫成斷言。
    const p = round11MobRulesPatch(11, TABLE, 500, 30);
    expect(p.maxAlivePerZone, "翻譯層回的是滿載").toBe(500);
    expect(round11AliveCap(1, 120, 500), "⭐ 漸進是另一支的事").toBeLessThan(10);
  });
});

describe("⑥ 殭屍王強度（GH#1151 D）", () => {
  it("⭐ 依**累計已生成**成長，⭐ 而且夾在上下界之間", () => {
    expect(round11BossScale(0, 2, 1, 8)).toBe(1);
    expect(round11BossScale(100, 2, 1, 8)).toBeCloseTo(2, 10);
    expect(round11BossScale(300, 2, 1, 8)).toBeCloseTo(4, 10);
    expect(round11BossScale(700, 2, 1, 8)).toBeCloseTo(8, 10);
  });

  it("⛔ 到頂就是頂 —— ⭐ 上界是**上界**，不是建議", () => {
    expect(round11BossScale(99999, 2, 1, 8)).toBe(8);
  });

  it("⛔ 下界是**下界** —— ⭐ 王永遠不會比它弱", () => {
    expect(round11BossScale(0, 2, 3, 8)).toBe(3);
    expect(round11BossScale(10, 2, 3, 8)).toBe(3);
  });

  it("⛔ 上下界顛倒 ⇒ 以 `floor` 為準（⛔ 不靜靜回中間值）", () => {
    expect(round11BossScale(9999, 2, 5, 2)).toBe(5);
  });

  it("⛔ `mult <= 1` ⇒ 不成長（⭐ ＝ 這個機制關著）", () => {
    expect(round11BossScale(9999, 1, 1, 8)).toBe(1);
    expect(round11BossScale(9999, 0, 1, 8)).toBe(1);
  });

  it("⭐⭐ 尺度是刻意的：⛔ **不可以第一波就撞到天花板**", () => {
    // ⚠️ 直接 `spawned × mult` 的話,第一波(比如 20 隻)就是 40 倍 ⇒ 上下界變裝飾。
    expect(round11BossScale(20, 2, 1, 8)).toBeLessThan(2);
    expect(round11BossScale(20, 2, 1, 8)).toBeGreaterThan(1);
  });

  it("⭐ 單調不遞減 —— ⛔ 生得越多王不可以變弱", () => {
    let prev = 0;
    for (let n = 0; n <= 1000; n += 25) {
      const v = round11BossScale(n, 2, 1, 8);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
