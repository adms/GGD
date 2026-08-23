/**
 * Game-server bootstrap: Colyseus over WebSocket + the private /_internal
 * admin API the Go platform calls to create matches and reserve seats.
 * The /_internal route is NEVER exposed through the public edge (Nginx doesn't
 * proxy it; NetworkPolicy restricts it in K8s).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport, WebSocketClient } from "@colyseus/ws-transport";
import { ContentLoader, OverlayContentSource, registerAll, Configs } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions, Items, Augments, LootTables } from "@ggd/shared/sim/content/registry";
import { MatchRoom } from "./rooms/MatchRoom";
import { verify, mintTicket } from "./auth/hmac";
import { mintCreateToken } from "./rooms/createGate";
import { sanitizeDisplayName } from "./net/sanitizeText";
import {
  installOutboundCopyGuard,
  perMessageDeflateOption,
  resolveWsCompression,
  wsCompressionBootLine,
} from "./net/wsCompression";
import { clusterBootLine, resolveClusterConfig } from "./config/cluster";
import { buildMatchmakerBackend } from "./cluster/matchmakerBackend";
import { secretConfigError } from "./config/secretGuard";
import { deployTierBootLine } from "./config/deployTier";
import { probePlatformAtBoot, PLATFORM_URL } from "./config/platformUrl";
import { fetchOverlayBundle } from "./config/contentOverlay";
import { startContentBus, platformStatusWithContent } from "./config/contentBus";
import { startMatchHeartbeat } from "./config/matchHeartbeat";
import { roomRegistry } from "./rooms/roomRegistry";
import { tickHealth } from "./match/tickHealth";
import { recordQuarantine } from "./contentHealth";
import { ReplayRoom } from "./rooms/ReplayRoom";
import { handleInternalReplays } from "./replay/http";
import { serveDamageBoard } from "./stats/damageBoard";
import { verify as verifyInternalHmac } from "./auth/hmac";
import { setActiveContentVersion } from "./replay/Player";
import { liveRecordingIds } from "./replay/Recorder";
import { probeReplayDirWritable, pruneReplays, replayDir } from "./replay/store";
import { replayHealth } from "./replay/replayHealth";
import { buildHealthzPayload, healthzStatus } from "./healthz";

// MULTI-PROCESS (A). Resolved here rather than read from env piecemeal so the
// port this shard BINDS and the address it ADVERTISES can never disagree — see
// config/cluster.ts. On the default GGD_GAME_PROCESSES=1 this is exactly the
// old `Number(process.env.GAME_PORT ?? 2567)` with LocalPresence/LocalDriver.
const { config: CLUSTER, errors: CLUSTER_ERRORS } = resolveClusterConfig(process.env);
if (CLUSTER_ERRORS.length > 0) {
  console.error(`[cluster] FATAL: refusing to start.\n  - ${CLUSTER_ERRORS.join("\n  - ")}`);
  process.exit(1);
}
const PORT = CLUSTER.port;
/** content tree root — defaults to the monorepo's content/ next to apps/ */
const CONTENT_DIR =
  process.env.CONTENT_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "../../../content");
const SHARED_SECRET = process.env.PLATFORM_GAME_SHARED_SECRET ?? "";
/**
 * The address the BROWSER is told to connect to. It travels to the client in
 * `match_ready.endpoint` and is handed straight to `new Client(...)`, so it must
 * be reachable FROM THE PLAYER, not from inside this container.
 *
 * The localhost default is right for development and catastrophic anywhere else:
 * unset on the family deploy, every player's browser was told to open a socket
 * to the game server on their own machine, where nothing listens, and the join
 * failed instantly. It survived undetected because on the owner's own machine
 * localhost:2567 really IS the game server — so local play worked perfectly —
 * and nothing in the test suite connects from a remote browser.
 */
const PUBLIC_ENDPOINT = process.env.GAME_PUBLIC_ENDPOINT ?? `ws://localhost:${PORT}`;

