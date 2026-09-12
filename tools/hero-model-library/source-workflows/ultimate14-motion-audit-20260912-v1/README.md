# Ultimate14 NUANMB motion audit

This workflow reads every acquired `.nuanmb` with `ssbh_data_py==0.9.1`, hashes
each source path, deduplicates identical payloads, and records the SSBH version,
frame extent, group/track/value counts, and transform node names. It never calls
`save()` and never modifies the acquired source tree.

The report separates character body motion, accessory motion, and `model/`
animation metadata. Parsed transform tracks prove readable native motion data;
they do not prove skeleton compatibility, semantic event mapping, conversion,
backend registration, runtime selection, or deployment.

```bash
python3 -m venv <isolated-venv>
<isolated-venv>/bin/python -m pip install -r requirements.txt
<isolated-venv>/bin/python audit.py \
  --source-root <parallel-ns-ultimate14/extracted/Ultimate14/Ultimate14> \
  --output <GGD>/materials/hero-model-library/source-inventories/ultimate14-native-motions.json \
  --repo <GGD> --sync-central
```

Run the same command with `--check` and without `--sync-central` to reproduce the
report byte for byte using its stored `auditedAt` value.

Other workflows can query the committed report without installing the native
parser:

```bash
python3 tools/hero-model-library/source-workflows/ultimate14-motion-audit-20260912-v1/query.py mario
python3 tools/hero-model-library/source-workflows/ultimate14-motion-audit-20260912-v1/query.py mario --class body-motion --unique --json
```
