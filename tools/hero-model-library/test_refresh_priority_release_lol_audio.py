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


if __name__ == "__main__":
    unittest.main()
