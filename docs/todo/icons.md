# w3x icons — champions / abilities / items → game UI — TODO

Task #33 (UI half). The GoDieEX22s.w3x map ships per-hero/-ability/-item BLP icon art. The
extraction half converts in-archive BLPs to PNG under `content/assets/icons/{champions,
abilities,items}/<doc-or-ability-id>.png` and writes the matching `icon` field into the docs;
this half adds schema support and client rendering.

**Contract (shared with the extraction half):**
- Optional `icon?: string` (regex `^assets/`) on `champion@1` (top level), `zAbilityDef`
  (embedded Q/W/E/R **and** standalone ability docs, incl. `.ex`), and `item@1`. Additive —
  every existing doc stays valid; mirrored as `icon?: string` on the sim's
  `ChampionDef`/`AbilityDef`/`ItemDef` (defs.ts) so registry reads stay typed.
- Heroes/abilities/items whose WC3 icon is Blizzard **stock** art (not inside the map archive)
  get **no** `icon` field — the client keeps its pre-icon rendering for them (never fabricate
  or hotlink stock paths).

**Client shape:**
- `apps/client/src/ui/icons.ts` — pure resolution (`iconSrc`/`championIconUrl`/
  `abilityIconUrl`/`itemIconUrl`): `assets/…` → `/content/assets/…` via `contentAssetUrl`
  (ContentDb, same mount as all content fetches); absent/foreign/failed → `null`.
- `apps/client/src/ui/components/IconImg.tsx` — lazy `<img>`, renders **nothing** on null src
  or onError (404) so callers keep their existing fallback; `fill` mode covers a tile and
  DOM-later overlays (cooldown sweep, cast fill) stack on top.
- Wired: champ-select grid rows + selected-champion header, AbilityBar Q/W/E/R + EX slot
  (cooldown + cast-fill overlays preserved above the icon), ShopPanel rows + inventory slots,
  AugmentDraftPanel weapon cards (item icons), Scoreboard champion rows. Touch/couch layouts
  untouched.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| icons-01 | `champion@1` accepts a top-level `icon` matching `^assets/`, stays valid without one (whole existing roster), rejects stock/absolute/hotlink paths with a field error on `icon` | icon-schema-champ | unit | done |
| icons-02 | `zAbilityDef.icon` round-trips both embedded (champion Q/W/E/R) and on standalone `ability@1` docs (EX-style), bad prefixes rejected | icon-schema-ability | unit | done |
| icons-03 | `item@1` accepts `icon` alongside the legacy `iconKey`, absent stays valid, bad prefixes rejected | icon-schema-item | unit | done |
| icons-04 | icon resolution falls back to null (= existing rendering) for absent/foreign/hotlinked paths, unknown ids, icon-less docs and failed (404) loads; valid `assets/…` resolves to `/content/assets/…` | icon-ui-fallback | unit | done |
| icons-05 | AbilityBar surfaces: Q/W/E/R icons resolve from the embedded defs (icon-less slot keeps the letter tile) and the EX slot view carries its ability's icon | icon-ui-abilitybar | unit | done |

---

## Extraction half (task #33E)

