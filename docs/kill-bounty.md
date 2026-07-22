# Kill bounty (擊殺賞金) — final spec

Task #90, phase 3 (post-review). **Design only — this document touches no source or content file.**
Written while #82 (economy), #84 (revive circles) and #89 (guardian tower) are all in flight.
Every number is expressed against a symbol those tasks own, never against a literal.

> 「每場有打死一個敵方玩家可獲得額外金幣，但復活的不再多發放」
> — user, 2026-07-22

Supersedes `docs/design/kill-bounty.md` (phase 2). Three adversarial reviews landed against
that draft; **two of its decisions are reversed here**, one factual claim in it was wrong, and
one blocker it did not see is now the largest single change in the spec. §14 dispositions
every review point — fixed, accepted, or rejected with an argument. Nothing was dropped.

---

## 0. The rule, in one line

> **每個敵人每場只值一次賞金 — 死了就結清。**
> Each enemy is worth one bounty per round. Once they have died, that bounty is settled,
> however they died and whoever (if anyone) got paid for it.

That sentence is the whole mechanic. It is deliberately keyed on **dying**, not on
**being paid for**, because 「**復活的**不再多發放」 keys on the same thing: 復活的 is the one
who died and came back — not the one somebody collected on.

### What changed since phase 2

| | phase 2 | **final** | why |
| --- | --- | --- | --- |
| ledger semantics | 已發賞 — consumed on **payment** | **已結清 — consumed on the victim's first death, any cause** | §5. Payment-keying made 「reviving is safe」 false for tower / friendly-fire / null-killer deaths, and turned #84 into a 300g self-tax. |
| combat gate | `world.bountyRules !== null` | **`world.bountyRules !== null && world.combatActive`** | §6. The sim runs in every phase. Without this the payout is live for 66 unopposed seconds after every round ends. |
| rules lifecycle | "do not clear in `concludeCombat`" | **cleared in `concludeCombat`, mirroring `endCombatRevives`** | §5.3. The phase-2 claim that #84 leaves its rules armed was simply false — `MatchController.ts:588` calls `endCombatRevives`, which nulls `reviveRules`. |
| share denominator | unstated | **the killer's weight is always in ΣW, even when the killer is not paid** | §3. Otherwise a tower last-hit would pay the two assistants *more* than a champion kill does. |

Everything else from phase 2 survives review and is restated here in full.

---

## 1. What this replaces

Killing an enemy champion already pays gold today:

```ts
// packages/shared/src/sim/systems/DeathSystem.ts:32-39
} else if (world.champion.has(id)) {
  recordChampionDeath(world, id, killer);
  if (killer !== null && world.champion.has(killer)) {
    grantXp(world, killer, XP_REWARDS.kill);
    grantGold(world, killer, GOLD_REWARDS.kill);   // 150, flat, every death, every phase
    fireHooks(world, killer, "onKill", id);
  }
}
```

#90 is therefore not "add a bounty". It is five decisions on a payout that already exists and
was never designed:

1. it pays on **every** death — the farm the user is closing;
2. `GOLD_REWARDS.kill = 150` was never derived against anything;
3. `GOLD_REWARDS.assist = 75` / `XP_REWARDS.assist = 60` are **dead constants** — assists are
   counted (`matchStats.ts:261-273`) but never paid;
4. there is **no team check** at the payout site — only `world.champion.has(killer)`;
5. it fires **in every phase**, including 66 seconds after the round is already settled (§6).

### 額外 means "instead of", not "on top of"

`GOLD_REWARDS.kill` is **retired and replaced** by the bounty purse, not stacked with it.

Two coexisting kill rewards with *different* anti-farm rules is incoherent and unteachable: a
revived player killed a second time would still pay 150g, which makes 「復活的不再多發放」
observably false the first time a player checks. 額外 is extra relative to the round grants and
the duel settle — the income you get for showing up — which is exactly what a bounty is.

All three reviews independently adopted this reading. It stands.

`GOLD_REWARDS.assist = 75` stops being dead and becomes the full-participation share (§3): the
design lands back on the two numbers the codebase already declares.

**XP is untouched by the anti-farm rule.** `XP_REWARDS.kill = 120` keeps paying per death,
including a revived player's second death. The user's rule is explicitly about 金幣, and XP is
hard-capped by `LEVEL_CAP = 18` and dominated by the round table's `grantLevels`. XP *is*
affected by the combat-window gate (§6) — that is a different question and a different bug.

### Dead config, do not repeat it

`content/config/config.match.json` declares `economy.killGold: 150`, `assistGold: 75`,
`roundWinGold: 300`, `roundLoseGold: 150`, `startingGold: 600`, `sellRefund`, `inventorySlots`.
The schema validates all seven (`content/schema/config.ts:42-49`). **Nothing reads any of
them** — `progression.ts` hardcodes every one. A designer editing `killGold` today sees no
effect. This is why `killBounty` goes in **`arena-rules.json`** (which *is* read — `this.rules.flowers`,
`this.rules.reviveCircles`) and not in `config.match.json`. Retiring `GOLD_REWARDS.kill` should
take `economy.killGold` / `assistGold` with it; the rest of that block is #82's to reconcile.

---

## 2. 場 = **ROUND**

One bounty per enemy player **per combat round**. The ledger is cleared on combat entry.

### Why round

Decisive internal evidence: in #82 the same user wrote
「累積購買到 20 次之後(如果金錢全購買**大約是第五場之後**)」, and #82 resolved 第五場 as **round 5**
of the arena round table — `itemTiers.ts`'s derivation is written against rounds and it is
correct. 場 is this project's word for a round. The mechanic that motivates the rule (#84's
revive) also lives and dies entirely inside one combat round: `beginCombatRevives` arms it in
`enterCombat`, `endCombatRevives` destroys every circle in `concludeCombat`.

### Per-match, priced out

`PairedDuels.ts` runs a 4-team circle rotation that **repeats every 3 rounds** — r1 `[0-1, 2-3]`,
r2 `[0-2, 1-3]`, r3 `[0-3, 1-2]`, r4 = r1 again. By the end of round 3 every team has met every
other team. Under per-match scope each of the 9 enemy players pays at most once for the whole
match; a team that wipes its opponents in rounds 1-3 has collected all 9 purses, and from
**round 4 onward the mechanic is identically zero**. Matches commonly run 5-7 rounds, so
per-match kills the bounty across 40-60% of the match — and specifically the decisive late
rounds. It also inverts the incentive: once an enemy has paid, there is no longer a gold reason
to kill them, ever again. Rejected.

### Per-life, kept as the off-switch

Pay on every death — the status quo, precisely what the user is ruling out. It survives only as
a config value so the mechanic can be disabled without a code change.

| `scope` | ledger cleared | meaning |
| --- | --- | --- |
| `"round"` **(ship this)** | `enterCombat`, same tick as `beginCombatRevives` | one purse per enemy per round |
| `"match"` | never (armed once at match start) | one purse per enemy per match |
| `"life"` | ledger not consulted | legacy: pays every death |

