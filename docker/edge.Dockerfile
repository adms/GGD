# docker/edge.Dockerfile — Nginx edge: reverse proxy + client/admin static.
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
#
# ---------------------------------------------------------------------------
# THE EDITOR IS NOT IN THIS IMAGE BY DEFAULT (task #241)
# ---------------------------------------------------------------------------
# apps/editor is a CONTENT-AUTHORING surface. It used to be built and COPYd here
# unconditionally, and nginx served it at `/editor/` as plain static with no
# authentication of any kind — so on ggd.adms.ai anyone who typed the URL got
# the authoring console: the collection list, the schema-derived forms for every
# champion / ability / item, the 鑄技工坊 template gallery, the 3D model and VFX
# inspectors and the AI-icon / AI-fill controls.
#
# It was not a WRITE hole — apps/editor/src/api/client.ts dead-folds
# WRITES_ENABLED to false in a `vite build`, and `/content-api/` is deliberately
# absent from the production nginx (see nginx/dev/content-api.conf) — so the
# save buttons could not have worked. Which is the point: the surface was
# 100% non-functional in production and 100% visible. Shipping it bought
# nothing and exposed the whole internal content model.
#
# THE FIX IS EXPOSURE, NOT AN ENVIRONMENT GATE. It is deliberately NOT a
# $remote_addr rule: the owner retired that approach on 2026-07-26 (#239), and
# it would be wrong here anyway because this edge sits behind Caddy, so
# $remote_addr is the proxy. The route is instead simply absent, exactly like
# `/content-api/` — the surface a deploy does not contain cannot be reached,
# authenticated or otherwise.
#
# Local authoring is unaffected: `pnpm dev:editor` runs vite on 127.0.0.1:5174
# with its own /content-api proxy. To build an image WITH the editor (a dev or
# LAN box that also mounts nginx/dev/ for the `/editor/` location):
#
#     docker build -f docker/edge.Dockerfile --build-arg GGD_INCLUDE_EDITOR=1 .
#
# Both halves are required — the files without the nginx location, or the
# location without the files, serves nothing. That is intentional.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
# tsconfig.base.json is REQUIRED at build time, not merely nice to have: every
# app tsconfig starts with `"extends": "../../tsconfig.base.json"`, and without
# it `pnpm --filter @ggd/client build` dies with
#   [vite:esbuild] failed to resolve "extends":"../../tsconfig.base.json"
# — i.e. `docker compose build edge` FAILED OUTRIGHT before #176. Measured, not
# theorised: that is the error this line fixes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
COPY apps/editor/package.json apps/editor/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile --filter "@ggd/client..." --filter "@ggd/editor..." --filter "@ggd/admin..."
COPY packages/shared/ packages/shared/
COPY apps/client/ apps/client/
COPY apps/editor/ apps/editor/
COPY apps/admin/ apps/admin/
# ---- ⛔ 唯一一份被 **build 進來** 的 content/ 檔（GH#437）--------------------
# `content/` 是 live bind-mount，⛔ 刻意不進映像 —— 上面四行只 COPY 程式碼。
# 但 `blizzardVfxCredits.ts` 是**靜態 import** 這一份出處帳本的（設計如此：
# 「THE ROWS ARE IMPORTED, NEVER TRANSCRIBED」，這樣 clip 不可能沒有它的列），
# 而靜態 import 發生在 **build 時**，於是它非在建置脈絡裡不可。
#
# ⚠️ 這一行與 `apps/client/src/**` 的跨界 import **必須成對**，否則 build 死在
# rollup 的 "Could not resolve" —— 而那個紅燈**只在正式建置時**出現：
# 本機 `vite build` 看得到整棵樹，所以本機永遠是綠的（2026-08-19 就是這樣上線失敗的）。
# 閘：`packages/shared/src/ops/clientContentImports.test.ts` 逐一比對兩邊。
# ⛔ 想再加一份之前先問：它是不是該用 `contentAssetUrl` 在**執行期**抓？
COPY content/assets/audio/wc3/PROVENANCE.json content/assets/audio/wc3/
# ---- THE FULL-ASSET BUILD FLAG (task #176) ---------------------------------
# apps/client/src/config/fullAssets.ts reads VITE_GGD_FULL_ASSETS and falls back
# to import.meta.env.DEV, which is constant-folded to `false` in every
# `vite build` output. Unset (the default here) the produced bundle NEVER ASKS
# for the local-only overlay — mounting the 84 MB and opening the nginx location
# would still show generic stand-ins for 40 of 113 champions.
# docker/compose.family.yaml passes VITE_GGD_FULL_ASSETS=1 so the family image
# actually issues the request. Read that file's header before changing this.
ARG VITE_GGD_FULL_ASSETS=""
ENV VITE_GGD_FULL_ASSETS=$VITE_GGD_FULL_ASSETS
# ---- THE BUILD STAMP (task #66, defect P0-6(a)) ------------------------------
# THIS IMAGE CANNOT COMPUTE ITS OWN VERSION, and that is not fixable here:
#   • .dockerignore excludes `.git` (deliberately — it is 116 MB of context);
#   • node:22-alpine above has no git binary.
# apps/client/dev/buildStamp.ts therefore asked git, caught the failure and
# baked the plausible-looking literal "dev" into EVERY image ever built. The
# badge on ggd.adms.ai read `dev`, two different images were indistinguishable,
# and the playtest→fix→deploy loop had no way to answer "which build is this?".
#
# So the HOST computes the stamp and passes it in. Every build path does this —
# docker/compose.yaml, docker/compose.family.yaml, skaffold.yaml and the
# Makefile's GGD_BUILD_STAMP — and a guard test
# (tools/testrunner/internal/infracheck/buildstamp_test.go) fails CI if one of
# them stops. Unset, the client build prints a loud banner and the badge reads
# UNSTAMPED-BUILD: visibly broken beats plausibly wrong.
ARG GGD_BUILD_STAMP=""
ENV GGD_BUILD_STAMP=$GGD_BUILD_STAMP
# ---- THE EDITOR OPT-IN (task #241) -----------------------------------------
# Default OFF. See the header. `/dist-out/editor` is created either way so the
# final stage's COPY has a source in both configurations — an image built
# without the opt-in gets an EMPTY directory there, which is the whole point.
ARG GGD_INCLUDE_EDITOR="0"
ENV GGD_INCLUDE_EDITOR=$GGD_INCLUDE_EDITOR
RUN echo "edge build: VITE_GGD_FULL_ASSETS='${VITE_GGD_FULL_ASSETS}' GGD_BUILD_STAMP='${GGD_BUILD_STAMP}' GGD_INCLUDE_EDITOR='${GGD_INCLUDE_EDITOR}'" \
 && if [ -z "${GGD_BUILD_STAMP}" ]; then \
      echo "!! WARNING: no GGD_BUILD_STAMP build arg — this image will ship an UNSTAMPED-BUILD badge." >&2; \
      echo "!!          pass --build-arg GGD_BUILD_STAMP=\"\$(git rev-parse --short HEAD) \$(date -u +%F)\"" >&2; \
    fi \
 && pnpm --filter "@ggd/client" build && pnpm --filter "@ggd/admin" build \
 && mkdir -p /dist-out/editor \
 && if [ "${GGD_INCLUDE_EDITOR}" = "1" ]; then \
      echo "edge build: INCLUDING the content editor at /editor/ — this image must NOT be deployed publicly." >&2; \
      pnpm --filter "@ggd/editor" build && cp -a apps/editor/dist/. /dist-out/editor/; \
    else \
      echo "edge build: content editor OMITTED (task #241). Pass --build-arg GGD_INCLUDE_EDITOR=1 for a dev image." >&2; \
    fi

