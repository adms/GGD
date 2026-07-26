/**
 * standin-roster (docs/todo/standin-roster.md): draft heroes promoted from
 * `tools/w3x-import/out/GoDieEX22s/drafts/champions/` into content/champions/ with
 * DEFAULT VOXEL BLOCK stand-in models (their WC3 models are Blizzard built-ins,
 * unavailable — explicit user directive). See drafts/PROMOTED.md for the mapping.
 *
 * Of the 25 promoted, 5 were pruned per the user's whitelist rule「盡量收，除非重複」
 * (keep everything except duplicates): godie-e010 / godie-o02n (exact-name twins of
 * godie-e00s / godie-o02o) and godie-h00w / godie-n01b / godie-o030 (exact-name
 * duplicates of live champions godie-harf / godie-nman / godie-orkn — transform
 * forms sharing the base hero's map number).
 *
 * TASK #249 UN-PRUNED ONE OF THEM. Four of those five really are ALTERNATE
 * (變身) bodies, so leaving them out costs nothing while the transform mechanic
 * does not exist. `godie-o02n` was the exception and the prune had it backwards:
 * the map's `Eme1`/`Emeu` fields make O02N the BASE unit of 曹操孟德 and the
 * SHIPPED godie-o02o his 87-03 天下號令 transform, so the prune deleted the hero
 * and kept the transformation. It is promoted, giving 21 kept / 4 pruned.
 *
 * IMPORTANT: this suite reads the promoted docs by DIRECT file path (not via
 * FsContentSource/ContentLoader) because content/champions/_index.json is only
 * rebuilt by `content:build` in the main session. Direct reads + zChampionDoc.parse
 * + ref checks against the EXISTING _index.json files keep the suite green both
 * before and after the reindex.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zChampionDoc, type ChampionDoc } from "./schema/champion";
import type { EffectDef } from "../sim/effects/effect";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

/** The 21 kept stand-ins (drafts/PROMOTED.md is the authoritative table). */
const STANDIN_IDS = [
  "godie-e00r",
  "godie-e00s",
  "godie-e00t",
  "godie-e00u",
  "godie-e00v",
  "godie-e015",
  "godie-h001",
  "godie-h021",
  "godie-h02k",
  "godie-h02n",
  "godie-h02s",
  "godie-h02y",
  "godie-h02z",
  "godie-n00b",
  "godie-n01l",
  "godie-o02n",
  "godie-o02o",
  "godie-u00b",
  "godie-u00k",
  "godie-u012",
  "godie-u01f",
] as const;

/**
 * Pruned duplicates — must NOT exist on disk (whitelist rule: 除非重複).
 *
 * `godie-o02n` was REMOVED from this list at task #249. The prune misread it:
 * the map's WC3 Metamorphosis fields (`Eme1`/`Emeu` on ability A0DB 87-03
 * 天下號令) make O02N 曹操孟德's BASE unit and O02O his TRANSFORMED body, so
 * "exact-name twin of godie-o02o" was the transform relationship, not a
 * duplicate — and dropping the base left the hero present in the game ONLY in
 * his transformed state. It is promoted now (see STANDIN_IDS).
 */
const PRUNED_IDS = ["godie-e010", "godie-h00w", "godie-n01b", "godie-o030"] as const;

/** The four KayKit voxel block model docs (pre-existing model@1 ids). */
const VOXEL_MODELS = ["champ.sela", "champ.thorne", "champ.skin.barbarian", "champ.skin.rogue"];

function readDoc(id: string): unknown {
  return JSON.parse(readFileSync(join(CONTENT_DIR, "champions", `${id}.json`), "utf-8"));
}

function indexIds(collection: string): Set<string> {
  const idx = JSON.parse(
    readFileSync(join(CONTENT_DIR, collection, "_index.json"), "utf-8"),
  ) as { entries: Array<{ id: string }> };
  return new Set(idx.entries.map((e) => e.id));
}

function walkEffects(effects: EffectDef[], visit: (e: EffectDef) => void): void {
  for (const e of effects) {
    visit(e);
    if (e.kind === "spawnProjectile") walkEffects(e.onHit, visit);
  }
}

const parsedDocs = (): ChampionDoc[] => STANDIN_IDS.map((id) => zChampionDoc.parse(readDoc(id)));

