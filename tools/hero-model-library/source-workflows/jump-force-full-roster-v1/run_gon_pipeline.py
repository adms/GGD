#!/usr/bin/env python3
"""Report Gon blockers or prepare, verify, and register one source candidate."""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
OPTIONS = HERE / "gon-source-options.json"


def load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def resolve_from_repo(repo: Path, value: str) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else (repo / path).resolve()


def status(repo: Path, option: dict) -> dict:
    receipt = resolve_from_repo(repo, option["extraction"]["receipt"])
    if not option["identityVerified"]:
        state = option["extraction"]["blockedState"]
        next_action = "inventory the owner archive and verify Gon's native character ID before conversion"
    elif not receipt.is_file():
        state = option["extraction"]["blockedState"]
        next_action = option["extraction"]["command"]
    else:
        state = "extraction-receipt-present-awaiting-exported-glb"
        next_action = "export a skinned GLB with named native clips, then pass --source-glb and --selections"
    return {
        "sourceId": option["id"],
        "label": option["label"],
        "nativeCharacterId": option["nativeCharacterId"],
        "identityState": option["identityState"],
        "extractionReceipt": str(receipt),
        "extractionReceiptPresent": receipt.is_file(),
        "state": state,
        "nextAction": next_action,
        "registered": False,
        "runtimeSelectable": False,
        "productionDeployed": False,
    }


def run(command: list[str], cwd: Path) -> dict:
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or f"command failed: {command}")
    return json.loads(completed.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source-id")
    parser.add_argument("--source-glb", type=Path)
    parser.add_argument("--selections", default="auto", help="six-state selection JSON, or 'auto' (default)")
    parser.add_argument("--candidate-root", type=Path)
    parser.add_argument("--apply", action="store_true", help="write verified candidate and register it as a non-default dropdown option")
    args = parser.parse_args()
    repo = args.repo.resolve()
    config = load(OPTIONS)
    options = config["sources"]
    if args.source_id:
        options = [row for row in options if row["id"] == args.source_id]
        if not options:
            raise ValueError(f"unknown source ID: {args.source_id}")
    if args.source_glb is None:
        print(json.dumps({"schema": "ggd.gon-original-game-pipeline-status@1", "heroId": config["heroId"], "sources": [status(repo, row) for row in options]}, ensure_ascii=False, indent=2))
        return 0
    if len(options) != 1 or not args.source_id:
        raise ValueError("--source-glb requires exactly one --source-id")
    option = options[0]
    if not option["identityVerified"]:
        raise ValueError(f"{option['id']} identity is pending; refusing to bind it to {config['heroId']}")
    extraction_receipt = resolve_from_repo(repo, option["extraction"]["receipt"])
    if not extraction_receipt.is_file():
        raise ValueError(f"verified extraction receipt is missing: {extraction_receipt}")
    selections = args.selections if args.selections == "auto" else str(Path(args.selections).resolve())
    candidate_root = (args.candidate_root or repo.parent / "GGD-Asset-Library" / "converted" / "gon-original-game-options" / option["id"].replace(":", "_")).resolve()
    mode = "--apply" if args.apply else "--plan"
    prepared = run([
        "node", "--import", "tsx", str(HERE / "prepare_model_candidate.mts"),
        str(repo), str(args.source_glb.resolve()), str(OPTIONS), option["id"],
        selections, str(candidate_root), mode,
    ], repo)
    if not args.apply:
        print(json.dumps({"status": "plan-only", "preparation": prepared}, ensure_ascii=False, indent=2))
        return 0
    registered = run([
        "node", "--import", "tsx", str(HERE / "register_model_candidate.mts"),
        str(repo), str(candidate_root), "--apply",
    ], repo)
    print(json.dumps({"status": "prepared-verified-registered", "preparation": prepared, "registration": registered}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "blocked", "error": str(error)}, ensure_ascii=False, indent=2))
        raise SystemExit(1)
