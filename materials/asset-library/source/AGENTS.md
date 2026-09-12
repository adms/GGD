# Resource library workflow boundary

- Production consumers must use the Git-pinned finished release in `materials/asset-library/git-release.json` and its approved catalog. Existing S3 releases remain mirrors.
- `s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/` is backup only. Use this corrected canonical prefix.
- Never automatically consume, restore, import, or use raw/intermediate backup assets in another workflow. Require explicit user authorization for the specific snapshot/assets/purpose. Authorized backup uploads and integrity verification are allowed.
- Do not include backup paths or assets in production catalogs, default queries, release ZIPs, or download tools. Do not recursively download the bucket.
- Preserve local originals and previous S3 objects. Use only the configured vibe-coding AWS profile in ap-east-2; never inspect credentials or alter IAM/ACL/bucket policies.
- See BACKUP_POLICY.json and BACKUP_README.md. This is a workflow contract, not an IAM-enforced read denial.

- Storage ownership follows the latest owner rule: all finished assets, including binaries, belong in Git. Raw sources, intermediate assets, preparation materials and bulk native parsing JSON belong in S3. Scripts, configuration, manifests, SHA-256 indexes and documentation remain in Git. Preserve all local copies and existing S3 objects.
