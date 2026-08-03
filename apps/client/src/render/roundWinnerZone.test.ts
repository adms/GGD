/**
 * GH#265 —— **配對式**守衛:客戶端頒獎台上的那一隊 == 伺服器為這一區記下的那一隊。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼既有的測試全綠而這個 bug 還在
 * ═══════════════════════════════════════════════════════════════════════════
 * 兩邊各自都有守衛,而且兩邊都是綠的:
 *
 *   伺服器逐區記下勝負          ← game-server/src/match/roundEnd.test.ts
 *   snapshot 把它鏡上 MatchState ← game-server/src/net/duelSnapshot.test.ts
 *   客戶端頒獎台排名次 / 掛皇冠  ← client/src/render/roundWinnerPlan.test.ts
 *   ────────────────────────────
 *   **兩個答案是不是同一個** ← 沒有人守
 *
 * 這正是 CLAUDE.md 那條「後置條件只驗名詞抓不到相容性故障」的形狀:每一項都在
 * 驗一個名詞,沒有一項在驗兩個名詞之間的**關係**。而壞掉的就是那個關係 ——
 * 頒獎台從來沒讀過 `MatchState.duels`,它拿 seats/teams **重新推導**了一次。
 *
 * 分岔是必然的,因為兩者回答的不是同一題:伺服器答「**這一區**誰贏」(一回合兩個
 * 答案),`roundLeaderChampion` 答「所有 WON 裡**戰績最好**的那一隊」(一個答案)。
 * 4 隊 2 區時兩隊都是 WON → 排序挑走命比較多的那一隊 → owner 2026-08-03:
 * 「為什麼我最後活著 勝利的還是顯示別的隊伍」。
 *
 * ⚠️ 資料刻意做成**兩個答案不一樣**:本機玩家在 zone 0、隊 1(命 1)贏了自己那一場;
 * zone 1 由隊 2(命 3)贏。任何「自己推導」的實作都會挑隊 2,而正確答案是隊 1。
 * 所以這一支對「修好的」與「壞掉的」實作給出相反的結果(避開失敗形態 ④)。
 *
 * ⚠️ 而且它走的是**出貨的那一份投影**(失敗形態 ⑤):`syncHudFromState` 真的跑,
 * `localDuelZone` 真的算,`planRoundWinnerShow` 真的挑 —— 沒有任何一格是手刻的
 * 「假裝伺服器說隊 1 贏」。RoomStore 少抄一欄 `winner`、GameApp 少傳一個引數,
 * 這裡都會紅。
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { ModelDoc } from "@ggd/shared/content";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { hudStore, localDuelZone, resetHudStore, syncHudFromState } from "../net/RoomStore";
import { planRoundWinnerShow } from "./RoundWinnerStage";

const DOC = { modelKey: "champ.test", url: "/x.glb" } as unknown as ModelDoc;

/** 一個座位 + 它那顆還在快照裡的實體(死了也留著,所以 zone 仍然讀得到)。 */
function seatState(o: {
  seatId: number;
  teamId: number;
  championId: string;
  roundDeathTick?: number;
  roundKills?: number;
}) {
  return {
    accountId: `acct-${o.seatId}`,
    seatId: o.seatId,
    teamId: o.teamId,
    displayName: `p${o.seatId}`,
    connected: true,
    driver: "human",
    championId: o.championId,
    entityId: 100 + o.seatId,
    level: 1,
    gold: 0,
    xp: 0,
    ready: true,
    unspentPoints: 0,
    items: [],
    augments: [],
    abilityRanks: [],
    cooldowns: [],
    exAbilityId: "",
    exRank: 0,
    exCooldown: 0,
    passiveCooldown: 0,
    statStacks: 0,
    statCapstonePct: 0,
    attrBonus: [],
    statusIds: [],
    statusRemainTicks: [],
    undoDepth: 0,
    roundKills: o.roundKills ?? 0,
    roundDeaths: 0,
    coinsLeft: 0,
    mobKills: 0,
    offers: [],
    roundDeathTick: o.roundDeathTick ?? 0,
  };
}

function entityState(seatId: number, zone: number, alive: boolean) {
  return {
    id: 100 + seatId,
    kind: 1,
    zone,
    alive,
    hp: alive ? 500 : 0,
    maxHp: 500,
    mana: 0,
    maxMana: 0,
    shield: 0,
    flags: 0,
  };
}

/**
 * 一份**四隊兩區**的結算快照。
 *
 *   zone 0 —— 隊 0 vs 隊 1,伺服器記下 **隊 1** 贏(本機玩家 seat 2 在這裡,還活著)
 *   zone 1 —— 隊 2 vs 隊 3,伺服器記下 **隊 2** 贏
 *
 * 兩隊的 `roundOutcome` 都是 `WON`(伺服器 settleRound 就是這樣寫的),而隊 2
 * 的 `lives` 比較多 —— 所以「自己推導」的路徑會挑隊 2。
 */
