#!/usr/bin/env python3
"""Run or check the offline KOF XIV asset pipeline from frozen local payloads."""

from __future__ import annotations

import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Any


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
DEFINITION = HERE / "pipeline.json"
EVIDENCE = REPO / "materials/hero-model-library/source-inventories/kof-local-pipeline-v1"
RECEIPT = EVIDENCE / "receipt.json"
ENTRY = EVIDENCE / "current-resource-entry.json"
FRAGMENT = EVIDENCE / "report-fragment.json"
README = EVIDENCE / "README.md"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def file_record(path: Path, *, repo: Path | None = None) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(path)
    record: dict[str, Any] = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    if repo is not None and path.is_relative_to(repo):
        record["gitPath"] = path.relative_to(repo).as_posix()
    else:
        record["absolutePath"] = str(path.resolve())
    return record


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def validate_definition(definition: dict[str, Any]) -> None:
    if definition.get("schema") != "ggd.kof-local-pipeline-definition@1":
        raise ValueError("unexpected KOF pipeline schema")
    stages = definition.get("stages", [])
    ids = [row.get("id") for row in stages]
    if len(ids) != len(set(ids)) or len(ids) != 11:
        raise ValueError("KOF pipeline stages are missing or duplicated")
    available: set[str] = set()
    for row in stages:
        if not set(row.get("dependsOn", [])).issubset(available):
            raise ValueError(f"stage dependency is not ordered: {row.get('id')}")
        available.add(str(row["id"]))
    scope = definition["scope"]
    if scope.get("remoteLibraryReadAllowed") is not False:
        raise ValueError("offline KOF pipeline must not read LV99")
    if scope.get("nativeCharacterIdsWithPayload") != ["MAI", "IOR", "KYO"]:
        raise ValueError("payload scope changed")
    if scope.get("nativeCharacterIdsPathIndexedOnly") != ["TRY"]:
        raise ValueError("path-only scope changed")
    if definition["failClosed"].get("runtimeClaimWithoutConverter") is not False:
        raise ValueError("native KOF formats must fail closed")


def rows_from_gzip(path: Path) -> list[dict[str, Any]]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        rows = [json.loads(line) for line in stream if line.strip()]
    if not all(isinstance(row, dict) for row in rows):
        raise ValueError(f"invalid JSONL rows: {path}")
    return rows


def verify_local_extraction(local_root: Path) -> dict[str, Any]:
    manifest_path = local_root / "source-manifest.json"
    manifest = load_json(manifest_path)
    if manifest.get("schema") != "ggd-kofxiv-priority-extraction@1":
        raise ValueError("unexpected priority extraction manifest")
    if manifest.get("sourceId") != "steam-kofxiv-priority-mai-ior-kyo-build-local-v126":
        raise ValueError("unexpected priority source id")
    index_record = manifest.get("filesIndex", {})
    index_path = local_root / str(index_record.get("path"))
    if file_record(index_path)["sha256"] != index_record.get("sha256"):
        raise ValueError("priority extraction index hash changed")
    rows = rows_from_gzip(index_path)
    if len(rows) != 1088:
        raise ValueError(f"expected 1088 extracted rows, got {len(rows)}")
    checked_bytes = 0
    kinds: Counter[str] = Counter()
    characters: Counter[str] = Counter()
    for row in rows:
        relative = Path(str(row["path"]))
        path = (local_root / "extracted" / relative).resolve()
        if not path.is_relative_to((local_root / "extracted").resolve()) or not path.is_file():
            raise ValueError(f"unsafe or missing KOF payload: {relative}")
        if path.stat().st_size != int(row["bytes"]) or sha256(path) != row["sha256"]:
            raise ValueError(f"KOF payload changed: {relative}")
        checked_bytes += int(row["bytes"])
        characters[str(row["nativeCharacterId"])] += 1
        kinds[str(row["assetKind"])] += 1
    if set(characters) != {"MAI", "IOR", "KYO"}:
        raise ValueError("priority extraction character scope changed")
    return {
        "manifest": file_record(manifest_path),
        "filesIndex": file_record(index_path),
        "verifiedFiles": len(rows),
        "verifiedBytes": checked_bytes,
        "perCharacterFiles": dict(sorted(characters.items())),
        "assetKindCounts": dict(sorted(kinds.items())),
    }


