/**
 * vfxCensus — the six statuses, and the rules that stop the census lying.
 *
 * TWO WAYS THIS PAGE COULD MISLEAD, both guarded here:
 *   1. counting an extraction as UNUSED because it is not a `vfxKey`. Most
 *      layers of a promoted family reach the screen through `extraVfxDocIds()`,
 *      so a ledger that only looks at `vfxKey` overstates the gap — which is
 *      exactly the overstatement #230 was opened on.
 *   2. calling a row TRUE-PORT because its key merely LOOKS like the right
 *      family. The status is only granted when the bound doc is a layer of the
 *      extraction that came from THIS ability's own art — name similarity is
 *      never evidence (the project's "JASS > tooltip, never proximity-grep"
 *      rule, applied to the report rather than the import).
 *
 * The last two cases assert against the REAL shipped sidecar + content, so the
 * page cannot silently diverge from what the game plays.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { isShipped } from "../../testkit/contentFixtures";
import { fileURLToPath } from "node:url";
import {
  buildCensusRows,
  extractionLedger,
  ledgerTotals,
  missingExtractions,
  statusTotals,
  isExtractionKey,
  OWNER_DECISIONS,
  type CensusAbility,
  type FamilyManifest,
  type ProvenanceFile,
} from "./vfxCensus";
import { W3X_ABILITY_ART } from "../../render/vfx/w3xAbilityArt";

const root = (p: string): string => fileURLToPath(new URL(`../../../../../${p}`, import.meta.url));

const CHAMPS = [{ id: "godie-x", name: "測試英雄" }];
const ability = (over: Partial<CensusAbility>): CensusAbility => ({
  id: "godie-x.q",
  name: "99-01 測試",
  slot: "Q",
  championId: "godie-x",
  vfxKey: null,
  ...over,
});

function prov(over: Partial<ProvenanceFile["abilities"][string]> = {}): ProvenanceFile {
  return {
    schema: "w3x-ability-provenance@1",
    abilities: {
      "godie-x.q": {
        rawcodes: ["A001"],
        joinMethod: "hero-number+exact-name",
        joinConfidence: "CONFIRMED",
        realArt: [
          {
            channel: "art:caster",
            path: "Fake.mdx",
            stem: "fake",
            form: "map-imported",
            provenance: "w3a-override",
            assetStatus: "IN_REPO_EMITTER_IS_THE_ASSET",
            emitterCount: 2,
          },
        ],
        ...over,
      },
    },
    models: {},
  };
}

const EXTRACTION = {
  stem: "fake",
  channel: "art:caster",
  provenance: "w3a-override",
  fxId: "fx.w3x.particle.fake",
  family: "particle",
  layerDocIds: ["fx.w3x.particle.fake.p00", "fx.w3x.particle.fake.p01"],
  emitterTotal: 2,
  rootAnchored: 2,
};
const DOCS = new Set(EXTRACTION.layerDocIds);

describe("vfxCensus statuses", () => {
  it("NO-CAST when the ability has no vfxKey at all", () => {
    const rows = buildCensusRows([ability({})], CHAMPS, prov(), DOCS);
    expect(rows[0]!.status).toBe("NO-CAST");
  });

  it("NO-SOURCE when the map named no model — distinct from having no extraction", () => {
    const rows = buildCensusRows(
      [ability({ vfxKey: "fx.prim.fire.nova" })],
      CHAMPS,
      prov({ realArt: [] }),
      DOCS,
    );
    expect(rows[0]!.status).toBe("NO-SOURCE");
  });

  it("PRIMITIVE-NECESSARY when real art exists but nothing was extracted from it", () => {
    const rows = buildCensusRows([ability({ vfxKey: "fx.prim.fire.nova" })], CHAMPS, prov(), DOCS);
    expect(rows[0]!.status).toBe("PRIMITIVE-NECESSARY");
  });

  it("PRIMITIVE-SUBSTITUTE only when the extraction's docs actually SHIP", () => {
    const p = prov({ extractions: [EXTRACTION] });
    expect(buildCensusRows([ability({ vfxKey: "fx.prim.fire.nova" })], CHAMPS, p, DOCS)[0]!.status).toBe(
      "PRIMITIVE-SUBSTITUTE",
    );
    // the sidecar claims an extraction, but content/vfx has none of its docs →
    // there is nothing to rebind TO, so it is not an actionable gap
    expect(
      buildCensusRows([ability({ vfxKey: "fx.prim.fire.nova" })], CHAMPS, p, new Set())[0]!.status,
    ).toBe("PRIMITIVE-NECESSARY");
  });

  it("LEGACY-KEY for an off-system key like fx.firestorm", () => {
    const rows = buildCensusRows([ability({ vfxKey: "fx.firestorm" })], CHAMPS, prov(), DOCS);
    expect(rows[0]!.status).toBe("LEGACY-KEY");
  });

  it("TRUE-PORT needs the bound doc to be a layer of THIS ability's own extraction", () => {
    const p = prov({ extractions: [EXTRACTION] });
    expect(
      buildCensusRows([ability({ vfxKey: "fx.w3x.particle.fake.p01" })], CHAMPS, p, DOCS)[0]!.status,
    ).toBe("TRUE-PORT");
    // a same-looking key from a DIFFERENT family is never TRUE-PORT
    expect(
      buildCensusRows([ability({ vfxKey: "fx.w3x.particle.faked.p00" })], CHAMPS, p, DOCS)[0]!.status,
    ).toBe("MIS-BOUND");
  });

  it("leftReason separates the renderer gate from a judgement call", () => {
    const gated = {
      ...EXTRACTION,
      rootAnchored: 0,
    };
    expect(
      buildCensusRows([ability({ vfxKey: "fx.prim.fire.nova" })], CHAMPS, prov({ extractions: [gated] }), DOCS)[0]!
        .leftReason,
    ).toBe("renderer-gate");
    expect(
      buildCensusRows(
        [ability({ vfxKey: "fx.prim.fire.nova" })],
        CHAMPS,
        prov({ extractions: [EXTRACTION] }),
        DOCS,
      )[0]!.leftReason,
    ).toBe("owner-decision");
  });

  it("isExtractionKey accepts both extraction passes and rejects primitives", () => {
    expect(isExtractionKey("fx.w3x.orb.divinering.p00")).toBe(true);
    expect(isExtractionKey("godie-fireblast-p3")).toBe(true);
    expect(isExtractionKey("fx.prim.fire.nova")).toBe(false);
    expect(isExtractionKey(null)).toBe(false);
  });
});

describe("the ledger counts a doc as USED when it plays as an EXTRA", () => {
  const manifest: FamilyManifest = {
    effects: [
      {
        id: "fx.w3x.particle.fake",
        family: "particle",
        label: "fake",
        source: { model: "Fake.mdx" },
        layers: [{ docId: "fx.w3x.particle.fake.p00" }, { docId: "fx.w3x.particle.fake.p01" }],
      },
    ],
  };
  const models: ProvenanceFile = {
    schema: "w3x-ability-provenance@1",
    abilities: {},
    models: {
      fake: { fxId: "fx.w3x.particle.fake", layerDocIds: [], emitterTotal: 2, rootAnchored: 2, referencedBy: ["godie-x.q"] },
    },
  };

  it("a layer that is nobody's vfxKey but IS a promoted extra is not 'unused'", () => {
    // pick a real promotion so the extras come from the shipped table
    const real = W3X_ABILITY_ART["godie-n003.r"]!;
    const m: FamilyManifest = {
      effects: [
        {
          id: "fx.w3x.locust.frostnova",
          family: "locust",
          label: "frostnova",
          source: { model: "frostnova.mdx" },
          layers: [real.primary, ...real.extra].map((docId) => ({ docId })),
        },
      ],
    };
    const abilities = [ability({ vfxKey: real.primary })];
    const entries = extractionLedger(m, abilities, models);
    const totals = ledgerTotals(entries);
    expect(totals.primary).toBe(1);
    expect(totals.extra).toBe(real.extra.length);
    expect(totals.unreached).toBe(0);
  });

  it("an unreached layer is given a REASON, never left unexplained", () => {
    const entries = extractionLedger(manifest, [ability({})], models);
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.reach).toBe("unreached");
      expect(e.why).toBe("not-promoted");
    }
  });

  it("zero root-anchored emitters is reported as the layout gate, not as neglect", () => {
    const gated: ProvenanceFile = {
      ...models,
      models: { fake: { ...models.models["fake"]!, rootAnchored: 0 } },
    };
    const entries = extractionLedger(manifest, [ability({})], gated);
    expect(entries.every((e) => e.why === "layout-gate")).toBe(true);
  });

  it("a model no ability references is reported as such, not as a missed rebind", () => {
    const orphan: ProvenanceFile = {
      ...models,
      models: { fake: { ...models.models["fake"]!, referencedBy: [] } },
    };
    const entries = extractionLedger(manifest, [ability({})], orphan);
    expect(entries.every((e) => e.why === "no-referencing-ability")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// against the REAL shipped artefacts
// ---------------------------------------------------------------------------

const SIDECAR = root("content/assets/vfx/w3x-ability-provenance.json");
const FAMILIES = root("content/assets/vfx/w3x-families.json");

describe("the shipped census artefacts agree with the shipped content", () => {
  const have = existsSync(SIDECAR) && existsSync(FAMILIES);
  const provenance: ProvenanceFile | null = have
    ? (JSON.parse(readFileSync(SIDECAR, "utf8")) as ProvenanceFile)
    : null;
  const manifest: FamilyManifest | null = have
    ? (JSON.parse(readFileSync(FAMILIES, "utf8")) as FamilyManifest)
    : null;

  const abilityDir = root("content/abilities");
  const abilities: CensusAbility[] = readdirSync(abilityDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(`${abilityDir}/${f}`, "utf8")) as Record<string, unknown>)
    .map((d) => ({
      id: String(d["id"]),
      name: String(d["name"] ?? ""),
      slot: String(d["slot"] ?? "PASSIVE"),
      championId: String(d["id"]).replace(/\.[^.]*$/, ""),
      vfxKey: typeof d["vfxKey"] === "string" ? d["vfxKey"] : null,
    }));
  const vfxDocIds = new Set(
    readdirSync(root("content/vfx"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.slice(0, -5)),
  );

  it("every promoted ability reads as TRUE-PORT — the table and the content agree", () => {
    if (!provenance) return;
    const rows = buildCensusRows(abilities, [], provenance, vfxDocIds);
    const byId = new Map(rows.map((r) => [r.abilityId, r]));
    for (const id of Object.keys(W3X_ABILITY_ART)) {
      // GH#323 —— 普查只涵蓋**出貨**的技能，退場的自然不在 rows 裡。
      if (!isShipped("abilities", id)) continue;
      const row = byId.get(id);
      expect(row, `${id} has no ability doc`).toBeDefined();
      expect(row!.status, `${id} is promoted but the census says ${row!.status}`).toBe("TRUE-PORT");
    }
  });

  it("no row is MIS-BOUND — an extraction key always belongs to its own ability", () => {
    if (!provenance) return;
    const rows = buildCensusRows(abilities, [], provenance, vfxDocIds);
    const bad = rows.filter((r) => r.status === "MIS-BOUND").map((r) => `${r.abilityId}=${r.currentVfxKey}`);
    expect(bad).toEqual([]);
  });

  it("every gate-passing substitute left behind carries an owner note", () => {
    if (!provenance) return;
    const rows = buildCensusRows(abilities, [], provenance, vfxDocIds);
    const unexplained = rows
      .filter((r) => r.leftReason === "owner-decision" && !r.ownerNote)
      .map((r) => r.abilityId);
    expect(unexplained, "a renderable substitute with no stated reason is just a miss").toEqual([]);
    // and no stale note for a row that is no longer a substitute
    for (const id of Object.keys(OWNER_DECISIONS)) {
      const row = rows.find((r) => r.abilityId === id);
      expect(row?.status, `${id} owner-note is stale`).toBe("PRIMITIVE-SUBSTITUTE");
    }
  });

  it("the census reproduces the real vfxKey split, so its totals are trustworthy", () => {
    if (!provenance) return;
    const rows = buildCensusRows(abilities, [], provenance, vfxDocIds);
    const t = statusTotals(rows);
    expect(t.rows).toBe(abilities.length);
    const bound = rows.filter((r) => isExtractionKey(r.currentVfxKey)).length;
    expect(t.totals["TRUE-PORT"]).toBe(bound);
    expect(t.totals["NO-CAST"]).toBe(rows.filter((r) => !r.currentVfxKey).length);
  });

  it("the ledger covers all 118 published layers and explains every unreached one", () => {
    if (!provenance || !manifest) return;
    const entries = extractionLedger(manifest, abilities, provenance);
    const totals = ledgerTotals(entries);
    expect(totals.layers).toBe(
      manifest.effects.reduce((n, e) => n + (e.layers?.length ?? 0), 0),
    );
    expect(totals.primary + totals.extra + totals.unreached).toBe(totals.layers);
    for (const e of entries) {
      if (e.reach === "unreached") expect(e.why, `${e.docId} unexplained`).toBeTruthy();
    }
  });

  it("the missing-extraction backlog only lists models an ability really references", () => {
    if (!provenance) return;
    for (const m of missingExtractions(provenance, vfxDocIds)) {
      expect(m.referencedBy.length).toBeGreaterThan(0);
    }
  });
});
