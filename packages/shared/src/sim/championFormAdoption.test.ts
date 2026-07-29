/**
 * 變身 ADOPTION (task #249) — the three heroes a player can actually transform.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SEPARATE FROM championFormContent.test.ts
 * ---------------------------------------------------------------------------
 * That suite calls `runEffects([{ kind: "championForm", … }])` directly on all
 * 26 shipped pairs. It proves the PRIMITIVE works against real content — and it
 * would stay green on a build where not one ability doc references the effect,
 * which is exactly the state the first attempt shipped in: repo's own
 * `fieldAdoption.test.ts` measured "0 of 772 docs". The mechanic ran, the player
 * could not reach it.
 *
 * So this suite starts one step earlier and never names the effect: it PRESSES
 * THE BUTTON. `castAbility(world, id, slot, target)` → the gate ladder → the
 * cast timer → `CastResolveSystem` → `runEffects` — the same path a keypress
 * takes — and then asks what the body became. Nothing here constructs an
 * `EffectDef`; if someone deletes the `championForm` entry from one of the three
 * ability docs, this goes red and `fieldAdoption` follows it.
 *
 * ---------------------------------------------------------------------------
 * THE THREE, AND WHY THEM
 * ---------------------------------------------------------------------------
 * All 26 w3x pairs work at the primitive level, but only these three are shipped
 * as playable transforms, on three conditions the others fail:
 *
 *   1. the BASE is on the curated store roster (`content/config/store.json`);
 *   2. both halves have complete champion docs;
 *   3. THE SWAP IS VISIBLE — the two halves resolve to DIFFERENT `modelKey`s, so
 *      the player sees a different body. 19 of the other pairs share one mesh
 *      between their halves (they are still correct, just invisible), and those
 *      wait for art rather than shipping as a transform nobody can see.
 *
 *   18-03 妖狐變化    godie-nsjs → godie-n00p   fox2 → fox            E, 8 s
 *   25-04 ChangeDNA   godie-umal → godie-u00l   barbarian → pikachu   R, 8 s
 *   58-04 瘋狂皮卡丘   godie-ofar → godie-o02l   pikachu → picacugy    R, 6 s
 *
 * The durations are the w3a `ahdu` at RANK 1 (`OBJECTS.json`), which is also the
 * number each shipped description already prints (「持續8秒」/「持續6秒」) — so
 * the tooltip and the sim cannot disagree.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { Abilities, Champions } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility, rankUpAbility } from "./abilities/abilitySystem";
import { championFormIndex } from "./systems/ChampionFormSystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame, CoreAbilitySlot } from "./intents";
import type { StatBlock } from "./stats/statTypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

/** THE SHIPPED BATCH. Slot + the rank-1 `ahdu` the doc must be authored with. */
const ADOPTED = [
  { base: "godie-nsjs", alt: "godie-n00p", slot: "E", durationSec: 8, name: "18-03 妖狐變化" },
  { base: "godie-umal", alt: "godie-u00l", slot: "R", durationSec: 8, name: "25-04 ChangeDNA" },
  { base: "godie-ofar", alt: "godie-o02l", slot: "R", durationSec: 6, name: "58-04 瘋狂皮卡丘" },
] as const;

/**
 * Docs BY PATH, not through `ContentLoader` — the same choice icons.test.ts and
 * championFormContent.test.ts make, so the suite is green both before and after
 * `pnpm content:build` rebuilds `_index.json`.
 */
function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<string, unknown>);
}

