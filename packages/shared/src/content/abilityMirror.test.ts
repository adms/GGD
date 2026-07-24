/**
 * The champion↔ability MIRROR guard, run over the REAL content tree
 * (docs/todo/ability-vfx.md av-05).
 *
 * Every Q/W/E/R ability is stored twice: standalone at
 * `content/abilities/<cid>.<slot>.json` and denormalised into its champion at
 * `content/champions/<cid>.json` `abilities[<slot>]`. The standalone doc is
 * authoritative — see `registerChampion`/`fillGaps` in ../sim/content/registry.
 *
 * WHY THIS EXISTS. `auditAbilityMirrorDrift` has been available since the
 * shadowing fix, but nothing ever pointed it at content/ — it was only ever
 * exercised against the synthetic 2-doc fixture in abilityShadowing.test.ts.
 * Meanwhile task #79's VFX re-point edited `content/abilities/*.json` ONLY (that
 * file's stated owned surface is "content/abilities/*.json (vfxKey field only)"),
 * leaving 192 of the 452 embedded copies still holding the old
 * `fx.ember-bolt-cast` placeholder.
 *
 * That is the BOTH-PRESENT-BUT-DIFFERENT class, and it is nastier than a missing
 * field precisely because it is invisible in a real match: `fillGaps` only
 * backfills keys the standalone doc leaves undefined, so at runtime the correct
 * standalone value wins and everything looks fine. The stale value leaks into
 * every RAW-DOC consumer that never goes through `registerAll` — the codex
 * browser, the admin 內容管理 page, and above all
 * apps/editor/src/preview/PreviewController.ts, which passes
 * `overrideAbilities: true` and therefore renders the embedded copy WHOLE.
 *
 * The assertion collects EVERY violation before failing. A bare `expect` inside
 * the loop would have reported 1 failure for 192 defects.
 *
 * IMPORTANT: like icons.test.ts and standinRoster.test.ts, this suite reads docs
 * by DIRECT file path rather than through FsContentSource/ContentLoader, so it
 * does not depend on `content:build` having been run. It must stay green both
 * before and after a reindex.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { ContentStore } from "./store";
import { auditAbilityMirrorDrift, type AbilityMirrorDrift } from "./registries";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const SLOTS = ["Q", "W", "E", "R"] as const;

/** 113 champions × 4 core slots, all twinned. A floor, so the roster may grow. */
const PAIR_FLOOR = 452;

/**
 * Fields the standalone doc is ALLOWED to carry alone. These are the sanctioned
 * steady state, not drift:
 *  - `schema`  — the collection tag only a standalone doc has (452 cases, by design).
 *  - `icon`    — the w3x/AI icon set is written to standalone docs; keeping the two
 *                in step is icons.test.ts's job (`icon-embed-standalone-agree`),
 *                not this suite's.
 * A field name showing up standalone-only that is NOT on this list means a new
 * write path started editing one copy of the mirror — exactly how #79 did it.
 */
const STANDALONE_ONLY_OK = new Set(["schema", "icon"]);

type Doc = Record<string, unknown>;

function docs(collection: string): Array<{ file: string; doc: Doc }> {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => ({
      file: f,
      doc: JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Doc,
    }));
}

/** The real content tree as a ContentStore, so the SHIPPING audit runs on it. */
function realContentStore(): ContentStore {
  const store = new ContentStore();
  for (const { file, doc } of docs("abilities")) {
    store.add("abilities", (doc.id as string) ?? file.slice(0, -5), doc);
  }
  for (const { file, doc } of docs("champions")) {
    store.add("champions", (doc.id as string) ?? file.slice(0, -5), doc);
  }
  return store;
}

/** Raw standalone/embedded doc pair per `<championId>.<slot>`, straight off disk. */
function rawPairs(): Map<string, { standalone: Doc; embedded: Doc }> {
  const byId = new Map<string, Doc>();
  for (const { doc } of docs("abilities")) byId.set(doc.id as string, doc);

  const pairs = new Map<string, { standalone: Doc; embedded: Doc }>();
  for (const { doc } of docs("champions")) {
    const abilities = (doc.abilities ?? {}) as Record<string, Doc | undefined>;
    for (const slot of SLOTS) {
      const embedded = abilities[slot];
      if (!embedded) continue;
      const standalone = byId.get(embedded.id as string);
      if (!standalone) continue;
      pairs.set(`${doc.id as string}.${slot}`, { standalone, embedded });
    }
  }
  return pairs;
}

/** JSON docs can never hold an `undefined` value, so absent ⟺ `undefined`. */
function present(doc: Doc, field: string): boolean {
  return field in doc && doc[field] !== undefined;
}

