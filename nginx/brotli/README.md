# brotli at the GGD edge — status, and the exact image change

**Brotli is OFF in the shipped edge image, and `nginx/nginx.conf` does not
pretend otherwise.** This directory holds the two drop-in config files that
turn it on, and this file records what was measured and what it would cost.

## Why it is off

The base image physically cannot do it. Measured against
`nginxinc/nginx-unprivileged:alpine` (nginx **1.31.3**, Alpine **3.24.1**):

| probe | result |
| --- | --- |
| `nginx -V \| grep -i brotli` | no match — not compiled in |
| `ls /usr/lib/nginx/modules` | 12 `.so`: geoip, image_filter, js, xslt (+ `-debug`). No brotli. |
| `apk add nginx-mod-http-brotli` | `ERROR: unable to select packages: nginx-1.31.3-r1: breaks: nginx-mod-http-brotli-1.30.4-r0[nginx=1.30.4-r0]` |
| nginx.org mainline alpine repo | 14 `nginx-module-*` packages (acme, geoip, image-filter, njs, otel, perl, xslt). Zero brotli. |

`gzip_static`, by contrast, **is** compiled in (`--with-http_gzip_static_module`),
which is why the precompression half of this work ships today and works on the
stock image with no image change at all.

## What is wired up already

`nginx/nginx.conf` carries two `include` globs that match **nothing** in the
stock image, so the identical config file is valid with or without the module:

* main context — `include /etc/nginx/ggd-modules/*.conf;` → [`modules/brotli-load.conf`](modules/brotli-load.conf)
  (`load_module` is legal only in the main context, hence the separate file)
* http context — `include /etc/nginx/ggd-brotli/*.conf;` → [`http/brotli.conf`](http/brotli.conf)
  (`brotli_static on`, `brotli on`, level 5, the same type allow-list as `gzip_types`)

`nginx/precompress.sh` already emits `.br` sidecars next to every `.gz` one
whenever the `brotli` CLI is on PATH, and `docker/edge.Dockerfile` runs it over
the built SPAs. So the artifacts brotli would serve **already exist** — the
module is the only missing piece.

## The exact image change — built and verified, not just described

```sh
docker build -f docker/edge.Dockerfile        -t ggd-edge:latest .
docker build -f docker/edge-brotli.Dockerfile -t ggd-edge:brotli .
```

That image was **built and exercised live** while writing this. Evidence:

* `nginx -t` on the unmodified `nginx/nginx.conf` → `syntax is ok` on **both**
  the stock image and the brotli image — one config, two images.
* `ls /usr/lib/nginx/modules | grep brotli` → `ngx_http_brotli_filter_module.so`,
  `ngx_http_brotli_static_module.so`.
* `GET` of a 1,103,872 B champion `.glb` with `Accept-Encoding: br, gzip`
  → `Content-Encoding: br`, 316,059 B. (The file measured was
  `champions/knight.glb`, one of the four characters owner directive #226 has
  since deleted — the ratio is a property of glTF, not of that model.)
* The same request piped through `brotli -d` gives a SHA-256 identical to the
  source file — it decodes to the exact bytes, no corruption.
* A `gzip`-only client against the brotli image still gets 388,867 B of gzip, so
  the fallback path is intact.
* `.mp3` (20,524 B) and `.png` (7,531 B) came back with **no** `Content-Encoding`
  on both images — the exclusions hold.

One gotcha the build hit and this Dockerfile now handles: ngx_brotli's link line
hardcodes `-L deps/brotli/c/../out -lbrotlienc -lbrotlicommon`, so the vendored
brotli library must be cmake-built **before** `make modules`, or the link dies
with `cannot find -lbrotlienc` even though the submodule was cloned.

[`docker/edge-brotli.Dockerfile`](../../docker/edge-brotli.Dockerfile) adds one
`alpine:3.24` stage that clones `google/ngx_brotli --recursive`, downloads the
matching nginx source, and runs
`./configure --with-compat --add-dynamic-module=… && make modules`, then copies
the two `.so` files plus the two drop-ins above into the edge image.

**The version pin is load-bearing.** A dynamic module is ABI-locked to its nginx
version; `NGINX_VERSION` must equal the base image's nginx exactly or the server
refuses to start. Re-check on every base-image bump:

```sh
docker run --rm --entrypoint nginx nginxinc/nginx-unprivileged:alpine -v
```

## What it buys — measured, so the trade is decidable

brotli `-q 11` sidecars vs gzip `-9` sidecars, on this repo's own files:

| asset | raw | gzip -9 | brotli -11 | brotli's extra |
| --- | ---: | ---: | ---: | ---: |
| client entry chunk | 2,653,924 | 735,649 | 585,768 | −149,881 (−20.4 %) |
| `menu/dragon2.glb` | 4,349,884 | 2,571,813 | 2,202,172 | −369,641 (−14.4 %) |
| all 163 `.glb` | 36,525,948 | 19,518,292 | 17,660,572 | −1,857,720 (−9.5 %) |
| all 50 `.wav` | 2,560,838 | 1,877,542 | 1,597,594 | −279,948 (−14.9 %) |

All figures are a snapshot of 2026-07-23; the model set is actively being
re-optimised, so re-measure rather than quoting these forever. Brotli's gain is
real, and second-order next to gzip's first-order win (`.glb` alone: 36.5 MB →
19.5 MB, −46.6 %, from a starting point of *no compression at all*). The cost is a from-source module build on every base-image
bump. That is the whole trade.

## One thing not to do

A `try_files`-based "brotli emulation" — serving `file.br` from a `location`
that maps the `.br` extension — **looks** like it works and does not. It was
built and tested during this change: `GET /model.glb` with `Accept-Encoding: br`
returned `200`, `Content-Length: 946630`, `Content-Type: application/octet-stream`
and **no `Content-Encoding` header** — raw brotli bytes handed to the client
mislabelled as an octet stream. `alias` + `try_files` resolves internally
without re-matching locations, so the block meant to add the header never ran.
That is silent corruption, not a fallback.

## Third-party code redistributed by the brotli image

`docker/edge-brotli.Dockerfile` compiles and ships binaries built from two
third-party sources. Neither is an *asset*, so neither belongs in
`content/assets/CREDITS.md` (that ledger is for game assets and its
mandatory-attribution list stays at exactly one entry) — but the obligations
are real and are recorded here.

| component | source | licence | how it ships |
| --- | --- | --- | --- |
| `ngx_brotli` | `github.com/google/ngx_brotli`, pinned at `a71f9312c2deb28875acc7bacfdd5695a111aa53` | BSD-2-Clause | compiled into `ngx_http_brotli_{filter,static}_module.so` |
| `google/brotli` | vendored submodule `ngx_brotli/deps/brotli` | MIT | statically linked into the two `.so` files |

Both licences are permissive and require the copyright notice and licence text
to travel with binary redistribution. The build stage clones both repos, so the
`LICENSE` files are present at build time; if this image is ever published
outside the private deploy, copy them into the final stage
(`COPY --from=brotli-build /build/ngx_brotli/LICENSE ...`) so the notice ships
with the binary. The stock (non-brotli) image redistributes neither.
