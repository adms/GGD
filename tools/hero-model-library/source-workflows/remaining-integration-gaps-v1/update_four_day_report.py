#!/usr/bin/env python3
"""Render the owner-reported remaining gaps beside current generated evidence."""
import json
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
    status = load(STATUS)["ownerReported"]
    lol = load(LOL)["summary"]
    fate = load(FATE)
    fate_manifest = load(FATE_MANIFEST)
    mapped = [row for row in fate_manifest["components"] if row.get("heroIds")]
    unmapped = [row for row in fate_manifest["components"] if not row.get("heroIds")]
    voice_groups = status["originalVoiceDirectFilenameGapGroups"]
    return "\n".join([
        START,
        "## 八、仍待整合與語音身份缺口",
        "",
        f"- **何布／波普**：{status['branchOnlyPoppOriginalVfxRelationships']} 筆原作事件名稱對應仍只是本分支提案；12 顆已核准 GGD VFX 文件保留為未綁定候選。Main 合併、技能時序綁定與正式部署皆為 0。",
        f"- **分支減面預選**：{'、'.join(status['branchOnlyDecimatedDefaultCharacters'])}的新版本在此分支；尚未證明 Main 或正式站已使用。",
        f"- **LoL 七位**：已核准並驗證 {lol['runtimeMp3sVerified']} 段 runtime MP3，但原生事件覆蓋仍是 partial-by-skin，另有 {lol['pendingOtherEventBoundWavs']} 段已綁事件 WAV 未進本批；喊招槽不宣稱齊全。",
        f"- **FateUBW**：{len(fate_manifest['components'])}/14 顆 Git GLB 已轉換，{len(mapped)} 顆成品對應 {fate.get('registeredCharacters', 4)} 名已有英雄，共 {fate.get('registeredHeroOptions', 5)} 個非預設後台候選；{len(unmapped)} 名尚無 GGD 英雄定義，不能寫成全部進遊戲。",
        f"- **尚未轉進遊戲**：{'、'.join(status['notIntegratedIntoGame'])}仍為素材／轉換候選，runtime 註冊與正式部署為 0。",
        f"- **原作語音直接對應缺口**：11 位負責英雄（例：{'、'.join(voice_groups[0]['examples'])}）與 23 位原作角色（例：{'、'.join(voice_groups[1]['examples'])}）在現有素材庫沒有能靠檔名直接確認本人的原作語音。",
        "- **JUMP FORCE 劇情語音**：數字檔名群可能含夜神月，但說話者未核實；狀態為「待說話者聽審」，不進直接對應、語音綁定或上架數。",
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
    if "--check" in __import__("sys").argv:
        if current != expected:
            raise SystemExit("remaining integration gap report block is stale")
        print("remaining integration gap report block is current")
        return
    REPORT.write_text(expected)
    print("updated", REPORT.relative_to(ROOT))


if __name__ == "__main__":
    main()
