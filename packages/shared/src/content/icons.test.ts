/**
 * w3x icon extraction (docs/todo/icons.md, task #33 EXTRACTION half).
 *
 * `tools/w3x-import/extract_icons.py` re-reads raw/war3map.{w3u,w3a,w3t}
 * (`uico`/`aart`/`iico` — fields the parsed inventory had dropped), converts
 * every icon whose path exists INSIDE GoDieEX22s.w3x (membership test, not
 * path prefix) from BLP to PNG under `content/assets/icons/…`, and additively
 * patches `icon` into champion docs (top-level + embedded Q/W/E/R), standalone
 * ability docs (incl. .ex) and item docs. STOCK Blizzard art gets NO field —
 * the client keeps its fallback rendering.
 *
 * IMPORTANT: this suite reads docs by DIRECT file path (not via
 * FsContentSource/ContentLoader) because the content indexes are only rebuilt
 * by `content:build` in the main session — same convention as
 * standinRoster.test.ts. It must stay green before AND after the reindex.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zChampionDoc, type ChampionDoc } from "./schema/champion";
import { zAbilityDoc } from "./schema/ability";
import { zItemDoc } from "./schema/item";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const ICON_DIR = join(CONTENT_DIR, "assets", "icons");

/** Coverage floors from the extraction run (ICONS.md); regeneration may only grow them. */
const FLOOR = { champions: 85, abilities: 13, items: 15 } as const;

/** Pruned duplicate champions — must never get icon PNGs resurrected. */
const PRUNED_IDS = ["godie-e010", "godie-o02n", "godie-h00w", "godie-n01b", "godie-o030"];

const ICON_RE = /^assets\/icons\/(champions|abilities|items)\/[a-z0-9.-]+\.png$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function docs(collection: string): Array<{ file: string; doc: Record<string, unknown> }> {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({
      file: f,
      doc: JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<
        string,
        unknown
      >,
    }));
}

function pngIds(kind: string): string[] {
  const dir = join(ICON_DIR, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.slice(0, -4));
}

/** Every `icon` value found anywhere in the content tree (value -> referrers). */
function allIconRefs(): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const add = (icon: unknown, from: string) => {
    if (typeof icon !== "string") return;
    refs.set(icon, [...(refs.get(icon) ?? []), from]);
  };
  for (const { file, doc } of docs("champions")) {
    add(doc.icon, `champions/${file}`);
    const abilities = (doc.abilities ?? {}) as Record<string, { icon?: unknown }>;
    for (const slot of ["Q", "W", "E", "R"]) add(abilities[slot]?.icon, `champions/${file}#${slot}`);
  }
  for (const { file, doc } of docs("abilities")) add(doc.icon, `abilities/${file}`);
  for (const { file, doc } of docs("items")) add(doc.icon, `items/${file}`);
  return refs;
}

describe("w3x original icons (icons)", () => {
  it("every doc carrying an icon still parses as its strict schema (icon-schema-valid)", () => {
    cover("icon-schema-valid");
    for (const { file, doc } of docs("champions")) {
      const parsed = zChampionDoc.parse(doc); // throws on drift
      if (parsed.icon !== undefined) expect(parsed.icon, file).toMatch(ICON_RE);
      for (const slot of ["Q", "W", "E", "R"] as const) {
        const icon = (parsed as ChampionDoc).abilities[slot].icon;
        if (icon !== undefined) expect(icon, `${file}#${slot}`).toMatch(ICON_RE);
      }
    }
    for (const { file, doc } of docs("abilities")) {
      const parsed = zAbilityDoc.parse(doc);
      if (parsed.icon !== undefined) expect(parsed.icon, file).toMatch(ICON_RE);
    }
    for (const { file, doc } of docs("items")) {
      const parsed = zItemDoc.parse(doc);
      if (parsed.icon !== undefined) expect(parsed.icon, file).toMatch(ICON_RE);
    }
  });

  it("every icon ref resolves to a real PNG on disk (icon-refs-resolve)", () => {
    cover("icon-refs-resolve");
    const refs = allIconRefs();
    expect(refs.size).toBeGreaterThan(0);
    for (const [icon, from] of refs) {
      const abs = join(CONTENT_DIR, icon);
      expect(existsSync(abs), `${icon} (from ${from[0]})`).toBe(true);
      const head = readFileSync(abs).subarray(0, 4);
      expect(head.equals(PNG_MAGIC), `${icon} PNG magic`).toBe(true);
    }
  });

  it("extraction coverage floors hold per kind (icon-coverage-floor)", () => {
    cover("icon-coverage-floor");
    expect(pngIds("champions").length).toBeGreaterThanOrEqual(FLOOR.champions);
    expect(pngIds("abilities").length).toBeGreaterThanOrEqual(FLOOR.abilities);
    expect(pngIds("items").length).toBeGreaterThanOrEqual(FLOOR.items);
  });

  it("embedded Q/W/E/R icons agree with their standalone twins (icon-embed-standalone-agree)", () => {
    cover("icon-embed-standalone-agree");
    for (const { file, doc } of docs("champions")) {
      const cid = file.slice(0, -5);
      const abilities = (doc.abilities ?? {}) as Record<string, { icon?: string }>;
      for (const slot of ["Q", "W", "E", "R"]) {
        const twin = join(CONTENT_DIR, "abilities", `${cid}.${slot.toLowerCase()}.json`);
        if (!existsSync(twin)) continue;
        const standalone = JSON.parse(readFileSync(twin, "utf-8")) as { icon?: string };
        expect(standalone.icon, `${cid}.${slot}`).toBe(abilities[slot]?.icon);
      }
    }
  });

  it("EX docs carry an icon IFF their PNG exists — regen-safe (icon-ex-consistency)", () => {
    cover("icon-ex-consistency");
    let exWithIcon = 0;
    for (const { doc } of docs("champions")) {
      const ex = doc.exAbility as string | undefined;
      if (ex === undefined) continue;
      const exDocPath = join(CONTENT_DIR, "abilities", `${ex}.json`);
      expect(existsSync(exDocPath), `${ex} doc`).toBe(true);
      const exDoc = JSON.parse(readFileSync(exDocPath, "utf-8")) as { icon?: string };
      const png = join(ICON_DIR, "abilities", `${ex}.png`);
      if (existsSync(png)) {
        expect(exDoc.icon, `${ex} icon field`).toBe(`assets/icons/abilities/${ex}.png`);
        exWithIcon += 1;
      } else {
        expect(exDoc.icon, `${ex} must not fabricate an icon`).toBeUndefined();
      }
    }
    expect(exWithIcon).toBeGreaterThanOrEqual(1);
  });

  it("no orphan or resurrected PNGs on disk (icon-no-orphans)", () => {
    cover("icon-no-orphans");
    const referenced = new Set(allIconRefs().keys());
    for (const kind of ["champions", "abilities", "items"] as const) {
      for (const id of pngIds(kind)) {
        expect(referenced.has(`assets/icons/${kind}/${id}.png`), `${kind}/${id}.png`).toBe(true);
        for (const pruned of PRUNED_IDS) {
          expect(id === pruned || id.startsWith(`${pruned}.`), `${id} pruned champion`).toBe(false);
        }
      }
    }
  });
});
