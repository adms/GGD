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
 * WHAT CHANGED IN #176, AND WHY IT HAD TO. The first version of this guard only
 * fired when APP_ENV/NODE_ENV was LITERALLY "production". That is the wrong
 * polarity, and docker/compose.yaml proved it: it sets `NODE_ENV: development`
 * on the game service, so on the one deploy path the owner actually runs, this
 * guard was INERT. A compose deploy with no env file booted a game server that
 * trusted every join. The polarity is now inverted:
 *
 *   the environment must PROVE it is development to be allowed to fail open.
 *
 * Unset, empty, "staging", "prod", a typo — all of them are treated as a real
 * deploy and require a real secret. The two costs of that inversion are paid
 * explicitly rather than papered over:
 *   - apps/game-server/package.json's `dev` script now sets APP_ENV=development,
 *     so `pnpm --filter @ggd/game-server dev` (what every .claude/launch.json
 *     entry invokes) keeps working exactly as before;
 *   - vitest sets NODE_ENV=test, which is a development marker here.
 *
 * SECOND CHANGE: a PRESENT secret is now checked for STRENGTH, in every
 * environment. `PLATFORM_GAME_SHARED_SECRET=devseam` used to satisfy this guard
 * completely — it is non-empty, so a deploy booted "secured" by a value written
 * down in .claude/launch.json and in this repository's git history. The rules
 * live in packages/shared/src/deploySecrets.ts and are mirrored by
 * apps/platform/internal/config, so the platform and the game server cannot
 * disagree about which values are acceptable (a Go drift test enforces that) —
 * which matters because they hold the SAME secret and a rule enforced on only
 * one of them leaves the other booting fail-open on its own.
 *
 * This predicate returns a human-readable reason when the process must refuse to
 * boot, or null when the config is acceptable. Pure (env passed in) so it
 * unit-tests without spawning a process; index.ts calls it and process.exit(1)s.
 */
import { secretStrengthError } from "@ggd/shared/deploySecrets";

/**
 * Environment labels that are ALLOWED to run without a shared secret. This is
 * the complete set of ways to say "this is a developer's machine"; anything
 * else — including unset — is treated as a deploy.
 */
const DEVELOPMENT_ENVS = new Set(["development", "develop", "dev", "test", "testing", "local"]);

/** True when the environment has explicitly identified itself as development. */
export function isDevelopmentEnv(appEnv: string | undefined, nodeEnv: string | undefined): boolean {
  const env = (appEnv ?? nodeEnv ?? "").trim().toLowerCase();
  return DEVELOPMENT_ENVS.has(env);
}

export function secretConfigError(
  appEnv: string | undefined,
  nodeEnv: string | undefined,
  secret: string,
): string | null {
  const value = (secret ?? "").trim();

  if (value === "") {
    if (isDevelopmentEnv(appEnv, nodeEnv)) return null; // declared dev — dev mode
    const label = (appEnv ?? nodeEnv ?? "").trim();
    return (
      `PLATFORM_GAME_SHARED_SECRET is required (APP_ENV/NODE_ENV=${label === "" ? "<unset>" : label}). ` +
      "Refusing to boot fail-open: without it, joins are unauthenticated, the " +
      "client-supplied accountId is trusted as identity, and dev cheats are enabled. " +
      "If this really is a developer machine, say so: APP_ENV=development."
    );
  }

  // A secret IS set. It must be a real one — in EVERY environment, because a
  // dev value that reaches a deploy is the exact failure this guards against,
  // and nothing about the env label makes `devseam` safe.
  return secretStrengthError("PLATFORM_GAME_SHARED_SECRET", value);
}
