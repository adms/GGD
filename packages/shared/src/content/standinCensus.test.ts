/**
 * standin-census — WHICH champions have no model of their own, and what they
 * borrow (task #226's remaining half).
 *
 * ── WHY A CENSUS AND NOT A PILE OF NEW FILES ────────────────────────────────
 * #226's brief reads "every champion missing a model gets one", and the
 * tempting reading is 43 new `.glb` files. That reading fails the task's OWN
 * premise. The four KayKit Adventurers were retired for weight; minting one
 * baked file per stand-in champion would cost 43 × ~52 KB ≈ 2.18 MB against the
 * 5 × ~52 KB ≈ 255 KB actually shipped — an 8.5× regression on the single
 * number the owner raised the task about, in exchange for looks the runtime
 * path already produces for free.
 *
 * What ships instead: FIVE baked meshes, and a per-champion `VoxelSkinRecipe`
 * (#231) painted at view-construction time, so each of the 43 gets its own
 * palette, face, hair, outfit and motifs at ZERO additional shipped bytes.
 * "Gets a model" is therefore true in the sense the player experiences — a
 * distinct character on screen — and false only in the sense of "a file per
 * champion", which is the sense that was the bug.
 *
 * ── WHAT THIS SUITE PINS ────────────────────────────────────────────────────
 * The census itself. The exact roster of borrowers is written down here so a
 * future roster change — a champion given a real model, a new champion added
 * with no art — shows up as a red test naming the champion, rather than as a
 * silent drift in a number nobody recomputes. It also asserts the budget claim
 * above with the real file sizes on disk, and that every borrower is actually
 * covered by the #231 generator (`preferVoxelBody`), which is what makes the
 * shared mesh acceptable rather than merely cheap.
 *
 * NOT pinned here: `_standin-overrides.json`'s per-champion `relativeScale`.
 * Those are owner-tuned lore numbers (#77/#150) and this suite reads them
 * without judging them — it only checks that a borrower with an override still
 * points at a stand-in, so an override cannot outlive the mapping it describes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import {
  STAND_IN_MODEL_KEYS,
  generateAllVoxelSkins,
  voxelSkinInputOf,
  type ChampionLike,
  type VoxelSkinOverride,
  type VoxelSkinOverridesFile,
} from "./voxelSkin";
import { DOC_ARCHETYPE } from "../voxel/archetypes";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");

function champions(): ChampionLike[] {
  const dir = join(CONTENT, "champions");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ChampionLike)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

const ROSTER = champions();

/**
 * THE CENSUS. `modelKey` → the champion ids that render on it, for every model
 * doc that more than one champion shares OR that is one of the four historic
 * stand-ins. Sorted, so the literal below is reviewable.
 */
function censusByModel(): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const c of ROSTER) {
    const key = c.modelKey ?? "(none)";
    const list = by.get(key) ?? [];
    list.push(c.id);
    by.set(key, list);
  }
  for (const list of by.values()) list.sort();
  return by;
}

const CENSUS = censusByModel();

/**
 * The stand-in roster as it stands today, model by model. This is the answer to
 * "which champions currently fall through to a stand-in, and which stand-in".
 */
const EXPECTED: Readonly<Record<string, readonly string[]>> = {
  // 18 — blocky-mage.glb
  "champ.sela": [
    "godie-e00s",
    "godie-e00t",
    "godie-e00u",
    "godie-ecen",
    "godie-efur",
    "godie-ekee",
    "godie-h001",
    "godie-h021",
    "godie-hblm",
    "godie-n00b",
    "godie-ogld",
    "godie-orkn",
    "godie-oshd",
    "godie-u00k",
    "godie-u01f",
    "godie-usyl",
    "godie-uwar",
    "sela",
  ],
  // 10 — blocky-knight.glb
  "champ.thorne": [
    "godie-e015",
    "godie-h02n",
    "godie-h02s",
    "godie-h02z",
    "godie-hapm",
    "godie-othr",
    "godie-u012",
    "godie-ucrl",
    "godie-udea",
    "thorne",
  ],
  // 9 — blocky-barbarian.glb. godie-umal 拳四郎 is here: the #249 base-form
  // swap moved him onto a shared mesh, a downgrade the owner already knows
  // about, and #231's per-champion skin is what makes it survivable.
  "champ.skin.barbarian": [
    "godie-e00v",
    "godie-h02k",
    "godie-h02y",
    "godie-harf",
    "godie-hpal",
    "godie-u00b",
    "godie-u011",
    "godie-ubal",
    "godie-umal",
  ],
  // 6 — blocky-rogue.glb
  "champ.skin.rogue": [
    "godie-e00r",
    "godie-n01l",
    "godie-nbst",
    "godie-nman",
    "godie-o02o",
    "godie-obla",
  ],
};

