/**
 * roundVictory — #212 回合勝利畫面的守衛.
 *
 * owner: 「回合顯示勝利：需要顯示自己隊伍 3d model 與打得好的評價建議及
 *         團隊累積積分」
 *
 * 三條指定守衛,每一條都做過突變驗證(見下),而且**斷言全部讀渲染出來的字串**
 * —— 模型算對了而畫面印別的東西是形態⑤,只比較函式回傳值抓不到。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 突變紀錄(2026-07-30 實際跑過)
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. roundVictory.ts `gradeRound(...)` → 固定回 B 的常數
 *     ⇒「餵不同戰績 → 得到不同等第」紅(5 種戰績收斂成 1 個字母)
 *  2. teamLedger.ts `record()` 從 `byRound.set(round, …)` 改成 `push`
 *     (即失去以 round 為鍵的冪等)
 *     ⇒「同一回合記兩次不會翻倍」紅
 *  3. MatchEndPanel 的 `teamStandings()` 改成自己 reduce 一次
 *     ⇒「回合畫面與結算畫面是同一個數」紅
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { GRADE_AXES, ADVICE_CODES, PRAISE_CODES } from "@ggd/shared/sim/stats/roundGrade";
import {
  ADVICE_TEXT,
  PRAISE_TEXT,
  ROUND_VICTORY_AXES,
  ROUND_VICTORY_GRADE_CONFIG,
  buildRoundVictory,
  mobKillsDelta,
  roundVictoryGrade,
  roundVictoryPerformance,
  roundVictoryPoints,
  untranslatedAxes,
  type RoundVictorySeat,
} from "./roundVictory";
import { RoundVictoryView, TeamPointsRows } from "./RoundVictoryPanel";
import { formatTeamPoints, teamLedger, teamStandings } from "./teamLedger";

function seat(over: Partial<RoundVictorySeat> = {}): RoundVictorySeat {
  return {
    seatId: 0,
    teamId: 0,
    championId: "thorne",
    displayName: "P0",
    roundKills: 0,
    roundDeaths: 0,
    alive: true,
    mobKills: 0,
    ...over,
  };
}

function render(model: ReturnType<typeof buildRoundVictory>, localTeamId: number | null): string {
  return renderToStaticMarkup(
    createElement(RoundVictoryView, {
      model,
      standings: teamStandings(),
      localTeamId,
      roundsSeen: teamLedger.roundsSeen(),
    }),
  );
}

beforeEach(() => {
  teamLedger.clear();
});

// ─────────────────────────────────────────── 守衛 1 · 不同戰績 → 不同等第 ──

describe("餵不同戰績 → 得到不同等第", () => {
  /**
   * 五組戰績,由好到壞。要求**至少三個不同的字母**且**單調不上升**。
   *
   * 為什麼不是「五個字母全都不同」:S~D 只有五階,而三個軸的解析度不保證每一
   * 階都踩得到 —— 硬要求五個不同會讓這條測試在調權重時假紅。單調性才是真正
   * 在守的性質:更好的戰績永遠不能拿到更差的等第。
   */
  const LADDER: { name: string; s: RoundVictorySeat; mobs: number }[] = [
    { name: "三殺零死全清", s: seat({ roundKills: 3, roundDeaths: 0, alive: true }), mobs: 12 },
    { name: "一殺零死", s: seat({ roundKills: 1, roundDeaths: 0, alive: true }), mobs: 4 },
    { name: "零殺活著", s: seat({ roundKills: 0, roundDeaths: 0, alive: true }), mobs: 1 },
    { name: "一殺一死", s: seat({ roundKills: 1, roundDeaths: 1, alive: false }), mobs: 0 },
    { name: "零殺兩死", s: seat({ roundKills: 0, roundDeaths: 2, alive: false }), mobs: 0 },
  ];

  it("等第隨戰績單調變差,而且至少踩到三個不同的字母", () => {
    const letters = LADDER.map((row) => roundVictoryGrade(row.s, row.mobs).grade);
    expect(new Set(letters).size, `五組戰績只產生了 ${letters.join("/")}`).toBeGreaterThanOrEqual(3);
    const ranks = LADDER.map((row) => {
      const g = roundVictoryGrade(row.s, row.mobs);
      return { name: row.name, score: g.score };
    });
    for (let i = 1; i < ranks.length; i += 1) {
      expect(
        ranks[i]!.score,
        `${ranks[i]!.name} 的分數不應該高於 ${ranks[i - 1]!.name}`,
      ).toBeLessThanOrEqual(ranks[i - 1]!.score);
    }
    // 兩端必須真的分得開 —— 全部落在同一階等於沒有評價
    expect(ranks[0]!.score).toBeGreaterThan(ranks[4]!.score + 0.2);
  });

  it("畫面上那個大字母跟著戰績變,不是常數", () => {
    const seen = new Set<string>();
    for (const row of LADDER) {
      const model = buildRoundVictory({
        matchId: "m",
        round: 3,
        localTeamId: 0,
        selfSeatId: 0,
        outcome: ROUND_OUTCOME.WON,
        seats: [row.s],
        prevMobKills: { 0: row.s.mobKills - row.mobs },
      });
      const html = render(model, 0);
      const letter = model.grade!.grade;
      // 大字母真的印出來了(不是只在模型裡)
      expect(html).toContain(`>${letter}</div>`);
      seen.add(letter);
    }
    expect(seen.size, "所有戰績在畫面上收斂成同一個等第").toBeGreaterThanOrEqual(3);
  });

  it("等第是 sim 的 gradeRound 推的 —— 這裡沒有第二套算式", () => {
    // 直接比對:面板的分數必須等於用同一份設定跑 gradeRound 的分數。
    // (buildRoundVictory 內部若改成自己加權,這條會紅。)
    const s = seat({ roundKills: 2, roundDeaths: 0, alive: true, mobKills: 6 });
    const model = buildRoundVictory({
      matchId: "m",
      round: 2,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.WON,
      seats: [s],
      prevMobKills: { 0: 0 },
    });
    const direct = roundVictoryGrade(s, 6);
    expect(model.grade!.score).toBeCloseTo(direct.score, 10);
    expect(model.grade!.grade).toBe(direct.grade);
  });
});