/**
 * Refuse to hand out a localhost endpoint on a deploy that serves real players.
 *
 * A warning would not have helped: the boot log already carried a dozen lines
 * and this one would have joined them. GGD_DEPLOY_TIER is set to "family" (or
 * anything non-dev) precisely on the deploys where a localhost endpoint cannot
 * possibly be correct, so there it is fatal — a server that refuses to start is
 * a deploy you fix in one minute, where a server that starts and hands out an
 * unreachable address is an evening of "按了沒反應".
 */
const DEPLOY_TIER = process.env.GGD_DEPLOY_TIER ?? "dev";
if (DEPLOY_TIER !== "dev" && /^wss?:\/\/(localhost|127\.|\[?::1)/i.test(PUBLIC_ENDPOINT)) {
  console.error(
    `[game-server] FATAL: GGD_DEPLOY_TIER=${DEPLOY_TIER} but GAME_PUBLIC_ENDPOINT is ${PUBLIC_ENDPOINT}.\n` +
      "  That address is what the PLAYER'S BROWSER is told to connect to, so a loopback value means every\n" +
      "  remote join fails instantly. Set GAME_PUBLIC_ENDPOINT to the public route that proxies to this\n" +
      "  container — e.g. wss://<host>/ws, matching nginx `location /ws/`.",
  );
  process.exit(1);
}

// FAIL-CLOSED boot guard (mirrors the platform's #126 checkRequiredSecrets): a
// production deploy MUST carry PLATFORM_GAME_SHARED_SECRET. Without it the
// server would boot fail-open — unauthenticated joins, client-spoofable
// identity, cheats on — so refuse to start rather than serve that quietly.
const bootErr = secretConfigError(process.env.APP_ENV, process.env.NODE_ENV, SHARED_SECRET);
if (bootErr) {
  console.error(`[game-server] FATAL: ${bootErr}`);
  process.exit(1);
}

// #176: say which tier this process thinks it is. The platform prints the same
// fact (cmd/platform/main.go) and the edge refuses to boot if it disagrees with
// what is on disk — three independent statements of one declaration, so a
// half-configured deploy is visible in the logs instead of visible only in
// "why is everyone a wizard" three hours into the playtest.
console.log(deployTierBootLine());

interface InternalMatchRequest {
  matchId: string;
  mode: string;
  mapId?: string;
  seats: {
    accountId: string;
    displayName: string;
    team: number;
    slot: number;
    champion?: string;
    /**
     * 平台積分 (GH#492). ⚠️ `gamelink.Seat` 的 JSON tag 就是 `mmr` —— 這個欄位名
     * 必須**逐位元組**對上，打錯不會有人報錯：欄位靜靜消失，名冊上每個人的積分
     * 都是 0，而畫面看起來完全正常（失敗形態②）。
     */
    mmr?: number;
    isBot?: boolean;
    // Task #201: the account's playable champion set (free roster ∪ unlocked),
    // resolved server-side by the platform (gamelink.PlayableChampions) and
    // carried in this HMAC-signed body. Enforced authoritatively at champ-select
    // lock-in; absent leaves the seat's ownership unenforced (fail-open).
    owned?: string[];
  }[];
  botFill?: { count: number; difficulty?: string };
  callbackUrl?: string;
  seed?: number;
  // PER-ROOM roguelite-mob toggle (#215). Absent === ON (default-ON directive);
  // only an explicit `false` from the room host disarms the mobs. Passed straight
  // into the MatchRoom bag and merged onto arenaRules in onCreate.
  rogueliteMobs?: boolean;
  /**
   * 練習模式 (GH#343)。缺席 = 這不是練習房（練習模式沒有「缺席 = ON」那種語意，
   * 所以這裡不需要 `rogueliteMobs` 的三態）。
   *
   * ⚠️ 這一格是**平台這條路唯一的練習房入口**：客戶端自己 joinOrCreate 帶
   * `practice` 在正式站會被 `MatchRoom` 的 createToken 閘擋掉（那才是對的），
   * 所以練習房只能由 `/_internal/matches` 這條 HMAC 簽章的路開出來。
   */
  practice?: boolean;
  // PER-ROOM 開房設定 (#288). 和 `rogueliteMobs` 同一條路：Go 那一層只做透明轉送
  // （界限只能有一份，而 Go 沒辦法 import `@ggd/shared/roomSettings`），權威的
  // 夾取在 `MatchRoom.onCreate` 的 `sanitizeRoomSettings()`。
  // 每一格缺席 = 用 `config.match@1` 的出貨值，**包含 vs bot 的選角秒數**。
  champSelectSec?: number;
  intermissionSec?: number;
  combatMaxSec?: number;
  /** 總回合數上限。0 = 不設限 = 今天的行為。 */
  maxRounds?: number;
}

async function handleInternalMatches(req: IncomingMessage, res: ServerResponse, rawBody: string): Promise<void> {
  const ts = String(req.headers["x-internal-timestamp"] ?? "");
  const auth = String(req.headers["x-internal-auth"] ?? "");
  if (!SHARED_SECRET || !verify(SHARED_SECRET, ts, rawBody, auth)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "unauthorized", message: "bad hmac" } }));
    return;
  }

  let body: InternalMatchRequest;
  try {
    body = JSON.parse(rawBody) as InternalMatchRequest;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "bad-request", message: "invalid json" } }));
    return;
  }

  const humanSeats = (body.seats ?? [])
    .filter((s) => !s.isBot)
    .map((s) => ({
      seatId: s.team * 3 + s.slot,
      teamId: s.team,
      accountId: s.accountId,
      // XSS backstop — never trust the caller's displayName even on the
      // HMAC-authed path (defense-in-depth over the platform username rule).
      // Only real strings are sanitized; an absent name stays undefined so the
      // downstream seat-name fallback is preserved.
      displayName: typeof s.displayName === "string" ? sanitizeDisplayName(s.displayName) : s.displayName,
      championId: s.champion,
      // Pass through the account's owned set (task #201). Only a real array
      // enrolls the seat for enforcement; an absent field leaves it unenforced.
      owned: Array.isArray(s.owned) ? s.owned.filter((x): x is string => typeof x === "string") : undefined,
      // GH#492 積分 —— 平台的 `mmr` 換成引擎那一側的名字 `rating`。⛔ 少了這一行，
      // 平台送對了數字也會在這道門口消失,而名冊上每一列的積分都是 0。
      rating: typeof s.mmr === "number" && Number.isFinite(s.mmr) ? s.mmr : undefined,
    }));

  const room = await matchMaker.createRoom("match", {
    matchId: body.matchId,
    seed: body.seed,
    mapId: body.mapId,
    seats: humanSeats,
    callbackUrl: body.callbackUrl,
    // Per-room roguelite-mob toggle (#215); undefined here keeps it ON.
    rogueliteMobs: body.rogueliteMobs,
    // 練習模式 (GH#343) —— ⛔ 少了這一行，平台送對了旗標也會在這道門口消失，
    // 開出來的是一間會結算的普通房（失敗形態②：算出來了但從沒送到下游）。
    practice: body.practice,
    // 開房設定 (#288) —— 原封不動地轉送，**不在這裡驗**。這裡驗就是第二份界限，
    // 而界限只能有一份（`@ggd/shared/roomSettings`），權威在 MatchRoom.onCreate。
    // undefined 一路保持 undefined = 缺席 = 用出貨值（語意①：缺席 ≠ 重設）。
    champSelectSec: body.champSelectSec,
    intermissionSec: body.intermissionSec,
    combatMaxSec: body.combatMaxSec,
    maxRounds: body.maxRounds,
    // Server-only proof that THIS create came from the /_internal path; the
    // room's onCreate rejects a client-initiated create that lacks it (prod).
    createToken: mintCreateToken(SHARED_SECRET),
  });

  const reservations = [];
  for (const seat of humanSeats) {
    const ticket = mintTicket(SHARED_SECRET, seat.accountId);
    const reservation = await matchMaker.reserveSeatFor(room, {
      accountId: seat.accountId,
      ticket,
    });
    reservations.push({ accountId: seat.accountId, seatToken: JSON.stringify(reservation) });
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      matchId: body.matchId,
      colyseusRoomId: room.roomId,
      endpoint: PUBLIC_ENDPOINT,
      reservations,
    }),
  );
}

