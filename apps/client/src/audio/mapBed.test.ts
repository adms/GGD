/**
 * GH#531 — the per-arena battle theme replaces the shared `combat` bed and
 * NOTHING ELSE.
 *
 * ⭐ owner 2026-08-22, mid-implementation:「火圈時一樣還是播放緊急的火圈音樂喔」
 *
 * That ruling is the whole reason this file exists. `fireRing` is the 30-second
 * countdown cue — it is written against the clock, it is the sound of "you are
 * about to die", and it means the same thing on every map. Letting an arena
 * theme swallow it would replace an URGENT cue with an ambient one at exactly
 * the moment the player most needs to be told. The substitution is therefore
 * scoped to the single string "combat", and this test is what keeps it scoped:
 * ⛔ it is not enough that I wrote it correctly once.
 */
import { describe, it, expect } from "vitest";
import { resolveBed, bedPhaseKey, ARENA_THEMED_SCENE } from "./audioSelect";
import type { AudioMap } from "./types";

const MAP: AudioMap = {
  bgm: {
    combat: { file: "assets/audio/bgm/combat.mp3", loop: true, gain: 0.52 },
    fireRing: { file: "assets/audio/bgm/fireRing.mp3", loop: true, gain: 0.56 },
    intermission: { file: "assets/audio/bgm/intermission.mp3", loop: true },
    battleStart: { file: "assets/audio/bgm/battleStart.mp3", loop: false },
  },
  mapBgm: {
    "arena.shiganshina": { file: "assets/audio/bgm/map.shiganshina.mp3", loop: true, gain: 0.54 },
  },
  sfx: {},
};

/**
 * ⭐ The SHIPPED resolver — the same call `AudioSystem.trackFor` makes. ⛔ Not a
 * local re-implementation: one of those passes whether or not the mixer agrees
 * with it (失敗形態⑤), and this test's whole job is to keep the mixer honest.
 */
const resolve = (scene: string, arena: string | null) => resolveBed(MAP, scene, arena);

describe("per-arena battle theme (GH#531)", () => {
  it("replaces the combat bed on an arena that has its own theme", () => {
    expect(resolve("combat", "arena.shiganshina")?.file)
      .toBe("assets/audio/bgm/map.shiganshina.mp3");
  });

  it("⭐ NEVER touches fireRing — the urgent cue survives on every map", () => {
    for (const arena of ["arena.shiganshina", "arena.nazarick", null]) {
      expect(resolve("fireRing", arena)?.file,
        `火圈在 ${arena} 上被換掉了 —— owner 明說火圈要維持緊急音樂`)
        .toBe("assets/audio/bgm/fireRing.mp3");
    }
  });

  it("leaves every other scene alone", () => {
    for (const scene of ["intermission", "battleStart"]) {
      expect(resolve(scene, "arena.shiganshina")?.file).toBe(MAP.bgm[scene]?.file);
    }
  });

  it("keeps the shared combat bed on an arena with no theme — ⛔ never silence", () => {
    expect(resolve("combat", "arena.does-not-exist")?.file)
      .toBe("assets/audio/bgm/combat.mp3");
    expect(resolve("combat", null)?.file).toBe("assets/audio/bgm/combat.mp3");
  });

  it("scopes the substitution to exactly one scene name", () => {
    expect(ARENA_THEMED_SCENE).toBe("combat");
  });

  it("gives each arena its own loop-phase key so a map bed never resumes mid-stranger", () => {
    expect(bedPhaseKey("combat", "arena.shiganshina", true)).toBe("combat:arena.shiganshina");
    expect(bedPhaseKey("combat", "arena.nazarick", true)).toBe("combat:arena.nazarick");
    // the shared bed keeps the plain key, so existing cross-round phase resume is unchanged
    expect(bedPhaseKey("combat", "arena.shiganshina", false)).toBe("combat");
    expect(bedPhaseKey("fireRing", "arena.shiganshina", false)).toBe("fireRing");
  });
});
