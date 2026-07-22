# 內容圖鑑 Content codex (live item / champion / ability browser) — TODO

One page in the CLIENT app listing **every** shipped item, champion and ability with full
detail and cross-links, plus a supplementary broken-data table. Reachable from the lobby
header (📖 圖鑑), the in-match pause menu, and directly at `#codex`
(e.g. `http://localhost:39527/#codex` — no login, no match).

**THE LOAD-BEARING REQUIREMENT is 「動態即時非寫死」 — LIVE, NOT BAKED.** The page reads the real
content tree over HTTP at runtime (`/content/<collection>/_index.json` → each doc), the same
mount the game boots from. Edit a JSON under `content/`, press 重新載入, see the change. No
generated snapshot, no hardcoded copy, no duplicated description strings — enforced by a source
gate (`codex-no-baked-content`) *and* by a runtime test that mutates the served tree between two
loads (`codex-live-reload`).

**Shape:**
- `apps/client/src/ui/codex/codexData.ts` — the live loader + tolerant normalisers (no zod: the
  codex must be able to LOAD broken data in order to report it). Hero 編號 comes from the shared
  identity rule (`@ggd/shared/content/championIdentity`), never re-derived here; champion names
  split on the WC3 「稱號 - 全名」 convention.
- `apps/client/src/ui/codex/codexSearch.ts` — search / filters / facet counts / ordering by hero
  編號 / the fixed-row-height window math that keeps 879 rows cheap.
- `apps/client/src/ui/codex/codexRecipes.ts` — item↔item relations. Uses an authored recipe field
  when task #70 lands; until then parses the w3x 「合成配方」 tooltip block, keeping unresolvable
  component names instead of dropping them.
- `@ggd/shared/codex/codexIcons` — SHA-256 over the icon BYTES (the only evidence for
  the mis-assigned art), run as a background pass that never blocks browsing.
