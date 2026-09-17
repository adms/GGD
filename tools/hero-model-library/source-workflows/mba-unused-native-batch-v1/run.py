#!/usr/bin/env python3
"""Rebuild three acquired MBA bodies as local, unbound six-state candidates.

The source client and source registry remain read-only.  The portable result is
deliberately held under the local asset library until a character definition and
visual review exist; the committed receipt is an inventory/evidence record, not
a runtime model registration.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
LIBRARY = WORKSPACE / "outputs/asset-library-registry-20260907/catalog.sqlite"
# v1 was retained after a missing worktree-local Node dependency stopped before
# any final body existed. v2 uses the already provisioned integration checkout
# as a pinned tool host and never overwrites that failed forensic stage.
LOCAL_ROOT = WORKSPACE / "GGD-Asset-Library/conversions/mba-unused-native-batch-v2"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/mba-unused-native-batch-v2/receipt.json"
TOOL_REPO = Path(os.environ.get("GGD_LIBRARY_TOOL_REPO", WORKSPACE / "GGD-pr1152-next")).resolve()
TARGETS = (
    ("mba:Chara08", "naga", "白蛇娜卡", "Naga the Serpent", "秀逗魔導士"),
    ("mba:Chara10", "hayate", "八神疾風", "Hayate Yagami", "魔法少女奈葉"),
    ("mba:Chara11", "vita", "薇塔", "Vita", "魔法少女奈葉"),
)
CLIPS = {
    "idle": "wait", "run": "F-Move", "attack": "attack_01",
    "cast": "sp01_01", "hurt": "Damage-1", "death": "D-Down",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pin(path: Path) -> dict[str, object]:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def source_row(character_id: str) -> dict[str, object]:
    connection = sqlite3.connect(f"file:{LIBRARY}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = list(connection.execute(
            "select a.id,a.library,a.kind,a.format,a.name,a.path,a.exists_local,a.readiness,a.data,l.confidence "
            "from assets a join links l on l.asset_id=a.id where l.character_id=? "
            "and a.library='mba' and a.kind='model' and a.format='glb'", (character_id,)))
    finally:
        connection.close()
    rows = [row for row in rows if row["readiness"] == "glb_candidate" and row["exists_local"]]
    if len(rows) != 1:
        raise ValueError(f"Expected one locally available MBA GLB for {character_id}, found {len(rows)}")
    row = dict(rows[0])
    return {
        "id": row["id"], "library": row["library"], "kind": row["kind"], "format": row["format"],
        "name": row["name"], "path": row["path"], "exists_local": bool(row["exists_local"]),
        "readiness": row["readiness"], "data": json.loads(row["data"]),
        "character_links": [{"character_id": character_id, "confidence": row["confidence"]}],
    }


def call(command: list[str], log: Path) -> None:
    result = subprocess.run(command, cwd=TOOL_REPO, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log.write_text(result.stdout)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(command)}\n{result.stdout[-4000:]}")


def build_one(target: tuple[str, str, str, str, str], root: Path) -> dict[str, object]:
    character_id, slug, name_zh, original_name, work_zh = target
    root.mkdir(parents=True, exist_ok=False)
    query = root / "source-query.json"
    row = source_row(character_id)
    query.write_bytes(encoded({"results": [row]}))
    clips = root / "selected-native-clips.json"
    clips.write_bytes(encoded(CLIPS))
    outputs = []
    for name in ("first", "second"):
        stage = root / name
        stage.mkdir()
        prepared = stage / "prepared-atlas.glb"
        call([sys.executable, str(TOOL_REPO / "tools/community-hero-forge/prepare_mba_body.py"), "--query", str(query), "--asset", str(row["id"]), "--out", str(prepared)], stage / "prepare.log")
        call(["node", "--import", "tsx", str(TOOL_REPO / "tools/community-hero-forge/finalize-library-body.mts"), "--receipt", str(prepared.with_suffix(".receipt.json")), "--clips", str(clips), "--out", str(stage / "final")], stage / "finalize.log")
        call(["node", "--import", "tsx", str(REPO / "tools/hero-model-library/source-workflows/mba-unused-native-batch-v1/validate.mts"), str(stage / "final/body.glb"), str(clips), str(stage / "validation.json")], stage / "validate.log")
        outputs.append(stage / "final/body.glb")
    if outputs[0].read_bytes() != outputs[1].read_bytes():
        raise ValueError(f"Non-deterministic rebuilt MBA candidate: {character_id}")
    first_validation = json.loads((root / "first/validation.json").read_text())
    second_validation = json.loads((root / "second/validation.json").read_text())
    if first_validation["khronosIssues"]["numErrors"] != 0 or second_validation["khronosIssues"]["numErrors"] != 0:
        raise ValueError(f"Khronos errors for {character_id}")
    if first_validation["ggdInspection"]["budget"]["errors"]:
        raise ValueError(f"GGD hard budget errors for {character_id}")
    return {
        "id": f"mba-unused-{slug}-native-six-state-v1", "sourceCharacterId": character_id,
        "nameZh": name_zh, "originalName": original_name, "workZh": work_zh,
        "source": pin(Path(row["path"])), "sourceAssetId": row["id"],
        "selectedNativeClips": CLIPS, "firstBuild": pin(outputs[0]), "secondBuild": pin(outputs[1]),
        "finalGlbByteIdenticalRebuild": True, "validation": first_validation,
        "pipelineStages": {
            "acquisition": "acquired", "extraction": "extracted-and-locally-present",
            "conversion": "standardized-six-state-candidate-validated",
            "ggdFinalAcceptance": "pending-visual-review-and-character-definition",
            "runtimeRegistration": "not-registered-no-ggd-hero-id",
            "runtimeSelectability": "not-selectable", "productionDeployment": "not-verified",
        },
        "fullHeroModel": False, "runtimeSelectable": False, "productionDeploymentVerified": False,
        "gaps": [
            "No GGD hero definition or skill setting is present for this exact identity.",
            "This machine validation does not replace an owner visual review of model and action playback.",
            "No backend dropdown registration, default selection or production deployment was performed.",
        ],
    }


def receipt_from(root: Path) -> dict[str, object]:
    candidates = []
    for target in TARGETS:
        character_id, slug, name_zh, original_name, work_zh = target
        candidate_root = root / slug
        first = candidate_root / "first/final/body.glb"
        second = candidate_root / "second/final/body.glb"
        validation = candidate_root / "first/validation.json"
        source_query = json.loads((candidate_root / "source-query.json").read_text())["results"][0]
        checks = json.loads(validation.read_text())
        if first.read_bytes() != second.read_bytes():
            raise ValueError(f"Non-deterministic existing candidate: {character_id}")
        if checks["khronosIssues"]["numErrors"] != 0 or checks["ggdInspection"]["budget"]["errors"]:
            raise ValueError(f"Existing candidate no longer validates: {character_id}")
        candidates.append({
            "id": f"mba-unused-{slug}-native-six-state-v1", "sourceCharacterId": character_id,
            "nameZh": name_zh, "originalName": original_name, "workZh": work_zh,
            "source": pin(Path(source_query["path"])), "sourceAssetId": source_query["id"],
            "selectedNativeClips": CLIPS, "firstBuild": pin(first), "secondBuild": pin(second),
            "finalGlbByteIdenticalRebuild": True, "validation": checks,
            "pipelineStages": {
                "acquisition": "acquired", "extraction": "extracted-and-locally-present",
                "conversion": "standardized-six-state-candidate-validated",
                "ggdFinalAcceptance": "pending-visual-review-and-character-definition",
                "runtimeRegistration": "not-registered-no-ggd-hero-id",
                "runtimeSelectability": "not-selectable", "productionDeployment": "not-verified",
            },
            "fullHeroModel": False, "runtimeSelectable": False, "productionDeploymentVerified": False,
            "gaps": ["No GGD hero definition or skill setting is present for this exact identity.", "This machine validation does not replace an owner visual review of model and action playback.", "No backend dropdown registration, default selection or production deployment was performed."],
        })
    return {
        "schema": "ggd.mba-unused-native-batch@1", "batchId": "mba-unused-native-batch-v2",
        "sourceId": "magical-battle-arena-complete-form-1.60-plus", "sourceVersion": "Complete Form 1.60+",
        "selectionClass": "mba", "platform": "Windows PC", "candidates": candidates,
        "summary": {"candidates": len(candidates), "nativeMotionCandidates": len(candidates) * 6,
                    "runtimeSelectable": 0, "productionDeploymentVerified": 0},
        "boundaries": {"newDownloads": False, "paymentPerformed": False, "runtimeRegistrationPerformed": False,
                       "productionDeploymentPerformed": False, "ownerVisualAcceptancePerformed": False},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not (TOOL_REPO / "node_modules/tsx").exists():
        raise SystemExit(f"GGD_LIBRARY_TOOL_REPO must be a provisioned GGD checkout: {TOOL_REPO}")
    if args.write:
        if not LOCAL_ROOT.exists():
            LOCAL_ROOT.mkdir(parents=True)
            for target in TARGETS:
                build_one(target, LOCAL_ROOT / target[1])
        # A tool host can be interrupted after all immutable candidate files
        # were flushed but before this small receipt was written.  Resume only
        # that receipt finalization after re-verifying every existing file; do
        # not overwrite a stage or attempt a partial rebuild in place.
        receipt = receipt_from(LOCAL_ROOT)
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        if EVIDENCE.exists():
            if json.loads(EVIDENCE.read_text()) != receipt:
                raise SystemExit(f"Refusing to overwrite changed committed receipt: {EVIDENCE}")
        else:
            EVIDENCE.write_bytes(encoded(receipt))
    else:
        if not EVIDENCE.is_file():
            raise SystemExit("Missing committed MBA batch receipt")
        expected = json.loads(EVIDENCE.read_text())
        actual = receipt_from(LOCAL_ROOT)
        if expected != actual:
            raise SystemExit("MBA candidate receipt drift; rerun only with a new immutable batch id")
    print(json.dumps({"receipt": str(EVIDENCE), "candidates": 3, "runtimeSelectable": 0, "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
