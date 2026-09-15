#!/usr/bin/env python3
"""Extract a byte-pinned dependency closure for a bounded Dai VFX pilot.

This script intentionally stops at Unreal package acquisition and structural
tables.  It does not interpret cooked Niagara execution data or create a GGD
runtime binding.
"""

from __future__ import annotations

import argparse
import collections
import datetime
import hashlib
import json
import struct
import subprocess
from collections import deque
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
SOURCE_INDEX = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vearn-av-v1/vfx-source-index.json"
SOURCE_PARTS = SOURCE_INDEX.parent
_SOURCE_INPUT = Path(json.loads(SOURCE_INDEX.read_text())["sourceInput"]["absolutePath"])
LIBRARY = next(parent for parent in _SOURCE_INPUT.parents if parent.name == "GGD-Asset-Library")
PAK_MANIFEST = LIBRARY / "intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/source-manifest.json"
PAK = LIBRARY / "intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/original/pakchunk0-WindowsClient.pak"
REPAK = LIBRARY / "tools/repak-src-v0.2.3/target/release/repak"
EXTRACTOR = Path("/private/tmp/popp-vfx-extractor-build/release/ggd-infinity-strash-prefix-extractor")
OUTPUT = LIBRARY / "intake/windows-readonly-20260914/infinity-strash-dai-vfx-components-v1"

ROOT_IDS = (
    "infinity-strash-vfx-pn010-00da6b3c486d",  # Skl01 flash
    "infinity-strash-vfx-pn010-afbe0d0928c6",  # Special02 flash
    "infinity-strash-vfx-pn010-da25b103b4ab",  # Special03 slash
    "infinity-strash-vfx-pn010-4ffeb18ca7ae",  # Special03 energy thunder A
    "infinity-strash-vfx-pn010-5f482bb94989",  # Special03 jump
    "infinity-strash-vfx-pn010-dc2a51f5b215",  # Special03 speed lines
)
SIDECARS = (".uasset", ".uexp", ".ubulk", ".uptnl")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pin(path: Path, relative_to: Path | None = None) -> dict:
    result = {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}
    if relative_to is not None:
        result["path"] = path.relative_to(relative_to).as_posix()
    return result


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


