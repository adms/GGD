#!/usr/bin/env python3
"""Recover Infinity Strash VFX StaticMesh dependencies rejected by stock UModel.

The input dependency manifest already pins every source package. This program
selects only ``converter-failed`` StaticMesh rows, verifies their source bytes,
exports them with a patched Infinity Strash UModel, converts UModel's external
glTF to self-contained GLB with Assimp, validates basic GLB structure, and writes
a byte-pinned receipt. It does not reconstruct Niagara systems or create GGD VFX.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import shutil
import struct
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any


SCHEMA = "ggd.infinity-strash-popp-vfx-staticmesh-recovery@1"
SOURCE_ID = "steam-infinity-strash-popp-vfx-staticmesh-recovery-build-local-20240328"
PARENT_SOURCE_ID = "steam-infinity-strash-popp-vfx-dependency-export-build-local-20240328"


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_ref(path: pathlib.Path, relative_to: pathlib.Path | None = None) -> dict[str, Any]:
    resolved = path.resolve()
    item: dict[str, Any] = {
        "absolutePath": str(resolved),
        "bytes": resolved.stat().st_size,
        "sha256": sha256(resolved),
    }
    if relative_to is not None:
        item["path"] = resolved.relative_to(relative_to.resolve()).as_posix()
    return item


def verify_ref(item: dict[str, Any]) -> pathlib.Path:
    path = pathlib.Path(item["absolutePath"])
    if not path.is_file():
        raise FileNotFoundError(path)
    if path.stat().st_size != item["bytes"]:
        raise RuntimeError(f"source byte count drift: {path}")
    actual = sha256(path)
    if actual != item["sha256"]:
        raise RuntimeError(f"source SHA-256 drift: {path}: {actual}")
    return path


def command_version(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    return (result.stdout + result.stderr).strip()


def validate_gltf(path: pathlib.Path) -> dict[str, Any]:
    body = json.loads(path.read_text(encoding="utf-8"))
    if body.get("asset", {}).get("version") != "2.0":
        raise RuntimeError(f"not glTF 2.0: {path}")
    if not body.get("meshes"):
        raise RuntimeError(f"no meshes in glTF: {path}")
    primitive_count = sum(len(mesh.get("primitives", [])) for mesh in body["meshes"])
    if primitive_count == 0:
        raise RuntimeError(f"no mesh primitives in glTF: {path}")
    for buffer in body.get("buffers", []):
        uri = buffer.get("uri")
        if not uri or uri.startswith("data:"):
            continue
        source = path.parent / uri
        if not source.is_file():
            raise RuntimeError(f"missing external glTF buffer: {source}")
        if source.stat().st_size < int(buffer.get("byteLength", 0)):
            raise RuntimeError(f"short external glTF buffer: {source}")
    return {
        "meshes": len(body["meshes"]),
        "primitives": primitive_count,
        "accessors": len(body.get("accessors", [])),
    }


def parse_glb(path: pathlib.Path) -> tuple[dict[str, Any], dict[str, Any]]:
    raw = path.read_bytes()
    if len(raw) < 20:
        raise RuntimeError(f"short GLB: {path}")
    magic, version, declared = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF" or version != 2 or declared != len(raw):
        raise RuntimeError(f"invalid GLB header: {path}")
    offset = 12
    json_doc: dict[str, Any] | None = None
    chunks = 0
    while offset < len(raw):
        if offset + 8 > len(raw):
            raise RuntimeError(f"truncated GLB chunk header: {path}")
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        end = offset + length
        if end > len(raw):
            raise RuntimeError(f"truncated GLB chunk: {path}")
        payload = raw[offset:end]
        offset = end
        chunks += 1
        if kind == 0x4E4F534A:
            json_doc = json.loads(payload.decode("utf-8").rstrip(" \x00"))
    if offset != len(raw) or json_doc is None:
        raise RuntimeError(f"invalid GLB chunk layout: {path}")
    meshes = json_doc.get("meshes", [])
    primitive_count = sum(len(mesh.get("primitives", [])) for mesh in meshes)
    if not meshes or primitive_count == 0:
        raise RuntimeError(f"GLB has no mesh primitives: {path}")
    accessors = json_doc.get("accessors", [])
    vertices = 0
    indices = 0
    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            position = primitive.get("attributes", {}).get("POSITION")
            if isinstance(position, int) and 0 <= position < len(accessors):
                vertices += int(accessors[position].get("count", 0))
            index = primitive.get("indices")
            if isinstance(index, int) and 0 <= index < len(accessors):
                indices += int(accessors[index].get("count", 0))
    return json_doc, {
        "chunks": chunks,
        "meshes": len(meshes),
        "primitives": primitive_count,
        "vertices": vertices,
        "indices": indices,
        "triangles": indices // 3,
        "materials": len(json_doc.get("materials", [])),
        "animations": len(json_doc.get("animations", [])),
    }


def strip_unused_tangents(path: pathlib.Path) -> int:
    """Remove tangent bindings only where the bound material has no normal map.

    Assimp preserves UModel tangents even though these support-mesh materials do
    not use normal textures. One source mesh contains eight zero tangents, which
    glTF correctly rejects. Removing the unused attribute preserves positions,
    normals, UVs and indices and lets a later runtime generate tangents if a
    normal-mapped material is assigned.
    """
    raw = path.read_bytes()
    magic, version, declared = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF" or version != 2 or declared != len(raw):
        raise RuntimeError(f"invalid GLB header before normalization: {path}")
    offset = 12
    chunks: list[tuple[int, bytes]] = []
    document: dict[str, Any] | None = None
    while offset < len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        payload = raw[offset : offset + length]
        offset += length
        if kind == 0x4E4F534A:
            document = json.loads(payload.decode("utf-8").rstrip(" \x00"))
        else:
            chunks.append((kind, payload))
    if document is None:
        raise RuntimeError(f"GLB has no JSON chunk: {path}")
    materials = document.get("materials", [])
    removed = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            if "TANGENT" not in attributes:
                continue
            material_index = primitive.get("material")
            material = materials[material_index] if isinstance(material_index, int) and material_index < len(materials) else {}
            if "normalTexture" not in material:
                del attributes["TANGENT"]
                removed += 1
    if not removed:
        return 0
    payload = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    payload += b" " * (-len(payload) % 4)
    rebuilt = bytearray(struct.pack("<4sII", b"glTF", 2, 0))
    rebuilt += struct.pack("<II", len(payload), 0x4E4F534A) + payload
    for kind, chunk in chunks:
        rebuilt += struct.pack("<II", len(chunk), kind) + chunk
    struct.pack_into("<I", rebuilt, 8, len(rebuilt))
    path.write_bytes(rebuilt)
    return removed


def stable_tag(index: int, reference: str) -> str:
    digest = hashlib.sha256(reference.encode("utf-8")).hexdigest()[:12]
    return f"{index:03d}-{digest}"


def run_export(args: argparse.Namespace) -> dict[str, Any]:
    source_manifest = args.source_manifest.resolve()
    raw_root = args.raw.resolve()
    umodel = args.umodel.resolve()
    assimp = args.assimp.resolve()
    output = args.output.resolve()
    for tool in (umodel, assimp):
        if not tool.is_file() or not os.access(tool, os.X_OK):
            raise RuntimeError(f"missing executable: {tool}")
    source = json.loads(source_manifest.read_text(encoding="utf-8"))
    if source.get("schema") != "ggd.infinity-strash-popp-vfx-dependency-export@1":
        raise RuntimeError(f"unexpected input schema: {source.get('schema')}")
    if pathlib.Path(source["rawRoot"]).resolve() != raw_root:
        raise RuntimeError("--raw does not match the byte-pinned input manifest rawRoot")
    rows = [row for row in source["rows"] if row.get("status") == "converter-failed"]
    rows = [row for row in rows if "/VFX/Staticmesh/" in row.get("reference", "")]
    if not rows:
        raise RuntimeError("no converter-failed StaticMesh rows found")
    if output.exists():
        raise FileExistsError(f"refusing to overwrite output: {output}")
    (output / "gltf").mkdir(parents=True)
    (output / "glb").mkdir()

    results: list[dict[str, Any]] = []
    all_files: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        tag = stable_tag(index, row["reference"])
        inputs = []
        uasset: pathlib.Path | None = None
        for item in row["input"]:
            path = verify_ref(item)
            try:
                path.relative_to(raw_root)
            except ValueError as error:
                raise RuntimeError(f"input escapes raw root: {path}") from error
            inputs.append(file_ref(path))
            if path.suffix == ".uasset":
                uasset = path
        if uasset is None:
            raise RuntimeError(f"row has no uasset: {row['reference']}")

        export_root = output / "gltf" / tag
        export_root.mkdir()
        command = [str(umodel), "-game=strash", "-export", "-gltf", f"-out={export_root}", str(uasset)]
        process = subprocess.run(command, capture_output=True, text=True, timeout=args.timeout)
        log = export_root / "umodel.log"
        log.write_text(process.stdout + process.stderr, encoding="utf-8")
        gltf_files = sorted(export_root.rglob("*.gltf"))
        row_result: dict[str, Any] = {
            "reference": row["reference"],
            "pakStem": row["pakStem"],
            "tag": tag,
            "input": inputs,
            "umodelReturnCode": process.returncode,
            "umodelLog": file_ref(log, output),
            "gltf": [],
            "glb": [],
            "status": "converter-failed",
        }
        if process.returncode == 0 and gltf_files:
            glb_root = output / "glb" / tag
            glb_root.mkdir()
            converted = True
            for gltf in gltf_files:
                gltf_structure = validate_gltf(gltf)
                target = glb_root / f"{gltf.stem}.glb"
                conversion = subprocess.run(
                    [str(assimp), "export", str(gltf), str(target), "-f", "glb2"],
                    capture_output=True,
                    text=True,
                    timeout=args.timeout,
                )
                assimp_log = glb_root / f"{gltf.stem}.assimp.log"
                assimp_log.write_text(conversion.stdout + conversion.stderr, encoding="utf-8")
                row_result["gltf"].append({**file_ref(gltf, output), "structure": gltf_structure})
                if conversion.returncode != 0 or not target.is_file():
                    converted = False
                    row_result["assimpReturnCode"] = conversion.returncode
                    continue
                removed_tangent_bindings = strip_unused_tangents(target)
                _, structure = parse_glb(target)
                converted_ref = {
                    **file_ref(target, output),
                    "structure": structure,
                    "normalization": {"unusedTangentBindingsRemoved": removed_tangent_bindings},
                }
                row_result["glb"].append(converted_ref)
                all_files.append(converted_ref)
            if converted and row_result["glb"]:
                row_result["status"] = "converted-staticmesh-support"
        results.append(row_result)

    converted_rows = [row for row in results if row["status"] == "converted-staticmesh-support"]
    failed_rows = [row for row in results if row["status"] != "converted-staticmesh-support"]
    manifest: dict[str, Any] = {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "parentSourceId": PARENT_SOURCE_ID,
        "inputManifest": file_ref(source_manifest),
        "rawRoot": str(raw_root),
        "tools": {
            "umodel": {**file_ref(umodel), "version": command_version([str(umodel), "-version"])},
            "assimp": {**file_ref(assimp), "version": command_version([str(assimp), "version"])},
        },
        "summary": {
            "failedStaticMeshPackagesAttempted": len(results),
            "packagesConverted": len(converted_rows),
            "packagesStillBlocked": len(failed_rows),
            "glbFiles": len(all_files),
            "glbBytes": sum(item["bytes"] for item in all_files),
            "vertices": sum(item["structure"]["vertices"] for row in converted_rows for item in row["glb"]),
            "triangles": sum(item["structure"]["triangles"] for row in converted_rows for item in row["glb"]),
        },
        "rows": results,
        "files": sorted(all_files, key=lambda item: item["path"]),
        "states": {
            "staticMeshSupportConverted": len(converted_rows),
            "niagaraSystemsConverted": 0,
            "ggdVfxConverted": 0,
            "visualAcceptancePassed": False,
            "runtimeBound": False,
            "deployed": False,
        },
        "claim": "This manifest proves byte-pinned recovery and structural conversion of static-mesh support assets only. It does not prove Niagara conversion, reconstructed GGD VFX, visual equivalence, skill binding, runtime availability, or deployment.",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    manifest_path = output / "source-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(manifest_path), **manifest["summary"]}, ensure_ascii=False))
    return manifest


def check_manifest(path: pathlib.Path) -> None:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schema") != SCHEMA:
        raise RuntimeError(f"unexpected recovery schema: {manifest.get('schema')}")
    verify_ref(manifest["inputManifest"])
    verify_ref(manifest["tools"]["umodel"])
    verify_ref(manifest["tools"]["assimp"])
    output = path.parent.resolve()
    for item in manifest["files"]:
        target = output / item["path"]
        if target.resolve() != pathlib.Path(item["absolutePath"]).resolve():
            raise RuntimeError(f"absolute/relative output mismatch: {item['path']}")
        verify_ref(item)
        _, structure = parse_glb(target)
        if structure != item["structure"]:
            raise RuntimeError(f"GLB structure drift: {target}")
    summary = manifest["summary"]
    if summary["packagesConverted"] != len([r for r in manifest["rows"] if r["status"] == "converted-staticmesh-support"]):
        raise RuntimeError("converted package count drift")
    if summary["packagesStillBlocked"] != len([r for r in manifest["rows"] if r["status"] != "converted-staticmesh-support"]):
        raise RuntimeError("blocked package count drift")
    print(json.dumps({"checked": str(path.resolve()), **summary}, ensure_ascii=False))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-manifest", type=pathlib.Path)
    parser.add_argument("--raw", type=pathlib.Path)
    parser.add_argument("--umodel", type=pathlib.Path)
    parser.add_argument("--assimp", type=pathlib.Path, default=pathlib.Path("/usr/local/bin/assimp"))
    parser.add_argument("--output", type=pathlib.Path)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--check", type=pathlib.Path)
    args = parser.parse_args()
    if args.check:
        return args
    missing = [name for name in ("source_manifest", "raw", "umodel", "output") if getattr(args, name) is None]
    if missing:
        parser.error("missing for export: " + ", ".join("--" + name.replace("_", "-") for name in missing))
    return args


def main() -> int:
    args = parse_args()
    if args.check:
        check_manifest(args.check.resolve())
    else:
        manifest = run_export(args)
        if manifest["summary"]["packagesStillBlocked"]:
            return 2
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
