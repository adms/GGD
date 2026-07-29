/**
 * audio/sfxPreloadPolicy — WHEN the per-scene SFX sets are warmed, and how far
 * ahead (task #63, second half).
 *
 * ---------------------------------------------------------------------------
 * WHAT THE FIRST HALF LEFT UNDONE
 * ---------------------------------------------------------------------------
 * `sfxManifest` already answers "which clips does each scene need", and
 * `AudioSystem.preloadSceneSfx` warms that set ON SCENE ENTRY. Measured against
 * the shipped `content/config/audio-map.json`, the combat scene is 46 events →
 * 56 files → 2,747,294 B. Warming those AT the combat edge means the heaviest
 * bucket in the game starts fetching at the exact instant the round starts —
 * i.e. `roundStart` / the first `basicAttack` can still land on a cold buffer.
 * That is failure form ② dressed up as a fix: the bytes are scheduled, just not
 * in time to be heard.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE OF THE FIX
 * ---------------------------------------------------------------------------
 * A scene warms ITS OWN set first and then, breadth-first, the sets of the
 * scenes that can follow it, `lookahead` hops deep. With the shipped
 * `lookahead: 1` the combat bucket is warmed on the INTERMISSION edge — the
 * shop window, tens of seconds before the first swing — while the login screen
 * still warms nothing heavier than `lobby` (0 B), because combat is three hops
 * from `menu` and the lookahead never reaches it. Both halves of the task hold
 * at once: boot stays empty, and the scene you are about to enter is already
 * warm.
 *
 * ---------------------------------------------------------------------------
 * ADJUSTABLE, NOT HARDCODED (守則一)
 * ---------------------------------------------------------------------------
 * `enabled` and `lookahead` — and, if the flow ever changes, the successor
 * graph itself — are read at boot from `content/audio-manifests/sfx-preload.json`,
 * which is LIVE bind-mounted in the deployed container. Retuning how much the
 * client warms ahead is a file edit, not a rebuild. The values below are the
 * fallback the client uses when that doc is missing, malformed, or 404s, and
 * they are deliberately the SAME numbers the doc ships with.
 *
 * `lookahead` is clamped on BOTH ends ({@link MAX_LOOKAHEAD}): a mistyped 10 is
 * a request to warm the entire catalogue on the login screen, which is the
 * original defect, so the ceiling is part of the guard, not a nicety (#277).
 *
 * NOTE the manifest's own event lists stay in code (`sfxManifest.ts`): they are
 * checked against the shipped audio map by `sfxManifest.test.ts`, so a typo
 * there is caught at test time instead of silently warming nothing. Only the
 * POLICY is data.
 */
import type { AudioScene } from "./types";
import { AUDIO_SCENES } from "./types";

/** Content-relative path of the live-editable policy doc. */
export const SFX_PRELOAD_POLICY_PATH = "audio-manifests/sfx-preload.json";

/** Schema tag the policy doc must carry to be accepted. */
export const SFX_PRELOAD_SCHEMA = "audio.sfx-preload@1";

/**
 * Ceiling on `lookahead`. Four hops is the whole graph (menu → lobby → room →
 * champSelect → intermission), so anything above it can only mean "warm
 * everything from anywhere" — the exact boot cost #63 exists to remove.
 */
export const MAX_LOOKAHEAD = 4;

export interface SfxPreloadPolicy {
  /** Master switch. false = warm NOTHING up front; every cue lazy-loads on first play. */
  enabled: boolean;
  /** How many scenes ahead to warm. 0 = current scene only. Clamped to [0, MAX_LOOKAHEAD]. */
  lookahead: number;
  /** Per-scene successor overrides, merged over {@link SCENE_SUCCESSORS}. */
  successors: Readonly<Partial<Record<AudioScene, readonly AudioScene[]>>>;
}

/**
 * Which scenes can follow each scene, i.e. what "the next scene" means.
 *
 * DERIVED, not guessed. The in-match half mirrors the server's phase machine
 * (`apps/game-server/src/match/PhaseMachine.ts`: champSelect → [intermission →
 * combat → resolution]* → matchEnd) pushed through `scene.ts`'s
 * `sceneForMatch`, which maps resolution → `settlement` and matchEnd →
 * `victory`/`defeat`, and splits late combat into `fireRing`. The pre-match half
 * mirrors `sceneForPlatform` (auth → `menu`, lobby → `lobby`, in a room →
 * `room`) plus the login rotation's `menu` ↔ `menuNocturne` alternation.
 * `sfxPreloadPolicy.test.ts` re-derives the in-match edges through
 * `sceneForMatch` itself, so a change to the scene rule that this table misses
 * turns the test red rather than silently mis-warming.
 *
 * `settlement` lists BOTH continuations (another round, or the match ending),
 * because from inside resolution the client does not yet know which it is.
 */
