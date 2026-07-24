/**
 * The credential-field identity policy for the auth screen (task #185).
 *
 * WHY THIS IS A MODULE AND NOT FIVE INLINE STRINGS. The owner's report was
 * 「為何我 chrome 儲存登入密碼 結果下次沒幫我帶入」— Chrome offered to save, he
 * accepted, and the next visit's boxes were empty. The two halves of a password
 * manager are NOT the same feature:
 *
 *   SAVE  fires on a loose heuristic — a type=password field plus a submit-ish
 *         action is enough. It worked here with no form, no names, no hints.
 *   FILL  needs to IDENTIFY which box is the username and which is the password,
 *         and to re-match the saved record to this screen. With no `name`, no
 *         `id` and no `autocomplete` there is nothing to bind to, so it silently
 *         does nothing.
 *
 * That asymmetry is what made the bug invisible: the save prompt appearing is
 * NOT evidence that fill works, and dev shows no error either way. Anyone who
 * deletes these attributes will break every password manager on the family
 * deploy without a single visible symptom.
 *
 * It also lives here, apart from AuthScreen.tsx, so the login/register asymmetry
 * can be unit-tested without rendering the Babylon-backed login screen — the
 * same reason firstOwner.ts exists.
 */

export type AuthMode = "login" | "register";

/**
 * The password box's hint, which MUST differ per mode:
 *   login    → "current-password": offer the saved password. Also suppresses the
 *              password generator, which has no business on a sign-in screen.
 *   register → "new-password": offer to generate/save a new one, and stop Chrome
 *              trying to fill an existing password into a fresh account.
 * Backwards, Chrome pops the generator on sign-in and refuses to fill on it.
 */
export function passwordAutoComplete(mode: AuthMode): string {
  return mode === "register" ? "new-password" : "current-password";
}

/**
 * The username box's hint. There is no "new-username" token in the spec —
 * `username` is correct for registration too, and using the SAME token in both
 * modes is what lets the record saved at registration be re-matched at sign-in.
 */
export const USERNAME_AUTOCOMPLETE = "username";

/** Register-only email box. */
export const EMAIL_AUTOCOMPLETE = "email";

/**
 * The invite code (#174) and the first-owner token (#180) are deliberately
 * "off", NOT "one-time-code".
 *
 * "one-time-code" is for a code DELIVERED TO THIS DEVICE (SMS/authenticator) and
 * makes Chrome/iOS offer their OTP suggestion UI, which will never have anything
 * to suggest — these codes are read off a chat message or the host's console.
 * Worse, it keeps the field classified as credential-adjacent, and that is
 * exactly the failure mode being fixed: in register mode the invite box is the
 * text input immediately BEFORE the password, so with no hints at all Chrome's
 * heuristic picks IT as the username and saves {GGD-XXXX-XXXX, password}. The
 * next visit's sign-in screen is a different shape, the record does not match,
 * and nothing fills. "off" plus a distinct `name` is what breaks that.
 */
export const CODE_AUTOCOMPLETE = "off";
