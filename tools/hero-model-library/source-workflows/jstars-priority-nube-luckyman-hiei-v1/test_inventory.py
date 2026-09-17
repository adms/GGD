#!/usr/bin/env python3
"""Narrow contract test for the generated J-Stars priority-three inventory."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
INVENTORY = ROOT / "materials/hero-model-library/source-inventories/jstars-priority-nube-luckyman-hiei-v1/inventory.json"


def main() -> int:
    payload = json.loads(INVENTORY.read_text(encoding="utf-8"))
    assert payload["schema"] == "ggd.jstars-priority-nube-luckyman-hiei-inventory@1"
    assert payload["scope"] == ["nube", "luckyman", "hiei"]
    assert len(payload["characters"]) == 3
    assert payload["summary"]["runtimeRegistrations"] == 0
    assert payload["summary"]["deployments"] == 0
    expected_ids = {"nube": "041", "luckyman": "037", "hiei": "012"}
    assert payload["summary"]["jstarsNativeIdsProven"] == 3
    for row in payload["characters"]:
        assert row["nativeId"] == expected_ids[row["slug"]]
        assert row["runtimeReady"] is False
        assert row["backendOptionRegistered"] is False
        assert row["defaultApplied"] is False
        assert row["deployed"] is False
        assert set(row["modules"]) == {"model", "skeleton", "motion", "vfx", "sfx", "voice"}
        assert row["modules"]["model"]["acquisition"] == "owner-disc-member-hashed"
    hiei = next(row for row in payload["characters"] if row["slug"] == "hiei")
    reserve = hiei["alternateSources"][0]
    assert reserve["sourceGame"] == "JUMP FORCE"
    assert reserve["relationship"] == "alternate-source-reserve-not-jstars"
    assert reserve["archive"]["sha256"] == "49acb22c8278fafa68e0d44af58bd21ae83c854d8248c3eeacebeb61e8836cbb"
    assert reserve["audioFileCount"] == 239
    assert reserve["sourceCategoryCounts"] == {"sfx": 19, "voice": 220}
    assert reserve["runtimeBound"] is False
    print("PASS: J-Stars priority Nube/Luckyman/Hiei inventory contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
