#!/usr/bin/env python3
"""Update the generated Dai/Vearn source-status paragraph in the four-day report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
REPORT = REPO / "materials/hero-model-library/近四日新增模型動作特效清單.md"
AUDIT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vearn-release-audit-v1/report.json"
START = "<!-- BEGIN GENERATED: infinity-strash-dai-vearn-release-audit-v1 -->"
END = "<!-- END GENERATED: infinity-strash-dai-vearn-release-audit-v1 -->"
ANCHOR = "巴恩與巴蘭仍分開識別。"


def render() -> str:
    data = json.loads(AUDIT.read_text(encoding="utf-8"))
    materials = data["sourceMaterials"]
    raw = materials["rawPackages"]
    audio = materials["audio"]["identities"]
    vfx = materials["vfx"]
    return "\n".join(
        [
            START,
            (
                f"達伊／老巴恩的原始來源稽核另逐檔重算 {raw['verifiedFilesThisRun']:,} 個選取 package、"
                f"{raw['verifiedBytesThisRun']:,} bytes 的 SHA-256。PN010 含 {vfx['PN010']['rawPackageFiles']} 個 VFX package、"
                f"EN801 含 {vfx['EN801']['rawPackageFiles']} 個；目前轉成 GGD VFX 與技能綁定皆為 0。"
                f"音訊方面，達伊已解碼 {audio['PN010']['decodedMedia']} 檔／{audio['PN010']['durationSeconds']:.3f} 秒，"
                f"老巴恩 {audio['EN801']['decodedMedia']} 檔／{audio['EN801']['durationSeconds']:.3f} 秒；"
                "WEM 母檔與 WAV 都已逐檔驗 SHA，但說話者、語言、技能事件聽審與 runtime 綁定仍為 0，不能寫成已上架。"
            ),
            END,
        ]
    )


def expected_text(original: str) -> str:
    block = render()
    if START in original:
        start = original.index(START)
        end = original.index(END, start) + len(END)
        return original[:start] + block + original[end:]
    anchor = original.index(ANCHOR)
    paragraph_end = original.index("\n\n", anchor)
    return original[:paragraph_end] + "\n\n" + block + original[paragraph_end:]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    original = REPORT.read_text(encoding="utf-8")
    expected = expected_text(original)
    if args.write:
        REPORT.write_text(expected, encoding="utf-8")
    elif original != expected:
        raise ValueError("four-day report Dai/Vearn paragraph is stale; run with --write")
    print(json.dumps({"report": str(REPORT.relative_to(REPO)), "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
