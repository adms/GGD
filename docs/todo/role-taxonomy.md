# Champion role taxonomy (six real roles) — TODO

Task #47 follow-up. The imported roster collapsed every hero to `fighter` (79, melee) or
`marksman` (32, ranged): `role` was a verbatim duplicate of `attackType` and carried no
information at all. `tools/role-classify` proposes a real role for each of the 113 champions
from the evidence already in the content tree — WC3 primary attribute, stat percentiles, kit
effect shape and the w3x author's own 推薦玩家 label — and prints a reviewable report.

**The six roles are not invented here**: they are exactly the keys `ROLE_WEIGHTS` already
carries in `packages/shared/src/sim/stats/rating.ts`, which grades a match on nine sub-scores
weighted PER ROLE. The grader has been asking for this taxonomy since it was written; the
content tree just never supplied it. `fighter` is deliberately absent — it survives in
rating.ts only as a legacy fallback vector.

**Shape:**
- `tools/role-classify/src/roles.ts` — the taxonomy + 中文 legend blurbs.
- `src/features.ts` — READ-ONLY extraction: champion doc + its standalone `.ex` ability doc
  (+ the optional w3x `OBJECTS.json` hero table) → flat numeric/boolean evidence.
- `src/classify.ts` — transparent additive-evidence model. Every point is attributable to one
  named rule, and every threshold is a roster-relative **percentile rank** (not value), so a
  tied block — base `as` is 0.50 for 90 of 113 — can never swallow a "top 15%" rule.
- `src/calibration.ts` — the four labels a human read off the kit during task #47 curation,
  before this classifier existed. **If a heuristic tweak breaks one of these, the tweak is
  wrong, not the label.**
- `src/cli.ts` — the report. It never writes to `content/`; the backfill is a separate,
  deliberate step that happens only after a human signs off on the output.
- Suite: `role-classify-unit` (`tools/role-classify/src/*.test.ts`). The extraction and
  scoring rules are pinned against synthetic fixtures in a tmpdir; only the last two items
  read the real roster, so ordinary content edits do not turn the suite red.

**Held out of the backfill:** `sela` and `thorne` — hand-authored CC0 stand-ins that already
carry curated roles, and whose stats sit outside the imported bands (thorne's armor 32 against
an imported p85 of 10). They are still scored, and excluded from the percentile cohort.

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| role-01 | `ROLES` is the six real roles with no `fighter` catch-all; each has a unique 中文 legend blurb | role-taxonomy-six | unit | done |
| role-02 | every role is a role rating.ts actually weights — a renamed role would silently fall back to DEFAULT_WEIGHTS | role-taxonomy-grader-keys | unit | done |
| role-03 | kit tally merges embedded Q/W/E/R with the standalone EX doc and walks `spawnProjectile.onHit`; peakDamage is the deepest numeric leaf | role-features-kit-tally | unit | done |
| role-04 | a dangling `exAbility` ref, an abilities-less champion and `_index.json` are all tolerated | role-features-missing-refs | exception | done |
| role-05 | a heal/buff line counts as ally-directed only when an ally is named ON THAT LINE; self-restore and lore lines score as self-sustain | role-features-ally-lines | unit | done |
| role-06 | a self-cast heal/shield is never credited as an ally-directed effect | role-features-self-cast | unit | done |
| role-07 | primary attr: the declared w3x value wins; else recovered from the 角色成長 block (智慧/智惠) and flagged inferred; else null | role-features-primary-attr | unit | done |
| role-08 | 推薦玩家/上手度 lines are parsed as the playstyle label and excluded from the keyword corpus (one piece of evidence, scored once) | role-features-playstyle-split | unit | done |
| role-09 | percentile RANK semantics: a tied modal block never counts as the top band | role-classify-rank-ties | unit | done |
| role-10 | marksman is unreachable for a melee champion and reachable for its otherwise-identical ranged twin | role-classify-melee-gate | unit | done |
| role-11 | ranged champions pay the front-line penalty but can still land tank on strong kit evidence (soft gate, not absolute) | role-classify-ranged-frontline | unit | done |
| role-12 | support requires an ally-directed effect; the same sustain aimed at the caster scores tank/bruiser instead | role-classify-support-ally | unit | done |
| role-13 | every score is exactly the sum of its named evidence; margin and confidence follow the top two | role-classify-evidence-additive | unit | done |
| role-14 | the percentile cohort is the imported roster only — hand-authored stand-ins are scored but never shift a cutoff (and an all-hand-authored roster still classifies) | role-classify-cohort-imported | unit | done |
| role-15 | real roster: the classifier agrees with all four hand-read calibration labels | role-classify-calibration | regression | done |
| role-16 | real roster: role is no longer an echo of attackType — all six roles are used, each attackType spans ≥3 of them, and no melee champion is a marksman | role-classify-not-attacktype | integration | done |

## Not done here

The **backfill** — writing the proposed `role` into the 111 imported `content/champions/*.json`
docs — is deliberately out of scope: `role-classify` is read-only, 30 of 111 proposals are
low-confidence (top-two margin < 1.0), and the report exists so a human can argue with a
specific line before anything is written. Add the backfill items to this file when that
step is taken.
