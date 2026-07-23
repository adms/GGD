/**
 * Room-creation gate (availability / DoS + auth).
 *
 * Legit matches are ALWAYS minted server-side by the HMAC-authed
 * /_internal/matches handler (matchMaker.createRoom); a client never has a
 * legitimate reason to create a "match" room. But `gameServer.define("match")`
 * lets any WS client reaching the matchmaker call create()/joinOrCreate("match"),
 * and Colyseus runs onCreate FULLY (12-seat sim + ~60 Hz loop) BEFORE onAuth can
 * reject the join — so a create-flood spins up ticking zombie sims.
 *
 * The /_internal path injects a short-lived, HMAC-signed create-token into the
 * createRoom options; MatchRoom.onCreate verifies it (when a shared secret is
 * configured, i.e. prod) and throws to abort creation before any sim state is
 * built when it is absent/forged. A client cannot forge the token without the
 * secret. Token format: `${expiresUnix}.${sig}` where
 * sig = HMAC_SHA256(secret, `create:${expiresUnix}`)[:32].
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 30;

export function mintCreateToken(
  secret: string,
  ttlSecs: number = TOKEN_TTL_SECONDS,
  nowSecs: number = Math.floor(Date.now() / 1000),
): string {
  const exp = nowSecs + ttlSecs;
  const sig = createHmac("sha256", secret).update(`create:${exp}`).digest("hex").slice(0, 32);
  return `${exp}.${sig}`;
}

export function verifyCreateToken(
  secret: string,
  token: unknown,
  nowSecs: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < nowSecs) return false;
  const expected = createHmac("sha256", secret).update(`create:${exp}`).digest("hex").slice(0, 32);
  if (expected.length !== sig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