Absent `killBounty` block = mechanic off = today's behaviour, the same additive-config contract
`flowers` and `reviveCircles` already use (both `.optional()` in `content/schema/config.ts`).

---

## 3. How much, and who is paid

### 3.1 The purse — one SIMPLE item per enemy

```ts
BOUNTY_PURSE = simpleUnits × ITEM_TIER_PRICE.SIMPLE      // 1.0 × 300 = 300g
```

A **symbol, not a literal**. When #82 retunes `SIMPLE`, the bounty moves with it and this
document does not need re-deriving. That is the entire point of pricing in tier language.

Against the ladder #82 has landed (`itemTiers.ts`: `SIMPLE 300`, `POWERFUL 1200`,
`LEGENDARY_ORB_PRICE 2400`, `STAT_TICK_PRICE 375`):

| you did this | you earned |
| --- | --- |
| kill 1 enemy alone | **1 SIMPLE** (300g) |
| kill 4 enemies alone | **1 POWERFUL** (1200g) |
| kill 8 enemies alone | **1 傳說寶玉** (2400g) |
| kill 1 enemy alone | 0.8 of a 能力屬性強化 tick |
| land the blow with both teammates helping | **½ SIMPLE** (150g) |
| assist with both teammates helping | **¼ SIMPLE** (75g) |

One sentence a player can hold: **一個敵人 = 一件簡易武器，全隊分。**

**Why 1 SIMPLE.** Both zones together mint ~6 purses per round (a duel ends when one side is
fully down: the winner takes 3, the loser typically 0-2). Across 12 players over a ~5-round
match that is `≈ 2.7 × P` per player; targeting ~10% of the 7,600g deterministic income gives
`P ≈ 280`. 300 is the nearest tier value and it is *the* tier value.

**It divides.** The 2:1:1 split needs the purse divisible by 4, 3 and 2.
`300 = 4×75 = 3×100 = 2×150`, and the three-way split lands on **150 / 75 / 75** — exactly
`GOLD_REWARDS.kill` and `GOLD_REWARDS.assist`. Nothing regresses; the dead constant goes live.
(This is the concrete cost of the `simpleUnits: 0.5` lever: 150 splits 76/37/37. Still exact
via remainder absorption, but it stops landing on the numbers the codebase already declares.)

**The spread is one item, not a match.** Over a full match a passive player earns ~300g of
bounty (~4% of income), a median winner ~1,500g (~20%), a perfect carry up to ~2,700g. Best-to-
worst is roughly **one POWERFUL item** — meaningful, not decisive.

**The ceiling is crisp.** Each of the three enemies in a duel is settled at most once per round,
so a 3v3 duel mints **at most 900g of bounty per team per round**, regardless of how many times
anyone dies or revives. That single sentence is the whole anti-snowball guarantee — and it
depends on zone isolation, which is real (`queries.ts:33`, `abilitySystem.ts:38-42`,
`BasicAttackSystem.ts:121`, `ProjectileSystem.ts:39-41`) but untested. See `bounty-zone-isolation`
and `bounty-ceiling-per-team-per-round` in §12.

### 3.2 The split — fixed purse, 2:1:1

The purse belongs to **the victim**, is a fixed size, and is divided among everyone credited
with the kill or an assist:

- killer weight **2**, each qualifying assistant weight **1**;
- `share_i = floor(P × w_i / ΣW)`, and **the killer absorbs the remainder**
  (`killerShare = P − Σ assistShares`), so a paid purse always sums to exactly `P`;
- **ΣW always includes the killer's weight of 2, even when the killer is not paid.** An unpaid
  killer share is simply *not minted* — it does not redistribute to the assistants. Without
  this, a tower last-hit on a victim with two assistants would pay them 150 each instead of 75,
  i.e. the whole purse — and the optimal play would become "chip them, then let the tower
  finish". That is exactly the perverse incentive #89's AoE must not create;
- a **qualifying assistant** is *exactly* the predicate `recordChampionDeath` already uses:
  a champion that damaged the victim within `ASSIST_WINDOW_TICKS` (300 ticks = 10s) and is not
  the killer (`matchStats.ts:261-273`). No second predicate is written anywhere. `recordDamage`
  already refuses to log same-team damagers (`matchStats.ts:143-152`), so every assistant is by
  construction an enemy of the victim and no extra team filter is needed on the assist side.

| participants | killer | assist | assist | minted |
| --- | --- | --- | --- | --- |
| solo | **300** | — | — | 300 |
| killer + 1 | **200** | 100 | — | 300 |
| killer + 2 | **150** | 75 | 75 | 300 |
| unpaid killer + 1 | *(150, unminted)* | 100 | — | 100 |
| unpaid killer + 2 | *(150, unminted)* | 75 | 75 | 150 |
| unpaid killer, no assists | — | — | — | 0 |

**Why a fixed purse.** Killer-only pays the third player everything in a 3v3 where two set up
the kill. Team-wide erases individual skill and pays a teammate fighting on the other side of
the zone. A fixed purse makes **kill-stealing economically neutral**: the team gains 300g
whether one player solos or three collaborate; only the internal distribution moves.

That matters more here than it would elsewhere, because kill credit is currently **broken**
(§10a) and §10a's fix *introduces* a hold-the-burst incentive that does not exist today. Under
last-damager-this-tick credit there is no reason to time your damage; under killing-blow credit
there is. The fixed purse de-fangs it: holding the blow moves at most 75g between two players
on the same team and costs the team nothing. What it still moves is the `kills` counter, the
multikill streak and the S+..C- rating — a mild last-hit incentive on *rating*, which is
standard MOBA behaviour and strictly better than the corrupt attribution it replaces.

**Solo kills still pay double what a shared kill pays the killer** (300 vs 150) — that is where
individual skill is rewarded, without ever punishing the team for helping.

Assistants need **not** be alive or in the zone at payout (LoL's rule; a player who traded their
life setting up the kill earned the share). Iterate assistants **sorted ascending by EntityId**
before paying: `recentDamagers` is a first-damage-insertion-order Map, deterministic today, but
the sort makes the payout order immune to any future refactor of `recordDamage`.

### 3.3 Flat, not scaled

MOBA bounties normally scale with streak or net worth as a comeback lever. Here that does not
earn its complexity:

1. **The comeback lever already exists and is 8× larger.** Round grants are identical for
   winners and losers — round 3 hands *every surviving player* 2,500g, against a 300g purse.
   Catch-up in this arena is done by the round table, not by bounties.
2. **Gold is not net worth here.** #82's stat path spends gold into `statStacks` that occupy no
   inventory slot, and both draft surfaces grant items free. Two players with identical
   `champ.gold` can differ by an entire legendary. A net-worth bounty would misprice
   systematically, and *hardest* against the stat-path player — the exact build #82 is trying
   to make viable.
