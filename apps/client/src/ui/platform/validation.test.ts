/**
 * webui-01 (webui-auth-validation): client-side auth form validation mirrors
 * the backend rules (^[a-z0-9][a-z0-9_-]{2,23}$, email shape, password 8-128,
 * control chars rejected) so bad input never reaches the wire.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  validateUsername,
  validateEmail,
  validatePassword,
  validateRegistration,
  hasControlChars,
} from "./validation";

describe("auth form validation (webui-01)", () => {
  it("accepts backend-valid usernames", () => {
    cover("webui-auth-validation");
    for (const u of ["abc", "a12", "0start", "under_score", "dash-name", "x".repeat(24)]) {
      expect(validateUsername(u), u).toBeNull();
    }
  });

  it("rejects usernames the backend would reject", () => {
    cover("webui-auth-validation");
    for (const u of ["ab", "", "Upper", "_lead", "-lead", "has space", "x".repeat(25), "émile", "semi;colon"]) {
      expect(validateUsername(u), JSON.stringify(u)).not.toBeNull();
    }
  });

  it("mirrors the backend email regex ^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$ and 254 cap", () => {
    cover("webui-auth-validation");
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateEmail("user+tag@sub.example.com")).toBeNull();
    for (const e of ["", "nope", "a@b", "a b@c.d", "a@@b.c", "@b.c", `${"x".repeat(250)}@b.co`]) {
      expect(validateEmail(e), JSON.stringify(e)).not.toBeNull();
    }
  });

  it("enforces password 8-128 chars", () => {
    cover("webui-auth-validation");
    expect(validatePassword("12345678")).toBeNull();
    expect(validatePassword("1234567")).not.toBeNull();
    expect(validatePassword("x".repeat(128))).toBeNull();
    expect(validatePassword("x".repeat(129))).not.toBeNull();
  });

  it("rejects control characters in any field (matches Go hasControl)", () => {
    cover("webui-auth-validation");
    expect(hasControlChars("ok")).toBe(false);
    expect(hasControlChars("bad\u0000")).toBe(true);
    expect(hasControlChars("bad\u007f")).toBe(true);
    expect(validateUsername("ab\tc")).not.toBeNull();
    expect(validatePassword("password\n1")).not.toBeNull();
    expect(validateEmail("a\u0001@b.co")).not.toBeNull();
  });

  it("validateRegistration aggregates per-field errors and trims", () => {
    cover("webui-auth-validation");
    expect(validateRegistration("  gooduser  ", " a@b.co ", "longenough")).toEqual({});
    const errs = validateRegistration("NO", "bad", "short");
    expect(errs.username).toBeTruthy();
    expect(errs.email).toBeTruthy();
    expect(errs.password).toBeTruthy();
  });
});
