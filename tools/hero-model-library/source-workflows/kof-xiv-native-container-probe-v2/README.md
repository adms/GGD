# KOF XIV native container preflight v2

`probe.py` is a read-only structural parser for the local MAI, IOR and KYO
KOF XIV payloads. It verifies each target file against the source extraction
manifest, then only extracts exact length-prefixed ASCII data that can be
cross-checked across OMIR, OSEC and OTRA. It does not execute game code,
download tools, alter source files, make GLB output, or register a hero option.

```sh
python3 tools/hero-model-library/source-workflows/kof-xiv-native-container-probe-v2/probe.py --repo . --workspace ..
python3 tools/hero-model-library/source-workflows/kof-xiv-native-container-probe-v2/probe.py --repo . --workspace .. --check
```

The result establishes these limited facts:

- OMIR and OSEC have identical ordered skeleton-name tables.
- OTRA has a continuous name table covering those skeleton names and exact
  length-prefixed native action labels.
- The opaque regions still need an audited parser for hierarchy/bind data,
  geometry, weights, transform keys and timing before any pilot model can be
  converted or evaluated.

The generated, inspectable evidence is at
`materials/hero-model-library/source-inventories/kof-xiv-native-container-probe-v2/`.
