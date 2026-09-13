# Infinity Strash priority raw extraction v2

This workflow reads the authorized Windows Steam `pakchunk0-WindowsClient.pak` through `repak` 0.2.3 and extracts every indexed package whose path contains one of the confirmed native IDs `PN010`, `EN801`, or `EN653`.

- `PN010` is Dai.
- `EN801` is Vearn. The exact pre/post-transformation form still requires visual review of the exported mesh.
- `EN653` is MystVearn, a separate character. It must not be merged with Vearn.
- Baran uses `EN680`/`EN681` and is intentionally outside this extraction batch.

`extract.py` writes an immutable selected-path list, raw Unreal packages, per-file SHA-256 values, absolute local paths, category counts, tool hashes, and explicit readiness states. A successful raw extraction is not a converted model, accepted hero option, backend registration, or deployment.

The helper in `src/main.rs` opens the PAK index once and streams only the selected members. Build and verify it with `cargo test --release --locked`, `cargo build --release --locked`, and `python3 -m unittest -v test_extract.py`. Run the Python wrapper with explicit `--pak`, `--repak`, `--extractor`, and new `--output` paths.

After extraction, run `integrate.py --workspace <ABxVFX_EDIT>` to rehash all 5,530 files and update the central source registry plus compact Git evidence. Then use the repository `archive-intake.py` workflow for the local/S3 `legacy/` archive. Registration records raw acquisition only; conversion, acceptance, backend selection and deployment require later evidence.
