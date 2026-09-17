#!/usr/bin/env python3
"""Query the committed Ultimate14 NUANMB inventory without native dependencies."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
DEFAULT_INDEX = ROOT / "materials/hero-model-library/source-inventories/ultimate14-native-motions.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", nargs="?", default="")
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument(
        "--class",
        dest="directory_class",
        choices=["body-motion", "accessory-motion", "model-animation-metadata"],
    )
    parser.add_argument("--unique", action="store_true", help="Return one row per SHA-256 payload.")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    data = json.loads(args.index.read_text())
    payloads = {row["sha256"]: row for row in data["payloads"]}
    needle = args.query.casefold()
    rows = []
    seen = set()
    for alias in data["aliases"]:
        if args.directory_class and alias["directoryClass"] != args.directory_class:
            continue
        if needle and needle not in " ".join(
            str(alias.get(key) or "")
            for key in ["fighterId", "directoryClass", "target", "costume", "clipName", "relativePath", "sha256"]
        ).casefold():
            continue
        if args.unique and alias["sha256"] in seen:
            continue
        seen.add(alias["sha256"])
        payload = payloads[alias["sha256"]]
        rows.append({
            **alias,
            "majorVersion": payload.get("majorVersion"),
            "minorVersion": payload.get("minorVersion"),
            "finalFrameIndex": payload.get("finalFrameIndex"),
            "transformNodeCount": len(payload.get("transformNodeNames", [])),
            "readiness": payload["readiness"],
            "converted": payload["converted"],
            "runtimeSelectable": payload["runtimeSelectable"],
        })
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return
    print(f"matches={len(rows)} source={data['source']['id']} auditedAt={data['auditedAt']}")
    for row in rows:
        print(
            f"{row['fighterId']}\t{row['directoryClass']}\t{row['clipName']}\t"
            f"frames=0..{row['finalFrameIndex']}\tnodes={row['transformNodeCount']}\t"
            f"sha256={row['sha256']}\t{row['relativePath']}"
        )


if __name__ == "__main__":
    main()
