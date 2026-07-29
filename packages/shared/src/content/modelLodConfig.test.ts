/**
 * `config.model-lod@1` — the shipped doc, the schema and the code fuse must all
 * say the same thing (task #115).
 *
 * WHY THIS FILE EXISTS. The preset→tier table lives in THREE places by design:
 *   1. `content/config/model-lod.json`  — the value that ships, which the
 *      operator edits (content/ is a live bind-mount: saving IS the deploy)
 *   2. `zConfigModelLodDoc`             — the shape the content loader accepts
 *   3. `DEFAULT_MODEL_LOD`              — what the client falls back to when the
 *      doc is absent (an older deploy, or a content boot that fell back to the
 *      skeleton registry)
 * Two of those drifting apart is silent: the game keeps booting, it just quietly
 * downloads a different tier than the file on disk says. So they are pinned.
 *
 * ⚠️ ALSO A REGISTRATION GUARD. `content:build` indexes every .json under
 * `content/config/`, and the loader parses the collection through `zConfigDoc`.
 * A doc whose variant is not in that union does not "just not load" — it throws
 * and takes the ENTIRE content boot with it. The union assertion below is what
 * catches a future refactor that drops the member.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MODEL_LOD,
  zConfigDoc,
  zConfigModelLodDoc,
  type ConfigModelLodDoc,
} from "./schema/config";

const CONTENT_DIR = join(__dirname, "../../../../content");

function shippedDoc(): unknown {
  return JSON.parse(readFileSync(join(CONTENT_DIR, "config/model-lod.json"), "utf-8"));
}

describe("config.model-lod@1", () => {
  it("the shipped doc parses — through the UNION, the way the loader reads it", () => {
    const viaVariant = zConfigModelLodDoc.parse(shippedDoc());
    const viaUnion = zConfigDoc.parse(shippedDoc());
    expect(viaUnion.schema).toBe("config.model-lod@1");
    expect(viaUnion).toEqual(viaVariant);
  });

  it("the shipped doc and DEFAULT_MODEL_LOD agree field for field", () => {
    const doc = zConfigModelLodDoc.parse(shippedDoc()) as ConfigModelLodDoc;
    expect(doc.enabled).toBe(DEFAULT_MODEL_LOD.enabled);
    expect(doc.presetTiers).toEqual(DEFAULT_MODEL_LOD.presetTiers);
    expect(doc.id).toBe(DEFAULT_MODEL_LOD.id);
  });

  it("ships the behaviour #115 landed with: low→small, medium→mid, high/auto→high", () => {
    // Named explicitly rather than compared to a constant, so that "someone
    // changed both the doc and the fuse together" still shows up in review as a
    // deliberate gameplay change and not as a silent one.
    expect(DEFAULT_MODEL_LOD.presetTiers).toEqual({
      low: "small",
      medium: "mid",
      high: "high",
      auto: "high",
    });
  });

  it("every preset is REQUIRED — a table may not silently omit one", () => {
    // A partial table would leave the missing preset on whatever the reader's
    // `?? "high"` fallback happens to be, i.e. an operator could turn LOD off
    // for one preset by deleting a line and never see an error.
    for (const missing of ["low", "medium", "high", "auto"] as const) {
      const tiers: Record<string, string> = { ...DEFAULT_MODEL_LOD.presetTiers };
      delete tiers[missing];
      expect(
        zConfigModelLodDoc.safeParse({ ...DEFAULT_MODEL_LOD, presetTiers: tiers }).success,
      ).toBe(false);
    }
  });

  it("rejects a tier name that does not exist", () => {
    expect(
      zConfigModelLodDoc.safeParse({
        ...DEFAULT_MODEL_LOD,
        presetTiers: { ...DEFAULT_MODEL_LOD.presetTiers, low: "tiny" },
      }).success,
    ).toBe(false);
  });

  it("every tier the shipped table names is one the LOD manifest can actually serve", () => {
    // `_lod.json` declares which tiers were generated. A table naming a tier the
    // generator never produced would resolve to a fallback for EVERY model —
    // the setting would look wired and save nothing.
    const manifest = JSON.parse(
      readFileSync(join(CONTENT_DIR, "assets/models/_lod.json"), "utf-8"),
    ) as { tiers?: string[] };
    const generated = new Set([...(manifest.tiers ?? []), "high"]);
    for (const tier of Object.values(DEFAULT_MODEL_LOD.presetTiers)) {
      expect(generated.has(tier)).toBe(true);
    }
  });
});
