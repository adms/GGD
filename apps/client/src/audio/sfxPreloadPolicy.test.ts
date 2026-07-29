/**
 * audio/sfxPreloadPolicy — the WHEN half of task #63.
 *
 * Two things have to hold at once and they pull against each other:
 *   (a) the login screen must not drag the combat set in (the original defect —
 *       every clip fetched at boot), and
 *   (b) the combat set must already be warm BEFORE combat starts, because
 *       warming it ON the combat edge means `roundStart` and the first swing
 *       race the fetch they need (failure form ②: scheduled, but not in time).
 *
 * So the assertions below are byte-level and read the SHIPPED
 * `content/config/audio-map.json` + the shipped manifest, not a fixture: the
 * question "does the login screen pull a combat file" only has a real answer
 * against the real map.
 *
 * The successor graph is also RE-DERIVED here by pushing the server's phase
 * order through `scene.sceneForMatch`, so the table cannot quietly drift away
 * from the scene rule the mixer actually switches on.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIO_SCENES, type AudioScene } from "./types";
import { sceneForMatch } from "./scene";
import { SFX_BY_SCENE, SFX_CORE } from "./sfxManifest";
import {
  DEFAULT_SFX_PRELOAD_POLICY,
  MAX_LOOKAHEAD,
  SCENE_SUCCESSORS,
  SFX_PRELOAD_POLICY_PATH,
  clampSfxPreloadPolicy,
  scenesToWarm,
  sfxPreloadPolicyFromDoc,
  successorsOf,
} from "./sfxPreloadPolicy";

const CONTENT = join(__dirname, "../../../../content");

interface ShippedMap {
  sfx?: Record<string, { files?: string[] }>;
}

function shippedMap(): ShippedMap {
  return JSON.parse(readFileSync(join(CONTENT, "config/audio-map.json"), "utf8")) as ShippedMap;
}

/** The CLIP FILES a set of scenes warms, resolved through the shipped map. */
function filesForScenes(scenes: readonly AudioScene[], includeCore = false): Set<string> {
  const map = shippedMap().sfx ?? {};
  const events = new Set<string>(includeCore ? SFX_CORE : []);
  for (const s of scenes) for (const e of SFX_BY_SCENE[s] ?? []) events.add(e);
  const files = new Set<string>();
  for (const e of events) for (const f of map[e]?.files ?? []) files.add(f);
  return files;
}

describe("sfxPreloadPolicy — successor graph (audio-sfx-preload-lookahead)", () => {
  it("re-derives every in-match edge through the real sceneForMatch rule", () => {
    cover("audio-sfx-preload-lookahead");
    // The server's phase order (apps/game-server/src/match/PhaseMachine.ts:
    // champSelect → [intermission → combat → resolution]* → matchEnd), mirrored
    // as data so the derivation below is against the CLIENT's scene rule.
    const phaseEdges: readonly (readonly [string, string])[] = [
      ["champSelect", "intermission"],
      ["intermission", "combat"],
      ["combat", "resolution"],
      ["resolution", "intermission"],
      ["resolution", "matchEnd"],
    ];
    const ignite = 60;
    // early combat resolves to `combat`, late combat to `fireRing` — both are
    // real "from" scenes, and matchEnd resolves by placement.
    const sceneOf = (phase: string, late: boolean, placement: number): AudioScene =>
      sceneForMatch({
        phase,
        phaseSecondsLeft: late ? 5 : 999,
        fireRingSec: ignite,
        placement,
      })!;

    for (const [from, to] of phaseEdges) {
      for (const late of [false, true]) {
        for (const placement of [1, 4]) {
          const a = sceneOf(from, late, placement);
          const b = sceneOf(to, false, placement);
          expect(a, `no scene for phase ${from}`).toBeTruthy();
          expect(b, `no scene for phase ${to}`).toBeTruthy();
          expect(
            SCENE_SUCCESSORS[a],
            `SCENE_SUCCESSORS["${a}"] is missing "${b}" (phase edge ${from}→${to})`,
          ).toContain(b);
        }
      }
    }
    // and the in-combat swap the fire ring makes
    expect(sceneOf("combat", false, 1)).toBe("combat");
    expect(sceneOf("combat", true, 1)).toBe("fireRing");
    expect(SCENE_SUCCESSORS.combat).toContain("fireRing");
  });

  it("gives every scene an entry, and never names a scene that does not exist", () => {
    cover("audio-sfx-preload-lookahead");
    for (const s of AUDIO_SCENES) {
      expect(SCENE_SUCCESSORS[s], `no successors entry for "${s}"`).toBeDefined();
      for (const next of SCENE_SUCCESSORS[s]) expect(AUDIO_SCENES).toContain(next);
    }
  });
});