const httpServer = createServer((req, res) => {
  if (req.url === "/healthz") {
    // The payload and the status policy live in ./healthz so they are testable
    // — index.ts binds a port at import time, which made every field on this
    // endpoint unreachable from a test. See that file for what each block is
    // for and why `replay` (GH#170) had to be added.
    const payload = buildHealthzPayload();
    res.writeHead(healthzStatus(payload), { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
    return;
  }
  if (req.url === "/_internal/matches" && req.method === "POST") {
    let raw = "";
    req.on("data", (c: Buffer) => {
      raw += c.toString("utf8");
      if (raw.length > 1_000_000) req.destroy(); // bound request size
    });
    req.on("end", () => {
      handleInternalMatches(req, res, raw).catch((err) => {
        console.error("internal/matches error", err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { code: "internal", message: "error" } }));
        }
      });
    });
    return;
  }
  // MATCH REPLAYS (task #175). Deliberately under /_internal, not a public
  // route: recordings carry the display name of everyone who played. The path
  // is HMAC-signed exactly like /_internal/matches, is not proxied by the public
  // edge, and the admin console reaches it only through the platform's
  // admin-authenticated proxy.
  if (req.url?.startsWith("/_internal/replays")) {
    let raw = "";
    req.on("data", (c: Buffer) => {
      raw += c.toString("utf8");
      if (raw.length > 100_000) req.destroy();
    });
    req.on("end", () => {
      handleInternalReplays(req, res, raw, SHARED_SECRET).catch((err) => {
        console.error("internal/replays error", err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { code: "internal", message: "error" } }));
        }
      });
    });
    return;
  }
  // DAMAGE BOARD (#636). Same posture as /_internal/replays: not a public
  // route, reached only through the platform's admin-authenticated proxy.
  // Read-only; serveDamageBoard never 5xxes (empty board over a red page).
  if (req.url?.startsWith("/_internal/damage-board")) {
    // Same HMAC posture as /_internal/replays (GET ⇒ signed over the empty body).
    if (SHARED_SECRET) {
      const ts = String(req.headers["x-internal-timestamp"] ?? "");
      const auth = String(req.headers["x-internal-auth"] ?? "");
      if (!verifyInternalHmac(SHARED_SECRET, ts, "", auth)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "unauthorized", message: "bad hmac" } }));
        return;
      }
    }
    const u = new URL(req.url, "http://internal");
    void serveDamageBoard(res, {
      offset: Number(u.searchParams.get("offset") ?? 0) || 0,
      count: Number(u.searchParams.get("count") ?? 0) || undefined,
    });
    return;
  }
  // everything else belongs to the Colyseus transport (WS upgrade)
  res.writeHead(404);
  res.end();
});

