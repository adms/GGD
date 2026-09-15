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
from collections import Counter
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
OUTPUT = REPO / "materials/hero-model-library/source-inventories/jump-force-dai-l4d2-vpk-v1/receipt.json"
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


def source_row(workspace: Path, item: dict[str, Any]) -> dict[str, Any]:
    root = workspace / "GGD-Asset-Library/intake/public-sources" / item["folder"]
    members = validated_members(root)
    acquisition = json.loads((root / "acquisition.json").read_text(encoding="utf-8"))
    inspection = json.loads((root / "inspection.json").read_text(encoding="utf-8"))
    if acquisition.get("sha256") != sha256(root / "raw" / f"workshop-{acquisition['itemId']}.bin"):
        raise ValueError(f"raw archive SHA mismatch for {item['sourceId']}")
    extracted = root / "extracted"
    models = []
    for stem, role in item["roles"].items():
        mdl = extracted / (stem + ".mdl")
        vvd = extracted / (stem + ".vvd")
        vtx = extracted / (stem + ".dx90.vtx")
        for required in (mdl, vvd, vtx):
            if not required.is_file():
                raise FileNotFoundError(required)
        models.append({"role": role, **mdl_header(mdl, root), "vvd": file_record(vvd, root), "vtx": file_record(vtx, root), "assimp": assimp(mdl)})
    suffixes = Counter(Path(row["path"]).suffix.lower() for row in members if row["path"].startswith("extracted/"))
    vmts = [row for row in members if row["path"].startswith("extracted/") and row["path"].lower().endswith(".vmt")]
    vtfs = [row for row in members if row["path"].startswith("extracted/") and row["path"].lower().endswith(".vtf")]
    return {
        "sourceId": item["sourceId"], "leadId": item["leadId"],
        "source": {"absolutePath": str(root.resolve()), "title": acquisition["title"], "pageUrl": acquisition["pageUrl"], "itemId": acquisition["itemId"], "raw": {"path": acquisition["file"], "bytes": acquisition["bytes"], "sha256": acquisition["sha256"]}, "checkedAt": inspection["checkedAt"]},
        "verifiedFiles": {"count": len(members), "bytes": sum(row["bytes"] for row in members), "manifestSha256": sha256(root / "extraction.json")},
        "extracted": {"extensions": dict(sorted(suffixes.items())), "vmtFiles": len(vmts), "vtfFiles": len(vtfs)},
        "modelGroups": models,
        "status": {"acquired": True, "extracted": True, "converted": False, "validated": False, "registered": False, "runtimeSelectable": False, "productionDeployed": False},
        "blockers": ["Source MDL49/VVD/VTX reader is not installed or audited on this workstation.", "No GLB geometry, skin, material slot, texture conversion, visual review, six-state mapping, backend registration, or deployment has been created.", "Source sequence counts are native container metadata, not reviewed GGD idle/run/attack/hurt/death semantics."],
    }


def build(workspace: Path) -> dict[str, Any]:
    rows = [source_row(workspace, item) for item in WORKFLOWS]
    return {
        "schema": "ggd.jump-force-dai-l4d2-vpk-source-audit@1",
        "scope": "Public Steam Workshop Source 1 ports of JUMP FORCE Dai. These are separate MOD sources and do not replace original JUMP FORCE assets.",
        "summary": {"sources": len(rows), "acquired": len(rows), "extracted": len(rows), "sourceMdlGroups": sum(len(row["modelGroups"]) for row in rows), "converted": 0, "runtimeSelectable": 0, "productionDeployed": False},
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
