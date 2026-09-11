#!/usr/bin/env python3
"""Freeze the bounded human review of the FateUBW native-motion contact sheet."""
import argparse
import hashlib
import json
from pathlib import Path


UNCHANGED_SUMMONS = {
    "fateubw-artoria_pendragon_saber",
    "fateubw-emiya_archer",
    "fateubw-gilgamesh_archer",
    "fateubw-gilles_de_rais_caster",
    "fateubw-hassan-i-sabbah_assassin",
    "fateubw-nero_claudius_saber",
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path):
    return {"path": str(path), "sha256": sha256(path), "bytes": path.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    args = parser.parse_args()
    batch = args.batch.resolve()
    output = batch / "manual-visual-review.json"
    if output.exists():
        raise ValueError("manual review receipt must be new")
    manifest_path = batch / "batch-manifest.json"
    assessment_path = batch / "batch-visual-assessment.json"
    contact_path = batch / "batch-midpoint-contact-sheet.png"
    manifest = json.loads(manifest_path.read_text())
    assessment = json.loads(assessment_path.read_text())
    if (manifest.get("schema") != "ggd-fateubw-native-motion-reserve-batch@1"
            or manifest.get("counts", {}).get("convertedCharacters") != 13
            or manifest.get("counts", {}).get("convertedNativeClips") != 98
            or assessment.get("schema") != "ggd-fateubw-native-motion-visual-assessment@1"
            or assessment.get("allShotsPresentAndFinite") is not True
            or assessment.get("counts", {}).get("animationGroups") != 98
            or assessment.get("contactSheet", {}).get("sha256") != sha256(contact_path)):
        raise ValueError("batch visual evidence is incomplete or changed")
    unchanged = {
        row["candidateId"]
        for row in assessment.get("sampledUnchangedGroups", [])
        if row.get("groups") == ["summon"]
    }
    if unchanged != UNCHANGED_SUMMONS or assessment["counts"].get("sampledUnchangedBodyGroups") != 6:
        raise ValueError("unexpected unchanged sampled-motion set")
    result = {
        "schema": "ggd-fateubw-native-motion-manual-review@1",
        "sourceId": manifest["sourceId"],
        "batchManifest": file_record(manifest_path),
        "automatedVisualAssessment": file_record(assessment_path),
        "reviewedArtifact": {**file_record(contact_path), "tilesInspected": 98,
                             "selection": "front view at 50 percent of every converted animation group"},
        "review": {
            "status": "accepted-as-native-motion-conversion-reserve",
            "bodyPoseResult": "No exploded, missing-body or nonfinite pose was observed in the 98 midpoint tiles.",
            "sampledUnchangedGroups": [{"candidateId": candidate, "clip": "summon"}
                                       for candidate in sorted(UNCHANGED_SUMMONS)],
            "sampledUnchangedInterpretation": "The six summon clips animate attachment bones whose held-item meshes are absent from the body GLB; retain this as an explicit completeness gap.",
            "sourceScaleObservations": [
                "Diarmuid blink is visibly scaled down at the sampled midpoint.",
                "Medea rule_breaker shows mainly head and hat at the sampled midpoint because of the source scale channel.",
            ],
            "acceptedAs": "native-motion-conversion-reserve",
        },
        "rightsStatus": "ARR redistribution permission pending",
        "runtimeReady": False,
        "backendSelectionVerified": False,
        "defaultEligible": False,
        "deployed": False,
        "remaining": [
            "continuous playback review and source-engine curve parity",
            "weapon and held-item attachment geometry",
            "unsupported formula and no-duration source clips",
            "GGD action and event mapping",
            "backend dropdown selection verification",
            "redistribution permission for ARR source",
        ],
        "scope": "Human review of the 98 front-view midpoint tiles plus automated finite-bounds and four-shot evidence. It is not continuous animation, source-engine, gameplay or deployment acceptance.",
    }
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sha256": sha256(output),
                      "tilesInspected": 98, "acceptedAs": result["review"]["acceptedAs"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
