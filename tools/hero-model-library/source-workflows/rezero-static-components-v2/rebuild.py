#!/usr/bin/env python3
"""Rebuild Subaru, Rem, Emilia, and Felix from the pinned Re:Zero bundle."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


CONFIGS = (
    {
        "key": "subaru", "prefab": "subaruPrefab", "axis": "y",
        "candidate": "rezero-subaru-thunderstore-0.1.1-static-skinned-v1",
        "converter": "tools/hero-model-library/convert_unity_prefab_mixed.py",
        "normalizer": "tools/hero-model-library/source-workflows/rezero-static-components-v2/normalize_validate.mts",
    },
    {
        "key": "rem", "prefab": "remPrefab", "axis": "z",
        "candidate": "rezero-rem-thunderstore-0.1.1-static-skinned-v1",
        "converter": "tools/hero-model-library/convert_unity_prefab.py",
        "normalizer": "tools/hero-model-library/source-workflows/rezero-static-components-v1/normalize_validate.mts",
    },
    {
        "key": "emilia", "prefab": "emiliaPrefab", "axis": "z",
        "candidate": "rezero-emilia-thunderstore-0.1.1-static-skinned-v1",
        "converter": "tools/hero-model-library/convert_unity_prefab.py",
        "normalizer": "tools/hero-model-library/source-workflows/rezero-static-components-v1/normalize_validate.mts",
    },
    {
        "key": "felix", "prefab": "felixPrefab", "axis": "z",
        "candidate": "rezero-felix-thunderstore-0.1.1-static-skinned-v1",
        "converter": "tools/hero-model-library/convert_unity_prefab.py",
        "normalizer": "tools/hero-model-library/source-workflows/rezero-static-components-v1/normalize_validate.mts",
    },
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], log: Path) -> None:
    process = subprocess.run(command, text=True, capture_output=True)
    log.write_text(process.stdout + "\nSTDERR\n" + process.stderr, encoding="utf-8")
    if process.returncode:
        raise RuntimeError(f"command failed; see {log}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--reference-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--python", type=Path, required=True)
    args = parser.parse_args()

    repo = args.repo.resolve()
    bundle = args.bundle.resolve()
    reference = args.reference_root.resolve()
    output = args.output.resolve()
    python = args.python.absolute()
    if output.exists():
        raise FileExistsError(output)
    source_root = output / "source-conversion"
    final_root = output / "final"
    source_root.mkdir(parents=True)
    final_root.mkdir()

    rows = []
    commands = []
    tool_paths = set()
    for config in CONFIGS:
        key = config["key"]
        converter = repo / config["converter"]
        normalizer = repo / config["normalizer"]
        tool_paths.update((config["converter"], config["normalizer"]))
        raw_out = source_root / key
        raw_out.mkdir()
        convert_command = [
            str(python), str(converter), str(bundle), str(raw_out),
            "--root-name", config["prefab"], "--height", "1.8",
            "--source-up-axis", config["axis"],
        ]
        normalize_command = [
            "node", "--import", "tsx", str(normalizer), str(repo), str(raw_out),
            str(final_root / key), config["candidate"],
        ]
        run(convert_command, output / f"{key}-convert.log")
        run(normalize_command, output / f"{key}-normalize.log")
        commands.extend((convert_command, normalize_command))
        source_model = raw_out / "body.glb"
        model = final_root / key / "body.glb"
        reference_source = reference / "source-conversion" / key / "body.glb"
        reference_model = reference / "final" / key / "body.glb"
        source_sha = sha256(source_model)
        model_sha = sha256(model)
        rows.append({
            "character": key,
            "candidateId": config["candidate"],
            "sourceUpAxis": config["axis"],
            "converter": config["converter"],
            "normalizer": config["normalizer"],
            "sourceConversion": {
                "path": str(source_model), "bytes": source_model.stat().st_size,
                "sha256": source_sha, "referenceSha256": sha256(reference_source),
                "byteIdentical": source_sha == sha256(reference_source),
            },
            "normalized": {
                "path": str(model), "bytes": model.stat().st_size,
                "sha256": model_sha, "referenceSha256": sha256(reference_model),
                "byteIdentical": model_sha == sha256(reference_model),
            },
        })

    version_output = subprocess.check_output(
        [str(python), "-c", "import sys,UnityPy,numpy,PIL;print(sys.version);print(UnityPy.__version__);print(numpy.__version__);print(PIL.__version__)"],
        text=True,
    )
    receipt = {
        "schema": "ggd.rezero-static-components-rebuild@2",
        "sourceId": "thunderstore-rezero",
        "sourceVersion": "0.1.1",
        "bundle": {"path": str(bundle), "bytes": bundle.stat().st_size, "sha256": sha256(bundle)},
        "referenceRoot": str(reference),
        "outputRoot": str(output),
        "pythonVersionOutput": version_output,
        "toolPins": [{"path": path, "sha256": sha256(repo / path)} for path in sorted(tool_paths)],
        "commands": commands,
        "components": rows,
        "allSourceConversionsByteIdentical": all(row["sourceConversion"]["byteIdentical"] for row in rows),
        "allNormalizedModelsByteIdentical": all(row["normalized"]["byteIdentical"] for row in rows),
        "note": "Absolute paths and JSON receipts differ between runs; both GLB stages are byte-compared. Subaru alone uses Y-up and a source-evidenced hierarchy-rigid face skin.",
    }
    (output / "rebuild.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    if not receipt["allSourceConversionsByteIdentical"] or not receipt["allNormalizedModelsByteIdentical"]:
        raise RuntimeError("Rebuilt model bytes differ from the accepted reference")


if __name__ == "__main__":
    main()