// ───────────────────────────────────── 看不見的軸:權重 0 而不是餵 0 ──

describe("線上量不到的軸,權重是 0", () => {
  it("四個量不到的軸權重恰好 0,三個量得到的保留出貨值", () => {
    for (const axis of GRADE_AXES) {
      const w = ROUND_VICTORY_GRADE_CONFIG.weights[axis];
      if (ROUND_VICTORY_AXES.includes(axis)) {
        expect(w, `${axis} 應該是活的軸`).toBeGreaterThan(0);
      } else {
        expect(w, `${axis} 線上量不到,權重必須是 0`).toBe(0);
      }
    }
  });

  it("量不到的軸永遠不會變成建議或稱讚", () => {
    // 一個各方面都差的戰績:如果 damage/tanking/support/accuracy 有權重,
    // 它們會是最「值得改善」的軸,而那是在叫玩家去練這個畫面沒量過的東西。
    const bad = seat({ roundKills: 0, roundDeaths: 3, alive: false });
    const g = roundVictoryGrade(bad, 0);
    const axes = [...g.advice, ...g.strengths].map((a) => a.axis);
    for (const axis of axes) {
      expect(ROUND_VICTORY_AXES, `${axis} 是量不到的軸,不該出現在建議裡`).toContain(axis);
    }
    expect(g.advice.length, "全面打不出來卻一條建議都沒有").toBeGreaterThan(0);
  });

  it("分數不會被四個結構性的 0 稀釋", () => {
    // 完美戰績必須拿得到接近 1 的分數。用出貨的七軸權重跑,同一份戰績會被
    // 四個恆 0 的軸壓到 0.46 附近 —— 也就是全場長期 C/D 的那個安靜故障。
    const perfect = seat({ roundKills: 8, roundDeaths: 0, alive: true });
    const g = roundVictoryGrade(perfect, 200);
    expect(g.score).toBeGreaterThan(0.95);
    expect(g.grade).toBe("S");
  });
});

