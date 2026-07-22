/**
 * Combat-env protocol plumbing (task #28 foundation): the MatchState
 * combatEnvJson field must encode/decode through @colyseus/schema (the
 * declare-fields + constructor-assign pattern — see schema.ts header + the
 * match-13 regression), the decoded JSON must parse back into the exact
 * multiplier table, and the MatchController ctor must inject the table into
 * SimWorld before tick 0.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { Encoder, Decoder } from "@colyseus/schema";
import { MatchState } from "@ggd/shared/protocol/schema";
import {
  DEFAULT_COMBAT_ENV,
  normalizeCombatEnv,
  parseCombatEnvJson,
} from "@ggd/shared/sim/combatEnv";
import { MatchController } from "../match/MatchController";
import { DEFAULT_PHASE_CONFIG } from "../match/PhaseMachine";
import { DEFAULT_ARENA_RULES } from "../match/arenaRules";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { Whitelist } from "../curation/whitelist";
import { projectSnapshot } from "./snapshot";

const seats = Array.from({ length: 12 }, (_, i) => ({
  seatId: i,
  teamId: Math.floor(i / 3),
  isBot: true,
}));

describe("combat-env schema round-trip (env-12)", () => {
  it("combatEnvJson encodes, decodes and parses back to the same table", () => {
    cover("combat-env-encode");
    const table = normalizeCombatEnv({ damageDealt: 1.5, cooldown: 0.5, moveSpeed: 1.25 });

    const state = new MatchState();
    const encoder = new Encoder(state);
    // exactly what MatchRoom.onCreate does next to `this.state.seed = seed`
    state.combatEnvJson = JSON.stringify(table);

    const full = encoder.encodeAll();
    expect(full.byteLength).toBeGreaterThan(0);

    const decoded = new MatchState();
    new Decoder(decoded).decode(full);
    expect(decoded.combatEnvJson).toBe(JSON.stringify(table));
    expect(parseCombatEnvJson(decoded.combatEnvJson)).toEqual(table);

    // a fresh (never-assigned) state decodes to "" -> neutral table
    expect(parseCombatEnvJson(new MatchState().combatEnvJson)).toEqual(DEFAULT_COMBAT_ENV);
  });

  it("a fully-projected MatchState still encodes with the new field (match-13 guard)", () => {
    cover("combat-env-encode-projected");
    const ctl = new MatchController("enc-env", 42, seats, {
      champSelectTicks: 5,
      intermissionTicks: 30,
      combatMaxTicks: 1200,
      resolutionTicks: 5,
    });
    while (ctl.phase.phase !== "combat") ctl.tick();
    for (let i = 0; i < 30; i++) ctl.tick();

    const state = new MatchState();
    const encoder = new Encoder(state);
    state.combatEnvJson = JSON.stringify(ctl.combatEnv);
    projectSnapshot(ctl, state, new Map());

    const full = encoder.encodeAll();
    const decoded = new MatchState();
    new Decoder(decoded).decode(full);
    expect(decoded.phase).toBe("combat");
    expect(parseCombatEnvJson(decoded.combatEnvJson)).toEqual(DEFAULT_COMBAT_ENV);
  });

  it("MatchController injects the table into SimWorld before tick 0 (env-13)", () => {
    cover("combat-env-controller-inject");
    const table = normalizeCombatEnv({ attackSpeed: 2, healing: 0.5 });
    const ctl = new MatchController(
      "env-inject",
      7,
      seats,
      DEFAULT_PHASE_CONFIG,
      3,
      DEFAULT_ARENA_RULES,
      SKELETON_ARENA,
      Whitelist.allowAll(),
      table,
    );
    expect(ctl.combatEnv).toBe(table);
    expect(ctl.world.combatEnv).toBe(table);
    expect(ctl.world.tick).toBe(0);

    // default ctor arg stays the neutral table (legacy call sites unchanged)
    const legacy = new MatchController("env-default", 7, seats);
    expect(legacy.world.combatEnv).toBe(DEFAULT_COMBAT_ENV);
  });
});
