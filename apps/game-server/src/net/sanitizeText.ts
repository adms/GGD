/**
 * Authoritative display-name sanitizer (stored-XSS backstop).
 *
 * handleInternalMatches copied seats[].displayName verbatim into room state, and
 * MatchRoom.onCreate trusts options.seats — an authenticated client (or a bug
 * upstream of the platform username rule) could inject an image/onerror payload
 * into a seat name that any peer renders through the client's innerHTML sink.
 * The platform validates usernames, but the server must never rely on that: this
 * drops HTML-significant + control characters and bounds the length, so a
 * poisoned name can never reach a client as markup. Spaces and ordinary
 * (incl. CJK) characters are preserved so legitimate names survive intact.
 */
export const MAX_DISPLAY_NAME = 32;

// Character codes that must never survive into a rendered display name: the
// HTML-significant set < > & " ' plus backtick (0x60) and backslash (0x5c).
const BLOCKED_CODES: ReadonlySet<number> = new Set<number>([
  0x3c, // <
  0x3e, // >
  0x26, // &
  0x22, // "
  0x27, // '
  0x60, // backtick
  0x5c, // backslash
]);

/** C0 controls (0x00-0x1f) and DEL (0x7f) are always dropped too. */
function isBlockedCode(code: number): boolean {
  if (code <= 0x1f || code === 0x7f) return true;
  return BLOCKED_CODES.has(code);
}

export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code !== undefined && !isBlockedCode(code)) out += ch;
  }
  return out.trim().slice(0, MAX_DISPLAY_NAME);
}
