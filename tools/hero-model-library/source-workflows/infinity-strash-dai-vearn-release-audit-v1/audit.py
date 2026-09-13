#!/usr/bin/env python3
"""Build a current, byte-backed Infinity Strash Dai/Vearn release audit."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
DEFAULT_REPO = HERE.parents[3]
DEFAULT_OUTPUT = (
    DEFAULT_REPO
    / "materials/hero-model-library/priority-evidence"
    / "infinity-strash-dai-vearn-release-audit-v1/report.json"
)

TARGETS = (
    {
        "candidateId": "dai-pn010-02",
        "heroId": "godie-nbbc",
        "runtimeId": "runtime:infinity-strash-dai-pn010-02-backdrop-decimated-v1",
        "retainedRuntimeId": "runtime:infinity-strash-dai-pn010-02-native-v1",
        "identity": "Dai PN010/02",
    },
    {
        "candidateId": "dai-pn010-05-daino-tsurugi",
        "heroId": "godie-nbbc",
        "runtimeId": "runtime:infinity-strash-dai-pn010-05-daino-tsurugi-backdrop-decimated-v1",
        "retainedRuntimeId": "runtime:infinity-strash-dai-pn010-05-daino-tsurugi-native-v1",
        "identity": "Dai PN010/05 with Dai no Tsurugi",
    },
    {
        "candidateId": "vearn-en801-pre-transformation",
        "heroId": "godie-ubal",
        "runtimeId": "runtime:infinity-strash-vearn-en801-pre-transformation-backdrop-decimated-v1",
        "retainedRuntimeId": "runtime:infinity-strash-vearn-en801-pre-transformation-native-v1",
        "identity": "Vearn EN801 pre-transformation / old Vearn",
    },
)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def source(path: Path, repo: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(repo).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": digest(path),
    }


def glb_json(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError(f"not a GLB: {path}")
    version, total = struct.unpack_from("<II", data, 4)
    if version != 2 or total != len(data):
        raise ValueError(f"invalid GLB header: {path}")
    chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError(f"first GLB chunk is not JSON: {path}")
    return json.loads(data[20 : 20 + chunk_len].decode("utf-8").rstrip(" \t\r\n\0"))


def glb_metrics(path: Path) -> dict[str, Any]:
    doc = glb_json(path)
    accessors = doc.get("accessors", [])
    primitives = [primitive for mesh in doc.get("meshes", []) for primitive in mesh.get("primitives", [])]
    triangles = 0
    for primitive in primitives:
        mode = primitive.get("mode", 4)
        if mode != 4:
            continue
        accessor_index = primitive.get("indices")
        if accessor_index is not None:
            triangles += accessors[accessor_index]["count"] // 3
        else:
            position_index = primitive.get("attributes", {}).get("POSITION")
            if position_index is not None:
                triangles += accessors[position_index]["count"] // 3
    skins = doc.get("skins", [])
    animations = doc.get("animations", [])
    return {
        "triangles": triangles,
        "drawPrimitives": len(primitives),
        "materials": len(doc.get("materials", [])),
        "embeddedImages": len(doc.get("images", [])),
        "skins": len(skins),
        "joints": max((len(skin.get("joints", [])) for skin in skins), default=0),
        "animationCount": len(animations),
        "animationNames": [animation.get("name", "") for animation in animations],
        "maxAnimationChannels": max((len(animation.get("channels", [])) for animation in animations), default=0),
    }


def record_target(
    repo: Path,
    target: dict[str, str],
    resources: dict[str, dict[str, Any]],
    budget_models: dict[str, dict[str, Any]],
    validation: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    resource = resources[target["runtimeId"]]
    retained = resources[target["retainedRuntimeId"]]
    hero_path = repo / f"content/champions/{target['heroId']}.json"
    hero = read_json(hero_path)
    versions = {row["sourceModelKey"]: row for row in hero.get("modelVersions", [])}
    if resource["modelKey"] not in versions or retained["modelKey"] not in versions:
        raise ValueError(f"{target['heroId']} is missing a required model version")
    version = versions[resource["modelKey"]]
    retained_version = versions[retained["modelKey"]]

    asset_path = repo / "content" / resource["glbPath"]
    model_doc_path = repo / resource["modelDocumentGitPath"]
    model_doc = read_json(model_doc_path)
    version_model_doc_path = repo / f"content/models/{version['modelKey']}.json"
    version_model_doc = read_json(version_model_doc_path)
    version_asset_path = repo / "content" / version_model_doc["glbPath"]

    for checked_path, expected_hash, expected_bytes in (
        (asset_path, resource["sha256"], resource["bytes"]),
        (version_asset_path, version["binarySha256"], resource["bytes"]),
    ):
        if not checked_path.is_file():
            raise ValueError(f"missing Git GLB: {checked_path}")
        if checked_path.stat().st_size != expected_bytes or digest(checked_path) != expected_hash:
            raise ValueError(f"Git GLB receipt mismatch: {checked_path}")

    metrics = glb_metrics(asset_path)
    budget = budget_models[version["modelKey"]]
    validated = validation[target["candidateId"]]
    observed = {
        "triangles": metrics["triangles"],
        "drawPrimitives": metrics["drawPrimitives"],
        "maxTextureEdge": budget["maxTextureEdge"],
        "skins": metrics["skins"],
        "joints": metrics["joints"],
        "animationCount": metrics["animationCount"],
        "maxAnimationChannels": metrics["maxAnimationChannels"],
    }
    expected = {
        "triangles": validated["metrics"]["triangles"],
        "drawPrimitives": validated["metrics"]["meshes"],
        "maxTextureEdge": validated["metrics"]["maxTextureEdge"],
        "skins": validated["metrics"]["skins"],
        "joints": validated["metrics"]["joints"],
        "animationCount": len(validated["metrics"]["clips"]),
        "maxAnimationChannels": max(row["channels"] for row in validated["metrics"]["clips"]),
    }
    if observed != expected:
        raise ValueError(f"current GLB metrics drifted for {target['candidateId']}: {observed} != {expected}")

    required_roles = {"idle", "run", "attack", "cast", "hurt", "death"}
    clip_map = model_doc.get("clipMap", {})
    if set(clip_map) != required_roles or not set(clip_map.values()).issubset(set(metrics["animationNames"])):
        raise ValueError(f"invalid six-state clip map for {target['candidateId']}")

    visual_dir = (
        repo
        / "materials/hero-model-library/priority-evidence/infinity-strash-texture-backdrop-decimation-v1"
        / target["candidateId"]
    )
    visual_files = []
    for name in ("all-states-contact-sheet.png", "worst-difference-overview.png"):
        visual_files.append(source(visual_dir / name, repo))

    return {
        **target,
        "sourceCharacter": resource["sourceCharacter"],
        "sourceWork": resource["sourceWork"],
        "sourceAssetId": resource["sourceAssetId"],
        "gitAsset": source(asset_path, repo),
        "modelDocument": source(model_doc_path, repo),
        "metrics": observed,
        "clipMap": clip_map,
        "animationProvenance": {
            "native": resource["nativeAnimationCount"],
            "procedural": resource["proceduralAnimationCount"],
            "names": metrics["animationNames"],
        },
        "budgetVerdicts": budget.get("verdicts", {}),
        "formalAdoption": {
            "eligible": validated["formalHeroAdoptionEligible"],
            "validation": resource["validation"],
            "visualGatePassed": validated["visualEvidence"]["metricGatePassed"],
            "humanVisualReview": validated["visualEvidence"]["humanReview"]["result"],
            "evidence": visual_files,
        },
        "registration": {
            "heroId": target["heroId"],
            "modelSelectionMode": hero.get("modelSelectionMode"),
            "runtimeDropdownRegistered": resource["runtimeDropdownRegistered"],
            "modelVersionPresent": True,
            "activeDefault": hero.get("modelKey") == version["modelKey"],
            "retainedHighPolyOptionPresent": True,
            "retainedLabel": retained_version["label"],
        },
        "s3Backup": resource.get("s3"),
        "gaps": resource.get("limitations", []),
        "deployment": {
            "gitCheckoutVerified": True,
            "productionDeploymentVerifiedThisRun": False,
        },
    }


def build(repo: Path) -> dict[str, Any]:
    resources_path = repo / "materials/asset-library/current-resources.json"
    budget_path = repo / "content/assets/model-budget/report.json"
    validation_path = (
        repo
        / "materials/hero-model-library/priority-evidence/infinity-strash-texture-backdrop-decimation-v1/validation.json"
    )
    form_audit_path = (
        repo
        / "materials/hero-model-library/priority-evidence/infinity-strash-vearn-form-audit-v1/report.json"
    )
    bowlroll_path = (
        repo
        / "materials/hero-model-library/priority-evidence/bowlroll-vearn-mmd-v087/acquisition.json"
    )

    current_resources = read_json(resources_path)
    resources = {row["id"]: row for row in current_resources["models"]}
    budget_report = read_json(budget_path)
    budget_models = {row["id"]: row for row in budget_report["models"]}
    validation_doc = read_json(validation_path)
    validation = {row["candidateId"]: row for row in validation_doc["records"]}
    form_audit = read_json(form_audit_path)
    bowlroll = read_json(bowlroll_path)

    local_primary_paks = []
    for row in form_audit["primaryPaks"]:
        local_path = Path(row["absolutePath"])
        present = local_path.is_file()
        size_verified = present and local_path.stat().st_size == row["bytes"]
        if not size_verified:
            raise ValueError(f"local primary PAK mirror missing or size drifted: {local_path}")
        local_primary_paks.append(
            {
                "label": row["label"],
                "absolutePath": str(local_path),
                "bytes": row["bytes"],
                "priorVerifiedSha256": row["sha256"],
                "indexedEntries": row["indexedEntries"],
                "present": present,
                "sizeVerifiedThisRun": size_verified,
                "sha256RecomputedThisRun": False,
            }
        )

    records = [record_target(repo, target, resources, budget_models, validation) for target in TARGETS]
    identities = {row["nativeId"]: row for row in form_audit["identityExclusions"]}
    if identities != {
        "EN653": {"nativeId": "EN653", "identity": "MystVearn", "isVearnForm": False},
        "EN680": {"nativeId": "EN680", "identity": "Baran", "isVearnForm": False},
        "EN681": {"nativeId": "EN681", "identity": "Baran form", "isVearnForm": False},
    }:
        raise ValueError("Vearn identity exclusion set drifted")
    if form_audit["result"]["postTransformationVearnFullBodyLocated"] is not False:
        raise ValueError("post-transformation Vearn status changed; review before publishing")
    if bowlroll["identityFinding"].find("does not contain young true-body") < 0:
        raise ValueError("BowlRoll package identity finding drifted")

    return {
        "schema": "ggd.infinity-strash-dai-vearn-release-audit@1",
        "scope": {
            "heroes": ["godie-nbbc", "godie-ubal"],
            "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
            "poppReadOnly": True,
        },
        "generatedFrom": [
            source(resources_path, repo),
            source(budget_path, repo),
            source(validation_path, repo),
            source(form_audit_path, repo),
            source(bowlroll_path, repo),
        ],
        "releaseCandidates": records,
        "summary": {
            "acceptedAndDropdownRegistered": len(records),
            "activeDefaults": sum(row["registration"]["activeDefault"] for row in records),
            "nativeRuntimeClips": sum(row["animationProvenance"]["native"] for row in records),
            "productionDeploymentVerifiedThisRun": False,
        },
        "vearnForms": {
            "preTransformation": {
                "nativeId": "EN801",
                "status": "accepted-dropdown-registered-local-checkout",
                "bodyAssets": form_audit["en801"]["bodyAssets"],
            },
            "postTransformation": {
                "status": form_audit["result"]["status"],
                "fullBodyLocated": False,
                "nextAction": form_audit["result"]["nextAction"],
                "candidatePayloadCount": 0,
            },
            "identityExclusions": form_audit["identityExclusions"],
            "communityReserve": {
                "sourceId": bowlroll["sourceId"],
                "form": bowlroll["character"]["form"],
                "identityFinding": bowlroll["identityFinding"],
                "conversionStatus": bowlroll["integration"]["conversionStatus"],
                "runtimeReady": bowlroll["integration"]["runtimeReady"],
                "licenseBlock": {
                    "commercialUseAllowed": bowlroll["reuseTerms"]["commercialUseAllowed"],
                    "redistributionAllowed": bowlroll["reuseTerms"]["redistributionAllowed"],
                    "authorPermissionRequired": bowlroll["reuseTerms"]["authorPermissionRequiredForSharedRuntimeIntegration"],
                },
            },
        },
        "sourceAvailability": {
            "localPrimaryPakMirrorIndexed": all(row["present"] for row in local_primary_paks),
            "localPrimaryPaks": local_primary_paks,
            "liveSmbMountCheckedSeparately": True,
            "liveSmbMountAvailableAtAuditTime": False,
            "note": "This report verifies the checked-in candidates and preserved local evidence. It does not claim a fresh SMB read or production deployment.",
        },
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Infinity Strash 達伊／巴恩高品質候選現況",
        "",
        "> 本檔由 `audit.py` 從 Git 實檔、模型預算報告、驗收證據與角色版本清單產生；請勿手改數字。",
        "",
        "| 角色／形態 | 三角面 | Draw primitives | 貼圖最長邊 | 骨骼 | 原生動作 | 後台候選 | 目前預選 |",
        "|---|---:|---:|---:|---:|---:|---|---|",
    ]
    for row in report["releaseCandidates"]:
        metrics = row["metrics"]
        registration = row["registration"]
        lines.append(
            f"| {row['sourceCharacter']} | {metrics['triangles']:,} | {metrics['drawPrimitives']} | "
            f"{metrics['maxTextureEdge']} px | {metrics['joints']} | {row['animationProvenance']['native']} | "
            f"{'yes' if registration['runtimeDropdownRegistered'] else 'no'} | "
            f"{'yes' if registration['activeDefault'] else 'no'} |"
        )
    lines.extend(
        [
            "",
            "## 狀態邊界",
            "",
            "- 達伊 PN010/02、PN010/05＋達伊之劍、變身前老巴恩 EN801：Git 實檔、五段原生動作、預算、視覺驗收與後台候選均已驗證。",
            "- 達伊預選為 PN010/05＋達伊之劍減面版；老巴恩預選為 EN801 減面版。高面數版仍保留在各角色版本清單。",
            "- 巴恩變身後／年輕真身：兩個主 PAK 索引沒有第二個 EN801 身體，目前候選實檔為 0；須另取允許共用的來源。",
            "- EN653 是密斯特巴恩；EN680／EN681 是巴蘭與其形態，均不可當作變身後巴恩。",
            "- BowlRoll 鯖缶359 v0.87 只有老巴恩，且原作者禁止商用與再散布，所以只作私有儲備，不可轉成共用後台選項。",
            "- 本輪未驗證 Main 合併或正式站部署。",
            "",
            "## 重建",
            "",
            "```sh",
            "python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/audit.py --write",
            "python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-release-audit-v1/audit.py --check",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()

    repo = args.repo.resolve()
    output = args.output if args.output.is_absolute() else repo / args.output
    report = build(repo)
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    markdown = render_markdown(report)
    markdown_path = output.with_name("README.md")
    if args.check:
        stale = []
        if not output.is_file() or output.read_text(encoding="utf-8") != encoded:
            stale.append(str(output))
        if not markdown_path.is_file() or markdown_path.read_text(encoding="utf-8") != markdown:
            stale.append(str(markdown_path))
        if stale:
            print("stale generated files:", *stale, sep="\n- ", file=sys.stderr)
            return 1
        print(f"ok: {len(report['releaseCandidates'])} candidates; post-form payloads=0")
        return 0

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(encoded, encoding="utf-8")
    markdown_path.write_text(markdown, encoding="utf-8")
    print(output)
    print(markdown_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
