# docker/game.Dockerfile — Colyseus authoritative game server (Node/TS).
#
# CONTRACT NOTE: apps/game-server is being built in parallel by another
# engineer. This Dockerfile is written to the planned contract (plan §1):
#   - pnpm workspace package @ggd/game-server at apps/game-server
#   - depends on @ggd/shared (packages/shared)
#   - `pnpm --filter @ggd/game-server build` emits dist/index.js
#   - listens on :2567 (Colyseus WS + private /_internal/matches admin route)
# Build context is the REPO ROOT: docker build -f docker/game.Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
# Workspace manifests first for layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/game-server/package.json apps/game-server/
RUN pnpm install --frozen-lockfile --filter "@ggd/game-server..."
COPY packages/shared/ packages/shared/
COPY apps/game-server/ apps/game-server/
RUN pnpm --filter "@ggd/game-server" build \
 && pnpm --filter "@ggd/game-server" deploy --prod /out

FROM node:22-alpine
# tini: PID-1 signal handling so Colyseus shuts down gracefully on SIGTERM.
RUN apk add --no-cache tini
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/ ./

# Secrets (PLATFORM_GAME_SHARED_SECRET, …) come from the environment only —
# never baked into the image (infra-09).
EXPOSE 2567
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
