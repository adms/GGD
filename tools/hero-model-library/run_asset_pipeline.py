#!/usr/bin/env python3
"""Run the local multi-source asset pipeline from its checked-in manifest.

The runner has no shell, network, AWS, Git mutation, or deployment capability.
Runtime registration is limited to mapped, qualified, candidate-only source
stages declared in the manifest. Source-specific tools retain fail-closed gates.
Check mode may run independent stages concurrently; refresh mode stays sequential
because several generators share the fixed central indexes.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import time
from typing import Any


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
WORKSPACE = REPO.parent
ASSET_ROOT = WORKSPACE / "GGD-Asset-Library"
DEFAULT_MANIFEST = HERE / "asset-pipeline-v1.json"
ALLOWED_EXECUTABLES = {"python3", "node"}
FORBIDDEN_COMMAND_TOKENS = {"aws", "curl", "git", "scp", "ssh"}


def load_manifest(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("pipeline manifest must be a JSON object")
    validate_manifest(value)
    return value


def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("schema") != "ggd.asset-library-pipeline@1":
        raise ValueError("unexpected asset pipeline schema")
    scope = manifest.get("scope", {})
    for key in ("remoteLibraryReadAllowed", "networkAccessAllowed", "awsAccessAllowed"):
        if scope.get(key) is not False:
            raise ValueError(f"local pipeline must keep {key}=false")
    if scope.get("runtimeRegistrationAllowed") != "mapped-qualified-candidate-only":
        raise ValueError("runtime registration must stay mapped-qualified-candidate-only")
    if scope.get("repeatedCharacterPolicy") != "source-index-only-no-conversion-or-registration":
        raise ValueError("repeated character policy must stay index-only")
    stages = manifest.get("stages")
    if not isinstance(stages, list) or not stages:
        raise ValueError("asset pipeline has no stages")
    ids = [row.get("id") for row in stages]
    if not all(isinstance(value, str) and value for value in ids) or len(ids) != len(set(ids)):
        raise ValueError("asset pipeline stage IDs are missing or duplicated")
    known = set(ids)
    for row in stages:
        if row.get("source") not in scope.get("sources", []):
            raise ValueError(f"unknown source for stage {row['id']}")
        deps = row.get("dependsOn", [])
        if not isinstance(deps, list) or not set(deps).issubset(known):
            raise ValueError(f"invalid dependencies for stage {row['id']}")
        if row["id"] in deps:
            raise ValueError(f"stage depends on itself: {row['id']}")
        for mode in ("checkCommand", "refreshCommand"):
            command = row.get(mode)
            if not isinstance(command, list) or not command or command[0] not in ALLOWED_EXECUTABLES:
                raise ValueError(f"unsafe or missing {mode} for stage {row['id']}")
            if any(not isinstance(part, str) or not part for part in command):
                raise ValueError(f"invalid command token for stage {row['id']}")
            lowered = {part.lower() for part in command}
            if lowered & FORBIDDEN_COMMAND_TOKENS or any("http://" in part.lower() or "https://" in part.lower() or "s3://" in part.lower() for part in command):
                raise ValueError(f"network or Git command is forbidden in stage {row['id']}")
            if command[0] == "python3":
                script = Path(command[1])
            elif command[:3] == ["node", "--import", "tsx"] and len(command) >= 4:
                script = Path(command[3])
            else:
                raise ValueError(f"unsupported command form for stage {row['id']}")
            if script.is_absolute() or ".." in script.parts or script.parts[:2] != ("tools", "hero-model-library"):
                raise ValueError(f"stage must invoke a checked-in hero-model-library tool: {row['id']}")
    ordered_stage_ids(manifest)


def ordered_stage_ids(manifest: dict[str, Any]) -> list[str]:
    rows = {row["id"]: row for row in manifest["stages"]}
    pending = set(rows)
    ordered: list[str] = []
    while pending:
        ready = sorted(stage_id for stage_id in pending if set(rows[stage_id]["dependsOn"]).issubset(ordered))
        if not ready:
            raise ValueError("asset pipeline dependencies contain a cycle")
        ordered.extend(ready)
        pending.difference_update(ready)
    return ordered


def select_stages(manifest: dict[str, Any], sources: set[str], include_deep: bool) -> list[dict[str, Any]]:
    rows = {row["id"]: row for row in manifest["stages"]}
    chosen = {
        row["id"] for row in manifest["stages"]
        if row["source"] in sources and (include_deep or row.get("tier") != "deep")
    }
    stack = list(chosen)
    while stack:
        current = stack.pop()
        for dependency in rows[current]["dependsOn"]:
            if dependency not in chosen and (include_deep or rows[dependency].get("tier") != "deep"):
                chosen.add(dependency)
                stack.append(dependency)
    return [rows[stage_id] for stage_id in ordered_stage_ids(manifest) if stage_id in chosen]


def expand_command(command: list[str], repo: Path, workspace: Path, asset_root: Path) -> list[str]:
    replacements = {
        "$REPO": str(repo.resolve()),
        "$WORKSPACE": str(workspace.resolve()),
        "$ASSET_ROOT": str(asset_root.resolve()),
    }
    expanded = []
    for part in command:
        for token, value in replacements.items():
            part = part.replace(token, value)
        expanded.append(part)
    if expanded[0] == "python3":
        expanded[0] = sys.executable
    return expanded


def run_stage(stage: dict[str, Any], mode: str, repo: Path, workspace: Path, asset_root: Path) -> dict[str, Any]:
    command = expand_command(stage[f"{mode}Command"], repo, workspace, asset_root)
    started = time.monotonic()
    completed = subprocess.run(command, cwd=repo, text=True, capture_output=True, check=False)
    elapsed_ms = round((time.monotonic() - started) * 1000)
    output = (completed.stdout + completed.stderr).strip().splitlines()
    return {
        "id": stage["id"],
        "source": stage["source"],
        "tier": stage.get("tier", "normal"),
        "command": ["python3" if index == 0 and stage[f"{mode}Command"][0] == "python3" else part for index, part in enumerate(command)],
        "exitCode": completed.returncode,
        "elapsedMs": elapsed_ms,
        "outputTail": output[-12:],
    }


def execute(stages: list[dict[str, Any]], mode: str, jobs: int, repo: Path, workspace: Path, asset_root: Path) -> list[dict[str, Any]]:
    if mode == "refresh":
        results = []
        for stage in stages:
            result = run_stage(stage, mode, repo, workspace, asset_root)
            results.append(result)
            if result["exitCode"] != 0:
                break
        return results

    pending = {row["id"]: row for row in stages}
    selected = set(pending)
    completed_ids: set[str] = set()
    failed_ids: set[str] = set()
    results: list[dict[str, Any]] = []
    while pending:
        ready = [
            row for row in pending.values()
            if set(row["dependsOn"]) & selected <= completed_ids
            and not set(row["dependsOn"]) & failed_ids
        ]
        if not ready:
            for stage_id in sorted(pending):
                row = pending[stage_id]
                results.append({"id": stage_id, "source": row["source"], "tier": row.get("tier", "normal"), "exitCode": None, "status": "skipped-dependency-failed"})
            break
        with ThreadPoolExecutor(max_workers=max(1, min(jobs, len(ready)))) as pool:
            futures = {pool.submit(run_stage, row, mode, repo, workspace, asset_root): row for row in ready}
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
                if result["exitCode"] == 0:
                    completed_ids.add(result["id"])
                else:
                    failed_ids.add(result["id"])
                pending.pop(result["id"], None)
    order = {row["id"]: index for index, row in enumerate(stages)}
    return sorted(results, key=lambda row: order[row["id"]])


def portable_receipt(receipt: dict[str, Any], repo: Path, workspace: Path, asset_root: Path) -> dict[str, Any]:
    roots = ((asset_root, "$ASSET_ROOT"), (repo, "$REPO"), (workspace, "$WORKSPACE"))
    replacements = sorted(
        {(str(path), token) for path, token in roots} | {(str(path.resolve()), token) for path, token in roots},
        key=lambda item: len(item[0]),
        reverse=True,
    )
    def replace(value: Any) -> Any:
        if isinstance(value, str):
            for source, target in replacements:
                value = value.replace(source, target)
            return value
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, dict):
            return {key: replace(item) for key, item in value.items()}
        return value
    return replace(receipt)


def passed_stage_ids(path: Path, pipeline_id: str, mode: str) -> set[str]:
    prior = json.loads(path.read_text(encoding="utf-8"))
    if prior.get("schema") != "ggd.asset-library-pipeline-run@1" or prior.get("pipelineId") != pipeline_id:
        raise ValueError("resume receipt belongs to a different pipeline")
    if prior.get("mode") != mode:
        raise ValueError("resume receipt mode does not match this run")
    return set(prior.get("previouslyPassedStages", [])) | {
        row["id"] for row in prior.get("results", []) if row.get("exitCode") == 0
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--mode", choices=("check", "refresh"), default="check")
    parser.add_argument("--source", action="append", dest="sources", help="limit to a source group; repeatable")
    parser.add_argument("--include-deep", action="store_true", help="also re-hash large preserved source mirrors")
    parser.add_argument("--jobs", type=int, default=4, help="parallel workers in check mode")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--receipt", type=Path, help="optional local JSON run receipt")
    parser.add_argument("--resume-receipt", type=Path,
                        help="skip stages recorded as passed by an earlier run of the same pipeline and mode")
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error("--jobs must be at least 1")

    manifest = load_manifest(args.manifest.resolve())
    available = set(manifest["scope"]["sources"])
    sources = set(args.sources or available)
    unknown = sources - available
    if unknown:
        parser.error("unknown --source: " + ", ".join(sorted(unknown)))
    stages = select_stages(manifest, sources, args.include_deep)
    resumed_ids: set[str] = set()
    if args.resume_receipt:
        resumed_ids = passed_stage_ids(args.resume_receipt.resolve(), manifest["pipelineId"], args.mode)
        selected_ids = {row["id"] for row in stages}
        resumed_ids &= selected_ids
        stages = [row for row in stages if row["id"] not in resumed_ids]
    if args.dry_run:
        for stage in stages:
            print(json.dumps({"id": stage["id"], "source": stage["source"], "command": expand_command(stage[f"{args.mode}Command"], REPO, WORKSPACE, ASSET_ROOT)}, ensure_ascii=False))
        return 0

    started_at = datetime.now(timezone.utc).isoformat()
    results = execute(stages, args.mode, args.jobs, REPO, WORKSPACE, ASSET_ROOT)
    failed = [row["id"] for row in results if row.get("exitCode") not in (0,)]
    receipt = portable_receipt({
        "schema": "ggd.asset-library-pipeline-run@1",
        "pipelineId": manifest["pipelineId"],
        "mode": args.mode,
        "startedAt": started_at,
        "finishedAt": datetime.now(timezone.utc).isoformat(),
        "sources": sorted(sources),
        "includeDeep": args.include_deep,
        "resumedFrom": str(args.resume_receipt.resolve()) if args.resume_receipt else None,
        "previouslyPassedStages": sorted(resumed_ids),
        "summary": {"stages": len(results), "passed": sum(row.get("exitCode") == 0 for row in results), "failedOrSkipped": len(failed)},
        "results": results,
    }, REPO, WORKSPACE, ASSET_ROOT)
    rendered = json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
    if args.receipt:
        destination = args.receipt.resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
