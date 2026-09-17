#!/usr/bin/env python3
"""Build an evidence-limited conversion contract for six priority J-Stars heroes."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


SCHEMA = "ggd.jstars-priority-contract@1"
MODULES = ("model", "motion", "vfx", "sfx", "voice")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def workflow_root(repo: Path) -> Path:
    return repo / "tools/hero-model-library/source-workflows/jstars-priority-contract-v1"


def output_root(repo: Path) -> Path:
    return repo / "materials/hero-model-library/source-inventories/jstars-priority-contract-v1"


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def runtime_policy(repo: Path) -> dict[str, Any]:
    script = workflow_root(repo) / "emit_runtime_policy.mts"
    completed = subprocess.run(
        ["node", "--import", "tsx", str(script)],
        cwd=repo,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"runtime policy helper failed: {completed.stderr.strip()}")
    value = json.loads(completed.stdout)
    if not isinstance(value, dict):
        raise ValueError("runtime policy helper returned a non-object")
    return value


def find_plan_row(plan: dict[str, Any], english_name: str) -> dict[str, Any] | None:
    return next(
        (
            row
            for row in plan.get("characters", [])
            if isinstance(row, dict) and row.get("nameEnglish") == english_name
        ),
        None,
    )


def find_sample_row(analysis: dict[str, Any], slug: str) -> dict[str, Any] | None:
    return next(
        (
            row
            for row in analysis.get("characters", [])
            if isinstance(row, dict) and row.get("slug") == slug
        ),
        None,
    )


def member_paths(sample: dict[str, Any] | None) -> tuple[list[str], list[str]]:
    containers: list[str] = []
    split: list[str] = []
    if not sample:
        return containers, split
    for pair in sample.get("pairs", []):
        if not isinstance(pair, dict):
            continue
        for key in ("pak", "stpk"):
            row = pair.get(key)
            if isinstance(row, dict) and row.get("path"):
                containers.append(str(row["path"]))
        for row in pair.get("splitOutputs", []):
            if isinstance(row, dict) and row.get("path"):
                split.append(str(row["path"]))
    return sorted(set(containers)), sorted(set(split))


def empty_module(location: str | None = None) -> dict[str, Any]:
    return {
        "containerStatus": "not-observed",
        "containerLocations": [location] if location else [],
        "conversionStatus": "not-started",
        "runtimeStatus": "not-registered",
        "gap": "owner archive is absent or has no verified character-to-container mapping",
    }


def character_contract(
    character: dict[str, Any], plan: dict[str, Any], analysis: dict[str, Any]
) -> dict[str, Any]:
    plan_row = find_plan_row(plan, str(character["nameEnglish"]))
    sample = find_sample_row(analysis, str(character["slug"]))
    native_id = plan_row.get("nativeId") if plan_row else None
    identity_status = "unverified-native-id"
    if sample and sample.get("nativeCharacterId") == native_id and native_id:
        identity_status = str(sample.get("identityStatus") or "native-id-observed")
    elif native_id:
        identity_status = "native-id-from-existing-plan-only"

    modules = {kind: empty_module() for kind in MODULES}
    containers, split = member_paths(sample)
    if sample and native_id:
        model_split = [
            path
            for path in split
            if Path(path).suffix.casefold() in {".srd", ".srdi", ".srdv", ".sa", ""}
        ]
        modules["model"] = {
            "containerStatus": "observed-native-pak-stpk-and-split-members",
            "containerLocations": containers + model_split,
            "conversionStatus": "blocked-ps3-srd-to-glb-converter-unverified",
            "runtimeStatus": "not-registered",
            "gap": "$CLH/$CH0 decode and PS3 SRD/SRDI/SRDV geometry, rig and texture conversion are not verified",
        }
        vfx_paths = [path for path in split if "color_effect" in Path(path).name.casefold()]
        if vfx_paths:
            modules["vfx"] = {
                "containerStatus": "related-member-observed-not-decoded",
                "containerLocations": vfx_paths,
                "conversionStatus": "not-started",
                "runtimeStatus": "not-bound",
                "gap": "effect payload and event identity are unverified",
            }
        lps_paths = [path for path in split if "_stream_jp_lps_" in Path(path).name.casefold()]
        if lps_paths:
            modules["voice"] = {
                "containerStatus": "related-lps-member-observed-not-audio-confirmed",
                "containerLocations": lps_paths,
                "conversionStatus": "not-started",
                "runtimeStatus": "not-bound",
                "gap": "LPS member is not proof of decodable voice; speaker, language and event require review",
            }

    if not native_id:
        unknown = "unknown until owner archive inventory proves this character's native ID"
        for module in modules.values():
            module["containerLocations"] = []
            module["gap"] = unknown

    commands = [
        "python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py --archive \"/absolute/path/J-Stars Victory Vs+.7z\"",
        "python3 tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/pipeline.py --receipt /absolute/path/jstars-extraction-receipt.json --output /absolute/path/jstars-runtime-output --mode plan",
    ]
    if native_id:
        commands.append(
            "node --import tsx tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/prepare_runtime_candidate.mts "
            f"--repo . --input /absolute/path/{native_id}-{character['slug']}.glb "
            f"--selections /absolute/path/{native_id}-animation-selections.json "
            f"--metadata /absolute/path/{native_id}-metadata.json "
            f"--output /absolute/path/jstars-runtime-output/{character['slug']} --mode plan"
        )

    return {
        **character,
        "nativeId": native_id,
        "identityStatus": identity_status,
        "modules": modules,
        "availableConverterStages": {
            "archiveInventory": True,
            "cmpTableAndBoundsInspection": True,
            "stpkMemberSplit": True,
            "ps3SrdToSkinnedGlb": False,
            "runtimeGlbPreparationAndVerification": True,
            "modelOptionRegistration": True,
            "checkedVfxSfxVoiceBinding": False,
        },
        "nextCommands": commands,
        "conversionComplete": False,
        "registered": False,
        "deployVerified": False,
    }


def build(repo: Path) -> dict[str, Any]:
    source = load_json(workflow_root(repo) / "source-reference.json")
    inputs = source["authoritativeInputs"]
    plan = load_json(repo / inputs["ownerPlan"])
    archive = load_json(repo / inputs["ownerArchiveReceipt"])
    analysis = load_json(repo / inputs["publicSampleAnalysis"])
    policy = runtime_policy(repo)
    preparer_path = repo / "tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/prepare_runtime_candidate.mts"
    preparer_source = preparer_path.read_text(encoding="utf-8")
    uses_inclusive_policy_max = (
        "optimizedInspection.triangles <= HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax"
        in preparer_source
    )
    accepts_8000 = uses_inclusive_policy_max and policy["decimatedTargetTrianglesMax"] >= 8000
    characters = [character_contract(row, plan, analysis) for row in source["characters"]]
    return {
        "schema": SCHEMA,
        "sourceId": source["sourceId"],
        "sourceGame": source["sourceGame"],
        "platform": source["platform"],
        "archive": {
            "fileName": source["archiveFileName"],
            "status": archive.get("status"),
            "path": archive.get("source", {}).get("path") if isinstance(archive.get("source"), dict) else None,
            "archiveEntries": archive.get("summary", {}).get("archiveEntries", 0),
            "characterTokens": archive.get("summary", {}).get("characterTokens", 0),
        },
        "nativeContainerContract": {
            "outer": "7z -> PS3 ISO (expected; owner archive not currently visible)",
            "model": "$CMP PAK -> STPK -> SRD/SRDI/SRDV and related members",
            "motion": "unknown until owner archive member inventory; do not infer from roster order",
            "vfx": "character effect member or dedicated effect container; event mapping must be verified",
            "sfx": "unknown until owner archive member inventory and audio decode",
            "voice": "unknown until owner archive member inventory and audio decode; LPS alone is insufficient",
        },
        "runtimePolicy": policy,
        "ownerAdoptionRule": {
            "decimateOnlyWhenTrianglesAbove": policy["decimateWhenTrianglesAbove"],
            "decimatedCandidateMustBeAtMost": 8000,
            "maximumAcceptedTriangles": policy["decimatedTargetTrianglesMax"],
            "source": "owner current instruction for this asset-library workflow",
        },
        "policyConflict": {
            "exists": not accepts_8000,
            "detail": (
                "resolved: owner rule accepts outputTriangles <= 8000; adoptionPolicy.json sets "
                f"decimatedTargetTrianglesMax={policy['decimatedTargetTrianglesMax']} and the runtime preparer accepts "
                f"<= {policy['decimatedTargetTrianglesMax']}"
            ),
            "evidence": str(preparer_path.relative_to(repo)),
            "scope": "recorded only; this lane does not modify shared runtime policy files",
        },
        "policyInterpretation": {
            "geometry": (
                f"only sources strictly above {policy['decimateWhenTrianglesAbove']} triangles are decimated; "
                "owner acceptance requires the resulting candidate to be at most 8000 triangles "
                f"(configured maximum {policy['decimatedTargetTrianglesMax']})"
            ),
            "texture": "all hero textures must remain at or below the runtime texture edge limit",
            "motion": ["idle", "run", "attack", "cast", "hurt", "death"],
            "registration": "register an independent non-default option only after identity, model, rig, motion and official verification pass",
            "audioAndVfx": "inventory candidates first; do not bind events without per-file identity and owner review",
        },
        "characters": characters,
        "summary": {
            "characters": len(characters),
            "nativeIdsVerified": sum(row["identityStatus"].startswith("archive-directory") for row in characters),
            "nativeIdsKnown": sum(row["nativeId"] is not None for row in characters),
            "charactersConverted": 0,
            "charactersRegistered": 0,
            "charactersDeployed": 0,
        },
        "tools": [
            {
                "path": "tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py",
                "capability": "read-only 7z and nested ISO inventory plus native-token discovery",
                "status": "available",
            },
            {
                "path": "tools/hero-model-library/source-workflows/jstars-stpk-research-v1/inventory.py",
                "capability": "$CMP inspection and safe STPK member split",
                "status": "available-for-public-comparison-sample",
            },
            {
                "path": "tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/pipeline.py",
                "capability": "nine-stage conversion and registration orchestration",
                "status": "available-but-blocked-by-upstream-skinned-glb-and-verified-module-receipts",
            },
            {
                "path": "tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/prepare_runtime_candidate.mts",
                "capability": "official decimation, texture normalization, six-state motion map and GLB verification",
                "status": "available-after-ps3-conversion",
            },
            {
                "path": "tools/model-budget/optimize.ts",
                "capability": "non-destructive skin-aware geometry and texture optimization",
                "status": "available-after-skinned-glb-exists",
            },
        ],
        "gaps": [
            "owner archive receipt is blocked until J-Stars Victory Vs+.7z becomes locally visible",
            "five of six priority character native IDs are unproven and must not be guessed",
            "$CLH/$CH0 native decode is incomplete",
            "no validated PS3 SRD/SRDI/SRDV to skinned GLB converter is present",
            "no six-state native motion selection receipt exists for any of the six",
            "no checked VFX, SFX or voice event binder exists for any of the six",
        ],
        "evidence": inputs,
    }


def render_readme(payload: dict[str, Any]) -> str:
    p = payload["runtimePolicy"]
    lines = [
        "# J-Stars 優先六角色容器與上架契約",
        "",
        f"- owner archive 狀態：`{payload['archive']['status']}`",
        f"- 已知原生 ID：{payload['summary']['nativeIdsKnown']} / {payload['summary']['characters']}（目前只有奇犚 `018`）",
        "- 已轉換／已註冊／已部署：0 / 0 / 0",
        "",
        "## 現行政策（由程式即時讀取）",
        "",
        f"- 來源超過 **{p['decimateWhenTrianglesAbove']:,}** 三角面才啟動減面；owner 驗收要求減面候選不超過 **{p['decimatedTargetTrianglesMax']:,}** 面。",
        "- 正式 `adoptionPolicy.json` 與 `prepare_runtime_candidate.mts` 同樣採用含 8,000 的上限，現無契約差異。",
        f"- runtime 三角面警戒／上限：{p['triangleRuntimeWarning']:,} / {p['triangleRuntimeLimit']:,}。",
        f"- draw primitive 警戒／上限：{p['drawPrimitiveWarning']} / {p['drawPrimitiveLimit']}。",
        f"- 貼圖最長邊：{p['textureEdgeLimit']}px；動畫通道警戒／上限：{p['animationChannelWarning']} / {p['animationChannelLimit']}。",
        "",
        "## 六角色證據狀態",
        "",
        "| 順位 | 角色 | 作品 | native ID | 模型 | 動作 | VFX | SFX | 語音 |",
        "|---:|---|---|---|---|---|---|---|---|",
    ]
    for row in payload["characters"]:
        status = [row["modules"][module]["containerStatus"] for module in MODULES]
        lines.append(
            f"| {row['priority']} | {row['nameZhTW']} | {row['workZhTW']} | {row['nativeId'] or '未證明'} | "
            + " | ".join(f"`{value}`" for value in status)
            + " |"
        )
    lines += [
        "",
        "## 格式與現有程式",
        "",
        "- 原生模型流程是 `$CMP PAK -> STPK -> SRD/SRDI/SRDV`。現有程式可做 table/bounds 檢查與 STPK 安全分拆。",
        "- `$CLH` 裡的 `$CH0` 解碼與 PS3 SRD 幾何／骨架／貼圖轉 GLB 還沒有通過本機驗證。",
        "- 有 skinned GLB 以後，已有的 `prepare_runtime_candidate.mts` 會呼叫正式減面器、貼圖正規化、六態動作映射與 runtime 驗證。",
        "- VFX／SFX／voice 必須先逐檔確認身分與事件；只有容器或 LPS 成員不能算已轉換或已綁定。",
        "",
        "## 下一步",
        "",
        "```bash",
        "python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py --archive \"/absolute/path/J-Stars Victory Vs+.7z\"",
        "python3 tools/hero-model-library/source-workflows/jstars-priority-contract-v1/build_contract.py",
        "python3 tools/hero-model-library/source-workflows/jstars-priority-contract-v1/build_contract.py --check",
        "```",
        "",
        "完整逐角色容器位置、下一步命令、轉換器可用性與缺口在 `inventory.json`。",
        "",
    ]
    return "\n".join(lines)


def check_or_write(path: Path, text: str, check: bool) -> bool:
    if check:
        actual = path.read_text(encoding="utf-8") if path.is_file() else None
        if actual != text:
            print(f"OUTDATED {path}", file=sys.stderr)
            return False
        print(f"OK {path}")
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print(path)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = repo_root()
    payload = build(repo)
    output = output_root(repo)
    inventory = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    results = [
        check_or_write(output / "inventory.json", inventory, args.check),
        check_or_write(output / "README.md", render_readme(payload), args.check),
    ]
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
