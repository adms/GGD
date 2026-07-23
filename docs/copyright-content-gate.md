# Environment-tier content gate (copyright / single-player) — task #127

**Policy in one line:** a request from **loopback or LAN** (a phone on the same
wifi) may be served the copyright-restricted and single-player content; a
request from a genuinely **public / outward-facing** host must **not** be.

This is the "environment TIER" #127 asks for. It replaces the earlier partial
story (blizzard-local was dev-only by construction, but the imported champion
GLBs — which live inside the deployable `content/` tree — were served by prod
nginx to anyone).

## The three tiers

One authoritative classifier, from the request's **socket peer address**:

| Tier | Peer | Restricted content |
| --- | --- | --- |
| `loopback` | `::1`, `127.0.0.0/8`, `localhost` / `*.localhost` names | **served** |
| `lan` | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, IPv6 ULA `fc00::/7`, IPv6 link-local `fe80::/10`, `*.local` mDNS | **served** |
| `public` | anything else — **including an unknown/garbled address** | **DENIED (403/404)** |

**Fail-safe direction:** an address we cannot positively place in `loopback` or
`lan` is `public`, and `public` is denied. Better to refuse a legitimate viewer
than to leak Blizzard-/anime-owned assets to the open internet.

**Address only, never a forwarded header.** The classifier reads the socket peer
(`req.socket.remoteAddress` in vite, `$remote_addr` in nginx) — never
`X-Forwarded-For` / `X-Real-IP`, which the caller writes and can forge. This is
the same doctrine as `apps/content-api/src/guard.ts` and the platform's
`devsurface_test.go`.

## What is gated (the restricted URL mounts)

| URL prefix | What it is | Where it lives |
| --- | --- | --- |
| `/content/assets/models/imported/**` | imported / anime champion GLBs (129 models) | inside `content/` (deployable) |
| `/content/assets/blizzard-local/**` | Blizzard WC3 model/soundset overlay | `data/blizzard-overlay/` (git-ignored, dev-only) |
| single-player / offline entry | the offline match flow (`GameApp` offline path) | client app; see "Single-player" below |

Everything else under `/content/` (champion JSON, non-imported models, icons,
audio, `manifest.json`, `_index.json`) is **not** gated and is served to all
tiers exactly as before.

## Where the gate is enforced

The **content-serving layer is authoritative** (the platform serves no
copyright-restricted content itself):

1. **Vite dev/preview middleware** — `apps/client/vite.config.ts`,
   `copyrightTierGate()`. This is the server the user publishes to the wifi
   (`client-lan --host 0.0.0.0`), so it is the one that actually faces other
   devices. It classifies the socket peer and returns a terminal `403` to a
   public peer for the two restricted mounts; loopback + LAN fall through to the
   normal static handlers. Registered **before** `serveBlizzardOverlay` /
   `serveContent` so it decides first. Does **not** touch the `/content-api`
   tripwire.

2. **Nginx edge** — `nginx/nginx.conf` (source of truth; `make helm-sync-nginx`
   copies it to `deploy/helm/ggd/files/nginx.conf`). A `geo $ggd_env_tier`
   block classifies `$remote_addr` into the three tiers (CIDR-native), a `map`
   turns `public` into `$ggd_deny_copyright = 1`, and:
   - `location ^~ /content/assets/models/imported/` returns `403` when
     `$ggd_deny_copyright` (else serves from `/srv` with the normal cache rule);
   - `nginx/dev/blizzard-overlay.conf` carries the same
     `if ($ggd_deny_copyright) { return 403; }` guard.

   Both the vite util and the nginx `geo` block express the **same table**
   (`packages/shared/src/envTier.ts`) — two independent implementations so
   neither is the single point of failure.

3. **Shared classifier** — `packages/shared/src/envTier.ts`
   (`classifyEnvTier`, `mayServeRestrictedContent`, `isPublicPeer`), imported by
   vite as `@ggd/shared/envTier`, table-tested in `envTier.test.ts` (46 cases).

4. **Platform deploy tier** — `apps/platform/internal/config/config.go`. The Go
   platform declares its serving tier via **`GGD_DEPLOY_TIER`** (`public` |
   `private`), **defaulting to `public`** so an outward deploy denies by
   omission. It is logged at boot (`deployTier` on the "platform listening"
   line). This is informational/operator-facing — the actual byte-serving gate
   is layers 1 and 2.

## The LAN allow (do not break it)

A phone on the wifi must keep working. Verified end-to-end:

- vite, loopback peer `curl http://127.0.0.1:PORT/content/assets/models/imported/azunyan.glb` → **200**
- vite, LAN peer `curl http://192.168.0.106:PORT/…azunyan.glb` → **200**
- nginx, `$remote_addr` in `10./172.16-31./192.168./169.254.` → **200**
- nginx, a routable/global address (e.g. `203.0.113.7`, `8.8.8.8`) → **403**

## Load-balancer caveat (important for a real cloud deploy)

`$remote_addr` / `req.socket.remoteAddress` is the **immediate** peer. Front the
edge with a cloud load-balancer and that becomes the LB's address (often a
`10./172.` private range → classified `lan`), so the per-request gate would
serve. Therefore a genuine public cloud deploy must ALSO exclude the restricted
assets from the image — which is already true for `blizzard-local` by
construction (`nginx/dev/*` is never `COPY`d into the prod edge image, and
`data/` is never mounted) and is the recommended treatment for
`content/assets/models/imported/` in a public build. The per-request gate is
**exact** when nginx (or the vite dev server) is itself the internet-facing hop
— i.e. the docker / LAN edge, which is precisely the deploy shape #127 targets.

## Environment variable

| Var | Values | Default | Effect |
| --- | --- | --- | --- |
| `GGD_DEPLOY_TIER` | `private` \| `loopback` \| `lan` → private; anything else → `public` | `public` | Platform's declared tier, logged at boot. A friends-only LAN deploy sets `GGD_DEPLOY_TIER=private` (alongside `GGD_REQUIRE_APPROVAL=1`). |

## Single-player / offline

The offline / single-player match flow is a **client-side path** (`GameApp`
offline mode); it is not a separately-served URL, so there is no distinct file
to 403. Its availability is governed by the declared deploy tier: a `public`
deploy is multiplayer-only by policy. Hiding the offline entry in the client UI
for a public tier is a follow-up owned by the client UI layer (out of scope for
this change, which owns the serving layer + config only).

## Verification summary

- `packages/shared/src/envTier.test.ts` — 46-case table, all tiers incl. the
  public-deny decision (`pnpm --filter @ggd/shared test`).
- Vite dev server starts; loopback + LAN serve the imported models (200); the
  `/content-api` tripwire still 404s.
- Nginx `geo`/`map`/`if` validate (`nginx -t`) and, driven by a test peer,
  serve loopback/LAN (200) and refuse public (403).
- `apps/platform` builds; `internal/server` + config tests green (the
  address-trust guard in `devsurface_test.go` is untouched and still passes).
