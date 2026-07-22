/**
 * Roar → SFX-key routing (task #26): the scripted BIG action roar must play the
 * distinct ANGRY `dragonRoarBig` clip while the ambient near/far breath roars
 * stay on the original `dragonRoar` long-howl pool — exactly what AuthScreen's
 * onRoar forwards to `audioSystem.playSfx`.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { RoarEvent } from "./LoginScene";
import { roarSfxKey, SOFT_RETURN_ROAR_VOLUME } from "./roarSfx";

describe("roarSfxKey", () => {
  it("routes the scripted big roar to dragonRoarBig, ambient to dragonRoar", () => {
    cover("login-roar-routing");
    expect(roarSfxKey({ big: true })).toBe("dragonRoarBig");
    expect(roarSfxKey({ big: false })).toBe("dragonRoar");
    // full RoarEvent shapes route the same way (only `big` matters)
    const scripted: RoarEvent = { volume: 1.5, pan: 0, big: true };
    const ambient: RoarEvent = { volume: 0.4, pan: -0.7, big: false };
    expect(roarSfxKey(scripted)).toBe("dragonRoarBig");
    expect(roarSfxKey(ambient)).toBe("dragonRoar");
  });

  it("the no-swoop fallback roar is soft but audible", () => {
    cover("login-roar-routing");
    expect(SOFT_RETURN_ROAR_VOLUME).toBeGreaterThan(0);
    expect(SOFT_RETURN_ROAR_VOLUME).toBeLessThan(1.5); // softer than BIG_ROAR_VOLUME
  });
});
