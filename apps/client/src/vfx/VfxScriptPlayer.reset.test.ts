import { describe, expect, it } from "vitest";
import { zVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import { VfxScriptPlayer } from "./VfxScriptPlayer";

const DOC = zVfxScriptDoc.parse({
  id: "reset-guard",
  schema: "vfx-script@1",
  abilityId: "godie-hart.r",
  segments: [
    { kind: "floatingText", on: "castStart", atMs: 800, text: "OLD" },
    { kind: "floatingText", on: "castEffect", text: "END" },
  ],
});

function harness(): { player: VfxScriptPlayer; fired: string[] } {
  const fired: string[] = [];
  const player = new VfxScriptPlayer({
    scriptFor: (id) => (id === DOC.abilityId ? DOC : undefined),
    allScripts: () => [DOC],
    projectileIdsOf: () => new Set(),
    entityPos: () => ({ x: 0, z: 0 }),
    dispatch: (event) => fired.push(String((event.data as { text?: string }).text ?? event.type)),
    enabled: () => true,
  });
  return { player, fired };
}

const CAST = {
  type: "abilityCast",
  tick: 1,
  data: { caster: 1, abilityId: DOC.abilityId, point: { x: 0, z: 3 } },
} as unknown as EventMessage;

describe("VfxScriptPlayer deterministic reset", () => {
  it("drops delayed segments before a Forge replay or round transition", () => {
    const { player, fired } = harness();
    player.onEvent(CAST, 0);
    player.reset();
    player.update(1000);
    expect(fired).toEqual([]);
  });

  it("drops castEffect frames waiting for castEnd", () => {
    const { player, fired } = harness();
    player.onEvent(CAST, 0);
    player.onEvent(
      { type: "castBegin", tick: 1, data: { caster: 1, abilityId: DOC.abilityId } } as EventMessage,
      0,
    );
    player.reset();
    player.onEvent(
      { type: "castEnd", tick: 20, data: { caster: 1, abilityId: DOC.abilityId } } as EventMessage,
      650,
    );
    player.update(1000);
    expect(fired).toEqual([]);
  });
});