3. **Streak scaling is structurally incompatible with the anti-farm rule.** A within-round
   streak on one victim cannot exist by construction; a cross-round streak needs the per-match
   memory §2 rejected.
4. **Legibility.** A flat purse is one number and one sentence. A curve needs a HUD element and
   a tuning table nobody has data for.
5. **It survives #82.** "One SIMPLE" re-derives itself. A curve must be re-derived on every
   economy change, by whoever notices.

Revisit only if playtest shows an unrecoverable compounding lead — and revisit it **after #89
lands**, because a full HP/MP restore plus a buff plus gold to the team already ahead is a far
larger snowball vector than a 300g purse.

### 3.4 The number #82 must re-check

Walking the real round table (`arena-rules.json`, `STARTING_GOLD = 600`), buying a stat tick
whenever affordable, for a player who wins every duel:

| | cumulative income at the round-5 shop | 20th tick lands |
| --- | --- | --- |
| no bounty (#82's stated baseline) | 7,300g → 19 ticks | **round-6 shop** ✓ matches `statPath.ts` |
| +300 bounty/round | 8,500g → 22 ticks | **round-5 shop** |

Exactly one shop earlier. 「大約是第五場之後」 still holds, but the margin is gone.

`const CEILING = 7600` in `apps/game-server/src/curation/arenaItemModel.test.ts:227-229` and
`apps/platform/internal/curation/starter_content_test.go:282,285` already understates real
income — it omits round-win gold entirely (+1,800 for a 6-round winner). The bounty is the
*third* omission there, not the first. **#82 owns that constant.** The lever, if it plays too
fast, is `simpleUnits: 0.5` — a JSON edit, no rebuild.

**And #90 is not purely inflationary.** §6's gate removes a measured **3,150g** of kill gold
per match that is currently paid for deaths after the round is already settled — 41% of the
whole `CEILING`. Netting the two, #90 moves gold *out* of stakes-free windows and *into*
decisive duels. #82 should model both halves, not just the purse.

### 3.5 Round 1, handed to #82

`rounds.1` has `grantLevels: 2` and `autoLearn` but **no `grantGold`**. Round 1 is therefore the
one round where the bounty is the largest line on the ledger (300 win + up to 900 bounty against
a 0g grant). That is a property of the round table, not of the bounty, and it is #82's call.

---

## 4. Tunables — every value, justified

`content/config/arena-rules.json`, beside `flowers` and `reviveCircles`, same optional-block
contract (absent = mechanic off = legacy behaviour):

```jsonc
"killBounty": {
  "scope": "round",          // "round" | "match" | "life"
  "simpleUnits": 1.0,
  "killerWeight": 2,
  "assistWeight": 1,
  "assistWindowSec": 10
}
```

| key | value | in #82 tier terms | justification |
| --- | --- | --- | --- |
| `scope` | `"round"` | — | §2. 場 = round, from the user's own 「第五場」 in #82. `"match"` zeroes the mechanic from round 4 (circle rotation repeats every 3 rounds); `"life"` is the status quo the user is ruling out, kept as the off-switch. |
| `simpleUnits` | `1.0` | purse = **1 × SIMPLE = 300g** | §3.1. ~10% of the 7,600g income model at ~2.7 purses/player/match; the only tier value near the 280g target; divides by 4/3/2 so the split lands on 150/75/75. |
| `killerWeight` | `2` | killer = **½ SIMPLE** in a full 3-man kill | §3.2. Solo kill pays 2× what a fully-shared kill pays the killer — skill is rewarded without punishing help. |
| `assistWeight` | `1` | assist = **¼ SIMPLE** | §3.2. 75g = `GOLD_REWARDS.assist`, the dead constant, brought to life unchanged. |
| `assistWindowSec` | `10` | — | Must equal `ASSIST_WINDOW_TICKS / tickHz` = 300/30. **Validate against the constant at load; do not fork it.** One window, two readers (assist counter and assist gold). |

Derived, not configured, because they are structural rather than tuning knobs:

| | value | why not a knob |
| --- | --- | --- |
| ledger grain | per **victim seat**, global | §5. Per-killer reopens the exact loophole. |
| consumption trigger | victim's **first death of the round**, any cause | §5. The user's rule keys on dying. |
| combat gate | `world.combatActive` | §6. Not a tuning question — it is the definition of "a round". |
| ΣW includes the killer slot always | yes | §3.2. Otherwise a tower last-hit overpays assistants. |

Every question the user might revisit — the scope, the size, the split, whether the mechanic
exists at all — is a JSON edit.

---

## 5. The ledger

### 5.1 Shape

```ts
/** seats whose bounty purse is settled this round — 已結清. Consumed by the
 *  victim's FIRST death of the round, whatever caused it and whoever was paid. */
readonly bountySpent = new Set<SeatId>();
```

**Keyed by `SeatId`, not `EntityId`.** `world.team.get(victim).seatId` is the stable per-player
identity across a champion entity being replaced. `EntityId` happens to be stable today
(champion entities are never destroyed — `MatchRoom.ts:268-291` swaps a disconnected seat's
*driver* to `AIDriver` and leaves the entity alone), but it is the weaker key and a future
champion swap must not refund a bounty. `SeatId` is also the grain #84 chose for
`ReviveCircleComp.ownerSeatId`. Both are `number & {__brand}`, so digest mixing is trivial.

**Global — one set, not a set per victim.** The user's words carry no qualifier:
「復活的不再多發放」, full stop, nothing about who does the killing. Per-victim-per-killer would
leave exactly the loophole being closed: three enemies each collecting once from the same
repeatedly-revived player. At `revivesPerTeamPerRound: 2` that is 900g from one opponent instead
of 300. It is also strictly more state for a strictly worse rule.

### 5.2 Consumed on **death**, not on payment — the phase-2 reversal

Phase 2 added membership on payment, and carved out §6b: "a tower kill does not consume the
bounty; the first champion to kill them that round collects it." That was wrong, and the review
that found it is right on every step:

- membership added on payment means an **outstanding** purse exists after a tower / friendly-fire
  / null-killer death;
- a corpse cannot be killed twice, and `enterCombat` (`MatchController.ts:413-462`) parks every
  seat `alive=false, hp=0` and the ledger resets;
- therefore an outstanding purse is collectable through **exactly one channel in the entire
  game: the victim's own team reviving them.**

So §6b's whole behavioural footprint was: **charge the reviving team 300g for pressing the
button #84 exists to provide.** Leaving your teammate dead became strictly +300g better than
reviving them. That directly contradicts phase 2's own headline claim ("reviving can never fund
the enemy") and it defeats the purpose of #84.

Worse, §6b did not even buy the anti-denial property it was written for. The fear was that a
losing team walks into #89's AoE to deny the enemy their bounty. Under §6b tower-suicide
**still** denies — the enemy collects nothing at that moment and has no way to force collection.
§6b converted "tower-suicide denies" into "tower-suicide denies **and then don't revive**". It
paid the losing team to leave its own mechanic unused.

**Final rule, no exceptions:**

> The purse is consumed by the victim's first death of the round, whatever caused it.
> Of that purse, every credited enemy assistant is paid their share. The killer's 2-share is
> paid only if the killer is an **enemy champion**. Unpaid shares are not minted.

One rule; it answers tower, friendly fire, self-kill and null-killer simultaneously, and it
makes 「reviving can never fund the enemy」 true **unconditionally**.

**Is tower-suicide denial still available?** Yes — and it is priced correctly. To deny ≤300g you
must die, which loses your team the duel: 150g instead of 300g of round gold *per player*
(−450g team-wide) plus a `livesLost` tick. Paying 450g and a life to deny 300g is not a
strategy, it is a mistake. No special-casing needed.

**Does "consume on death" create a new denial route?** One: team B executes its own dying
teammate to spend the purse before the enemy can collect. Two things bound it. First, the
share rule means it denies only the killer's 2-share (150g), not the assistants' 75+75 — the
enemies who chipped b1 still get paid. Second, it is only reachable because friendly fire is
reachable at all, which is a live bug that should be fixed at the targeting layer regardless
(§10c). Once basic attacks refuse friendly targets, this route is closed outright.

### 5.3 Lifecycle — mirror #84 exactly

Phase 2 said "do not clear it in `concludeCombat`" and claimed to mirror #84's seam. **That was
factually wrong.** `MatchController.ts:588` calls `endCombatRevives(this.world)`, and
`revive.ts:207-211` sets `world.reviveRules = null` and clears `reviveCharges`. #84's rules
*are* torn down at round end.

Final:

```
beginCombatBounty(world, rules, teams)   // enterCombat,     beside beginCombatRevives
endCombatBounty(world)                   // concludeCombat,  beside endCombatRevives
```

`beginCombatBounty` calls `endCombatBounty` first and is idempotent, exactly like
`beginCombatRevives`. `endCombatBounty` clears `bountySpent` and nulls `bountyRules`.

Nothing needs the ledger after `concludeCombat`: the settlement reads `bountyGold` from
`matchStats`, and the in-match 已結清 nameplate only exists during combat.

Gating on `world.bountyRules !== null` also makes the client's **prediction shadow world** — which
never arms them — a strict no-op, identical to the flower and revive contracts. Today the shadow
world runs `grantGold` unconditionally; #90 makes it diverge *less*.

### 5.4 Determinism

- No `Math.random`, no wall clock, no trig, no `world.rng` draw. Every share is integer
  arithmetic on a config constant.
- The set is authoritative world state and **folds into `SimWorld.digest()`**. Fold it by
  iterating `world.champion` (insertion order = spawn order = deterministic) and mixing
  `bountySpent.has(seatIdOf(id)) ? 1 : 0` per champion — **never** by iterating the Set. The
  digest is then independent of insertion order, and a replay divergence in *when* a purse was
  settled surfaces as a mismatch instead of hiding behind an ordering coincidence.
- Add `bountyGold` to `PlayerMatchStats` and mix it in the existing `matchStats` digest loop
  (`SimWorld.ts:323-346`) — it is the **22nd** counter; the loop currently mixes 21.
- Arm/clear happens on a tick the host drives identically on every replica, so same-seed replay
  is byte-identical.

---

## 6. The combat window — the blocker phase 2 missed

**Two independent reviews found this, and it is confirmed in source.**

`MatchController.tick():779` gathers intents in **every** phase except `champSelect` and
`matchEnd`; the comment at :772 says "sim runs in every phase". `concludeCombat()` (:586-594)
despawns flowers, tears down revives, settles the round and sets `combatActive = false` — but it
calls `freezeControls()` **only when `aliveTeams().length <= 1`**, i.e. only at match end.
`enterIntermission()` (:291) does not clear nav orders or reposition anyone; positions reset only
in `enterCombat` (:437-462). `Tier0Brain.replan()` sets `order = {kind:"attackTarget", ...}`
**outside** the `if (world.economyOpen)` branch, so bots keep fighting. And `world.combatActive`
is read by exactly two things in the entire repo — `matchStats.ts:282` (`accumulateTimeAlive`)
and `shopAccess.ts:93` (a UI label). **No combat system consults it.**

So after every round concludes, the duel keeps running for `resolutionSec 6` **plus**
`intermissionSec 60` = **66 seconds** of live combat in a phase the game does not present as
combat, with lives already deducted, round gold already paid, revive circles already destroyed,
and `enterCombat` about to full-heal everyone anyway. Dying is free; killing pays.

Measured (`MatchController` driven directly, seed 4242, 12 bots, shipped `resolutionSec = 6`):

| `combatMaxTicks` | champion deaths in `combat` | in `resolution` | in `intermission` | kill gold outside combat |
| --- | --- | --- | --- | --- |
| 2700 (90s, shipped) | 29 | 0 | 0 | 0g |
| 240 (rounds time out with both sides alive) | **0** | **9** | **12** | **3,150g** |

Row 2 is not contrived — it is *every round that reaches the 90s timer with both sides alive*,
which is exactly what the `timerExpired` branch (`checkCombatEnd`, :527-533) exists to resolve.
On such a round **100% of that round's champion deaths happen after it is settled.**

Left ungated, #90 makes it worse: the purse is 2× the retired `GOLD_REWARDS.kill`, and in a
timed-out round all six champions in a zone are alive at `concludeCombat`, so the dead window
can mint **all six purses — 1,800g per zone, for free, unopposed**, against the ~3 purses the
income model in §3.4 assumes.

### The fix

```
pay only if  world.bountyRules !== null  &&  world.combatActive
```

`combatActive` is already this codebase's "a combat round is live" predicate: set true at
`MatchController.ts:415`, false at :293, :590 and :708, and it is the exact gate
`accumulateTimeAlive` uses. One condition in `DeathSystem`. No new lifecycle. Combined with
§5.3's `endCombatBounty`, the gate is belt-and-braces and both halves are independently correct.

**Deaths in the dead window do not consume the purse either** — the ledger is cleared at
`enterCombat` regardless, so consumption there would be meaningless bookkeeping, and skipping it
keeps the invariant readable: the ledger only ever records deaths that happened in a live round.

### Extend the gate to the whole reward block

The same `if` should cover `grantXp(XP_REWARDS.kill)` and `fireHooks("onKill")`, not just gold.
Reasons: 21 free deaths is ~2,520 XP, which is ~20% of the entire level-1→18 curve
(`xpBase 100`, `xpPerLevel 80`, cap 18) — not a rounding error; a rule that pays XP for a kill
that pays no gold is incoherent; and `onKill` hooks can grant shields and buffs that then
survive into the next round's `enterCombat`. This is a behaviour change slightly beyond the
user's literal 金幣 ask, and it is called out as such — see the question in §15.

**Not in #90's scope, but named:** the *root* fix is that champions should not be fighting at all
after `concludeCombat`. That means calling `freezeControls()` unconditionally at round end (or
gating intent gathering on `combatActive`), which touches #38's auto-opening shop, #93's round-win
presentation and #95's shop countdown. #90 gates its own payout; somebody should own the freeze.
The scoreboard corruption (`kills`, `multikills`, `killParticipation`, and therefore `rating.ts`'s
S+..C- ladder) is not fixed by #90's gate and survives until then.

---

## 7. Kill attribution — the full edge-case table

Payout site, in `DeathSystem`'s champion branch, after `recordChampionDeath`:

```
gate:      world.bountyRules !== null  &&  world.combatActive
consume:   victim's seat not already in bountySpent  →  add it
killer 2-share paid iff:
             killer !== null
          && world.champion.has(killer)
          && killer !== victim
          && team(killer) !== team(victim)
assist 1-shares: every assistant recordChampionDeath credited (already enemy-only)
ΣW = killerWeight + assistWeight × assistCount, ALWAYS
```

| # | situation | purse consumed | killer 2-share | assist 1-shares | note |
| --- | --- | --- | --- | --- | --- |
| 1 | enemy champion, solo kill | yes | **300** | — | the base case |
| 2 | enemy champion + 1 enemy assist | yes | **200** | 100 | |
| 3 | enemy champion + 2 enemy assists | yes | **150** | 75 + 75 | = today's `GOLD_REWARDS` |
| 4 | **second death of the round (revived player)** | already spent | — | — | **the user's rule** |
| 5 | killed by #89's tower / any neutral | yes | not minted | paid | reviving stays free (§5.2) |
| 6 | killed by own teammate (friendly fire) | yes | not minted | paid | denial worth only 150 of 300 |
| 7 | self-kill (walked into own AoE) | yes | not minted | paid | `killer === victim` |
| 8 | `killer === null` | yes | not minted | paid | a well-set-up kill finished by nothing still pays its assistants |
| 9 | any death outside a live combat round | **no** | — | — | §6 gate; ledger cleared at `enterCombat` anyway |
| 10 | flower / neutral **dies** | n/a | n/a | n/a | not a champion; `recordFlowerEaten` path, unchanged |
| 11 | enemy in the *other* duel zone | unreachable | — | — | zone isolation (§3.1); asserted by test |
| 12 | assistant died before the kill landed | yes | — | **paid** | LoL rule, deliberate — they traded their life for it |
| 13 | assistant's last damage > 10s old | yes | — | not paid | `ASSIST_WINDOW_TICKS = 300` |
| 14 | 0-damage chip hit on the killing tick | yes | goes to the **killing blow** | | requires §10a; today the chip steals it |
| 15 | fully-shielded hit that crosses 0 anyway | yes | to that hit | | `killingBlow = hpBefore > 0 && hp.hp <= 0` |
| 16 | overkill (hp driven far below 0) | yes | normal | normal | `hp.hp` clamps to 0; purse is flat |
| 17 | in-flight projectile arrives after death | — | no credit | — | `ProjectileSystem.ts:39` skips `!chp?.alive`; no posthumous credit exists |
| 18 | killer disconnected (seat now AI-driven) | yes | **paid to the seat** | paid | `MatchRoom.ts:268-291` swaps driver, keeps seat + entity |
| 19 | bye team (did not fight this round) | — | — | — | mints and pays nothing |
| 20 | client prediction shadow world | **no** | — | — | never arms `bountyRules` — strict no-op |

**Damage-over-time does not exist and must not be introduced silently.** `StatusEffect` carries
only `moveSpeedMult / root / stun`; there are exactly three damage producers
(`BasicAttackSystem.ts:221`, `ProjectileSystem.ts:60`, `effectRunner.ts:40`), all carrying a live
caster. There is no orphan-DoT attribution problem — **#78 must not create one.**

---

## 8. Neutrals: the guardian tower (#89) and friendly fire

#89 has landed **no sim code** (greps over `packages/shared/src/sim`, `content/config`,
`apps/game-server/src/match` return nothing), so both designs are still soft. Four commitments,
all cheap to honour, and one of them is a reversal of phase 2:

