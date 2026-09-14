#!/usr/bin/env python3
"""Build the current Palworld skill VFX/SFX inventory and search plan."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
BASE = ROOT / "materials/hero-model-library"
OUT = BASE / "source-inventories/palworld-vfx-sfx-v1"


def read(path: Path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)
    return json.loads(path.read_text())


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb_document(path: Path) -> dict:
    raw = path.read_bytes()
    magic = raw[:4]
    if magic not in {b"glTF", b"\x01\x01\x01\x01"}:
        raise ValueError(f"unsupported GLB-like container: {path}")
    version, total_length = struct.unpack_from("<II", raw, 4)
    if version != 2 or total_length != len(raw):
        raise ValueError(f"invalid GLB-like header: {path}")
    chunk_length, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError(f"first chunk is not JSON: {path}")
    return json.loads(raw[20 : 20 + chunk_length].rstrip(b" \0"))


def animation_rows(path: Path) -> dict[str, dict]:
    doc = glb_document(path)
    accessors = doc.get("accessors", [])
    rows = {}
    for animation in doc.get("animations", []):
        maxima = []
        for sampler in animation.get("samplers", []):
            accessor_index = sampler.get("input")
            if isinstance(accessor_index, int) and accessor_index < len(accessors):
                maximum = accessors[accessor_index].get("max")
                if isinstance(maximum, list) and maximum and isinstance(maximum[0], (int, float)):
                    maxima.append(float(maximum[0]))
        name = animation.get("name") or f"animation-{len(rows)}"
        rows[name] = {
            "durationSeconds": round(max(maxima), 6) if maxima else None,
            "animationChannelCount": len(animation.get("channels", [])),
        }
    return rows


def skill_rows(settings, character):
    rows = []
    seen = set()
    for form in settings["forms"]:
        if form["character"] != character["nameEn"]:
            continue
        for skill in form["activeSkills"]:
            key = skill["code"]
            row = next((item for item in rows if item["code"] == key), None)
            if row:
                if form["form"] not in row["forms"]:
                    row["forms"].append(form["form"])
                continue
            rows.append({
                "code": key,
                "name": skill["name"],
                "forms": [form["form"]],
                "sourceUrl": skill["sourceUrl"],
                "vfxAssetState": "not-acquired",
                "skillSpecificSfxState": "not-acquired",
                "runtimeBinding": False,
            })
            seen.add(key)
    return rows


def build():
    config = read(HERE / "source-config.json")
    snapshot = read(HERE / "intake-snapshot.json")
    settings_path = BASE / "palworld/character-settings.json"
    pal_index_path = BASE / "palworld/帕魯三角色素材索引.json"
    windows_path = BASE / "source-inventories/windows-game-library.json.gz"
    settings = read(settings_path)
    pal_index = read(pal_index_path)
    windows = read(windows_path)
    steam_row = next(row for row in windows["steamGames"] if row.get("appId") == config["steamAppId"])
    if steam_row["title"] != "Palworld" or steam_row["catalogRole"] != "game-asset-source":
        raise ValueError("Palworld Windows source row is missing or is the dedicated server")
    if steam_row["buildId"] != snapshot["windowsInventory"]["buildId"]:
        raise ValueError("Refresh intake-snapshot.json for the current Palworld build")
    existing = {row["id"]: row for row in pal_index["characters"]}

    characters = []
    unused_audio = []
    unused_motions = []
    for character in config["characters"]:
        source = existing[character["id"]]
        skills = skill_rows(settings, character)
        # The Palworld index keeps every preserved model version.  Pick the
        # richest source animation name list, then keep only character-specific
        # combat families.  These remain motions; they are never promoted to
        # VFX or audio by their names.
        component = max(
            (row for row in source["modelCandidates"] if row.get("animationClipCount", 0) > 2),
            key=lambda row: (row.get("animationClipCount", 0), row.get("componentReady") is True),
        )
        component_path = Path(component["absolutePath"])
        if component_path.stat().st_size != component["bytes"] or sha256(component_path) != component["sha256"]:
            raise ValueError(f"source motion component changed: {component_path}")
        source_animations = animation_rows(component_path)
        animation_names = list(source_animations)
        relationships = character.get("motionSkillRelationships", [])
        motions = []
        for name in animation_names:
            prefix = next((value for value in character["motionPrefixes"] if name.startswith(value)), None)
            if not prefix:
                continue
            relationship = next(
                (row for row in relationships if name.startswith(row["motionPrefix"])),
                None,
            )
            motions.append({
                "clip": name,
                **source_animations[name],
                "prefix": prefix,
                "origin": "source-supplied-model-animation",
                "sourceContainer": {
                    "candidateId": component["id"],
                    "absolutePath": str(component_path.resolve()),
                    "gitPath": component.get("gitPath"),
                    "bytes": component["bytes"],
                    "sha256": component["sha256"],
                },
                "sourceSkillCodeCandidate": relationship["skillCode"] if relationship else None,
                "relationshipConfidence": relationship["confidence"] if relationship else "motion-family-only",
                "vfxAsset": False,
                "skillSpecificSfx": False,
                "reviewStatus": "pending",
                "runtimeBinding": False,
            })
            unused_motions.append({
                "characterId": character["id"],
                "heroId": character["heroId"],
                "nativeCharacterId": character["nativeId"],
                "clip": name,
                **source_animations[name],
                "sourceContainerCandidateId": component["id"],
                "sourceContainerAbsolutePath": str(component_path.resolve()),
                "sourceContainerSha256": component["sha256"],
                "sourceSkillCodeCandidate": relationship["skillCode"] if relationship else None,
                "relationshipConfidence": relationship["confidence"] if relationship else "motion-family-only",
                "ownerReviewStatus": "pending",
                "runtimeBinding": False,
            })
        audio = []
        for item in source["audioFiles"]:
            row = {
                "characterId": character["id"],
                "heroId": character["heroId"],
                "eventLabel": item.get("event") or item.get("label"),
                "category": "nonverbal-creature-cry",
                "sourceId": source["audioSourceId"],
                "absolutePath": item["absolutePath"],
                "bytes": item["bytes"],
                "sha256": item["sha256"],
                "codec": item.get("codec", item.get("format", "wav" if Path(item["absolutePath"]).suffix.lower() == ".wav" else None)),
                "sampleRateHz": item.get("sampleRate"),
                "channels": item.get("channels"),
                "durationSeconds": item.get("durationSeconds", item.get("seconds")),
                "decodeToNullPassed": item.get("decodeToNullPassed", True),
                "skillCode": None,
                "skillEventVerified": False,
                "ownerReviewStatus": "pending",
                "runtimeBinding": False,
            }
            audio.append(row)
            unused_audio.append(row)
        characters.append({
            **character,
            "skills": skills,
            "sourceMotionContainer": {
                "candidateId": component["id"],
                "absolutePath": str(component_path.resolve()),
                "gitPath": component.get("gitPath"),
                "bytes": component["bytes"],
                "sha256": component["sha256"],
                "animationClipCount": len(source_animations),
                "allAnimationChannelCount": sum(row["animationChannelCount"] for row in source_animations.values()),
                "allAnimationChannelsPerClipMax": max((row["animationChannelCount"] for row in source_animations.values()), default=0),
                "hashVerified": True,
            },
            "sourceSkillMotionCandidates": motions,
            "genericCryCandidates": audio,
            "packageSearchTokens": sorted(set(character["packageTokens"] + [row["code"] for row in skills])),
            "vfxCandidates": [],
            "skillSpecificSfxCandidates": [],
            "dependencyCandidates": [],
            "stage": "source-install-known-package-payload-unavailable",
            "runtimeBindingsAdded": 0,
        })

    inventory = {
        "schema": "ggd.palworld-vfx-sfx-inventory@1",
        "sourceId": config["sourceId"],
        "source": {
            "steamAppId": steam_row["appId"],
            "buildId": steam_row["buildId"],
            "platform": steam_row["platform"],
            "windowsPath": steam_row["sourcePath"],
            "catalogRole": steam_row["catalogRole"],
            "inventoryStatus": steam_row["inventoryStatus"],
            "containerInventoryStatus": steam_row["containerInventoryStatus"],
        },
        "inputs": [
            {"gitPath": str(settings_path.relative_to(ROOT)), "sha256": sha256(settings_path)},
            {"gitPath": str(pal_index_path.relative_to(ROOT)), "sha256": sha256(pal_index_path)},
            {"gitPath": str(windows_path.relative_to(ROOT)), "sha256": sha256(windows_path)},
            {"gitPath": str((HERE / "source-config.json").relative_to(ROOT)), "sha256": sha256(HERE / "source-config.json")},
            {"gitPath": str((HERE / "intake-snapshot.json").relative_to(ROOT)), "sha256": sha256(HERE / "intake-snapshot.json")},
        ],
        "summary": {
            "characters": len(characters),
            "distinctSourceSkills": sum(len(row["skills"]) for row in characters),
            "sourceSkillMotionCandidates": sum(len(row["sourceSkillMotionCandidates"]) for row in characters),
            "nativeNameStemSkillMotionCandidates": sum(
                item["relationshipConfidence"] == "native-name-stem-exact"
                for row in characters for item in row["sourceSkillMotionCandidates"]
            ),
            "translatedAliasSkillMotionCandidates": sum(
                item["relationshipConfidence"] == "translated-name-alias-only"
                for row in characters for item in row["sourceSkillMotionCandidates"]
            ),
            "genericCryCandidates": len(unused_audio),
            "acquiredStandaloneVfx": 0,
            "acquiredSkillSpecificSfx": 0,
            "convertedVfx": 0,
            "decodedSkillSpecificSfx": 0,
            "approvedAudio": 0,
            "runtimeBindingsAdded": 0,
            "productionDeployed": 0,
        },
        "intakeSnapshot": snapshot,
        "characters": characters,
        "blockers": [
            "The Windows inventory proves the Palworld client install exists but contains no per-file package inventory.",
            "The SMB common share was not mounted during this audit, so Palworld PAK/IoStore payload bytes read is zero.",
            "Existing OP.GG exports contain model animations and material textures, not standalone original skill VFX.",
            "Existing GameVault audio contains six generic creature cries per character and no verified skill-event mapping.",
            "Numeric Wwise media cannot be bound until its bank/event relation is recovered and each proposed pairing is owner-reviewed.",
        ],
        "nextReplay": {
            "windowsProbe": "powershell -ExecutionPolicy Bypass -File scan_palworld_packages.ps1",
            "extractedScan": "python3 scan_extracted_assets.py --root <already-extracted-Pal-root> --out scan.json",
            "packageListScan": "python3 scan_extracted_assets.py --package-list package-list.txt --out scan.json",
        },
    }
    unused = {
        "schema": "ggd.palworld-unused-av-assets@1",
        "summary": {
            "unboundVfx": 0,
            "unboundProps": 0,
            "unboundAudio": len(unused_audio),
            "unboundMotions": len(unused_motions),
            "skillSpecificSfx": 0,
            "ownerReviewPending": len(unused_audio),
            "runtimeBound": 0,
        },
        "vfx": [],
        "props": [],
        "motions": unused_motions,
        "audio": unused_audio,
        "note": "The 70 motions and 18 audio files remain reusable pending review. Motions are not standalone VFX; generic creature cries are not skill-specific SFX.",
    }
    return inventory, unused


def render(inventory, unused):
    s = inventory["summary"]
    lines = [
        "# 帕魯三名原作技能 VFX／SFX 索引",
        "",
        "本索引把角色技能、模型內原生技能動作、獨立 VFX、技能專屬 SFX 與一般叫聲分開。Windows 盤點已證明 Palworld 本體存在於 `F:\\SteamLibrary\\steamapps\\common\\Palworld`，但本輪沒有掛載 `common` 分享，也沒有 PAK／IoStore 逐檔清單，因此沒有讀取遊戲本體 payload。",
        "",
        f"目前共 {s['distinctSourceSkills']} 個去重來源技能、{s['sourceSkillMotionCandidates']} 段技能動作候選、{s['genericCryCandidates']} 段一般叫聲；其中 {s['nativeNameStemSkillMotionCandidates']} 段動作可由原生名稱詞幹連到技能代碼，另有 {s['translatedAliasSkillMotionCandidates']} 段只有翻譯別名候選。取得的獨立 VFX 與技能專屬 SFX 都是 0。沒有新增 runtime 綁定，也沒有宣稱部署。",
        "",
        "| 角色 | 來源技能 | 技能動作候選 | 單段最大通道 | 獨立 VFX | 技能專屬 SFX | 一般叫聲 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in inventory["characters"]:
        lines.append(f"| {row['nameZh']}／{row['nameEn']} | {len(row['skills'])} | {len(row['sourceSkillMotionCandidates'])} | {row['sourceMotionContainer']['allAnimationChannelsPerClipMax']} | 0 | 0 | {len(row['genericCryCandidates'])} |")
    lines += [
        "",
        "## 邊界與下一步",
        "",
        "- `sourceSkillMotionCandidates` 已直接從逐檔 SHA 驗證的 29／58／33 動作 GLB 讀取名稱、時長與通道數；它們是模型骨架動作，不能當成 Niagara／粒子特效。",
        "- 原生名稱詞幹關係仍只是審查候選；`bindingApproved=false`、`runtimeBinding=false`，不因名稱相同自動綁定技能事件。",
        "- 三顆現用審查 component 的動態政策結果與證據雜湊在 `preserved-source-audit.json.currentReviewComponentPolicy`；數值來自既有驗收收據，不在此文件另寫一套門檻。",
        "- 18 段叫聲全部保留絕對路徑與 SHA-256，但技能事件尚未核實，使用者聽審狀態為 pending，runtime binding 固定為 0。",
        "- `scan_palworld_packages.ps1` 只讀列舉並雜湊遊戲容器；找到 `UnrealPak.exe` 時才嘗試標準 `-List`。它不找 AES key、不解密、不擷取。",
        "- 已有合法解包目錄或 package-list 後，用 `scan_extracted_assets.py` 建立逐檔候選。檔名命中仍需 UE 依賴解析、VFX 視覺驗收、Wwise event-bank 關係及逐項聽審。",
        "",
        "## 未使用素材",
        "",
        f"[unused-assets.json](unused-assets.json) 保存 {unused['summary']['unboundAudio']} 段一般叫聲；[preserved-source-audit.json](preserved-source-audit.json) 逐檔驗證現有模型、貼圖、動作與音訊容器。裡面的模型貼圖與發光材質仍不算獨立 VFX；目前沒有可列入的獨立 VFX 或道具。",
        "",
        "重建：`python3 tools/hero-model-library/source-workflows/palworld-vfx-sfx-v1/build_inventory.py`；檢查加 `--check`。",
        "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    inventory, unused = build()
    products = {
        OUT / "inventory.json": json.dumps(inventory, ensure_ascii=False, indent=2) + "\n",
        OUT / "unused-assets.json": json.dumps(unused, ensure_ascii=False, indent=2) + "\n",
        OUT / "README.md": render(inventory, unused),
    }
    for path, value in products.items():
        if args.check:
            if not path.is_file() or path.read_text() != value:
                raise ValueError(f"stale generated file: {path}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
    if not args.check:
        preserved_audit = OUT / "preserved-source-audit.json"
        entry = {
            "schema": "ggd.palworld-vfx-sfx-current-resource-entry@1",
            "sourceId": inventory["sourceId"],
            "gitPath": str((OUT / "inventory.json").relative_to(ROOT)),
            "sha256": sha256(OUT / "inventory.json"),
            "documentGitPath": str((OUT / "README.md").relative_to(ROOT)),
            "documentSha256": sha256(OUT / "README.md"),
            "unusedAssetIndexGitPath": str((OUT / "unused-assets.json").relative_to(ROOT)),
            "unusedAssetIndexSha256": sha256(OUT / "unused-assets.json"),
            "summary": inventory["summary"],
            "stage": "source-installed-container-payload-unavailable",
            "runtimeBinding": False,
            "productionDeploymentVerified": False,
        }
        if preserved_audit.is_file():
            entry.update(
                preservedSourceAuditGitPath=str(preserved_audit.relative_to(ROOT)),
                preservedSourceAuditSha256=sha256(preserved_audit),
            )
        (OUT / "current-resource-entry.json").write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n")
    else:
        entry = read(OUT / "current-resource-entry.json")
        for path, key in ((OUT / "inventory.json", "sha256"), (OUT / "README.md", "documentSha256"), (OUT / "unused-assets.json", "unusedAssetIndexSha256")):
            if entry[key] != sha256(path):
                raise ValueError(f"stale current-resource entry: {path}")
        preserved_audit = OUT / "preserved-source-audit.json"
        if preserved_audit.is_file() and entry.get("preservedSourceAuditSha256") != sha256(preserved_audit):
            raise ValueError(f"stale current-resource entry: {preserved_audit}")
    print(json.dumps(inventory["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
