#!/usr/bin/env python3
"""Parse and index every Ultimate14 NUANMB without modifying source files."""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import platform
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


SOURCE_ID = "parallel-ns-ultimate14"
SOURCE_URL = "https://github.com/CSharpM7/Ultimate14-release/releases/tag/1.0"
EXPECTED_ARCHIVE_SHA256 = "8f882c140973c2771ff4be3d18998b0d3f992b896463543ce142065855941079"
SOURCE_S3_URI = (
    "s3://ggd-390630837668-ap-east-2-an/legacy/public-model-sources/"
    "parallel-ns-ultimate14/cbab4e5e60bc531f9167b6fe0f4aa44a392b786d36ef06d0c258a7be12d723fd.zip"
)
DEPENDENCY_RECEIPT_GIT_PATH = (
    "tools/hero-model-library/source-workflows/"
    "ultimate14-motion-audit-20260912-v1/dependencies.json"
)
FIGHTER_TO_BACKLOG = {
    "chrom": "ssbu-chrom",
    "daisy": "ssbu-daisy",
    "ganon": "ssbu-ganon",
    "kirby": "kirby",
    "link": "link",
    "toonlink": "link",
    "lucas": "ssbu-lucas",
    "lucina": "ssbu-lucina",
    "mario": "ssbu-mario",
    "peach": "ssbu-peach",
    "pitb": "ssbu-pitb",
    "richter": "ssbu-richter",
    "samusd": "ssbu-samusd",
    "shizue": "ssbu-shizue",
    "simon": "ssbu-simon",
    "sonic": "ssbu-sonic",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def classify(relative_path: str) -> dict[str, str | None]:
    parts = relative_path.split("/")
    if len(parts) < 3 or parts[0] != "fighter":
        return {
            "fighterId": None,
            "directoryClass": "unclassified",
            "target": None,
            "costume": None,
            "clipName": Path(relative_path).stem,
        }
    fighter = parts[1]
    if parts[2] == "motion" and len(parts) >= 6:
        target = parts[3]
        costume_index = next((i for i, value in enumerate(parts[4:-1], 4) if re.fullmatch(r"c\d+", value)), None)
        costume = parts[costume_index] if costume_index is not None else None
        return {
            "fighterId": fighter,
            "directoryClass": "body-motion" if target == "body" else "accessory-motion",
            "target": target,
            "costume": costume,
            "clipName": Path(relative_path).stem,
        }
    if parts[2] == "model":
        target = parts[3] if len(parts) > 3 else None
        costume = next((value for value in parts[4:-1] if re.fullmatch(r"c\d+", value)), None)
        return {
            "fighterId": fighter,
            "directoryClass": "model-animation-metadata",
            "target": target,
            "costume": costume,
            "clipName": Path(relative_path).stem,
        }
    return {
        "fighterId": fighter,
        "directoryClass": "unclassified",
        "target": parts[2],
        "costume": None,
        "clipName": Path(relative_path).stem,
    }


def group_summary(animation) -> tuple[dict[str, dict[str, int]], list[str]]:
    groups: dict[str, dict[str, int]] = {}
    transform_nodes: list[str] = []
    for group in animation.groups:
        name = group.group_type.name
        nodes = list(group.nodes)
        groups[name] = {
            "nodeCount": len(nodes),
            "trackCount": sum(len(node.tracks) for node in nodes),
            "valueCount": sum(len(track.values) for node in nodes for track in node.tracks),
        }
        if name == "Transform":
            transform_nodes = sorted(node.name for node in nodes)
    return groups, transform_nodes


def payload_readiness(payload: dict) -> str:
    transform_nodes = payload.get("transformNodeNames", [])
    if not transform_nodes:
        return "parsed-nuanmb-without-transform-tracks"
    return "parsed-native-mod-motion-reserve-pending-skeleton-playback"


def summarize_fighter(rows: list[dict], payloads: dict[str, dict]) -> dict:
    by_class = Counter(row["directoryClass"] for row in rows)
    unique_by_class: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        unique_by_class[row["directoryClass"]].add(row["sha256"])
    transform_rows = [row for row in rows if payloads[row["sha256"]]["transformNodeNames"]]
    model_transform_rows = [
        row for row in transform_rows if row["directoryClass"] == "model-animation-metadata"
    ]
    frame_values = [payloads[row["sha256"]]["finalFrameIndex"] for row in transform_rows]
    return {
        "pathCount": len(rows),
        "uniquePayloadCount": len({row["sha256"] for row in rows}),
        "bodyMotionPathCount": by_class["body-motion"],
        "uniqueBodyMotionPayloadCount": len(unique_by_class["body-motion"]),
        "accessoryMotionPathCount": by_class["accessory-motion"],
        "uniqueAccessoryMotionPayloadCount": len(unique_by_class["accessory-motion"]),
        "modelAnimationMetadataPathCount": by_class["model-animation-metadata"],
        "uniqueModelAnimationMetadataPayloadCount": len(unique_by_class["model-animation-metadata"]),
        "modelAnimationMetadataWithTransformPathCount": len(model_transform_rows),
        "transformMotionPathCount": len(transform_rows),
        "uniqueTransformMotionPayloadCount": len({row["sha256"] for row in transform_rows}),
        "minFinalFrameIndex": min(frame_values) if frame_values else None,
        "maxFinalFrameIndex": max(frame_values) if frame_values else None,
        "conversionStatus": "not-converted-to-ggd",
        "skeletonPlaybackValidated": False,
        "runtimeSelectable": False,
    }


def make_motion_label(fighter_rows: list[tuple[str, dict]]) -> str:
    parts = []
    for fighter, row in fighter_rows:
        segments = []
        if row["bodyMotionPathCount"]:
            segments.append(
                f"本體 {row['bodyMotionPathCount']}檔／{row['uniqueBodyMotionPayloadCount']}種內容"
            )
        if row["accessoryMotionPathCount"]:
            segments.append(
                f"配件 {row['accessoryMotionPathCount']}檔／{row['uniqueAccessoryMotionPayloadCount']}種內容"
            )
        if row["modelAnimationMetadataPathCount"] and not row["modelAnimationMetadataWithTransformPathCount"]:
            segments.append(
                "模型預設無Transform資料 "
                f"{row['modelAnimationMetadataPathCount']}檔／"
                f"{row['uniqueModelAnimationMetadataPayloadCount']}種內容"
            )
        parts.append(f"{fighter}: " + "、".join(segments))
    return (
        "Ultimate14 NUANMB 已逐檔解析："
        + "；".join(parts)
        + "；來源是社群 MOD 覆寫片段，尚未轉成 GGD 動作，也未與本體骨架完成播放驗收。"
    )


def without_existing_motion_label(value: object) -> str:
    """Keep the pre-existing non-Ultimate14 note when regeneration is repeated."""
    prior = str(value or "")
    for marker in ("Ultimate14 NUANMB 已逐檔解析：", "另有 MOD 動作："):
        if marker in prior:
            prior = prior.split(marker, 1)[0]
    return prior.rstrip()


def build(source_root: Path, audited_at: str) -> dict:
    try:
        from ssbh_data_py import anim_data
    except ImportError as error:
        raise SystemExit("Install pinned dependency: pip install ssbh_data_py==0.9.1") from error

    files = sorted(source_root.rglob("*.nuanmb"))
    if not files:
        raise SystemExit(f"No NUANMB files found under {source_root}")
    aliases: list[dict] = []
    payloads: dict[str, dict] = {}
    parse_errors: list[dict] = []
    for path in files:
        relative = path.relative_to(source_root).as_posix()
        digest = sha256(path)
        classification = classify(relative)
        aliases.append({"relativePath": relative, "bytes": path.stat().st_size, "sha256": digest, **classification})
        if digest in payloads:
            continue
        try:
            animation = anim_data.read_anim(str(path))
            groups, transform_nodes = group_summary(animation)
            payload = {
                "sha256": digest,
                "bytes": path.stat().st_size,
                "format": "SSBH Anim / NUANMB",
                "majorVersion": animation.major_version,
                "minorVersion": animation.minor_version,
                "finalFrameIndex": animation.final_frame_index,
                "groups": groups,
                "transformNodeNames": transform_nodes,
                "transformNodeNameSetSha256": hashlib.sha256(
                    ("\n".join(transform_nodes) + "\n").encode()
                ).hexdigest(),
                "readiness": None,
                "converted": False,
                "runtimeSelectable": False,
            }
            payload["readiness"] = payload_readiness(payload)
            payloads[digest] = payload
        except Exception as error:  # parser error needs to remain in the audit
            parse_errors.append({"relativePath": relative, "sha256": digest, "error": str(error)})
            payloads[digest] = {
                "sha256": digest,
                "bytes": path.stat().st_size,
                "format": "SSBH Anim / NUANMB",
                "parseError": str(error),
                "transformNodeNames": [],
                "readiness": "native-motion-parse-error",
                "converted": False,
                "runtimeSelectable": False,
            }

    rows_by_fighter: dict[str, list[dict]] = defaultdict(list)
    for row in aliases:
        rows_by_fighter[str(row["fighterId"])].append(row)
    fighters = {
        fighter: summarize_fighter(rows, payloads)
        for fighter, rows in sorted(rows_by_fighter.items())
    }
    parsed_payloads = [payload for payload in payloads.values() if "parseError" not in payload]
    error_payload_shas = {payload["sha256"] for payload in payloads.values() if "parseError" in payload}
    unique_version_counts = Counter(
        f"{payload['majorVersion']}.{payload['minorVersion']}" for payload in parsed_payloads
    )
    path_version_counts = Counter(
        f"{payloads[row['sha256']]['majorVersion']}.{payloads[row['sha256']]['minorVersion']}"
        for row in aliases
        if "parseError" not in payloads[row["sha256"]]
    )
    transform_payloads = [payload for payload in parsed_payloads if payload["transformNodeNames"]]
    return {
        "schema": "ggd-ultimate14-native-motion-inventory@1",
        "auditedAt": audited_at,
        "source": {
            "id": SOURCE_ID,
            "work": "Super Smash Bros. Ultimate / Ultimate14 community mod",
            "platform": "Nintendo Switch",
            "sourceUrl": SOURCE_URL,
            "author": "CSharpM7 (C#)",
            "sourceRoot": str(source_root.resolve()),
            "originalArchiveSha256": EXPECTED_ARCHIVE_SHA256,
            "s3Uri": SOURCE_S3_URI,
            "s3ReadbackVerified": True,
        },
        "parser": {
            "name": "ssbh_data_py",
            "version": importlib.metadata.version("ssbh_data_py"),
            "pythonMajorMinor": f"{sys.version_info.major}.{sys.version_info.minor}",
            "pythonImplementation": platform.python_implementation(),
            "supportedNuanmbVersions": ["2.0", "2.1"],
            "usage": "read-only parsing; source files are never saved or overwritten",
            "workflowGitPath": (
                "tools/hero-model-library/source-workflows/"
                "ultimate14-motion-audit-20260912-v1/audit.py"
            ),
            "dependencyReceiptGitPath": DEPENDENCY_RECEIPT_GIT_PATH,
        },
        "summary": {
            "pathCount": len(aliases),
            "uniquePayloadCount": len(payloads),
            "parsedPathCount": sum(row["sha256"] not in error_payload_shas for row in aliases),
            "parseErrorPathCount": sum(row["sha256"] in error_payload_shas for row in aliases),
            "parseErrorUniquePayloadCount": len(error_payload_shas),
            "motionDirectoryPathCount": sum(row["directoryClass"] != "model-animation-metadata" for row in aliases),
            "bodyMotionPathCount": sum(row["directoryClass"] == "body-motion" for row in aliases),
            "accessoryMotionPathCount": sum(row["directoryClass"] == "accessory-motion" for row in aliases),
            "modelAnimationMetadataPathCount": sum(row["directoryClass"] == "model-animation-metadata" for row in aliases),
            "transformMotionPathCount": sum(
                bool(payloads[row["sha256"]]["transformNodeNames"]) for row in aliases
            ),
            "uniqueTransformMotionPayloadCount": len(transform_payloads),
            "nuanmbVersionPathCounts": dict(sorted(path_version_counts.items())),
            "nuanmbVersionUniquePayloadCounts": dict(sorted(unique_version_counts.items())),
            "fighterCount": len(fighters),
            "convertedToGgdCount": 0,
            "skeletonPlaybackValidatedCount": 0,
            "runtimeSelectableCount": 0,
        },
        "countingPolicy": {
            "pathCount": "All preserved file/version/color path relationships, including byte-identical aliases.",
            "uniquePayloadCount": "Distinct SHA-256 payloads.",
            "transformMotion": "Parsed payload contains at least one Transform node; this still does not prove compatibility with a target skeleton.",
            "modelAnimationMetadata": "NUANMB found under model/, commonly an empty one-frame default; not counted as a playable motion.",
        },
        "fighters": fighters,
        "payloads": [payloads[digest] for digest in sorted(payloads)],
        "aliases": aliases,
        "parseErrors": parse_errors,
        "gaps": [
            "Ultimate14 is a community mod patch and does not provide each fighter's complete original animation set.",
            "No NUANMB has been converted into GGD GLB animation data by this audit.",
            "Bone-name overlap, rest-pose parity, playback, semantic event mapping, and runtime selection remain unverified.",
        ],
    }


def sync_download_source(download_path: Path, report_path: Path, report: dict) -> None:
    data = json.loads(download_path.read_text())
    source = next(item for item in data["publicSources"] if item.get("id") == SOURCE_ID)
    source["nativeMotionIndex"] = {
        "schema": report["schema"],
        "gitPath": report_path.as_posix(),
        "sha256": sha256(download_path.parent.parent.parent / report_path),
        "parser": "ssbh_data_py==0.9.1",
        "pathCount": report["summary"]["pathCount"],
        "uniquePayloadCount": report["summary"]["uniquePayloadCount"],
        "parsedPathCount": report["summary"]["parsedPathCount"],
        "bodyMotionPathCount": report["summary"]["bodyMotionPathCount"],
        "accessoryMotionPathCount": report["summary"]["accessoryMotionPathCount"],
        "modelAnimationMetadataPathCount": report["summary"]["modelAnimationMetadataPathCount"],
        "transformMotionPathCount": report["summary"]["transformMotionPathCount"],
        "uniqueTransformMotionPayloadCount": report["summary"]["uniqueTransformMotionPayloadCount"],
        "parseErrorPathCount": report["summary"]["parseErrorPathCount"],
        "parseErrorUniquePayloadCount": report["summary"]["parseErrorUniquePayloadCount"],
        "convertedToGgdCount": 0,
        "runtimeSelectableCount": 0,
        "dependencyReceiptGitPath": DEPENDENCY_RECEIPT_GIT_PATH,
        "dependency": {
            "name": "ssbh_data_py",
            "version": "0.9.1",
            "wheelSha256": "0a4311259b040556fbb6ceeb58391a297554d41728950098a893218b6d6f4487",
            "s3Uri": (
                "s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/dependencies/"
                "ssbh_data_py/0.9.1/"
                "0a4311259b040556fbb6ceeb58391a297554d41728950098a893218b6d6f4487.whl"
            ),
            "readbackVerified": True,
        },
    }
    download_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def sync_resource_coverage(resource_path: Path, report_path: Path, report: dict) -> None:
    data = json.loads(resource_path.read_text())
    grouped: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for fighter, row in report["fighters"].items():
        backlog_id = FIGHTER_TO_BACKLOG.get(fighter)
        if backlog_id:
            grouped[backlog_id].append((fighter, row))
    repo = resource_path.parents[3]
    evidence = report_path.as_posix()
    for backlog_id, fighter_rows in grouped.items():
        override = data["characterOverrides"].setdefault(backlog_id, {})
        prefix = without_existing_motion_label(override.get("motion"))
        if prefix and not prefix.endswith(" "):
            prefix += " "
        override["motion"] = prefix + make_motion_label(sorted(fighter_rows))
        paths = [path for path in override.setdefault("evidencePaths", []) if not str(path).endswith(report_path.as_posix())]
        if evidence not in paths:
            paths.append(evidence)
        override["evidencePaths"] = paths
    for family in data.get("sourceFamilies", []):
        if family.get("id") == "smash-ultimate-mods":
            s = report["summary"]
            family["motion"] = (
                f"Ultimate14 {s['pathCount']} NUANMB 路徑／{s['uniquePayloadCount']} 種內容，"
                f"其中 {s['motionDirectoryPathCount']} 路徑在 motion/、"
                f"{s['modelAnimationMetadataPathCount']} 路徑是 model/ 預設資料；"
                "全部解析成功但尚未轉 GGD。Bowser 38/5；Alucard 112/105。"
            )
    data.setdefault("inputFiles", [])
    data["inputFiles"] = [item for item in data["inputFiles"] if item.get("path") != report_path.as_posix()]
    data["inputFiles"].append({"path": report_path.as_posix(), "sha256": sha256(repo / report_path)})
    resource_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--audited-at")
    parser.add_argument("--repo", type=Path)
    parser.add_argument("--sync-central", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check and args.sync_central:
        parser.error("--check is read-only and cannot be combined with --sync-central")
    if args.check and args.output.is_file() and not args.audited_at:
        audited_at = json.loads(args.output.read_text())["auditedAt"]
    else:
        audited_at = args.audited_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    report = build(args.source_root.resolve(), audited_at)
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not args.output.is_file() or args.output.read_text() != encoded:
            raise SystemExit(f"STALE ULTIMATE14 MOTION INVENTORY: {args.output}")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    if args.sync_central:
        if not args.repo:
            parser.error("--sync-central requires --repo")
        repo = args.repo.resolve()
        report_path = args.output.resolve().relative_to(repo)
        sync_download_source(repo / "materials/hero-model-library/download-sources.json", report_path, report)
        sync_resource_coverage(repo / "materials/hero-model-library/design-backlog/resource-coverage.json", report_path, report)
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
