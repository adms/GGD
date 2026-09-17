#!/usr/bin/env python3
"""Guard the Popp source-status overlay against an accidental runtime upgrade."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("popp_audio_integrate", HERE / "integrate.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class PoppEvidenceTests(unittest.TestCase):
    def write(self, directory: Path, name: str, payload: dict) -> Path:
        path = directory / name
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_approved_audio_keeps_runtime_unbound(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write(Path(tmp), "audio.json", {
                "schema": "ggd.infinity-strash-popp-approved-audio-receipt@1",
                "sourceId": MODULE.SOURCE_ID,
                "summary": {
                    "reviewCandidates": 36, "ownerApproved": 36, "gameAudioFiles": 35,
                    "gameAudioCandidateRelationships": 36, "nativeEventRows": 8,
                    "runtimeBindings": 0, "runtimeConsumers": 0, "candidateBlockers": 36,
                    "productionDeployed": 0,
                },
                "allSourceBytesVerified": True, "allOutputsProbed": True,
                "runtimeMutationPerformed": False, "productionDeploymentVerified": False,
            })
            with patch.object(MODULE, "REPO", Path(tmp)):
                result = MODULE.approved_audio_evidence(path)
            self.assertEqual(result["gameAudioFiles"], 35)
            self.assertFalse(result["runtimeBindingAuthorized"])
            self.assertEqual(result["runtimeBindings"], 0)

    def test_vfx_evidence_rejects_native_parity_claim(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write(Path(tmp), "vfx.json", {
                "schema": "ggd.popp-vfx-runtime-release@1",
                "heroId": "b2-popp", "nativeCharacterId": "PN020",
                "summary": {
                    "ownerApprovedVfxReleased": 12, "ownerApprovedVfxReleasedUnbound": 12,
                    "abilityBindingsCreated": 0, "abilityBindingsPreserved": 3,
                    "candidateRelationshipsProposed": 7, "candidateRelationshipsBound": 0,
                    "reserveCandidatesReleasedUnbound": 5,
                    "sourceTexturesRetained": 9, "staticMeshSupportGlbsRetained": 33,
                },
                "states": {
                    "featureBranchSkillBindingsCreated": False,
                    "candidateOnly": True,
                    "existingAbilityBindingsPreserved": True,
                    "nativeNiagaraTimingRecovered": True,
                    "rootSpecificMeshLayersBound": False,
                    "productionDeploymentVerified": False,
                },
            })
            with self.assertRaisesRegex(ValueError, "Popp VFX runtime receipt changed"):
                MODULE.vfx_runtime_evidence(path)


if __name__ == "__main__":
    unittest.main()
