#!/usr/bin/env python3
"""Inventory decrypted UnityFS objects and export standalone Mesh/Texture assets.

UnityPy is an explicit analysis dependency and is not vendored into the repo.
Install the pinned version in a disposable target directory as documented in
the workflow README, then expose it through ``PYTHONPATH``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import UnityPy
from UnityPy.export.MeshExporter import export_mesh


def safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return cleaned or "unnamed"


def file_receipt(path: Path) -> dict:
    data = path.read_bytes()
    return {
        "absolutePath": str(path.resolve()),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--decryption-receipt", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.decryption_receipt.read_text())
    bundles = []
    totals: Counter[str] = Counter()
    exported_meshes = []
    exported_textures = []
    for source_row in source["files"]:
        unityfs = Path(source_row["outputAbsolutePath"])
        environment = UnityPy.load(str(unityfs))
        counts = Counter(obj.type.name for obj in environment.objects)
        totals.update(counts)
        names: dict[str, list[str]] = {}
        bundle_dir = args.output_dir / source_row["blobId"]
        for obj in environment.objects:
            type_name = obj.type.name
            if type_name not in {"Mesh", "Texture2D", "AnimationClip", "Avatar", "Material", "AssetBundle"}:
                continue
            try:
                value = obj.read()
                name = str(getattr(value, "m_Name", getattr(value, "name", "")))
            except Exception as error:
                names.setdefault(type_name, []).append(f"<read-error:{type(error).__name__}>")
                continue
            names.setdefault(type_name, []).append(name)
            stem = f"{safe_name(name)}__{obj.path_id}"
            if type_name == "Mesh":
                rendered = export_mesh(value)
                if rendered:
                    destination = bundle_dir / "meshes" / f"{stem}.obj"
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_text(rendered)
                    exported_meshes.append({
                        "blobId": source_row["blobId"],
                        "logicalPath": source_row["logicalPath"],
                        "objectPathId": obj.path_id,
                        "objectName": name,
                        **file_receipt(destination),
                    })
            elif type_name == "Texture2D":
                destination = bundle_dir / "textures" / f"{stem}.png"
                destination.parent.mkdir(parents=True, exist_ok=True)
                try:
                    value.image.save(destination)
                except Exception as error:
                    names.setdefault("Texture2DExportError", []).append(
                        f"{name}:{type(error).__name__}"
                    )
                else:
                    exported_textures.append({
                        "blobId": source_row["blobId"],
                        "logicalPath": source_row["logicalPath"],
                        "objectPathId": obj.path_id,
                        "objectName": name,
                        "width": value.m_Width,
                        "height": value.m_Height,
                        **file_receipt(destination),
                    })
        bundles.append({
            "blobId": source_row["blobId"],
            "logicalPath": source_row["logicalPath"],
            "unityFsAbsolutePath": str(unityfs.resolve()),
            "objectCounts": dict(sorted(counts.items())),
            "selectedObjectNames": {key: sorted(value) for key, value in sorted(names.items())},
        })
    result = {
        "schema": "ggd.heros-bonds-unity-object-export@1",
        "unityPyVersion": UnityPy.__version__,
        "bundleCount": len(bundles),
        "objectCounts": dict(sorted(totals.items())),
        "exportedMeshCount": len(exported_meshes),
        "exportedTextureCount": len(exported_textures),
        "exportedMeshes": exported_meshes,
        "exportedTextures": exported_textures,
        "bundles": bundles,
        "limits": [
            "OBJ exports preserve geometry and UVs but do not preserve skeleton skinning or animation binding",
            "AnimationClip objects are inventoried but require a later rig-aware exporter",
            "Character identity remains pending visual review",
        ],
    }
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "bundleCount": result["bundleCount"],
        "objectCounts": result["objectCounts"],
        "exportedMeshCount": result["exportedMeshCount"],
        "exportedTextureCount": result["exportedTextureCount"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
