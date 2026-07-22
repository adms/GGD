# Economy: shop / gacha / draft / leveling — TODO

`packages/shared/src/sim/economy`. 道具購買, 道具抽卡, 能力抽卡, 等級提升.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| eco-01 | Buy item: gold deducted, stats recompute | shop-buy | unit | done |
| eco-02 | Buy rejected: no gold / no slot / unique owned | shop-buy-reject | exception | done |
| eco-03 | Sell refunds 70% and detaches modifiers | shop-sell | unit | done |
| eco-04 | Item on-hit passive fires (Serrated Edge) | item-onhit-passive | unit | done |
| eco-05 | Item gacha: seeded weighted roll, reproducible | gacha-deterministic | unit | done |
| eco-06 | Augment offer: 3 distinct choices from tier, seeded | draft-offer | unit | done |
| eco-07 | Augment pick attaches source (stat mod applies) | draft-pick-stat | unit | done |
| eco-08 | Ability-mod augment: Q also slows (Chill Touch) | draft-pick-ability-mod | unit | done |
| eco-09 | Event-hook augment: shield on cast with ICD (Aegis) | draft-pick-event-hook | unit | done |
| eco-10 | XP curve: level-ups grant ability points + stat growth | progression-levelup | unit | done |
| eco-11 | Economy commands gated when economyOpen=false | economy-gate | security | done |

## Arena item model (task #70) — NO CRAFTING

`「理論上競技場上的所有道具跟武器都不需要合成」`. The arena has NO combine step of any
kind, so every item is complete the moment a player gets it. The acquisition surfaces are
disjoint — task #70 drew the first two, task #82 split the third out of the shop and added
the fourth:

- **SHOP** (63) — gold, during intermission, at one of exactly two prices.
- **SERVICES** (2) — gold, but no inventory slot: 傳說寶玉 and 能力屬性強化.
- **LEGENDARY** (29) — the round-5 3-choose-1 and the orb pool. NEVER purchasable.
- **DRAFT** (10) — the free round-2 quest card. Never purchasable.

All four lists live in `apps/platform/internal/curation/starter.go` and are re-derived from
the content tree by `apps/game-server/src/curation/arenaItemModel.test.ts`. The WC3 recipe
tree (`docs/content/wc3-crafting-tree.json`) is a CLASSIFICATION TOOL and design-history
record — it must never be implemented.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| item-01 | The FOUR surfaces are exactly what the gates say and are pairwise disjoint: SHOP = named+priced+effective+sane, the free surfaces (DRAFT + LEGENDARY) = named+0g+effective minus the 四魂之玉 shards; the assembled jewel is offered whole | arena-item-surfaces | unit | done |
| item-02 | Nothing that cannot work is reachable: no recipe book (55, matched by the 製作書 substring), no statless item, no impossible modifier value — and none of them was deleted from content either | arena-item-noop-unreachable | unit | done |
| item-03 | Both weapon-draft tables pay out: quest-rewards mirrors the draft surface, legendary-weapons mirrors the legendary surface, and every legendary entry is real, effective and NOT purchasable | arena-item-draft-tables | unit | done |
| item-04 | THERE IS NO PRICE CURVE: the shop holds exactly two distinct prices, ≥20 listings are buyable on the 600g opening purse, and nothing costs more than the 7600g a match can earn | arena-item-price-curve | unit | done |
| item-05 | The WC3 crafting-tree artefact round-trips against the JASS it was extracted from (product granted + components consumed per trigger), and every id it names still resolves | arena-recipe-tree-roundtrip | regression | done |
| item-06 | Bot build tolerance: a buildPriority rung the whitelist rejects — or one that lost its price when legendaries went draft-only — is SKIPPED, not stalled on forever | ai-build-tolerance | regression | done |

## Unified prices + the legendary orb + the 20-stack stat path (task #82)

`「武器價格請統一化，只有三種價格」`. Every purchasable weapon sits at exactly ONE of two
prices — SIMPLE 300g / POWERFUL 1200g — and LEGENDARY is not purchasable at all: it comes
from the free round-5 3-choose-1 or from the 2400g **傳說寶玉**, which buys the ROLL and
never the item. Alongside it runs the **能力屬性強化** fork: a repeatable 375g stat tick
that consumes no inventory slot, and on the 20th CONSECUTIVE tick (7,500g of a ~7,600g
match) a 傳說·萬象強化 capstone worth +10~100% of maxHealth/ad/armor/mr. Buying any real
item resets the streak to ZERO — 「第 19 次時買了普通道具會怎樣——歸零」 — while a weapon
GRANTED by a 3-choose-1 card does not, 「除了隨機三選一給的武器」.

