/**
 * content-admin-fields (task #102) — the form spec for 英雄 / 技能 / 武器道具.
 *
 * The property that matters is HONESTY, not completeness. A labelled input for
 * every leaf of a 554-ability tree is not achievable and not the point; what
 * would be a real defect is a form that silently omits a field, because the
 * operator then believes the document contains only what the form shows and
 * saves a doc whose unshown parts they never reviewed. So:
 *
 *   • the fields that DO exist must point at real paths in the real content
 *     (checked against the actual documents on disk, not fixtures);
 *   • whatever the form does not cover must be NAMED by `uncoveredKeys`, so the
 *     page can say "these live in the raw-JSON editor" instead of hiding them;
 *   • `id` and `schema` must be read-only, because the filename is the id and
 *     the collection determines the schema tag — the content-api rejects a
 *     mismatch with a 422 anyway, but offering the input at all is a trap.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { getAt, type EditCollection } from "@ggd/shared/content/editModel";
import {
  COLLECTION_LABEL,
  allFields,
  fieldGroups,
  fieldSpec,
  uncoveredKeys,
} from "./contentFields";

const CONTENT = fileURLToPath(new URL("../../../content/", import.meta.url));
const COLLECTIONS: readonly EditCollection[] = ["champions", "abilities", "items", "augments"];

/** Read up to `n` real documents from a collection (skipping the index). */
function sampleDocs(collection: EditCollection, n: number): Record<string, unknown>[] {
  const dir = join(CONTENT, collection);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .slice(0, n)
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>);
}

describe("the field spec", () => {
  it("covers every editable collection with the user's own wording", () => {
    cover("content-admin-fields");
    // 三選一強化 (augments) are the DRAFT abilities — a SEPARATE editable
    // collection from champion 技能 (task #70 rule 3).
    expect(COLLECTION_LABEL).toEqual({
      champions: "英雄",
      abilities: "技能",
      items: "武器道具",
      augments: "三選一強化",
      // 三選一抽獎池 (loot-tables) — the ITEM draft pools, curatable from the
      // backend (task #70 rule 2/3). An array doc, so it has only the identity
      // group + a raw-JSON entries editor, hence it is NOT in the form-rich
      // COLLECTIONS list below that asserts >3 editable fields.
      "loot-tables": "三選一抽獎池",
      // 特效管理 (task #205) + 場景物件管理 — the two NEW editable collections.
      // Both are form-LEAN (identity + scalars only; the tuple/gradient/zone
      // payload is raw-JSON), so like loot-tables they are NOT in the
      // form-rich COLLECTIONS list below that asserts >3 editable fields.
      vfx: "特效",
      arenas: "場景物件",
    });
    for (const c of COLLECTIONS) {
      expect(fieldGroups(c).length, c).toBeGreaterThan(0);
      expect(allFields(c).length, c).toBeGreaterThan(3);
    }
  });

  it("has no duplicate paths and keeps id/schema read-only", () => {
    cover("content-admin-fields");
    for (const c of COLLECTIONS) {
      const paths = allFields(c).map((f) => f.path);
      expect(new Set(paths).size, c).toBe(paths.length);
      expect(fieldSpec(c, "id")?.readOnly, c).toBe(true);
      expect(fieldSpec(c, "schema")?.readOnly, c).toBe(true);
      // everything else is editable — a spec that is all read-only is a viewer
      expect(allFields(c).filter((f) => f.readOnly !== true).length, c).toBeGreaterThan(3);
    }
  });

  it("every editable path resolves in a REAL document (not a fixture)", () => {
    cover("content-admin-fields");
    // Guards against the quiet failure mode: a renamed schema field leaves an
    // input that edits a key nothing reads. Sampling several docs because
    // optional fields legitimately vary per document.
    for (const c of COLLECTIONS) {
      const docs = sampleDocs(c, 25);
      expect(docs.length, `${c} has no documents to check against`).toBeGreaterThan(0);
      const unresolved = allFields(c)
        .filter((f) => f.readOnly !== true)
        .filter((f) => docs.every((d) => getAt(d, f.path) === undefined))
        .map((f) => f.path);
      // A path present in NONE of 25 real documents is almost certainly a typo.
      // These are the known-rare optionals, listed by name so a new miss fails.
      const knownRare = new Set([
        "abilities:radius",
        "abilities:castTime",
        "abilities:targetsAllies",
        "abilities:icon",
        "items:buildsFrom",
        "items:description",
        // most items still carry Blizzard stock art and therefore have no
        // `icon` key at all — task #81's debt, not a spec error
        "items:icon",
      ]);
      expect(unresolved.filter((p) => !knownRare.has(`${c}:${p}`)), c).toEqual([]);
    }
  });
});

describe("uncoveredKeys is the form's own honesty check", () => {
  it("names the deep structures the form deliberately does not render", () => {
    cover("content-admin-fields");
    const champion = sampleDocs("champions", 1)[0]!;
    // `abilities` is a nested map of whole ability documents; the form does not
    // pretend to render it, so it must SAY so.
    expect(uncoveredKeys("champions", champion)).toContain("abilities");

    const ability = sampleDocs("abilities", 20).find((d) => "effects" in d);
    expect(ability, "no sampled ability has effects").toBeDefined();
    expect(uncoveredKeys("abilities", ability!)).toContain("effects");

    const item = sampleDocs("items", 20).find((d) => "modifiers" in d);
    expect(item, "no sampled item has modifiers").toBeDefined();
    expect(uncoveredKeys("items", item!)).toContain("modifiers");
  });

  it("never names a key the form DOES cover", () => {
    cover("content-admin-fields");
    for (const c of COLLECTIONS) {
      const covered = new Set(allFields(c).map((f) => f.path.split(".")[0] as string));
      for (const doc of sampleDocs(c, 15)) {
        for (const key of uncoveredKeys(c, doc)) {
          expect(covered.has(key), `${c}.${key} is both covered and reported uncovered`).toBe(false);
        }
      }
    }
  });

  it("is stable and sorted, so the notice does not reshuffle between renders", () => {
    cover("content-admin-fields");
    const doc = sampleDocs("champions", 1)[0]!;
    const keys = uncoveredKeys("champions", doc);
    expect(keys).toEqual([...keys].sort());
    expect(uncoveredKeys("champions", doc)).toEqual(keys);
  });
});
