#!/usr/bin/env python3
"""Record a bounded human review for one FateUBW native-motion reserve."""
import argparse
import hashlib
import json
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def record(path):
    return {"path": str(path), "sha256": sha256(path), "bytes": path.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conversion", type=Path, required=True)
    parser.add_argument("--expected-candidate", required=True)
    parser.add_argument("--expected-groups", type=int, required=True)
    args = parser.parse_args()
    root = args.conversion.resolve()
    output = root / "manual-visual-review.json"
    if output.exists():
        raise ValueError("manual review receipt must be new")
    conversion_path = root / "conversion-report.json"
    assessment_path = root / "visual-assessment.json"
    contact_path = root / "midpoint-contact-sheet.png"
    conversion = json.loads(conversion_path.read_text())
    assessment = json.loads(assessment_path.read_text())
    if (conversion.get("candidateId") != args.expected_candidate
            or conversion.get("output", {}).get("animationCount") != args.expected_groups
            or assessment.get("schema") != "ggd-fateubw-native-model-visual-assessment@1"
            or assessment.get("allShotsPresentAndFinite") is not True
            or assessment.get("counts", {}).get("animationGroups") != args.expected_groups
            or assessment.get("counts", {}).get("sampledUnchangedBodyGroups") != 0
            or assessment.get("contactSheet", {}).get("sha256") != sha256(contact_path)):
        raise ValueError("visual evidence is incomplete or changed")
    result = {
        "schema": "ggd-fateubw-native-model-manual-review@1",
        "candidateId": args.expected_candidate,
        "conversion": record(conversion_path),
        "automatedVisualAssessment": record(assessment_path),
        "reviewedArtifact": {
            **record(contact_path),
            "tilesInspected": args.expected_groups,
            "selection": "front view at 50 percent of every converted animation group",
        },
        "review": {
            "status": "accepted-as-phase-sampled-native-motion-reserve",
            "bodyPoseResult": "No exploded, missing-body or nonfinite pose was observed in the midpoint contact sheet.",
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
        "scope": "Human review of midpoint tiles plus automated finite-bounds and four-shot evidence. It is not continuous animation, source-engine, gameplay or deployment acceptance.",
    }
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sha256": sha256(output),
                      "tilesInspected": args.expected_groups, "acceptedAs": result["review"]["acceptedAs"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
