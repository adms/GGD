/**
 * webui-09 (webui-catalog-derive) + webui-10 (webui-skin-override):
 * store catalog derivation — champion-grouped rows with owned/equipped flags
 * and content-doc names — and the equipped-skin modelKey override map handed
 * to the match scene.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { deriveStoreRows, buildSkinOverrides } from "./catalog";
import type { Catalog, SkinDoc, Wallet } from "./types";

const CATALOG: Catalog = {
  champions: [
    { id: "sela", price: 0, owned: true },
    { id: "thorne", price: 0, owned: true },
    { id: "vex", price: 1200, owned: false },
  ],
  skins: [
    { id: "skin.sela.rogue", championId: "sela", price: 750, modelKey: "champ.skin.rogue", owned: false, equipped: false },
    { id: "skin.thorne.barbarian", championId: "thorne", price: 750, modelKey: "champ.skin.barbarian", owned: true, equipped: true },
  ],
};

const DOCS = new Map<string, SkinDoc>([
  [
    "skin.thorne.barbarian",
    {
      id: "skin.thorne.barbarian",
      schema: "skin@1",
      championId: "thorne",
      name: "Warbringer Thorne",
      description: "warpaint",
      mcoinPrice: 750,
      modelKey: "champ.skin.barbarian",
    },
  ],
]);

describe("catalog owned/equipped derivation (webui-09)", () => {
  it("groups skins under champions and keeps owned/equipped flags", () => {
    cover("webui-catalog-derive");
    const rows = deriveStoreRows(CATALOG, DOCS);
    expect(rows.map((r) => r.id)).toEqual(["sela", "thorne", "vex"]);
    const thorne = rows.find((r) => r.id === "thorne")!;
    expect(thorne.owned).toBe(true);
    expect(thorne.skins).toHaveLength(1);
    expect(thorne.skins[0]).toMatchObject({ id: "skin.thorne.barbarian", owned: true, equipped: true });
    const vex = rows.find((r) => r.id === "vex")!;
    expect(vex).toMatchObject({ price: 1200, owned: false });
    expect(vex.skins).toHaveLength(0);
  });

  it("uses the content doc name/description with an id fallback", () => {
    cover("webui-catalog-derive");
    const rows = deriveStoreRows(CATALOG, DOCS);
    const sela = rows.find((r) => r.id === "sela")!;
    expect(sela.skins[0]!.name).toBe("skin.sela.rogue"); // no doc → id fallback
    const thorne = rows.find((r) => r.id === "thorne")!;
    expect(thorne.skins[0]!.name).toBe("Warbringer Thorne");
    expect(thorne.skins[0]!.description).toBe("warpaint");
  });

  it("skins for champions absent from championPrices still get a row", () => {
    cover("webui-catalog-derive");
    const rows = deriveStoreRows(
      {
        champions: [],
        skins: [{ id: "skin.mystery.x", championId: "mystery", price: 1, modelKey: "m", owned: false, equipped: false }],
      },
      new Map(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("mystery");
    expect(rows[0]!.skins).toHaveLength(1);
  });
});

describe("equipped-skin modelKey overrides (webui-10)", () => {
  const baseKeys: Record<string, string> = { sela: "champ.sela", thorne: "champ.thorne" };
  const lookup = (id: string): string | null => baseKeys[id] ?? null;

  const wallet: Pick<Wallet, "equippedSkins" | "ownedSkins"> = {
    ownedSkins: ["skin.thorne.barbarian"],
    equippedSkins: { thorne: "skin.thorne.barbarian" },
  };

  it("maps base champion modelKey → equipped skin modelKey", () => {
    cover("webui-skin-override");
    const out = buildSkinOverrides(wallet, CATALOG.skins, lookup);
    expect(out.get("champ.thorne")).toBe("champ.skin.barbarian");
    expect(out.size).toBe(1); // sela has nothing equipped
  });

  it("never substitutes unowned, mismatched, or unknown skins", () => {
    cover("webui-skin-override");
    // equipped but NOT owned (stale local state) → no override
    expect(
      buildSkinOverrides({ ownedSkins: [], equippedSkins: { thorne: "skin.thorne.barbarian" } }, CATALOG.skins, lookup).size,
    ).toBe(0);
    // skin belongs to a different champion → no override
    expect(
      buildSkinOverrides(
        { ownedSkins: ["skin.thorne.barbarian"], equippedSkins: { sela: "skin.thorne.barbarian" } },
        CATALOG.skins,
        lookup,
      ).size,
    ).toBe(0);
    // unknown skin id / unknown champion base key → no override
    expect(buildSkinOverrides({ ownedSkins: ["nope"], equippedSkins: { thorne: "nope" } }, CATALOG.skins, lookup).size).toBe(0);
    expect(
      buildSkinOverrides(
        { ownedSkins: ["skin.mystery.x"], equippedSkins: { mystery: "skin.mystery.x" } },
        [{ id: "skin.mystery.x", championId: "mystery", price: 1, modelKey: "m", owned: true, equipped: true }],
        lookup,
      ).size,
    ).toBe(0);
    // empty equip map → empty overrides
    expect(buildSkinOverrides({ ownedSkins: [], equippedSkins: {} }, CATALOG.skins, lookup).size).toBe(0);
  });
});