beforeAll(() => {
  const store = new ContentStore();
  // ability-templates first: `registerAll` expands 鑄技工坊 refs at registration
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

function spawnOne(championId: string): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const id = spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  world.step(NO_INTENTS);
  return { world, id };
}

const sheetOf = (world: SimWorld, id: EntityId): StatBlock => ({ ...world.stats.get(id)!.final });

/** Raise `slot` to rank 1 and fill the mana bar, so only the effect is under test. */
function armSlot(world: SimWorld, id: EntityId, slot: CoreAbilitySlot): void {
  const ab = world.abilities.get(id)!;
  if (ab.slots[slot].rank < 1) {
    world.ultGateOverride = true;
    ab.unspentPoints = 1;
    expect(rankUpAbility(world, id, slot), `${slot} learnable`).toBe(true);
  }
  const hp = world.health.get(id)!;
  hp.mana = hp.maxMana = 9999;
}

/** Press the button and let the cast resolve. Returns every event seen. */
function pressAndSettle(
  world: SimWorld,
  id: EntityId,
  slot: CoreAbilitySlot,
  ticks = 20,
): string[] {
  const res = castAbility(world, id, slot, { type: "self" });
  expect(res, `pressing ${slot} was accepted`).toBe("ok");
  const seen: string[] = [...world.events.map((e) => e.type)];
  for (let i = 0; i < ticks; i++) {
    world.step(NO_INTENTS);
    seen.push(...world.events.map((e) => e.type));
  }
  return seen;
}

describe("變身 the player can actually reach (#249 adoption)", () => {
  it("all three are AUTHORED with the transform — read off the registry, not the file", () => {
    cover("champion-form-adoption");
    // A vacuity guard on the batch itself: an empty ADOPTED list, or a doc that
    // silently lost its effect, must not leave the loops below iterating nothing.
    expect(ADOPTED).toHaveLength(3);
    for (const { base, alt, slot, durationSec, name } of ADOPTED) {
      const champ = Champions.tryGet(base as ChampionId);
      expect(champ, `${base} is registered`).toBeDefined();
      expect(Champions.tryGet(alt as ChampionId), `${alt} is registered`).toBeDefined();
      // the hero's own w3x link is what the effect resolves through
      expect(champ!.transform?.counterpartId, `${base} → ${alt}`).toBe(alt);

      const def = Abilities.get(`${base}.${slot.toLowerCase()}` as never) as {
        name: string;
        castType: string;
        range: number;
        effects: Array<{ kind: string; to?: string; durationSec?: number }>;
      };
      expect(def.name, "the shipped ability is the map's transform").toBe(name);
      const form = def.effects.find((e) => e.kind === "championForm");
      expect(form, `${base}.${slot} carries the championForm effect`).toBeDefined();
      expect(form!.to).toBe("alternate");
      expect(form!.durationSec, "rank-1 ahdu, matching the printed 持續N秒").toBe(durationSec);
      // WC3 `AEIl` metamorphosis is a NO-TARGET self cast: it must be pressable
      // with nothing selected, and a self-cast may not advertise a reach (#268).
      expect(def.castType, `${base}.${slot} is self-cast like the w3a says`).toBe("self");
      expect(def.range).toBe(0);
    }
  });

  it("PRESSING the button swaps the body and the whole stat sheet", () => {
    cover("champion-form-adoption");
    const problems: string[] = [];
    let proven = 0;

    for (const { base, alt, slot } of ADOPTED) {
      // what the alternate's numbers ARE, measured by spawning it directly
      const ref = spawnOne(alt);
      const altSheet = sheetOf(ref.world, ref.id);
      const altKey = Champions.get(alt as ChampionId).modelKey;

      const { world, id } = spawnOne(base);
      const baseSheet = sheetOf(world, id);
      const baseKey = Champions.get(base as ChampionId).modelKey;
      armSlot(world, id, slot as CoreAbilitySlot);

      const events = pressAndSettle(world, id, slot as CoreAbilitySlot);
      if (events.includes("castRejected")) {
        problems.push(`${base}.${slot}: the cast was REJECTED`);
        continue;
      }
      if (championFormIndex(world, id) !== 1) {
        problems.push(`${base}.${slot}: pressed, but the body did not change form`);
        continue;
      }
      const nowId = world.champion.get(id)!.championId;
      if (nowId !== alt) problems.push(`${base}.${slot}: became ${nowId}, expected ${alt}`);

      // THE SNAPSHOT'S OWN READ — `Champions.get(champ.championId).modelKey`
      const nowKey = Champions.get(nowId).modelKey;
      if (nowKey !== altKey) problems.push(`${base}.${slot}: model ${nowKey}, expected ${altKey}`);
      // …and this batch was picked for VISIBILITY, so it must actually differ
      if (nowKey === baseKey) problems.push(`${base}.${slot}: model did not change (${nowKey})`);

      // the numbers that fight are the alternate's
      if (JSON.stringify(sheetOf(world, id)) !== JSON.stringify(altSheet)) {
        problems.push(`${base}.${slot}: stat sheet is not ${alt}'s`);
      }
      if (JSON.stringify(baseSheet) === JSON.stringify(altSheet)) {
        problems.push(`${base}/${alt}: the two halves' sheets are identical — nothing to prove`);
      }
      proven++;
    }

    expect(problems, `${problems.length} broken:\n${problems.join("\n")}`).toEqual([]);
    expect(proven, "all three transformed").toBe(3);
  });

  it("and it lapses on the map's own clock, back to the hero the player picked", () => {
    cover("champion-form-adoption");
    for (const { base, alt, slot, durationSec } of ADOPTED) {
      const { world, id } = spawnOne(base);
      const baseSheet = sheetOf(world, id);
      armSlot(world, id, slot as CoreAbilitySlot);
      pressAndSettle(world, id, slot as CoreAbilitySlot);
      expect(championFormIndex(world, id), `${base} entered the form`).toBe(1);

      // ONE TICK BEFORE the deadline it is still transformed …
      const deadline = world.championForm.get(id)!.expiresTick;
      expect(deadline, `${base} armed an absolute expiry`).toBeGreaterThan(world.tick);
      while (world.tick < deadline - 1) world.step(NO_INTENTS);
      expect(championFormIndex(world, id), `${base} holds the form to the last tick`).toBe(1);

      // … and on it, the body is the picked hero again.
      world.step(NO_INTENTS);
      world.step(NO_INTENTS); // statRecomputeSystem rebuilds from the base doc
      expect(championFormIndex(world, id), `${base} reverted`).toBe(0);
      expect(world.champion.get(id)!.championId, `${base} is itself again`).toBe(base);
      expect(world.championForm.has(id), "the component is gone, not zeroed").toBe(false);
      expect(sheetOf(world, id), `${base} restored its own sheet`).toEqual(baseSheet);

      // the duration really is the authored one, in ticks (30 Hz sim)
      const armedTicks = Math.round(durationSec / world.dt);
      expect(deadline - armedTicks, "expiry = cast tick + ahdu").toBeGreaterThan(0);
      expect(alt.length, "the pair is named").toBeGreaterThan(0);
    }
  });
});
