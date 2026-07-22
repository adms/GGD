/**
 * HMAC auth for the Go⇄Colyseus seam. Same scheme both directions:
 *   X-Internal-Timestamp: unix seconds
 *   X-Internal-Auth: hex(HMAC_SHA256(secret, `${ts}.${rawBody}`))
 * 30s skew guard defends replays. Also mints/verifies short-lived seat tickets
 * (defense-in-depth inside Colyseus seat reservations).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SKEW_SECONDS = 30;

export function sign(secret: string, ts: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
}

export function verify(secret: string, ts: string, rawBody: string, auth: string, nowSecs = Math.floor(Date.now() / 1000)): boolean {
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(nowSecs - t) > SKEW_SECONDS) return false;
  const expected = sign(secret, ts, rawBody);
  if (expected.length !== auth.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(auth, "hex"));
  } catch {
    return false;
  }
}

/** Seat ticket: `${accountId}.${expiresUnix}.${sig}` */
export function mintTicket(secret: string, accountId: string, ttlSecs = 120, nowSecs = Math.floor(Date.now() / 1000)): string {
  const exp = nowSecs + ttlSecs;
  const sig = createHmac("sha256", secret).update(`ticket:${accountId}:${exp}`).digest("hex").slice(0, 32);
  return `${accountId}.${exp}.${sig}`;
}

export function verifyTicket(secret: string, ticket: string, nowSecs = Math.floor(Date.now() / 1000)): string | null {
  const parts = ticket.split(".");
  if (parts.length !== 3) return null;
  const [accountId, expStr, sig] = parts as [string, string, string];
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < nowSecs) return null;
  const expected = createHmac("sha256", secret).update(`ticket:${accountId}:${exp}`).digest("hex").slice(0, 32);
  if (expected.length !== sig.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  return accountId;
}
