/**
 * blizzardOverlayForms (task #249) — 變身 forms resolve their overlay model by
 * the w3u MODEL PATH, not by their own rawcode.
 *
 * WHAT WAS BROKEN. `BlizzardOverlayModels` looked a champion up in the manifest
 * by its own id and gave up on a miss. The manifest is keyed on the units the
 * extractor pulled (the PICKABLE heroes), so all four live 變身 bodies missed
 * and fell to the shared voxel stand-in — which was then misdiagnosed as 「those
 * four have no Blizzard model」. `war3map.w3u` says the opposite, and this file
 * pins BOTH halves of the claim:
 *
 *   1. THE FACT — every pair in `SHARED_MODEL_FORM_PAIRS` really is a pair the
 *      map gives ONE model, re-derived here from the tracked source-map fixture
 *      `tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json`, so the table
 *      cannot drift from the map and cannot be hand-edited into a lie.
 *   2. THE RESOLUTION — the alternate resolves to a REAL glb PATH (asserted as
 *      a string, never as 「is not null」), and to the SAME path string its
 *      counterpart resolves to. Same string = one file, which is what proves
 *      this is path resolution and not a copy under data/blizzard-overlay/.
 *
 * Plus the two ways it must NOT fire: a form pair the map gives DIFFERENT
 * models never inherits, and an uncovered counterpart degrades to the stand-in
 * rather than throwing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import type { ModelDoc } from "@ggd/shared/content";
import { CHAMPION_FORM_PAIRS, isW3xFormPair } from "@ggd/shared/content";
import {
  BlizzardOverlayModels,
  SHARED_MODEL_FORM_PAIRS,
  SHARED_MODEL_COUNTERPART,
} from "./blizzardOverlay";

/** The shared voxel stand-in a godie champion points at when it has no model. */
const STAND_IN: ModelDoc = {
  id: "champ.sela",
  schema: "model@1",
  glbPath: "assets/models/champions/blocky-mage.glb",
  scale: 1,
  collisionRadius: 0.6,
  clipMap: {
    idle: "idle",
    run: "run",
    attack: "attack",
    cast: "cast",
    hurt: "hurt",
    death: "death",
  },
};

/**
 * The four base units the real data/blizzard-overlay/MANIFEST.json carries for
 * the live pairs, copied VERBATIM (unit id + glb path) — plus godie-ucrl, whose
 * alternate godie-u034 the map gives a DIFFERENT model (HeroBigGon.mdl) and
 * which therefore must NOT inherit. The overlay store itself is git-ignored
 * runtime state, so the manifest is mirrored here rather than read from disk.
 */
const MANIFEST = {
  generated: "task #10",
  units: {
    Harf: { champId: "godie-harf", glb: "assets/blizzard-local/models/Harf.glb" },
    Orkn: { champId: "godie-orkn", glb: "assets/blizzard-local/models/Orkn.glb" },
    Nman: { champId: "godie-nman", glb: "assets/blizzard-local/models/Nman.glb" },
    E00S: { champId: "godie-e00s", glb: "assets/blizzard-local/models/E00S.glb" },
    // the ONE pair whose ALTERNATE is the covered half (O02O), not the base
    O02O: { champId: "godie-o02o", glb: "assets/blizzard-local/models/O02O.glb" },
    // covered base of a DIFFERENT-model pair — the negative control
    Ucrl: { champId: "godie-ucrl", glb: "assets/blizzard-local/models/Ucrl.glb" },
  },
};

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

async function loaded(): Promise<BlizzardOverlayModels> {
  const overlay = new BlizzardOverlayModels({
    enabled: true,
    fetchFn: async () => okResponse(MANIFEST),
  });
  await overlay.load();
  return overlay;
}

/** The four live pairs, with the glb path the base half resolves to. */
const LIVE_PAIRS = [
  { base: "godie-harf", alt: "godie-h00w", glb: "assets/blizzard-local/models/Harf.glb" },
  { base: "godie-orkn", alt: "godie-o030", glb: "assets/blizzard-local/models/Orkn.glb" },
  { base: "godie-nman", alt: "godie-n01b", glb: "assets/blizzard-local/models/Nman.glb" },
  { base: "godie-e00s", alt: "godie-e010", glb: "assets/blizzard-local/models/E00S.glb" },
] as const;

