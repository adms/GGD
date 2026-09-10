/**
 * ⭐⭐ 換邊操作殭屍王，跑**真的 `MatchController`**（GH#922 / #1151 E）。
 *
 * ⚠️⭐ 這一支刻意⛔ **不自己造 payload** —— 那是失敗形態⑤（被測的不是出貨的那個）。
 * ⭐ 它跑一場真的比賽進到第十一回合，把一隊打死，然後問四個問題：
 *   ① 那一隊**真的換邊了嗎** ② 四種濫用**真的被服務端拒絕嗎**
 *   ③ 分數**真的凍結了嗎** ④ 擊倒**真的回滿且只進獨立統計嗎**
 */
import { describe, it, expect } from "vitest";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";
import { recordBossKill } from "@ggd/shared/sim/round11Gate";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content";
import { asSeatId, type EntityId, type SeatId } from "@ggd/shared/ids";
import { rankScore } from "@ggd/shared/sim/stats/rating";

const FAST = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 20, resolutionTicks: 2 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

const rules = (round11: Partial<ArenaRules["round11"]>): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  mobWaves: { ...DEFAULT_MOB_WAVES_CONFIG, fromRound: 1 },
  finalRound: 3,
  round11: {
    ...DEFAULT_ARENA_RULES.round11,
    enabled: true,
    triggerBossKills: 2,
    arenaId: "arena.royale",
    durationSec: 20,
    bannerText: "第十一回合",
    maxAliveZombies: 0,
    spawnRampSec: 0,
    deadPlayersControlBoss: true,
    possession: { escapeWindowSec: 10, telegraphRadius: 6, inheritBossAugments: true },
    ...round11,
  },
});

/** ⭐ 跑到第十一回合的 combat。 */
function toRound11(ctl: MatchController): void {
  recordBossKill(ctl.round11BossKillsForTest, 1);
  recordBossKill(ctl.round11BossKillsForTest, 2);
  let n = 0;
  while (!(ctl.phase.round === 4 && ctl.phase.phase === "combat") && n++ < 40000) ctl.tick();
  expect(ctl.phase.round, "有跑到第十一回合").toBe(4);
}

/** ⭐ 把某一隊的英雄全部打到 `alive = false`（⛔ 不是移除實體 —— 屍體要留在原地）。 */
function wipeTeam(ctl: MatchController, team: number): SeatId[] {
  const out: SeatId[] = [];
  for (const [seatId, seat] of ctl.seats) {
    if ((seat.teamId as unknown as number) !== team || seat.entityId === null) continue;
    const hp = ctl.world.health.get(seat.entityId);
    if (!hp) continue;
    hp.hp = 0;
    hp.alive = false;
    out.push(seatId);
  }
  return out;
}

const make = (id: string, over: Partial<ArenaRules["round11"]> = {}) =>
  new MatchController(id, 7, allBots(), FAST, undefined, rules(over));

describe("① 觸發 —— ⭐ 分母是**存活的英雄**（GH#922 驗收①②）", () => {
  it("⭐ 一隊三個英雄全死 ⇒ **整隊換邊**，⛔ 而別隊一個都沒動", () => {
    const ctl = make("poss-on");
    toRound11(ctl);
    const wiped = wipeTeam(ctl, 0);
    expect(wiped.length, "那一隊有人").toBeGreaterThan(0);
    ctl.tick();
    const poss = ctl.round11PossessionsForTest;
    for (const s of wiped) expect(poss.has(s), `座位 ${s} 要換邊`).toBe(true);
    // ⛔ 別隊沒被波及
    for (const [seatId, seat] of ctl.seats) {
      if ((seat.teamId as unknown as number) === 0) continue;
      expect(poss.has(seatId), `座位 ${seatId} ⛔ 不該換邊`).toBe(false);
    }
  });

  it("⛔⛔ 驗收②：**還有一個隊友活著** ⇒ 一個都不換", () => {
    const ctl = make("poss-alive");
    toRound11(ctl);
    const wiped = wipeTeam(ctl, 0);
    // ⭐ 把其中一個救回來 —— ⛔ 那一隊就不算全滅。
    const seat = ctl.seats.get(wiped[0]!)!;
    const hp = ctl.world.health.get(seat.entityId!)!;
    hp.hp = 1;
    hp.alive = true;
    ctl.tick();
    expect(ctl.round11PossessionsForTest.size, "⛔ 一個都不換").toBe(0);
  });

  it("⛔ 開關關掉 ⇒ 全死也不換（⭐ 一鍵 rollback）", () => {
    const ctl = make("poss-off", { deadPlayersControlBoss: false });
    toRound11(ctl);
    wipeTeam(ctl, 0);
    ctl.tick();
    expect(ctl.round11PossessionsForTest.size).toBe(0);
  });

  it("⭐ **原地生成**：換邊沿用同一具實體 ⇒ `seat.entityId` ⛔ 沒有換過", () => {
    const ctl = make("poss-inplace");
    toRound11(ctl);
    const wiped = wipeTeam(ctl, 0);
    const before = new Map(wiped.map((s) => [s, ctl.seats.get(s)!.entityId]));
    ctl.tick();
    for (const s of wiped) {
      expect(ctl.seats.get(s)!.entityId, "⛔ 不要只換鏡頭,也⛔ 不要換一具新的").toBe(before.get(s));
      expect(ctl.round11PossessionsForTest.get(s)!.bossEntityId).toBe(before.get(s));
      // ⭐ 站起來了,而且血是滿的
      const hp = ctl.world.health.get(before.get(s)!)!;
      expect(hp.alive).toBe(true);
      expect(hp.hp).toBe(hp.maxHp);
    }
  });
});

