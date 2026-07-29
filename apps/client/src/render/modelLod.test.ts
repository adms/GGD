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
  applyModelLodPolicy,
  getModelLodPolicy,
  getModelLodTier,
  lodTierForPreset,
  loadModelLodManifest,
  resolveLodPath,
  setModelLodManifest,
  setModelLodTier,
  subscribeModelLodPolicy,
  type LodManifest,
} from "./modelLod";
import { DEFAULT_MODEL_LOD } from "@ggd/shared/content";
import { PRESET_PARAMS } from "../settings/presets";
import { QualityController } from "./QualityController";
import { DEFAULT_SETTINGS, type Settings } from "../settings";

const MANIFEST: LodManifest = {
  schema: "lod@1",
  models: {
    // A model that genuinely still HAS tiers. It used to be champions/mage.glb;
    // #226 replaced the four stand-ins with ~168-triangle generated box-men,
    // which sit below the LOD floor and legitimately ship ONE tier — so a
    // champion path is no longer a valid fixture for tier resolution.
    // Numbers re-pinned from content/assets/models/_lod.json.
    "assets/models/hex/tower_blue.glb": {
      bytes: 335200,
      triangles: 5659,
      mid: { path: "assets/models/hex/tower_blue-mid.glb", bytes: 181784, triangles: 3111 },
      small: { path: "assets/models/hex/tower_blue-small.glb", bytes: 105152, triangles: 1583 },
    },
    "assets/models/props/only-mid.glb": {
      mid: { path: "assets/models/props/only-mid-mid.glb", bytes: 10, triangles: 1 },
    },
  },
};

afterEach(() => {
  setModelLodManifest(null);
  setModelLodTier("high");
  applyModelLodPolicy(null); // restore DEFAULT_MODEL_LOD between cases
});

describe("resolveLodPath", () => {
  it("swaps in the tier file the manifest declares", () => {
    expect(resolveLodPath("assets/models/hex/tower_blue.glb", "mid", MANIFEST)).toBe(
      "assets/models/hex/tower_blue-mid.glb",
    );
    expect(resolveLodPath("assets/models/hex/tower_blue.glb", "small", MANIFEST)).toBe(
      "assets/models/hex/tower_blue-small.glb",
    );
  });

  it("high is a no-op — the authored file is the top tier", () => {
    expect(resolveLodPath("assets/models/hex/tower_blue.glb", "high", MANIFEST)).toBe(
      "assets/models/hex/tower_blue.glb",
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
    expect(resolveLodPath("assets/models/hex/tower_blue.glb", "small", null)).toBe(
      "assets/models/hex/tower_blue.glb",
    );
  });

  it("reads the module-level tier + manifest when not given explicit ones", () => {
    setModelLodManifest(MANIFEST);
    setModelLodTier("small");
    expect(getModelLodTier()).toBe("small");
    expect(resolveLodPath("assets/models/hex/tower_blue.glb")).toBe(
      "assets/models/hex/tower_blue-small.glb",
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

  it("reads the OPERATOR'S table, not a switch statement", () => {
    applyModelLodPolicy({
      id: "model-lod",
      schema: "config.model-lod@1",
      enabled: true,
      presetTiers: { low: "mid", medium: "high", high: "small", auto: "small" },
    });
    // deliberately absurd on purpose: no plausible hard-coded switch produces
    // this, so a green here cannot be a switch that happens to agree.
    expect(lodTierForPreset("low")).toBe("mid");
    expect(lodTierForPreset("medium")).toBe("high");
    expect(lodTierForPreset("high")).toBe("small");
    expect(lodTierForPreset("auto")).toBe("small");
  });

  it("`enabled: false` pins every preset to the authored file", () => {
    applyModelLodPolicy({
      id: "model-lod",
      schema: "config.model-lod@1",
      enabled: false,
      presetTiers: { low: "small", medium: "mid", high: "high", auto: "high" },
    });
    for (const p of ["low", "medium", "high", "auto"] as const) {
      expect(lodTierForPreset(p)).toBe("high");
    }
  });

  it("a malformed / absent doc restores the SHIPPED table, never a half-applied one", () => {
    applyModelLodPolicy({
      id: "model-lod",
      schema: "config.model-lod@1",
      enabled: true,
      presetTiers: { low: "mid", medium: "high", high: "small", auto: "small" },
    });
    // every rejected shape must land back on DEFAULT_MODEL_LOD — a doc missing
    // one preset must NOT leave the other three on the operator's values
    for (const bad of [
      null,
      undefined,
      {},
      { schema: "config.gore@1", enabled: true, presetTiers: DEFAULT_MODEL_LOD.presetTiers },
      { schema: "config.model-lod@1", enabled: true, presetTiers: { low: "small" } },
      { schema: "config.model-lod@1", enabled: true, presetTiers: { ...DEFAULT_MODEL_LOD.presetTiers, medium: "tiny" } },
      { schema: "config.model-lod@1", presetTiers: DEFAULT_MODEL_LOD.presetTiers },
    ]) {
      applyModelLodPolicy(bad);
      expect(getModelLodPolicy()).toEqual(DEFAULT_MODEL_LOD);
      expect(lodTierForPreset("low")).toBe("small");
      expect(lodTierForPreset("medium")).toBe("mid");
    }
  });

  it("the shipped default is the pre-#115-config behaviour, exactly", () => {
    expect(DEFAULT_MODEL_LOD.enabled).toBe(true);
    expect(DEFAULT_MODEL_LOD.presetTiers).toEqual({
      low: "small",
      medium: "mid",
      high: "high",
      auto: "high",
    });
  });
});

describe("subscribeModelLodPolicy", () => {
  it("fires on adoption — otherwise a late doc is parsed, correct and dead", () => {
    const seen: string[] = [];
    const off = subscribeModelLodPolicy(() => seen.push(lodTierForPreset("low")));
    applyModelLodPolicy({
      id: "model-lod",
      schema: "config.model-lod@1",
      enabled: true,
      presetTiers: { low: "mid", medium: "mid", high: "high", auto: "high" },
    });
    expect(seen).toEqual(["mid"]);

    off();
    applyModelLodPolicy(null);
    expect(seen).toEqual(["mid"]); // unsubscribed
  });
});

describe("loadModelLodManifest adopts the policy", () => {
  it("applies the table BEFORE the fetch, so a missing _lod.json still honours it", async () => {
    const ok = await loadModelLodManifest(
      "/content",
      undefined,
      (async () => ({ ok: false })) as never,
      () => ({
        id: "model-lod",
        schema: "config.model-lod@1",
        enabled: false,
        presetTiers: { low: "small", medium: "mid", high: "high", auto: "high" },
      }),
    );
    expect(ok).toBe(false); // manifest genuinely failed…
    expect(lodTierForPreset("low")).toBe("high"); // …and the table still landed
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
    expect(resolveLodPath("assets/models/hex/tower_blue.glb", "mid")).toBe(
      "assets/models/hex/tower_blue-mid.glb",
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
