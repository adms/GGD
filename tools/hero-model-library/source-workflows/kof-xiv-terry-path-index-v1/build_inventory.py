#!/usr/bin/env python3
"""Freeze the KOF XIV Terry (TRY) WAD paths without claiming payload access."""

from __future__ import annotations

import argparse
from collections import Counter
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re


REPO = Path(__file__).resolve().parents[4]
SOURCE_ID = "steam-kofxiv-terry-path-index-v1"
NATIVE_ID = "TRY"
CROSS_SOURCE_BACKLOG_ID = "ssbu-dolly"
CROSS_SOURCE_NAME = "Terry Bogard"
CROSS_SOURCE_DISPLAY_NAME = "泰利·柏格（Terry Bogard）"
EXPECTED_LISTING_BYTES = 3_073_359
EXPECTED_LISTING_SHA256 = "193ee8cb49ca7f7bea7ecafa9c6bca531c220725dcb2ac40f9671ff0b632ed97"
EXPECTED_ROWS = 375
EXPECTED_LISTED_BYTES = 239_511_922
ROW_RE = re.compile(r"^  ([0-9a-fA-F]{16}) +(\d+) +(Chara/TRY/.*)$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def row_evidence_sha256(offset: int, size: int, path: str) -> str:
    """Hash listing metadata only; this is deliberately not a payload hash."""
    value = f"{offset:016x}\t{size}\t{path}\n".encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def classify(path: str) -> tuple[str, str]:
    posix = PurePosixPath(path)
    suffix = posix.suffix.lower()
    if "Effect" in posix.parts:
        if suffix == ".obac":
            return "vfx", "native-effect-mesh-container"
        if suffix in {".dds", ".png"}:
            return "vfx", "native-effect-texture"
        return "vfx", "native-effect-record-or-dependency"
    if path == "Chara/TRY/TRY.obac":
        return "model", "character-body-container"
    if path == "Chara/TRY/P01_CAP.obac":
        return "model", "character-accessory-container"
    if suffix in {".omir", ".osec"}:
        return "skeleton", "native-rig-or-skin-metadata"
    if suffix == ".otra":
        return "animation", "native-animation-container"
    if suffix in {".dds", ".png"}:
        return "texture", "character-material-texture"
    if suffix == ".ogg":
        if "/Sound/voice/" in path:
            return "voice", "native-character-directory-voice-pending-listening-review"
        if "/Sound/se/" in path:
            return "sound-effect", "native-character-directory-sfx-pending-listening-review"
        return "audio", "native-character-directory-audio-pending-listening-review"
    if suffix in {".sbnk", ".sgrp", ".slst"}:
        return "audio-metadata", "native-audio-bank-metadata"
    if suffix in {".eff", ".ceff", ".leff", ".frag", ".vert"}:
        return "vfx", "native-effect-record-or-dependency"
    return "configuration", "native-gameplay-or-material-configuration"


def parse_listing(text: str) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for line in text.splitlines():
        match = ROW_RE.match(line)
        if not match:
            continue
        path = match.group(3)
        posix = PurePosixPath(path)
        if posix.is_absolute() or ".." in posix.parts:
            raise ValueError("unsafe WAD listing path: " + path)
        offset = int(match.group(1), 16)
        size = int(match.group(2))
        kind, role = classify(path)
        rows.append({
            "path": path,
            "offset": offset,
            "listedBytes": size,
            "assetKind": kind,
            "resourceRole": role,
            "nativeCharacterId": NATIVE_ID,
            "payloadPresent": False,
            "payloadSha256State": "unavailable-until-source-remount-and-extraction",
            "indexEvidenceSha256": row_evidence_sha256(offset, size, path),
        })
    return sorted(rows, key=lambda row: str(row["path"]))


def write_jsonl_gzip(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as text:
                for row in rows:
                    text.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def build(listing_path: Path) -> tuple[dict[str, object], list[dict[str, object]]]:
    if listing_path.stat().st_size != EXPECTED_LISTING_BYTES or sha256(listing_path) != EXPECTED_LISTING_SHA256:
        raise ValueError("KOF XIV cached WAD listing differs from pinned evidence")
    rows = parse_listing(listing_path.read_text(encoding="utf-8", errors="strict"))
    if len(rows) != EXPECTED_ROWS or sum(int(row["listedBytes"]) for row in rows) != EXPECTED_LISTED_BYTES:
        raise ValueError("KOF XIV TRY listing scope changed")

    counts = Counter(str(row["assetKind"]) for row in rows)
    expected_counts = {
        "animation": 3,
        "audio-metadata": 7,
        "configuration": 22,
        "model": 2,
        "skeleton": 3,
        "sound-effect": 37,
        "texture": 92,
        "vfx": 87,
        "voice": 122,
    }
    if dict(sorted(counts.items())) != expected_counts:
        raise ValueError(f"KOF XIV TRY asset classification changed: {dict(counts)}")

    vfx_effects = [
        {
            "path": row["path"],
            "sourceLabel": PurePosixPath(str(row["path"])).stem,
            "listedBytes": row["listedBytes"],
            "ownerDecision": "pending",
            "runtimeBindingAllowed": False,
        }
        for row in rows
        if str(row["path"]).startswith("Chara/TRY/Effect/") and PurePosixPath(str(row["path"])).suffix.lower() == ".eff"
    ]
    inventory: dict[str, object] = {
        "schema": "ggd.kofxiv-terry-path-index@1",
        "sourceId": SOURCE_ID,
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "platform": "Windows (Steam, Release 1.26 authority from the parent source record)",
        "character": {
            "nameZh": "泰利·柏格",
            "originalName": "Terry Bogard",
            "nativeCharacterId": NATIVE_ID,
            "heroIds": [],
            "identityState": "high-confidence-native-token-crosswalk-pending-payload-visual-review",
            "identityEvidence": {
                "nativeToken": "TRY",
                "nativeRootBodyPath": "Chara/TRY/TRY.obac",
                "nativeVoiceFilenameToken": "v_006_try_",
                "existingCrossSourceBacklogId": CROSS_SOURCE_BACKLOG_ID,
                "existingCrossSourceName": CROSS_SOURCE_NAME,
                "existingCrossSourceDisplayName": CROSS_SOURCE_DISPLAY_NAME,
                "authority": "frozen-generator-constant-crosswalk",
                "authorityGitPath": str(Path(__file__).resolve().relative_to(REPO)),
                "authoritySha256": sha256(Path(__file__).resolve()),
                "caveat": "The token/name crosswalk is strong path evidence; KOF XIV body payload and visual identity are not re-opened in this run.",
            },
        },
        "listing": {
            "absolutePath": str(listing_path.resolve()),
            "bytes": listing_path.stat().st_size,
            "sha256": sha256(listing_path),
            "rowCount": len(rows),
            "listedPayloadBytes": sum(int(row["listedBytes"]) for row in rows),
        },
        "summary": {
            "pathIndexedFiles": len(rows),
            "pathIndexedBytes": sum(int(row["listedBytes"]) for row in rows),
            "assetKindCounts": expected_counts,
            "characterBodyContainers": 1,
            "accessoryModelContainers": 1,
            "nativeAnimationContainers": counts["animation"],
            "nativeEffectReviewLabels": len(vfx_effects),
            "audioPathsPendingListeningReview": counts["voice"] + counts["sound-effect"],
            "payloadFilesReadThisRun": 0,
            "payloadFilesSha256Verified": 0,
            "convertedFiles": 0,
            "runtimeBindings": 0,
            "backendOptions": 0,
            "productionDeployments": 0,
        },
        "conversionCandidates": {
            "model": [row["path"] for row in rows if row["assetKind"] == "model"],
            "skeleton": [row["path"] for row in rows if row["assetKind"] == "skeleton"],
            "animation": [row["path"] for row in rows if row["assetKind"] == "animation"],
            "textures": {
                "pathCount": counts["texture"],
                "state": "path-indexed-awaiting-source-remount-and-extraction",
            },
            "vfx": {
                "pathCount": counts["vfx"],
                "effectReviewCandidates": vfx_effects,
                "state": "path-indexed-awaiting-extraction-conversion-and-owner-review",
            },
            "audio": {
                "voicePathCount": counts["voice"],
                "soundEffectPathCount": counts["sound-effect"],
                "metadataPathCount": counts["audio-metadata"],
                "state": "path-indexed-awaiting-extraction-decode-and-listening-review",
            },
        },
        "states": {
            "sourceListingFound": True,
            "sourceContainerMountedNow": False,
            "payloadAcquired": False,
            "extracted": False,
            "payloadHashed": False,
            "converted": False,
            "visuallyAccepted": False,
            "registeredAsBackendOption": False,
            "backendSelectable": False,
            "deployed": False,
        },
        "limitations": [
            "The current Mac has the complete cached WAD listing but not the mounted KOF XIV assets.wad payload.",
            "Per-row indexEvidenceSha256 hashes offset, listed byte count and path; it is not a payload SHA-256.",
            "No OBAC, OMIR, OSEC, OTRA, texture, EFF or OGG payload is extracted by this workflow yet.",
            "VFX labels and Sound/voice versus Sound/se directories are candidates only; no event, speaker, language, action semantic or runtime binding is approved.",
            "Terry has no verified GGD hero definition, so no hero ID or backend option is invented.",
        ],
    }
    return inventory, rows


def render_markdown(inventory: dict[str, object], files_sha: str) -> str:
    summary = inventory["summary"]
    counts = summary["assetKindCounts"]
    return "\n".join([
        "# KOF XIV Terry（TRY）路徑級素材索引",
        "",
        "> 本頁由 `build_inventory.py` 產生。WAD listing 是來源證據，不等於已抽出檔案；所有 runtime 綁定皆維持待審查。",
        "",
        "## 結果",
        "",
        f"- 固定 `Chara/TRY/` 路徑 {summary['pathIndexedFiles']:,} 筆，共列示 {summary['pathIndexedBytes']:,} bytes。",
        f"- 模型容器 {counts['model']}（完整身體 1、帽子配件 1）、骨架／蒙皮中繼 {counts['skeleton']}、原生動作容器 {counts['animation']}。",
        f"- 角色貼圖 {counts['texture']}、VFX 記錄／網格／貼圖 {counts['vfx']}，其中 `.eff` 可讀名稱候選 {summary['nativeEffectReviewLabels']}。",
        f"- 語音路徑 {counts['voice']}、音效路徑 {counts['sound-effect']}、音訊中繼 {counts['audio-metadata']}；實體音訊 0，聽審核准 0。",
        f"- 逐路徑索引：`files.jsonl.gz`，SHA-256 `{files_sha}`。",
        "",
        "## 狀態",
        "",
        "| found listing | mounted payload | extracted | converted | reviewed | backend option | deployed |",
        "|---:|---:|---:|---:|---:|---:|---:|",
        "| 1 | 0 | 0 | 0 | 0 | 0 | 0 |",
        "",
        "身份以 `TRY` 根目錄、`TRY.obac`、`v_006_try_` 音訊命名與現有 `ssbu-dolly` Terry 記錄交叉核對；仍須在重新掛載並抽出身體後做視覺確認。",
        "",
        "## 重建",
        "",
        "```bash",
        "python3 tools/hero-model-library/source-workflows/kof-xiv-terry-path-index-v1/build_inventory.py --workspace ..",
        "python3 tools/hero-model-library/source-workflows/kof-xiv-terry-path-index-v1/build_inventory.py --workspace .. --check",
        "```",
        "",
    ])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve()
    listing = workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-wad-inspection-v1/quickbms-list.log"
    output = repo / "materials/hero-model-library/source-inventories/kof-xiv-terry-path-index-v1"
    inventory, rows = build(listing)

    files_path = output / "files.jsonl.gz"
    inventory_path = output / "inventory.json"
    document_path = output / "README.md"
    output.mkdir(parents=True, exist_ok=True)
    temporary = output / ".files.jsonl.gz.tmp"
    write_jsonl_gzip(temporary, rows)
    inventory["filesIndex"] = {
        "gitPath": str(files_path.relative_to(repo)),
        "bytes": temporary.stat().st_size,
        "sha256": sha256(temporary),
        "rowCount": len(rows),
        "hashSemantics": "gzip contains listing metadata hashes only; no extracted payload SHA-256",
    }
    encoded_inventory = json.dumps(inventory, ensure_ascii=False, indent=2) + "\n"
    encoded_document = render_markdown(inventory, inventory["filesIndex"]["sha256"]).rstrip() + "\n"
    if args.check:
        if not files_path.is_file() or files_path.read_bytes() != temporary.read_bytes():
            raise ValueError("refresh Terry path files index")
        if inventory_path.read_text(encoding="utf-8") != encoded_inventory:
            raise ValueError("refresh Terry path inventory")
        if document_path.read_text(encoding="utf-8") != encoded_document:
            raise ValueError("refresh Terry path document")
        temporary.unlink()
    else:
        temporary.replace(files_path)
        inventory_path.write_text(encoded_inventory, encoding="utf-8")
        document_path.write_text(encoded_document, encoding="utf-8")
    print(json.dumps({"sourceId": SOURCE_ID, "paths": len(rows), "listedBytes": EXPECTED_LISTED_BYTES, "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