**8a. A tower kill pays nobody.** A tower is neutral — there is no team to pay, exactly as
flowers pay nothing today (`DeathSystem.ts:26-30`; flowers deal no damage at all so they never
even appear as a `lastDamager`). Revive circles are likewise structurally invisible: `revive.ts`
gives them no health and no `TeamComp`. **Unchanged from phase 2.**

**8b. A tower kill DOES consume the purse. — REVERSED from phase 2.** See §5.2 for the full
argument. Short version: the payment-keyed version was a 300g tax on using #84 and bought no
anti-denial property in exchange. Consuming on death makes 「reviving can never fund the enemy」
true for every death cause, and it dissolves the phase-2 §6b/§8c contradiction (where a null
killer spent the purse but a tower killer did not — meaning #89's choice of whether to set
`pkt.source` to the tower or to nothing would have silently decided which rule fired).

**8c. The tower's AoE must not overpay assistants.** §3.2's "ΣW always includes the killer slot"
is load-bearing here: without it, a tower last-hit on a victim two enemies had chipped would pay
those two 150 each — more than a champion kill pays them — and the optimal play would become
"soften them, let the tower finish". Do not let #89's punish become a payout.

**8d. The tower must NOT carry a `TeamComp`.** `recordDamage` only logs a damager into
`recentDamagers` when both sides have a `TeamComp` and the teams differ
(`matchStats.ts:143-152`), so a neutral tower is already excluded. **If #89 gives the tower a
`TeamComp`, its AoE silently starts buying assist shares of every bounty in the zone.** Give it
`ReviveCircleComp`-style ownership fields instead, exactly as #84 did.

