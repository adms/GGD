import { describe, it, expect } from "vitest";
import { SettingsStore } from "./SettingsStore";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("scratch: mobile fpsCap survives a preset pick?", () => {
  it("fresh mobile store defaults to 30", () => {
    const s = new SettingsStore(mem(), true);
    expect(s.get().graphics.fpsCap).toBe(30);
  });
  it("picking a quality preset on mobile", () => {
    const s = new SettingsStore(mem(), true);
    s.setPreset("low");
    console.log("after setPreset('low') on MOBILE, fpsCap =", s.get().graphics.fpsCap);
    s.setPreset("high");
    console.log("after setPreset('high') on MOBILE, fpsCap =", s.get().graphics.fpsCap);
  });
});
