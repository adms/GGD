#!/usr/bin/env python3
"""Refresh immutable input fingerprints for the generated Palworld resource index."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
INDEX = ROOT / "materials/hero-model-library/palworld/帕魯三角色素材索引.json"

def expected() -> str:
    data = json.loads(INDEX.read_text(encoding="utf-8"))
    if data.get("schema") != "ggd-palworld-three-resource-index@1":
        raise ValueError("Unexpected Palworld resource index schema")
    for pin in data.get("inputs", []):
        path = ROOT / pin["gitPath"]
        if not path.is_file():
            raise FileNotFoundError(path)
        pin["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--check", action="store_true"); args = parser.parse_args()
    body = expected()
    if args.check:
        if INDEX.read_text(encoding="utf-8") != body: raise SystemExit("Palworld resource index input fingerprints are stale")
    else: INDEX.write_text(body, encoding="utf-8")
    print(json.dumps({"index": str(INDEX.relative_to(ROOT)), "check": args.check}, ensure_ascii=False))
if __name__ == "__main__": main()
