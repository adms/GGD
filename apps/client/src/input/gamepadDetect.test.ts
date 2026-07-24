/**
 * gamepadDetect — the wake + mapping diagnostic (task #197). All against
 * injected fake pads; no real hardware or navigator.
 */
import { describe, it, expect } from "vitest";
import {
  gamepadWakeHintVisible,
  hasConnectedPad,
  hasUntrustedMapping,
  padMappingTrusted,
  readPadDiagnostics,
  shortPadId,
  STANDARD_MAPPING,
  type PadInfo,
} from "./gamepadDetect";

function pad(overrides: Partial<PadInfo> = {}): PadInfo {
  return {
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
    id: "Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)",
    mapping: STANDARD_MAPPING,
    index: 0,
    ...overrides,
  };
}

describe("pad diagnostics (task #197)", () => {
  it("reports only connected pads, with mapping trust", () => {
    const diag = readPadDiagnostics([null, pad({ index: 1 }), { ...pad(), connected: false }]);
    expect(diag).toHaveLength(1);
    expect(diag[0]).toMatchObject({ index: 1, buttonCount: 17, axisCount: 4, trusted: true });
  });

  it("flags a non-standard mapping as untrusted", () => {
    expect(padMappingTrusted({ mapping: "" })).toBe(false);
    expect(padMappingTrusted({ mapping: "xr-standard" })).toBe(false);
    expect(padMappingTrusted({ mapping: STANDARD_MAPPING })).toBe(true);

    const pads = [pad(), pad({ mapping: "", id: "Weird HID Gamepad" })];
    expect(hasUntrustedMapping(pads)).toBe(true);
    expect(readPadDiagnostics(pads).map((d) => d.trusted)).toEqual([true, false]);
  });

  it("an undetailed PadState fake reads as an unknown, untrusted pad", () => {
    // the existing input-layer fakes carry only connected/axes/buttons
    const bare: PadInfo = { connected: true, axes: [0, 0], buttons: [{ pressed: false }] };
    const [d] = readPadDiagnostics([bare]);
    expect(d).toMatchObject({ index: 0, id: "", mapping: "", trusted: false });
  });

  it("hasConnectedPad is false for an all-null (unwoken) list", () => {
    expect(hasConnectedPad([null, null])).toBe(false);
    expect(hasConnectedPad([pad()])).toBe(true);
  });

  it("the wake hint shows only before a pad wakes and before any interaction", () => {
    const noPads = { pads: [null], interacted: false, touch: false };
    expect(gamepadWakeHintVisible(noPads)).toBe(true);
    // a woken pad replaces the hint with the detail chip
    expect(gamepadWakeHintVisible({ ...noPads, pads: [pad()] })).toBe(false);
    // a keyboard/mouse user who has interacted never needs it
    expect(gamepadWakeHintVisible({ ...noPads, interacted: true })).toBe(false);
    // a phone has no pad to wake
    expect(gamepadWakeHintVisible({ ...noPads, touch: true })).toBe(false);
  });

  it("shortPadId keeps the head and never returns an empty string", () => {
    expect(shortPadId("")).toBe("unknown pad");
    expect(shortPadId("   ")).toBe("unknown pad");
    expect(shortPadId("Xbox", 32)).toBe("Xbox");
    const long = shortPadId("A".repeat(80), 10);
    expect(long.length).toBe(10);
    expect(long.endsWith("…")).toBe(true);
  });
});