**8e. The tower's own last-hit gold is #89's purse, not this one.** Separate number, separate
bookkeeping — a tower is not a seat and must never enter `bountySpent`. Price it in the same tier
language; a reasonable starting point is that the tower already grants a buff and a full HP/MP
restore, so its *gold* component should be **smaller** than a champion kill, not larger. A
per-round respawning tower needs its own once-per-spawn guard, for the same reason this design
has one.

**8f. Friendly fire is reachable TODAY, without #89.** Verified: `effectRunner.ts` and
`BasicAttackSystem.ts` contain **zero** references to team, `OrderSystem.ts:57` sets
`nav.attackTarget = order.entity ?? null` with no validation, and `sanitizeIntent`
(`MatchController.ts:753-762`) filters only `buyItem`. Only `ProjectileSystem.ts:41` refuses
friendly fire. A human client can order a basic attack on a teammate and it resolves. See §10c.

---

## 9. Legibility

A player who cannot see why their gold moved cannot learn the rule — and this rule has a
counter-intuitive half: an enemy who is worth nothing.

### 9.1 Settlement

Add `bountyGold` as the **22nd** counter on `PlayerMatchStats` (fold into `digest()` beside the
other 21). Render it in the settlement breakdown as a sub-line under gold —
「賞金 1,500 / 總金幣 9,100」 — reusing the `settle-stat-format` row builder.

