# Private work entry of the existing Main importer. No Editor CRUD is mounted.
FROM node:22-alpine AS build
RUN apk add --no-cache git && corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/content-api/package.json apps/content-api/
RUN pnpm install --frozen-lockfile --filter "@ggd/content-api..."
COPY packages/shared/ packages/shared/
COPY apps/content-api/ apps/content-api/
COPY docs/editor-contract/ggd-presentation-token-manifest.json docs/editor-contract/

FROM node:22-alpine
RUN apk add --no-cache tini libwebp-tools && cwebp -version > /dev/null \
 && mkdir -p /data && chown node:node /data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8788 GGD_CONTENT_DIR=/srv/content GGD_HERO_IMPORT_DIR=/data/content-import
COPY --from=build /repo/ /repo/
WORKDIR /repo/apps/content-api
EXPOSE 8788
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/tsx", "src/heroImportIndex.ts"]
