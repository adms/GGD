# KOF local pipeline v1

This manifest-driven workflow reuses only local, hashed KOF XIV payloads for
MAI, IOR and KYO plus the frozen TRY path index. It does not read LV99 or any
network share. Every stage records input/output SHA-256 in `receipt.json`.

Run all safe local probes and rewrite deterministic evidence:

```bash
python3 tools/hero-model-library/source-workflows/kof-local-pipeline-v1/run.py --workspace ..
```

Re-run the probes and require byte-identical evidence and generated indexes:

```bash
python3 tools/hero-model-library/source-workflows/kof-local-pipeline-v1/run.py --workspace .. --check
```

Apply the existing source integrations and fixed generators before writing the
receipt. This mode remains offline and never invokes the WAD extractor:

```bash
python3 tools/hero-model-library/source-workflows/kof-local-pipeline-v1/run.py   --workspace .. --apply --git-link-root ../GGD-pr1152-next
```

The current MAI/IOR/KYO model, skeleton and motion containers remain blocked:
no audited reader accepts OBAC/OMIR/OSEC/OTRA. The 55 converted VFX textures and
71 native effect groups are owner-approved review inputs, while runtime blend,
timing, attachment and skill binding remain unimplemented. TRY has path metadata
only. The pipeline deliberately reports zero converted runtime models, native
motion clips, runtime VFX bindings and production deployments.
