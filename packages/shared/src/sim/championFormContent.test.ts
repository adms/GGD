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
 *
 * ---------------------------------------------------------------------------
 * TWO LAYERS FEED THE SHEET, AND ONLY ONE OF THEM SWAPS
 * ---------------------------------------------------------------------------
 * The stat sheet is (champion doc) + (whatever abilities are attached). Only the
 * FIRST swaps: `championForm` re-derives the doc layer from the alternate, while
 * `spawnChampion` binds ability ids ONCE from the picked half and never re-reads
 * them — a passive that must differ per body says so with `whileForm` on its rank
 * block (`abilities/abilityPassives.ts`), which is the mechanism for it.
 *
 * Until 2026-08-12 this suite compared the post-swap sheet to a directly-spawned
 * alternate's sheet WHOLE, which silently assumed the two halves' ability layers
 * were identical. They were, by accident, until the 90-支重製 gave 20 感知能力 /
 * 77 浮雲-旋一閃 / 92 憂鬱的眼神 different `evasion` on the two sides. The
 * comparison is therefore now split: doc-layer stats must match the alternate to
 * the bit, and a stat is skipped ONLY where the two halves' spawn-time ability
 * docs actually disagree about it — an exemption read out of shipped content, not
 * written down here.
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
import { splitFormPairsByShipping } from "../../testkit/formPairShipping";
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
import { innateSupersedesLegacyPassive } from "./abilities/abilityPassives";
import {
  asSeatId,
  asTeamId,
  type AbilityId,
  type ChampionId,
  type EntityId,
  type SeatId,
} from "../ids";
import type { IntentFrame } from "./intents";
import { Stat, type StatBlock } from "./stats/statTypes";

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

/**
 * The pairs whose two docs are BOTH still in `content/champions`.
 *
 * owner 2026-08-13 moved 41 unreleased heroes into `content/_legacy/`, which is
 * not a collection — five whole pairs went with them, so "the shipped 26" is now
 * "the shipped 21" and will be some other number the next time the roster opens.
 * Read off the two directories rather than written down, and the pathological
 * case (a pair split across the move — the one that throws in the snapshot
 * builder) is asserted empty below instead of silently shrinking this list.
 */
const { shipped: SHIPPED, archived: ARCHIVED, halfMigrated: HALF_MIGRATED } =
  splitFormPairsByShipping();

/** Champion docs that parsed and were handed to `registerAll`. */
let parsedChampionCount = 0;

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
    if (parsed.success) {
      store.add("champions", parsed.data.id, parsed.data);
      parsedChampionCount += 1;
    }
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

/**
 * Stats the CHAMPION DOC owns outright (baseStats + growth + 三圍). These are
 * what `championForm` re-derives, so they are the thing this suite exists to
 * measure and may never fall into the ability-layer exemption below.
 */
const DOC_OWNED_STATS: ReadonlyArray<keyof StatBlock> = [
  Stat.MaxHealth,
  Stat.MaxMana,
  Stat.Armor,
  Stat.MagicResist,
  Stat.AttackDamage,
  Stat.AbilityPower,
  Stat.AttackSpeed,
  Stat.MoveSpeed,
  Stat.AttackRange,
];

/**
 * A champion's SPAWN-TIME ability-layer contribution, bucketed per stat.
 *
 * `spawnChampion` learns exactly three things at spawn — Q at rank 1, the 天生技
 * at rank 1, and the legacy inline `champion.passive` unless the standalone
 * innate supersedes it (`innateSupersedesLegacyPassive`, imported rather than
 * re-derived so this cannot drift from the real rule). Everything else spawns
 * at rank 0 and contributes nothing.
 */
function spawnTimeAbilityStats(id: ChampionId): ReadonlyMap<keyof StatBlock, string> {
  const def = Champions.get(id);
  const mods: Array<{ stat: string; op?: string; value?: number }> = [];
  for (const abilityId of [def.abilities.Q.id, def.passiveAbility]) {
    if (!abilityId) continue;
    const ab = Abilities.tryGet(abilityId as AbilityId);
    mods.push(...((ab?.passive?.ranks[0]?.modifiers ?? []) as typeof mods));
  }
  if (def.passive && !innateSupersedesLegacyPassive(def)) {
    mods.push(...(def.passive.modifiers as typeof mods));
  }
  const bucket = new Map<keyof StatBlock, string[]>();
  for (const m of mods) {
    const k = m.stat as keyof StatBlock;
    if (!bucket.has(k)) bucket.set(k, []);
    bucket.get(k)!.push(`${m.op}=${m.value}`);
  }
  // sorted so declaration ORDER never fakes a divergence
  return new Map([...bucket].map(([k, list]) => [k, list.sort().join(",")]));
}

/** Stats where the two halves' spawn-time ability layers disagree. */
function statsWhereAbilityLayerDiffers(
  baseId: ChampionId,
  altId: ChampionId,
): ReadonlySet<keyof StatBlock> {
  const a = spawnTimeAbilityStats(baseId);
  const b = spawnTimeAbilityStats(altId);
  const out = new Set<keyof StatBlock>();
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(k) !== b.get(k)) out.add(k);
  }
  return out;
}

