/**
 * 變身 — EVERY id on `CHAMPION_FORM_PAIRS` must RESOLVE IN THE REGISTRY.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A CRASH GUARD, NOT A TIDINESS GUARD
 * ---------------------------------------------------------------------------
 * `sim/content/registry.ts` `Registry.get()` THROWS on an unregistered id:
 *
 *     get(id) { const v = this.map.get(id); if (!v) throw new Error(...); }
 *
 * and `apps/game-server/src/net/snapshot.ts` calls it for every champion entity
 * on every one of the 30 ticks a second. So a transform whose target body has
 * no champion doc is not a dead button and not a missing model — the FIRST tick
 * after the swap throws inside the snapshot builder and takes the room down for
 * all six players. Four alternate bodies were in exactly that state until this
 * import (H00W 26洨者狀態 / O030 30變態紳士 / N01B 40萬解 / E010 70紮根).
 *
 * ---------------------------------------------------------------------------
 * WHY IT READS THE REGISTRY AND NOT `readdirSync(content/champions)`
 * ---------------------------------------------------------------------------
 * A filename sweep answers "does a file exist", which is NOT the question. The
 * registry keys champions off the doc's own `id` field, so a doc saved under the
 * right filename with a typo'd `id` — or one the strict schema rejects — passes
 * a filename check and still throws at runtime. This suite therefore parses every
 * champion doc with `zChampionDoc` (the same schema ContentLoader applies), feeds
 * the real `registerAll` (so `registerChampion`'s standalone-wins resolution and
 * the Skill-Forge template expansion both run), and then asks the same
 * `Champions` registry the snapshot builder asks. `Champions.get()` is exercised
 * directly, not just `tryGet`, so the assertion runs through the THROWING path
 * the server actually uses.
 *
 * It reads the docs by DIRECT file path rather than through
 * FsContentSource/ContentLoader — the same choice icons.test.ts and
 * abilityMirror.test.ts make — so it does not depend on `pnpm content:build`
 * having regenerated `_index.json`. A guard for "the room crashes on transform"
 * must not itself be able to go green merely because an index is stale, nor red
 * merely because one has not been rebuilt yet.
 *
 * It is a sibling of championForms.test.ts, not a duplicate: that suite reads
 * the champion JSON off disk and checks the LINK FIELDS (role/rawcodes/
 * counterpartId). This one checks that both ids survive schema validation and
 * registration into the registry the sim reads.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentStore } from "./store";
import { registerAll } from "./registries";
import { Arenas, Configs, Models, StatusEffects, VfxDefs } from "./registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "../sim/content/registry";
import { CHAMPION_FORM_PAIRS } from "./championForms";
import { zChampionDoc } from "./schema/champion";
import type { ChampionId } from "../ids";
import {
  LEGACY_CHAMPION_FILE_IDS,
  OPERATIONAL_CHAMPION_FILE_IDS,
  splitFormPairsByShipping,
} from "../../testkit/formPairShipping";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** Every doc in a collection, straight off disk (index-independent). */
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

/** Schema errors found while building the store, asserted as its own case. */
const schemaErrors: string[] = [];

/** The 26 w3x Metamorphosis pairs. A floor would hide a table that shrank. */
const PAIR_COUNT = 26;

/**
 * Where each pair's two docs live after owner 2026-08-13 moved the unreleased
 * heroes into `content/_legacy/` (which is not a collection, so the engine
 * cannot load anything in it).
 *
 * ⚠️ The registry assertions below run on `SHIPPED` — not because archived pairs
 * are exempt, but because their bodies MUST NOT resolve; that is asserted in its
 * own case rather than by iterating a shorter list. Both sides are read off the
 * two directories, so re-shipping a hero moves its pair back with no edit here.
 */
const { shipped: SHIPPED, archived: ARCHIVED, halfMigrated: HALF_MIGRATED } =
  splitFormPairsByShipping();

/**
 * The four alternate bodies task G0 imported. Named explicitly so a future
 * regression is reported as "H00W is gone again", not as an anonymous count.
 * Two of them (H00W 26洨者狀態, N01B 40萬解) went to `content/_legacy/` with their
 * heroes on 2026-08-13; the list keeps all four and the case below sorts them by
 * where the doc actually is, so neither「還在但沒註冊」nor「說是封存其實刪掉了」
 * can pass.
 */
const G0_IMPORTED: readonly string[] = [
  "godie-h00w",
  "godie-o030",
  "godie-n01b",
  "godie-e010",
];

