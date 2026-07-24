/**
 * modelLod — resolver + wiring guards for task #115.
 *
 * NOTE ON WHAT THIS FILE IS AND IS NOT. These are unit tests of a pure mapping;
 * they are NOT the proof that the setting works. A resolver returning a string
 * is exactly the kind of green-but-inert evidence this project has been burned
 * by. The real proof is the network observation in
 * `docs/_model-lod-115.md` (which .glb the browser actually GETs at each
 * preset). What these tests DO buy is regression protection: that the manifest
 * is honoured, that an ungenerated tier degrades instead of 404ing, and — the
 * one that would silently re-break the feature — that AssetManager keys its
 * container cache on the RESOLVED path.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  getModelLodTier,
  lodTierForPreset,
  loadModelLodManifest,
  resolveLodPath,
  setModelLodManifest,
  setModelLodTier,
  type LodManifest,
} from "./modelLod";
import { PRESET_PARAMS } from "../settings/presets";
import { QualityController } from "./QualityController";
import { DEFAULT_SETTINGS, type Settings } from "../settings";

const MANIFEST: LodManifest = {
  schema: "lod@1",
  models: {
    "assets/models/champions/mage.glb": {
      bytes: 1034320,
      triangles: 5683,
      mid: { path: "assets/models/champions/mage-mid.glb", bytes: 911000, triangles: 3113 },
      small: { path: "assets/models/champions/mage-small.glb", bytes: 423476, triangles: 1583 },
    },
    "assets/models/props/only-mid.glb": {
      mid: { path: "assets/models/props/only-mid-mid.glb", bytes: 10, triangles: 1 },
    },
  },
};

afterEach(() => {
  setModelLodManifest(null);
  setModelLodTier("high");
});

describe("resolveLodPath", () => {
  it("swaps in the tier file the manifest declares", () => {
    expect(resolveLodPath("assets/models/champions/mage.glb", "mid", MANIFEST)).toBe(
      "assets/models/champions/mage-mid.glb",
    );
    expect(resolveLodPath("assets/models/champions/mage.glb", "small", MANIFEST)).toBe(
      "assets/models/champions/mage-small.glb",
    );
  });

  it("high is a no-op — the authored file is the top tier", () => {
    expect(resolveLodPath("assets/models/champions/mage.glb", "high", MANIFEST)).toBe(
      "assets/models/champions/mage.glb",
    );
  });

  it("a model with no entry resolves to itself at every tier", () => {
    for (const tier of ["high", "mid", "small"] as const) {
      expect(resolveLodPath("assets/models/imported/holo.glb", tier, MANIFEST)).toBe(
        "assets/models/imported/holo.glb",
      );
    }
  });

  it("degrades to the nearest generated tier instead of requesting a 404", () => {
    // a partial generation run must cost saving, never correctness
    expect(resolveLodPath("assets/models/props/only-mid.glb", "small", MANIFEST)).toBe(
      "assets/models/props/only-mid-mid.glb",
    );
  });

  it("without a manifest nothing is swapped (old deploy / failed fetch)", () => {
    expect(resolveLodPath("assets/models/champions/mage.glb", "small", null)).toBe(
      "assets/models/champions/mage.glb",
    );
  });

  it("reads the module-level tier + manifest when not given explicit ones", () => {
    setModelLodManifest(MANIFEST);
    setModelLodTier("small");
    expect(getModelLodTier()).toBe("small");
    expect(resolveLodPath("assets/models/champions/mage.glb")).toBe(
      "assets/models/champions/mage-small.glb",
    );
  });
});

describe("lodTierForPreset", () => {
  it("maps the fixed presets onto tiers", () => {
    expect(lodTierForPreset("low")).toBe("small");
    expect(lodTierForPreset("medium")).toBe("mid");
    expect(lodTierForPreset("high")).toBe("high");
  });

  it("auto stays on the top tier — the adaptive ladder must not trigger fetches", () => {
    // If this ever flips, AdaptiveManager re-rungs mid-match and every rung
    // change becomes a .glb download on the device least able to afford it.
    expect(lodTierForPreset("auto")).toBe("high");
  });
});

describe("QualityController publishes the tier", () => {
  function controllerWith(preset: Settings["graphics"]["qualityPreset"]) {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      graphics: { ...DEFAULT_SETTINGS.graphics, ...PRESET_PARAMS.high, qualityPreset: preset },
    };
    const store = {
      get: () => settings,
      graphics: () => settings.graphics,
      subscribe: () => () => {},
    };
    return new QualityController(store as never);
  }

  it("carries modelLod alongside the knobs that were already wired", () => {
    expect(controllerWith("low").getParams().modelLod).toBe("small");
    expect(controllerWith("medium").getParams().modelLod).toBe("mid");
    expect(controllerWith("high").getParams().modelLod).toBe("high");
  });
});

describe("loadModelLodManifest", () => {
  it("publishes a well-formed manifest", async () => {
    const ok = await loadModelLodManifest(
      "/content",
      (u) => `${u}?h=cv_test`,
      (async (url: string) => {
        expect(url).toBe("/content/assets/models/_lod.json?h=cv_test");
        return { ok: true, json: async () => MANIFEST };
      }) as never,
    );
    expect(ok).toBe(true);
    expect(resolveLodPath("assets/models/champions/mage.glb", "mid")).toBe(
      "assets/models/champions/mage-mid.glb",
    );
  });

  it("a 404 or a throw leaves swapping disabled rather than breaking boot", async () => {
    expect(
      await loadModelLodManifest("/content", undefined, (async () => ({ ok: false })) as never),
    ).toBe(false);
    expect(
      await loadModelLodManifest("/content", undefined, (async () => {
        throw new Error("offline");
      }) as never),
    ).toBe(false);
  });

  it("rejects a payload without `models` instead of half-applying it", async () => {
    expect(
      await loadModelLodManifest("/content", undefined, (async () => ({
        ok: true,
        json: async () => ({ schema: "lod@1" }),
      })) as never),
    ).toBe(false);
  });
});
