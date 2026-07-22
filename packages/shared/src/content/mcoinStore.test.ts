/**
 * mcoin-12 (mcoin-skin-schema): skin@1 parses the real skin docs; the skins
 * collection is registered; every skin ref (championId, modelKey) resolves to
 * a real doc on disk.
 * mcoin-13 (mcoin-store-schema): config.store@1 parses the real store doc via
 * the config collection union; invalid store/skin docs are rejected with
 * per-field errors.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { COLLECTIONS, zConfigStoreDoc, zSkinDoc } from "./schema/index";
import { extractRefs } from "./refs";
import { validateDoc } from "./loader";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

function readDoc(rel: string): unknown {
  return JSON.parse(readFileSync(join(CONTENT_DIR, rel), "utf8"));
}

describe("skin@1 (mcoin-12)", () => {
  it("parses the real skin docs and their refs resolve on disk", () => {
    cover("mcoin-skin-schema");
    expect(COLLECTIONS.skins.schemaTag).toBe("skin@1");

    for (const rel of ["skins/skin.thorne.barbarian.json", "skins/skin.sela.rogue.json"]) {
      const doc = zSkinDoc.parse(readDoc(rel));
      expect(doc.mcoinPrice).toBe(750);
      // hard refs: championId -> champions, modelKey -> models
      const edges = extractRefs("skins", doc);
      expect(edges.map((e) => e.field).sort()).toEqual(["championId", "modelKey"]);
      for (const edge of edges) {
        const target = join(CONTENT_DIR, edge.targetCollection, `${edge.targetId}.json`);
        expect(existsSync(target), `${doc.id}: dangling ${edge.field} -> ${target}`).toBe(true);
      }
    }

    // the new skin model docs parse under model@1 and point at the staged GLBs
    for (const [rel, glb] of [
      ["models/champ.skin.barbarian.json", "assets/models/champions/barbarian.glb"],
      ["models/champ.skin.rogue.json", "assets/models/champions/rogue.glb"],
    ] as const) {
      const res = validateDoc("models", readDoc(rel));
      expect(res.ok, `model doc ${rel} must parse`).toBe(true);
      if (res.ok) expect((res.doc as { glbPath: string }).glbPath).toBe(glb);
      expect(existsSync(join(CONTENT_DIR, glb)), `staged GLB missing: ${glb}`).toBe(true);
    }
  });
});

describe("config.store@1 (mcoin-13)", () => {
  it("parses the real store doc and rejects invalid docs", () => {
    cover("mcoin-store-schema");
    const raw = readDoc("config/store.json");

    // direct parse
    const store = zConfigStoreDoc.parse(raw);
    expect(store.championPrices).toEqual({ sela: 0, thorne: 0 });
    expect(store.mcoinRewards).toEqual({
      placement1: 200,
      placement2: 120,
      placement3: 80,
      placement4: 50,
    });

    // ...and through the config collection union (config@1 | config.store@1)
    const viaCollection = validateDoc("config", raw);
    expect(viaCollection.ok).toBe(true);
    const matchStillOk = validateDoc("config", readDoc("config/config.match.json"));
    expect(matchStillOk.ok).toBe(true);

    // invalid store doc: negative price, missing placement, unknown key
    const badStore = validateDoc("config", {
      id: "store",
      schema: "config.store@1",
      championPrices: { sela: -5 },
      mcoinRewards: { placement1: 200, placement2: 120, placement3: 80 },
      surprise: true,
    });
    expect(badStore.ok).toBe(false);
    if (!badStore.ok) {
      const paths = badStore.issues.map((i) => i.path);
      expect(paths).toContain("championPrices.sela");
      expect(paths.some((p) => p.startsWith("mcoinRewards"))).toBe(true);
    }

    // invalid skin doc: negative price, non-integer, unknown key
    const badSkin = validateDoc("skins", {
      id: "skin.bad",
      schema: "skin@1",
      championId: "thorne",
      name: "",
      mcoinPrice: -1.5,
      modelKey: "champ.skin.barbarian",
      extra: 1,
    });
    expect(badSkin.ok).toBe(false);
    if (!badSkin.ok) {
      const paths = badSkin.issues.map((i) => i.path);
      expect(paths).toContain("name");
      expect(paths).toContain("mcoinPrice");
      expect(badSkin.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
    }
  });
});
