# Runbook — content whitelist (empty roster / "no champions" recovery)

**Symptom:** champ-select shows 「尚未啟用任何英雄」, the shop is empty, weapon-card rounds
grant nothing, or a player's pick is rejected with 「此英雄尚未開放」.

**This is not a bug.** The content whitelist is **default-empty by design** (task #4): the
imported WC3 tree carries 113 champions / 212 items / 554 abilities, none of it vetted, so a
fresh install enables *nothing* until a human opts content in. This page is the exact path
back to a playable install.

---

## TL;DR

| I want to… | Do this |
| --- | --- |
| Make a fresh install playable | Ops console → **內容白名單** → **⭐ 啟用示範組合** → **儲存** |
| …from a shell instead | `make seed-demo` |
| See what is enabled right now | `make whitelist` |
| Recover from a totally locked-out install | Console → **啟用全部** (break-glass; enables unvetted content) |
| Go back to a clean, empty install | Console → **全部停用** → **儲存** |

---

## 1. What the whitelist is

One durable JSON document, `data/curation/whitelist.json`:

```json
{ "version": 1, "updatedAt": "…", "champions": [], "items": [], "abilities": [] }
```

- Written through the platform jsonstore (atomic tmp+rename, single writer).
- Redis key `curation:whitelist` is a **rebuildable mirror**, never read back as truth.
- Owned by `apps/platform/internal/curation`.
- **A fresh install lazily creates this file EMPTY and seeds nothing.** Never change that.

Enforcement is the **game-server's** job (`apps/game-server/src/curation/whitelist.ts`): it
filters the playable + RANDOM champion pools, the shop catalogue, and the draft/loot offers,
and rejects `SELECT_CHAMPION` for a non-whitelisted champion.

> **Fail-safe:** if the game-server cannot reach the platform it falls back to **allow-all** and
> logs loudly — a whitelist outage must never brick a live match. So "everything is playable
> even though the whitelist is empty" means the game-server could not fetch it (see
> [Troubleshooting](#5-troubleshooting)).

---

## 2. The demo starter set

A named, hand-picked, reviewable bundle lives in
**`apps/platform/internal/curation/starter.go`** — read that file for the per-pick rationale.

- **48 champions — the FIRST OPEN ROSTER (對戰可選名單)**: the user's 48 hand-picked names, one
  canonical id each (test/placeholder and duplicate-reskin candidates dropped; see 附錄A of
  `docs/hero-popularity-ranking.md`). Each has a complete, hero-number-consistent
  `xx-01..04` + `xx-002` kit; the roster deliberately includes heroes that share a CC0 stand-in
  mesh and heroes with no portrait, so the old demo-showcase visual gates (unique/textured/in-band
  model, icon-on-disk) do NOT apply. Pinned id-for-id by `TestFirstOpenRoster`.
- **104 items — the whole shippable catalogue, split across the arena's four acquisition
  surfaces** (task #70 drew the first two, task #82 the other two; the arena has NO crafting,
  so every item is complete when you get it):
  - **63 SHOP** — named, effective, sane, and priced at exactly ONE of the two prices the
    arena has: **300g (SIMPLE)** or **1200g (POWERFUL)**. 「武器價格請統一化」. 39 of them are
    buyable on the 600g starting purse, which buys TWO.
  - **2 SERVICES** — gold purchases that occupy no inventory slot: **傳說寶玉** (2400g, rolls a
    legendary 3-choose-1) and **能力屬性強化** (375g, the repeatable stat tick).
  - **29 LEGENDARY** — the round-5 card's pool and the orb's pool. Whitelisted so they can be
    OFFERED, priced at 0 so nothing can sell them: 「傳說的武器道具，只能隨機三選一」.
  - **10 DRAFT** — the 0g WC3 quest/score rewards, the free round-2 card.

  The whitelist gates all four surfaces with one list, so both `quest-rewards` (round 2) and
  `legendary-weapons` (round 5) stay fully rollable. Recipe books, token no-ops and every
  statless item are excluded from the lists but NOT deleted — they return when `item@1` grows
  an active slot.
- **60 abilities** — every champion's full `{q,w,e,r,ex}`. Only `.ex` is gated today, but the
  full kit is listed so no champion is ever half-enabled.

`TestStarterSetMatchesContentTree` re-verifies **every one of those gates** against the real
content tree on each CI run, so the bundle cannot silently rot after a re-import.

### Three doors apply it — all explicit

| Door | Command | Guard |
| --- | --- | --- |
| Ops console | **內容白名單 → ⭐ 啟用示範組合 → 儲存** | human click; audited `curation.starter` |
| Shell | `make seed-demo` | admin token required; audited |
| Headless / CI / K8s | `/seed -starter` (or `GGD_SEED_STARTER_WHITELIST=1`) | **default OFF**; **no-op unless the whitelist is empty** |

All three are **UNION-only** — they can never disable an operator's existing picks — and the
bundle is a **suggestion, not a floor**: disable every id afterwards and the install is empty
again, permanently. Nothing re-expands it on restart.

---

## 3. Exact commands

Defaults: `PLATFORM=http://127.0.0.1:60721`. Override for a remote install.

```bash
# What is enabled right now? (public, no auth)
make whitelist
curl -s "$PLATFORM/api/v1/curation/whitelist" | jq '{c:(.champions|length),i:(.items|length),a:(.abilities|length)}'

# Preview the bundle WITHOUT applying it (public, no auth)
curl -s "$PLATFORM/api/v1/curation/whitelist/starter" | jq

# Apply it (admin token required; union-only; idempotent)
make seed-demo                       # prompts for the token
make seed-demo TOKEN=… PLATFORM=…    # non-interactive
curl -X POST "$PLATFORM/api/v1/curation/whitelist/starter" \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
```

### Full REST surface

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/curation/whitelist` | public (10s cache) | read the current doc |
| `GET` | `/api/v1/curation/whitelist/starter` | public (10s cache) | preview the bundle, **does not apply** |
| `PUT` | `/api/v1/curation/whitelist` | **admin** | replace the whole doc |
| `POST` | `/api/v1/curation/whitelist/bulk` | **admin** | `{kind, enable[], disable[]}` for one kind |
| `POST` | `/api/v1/curation/whitelist/starter` | **admin** | union the demo bundle in |

`kind` ∈ `champions` | `items` | `abilities`. Every admin write lands in the console's audit
page (`curation.replace` / `curation.bulk` / `curation.starter`).

```bash
# Enable two champions without touching items/abilities
curl -X POST "$PLATFORM/api/v1/curation/whitelist/bulk" \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"kind":"champions","enable":["godie-e001","godie-hpb1"],"disable":[]}'

# Wipe it back to a fresh install
curl -X PUT "$PLATFORM/api/v1/curation/whitelist" \
     -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"champions":[],"items":[],"abilities":[]}'