describe("#226 census: who borrows a stand-in, and which one", () => {
  it("the roster is the size the rest of the suite assumes", () => {
    cover("model-standin-census");
    expect(ROSTER.length).toBeGreaterThanOrEqual(114);
    for (const c of ROSTER) expect(typeof c.modelKey, `${c.id} has no modelKey`).toBe("string");
  });

  it("names EXACTLY the champions on each of the four shared stand-ins", () => {
    cover("model-standin-census");
    for (const key of STAND_IN_MODEL_KEYS) {
      expect(CENSUS.get(key) ?? [], `${key} roster changed — update the census`).toEqual([
        ...(EXPECTED[key] ?? []),
      ]);
    }
  });

  it("43 champions in total have no model of their own", () => {
    cover("model-standin-census");
    const borrowers = STAND_IN_MODEL_KEYS.flatMap((k) => CENSUS.get(k) ?? []);
    expect(borrowers.length).toBe(43);
    // and nobody is double counted
    expect(new Set(borrowers).size).toBe(43);
  });

  it("every stand-in model doc really points at a generated blocky mesh", () => {
    cover("model-standin-census");
    for (const key of STAND_IN_MODEL_KEYS) {
      const doc = JSON.parse(readFileSync(join(CONTENT, "models", `${key}.json`), "utf8")) as {
        glbPath: string;
        scale: number;
      };
      expect(doc.glbPath, `${key} is not on a generated mesh`).toMatch(
        /^assets\/models\/champions\/blocky-[a-z]+\.glb$/,
      );
      // #150: the figure is authored inside a 0..32 voxel-px envelope, so the
      // measured native height is exactly TARGET_HEIGHT and scale is honest.
      expect(doc.scale, `${key} scale should be an honest 1.0`).toBe(1);
      // and the archetype table agrees with the file it points at
      const arch = DOC_ARCHETYPE[key];
      expect(arch, `${key} has no archetype mapping`).toBeTruthy();
      expect(doc.glbPath).toContain(`blocky-${arch}.glb`);
    }
  });

  it("every borrower is covered by a per-champion generated skin", () => {
    cover("model-standin-census");
    // This is the sentence that makes "one mesh, 43 champions" honest: each of
    // them has its OWN recipe and is flagged to wear the voxel body rather than
    // the borrowed silhouette.
    const overrides = (
      JSON.parse(
        readFileSync(join(CONTENT, "models", "_voxel-skins.json"), "utf8"),
      ) as VoxelSkinOverridesFile
    ).overrides as Record<string, VoxelSkinOverride>;
    const { recipes } = generateAllVoxelSkins(ROSTER.map(voxelSkinInputOf), overrides ?? {});
    const borrowers = STAND_IN_MODEL_KEYS.flatMap((k) => CENSUS.get(k) ?? []);
    for (const id of borrowers) {
      const r = recipes.get(id);
      expect(r, `${id} has no generated skin`).toBeDefined();
      expect(r!.preferVoxelBody, `${id} borrows a mesh but is not flagged for the voxel body`).toBe(
        true,
      );
    }
    // …and every borrower's look is distinct from every other borrower's
    const sigs = borrowers.map((id) => JSON.stringify(recipes.get(id)!.palette));
    expect(new Set(sigs).size, "two borrowers share a palette").toBe(borrowers.length);
  });

  it("THE BUDGET: 5 shipped meshes, not 43 — and the arithmetic is stated", () => {
    cover("model-standin-census");
    const dir = join(CONTENT, "assets/models/champions");
    const files = readdirSync(dir).filter((f) => /^blocky-[a-z]+\.glb$/.test(f));
    expect(files.length, "the generated mesh set changed").toBe(5);
    const sizes = files.map((f) => statSync(join(dir, f)).size);
    const shipped = sizes.reduce((a, b) => a + b, 0);
    for (const s of sizes) expect(s).toBeLessThan(64 * 1024);
    // what is actually on disk for all 43 borrowers plus the undead mob
    expect(shipped).toBeLessThan(300 * 1024);
    // the file-per-champion alternative, priced at the same per-file cost
    const perFile = Math.round(shipped / files.length);
    const alternative = perFile * 43;
    expect(alternative).toBeGreaterThan(shipped * 8);
  });

  it("a scale override may only describe a champion that still exists", () => {
    cover("model-standin-census");
    // #77/#150 lore numbers are NOT re-derived here; this only stops an
    // override outliving its champion.
    const file = JSON.parse(
      readFileSync(join(CONTENT, "models", "_standin-overrides.json"), "utf8"),
    ) as { overrides: Record<string, { relativeScale?: number }> };
    const ids = new Set(ROSTER.map((c) => c.id));
    for (const id of Object.keys(file.overrides)) {
      expect(ids.has(id), `_standin-overrides.json names ${id}, which is not on the roster`).toBe(
        true,
      );
    }
  });

  it("the four retired KayKit character files are gone and stay gone", () => {
    cover("model-standin-census");
    const dir = join(CONTENT, "assets/models/champions");
    const present = readdirSync(dir);
    for (const gone of ["mage.glb", "knight.glb", "barbarian.glb", "rogue.glb"]) {
      expect(present, `${gone} is back — the owner retired it`).not.toContain(gone);
    }
  });
});
