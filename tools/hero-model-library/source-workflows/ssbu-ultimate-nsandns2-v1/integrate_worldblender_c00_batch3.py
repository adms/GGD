#!/usr/bin/env python3
"""Register validated Worldblender c00 batch-3 components in canonical indexes."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
CANDIDATES = REPO / "materials/hero-model-library/priority-evidence/ssbu-worldblender-c00-batch3-v1/candidate-rows.json"
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
SUPPLEMENTAL = REPO / "materials/hero-model-library/design-backlog/sources-supplemental.json"

IDENTITIES = {
    "ssbu-daisy-c00-static-skinned-v1": {"id": "community:ssbu-daisy-c00-standardized-v1", "aliases": ["Daisy", "黛西", "fighter/daisy"], "heroes": []},
    "ssbu-peach-c00-static-skinned-v1": {"id": "community:ssbu-peach-c00-standardized-v1", "aliases": ["Peach", "碧姬公主", "fighter/peach"], "heroes": []},
    "ssbu-toonlink-c00-static-skinned-v1": {"id": "community:ssbu-toonlink-c00-standardized-v1", "aliases": ["Toon Link", "卡通林克", "fighter/toonlink"], "heroes": []},
}


def encode(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    candidate_doc = json.loads(CANDIDATES.read_text())
    candidates = candidate_doc.get("candidates", [])
    require(candidate_doc.get("schema") == "ggd-worldblender-c00-candidate-rows@1", "Unexpected candidate schema")
    require({row.get("id") for row in candidates} == set(IDENTITIES), "Candidate set differs from the fixed batch-3 roster")

    downloads = json.loads(DOWNLOADS.read_text())
    source = next(row for row in downloads["publicSources"] if row.get("id") == "gitlab-ssbu-models")
    require(source.get("sourceClass") == "original-game-extraction-community-repackage", "SSBU source class drift")
    target = source.setdefault("componentCandidates", [])
    attempts = source.setdefault("conversionAttempts", [])
    supplemental = json.loads(SUPPLEMENTAL.read_text())

    for candidate in candidates:
        model_path = REPO / candidate["gitPath"]
        require(model_path.is_file() and model_path.stat().st_size == candidate["bytes"] and sha(model_path) == candidate["sha256"], "Changed component GLB: " + candidate["id"])
        for field in ("deliveryEvidence", "validationEvidence", "acceptanceEvidence", "visualEvidence", "webglProofEvidence", "sourceRebuildEvidence", "s3BackupEvidence"):
            pin = candidate[field]
            evidence_path = REPO / pin["gitPath"]
            require(evidence_path.is_file() and evidence_path.stat().st_size == pin["bytes"] and sha(evidence_path) == pin["sha256"], "Changed evidence: " + field)
        require(candidate.get("s3BackupStatus") == "uploaded-and-readback-verified", "S3 backup is not verified")

        found = [row for row in target if row.get("id") == candidate["id"]]
        require(len(found) <= 1, "Duplicate component candidate: " + candidate["id"])
        if found:
            found[0].clear()
            found[0].update(candidate)
        else:
            target.append(candidate)

        attempt = {
            "id": candidate["id"].replace("-static-skinned-v1", "").replace("-static-skinned-v2", "") + "-blender4513",
            "componentId": candidate["id"], "status": candidate["readiness"],
            "localPath": str(Path(candidate["absolutePath"]).parent), "outputPath": candidate["absolutePath"],
            "outputSha256": candidate["sha256"], "nativeAnimationCount": 0,
            "runtimeReady": False, "runtimeSelectable": False,
            "backupStatus": "s3-conversion-stage-full-readback-verified", "s3Uri": candidate["s3Uri"],
            "backupReceiptGitPath": candidate["s3BackupEvidence"]["gitPath"],
            "fullGetVerified": True, "allMemberSha256Verified": True,
        }
        current_attempt = [row for row in attempts if row.get("componentId") == candidate["id"]]
        require(len(current_attempt) <= 1, "Duplicate conversion attempt: " + candidate["id"])
        if current_attempt:
            current_attempt[0].clear()
            current_attempt[0].update(attempt)
        else:
            attempts.append(attempt)

        identity = IDENTITIES[candidate["id"]]
        heroes = identity["heroes"]
        supplemental_row = {
            "id": identity["id"], "name": candidate["nameZh"], "work": candidate["workZh"],
            "sourceIds": [candidate["sourceId"]], "aliases": identity["aliases"],
            "modelCandidates": [{
                "id": candidate["id"], "library": "community", "sourceId": candidate["sourceId"],
                "path": candidate["absolutePath"], "gitPath": candidate["gitPath"], "bytes": candidate["bytes"],
                "sha256": candidate["sha256"], "format": "glTF Binary", "readiness": candidate["readiness"],
                "converted": True, "componentReady": True, "resourceRole": candidate["resourceRole"],
                "nativeAnimationCount": 0, "proceduralAnimationCount": 0, "runtimeSelectable": False,
                "defaultEligible": False, "validationEvidence": candidate["validationEvidence"],
                "visualEvidence": candidate["visualEvidence"], "s3BackupEvidence": candidate["s3BackupEvidence"],
                "s3Uri": candidate["s3Uri"], "limitations": candidate["limitations"],
            }],
            "mappedHeroIds": heroes, "identityHeroIds": heroes,
            "designStatus": "designed" if heroes else "not-defined",
            "noDesignReason": None if heroes else f"No current GGD champion definition matches the exact {candidate['originalName']} identity.",
            "evidence": [candidate["auditEvidence"]],
        }
        matches = [row for row in supplemental["characters"] if row.get("id") == identity["id"]]
        require(len(matches) <= 1, "Duplicate supplemental identity: " + identity["id"])
        if matches:
            matches[0].clear()
            matches[0].update(supplemental_row)
        else:
            supplemental["characters"].append(supplemental_row)

    expected = {DOWNLOADS: encode(downloads), SUPPLEMENTAL: encode(supplemental)}
    if args.write:
        for path, content in expected.items():
            path.write_text(content)
    else:
        drift = [str(path.relative_to(REPO)) for path, content in expected.items() if path.read_text() != content]
        require(not drift, "Generated index drift: " + ", ".join(drift))
    print(json.dumps({"componentsIntegrated": len(candidates), "downloadSources": str(DOWNLOADS), "supplemental": str(SUPPLEMENTAL), "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