**Show it, do not grade it.** `rating.ts` already weights `kills`, `assists`,
`killParticipation` and `multikills`; `goldEarned` is deliberately ungraded. Feeding `bountyGold`
into `grade()` would double-count the exact aggression signal `kp` already carries and tilt the
S+..C- ladder toward the winning team twice.

### 9.2 In-match — the half that actually matters

The settlement is a post-mortem; the rule has to be readable *while* it applies.

- **On payment**: a bounty pop distinct from the damage numbers, routed through **#92**'s
  floating-combat-text surface. Do not add a second text system.
- **On a settled enemy — the important one.** Any enemy who has died this round carries a
  visible **已結清** state on their nameplate (greyed bounty glyph, or a spent-purse marker on
  the enemy healthbar). Note the widened trigger from phase 2: because the ledger now consumes
  on *death* rather than on *payment*, the marker must also appear on an enemy who was killed
  by the tower, by their own teammate, or by nothing at all — cases where nobody was paid but
  the purse is gone. A player who cannot see this will chase gold that does not exist. Coordinate
  with **#84** (revive HUD), **#85** (death-spectator desaturation) and **#42**'s corner registry
  — never hard-code a corner.
- **Announcer**: no new VO line. A bounty is not a first-blood moment and #57's pack is dense.

---

## 10. Prerequisite fixes — all three are in #90's path

### 10a. Kill credit is "last damager this tick", not "killing blow"

```ts
// DeathSystem.ts:12-18 — the whole of kill attribution
for (const ev of world.events) {
  if (ev.type === "damage") lastDamager.set(ev.data.target, ev.data.source);
}
```

`combatResolveSystem` skips only packets whose target is already `!hp.alive`, and `hp.alive` is
not cleared until `deathSystem` runs. So every packet queued after the one that crossed 0 still
resolves and still overwrites `lastDamager` — **including a fully shielded 0-damage chip hit**,
because the `damage` event is emitted unconditionally per resolved packet.

The correct flag already exists **and is already on the wire**:

```ts
// packages/shared/src/sim/combat/damage.ts:231
const killingBlow = hpBefore > 0 && hp.hp <= 0; // only the packet that crosses 0
```

It is in the emitted payload (`damage.ts:236-246`). The fix is one predicate in `DeathSystem`'s
event loop: record a `lastDamager` only when `ev.data.killingBlow` is true. **No test anywhere
asserts champion-vs-champion kill credit** — `flowers.test.ts` covers only the flower path — so
this must land with its own test.

The fixed purse means the bug costs a team no *gold* even before the fix; it still corrupts
`kills`, the multikill streak and the rating. Fix it. (See §3.2 for the hold-the-burst incentive
the fix introduces and why it is acceptable.)

### 10b. `recordChampionDeath` destroys the assist list the split needs

```ts
// packages/shared/src/sim/stats/matchStats.ts:272
world.recentDamagers.delete(victim);
```

That runs at the end of `recordChampionDeath`, which `DeathSystem` calls **before** granting
gold. A split naively appended afterwards finds the list already gone.

Fix by having `recordChampionDeath` **return the assistants it credited**, and feed that array to
the split. That is also the only way to guarantee assist *gold* and the assist *counter* can
never disagree — one predicate, one iteration, two consumers. Do not snapshot-and-duplicate.

### 10c. No team check anywhere near the payout, and friendly fire is live

`DeathSystem.ts:35` checks only `world.champion.has(killer)`. §7's predicate adds
`killer !== victim && team(killer) !== team(victim)` at the payout site, which is #90's own fix
and closes the self-farm (kill your teammate for 300g, revive, repeat).

But the **root cause** is upstream and is a pre-existing bug: a human client can target a
teammate and `BasicAttackSystem` will swing (§8f). The real fix is a friendly-target guard at the
targeting layer — `OrderSystem` refusing a same-team `attackTarget`, mirroring
`ProjectileSystem.ts:41`. Until that lands, the teammate-execution denial route in §5.2 stays
open (worth 150g, at the cost of your own damage output). **#90 should not own this fix**, but it
is the task that surfaced it and it should be filed.

---

## 11. Where it lands

| change | file |
| --- | --- |
| `killingBlow` gate on kill credit (10a) | `packages/shared/src/sim/systems/DeathSystem.ts` |
| bounty payout + `combatActive` gate + team check + ledger consume | `packages/shared/src/sim/systems/DeathSystem.ts` |
| `recordChampionDeath` returns credited assistants (10b); `bountyGold` counter | `packages/shared/src/sim/stats/matchStats.ts` |
| purse + split, pure, no world access | `packages/shared/src/sim/economy/bounty.ts` *(new)* |
| retire `GOLD_REWARDS.kill` / `.assist` | `packages/shared/src/sim/economy/progression.ts` |
| `bountyRules`, `bountySpent`, digest fold | `packages/shared/src/sim/SimWorld.ts` |
| `beginCombatBounty` / `endCombatBounty` | `packages/shared/src/sim/bounty.ts` *(new, mirrors `revive.ts`)* |
| arm in `enterCombat`, clear in `concludeCombat` | `apps/game-server/src/match/MatchController.ts` |
| `zKillBountyConfig` | `packages/shared/src/content/schema/config.ts` |
| `killBounty` block | `content/config/arena-rules.json` |
| drop dead `economy.killGold` / `assistGold` | `content/config/config.match.json` + schema |
| settlement sub-line | client `MatchEndPanel` / `settle-stat-format` |
| bounty pop | #92's floating combat text |
| 已結清 nameplate state | #84's revive HUD |

The phase-3 todo checklist belongs in `docs/todo/economy.md` **when phase 3 starts** — not now,
while #82 is actively rewriting that file. (`tools/todo-check` scans `docs/todo` only, which is
why this document lives at `docs/kill-bounty.md`.)

---

## 12. Test plan

