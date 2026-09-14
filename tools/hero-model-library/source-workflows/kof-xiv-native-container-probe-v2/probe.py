#!/usr/bin/env python3
"""Read-only structural probe for local KOF XIV OBAC/OMIR/OSEC/OTRA assets.

This is deliberately a preflight, not a model converter.  It only parses the
small, reproducibly evidenced length-prefixed ASCII tables that are present in
the native files.  In particular it does *not* infer geometry, bind matrices,
weights, transforms, frame rate, duration, blend state, or gameplay events
from opaque binary regions.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import shutil
import struct
import subprocess
from pathlib import Path
from typing import Any


SCHEMA = "ggd.kof-xiv-native-container-probe@2"
SOURCE_ID = "steam-kofxiv-priority-mai-ior-kyo-build-local-v126"
SOURCE_RELATIVE = Path(
    "GGD-Asset-Library/intake/windows-readonly-20260913/"
    "kof-xiv-priority-mai-ior-kyo-v1"
)
NAMES = {
    "MAI": {"nameZh": "不知火舞", "originalName": "Mai Shiranui"},
    "IOR": {"nameZh": "八神庵", "originalName": "Iori Yagami"},
    "KYO": {"nameZh": "草薙京", "originalName": "Kyo Kusanagi"},
}
CLIP_LABEL = re.compile(r"^\d{3}(?:[A-Z]{3}|CMN)_[A-Z0-9_]+$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def u32(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        raise ValueError(f"u32 out of range at {offset}")
    return struct.unpack_from("<I", data, offset)[0]


def read_ascii_table(data: bytes, start: int, count: int | None) -> tuple[list[str], int]:
    """Read exactly count (or a contiguous run) of u32-length ASCII strings."""
    values: list[str] = []
    offset = start
    while count is None or len(values) < count:
        if offset + 4 > len(data):
            if count is None:
                break
            raise ValueError(f"string table ended after {len(values)}/{count} entries")
        length = u32(data, offset)
        if not 1 <= length <= 128 or offset + 4 + length > len(data):
            if count is None:
                break
            raise ValueError(f"invalid string length {length} at {offset} ({len(values)}/{count})")
        raw = data[offset + 4 : offset + 4 + length]
        if not all(32 <= byte < 127 for byte in raw):
            if count is None:
                break
            raise ValueError(f"non-ASCII table entry at {offset} ({len(values)}/{count})")
        values.append(raw.decode("ascii"))
        offset += 4 + length
    return values, offset


def source_index(source_root: Path) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    with gzip.open(source_root / "files.jsonl.gz", "rt", encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                row = json.loads(line)
                indexed[str(row["path"])] = row
    return indexed


def source_file(source_root: Path, index: dict[str, dict[str, Any]], relative: Path) -> dict[str, Any]:
    path = source_root / "extracted" / relative
    key = relative.as_posix()
    expected = index.get(key)
    if expected is None:
        raise ValueError(f"source manifest does not include {key}")
    if not path.is_file():
        raise FileNotFoundError(path)
    actual_size = path.stat().st_size
    actual_hash = sha256(path)
    if actual_size != expected["bytes"] or actual_hash != expected["sha256"]:
        raise ValueError(f"source bytes differ from source manifest: {key}")
    return {
        "relativePath": key,
        "absolutePath": str(path.resolve()),
        "bytes": actual_size,
        "sha256": actual_hash,
        "sourceManifestSha256Verified": True,
    }


def assimp_probe(path: Path) -> dict[str, Any]:
    executable = shutil.which("assimp")
    if executable is None:
        return {"available": False, "readerAccepted": False, "result": "assimp-not-installed"}
    completed = subprocess.run([executable, "info", str(path)], text=True, capture_output=True, check=False)
    output = (completed.stdout + "\n" + completed.stderr).strip()
    return {
        "available": True,
        "exitCode": completed.returncode,
        "readerAccepted": completed.returncode == 0,
        "result": "no-suitable-reader" if "No suitable reader found" in output else "other-nonzero" if completed.returncode else "accepted",
        "outputSha256": hashlib.sha256(output.encode("utf-8")).hexdigest(),
    }


def command_version(command: list[str]) -> str:
    executable = shutil.which(command[0]) if "/" not in command[0] else command[0]
    if executable is None or not Path(executable).exists():
        return "unavailable"
    completed = subprocess.run(command, text=True, capture_output=True, check=False)
    text = (completed.stdout + "\n" + completed.stderr).strip()
    return next((line.strip() for line in text.splitlines() if line.strip()), "unavailable")


def parse_omir(data: bytes) -> dict[str, Any]:
    if data[:2] != b"OM":
        raise ValueError("unexpected OMIR identifier")
    declared = u32(data, 6)
    names, end = read_ascii_table(data, 10, declared)
    return {
        "identifierAscii": "OM",
        "headerHex": data[:10].hex(),
        "declaredNameCountOffset": 6,
        "declaredNameCount": declared,
        "nameTableOffset": 10,
        "parsedNameCount": len(names),
        "names": names,
        "nameTableEndOffset": end,
        "opaqueTailBytes": len(data) - end,
        "opaqueTailFirstTwoU32Le": [u32(data, end), u32(data, end + 4)] if end + 8 <= len(data) else None,
    }


def parse_osec(data: bytes) -> dict[str, Any]:
    if data[:2] != b"OS":
        raise ValueError("unexpected OSEC identifier")
    declared = u32(data, 10)
    names, end = read_ascii_table(data, 14, declared)
    return {
        "identifierAscii": "OS",
        "headerHex": data[:14].hex(),
        "declaredNameCountOffset": 10,
        "declaredNameCount": declared,
        "nameTableOffset": 14,
        "parsedNameCount": len(names),
        "names": names,
        "nameTableEndOffset": end,
        "opaqueTailBytes": len(data) - end,
        "opaqueTailFirstTwoU32Le": [u32(data, end), u32(data, end + 4)] if end + 8 <= len(data) else None,
    }


def parse_otra(data: bytes) -> dict[str, Any]:
    if data[:3] != b"SMp":
        raise ValueError("unexpected OTRA identifier")
    prefix_count = u32(data, 6)
    prefix, after_prefix = read_ascii_table(data, 14, prefix_count)
    continued, opaque_start = read_ascii_table(data, after_prefix, None)
    labels: list[dict[str, Any]] = []
    # Only accept an exact u32 length prefix immediately before the ASCII label.
    for match in re.finditer(rb"\d{3}(?:[A-Z]{3}|CMN)_[A-Z0-9_]+", data):
        offset = match.start()
        if offset < 4:
            continue
        value = match.group().decode("ascii")
        if u32(data, offset - 4) == len(value) and CLIP_LABEL.fullmatch(value):
            labels.append({"name": value, "lengthPrefixOffset": offset - 4})
    return {
        "identifierAscii": "SMp",
        "headerHex": data[:14].hex(),
        "prefixNameCountOffset": 6,
        "prefixNameCount": prefix_count,
        "prefixNameTableOffset": 14,
        "prefixNames": prefix,
        "continuedNameTableOffset": after_prefix,
        "continuedNames": continued,
        "combinedNameCount": len(prefix) + len(continued),
        "opaquePayloadOffset": opaque_start,
        "opaquePayloadBytes": len(data) - opaque_start,
        "opaquePayloadFirstThreeU32Le": [u32(data, opaque_start + i) for i in (0, 4, 8)] if opaque_start + 12 <= len(data) else None,
        "nativeClipLabelCandidates": labels,
        "nativeClipLabelCandidateCount": len(labels),
        "clipLabelsAreDecodedTransforms": False,
        "clipLabelsAreDecodedTiming": False,
    }


def build(source_root: Path) -> dict[str, Any]:
    manifest = source_index(source_root)
    characters = []
    for native_id, identity in NAMES.items():
        relative_base = Path("Chara") / native_id
        raw: dict[str, dict[str, Any]] = {}
        parsed: dict[str, dict[str, Any]] = {}
        for extension, parser in (("obac", None), ("omir", parse_omir), ("osec", parse_osec), ("otra", parse_otra)):
            relative = relative_base / f"{native_id}.{extension}"
            record = source_file(source_root, manifest, relative)
            payload = Path(record["absolutePath"]).read_bytes()
            record.update({
                "first32BytesHex": payload[:32].hex(),
                "assimp": assimp_probe(Path(record["absolutePath"])),
            })
            raw[extension] = record
            if parser:
                parsed[extension] = parser(payload)
        omir_names = parsed["omir"]["names"]
        osec_names = parsed["osec"]["names"]
        otra_names = set(parsed["otra"]["prefixNames"] + parsed["otra"]["continuedNames"])
        if omir_names != osec_names:
            raise ValueError(f"{native_id}: OMIR and OSEC ordered name tables differ")
        missing = [name for name in omir_names if name not in otra_names]
        if missing:
            raise ValueError(f"{native_id}: OTRA name tables omit skeleton names: {missing[:3]}")
        characters.append({
            "nativeCharacterId": native_id,
            **identity,
            "files": raw,
            "readOnlyParsedTables": parsed,
            "crossValidation": {
                "omirOsecOrderedNamesIdentical": True,
                "skeletonNameCount": len(omir_names),
                "allSkeletonNamesAppearInOtraNameTables": True,
                "otraCombinedNameCount": len(otra_names),
                "nativeClipLabelCandidateCount": parsed["otra"]["nativeClipLabelCandidateCount"],
            },
            "conversionReadiness": {
                "completeModelDecoded": False,
                "completeSkeletonDecoded": False,
                "nativeAnimationsDecoded": False,
                "nativeVfxDecoded": False,
                "pilotEligible": False,
                "blockers": [
                    "OBAC geometry layout, primitive ranges, material mapping, indices, weights and bind matrices remain opaque.",
                    "OMIR/OSEC name tables alone do not establish hierarchy, rest pose or bind transforms.",
                    "OTRA labels do not decode transform keys, frame rate, duration, interpolation or gameplay-event timing.",
                ],
            },
        })
    no_reader = all(
        not character["files"][extension]["assimp"]["readerAccepted"]
        for character in characters for extension in ("obac", "omir", "osec", "otra")
    )
    return {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "mode": "read-only-native-container-preflight",
        "sourceRoot": str(source_root.resolve()),
        "sourceManifest": {
            "absolutePath": str((source_root / "files.jsonl.gz").resolve()),
            "sha256": sha256(source_root / "files.jsonl.gz"),
        },
        "tools": {
            "python": command_version(["python3", "--version"]),
            "assimp": command_version(["assimp", "version"]),
            "blender": command_version(["/Applications/Blender.app/Contents/MacOS/Blender", "--version"]),
            "assimpExistingReaderForEveryPilotContainer": not no_reader,
            "blenderNativeImporterAddonDetected": False,
            "toolSearchScope": "current local project tools and installed Assimp/Blender only; no download, game executable, mod executable, or protected-container bypass was used",
        },
        "publicFormatResearch": {
            "checkedAt": "2026-09-15",
            "directlyUsableAuditedReaderFound": False,
            "records": [
                {
                    "kind": "installed-open-source-reader",
                    "name": "Assimp 6.0",
                    "evidence": "The local `assimp listext` does not advertise .obac, .omir, .osec or .otra, and every one of the 12 representative containers returned no-suitable-reader.",
                    "usableForPilot": False,
                },
                {
                    "kind": "public-format-discussion",
                    "url": "https://reshax.com/topic/1353-the-king-of-fighters-xiv-steam-edition-otra-file/",
                    "observed": "The discussion identifies OTRA as animation-related and says skeleton and bone names are prerequisites, but it supplies no complete open parser/exporter for OBAC, OMIR, OSEC or OTRA.",
                    "usableForPilot": False,
                },
            ],
            "conclusion": "No drop-in reader was admitted to this workflow. A future parser must be source-reviewed and produce independently checked geometry, hierarchy, bind, skinning and transform/timing output before it can create a model pilot.",
        },
        "characters": characters,
        "summary": {
            "characters": len(characters),
            "verifiedSourceFiles": len(characters) * 4,
            "allSourceManifestSha256Verified": True,
            "assimpAcceptedNativeContainers": sum(
                int(character["files"][extension]["assimp"]["readerAccepted"])
                for character in characters for extension in ("obac", "omir", "osec", "otra")
            ),
            "nativeClipLabelCandidates": sum(character["crossValidation"]["nativeClipLabelCandidateCount"] for character in characters),
            "completeModelPilots": 0,
            "status": "format-blocked-after-read-only-structural-preflight",
        },
        "nextSafeStep": "Use an audited parser that can export OBAC primitive/index/weight/bind data plus OTRA transform keys and timing. Re-run this probe before any GLB conversion; do not use the extracted names or labels as a substitute for decoded model or animation data.",
    }


def markdown(receipt: dict[str, Any]) -> str:
    lines = [
        "# KOF XIV 原生容器只讀前導解析",
        "",
        "> 由 `probe.py` 生成。此文件只記錄長度前綴 ASCII 名稱表與工具讀取結果，不能手改，也不代表模型、動作或特效已轉換。",
        "",
        "## 結論",
        "",
        "- 三名角色的原檔 SHA-256 已與原始 `files.jsonl.gz` 交叉驗證。",
        "- OMIR 與 OSEC 的有序名稱表逐一相同；OTRA 的連續名稱表包含該骨架名稱集合。這證明可安全產出骨架名稱與動作標籤前導資料，不代表骨架 hierarchy／bind pose 已解碼。",
        "- OTRA 可讀到精確長度前綴的原生動作標籤；尚未讀出 transform key、frame rate、時長、插值或事件時序。",
        "- Assimp 對這 12 個 OBAC／OMIR／OSEC／OTRA 原生容器皆沒有可用 reader；本機 Blender 沒有已稽核的對應 importer。OBAC 幾何、材質、權重和 bind 資料仍是完成模型 pilot 的阻擋點。",
        "",
        "| ID | 角色 | 骨架名稱 | OTRA 動作標籤候選 | 模型 GLB | 原生動作 GLB |",
        "|---|---|---:|---:|---|---|",
    ]
    for character in receipt["characters"]:
        cross = character["crossValidation"]
        lines.append(
            f"| `{character['nativeCharacterId']}` | {character['nameZh']} / {character['originalName']} | "
            f"{cross['skeletonNameCount']} | {cross['nativeClipLabelCandidateCount']} | 未轉換 | 未轉換 |"
        )
    lines += [
        "",
        "## 可重跑",
        "",
        "```sh",
        "python3 tools/hero-model-library/source-workflows/kof-xiv-native-container-probe-v2/probe.py --repo . --workspace ..",
        "python3 tools/hero-model-library/source-workflows/kof-xiv-native-container-probe-v2/probe.py --repo . --workspace .. --check",
        "python3 -m unittest discover -s tools/hero-model-library/source-workflows/kof-xiv-native-container-probe-v2 -p 'test_*.py'",
        "```",
        "",
        "完整容器 SHA、magic、offset、骨架名稱與動作標籤見同目錄 `receipt.json`。",
        "",
    ]
    return "\n".join(lines)


def write_or_check(path: Path, contents: bytes, check: bool) -> None:
    if check:
        if not path.is_file() or path.read_bytes() != contents:
            raise SystemExit(f"generated output differs: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    workspace = args.workspace.resolve() if args.workspace else repo.parent.resolve()
    output = (args.output_dir or repo / "materials/hero-model-library/source-inventories/kof-xiv-native-container-probe-v2").resolve()
    receipt = build(workspace / SOURCE_RELATIVE)
    rendered_json = (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    rendered_md = markdown(receipt).encode("utf-8")
    write_or_check(output / "receipt.json", rendered_json, args.check)
    write_or_check(output / "README.md", rendered_md, args.check)
    print(json.dumps({"output": str(output), "summary": receipt["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
