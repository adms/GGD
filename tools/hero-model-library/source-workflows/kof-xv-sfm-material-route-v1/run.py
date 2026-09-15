#!/usr/bin/env python3
"""Audit the locally preserved KOF XV Mai SFM package for a safe conversion route.

The package is a community Source-engine port, not a replacement for KOF XIV's
native containers.  It does provide the model companion files and explicit VMT
material declarations which the separate raw-FBX packages lack.  This workflow
does not guess an MDL reader, install one, or emit a GLB.  It produces a
deterministic receipt that a future audited Source-MDL converter can consume.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
# ``HERE`` is tools/hero-model-library/source-workflows/<workflow>.
# parents[3] is the checkout root; parents[4] would write generated evidence
# into the parent multi-worktree directory instead of this isolated checkout.
REPO = HERE.parents[3]
SOURCE_RELATIVE = Path("GGD-Asset-Library/intake/public-models-20260910/kof-author-models-round20/mai-xv-sfm")
OUTPUT_RELATIVE = Path("materials/hero-model-library/source-inventories/kof-xv-sfm-material-route-v1/receipt.json")
MODELS_RELATIVE = Path("extracted-v1/KOF15/Models/mai")
MATERIALS_RELATIVE = Path("extracted-v1/KOF15/Materials/Models/Mai")
MODEL_PARTS = ("kof_xv_mai_body", "kof_xv_mai_head")
MATERIAL_TOKEN = re.compile(r'^\s*"\$(basetexture|bumpmap)"\s+"([^"]+)"', re.IGNORECASE | re.MULTILINE)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path, source_root: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(source_root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def run_assimp_probe(path: Path) -> dict[str, Any]:
    proc = subprocess.run(["assimp", "info", str(path)], text=True, capture_output=True, check=False)
    output = proc.stdout + proc.stderr
    return {
        "exitCode": proc.returncode,
        "readerAccepted": proc.returncode == 0,
        "reason": "hl2-mdl-reader-not-implemented" if "HL2 MDLs are not implemented" in output else "unexpected-result",
    }


def material_path(source_root: Path, declared_path: str) -> Path:
    # VMT paths are Source-engine paths rooted at Materials/.  Reject traversal
    # and only resolve the PNG export supplied in this exact package.
    parts = Path(declared_path.replace("\\", "/")).parts
    if not parts or any(part in ("", ".", "..") for part in parts):
        raise ValueError(f"unsafe VMT material reference: {declared_path}")
    result = source_root / "extracted-v1/KOF15/Materials" / Path(*parts)
    return result.with_suffix(".png")


def parse_material(vmt: Path, source_root: Path) -> dict[str, Any]:
    declarations: dict[str, dict[str, Any]] = {}
    for kind, declared in MATERIAL_TOKEN.findall(vmt.read_text(encoding="utf-8", errors="strict")):
        target = material_path(source_root, declared)
        if not target.is_file():
            raise FileNotFoundError(f"VMT-declared {kind} PNG is missing: {target}")
        declarations[kind.lower()] = {
            "declaredSourcePath": declared.replace("\\", "/"),
            "png": file_record(target, source_root),
        }
    if "basetexture" not in declarations:
        raise ValueError(f"VMT has no base-texture declaration: {vmt}")
    return {"vmt": file_record(vmt, source_root), "declarations": declarations}


def load_members(source_root: Path) -> list[dict[str, Any]]:
    validation = json.loads((source_root / "extraction-validation.json").read_text(encoding="utf-8"))
    rows = validation.get("files")
    if not isinstance(rows, list) or len(rows) != 30:
        raise ValueError("expected exactly 30 verified SFM-package members")
    actual: list[dict[str, Any]] = []
    for expected in rows:
        relative = Path(str(expected["path"]))
        path = (source_root / relative).resolve()
        if not path.is_relative_to(source_root.resolve()) or not path.is_file():
            raise FileNotFoundError(f"missing or unsafe source member: {relative}")
        current = file_record(path, source_root)
        if current["bytes"] != expected["bytes"] or current["sha256"] != expected["sha256"]:
            raise ValueError(f"source member changed since extraction validation: {relative}")
        actual.append(current)
    return actual


def assimp_version() -> str:
    proc = subprocess.run(["assimp", "version"], text=True, capture_output=True, check=False)
    for line in (proc.stdout + proc.stderr).splitlines():
        if line.strip().startswith("Version "):
            return line.strip()
    return "unavailable"


def build(repo: Path, workspace: Path) -> dict[str, Any]:
    source_root = (workspace / SOURCE_RELATIVE).resolve()
    if not source_root.is_dir():
        raise FileNotFoundError(source_root)
    members = load_members(source_root)
    models: list[dict[str, Any]] = []
    for stem in MODEL_PARTS:
        mdl = source_root / MODELS_RELATIVE / f"{stem}.mdl"
        vvd = source_root / MODELS_RELATIVE / f"{stem}.vvd"
        vtx = source_root / MODELS_RELATIVE / f"{stem}.dx90.vtx"
        for required in (mdl, vvd, vtx):
            if not required.is_file():
                raise FileNotFoundError(required)
        models.append({
            "part": stem.removeprefix("kof_xv_mai_"),
            "mdl": file_record(mdl, source_root),
            "vvd": file_record(vvd, source_root),
            "vtx": file_record(vtx, source_root),
            "assimp": run_assimp_probe(mdl),
        })
    materials = [parse_material(path, source_root) for path in sorted((source_root / MATERIALS_RELATIVE).glob("*.vmt"))]
    if len(materials) != 6:
        raise ValueError(f"expected 6 VMT declarations, found {len(materials)}")
    all_base_pngs = {row["declarations"]["basetexture"]["png"]["path"] for row in materials}
    if len(all_base_pngs) != 6:
        raise ValueError(f"expected 6 distinct VMT base textures, found {len(all_base_pngs)}")
    accepted = sum(model["assimp"]["readerAccepted"] for model in models)
    return {
        "schema": "ggd.kof-xv-sfm-material-route@1",
        "sourceId": "kof-xv-mai-sfmlab-lordscrub-v1",
        "sourceGame": "The King of Fighters XV",
        "sourceClass": "mod-community-port",
        "character": {"nameZh": "不知火舞", "originalName": "Mai Shiranui", "heroIds": ["community-review-03-20260907"]},
        "source": {
            "absolutePath": str(source_root),
            "verifiedMembers": len(members),
            "verifiedBytes": sum(row["bytes"] for row in members),
            "membersSha256": hashlib.sha256("\n".join(f"{row['path']}\t{row['sha256']}" for row in members).encode()).hexdigest(),
        },
        "tools": {"assimp": assimp_version()},
        "modelParts": models,
        "materialBindings": {
            "vmtFiles": len(materials),
            "distinctBaseTexturePngs": len(all_base_pngs),
            "records": materials,
            "status": "explicit-source-vmt-to-png; still requires an audited Source-MDL reader for geometry/material-slot export",
        },
        "animation": {
            "nativeGameplayClips": 0,
            "sourceStaticPoseActions": 2,
            "status": "one local sequence per body/head source-model part; not KOF gameplay motion",
        },
        "conversionRoute": {
            "status": "blocked-no-installed-or-audited-source-mdl-reader",
            "sourceMdlReaderAcceptedParts": accepted,
            "requiredInputGroups": ["MDL", "VVD", "VTX", "VMT", "VTF/PNG"],
            "requiredNextEvidence": [
                "reader version and deterministic command receipt",
                "per-material slot mapping from the exported model to the VMT declarations",
                "skin/bind-matrix and joint-count validation",
                "geometry reduction below the GGD 8,000-triangle candidate target when source exceeds 10,000 triangles",
                "visual review before backend registration",
            ],
        },
        "readiness": {
            "acquired": True,
            "extracted": True,
            "converted": False,
            "validated": False,
            "registered": True,
            "backendSelectable": False,
            "productionDeployed": False,
        },
    }


def write_or_check(output: Path, rendered: str, check: bool) -> None:
    if check:
        if not output.is_file() or output.read_text(encoding="utf-8") != rendered:
            raise SystemExit(f"KOF XV SFM material-route receipt is stale: {output}")
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    output = args.output.resolve() if args.output else repo / OUTPUT_RELATIVE
    data = build(repo, args.workspace.resolve())
    write_or_check(output, json.dumps(data, ensure_ascii=False, indent=2) + "\n", args.check)
    print(json.dumps({
        "sourceId": data["sourceId"],
        "verifiedMembers": data["source"]["verifiedMembers"],
        "materialDeclarations": data["materialBindings"]["vmtFiles"],
        "sourceMdlReaderAcceptedParts": data["conversionRoute"]["sourceMdlReaderAcceptedParts"],
        "converted": data["readiness"]["converted"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