| id | asserts |
| --- | --- |
| `bounty-once-per-round` | an enemy killed twice in one round mints exactly one purse |
| `bounty-revive-no-repay` | **the headline.** Kill → #84 revive → kill again ⇒ second kill pays 0 gold |
| `bounty-revive-after-tower-death-pays-nobody` | **the §5.2 reversal.** Tower kills the victim (nobody paid), team revives them, an enemy kills them ⇒ 0 gold |
| `bounty-outside-combat-pays-nothing` | **the §6 gate.** Drive `MatchController` to a timed-out round; assert 0 bounty gold across `resolution` + `intermission` despite champion deaths |
| `bounty-rules-cleared-at-round-end` | `concludeCombat` nulls `bountyRules` and empties `bountySpent`, mirroring `endCombatRevives` |
| `bounty-purse-split-exact` | solo/1-assist/2-assist split to 300 / 200+100 / 150+75+75; paid shares always sum to exactly the purse |
| `bounty-unpaid-killer-does-not-inflate-assists` | tower kill + 2 assists mints 75+75 and **not** 150+150 (ΣW keeps the killer slot) |
| `bounty-killing-blow-credit` | a 0-damage shielded chip on the killing tick does **not** steal credit (10a) |
| `bounty-no-friendly-fire-payout` | teammate kill ⇒ purse consumed, killer share unminted, enemy assist shares paid |
| `bounty-self-kill-pays-nobody` | `killer === victim` ⇒ purse consumed, nothing minted |
| `bounty-null-killer-pays-assists` | `killer === null` ⇒ purse consumed, assists paid, killer share unminted |
| `bounty-tower-kill-pays-nobody` | a neutral with no `TeamComp` mints no killer share (8a/8d) |
| `bounty-zone-isolation` | a champion in zone 0 cannot damage or collect from a victim in zone 1 |
| `bounty-ceiling-per-team-per-round` | over a full round with revives enabled, no team collects more than `3 × purse` |
| `bounty-assist-window` | an assistant whose last damage is >`ASSIST_WINDOW_TICKS` old is not paid; assist gold and the assist counter always agree |
| `bounty-dead-assistant-paid` | an assistant who died before the kill still receives their share (case 12) |
| `bounty-scope-config` | `"life"` reproduces today's per-death payout; absent block = mechanic off |
| `bounty-deterministic-replay` | same seed ⇒ byte-identical gold and identical `bountyGold` |
| `bounty-digest-folds` | a divergence in `bountySpent` or `bountyGold` surfaces as a `digest()` mismatch; the digest is independent of Set insertion order |

---

## 13. Build order and coordination

**Order.** 10a and 10b are prerequisites and land first, each with its own test — they are
correctness fixes to existing code and are independently shippable. Then §6's gate (also
independently shippable, and it *removes* a 3,150g leak on its own). Then the ledger, purse and
split. Then the HUD work, which depends on #84's and #92's surfaces existing.

**#82 (economy).** Two numbers, both handed over rather than taken:
- the bounty is income `CEILING = 7600` does not model, and it is the *third* omission there
  (round-win gold, +1,800 for a 6-round winner, is the first);
- §3.4's delta: the 20th stat tick moves from the **round-6 shop to the round-5 shop** for a
  player who wins every duel. 「大約是第五場之後」 still holds; the margin does not.
- offsetting it: §6's gate removes 3,150g of currently-paid kill gold from stakes-free windows.
  #82 should model both halves. #82 owns `CEILING`; the lever is `simpleUnits`.
- also #82's: the dead `economy` block in `config.match.json` (§1), and round 1's missing
  `grantGold` (§3.5).

**#84 (revive circles).** #90 is what makes the revive **structurally** safe: under the
death-keyed global ledger the revived player carries zero bounty, so reviving can never fund the
enemy — for *any* death cause, including #89's tower. That belongs in the revive doc; it is the
mechanic's main risk and #90 removes it.

The honest accounting, because it is not free: retiring 150 for a 300g purse **doubles the head
price of the channeller**, who is #84's counter-play. Net for #84, per round: **+300g** when the
revive succeeds (the returned player is worth nothing), **−150g** when the enemy kills the
channeller instead. Positive on success, negative when contested. `simpleUnits: 0.5` would make
#90 purely positive for #84 at the cost of §3.1's clean split — see §15.

Note also that `revivesPerTeamPerRound: 1` already bounds the farm to one extra payout per team
per round. The rule's value is **structural** — it holds at any charge count, and it is what lets
#84 raise that number later without reopening the exploit — not marginal at today's setting.

**#89 (guardian tower).** Four commitments, §8a-8e: pays nobody; **does** consume the purse
(reversed from phase 2); must not overpay assistants (keep the killer slot in ΣW); must **not**
carry a `TeamComp`; and its own last-hit gold is a separate number with its own once-per-spawn
guard. Confirm the tower emits its AoE with a source that is *not* a champion; under the final
rule it no longer matters whether that source is the tower entity or `null`, which is itself the
point.

**#92 / #85 / #42.** The bounty pop routes through #92's floating combat text; the 已結清
nameplate coexists with #85's desaturation; neither hard-codes a HUD corner (#42).

**#78.** Do not introduce a damage-over-time source without a live attributed caster (§7).

**Unowned, filed by #90, fixed by nobody yet:** champions keep fighting for 66 seconds after
`concludeCombat` (§6), and friendly targeting is unguarded outside `ProjectileSystem` (§10c).
Both are pre-existing; #90 works correctly in their presence but they should be somebody's task.

---

## 14. Review disposition

Three adversarial reviews. **All three arrived truncated** — "farm" cut off inside FARM 1 of 4,
"perverse" inside finding 2 of 4, "engineering" inside finding 2 of 5. Every point that arrived
in full is dispositioned below; the truncated remainders are named so they can be re-run.

