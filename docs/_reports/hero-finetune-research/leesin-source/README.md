# Lee Sin whole-source candidate

Payloads are in private S3. First follow the [hydrate instructions](../S3_STORAGE.md); archive commands below use the separate restored delivery directory.

[Report](REPORT.md), [source/behavior result](RESULT.json), [offline package result](PACKAGE_RESULT.json), and [offline ZIP restore instructions](../S3_STORAGE.md).

This is a newly reviewed content candidate, not a model output or a new holdout. All 28 source-oriented scenarios pass; all 12 deliberately wrong, schema-valid recipes are detected with passing controls. Seven compiler helper tests pass. The official offline package builder/reader/validator round trip preserves the entire project and compiled content; repeated builds are byte-identical. A forged runtime with recomputed outer hashes is still rejected.

The archive retains v1's six fixture failures, v2's corrections, both original raw runs, eight source/test scripts, reviewed source choices, and the editable project. No engine or original recipe changed between the two runs. Training remains disabled pending a source-choice-aware model contract; unspecified recipe values must not become unique source labels.

The bundle has 23 files in 12 archives, no adapter blobs. The archive tool deliberately omits nested packages, so the 2,890,218-byte offline ZIP is separately indexed in private S3. Hydration restores it beside this file in the separate delivery directory. Its SHA-256 must equal `28b5ce6dd54861814e8ec8a7eeabb7690a0d62a0a169ce165e7f32e070245bfe`; the bundle manifest records the same omitted path/hash. Package JSON includes original binary asset arrays and is evidence, not a smaller replacement for the ZIP.

```sh
python3 tools/editor-acceptance/hero-finetune-archive.py verify /absolute/new/hydrated-delivery/leesin-source/bundle
shasum -a 256 /absolute/new/hydrated-delivery/leesin-source/leesin-reviewed-offline.zip
```

The first archival attempt used the package receipt's `completed` status, which the archival guard does not accept. It stopped before writing a bundle. The successful build uses the terminal source audit receipt (`stopped-report-written`); no receipt or guard was weakened. Archive verification and extraction to a fresh directory pass.

The recorded engine/runtime and original research bundle remain dependencies. This is not a live importer/game, visual, 16GB-device or model-quality certification. This supplement is local-only until explicit public publication approval; no push was made.
