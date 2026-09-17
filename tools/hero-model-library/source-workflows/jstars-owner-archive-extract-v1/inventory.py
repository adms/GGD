#!/usr/bin/env python3
"""Read-only J-Stars Victory VS+ archive/ISO inventory and receipt builder."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Iterable


SOURCE_ID = "owner-jstars-victory-vs-plus-20260917"
ARCHIVE_NAME = "J-Stars Victory Vs+.7z"
SCHEMA = "ggd.jstars-owner-archive-extraction-receipt@1"

TOKEN_PATTERNS = (
    re.compile(r"character_(?:model|motion|animation|effect|sound|voice)_(\d{3,4})(?:_|\b)", re.I),
    re.compile(r"(?:^|[/_.-])(?:chr|chara|character)[_-]?(\d{3,4})(?:$|[/_.-])", re.I),
)

ASSET_KIND_PATTERNS = {
    "model": re.compile(r"(?:model|mesh|costume|character_model)", re.I),
    "texture": re.compile(r"(?:texture|tex|\.dds$|\.gxt$|\.gtf$)", re.I),
    "skeleton": re.compile(r"(?:skeleton|bone|rig)", re.I),
    "motion": re.compile(r"(?:motion|animation|anim|\.anm$)", re.I),
    "vfx": re.compile(r"(?:effect|vfx|particle)", re.I),
    "sfx": re.compile(r"(?:sound|sfx|se_|_se(?:[/_.-]|$))", re.I),
    "voice": re.compile(r"(?:voice|dialog|eventvoice|actvoice)", re.I),
}


class ListingError(RuntimeError):
    """Raised when a read-only archive listing command fails."""


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def default_output() -> Path:
    return repo_root() / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json"


def default_candidates() -> list[Path]:
    workspace = repo_root().parent
    return [
        workspace / "GGD-Asset-Library/intake/owner-jstars-victory-vs-plus-20260917" / ARCHIVE_NAME,
        Path.home() / "Downloads" / ARCHIVE_NAME,
        Path.home() / "Desktop" / ARCHIVE_NAME,
    ]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def discover_tools() -> dict[str, str | None]:
    seven_zip = shutil.which("7zz") or shutil.which("7z")
    return {"sevenZip": seven_zip, "bsdtar": shutil.which("bsdtar")}


def discover_archive(explicit: Path | None, search_roots: list[Path], max_depth: int) -> tuple[Path | None, list[str]]:
    attempted: list[str] = []
    if explicit is not None:
        if not explicit.is_absolute():
            raise ValueError("--archive must be an absolute path")
        attempted.append(str(explicit))
        return (explicit if explicit.is_file() else None), attempted

    for candidate in default_candidates():
        attempted.append(str(candidate))
        if candidate.is_file():
            return candidate, attempted

    wanted = ARCHIVE_NAME.casefold()
    for root in sorted((p.resolve() for p in search_roots if p.exists()), key=str):
        attempted.append(f"search:{root} (maxDepth={max_depth})")
        root_depth = len(root.parts)
        for current, dirs, files in os.walk(root, followlinks=False):
            current_path = Path(current)
            depth = len(current_path.parts) - root_depth
            dirs[:] = sorted(d for d in dirs if depth < max_depth and not d.startswith("."))
            for name in sorted(files):
                if name.casefold() == wanted:
                    return current_path / name, attempted
    return None, attempted


def run_text(command: list[str]) -> str:
    completed = subprocess.run(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "no diagnostic"
        raise ListingError(f"command exited {completed.returncode}: {detail[:2000]}")
    return completed.stdout


def parse_7z_slt(text: str) -> list[dict]:
    payload = text.split("----------", 1)[1] if "----------" in text else text
    records: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for line in payload.splitlines() + [""]:
        if not line.strip():
            if "Path" in current:
                records.append(current)
            current = {}
            continue
        if " = " in line:
            key, value = line.split(" = ", 1)
            current[key.strip()] = value

    rows = []
    for record in records:
        path = record["Path"].replace("\\", "/")
        folder = record.get("Folder") == "+" or path.endswith("/")
        rows.append({
            "path": path,
            "folder": folder,
            "bytes": int(record["Size"]) if record.get("Size", "").isdigit() else None,
            "packedBytes": int(record["Packed Size"]) if record.get("Packed Size", "").isdigit() else None,
            "crc32": record.get("CRC") or None,
        })
    return rows


def parse_bsdtar_names(text: str) -> list[dict]:
    rows = []
    for raw in text.splitlines():
        path = raw.rstrip("\r").replace("\\", "/")
        if not path:
            continue
        rows.append({"path": path, "folder": path.endswith("/"), "bytes": None, "packedBytes": None, "crc32": None})
    return rows


def listing_tool_name(tools: dict[str, str | None]) -> str | None:
    if tools["sevenZip"]:
        return "7zip"
    if tools["bsdtar"]:
        return "bsdtar"
    return None


def list_file(path: Path, tools: dict[str, str | None]) -> dict:
    if tools["sevenZip"]:
        output = run_text([str(tools["sevenZip"]), "l", "-slt", "--", str(path)])
        rows = parse_7z_slt(output)
        tool = str(tools["sevenZip"])
        mode = "7zip-slt"
    elif tools["bsdtar"]:
        output = run_text([str(tools["bsdtar"]), "-tf", str(path)])
        rows = parse_bsdtar_names(output)
        tool = str(tools["bsdtar"])
        mode = "bsdtar-path-list"
    else:
        raise ListingError("neither 7zz/7z nor bsdtar is available")
    rows.sort(key=lambda row: row["path"])
    return {"tool": tool, "mode": mode, "entryCount": len(rows), "entries": rows}


def list_nested_iso(archive: Path, member: str, tools: dict[str, str | None]) -> dict:
    """Stream an ISO member into a second read-only lister; do not materialize it."""
    if tools["sevenZip"]:
        producer = [str(tools["sevenZip"]), "x", "-so", "--", str(archive), member]
        consumer = [str(tools["sevenZip"]), "l", "-slt", "-tiso", "-si"]
        parser = parse_7z_slt
        mode = "7zip-streamed-nested-iso"
    elif tools["bsdtar"]:
        producer = [str(tools["bsdtar"]), "-xOf", str(archive), member]
        consumer = [str(tools["bsdtar"]), "-tf", "-"]
        parser = parse_bsdtar_names
        mode = "bsdtar-streamed-nested-iso"
    else:
        raise ListingError("no tool can stream the embedded ISO")

    first = subprocess.Popen(producer, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert first.stdout is not None
    second = subprocess.Popen(
        consumer,
        stdin=first.stdout,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    first.stdout.close()
    second_out, second_err = second.communicate()
    assert first.stderr is not None
    first_err = first.stderr.read()
    first_returncode = first.wait()
    if first_returncode != 0 or second.returncode != 0:
        detail = (first_err + b"\n" + second_err).decode("utf-8", errors="replace").strip()
        raise ListingError(
            f"nested ISO stream failed producer={first_returncode} consumer={second.returncode}: {detail[:2000]}"
        )
    rows = parser(second_out.decode("utf-8", errors="replace"))
    rows.sort(key=lambda row: row["path"])
    return {"member": member, "mode": mode, "entryCount": len(rows), "entries": rows}


def detect_identity(paths: Iterable[str], source_name: str) -> dict:
    normalized = [path.replace("\\", "/") for path in paths]
    lowered = [path.casefold() for path in normalized]
    evidence = []
    platform = "unknown"
    if any(path == "ps3_disc.sfb" or path.startswith("ps3_game/") for path in lowered):
        platform = "PS3"
        evidence.append("PS3_DISC.SFB or PS3_GAME/ observed in ISO listing")
    elif any(path.startswith("sce_sys/") for path in lowered):
        platform = "PlayStation Vita or PS4"
        evidence.append("sce_sys/ observed; platform needs PARAM.SFO confirmation")

    plus = bool(re.search(r"j[- ]?stars.*victory.*vs\+", source_name, re.I))
    if plus:
        evidence.append("owner archive filename identifies J-Stars Victory VS+")
    return {
        "title": "J-Stars Victory VS+" if plus else "J-Stars Victory VS (edition unconfirmed)",
        "edition": "VS+" if plus else "unconfirmed",
        "platform": platform,
        "platformVersion": "PS3 disc build; APP_VER/VERSION pending PARAM.SFO read" if platform == "PS3" else "unconfirmed",
        "evidence": evidence,
    }


def character_tokens(paths: Iterable[str]) -> list[dict]:
    hits: dict[str, dict[str, set[str]]] = defaultdict(lambda: {"paths": set(), "assetKinds": set()})
    for path in paths:
        tokens = set()
        for pattern in TOKEN_PATTERNS:
            tokens.update(match.group(1) for match in pattern.finditer(path))
        for token in tokens:
            hits[token]["paths"].add(path)
            for kind, pattern in ASSET_KIND_PATTERNS.items():
                if pattern.search(path):
                    hits[token]["assetKinds"].add(kind)
    return [
        {
            "token": token,
            "observedPathCount": len(data["paths"]),
            "assetKinds": sorted(data["assetKinds"]),
            "samplePaths": sorted(data["paths"])[:20],
            "identityStatus": "native-token-observed-character-identity-not-yet-proven",
        }
        for token, data in sorted(hits.items())
    ]


def rerun_command(output: Path) -> str:
    script = Path(__file__).resolve()
    return f'python3 "{script}" --archive "/absolute/path/{ARCHIVE_NAME}" --output "{output.resolve()}"'


def blocked_receipt(attempted: list[str], output: Path, tools: dict[str, str | None]) -> dict:
    return {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "status": "blocked-archive-not-found",
        "mode": "read-only-inventory",
        "source": None,
        "attemptedLocations": attempted,
        "toolAvailability": tools,
        "archiveListing": None,
        "isoListings": [],
        "identification": {
            "title": "J-Stars Victory VS+",
            "edition": "VS+ from owner-supplied filename only",
            "platform": "unconfirmed",
            "platformVersion": "unconfirmed",
            "evidence": [],
        },
        "characterContainerTokens": [],
        "summary": {"archiveEntries": 0, "isoEntries": 0, "characterTokens": 0},
        "safety": {
            "sourceModified": False,
            "largePayloadCopied": False,
            "fullArchiveExtracted": False,
            "nestedIsoInspectionMode": "stream-only",
        },
        "blockers": [{
            "action": "inventory owner archive",
            "resource": ARCHIVE_NAME,
            "reason": "archive is not visible at the supplied or standard local paths",
        }],
        "rerunCommand": rerun_command(output),
    }


def build_receipt(archive: Path, output: Path, tools: dict[str, str | None], inspect_nested: bool) -> dict:
    source = {
        "absolutePath": str(archive),
        "fileName": archive.name,
        "bytes": archive.stat().st_size,
        "sha256": sha256_file(archive),
    }
    blockers = []
    try:
        archive_listing = list_file(archive, tools)
    except ListingError as exc:
        return {
            "schema": SCHEMA,
            "sourceId": SOURCE_ID,
            "status": "blocked-archive-listing-failed",
            "mode": "read-only-inventory",
            "source": source,
            "toolAvailability": tools,
            "archiveListing": None,
            "isoListings": [],
            "identification": detect_identity([], archive.name),
            "characterContainerTokens": [],
            "summary": {"archiveEntries": 0, "isoEntries": 0, "characterTokens": 0},
            "safety": {
                "sourceModified": False,
                "largePayloadCopied": False,
                "fullArchiveExtracted": False,
                "nestedIsoInspectionMode": "stream-only",
            },
            "blockers": [{"action": "list archive", "resource": str(archive), "reason": str(exc)}],
            "rerunCommand": rerun_command(output),
        }

    iso_members = [row["path"] for row in archive_listing["entries"] if not row["folder"] and row["path"].casefold().endswith(".iso")]
    iso_listings = []
    if archive.suffix.casefold() == ".iso":
        iso_listings.append({"member": archive.name, **archive_listing})
    elif inspect_nested:
        for member in iso_members:
            try:
                iso_listings.append(list_nested_iso(archive, member, tools))
            except ListingError as exc:
                blockers.append({"action": "list embedded ISO", "resource": member, "reason": str(exc)})
    elif iso_members:
        blockers.append({
            "action": "list embedded ISO",
            "resource": ", ".join(iso_members),
            "reason": "nested ISO inspection disabled by --skip-nested-iso",
        })

    all_paths = [row["path"] for row in archive_listing["entries"]]
    for listing in iso_listings:
        all_paths.extend(row["path"] for row in listing["entries"])
    tokens = character_tokens(all_paths)
    identity = detect_identity(all_paths, archive.name)
    status = "inventoried-read-only" if not blockers else "partial-inventory-with-blockers"
    return {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "status": status,
        "mode": "read-only-inventory",
        "source": source,
        "toolAvailability": tools,
        "archiveListing": archive_listing,
        "isoListings": iso_listings,
        "identification": identity,
        "characterContainerTokens": tokens,
        "summary": {
            "archiveEntries": archive_listing["entryCount"],
            "embeddedIsoMembers": len(iso_members),
            "isoListings": len(iso_listings),
            "isoEntries": sum(row["entryCount"] for row in iso_listings),
            "characterTokens": len(tokens),
        },
        "safety": {
            "sourceModified": False,
            "largePayloadCopied": False,
            "fullArchiveExtracted": False,
            "nestedIsoInspectionMode": "stream-only",
        },
        "blockers": blockers,
        "rerunCommand": rerun_command(output),
    }


def serialize(receipt: dict) -> str:
    return json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="absolute path to the owner .7z or a direct ISO")
    parser.add_argument("--search-root", type=Path, action="append", default=[], help="optional bounded discovery root")
    parser.add_argument("--max-search-depth", type=int, default=4)
    parser.add_argument("--output", type=Path, default=default_output())
    parser.add_argument("--skip-nested-iso", action="store_true", help="list only the outer archive")
    parser.add_argument("--check", action="store_true", help="verify the deterministic receipt without writing")
    args = parser.parse_args(argv)

    archive, attempted = discover_archive(args.archive, args.search_root, args.max_search_depth)
    tools = discover_tools()
    receipt = (
        build_receipt(archive.resolve(), args.output, tools, not args.skip_nested_iso)
        if archive
        else blocked_receipt(attempted, args.output, tools)
    )
    data = serialize(receipt)
    output = args.output.resolve()
    if args.check:
        if not output.is_file() or output.read_text(encoding="utf-8") != data:
            print(f"stale or missing receipt: {output}", file=sys.stderr)
            return 1
        print(f"ok: {output} ({receipt['status']})")
        return 0
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(data, encoding="utf-8")
    print(json.dumps({"output": str(output), "status": receipt["status"], "summary": receipt["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
