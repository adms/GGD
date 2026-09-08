# Exact 12B base-model backup and restore

This additional backup covers the actual base used by the 12B experiments: `mlx-community/gemma-4-12B-it-8bit`, revision `200bb6db075e137a4deb08838865ac4ddb86292e`. It is not a substitute base for the historical 4B/9B/27B adapters, and it does not promote any research adapter.

The original research migration's approximately 290 MB contained adapter deltas and ZIPs, **not** this base. `S3_INDEX.json` and `S3_RECEIPT.json` remain unchanged. The base has its own `BASE_S3_INDEX.json` and completion receipt `BASE_S3_RECEIPT.json`.

## Preserved files and identity

The base comprises 11 files totaling **12,748,534,481 bytes (12.75 GB)**: three safetensors weight shards, their tensor-to-shard index, tokenizer, chat template, processor and model/generation/tokenizer configuration, and original README. Downloader `.cache` metadata is deliberately excluded and never traversed; no model files are fetched again from an upstream provider.

Each original filename, byte count and complete SHA-256 is pinned. All 11 files were compared with the experiment's existing `gpu-preflight-v1.json`; the original download receipt and repository revision are also recorded. Small files whose original download receipt had no hash are checked against the later, pre-training hash record instead of claiming new upstream-identity proof.

The index records the runtime package versions observed in that training preflight. Research archives retain the original runtime/resource receipts, adapter configurations and pinned engine information. Model license/notice materials remain in `LICENSE-MODELS` and `NOTICE-MODELS` beside this guide.

## Storage and resumability

The existing fixed AWS profile/region/bucket boundary is reused: `vibe-coding`, `ap-east-2`, `ggd-390630837668-ap-east-2-an`. Every network run checks the expected STS role first. There are 56 content-addressed chunks, each at most 256 MiB, stored under `hero-finetune-research/base-model/sha256/<sha256>.bin`.

Each object is written conditionally, then downloaded with GetObject and hashed. This uses only the authorized ListBucket/GetObject/PutObject actions, no multipart, deletion, public ACL or IAM changes. It neither reads credential files nor injects temporary credential values.

Each successful remote read-back records a local per-chunk receipt bound to the complete base index hash. After an interrupted invocation, a new invocation rechecks these receipt/cache hashes and resumes missing work without retransmitting verified chunks. An AccessDenied ends the invocation immediately; resolve it with the owner before resuming, without changing profiles or trying to bypass it. A completion receipt exists only after every chunk has a recorded verified GET. Such receipts are historical proof, not a guarantee of present availability.

Only classified connection/reset/timeout failures receive at most two bounded transfer retries. Unknown errors, TLS validation failures, credential-provider failures and AccessDenied are not retried. If a conditional PUT's response was lost and its retry reports an existing object, the workflow still requires a complete GET/hash check; it does not overwrite or assume success.

## Restore on another Mac

The S3 restore kit is a separate small archive of the committed restore scripts, model/research indices, receipts, manifests, readable reports and notices. It contains no model payloads or credentials. Its fixed key is `hero-finetune-research/restore-kits/gemma-4-12b-200bb6db-20260908-v1/restore-kit.tar.gz`. It is published only after base backup and full reconstruction verification complete. This lets a new machine restore without access to the unpublished local Git branch.

If that source checkout is unavailable, download the kit with the same preconfigured profile and extract it into a new directory, then run the commands below from the extracted directory:

```sh
AWS_PROFILE=vibe-coding AWS_REGION=ap-east-2 aws s3 cp s3://ggd-390630837668-ap-east-2-an/hero-finetune-research/restore-kits/gemma-4-12b-200bb6db-20260908-v1/restore-kit.tar.gz ./restore-kit.tar.gz --region ap-east-2
mkdir restored-research-tools
tar -xzf restore-kit.tar.gz -C restored-research-tools
cd restored-research-tools
```

The kit receipt records its source commit, byte count and SHA-256. Do not extract over an existing project. The kit contains this guide and all three Python restore/verification modules; it does not require a Git repository to run either `restore` or `hydrate`.

From the source repository, with Python 3.10+ and AWS CLI available and the owner-approved AWS profile already configured:

```sh
# Offline metadata/receipt consistency only; does not contact AWS or verify payloads.
python3 tools/editor-acceptance/hero-finetune-base-s3.py verify-index docs/_reports/hero-finetune-research --receipt

# Download all chunks, reconstruct the exact original 11 files, and verify all hashes.
python3 tools/editor-acceptance/hero-finetune-base-s3.py restore docs/_reports/hero-finetune-research --destination /absolute/new/gemma-4-12B-it-8bit
```

Use a **new** destination. Existing model directories are never overwritten. An interrupted restore leaves its separate destination available for diagnosis; choose another new destination for a subsequent attempt. Allow approximately 26 GB of free space for the restored model plus the verified chunk cache during restoration. No MLX or inference worker is started by these commands.

To reconstruct from an already downloaded, hash-verified chunk cache without a network call:

```sh
python3 tools/editor-acceptance/hero-finetune-base-s3.py restore docs/_reports/hero-finetune-research --destination /absolute/new/gemma-4-12B-it-8bit --cache /absolute/existing/base-readback-cache --offline
```

Then follow [research artifact restore](S3_STORAGE.md) to recover the matching 12B adapter and its `adapter_config.json`/model card. The model card's loading contract is `mlx_vlm.load(BASE_DIRECTORY, adapter_path=ADAPTER_DIRECTORY, trust_remote_code=False)`. Use the restored base path and the exact intended experiment's adapter directory; adapters are deltas, not independent full models. The latest 72-step adapter remains rejected for whole-hero generation.

## Reproducibility boundary

This provides **byte-identical model and research-artifact restoration**, not a full machine image or a promise of bit-identical inference on different hardware/software. Install the recorded compatible runtime separately. Some historical supervisors explicitly check original absolute directories and pinned engine hashes; recreating those directories on a new Mac, or reviewing a separate relocation configuration, is still required to rerun those supervisors. Do not weaken provenance checks or silently substitute current upstream weights.

No base/ZIP/model bytes are placed back into Git; only scripts, documentation, indices, hashes and receipts are committed. Original local weights are retained. The backup does not alter datasets, engine code, training or model-qualification results.
