#!/usr/bin/env python3
"""Render the owner-reported remaining gaps beside current generated evidence."""
import json
import gzip
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
STATUS = Path(__file__).with_name("status.json")
LOL = ROOT / "materials/hero-model-library/lol-project-seven/runtime-audit.json"
FATE = ROOT / "materials/hero-model-library/priority-evidence/fateubw-community/runtime-components-v1/registration-receipt.json"
FATE_MANIFEST = ROOT / "materials/hero-model-library/priority-evidence/fateubw-community/runtime-components-v1/manifest.json"
START = "<!-- generated:remaining-integration-gaps-v1:start -->"
END = "<!-- generated:remaining-integration-gaps-v1:end -->"
BOUNDARY = "\n## 九、主要證據入口"


def load(path):
    return json.loads(path.read_text())


def block():
    control = load(STATUS)
    status = control["ownerReported"]
    popp = load(ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-runtime-v1/receipt.json")["summary"]
    lol = load(LOL)["summary"]
    fate = load(FATE)
    fate_manifest = load(FATE_MANIFEST)
    mapped = [row for row in fate_manifest["components"] if row.get("heroIds")]
    unmapped = [row for row in fate_manifest["components"] if not row.get("heroIds")]
    kenshiro = load(ROOT / "tools/hero-model-library/source-workflows/kenshiro-ou99-decimation-v1/evidence/receipt.json")
    kenshiro_backup = load(ROOT / "tools/hero-model-library/source-workflows/kenshiro-ou99-decimation-v1/evidence/stage-backup.json")
    voice_groups = status["originalVoiceDirectFilenameGapGroups"]
    jump_map = load(ROOT / "tools/hero-model-library/source-workflows/jumpforce-steam-streaming-audio-v1/character-map.json")
    unresolved = {"chr" + native_id for native_id in jump_map["unresolvedNativeIds"]}
    jump_count, jump_seconds = 0, 0.0
    with gzip.open(ROOT / "materials/hero-model-library/voice-files.jsonl.gz", "rt") as stream:
        for line in stream:
            row = json.loads(line)
            group_id = row["groupId"]
            if group_id.startswith("steam-jump-force-streaming-audio-") and group_id.split(":")[-1] in unresolved:
                jump_count += 1
                jump_seconds += row.get("seconds") or 0

    missing_skill_slots = {
        row["heroId"].removeprefix("lol-"): [slot.removeprefix("ability-") for slot in row["missingApprovedSkillTargets"]]
        for row in load(LOL)["perHero"]
        if row["missingApprovedSkillTargets"]
    }
    missing_skill_text = "、".join(
        f"{hero} 缺 {','.join(slots)}" for hero, slots in missing_skill_slots.items()
    ) or "無"
    return "\n".join([
        START,
        "## 八、仍待整合與語音身份缺口",
        "",
        f"- **何布／波普**：{popp['candidateRelationshipsBound']} 組原作貼圖／GGD 重建特效已綁定 {popp['abilityBindingsCreated']} 支技能；其餘 {popp['ownerApprovedVfxReleasedUnbound']} 顆保留為未綁定選項。原生 Niagara 時序與一比一還原未完成，正式部署未驗證。",
        f"- **分支減面預選**：{'、'.join(status['branchOnlyDecimatedDefaultCharacters'])}的新版本在此分支；尚未證明 Main 或正式站已使用。",
        f"- **LoL 七位**：已核准並驗證 {lol['runtimeMp3sVerified']} 段 runtime MP3，但原生事件覆蓋仍是 partial-by-skin，另有 {lol['pendingOtherEventBoundWavs']} 段已綁事件 WAV 未進本批；目前可由稽核資料確認的喊招缺格為：{missing_skill_text}。七位 EX 皆缺原生候選；Xerath Q 的 4 段歧義音訊由 `lol-project-seven/gap-listening-review.html` 逐項聽審，不補猜測配對。",
        f"- **FateUBW**：{len(fate_manifest['components'])}/14 顆 Git GLB 已轉換，{len(mapped)} 顆成品對應 {fate.get('registeredCharacters', 4)} 名已有英雄，共 {fate.get('registeredHeroOptions', 5)} 個非預設後台候選；{len(unmapped)} 名尚無 GGD 英雄定義，不能寫成全部進遊戲。",
        f"- **拳四郎**：OU99 社群本尊 {kenshiro['source']['triangles']:,} → {kenshiro['candidate']['triangles']:,} 面，{kenshiro['preservation']['nativeAnimations']} 段來源動作與六態映射保留；`godie-umal` 非預設選項已註冊，已進中央模型索引。JUMP 擷取版仍未完成，正式部署未驗證。",
        f"- **拳四郎備份**：原始／中間檔及 geometry 依賴 {kenshiro_backup['fileCount']} 檔、{kenshiro_backup['archiveBytes']:,} bytes；完整 S3 讀回與逐檔 SHA-256 通過。收據 `tools/hero-model-library/source-workflows/kenshiro-ou99-decimation-v1/evidence/stage-backup.json`；位置 `{kenshiro_backup['s3Uri']}`。Git 成品與程式依下方 commit 快照另外備份。",
        f"- **尚未轉進遊戲**：{'、'.join(status['notIntegratedIntoGame'])}仍為素材／轉換候選，runtime 註冊與正式部署為 0。",
        f"- **原作語音直接對應缺口**：11 位負責英雄（例：{'、'.join(voice_groups[0]['examples'])}）與 23 位原作角色（例：{'、'.join(voice_groups[1]['examples'])}）完整名單尚未提供；依 owner「{control['ownerScopeDecision']['quote']}」暫停本批第 5、6 項，保留現有缺口。",
        "- **成本限制**：KOF XIV 專有模型容器需另開發 reader，列為高成本受阻；KOF XV 已有靜態元件，但缺英雄映射與原生動作。",
        f"- **JUMP FORCE 劇情語音**：{len(unresolved)} 個尚未辨識的原生 ID 共 {jump_count} 檔，已知總長 {jump_seconds / 60:.1f} 分鐘；這只是最低播放時間，不含身份查證。沒有可靠證據指向夜神月，狀態為待說話者證據；不進直接對應、語音綁定或上架數。",
        "",
        END,
    ])


def main():
    current = REPORT.read_text()
    generated = block()
    if START in current or END in current:
        if current.count(START) != 1 or current.count(END) != 1:
            raise ValueError("remaining-gap report markers are malformed")
        left, rest = current.split(START, 1)
        _, right = rest.split(END, 1)
        expected = left + generated + right
    else:
        if BOUNDARY not in current:
            raise ValueError("report insertion boundary is missing")
        expected = current.replace(BOUNDARY, "\n" + generated + BOUNDARY, 1)
    popp = load(ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-runtime-v1/receipt.json")["summary"]
    replacements = {
        "| 波普 VFX |": f"| 波普 VFX | {popp['ownerApprovedVfxReleased']} 份已核准 GGD 重建特效；{popp['candidateRelationshipsBound']} 組綁入 {popp['abilityBindingsCreated']} 支技能，原作貼圖與 33 顆支援 GLB 保留 | 原生 Niagara 時序與完整原作重播仍未恢復；正式部署未驗證 |",
        "| 完整特效成品 |": f"| 完整特效成品 | {popp['ownerApprovedVfxReleased']} 份核准的原作貼圖／GGD 重建 VFX 文件，其中 {popp['candidateRelationshipsBound']} 組已綁技能 | 原生效果容器完整還原為 0；其餘 {popp['ownerApprovedVfxReleasedUnbound']} 份未綁定 |",
    }
    expected = "\n".join(next((value for prefix, value in replacements.items() if line.startswith(prefix)), line) for line in expected.splitlines()) + "\n"
    if "--check" in __import__("sys").argv:
        if current != expected:
            raise SystemExit("remaining integration gap report block is stale")
        print("remaining integration gap report block is current")
        return
    REPORT.write_text(expected)
    print("updated", REPORT.relative_to(ROOT))


if __name__ == "__main__":
    main()