// B2: permessage-deflate + the owner's size threshold. Every knob (including
// the one that makes the threshold work at all) lives in ./net/wsCompression;
// nothing about compression is decided here. maxPayload is passed through to
// the extension by ws, so it also bounds the DECOMPRESSED size of an inbound
// frame — a compressed-bomb cannot expand past 64 KiB either.
const wsCompression = resolveWsCompression();
console.log(wsCompressionBootLine(wsCompression));
// Compression makes ws.send() asynchronous, which makes @colyseus/schema's
// reused encode buffer unsafe to hand out by reference. See the long comment on
// installOutboundCopyGuard — without this, patches arrive spliced.
if (wsCompression.enabled) installOutboundCopyGuard(WebSocketClient);
console.log(clusterBootLine(CLUSTER));
const gameServer = new Server({
  // Cap the WS frame size (DoS): a client cannot force megabytes of JSON to be
  // deserialized per message. 64 KiB comfortably fits a legit INPUT batch while
  // bounding the work behind the input validator + mailbox caps.
  transport: new WebSocketTransport({
    server: httpServer,
    maxPayload: 64 * 1024,
    perMessageDeflate: perMessageDeflateOption(wsCompression),
  }),
  // THE CLUSTER IS THESE THREE FIELDS. `presence` is how this process discovers
  // the others (room placement and cross-process seat reservation are both
  // presence IPC), `driver` is the shared room listing, and `publicAddress` is
  // what tells the browser which of them owns its room. Empty object on a
  // single-process shard — Colyseus's local defaults, unchanged.
  ...buildMatchmakerBackend(CLUSTER),
});

