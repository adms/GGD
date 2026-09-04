import { beforeEach, describe, expect, it } from "vitest";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { channelTakeover } from "../render/channelTakeover";
import { VfxScriptPlayer } from "./VfxScriptPlayer";

function player(script: VfxScriptDoc): VfxScriptPlayer {
  return new VfxScriptPlayer({
    scriptFor: (id) => id === script.abilityId ? script : undefined,
    projectileIdsOf: () => new Set(["projectile.test"]),
    allScripts: () => [script],
    entityPos: (id) => ({ x: id, z: 0 }),
    dispatch: () => undefined,
    enabled: () => true,
  });
}

function event(type: string, data: Record<string, unknown>): EventMessage {
  return { type, tick: 1, data } as unknown as EventMessage;
}

describe("VfxScriptPlayer target.reaction takeover routing", () => {
  beforeEach(() => channelTakeover.reset());

  it("claims projectileHit reaction on the struck target", () => {
    const script: VfxScriptDoc = {
      schema: "vfx-script@1",
      id: "ability.projectile",
      abilityId: "ability.projectile",
      segments: [{
        kind: "anim",
        on: "projectileHit",
        at: "target",
        pulse: "hurt",
        replaces: "target.reaction",
        replacesForMs: 500,
      }],
    };
    player(script).onEvent(event("projectileHit", {
      projectileId: "projectile.test",
      owner: 11,
      target: 22,
      origin: "ability:ability.projectile",
    }), 1_000);

    expect(channelTakeover.heldBy(22, "target.reaction", 1_001)).toBe(true);
    expect(channelTakeover.heldBy(11, "target.reaction", 1_001)).toBe(false);
  });

  it("claims reflectSuccess reaction on the reflector, not the attacker", () => {
    const script: VfxScriptDoc = {
      schema: "vfx-script@1",
      id: "ability.reflect",
      abilityId: "ability.reflect",
      segments: [{
        kind: "anim",
        on: "reflectSuccess",
        at: "caster",
        pulse: "guard",
        replaces: "target.reaction",
        replacesForMs: 500,
      }],
    };
    player(script).onEvent(event("reflectSuccess", {
      reflector: 22,
      attacker: 11,
      origin: "ability:ability.reflect",
    }), 1_000);

    expect(channelTakeover.heldBy(22, "target.reaction", 1_001)).toBe(true);
    expect(channelTakeover.heldBy(11, "target.reaction", 1_001)).toBe(false);
  });
});
