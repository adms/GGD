#!/usr/bin/env python3
"""Synchronize the Mai preflight fields from the immutable delivery record into the central source index."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", type=Path, required=True)
    parser.add_argument("--downloads", type=Path, required=True)
    args = parser.parse_args()
    entry = json.loads(args.entry.read_text())
    data = json.loads(args.downloads.read_text())
    source = next(item for item in data["publicSources"] if item["id"] == entry["id"])
    for key in ("modelCandidates", "verification", "readiness", "backendIntegration"):
        source[key] = entry[key]
    args.downloads.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
