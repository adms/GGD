import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ContentLoader, registerAll, zConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { MatchController, type SeatSpec } from "/Users/Takuro/GGD/apps/game-server/src/match/MatchController";
import { rulesFromDoc } from "/Users/Takuro/GGD/apps/game-server/src/match/arenaRules";

const CONTENT_DIR = "/Users/Takuro/GGD/content";
const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

it("scan", async () => {
  const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(result.store);
  const doc = zConfigArenaRulesDoc.parse(
    JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf8")),
  );
  const ARENA = rulesFromDoc(doc);
  let round = -1;
  for (const [r, g] of [...ARENA.rounds.entries()].sort((a, b) => a[0] - b[0])) {
    if (g.augmentTier && g.weaponLootTable) { round = r; break; }
  }
  const ok: number[] = [];
  for (let seed = 555; seed <= 640; seed++) {
    const ctl = new MatchController(`arena-${seed}`, seed, allBots(), FAST, 3, ARENA);
    let n = 0;
    while (!(ctl.phase.phase === "intermission" && ctl.phase.round === round) && n++ < 60000) ctl.tick();
    if (!(ctl.phase.phase === "intermission" && ctl.phase.round === round)) continue;
    let good = true, checked = 0;
    for (const seat of ctl.seats.values()) {
      if ((ctl.lives.get(seat.teamId) ?? 0) <= 0) continue;
      const grail = ctl.offers.get(`${round}:${seat.seatId}`);
      if (!grail || grail.kind !== "augment" || ctl.offers.get(`${round}:${seat.seatId}:w`)) { good = false; break; }
      checked++;
    }
    if (good && checked > 0) { ok.push(seed); if (ok.length >= 3) break; }
  }
  console.log("CONFLICT_ROUND", round, "GOOD_SEEDS", JSON.stringify(ok));
  expect(ok.length).toBeGreaterThan(0);
}, 600000);
