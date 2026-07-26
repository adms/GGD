# Abilities & champions — TODO

`packages/shared/src/sim/abilities` + skeleton champions (Sela, Thorne).

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| abl-01 | Cast validation: unlearned/cooldown/mana/range rejected | ability-cast-validation | unit | done |
| abl-02 | Skillshot spawns projectile; hit applies scaled damage | ability-skillshot-hit | unit | done |
| abl-03 | Ground AoE hits enemies in radius, clamped to range | ability-ground-aoe | unit | done |
| abl-04 | Self cast shields + buffs the caster | ability-self-shield | unit | done |
| abl-05 | Dash ability moves the caster (stops at walls) | ability-dash | unit | done |
| abl-06 | Rank-up spends points; R gated at levels 6/11/16 | ability-rankup-gate | unit | done |
| abl-07 | CDR reduces cooldown ticks | ability-cdr | unit | done |
| abl-08 | Stunned caster cannot cast | ability-stun-blocked | exception | done |
| abl-09 | Champion passive hook fires (Sela Kindling) | champion-passive-hook | unit | done |
| abl-10 | Basic attacks: in-range autos on AS cooldown | basic-attack-cycle | unit | done |
| abl-11 | Kill grants XP + gold to the killer | combat-kill-rewards | unit | done |
| abl-12 | Full scripted 1v1 fight is deterministic (same digest) | combat-fight-replay | determinism | done |

## #247 follow-up — JASS fidelity of the four leap abilities

The owner's standing rule (2026-07-26):「war3 編輯器設定 設定不了 JASS 實作效果，
遇到這種情形一律以 JASS 實際參數為準」— JASS > w3a/w3u editor row > tooltip, and
every override is RECORDED. Each row below pins a number to the war3map.j line it
was read from; `packages/shared/src/sim/leapJassFidelity.test.ts` asserts the line
still says what the row claims, so a drifted line number is a red test.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| jass-247-01 | `godie-hart.w` A0UX 隕石擊: landing blast is j:33722's 250 wc3 (=4.58u), not the w3a 範圍 300 the doc inherited | jass-fid-a0ux-radius | unit | done |
| jass-247-02 | `godie-u00n.r`/`godie-u00o.r` A0RZ 巨人迴旋彈: blast is j:36781's 380 wc3 (=6.97u) centred on the caster (j:36660), not 200 | jass-fid-a0rz-radius | unit | done |
| jass-247-03 | A0RZ perRank [600,900,1200] IS the executed formula 300+300×level (j:36719); the j:36779 comment 300+sLV*200 never runs | jass-fid-a0rz-perrank | unit | done |
| jass-247-04 | `godie-hpb1.w` 者、皆、陣 opens a 1.00 s combo window on the CASTER (j:34438-34440) | jass-fid-a0g3-window | unit | done |
| jass-247-05 | `godie-hpb1.e` 列、在、前 pays the combo bonus only inside that window (j:34189, j:34214) — description no longer over-promises | jass-fid-a0g3-combo | unit | done |
| jass-247-06 | `godie-hapm.w` A0U1 蹂躪編年史 drags the victim to the caster first (j:51749-51760) and throws from the CASTER's position (j:51765) | jass-fid-a0u1-drag | unit | done |
| jass-247-07 | A0G3's EX branch (+10×AGI when `udg_EX_Mode[player]`, j:34216) has no GGD counterpart — GGD has no per-player EX mode flag | jass-fid-a0g3-ex-gap | unit | deferred |
| jass-247-08 | `godie-hpb1.w`'s OWN combo half (+3×AGI after 臨、兵、鬥, gated on `udg_MoonCombo == 1` at j:34342, bonus at j:34398) is still description-only — the marker chain Q→W was left out of scope | jass-fid-a0g2-combo-gap | unit | deferred |

## #247 follow-up 2 — CAST-TIME vs APPLY-TIME (the refuted claim)

`jass-247-05` shipped green and could not fire in a real game. The bonus was
resolved where the damage LANDED; 07-03 puts a 43-tick (1.44 s) arc between the
cast and the damage, and the window is 30 ticks (1.00 s), so it had always
lapsed by the time the question was asked. The JASS does the opposite: it bakes
the whole `udg_MoonDamage`, combo term included, in the SPELL_EFFECT action
(j:34211-34216), enables the arc trigger only afterwards (j:34226), and the
landing AoE pays the frozen variable (j:34262) without ever re-reading
`udg_MoonCombo`. 「完成宣告要問這條觸發在正常一場遊戲裡真的會發生嗎」.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| jass-247-09 | The JASS reading itself: `udg_MoonDamage` (combo term included) is computed in Jump Start (j:34211-34216) and the 41-tick arc only starts after (j:34226); the landing AoE deals the baked variable (j:34262) | jass-fid-a0g3-cast-time | unit | done |
| jass-247-10 | REAL FLIGHT, window open at cast: cast E inside the 1.00 s window, fly all 43 ticks on a live SimWorld, and the landing damage still carries the bonus even though the window closed mid-air | jass-fid-a0g3-flight-open | unit | done |
| jass-247-11 | REAL FLIGHT, window lapsed before the cast: the same arc pays base damage only (j:34440 cleared the marker before Jump Start ran) | jass-fid-a0g3-flight-lapsed | unit | done |
| jass-247-12 | The payload handed to the arc carries NO unresolved condition — `comboBonus` is consumed at launch and the resolved amount rides in `flat` | jass-fid-a0g3-payload-frozen | unit | done |
| jass-247-13 | CLASS GUARD: every EffectDef kind with a nested payload (`leap.onLand`, `spawnProjectile.onHit`) bakes cast-time conditionals; a new carrier must be added to the list | jass-fid-bake-carriers | unit | done |
| jass-247-14 | CLASS, LOGGED NOT FIXED: 9 deferred payload terms resolve their STAT RATIOS at payout, while j:34211 reads `GetHeroStatBJ` at cast — `godie-hapm.w`/`godie-hart.w`/`godie-u00n.r`/`godie-u00o.r` onLand + `godie-u00n.e`/`godie-u010.e`/`sela.q`/`thorne.e`/`storm-arrow` onHit. Unlike the combo window these always fire; only the magnitude can drift if a buff expires mid-flight. Snapshotting them would change every projectile in the game, so it is a decision, not a bug fix | jass-fid-deferred-ratio-gap | unit | deferred |
