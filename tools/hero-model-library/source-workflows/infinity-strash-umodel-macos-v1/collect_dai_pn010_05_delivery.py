#!/usr/bin/env python3
"""Collect the complete PN010/05 Dai no Tsurugi conversion into one immutable tree."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


CANDIDATE_ID = "infinity-strash-dai-pn010-05-daino-tsurugi-native-v1"
STAGES = (
    ("body/mesh-psk-v1", "dai-pn010-05-mesh-psk-v1"),
    ("body/material-context-v1", "dai-pn010-05-material-context-v1"),
    ("body/textures-v1", "dai-pn010-05-textures-v1"),
    ("weapon/mesh-psk-v1", "dai-pn010-weapon-daino-tsurugi-mesh-psk-v1"),
    ("weapon/material-context-v1", "dai-pn010-weapon-daino-tsurugi-material-context-v1"),
    ("weapon/textures-v1", "dai-pn010-weapon-daino-tsurugi-textures-v1"),
    ("failed-attempts/seven-draw-assembly-v1", "animated-candidates-psk-blender-dai-pn010-05-daino-v1/dai-pn010-05-daino-tsurugi"),
    ("failed-attempts/seven-draw-normalized-v1", "normalized-animated-candidates-psk-blender-dai-pn010-05-daino-v1/dai-pn010-05-daino-tsurugi"),
    ("assembly-v2", "animated-candidates-psk-blender-dai-pn010-05-daino-v2/dai-pn010-05-daino-tsurugi"),
    ("normalized-v2", "normalized-animated-candidates-psk-blender-dai-pn010-05-daino-v2/dai-pn010-05-daino-tsurugi"),
    ("runtime-v2", "runtime-candidates-dai-pn010-05-daino-v2/dai-pn010-05-daino-tsurugi"),
    ("webgl-review-v2", "runtime-webgl-review-dai-pn010-05-daino-v2/dai-pn010-05-daino-tsurugi"),
)
TOOL_NAMES = (
    "export.py",
    "ueviewer-infinity-strash.patch",
    "assemble_candidate_blender.py",
    "normalize_validate_candidate.mts",
    "prepare_runtime_candidate.mts",
    "render_babylon.py",
    "render_babylon.mjs",
    "freeze_runtime_review.py",
    "pipeline.py",
    "pipeline-config.json",
    "collect_dai_pn010_05_delivery.py",
)
SOURCE_CONFIG = "strash/Content/Strash/Chara/Player/PN010/Data/CB_PN010_05.uasset"
SOURCE_TOKENS = {
    "SK_PN010_05_Body", "SK_PN010_01_Hair", "SK_PN010_Weapon_DainoTsurugi",
    "RightAttachWeaponAttachSocketName", "Weapon1_R",
}


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def copy_tree(source: Path, destination: Path) -> None:
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise ValueError("Delivery source contains a symlink: " + str(path))
    shutil.copytree(source, destination)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conversion-root", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    conversion_root, source_root, repo, output = (
        path.resolve() for path in (args.conversion_root, args.source_root, args.repo, args.output)
    )
    if output.exists() or output.is_symlink():
        raise ValueError("Preserve existing Dai delivery: " + str(output))
    missing = [relative for _, relative in STAGES if not (conversion_root / relative).is_dir()]
    if missing:
        raise FileNotFoundError("Missing Dai conversion stages: " + ", ".join(missing))

    assembly = read(conversion_root / STAGES[8][1] / "receipt.json")
    normalized = read(conversion_root / STAGES[9][1] / "ggd-upload.json")
    runtime = read(conversion_root / STAGES[10][1] / "receipt.json")
    webgl = read(conversion_root / STAGES[11][1] / "run.json")
    failed_normalized = read(conversion_root / STAGES[7][1] / "ggd-upload.json")
    attachment = assembly["attachments"][0]
    require(assembly["candidate"] == "dai-pn010-05-daino-tsurugi", "Wrong assembled candidate")
    require(assembly["nativeAnimationCount"] == 6 and assembly["proceduralAnimationCount"] == 0, "Unexpected animation origin counts")
    require(set(attachment["sourceConfigTokenOffsets"]) == SOURCE_TOKENS, "Source configuration proof is incomplete")
    require(attachment["socket"] == "Weapon1_R", "Dai no Tsurugi is not attached to the source socket")
    require(attachment["mergedWithMaterialRole"] == "sheath", "Sword/sheath draw merge is absent")
    require(attachment["atlas"]["sha256"] == sha(Path(attachment["atlas"]["path"])), "Atlas receipt mismatch")
    require(any("Papunica" in row["material"] for row in assembly["filteredMaterials"]), "Dormant Papunica faces were not filtered")
    require(failed_normalized["heroBudget"]["errors"] == ["繪製網格 7 超過英雄模型上限 6。"], "Seven-draw failed attempt is not preserved")
    require(normalized["heroBudget"]["errors"] == [], "Final normalized model exceeds GGD budget")
    require(normalized["outputInspection"]["meshes"] == 6, "Final model does not meet six-draw limit")
    require(runtime["result"]["currentGgdContractAccepted"] is True, "Runtime contract was not accepted")
    require(runtime["khronos"]["issues"]["numErrors"] == 0, "Khronos validation failed")
    require(webgl["complete"] is True and webgl["images"] == 18 and webgl["sourceSha256"] == runtime["output"]["sha256"], "WebGL review is incomplete")

    output.mkdir(parents=True)
    for delivery_relative, source_relative in STAGES:
        copy_tree(conversion_root / source_relative, output / "stages" / delivery_relative)
    source_config = source_root / SOURCE_CONFIG
    require(source_config.is_file() and not source_config.is_symlink(), "Missing source CB_PN010_05")
    (output / "source-config").mkdir()
    shutil.copy2(source_config, output / "source-config" / source_config.name)
    tool_root = Path(__file__).resolve().parent
    (output / "tools").mkdir()
    for name in TOOL_NAMES:
        shutil.copy2(tool_root / name, output / "tools" / name)
    review_source = repo / "materials/hero-model-library/priority-evidence/infinity-strash-dai-pn010-05-daino-v1/runtime-candidates-dai-pn010-05-daino-v2/dai-pn010-05-daino-tsurugi"
    copy_tree(review_source, output / "git-review-evidence")

    rows = []
    for path in sorted(output.rglob("*")):
        if path.is_file():
            rows.append({"path": path.relative_to(output).as_posix(), "bytes": path.stat().st_size, "sha256": sha(path)})
    manifest = {
        "schema": "ggd.infinity-strash-dai-pn010-05-conversion-delivery@1",
        "deliveryId": CANDIDATE_ID,
        "sourceId": "steam-infinity-strash-priority-raw-build-local-20240328",
        "characterId": "PN010/05",
        "characterName": "小呆／達伊（達伊之劍）",
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "sourcePlatform": "Windows (Steam)",
        "sourceConfig": {"absolutePath": str(source_config), "bytes": source_config.stat().st_size, "sha256": sha(source_config), "requiredTokens": sorted(SOURCE_TOKENS)},
        "metrics": {"triangles": normalized["outputInspection"]["triangles"], "drawMeshes": normalized["outputInspection"]["meshes"], "bones": assembly["bones"], "sourceNativeAnimations": 6, "runtimeDistinctAnimations": 5, "proceduralAnimations": 0, "webglImages": 18},
        "status": {"downloaded": True, "extracted": True, "converted": True, "ggdContractAccepted": True, "visuallyAccepted": True, "registeredOnFeatureBranch": True, "backendSelectableOnFeatureBranch": True, "productionDeployed": False},
        "stageCount": len(STAGES),
        "fileCount": len(rows),
        "fileBytes": sum(row["bytes"] for row in rows),
        "files": rows,
        "localPreserved": True,
        "limitations": runtime["limitations"],
    }
    manifest_path = output / "collection-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "stageCount": len(STAGES), "fileCount": len(rows), "fileBytes": manifest["fileBytes"], "manifestSha256": sha(manifest_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