describe("sfxPreloadPolicy — warm order + depth (audio-sfx-preload-lookahead)", () => {
  it("warms the CURRENT scene first, then successors breadth-first", () => {
    cover("audio-sfx-preload-lookahead");
    const two = scenesToWarm("settlement", { ...DEFAULT_SFX_PRELOAD_POLICY, lookahead: 2 });
    expect(two[0]).toBe("settlement"); // the scene you are actually in leads
    expect(two.slice(1, 4).sort()).toEqual(["defeat", "intermission", "victory"]);
    expect(two).toContain("combat"); // depth 2, via intermission
    expect(two.indexOf("combat")).toBeGreaterThan(two.indexOf("intermission"));
    expect(new Set(two).size).toBe(two.length); // deduped
  });

  it("lookahead 0 warms the current scene ONLY", () => {
    cover("audio-sfx-preload-lookahead");
    expect(scenesToWarm("intermission", { ...DEFAULT_SFX_PRELOAD_POLICY, lookahead: 0 })).toEqual([
      "intermission",
    ]);
  });

  it("disabled warms NOTHING (the 要不要預載 switch is a real switch)", () => {
    cover("audio-sfx-preload-lookahead");
    expect(scenesToWarm("combat", { ...DEFAULT_SFX_PRELOAD_POLICY, enabled: false })).toEqual([]);
    expect(scenesToWarm(null)).toEqual([]);
    expect(scenesToWarm(undefined)).toEqual([]);
  });

  it("terminates on cycles instead of re-warming (menu ↔ menuNocturne)", () => {
    cover("audio-sfx-preload-lookahead");
    const all = scenesToWarm("menu", { ...DEFAULT_SFX_PRELOAD_POLICY, lookahead: MAX_LOOKAHEAD });
    expect(new Set(all).size).toBe(all.length);
    expect(all.filter((s) => s === "menu")).toHaveLength(1);
  });

  it("honours a successors override so the flow is retunable without a rebuild", () => {
    cover("audio-sfx-preload-lookahead");
    const policy = clampSfxPreloadPolicy({
      enabled: true,
      lookahead: 1,
      successors: { lobby: ["combat"] },
    });
    expect(successorsOf("lobby", policy)).toEqual(["combat"]);
    expect(scenesToWarm("lobby", policy)).toEqual(["lobby", "combat"]);
    // untouched scenes still fall back to the built-in graph
    expect(successorsOf("intermission", policy)).toEqual(SCENE_SUCCESSORS.intermission);
  });
});

describe("sfxPreloadPolicy — clamping (audio-sfx-preload-lookahead)", () => {
  it("clamps lookahead on BOTH ends, so a mistyped 50 cannot re-inflate boot", () => {
    cover("audio-sfx-preload-lookahead");
    expect(clampSfxPreloadPolicy({ lookahead: 50 }).lookahead).toBe(MAX_LOOKAHEAD);
    expect(clampSfxPreloadPolicy({ lookahead: -3 }).lookahead).toBe(0);
    expect(clampSfxPreloadPolicy({ lookahead: 1.9 }).lookahead).toBe(1);
    expect(clampSfxPreloadPolicy({ lookahead: Number.NaN }).lookahead).toBe(
      DEFAULT_SFX_PRELOAD_POLICY.lookahead,
    );
    expect(clampSfxPreloadPolicy({ lookahead: "2" }).lookahead).toBe(
      DEFAULT_SFX_PRELOAD_POLICY.lookahead,
    );
  });

  it("drops junk instead of throwing (a bad policy must load like before)", () => {
    cover("audio-sfx-preload-lookahead");
    expect(clampSfxPreloadPolicy(null)).toEqual(DEFAULT_SFX_PRELOAD_POLICY);
    expect(clampSfxPreloadPolicy("nonsense")).toEqual(DEFAULT_SFX_PRELOAD_POLICY);
    const p = clampSfxPreloadPolicy({
      successors: { nope: ["combat"], lobby: ["combat", "combat", "notAScene", 7] },
    });
    expect(p.successors).toEqual({ lobby: ["combat"] });
  });

  it("accepts only the tagged doc", () => {
    cover("audio-sfx-preload-lookahead");
    expect(sfxPreloadPolicyFromDoc({ schema: "config.audio-map@1", lookahead: 0 })).toBeNull();
    expect(sfxPreloadPolicyFromDoc(null)).toBeNull();
    const ok = sfxPreloadPolicyFromDoc({ schema: "audio.sfx-preload@1", enabled: false, lookahead: 3 });
    expect(ok).toEqual({ enabled: false, lookahead: 3, successors: {} });
  });
});

