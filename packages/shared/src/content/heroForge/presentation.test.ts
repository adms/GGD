import { describe, expect, it } from "vitest";
import {
  HERO_DISTRIBUTABLE_ABILITY_SFX_KEYS,
  abilityPresentationFields,
  buildHeroAssetLocks,
  defaultHeroPresentation,
  validateHeroPresentation,
  zHeroPresentation,
  type HeroPresentationCatalog,
} from "./presentation";

const model = {
  id: "champ.test",
  schema: "model@1",
  glbPath: "assets/models/test.glb",
  scale: 1,
  collisionRadius: 0.6,
  clipMap: { idle: "idle", run: "run", attack: "attack", cast: "cast", hurt: "hurt", death: "death" },
};
const vfx = {
  id: "fx.test",
  schema: "vfx@1",
  emitter: { shape: "point" },
  mode: "burst",
  burstCount: 8,
  lifetimeSec: { min: 0.1, max: 0.3 },
  size: { start: 1, end: 0 },
  color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
  blendMode: "additive",
  texture: "assets/textures/test.png",
};

const evidence = (path: string, mediaType: string) => ({ path, mediaType, byteSize: 4, sha256: "a".repeat(64) });
const catalog = (): HeroPresentationCatalog => ({
  models: { "champ.test": model },
  vfx: { "fx.test": vfx },
  audioSfx: {},
  assets: {
    "assets/models/test.glb": evidence("assets/models/test.glb", "model/gltf-binary"),
    "assets/textures/test.png": evidence("assets/textures/test.png", "image/png"),
  },
});

describe("hero presentation closure", () => {
  it("locks every selected byte and projects only runtime-consumed ability fields", () => {
    const presentation = defaultHeroPresentation();
    presentation.modelKey = "champ.test";
    presentation.slots.Q.vfxLayers = [{ vfxKey: "fx.test" }];
    expect(validateHeroPresentation(presentation, catalog()).issues.map((issue) => issue.code)).toContain("ASSET_NOT_LOCKED");
    presentation.assetLocks = buildHeroAssetLocks(presentation, catalog());
    expect(validateHeroPresentation(presentation, catalog())).toMatchObject({ status: "pass" });
    expect(presentation.assetLocks.map((lock) => lock.path)).toEqual([
      "assets/models/test.glb",
      "assets/textures/test.png",
    ]);
    expect(abilityPresentationFields(presentation.slots.Q)).toEqual({ vfxKey: "fx.test" });
  });

  it("blocks preview-only cast channels and unobserved gameplay bindings", () => {
    const presentation = defaultHeroPresentation();
    presentation.modelKey = "champ.test";
    presentation.slots.Q.vfxLayers = [{ vfxKey: "fx.ribbon" }];
    const input: HeroPresentationCatalog = {
      ...catalog(),
      vfx: {
        "fx.ribbon": {
          id: "fx.ribbon", schema: "ribbon@1", widthAbove: 0.2, widthBelow: 0.2,
          lifespanSec: 0.2, color: [1, 1, 1, 1], blendMode: "additive", anchorBone: "Sword",
        },
      },
    };
    const report = validateHeroPresentation(presentation, input, { observedEventsBySlot: { Q: [] } });
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "CAST_RIBBON_UNSUPPORTED",
      "PRESENTATION_EVENT_UNOBSERVED",
    ]));
  });

  it("shares the public-build ability cast cue allowlist and rejects generic map keys", () => {
    expect(HERO_DISTRIBUTABLE_ABILITY_SFX_KEYS).toEqual(["wc3.moongo", "wc3.moonjump", "wc3.nocute"]);
    const presentation = defaultHeroPresentation() as unknown as { slots: { Q: { sfxKey: string } } };
    presentation.slots.Q.sfxKey = "magicFire";
    expect(zHeroPresentation.safeParse(presentation).success).toBe(false);
  });
});
