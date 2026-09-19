#!/usr/bin/env python3
"""Build the deterministic RPCS3 capture readiness receipt for priority J-Stars characters."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


EXPECTED = {
    "rpcs3": {"bytes": 40_231_415, "sha256": "bb789a07dd60353d8cbf3806f0eef4c7c5440c1cbe89f198b6856803068ead9f"},
    "eboot": {"bytes": 9_725_496, "sha256": "1e71ce86047f7cf99f29904a9fd045e818730425be76b4c780f42a3d8d8975f1"},
    "sfo": {"bytes": 1_396, "sha256": "522e138818ccf177044ce5dc3ecacfc0087a42e5154b19f9a3e8805ba1e317bc"},
    "firmware": {"bytes": 268_435_456, "sha256": "b0064cb5a019856bdcf91c28c7806f5565b3e16ccf5070607e04d3ac967fa515"},
}
CHARACTERS = (
    {"nativeId": "017", "slug": "gon", "nameZhTW": "小傑·富力士", "heroIds": ["godie-ucrl"]},
    {"nativeId": "041", "slug": "nube", "nameZhTW": "鵺野鳴介／神眉", "heroIds": ["b2-nube"]},
    {"nativeId": "037", "slug": "luckyman", "nameZhTW": "幸運超人", "heroIds": ["b2-luckyman"]},
    {"nativeId": "012", "slug": "hiei", "nameZhTW": "飛影", "heroIds": ["godie-u010", "godie-uvng"]},
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_record(path: Path, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    exists = path.is_file()
    result: dict[str, Any] = {"absolutePath": str(path.resolve()), "existsLocal": exists}
    if exists:
        size = path.stat().st_size
        # An actively resumed download changes while hashing. Only hash it
        # after the fixed byte count is reached; complete local files and
        # files without a pinned size are still hashed normally.
        if expected is None or size == expected["bytes"]:
            result.update({"bytes": size, "sha256": sha256_path(path)})
        else:
            result["downloadState"] = "incomplete-byte-count"
    if expected:
        result["expected"] = expected
        result["verified"] = exists and result.get("bytes") == expected["bytes"] and result.get("sha256") == expected["sha256"]
    return result


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def rpcs3_package_status(package: dict[str, Any]) -> str:
    if not package.get("existsLocal"):
        return "missing"
    if package.get("verified"):
        return "verified"
    if package.get("downloadState") == "incomplete-byte-count":
        return "download-incomplete"
    return "hash-mismatch"


def build(repo: Path, volume: Path) -> dict[str, Any]:
    workspace = repo.parent
    asset_root = workspace / "GGD-Asset-Library"
    rpcs3_archive = asset_root / "tools/rpcs3-macos-arm64/rpcs3-v0.0.42-20023-f4a74819_macos.7z"
    setup_receipt_path = asset_root / "tools/rpcs3-macos-arm64/setup-receipt.json"
    eboot = volume / "PS3_GAME/USRDIR/EBOOT.BIN"
    sfo = volume / "PS3_GAME/PARAM.SFO"
    firmware = volume / "PS3_UPDATE/PS3UPDAT.PUP"
    preserved_root = asset_root / "intake/owner-jstars-victory-vs-plus-20260917/boot-inputs"
    cpk_receipt_path = repo / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/cpk-inventory.json"
    cpk = load_json(cpk_receipt_path)
    cpk_rows = {str(row.get("nativeId")): row for row in cpk.get("priorityCharacters", [])}
    capture_root = asset_root / "conversions/jstars-rpcs3-memory-capture-v1"
    runtime_receipt_path = capture_root / "runtime-verification-receipt.json"
    ipc_receipt_path = capture_root / "ipc-config-receipt.json"
    capture_receipts = sorted(capture_root.rglob("capture-receipt.json")) if capture_root.is_dir() else []
    capture_summaries = []
    for path in capture_receipts:
        receipt = load_json(path)
        capture_summaries.append({
            "label": path.parent.name,
            "absolutePath": str(path.resolve()),
            "sha256": sha256_path(path),
            "emulator": receipt.get("emulator"),
            "summary": receipt.get("summary"),
            "characterNativeId": receipt.get("characterNativeId"),
        })
    character_tagged_captures = [row for row in capture_summaries if row.get("characterNativeId") in {definition["nativeId"] for definition in CHARACTERS}]
    baseline = next((row for row in capture_summaries if row["label"].startswith("baseline-title-screen-")), None)
    baseline_summary = baseline.get("summary", {}) if baseline else {}
    characters = []
    for definition in CHARACTERS:
        source = cpk_rows.get(definition["nativeId"])
        if source is None:
            raise ValueError(f"missing CPK evidence for priority token {definition['nativeId']}")
        characters.append({
            **definition,
            "identityStatus": source.get("identityStatus"),
            "ownerContainerFiles": source.get("memberCount"),
            "moduleCounts": source.get("moduleCounts"),
            "modelConverted": False,
            "nativeMotionsConverted": False,
            "vfxConverted": False,
            "runtimeRegistered": False,
            "productionDeploymentVerified": False,
        })
    package = file_record(rpcs3_archive, EXPECTED["rpcs3"])
    sources = {
        "rpcs3Package": package,
        "rpcs3SetupReceipt": file_record(setup_receipt_path),
        "mountedEboot": file_record(eboot, EXPECTED["eboot"]),
        "mountedParamSfo": file_record(sfo, EXPECTED["sfo"]),
        "mountedBundledFirmware": file_record(firmware, EXPECTED["firmware"]),
        "preservedEboot": file_record(preserved_root / "PS3_GAME/USRDIR/EBOOT.BIN", EXPECTED["eboot"]),
        "preservedParamSfo": file_record(preserved_root / "PS3_GAME/PARAM.SFO", EXPECTED["sfo"]),
        "preservedBundledFirmware": file_record(preserved_root / "PS3_UPDATE/PS3UPDAT.PUP", EXPECTED["firmware"]),
        "bootPreservationReceipt": file_record(preserved_root / "receipt.json"),
        "cpkInventory": file_record(cpk_receipt_path),
        "ipcConfigReceipt": file_record(ipc_receipt_path),
        "runtimeVerificationReceipt": file_record(runtime_receipt_path),
    }
    all_boot_inputs_verified = all(sources[key].get("verified") for key in ("preservedEboot", "preservedParamSfo", "preservedBundledFirmware"))
    package_status = rpcs3_package_status(package)
    setup_verified = False
    if setup_receipt_path.is_file():
        setup_receipt = load_json(setup_receipt_path)
        setup_verified = (
            setup_receipt.get("package", {}).get("sha256") == EXPECTED["rpcs3"]["sha256"]
            and setup_receipt.get("package", {}).get("bytes") == EXPECTED["rpcs3"]["bytes"]
            and setup_receipt.get("versionProbe", {}).get("returnCode") == 0
        )
    firmware_verified = False
    if runtime_receipt_path.is_file():
        runtime_receipt = load_json(runtime_receipt_path)
        firmware_verified = (
            runtime_receipt.get("firmware", {}).get("status") == "installed-verified"
            and runtime_receipt.get("firmware", {}).get("release") == "04.7000"
            and runtime_receipt.get("pine", {}).get("status") == "configured"
        )
    return {
        "schema": "ggd.jstars-rpcs3-memory-capture-readiness@1",
        "sourceId": "owner-jstars-victory-vs-plus-20260917",
        "titleId": "BLUS31519",
        "appVersion": "01.00",
        "requiredSystemVersion": "04.7000",
        "mountedVolume": str(volume.resolve()),
        "sources": sources,
        "characters": characters,
        "captureReceipts": [file_record(path) for path in capture_receipts],
        "captureSummaries": capture_summaries,
        "summary": {
            "characters": len(characters),
            "ownerContainerFiles": sum(int(row["ownerContainerFiles"] or 0) for row in characters),
            "bootInputsVerified": all_boot_inputs_verified,
            "rpcs3PackageStatus": package_status,
            "rpcs3ToolSetupVerified": setup_verified,
            "firmwareInstalledVerified": firmware_verified,
            "memoryCaptures": len(capture_receipts),
            "characterTaggedMemoryCaptures": len(character_tagged_captures),
            "baselineTitleScreen": baseline,
            "convertedModels": 0,
            "convertedMotions": 0,
            "convertedVfx": 0,
            "runtimeRegistrations": 0,
        },
        "pipeline": [
            {"id": "source-preservation", "status": "complete" if all_boot_inputs_verified else "blocked", "reason": None if all_boot_inputs_verified else "mounted PS3 boot inputs are missing or hash-mismatched"},
            {"id": "rpcs3-tool", "status": "complete" if package_status == "verified" and setup_verified else "running" if package_status == "download-incomplete" else "blocked", "reason": None if package_status == "verified" and setup_verified else f"RPCS3 package is {package_status}; setup receipt verified={setup_verified}"},
            {"id": "firmware-install", "status": "complete" if firmware_verified else "pending", "reason": None if firmware_verified else "RPCS3 firmware installation has not been receipt-verified"},
            {"id": "character-load", "status": "pending", "reason": "runtime setup is complete, but each priority character must be selected and fully loaded before a tagged capture"},
            {"id": "guest-memory-capture", "status": "pending" if not character_tagged_captures else "running", "reason": f"title-screen baseline receipts={1 if baseline else 0}; character-tagged receipts={len(character_tagged_captures)}"},
            {"id": "stpk-srd-conversion", "status": "pending", "reason": "captured STPK/SRD members are not yet converted to runtime GLB"},
            {"id": "runtime-registration", "status": "pending", "reason": "no validated model/motion/VFX output exists"},
        ],
        "commands": {
            "setupTool": "python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/setup_rpcs3.py",
            "enableIpc": "python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/configure_ipc.py",
            "verifyRuntime": "python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/verify_runtime.py",
            "installFirmwareIfMissing": "<RPCS3 executable> --installfw <preserved PS3UPDAT.PUP>",
            "launchGame": "<RPCS3 executable> --no-gui /Volumes/PS3VOLUME/PS3_GAME/USRDIR/EBOOT.BIN",
            "capture": "python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/pine_dump.py --output <GGD-Asset-Library/conversions/jstars-rpcs3-memory-capture-v1/CHARACTER-TIMESTAMP>",
            "refresh": "python3 tools/hero-model-library/source-workflows/jstars-rpcs3-memory-capture-v1/build_inventory.py",
        },
        "audioRerunRequired": False,
        "notes": [
            "The existing 1,596 decoded priority audio candidates remain authoritative and are not rerun here.",
            "PINE capture uses read-only memory opcodes and refuses any title ID other than BLUS31519.",
            "Capture and STPK carving are evidence stages; they do not prove runtime GLB conversion or deployment.",
            f"The title-screen baseline captured {baseline_summary.get('bytes', 0):,} bytes with {baseline_summary.get('failedRanges', 0):,} unmapped 4 KiB pages and carved {baseline_summary.get('carvedStpk', 0)} STPK; the full failed-page list stays in the local receipt and is not copied into Git.",
            "The remaining runtime input dependency is loading each named priority character in game before a character-tagged PINE capture.",
        ],
    }


def render_markdown(value: dict[str, Any]) -> str:
    summary = value["summary"]
    lines = [
        "# J-Stars RPCS3 記憶體擷取準備收據",
        "",
        "本收據由 `build_inventory.py` 產生。RPCS3 PINE 管線只讀取客體記憶體，限定 `BLUS31519`，不寫入遊戲記憶體。",
        "",
        f"- 優先角色：{summary['characters']}（017 小傑、041 神眉、037 幸運超人、012 飛影）",
        f"- 已保存角色原始容器：{summary['ownerContainerFiles']} 檔",
        f"- ISO 啟動輸入驗證：{'通過' if summary['bootInputsVerified'] else '未通過'}",
        f"- RPCS3 套件：`{summary['rpcs3PackageStatus']}`",
        f"- RPCS3 解包與 CLI 探測：{'通過' if summary['rpcs3ToolSetupVerified'] else '未通過'}",
        f"- Firmware 4.70 與 PINE 設定：{'通過' if summary['firmwareInstalledVerified'] else '未通過'}",
        f"- 記憶體擷取收據：{summary['memoryCaptures']}",
        f"- 指定角色擷取收據：{summary['characterTaggedMemoryCaptures']}",
        f"- 標題畫面 baseline：{summary['baselineTitleScreen']['summary'].get('bytes', 0):,} bytes，{summary['baselineTitleScreen']['summary'].get('failedRanges', 0):,} 個未映射 4 KiB page，{summary['baselineTitleScreen']['summary'].get('carvedStpk', 0)} STPK；逐 page 明細只留本機收據。" if summary["baselineTitleScreen"] else "- 標題畫面 baseline：尚未擷取。",
        "- 模型／動作／特效轉換：0／0／0；目前不能寫成已上架。",
        "- 既有 1,596 段優先角色音訊不重跑。",
        "",
        "## 階段",
        "",
        "| 階段 | 狀態 | 原因 |",
        "|---|---|---|",
    ]
    for row in value["pipeline"]:
        lines.append(f"| `{row['id']}` | `{row['status']}` | {row['reason'] or '—'} |")
    lines.extend(["", "## 角色", "", "| 原生 ID | 角色 | 原始容器 | 模型 | 動作 | 特效 |", "|---|---|---:|---|---|---|"])
    for row in value["characters"]:
        lines.append(f"| `{row['nativeId']}` | {row['nameZhTW']} | {row['ownerContainerFiles']} | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 | 待 RPCS3 擷取轉換 |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=repo_root())
    parser.add_argument("--volume", type=Path, default=Path("/Volumes/PS3VOLUME"))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    repo = args.repo.resolve()
    output = (args.output or repo / "materials/hero-model-library/source-inventories/jstars-rpcs3-memory-capture-v1").resolve()
    value = build(repo, args.volume)
    json_text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    markdown = render_markdown(value)
    targets = {output / "inventory.json": json_text, output / "README.md": markdown}
    if args.check:
        stale = [str(path) for path, expected in targets.items() if not path.is_file() or path.read_text(encoding="utf-8") != expected]
        if stale:
            print("stale: " + ", ".join(stale), file=sys.stderr)
            return 1
        print(f"ok: {output}")
        return 0
    output.mkdir(parents=True, exist_ok=True)
    for path, text in targets.items():
        path.write_text(text, encoding="utf-8")
    print(json.dumps(value["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
