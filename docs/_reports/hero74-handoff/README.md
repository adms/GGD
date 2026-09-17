# Hero 74 historical material archive

This directory is the small, reviewable index for the immutable archive that was
first delivered by [PR #1144](https://github.com/adms/GGD/pull/1144). The current
`main` branch already has the maintained hero implementation through later work;
this handoff preserves only the historical material restore contract that did not
land there.

Git contains the exact 27,190-byte manifest, its S3 location, these instructions,
and download/restore/verification tools. It does not contain the payload bytes
for the three archive parts, restored material, inference logs, private
packages, teacher outputs, or compiled outputs.

| Property | Fixed value |
| --- | --- |
| Manifest SHA-256 | `d83f95f5d29ac52bd5419170f3b6ba383c77e67a3afb5652b6ddbc6756ffbd74` |
| S3 prefix | `s3://ggd-390630837668-ap-east-2-an/community-hero-forge/d83f95f5d29ac52bd5419170f3b6ba383c77e67a3afb5652b6ddbc6756ffbd74/` |
| Indexed files | 106 paths, 102 unique payloads |
| Restored size | 123,638,832 bytes |
| Download size | 77,724,789 bytes in three SHA-256-pinned parts |

The manifest is the per-file index. Every restored path records bytes, SHA-256,
and mode. `verify.py` also checks the manifest summary, content-addressed S3
prefix, part order and hashes, path safety, and the exact restored tree.

## Verify the Git index

From the repository root:

```sh
python3 tools/hero74-handoff/verify.py
```

This command performs no network access. A successful result proves only that
the committed index is internally consistent.

## Download and restore

The download is read-only and requires the existing `vibe-coding` AWS profile to
resolve to the expected account role. The tools contain no upload, delete, ACL,
or bucket mutation operation. Use new absolute directories outside every Git
worktree:

```sh
parts_dir="$(mktemp -d "${TMPDIR:-/tmp}/ggd-hero74-parts.XXXXXX")"
restored_dir="${parts_dir}.restored"

python3 tools/hero74-handoff/restore.py \
  --download \
  --parts-dir "$parts_dir" \
  --output "$restored_dir"

python3 tools/hero74-handoff/verify.py \
  --parts-dir "$parts_dir" \
  --restored-dir "$restored_dir"
```

The downloader first retrieves the remote manifest and requires its SHA-256 to
match the Git copy. It then verifies every part before the restorer streams the
archive into a new temporary directory. The final directory is installed only
after every restored file matches the manifest. Standard `tempfile` APIs and
`${TMPDIR:-/tmp}` keep the workflow portable across supported platforms.

The restored archive includes private hero packages and historical inference
outputs and logs. Keep it outside Git and limit access to the evaluation
coordinator. Do not mount it into a model evaluation environment. See
[MODEL_EVALUATION.md](MODEL_EVALUATION.md) for the input boundary.

These checks establish material delivery and byte integrity. They do not prove
hero runtime behavior, model quality, blind-test eligibility, merge status, or a
production release.
