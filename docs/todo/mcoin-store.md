# M COIN & champion/skin store — TODO

Platform wallet (`internal/wallet`: account JSON truth + Redis mirror), store catalog from
the read-only content tree (`CONTENT_DIR`: `skins/` + `config/store.json`), buy/equip REST,
placement rewards in the settlement path (absolute post-match balances, WAL-idempotent),
and the champ-select ownership gate on room start. Content side: `skin@1` + `config.store@1`
Zod schemas, skin docs, and the two spare KayKit GLBs as skin models.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| mcoin-01 | Buy skin/champion deducts, grants ownership, auto-equips skin | mcoin-buy-ok | integration | done |
| mcoin-02 | Insufficient balance rejected (402 `insufficient_mcoin`), nothing changes | mcoin-buy-insufficient | exception | done |
| mcoin-03 | Buying an owned item is a 409, never deducts twice | mcoin-buy-duplicate | exception | done |
| mcoin-04 | Equipping an unowned skin rejected; mismatch/unknown are clean errors | mcoin-equip-not-owned | security | done |
| mcoin-05 | Wallet is auth-scoped: no token → 401, no cross-account reads/spends | mcoin-wallet-authz | security | done |
| mcoin-06 | Settlement grants placement rewards; bot/guest (`:p`, no account) seats skipped | mcoin-earn-settlement | integration | done |
| mcoin-07 | Duplicate result callback / WAL replay never double-grants M COIN | mcoin-settle-idempotent | regression | done |
| mcoin-08 | GET /store/catalog mirrors content docs with owned/equipped flags | mcoin-catalog-content | integration | done |
| mcoin-09 | First wallet read seeds all price-0 starter champions, persisted to JSON | mcoin-starter-seeded | unit | done |
| mcoin-10 | Redis wiped → wallet state rebuilt from account JSON alone | mcoin-redis-rebuild | regression | done |
| mcoin-11 | Room start rejected when a member picked an unowned priced champion | mcoin-champ-gate | integration | done |
| mcoin-12 | skin@1 parses real skin docs; championId/modelKey refs resolve | mcoin-skin-schema | unit | done |
| mcoin-13 | config.store@1 parses via config union; invalid docs rejected | mcoin-store-schema | exception | done |

## Meta progression: 水晶 / 喜愛置頂 / M幣 admin-grant (task #118)

