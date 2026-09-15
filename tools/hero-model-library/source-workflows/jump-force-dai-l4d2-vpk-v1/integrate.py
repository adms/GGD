#!/usr/bin/env python3
"""Register verified JUMP FORCE Dai Source 1 Workshop sources centrally.

This writes acquisition and extraction facts only.  MDL49 source data remains
pending standardization and is never added to a runtime dropdown here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
AUDIT = REPO / "materials/hero-model-library/source-inventories/jump-force-dai-l4d2-vpk-v1/receipt.json"
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_entry(row: dict) -> dict:
    source = row["source"]
    local = Path(source["absolutePath"])
    body, accessories, props = [], [], []
    for index, model in enumerate(row["modelGroups"]):
        role = model["role"]
        candidate = {
            "id": row["sourceId"] + f".mdl49-{index + 1}",
            "sourceId": row["sourceId"],
            "sourceModel": model["mdl"]["path"],
            "sourceModelSha256": model["mdl"]["sha256"],
            "format": "Source MDL49 / VVD / DX90 VTX",
            "boneCount": model["boneCount"],
            "sourceMdlLocalAnimDescriptorCount": model["localAnimCount"],
            "sourceMdlLocalSequenceCount": model["localSequenceCount"],
            "nativeAnimationCount": 0,
            "proceduralAnimationCount": 0,
            "textureTableCount": model["textureCount"],
            "converted": False,
            "defaultEligible": False,
            "runtimeSelectable": False,
            "conversionStatus": "blocked-no-installed-or-audited-source-mdl-reader",
            "limitations": [
                "Source sequence descriptors are retained as metadata and are not GGD action semantics.",
                "No GLB geometry/material/skin conversion or visual acceptance exists.",
            ],
        }
        if "body replacement" in role:
            candidate["resourceRole"] = "character-body"
            candidate["character"] = "小呆／達伊 / Dai"
            body.append(candidate)
        elif "arms" in role:
            candidate["resourceRole"] = "first-person-arms-accessory"
            accessories.append(candidate)
        else:
            candidate["resourceRole"] = "weapon-prop"
            props.append(candidate)
    label = "JUMP FORCE 小呆／達伊 L4D2 Workshop Source 1 MOD"
    if "sword" in row["sourceId"]:
        label += "（達伊之劍）"
    else:
        label += "（Coach 替換）"
    return {
        "id": row["sourceId"],
        "target": label,
        "heroIds": ["godie-nbbc", "godie-n01c"],
        "ownerEntryIds": [],
        "url": source["pageUrl"],
        "downloadUrl": None,
        "uploader": "Steam Workshop page metadata retained; creator identity is a Steam account identifier only.",
        "format": "Valve VPK v1 → Source MDL49 / VVD / DX90 VTX / VMT / VTF",
        "accessStatus": "public-steam-file-url",
        "checkedAt": source["checkedAt"],
        "acquisitionStatus": "downloaded-verified",
        "readiness": "source1-vpk-extracted-pending-audited-mdl-reader-and-standardization",
        "purchaseDecision": "hold-purchase-review-acquired-source",
        "defaultEligible": False,
        "resourceRole": "character-body-and-weapon-prop-collection",
        "localPath": str(local.relative_to(REPO.parent)),
        "sourceGame": "JUMP FORCE",
        "sourceWork": "JUMP FORCE / JUMP 大亂鬥",
        "platform": "PC / L4D2 Steam Workshop Source 1 MOD port",
        "selectionClass": "community-mod",
        "sourceClass": "community-mod-port-of-jump-force-assets",
        "discoveryChannel": "Valve public Workshop API",
        "assetKinds": ["model", "texture", "skeleton", "animation-metadata", "weapon-prop"],
        "files": [{"path": "raw/workshop-" + source["itemId"] + ".bin", "bytes": source["raw"]["bytes"], "sha256": source["raw"]["sha256"], "archiveMember": "Valve VPK v1"}],
        "extractionReceipt": {"gitPath": str(AUDIT.relative_to(REPO)), "sha256": sha256(AUDIT)},
        "modelCandidates": body + accessories + props,
        "nativeAnimationCount": 0,
        "sourceMdlSequenceMetadataCount": sum(model["localSequenceCount"] for model in row["modelGroups"]),
        "textureCount": row["extracted"]["vtfFiles"],
        "vfxCount": 0,
        "audioCount": 0,
        "publicationStatus": "local-extracted-awaiting-legacy-backup",
        "backendIntegration": {"required": True, "state": "pending-source-mdl-standardization", "heroIds": ["godie-nbbc", "godie-n01c"], "ownerEntryIds": [], "release": None, "selectionVerified": False},
        "verification": f"Valve API public URL 下載原始 VPK，{row['verifiedFiles']['count']} 個本機檔逐檔 SHA 驗證；VPK {len(row['modelGroups'])} 組 MDL/VVD/VTX、{row['extracted']['vmtFiles']} VMT、{row['extracted']['vtfFiles']} VTF 全數 CRC32 驗證。MDL49 reader 尚未可用，故模型、材質、蒙皮、動作、後台選項與部署皆未完成。",
        "limitations": row["blockers"],
    }


def expected(document: dict) -> dict[str, dict]:
    if document.get("schema") != "ggd.jump-force-dai-l4d2-vpk-source-audit@1":
        raise ValueError("unexpected source audit schema")
    return {row["sourceId"]: source_entry(row) for row in document["sources"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    document = json.loads(AUDIT.read_text(encoding="utf-8"))
    desired = expected(document)
    data = json.loads(DOWNLOADS.read_text(encoding="utf-8"))
    public = {row["id"]: row for row in data.get("publicSources", [])}
    leads = {row["id"]: row for row in data.get("publicSourceLeads", [])}
    changed = False
    for source_id, row in desired.items():
        existing = public.get(source_id)
        preserved = {key: existing[key] for key in ("pendingBackup", "backup") if existing and key in existing}
        candidate = {**row, **preserved}
        if candidate.get("backup", {}).get("readbackVerified") is True:
            candidate["publicationStatus"] = "s3-readback-verified"
            candidate["verification"] += " 已完成固定 ZIP 的 S3 完整讀回與逐成員 SHA-256 驗證。"
        if existing != candidate:
            if args.check:
                raise SystemExit(f"stale central public source: {source_id}")
            if existing:
                index = data["publicSources"].index(existing)
                data["publicSources"][index] = candidate
            else:
                data.setdefault("publicSources", []).append(candidate)
            changed = True
        lead_id = next(item["leadId"] for item in document["sources"] if item["sourceId"] == source_id)
        lead = leads.get(lead_id)
        if lead is None:
            raise ValueError(f"missing original public source lead: {lead_id}")
        lead_update = {"acquisitionStatus": "integrated-as-public-source", "resolvedSourceId": source_id}
        if any(lead.get(key) != value for key, value in lead_update.items()):
            if args.check:
                raise SystemExit(f"stale original source lead: {lead_id}")
            lead.update(lead_update)
            changed = True
    if changed:
        DOWNLOADS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sources": len(desired), "changed": changed, "check": args.check}, ensure_ascii=False))


if __name__ == "__main__":
    main()
