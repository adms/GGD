/**
 * roundVictoryFeed — #212 的**水位記憶**守衛(`RoundVictoryPanel` 的模組狀態).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼 roundVictory.test.ts 抓不到這裡的東西
 * ═══════════════════════════════════════════════════════════════════════════
 * 那個檔案每一條都自己把 `prevMobKills` 當參數餵給 `buildRoundVictory` ——
 * 也就是說,它測的是「給定正確的前值,模型算得對不對」。而**出貨的面板從來
 * 不是這樣拿到前值的**:它從模組層的一份記憶推,而那份記憶由同一個 effect
 * 一邊讀一邊寫。被測的不是出貨的那一個(形態⑤),所以下面這個真實缺陷在
 * 20 條全綠的情況下活著:
 *
 *   舊版的記憶是一張扁平的 `Map<seatId, kills>`,讀「上一回合」與寫「這一回合」
 *   共用同一格。`resolution` 相位有 5 秒(`PhaseMachine.resolutionTicks`),
 *   sim 在這 5 秒照樣每 tick 跑(回血/冷卻/狀態計時),`RoomStore` 以 JSON
 *   內容當快取鍵投影 seats,所以同一個回合裡 seats 陣列一定會換不只一次:
 *
 *     1. 第一次算 → 殭屍差 15 → **A**,記帳 **+78 分**
 *     2. effect 把「現在的累積值」寫回同一格
 *     3. 任一欄位一動 → useMemo 重算 → 差變 **0** → 掉成 **B** → 而 `record`
 *        以 round 為鍵覆寫,那筆 +78 **被改寫成 +57**
 *
 *   (78 / 57 是 2026-07-30 在這個檔案上量到的:把出貨版改回讀寫同一格,同一份
 *    輸入第一次 A/78、第二次 B/57,殭屍差 15 → 0。)
 *
 * 玩家看到等第在眼前掉一階,團隊累積積分永遠少算 objective 那一軸,全程沒有
 * 任何錯誤。修法是把水位按回合分開(讀 `round − 1`、寫 `round`)。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 斷言讀的是**渲染出來的字串**
 * ═══════════════════════════════════════════════════════════════════════════
 * 比較兩次 `buildRoundVictory` 的回傳值不夠 —— 值一樣而畫面印別的東西是形態⑤。
 * 這裡三條都把兩次結果各自 `renderToStaticMarkup` 一遍再比,大字母、每個人的
 * `+N` 分、團隊累積積分全部含在那個字串裡。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 突變紀錄(2026-07-30 實際跑過,見回報)
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. 把讀寫改回**同一格**(`roundVictoryBaseline` 讀 `get(0)`、
 *     `commitRoundVictory` 寫 `set(0, snap)`)—— 這就是修好之前的語意
 *       ⇒ 6 條裡 4 條紅,包含「重算不會把已經記好的那一筆積分改小」
 *  2. `commitRoundVictory` 拿掉 `matchId !== memoryMatchId` 那個 `clear()`
 *       ⇒「上一場留下的回合格子不會在新的一場被讀到」紅(只有這一條)
 *  3. `commitRoundVictory` 前面加回 `if (model.ledgerEntries.length === 0) return;`
 *       ⇒「輪空的回合也要記水位」紅(只有這一條)
 *
 * 另外量過一個**不夠**的突變:只把讀改成 `get(round)`(寫仍是 `set(round)`)
 * ⇒ 殭屍差從頭到尾恆為 0,兩次渲染因此「一致地錯」,`重算不會把已經記好的
 * 那一筆積分改小` 反而綠 —— 所以那一條的價值來自 §1 的完整重現,不是它自己。
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { buildRoundVictory, type RoundVictorySeat } from "./roundVictory";
import {
  RoundVictoryView,
  commitRoundVictory,
  resetRoundVictoryMemory,
  roundVictoryBaseline,
} from "./RoundVictoryPanel";
import { teamLedger, teamStandings } from "./teamLedger";

const MATCH = "m-1";

function seat(over: Partial<RoundVictorySeat> = {}): RoundVictorySeat {
  return {
    seatId: 0,
    teamId: 0,
    championId: "thorne",
    displayName: "P0",
    roundKills: 1,
    roundDeaths: 0,
    alive: true,
    mobKills: 0,
    ...over,
  };
}

/**
 * 面板看到一份 HUD 快照時做的**全部**事情,順序和 `RoundVictoryPanel` 一樣:
 * useMemo 讀水位算模型 → effect 記帳 + 記水位。回傳畫面吐出來的字串。
 */
