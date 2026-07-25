# blizzard-local — COPYRIGHT GATE (LOCAL DEV ONLY)

This directory is the **URL mount point** for Warcraft III assets that are
**owned by Blizzard Entertainment**. They are extracted from the user's own
locally-installed MPQ archives (`war3.mpq`, `War3x.mpq`, `War3xLocal.mpq`,
`War3Patch.mpq` at the repo root) purely so local development can preview the
original unit models and soundsets. They are **NOT redistributable** and must
**NEVER be deployed, published, committed, or shipped in any build**.

The only exception: the handful of *user-reskin* textures (marked
`"textureSource": "user-reskin"` in the manifest) are the map author's own
repaints applied on top of Blizzard geometry — the geometry and everything else
remains Blizzard's.

## Where the files actually live

**Not here.** This directory deliberately contains only this README. The
extracted assets are written to:

```
data/blizzard-overlay/
├── MANIFEST.json   # merged unit index: {units: {unitId: {champId, glb,
│                   #   textureSource, soundset, clips{what/yes/attack/death/
│                   #   warcry/pissed/ready}, clipMap}}, generated: "task #10"}
├── models/         # 40 per-unit .glb conversions (w3x-import pipeline)
├── sounds/         # 511 soundset .wav clips (22050 Hz s16le PCM)
├── ability-sfx/    # 60 per-ability stock cast clips + MANIFEST.json (the
│                   #   task-#78 音效 port; tools/w3x-import/extract_stock_sfx.py;
│                   #   referenced by the audio map's wc3.* keys, which combatSfx
│                   #   honours only on full-asset builds — config/fullAssets)
└── batches/        # per-batch extraction reports (provenance)
```

`data/` is the runtime durable store: it is git-ignored (`/data/**` in
`.gitignore`), never part of any Docker build context COPY, and never baked
into any image.

## How dev serves it (and why prod cannot)

Consumers fetch the stable URL path `/content/assets/blizzard-local/**`
(e.g. `/content/assets/blizzard-local/MANIFEST.json`). That path is backed by
`data/blizzard-overlay/` **only via dev-only routes**:

1. **Vite dev/preview server** — the `serveBlizzardOverlay()` middleware in
   `apps/client/vite.config.ts` maps `/content/assets/blizzard-local/*` →
   `data/blizzard-overlay/*` (alongside the existing `/content` handler).
   This only exists while running `pnpm --filter client dev|preview` on a
   developer machine.
2. **Dev nginx include (optional)** — `nginx/dev/blizzard-overlay.conf` adds
   the same mapping (`alias /srv/blizzard-overlay/`) for developers who run the
   client through the edge container. It is picked up ONLY by the base config's
   `include /etc/nginx/ggd-dev/*.conf;` glob, and it needs a second, explicit
   read-only bind mount of `data/blizzard-overlay` → `/srv/blizzard-overlay`
   (see the runnable `docker run` line in that file's header). Neither mount
   exists in any prod path: `docker/edge.Dockerfile` never COPYs `nginx/dev/`,
   the chart's dev ConfigMap ships only `content-api.conf`, and this file is
   deliberately NOT synced into `deploy/helm/ggd/files/` by
   `make helm-sync-nginx`. Without both mounts every URL here 404s.

**Prod exclusion is by construction, not by filter:**

- Prod nginx (`nginx/nginx.conf`, mirrored in
  `deploy/helm/ggd/files/nginx.conf`) serves `/content/` from `/srv/content`,
  which is a read-only mount of the repo `content/` directory — where this
  README is the only file under `assets/blizzard-local/`.
- No Dockerfile (`docker/*.Dockerfile`) ever COPYs `data/`; no compose/Helm
  volume mounts `data/` into the edge.
- The client bundle (`vite build`) contains no assets from `content/` at all —
  it fetches them at runtime, and in prod the overlay URLs simply 404.
- Both overlay consumers probe the manifest on DEV builds only
  (`import.meta.env.DEV`) and degrade gracefully on a 404: the champion voice
  fallback (`apps/client/src/audio/championVoice.ts`) stays silent, and the
  model overlay resolver (`apps/client/src/render/views/blizzardOverlay.ts`)
  returns the champion's shipped stand-in model — i.e. exactly what rendered
  before the overlay existed (procedural voxel figure first, KayKit stand-in
  once ContentDb resolves).

**Verified, not just asserted:** `apps/client/src/render/views/
blizzardOverlayGate.test.ts` re-checks every bullet above against the real
files (content/ holds only this README, `/data/**` is git-ignored, no
Dockerfile COPYs `data/`, prod nginx + its Helm copy contain no overlay route,
the vite mapping is dev/preview-server-only with no bundle-copy hook), and
`blizzardOverlay.test.ts` covers the resolver with the overlay present AND
absent.

## Rules

- Do NOT move the extracted files back under `content/` (it is committed and
  baked into prod serving).
- Do NOT run `pnpm content:build` against the overlay — it stays OUTSIDE the
  indexed content collections on purpose.
- Do NOT re-host, upload, or share `data/blizzard-overlay/` in any form.
- Deleting `data/blizzard-overlay/` is always safe: every consumer treats the
  overlay as optional and falls back to shipped/procedural behavior.
