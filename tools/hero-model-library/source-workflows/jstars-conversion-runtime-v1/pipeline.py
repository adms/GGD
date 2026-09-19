#!/usr/bin/env python3
"""Fail-closed J-Stars extraction -> conversion -> non-default registration pipeline."""

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
CONTRACT = HERE / "pipeline-contract.json"
STAGE_IDS = [
    "extraction", "model", "texture", "skeleton", "motion",
    "vfx", "sfx", "voice", "model-registration",
]
AUDIO_METADATA_PENDING = {"", "pending", "pending-confirmation", "unknown", None}
OWNER_RECEIPT_SCHEMA = "ggd.jstars-owner-archive-extraction-receipt@1"
OWNER_BLOCKED_STATUSES = {"blocked-archive-not-found", "blocked-archive-listing-failed"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if path.exists() and path.read_text(encoding="utf-8") != encoded:
        raise FileExistsError(f"refusing to overwrite different receipt: {path}")
    path.write_text(encoded, encoding="utf-8")


def file_record(path: Path) -> dict[str, Any]:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def blocked_receipt(receipt_path: Path, output: Path) -> dict[str, Any]:
    reason = f"extraction receipt does not exist: {receipt_path.resolve()}"
    return {
        "schema": "ggd.jstars-conversion-runtime-receipt@1",
        "pipelineId": "jstars-conversion-runtime-v1",
        "mode": "plan",
        "status": "blocked-no-extraction-receipt",
        "input": {"requestedReceipt": str(receipt_path.resolve()), "exists": False},
        "output": str(output.resolve()),
        "stages": [{"id": stage, "status": "blocked", "reason": reason} for stage in STAGE_IDS],
        "characters": [],
        "counts": {"extractedCharacters": 0, "preparedModels": 0, "registeredModels": 0, "runtimeAudioBindings": 0},
        "productionDeploymentVerified": False,
    }


def upstream_blocked_receipt(receipt_path: Path, output: Path, upstream: dict[str, Any], mode: str) -> dict[str, Any]:
    status = str(upstream.get("status", "blocked-upstream"))
    blockers = upstream.get("blockers", [])
    reason = f"upstream extraction lane is {status}"
    return {
        "schema": "ggd.jstars-conversion-runtime-receipt@1",
        "pipelineId": "jstars-conversion-runtime-v1",
        "mode": mode,
        "status": "blocked-upstream-extraction",
        "input": {
            "receipt": file_record(receipt_path),
            "schema": upstream.get("schema"),
            "sourceId": upstream.get("sourceId"),
            "upstreamStatus": status,
            "upstreamBlockers": blockers,
            "upstreamRerunCommand": upstream.get("rerunCommand"),
        },
        "output": str(output.resolve()),
        "stages": [{"id": stage, "status": "blocked", "reason": reason, "upstreamBlockers": blockers} for stage in STAGE_IDS],
        "characters": [],
        "counts": {"identifiedNativeTokens": 0, "extractedCharacters": 0, "preparedModels": 0, "registeredModels": 0, "runtimeAudioBindings": 0},
        "productionDeploymentVerified": False,
    }


def checked_path(root: Path, row: dict[str, Any], label: str) -> Path:
    relative = Path(str(row.get("path", "")))
    if not relative.as_posix() or relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"unsafe {label} path: {relative}")
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise FileNotFoundError(f"missing {label}: {path}")
    expected_bytes, expected_sha = row.get("bytes"), row.get("sha256")
    if path.stat().st_size != expected_bytes or sha256(path) != expected_sha:
        raise ValueError(f"{label} receipt mismatch: {path}")
    return path


def validate_contract() -> dict[str, Any]:
    contract = read_json(CONTRACT)
    if contract.get("schema") != "ggd.jstars-conversion-runtime-contract@1":
        raise ValueError("unexpected pipeline contract schema")
    stages = contract.get("stages", [])
    if [row.get("id") for row in stages] != STAGE_IDS:
        raise ValueError("pipeline stages changed or are out of order")
    available: set[str] = set()
    for row in stages:
        if not set(row.get("dependsOn", [])).issubset(available):
            raise ValueError(f"stage dependency is not ordered: {row.get('id')}")
        available.add(str(row["id"]))
    return contract