gameServer.define("match", MatchRoom);
// Replay playback (task #175). Same schema as "match", so the client renders a
// recorded match with the renderer it already has; the room registers no input
// handler, so a viewer can never influence what is being replayed.
gameServer.define("replay", ReplayRoom);

/**
 * Load the full content tree (93 champions, items, augments, loot tables,
 * arena-rules config) into the registries BEFORE accepting matches. On any
 * load failure the server still boots with the built-in skeleton content so
 * dev environments without a content/ checkout keep working.
 */
async function loadContent(): Promise<void> {
  const base = new FsContentSource(CONTENT_DIR);
  // #189: lay the platform's durable data/ content overlay over the shipped tree
  // (best-effort — a null overlay leaves the load exactly as it was). This is the
  // read side of "an admin edit on the host survives a git pull": the overlay
  // lives in data/, which the :ro content mount can never erase.
  const overlay = await fetchOverlayBundle(PLATFORM_URL);

  const loadFrom = async (label: string): Promise<boolean> => {
    const withOverlay = overlay !== null && label === "overlay";
    const source = withOverlay ? new OverlayContentSource(base, overlay) : base;
    // ⭐ GH#326 —— 兩趟的政策**必須不同**（同 client 的 bootContent.ts）：
    //    帶 overlay 那一趟 ⛔ `fail-closed`，因為 overlay 是一**層** —— 它破一個洞
    //    應該**露出下面的出貨樹**（下面那個 catch 就是做這件事），⛔ 不是把兩層
    //    一起打穿。退回出貨樹那一趟才用內容說了算的 `quarantine`：那是最後一層，
    //    沒有東西可以再退了，少一份設定好過整站退骨架。
    const result = await new ContentLoader(source).load(
      withOverlay ? { policy: "fail-closed" } : undefined,
    );
    registerAll(result.store);
    // THE CONTENT VERSION NOW GOES SOMEWHERE. It was logged and thrown away,
    // while `MatchState.contentVersion` stayed "" on every room. It is the
    // primary key of a replay (a recording made on cv_A must never be played on
    // cv_B), so it is published here for MatchRoom and the replay compat check.
    setActiveContentVersion(result.manifest.contentVersion);
    // ⭐ GH#326 —— 被隔離的文件要進一個**擋不掉的**地方。`/healthz` 的
    //    `content.quarantined` 是機器讀的那一份(部署後置條件與後台重要事件頁
    //    都從它來)。⛔ 只寫一行 console.warn 就是這條規則要修的東西本身。
    recordQuarantine(result.quarantined);
    const arenaRules = Configs.tryGet("arena-rules") ? "arena-rules ACTIVE" : "arena-rules absent (legacy rules)";
    const overlayNote = overlay && label === "overlay" ? ` +overlay(gen ${overlay.generation})` : "";
    console.log(
      `[game-server] content loaded from ${CONTENT_DIR}${overlayNote} (${result.manifest.contentVersion}): ` +
        `${Champions.ids().length} champions, ${Items.ids().length} items, ` +
        `${Augments.ids().length} augments, ${LootTables.ids().length} loot tables — ${arenaRules}` +
        (result.warnings.length ? ` [${result.warnings.length} soft-ref warning(s)]` : ""),
    );
    if (result.quarantined.length > 0) {
      console.warn(
        `[game-server] ⚠️ 隔離了 ${result.quarantined.length} 份文件(政策 ${result.policyUsed})—— ` +
          `其餘照常載入。完整清單在 GET /healthz 的 content.quarantinedDocs,` +
          `後台「重要事件」頁也會跳紅點。`,
      );
      for (const q of result.quarantined) {
        console.warn(`[game-server]   隔離 ${q.collection}/${q.id} (${q.reason}) — ${q.detail}`);
      }
    }
    return true;
  };

  try {
    await loadFrom(overlay ? "overlay" : "shipped");
    return;
  } catch (err) {
    // A BAD OVERLAY MUST NEVER BRICK THE SHARD. If merging the overlay made the
    // content invalid, retry the shipped tree alone before giving up — the
    // operator's other content is far more valuable than one bad edit, and the
    // admin console validates on save so this is the belt to that suspenders.
    if (overlay) {
      console.error(
        `[game-server] content load WITH the data/ overlay failed — retrying the shipped tree ` +
          `alone (the overlay is not applied this boot). Fix the offending overlay doc.`,
        err,
      );
      try {
        await loadFrom("shipped");
        return;
      } catch (err2) {
        err = err2;
      }
    }
    console.error(
      `[game-server] CONTENT LOAD FAILED from ${CONTENT_DIR} — falling back to skeleton content ` +
        `(2 champions, legacy match rules). Fix the content tree or set CONTENT_DIR.`,
      err,
    );
    registerSkeletonContent();
    // A skeleton boot has NO manifest, so there is no cv_ to record. Leaving it
    // empty is honest: every recording made in this state carries "" and will
    // only replay against another skeleton boot.
    setActiveContentVersion("");
  }
}

