/**
 * Replay viewing tickets.
 *
 * Recordings carry the display names of everyone who played, so on a real
 * deploy a replay is NOT public. The admin console — which is already behind
 * the platform's admin authentication — asks the platform to mint one of these,
 * and only a viewer holding it may open a ReplayRoom. The ticket is bound to a
 * SINGLE recording id and expires quickly, so a link forwarded out of the admin
 * console stops working rather than becoming a permanent public URL.
 *
 * Without a shared secret (a dev box or the owner's LAN), there is nothing to
 * gate: the whole server is the operator's machine, and every other channel
 * here — cheats, direct joins, room creation — is already open in that mode.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Short by design: long enough to click 「觀看回放」, not to share around. */
export const REPLAY_TICKET_TTL_SECS = 300;

/** `${replayId}.${expiresUnix}.${sig}` */
export function mintReplayTicket(
  secret: string,
  replayId: string,
  ttlSecs = REPLAY_TICKET_TTL_SECS,
  nowSecs = Math.floor(Date.now() / 1000),
): string {
  const exp = nowSecs + ttlSecs;
  return `${replayId}.${exp}.${sigFor(secret, replayId, exp)}`;
}

/** True when `ticket` is a live, unexpired ticket for exactly `replayId`. */
export function verifyReplayTicket(
  secret: string,
  ticket: string,
  replayId: string,
  nowSecs = Math.floor(Date.now() / 1000),
): boolean {
  const parts = ticket.split(".");
  if (parts.length !== 3) return false;
  const [id, expStr, sig] = parts as [string, string, string];
  // Bound to ONE recording: a ticket for match A must not open match B.
  if (id !== replayId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < nowSecs) return false;
  const expected = sigFor(secret, id, exp);
  if (expected.length !== sig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

function sigFor(secret: string, replayId: string, exp: number): string {
  return createHmac("sha256", secret).update(`replay:${replayId}:${exp}`).digest("hex").slice(0, 32);
}
