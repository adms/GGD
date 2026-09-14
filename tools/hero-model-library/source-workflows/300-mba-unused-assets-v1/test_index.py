#!/usr/bin/env python3
"""Regression checks for the frozen 300 Heroes/MBA reserve snapshot."""
import gzip
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
HERE = ROOT / "materials/hero-model-library/priority-evidence/300-mba-unused-assets-v1"


def main() -> None:
    index = json.loads((HERE / "index.json").read_text())
    assert index["schema"] == "ggd.300-mba-unused-assets-index@1"
    assert index["newDownloads"] is False
    assert index["paymentPerformed"] is False
    assert index["conversionPerformed"] is False
    assert index["runtimeRegistrationPerformed"] is False
    assert index["approvedProcessedCopyAuthorizationsChanged"] is False
    summary = index["summary"]
    assert summary["native300VfxRecords"] == 58_922
    assert summary["registryAssetRecords"]["mba"] == {"model": 447, "animation": 1614, "vfx": 423}
    assert summary["registryAssetRecords"]["300heroes"] == {"model": 34_378, "animation": 49_859, "vfx": 11}
    assert summary["sourceCharactersIndexed"] == 291
    assert summary["sourceDefinitionsCatalog"] == 297
    assert summary["sourceDefinitionsExcludedFromHeroBacklog"] == 6
    assert summary["missingDeclaredBodyPaths"] == 5
    assert summary["contentObjectsBySha256"] == 68_669
    assert summary["duplicateHashGroups"] == 3_651
    assert summary["duplicatePathRows"] == 5_183
    assert summary["pipelineStageCounts"] == {
        "acquired": 73_852,
        "extracted": 73_852,
        "convertedCandidate": 223,
        "ggdAccepted": 0,
        "runtimeRegisteredAsSourceFile": 0,
        "runtimeSelectableAsSourceFile": 0,
        "productionDeployed": 0,
        "referencedByRuntimeDerivedOption": 61,
    }
    catalog_only = {row["sourceCharacterId"]: row for row in index["catalogOnlySourceDefinitions"]}
    assert set(catalog_only) == {
        "300heroes:129", "300heroes:130", "300heroes:131",
        "300heroes:390", "300heroes:391", "300heroes:392",
    }
    assert all(not row["ggdHeroIdInvented"] and not row["designBacklogIncluded"] for row in catalog_only.values())
    assert {source_id for source_id, row in catalog_only.items() if row["classification"].startswith("acquired-prop")} == {
        "300heroes:390", "300heroes:391", "300heroes:392",
    }
    for key in ("files", "animationClips"):
        entry = index[key]
        payload = (ROOT / entry["gitPath"]).read_bytes()
        assert hashlib.sha256(payload).hexdigest() == entry["sha256"]
        assert sum(1 for _ in gzip.open(ROOT / entry["gitPath"], "rt")) == entry["recordCount"]
    with gzip.open(ROOT / index["files"]["gitPath"], "rt") as stream:
        rows = [json.loads(line) for line in stream]
    assert len(rows) == summary["physicalFiles"]
    assert len({row["workspaceRelativePath"] for row in rows}) == len(rows)
    assert len({row["contentObjectId"] for row in rows}) == summary["contentObjectsBySha256"]
    assert sum(row["isCanonicalContentPath"] for row in rows) == summary["contentObjectsBySha256"]
    assert sum(row["sameContentPathCount"] > 1 for row in rows) == (
        summary["duplicatePathRows"] + summary["duplicateHashGroups"]
    )
    assert all(len(row["sha256"]) == 64 and row["existsLocal"] and row["liveSizeMatches"] for row in rows)
    assert all(row["contentObjectId"] == "sha256:" + row["sha256"] for row in rows)
    assert all(row["pipelineStages"]["acquisition"] == "acquired" for row in rows)
    assert all(row["pipelineStages"]["extraction"] == "extracted-and-locally-present" for row in rows)
    assert all(row["pipelineStages"]["ggdFinalAcceptance"] == "not-accepted" for row in rows)
    assert all(row["pipelineStages"]["runtimeRegistration"] == "not-registered-as-this-source-file" for row in rows)
    assert all(row["pipelineStages"]["runtimeSelectability"] == "not-selectable-as-this-source-file" for row in rows)
    assert all(row["runtimeSelectable"] is False and row["productionDeploymentVerified"] is False for row in rows)
    assert sum(row["usageStatus"].startswith("unused-") for row in rows) == summary["unusedPhysicalFiles"]
    central = json.loads((ROOT / "materials/asset-library/current-resources.json").read_text())["unused300MbaAssetIndex"]
    assert central["sha256"] == hashlib.sha256((HERE / "index.json").read_bytes()).hexdigest()
    assert central["filesSha256"] == index["files"]["sha256"]
    assert central["animationClipsSha256"] == index["animationClips"]["sha256"]
    assert central["runtimeSelectable"] is False and central["productionDeploymentVerified"] is False
    subprocess.run([sys.executable, str(Path(__file__).with_name("build_index.py")), "--check"], cwd=ROOT, check=True)
    print("300/MBA unused asset index checks passed")


if __name__ == "__main__":
    main()
