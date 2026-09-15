#!/usr/bin/env python3
"""Redirect three retained Infinity Strash high-poly options to safe repaired GLBs.

The original unsafe content-addressed GLBs stay on disk for provenance.  This
script changes only the already-existing source and frozen model documents,
their catalog checksums/labels, and the matching champion version receipts.
The accepted <=8,000-triangle versions remain active.

The default mode is a read-only deterministic plan.  Use ``--apply`` to write
the planned files.  Central indexes are deliberately left to their generators.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
DEFAULT_REPO = HERE.parents[3]
EVIDENCE_REL = Path(
    "materials/hero-model-library/priority-evidence/"
    "infinity-strash-texture-backdrop-repair-v1"
)
SOURCE_ID = "steam-infinity-strash-priority-original-assets-build-local-20240328"
LABEL_SUFFIX = "（背景修復高面數保留版）"

RECORDS = (
    {
        "candidateId": "dai-pn010-02",
        "heroId": "godie-nbbc",
        "runtimeId": "runtime:infinity-strash-dai-pn010-02-native-v1",
        "sourceModelKey": "community.body.0185ba2f70b4891fe3bba4f56a96caad566d09a83003ff6b",
        "frozenModelKey": "version.body.d3f99e8920304bdd4c07e6096ed2d22565df3c728025c020",
        "originalSha256": "2aa1be9bad767cbc496c6dc147b708714c5e7e0781f9d9d0df02058d4cdb6d66",
        "repairedSha256": "4d040f955d9b6f190b0a622034941d8685491670d4cfab81ea43d1fbf758e63f",
        "triangles": 16035,
        "localOriginalRelativePath": "GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-v1/dai-pn010-02/body.glb",
        "expectedActiveModelKey": "version.body.5c60de5fb32a3dd6cf1cb605db7a61938343c1beb1bf65bc",
    },
    {
        "candidateId": "dai-pn010-05-daino-tsurugi",
        "heroId": "godie-nbbc",
        "runtimeId": "runtime:infinity-strash-dai-pn010-05-daino-tsurugi-native-v1",
        "sourceModelKey": "community.body.260c96887bfdee4dd0a73eca5e49eb25a59bde430e661785",
        "frozenModelKey": "version.body.ee41ff0f3493c18f09be26f95480f958cc964c17c7a2a1eb",
        "originalSha256": "1e1379ec54152a09339c2c5f92e79ee4320fb848ba3ea8da52d723efb1d2c55d",
        "repairedSha256": "93ccf92a021851f98acb28213cdc78f5349482f90f0c90cad75de01962465e7a",
        "triangles": 16882,
        "localOriginalRelativePath": "GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-dai-pn010-05-daino-v2/dai-pn010-05-daino-tsurugi/body.glb",
        "expectedActiveModelKey": "version.body.5c60de5fb32a3dd6cf1cb605db7a61938343c1beb1bf65bc",
    },
    {
        "candidateId": "vearn-en801-pre-transformation",
        "heroId": "godie-ubal",
        "runtimeId": "runtime:infinity-strash-vearn-en801-pre-transformation-native-v1",
        "sourceModelKey": "community.body.124e07f8cbdfed13d28f4701a6f138e14ffe6df9391a3990",
        "frozenModelKey": "version.body.37369175767e587335582605d4ed6d271221101d0311c82c",
        "originalSha256": "c0f4ea5c363f2847d2eb9324cfb72a80c8f007a134fa4ac728d95d350ca69d02",
        "repairedSha256": "aa8e1f03f69f6586befb1527178f2c7029c0f0a2c92b96b5ebdad8a1b2f32882",
        "triangles": 16760,
        "localOriginalRelativePath": "GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-v1/vearn-en801-pre-transformation/body.glb",
        "expectedActiveModelKey": "version.body.2720d256116ac94d911e910d126ae25bb5cae67fcefd4442",
    },
)


def encoded(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def model_sha256(document: dict) -> str:
    """Match contentSha256(doc).slice(7) for model@1 JSON values."""
    canonical = json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha_bytes(canonical.encode())


def append_once(rows: list, value: dict, key: str) -> None:
    matches = [row for row in rows if row.get(key) == value[key]]
    if matches and matches != [value]:
        raise ValueError(f"conflicting existing {key}: {value[key]}")
    if not matches:
        rows.append(value)


def append_text_once(rows: list[str], value: str) -> None:
    if value not in rows:
        rows.append(value)


def suffixed(label: str) -> str:
    return label if label.endswith(LABEL_SUFFIX) else label + LABEL_SUFFIX


def build(repo: Path) -> tuple[dict[Path, str], dict]:
    repo = repo.resolve()
    evidence = repo / EVIDENCE_REL
    receipt_path = evidence / "receipt.json"
    validation_path = evidence / "validation.json"
    backup_path = evidence / "s3-backup-receipt.json"
    receipt, validation, backup = read(receipt_path), read(validation_path), read(backup_path)
    receipt_by_id = {row["candidateId"]: row for row in receipt["records"]}
    validation_by_id = {row["candidateId"]: row for row in validation["records"]}

    if validation.get("summary") != {
        "models": 3,
        "khronosErrors": 0,
        "ggdUploadErrors": 0,
        "runtimeHardLimitsPassed": True,
        "formalAdoptionStatus": "needs-decimation",
    }:
        raise ValueError("repair validation summary is not the accepted three-model result")
    if not (
        backup.get("fullGetVerified")
        and backup.get("allMemberSha256Verified")
        and backup.get("localUnchanged")
    ):
        raise ValueError("repair-stage S3 readback is incomplete")

    catalog_path = repo / "materials/hero-model-library/priority-runtime-options.json"
    sources_path = repo / "materials/hero-model-library/download-sources.json"
    catalog, sources = read(catalog_path), read(sources_path)
    catalog_models = {row["id"]: row for row in catalog["models"]}
    catalog_heroes = {row["id"]: row for row in catalog["heroes"]}
    source = next(row for row in sources["publicSources"] if row.get("id") == SOURCE_ID)
    outputs: dict[Path, str] = {}
    planned = []

    delivery = {
        "id": "infinity-strash-texture-backdrop-repair-v1",
        "sourceId": SOURCE_ID,
        "resourceRole": "model-conversion-backup",
        "localPath": backup["source"],
        "localArchive": backup["localArchive"],
        "readbackPath": backup["readback"],
        "s3Uri": backup["s3Uri"],
        "manifestUri": backup["manifestUri"],
        "bytes": backup["archiveBytes"],
        "sha256": backup["archiveSha256"],
        "fileCount": backup["fileCount"],
        "archiveFormat": "tar-gzip",
        "readbackVerified": True,
        "fullReadbackVerified": True,
        "allMemberSha256Verified": True,
        "localPreserved": True,
        "receiptGitPath": (EVIDENCE_REL / "s3-backup-receipt.json").as_posix(),
        "s3Use": "backup-only-not-runtime-entry",
    }
    append_once(source.setdefault("supplementalDeliveries", []), delivery, "id")

    champions: dict[str, dict] = {}
    champion_paths: dict[str, Path] = {}
    initial_active: dict[str, str] = {}
    for config in RECORDS:
        hero_id = config["heroId"]
        if hero_id not in champions:
            champion_path = repo / "content/champions" / f"{hero_id}.json"
            champion_paths[hero_id] = champion_path
            champions[hero_id] = read(champion_path)
            initial_active[hero_id] = champions[hero_id]["modelKey"]

    for config in RECORDS:
        candidate_id = config["candidateId"]
        original_sha = config["originalSha256"]
        repaired_sha = config["repairedSha256"]
        receipt_row = receipt_by_id[candidate_id]
        validation_row = validation_by_id[candidate_id]
        if receipt_row["source"]["sha256"] != original_sha:
            raise ValueError(f"original repair input changed: {candidate_id}")
        if receipt_row["output"]["sha256"] != repaired_sha:
            raise ValueError(f"repaired output changed: {candidate_id}")
        if receipt_row.get("nonImagePayloadIdentical") is not True:
            raise ValueError(f"non-image payload changed: {candidate_id}")
        if receipt_row.get("visualEvidence", {}).get("allExactRgbMatches") is not True:
            raise ValueError(f"three-view RGB proof is not exact: {candidate_id}")
        if validation_row.get("sha256") != repaired_sha:
            raise ValueError(f"validation output changed: {candidate_id}")
        if validation_row.get("runtimeHardLimitsPassed") is not True:
            raise ValueError(f"repaired model exceeds runtime hard limits: {candidate_id}")

        original_paths = (
            repo / "content/assets/models/community" / f"{original_sha}.glb",
            repo / "content/assets/models/community/versions" / f"{original_sha}.glb",
        )
        repaired_paths = (
            repo / "content/assets/models/community" / f"{repaired_sha}.glb",
            repo / "content/assets/models/community/versions" / f"{repaired_sha}.glb",
        )
        for path in original_paths:
            if path.exists():
                raise ValueError(f"unsafe original must not remain in the shipped content tree: {path}")
        local_original = repo.parent / config["localOriginalRelativePath"]
        if local_original.exists() and sha256(local_original) != original_sha:
            raise ValueError(f"local preserved original changed: {local_original}")
        for path in repaired_paths:
            if not path.is_file() or sha256(path) != repaired_sha:
                raise ValueError(f"repaired content-addressed GLB is missing or changed: {path}")

        source_doc_path = repo / "content/models" / f"{config['sourceModelKey']}.json"
        frozen_doc_path = repo / "content/models" / f"{config['frozenModelKey']}.json"
        source_doc, frozen_doc = read(source_doc_path), read(frozen_doc_path)
        if source_doc.get("id") != config["sourceModelKey"]:
            raise ValueError(f"source model ID changed: {candidate_id}")
        if frozen_doc.get("id") != config["frozenModelKey"]:
            raise ValueError(f"frozen model ID changed: {candidate_id}")
        if frozen_doc.get("bodyVersion", {}).get("sourceModelKey") != config["sourceModelKey"]:
            raise ValueError(f"frozen provenance changed: {candidate_id}")
        if Path(source_doc["glbPath"]).stem not in {original_sha, repaired_sha}:
            raise ValueError(f"source model points to an unexpected binary: {candidate_id}")
        if Path(frozen_doc["glbPath"]).stem not in {original_sha, repaired_sha}:
            raise ValueError(f"frozen model points to an unexpected binary: {candidate_id}")

        source_doc["glbPath"] = f"assets/models/community/{repaired_sha}.glb"
        frozen_doc["glbPath"] = f"assets/models/community/versions/{repaired_sha}.glb"
        source_document = encoded(source_doc)
        frozen_document = encoded(frozen_doc)
        outputs[source_doc_path] = source_document
        outputs[frozen_doc_path] = frozen_document

        catalog_model = catalog_models[config["runtimeId"]]
        if catalog_model.get("modelKey") != config["sourceModelKey"]:
            raise ValueError(f"catalog source model key changed: {candidate_id}")
        if catalog_model.get("sha256") not in {original_sha, repaired_sha}:
            raise ValueError(f"catalog binary identity changed: {candidate_id}")
        catalog_model.update(
            glbPath=source_doc["glbPath"],
            sha256=repaired_sha,
            bytes=repaired_paths[0].stat().st_size,
            documentSha256=sha_bytes(source_document.encode()),
            gitPath="content/" + source_doc["glbPath"],
            localRuntimeRoot=str(Path(receipt_row["output"]["localPath"]).parent),
            validation="background-repair-khronos-ggd-hard-limits-and-three-view-exact-rgb-passed-high-poly-retained",
        )
        limitations = catalog_model.setdefault("limitations", [])
        append_text_once(
            limitations,
            "此高面數保留選項的透明背景像素已修復；前、後、等角三視圖與原始顯示逐像素 RGB 完全一致。",
        )
        append_text_once(
            limitations,
            f"此版本為 {config['triangles']:,} 面的歷史保留選項；正式自動預選仍使用另存的 <=8,000 面驗收版。",
        )
        catalog_model["backdropRepair"] = {
            "originalSha256": original_sha,
            "repairedSha256": repaired_sha,
            "originalBytesRemovedFromCurrentContentTree": True,
            "originalBytesPreservedInGitHistory": True,
            "originalLocalPath": str(local_original),
            "visualExactRgbMatch": True,
            "formalAdoptionStatus": "high-poly-retained-option-decimated-version-preferred",
            "receiptGitPath": (EVIDENCE_REL / "receipt.json").as_posix(),
            "validationGitPath": (EVIDENCE_REL / "validation.json").as_posix(),
            "s3Uri": backup["s3Uri"],
            "manifestUri": backup["manifestUri"],
            "archiveSha256": backup["archiveSha256"],
            "fullReadbackVerified": True,
        }

        hero = catalog_heroes[config["heroId"]]
        option = next(row for row in hero["options"] if row.get("sourceId") == config["runtimeId"])
        if option.get("sourceModelKey") != config["sourceModelKey"]:
            raise ValueError(f"catalog option provenance changed: {candidate_id}")
        option["label"] = suffixed(option["label"])

        champion = champions[config["heroId"]]
        if champion["modelKey"] != config["expectedActiveModelKey"]:
            raise ValueError(f"accepted active pointer changed before repair integration: {config['heroId']}")
        version = next(
            row for row in champion["modelVersions"]
            if row.get("modelKey") == config["frozenModelKey"]
        )
        if version.get("sourceModelKey") != config["sourceModelKey"]:
            raise ValueError(f"champion version source changed: {candidate_id}")
        if version.get("binarySha256") not in {original_sha, repaired_sha}:
            raise ValueError(f"champion version binary changed: {candidate_id}")
        version["label"] = suffixed(version["label"])
        version["binarySha256"] = repaired_sha
        version["modelSha256"] = model_sha256(frozen_doc)

        planned.append({
            "candidateId": candidate_id,
            "heroId": config["heroId"],
            "runtimeId": config["runtimeId"],
            "sourceModelKey": config["sourceModelKey"],
            "frozenModelKey": config["frozenModelKey"],
            "original": {
                "sha256": original_sha,
                "baseGitPath": f"content/assets/models/community/{original_sha}.glb",
                "frozenGitPath": f"content/assets/models/community/versions/{original_sha}.glb",
                "presentInCurrentContentTree": False,
                "preservedInGitHistory": True,
                "localPath": str(local_original),
                "s3Uri": backup["s3Uri"],
            },
            "repaired": {
                "sha256": repaired_sha,
                "bytes": repaired_paths[0].stat().st_size,
                "baseGitPath": f"content/assets/models/community/{repaired_sha}.glb",
                "frozenGitPath": f"content/assets/models/community/versions/{repaired_sha}.glb",
                "visualExactRgbMatch": True,
            },
            "activeModelKey": champion["modelKey"],
        })

    for hero_id, champion in champions.items():
        if champion["modelKey"] != initial_active[hero_id]:
            raise ValueError(f"active pointer changed during repair integration: {hero_id}")
        outputs[champion_paths[hero_id]] = encoded(champion)

    outputs[catalog_path] = encoded(catalog)
    outputs[sources_path] = encoded(sources)
    plan = {
        "schema": "ggd.infinity-strash-repaired-predecessor-option-integration-plan@1",
        "mode": "planned-not-applied",
        "scope": "Redirect three retained high-poly source/frozen options to visually identical backdrop-safe GLBs while preserving original binaries and accepted active decimated versions.",
        "generatedFrom": {
            "integrationScriptSha256": sha256(Path(__file__)),
            "repairReceiptSha256": sha256(receipt_path),
            "repairValidationSha256": sha256(validation_path),
            "s3ReceiptSha256": sha256(backup_path),
        },
        "s3": {
            key: backup[key]
            for key in (
                "s3Uri", "manifestUri", "archiveSha256", "archiveBytes", "fileCount",
                "fullGetVerified", "allMemberSha256Verified", "localUnchanged",
            )
        },
        "records": planned,
        "outputs": [
            {
                "path": path.relative_to(repo).as_posix(),
                "bytes": len(value.encode()),
                "sha256": sha_bytes(value.encode()),
            }
            for path, value in sorted(outputs.items())
        ],
        "boundaries": {
            "originalUnsafeBinariesPreserved": True,
            "activePointersUnchanged": True,
            "highPolyOptionsRemainSelectable": True,
            "decimatedOptionsRemainPreferred": True,
            "centralIndexGeneratorsRun": False,
            "applied": False,
            "productionDeploymentVerified": False,
        },
    }
    return outputs, plan


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO)
    parser.add_argument("--plan-output", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.apply and args.plan_output:
        parser.error("--plan-output is read-only; do not combine it with --apply")
    outputs, plan = build(args.repo)
    repo = args.repo.resolve()
    if args.plan_output:
        target = args.plan_output if args.plan_output.is_absolute() else repo / args.plan_output
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(encoded(plan))
    if not args.apply:
        print(encoded(plan), end="")
        return
    for path, value in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)
    print(json.dumps({
        "applied": len(plan["records"]),
        "originalUnsafeBinariesPreserved": True,
        "activePointersUnchanged": True,
        "centralIndexGeneratorsRun": False,
        "productionDeploymentVerified": False,
    }))


if __name__ == "__main__":
    main()
