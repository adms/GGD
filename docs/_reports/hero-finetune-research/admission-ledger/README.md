# Formal real-source admission ledger

Local CPU-only follow-up. No model run, base/adapter change, release or additional push.

All 44 heroes / 264 slots / 33 provisional source families are linked to existing source reviews and exact text hashes. Nine heroes have more detailed whole-intent annotations. Formal executable-Gold and fresh independent-holdout admission remain zero. This is not a claim that this turn manually re-reviewed all 44 heroes.

The eight explicit issues comprise four inherited source ambiguities, three newly verified unstated recipe additions and one previously reproduced empty-ground barrage mismatch. They are not an exhaustive count of incomplete mechanics. The three new observations pass on both deterministic seeds (6/6): Karthus's survival immunity, his W damage, and Miss Fortune's EX movement-speed buff. These are observations of additions not specified by the source, not source-quality passes or explicit source prohibitions.

`REPORT.md` explains the distinctions. `LEDGER.json` lists every hero and slot status plus issue evidence. The bundle includes scripts, seven passing ledger tests, raw SimWorld traces and manifests. The ledger's `verify` command returns 0; `check-training` returns 2 because real-source training is not yet admitted. Existing synthetic IR5 engineering controls are not relabeled or rescored.

## Verify / restore

```sh
python3 tools/editor-acceptance/hero-finetune-archive.py verify docs/_reports/hero-finetune-research/admission-ledger/bundle
python3 tools/editor-acceptance/hero-finetune-archive.py extract docs/_reports/hero-finetune-research/admission-ledger/bundle --destination /absolute/new/admission-ledger-supplement
```

This incremental supplement depends on the original research bundle and the `source-admission` supplement for unchanged source reviews, compiler/catalog receipts, harness and Miss Fortune audit. Extract separately and combine only absent files, without overwriting historical source/score snapshots. The original local research workspace already has the full layout.

An independent source set has been requested from the user. The existing ground-anchor coordination question remains local-only on this branch until publishing authorization is given for the active no-auto-push goal. No new engine capability or universal unsupported conclusion is claimed by these data checks.
