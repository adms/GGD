#!/usr/bin/env python3
"""Build the J-STARS batch conversion and publication inventory.

The workflow consumes existing extraction and audio receipts.  It never
re-decodes audio and never promotes a source container to converted,
registered, or deployed without an explicit downstream receipt.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


SCHEMA = "ggd.jstars-batch-inventory@1"
SOURCE_ID = "owner-jstars-victory-vs-plus-20260917"
START = "<!-- generated:jstars-batch-inventory-v1:start -->"
END = "<!-- generated:jstars-batch-inventory-v1:end -->"
PRIORITY_FOUR = (
    ("gon", "017", "小傑·富力士", ("godie-ucrl",)),
    ("nube", "041", "鵺野鳴介／神眉", ("b2-nube",)),
    ("luckyman", "037", "幸運超人", ("b2-luckyman",)),
    ("hiei", "012", "飛影", ("godie-u010", "godie-uvng")),
)
MODULE_ORDER = ("model", "texture", "skeleton", "motion", "vfx", "sfx", "voice")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def read_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def inputs(repo: Path) -> dict[str, Path]:
    base = repo / "materials/hero-model-library/source-inventories"
    return {
        "plan": base / "jstars-owner-archive-v1/plan.json",
        "cpk": base / "jstars-owner-archive-extract-v1/cpk-inventory.json",
        "identity": base / "jstars-owner-archive-extract-v1/identity-probe.json",
        "audio": base / "jstars-owner-archive-extract-v1/audio-extract.json",
        "runtime": base / "jstars-rpcs3-memory-capture-v1/inventory.json",
    }


def stage(stage_id: str, status: str, evidence: list[str], reason: str) -> dict[str, Any]:
    return {"id": stage_id, "status": status, "evidence": evidence, "reason": reason}


def module_state(kind: str, candidate_count: int) -> dict[str, Any]:
    return {
        "kind": kind,
        "candidateContainerMemberCount": candidate_count,
        "convertedArtifactCount": 0,
        "validatedArtifactCount": 0,
        "registeredArtifactCount": 0,
        "deployedArtifactCount": 0,
        "status": "native-container-members-hashed-conversion-blocked",
        "blocker": "$CH0 complete decode and PS3 SRD/SRDI/SRDV conversion are not verified",
    }


def build(repo: Path) -> dict[str, Any]:
    paths = inputs(repo)
    plan = read_object(paths["plan"])
    cpk = read_object(paths["cpk"])
    identity = read_object(paths["identity"])
    audio = read_object(paths["audio"])
    runtime = read_object(paths["runtime"])

    if plan.get("sourceId") != SOURCE_ID or cpk.get("sourceId") != SOURCE_ID:
        raise ValueError("J-STARS source IDs do not match the batch contract")
    if runtime.get("sourceId") != SOURCE_ID or runtime.get("titleId") != "BLUS31519":
        raise ValueError("J-STARS runtime receipt does not match BLUS31519")
    characters = plan.get("characters")
    groups = cpk.get("nativeCharacterGroups")
    identity_rows = identity.get("rows")
    if not isinstance(characters, list) or not isinstance(groups, list) or not isinstance(identity_rows, list):
        raise ValueError("J-STARS upstream receipts are missing roster/group rows")
    if len(characters) != 52 or len(groups) != 58:
        raise ValueError(f"unexpected J-STARS inventory size: roster={len(characters)} groups={len(groups)}")

    group_by_token = {row["nativeToken"]: row for row in groups}
    identity_by_token = {row["nativeToken"]: row for row in identity_rows}
    audio_by_slug = {row["slug"]: row for row in audio.get("characters", [])}
    confirmed_by_slug = {row["slug"]: row for row in identity.get("priorityCharacters", [])}
    cpk_priority_by_slug = {row["slug"]: row for row in cpk.get("priorityCharacters", [])}

    native_groups: list[dict[str, Any]] = []
    for row in sorted(groups, key=lambda item: item["nativeToken"]):
        token = row["nativeToken"]
        probe = identity_by_token.get(token, {})
        modules = {
            kind: module_state(kind, int(row.get("moduleCounts", {}).get(kind, 0)))
            for kind in MODULE_ORDER
        }
        native_groups.append(
            {
                "nativeToken": token,
                "internalIdentityNames": probe.get("internalIdentityNames", []),
                "identityStatus": probe.get("identityStatus", "not-probed"),
                "completeNativeDecode": bool(probe.get("completeNativeDecode", False)),
                "payloadMemberCount": row["memberCount"],
                "localFilesIncludingManifest": row["memberCount"] + 1,
                "payloadBytes": row["splitManifest"]["payloadBytes"],
                "splitManifest": row["splitManifest"],
                "modules": modules,
                "converted": False,
                "registered": False,
                "deployed": False,
            }
        )

    priority_rows: list[dict[str, Any]] = []
    for slug, token, name, hero_ids in PRIORITY_FOUR:
        group = group_by_token[token]
        probe = identity_by_token[token]
        confirmed = confirmed_by_slug[slug]
        priority = cpk_priority_by_slug[slug]
        voice = audio_by_slug[slug]
        if confirmed.get("nativeId") != token or priority.get("nativeId") != token:
            raise ValueError(f"priority identity drift: {slug} expected {token}")
        if confirmed.get("identityStatus") != "confirmed-unique-internal-stpk-member-name":
            raise ValueError(f"priority identity is no longer unique: {slug}")
        modules = {
            kind: module_state(kind, int(group.get("moduleCounts", {}).get(kind, 0)))
            for kind in MODULE_ORDER
        }
        duration = round(sum(float(bank["durationSeconds"]) for bank in voice["banks"]), 3)
        modules["voice"].update(
            {
                "decodedListeningCandidateCount": voice["decodedAudioFiles"],
                "decodedDurationSeconds": duration,
                "language": voice["language"],
                "ownerApprovedCount": 0,
                "runtimeEventBindingCount": 0,
                "status": "decoded-listening-candidates-owner-event-speaker-review-pending",
                "blocker": "numeric cue names do not prove speaker or runtime event mapping",
            }
        )
        evidence = [
            str(paths["cpk"].relative_to(repo)),
            str(paths["identity"].relative_to(repo)),
            str(paths["audio"].relative_to(repo)),
        ]
        stages = [
            stage("source-inventory", "passed", evidence[:1], "source CPK members and per-token split manifest are hashed"),
            stage("identity", "passed", evidence[1:2], "unique internal STPK member name confirms the native token"),
            stage("native-decode", "blocked", evidence[1:2], "$CH0 payload is only partially decoded"),
            stage("model-standardization", "blocked", evidence[:2], "no verified PS3 SRD/SRDI/SRDV to GLB conversion receipt"),
            stage("motion-standardization", "blocked", evidence[:2], "native motion containers exist but no GGD semantic mapping or playback receipt exists"),
            stage("vfx-standardization", "blocked", evidence[:2], "native VFX containers exist but no executable GGD effect receipt exists"),
            stage("audio-decode", "candidate-ready", evidence[2:], f"{voice['decodedAudioFiles']} Japanese WAV listening candidates already exist; this workflow does not re-decode them"),
            stage("audio-review-and-binding", "pending", evidence[2:], "speaker and event review has not been approved"),
            stage("runtime-registration", "blocked", evidence, "no validated model/motion/VFX set or approved audio event map exists"),
            stage("production-deployment", "blocked", evidence, "registration and production verification receipts are absent"),
        ]
        priority_rows.append(
            {
                "slug": slug,
                "nameZhTW": name,
                "nativeId": token,
                "ggdHeroIds": list(hero_ids),
                "identityStatus": confirmed["identityStatus"],
                "payloadMemberCount": group["memberCount"],
                "localFilesIncludingManifest": group["memberCount"] + 1,
                "payloadBytes": group["splitManifest"]["payloadBytes"],
                "modules": modules,
                "stages": stages,
                "converted": False,
                "registered": False,
                "deployed": False,
                "status": "source-ready-conversion-blocked",
            }
        )

    roster_rows = []
    for row in sorted(characters, key=lambda item: item["rosterOrder"]):
        token = row.get("nativeId")
        roster_rows.append(
            {
                "rosterOrder": row["rosterOrder"],
                "role": row["role"],
                "workZhTW": row["workZhTW"],
                "nameZhTW": row["nameZhTW"],
                "nameEnglish": row["nameEnglish"],
                "nativeId": token,
                "ggdHeroIds": row.get("ggdHeroIds", []),
                "sourceStatus": "native-id-confirmed-source-containers-hashed" if token else "roster-listed-native-id-unconfirmed",
                "converted": False,
                "registered": False,
                "deployed": False,
            }
        )

    priority_decoded = sum(row["modules"]["voice"]["decodedListeningCandidateCount"] for row in priority_rows)
    priority_duration = round(sum(row["modules"]["voice"]["decodedDurationSeconds"] for row in priority_rows), 3)
    summary = {
        "rosterCharacters": len(roster_rows),
        "playableCharacters": sum(row["role"] == "playable" for row in roster_rows),
        "supportCharacters": sum(row["role"] == "support" for row in roster_rows),
        "nativeTokenGroups": len(native_groups),
        "nativeTokensWithInternalIdentity": sum(bool(row["internalIdentityNames"]) for row in native_groups),
        "sourceMembersHashed": cpk["summary"]["membersHashed"],
        "priorityCharacters": len(priority_rows),
        "priorityPayloadMembers": sum(row["payloadMemberCount"] for row in priority_rows),
        "priorityLocalFilesIncludingManifests": sum(row["localFilesIncludingManifest"] for row in priority_rows),
        "priorityDecodedJapaneseWavCandidates": priority_decoded,
        "priorityDecodedDurationSeconds": priority_duration,
        "runtimeToolSetupVerified": runtime["summary"]["rpcs3ToolSetupVerified"],
        "firmwareInstalledVerified": runtime["summary"]["firmwareInstalledVerified"],
        "titleScreenMemoryCaptures": runtime["summary"]["memoryCaptures"],
        "titleScreenCarvedStpk": runtime["summary"]["baselineTitleScreen"]["summary"]["carvedStpk"],
        "characterTaggedMemoryCaptures": runtime["summary"]["characterTaggedMemoryCaptures"],
        "convertedModels": 0,
        "registeredOptions": 0,
        "productionDeployments": 0,
    }
    if priority_decoded != 1596:
        raise ValueError(f"priority audio receipt drift: expected 1596, found {priority_decoded}")
    return {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "sourceGame": "J-Stars Victory VS+",
        "platformVersion": f"{runtime['titleId']} / {runtime['appVersion']}",
        "runtimeCapture": {
            "tool": runtime["summary"]["rpcs3PackageStatus"],
            "firmware": runtime["requiredSystemVersion"],
            "baselineReceipt": runtime["summary"]["baselineTitleScreen"],
            "characterTaggedCaptureCount": runtime["summary"]["characterTaggedMemoryCaptures"],
            "status": "runtime-ready-character-load-and-tagged-captures-pending",
        },
        "statusVocabulary": {
            "source-ready-conversion-blocked": "source payload and identity are proven; runtime conversion is not complete",
            "candidate-ready": "a reviewable intermediate exists; it is not an accepted runtime asset",
            "registered": "an accepted exact artifact is present in a backend option manifest",
            "deployed": "the registered exact artifact is verified on production",
        },
        "inputReceipts": {key: str(path.relative_to(repo)) for key, path in paths.items()},
        "summary": summary,
        "priorityFour": priority_rows,
        "roster": roster_rows,
        "nativeContainerGroups": native_groups,
    }


def render_markdown(data: dict[str, Any]) -> str:
    summary = data["summary"]
    lines = [
        "# J-STARS 批次轉換與上架清單",
        "",
        "本清單由現有 CPK、身分與音訊收據重建，不重跑已完成的 1,596 段音訊解碼。「已獲得／已分流」不等於已轉換、已註冊或已部署。",
        "",
        f"- 公開名單：{summary['rosterCharacters']} 名（可操作 {summary['playableCharacters']}／支援 {summary['supportCharacters']}）",
        f"- 原生 token：{summary['nativeTokenGroups']} 組，其中 {summary['nativeTokensWithInternalIdentity']} 組有 partial STPK 內部名",
        f"- CPK 成員雜湊：{summary['sourceMembersHashed']:,} 筆",
        f"- 優先四名：{summary['priorityPayloadMembers']} 個 payload／{summary['priorityLocalFilesIncludingManifests']} 個本機檔（含 manifest）；日文 WAV 候選 {summary['priorityDecodedJapaneseWavCandidates']:,} 段／{summary['priorityDecodedDurationSeconds']:.3f} 秒",
        f"- RPCS3／韌體：已驗證；標題畫面唯讀記憶體 capture {summary['titleScreenMemoryCaptures']} 份（STPK {summary['titleScreenCarvedStpk']}）；角色已載入標記 capture {summary['characterTaggedMemoryCaptures']} 份",
        f"- 現況：模型已轉換 {summary['convertedModels']}／後台已註冊 {summary['registeredOptions']}／正式站已部署 {summary['productionDeployments']}",
        "",
        "## 優先四名",
        "",
        "| 角色 | token | 來源成員 | 模型／骨架／動作 | VFX／SFX | 日文音訊 | 轉換／註冊／部署 |",
        "|---|---:|---:|---|---|---:|---|",
    ]
    for row in data["priorityFour"]:
        m = row["modules"]
        lines.append(
            f"| {row['nameZhTW']} | `{row['nativeId']}` | {row['payloadMemberCount']} payload／{row['localFilesIncludingManifest']} 含 manifest | "
            f"{m['model']['candidateContainerMemberCount']}／{m['skeleton']['candidateContainerMemberCount']}／{m['motion']['candidateContainerMemberCount']} | "
            f"{m['vfx']['candidateContainerMemberCount']}／{m['sfx']['candidateContainerMemberCount']} | "
            f"{m['voice']['decodedListeningCandidateCount']} | 0／0／0；`{row['status']}` |"
        )
    lines += [
        "",
        "RPCS3 工具、4.70 韌體與 `BLUS31519 / 01.00` 啟動均已驗證；標題畫面基準 capture 沒有 STPK。四名共同阻擋是必須先在遊戲內逐一載入角色，再取得帶角色 ID 的記憶體 capture，才能接續 `$CH0`／PS3 SRD／SRDI／SRDV 轉換。音訊只是已解碼的聽審候選，數字 cue 名不足以證明說話者或技能事件，所以 runtime 綁定仍為 0。",
        "",
        "## 52 名公開名單對應",
        "",
        "| # | 角色 | 作品 | 類型 | token | GGD 英雄 | 狀態 |",
        "|---:|---|---|---|---:|---|---|",
    ]
    for row in data["roster"]:
        token = f"`{row['nativeId']}`" if row["nativeId"] else "待對照"
        hero_ids = "、".join(f"`{value}`" for value in row["ggdHeroIds"]) or "待設計"
        lines.append(
            f"| {row['rosterOrder']} | {row['nameZhTW']} | {row['workZhTW']} | {row['role']} | {token} | {hero_ids} | `{row['sourceStatus']}`；轉換／註冊／部署 0／0／0 |"
        )
    lines += [
        "",
        "## 原生 token 容器組",
        "",
        "| token | 內部名 | payload | 模型 | 動作 | VFX | 轉換／註冊／部署 |",
        "|---:|---|---:|---:|---:|---:|---|",
    ]
    for row in data["nativeContainerGroups"]:
        aliases = ", ".join(row["internalIdentityNames"]) or "未得到內部名"
        modules = row["modules"]
        lines.append(
            f"| `{row['nativeToken']}` | {aliases} | {row['payloadMemberCount']} | "
            f"{modules['model']['candidateContainerMemberCount']} | {modules['motion']['candidateContainerMemberCount']} | "
            f"{modules['vfx']['candidateContainerMemberCount']} | 0／0／0 |"
        )
    lines.append("")
    return "\n".join(lines)


def report_section(data: dict[str, Any]) -> str:
    summary = data["summary"]
    rows = [
        START,
        "### J-STARS 全角色容器與優先四名轉換閥",
        "",
        f"現有收據可重建 **{summary['rosterCharacters']} 名公開名單／{summary['nativeTokenGroups']} 組原生 token／{summary['sourceMembersHashed']:,} 筆 CPK 成員雜湊**。優先四名為小傑 `017`、鵺野鳴介 `041`、幸運超人 `037`、飛影 `012`；每名 89 個 payload（含 manifest 為 90 檔），四名共 {summary['priorityDecodedJapaneseWavCandidates']:,} 段日文 WAV 聽審候選。",
        "",
        f"RPCS3 工具與 4.70 韌體已驗證，遊戲版本為 `BLUS31519 / 01.00`。已完成 {summary['titleScreenMemoryCaptures']} 份標題畫面唯讀記憶體基準 capture，切出 STPK {summary['titleScreenCarvedStpk']}；角色載入標記 capture 為 {summary['characterTaggedMemoryCaptures']}。",
        "",
        "| 角色 | token | 模型／骨架／動作容器 | VFX／SFX 容器 | 音訊 | 轉換／註冊／部署 |",
        "|---|---:|---|---|---|---|",
    ]
    for row in data["priorityFour"]:
        modules = row["modules"]
        rows.append(
            f"| {row['nameZhTW']} | `{row['nativeId']}` | "
            f"{modules['model']['candidateContainerMemberCount']}／{modules['skeleton']['candidateContainerMemberCount']}／{modules['motion']['candidateContainerMemberCount']} | "
            f"{modules['vfx']['candidateContainerMemberCount']}／{modules['sfx']['candidateContainerMemberCount']} | "
            f"{modules['voice']['decodedListeningCandidateCount']} 段 WAV，待事件／說話者審查 | **0／0／0** |"
        )
    rows += [
        "",
        "原生資料已獲得、分流並雜湊；RPCS3 啟動與基準 capture 已完成。尚需在遊戲內逐一載入優先角色並取得帶角色 ID 的 capture，之後才可完成 `$CH0` 與 PS3 SRD／SRDI／SRDV 轉換。因此模型、動作、VFX 不可寫成已轉換；音訊不可寫成已綁定；後台選項與正式站部署均為 0。",
        "",
        "完整 52 名名單、58 組 token 容器、逐模組數量與階段閥：`materials/hero-model-library/source-inventories/jstars-batch-inventory-v1/`。",
        "",
        END,
    ]
    return "\n".join(rows)


def replace_section(text: str, section: str) -> str:
    if START in text and END in text:
        before = text.split(START, 1)[0].rstrip()
        after = text.split(END, 1)[1]
        return before + "\n\n" + section + after
    anchor = "<!-- generated:source-module-catalog-v1:start -->"
    if anchor in text:
        return text.replace(anchor, section + "\n\n" + anchor, 1)
    return text.rstrip() + "\n\n" + section + "\n"


def generated_files(repo: Path, data: dict[str, Any]) -> dict[Path, str]:
    output = repo / "materials/hero-model-library/source-inventories/jstars-batch-inventory-v1"
    report = repo / "materials/hero-model-library/近四日新增模型動作特效清單.md"
    return {
        output / "inventory.json": json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        output / "README.md": render_markdown(data),
        report: replace_section(report.read_text(encoding="utf-8"), report_section(data)),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = repo_root()
    data = build(repo)
    outputs = generated_files(repo, data)
    if args.check:
        stale = [str(path.relative_to(repo)) for path, text in outputs.items() if not path.is_file() or path.read_text(encoding="utf-8") != text]
        if stale:
            print("stale generated files:")
            print("\n".join(stale))
            return 1
        print(json.dumps(data["summary"], ensure_ascii=False, sort_keys=True))
        return 0
    for path, text in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    print(f"wrote {len(outputs)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
