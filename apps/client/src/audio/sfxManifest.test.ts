/**
 * audio/sfxManifest — the per-scene SFX preload manifest (task #63).
 *
 * The manifest is a PRELOAD hint, so a typo can never cause a crash — it would
 * just silently fail to warm a cue, which lazy-loads instead. That silence is
 * exactly why these tests exist: every event named here is checked to (a) exist
 * in the shipped `content/config/audio-map.json`, so the name really resolves to
 * a clip, and (b) be small enough that "core" stays a genuine core.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIO_SCENES } from "./types";
import { SFX_CORE, SFX_BY_SCENE, sfxEventsForScene } from "./sfxManifest";

/** The shipped audio map the client actually fetches from /content/. */
function realSfxKeys(): Set<string> {
  const path = join(__dirname, "../../../../content/config/audio-map.json");
  const doc = JSON.parse(readFileSync(path, "utf8")) as { sfx?: Record<string, unknown> };
  return new Set(Object.keys(doc.sfx ?? {}));
}

describe("sfxManifest (audio-sfx-scene-preload)", () => {
  it("names only events that exist in the shipped audio map", () => {
    cover("audio-sfx-scene-preload");
    const known = realSfxKeys();
    const all = new Set<string>([...SFX_CORE, ...Object.values(SFX_BY_SCENE).flat()]);
    const unknown = [...all].filter((e) => !known.has(e));
    expect(unknown, `manifest events missing from audio-map.json: ${unknown.join(", ")}`).toEqual([]);
  });

  it("covers every AudioScene, so no scene is silently un-manifested", () => {
    cover("audio-sfx-scene-preload");
    for (const scene of AUDIO_SCENES) {
      expect(SFX_BY_SCENE[scene], `no manifest entry for scene "${scene}"`).toBeDefined();
    }
  });

  it("keeps the always-on core genuinely small (UI chrome only)", () => {
    cover("audio-sfx-scene-preload");
    // the whole point is that boot no longer eagerly pulls the ~80-clip set —
    // the core is a handful of UI cues, and everything in it is a ui* event
    expect(SFX_CORE.length).toBeGreaterThan(0);
    expect(SFX_CORE.length).toBeLessThanOrEqual(8);
    for (const e of SFX_CORE) expect(e.startsWith("ui")).toBe(true);
  });

  it("loads far less per scene than the full catalogue (the boot saving)", () => {
    cover("audio-sfx-scene-preload");
    const total = realSfxKeys().size;
    // combat is the heaviest scene; it must still be well under the whole set
    expect(SFX_BY_SCENE.combat.length).toBeLessThan(total / 2);
    // a quiet screen (lobby) warms nothing beyond the core
    expect(SFX_BY_SCENE.lobby).toEqual([]);
  });

  it("shares the combat layer between combat and its fireRing twin", () => {
    cover("audio-sfx-scene-preload");
    expect(SFX_BY_SCENE.fireRing).toEqual(SFX_BY_SCENE.combat);
  });

  it("sfxEventsForScene resolves entries and is empty for null/unknown", () => {
    cover("audio-sfx-scene-preload");
    expect(sfxEventsForScene("champSelect")).toEqual(SFX_BY_SCENE.champSelect);
    expect(sfxEventsForScene(null)).toEqual([]);
    expect(sfxEventsForScene(undefined)).toEqual([]);
    // no scene leaks the whole catalogue into a single preload
    for (const scene of AUDIO_SCENES) {
      expect(sfxEventsForScene(scene).length).toBeLessThan(realSfxKeys().size);
    }
  });
});
