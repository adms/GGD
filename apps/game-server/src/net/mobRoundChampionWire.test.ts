/**
 * 「第 N 回合由誰擔任」 REALLY PUTS THAT CHAMPION'S FACE ON THE FIELD (GH#191).
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 *
 * `mobWaves.schedule[].championId` shipped as an admin-editable column whose own
 * schema comment admitted 「AUTHORED BUT NOT YET CONSUMED」: `mobRulesFromConfig`
 * read `cfg.mob.championId` and had no per-round branch. An operator could set
 * 「第 3 回合由揍敵客擔任」, see it saved, see it echoed back by the console, and
 * play a match full of 喪標麥可. Failure shape ②, with a UI that lied about it.
 *
 * ── WHY THIS TEST IS SHAPED THIS WAY ───────────────────────────────────────
 *
 * ⑦ WOULD BE: `expect(cfg.schedule[0].championId).toBe("godie-efur")` — an
 * ATTRIBUTE of the config, true both before and after the fix.
 * ⑤ WOULD BE: asserting on `MobRules.modelKey` alone — the rules object is not
 * what a player sees, and #262 already proved a correct-looking key can render
 * the wrong thing.
 *
 * So this drives the SHIPPING PATH end to end: a real MatchController in combat,
 * `mobRulesFromConfig(cfg, dt, round)` exactly as MatchController calls it, a
 * real `spawnMob`, the real `projectSnapshot`, a real Colyseus encode/decode —
 * and asserts on the decoded `EntityState.key`, which is the only thing that
 * decides which mesh the client loads.
 *
 * THE DISCRIMINATING INPUT: round 3 has a schedule row naming a DIFFERENT
 * champion from the whole-match default, and round 4 has no row. A build with no
 * per-round branch renders the same face in both rounds and fails on line one; a
 * build that read the schedule but forgot the fallback fails on round 4.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Encoder, Decoder } from "@colyseus/schema";
import { fullStateBytes } from "../testkit/wireFullState";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController } from "../match/MatchController";
import { projectSnapshot } from "./snapshot";
import { MatchState, ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { DEFAULT_MOB_WAVES_CONFIG } from "@ggd/shared/content/schema/config";
import {
  mobRulesFromConfig,
  spawnMob,
  mobChampionForRound,
  MOB_CHAMPION_ID,
  type MobWavesConfigLike,
} from "@ggd/shared/sim/mobs";
import { beginCombatMobs } from "@ggd/shared/sim/systems/MobSystem";
import { Champions } from "@ggd/shared/sim/content/registry";
// `@ggd/shared/sim/content/types` does not exist — the module is `defs`. A
// type-only import is erased before vitest runs, so the broken specifier ran
// green in every suite and only `tsc --noEmit` saw it (verifier fix).
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId } from "@ggd/shared/ids";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1200, resolutionTicks: 5 };
const DT = 1 / 30;

/** A champion that is NOT the mob default, so the two answers differ. */
const GUEST = "godie-efur";

const CONTENT = join(__dirname, "../../../../content");

/**
 * Register the SHIPPED champion doc for `id`, read off disk.
 *
 * The game-server suite boots with `registerSkeletonContent`-style fixtures, not
 * the real roster, so the two ids this test contrasts are not present. Reading
 * the real docs (rather than inventing two fake modelKeys) keeps failure shape ⑤
 * closed: the mesh string this asserts on is the one the shipped content really
 * names for that champion.
 */
function registerShippedChampion(id: string): string {
  const doc = JSON.parse(readFileSync(join(CONTENT, "champions", `${id}.json`), "utf8")) as {
    modelKey: string;
    name: string;
    role: string;
    attackType: string;
    baseStats: unknown;
    growth: unknown;
  };
  Champions.register(id as ChampionId, {
    id: id as ChampionId,
    name: doc.name,
    role: doc.role,
    attackType: doc.attackType,
    modelKey: doc.modelKey,
    baseStats: doc.baseStats,
    growth: doc.growth,
    abilities: {},
    skillOrder: [],
    buildPriority: [],
    tags: [],
  } as unknown as ChampionDef);
  return doc.modelKey;
}

