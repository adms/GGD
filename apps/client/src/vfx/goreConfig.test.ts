/**
 * vfx-gore-style (task #39): the 濺血 style knob is a TONE decision with a
 * one-way safety property — a per-champion content override or a settings
 * change may only ever make a hit LESS bloody, never more. Specifically:
 *   · the shipped contract is red blood (the 濺血 request), at 0.85;
 *   · "off" resolves to nothing at all, for every champion, always;
 *   · a mechanical/undead champion sprays stylized energy even in blood mode;
 *   · a champion entry can NEVER re-introduce blood for a player who chose
 *     "stylized" or "off" — the player's choice is a floor;
 *   · intensity is a multiplicative user scale over the authored value.
 * Pure data — no Babylon, no scene.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  DEFAULT_GORE_CONFIG,
  GORE_STYLES,
  applyGoreDoc,
  goreConfig,
  mergeGore,
  minGoreStyle,
  normalizeGoreConfig,
  normalizeGoreOverride,
  resetGoreConfig,
  resolveGore,
  setGoreOverride,
  type GoreConfig,
  type GoreStyle,
} from "./goreConfig";

const cfg = (over: Partial<GoreConfig> = {}): GoreConfig => ({ ...DEFAULT_GORE_CONFIG, ...over });

beforeEach(() => {
  resetGoreConfig();
});

describe("shipped contract (vfx-gore-style)", () => {
  it("defaults to RED BLOOD — that is what 濺血 asked for", () => {
    cover("vfx-gore-style");
    expect(DEFAULT_GORE_CONFIG.style).toBe("blood");
    expect(DEFAULT_GORE_CONFIG.intensity).toBeGreaterThan(0.5);
    expect(resolveGore(DEFAULT_GORE_CONFIG)).toEqual({ style: "blood", intensity: 0.85 });
  });

  it("orders styles off < stylized < blood", () => {
    cover("vfx-gore-style");
    expect(GORE_STYLES).toEqual(["off", "stylized", "blood"]);
    expect(minGoreStyle("blood", "stylized")).toBe("stylized");
    expect(minGoreStyle("stylized", "blood")).toBe("stylized");
    expect(minGoreStyle("stylized", "off")).toBe("off");
    expect(minGoreStyle("blood", "blood")).toBe("blood");
  });
});

describe("style switching (vfx-gore-style)", () => {
  it("`off` resolves to NOTHING — zero intensity, for every champion", () => {
    cover("vfx-gore-style");
    const c = cfg({ style: "off", championStyles: { "godie-hgam": "stylized" } });
    for (const champ of [undefined, null, "godie-hgam", "godie-o00k"]) {
      expect(resolveGore(c, champ)).toEqual({ style: "off", intensity: 0 });
    }
  });

  it("intensity 0 is an `off` by another name (callers take one early-out)", () => {
    cover("vfx-gore-style");
    expect(resolveGore(cfg({ intensity: 0 }))).toEqual({ style: "off", intensity: 0 });
  });

  it("stylized keeps a spray but changes its identity", () => {
    cover("vfx-gore-style");
    const r = resolveGore(cfg({ style: "stylized" }));
    expect(r.style).toBe("stylized");
    expect(r.intensity).toBeGreaterThan(0);
  });
});

describe("per-champion override (vfx-gore-style)", () => {
  it("a mechanical/undead champion sprays stylized even in blood mode", () => {
    cover("vfx-gore-style");
    const c = cfg({ championStyles: { "godie-hlgr": "stylized", "godie-h02s": "off" } });
    expect(resolveGore(c, "godie-hlgr").style).toBe("stylized"); // 鋼彈
    expect(resolveGore(c, "godie-h02s")).toEqual({ style: "off", intensity: 0 }); // 死亡騎士
    expect(resolveGore(c, "godie-o00k").style).toBe("blood"); // 皮卡娘 bleeds
  });

  it("can NEVER raise gore above the player's choice", () => {
    cover("vfx-gore-style");
    // even a hand-edited doc that names "blood" for a champion is discarded
    const c = normalizeGoreConfig({ style: "stylized", championStyles: { "godie-hgam": "blood" } });
    expect(c.championStyles["godie-hgam"]).toBeUndefined();
    expect(resolveGore(c, "godie-hgam").style).toBe("stylized");
  });
});

describe("normalization (vfx-gore-style)", () => {
  it("coerces junk onto the shipped contract", () => {
    cover("vfx-gore-style");
    expect(normalizeGoreConfig(null)).toEqual(DEFAULT_GORE_CONFIG);
    expect(normalizeGoreConfig({ style: "gushing", intensity: 9 })).toEqual({
      style: "blood",
      intensity: 1,
      championStyles: {},
    });
    expect(normalizeGoreConfig({ intensity: -3 }).intensity).toBe(0);
  });

  it("normalizes a user override, defaulting to `default`/×1", () => {
    cover("vfx-gore-style");
    expect(normalizeGoreOverride(undefined)).toEqual({ style: "default", intensityScale: 1 });
    expect(normalizeGoreOverride({ style: "nope" })).toEqual({ style: "default", intensityScale: 1 });
    expect(normalizeGoreOverride({ style: "off", intensityScale: 0.5 })).toEqual({
      style: "off",
      intensityScale: 0.5,
    });
  });
});

describe("intensity scaling (vfx-gore-style)", () => {
  it("the user scale MULTIPLIES the authored intensity", () => {
    cover("vfx-gore-style");
    const c = cfg({ intensity: 0.8 });
    expect(mergeGore(c, { style: "default", intensityScale: 0.5 }).intensity).toBeCloseTo(0.4, 6);
    expect(mergeGore(c, { style: "default", intensityScale: 1 }).intensity).toBeCloseTo(0.8, 6);
    expect(mergeGore(c, { style: "default", intensityScale: 0 }).intensity).toBe(0);
  });

  it("an explicit user style wins outright over the content doc", () => {
    cover("vfx-gore-style");
    const c = cfg({ style: "blood" });
    expect(mergeGore(c, { style: "off", intensityScale: 1 }).style).toBe("off");
    expect(mergeGore(c, { style: "default", intensityScale: 1 }).style).toBe("blood");
  });
});

describe("live config layering (vfx-gore-style)", () => {
  it("content doc sets the baseline; the user layer overrides it", () => {
    cover("vfx-gore-style");
    applyGoreDoc({
      id: "gore",
      schema: "config.gore@1",
      style: "blood",
      intensity: 0.6,
      championStyles: { "godie-hlgr": "stylized" },
    });
    expect(goreConfig().intensity).toBeCloseTo(0.6, 6);
    expect(resolveGore(goreConfig(), "godie-hlgr").style).toBe("stylized");

    setGoreOverride({ style: "stylized", intensityScale: 0.5 });
    expect(goreConfig().style).toBe("stylized");
    expect(goreConfig().intensity).toBeCloseTo(0.3, 6);

    setGoreOverride({ style: "off" });
    expect(resolveGore(goreConfig())).toEqual({ style: "off", intensity: 0 });
  });

  it("a missing/404 content doc leaves the shipped default standing", () => {
    cover("vfx-gore-style");
    applyGoreDoc(null);
    const styles: GoreStyle[] = [goreConfig().style];
    expect(styles).toEqual(["blood"]);
    expect(goreConfig().intensity).toBe(DEFAULT_GORE_CONFIG.intensity);
  });
});
