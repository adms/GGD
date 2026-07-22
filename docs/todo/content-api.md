# Content API (dev-only Fastify) — TODO

`apps/content-api`, Fastify :8787. Validated CRUD over `content/` (same Zod schemas as
the game loader), atomic writes, incremental reindex, SSE change events. Refuses
production. The write-validation and traversal items live in
[content-pipeline.md](content-pipeline.md) (content-08 / content-09).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| capi-01 | GET manifest / _index / object endpoints | content-api-get-endpoints | integration | done |
| capi-02 | POST create rejects duplicate id with 409 | content-api-create-conflict | integration | done |
| capi-03 | DELETE removes doc + incremental reindex | content-api-delete-reindex | integration | done |
| capi-04 | Dry-run validate returns field errors, writes nothing | content-api-dry-validate | integration | done |
| capi-05 | Refuses to boot when NODE_ENV=production | content-api-prod-refusal | security | done |
| capi-06 | SSE hub streams content:changed on writes | content-api-sse-events | integration | done |
| capi-07 | chokidar watcher publishes external file edits | content-api-watch-external | integration | pending |
| capi-08 | PUT /content-api/assets/* writes an image binary (base64 / data-url) atomically, path-confined to content/assets, image-ext restricted — backs the editor AI-icon Accept flow | content-api-asset-write | integration | done |
| capi-09 | DEV-WRITE GUARD: every mutating verb (PUT/POST/DELETE, /validate, asset PUT) requires a loopback PEER read off the socket AND a local dev Origin; forwarded headers (X-Forwarded-For / X-Real-IP) are never consulted, so a LAN client cannot forge either; GETs stay open; production and a non-loopback bind HOST are refused | content-api-dev-write-guard | security | done |
| capi-10 | UNDO STORE (there is no VCS — task #65): every overwrite and DELETE first snapshots the bytes on disk into the git-ignored store outside content/; /backups lists them newest-first; /restore puts one back (and snapshots the pre-restore state, so undo is undoable); a snapshot that no longer passes the live schemas is refused; only this module's own filenames are readable | content-api-undo-store | regression | done |

---

## Write authorisation + undo (task #96)

`guard.ts` installs an `onRequest` hook that refuses every MUTATING verb unless
the PEER is loopback — read off `req.raw.socket.remoteAddress`, never
`X-Forwarded-For` / `X-Real-IP` / `req.ip`, because those are written by whoever
is calling. GETs stay open (content is not secret, and the codex must stay
readable from a phone). When a browser sends an `Origin` it must be a known
loopback dev console; an absent `Origin` is allowed only because the peer check
has already restricted the caller to a local process (curl, vitest). `index.ts`
additionally refuses to bind a non-loopback `HOST`, and `buildServer` still
throws on `NODE_ENV=production` — four independent refusals, no escape hatch.

Two consequences worth writing down rather than working around:

- **Behind the dev nginx** (`docker compose --profile dev`) the peer is the
  container bridge address, so writes through that route 403. Reads are fine.
  The supported authoring flow is `pnpm dev:editor` on the host. Adding a
  trusted-proxy CIDR would be a hole with a comment on it.
- **A proxy hop launders the peer.** Only servers that cannot be reached from
  the LAN may proxy `/content-api`; the game client's dev server, which is
  published with `--host`, does not (task #102).

`backup.ts` is the undo store this repo needs while task #65 is open. Every
overwrite and every DELETE first copies the bytes already on disk to
`<data>/content-backups/<collection>/<id>/<timestamp>.json` — the file bytes,
not the document the client sent, so hand-edits are captured too. `GET
…/:id/backups` lists them newest-first; `POST …/:id/restore` puts one back (with
no `file`, the most recent), snapshots the pre-restore state so undo is itself
undoable, and refuses a snapshot that no longer passes the live schemas. The
store lives OUTSIDE `content/` (the git-ignored `data/`), so backups never enter
the deployable tree, an image, or the index/manifest rebuild.
| capi-09 | The write guard's decision takes no forwarded header as input, and the proxy-laundering case is written down as a test rather than a comment: a laundered peer looks loopback, the origin allowlist cannot close it (curl sends no Origin), therefore the route is removed from the LAN-published server rather than guarded on it | content-api-dev-write-guard | security | done |