let defaultMesh = "";
let guestMesh = "";
beforeAll(() => {
  defaultMesh = registerShippedChampion(MOB_CHAMPION_ID);
  guestMesh = registerShippedChampion(GUEST);
});

/** The shipped block, plus 「第 3 回合由 GUEST 擔任」 and nothing else changed. */
const CFG: MobWavesConfigLike = {
  ...DEFAULT_MOB_WAVES_CONFIG,
  schedule: [
    { round: 3, mobsPerWaveCap: 5, maxAlivePerZone: 15, championId: GUEST },
    ...(DEFAULT_MOB_WAVES_CONFIG.schedule ?? []),
  ],
};

/** Encode a snapshot of `ctl` and read the model key off the decoded mob. */
function wireKeyOfMob(ctl: MatchController, id: number): string {
  const state = new MatchState();
  const encoder = new Encoder(state);
  projectSnapshot(ctl, state, new Map());
  const decoded = new MatchState();
  new Decoder(decoded).decode(fullStateBytes(encoder, state), { offset: 1 });
  const es = decoded.entities.get(String(id));
  expect(es, `mob ${id} never reached the wire`).toBeDefined();
  expect(es!.kind).toBe(ENTITY_KIND.MOB);
  return es!.key;
}

function combatController(): MatchController {
  const ctl = new MatchController(
    "round-champ",
    3,
    Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true })),
    FAST,
  );
  while (ctl.phase.phase !== "combat") ctl.tick();
  ctl.tick();
  return ctl;
}

describe("逐回合「由誰擔任」 (GH#191)", () => {
  it("the two champions really are different docs with different meshes", () => {
    cover("mob-round-champion");
    // Guard the guard: if GUEST ever became an alias of the default, every
    // assertion below would pass for the wrong reason.
    expect(Champions.tryGet(MOB_CHAMPION_ID as ChampionId)).toBeDefined();
    expect(Champions.tryGet(GUEST as ChampionId)).toBeDefined();
    expect(defaultMesh).not.toBe("");
    expect(guestMesh).not.toBe(defaultMesh);
  });

  it("resolves the round's champion, and falls back to the whole-match one", () => {
    cover("mob-round-champion");
    expect(mobChampionForRound(CFG, 3)).toBe(GUEST); // the row wins
    expect(mobChampionForRound(CFG, 4)).toBe(MOB_CHAMPION_ID); // no row ⇒ inherit
    // round 0 is the 「no round tracking」 sentinel (unit tests / the client's
    // prediction shadow): it must read as the whole-match setting, never as
    // 「whatever round 0's row says」.
    expect(mobChampionForRound(CFG, 0)).toBe(MOB_CHAMPION_ID);
  });

  it("END TO END: a mob spawned in round 3 reaches the wire wearing GUEST's mesh", () => {
    cover("mob-round-champion");
    const ctl = combatController();
    const rules = mobRulesFromConfig(CFG, DT, 3);
    ctl.world.mobRules = rules;
    beginCombatMobs(ctl.world, rules, [0]);
    const id = spawnMob(ctl.world, 0, rules, 1, 0);
    // THE ASSERTION THAT SEPARATES THE IMPLEMENTATIONS: before GH#191 this is
    // 喪標麥可's mesh no matter what the schedule says.
    expect(wireKeyOfMob(ctl, id)).toBe(guestMesh);
  });

  it("END TO END: round 4 has no row, so the SAME arena renders the default face", () => {
    cover("mob-round-champion");
    const ctl = combatController();
    const rules = mobRulesFromConfig(CFG, DT, 4);
    ctl.world.mobRules = rules;
    beginCombatMobs(ctl.world, rules, [0]);
    const id = spawnMob(ctl.world, 0, rules, 1, 0);
    expect(wireKeyOfMob(ctl, id)).toBe(defaultMesh);
    // …and it is genuinely a DIFFERENT string from the round-3 one, so a build
    // that hard-coded either answer fails one of these two tests.
    expect(defaultMesh).not.toBe(guestMesh);
  });
});
