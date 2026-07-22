/**
 * Champion model FULL-BBOX guard (models.md: mdl-07 — stray effect-mesh cleanup).
 *
 * The #1 modelScale guard checks BODY height (the largest-vertex mesh, always
 * ~1.7u), so it cannot see a stray effect/beam geoset baked into a glb — that is
 * exactly how 高町奈葉 (imported.niya) shipped as a giant with a 14.5u invisible
 * team-glow beam. This guard asserts the TRUE full-bbox height (every mesh) of
 * each ACTIVE champion model renders within a sane cap, so any future stray
 * effect mesh fails loudly.
 *
 * Real .glb geometry is measured once (Babylon NullEngine — the client's load
 * path) into modelBbox.fixture.json; this suite reads that fixture and
 * multiplies fullHeight by the LIVE `scale` in content/models/*.json (a direct
 * file read, index-independent), so a stale fixture or a hand-edited scale is
 * caught. The roster/families come from the sibling modelScale fixture.
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
  glbPath: string;
  family: "imported" | "kaykit";
  empty: boolean;
  fullHeight: number;
  scale: number;
  renderedFull: number;
  animGroups: number;
  allowlisted: boolean;
}
interface Fixture {
  standardCap: number;
  hardCeiling: number;
  allowlist: string[];
  champions: Champ[];
}

const fx: Fixture = JSON.parse(
  readFileSync(join(HERE, "modelBbox.fixture.json"), "utf8"),
);
const liveScale = (modelKey: string): number =>
  JSON.parse(readFileSync(join(CONTENT_DIR, `models/${modelKey}.json`), "utf8")).scale as number;

const realChamps = fx.champions.filter((c) => !c.empty);
// rendered full-bbox height using the LIVE doc scale (not the frozen fixture one)
const renderedFull = (c: Champ): number => c.fullHeight * liveScale(c.modelKey);

describe("no stray effect/beam mesh inflates a champion glb (model-fullbbox-ceiling)", () => {
  it("keeps EVERY champion's true full-bbox render height under the hard ceiling", () => {
    cover("model-fullbbox-ceiling");
    expect(realChamps.length).toBeGreaterThan(40);
    for (const c of realChamps) {
      expect(
        renderedFull(c),
        `${c.modelKey} full-bbox render height exceeds hard ceiling ${fx.hardCeiling}u ` +
          `(a stray effect/beam mesh baked into the glb?)`,
      ).toBeLessThanOrEqual(fx.hardCeiling);
    }
  });
});

describe("champion silhouettes stay near body height (model-fullbbox-standard-cap)", () => {
  it("keeps every NON-allowlisted champion's full-bbox render height under the standard cap", () => {
    cover("model-fullbbox-standard-cap");
    for (const c of realChamps) {
      if (c.allowlisted) continue;
      expect(
        renderedFull(c),
        `${c.modelKey} full-bbox render height over standard cap ${fx.standardCap}u — ` +
          `add to the documented allowlist only if the extra height is OPAQUE body geometry`,
      ).toBeLessThanOrEqual(fx.standardCap);
    }
  });

  it("keeps the legit-big allowlist small, documented, and genuinely tall", () => {
    cover("model-fullbbox-standard-cap");
    // small + no dead entries
    expect(fx.allowlist.length).toBeLessThanOrEqual(5);
    for (const mk of fx.allowlist) {
      const c = fx.champions.find((x) => x.modelKey === mk);
      expect(c, `allowlist entry ${mk} is not a champion model`).toBeTruthy();
      // an allowlisted model must actually need it (else it is dead allowlist)
      expect(
        c!.fullHeight * c!.scale,
        `${mk} is on the allowlist but is not taller than the standard cap`,
      ).toBeGreaterThan(fx.standardCap);
      // ...but still bounded by the hard ceiling
      expect(renderedFull(c!)).toBeLessThanOrEqual(fx.hardCeiling);
    }
  });
});

describe("the #17 stray-mesh strip landed and holds (model-effect-mesh-cleanup)", () => {
  // ceilings just above each model's measured post-strip height — a re-baked
  // beam/effect would blow past these
  const PINS: Record<string, number> = {
    "imported.niya": 1.85, // was 14.49 (8.5x) — the reported giant
    "imported.heromiku": 2.15, // was 4.27
    "imported.ma": 1.85, // was 3.97
    "imported.picacugy": 2.4, // was 3.61
    "imported.renaryugu2": 1.85, // was 2.52
    "imported.cloud": 2.05, // was 2.44 (Buster Sword kept)
    "imported.herosaber": 1.85, // was 2.41 (Excalibur kept)
  };
  it("every stripped champion now renders at champion size, not a giant", () => {
    cover("model-effect-mesh-cleanup");
    for (const [mk, cap] of Object.entries(PINS)) {
      const c = fx.champions.find((x) => x.modelKey === mk);
      expect(c, `${mk} missing from fixture`).toBeTruthy();
      expect(c!.empty).toBe(false);
      expect(renderedFull(c!), `${mk} not stripped / regressed`).toBeLessThanOrEqual(cap);
    }
    // niya specifically is no longer the 8.5x giant
    const niya = fx.champions.find((x) => x.modelKey === "imported.niya")!;
    expect(niya.fullHeight, "niya full bbox still giant").toBeLessThan(2.0);
  });
});

describe("bbox fixture stays in sync with docs (model-fullbbox-fixture-sync)", () => {
  it("every champion's live scale equals the fixture's recorded scale", () => {
    cover("model-fullbbox-fixture-sync");
    for (const c of fx.champions) {
      expect(liveScale(c.modelKey), `${c.modelKey} scale drifted from fixture`).toBeCloseTo(
        c.scale,
        6,
      );
    }
  });

  it("exempts the empty-glb model (procedural fallback) from bbox checks", () => {
    cover("model-fullbbox-fixture-sync");
    const empty = fx.champions.filter((c) => c.empty);
    expect(empty.some((c) => c.modelKey === "imported.collision")).toBe(true);
    for (const c of empty) expect(c.fullHeight).toBe(0);
  });
});
