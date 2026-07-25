/**
 * webui-09 (webui-catalog-derive) + webui-10 (webui-skin-override):
 * store catalog derivation — champion-grouped rows with owned/equipped flags
 * and content-doc names — and the equipped-skin modelKey override map handed
 * to the match scene.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { deriveStoreRows, buildSkinOverrides } from "./catalog";
import { championDisplayFrom } from "./championDisplay";
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

// ---------------------------------------------------------------------------
// TASK #227 — the store must never print a champion id at a player, and must
// quote each row in the currency that actually pays for it.
// ---------------------------------------------------------------------------

/** Stand-in content registry: the two shapes a lookup can return. */
const DOC_NAMES: Record<string, { name: string; description?: string }> = {
  sela: {
    name: "蟬在叫人壞掉 - 龍宮禮奈",
    // the real w3x shape: several labelled sections in ONE field
    description: "故事：村子裡最開朗的少女。\n推薦玩家：新手\n上手度：★☆☆",
  },
  thorne: { name: "聖杯黑泥醬 - 喪標麥可" }, // named, but NO description
};
const display = (id: string) => {
  const doc = DOC_NAMES[id];
  return championDisplayFrom(id, doc?.name ?? null, doc?.description ?? null);
};

describe("#227 champion rows carry player-readable strings, not ids", () => {
  it("NO champion row renders its id when a content name exists", () => {
    cover("webui-catalog-derive");
    const rows = deriveStoreRows(CATALOG, DOCS, display);
    // THE REGRESSION: this is exactly what the store printed as the heading.
    for (const r of rows) {
      if (!r.named) continue;
      expect(r.name).not.toBe(r.id);
      expect(r.fullName).not.toBe(r.id);
    }
    const sela = rows.find((r) => r.id === "sela")!;
    expect(sela.name).toBe("蟬在叫人壞掉 - 龍宮禮奈");
    expect(sela.title).toBe("蟬在叫人壞掉"); // 稱號 shown beside the name
    expect(sela.fullName).toBe("龍宮禮奈");
    expect(sela.blurb).toBe("村子裡最開朗的少女。"); // 故事 only, never the raw blob
  });

  it("a champion with no description renders NO blurb (no empty box, no undefined)", () => {
    cover("webui-catalog-derive");
    const thorne = deriveStoreRows(CATALOG, DOCS, display).find((r) => r.id === "thorne")!;
    expect(thorne.name).toBe("聖杯黑泥醬 - 喪標麥可");
    expect(thorne.blurb).toBe(""); // falsy ⇒ the row renders nothing at all
    expect(thorne.blurb).not.toBe("undefined");
  });

  it("an UNKNOWN champion degrades to the id — the fallback, never the default", () => {
    cover("webui-catalog-derive");
    const vex = deriveStoreRows(CATALOG, DOCS, display).find((r) => r.id === "vex")!;
    expect(vex.named).toBe(false);
    expect(vex.name).toBe("vex"); // pre-#227 behaviour survives only here
    expect(vex.title).toBeNull();
  });

  it("the default lookup is id-only, so a caller that forgets to inject is visible", () => {
    cover("webui-catalog-derive");
    for (const r of deriveStoreRows(CATALOG, DOCS)) expect(r.named).toBe(false);
  });

  it("英雄 are priced in 藍水晶 and 造型 in M幣 — never swapped", () => {
    cover("webui-catalog-derive");
    const rows = deriveStoreRows(CATALOG, DOCS, display);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.currency).toBe("crystal");
      for (const sk of r.skins) expect(sk.currency).toBe("mcoin");
    }
    // The bug in the screenshot, stated as an assertion:
    expect(rows.some((r) => r.currency === "mcoin")).toBe(false);
    expect(rows.flatMap((r) => r.skins).some((s) => s.currency === "crystal")).toBe(false);
  });
});

describe("#227 StoreScreen markup never re-reaches for the id or the wrong glyph", () => {
  // The screen itself cannot be rendered here: client vitest is node-env with
  // no DOM, and StoreScreen pulls Babylon in through StorePreviewCanvas. The
  // repo's established substitute is a comment-stripped source scan.
  const SRC = readFileSync(fileURLToPath(new URL("./StoreScreen.tsx", import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  it("prints no champion id and passes no id as a purchase name", () => {
    cover("webui-catalog-derive");
    // `champ.id` may survive ONLY as the React key and as the wire id sent to
    // the server. Any other use is a player-visible string built from the id.
    const uses = SRC.match(/[\w.]*champ\.id/g) ?? [];
    const allowed = new Set(["champ.id"]);
    for (const m of uses) expect(allowed.has(m)).toBe(true);
    expect(SRC.match(/key=\{champ\.id\}/g) ?? []).toHaveLength(1);
    expect(SRC.match(/id:\s*champ\.id/g) ?? []).toHaveLength(1);
    expect(uses).toHaveLength(2); // exactly those two, nothing else
    expect(SRC).not.toMatch(/>\s*\{\s*champ\.id\s*\}/); // the heading regression
    expect(SRC).not.toMatch(/name:\s*champ\.id/); // the dialog regression
    expect(SRC).toMatch(/\{champ\.fullName\}/);
    expect(SRC).toMatch(/name:\s*champ\.name/);
    // the preview caption used to print modelKey + championId at the player
    expect(SRC).not.toMatch(/\{shown\.championId\}/);
    expect(SRC).not.toMatch(/\{shown\.modelKey\}/);
  });

  it("keeps the rows memo subscribed to content readiness (not a [] snapshot)", () => {
    cover("webui-catalog-derive");
    expect(SRC).toMatch(/useContentReady\(\)/);
    expect(SRC).toMatch(/\[catalog,\s*skinDocs,\s*contentReady\]/);
  });

  it("prices every row through the row's own currency, not a hardcoded M幣 glyph", () => {
    cover("webui-catalog-derive");
    expect(SRC).toMatch(/<Price currency=\{champ\.currency\}/);
    expect(SRC).toMatch(/<Price currency=\{sk\.currency\}/);
    // No price/balance may be rendered as M COIN by construction any more; the
    // only surviving <MCoin> is the footer's explicit 造型幣 balance line.
    expect(SRC).not.toMatch(/<MCoin amount=\{champ\./);
    expect(SRC).not.toMatch(/<MCoin amount=\{purchase\./);
    expect(SRC).not.toMatch(/<MCoin amount=\{sk\./);
    expect(SRC).toMatch(/currency:\s*champ\.currency/); // carried into the dialog
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
