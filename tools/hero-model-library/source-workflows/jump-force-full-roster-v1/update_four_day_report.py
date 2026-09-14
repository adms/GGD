#!/usr/bin/env python3
"""Generate the JUMP FORCE full-roster block in the fixed recent-assets report."""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
PLAN = ROOT / "materials/hero-model-library/source-inventories/jump-force-full-roster-v1/plan.json"
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
START = "<!-- generated:jump-force-full-roster-v1:start -->"
END = "<!-- generated:jump-force-full-roster-v1:end -->"
BOUNDARY = "<!-- generated:jumpforce-assets-v2:start -->"
PRIMARY_CLASSES = ("model", "texture", "skeleton", "motion", "vfx", "audio")
LABELS = {
    "model": "模型",
    "texture": "貼圖",
    "skeleton": "骨架",
    "motion": "動作 dependency roots",
    "vfx": "VFX／技能設定",
    "audio": "音效／語音",
}


def load_plan(path: Path = PLAN) -> dict:
    plan = json.loads(path.read_text(encoding="utf-8"))
    summary = plan.get("summary", {})
    if (
        plan.get("schema") != "ggd.jumpforce-full-roster-plan@1"
        or summary.get("characters") != 63
        or plan.get("scope", {}).get("batchCount") != 9
        or summary.get("selectedMemberRelations") != 86238
        or summary.get("paksMirroredThisRun") != 6
        or summary.get("payloadFilesExtractedThisRun") != 0
        or summary.get("convertedModelsThisRun") != 0
        or summary.get("backendOptionsAdded") != 0
        or summary.get("productionDeployments") != 0
    ):
        raise ValueError("JUMP FORCE full-roster plan is absent, stale or overclaims readiness")
    if len(plan.get("characters", [])) != 63:
        raise ValueError("JUMP FORCE full-roster character list is incomplete")
    return plan


def block(plan: dict) -> str:
    summary = plan["summary"]
    mirror = plan["localMirrorTarget"]
    lines = [
        START,
        "",
        "### JUMP FORCE 63 角色批次抽取／轉換計畫",
        "",
        f"現有完整 path index 已產生 **{summary['characters']} 個高信度 `chr####` 角色 family**，分 **{plan['scope']['batchCount']} 批**，共 **{summary['selectedMemberRelations']:,} 筆** patch-winner member 關係。這份數字包含六類主素材與 {summary['assetClasses']['metadata']['memberRelations']:,} 筆角色設定 member；不需要再掃描 LV99 的 Steam 目錄。",
        "",
        f"本機 mirror 已固定在 `{mirror['rawGameRoot']}`：**{mirror['fileCount']:,} 檔／{mirror['bytes']:,} bytes**，六顆 authority PAK 的檔名、bytes 與 SHA-256 已 **{mirror['verifiedPakCount']}/6** 逐檔通過。完整索引與收據見 `{mirror['evidenceGitPath']}`；S3 狀態為 `{mirror['s3Status']}`。後續抽取不再需要 LV99 分享。",
        "",
        "| 主素材類別 | 有候選角色 | 套件 | member 關係 | 狀態 |",
        "|---|---:|---:|---:|---|",
    ]
    for key in PRIMARY_CLASSES:
        row = summary["assetClasses"][key]
        lines.append(
            f"| {LABELS[key]} | {row['charactersWithCandidates']} | {row['packages']:,} | {row['memberRelations']:,} | path-indexed／planned，未抽取 |"
        )
    lines.extend([
        "",
        "| 批次 | 高信度原生 ID／角色 family |",
        "|---:|---|",
    ])
    batches: dict[int, list[str]] = collections.defaultdict(list)
    for row in plan["characters"]:
        batches[row["batch"]].append(f"`{row['nativeCharacterId']}` {row['characterName']}")
    for batch, characters in sorted(batches.items()):
        lines.append(f"| {batch} | {'、'.join(characters)} |")
    lines.extend([
        "",
        f"進度收據：`mirrorPak={summary['paksMirroredThisRun']}/6`、`extracted={summary['payloadFilesExtractedThisRun']}`、`convertedModel={summary['convertedModelsThisRun']}`、`convertedMotion={summary['convertedMotionsThisRun']}`、`convertedVfx={summary['convertedVfxThisRun']}`、`decodedAudio={summary['decodedAudioThisRun']}`、`backend={summary['backendOptionsAdded']}`、`deployed={summary['productionDeployments']}`。現階段是 `verified-local/path-indexed/planned`；鏡像完成不得計為已抽取、已轉換、已驗收、已註冊、可切換或已部署。",
        "",
        END,
        "",
    ])
    return "\n".join(lines)


def expected_report(current: str, generated: str) -> str:
    if START in current or END in current:
        if current.count(START) != 1 or current.count(END) != 1:
            raise ValueError("JUMP FORCE full-roster report markers are ambiguous")
        begin = current.index(START)
        finish = current.index(END, begin) + len(END)
        return current[:begin] + generated.rstrip() + current[finish:]
    if current.count(BOUNDARY) != 1:
        raise ValueError("JUMP FORCE report insertion boundary is missing or ambiguous")
    return current.replace(BOUNDARY, generated + BOUNDARY)


def update(report_path: Path = REPORT, *, write: bool) -> None:
    current = report_path.read_text(encoding="utf-8")
    expected = expected_report(current, block(load_plan()))
    if write:
        report_path.write_text(expected, encoding="utf-8")
    elif current != expected:
        raise ValueError("JUMP FORCE full-roster report block is stale")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    update(write=args.write)
    print("JUMP FORCE full-roster report block is current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
