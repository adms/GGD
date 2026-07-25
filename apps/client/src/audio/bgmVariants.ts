/**
 * audio/bgmVariants — the "Samantha James" ROTATING-BGM registry + rotation
 * store (task #137).
 *
 * Every scene now ships TWO beds: the pack ORIGINAL and a nu-jazz / deep-house
 * "Samantha James" reimagining (rendered by tools/bgm-gen to
 * `content/assets/audio/bgm/<scene>.samantha.mp3`). On each SCENE ENTRY the
 * bed alternates original → variant → original → …, so a player hears the same
 * cue two ways across a session without any restart of a bed that is already
 * playing (re-asking for the current scene is still a no-op upstream).
 *
 * WHY A CODE REGISTRY AND NOT AN `audio-map.json` FIELD. The authored
 * `config.audio-map@1` doc is validated by a `.strict()` Zod schema in
 * `packages/shared` (a package this layer must not edit), and
 * `audioAssets.test.ts` parses the REAL file with that schema and also asserts
 * `bgm` has EXACTLY the 12 scene keys — so a `variants` field, or an extra bgm
 * key, would fail content validation. The variant path is fully derivable from
 * the base (`…/<scene>.mp3` → `…/<scene>.samantha.mp3`), so the rotation reuses
 * the audio-map's base `file` and adds the variant here, in a layer we own,
 * with zero schema risk.
 *
 * WHY `menu` IS LOCKED. Task #134 keeps the LOGIN screen on the single epic
 * `menu` theme — it must never rotate. `menuNocturne` (the ranked-ladder bed)
 * and every in-scene cue MAY rotate. `menu` is therefore both absent from the
 * variant map AND named in ROTATION_LOCKED_SCENES (belt and braces). The
 * `menu.samantha.mp3` file still exists for the audition page's 12+12 — it just
 * never plays in the running app.
 *
 * No React, no WebAudio here — pure data + a tiny counter store, unit-tested
 * without a browser, the same shape as the other pure audio modules.
 */
import type { AudioScene } from "./types";

/**
 * Content-relative Samantha-James deep-house variant per ROTATING scene. `menu`
 * is intentionally absent (login stays the single epic theme, task #134). Every
 * path is a real, non-empty loop/one-shot rendered by tools/bgm-gen.
 */
export const SAMANTHA_VARIANTS: Readonly<Partial<Record<AudioScene, string>>> = {
  menuNocturne: "assets/audio/bgm/menuNocturne.samantha.mp3",
  lobby: "assets/audio/bgm/lobby.samantha.mp3",
  room: "assets/audio/bgm/room.samantha.mp3",
  champSelect: "assets/audio/bgm/champSelect.samantha.mp3",
  intermission: "assets/audio/bgm/intermission.samantha.mp3",
  battleStart: "assets/audio/bgm/battleStart.samantha.mp3",
  combat: "assets/audio/bgm/combat.samantha.mp3",
  fireRing: "assets/audio/bgm/fireRing.samantha.mp3",
  settlement: "assets/audio/bgm/settlement.samantha.mp3",
  victory: "assets/audio/bgm/victory.samantha.mp3",
  defeat: "assets/audio/bgm/defeat.samantha.mp3",
};

/** Scenes that must NEVER rotate — the login theme stays epic-only (task #134). */
export const ROTATION_LOCKED_SCENES: ReadonlySet<string> = new Set<string>(["menu"]);

/**
 * The variant map the RUNNING app actually rotates over. Owner 2026-07-25:
 * 「Samantha James 變體先都不使用」 — so this is EMPTY, and every scene plays its
 * original bed only (BgmRotationStore with no variant = a no-op). The
 * SAMANTHA_VARIANTS map above and the .samantha.mp3 files are kept intact (the
 * bgm-audition page still lists all 12+12); ONLY the live wiring is switched
 * off. To re-enable rotation in-game, set this back to SAMANTHA_VARIANTS.
 */
export const ACTIVE_BGM_VARIANTS: BgmVariantMap = {};

/** A scene → variant-file map (the shape `BgmRotationStore` consumes). */
export type BgmVariantMap = Readonly<Partial<Record<string, string>>>;

/**
 * Derive the Samantha variant path from a base bgm file path
 * (`…/<scene>.mp3` → `…/<scene>.samantha.mp3`). Returns null for a non-mp3
 * path. Handy for callers that want to build a variant map from the audio-map
 * instead of hard-coding one.
 */
export function samanthaVariantPath(baseFile: string): string | null {
  const m = /^(.*)\.mp3$/i.exec(baseFile);
  return m ? `${m[1]}.samantha.mp3` : null;
}

/**
 * BgmRotationStore — per-scene rotation over [original, variant]. Pure
 * bookkeeping: it counts how many times each scene has been ENTERED and returns
 * the file for that entry (entry 0 = original, entry 1 = variant, entry 2 =
 * original, …). A scene with no configured variant, or a locked scene (`menu`),
 * always resolves to the original, so the store is a no-op when no variants are
 * supplied — which is exactly how the AudioSystem behaves for callers (and
 * tests) that construct it without a variant map.
 */
export class BgmRotationStore {
  private readonly plays = new Map<string, number>();
  private readonly chosen = new Map<string, string>();

  constructor(private readonly variants: BgmVariantMap = {}) {}

  /** The files a scene entry alternates over: [original, variant] or [original]. */
  candidates(scene: string, baseFile: string): string[] {
    if (ROTATION_LOCKED_SCENES.has(scene)) return [baseFile];
    const v = this.variants[scene];
    return v && v !== baseFile ? [baseFile, v] : [baseFile];
  }

  /** Advance this scene's rotation and return the file for THIS entry. */
  next(scene: string, baseFile: string): string {
    const files = this.candidates(scene, baseFile);
    const n = this.plays.get(scene) ?? 0;
    const file = files[n % files.length] ?? baseFile;
    this.plays.set(scene, n + 1);
    this.chosen.set(scene, file);
    return file;
  }

  /**
   * The file chosen at the last `next` for this scene, WITHOUT advancing — for a
   * bed that must be re-resolved (e.g. a live map reload) without counting as a
   * new entry. Falls back to the original before any entry.
   */
  current(scene: string, baseFile: string): string {
    return this.chosen.get(scene) ?? this.candidates(scene, baseFile)[0] ?? baseFile;
  }

  /** Forget all rotation state (dispose / test reset). */
  reset(): void {
    this.plays.clear();
    this.chosen.clear();
  }
}
