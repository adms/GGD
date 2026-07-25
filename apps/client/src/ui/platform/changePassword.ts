/**
 * 修改密碼 · self-service change-password — pure form logic (#211).
 *
 * The client posts `POST /api/v1/account/password` (the #172 route) with the
 * CURRENT password alongside the session token: the platform refuses to change
 * a password from a session alone, precisely so a stolen token cannot lock a
 * player out of their own account. On success the server revokes every refresh
 * token of the account and hands back a fresh pair (api.changePassword swaps it
 * in), so every OTHER device is signed out while THIS one stays in.
 *
 * The shape rules below MIRROR the platform's one password policy
 * (auth.ValidatePassword in apps/platform/internal/auth/service.go). They are a
 * courtesy — the server re-validates with the same rules and is authoritative —
 * so this file must never grow a rule the server does not have.
 *
 * Everything here is side-effect-free so it unit-tests without React or the
 * network; ChangePasswordDialog.tsx wires it to the real API.
 */

/** Mirrors auth.ValidatePassword: 8–128 characters, no control characters. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Raw form fields, straight off the three inputs. */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type ValidateResult = { ok: true } | { ok: false; error: string };

export type ChangePasswordOutcome =
  | { ok: true; message: string; sessionsRevoked: boolean }
  | { ok: false; error: string };

/** What the server returns; only the revocation flag matters to this module. */
export interface ChangePasswordResult {
  sessionsRevoked?: boolean;
}

export const CHANGE_PASSWORD_SUCCESS =
  "密碼已修改，其他裝置的登入已全部登出 · Password changed. All other sessions were signed out.";

/**
 * ONE generic message for every server-side failure. A wrong current password
 * and an expired session are deliberately indistinguishable here, matching the
 * platform's single 401 surface — the client must not become the oracle the API
 * refuses to be.
 */
export const CHANGE_PASSWORD_FAILED =
  "修改失敗，請確認目前密碼後再試一次 · Could not change the password. Check your current password and try again.";

export const CHANGE_PASSWORD_RATE_LIMITED =
  "嘗試次數過多，請稍候再試 · Too many attempts. Please wait a moment and try again.";

/**
 * The platform's password shape rules, mirrored (see the file header). The
 * control-character check is a char-code scan rather than a regexp so the source
 * stays pure ASCII: bytes 0x00–0x1F and 0x7F are the C0 controls + DEL that
 * auth.ValidatePassword rejects.
 */
export function validatePasswordShape(password: string): ValidateResult {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return {
      ok: false,
      error: `密碼長度需為 ${PASSWORD_MIN}–${PASSWORD_MAX} 字元 · password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
    };
  }
  for (let i = 0; i < password.length; i++) {
    const code = password.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return { ok: false, error: "密碼不可包含控制字元 · control characters are not allowed" };
    }
  }
  return { ok: true };
}

/** Validate the whole form: current present, new valid, confirm matching. */
export function validateChangePassword(input: ChangePasswordInput): ValidateResult {
  if (input.currentPassword === "") {
    return { ok: false, error: "請輸入目前密碼 · current password is required" };
  }
  const shape = validatePasswordShape(input.newPassword);
  if (!shape.ok) return shape;
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: "兩次輸入的新密碼不一致 · the new passwords do not match" };
  }
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: "新密碼不可與目前密碼相同 · the new password must differ from the current one" };
  }
  return { ok: true };
}

/** Read an HTTP status off a thrown error without importing the API client. */
function statusOf(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "status" in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === "number") return s;
  }
  return null;
}

/**
 * Validate, then POST through the injected caller. The API is never called for
 * invalid input, and every server failure collapses to a generic message (the
 * 429 throttle is the one exception — telling the player to wait is useful and
 * leaks nothing).
 */
export async function submitChangePassword(
  input: ChangePasswordInput,
  change: (currentPassword: string, newPassword: string) => Promise<ChangePasswordResult>,
): Promise<ChangePasswordOutcome> {
  const valid = validateChangePassword(input);
  if (!valid.ok) return { ok: false, error: valid.error };
  try {
    const result = await change(input.currentPassword, input.newPassword);
    return {
      ok: true,
      message: CHANGE_PASSWORD_SUCCESS,
      sessionsRevoked: result?.sessionsRevoked !== false,
    };
  } catch (err) {
    if (statusOf(err) === 429) return { ok: false, error: CHANGE_PASSWORD_RATE_LIMITED };
    return { ok: false, error: CHANGE_PASSWORD_FAILED };
  }
}
