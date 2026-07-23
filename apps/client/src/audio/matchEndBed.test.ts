/**
 * audio/matchEndBed — 主題曲·寧靜女聲 takes the bed once the WIN sting has played
 * itself out (task #134's real home, on task #93's screen).
 *
 * Three layers are pinned here:
 *   1. the pure rule (win + sting finished ⇒ the nocturne; anything else ⇒ null);
 *   2. the CONTENT facts it depends on — `victory` really is a one-shot,
 *      `menuNocturne` really is a loop, and the sting has NO fixed length, which
 *      is the whole reason the handover is event-driven;
 *   3. the React wiring in MatchEndPanel.tsx, by file-scan — the node test env
 *      cannot render .tsx (vite.config test.include is `src/**\/*.test.ts`), the
 *      same way audio/bgmOverride.test.ts gates the ranked-ladder panel.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { MATCH_WIN_BED, MATCH_WIN_STING, matchEndBedScene } from "./matchEndBed";
import { sceneForMatch } from "./scene";
import { SAMANTHA_VARIANTS } from "./bgmVariants";

const read = (rel: string): string => readFileSync(join(__dirname, "..", rel), "utf8");
const PANEL = "ui/panels/MatchEndPanel.tsx";

describe("match-end bed rule (match-end-nocturne-bed)", () => {
  it("stays silent while the win sting is still playing", () => {
    cover("match-end-nocturne-bed");
    // The #93 beat owns these seconds: dark wash → giant roast-chicken shell →
    // the savage 吃雞 VO → the local champion's 名言. The nocturne must not be
    // requested over any of it.
    expect(matchEndBedScene(true, false)).toBeNull();
  });

  it("hands the bed to the serene nocturne once that sting has ENDED", () => {
    cover("match-end-nocturne-bed");
    expect(matchEndBedScene(true, true)).toBe("menuNocturne");
    expect(MATCH_WIN_BED).toBe("menuNocturne");
  });

  it("NEVER asks for it on a defeat — before or after the loss sting", () => {
    cover("match-end-nocturne-bed");
    expect(matchEndBedScene(false, false)).toBeNull();
    expect(matchEndBedScene(false, true)).toBeNull();
  });

  it("watches the same sting the director actually plays for a winner", () => {
    cover("match-end-nocturne-bed");
    // If sceneForMatch ever renames/repoints the winner's bed, this fails rather
    // than leaving the handover listening for a scene nobody plays.
    expect(sceneForMatch({ phase: "matchEnd", phaseSecondsLeft: 0, placement: 1 })).toBe(
      MATCH_WIN_STING,
    );
    // and a loser gets a different bed, which is why the rule is win-gated
    expect(sceneForMatch({ phase: "matchEnd", phaseSecondsLeft: 0, placement: 2 })).not.toBe(
      MATCH_WIN_STING,
    );
  });
});

describe("the content facts the handover rests on (match-end-nocturne-bed-content)", () => {
  it("the win sting is a ONE-SHOT and the nocturne is a LOOP", () => {
    cover("match-end-nocturne-bed-content");
    const map = JSON.parse(read("../../../content/config/audio-map.json")) as {
      bgm: Record<string, { file: string; loop: boolean; gain?: number }>;
    };
    // one-shot ⇒ it has a natural end at all ⇒ onBedEnded can fire for it
    expect(map.bgm[MATCH_WIN_STING]?.loop).toBe(false);
    // the bed that takes over must LOOP, or the silence just moves later
    expect(map.bgm[MATCH_WIN_BED]?.loop).toBe(true);
    expect(map.bgm[MATCH_WIN_BED]?.file).toBe("assets/audio/bgm/menuNocturne.mp3");
    // and they are genuinely different tracks
    expect(map.bgm[MATCH_WIN_STING]?.file).not.toBe(map.bgm[MATCH_WIN_BED]?.file);
  });

  it("the win sting has NO single length — so no length may be written down", () => {
    cover("match-end-nocturne-bed-content");
    // The task-#137 rotation alternates the authored file with a Samantha
    // variant on every scene ENTRY, and the two are different lengths
    // (18.34 s vs 14.52 s as rendered today). Any constant in the UI would be
    // wrong for half of all wins even before tools/bgm-gen re-renders either
    // one. THIS is why the handover waits for AudioSystem.onBedEnded.
    expect(SAMANTHA_VARIANTS[MATCH_WIN_STING]).toBeDefined();
    expect(SAMANTHA_VARIANTS[MATCH_WIN_STING]).not.toBe("assets/audio/bgm/victory.mp3");
  });
});

describe("MatchEndPanel wiring (match-end-nocturne-bed-wiring)", () => {
  it("declares the bed from the rule, armed by the sting's own end", () => {
    cover("match-end-nocturne-bed-wiring");
    const panel = read(PANEL);
    // armed only for a winner (null disarms useBedEnded, per its doc)
    expect(panel).toMatch(/useBedEnded\(\s*wonMatch\s*\?\s*MATCH_WIN_STING\s*:\s*null\s*\)/);
    // and the override is the pure rule's output — never an inline condition
    expect(panel).toMatch(/useBgmSceneOverride\(\s*matchEndBedScene\(\s*wonMatch\s*,/);
    // the ref-counted registry is what releases it on unmount
    const useAudio = read("ui/useAudio.ts");
    expect(useAudio).toContain("export function useBedEnded");
    expect(useAudio).toContain("audioSystem.onBedEnded");
    expect(useAudio).toMatch(/return\s*\(\)\s*=>\s*bgmOverride\.release\(token\)/);
  });

  it("REGRESSION: no sting duration is hardcoded in the panel", () => {
    cover("match-end-nocturne-bed-wiring");
    const panel = read(PANEL);
    // 1. Not anywhere in the file, in seconds or milliseconds, for either of the
    //    two rendered variants. (This class of constant has bitten this project
    //    repeatedly: it silently goes stale the next time bgm-gen runs.)
    for (const literal of [/\b18[.,]3\d/, /\b18_?3\d\d\b/, /\b14[.,]5\d/, /\b14_?5\d\d\b/]) {
      expect(panel).not.toMatch(literal);
    }
    // 2. And, more strongly: the handover statements carry NO number and NO
    //    timer at all — they are pure data flow, so there is nowhere for a
    //    duration to hide. (The panel's other beats legitimately use timers;
    //    only these lines are constrained.)
    const handover = panel
      .split("\n")
      .filter((l) => /useBedEnded|matchEndBedScene|MATCH_WIN_STING|useBgmSceneOverride/.test(l));
    expect(handover.length).toBeGreaterThanOrEqual(3); // import + the two calls
    for (const line of handover) {
      expect(line).not.toMatch(/\d/);
      expect(line).not.toMatch(/setTimeout|setInterval|Date\.now|performance\.now/);
    }
  });

  it("REGRESSION: the loser's screen never reaches for the nocturne", () => {
    cover("match-end-nocturne-bed-wiring");
    const panel = read(PANEL);
    // The ONLY path to a bed request is matchEndBedScene, whose first argument
    // is wonMatch — so a defeat cannot acquire one. A bare literal request would
    // bypass that gate entirely.
    expect(panel).not.toMatch(/useBgmSceneOverride\(\s*["']/);
    expect(panel).not.toMatch(/bgmOverride\.request/);
  });
});
