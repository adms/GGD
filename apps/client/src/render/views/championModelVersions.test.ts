import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ModelDoc } from "@ggd/shared/content";
import type { EntityViewState } from "../EntityViewRegistry";
import { championBodyHooks } from "./championBody";
import { voxelLookFor } from "./voxelLook";

const oldKey = "version.body." + "1".repeat(48);
const newKey = "version.body." + "2".repeat(48);
const hero = JSON.parse(readFileSync(resolve(__dirname, "../../../../../content/champions/sela.json"), "utf8")) as ChampionDef;
const body = (id: string, legacyAppearance: boolean): ModelDoc => ({
  id, schema: "model@1", glbPath: `assets/models/champions/versions/${legacyAppearance ? "1" : "2"}.glb`, scale: 1, collisionRadius: 0.6,
  clipMap: { idle: "idle", run: "run", attack: "attack", cast: "cast", hurt: "hurt", death: "death" },
  bodyVersion: { sourceModelKey: "champ.sela", legacyAppearance },
});
const entity = (key: string): EntityViewState => ({ id: 1, kind: 0, seatId: 0, key, teamId: 0, x: 0, z: 0, fx: 0, fz: 1, alive: true, flags: 0 }) as EntityViewState;

beforeEach(() => Champions.clear());
afterEach(() => Champions.clear());

describe("model version body selection", () => {
  it("new art wins over old voxel/overlay preference and rollback restores the original voxel look", () => {
    const old = body(oldKey, true), next = body(newKey, false);
    const overlayDoc = { ...old, id: "overlay", glbPath: "assets/legacy-overlay.glb" };
    const hooks = championBodyHooks({
      championIdForSeat: () => hero.id, resolveModelKey: (key) => key,
      content: {
        modelFor: (key) => key === oldKey ? old : key === newKey ? next : null,
        standinOverrideFor: () => ({ relativeScale: 0.8 }),
        voxelSkinOverrideFor: () => ({ preferVoxelBody: true }), formVisualFor: () => null,
      },
      overlay: { resolve: () => overlayDoc },
    });
    Champions.register(hero.id, { ...hero, modelKey: newKey });
    expect(hooks.modelDocFor(newKey, 0)).toBe(next);
    expect(hooks.voxelSkinFor(entity(newKey))?.preferVoxelBody).toBe(false);
    expect(hooks.modelOverrideFor(entity(newKey))?.voxel).toBeUndefined();
    expect(hooks.modelOverrideFor(entity(newKey))?.relativeScale).toBe(0.8);
    Champions.register(hero.id, { ...hero, modelKey: oldKey });
    expect(hooks.modelDocFor(oldKey, 0)).toBe(overlayDoc);
    expect(hooks.voxelSkinFor(entity(oldKey))?.preferVoxelBody).toBe(true);
    expect(hooks.modelOverrideFor(entity(oldKey))?.voxel).toEqual(voxelLookFor(hero.id, "mage"));
  });

  it("rollback restores the old default even without a manual voxel override", () => {
    const old = body(oldKey, true);
    Champions.register(hero.id, { ...hero, modelKey: oldKey });
    const hooks = championBodyHooks({
      championIdForSeat: () => hero.id, resolveModelKey: (key) => key,
      content: { modelFor: () => old, standinOverrideFor: () => null, voxelSkinOverrideFor: () => null, formVisualFor: () => null },
      overlay: { resolve: (doc) => doc },
    });
    expect(hooks.voxelSkinFor(entity(oldKey))?.preferVoxelBody).toBe(true);
  });
});