function fourTeamTwoZoneState(): MatchState {
  const seats = new Map<string, ReturnType<typeof seatState>>();
  const entities = new Map<string, ReturnType<typeof entityState>>();
  const rows: Array<[ReturnType<typeof seatState>, number, boolean]> = [
    // zone 0 —— 敗方隊 0
    [seatState({ seatId: 0, teamId: 0, championId: "z0-lose-a", roundDeathTick: 300 }), 0, false],
    [seatState({ seatId: 1, teamId: 0, championId: "z0-lose-b", roundDeathTick: 200 }), 0, false],
    // zone 0 —— 勝方隊 1,本機玩家(seat 2)最後活著
    [seatState({ seatId: 2, teamId: 1, championId: "z0-win-me" }), 0, true],
    [seatState({ seatId: 3, teamId: 1, championId: "z0-win-mate", roundDeathTick: 250 }), 0, false],
    // zone 1 —— 敗方隊 3
    [seatState({ seatId: 4, teamId: 3, championId: "z1-lose" }), 1, false],
    // zone 1 —— 勝方隊 2(命比較多,所以推導路徑會挑它)
    [seatState({ seatId: 5, teamId: 2, championId: "z1-win-a" }), 1, true],
    [seatState({ seatId: 6, teamId: 2, championId: "z1-win-b" }), 1, true],
  ];
  for (const [s, zone, alive] of rows) {
    seats.set(String(s.seatId), s);
    entities.set(String(s.entityId), entityState(s.seatId, zone, alive));
  }
  return {
    matchId: "m_gh265",
    phase: "resolution",
    round: 4,
    tick: 1200,
    phaseTicksLeft: 90,
    seed: 1,
    combatEnvJson: "",
    baseBonusJson: "",
    statCapsJson: "",
    mobVisualJson: "",
    fireRingTicks: 0,
    fireRingRadius: 0,
    seats,
    entities,
    teams: [
      { teamId: 0, lives: 2, eliminated: false, placement: 0, roundOutcome: ROUND_OUTCOME.LOST },
      { teamId: 1, lives: 1, eliminated: false, placement: 0, roundOutcome: ROUND_OUTCOME.WON },
      { teamId: 2, lives: 3, eliminated: false, placement: 0, roundOutcome: ROUND_OUTCOME.WON },
      { teamId: 3, lives: 2, eliminated: false, placement: 0, roundOutcome: ROUND_OUTCOME.LOST },
    ],
    duels: [
      { zone: 0, teamA: 0, teamB: 1, winner: 1 },
      { zone: 1, teamA: 2, teamB: 3, winner: 2 },
    ],
  } as unknown as MatchState;
}

/** `GameApp.updateRoundWinner` 做的事,原封不動:hudStore → plan。 */
function plan() {
  const hud = hudStore.getState();
  return planRoundWinnerShow(hud.seats, hud.teams, hud.round, () => DOC, {
    duels: hud.duels,
    zone: localDuelZone(hud),
  });
}

/** 上台的每一位屬於哪一隊(照 hudStore 的座位表反查)。 */
function shownTeamIds(): number[] {
  const p = plan();
  const seats = hudStore.getState().seats;
  return (p?.members ?? []).map(
    (m) => seats.find((s) => s.championId === m.championId)?.teamId ?? -1,
  );
}

beforeEach(() => resetHudStore());

describe("回合勝利顯示的是伺服器記下的那一隊 (round-winner-zone-agreement)", () => {
  it("★ 上台的那一隊 == `duels[我這一區].winner`,不是戰績最好的那一隊", () => {
    syncHudFromState(fourTeamTwoZoneState(), "acct-2"); // 本機 = seat 2,zone 0,隊 1
    const hud = hudStore.getState();
    const myZone = localDuelZone(hud);
    const authoritative = hud.duels.find((d) => d.zone === myZone)!.winner;

    // 這條就是配對:左邊是畫面,右邊是伺服器。兩邊都是算出來的,沒有寫死的數字。
    expect(new Set(shownTeamIds())).toEqual(new Set([authoritative]));

    // 反向斷言 —— 壞掉的實作演的正是隊 2(命 3,排序贏過隊 1)。
    expect(shownTeamIds()).not.toContain(2);
    expect(plan()!.members.map((m) => m.championId)).not.toContain("z1-win-a");
  });

  it("嘲諷的 championId 也在同一隊 —— 模型與語音不會各講各的", () => {
    syncHudFromState(fourTeamTwoZoneState(), "acct-2");
    const hud = hudStore.getState();
    const winner = hud.duels.find((d) => d.zone === localDuelZone(hud))!.winner;
    const quoted = plan()!.ctx.championId;
    expect(hud.seats.find((s) => s.championId === quoted)?.teamId).toBe(winner);
  });

  it("沒有權威答案時仍然照舊演,不是空舞台(fail-open 的退路還在)", () => {
    const state = fourTeamTwoZoneState();
    (state as unknown as { duels: unknown[] }).duels = []; // 決賽單場 / 舊快照
    syncHudFromState(state, "acct-2");
    const p = plan();
    expect(p).not.toBeNull();
    expect(p!.members.length).toBeGreaterThan(0);
  });
});
