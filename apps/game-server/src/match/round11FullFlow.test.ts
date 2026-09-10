/**
 * ⭐⭐ **第十一回合的功能安全測試**（GH#1151 H①③）——
 * 關掉 ⇒ 十回合行為**逐位元不變**；開著 ⇒ 走完 **A–G** 到結算。
 *
 * ⛔⛔ 這一支取代的是那條「骨架永遠必須關閉」的守衛。票 H① 逐字：
 * 「將『永遠必須關閉』的骨架守衛改為**真正的功能安全測試**」。
 *
 * ⭐ 它吃的是**出貨的** `content/config/arena-rules.json`（⛔ 不自己造一份設定）——
 * 只把**賽制時序**縮短（`finalRound` / `durationSec`），
 * ⭐ 而 `round11` 的**語意欄位**（門檻、上限、倍率⋯）**原樣沿用出貨值**。
 * ⇒ ⛔ 一個「測試自己編了一份設定所以會過」的綠燈在這裡寫不出來。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MatchController, type SeatSpec } from "./MatchController";
import { rulesFromDoc, type ArenaRules } from "./arenaRules";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";

const REPO = join(__dirname, "../../../..");
const DOC = JSON.parse(readFileSync(join(REPO, "content/config/arena-rules.json"), "utf8")) as {
  round11: Record<string, unknown>;
};

const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const SHORT_FINAL = 3;
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/**
 * ⭐ 出貨設定 ＋ 只縮**賽制時序**。
 * ⚠️ `enabledOverride` 只給「關掉」那一組用 —— ⭐ 它證明的是 **rollback 真的有效**。
 */
function shippedRules(enabledOverride?: boolean): ArenaRules {
  const r = rulesFromDoc({
    ...DOC,
    round11: {
      ...DOC.round11,
      ...(enabledOverride === undefined ? {} : { enabled: enabledOverride }),
      durationSec: 6, // ⭐ 只縮時序,⛔ 語意欄位不動
    },
  } as never);
  return {
    ...r,
    finalRound: SHORT_FINAL,
    mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  };
}

/** 跑到比賽結束，回傳打完的回合數。 */
function runToEnd(ctl: MatchController, guard = 60000): number {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n++ < guard) ctl.tick();
  expect(ctl.phase.phase, "比賽要在守衛之內結束").toBe("matchEnd");
  return ctl.phase.round;
}

describe("H① 功能安全 —— 關掉 ⇒ 十回合不變", () => {
  it("⛔⛔ `enabled: false` ⇒ 停在 finalRound，⭐ 門檻再高也不進", () => {
    const ctl = new MatchController("ff-off", 7, allBots(), FAST, undefined, shippedRules(false));
    // ⭐ 餵滿門檻 —— ⛔ 而它仍然不可以進場（那才叫 rollback）
    for (let i = 1; i <= 99; i++) recordBossKill(ctl.round11BossKillsForTest, i);
    expect(runToEnd(ctl), "⛔ 關掉之後多打了一回合 ⇒ 那一格不是 rollback").toBe(SHORT_FINAL);
  });

  it("⛔ 開著但**王擊殺沒到門檻** ⇒ 一樣停在 finalRound", () => {
    const ctl = new MatchController("ff-few", 7, allBots(), FAST, undefined, shippedRules());
    const need = shippedRules().round11.triggerBossKills;
    expect(need, "⭐ 出貨門檻要 > 1，否則這條測試沒有意義").toBeGreaterThan(1);
    for (let i = 1; i < need; i++) recordBossKill(ctl.round11BossKillsForTest, i); // ⭐ 差一個
    expect(runToEnd(ctl)).toBe(SHORT_FINAL);
  });
});

describe("H③ 全流程 —— 達門檻 ⇒ 第十一回合 ⇒ 結算", () => {
  const played = () => {
    const ctl = new MatchController("ff-on", 7, allBots(), FAST, undefined, shippedRules());
    const need = shippedRules().round11.triggerBossKills;
    for (let i = 1; i <= need; i++) recordBossKill(ctl.round11BossKillsForTest, i);
    const rounds = runToEnd(ctl);
    return { ctl, rounds };
  };

  it("⭐⭐ 用**出貨設定**達門檻 ⇒ 多打一個回合，⛔ 而且只多一個", () => {
    expect(played().rounds).toBe(SHORT_FINAL + 1);
  });

  it("⭐⭐ 結算**只發生一次**，而且每個座位都在裡面（A 第 4 條）", () => {
    const { ctl } = played();
    const s = ctl.settlement;
    expect(s, "⭐ 比賽結束要有結算").not.toBeNull();
    expect(s!.perPlayer.length, "⭐ 12 個座位都在結算裡").toBe(12);
    const seats = s!.perPlayer.map((p) => p.seatId);
    expect(new Set(seats).size, "⛔ 有人被結算兩次").toBe(seats.length);
  });

  it("⭐⭐ 回合結束**不留殘留狀態**（A 第 4 條：排程／預警圈／臨時控制權）", () => {
    const { ctl } = played();
    // ⭐ 換邊的臨時控制權不可以活過這一場
    expect(ctl.round11PossessionsForTest.size, "⛔ 換邊狀態留到結算之後").toBe(0);
    // ⭐ 大轟炸的預警不可以還掛著（它是「正在倒數」的狀態）
    expect(
      ctl.world.events.some((e) => e.type === "round11Bombardment"),
      "⛔ 結算之後還在發預警圈",
    ).toBe(false);
  });
});
