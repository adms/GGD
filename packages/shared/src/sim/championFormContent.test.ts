/**
 * TASK #249 — the 變身 primitive against THE SHIPPED CONTENT, not a fixture.
 *
 * `championForm.test.ts` proves the mechanic on two synthetic champion docs. It
 * cannot prove the thing that actually breaks in a match: that the 26 real
 * `Eme1`/`Emeu` pairs in `content/champions` carry the link the primitive reads
 * (`transform.counterpartId`), that the body on the far side is REGISTERED, and
 * that swapping to it produces the alternate's real stat sheet rather than
 * throwing inside the snapshot builder 30 times a second.
 *
 * So this suite runs the same `runEffects` → `SimWorld.step()` path on every
 * pair, straight off disk. Docs are read BY PATH (the choice
 * championFormsResolve.test.ts / icons.test.ts make) so the guard cannot go
 * green on a stale `_index.json`, nor red merely because `pnpm content:build`
 * has not been run.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "../content/store";
import { registerAll, Arenas, Configs, Models, StatusEffects, VfxDefs } from "../content/registries";
import { CHAMPION_FORM_PAIRS } from "../content/championForms";
import { zChampionDoc } from "../content/schema/champion";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { championFormIndex } from "./systems/ChampionFormSystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import type { StatBlock } from "./stats/statTypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

function docs(collection: string): Array<{ file: string; doc: Record<string, unknown> }> {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => ({
      file: f,
      doc: JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
        string,
        unknown
      >,
    }));
}

beforeAll(() => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const store = new ContentStore();
  // ability-templates first: registerAll expands 鑄技工坊 refs at registration.
  for (const c of ["ability-templates", "abilities"] as const) {
    for (const { file, doc } of docs(c)) store.add(c, (doc.id as string) ?? file.slice(0, -5), doc);
  }
  for (const { doc } of docs("champions")) {
    const parsed = zChampionDoc.safeParse(doc);
    if (parsed.success) store.add("champions", parsed.data.id, parsed.data);
  }
  registerAll(store);
});

/** One fresh world per champion, so no pair can contaminate another. */
function spawnOne(championId: ChampionId): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const id = spawnChampion(world, {
    championId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  world.step(NO_INTENTS);
  return { world, id };
}

const sheetOf = (world: SimWorld, id: EntityId): StatBlock => ({ ...world.stats.get(id)!.final });

describe("變身 on the SHIPPED 26 pairs (transform-forms-sim)", () => {
  it("every base can become its alternate, resolve its REAL sheet, and come home", () => {
    cover("transform-forms-sim");
    // vacuity guards first — an emptied table or registry would pass a loop
    // that iterates nothing
    expect(CHAMPION_FORM_PAIRS).toHaveLength(26);
    expect(Champions.ids().length).toBeGreaterThanOrEqual(115);

    const problems: string[] = [];
    let sheetsCompared = 0;
    let genuinelyDifferent = 0;

    for (const pair of CHAMPION_FORM_PAIRS) {
      const baseId = pair.baseId as ChampionId;
      const altId = pair.alternateId as ChampionId;
      if (Champions.tryGet(baseId) === undefined || Champions.tryGet(altId) === undefined) {
        problems.push(`${pair.heroNumber}: an id is unregistered (${baseId} / ${altId})`);
        continue;
      }

      // What the alternate's numbers ARE, measured by spawning it directly.
      const ref = spawnOne(altId);
      const altSheet = sheetOf(ref.world, ref.id);

      const { world, id } = spawnOne(baseId);
      const baseSheet = sheetOf(world, id);
      runEffects([{ kind: "championForm", to: "alternate", durationSec: 20 }], {
        world,
        caster: id,
        rank: 1,
        targets: [id],
        origin: `ability:${pair.abilityRawcode}`,
        abilitySlot: "R",
        rng: world.rng,
      });
      world.step(NO_INTENTS);

      if (world.events.some((e) => e.type === "castRejected")) {
        problems.push(`${pair.heroNumber} ${baseId}: transform REJECTED (no counterpart link?)`);
        continue;
      }
      if (championFormIndex(world, id) !== 1) {
        problems.push(`${pair.heroNumber} ${baseId}: did not enter the alternate form`);
        continue;
      }
      // THE SNAPSHOT'S OWN CALL — the one that takes the room down when the
      // destination body is not registered (net/snapshot.ts, every tick).
      let modelKey = "";
      try {
        modelKey = Champions.get(world.champion.get(id)!.championId).modelKey;
      } catch (err) {
        problems.push(`${pair.heroNumber} ${baseId}: snapshot read THREW — ${String(err)}`);
        continue;
      }
      if (modelKey !== Champions.get(altId).modelKey) {
        problems.push(`${pair.heroNumber} ${baseId}: wrong model after swap (${modelKey})`);
      }

      // the stats that fight are the ALTERNATE doc's, not the base's
      const got = sheetOf(world, id);
      sheetsCompared += 1;
      if (JSON.stringify(got) !== JSON.stringify(altSheet)) {
        problems.push(
          `${pair.heroNumber} ${baseId}→${altId}: stat sheet is not the alternate's ` +
            `(armor ${got.armor} vs ${altSheet.armor}, maxHealth ${got.maxHealth} vs ${altSheet.maxHealth})`,
        );
      }
      if (JSON.stringify(baseSheet) !== JSON.stringify(altSheet)) genuinelyDifferent += 1;

      // …and going home restores the base's sheet exactly
      runEffects([{ kind: "championForm", to: "base" }], {
        world,
        caster: id,
        rank: 1,
        targets: [id],
        origin: `ability:${pair.abilityRawcode}`,
        rng: world.rng,
      });
      world.step(NO_INTENTS);
      if (JSON.stringify(sheetOf(world, id)) !== JSON.stringify(baseSheet)) {
        problems.push(`${pair.heroNumber} ${baseId}: did not restore its base sheet`);
      }
      if (world.championForm.has(id)) {
        problems.push(`${pair.heroNumber} ${baseId}: form component survived the revert`);
      }
    }

    expect(problems, `${problems.length} shipped pair(s) broken:\n${problems.join("\n")}`).toEqual(
      [],
    );
    expect(sheetsCompared).toBe(26);
    // The sheet comparison above is only meaningful if the two halves actually
    // carry different numbers. They are separate w3u units, so most do — a
    // collapse to zero would mean this test is comparing a doc with itself.
    expect(genuinelyDifferent).toBeGreaterThan(15);
  });
});
