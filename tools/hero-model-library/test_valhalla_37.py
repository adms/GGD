#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("audit_valhalla_37.py")
SPEC = importlib.util.spec_from_file_location("valhalla_37_audit", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Valhalla37AuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        probe = MODULE.read_json(MODULE.PROBE)
        cls.audit = MODULE.build_audit(probe)

    def test_exact_requested_roster_is_covered(self) -> None:
        self.assertEqual({"b2": 13, "community": 24, "total": 37}, self.audit["scope"])
        self.assertEqual(37, len(self.audit["rows"]))
        self.assertEqual(37, len({row["heroId"] for row in self.audit["rows"]}))

    def test_every_acquired_option_is_accepted_registered_and_locally_selectable(self) -> None:
        summary = self.audit["summary"]
        version_count = sum(row["modelVersionCount"] for row in self.audit["rows"])
        self.assertGreater(version_count, 37)
        for key in (
            "acquiredModelVersionOptions",
            "dropdownContractAcceptedModelVersionOptions",
            "registeredModelVersions",
            "localSelectableModelVersions",
        ):
            self.assertEqual(version_count, summary[key])
        for row in self.audit["rows"]:
            self.assertEqual([], row["missingQualifiedRegistrations"])
            self.assertEqual(
                "none-needed-all-qualified-version-options-already-registered",
                row["registrationAction"],
            )
            for option in row["allOptions"]:
                lifecycle = option["lifecycle"]
                self.assertTrue(lifecycle["acquired"])
                self.assertTrue(lifecycle["dropdownContractAccepted"])
                self.assertTrue(lifecycle["registered"])
                self.assertTrue(lifecycle["localSelectable"])

    def test_no_qualified_central_target_is_omitted(self) -> None:
        summary = self.audit["summary"]
        self.assertGreater(summary["qualifiedCentralTargetRows"], 0)
        self.assertEqual(
            summary["qualifiedCentralTargetRows"],
            summary["qualifiedCentralTargetRowsRepresented"],
        )
        self.assertEqual(0, summary["qualifiedCentralTargetRowsMissingRegistration"])
        self.assertEqual([], self.audit["qualifiedCentralTargetsMissingRegistration"])

    def test_owner_approved_derivative_scope_and_manual_selection_are_preserved(self) -> None:
        summary = self.audit["summary"]
        self.assertEqual(11, summary["approvedDerivativeReceipts"])
        self.assertEqual(0, summary["approvedDerivativeAuthorizationExpansion"])
        derivative_rows = [row for row in self.audit["rows"] if row["approvedDerivativeReceipt"]]
        self.assertEqual(11, len(derivative_rows))
        for row in derivative_rows:
            receipt = row["approvedDerivativeReceipt"]
            self.assertTrue(receipt["registered"])
            self.assertTrue(receipt["localSelectable"])
            self.assertTrue(receipt["manualDefaultPreserved"])
            self.assertFalse(receipt["productionDeployed"])
        popp = next(row for row in self.audit["rows"] if row["heroId"] == "b2-popp")
        self.assertEqual("manual", popp["modelSelectionMode"])
        self.assertIn("Kagayaki", popp["activeOption"]["label"])

    def test_production_boundary_is_not_overclaimed(self) -> None:
        summary = self.audit["summary"]
        self.assertEqual(0, summary["productionRegisteredModelVersions"])
        self.assertEqual(0, summary["productionDeployedModelVersions"])
        self.assertEqual(0, summary["productionVisualE2eVerified"])


if __name__ == "__main__":
    unittest.main()
