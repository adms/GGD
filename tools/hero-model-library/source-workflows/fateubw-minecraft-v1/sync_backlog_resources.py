#!/usr/bin/env python3
"""Synchronize FateUBW per-servant conversion facts into resource coverage."""
import argparse
import json
from pathlib import Path


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
IDENTITIES = {
    "artoria_pendragon_saber": "saber",
    "cu_chulainn_lancer": "cu-chulainn",
    "diarmuid_ua_duibhne_lancer": "diarmuid",
    "emiya_archer": "emiya-archer",
    "gilgamesh_archer": "gilgamesh",
    "gilles_de_rais_caster": "gilles-de-rais",
    "hassan-i-sabbah_assassin": "hassan",
    "heracles_berserker": "heracles",
    "iskander_rider": "iskander",
    "lancelot_berserker": "lancelot",
    "medea_caster": "medea",
    "medusa_rider": "medusa",
    "nero_claudius_saber": "nero-claudius",
    "sasaki_kojiro_assassin": "sasaki-kojiro",
}


def read(path):
    return json.loads(path.read_text())


def add_path(paths, value):
    if isinstance(value, dict):
        value = value.get("path")
    if isinstance(value, str) and value not in paths:
        paths.append(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--workspace", type=Path,
                        help="workspace containing GGD-Asset-Library when using an isolated Git worktree")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    library = repo / "materials/hero-model-library"
    source_path = library / "download-sources.json"
    coverage_path = library / "design-backlog/resource-coverage.json"
    source_doc = read(source_path)
    source = next(row for row in source_doc["publicSources"] if row["id"] == SOURCE_ID)
    workspace = args.workspace.resolve() if args.workspace else repo.parent
    source_root = workspace / source["localPath"]
    candidates = [row for row in source["modelCandidates"] if "/servant/" in row.get("sourceModel", "")]
    if len(candidates) != 14 or {row["character"] for row in candidates} != set(IDENTITIES):
        raise ValueError("FateUBW servant set drifted; review identity mapping before synchronization")
    attempts = {row["id"]: row for row in source.get("conversionAttempts", [])}
    coverage = read(coverage_path)
    family = next(row for row in coverage["sourceFamilies"] if row["id"] == "fateubw-community")
    family["model"] = (
        "14名英靈均已轉為靜態GLB並通過結構、Khronos與WebGL驗證，並各有骨架及原生動作GLB。"
        "5個道具／生物仍保留原始幾何JSON。全部待權利、來源引擎比對、事件映射與後台驗收。"
    )
    family["motion"] = (
        "20個動畫JSON共156項：14名英靈合計132項，已轉換112項原生動作、"
        "保留20項公式／無時長片段。Heracles的9個靜態旋轉末端骨已採休息姿勢烘焙及完整逆綁定矩陣轉換。"
        "5個道具／生物20項及共用4項仍為原始格式；非FUC PSP。"
    )
    for candidate in candidates:
        identity = IDENTITIES[candidate["character"]]
        override = coverage["characterOverrides"].setdefault(identity, {})
        source_count = candidate["sourceAnimation"]["clipCount"]
        native_meta = candidate.get("nativeMotionStandardization")
        if native_meta:
            converted = native_meta["convertedClipCount"]
            unconverted = native_meta["unconvertedClipCount"]
            override["motion"] = (
                f"FateUBW Minecraft MOD：來源 {source_count} 個片段，已轉換 {converted} 個原生動作；"
                f"{unconverted} 個公式／無時長等片段保留未轉換。已通過結構、Khronos 與分段 WebGL 驗證；"
                "待來源引擎曲線比對、事件映射、權利與後台驗收；非FUC PSP。"
            )
            attempt = attempts[native_meta["attemptId"]]
        else:
            override["motion"] = (
                f"FateUBW Minecraft MOD：來源 {source_count} 個片段尚未轉成原生動作 GLB；"
                "Heracles 來源休息骨架含旋轉，已完成靜態 GLB 驗證，須以獨立旋轉骨架流程轉換動作。"
                "待權利、事件映射與後台驗收；非FUC PSP。"
            )
            attempt = attempts[candidate["bodyStandardization"]["attemptId"]]
        paths = override.setdefault("evidencePaths", [])
        # An isolated worktree used to derive the sibling asset-library path
        # from /private/tmp.  Remove only those impossible generated locators;
        # preserve every curated or valid workspace path.
        paths[:] = [value for value in paths if not value.startswith("/private/tmp/GGD-Asset-Library/")]
        add_path(paths, str((source_root / candidate["sourceAnimation"]["path"]).resolve()))
        add_path(paths, attempt.get("body"))
        add_path(paths, attempt.get("contractValidation"))
        add_path(paths, attempt.get("structuralReadback"))
        add_path(paths, attempt.get("restPoseParity"))
        phase = attempt.get("webglPhaseReview") or {}
        for key in ("proof", "run", "visualAssessment", "manualReview", "contactSheet"):
            add_path(paths, phase.get(key))
        batch = attempt.get("batchEvidence") or {}
        for key in ("manifest", "webgl", "visualAssessment", "manualReview", "contactSheet"):
            add_path(paths, batch.get(key))
        override["scope"] = "FateUBW source and verified local conversion reserve; no runtime, rights or deployment claim"
    encoded = (json.dumps(coverage, ensure_ascii=False, indent=2) + "\n").encode()
    current = coverage_path.read_bytes()
    if args.check:
        if current != encoded:
            raise SystemExit("FateUBW resource coverage is stale; run sync_backlog_resources.py")
        print(json.dumps({"status": "current", "servants": len(candidates), "nativeMotionConverted": 14,
                          "staticOnly": 0}, ensure_ascii=False))
        return
    coverage_path.write_bytes(encoded)
    print(json.dumps({"status": "updated" if current != encoded else "unchanged",
                      "servants": len(candidates), "nativeMotionConverted": 14,
                      "staticOnly": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
