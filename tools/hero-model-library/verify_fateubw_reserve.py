#!/usr/bin/env python3
"""Verify the FateUBW 14-servant reserve without treating it as a runtime release."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
CHARACTERS = (
    "artoria_pendragon_saber",
    "cu_chulainn_lancer",
    "diarmuid_ua_duibhne_lancer",
    "emiya_archer",
    "gilgamesh_archer",
    "gilles_de_rais_caster",
    "hassan-i-sabbah_assassin",
    "heracles_berserker",
    "iskander_rider",
    "lancelot_berserker",
    "medea_caster",
    "medusa_rider",
    "nero_claudius_saber",
    "sasaki_kojiro_assassin",
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def normalized_record(
    value: Any,
    *,
    sha: str | None = None,
    size: int | None = None,
) -> dict[str, Any] | None:
    if isinstance(value, str):
        return {"path": value, "sha256": sha, "bytes": size}
    if isinstance(value, dict) and isinstance(value.get("path"), str):
        return {
            "path": value["path"],
            "sha256": value.get("sha256", sha),
            "bytes": value.get("bytes", size),
        }
    return None


def nested_file_records(value: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if isinstance(value, dict):
        record = normalized_record(value)
        if record and record.get("sha256"):
            records.append(record)
        for child in value.values():
            records.extend(nested_file_records(child))
    elif isinstance(value, list):
        for child in value:
            records.extend(nested_file_records(child))
    return records


def check_file(
    record: dict[str, Any],
    *,
    source_root: Path,
    label: str,
    errors: list[str],
) -> dict[str, Any]:
    path = Path(record["path"])
    if not path.is_absolute():
        path = source_root / path
    result = {
        "label": label,
        "absolutePath": str(path.resolve()),
        "recordedBytes": record.get("bytes"),
        "recordedSha256": record.get("sha256"),
        "existsLocal": path.is_file(),
    }
    if not path.is_file():
        errors.append(f"{label}: missing local file: {path}")
        result.update(bytes=None, sha256=None, sizeMatches=False, sha256Matches=False)
        return result
    actual_size = path.stat().st_size
    actual_sha = sha256(path)
    size_matches = record.get("bytes") is None or actual_size == record["bytes"]
    hash_matches = record.get("sha256") is None or actual_sha == record["sha256"]
    result.update(
        bytes=actual_size,
        sha256=actual_sha,
        sizeMatches=size_matches,
        sha256Matches=hash_matches,
    )
    if not size_matches:
        errors.append(f"{label}: byte count differs: {path}")
    if not hash_matches:
        errors.append(f"{label}: SHA-256 differs: {path}")
    return result


def source_and_indexes(repo: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    library = repo / "materials/hero-model-library"
    sources = read_json(library / "download-sources.json")
    source = next(row for row in sources["publicSources"] if row["id"] == SOURCE_ID)
    backlog = read_json(library / "已取得模型待設計英雄.json")
    backups = read_json(library / "public-source-files.json")
    return source, backlog, backups


def build_report(repo: Path, workspace: Path | None) -> dict[str, Any]:
    source, backlog, backups = source_and_indexes(repo)
    errors: list[str] = []
    local_checks: list[dict[str, Any]] = []
    source_root = workspace / source["localPath"] if workspace else None

    servants = [
        row for row in source["modelCandidates"]
        if "/servant/" in row.get("sourceModel", "")
    ]
    require(len(servants) == 14, f"expected 14 servants, found {len(servants)}", errors)
    require(
        {row["character"] for row in servants} == set(CHARACTERS),
        "servant identity set differs from the reviewed 14-character set",
        errors,
    )
    require(source.get("license") == "ARR", "source license must remain ARR", errors)
    require(
        "republication permission not inferred" in source.get("rightsStatus", ""),
        "rightsStatus must retain the no-republication inference boundary",
        errors,
    )
    backend = source.get("backendIntegration", {})
    require(backend.get("release") is None, "ARR reserve must not name a runtime release", errors)
    require(backend.get("selectionVerified") is False, "ARR reserve must not claim backend selection", errors)
    require(source.get("defaultEligible") is False, "ARR reserve must not be default eligible", errors)

    attempts = {row["id"]: row for row in source.get("conversionAttempts", [])}
    backlog_candidates = {
        candidate["id"]: candidate
        for character in backlog["characters"]
        for candidate in character.get("modelCandidates", [])
        if candidate.get("sourceId") == SOURCE_ID
    }
    backup_by_uri = {
        row["s3Uri"]: row
        for row in backups["sources"]
        if row.get("s3Uri")
    }
    s3_uris: set[str] = set()
    servant_rows: list[dict[str, Any]] = []
    source_clips = converted_clips = unconverted_clips = 0

    for servant in sorted(servants, key=lambda row: row["character"]):
        character = servant["character"]
        source_clips += servant["sourceAnimation"]["clipCount"]
        native_metadata = servant.get("nativeMotionStandardization", {})
        converted_clips += native_metadata.get("convertedClipCount", 0)
        unconverted_clips += native_metadata.get("unconvertedClipCount", 0)
        static_id = servant["bodyStandardization"]["attemptId"]
        native_id = native_metadata["attemptId"]
        require(static_id in attempts, f"{character}: missing static attempt {static_id}", errors)
        require(native_id in attempts, f"{character}: missing native attempt {native_id}", errors)
        if static_id not in attempts or native_id not in attempts:
            continue
        static = attempts[static_id]
        native = attempts[native_id]

        for label, attempt in (("static", static), ("native", native)):
            require(attempt.get("runtimeReady") is False, f"{character}: {label} runtimeReady drift", errors)
            require(
                attempt.get("backendSelectionVerified") is False,
                f"{character}: {label} backend selection drift",
                errors,
            )
            require(attempt.get("defaultEligible") is False, f"{character}: {label} default drift", errors)
            require(
                attempt.get("deploymentStatus") == "not-deployed",
                f"{character}: {label} deployment status drift",
                errors,
            )
            backup = attempt.get("legacyBackup", {})
            uri = backup.get("s3Uri")
            require(bool(uri), f"{character}: {label} has no S3 backup URI", errors)
            if uri:
                s3_uris.add(uri)
                indexed = backup_by_uri.get(uri)
                require(indexed is not None, f"{character}: {label} S3 backup is absent from public-source-files", errors)
                if indexed:
                    require(indexed.get("readbackVerified") is True, f"{character}: {label} S3 readback is false", errors)
                    expected_archive_sha = backup.get("archiveSha256")
                    require(
                        not expected_archive_sha or indexed.get("sha256") == expected_archive_sha,
                        f"{character}: {label} S3 archive SHA differs",
                        errors,
                    )

        raw_id = f"fateubw-{character}:0"
        for candidate_id, attempt in ((static_id, static), (native_id, native)):
            indexed = backlog_candidates.get(candidate_id)
            require(indexed is not None, f"{character}: backlog missing {candidate_id}", errors)
            if indexed:
                body = attempt["body"]
                require(indexed.get("path") == body["path"], f"{character}: backlog path differs for {candidate_id}", errors)
                require(indexed.get("sha256") == body["sha256"], f"{character}: backlog SHA differs for {candidate_id}", errors)
                require(indexed.get("bytes") == body["bytes"], f"{character}: backlog bytes differ for {candidate_id}", errors)
                require(indexed.get("readbackVerified") is True, f"{character}: backlog readback is false for {candidate_id}", errors)
                require(indexed.get("runtimeSelectable") is False, f"{character}: backlog runtime flag drift for {candidate_id}", errors)
                require(indexed.get("defaultEligible") is False, f"{character}: backlog default flag drift for {candidate_id}", errors)
        require(raw_id in backlog_candidates, f"{character}: backlog missing raw source {raw_id}", errors)

        if source_root:
            raw_records = [
                normalized_record(
                    servant["sourceModel"],
                    sha=servant.get("sourceModelSha256"),
                    size=servant.get("sourceModelBytes"),
                ),
                normalized_record(servant.get("sourceTexture")),
                normalized_record(servant.get("sourceAnimation")),
            ]
            selected_records = [record for record in raw_records if record]
            selected_records.extend(nested_file_records(static))
            selected_records.extend(nested_file_records(native))
            seen: set[tuple[str, str | None]] = set()
            for index, record in enumerate(selected_records):
                key = (record["path"], record.get("sha256"))
                if key in seen:
                    continue
                seen.add(key)
                local_checks.append(
                    check_file(
                        record,
                        source_root=source_root,
                        label=f"{character}:{index}",
                        errors=errors,
                    )
                )

        servant_rows.append({
            "character": character,
            "sourceClipCount": servant["sourceAnimation"]["clipCount"],
            "convertedNativeClipCount": native_metadata["convertedClipCount"],
            "unconvertedClipCount": native_metadata["unconvertedClipCount"],
            "sourceModel": {
                "path": servant["sourceModel"],
                "bytes": servant["sourceModelBytes"],
                "sha256": servant["sourceModelSha256"],
            },
            "sourceTexture": servant["sourceTexture"],
            "sourceAnimation": servant["sourceAnimation"],
            "staticBody": static["body"],
            "nativeMotionBody": native["body"],
            "runtimeSelectable": False,
            "defaultEligible": False,
        })

    source_backup = source.get("backup", {})
    source_backup_uri = source_backup.get("s3Uri")
    require(bool(source_backup_uri), "source archive has no S3 URI", errors)
    if source_backup_uri:
        s3_uris.add(source_backup_uri)
        indexed = backup_by_uri.get(source_backup_uri)
        require(indexed is not None, "source archive is absent from public-source-files", errors)
        if indexed:
            require(indexed.get("readbackVerified") is True, "source archive readback is false", errors)
            require(indexed.get("sha256") == source_backup.get("sha256"), "source archive SHA differs", errors)

    license_evidence: list[dict[str, Any]] = []
    if source_root:
        for relative in source.get("licenseEvidence", []):
            evidence_path = source_root / relative.split("#", 1)[0]
            require(evidence_path.is_file(), f"license evidence missing: {evidence_path}", errors)
            if not evidence_path.is_file():
                continue
            text = evidence_path.read_text()
            if evidence_path.name == "fabric.mod.json":
                declared = json.loads(text).get("license")
            else:
                match = re.search(r'^\s*license\s*=\s*["\']([^"\']+)["\']', text, re.MULTILINE)
                declared = match.group(1) if match else None
            require(declared == "ARR", f"license evidence is not ARR: {evidence_path}", errors)
            license_evidence.append({
                "absolutePath": str(evidence_path.resolve()),
                "bytes": evidence_path.stat().st_size,
                "sha256": sha256(evidence_path),
                "declaredLicense": declared,
            })

    require(source_clips == 132, f"source clip total is {source_clips}, expected 132", errors)
    require(converted_clips == 112, f"converted clip total is {converted_clips}, expected 112", errors)
    require(unconverted_clips == 20, f"unconverted clip total is {unconverted_clips}, expected 20", errors)
    failed_file_checks = sum(
        not row["existsLocal"] or not row["sizeMatches"] or not row["sha256Matches"]
        for row in local_checks
    )
    return {
        "schema": "ggd-fateubw-reserve-integrity@1",
        "sourceId": SOURCE_ID,
        "sourceCommit": source["sourceCommit"],
        "sourceVersion": source["sourceVersion"],
        "sourceGame": source["sourceGame"],
        "platform": source["platform"],
        "license": source["license"],
        "rightsStatus": source["rightsStatus"],
        "verificationScope": "local source/conversion bytes plus Git metadata and S3 readback receipts; no runtime, rights, backend-selection or deployment claim",
        "workspace": str(workspace.resolve()) if workspace else None,
        "sourceRoot": str(source_root.resolve()) if source_root else None,
        "summary": {
            "servants": len(servant_rows),
            "sourceClips": source_clips,
            "convertedNativeClips": converted_clips,
            "unconvertedClips": unconverted_clips,
            "centralCandidateRecords": len(servant_rows) * 3,
            "distinctS3Archives": len(s3_uris),
            "localFileChecks": len(local_checks),
            "failedLocalFileChecks": failed_file_checks,
            "errors": len(errors),
            "runtimeSelectable": 0,
            "defaultEligible": 0,
            "deployed": 0,
        },
        "licenseEvidence": license_evidence,
        "servants": servant_rows,
        "localFileChecks": local_checks,
        "s3Archives": sorted(s3_uris),
        "errors": errors,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--workspace",
        type=Path,
        help="workspace containing GGD-Asset-Library; omit for Git/S3 metadata-only verification",
    )
    parser.add_argument("--output", type=Path, help="optional JSON receipt path")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    report = build_report(repo, args.workspace.resolve() if args.workspace else None)
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload)
    print(json.dumps({"status": "ok" if not report["errors"] else "failed", **report["summary"]}, ensure_ascii=False))
    if report["errors"]:
        raise SystemExit("\n".join(report["errors"]))


if __name__ == "__main__":
    main()
