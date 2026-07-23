/**
 * The private replay API — `/_internal/replays…`, HMAC-signed exactly like
 * `/_internal/matches`.
 *
 * WHY IT IS NOT A PUBLIC ROUTE. A recording carries the display name of everyone
 * who played, which is precisely the data the owner's family playtest generates.
 * So the listing lives on the same channel the platform already uses server-to-
 * server: not proxied by the public edge, restricted by NetworkPolicy in K8s,
 * and reachable from the admin console only through the platform's
 * admin-authenticated proxy. The one thing a browser touches directly is the
 * ReplayRoom websocket, and that requires a short-lived, single-recording ticket
 * minted here.
 *
 *   GET  /_internal/replays              -> { replays: ReplaySummary[] }
 *   GET  /_internal/replays/:id          -> { summary, header, compatible, refusal? }
 *   POST /_internal/replays/:id/ticket   -> { ticket, endpoint, replayId, expiresIn }
 *
 * In DEV (no shared secret) the HMAC cannot be checked and the routes are open —
 * the same posture every other channel takes on a box with no secret configured,
 * where the operator is the only user.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { verify } from "../auth/hmac";
import { mintReplayTicket, REPLAY_TICKET_TTL_SECS } from "./access";
import { checkCompatibility, currentIdentity } from "./Player";
import { listReplays, loadReplay, safeRecordingId, summarise } from "./store";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function handleInternalReplays(
  req: IncomingMessage,
  res: ServerResponse,
  rawBody: string,
  sharedSecret: string,
): Promise<void> {
  if (sharedSecret) {
    const ts = String(req.headers["x-internal-timestamp"] ?? "");
    const auth = String(req.headers["x-internal-auth"] ?? "");
    if (!verify(sharedSecret, ts, rawBody, auth)) {
      json(res, 401, { error: { code: "unauthorized", message: "bad hmac" } });
      return;
    }
  }

  const url = new URL(req.url ?? "/", "http://internal");
  const rest = url.pathname.replace(/^\/_internal\/replays\/?/, "");

  if (rest === "" && req.method === "GET") {
    json(res, 200, { replays: await listReplays(), identity: currentIdentity() });
    return;
  }

  const ticketMatch = /^([^/]+)\/ticket$/.exec(rest);
  if (ticketMatch && req.method === "POST") {
    const id = safeRecordingId(decodeURIComponent(ticketMatch[1]!));
    try {
      await loadReplay(id); // 404 rather than handing out a ticket for nothing
    } catch {
      json(res, 404, { error: { code: "not-found", message: "no such recording" } });
      return;
    }
    json(res, 200, {
      replayId: id,
      // Empty in dev: the ReplayRoom only enforces a ticket when a secret is set.
      ticket: sharedSecret ? mintReplayTicket(sharedSecret, id) : "",
      expiresInSecs: REPLAY_TICKET_TTL_SECS,
    });
    return;
  }

  if (rest !== "" && req.method === "GET") {
    const id = safeRecordingId(decodeURIComponent(rest));
    let loaded;
    try {
      loaded = await loadReplay(id);
    } catch {
      json(res, 404, { error: { code: "not-found", message: "no such recording" } });
      return;
    }
    // The admin list shows compatibility BEFORE the owner clicks play, so a
    // recording that cannot be replayed on this build says so in the list
    // instead of opening a viewer that immediately refuses.
    const refusal = checkCompatibility(loaded.header);
    json(res, 200, {
      summary: summarise(id, loaded.bytes, loaded.lines),
      header: loaded.header,
      truncated: loaded.truncated,
      compatible: refusal === null,
      refusal,
      identity: currentIdentity(),
    });
    return;
  }

  json(res, 404, { error: { code: "not-found", message: "unknown replay route" } });
}