describe("sfxPreloadPolicy — shipped doc + byte budget (audio-sfx-preload-lookahead)", () => {
  it("the shipped policy doc agrees with the in-code fallback", () => {
    cover("audio-sfx-preload-lookahead");
    const doc = JSON.parse(
      readFileSync(join(CONTENT, SFX_PRELOAD_POLICY_PATH), "utf8"),
    ) as Record<string, unknown>;
    const parsed = sfxPreloadPolicyFromDoc(doc);
    expect(parsed, `${SFX_PRELOAD_POLICY_PATH} is not an audio.sfx-preload@1 doc`).not.toBeNull();
    expect(parsed).toEqual(DEFAULT_SFX_PRELOAD_POLICY);
  });

  it("the login screen still pulls NO combat clip at the shipped depth", () => {
    cover("audio-sfx-preload-lookahead");
    // (a): the original defect. combat is three hops from `menu`, so the shipped
    // lookahead can never reach it — raising the default depth turns this red.
    const login = filesForScenes(scenesToWarm("menu", DEFAULT_SFX_PRELOAD_POLICY), true);
    const combat = filesForScenes(["combat"]);
    const leaked = [...login].filter((f) => combat.has(f));
    expect(leaked, `login warm leaked combat clips: ${leaked.join(", ")}`).toEqual([]);
    expect(combat.size).toBeGreaterThan(20); // the set we are proving absent is real
  });

  it("even at the CEILING the login screen cannot reach a combat clip", () => {
    cover("audio-sfx-preload-lookahead");
    // MAX_LOOKAHEAD is not a round number — it is chosen so that the deepest
    // legal setting still stops short of combat from `menu` (menu → lobby →
    // room → champSelect → intermission is already 4 hops). That is what makes
    // the clamp a real guard rather than a comment: raise the ceiling and the
    // login screen starts pulling the 2.7 MB combat bucket again.
    const maxed = scenesToWarm("menu", { ...DEFAULT_SFX_PRELOAD_POLICY, lookahead: MAX_LOOKAHEAD });
    expect(maxed).not.toContain("combat");
    expect(maxed).not.toContain("fireRing");
    // Byte-level, on the clips ONLY combat needs. A handful of files are shared
    // with a pre-match scene that legitimately fires them (goldGain's
    // lab/gold-gain.mp3 is the shop's own payout cue AND the tower last-hit
    // payout), and warming those on the login path costs combat nothing.
    const shared = filesForScenes(
      AUDIO_SCENES.filter((s) => s !== "combat" && s !== "fireRing"),
      true,
    );
    const combatOnly = [...filesForScenes(["combat"])].filter((f) => !shared.has(f));
    expect(combatOnly.length).toBeGreaterThan(20); // the set being proven absent is real
    const login = filesForScenes(maxed, true);
    expect(combatOnly.filter((f) => login.has(f))).toEqual([]);
  });

  it("the shop window warms the WHOLE combat set before combat is entered", () => {
    cover("audio-sfx-preload-lookahead");
    // (b): the half this task adds. Every file combat needs must already be
    // requested by the time the player is standing in the shop.
    const prep = filesForScenes(scenesToWarm("intermission", DEFAULT_SFX_PRELOAD_POLICY));
    const combat = filesForScenes(["combat"]);
    const cold = [...combat].filter((f) => !prep.has(f));
    expect(cold, `combat clips still cold at combat entry: ${cold.join(", ")}`).toEqual([]);
  });

  it("no scene's warm set is the whole catalogue (the boot saving survives)", () => {
    cover("audio-sfx-preload-lookahead");
    const everything = new Set<string>();
    const map = shippedMap().sfx ?? {};
    for (const e of Object.keys(map)) for (const f of map[e]?.files ?? []) everything.add(f);
    for (const s of AUDIO_SCENES) {
      const warm = filesForScenes(scenesToWarm(s, DEFAULT_SFX_PRELOAD_POLICY), true);
      expect(warm.size, `scene "${s}" warms ${warm.size}/${everything.size} files`).toBeLessThan(
        everything.size * 0.75,
      );
    }
  });
});
