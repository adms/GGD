/**
 * Stand-in detection (task #76 §4 / the data debt of #77). Driven against the
 * REAL skeleton registry — sela and thorne both wear stand-in meshes — so a
 * change to a champion's modelKey is caught here rather than on the 3D stage.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { isStandInModel, STAND_IN_MODEL_KEYS } from "./standIn";

beforeAll(() => registerSkeletonContent());

describe("stand-in model detection", () => {
  it("flags every known generic KayKit fallback key", () => {
    cover("client-champ-standin");
    for (const key of STAND_IN_MODEL_KEYS) expect(isStandInModel(key)).toBe(true);
    expect(STAND_IN_MODEL_KEYS.size).toBe(4);
  });

  it("does not flag a real imported model, or an unknown/empty key", () => {
    cover("client-champ-standin");
    expect(isStandInModel("imported.herokunoichi")).toBe(false);
    expect(isStandInModel("imported.herosaber")).toBe(false);
    expect(isStandInModel("")).toBe(false);
    expect(isStandInModel(null)).toBe(false);
    expect(isStandInModel(undefined)).toBe(false);
  });

  it("reads the modelKey straight off the champion def (sela/thorne are stand-ins)", () => {
    cover("client-champ-standin");
    const sela = Champions.get("sela" as ChampionId);
    const thorne = Champions.get("thorne" as ChampionId);
    expect(isStandInModel(sela.modelKey)).toBe(true);
    expect(isStandInModel(thorne.modelKey)).toBe(true);
  });
});
