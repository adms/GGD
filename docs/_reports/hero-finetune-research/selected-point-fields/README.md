# Selected-point field admission supplement

Local research evidence, not a qualified model or an engine fix. The source-point problem affects Lux E, Miss Fortune E and Xerath R in the reviewed candidates. Read [the report](REPORT.md) and [the exact result](RESULT.json).

Real compiler/registry/SimWorld checks: 12/12 empty-or-centered controls pass; all six off-center cases fail on two seeds. The stationary witness receives zero of the three expected field hits. V2 verifies zero witness movement across all 180 frames; V1 is retained with its body-separation limitation. No source or old model score was changed.

The bundle contains nine original files in five archives, no adapter weights. Its scripts depend on the original research bundle and the earlier source-admission supplement, including the pinned engine and runtime described there. This is not a standalone dependency installer.

```sh
python3 tools/editor-acceptance/hero-finetune-archive.py verify docs/_reports/hero-finetune-research/selected-point-fields/bundle
node tools/editor-acceptance/hero-ground-barrage-repro.mjs --verify-selected-field-controls
node tools/editor-acceptance/hero-ground-barrage-repro.mjs --expect-selected-field-point
```

Expected exits are 0, 0 and 1. The portable tool isolates the real delayed scheduler with pre-resolved single target lists; it is not represented as the full circular-field damage test. The archived run provides that separate compiled-hero evidence.

Existing `--verify-controls` and `--expect-source-point` modes still reproduce randomArea with exits 0 and 1. The new modes do not replace the original packet evidence. Publication remains pending explicit approval of this additional detailed public diagnosis; no workaround push or comment was made.
