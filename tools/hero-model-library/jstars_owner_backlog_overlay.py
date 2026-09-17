"""Project the owner J-Stars PS3 token inventory into the portable backlog.

The tracked receipts prove 56 character/model tokens and expose an internal
STPK identity name for each.  Six owner-priority identities have an explicit
GGD mapping; the remaining internal names stay in identity review.  The
shared CPK is acquired source material, not a converted body or runtime model
option.  Portable rebuilds validate tracked receipts and never require Main to
mount the owner's 3.9 GB ISO or local CPK.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path


SOURCE_ID = "owner-jstars-victory-vs-plus-20260917"
PREFIX = "jstars-owner-native:"
RECEIPT = "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json"
INVENTORY = "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json"
IDENTITY = "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/identity-probe.json"
PRIORITY = "materials/hero-model-library/priority-evidence/jstars-priority-six-v1/source-receipt.json"
AUDIO = "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/audio-extract.json"
PRIORITY_WORKS = {
    "028": "銀魂", "041": "靈異教師神眉", "017": "HUNTER×HUNTER",
    "018": "HUNTER×HUNTER", "037": "幸運超人", "012": "幽遊白書",
}


def _read(path: Path) -> dict:
    return json.loads(path.read_text())


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError("J-Stars owner backlog overlay rejected: " + message)


def _resources(group: dict, audio: dict | None = None) -> dict:
    modules = group["moduleCounts"]
    decoded_audio = int(audio.get("decodedAudioFiles", 0)) if audio else 0
    return {
        "motion": f"原生 token 群索引 {modules.get('motion', 0)} 筆；尚未解碼成可播動作",
        "vfx": f"原生 token 群索引 {modules.get('vfx', 0)} 筆；技能事件映射待解碼",
        "sfx": f"原生 token 群索引 {modules.get('sfx', 0)} 筆；音效尚未解碼聽審",
        "voice": (
            f"日文 CV/PV 已解碼 {decoded_audio} 段 HCA＋WAV；逐段說話者與事件待 owner 聽審"
            if decoded_audio else
            f"原生 token 群索引 {modules.get('voice', 0)} 筆；說話者與語言待確認"
        ),
        "voiceGroupIds": ([f"{SOURCE_ID}:{group['nativeToken']}:CV", f"{SOURCE_ID}:{group['nativeToken']}:PV"]
                          if decoded_audio else []),
        "indexedAudioFileCount": decoded_audio,
        "unclassifiedAudioFileCount": decoded_audio,
        "sourceAudioGroupsNotAssignedToCharacter": ([] if decoded_audio else [SOURCE_ID + ":" + group["nativeToken"]]),
        "sourceLabels": ["J-STARS 勝利對決+ PS3 原作"],
        "voiceIndex": "materials/hero-model-library/voice-index.json",
        "audioFileIndex": "materials/hero-model-library/voice-files.jsonl.gz",
        "motionCandidateCounts": [],
        "nativeMotionSources": [],
        "evidencePaths": [INVENTORY, *([AUDIO] if decoded_audio else [])],
        "classificationIsAcquisitionSnapshot": True,
    }


def _row(group: dict, container: dict, identity: dict, priority: dict | None,
         audio: dict | None,
         repo: Path) -> dict:
    token = group["nativeToken"]
    absolute = str(Path(container["absolutePath"]).resolve())
    internal_names = identity["internalIdentityNames"]
    internal_label = "／".join(internal_names)
    if priority:
        name = priority["nameZhTW"]
        original_name = priority["nameEnglish"]
        work = PRIORITY_WORKS[token]
        mapped = list(priority["ggdHeroIds"])
        checks = []
        for hero_id in mapped:
            champion_path = repo / "content/champions" / f"{hero_id}.json"
            _require(champion_path.is_file(), f"confirmed priority hero is absent: {hero_id}")
            champion = _read(champion_path)
            checks.append({
                "heroId": hero_id, "name": champion.get("name", hero_id),
                "implemented": True, "mechanicsAuditStale": False,
                "designComplete": None, "missingRefs": [],
                "status": "definition-present-jstars-option-conversion-pending",
                "availability": "英雄已存在；J-Stars 原生容器已取得，尚未轉換成模型選項",
            })
        design_status = "definitions-incomplete"
        reason = "角色身分與既有英雄已確認；J-Stars 模型／動作／特效／音訊仍受 $CH0 與 PS3 SRD 轉換阻擋。"
    else:
        name = f"J-STARS {internal_label}（token {token}，內部名待對照）"
        original_name = internal_label
        work = "J-STARS 勝利對決+"
        mapped, checks = [], []
        design_status = "identity-review"
        reason = "partial STPK 已顯示內部名，但尚未對照完整中文角色名與 GGD 英雄 ID。"
    candidate = {
        "id": f"{SOURCE_ID}:{token}:partition_op_character_ps3.cpk",
        "sourceCharacterId": PREFIX + token,
        "library": "original-game-owner-archive",
        "sourceId": SOURCE_ID,
        "path": absolute,
        "absolutePath": absolute,
        "bytes": container["bytes"],
        "sha256": container["sha256"],
        "format": "CRI CPK containing $CMP PAK members",
        "readiness": "native-container-indexed-payloads-not-materialized",
        "existsLocal": True,
        "localSizeMatches": True,
        "localPresenceBasis": "tracked owner-machine inventory receipt; portable rebuild does not reread the CPK",
        "resourceRole": "shared-source-container",
        "isStandaloneModelCandidate": False,
        "identityConfidence": ("owner-priority-internal-name-and-ggd-mapping-confirmed"
                               if priority else "internal-stpk-name-observed-roster-mapping-pending"),
        "nativeCharacterId": token,
        "internalIdentityNames": internal_names,
        "memberCount": group["memberCount"],
        "moduleCounts": group["moduleCounts"],
        "sourceIndex": INVENTORY,
    }
    return {
        "id": PREFIX + token,
        "name": name,
        "nameZh": name,
        "displayName": name,
        "originalName": original_name,
        "work": work,
        "works": [work],
        "workZh": work,
        "displayWork": f"{work}（J-STARS PS3 來源）",
        "sourceIds": [SOURCE_ID],
        "aliases": [token, "native-token-" + token, *internal_names],
        "modelCandidates": [candidate],
        "candidateBreakdown": {
            "characterBodySources": 0,
            "standaloneCharacterBodies": 0,
            "componentsOrProps": 0,
            "sharedContainers": 1,
            "otherCandidateFiles": 0,
        },
        "mappedHeroIds": mapped,
        "identityHeroIds": mapped,
        "proxyUseHeroIds": [],
        "possibleIdentityHeroIds": [],
        "designStatus": design_status,
        "noDesignReason": reason,
        "convertedReadiness": {
            "nativeBodyPresent": False,
            "convertedCandidateCount": 0,
            "hasGgdConvertedBody": False,
            "renderAcceptancePerformedByThisAudit": False,
        },
        "abilityChecks": [],
        "evidence": {
            "source": [{
                "sourceId": SOURCE_ID,
                "sourceIndex": INVENTORY,
                "originStatus": "PS3 原生 token 與容器已確認；角色姓名待核",
                "canonicalName": name,
                "canonicalWork": "J-Stars Victory VS+",
                "originNote": f"token {token} 含 {group['memberCount']} 筆 CPK 成員關係；$CMP/$CH0 尚待解碼。",
                "bodyQualification": "shared-native-container-only",
            }],
            "explicitMappings": [],
            "nameCandidates": [],
            "rejectedNameCandidates": [],
            "nameAndWorkCatalogChecked": False,
            "identityUncertain": True,
            "scope": "owner PS3 archive numeric token inventory",
        },
        "missingFormModels": [],
        "supplementalModelsNotCountedAsBodies": [],
        "currentHeroChecks": checks,
        "nameTranslationBasis": ("owner-priority internal identity mapping" if priority
                                 else "partial STPK internal identity name; Chinese roster mapping pending"),
        "workTranslationBasis": "owner archive, PS3 PARAM.SFO and confirmed priority roster mapping",
        "localizationChangesIdentity": False,
        "resources": _resources(group, audio),
    }


def apply_jstars_owner_overlay(data: dict, repo: Path) -> dict:
    repo = Path(repo)
    receipt_path, inventory_path = repo / RECEIPT, repo / INVENTORY
    identity_path, priority_path, audio_path = repo / IDENTITY, repo / PRIORITY, repo / AUDIO
    if not all(p.is_file() for p in (receipt_path, inventory_path, identity_path, priority_path, audio_path)):
        return data
    receipt, inventory = _read(receipt_path), _read(inventory_path)
    identity, priority, audio = _read(identity_path), _read(priority_path), _read(audio_path)
    _require(receipt.get("sourceId") == SOURCE_ID, "archive source ID drift")
    _require(receipt.get("status") == "inventoried-read-only", "archive inventory is incomplete")
    _require(inventory.get("sourceId") == SOURCE_ID, "CPK source ID drift")
    _require(inventory.get("summary", {}).get("nativeTokenGroups") == 58,
             "expected 58 numeric token groups including non-character 700/701")
    _require(identity.get("schema") == "ggd.jstars-owner-identity-probe@1",
             "identity probe schema drift")
    _require(identity.get("sourceId") == SOURCE_ID, "identity probe source ID drift")
    _require(identity.get("summary", {}).get("nativeTokensProbed") == 56 and
             identity.get("summary", {}).get("tokensWithInternalIdentity") == 56,
             "expected 56 character/model token identity probes")
    _require(priority.get("sourceId", SOURCE_ID) == SOURCE_ID and
             priority.get("summary", {}).get("nativeIdsConfirmed") == 6,
             "priority-six identity receipt drift")
    _require(audio.get("sourceId") == SOURCE_ID and
             audio.get("summary", {}).get("priorityCharacters") == 6 and
             audio.get("summary", {}).get("decodedWavFiles") == 2394,
             "priority-six audio extraction receipt drift")
    groups = inventory.get("nativeCharacterGroups", [])
    _require(len(groups) == 58 and len({g["nativeToken"] for g in groups}) == 58,
             "native token group set is incomplete or duplicated")
    identity_by_token = {row["nativeToken"]: row for row in identity.get("rows", [])}
    _require(len(identity_by_token) == 56, "identity token set is incomplete or duplicated")
    group_by_token = {row["nativeToken"]: row for row in groups}
    _require(set(identity_by_token) <= set(group_by_token), "identity probe token absent from CPK inventory")
    _require(set(group_by_token) - set(identity_by_token) == {"700", "701"},
             "unexpected non-character native token groups")
    priority_by_token = {row["nativeId"]: row for row in priority.get("characters", [])}
    _require(len(priority_by_token) == 6 and set(priority_by_token) <= set(identity_by_token),
             "priority-six token set is incomplete")
    audio_by_token = {row["nativeId"]: row for row in audio.get("characters", [])}
    _require(set(audio_by_token) == set(priority_by_token), "priority-six audio token set is incomplete")
    matches = [c for c in inventory.get("containers", [])
               if c.get("fileName") == "partition_op_character_ps3.cpk"]
    _require(len(matches) == 1, "character CPK must occur exactly once")
    container = matches[0]
    _require(container.get("bytes", 0) > 0 and len(container.get("sha256", "")) == 64,
             "character CPK receipt lacks pinned bytes or SHA-256")

    result = copy.deepcopy(data)
    retained = []
    removed = []
    for row in result["characters"]:
        (removed if row.get("id", "").startswith(PREFIX) else retained).append(row)
    rows = [_row(group_by_token[token], container, identity_by_token[token],
                 priority_by_token.get(token), audio_by_token.get(token), repo)
            for token in sorted(identity_by_token)]
    result["characters"] = retained + rows
    result["sourceIdentityCount"] = len(result["characters"])
    result["counts"] = {
        status: sum(row["designStatus"] == status for row in result["characters"])
        for status in ("not-defined", "definitions-incomplete", "identity-review",
                       "designed", "source-unavailable")
    }

    for rel, path in ((RECEIPT, receipt_path), (INVENTORY, inventory_path),
                      (IDENTITY, identity_path), (PRIORITY, priority_path), (AUDIO, audio_path)):
        result.setdefault("inputs", [])[:] = [i for i in result["inputs"] if i.get("path") != rel]
        result["inputs"].append({"path": rel, "sha256": _sha(path)})
    boundary = ("J-Stars owner PS3 rows are tracked token groups backed by a shared CPK; "
                "internal STPK names and six confirmed GGD mappings do not prove decoded bodies, "
                "runtime options or deployment. Six priority CV/PV banks are decoded for review, "
                "but numeric cues do not prove speaker or GGD event bindings.")
    result.setdefault("boundaries", [])[:] = [b for b in result["boundaries"] if b != boundary]
    result["boundaries"].append(boundary)
    result.setdefault("portableOverlay", {})["jstarsOwnerArchive"] = {
        "sourceId": SOURCE_ID,
        "nativeTokenGroups": len(rows),
        "confirmedPriorityMappings": len(priority_by_token),
        "identityStatus": "six-mapped-fifty-internal-name-review",
        "additionalNonCharacterTokenGroups": ["700", "701"],
        "payloadsMaterialized": inventory["safety"]["memberPayloadsMaterialized"],
        "runtimeRegistered": inventory["summary"]["runtimeRegistered"],
        "decodedJapaneseAudioFiles": audio["summary"]["decodedWavFiles"],
    }
    source_families = result.setdefault("resourceCoverage", {}).setdefault("sourceFamilies", [])
    source_families[:] = [family for family in source_families
                          if family.get("sourceFamilyId") != "jstars-owner-ps3"]
    module_totals = {
        kind: sum(group.get("moduleCounts", {}).get(kind, 0)
                  for group in groups if group["nativeToken"] not in {"700", "701"})
        for kind in ("motion", "vfx", "sfx", "voice")
    }
    source_families.append({
        "sourceFamilyId": "jstars-owner-ps3",
        "nameZh": "J-STARS 勝利對決+（PS3／BLUS31519）",
        "sourceIds": [SOURCE_ID],
        "model": ("7 個 CPK／19,471 筆成員已逐檔建檔；56 個角色／模型 token 已找到"
                  "模型、骨架與貼圖容器候選。六名優先角已對應 GGD 英雄，其餘 50 名待核身分；"
                  "完成轉換模型 0，後台註冊 0。"),
        "motion": f"原生 motion 容器索引 {module_totals['motion']} 筆；$CH0／PS3 SRD 尚待解碼，可播動作 0。",
        "vfx": f"原生 VFX 容器索引 {module_totals['vfx']} 筆；技能事件映射與 GGD 轉換尚未完成。",
        "sfx": f"原生 SFX 容器索引 {module_totals['sfx']} 筆；已解碼可聽及已審核 0。",
        "voice": (f"原生 voice 容器索引 {module_totals['voice']} 筆；六名優先角 CV/PV 已解碼 "
                  f"{audio['summary']['decodedWavFiles']} 段日文 WAV，逐段說話者與事件待 owner 聽審。"),
        "links": [
            ["原始包／ISO 收據", RECEIPT],
            ["CPK 逐檔索引", INVENTORY],
            ["56 組原生 token 身分收據", IDENTITY],
            ["六名優先角對應", PRIORITY],
            ["六名日文音訊解碼收據", AUDIO],
        ],
    })
    return result
