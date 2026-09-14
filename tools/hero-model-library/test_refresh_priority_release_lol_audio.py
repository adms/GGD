#!/usr/bin/env python3
"""Regression tests for the LoL-seven priority summary projection."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("refresh_priority_release_lol_audio", HERE / "refresh_priority_release_lol_audio.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def fixtures() -> tuple[dict, dict, dict]:
    registration = {
        "schema": "ggd-lol-approved-battle-runtime-registration@1",
        "summary": {"approved": 311, "runtimeRegistered": 311, "productionDeployed": False},
    }
    audit = {
        "schema": "ggd-lol-seven-approved-runtime-audit@1",
        "summary": {
            "approvedSourceWavsVerified": 311,
            "runtimeMp3sVerified": 311,
            "runtimeGitBlobsVerified": 311,
            "runtimeManifestRowsVerified": 311,
            "pendingOtherEventBoundWavs": 443,
            "productionDeployed": False,
        },
        "status": {"acquired": True, "converted": True, "ownerReviewed": True, "runtimeRegistered": True, "branchSelectable": True},
    }
    queue = {"schema": "ggd-lol-listening-review-queue@1", "summary": {"battleReviewCandidates": 311, "runtimeApproved": 311}}
    return registration, audit, queue


def kaiji_fixtures() -> tuple[dict, dict, dict, dict]:
    candidate_id = "kaiji-holya-procedural-six-state-v1"
    model_key = "community.body.kaiji"
    active_model = "version.body.kaiji"
    sha256 = "a" * 64
    receipt = {
        "schema": "ggd-kaiji-runtime-delivery@1", "candidateId": candidate_id,
        "heroId": "b2-kaiji", "runtimeModelKey": model_key, "activeModelKey": active_model,
        "sha256": sha256, "readiness": "registered-runtime-option",
        "backendSelectionVerified": True, "productionDeployed": False,
        "audioCount": 0, "vfxCount": 0,
    }
    registration = {
        "schema": "ggd-model-library-registration@1",
        "heroes": [{"id": "b2-kaiji", "registered": [f"runtime:{candidate_id}"], "pending": [],
                    "state": {"activeModelKey": active_model}}],
    }
    readback = {"schema": "ggd-kaiji-registration-readback@1", "activeModelKey": active_model, "productionDeployed": False}
    runtime_options = {"models": [{"id": f"runtime:{candidate_id}", "modelKey": model_key,
                                   "sha256": sha256, "nativeAnimationCount": 0,
                                   "proceduralAnimationCount": 6}]}
    return receipt, registration, readback, runtime_options


class PriorityReleaseLolAudioTests(unittest.TestCase):
    def test_projection_keeps_other_event_audio_pending(self) -> None:
        registration, audit, queue = fixtures()
        result = MODULE.projection(registration, audit, queue)
        self.assertEqual(result["approvedAndRuntimeRegisteredClips"], 311)
        self.assertEqual(result["pendingOtherEventBoundWavs"], 443)
        self.assertFalse(result["productionDeployed"])
        self.assertIn("production-deployment-pending", result["state"])

    def test_projection_rejects_partial_review_as_runtime_registration(self) -> None:
        registration, audit, queue = fixtures()
        queue["summary"]["runtimeApproved"] = 310
        with self.assertRaisesRegex(ValueError, "fixed battle subset drift"):
            MODULE.projection(registration, audit, queue)

    def test_kaiji_projection_removes_only_stale_raw_flags(self) -> None:
        receipt, registration, readback, runtime_options = kaiji_fixtures()
        result = MODULE.kaiji_projection(receipt, registration, readback, runtime_options)
        self.assertEqual(result["heroId"], "b2-kaiji")
        self.assertEqual(result["proceduralAnimationCount"], 6)
        self.assertFalse(result["productionDeployed"])

    def test_kaiji_projection_rejects_unregistered_candidate(self) -> None:
        receipt, registration, readback, runtime_options = kaiji_fixtures()
        registration["heroes"][0]["registered"] = []
        with self.assertRaisesRegex(ValueError, "no longer contains"):
            MODULE.kaiji_projection(receipt, registration, readback, runtime_options)


if __name__ == "__main__":
    unittest.main()