```

### Last resort — edit the file

The JSON file is the truth; it is safe to hand-edit while the platform is stopped.

```bash
$EDITOR data/curation/whitelist.json    # then restart the platform, or run `make seed`
```

---

## 4. Kubernetes / fresh cluster

The post-install hook Job execs **`/seed`** (the `cmd/seed` binary baked into the platform
image), which rebuilds the Redis hot layer. It does **not** touch the whitelist unless asked:

```yaml
seed:
  enabled: true
  starterWhitelist: false   # values.yaml default — production opts in explicitly
```

`values-local.yaml` sets `starterWhitelist: true` so a `make up` box is playable immediately.
Even when true, the seeder **skips entirely if any champion is already enabled**, so an
operator's curation is never re-expanded on upgrade. It logs the outcome at INFO and writes an
audit line as `system:seed` / `curation.starter`.

```bash
make seed            # Redis hot layer only (never touches the whitelist)
make seed-starter    # + apply the demo bundle IF the whitelist is empty
```

---

## 5. Troubleshooting

**"I applied it but the game still shows nothing."**
The client caches the whitelist per match and the public GET has a 10s cache. Return to the
lobby and start a new match. Confirm with `make whitelist` that the write actually landed.

**"Everything is playable even though the whitelist is empty."**
The game-server failed to fetch the whitelist and failed safe to allow-all. Check its logs.
Known cause: **task #48** — the game-server hard-codes the k8s hostname for the platform, so on
a dev box `fetchWhitelist()` always times out. The *client* reads the whitelist same-origin
through the vite proxy and does show the real (empty) state, which is why champ-select can look
empty while the server would happily spawn anything. Until #48 lands, verify the seed through
the **client** path. `GGD_WHITELIST_BYPASS=1` forces allow-all deliberately — make sure it is
not set.

**"401 / 403 from `make seed-demo`."**
The token is not an admin token. All writes go through the platform's admin-role middleware.

**"The console button says the bundle is empty."**
`GET /curation/whitelist/starter` returned nothing — the platform is older than this bundle, or
the request never reached it. Check the browser network tab.

**"A champion is enabled but its EX does nothing."**
The EX is the one ability the whitelist actually gates. Enable `<championId>.ex` too — or just
apply the demo bundle, which always ships complete kits.

---

## 6. Operator-state migration — moving HIS whitelist to another host (task #179)

**The problem this solves.** `.gitignore` excludes `/data/**` (correct — accounts,
session tokens and logs must never be committed). That same rule strips
`data/curation/whitelist.json`, so a **freshly-cloned family host boots REACHABLE and
WELL-FORMED with an EMPTY whitelist**: the game-server's fail-safe does *not* engage (that
is only for an *unreachable* platform), every `SELECT_CHAMPION` is rejected
`not-whitelisted`, and champ-select renders zero cards. Every test stays green. Nobody
can play.

`make seed-demo` / `/seed -starter` recovers a *demo* 48 — but that is not necessarily
**his** curation (e.g. his 30-item list enables 聖光石 + 黃昏公主的血脈, which the demo bundle
does not). The migration tool moves exactly what he curated.

**Two safety nets are now always on**, independent of how the whitelist got there:

- The platform **refuses to boot** a player-facing deploy (networked bind, family tier, or
  invite gate on) whose whitelist enables no champion — it names the fix instead of greeting
  the family with an empty select. A loopback-only dev box stays frictionless;
  `GGD_ALLOW_EMPTY_WHITELIST=1` is the deliberate "boot empty and curate in the console" escape.
- The bundle records **"combat-env was never configured" as ABSENCE** and restore writes
  nothing for it, so a future content re-tune is never silently frozen. (Exporting the
  content-seeded admin table and writing it back is the mirror-image of the reset bug
  「我改過應該要記得」 — this tool refuses to do it.)

### The two commands

```bash
# On the laptop — snapshot what makes this HIS game (whitelist + any combat-env override):
make opstate-export                 # writes ggd-operator-state.json

# On the family host, after `make family-up` — put it back, verified, into the container:
make family-restore                 # streams the bundle over stdin into /opstate

# After playtest one, bring his ON-HOST console edits home (same tool, other direction):
#   scp the host's bundle back, then:
make opstate-restore DATA=./data    # laptop-side; add FORCE=1 only to discard local edits
```

`make family-restore` is a drop-in line in the deploy — it slots in right after
`make family-up`. A running platform picks the restored whitelist up within ~5 s (the
game-server's 5 s cache TTL); no restart needed.

### What it guarantees

| Property | How |
| --- | --- |
| **Only real content is enabled** | every id is checked against the target's `content/`; ids the tree no longer defines are **named** and dropped, never imported as dead entries. `-strict` turns a drop into a hard failure. |
| **combat-env never-configured ≠ configured-to-1.0** | `configured:false` carries no document; restore writes no `data/config/combat-env.json`, so content tuning + future re-tunes stay live. A stored all-neutral table *is* carried, because that is a deliberate choice. |
| **Idempotent** | restoring the same bundle twice reports `unchanged` and writes nothing (compared on content, not timestamp). |
| **Never clobbers newer host state** | if the host whitelist was edited *after* the bundle was exported, restore **refuses** (exit non-zero) unless `FORCE=1`. An empty lazily-created host whitelist is never treated as "newer". |
| **Integrity** | the bundle is sha256-sealed; a truncated `scp` or a hand-edit is caught on restore. |

Inspect a bundle without touching anything: `go -C apps/platform run ./cmd/opstate inspect -in ggd-operator-state.json`.

**What it deliberately does NOT carry:** the AI provider key (`config/ai-provider.json`,
plaintext secret — re-enter it in the console on the host), invite codes (credentials),
and accounts (opt-in via `-parts accounts`; a fresh host's first registration becomes the
owner, so starting clean is safe until playtest one records real MMR — decide before
session two). The 84 MB Blizzard overlay is task #177's `make family-ship`, not this.

Code: `apps/platform/internal/opstate/`, CLI `apps/platform/cmd/opstate/`, boot check wired
in `apps/platform/cmd/platform/main.go`.

---

## Related

- Operator-state migrator: `apps/platform/internal/opstate/` · CLI `cmd/opstate`
- Selection rationale + gates: `apps/platform/internal/curation/starter.go`
- Storage / API / policy: `apps/platform/internal/curation/curation.go`
- Enforcement + fail-safe: `apps/game-server/src/curation/whitelist.ts`
- Console page: `apps/admin/src/ui/CurationPage.tsx`
- Feature TODO ↔ test map: `docs/todo/whitelist.md`