// ────────────────────────────────────────────────────── 文案完整性 ──

describe("建議文字表", () => {
  it("七個軸的建議與稱讚都翻譯過 —— 不會有 i18n 代號漏到畫面上", () => {
    expect(untranslatedAxes()).toEqual([]);
    for (const axis of GRADE_AXES) {
      expect(ADVICE_CODES[axis]).toBeTruthy();
      expect(PRAISE_CODES[axis]).toBeTruthy();
      expect(ADVICE_TEXT[axis].length).toBeGreaterThan(6);
      expect(PRAISE_TEXT[axis].length).toBeGreaterThan(6);
      // 不是罐頭句:每一條都要講到具體的行為,不能只是「再加油」
      expect(ADVICE_TEXT[axis]).not.toBe(PRAISE_TEXT[axis]);
    }
    // 七條建議彼此不同 —— 一份都指向同一句話的表等於沒有建議
    expect(new Set(GRADE_AXES.map((a) => ADVICE_TEXT[a])).size).toBe(GRADE_AXES.length);
  });

  it("建議印在畫面上,而且帶著它自己的百分比證據", () => {
    const bad = seat({ roundKills: 0, roundDeaths: 2, alive: false });
    const model = buildRoundVictory({
      matchId: "m",
      round: 4,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.LOST,
      seats: [bad],
      prevMobKills: { 0: 0 },
    });
    const html = render(model, 0);
    expect(model.advice.length).toBeGreaterThan(0);
    for (const line of model.advice) {
      expect(html, `建議「${line.text}」沒有印出來`).toContain(line.text);
      expect(html).toContain(`data-ggd-round-advice="${line.axis}"`);
      expect(html).toContain(`${Math.round(line.score * 100)}%`);
    }
    // 「這個等第看過什麼」必須在卡片上
    expect(html).toContain("只計 擊殺·陣亡·存活·殭屍");
  });
});

// ───────────────────────────────────────── 自己隊伍(複數)與輪空 ──

describe("自己隊伍是複數,輪空不評分", () => {
  it("卡片列出自己這一隊的每一個人,不是只有 MVP", () => {
    const seats = [
      seat({ seatId: 0, teamId: 0, displayName: "阿一", roundKills: 2 }),
      seat({ seatId: 1, teamId: 0, displayName: "阿二", roundKills: 0 }),
      seat({ seatId: 2, teamId: 0, displayName: "阿三", roundKills: 1 }),
      seat({ seatId: 3, teamId: 1, displayName: "敵人", roundKills: 5 }),
    ];
    const model = buildRoundVictory({
      matchId: "m",
      round: 2,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.WON,
      seats,
      prevMobKills: {},
    });
    expect(model.members).toHaveLength(3);
    const html = render(model, 0);
    for (const name of ["阿一", "阿二", "阿三"]) {
      expect(html, `${name} 沒有出現在隊伍列表`).toContain(name);
    }
    expect(html, "敵隊的人不該出現在「自己隊伍」的列表裡").not.toContain("敵人");
    // 排序決定性:分數高的在前
    expect(model.members[0]!.seat.displayName).toBe("阿一");
  });

  it("輪空的回合不給等第 —— 那是 #173 的 bug 換上一個字母", () => {
    // 輪空的隊伍被停在場邊、零殺零死不活著,和被瞬間清台的隊伍**數字一模一樣**,
    // 只有 roundOutcome 分得出來。
    const model = buildRoundVictory({
      matchId: "m",
      round: 3,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.NONE,
      seats: [seat({ alive: false })],
      prevMobKills: {},
    });
    expect(model.state).toBe("bye");
    expect(model.grade).toBeNull();
    expect(model.ledgerEntries).toHaveLength(0); // 輪空不進帳
    const html = render(model, 0);
    expect(html).toContain("輪空");
    expect(html).toContain(">—</div>"); // 大字母是破折號,不是 D
  });

  it("觀戰(沒有座位)也不評分", () => {
    const model = buildRoundVictory({
      matchId: "m",
      round: 3,
      localTeamId: null,
      selfSeatId: null,
      outcome: ROUND_OUTCOME.WON,
      seats: [seat()],
      prevMobKills: {},
    });
    expect(model.state).toBe("no-seat");
    expect(model.grade).toBeNull();
  });
});

