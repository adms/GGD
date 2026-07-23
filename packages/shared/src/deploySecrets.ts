/**
 * deploySecrets — THE ONE table of "values that must never be a deployed
 * process's secret", plus the strength rules around it. Task #176(C).
 *
 * MIRRORED IN GO. apps/platform/internal/config/config.go carries the same
 * denylist, the same prefix families and the same two numeric floors, and
 * apps/platform/internal/config/deploysecrets_drift_test.go parses THIS FILE
 * and fails if they diverge. Two languages, one rule: a secret that the Go
 * platform refuses must also be refused by the Node game server, or the deploy
 * boots half-hardened and the weak half is the one nobody looks at.
 *
 * THE REQUIREMENT THIS IMPLEMENTS: "no dev default can ever be reached by a
 * deployed process, and a weak or dev-valued secret must FAIL AT BOOT with a
 * message naming the variable."
 *
 * WHY A DENYLIST AT ALL, GIVEN THE LENGTH FLOOR. `devsecret` is 9 characters
 * and would fail the floor anyway. The denylist exists for the ERROR MESSAGE:
 * "JWT_SIGNING_SECRET is the known DEVELOPMENT value \"devsecret\"" tells the
 * operator he is running with his laptop's env file, which is a completely
 * different bug from "your secret is too short". The prefix families
 * (`dev-insecure-*`, `replace-me-*`) additionally catch dev values that ARE
 * long enough — `dev-insecure-redis-password` is 27 characters and
 * `replace-me-with-openssl-rand-hex-32` is 35, which clears the floor.
 *
 * KEEPING IT HONEST: if you add a dev value to .claude/launch.json,
 * deploy/helm/ggd/values-local.yaml or docker/.env.example, add it here.
 */

/** The shortest accepted secret on a networked deploy. */
export const MIN_SECRET_LEN = 32;

/**
 * The fewest distinct characters an accepted secret may contain. Rejects
 * long-but-degenerate values ("aaaa…", "abababab…") that clear the length
 * floor while carrying almost no entropy. Any hex string clears it (16
 * symbols); any real passphrase clears it easily.
 */
export const MIN_SECRET_DISTINCT = 12;

/** The one command an operator is pointed at, in every rejection message. */
export const SECRET_GEN_COMMAND = "make family-secrets";

/**
 * Every literal development / placeholder secret that exists in this repo or
 * its docs, plus the usual suspects. Compared lowercased and EXACT.
 */
export const DEV_SECRET_DENYLIST = [
  "devsecret", // .claude/launch.json (platform)
  "devseam", // .claude/launch.json (game seam)
  "dev-insecure-jwt-secret", // deploy/helm/ggd/values-local.yaml
  "dev-insecure-seam-secret", // deploy/helm/ggd/values-local.yaml
  "dev-insecure-redis-password", // deploy/helm/ggd/values-local.yaml
  "replace-me-with-openssl-rand-hex-32", // docker/.env.example placeholder
  "test-secret",
  "testsecret",
  "test",
  "changeme",
  "change-me",
  "password",
  "passwd",
  "secret",
  "admin",
  "ggd",
  "ggd-secret",
  "local",
  "localdev",
  "insecure",
] as const;

/**
 * The FAMILIES the denylist enumerates one by one, so a `dev-insecure-<new>`
 * invented tomorrow is rejected the day it is invented, not the day someone
 * remembers to list it. Compared lowercased, as a prefix.
 */
export const DEV_SECRET_PREFIXES = [
  "dev-insecure",
  "replace-me",
  "devsecret",
  "devseam",
  "changeme",
] as const;

/**
 * Return a human-readable, ACTIONABLE reason `value` is unacceptable as the
 * production secret named `name`, or null when it is acceptable.
 *
 * Every message names the variable AND the generator command, because the
 * failure mode being guarded against is an operator at 1am reaching for the
 * shortest thing that makes the error go away.
 */
export function secretStrengthError(name: string, value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  if (v === "") {
    return `${name} is required and unset — refusing to boot a networked deploy without it. Generate one: ${SECRET_GEN_COMMAND}`;
  }
  const low = v.toLowerCase();
  if ((DEV_SECRET_DENYLIST as readonly string[]).includes(low)) {
    return `${name} is the known DEVELOPMENT value "${v}" — refusing to boot. A deployed process must never read a dev default. Generate a real one: ${SECRET_GEN_COMMAND}`;
  }
  for (const pfx of DEV_SECRET_PREFIXES) {
    if (low.startsWith(pfx)) {
      return `${name} starts with the development/placeholder marker "${pfx}" — refusing to boot. Generate a real one: ${SECRET_GEN_COMMAND}`;
    }
  }
  const runes = [...v];
  if (runes.length < MIN_SECRET_LEN) {
    return `${name} is only ${runes.length} characters — a networked deploy requires at least ${MIN_SECRET_LEN}. Generate one: ${SECRET_GEN_COMMAND}`;
  }
  const distinct = new Set(runes).size;
  if (distinct < MIN_SECRET_DISTINCT) {
    return `${name} is long but uses only ${distinct} distinct characters — that is a repeated pattern, not a secret. Generate one: ${SECRET_GEN_COMMAND}`;
  }
  return null;
}
