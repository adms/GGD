/**
 * The game-server's view of GGD_DEPLOY_TIER (#176).
 *
 * WHY THIS IS A SEPARATE MODULE AND NOT A ROW IN serverOps.ts. The server-ops
 * table is fetched over an UNAUTHENTICATED GET, and its file header names the
 * exact hazard: "the moment a security posture flag (devCheats / whitelistBypass
 * / deployTier) enters this table, an unauthenticated document decides whether
 * cheats are on." The deploy tier is a POSTURE declaration made by the operator
 * at boot, so it is read from the process environment ONCE and never from the
 * network. This module is the seam that keeps that promise while still giving
 * the game server the same vocabulary the platform uses.
 *
 * WHAT THE GAME SERVER DOES WITH IT: nothing that serves bytes — it serves no
 * content. It logs it at boot, and the boot log is the artifact that makes a
 * platform/game/edge disagreement VISIBLE instead of silent. That is the whole
 * job: three processes, one declared tier, three log lines that must agree.
 *
 * The vocabulary itself is packages/shared/src/deployTier.ts, which is also the
 * source of truth the Go platform's drift test parses. There is exactly one
 * table of tier names in this repository.
 */
import {
  type DeployTier,
  normalizeDeployTier,
  servesFullAssets,
  allowsRestrictedContent,
} from "@ggd/shared/deployTier";

export type { DeployTier };

/** Resolve the declared tier from an env bag (defaults to process.env). */
export function resolveDeployTier(env: NodeJS.ProcessEnv = process.env): DeployTier {
  return normalizeDeployTier(env.GGD_DEPLOY_TIER);
}

/** The tier this process was started with, resolved once. */
export const DEPLOY_TIER: DeployTier = resolveDeployTier();

/** True when this deploy promises every asset class to every peer. */
export const FULL_ASSETS: boolean = servesFullAssets(DEPLOY_TIER);

/** True when this deploy may serve copyright-restricted content at all. */
export const RESTRICTED_CONTENT_ALLOWED: boolean = allowsRestrictedContent(DEPLOY_TIER);

/**
 * The one line to print at boot. Kept here (rather than inlined in index.ts) so
 * the wording is testable and so the three services' boot lines stay
 * comparable at a glance when something disagrees.
 */
export function deployTierBootLine(tier: DeployTier = DEPLOY_TIER): string {
  return (
    `[game-server] deployTier=${tier} fullAssets=${servesFullAssets(tier)} ` +
    `restrictedContent=${allowsRestrictedContent(tier)}` +
    (servesFullAssets(tier)
      ? " — FAMILY deploy: the edge must be serving the Blizzard overlay and the client must be built with VITE_GGD_FULL_ASSETS=1"
      : "")
  );
}
