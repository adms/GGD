/**
 * blizzardOverlay — the DEV-ONLY Blizzard model fallback, tested in both
 * states that matter: overlay PRESENT (a champion with only a generic KayKit
 * stand-in renders its real WC3 unit model) and overlay ABSENT (every path
 * degrades to exactly the pre-overlay behavior). Also pins the copyright
 * contract: the probe never runs outside dev builds, and the resolver never
 * overrides an authored/imported model.
 */
import { describe, it, expect, vi } from "vitest";
import type { ModelDoc } from "@ggd/shared/content";
import {
  BlizzardOverlayModels,
  BLIZZARD_OVERLAY_MANIFEST_PATH,
  DEFAULT_W3X_CLIP_MAP,
  blizzardOverlayFromDoc,
  hasDedicatedShippedModel,
} from "./blizzardOverlay";
import { glbYawOffset, IMPORTED_GLB_YAW_OFFSET, NATIVE_GLB_YAW_OFFSET } from "./glbFacing";

/** The generic KayKit stand-in a godie champion points at when it has no model. */
const STAND_IN: ModelDoc = {
  id: "champ.sela",
  schema: "model@1",
  glbPath: "assets/models/champions/blocky-mage.glb",
  scale: 0.7727,
  collisionRadius: 0.6,
  clipMap: {
    idle: "Idle",
    run: "Running_A",
    attack: "Spellcast_Shoot",
    cast: "Spellcast_Long",
    hurt: "Hit_A",
    death: "Death_A",
  },
};

/** A champion that DOES ship its own model (w3x-imported). */
const DEDICATED: ModelDoc = {
  ...STAND_IN,
  id: "imported.herosaber",
  glbPath: "assets/models/imported/herosaber.glb",
  scale: 1,
};

/** Shape of the real content/assets/blizzard-local/MANIFEST.json (task #10). */
const MANIFEST = {
  generated: "task #10",
  units: {
    E00R: {
      champId: "godie-e00r",
      glb: "assets/blizzard-local/models/E00R.glb",
      textureSource: "blizzard",
      soundset: "ObsidianStatue",
      clips: { what: ["assets/blizzard-local/sounds/ObsidianStatue/ObsidianStatueWhat1.wav"] },
      clipMap: {
        idle: "Stand",
        run: "Walk",
        attack: "Attack",
        cast: "spell",
        hurt: "Stand",
        death: "Death",
      },
    },
    Uwar: {
      champId: "godie-uwar",
      glb: "assets/blizzard-local/models/Uwar.glb",
      textureSource: "blizzard",
      soundset: "Warlock",
      clips: { what: [] },
      // no clipMap → the WC3 defaults apply
    },
  },
};

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
const NOT_FOUND = { ok: false, status: 404, json: async () => ({}) } as unknown as Response;

function present(): { overlay: BlizzardOverlayModels; fetchFn: ReturnType<typeof vi.fn> } {
  const fetchFn = vi.fn(async () => okResponse(MANIFEST));
  return { overlay: new BlizzardOverlayModels({ enabled: true, fetchFn }), fetchFn };
}

function absent(): { overlay: BlizzardOverlayModels; fetchFn: ReturnType<typeof vi.fn> } {
  const fetchFn = vi.fn(async () => NOT_FOUND);
  return { overlay: new BlizzardOverlayModels({ enabled: true, fetchFn }), fetchFn };
}

describe("blizzardOverlayFromDoc", () => {
  it("indexes units by champId and defaults a missing clipMap", () => {
    const idx = blizzardOverlayFromDoc(MANIFEST)!;
    expect(idx.size).toBe(2);
    expect(idx.get("godie-e00r")!.unitId).toBe("E00R");
    expect(idx.get("godie-e00r")!.clipMap.cast).toBe("spell");
    expect(idx.get("godie-uwar")!.clipMap).toEqual(DEFAULT_W3X_CLIP_MAP);
  });

  it("rejects non-manifests and skips units pointing outside the overlay", () => {
    expect(blizzardOverlayFromDoc(null)).toBeNull();
    expect(blizzardOverlayFromDoc({})).toBeNull();
    expect(blizzardOverlayFromDoc("<!doctype html>")).toBeNull();
    const idx = blizzardOverlayFromDoc({
      units: {
        Bad: { champId: "godie-bad", glb: "assets/models/champions/blocky-mage.glb" },
        Worse: { champId: "godie-worse", glb: "https://evil.example/x.glb" },
        NoChamp: { glb: "assets/blizzard-local/models/X.glb" },
      },
    })!;
    expect(idx.size).toBe(0);
  });
});

