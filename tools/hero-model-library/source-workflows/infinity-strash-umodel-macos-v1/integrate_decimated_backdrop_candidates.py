#!/usr/bin/env python3
"""Plan or apply the three validated Infinity Strash decimated model options.

The default mode is read-only. ``--apply`` writes deterministic source/model/catalog
artifacts and then uses the repository's ModelVersions command for registration.
It never runs the central inventory/index generators.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess


HERE = Path(__file__).resolve().parent
DEFAULT_REPO = HERE.parents[3]
EVIDENCE_REL = Path("materials/hero-model-library/priority-evidence/infinity-strash-texture-backdrop-decimation-v1")
SOURCE_ID = "steam-infinity-strash-priority-original-assets-build-local-20240328"

RECORDS = (
    {
        "candidateId": "dai-pn010-02",
        "heroId": "godie-nbbc",
        "oldRuntimeId": "runtime:infinity-strash-dai-pn010-02-native-v1",
        "oldModelKey": "community.body.0185ba2f70b4891fe3bba4f56a96caad566d09a83003ff6b",
        "oldSha256": "2aa1be9bad767cbc496c6dc147b708714c5e7e0781f9d9d0df02058d4cdb6d66",
        "repairedSha256": "4d040f955d9b6f190b0a622034941d8685491670d4cfab81ea43d1fbf758e63f",
        "sha256": "bdf77de4789523c132c4e620f49ead67d70fd8374a9ed5613196695960fa02c6",
        "labelSuffix": "（背景修復＋7,917 面正式採用減面）",
    },
    {
        "candidateId": "dai-pn010-05-daino-tsurugi",
        "heroId": "godie-nbbc",
        "oldRuntimeId": "runtime:infinity-strash-dai-pn010-05-daino-tsurugi-native-v1",
        "oldModelKey": "community.body.260c96887bfdee4dd0a73eca5e49eb25a59bde430e661785",
        "oldSha256": "1e1379ec54152a09339c2c5f92e79ee4320fb848ba3ea8da52d723efb1d2c55d",
        "repairedSha256": "93ccf92a021851f98acb28213cdc78f5349482f90f0c90cad75de01962465e7a",
        "sha256": "5eb4e1322b17cd53b2a791af6c6728af26101c88e3b94f81e3104ccab9b31540",
        "labelSuffix": "（背景修復＋7,918 面正式採用減面）",
    },
    {
        "candidateId": "vearn-en801-pre-transformation",
        "heroId": "godie-ubal",
        "oldRuntimeId": "runtime:infinity-strash-vearn-en801-pre-transformation-native-v1",
        "oldModelKey": "community.body.124e07f8cbdfed13d28f4701a6f138e14ffe6df9391a3990",
        "oldSha256": "c0f4ea5c363f2847d2eb9324cfb72a80c8f007a134fa4ac728d95d350ca69d02",
        "repairedSha256": "aa8e1f03f69f6586befb1527178f2c7029c0f0a2c92b96b5ebdad8a1b2f32882",
        "sha256": "97d9fb78fec6abbf162a75223132e92485e51958306a2563fe4f7189dab8dd00",
        "labelSuffix": "（背景修復＋7,998 面正式採用減面）",
    },
)


def encoded(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def unique_append(rows: list, value: dict, key: str) -> None:
    matches = [row for row in rows if row.get(key) == value[key]]
    if matches and matches != [value]:
        raise ValueError(f"conflicting existing {key}: {value[key]}")
    if not matches:
        rows.append(value)


def build(repo: Path) -> tuple[dict[Path, str], dict]:
    repo = repo.resolve()
    evidence = repo / EVIDENCE_REL
    generation = read(evidence / "generation.json")
    validation = read(evidence / "validation.json")
    backup = read(evidence / "s3-backup-receipt.json")
    manifest = read(evidence / "s3-backup-manifest.json")
    if validation.get("summary") != {
        "candidates": 3,
        "allFormalAdoptionEligible": True,
        "khronosErrors": 0,
        "ggdUploadErrors": 0,
        "allRigChecksPassed": True,
        "allVisualReviewsAccepted": True,
    }:
        raise ValueError("three-candidate validation is not fully accepted")
    if not (backup.get("fullGetVerified") and backup.get("allMemberSha256Verified") and backup.get("localUnchanged")):
        raise ValueError("conversion-stage S3 readback contract is incomplete")
    if backup.get("archiveSha256") != manifest.get("archiveSha256") or backup.get("fileCount") != len(manifest.get("files", [])):
        raise ValueError("S3 receipt and manifest differ")
    if backup.get("s3Uri") != manifest.get("s3Uri"):
        raise ValueError("S3 archive destination differs")

    generation_by_id = {row["candidateId"]: row for row in generation["records"]}
    validation_by_id = {row["candidateId"]: row for row in validation["records"]}
    archived = {row["path"]: row for row in manifest["files"]}
    catalog_path = repo / "materials/hero-model-library/priority-runtime-options.json"
    sources_path = repo / "materials/hero-model-library/download-sources.json"
    catalog, sources = read(catalog_path), read(sources_path)
    old_models = {row["id"]: row for row in catalog["models"]}
    hero_rows = {row["id"]: row for row in catalog["heroes"]}
    source = next(row for row in sources["publicSources"] if row.get("id") == SOURCE_ID)
    outputs: dict[Path, str] = {}
    planned = []

    delivery = {
        "id": "infinity-strash-texture-backdrop-decimation-v1",
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
        "manifestGitPath": (EVIDENCE_REL / "s3-backup-manifest.json").as_posix(),
        "s3Use": "backup-only-not-runtime-entry",
    }
    unique_append(source.setdefault("supplementalDeliveries", []), delivery, "id")

    for config in RECORDS:
        candidate_id = config["candidateId"]
        generated = generation_by_id[candidate_id]
        accepted = validation_by_id[candidate_id]
        digest = config["sha256"]
        if generated["outputSha256"] != digest or accepted.get("formalHeroAdoptionEligible") is not True:
            raise ValueError(f"accepted output changed: {candidate_id}")
        for prefix in ("content/assets/models/community", "content/assets/models/community/versions"):
            glb = repo / prefix / f"{digest}.glb"
            if not glb.is_file() or sha256(glb) != digest:
                raise ValueError(f"missing or changed content-addressed GLB: {glb}")
        member_path = f"{candidate_id}/final/{digest}.glb"
        if archived.get(member_path, {}).get("sha256") != digest:
            raise ValueError(f"S3 archive omits accepted candidate: {member_path}")

        old_model = old_models[config["oldRuntimeId"]]
        predecessor_shas = {config["oldSha256"], config["repairedSha256"]}
        if old_model["modelKey"] != config["oldModelKey"] or old_model["sha256"] not in predecessor_shas:
            raise ValueError(f"predecessor catalog identity changed: {candidate_id}")
        old_doc_path = repo / "content/models" / f"{config['oldModelKey']}.json"
        old_doc = read(old_doc_path)
        if Path(old_doc["glbPath"]).stem not in predecessor_shas:
            raise ValueError(f"predecessor model document changed: {candidate_id}")

        model_key = "community.body." + digest[:48]
        runtime_id = "runtime:infinity-strash-" + candidate_id + "-backdrop-decimated-v1"
        model_doc_path = repo / "content/models" / f"{model_key}.json"
        existing_model = next((row for row in catalog["models"] if row.get("id") == runtime_id), None)
        if existing_model is not None:
            if existing_model.get("modelKey") != model_key or existing_model.get("sha256") != digest:
                raise ValueError(f"existing decimated catalog identity changed: {candidate_id}")
            if not model_doc_path.is_file():
                raise ValueError(f"existing decimated model document missing: {candidate_id}")
            model_doc = read(model_doc_path)
            if model_doc.get("id") != model_key or Path(model_doc.get("glbPath", "")).stem != digest:
                raise ValueError(f"existing decimated model document changed: {candidate_id}")
            outputs[model_doc_path] = model_doc_path.read_text()
        else:
            model_doc = copy.deepcopy(old_doc)
            model_doc.update(id=model_key, glbPath=f"assets/models/community/{digest}.glb")
            document = encoded(model_doc)
            outputs[model_doc_path] = document

            model = copy.deepcopy(old_model)
            model.update(
                id=runtime_id,
                modelKey=model_key,
                glbPath=model_doc["glbPath"],
                sha256=digest,
                bytes=(repo / "content" / model_doc["glbPath"]).stat().st_size,
                documentSha256=sha_bytes(document.encode()),
                gitPath="content/" + model_doc["glbPath"],
                localRuntimeRoot=str(Path(backup["source"]) / candidate_id / "final"),
                validation="formal-adoption-budget-khronos-rig-preservation-and-six-state-ab-visual-review-passed",
                fullCharacterPackage=False,
                s3={
                    "s3Uri": backup["s3Uri"],
                    "manifestUri": backup["manifestUri"],
                    "sha256": backup["archiveSha256"],
                    "bytes": backup["archiveBytes"],
                    "fileCount": backup["fileCount"],
                    "readbackVerified": True,
                    "allMemberSha256Verified": True,
                    "archiveMember": member_path,
                    "receiptGitPath": (EVIDENCE_REL / "s3-backup-receipt.json").as_posix(),
                },
            )
            model["limitations"] = list(old_model.get("limitations", [])) + [
                "背景透明像素 RGB 已由可重建修復階段處理；低多邊形候選已通過 <=8,000 面正式採用門檻與六狀態 A/B 視覺驗收。",
                "舊候選仍保留在同一角色的版本清單與 S3 封存；本選項登記不代表 Main 合併或正式站部署。",
            ]
            unique_append(catalog["models"], model, "id")
        hero = hero_rows[config["heroId"]]
        existing_option = next((row for row in hero["options"] if row.get("sourceId") == runtime_id), None)
        if existing_option is not None:
            if existing_option.get("sourceModelKey") != model_key:
                raise ValueError(f"existing decimated option identity changed: {candidate_id}")
        else:
            old_option = next(row for row in hero["options"] if row["sourceId"] == config["oldRuntimeId"])
            option = copy.deepcopy(old_option)
            option.update(sourceId=runtime_id, sourceModelKey=model_key, label=old_option["label"] + config["labelSuffix"])
            unique_append(hero["options"], option, "sourceId")

        planned.append({
            "candidateId": candidate_id,
            "heroId": config["heroId"],
            "predecessor": {
                "runtimeId": config["oldRuntimeId"],
                "modelKey": config["oldModelKey"],
                "originalSha256": config["oldSha256"],
                "currentSha256": old_model["sha256"],
                "retained": True,
            },
            "candidate": {"runtimeId": runtime_id, "modelKey": model_key, "sha256": digest, "modelIdLength": len(model_key), "archiveMember": member_path},
            "registerCommand": ["node", "--import", "tsx", "tools/hero-model-library/register-one-source-option.mts", config["heroId"], runtime_id],
        })

    releases = source.setdefault("backendIntegration", {}).setdefault("release", {}).setdefault("runtimeSourceIds", [])
    for row in planned:
        if row["candidate"]["runtimeId"] not in releases:
            releases.append(row["candidate"]["runtimeId"])
    source["backendIntegration"]["release"]["productionDeployed"] = False
    outputs[catalog_path] = encoded(catalog)
    outputs[sources_path] = encoded(sources)
    applied = all(path.is_file() and path.read_text() == value for path, value in outputs.items())
    runtime_selectable = applied and all(
        any(
            version.get("sourceModelKey") == row["candidate"]["modelKey"]
            for version in read(repo / "content/champions" / f"{row['heroId']}.json").get("modelVersions", [])
        )
        for row in planned
    )
    current_resources_path = repo / "materials/asset-library/current-resources.json"
    central_indexes_current = runtime_selectable and current_resources_path.is_file() and all(
        row["candidate"]["runtimeId"] in current_resources_path.read_text()
        for row in planned
    )
    plan = {
        "schema": "ggd.infinity-strash-decimated-option-integration-plan@1",
        "mode": "applied-in-functional-branch" if applied else "planned-not-applied",
        "scope": "Register three accepted content-addressed GLBs as additional runtime options while retaining every predecessor option and model version.",
        "generatedFrom": {
            "integrationScriptSha256": sha256(Path(__file__)),
            "generationSha256": sha256(evidence / "generation.json"),
            "validationSha256": sha256(evidence / "validation.json"),
            "s3ReceiptSha256": sha256(evidence / "s3-backup-receipt.json"),
            "s3ManifestSha256": sha256(evidence / "s3-backup-manifest.json"),
            "s3IdentityVerificationSha256": sha256(evidence / "s3-identity-verification.json"),
        },
        "s3": {key: backup[key] for key in ("s3Uri", "manifestUri", "archiveSha256", "archiveBytes", "fileCount", "fullGetVerified", "allMemberSha256Verified", "localUnchanged")},
        "records": planned,
        "outputs": [{"path": path.relative_to(repo).as_posix(), "bytes": len(value.encode()), "sha256": sha_bytes(value.encode())} for path, value in sorted(outputs.items())],
        "boundaries": {
            "predecessorsRetained": True,
            "centralIndexGeneratorsRun": central_indexes_current,
            "applied": applied,
            "runtimeSelectable": runtime_selectable,
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
        parser.error("--plan-output is a read-only receipt; do not combine it with --apply")
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
    for row in plan["records"]:
        subprocess.run(row["registerCommand"], cwd=repo, check=True)
    print(json.dumps({"applied": len(plan["records"]), "centralIndexGeneratorsRun": False, "productionDeploymentVerified": False}))


if __name__ == "__main__":
    main()
