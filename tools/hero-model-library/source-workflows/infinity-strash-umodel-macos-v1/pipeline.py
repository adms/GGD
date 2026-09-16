#!/usr/bin/env python3
"""Run resumable Infinity Strash extraction-to-registration modules from one recipe."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


STAGES = ("assemble", "backdrop", "normalize", "runtime", "render", "catalog", "register", "indexes")


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text())


def expand(value: str, roots: dict[str, Path]) -> Path:
    for token, root in roots.items():
        value = value.replace("{" + token + "}", str(root))
    return Path(value).expanduser().resolve()


def run(command: list[str], cwd: Path, plan: bool) -> None:
    print(json.dumps({"run": command}, ensure_ascii=False))
    if not plan:
        subprocess.run(command, cwd=cwd, check=True)


def quarantine_incomplete(path: Path, stage: str, plan: bool) -> Path | None:
    """Preserve an incomplete stage directory so an append-only retry can run."""
    if not path.exists() and not path.is_symlink():
        return None
    failed_root = path.parent / "failed-attempts"
    attempt = 1
    destination = failed_root / f"{path.name}-{stage}-attempt-{attempt}"
    while destination.exists() or destination.is_symlink():
        attempt += 1
        destination = failed_root / f"{path.name}-{stage}-attempt-{attempt}"
    print(json.dumps({"quarantine": stage, "source": str(path), "destination": str(destination)}, ensure_ascii=False))
    if not plan:
        failed_root.mkdir(parents=True, exist_ok=True)
        path.rename(destination)
    return destination


def validate_receipt_file(receipt: Path, field: str) -> bool:
    if not receipt.is_file():
        return False
    row = read(receipt)
    target = Path(row[field]["path"])
    return target.is_file() and target.stat().st_size == row[field]["bytes"] and sha(target) == row[field]["sha256"]


def validate_runtime(root: Path) -> bool:
    receipt = root / "receipt.json"
    if not receipt.is_file():
        return False
    row = read(receipt)["output"]
    return all((root / name).is_file() for name in ("body.glb", "model.json", "uploaded-model.json")) and sha(root / "body.glb") == row["sha256"]


def validate_review(root: Path) -> bool:
    run_receipt = root / "run.json"
    return run_receipt.is_file() and read(run_receipt).get("complete") is True and len(list(root.glob("ggd-state-*.png"))) == 18


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--from-stage", choices=STAGES, default=STAGES[0])
    parser.add_argument("--through", choices=STAGES, default=STAGES[-1])
    parser.add_argument("--candidate", action="append", help="Limit to one or more candidate IDs")
    parser.add_argument("--plan", action="store_true", help="Print commands without executing")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[4]
    workspace = args.workspace.resolve()
    roots = {"repo": repo, "workspace": workspace, "asset": workspace / "GGD-Asset-Library"}
    config = read(args.config.resolve())
    selected = set(args.candidate or [])
    candidates = [row for row in config["candidates"] if not selected or row["id"] in selected]
    if selected - {row["id"] for row in candidates}:
        raise ValueError("unknown candidate selection: " + ", ".join(sorted(selected - {row['id'] for row in candidates})))
    first, last = STAGES.index(args.from_stage), STAGES.index(args.through)
    if first > last:
        raise ValueError("--from-stage must not follow --through")
    blender = str(expand(config["blender"], roots))
    script_root = Path(__file__).resolve().parent

    for stage in STAGES[first:last + 1]:
        if stage in {"catalog", "register", "indexes"}:
            continue
        for row in candidates:
            candidate = row["id"]
            assembly = expand(row["assemblyOutput"], roots)
            backdrop = expand(row["backdropOutput"], roots) if "backdropOutput" in row else None
            normalized = expand(row["normalizedOutput"], roots)
            runtime = expand(row["runtimeOutput"], roots)
            review = expand(row["reviewOutput"], roots)
            if stage == "assemble":
                receipt = assembly / "receipt.json"
                if validate_receipt_file(receipt, "output"):
                    print(json.dumps({"skip": stage, "candidate": candidate, "reason": "receipt-and-sha-verified"}))
                    continue
                quarantine_incomplete(assembly, stage, args.plan)
                assembly.parent.mkdir(parents=True, exist_ok=True)
                command = [blender, "--background", "--python", str(script_root / "assemble_candidate_blender.py"), "--", candidate,
                     "--mesh-root", str(expand(row.get("meshRoot", config["meshRoot"]), roots)), "--mesh-format", "psk",
                     "--material-context-root", str(expand(row.get("materialContextRoot", config["materialContextRoot"]), roots)),
                     "--texture-root", str(expand(row.get("textureRoot", config["textureRoot"]), roots)), "--psa-root", str(expand(row.get("psaRoot", config["psaRoot"]), roots)),
                     "--addon-root", str(expand(config["addonRoot"], roots)), "--output", str(assembly)]
                attachment_root_flags = {
                    "attachmentMeshRoot": "--attachment-mesh-root",
                    "attachmentMaterialContextRoot": "--attachment-material-context-root",
                    "attachmentTextureRoot": "--attachment-texture-root",
                    "attachmentSourceRoot": "--attachment-source-root",
                }
                for name, flag in attachment_root_flags.items():
                    if name in row:
                        command.extend([flag, str(expand(row[name], roots))])
                run(command, repo, args.plan)
            elif stage == "backdrop":
                if backdrop is None:
                    print(json.dumps({"skip": stage, "candidate": candidate, "reason": "no-source-repair-configured"}))
                    continue
                receipt = backdrop / "receipt.json"
                if validate_receipt_file(receipt, "output"):
                    print(json.dumps({"skip": stage, "candidate": candidate, "reason": "receipt-and-sha-verified"}))
                    continue
                quarantine_incomplete(backdrop, stage, args.plan)
                backdrop.parent.mkdir(parents=True, exist_ok=True)
                run(["python3", str(script_root / "repair_texture_backdrops.py"), "repair", "--candidate", candidate,
                     "--input", str(assembly / f"{candidate}.glb"), "--output", str(backdrop / f"{candidate}.glb"),
                     "--receipt", str(receipt)], repo, args.plan)
            elif stage == "normalize":
                receipt = normalized / "ggd-upload.json"
                if validate_receipt_file(receipt, "output"):
                    print(json.dumps({"skip": stage, "candidate": candidate, "reason": "receipt-and-sha-verified"}))
                    continue
                quarantine_incomplete(normalized, stage, args.plan)
                normalized.parent.mkdir(parents=True, exist_ok=True)
                source = (backdrop / f"{candidate}.glb") if backdrop is not None else (assembly / f"{candidate}.glb")
                run(["node", "--import", "tsx", str(script_root / "normalize_validate_candidate.mts"), str(repo), str(source), str(normalized)], repo, args.plan)
            elif stage == "runtime":
                if validate_runtime(runtime):
                    print(json.dumps({"skip": stage, "candidate": candidate, "reason": "receipt-and-sha-verified"}))
                    continue
                quarantine_incomplete(runtime, stage, args.plan)
                runtime.parent.mkdir(parents=True, exist_ok=True)
                sources = list(normalized.glob("*-ggd-normalized.glb"))
                source = sources[0] if sources else normalized / f"{candidate}-ggd-normalized.glb"
                run(["node", "--import", "tsx", str(script_root / "prepare_runtime_candidate.mts"), str(repo), candidate, str(source), str(runtime)], repo, args.plan)
            elif stage == "render":
                if validate_review(review):
                    print(json.dumps({"skip": stage, "candidate": candidate, "reason": "18-images-and-receipt-verified"}))
                    continue
                quarantine_incomplete(review, stage, args.plan)
                review.parent.mkdir(parents=True, exist_ok=True)
                run(["python3", str(script_root / "render_babylon.py"), str(runtime / "body.glb"), str(review), "--model", str(runtime / "uploaded-model.json")], repo, args.plan)

    if first <= STAGES.index("catalog") <= last:
        run(["python3", "tools/hero-model-library/build_priority_runtime_catalog.py"], repo, args.plan)
    if first <= STAGES.index("register") <= last:
        catalog = read(repo / "materials/hero-model-library/priority-runtime-options.json") if not args.plan else {"heroes": []}
        registered = {row["sourceModelKey"] for path in (repo / "content/champions").glob("*.json") if not path.name.startswith("_") for row in read(path).get("modelVersions", [])} if not args.plan else set()
        for row in candidates:
            source_id = "runtime:" + row["catalogCandidateId"]
            option = next((option for hero in catalog.get("heroes", []) if hero["id"] == row["heroId"] for option in hero["options"] if option["sourceId"] == source_id), None)
            if option and option["sourceModelKey"] in registered:
                print(json.dumps({"skip": "register", "candidate": row["id"], "reason": "source-model-already-registered"}))
            else:
                run(["node", "--import", "tsx", "tools/hero-model-library/register-one-source-option.mts", row["heroId"], source_id], repo, args.plan)
    if first <= STAGES.index("indexes") <= last:
        design_root = roots["asset"] / "intake/design-backlog"
        design_root.mkdir(parents=True, exist_ok=True)
        for name in ("ability-analysis.json", "hero-design-coverage-full.json"):
            source = design_root / name
            if source.is_file() and not args.plan:
                destination = design_root / "history" / sha(source) / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                if not destination.exists():
                    shutil.copy2(source, destination)
        for command in config["indexCommands"]:
            expanded = [str(expand(value, roots)) if "{" in value else value for value in command]
            run(expanded, repo, args.plan)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
