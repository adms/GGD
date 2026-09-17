#!/usr/bin/env python3
"""Combine source fragments and rebuild the five-day module-candidate catalog."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


FRAGMENTS = ("300-mba.json", "ssbu.json", "kof-jstars.json")
MODULES = ("model", "texture", "skeleton", "motion", "vfx", "sfx", "voice")
START = "<!-- generated:source-module-catalog-v1:start -->"
END = "<!-- generated:source-module-catalog-v1:end -->"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def load_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def validate_fragment(path: Path, value: dict) -> None:
    if value.get("schema") != "ggd.source-module-catalog-fragment@1":
        raise ValueError(f"unexpected fragment schema: {path}")
    groups = value.get("sourceGroups")
    if not isinstance(groups, list) or not groups:
        raise ValueError(f"sourceGroups must be a non-empty list: {path}")
    for group in groups:
        for key in ("sourceId", "title", "platform", "version", "status", "evidencePaths", "summary", "candidates"):
            if key not in group:
                raise ValueError(f"{path}: source group missing {key}")
        seen = set()
        for index, row in enumerate(group["candidates"]):
            identity = (row.get("id"), row.get("character"), row.get("work"))
            if identity in seen:
                raise ValueError(f"{path}: duplicate candidate identity {identity}")
            seen.add(identity)
            for module in MODULES + ("registration", "deployment"):
                cell = row.get(module)
                if not isinstance(cell, dict) or set(("stage", "count", "note")) - set(cell):
                    raise ValueError(f"{path}: invalid {module} cell at candidate {index}")
                count = cell.get("count")
                if count is not None and (not isinstance(count, int) or count < 0):
                    raise ValueError(f"{path}: invalid {module}.count at candidate {index}")


def fragment_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_catalog(repo: Path) -> dict:
    root = repo / "materials/hero-model-library/source-module-catalog-v1"
    groups = []
    inputs = []
    for name in FRAGMENTS:
        path = root / name
        value = load_json(path)
        validate_fragment(path, value)
        inputs.append({
            "path": str(path.relative_to(repo)),
            "bytes": path.stat().st_size,
            "sha256": fragment_sha(path),
            "sourceGroups": len(value["sourceGroups"]),
            "candidates": sum(len(group["candidates"]) for group in value["sourceGroups"]),
        })
        for group in value["sourceGroups"]:
            copied = dict(group)
            copied["fragment"] = str(path.relative_to(repo))
            groups.append(copied)
    return {
        "schema": "ggd.source-module-catalog@1",
        "scope": ["300英雄", "Magical Battle Arena", "Super Smash Bros.", "The King of Fighters", "J-Stars Victory VS+"],
        "inputs": inputs,
        "counts": {
            "sourceGroups": len(groups),
            "candidates": sum(len(group["candidates"]) for group in groups),
            "registeredCandidates": sum(1 for group in groups for row in group["candidates"] if (row["registration"].get("count") or 0) > 0),
            "deployedCandidates": sum(1 for group in groups for row in group["candidates"] if (row["deployment"].get("count") or 0) > 0),
        },
        "statusSemantics": {
            "candidate": "來源索引、容器、轉換檔或待審元件；不等於 GGD 已驗收",
            "registered": "GGD 內容或後台選項已引用；不等於正式站部署",
            "deployed": "只有 Main 合併後的正式服務版本與實際切換驗證才成立",
            "nullCount": "現有證據無法建立可靠數量或逐角色對應，不能視為零",
        },
        "sourceGroups": groups,
    }


def catalog_index(catalog: dict) -> dict:
    """Keep one small central index; detailed candidates remain in source fragments."""
    return {
        "schema": catalog["schema"],
        "scope": catalog["scope"],
        "inputs": catalog["inputs"],
        "counts": catalog["counts"],
        "statusSemantics": catalog["statusSemantics"],
        "sourceGroups": [
            {
                "sourceId": group["sourceId"],
                "title": group["title"],
                "platform": group["platform"],
                "version": group["version"],
                "status": group["status"],
                "candidateCount": len(group["candidates"]),
                "summary": group["summary"],
                "fragment": group["fragment"],
                "evidencePaths": group["evidencePaths"],
            }
            for group in catalog["sourceGroups"]
        ],
    }


STAGE_LABELS = {
    None: "未建立權威對應",
    "unknown": "待查核",
    "out-of-scope": "不適用",
    "not-registered": "未註冊",
    "not-registered-as-source-file": "未註冊",
    "not-deployed": "未部署",
    "source-not-found": "尚未找到來源",
    "planned-source-missing": "規劃中／來源未到",
    "missing-native-gameplay-motion": "缺原生動作",
}


def stage_label(stage: str | None) -> str:
    if stage in STAGE_LABELS:
        return STAGE_LABELS[stage]
    assert stage is not None
    labels = []
    tests = (
        ("rejected", "拒收"),
        ("blocked", "受阻"),
        ("accepted", "已驗收"),
        ("validated", "結構已驗證"),
        ("registered", "已註冊"),
        ("converted", "已轉換"),
        ("decoded", "已解碼"),
        ("extracted", "已解包"),
        ("acquired", "已取得"),
        ("indexed", "已索引"),
        ("review", "待審"),
        ("pending", "待審"),
        ("unclassified", "待分類"),
        ("missing", "缺件"),
        ("container", "容器"),
        ("static", "靜態元件"),
        ("source", "來源"),
    )
    for token, label in tests:
        if token in stage and label not in labels:
            labels.append(label)
    return "／".join(labels) if labels else stage


def module_cell(cell: dict) -> str:
    label = stage_label(cell.get("stage"))
    count = cell.get("count")
    pool = cell.get("sourcePoolCount")
    if count is not None:
        label += f"（{count:,}）"
    elif pool is not None:
        label += f"（共用池 {pool:,}）"
    return label.replace("|", "／")


def summary_text(summary: object) -> str:
    if isinstance(summary, str):
        return summary.replace("|", "／")
    if isinstance(summary, dict):
        parts = []
        for key, value in summary.items():
            if isinstance(value, bool):
                value = "是" if value else "否"
            elif isinstance(value, int):
                value = f"{value:,}"
            parts.append(f"`{key}`={value}")
        return "；".join(parts).replace("|", "／")
    return str(summary).replace("|", "／")


def markdown(catalog: dict) -> str:
    lines = [
        START,
        "### 300英雄／MBA／任天堂大亂鬥／KOF／J-Stars 全模組候選總表",
        "",
        f"本節由三份來源片段即時重建，共 **{catalog['counts']['sourceGroups']} 組來源、{catalog['counts']['candidates']} 筆角色／容器候選**。候選只代表有來源索引、容器、轉換檔或待審元件；目前本節候選的正式站部署為 **{catalog['counts']['deployedCandidates']}**。`未建立權威對應` 代表現有證據無法建立可靠逐角色數量，不代表零。",
        "",
        "`註冊` 欄只認精確候選位元組或模型文件的引用；既有 300／MBA 加工副本與同名角色選項仍依本清單前段的下拉稽核記錄，不會因名稱相同就在本表推定為這一筆來源候選已註冊。",
        "",
        "#### 來源級完整統計",
        "",
        "| 來源 | 平台／版本 | 候選筆數 | 現況與完整計數 |",
        "|---|---|---:|---|",
    ]
    for group in catalog["sourceGroups"]:
        platform = f"{group['platform']}／{group['version']}"
        lines.append(f"| {group['title']}<br><small>`{group['sourceId']}`</small> | {platform} | {len(group['candidates']):,} | {summary_text(group['summary'])} |")
    lines += [
        "",
        "#### 全部角色／容器候選的模組狀態",
        "",
        "| 來源 | 角色／原生 ID | 作品 | 模型 | 貼圖 | 骨架 | 動作 | 特效 | 音效 | 語音 | 註冊／部署 |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for group in catalog["sourceGroups"]:
        for row in group["candidates"]:
            identity = row.get("character") or "未對應角色"
            if row.get("id"):
                identity += f"<br><small>`{row['id']}`</small>"
            work = row.get("work") or group["title"]
            final = f"{module_cell(row['registration'])}／{module_cell(row['deployment'])}"
            lines.append(
                f"| {group['title']} | {identity} | {work} | {module_cell(row['model'])} | {module_cell(row['texture'])} | {module_cell(row['skeleton'])} | {module_cell(row['motion'])} | {module_cell(row['vfx'])} | {module_cell(row['sfx'])} | {module_cell(row['voice'])} | {final} |"
            )
    lines += [
        "",
        "完整 `stage/count/note`、來源證據與逐角色說明保存在 `300-mba.json`、`ssbu.json`、`kof-jstars.json`；`catalog.json` 是含 SHA-256 的中央入口，不重複保存整份候選資料。",
        "",
        END,
    ]
    return "\n".join(lines)


def replace_section(text: str, section: str) -> str:
    if START in text and END in text:
        before = text.split(START, 1)[0].rstrip()
        after = text.split(END, 1)[1]
        return before + "\n\n" + section + after
    return text.rstrip() + "\n\n" + section + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = repo_root()
    output_dir = repo / "materials/hero-model-library/source-module-catalog-v1"
    catalog = build_catalog(repo)
    catalog_text = json.dumps(catalog_index(catalog), ensure_ascii=False, indent=2) + "\n"
    report_path = repo / "materials/hero-model-library/近四日新增模型動作特效清單.md"
    updated_report = replace_section(report_path.read_text(encoding="utf-8"), markdown(catalog))
    generated = {
        output_dir / "catalog.json": catalog_text,
        report_path: updated_report,
    }
    stale = [str(path.relative_to(repo)) for path, content in generated.items() if not path.is_file() or path.read_text(encoding="utf-8") != content]
    if args.check:
        if stale:
            print("stale generated files:")
            print("\n".join(stale))
            return 1
        print(json.dumps(catalog["counts"], ensure_ascii=False, sort_keys=True))
        return 0
    output_dir.mkdir(parents=True, exist_ok=True)
    for path, content in generated.items():
        path.write_text(content, encoding="utf-8")
    print(json.dumps(catalog["counts"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
