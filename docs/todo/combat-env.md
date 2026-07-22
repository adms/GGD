# 戰鬥系統 — global combat-env multipliers + admin dynamic config — TODO

Task #28. ONE global table of multiplicative factors that scales every combat
quantity in the sim — 冷卻 / 傷害 / 防禦 / 攻擊 / 法強 / 生命 / 回復 / 魔力 /
速度 / 攻速 / 治療 / 護盾 / 暴擊率 / 暴傷 / 吸血 / 射程 (17 keys). `1.0` is
neutral: the default table leaves every formula **byte-identical** to the
pre-multiplier sim, so existing tests and the client's prediction shadow world
are unchanged.

**動態啟動, deterministic-safe.** An operator edits the table in the admin
console 戰鬥系統 page; the game-server resolves and **snapshots** it at MATCH
CREATION. A save therefore applies **from the next match** — a match already in
progress keeps the table it started with, so no running sim ever changes its
rules mid-flight and no server restart is needed.

**Purity.** The table is SimWorld state (`world.combatEnv`), injected by the
host BEFORE tick 0 and never read from globals/config/fetch inside the sim. Two
worlds with the same seed and the same table stay bit-identical.

**Type + module** (`packages/shared/src/sim/combatEnv.ts`, the single source of
truth for the key list): `COMBAT_ENV_KEYS`, `CombatEnvMultipliers`,
`DEFAULT_COMBAT_ENV` (frozen all-1.0), `STAT_ENV_KEY`, `normalizeCombatEnv()`
(merge-onto-defaults, rejects NaN/negative), `parseCombatEnvJson()` (fail-safe
wire decoder).

**Formula sites** — each factor is applied at exactly ONE seam:
`statPipeline` (13 stat keys, env factor after Override and before the clamp;
`defense` covers Armor + MagicResist) · `abilitySystem.castAbility`
(× cooldown seconds, Q/W/E/R + EX) · `combat/damage.combatResolveSystem`
(× every DamagePacket amount pre-mitigation, once per packet; lifesteal restore
× healing) · `effects/effectRunner` (heal × healing, shield × shield) ·
`systems/FlowerSystem` (burst hp+mana × healing).

**Contract (endpoints).**
- `GET /api/v1/combat-env` → `{version, updatedAt, multipliers}` — **public**,
  `Cache-Control: public, max-age=10`. The game-server reads it without a token
  (whitelist precedent).
- `GET /api/v1/admin/combat-env` → the same doc, stored-or-defaults — admin only.
- `PUT /api/v1/admin/combat-env` `{multipliers}` → the stored doc — admin only.
  **PUT-replace**: the body is the complete desired state (an omitted key resets
  to 1.0). Unknown keys and factors outside `[0.1, 10]` are a **400**, and a
  rejected write leaves the stored table untouched. `version`/`updatedAt` are
  server-owned; every write appends an admin audit line.

Durable truth: `data/config/combat-env.json` via the jsonstore (atomic
tmp+rename, single writer); Redis only ever holds a rebuildable mirror. Content
defaults ship in `content/config/combat-env.json` (`config.combat-env@1`).

**Fail-safe.** If the platform is unreachable or returns junk, match creation
does NOT break: the game-server falls back to the content defaults (neutral when
that doc is absent too) and logs loudly. Dev bypass: `GGD_COMBAT_ENV_BYPASS=1`.

## Sim foundation — the table and its formula sites (`packages/shared`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| env-01 | `STAT_ENV_KEY` covers every stat-mapped key and stays in sync with the table (a key added to one side cannot go missing from the other) | combat-env-stat-map | unit | done |
| env-02 | Stat clamps still apply AFTER the env factor (moveSpeed/attackSpeed/critChance/lifesteal never escape their legal range) | combat-env-clamp-after | unit | done |
| env-03 | `maxHealth ×2` preserves the live HP RATIO rather than granting free health (same for maxMana) | combat-env-maxhp-ratio | unit | done |
| env-04 | `cooldown ×2` doubles the cooldown ticks actually paid at cast (Q/W/E/R + EX all drain through the one seam) | combat-env-cooldown | unit | done |
| env-05 | `damageDealt ×2` doubles resolved damage, applied once per packet pre-mitigation from the single queue | combat-env-damage | unit | done |
| env-06 | `healing ×2` doubles heal effect amounts | combat-env-healing | unit | done |
| env-07 | `healing ×2` doubles the basic-attack lifesteal restore | combat-env-lifesteal-restore | unit | done |
| env-08 | `healing ×2` doubles the flower burst restore (hp + mana) | combat-env-flower-burst | unit | done |
| env-09 | `shield ×2` doubles shield effect amounts | combat-env-shield | unit | done |
| env-10 | A per-stat factor multiplies the effective stat (13 keys incl. `defense` → Armor + MagicResist) | combat-env-stat-multiplier | unit | done |
| env-11 | Effective-table helpers resolve a stat's env factor (default 1.0 for unmapped stats) | combat-env-effective | unit | done |
| env-12 | Same seed + same non-default table → identical digest; a different table changes the outcome (purity: the table is world state, never a global) | combat-env-determinism | determinism | done |
| env-14 | `normalizeCombatEnv` merges a sparse table onto all-1.0, drops unknown keys and rejects NaN / non-finite / negative factors | combat-env-normalize | exception | done |
| env-15 | `parseCombatEnvJson` round-trips the wire form and fails safe to the neutral table on ""/malformed/non-object input (a client must never throw while decoding a snapshot) | combat-env-parse-json | exception | done |

