#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("kof3d_inventory", HERE / "build_inventory.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class InventoryParsingTest(unittest.TestCase):
    def test_guard_output_parser_ignores_pnpm_preamble(self) -> None:
        probe_spec = importlib.util.spec_from_file_location("kof3d_probe", HERE / "probe_conversion.py")
        probe = importlib.util.module_from_spec(probe_spec)
        assert probe_spec.loader is not None
        probe_spec.loader.exec_module(probe)
        value = probe.parse_guard_output("pnpm preamble\n{\"tool\":\"model-budget/guard\",\"results\":[]}")
        self.assertEqual("model-budget/guard", value["tool"])

    def test_wad_listing_parses_hex_offsets_and_native_directories(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "list.log"
            path.write_text(
                "  0000000000000010 12 Chara/MAI/MAI.obac\n"
                "  0000000000000020 34 Chara/MAI/MAI.otra\n"
                "  0000000000000030 56 Chara/IOR/IOR_COL.dds\n"
                "not a row\n",
                encoding="utf-8",
            )
            rows, groups = MODULE.parse_wad_listing(path)
            self.assertEqual(3, len(rows))
            self.assertEqual(16, rows[0]["offset"])
            self.assertEqual(["IOR", "MAI"], sorted(groups))
            summary = MODULE.summarize_native_directory("MAI", groups["MAI"])
            self.assertEqual("verified-from-selected-extraction", summary["identityStatus"])
            self.assertEqual(1, summary["assetKindCounts"]["modelContainer"])
            self.assertEqual(1, summary["assetKindCounts"]["animationContainer"])

    def test_windows_inventory_does_not_turn_unrelated_impact_into_maximum_impact(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "inventory.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("steam-games.csv", "Name,FullPath\nTHE KING OF FIGHTERS XIV,F:\\\\KOFXIV\n")
                archive.writestr("steam-manifests.csv", "AppId,Name\n571260,THE KING OF FIGHTERS XIV\n")
                archive.writestr("game-directories.csv", "Name,FullPath\nimpact,E:\\\\Fx\\\\impact\n")
                archive.writestr("rom-files.csv", "Name,FullPath\nphotoimpactX3trail,E:\\\\photoimpact.zip\n")
                archive.writestr("scan-receipt.json", "{\"currentStatus\":\"inventory-only\"}")
            rows = MODULE.rows_from_windows_inventory(path)
            matches = [
                row for name in ("steam-games.csv", "game-directories.csv", "rom-files.csv")
                for row in rows[name]
                if MODULE.MAXIMUM_IMPACT_RE.search(str(row))
            ]
            self.assertEqual([], matches)

    def test_2002_scope_is_separate_from_3d_by_constant_contract(self) -> None:
        self.assertEqual("steam-kof2002um-voice-dat-222440-build-8463197", MODULE.KOF_2002_SOURCE_ID)
        self.assertNotEqual(MODULE.KOF_2002_SOURCE_ID, MODULE.KOF_XIV_SOURCE_ID)

    def test_ash_review_audio_never_becomes_runtime_evidence(self) -> None:
        receipt_path = HERE.parents[3] / "materials/hero-model-library/priority-evidence/kof-xv-ash-audio-review-v1/receipt.json"
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        summary = receipt["summary"]
        self.assertEqual(86, summary["convertedReviewMp3Files"])
        self.assertEqual(0, summary["perClipLanguageConfirmed"])
        self.assertEqual(0, summary["perClipSpeakerConfirmed"])
        self.assertEqual(0, summary["perClipEventConfirmed"])
        self.assertEqual(0, summary["runtimeBindingsCreated"])
        self.assertEqual(0, summary["backendSelectableAssets"])

    def test_mai_and_iori_material_mapping_probes_stay_non_runtime(self) -> None:
        inventory_path = HERE.parents[3] / "materials/hero-model-library/source-inventories/kof-3d-sources-v1/inventory.json"
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
        probes = inventory["kofXv"]["materialMappingProbes"]
        self.assertEqual(["Iori Yagami", "Mai Shiranui"], sorted(row["character"] for row in probes))
        for row in probes:
            self.assertEqual("blocked-no-authoritative-material-slot-mapping", row["state"])
            self.assertFalse(row["runtimeReady"])
            self.assertFalse(row["backendSelectionVerified"])
            self.assertTrue(row["nativeFbx"]["sha256Verified"])
            self.assertTrue(row["rejectedAssimpGlb"]["sha256Verified"])
            self.assertEqual(12, row["suppliedTextures"]["decodedCount"])
            self.assertTrue(row["suppliedTextures"]["allSha256Verified"])
            self.assertGreater(row["rejectedAssimpGlb"]["externalImageUriCount"], 0)


if __name__ == "__main__":
    unittest.main()
