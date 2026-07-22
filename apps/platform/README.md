# GGD Platform (Go)

The platform backend of the GGD 3v3v3v3 voxel arena MOBA: accounts/auth,
friends & presence, lobby WebSocket, rooms & invites, the Go⇄Colyseus match
seam, and ranking/leaderboard. One Go 1.23+ modular monolith
(`github.com/ggd/platform`), no ORM/Gin/DI frameworks.

**Storage model (load-bearing):** `data/` JSON files are the durable truth
(atomic tmp+rename writes via renameio, sharded keyed locks, per-collection
`_index.json`); Redis 7 is a rebuildable hot layer (sessions, presence, rooms,
chat, leaderboard, rate limits, wallet mirror). On boot the platform replays
the settlement WAL (`data/journal/*.log`) and rebuilds Redis from JSON —
wiping Redis loses nothing. Match records store **absolute** post-match MMR
*and M COIN balances* so WAL replay and duplicate callbacks are idempotent.
Single-writer deployment (`replicas: 1`, `Recreate`, RWO PVC).

## Run

```sh
cd apps/platform
JWT_SIGNING_SECRET=dev-secret PLATFORM_GAME_SHARED_SECRET=dev-game-secret \
  go run ./cmd/platform          # HTTP on :8080; Redis on 127.0.0.1:6379

go run ./cmd/seed                # rebuild Redis from data/ JSON only (idempotent)
```

## Test

```sh
cd apps/platform
go test ./...        # no external services: miniredis + t.TempDir + fake game server
go test -race ./...
```

Every TODO item in `docs/todo/{auth,friends,lobby,rooms,invite,leaderboard,game-seam,mcoin-store}.md`
maps to a test that calls `testkit.Cover(t, "<test_id>")`, emitting NDJSON
beacons to `$GGD_COVERAGE_FILE` for the `tools/todo-check --runtime` gate.

> **Deviation from the master plan:** the plan placed the Go coverage helper at
> `packages/shared/testkit/cover.go`, but Go sources must live inside the Go
> module, so it lives at **`apps/platform/pkg/testkit/cover.go`** instead. The
> NDJSON beacon format (`{"cover":"<test_id>"}`) is identical to
> `packages/shared/testkit/cover.ts`, and beacons are only emitted when the
> test passes.

## Environment

| Var | Default | Purpose |
| --- | --- | --- |
| `PLATFORM_ADDR` | `:8080` | HTTP listen address |
| `REDIS_ADDR` | `127.0.0.1:6379` | Redis host:port |
| `REDIS_PASSWORD` | _(empty)_ | Redis auth |
| `DATA_DIR` | `./data` | Durable JSON truth root |
| `CONTENT_DIR` | `../../content` | Read-only content tree (skins + `config/store.json`); missing ⇒ empty store catalog |
| `JWT_SIGNING_SECRET` | **required** | HS256 access-token key |
| `PLATFORM_GAME_SHARED_SECRET` | **required** | HMAC secret of the Go⇄Colyseus seam |
| `GAME_SERVER_ADDR` | `http://127.0.0.1:2567` | Colyseus internal base URL |
| `PLATFORM_INTERNAL_URL` | `http://platform:8080` | Own base URL for the result callback |
| `SEASON` | `s1` | Active ranking season |

## API surface (`/api/v1`)

Errors are always `{"error":{"code","message"}}`.

**Auth** — `POST /auth/register` · `POST /auth/login` (per-IP rate-limited,
constant-shape failures) · `POST /auth/refresh` (rotating opaque refresh
tokens, reuse detection revokes the family) · `POST /auth/logout` ·
`GET /me`. Access JWT: HS256, 15 min. Passwords: argon2id.

**Friends** — `GET /friends` · `POST /friends/requests` ·
`POST /friends/requests/{accountId}/accept|decline` ·
`DELETE /friends/{accountId}` · `POST /friends/{accountId}/block`.
Write-through to both `data/friends/<id>.json` files under ULID-ordered locks;
the actor is always the authenticated account (IDOR-proof).

**Lobby** — `GET /lobby/ws?token=<access>` WebSocket. Client sends
`{"type":"heartbeat"}` and `{"type":"chat","roomId","text"}`; server pushes
`presence`, `invite`, `match_ready` (seat token) and `chat` messages. Chat is
HTML-escaped on output, control chars rejected, rate-limited, stream-capped
(50). `GET /lobby/rooms` open-room list. `GET /rooms/{id}/chat` history.

