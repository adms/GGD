# Local delivery verification

## Follow-up delivery

`FOLLOWUP.json` and `followup-*.log` record the later local checks for the serialization, source-admission and 44-hero ledger supplements. All three mandatory checks were launched together; final results passed, including 496 Editor tests and the production build. Initial sandbox IPC failures and the subsequently detected stale census are retained. The existing generator changed only corpusFiles 2310 to 2311; the complete skills check then passed. New receipt files were added after checks.

All four archive bundles were reverified. Another 38 targeted CPU tests passed; the formal-source gate correctly returned exit 2 and started no model worker. The empty-ground reproduction still returns the declared exit 1 while self/entity controls return exit 0. Main's inspected handler bytes also match. None of these checks establishes a qualified hero model. Remote CI is separate: the pre-push head still had the recorded unit failure; these local receipts do not declare a new remote CI result.

## Original delivery

These receipts are verification of this research delivery, not qualification of a generated hero. The mandatory `skills:check`, `editor:accept:release`, and `coord:check` commands were first launched together. Optional Gemini use was explicitly disabled; no model training is part of these checks.

## Passed checks

- `archive-verify.log`: 3,377 original entries, 42 archives, 15 unique adapter blobs verified; production qualification false.
- `archive-tests.log`: five archive/extraction safety tests passed.
- `archive-extract.log`: the actual complete archive was extracted to a new directory, without starting a GPU; base/fused weights remain deliberately absent.
- `workflow-tests.log`: three bounded-workflow unit tests passed using the recorded runtime. The printed `DATA_QUALITY_REVIEW_REQUIRED` stop is the expected negative test, not a failed experiment.
- `restored-workflow-runtime-tests.log`: the same three tests passed from the restored files using the recorded Python 3.11 MLX runtime.
- `release.log`: Editor typecheck, 496 full tests, production build and preceding capability/Skill Forge/VFX checks passed. This does not claim art-direction review.
- `coord.log`, `coord-final.log`: all sixteen coordination packets checked.
- `coord-repro.log`: this new packet's two reproduction commands actually ran and passed, without GPU.

## Earlier failed attempts retained

- `skills.log`: stopped at the board-version check. The checkout initially lacked v0.40.x/v0.41.x tags. `git fetch origin --tags` restored v0.41.1; no board content was edited to conceal this environment discrepancy.
- `skills-tags-refreshed.log`: progressed to the configuration census. Adding the two archive tools changed the tracked source count from 2308 to 2310. `decor-candidate.json` preserves the independently generated candidate: classification counts, findings and per-file results were identical. The existing `decor:build` generator then updated only that count in its two owned documents. No generator, schema or game setting changed.
- `restored-workflow-tests.log`: the system Python 3.10 lacked `psutil`. Archive verification/extraction itself uses only the standard library; running the training workflow's tests requires the documented runtime. The subsequent recorded-runtime test succeeded. This is an environment setup failure, not model quality evidence.

`skills-final.log` is the complete rerun after tag restoration and the required generated census refresh. Its terminal result is recorded in `SUMMARY.json`; earlier failures are not deleted or relabeled as passes.