# ---- precompress the SPA bundles -------------------------------------------
# nginx serves these with `gzip_static on` (and `brotli_static on` in the
# brotli image, docker/edge-brotli.Dockerfile), so a request costs ZERO
# compression CPU and gets a better ratio than the runtime gzip_comp_level 5:
# the client entry chunk goes 2,653,924 B raw → 745,023 at runtime gzip -5 →
# 735,649 at gzip -9 → 585,768 at brotli -11. The .br sidecars are emitted
# unconditionally; without the module they are simply never read, which is what
# makes switching to the brotli image a one-step change.
#
# NOT DONE HERE: /srv/content. Game content is a read-only runtime mount, never
# baked into this image, so its sidecars must be produced by whatever pipeline
# publishes content/ — run nginx/precompress.sh there.
COPY nginx/precompress.sh nginx/
RUN apk add --no-cache brotli \
    && sh nginx/precompress.sh \
        /repo/apps/client/dist /dist-out/editor /repo/apps/admin/dist

# Unprivileged nginx: uid 101, listens 8080, pid/temp under /tmp.
FROM nginxinc/nginx-unprivileged:alpine
# Our full config replaces the stock one (source of truth: nginx/nginx.conf).
COPY nginx/nginx.conf /etc/nginx/nginx.conf
# NOTE: nginx/dev/content-api.conf is deliberately NOT copied — the dev-only
# /content-api/ route is mounted at /etc/nginx/ggd-dev/ by the Helm chart only
# when dev.enabled=true (infra-05).
COPY --from=build /repo/apps/client/dist/ /usr/share/nginx/html/client/
# The CONTENT EDITOR (task #241). This copies /dist-out/editor, which the build
# stage leaves EMPTY unless --build-arg GGD_INCLUDE_EDITOR=1 was passed — so the
# default image contains no editor bundle at all. Do not point this back at
# /repo/apps/editor/dist: that would bake the authoring console into every
# image again regardless of the flag, which is the whole defect.
COPY --from=build /dist-out/editor/ /usr/share/nginx/html/editor/
COPY --from=build /repo/apps/admin/dist/ /usr/share/nginx/html/admin/
# ---- full-asset boot assertion (task #176) ---------------------------------
# The official nginx entrypoint runs /docker-entrypoint.d/*.sh under `set -e`
# before starting nginx, so a non-zero exit here keeps the server DOWN. The
# script is a no-op unless /etc/nginx/ggd-tier/00-full-assets.geo.conf is
# mounted (i.e. unless this deploy declared itself full-asset), so the gated
# image is byte-for-byte unaffected in behaviour.
COPY tools/deploy/ggd-assets.sh /usr/local/bin/ggd-assets.sh
COPY docker/edge-entrypoint.d/20-ggd-assert-full-assets.sh /docker-entrypoint.d/20-ggd-assert-full-assets.sh
USER root
RUN chmod +x /usr/local/bin/ggd-assets.sh /docker-entrypoint.d/20-ggd-assert-full-assets.sh
USER 101
# NOTE: the admin console is an operator tool. It is baked here for same-origin
# convenience but SHOULD be IP-allowlisted / basic-auth protected in real prod
# (see the /admin/ location + /etc/nginx/ggd-admin include in nginx/nginx.conf).
EXPOSE 8080
