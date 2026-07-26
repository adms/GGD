/**
 * lobbyCombatEnv — the combat-env multiplier table for PRE-MATCH screens
 * (task #258, closing a #125 hole).
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS EXISTS TO NOT SHIP
 * ---------------------------------------------------------------------------
 * #125 says every number a player reads is the POST-multiplier final. The
 * renderer for that rule is `ui/displayFinal.useDisplayEnv()`, which reads
 * `MatchState.combatEnvJson` off the HUD store — i.e. the table the SERVER
 * snapshotted into the running match. In the lobby there is no match:
 * `RoomStore`'s initial `combatEnvJson` is `""`, `parseCombatEnvJson("")`
 * returns the neutral all-1.0 table, and the only two writers
 * (`GameApp.setDisplayEnvJson`) both run inside a match.
 *
 * The table this build actually ships (content/config/combat-env.json) is
 * `cooldown 0.2`, `abilityRange 0.6`, `maxHealth 4.0`, `maxMana 3.0`,
 * `manaRegen 4.0`. So a champion profile rendered in the LOBBY against the
 * neutral table prints 「冷卻 60 秒」 for an ability that is 12 seconds in
 * combat — a 5× lie, printed by the very code #125 added to stop lying.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS RESOLVES, AND IN WHICH ORDER
 * ---------------------------------------------------------------------------
 * Byte-for-byte the game-server's own order (apps/game-server/src/config/
 * combatEnv.ts) so the lobby cannot disagree with the match it launches:
 *
 *   1. CONTENT DEFAULT — the `config.combat-env@1` doc already in the client's
 *      `Configs` registry after bootContent. No fetch: the bundle carried it.
 *   2. ADMIN OVERRIDE — `GET /api/v1/combat-env` (the 戰鬥系統 page's table).
 *      Admin wins per key.
 *
 * FAIL-SAFE, exactly like the server: an unreachable/garbage platform falls
 * back to the content defaults rather than to neutral. Falling back to neutral
 * would resurrect the 5× lie on the one path most likely to be degraded.
 *
 * `ready` is reported so a caller can withhold numbers until the real table is
 * in hand instead of flashing a base value that then changes under the reader.
 */
import { useEffect, useState } from "react";
import { Configs } from "@ggd/shared/content";
import {
  COMBAT_ENV_KEYS,
  DEFAULT_COMBAT_ENV,
  normalizeCombatEnv,
  type CombatEnvKey,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";

/** Public read endpoint (same-origin; dev vite proxies /api → the platform). */
export const COMBAT_ENV_URL = "/api/v1/combat-env";

export type CombatEnvPartial = Partial<Record<CombatEnvKey, number>>;

/**
 * Content defaults out of the registry. Empty before bootContent finishes (the
 * lobby paints first — #170), which is why the hook re-reads on `contentReady`.
 */
export function contentCombatEnv(): CombatEnvPartial {
  const doc = Configs.tryGet("combat-env") as unknown as
    | { schema?: string; multipliers?: unknown }
    | undefined;
  if (!doc || doc.schema !== "config.combat-env@1" || typeof doc.multipliers !== "object") return {};
  return pickKnown(doc.multipliers);
}

/** Keep only known keys with finite numbers — junk from either layer is dropped. */
export function pickKnown(raw: unknown): CombatEnvPartial {
  const out: CombatEnvPartial = {};
  if (typeof raw !== "object" || raw === null) return out;
  const m = raw as Record<string, unknown>;
  for (const k of COMBAT_ENV_KEYS) {
    const v = m[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Parse the platform body (`{ multipliers: {...} }`); null when unusable. */
export function parseAdminCombatEnv(body: unknown): CombatEnvPartial | null {
  if (typeof body !== "object" || body === null) return null;
  const mult = (body as Record<string, unknown>).multipliers;
  if (typeof mult !== "object" || mult === null) return null;
  return pickKnown(mult);
}

/** content defaults + admin override (admin wins per key), normalized. */
export function mergeCombatEnv(
  content: CombatEnvPartial,
  admin: CombatEnvPartial | null,
): CombatEnvMultipliers {
  return normalizeCombatEnv(admin ? { ...content, ...admin } : content);
}

/** Fetch the admin overlay; ANY failure → null (caller keeps content defaults). */
export async function fetchAdminCombatEnv(
  url: string = COMBAT_ENV_URL,
  fetchFn: typeof fetch = (...a: Parameters<typeof fetch>) => fetch(...a),
): Promise<CombatEnvPartial | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    return parseAdminCombatEnv(await res.json());
  } catch {
    return null;
  }
}

/** Process-wide single flight — every lobby panel shares one request. */
let adminPromise: Promise<CombatEnvPartial | null> | null = null;
export function adminCombatEnvOnce(): Promise<CombatEnvPartial | null> {
  adminPromise ??= fetchAdminCombatEnv();
  return adminPromise;
}

/** Test-only: forget the memo. */
export function __resetLobbyCombatEnv(): void {
  adminPromise = null;
}

export interface LobbyCombatEnvState {
  env: CombatEnvMultipliers;
  /** false until the content doc is registered AND the admin fetch has settled */
  ready: boolean;
}

/**
 * React hook: the effective pre-match combat-env table.
 *
 * `contentReady` MUST be passed by the caller (`useContentReady()`): the
 * registry is empty while the lobby shell paints, so reading it once on mount
 * would permanently freeze the neutral table — the same
 * snapshot-instead-of-subscribe trap that left the login marquee blank.
 */
export function useLobbyCombatEnv(contentReady: boolean): LobbyCombatEnvState {
  const [state, setState] = useState<LobbyCombatEnvState>({ env: DEFAULT_COMBAT_ENV, ready: false });
  useEffect(() => {
    if (!contentReady) return;
    let alive = true;
    const content = contentCombatEnv();
    // publish the content defaults immediately — already better than neutral
    setState({ env: mergeCombatEnv(content, null), ready: false });
    void adminCombatEnvOnce().then((admin) => {
      if (alive) setState({ env: mergeCombatEnv(content, admin), ready: true });
    });
    return () => {
      alive = false;
    };
  }, [contentReady]);
  return state;
}
