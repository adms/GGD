#!/usr/bin/env python3
"""Rebuild matching-rig Worldblender + Ultimate14 motion components twice."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
ASSETS = WORKSPACE / "GGD-Asset-Library"
WORLD_REPO = ASSETS / "intake/public-models-20260910/gitlab-ssbu-models/source-repository"
LFS_MANIFEST = ASSETS / "intake/public-models-20260910/gitlab-ssbu-models/source-lfs-manifest.json"
ULTIMATE_ROOT = ASSETS / "intake/public-models-20260910/parallel-ns-ultimate14/extracted/Ultimate14/Ultimate14"
MOTION_INDEX = REPO / "materials/hero-model-library/source-inventories/ultimate14-native-motions.json"
ADDON_ROOT = ASSETS / "dependencies/smash-ultimate-blender-3.0.4/extracted/smash-ultimate-blender"
ADDON_ZIP = ASSETS / "dependencies/smash-ultimate-blender-3.0.4/smash-ultimate-blender-3_0_4.zip"
ADDON_ZIP_SHA = "813cd5af33b5c74d7bdc88a81095ee09cff3662d0ac50f858d8d6dc596237248"
IMPORTER = REPO / "tools/hero-model-library/source-workflows/ssbu-ultimate14-motion-v1/import_nuanmb_actions.py"
CONVERTER = REPO / "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py"


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=REPO, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blender", type=Path, required=True)
    parser.add_argument("--fighter", action="append", required=True)
    parser.add_argument("--output-root", type=Path, default=ASSETS / "conversions")
    args = parser.parse_args()
    blender = args.blender.resolve()
    if not blender.is_file():
        raise SystemExit(f"Missing Blender executable: {blender}")
    lfs = {row["name"]: row for row in json.loads(LFS_MANIFEST.read_text())}
    motion = json.loads(MOTION_INDEX.read_text())
    motion_sha = sha(MOTION_INDEX)
    if sha(ADDON_ZIP) != ADDON_ZIP_SHA:
        raise SystemExit("Smash Ultimate Blender ZIP hash mismatch")
    batch = []
    for fighter in args.fighter:
        if fighter not in motion["fighters"]:
            raise SystemExit(f"No pinned Ultimate14 motion fighter: {fighter}")
        source_rel = f"fighter/{fighter}/model/body/c00/{fighter}-c00.blend"
        source = WORLD_REPO / source_rel
        source_pin = lfs.get(source_rel)
        if not source_pin or not source.is_file() or sha(source) != source_pin["oid"]:
            raise SystemExit(f"Worldblender c00 source missing or hash mismatch: {fighter}")
        aliases = []
        seen = set()
        for row in sorted(motion["aliases"], key=lambda item: item["relativePath"]):
            if row["fighterId"] != fighter or row["directoryClass"] != "body-motion" or row["sha256"] in seen:
                continue
            seen.add(row["sha256"])
            path = ULTIMATE_ROOT / row["relativePath"]
            if not path.is_file() or sha(path) != row["sha256"]:
                raise SystemExit(f"Pinned motion missing or hash mismatch: {path}")
            aliases.append((path, row))
        root = args.output_root.resolve() / f"ssbu-{fighter}-ultimate14-motion-v1"
        if root.exists():
            # A fully completed first import may be resumed after an external
            # Blender startup failure, but never overwrite any other stage.
            allowed = {root / "import-01"}
            actual = {path for path in root.iterdir()}
            if actual - allowed or not (root / "import-01/import-receipt.json").is_file():
                raise SystemExit(f"Output root must be absent or resumable import-01 only: {root}")
        builds = []
        for number in (1, 2):
            import_dir = root / f"import-{number:02d}"
            converted_dir = root / f"converted-{number:02d}"
            intermediate = import_dir / f"{fighter}-c00-ultimate14-actions.blend"
            if not import_dir.exists():
                run([
                    str(blender), "--background", "--factory-startup", "--python", str(IMPORTER), "--",
                    str(source), str(import_dir), "--fighter-id", fighter, "--output-name", intermediate.name,
                    "--source-sha256", source_pin["oid"], "--addon-root", str(ADDON_ROOT),
                    "--addon-zip", str(ADDON_ZIP), "--addon-zip-sha256", ADDON_ZIP_SHA,
                    "--motion-index", str(MOTION_INDEX), "--motion-index-sha256", motion_sha,
                    *[str(path) for path, _ in aliases],
                ])
            if converted_dir.exists():
                raise SystemExit(f"Refusing to overwrite conversion: {converted_dir}")
            run([
                str(blender), "--background", "--factory-startup", "--python", str(CONVERTER), "--",
                str(intermediate), str(converted_dir), "--expected-sha256", sha(intermediate),
                "--candidate-id", f"ssbu-{fighter}-c00-ultimate14-motion-v1", "--source-id", "parallel-ns-ultimate14",
            ])
            builds.append({
                "importReceipt": str(import_dir / "import-receipt.json"),
                "importReceiptSha256": sha(import_dir / "import-receipt.json"),
                "intermediate": {"path": str(intermediate), "bytes": intermediate.stat().st_size, "sha256": sha(intermediate)},
                "glb": {"path": str(converted_dir / "body.glb"), "bytes": (converted_dir / "body.glb").stat().st_size, "sha256": sha(converted_dir / "body.glb")},
            })
        if builds[0]["glb"]["sha256"] != builds[1]["glb"]["sha256"]:
            raise SystemExit(f"Non-deterministic GLB for {fighter}")
        batch.append({
            "fighterId": fighter,
            "source": {"path": str(source), "bytes": source.stat().st_size, "sha256": source_pin["oid"]},
            "motionCount": len(aliases),
            "motionAliases": [{"path": str(path), "bytes": path.stat().st_size, "sha256": row["sha256"]} for path, row in aliases],
            "builds": builds,
            "finalGlbByteIdenticalRebuild": True,
        })
        root.mkdir(parents=True, exist_ok=True)
        (root / "rebuild-receipt.json").write_text(json.dumps(batch[-1], ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"schema": "ggd-ssbu-ultimate14-matching-motion-batch@1", "fighters": batch}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
