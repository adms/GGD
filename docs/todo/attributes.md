# 三圍 STR/AGI/INT attribute derivation (#248) — TODO

`packages/shared/src/sim/stats/attributes.ts` + `content/champions/*.json` +
`content/config/combat-env.json`.

Every champion's stat card was imported from the source map with the Warcraft III
attribute model already FOLDED IN and then discarded — `baseStats.maxHealth` was
literally `(w3x_hp + 25·STR) × 0.8`. #248 re-derives the three attributes from the
map (walking each unit's `base` chain into the Blizzard stock MPQ tables when the
map never overrode a field) and puts the model back in the sim, where it can be
tuned.

## The law, in one line

```
stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)
```

…then item/augment/buff modifiers, then the stat's combat-env ×factor, then the
clamp. THREE additive layers. `growth` was NOT deleted when the attributes
landed — the owner ruled the two sources may overlap because they mean different
things (「growth 區塊就是重複來源 => 本來就可以重複沒有衝突」): the attribute
term is the w3x-faithful part of the curve, `growth` is the per-hero designer
knob laid on top. `growth.mr` is simply the row whose attribute term is zero,
because Warcraft III has no magic-resistance attribute.

Three additive layers is exactly the shape where a reader silently applies two of
the three, so `attr-01`/`attr-02` assert the layers SEPARATELY rather than
asserting their sum.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| attr-01 | Every champion's derived stat is exactly `baseStats + attr(L)·coefficient + growth·(L−1)`, checked per stat at levels 1/2/6/12/18 against an independent re-computation from the raw doc fields | attr-248-derivation-law | unit | done |
| attr-02 | The three layers are separable: zeroing a coefficient removes ONLY the attribute term and leaves `baseStats + growth·(L−1)`; a doc with no `attributes` block reduces to the pre-#248 law exactly | attr-248-layers-separable | unit | done |
| attr-03 | Every shipped champion carries a complete `attributes` block, and the eight coefficients live in the combat-env table (not a second config surface) with the shipped values | attr-248-roster-complete | unit | done |
| attr-04 | `growth` survives the re-derivation: no champion lost a growth row, and the level-12 effective HP of the owner's four sanity champions is reproduced to the digit under the new maxHealth ×4 | attr-248-growth-kept | regression | done |
| attr-05 | godie-zombiex stays pinned at #244's deliberate 380 HP base, with the attribute layer contributing exactly +45/level | attr-248-zombiex-pinned | regression | done |
| attr-06 | The shop's stat preview equals the sim's actually-computed stat for an attribute-derived champion, at level 1 and after a level-up, with and without items (#106: the preview must not lie) | attr-248-shop-preview-truthful | integration | done |
| attr-07 | Each of the seven IMPORTED coefficients equals the field it came from, READ from the source files at test time — the map's own `war3mapMisc.txt` where it overrides Blizzard, `STOCK_MISCGAME.json` where it does not — and `intToAbilityPower` is asserted to have no upstream source at all (owner's design) | attr-248-coef-provenance | unit | done |
| attr-08 | The four fields the map genuinely OVERRIDES (StrHitPointBonus, StrRegenBonus, AgiDefenseBonus, IntRegenBonus) still differ from Blizzard's, and AgiAttackSpeedBonus is still absent from the map — the two halves of the fallback rule, each named so a re-extraction says WHICH one moved | attr-248-coef-map-overrides | unit | done |
| attr-09 | The two map constants GGD deliberately does NOT model stay visible: `AgiDefenseBase` (map 0 / Blizzard −2 — GGD's armour law has no offset term, which matches the MAP) and `AgiMoveBonus` (map 0.1 / Blizzard 0 — GGD has no agi→移速 axis at all, an OPEN GAP for the owner) | attr-248-coef-unmodelled | unit | done |
| attr-10 | `MaxHeroLevel` disagrees between the map (40) and Blizzard (10) and is recorded rather than silently ignored — that disagreement is the proof the map's constants table is genuinely customised, which is why its four overrides must be believed. GGD's own cap is 18 (`content/config/config.match.json` progression.levelCap) and is a SEPARATE design decision, not fixed here | attr-248-coef-maxherolevel | unit | done |