def validate_native_receipt(receipt: dict[str, Any]) -> tuple[dict[str, Any], Path, dict[str, Path]]:
    if receipt.get("schema") != "ggd.jstars-extraction-receipt@1":
        raise ValueError("unexpected extraction receipt schema")
    if receipt.get("sourceGame") != "J-Stars Victory VS+":
        raise ValueError("receipt is not J-Stars Victory VS+")
    root = Path(str(receipt.get("extractionRoot", ""))).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"extraction root does not exist: {root}")
    paths: dict[str, Path] = {"archive": checked_path(root, receipt["archive"], "archive")}
    native_ids: set[str] = set()
    for character in receipt.get("characters", []):
        native_id = str(character.get("nativeCharacterId", ""))
        if not native_id or native_id in native_ids:
            raise ValueError(f"missing or duplicate nativeCharacterId: {native_id}")
        native_ids.add(native_id)
        if character.get("identityVerified") is not True:
            raise ValueError(f"identity is not verified: {native_id}")
        artifacts = character.get("artifacts", {})
        runtime_glb = artifacts.get("runtimeGlb")
        if runtime_glb:
            paths[f"{native_id}:runtimeGlb"] = checked_path(root, runtime_glb, f"{native_id} runtimeGlb")
        for kind in ("modelSources", "textures", "skeletons", "motions", "vfx", "sfx", "voice"):
            rows = artifacts.get(kind, [])
            if not isinstance(rows, list):
                raise ValueError(f"{native_id} {kind} must be an array")
            for index, row in enumerate(rows):
                paths[f"{native_id}:{kind}:{index}"] = checked_path(root, row, f"{native_id} {kind}[{index}]")
    receipt["_normalization"] = {"sourceSchema": receipt["schema"], "extractionComplete": True, "containerMembersOnly": False}
    return receipt, root, paths


def member_kind(row: dict[str, Any]) -> str | None:
    value = str(row.get("assetKind", "")).casefold()
    aliases = {
        "model": "modelSources", "model-source": "modelSources", "texture": "textures",
        "skeleton": "skeletons", "rig": "skeletons", "motion": "motions", "animation": "motions",
        "vfx": "vfx", "effect": "vfx", "sfx": "sfx", "sound": "sfx", "voice": "voice",
    }
    return aliases.get(value)


