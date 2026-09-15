#!/usr/bin/env python3
"""Freeze batch-3 SSBU c00 model components without editing global indexes."""
from __future__ import annotations

import importlib.util
from pathlib import Path


BASE = Path(__file__).with_name("freeze_worldblender_c00_batch2.py")
SPEC = importlib.util.spec_from_file_location("ggd_worldblender_c00_freezer", BASE)
assert SPEC and SPEC.loader
WORKFLOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKFLOW)

WORKFLOW.CONFIG = {
    "daisy": {
        "nameZh": "黛西", "originalName": "Daisy", "nativeId": "fighter/daisy/model/body/c00",
        "sourceSha256": "4bfc6e261670eb4d6412cfc26ae2afd883d4334703b82ae58c2a0ddff00c1531",
        "outputSha256": "22114aa5f5b26c5ba7496d9183a703574850ef564413e932f15aca4a3cfb838a",
        "componentId": "ssbu-daisy-c00-static-skinned-v1",
        "backupDir": "ssbu-worldblender-c00-alpha-fixed-daisy-full-v3",
        "motion": {"nuanmbPaths": 13, "bodyMotionPaths": 13, "uniqueTransformPayloads": 13},
        "visualFinding": "Daisy identity, crown, hair and layered orange dress are visible in all three WebGL views.",
        "extraLimitations": ["The source exposed body_highShape and body_lowShape together; the reproducible candidate excludes body_highShape and retains the low LOD before reduction."],
    },
    "peach": {
        "nameZh": "碧姬公主", "originalName": "Peach", "nativeId": "fighter/peach/model/body/c00",
        "sourceSha256": "72242384174b926d7f9eb73f702e2b02d1e32b0e8dda38703311afc6b1fa2679",
        "outputSha256": "b3d4efeef604ea0ea207c63eff3dda3e81093e5f98bc4a1d3c9cb9767eac55bf",
        "componentId": "ssbu-peach-c00-static-skinned-v1",
        "backupDir": "ssbu-worldblender-c00-alpha-fixed-peach-full-v3",
        "motion": {"nuanmbPaths": 1, "bodyMotionPaths": 1, "uniqueTransformPayloads": 1},
        "visualFinding": "Peach identity, crown, hair and layered pink dress are visible in all three WebGL views.",
    },
    "toonlink": {
        "nameZh": "卡通林克", "originalName": "Toon Link", "nativeId": "fighter/toonlink/model/body/c00",
        "sourceSha256": "c20a96b41fb5dfcf2e2c6a2d017b3248775efa6dc97d5a68ab92b9b01a4aafb6",
        "outputSha256": "fede3d9ff3b28c942f55e5eed7420d7323e745d02091729c8a7c1840a79d3540",
        "componentId": "ssbu-toonlink-c00-static-skinned-v1",
        "backupDir": "ssbu-worldblender-c00-alpha-fixed-toonlink-full-v3",
        "motion": {"nuanmbPaths": 3, "bodyMotionPaths": 3, "uniqueTransformPayloads": 3},
        "visualFinding": "Toon Link identity, hat, costume, sword and shield are visible in all three WebGL views; the eye shader limitation remains visible.",
        "extraLimitations": [
            "The source-connected eye material renders very dark and lacks original-game eye highlights; this was already present in the direct Blender export and needs shader/material polish before default use.",
            "The static neutral candidate excludes the two expression-specific LMabuta/RMabuta eyelid meshes to meet the six-draw limit; the complete source remains preserved.",
        ],
    },
}
WORKFLOW.EVIDENCE_ROOT = Path("materials/hero-model-library/priority-evidence/ssbu-worldblender-c00-batch3-v1")
WORKFLOW.CONVERSION_DIR = "ssbu-worldblender-c00-alpha-fixed-batch3-v3"


if __name__ == "__main__":
    WORKFLOW.main()
