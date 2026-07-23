/**
 * sec-boot-01: the fail-closed boot guard for PLATFORM_GAME_SHARED_SECRET.
 * Production with an empty secret must be refused (the server would otherwise
 * boot fail-open: unauthenticated joins, spoofable identity, cheats on). Dev
 * and any properly-configured prod pass.
 */
import { describe, it, expect } from "vitest";
import { secretConfigError } from "./secretGuard";

describe("secretConfigError (sec-boot-01)", () => {
  it("REFUSES production with an empty secret (APP_ENV)", () => {
    expect(secretConfigError("production", undefined, "")).toBeTruthy();
  });

  it("REFUSES production with an empty secret (NODE_ENV fallback)", () => {
    expect(secretConfigError(undefined, "production", "")).toBeTruthy();
  });

  it("accepts 'prod' spelling and is case-insensitive", () => {
    expect(secretConfigError("Prod", undefined, "")).toBeTruthy();
    expect(secretConfigError("PRODUCTION", undefined, "")).toBeTruthy();
  });

  it("accepts production WITH a secret", () => {
    expect(secretConfigError("production", undefined, "s3cret")).toBeNull();
  });

  it("accepts development / unset env even with no secret", () => {
    expect(secretConfigError("development", undefined, "")).toBeNull();
    expect(secretConfigError(undefined, undefined, "")).toBeNull();
    expect(secretConfigError("", "", "")).toBeNull();
  });

  it("APP_ENV wins over NODE_ENV", () => {
    // explicitly-development APP_ENV should not be overridden by NODE_ENV
    expect(secretConfigError("development", "production", "")).toBeNull();
  });
});