def normalize_owner_receipt(receipt: dict[str, Any]) -> tuple[dict[str, Any], Path, dict[str, Path]]:
    if receipt.get("schema") != OWNER_RECEIPT_SCHEMA:
        raise ValueError("unexpected owner extraction receipt schema")
    source = receipt.get("source")
    if not isinstance(source, dict):
        raise ValueError("owner extraction receipt has no materialized archive source")
    archive = Path(str(source.get("absolutePath", ""))).expanduser().resolve()
    if not archive.is_file():
        raise FileNotFoundError(f"owner archive does not exist: {archive}")
    if archive.stat().st_size != source.get("bytes") or sha256(archive) != source.get("sha256"):
        raise ValueError(f"owner archive receipt mismatch: {archive}")
    root = Path(str(receipt.get("extractionRoot") or archive.parent)).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"owner extraction root does not exist: {root}")
    paths: dict[str, Path] = {"archive": archive}
    top_members = receipt.get("extractedMembers", [])
    if not isinstance(top_members, list):
        raise ValueError("owner extractedMembers must be an array")
    members_by_token: dict[str, list[dict[str, Any]]] = {}
    for row in top_members:
        token = str(row.get("nativeCharacterId") or row.get("token") or "")
        if not token:
            raise ValueError("owner extracted member is missing nativeCharacterId/token")
        members_by_token.setdefault(token, []).append(row)

    characters = []
    for token_row in receipt.get("characterContainerTokens", []):
        token = str(token_row.get("token", ""))
        if not token:
            raise ValueError("owner characterContainerTokens row is missing token")
        rows = [*members_by_token.get(token, []), *token_row.get("extractedMembers", [])]
        artifacts: dict[str, Any] = {
            "modelSources": [], "textures": [], "skeletons": [], "motions": [],
            "vfx": [], "sfx": [], "voice": [],
        }
        runtime_glb = None
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                raise ValueError(f"owner extracted member is not an object: {token}[{index}]")
            relative = row.get("path")
            if relative is None and row.get("absolutePath"):
                absolute = Path(str(row["absolutePath"])).resolve()
                if not absolute.is_relative_to(root):
                    raise ValueError(f"owner extracted member escapes extractionRoot: {absolute}")
                relative = absolute.relative_to(root).as_posix()
            normalized_row = {**row, "path": str(relative or "")}
            path = checked_path(root, normalized_row, f"{token} extracted member[{index}]")
            paths[f"{token}:member:{index}"] = path
            kind = member_kind(normalized_row)
            if str(normalized_row.get("assetKind", "")).casefold() in {"runtime-glb", "rigged-animated-glb"}:
                runtime_glb = normalized_row
            elif kind:
                artifacts[kind].append(normalized_row)
        if runtime_glb:
            artifacts["runtimeGlb"] = runtime_glb
        identity_state = str(token_row.get("identityStatus", ""))
        identity_verified = identity_state in {"verified", "confirmed", "native-character-id-verified"}
        characters.append({
            "nativeCharacterId": token,
            "identityVerified": identity_verified,
            "heroId": token_row.get("heroId"),
            "label": token_row.get("label", f"J-Stars 原作 {token}"),
            "character": token_row.get("character", f"native-token-{token}"),
            "work": token_row.get("work", "identity-pending"),
            "reference": receipt.get("sourceId"),
            "animationSelections": token_row.get("animationSelections"),
            "artifacts": artifacts,
            "containerMembers": [
                {"memberPath": path, "materialized": False}
                for path in token_row.get("samplePaths", [])
            ],
        })
    normalized = {
        "schema": "ggd.jstars-extraction-receipt@1",
        "sourceId": receipt.get("sourceId"),
        "sourceGame": "J-Stars Victory VS+",
        "platform": receipt.get("identification", {}).get("platform", "unconfirmed"),
        "extractionRoot": str(root),
        "archive": {
            "path": archive.relative_to(root).as_posix() if archive.is_relative_to(root) else archive.name,
            "bytes": archive.stat().st_size,
            "sha256": sha256(archive),
        },
        "characters": characters,
        "_normalization": {
            "sourceSchema": OWNER_RECEIPT_SCHEMA,
            "upstreamStatus": receipt.get("status"),
            "extractionComplete": bool(top_members or any(row.get("extractedMembers") for row in receipt.get("characterContainerTokens", []))),
            "containerMembersOnly": not bool(top_members or any(row.get("extractedMembers") for row in receipt.get("characterContainerTokens", []))),
        },
    }
    return normalized, root, paths


def load_and_normalize_receipt(path: Path) -> tuple[dict[str, Any] | None, Path | None, dict[str, Path], dict[str, Any] | None]:
    raw = read_json(path)
    if raw.get("schema") == "ggd.jstars-extraction-receipt@1":
        receipt, root, paths = validate_native_receipt(raw)
        return receipt, root, paths, None
    if raw.get("schema") == OWNER_RECEIPT_SCHEMA:
        if raw.get("status") in OWNER_BLOCKED_STATUSES:
            return None, None, {}, raw
        receipt, root, paths = normalize_owner_receipt(raw)
        return receipt, root, paths, None
    raise ValueError(f"unexpected extraction receipt schema: {raw.get('schema')}")


def run_json(command: list[str], cwd: Path) -> dict[str, Any]:
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError("command failed: " + " ".join(command) + "\n" + completed.stdout + completed.stderr)
    value = json.loads(completed.stdout)
    if not isinstance(value, dict):
        raise ValueError("command did not return a JSON object")
    return value