// ─────────────────────────────────── 守衛 3 · 團隊累積積分是同一個數 ──

describe("團隊累積積分:跨回合累計 + 兩處同一個數", () => {
  function playRound(round: number, kills: readonly number[]): void {
    const seats = kills.map((k, i) =>
      seat({ seatId: i, teamId: i < 2 ? 0 : 1, displayName: `P${i}`, roundKills: k }),
    );
    const model = buildRoundVictory({
      matchId: "m",
      round,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.WON,
      seats,
      prevMobKills: {},
    });
    teamLedger.record("m", round, model.ledgerEntries);
  }

  it("跨回合真的累加 —— 總分等於每一筆進帳的總和", () => {
    // ⚠️ 這條原本只斷言「第二回合之後總分變大」,而那是形態④:把
    // `t.points += e.points` 改成 `t.points = e.points`(完全不累加,同一回合裡
    // 後面的座位蓋掉前面的)之後,總分**照樣**變大,20 條測試全綠。方向不是
    // 守衛,**恆等式**才是 —— 總分必須逐筆等於帳上記過的每一筆。
    playRound(1, [2, 1, 0, 0]);
    const afterOne = teamLedger.pointsOf(0);
    expect(afterOne).toBeGreaterThan(0);
    playRound(2, [3, 2, 0, 0]);

    for (const teamId of [0, 1]) {
      const expected = teamLedger
        .roundNumbers()
        .flatMap((r) => teamLedger.entriesFor(r))
        .filter((e) => e.teamId === teamId)
        .reduce((sum, e) => sum + e.points, 0);
      expect(teamLedger.pointsOf(teamId), `隊伍 ${teamId} 的總分不是每一筆的總和`).toBe(expected);
    }
    // …而且第二回合真的有加上去(恆等式在只記一回合時也會過)
    expect(teamLedger.pointsOf(0)).toBeGreaterThan(afterOne);
    expect(teamLedger.roundsSeen()).toBe(2);

    // 每個成員的分項也要是總和,否則 memberPoints 可以是任意數字
    const team0 = teamStandings().find((t) => t.teamId === 0)!;
    expect(team0.memberPoints.reduce((a, b) => a + b, 0)).toBe(team0.points);
  });

  it("同一回合記兩次不會翻倍 —— 以 round 為鍵覆寫", () => {
    playRound(1, [2, 1, 0, 0]);
    const once = teamLedger.pointsOf(0);
    playRound(1, [2, 1, 0, 0]);
    playRound(1, [2, 1, 0, 0]);
    expect(teamLedger.pointsOf(0), "同一回合被算了不只一次").toBe(once);
    expect(teamLedger.roundsSeen()).toBe(1);
  });

  it("換一場比賽整份歸零 —— 上一場的積分不會跟著進來", () => {
    playRound(1, [2, 1, 0, 0]);
    expect(teamLedger.pointsOf(0)).toBeGreaterThan(0);
    teamLedger.record("另一場", 1, [{ seatId: 0, teamId: 0, points: 5 }]);
    expect(teamLedger.pointsOf(0)).toBe(5);
  });

  it("回合勝利畫面與結算畫面印出來的是同一個數", () => {
    // THE guard the task names. 兩邊都是**渲染出來的字串**,不是回傳值 ——
    // 值一樣而畫面印別的東西是形態⑤。
    playRound(1, [3, 1, 0, 2]);
    playRound(2, [1, 2, 3, 0]);

    const model = buildRoundVictory({
      matchId: "m",
      round: 3,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.WON,
      seats: [seat({ seatId: 0, teamId: 0 })],
      prevMobKills: {},
    });
    const roundHtml = render(model, 0);

    // 結算畫面掛的是同一個 component,吃同一支 teamStandings()
    const settlementHtml = renderToStaticMarkup(
      createElement(TeamPointsRows, {
        standings: teamStandings(),
        localTeamId: 0,
        roundsSeen: teamLedger.roundsSeen(),
      }),
    );

    const standings = teamStandings();
    expect(standings.length).toBe(2);
    // 兩隊的分數必須不同,否則「兩邊一樣」可能只是巧合
    expect(standings[0]!.points).not.toBe(standings[1]!.points);
    for (const t of standings) {
      const text = formatTeamPoints(t.points);
      expect(roundHtml, `回合畫面沒有印出隊伍 ${t.teamId} 的 ${text}`).toContain(text);
      expect(settlementHtml, `結算畫面沒有印出隊伍 ${t.teamId} 的 ${text}`).toContain(text);
    }
    // 帳的範圍也要看得見(重連會失去先前回合,見 teamLedger §3)
    expect(roundHtml).toContain("累積 2 回合");
    expect(settlementHtml).toContain("累積 2 回合");
  });

  it("排名照分數,同分照 teamId —— 決定性", () => {
    teamLedger.record("m", 1, [
      { seatId: 0, teamId: 1, points: 10 },
      { seatId: 1, teamId: 0, points: 10 },
      { seatId: 2, teamId: 2, points: 30 },
    ]);
    expect(teamStandings().map((t) => t.teamId)).toEqual([2, 0, 1]);
  });
});