function feed(
  matchId: string,
  round: number,
  seats: readonly RoundVictorySeat[],
  outcome: number = ROUND_OUTCOME.WON,
): { html: string; letter: string | null; points: number | null } {
  const model = buildRoundVictory({
    matchId,
    round,
    localTeamId: 0,
    selfSeatId: 0,
    outcome,
    seats,
    prevMobKills: roundVictoryBaseline(matchId, round),
  });
  commitRoundVictory(matchId, round, model, seats);
  const html = renderToStaticMarkup(
    createElement(RoundVictoryView, {
      model,
      standings: teamStandings(),
      localTeamId: 0,
      roundsSeen: teamLedger.roundsSeen(),
    }),
  );
  return { html, letter: model.grade?.grade ?? null, points: model.self?.points ?? null };
}

/** 只算模型 + 渲染,**不**記帳 —— 模擬 useMemo 在同一回合被重跑一次。 */
function rerender(
  matchId: string,
  round: number,
  seats: readonly RoundVictorySeat[],
  outcome: number = ROUND_OUTCOME.WON,
): string {
  const model = buildRoundVictory({
    matchId,
    round,
    localTeamId: 0,
    selfSeatId: 0,
    outcome,
    seats,
    prevMobKills: roundVictoryBaseline(matchId, round),
  });
  return renderToStaticMarkup(
    createElement(RoundVictoryView, {
      model,
      standings: teamStandings(),
      localTeamId: 0,
      roundsSeen: teamLedger.roundsSeen(),
    }),
  );
}

beforeEach(() => {
  teamLedger.clear();
  resetRoundVictoryMemory();
});

describe("同一回合重算,殭屍差不會被自己的水位吃掉", () => {
  it("面板重算之後,大字母與積分完全沒變", () => {
    // 第 2 回合結束時累積 25 隻 —— 這就是第 3 回合的基準。
    feed(MATCH, 2, [seat({ mobKills: 25 })]);

    const third = [seat({ mobKills: 40, roundKills: 2 })];
    const first = feed(MATCH, 3, third);
    // 這一回合真的算到了 15 隻(不是 0,也不是整場的 40)
    expect(roundVictoryBaseline(MATCH, 3)).toEqual({ 0: 25 });
    expect(first.points).toBeGreaterThan(0);

    // resolution 有 5 秒,sim 照跑 → seats 換了一份(回血/冷卻動了,殭屍數沒動)
    const again = rerender(MATCH, 3, [seat({ mobKills: 40, roundKills: 2 })]);
    expect(
      again,
      "同一回合重算之後畫面變了 —— 水位被自己寫掉,殭屍差歸零",
    ).toBe(first.html);
  });

  it("重算不會把已經記好的那一筆積分改小", () => {
    feed(MATCH, 2, [seat({ mobKills: 25 })]);
    const third = [seat({ mobKills: 40, roundKills: 2 })];
    feed(MATCH, 3, third);
    const booked = teamLedger.entriesFor(3).map((e) => e.points);

    // 面板的 effect 在同一回合被 React 重跑(依賴變了)
    const model = buildRoundVictory({
      matchId: MATCH,
      round: 3,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.WON,
      seats: third,
      prevMobKills: roundVictoryBaseline(MATCH, 3),
    });
    commitRoundVictory(MATCH, 3, model, third);

    expect(
      teamLedger.entriesFor(3).map((e) => e.points),
      "同一回合再記一次之後,帳上的分數變了",
    ).toEqual(booked);
    expect(teamLedger.roundsSeen()).toBe(2);
  });

  it("水位確實往前推 —— 下一回合拿到的是這一回合的結束值", () => {
    feed(MATCH, 2, [seat({ mobKills: 25 })]);
    feed(MATCH, 3, [seat({ mobKills: 40 })]);
    expect(roundVictoryBaseline(MATCH, 4)).toEqual({ 0: 40 });
    // …而第 3 回合自己讀到的仍然是第 2 回合的值(讀寫不同格)
    expect(roundVictoryBaseline(MATCH, 3)).toEqual({ 0: 25 });
  });
});

