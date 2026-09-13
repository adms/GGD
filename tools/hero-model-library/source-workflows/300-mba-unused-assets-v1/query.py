#!/usr/bin/env python3
"""Query the committed 300 Heroes/MBA reserve without local source trees."""
import argparse
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DEFAULT = ROOT / "materials/hero-model-library/priority-evidence/300-mba-unused-assets-v1/files.jsonl.gz"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("term", nargs="?", default="")
    parser.add_argument("--library", choices=("300heroes", "mba"))
    parser.add_argument("--kind", choices=("model", "animation", "vfx"))
    parser.add_argument("--unused-only", action="store_true")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--clips", action="store_true", help="Query logical animation clips instead of physical files")
    args = parser.parse_args()
    path = DEFAULT.with_name("animation-clips.jsonl.gz") if args.clips else DEFAULT
    needle = args.term.casefold()
    found = 0
    with gzip.open(path, "rt") as stream:
        for line in stream:
            row = json.loads(line)
            if args.library and row["library"] != args.library:
                continue
            if args.kind and args.kind not in row.get("assetKinds", ["animation"] if args.clips else []):
                continue
            if args.unused_only and not row["usageStatus"].startswith("unused-"):
                continue
            if needle and needle not in json.dumps(row, ensure_ascii=False).casefold():
                continue
            print(json.dumps(row, ensure_ascii=False))
            found += 1
            if found >= args.limit:
                break


if __name__ == "__main__":
    main()
