"""Validate independently reusable skinned model components with source motions."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROLE = "independent-skinned-model-motion-component"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify_pin(pin, repo):
    path = (Path(repo) / pin["gitPath"]).resolve()
    require(path.is_relative_to(Path(repo).resolve()), "Evidence escapes checkout")
    require(path.is_file(), "Missing pinned file: " + str(path))
    data = path.read_bytes()
    require((len(data), hashlib.sha256(data).hexdigest()) == (pin["bytes"], pin["sha256"]),
            "Changed pinned file: " + str(path))
    return path


def validate(candidate, source, repo):
    for field in ("runtimeSelectable", "defaultEligible", "automaticEligible", "runtimeDropdownRegistered", "fullHeroModel"):
        require(candidate.get(field) is False, "Independent motion component cannot enable " + field)
    require(candidate.get("heroIds") == [] and candidate.get("relatedHeroIds", []) == [],
            "Independent motion component cannot bind a hero")
    require(candidate.get("resourceRole") == ROLE, "Unsupported animated component role")
    require(candidate.get("sourceId") == source.get("id"), "Animated component source mismatch")
    require(candidate.get("sourceClass") == source.get("sourceClass"), "Animated component source class mismatch")
    require(candidate.get("nativeAnimationCount") == 5 and candidate.get("proceduralAnimationCount") == 0,
            "Unexpected animated component motion counts")
    require(candidate.get("animationProvenance") == "community-mod-native-not-original-game",
            "Animated component motion provenance is ambiguous")
    model = verify_pin(candidate, repo)
    require(candidate.get("gitPath") == "content/assets/models/community/" + candidate["sha256"] + ".glb",
            "Noncanonical animated component Git path")

    validation = json.loads(verify_pin(candidate["validationEvidence"], repo).read_text())
    require(validation.get("schema") == "ggd-ssbu-mario-ultimate14-motion-validation@1",
            "Unexpected animated component validation schema")
    require((validation.get("glb", {}).get("sha256"), validation.get("glb", {}).get("bytes")) ==
            (candidate["sha256"], candidate["bytes"]), "Animated validation GLB pin mismatch")
    require(validation.get("structuralValidationPassed") is True, "Animated component structural validation failed")
    require(validation.get("finiteFloatAccessors", {}).get("passed") is True,
            "Animated component has non-finite values")
    require(validation.get("khronosIssues", {}).get("numErrors") == 0 and
            validation.get("khronosIssues", {}).get("numWarnings") == 0 and
            validation.get("khronosIssues", {}).get("truncated") is False,
            "Animated component failed direct Khronos validation")
    inspection = validation.get("ggdInspection", {})
    require(inspection.get("budget", {}).get("errors") == [], "Animated component exceeds GGD budget")
    require(inspection.get("skinCount") == 1 and inspection.get("jointCount") == 98,
            "Unexpected animated component skin")
    clips = inspection.get("clips", [])
    require(len(clips) == 5 and all(row.get("channels") == 294 for row in clips),
            "Incomplete animated component clips")

    acceptance = json.loads(verify_pin(candidate["acceptanceEvidence"], repo).read_text())
    rows = [row for row in acceptance.get("components", []) if row.get("id") == candidate["id"]]
    require(len(rows) == 1 and rows[0].get("accepted") is True and rows[0].get("sha256") == candidate["sha256"],
            "Missing animated component acceptance")
    require(rows[0].get("scope") == ROLE, "Wrong animated component acceptance scope")
    require(rows[0].get("completeGameplayActionSet") is False, "Partial motion set cannot claim completeness")
    for field in ("deliveryEvidence", "visualEvidence", "webglProofEvidence", "sourceRebuildEvidence"):
        verify_pin(candidate[field], repo)
    rebuild = json.loads(verify_pin(candidate["sourceRebuildEvidence"], repo).read_text())
    require(rebuild.get("finalGlbByteIdenticalRebuild") is True and rebuild.get("outputSha256") == candidate["sha256"],
            "Animated component deterministic final rebuild failed")
    return dict(candidate, gitAbsolutePath=str(model))


def source_animated_components(downloads, repo):
    result, seen = [], set()
    for source in downloads.get("publicSources", []) + downloads.get("paidSources", []):
        for candidate in source.get("componentCandidates", []):
            if not candidate.get("componentReady") or candidate.get("resourceRole") != ROLE:
                continue
            require(candidate["id"] not in seen, "Duplicate animated component ID: " + candidate["id"])
            seen.add(candidate["id"])
            result.append(validate(candidate, source, repo))
    return result