`tools/w3x-import/extract_icons.py` re-reads `raw/war3map.{w3u,w3a,w3t}`
(`uico` / `aart` / `iico` — the parsed/*.json inventory had DROPPED the
unit/ability icon fields; stats.py/objdata.py untouched, w3xlib readers reused),
converts in-archive BLPs via `w3xlib/blp.py`, writes per-doc-id PNGs and patches
the `icon` fields additively (2-space JSON, per-file trailing newline kept).
Reports: `tools/w3x-import/out/GoDieEX22s/{ICONS.md,ICON_MAP.json}`.

**Mapping (verified 428/428 mapped embedded defs by name against parsed/abilities.json):**
- champion `godie-<raw>` → w3u/heroes row `<RAW>` (case-insensitive) → `uico`.
- embedded Q/W/E/R → `hero_abilities` minus `Aamk`, first four in order (exactly
  how `drafts.hero_to_champion` assigned the slots) → `aart`; standalone
  `godie-<raw>.<q|w|e|r>` docs get the identical value.
- `godie-<raw>.ex` → EX_MAP.json `heroes[cid].exAbility` → `aart`. extract_ex.py
  now RECORDS that `aart` path in EX_MAP.json; gen_ex_content.py emits `icon`
  only when the PNG exists — regeneration never fabricates a ref and is
  diff-stable across double runs (verified).
- item `godie-<raw>` → w3t row `<RAW>` → `iico`.
- ORIGINAL = the path resolves INSIDE `GoDieEX22s.w3x` (archive-membership test,
  not path prefix — custom art hides at stock-looking `CommandButtons\` paths).

**Coverage (ICONS.md):** champions **85**/111 archive art (16 stock + 10
never-overridden → fallback) · ability docs **13**/546 (444 embedded Q/W/E/R +
102 EX; only 1 EX has archive art — the map runs on stock ability buttons) ·
items **15**/208 · **0** BLP conversion failures. sela/thorne (non-godie) and
the 5 pruned ids get nothing.

**Reconciliation (main session):** nothing here refs via `_index.json`;
`content:build`'s re-extraction of embedded Q/W/E/R into the abilities
collection is a no-op for icons (embedded values == standalone twins, tested).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| icons-06 | every doc carrying `icon` still parses as its STRICT schema (champion@1 incl. embedded Q/W/E/R, ability@1, item@1) and matches `^assets/icons/<kind>/…png` | icon-schema-valid | unit | done |
| icons-07 | every `icon` ref in the content tree resolves to a real on-disk file with PNG magic bytes | icon-refs-resolve | unit | done |
| icons-08 | extraction coverage floors hold: ≥85 champion / ≥13 ability / ≥15 item PNGs on disk | icon-coverage-floor | unit | done |
| icons-09 | embedded Q/W/E/R `icon` values agree exactly with their standalone ability-doc twins | icon-embed-standalone-agree | unit | done |
| icons-10 | EX docs carry `icon` IFF their PNG exists (gen_ex_content.py regen-safety) | icon-ex-consistency | unit | done |
| icons-11 | no orphan PNGs (every file referenced by ≥1 doc); no resurrected art for the 5 pruned champions | icon-no-orphans | unit | done |

Suite: `packages/shared/src/content/icons.test.ts` — DIRECT file reads (green
before AND after `content:build`, same convention as standinRoster.test.ts).

---

## Coverage-bar contract (task #97 consumes, task #72 produces)

The codex carries a LIVE 圖示覆蓋率 bar at the top of `#codex` (`@ggd/shared/codex/codexCoverage`
plus `apps/client/src/ui/codex/{useIconCoverage.ts,IconCoverageBar.tsx}` — the maths moved to
`packages/shared` in task #102 so 後台管理 counts from the same code, not a copy). It
MEASURES coverage itself — denominator = the collection lengths it fetched from `/content`,
numerator = docs declaring an `icon` that actually resolves — so it needs exactly one thing from
the generation side: **which entries are deliberately not getting art**, per the user's rule
「明顯不是提供使用的(ex.空描述)就不需要了」.

**That verdict is task #72's, and it is read through task #72's own reader.** The bar calls
`loadPlan()` / `parsePlan()` in `@ggd/shared/codex/codexPlan` against `content/config/icon-plan.json`
(`tools/icon-gen/src/plan.py --write`). There is deliberately no second parser and no second
definition of "excluded" anywhere — in the codex or in 後台管理, which reads the same module — so if
the plan schema moves, `codexPlan` moves and both consumers follow.

**The three states are kept apart, because they are not the same thing:**

| plan state | in the bar | why |
| --- | --- | --- |
| `dropped` | leaves the denominator (排除) | a decision, not a gap — counting it would pin the bar red forever, which is what the user objected to |
| `blocked` | stays in the denominator, own hatched band (版權暫停) | real content that needs art but that nobody may generate yet; hiding it would understate the work, colouring it green would lie |
| everything else | 待補 (backlog) | the honest remainder — what a generation run can actually work on |

With no plan file the bar counts every gap as work and prints 「排除清單尚未發布」 plus the exact
command to publish one. An opt-in checkbox can preview the local 空說明/名稱=ID guess, always
labelled as a guess and always overridden by a real plan.

**Two obligations on the producer side:**

1. **Write docs through the content-api (`PUT /content-api/:collection/:id`) or re-run
   `content:build`.** The live refresh diffs each collection's `_index.json` hashes every 8s and
   re-reads only the docs whose hash moved — that is what makes polling cheap. A doc patched on
   disk without a reindex is invisible to the bar (and to the game's own loader).
2. **Re-run the planner after content changes.** The bar prints the plan's self-reported totals
   next to its own measurement and flags 「計畫是在不同的內容上跑的」 when `counts.total.docs`
   disagrees with the number of documents actually loaded. Verified 2026-07-22: measured
   113 / 795 needed (86 dropped, 22 blocked, 660 backlog) — identical to the plan's own totals.

---

## Generation half (task #72) — `tools/icon-gen`

The extraction half is DONE and re-verified: 113 PNGs, 0 patched on a re-run,
and all 584 stock-classified rows re-tested against the map archive with a
wider candidate set (`.blp/.tga/.dds/.png/.jpg/.bmp` + a `war3mapImported\`
re-path) for **0 new hits**. There is no more free art. The register's old
"695 stock / 2 map-custom" split was wrong — 111 of that 695 were the author's
own art at stock-looking paths (see `docs/asset-debt.md` §3).

`tools/icon-gen/` classifies what is left and can generate it. Read
`tools/icon-gen/README.md` first; the prompt itself is `src/prompt.py`.

**The plan** (`content/config/icon-plan.json`, regenerated by
`src/plan.py --write`, schema `config.icon-plan@1`):

| | docs | have | drop | blocked | generate |
| --- | --- | --- | --- | --- | --- |
| champions | 113 | 85 | 4 | 22 | 2 |
| abilities | 554 | 13 | 25 | 0 | 516 |
| items | 214 | 15 | 57 | 0 | 142 |
| **total** | **881** | **113** | **86** | **22** | **660** |

`generate` splits into **tier 1 = 166** (something in the live game offers it
today) and **tier 2 = 494**. Every drop rule is re-derived from the docs on
disk each run, and a LIVE-SURFACE VETO runs first, so nothing reachable can
ever be dropped — that is `icon-gen-drop-safety`, and it re-scrapes the
surfaces independently of the planner rather than trusting it.

**Nothing has been generated. No money has been spent.** `data/config/` does
not exist on this machine, so the platform is in stub mode and `/ai/icon`
returns a placeholder. See the README's "Before the first real run".

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| icons-12 | The DROP/BLOCK classification can never swallow a reachable entry: no dropped or blocked id appears in any live surface (starter bundle, the three loot tables, the store, the sim skeleton), the surface files all still exist, and no doc that already has extracted map art is ever queued for generation | icon-gen-drop-safety | security | done |
| icons-13 | The plan is deterministic — replanning unchanged content produces identical output — so a re-plan never churns the tree while other work is in flight, and every live-surface file it wants was actually found (a missing one silently narrows the veto) | icon-gen-deterministic | regression | done |
| icons-14 | `--dry-run` calls nothing and bills nothing while still printing a real count and a real dollar figure; a live run is refused four separate ways: unconfirmed pricing, an unknown model rate, an estimate over `--max-spend`, and a missing platform token | icon-gen-dry-run | security | done |
| icons-15 | The runner has no way to accept a provider API key at all (no `--api-key`, no `*_API_KEY` env read): it authenticates to the PLATFORM, which attaches the server-side key | icon-gen-no-key | security | done |
| icons-16 | The missing-icon FALLBACK is a shipped feature, not an edge case: the tile is deterministic per doc id, distinct between neighbouring entries, dark enough to sit beside real art, honours a caller's meaningful accent colour, and draws one CODE POINT (never half a surrogate pair) | icon-ui-glyph-fallback | unit | done |
