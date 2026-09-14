#!/usr/bin/env python3
"""Freeze JUMP FORCE Dai config-path and existing decoded-audio evidence.

This audit deliberately keeps three states separate:

* a path selected from the encrypted Steam PAK index;
* a package that exists in the frozen Steam extraction;
* a decoded OGG supplied by the already archived public audio source.

The public OGGs are related evidence, not a second acquisition from the Steam
containers.  Language, speaker and transcript claims remain unreviewed.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
from typing import Iterable


SOURCE_ID = "steam-jump-force-priority-original-assets-build-8523149"
AUDIO_SOURCE_ID = "parallel-ps-jumpforce-audio"
AUDIO_GROUP_ID = f"{AUDIO_SOURCE_ID}:JForce_Dai"
NATIVE_CHARACTER_ID = "chr0430"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl_gz(path: Path) -> list[dict[str, object]]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl_gz(path: Path, rows: Iterable[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as text:
                for row in rows:
                    text.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


def frozen_native_paths(files_index: Path) -> set[str]:
    paths: set[str] = set()
    for row in read_jsonl_gz(files_index):
        if row.get("role") != "native-package":
            continue
        paths.add(str(row["path"]).replace("\\", "/"))
    return paths


def build_config_index(full_pak_index: Path, pak_summary: Path, files_index: Path) -> dict[str, object]:
    container_origins = {
        row["name"]: row["originPath"]
        for row in read_json(pak_summary)["containers"]  # type: ignore[index]
    }
    frozen = frozen_native_paths(files_index)
    relations = []
    for row in read_jsonl_gz(full_pak_index):
        if NATIVE_CHARACTER_ID not in row.get("nativeCharacterIds", []):
            continue
        if not str(row.get("path", "")).startswith("JUMP_FORCE/Content/Game/"):
            continue
        relations.append(row)

    selected = sorted(
        (row for row in relations if row.get("selectedByPatchOrder") is True),
        key=lambda row: str(row["path"]),
    )
    selected_rows = []
    for row in selected:
        package_relative = str(row["path"]).removeprefix("JUMP_FORCE/Content/")
        selected_rows.append({
            "path": row["path"],
            "packageRelativePath": package_relative,
            "sourceKind": row["sourceKind"],
            "container": row["container"],
            "containerOriginPath": container_origins[row["container"]],
            "containerSha256": row["containerSha256"],
            "existsInFrozenExtraction": package_relative in frozen,
            "extractionState": "extracted" if package_relative in frozen else "indexed-only-pending-extraction",
        })

    unique_paths = {str(row["path"]) for row in relations}
    package_stems = {str(Path(str(row["path"])).with_suffix("")) for row in selected}
    kind_counts: dict[str, int] = {}
    for row in selected:
        key = str(row["sourceKind"])
        kind_counts[key] = kind_counts.get(key, 0) + 1
    extracted_count = sum(bool(row["existsInFrozenExtraction"]) for row in selected_rows)
    return {
        "schema": "ggd-jump-force-dai-game-config-index@1",
        "sourceId": SOURCE_ID,
        "sourceGame": "JUMP FORCE",
        "platform": "Windows (Steam)",
        "nativeCharacterId": NATIVE_CHARACTER_ID,
        "characterNameZh": "小呆／達伊",
        "heroIds": ["godie-nbbc", "godie-n01c"],
        "inputs": {
            "fullPakIndex": {"path": str(full_pak_index.resolve()), "sha256": sha256(full_pak_index)},
            "pakSummary": {"path": str(pak_summary.resolve()), "sha256": sha256(pak_summary)},
            "frozenExtractionIndex": {"path": str(files_index.resolve()), "sha256": sha256(files_index)},
        },
        "counts": {
            "allPatchRelations": len(relations),
            "allPatchUniquePaths": len(unique_paths),
            "selectedPaths": len(selected_rows),
            "selectedPackageStems": len(package_stems),
            "selectedSourceKindCounts": dict(sorted(kind_counts.items())),
            "selectedPathsPresentInFrozenExtraction": extracted_count,
            "selectedPathsPendingExtraction": len(selected_rows) - extracted_count,
        },
        "states": {
            "pathsIndexed": True,
            "packagesExtracted": extracted_count == len(selected_rows),
            "packagesParsed": False,
            "animationReferencesResolved": False,
            "registered": False,
        },
        "files": selected_rows,
        "gaps": [
            "The selected Game configuration packages are indexed in the encrypted PAKs but absent from the frozen extraction.",
            "The packages cannot be parsed for referenced AnimSequence assets until they are extracted with the approved AES-key workflow.",
        ],
    }


def build_audio_evidence(
    workspace: Path,
    source_index_path: Path,
    voice_index_path: Path,
    voice_files_path: Path,
) -> tuple[dict[str, object], list[dict[str, object]]]:
    sources = read_json(source_index_path)
    source = next(row for row in sources["publicSources"] if row["id"] == AUDIO_SOURCE_ID)  # type: ignore[index]
    audio_root = (workspace.parent / source["localPath"]).resolve()
    validation_path = audio_root / "audio-validation.json"
    validation = read_json(validation_path)
    source_rows = [
        row for row in validation["files"]  # type: ignore[index]
        if str(row["path"]).startswith("extracted/JForce_Dai/")
    ]
    voice_index = read_json(voice_index_path)
    group = next(row for row in voice_index["groups"] if row["id"] == AUDIO_GROUP_ID)  # type: ignore[index]
    central_rows = [row for row in read_jsonl_gz(voice_files_path) if row.get("groupId") == AUDIO_GROUP_ID]
    central_by_path = {str(row["path"]): row for row in central_rows}

    frozen = []
    errors = []
    for row in sorted(source_rows, key=lambda item: str(item["path"])):
        path = audio_root / str(row["path"])
        relative_workspace_path = path.relative_to(workspace.parent).as_posix()
        central = central_by_path.get(relative_workspace_path)
        actual_sha = sha256(path) if path.is_file() else None
        expected_category = "sound-effect" if "/chr0430_ActSE/" in str(row["path"]) else "voice-source-label-unreviewed"
        checks = {
            "existsLocal": path.is_file(),
            "bytesMatch": path.is_file() and path.stat().st_size == row["bytes"],
            "sha256Match": actual_sha == row["sha256"],
            "decodedWithoutErrors": row.get("decodedWithoutErrors") is True,
            "centralRowPresent": central is not None,
            "centralMetadataMatch": central is not None and all([
                central.get("bytes") == row["bytes"],
                central.get("sha256") == row["sha256"],
                abs(float(central.get("seconds", -1)) - float(row["seconds"])) < 0.000001,
                central.get("category") == expected_category,
            ]),
        }
        if not all(checks.values()):
            errors.append({"path": str(path), "checks": checks})
        frozen.append({
            "path": relative_workspace_path,
            "absolutePath": str(path),
            "archiveMember": row["path"],
            "bytes": row["bytes"],
            "sha256": row["sha256"],
            "seconds": row["seconds"],
            "sourceFolderClass": "ActSE" if expected_category == "sound-effect" else "ActVoice",
            "category": expected_category,
            "languageReviewed": False,
            "speakerReviewed": False,
            "transcriptReviewed": False,
            "synthesisReady": False,
            "checks": checks,
        })

    category_counts: dict[str, int] = {}
    category_seconds: dict[str, float] = {}
    for row in frozen:
        category = str(row["category"])
        category_counts[category] = category_counts.get(category, 0) + 1
        category_seconds[category] = category_seconds.get(category, 0.0) + float(row["seconds"])
    summary = {
        "schema": "ggd-jump-force-dai-existing-audio-audit@1",
        "steamSourceId": SOURCE_ID,
        "relatedAudioSourceId": AUDIO_SOURCE_ID,
        "groupId": AUDIO_GROUP_ID,
        "characterNameZh": "小呆／達伊",
        "nativeCharacterId": NATIVE_CHARACTER_ID,
        "heroIds": group["heroIds"],
        "relatedFormHeroIdsPendingReview": [hero_id for hero_id in ["godie-nbbc", "godie-n01c"] if hero_id not in group["heroIds"]],
        "inputs": {
            "audioValidation": {"path": str(validation_path), "sha256": sha256(validation_path)},
            "voiceIndex": {"path": str(voice_index_path.resolve()), "sha256": sha256(voice_index_path)},
            "voiceFiles": {"path": str(voice_files_path.resolve()), "sha256": sha256(voice_files_path)},
        },
        "counts": {
            "files": len(frozen),
            "bytes": sum(int(row["bytes"]) for row in frozen),
            "seconds": sum(float(row["seconds"]) for row in frozen),
            "categoryCounts": dict(sorted(category_counts.items())),
            "categorySeconds": {key: category_seconds[key] for key in sorted(category_seconds)},
            "errors": len(errors),
        },
        "checks": {
            "expectedFileCount": len(frozen) == 261,
            "centralGroupFileCountMatch": group["fileCount"] == len(frozen),
            "centralFileRowsMatch": len(central_rows) == len(frozen),
            "allLocalFilesRehashed": not errors,
            "allDecodeFlagsPass": all(row["checks"]["decodedWithoutErrors"] for row in frozen),
        },
        "classification": {
            "basis": "source folder labels only: chr0430_ActVoice versus chr0430_ActSE",
            "languageReviewed": False,
            "speakerReviewed": False,
            "transcriptReviewed": False,
            "synthesisReady": False,
            "note": "ActVoice is retained as an unreviewed source label; it is not proof that every clip is Dai speech or Japanese.",
        },
        "errors": errors,
    }
    if not all(summary["checks"].values()):
        raise ValueError(f"Dai audio verification failed: {json.dumps(summary['checks'], sort_keys=True)}")
    return summary, frozen


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--local-extraction-root", type=Path, required=True)
    parser.add_argument("--full-pak-index", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    local_root = args.local_extraction_root.resolve()
    output_dir = args.output_dir.resolve()
    config = build_config_index(
        args.full_pak_index.resolve(),
        workspace / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json",
        local_root / "files.jsonl.gz",
    )
    audio_summary, audio_files = build_audio_evidence(
        workspace,
        workspace / "materials/hero-model-library/download-sources.json",
        workspace / "materials/hero-model-library/voice-index.json",
        workspace / "materials/hero-model-library/voice-files.jsonl.gz",
    )
    outputs = {
        "game-config-index.json": config,
        "audio-summary.json": audio_summary,
    }
    audio_path = output_dir / "audio-file-index.jsonl.gz"
    if args.check:
        for name, value in outputs.items():
            path = output_dir / name
            if not path.is_file() or read_json(path) != value:
                raise ValueError(f"stale evidence: {path}")
        expected_bytes = io.BytesIO()
        with gzip.GzipFile(filename="", fileobj=expected_bytes, mode="wb", mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as text:
                for row in audio_files:
                    text.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
        if not audio_path.is_file() or audio_path.read_bytes() != expected_bytes.getvalue():
            raise ValueError(f"stale evidence: {audio_path}")
        print(json.dumps({"check": "ok", "configPaths": config["counts"]["selectedPaths"], "audioFiles": len(audio_files)}, ensure_ascii=False))
        return 0
    for name, value in outputs.items():
        write_json(output_dir / name, value)
    write_jsonl_gz(audio_path, audio_files)
    print(json.dumps({
        "outputDir": str(output_dir),
        "configPaths": config["counts"]["selectedPaths"],
        "configPathsPendingExtraction": config["counts"]["selectedPathsPendingExtraction"],
        "audioFiles": len(audio_files),
        "audioBytes": audio_summary["counts"]["bytes"],
        "audioSeconds": audio_summary["counts"]["seconds"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"error: {error}")
        raise SystemExit(1)
