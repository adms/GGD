# Private research artifact storage

Scope: move existing research adapter weights and ZIP archives, unchanged, to the owner-authorized private bucket. No training, dataset expansion, engine edits, model promotion, S3 deletion, IAM changes, or Git-history rewrite.

Additional owner-requested base backup: [restore the actual 12.75 GB 12B base](BASE_MODEL_RESTORE.md). It uses separate `BASE_S3_INDEX.json`/`BASE_S3_RECEIPT.json`; the original 290 MB index and receipt below still refer only to adapters and research archives.

## Inventory and proof

- Source tree: `69c2b3c0345d5a16b25013abe903ff1f79f9ec9b`.
- Eight immutable bundle manifests; original archive plus seven supplements.
- 142 payload paths map to 141 unique objects: 21 unique adapters and 120 ZIP files, totaling 290,033,569 bytes (276.60 MiB). The duplicated 24-step checkpoint shares one S3 object.
- `S3_INDEX.json` maps original delivery-relative paths to exact object keys, byte lengths and SHA-256 values. Original bundle manifests additionally retain each archived member's original workspace path and hash.
- `S3_RECEIPT.json` records the completed migration's GET/download SHA-256 verification of every object. This is historical evidence, not a guarantee of present S3 availability. It contains no credentials or session tokens.
- The separate Lee Sin offline ZIP is included in the index, in addition to the eight bundles; no nested package was silently dropped.

Only the current tree loses ZIP/weight payloads. Existing commits still contain their historical blobs; this change does not shrink prior Git history. Original research outputs and a local, hash-verified download cache are retained outside the delivery tree. Base/fused model weights were never part of this migration.

## Fixed security boundary

The script pins AWS profile `vibe-coding`, region `ap-east-2`, and bucket `ggd-390630837668-ap-east-2-an`. Keys are `hero-finetune-research/sha256/<sha256>.zip` or `.safetensors`; no public ACL is set. Access follows the existing bucket policy, which this task does not inspect or modify.

For new bundles, commit the readable bundle manifest and source mirrors before running `plan`; leave the declared ZIP and `.safetensors` payloads outside Git. `plan` resolves those local bytes only through the committed manifest, verifies the complete archive, and creates their content-addressed index. This keeps new model payloads out of Git history without letting an untracked, undeclared binary enter the S3 receipt.

Every network invocation checks STS caller identity first and requires account `390630837668` and `assumed-role/vibe-coding-s3-role/`. The AWS CLI uses the existing profile's credential provider chain. The script does not open credential files or obtain/inject temporary credential values.

Publication uses only ListBucket, conditional PutObject (no overwrite), and GetObject. Existing content-addressed objects are downloaded and checked, not overwritten. AccessDenied ends the invocation with the action and resource; there is no alternate profile, permission expansion or automatic bypass. A failed run writes no completion receipt. After the cause is resolved with appropriate authorization, a new invocation can reuse already-uploaded objects by hash.

## Cold restore

Run from the Git repository root. Replace the two example destinations with new absolute paths; do not restore into a live checkout.

```sh
# Offline metadata/source-mirror checks plus historical receipt consistency only.
python3 tools/editor-acceptance/hero-finetune-s3.py verify-index docs/_reports/hero-finetune-research --receipt

# Network: fixed profile, STS check, download every object, full hash/member checks.
python3 tools/editor-acceptance/hero-finetune-s3.py hydrate docs/_reports/hero-finetune-research --destination /absolute/new/hydrated-delivery

# Restore the original workspace-relative paths for one bundle.
python3 tools/editor-acceptance/hero-finetune-archive.py extract /absolute/new/hydrated-delivery/bundle --destination /absolute/new/research-workspace
```

For a supplement, replace `hydrated-delivery/bundle` with, for example, `hydrated-delivery/fixed-data-72/bundle` and use another new extraction directory. The original archive verifier/extractor is unchanged and still fails if payloads are missing or corrupt. Unreviewed overlapping supplement paths are not automatically merged over previous experiments.

The Lee Sin package is restored as `hydrated-delivery/leesin-source/leesin-reviewed-offline.zip`, SHA-256 `28b5ce6dd54861814e8ec8a7eeabb7690a0d62a0a169ce165e7f32e070245bfe`.

For a previously downloaded content-addressed cache, an offline restore is available:

```sh
python3 tools/editor-acceptance/hero-finetune-s3.py hydrate docs/_reports/hero-finetune-research --destination /absolute/new/offline-delivery --cache /absolute/existing/verified-cache --offline
```

This rechecks cache bytes and all archive members but reports `remoteReadThisRun: false`. An incomplete restore directory is preserved for diagnosis; choose a new destination for a later attempt. No automatic cleanup deletes user directories or S3 objects.

## Testing and limitations

```sh
python3 tools/editor-acceptance/hero-finetune-s3.test.py
python3 tools/editor-acceptance/hero-finetune-archive.test.py
```

Tests cover cold restore without source binaries, corruption, missing/duplicate metadata, manifest integrity, path traversal/symlinks, destination/profile enforcement, identity mismatch, sanitized AccessDenied with no retry, conditional creation, interrupted publication/resume, receipt completeness, and no-overwrite restore.

Migration validation: all 141 objects were downloaded from S3 and matched SHA-256; all eight bundles were then restored from that verified cache without copying source-tree ZIP/weight files. The unchanged full archive verifier checked every bundle and archive member. The fixed-data 72-step supplement was additionally extracted into a new original-layout directory (59 files, 17 archives, three adapter blobs). The storage tests passed 12/12 and original archive tests passed 7/7. See `S3_VERIFICATION.json` for exact scope and retained evidence paths.

One initial GetObject invocation failed with a non-AccessDenied CLI error after 45 verified objects. A same-profile read of that exact object succeeded; the next full publication pass re-read all 141 objects successfully. No completion receipt was issued by the failed pass, and no permission was changed. The original CLI diagnostic was sanitized, so the precise transient root cause is not claimed.

No GPU, inference, full-hero acceptance or 16GB-device qualification is implied by storage checks. Research model rejection and all original negative results remain unchanged. Public CI does not need AWS access: it checks metadata and deterministic fixtures only; run `hydrate` explicitly to prove current remote payload availability.
