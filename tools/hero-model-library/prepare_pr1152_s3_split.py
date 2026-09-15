#!/usr/bin/env python3
"""Plan, finalize, verify and restore the #1252 PR 1152 S3 preparation split."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUCKET = "ggd-390630837668-ap-east-2-an"
PREFIX = "legacy/pr1152-preparation-split-v1"
ASSET_README = ROOT / "materials/asset-library/README.md"
README_START = "<!-- generated:pr1152-s3-split:start -->"
README_END = "<!-- generated:pr1152-s3-split:end -->"
README_BOUNDARY = "## 模型怎麼拿"
FOUR_DAY_REPORT = ROOT / "materials/hero-model-library/近四日新增模型動作特效清單.md"
REPORT_TITLE = "# 2026-09-11～2026-09-15 新增模型、動作、特效與語音清單"
REPORT_START = "<!-- generated:pr1152-s3-split:start -->"
REPORT_END = "<!-- generated:pr1152-s3-split:end -->"
REPORT_BOUNDARY = "## 九、主要證據入口"
TARGET_BRANCH = "codex/hero-model-library-options-clean"
LEGACY_REPORT_BRANCH_LINE = "本頁所有「可切換」目前都只到 `codex/hero-model-library-options`／PR #1152 的功能分支；**正式站部署驗證仍是 0**。"
TARGET_REPORT_BRANCH_LINE = f"本頁所有「可切換」目前都只到 `{TARGET_BRANCH}` 的待合併功能分支；**正式站部署驗證仍是 0**。"
PREPARATION_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp", ".wav", ".mp3", ".mp4", ".glb", ".jsonl.gz")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_references(repo: Path) -> set[str]:
    references: set[str] = set()
    for path in (repo / "content/models").glob("*.json"):
        try:
            model = json.loads(path.read_text())
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        glb_path = model.get("glbPath")
        if isinstance(glb_path, str):
            references.add("content/" + glb_path.lstrip("/"))
    return references


def added_paths(repo: Path, base: str) -> list[str]:
    output = subprocess.check_output(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=A", base, "--"],
        cwd=repo,
        text=True,
    )
    return [row for row in output.splitlines() if row]


def plan(repo: Path, base: str, output: Path) -> dict:
    references = model_references(repo)
    added = added_paths(repo, base)
    unreferenced_models = {
        path for path in added
        if path.startswith("content/assets/models/community/")
        and path.endswith(".glb")
        and path not in references
    }
    preparation_evidence = {
        path for path in added
        if path.startswith("materials/hero-model-library/priority-evidence/")
        and path.lower().endswith(PREPARATION_SUFFIXES)
    }
    selected = sorted(unreferenced_models | preparation_evidence)
    if not selected:
        raise ValueError("S3 split selection is empty")
    output = output.resolve()
    if output == repo or output.is_relative_to(repo):
        raise ValueError("local split staging must be outside the Git repository")
    payload = output / "payload"
    if payload.exists():
        raise ValueError("split payload already exists; preserve it and use a new output directory")
    records = []
    for relative in selected:
        source = repo / relative
        target = payload / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        records.append({
            "repoPath": relative,
            "archiveMember": relative,
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
            "storageRole": "unreferenced-model-component" if relative in unreferenced_models else "preparation-evidence",
        })
    result = {
        "schema": "ggd.pr1152-s3-split-plan@1",
        "base": subprocess.check_output(["git", "rev-parse", base], cwd=repo, text=True).strip(),
        "payloadRoot": str(payload),
        "prefix": PREFIX,
        "summary": {
            "files": len(records),
            "bytes": sum(row["bytes"] for row in records),
            "unreferencedModelComponents": len(unreferenced_models),
            "preparationEvidenceFiles": len(preparation_evidence),
        },
        "files": records,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "plan.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def finalize(plan_path: Path, receipt_path: Path, output: Path) -> dict:
    plan_data = json.loads(plan_path.read_text())
    receipt = json.loads(receipt_path.read_text())
    if (
        plan_data.get("schema") != "ggd.pr1152-s3-split-plan@1"
        or receipt.get("schema") != "ggd-intake-backup-receipt@1"
        or receipt.get("fullGetVerified") is not True
        or receipt.get("allMemberSha256Verified") is not True
        or receipt.get("localUnchanged") is not True
        or f"s3://{BUCKET}/{PREFIX}/" not in receipt.get("s3Uri", "")
        or "assumed-role/vibe-coding-s3-role/" not in receipt.get("callerArn", "")
    ):
        raise ValueError("S3 split receipt is absent, incomplete or outside the authorized boundary")
    backup_manifest = json.loads(Path(receipt["manifest"]).read_text())
    expected = [
        {"path": row["archiveMember"], "bytes": row["bytes"], "sha256": row["sha256"]}
        for row in plan_data["files"]
    ]
    if backup_manifest.get("files") != expected:
        raise ValueError("S3 archive members differ from the split plan")
    git_glbs = added_git_glbs(ROOT, plan_data["base"])
    result = {
        "schema": "ggd.pr1152-s3-preparation-split@1",
        "decisionIssue": "https://github.com/adms/GGD/issues/1252",
        "baseCommit": plan_data["base"],
        "s3Uri": receipt["s3Uri"],
        "manifestUri": receipt["manifestUri"],
        "archiveSha256": receipt["archiveSha256"],
        "archiveBytes": receipt["archiveBytes"],
        "fullGetAndEveryFileVerified": True,
        "localPreserved": True,
        "profile": "vibe-coding",
        "region": "ap-east-2",
        "summary": plan_data["summary"],
        "gitSummary": {
            "referencedModelComponents": len(git_glbs),
            "unreferencedModelComponents": 0,
        },
        "files": plan_data["files"],
        "restoreCommand": "python3 tools/hero-model-library/prepare_pr1152_s3_split.py restore --manifest materials/asset-library/pr1152-s3-split.json",
    }
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    verify_manifest(output)
    synchronize_readme(result, write=True)
    synchronize_report(result, write=True)
    return result


def verify_manifest(path: Path) -> dict:
    data = json.loads(path.read_text())
    files = data.get("files", [])
    if (
        data.get("schema") != "ggd.pr1152-s3-preparation-split@1"
        or data.get("fullGetAndEveryFileVerified") is not True
        or f"s3://{BUCKET}/{PREFIX}/" not in data.get("s3Uri", "")
        or len(files) != data.get("summary", {}).get("files")
        or sum(row.get("bytes", -1) for row in files) != data.get("summary", {}).get("bytes")
        or len({row.get("repoPath") for row in files}) != len(files)
        or any(row.get("archiveMember") != row.get("repoPath") for row in files)
        or data.get("gitSummary", {}).get("referencedModelComponents", 0) <= 0
        or data.get("gitSummary", {}).get("unreferencedModelComponents") != 0
    ):
        raise ValueError("PR 1152 S3 split manifest is stale or incomplete")
    return data


def readme_block(manifest: dict) -> str:
    summary = manifest["summary"]
    return "\n".join([
        README_START,
        "",
        "### PR #1152 準備材料 S3 分流",
        "",
        f"依 [#1252]({manifest['decisionIssue']}) 的 Main 合併條件，{summary['unreferencedModelComponents']} 顆未被 `content/models` 引用的 GLB 與 {summary['preparationEvidenceFiles']} 份截圖／音訊／過程證據已移至 S3 `legacy/`，合計 {summary['files']} 檔／{summary['bytes']:,} bytes。Git 保留 [逐檔 SHA-256 與還原清單](pr1152-s3-split.json)；本機原件保留。",
        "",
        f"S3 完整讀回與逐檔 SHA-256 已驗證：`{manifest['s3Uri']}`。需重建這些來源索引或觀看證據時，先執行：",
        "",
        "```sh",
        manifest["restoreCommand"],
        "```",
        "",
        README_END,
        "",
    ])


def synchronize_readme(manifest: dict, *, write: bool) -> None:
    current = ASSET_README.read_text()
    generated = readme_block(manifest)
    if README_START in current or README_END in current:
        if current.count(README_START) != 1 or current.count(README_END) != 1:
            raise ValueError("PR 1152 S3 split README markers are ambiguous")
        begin = current.index(README_START)
        finish = current.index(README_END, begin) + len(README_END)
        expected = current[:begin] + generated.rstrip() + current[finish:]
    else:
        if current.count(README_BOUNDARY) != 1:
            raise ValueError("asset-library README insertion boundary is missing or ambiguous")
        expected = current.replace(README_BOUNDARY, generated + README_BOUNDARY)
    if write:
        ASSET_README.write_text(expected)
    elif current != expected:
        raise ValueError("PR 1152 S3 split README block is stale")


def report_block(manifest: dict) -> str:
    summary = manifest["summary"]
    git_summary = manifest["gitSummary"]
    return "\n".join([
        REPORT_START,
        "",
        "### #1252 S3 分流與合併狀態",
        "",
        f"依 [#1252]({manifest['decisionIssue']}) 的 Main 合併要求，已將 {summary['unreferencedModelComponents']} 顆未被 `content/models` 引用的 GLB 與 {summary['preparationEvidenceFiles']} 份截圖／音訊／過程證據分流到 S3 `legacy/`，合計 {summary['files']} 檔／{summary['bytes']:,} bytes。S3 完整讀回與逐檔 SHA-256 均已驗證，本機原件保留。",
        "",
        f"Git 保留 {git_summary['referencedModelComponents']} 顆已被 `content/models/*.json` 引用的成品 GLB，新增未引用 Git GLB 為 {git_summary['unreferencedModelComponents']} 顆。此狀態只代表 Git／S3 材料交付，正式站部署為 **0**。",
        "",
        f"S3：`{manifest['s3Uri']}`",
        "",
        "Git 逐檔清單與還原入口：`materials/asset-library/pr1152-s3-split.json`",
        "",
        "```bash",
        manifest["restoreCommand"],
        "```",
        "",
        REPORT_END,
        "",
    ])


def synchronize_report(manifest: dict, *, write: bool) -> None:
    current = FOUR_DAY_REPORT.read_text()
    if current.splitlines()[0] != REPORT_TITLE:
        raise ValueError("four-day report title is stale")
    current = current.replace(LEGACY_REPORT_BRANCH_LINE, TARGET_REPORT_BRANCH_LINE)
    generated = report_block(manifest)
    if REPORT_START in current or REPORT_END in current:
        if current.count(REPORT_START) != 1 or current.count(REPORT_END) != 1:
            raise ValueError("PR 1152 S3 split report markers are ambiguous")
        begin = current.index(REPORT_START)
        finish = current.index(REPORT_END, begin) + len(REPORT_END)
        expected = current[:begin] + generated.rstrip() + current[finish:]
    else:
        if current.count(REPORT_BOUNDARY) != 1:
            raise ValueError("four-day report insertion boundary is missing or ambiguous")
        expected = current.replace(REPORT_BOUNDARY, generated + REPORT_BOUNDARY)
    if write:
        FOUR_DAY_REPORT.write_text(expected)
    elif current != expected:
        raise ValueError("PR 1152 S3 split report block is stale")


def added_git_glbs(repo: Path, base: str, target: str | None = None) -> list[str]:
    diff_args = [base, target] if target else ["--cached", base]
    output = subprocess.check_output(
        ["git", "diff", *diff_args, "--name-only", "--diff-filter=A", "--", "content/assets/models/community"],
        cwd=repo,
        text=True,
    )
    added_glbs = [row for row in output.splitlines() if row.endswith(".glb")]
    unreferenced = sorted(set(added_glbs) - model_references(repo))
    if unreferenced:
        raise ValueError("new Git GLB reference gate failed: " + ", ".join(unreferenced))
    return added_glbs


def aws(args: list[str], action: str, resource: str) -> str:
    environment = dict(os.environ, AWS_PROFILE="vibe-coding", AWS_REGION="ap-east-2", AWS_PAGER="")
    result = subprocess.run(
        ["aws", *args, "--profile", "vibe-coding", "--region", "ap-east-2", "--no-cli-pager"],
        env=environment,
        text=True,
        capture_output=True,
    )
    if result.returncode:
        raise RuntimeError(f"{action} failed on {resource}: {result.stderr.strip()}")
    return result.stdout


def restore(path: Path, repo: Path) -> dict:
    manifest = verify_manifest(path)
    arn = aws(["sts", "get-caller-identity", "--query", "Arn", "--output", "text"], "sts:GetCallerIdentity", "configured profile").strip()
    if "assumed-role/vibe-coding-s3-role/" not in arn:
        raise RuntimeError("STOP: configured profile identity mismatch: " + arn)
    archive = Path("/private/tmp") / (manifest["archiveSha256"] + ".tar.gz")
    aws(["s3", "cp", manifest["s3Uri"], str(archive), "--only-show-errors"], "s3:GetObject", manifest["s3Uri"])
    if sha256(archive) != manifest["archiveSha256"]:
        raise ValueError("S3 split archive SHA-256 mismatch")
    expected = {row["archiveMember"]: row for row in manifest["files"]}
    with tarfile.open(archive, "r:gz") as bundle:
        members = [member for member in bundle.getmembers() if member.isfile()]
        if {member.name for member in members} != set(expected):
            raise ValueError("S3 split archive member set mismatch")
        for member in members:
            destination = (repo / member.name).resolve()
            if not destination.is_relative_to(repo.resolve()):
                raise ValueError("unsafe archive member: " + member.name)
            destination.parent.mkdir(parents=True, exist_ok=True)
            source = bundle.extractfile(member)
            assert source is not None
            with destination.open("wb") as target:
                shutil.copyfileobj(source, target)
            row = expected[member.name]
            if destination.stat().st_size != row["bytes"] or sha256(destination) != row["sha256"]:
                raise ValueError("restored split file mismatch: " + member.name)
    return {"restored": len(expected), "bytes": sum(row["bytes"] for row in expected.values()), "callerArn": arn}


def audit_git(repo: Path, base: str, target: str | None) -> dict:
    added_glbs = added_git_glbs(repo, base, target)
    manifest = verify_manifest(repo / "materials/asset-library/pr1152-s3-split.json")
    split_models = [row for row in manifest["files"] if row["storageRole"] == "unreferenced-model-component"]
    if len(split_models) != 40:
        raise ValueError("S3 reserved GLB count differs from #1252 decision")
    return {
        "base": subprocess.check_output(["git", "rev-parse", base], cwd=repo, text=True).strip(),
        "target": target or "staged-index",
        "newGitGlbs": len(added_glbs),
        "unreferencedNewGitGlbs": 0,
        "s3ReservedGlbs": len(split_models),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="mode", required=True)
    stage_parser = subparsers.add_parser("stage")
    stage_parser.add_argument("--base", default="origin/main")
    stage_parser.add_argument("--output", type=Path, required=True)
    finalize_parser = subparsers.add_parser("finalize")
    finalize_parser.add_argument("--plan", type=Path, required=True)
    finalize_parser.add_argument("--receipt", type=Path, required=True)
    finalize_parser.add_argument("--output", type=Path, required=True)
    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--manifest", type=Path, required=True)
    restore_parser = subparsers.add_parser("restore")
    restore_parser.add_argument("--manifest", type=Path, required=True)
    audit_parser = subparsers.add_parser("audit-git")
    audit_parser.add_argument("--base", default="origin/main")
    audit_parser.add_argument("--target")
    sync_parser = subparsers.add_parser("sync")
    sync_parser.add_argument("--manifest", type=Path, required=True)
    sync_parser.add_argument("--target", default="HEAD")
    args = parser.parse_args()
    if args.mode == "stage":
        result = plan(ROOT, args.base, args.output)
    elif args.mode == "finalize":
        result = finalize(args.plan, args.receipt, args.output)
    elif args.mode == "check":
        result = verify_manifest(args.manifest)
        synchronize_readme(result, write=False)
        synchronize_report(result, write=False)
    elif args.mode == "restore":
        result = restore(args.manifest, ROOT)
    elif args.mode == "sync":
        result = verify_manifest(args.manifest)
        result["gitSummary"] = {
            "referencedModelComponents": len(added_git_glbs(ROOT, result["baseCommit"], args.target)),
            "unreferencedModelComponents": 0,
        }
        args.manifest.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        verify_manifest(args.manifest)
        synchronize_readme(result, write=True)
        synchronize_report(result, write=True)
    else:
        result = audit_git(ROOT, args.base, args.target)
    print(json.dumps(result.get("summary", result), ensure_ascii=False))


if __name__ == "__main__":
    main()
