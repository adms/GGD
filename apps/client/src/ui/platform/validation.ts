/**
 * Client-side auth form validation — mirrors the backend rules exactly
 * (apps/platform/internal/auth/service.go ValidateRegistration) so users get
 * instant feedback; the server remains authoritative.
 */

export const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,23}$/;

/** Same shape as the Go `emailRe`: local@domain.tld, no spaces/extra @. */
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Rejects ASCII control characters (incl. DEL), matching hasControl in Go. */
export function hasControlChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

export function validateUsername(username: string): string | null {
  if (hasControlChars(username)) return "control characters are not allowed";
  if (!USERNAME_RE.test(username)) {
    return "3-24 chars: lowercase letters, digits, _ or -; must start with a letter or digit";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (hasControlChars(email)) return "control characters are not allowed";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "enter a valid email address";
  return null;
}

export function validatePassword(password: string): string | null {
  if (hasControlChars(password)) return "control characters are not allowed";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`;
  }
  return null;
}

export interface RegisterErrors {
  username?: string;
  email?: string;
  password?: string;
}

/** Validate the whole register form; empty object = valid. */
export function validateRegistration(username: string, email: string, password: string): RegisterErrors {
  const out: RegisterErrors = {};
  const u = validateUsername(username.trim());
  if (u) out.username = u;
  const e = validateEmail(email.trim());
  if (e) out.email = e;
  const p = validatePassword(password);
  if (p) out.password = p;
  return out;
}