/** Champion docs that survived `zChampionDoc` and were handed to `registerAll`. */
let parsedChampionCount = 0;

beforeAll(() => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const store = new ContentStore();
  // ability-templates first: registerAll expands 鑄技工坊 refs at registration.
  for (const c of ["ability-templates", "abilities"] as const) {
    for (const { file, doc } of docs(c)) store.add(c, (doc.id as string) ?? file.slice(0, -5), doc);
  }
  for (const { file, doc } of docs("champions")) {
    const parsed = zChampionDoc.safeParse(doc);
    if (!parsed.success) {
      schemaErrors.push(`${file}: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
      continue; // an invalid doc would never reach the registry at boot either
    }
    store.add("champions", parsed.data.id, parsed.data);
    parsedChampionCount += 1;
  }
  registerAll(store);
});

describe("every 變身 form id resolves in the live registry", () => {
  it("every champion doc still parses as champion@1 (transform-forms-schema)", () => {
    cover("transform-forms-schema");
    // Reported separately so a schema break is not mis-read as "a form id is
    // missing" — the `continue` above is what would otherwise hide it.
    expect(schemaErrors, `${schemaErrors.length} champion doc(s) fail zChampionDoc`).toEqual([]);
  });

  it("both halves of every SHIPPED pair are registered champions (transform-forms-registry-resolve)", () => {
    cover("transform-forms-registry-resolve");
    // Vacuity guards FIRST: a cleared registry or an emptied table would
    // otherwise make the loop below pass by iterating nothing.
    expect(CHAMPION_FORM_PAIRS).toHaveLength(PAIR_COUNT);
    // A pair straddling the legacy move is the crash this suite exists for, so
    // it is named here rather than quietly shrinking the population.
    expect(HALF_MIGRATED, `${HALF_MIGRATED.length} pair(s) straddle the legacy move`).toEqual([]);
    expect(SHIPPED.length + ARCHIVED.length).toBe(PAIR_COUNT);
    // DERIVED, never a copied roster size: every champion doc that parsed must
    // be in the registry. Equality is the real guard — a floor would go green on
    // a registry that dropped docs, and a literal would go red every time owner
    // opens or archives a hero (CLAUDE.md 第零守則: 出貨數值不住在測試裡).
    expect(Champions.ids().length, "the registry did not take every parsed doc").toBe(
      parsedChampionCount,
    );
    // …and it holds at least the two docs each shipped pair needs, so an empty
    // content tree cannot make the loop below vacuous.
    expect(parsedChampionCount).toBeGreaterThanOrEqual(SHIPPED.length * 2);

    const unresolved: string[] = [];
    let checked = 0;
    for (const pair of SHIPPED) {
      for (const [half, id] of [
        ["base", pair.baseId],
        ["alternate", pair.alternateId],
      ] as const) {
        checked += 1;
        if (Champions.tryGet(id as ChampionId) === undefined) {
          unresolved.push(
            `${pair.heroNumber} ${half} ${id} (${pair.abilityName}) is not in the Champions registry`,
          );
        }
      }
    }
    // The complete list, not the first offender — the gap this closes was four
    // ids at once and a fail-fast assertion would have named only one.
    expect(unresolved, `${unresolved.length} unresolvable form id(s)`).toEqual([]);
    expect(checked).toBe(SHIPPED.length * 2);
  });

  it("archived pairs really are out of the engine's reach (transform-forms-legacy-unreachable)", () => {
    cover("transform-forms-legacy-unreachable");
    // owner 2026-08-13:「把沒開放的英雄資料包含技能都放到一個 legacy 區 **預設不要
    // 再被讀取到了**」. `content/_legacy/` is outside `COLLECTION_NAMES`, and this is
    // the case that proves it for the transform tables specifically: the same
    // `registerAll` the sim boots with must NOT know these ids.
    //
    // This is the other half of the resolve case above and it is why that one
    // may iterate a shorter list: the pairs it drops are asserted absent here,
    // not skipped.
    const leaked = ARCHIVED.flatMap((p) =>
      [p.baseId, p.alternateId].filter((id) => Champions.tryGet(id as ChampionId) !== undefined),
    );
    expect(leaked, "a legacy champion reached the live registry").toEqual([]);
    // …and "archived" means the doc moved, not that it was deleted — knowledge
    // does not disappear silently (CLAUDE.md 「分開不是丟掉」).
    const vanished = ARCHIVED.flatMap((p) =>
      [p.baseId, p.alternateId].filter((id) => !LEGACY_CHAMPION_FILE_IDS.has(id)),
    );
    expect(vanished, "an archived form id has no doc in content/_legacy/champions").toEqual([]);
  });

  it("Champions.get() — the THROWING path snapshot.ts uses — never throws on a form id (transform-forms-registry-get)", () => {
    cover("transform-forms-registry-get");
    expect(CHAMPION_FORM_PAIRS).toHaveLength(PAIR_COUNT);
    expect(SHIPPED.length).toBeGreaterThan(0);
    for (const pair of SHIPPED) {
      // `.get()` is what the per-tick snapshot builder calls; `tryGet` above
      // proves presence, this proves the server's own call site cannot throw.
      expect(() => Champions.get(pair.baseId as ChampionId)).not.toThrow();
      expect(() => Champions.get(pair.alternateId as ChampionId)).not.toThrow();
      expect(Champions.get(pair.baseId as ChampionId).id).toBe(pair.baseId);
      expect(Champions.get(pair.alternateId as ChampionId).id).toBe(pair.alternateId);
    }
  });

  it("the four bodies G0 imported are each still accounted for (transform-forms-g0-four)", () => {
    cover("transform-forms-g0-four");
    // Each of the four is in exactly ONE of the two trees, and the tree it is in
    // decides what must be true of it. Sorting them by where the file is (rather
    // than writing down which two were archived) means re-shipping 26/40 puts
    // them straight back under the registry assertion.
    const stillShipped = G0_IMPORTED.filter((id) => OPERATIONAL_CHAMPION_FILE_IDS.has(id));
    const nowArchived = G0_IMPORTED.filter((id) => LEGACY_CHAMPION_FILE_IDS.has(id));
    expect(
      [...stillShipped, ...nowArchived].sort(),
      "a G0 body is in neither content/champions nor content/_legacy/champions",
    ).toEqual([...G0_IMPORTED].sort());
    expect(stillShipped.filter((id) => LEGACY_CHAMPION_FILE_IDS.has(id))).toEqual([]);

    const missing = stillShipped.filter((id) => Champions.tryGet(id as ChampionId) === undefined);
    expect(missing, "shipped G0 alternate bodies that do not resolve").toEqual([]);
    const leaked = nowArchived.filter((id) => Champions.tryGet(id as ChampionId) !== undefined);
    expect(leaked, "archived G0 alternate bodies that still resolve").toEqual([]);

    // …and every one of them is on the form table, whichever tree it sits in —
    // the flag records that the w3x import produced a doc at all, which the
    // legacy move did not undo.
    for (const id of G0_IMPORTED) {
      const pair = CHAMPION_FORM_PAIRS.find((p) => p.alternateId === id);
      expect(pair, `${id} is on the form table`).toBeDefined();
      expect(pair!.alternateInContent, `${id} was imported`).toBe(true);
    }
  });

  it("every SHIPPED pair's two ids are also reachable from each other's doc (transform-forms-registry-counterpart)", () => {
    cover("transform-forms-registry-counterpart");
    const broken: string[] = [];
    expect(SHIPPED.length).toBeGreaterThan(0);
    for (const pair of SHIPPED) {
      const base = Champions.get(pair.baseId as ChampionId);
      const alt = Champions.get(pair.alternateId as ChampionId);
      // The registry copy must carry the link too — the transform system will
      // read it off `Champions.get(...)`, not off the raw JSON.
      if (base.transform?.counterpartId !== pair.alternateId) {
        broken.push(`${pair.baseId}.transform.counterpartId=${base.transform?.counterpartId}`);
      }
      if (alt.transform?.counterpartId !== pair.baseId) {
        broken.push(`${pair.alternateId}.transform.counterpartId=${alt.transform?.counterpartId}`);
      }
      // …and the id it names must itself resolve, or the link is a dangling ref.
      if (Champions.tryGet(base.transform?.counterpartId as ChampionId) === undefined) {
        broken.push(`${pair.baseId} counterpart does not resolve`);
      }
      if (Champions.tryGet(alt.transform?.counterpartId as ChampionId) === undefined) {
        broken.push(`${pair.alternateId} counterpart does not resolve`);
      }
    }
    expect(broken, `${broken.length} broken counterpart link(s)`).toEqual([]);
  });
});
