# GGD — 3v3v3v3 3D Voxel Arena MOBA

A web-based, real-time 3D 3v3v3v3 arena MOBA (4 teams × 3, LoL-Arena-style **Paired Duels**)
with mixed human/AI matches, an online platform (accounts, friends, lobby, rooms), a
content-authoring editor suite, a test harness, and one-click K8s packaging.

Full design & roadmap: `~/.claude/plans/3v3v3v3-ai-quirky-donut.md`.

## Architecture at a glance

```
Browser ─▶ Nginx edge ─┬─ /            client SPA (Babylon + React)      apps/client
                       ├─ /editor/     content editor SPA                apps/editor
                       ├─ /content/**  static game content JSON + .glb    content/
                       ├─ /api/**   ─▶ Go platform (auth/friends/lobby…)  apps/platform
                       ├─ /ws|/colyseus ▶ Colyseus authoritative sim      apps/game-server
                       └─ /content-api  ▶ Fastify content-api (DEV ONLY)  apps/content-api

Go platform ─▶ Redis (hot: sessions/presence/rooms/chat/leaderboard)
            ─▶ data/ JSON files (durable truth)  ─HMAC▶ Colyseus /_internal/matches
```

## Core principles

- **Planar sim, 3D presentation** — the authoritative sim is 2D `(x,z)`; no `y`. Collision is
  circle/segment. 3D (voxel models, camera) is client presentation only.
- **Server-authoritative + client prediction** — the shared TS sim runs on the Colyseus server
  and (for local prediction) in the client.
- **One unified stat/effect pipeline** — champions/items/augments/buffs all reduce to a
  `ModifierSource`; adding content never touches engine code.
- **Content = external JSON, Zod is the single source of truth** — one file per object under
  `content/`, no DB, content-hash cached.
- **JSON files are durable truth; Redis is a rebuildable hot layer** (`data/`).

## Layout

| Path | What |
| --- | --- |
| `packages/shared` | Pure TS: sim + planar collision + protocol + Zod content schemas + ContentLoader |
| `apps/game-server` | Colyseus authoritative sim (Node/TS) |
| `apps/client` | Babylon.js + React voxel client |
| `apps/editor` | Content editor SPA (schema forms + real-engine preview) |
| `apps/content-api` | Fastify content CRUD (dev only) |
| `apps/platform` | Go modular monolith (auth/friends/lobby/rooms/ranking) |
| `apps/test-dashboard` | One-click test UI (dev only) |
| `tools/testrunner`, `tools/todo-check` | Test orchestration + TODO↔test gate |
| `content/` | Game content JSON-per-object (portable, no DB) |
| `data/` | Durable platform truth (JSON, gitignored) |
| `docs/todo/` | Per-feature TODO `.md` (each item ↔ a test function) |
| `docs/runbooks/` | Operational runbooks (recovery paths for a live/dev install) |
| `deploy/`, `docker/`, `nginx/` | Helm chart, kind, Dockerfiles, edge config |

## Dev

Requirements: Node ≥20, pnpm 9, Go ≥1.23, Docker, (kind + Skaffold for `make up`).

```bash
pnpm install            # install JS/TS workspaces
pnpm test               # run all package tests
pnpm typecheck          # typecheck all packages
make up                 # (later) one-click: build images + kind cluster + seed
```

### A fresh install has NO playable content

The content whitelist is **default-empty on purpose** — the imported WC3 tree is far larger
than what should ship enabled, so nothing is playable until an operator opts content in. If
champ-select shows 「尚未啟用任何英雄」:

```bash
make seed-demo          # enable the curated 12-champion / 30-item demo set
make whitelist          # show what is currently enabled
```

…or in the ops console: **內容白名單 → ⭐ 啟用示範組合 → 儲存**.
Full recovery guide: [`docs/runbooks/content-whitelist.md`](docs/runbooks/content-whitelist.md).

Status: **skeleton in progress** — see `docs/todo/_index.md` for per-feature progress.
