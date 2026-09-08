"""Offline CPU-only tokenizer audit; safe alongside a Metal training worker."""
import argparse
import hashlib
import json
import os
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True)
    p.add_argument("--requests", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--max-seq", type=int, default=4096)
    p.add_argument("--output-reserve", type=int, default=256)
    args = p.parse_args()
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.model, local_files_only=True, trust_remote_code=False)
    source = Path(args.requests).read_bytes()
    rows = []
    for r in json.loads(source):
        tokens = tokenizer.apply_chat_template(r["messages"], tokenize=True,
                                               add_generation_prompt=True,
                                               enable_thinking=False, return_dict=False)
        rows.append({"id": r["id"], "tokens": len(tokens),
                     "fits": len(tokens) + args.output_reserve <= args.max_seq})
    report = {"model": str(Path(args.model).resolve()), "requestsSha256": hashlib.sha256(source).hexdigest(),
              "cpuOnly": True, "thinking": False, "count": len(rows),
              "min": min(r["tokens"] for r in rows), "max": max(r["tokens"] for r in rows),
              "maxSequence": args.max_seq, "outputReserve": args.output_reserve,
              "allFit": all(r["fits"] for r in rows), "rows": rows}
    with Path(args.output).open("x") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(json.dumps({k: v for k, v in report.items() if k != "rows"}, ensure_ascii=False))
    if not report["allFit"]:
        raise SystemExit(2)

if __name__ == "__main__":
    main()