**Rooms** — `POST /rooms` · `GET /rooms/{id}/` · `POST /rooms/{id}/join|leave|ready|start` ·
`PATCH /rooms/{id}/settings` (host-only, like start) · `POST /rooms/{id}/invite`
(host-only; 256-bit single-use token, TTL 10 m, pushed to the target's WS) ·
`POST /rooms/join-by-code` · `GET|POST /rooms/templates`, `GET /rooms/templates/{id}`.
Rooms are Redis-only ephemeral; only templates are durable JSON. Start requires
every non-host human ready; `botFill = 12 − humans`.

**Wallet & store (M COIN)** — `GET /wallet` (own wallet only: mcoin, owned
champions/skins, equipped skins; first read seeds every price-0 starter
champion) · `GET /wallet/owns?champion=` · `GET /store/catalog` (content
catalog + owned/equipped flags) · `POST /store/buy` `{kind:"champion"|"skin",
id}` (owned ⇒ 409 `already_owned`, underfunded ⇒ 402 `insufficient_mcoin`;
skins auto-equip) · `POST /store/equip` `{championId, skinId|null}` (must own).
Catalog source: `CONTENT_DIR/config/store.json` (`config.store@1`: champion
prices + placement rewards) and `CONTENT_DIR/skins/`. Wallet truth lives on
the account JSON; `wallet:<id>` in Redis is only a rebuildable mirror. Match
settlement grants `mcoinRewards.placement1..4` to each human seat (bots,
`:p`-suffixed guests and unknown accounts are skipped) and stores the
**absolute** post-match balance in the match record. Room start rejects
(`champion_not_owned`) when a member's champ-select pick
(`POST /rooms/{id}/ready` `{ready, champion?}`) is a priced champion they do
not own.

**Ranking** — `GET /ranking/leaderboard?page=&pageSize=` (public) ·
`GET /ranking/me` (rank, MMR, around-me window). Elo K=32 provisional
(<30 games) else 24, team avg-vs-avg applied per player. Ladder is a Redis
ZSET (`lb:<season>:pairedduels`) with a debounced snapshot to
`data/rankings/<season>/snapshot.json`; a cold Redis falls back to (and
rehydrates from) the snapshot.

**Internal (HMAC, never proxied by the edge)** —
`POST /internal/matches/{matchId}/result`. Both seam directions use
`X-Internal-Timestamp` + `X-Internal-Auth: hex(HMAC_SHA256(secret, ts+"."+body))`
with a 30 s skew guard. Outbound: on room start the platform POSTs
`GAME_SERVER_ADDR/_internal/matches` (`{matchId, mode, mapId, seats[],
botFill, callbackUrl}`), receives `{matchId, colyseusRoomId, reservations[],
endpoint}` and pushes each human its own seat token over the lobby WS (bots
are never reserved). Inbound: the result callback is idempotent
(`SETNX match:result:done:<id>`), journals a WAL intent, writes
`data/matches/YYYY/MM/<id>.json`, appends `data/history/<accountId>.jsonl`,
sets absolute account MMR, `ZADD`s the ladder, returns presence to the lobby,
then commits the WAL. A reaper marks matches stuck past 30 min as abandoned.

## Layout

```
cmd/platform          HTTP server        cmd/seed  Redis rebuild from JSON
internal/config       env config         internal/httpx     chi middleware + error envelope
internal/data/jsonstore  atomic JSON-per-object store (+ _index.json)
internal/data/redisx  go-redis wrapper (sessions/presence/rooms/invites/lb/ratelimit/pubsub)
internal/data/wal     settlement write-ahead journal
internal/data/boot    boot rebuild: WAL replay + indexes + leaderboard
internal/auth account friend presence lobby room ranking gamelink
internal/wallet       M COIN wallet + store catalog (CONTENT_DIR) + buy/equip
internal/gamelink/gamelinktest  fake Colyseus server for seam integration tests
internal/server       composition root (also used by tests)
internal/testutil     full-stack test harness (miniredis + tempdir + fake node)
pkg/testkit           Cover(t, test_id) coverage beacon
```