def audio_stage(kind: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    approved = [
        row for row in rows
        if row.get("reviewDecision") == "approve"
        and row.get("runtimeBindingAuthorized") is True
        and row.get("language") not in AUDIO_METADATA_PENDING
        and row.get("speaker") not in AUDIO_METADATA_PENDING
        and row.get("event") not in AUDIO_METADATA_PENDING
    ]
    # The pipeline inventories verified files but deliberately has no generic
    # event mapper. Approved rows become input for the existing per-title
    # checked binder; everything else remains review-only.
    return {
        "id": kind,
        "status": "verified-candidates-awaiting-checked-binder" if approved else ("verified-unreviewed-no-runtime-binding" if rows else "blocked-no-source-artifacts"),
        "verifiedFiles": len(rows),
        "reviewedAndAuthorizedFiles": len(approved),
        "runtimeBindingsWritten": 0,
        "runtimeBindingAuthorized": False,
    }


def write_character_inputs(output: Path, receipt: dict[str, Any], character: dict[str, Any]) -> tuple[Path, Path]:
    work = output / str(character["nativeCharacterId"]) / "inputs"
    metadata = {
        "schema": "ggd.jstars-runtime-candidate-metadata@1",
        "sourceId": receipt["sourceId"],
        "sourceGame": receipt["sourceGame"],
        "platform": receipt["platform"],
        "nativeCharacterId": character["nativeCharacterId"],
        "identityVerified": character["identityVerified"],
        "heroId": character.get("heroId"),
        "label": character["label"],
        "character": character["character"],
        "work": character["work"],
        "reference": character.get("reference", receipt.get("reference", receipt["sourceId"])),
        "yawOffsetDeg": character.get("yawOffsetDeg", 0),
    }
    metadata_path, selections_path = work / "metadata.json", work / "animation-selections.json"
    write_json(metadata_path, metadata)
    write_json(selections_path, character.get("animationSelections", {}))
    return metadata_path, selections_path


def character_plan(repo: Path, receipt: dict[str, Any], root: Path, character: dict[str, Any], output: Path, mode: str, content: Path | None) -> dict[str, Any]:
    native_id = str(character["nativeCharacterId"])
    artifacts = character.get("artifacts", {})
    result: dict[str, Any] = {
        "nativeCharacterId": native_id,
        "heroId": character.get("heroId"),
        "identityVerified": character.get("identityVerified") is True,
        "containerMembers": character.get("containerMembers", []),
        "stages": [{"id": "extraction", "status": "verified", "sourceId": receipt["sourceId"]}],
        "productionDeploymentVerified": False,
    }
    if character.get("identityVerified") is not True:
        reason = "native container token is inventoried but character identity is not verified"
        result["stages"] = [
            {"id": "extraction", "status": "container-members-normalized-identity-pending", "sourceId": receipt["sourceId"], "memberCount": len(character.get("containerMembers", []))},
            *[{"id": stage, "status": "blocked-unverified-character-identity", "reason": reason} for stage in STAGE_IDS[1:]],
        ]
        return result
    runtime_row = artifacts.get("runtimeGlb")
    selections = character.get("animationSelections")
    if not runtime_row:
        result["stages"].extend([
            {"id": "model", "status": "blocked-no-rigged-animated-glb"},
            {"id": "texture", "status": "blocked-model-not-converted", "verifiedSourceFiles": len(artifacts.get("textures", []))},
            {"id": "skeleton", "status": "blocked-model-not-converted", "verifiedSourceFiles": len(artifacts.get("skeletons", []))},
            {"id": "motion", "status": "blocked-model-not-converted", "verifiedSourceFiles": len(artifacts.get("motions", []))},
        ])
        prepared = False
    elif not isinstance(selections, dict) or set(selections) != {"idle", "run", "attack", "cast", "hurt", "death"}:
        result["stages"].extend([
            {"id": "model", "status": "verified-converted-glb-awaiting-six-state-selection"},
            {"id": "texture", "status": "pending-official-model-preparation"},
            {"id": "skeleton", "status": "pending-official-model-preparation"},
            {"id": "motion", "status": "blocked-missing-six-state-selection"},
        ])
        prepared = False
    elif not character.get("heroId"):
        result["stages"].extend([
            {"id": "model", "status": "verified-converted-glb-awaiting-hero-definition"},
            {"id": "texture", "status": "pending-official-model-preparation"},
            {"id": "skeleton", "status": "pending-official-model-preparation"},
            {"id": "motion", "status": "pending-official-model-preparation"},
        ])
        prepared = False
    else:
        metadata_path, selections_path = write_character_inputs(output, receipt, character)
        candidate_dir = output / native_id / "candidate"
        command = [
            "node", "--import", "tsx", str(HERE / "prepare_runtime_candidate.mts"),
            "--repo", str(repo), "--input", str(checked_path(root, runtime_row, f"{native_id} runtimeGlb")),
            "--selections", str(selections_path), "--metadata", str(metadata_path),
            "--output", str(candidate_dir), "--mode", mode,
        ]
        model = run_json(command, repo)
        prepared = model.get("status") == "prepared-and-officially-verified"
        result["modelCommand"] = command
        result["modelResult"] = model
        result["stages"].extend([
            {"id": "model", "status": "prepared-and-verified" if prepared else model.get("status")},
            {"id": "texture", "status": "normalized-and-verified-max-edge" if prepared else "planned-official-normalization"},
            {"id": "skeleton", "status": "verified-all-primitives-skinned" if prepared else "planned-official-rig-verification"},
            {"id": "motion", "status": "verified-six-state-map" if prepared else "planned-six-state-map"},
        ])
    vfx_rows = artifacts.get("vfx", [])
    result["stages"].append({
        "id": "vfx",
        "status": "verified-source-candidates-no-runtime-binding" if vfx_rows else "blocked-no-source-artifacts",
        "verifiedFiles": len(vfx_rows), "runtimeBindingsWritten": 0,
    })
    result["stages"].append(audio_stage("sfx", artifacts.get("sfx", [])))
    result["stages"].append(audio_stage("voice", artifacts.get("voice", [])))

    registration: dict[str, Any]
    if mode == "apply" and prepared and content is not None:
        expected_content = (repo / "content").resolve()
        if content.resolve() != expected_content:
            raise ValueError("registration must target this checkout's official content directory")
        registration = run_json(["node", "--import", "tsx", str(HERE / "register_model_option.mts"), str(repo), str(output / native_id / "candidate"), "--apply"], repo)
    elif mode == "plan" and character.get("heroId") and runtime_row and isinstance(selections, dict):
        registration = {"status": "planned-after-preparation", "automaticEligible": False}
    else:
        registration = {"status": "blocked-candidate-not-prepared-or-content-not-requested", "automaticEligible": False}
    result["stages"].append({"id": "model-registration", **registration})
    return result


def build(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    repo, receipt_path, output = args.repo.resolve(), args.receipt.resolve(), args.output.resolve()
    contract = validate_contract()
    if not receipt_path.is_file():
        value = blocked_receipt(receipt_path, output)
        return value, 0 if args.mode == "plan" else 2
    receipt, root, paths, upstream_blocked = load_and_normalize_receipt(receipt_path)
    if upstream_blocked is not None:
        return upstream_blocked_receipt(receipt_path, output, upstream_blocked, args.mode), 0 if args.mode == "plan" else 2
    assert receipt is not None and root is not None
    characters = [character_plan(repo, receipt, root, row, output, args.mode, args.content) for row in receipt.get("characters", [])]
    prepared = sum(any(stage["id"] == "model" and stage["status"] == "prepared-and-verified" for stage in row["stages"]) for row in characters)
    registered = sum(any(stage["id"] == "model-registration" and stage.get("status") in {"registered-non-default-independent-option", "already-registered"} for stage in row["stages"]) for row in characters)
    value = {
        "schema": "ggd.jstars-conversion-runtime-receipt@1",
        "pipelineId": contract["pipelineId"], "mode": args.mode,
        "status": "applied-with-stage-results" if args.mode == "apply" else "planned-from-verified-extraction-receipt",
        "input": {
            "receipt": file_record(receipt_path), "archive": file_record(paths["archive"]), "verifiedArtifactFiles": len(paths) - 1,
            "normalization": receipt.get("_normalization"),
        },
        "output": str(output), "characters": characters,
        "counts": {
            "identifiedNativeTokens": len(characters),
            "extractedCharacters": len(characters) if receipt.get("_normalization", {}).get("extractionComplete") else 0,
            "preparedModels": prepared, "registeredModels": registered, "runtimeAudioBindings": 0,
        },
        "policies": {
            "modelOptionsAutomaticEligible": False,
            "audioWithoutPerFileReviewCannotBind": True,
            "vfxRequiresSeparateCheckedEventBinding": True,
            "productionDeploymentIsSeparate": True,
        },
        "productionDeploymentVerified": False,
    }
    return value, 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mode", choices=("plan", "apply"), default="plan")
    parser.add_argument("--content", type=Path)
    args = parser.parse_args()
    if args.mode == "apply" and args.content is None:
        # Conversion may be applied without registration. This is explicit in
        # the resulting registration stage rather than silently mutating content.
        pass
    try:
        result, code = build(args)
        write_json(args.output.resolve() / "pipeline-receipt.json", result)
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return code
    except Exception as error:  # fail loudly with a machine-readable result
        failure = {
            "schema": "ggd.jstars-conversion-runtime-failure@1",
            "status": "failed-closed", "error": f"{type(error).__name__}: {error}",
            "productionDeploymentVerified": False,
        }
        print(json.dumps(failure, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
