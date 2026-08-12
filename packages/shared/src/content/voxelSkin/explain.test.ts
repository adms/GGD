/**
 * explain — the derivation has to be inspectable AND true (task #231).
 *
 * The value of an explanation is entirely in whether it describes the champion
 * that actually shipped. A page that says "膚色 corpse, because 貞子 matched the
 * undead rule" while the renderer paints `fair` is worse than no page at all —
 * it converts a look the owner might have questioned into one he has been
 * talked out of questioning.
 *
 * So this suite runs the explainer over the WHOLE LIVE ROSTER read off disk
 * and asserts, per champion per axis, that the explained value is the value
 * present in the recipe the generator produced. Everything else here is
 * secondary.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { EXPLAINED_AXES, LAYER_LABEL, explainVoxelSkin, explanationSummary } from "./explain";
import { generateAllVoxelSkins, generateVoxelSkin } from "./generate";
import { voxelSkinInputOf, type ChampionLike } from "./roster";
import { matchRules } from "./rules";
import type { VoxelSkinOverride, VoxelSkinOverridesFile, VoxelSkinRecipe } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../../content");

function loadChampions(): ChampionLike[] {
  const dir = join(CONTENT, "champions");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ChampionLike)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function loadOverrides(): Record<string, VoxelSkinOverride> {
  const file = JSON.parse(
    readFileSync(join(CONTENT, "models", "_voxel-skins.json"), "utf8"),
  ) as VoxelSkinOverridesFile;
  return file.overrides ?? {};
}

const champions = loadChampions();
const overrides = loadOverrides();
const inputs = champions.map(voxelSkinInputOf);
const generated = generateAllVoxelSkins(inputs, overrides);

const axisValue = (r: VoxelSkinRecipe, axis: string): string => {
  const [g, k] = axis.split(".") as [string, string];
  return String((r as unknown as Record<string, Record<string, unknown>>)[g]?.[k] ?? "");
};

describe("explainVoxelSkin describes the champion that actually ships", () => {
  it("has a roster to explain at all", () => {
    cover("voxel-skin-explain");
    // STRUCTURAL floor, and it is exactly what the test's own name claims: an
    // empty read makes every per-champion loop below a green no-op. It used to
    // be `>100` — the operating roster's size copied into a test — and the
    // 2026-08-13 legacy migration (119 → 78) is precisely how that kind of
    // copy fails: red here, nothing wrong with the explainer.
    expect(champions.length, "champions/ read as empty").toBeGreaterThan(0);
  });

  it("every explained value equals the generated recipe's value, for every champion", () => {
    cover("voxel-skin-explain");
    const mismatches: string[] = [];
    for (const input of inputs) {
      const recipe = generated.recipes.get(input.id);
      expect(recipe, `${input.id} has no recipe`).toBeDefined();
      const ex = explainVoxelSkin(input, {
        salt: recipe!.salt,
        override: overrides[input.id] ?? null,
      });
      for (const a of ex.axes) {
        const truth = axisValue(recipe!, a.axis);
        if (a.value !== truth) mismatches.push(`${input.id} ${a.axis}: said ${a.value}, is ${truth}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("covers every axis of the recipe that a viewer can see", () => {
    cover("voxel-skin-explain");
    const ex = explainVoxelSkin(inputs[0]!);
    expect(ex.axes.map((a) => a.axis)).toEqual([...EXPLAINED_AXES]);
    // 7 palette slots + 3 face + 1 hair + 3 outfit + 3 motifs
    expect(EXPLAINED_AXES.length).toBe(17);
    for (const a of ex.axes) {
      expect(a.label.length, `${a.axis} needs a human label`).toBeGreaterThan(0);
      expect(a.reason.length, `${a.axis} needs a reason`).toBeGreaterThan(0);
      expect(LAYER_LABEL[a.layer]).toBeTruthy();
    }
  });

  it("a hand-authored override is reported as L1 and nothing else claims it", () => {
    cover("voxel-skin-explain");
    // DERIVED FROM THE OVERRIDE FILE, not a named hero. This used to pin
    // `godie-h02s` (authored precisely BECAUSE the generator could only separate
    // it from its clone by id entropy) — and the 2026-08-13 legacy migration
    // moved that champion off the operating roster, so the guard died for a
    // reason that had nothing to do with the L1 layer. The property is: an axis
    // a human hand-authored must be REPORTED as hand-authored, and must name the
    // file it came from. Hold every LIVE override to it, whoever they turn out
    // to be.
    const authored = Object.entries(overrides).filter(
      ([id, ov]) => ov.palette?.outfitPrimary && inputs.some((i) => i.id === id),
    );
    // Structural floor: with nothing authored on the roster this test is
    // vacuous and the entire L1 layer is unguarded. That has to be red.
    expect(
      authored.length,
      "no champion on the roster is hand-authored — L1 would be untested",
    ).toBeGreaterThan(0);
    for (const [id, ov] of authored) {
      const input = inputs.find((i) => i.id === id)!;
      const ex = explainVoxelSkin(input, {
        salt: generated.recipes.get(id)!.salt,
        override: ov,
      });
      const outfit = ex.axes.find((a) => a.axis === "palette.outfitPrimary")!;
      expect(outfit.layer, id).toBe("L1-override");
      expect(outfit.value, id).toBe(ov.palette!.outfitPrimary);
      expect(outfit.evidence, id).toContain("_voxel-skins.json");
      // and the axes the override did NOT touch are still explained by a lower layer
      const untouched = ex.axes.filter((a) => a.layer !== "L1-override");
      expect(untouched.length, id).toBeGreaterThan(0);
    }
  });

  it("a keyword rule reports the WORD that fired it, not just the rule", () => {
    cover("voxel-skin-explain");
    // DERIVED. 貞子 (godie-e00t, 七夜怪談) was the canonical undead-by-name case
    // and left the operating roster in the 2026-08-13 legacy migration. Naming
    // one hero made this guard hostage to which heroes ship; the property it
    // actually defends is 「關鍵字層報出來的那個字，必須真的出現在這位英雄自己
    // 的字裡」 — so run it over EVERY champion whose skin tone came from L2.
    const skinOf = (i: (typeof inputs)[number]) =>
      explainVoxelSkin(i, { salt: generated.recipes.get(i.id)!.salt }).axes.find(
        (a) => a.axis === "palette.skin",
      )!;
    const keyworded = inputs.filter((i) => skinOf(i).layer === "L2-keyword");
    // Structural floor: a roster on which NOT ONE skin tone comes from a keyword
    // means the L2 table stopped firing entirely — red, not a quiet pass.
    expect(
      keyworded.length,
      "no champion's skin tone came from a keyword rule — L2 is dead",
    ).toBeGreaterThan(0);
    for (const input of keyworded) {
      const ex = explainVoxelSkin(input, { salt: generated.recipes.get(input.id)!.salt });
      const skin = ex.axes.find((a) => a.axis === "palette.skin")!;
      expect(skin.layer, input.id).toBe("L2-keyword");
      expect(skin.reason, input.id).toContain("關鍵字規則");
      // the evidence is a literal substring of the champion's own words
      const word = (skin.evidence ?? "").replace(/[「」]/g, "");
      expect(word.length, input.id).toBeGreaterThan(0);
      expect(ex.haystack, input.id).toContain(word);
    }
  });

  it("every rule hit carries a match that really occurs in the haystack", () => {
    cover("voxel-skin-explain");
    // the property that makes 「為什麼」 trustworthy across the whole roster
    for (const input of inputs) {
      const ex = explainVoxelSkin(input, { salt: generated.recipes.get(input.id)!.salt });
      for (const h of ex.hits) {
        expect(h.match.length, `${input.id} ${h.axis} empty match`).toBeGreaterThan(0);
        expect(ex.haystack, `${input.id} ${h.axis} match ${h.match} not in haystack`).toContain(
          h.match,
        );
      }
    }
  });

  it("the element layer names the vfxKey it read, or says there was none", () => {
    cover("voxel-skin-explain");
    for (const input of inputs.slice(0, 40)) {
      const ex = explainVoxelSkin(input, { salt: generated.recipes.get(input.id)!.salt });
      const primary = ex.axes.find((a) => a.axis === "palette.outfitPrimary")!;
      if (primary.layer !== "L3-element") continue;
      expect(primary.evidence, `${input.id}`).toBeTruthy();
      if (ex.elementSources.some((s) => s.element === ex.element)) {
        // it must be one of the champion's OWN ability effect keys
        expect(ex.elementSources.map((s) => s.vfxKey)).toContain(primary.evidence);
      } else {
        expect(primary.evidence).toContain("預設色帶");
      }
      expect(primary.reason).toContain(ex.element);
      expect(ex.elementBandHex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("says out loud when an axis is a pure hash draw", () => {
    cover("voxel-skin-explain");
    // The honest failure mode of a "why" page is inventing a rationale for a
    // coin flip. `evidence: null` + a reason that names the hash is the whole
    // point: it tells the owner "there is nothing to review here".
    let sawHash = false;
    for (const input of inputs) {
      const ex = explainVoxelSkin(input, { salt: generated.recipes.get(input.id)!.salt });
      for (const a of ex.axes) {
        if (a.layer !== "L4-hash") continue;
        sawHash = true;
        expect(a.evidence, `${input.id} ${a.axis} invented evidence for a hash draw`).toBeNull();
        expect(a.reason).toMatch(/雜湊/);
      }
    }
    expect(sawHash, "no axis anywhere fell through to the hash — suspicious").toBe(true);
  });

  it("a salt escalation is disclosed rather than hidden", () => {
    cover("voxel-skin-explain");
    for (const id of generated.escalated) {
      const input = inputs.find((i) => i.id === id)!;
      const ex = explainVoxelSkin(input, {
        salt: generated.recipes.get(id)!.salt,
        override: overrides[id] ?? null,
      });
      expect(ex.salt).toBeGreaterThan(1);
      const hashed = ex.axes.filter((a) => a.layer === "L4-hash");
      if (hashed.length > 0) expect(hashed[0]!.reason).toContain("salt");
    }
  });

  it("is PURE — explaining twice gives the identical object", () => {
    cover("voxel-skin-explain");
    const a = explainVoxelSkin(inputs[3]!, { salt: 1 });
    const b = explainVoxelSkin(inputs[3]!, { salt: 1 });
    expect(a).toEqual(b);
  });

  it("explaining does not perturb what the generator produces", () => {
    cover("voxel-skin-explain");
    // `explainVoxelSkin` re-runs the generator with a trace hook; a trace that
    // changed the result would make the page's numbers a different character's.
    for (const input of inputs.slice(0, 25)) {
      const salt = generated.recipes.get(input.id)!.salt;
      const ov = overrides[input.id] ?? null;
      const direct = generateVoxelSkin(input, { salt, override: ov });
      const ex = explainVoxelSkin(input, { salt, override: ov });
      for (const a of ex.axes) expect(a.value).toBe(axisValue(direct, a.axis));
    }
  });

  it("the summary line counts the layers that did the work", () => {
    cover("voxel-skin-explain");
    const ex = explainVoxelSkin(inputs[0]!);
    const s = explanationSummary(ex);
    expect(s.length).toBeGreaterThan(0);
    const total = [...s.matchAll(/(\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);
    expect(total).toBe(EXPLAINED_AXES.length);
  });

  it("matchRules stays stateless — the same haystack always fires the same rules", () => {
    cover("voxel-skin-explain");
    // `exec` on a /g regexp would advance lastIndex and make the SECOND call
    // miss. None of the patterns is /g; this is the assertion that keeps it so.
    const hay = "七夜怪談 貞子 骷髏 法師";
    const first = matchRules(hay);
    const second = matchRules(hay);
    expect(second.hits).toEqual(first.hits);
    expect([...second.forced]).toEqual([...first.forced]);
  });
});
