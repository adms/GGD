# docker/content-api.Dockerfile — DEV-ONLY Fastify content CRUD/validate/SSE.
#
# CONTRACT NOTE: apps/content-api is being built in parallel by another
# engineer. Written to the planned contract (plan §2):
#   - pnpm workspace package @ggd/content-api at apps/content-api
#   - `pnpm --filter @ggd/content-api build` emits dist/index.js
#   - listens on :8787; refuses to boot when APP_ENV=production
#   - mounts the content store RW at /srv/content (CONTENT_DIR)
# This image is NEVER deployed in the prod profile (Helm gates it behind
# dev.enabled; the edge route only exists in dev — infra-05).
# Build context is the REPO ROOT: docker build -f docker/content-api.Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/content-api/package.json apps/content-api/
RUN pnpm install --frozen-lockfile --filter "@ggd/content-api..."
COPY packages/shared/ packages/shared/
COPY apps/content-api/ apps/content-api/
RUN pnpm --filter "@ggd/content-api" build \
 && pnpm --filter "@ggd/content-api" deploy --prod /out

FROM node:22-alpine
# ⭐ GH#967 —— `cwebp` 必須住在 **runtime stage**（⛔ 不是 build stage）。
#   `libwebp-tools` 是 Alpine 上 `cwebp` 的來源（⛔ 不是 `webp`／`cwebp`）。
#   ⚠️ 裝在 build stage 等於沒裝：`COPY --from=build /out/` 只搬 node_modules，
#      症狀一模一樣（build 過、跑起來 ENOENT）。
#   ⭐ `cwebp -version` 是**會回非零**的自證（CLAUDE.md：選 fail-open 就要有東西喊）——
#      套件改名／被拿掉 ⇒ **build 當場紅**，⛔ 不是等到第一次轉檔才靜默失敗。
RUN apk add --no-cache tini libwebp-tools \
 && cwebp -version > /dev/null
ENV NODE_ENV=development \
    CONTENT_DIR=/srv/content
WORKDIR /app
COPY --from=build /out/ ./
EXPOSE 8787
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
