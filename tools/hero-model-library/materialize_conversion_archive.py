#!/usr/bin/env python3
"""Create a portable conversion archive input without following arbitrary symlinks.

Regular files are copied as-is.  A symlink is never followed recursively: each must
be explicitly declared with an in-root target directory and an exact allowlisted
set of regular files that is copied to a separate materialized directory.
"""
from __future__ import annotations
import argparse, hashlib, json, shutil
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--link", action="append", default=[],
                        help="relative symlink path to materialize; currently requires visual-v3/candidate")
    args = parser.parse_args()
    source, destination = args.source.resolve(), args.destination.resolve()
    if not source.is_dir():
        raise SystemExit(f"Source is not a directory: {source}")
    if destination.exists():
        raise SystemExit(f"Destination already exists; preserve it: {destination}")
    if destination.is_relative_to(source):
        raise SystemExit("Destination must not be inside source")

    links = sorted(path for path in source.rglob("*") if path.is_symlink())
    supplied = sorted(Path(item).as_posix() for item in args.link)
    found = [path.relative_to(source).as_posix() for path in links]
    if supplied != found:
        raise SystemExit("Every symlink must be explicitly named exactly once: found=" + repr(found) + " supplied=" + repr(supplied))

    destination.mkdir(parents=True)
    copied = []
    for path in sorted(source.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        relative = path.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        copied.append({"path": relative.as_posix(), "bytes": target.stat().st_size, "sha256": sha256(target), "kind": "regular"})

    materialized = []
    for link in links:
        relative = link.relative_to(source).as_posix()
        target = link.resolve(strict=True)
        if not target.is_dir() or not within(target, source):
            raise SystemExit("Symlink target is not an in-root directory: " + relative + " -> " + str(target))
        target_files = sorted(path for path in target.iterdir() if path.is_file() and not path.is_symlink())
        if len(target_files) != len(list(target.iterdir())):
            raise SystemExit("Materialized target contains a directory or symlink: " + str(target))
        # A distinct directory makes the archive's contents explicit and prevents
        # a consumer from treating it as a real link.
        materialized_relative = Path(relative + "-materialized")
        rows = []
        for file_path in target_files:
            out = destination / materialized_relative / file_path.name
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file_path, out)
            row = {"path": (materialized_relative / file_path.name).as_posix(), "bytes": out.stat().st_size, "sha256": sha256(out), "kind": "materialized-symlink-member"}
            copied.append(row)
            rows.append(row)
        materialized.append({"linkPath": relative, "linkTarget": str(target.relative_to(source)), "materializedPath": materialized_relative.as_posix(), "files": rows})

    if any(path.is_symlink() for path in destination.rglob("*")):
        raise SystemExit("Unexpected symlink in destination")
    receipt = {"schema": "ggd.materialized-conversion-archive@1", "source": str(source), "destination": str(destination), "symlinksMaterialized": materialized, "files": sorted(copied, key=lambda row: row["path"])}
    (destination / "symlinks-materialized.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"source": str(source), "destination": str(destination), "regularFiles": len([row for row in copied if row["kind"] == "regular"]), "materializedFiles": len([row for row in copied if row["kind"] != "regular"]), "symlinks": materialized}, ensure_ascii=False))

if __name__ == "__main__":
    main()
