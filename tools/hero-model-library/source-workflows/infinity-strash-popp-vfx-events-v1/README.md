# Infinity Strash Popp VFX/event audit v1

This lane verifies the 17 VFX package references and 41 PN020 animation/event
references already retained by the Popp integration review. It reads preserved
local extracts only. It never executes Unreal packages and never creates a GGD
runtime binding from a filename or native event label.

The 17 direct VFX package pairs were extracted from the byte-verified local PAK
mirror with the existing bounded Rust extractor and this manifest shape:

```text
strash/Content/<each /Game VFX reference>.uasset
strash/Content/<each /Game VFX reference>.uexp
```

The exact source PAK is recorded in
`GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/source-manifest.json`.
The bounded extract is retained at
`GGD-Asset-Library/intake/windows-readonly-20260914/infinity-strash-popp-vfx-direct-packages-v1/`.

Recreate that bounded extract in a new directory with the existing Rust
extractor (built from the tracked `infinity-strash-priority-raw-v2` source):

```bash
RUSTUP_HOME=../GGD-Asset-Library/tools/rust-toolchain/rustup \
CARGO_HOME=../GGD-Asset-Library/tools/rust-toolchain/cargo \
CARGO_TARGET_DIR=/private/tmp/popp-vfx-extractor-build \
../GGD-Asset-Library/tools/rust-toolchain/cargo/bin/cargo build --release --locked \
  --manifest-path tools/hero-model-library/source-workflows/infinity-strash-priority-raw-v2/Cargo.toml

python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/extract.py \
  --dependency-index materials/hero-model-library/infinity-strash/dependency-index.json \
  --pak-source-manifest ../GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/source-manifest.json \
  --pak ../GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/original/pakchunk0-WindowsClient.pak \
  --extractor /private/tmp/popp-vfx-extractor-build/release/ggd-infinity-strash-prefix-extractor \
  --output ../GGD-Asset-Library/intake/<new-stage-id>
```

Rebuild and verify:

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/probe_conversion.py
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/build.py
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/probe_conversion.py --check
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/build.py --check
python3 -m unittest tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/test_build.py
```

Serve the listening-review page on the local Mac:

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/serve_review.py \
  --review-dir materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1
```

The server exposes only the 36 WAV files enumerated by the generated queue.
Every candidate starts pending with `runtimeSelectable=false`. Exported browser
decisions are review input; another validated integration step must consume an
owner-approved receipt before any skill binding can exist.