`「水晶（打場免費賺）解鎖英雄 + 喜愛置頂 + M幣改由後台發放的造型幣（非購買）」`. NO
real-money: there is no third-party payment (task #126 removes monetization). Three
additive layers on the existing wallet, persisted per-account in a wallet-owned
`walletmeta/` JSON-store collection (crystals + favourites — the account struct is owned by
a parallel wave, so meta stays off it) with a Redis mirror:

- **水晶 / Crystal** — a FREE soft currency, granted for PLAYING A MATCH and scaled by final
  placement (`CrystalPlace1..4` = 120 / 90 / 70 / 60, average 85).
  **There is no client-callable earn route** (an earlier revision shipped
  `POST /wallet/crystals/earn`, an authenticated self-grant with no per-match key — a client
  could loop it to mint unlimited crystals; it is deleted, with
  `meta-crystal-no-earn-route` as the regression guard). The ONLY grant path is the
  HMAC-signed internal settlement callback `POST /internal/matches/{id}/result`, which is
  per-`matchId` idempotent (`KeyMatchDone` SetNX) and journals the ABSOLUTE post-match
  balance (`Settlement.Ratings[].crystal`) so a duplicate callback or a WAL replay converges
  instead of double-granting. `Settler.Apply` skips a zero crystal value so replaying a
  record written before the field existed cannot wipe a balance.
  Spending: `POST /wallet/champions/unlock` deducts the champion's OWN price from
  `content/config/store.json` `championPrices` (`CrystalUnlockCost` = 300 is the default and
  the value the client button label mirrors; `server.go` warns at boot on any drift) and adds
  the champion to `account.OwnedChampions` (so the room-start ownership gate already honours
  it).
  **Balance model** (assumed play rate, so it can be retuned from the same numbers): one match
  ≈ champ-select 40s + ~7 rounds × (~180s combat + 40s intermission) ≈ **25 minutes**
  (`config.match.json`: `combatMaxSec` 240, `fireRing.startSec` 180, `intermissionSec` 40,
  4 teams × 8 `startingTeamLives`; `arena-rules.json` schedules rounds 1..6 + overflow). A
  family evening ≈ 1–2 h ≈ 2–4 matches. At 300 per unlock that is **2.5 matches if you keep
  winning, 3.5 on average, 5.0 if you always place last** — about one champion per evening.
  Last place still earns: 「打場免費賺」 is free THROUGH PLAY, not through winning.
  **Roster split**: 12 of the 48 whitelisted champions are free starters (8 melee + 4 ranged,
  chosen for name recognition so a first-time player sees heroes they know and both attack
  types are covered from match one); the other 36 are priced at 300.
- **喜愛置頂 / Favourite pin** — `POST /wallet/favourites {champion, favourite}` toggles a
  per-account favourite set (stored sorted, deduped), surfaced on `GET /wallet` for
  champ-select to float to the top.
- **M幣 / M COIN** — now ADMIN-GRANTED only. `POST /wallet/admin/grant-mcoin
  {accountId, amount}` is role-gated (caller must carry `admin`); a non-admin is 403. The
  existing skin/cosmetic `POST /store/buy` still spends it — it is just never purchased.

Wallet package: `apps/platform/internal/wallet/{meta.go,wallet.go,handlers.go,catalog.go,meta_test.go}`.
Settlement side: `apps/platform/internal/gamelink/{callback.go,settle.go,crystal_test.go}`.
Grants are deterministic (placement-scaled), so tests need no rng seam.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| meta-01 | A settlement-granted crystal balance survives a Redis wipe (JSON truth) | meta-crystal-accrue | integration | done |
| meta-02 | Crystals unlock a priced champion (owned + playable) at the champion's own store price; one short is a clean 402 that deducts nothing; re-unlock is 409 | meta-crystal-unlock | integration | done |
| meta-09 | NO authenticated client route grants crystals (the minting-hole regression guard) | meta-crystal-no-earn-route | security | done |
| meta-10 | The HMAC settlement callback grants placement-scaled crystals to humans; bots and couch guests earn nothing | crystal-earn-settlement | integration | done |
| meta-11 | A duplicate result callback and a WAL replay do not double-grant crystals | crystal-settle-idempotent | security | done |
| meta-12 | Replaying a settlement record written before the crystal field existed does not wipe a balance | crystal-legacy-replay-safe | integration | done |
| meta-03 | Favourite pin/unpin persists (sorted, deduped) and round-trips a Redis wipe | meta-favourite-toggle | integration | done |
| meta-04 | Admin grants M幣 (additive); a non-admin caller is 403 and changes nothing | meta-admin-grant-mcoin | security | done |

### Client + admin UI (task #118)

Client champ-select meta chrome lives in `apps/client/src/ui/panels/champselect/`
(`walletMeta.ts` — model + hook over the shared authenticated ApiClient, wired via
`GET /wallet` + `GET /store/catalog`; `ChampMetaControls.tsx` — the 水晶 balance badge and
per-card 喜愛置頂 star + 「解鎖 (300 水晶)」button) and is wired into
`panels/ChampSelectPanel.tsx` (favourites float to the top; unlock POSTs
`/wallet/champions/unlock`; the star POSTs `/wallet/favourites`). It degrades to hidden meta
chrome when the platform is unreachable / there is no session, leaving the base champ-select
untouched. Admin M幣 發放: `apps/admin/src/ui/MCoinGrantPage.tsx` + `mcoinGrant.ts` (pure
form logic) calling `POST /wallet/admin/grant-mcoin` via `api.grantMCoin`; registered as the
`mcoinGrant` page (nav + route in `ui/App.tsx`, `Page` union in `store.ts`).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| meta-05 | Champ-select floats favourited champions to the TOP (stable, non-mutating) | meta-client-favourite-sort | unit | done |
| meta-06 | An unlock result flips a champion locked→owned and spends the flat crystal cost | meta-client-unlock | unit | done |
| meta-07 | Offline / no-session / unreachable platform degrades meta to unavailable (champ-select intact) | meta-client-degrade | unit | done |
| meta-08 | Admin grant form validates id+amount, posts, and shows the resulting balance (403 surfaced) | adminui-mcoin-grant | integration | done |
