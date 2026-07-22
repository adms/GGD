# docker/edge.Dockerfile — Nginx edge: reverse proxy + client/editor static.
#
# CONTRACT NOTE: apps/client, apps/editor and apps/admin are built in parallel
# by other engineers. This Dockerfile is written to the planned contract:
#   - pnpm workspace packages @ggd/client / @ggd/editor / @ggd/admin
#   - `pnpm --filter <pkg> build` emits apps/client/dist, apps/editor/dist and
#     apps/admin/dist (Vite defaults; editor base=/editor/, admin base=/admin/)
# Build context is the REPO ROOT: docker build -f docker/edge.Dockerfile .
#
# Game content is NOT baked in: /srv/content is a read-only mount
# (kind hostPath / PVC / compose bind — see deploy/ and docker/compose.yaml).

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
COPY apps/editor/package.json apps/editor/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile --filter "@ggd/client..." --filter "@ggd/editor..." --filter "@ggd/admin..."
COPY packages/shared/ packages/shared/
COPY apps/client/ apps/client/
COPY apps/editor/ apps/editor/
COPY apps/admin/ apps/admin/
RUN pnpm --filter "@ggd/client" build && pnpm --filter "@ggd/editor" build && pnpm --filter "@ggd/admin" build

# Unprivileged nginx: uid 101, listens 8080, pid/temp under /tmp.
FROM nginxinc/nginx-unprivileged:alpine
# Our full config replaces the stock one (source of truth: nginx/nginx.conf).
COPY nginx/nginx.conf /etc/nginx/nginx.conf
# NOTE: nginx/dev/content-api.conf is deliberately NOT copied — the dev-only
# /content-api/ route is mounted at /etc/nginx/ggd-dev/ by the Helm chart only
# when dev.enabled=true (infra-05).
COPY --from=build /repo/apps/client/dist/ /usr/share/nginx/html/client/
COPY --from=build /repo/apps/editor/dist/ /usr/share/nginx/html/editor/
COPY --from=build /repo/apps/admin/dist/ /usr/share/nginx/html/admin/
# NOTE: the admin console is an operator tool. It is baked here for same-origin
# convenience but SHOULD be IP-allowlisted / basic-auth protected in real prod
# (see the /admin/ location + /etc/nginx/ggd-admin include in nginx/nginx.conf).
EXPOSE 8080
