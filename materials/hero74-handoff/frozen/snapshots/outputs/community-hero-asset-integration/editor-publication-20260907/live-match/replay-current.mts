/** Replays a real recording through the shipping admin API and viewer socket.
 * Loopback-only, disposable accounts; no browser or visual approval is implied.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {gunzipSync} from "node:zlib";
import { verifyCommunityRoomManifest, buildCommunityRoomContent, captureCommunityContentBase } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/communityRoom";
import { ContentLoader } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/loader";
import { FsContentSource } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/node/FsContentSource";
import { OverlayContentSource } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/overlay";
import { registerAll } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/registries";
import { registerSkeletonContent } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/sim/content/skeleton";

if (process.env.GGD_LOCAL_COMMUNITY_PROOF !== "disposable-local-only" || !process.env.GGD_LOCAL_PROOF_PASSWORD || !process.env.GGD_LOCAL_PROOF_RECORDING) throw new Error("Explicit local proof opt-in, disposable password and recording receipt are required.");
const source = JSON.parse(readFileSync(process.env.GGD_LOCAL_PROOF_RECORDING, "utf8"));
assert.equal(source.schema, "ggd-community-socket-proof@1");
assert(source.matchId && source.roomContent?.digest);
const root = process.cwd();
const requireClient = createRequire(resolve(root, "apps/client/package.json"));
const { Client } = requireClient("colyseus.js") as typeof import("/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/apps/client/node_modules/colyseus.js");
const output = process.env.GGD_LOCAL_PROOF_REPORT ?? "/private/tmp/ggd-community-replay-proof.json";
const platformPort = Number(process.env.GGD_LOCAL_PROOF_PLATFORM_PORT ?? 8084);
const gamePort = Number(process.env.GGD_LOCAL_PROOF_GAME_PORT ?? 2574);
for (const port of [platformPort, gamePort]) assert(Number.isInteger(port) && port > 0 && port < 65536);
const proof: Record<string, any> = { schema: "ggd-community-replay-proof@1", matchId: source.matchId, recordedDigest: source.roomContent.digest, status: "running", startedAt: new Date().toISOString(), limits: "Actual HTTP and replay socket; no browser, visual or complete-match settlement acceptance." };
const save = () => writeFileSync(output, JSON.stringify(proof, null, 2) + "\n");
async function request(path: string, token?: string, body?: unknown) {
  const started=performance.now();
  const res = await fetch(`http://127.0.0.1:${platformPort}/api/v1` + path, { method: body === undefined ? "GET" : "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  (proof.requests??=[]).push({path,status:res.status,milliseconds:Math.round(performance.now()-started)});save();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res;
}
async function until(read: () => boolean, label: string) {
  const deadline = Date.now() + 45000;
  while (!read()) { if (Date.now() > deadline) throw new Error(`Timed out: ${label}`); await new Promise((resolve) => setTimeout(resolve, 100)); }
}
let room: any;
try {
  const actor = await (await request("/auth/login", undefined, { username: "model-reviewer", password: process.env.GGD_LOCAL_PROOF_PASSWORD })).json() as any;
  const token = actor.tokens.accessToken;
  const detail = await (await request(`/admin/replays/${source.matchId}`, token)).json() as any;
  proof.compatibility = { compatible: detail.compatible, refusal: detail.refusal, truncated: detail.truncated };
  assert.equal(detail.compatible, true, JSON.stringify(detail.refusal));
  assert.equal(verifyCommunityRoomManifest(detail.header.communityContent).digest, source.roomContent.digest);
  const access = await (await request(`/admin/replays/${source.matchId}/ticket`, token, {})).json() as any;
  const metadata = await (await request(`/replay-content/${source.matchId}`, undefined, { ticket: access.ticket })).json() as any;
  const manifest = verifyCommunityRoomManifest(metadata.communityContent);
  const currentOverlay = await (await request("/content-overlay/bundle")).json();
  const loaded = await new ContentLoader(new OverlayContentSource(new FsContentSource(resolve(root, "content")), currentOverlay)).load({ policy: "fail-closed" });
  assert.equal(loaded.manifest.contentVersion, source.target.contentVersion, "replay proof requires the recorded merged content version");
  registerAll(loaded.store); registerSkeletonContent();
  const archives = new Map<string, Uint8Array>();
  for (const pin of manifest.heroes) archives.set(pin.workId, new Uint8Array(await (await request(`/replay-content/${source.matchId}/heroes/${pin.workId}`, undefined, { ticket: access.ticket })).arrayBuffer()));
  const verified = buildCommunityRoomContent({ base: captureCommunityContentBase(loaded.store), target: source.target, pins: manifest.heroes, archives, expected: manifest });
  assert.equal(verified.manifest.digest, source.roomContent.digest);
  const refused: unknown[] = [], diverged: unknown[] = [], statuses: any[] = [];
  const reservationStart=performance.now();
  const reservationResponse=await fetch(`http://127.0.0.1:${gamePort}/matchmake/create/replay`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({replayId:source.matchId,ticket:access.ticket}),signal:AbortSignal.timeout(90000)});
  proof.replayReservation={status:reservationResponse.status,milliseconds:Math.round(performance.now()-reservationStart),transport:'Native fetch over the same public matchmaking route; Node SDK HTTP agent socket timeout attempt retained separately.'};save();
  assert.equal(reservationResponse.status,200);const reservation=await reservationResponse.json();assert(!reservation.error,JSON.stringify(reservation));
  room=await new Client(`ws://127.0.0.1:${gamePort}`).consumeSeatReservation<any>(reservation);
  room.onMessage("replayRefused", (value: unknown) => refused.push(value));
  room.onMessage("replayDiverged", (value: unknown) => diverged.push(value));
  room.onMessage("replayStatus", (value: unknown) => statuses.push(value));
  room.onMessage("*", () => {});
  proof.refusals = refused; proof.divergences = diverged;
  await until(() => room.state.matchId === source.matchId || refused.length > 0, "replay snapshot");
  assert.deepEqual(refused, []);
  assert.equal(verifyCommunityRoomManifest(JSON.parse(room.state.communityContentJson)).digest, source.roomContent.digest);
  room.send("replayControl", { action: "pause" });
  await until(() => statuses.length > 0, "replay position");
  const lastTick = statuses.at(-1).lastTick;
  const lines=gunzipSync(readFileSync(`/private/tmp/ggd-community37-live-match/replays/${source.matchId}.jsonl.gz`)).toString().trim().split('\n').map(line=>JSON.parse(line));
  const footer=lines.at(-1);assert.equal(footer.t,'footer');assert.equal(footer.faultCount,0);
  const checkpoints=lines.filter(line=>line.t==='g');assert.equal(checkpoints.reduce((n,line)=>n+line.w.length,0),footer.finalTick+1);
  assert.equal(lastTick,footer.finalTick,'Replay must cover every recorded world and host checkpoint');
  proof.recordedEnd={footer,checkpointCount:footer.finalTick+1,lastCheckpointTick:lastTick,lateClientStateTick:source.recordedThroughTick,limits:'The live room continues idle ticks while the platform acknowledges settlement; the sealed footer is the recorded endpoint.'};
  const endTick=footer.finalTick+1;
  room.send("replayControl", { action: "seekTick", tick: endTick });
  await until(() => statuses.some((status) => status.tick >= endTick && !status.seeking) || diverged.length > 0, "replay checked through recorded end");
  assert.deepEqual(diverged, []);
  // Transport status is sent immediately; the regular state patch has its own
  // cadence. Wait for the actual replay projection before reading its seats.
  await until(() => room.state.tick >= endTick, "replay state patch at the recorded end");
  proof.lastStatus = statuses.at(-1);assert.equal(room.state.phase,"matchEnd");assert.equal(room.state.tick,endTick);
  proof.selectedSeats = [...room.state.seats.values()].filter((seat: any) => source.selectedSeats.some((original: any) => original.accountId === seat.accountId)).map((seat: any) => ({ accountId: seat.accountId, championId: seat.championId }));
  assert.deepEqual(proof.selectedSeats, source.selectedSeats);
  proof.status = "passed"; proof.finishedAt = new Date().toISOString();
  console.log(`Fixed replay ${source.matchId}: ${lastTick} ticks checked, digest ${manifest.digest}`);
} catch (error) {
  proof.status = "failed"; proof.error = error instanceof Error ? error.stack : String(error); process.exitCode = 1; console.error(proof.error);
} finally { save(); await room?.leave().catch(() => {}); console.log(`Evidence: ${output}`); }
