/**
 * The staged login-immersion SFX (task #20) must be wired into the SHIPPING
 * audio map (`content/config/audio-map.json`) and parse through the client's
 * `audioMapFromDoc` — so the AudioSystem can look up `dragonRoar` / `uiClick` /
 * `uiHover` / `uiType`. Reads the real content file (not a fixture) so the test
 * fails if an entry is dropped or a clip path drifts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { audioMapFromDoc } from "./types";

const AUDIO_MAP_PATH = fileURLToPath(new URL("../../../../content/config/audio-map.json", import.meta.url));

describe("login SFX audio-map wiring (audio-map-login-keys)", () => {
  const doc = JSON.parse(readFileSync(AUDIO_MAP_PATH, "utf8")) as unknown;

  it("the shipping audio-map parses and exposes the login-immersion SFX keys", () => {
    cover("audio-map-login-keys");
    const map = audioMapFromDoc(doc);
    expect(map).not.toBeNull();
    const sfx = map!.sfx;

    // the four staged SFX events are present with non-empty clip pools
    for (const key of ["dragonRoar", "uiClick", "uiHover", "uiType"] as const) {
      expect(sfx[key], `${key} missing from audio-map`).toBeTruthy();
      expect(sfx[key]!.files.length).toBeGreaterThan(0);
      for (const f of sfx[key]!.files) expect(f.startsWith("assets/audio/sfx/")).toBe(true);
    }

    // the roar is a 2-clip pool (near + far variant) so it can vary per roar
    expect(sfx.dragonRoar!.files).toEqual([
      "assets/audio/sfx/dragon-roar.mp3",
      "assets/audio/sfx/dragon-roar2.mp3",
    ]);
    // the staged clip filenames are exactly the ones the credits/task reference
    expect(sfx.uiClick!.files).toContain("assets/audio/sfx/ui-click.mp3");
    expect(sfx.uiHover!.files).toContain("assets/audio/sfx/ui-hover.mp3");
    expect(sfx.uiType!.files).toContain("assets/audio/sfx/ui-type.mp3");
  });

  it("the UI ticks are quiet + fast (won't machine-gun) and the roar is throttled", () => {
    cover("audio-map-login-keys");
    const sfx = audioMapFromDoc(doc)!.sfx;
    // typing tick: very short cooldown so per-keystroke play isn't dropped
    expect(sfx.uiType!.cooldownMs ?? 0).toBeLessThanOrEqual(40);
    // roar: a long cooldown so overlapping breath edges don't stack a wall of roars
    expect(sfx.dragonRoar!.cooldownMs ?? 0).toBeGreaterThanOrEqual(1000);
  });

  it("dragonRoarBig is a DISTINCT loud angry clip, separate from the ambient howl pool (#26)", () => {
    cover("audio-map-roar-big");
    const sfx = audioMapFromDoc(doc)!.sfx;
    const big = sfx.dragonRoarBig;
    expect(big, "dragonRoarBig missing from audio-map").toBeTruthy();
    // the scripted action roar plays the staged angry clip…
    expect(big!.files).toEqual(["assets/audio/sfx/dragon-roar-angry.mp3"]);
    // …which must NOT appear in the ambient long-howl pool (two distinct voices)
    for (const f of big!.files) expect(sfx.dragonRoar!.files).not.toContain(f);
    // 特別大聲: the angry roar is authored louder than the ambient howl.
    // Asserted RELATIVELY, not against a fixed number. The user halved both
    // gains (「龍吼跟龍吟都可以降低 50%音量」: 0.85→0.425 and 1.0→0.5) and this
    // line — pinned at an absolute 0.85 — went red even though the property it
    // documents still held. The relationship is the requirement; the absolute
    // level is a mix decision that is allowed to move.
    expect(big!.gain ?? 1).toBeGreaterThan(sfx.dragonRoar!.gain ?? 1);
    // throttled like the other roars so a double-trigger can't stack a blast
    expect(big!.cooldownMs ?? 0).toBeGreaterThanOrEqual(1000);
  });
});