describe("hasDedicatedShippedModel", () => {
  it("treats the shared KayKit stand-ins as 'no model of its own'", () => {
    expect(hasDedicatedShippedModel(null)).toBe(false);
    expect(hasDedicatedShippedModel(STAND_IN)).toBe(false);
    expect(hasDedicatedShippedModel(DEDICATED)).toBe(true);
  });
});

describe("overlay PRESENT", () => {
  it("substitutes the champion's WC3 unit model for the stand-in", async () => {
    const { overlay, fetchFn } = present();
    await overlay.load();
    const doc = overlay.resolve(STAND_IN, "godie-e00r")!;
    expect(doc.glbPath).toBe("assets/blizzard-local/models/E00R.glb");
    expect(doc.id).toBe("blizzard-local.e00r");
    expect(doc.scale).toBe(1); // .glbs are pre-normalized to ~1.7 units tall
    expect(doc.clipMap.idle).toBe("Stand");
    expect(fetchFn).toHaveBeenCalledWith(`/content/${BLIZZARD_OVERLAY_MANIFEST_PATH}`);
  });

  it("renders overlay models with the w3x-imported yaw offset", () => {
    expect(glbYawOffset("assets/blizzard-local/models/E00R.glb")).toBe(IMPORTED_GLB_YAW_OFFSET);
    // …and leaves the native/KayKit family alone
    expect(glbYawOffset(STAND_IN.glbPath)).toBe(NATIVE_GLB_YAW_OFFSET);
  });

  it("never overrides a champion's own shipped model", async () => {
    const { overlay } = present();
    await overlay.load();
    expect(overlay.resolve(DEDICATED, "godie-e00r")).toBe(DEDICATED);
  });

  it("falls back to the stand-in for champions the overlay does not cover", async () => {
    const { overlay } = present();
    await overlay.load();
    expect(overlay.resolve(STAND_IN, "godie-nosuch")).toBe(STAND_IN);
  });

  it("holds the stand-in upgrade until the probe settles, then substitutes", async () => {
    const { overlay } = present();
    // in flight: null = "not yet" — ChampionView keeps its procedural figure
    expect(overlay.resolve(STAND_IN, "godie-e00r")).toBeNull();
    await overlay.load();
    expect(overlay.resolve(STAND_IN, "godie-e00r")!.glbPath).toContain("blizzard-local");
  });

  it("probes the manifest exactly once (single-flight, lazily primed)", async () => {
    const { overlay, fetchFn } = present();
    overlay.resolve(STAND_IN, "godie-e00r");
    overlay.resolve(STAND_IN, "godie-uwar");
    await Promise.all([overlay.load(), overlay.load()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("overlay ABSENT (deployed build / not extracted)", () => {
  it("degrades to exactly today's behavior on 404", async () => {
    const { overlay } = absent();
    expect(await overlay.load()).toBeNull();
    expect(overlay.resolve(STAND_IN, "godie-e00r")).toBe(STAND_IN);
    expect(overlay.resolve(DEDICATED, "godie-e00r")).toBe(DEDICATED);
    expect(overlay.resolve(null, "godie-e00r")).toBeNull(); // content still loading
    expect(overlay.unitFor("godie-e00r")).toBeNull();
  });

  it("settles (stops holding champions back) on malformed JSON", async () => {
    const overlay = new BlizzardOverlayModels({
      enabled: true,
      fetchFn: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token <");
          },
        }) as unknown as Response,
      warn: () => {},
    });
    await overlay.load();
    expect(overlay.settled).toBe(true);
    expect(overlay.resolve(STAND_IN, "godie-e00r")).toBe(STAND_IN);
  });

  it("settles on a network error too", async () => {
    const overlay = new BlizzardOverlayModels({
      enabled: true,
      fetchFn: async () => {
        throw new TypeError("Failed to fetch");
      },
      warn: () => {},
    });
    await overlay.load();
    expect(overlay.resolve(STAND_IN, "godie-e00r")).toBe(STAND_IN);
  });

  it("never fetches when disabled (the default outside dev builds)", async () => {
    const fetchFn = vi.fn(async () => okResponse(MANIFEST));
    const overlay = new BlizzardOverlayModels({ enabled: false, fetchFn });
    expect(overlay.resolve(STAND_IN, "godie-e00r")).toBe(STAND_IN);
    expect(await overlay.load()).toBeNull();
    expect(overlay.index).toBeNull();
    expect(overlay.settled).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("ignores entities that carry no champion (flowers, props)", async () => {
    const { overlay } = present();
    expect(overlay.resolve(STAND_IN, null)).toBe(STAND_IN);
    expect(overlay.resolve(STAND_IN, undefined)).toBe(STAND_IN);
    expect(overlay.resolve(STAND_IN, "")).toBe(STAND_IN);
  });
});
