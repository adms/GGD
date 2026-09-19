#!/usr/bin/env python3
"""Fail-closed J-Stars priority-six conversion, admission, registration and default lane."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


HERE = Path(__file__).resolve().parent
DEFAULT_REPO = HERE.parents[3]
GENERIC = DEFAULT_REPO / "tools/hero-model-library/source-workflows/jstars-conversion-runtime-v1/pipeline.py"
PROMOTER = HERE / "pipeline_promote.mts"
CONTRACT = HERE / "pipeline-contract.json"
MODULES = ("model", "texture", "skeleton", "motion", "vfx", "sfx", "voice")
STATES = ("idle", "run", "attack", "cast", "hurt", "death")
PIPELINE_STAGES = ("extraction", *MODULES, "registration", "automatic-default")
BLOCKED_UPSTREAM = {"blocked-archive-not-found", "blocked-archive-listing-failed"}
PASS_CONVERSION = {
    "model": "prepared-and-verified",
    "texture": "normalized-and-verified-max-edge",
    "skeleton": "verified-all-primitives-skinned",
    "motion": "verified-six-state-map",
}
BOUND_STATUS = "runtime-bound-and-verified"
REGISTERED = {"registered-non-default-independent-option", "already-registered"}

# These are target identities, not guesses for native container ids.  Extraction
# must still provide identityVerified=true and one of the exact GGD hero ids.
PRIORITY = (
    {"key": "gintoki", "name": "坂田銀時", "heroIds": ("community-review-23-20260907",)},
    {"key": "nube", "name": "鵺野鳴介／神眉", "heroIds": ("b2-nube",)},
    {"key": "gon", "name": "小傑", "heroIds": ("godie-ucrl",)},
    {"key": "killua", "name": "奇犽", "heroIds": ("community-review-24-20260907",)},
    {"key": "luckyman", "name": "幸運超人", "heroIds": ("b2-luckyman",)},
    {"key": "hiei", "name": "飛影", "heroIds": ("godie-u010", "godie-uvng")},
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_record(path: Path) -> dict[str, Any]:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    encoded = (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == encoded:
        return
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(encoded)
    temporary.replace(path)


def run_json(command: list[str], cwd: Path) -> dict[str, Any]:
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError("command failed: " + " ".join(command) + "\n" + completed.stdout + completed.stderr)
    value = json.loads(completed.stdout)
    if not isinstance(value, dict):
        raise ValueError("command did not return one JSON object")
    return value


def blocked_character(target: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        "priorityKey": target["key"], "name": target["name"], "allowedHeroIds": list(target["heroIds"]),
        "status": "blocked", "allGatesPassed": False, "automaticDefaultApplied": False,
        "stages": [{"id": stage, "status": "blocked", "reason": reason} for stage in PIPELINE_STAGES],
    }


def blocked_receipt(source_path: Path, output: Path, status: str, reason: str, upstream: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "schema": "ggd.jstars-priority-six-pipeline-receipt@1", "pipelineId": "jstars-priority-six-v1",
        "mode": "plan", "status": status,
        "input": {"requestedSourceReceipt": str(source_path.resolve()), "exists": source_path.is_file(), **({"upstream": upstream} if upstream else {})},
        "output": str(output.resolve()), "characters": [blocked_character(row, reason) for row in PRIORITY],
        "counts": {"priorityCharacters": 6, "sourceMatched": 0, "registeredOptions": 0, "automaticDefaultsApplied": 0},
        "policies": policy_record(), "productionDeploymentVerified": False,
    }


def policy_record() -> dict[str, Any]:
    return validate_contract()["policy"]


def validate_contract() -> dict[str, Any]:
    contract = read_json(CONTRACT)
    if contract.get("schema") != "ggd.jstars-priority-six-pipeline-contract@1" or contract.get("pipelineId") != "jstars-priority-six-v1":
        raise ValueError("unexpected priority-six pipeline contract")
    expected_priority = [{"key": row["key"], "name": row["name"], "heroIds": list(row["heroIds"])} for row in PRIORITY]
    if contract.get("priority") != expected_priority or contract.get("modules") != list(MODULES):
        raise ValueError("priority-six identity/module contract drift")
    policy = contract.get("policy", {})
    if policy.get("decimateOnlyWhenTrianglesAbove") != 10000 or policy.get("decimatedMaximumAcceptedTriangles") != 8000:
        raise ValueError("triangle policy drift")
    if policy.get("textureMaxEdge") != 256 or policy.get("requiredMotionStates") != list(STATES):
        raise ValueError("texture/motion policy drift")
    if not all(policy.get(key) is True for key in (
        "audioRequiresPerFileOwnerApproval", "registerIndependentOptionBeforeDefault",
        "automaticDefaultRequiresEveryModuleGate", "manualSelectionMustBePreserved", "productionDeploymentIsSeparate",
    )):
        raise ValueError("fail-closed policy drift")
    return contract


def source_characters(raw: dict[str, Any]) -> list[dict[str, Any]]:
    rows = raw.get("characters")
    if isinstance(rows, list):
        return [row for row in rows if isinstance(row, dict)]
    # Owner archive receipts nest materialized rows beneath token rows.
    rows = raw.get("characterContainerTokens")
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def match_priority(raw: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    matched: dict[str, dict[str, Any]] = {}
    invalid: list[dict[str, Any]] = []
    for row in source_characters(raw):
        hero_id = row.get("heroId")
        for target in PRIORITY:
            if hero_id not in target["heroIds"]:
                continue
            if target["key"] in matched:
                invalid.append({"priorityKey": target["key"], "reason": "duplicate verified hero identity", "heroId": hero_id})
                continue
            if row.get("identityVerified") is not True:
                invalid.append({"priorityKey": target["key"], "reason": "identityVerified is not true", "heroId": hero_id})
                continue
            matched[target["key"]] = row
    return matched, invalid


def conversion_by_hero(receipt: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in receipt.get("characters", []):
        if isinstance(row, dict) and isinstance(row.get("heroId"), str):
            if row["heroId"] in result:
                raise ValueError(f"duplicate conversion heroId: {row['heroId']}")
            result[row["heroId"]] = row
    return result


def stage_map(row: dict[str, Any]) -> dict[str, dict[str, Any]]:
    stages: dict[str, dict[str, Any]] = {}
    for stage in row.get("stages", []):
        if not isinstance(stage, dict) or not isinstance(stage.get("id"), str):
            continue
        if stage["id"] in stages:
            raise ValueError(f"duplicate conversion stage: {stage['id']}")
        stages[stage["id"]] = stage
    return stages


def artifacts(row: dict[str, Any], module: str) -> list[dict[str, Any]]:
    key = {"model": "modelSources", "texture": "textures", "skeleton": "skeletons", "motion": "motions"}.get(module, module)
    container = row.get("artifacts", {})
    value = container.get(key, []) if isinstance(container, dict) else []
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def approved_audio_rows(rows: list[dict[str, Any]], module: str) -> tuple[bool, list[str]]:
    blockers: list[str] = []
    if not rows:
        return False, ["no source artifacts"]
    for index, row in enumerate(rows):
        review = row.get("ownerReview")
        if not isinstance(review, dict) or review.get("reviewer") != "owner" or review.get("decision") != "approve":
            blockers.append(f"artifact[{index}] lacks owner approve review")
            continue
        if not str(review.get("event", "")).strip():
            blockers.append(f"artifact[{index}] lacks reviewed event")
        if module == "voice" and (not str(review.get("speaker", "")).strip() or not str(review.get("language", "")).strip()):
            blockers.append(f"artifact[{index}] lacks reviewed speaker/language")
    return not blockers, blockers


def bound_module_gate(source: dict[str, Any], module: str) -> dict[str, Any]:
    rows = artifacts(source, module)
    evidence_container = source.get("moduleEvidence", {})
    evidence = evidence_container.get(module, {}) if isinstance(evidence_container, dict) else {}
    blockers: list[str] = []
    if not rows:
        blockers.append("no source artifacts")
    if not isinstance(evidence, dict) or evidence.get("status") != BOUND_STATUS:
        blockers.append(f"checked binder status must be {BOUND_STATUS}")
    expected = sorted(str(row.get("sha256", "")) for row in rows if row.get("sha256"))
    admitted = sorted(str(value) for value in evidence.get("boundArtifactSha256", [])) if isinstance(evidence, dict) else []
    if expected != admitted or len(expected) != len(rows):
        blockers.append("checked binder must cover the exact source artifact sha256 set")
    runtime_count = evidence.get("runtimeBindingCount") if isinstance(evidence, dict) else None
    if runtime_count != len(rows):
        blockers.append("runtimeBindingCount does not equal source artifact count")
    if module in {"sfx", "voice"}:
        approved, audio_blockers = approved_audio_rows(rows, module)
        if not approved:
            blockers.extend(audio_blockers)
    return {
        "id": module, "status": "passed" if not blockers else "blocked",
        "sourceArtifacts": len(rows), "runtimeBindings": runtime_count if isinstance(runtime_count, int) else 0,
        "ownerApprovedArtifacts": len(rows) if module in {"sfx", "voice"} and not blockers else 0,
        **({"blockers": blockers} if blockers else {}),
    }


def model_quality_evidence(conversion: dict[str, Any]) -> dict[str, Any]:
    model_result = conversion.get("modelResult", {})
    candidate: dict[str, Any] = {}
    receipt_value = model_result.get("receipt") if isinstance(model_result, dict) else None
    if isinstance(receipt_value, str) and Path(receipt_value).is_file():
        candidate = read_json(Path(receipt_value))
    quality = model_result.get("qualityEvidence", {}) if isinstance(model_result, dict) else {}
    measured = model_result.get("measured", {}) if isinstance(model_result, dict) else {}
    inspection = candidate.get("inspection", {}) if isinstance(candidate, dict) else {}
    textures = inspection.get("textures", []) if isinstance(inspection, dict) else []
    measured_edges = [int(value) for row in textures if isinstance(row, dict) for value in (row.get("width", 0), row.get("height", 0)) if isinstance(value, int)]
    fallback_edge = quality.get("textureMaxEdge", -1)
    texture_max = max(measured_edges) if measured_edges else (fallback_edge if isinstance(fallback_edge, int) else -1)
    return {
        "originalTriangles": measured.get("triangles", quality.get("originalTriangles")),
        "outputTriangles": inspection.get("triangles", quality.get("outputTriangles")),
        "textureMaxEdge": texture_max,
        "decimationApplied": model_result.get("needsDecimation", quality.get("decimationApplied")),
    }


def structural_module_gate(source: dict[str, Any], conversion: dict[str, Any], module: str) -> dict[str, Any]:
    conversion_stage = stage_map(conversion).get(module, {})
    blockers: list[str] = []
    if conversion_stage.get("status") != PASS_CONVERSION[module]:
        blockers.append(f"conversion stage must be {PASS_CONVERSION[module]}")
    if module != "model" and not artifacts(source, module):
        blockers.append("no verified source artifacts")
    if module == "motion" and set(source.get("animationSelections", {})) != set(STATES):
        blockers.append("idle/run/attack/cast/hurt/death selection is incomplete")
    model_result = conversion.get("modelResult", {})
    if module == "model" and model_result.get("status") != "prepared-and-officially-verified":
        blockers.append("official model preparation receipt is absent")
    quality = model_quality_evidence(conversion) if module in {"model", "texture"} else None
    if module == "model":
        original, final = quality["originalTriangles"], quality["outputTriangles"]
        if not isinstance(original, int) or not isinstance(final, int):
            blockers.append("measured original/output triangle evidence is absent")
        elif original > 10000:
            if quality["decimationApplied"] is not True:
                blockers.append("source above 10000 triangles was not decimated")
            if final > 8000:
                blockers.append("decimated output must be at most 8000 triangles")
        elif quality["decimationApplied"] is not False:
            blockers.append("source at or below 10000 triangles must not be decimated")
    if module == "texture" and (not isinstance(quality["textureMaxEdge"], int) or quality["textureMaxEdge"] < 0 or quality["textureMaxEdge"] > 256):
        blockers.append("verified texture max edge must be at most 256px")
    return {"id": module, "status": "passed" if not blockers else "blocked", **({"qualityEvidence": quality} if quality else {}), **({"blockers": blockers} if blockers else {})}


def registration_gate(conversion: dict[str, Any]) -> dict[str, Any]:
    registration = stage_map(conversion).get("model-registration", {})
    status = registration.get("status")
    return {
        "id": "registration", "status": "passed" if status in REGISTERED else "blocked",
        "independentOptionRegistered": status in REGISTERED, "registrationStatus": status,
        "automaticEligibleAtRegistration": False,
        **({"blockers": ["independent non-default option is not registered"]} if status not in REGISTERED else {}),
    }


def evaluate_character(target: dict[str, Any], source: dict[str, Any] | None, conversion: dict[str, Any] | None) -> dict[str, Any]:
    if source is None:
        return blocked_character(target, "verified priority character is absent from source receipt")
    if conversion is None:
        return blocked_character(target, "conversion receipt has no matching heroId")
    stages = [{"id": "extraction", "status": "passed", "identityVerified": True}]
    stages.extend(structural_module_gate(source, conversion, module) for module in ("model", "texture", "skeleton", "motion"))
    stages.extend(bound_module_gate(source, module) for module in ("vfx", "sfx", "voice"))
    stages.append(registration_gate(conversion))
    all_gates = all(row["status"] == "passed" for row in stages)
    stages.append({
        "id": "automatic-default", "status": "ready" if all_gates else "blocked",
        "requiresManualSelectionPreservation": True,
        **({"blockers": ["one or more extraction/module/registration gates are blocked"]} if not all_gates else {}),
    })
    return {
        "priorityKey": target["key"], "name": target["name"], "heroId": source["heroId"],
        "nativeCharacterId": source.get("nativeCharacterId"), "status": "ready-for-automatic-default" if all_gates else "blocked",
        "allGatesPassed": all_gates, "automaticDefaultApplied": False, "stages": stages,
    }


def apply_defaults(repo: Path, output: Path, characters: list[dict[str, Any]]) -> None:
    for row in characters:
        if not row["allGatesPassed"]:
            continue
        candidate = output / "conversion" / str(row["nativeCharacterId"]) / "candidate"
        result = run_json(["node", "--import", "tsx", str(PROMOTER), str(repo), str(candidate), "--apply"], repo)
        default_stage = next(stage for stage in row["stages"] if stage["id"] == "automatic-default")
        default_stage.update(result)
        if result.get("status") not in {"automatic-default-applied", "manual-selection-preserved", "already-promoted"}:
            raise ValueError(f"unexpected promotion result for {row['heroId']}: {result.get('status')}")
        row["automaticDefaultApplied"] = result.get("automaticDefaultApplied") is True
        row["status"] = result["status"]


def invoke_conversion(args: argparse.Namespace, filtered_source: Path) -> tuple[dict[str, Any], Path]:
    if args.conversion_receipt:
        path = args.conversion_receipt.resolve()
        if not path.is_file():
            raise FileNotFoundError(f"conversion receipt does not exist: {path}")
        return read_json(path), path
    conversion_output = args.output.resolve() / "conversion"
    command = [sys.executable, str(GENERIC), "--repo", str(args.repo.resolve()), "--receipt", str(filtered_source), "--output", str(conversion_output), "--mode", args.mode]
    if args.mode == "apply" and args.content:
        command.extend(["--content", str(args.content.resolve())])
    completed = subprocess.run(command, cwd=args.repo.resolve(), text=True, capture_output=True, check=False)
    if completed.returncode not in {0, 2}:
        raise RuntimeError("generic conversion failed:\n" + completed.stdout + completed.stderr)
    receipt_path = conversion_output / "pipeline-receipt.json"
    if not receipt_path.is_file():
        raise RuntimeError("generic conversion did not write its receipt")
    return read_json(receipt_path), receipt_path


def build(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    validate_contract()
    source_path, output = args.source_receipt.resolve(), args.output.resolve()
    if not source_path.is_file():
        value = blocked_receipt(source_path, output, "blocked-no-source-receipt", f"source receipt does not exist: {source_path}")
        value["mode"] = args.mode
        return value, 0 if args.mode == "plan" else 2
    raw = read_json(source_path)
    if raw.get("status") in BLOCKED_UPSTREAM:
        reason = f"upstream source receipt is {raw['status']}"
        value = blocked_receipt(source_path, output, "blocked-upstream-source", reason, {"status": raw["status"], "blockers": raw.get("blockers", [])})
        value["mode"] = args.mode
        value["input"]["sourceReceipt"] = file_record(source_path)
        return value, 0 if args.mode == "plan" else 2
    if raw.get("schema") == "ggd.jstars-priority-six-source-receipt@1":
        reason = (
            "owner archive and seven CPKs are inventoried; materialized extraction is still blocked by "
            "the $CMP/$CH0 complete-decode plus PS3 SRD conversion boundary; all six priority native IDs are proven"
        )
        value = blocked_receipt(
            source_path,
            output,
            "blocked-native-extraction",
            reason,
            {"status": raw.get("status"), "summary": raw.get("summary", {}), "blockers": raw.get("blockers", [])},
        )
        value["mode"] = args.mode
        value["input"]["sourceReceipt"] = file_record(source_path)
        return value, 0 if args.mode == "plan" else 2
    if raw.get("schema") != "ggd.jstars-extraction-receipt@1":
        reason = "materialized priority conversion requires ggd.jstars-extraction-receipt@1"
        value = blocked_receipt(source_path, output, "blocked-unsupported-source-receipt", reason)
        value["mode"] = args.mode
        value["input"]["sourceReceipt"] = file_record(source_path)
        return value, 0 if args.mode == "plan" else 2
    matched, invalid = match_priority(raw)
    filtered_source = output / "pipeline-source-receipt.json"
    write_json(filtered_source, {
        **raw,
        "characters": [matched[target["key"]] for target in PRIORITY if target["key"] in matched],
    })
    conversion, conversion_path = invoke_conversion(args, filtered_source)
    converted = conversion_by_hero(conversion)
    characters = []
    for target in PRIORITY:
        source = matched.get(target["key"])
        characters.append(evaluate_character(target, source, converted.get(source["heroId"]) if source else None))
    if args.mode == "apply":
        if args.content is None or args.content.resolve() != (args.repo.resolve() / "content"):
            raise ValueError("apply registration/default requires --content for this checkout's content directory")
        apply_defaults(args.repo.resolve(), output, characters)
    ready = sum(row["allGatesPassed"] for row in characters)
    applied = sum(row["automaticDefaultApplied"] for row in characters)
    registered = sum(any(stage["id"] == "registration" and stage["status"] == "passed" for stage in row["stages"]) for row in characters)
    source_matched = sum(target["key"] in matched for target in PRIORITY)
    status = "blocked-incomplete-priority-six" if ready != 6 else ("applied-priority-six" if args.mode == "apply" else "ready-priority-six")
    value = {
        "schema": "ggd.jstars-priority-six-pipeline-receipt@1", "pipelineId": "jstars-priority-six-v1",
        "mode": args.mode, "status": status,
        "input": {"sourceReceipt": file_record(source_path), "filteredPrioritySourceReceipt": file_record(filtered_source), "conversionReceipt": file_record(conversion_path), "invalidIdentityRows": invalid},
        "output": str(output), "characters": characters,
        "counts": {"priorityCharacters": 6, "sourceMatched": source_matched, "allGatesPassed": ready, "registeredOptions": registered, "automaticDefaultsApplied": applied},
        "policies": policy_record(), "productionDeploymentVerified": False,
    }
    return value, 0 if args.mode == "plan" or ready == 6 else 2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO)
    parser.add_argument("--source-receipt", type=Path, required=True)
    parser.add_argument("--conversion-receipt", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mode", choices=("plan", "apply"), default="plan")
    parser.add_argument("--content", type=Path)
    args = parser.parse_args()
    try:
        result, code = build(args)
        write_json(args.output.resolve() / "pipeline-receipt.json", result)
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return code
    except Exception as error:
        failure = {"schema": "ggd.jstars-priority-six-pipeline-failure@1", "status": "failed-closed", "error": f"{type(error).__name__}: {error}", "productionDeploymentVerified": False}
        print(json.dumps(failure, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
