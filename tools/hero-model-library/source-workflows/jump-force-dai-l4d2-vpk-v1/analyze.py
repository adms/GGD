#!/usr/bin/env python3
"""Audit the publicly acquired Source 1 VPK ports of JUMP FORCE Dai.

The workflow verifies every extracted member against the local extraction
receipt, reads only bounded MDL header fields, and records why source format
conversion remains blocked.  It does not load addons, execute scripts, install
a Source MDL reader, or claim that Source sequence counts are GGD semantics.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OUTPUT = REPO / "materials/hero-model-library/source-inventories/jump-force-dai-l4d2-vpk-v1/receipt.json"
SOURCEIO_PREFLIGHT = OUTPUT.with_name("sourceio-preflight.json")
SOURCEIO_CONVERSION_ROOT = "GGD-Asset-Library/conversions/jump-force-dai-l4d2-sourceio-v1"
SOURCEIO_BACKUP_ROOT = "GGD-Asset-Library/backups/jump-force-dai-l4d2-sourceio-v1"
MATERIAL_REBUILD_ROOT = "GGD-Asset-Library/conversions/jump-force-dai-l4d2-material-rebuild-v3"
MATERIAL_REBUILD_BACKUP_ROOT = "GGD-Asset-Library/backups/jump-force-dai-l4d2-material-rebuild-v3"
WORKFLOWS = (
    {
        "sourceId": "steam-jump-force-dai-l4d2-coach-2298782931",
        "leadId": "lead-dai-jumpforce-l4d2-2298782931",
        "folder": "lead-dai-jumpforce-l4d2-2298782931-2298782931",
        "roles": {
            "models/survivors/survivor_coach": "third-person Dai body replacement",
            "models/weapons/arms/v_arms_coach_new": "first-person Dai arms accessory",
        },
    },
    {
        "sourceId": "steam-jump-force-dai-sword-l4d2-2318399292",
        "leadId": "lead-dai-jumpforce-sword-l4d2-2318399292",
        "folder": "lead-dai-jumpforce-sword-l4d2-2318399292-2318399292",
        "roles": {
            "models/weapons/melee/w_cricket_bat": "third-person Dai sword replacement prop",
            "models/weapons/melee/v_cricket_bat": "first-person Dai sword replacement prop",
        },
    },
)
HEADER_FIELDS = {
    "version": 4, "checksum": 8, "length": 76, "boneCount": 156,
    "boneOffset": 160, "localAnimCount": 180, "localAnimOffset": 184,
    "localSequenceCount": 188, "localSequenceOffset": 192,
    "textureCount": 204, "textureOffset": 208, "bodyPartCount": 232,
    "bodyPartOffset": 236,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path, root: Path) -> dict[str, Any]:
    return {"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def validated_members(root: Path) -> list[dict[str, Any]]:
    extraction = json.loads((root / "extraction.json").read_text(encoding="utf-8"))
    if extraction.get("errors"):
        raise ValueError(f"extraction errors remain in {root.name}")
    rows = extraction.get("files")
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"missing extraction file manifest in {root.name}")
    actual = []
    for row in rows:
        relative = Path(row["path"])
        path = (root / relative).resolve()
        if not path.is_relative_to(root.resolve()) or not path.is_file():
            raise FileNotFoundError(f"missing or unsafe source member: {relative}")
        current = file_record(path, root)
        if current["bytes"] != row["bytes"] or current["sha256"] != row["sha256"]:
            raise ValueError(f"source member changed since extraction: {relative}")
        actual.append(current)
    return actual


def mdl_header(path: Path, root: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if len(data) < 240 or data[:4] != b"IDST":
        raise ValueError(f"invalid Source MDL header: {path}")
    values = {name: struct.unpack_from("<i", data, offset)[0] for name, offset in HEADER_FIELDS.items()}
    if values["version"] != 49 or values["length"] != len(data):
        raise ValueError(f"unexpected Source MDL version or length: {path}")
    for count_key, offset_key in (("boneCount", "boneOffset"), ("localAnimCount", "localAnimOffset"), ("localSequenceCount", "localSequenceOffset"), ("textureCount", "textureOffset"), ("bodyPartCount", "bodyPartOffset")):
        if values[count_key] < 0 or values[offset_key] < 0 or values[offset_key] > len(data):
            raise ValueError(f"unsafe Source MDL count or offset: {path}")
    name = data[12:76].split(b"\0", 1)[0].decode("ascii", errors="replace")
    return {"mdl": file_record(path, root), "headerName": name, **values}


def assimp(path: Path) -> dict[str, Any]:
    proc = subprocess.run(["assimp", "info", str(path)], text=True, capture_output=True, check=False)
    output = proc.stdout + proc.stderr
    return {
        "readerAccepted": proc.returncode == 0,
        "exitCode": proc.returncode,
        "reason": "source-mdl-reader-not-available" if "MDLs are not implemented" in output else "unexpected-result",
    }


def core_geometry(path: Path, vvd_path: Path, vtx_path: Path, sourceio_root: Path) -> dict[str, Any]:
    """Audit SourceIO's non-Blender MDL49/VVD/VTX parser output.

    This is deliberately an audit of source geometry, not a GLB conversion.
    It proves the bounded parser can recover mesh, material and skin facts even
    when Blender cannot initialize in background mode.
    """
    import numpy as np

    import_root = sourceio_root.parent / "SourceIO"
    if not import_root.is_dir() or import_root.resolve() != sourceio_root.resolve():
        raise ValueError(f"SourceIO import alias is absent or mismatched: {import_root}")
    if str(sourceio_root.parent) not in sys.path:
        sys.path.insert(0, str(sourceio_root.parent))
    from SourceIO.library.models.mdl.v49 import MdlV49
    from SourceIO.library.models.vtx import open_vtx
    from SourceIO.library.models.vvd import Vvd
    from SourceIO.library.utils import FileBuffer

    mdl = MdlV49.from_buffer(FileBuffer(path))
    vtx = open_vtx(FileBuffer(vtx_path))
    vvd = Vvd.from_buffer(FileBuffer(vvd_path))
    if len(mdl.body_parts) != len(vtx.body_parts) or not vvd.lod_data:
        raise ValueError("Source geometry containers disagree on body-part or LOD structure")
    vertices = vvd.lod_data[0]
    if not np.isfinite(vertices["vertex"]).all() or not np.isfinite(vertices["normal"]).all() or not np.isfinite(vertices["uv"]).all():
        raise ValueError("Non-finite Source vertex data")
    selected: list[int] = []
    triangle_count = 0
    primitive_count = 0
    material_indices: set[int] = set()
    for vtx_part, body_part in zip(vtx.body_parts, mdl.body_parts):
        if len(vtx_part.models) != len(body_part.models):
            raise ValueError("Source geometry containers disagree on model structure")
        for vtx_model, model in zip(vtx_part.models, body_part.models):
            if not vtx_model.model_lods:
                continue
            lod = vtx_model.model_lods[0]
            if len(lod.meshes) != len(model.meshes):
                raise ValueError("Source geometry containers disagree on mesh structure")
            for vtx_mesh, mesh in zip(lod.meshes, model.meshes):
                for group in vtx_mesh.strip_groups:
                    if len(group.indices) % 3:
                        raise ValueError("Non-triangle Source index group")
                    if len(group.indices) and int(group.indices.max()) >= len(group.vertexes):
                        raise ValueError("Source index points outside its strip group")
                    remapped = group.vertexes["original_mesh_vertex_index"].reshape(-1).astype(np.int64) + mesh.vertex_index_start
                    if len(remapped) and (int(remapped.min()) < 0 or int(remapped.max()) >= len(vertices)):
                        raise ValueError("Source vertex remap points outside VVD LOD0")
                    selected.extend(int(value) for value in remapped)
                    triangle_count += len(group.indices) // 3
                    primitive_count += 1
                    material_indices.add(int(mesh.material_index))
    if not selected or triangle_count <= 0 or any(index < 0 or index >= len(mdl.materials) for index in material_indices):
        raise ValueError("Source geometry has no valid drawable mesh/material relation")
    unique = np.unique(np.asarray(selected, dtype=np.int64))
    selected_vertices = vertices[unique]
    active = selected_vertices["weight"] > 0
    active_bones = selected_vertices["bone_id"][active]
    if len(active_bones) and int(active_bones.max()) >= len(mdl.bones):
        raise ValueError("Source skin weights reference an absent bone")
    weight_sums = selected_vertices["weight"].sum(axis=1)
    nonzero = weight_sums > 0
    if not np.allclose(weight_sums[nonzero], 1.0, atol=0.002):
        raise ValueError("Source skin weights do not sum to one")
    if any(bone.parent_id >= len(mdl.bones) or bone.parent_id < -1 for bone in mdl.bones):
        raise ValueError("Source skeleton parent is outside bone range")
    return {
        "parser": "SourceIO core Python MDL49/VVD/VTX parser; Blender not invoked",
        "lod": 0,
        "sourceVertexCount": int(len(vertices)),
        "referencedVertexCount": int(len(unique)),
        "triangleCount": int(triangle_count),
        "stripGroupPrimitiveCount": int(primitive_count),
        "materialCount": int(len(mdl.materials)),
        "referencedMaterialIndices": sorted(material_indices),
        "referencedMaterialNames": [mdl.materials[index].name for index in sorted(material_indices)],
        "boneCount": int(len(mdl.bones)),
        "weightedVertexCount": int(nonzero.sum()),
        "weightsSumToOne": True,
        "finitePositionNormalUv": True,
        "skeletonParentsInRange": True,
    }


def sourceio_intermediate(workspace: Path, item: dict[str, Any], stem: str, source: dict[str, Any]) -> dict[str, Any] | None:
    """Read a previously emitted raw GLB without upgrading it to a candidate."""
    root = workspace / SOURCEIO_CONVERSION_ROOT / item["folder"] / stem.replace("/", "_")
    receipt_path = root / "conversion-receipt.json"
    if not receipt_path.is_file():
        return None
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("schema") != "ggd.jump-force-dai-sourceio-conversion-receipt@1":
        raise ValueError(f"unexpected SourceIO intermediate receipt: {receipt_path}")
    if receipt.get("source", {}).get("sha256") != source["mdl"]["sha256"]:
        raise ValueError(f"SourceIO intermediate source SHA mismatch: {receipt_path}")
    output = Path(receipt["output"]["absolutePath"])
    if not output.is_file() or output.stat().st_size != receipt["output"]["bytes"] or sha256(output) != receipt["output"]["sha256"]:
        raise ValueError(f"SourceIO intermediate output drift: {output}")
    result = {
        "receiptAbsolutePath": str(receipt_path.resolve()),
        "receiptSha256": sha256(receipt_path),
        "rawGlb": receipt["output"],
        "metrics": receipt["metrics"],
        "status": receipt["status"],
    }
    # A conversion-stage backup is distinct from the larger VPK source archive.
    # Record it only after both the local receipt and the exact source root agree.
    backup_path = workspace / SOURCEIO_BACKUP_ROOT / "latest-receipt.json"
    if backup_path.is_file():
        backup = json.loads(backup_path.read_text(encoding="utf-8"))
        conversion_root = (workspace / SOURCEIO_CONVERSION_ROOT).resolve()
        required = ("s3Uri", "manifestUri", "archiveSha256", "archiveBytes", "fileCount")
        if (backup.get("schema") != "ggd-intake-backup-receipt@1"
                or Path(backup.get("source", "")).resolve() != conversion_root
                or not backup.get("s3Uri", "").startswith("s3://ggd-390630837668-ap-east-2-an/legacy/")
                or backup.get("fullGetVerified") is not True
                or backup.get("allMemberSha256Verified") is not True
                or any(key not in backup for key in required)):
            raise ValueError(f"invalid SourceIO conversion backup receipt: {backup_path}")
        result["conversionStageBackup"] = {
            key: backup[key] for key in (*required, "fullGetVerified", "allMemberSha256Verified", "localUnchanged", "profile", "region")
        }
        result["conversionStageBackup"]["receiptAbsolutePath"] = str(backup_path.resolve())
        result["conversionStageBackup"]["receiptSha256"] = sha256(backup_path)
    material_root = workspace / MATERIAL_REBUILD_ROOT
    material_receipt_path = material_root / "receipt.json"
    if material_receipt_path.is_file():
        material = json.loads(material_receipt_path.read_text(encoding="utf-8"))
        output = Path(material.get("output", {}).get("absolutePath", ""))
        review = material_root / "visual-review-v1" / "run.json"
        if (material.get("schema") != "ggd.jump-force-dai-material-rebuild-receipt@1"
                or material.get("input", {}).get("rawGlb", {}).get("sha256") != result["rawGlb"]["sha256"]
                or material.get("output", {}).get("textureMaxEdge") != 256
                or material.get("output", {}).get("texturedMaterialCount") != 22
                or not output.is_file() or sha256(output) != material["output"]["sha256"]):
            raise ValueError(f"invalid material rebuild receipt: {material_receipt_path}")
        if not review.is_file():
            raise FileNotFoundError(f"missing material rebuild visual proof: {review}")
        visual = json.loads(review.read_text(encoding="utf-8"))
        if (visual.get("sourceSha256") != material["output"]["sha256"]
                or visual.get("complete") is not True or visual.get("proofExists") is not True
                or visual.get("errorExists") is not False or visual.get("images") != 3):
            raise ValueError(f"invalid material rebuild visual proof: {review}")
        result["materialRebuildIntermediate"] = {
            "receiptAbsolutePath": str(material_receipt_path.resolve()),
            "receiptSha256": sha256(material_receipt_path),
            "output": material["output"],
            "visualReview": {"runAbsolutePath": str(review.resolve()), "runSha256": sha256(review),
                             "proofAbsolutePath": str((review.parent / "proof.json").resolve()),
                             "proofSha256": sha256(review.parent / "proof.json"), "imageCount": visual["images"]},
            "status": material["status"],
        }
        backup_path = workspace / MATERIAL_REBUILD_BACKUP_ROOT / "latest-receipt.json"
        if backup_path.is_file():
            backup = json.loads(backup_path.read_text(encoding="utf-8"))
            required = ("s3Uri", "manifestUri", "archiveSha256", "archiveBytes", "fileCount")
            if (backup.get("schema") != "ggd-intake-backup-receipt@1"
                    or Path(backup.get("source", "")).resolve() != material_root.resolve()
                    or not backup.get("s3Uri", "").startswith("s3://ggd-390630837668-ap-east-2-an/legacy/")
                    or backup.get("fullGetVerified") is not True
                    or backup.get("allMemberSha256Verified") is not True
                    or any(key not in backup for key in required)):
                raise ValueError(f"invalid material rebuild backup receipt: {backup_path}")
            result["materialRebuildIntermediate"]["stageBackup"] = {
                key: backup[key] for key in (*required, "fullGetVerified", "allMemberSha256Verified", "localUnchanged", "profile", "region")
            }
            result["materialRebuildIntermediate"]["stageBackup"]["receiptAbsolutePath"] = str(backup_path.resolve())
            result["materialRebuildIntermediate"]["stageBackup"]["receiptSha256"] = sha256(backup_path)
    return result


def source_row(workspace: Path, item: dict[str, Any]) -> dict[str, Any]:
    root = workspace / "GGD-Asset-Library/intake/public-sources" / item["folder"]
    members = validated_members(root)
    acquisition = json.loads((root / "acquisition.json").read_text(encoding="utf-8"))
    inspection = json.loads((root / "inspection.json").read_text(encoding="utf-8"))
    if acquisition.get("sha256") != sha256(root / "raw" / f"workshop-{acquisition['itemId']}.bin"):
        raise ValueError(f"raw archive SHA mismatch for {item['sourceId']}")
    extracted = root / "extracted"
    preflight_path = SOURCEIO_PREFLIGHT
    if not preflight_path.is_file():
        raise FileNotFoundError(f"Missing SourceIO preflight: {preflight_path}")
    preflight = json.loads(preflight_path.read_text(encoding="utf-8"))
    sourceio_root = Path(preflight["toolchain"]["sourceio"]["absolutePath"])
    models = []
    for stem, role in item["roles"].items():
        mdl = extracted / (stem + ".mdl")
        vvd = extracted / (stem + ".vvd")
        vtx = extracted / (stem + ".dx90.vtx")
        for required in (mdl, vvd, vtx):
            if not required.is_file():
                raise FileNotFoundError(required)
        source_model = {"role": role, **mdl_header(mdl, root), "vvd": file_record(vvd, root), "vtx": file_record(vtx, root), "assimp": assimp(mdl), "coreGeometry": core_geometry(mdl, vvd, vtx, sourceio_root)}
        source_model["sourceioRawIntermediate"] = sourceio_intermediate(workspace, item, stem, source_model)
        models.append(source_model)
    suffixes = Counter(Path(row["path"]).suffix.lower() for row in members if row["path"].startswith("extracted/"))
    vmts = [row for row in members if row["path"].startswith("extracted/") and row["path"].lower().endswith(".vmt")]
    vtfs = [row for row in members if row["path"].startswith("extracted/") and row["path"].lower().endswith(".vtf")]
    if preflight.get("schema") != "ggd.jump-force-sourceio-preflight@1":
        raise ValueError("unexpected SourceIO preflight schema")
    ready = preflight.get("status", {}).get("standardizationReady") is True
    tooling = {
        "gitPath": str(SOURCEIO_PREFLIGHT.relative_to(REPO)),
        "sha256": sha256(SOURCEIO_PREFLIGHT),
        "blenderVersion": preflight["toolchain"]["blender"]["version"],
        "sourceioCommit": preflight["toolchain"]["sourceio"]["gitCommit"],
        "standardizationReady": ready,
    }
    intermediates = [model["sourceioRawIntermediate"] for model in models if model["sourceioRawIntermediate"]]
    material_rebuilds = [entry["materialRebuildIntermediate"] for entry in intermediates if entry.get("materialRebuildIntermediate")]
    reader_blocker = ("SourceIO is pinned locally, but Blender background startup fails before plugin/model import; "
                      "repair the headless Blender environment before standardization." if not ready else
                      "SourceIO is available but no MDL conversion has been executed or accepted." if not intermediates else
                      "SourceIO emitted a raw GLB intermediate; it still needs material rebuild, decimation, visual review and GGD contract validation before registration." if not material_rebuilds else
                      "A material-rebuilt GLB has render proof, but it retains 89,833 triangles and still needs topology-aware decimation, visual acceptance and GGD contract validation before registration.")
    return {
        "sourceId": item["sourceId"], "leadId": item["leadId"],
        "source": {"absolutePath": str(root.resolve()), "title": acquisition["title"], "pageUrl": acquisition["pageUrl"], "itemId": acquisition["itemId"], "raw": {"path": acquisition["file"], "bytes": acquisition["bytes"], "sha256": acquisition["sha256"]}, "checkedAt": inspection["checkedAt"]},
        "verifiedFiles": {"count": len(members), "bytes": sum(row["bytes"] for row in members), "manifestSha256": sha256(root / "extraction.json")},
        "extracted": {"extensions": dict(sorted(suffixes.items())), "vmtFiles": len(vmts), "vtfFiles": len(vtfs)},
        "modelGroups": models,
        "tooling": tooling,
        "status": {"acquired": True, "extracted": True, "rawGlbIntermediates": len(intermediates), "materialRebuildIntermediates": len(material_rebuilds), "converted": False, "validated": False, "registered": False, "runtimeSelectable": False, "productionDeployed": False},
        "blockers": [reader_blocker, "No GLB geometry, skin, material slot, texture conversion, visual review, six-state mapping, backend registration, or deployment has been created.", "Source sequence counts are native container metadata, not reviewed GGD idle/run/attack/hurt/death semantics."],
    }


def build(workspace: Path) -> dict[str, Any]:
    rows = [source_row(workspace, item) for item in WORKFLOWS]
    return {
        "schema": "ggd.jump-force-dai-l4d2-vpk-source-audit@1",
        "scope": "Public Steam Workshop Source 1 ports of JUMP FORCE Dai. These are separate MOD sources and do not replace original JUMP FORCE assets.",
        "summary": {"sources": len(rows), "acquired": len(rows), "extracted": len(rows), "sourceMdlGroups": sum(len(row["modelGroups"]) for row in rows), "rawGlbIntermediates": sum(row["status"]["rawGlbIntermediates"] for row in rows), "materialRebuildIntermediates": sum(row["status"]["materialRebuildIntermediates"] for row in rows), "converted": 0, "runtimeSelectable": 0, "productionDeployed": False},
        "sources": rows,
        "reproduction": {"write": "python3 tools/hero-model-library/source-workflows/jump-force-dai-l4d2-vpk-v1/analyze.py --workspace ..", "check": "python3 tools/hero-model-library/source-workflows/jump-force-dai-l4d2-vpk-v1/analyze.py --workspace .. --check"},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=REPO.parent)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = (json.dumps(build(args.workspace.resolve()), ensure_ascii=False, indent=2) + "\n").encode()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_bytes() != content:
            raise SystemExit(f"stale source audit: {OUTPUT}")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(content)
    print(json.dumps({"output": str(OUTPUT.relative_to(REPO)), "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
