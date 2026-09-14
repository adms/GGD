#!/usr/bin/env python3
"""Upsert MBA batch 2 into fixed central indexes and the four-day report."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
LIB = REPO / "materials/hero-model-library"
SOURCE_ID = "magical-battle-arena-complete-form-1.60-plus"
REPORT = LIB / "priority-evidence/mba-unused-model-batch2-v1/report.json"


def write(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def upsert(rows: list[dict], item: dict) -> None:
    hits = [index for index, row in enumerate(rows) if row.get("id") == item["id"]]
    if len(hits) > 1:
        raise ValueError(f"duplicate id: {item['id']}")
    if hits:
        rows[hits[0]] = item
    else:
        rows.append(item)


def main() -> int:
    report = json.loads(REPORT.read_text())
    candidates = report["candidates"]
    for row in candidates:
        path = REPO / row["gitPath"]
        if not path.is_file() or (path.stat().st_size, sha(path)) != (row["bytes"], row["sha256"]):
            raise ValueError(f"candidate drift: {row['id']}")

    downloads_path = LIB / "download-sources.json"
    downloads = json.loads(downloads_path.read_text())
    source = next(row for row in downloads["publicSources"] if row.get("id") == SOURCE_ID)
    merged = {row["id"]: row for row in source.get("componentCandidates", [])}
    merged.update({row["id"]: row for row in candidates})
    source["componentCandidates"] = [merged[key] for key in sorted(merged)]
    source["readiness"] = "eight-policy-and-static-visual-validated-components-pending-motion-review-hero-design-and-registration"
    source["publicationStatus"] = "eight-converted-components-in-git; source-snapshot-readback-verified; latest-git-snapshot-backup-pending-parent-integration"
    source["verification"] = "8 名身份由 character-candidates.json 與原生 .chr 定義直接對到來源 GLB。8/8 為獨立 Git GLB、1 draw、1×256px atlas、1 skin、6 個同角色原生片段、finite float 全通過、Khronos 0 errors；兩批均有來源／成品三視圖。動作語意、連續播放、D-Down 死亡替代、英雄設計、後台註冊與部署未完成；八神疾風仍因來源黑色矩形條拒收。"
    if report.get("conversionStageBackup"):
        source["conversionStageBackup"] = report["conversionStageBackup"]
    write(downloads_path, downloads)

    public_path = LIB / "public-source-files.json"
    public = json.loads(public_path.read_text())
    snapshot = {
        "id": "mba-complete-form-160-batch2-source-snapshot-reference-v1",
        "sourceId": SOURCE_ID,
        "resourceRole": "existing-readback-verified-source-snapshot-reference",
        "localPath": "outputs/game-asset-library-20260907/magical-battle-arena",
        "s3Uri": candidates[0]["sourceSnapshot"]["s3Prefix"],
        "filesIndexSha256": candidates[0]["sourceSnapshot"]["filesIndexSha256"],
        "readbackVerified": True,
        "fullReadbackVerified": True,
        "automaticConsumption": False,
        "gitCommitBackupPending": True,
        "files": [{"path": row["source"]["workspaceRelativePath"], "bytes": row["source"]["bytes"], "sha256": row["source"]["sha256"]} for row in candidates],
    }
    upsert(public["sources"], snapshot)
    write(public_path, public)

    recent = LIB / "近四日新增模型動作特效清單.md"
    text = recent.read_text()
    start, end = "<!-- mba-unused-model-batch2-v1:start -->", "<!-- mba-unused-model-batch2-v1:end -->"
    lines = [start, "", "### 300／MBA 未使用儲備轉換第二批", "", "| 角色 | 模型 | 動作 | 特效／音訊 | 狀態 |", "|---|---|---|---|---|"]
    for row in candidates:
        lines.append(f"| {row['nameZh']}（`{row['sourceCharacterId']}`） | {row['metrics']['triangles']:,} 面／{row['metrics']['drawPrimitives']} draw／{row['metrics']['maxTextureEdge']}px；Khronos 0 error | 6 段同角色 MBA 原生候選；語意與播放待審 | 0／0 | **已轉換；政策與靜態視覺驗收；待英雄設計、動作審查與下拉註冊** |")
    backup = report.get("conversionStageBackup", {})
    backup_line = (f"完整轉換階段共 {backup['fileCount']} 檔、{backup['archiveBytes']:,} bytes，已上傳 S3 legacy 並完整 GET、逐 member SHA-256 驗證。" if backup else "完整轉換階段 S3 備份待完成。")
    lines += ["", "四顆成品均為獨立元件，來源／成品三視圖沒有發現八神疾風同類黑色矩形條；沒有改預設、沒有建立英雄、沒有註冊為可切換選項，也未部署。", backup_line, "", end]
    block = "\n".join(lines)
    if start in text:
        before, tail = text.split(start, 1)
        _, after = tail.split(end, 1)
        text = before + block + after
    else:
        text = text.rstrip() + "\n\n" + block + "\n"
    recent.write_text(text)
    print(json.dumps({"sourceId": SOURCE_ID, "components": len(candidates), "fixedIndexes": [str(downloads_path), str(public_path), str(recent)]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
