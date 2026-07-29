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
 * TASK #249 UN-PRUNED ALL FIVE, in two steps.
 *
 * FIRST, `godie-o02n`: the prune had it backwards. The map's `Eme1`/`Emeu`
 * fields make O02N the BASE unit of 曹操孟德 and the SHIPPED godie-o02o his
 * 87-03 天下號令 transform, so the prune deleted the hero and kept the
 * transformation. It is promoted (21 kept / 4 pruned at that point).
 *
 * THEN THE OTHER FOUR, once the transform mechanic actually landed. "Leaving
 * them out costs nothing while the mechanic does not exist" was true and stopped
 * being true: `applyChampionForm` re-points `ChampionComp.championId` at the
 * counterpart and the snapshot resolves `Champions.get(championId).modelKey`
 * every tick, and that call THROWS on an unregistered id — so the four are now
 * a hard requirement of the feature, not a completeness nicety. They live in
 * {@link ALTERNATE_FORM_IDS} rather than STANDIN_IDS because the draft role
 * heuristic does not apply to them; see that constant. 25 promoted / 0 pruned.
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
 *
 * THE OTHER FOUR LEFT TOO, one step later in #249, and are now listed in
 * {@link ALTERNATE_FORM_IDS}. Nothing is pruned any more, so this list is empty.
 */
const PRUNED_IDS: readonly string[] = [];

/**
 * The four 變身 ALTERNATE bodies (#249). A separate cohort from STANDIN_IDS on
 * purpose — same `drafts/champions/` origin, DIFFERENT rules:
 *
 *   godie-h00w  26 洨者狀態   ← godie-harf 開天闢地‧洨者聖臨
 *   godie-o030  30 變態紳士   ← godie-orkn 變態紳士
 *   godie-n01b  40 萬解       ← godie-nman 萬解-貓王胖虎
 *   godie-e010  70 紮根       ← godie-e00s 紮根
 *
 * WHY THEY EXIST AT ALL. They are not "kept because we keep everything": the
 * transform primitive re-points `ChampionComp.championId` at the counterpart,
 * and `Registry.get()` THROWS on an unregistered id while the snapshot resolves
 * every champion's model through it EVERY TICK. A transform into a body with no
 * doc does not fail to render — it takes the room down 30 times a second.
 *
 * WHY THEY ARE NOT IN `STANDIN_IDS`. The "ranged ⇒ `champ.sela`" role heuristic
 * below is a DRAFT-PROMOTION rule, and an alternate body must not follow it: its
 * stand-in has to match the body the player transforms OUT OF, or the swap reads
 * as a different character rather than the same one changed. `godie-n01b` is the
 * live case — ranged, but it wears `champ.skin.rogue` because 憤怒的胖虎 IS
 * godie-nman (`champ.skin.rogue`) mid-transform. Folding it into STANDIN_IDS
 * would force the rig to disagree with its own base half.
 */
const ALTERNATE_FORM_IDS = [
  "godie-e010",
  "godie-h00w",
  "godie-n01b",
  "godie-o030",
] as const;

/** Alternate body → the base hero whose stand-in rig it must mirror. */
const ALTERNATE_BASE: Record<string, string> = {
  "godie-e010": "godie-e00s",
  "godie-h00w": "godie-harf",
  "godie-n01b": "godie-nman",
  "godie-o030": "godie-orkn",
};

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
  it("all 21 kept champion docs exist, nothing is pruned any more (draft-promote-count)", () => {
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

  it("the four 變身 alternate bodies exist and mirror their base's rig (standin-alternate-forms)", () => {
    cover("draft-promote-count");
    // The inverse of the pruned check above: these four MUST be on disk, because
    // the transform re-points `championId` at them and the snapshot's
    // `Champions.get()` throws on an id the registry never saw.
    expect(ALTERNATE_FORM_IDS.length).toBe(4);
    for (const id of ALTERNATE_FORM_IDS) {
      expect(existsSync(join(CONTENT_DIR, "champions", `${id}.json`)), `${id} exists`).toBe(true);
      const alt = zChampionDoc.parse(readDoc(id));
      const base = zChampionDoc.parse(readDoc(ALTERNATE_BASE[id]!));
      // the rig follows the BASE hero, never the ranged/melee heuristic — this
      // is exactly what keeps a transform reading as "same character, changed"
      expect(alt.modelKey, `${id} rig mirrors ${base.id}`).toBe(base.modelKey);
      // and the link the sim actually reads points back at this body
      expect(base.transform?.counterpartId, `${base.id} → ${id}`).toBe(id);
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
