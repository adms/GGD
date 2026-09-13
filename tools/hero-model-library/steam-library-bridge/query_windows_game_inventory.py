#!/usr/bin/env python3
"""Query the normalized Windows game source inventory."""

import argparse
import json
from pathlib import Path

from build_windows_game_inventory import load_json_index


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query")
    parser.add_argument("--index", type=Path, default=Path("materials/hero-model-library/source-inventories/windows-game-library.json.gz"))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    data = load_json_index(args.index)
    needle = args.query.casefold()
    rows = (
        data["steamGames"]
        + data.get("orphanSteamManifests", [])
        + data["romCandidates"]
        + data.get("directoryCollections", [])
    )
    matches = [row for row in rows if needle in json.dumps(row, ensure_ascii=False).casefold()]
    if args.json:
        print(json.dumps(matches, ensure_ascii=False, indent=2))
        return
    for row in matches:
        container_status = row.get("containerInventoryStatus", "not-scanned-inside-install")
        print(
            f"{row['id']}\t{row['title']}\t{row.get('platform', row.get('collectionKind', ''))}\t"
            f"{row['inventoryStatus']}\t{container_status}\t{row['sourcePath']}"
        )
    print(f"matches={len(matches)}")


if __name__ == "__main__":
    main()
