#!/usr/bin/env python3
"""Freeze exact project-seven event inputs, reports, tools and offline wheels."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path


EXPECTED = ["Karthus", "LeeSin", "Lux", "MissFortune", "Warwick", "Xerath", "Yasuo"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def copy_file(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    if sha256(source) != sha256(destination):
        raise ValueError(f"Copied file differs: {source}")


def inventory(root: Path, excluded: set[str] | None = None) -> list[dict]:
    rows = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Symlink is not a frozen file: {path}")
        if not path.is_file() or path.relative_to(root).as_posix() in (excluded or set()):
            continue
        rows.append({
            "path": path.relative_to(root).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--metadata-root", type=Path, required=True)
    parser.add_argument("--previous-bundle", type=Path, required=True)
    parser.add_argument("--wheelhouse", type=Path, required=True)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source_root = args.source_root.resolve()
    metadata_root = args.metadata_root.resolve()
    previous = args.previous_bundle.resolve()
    wheelhouse = args.wheelhouse.resolve()
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Refusing to overwrite non-empty frozen output: {output}")
    output.mkdir(parents=True, exist_ok=True)

    reports = []
    receipt_paths: set[Path] = set()
    chunk_ids: set[str] = set()
    for native_id in EXPECTED:
        report_path = metadata_root / "event-bindings" / f"{native_id.casefold()}-base.json"
        report = json.loads(report_path.read_text())
        validation = report["validation"]
        if (report.get("schema") != "ggd-lol-native-event-bindings@1"
                or report.get("nativeId") != native_id or report.get("skinId") != "skin0"
                or validation.get("eventBindingsVerified") is not True
                or validation.get("speakerVerified") is not False
                or validation.get("perClipLanguageVerified") is not False):
            raise ValueError(f"Unexpected event report state: {report_path}")
        copy_file(report_path, output / "git" / "event-bindings" / report_path.name)
        bin_path = Path(report["inputs"]["bin"]["path"])
        if sha256(bin_path) != report["inputs"]["bin"]["sha256"]:
            raise ValueError(f"BIN changed: {bin_path}")
        copy_file(bin_path, output / "official" / "event-metadata" / native_id / "skin0.bin")
        receipt_path = Path(report["inputs"]["metadataReceipt"]["path"])
        if sha256(receipt_path) != report["inputs"]["metadataReceipt"]["sha256"]:
            raise ValueError(f"Metadata receipt changed: {receipt_path}")
        receipt_paths.add(receipt_path)
        reports.append({
            "nativeId": native_id,
            "heroId": report["heroId"],
            "path": f"git/event-bindings/{report_path.name}",
            "sha256": sha256(report_path),
            "mappedEvents": validation["mappedEvents"],
            "mappedWemIds": validation["mappedWemIds"],
        })

    for receipt_path in sorted(receipt_paths):
        receipt = json.loads(receipt_path.read_text())
        copy_file(receipt_path, output / "official" / "receipts" / receipt_path.name)
        for result in receipt["results"]:
            for entry in result["entries"]:
                chunk_ids.update(entry["sourceChunks"])

    for chunk_id in sorted(chunk_ids):
        receipt_path = source_root / "receipts" / "shared-event-metadata" / "chunks" / f"{chunk_id}.json"
        receipt = json.loads(receipt_path.read_text())
        if receipt.get("verified") is not True:
            raise ValueError(f"Unverified official chunk: {chunk_id}")
        chunk_path = Path(receipt["path"])
        if sha256(chunk_path) != receipt["sha256"] or chunk_path.stat().st_size != receipt["compressedBytes"]:
            raise ValueError(f"Official chunk changed: {chunk_id}")
        copy_file(receipt_path, output / "official" / "chunk-receipts" / receipt_path.name)
        copy_file(chunk_path, output / "official" / "compressed-chunks" / chunk_path.parent.name / chunk_path.name)
        for headers in sorted(chunk_path.parent.glob(chunk_path.stem + ".attempt*.headers.txt")):
            copy_file(headers, output / "official" / "http-headers" / chunk_path.parent.name / headers.name)

    for relative in [
        "control/allowlist.json",
        "control/shared-event-metadata.json",
        "README.md",
        "tools/acquire_shared_event_metadata.py",
        "tools/build_event_bindings.py",
        "tools/bundle_event_bindings.py",
        "tools/make_seven_handoff.py",
        "tools/sync_event_binding_evidence.py",
        "tools/test_acquire_shared_event_metadata.py",
        "tools/test_build_event_bindings.py",
    ]:
        copy_file(metadata_root / relative, output / "git" / relative)
    copy_file(source_root / "sources" / "7CAC3C60C863BF12.manifest", output / "official" / "sources" / "7CAC3C60C863BF12.manifest")
    copy_file(source_root / "sources" / "ja_JP-character-wads.json", output / "official" / "sources" / "ja_JP-character-wads.json")

    league_source = previous / "toolchains" / "league-tools"
    for relative in ["LICENSE", "README.md", "pyproject.toml"]:
        copy_file(league_source / relative, output / "toolchains" / "league-tools" / relative)
    for path in sorted((league_source / "src").rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            copy_file(path, output / "toolchains" / "league-tools" / path.relative_to(league_source))
    for path in sorted(wheelhouse.glob("*")):
        if path.is_file():
            copy_file(path, output / "toolchains" / "league-tools-wheels" / path.name)

    primary_audio_backup = {
        "s3Uri": "s3://ggd-390630837668-ap-east-2-an/legacy/public-model-sources/lol-project-seven-ja-jp-16.18.8159717/8840cff37666cb35ed04901be412d5b1c4836ded23993a16168e79ce1066d5fc.tar.gz",
        "sha256": "8840cff37666cb35ed04901be412d5b1c4836ded23993a16168e79ce1066d5fc",
        "fullGetVerified": True,
        "allArchiveMembersSha256Verified": True,
    }
    previous_toolchain_backup = {
        "s3Uri": "s3://ggd-390630837668-ap-east-2-an/legacy/public-model-sources/lol-project-seven-ja-jp-16.18.8159717-event-bindings-karthus-base-v1/1bdd86a05cda1fba64a5e0c44edf2c871064aa1ae4e91df2205354f0c3754426.tar.gz",
        "sha256": "1bdd86a05cda1fba64a5e0c44edf2c871064aa1ae4e91df2205354f0c3754426",
        "contains": ["CDTB 1.3.0 site-packages", "league-tools commit 913150dd922e69b18aba519410670fcf017df2ff"],
        "fullGetVerified": True,
        "allArchiveMembersSha256Verified": True,
    }
    metadata = {
        "schema": "ggd-lol-project-seven-base-event-bundle@1",
        "sourceId": args.bundle_id,
        "scope": {"nativeIds": EXPECTED, "skins": ["skin0"], "fullRoster": False, "completeSharedWads": False},
        "reports": reports,
        "totals": {
            "reports": len(reports),
            "mappedEvents": sum(row["mappedEvents"] for row in reports),
            "mappedWemIds": sum(row["mappedWemIds"] for row in reports),
            "officialCompressedChunks": len(chunk_ids),
            "officialDecodedBins": len(reports),
        },
        "toolchain": {
            "python": "3.10 x86_64",
            "leagueToolsCommit": "913150dd922e69b18aba519410670fcf017df2ff",
            "offlineWheelsIncluded": True,
            "cdtbVersion": "1.3.0",
            "previousVerifiedToolchainBackup": previous_toolchain_backup,
        },
        "primaryAudioBackup": primary_audio_backup,
        "claimBoundary": "Seven base skin0 native event graphs only. Speaker, per-clip language, transcript, GGD skill binding, other skins, backend playback and deployment remain pending.",
    }
    (output / "bundle-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    rows = inventory(output, {"files-sha256.json"})
    (output / "files-sha256.json").write_text(json.dumps({
        "schema": "ggd-file-manifest@1",
        "files": rows,
        "fileCount": len(rows),
        "bytes": sum(row["bytes"] for row in rows),
    }, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "output": str(output),
        "files": len(rows) + 1,
        "bytes": sum(row["bytes"] for row in rows) + (output / "files-sha256.json").stat().st_size,
        "mappedEvents": metadata["totals"]["mappedEvents"],
        "mappedWemIds": metadata["totals"]["mappedWemIds"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