describe("② 四種濫用 —— ⭐ 服務端真的拒絕（GH#922）", () => {
  const setup = (over: Partial<ArenaRules["round11"]> = {}) => {
    const ctl = make(`abuse-${JSON.stringify(over)}`, over);
    toRound11(ctl);
    const wiped = wipeTeam(ctl, 0);
    ctl.tick();
    return { ctl, wiped };
  };

  it("⛔⛔ **逃跑窗內** ⇒ 拒絕；窗過了 ⇒ 放行", () => {
    const { ctl, wiped } = setup();
    const s = wiped[0]!;
    const boss = ctl.round11PossessionsForTest.get(s)!.bossEntityId;
    expect(ctl.round11DenyCommand(s, boss), "剛換邊 ⇒ 還在窗內").toBe("escapeWindow");
    // ⭐ 把逃跑窗設成 0 的那一場,同一刻就放行 —— ⭐ 證明擋人的是**那一格設定**。
    const { ctl: c2, wiped: w2 } = setup({
      possession: { escapeWindowSec: 0, telegraphRadius: 6, inheritBossAugments: true },
    });
    const s2 = w2[0]!;
    expect(c2.round11DenyCommand(s2, c2.round11PossessionsForTest.get(s2)!.bossEntityId)).toBeNull();
  });

  it("⛔⛔ **操作他人的王** ⇒ 拒絕（⭐ 而且⛔ 不是回 escapeWindow）", () => {
    const { ctl, wiped } = setup();
    const mine = wiped[0]!;
    const theirs = ctl.round11PossessionsForTest.get(wiped[1]!)!.bossEntityId;
    expect(ctl.round11DenyCommand(mine, theirs)).toBe("notYourBoss");
  });

  it("⛔⛔ **重生第二具**：王死了 ⇒ 拒絕，⭐ 而重連回**旁觀**", () => {
    const { ctl, wiped } = setup();
    const s = wiped[0]!;
    const boss = ctl.round11PossessionsForTest.get(s)!.bossEntityId;
    // ⭐ 走**出貨的** `deathSystem`:hp 歸零而 `alive` 留 true ⇒ 這一 tick 它會死。
    //   ⛔ 不自己 `emit("death")` —— `step()` 第一行就清空 `events`,
    //   ⭐ 那樣的事件根本到不了消費端(而且它是一個虛構通道:失敗形態⑤)。
    const bhp = ctl.world.health.get(boss)!;
    bhp.hp = 0;
    ctl.tick();
    expect(ctl.round11PossessionsForTest.get(s)!.bossDead).toBe(true);
    expect(ctl.round11DenyCommand(s, boss)).toBe("bossDead");
    expect(ctl.round11ReconnectRole(s), "⛔ 不分配新的王").toBe("spectator");
  });

  it("⛔ 沒換邊的座位 ⇒ `notConverted`；⭐ 換了的重連回**同一個王**", () => {
    const { ctl, wiped } = setup();
    const alive = [...ctl.seats.keys()].find((k) => !wiped.includes(k))!;
    expect(ctl.round11DenyCommand(alive, 1 as EntityId)).toBe("notConverted");
    expect(ctl.round11ReconnectRole(alive)).toBe("champion");
    expect(ctl.round11ReconnectRole(wiped[0]!)).toBe("boss");
  });
});