describe("變身 forms resolve a REAL glb, not the voxel stand-in (blizzard-overlay-form-glb)", () => {
  it("each of the four alternate forms resolves to a named blizzard-local PATH", async () => {
    cover("blizzard-overlay-form-glb");
    const overlay = await loaded();
    for (const { alt, glb } of LIVE_PAIRS) {
      const doc = overlay.resolve(STAND_IN, alt);
      // the PATH, not merely "there is a doc" — a stand-in doc is also non-null
      expect(doc?.glbPath, alt).toBe(glb);
      expect(doc?.glbPath, alt).not.toBe(STAND_IN.glbPath);
    }
  });

  it("base and alternate resolve to the SAME glb string (path resolution, not a copy)", async () => {
    cover("blizzard-overlay-form-glb");
    const overlay = await loaded();
    for (const { base, alt } of LIVE_PAIRS) {
      const b = overlay.resolve(STAND_IN, base)!;
      const a = overlay.resolve(STAND_IN, alt)!;
      expect(a.glbPath, `${base} vs ${alt}`).toBe(b.glbPath);
      // and they name the same overlay UNIT, so nothing was duplicated under a
      // second id in data/blizzard-overlay/
      expect(a.id, `${base} vs ${alt}`).toBe(b.id);
      expect(overlay.unitFor(alt)!.unitId).toBe(overlay.unitFor(base)!.unitId);
    }
  });

  it("inherits UPWARDS too: godie-o02n takes the glb from its covered alternate", async () => {
    cover("blizzard-overlay-form-glb");
    const overlay = await loaded();
    // 曹操孟德 — the manifest carries O02O (the alternate); the PICKABLE base
    // O02N was the half falling through. Proves the fallback is symmetric.
    expect(overlay.resolve(STAND_IN, "godie-o02n")?.glbPath).toBe(
      "assets/blizzard-local/models/O02O.glb",
    );
  });
});

describe("the fallback fails CLOSED (blizzard-overlay-form-degrade)", () => {
  it("a form pair the map gives DIFFERENT models never inherits", async () => {
    cover("blizzard-overlay-form-degrade");
    const overlay = await loaded();
    // UCRL is units\critters\HighElfPeasant; its alternate U034 is HeroBigGon.
    // The base IS covered, so only the table stops 傑·富力士's second form from
    // being dressed as a High Elf Peasant.
    expect(SHARED_MODEL_COUNTERPART.has("godie-u034")).toBe(false);
    expect(overlay.resolve(STAND_IN, "godie-u034")).toBe(STAND_IN);
  });

  it("degrades to the stand-in (no throw) when the counterpart is uncovered", async () => {
    cover("blizzard-overlay-form-degrade");
    const overlay = await loaded();
    // listed pair, but the manifest carries NEITHER half
    expect(SHARED_MODEL_COUNTERPART.get("godie-h02r")).toBe("godie-hgam");
    expect(() => overlay.resolve(STAND_IN, "godie-h02r")).not.toThrow();
    expect(overlay.resolve(STAND_IN, "godie-h02r")).toBe(STAND_IN);
    // …and a champion in no pair at all is untouched
    expect(overlay.resolve(STAND_IN, "godie-nosuch")).toBe(STAND_IN);
  });

  it("never overrides an authored model, and never fires when disabled", async () => {
    cover("blizzard-overlay-form-degrade");
    const dedicated: ModelDoc = { ...STAND_IN, id: "imported.x", glbPath: "assets/models/x.glb" };
    const overlay = await loaded();
    expect(overlay.resolve(dedicated, "godie-h00w")).toBe(dedicated);

    const off = new BlizzardOverlayModels({
      enabled: false,
      fetchFn: async () => okResponse(MANIFEST),
    });
    expect(off.resolve(STAND_IN, "godie-h00w")).toBe(STAND_IN);
    expect(off.unitFor("godie-h00w")).toBeNull();
  });
});

