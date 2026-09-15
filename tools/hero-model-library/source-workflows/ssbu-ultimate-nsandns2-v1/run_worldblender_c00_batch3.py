#!/usr/bin/env python3
"""Rebuild the Daisy, Peach, and Toon Link Worldblender c00 batch twice."""
from __future__ import annotations

import importlib.util
from pathlib import Path


BASE = Path(__file__).with_name("run_worldblender_c00_batch2.py")
SPEC = importlib.util.spec_from_file_location("ggd_worldblender_c00_base", BASE)
assert SPEC and SPEC.loader
WORKFLOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKFLOW)

WORKFLOW.CHARACTERS = {
    "daisy": {
        "nameZh": "黛西", "originalName": "Daisy",
        "sourceSha256": "4bfc6e261670eb4d6412cfc26ae2afd883d4334703b82ae58c2a0ddff00c1531",
        "candidateId": "ssbu-daisy-c00-static-skinned-v1",
        "excludePrefixes": ["body_highShape"], "harmonize": True, "atlas": True,
        "ultimate14": {"nuanmbPaths": 13, "bodyMotionPaths": 13, "uniqueTransformPayloads": 13},
    },
    "peach": {
        "nameZh": "碧姬公主", "originalName": "Peach",
        "sourceSha256": "72242384174b926d7f9eb73f702e2b02d1e32b0e8dda38703311afc6b1fa2679",
        "candidateId": "ssbu-peach-c00-static-skinned-v1",
        "excludePrefixes": [], "harmonize": False, "atlas": True,
        "nearDuplicateOpaqueMaterialPairs": [["EyeL", "EyeR"]],
        "ultimate14": {"nuanmbPaths": 1, "bodyMotionPaths": 1, "uniqueTransformPayloads": 1},
    },
    "toonlink": {
        "nameZh": "卡通林克", "originalName": "Toon Link",
        "sourceSha256": "c20a96b41fb5dfcf2e2c6a2d017b3248775efa6dc97d5a68ab92b9b01a4aafb6",
        "candidateId": "ssbu-toonlink-c00-static-skinned-v1",
        "excludePrefixes": ["toonlink_LMabuta_VIS_O_OBJShape", "toonlink_RMabuta_VIS_O_OBJShape"],
        "harmonize": True, "atlas": False,
        "nearDuplicateOpaqueMaterialPairs": [["EyeL", "EyeR"]],
        "ultimate14": {"nuanmbPaths": 3, "bodyMotionPaths": 3, "uniqueTransformPayloads": 3},
    },
}


if __name__ == "__main__":
    WORKFLOW.main()
