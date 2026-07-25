/**
 * webui-change-password (#211): the 修改密碼 self-service form validates
 * confirm-match and the platform's password shape, posts the right payload to
 * the injected caller, surfaces a clear success (including "other sessions were
 * signed out"), and collapses every server failure to a GENERIC message — the
 * client must not become the wrong-old-password oracle the API refuses to be.
 *
 * Every password here is a throwaway literal invented for the assertion using
 * it; nothing in this file names a real account or credential.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CHANGE_PASSWORD_FAILED,
  CHANGE_PASSWORD_RATE_LIMITED,
  CHANGE_PASSWORD_SUCCESS,
  PASSWORD_MAX,
  PASSWORD_MIN,
  submitChangePassword,
  validateChangePassword,
  validatePasswordShape,
  type ChangePasswordInput,
} from "./changePassword";

const form = (over: Partial<ChangePasswordInput> = {}): ChangePasswordInput => ({
  currentPassword: "throwaway-current-0",
  newPassword: "throwaway-replacement-1",
  confirmPassword: "throwaway-replacement-1",
  ...over,
});

describe("change password form (webui-change-password)", () => {
  it("requires the current password — a session alone is not enough", () => {
    cover("webui-change-password");
    const r = validateChangePassword(form({ currentPassword: "" }));
    expect(r.ok).toBe(false);
  });

  it("rejects a confirm that does not match the new password", () => {
    cover("webui-change-password");
    const r = validateChangePassword(form({ confirmPassword: "throwaway-replacement-2" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("不一致");
  });

  it("mirrors the platform password shape rules (length + control chars)", () => {
    cover("webui-change-password");
    expect(validatePasswordShape("a".repeat(PASSWORD_MIN - 1)).ok).toBe(false);
    expect(validatePasswordShape("a".repeat(PASSWORD_MAX + 1)).ok).toBe(false);
    expect(validatePasswordShape("").ok).toBe(false);
    // a C0 control char (NUL) and DEL are both rejected, mirroring the server
    expect(validatePasswordShape("has" + String.fromCharCode(0) + "a-control-char").ok).toBe(false);
    expect(validatePasswordShape("has" + String.fromCharCode(0x7f) + "a-del-char").ok).toBe(false);
    expect(validatePasswordShape("a".repeat(PASSWORD_MIN)).ok).toBe(true);
    expect(validatePasswordShape("a".repeat(PASSWORD_MAX)).ok).toBe(true);
  });

  it("rejects a new password identical to the current one", () => {
    cover("webui-change-password");
    const same = "throwaway-unchanged-3";
    const r = validateChangePassword({ currentPassword: same, newPassword: same, confirmPassword: same });
    expect(r.ok).toBe(false);
  });

  it("accepts a well-formed form", () => {
    cover("webui-change-password");
    expect(validateChangePassword(form())).toEqual({ ok: true });
  });

  it("posts currentPassword + newPassword and surfaces the success message", async () => {
    cover("webui-change-password");
    const calls: Array<[string, string]> = [];
    const outcome = await submitChangePassword(form(), async (current, next) => {
      calls.push([current, next]);
      return { sessionsRevoked: true };
    });

    expect(calls).toEqual([["throwaway-current-0", "throwaway-replacement-1"]]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.message).toBe(CHANGE_PASSWORD_SUCCESS);
      expect(outcome.sessionsRevoked).toBe(true);
      // the player is told their other devices were signed out
      expect(outcome.message).toContain("其他裝置");
      expect(outcome.message.toLowerCase()).toContain("other sessions");
    }
  });

  it("never calls the API when the form is invalid", async () => {
    cover("webui-change-password");
    let called = false;
    const outcome = await submitChangePassword(form({ confirmPassword: "mismatch-4" }), async () => {
      called = true;
      return {};
    });
    expect(called).toBe(false);
    expect(outcome.ok).toBe(false);
  });

  it("renders a GENERIC error for a rejected current password (no oracle)", async () => {
    cover("webui-change-password");
    const unauthorized = await submitChangePassword(form(), async () => {
      throw Object.assign(new Error("invalid credentials"), { status: 401 });
    });
    const serverError = await submitChangePassword(form(), async () => {
      throw Object.assign(new Error("internal server error"), { status: 500 });
    });
    const thrownString = await submitChangePassword(form(), async () => {
      throw new Error("network down");
    });

    expect(unauthorized).toEqual({ ok: false, error: CHANGE_PASSWORD_FAILED });
    // a wrong password and any other server failure are indistinguishable
    expect(serverError).toEqual(unauthorized);
    expect(thrownString).toEqual(unauthorized);
    // and the raw server text never reaches the player
    expect(CHANGE_PASSWORD_FAILED).not.toContain("invalid credentials");
  });

  it("tells the player to wait when the platform throttles the attempt", async () => {
    cover("webui-change-password");
    const outcome = await submitChangePassword(form(), async () => {
      throw Object.assign(new Error("too many password change attempts"), { status: 429 });
    });
    expect(outcome).toEqual({ ok: false, error: CHANGE_PASSWORD_RATE_LIMITED });
  });
});
