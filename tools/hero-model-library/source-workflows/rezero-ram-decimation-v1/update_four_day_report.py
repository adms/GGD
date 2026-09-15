#!/usr/bin/env python3
"""Render the Re:Zero Ram rejection from its generated evidence."""
from __future__ import annotations
import argparse, json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/rezero-ram-material-preserving-decimation-v1/rejected-attempts.json"
START = "<!-- rezero-ram-decimation-v1:start -->"
END = "<!-- rezero-ram-decimation-v1:end -->"
ANCHOR = "- Zero Lancer P1／P2："

def expected(text: str) -> str:
    data = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    values = [item["visualEvidence"]["maxSilhouetteXorUnionPct"] for item in data["attempts"]]
    block = (f"{START}\n"
             f"- Re:Zero 拉姆減面嘗試：原 18,454 面靜態蒙皮來源保留；兩個 **7,982／7,990 面**候選均通過 Khronos、GGD budget、166-joint skinning 與 256px 貼圖檢查，但三視圖最大 silhouette XOR/union 為 **{max(values):.4f}%**，超過 5% 連續性門檻。因此兩者都標為「已轉換、未驗收、不可註冊」，沒有下拉選項或部署；來源、候選與完整讀回 S3 封裝均保留。\n"
             f"{END}")
    pattern = re.escape(START) + r".*?" + re.escape(END)
    return re.sub(pattern, block, text, flags=re.S) if re.search(pattern, text, flags=re.S) else text.replace(ANCHOR, block + "\n" + ANCHOR, 1)

def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--check", action="store_true"); args = parser.parse_args()
    actual = REPORT.read_text(encoding="utf-8"); out = expected(actual)
    if args.check:
        if actual != out: raise SystemExit("stale Ram four-day report")
    else: REPORT.write_text(out, encoding="utf-8")
    print(json.dumps({"report": str(REPORT.relative_to(ROOT)), "check": args.check}, ensure_ascii=False))
if __name__ == "__main__": main()