export const SCENE_SUCCESSORS: Readonly<Record<AudioScene, readonly AudioScene[]>> = {
  // login screen: the two themes alternate, and the only way out is the lobby
  menu: ["menuNocturne", "lobby"],
  menuNocturne: ["menu", "lobby"],
  lobby: ["room"],
  room: ["champSelect"],
  champSelect: ["intermission"],
  // the shop window — this is the edge that warms the 2.7 MB combat bucket
  intermission: ["combat"],
  // the battleStart sting rides the intermission→combat edge
  battleStart: ["combat"],
  combat: ["fireRing", "settlement"],
  fireRing: ["settlement"],
  settlement: ["intermission", "victory", "defeat"],
  // the match is over; the player is on their way back to the lobby
  victory: ["lobby"],
  defeat: ["lobby"],
};

/**
 * Shipped fallback. Mirrors `content/audio-manifests/sfx-preload.json` — keep
 * the two in step (`sfxPreloadPolicy.test.ts` reads the real file and asserts
 * they agree, so a drift is a red test, not a surprise in production).
 */
export const DEFAULT_SFX_PRELOAD_POLICY: SfxPreloadPolicy = {
  enabled: true,
  lookahead: 1,
  successors: {},
};

function isAudioScene(v: unknown): v is AudioScene {
  return typeof v === "string" && (AUDIO_SCENES as readonly string[]).includes(v);
}

/** Keep only real scene names; drop duplicates and anything unknown. */
function cleanSceneList(raw: unknown): readonly AudioScene[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AudioScene[] = [];
  for (const v of raw) {
    if (isAudioScene(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Normalise anything — a parsed doc, a partial patch, garbage — into a usable
 * policy. Never throws: a broken doc degrades to the shipped defaults, because
 * the failure mode of a bad preload policy must be "loads like before", never
 * "no audio".
 */
export function clampSfxPreloadPolicy(raw: unknown): SfxPreloadPolicy {
  const o = (raw ?? {}) as Partial<Record<keyof SfxPreloadPolicy, unknown>>;
  const enabled = typeof o.enabled === "boolean" ? o.enabled : DEFAULT_SFX_PRELOAD_POLICY.enabled;
  const rawLook = typeof o.lookahead === "number" && Number.isFinite(o.lookahead) ? o.lookahead : DEFAULT_SFX_PRELOAD_POLICY.lookahead;
  const lookahead = Math.min(MAX_LOOKAHEAD, Math.max(0, Math.floor(rawLook)));
  const successors: Partial<Record<AudioScene, readonly AudioScene[]>> = {};
  const rawSucc = o.successors;
  if (rawSucc && typeof rawSucc === "object" && !Array.isArray(rawSucc)) {
    for (const [key, value] of Object.entries(rawSucc as Record<string, unknown>)) {
      if (!isAudioScene(key)) continue;
      const list = cleanSceneList(value);
      if (list) successors[key] = list;
    }
  }
  return { enabled, lookahead, successors };
}

/** Accept a `audio.sfx-preload@1` doc; null for anything else (→ defaults). */
export function sfxPreloadPolicyFromDoc(doc: unknown): SfxPreloadPolicy | null {
  const d = doc as { schema?: unknown } | null | undefined;
  if (!d || typeof d !== "object" || d.schema !== SFX_PRELOAD_SCHEMA) return null;
  return clampSfxPreloadPolicy(d);
}

/** The successors of `scene`, with any policy override taking precedence. */
export function successorsOf(scene: AudioScene, policy: SfxPreloadPolicy): readonly AudioScene[] {
  return policy.successors[scene] ?? SCENE_SUCCESSORS[scene] ?? [];
}

/**
 * The scenes to warm on entering `scene`, IN PRIORITY ORDER: `scene` itself
 * first, then its successors breadth-first, `lookahead` hops deep, deduped.
 *
 * Order is load-bearing, not cosmetic — the caller issues the fetches in this
 * order, so on a slow link the scene the player is actually in never queues
 * behind the one they might enter next.
 *
 * Returns `[]` for a disabled policy, which is what makes the "要不要預載"
 * switch a real switch: nothing is requested up front and every cue falls back
 * to the lazy fetch inside `playSfx`.
 */
export function scenesToWarm(
  scene: AudioScene | null | undefined,
  policy: SfxPreloadPolicy = DEFAULT_SFX_PRELOAD_POLICY,
): readonly AudioScene[] {
  if (!scene || !policy.enabled) return [];
  const out: AudioScene[] = [scene];
  const seen = new Set<AudioScene>([scene]);
  let frontier: readonly AudioScene[] = [scene];
  for (let depth = 0; depth < policy.lookahead; depth++) {
    const next: AudioScene[] = [];
    for (const s of frontier) {
      for (const succ of successorsOf(s, policy)) {
        if (seen.has(succ)) continue;
        seen.add(succ);
        next.push(succ);
        out.push(succ);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return out;
}