- `@ggd/shared/codex/codexCoverage` + `useIconCoverage.ts` + `IconCoverageBar.tsx` —
  圖示覆蓋率, the live icon-generation progress bar (task #97). Sits at the TOP of the page:
  covered / needed per kind, derived from the same fetched docs, never from a constant. Polls
  every 8s — the three `_index.json` files plus task #72's plan — then re-reads only the
  documents whose index hash moved, so a generation run is visible without a page reload.
  DROPPED / BLOCKED come from task #72's `content/config/icon-plan.json` read through #72's own
  `@ggd/shared/codex/codexPlan`; nothing anywhere holds a second definition of "excluded". Dropped leaves the
  denominator, blocked stays in it as its own band, the rest is backlog. With no plan on disk
  every gap counts as work and the bar says so, and the local 空說明/名稱=ID guess is an opt-in,
  separately-labelled what-if. The plan's self-reported totals are printed beside the page's own
  measurement, so a stale plan is visible rather than silently applied.
- `apps/client/src/ui/codex/codexIssues.ts` — the broken-data report, grouped by issue type with
  a count per group. Rendered as a SEPARATE table at the very bottom per the user's ruling
  (2026-07-22): the three browse sections stay clean, no per-row warning badges.
- `apps/client/src/ui/codex/CodexPage.tsx` / `CodexDetail.tsx` / `CodexIssueTable.tsx` /
  `CodexIcon.tsx` / `CodexRoute.tsx` — the view. Reuses the cursor-safe `<Tooltip>` and
  `stripAbilityNumber` (task #21), `iconSrc`/`<IconImg>` (task #33), `ui/theme` and the task #24
  `<Btn>` skin. `contentVersion` is shown in the header so a screenshot is self-identifying.

**Where the pure half lives.** The measurement modules — `codexCoverage`, `codexPlan`,
`codexIcons` and the shared `codexTypes` — sit in `packages/shared/src/codex/`, not under
`ui/codex/`, because 後台管理's ICON 生成追蹤 counts from the same code (task #102) and a second
implementation of "how many icons are missing" is exactly what must never exist. They are pure
(no React, no clock; `codexPlan`/`codexIcons` do read-only GETs), and the `codex-no-baked-content`
gate scans BOTH directories so nothing escaped the liveness rules by moving.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| codex-01 | Loads every collection from the live `/content` mount (index → each doc), reporting contentVersion and manifest-vs-loaded counts | codex-live-load | unit | done |
| codex-02 | LIVE: editing a served doc changes the page's data on the next load — no baked snapshot, no stale cache | codex-live-reload | integration | done |
| codex-03 | No baked content in `ui/codex/**` or `packages/shared/src/codex/**`: no JSON import, no data file, no reach into `content/`, no literal content id, no hardcoded collection size; only the loader fetches | codex-no-baked-content | regression | done |
| codex-04 | Normalisation: 稱號/全名 split (incl. the dash-less names), hero 編號 from ability names (disagreement → null), ability id → owner champion, raw doc preserved | codex-normalise | unit | done |
| codex-05 | Broken/absent content still loads and is reported rather than crashing the page (missing manifest, unreadable doc, dead mount) | codex-load-tolerant | exception | done |
| codex-06 | Instant search across name/description/stats — all tokens required, CJK substring, ASCII case-insensitive; ordering by hero 編號 then kit order Q→W→E→R→EX | codex-search | unit | done |
| codex-07 | Filters: item bucket + tier, champion role, hero 編號, ability slot, and enabled-vs-disabled — where "platform unreachable" reads as 啟用狀態未知, never as disabled, and never empties the list | codex-filter | unit | done |
| codex-08 | 879 entries stay cheap: the row window mounts a viewport (+overscan), total height is invariant, and jump-to-row clamps to the scroll range | codex-virtualise | unit | done |
| codex-09 | Item recipe graph: parses the 合成配方 block, links component→parent and parent→component, keeps unresolvable names, prefers an authored recipe field (task #70) | codex-recipe | unit | done |
| codex-10 | Broken-data report finds NO ICON / NO DESCRIPTION / NAME === ID / ZERO MODIFIERS / NO EX ABILITY / DUPLICATE ICON BYTES / unresolved recipe components, grouped with counts, empty groups dropped, and counts missing icons honestly (copyright-gated stock art) | codex-issues | unit | done |
| codex-11 | Icon-byte hashing dedupes paths, records unfetchable icons separately from absent ones, groups only byte-identical files, and never rejects offline | codex-icon-hash | unit | done |
| codex-12 | Icon coverage is measured, not asserted: the denominator is the loaded length (adding an entry moves it), split by 英雄/技能/武器道具 and summed, climbing only for the entry that got art; a declared-but-unfetchable icon is not coverage; empty collection reads 100%, never NaN | codex-icon-coverage | unit | done |
| codex-13 | Deliberately-excluded comes from task #72's `content/config/icon-plan.json`, read through #72's own `parsePlan`, and from nowhere else: no/foreign plan → every gap counts and the page says so; DROPPED leaves the denominator; BLOCKED stays in it but is not backlog (covered + backlog + blocked exhausts it); an entry that already has art is covered rather than dropped/blocked; the plan's own totals are reported beside the measurement and a mismatch flags it stale; the local candidate rule is opt-in and always loses to a published plan | codex-icon-coverage-plan | unit | done |
| codex-14 | The live rescan stays cheap and honest: the first poll re-reads nothing already loaded, later polls re-read only documents whose `_index.json` hash moved, new ids are picked up and vanished ids dropped, and a collection whose index failed to fetch is left untouched rather than counted as wiped | codex-coverage-rescan | unit | done |
| codex-15 | CODEX EDITOR CLIENT GATE (task #96): the write module is `import.meta.env.DEV`-gated in the repo's proven guarded shape and every exported writer short-circuits on it; the page reaches the whole editor only through a BARE `import.meta.env.DEV` dynamic import, so a real `vite build` emits no chunk, no /content-api URL and none of the editor's strings; the dev-server route is `configureServer`-only, loopback-only for mutating verbs, and no prod nginx/image can carry it | codex-edit-dev-gate | security | done |
| codex-16 | Per-field edit model: dot-path get/set that never mutates the source doc, empty input means ABSENT (key removed) not "", typed parse rejects instead of coercing, and a leaf diff of exactly what a save would overwrite. THE MIRROR RULE: a Q/W/E/R ability edit plans TWO writes — the standalone doc and the champion's embedded twin the sim actually reads — while EX/items/champions plan one | codex-edit-model | unit | done |

---

## 圖鑑編輯器 The codex becomes an editor (task #96)

Every value in `CodexDetail` already went through ONE primitive, `<Row>`, so that
is where editing attaches: a Row that names its doc `path` renders an input
instead of text while a session is open. `<EditOnly>` adds the rows an absent
optional field has no read-only form for, and the 原始文件 block doubles as the
raw-JSON escape hatch for anything no Row covers (an ability's `effects`, above
all). The draft is keyed by entry id and discarded when the selection changes.

**The save is two steps, deliberately.** 檢視變更 dry-runs every document in the
write plan against the SAME zod schemas the game loader uses (`POST
…/:id/validate`, which writes nothing) and shows a field-by-field diff of what
is about to change. Only 確認寫入 writes, and the server snapshots the previous
bytes first — 復原上一次儲存 puts them back from the same panel. This repo has no
version control (task #65) and has already lost irreplaceable files to an
in-place overwrite; an editor without an undo would repeat that.

**THE MIRROR RULE** — the trap `codexEditModel.writePlan` exists to close. Every
Q/W/E/R ability is stored TWICE: standalone at `content/abilities/<id>.json` AND
embedded in its champion under `abilities[<slot>]`. The sim reads the EMBEDDED
copy (`sim/content/registry.ts` registers `def.abilities[slot]`), so an editor
that saved only the standalone doc would look like it worked and change nothing
in game. One ability edit therefore plans TWO writes, validated together before
either goes out. An EX ability is referenced by `exAbility` and has no embedded
twin, so it plans one.

**Both gates, and why they are different.** The client gate is a DEV-BUILD gate,
not a hostname check: `CodexPage` reaches the whole editor only through a bare
`import.meta.env.DEV` dynamic `import("./CodexEditPanel")`, which vite folds away
at build time, so a production bundle contains no editor component, no
`/content-api` URL and none of its strings (`codexEditGate.test.ts`, incl. an
opt-in `GGD_BUILD_GATE=1` test that builds and greps `dist/`). `CodexDetail`
knows only `codexEditContext.ts`, a `createContext(null)`. The server gate is
independent and is the real access control — see
[content-api.md](content-api.md) capi-09.

**Where it is reachable.** All URLs are same-origin `/content-api`, so the editor
works from whichever dev server proxies it. The game client's own dev server
deliberately does NOT (task #102): it is the one server published to the LAN, and
a proxy hop there would launder a phone's address into a loopback peer. Editing
is served from the loopback-pinned admin console (`127.0.0.1:60721`). Opened
anywhere else the panel probes, fails fast and says where to go, instead of
erroring at save time.
