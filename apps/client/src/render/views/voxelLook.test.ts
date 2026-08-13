/**
 * voxelLook guard (#226).
 *
 * The whole point of the module is that 44 champions sharing four meshes still
 * read as 44 different characters, WITHOUT randomness. So the two things worth
 * testing are exactly those: determinism, and spread across the REAL roster —
 * not a synthetic id list, because the actual champion ids are CJK strings whose
 * shared prefixes are precisely what a weak hash collides on.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHETYPE_BY_MODEL_KEY, fallbackAccentFor, fnv1a, voxelLookFor } from "./voxelLook";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../../content");

/** Every champion that actually resolves to one of the generated blocky meshes. */
function blockyRoster(): { id: string; modelKey: string }[] {
  const out: { id: string; modelKey: string }[] = [];
  for (const f of readdirSync(join(CONTENT, "champions"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(CONTENT, "champions", f), "utf8")) as {
      id?: string;
      modelKey?: string;
    };
    if (doc.id && doc.modelKey && ARCHETYPE_BY_MODEL_KEY[doc.modelKey]) {
      out.push({ id: doc.id, modelKey: doc.modelKey });
    }
  }
  return out;
}

const ROSTER = blockyRoster();

describe("voxelLookFor is deterministic", () => {
  it("returns the same look for the same id, every call", () => {
    for (const { id, modelKey } of ROSTER.slice(0, 12)) {
      const a = voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!);
      const b = voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("never consults Math.random — a stubbed-out RNG changes nothing", () => {
    const real = Math.random;
    const first = voxelLookFor("godie-n00b", "mage");
    Math.random = () => 0.123456;
    try {
      expect(JSON.stringify(voxelLookFor("godie-n00b", "mage"))).toBe(JSON.stringify(first));
    } finally {
      Math.random = real;
    }
  });

  it("is total: an empty id and an unknown archetype still produce a look", () => {
    const look = voxelLookFor("", "no-such-archetype");
    expect(look.palette).toHaveLength(8);
    expect(look.proportions.head).toBeGreaterThan(0);
  });

  it("folds the HIGH byte of every character, so CJK ids cannot collide on a prefix", () => {
    // charCodeAt > 0xff for these; a naive `h ^= code & 0xff` hashes 丘 and 桶
    // identically whenever their low bytes match.
    expect(fnv1a("皮卡丘")).not.toBe(fnv1a("皮卡桶"));
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });
});

describe("the real roster comes out visually distinct", () => {
  it("穿體素身體的英雄都被涵蓋到 —— 而且不是空跑", () => {
    // GH#323 —— ⛔ 不寫 `>= 40`：那是搬家前的族群大小，名單一動就用
    //    「21 不到 40」這種跟「外觀會不會撞」無關的訊息紅。
    expect(ROSTER.length, "沒有任何英雄穿體素身體 —— 底下每一條都會空跑").toBeGreaterThan(0);
  });

  it("no two champions share BOTH a palette and a prop silhouette", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const { id, modelKey } of ROSTER) {
      const look = voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!);
      // the two axes a player actually reads at combat camera distance
      const sig = `${modelKey}|${look.palette.map((c) => c.join(",")).join(";")}|${Object.values(look.props).join("")}`;
      const prev = seen.get(sig);
      if (prev) clashes.push(`${prev} ↔ ${id}`);
      else seen.set(sig, id);
    }
    expect(clashes, `champions rendering identically: ${clashes.join(", ")}`).toEqual([]);
  });

  it("champions on the SAME mesh still differ in colour", () => {
    // the case the retired 2-entry ACCENTS table could never handle: 18
    // champions on champ.sela used to render in one shade of grey.
    const sela = ROSTER.filter((c) => c.modelKey === "champ.sela");
    expect(sela.length).toBeGreaterThan(5);
    const cloths = new Set(sela.map((c) => voxelLookFor(c.id, "mage").palette[1].join(",")));
    expect(cloths.size).toBeGreaterThan(sela.length / 2);
  });

  it("keeps every proportion set inside ±20 % so #150's uniform height survives", () => {
    for (const { id, modelKey } of ROSTER) {
      const p = voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!).proportions;
      for (const [axis, v] of Object.entries(p)) {
        if (axis === "shoulderOffset") {
          expect(Math.abs(v)).toBeLessThanOrEqual(0.03);
          continue;
        }
        expect(v, `${id}.${axis}`).toBeGreaterThanOrEqual(0.8);
        expect(v, `${id}.${axis}`).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it("emits colour channels in 0..1, never out of gamut", () => {
    for (const { id, modelKey } of ROSTER) {
      for (const c of voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!).palette) {
        for (const ch of c) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("the archetype biases the props without deciding the colours", () => {
  it("a barbarian is usually bare-headed, a mage usually is not", () => {
    const hats = (arch: string) =>
      ROSTER.filter((c) => voxelLookFor(c.id, arch).props.hat).length / ROSTER.length;
    expect(hats("mage")).toBeGreaterThan(hats("barbarian"));
  });

  it("the undead wears no props at all by bias, and shambles", () => {
    const bare = ROSTER.filter((c) => {
      const p = voxelLookFor(c.id, "undead").props;
      return !p.hat && !p.pack && !p.pauldron;
    }).length;
    expect(bare / ROSTER.length).toBeGreaterThan(0.6);
  });
});

describe("the procedural fallback shares the champion's seed", () => {
  it("the fallback accent IS the baked accent slot — the two paths cannot drift", () => {
    const look = voxelLookFor("godie-n00b", "mage");
    expect(fallbackAccentFor("godie-n00b", "mage")).toEqual([...look.palette[3]]);
  });

  it("falls back to neutral grey when the seat has not resolved yet", () => {
    expect(fallbackAccentFor(null, "mage")).toEqual([0.5, 0.5, 0.55]);
  });
});
