/**
 * ⭐⭐ 第十一回合進場判定的守衛（GH#1151 / GH#1165）。
 *
 * ⭐ 這是 `round11.*` 那 13 欄設定的**第一個真消費端**的守衛 ——
 * 在此之前 `enabled` 與 `triggerBossKills` 是裝飾（零消費端）。
 *
 * ⚠️ ⭐ 兩個方向都驗：**該開的時候開**、⛔ **不該開的時候不開**。
 * 一把只驗過單邊的尺不算自證過（本文件記過的貼圖去重那次）。
 */
import { describe, it, expect } from "vitest";
import {
  shouldEnterRound11,
  recordBossKill,
  round11SetupFrom,
  round11EndReason,
  ROUND11_PRECEDING_ROUND,
  type Round11Gate,
} from "./round11Gate";

const ON: Round11Gate = { enabled: true, triggerBossKills: 3 };

describe("第十一回合進場判定（GH#1151）", () => {
  it("⭐ 三個條件都成立 ⇒ 進場", () => {
    expect(shouldEnterRound11(ON, ROUND11_PRECEDING_ROUND, 3)).toBe(true);
    expect(shouldEnterRound11(ON, ROUND11_PRECEDING_ROUND, 9)).toBe(true);
  });

  it("⛔ 開關關著 ⇒ **永遠**不進場（一鍵 rollback 的那一半）", () => {
    const off: Round11Gate = { ...ON, enabled: false };
    expect(shouldEnterRound11(off, ROUND11_PRECEDING_ROUND, 999)).toBe(false);
  });

  it("⛔ 王擊殺沒到門檻 ⇒ 維持既有的十回合結算", () => {
    expect(shouldEnterRound11(ON, ROUND11_PRECEDING_ROUND, 2)).toBe(false);
    expect(shouldEnterRound11(ON, ROUND11_PRECEDING_ROUND, 0)).toBe(false);
  });

  it("⛔ 還沒打完第十回合 ⇒ 不進場（⭐ 而且第 11 回合之後也不會再進一次）", () => {
    for (const r of [1, 5, 9, 11, 12]) {
      expect(shouldEnterRound11(ON, r, 99), `round ${r}`).toBe(false);
    }
  });

  it("⭐⭐ 門檻 0 讀成「**不設門檻**」，⛔ 不是「零隻也算達標」", () => {
    // ⚠️ 這一條是**刻意**的：owner 把門檻歸零時的意思是「先關掉這個條件」，
    //    ⛔ 而把 0 讀成「一定成立」會讓**每一場**都開第十一回合。
    const zero: Round11Gate = { ...ON, triggerBossKills: 0 };
    expect(shouldEnterRound11(zero, ROUND11_PRECEDING_ROUND, 0)).toBe(false);
    expect(shouldEnterRound11(zero, ROUND11_PRECEDING_ROUND, 99)).toBe(false);
    const neg: Round11Gate = { ...ON, triggerBossKills: -1 };
    expect(shouldEnterRound11(neg, ROUND11_PRECEDING_ROUND, 99)).toBe(false);
  });

  it("⭐ 王擊殺**去重** —— 同一隻王重覆回報只算一次（#1151 A 逐字要求）", () => {
    const slain = new Set<number>();
    expect(recordBossKill(slain, 42)).toBe(1);
    expect(recordBossKill(slain, 42)).toBe(1); // ⛔ 重連／重播／同 tick 多來源
    expect(recordBossKill(slain, 43)).toBe(2);
    // ⭐ 去重之後才到門檻：兩隻不同的王 + 一次重覆 ⇒ 仍然是 2 ⇒ ⛔ 不進場
    expect(shouldEnterRound11(ON, ROUND11_PRECEDING_ROUND, slain.size)).toBe(false);
    expect(shouldEnterRound11(ON, ROUND11_PRECEDING_ROUND, recordBossKill(slain, 44))).toBe(true);
  });

  it("⭐ 出貨設定今天是**關著**的 —— 這條守衛不可以靠開著才綠", () => {
    // ⚠️ 形態⑩：一條靠缺陷（或靠某個開關剛好是開的）才綠的守衛，
    //   會在那個前提消失時看起來像回歸。⇒ 上面每一條都**自己造 gate**，
    //   ⛔ 不讀 `content/config/arena-rules.json`。這一條把那件事寫下來。
    expect(shouldEnterRound11({ enabled: false, triggerBossKills: 3 }, 10, 3)).toBe(false);
  });
});

describe("第十一回合的世界描述與終止（#1151 A 的第 2／3 條）", () => {
  it("⭐ 設定的場地／時限／橫幅**照抄**，⛔ 不在這一層改", () => {
    const s = round11SetupFrom({ arenaId: "arena.royale", durationSec: 600, bannerText: "第十一回合・生存模式" });
    expect(s.arenaId).toBe("arena.royale");
    expect(s.durationSec).toBe(600);
    expect(s.bannerText).toBe("第十一回合・生存模式");
  });

  it("⭐ 四個禁用／保留**是值，⛔ 不是註解** —— 消費端漏掉就 tsc 紅", () => {
    const s = round11SetupFrom({ arenaId: "a", durationSec: 1, bannerText: "b" });
    expect(s.fireRing).toBeNull();          // 無火圈
    expect(s.skipIntermission).toBe(true);  // 無商店
    expect(s.healAllToFull).toBe(true);
    expect(s.keepLegendaries).toBe(true);   // 繼承前十回合寶具
    expect(s.keepTeamsHostile).toBe(true);  // 兩隊維持敵對
  });

  it("⭐ 還在打 ⇒ null；⛔ 不可以提早喊結束", () => {
    expect(round11EndReason(0, 4, 600)).toBeNull();
    expect(round11EndReason(599, 1, 600)).toBeNull();
  });

  it("⭐ 時限到 ⇒ `time`", () => {
    expect(round11EndReason(600, 4, 600)).toBe("time");
    expect(round11EndReason(601, 4, 600)).toBe("time");
  });

  it("⭐ 人類全滅 ⇒ `humansWiped`", () => {
    expect(round11EndReason(10, 0, 600)).toBe("humansWiped");
  });

  it("⭐⭐ **時限先判** —— 最後一人在時限那一刻倒下算 `time`，⛔ 不是全滅", () => {
    // ⚠️ 兩種結局的計分不一樣（G 項）⇒ ⛔ 判錯會把一個平手記成全滅。
    expect(round11EndReason(600, 0, 600)).toBe("time");
  });
});

describe("⭐ 進場回合**跟著 `finalRound` 走**，⛔ 不是寫死的 10", () => {
  it("賽制改成 12 回合 ⇒ 第十一回合接在**第 12 回合**之後", () => {
    // ⚠️ ⛔ 寫死 10 的話，owner 把 `finalRound` 調成 12 的那一刻
    //   第十一回合會**永遠開不了**，⭐ 而沒有任何東西變紅。
    expect(shouldEnterRound11(ON, 12, 3, 12)).toBe(true);
    expect(shouldEnterRound11(ON, 10, 3, 12)).toBe(false);
  });

  it("省略時退回出貨預設（10）—— ⭐ 與既有的 `isFinalRound` 同一條規矩", () => {
    expect(shouldEnterRound11(ON, 10, 3)).toBe(true);
    expect(shouldEnterRound11(ON, 12, 3)).toBe(false);
  });
});
