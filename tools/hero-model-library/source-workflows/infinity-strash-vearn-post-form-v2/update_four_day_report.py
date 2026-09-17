#!/usr/bin/env python3
"""Generate the Vearn post-transformation source-gap block."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-vearn-post-form-v2/report.json"
S3_RECEIPT = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-vearn-post-form-v2/s3-backup-receipt.json"
START = "<!-- generated:infinity-strash-vearn-post-form-v2:start -->"
END = "<!-- generated:infinity-strash-vearn-post-form-v2:end -->"
BOUNDARY = "<!-- generated:infinity-strash-dai-vearn-av-v1:end -->"


def render() -> str:
    data = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    s3 = json.loads(S3_RECEIPT.read_text(encoding="utf-8"))
    en801 = data["identities"]["EN801"]
    en653 = data["identities"]["EN653"]
    return f"""{START}

### Infinity Strash 巴恩變身後來源鑑別

本輪重新驗證兩個主 PAK 的大小與 SHA-256，徹查 {data['scope']['uniqueIndexedEntries']:,} 條完整索引，並重算 EN801 {en801['alreadyExtractedFilesRehashed']:,} 檔／{en801['alreadyExtractedBytesRehashed']:,} bytes、EN653 {en653['alreadyExtractedFilesRehashed']:,} 檔／{en653['alreadyExtractedBytesRehashed']:,} bytes 的既有解包素材。另從原始 PAK 抽出 EN801、EN653、EN680、EN681 的身體與角色藍圖探針，各 4 檔，共 {data['criticalProbeSummary']['files']} 檔／{data['criticalProbeSummary']['bytes']:,} bytes，全部保留逐檔 SHA-256。

完整怪物身體索引共有 {data['scope']['monsterBodyAssets']} 個，但 EN8xx 身體只有 `EN801/00/SK_EN801_00_Body`；明確 young／true／final／post／transform Vearn 命名命中 {len(data['scope']['postTransformationNameHits'])}。EN801 維持老年／變身前巴恩；EN653 是密斯特巴恩；EN680 是巴蘭；EN681 是龍魔人巴蘭／巴蘭形態。這三者與 Kaizer Phoenix 輔助骨架都不能冒充巴恩年輕真身。

因此巴恩變身後狀態仍是「尚未找到」：新模型、貼圖、骨架、動作、特效、音效、語音轉換皆為 0；後台選項與正式部署也為 0。下一步須取得明確標示身份且授權可用的獨立來源。

本輪 18 個稽核／探針檔已封裝為 {s3['archiveBytes']:,} bytes，完整 S3 GET、manifest 與逐成員 SHA-256 驗證通過：`{s3['s3Uri']}`。這個備份是身份與缺口證據，不是變身後模型素材。

{END}"""


def expected(original: str) -> str:
    block = render()
    if START in original or END in original:
        if original.count(START) != 1 or original.count(END) != 1:
            raise ValueError("malformed Vearn post-form generated block")
        left, rest = original.split(START, 1)
        _, right = rest.split(END, 1)
        return left + block + right
    if original.count(BOUNDARY) != 1:
        raise ValueError("Dai/Vearn AV insertion boundary is missing or ambiguous")
    return original.replace(BOUNDARY, BOUNDARY + "\n\n" + block)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text(encoding="utf-8")
    target = expected(original)
    if args.write:
        REPORT.write_text(target, encoding="utf-8")
    elif target != original:
        raise SystemExit("four-day Vearn post-form block is stale; run --write")
    print(json.dumps({"report": REPORT.relative_to(ROOT).as_posix(), "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
