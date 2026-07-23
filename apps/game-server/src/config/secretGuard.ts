/**
 * Fail-closed boot guard for PLATFORM_GAME_SHARED_SECRET.
 *
 * The platform got a fail-closed secret check (#126: refuse to boot on an empty
 * secret). The game-server had no equivalent: an empty shared secret is silently
 * treated as DEV MODE — onAuth returns true for every join, onJoin accepts a
 * client-supplied accountId as identity, and cheats turn on. A production deploy
 * that forgets the secret would boot happily and serve unauthenticated,
 * identity-spoofable, cheat-enabled matches.
 *
 * This predicate returns a human-readable reason when the process must refuse to
 * boot, or null when the config is acceptable. Pure (env passed in) so it
 * unit-tests without spawning a process; index.ts calls it and process.exit(1)s.
 */
export function secretConfigError(
  appEnv: string | undefined,
  nodeEnv: string | undefined,
  secret: string,
): string | null {
  const env = (appEnv ?? nodeEnv ?? "").trim().toLowerCase();
  const isProduction = env === "production" || env === "prod";
  if (isProduction && !secret) {
    return (
      "PLATFORM_GAME_SHARED_SECRET is required when APP_ENV/NODE_ENV=production. " +
      "Refusing to boot fail-open: without it, joins are unauthenticated, the " +
      "client-supplied accountId is trusted as identity, and dev cheats are enabled."
    );
  }
  return null;
}
