#!/usr/bin/env python3
"""Refresh Palworld facts in the 2026-09-11 through 2026-09-14 report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
REGISTRATION = ROOT / "materials/hero-model-library/priority-evidence/palworld-full-motion-options-v1/registration.json"
ASTRALYM_FULL58 = ROOT / "materials/hero-model-library/priority-evidence/palworld-astralym-full58-decimation-v1/registration.json"
INTEGRATION = ROOT / "materials/hero-model-library/priority-evidence/palworld-hero-integration/receipt.json"
DROPDOWN = ROOT / "materials/hero-model-library/priority-evidence/all-model-dropdown-audit/all-model-dropdown-audit.json"
HISTORICAL = ROOT / "materials/hero-model-library/priority-evidence/historical-model-recovery/current-lineage-audit.json"
LOL_RUNTIME = ROOT / "materials/hero-model-library/lol-project-seven/runtime-registration.json"
VALHALLA_37 = ROOT / "materials/hero-model-library/priority-evidence/valhalla-37-model-options-v1/audit.json"


def render() -> str:
    registration = json.loads(REGISTRATION.read_text())
    astralym_full58 = json.loads(ASTRALYM_FULL58.read_text())
    integration = json.loads(INTEGRATION.read_text())
    dropdown = json.loads(DROPDOWN.read_text())
    historical = json.loads(HISTORICAL.read_text())
    lol_runtime = json.loads(LOL_RUNTIME.read_text())
    valhalla = json.loads(VALHALLA_37.read_text())
    by_hero = {row["heroId"]: row for row in integration["integrations"]}
    complete_motion_entries = registration["summary"]["newNativeMotionEntriesExposed"] + astralym_full58["measured"]["clipCount"]
    summary = dropdown["summary"]
    lol_names = {
        "lol-karthus": "Karthus", "lol-leesin": "LeeSin", "lol-lux": "Lux",
        "lol-missfortune": "MissFortune", "lol-warwick": "Warwick",
        "lol-xerath": "Xerath", "lol-yasuo": "Yasuo",
    }
    lol_counts = "、".join(
        f"{lol_names[hero]} {count}"
        for hero, count in lol_runtime["summary"]["byHero"].items()
    )
    lines = REPORT.read_text().splitlines()
    replacements = {
        "這 37 位逐一對照後": (
            "這 37 位逐一對照後，功能分支的內容鏈已可解析：37/37 都有 Git 追蹤的 champion、作用中 `model@1`、"
            f"實體 GLB、六態映射與 modelVersions，共 {valhalla['summary']['registeredModelVersions']} 個模型選項；"
            "本機 `content/bundle.json` 也能逐位解析。正式站探測則顯示 37/37 位 champion 與舊作用中模型文件雖在 bundle 內，"
            f"但舊作用中 GLB HTTP 200 為 {valhalla['summary']['productionActiveGlbsHttp200']}/37，"
            f"分支新作用中 GLB 在正式 origin HTTP 200 也為 {valhalla['summary']['branchActiveGlbsHttp200OnProductionOrigin']}/37。"
            "因此目前精確狀態是「功能分支已註冊且本機 bundle 可解析；正式內容檔未部署，英靈殿畫面未驗證」，不能標成已上架。"
        ),
        "| LOL 七角色語音 |": (
            f"| LOL 七角色語音 | 使用者逐項聽審 {lol_runtime['summary']['approved']}/"
            f"{lol_runtime['summary']['approved']} 通過，"
            f"{lol_runtime['summary']['runtimeRegistered']} 筆已註冊到 runtime manifest；"
            f"{lol_counts} | "
            "Main 合併與正式站部署未驗證 |"
        ),
        "| 歷史四顆 GLB |": (
            f"| 歷史四顆 GLB | {historical['summary']['exactHistoricalGlbsByteIdentical']}/4 原始位元組與 `7bc2fa3f8` 完全一致；"
            f"{historical['summary']['standardizedLineageOptionsRegistered']}/4 標準化血緣候選已註冊為非預設選項 | "
            "原始枯星龍受 10,000 面正式採用規則阻擋；MBA 兩顆原始透明材質只作來源保留；Main 合併與正式站切換未驗證 |"
        ),
        "| 帕魯三名 |": (
            "| 帕魯三名 | 3/3 Hero Forge 六技能槽套件通過，3/3 本機下拉可選；"
            f"空渦龍、枯星龍與搗蛋貓共 {complete_motion_entries} 條原生動作條目的完整庫非預設選項 | "
            "原作技能 VFX、技能 SFX、叫聲與動作語意核准皆未完成；正式站 0/3 |"
        ),
        "| 空渦龍 | PASSIVE/Q/W/E/R/EX": (
            f"| 空渦龍 | PASSIVE/Q/W/E/R/EX 六槽編譯與來源套件驗證通過 | "
            f"{len(by_hero['acquired-jetragon']['modelOptions'])} 個 8,468 面選項；新選項保留 29 條原生動作 | "
            "合格；新選項為非預設 | 原作 VFX/SFX 未完成 | 未驗證 |"
        ),
        "| 枯星龍 | PASSIVE/Q/W/E/R/EX": (
            f"| 枯星龍 | PASSIVE/Q/W/E/R/EX 六槽編譯與來源套件驗證通過 | "
            f"{len(by_hero['acquired-astralym']['modelOptions'])} 個選項：23,928 面既有預設、7,996 面五動作版、7,896 面完整58動作版 | "
            "兩顆減面候選合格；Idle/Walk 元件仍獨立保留 | 原作 VFX/SFX 未完成 | 未驗證 |"
        ),
        "| 帕魯完整動作庫候選 |": (
            f"| 帕魯完整動作庫候選 | 空渦龍 29＋枯星龍 58＋搗蛋貓 33，共 {complete_motion_entries} 條 | "
            "原生（枯星龍其中 1 條為固定姿勢） | 已註冊非預設模型選項；技能事件綁定待審查 |"
        ),
        "| 搗蛋貓 | PASSIVE/Q/W/E/R/EX": (
            f"| 搗蛋貓 | PASSIVE/Q/W/E/R/EX 六槽編譯與來源套件驗證通過 | "
            f"{len(by_hero['acquired-cattiva']['modelOptions'])} 個 5,798 面選項；新選項保留 33 條原生動作 | "
            "合格；新選項為非預設 | 原作 VFX/SFX 未完成 | 未驗證 |"
        ),
        "- **已找到 37/37": (
            f"- **已找到 37/37、已轉換 37/37、已註冊 37/37**；共有 {valhalla['summary']['registeredModelVersions']} 個模型選項。"
            "每位都有六態映射，作用中模型實際不同 clip 為 4～6 個，不能把六態說成六段原生動作。"
        ),
        "- 除波普本批另有完整": (
            "- 除波普本批另有完整 Infinity Strash 結構、WebGL 與視覺驗收收據外，本稽核只證明文件、雜湊、GLB 結構、動作映射與讀取鏈完整；"
            "其他 36 位的完整視覺／玩法驗收仍未建立。"
        ),
        "- 37 位的內容資產與本輪狀態文件": (
            f"- 37 位的內容資產與本輪狀態文件目前以本稽核為準。正式站 bundle `{valhalla['productionObservation']['bundle']['contentVersion']}` 有 37/37 位舊 champion 與舊作用中 model@1，"
            "但 37/37 位都沒有 modelVersions，且作用中 GLB URL 全部不是 HTTP 200；本分支尚未 push、Main 合併與正式站部署未驗證。"
        ),
        "- 「功能分支內容配置已指向」": (
            "- 「功能分支內容配置已指向」的英靈殿來源鏈為 `Champions.tryGet(championId)` → `readPreviewModelDoc(modelKey)` → `StorePreviewCanvas`。"
            "目前正式 `asset-cdn.enabled=false`，所以缺少的 `/content/assets/...glb` 不會由 CDN 補上；需完成內容 volume 同步後再逐位畫面驗收。"
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
    for row in valhalla["rows"]:
        active = row["activeOption"]
        source = active["source"]
        production_http = (row["production"].get("productionActiveGlbHttp") or {}).get("status", "error")
        branch_http = row["production"]["branchActiveGlbHttp"].get("status", "error")
        acceptance = ("**已轉換、已驗收**；另有 Infinity Strash WebGL／視覺收據" if row["heroId"] == "b2-popp"
                      else "已轉換；GLB 結構、雜湊與六態映射通過；完整視覺／玩法驗收未建立")
        replacements[f"| `{row['heroId']}` |"] = (
            f"| `{row['heroId']}` | {row['name']} | {active['label']}（{source['library']}） | "
            f"{row['modelVersionCount']} | 6 態／{active['distinctMappedClips']} 個不同 clip | {acceptance} | "
            "功能分支已註冊；本機 bundle、後台 route 與英靈殿資料入口可解析 | "
            f"正式舊 GLB HTTP {production_http}；分支新 GLB HTTP {branch_http}；未部署／畫面未驗證 |"
        )
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
    evidence = "- 帕魯完整動作選項：`materials/hero-model-library/priority-evidence/palworld-full-motion-options-v1/registration.json`"
    if evidence not in output:
        position = next(index for index, line in enumerate(output) if line.startswith("- 帕魯影音審查：")) + 1
        output.insert(position, evidence)
    full58_evidence = "- 枯星龍 7,896 面完整58動作候選：`materials/hero-model-library/priority-evidence/palworld-astralym-full58-decimation-v1/registration.json`"
    if full58_evidence not in output:
        position = next(index for index, line in enumerate(output) if line.startswith("- 帕魯完整動作選項：")) + 1
        output.insert(position, full58_evidence)
    historical_evidence = "- 四顆歷史模型當前位元組與候選關係：`materials/hero-model-library/priority-evidence/historical-model-recovery/current-lineage-audit.json`"
    if historical_evidence not in output:
        position = next(index for index, line in enumerate(output) if line.startswith("- 四顆歷史模型：")) + 1
        output.insert(position, historical_evidence)
    lol_evidence = "- LOL 七角色 runtime 稽核：`materials/hero-model-library/lol-project-seven/runtime-audit.json`"
    if lol_evidence not in output:
        position = next(index for index, line in enumerate(output) if line.startswith("- LOL 七角色：")) + 1
        output.insert(position, lol_evidence)
    valhalla_evidence = "- 英靈殿 37 位模型選項 E2E：`materials/hero-model-library/priority-evidence/valhalla-37-model-options-v1/audit.json`"
    if valhalla_evidence not in output:
        position = next(index for index, line in enumerate(output) if line.startswith("## 九、主要證據入口")) + 2
        output.insert(position, valhalla_evidence)
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
    print(json.dumps({"report": REPORT.relative_to(ROOT).as_posix(), "registeredFullMotionOptions": 3,
                      "nativeMotionEntries": 120, "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
