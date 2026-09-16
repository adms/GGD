#!/usr/bin/env python3
"""Query the generated KOF XIV/JUMP FORCE container coverage inventory."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("term", help="native ID or source-group name")
    parser.add_argument("--game", choices=("jump-force", "kof-xiv", "all"), default="all")
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    args = parser.parse_args()
    path = args.repo.resolve() / "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1/inventory.json"
    inventory = json.loads(path.read_text(encoding="utf-8"))
    needle = args.term.casefold()
    results = []
    if args.game in ("jump-force", "all"):
        for row in inventory["jumpForce"]["characterPathTokens"]:
            haystack = " ".join(str(row.get(key) or "") for key in ("nativeCharacterIdToken", "characterName", "existingAudioGroupId")).casefold()
            if needle in haystack:
                results.append({"sourceGame": "JUMP FORCE", **row})
    if args.game in ("kof-xiv", "all"):
        for row in inventory["kofXiv"]["characters"]:
            haystack = " ".join(str(row.get(key) or "") for key in ("nativeCharacterIdToken", "characterNameZh", "originalName")).casefold()
            if needle in haystack:
                results.append({"sourceGame": "THE KING OF FIGHTERS XIV", **row})
    print(json.dumps({"query": args.term, "count": len(results), "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
