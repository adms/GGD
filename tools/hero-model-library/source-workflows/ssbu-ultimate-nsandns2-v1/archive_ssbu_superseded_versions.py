#!/usr/bin/env python3
"""Record retained SSBU conversion stages without promoting them to runtime models.

The input describes early local GLB outputs that were superseded by later
alpha/material repairs or formal decimation.  It validates every local source
and its S3 full-readback receipt, then writes a portable inventory plus nested
``legacyConversionVersions`` records on the accepted current candidate.  The
legacy entries deliberately cannot become default, runtime, or dropdown rows.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
ASSET_ROOT = WORKSPACE / "GGD-Asset-Library"
CONFIG = Path(__file__).with_name("ssbu_superseded_versions.json")
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
OUTPUT = REPO / "materials/hero-model-library/source-inventories/ssbu-superseded-conversion-versions.json"
DOCUMENT = REPO / "materials/hero-model-library/source-inventories/ssbu-superseded-conversion-versions.md"


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def encode(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def pin(path: Path) -> dict:
    return {
        "absolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": digest(path),
    }


def legacy_record(version: dict, candidate: dict) -> dict:
    source_path = ASSET_ROOT / "conversions" / version["conversionRoot"] / version["relativeGlbPath"]
    staging_path = REPO / version["stagingGitPath"]
    receipt_path = ASSET_ROOT / "backups" / version["backupId"] / "latest-receipt.json"
    require(source_path.is_file(), "Missing canonical retained GLB: " + str(source_path))
    require(source_path.stat().st_size == version["bytes"] and digest(source_path) == version["sha256"],
            "Canonical retained GLB changed: " + version["id"])
    require(staging_path.is_file(), "Missing retained staging-copy evidence: " + version["stagingGitPath"])
    require(staging_path.read_bytes() == source_path.read_bytes(),
            "Staging copy differs from canonical retained GLB: " + version["id"])
    receipt = read(receipt_path)
    require(receipt.get("fullGetVerified") is True, "S3 full GET missing: " + version["id"])
    require(receipt.get("allMemberSha256Verified") is True, "S3 member verification missing: " + version["id"])
    require(receipt.get("localUnchanged") is True, "Local preservation check missing: " + version["id"])
    require(Path(receipt.get("source", "")).resolve() == (ASSET_ROOT / "conversions" / version["conversionRoot"]).resolve(),
            "S3 receipt source differs from retained conversion root: " + version["id"])
    require(str(receipt.get("s3Uri", "")).startswith("s3://ggd-390630837668-ap-east-2-an/legacy/"),
            "Unexpected S3 location: " + version["id"])
    require(candidate["sha256"] != version["sha256"], "Superseding candidate must have different bytes: " + version["id"])
    return {
        "id": version["id"],
        "nameZh": version["nameZh"],
        "originalName": version["originalName"],
        "nativeId": version["nativeId"],
        "sourceStage": version["sourceStage"],
        "state": "retained-legacy-conversion-stage",
        "sourceGlb": pin(source_path),
        "stagingCopy": {
            "gitPath": version["stagingGitPath"],
            "bytes": version["bytes"],
            "sha256": version["sha256"],
            "state": "untracked-staging-copy-not-a-git-product",
        },
        "localConversionRoot": str((ASSET_ROOT / "conversions" / version["conversionRoot"]).resolve()),
        "s3Backup": {
            "state": "uploaded-and-readback-verified",
            "s3Uri": receipt["s3Uri"],
            "manifestUri": receipt.get("manifestUri"),
            "archiveSha256": receipt.get("archiveSha256"),
            "archiveBytes": receipt.get("archiveBytes"),
            "fileCount": receipt.get("fileCount"),
            "fullGetVerified": True,
            "allMemberSha256Verified": True,
            "localUnchanged": True,
            "localReceiptPath": str(receipt_path.resolve()),
            "receiptSha256": digest(receipt_path),
        },
        "supersededBy": {
            "candidateId": candidate["id"],
            "gitPath": candidate["gitPath"],
            "sha256": candidate["sha256"],
            "reason": version["supersededReason"],
        },
        "converted": True,
        "componentReady": False,
        "fullHeroModel": False,
        "runtimeSelectable": False,
        "runtimeDropdownRegistered": False,
        "defaultEligible": False,
        "deploymentStatus": "not-deployed",
        "limitations": [
            "Retained for provenance and reconstruction only; the later candidate is the current accepted conversion.",
            "This is not a model@1 document, backend dropdown option, or complete hero.",
            "No native animation binding is implied by this static conversion-stage record.",
        ],
    }


def build() -> tuple[dict, dict]:
    config = read(CONFIG)
    require(config.get("schema") == "ggd-ssbu-superseded-conversion-versions@1", "Unexpected config schema")
    versions = config.get("versions", [])
    require(len(versions) == 9 and len({row["id"] for row in versions}) == 9, "Expected nine distinct legacy stages")
    downloads = read(DOWNLOADS)
    source = next((row for row in downloads.get("publicSources", []) if row.get("id") == config["sourceId"]), None)
    require(source is not None, "SSBU source record missing")
    candidates = {row.get("id"): row for row in source.get("componentCandidates", [])}
    rendered = []
    for version in versions:
        candidate = candidates.get(version["candidateId"])
        require(candidate is not None, "Superseding current candidate missing: " + version["candidateId"])
        require(candidate.get("nativeId") == version["nativeId"], "Native ID differs from current candidate: " + version["id"])
        rendered.append(legacy_record(version, candidate))
    by_candidate: dict[str, list[dict]] = {}
    for row in rendered:
        by_candidate.setdefault(row["supersededBy"]["candidateId"], []).append(row)
    for candidate_id, rows in by_candidate.items():
        candidate = candidates[candidate_id]
        candidate["legacyConversionVersions"] = rows
    output = {
        "schema": "ggd-ssbu-superseded-conversion-inventory@1",
        "sourceId": config["sourceId"],
        "sourceGame": config["sourceGame"],
        "platform": config["platform"],
        "sourceGameReleasedAt": config["sourceGameReleasedAt"],
        "summary": {
            "retainedLegacyConversionVersions": len(rendered),
            "currentCandidatesReferenced": len(by_candidate),
            "runtimeSelectable": 0,
            "runtimeDropdownRegistered": 0,
            "defaultEligible": 0,
            "deploymentVerified": 0,
        },
        "versions": rendered,
        "rebuild": "python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/archive_ssbu_superseded_versions.py --write",
        "scopeBoundary": "Retained local/S3 conversion stages only. Current accepted candidates remain separate and are the only records eligible for later hero binding.",
    }
    return downloads, output


def render_markdown(output: dict) -> str:
    lines = [
        "# SSBU 已被取代的轉換版本",
        "",
        "本頁由 `archive_ssbu_superseded_versions.py` 從固定版本設定、現行成品候選、本機轉換檔與 S3 讀回收據產生。這些是保留給追溯與重建的早期轉換階段，**不是**後台下拉選項、完整英雄或正式站內容。",
        "",
        "| 角色 | 早期階段 | 已保留位元組 | 目前取代候選 | 本機／S3 | 狀態 |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for row in output["versions"]:
        s3 = row["s3Backup"]["s3Uri"]
        lines.append(
            f"| {row['nameZh']}／{row['originalName']} | `{row['sourceStage']}` | `{row['sourceGlb']['sha256'][:12]}…`／{row['sourceGlb']['bytes']:,} bytes | "
            f"`{row['supersededBy']['candidateId']}` | `{row['localConversionRoot']}`<br>`{s3}` | 已轉換、已備份讀回、已被取代；不可切換 |"
        )
    lines.extend([
        "",
        "所有條目固定為 `componentReady=false`、`runtimeSelectable=false`、`runtimeDropdownRegistered=false`、`defaultEligible=false`、`deploymentStatus=not-deployed`。未追蹤的 `content/assets/models/community/` 暫存副本只用來驗證位元組相同，並非 Git 成品；可重建來源維持在 `GGD-Asset-Library/conversions/` 與對應 S3 `legacy/` 封裝。",
        "",
        f"重建：`python3 tools/hero-model-library/source-workflows/ssbu-ultimate-nsandns2-v1/archive_ssbu_superseded_versions.py --write`。機器查詢：`python3 tools/hero-model-library/query.py <角色> --candidates --json`。",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="write download-sources and generated inventory")
    args = parser.parse_args()
    downloads, output = build()
    expected = {DOWNLOADS: encode(downloads), OUTPUT: encode(output), DOCUMENT: render_markdown(output)}
    if args.write:
        for path, content in expected.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    else:
        drift = [str(path.relative_to(REPO)) for path, content in expected.items()
                 if not path.is_file() or path.read_text() != content]
        require(not drift, "Generated superseded-version index drift: " + ", ".join(drift))
    print(json.dumps({"legacyVersions": output["summary"]["retainedLegacyConversionVersions"],
                      "currentCandidates": output["summary"]["currentCandidatesReferenced"],
                      "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
