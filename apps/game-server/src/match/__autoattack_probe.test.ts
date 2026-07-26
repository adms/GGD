/**
 * AUTO-ATTACK LIVE-PATH PROBE (forensics, task #265).
 *
 * Owner: 「Saber 似乎不會自動攻擊？」. #221 shipped and its unit tests are green,
 * so this probe drives the REAL live path instead: a real MatchController match
 * with the shipped combat-env, one seat swapped to a HumanDriver, and the
 * order stream a real client would produce fed into that seat's mailbox.
 */
import { describe, it, beforeAll, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCombatEnv, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { asSeatId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import type { FireRingConfig } from "@ggd/shared/content";
import { MatchController, type SeatSpec } from "./MatchController";
import { HumanDriver } from "../seat/HumanDriver";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../..", "content");

let ENV: CombatEnvMultipliers;
let FR: FireRingConfig;
let COMBAT_MAX_SEC = 180;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  const doc = JSON.parse(readFileSync(join(CONTENT, "config/config.match.json"), "utf8")) as {
    match: { fireRing: FireRingConfig; combatMaxSec: number };
  };
  FR = doc.match.fireRing;
  COMBAT_MAX_SEC = doc.match.combatMaxSec;
  ENV = normalizeCombatEnv(
    (JSON.parse(readFileSync(join(CONTENT, "config/combat-env.json"), "utf8")) as {
      multipliers: Record<string, number>;
    }).multipliers,
  );
});

const SABER = "godie-e002" as ChampionId;

function seats(champ: ChampionId): SeatSpec[] {
  return Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: i !== 0,
    championId: i === 0 ? champ : undefined,
  }));
}

type Feed = "idle" | "stick" | "clickOutside" | "attackMoveStick";

function runMatch(feed: Feed, seed = 7919): {
  humanBasics: number;
  humanAcquiredTicks: number;
  ticks: number;
  botBasicsAvg: number;
  humanChampion: string;
} {
  const cfg = {
    champSelectTicks: 2,
    intermissionTicks: 3,
    combatMaxTicks: COMBAT_MAX_SEC * 30,
    resolutionTicks: 3,
  };
  const ctl = new MatchController(
    "aa-" + feed,
    seed,
    seats(SABER),
    cfg,
    undefined,
    undefined,
    undefined,
    undefined,
    ENV,
    FR,
  );
  const human = new HumanDriver();
  ctl.seats.get(asSeatId(0))!.setDriver(human);
  while (ctl.phase.phase !== "combat") ctl.tick();

  const meSeat = ctl.seats.get(asSeatId(0))!;
  const me = meSeat.entityId as EntityId | null;
  const humanChampion = String(meSeat.championId ?? "");

  let humanBasics = 0;
  let acquired = 0;
  const botBasics = new Map<EntityId, number>();
  let ticks = 0;
  let g = 0;
  let firedOnce = false;
  while (ctl.phase.phase === "combat" && g++ < 20000) {
    if (feed === "clickOutside" && me !== null && !firedOnce) {
      // ONE mouse right-click on ground the champion can never stand on:
      // InputCapture.mapRightClick -> { kind:"move", point }. MovementSystem
      // clamps the body to the zone boundary, so the ARRIVE_EPS test in
      // OrderSystem never fires and `nav.order` stays `move` forever.
      firedOnce = true;
      human.mailbox.push({ order: { kind: "move", point: { x: 400, z: 400 } } } as never);
    }
    if (feed === "attackMoveStick" && me !== null) {
      const t = ctl.world.transform.get(me);
      if (t) {
        human.mailbox.push({
          order: { kind: "attackMove", point: { x: t.pos.x + 4, z: t.pos.z } },
        } as never);
      }
    }
    if (feed === "stick" && me !== null) {
      // GamepadInput.ts:194 / TouchInput.ts:96 — the left stick / virtual
      // joystick emits a fresh `move` order MOVE_LEAD (4u) ahead EVERY FRAME
      // it is deflected, and the client's IntentSender flushes at 30 Hz.
      const t = ctl.world.transform.get(me);
      if (t) {
        human.mailbox.push({
          order: { kind: "move", point: { x: t.pos.x + 4, z: t.pos.z } },
        } as never);
      }
    }
    ctl.tick();
    ticks++;
    if (me !== null && ctl.world.nav.get(me)?.attackTarget != null) acquired++;
    for (const e of ctl.world.events) {
      if (e.type !== "damage") continue;
      const d = e.data as { source?: EntityId; origin?: string };
      if (d.origin !== "basic" || d.source === undefined) continue;
      if (d.source === me) humanBasics++;
      else botBasics.set(d.source, (botBasics.get(d.source) ?? 0) + 1);
    }
  }
  const vals = [...botBasics.values()];
  return {
    humanBasics,
    humanAcquiredTicks: acquired,
    ticks,
    botBasicsAvg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
    humanChampion,
  };
}

describe("auto-attack, live match path", () => {
  it("B1 — an IDLE human seat (no input at all) on Saber", () => {
    const r = runMatch("idle");
    console.log(
      `B1 idle human: champion=${r.humanChampion} basicHits=${r.humanBasics} heldTargetTicks=${r.humanAcquiredTicks}/${r.ticks} (${(
        (100 * r.humanAcquiredTicks) / Math.max(1, r.ticks)
      ).toFixed(1)}%) | bot average basicHits=${r.botBasicsAvg.toFixed(1)}`,
    );
    expect(r.humanChampion).toBe(SABER);
  }, 300_000);

  it("B2 — the SAME seat while the movement stick is held (continuous move order)", () => {
    const r = runMatch("stick");
    console.log(
      `B2 stick-held human: champion=${r.humanChampion} basicHits=${r.humanBasics} heldTargetTicks=${r.humanAcquiredTicks}/${r.ticks} (${(
        (100 * r.humanAcquiredTicks) / Math.max(1, r.ticks)
      ).toFixed(1)}%) | bot average basicHits=${r.botBasicsAvg.toFixed(1)}`,
    );
  }, 300_000);

  it("B3 — ONE mouse right-click on unreachable ground, then nothing", () => {
    const r = runMatch("clickOutside");
    console.log(
      `B3 one-bad-right-click human: basicHits=${r.humanBasics} heldTargetTicks=${r.humanAcquiredTicks}/${r.ticks} (${(
        (100 * r.humanAcquiredTicks) / Math.max(1, r.ticks)
      ).toFixed(1)}%) | bot average basicHits=${r.botBasicsAvg.toFixed(1)}`,
    );
  }, 300_000);

  it("B4 — the same continuous stream, but as ATTACK-MOVE instead of move", () => {
    const r = runMatch("attackMoveStick");
    console.log(
      `B4 attackMove-held human: basicHits=${r.humanBasics} heldTargetTicks=${r.humanAcquiredTicks}/${r.ticks} (${(
        (100 * r.humanAcquiredTicks) / Math.max(1, r.ticks)
      ).toFixed(1)}%) | bot average basicHits=${r.botBasicsAvg.toFixed(1)}`,
    );
  }, 300_000);
});
