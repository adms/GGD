#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("audit_model_dropdown_coverage.py")
SPEC = importlib.util.spec_from_file_location("dropdown_audit", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ModelDropdownAuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.report = MODULE.build_report()

    def test_all_runtime_references_resolve_to_model_documents(self) -> None:
        self.assertEqual([], self.report["registrationReferencesMissingModelDocument"])

    def test_central_registration_flags_match_actual_registration(self) -> None:
        self.assertEqual([], self.report["centralRegistrationFlagMismatches"])

    def test_unregistered_central_rows_have_reproducible_blockers(self) -> None:
        rows = self.report["centralUnregisteredQualifiedModels"]
        self.assertGreater(len(rows), 0)
        for row in rows:
            self.assertTrue(row["validation"])
            self.assertIn("central-index-declares-runtimeDropdownRegistered-false", row["blockers"])
            self.assertEqual([], row["registeredFor"])

    def test_components_are_not_promoted_by_the_audit(self) -> None:
        rows = (
            self.report["readyUnregisteredCharacterOrMotionComponents"]
            + self.report["readyUnregisteredWeaponComponents"]
        )
        self.assertGreater(len(rows), 0)
        for row in rows:
            self.assertFalse(row["runtimeDropdownRegistered"])
            self.assertIn("component-is-not-runtime-selectable", row["blockers"])

    def test_vfx_gap_is_explicit(self) -> None:
        gap = self.report["classificationGap"]
        self.assertFalse(gap["unusedVfxInventoryComplete"])
        self.assertEqual(
            self.report["summary"]["modelAt1Documents"],
            self.report["summary"]["modelDocumentsWithoutResourceRole"],
        )


if __name__ == "__main__":
    unittest.main()