describe("變身 on the SHIPPED pairs (transform-forms-sim)", () => {
  it("every base can become its alternate, resolve its REAL sheet, and come home", () => {
    cover("transform-forms-sim");
    // vacuity guards first — an emptied table or registry would pass a loop
    // that iterates nothing
    expect(CHAMPION_FORM_PAIRS).toHaveLength(26);
    // A pair with one half archived and one half shipped is exactly the crash
    // this suite measures (press the button, `Registry.get()` throws inside the
    // snapshot builder), so it is reported — never dropped from the population.
    expect(HALF_MIGRATED, `${HALF_MIGRATED.length} pair(s) straddle the legacy move`).toEqual([]);
    expect(SHIPPED.length + ARCHIVED.length).toBe(CHAMPION_FORM_PAIRS.length);
    expect(SHIPPED.length).toBeGreaterThan(0);
    // DERIVED from the content tree, not a copied roster size: the registry must
    // hold every doc that parsed, and at least the two each shipped pair spawns.
    expect(Champions.ids().length, "the registry did not take every parsed doc").toBe(
      parsedChampionCount,
    );
    expect(parsedChampionCount).toBeGreaterThanOrEqual(SHIPPED.length * 2);

    const problems: string[] = [];
    const exemptedStats: string[] = [];
    let sheetsCompared = 0;
    let genuinelyDifferent = 0;

    for (const pair of SHIPPED) {
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
      // owner 2026-08-12 裁決：「只要讓 EX 照技能說明正常實作 被動或主動 即可」——
      // 舊行為：兩半的技能組碰巧寫出一樣的被動修正，所以「換身後的表 == 直接生出
      // 替身的表」整張成立。新規格：90 支重製把 20 感知能力 (0.06 vs 替身 0.07)、
      // 77 浮雲-旋一閃 (本體 0.1、替身沒有)、92 憂鬱的眼神 (本體沒有、替身 0.18)
      // 三處的**技能層**寫歪了，於是同一張表出現三格 evasion 落差。
      //
      // ⚠️ 那三格不是變身壞了，是這條斷言一直把兩層混在一起讀：
      //   · 文件層（baseStats / growth / attributes）——`championForm` 真的重解，
      //     這才是本測試要守的機制；
      //   · 技能層（Q rank1 + 天生技 rank1 + legacy inline passive）——`spawnChampion`
      //     只綁一次、綁的是**被選的那一半**，換身後**刻意**跟著走
      //     （要分身體才生效的被動有 `whileForm` 閘，見 abilityPassives.rankBlock）。
      // 所以豁免是**從出貨技能文件推導**的：只有兩半技能層對該屬性寫得不一樣時，
      // 那一格才不比較；其餘每一格照舊必須逐位等於替身的表。
      const abilityLayerDiffers = statsWhereAbilityLayerDiffers(baseId, altId);
      const wrong = (Object.keys(got) as Array<keyof StatBlock>).filter(
        (k) => got[k] !== altSheet[k] && !abilityLayerDiffers.has(k),
      );
      if (wrong.length > 0) {
        problems.push(
          `${pair.heroNumber} ${baseId}→${altId}: stat sheet is not the alternate's ` +
            wrong.map((k) => `[${k} ${got[k]} vs ${altSheet[k]}]`).join(" "),
        );
      }
      // …and the exemption may never swallow a stat the CHAMPION DOC owns. If a
      // 天生技/Q 被動 ever diverges on one of these, the answer is a `whileForm`
      // gate on that rank block, not a wider exemption here.
      const swallowedCore = DOC_OWNED_STATS.filter((k) => abilityLayerDiffers.has(k));
      if (swallowedCore.length > 0) {
        problems.push(
          `${pair.heroNumber} ${baseId}→${altId}: the ability layer diverges on ` +
            `${swallowedCore.join("/")} — a doc-owned stat. Gate that passive rank block ` +
            `with \`whileForm\` instead of letting it hide the transform's own stat read.`,
        );
      }
      exemptedStats.push(...[...abilityLayerDiffers].map((k) => `${pair.heroNumber}:${k}`));
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
    // Every shipped pair was actually run — a `continue` above that swallowed a
    // pair would show up here rather than as a silently smaller sweep.
    expect(sheetsCompared).toBe(SHIPPED.length);
    // The exemption above is DERIVED from the shipped ability docs, so it cannot
    // be widened by editing this file — but it can be widened by editing content,
    // and a silently growing list would mean the two halves' 天生技/Q 被動 are
    // drifting apart rather than the transform breaking. Fewer than one exempt
    // stat per pair keeps it a handful of cells, not a blanket.
    expect(
      exemptedStats.length,
      `ability-layer exemptions: ${exemptedStats.join(", ")}`,
    ).toBeLessThan(sheetsCompared);
    // The sheet comparison above is only meaningful if the two halves actually
    // carry different numbers. They are separate w3u units, so most do — a
    // collapse to zero would mean this test is comparing a doc with itself.
    // Expressed as a MAJORITY of what was compared rather than a copied count,
    // so archiving or opening a hero never touches this line while the property
    // it guards ("most pairs are two genuinely different sheets") is unchanged.
    expect(
      genuinelyDifferent,
      `only ${genuinelyDifferent}/${sheetsCompared} pairs have different sheets`,
    ).toBeGreaterThan(sheetsCompared / 2);
  });
});
