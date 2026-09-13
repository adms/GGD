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

The recursive non-script package dependency closure is retained separately at
`GGD-Asset-Library/intake/windows-readonly-20260914/infinity-strash-popp-vfx-dependency-closure-v1/`.
It starts from the exact 17 direct roots and their audited 229 first-level
reference occurrences (138 unique references), maps virtual Unreal mounts to
the verified PAK index, and repeats extraction plus package-import parsing until
no new package reference appears. This proves acquisition only.

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

Recreate the recursive closure in another empty directory:

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/extract_dependency_closure.py \
  --receipt materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/receipt.json \
  --pak-source-manifest ../GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/source-manifest.json \
  --pak ../GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/original/pakchunk0-WindowsClient.pak \
  --repak ../GGD-Asset-Library/tools/repak-src-v0.2.3/target/release/repak \
  --extractor /private/tmp/popp-vfx-extractor-build/release/ggd-infinity-strash-prefix-extractor \
  --output ../GGD-Asset-Library/intake/<new-closure-stage-id>
```

The generated `source-manifest.json` contains the PAK identity, extractor and
Repak hashes, round selection manifests, every acquired file hash, dependency
edges, unresolved references, and parse failures.
`nonScriptPackageDependencyClosureComplete` means only that every recursively
discovered non-script package reference was found and parsed at the package
table level.

The complete closure intake is archived by `backup_intake.py` under the only
authorized `legacy/game-intakes/infinity-strash-popp-vfx-dependency-closure-v1/`
S3 prefix. `build.py` requires the committed full-download and per-member
SHA-256 readback receipt. That receipt proves preservation only and never
changes `vfxConverted`, visual acceptance, runtime selection or deployment.

The preserved project-specific UModel build can still export many support
assets even though it cannot emit the 17 Niagara roots. Run the bounded batch
export against the verified closure:

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/export_dependency_assets.py
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/export_dependency_assets.py --check
```

The output is retained at
`GGD-Asset-Library/conversions/infinity-strash-popp-vfx-dependency-export-v1/`.
Its manifest records every package result, emitted file path, size and SHA-256.
The current run attempted all 309 packages and exported 789 support files from
203 packages. These files are reconstruction inputs; the manifest keeps
`niagaraSystemsConverted=false` and `ggdVfxConverted=false` until a GGD effect
and visual acceptance evidence exist.

Rebuild and verify:

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/probe_conversion.py
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/export_dependency_assets.py --check
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/probe_conversion.py \
  --raw-vfx ../GGD-Asset-Library/intake/windows-readonly-20260914/infinity-strash-popp-vfx-dependency-closure-v1/raw/strash/Content \
  --output materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/closure-conversion-probe.json
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/build.py
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/extract_dependency_closure.py \
  --receipt materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/receipt.json \
  --pak-source-manifest ../GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/source-manifest.json \
  --pak ../GGD-Asset-Library/intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/original/pakchunk0-WindowsClient.pak \
  --repak ../GGD-Asset-Library/tools/repak-src-v0.2.3/target/release/repak \
  --extractor /private/tmp/popp-vfx-extractor-build/release/ggd-infinity-strash-prefix-extractor \
  --output ../GGD-Asset-Library/intake/windows-readonly-20260914/infinity-strash-popp-vfx-dependency-closure-v1 \
  --check
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/probe_conversion.py --check
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-vfx-events-v1/probe_conversion.py \
  --raw-vfx ../GGD-Asset-Library/intake/windows-readonly-20260914/infinity-strash-popp-vfx-dependency-closure-v1/raw/strash/Content \
  --output materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1/closure-conversion-probe.json \
  --check
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
