# docker/game.Dockerfile — Colyseus authoritative game server (Node/TS).
#
# CONTRACT NOTE: apps/game-server is a pnpm workspace package that depends on
# @ggd/shared (packages/shared) and listens on :2567 (Colyseus WS + private
# /_internal/matches admin route). Build context is the REPO ROOT:
#   docker build -f docker/game.Dockerfile .
#
# HOW THIS APP ACTUALLY RUNS (#176). The original Dockerfile was written to a
# planned contract — `pnpm --filter @ggd/game-server build` emits dist/index.js,
# runtime is `node dist/index.js` — that was NEVER implemented. The package has
# no `build` script (only dev/start/typecheck/test), and both dev and start run
# it through `tsx` straight from TypeScript source; @ggd/shared's package "main"
# is likewise ./src/index.ts, uncompiled. So the built image ran `node
# dist/index.js` against a dist/ that did not exist and crash-looped with
#   Error: Cannot find module '/app/dist/index.js'
# — i.e. a family deploy came up with the platform and edge healthy and the game
# server DOWN. This file now ships the app the way it runs: tsx over source.
# When the game server grows a real bundler step, revert to node dist/index.js.

FROM node:22-alpine AS build
# git is REQUIRED, not optional: pnpm-lock.yaml resolves uWebSockets.js from a
# codeload tarball URL and pnpm shells out to `git ls-remote` while resolving
# it. node:22-alpine ships no git, so `docker compose build game` FAILED
# OUTRIGHT before #176 with
#   ENOENT Command failed with ENOENT: git ls-remote --refs \
#     https://github.com/uNetworking/uWebSockets.js.git
# Measured, not theorised. Build-stage only — the runtime image below is
# untouched and still has no git, no shell tools, nothing extra.
RUN apk add --no-cache git
RUN corepack enable
WORKDIR /repo
# Workspace manifests first for layer caching.
# tsconfig.base.json: every app tsconfig `extends` it (see edge.Dockerfile).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/game-server/package.json apps/game-server/
RUN pnpm install --frozen-lockfile --filter "@ggd/game-server..."
COPY packages/shared/ packages/shared/
COPY apps/game-server/ apps/game-server/
# NOT --prod: the app is executed by tsx, which is a devDependency. A --prod
# deploy would strip the one binary the runtime needs. deploy bundles the
# package plus its workspace dep @ggd/shared (source, since shared has no build)
# into a self-contained /out.
RUN pnpm --filter "@ggd/game-server" deploy /out

FROM node:22-alpine
# tini: PID-1 signal handling so Colyseus shuts down gracefully on SIGTERM.
RUN apk add --no-cache tini
# NODE_ENV stays development here on purpose: the secret guard's fail-closed
# behaviour keys on the ENV LABEL, and the family compose overlay sets
# APP_ENV=production / NODE_ENV=production explicitly (docker/compose.family.yaml).
# A bare `docker compose up` (dev) must keep working, so the image default is
# development and the deploy overlay is what hardens it — see secretGuard.ts.
ENV NODE_ENV=development
WORKDIR /app
COPY --from=build /out/ ./

# Secrets (PLATFORM_GAME_SHARED_SECRET, …) come from the environment only —
# never baked into the image (infra-09).
EXPOSE 2567
USER node
ENTRYPOINT ["/sbin/tini", "--"]
# tsx over source — see the header. `node_modules/.bin/tsx` is present because
# the deploy above was not --prod.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