| # | review point | disposition |
| --- | --- | --- |
| F0 | rotating who lands the blow is closed; revive across a round boundary is closed; the other duel zone is closed at the damage layer; letting a teammate die funds the enemy; there is no fourth resurrection source (`ReviveSystem.ts:237`, `MatchController.ts:454`, `:891/:946/:991` dev-gated) | **Confirmed** — independently verified. Restated in §3.1 and §7. |
| F0b | the 900g ceiling depends on zone isolation and nothing asserts it | **Fixed** — `bounty-zone-isolation` and `bounty-ceiling-per-team-per-round` added (§12). |
| F1 | the 66-second post-combat window: the payout is live in `resolution` + `intermission`, and on a timed-out round *all* of that round's deaths land there | **Fixed** — §6. Gate on `world.combatActive`. Largest change in the spec. |
| F2-F4 | truncated | Not received. §6 covers the gold half of "two are gold"; §6's XP extension covers the exempted-currency half as far as I can reconstruct. **Re-run "farm" if the full text exists.** |
| P1 | §6b's entire footprint is a 300g tax on using #84; an outstanding purse is collectable only by the victim's own team reviving them; §6b did not even prevent the tower-suicide denial it was written for; §6b and §8c gave opposite answers on the null-killer path | **Fixed, and it is the single best finding in the set** — §5.2. The ledger now consumes on **death**, any cause. §6b deleted. The §6b/§8c contradiction dissolves. §5's "reviving can never fund the enemy" becomes true unconditionally. The review's reading of 復活的 (the one who died and came back, not the one somebody was paid for) is closer to the user's Chinese than phase 2's, and it is now the doc's own framing (§0). |
| P1b | tower-suicide denial still exists under the new rule | **Accepted, priced, not special-cased** — §5.2. Denying ≤300g costs 450g of round gold team-wide plus a `livesLost` tick. |
| P1c | "consume on death" lets a team execute its own dying teammate to deny | **Accepted and bounded** — §5.2. It denies only the killer's 150 (assists still pay), and it exists only because friendly targeting is unguarded, which is §10c's fix. |
| P2 | the purse doubles the channeller's head price while #84's payoff is unchanged | **Accepted, stated as a cost, not hidden** — §13. Net for #84 is +300 on success, −150 when contested. Escalated to the user as the §15 question, because it is the one place where #90's number works against #84's purpose. |
| P3 | a hold-the-kill incentive that does not exist in the codebase today (header only) | **Accepted in the form I could reconstruct and verify** — §3.2. §10a's `killingBlow` fix *creates* a hold-the-burst incentive that last-damager credit did not have; the fixed purse makes it cost the team nothing (≤75g of internal shuffle), but it survives on `kills` / multikills / `rating.ts`. The fix is still right — corrupt attribution is worse. **Body truncated; re-run if available.** |
| E1 | the payout fires in every phase; measured 3,150g of kill gold outside combat on timed-out rounds; gate on `combatActive` | **Fixed** — §6, with the measurement reproduced in the doc. |
| E1b | "the round-6 → round-5 delta is derived against the wrong denominator" | **Accepted as a diagnosis of shipped behaviour, rejected as a correction to the derivation.** Re-walked the table: 600 start + grants (0/750/2500/1000/1250/1500) + 300/round won gives 7,300g at the round-5 shop (19 ticks) without bounty and 8,500g (22 ticks) with it — the round-6 → round-5 result is arithmetically correct *for the intended behaviour*. The critique is right that shipped reality exceeds the model; §6's gate is what makes reality match it. Both halves are now handed to #82 (§3.4, §13). |
| E2 | the phase-2 lifecycle is the **opposite** of the seam it claims to mirror — `endCombatRevives` *is* called in `concludeCombat` and nulls `reviveRules` | **Fixed; the phase-2 claim was simply false.** §5.3. `endCombatBounty` now clears in `concludeCombat`. Phase 2's stated reason ("the resolution phase and round-end HUD may still want to read it") does not survive: the settlement reads `matchStats.bountyGold`, and the 已結清 nameplate is combat-only. |
| E3-E5 | truncated | Not received. **Re-run "engineering" if the full text exists.** Independently found while verifying: the entire `economy` block in `config.match.json` is schema-validated and read by nothing (§1); `bountyGold` is genuinely the 22nd `matchStats` counter (the digest loop mixes 21); `SeatId`/`EntityId`/`TeamId` are all branded numbers, so digest mixing is trivial. |
| — | *(found here, not in any review)* the share denominator | **Fixed** — §3.2. ΣW must always include the killer's weight, or a tower last-hit pays two assistants 150 each and "let the tower finish" becomes optimal. |

---

## 15. The two questions that need you — **BOTH RESOLVED 2026-07-22**

> ### ✅ DECIDED — implement against these, do not re-open them
>
> **Q1 · Purse size = 300g (1 SIMPLE).** Answered by the user. The spec's own
> recommendation stands, so nothing below changes except that `simpleUnits: 1.0`
> is now the shipped value rather than a proposal. The two accepted costs are
> accepted *knowingly*:
> - #82's 20th stat tick moves from the round-6 shop to the round-5 shop.
>   Tell #82 — its `CEILING` was computed without this income.
> - #84's channeller's head price doubles from 150g to 300g. This is the
>   intended shape, not a side effect: #90 makes reviving **safe** (the purse is
>   already spent, so a revived teammate can never re-fund the enemy) and in the
>   same stroke makes **contesting** a revive properly rewarding. Both halves of
>   the tension get louder together, which is what makes the circle a decision
>   rather than a free action.
>
> **Q2 · The `combatActive` gate covers GOLD ONLY.** Decided here, and
> deliberately narrower than the spec's alternative.
>
> The user asked about 金幣. Extending the same `if` to XP and `onKill` would
> change behaviour nobody asked about, inside a task that is meant to add one
> economic rule. More importantly it would be treating the symptom: the free XP
> in that window is **not caused by #90 and exists in the build today**. The
> cause is that combat never stops at round end, which is now **task #100** with
> the source evidence from §6 attached. Gating XP here would paper over #100 and
> make it harder to notice, which is the opposite of useful.
>
> So: #90 gates its purse and nothing else. #100 owns the window itself.
>
> **Q3 · The window fix is task #100, not part of #90.** Freezing champions at
> round end collides with #38's auto-opening shop, #93's round-win presentation
> and #95's shop countdown — all three in flight — and #93 in particular may
> want a deliberate beat between the last kill and the celebration. That is a
> round-pacing design decision, not a bug fix, and it does not belong inside a
> gold rule.

---

### The original framing, kept for the reasoning

**1. Purse size: 1 SIMPLE (300g) or ½ SIMPLE (150g)?**

At **300g** the bounty is felt: it is one shop item, the three-way split lands exactly on the
150/75/75 the codebase already declares, and a solo kill is legibly worth "one 簡易武器". The
costs are real and both land on tasks in flight — the 20th stat tick moves from the round-6 shop
to the round-5 shop (#82's `CEILING` no longer covers it), and the head price of #84's channeller
doubles from 150 to 300, so #90 makes the counter-play to reviving twice as rewarding at the same
time as it makes reviving safe.

At **150g** #90 becomes economically invisible: zero delta to #82's stat-path pacing, zero change
to the channeller's head price, and #90 reduces to a pure anti-farm rule — the structural half
the user actually asked for, with no new money in the match at all. The costs: the split stops
being clean (76/37/37 instead of 150/75/75), and a kill is worth half an item, which may be too
small to change anyone's behaviour — in which case the 「打死敵人有額外金幣」 half of the rule
does not land even though the 「復活的不再多發放」 half does.

I have specced 300 with `simpleUnits: 0.5` as a no-rebuild lever, because the split arithmetic
and the "one item" mental model are both stronger at 300 and the #82 delta is one shop, not two.
But if protecting #84's viability while it is mid-build matters more than the bounty being felt,
150 is the safer number and it is a one-line config change either way.

**2. §6's gate: gold only, or the whole kill reward?**

Champions keep fighting for 66 seconds after each round is settled, and on a round that reaches
the 90-second timer that window contains **every** death of the round. #90 must gate its purse
there or the rule is meaningless. The question is how far to extend the same `if`.

**Gold only** is exactly what you asked for (金幣) and touches nothing else. But it leaves a
strange state: a kill in that window pays 120 XP and fires `onKill` buffs while paying 0 gold —
and 21 such deaths is roughly 20% of the whole level-1→18 XP curve, free.

**The whole reward block** (gold + XP + `onKill`) is one line more and internally coherent, but
it changes XP behaviour you did not ask about.

**Neither is the real fix**, which is that nobody should be fighting in that window at all. That
means freezing champions at round end, which collides with #38's auto-opening shop, #93's
round-win presentation and #95's shop countdown — three tasks currently in flight. Should I file
that as its own task, or fold it into #90 and accept the collision?
