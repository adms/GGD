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
      ["models/champ.skin.barbarian.json", "assets/models/champions/blocky-barbarian.glb"],
      ["models/champ.skin.rogue.json", "assets/models/champions/blocky-rogue.glb"],
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

    // SHAPE, not a frozen roster. This previously read
    //   expect(store.championPrices).toEqual({ sela: 0, thorne: 0 })
    // which pinned the two demo placeholders — and BOTH were priced 0, while
    // `UnlockChampion` answers 409 on a 0 price. So not one champion in the game
    // was ever purchasable with crystals, and this green test was the reason
    // nobody noticed: it asserted the broken state was the expected state.
    //
    // Assert the invariants that make the meta loop possible instead, so the
    // next placeholder roster fails here rather than shipping:
    //   • every id is a real champion (the demo ids were not),
    //   • at least one champion is free, so a new account can play at all,
    //   • at least one is priced > 0, so crystals have somewhere to go.
    const prices = Object.entries(store.championPrices);
    expect(prices.length).toBeGreaterThan(2);
    expect(prices.every(([id]) => id.startsWith("godie-"))).toBe(true);
    expect(prices.some(([, p]) => p === 0)).toBe(true);
    expect(prices.some(([, p]) => p > 0)).toBe(true);
    // Again shape, not frozen values. This pinned 200/120/80/50 — a table that
    // minted M COIN on every placement of every match, which contradicts #118's
    // own premise (「M幣改由後台發放的造型幣（非購買）」, echoed by GrantMCoin's
    // doc comment "admin-granted, never purchased"). The owner set it to ONE
    // coin for 吃雞 only; a frozen assertion would have fought that edit instead
    // of catching a real regression.
    //
    // The invariants worth holding: it is a complete 4-placement table of
    // non-negative integers, and it never rewards a worse placement more.
    const m = store.mcoinRewards;
    const ladder = [m.placement1, m.placement2, m.placement3, m.placement4];
    expect(ladder.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
    expect(ladder).toEqual([...ladder].sort((a, b) => b - a));

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
