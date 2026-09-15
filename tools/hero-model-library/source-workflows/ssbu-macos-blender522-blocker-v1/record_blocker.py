#!/usr/bin/env python3
"""Record and verify the reproducible macOS Blender 5.2.1 SSBU conversion blocker.

This workflow deliberately creates no model component.  It keeps the frozen
Samus c00 source available to later Blender versions and records the actual
tool-init crash, so an empty output directory cannot be mistaken for a failed
or completed asset conversion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
RECEIPT = REPO / "materials/hero-model-library/priority-evidence/ssbu-samus-blender522-macos-blocker-v1/receipt.json"
SOURCE_RELATIVE = Path(
    "intake/public-models-20260910/gitlab-ssbu-models/source-repository/"
    "fighter/samus/model/body/c00/samus-c00.blend"
)
SOURCE_SHA256 = "fa0866aa0ce4b374d352320618721758851e1a1335f8ee0689c36daa61257b6a"
CANDIDATE_ID = "ssbu-samus-c00-static-skinned-v1"
CONVERTER = REPO / "tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pin(path: Path, *, workspace_file: bool = False) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    return {
        "absolutePath" if workspace_file else "gitPath": str(path) if workspace_file else str(path.relative_to(REPO)),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def version(blender: Path) -> str | None:
    result = subprocess.run([str(blender), "--version"], text=True, capture_output=True, check=True)
    return next((line.strip() for line in result.stdout.splitlines() if line.strip().startswith("Blender ")), None)


def expected_command(blender: Path, source: Path, output: Path) -> list[str]:
    return [
        str(blender), "--background", "--factory-startup", "--python", str(CONVERTER), "--",
        str(source), str(output), "--expected-sha256", SOURCE_SHA256,
        "--candidate-id", CANDIDATE_ID,
    ]


def write_receipt(workspace: Path, blender: Path, crash_report: Path) -> dict:
    source = workspace / "GGD-Asset-Library" / SOURCE_RELATIVE
    output = workspace / "GGD-Asset-Library/conversions/ssbu-samus-c00-proof-v1/first"
    if not source.is_file() or sha256(source) != SOURCE_SHA256:
        raise ValueError(f"frozen Samus source missing or changed: {source}")
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"refusing to overwrite a conversion attempt: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    command = expected_command(blender, source, output)
    result = subprocess.run(command, cwd=REPO, text=True, capture_output=True)
    crash = pin(crash_report, workspace_file=True) if crash_report.is_file() else None
    emitted_glb = output / "body.glb"
    if emitted_glb.is_file():
        raise RuntimeError("Blender emitted a GLB; this blocker workflow must be replaced by a conversion workflow")
    if crash is None:
        raise RuntimeError("Blender produced no GLB and no supplied crash report; do not call this a verified blocker")
    crash_text = crash_report.read_text(encoding="utf-8", errors="replace")
    if "gpu" not in crash_text.lower() or "metal" not in crash_text.lower():
        raise RuntimeError("crash report does not establish the expected Blender Metal/GPU initialization blocker")
    archived_crash = output.parent / "blender-5.2.1-crash.txt"
    shutil.copyfile(crash_report, archived_crash)
    if sha256(archived_crash) != crash["sha256"]:
        raise RuntimeError("local crash-report preservation changed the captured bytes")
    receipt = {
        "schema": "ggd-ssbu-macos-blender522-blocker@1",
        "candidateId": CANDIDATE_ID,
        "sourceId": "gitlab-ssbu-models",
        "source": pin(source, workspace_file=True),
        "converter": pin(CONVERTER),
        "blender": {"absolutePath": str(blender), "versionFirstLine": version(blender)},
        "command": command,
        "attempt": {
            "processReturnCode": result.returncode,
            "stdoutSha256": hashlib.sha256(result.stdout.encode()).hexdigest(),
            "stderrSha256": hashlib.sha256(result.stderr.encode()).hexdigest(),
            "outputRoot": str(output),
            "bodyGlbExists": False,
            "crashReport": pin(archived_crash, workspace_file=True),
            "capturedCrashReport": crash,
            "failure": "Blender 5.2.1 crashes in Metal/GPU backend initialization before the converter can open the source; no GLB, conversion receipt, candidate, registration, runtime option, or deployment exists.",
        },
        "status": "blocked-tool-init-crash",
        "converted": False,
        "componentReady": False,
        "runtimeSelectable": False,
        "deployed": False,
        "nextAction": "Re-run this exact source with a supported Blender build that completes --background --factory-startup without the Metal initialization crash, then use the normal Worldblender conversion and visual-review workflow.",
    }
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return receipt


def check(workspace: Path) -> dict:
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    source = workspace / "GGD-Asset-Library" / SOURCE_RELATIVE
    if receipt.get("schema") != "ggd-ssbu-macos-blender522-blocker@1":
        raise ValueError("unexpected receipt schema")
    if receipt.get("candidateId") != CANDIDATE_ID or receipt.get("status") != "blocked-tool-init-crash":
        raise ValueError("receipt does not preserve the blocking state")
    if receipt["source"]["sha256"] != SOURCE_SHA256 or sha256(source) != SOURCE_SHA256:
        raise ValueError("frozen source hash mismatch")
    if receipt["converter"]["sha256"] != sha256(CONVERTER):
        raise ValueError("converter hash drift")
    attempt = receipt["attempt"]
    if attempt["bodyGlbExists"] or receipt["converted"] or receipt["componentReady"] or receipt["runtimeSelectable"] or receipt["deployed"]:
        raise ValueError("a tool blocker must not claim a converted or registered asset")
    crash_report = Path(attempt["crashReport"]["absolutePath"])
    if not crash_report.is_file() or sha256(crash_report) != attempt["crashReport"]["sha256"]:
        raise ValueError("crash report missing or changed")
    if (Path(attempt["outputRoot"]) / "body.glb").is_file():
        raise ValueError("unexpected output GLB exists beside the blocker receipt")
    return {"receipt": str(RECEIPT), "status": receipt["status"], "sourceSha256": SOURCE_SHA256}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--blender", type=Path)
    parser.add_argument("--crash-report", type=Path)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.write == args.check:
        parser.error("choose exactly one of --write or --check")
    workspace = args.workspace.resolve()
    if args.check:
        print(json.dumps(check(workspace), ensure_ascii=False))
        return
    if not args.blender or not args.crash_report:
        parser.error("--write requires --blender and --crash-report")
    print(json.dumps(write_receipt(workspace, args.blender.resolve(), args.crash_report.resolve()), ensure_ascii=False))


if __name__ == "__main__":
    main()
