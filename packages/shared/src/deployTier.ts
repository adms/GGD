/**
 * deployTier — THE ONE vocabulary for the DECLARED serving tier of a deploy.
 *
 * Do not confuse this with `envTier.ts`. They answer different questions and
 * both are needed:
 *
 *   envTier     "who is asking?"        — per REQUEST, from the socket peer
 *                                         (loopback | lan | public).
 *   deployTier  "what is this box FOR?" — per PROCESS, declared once by the
 *                                         operator in GGD_DEPLOY_TIER
 *                                         (public | private | family).
 *
 * The two compose: a byte is served when the deploy tier permits the asset
 * class AND (for the gated tiers) the request tier permits the peer.
 *
 *   public   outward-facing. Copyright-restricted + single-player content is
 *            NOT served, to anyone. THE DEFAULT, including for an unset or
 *            unrecognised value — a deploy that forgets to declare itself
 *            refuses the restricted mounts rather than leaking them (#127).
 *   private  loopback / LAN development and couch play. Restricted content is
 *            served, but only to a loopback or LAN peer: the request-tier gate
 *            still runs, so publishing the same process through a tunnel does
 *            not silently open it.
 *   family   THE FULL-ASSET TIER (#176). Every asset class is served to every
 *            peer, request tier included. This is the owner's private
 *            family-only deploy: he is the copyright holder of the map, the
 *            audience is his household, and a relative joining over a tunnel
 *            must see EXACTLY what he sees on localhost — not 40 of 113
 *            champions replaced by generic stand-ins with no voice.
 *
 * WHY `family` IS A THIRD VALUE AND NOT `private` + A FLAG. The failure this
 * tier exists to prevent is silence: two builds that look identical and are
 * not. A tier name is carried in the boot log, in the nginx include set, in
 * the client bundle and in the boot assertion, so "am I full-asset?" has ONE
 * answer that every layer reads. A boolean bolted onto `private` would have
 * been invisible in exactly the places the mismatch shows up.
 *
 * SOURCE OF TRUTH. `DEPLOY_TIERS` and `DEPLOY_TIER_ALIASES` below are parsed
 * verbatim by apps/platform/internal/config/deploytier_drift_test.go, which
 * asserts the Go table matches them set-for-set and alias-for-alias. That is
 * the same guard shape opsenv/keysync_test.go uses for the server-ops key
 * list, and it exists for the same reason: the combat-env lists drifted for a
 * whole release without anything failing. A tier that resolves to `family` in
 * Go and `public` in TypeScript would ship a server that says "full assets" in
 * its log next to a client that never requests them.
 *
 * Dependency-free on purpose: imported by the client bundle, the game server,
 * and (as text) by a Go test.
 */

/** Every canonical declared tier. Order is cosmetic; the SET is the contract. */
export const DEPLOY_TIERS = ["public", "private", "family"] as const;

/** The declared serving tier of a deploy. */
export type DeployTier = (typeof DEPLOY_TIERS)[number];

/**
 * The fail-safe tier: what an unset, empty or unrecognised GGD_DEPLOY_TIER
 * resolves to. Deny by omission — see the file header.
 */
export const DEFAULT_DEPLOY_TIER: DeployTier = "public";

/**
 * Every accepted spelling of GGD_DEPLOY_TIER, lowercased, mapped to its
 * canonical tier. Anything NOT in this table becomes DEFAULT_DEPLOY_TIER.
 *
 * `loopback` and `lan` are kept because #127 shipped them and .claude/launch.json
 * and existing docs use them. `home` / `household` are accepted for `family`
 * because the owner will type one of them at some point at 2am.
 */
export const DEPLOY_TIER_ALIASES: Record<string, DeployTier> = {
  public: "public",
  prod: "public",
  production: "public",
  internet: "public",
  private: "private",
  loopback: "private",
  lan: "private",
  family: "family",
  home: "family",
  household: "family",
};

/** Resolve a raw GGD_DEPLOY_TIER value to its canonical tier. */
export function normalizeDeployTier(raw: string | undefined | null): DeployTier {
  if (typeof raw !== "string") return DEFAULT_DEPLOY_TIER;
  const key = raw.trim().toLowerCase();
  return DEPLOY_TIER_ALIASES[key] ?? DEFAULT_DEPLOY_TIER;
}

/**
 * Does this tier serve EVERY asset class to EVERY peer — the request-tier gate
 * off, the Blizzard overlay mounted, the imported champion GLBs open?
 *
 * True for `family` only. This is the predicate the nginx tier include, the
 * client build flag (VITE_GGD_FULL_ASSETS) and the edge boot assertion all
 * express; if it is true the overlay MUST be present, which is why the
 * assertion refuses to boot without it.
 */
export function servesFullAssets(tier: DeployTier): boolean {
  return tier === "family";
}

/**
 * May this deploy serve copyright-restricted content AT ALL (to a peer the
 * request-tier gate accepts)? False only for `public`.
 */
export function allowsRestrictedContent(tier: DeployTier): boolean {
  return tier !== "public";
}
