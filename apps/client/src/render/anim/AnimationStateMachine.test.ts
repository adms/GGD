/**
 * client-07 (client-anim-authority): the animation state machine is driven
 * ONLY by authoritative flags (alive/moving) and server events (pulses) —
 * never by local input guessing. Run has stop-hysteresis so snapshot-edge
 * movement flicker cannot restart the walk loop every frame (the twitching /
 * spasming walk bug), and hurt never interrupts locomotion.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { AnimationStateMachine, RUN_LINGER_MS, PULSE_MS } from "./AnimationStateMachine";

describe("AnimationStateMachine (client-07)", () => {
  it("idle ↔ run from the authoritative movement flag (with stop linger)", () => {
    cover("client-anim-authority");
    const sm = new AnimationStateMachine();
    expect(sm.update({ alive: true, moving: false }, 0)).toBe("idle");
    expect(sm.update({ alive: true, moving: true }, 16)).toBe("run"); // instant enter
    // stop: run lingers through the hysteresis window, then decays to idle
    expect(sm.update({ alive: true, moving: false }, 32)).toBe("run");
    expect(sm.update({ alive: true, moving: false }, 16 + RUN_LINGER_MS - 1)).toBe("run");
    expect(sm.update({ alive: true, moving: false }, 16 + RUN_LINGER_MS + 1)).toBe("idle");
  });

  it("movement flicker (alternating frames) never drops out of run", () => {
    cover("client-anim-authority");
    const sm = new AnimationStateMachine();
    sm.update({ alive: true, moving: true }, 0);
    // snapshot-edge flicker: moving toggles every 16ms frame for a while
    for (let t = 16; t <= 800; t += 16) {
      const state = sm.update({ alive: true, moving: (t / 16) % 2 === 0 }, t);
      expect(state).toBe("run"); // hysteresis rides through the flicker
    }
  });

  it("attack/cast events pulse over the base state, then decay back", () => {
    cover("client-anim-authority");
    const sm = new AnimationStateMachine();
    sm.update({ alive: true, moving: true }, 0);
    sm.trigger("attack", 100);
    expect(sm.update({ alive: true, moving: true }, 120)).toBe("attack");
    // still within the pulse window
    expect(sm.update({ alive: true, moving: false }, 300)).toBe("attack");
    // pulse expired → back to authoritative base
    expect(sm.update({ alive: true, moving: true }, 600)).toBe("run");

    sm.trigger("cast", 5000);
    expect(sm.update({ alive: true, moving: false }, 5010)).toBe("cast");
    expect(sm.update({ alive: true, moving: false }, 5000 + PULSE_MS.cast + RUN_LINGER_MS + 200)).toBe("idle");
  });

  it("event-supplied durations override the default pulse window", () => {
    cover("client-anim-authority");
    const sm = new AnimationStateMachine();
    sm.trigger("cast", 0, 2000); // castBegin carries castTimeSec = 2s
    expect(sm.update({ alive: true, moving: false }, 1500)).toBe("cast");
    expect(sm.update({ alive: true, moving: false }, 2100)).toBe("idle");
    // castInterrupt cancels early
    sm.trigger("cast", 3000, 2000);
    expect(sm.update({ alive: true, moving: false }, 3100)).toBe("cast");
    sm.cancel("cast");
    expect(sm.update({ alive: true, moving: false }, 3200)).toBe("idle");
  });

  it("hurt never interrupts locomotion (walking must not twitch under fire)", () => {
    cover("client-anim-authority");
    const sm = new AnimationStateMachine();
    sm.update({ alive: true, moving: true }, 0);
    sm.trigger("hurt", 10);
    expect(sm.update({ alive: true, moving: true }, 20)).toBe("run"); // not "hurt"
    // standing still, the flinch plays
    const idleSm = new AnimationStateMachine();
    idleSm.update({ alive: true, moving: false }, 0);
    idleSm.trigger("hurt", 10);
    expect(idleSm.update({ alive: true, moving: false }, 20)).toBe("hurt");
  });

  it("cast outranks a hurt pulse landing in the same window", () => {
    cover("client-anim-authority");
    const sm = new AnimationStateMachine();
    sm.trigger("cast", 0);
    sm.trigger("hurt", 10); // lower priority — ignored while cast is live
    expect(sm.update({ alive: true, moving: false }, 20)).toBe("cast");
  });

  it("death (alive=false) overrides everything until revival", () => {
    cover("client-anim-authority");
    const sm = new AnimationStateMachine();
    sm.trigger("attack", 0);
    expect(sm.update({ alive: false, moving: false }, 10)).toBe("death");
    expect(sm.update({ alive: false, moving: true }, 20)).toBe("death");
    // revive (next round) → clean base state, pulse was discarded
    expect(sm.update({ alive: true, moving: false }, 30)).toBe("idle");
  });
});
