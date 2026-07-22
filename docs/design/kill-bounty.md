# Kill bounty (擊殺賞金) — design

Task #90, phase 2. **Design only — no source or content file is touched by this document.**
Written while #82 (economy), #84 (revive circles) and #89 (guardian tower) are all in flight;
every number below is expressed against a symbol those tasks own, never against a literal.

> 「每場有打死一個敵方玩家可獲得額外金幣，但復活的不再多發放」
> — user, 2026-07-22

---

## 0. What this rule actually changes

Killing an enemy champion **already** pays gold today:

```ts
// packages/shared/src/sim/systems/DeathSystem.ts:32-39
} else if (world.champion.has(id)) {
  recordChampionDeath(world, id, killer);
  if (killer !== null && world.champion.has(killer)) {
    grantXp(world, killer, XP_REWARDS.kill);
    grantGold(world, killer, GOLD_REWARDS.kill);   // 150, flat, every death
    fireHooks(world, killer, "onKill", id);
  }
}
```

So #90 is **not** "add a bounty". It is four separate decisions on a payout that already
exists but was never designed:

1. it pays on **every** death, which is the farm the user is closing;
2. `GOLD_REWARDS.kill = 150` was never derived against anything;
3. `GOLD_REWARDS.assist = 75` and `XP_REWARDS.assist = 60` are **dead constants** —
   assists are counted (`matchStats.ts:261-273`) but never paid;
4. there is **no team check** at the payout site, only `world.champion.has(killer)`.

### 額外 means "instead of", not "on top of"

`GOLD_REWARDS.kill` is **retired and replaced** by the bounty purse. It is not stacked with it.

Reasoning: two coexisting kill rewards with *different* anti-farm rules is incoherent and
unteachable — a revived player killed a second time would still pay 150g, which makes
「復活的不再多發放」 observably false the first time a player checks. 額外 is extra
relative to the round grants and the duel settle (the income you get for showing up), which
is exactly what a bounty is. The user is describing the kill reward, not a second one.

`GOLD_REWARDS.assist = 75` stops being dead and becomes the natural full-participation share
(see §3) — the design lands back on the two numbers the codebase already declares.

**XP is untouched.** `XP_REWARDS.kill = 120` keeps paying on every death, including a
revived player's second death. The user's rule is explicitly about 金幣; XP is hard-capped
by `LEVEL_CAP = 18` and dominated by the round table's `grantLevels` (2/1/1/1/1/1), so XP
farming has a ceiling gold does not. Revisit only if playtest shows level runaway.

---

## 1. 場 = **ROUND**

### The decision

One bounty per enemy player **per combat round**. The ledger is cleared on combat entry.

### Why the user means round

Decisive internal evidence: in task #82 the same user wrote
「累積購買到 20 次之後(如果金錢全購買**大約是第五場之後**)」, and #82 resolved 第五場 as
**round 5** of the arena's round table — the derivation in
`packages/shared/src/sim/economy/itemTiers.ts` is written against rounds, and it is correct.
場 is this project's word for a round. The mechanic that motivates the rule (#84's revive)
also lives and dies entirely inside one combat round: `beginCombatRevives` arms it in
`enterCombat`, `endCombatRevives` destroys every circle in `concludeCombat`.

### What per-MATCH would actually do, priced out

`PairedDuels.ts` runs a 4-team circle rotation that **repeats every 3 rounds**:
r1 `[0-1, 2-3]`, r2 `[0-2, 1-3]`, r3 `[0-3, 1-2]`, r4 = r1's pairing again. So by the end of
round 3 **every team has already met every other team**. Under per-match scope each of the 9
enemy players pays at most once for the whole match; a team that wipes its opponent in rounds
1-3 has collected all 9 purses and from **round 4 onward the mechanic is identically zero**.
Matches commonly run 5-7 rounds (`livesLost` = 1/1/2/2/3/3… against 3 team lives), so
per-match kills the bounty across 40-60% of the match — and specifically the late rounds,
where the duels are most decisive. Worse, it inverts the incentive at the margin: once an
enemy has paid, there is no longer a *gold* reason to kill them.