def parse_package(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 64 or struct.unpack_from("<I", data)[0] != 0x9E2A83C1:
        raise ValueError("not an Unreal package")
    if struct.unpack_from("<i", data, 4)[0] != -7 or struct.unpack_from("<i", data, 20)[0] != 0:
        raise ValueError("unsupported versioned package layout")
    _, offset = fstring(data, 28)
    offset += 4
    name_count, name_offset, _, _, export_count, export_offset, import_count, import_offset, dependency_offset = struct.unpack_from(
        "<9i", data, offset
    )
    names: list[str] = []
    cursor = name_offset
    for _ in range(name_count):
        value, cursor = fstring(data, cursor)
        cursor += 4
        names.append(value)

    def fname(at: int) -> str:
        index, number = struct.unpack_from("<ii", data, at)
        if not 0 <= index < len(names):
            raise ValueError("invalid FName index")
        return names[index] + (f"_{number - 1}" if number else "")

    imports = []
    for index in range(import_count):
        at = import_offset + index * 28
        imports.append({"className": fname(at + 8), "objectName": fname(at + 20)})
    if export_count and dependency_offset - export_offset != export_count * 104:
        raise ValueError("unexpected UE4.26 export table layout")
    export_classes: collections.Counter[str] = collections.Counter()
    for index in range(export_count):
        at = export_offset + index * 104
        class_index = struct.unpack_from("<i", data, at)[0]
        class_name = imports[-class_index - 1]["objectName"] if class_index < 0 else f"ExportRef:{class_index}"
        export_classes[class_name] += 1
    dependencies = sorted(
        {
            row["objectName"]
            for row in imports
            if row["className"] == "Package" and row["objectName"].startswith("/") and not row["objectName"].startswith("/Script/")
        }
    )
    return {
        "exportCount": export_count,
        "importCount": import_count,
        "exportClassCounts": dict(sorted(export_classes.items())),
        "dependencies": dependencies,
    }


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
        return f"/{parent.rsplit('/', 1)[-1]}/{relative}"
    return None


def package_map(members: list[str]) -> tuple[dict[str, str], dict[str, list[str]]]:
    member_set = set(members)
    references: dict[str, str] = {}
    files: dict[str, list[str]] = {}
    for member in members:
        reference = mount_reference(member)
        if reference is None:
            continue
        stem = member.removesuffix(".uasset")
        references.setdefault(reference, stem)
        files[stem] = [stem + suffix for suffix in SIDECARS if stem + suffix in member_set]
    return references, files


def load_roots() -> list[dict]:
    pointer = json.loads(SOURCE_INDEX.read_text())
    rows = []
    for item in pointer["parts"]:
        part = json.loads((REPO / item["gitPath"]).read_text())
        rows.extend(part["packages"])
    selected = {row["candidateId"]: row for row in rows if row["candidateId"] in ROOT_IDS}
    if set(selected) != set(ROOT_IDS):
        raise ValueError("bounded Dai root selection drift")
    result = []
    for candidate_id in ROOT_IDS:
        row = selected[candidate_id]
        if row["character"]["nativeId"] != "PN010":
            raise ValueError("pilot root identity drift")
        for source in row["files"]:
            path = Path(source["absolutePath"])
            if not path.is_file() or path.stat().st_size != source["bytes"] or sha256(path) != source["sha256"]:
                raise ValueError(f"source root byte drift: {path}")
        parsed = parse_package(Path(row["files"][0]["absolutePath"]))
        if parsed["exportClassCounts"].get("NiagaraSystem") != 1:
            raise ValueError(f"selected root is not one NiagaraSystem: {candidate_id}")
        result.append({**row, "structuralAnalysis": parsed})
    return result


def check(manifest: dict, output: Path, roots: list[dict]) -> None:
    if manifest.get("schema") != "ggd.infinity-strash-dai-vfx-component-closure@1":
        raise ValueError("unexpected closure schema")
    if [row["candidateId"] for row in manifest["roots"]] != [row["candidateId"] for row in roots]:
        raise ValueError("root order or identity drift")
    for row in manifest["files"]:
        path = output / row["path"]
        if not path.is_file() or path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError(f"closure byte drift: {path}")
    if manifest["states"] != {
        "dependencyClosureComplete": True,
        "supportComponentsExtracted": True,
        "niagaraTimingRecovered": False,
        "ggdVfxBuilt": False,
        "skillBindingsCreated": 0,
        "runtimeSelectable": False,
        "deployed": False,
    }:
        raise ValueError("closure state overclaim or drift")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--pak", type=Path, default=PAK)
    parser.add_argument("--pak-manifest", type=Path, default=PAK_MANIFEST)
    parser.add_argument("--repak", type=Path, default=REPAK)
    parser.add_argument("--extractor", type=Path, default=EXTRACTOR)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    roots = load_roots()
    if args.check:
        manifest = json.loads((output / "source-manifest.json").read_text())
        check(manifest, output, roots)
        print(json.dumps({"status": "current", **manifest["summary"]}, ensure_ascii=False))
        return 0
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"refusing to mix with non-empty output: {output}")
    output.mkdir(parents=True, exist_ok=True)
    pak_manifest = json.loads(args.pak_manifest.read_text())
    pak_rows = [row for row in pak_manifest["files"] if Path(row["absolutePath"]).resolve() == args.pak.resolve()]
    if len(pak_rows) != 1 or args.pak.stat().st_size != pak_rows[0]["bytes"] or sha256(args.pak) != pak_rows[0]["sha256"]:
        raise ValueError("source PAK identity drift")
    members = subprocess.run([str(args.repak.resolve()), "list", str(args.pak.resolve())], text=True, capture_output=True, check=True).stdout.splitlines()
    by_reference, files_by_stem = package_map(members)
    root_refs = ["/Game/" + row["sourcePaths"][0].removeprefix("strash/Content/").removesuffix(".uasset") for row in roots]
    queue = deque(root_refs)
    discovered_from: dict[str, set[str]] = {reference: {"bounded-root"} for reference in root_refs}
    processed: set[str] = set()
    packages: dict[str, dict] = {}
    missing: list[str] = []
    raw = output / "raw"
    round_no = 0
    while queue:
        refs = sorted({queue.popleft() for _ in range(len(queue))} - processed)
        if not refs:
            continue
        processed.update(refs)
        found = [(ref, by_reference[ref], files_by_stem[by_reference[ref]]) for ref in refs if ref in by_reference]
        missing.extend(ref for ref in refs if ref not in by_reference)
        selected = sorted({member for _, _, members_for_ref in found for member in members_for_ref})
        if selected:
            round_no += 1
            selection = output / f"selected-paths-round-{round_no:02d}.txt"
            selection.write_text("\n".join(selected) + "\n")
            subprocess.run([str(args.extractor.resolve()), str(args.pak.resolve()), str(selection), str(raw)], check=True)
        for reference, stem, related in found:
            parsed = parse_package(raw / f"{stem}.uasset")
            packages[reference] = {
                "reference": reference,
                "pakStem": stem,
                "memberCount": len(related),
                "discoveredFrom": sorted(discovered_from.get(reference, [])),
                "structuralAnalysis": parsed,
            }
            for dependency in parsed["dependencies"]:
                discovered_from.setdefault(dependency, set()).add(reference)
                if dependency not in processed:
                    queue.append(dependency)
    if missing:
        raise ValueError(f"closure has {len(set(missing))} missing references")
    physical = sorted(path for path in raw.rglob("*") if path.is_file())
    file_rows = [pin(path, output) for path in physical]
    summary = {
        "boundedRoots": len(roots),
        "referencesAcquired": len(packages),
        "filesAcquired": len(file_rows),
        "bytesAcquired": sum(row["bytes"] for row in file_rows),
        "rounds": round_no,
        "niagaraSystems": sum(row["structuralAnalysis"]["exportClassCounts"].get("NiagaraSystem", 0) for row in packages.values()),
        "materials": sum(sum(value for key, value in row["structuralAnalysis"]["exportClassCounts"].items() if key in {"Material", "MaterialInstanceConstant"}) for row in packages.values()),
        "textures": sum(row["structuralAnalysis"]["exportClassCounts"].get("Texture2D", 0) for row in packages.values()),
        "staticMeshes": sum(row["structuralAnalysis"]["exportClassCounts"].get("StaticMesh", 0) for row in packages.values()),
    }
    manifest = {
        "schema": "ggd.infinity-strash-dai-vfx-component-closure@1",
        "sourceId": "steam-infinity-strash-dai-vfx-components-build-local-20240328",
        "parentSourceId": pak_manifest["sourceId"],
        "sourcePak": pak_rows[0],
        "sourceIndex": pin(SOURCE_INDEX),
        "tools": {"repak": pin(args.repak), "extractor": pin(args.extractor), "script": pin(Path(__file__))},
        "roots": roots,
        "summary": summary,
        "packages": [packages[key] for key in sorted(packages)],
        "files": file_rows,
        "states": {
            "dependencyClosureComplete": True,
            "supportComponentsExtracted": True,
            "niagaraTimingRecovered": False,
            "ggdVfxBuilt": False,
            "skillBindingsCreated": 0,
            "runtimeSelectable": False,
            "deployed": False,
        },
        "s3": {"status": "pending", "uri": None},
        "claim": "This bounded manifest proves package acquisition, SHA-256 and UE4.26 import/export tables only; it does not reconstruct Niagara playback.",
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    (output / "source-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), **summary}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
