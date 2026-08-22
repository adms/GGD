/**
 * Victory settlement: control-freeze once the outcome is decided + the match-end
 * payload (per-player scoreboard / grade / rank / winner) — settle-06..settle-08.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asSeatId, asTeamId } from "@ggd/shared/ids";
import { GRADES } from "@ggd/shared/sim/stats/rating";
import { MatchState, ROUND_OUTCOME } from "@ggd/shared/protocol/schema";
import { Configs } from "@ggd/shared/content";
import { zConfigMatchDoc } from "@ggd/shared/content/schema/config";
import {
  DEFAULT_SETTLEMENT_CARD_ON_HEALTH_SPENT,
  MatchController,
  settlementCardOnHealthSpentFromDoc,
  type SeatSpec,
} from "./MatchController";
import { projectSnapshot } from "../net/snapshot";
import { HumanDriver } from "../seat/HumanDriver";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** Tick until the match outcome latches (final combat over), or the guard trips. */
function runToDecided(ctl: MatchController, guard = 60000): number {
  let n = 0;
  while (!ctl.outcomeDecided && n < guard) {
    ctl.tick();
    n++;
  }
  return n;
}

function runToEnd(ctl: MatchController, guard = 60000): void {
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < guard) {
    ctl.tick();
    n++;
  }
}



/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Per-team settlement broadcast — 「什麼叫做被淘汰」 (task #193 / GH#264)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * #193 的中途結算卡本來掛在「團隊生命歸零」上，因為當時歸零**就是**出局。
 * owner 2026-07-27 取消淘汰之後兩者分家：歸零只是計分板見底，那一隊照樣打完
 * 十回合，**而且照樣可能奪冠**（第 1 名由決賽決定、不看團隊生命）。舊的觸發
 * 條件因此會對未來的冠軍送出一張 `winnerTeam: -1` 的「戰鬥結束」卡，而那張卡
 * 在客戶端直接附著「返回大廳」。
 *
 * 「那張卡什麼時候該發」是一個**決策點**，所以它是一個後台欄位
 * （`config.match@1` 的 `match.settlementCardOnHealthSpent`），不是一行寫死的
 * 判斷。下面兩條分別跑兩個模式的**機制**，不是抄任何一個出貨數字。
 *
 * ⚠️ 這兩條都用 `Configs.register` 把文件推進真正的解析路徑（內容 → Zod 的鍵
 * → `settlementCardOnHealthSpentFromDoc` → 建構子預設值），不是手寫一個旗標塞
 * 進控制器 —— 手寫的那種版本對「欄位根本沒接上」是全綠的（失敗形態 ⑤）。
 */
const HERE = dirname(fileURLToPath(import.meta.url));
/** 出貨的那一份 `config.match.json` —— 被測的必須是出貨的那個。 */
const SHIPPED_MATCH_DOC = JSON.parse(
  readFileSync(join(HERE, "../../../../content/config/config.match.json"), "utf8"),
) as Record<string, unknown>;

/** 出貨文件 + 一個覆寫過的 `settlementCardOnHealthSpent`。 */
function matchDocWithCard(on: boolean): Record<string, unknown> {
  const m = SHIPPED_MATCH_DOC.match as Record<string, unknown>;
  return { ...SHIPPED_MATCH_DOC, match: { ...m, settlementCardOnHealthSpent: on } };
}

interface MatchRun {
  ctl: MatchController;
  broadcasts: { teamId: number; winnerTeam: number; players: number }[];
  /** 整場之中**曾經**把團隊生命打到 0 的隊伍（每 tick 取樣，升序）。 */
  spent: number[];
  /** 第 1 名（決賽的勝者）。 */
  winner: number;
  /** 第 2 名 —— 舊斷言裡的 “decider”。 */
  runnerUp: number;
}

/** 跑完一整場，把中途廣播與「誰的血曾經歸零」一起收下來。 */
function runFullMatch(matchId: string, seed: number, doc: Record<string, unknown>): MatchRun {
  Configs.register(doc as never);
  const ctl = new MatchController(matchId, seed, allBots(), FAST);
  const broadcasts: MatchRun["broadcasts"] = [];
  const spent = new Set<number>();
  let n = 0;
  while (ctl.phase.phase !== "matchEnd" && n < 60000) {
    ctl.tick();
    for (const [teamId, hp] of ctl.lives) if (hp <= 0) spent.add(teamId as number);
    for (const es of ctl.takeEliminationSettlements()) {
      broadcasts.push({
        teamId: es.teamId,
        winnerTeam: es.settlement.winnerTeam,
        players: es.settlement.perPlayer.length,
      });
    }
    n++;
  }
  expect(ctl.phase.phase).toBe("matchEnd");
  const place = (p: number): number =>
    [...ctl.placements.entries()].find(([, v]) => v === p)![0] as number;
  return { ctl, broadcasts, spent: [...spent].sort((a, b) => a - b), winner: place(1), runnerUp: place(2) };
}


/**
 * The per-ROUND K/D tallies behind the round-end winner presentation (the #143
 * model + #142 VO). The bug they fix: the client used to present the leading
 * team's LOWEST-SEATID champion, and seat↔champion is fixed for a whole match,
 * so every round showed the same hero. The tallies must therefore be per-round
 * (a cumulative one would just re-pin the match's best killer) and they must be
 * on the wire, because a reconnecting client's own death-event tally is partial.
 */

/**
 * round-mvp-bye — the residual of the round-MVP fix above. With 3 alive teams
 * the format hands one team a BYE, and enterCombat parks EVERY seat dead before
 * reviving only the seats belonging to a pairing. The bye team therefore ends
 * the round alive:false / roundKills:0 / roundDeaths:0 — byte-identical to a
 * team that was instantly wiped, and it never even emits a death event (the
 * parking mutates hp directly). If it happened to lead the standings, the
 * presentation picked it, found no survivors and no scorers, and degenerated to
 * its lowest seatId: 「每回合都是同一個英雄」 for that round.
 *
 * TeamState.roundOutcome is the signal that closes it: NONE at combat entry,
 * FOUGHT where enterCombat places a team into a duel zone, WON/LOST at
 * settleRound. The bye team is the only one that never leaves NONE.
 */

/**
 * round-win-counter (task #93) — TeamState.roundWins is what the client's
 * victory gate (vfx/victoryTrigger) edge-detects to fire the SMALL round-win
 * firework. It was declared in the schema and read by the client but never
 * written by anything on the server, so that half of the round beat could not
 * fire at all. These pin the three properties the gate depends on: it rises on
 * a duel win, it is projected on the wire, and it is NEVER reset mid-match.
 */

describe("seed scan (temp)", () => {
  it("scan", () => {
    const hits: number[] = [];
    for (let seed = 4200; seed < 4400 && hits.length < 8; seed++) {
      const run = runFullMatch(`scan${seed}`, seed, matchDocWithCard(false));
      if (run.spent.length >= 1 && run.spent.includes(run.winner)) hits.push(seed);
    }
    console.log("HITS=" + JSON.stringify(hits));
  }, 3000000);
});