describe("SHARED_MODEL_FORM_PAIRS is the map's own table (blizzard-overlay-form-w3u-pin)", () => {
  /** `war3map.w3u` model + base-chain per unit rawcode, as the importer wrote it. */
  const UNIT_TINTS = JSON.parse(
    readFileSync(
      join(__dirname, "../../../../../tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json"),
      "utf8",
    ),
  ) as { units: Record<string, { model: string | null; baseChain: string[] }> };

  /** the fixture keys use the w3u's own casing; form pairs carry uppercase. */
  const byRawcode = new Map(Object.entries(UNIT_TINTS.units).map(([k, v]) => [k.toUpperCase(), v]));

  it("re-derives the whole table from the source-map fixture", () => {
    cover("blizzard-overlay-form-w3u-pin");
    expect(byRawcode.size).toBeGreaterThan(100); // the fixture really loaded
    const derived = CHAMPION_FORM_PAIRS.filter((p) => {
      const b = byRawcode.get(p.normalUnitRawcode.toUpperCase());
      const a = byRawcode.get(p.alternateUnitRawcode.toUpperCase());
      if (!b || !a || b.model !== a.model) return false;
      // no `umdl` on either side → same model only if they inherit the same unit
      return b.model !== null || b.baseChain.at(-1) === a.baseChain.at(-1);
    }).map((p) => p.baseId);
    expect([...SHARED_MODEL_FORM_PAIRS].map((p) => p.baseId).sort()).toEqual(derived.sort());
    // 6 of the map's 26 pairs give the halves DIFFERENT models and are excluded
    expect(SHARED_MODEL_FORM_PAIRS.length).toBe(CHAMPION_FORM_PAIRS.length - 6);
  });

  it("every listed w3uModel/w3uBaseUnit matches BOTH halves in the fixture", () => {
    cover("blizzard-overlay-form-w3u-pin");
    for (const pair of SHARED_MODEL_FORM_PAIRS) {
      const link = CHAMPION_FORM_PAIRS.find((p) => p.baseId === pair.baseId)!;
      expect(link.alternateId, pair.baseId).toBe(pair.alternateId);
      expect(isW3xFormPair(pair.baseId, pair.alternateId), pair.baseId).toBe(true);
      for (const rawcode of [link.normalUnitRawcode, link.alternateUnitRawcode]) {
        const unit = byRawcode.get(rawcode.toUpperCase())!;
        expect(unit.model, `${pair.baseId} ${rawcode} model`).toBe(pair.w3uModel);
        expect(unit.baseChain.at(-1), `${pair.baseId} ${rawcode} chain`).toBe(pair.w3uBaseUnit);
      }
    }
  });

  it("the four live pairs are the ones this task names, with their real paths", () => {
    cover("blizzard-overlay-form-w3u-pin");
    const at = (baseId: string) => SHARED_MODEL_FORM_PAIRS.find((p) => p.baseId === baseId)!;
    expect(at("godie-harf").w3uModel).toBe("units\\human\\HeroPaladin\\HeroPaladin.mdl");
    expect(at("godie-nman").w3uModel).toBe(
      "Units\\Creeps\\EarthPandarenBrewmaster\\EarthPandarenBrewmaster.mdl",
    );
    expect(at("godie-e00s").w3uModel).toBe(
      "buildings\\nightelf\\AncientProtector\\AncientProtector.mdl",
    );
    // ORKN/O030 declare no `umdl` at all — both inherit the stock Orkn unit
    expect(at("godie-orkn").w3uModel).toBeNull();
    expect(at("godie-orkn").w3uBaseUnit).toBe("Orkn");
  });

  it("the counterpart map is symmetric and covers exactly the listed pairs", () => {
    cover("blizzard-overlay-form-w3u-pin");
    expect(SHARED_MODEL_COUNTERPART.size).toBe(SHARED_MODEL_FORM_PAIRS.length * 2);
    for (const [id, twin] of SHARED_MODEL_COUNTERPART) {
      expect(SHARED_MODEL_COUNTERPART.get(twin), id).toBe(id);
      expect(id).not.toBe(twin);
    }
  });
});
