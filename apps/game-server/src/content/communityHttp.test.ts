import { beforeEach, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { matchMaker } from "colyseus";
import { sign } from "../auth/hmac";
import { mintReplayTicket } from "../replay/access";
import { loadReplay } from "../replay/store";
import { communityManifestDigest, verifyCommunityRoomManifest } from "@ggd/shared/content/communityRoom";
import { handleCommunityContent } from "./communityHttp";
import { readPublishedHeroPackage } from "./communityRuntime";

vi.mock("colyseus", () => ({ matchMaker: { query: vi.fn(), remoteRoomCall: vi.fn() } }));
vi.mock("../replay/store", () => ({ loadReplay: vi.fn(), safeRecordingId: (value: string) => value }));
vi.mock("./communityRuntime", () => ({ readPublishedHeroPackage: vi.fn() }));
const secret = "test-community-secret";
const hash = `sha256:${"a".repeat(64)}`;
const identity = { schema: "ggd-community-room@1" as const, baseContentDigest: hash, target: { contentVersion: "cv", gameRevision: "rev", migrationFingerprint: "migration", processorFingerprint: "processor" }, heroes: [{ workId: "hero", submissionId: "submission", authorId: "author", authorName: "作者", name: "英雄", packageDigest: hash, snapshotDigest: hash }], assets: [] };
const manifest = verifyCommunityRoomManifest({ ...identity, digest: communityManifestDigest(identity) });
async function request(input: unknown, authenticated = true) {
  const raw = JSON.stringify(input), ts = String(Math.floor(Date.now() / 1000));
  let status = 0, body: unknown;
  const req = { headers: { "x-internal-timestamp": ts, "x-internal-auth": authenticated ? sign(secret, ts, raw) : "bad" } } as unknown as IncomingMessage;
  const res = { writeHead(code: number) { status = code; }, end(value: unknown) { body = value; } } as unknown as ServerResponse;
  await handleCommunityContent(req, res, raw, secret);
  return { status, body };
}
beforeEach(() => {
  vi.mocked(matchMaker.query).mockReset().mockResolvedValue([{ roomId: "owning-process", metadata: { matchId: "game" } }] as never);
  vi.mocked(matchMaker.remoteRoomCall).mockReset().mockImplementation(async (_room, _method, args) => {
    if (args?.[0] !== "member") throw new Error("只有本場玩家");
    if (args.length > 1 && args[1] !== manifest.digest) throw new Error("內容不同");
    return manifest;
  });
  vi.mocked(readPublishedHeroPackage).mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  vi.mocked(loadReplay).mockReset().mockResolvedValue({ header: { communityContent: manifest } } as never);
});
it("requires the signed platform channel, owning-room membership and the exact ready digest", async () => {
  expect((await request({ matchId: "game", accountId: "member" }, false)).status).toBe(401);
  expect((await request({ matchId: "game", accountId: "stranger" })).status).toBe(409);
  expect((await request({ matchId: "other", accountId: "member" })).status).toBe(404);
  expect((await request({ matchId: "game", accountId: "member", readyDigest: hash })).status).toBe(409);
  expect((await request({ matchId: "game", accountId: "member", readyDigest: manifest.digest })).status).toBe(200);
  expect((await request({ matchId: "game", accountId: "member" })).status).toBe(200);
  expect(vi.mocked(matchMaker.remoteRoomCall).mock.calls.at(-1)?.[2]).toEqual(["member"]);
  expect((await request({ matchId: "game", accountId: "member", workId: "foreign-hero" })).status).toBe(404);
  expect(readPublishedHeroPackage).not.toHaveBeenCalled();
});
it("requires a live ticket for exactly the recorded game and downloads its recorded pin", async () => {
  const ticket = mintReplayTicket(secret, "recording");
  expect((await request({ replayId: "other", ticket })).status).toBe(403);
  expect((await request({ replayId: "recording", ticket: mintReplayTicket(secret, "recording", -1) })).status).toBe(403);
  expect(loadReplay).not.toHaveBeenCalled();
  expect((await request({ replayId: "recording", ticket })).status).toBe(200);
  expect((await request({ replayId: "recording", ticket, workId: "hero" })).status).toBe(200);
  expect(readPublishedHeroPackage).toHaveBeenCalledWith(manifest.heroes[0]);
  expect(matchMaker.query).not.toHaveBeenCalled();
});
