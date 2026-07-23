/**
 * sec-boot-01: the fail-closed boot guard for PLATFORM_GAME_SHARED_SECRET.
 *
 * The original version of this suite encoded the ORIGINAL polarity: only a
 * literal APP_ENV/NODE_ENV of "production" was refused without a secret, and an
 * unset env was explicitly asserted to pass. #176 inverted that, because
 * docker/compose.yaml sets `NODE_ENV: development` on the game service — the
 * one deploy path the owner runs made this guard INERT. The expectations below
 * changed with the code, deliberately; the two that flipped are called out.
 */
import { describe, it, expect } from "vitest";
import { secretConfigError, isDevelopmentEnv } from "./secretGuard";

/** 64 hex chars — exactly what `make family-secrets` writes. */
const STRONG = "9f3c1a7e0b45d28c6e91f0a3b7d54c8e2f60a91d3c7b58e04f2a6d1c9b30e785";

describe("secretConfigError (sec-boot-01)", () => {
  it("REFUSES production with an empty secret (APP_ENV)", () => {
    expect(secretConfigError("production", undefined, "")).toBeTruthy();
  });

  it("REFUSES production with an empty secret (NODE_ENV fallback)", () => {
    expect(secretConfigError(undefined, "production", "")).toBeTruthy();
  });

  it("is case-insensitive and accepts the 'prod' spelling", () => {
    expect(secretConfigError("Prod", undefined, "")).toBeTruthy();
    expect(secretConfigError("PRODUCTION", undefined, "")).toBeTruthy();
  });

  it("accepts production WITH a strong secret", () => {
    expect(secretConfigError("production", undefined, STRONG)).toBeNull();
  });

  // CHANGED IN #176 (was: "accepts production WITH a secret" / "s3cret").
  // A short or dev-valued secret satisfied the old guard completely, which is
  // how PLATFORM_GAME_SHARED_SECRET=devseam could secure a deploy.
  it("REFUSES a weak or dev-valued secret, in any environment", () => {
    for (const env of ["production", "development", undefined]) {
      expect(secretConfigError(env, undefined, "s3cret")).toContain(
        "PLATFORM_GAME_SHARED_SECRET",
      );
      expect(secretConfigError(env, undefined, "devseam")).toContain("devseam");
    }
  });

  it("names the variable and the generator command in every rejection", () => {
    for (const bad of ["", "devseam", "s3cret", "dev-insecure-seam-secret"]) {
      const err = secretConfigError("production", undefined, bad);
      expect(err).toBeTruthy();
      expect(err!).toContain("PLATFORM_GAME_SHARED_SECRET");
    }
    // the empty case points at the dev escape hatch instead of the generator,
    // because "you forgot to say this is your laptop" is the likelier bug
    expect(secretConfigError("production", undefined, "")).toContain("APP_ENV=development");
    expect(secretConfigError("production", undefined, "devseam")).toContain("make family-secrets");
  });

  it("accepts a DECLARED development env with no secret", () => {
    expect(secretConfigError("development", undefined, "")).toBeNull();
    expect(secretConfigError("dev", undefined, "")).toBeNull();
    expect(secretConfigError(undefined, "test", "")).toBeNull(); // vitest
  });

  // CHANGED IN #176 (was: "accepts … unset env even with no secret"). An unset
  // env is now a DEPLOY. `pnpm --filter @ggd/game-server dev` sets
  // APP_ENV=development in package.json so the developer loop is unaffected.
  it("REFUSES an UNSET env with no secret — unset is a deploy, not a laptop", () => {
    expect(secretConfigError(undefined, undefined, "")).toBeTruthy();
    expect(secretConfigError("", "", "")).toBeTruthy();
    expect(secretConfigError(undefined, undefined, "")).toContain("<unset>");
  });

  it("REFUSES an unrecognised env label with no secret (staging, typos)", () => {
    for (const env of ["staging", "prd", "developement", "produciton"]) {
      expect(secretConfigError(env, undefined, "")).toBeTruthy();
    }
  });

  it("APP_ENV wins over NODE_ENV", () => {
    expect(secretConfigError("development", "production", "")).toBeNull();
  });
});

describe("isDevelopmentEnv", () => {
  it("recognises every way this repo says 'developer machine'", () => {
    for (const env of ["development", "dev", "test", "testing", "local", "DEVELOPMENT", " dev "]) {
      expect(isDevelopmentEnv(env, undefined)).toBe(true);
    }
  });

  it("treats unset, empty and anything else as a deploy", () => {
    for (const env of [undefined, "", "   ", "production", "staging", "familiy"]) {
      expect(isDevelopmentEnv(env, undefined)).toBe(false);
    }
  });
});
