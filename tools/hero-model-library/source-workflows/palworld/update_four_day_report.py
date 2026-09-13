#!/usr/bin/env python3
"""Refresh Palworld facts in the 2026-09-11 through 2026-09-14 report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
REGISTRATION = ROOT / "materials/hero-model-library/priority-evidence/palworld-full-motion-options-v1/registration.json"
INTEGRATION = ROOT / "materials/hero-model-library/priority-evidence/palworld-hero-integration/receipt.json"
DROPDOWN = ROOT / "materials/hero-model-library/priority-evidence/all-model-dropdown-audit/all-model-dropdown-audit.json"


def render() -> str:
    registration = json.loads(REGISTRATION.read_text())
    integration = json.loads(INTEGRATION.read_text())
    dropdown = json.loads(DROPDOWN.read_text())
    by_hero = {row["heroId"]: row for row in integration["integrations"]}
    summary = dropdown["summary"]
    lines = REPORT.read_text().splitlines()
    replacements = {
        "| 帕魯三名 |": (
            "| 帕魯三名 | 3/3 Hero Forge 六技能槽套件通過，3/3 本機下拉可選；"
            f"空渦龍與搗蛋貓新增 {registration['summary']['newNativeMotionEntriesExposed']} 條原生動作的完整庫非預設選項 | "
            "原作技能 VFX、技能 SFX、叫聲與動作語意核准皆未完成；正式站 0/3 |"
        ),
        "| 空渦龍 | PASSIVE/Q/W/E/R/EX": (
            f"| 空渦龍 | PASSIVE/Q/W/E/R/EX 六槽編譯與來源套件驗證通過 | "
            f"{len(by_hero['acquired-jetragon']['modelOptions'])} 個 8,468 面選項；新選項保留 29 條原生動作 | "
            "合格；新選項為非預設 | 原作 VFX/SFX 未完成 | 未驗證 |"
        ),
        "| 枯星龍 | PASSIVE/Q/W/E/R/EX": (
            f"| 枯星龍 | PASSIVE/Q/W/E/R/EX 六槽編譯與來源套件驗證通過 | "
            f"{len(by_hero['acquired-astralym']['modelOptions'])} 個選項：既有 23,928 面與 7,996 面非預設選項 | "
            "7,996 面候選合格；另一顆 Idle/Walk 元件只有 2 條動作，不偽造六態選項 | 原作 VFX/SFX 未完成 | 未驗證 |"
        ),
        "| 搗蛋貓 | PASSIVE/Q/W/E/R/EX": (
            f"| 搗蛋貓 | PASSIVE/Q/W/E/R/EX 六槽編譯與來源套件驗證通過 | "
            f"{len(by_hero['acquired-cattiva']['modelOptions'])} 個 5,798 面選項；新選項保留 33 條原生動作 | "
            "合格；新選項為非預設 | 原作 VFX/SFX 未完成 | 未驗證 |"
        ),
        "下拉稽核目前涵蓋": (
            "下拉稽核目前涵蓋靜態英雄 `modelVersions` 與 Hero Forge acquired-model selector。"
            f"產生器現行記錄為：{summary['modelAt1Documents']:,} 份 `model@1` 文件、"
            f"{summary['allActualSelectableModelKeys']:,} 個實際可選 model keys、{summary['centralSourceRows']:,} 筆中央來源、"
            f"{summary['centralRegisteredRows']:,} 筆中央來源已註冊、{summary['centralUnregisteredQualifiedRows']:,} 筆合格但未註冊、"
            f"{summary['centralUnregisteredPendingQualificationRows']:,} 筆仍待資格確認、"
            f"{summary['readyUnregisteredIndependentComponents']:,} 個已完成但尚未註冊的獨立元件，以及 "
            f"{summary['explicitUnusedPropDocuments']:,} 個明列未使用道具。中央註冊旗標不一致與註冊引用缺少模型文件都是 0；"
            "數字由 `audit_model_dropdown_coverage.py` 重建並以 `all-model-dropdown-audit.json` 的 `summary` 為準。"
        ),
    }
    found = {key: False for key in replacements}
    output = []
    for line in lines:
        hit = next((key for key in replacements if line.startswith(key)), None)
        if hit:
            output.append(replacements[hit]); found[hit] = True
        else:
            output.append(line)
    if not all(found.values()):
        raise ValueError("Four-day report markers changed: " + repr([key for key, value in found.items() if not value]))
    motion_row = f"| 帕魯完整動作庫候選 | 空渦龍 29＋搗蛋貓 33，共 {registration['summary']['newNativeMotionEntriesExposed']} 條 | 原生 | 已註冊非預設模型選項；技能事件綁定待審查 |"
    if motion_row not in output:
        position = next(index for index, line in enumerate(output) if line.startswith("| 帕魯三名審查佇列 |"))
        output.insert(position, motion_row)
    evidence = "- 帕魯完整動作選項：`materials/hero-model-library/priority-evidence/palworld-full-motion-options-v1/registration.json`"
    if evidence not in output:
        position = next(index for index, line in enumerate(output) if line.startswith("- 帕魯影音審查：")) + 1
        output.insert(position, evidence)
    return "\n".join(output) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    expected = render()
    if args.write:
        REPORT.write_text(expected)
    elif REPORT.read_text() != expected:
        raise ValueError("Palworld four-day report section is stale; run with --write")
    print(json.dumps({"report": REPORT.relative_to(ROOT).as_posix(), "registeredFullMotionOptions": 2, "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
