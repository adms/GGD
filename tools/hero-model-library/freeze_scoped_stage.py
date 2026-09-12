#!/usr/bin/env python3
"""Freeze one local conversion or analysis stage as a deterministic scoped TAR."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re
import tarfile


BUCKET = "ggd-390630837668-ap-east-2-an"


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def freeze(source: Path, output: Path, source_id: str, snapshot_scope: str) -> dict:
    source, output = source.resolve(), output.resolve()
    if not source.is_dir() or source.is_symlink():
        raise ValueError("Source stage must be an ordinary directory")
    if not re.fullmatch(r"[A-Za-z0-9._-]+", source_id):
        raise ValueError("Invalid scoped source ID")
    if output.exists() or output.is_symlink():
        raise ValueError("Preserve existing scoped backup directory: " + str(output))
    paths = sorted(source.rglob("*"))
    links = [path for path in paths if path.is_symlink()]
    if links:
        raise ValueError("Scoped stage contains a symlink: " + str(links[0]))
    files = [path for path in paths if path.is_file()]
    if not files:
        raise ValueError("Scoped stage has no ordinary files")

    output.mkdir(parents=True)
    archive_path = output / "source.tar.gz"
    manifest_path = output / "scoped-manifest.json"
    rows = []
    with archive_path.open("xb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=1) as compressed:
            with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.PAX_FORMAT) as archive:
                for path in files:
                    relative = path.relative_to(source).as_posix()
                    info = archive.gettarinfo(str(path), arcname=relative)
                    info.mode = 0o644
                    info.uid = info.gid = 0
                    info.uname = info.gname = ""
                    info.mtime = 0
                    with path.open("rb") as stream:
                        archive.addfile(info, stream)
                    rows.append({"path": relative, "bytes": path.stat().st_size, "sha256": sha(path)})

    archive_sha = sha(archive_path)
    manifest = {
        "schema": "ggd-deterministic-scoped-stage@1",
        "sourceId": source_id,
        "sourceRoot": str(source),
        "absoluteLocalArchive": str(archive_path),
        "archiveFormat": "tar-gzip",
        "archiveMemberRoot": "",
        "bytes": archive_path.stat().st_size,
        "sha256": archive_sha,
        "fileCount": len(rows),
        "uncompressedFileBytes": sum(row["bytes"] for row in rows),
        "files": rows,
        "plannedS3Uri": f"s3://{BUCKET}/legacy/public-model-sources/{source_id}/{archive_sha}.tar.gz",
        "localPreserved": True,
        "snapshotScope": snapshot_scope,
        "deterministicParameters": {
            "tarFormat": "PAX",
            "memberOrder": "lexicographic POSIX path",
            "mode": "0644",
            "uid": 0,
            "gid": 0,
            "mtime": 0,
            "uname": "",
            "gname": "",
            "gzipMtime": 0,
            "gzipFilename": "",
            "gzipCompressLevel": 1,
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--snapshot-scope", required=True)
    args = parser.parse_args()
    manifest = freeze(args.source, args.output, args.source_id, args.snapshot_scope)
    print(json.dumps({key: manifest[key] for key in
                      ["sourceId", "fileCount", "bytes", "sha256", "plannedS3Uri"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
