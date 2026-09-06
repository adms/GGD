import type { IncomingMessage, ServerResponse } from "node:http";
import { matchMaker } from "colyseus";
import { verifyCommunityRoomManifest, zCommunityContentRequest, type CommunityContentRequest } from "@ggd/shared/content/communityRoom";
import { verify } from "../auth/hmac";
import { readPublishedHeroPackage } from "./communityRuntime";
import { verifyReplayTicket } from "../replay/access";
import { loadReplay, safeRecordingId } from "../replay/store";

/** The platform authenticates the caller; the owning room authorizes membership.
 * RPC resolves the room on its actual shard, without moving its registries.
 */
export async function handleCommunityContent(req: IncomingMessage, res: ServerResponse, raw: string, secret: string): Promise<void> {
  const send = (status: number, data: unknown) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "private, no-store" }); res.end(JSON.stringify(data)); };
  if (!secret || !verify(secret, String(req.headers["x-internal-timestamp"] ?? ""), raw, String(req.headers["x-internal-auth"] ?? ""))) { send(401, { error: { code: "unauthorized", message: "bad hmac" } }); return; }
  let input: CommunityContentRequest;
  try { input = zCommunityContentRequest.parse(JSON.parse(raw)); }
  catch { send(400, { error: { code: "bad-request", message: "房間內容請求不合法。" } }); return; }
  try {
    let manifest;
    if ("replayId" in input) {
      if (!verifyReplayTicket(secret, input.ticket, input.replayId)) { send(403, { error: { code: "replay-ticket-invalid", message: "回放觀看憑證無效或已過期，請從後台重新開啟。" } }); return; }
      const loaded = await loadReplay(safeRecordingId(input.replayId));
      manifest = loaded.header.communityContent ? verifyCommunityRoomManifest(loaded.header.communityContent) : null;
      if (!input.workId) { send(200, { communityContent: manifest }); return; }
      if (!manifest) { send(404, { error: { code: "replay-content-missing", message: "此回放未使用社群英雄。" } }); return; }
    } else {
      const rooms = (await matchMaker.query({ name: "match" })).filter((room) => room.metadata?.matchId === input.matchId);
      if (rooms.length !== 1) { send(404, { error: { code: "community-room-unavailable", message: "對局已結束或房間內容不在此伺服器。" } }); return; }
      const args = input.readyDigest === undefined ? [input.accountId] : [input.accountId, input.readyDigest];
      manifest = verifyCommunityRoomManifest(await matchMaker.remoteRoomCall(rooms[0]!.roomId, "communityContentAccess", args));
      if (!input.workId) { send(200, manifest); return; }
    }
    const pin = manifest.heroes.find((hero) => hero.workId === input.workId);
    if (!pin) { send(404, { error: { code: "community-hero-unavailable", message: "這份英雄不在房間固定版本中。" } }); return; }
    const bytes = await readPublishedHeroPackage(pin);
    res.writeHead(200, { "content-type": "application/zip", "content-length": bytes.length, "cache-control": "private, no-store", "x-content-type-options": "nosniff" }); res.end(bytes);
  } catch (error) { send(409, { error: { code: "community-content-unavailable", message: error instanceof Error ? error.message : "無法取得固定房間內容。" } }); }
}
