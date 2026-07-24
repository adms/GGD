/**
 * inputMode — the seam the control legend uses to answer "what is in your
 * hands right now". The failure it exists to prevent is a CONFIDENT WRONG
 * ANSWER: a pad player reading 「Q W E R」, or a phone player reading 「右鍵」.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { GAMEPAD_DEADZONE, type PadState } from "../input/GamepadInput";
import {
  INPUT_MODE_LABEL,
  initialInputMode,
  inputModeForEvent,
  inputModeStore,
  padActivity,
} from "./inputMode";

function pad(over: Partial<PadState> = {}): PadState {
  return { connected: true, axes: [0, 0, 0, 0], buttons: [{ pressed: false }], ...over };
}

beforeEach(() => {
  inputModeStore.reset("keyboard");
});

describe("evidence → mode", () => {
  it("reads a key/mouse/wheel as keyboard+mouse", () => {
    expect(inputModeForEvent("keydown")).toBe("keyboard");
    expect(inputModeForEvent("mousedown")).toBe("keyboard");
    expect(inputModeForEvent("wheel")).toBe("keyboard");
    expect(inputModeForEvent("pointerdown", "mouse")).toBe("keyboard");
  });

  it("does not mistake a finger for a mouse (same pointerdown event)", () => {
    expect(inputModeForEvent("pointerdown", "touch")).toBe("touch");
    expect(inputModeForEvent("touchstart")).toBe("touch");
  });

  it("treats gamepadconnected as real usage (browsers withhold it until input)", () => {
    expect(inputModeForEvent("gamepadconnected")).toBe("gamepad");
  });

  it("ignores anything that proves nothing", () => {
    expect(inputModeForEvent("resize")).toBeNull();
    expect(inputModeForEvent("blur")).toBeNull();
  });
});

describe("pad activity poll", () => {
  it("ignores an idle connected pad — plugged in is not playing", () => {
    expect(padActivity([pad()])).toBe(false);
    expect(padActivity([null, null])).toBe(false);
  });

  it("ignores a disconnected pad even mid-press", () => {
    expect(padActivity([pad({ connected: false, buttons: [{ pressed: true }] })])).toBe(false);
  });

  it("sees a pressed button", () => {
    expect(padActivity([pad({ buttons: [{ pressed: false }, { pressed: true }] })])).toBe(true);
  });

  it("uses the mapping's own deadzone, so stick drift is not 'playing'", () => {
    const drift = GAMEPAD_DEADZONE * 0.5;
    expect(padActivity([pad({ axes: [drift, 0, 0, 0] })])).toBe(false);
    expect(padActivity([pad({ axes: [0, 0, 0, 1] })])).toBe(true);
  });

  it("notices the SECOND player's pad, not only the first (couch)", () => {
    expect(padActivity([pad(), pad({ buttons: [{ pressed: true }] })])).toBe(true);
  });
});

describe("the store", () => {
  it("starts on the device default", () => {
    expect(initialInputMode(false)).toBe("keyboard");
    expect(initialInputMode(true)).toBe("touch");
  });

  it("notifies on a real change and stays silent on a repeat", () => {
    let hits = 0;
    const off = inputModeStore.subscribe(() => hits++);
    inputModeStore.set("gamepad");
    inputModeStore.set("gamepad");
    expect(hits).toBe(1);
    expect(inputModeStore.get()).toBe("gamepad");
    inputModeStore.set("keyboard");
    expect(hits).toBe(2);
    off();
    inputModeStore.set("touch");
    expect(hits).toBe(2);
  });

  it("switches live mid-round when a pad wakes up", () => {
    expect(inputModeStore.get()).toBe("keyboard");
    const mode = inputModeForEvent("gamepadconnected");
    inputModeStore.set(mode!);
    expect(inputModeStore.get()).toBe("gamepad");
  });

  it("labels every mode in 繁中", () => {
    expect(Object.keys(INPUT_MODE_LABEL).sort()).toEqual(["gamepad", "keyboard", "touch"]);
    for (const label of Object.values(INPUT_MODE_LABEL)) expect(label.length).toBeGreaterThan(0);
  });
});
