# 300 Heroes / MBA unused asset inventory

This workflow reads the existing local extraction, the frozen candidate SQLite
registry, the central design backlog and the read-back-verified 20260908 backup
manifest. It does not download, buy, extract, convert, upload or delete files.

Run from the GGD repository root:

```sh
python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/build_index.py
python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/test_index.py
python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/query.py 300heroes:135
python3 tools/hero-model-library/source-workflows/300-mba-unused-assets-v1/query.py --kind model --unused-only --dedupe-sha256
```

`files.jsonl.gz` has one row per physical model, animation container, native VFX
configuration or prop/environment candidate. `animation-clips.jsonl.gz` keeps
the logical clips separately because one GLB/X container can expose many clips.

The bulk SHA values come from a per-file manifest whose archive was published
and read back successfully. Every indexed local path is also checked for current
existence and size. Declared character body files are freshly SHA-256 hashed on
each build. `runtime-source-used` only means that exact source asset ID is used
by a current Git model; it does not make the raw source file selectable.

Every physical-file row records acquisition, extraction, conversion-candidate,
GGD final acceptance, runtime registration, runtime selectability and production
deployment as separate stages. `contentObjectId` deduplicates byte-identical
content by SHA-256, while every path/version/character/S3 relationship remains a
separate provenance row. Catalog-only IDs for missing bodies and skill props stay
outside the acquired-character design backlog, so the workflow does not invent
hero IDs or extend the 11 approved processed-copy authorizations.
