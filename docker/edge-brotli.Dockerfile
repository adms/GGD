# docker/edge-brotli.Dockerfile — OPTIONAL edge image WITH brotli.
#
# ---------------------------------------------------------------------------
# WHY THIS FILE EXISTS: brotli is NOT a config line, it is an image change.
# ---------------------------------------------------------------------------
# The stock base image cannot do brotli, and no amount of nginx.conf editing
# changes that. Measured against nginxinc/nginx-unprivileged:alpine (nginx
# 1.31.3, Alpine 3.24.1):
#
#   nginx -V | grep -i brotli            → no match (not compiled in)
#   ls /usr/lib/nginx/modules            → 12 .so files: geoip, image_filter,
#                                          js, xslt (+ -debug). No brotli.
#   apk add nginx-mod-http-brotli        → ERROR: unable to select packages:
#                                          nginx-1.31.3-r1: breaks:
#                                          nginx-mod-http-brotli-1.30.4-r0
#                                          [nginx=1.30.4-r0]
#   nginx.org's own mainline alpine repo → 14 nginx-module-* packages
#                                          (acme, geoip, image-filter, njs,
#                                          otel, perl, xslt). Zero brotli.
#
# So the ONLY honest routes are (a) build ngx_brotli against this exact nginx
# version, which is what this file does, or (b) ship precompressed .br sidecars
# and admit brotli is off until the image changes. nginx/nginx.conf takes route
# (b) by default and stays truthful about it; this file is route (a).
#
# DO NOT try the try_files "brotli emulation" that looks like it works: it was
# built and tested during this change and it silently served RAW BROTLI BYTES
# labelled `application/octet-stream` with NO Content-Encoding header, because
# alias+try_files resolves internally without re-matching locations. That is
# corruption, not a fallback.
#
# ---------------------------------------------------------------------------
# WHAT IT BUYS (measured on this repo, brotli -q 11 vs gzip -9)
# ---------------------------------------------------------------------------
#   client entry chunk   2,653,924 B raw → 735,649 gzip-9 → 585,768 br-11  (-20.4 % vs gzip)
#   dragon2.glb          4,349,884 B raw → 2,571,813      → 2,202,172      (-14.4 %)
#   all 163 .glb        36,525,948 B raw → 19,518,292     → 17,660,572     (-9.5 %, -1.86 MB)
#   all 50 .wav          2,560,838 B raw →  1,877,542     →  1,597,594     (-14.9 %)
# Second-order next to gzip's first-order win, and it costs a from-source
# module build on every base-image bump. Decide with those numbers, not vibes.
#
# ---------------------------------------------------------------------------
# BUILD
#   docker build -f docker/edge.Dockerfile        -t ggd-edge:latest .
#   docker build -f docker/edge-brotli.Dockerfile -t ggd-edge:brotli .
# NGINX_VERSION MUST equal the base image's nginx exactly — a dynamic module is
# ABI-locked to its nginx version and the server refuses to start otherwise.
# Check after any base-image bump:
#   docker run --rm --entrypoint nginx nginxinc/nginx-unprivileged:alpine -v
# ---------------------------------------------------------------------------

ARG EDGE_IMAGE=ggd-edge:latest
ARG NGINX_VERSION=1.31.3
# ngx_brotli is pinned to a COMMIT, not to a moving branch. `--depth 1` on
# master means two builds a week apart can produce different binaries from the
# same Dockerfile, which is precisely the kind of drift an ABI-locked module
# must not have. Resolved 2026-07-23 from
# `git ls-remote https://github.com/google/ngx_brotli.git refs/heads/master`.
# Bump this deliberately, never implicitly.
ARG NGX_BROTLI_COMMIT=a71f9312c2deb28875acc7bacfdd5695a111aa53

FROM alpine:3.24 AS brotli-build
ARG NGINX_VERSION
ARG NGX_BROTLI_COMMIT
RUN apk add --no-cache build-base cmake git linux-headers \
        pcre2-dev zlib-dev openssl-dev
WORKDIR /build
# --recursive: ngx_brotli vendors the brotli library itself as a submodule, so
# the module does not depend on the runtime image having libbrotli.
# Pinned checkout (see NGX_BROTLI_COMMIT above): clone the branch, then move to
# the exact commit and init submodules AT that commit, so the vendored brotli
# revision is pinned too.
RUN git clone --recursive https://github.com/google/ngx_brotli.git \
    && cd ngx_brotli \
    && git checkout "${NGX_BROTLI_COMMIT}" \
    && git submodule update --init --recursive
RUN wget -qO- "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" | tar xz
# Build the VENDORED brotli static libs first. ngx_brotli's link line hardcodes
# `-L deps/brotli/c/../out -lbrotlienc -lbrotlicommon`, so without this the
# module link fails with `cannot find -lbrotlienc` even though the submodule was
# cloned. -DCMAKE_POSITION_INDEPENDENT_CODE=ON is required because the result is
# linked into a shared object.
RUN cmake -S /build/ngx_brotli/deps/brotli -B /build/ngx_brotli/deps/brotli/out \
        -DCMAKE_BUILD_TYPE=Release -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
    && cmake --build /build/ngx_brotli/deps/brotli/out --target brotlienc -j"$(nproc)"
# --with-compat is REQUIRED: it makes the module loadable by an nginx built with
# a different ./configure line (the base image's), which is exactly our case.
RUN cd "nginx-${NGINX_VERSION}" \
    && ./configure --with-compat --add-dynamic-module=/build/ngx_brotli \
    && make -j"$(nproc)" modules \
    && mkdir -p /out \
    && cp objs/ngx_http_brotli_filter_module.so objs/ngx_http_brotli_static_module.so /out/

FROM ${EDGE_IMAGE}
ARG NGINX_VERSION
COPY --from=brotli-build /out/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/
COPY --from=brotli-build /out/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/
# These two drop-ins are what activate the module. The base nginx.conf includes
# both globs and they match NOTHING in the stock image, which is why the same
# config is valid with and without brotli.
COPY nginx/brotli/modules/ /etc/nginx/ggd-modules/
COPY nginx/brotli/http/    /etc/nginx/ggd-brotli/

# ---- FAIL THE BUILD, NOT THE DEPLOY ----------------------------------------
# A dynamic module is ABI-locked to its nginx version. Without this check, a
# base-image bump still produces a green build and the container then dies at
# RUNTIME with `module ... is not binary compatible` — the failure lands on
# whoever deploys, hours after whoever broke it walked away. The header at the
# top of this file already said the lock is fatal; this is what enforces it.
#   1. the base image's nginx must be exactly ${NGINX_VERSION}
#   2. nginx -t must actually load both .so files through the ggd-modules glob
# `nginx -v` writes to stderr, hence the 2>&1.
RUN nginx -v 2>&1 | grep -qF "nginx/${NGINX_VERSION}" \
        || { echo "FATAL: base image nginx != ${NGINX_VERSION} (rebuild with a matching NGINX_VERSION)"; nginx -v; exit 1; } \
    && nginx -t
EXPOSE 8080
