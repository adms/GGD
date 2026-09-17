#!/usr/bin/env python3
"""Build the scoped JUMP FORCE/J-Stars source-access audit from fixed indexes."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path


def read(path: Path):
    raw = gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    return json.loads(raw.decode("utf-8"))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[4])
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    repo, workspace, output = args.repo.resolve(), args.workspace.resolve(), args.output.resolve()
    inventory_path = repo / "materials/hero-model-library/source-inventories/windows-game-library.json.gz"
    pak_path = repo / "materials/hero-model-library/source-inventories/jump-force-steam-pak-index.json"
    sources_path = repo / "materials/hero-model-library/download-sources.json"
    inventory, pak, sources = read(inventory_path), read(pak_path), read(sources_path)
    steam = next(row for row in inventory["steamGames"] if row["id"] == "steam:816020")
    roms = [row for row in inventory["romCandidates"] if row["id"] in {"windows-rom-scan:0663", "windows-rom-scan:0664"}]
    wanted = {
        "parallel-ps-jumpforce-audio", "parallel-ps-jumpforce-local-10",
        "parallel-ps-jumpforce-local-second10", "parallel-ps-jumpforce-local-next32",
        "parallel-ps-jumpforce-local-final3", "steam-jump-force-streaming-audio-816020-build-8523149",
        "steam-jump-force-priority-original-assets-build-8523149", "parallel-ps-jstars-sample",
        "zenhax-jstars-pak-stpk-comparison-v1",
    }
    all_sources = sources.get("publicSources", []) + sources.get("paidSources", [])
    audio_catalog = next(row for row in sources.get("publicSourceLeads", []) if row["id"] == "miner600-jumpforce-audio-full-catalog")
    source_rows = []
    for row in all_sources:
        if row["id"] not in wanted:
            continue
        local = workspace / row["localPath"] if row.get("localPath") else None
        source_rows.append({
            "id": row["id"], "acquisitionStatus": row.get("acquisitionStatus"),
            "readiness": row.get("readiness"), "publicationStatus": row.get("publicationStatus"),
            "localPath": str(local) if local else None, "existsLocal": local.exists() if local else None,
        })
    report = {
        "schema": "ggd.jump-source-access-audit@1", "checkedAt": "2026-09-14",
        "scope": ["JUMP FORCE", "J-Stars Victory VS+"],
        "liveMounts": [
            {"path": "/Volumes/common", "exists": Path("/Volumes/common").exists()},
            {"path": "/Volumes/game", "exists": Path("/Volumes/game").exists()},
        ],
        "windowsInventory": {
            "gitPath": inventory_path.relative_to(repo).as_posix(), "sha256": digest(inventory_path),
            "jumpForce": steam, "jstars": roms,
            "limitation": "Windows inventory and SMB container listing are historical metadata. Missing mounts prevent current payload re-read or new hashes.",
        },
        "jumpForcePakIndex": {
            "gitPath": pak_path.relative_to(repo).as_posix(), "sha256": digest(pak_path),
            "containerCount": pak["containerCount"], "relationCount": pak["relationCount"],
            "uniquePathCount": pak["uniquePathCount"], "sourceKindSelectedPathCounts": pak["sourceKindSelectedPathCounts"],
            "containers": [{key: row[key] for key in ("name", "bytes", "sha256", "entryCount")} for row in pak["containers"]],
            "limitation": "The six raw Steam PAK files remain on the owner share and were not copied into this Git worktree. Existing hashes/index paths are evidence, not a fresh live-mount read.",
        },
        "registeredSources": sorted(source_rows, key=lambda row: row["id"]),
        "publicAudioCatalog": {key: audio_catalog.get(key) for key in ("id", "acquisitionStatus", "readiness", "packageCount", "deliverySourceIds", "reconciliationEvidence")},
        "status": {
            "jumpForceNewPayloadReadThisRun": False, "jstarsPublicSampleAcquiredThisRun": True,
            "jstarsStpkMembersSplitThisRun": True, "newStandardizedModelsThisRun": 0,
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    md = output.with_suffix(".md")
    lines = [
        "# JUMP FORCE／J-Stars 來源盤點收據", "",
        "本批以固定 Windows inventory、JUMP FORCE PAK 索引及中央來源表交叉核對。這份收據不把歷史 metadata 或容器路徑當成本批重新讀取。", "",
        "## 即時存取", "",
        f"- `/Volumes/common`：{'可讀' if report['liveMounts'][0]['exists'] else '未掛載'}",
        f"- `/Volumes/game`：{'可讀' if report['liveMounts'][1]['exists'] else '未掛載'}",
        "- 因兩個 mount 均未掛載，本批沒有重新讀取 owner JUMP FORCE PAK 或 PSV ROM payload，也沒有產生新的 owner 檔案 SHA。", "",
        "## 已有 JUMP FORCE 證據", "",
        f"- Steam App 816020，build {steam['buildId']}；歷史掃描 {steam['containerInventory']['fileCount']:,} 檔、{steam['containerInventory']['logicalFileBytes']:,} bytes、{steam['containerInventory']['assetContainerCandidateCount']} 個素材容器候選。",
        f"- 六個加密 PAK 已有逐檔 SHA 與解密索引；共 {pak['uniquePathCount']:,} unique paths。索引不等於全部素材已擷取或轉換。",
        "- 既有小呆 chr0430 模型／貼圖、Streaming AWB 解碼與公開音訊批次沿用中央來源記錄；本批不重複下載。", "",
        f"- 公開音訊目錄已由五個不可變交付批次核對為 {audio_catalog.get('packageCount')} 個不同原包；逐段說話者、語言、事件與聽審仍待完成。", "",
        "## 本批 J-Stars 推進", "",
        "- 新增原生 ID 000、013、014、018 的 PAK／RAM-dumped STPK 對照研究樣本。",
        "- 12 個 STPK 已通過 table/bounds 檢查並安全拆分；輸出仍為 SRD／SRDI／SRDV，不是 GLB。",
        "- `$CLH` 的 `$CH0` 階段、PS3 幾何配置及貼圖 swizzle 仍缺少本機已驗證轉換器；模型、骨架、動作、VFX、音訊、視覺驗收、英雄綁定與後台選項皆為未完成。", "",
        "## owner ROM 缺口", "",
    ]
    for row in roms:
        lines.append(f"- `{row['sourcePath']}`：{row['sizeBytes']:,} bytes；目前只有 inventory metadata，`contentHash=null`、`contentInspected=false`。")
    lines += ["", "完整機器可讀證據見同目錄 `jump-source-access-audit.json`。", ""]
    md.write_text("\n".join(lines))
    print(json.dumps({"output": str(output), "registeredSources": len(source_rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
