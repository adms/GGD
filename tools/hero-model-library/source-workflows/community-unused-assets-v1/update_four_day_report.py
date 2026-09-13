"""Insert the generated community and PlayStation reserve status into the four-day report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
COMMUNITY = ROOT / "materials/hero-model-library/source-inventories/community-unused-assets-v1/inventory.json"
PLAYSTATION = ROOT / "materials/hero-model-library/source-inventories/playstation-platform-sources-v1/inventory.json"
START = "<!-- generated:community-playstation-reserves:start -->"
END = "<!-- generated:community-playstation-reserves:end -->"
INSERT_BEFORE = "\n## 八、限制與自動化工具"


def render() -> str:
    community = json.loads(COMMUNITY.read_text())
    playstation = json.loads(PLAYSTATION.read_text())
    c = community["summary"]
    p = playstation["acquiredSources"]
    v = playstation["verification"]
    cloud = p["pspCloudConvertedCandidate"]
    native = p["pspNativeGmoAuthorSnapshot"]
    audio = p["ps4CloudEnglishAudio"]
    stages = c["sourcePipelineCounts"]
    kinds = c["sourcesByAssetKind"]
    local = c["localVerification"]
    return (
        f"{START}\n\n"
        "社群、MOD、工作坊、魔獸自訂地圖、資源論壇與作者公開分享已另建可重建索引："
        f"{c['sourceRecords']} 個已取得來源，包含模型 {kinds['model']}、動作 {kinds['motion']}、"
        f"特效 {kinds['vfx']}、道具 {kinds['prop']}（種類可重疊）；{stages['extracted']} 個已解包、"
        f"{stages['converted']} 個有轉換候選、{stages['validated']} 個有部分驗收證據、"
        f"{stages['runtimeSelectable']} 個已證明本機可切換、{stages['productionDeployed']} 個已證明正式站部署。"
        f"本機權威清單 {local['verifiedFiles']:,}/{local['expectedFiles']:,} 檔 SHA-256 正確，"
        f"{local['componentFilesVerified']}/{local['componentFilesExpected']} 個轉換元件正確；"
        f"另有 {local['missingFiles']} 個歷史封存成員與 {local['mismatchedFiles']} 個封存後更新分析檔保留為明確例外。"
        "目前沒有來源明確符合無人審查自動轉換，所以沒有擅自擴大綁定。\n\n"
        "PlayStation 平台索引另行保留 PS1／PS2／PS3／PSP／PS Vita 版本邊界："
        f"Windows 盤點 {v['windowsMetadataRowsInScope']} 筆仍是 metadata-only，本輪讀取 payload 0。"
        f"已獲得作者 PSP GMO 快照 {native['nativeGmoHeadersVerified']} 個 GMO／{native['nativeMotionBlocks']} 個 Motion block；"
        f"Cloud 候選已轉為 {cloud['nativeMotionClips']} 段原生 ID 動作的 GLB，"
        f"{cloud['currentPolicyAudit']['metrics']['triangles']:,} 面、{cloud['currentPolicyAudit']['metrics']['maxTextureEdge']}px，"
        "但身份、語意、尺度、4 條非 TRS channel 與後台綁定尚待驗收；"
        f"PS4 Cloud 英語音訊保留 {audio['decodedWavFiles']} 個 WAV，仍待逐項聽審。"
        "上述三個已獲得來源的本機成員與 S3 封存均已逐檔讀回核對，不等於英雄可切換或已部署。\n\n"
        f"{END}"
    )


def expected(original: str) -> str:
    block = render()
    if START in original or END in original:
        if original.count(START) != 1 or original.count(END) != 1:
            raise ValueError("generated reserve markers are malformed")
        left, rest = original.split(START, 1)
        _, right = rest.split(END, 1)
        return left + block + right
    if original.count(INSERT_BEFORE) != 1:
        raise ValueError("four-day report insertion boundary is missing or ambiguous")
    return original.replace(INSERT_BEFORE, "\n\n" + block + INSERT_BEFORE)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text()
    target = expected(original)
    if args.write:
        REPORT.write_text(target)
    elif original != target:
        raise ValueError("four-day community/PlayStation reserve section is stale; run with --write")
    print(json.dumps({"report": str(REPORT.relative_to(ROOT)), "communitySources": json.loads(COMMUNITY.read_text())["summary"]["sourceRecords"], "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
