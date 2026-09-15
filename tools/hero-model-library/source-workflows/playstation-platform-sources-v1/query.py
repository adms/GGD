#!/usr/bin/env python3
"""Query the generated PlayStation platform source inventory."""

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
INDEX = ROOT / "materials/hero-model-library/source-inventories/playstation-platform-sources-v1/inventory.json"


def records(data: dict):
    for platform, rows in data["windowsInventoryRows"].items():
        for row in rows:
            yield {"recordType": "windows-metadata", **row}
    for key, row in data["acquiredSources"].items():
        yield {"recordType": "acquired-source", "recordKey": key, **row}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", nargs="?", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    data = json.loads(INDEX.read_text(encoding="utf-8"))
    needle = args.query.casefold()
    found = [row for row in records(data) if needle in json.dumps(row, ensure_ascii=False).casefold()]
    if args.json:
        print(json.dumps({"schema": data["schema"], "query": args.query, "count": len(found), "records": found}, ensure_ascii=False, indent=2))
    else:
        for row in found:
            status = row.get("acquisitionStatus", row.get("readiness", ""))
            label = row.get("gameLabel", row.get("sourceGame", row.get("recordKey", "")))
            print(f"{row['recordType']}\t{row.get('platform', '')}\t{row.get('sourceId', '')}\t{label}\t{status}")
        print(f"matches: {len(found)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
