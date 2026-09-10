/** Explicit opt-in, loopback-only integration against disposable local services.
 * Exercises public author/reviewer APIs and the shipping game socket protocol.
 * It is not browser, visual, balance, production, or desktop acceptance.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { readTargetProfileFacts } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/apps/editor/src/export-center/exportPolicy";
import { ContentLoader } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/loader";
import { FsContentSource } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/node/FsContentSource";
import { OverlayContentSource } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/overlay";
import { registerAll } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/registries";
import { registerSkeletonContent } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/sim/content/skeleton";
import { buildCommunityRoomContent, captureCommunityContentBase, verifyCommunityRoomManifest } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/content/communityRoom";
import { unpackEventBatch, type EventMessage } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/protocol/messages";
import { Abilities, Champions } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/sim/content/registry";
import { withRegistryContext } from "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/packages/shared/src/sim/content/registryContext";

if (process.env.GGD_LOCAL_COMMUNITY_PROOF !== "disposable-local-only") throw new Error("Set GGD_LOCAL_COMMUNITY_PROOF=disposable-local-only to run against the isolated test platform.");
const password = process.env.GGD_LOCAL_PROOF_PASSWORD;
if (!password) throw new Error("GGD_LOCAL_PROOF_PASSWORD is required for the two disposable test accounts.");
const root = process.cwd();
const requireClient = createRequire(resolve(root, "apps/client/package.json"));
const { Client } = requireClient("colyseus.js") as typeof import("/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/apps/client/node_modules/colyseus.js");
const platformPort = Number(process.env.GGD_LOCAL_PROOF_PLATFORM_PORT ?? 8084);
assert(Number.isInteger(platformPort) && platformPort > 0 && platformPort < 65536);
const platform = `http://127.0.0.1:${platformPort}/api/v1`;
const runId = `community37-current-${Date.now()}`;
const audit = JSON.parse(readFileSync('/private/tmp/ggd-community37-generator-rebuild/current-publication-audit.json','utf8'));
assert.equal(audit.heroCount,37);
const publications = audit.rows.map((r: any) => ({workId:r.workId,submissionId:r.currentSubmissionId,packageDigest:r.packageDigest,snapshotDigest:r.snapshotDigest,name:r.name}));
const projects = [publications[0],publications[16]].map((p:any)=>({projectId:p.workId,name:p.name}));
const fullMatch = process.env.GGD_LOCAL_PROOF_FULL_MATCH === "1";
const proof: Record<string, unknown> = { schema: "ggd-community-socket-proof@1", runId, platform, startedAt: new Date().toISOString(), status: "running", limits: "HTTP and game socket proof only; no browser or visual acceptance." };
const report = resolve(process.env.GGD_LOCAL_PROOF_REPORT ?? `/private/tmp/${runId}.json`);
const save = () => writeFileSync(report, JSON.stringify(proof, null, 2) + "\n");
const log = (step: string, value?: unknown) => { console.log(step, value ?? ""); proof.lastStep = step; save(); };
async function response(path: string, token: string | null = null, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(platform + path, { method: body === undefined ? "GET" : "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": body instanceof Uint8Array ? "application/zip" : "application/json" }), ...headers }, body: body === undefined ? undefined : body instanceof Uint8Array ? Uint8Array.from(body) : JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res;
}
const json = async (path: string, token: string | null = null, body?: unknown, headers?: Record<string, string>): Promise<any> => (await response(path, token, body, headers)).json();
type Actor = { account: { id: string }; tokens: { accessToken: string } };
const lobbySockets: WebSocket[] = [];
const rooms: Array<{ leave(): Promise<number> }> = [];
async function lobby(actor: Actor) {
  const socket = new WebSocket(`ws://127.0.0.1:${platformPort}/api/v1/lobby/ws?token=${encodeURIComponent(actor.tokens.accessToken)}`);
  lobbySockets.push(socket);
  const messages: any[] = [];
  socket.addEventListener("message", (event) => { messages.push(JSON.parse(String(event.data))); });
  await new Promise<void>((ok, fail) => { socket.addEventListener("open", () => { socket.send(JSON.stringify({ type: "heartbeat" })); ok(); }, { once: true }); socket.addEventListener("error", () => fail(new Error("lobby connection failed")), { once: true }); });
  return messages;
}
async function until<T>(read: () => T | undefined | false, label: string, seconds = 40): Promise<T> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) { const value = read(); if (value !== undefined && value !== false) return value; await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error(`Timed out: ${label}`);
}

try {
  const author: Actor = await json("/auth/login", null, { username: "model-author", password });
  const reviewer: Actor = await json("/auth/login", null, { username: "model-reviewer", password });
  const at = author.tokens.accessToken, rt = reviewer.tokens.accessToken;
  const economicState = async (token: string) => {
    const me = await json("/me", token);
    const account = me.account ?? me;
    assert.equal(typeof account.id, "string");
    for (const key of ["mmr", "games", "wins"]) assert.equal(typeof account[key], "number", `account ${key} must be measured`);
    const wallet = await json("/wallet", token);
    for (const key of ["mcoin", "crystal"]) assert.equal(typeof wallet[key], "number", `wallet ${key} must be measured`);
    return { account: Object.fromEntries(["id", "mmr", "games", "wins"].map((key) => [key, account[key]])),
      wallet, ranking: await json("/ranking/player/me", token) };
  };
  const beforeEconomy = fullMatch ? await Promise.all([economicState(at), economicState(rt)]) : null;
  const facts = readTargetProfileFacts(await json("/hero-import/target-profile", at));
  assert(facts.gameRevision && facts.contentVersion && facts.migrationFingerprint && facts.authoringProcessorFingerprint);
  const target = { gameRevision: facts.gameRevision, contentVersion: facts.contentVersion, migrationFingerprint: facts.migrationFingerprint, processorFingerprint: facts.authoringProcessorFingerprint };
  proof.target = target;
  proof.publications = publications;
  const authorMessages = await lobby(author), reviewerMessages = await lobby(reviewer);
  const previous=JSON.parse(readFileSync('/private/tmp/ggd-community37-live-match/current-match-attempt-2.json','utf8'));
  await json(`/rooms/${previous.platformRoomId}/leave`,rt,{}).catch(()=>{});await json(`/rooms/${previous.platformRoomId}/leave`,at,{}).catch(()=>{});
  const created = await json("/rooms", at, { name: "37英雄正式名單驗收", mapId: "arena.castle", champSelectSec: 30, intermissionSec: 5,
    ...(fullMatch ? { combatMaxSec: 110, maxRounds: 1 } : {}),
    });
  const roomId = created.room.id; proof.platformRoomId = roomId;
  await json(`/rooms/${roomId}/join`, rt, {});
  await json(`/rooms/${roomId}/ready`, rt, { ready: true });
  const start = await json(`/rooms/${roomId}/start`, at, {}); proof.matchId = start.matchId; log("room created", start.matchId);
  const readyA = await until(() => authorMessages.find((message) => message.type === "match_ready" && message.matchId === start.matchId), "author seat push");
  const readyB = await until(() => reviewerMessages.find((message) => message.type === "match_ready" && message.matchId === start.matchId), "reviewer seat push");
  const manifest = verifyCommunityRoomManifest(readyA.communityContent); assert.equal(manifest.heroes.length,37);for(const expected of publications){const actual=manifest.heroes.find(p=>p.workId===expected.workId);assert(actual);for(const key of ['submissionId','packageDigest','snapshotDigest'])assert.equal(actual[key],expected[key]);}
 assert.equal(verifyCommunityRoomManifest(readyB.communityContent).digest, manifest.digest);
  const loaded = await new ContentLoader(new OverlayContentSource(new FsContentSource(resolve(root, "content")), await json("/content-overlay/bundle"))).load({ policy: "fail-closed" });
  assert.equal(loaded.manifest.contentVersion, target.contentVersion, "client proof and published package must use the same merged content");
  proof.loadedContentVersion = loaded.manifest.contentVersion;
  registerAll(loaded.store); registerSkeletonContent();
  const base = captureCommunityContentBase(loaded.store);
  const archives = new Map<string, Uint8Array>();
  for (const pin of manifest.heroes) archives.set(pin.workId, new Uint8Array(await (await response(`/community-matches/${start.matchId}/heroes/${pin.workId}`, at)).arrayBuffer()));
  const content = buildCommunityRoomContent({ base, target, pins: manifest.heroes, archives, expected: manifest });
  proof.roomContent = { digest: content.manifest.digest, heroes: content.manifest.heroes, assets: content.manifest.assets.length };
  const ackA = await json(`/community-matches/${start.matchId}/ready`, at, { digest: manifest.digest });
  assert.equal(ackA.digest, manifest.digest);
  let gameA = await new Client(readyA.endpoint).consumeSeatReservation<any>(JSON.parse(readyA.seatToken)); rooms.push(gameA);
  const events: EventMessage[] = [];
  const rejects: unknown[] = [];
  proof.networkEvents = events; proof.rejections = rejects;
  gameA.onMessage("event", (event) => events.push(event));
  gameA.onMessage("evbatch", (batch) => events.push(...unpackEventBatch(batch)));
  gameA.onMessage("reject", (rejection) => rejects.push(rejection));
  gameA.onMessage("*", () => {});
  await until(() => gameA.state.matchId === start.matchId, "first state");
  const before = gameA.state.tick;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(gameA.state.tick, before, "selection clock must wait for the second player's content");
  await json(`/community-matches/${start.matchId}/ready`, rt, { digest: manifest.digest });
  const gameB = await new Client(readyB.endpoint).consumeSeatReservation<any>(JSON.parse(readyB.seatToken)); rooms.push(gameB);
  gameB.onMessage("*", () => {});
  await until(() => gameB.state.matchId === start.matchId, "second state");
  const fixedA = verifyCommunityRoomManifest(JSON.parse(gameA.state.communityContentJson));
  assert.equal(fixedA.digest, manifest.digest); assert.equal(gameB.state.communityContentJson, gameA.state.communityContentJson);
  gameA.send("selectChampion", { championId: projects[0]!.projectId });
  gameB.send("selectChampion", { championId: projects[1]!.projectId });
  const expectedPlayers = [[author.account.id, projects[0]!.projectId], [reviewer.account.id, projects[1]!.projectId]] as const;
  proof.expectedPlayers=expectedPlayers; await new Promise(r=>setTimeout(r,600));
  proof.selectionProjection=[...gameA.state.seats.values()].map((s:any)=>({accountId:s.accountId,championId:s.championId,seatId:s.seatId,connected:s.connected,driver:s.driver}));
  log("selection projection",{expectedPlayers,phase:gameA.state.phase,tick:gameA.state.tick,seats:proof.selectionProjection});
  await until(() => expectedPlayers.every(([accountId, championId]) => [...gameA.state.seats.values()].some((seat: any) => seat.accountId === accountId && seat.championId === championId)), "both human accounts selected their own community champion");
  proof.selectedSeats = [...gameA.state.seats.values()].filter((seat: any) => expectedPlayers.some(([id]) => id === seat.accountId)).map((seat: any) => ({ accountId: seat.accountId, championId: seat.championId }));
  proof.admission = { beforeOtherPlayerReady: before, afterBothJoined: gameA.state.tick };
  log("two community champions selected in one live room");
  const reconnectionToken = gameA.reconnectionToken;
  rooms.splice(rooms.indexOf(gameA),1);
  await gameA.leave(false);
  gameA = await new Client(readyA.endpoint).reconnect<any>(reconnectionToken);rooms.push(gameA);gameA.onMessage("*",()=>{});
  await until(()=>gameA.state.matchId===start.matchId,"actual reconnect state");
  assert.equal(verifyCommunityRoomManifest(JSON.parse(gameA.state.communityContentJson)).digest,manifest.digest);
  assert.equal([...gameA.state.seats.values()].find((seat:any)=>seat.accountId===author.account.id)?.championId,projects[0].projectId);
  proof.reconnection={passed:true,manifestDigest:manifest.digest,championId:projects[0].projectId};log("Actual reconnect retained selected hero and all 37 version pins");
  if (process.env.GGD_LOCAL_PROOF_COMBAT === "1") {
    gameA.send("lockChampion", { championId: projects[0]!.projectId });
    gameB.send("lockChampion", { championId: projects[1]!.projectId });
    await until(() => gameA.state.phase === "combat", "real combat phase", 55);
    const players = [{ actor: author, room: gameA, project: projects[0]! }, { actor: reviewer, room: gameB, project: projects[1]! }];
    // The shipping round table gates R to round 3 and EX to round 7. This short
    // socket fixture proves Q/W/E casts only; it never bypasses those gates.
    const casts: unknown[] = [];
    proof.combat = { scope: "Both humans cast W through normal progression; this live match does not claim all 222 slots were cast.", casts };
    const attempts: unknown[] = []; proof.castAttempts = attempts;
    await Promise.all(players.map(async ({ actor, room, project }) => {
      let seq = 1;
      const seat = [...room.state.seats.values()].find((value: any) => value.accountId === actor.account.id) as any;
      assert(seat?.entityId);
      const abilities = withRegistryContext(content.context, () => Champions.get(project.projectId as never).abilities);
      for (const slot of ["W"] as const) {
        const def = withRegistryContext(content.context, () => Abilities.get(abilities[slot].id));
        const actorEvents: EventMessage[] = [];
        const inputs: unknown[] = [];
        const attempt = { accountId: actor.account.id, slot, definition: def, seat: seat.toJSON(), events: actorEvents, inputs };
        attempts.push(attempt);
        proof.latestCastAttempt = attempt;
        const offSingle = room.onMessage("event", (event: EventMessage) => actorEvents.push(event));
        const offBatch = room.onMessage("evbatch", (batch: any) => actorEvents.push(...unpackEventBatch(batch)));
        room.send("input", { seq: seq++, commands: [{ kind: "rankUpAbility", slot }] });
        const sendCastInput = () => {
          const own = room.state.entities.get(String(seat.entityId));
          if (!own?.alive) return;
          const enemy = [...room.state.entities.values()].filter((entity: any) => entity.alive && entity.kind === 0 && entity.zone === own.zone && [...room.state.seats.values()].some((other: any) => other.entityId === entity.id && other.teamId !== seat.teamId)).sort((a: any, b: any) => Math.hypot(a.x - own.x, a.z - own.z) - Math.hypot(b.x - own.x, b.z - own.z))[0] as any;
          if (!enemy && def.castType !== "self") return;
          const distance = enemy ? Math.hypot(enemy.x - own.x, enemy.z - own.z) : 0;
          // Targeted spells reject out-of-range input. Walk through the normal
          // player order first, and refresh a moving/dead target on each retry.
          if (def.castType === "targeted" && distance > Math.max(0.5, def.range * 0.8)) {
            const input = { seq: seq++, order: { kind: "move", point: { x: enemy.x, z: enemy.z } }, commands: [] };
            inputs.push({ ...input, observedDistance: distance }); room.send("input", input); return;
          }
          const target = def.castType === "targeted" ? { type: "entity", entityId: enemy.id } : def.castType === "self" ? { type: "self" } : def.castType === "skillshot" ? { type: "dir", dir: { x: enemy.x - own.x, z: enemy.z - own.z } } : { type: "point", point: { x: enemy.x, z: enemy.z } };
          const input = { seq: seq++, commands: [{ kind: "castAbility", slot, target }] };
          inputs.push({ ...input, observedDistance: distance }); room.send("input", input);
        };
        sendCastInput();
        let retryAt = Date.now() + 1000;
        const cast = await until(() => {
          const accepted = actorEvents.find((event) => event.type === "abilityCast" && event.data.caster === seat.entityId && event.data.slot === slot && event.data.abilityId === def.id);
          if (!accepted && Date.now() >= retryAt) {
            // A previous leap can still be in recovery. Retry ordinary player
            // input at 1 Hz; retain every authoritative refusal in the evidence.
            sendCastInput();
            retryAt = Date.now() + 1000;
          }
          return accepted;
        }, `${actor.account.id} ${slot} authoritative cast`, 20);
        casts.push({ accountId: actor.account.id, championId: project.projectId, ...cast });
        offSingle(); offBatch(); save();
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }));
    proof.networkEvents = events;
    proof.rejections = rejects;
    proof.recordedThroughTick = gameA.state.tick;
    log("both human seats produced real W cast events");
  }
  if (fullMatch) {
    // Ordinary host settings shorten this match. No phase/tick/health injection.
    const settlements: EventMessage[] = [];
    gameA.onMessage("event", (event: EventMessage) => { if (event.type === "matchSettlement") settlements.push(event); });
    gameA.onMessage("evbatch", (batch: any) => settlements.push(...unpackEventBatch(batch).filter((event) => event.type === "matchSettlement")));
    await until(() => settlements[0], "authoritative complete-match settlement", 250);
    assert.equal(gameA.state.phase, "matchEnd");
    let disposed = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const room = await fetch(`${platform}/rooms/${roomId}`, { headers: { authorization: `Bearer ${at}` } });
      if (room.status === 404) { disposed = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(disposed, "Platform must acknowledge settlement and dispose the pending room");
    const afterEconomy = await Promise.all([economicState(at), economicState(rt)]);
    for(let i=0;i<2;i++)assert.equal(afterEconomy[i].account.games,beforeEconomy![i].account.games+1,"Published heroes use ordinary match settlement");
    proof.completeMatch = { hostSettings: { combatMaxSec: 110, maxRounds: 1 },
      phase: gameA.state.phase, finalTick: gameA.state.tick, settlements,
      platformRoomDisposed: disposed, beforeEconomy, afterEconomy,
      limits: "One complete custom match using ordinary host limits, without visual acceptance or R/EX progression coverage." };
    proof.recordedThroughTick = gameA.state.tick; log("Complete ordinary match settled and both player game counts increased");
  }
  proof.status = "passed"; proof.finishedAt = new Date().toISOString(); save();
} catch (error) {
  proof.failedProjection=rooms.map((r:any)=>r.state?.toJSON?.());
  proof.status = "failed"; proof.error = error instanceof Error ? error.stack : String(error); save(); console.error(proof.error); process.exitCode = 1;
} finally {
  for (const room of rooms) await room.leave().catch(() => {});
  for (const socket of lobbySockets) socket.close();
  console.log(`Evidence: ${report}`);
}
