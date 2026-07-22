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