describe("③④ 分數凍結 · 擊倒回滿 · 獨立統計（GH#922 驗收④⑤⑦）", () => {
  /**
   * ⭐ 跑到下一則**真的**回合分數（走出貨的組裝路，⛔ 不自己算）。
   *
   * ⚠️⚠️ ⭐ 第一件事是**把已經排在那裡的那一則丟掉**：
   * `queueRoundScores` 每 `LIVE_SCORE_PERIOD_TICKS` 就覆寫一則，
   * ⛔ 於是直接取會拿到一則**在我改動之前**就組好的 payload
   *   ⇒ ⭐ 那把尺會對「有沒有生效」永遠回答「沒有」（⛔ 兩個方向都是綠的）。
   */
  const nextScores = (ctl: MatchController): Map<number, number> => {
    ctl.takeRoundSettlements(); // ⭐ 丟掉舊的那一則
    let n = 0;
    for (;;) {
      const drained = ctl.takeRoundSettlements();
      if (drained.length > 0) {
        return new Map(drained[0]!.players.map((p) => [p.seatId as unknown as number, p.score]));
      }
      expect(n++, "回合分數要在守衛之內送出").toBeLessThan(2000);
      ctl.tick();
    }
  };

  /**
   * ⭐ 跑一場**決定性**的比賽到第十一回合、打掉 0 隊，（可選）灌 500k 傷害進
   * 那個座位的**活統計**，回傳它在回合分數裡的數字。
   *
   * ⚠️⚠️ ⭐ 為什麼 A/B 是**兩場**而不是同一場前後取樣：`rankScore` 是**相對**分數
   * （吃整個 lobby），⛔ 而比賽在兩次取樣之間仍在跑 ⇒ 同一場的「前」與「後」
   * 本來就不相等 —— ⭐ 那把尺量不出凍結。
   * ⭐ 同一顆種子、同樣的 tick 序列 ⇒ 兩場逐位元一樣，**唯一的差別就是那次灌注**。
   *
   * ⚠️⚠️ ⭐ 而**對照組是那一格開關**，⛔ 不是「另一個座位」：
   * 換一個座位當對照時量到的是「沒有動」—— ⛔ 而那不是凍結，是 `compositeScore`
   * 的 `clamp01` **在那個座位上已經飽和**。⭐ 同一個座位 × 同樣的灌注 ×
   * 只差開關，才排得掉飽和這個解釋。
   */
  const scoreOf = (possess: boolean, inflate: boolean): number | undefined => {
    const ctl = make("poss-freeze-ab", { deadPlayersControlBoss: possess });
    toRound11(ctl);
    const wiped = wipeTeam(ctl, 0);
    ctl.tick(); // ⭐ 開著 ⇒ 這一刻換邊並凍結；關著 ⇒ 什麼都沒發生
    const target = wiped[0]!;
    if (inflate) {
      const st = ctl.world.matchStats.get(ctl.seats.get(target)!.entityId!);
      expect(st, "那個座位真的有統計可以灌").toBeDefined();
      st!.damageDealt += 500_000;
    }
    return nextScores(ctl).get(target as unknown as number);
  };

  it("⛔⛔ 驗收④：換邊之後**打死人也不會加分** —— ⭐ 而關掉開關同樣的灌注會加", () => {
    // ⭐ 開著：灌 500k ⇒ 分數**逐位元不動**（服務的是凍結的那一份）。
    expect(scoreOf(true, true), "⛔⛔ 換邊的那一位：分數⛔ 沒有被回刷").toBe(
      scoreOf(true, false),
    );
    // ⭐ 關著：**同一個座位、同樣的灌注** ⇒ 分數確實會動。
    //   ⛔ 一把只驗過單邊的尺不算自證過。
    expect(scoreOf(false, true), "⭐ 關掉開關 ⇒ 同樣的灌注確實會讓分數動").not.toBe(
      scoreOf(false, false),
    );
  });

  it("⭐⭐ 驗收⑤⑦：王擊倒一名英雄 ⇒ **生命回滿** ＋ 獨立統計 +1", () => {
    const ctl = make("poss-kill");
    toRound11(ctl);
    const wiped = wipeTeam(ctl, 0);
    ctl.tick();
    const s = wiped[0]!;
    const boss = ctl.round11PossessionsForTest.get(s)!.bossEntityId;
    const hp = ctl.world.health.get(boss)!;
    hp.hp = 1; // ⭐ 打到剩 1
    // ⭐ 別隊的一個英雄被這具王打死
    const victim = [...ctl.seats.values()].find(
      (st) => (st.teamId as unknown as number) !== 0 && st.entityId !== null,
    )!.entityId!;
    // ⭐⭐ 走**出貨的**傷害佇列 ⇒ 真的 `damage` 事件 ⇒ `deathSystem` 真的把
    //   擊殺歸給這具王。⛔ 不自己 emit(那是虛構通道,而且 `step()` 會先清空)。
    const vhp = ctl.world.health.get(victim)!;
    ctl.world.damageQueue.push({
      source: boss,
      target: victim,
      amount: vhp.maxHp * 100,
      type: "true",
      crit: false,
      origin: "mob",
    });
    ctl.tick();
    expect(hp.hp, "⭐ 回滿 —— ⛔ 而且是**夾限之後**的上限").toBe(hp.maxHp);
    expect(ctl.round11BossKillTallyForTest.get(s as unknown as number)).toBe(1);
  });

  it("⭐⭐ 驗收⑦：結算真的多**獨立的一行**，⛔ 而它沒有進 `score`", () => {
    const ctl = make("poss-settle");
    toRound11(ctl);
    const wiped = wipeTeam(ctl, 0);
    ctl.tick();
    const s = wiped[0]!;
    const boss = ctl.round11PossessionsForTest.get(s)!.bossEntityId;
    const victim = [...ctl.seats.values()].find(
      (st) => (st.teamId as unknown as number) !== 0 && st.entityId !== null,
    )!.entityId!;
    ctl.world.damageQueue.push({
      source: boss,
      target: victim,
      amount: ctl.world.health.get(victim)!.maxHp * 100,
      type: "true",
      crit: false,
      origin: "mob",
    });
    ctl.tick();
    let n = 0;
    while (ctl.phase.phase !== "matchEnd" && n++ < 40000) ctl.tick();
    expect(ctl.phase.phase, "比賽有結束").toBe("matchEnd");
    const players = ctl.settlement!.perPlayer;
    const mine = players.find((p) => p.seatId === (s as unknown as number))!;
    expect(mine.bossKills, "⭐ 那一行真的送出去了").toBe(1);
    // ⛔⛔ 而它**沒有**混進分數 —— ⭐ 拿**出貨的那支式子**照 `stats` 重算一次:
    //   如果哪一天有人把擊倒數折進分數,這一行就對不上了。
    //   ⚠️ ⭐ 這是**重算**,⛔ 不是「拿 score 跟 score 比」(那種斷言恆真)。
    //   ⚠️ `roundsSurvived` ⛔ 不在 `stats` 裡（它是 `rankScore` 的**第三個**輸入）
    //   ⇒ ⭐ 拿它自己公布的那一行 `survivalBonus` 把兩半拆開比。
    const lobby = players.map((p) => p.stats);
    expect(
      rankScore({ stats: mine.stats, role: mine.role, roundsSurvived: 0 }, lobby),
      "⭐ 分數仍然只有戰鬥＋存活兩半 —— ⛔ 擊倒數沒有被折進去",
    ).toBe(mine.score! - mine.survivalBonus!);
    // ⭐ 沒換邊的座位留 `undefined` —— ⛔ 不是 0(0 會被畫成「開了王而沒打到」)。
    const other = players.find(
      (p) => !wiped.map((w) => w as unknown as number).includes(p.seatId as never),
    )!;
    expect(other.bossKills, "⛔ 沒開過王的人不該有這一行").toBeUndefined();
  });

  it("⛔ 開關關掉 ⇒ 擊倒⛔ 不回滿（⭐ 一鍵 rollback）", () => {
    const ctl = make("poss-kill-off", { deadPlayersControlBoss: false });
    toRound11(ctl);
    wipeTeam(ctl, 0);
    ctl.tick();
    expect(ctl.round11PossessionsForTest.size, "根本沒換邊 ⇒ 沒有王可以回滿").toBe(0);
  });
});