loadContent()
  .then(() => gameServer.listen(PORT))
  .then(() => {
    console.log(`[game-server] listening on :${PORT} (secret=${SHARED_SECRET ? "set" : "DEV MODE"})`);
    // #48: SAY IT AT BOOT. Curation / combat-env / server-ops each fail safe on
    // an unreachable platform, so before this probe the only symptom of a
    // misconfigured shard was matches quietly running on numbers nobody tuned.
    // Fire-and-forget — a probe must never delay or block accepting matches;
    // its result is also readable afterwards on GET /healthz.
    void probePlatformAtBoot();
    // The other half of #48: the boot probe says whether the platform is
    // REACHABLE, this says whether its later CHANGES arrive. Started after
    // listen() and never awaited — Redis is optional, so a missing or
    // unreachable one must cost nothing but instant propagation. It reconnects
    // on its own and reports itself on /healthz.
    startContentBus();
    // MATCH LIVENESS (#187). Tells the platform, every 30s over the HMAC
    // channel, which matches are still being played, so its reaper renews their
    // deadline instead of guessing one from a constant. Without this the
    // platform falls back to a blind deadline and can write an ABANDONED result
    // onto a match people are still playing — which is exactly what it did to
    // the owner's family games once startingTeamLives went past 3. Fire and
    // forget, unref'd: it never delays or blocks a match.
    startMatchHeartbeat(SHARED_SECRET);
    // Retention runs at boot as well as after each match, so a shard that was
    // restarted mid-season still converges on the ceiling instead of only ever
    // pruning while matches happen to be finishing. Fire-and-forget: nothing
    // waits on it and a failure only logs.
    // GH#170 — SAY IT AT BOOT, and prove it with a real write.
    //
    // Counters only move when a match is played, and the owner deploys in the
    // evening and plays afterwards; a counter-only design would tell him his
    // session is unrecordable at the START of that session, at the earliest.
    // This creates and unlinks a probe file, so the answer is in the boot log
    // AND on /healthz before anyone connects. `access(W_OK)` was rejected on
    // purpose: it asks about permission BITS and answers "yes" on a read-only
    // mount and on a full disk. Only the syscall the recorder itself performs
    // is evidence. Fire-and-forget — a best-effort feature must never delay or
    // block accepting matches.
    void probeReplayDirWritable()
      .then(async (probe) => {
        replayHealth.noteProbe(probe.ok, probe.ok ? undefined : probe.err);
        if (!probe.ok) {
          console.error(
            `[ggd.replay] phase=probe dir=${replayDir()} writable=false — ` +
              "NO MATCH ON THIS SHARD WILL BE RECORDED. Check the mount's owner/uid " +
              "(the container runs as `node`, uid 1000) and free space; see " +
              "docs/replay-observability.md",
            probe.err,
          );
          // Still prune: an unwritable directory can still be readable, and a
          // failed probe is not a reason to also stop enforcing retention.
        }
        const deleted = await pruneReplays(liveRecordingIds());
        console.log(
          `[replay] recordings in ${replayDir()} (writable=${probe.ok})` +
            (deleted.length > 0 ? `; retention pruned ${deleted.length} at boot` : ""),
        );
      })
      .catch((err) => console.error("[replay] boot retention prune failed", err));
  });
