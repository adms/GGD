# blizzard-local — Blizzard-owned assets, NOT in git, openly served where mounted

> **⛔ 這條規則被取消了一部分 —— 2026-08-19（GH#402），owner 親自裁決，分兩次。**
>
> > ①「請幫我**註記取消這個規則**，現在的線上已經是**雙重審查只給認識的親友玩了**，
> >   請**直接上架但註記來源就好 不要ignore**」
> >
> > ②「**既有 60 個 wc3.* 沒一起搬 => move**」
>
> 底下那句「do not commit them, do not bake them into an image」對**一組指名的檔案
> 不再適用**：**132 個原作技能／武器／特效音**已經搬進
> [`content/assets/audio/wc3/`](../audio/wc3/PROVENANCE.md) ——
> **進版控、正式站正常供應**，audio-map 的 key 是 `wc3.*`。
>
> ⚠️ **`ability-sfx/` 那 60 個已經不在這裡了。** 它們是裁決②搬走的那一批；
> 底下「Where the files actually live」那張圖裡的 `ability-sfx/` 一列**已經過期**。
> `wc3.*` 這些 key **名字一個字都沒改**，只有指到的路徑換了。
>
> ⭐ **授權是有條件的：「註記來源」。** 逐 clip 的來源封存檔 / 原始路徑 / sha256 記在
> 同目錄的 `PROVENANCE.md` 與 `PROVENANCE.json`，而且那是一條**會紅的閘**
> （`apps/client/src/render/views/blizzardOverlayGate.test.ts` 兩個方向都驗：
> 有檔沒列 → 紅，有列沒檔 → 紅，sha256 對不上 → 紅）。
>
> ### ⛔ 豁免的界線 —— 放行的是**音效**，⛔ 不是這個目錄
>
> owner 兩次點名的都是**技能／武器／特效音效**。⛔ **角色語音台詞不在裡面。**
>
> | 還在 `data/blizzard-overlay/` | 數量 | 狀態 |
> |---|---:|---|
> | `sounds/` **角色語音台詞** | **511** | ⛔ 維持原狀（#10 / #81 的範圍） |
> | `models/` 每單位 glb | 40 | ⛔ 維持原狀 |
> | 地圖作者自己 import 的 mp3（`kind: imported`） | — | ⛔ 維持原狀（出處不明） |
>
> ⛔ **不要把「owner 開放了音效」讀成「owner 開放了 `data/blizzard-overlay/`」。**
> 上表這些仍然是 git-ignored、不進映像、只靠 runtime mount，
> 下面整份文件描述的就是**它們**，逐字有效。

> **STATUS, 2026-07-26.** This file used to open with "COPYRIGHT GATE (LOCAL DEV
> ONLY)" and to say the assets must never be deployed. **Both halves of that are
> now out of date, and the honest statement is:**
>
> - **They are deployed.** #177 ships the 87 MB overlay to the family host,
>   where it is bind-mounted into the edge and served under this URL prefix.
> - **They are not access-controlled.** The per-peer copyright gate that used to
>   403 a `public` requester was retired on 2026-07-26 by explicit owner decision
>   (#239) — see `docs/copyright-content-gate.md`. Where the overlay is mounted,
>   anyone with the URL can fetch it. No session, cookie, invite code or approval
>   is checked on `/content/assets/**`, and never was.
>
> What is still true, and still enforced: **the bytes never enter git and are
> never baked into an image.** They travel only as an explicit runtime mount.
> That is a storage/redistribution rule, not an access rule, and the rest of this
> document describes it accurately.

This directory is the **URL mount point** for Warcraft III assets that are
**owned by Blizzard Entertainment**. They are extracted from the user's own
locally-installed MPQ archives (`war3.mpq`, `War3x.mpq`, `War3xLocal.mpq`,
`War3Patch.mpq` at the repo root). They are **not redistributable**: do not
commit them, do not bake them into an image, do not re-host them.

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

## How it is served (dev, and the family deploy)

Consumers fetch the stable URL path `/content/assets/blizzard-local/**`
(e.g. `/content/assets/blizzard-local/MANIFEST.json`). That path is backed by
`data/blizzard-overlay/` **only where something explicitly mounts it** — which
today means a developer machine, or the family deploy (#176/#177) that mounts
`nginx/tier/family/` and the byte store together. On a stack that does neither,
every URL here 404s. The dev routes are:

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

**A stack that does not opt in excludes the overlay by construction, not by
filter** (this is what makes "default off" real — it is about mounts, not about
who is asking):

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
