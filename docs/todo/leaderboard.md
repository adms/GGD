# Leaderboard & ranking — TODO

Go platform: `internal/ranking`. **Two independent tracks:**

- **Hidden Elo/MMR** (matchmaking only): Redis ZSET `lb:<season>:pairedduels` (score=MMR); Elo in
  Go; snapshot to `data/rankings/<season>/snapshot.json`; account JSON holds authoritative MMR.
- **Visible cumulative points ladder** (the ranked ladder players see): ZSET `lb:<season>:player`
  (score = total season points) plus per-champion ZSETs `lb:<season>:champ:<championId>`.
  Points are cumulative, not zero-sum: place 1 → **+100**, 2 → **+40**, 3 → **−10**, 4 → **−30**,
  floored at 0. Only human, non-guest seats earn them. Snapshots at
  `data/rankings/<season>/{player-snapshot.json, champions/<championId>.json, meta.json}`;
  account JSON (`seasonPoints`, `championPoints`) is the durable truth for the rebuild.
  Nine tiers 鐵/銅/銀/金/翡翠/鑽石 (÷ divisions IV–I) then 大師/宗師/菁英 (apex, no divisions).
  Apex is a **population fraction** of the whole ranked ladder (菁英 = top 10%, 宗師 = next 10%,
  `RANKED_CHALLENGER_FRAC` / `RANKED_GRANDMASTER_FRAC`), gated by `RANKED_MIN_APEX_GAMES`
  settled matches so a new account cannot instantly be 菁英.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| lb-01 | Elo update: winner gains, loser loses, zero-sum-ish | rank-elo-basic | unit | done |
| lb-02 | Provisional K (<30 games) vs settled K | rank-elo-provisional | unit | done |
| lb-03 | Team MMR = avg-vs-avg applied per player | rank-elo-team | unit | done |
| lb-04 | ZADD updates rank; ZREVRANK returns position | rank-zset-rank | integration | done |
| lb-05 | Leaderboard page (ZREVRANGE) with ties by ULID | rank-page-ties | integration | done |
| lb-06 | Around-me window query | rank-around-me | unit | done |
| lb-07 | Snapshot to JSON; ladder falls back when Redis cold | rank-snapshot-fallback | integration | done |
| lb-08 | Season rollover starts a fresh ZSET | rank-season-rollover | unit | done |
| lb-09 | Rebuild ZSET from account JSON on boot | rank-rebuild-from-json | regression | done |
| lb-10 | Tier thresholds: every boundary edge maps to the contract tier | rank-tier-boundaries | unit | done |
| lb-11 | Division bands: each tier's [lo,hi) splits into four equal quarters | rank-division-bands | unit | done |
| lb-12 | Apex by population fraction: top 10% 菁英, next 10% 宗師 (201st of 2000 is 宗師) | rank-apex-fraction | unit | done |
| lb-13 | Small ladder still crowns apex (fractions round up; 1-account edge) | rank-apex-small-ladder | unit | done |
| lb-14 | Apex eligibility: <minApexGames accounts skipped, place passes down | rank-apex-min-games | unit | done |
| lb-15 | Apex fractions/min-games are config-driven | rank-apex-configurable | unit | done |
| lb-16 | Placement award table (+100/+40/−10/−30) | rank-placement-award | unit | done |
| lb-17 | Points floor at 0 (never negative) | rank-points-floor | unit | done |
| lb-18 | AwardPlacement: cumulative award + floor on the live board | rank-points-award-floor | integration | done |
| lb-19 | One award credits BOTH the player total and the champion track | rank-points-both-boards | integration | done |
| lb-20 | Points snapshots round-trip; Redis wipe + boot rebuild recovers both families | rank-points-snapshot-rebuild | regression | done |
| lb-21 | Cached top-of-board apex pass over a live ladder (ineligible leader skipped) | rank-apex-board | integration | done |
| lb-22 | Endpoint shapes: player board, player/me, champion board, me/champions | rank-endpoints | integration | done |
| lb-23 | Match settlement awards points to player + champion boards by placement | rank-points-settlement | integration | done |
| lb-24 | Points accumulate across matches and floor at 0 | rank-points-cumulative | integration | done |
| lb-25 | Duplicate callback / WAL replay awards points exactly once | rank-points-idempotent | regression | done |
| lb-26 | Guests and bots earn no ladder points | rank-points-guests-excluded | integration | done |