// ─────────────────────────────────────────── 殭屍是 DELTA 不是整場累積 ──

describe("objective 軸吃的是這一回合的殭屍,不是整場累積", () => {
  it("差值計算:沒有前值就算 0,不是把整場算成一回合", () => {
    const s = seat({ seatId: 0, mobKills: 40 });
    expect(mobKillsDelta(s, {}), "沒有前值時把 40 隻整場擊殺算成這一回合").toBe(0);
    expect(mobKillsDelta(s, { 0: 25 })).toBe(15);
    // 伺服器重置或亂序快照造成的負差 → 0,不是負分
    expect(mobKillsDelta(s, { 0: 55 })).toBe(0);
  });

  it("同樣的座位,前值不同 → 分數不同", () => {
    const s = seat({ seatId: 0, mobKills: 40, roundKills: 0, alive: true });
    const fresh = roundVictoryGrade(s, mobKillsDelta(s, { 0: 0 }));
    const late = roundVictoryGrade(s, mobKillsDelta(s, { 0: 38 }));
    expect(fresh.score).toBeGreaterThan(late.score);
  });

  it("RoundPerformance 裡量不到的欄位是 0,而且那些 0 進不了分數", () => {
    const perf = roundVictoryPerformance(seat({ roundKills: 1, alive: true }), 3);
    expect(perf.damageDealt).toBe(0);
    expect(perf.abilityHits).toBe(0);
    expect(perf.abilityWhiffs).toBe(0);
    // …而 accuracy 軸(shots=0 → 中位 0.5)因為權重 0,對分數沒有貢獻
    const g = roundVictoryGrade(seat({ roundKills: 1, alive: true }), 3);
    expect(g.axes.accuracy).toBeCloseTo(0.5, 6);
    expect(ROUND_VICTORY_GRADE_CONFIG.weights.accuracy).toBe(0);
  });

  it("積分是整數 —— 它會被跨回合加總後印出來", () => {
    const g = roundVictoryGrade(seat({ roundKills: 1, alive: true }), 2);
    const p = roundVictoryPoints(g);
    expect(Number.isInteger(p)).toBe(true);
    expect(p).toBe(Math.round(g.score * 100));
  });
});
