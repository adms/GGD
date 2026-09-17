#!/usr/bin/env python3
"""Restore the immutable hero-74 S3 archive into a fresh directory."""

from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import shutil
import tarfile
import tempfile
from pathlib import Path

from verify import (
    ArchiveMetadata,
    digest_file,
    load_metadata,
    require_absolute_outside_git,
    safe_relative,
    verify_parts,
    verify_restored,
)


class JoinedParts(io.RawIOBase):
    def __init__(self, paths: list[Path]):
        self._paths = iter(paths)
        self._current = None

    def readable(self) -> bool:
        return True

    def readinto(self, buffer) -> int:
        while True:
            if self._current is None:
                path = next(self._paths, None)
                if path is None:
                    return 0
                self._current = path.open("rb")
            count = self._current.readinto(buffer)
            if count:
                return count
            self._current.close()
            self._current = None

    def close(self) -> None:
        if self._current is not None:
            self._current.close()
        super().close()


def _write_member(archive: tarfile.TarFile, item: tarfile.TarInfo, metadata: ArchiveMetadata, root: Path, seen: set[str]) -> None:
    name = safe_relative(item.name).as_posix()
    if name not in metadata.files or name in seen:
        raise ValueError(f"Unexpected or duplicate archive member: {name}")
    row = metadata.files[name]
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if item.islnk():
        link_name = safe_relative(item.linkname).as_posix()
        if link_name not in seen or metadata.files[link_name]["sha256"] != row["sha256"]:
            raise ValueError(f"Unverified hardlink: {name}")
        shutil.copyfile(root / link_name, target)
    elif item.isfile():
        if item.size != row["bytes"]:
            raise ValueError(f"Unexpected archive member size: {name}")
        source = archive.extractfile(item)
        if source is None:
            raise ValueError(f"Archive member has no bytes: {name}")
        with source, target.open("xb") as stream:
            shutil.copyfileobj(source, stream)
    else:
        raise ValueError(f"Archive contains a non-file member: {name}")
    if target.stat().st_size != row["bytes"] or digest_file(target) != row["sha256"]:
        raise ValueError(f"Restored bytes differ: {name}")
    os.chmod(target, row["mode"] & 0o777)
    seen.add(name)


def restore_archive(manifest_dir: Path, parts_dir: Path, output: Path) -> dict:
    metadata = load_metadata(manifest_dir)
    parts_dir = require_absolute_outside_git(parts_dir, "Part cache")
    output = require_absolute_outside_git(output, "Output directory")
    if output.exists() or output.is_symlink():
        raise ValueError("Output directory must not already exist")
    verify_parts(metadata, parts_dir)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f"{output.name}.restore.", dir=output.parent))
    try:
        part_paths = [parts_dir / row["path"] for row in metadata.parts]
        seen: set[str] = set()
        with io.BufferedReader(JoinedParts(part_paths)) as joined:
            with gzip.GzipFile(fileobj=joined) as unzipped:
                with tarfile.open(fileobj=unzipped, mode="r|") as archive:
                    for item in archive:
                        _write_member(archive, item, metadata, temporary, seen)
        missing = set(metadata.files) - seen
        if missing:
            raise ValueError(f"Archive is incomplete; first missing path: {sorted(missing)[0]}")
        verify_restored(metadata, temporary)
        os.replace(temporary, output)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return {
        "manifestSha256": metadata.manifest_sha256,
        "restoredFiles": len(metadata.files),
        "verifiedParts": len(metadata.parts),
        "output": str(output),
        "acceptance": "material-delivery-only; not hero runtime or model quality",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest-dir", type=Path)
    parser.add_argument("--parts-dir", type=Path, required=True, help="Absolute cache outside every Git worktree")
    parser.add_argument("--output", type=Path, required=True, help="New absolute output path outside every Git worktree")
    parser.add_argument("--download", action="store_true", help="Read immutable objects from the committed S3 location")
    args = parser.parse_args()
    manifest_dir = args.manifest_dir or Path(__file__).resolve().parents[2] / "docs/_reports/hero74-handoff/archive"
    if args.download:
        from s3_transport import fetch_parts

        fetch_parts(manifest_dir, args.parts_dir)
    print(json.dumps(restore_archive(manifest_dir, args.parts_dir, args.output), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