def run_command(repo: Path, command: list[str]) -> dict[str, Any]:
    proc = subprocess.run(command, cwd=repo, text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(
            "KOF pipeline command failed: " + " ".join(command) + "\n" + proc.stdout + proc.stderr
        )
    return {
        "command": command,
        "exitCode": proc.returncode,
        "stdoutLastLine": next((line for line in reversed(proc.stdout.splitlines()) if line.strip()), ""),
    }


def portable_command_record(record: dict[str, Any], repo: Path, workspace: Path) -> dict[str, Any]:
    """Remove checkout-specific prefixes from a command receipt."""
    def normalize(value: Any) -> Any:
        if isinstance(value, str):
            return value.replace(str(repo), "$REPO").replace(str(workspace), "$WORKSPACE")
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if isinstance(value, dict):
            return {key: normalize(item) for key, item in value.items()}
        return value
    return normalize(record)


def validate_texture_manifest(path: Path, expected_files: int) -> dict[str, Any]:
    data = load_json(path)
    rows = data.get("files", [])
    if len(rows) != expected_files:
        raise ValueError(f"unexpected texture candidate count in {path}: {len(rows)}")
    max_edge = 0
    for row in rows:
        output = Path(str(row["outputAbsolutePath"]))
        record = file_record(output)
        if record["bytes"] != row["outputBytes"] or record["sha256"] != row["outputSha256"]:
            raise ValueError(f"texture candidate changed: {output}")
        width = row.get("width", row.get("outputFormat", {}).get("width"))
        height = row.get("height", row.get("outputFormat", {}).get("height"))
        max_edge = max(max_edge, int(width), int(height))
    if max_edge > 256:
        raise ValueError(f"texture candidate exceeds 256 px: {max_edge}")
    return {"manifest": file_record(path), "files": len(rows), "maxEdge": max_edge}


def validate_native_probe(path: Path) -> dict[str, Any]:
    data = load_json(path)
    xiv = data.get("kofXiv", {})
    rows = xiv.get("nativeFiles", [])
    if len(rows) != 18 or xiv.get("assimpAcceptedFiles") != 0 or xiv.get("allMagicVerified") is not True:
        raise ValueError("native KOF format probe no longer matches fail-closed evidence")
    for row in rows:
        source = Path(str(row["absolutePath"]))
        current = file_record(source)
        if current["bytes"] != row["bytes"] or current["sha256"] != row["sha256"]:
            raise ValueError(f"native KOF container changed: {source}")
        if row.get("magicVerified") is not True or row.get("assimp", {}).get("readerAccepted") is not False:
            raise ValueError(f"native KOF reader state changed: {source}")
    states = xiv.get("conversionState", {})
    if not all(str(states.get(key, "")).startswith("blocked-proprietary-") for key in ("modelAndSkeleton", "nativeAnimation", "vfx")):
        raise ValueError("proprietary KOF conversion blocker was lost")
    return {
        "probe": file_record(path),
        "nativeFiles": len(rows),
        "readerAcceptedFiles": 0,
        "conversionState": states,
    }


def validate_review(decisions_path: Path) -> dict[str, Any]:
    data = load_json(decisions_path)
    selected = [
        row for row in data.get("decisions", [])
        if str(row.get("candidateId", "")).startswith(("kofxiv-texture:", "kofxiv-eff:"))
    ]
    counts = Counter(str(row["candidateId"]).split(":", 1)[0] for row in selected)
    if counts != {"kofxiv-texture": 55, "kofxiv-eff": 71}:
        raise ValueError(f"expected 55 KOF textures and 71 KOF EFF review decisions, got {dict(counts)}")
    if any(row.get("decision") != "approve" for row in selected):
        raise ValueError("not all KOF review candidates are owner-approved")
    if any(row.get("runtimeBindingAuthorized") is not False for row in selected):
        raise ValueError("review receipt must not authorize native KOF runtime binding")
    return {
        "receipt": file_record(decisions_path),
        "approvedTextureCandidates": counts["kofxiv-texture"],
        "approvedNativeEffectGroups": counts["kofxiv-eff"],
        "runtimeBindingsAuthorized": 0,
    }


def build_entry(repo: Path, definition: dict[str, Any]) -> dict[str, Any]:
    manifest_path = HERE / "pipeline.json"
    readme_path = EVIDENCE / "README.md"
    return {
        "schema": "ggd.kof-local-pipeline-current-resource@1",
        "pipelineId": definition["pipelineId"],
        "scope": definition["scope"],
        "status": "MAI/IOR/KYO local payload verified and candidates processed; proprietary model/motion/VFX conversion blocked; TRY path-indexed only",
        "manifestGitPath": manifest_path.relative_to(repo).as_posix(),
        "manifestSha256": sha256(manifest_path),
        "receiptGitPath": RECEIPT.relative_to(repo).as_posix(),
        "documentGitPath": readme_path.relative_to(repo).as_posix(),
        "runtimeSelectableModels": 0,
        "runtimeMotionBindings": 0,
        "runtimeVfxBindings": 0,
        "productionDeploymentVerified": False,
    }


def build_fragment() -> dict[str, Any]:
    return {
        "schema": "ggd.kof-local-pipeline-report-fragment@1",
        "title": "KOF 本機自動化管線",
        "summary": {
            "payloadCharacters": 3,
            "pathIndexedOnlyCharacters": 1,
            "verifiedPayloadFiles": 1088,
            "decodedAudioFiles": 474,
            "baseTextureCandidates": 14,
            "vfxTextureCandidates": 55,
            "ownerApprovedVfxTextureCandidates": 55,
            "ownerApprovedNativeEffectGroups": 71,
            "nativeFormatProbeFiles": 18,
            "nativeFormatReaderAcceptedFiles": 0,
            "runtimeSelectableModels": 0,
            "runtimeMotionBindings": 0,
            "runtimeVfxBindings": 0,
            "productionDeployments": 0
        },
        "blockers": [
            "MAI/IOR/KYO 的 OBAC/OMIR/OSEC 尚無經稽核 reader，模型與骨架不能宣稱已轉換。",
            "MAI/IOR/KYO 的 OTRA 尚無經稽核 reader，原生動作不能宣稱已轉換。",
            "71 個 EFF 群組與 55 張 VFX 貼圖已核准，但混合、時序、掛點與技能事件尚未重建，不能建立 runtime VFX 綁定。",
            "TRY 只有 375 筆 WAD 路徑索引，payload 仍是 0。"
        ]
    }


def build_receipt(repo: Path, workspace: Path, *, execute_tools: bool) -> dict[str, Any]:
    definition = load_json(DEFINITION)
    validate_definition(definition)
    paths = definition["paths"]
    priority_root = workspace / paths["priorityLocalRoot"]
    priority_evidence = repo / paths["priorityEvidence"]
    kof3d = repo / paths["kof3dEvidence"]
    coverage = repo / paths["coverageEvidence"]
    terry = repo / paths["terryEvidence"]
    extraction = verify_local_extraction(priority_root)

    commands: list[dict[str, Any]] = []
    if execute_tools:
        commands.extend([
            run_command(repo, [sys.executable, str(HERE.parent / "kof-xiv-priority-v1/audit_audio.py"), "--root", str(priority_root), "--check"]),
            run_command(repo, [sys.executable, str(HERE.parent / "kof-3d-sources-v1/convert_xiv_textures.py"), "--repo", str(repo), "--workspace", str(workspace), "--check"]),
            run_command(repo, [sys.executable, str(HERE.parent / "kof-jump-container-coverage-v1/convert_kof_xiv_vfx_textures.py"), "--repo", str(repo), "--workspace", str(workspace), "--check"]),
            run_command(repo, [sys.executable, str(HERE.parent / "kof-jump-container-coverage-v1/probe_kof_xiv_effects.py"), "--repo", str(repo), "--workspace", str(workspace)]),
            run_command(repo, [sys.executable, str(HERE.parent / "kof-3d-sources-v1/build_inventory.py"), "--repo", str(repo), "--workspace", str(workspace), "--check"]),
            run_command(repo, [sys.executable, str(HERE.parent / "kof-xiv-terry-path-index-v1/build_inventory.py"), "--repo", str(repo), "--workspace", str(workspace), "--check"]),
        ])
        commands = [portable_command_record(row, repo, workspace) for row in commands]

    audio = load_json(priority_evidence / "audio-analysis-v2.json")
    if audio.get("fileCount") != 474 or audio.get("decodeToNullPassed") is not True:
        raise ValueError("KOF audio decode evidence is incomplete")
    base_textures = validate_texture_manifest(kof3d / "texture-candidates.json", 14)
    vfx_textures = validate_texture_manifest(coverage / "vfx-texture-candidates.json", 55)
    effect_mapping = load_json(coverage / "effect-mapping.json")
    effect_summary = effect_mapping.get("summary", {})
    if effect_summary.get("sourceNativeEffectGroups") != 71 or effect_summary.get("ggdRuntimeVfxCandidates") != 0:
        raise ValueError("KOF native effect mapping changed or overclaims runtime conversion")
    native_probe = validate_native_probe(kof3d / "conversion-probe.json")
    review = validate_review(repo / paths["ownerDecisions"])
    terry_inventory = load_json(terry / "inventory.json")
    terry_summary = terry_inventory.get("summary", {})
    if (
        terry_summary.get("pathIndexedFiles") != 375
        or terry_summary.get("payloadFilesReadThisRun") != 0
        or terry_summary.get("convertedFiles") != 0
        or terry_summary.get("backendOptions") != 0
    ):
        raise ValueError("TRY must remain path-indexed only until payload is acquired")
    downloads = load_json(repo / "materials/hero-model-library/download-sources.json")
    source_rows = [row for row in downloads.get("publicSources", []) if row.get("id") in definition["scope"]["sourceIds"]]
    if {row.get("id") for row in source_rows} != set(definition["scope"]["sourceIds"]):
        raise ValueError("KOF source registration is incomplete")
    if any(row.get("backendIntegration", {}).get("selectionVerified") is not False for row in source_rows):
        raise ValueError("KOF source registration overclaims backend selection")

    entry = build_entry(repo, definition)
    fragment = build_fragment()
    return {
        "schema": "ggd.kof-local-pipeline-receipt@1",
        "pipelineId": definition["pipelineId"],
        "definition": file_record(DEFINITION, repo=repo),
        "scope": definition["scope"],
        "stages": [
            {"id": "source-verify", "status": "passed-local-only", "inputs": [extraction["manifest"]], "outputs": [extraction["filesIndex"]]},
            {"id": "extract-reuse", "status": "passed-rehashed-existing-extraction", "inputs": [extraction["filesIndex"]], "outputs": [{"sha256": extraction["filesIndex"]["sha256"], "verifiedFiles": extraction["verifiedFiles"], "verifiedBytes": extraction["verifiedBytes"], "perCharacterFiles": extraction["perCharacterFiles"], "assetKindCounts": extraction["assetKindCounts"]}]},
            {"id": "texture", "status": "converted-review-candidates", "inputs": [file_record(priority_evidence / "files.jsonl.gz", repo=repo)], "outputs": [base_textures["manifest"], vfx_textures["manifest"]], "summary": {"base": base_textures, "vfx": vfx_textures}},
            {"id": "audio", "status": "decoded-source-labels-unreviewed-for-binding", "inputs": [file_record(priority_evidence / "audio-files.jsonl.gz", repo=repo)], "outputs": [file_record(priority_evidence / "audio-analysis-v2.json", repo=repo)], "decodedFiles": 474},
            {"id": "vfx", "status": "owner-approved-support-components-runtime-reconstruction-blocked", "inputs": [vfx_textures["manifest"]], "outputs": [file_record(coverage / "effect-mapping.json", repo=repo)], "nativeEffectGroups": 71, "runtimeVfxCandidates": 0},
            {"id": "native-format-probe", "status": "blocked-no-audited-reader", "inputs": [extraction["filesIndex"]], "outputs": [native_probe["probe"]], "summary": native_probe},
            {"id": "policy", "status": "texture-pass-model-motion-vfx-not-eligible", "inputs": [file_record(repo / "packages/shared/src/content/modelUpload/adoptionPolicy.json", repo=repo), native_probe["probe"]], "outputs": [file_record(kof3d / "inventory.json", repo=repo)], "runtimeEligibleModels": 0},
            {"id": "review", "status": "owner-approved-runtime-binding-not-authorized", "inputs": [file_record(coverage / "effect-mapping.json", repo=repo)], "outputs": [review["receipt"]], "summary": review},
            {"id": "register", "status": "source-registered-conversion-pending", "inputs": [file_record(priority_evidence / "source-manifest.json", repo=repo), file_record(terry / "inventory.json", repo=repo)], "outputs": [file_record(repo / "materials/hero-model-library/download-sources.json", repo=repo)], "registeredSourceIds": sorted(row["id"] for row in source_rows), "backendSelectableModels": 0},
            {"id": "index", "status": "entry-generated", "inputs": [file_record(kof3d / "inventory.json", repo=repo), file_record(terry / "inventory.json", repo=repo)], "outputs": [{"sha256": hashlib.sha256((json.dumps(entry, ensure_ascii=False, indent=2) + "\n").encode()).hexdigest(), "gitPath": ENTRY.relative_to(repo).as_posix()}]},
            {"id": "report", "status": "fragment-generated", "inputs": [{"sha256": hashlib.sha256((json.dumps(entry, ensure_ascii=False, indent=2) + "\n").encode()).hexdigest(), "gitPath": ENTRY.relative_to(repo).as_posix()}], "outputs": [{"sha256": hashlib.sha256((json.dumps(fragment, ensure_ascii=False, indent=2) + "\n").encode()).hexdigest(), "gitPath": FRAGMENT.relative_to(repo).as_posix()}]}
        ],
        "commands": commands,
        "summary": fragment["summary"],
        "blockers": fragment["blockers"],
        "claims": {
            "localSourcePayloadCompleteFor": ["MAI", "IOR", "KYO"],
            "pathIndexedOnly": ["TRY"],
            "convertedRuntimeModels": 0,
            "convertedNativeMotionClips": 0,
            "convertedRuntimeVfx": 0,
            "backendSelectableModels": 0,
            "productionDeploymentVerified": False
        }
    }


def render_readme() -> str:
    return """# KOF local pipeline v1

This manifest-driven workflow reuses only local, hashed KOF XIV payloads for
MAI, IOR and KYO plus the frozen TRY path index. It does not read LV99 or any
network share. Every stage records input/output SHA-256 in `receipt.json`.

Run all safe local probes and rewrite deterministic evidence:

```bash
python3 tools/hero-model-library/source-workflows/kof-local-pipeline-v1/run.py --workspace ..
```

Re-run the probes and require byte-identical evidence and generated indexes:

```bash
python3 tools/hero-model-library/source-workflows/kof-local-pipeline-v1/run.py --workspace .. --check
```

Apply the existing source integrations and fixed generators before writing the
receipt. This mode remains offline and never invokes the WAD extractor:

```bash
python3 tools/hero-model-library/source-workflows/kof-local-pipeline-v1/run.py \
  --workspace .. --apply --git-link-root ../GGD-pr1152-next
```

The current MAI/IOR/KYO model, skeleton and motion containers remain blocked:
no audited reader accepts OBAC/OMIR/OSEC/OTRA. The 55 converted VFX textures and
71 native effect groups are owner-approved review inputs, while runtime blend,
timing, attachment and skill binding remain unimplemented. TRY has path metadata
only. The pipeline deliberately reports zero converted runtime models, native
motion clips, runtime VFX bindings and production deployments.
"""


def write_or_check(path: Path, value: str, check: bool) -> None:
    if check:
        if not path.is_file() or path.read_text(encoding="utf-8") != value:
            raise SystemExit(f"generated KOF pipeline evidence is stale: {path}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")


def run_apply(repo: Path, workspace: Path, git_link_root: Path) -> list[dict[str, Any]]:
    downloads = load_json(repo / "materials/hero-model-library/download-sources.json")
    registered = {row.get("id") for row in downloads.get("publicSources", [])}
    commands: list[list[str]] = []
    if "steam-kofxiv-priority-mai-ior-kyo-build-local-v126" not in registered:
        commands.append([sys.executable, str(HERE.parent / "kof-xiv-priority-v1/integrate.py"), "--workspace", str(workspace)])
    if "steam-kofxiv-terry-path-index-v1" not in registered:
        commands.append([sys.executable, str(HERE.parent / "kof-xiv-terry-path-index-v1/integrate.py"), "--repo", str(repo), "--workspace", str(workspace)])
    commands.extend([
        [sys.executable, str(repo / "tools/hero-model-library/inventory.py"), "--workspace", str(workspace)],
        [sys.executable, str(repo / "tools/hero-model-library/build_model_design_backlog.py"), "--workspace", str(workspace)],
        [sys.executable, str(HERE.parent / "kof-xiv-terry-path-index-v1/build_inventory.py"), "--repo", str(repo), "--workspace", str(workspace)],
        [sys.executable, str(HERE.parent / "kof-3d-sources-v1/build_inventory.py"), "--repo", str(repo), "--workspace", str(workspace)],
        [sys.executable, str(HERE.parent / "kof-3d-sources-v1/update_four_day_report.py"), "--write"],
        [sys.executable, str(HERE.parent / "kof-xiv-terry-path-index-v1/update_four_day_report.py"), "--write"],
    ])
    return [run_command(repo, command) for command in commands]


def run_generated_checks(repo: Path, workspace: Path, git_link_root: Path) -> list[dict[str, Any]]:
    commands = [
        [sys.executable, str(HERE.parent / "kof-3d-sources-v1/update_four_day_report.py")],
        [sys.executable, str(HERE.parent / "kof-xiv-terry-path-index-v1/update_four_day_report.py")],
        [sys.executable, str(HERE / "update_report.py")],
        [sys.executable, str(repo / "tools/hero-model-library/current_resource_index.py"), "--check", "--git-link-root", str(git_link_root)],
    ]
    return [run_command(repo, command) for command in commands]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=REPO)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--git-link-root", type=Path)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve()
    git_link_root = args.git_link_root.resolve() if args.git_link_root else repo
    if args.check and args.apply:
        raise ValueError("--check and --apply are mutually exclusive")

    if args.apply:
        run_apply(repo, workspace, git_link_root)
    definition = load_json(DEFINITION)
    entry = build_entry(repo, definition)
    fragment = build_fragment()
    write_or_check(ENTRY, json.dumps(entry, ensure_ascii=False, indent=2) + "\n", args.check)
    write_or_check(FRAGMENT, json.dumps(fragment, ensure_ascii=False, indent=2) + "\n", args.check)
    write_or_check(README, render_readme(), args.check)
    receipt = build_receipt(repo, workspace, execute_tools=True)
    write_or_check(RECEIPT, json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", args.check)

    if not args.check:
        run_command(repo, [sys.executable, str(HERE / "update_report.py"), "--write"])
        run_command(repo, [sys.executable, str(repo / "tools/hero-model-library/current_resource_index.py"), "--git-link-root", str(git_link_root)])
    checks = run_generated_checks(repo, workspace, git_link_root)
    print(json.dumps({
        "pipelineId": definition["pipelineId"],
        "check": args.check,
        "apply": args.apply,
        "stages": len(receipt["stages"]),
        "verifiedPayloadFiles": receipt["summary"]["verifiedPayloadFiles"],
        "ownerApprovedReviewItems": receipt["summary"]["ownerApprovedVfxTextureCandidates"] + receipt["summary"]["ownerApprovedNativeEffectGroups"],
        "runtimeSelectableModels": 0,
        "generatedChecks": len(checks),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