That is a far bigger change than the user asked for. Rejected.

### The third reading, kept as the off-switch

Per-**life** (pay on every death) is the status quo — precisely what the user is ruling out.
It survives only as a config value, so the mechanic can be disabled without a code change.

### Configurable

```jsonc
"killBounty": { "scope": "round" }   // "round" | "match" | "life"
```

`scope` selects the ledger's reset point and nothing else:

| scope | ledger cleared | meaning |
| --- | --- | --- |
| `round` *(ship this)* | `enterCombat`, same tick as `beginCombatRevives` | one purse per enemy per round |
| `match` | never (armed once at match start) | one purse per enemy per match |
| `life` | no ledger consulted | legacy: pays every death |

Absent `killBounty` block = the mechanic is off and `DeathSystem` keeps its current flat
behaviour — the same additive-config contract `flowers` and `reviveCircles` already use
(`packages/shared/src/content/schema/config.ts`, `zFlowerConfig`/`zReviveCircleConfig`
are both `.optional()`).

---

## 2. How much — **one SIMPLE item per enemy**

### The decision

```ts
BOUNTY_PURSE = simpleUnits × ITEM_TIER_PRICE.SIMPLE      // 1.0 × 300 = 300g
```

Written as a **symbol, not a literal**. When #82 retunes `SIMPLE`, the bounty moves with it
and this design does not need re-deriving. That is the whole point of expressing it in tier
language.

### The anchor ratios — this is the actual design decision

Against the price ladder #82 has already landed
(`itemTiers.ts`: `SIMPLE 300`, `POWERFUL 1200`, `LEGENDARY_ORB_PRICE 2400`,
`STAT_TICK_PRICE 375`):

| you did this | you have earned |
| --- | --- |
| kill 1 enemy alone | **1 SIMPLE** (300g) |
| kill 4 enemies alone | **1 POWERFUL** (1200g) |
| kill 8 enemies alone | **1 傳說寶玉** (2400g) |
| kill 1 enemy alone | 0.8 of a 能力屬性強化 tick |
| land the blow with both teammates helping | **½ SIMPLE** (150g) — 2 such kills = 1 SIMPLE |
| assist with both teammates helping | **¼ SIMPLE** (75g) — 4 such assists = 1 SIMPLE |

One sentence a player can hold in their head: **一個敵人 = 一件簡易武器，全隊分。**

### Why 1 SIMPLE and not ½ or 2

**Average-income derivation.** Both zones together mint ~6 purses per round (a duel ends when
one side is fully down, so the winner takes 3; the loser typically takes 0-2). Spread across
12 players over a ~5-round match that is `≈ 2.7 × P` per player. Targeting ~10% of the 7,600g
deterministic income gives `P ≈ 280`. 300 is the nearest tier value, and it is *the* tier value.

**It divides.** The 2:1:1 participation split (§3) needs the purse divisible by 4, 3 and 2.
`300 = 4×75 = 3×100 = 2×150` — and the three-way split lands on **150 / 75 / 75**, which are
`GOLD_REWARDS.kill` and `GOLD_REWARDS.assist` exactly. Nothing regresses; the dead constant
becomes live.

**The resulting spread is one item, not a match.** Over a full match:
a passive player earns ~300g of bounty (~4% of income), the median winner ~1,500g (~20%),
a perfect carry up to ~2,700g. The best-to-worst differential is roughly **one POWERFUL
item** — meaningful, not decisive.

**The ceiling is crisp.** Because each of the three enemies in a duel pays at most once per
round, a 3v3 duel mints **at most 900g of bounty per team per round**, regardless of how many
times anyone dies or revives. That single sentence is the whole anti-snowball guarantee.

### The one number #82 must re-check

The bounty is income #82's stat-path calibration does not currently include. Walking the real
round table (`content/config/arena-rules.json`, `STARTING_GOLD = 600`), buying a stat tick
whenever affordable:

