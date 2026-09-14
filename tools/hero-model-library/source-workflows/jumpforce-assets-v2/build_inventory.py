#!/usr/bin/env python3
"""Build the unified JUMP FORCE acquired-source and review-group inventory."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
WORKSPACE = ROOT.parent
BASE = ROOT / "materials/hero-model-library"
OUT = BASE / "source-inventories/jumpforce-assets-v2"
PUBLIC_BATCH_IDS = [
    "parallel-ps-jumpforce-audio",
    "parallel-ps-jumpforce-local-10",
    "parallel-ps-jumpforce-local-second10",
    "parallel-ps-jumpforce-local-next32",
    "parallel-ps-jumpforce-local-final3",
]
STEAM_AUDIO_ID = "steam-jump-force-streaming-audio-816020-build-8523149"
STEAM_ASSET_ID = "steam-jump-force-priority-original-assets-build-8523149"
COMMON_PUBLIC_GROUP = "parallel-ps-jumpforce-local-final3:jumpforce-_common-sounds"


def read(path: Path):
    return json.loads(path.read_text())


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pin(path: Path) -> dict:
    return {"gitPath": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": sha(path)}


def canonical(value: str) -> str:
    parts = [part for part in value.replace("\\", "/").split("/") if part]
    value = next((part for part in reversed(parts) if part.casefold().startswith("jforce_")), parts[-1])
    value = Path(value).stem
    value = re.sub(r"^JForce_+", "", value, flags=re.I)
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def group_key(source_id: str, group: dict) -> str:
    return f"{source_id}:{group['id']}"


def render_md(data: dict) -> str:
    s = data["summary"]
    decimation = data["dai"]["formalDecimationCandidate"]
    rejected = data["dai"]["rejectedV1Candidate"]
    six_draw = data["dai"]["sixDrawCandidate"]
    lines = [
        "# JUMP FORCE 已取得素材、角色群與抽取狀態",
        "",
        "本頁由 `build_inventory.py` 從中央來源、逐檔備份清單、Steam PAK 索引與本機實檔重建。包名、原生 `chrNNNN` 與 bank 標籤只證明來源群組；不證明每段音訊的說話者、語言、台詞或技能事件。",
        "",
        "## 本批核對結果",
        "",
        f"- 公開音訊原包：{s['publicPackages']} 包，{s['publicCharacterPackages']} 個角色標籤包＋{s['publicCommonPackages']} 個共用音效包；本機重新 SHA-256 通過 {s['publicPackagesLiveShaVerified']}/{s['publicPackages']}。",
        f"- 公開音訊檔：{s['publicAudioFiles']:,} 檔，約 {s['publicAudioDurationSeconds'] / 3600:.2f} 小時；數量沿用中央逐檔索引與已讀回備份，不等於已聽審語音句數。",
        f"- Steam 原生 Streaming：{s['steamAwbBanks']} 個 AWB，已解碼 {s['steamDecodedAudioFiles']:,} WAV；來源標籤分類為語音候選 {s['steamVoiceLabelFiles']:,}、音效 {s['steamSoundEffectFiles']:,}、音樂 {s['steamMusicFiles']:,}。",
        f"- 角色身份交叉表：{s['nativeToPublicCharacterMappings']} 個原生 ID 可直接連到公開角色群；{s['unresolvedNativeCharacterGroups']} 個原生 ID 尚未確認，沒有送入角色聽審佇列。",
        f"- 可聽審角色群：{s['listeningReviewGroups']} 組（公開角色包 {s['publicListeningReviewGroups']}＋Steam 原生角色群 {s['steamListeningReviewGroups']}）；逐段說話者／事件已自動綁定 0。",
        "",
        "## 模型、骨架、動作與特效",
        "",
        "| 範圍 | 模型／貼圖／骨架 | 動作 | VFX | 狀態 |",
        "| --- | --- | --- | --- | --- |",
        f"| Steam 六個 PAK | 索引有 {data['steamPak']['selectedPathCounts']['character-package']:,} 個現行 character paths | animation-package 索引 {data['steamPak']['selectedPathCounts']['animation-package']}；未解析角色動作 | 索引有 {data['steamPak']['selectedPathCounts']['vfx-package']:,} 個現行 VFX paths | 共享卷未掛載；只沿用固定容器 SHA 與完整路徑索引 |",
        f"| 達伊 `chr0430` | 已抽出 {data['dai']['nativePackages']:,} 個原生套件、{data['dai']['modelComponents']} 個蒙皮元件、{data['dai']['texturePng']} PNG、{data['dai']['joints']} joints；v1 {rejected['triangles']:,} 面已被 owner 拒絕；v5 {six_draw['after']['triangles']:,} 面／{six_draw['after']['maxTextureEdge']}px | 原生 clips {data['dai']['nativeAnimations']} | 套件已抽出，未解析／未轉 GGD | v5 逐材質 atlas、蒙皮、骨架、Khronos 及 {six_draw['after']['drawPrimitives']} draw 技術門檻通過；模型已封存 Git，動作聽審待完成，未註冊 |",
        "| Asta `chr0420`／Kenshiro `chr0230` | PAK 路徑已索引 | 路徑已索引，未抽出 | 路徑已索引，未抽出 | 本機及 S3 沒有這兩名的已凍結 payload，待共享卷再次掛載 |",
        "",
        "## 可直接核對的角色群",
        "",
        "| 原生 ID | 角色群 | 公開群組 | Steam 檔數 | 公開檔數 |",
        "| --- | --- | --- | ---: | ---: |",
    ]
    for row in data["identityCrosswalk"]:
        lines.append(f"| `{row['nativeCharacterId']}` | {row['characterName']} | `{row['publicGroupId']}` | {row['steamFileCount']:,} | {row['publicFileCount']:,} |")
    lines += [
        "",
        "## 明確缺口",
        "",
        f"- `chr0430` 原始 review GLB 獨立保留：{data['dai']['originalReviewGlb']['bytes']:,} bytes，SHA-256 `{data['dai']['originalReviewGlb']['sha256']}`。完整抽出樹共 {data['dai']['frozenTreeFiles']:,} files／{data['dai']['frozenTreeBytes']:,} bytes（native packages {data['dai']['nativePackages']:,}、model components {data['dai']['modelComponents']}、textures {data['dai']['texturePng']}）；v1 與 v2 也各自保存，沒有覆蓋原件。",
        "- `/Volumes/common` 與 `/Volumes/game` 本批均未掛載，沒有重新讀取六個 PAK，也沒有從 metadata 假裝取得 payload。",
        "- 六個 PAK 的既有目錄索引由已授權流程建立；本批不保存、不輸出、不重新要求 AES 金鑰。",
        f"- v1（{rejected['triangles']:,} 面／{rejected['maxTextureEdge']}px）原收據的人工 accepted 已被 owner 於 {rejected['reviewedAt']} 明確拒絕；原因是臉部貼圖及眼睛不正常。v1 不再算有效視覺驗收。",
        f"- v2 已從 {decimation['before']['triangles']:,} 降至 {decimation['after']['triangles']:,} 面、貼圖 {decimation['before']['maxTextureEdge']}px 降至 {decimation['after']['maxTextureEdge']}px；雙重建置 SHA 相同、159 joints／蒙皮／材質槽保留、Khronos 0 error，眼部透明層技術修復通過。owner 已授權資源發布，但新 v2 畫面仍待視覺品質審查。",
        f"- v2 的單通道 atlas 停在 {decimation['after']['drawPrimitives']} draw；v5 已由逐來源材質 base/normal/ORM atlas 及蒙皮 mesh 合併自動化降為 **{six_draw['after']['drawPrimitives']} draw**，未放寬 hard limit {decimation['drawCallLimit']}。15 個不透明材質各有獨立 atlas 區，透明眼部、鏡片、頭髮與玻璃保持獨立，原模型非 UV 頂點屬性以 byte multiset 對照一致，Khronos 0 error，三視圖 WebGL 已完成。",
        f"- v5 原生 animations 仍為 {six_draw['after']['animations']}；目前沒有通過播放審查的借用動作綁定。成品 GLB 已封存 Git，但因缺動作，未註冊、不可切換、未部署。",
        "- 達伊目前沒有任何原生 gameplay clip；即使 draw call 後續修正，也不能直接登記成完整六態後台模型。",
        "- 達伊 VFX／PAK 音訊套件尚未解析。另有的 261 OGG 公開包及 Steam Streaming 音訊是獨立來源，不能冒充 PAK 事件綁定完成。",
        "- 公開 58 包中 `_Common Sounds` 是共用音效包，不是第 58 名角色。",
        "- 說話者、語言、逐字稿、音效事件、技能事件及 runtime 綁定全部維持待人工聽審。",
        "",
        "## 重建與檢查",
        "",
        "```bash",
        "node --import tsx tools/hero-model-library/source-workflows/jumpforce-assets-v2/audit_dai_candidate.mts --glb ../GGD-Asset-Library/converted/jump-force-steam-dai-v1/dai-chr0430-review-v4.glb --output materials/hero-model-library/source-inventories/jumpforce-assets-v2/dai-current-policy.json",
        "python3 tools/hero-model-library/source-workflows/jumpforce-assets-v2/build_inventory.py --workspace ..",
        "python3 tools/hero-model-library/source-workflows/jumpforce-assets-v2/build_inventory.py --workspace .. --check",
        "```",
        "",
    ]
    return "\n".join(lines)


def build(workspace: Path) -> tuple[dict, dict, str, dict]:
    downloads_path = BASE / "download-sources.json"
    public_files_path = BASE / "public-source-files.json"
    voice_path = BASE / "voice-index.json"
    reconciliation_path = BASE / "source-inventories/jumpforce-public-audio-catalog-reconciliation.json"
    pak_path = BASE / "source-inventories/jump-force-steam-pak-index.json"
    dai_manifest_path = BASE / "source-inventories/jump-force-steam-dai-v1/source-manifest.json"
    dai_visual_path = BASE / "source-inventories/jump-force-steam-dai-v1/visual-review.json"
    dai_config_path = BASE / "source-inventories/jump-force-steam-dai-v1/game-config-index.json"
    streaming_evidence_path = BASE / "priority-evidence/jumpforce-steam-streaming-audio/1e46153b797289665dbcba97677ef45a8fa6ff9dc6aebc97caec56a7bf8b5035/central-verification.json"
    map_path = ROOT / "tools/hero-model-library/source-workflows/jumpforce-steam-streaming-audio-v1/character-map.json"
    policy_path = OUT / "dai-current-policy.json"
    v1_dir = BASE / "priority-evidence/jump-force-dai-decimation-v1"
    v1_paths = [v1_dir / name for name in ("conversion.json", "validation.json", "draw-call-audit.json", "visual-comparison.json", "owner-review.json", "ab-contact-sheet.png", "worst-difference-overview.png", "s3-backup-receipt.json")]
    v2_dir = BASE / "priority-evidence/jump-force-dai-decimation-v2"
    v2_paths = [v2_dir / name for name in ("conversion.json", "validation.json", "draw-call-audit.json", "guard.json", "visual-review.json", "owner-review.json", "front.png", "back.png", "isometric.png", "face-source.png", "face-v1-rejected.png", "face-v2.png")]
    v5_dir = BASE / "priority-evidence/jump-force-dai-six-draw-v5"
    v5_paths = [v5_dir / name for name in ("conversion.json", "validation.json", "guard.json", "atlas-plan.json", "merge-receipt.json", "front.png", "back.png", "isometric.png", "proof.json", "run.json", "freeze-receipt.json")]
    inputs = [downloads_path, public_files_path, voice_path, reconciliation_path, pak_path, dai_manifest_path, dai_visual_path, dai_config_path, streaming_evidence_path, map_path, policy_path, *v1_paths, *v2_paths, *v5_paths]
    downloads, public_files, voice = read(downloads_path), read(public_files_path), read(voice_path)
    reconciliation, pak, dai, visual = read(reconciliation_path), read(pak_path), read(dai_manifest_path), read(dai_visual_path)
    dai_config, streaming, character_map, policy = read(dai_config_path), read(streaming_evidence_path), read(map_path), read(policy_path)
    v1_conversion, v1_validation, v1_draw, v1_visual, v1_owner = [read(path) for path in v1_paths[:5]]
    v1_backup = read(v1_paths[-1])
    decimation, decimation_validation, draw_audit, guard, visual_comparison, owner_review = [read(path) for path in v2_paths[:6]]
    six_conversion, six_validation, six_guard = [read(path) for path in v5_paths[:3]]
    six_freeze = read(v5_paths[-1])
    six_git_model = {"gitPath": f"content/assets/models/community/{six_validation['candidate']['sha256']}.glb", "bytes": six_validation['candidate']['bytes'], "sha256": six_validation['candidate']['sha256']}
    sources = {row["id"]: row for row in downloads["publicSources"]}
    manifests = {row["id"]: row for row in public_files["sources"]}
    voice_groups = {row["id"]: row for row in voice["groups"]}
    if reconciliation["packageCount"] != 58 or reconciliation["distinctPackageBasenames"] != 58:
        raise ValueError("public JUMP FORCE package reconciliation is stale")
    if streaming["centralVoiceFiles"] != 4034 or streaming["centralVoiceGroups"] != 41:
        raise ValueError("Steam Streaming central evidence is stale")
    if not all(streaming["s3"].get(key) is True for key in ("readbackVerified", "fullGetVerified", "allMemberSha256Verified")):
        raise ValueError("Steam Streaming S3 archive is not fully verified")
    if policy["glb"]["sha256"] != visual["glb"]["sha256"]:
        raise ValueError("Dai policy and visual evidence refer to different GLBs")
    if (v1_owner.get("decision") != "rejected"
            or v1_owner.get("candidateSha256") != v1_conversion.get("output", {}).get("sha256")
            or v1_owner.get("supersedes", {}).get("priorValue") != "accepted"):
        raise ValueError("Dai v1 owner rejection is absent or inconsistent")
    if (decimation.get("sourceId") != STEAM_ASSET_ID
            or decimation_validation.get("candidateId") != decimation.get("candidateId")
            or decimation_validation.get("candidate", {}).get("sha256") != decimation.get("output", {}).get("sha256")
            or draw_audit.get("candidate", {}).get("sha256") != decimation.get("output", {}).get("sha256")
            or visual_comparison.get("candidateSha256") != decimation.get("output", {}).get("sha256")
            or owner_review.get("candidateSha256") != decimation.get("output", {}).get("sha256")):
        raise ValueError("Dai formal decimation evidence is inconsistent")
    if (not decimation.get("byteIdenticalRebuild")
            or decimation_validation.get("khronos", {}).get("errors") != 0
            or not decimation_validation.get("finiteFloatAccessors", {}).get("passed")
            or decimation_validation.get("metrics") != {"triangles": 7930, "draws": 20, "textureEdge": 256, "skins": 1, "joints": 159, "textures": 24, "animations": 0}
            or visual_comparison.get("technicalInspection", {}).get("result") != "passed-bounded-visual-inspection"
            or visual_comparison.get("ownerVisualQualityReview") != "pending-new-v2-render-review"
            or owner_review.get("decision") != "publication-authorized-when-technical-gates-pass"
            or owner_review.get("technicalGatesStillApply") is not True
            or guard.get("results", [{}])[0].get("adoption", {}).get("status") != "eligible"
            or guard.get("results", [{}])[0].get("adoption", {}).get("targetTrianglesMax") != 8000
            or {row.get("key"): row.get("verdict") for row in guard.get("results", [{}])[0].get("axes", [])}.get("drawCalls") != "over"
            or draw_audit.get("decision", {}).get("safeCurrentAutomationCanReachSix") is not False):
        raise ValueError("Dai formal decimation evidence lost its bounded pass/block decision")
    if (six_conversion.get("output", {}).get("sha256") != six_validation.get("candidate", {}).get("sha256")
            or six_validation.get("khronos", {}).get("errors") != 0
            or six_validation.get("metrics") != {"triangles": 7930, "drawPrimitives": 6, "maxTextureEdge": 256, "skins": 1, "joints": 159, "animations": 0}
            or not six_validation.get("preservation", {}).get("nonUvVertexAttributesByteEquivalentAsMultiset")
            or not six_validation.get("states", {}).get("drawCallLimitPassed")
            or six_validation.get("states", {}).get("runtimeSelectable") is not False
            or not six_validation.get("webgl", {}).get("complete")
            or six_validation.get("webgl", {}).get("views") != 3
            or six_freeze.get("gitModel") != six_git_model
            or {row.get("key"): row.get("verdict") for row in six_guard.get("results", [{}])[0].get("axes", [])}.get("drawCalls") == "over"):
        raise ValueError("Dai six-draw evidence is inconsistent")
    if (v1_backup.get("schema") != "ggd-intake-backup-receipt@1"
            or not v1_backup.get("fullGetVerified")
            or not v1_backup.get("allMemberSha256Verified")
            or "assumed-role/vibe-coding-s3-role/" not in v1_backup.get("callerArn", "")):
        raise ValueError("Dai v1 S3 backup is absent or invalid")

    package_rows = []
    package_groups = {}
    for source_id in PUBLIC_BATCH_IDS:
        source = sources[source_id]
        manifest = manifests[source_id]
        by_path = {row["path"]: row for row in manifest["files"]}
        for group in source["audioGroups"]:
            gid = group_key(source_id, group)
            package_groups[(source_id, canonical(group["pathPrefixes"][0]))] = (gid, group)
        for package in (row for row in reconciliation["packages"] if row["sourceId"] == source_id):
            rel = package["path"]
            manifest_row = by_path.get(rel)
            if not manifest_row:
                raise ValueError(f"package missing from authoritative manifest: {source_id}:{rel}")
            local = (workspace / source["localPath"] / rel).resolve()
            if not local.is_file():
                raise ValueError(f"local package missing: {local}")
            actual_sha = sha(local)
            if local.stat().st_size != manifest_row["bytes"] or actual_sha != manifest_row["sha256"]:
                raise ValueError(f"local package changed: {local}")
            match = package_groups.get((source_id, canonical(rel)))
            if not match:
                raise ValueError(f"package has no exact group-label match: {source_id}:{rel}")
            gid, group = match
            central = voice_groups[gid]
            package_rows.append({
                "sourceId": source_id,
                "packagePath": rel,
                "packageAbsolutePath": str(local),
                "packageBytes": local.stat().st_size,
                "packageSha256": actual_sha,
                "groupId": gid,
                "groupName": group.get("name") or group.get("label"),
                "groupAbsolutePath": str((workspace / source["localPath"] / group["pathPrefixes"][0]).resolve()),
                "fileCount": central["fileCount"],
                "bytes": central["bytes"],
                "durationSeconds": central["knownDurationSeconds"],
                "categoryCounts": central["categoryCounts"],
                "heroIds": central["heroIds"],
                "isCharacterGroup": gid != COMMON_PUBLIC_GROUP,
                "identityEvidence": "exact source package basename and extracted group directory label",
                "clipSpeakerVerified": False,
                "eventBindingVerified": False,
            })
    if len(package_rows) != 58 or len({row["packageSha256"] for row in package_rows}) != 58:
        raise ValueError("expected 58 distinct locally verified public packages")

    steam_source = sources[STEAM_AUDIO_ID]
    steam_groups = {group["id"]: group for group in steam_source["audioGroups"]}
    crosswalk = []
    for native, mapping in sorted(character_map["characters"].items()):
        native_id = "chr" + native
        steam_group = steam_groups[native_id]
        public_id = mapping["existingGroupId"]
        public = voice_groups[public_id]
        if public_id not in {row["groupId"] for row in package_rows}:
            raise ValueError("character map points outside verified package catalog: " + public_id)
        if steam_group.get("relatedExistingGroupIds") != [public_id]:
            raise ValueError("Steam/public relationship is stale: " + native_id)
        crosswalk.append({
            "nativeCharacterId": native_id,
            "characterName": mapping["name"],
            "publicGroupId": public_id,
            "steamGroupId": f"{STEAM_AUDIO_ID}:{native_id}",
            "steamFileCount": steam_group["fileCount"],
            "publicFileCount": public["fileCount"],
            "heroIds": sorted(set(mapping.get("heroIds", []) + public.get("heroIds", []))),
            "identityEvidence": "native chrNNNN bank label joined to the existing exact source-package group",
            "clipSpeakerVerified": False,
            "eventBindingVerified": False,
        })
    unresolved = ["chr" + value for value in character_map["unresolvedNativeIds"]]
    if set(unresolved) != set(streaming["classification"]["unresolvedNativeCharacterIds"]):
        raise ValueError("unresolved Steam character IDs disagree")

    public_review = [{
        "reviewId": "public:" + row["groupId"],
        "sourceId": row["sourceId"],
        "groupId": row["groupId"],
        "characterGroupLabel": row["groupName"],
        "nativeCharacterId": next((x["nativeCharacterId"] for x in crosswalk if x["publicGroupId"] == row["groupId"]), None),
        "absolutePath": row["groupAbsolutePath"],
        "fileCount": row["fileCount"],
        "categoryCounts": row["categoryCounts"],
        "identityVerifiedAtGroupLevel": True,
        "identityEvidence": row["identityEvidence"],
        "speakerReviewed": False,
        "languageReviewed": False,
        "eventBindingReviewed": False,
        "approvedForRuntimeBinding": False,
    } for row in package_rows if row["isCharacterGroup"]]
    steam_review = []
    for row in crosswalk:
        group = steam_groups[row["nativeCharacterId"]]
        steam_review.append({
            "reviewId": "steam:" + row["nativeCharacterId"],
            "sourceId": STEAM_AUDIO_ID,
            "groupId": row["steamGroupId"],
            "characterGroupLabel": row["characterName"],
            "nativeCharacterId": row["nativeCharacterId"],
            "relatedPublicGroupId": row["publicGroupId"],
            "absolutePath": str((workspace / steam_source["localPath"] / group["pathPrefixes"][0]).resolve()),
            "fileCount": group["fileCount"],
            "categoryCounts": group["sourceCategoryCounts"],
            "identityVerifiedAtGroupLevel": True,
            "identityEvidence": row["identityEvidence"],
            "speakerReviewed": False,
            "languageReviewed": False,
            "eventBindingReviewed": False,
            "approvedForRuntimeBinding": False,
        })
    queue = {
        "schema": "ggd.jumpforce-audio-listening-review-groups@1",
        "scope": "Group-level queue only. Group identity does not prove the speaker or event of any individual clip.",
        "counts": {
            "groups": len(public_review) + len(steam_review),
            "publicCharacterGroups": len(public_review),
            "steamNativeCharacterGroups": len(steam_review),
            "excludedPublicCommonGroups": 1,
            "excludedSteamCommonGroups": len([g for g in steam_groups.values() if not g.get("nativeCharacterId")]),
            "excludedUnresolvedSteamNativeGroups": len(unresolved),
            "approvedForRuntimeBinding": 0,
        },
        "excluded": {
            "publicCommonGroupIds": [COMMON_PUBLIC_GROUP],
            "steamCommonGroupIds": sorted(f"{STEAM_AUDIO_ID}:{g['id']}" for g in steam_groups.values() if not g.get("nativeCharacterId")),
            "unresolvedSteamNativeIds": unresolved,
        },
        "groups": sorted(public_review + steam_review, key=lambda row: row["reviewId"]),
    }
    summary = {
        "publicPackages": len(package_rows),
        "publicCharacterPackages": len(public_review),
        "publicCommonPackages": 1,
        "publicPackagesLiveShaVerified": len(package_rows),
        "publicAudioFiles": sum(row["fileCount"] for row in package_rows),
        "publicAudioBytes": sum(row["bytes"] for row in package_rows),
        "publicAudioDurationSeconds": sum(row["durationSeconds"] for row in package_rows),
        "steamAwbBanks": streaming["extraction"]["originalAwbFiles"],
        "steamDecodedAudioFiles": streaming["extraction"]["decodedFiles"],
        "steamVoiceLabelFiles": streaming["extraction"]["voiceSourceLabelFiles"],
        "steamSoundEffectFiles": streaming["extraction"]["soundEffectFiles"],
        "steamMusicFiles": streaming["extraction"]["musicFiles"],
        "nativeToPublicCharacterMappings": len(crosswalk),
        "unresolvedNativeCharacterGroups": len(unresolved),
        "listeningReviewGroups": queue["counts"]["groups"],
        "publicListeningReviewGroups": len(public_review),
        "steamListeningReviewGroups": len(steam_review),
        "automaticSpeakerBindings": 0,
        "automaticEventBindings": 0,
        "runtimeSelectableAssets": 0,
        "productionDeployedAssets": 0,
    }
    inventory = {
        "schema": "ggd.jumpforce-acquired-asset-inventory@2",
        "checkedAt": "2026-09-15",
        "sourceGame": "JUMP FORCE",
        "platforms": ["Windows (Steam)", "public audio pack platform unverified"],
        "mountSnapshot": {"common": Path("/Volumes/common").exists(), "game": Path("/Volumes/game").exists(), "pakPayloadReadThisRun": False},
        "summary": summary,
        "publicAudioPackages": sorted(package_rows, key=lambda row: (row["sourceId"], row["packagePath"])),
        "identityCrosswalk": crosswalk,
        "unresolvedNativeCharacterIds": unresolved,
        "steamStreaming": {
            "sourceId": STEAM_AUDIO_ID,
            "appId": "816020",
            "buildId": "8523149",
            "localRoot": streaming["localRoot"],
            "originalAwbFiles": streaming["extraction"]["originalAwbFiles"],
            "decodedFiles": streaming["extraction"]["decodedFiles"],
            "decoder": streaming["decoder"],
            "s3": streaming["s3"],
            "speakerLanguageEventReviewComplete": False,
        },
        "steamPak": {
            "sourceId": STEAM_ASSET_ID,
            "containers": pak["containers"],
            "relationCount": pak["relationCount"],
            "uniquePathCount": pak["uniquePathCount"],
            "selectedPathCounts": pak["sourceKindSelectedPathCounts"],
            "mountAvailable": False,
            "payloadReadThisRun": False,
            "indexKeyRetained": False,
        },
        "dai": {
            "nativeCharacterId": "chr0430",
            "heroIds": ["godie-nbbc", "godie-n01c"],
            "localRoot": dai["root"],
            "nativePackages": dai["counts"]["nativePackages"],
            "modelComponents": dai["counts"]["modelGltf"],
            "texturePng": dai["counts"]["texturePng"],
            "joints": dai["modelEvidence"]["jointCounts"][0],
            "nativeAnimations": dai["modelEvidence"]["totalAnimationCount"],
            "frozenTreeFiles": dai["counts"]["allFrozenFiles"],
            "frozenTreeBytes": dai["bytes"]["allFrozenFiles"],
            "originalReviewGlb": {
                "absolutePath": decimation["input"]["absolutePath"],
                "bytes": decimation["input"]["bytes"],
                "sha256": decimation["input"]["sha256"],
            },
            "gameConfigSelectedPaths": dai_config["counts"]["selectedPaths"],
            "gameConfigExtractedPaths": dai_config["counts"]["selectedPaths"] - dai_config["counts"]["selectedPathsPendingExtraction"],
            "candidate": policy["glb"],
            "candidateMetrics": policy["metrics"],
            "currentPolicyVerdict": policy["currentChampionPolicy"]["verdict"],
            "currentPolicyBlockingAxes": policy["currentChampionPolicy"]["blockingAxes"],
            "rejectedV1Candidate": {
                "candidateId": v1_conversion["candidateId"],
                "sha256": v1_conversion["output"]["sha256"],
                "triangles": v1_validation["metrics"]["after"]["triangles"],
                "maxTextureEdge": v1_validation["metrics"]["after"]["maxTextureEdge"],
                "drawPrimitives": v1_validation["metrics"]["after"]["drawPrimitives"],
                "reviewedAt": v1_owner["reviewedAt"],
                "ownerDecision": "rejected",
                "ownerFinding": v1_owner["ownerFinding"],
                "priorAutomatedReceiptSuperseded": True,
                "runtimeRegistered": False,
                "runtimeSelectable": False,
                "productionDeployed": False,
                "s3Backup": {
                    "s3Uri": v1_backup["s3Uri"],
                    "manifestUri": v1_backup["manifestUri"],
                    "archiveSha256": v1_backup["archiveSha256"],
                    "fullGetVerified": True,
                    "allMemberSha256Verified": True,
                },
                "evidence": [pin(path) for path in v1_paths],
            },
            "formalDecimationCandidate": {
                "candidateId": decimation["candidateId"],
                "absolutePath": decimation["output"]["absolutePath"],
                "bytes": decimation["output"]["bytes"],
                "sha256": decimation["output"]["sha256"],
                "sourceSha256": decimation["input"]["sha256"],
                "before": v1_validation["metrics"]["before"],
                "after": {
                    "triangles": decimation_validation["metrics"]["triangles"],
                    "drawPrimitives": decimation_validation["metrics"]["draws"],
                    "maxTextureEdge": decimation_validation["metrics"]["textureEdge"],
                    "skins": decimation_validation["metrics"]["skins"],
                    "joints": decimation_validation["metrics"]["joints"],
                    "textures": decimation_validation["metrics"]["textures"],
                    "animations": decimation_validation["metrics"]["animations"],
                },
                "byteIdenticalRebuild": decimation["byteIdenticalRebuild"],
                "khronosErrors": decimation_validation["khronos"]["errors"],
                "khronosWarnings": decimation_validation["khronos"]["warnings"],
                "finiteFloatAccessorsPassed": decimation_validation["finiteFloatAccessors"]["passed"],
                "rigPreserved": decimation_validation["preservation"]["jointNamesAndHierarchyEquivalent"] and decimation_validation["preservation"]["allPrimitivesSkinned"],
                "technicalVisualInspectionPassed": True,
                "ownerVisualQualityReview": visual_comparison["ownerVisualQualityReview"],
                "ownerPublicationAuthorized": owner_review["states"]["backendRegistrationAuthorized"],
                "drawCallLimit": draw_audit["currentChampionDrawCallPolicy"]["limit"],
                "exactSemanticMaterialGroups": draw_audit["observed"]["exactSemanticMaterialGroups"],
                "atlasEligiblePrimitives": draw_audit["observed"]["atlasEligiblePrimitives"],
                "drawCallPassed": False,
                "hardPolicyPassed": False,
                "nativeSixStateMotionComplete": False,
                "runtimeRegistered": False,
                "runtimeSelectable": False,
                "productionDeployed": False,
                "readiness": decimation_validation["readiness"],
                "s3Backup": {
                    "state": "pending-v2-upload-and-readback",
                    "s3Uri": None,
                    "fullGetVerified": False,
                    "allMemberSha256Verified": False,
                },
                "evidence": [pin(path) for path in v2_paths],
            },
            "sixDrawCandidate": {
                "candidateId": six_validation["candidateId"],
                "gitPath": six_git_model["gitPath"],
                "bytes": six_git_model["bytes"],
                "sha256": six_git_model["sha256"],
                "sourceSha256": six_validation["source"]["sha256"],
                "after": six_validation["metrics"],
                "byteIdenticalRebuild": six_validation["deterministicRebuild"]["byteIdentical"],
                "khronosErrors": six_validation["khronos"]["errors"],
                "nonUvVertexAttributesPreserved": six_validation["preservation"]["nonUvVertexAttributesByteEquivalentAsMultiset"],
                "transparentEyeHairLayersKeptSeparate": six_validation["preservation"]["preservedEyeLensHairGlassPrimitives"] == 5,
                "technicalVisualInspectionPassed": True,
                "ownerVisualQualityReview": six_validation["webgl"]["reviewState"],
                "ownerPublicationAuthorized": True,
                "drawCallPassed": six_validation["states"]["drawCallLimitPassed"],
                "nativeSixStateMotionComplete": False,
                "gitProductFrozen": True,
                "runtimeRegistered": six_validation["states"]["backendOptionRegistered"],
                "runtimeSelectable": six_validation["states"]["runtimeSelectable"],
                "productionDeployed": six_validation["states"]["productionDeployed"],
                "s3Backup": {"state": "pending-v3-upload-and-readback", "s3Uri": None, "fullGetVerified": False},
                "remaining": [
                    "No native JUMP FORCE animation clips are present in the extracted GLB.",
                    "No owner-reviewed borrowed motion set is bound; do not register a backend option.",
                    "The immutable source stage is retained locally; its commit-pinned Git backup is pending after this freeze commit.",
                ],
                "evidence": [pin(path) for path in v5_paths],
            },
            "genericPbrVisualReviewAccepted": visual["review"]["genericPbrMaterialBindingAccepted"],
            "sourceGameShaderParity": visual["review"]["sourceGameShaderParity"],
            "ggdIntakeAccepted": False,
            "backendSelectable": False,
            "productionDeployed": False,
        },
        "stages": {
            "sourceFound": True,
            "publicPackagesDownloaded": True,
            "publicPackagesExtracted": True,
            "steamStreamingDecoded": True,
            "daiNativePackagesExtracted": True,
            "daiModelConvertedCandidate": True,
            "daiCurrentHardPolicyPassed": policy["currentChampionPolicy"]["pass"],
            "daiFormalDecimationGeometryTexturePassed": True,
            "daiFormalDecimationDrawCallPassed": True,
            "daiNativeMotionConverted": False,
            "vfxConverted": False,
            "audioSpeakerEventBindingVerified": False,
            "registered": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
        "inputs": [pin(path) for path in inputs],
    }
    current_ref = {
        "gitPath": (OUT / "inventory.json").relative_to(ROOT).as_posix(),
        "documentGitPath": (OUT / "README.md").relative_to(ROOT).as_posix(),
        "listeningReviewQueueGitPath": (OUT / "listening-review-groups.json").relative_to(ROOT).as_posix(),
        "sourceIds": PUBLIC_BATCH_IDS + [STEAM_AUDIO_ID, STEAM_ASSET_ID],
        "summary": summary,
        "daiCandidateStatus": {
            "candidateId": six_validation["candidateId"],
            "gitPath": six_git_model["gitPath"],
            "sha256": six_git_model["sha256"],
            "triangles": six_validation["metrics"]["triangles"],
            "maxTextureEdge": six_validation["metrics"]["maxTextureEdge"],
            "drawPrimitives": six_validation["metrics"]["drawPrimitives"],
            "animations": six_validation["metrics"]["animations"],
            "ownerPublicationAuthorized": True,
            "ownerVisualQualityReview": six_validation["webgl"]["reviewState"],
            "runtimeRegistered": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
            "evidence": [pin(path) for path in v5_paths],
        },
        "registered": False,
        "runtimeSelectable": False,
        "productionDeploymentVerified": False,
    }
    return inventory, queue, render_md(inventory), current_ref


def write_or_check(path: Path, content: bytes, check: bool):
    if check:
        if not path.is_file() or path.read_bytes() != content:
            raise ValueError("stale generated output: " + str(path))
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=WORKSPACE)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    inventory, queue, markdown, current_ref = build(args.workspace.resolve())
    outputs = {
        OUT / "inventory.json": (json.dumps(inventory, ensure_ascii=False, indent=2) + "\n").encode(),
        OUT / "listening-review-groups.json": (json.dumps(queue, ensure_ascii=False, indent=2) + "\n").encode(),
        OUT / "README.md": markdown.encode(),
    }
    for path, content in outputs.items():
        write_or_check(path, content, args.check)
    # The current-resource generator reads this small deterministic pointer.
    if not args.check:
        current_ref.update(
            sha256=sha(OUT / "inventory.json"),
            documentSha256=sha(OUT / "README.md"),
            listeningReviewQueueSha256=sha(OUT / "listening-review-groups.json"),
        )
        (OUT / "current-resource-entry.json").write_text(json.dumps(current_ref, ensure_ascii=False, indent=2) + "\n")
    else:
        expected = dict(current_ref,
            sha256=sha(OUT / "inventory.json"),
            documentSha256=sha(OUT / "README.md"),
            listeningReviewQueueSha256=sha(OUT / "listening-review-groups.json"))
        write_or_check(OUT / "current-resource-entry.json", (json.dumps(expected, ensure_ascii=False, indent=2) + "\n").encode(), True)
    print(json.dumps({"check": args.check, **inventory["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
