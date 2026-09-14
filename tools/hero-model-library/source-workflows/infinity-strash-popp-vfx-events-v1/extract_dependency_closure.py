#!/usr/bin/env python3
"""Acquire and audit the recursive package dependency closure for Popp VFX.

This is an acquisition step. A complete result does not mean that any Niagara
system was converted, rendered, accepted, bound, selectable, or deployed.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import struct
import subprocess
from collections import deque
from pathlib import Path


SIDECARS = (".uasset", ".uexp", ".ubulk", ".uptnl")


def sha256(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def fstring(data: bytes, offset: int) -> tuple[str, int]:
    length = struct.unpack_from("<i", data, offset)[0]
    offset += 4
    if abs(length) >= 65536:
        raise ValueError("unreasonable Unreal FString length")
    if length > 0:
        value = data[offset : offset + length - 1].decode("utf-8")
        offset += length
    elif length < 0:
        width = -length * 2
        value = data[offset : offset + width - 2].decode("utf-16-le")
        offset += width
    else:
        value = ""
    return value, offset


def package_dependencies(uasset: Path) -> list[str]:
    """Read non-script FPackage imports without interpreting cooked exports."""
    data = uasset.read_bytes()
    if len(data) < 64 or struct.unpack_from("<I", data)[0] != 0x9E2A83C1:
        raise ValueError("not an Unreal package")
    if struct.unpack_from("<i", data, 4)[0] != -7 or struct.unpack_from("<i", data, 20)[0] != 0:
        raise ValueError("unsupported versioned package layout")
    _, offset = fstring(data, 28)
    offset += 4
    name_count, name_offset, _, _, _, _, import_count, import_offset, _ = struct.unpack_from("<9i", data, offset)
    names: list[str] = []
    cursor = name_offset
    for _ in range(name_count):
        value, cursor = fstring(data, cursor)
        cursor += 4
        names.append(value)

    def fname(at: int) -> str:
        index, number = struct.unpack_from("<ii", data, at)
        if not 0 <= index < len(names):
            raise ValueError("invalid name index")
        return names[index] + (f"_{number - 1}" if number else "")

    references = set()
    for index in range(import_count):
        at = import_offset + index * 28
        class_name = fname(at + 8)
        object_name = fname(at + 20)
        if class_name == "Package" and object_name.startswith("/") and not object_name.startswith("/Script/"):
            references.add(object_name)
    return sorted(references)


def mount_reference(member: str) -> str | None:
    if not member.endswith(".uasset"):
        return None
    stem = member[: -len(".uasset")]
    if stem.startswith("strash/Content/"):
        return "/Game/" + stem.removeprefix("strash/Content/")
    if stem.startswith("Engine/Content/"):
        return "/Engine/" + stem.removeprefix("Engine/Content/")
    marker = "/Content/"
    if marker in stem:
        parent, relative = stem.rsplit(marker, 1)
        mount = parent.rsplit("/", 1)[-1]
        return f"/{mount}/{relative}"
    return None


def build_package_map(members: list[str]) -> tuple[dict[str, str], dict[str, list[str]], list[dict]]:
    by_reference: dict[str, str] = {}
    collisions: list[dict] = []
    member_set = set(members)
    files_by_stem: dict[str, list[str]] = {}
    for member in members:
        if member.endswith(".uasset"):
            stem = member[: -len(".uasset")]
            related = [stem + suffix for suffix in SIDECARS if stem + suffix in member_set]
            files_by_stem[stem] = related
            reference = mount_reference(member)
            if reference:
                previous = by_reference.get(reference)
                if previous and previous != stem:
                    collisions.append({"reference": reference, "first": previous, "second": stem})
                else:
                    by_reference[reference] = stem
    return by_reference, files_by_stem, collisions


def extractor_proof(path: Path) -> dict:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def expected_pak_row(pak_manifest: dict, pak: Path) -> dict:
    rows = [row for row in pak_manifest["files"] if Path(row["path"]).name == pak.name]
    if len(rows) != 1:
        raise ValueError(f"expected one manifest row for {pak.name}, got {len(rows)}")
    return rows[0]


def load_index(repak: Path, pak: Path) -> list[str]:
    process = subprocess.run([str(repak.resolve()), "list", str(pak.resolve())], text=True, capture_output=True, check=True)
    members = [line for line in process.stdout.splitlines() if line]
    if members != sorted(members):
        raise ValueError("repak member list is not sorted as expected")
    return members


def verify_manifest(manifest: dict, output: Path, pak_row: dict, repak: Path, extractor: Path, members: list[str]) -> None:
    if manifest["sourcePak"]["sha256"] != pak_row["sha256"] or manifest["sourcePak"]["bytes"] != pak_row["bytes"]:
        raise ValueError("closure manifest PAK identity drift")
    if manifest["pakIndex"]["repak"] != extractor_proof(repak):
        raise ValueError("closure manifest Repak identity drift")
    if manifest["extractor"]["invokedBinary"] != extractor_proof(extractor):
        raise ValueError("closure manifest extractor identity drift")
    package_map, _, collisions = build_package_map(members)
    if manifest["pakIndex"]["memberCount"] != len(members) or manifest["pakIndex"]["mountedPackageCount"] != len(package_map):
        raise ValueError("closure manifest PAK index count drift")
    if manifest["pakIndex"]["mountCollisions"] != collisions:
        raise ValueError("closure manifest mount collision drift")
    for row in manifest["extractor"]["selectionManifests"]:
        path = Path(row["absolutePath"])
        expected = (output / row["path"]).resolve()
        if path.resolve() != expected or not path.is_file() or path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError(f"closure selection manifest drift: {path}")
    for row in manifest["files"]:
        path = Path(row["absolutePath"])
        expected = (output / row["path"]).resolve()
        if path.resolve() != expected or not path.is_file() or path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError(f"closure file drift: {path}")
    package_rows = {row["reference"]: row for row in manifest["packages"]}
    if len(package_rows) != len(manifest["packages"]):
        raise ValueError("duplicate package reference in closure manifest")
    for reference, row in package_rows.items():
        uasset = output / "raw" / f"{row['pakStem']}.uasset"
        if package_map.get(reference) != row["pakStem"] or package_dependencies(uasset) != row["dependencies"]:
            raise ValueError(f"closure dependency graph drift: {reference}")
    missing = {row["reference"] for row in manifest["missingReferences"]}
    discovered = set(manifest["roots"]["references"])
    discovered.update(manifest["firstLevel"]["references"])
    discovered.update(dependency for row in manifest["packages"] for dependency in row["dependencies"])
    if discovered != set(package_rows) | missing:
        raise ValueError("closure discovered reference set drift")
    if any(reference in package_map for reference in missing):
        raise ValueError("closure manifest marks a PAK-present reference missing")
    summary = manifest["summary"]
    if summary["referencesDiscovered"] != len(discovered) or summary["referencesAcquired"] != len(package_rows) or summary["referencesMissing"] != len(missing):
        raise ValueError("closure summary count drift")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--pak-source-manifest", type=Path, required=True)
    parser.add_argument("--pak", type=Path, required=True)
    parser.add_argument("--repak", type=Path, required=True)
    parser.add_argument("--extractor", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    receipt = json.loads(args.receipt.read_text())
    pak_manifest = json.loads(args.pak_source_manifest.read_text())
    pak_row = expected_pak_row(pak_manifest, args.pak)
    if args.pak.stat().st_size != pak_row["bytes"] or sha256(args.pak) != pak_row["sha256"]:
        raise ValueError("source PAK differs from verified mirror manifest")
    members = load_index(args.repak, args.pak)
    if args.check:
        manifest = json.loads((output / "source-manifest.json").read_text())
        verify_manifest(manifest, output, pak_row, args.repak, args.extractor, members)
        print(json.dumps({"status": "current", **manifest["summary"]}, ensure_ascii=False))
        return 0
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"refusing to mix with non-empty output: {output}")
    output.mkdir(parents=True, exist_ok=True)

    package_map, files_by_stem, collisions = build_package_map(members)
    roots = [row["reference"] for row in receipt["vfx"]]
    first_level_occurrences = [dep for row in receipt["vfx"] for dep in row["nonScriptPackageDependencies"]]
    first_level = sorted(set(first_level_occurrences))
    if len(roots) != 17 or len(first_level_occurrences) != 229 or len(first_level) != 138:
        raise ValueError("receipt does not retain the audited 17 roots / 229 first-level references / 138 unique references")

    queue = deque(roots + first_level)
    discovered_from: dict[str, set[str]] = {reference: {"direct-root"} for reference in roots}
    for row in receipt["vfx"]:
        for dependency in row["nonScriptPackageDependencies"]:
            discovered_from.setdefault(dependency, set()).add(row["reference"])
    processed: set[str] = set()
    acquired: dict[str, dict] = {}
    missing: dict[str, dict] = {}
    parse_failures: dict[str, str] = {}
    raw = output / "raw"
    round_number = 0
    while queue:
        round_refs = sorted({queue.popleft() for _ in range(len(queue))} - processed)
        if not round_refs:
            continue
        processed.update(round_refs)
        found: list[tuple[str, str, list[str]]] = []
        for reference in round_refs:
            stem = package_map.get(reference)
            if stem is None:
                missing[reference] = {"reference": reference, "discoveredFrom": sorted(discovered_from.get(reference, [])), "reason": "package-uasset-not-present-in-verified-pak0-index"}
                continue
            selected = files_by_stem[stem]
            found.append((reference, stem, selected))
        selected_members = sorted({member for _, _, selected in found for member in selected})
        if selected_members:
            round_number += 1
            selection = output / f"selected-paths-round-{round_number:02d}.txt"
            selection.write_text("\n".join(selected_members) + "\n")
            subprocess.run([str(args.extractor.resolve()), str(args.pak.resolve()), str(selection), str(raw)], check=True)
        for reference, stem, selected in found:
            uasset = raw / f"{stem}.uasset"
            try:
                dependencies = package_dependencies(uasset)
            except Exception as error:
                dependencies = []
                parse_failures[reference] = f"{type(error).__name__}: {error}"
            acquired[reference] = {
                "reference": reference,
                "pakStem": stem,
                "memberCount": len(selected),
                "dependencies": dependencies,
                "dependencyCount": len(dependencies),
                "discoveredFrom": sorted(discovered_from.get(reference, [])),
            }
            for dependency in dependencies:
                discovered_from.setdefault(dependency, set()).add(reference)
                if dependency not in processed:
                    queue.append(dependency)

    selected_files = sorted(path for path in raw.rglob("*") if path.is_file())
    file_rows = [
        {
            "path": path.relative_to(output).as_posix(),
            "absolutePath": str(path.resolve()),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in selected_files
    ]
    selection_rows = [
        {
            "path": path.relative_to(output).as_posix(),
            "absolutePath": str(path.resolve()),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in sorted(output.glob("selected-paths-round-*.txt"))
    ]
    missing_rows = [missing[key] for key in sorted(missing)]
    parse_failure_rows = [{"reference": key, "error": parse_failures[key]} for key in sorted(parse_failures)]
    references_discovered = len(processed)
    closure_complete = not missing_rows and not parse_failure_rows
    manifest = {
        "schema": "ggd.infinity-strash-popp-vfx-dependency-closure@1",
        "sourceId": "steam-infinity-strash-popp-vfx-dependency-closure-build-local-20240328",
        "parentSourceId": pak_manifest["sourceId"],
        "sourcePak": pak_row,
        "roots": {"referenceCount": len(roots), "references": roots},
        "firstLevel": {
            "referenceOccurrences": len(first_level_occurrences),
            "uniqueReferences": len(first_level),
            "references": first_level,
        },
        "pakIndex": {
            "memberCount": len(members),
            "mountedPackageCount": len(package_map),
            "mountCollisions": collisions,
            "repak": extractor_proof(args.repak),
        },
        "extractor": {
            "invokedBinary": extractor_proof(args.extractor),
            "sourceGitPath": "tools/hero-model-library/source-workflows/infinity-strash-priority-raw-v2/src/main.rs",
            "selectionManifests": selection_rows,
        },
        "summary": {
            "referencesDiscovered": references_discovered,
            "referencesAcquired": len(acquired),
            "referencesMissing": len(missing_rows),
            "packagesWithUnparsedDependencies": len(parse_failure_rows),
            "filesAcquired": len(file_rows),
            "bytesAcquired": sum(row["bytes"] for row in file_rows),
            "rounds": round_number,
        },
        "packages": [acquired[key] for key in sorted(acquired)],
        "missingReferences": missing_rows,
        "dependencyParseFailures": parse_failure_rows,
        "files": file_rows,
        "states": {
            "nonScriptPackageDependencyClosureComplete": closure_complete,
            "ggdVfxConverted": False,
            "visualAcceptancePassed": False,
            "runtimeSelectable": False,
            "deployed": False,
        },
        "claim": "This manifest proves package acquisition and dependency-table traversal only. It does not prove Niagara conversion, visual equivalence, skill binding, runtime selection, or deployment.",
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    (output / "source-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), **manifest["summary"], "nonScriptPackageDependencyClosureComplete": closure_complete}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
