/**
 * Task #30 schema gate:
 *   schema-extend  — vfx@1 WC3 extensions parse (all optional; legacy docs
 *                    valid) and the sanity refinements reject bad shapes.
 *   ribbon-schema  — ribbon@1 docs parse standalone AND through the shared
 *                    vfx collection union; the ambient-vfx config doc parses
 *                    through the config collection; registerAll splits the
 *                    vfx collection into VfxDefs / RibbonDefs.
 * Fixtures include REAL importer-generated docs from content/vfx.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import {
  zVfxDoc,
  zRibbonDoc,
  zVfxCollectionDoc,
  zConfigAmbientVfxDoc,
  type RibbonDoc,
  type VfxDoc,
} from "./schema/index";
import { validateDoc } from "./loader";
import { ContentStore } from "./store";
import { RibbonDefs, VfxDefs, registerAll } from "./registries";

const CONTENT_VFX_DIR = join(__dirname, "../../../../content/vfx");

const EXTENDED_VFX = {
  id: "fx.test-extended",
  schema: "vfx@1",
  emitter: { shape: "point" },
  mode: "burst",
  burstCount: 12,
  lifetimeSec: { min: 0.3, max: 0.8 },
  size: { start: 0.5, end: 0.1 },
  color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
  blendMode: "modulate",
  texture: "assets/textures/particles/flame_01.png",
  gravityY: -9.8,
  colorStops: [
    [0, [1, 1, 1, 1]],
    [0.4, [1, 0.5, 0.2, 0.8]],
    [1, [0, 0, 0, 0]],
  ],
  sizeStops: [
    [0, 0.5],
    [0.5, 0.9],
    [1, 0.1],
  ],
  spriteSheet: { rows: 4, cols: 4, cycleSec: 0.5, randomStartCell: true },
  stretched: true,
  tailLength: 2.5,
  speed: { min: 0.5, max: 1.5 },
  anchorBone: "Bone_Chest",
  ambient: true,
} as const;

const RIBBON = {
  id: "fx.test-ribbon",
  schema: "ribbon@1",
  texture: "assets/textures/particles/wc3/ribbonblur1.png",
  widthAbove: 0.4,
  widthBelow: 0.2,
  lifespanSec: 0.5,
  color: [1, 0.2, 0.2, 0.9],
  uvScrollPerSec: 1.5,
  blendMode: "additive",
  anchorBone: "Bone_Weapon",
} as const;

afterEach(() => {
  VfxDefs.clear();
  RibbonDefs.clear();
});

describe("vfx@1 WC3 extensions (schema-extend)", () => {
  it("parses the fully-extended doc and every legacy/importer doc on disk", () => {
    cover("schema-extend");
    const doc = zVfxDoc.parse(EXTENDED_VFX);
    expect(doc.gravityY).toBe(-9.8);
    expect(doc.colorStops).toHaveLength(3);
    expect(doc.sizeStops).toHaveLength(3);
    expect(doc.blendMode).toBe("modulate");
    expect(doc.spriteSheet).toEqual({ rows: 4, cols: 4, cycleSec: 0.5, randomStartCell: true });
    expect(doc.stretched).toBe(true);
    expect(doc.tailLength).toBe(2.5);
    expect(doc.speed).toEqual({ min: 0.5, max: 1.5 });
    expect(doc.anchorBone).toBe("Bone_Chest");
    expect(doc.ambient).toBe(true);

    // alphaKey is a legal blend mode
    expect(zVfxDoc.parse({ ...EXTENDED_VFX, blendMode: "alphaKey" }).blendMode).toBe("alphaKey");

    // every doc already authored/imported in content/vfx stays valid
    const files = readdirSync(CONTENT_VFX_DIR).filter(
      (f) => f.endsWith(".json") && f !== "_index.json",
    );
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) {
      const raw: unknown = JSON.parse(readFileSync(join(CONTENT_VFX_DIR, f), "utf8"));
      const res = zVfxCollectionDoc.safeParse(raw);
      expect(res.success, `${f} must parse`).toBe(true);
    }
  });

  it("rejects unsorted stops, >4 stops, sheet-without-texture, speed max<min", () => {
    cover("schema-extend");
    const bad = (patch: Record<string, unknown>): string[] => {
      const res = zVfxDoc.safeParse({ ...EXTENDED_VFX, ...patch });
      expect(res.success).toBe(false);
      return res.success ? [] : res.error.issues.map((i) => i.path.join("."));
    };
    expect(
      bad({
        colorStops: [
          [0.5, [1, 1, 1, 1]],
          [0.2, [1, 1, 1, 0]],
        ],
      }),
    ).toContain("colorStops");
    expect(
      bad({
        sizeStops: [
          [0.5, 1],
          [0.5, 2],
        ],
      }),
    ).toContain("sizeStops");
    expect(bad({ colorStops: [[0, [1, 1, 1, 1]], [0.2, [1, 1, 1, 1]], [0.4, [1, 1, 1, 1]], [0.6, [1, 1, 1, 1]], [1, [1, 1, 1, 0]]] })).toContain("colorStops");
    expect(bad({ texture: undefined })).toContain("spriteSheet");
    expect(bad({ speed: { min: 2, max: 1 } })).toContain("speed.max");
  });
});

describe("ribbon@1 + ambient config (ribbon-schema)", () => {
  it("parses ribbon docs standalone and through the vfx collection union", () => {
    cover("ribbon-schema");
    const doc = zRibbonDoc.parse(RIBBON);
    expect(doc.widthAbove).toBe(0.4);
    expect(doc.lifespanSec).toBe(0.5);
    expect(doc.anchorBone).toBe("Bone_Weapon");

    // the shared collection loader path (validateDoc uses COLLECTIONS.vfx)
    const viaCollection = validateDoc("vfx", RIBBON);
    expect(viaCollection.ok).toBe(true);
    const viaCollectionVfx = validateDoc("vfx", EXTENDED_VFX);
    expect(viaCollectionVfx.ok).toBe(true);

    // rejections: negative width, missing lifespan, unknown keys
    expect(zRibbonDoc.safeParse({ ...RIBBON, widthAbove: -1 }).success).toBe(false);
    expect(zRibbonDoc.safeParse({ ...RIBBON, lifespanSec: undefined }).success).toBe(false);
    expect(zRibbonDoc.safeParse({ ...RIBBON, surprise: 1 }).success).toBe(false);
    // union still applies the vfx@1 refinements
    expect(validateDoc("vfx", { ...EXTENDED_VFX, speed: { min: 2, max: 1 } }).ok).toBe(false);
  });

  it("parses the ambient-vfx config doc (real file) through the config collection", () => {
    cover("ribbon-schema");
    const raw: unknown = JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/ambient-vfx.json"), "utf8"),
    );
    const res = validateDoc("config", raw);
    expect(res.ok).toBe(true);
    const doc = zConfigAmbientVfxDoc.parse(raw);
    expect(doc.id).toBe("ambient-vfx");
    for (const bindings of Object.values(doc.bindings)) {
      for (const b of bindings) expect(b.vfx.length).toBeGreaterThan(0);
    }
    // unknown keys rejected
    expect(
      zConfigAmbientVfxDoc.safeParse({
        id: "ambient-vfx",
        schema: "config.ambient-vfx@1",
        bindings: {},
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("registerAll splits the vfx collection into VfxDefs and RibbonDefs", () => {
    cover("ribbon-schema");
    const store = new ContentStore();
    store.add("vfx", EXTENDED_VFX.id, zVfxCollectionDoc.parse(EXTENDED_VFX));
    store.add("vfx", RIBBON.id, zVfxCollectionDoc.parse(RIBBON));
    registerAll(store);
    expect((VfxDefs.get(EXTENDED_VFX.id) as VfxDoc).schema).toBe("vfx@1");
    expect((RibbonDefs.get(RIBBON.id) as RibbonDoc).schema).toBe("ribbon@1");
    expect(VfxDefs.tryGet(RIBBON.id)).toBeUndefined();
    expect(RibbonDefs.tryGet(EXTENDED_VFX.id)).toBeUndefined();
  });
});
