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
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ContentLoader, OverlayContentSource, registerAll, Configs } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions, Items, Augments, LootTables } from "@ggd/shared/sim/content/registry";
import { MatchRoom } from "./rooms/MatchRoom";
import { verify, mintTicket } from "./auth/hmac";
import { mintCreateToken } from "./rooms/createGate";
import { sanitizeDisplayName } from "./net/sanitizeText";
import { secretConfigError } from "./config/secretGuard";
import { deployTierBootLine } from "./config/deployTier";
import { probePlatformAtBoot, PLATFORM_URL } from "./config/platformUrl";
import { fetchOverlayBundle } from "./config/contentOverlay";
import { startContentBus, platformStatusWithContent } from "./config/contentBus";
import { startMatchHeartbeat } from "./config/matchHeartbeat";
import { roomRegistry } from "./rooms/roomRegistry";
import { ReplayRoom } from "./rooms/ReplayRoom";
import { handleInternalReplays } from "./replay/http";
import { setActiveContentVersion } from "./replay/Player";
import { liveRecordingIds } from "./replay/Recorder";
import { pruneReplays, replayDir } from "./replay/store";

const PORT = Number(process.env.GAME_PORT ?? 2567);
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
    }));

  const room = await matchMaker.createRoom("match", {
    matchId: body.matchId,
    seed: body.seed,
    mapId: body.mapId,
    seats: humanSeats,
    callbackUrl: body.callbackUrl,
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
    res.writeHead(200, { "content-type": "application/json" });
    // `rooms` is the ONLY place the live admission state is observable. It
    // matters when an operator lowers maxRooms below the running count: the
    // shard is not broken, it is DRAINING — {active: 63, capacity: 50,
    // draining: true} means no new match starts until 13 finish. Without this
    // the refusals look like an outage.
    // `platform` (task #48) is the SECOND thing that was invisible. Curation,
    // combat-env and server-ops all fail SAFE when the platform is unreachable,
    // so a misconfigured shard looks perfectly healthy while serving allow-all
    // and untuned multipliers. This block names the resolved platform URL, how
    // it was chosen, and every fail-safe currently in force — so "why did my
    // admin tuning do nothing" is one curl away instead of a log archaeology
    // expedition. `degraded: false` is a real statement, not an absence.
    // `platform.content` is the THIRD thing that was invisible, and the one the
    // owner actually asks about: "I changed it in the console — did it land on
    // the shard?" Per document it reports the version the platform last
    // announced on the Redis bus, the version this process actually re-fetched,
    // and when. `stale: false` means the answer is yes; `stale: true` names the
    // reason it is no. Without it, the only way to check was to start a match
    // and squint at the numbers.
    res.end(
      JSON.stringify({
        ok: true,
        rooms: roomRegistry.stats(),
        platform: platformStatusWithContent(),
      }),
    );
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
  // everything else belongs to the Colyseus transport (WS upgrade)
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({
  // Cap the WS frame size (DoS): a client cannot force megabytes of JSON to be
  // deserialized per message. 64 KiB comfortably fits a legit INPUT batch while
  // bounding the work behind the input validator + mailbox caps.
  transport: new WebSocketTransport({ server: httpServer, maxPayload: 64 * 1024 }),
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
    const source = overlay && label === "overlay" ? new OverlayContentSource(base, overlay) : base;
    const result = await new ContentLoader(source).load();
    registerAll(result.store);
    // THE CONTENT VERSION NOW GOES SOMEWHERE. It was logged and thrown away,
    // while `MatchState.contentVersion` stayed "" on every room. It is the
    // primary key of a replay (a recording made on cv_A must never be played on
    // cv_B), so it is published here for MatchRoom and the replay compat check.
    setActiveContentVersion(result.manifest.contentVersion);
    const arenaRules = Configs.tryGet("arena-rules") ? "arena-rules ACTIVE" : "arena-rules absent (legacy rules)";
    const overlayNote = overlay && label === "overlay" ? ` +overlay(gen ${overlay.generation})` : "";
    console.log(
      `[game-server] content loaded from ${CONTENT_DIR}${overlayNote} (${result.manifest.contentVersion}): ` +
        `${Champions.ids().length} champions, ${Items.ids().length} items, ` +
        `${Augments.ids().length} augments, ${LootTables.ids().length} loot tables — ${arenaRules}` +
        (result.warnings.length ? ` [${result.warnings.length} soft-ref warning(s)]` : ""),
    );
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
    void pruneReplays(liveRecordingIds())
      .then((deleted) => {
        console.log(
          `[replay] recordings in ${replayDir()}` +
            (deleted.length > 0 ? `; retention pruned ${deleted.length} at boot` : ""),
        );
      })
      .catch((err) => console.error("[replay] boot retention prune failed", err));
  });
