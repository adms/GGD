/**
 * First-owner (站長) registration copy + argument logic (T0 / #180).
 *
 * A brand-new gated deploy has no administrator and no invite code can exist
 * yet, so the very first registration claims ownership by presenting the
 * one-time token the platform prints to its boot log and writes to
 * DATA_DIR/owner-setup-token. The register screen learns it is in this state
 * from GET /auth/bootstrap-state (never from a probe of the invite gate), and
 * switches into a VISIBLY DIFFERENT mode: a distinct title + help + a token
 * field, instead of the invite field that tells everyone else to ask an admin.
 *
 * The copy and the "which field flows where" decision live here — not inline in
 * AuthScreen — so they can be unit-tested without rendering the Babylon-backed
 * screen (same pattern as admin's recovery.ts). AuthScreen imports these.
 */

/** Title shown above the register form when this deploy still needs its owner. */
export const OWNER_SETUP_TITLE = "首位管理員設定";

/**
 * The first-owner explanation. Deliberately NOT "ask an admin" — on a fresh
 * deploy the person reading this IS the admin-to-be, and the token is proof of
 * host access they can read off their own machine.
 */
export const OWNER_SETUP_HELP =
  "這是全新部署 — 你將成為第一位管理員。請貼上主機上 DATA_DIR/owner-setup-token 的開通碼（或啟動日誌裡的 ownerToken）。";

/** Label/placeholder for the owner-token field (sent as bootstrapToken). */
export const OWNER_TOKEN_LABEL = "主機 owner 開通碼（在主機 DATA_DIR/owner-setup-token）";

/** The normal gated-deploy invite help — the family/non-first case. */
export const INVITE_HELP = "內測期間需要邀請碼才能註冊，請向管理員索取。";

/**
 * Shown under the "Play offline vs bots" button. Honest on every deploy: offline
 * direct-join is a local-test path, and a real (secured) host refuses
 * client-initiated match creation by design (game-server MatchRoom.ts) — there
 * you play through login → lobby. Prevents the raw
 * "match creation is restricted to the platform reservation flow" error the
 * owner hit from ever being the only explanation.
 */
export const OFFLINE_PLATFORM_NOTE = "單機對戰僅供本機測試；正式主機請由登入 → 大廳開始遊戲。";

/**
 * The friendly replacement for the game-server's raw restriction error. When an
 * offline join fails because the host only accepts platform-reserved matches,
 * this is shown instead of the technical string.
 */
export const OFFLINE_RESTRICTED_MESSAGE = "正式主機請由登入 → 大廳開始遊戲（單機對戰僅供本機測試）。";

/** Matches the game-server's restriction error (MatchRoom.ts onCreate). */
export function isPlatformRestrictedError(message: string): boolean {
  return /restricted to the platform reservation flow/i.test(message);
}

export interface RegisterArgs {
  /** the #174 invite code (family / non-first case) */
  inviteCode: string;
  /** the first-owner one-time token (站長 case) */
  bootstrapToken: string;
}

/**
 * Map the single typed code to the right register argument. In first-owner mode
 * the typed value is the owner token (bootstrapToken); otherwise it is the
 * invite code. Exactly one is ever non-empty, so the owner-token path can never
 * double as a second invite door for a stranger, and a family registration
 * never accidentally attempts an owner claim.
 */
export function registerArgs(firstOwner: boolean, code: string): RegisterArgs {
  const trimmed = code.trim();
  return firstOwner
    ? { inviteCode: "", bootstrapToken: trimmed }
    : { inviteCode: trimmed, bootstrapToken: "" };
}