## Protocol + controller injection (`apps/game-server`, `packages/shared/protocol`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| env-16 | `MatchState.combatEnvJson` encodes/decodes through @colyseus/schema and parses back to the same table; a fresh state decodes to the neutral default | combat-env-encode | integration | done |
| env-17 | A fully-projected MatchState still encodes with the new field (match-13 declare+ctor-assign encoder rule) | combat-env-encode-projected | regression | done |
| env-13 | `MatchController` injects the table into SimWorld BEFORE tick 0; the legacy ctor (no table) yields the neutral default | combat-env-controller-inject | unit | done |

## Platform — combat-env service + API (`apps/platform/internal/combatenv`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| env-30 | Read/write are admin-gated (no token → 401, normal user → 403, admin → 200); a fresh install returns the neutral all-1.0 table with every key present | combatenv-api-admin | security | done |
| env-31 | Strict PUT validation: an unknown key, a factor below 0.1 and a factor above 10 are each a 400; one bad key rejects the WHOLE write and the stored table is untouched | combatenv-api-bounds | exception | done |
| env-32 | Sparse PUT round-trips through the jsonstore: present keys persist, omitted keys reset to 1.0 (PUT-replace), `version`/`updatedAt` are server-owned, the response is always the full table | combatenv-api-roundtrip | integration | done |
| env-33 | `GET /api/v1/combat-env` is public + cacheable (`max-age=10`) so the game-server can read it without a token, and reflects the admin's last save | combatenv-api-public | integration | done |

## Game-server — resolve at match creation (`apps/game-server/src/config/combatEnv.ts`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| env-20 | Content defaults + admin override merge key by key, admin wins | combatenv-resolve-merge | unit | done |
| env-21 | Platform down / non-200 / malformed body → FAIL-SAFE to the content defaults, never a throw | combatenv-resolve-failsafe | exception | done |
| env-22 | `GGD_COMBAT_ENV_BYPASS=1` skips the network entirely and uses content defaults | combatenv-resolve-bypass | unit | done |
| env-23 | Junk keys and junk values from the platform are dropped by the parse + normalize passes | combatenv-resolve-junk | injection | done |
| env-24 | The short-TTL process cache shares one fetch across a burst of match creations and refetches after expiry | combatenv-resolve-cache | unit | done |
| env-25 | `contentCombatEnv` reads the registered `config.combat-env@1` doc (absent doc → neutral) | combatenv-resolve-content | unit | done |
| env-29 | The resolved table is exactly what MatchController snapshots into the sim | combatenv-resolve-inject | integration | done |

## Game-server — the room-create seam (`apps/game-server/src/rooms/MatchRoom.ts`)

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| env-26 | `MatchRoom.onCreate` merges content + admin (admin wins), snapshots the table into SimWorld and publishes the identical table as `MatchState.combatEnvJson` | combatenv-room-merge | integration | done |
| env-27 | A DOWN platform never bricks match creation: the room still comes up on the content defaults (neutral when no content doc either) | combatenv-room-failsafe | exception | done |
| env-28 | NEW MATCHES ONLY — each room snapshots at creation, so a later admin save changes the next room's table while a running match keeps its own (sim + wire) | combatenv-room-snapshot | determinism | done |

## Admin console — 戰鬥系統 page (`apps/admin`)

A 戰鬥系統 page listing all 17 multipliers grouped by role, each row a 中文 label
+ the raw engine key + a step-0.05 numeric input, with per-row 重設 and a global
全部重設 1.0. Save PUTs the complete table; field validation mirrors the
platform's `[0.1, 10]` bounds and a rejected save surfaces the platform message.
A banner states 「儲存後下一場對戰生效（進行中對戰不受影響）」. All
parse/validate/payload logic is pure (`src/combatEnv.ts`); the page is
presentation only.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| env-40 | Tolerant doc parse (bare / envelope / garbage / partial → neutral backfill, junk values and unknown keys dropped), exhaustive zh-Hant labels + groups over the SIM's key list, form seeding, per-row + global reset, ±0.05 step with clamping, dirty / non-neutral summaries | adminui-combatenv | unit | done |
| env-41 | Field validation mirrors the platform's `[0.1, 10]` 400 bounds and gates Save; the PUT body is ALWAYS the complete table (reset rows sent explicitly as 1.0); API round-trip re-seeds from server truth and a rejected save surfaces the platform's message while keeping the edits; the 「下一場對戰生效」 note is present | adminui-combatenv-save | unit | done |
