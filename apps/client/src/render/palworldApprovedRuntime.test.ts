import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { packClips, voicePackFromDoc } from "../audio/selectVoiceLadder";
import { AssetManager } from "./AssetManager";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import {
  PALWORLD_APPROVED_SKILL_MOTION,
  resolvePalworldApprovedSkillMotion,
} from "./generated/palworldApprovedMotion.generated";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const RUNTIME_PATH = join(
  ROOT,
  "materials/hero-model-library/priority-evidence/palworld-approved-runtime-v1/runtime-bindings.json",
);

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("Palworld owner-approved runtime routers", () => {
  it("generates exactly the four approved ability-id motion overlays", () => {
    const runtime = readJson(RUNTIME_PATH);
    const expected = Object.fromEntries(
      runtime.motionOverlays.map((row: any) => [row.abilityId, row.semanticState]),
    );
    expect(PALWORLD_APPROVED_SKILL_MOTION).toEqual(expected);
    expect(Object.keys(expected)).toHaveLength(4);
    for (const [abilityId, pulse] of Object.entries(expected)) {
      expect(resolvePalworldApprovedSkillMotion(abilityId)).toBe(pulse);
    }
    expect(resolvePalworldApprovedSkillMotion("acquired-jetragon.w")).toBeNull();
  });

  it("wires all 18 approved cries through the shipped champion/category pack", () => {
    const runtime = readJson(RUNTIME_PATH);
    const manifest = voicePackFromDoc(
      readJson(join(ROOT, "content/assets/audio/voices/champions/MANIFEST.json")),
    );
    expect(manifest).not.toBeNull();
    expect(runtime.cries).toHaveLength(18);
    expect(new Set(runtime.cries.map((row: any) => row.heroId)).size).toBe(3);

    for (const row of runtime.cries) {
      const file = join(ROOT, "content", row.clip.path);
      expect(statSync(file).size, row.candidateId).toBe(row.clip.bytes);
      expect(createHash("sha256").update(readFileSync(file)).digest("hex"), row.candidateId)
        .toBe(row.clip.sha256);
      for (const category of row.runtimeCategories) {
        expect(
          packClips(manifest!, row.heroId, category).some((clip) => clip.clip === row.clip.path),
          `${row.heroId}:${category}`,
        ).toBe(true);
      }
    }
  });

  it("keeps EntityViewRegistry on the generated ability-id router", () => {
    const source = readFileSync(join(ROOT, "apps/client/src/render/EntityViewRegistry.ts"), "utf8");
    expect(source).toContain("resolvePalworldApprovedSkillMotion(abilityId)");
    expect(source).toContain("casterPulseOverride");
  });

  it("plays the approved attack overlay for Cattiva Q at abilityCast runtime", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const registry = new EntityViewRegistry(scene, new AssetManager(scene));
    const entity: EntityViewState = {
      id: 93,
      kind: 0,
      seatId: 0,
      key: "champ.acquired-cattiva",
      teamId: 1,
      x: 0,
      z: 0,
      fx: 1,
      fz: 0,
      alive: true,
    };
    const sync = (nowMs: number): void => registry.sync({
      entities: [entity],
      poseFor: (row) => ({ x: row.x, z: row.z, fx: row.fx, fz: row.fz }),
      nowMs,
      dtMs: 16,
      loadModels: false,
    });
    try {
      sync(0);
      registry.handleEvent({
        type: "abilityCast",
        data: { caster: entity.id, abilityId: "acquired-cattiva.q" },
      } as never, 100);
      sync(110);
      expect(registry.getChampionView(entity.id)?.anim.state).toBe("attack");
    } finally {
      registry.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