| | 20th tick lands |
| --- | --- |
| no bounty (#82's stated baseline) | **round-6 shop** ✓ matches `statPath.ts` |
| +300 bounty/round, wins every duel | **round-5 shop** |

So a player who wins every duel *and* takes a full share every round reaches the capstone
**exactly one shop earlier**. 「大約是第五場之後」 still holds, but the margin is gone.
This is the coordination item: `arenaItemModel.test.ts`'s `const CEILING = 7600` and
`starter_content_test.go` both understate real income already (they omit the +1,800 of
round-win gold entirely); the bounty is the third omission, not the first.
**#82 owns that constant — this design does not change it, it reports the delta.**
If playtest shows the capstone landing too early, the lever is `simpleUnits: 0.5`, no rebuild.

### Observation handed to #82, not acted on

`rounds.1` in `arena-rules.json` has `grantLevels: 2` and `autoLearn` but **no `grantGold`**.
Round 1 is therefore the one round where the bounty is the *largest* line on the ledger
(300 win + up to 900 bounty, against a 0g grant). That is a property of the round table, not
of the bounty, and it is #82's to decide.

---

## 3. Who is paid — a **fixed purse, split by participation**

### The decision

Neither killer-only nor team-wide. The purse belongs to **the victim**, is a fixed size, and
is divided among everyone who was credited with the kill or an assist:

- killer weight **2**, each qualifying assistant weight **1**
- shares are integer: `share_i = floor(P × w_i / ΣW)`, and **the killer absorbs the remainder**
  (`killerShare = P − Σ assistShares`), so the purse always sums exactly and never leaks
- "qualifying assistant" is **exactly** the predicate `recordChampionDeath` already uses:
  an enemy champion that damaged the victim within `ASSIST_WINDOW_TICKS` (300 ticks = 10s)
  and is not the killer (`matchStats.ts:261-273`). No second predicate is written.

| participants | killer | assist | assist |
| --- | --- | --- | --- |
| solo | **300** | — | — |
| killer + 1 | **200** | 100 | — |
| killer + 2 | **150** | 75 | 75 |

### Why a fixed purse

**Killer-only rewards the wrong thing.** In a 3v3 where two players set up the kill and a
third lands it, killer-only pays the third player everything.

**Team-wide erases individual skill,** and pays a teammate who was fighting in the other
half of the zone.

**A fixed purse makes kill-stealing economically neutral.** The team gains the same 300g
whether one player solos or three collaborate; only the *internal* distribution moves. This
matters enormously here, because kill credit is currently **broken** (§8): a 0-damage chip
hit on the same tick steals the kill. With a fixed purse the bug costs a team nothing —
it only shuffles who gets 150 vs 75. With a killer-only payout the bug would cost a team
gold on every contested kill. The purse design is robust to an attribution bug the split
would otherwise amplify.

**Solo kills still pay double what a shared kill pays the killer** (300 vs 150), which is
where individual skill is rewarded — without ever punishing the team for helping.

Assistants do **not** need to be alive or in the zone at payout time (LoL pays dead
assistants; a player who traded their life setting up the kill earned the share).

### Ordering trap — load-bearing

`recordChampionDeath` **deletes the assist list at the end of its own body**:

```ts
// packages/shared/src/sim/stats/matchStats.ts:272
world.recentDamagers.delete(victim);
```

`DeathSystem` calls `recordChampionDeath(world, id, killer)` **before** granting gold, so a
bounty split naively appended after it would find the assist list already gone. Fix by having
`recordChampionDeath` **return the list of assistants it credited** and feeding that list to
the split. That is also the only way to guarantee assist *gold* and the assist *counter* can
never disagree — one predicate, one iteration, two consumers. Do not snapshot-and-duplicate.

Iterate assistants **sorted ascending by EntityId** before paying. `recentDamagers` is a
Map in first-damage insertion order, which is deterministic today, but the sort makes the
payout order independent of that and immune to a future refactor of `recordDamage`.

---

## 4. Flat, not scaled

MOBA bounties normally scale with the victim's streak or net worth as a comeback lever.
That does not earn its complexity here, for five reasons:

1. **The comeback lever already exists and is 8× larger.** The round grants are identical for
   winners and losers — round 3 hands *every surviving player* 2,500g, against a 300g purse.
   Gold catch-up in this arena is done by the round table, not by bounties. A scaling bounty
   would be a rounding error on top of it.
2. **Gold is not net worth here.** #82's stat path spends gold into `statStacks` that occupy
   no inventory slot, and both draft surfaces grant items *free*. Two players with identical
   `champ.gold` can differ by an entire legendary. A net-worth-scaled bounty would misprice
   systematically, and it would misprice *hardest* against the stat-path player — punishing
   the exact build #82 is trying to make viable.
3. **Streak scaling is structurally incompatible with the anti-farm rule.** A bounty grows on
   a streak; the once-per-round rule caps a victim at one payout per round, so a within-round
   streak on one victim cannot exist by construction. A cross-round streak would need per-match
   memory — reintroducing exactly the per-match bookkeeping §1 rejected.
4. **Legibility.** A flat purse is one number and one sentence. A scaled one needs a HUD
   element to communicate ("this enemy is worth 640g") and a tuning table nobody has data for.
5. **It survives #82.** "One SIMPLE" re-derives itself automatically when the tier price moves.
   A curve would need re-deriving on every economy change, by whoever notices.

**Revisit only if** playtest shows a single team compounding an unrecoverable lead — and
revisit it **after #89's tower lands**, because a full-HP/MP restore plus gold to the team
already ahead is a much larger snowball vector than a 300g purse, and a comeback lever should
be designed against the bigger one.

---

## 5. The ledger — per-victim, **global**

### The decision

One set. Membership means **"a purse has been paid for this player this round."**
It is keyed by the **victim**, and it is **global — not per-victim-per-killer.**

### Why global

**The user's words carry no qualifier.** 「復活的不再多發放」 — the revived one is not paid
out *again*, full stop. Nothing about who does the killing.

**Per-victim-per-killer leaves the exact loophole being closed.** Three enemies could each
collect once from the same repeatedly-revived player. With `revivesPerTeamPerRound` raised
from 1 to 2, one opponent would mint 3 purses (900g) instead of 1. Per-killer bookkeeping is
also strictly more state (a set per victim rather than a set) for a strictly worse rule.

**Global is the only version that makes reviving safe**, which is the entire point. The
reviving team can know, without arithmetic, that the player they bring back carries **zero**
bounty. Reviving can never fund the enemy. Under any per-killer variant, reviving hands the
enemy team fresh purses — a self-inflicted tax on using #84's mechanic, and #84's mechanic
would be strictly dominated by not using it.

### The invariant, in one line

> **每個敵人每場最多發一次賞金** — each enemy mints at most one purse per round, however
> many times they die.

### What is remembered, and the exact grain

```ts
/** seats whose bounty purse has already been paid this round */
readonly bountyPaid = new Set<SeatId>();
```

**Keyed by `SeatId`, not `EntityId`.** `world.team.get(victim).seatId` is the stable
per-player identity across a champion entity being replaced; `EntityId` happens to be stable
today (champion entities are never destroyed — `MatchRoom.ts:268-291` swaps a disconnected
seat's *driver* to `AIDriver` and leaves the entity alone) but it is the weaker key, and a
future champion swap must not refund a bounty. `SeatId` is also the grain #84 already chose
for `ReviveCircleComp.ownerSeatId`.

**Membership is added only when a purse is actually PAID**, never merely when the victim dies.
This one choice resolves the tower question (§6) and closes a denial exploit; see there.

### Lifecycle

- **Armed / cleared** by the match host in `enterCombat`, on the same tick as
  `beginCombatRevives` — one more host-armed per-round bag, exactly the seam #84 just
  established for `reviveCharges`. Do not clear it in `concludeCombat`: the resolution phase
  and the round-end HUD may still want to read it.
- **Gated** on the rules being armed (`world.bountyRules !== null`), so the client's
  prediction shadow world — which never arms them — is a strict no-op, identical to the
  flower and revive contracts. This makes the shadow world diverge *less* than it does today,
  where `grantGold` runs there unconditionally.

### Determinism

- No `Math.random`, no wall clock, no trig, no `world.rng` draw anywhere in this design.
  Every share is integer arithmetic on a config constant.
- The set is authoritative world state and **folds into `SimWorld.digest()`**. Digest it by
  iterating `world.champion` (insertion order = spawn order = deterministic) and mixing
  `bountyPaid.has(seatIdOf(id)) ? 1 : 0` per champion — **never** by iterating the Set, so
  the digest is independent of insertion order and a replay divergence in *when* a purse was
  paid surfaces as a mismatch rather than hiding behind an ordering coincidence.
- Add `bountyGold` to `PlayerMatchStats` and to the digest's `matchStats` block (§7).
- Reset happens at a tick the host drives identically on every replica, so same-seed replay
  is byte-identical.

---

## 6. Neutrals — the guardian tower (#89), and friendly fire

#89 has landed **no sim code** (greps across `packages/shared/src/sim`, `content/config` and
`apps/game-server/src/match` return nothing), so both designs are still soft. Settling it now:

### 6a. A tower kill pays **nobody**

The payout gate stays `world.champion.has(killer)` **and** a new team check (6c). A tower is
neutral — there is no team to pay, exactly as flowers pay nothing today
(`DeathSystem.ts:26-30`, and flowers deal no damage at all so they never even appear as a
`lastDamager`). Revive circles are likewise structurally invisible: `revive.ts` gives them no
health and no `TeamComp`.

### 6b. A tower kill does **not** consume the bounty

Because membership is added on **payment**, not on death, a player killed by the tower still
owes their purse; the first *champion* to kill them that round collects it.

This is the anti-denial choice, and it matters. Under the alternative ("the victim died, so
the purse is spent"), a losing team could deliberately walk into the tower's AoE to **deny**
the enemy their bounty — tower-feeding as a gold-denial strategy. That is a griefing
mechanic, it is unteachable, and it makes #89's AoE punish a *reward* for the team being
punished.

It is also consistent with the user's words: 「復活的**不再多**發放」 presupposes a prior
payout. A player who never paid has nothing "more" to withhold.

### 6c. The payout requires **different teams** — this is a real hole today

`DeathSystem.ts:35` checks only `world.champion.has(killer)`. **There is no team check.**
Today only `ProjectileSystem.ts:41` refuses friendly fire; `BasicAttackSystem`,
`effectRunner` and any future AoE have no such guard, and #89's tower AoE is explicitly
designed to hit *everyone* nearby.

Without a team check the bounty is self-farmable: kill your own teammate for 300g, have a
third teammate revive them, repeat. The once-per-round rule bounds it but does not close it
(600g/round of free gold for a 3-man team). Add explicitly, at the payout site:

```
pay only if  killer ≠ victim  and  team(killer) ≠ team(victim)
```

Both clauses. Self-damage kills (suicide into the tower) pay nothing and consume nothing.

### 6d. Tower damage must never buy an assist share

`recordDamage` only logs a damager into `recentDamagers` when both sides have a `TeamComp`
and the teams differ (`matchStats.ts:143-152`). A neutral tower with no `TeamComp` is
therefore already excluded. **#89 must not give the tower a `TeamComp`** — if it does, its
AoE would silently start buying assist shares of every bounty in the zone. Give it
`ReviveCircleComp`-style ownership fields instead, exactly as #84 did.

### 6e. The tower's own last-hit reward is #89's purse, not this one

#89 wants gold for last-hitting the tower. That is a **separate** payout with a separate
number and it must not reuse `bountyPaid` — a tower is not a seat. #89 should price it in the
same tier language (a reasonable starting point: the tower is a contested objective that also
grants a buff and a full HP/MP restore, so its *gold* component should be **smaller** than a
champion kill, not larger — the restore and the buff are already most of the reward). If #89
lands a per-round respawning tower, it needs its own once-per-round guard for the same reason
this design has one.

---

## 7. Legibility — yes, show it separately

A player who cannot see why their gold moved cannot learn the rule, and this rule has a
counter-intuitive half (an enemy who is worth nothing).

### Settlement

Add a **22nd counter**, `bountyGold`, to `PlayerMatchStats` (fold into `digest()` alongside
the other 21). Render it in the settlement breakdown as a sub-line under gold —
「賞金 1,500 / 總金幣 9,100」 — reusing the `settle-stat-format` row builder.

**Show it, do not grade it.** `rating.ts` already weights `kills`, `assists`,
`killParticipation` and `multikills`; `goldEarned` is deliberately not graded. Feeding
`bountyGold` into `grade()` would double-count the exact aggression signal `kp` already
carries, and would tilt the S+..C- ladder toward the winning team twice.

### In-match — the important half

The settlement is a post-mortem; the rule has to be readable *while* it applies:

- **On payment**: a bounty pop distinct from the damage numbers, on the floating-combat-text
  surface #92 is building. Route through it rather than adding a second text system.
- **On a revived enemy — this is the one that actually matters.** A player who cannot see
  that a revived opponent is worth nothing will chase them for gold that does not exist.
  The revived champion needs a visible 「已發賞」 state on their nameplate (greyed bounty
  glyph, or the enemy healthbar carrying a spent-purse marker). Coordinate with **#84**
  (which owns the revive HUD), **#85** (death spectator desaturation) and **#42**'s corner
  registry — never hard-code a corner.
- **Announcer**: no new VO line. The bounty is not a first-blood moment and #57's pack is
  already dense.

---

## 8. Prerequisite fixes — both are in #90's path

### 8a. Kill credit is "last damager this tick", not "killing blow"

```ts
// DeathSystem.ts:12-24 — the whole of kill attribution
for (const ev of world.events) {
  if (ev.type === "damage") lastDamager.set(ev.data.target, ev.data.source);
}
```

`combatResolveSystem` (step 8) skips only packets whose target is already `!hp.alive`, and
`hp.alive` is not cleared until `deathSystem` (step 9). So every packet queued after the one
that crossed 0 still resolves and still overwrites `lastDamager` — **including a fully
shielded 0-damage chip hit**, because the `damage` event is emitted unconditionally per
resolved packet.

The correct flag **already exists and is already on the wire**:

```ts
// packages/shared/src/sim/combat/damage.ts:231
const killingBlow = hpBefore > 0 && hp.hp <= 0; // only the packet that crosses 0
```

It is in the emitted `damage` payload (`damage.ts:236-246`). The fix is one predicate in
`DeathSystem`'s event loop: only record a `lastDamager` when `ev.data.killingBlow` is true.
No test anywhere currently asserts champion-vs-champion kill credit — `flowers.test.ts` only
covers the flower path — so this must land with its own test.

The fixed-purse design (§3) means this bug costs a team no *gold* even before the fix; it
still corrupts `kills`, the multikill streak and the S+..C- rating, so fix it.

### 8b. `recordChampionDeath` destroys the assist list it must hand over

See §3, "Ordering trap". `matchStats.ts:272`.

### 8c. Non-issues, confirmed by inspection — do not spend design budget here

- **Damage over time does not exist.** `StatusEffect` carries only
  `moveSpeedMult / root / stun`; there are exactly three damage producers
  (`BasicAttackSystem.ts:221`, `ProjectileSystem.ts:60`, `effectRunner.ts:40`), all carrying
  a live caster. No orphan-DoT attribution problem. **#78 must not introduce one silently.**
- **Overkill is irrelevant.** `hp.hp` is clamped to 0 and the purse is flat.
- **In-flight projectiles cannot kill a corpse.** `ProjectileSystem.ts:39` skips
  `!chp?.alive`; no posthumous credit exists.
- **A disconnected killer still gets paid.** `MatchRoom.ts:268-291` swaps the driver, keeps
  the seat and entity. Correct as-is.
- **`killer = null`** pays no gold and no XP, but `recordChampionDeath` still books the death
  **and still pays assists** — the `recentDamagers` loop sits outside the killer branch.
  Under this design a null-killer death should still pay the assistants their shares and
  **mark the purse spent**, with the killer's remainder share simply unpaid. Otherwise a
  well-set-up kill finished by an environmental tick pays nobody.

---

## 9. Config surface

`content/config/arena-rules.json`, alongside `flowers` and `reviveCircles`, with the same
optional-block contract (absent = mechanic off = legacy behaviour):

```jsonc
"killBounty": {
  "scope": "round",          // "round" | "match" | "life"  — §1
  "simpleUnits": 1.0,        // purse = simpleUnits × ITEM_TIER_PRICE.SIMPLE — §2
  "killerWeight": 2,         // §3
  "assistWeight": 1,
  "assistWindowSec": 10      // must equal ASSIST_WINDOW_TICKS / TICK_HZ — §3
}
```

Schema in `packages/shared/src/content/schema/config.ts` as `zKillBountyConfig`, mirroring
`zReviveCircleConfig`. Seconds → ticks conversion happens once at the host, exactly like
`reviveRulesFromConfig`. `assistWindowSec` must be validated against `ASSIST_WINDOW_TICKS`
rather than forked from it — one window, two readers.

Every question the user might revisit is a JSON edit: the scope, the size, the split, and
whether the mechanic exists at all.

---

## 10. What lands where (phase 3)

| change | file |
| --- | --- |
| `killingBlow` gate on kill credit | `sim/systems/DeathSystem.ts` |
| bounty payout + team check + ledger check | `sim/systems/DeathSystem.ts` |
| `recordChampionDeath` returns credited assistants; `bountyGold` counter | `sim/stats/matchStats.ts` |
| purse + split (pure, no world access) | `sim/economy/bounty.ts` *(new)* |
| retire `GOLD_REWARDS.kill` / `.assist` | `sim/economy/progression.ts` |
| `bountyRules`, `bountyPaid`, digest fold | `sim/SimWorld.ts` |
| `beginCombatBounty` / `endCombatBounty` | `sim/bounty.ts` *(new, mirrors `revive.ts`)* |
| arm/clear per round | `game-server/src/match/MatchController.ts` (`enterCombat`) |
| `zKillBountyConfig` | `shared/src/content/schema/config.ts` |
| `killBounty` block | `content/config/arena-rules.json` |
| settlement sub-line | client `MatchEndPanel` / `settle-stat-format` |
| bounty pop | #92's floating combat text |
| 已發賞 nameplate state | #84's revive HUD |

The todo checklist belongs in `docs/todo/economy.md` when phase 3 starts — **not now**, while
#82 is actively rewriting that file.

Proposed test ids: `bounty-once-per-round` · `bounty-revive-no-repay` ·
`bounty-purse-split-exact` · `bounty-killing-blow-credit` · `bounty-no-friendly-fire` ·
`bounty-tower-kill-pays-nobody` · `bounty-tower-kill-does-not-consume` ·
`bounty-scope-config` · `bounty-deterministic-replay` · `bounty-digest-folds`.

---

## 11. Coordination

- **#82** — the bounty is income the `CEILING = 7600` constant in
  `apps/game-server/src/curation/arenaItemModel.test.ts:227-229` and
  `apps/platform/internal/curation/starter_content_test.go:282,285` does not model, and it is
  the *third* omission there (round-win gold, +1,800 for a 6-round winner, is the first).
  §2 gives the exact capstone-timing delta: **round-6 shop → round-5 shop** for a player who
  wins every duel. #82 owns whether that is acceptable; the lever is `simpleUnits`.
- **#84** — this rule is what makes the revive circle *safe to attempt*. Under the global
  per-victim ledger the revived player carries zero bounty, so reviving can never fund the
  enemy. State that in the revive doc; it is the mechanic's main risk, and #90 removes it.
  Note also that today's `revivesPerTeamPerRound: 1` already bounds the farm to one extra
  payout per team per round — the rule's value is structural (it holds at *any* charge count),
  not marginal at the current one.
- **#89** — three commitments taken here, all still cheap to honour: a tower kill pays nobody
  (6a); a tower kill does **not** consume the victim's bounty (6b); the tower must **not**
  carry a `TeamComp`, or it starts buying assist shares (6d). The tower's own last-hit gold
  is #89's number, priced in the same tier language, and needs its own once-per-spawn guard.
- **#78** — do not introduce a damage-over-time source without a live attributed caster;
  §8c is the only reason kill attribution is currently tractable.