The prices, budgets, roll pool and capstone spec live in
`packages/shared/src/sim/economy/itemTiers.ts`; the two mechanics in `legendaryOrb.ts` and
`statPath.ts`; the surfaces in `apps/platform/internal/curation/starter.go`.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| price-01 | Every purchasable weapon carries EXACTLY one of the two tier prices, and its `tier` field agrees with its price | econ-two-prices | unit | done |
| price-02 | There is no price CURVE anywhere in the tree: every named, effective item is free or sits on the four-price ladder (300 / 1200 / 2400 / 375) | econ-no-price-curve | unit | done |
| price-03 | No legendary can be bought: every legendary-weapons entry costs 0, and the sim REFUSES a 0g buy even when no surface filtered it out (`gold >= 0` is always true) | econ-legendary-not-purchasable | unit | done |
| price-04 | The sim refuses a 0g item through the real command path, for all 29 legendaries, charging nothing and granting nothing | econ-legendary-refused | security | done |
| price-08 | The MIRROR of price-03/04: the sim refuses a PRICED item carrying neither modifiers nor a passive — it takes no gold, no slot, attaches no empty modifier source, and cannot destroy a 19-tick stat path | econ-inert-refused | unit | done |
| price-09 | The two payload-free SHOP SERVICES stay buyable — they are dispatched by id before the payload check, so the inert-item guard cannot break the stat path | econ-inert-services-safe | regression | done |
| price-10 | An inert purchase leaves the stat path intact at 19 stacks, while a real weapon still zeroes it | econ-inert-keeps-statpath | unit | done |
| price-11 | No item in the REAL tree that costs gold and does nothing is purchasable (85 today: 3 at 1200g + ~82 un-repriced w3x imports up to 9,065g), and the refusal reaches the HUD channel | econ-inert-refused-e2e | security | done |
| price-05 | The two shop SERVICES ship as real content docs at the prices the sim charges, and carry no modifiers that could never apply | econ-services-priced | unit | done |
| price-06 | Starting gold is 600 (not 500): every champion spawns able to buy exactly TWO SIMPLE items and no POWERFUL | econ-starting-gold | regression | done |
| price-07 | Gold-efficiency is FLAT across the ladder (4x price = 4x budget = 46.15 g/AEP) — only the SLOT differs | econ-flat-efficiency | unit | done |
| orb-01 | The 傳說寶玉 rolls a 3-choose-1 from the legendary pool on the SEEDED rng, without replacement, excluding what the champion already owns | orb-roll | unit | done |
| orb-02 | Same seed, same three cards — the roll never touches Math.random or a clock | orb-deterministic | determinism | done |
| orb-03 | EMPTY POOL IS SURFACED, never swallowed (task #47's failure): the sale is refused, NO gold is taken, and the reason reaches the HUD channel | orb-empty-pool | exception | done |
| orb-04 | The pool is filtered BEFORE the roll, so a partial whitelist still offers and a total one refuses rather than producing an empty card | orb-whitelist-partial | unit | done |
| orb-05 | A purchased orb registers a real 3-choose-1 on the controller, keyed per tick+seat so two orbs are two cards | econ-orb-offer | integration | done |
| stat-01 | One 能力屬性強化 tick charges 375g, adds one stack, rolls one stat from the nine-entry pool, and consumes NO inventory slot | statpath-tick | unit | done |
| stat-02 | Every roll in the pool is worth one SIMPLE item (6.5 AEP) within 2%, and the stats this sim cannot pay for (cdr / maxMana / manaRegen / critDamage) are excluded | econ-stat-roll-parity | unit | done |
| stat-03 | Buying any real item RESETS the streak to zero, at any stack including 19 | statpath-reset-at-19 | unit | done |
| stat-04 | The reset is ANNOUNCED with the count destroyed, so no player can lose 19 stacks without the UI being able to warn | statpath-reset-event | unit | done |
| stat-05 | A DRAFT-granted weapon does not break the streak — 「除了隨機三選一給的武器」 — but the 2400g orb does, being a gold purchase of a weapon | statpath-draft-grant-safe | unit | done |
| stat-06 | The capstone lands on the 20th consecutive tick, never earlier, and never twice | statpath-capstone-at-20 | unit | done |
| stat-07 | The capstone pays inside 10~100% on every seed, in ten steps, and the payoff genuinely varies (it is a gamble, not a formality) | statpath-capstone-range | unit | done |
| stat-08 | The capstone is pctAdd on maxHealth/ad/armor/mr, so a tank and a carry cash it differently; ap is excluded because every champion's base ap is 0 | statpath-capstone-pctadd | unit | done |
| stat-09 | 20 ticks are affordable inside the 7600g deterministic match income with 100g to spare, and land in the ROUND-6 shop — reachable, but only just | econ-stat-path-reachable | unit | done |
| stat-10 | End to end through the controller: 20 ticks via the real command path earn the capstone, cost the whole purse, and leave the inventory empty | econ-stat-path-e2e | integration | done |
| stat-11 | The shop-facing view exposes N/20, whether the path is live, and how many stacks a purchase would destroy | econ-stat-path-view | unit | done |
| stat-12 | Capstone round-gate (task #104): 20 stacks banked before round 6 stay capstone-less; the first tick bought at/after round 6 lands 傳說·萬象強化, protecting 「大約是第五場之後」 | statpath-capstone-round-gate | unit | done |

## Kill bounty (task #90)

`「殺敵獎勵：擊殺敵人給額外的錢，每個敵人只給一次——復活後再被殺不再給」`. A one-time
premium paid to the killer on TOP of base kill gold the FIRST time each enemy champion
dies; a revived-then-rekilled victim (same entity id for the whole match) yields base kill
gold only. Tracked on `world.bountyPaid` (a per-victim set); the reward value is
`GOLD_REWARDS.killBounty` (economy/progression.ts), mirrored by the optional
`economy.killBounty` config key. It rides on top of the deterministic ~7,600g match income,
so it never disturbs the stat-path arithmetic.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| bounty-01 | The killer gets base kill gold + a one-time bounty the first time an enemy dies; a revived-then-rekilled victim pays base kill gold only, and the same seed produces an identical gold trail | eco-kill-bounty | unit | done |
