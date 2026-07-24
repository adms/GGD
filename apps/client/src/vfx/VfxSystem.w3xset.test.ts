/**
 * vfx-w3x-effect-set: a promoted ability really plays its WHOLE w3x effect.
 *
 * This test exists for the reason the cast-pillar test spells out: in this
 * project "the class works" has repeatedly meant nothing in a real match. The
 * specific way this feature can be green-but-dead is subtle — the ability's
 * `vfxKey` alone WOULD resolve and WOULD draw something, so a naive test
 * passes while the player sees one quarter of 世界終結's frost nova and
 * 依文潔琳's signature ultimate still reads as a generic puff.
 *
 * So this drives the REAL `abilityCast` payload through `VfxSystem.handleEvent`
 * — the exact call GameApp makes for every drained event — with the REAL
 * content docs loaded off disk, and counts the distinct docs that reached the
 * particle layer. Four emitters in the source ⇒ four systems on screen.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import type { VfxDoc } from "@ggd/shared/content";
import { VfxSystem, type VfxContext } from "./VfxSystem";
import { W3X_ABILITY_ART } from "../render/vfx/w3xAbilityArt";

const root = (p: string): string => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const loadVfx = (id: string): VfxDoc =>
  JSON.parse(readFileSync(root(`content/vfx/${id}.json`), "utf8")) as VfxDoc;
const loadAbility = (id: string): Record<string, unknown> =>
  JSON.parse(readFileSync(root(`content/abilities/${id}.json`), "utf8")) as Record<string, unknown>;

const ABILITY = "godie-n003.r"; // 42-04 世界終結 — the owner's named acceptance case

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  const doc = loadAbility(ABILITY);
  Abilities.register(ABILITY as AbilityId, {
    ...(doc as object),
    id: ABILITY as AbilityId,
  } as never);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

function harness(): { sys: VfxSystem; played: string[] } {
  const played: string[] = [];
  const ctx: VfxContext = {
    entityPos: () => ({ x: 0, z: 0 }),
    vfxDoc: (key: string) => {
      try {
        const d = loadVfx(key);
        played.push(key);
        return d;
      } catch {
        return null;
      }
    },
  };
  return { sys: new VfxSystem(scene, ctx), played };
}

const castEvent = (): EventMessage =>
  ({
    type: "abilityCast",
    data: { abilityId: ABILITY, caster: 1, point: { x: 0, z: 0 } },
  }) as unknown as EventMessage;

describe("w3x effect set plays whole (vfx-w3x-effect-set)", () => {
  it("世界終結 fires ALL FOUR frostnova emitters, not 1 of 4", () => {
    const art = W3X_ABILITY_ART[ABILITY]!;
    const { sys, played } = harness();
    sys.handleEvent(castEvent(), 1000);

    const expected = [art.primary, ...art.extra];
    expect(expected).toHaveLength(4);
    for (const id of expected) {
      expect(played, `emitter ${id} never reached the particle layer`).toContain(id);
    }
  });

  it("the docs it plays are the map's OWN frost nova, not a primitive", () => {
    const { sys, played } = harness();
    sys.handleEvent(castEvent(), 2000);
    const w3x = played.filter((k) => k.includes("frostnova"));
    expect(w3x.length).toBe(4);
    expect(played.some((k) => k.startsWith("fx.prim."))).toBe(false);
  });

  it("an ability with NO promotion plays exactly its one primitive doc", () => {
    const id = "godie-n003.q" as AbilityId; // stock FrostNovaTarget → kept primitive
    Abilities.register(id, { ...(loadAbility("godie-n003.q") as object), id } as never);
    const { sys, played } = harness();
    sys.handleEvent(
      { type: "abilityCast", data: { abilityId: id, caster: 1 } } as unknown as EventMessage,
      3000,
    );
    expect(played).toEqual(["fx.prim.ice.shockwave"]);
  });
});
