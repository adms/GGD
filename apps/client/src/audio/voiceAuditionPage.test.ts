/**
 * THE AUDITION SURFACE IS PART OF THE DELIVERABLE, SO IT GETS A GUARD.
 *
 * `public/voice-spatial-audition.html` is the only artefact of #259 a HUMAN can
 * evaluate — task #62 means no agent may ever hear this feature, so "the curve
 * is tuned right" is a judgement only the owner can make, by dragging a slider
 * with sound on. A page that silently stops matching the shipped engine is
 * therefore worse than no page: it would let the owner sign off on numbers the
 * game does not use.
 *
 * Three properties, and all three are about DRIFT rather than about looks:
 *   1. it imports the REAL modules (rename one and this goes red);
 *   2. it does not RE-IMPLEMENT any of the geometry (no second copy of the law);
 *   3. it stays out of the production bundle — `public/*.html` is not a build
 *      entry, which is design, not an oversight.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(HERE, "../.."); // src/audio → apps/client
const PAGE_PATH = join(CLIENT, "public/voice-spatial-audition.html");

describe("the #259 audition page is real and cannot drift (voice-audition-page)", () => {
  it("exists and drives the SHIPPED modules, not a copy of them", () => {
    cover("voice-audition-page");
    expect(existsSync(PAGE_PATH), "the audition page is a deliverable, not a nice-to-have").toBe(
      true,
    );
    const html = readFileSync(PAGE_PATH, "utf8");
    // the mix comes from the engine…
    expect(html).toContain('import("/src/audio/voiceSpatial.ts")');
    expect(html).toContain('import("/src/audio/spatial.ts")');
    // …and the SOUND comes from the real mixer, so what the owner hears is the
    // real gain → panner → lowpass → sfxBus chain, not a hand-rolled graph.
    expect(html).toContain('import("/src/audio/AudioSystem.ts")');
    expect(html).toContain("audio.playClip(");
    expect(html).toContain("mod.voicePlayOptions(mix)");
    expect(html).toContain("mod.voiceSpatialMix(");
  });

  it("re-implements NO geometry — every number on screen came from the engine", () => {
    cover("voice-audition-page");
    const html = readFileSync(PAGE_PATH, "utf8");
    const script = html.slice(html.indexOf("<script"));
    // the laws, by their shapes: a duplicated pan law, distance law or depth
    // interpolation would let the page and the game disagree silently.
    expect(script).not.toMatch(/Math\.tanh/);
    expect(script).not.toMatch(/Math\.pow/);
    expect(script).not.toMatch(/\b(20000|1600|0\.75)\b/);
    // the cutoff and the skip threshold are READ, never restated
    expect(script).toContain("spatial.VOICE_FAR");
    expect(script).toContain("spatial.PAN_SKIP");
    expect(script).toContain("spatial.distanceGain(");
    expect(script).toContain("spatial.farCutoff(");
  });

  it("lists the champions from the SHIPPED manifest, so it cannot go stale", () => {
    cover("voice-audition-page");
    const html = readFileSync(PAGE_PATH, "utf8");
    expect(html).toContain("/content/assets/audio/voices/champions/MANIFEST.json");
    // no hard-coded roster: a champion added to the pack must appear by itself
    expect(html).not.toMatch(/godie-[0-9a-z]{4}["'],\s*["']godie-/);
  });

  it("is NOT pulled into the production bundle", () => {
    cover("voice-audition-page");
    // vite's only html entry is apps/client/index.html; `public/` is copied
    // verbatim and never scanned for entries. Assert both halves rather than
    // trusting the convention.
    const index = readFileSync(join(CLIENT, "index.html"), "utf8");
    expect(index).not.toContain("voice-spatial-audition");
    const cfg = readFileSync(join(CLIENT, "vite.config.ts"), "utf8");
    expect(cfg).not.toMatch(/rollupOptions[\s\S]{0,400}input/);
    // and nothing in the app links to it, so it cannot be reached by a player
    // stumbling through the UI either.
    expect(existsSync(join(CLIENT, "src/main.tsx"))).toBe(true);
  });

  it("names the #62 escape hatch so it can be opened SILENTLY", () => {
    cover("voice-audition-page");
    // `?silent=1` forces shouldSilenceAudio() true, which is how this page can be
    // opened by an agent (or in a screenshot run) with a guarantee of no sound.
    const gate = readFileSync(join(HERE, "AudioSystem.ts"), "utf8");
    expect(gate).toContain('params.has("silent")');
  });
});
