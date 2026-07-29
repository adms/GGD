/**
 * 70-00 芬多精 ON THE SHIPPED CONTENT — the anti-「被測的不是出貨的」 half of
 * sim/auraCarrier.test.ts.
 *
 * That suite proves the MECHANISM on a synthetic transform pair (so a content
 * re-balance cannot make it red for the wrong reason). This one proves the
 * mechanism is actually WIRED to 白木卡迪那: press the real 70-00 紮根 on the real
 * `godie-e00s`, and a real ally standing 3 units away must gain exactly +5 %
 * `healthRegen` — read off the finished stat pipeline, against the same ally in
 * the same world before the press.
 *
 * Registered doc-BY-PATH rather than through `ContentLoader`, the same choice
 * abilityMirror.test.ts / championFormToggle.test.ts make: every collection's
 * `_index.json` is a derived artifact that only `pnpm content:build` refreshes,
 * and this suite must be green both before and after that runs.
 *
 * It lives in its OWN FILE because `registerAll` writes the process-global
 * registries: sharing a file with the synthetic-fixture suite would make one of
 * the two depend on describe ordering, which is exactly the kind of accident a
 * guard must not be built on.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { championFormIndex } from "./systems/ChampionFormSystem";
import { Stat } from "./stats/statTypes";
import { activeAuraSources } from "./aura/aura";
import { auraCarrierFor } from "./auraCarrier";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

/** Clear of the skeleton zone's centre pillar — see aura.test.ts for the trap. */
const LINE_X = Z0.center.x + 12;
const P = (dz: number): { x: number; z: number } => ({ x: LINE_X, z: Z0.center.z + dz });

const BASE = "godie-e00s" as ChampionId;
const ROOTED = "godie-e010" as ChampionId;
/** w3a `A0GM` `data{1}{1}` — 「加速生命的回復5%」. */
const AURA_PCT = 0.05;

function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
          string,
          unknown
        >,
    );
}

beforeAll(() => {
  const store = new ContentStore();
  // ability-templates FIRST: `registerAll` expands 鑄技工坊 refs at registration.
  for (const c of [
    "ability-templates",
    "abilities",
    "champions",
    "projectiles",
    "status-effects",
  ] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

let seat = 0;
function spawn(world: SimWorld, champion: ChampionId, team: 0 | 1, dz: number): EntityId {
  return spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: P(dz),
    zone: 0,
  });
}

/** Press the 天生技 and let the (0-cast-time) toggle resolve. */
function pressInnate(world: SimWorld, id: EntityId): void {
  expect(castAbility(world, id, "PASSIVE", { type: "self" }), "the innate press").toBe("ok");
  for (let i = 0; i < 20; i++) world.step(NO_INTENTS);
}

/**
 * Step until 紮根's 15 s re-cast cooldown is spent, so the SECOND press is a
 * real toggle-back and not a `"cooldown"` refusal misread as "it did nothing".
 * Generous cap so an operator cooldown multiplier can never be the thing under
 * test; the assertion is that it DID come off.
 */
function waitOffCooldown(world: SimWorld, id: EntityId): void {
  for (let i = 0; i < 3600; i++) {
    if ((world.abilities.get(id)!.passiveSlot!.cooldownRemainingTicks ?? 0) <= 0) break;
    world.step(NO_INTENTS);
  }
  expect(world.abilities.get(id)!.passiveSlot!.cooldownRemainingTicks).toBe(0);
}

const regenOf = (world: SimWorld, id: EntityId): number =>
  world.stats.get(id)!.final[Stat.HealthRegen];

describe("白木卡迪那 70-00 芬多精 — the shipped aura, delivered by the shipped carrier", () => {
  it("紮根 gives every nearby ALLY +5 % healthRegen; standing up takes it away", () => {
    cover("aura-carrier-content");
    const world = new SimWorld(SKELETON_ARENA, 70700);
    world.combatActive = true; // 每場開始要重新打開設定 (owner)
    const host = spawn(world, BASE, 0, 0);
    const ally = spawn(world, BASE, 0, 3); // 3 < 4.58 → inside
    const outside = spawn(world, BASE, 0, 9); // 9 > 4.58 → outside
    const enemy = spawn(world, BASE, 1, 2); // closer than the ally, wrong team
    world.step(NO_INTENTS);

    const before = {
      ally: regenOf(world, ally),
      outside: regenOf(world, outside),
      enemy: regenOf(world, enemy),
    };
    // Guard the guard: a zero base would make a ×1.05 assertion pass vacuously.
    expect(before.ally, "白木's base healthRegen is a real number").toBeGreaterThan(0);
    expect(world.auraCarrier.size, "本體 carries nothing").toBe(0);

    pressInnate(world, host);
    expect(championFormIndex(world, host), "the body really rooted").toBe(1);
    expect(world.champion.get(host)!.championId).toBe(ROOTED);
    expect(world.auraCarrier.size, "…and the 蝗蟲群 spawned").toBe(1);
    expect(auraCarrierFor(world, host)).toBeDefined();

    expect(regenOf(world, ally), "the ally INSIDE 4.58").toBeCloseTo(before.ally * (1 + AURA_PCT), 6);
    expect(regenOf(world, outside), "the ally outside it").toBeCloseTo(before.outside, 6);
    expect(regenOf(world, enemy), "an enemy standing closer still gets nothing").toBeCloseTo(
      before.enemy,
      6,
    );
    expect(activeAuraSources(world, enemy)).toEqual([]);

  });

  it("STANDING UP takes it back — the carrier and the +5 % both disappear", () => {
    cover("aura-carrier-content");
    const world = new SimWorld(SKELETON_ARENA, 70701);
    world.combatActive = true;
    const host = spawn(world, BASE, 0, 0);
    const ally = spawn(world, BASE, 0, 3);
    world.step(NO_INTENTS);
    const base = regenOf(world, ally);

    pressInnate(world, host);
    expect(world.auraCarrier.size).toBe(1);
    expect(regenOf(world, ally)).toBeCloseTo(base * (1 + AURA_PCT), 6);

    // 紮根 is a TOGGLE with a real 15 s re-cast cooldown (w3a A0O6 Cool1).
    waitOffCooldown(world, host);
    expect(world.auraCarrier.size, "the aura survives the whole wait").toBe(1);

    pressInnate(world, host);
    expect(championFormIndex(world, host), "back to 本體").toBe(0);
    expect(world.champion.get(host)!.championId).toBe(BASE);
    expect(world.auraCarrier.size, "the carrier is destroyed with the form").toBe(0);
    expect(regenOf(world, ally), "…and the ally's number went back down").toBeCloseTo(base, 6);
  });
});
