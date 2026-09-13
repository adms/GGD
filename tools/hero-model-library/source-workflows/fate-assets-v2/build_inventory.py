#!/usr/bin/env python3
"""Build a strict, platform-separated Fate source and registration-readiness inventory."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
WORKSPACE = ROOT.parent
BASE = ROOT / "materials/hero-model-library"
OUT = BASE / "source-inventories/fate-assets-v2"
SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
REQUIRED_ACTIONS = ("idle", "run", "hurt", "death", "attack")


def read(path: Path):
    return json.loads(path.read_text())


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def pin(path: Path) -> dict:
    return {"gitPath": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": digest(path)}


def verify_file(path: Path, expected_sha: str, expected_bytes: int | None = None) -> dict:
    if not path.is_file():
        raise ValueError(f"missing local source file: {path}")
    actual_sha, actual_bytes = digest(path), path.stat().st_size
    if actual_sha != expected_sha or (expected_bytes is not None and actual_bytes != expected_bytes):
        raise ValueError(f"local source bytes differ: {path}")
    return {"absolutePath": str(path), "bytes": actual_bytes, "sha256": actual_sha, "liveVerified": True}


def semantic_candidates(names: list[str], character: str) -> dict:
    exact = {name.casefold(): name for name in names}
    attack_prefixes = ("one_hand_", "two_hand_", "spear_", "dual_spear_", "dual_slash_", "bow_", "babylon_", "dagger_", "cast_", "dual_reverse_")
    attack_exact = {
        "stab", "stab_1", "top_stab", "spear_stab_combo", "horizontal_slashes", "vertical_slashes",
        "invisible_burst", "invisible_burst_hit", "excalibur", "gae_bolg", "hogou_unseal", "ea", "shoot",
        "upper_cut", "jump_hit", "leap_slash", "trident", "bow", "crossbow", "gun", "rule_breaker",
        "chain_throw", "bellerophon", "aestus_domus_aurea", "aestus_domus_aurea_full", "katana_1", "tsubame_gaeshi",
    }
    attack = [name for name in names if name.casefold().startswith(attack_prefixes) or name.casefold() in attack_exact]
    result = {
        "idle": [],
        "run": [exact["run"]] if "run" in exact else [],
        "hurt": [],
        "death": [exact["death"]] if "death" in exact else [],
        "attack": attack,
    }
    if character == "heracles_berserker":
        result["idleDerivativeReviewCandidate"] = ["derived-formula-loop-idle"]
        result["fakeDeathSeparate"] = ["fake_death"] if "fake_death" in exact else []
    return result


def render_md(data: dict) -> str:
    s = data["summary"]
    lines = [
        "# Fate 素材平台分流與 14 名英靈整合狀態",
        "",
        "本頁由 `build_inventory.py` 從 Fate/Unlimited Block Works、Fate/unlimited codes 平台索引、現行模型限制與本機實檔重建。Minecraft 社群模型與 PSP／PS2 原遊戲來源永久分開；通過模型限制不代表取得再散布權、動作事件已核准、後台可切換或正式站已部署。",
        "",
        "## 結果",
        "",
        f"- FateUBW Minecraft 英靈：{s['minecraftServants']} 名；來源模型／貼圖／動作各 {s['rawModelFilesVerified']}/{s['rawTextureFilesVerified']}/{s['rawAnimationFilesVerified']} 檔重新 SHA-256 通過。",
        f"- 標準化模型：{s['standardizedGlbsVerified']} 顆本機 GLB 通過逐檔 SHA；現行 hard policy {s['hardPolicyPass']}/{s['minecraftServants']}，但授權核准 {s['rightsApproved']}、事件映射完成 {s['eventMapComplete']}、後台可切換 {s['runtimeSelectable']}。",
        f"- 原生來源動作：{s['sourceClips']} 段，已轉 {s['convertedNativeClips']}，另 {s['retainedNoDurationClips']} 段無來源時長；只保留語意候選，沒有自動綁定。",
        f"- FUC PSP：{s['pspInventoryRows']} 筆遠端盤點，實際讀取 {s['pspPayloadBytesRead']} bytes、解包 {s['pspPayloadsExtracted']}；維持 metadata-only。",
        f"- FUC 其他平台／社群補充來源：{s['supplementalSources']} 筆；PS2 公開音訊 {s['ps2AudioFiles']} 檔，與 PSP 原遊戲 payload 分列。",
        "",
        "## FateUBW 14 名逐角狀態",
        "",
        "| 原生角色 ID | 作者名稱 | 對應 GGD 英雄 | 面／draw／貼圖／通道 | 動作 | 六態缺口 | 註冊狀態 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in data["minecraftCommunity"]["servants"]:
        m, sem = row["currentPolicy"]["metrics"], row["motionSemantics"]
        mapped = ", ".join(f"`{x}`" for x in row["heroIds"]) or "待設計英雄"
        missing = "、".join(row["missingRequiredActions"]) or "無"
        lines.append(
            f"| `{row['characterId']}` | {row['authorLabel']} | {mapped} | {m['triangles']}／{m['drawCalls']}／{m['maxTextureEdge']}px／{m['channelsPerFrame']} | {row['convertedNativeClipCount']}/{row['sourceClipCount']}；語意候選 {sum(len(v) for v in sem.values() if isinstance(v, list))} | {missing} | blocked：ARR 再散布權、來源引擎 parity、事件核准、後台整合 |"
        )
    lines += [
        "",
        "## 平台界線",
        "",
        "- `Fate/Unlimited Block Works`：Flemmli97 的 Minecraft Java 1.21.1 社群實作，來源版 2.2.0、commit `07e9d79b...`、授權標示 ARR；不是 Fate/unlimited codes PSP 原作模型。",
        "- `Fate/unlimited codes` PSP：目前只有 Windows 清單中的日版 ZIP 與美版 ISO 名稱／記錄大小，Mac 本機沒有 payload，沒有讀取 SHA、內容檢查、解包或轉換。",
        "- PS2：目前取得的是 Sprite Database 的 Archer／Shirou／Saber 公開音訊集合；不是 PS2 光碟映像，也沒有模型／骨架／動作／VFX。",
        "- GameBanana 等補充來源按各自未知／PC MOD 平台保存，不能據此推定 PSP 或 PS2 原生出處。",
        "",
        "## 註冊結論",
        "",
        "14 顆 Minecraft 候選都通過現行模型 hard policy 與 10,000 面減面觸發規則，但目前 **0 顆可直接加入 Git runtime／後台下拉選單**。共同阻塞為 ARR 再散布／商用權未核准、Minecraft 動畫與來源引擎完整 parity 未證實、GGD 事件映射未經人工核准；10 名尚無英雄定義，已有英雄 ID 的 4 名也只有名稱身份映射，視覺形態尚未核准。",
        "",
        "Heracles 是唯一同時含精確 `run` 與 `death` 名稱的來源；其 `idle` 只有無原生時長的程序化衍生候選。其他角色的招式名稱只能列為 attack 審查候選，不自動補成 idle／run／hurt／death。",
        "",
        "## 重建",
        "",
        "```bash",
        "node --import tsx tools/hero-model-library/source-workflows/fate-assets-v2/audit_candidates.mts",
        "python3 tools/hero-model-library/source-workflows/fate-assets-v2/build_inventory.py --workspace ..",
        "python3 tools/hero-model-library/verify_fateubw_reserve.py --workspace ..",
        "```",
        "",
    ]
    return "\n".join(lines)


def build(workspace: Path) -> tuple[dict, str, dict]:
    downloads_path = BASE / "download-sources.json"
    mapping_path = BASE / "priority-evidence/fateubw-community/mapping.json"
    reserve_path = BASE / "priority-evidence/fateubw-community/reserve-integrity.json"
    completion_path = BASE / "priority-evidence/fateubw-community/native-motion-completion-v2.json"
    source_backup_path = BASE / "priority-evidence/fateubw-community/source-s3-backup.json"
    native_backup_path = BASE / "priority-evidence/fateubw-community/native-motion-completion-v2-s3-backup.json"
    derivative_path = BASE / "priority-evidence/fateubw-community/static-pose-derivatives-v1/evidence-receipt.json"
    derivative_backup_path = BASE / "priority-evidence/fateubw-community/static-pose-derivatives-v1/s3-backup-receipt.json"
    platform_path = BASE / "priority-evidence/fate-unlimited-codes-platforms-v1/source-index.json"
    policy_path = OUT / "current-policy.json"
    inputs = [downloads_path, mapping_path, reserve_path, completion_path, source_backup_path, native_backup_path, derivative_path, derivative_backup_path, platform_path, policy_path]
    downloads, mapping, reserve, completion = map(read, inputs[:4])
    source_backup, native_backup, derivative, derivative_backup, platform, policy = map(read, inputs[4:])
    source = next(row for row in downloads["publicSources"] if row["id"] == SOURCE_ID)
    if source["sourceGame"] != "Fate/Unlimited Block Works" or source["platform"] != "Minecraft Java 1.21.1" or source["nativeFucPsp"] is not False:
        raise ValueError("Minecraft/PSP source boundary drift")
    if source["license"] != "ARR" or "republication permission not inferred" not in source["rightsStatus"]:
        raise ValueError("FateUBW rights boundary drift")
    if platform["summary"]["originalGamePayloadBytesRead"] != 0:
        raise ValueError("PSP inventory can no longer be called metadata-only")
    if not all(source_backup.get(key) is True for key in ("verified", "identityMatchesExpectedRole", "localOriginalsPreserved")):
        raise ValueError("source S3 backup receipt is incomplete")
    if not all(native_backup.get(key) is True for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged")):
        raise ValueError("native S3 backup receipt is incomplete")
    if derivative.get("nativeDurationClaim") is not False or derivative.get("runtimeReady") is not False:
        raise ValueError("durationless derivative semantics drift")

    source_root = workspace / source["localPath"]
    source_candidates = {row["character"]: row for row in source["modelCandidates"] if "/servant/" in row.get("sourceModel", "")}
    mapping_rows = {row["sourceCharacterId"]: row for row in mapping["mappings"]}
    reserve_rows = {row["character"]: row for row in reserve["servants"]}
    completion_rows = {row["candidateId"].removeprefix("fateubw-"): row for row in completion["candidates"]}
    policy_rows = {row["candidateId"].removeprefix("fateubw-"): row for row in policy["candidates"]}
    if not all(len(rows) == 14 for rows in (source_candidates, mapping_rows, reserve_rows, completion_rows, policy_rows)):
        raise ValueError("14-servant inventories disagree")

    servants = []
    verified_counts = {"model": 0, "texture": 0, "animation": 0, "glb": 0}
    for character in sorted(source_candidates):
        raw, mapped, frozen, converted, current = source_candidates[character], mapping_rows[character], reserve_rows[character], completion_rows[character], policy_rows[character]
        raw_model = verify_file(source_root / raw["sourceModel"], raw["sourceModelSha256"], raw["sourceModelBytes"])
        raw_texture = verify_file(source_root / raw["sourceTexture"]["path"], raw["sourceTexture"]["sha256"], raw["sourceTexture"]["bytes"])
        raw_animation = verify_file(source_root / raw["sourceAnimation"]["path"], raw["sourceAnimation"]["sha256"])
        glb = verify_file(Path(converted["body"]["path"]), converted["body"]["sha256"], converted["body"]["bytes"])
        for key in verified_counts:
            verified_counts[key] += 1
        semantics = semantic_candidates(converted["convertedClipNames"], character)
        missing = [action for action in REQUIRED_ACTIONS if not semantics.get(action)]
        blockers = [
            "ARR-republication-and-commercial-use-not-approved",
            "source-engine-animation-parity-unverified",
            "GGD-event-map-not-owner-approved",
            "backend-option-not-registered",
        ]
        if not mapped["heroIds"]:
            blockers.append("no-existing-GGD-hero-definition")
        if mapped["visualIdentityVerified"] is not True:
            blockers.append("visual-form-identity-not-approved")
        if missing:
            blockers.append("required-action-semantics-incomplete")
        servants.append({
            "characterId": character,
            "authorLabel": mapped["authorLabel"],
            "heroIds": mapped["heroIds"],
            "identityMappingOnly": mapped["identityMappingOnly"],
            "visualIdentityVerified": mapped["visualIdentityVerified"],
            "source": {"sourceId": SOURCE_ID, "sourceGame": source["sourceGame"], "platform": source["platform"], "sourceVersion": source["sourceVersion"], "sourceCommit": source["sourceCommit"], "license": source["license"], "rightsStatus": source["rightsStatus"], "nativeFucPsp": False},
            "rawModel": raw_model,
            "rawTexture": raw_texture,
            "rawAnimation": {**raw_animation, "clipCount": raw["sourceAnimation"]["clipCount"], "unmatchedBoneNames": raw["sourceAnimation"]["unmatchedBoneNames"]},
            "standardizedModelWithNativeMotion": glb,
            "currentPolicy": current,
            "sourceClipCount": converted["sourceClipCount"],
            "convertedNativeClipCount": converted["convertedNativeClipCount"],
            "retainedNoDurationClipCount": converted["retainedNoDurationClipCount"],
            "convertedClipNames": converted["convertedClipNames"],
            "motionSemantics": semantics,
            "missingRequiredActions": missing,
            "s3Backup": converted["backup"],
            "registration": {"eligible": False, "blockers": blockers, "runtimeSelectable": False, "defaultEligible": False, "productionDeploymentVerified": False},
        })

    ps2_files = platform["summary"]["ps2PublicAudioFiles"]
    summary = {
        "minecraftServants": len(servants),
        "rawModelFilesVerified": verified_counts["model"], "rawTextureFilesVerified": verified_counts["texture"], "rawAnimationFilesVerified": verified_counts["animation"],
        "standardizedGlbsVerified": verified_counts["glb"], "hardPolicyPass": sum(row["currentPolicy"]["hardPolicy"]["pass"] for row in servants),
        "sourceClips": sum(row["sourceClipCount"] for row in servants), "convertedNativeClips": sum(row["convertedNativeClipCount"] for row in servants),
        "retainedNoDurationClips": sum(row["retainedNoDurationClipCount"] for row in servants),
        "rightsApproved": 0, "eventMapComplete": 0, "runtimeSelectable": 0, "productionDeployed": 0,
        "existingHeroIdentityMappings": sum(bool(row["heroIds"]) for row in servants), "unmappedServants": sum(not row["heroIds"] for row in servants),
        "pspInventoryRows": platform["summary"]["originalGameInventoryRows"], "pspPayloadBytesRead": platform["summary"]["originalGamePayloadBytesRead"],
        "pspPayloadsExtracted": platform["summary"]["originalGamePayloadsExtracted"], "supplementalSources": platform["summary"]["supplementalPublicSources"], "ps2AudioFiles": ps2_files,
    }
    inventory = {
        "schema": "ggd.fate-platform-separated-asset-inventory@1",
        "scope": {"minecraftCommunitySeparateFromFucOriginal": True, "metadataIsNotPayload": True, "policyPassIsNotRegistration": True, "runtimeRegistrationPerformed": False, "productionDeploymentPerformed": False},
        "generatedFrom": [pin(path) for path in inputs] + [pin(Path(__file__).resolve())],
        "summary": summary,
        "minecraftCommunity": {
            "sourceId": SOURCE_ID, "sourceGame": source["sourceGame"], "platform": source["platform"], "license": source["license"], "rightsStatus": source["rightsStatus"],
            "sourceUrl": source["url"], "localRoot": str(source_root.resolve()), "sourceS3": source["backup"], "nativeMotionS3": completion["s3Backup"],
            "durationlessDerivativeS3": {"receipt": derivative_backup_path.relative_to(ROOT).as_posix(), "s3Uri": source["durationlessDerivativeCompletion"]["s3Uri"], "counts": source["durationlessDerivativeCompletion"]["counts"], "nativeDurationClaim": False},
            "servants": servants,
        },
        "fateUnlimitedCodes": {
            "originalPsp": platform["originalGamePlatformVersions"],
            "otherOriginalPlatforms": platform["otherPlatformSources"],
            "supplementalPublicSources": platform["supplementalPublicSources"],
            "boundary": "PSP inventory rows, PS2 public audio, community MOD ports, and FateUBW Minecraft assets are independent source classes.",
        },
    }
    entry = {
        "schema": "ggd.fate-asset-current-resource-entry@1",
        "gitPath": (OUT / "inventory.json").relative_to(ROOT).as_posix(),
        "documentGitPath": (OUT / "README.md").relative_to(ROOT).as_posix(),
        "policyAuditGitPath": policy_path.relative_to(ROOT).as_posix(),
        "sourceId": SOURCE_ID,
        "status": "14 Minecraft candidates policy-pass but rights/semantics/backend blocked; PSP original remains metadata-only",
        "summary": summary,
        "runtimeSelectable": False,
        "productionDeploymentVerified": False,
    }
    return inventory, render_md(inventory), entry


def write_or_check(path: Path, content: str, check: bool):
    if check:
        if not path.is_file() or path.read_text() != content:
            raise ValueError(f"generated Fate inventory is stale: {path}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=WORKSPACE)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    inventory, document, entry = build(args.workspace.resolve())
    inventory_text = json.dumps(inventory, ensure_ascii=False, indent=2) + "\n"
    # The entry pins the two generated payloads, but never itself recursively.
    entry["sha256"] = hashlib.sha256(inventory_text.encode()).hexdigest()
    entry["documentSha256"] = hashlib.sha256(document.encode()).hexdigest()
    policy_path = OUT / "current-policy.json"
    entry["policyAuditSha256"] = digest(policy_path)
    write_or_check(OUT / "inventory.json", inventory_text, args.check)
    write_or_check(OUT / "README.md", document, args.check)
    write_or_check(OUT / "current-resource-entry.json", json.dumps(entry, ensure_ascii=False, indent=2) + "\n", args.check)
    print(json.dumps(inventory["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