function show(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function describeDrift(d: AbilityMirrorDrift): string {
  return `${d.championId}.${d.slot} (${d.abilityId}) ${d.field}: standalone=${show(
    d.standalone,
  )} embedded=${show(d.embedded)}`;
}

describe("champion↔ability mirror (real content)", () => {
  it("every champion Q/W/E/R slot has a standalone twin to be checked against (ability-mirror-pairs)", () => {
    cover("ability-mirror-pairs");
    // Counted and NON-SKIPPING: a `continue` on a missing twin would let a
    // rewrite that deleted standalone docs pass this suite vacuously.
    const byId = new Set(docs("abilities").map(({ doc }) => doc.id as string));
    const orphans: string[] = [];
    let slots = 0;
    for (const { file, doc } of docs("champions")) {
      const abilities = (doc.abilities ?? {}) as Record<string, Doc | undefined>;
      for (const slot of SLOTS) {
        const embedded = abilities[slot];
        if (!embedded) {
          orphans.push(`${file}#${slot}: champion doc has no ${slot} ability`);
          continue;
        }
        slots += 1;
        if (!byId.has(embedded.id as string)) {
          orphans.push(`${file}#${slot}: no standalone doc for "${embedded.id as string}"`);
        }
      }
    }
    expect(orphans, `${orphans.length} unmirrored slot(s)`).toEqual([]);
    expect(slots).toBeGreaterThanOrEqual(PAIR_FLOOR);
    expect(rawPairs().size).toBeGreaterThanOrEqual(PAIR_FLOOR);
  });

  /**
   * THE GUARD. Zero fields present in BOTH copies with different values.
   *
   * Fails with the complete list, not the first offender — the defect this was
   * written for spanned 192 slots across 48 champion docs, and a fail-fast
   * assertion would have reported it as a single one-line typo.
   */
  it("no field is present in both copies with different values (ability-mirror-no-conflict)", () => {
    cover("ability-mirror-no-conflict");
    const pairs = rawPairs();
    expect(pairs.size).toBeGreaterThanOrEqual(PAIR_FLOOR); // never pass vacuously

    const conflicts: AbilityMirrorDrift[] = [];
    for (const drift of auditAbilityMirrorDrift(realContentStore())) {
      const pair = pairs.get(`${drift.championId}.${drift.slot}`);
      if (!pair) continue; // audited an embedded-only ability; the pairs test owns that
      if (!present(pair.standalone, drift.field) || !present(pair.embedded, drift.field)) continue;
      conflicts.push(drift);
    }

    const byField = new Map<string, number>();
    for (const c of conflicts) byField.set(c.field, (byField.get(c.field) ?? 0) + 1);
    const summary =
      `${conflicts.length} embedded field(s) contradict their standalone twin ` +
      `across ${pairs.size} pairs ` +
      `[${[...byField].map(([f, n]) => `${f}×${n}`).join(", ")}]. ` +
      `The standalone doc is authoritative — copy ITS value into ` +
      `content/champions/<cid>.json abilities[<slot>], never the reverse, then rerun ` +
      `\`pnpm content:build\`.\n` +
      conflicts.map(describeDrift).join("\n");

    expect(conflicts.map(describeDrift), summary).toEqual([]);
  });

  /**
   * The adjacent failure mode: a field that starts being written to only ONE
   * side of the mirror. `schema` and `icon` are the sanctioned standalone-only
   * cases; anything else means a new one-sided write path appeared.
   */
  it("only sanctioned fields live on one side of the mirror (ability-mirror-one-sided)", () => {
    cover("ability-mirror-one-sided");
    const pairs = rawPairs();
    expect(pairs.size).toBeGreaterThanOrEqual(PAIR_FLOOR);

    const unsanctioned: string[] = [];
    for (const [key, { standalone, embedded }] of pairs) {
      for (const field of new Set([...Object.keys(standalone), ...Object.keys(embedded)])) {
        const inStd = present(standalone, field);
        const inEmb = present(embedded, field);
        if (inStd === inEmb) continue;
        if (inStd && STANDALONE_ONLY_OK.has(field)) continue;
        // Embedded-only is what `fillGaps` exists to serve (a standalone doc
        // predating a field), so it is reported, never fatal.
        if (inEmb) continue;
        unsanctioned.push(`${key} ${field}: standalone-only (${show(standalone[field])})`);
      }
    }
    expect(unsanctioned, `${unsanctioned.length} unsanctioned one-sided field(s)`).toEqual([]);
  });

  /**
   * The #79 regression itself: no embedded copy may still be parked on the
   * generic fire placeholder while its standalone twin has moved to a real
   * primitive. Redundant with the conflict guard by construction, but it names
   * the specific value so a future bulk re-point that reintroduces it fails with
   * an unmistakable message.
   */
  it("no embedded vfxKey is left on the fx.ember-bolt-cast placeholder (ability-mirror-vfxkey)", () => {
    cover("ability-mirror-vfxkey");
    const pairs = rawPairs();
    expect(pairs.size).toBeGreaterThanOrEqual(PAIR_FLOOR);

    const stale: string[] = [];
    let embeddedOnPrimitives = 0;
    for (const [key, { standalone, embedded }] of pairs) {
      const std = standalone.vfxKey;
      const emb = embedded.vfxKey;
      if (typeof std !== "string") continue;
      if (emb !== std) stale.push(`${key}: standalone=${std} embedded=${show(emb)}`);
      if (typeof emb === "string" && emb.startsWith("fx.prim.")) embeddedOnPrimitives += 1;
    }
    expect(stale, `${stale.length} slot(s) whose embedded vfxKey lags the standalone`).toEqual([]);
    // 422 of the 452 EMBEDDED slots now carry a `fx.prim.*` primitive — the
    // state this sync put there. A collapse means a bulk re-point wrote the
    // standalone side only (exactly #79's mistake) and the mirror lagged again.
    // The remaining 30 are legitimately off the primitive palette: they belong
    // to champions outside #79's 48-champion whitelist and agree on BOTH sides,
    // so they are not drift (e.g. sela.Q, still on fx.ember-bolt-cast in both).
    expect(embeddedOnPrimitives).toBeGreaterThanOrEqual(400);
  });
});
