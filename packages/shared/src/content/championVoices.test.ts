/**
 * champion voices: config.champion-voices@1 (task #27 — clicking your own hero
 * plays that champion's voice). Checks BOTH the schema (synthetic docs through
 * the config union) and the real authored `content/config/champion-voices.json`:
 * every champion doc has an entry, quip champions carry their map clips
 * (皮卡丘 → pikakill), no-quip champions fall back to `source: "none"` with a
 * soundset hint, and every referenced clip exists on disk.
 *
 * Like audioAssets.test.ts it reads the authored file by DIRECT path (not
 * FsContentSource/ContentLoader) so it stays green both BEFORE and AFTER
 * `content:build` reindexes the config collection.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import {
  zConfigChampionVoicesDoc,
  zConfigDoc,
  type ConfigChampionVoicesDoc,
} from "./schema/config";
import { validateDoc } from "./loader";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");

function loadDoc(): ConfigChampionVoicesDoc {
  const raw = JSON.parse(readFileSync(join(CONTENT, "config/champion-voices.json"), "utf8"));
  return zConfigChampionVoicesDoc.parse(raw);
}

describe("config.champion-voices@1 schema", () => {
  it("round-trips a valid doc through the config union", () => {
    cover("champion-voices-schema");
    const sample = {
      id: "champion-voices",
      schema: "config.champion-voices@1" as const,
      champions: {
        "godie-ofar": {
          select: ["assets/audio/sfx/pikakill.mp3"],
          source: "map-quip" as const,
          soundset: "Dryad",
        },
        "godie-e002": { select: [], source: "none" as const, soundset: "Naisha" },
        sela: { select: [], source: "none" as const, soundset: null },
      },
    };
    const parsed = zConfigChampionVoicesDoc.parse(sample);
    expect(parsed.champions["godie-ofar"]?.select).toContain("assets/audio/sfx/pikakill.mp3");

    // accepted by the collection discriminated union (schema tag)
    const viaUnion = zConfigDoc.parse(sample);
    expect(viaUnion.schema).toBe("config.champion-voices@1");

    // and through the loader's collection validator (as the pipeline sees it)
    const res = validateDoc("config", sample);
    expect(res.ok).toBe(true);
  });

  it("rejects non-assets clip paths, bad sources and unknown keys", () => {
    cover("champion-voices-schema");
    const bad = {
      id: "champion-voices",
      schema: "config.champion-voices@1",
      champions: {
        a: { select: ["/etc/passwd.mp3"], source: "map-quip", soundset: null },
        b: { select: [], source: "blizzard", soundset: null }, // not an allowed source
        c: { select: [], source: "none", soundset: null, extra: true }, // strict
      },
    };
    const res = validateDoc("config", bad);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    const paths = res.issues.map((i) => i.path);
    expect(paths.some((p) => p.startsWith("champions.a.select"))).toBe(true);
    expect(paths.some((p) => p.startsWith("champions.b.source"))).toBe(true);
    expect(res.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
  });
});

describe("authored content/config/champion-voices.json", () => {
  it("schema-parses and covers EVERY champion doc with exactly one entry", () => {
    cover("champion-voices-authored");
    const doc = loadDoc();
    const champIds = readdirSync(join(CONTENT, "champions"))
      .filter((f) => f.endsWith(".json") && f !== "_index.json")
      .map((f) => f.replace(/\.json$/, ""));
    expect(champIds.length).toBeGreaterThan(0);
    for (const id of champIds) {
      expect(doc.champions[id], `missing champion-voices entry for ${id}`).toBeDefined();
    }
    // no orphan entries pointing at deleted champions either
    const known = new Set(champIds);
    for (const id of Object.keys(doc.champions)) {
      expect(known.has(id), `orphan champion-voices entry ${id}`).toBe(true);
    }
  });

  it("皮卡丘 (godie-ofar + variant godie-o02l) selects the pikakill map quip", () => {
    cover("champion-voices-authored");
    const doc = loadDoc();
    for (const id of ["godie-ofar", "godie-o02l"]) {
      const entry = doc.champions[id];
      expect(entry?.source).toBe("map-quip");
      expect(entry?.select).toContain("assets/audio/sfx/pikakill.mp3");
    }
  });

  it("a no-quip champion has source none, empty pool and a soundset hint", () => {
    cover("champion-voices-authored");
    const doc = loadDoc();
    const entry = doc.champions["godie-e002"];
    expect(entry?.source).toBe("none");
    expect(entry?.select).toEqual([]);
    expect(entry?.soundset).toBe("Naisha");
  });

  it("map-quip entries are consistent and every referenced clip exists on disk", () => {
    cover("champion-voices-authored");
    const doc = loadDoc();
    for (const [id, entry] of Object.entries(doc.champions)) {
      if (entry.source === "map-quip") {
        expect(entry.select.length, `${id}: map-quip entry with empty pool`).toBeGreaterThan(0);
      } else {
        expect(entry.select, `${id}: source none must have an empty pool`).toEqual([]);
      }
      for (const clip of entry.select) {
        expect(existsSync(join(CONTENT, clip)), `${id}: missing clip file ${clip}`).toBe(true);
      }
    }
  });
});