describe("voxel stand-in roster (standin-roster)", () => {
  it("all 21 kept champion docs exist, all 4 pruned duplicates are gone (draft-promote-count)", () => {
    cover("draft-promote-count");
    expect(STANDIN_IDS.length).toBe(21);
    expect(new Set<string>(STANDIN_IDS).size).toBe(21);
    for (const id of STANDIN_IDS) {
      expect(existsSync(join(CONTENT_DIR, "champions", `${id}.json`)), id).toBe(true);
    }
    for (const id of PRUNED_IDS) {
      expect(existsSync(join(CONTENT_DIR, "champions", `${id}.json`)), `${id} pruned`).toBe(false);
      expect(existsSync(join(CONTENT_DIR, "abilities", `${id}.ex.json`)), `${id} ex orphan`).toBe(false);
    }
  });

  it("every promoted doc is a valid champion@1 with matching id (standin-schema-valid)", () => {
    cover("standin-schema-valid");
    for (const id of STANDIN_IDS) {
      const doc = zChampionDoc.parse(readDoc(id)); // throws on drift
      expect(doc.id).toBe(id);
      expect(doc.schema).toBe("champion@1");
      // combined 名字+稱號 unified-name convention: non-empty, real map name
      expect(doc.name.length).toBeGreaterThan(0);
      for (const slot of ["Q", "W", "E", "R"] as const) {
        expect(doc.abilities[slot].slot).toBe(slot);
        expect(doc.abilities[slot].id).toBe(`${id}.${slot.toLowerCase()}`);
      }
    }
  });

  it("all hard refs resolve against the EXISTING indexes (standin-refs-closed)", () => {
    cover("standin-refs-closed");
    const models = indexIds("models");
    const items = indexIds("items");
    const projectiles = indexIds("projectiles");
    for (const doc of parsedDocs()) {
      expect(models.has(doc.modelKey), `${doc.id} modelKey ${doc.modelKey}`).toBe(true);
      for (const item of doc.buildPriority) {
        expect(items.has(item), `${doc.id} item ${item}`).toBe(true);
      }
      // exAbility (if any) must ref an EXISTING ability doc. Checked by direct
      // file existence (not _index.json) — the ex-docs for the promoted heroes
      // are regenerated by gen_ex_content.py and indexed on the next content:build.
      if (doc.exAbility !== undefined) {
        expect(
          existsSync(join(CONTENT_DIR, "abilities", `${doc.exAbility}.json`)),
          `${doc.id} exAbility ${doc.exAbility}`,
        ).toBe(true);
      }
      for (const slot of ["Q", "W", "E", "R"] as const) {
        walkEffects(doc.abilities[slot].effects, (e) => {
          if (e.kind === "spawnProjectile") {
            expect(projectiles.has(e.projectileId), `${doc.id} ${slot} proj`).toBe(true);
          }
        });
      }
    }
  });

  it("voxel models distributed by role heuristic, no mono-model roster (standin-model-dist)", () => {
    cover("standin-model-dist");
    const counts = new Map<string, number>();
    for (const doc of parsedDocs()) {
      expect(VOXEL_MODELS, `${doc.id} uses a voxel model`).toContain(doc.modelKey);
      counts.set(doc.modelKey, (counts.get(doc.modelKey) ?? 0) + 1);
      // ranged heroes always use the mage rig (only voxel attack clip that reads ranged)
      if (doc.attackType === "ranged") expect(doc.modelKey).toBe("champ.sela");
    }
    // all four voxel bodies are in use and no single model dominates the 25
    for (const m of VOXEL_MODELS) expect(counts.get(m) ?? 0, m).toBeGreaterThan(0);
    for (const [m, n] of counts) expect(n, `${m} over-assigned`).toBeLessThanOrEqual(12);
  });

  it('every promoted doc is tagged "voxel-standin" for the later model swap (standin-tag)', () => {
    cover("standin-tag");
    for (const doc of parsedDocs()) {
      expect(doc.tags, doc.id).toContain("voxel-standin");
      // still carries the import lineage tags used by the rest of the roster
      expect(doc.tags).toContain("wc3-import");
      expect(doc.tags).toContain("godie");
    }
  });
});
