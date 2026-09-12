import csv
import gzip
import json
import tempfile
import unittest
from pathlib import Path

from build_windows_game_inventory import markdown
from merge_windows_asset_container_inventory import merge, write_jsonl_gzip


class WindowsAssetContainerInventoryMergeTest(unittest.TestCase):
    def write_csv(self, path, fieldnames, rows):
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    def test_merges_palworld_container_metadata_without_claiming_extraction(self):
        with tempfile.TemporaryDirectory() as tmp:
            scan = Path(tmp)
            (scan / "scan-receipt.json").write_text(json.dumps({
                "generatedAt": "2026-09-12T00:00:00Z",
                "filesEnumerated": 10,
                "logicalFileBytes": 999,
                "assetContainerCandidateCount": 2,
                "elapsedSeconds": 2,
                "entriesPerSecond": 5,
                "scanErrorCount": 0,
                "payloadBytesRead": 0,
                "contentHashesComputed": 0,
            }), encoding="utf-8")
            self.write_csv(scan / "game-file-summaries.csv", [
                "SourceKind", "SteamRoot", "AppId", "BuildId", "Title", "InstallDirectory", "FullPath",
                "FileCount", "TotalBytes", "AssetContainerCandidateCount", "EngineHints", "TopExtensionsJson",
                "ManifestMatched", "InventoryStatus", "ContentInspected", "PayloadBytesRead",
            ], [{
                "SourceKind": "steam-install", "SteamRoot": r"F:\SteamLibrary\steamapps\common",
                "AppId": "1623730", "BuildId": "25094871", "Title": "Palworld",
                "InstallDirectory": "Palworld", "FullPath": r"F:\SteamLibrary\steamapps\common\Palworld",
                "FileCount": "10", "TotalBytes": "999", "AssetContainerCandidateCount": "2",
                "EngineHints": "Unreal Engine; Wwise", "TopExtensionsJson": '[{"extension":".pak","count":1}]',
                "ManifestMatched": "True", "InventoryStatus": "metadata-only-files-enumerated",
                "ContentInspected": "False", "PayloadBytesRead": "0",
            }])
            candidate_fields = [
                "SourceKind", "SteamRoot", "AppId", "BuildId", "GameTitle", "InstallDirectory", "AssetKind",
                "Extension", "SizeBytes", "RelativePath", "FullPath", "LastWriteTimeUtc", "Sha256",
                "ContentRead", "Status",
            ]
            self.write_csv(scan / "asset-container-files.csv", candidate_fields, [
                {"SourceKind": "steam-install", "SteamRoot": r"F:\SteamLibrary\steamapps\common",
                 "AppId": "1623730", "BuildId": "25094871", "GameTitle": "Palworld",
                 "InstallDirectory": "Palworld", "AssetKind": "unreal-container-or-asset", "Extension": ".pak",
                 "SizeBytes": "700", "RelativePath": r"Pal\Content\Paks\Pal-Windows.pak",
                 "FullPath": r"F:\SteamLibrary\steamapps\common\Palworld\Pal\Content\Paks\Pal-Windows.pak",
                 "LastWriteTimeUtc": "2026-09-12T00:00:00Z", "Sha256": "", "ContentRead": "False",
                 "Status": "metadata-only-container-candidate"},
                {"SourceKind": "steam-install", "SteamRoot": r"F:\SteamLibrary\steamapps\common",
                 "AppId": "1623730", "BuildId": "25094871", "GameTitle": "Palworld",
                 "InstallDirectory": "Palworld", "AssetKind": "wwise-audio", "Extension": ".bnk",
                 "SizeBytes": "299", "RelativePath": r"Pal\Content\WwiseAudio\main.bnk",
                 "FullPath": r"F:\SteamLibrary\steamapps\common\Palworld\Pal\Content\WwiseAudio\main.bnk",
                 "LastWriteTimeUtc": "2026-09-12T00:00:00Z", "Sha256": "", "ContentRead": "False",
                 "Status": "metadata-only-container-candidate"},
            ])
            self.write_csv(scan / "scan-errors.csv", ["Scope", "Path", "Error"], [])
            base = {
                "generatedAt": "2026-09-12T00:00:00Z",
                "summary": {"steamInstallCount": 1, "steamManifestCount": 1, "catalogRecordCount": 1,
                            "rawRomCandidateCount": 0, "rawDirectoryCount": 0, "directoryCollectionCount": 0,
                            "normalizedRomCandidateCount": 0, "excludedFalsePositiveCount": 0,
                            "priorityRecordCount": 1, "platformCounts": {},
                            "steamDirectoryWithoutManifestCount": 0,
                            "steamManifestWithoutDirectoryMatchCount": 0},
                "priorityViews": {"palworld": ["steam:1623730"]},
                "steamGames": [{
                    "id": "steam:1623730", "sourceKind": "steam-install", "title": "Palworld",
                    "appId": "1623730", "buildId": "25094871", "platform": "Windows (Steam)",
                    "sourcePath": r"F:\SteamLibrary\steamapps\common\Palworld", "manifestMatched": True,
                    "priorityTags": ["palworld"], "catalogRole": "game-asset-source",
                    "priorityCharacters": ["空渦龍 / Jetragon", "枯星龍 / Astralym", "搗蛋貓 / Cattiva"],
                    "containerInventoryStatus": "not-scanned-inside-install", "inventoryStatus": "inventory-only",
                }],
                "orphanSteamManifests": [], "romCandidates": [], "directoryCollections": [],
            }
            merged, detail = merge(base, scan)
            palworld = merged["steamGames"][0]
            self.assertEqual(palworld["containerInventoryStatus"], "metadata-only-files-enumerated")
            self.assertFalse(palworld["containerInventory"]["contentInspected"])
            self.assertEqual(palworld["containerInventory"]["payloadBytesRead"], 0)
            self.assertEqual(palworld["containerInventory"]["assetKindCounts"]["wwise-audio"], 1)
            self.assertEqual(merged["containerInventory"]["summary"]["matchedCatalogRecordCount"], 1)
            self.assertEqual(detail["summary"]["assetContainerCandidateCount"], 2)
            self.assertEqual(len(detail["candidateFiles"]), 2)
            self.assertIn("metadata-only-files-enumerated", markdown(merged))

            compressed = scan / "candidates.jsonl.gz"
            write_jsonl_gzip(compressed, detail["candidateFiles"])
            with gzip.open(compressed, "rt", encoding="utf-8") as handle:
                restored = [json.loads(line) for line in handle]
            self.assertEqual(restored, detail["candidateFiles"])


if __name__ == "__main__":
    unittest.main()
