/**
 * Champion + prop model SCALE consistency (models.md: mdl-02..mdl-05).
 *
 * Every champion should render at a consistent height (~1.70 world units) and
 * no model should be a giant outlier. Measuring real .glb geometry in-process
 * is heavy, so heights are precomputed once (Babylon NullEngine, the client's
 * load path) into modelScale.fixture.json; this suite reads that fixture and
 * multiplies by the LIVE `scale` in content/models/*.json (a direct file read,
 * index-independent — mirrors flowerModel.test.ts), so a stale fixture or a
 * hand-edited scale is caught.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

interface Champ {
  modelKey: string;
  family: "imported" | "kaykit" | "blocky";
  fullHeight: number;
  normHeight: number;
  newScale: number;
  empty: boolean;
}
interface Prop {
  modelKey: string;
  scale: number;
  collisionRadius: number;
  meshHeight: number;
  meshWidthX: number;
}
interface Fixture {
  target: number;
  champions: Champ[];
  props: Prop[];
}

const fixture: Fixture = JSON.parse(
  readFileSync(join(HERE, "modelScale.fixture.json"), "utf8"),
);
const liveScale = (modelKey: string): number => {
  const doc = JSON.parse(readFileSync(join(CONTENT_DIR, `models/${modelKey}.json`), "utf8"));
  return doc.scale as number;
};
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

const realChamps = fixture.champions.filter((c) => !c.empty);

describe("champion scale normalization (model-scale-champion-band)", () => {
  it("has a roster to check and a median near the 1.70 target", () => {
    cover("model-scale-champion-band");
    expect(realChamps.length).toBeGreaterThan(40);
    const med = median(realChamps.map((c) => c.normHeight * liveScale(c.modelKey)));
    expect(med).toBeGreaterThanOrEqual(1.6);
    expect(med).toBeLessThanOrEqual(1.85);
  });

  it("renders every champion's normalized height inside the plausible band ~1.5–1.9u", () => {
    cover("model-scale-champion-band");
    for (const c of realChamps) {
      const rendered = c.normHeight * liveScale(c.modelKey);
      expect(rendered, `${c.modelKey} normalized render height`).toBeGreaterThanOrEqual(1.5);
      expect(rendered, `${c.modelKey} normalized render height`).toBeLessThanOrEqual(1.9);
    }
  });

  it("exempts the empty-glb model (procedural fallback) from height checks", () => {
    cover("model-scale-champion-band");
    const empty = fixture.champions.filter((c) => c.empty);
    for (const c of empty) expect(c.fullHeight).toBe(0);
    expect(fixture.champions.some((c) => c.modelKey === "imported.collision" && c.empty)).toBe(true);
  });
});

describe("no giant-outlier champions (model-scale-no-giant)", () => {
  it("keeps every champion's full silhouette under 3× the roster median and 2.5u", () => {
    cover("model-scale-no-giant");
    const full = realChamps.map((c) => c.fullHeight * liveScale(c.modelKey));
    const med = median(full);
    for (const c of realChamps) {
      const rendered = c.fullHeight * liveScale(c.modelKey);
      expect(rendered, `${c.modelKey} full render height vs 3× median`).toBeLessThanOrEqual(3 * med);
      expect(rendered, `${c.modelKey} full render height ceiling`).toBeLessThanOrEqual(2.5);
      expect(rendered, `${c.modelKey} full render height floor`).toBeGreaterThanOrEqual(1.4);
    }
    // the specific reported "too big" models are now normalized
    for (const k of ["imported.heropikachu", "imported.bulbasaur", "imported.picacugy"]) {
      const c = realChamps.find((x) => x.modelKey === k)!;
      expect(c.fullHeight * liveScale(k), `${k} no longer 3.0u`).toBeLessThanOrEqual(1.85);
    }
  });
});

describe("scale fixture stays in sync with docs (model-scale-fixture-sync)", () => {
  it("every champion's live scale equals the fixture's recorded newScale", () => {
    cover("model-scale-fixture-sync");
    for (const c of fixture.champions) {
      expect(liveScale(c.modelKey), `${c.modelKey} scale drifted from fixture`).toBeCloseTo(
        c.newScale,
        6,
      );
    }
  });
});

describe("prop.flower is a footprint objective, not a champion (model-prop-flower-band)", () => {
  it("keeps the flower scale contract, collision radius, and a flat footprint-sized visual", () => {
    cover("model-prop-flower-band");
    const flower = fixture.props.find((p) => p.modelKey === "prop.flower")!;
    const doc = JSON.parse(readFileSync(join(CONTENT_DIR, "models/prop.flower.json"), "utf8"));
    // existing sim + content contract (flowerModel.test.ts / FLOWER_RADIUS)
    expect(doc.scale).toBeGreaterThanOrEqual(6);
    expect(doc.scale).toBeLessThanOrEqual(12);
    expect(doc.collisionRadius).toBe(0.7);
    // visual reads as a flat lily pad sized to the ~1.4u collision footprint,
    // NOT a champion-tall model and NOT a giant disc
    const renderedH = flower.meshHeight * doc.scale;
    const renderedW = flower.meshWidthX * doc.scale;
    expect(renderedH, "flower is flat, well under champion height").toBeLessThan(0.5);
    expect(renderedW, "flower footprint is visible").toBeGreaterThan(0.4);
    expect(renderedW, "flower footprint ~ collision diameter, not a giant disc").toBeLessThanOrEqual(
      2 * doc.collisionRadius * 1.15,
    );
  });
});
