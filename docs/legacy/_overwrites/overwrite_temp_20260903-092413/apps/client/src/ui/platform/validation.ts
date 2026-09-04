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

/**
 * ⭐⭐ **帳號的輸入端正規化**（GH#952）—— ⛔ 不是「打完才拒絕」。
 *
 * ⛔⛔ 量到的（owner 2026-09-02 附圖）：打 `MR57` 被一行英文紅字擋下來。
 * ⭐ 而**拒絕大寫換不到任何東西**：伺服器的帳號索引本來就把大小寫視為同一個
 * （`account.go` 的 `indexKey()` ⇒ `strings.ToLower`，`reindex.go` / `boot.go` 同樣）
 * ⇒ ⭐⭐ `MR57` 與 `mr57` **在儲存層早就是同一個帳號**
 * ⇒ 在輸入端擋掉大寫**沒有換到唯一性、沒有換到安全性**，⛔ 只換到一次註冊失敗。
 *
 * ⚠️ ⭐ **正則兩邊都不改**（第〇·四守則）：client 的 `USERNAME_RE` 是 server
 * `usernameRe` 的**鏡像**（逐字相同），改一邊就是製造第二個住處。
 * ⇒ ⭐ 這一支只做**正規化**：轉小寫 ＋ 去頭尾空白。
 */
export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  if (hasControlChars(username)) return "帳號不可以包含控制字元";
  if (!USERNAME_RE.test(username)) {
    return "帳號：3–24 字，小寫英數與 _ -，開頭要是英文或數字";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (hasControlChars(email)) return "電子信箱不可以包含控制字元";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "請輸入有效的電子信箱";
  return null;
}

export function validatePassword(password: string): string | null {
  if (hasControlChars(password)) return "密碼不可以包含控制字元";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `密碼長度要 ${PASSWORD_MIN}–${PASSWORD_MAX} 字`;
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
