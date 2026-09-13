#!/usr/bin/env python3
"""Rebuild the evidence-backed SSBU status for four missing-model heroes.

This workflow deliberately does not invent a six-state clip map.  It verifies
the local source files, shipped GLBs, policy receipts, native motion inventory,
and current Hero Forge defaults before emitting a review/blocker receipt.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
OUT = REPO / "materials/hero-model-library/priority-evidence/ssbu-missing-four-v1"
REPORT = REPO / "materials/hero-model-library/近四日新增模型動作特效清單.md"
START = "<!-- generated:ssbu-missing-four:start -->"
END = "<!-- generated:ssbu-missing-four:end -->"
REQUIRED_STATES = ["idle", "run", "attack", "cast", "hurt", "death"]
CURRENT_OPTIONS = {
    "acquired-mario": ["imported.linkstik"],
    "acquired-mewtwo": ["imported.herobuu"],
    "acquired-pokemon-trainer": ["imported.heropikachu"],
    "acquired-minecraft": ["champ.thorne"],
}
CURRENT_DEFAULTS = {hero: options[0] for hero, options in CURRENT_OPTIONS.items()}

CANDIDATES = [
    {
        "heroId": "acquired-mario", "nameZh": "Mario／瑪利歐", "fighterId": "mario", "formId": "c00",
        "componentId": "ssbu-mario-c00-ultimate14-motion-v1",
        "sourceAnalysis": "materials/hero-model-library/priority-evidence/ssbu-mario/2ae1470b099ac7340cacbf9973b484b59faefa707be3aa7a68878adca10aabc8/source-analysis.json",
        "motionImport": "materials/hero-model-library/priority-evidence/ssbu-mario-motion/28149d8ae2b38abede317ae060de977cd71539c5ca951710c94179e92675c176/import-receipt.json",
        "motionValidation": "materials/hero-model-library/priority-evidence/ssbu-mario-motion/28149d8ae2b38abede317ae060de977cd71539c5ca951710c94179e92675c176/validation.json",
    },
    {
        "heroId": "acquired-mewtwo", "nameZh": "Mewtwo／超夢", "fighterId": "mewtwo", "formId": "c00",
        "componentId": "ssbu-mewtwo-c00-static-skinned-v1",
        "sourceAnalysis": "materials/hero-model-library/priority-evidence/ssbu-mewtwo/e43dafe8f8e646a866c212e190e5d3c33d25a3284ce4d218065b908cac1dd66c/source-analysis.json",
    },
    {
        "heroId": "acquired-pokemon-trainer", "nameZh": "Pokémon Trainer／寶可夢訓練家（男）", "fighterId": "ptrainer", "formId": "male-c00",
        "componentId": "ssbu-ptrainer-male-c00-formal-decimated-v1",
        "sourceComponentId": "ssbu-ptrainer-male-c00-static-skinned-v1",
        "sourceAnalysis": "materials/hero-model-library/priority-evidence/ssbu-ptrainer/c2ec0952d0aaeaa144d6475eb5b51a83ddd59b00df7b5fe48d308b55cac33530/source-analysis.json",
    },
    {
        "heroId": "acquired-pokemon-trainer", "nameZh": "Pokémon Trainer／寶可夢訓練家（女）", "fighterId": "ptrainer", "formId": "female-c01",
        "componentId": "ssbu-ptrainer-female-c01-formal-decimated-v1",
        "sourceComponentId": "ssbu-ptrainer-female-c01-static-skinned-v1",
        "sourceAnalysis": "materials/hero-model-library/priority-evidence/ssbu-ptrainer/5b8c9a6e94553bf149b7c82167d0491fb8af571555d3734d0f6f2e82a20b62cf/source-analysis.json",
    },
    {
        "heroId": "acquired-minecraft", "nameZh": "Steve／史蒂夫", "fighterId": "pickel", "formId": "steve-c00",
        "componentId": "ssbu-pickel-steve-c00-static-skinned-v1",
        "sourceAnalysis": "materials/hero-model-library/priority-evidence/ssbu-pickel/45afba9e5de637a81baf4690257d33412c67c39ba3a7e046166758f70de51115/source-analysis.json",
    },
    {
        "heroId": "acquired-minecraft", "nameZh": "Alex／艾莉克斯", "fighterId": "pickel", "formId": "alex-c01",
        "componentId": "ssbu-pickel-alex-c01-static-skinned-v1",
        "sourceAnalysis": "materials/hero-model-library/priority-evidence/ssbu-pickel/c7dcfceadbce199b1bd41e928c25ae49196fa668ffcef21475fe8c0a4c84bb7e/source-analysis.json",
    },
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_json(path: Path | str) -> dict[str, Any]:
    value = Path(path)
    if not value.is_absolute():
        value = REPO / value
    return json.loads(value.read_text())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pin(path: Path, expected_bytes: int | None = None, expected_sha: str | None = None) -> dict[str, Any]:
    require(path.is_file(), f"missing local file: {path}")
    actual = {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}
    if expected_bytes is not None:
        require(actual["bytes"] == expected_bytes, f"byte count changed: {path}")
    if expected_sha is not None:
        require(actual["sha256"] == expected_sha, f"SHA-256 changed: {path}")
    return actual


def glb_animation_names(path: Path) -> list[str]:
    raw = path.read_bytes()
    require(raw[:4] == b"glTF" and struct.unpack_from("<I", raw, 4)[0] == 2, f"not GLB v2: {path}")
    offset = 12
    while offset + 8 <= len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset:offset + length]
        offset += length
        if kind == 0x4E4F534A:
            doc = json.loads(chunk.decode().rstrip(" \t\r\n\0"))
            return [row.get("name", "") for row in doc.get("animations", [])]
    raise ValueError(f"missing GLB JSON chunk: {path}")


def parse_current_hero_forge() -> tuple[dict[str, list[str]], dict[str, str]]:
    source = (REPO / "packages/shared/src/content/heroForge/communityAcquired.ts").read_text()
    options: dict[str, list[str]] = {}
    defaults: dict[str, str] = {}
    for hero in CURRENT_OPTIONS:
        match = re.search(rf'"{re.escape(hero)}"\s*:\s*\[([^\]]*)\]', source)
        default = re.search(rf'"{re.escape(hero)}"\s*:\s*"([^"]+)"', source)
        require(match is not None and default is not None, f"missing Hero Forge records for {hero}")
        options[hero] = re.findall(r'"([^"]+)"', match.group(1))
        defaults[hero] = default.group(1)
    for hero, required in CURRENT_OPTIONS.items():
        require(all(value in options[hero] for value in required), f"existing manual option disappeared for {hero}")
    require(defaults == CURRENT_DEFAULTS, "one of the four manual defaults changed")
    return options, defaults


def source_files(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    records = [pin(Path(analysis["source"]), analysis["sourceBytes"], analysis["sourceSha256"])]
    for image in analysis["usedImages"]:
        records.append(pin(Path(image["resolvedPath"]), image["bytes"], image["sha256"]))
    return records


def build() -> dict[str, Any]:
    resources = read_json("materials/asset-library/current-resources.json")
    components = {row["id"]: row for row in resources["modelComponents"]}
    policy = read_json("materials/hero-model-library/priority-evidence/current-component-policy-audit.json")
    policies = {row["id"]: row for row in policy["records"]}
    roster = read_json("materials/hero-model-library/source-inventories/ssbu-ultimate-local-roster-v1/inventory.json")
    fighters = {row["nativeId"]: row for row in roster["fighters"]}
    options, defaults = parse_current_hero_forge()
    rows: list[dict[str, Any]] = []
    for spec in CANDIDATES:
        component = components.get(spec["componentId"])
        require(component is not None, f"central component missing: {spec['componentId']}")
        component_policy = policies.get(spec["componentId"])
        require(component_policy is not None, f"policy record missing: {spec['componentId']}")
        glb = REPO / component["gitPath"]
        glb_pin = pin(glb, component["bytes"], component["sha256"])
        require(component_policy["sha256"] == glb_pin["sha256"], f"policy SHA mismatch: {spec['componentId']}")
        require(component_policy["runtimeBudget"]["pass"] is True, f"hard policy failed: {spec['componentId']}")
        analysis = read_json(spec["sourceAnalysis"])
        source_component_id = spec.get("sourceComponentId", spec["componentId"])
        require(analysis["candidateId"] in {source_component_id, "ssbu-mario-c00-static-skinned-v2"}, "source analysis identity mismatch")
        require(analysis["sourceId"] == "gitlab-ssbu-models", "unexpected model source ID")
        require(analysis["actions"] == [], f"Worldblender source unexpectedly contains actions: {spec['componentId']}")
        fighter = fighters[spec["fighterId"]]
        native_names = glb_animation_names(glb)
        motion_files: list[dict[str, Any]] = []
        if "motionImport" in spec:
            receipt = read_json(spec["motionImport"])
            for item in receipt["imports"]:
                motion_files.append({**pin(Path(item["path"]), item["bytes"], item["sha256"]), "nativeClipName": item["action"]})
            validation = read_json(spec["motionValidation"])
            require(validation["structuralValidationPassed"] is True, "Mario structural motion validation failed")
            require(validation["completeGameplayActionSet"] is False, "Mario was incorrectly labeled six-state complete")
            require(native_names == [row["nativeClipName"] for row in motion_files], "Mario GLB clip names differ from NUANMB inputs")
        else:
            require(native_names == [], f"static model unexpectedly contains animations: {spec['componentId']}")
        formal = component_policy["formalHeroAdoption"]
        blocker = "six-state-actions-and-owner-semantic-review"
        if formal["requiresDecimatedCandidate"]:
            blocker = "formal-decimation-plus-six-state-actions-and-owner-semantic-review"
        rows.append({
            **{k: spec[k] for k in ("heroId", "nameZh", "fighterId", "formId", "componentId")},
            "workZh": "任天堂明星大亂鬥 特別版", "platform": component["platform"],
            "modelSourceId": "gitlab-ssbu-models", "motionSourceId": component["sourceId"] if motion_files else None,
            "nativeId": component["nativeId"], "sourceFiles": source_files(analysis), "nativeMotionFiles": motion_files,
            "gitModel": {"gitPath": component["gitPath"], **{k: glb_pin[k] for k in ("bytes", "sha256")}},
            "metrics": component_policy["metrics"], "runtimeBudget": component_policy["runtimeBudget"],
            "formalHeroAdoption": formal, "nativeClipNames": native_names,
            "sourceMotionInventory": {
                "aliasCount": fighter["ultimate14"]["motionAliasCount"],
                "bodyAliasCount": fighter["ultimate14"]["bodyMotionAliasCount"],
                "uniqueBodyPayloadCount": fighter["ultimate14"]["uniqueBodyMotionPayloadCount"],
            },
            "semanticClipMap": {}, "missingRequiredStates": REQUIRED_STATES,
            "modelComponentAccepted": True, "sixStateComplete": False,
            "modelOptionRegistered": False, "defaultPreserved": defaults[spec["heroId"]],
            "blocker": blocker, "s3": {"existingUri": component.get("s3Uri"), "readbackReverifiedByThisWorkflow": False},
            "productionDeploymentVerified": False,
        })
    unique_sources = {item["absolutePath"]: item for row in rows for item in row["sourceFiles"] + row["nativeMotionFiles"]}
    review = []
    for hero_id, name in [
        ("acquired-mario", "Mario／瑪利歐"), ("acquired-mewtwo", "Mewtwo／超夢"),
        ("acquired-pokemon-trainer", "Pokémon Trainer／寶可夢訓練家"), ("acquired-minecraft", "Steve／Alex"),
    ]:
        hero_rows = [row for row in rows if row["heroId"] == hero_id]
        review.append({
            "candidateId": f"{hero_id}-hurt-rise-fade-death-v1", "heroId": hero_id, "targetName": name,
            "proposal": "受傷或倒地動作後，角色向上位移並以 alpha 淡出；僅在 owner 視覺審查核准後可綁 death。",
            "status": "blocked-no-verified-hurt-or-down-clip",
            "verifiedTargetSkeletonMotion": False, "reviewMediaReady": False, "ownerDecision": "pending",
            "sourceNativeClips": sorted({clip for row in hero_rows for clip in row["nativeClipNames"]}),
            "automaticBindingAllowed": False,
        })
    return {
        "schema": "ggd.ssbu-missing-four-audit@1", "generatedAt": "2026-09-14",
        "scope": {"heroes": 4, "variants": 6, "sourceIds": ["gitlab-ssbu-models", "parallel-ns-ultimate14"]},
        "summary": {
            "acceptedModelComponents": len(rows), "sourceFilesFreshlyHashed": len(unique_sources),
            "nativeMotionComponents": sum(bool(row["nativeClipNames"]) for row in rows),
            "nativeClipCount": sum(len(row["nativeClipNames"]) for row in rows),
            "formalGeometryEligibleVariants": sum(row["formalHeroAdoption"]["eligible"] for row in rows),
            "formalDecimationRequiredVariants": sum(row["formalHeroAdoption"]["requiresDecimatedCandidate"] for row in rows),
            "sixStateCompleteVariants": 0, "newRuntimeDropdownOptions": 0, "reviewMediaReady": 0,
            "productionDeployed": 0,
        },
        "currentManualDefaults": defaults, "candidates": rows, "deathSubstitutionReview": review,
        "decisions": [
            "Mario 的 5 段 d01special* 保留原始名稱與順序，未映射 idle/run/attack/cast/hurt/death。",
            "Mewtwo、Pokémon Trainer、Steve/Alex 在固定 Worldblender 與 Ultimate14 來源中沒有原生 body motion。",
            "Pokémon Trainer 男／女已由 10,698／11,086 面來源重建為 7,896／7,892 面候選；逐位元重建、Khronos、GGD policy、材質貼圖骨架保存與 Babylon 三視角 A/B 通過。",
            "Pokémon Trainer 新減面階段尚未上傳 S3；來源轉換既有備份不宣稱涵蓋本批新階段。",
            "死亡替代目前都沒有目標骨架上的 hurt/down 播放證據，因此只保留提案，不建立 model@1、不加下拉選項、不自動綁定。",
            "既有手動預設完全保留；本收據不代表 Main 合併或正式站部署。",
        ],
    }


def report_block(audit: dict[str, Any]) -> str:
    by_hero: dict[str, list[dict[str, Any]]] = {}
    for row in audit["candidates"]:
        by_hero.setdefault(row["heroId"], []).append(row)
    lines = [
        START, "", "### SSBU 四組模型／動作缺口實檔複核", "",
        f"固定本機來源重讀後共有 **{audit['summary']['acceptedModelComponents']} 個已驗收模型變體**，逐檔新算 {audit['summary']['sourceFilesFreshlyHashed']} 個來源 SHA-256。只有 Mario 有 5 段 Ultimate14 社群 MOD 原生特殊動作；目前 **0 個六態完整候選、0 個新增後台選項、0 個正式站部署**。", "",
        "| 角色 | 已驗收模型 | 原生動作 | 正式採用幾何 | 六態／下拉狀態 |", "|---|---:|---:|---|---|",
    ]
    for hero_id in ("acquired-mario", "acquired-mewtwo", "acquired-pokemon-trainer", "acquired-minecraft"):
        rows = by_hero[hero_id]
        clips = sum(len(row["nativeClipNames"]) for row in rows)
        formal = "通過" if all(row["formalHeroAdoption"]["eligible"] for row in rows) else "仍需 ≤8,000 面候選"
        display = "Steve／Alex" if hero_id == "acquired-minecraft" else rows[0]["nameZh"].split("（")[0]
        lines.append(f"| {display}（`{hero_id}`） | {len(rows)} | {clips} | {formal} | 六態缺；未新增 model@1／下拉 |")
    lines += [
        "", "Pokémon Trainer 男／女已分別從 10,698／11,086 面降到 7,896／7,892 面；逐位元重建、Khronos 0 error／0 warning、GGD hard policy、材質／貼圖／骨架保存與 Babylon front/back/isometric A/B 均通過。最大 changed-pixel 差異為 0.300156%／0.224531%（契約上限 5%）。新減面階段 S3 仍為待上傳。", "",
        "Mario 的原生 clip 保留 `d01specialairsdash`、`d01specialairsend`、`d01specialairsjump`、`d01specialsdash`、`d01specialsend`，沒有把特殊招式硬標為六態。其餘三組固定來源原生 body motion 都是 0。", "",
        "四組的「hurt/down＋向上淡出」死亡替代均為待 owner 審查提案；目前沒有目標骨架 hurt/down 動作與可播放審查媒體，所以不可自動綁定。既有 `imported.linkstik`、`imported.herobuu`、`imported.heropikachu`、`champ.thorne` 預設保持不變。", "",
        "來源：`tools/hero-model-library/source-workflows/ssbu-missing-four-v1/build_audit.py`；收據：`materials/hero-model-library/priority-evidence/ssbu-missing-four-v1/audit.json`。", "", END,
    ]
    return "\n".join(lines)


def payload(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--update-report", action="store_true")
    args = parser.parse_args()
    audit = build()
    outputs = {
        OUT / "audit.json": payload(audit),
        OUT / "death-substitution-review.json": payload({"schema": "ggd.ssbu-death-substitution-review@1", "candidates": audit["deathSubstitutionReview"]}),
    }
    for path, expected in outputs.items():
        if args.write:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(expected)
        else:
            require(path.is_file() and path.read_bytes() == expected, f"stale output: {path.relative_to(REPO)}")
    if args.update_report:
        report = REPORT.read_text()
        block = report_block(audit)
        if START in report:
            before, tail = report.split(START, 1)
            _, after = tail.split(END, 1)
            updated = before + block + after
        else:
            marker = "## 八、限制與自動化工具"
            require(marker in report, "report insertion anchor missing")
            updated = report.replace(marker, block + "\n\n" + marker, 1)
        if args.write:
            REPORT.write_text(updated)
        else:
            require(report == updated, "four-day report is stale")
    print(json.dumps(audit["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
