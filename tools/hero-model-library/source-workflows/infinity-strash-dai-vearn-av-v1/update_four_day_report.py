#!/usr/bin/env python3
"""Generate the Dai/old-Vearn AV block in the 2026-09-11..14 report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
SUMMARY = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vearn-av-v1/summary.json"
START = "<!-- generated:infinity-strash-dai-vearn-av-v1:start -->"
END = "<!-- generated:infinity-strash-dai-vearn-av-v1:end -->"
BOUNDARY = "\n<!-- generated:eight-missing-models:start -->"


def render() -> str:
    data = json.loads(SUMMARY.read_text(encoding="utf-8"))
    dai_audio = data["audio"]["byIdentity"]["PN010"]
    vearn_audio = data["audio"]["byIdentity"]["EN801"]
    dai_vfx = data["vfx"]["byIdentity"]["PN010"]
    vearn_vfx = data["vfx"]["byIdentity"]["EN801"]
    return f"""{START}

### Infinity Strash 小呆／達伊與老年巴恩 AV 精確索引

已從本機固定解包樹與 Wwise 解碼母檔建立逐檔佇列，只收 PN010 與 EN801。音訊共有 {dai_audio['candidateCount'] + vearn_audio['candidateCount']} 項：PN010 {dai_audio['candidateCount']}（語音 {dai_audio['voice']}、音效 {dai_audio['soundEffect']}、未分類 {dai_audio['unclassified']}，{dai_audio['durationSeconds']:.3f} 秒），EN801 {vearn_audio['candidateCount']}（語音 {vearn_audio['voice']}、音效 {vearn_audio['soundEffect']}、未分類 {vearn_audio['unclassified']}，{vearn_audio['durationSeconds']:.3f} 秒）。每項保留 WAV、WEM、本機絕對路徑、SHA-256、原生 Wwise event path、來源語言標籤及說話者／事件信心；全部仍為 pending，聽審完成 0、runtime 綁定 0。

跨角色共用媒體已排除 PN010 {dai_audio['sharedOrMixedMediaExcluded']} 項、EN801 {vearn_audio['sharedOrMixedMediaExcluded']} 項；PN010 另有 {data['audio']['missingPayloadRelations']} 個引用 package 沒有 `.ubulk` payload。VFX 已逐檔驗證 PN010 {dai_vfx['rawPackageGroups']} 組／{dai_vfx['rawFiles']} 檔與 EN801 {vearn_vfx['rawPackageGroups']} 組／{vearn_vfx['rawFiles']} 檔，但這些仍是 Unreal／Niagara 原生套件，GGD VFX 轉換 0、視覺驗收 0、技能綁定 0。

EN653 密斯特巴恩與 EN680／EN681 巴蘭保持排除；young／變身後巴恩完整 payload 仍為 0。審查頁為 `apps/client/public/infinity-strash-dai-vearn-av-review.html`，媒體服務與可重現生成器在 `tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-av-v1/`。這批完成的是 acquisition／extraction／安全 WAV conversion／審查登記，不代表聲音事件核准、VFX 成品、Main 合併或正式站部署。

{END}"""


def expected(original: str) -> str:
    block = render()
    if START in original or END in original:
        if original.count(START) != 1 or original.count(END) != 1:
            raise ValueError("malformed Dai/Vearn AV generated markers")
        left, rest = original.split(START, 1)
        _, right = rest.split(END, 1)
        return left + block + right
    if original.count(BOUNDARY) != 1:
        raise ValueError("report insertion boundary missing or ambiguous")
    return original.replace(BOUNDARY, "\n\n" + block + BOUNDARY)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text(encoding="utf-8")
    target = expected(original)
    if args.write:
        REPORT.write_text(target, encoding="utf-8")
    elif target != original:
        raise SystemExit("four-day Dai/Vearn AV report block is stale; run --write")
    print(json.dumps({"report": REPORT.relative_to(ROOT).as_posix(), "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
