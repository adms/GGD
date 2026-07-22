# Ranked ladder — client UI (task #37) — TODO

The **client half** of the ranked ladder. The Go platform (`internal/ranking`, see
[leaderboard.md](leaderboard.md) for the MMR/Elo track) owns points + tiers; this file covers
what `apps/client` renders.

Two visible boards, both keyed off **cumulative season points** (hidden Elo/MMR stays for
matchmaking only):

- **玩家** — the player board, one row per account (`GET /api/v1/ranking/player`), plus the
  caller's own standing pinned under it (`GET /api/v1/ranking/player/me` → points, tier,
  division, rank, percentile).
- **英雄** — a champion board: pick a champion from the roster grid (w3x icons via
  `ui/icons.ts` + `IconImg`, letter-tile fallback for stock-art heroes) →
  `GET /api/v1/ranking/champion/{championId}`; and **我的英雄**, the caller's per-champion
  standings sorted by points (`GET /api/v1/ranking/me/champions`).

Nine tiers ascending with the EXACT Chinese labels — 鐵 / 銅 / 銀 / 金 / 翡翠 / 鑽石 / 大師 /
宗師 / 菁英. Iron..Diamond carry four divisions (IV lowest → I highest); Master / Grandmaster /
Challenger are **apex** and never show a division (the crest draws a star instead). The client
treats `tier` / `division` as loose (english key, Chinese label, or numeric index; division as
`1..4` or `"I".."IV"`) so the board never breaks on an encoding change, and falls back to
未定級 on anything unrecognised.

Files: `ui/components/{tier.ts, TierBadge.tsx}` (pure mapping + inline-SVG crest, no external
art), `ui/platform/{ranking.ts, LeaderboardPanel.tsx, api.ts, types.ts, store.ts, ranking.css}`.
All non-trivial logic is extracted pure (the client vitest env is node, no DOM) exactly like
`lobbyReducer.ts` / `champSelectFilter.ts`; the panel source itself is gated by file-scan
assertions in the spirit of `architecture.test.ts` / `mobilePwa.test.ts`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| rankui-01 | Tier → EXACT Chinese label + LoL-like color set for all nine tiers; english key / 中文 / index all normalise, junk → 未定級 | rank-tier-map | unit | done |
| rankui-02 | Division rendering: 1..4 ↔ IV..I roman (IV lowest), loose coercion, `formatRank` composes "金 II" | rank-tier-division | unit | done |
| rankui-03 | Apex (大師/宗師/菁英) has NO division — a division sent on an apex row is dropped | rank-tier-apex | unit | done |
| rankui-04 | Panel tab switching: 玩家/英雄 + 英雄榜/我的英雄 sub-view, picker closes, same-tab dispatch is a no-op | rank-ui-tabs | unit | done |
| rankui-05 | Champion-picker selection records the champion and triggers the board fetch with that championId (mock fetcher) | rank-ui-champ-pick | unit | done |
| rankui-06 | "You" row highlight: the caller's account id matches, nobody else / no session does | rank-ui-me-highlight | unit | done |
| rankui-07 | Champion icon absent (stock-art hero) → `icon: null` letter-tile fallback, never a broken image; options name-sorted | rank-ui-champ-fallback | unit | done |
| rankui-08 | "Load more" pagination: page merge de-dupes by accountId, hasMore only on a full page, offset = loaded count | rank-ui-paginate | unit | done |
| rankui-09 | 我的英雄 sorted by points desc, ties broken deterministically (rank then championId), input not mutated | rank-ui-mychamps-sort | unit | done |
| rankui-10 | Mobile/touch: crest scales, tabs + champion tiles stay ≥44px, picker drops to one column, lobby columns stack on a narrow viewport | rank-ui-mobile | unit | done |
| rankui-11 | Live browser verify: both boards against the real platform API (points move after a ranked settlement, tier badge updates) | rank-ui-e2e-live | e2e | pending |

`rankui-11` stays `pending` until the backend half of task #37 is deployed and an automated
run emits its beacon — same convention as `webui-11` / `couch-16` / `mobile-15`.