describe("換一場不會沿用上一場的水位", () => {
  it("新的一場沒有前值 → 差為 0,不是拿上一場的格子去減", () => {
    feed(MATCH, 1, [seat({ mobKills: 3 })]);
    feed(MATCH, 2, [seat({ mobKills: 5 })]);

    // 新的一場,前兩回合玩家在觀戰/輪空,面板沒掛上 → 第 3 回合才第一次記
    const other = "m-2";
    expect(
      roundVictoryBaseline(other, 3),
      "新的一場讀到了上一場第 2 回合的水位",
    ).toEqual({});

    const zombieOnly = [seat({ mobKills: 9, roundKills: 0, roundDeaths: 0 })];
    const fresh = feed(other, 3, zombieOnly);
    // 前值不明 → 殭屍那一軸不給分(寧可少算)
    const withPrev = buildRoundVictory({
      matchId: other,
      round: 3,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.WON,
      seats: zombieOnly,
      prevMobKills: { 0: 5 },
    });
    expect(withPrev.self!.points).toBeGreaterThan(fresh.points!);
  });

  it("上一場留下的回合格子不會在新的一場被讀到", () => {
    // 這一條守的是 `commitRoundVictory` 裡的 clear。光靠讀取端的 matchId 比對
    // 不夠:新的一場一旦記過任何一個回合,`memoryMatchId` 就換成新的了,而上
    // 一場留在 `round` 那些鍵上的水位會**原地變成可讀的**。
    feed(MATCH, 1, [seat({ mobKills: 1 })]);
    feed(MATCH, 2, [seat({ mobKills: 2 })]);
    feed(MATCH, 3, [seat({ mobKills: 2 })]); // 上一場第 3 回合的水位 = 2

    // 新的一場:第 1 回合有掛上,第 2、3 回合玩家在觀戰/斷線,面板沒記到
    feed("m-2", 1, [seat({ mobKills: 0 })]);
    expect(teamLedger.roundsSeen()).toBe(1); // 上一場的三回合沒有跟過來

    const late = [seat({ mobKills: 9, roundKills: 0, roundDeaths: 0 })];
    expect(
      roundVictoryBaseline("m-2", 4),
      "第 4 回合讀到了上一場第 3 回合的水位",
    ).toEqual({});

    // 畫面上的分數必須是「殭屍不計分」的那一個,不是憑空多出 7 隻的那一個
    const shown = feed("m-2", 4, late);
    const leaked = buildRoundVictory({
      matchId: "m-2",
      round: 4,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.WON,
      seats: late,
      prevMobKills: { 0: 2 }, // 上一場留下的那一格
    });
    expect(leaked.self!.points).toBeGreaterThan(shown.points!);
    expect(shown.html).toContain(`+${shown.points}`);
  });
});

describe("不評分的回合也要記水位", () => {
  it("輪空的回合記過水位,下一回合的殭屍差才算得出來", () => {
    // 輪空 → 不評分、不進帳(#173),但**別人照樣在殺殭屍**
    const bye = feed(MATCH, 2, [seat({ mobKills: 25 })], ROUND_OUTCOME.NONE);
    expect(bye.letter).toBeNull();
    expect(teamLedger.entriesFor(2)).toHaveLength(0);

    // 下一回合必須拿得到 25,否則整隊的 objective 軸憑空歸零
    expect(
      roundVictoryBaseline(MATCH, 3),
      "輪空的回合沒有記水位 —— 下一回合會把整場的擊殺算成 0",
    ).toEqual({ 0: 25 });

    const third = feed(MATCH, 3, [seat({ mobKills: 40, roundKills: 0 })]);
    const blind = buildRoundVictory({
      matchId: MATCH,
      round: 3,
      localTeamId: 0,
      selfSeatId: 0,
      outcome: ROUND_OUTCOME.WON,
      seats: [seat({ mobKills: 40, roundKills: 0 })],
      prevMobKills: {},
    });
    expect(third.points!).toBeGreaterThan(blind.self!.points);
    // 而且畫面上那個 +N 真的是大的那一個
    expect(third.html).toContain(`+${third.points}`);
  });
});
