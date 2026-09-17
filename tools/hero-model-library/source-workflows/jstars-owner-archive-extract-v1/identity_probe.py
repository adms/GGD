#!/usr/bin/env python3
"""Recover native J-Stars identity names from partial STPK index output.

The retained cmp_scz.bms decoder does not produce complete native payloads for
mixed $CLH/$CH0 files.  It does, however, emit the STPK index area from each
character_model_<id>_m.pak.  This script preserves those partial outputs and
records only internal member-name identity evidence; it never calls them model
conversions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


SCHEMA = "ggd.jstars-owner-identity-probe@1"
PRIORITY_ALIASES = {
    "gintoki": "gintoki",
    "nube": "nueno",
    "gon": "gon",
    "killua": "killua",
    "luckyman": "luckyman",
    "hiei": "hiei",
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def asset_base() -> Path:
    return repo_root().parent / "GGD-Asset-Library/conversions/jstars-owner-archive-extract-v1"


def default_split_root() -> Path:
    return asset_base() / "native-token-members"


def default_retained_root() -> Path:
    return asset_base() / "identity-probe/partial-stpk"


def default_output() -> Path:
    return repo_root() / "materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/identity-probe.json"


def default_quickbms() -> Path:
    return repo_root().parent / "GGD-Asset-Library/tools/QuickBMS-complete-mirror/prebuilt-macos-0.12.0/quickbms"


def default_bms() -> Path:
    return repo_root().parent / "GGD-Asset-Library/conversions/jstars-009-20260911-v1/reference-tools/cmp_scz.bms"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ascii_strings(data: bytes, minimum: int = 6) -> list[str]:
    output = []
    current = bytearray()
    for byte in data:
        if 32 <= byte <= 126:
            current.append(byte)
        else:
            if len(current) >= minimum:
                output.append(current.decode("ascii"))
            current.clear()
    if len(current) >= minimum:
        output.append(current.decode("ascii"))
    return output


def preserve(source: Path, destination: Path) -> dict[str, Any]:
    digest = sha256(source)
    if destination.is_file():
        if destination.stat().st_size != source.stat().st_size or sha256(destination) != digest:
            raise ValueError(f"refusing to overwrite changed identity-probe output: {destination}")
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    return {"absolutePath": str(destination.resolve()), "bytes": destination.stat().st_size, "sha256": digest}


def declared_decoded_bytes(path: Path) -> int:
    data = path.read_bytes()[:32]
    if len(data) < 32 or data[:4] != b"$CMP":
        raise ValueError(f"not a complete $CMP header: {path}")
    return struct.unpack_from(">I", data, 16)[0]


def probe_one(source: Path, token: str, quickbms: Path, bms: Path, retained_root: Path) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix=f"jstars-identity-{token}-") as temporary:
        destination = Path(temporary)
        completed = subprocess.run(
            [str(quickbms), "-Y", "-o", str(bms), str(source), str(destination)],
            text=True,
            capture_output=True,
            check=False,
        )
        candidates = sorted((path for path in destination.iterdir() if path.is_file()), key=lambda path: path.name)
        outputs = []
        markers = set()
        identities = set()
        for candidate in candidates:
            data = candidate.read_bytes()
            retained = preserve(candidate, retained_root / token / candidate.name)
            for value in ascii_strings(data):
                match = re.match(rf"{re.escape(token)}_([A-Za-z0-9]+)(?:_|$)", value)
                if match:
                    markers.add(value)
                    identities.add(match.group(1).casefold())
            outputs.append({"fileName": candidate.name, "magicHex": data[:4].hex(), **retained})
    declared = declared_decoded_bytes(source)
    complete = completed.returncode == 0 and len(outputs) == 1 and outputs[0]["bytes"] == declared
    return {
        "nativeToken": token,
        "source": {"absolutePath": str(source.resolve()), "bytes": source.stat().st_size, "sha256": sha256(source)},
        "returnCode": completed.returncode,
        "outputs": outputs,
        "declaredDecodedBytes": declared,
        "completeNativeDecode": complete,
        "internalIdentityNames": sorted(identities),
        "internalMemberNameSamples": sorted(markers)[:20],
        "identityStatus": (
            "internal-stpk-member-name-observed-from-partial-index-not-complete-decode"
            if identities
            else "no-internal-identity-name-observed"
        ),
    }


def build(split_root: Path, retained_root: Path, quickbms: Path, bms: Path) -> dict[str, Any]:
    if not quickbms.is_file() or not bms.is_file():
        raise FileNotFoundError("QuickBMS or cmp_scz.bms is missing")
    rows = []
    for token_dir in sorted((path for path in split_root.iterdir() if path.is_dir()), key=lambda path: path.name):
        token = token_dir.name
        source = token_dir / "partition_op_character_ps3.cpk/character/model" / f"character_model_{token}_m.pak"
        if source.is_file():
            rows.append(probe_one(source, token, quickbms, bms, retained_root))
    identities: dict[str, list[str]] = {}
    for row in rows:
        for identity in row["internalIdentityNames"]:
            identities.setdefault(identity, []).append(row["nativeToken"])
    priority = []
    for slug, alias in PRIORITY_ALIASES.items():
        tokens = sorted(set(identities.get(alias, [])))
        priority.append({
            "slug": slug,
            "expectedInternalAlias": alias,
            "nativeId": tokens[0] if len(tokens) == 1 else None,
            "matchingNativeTokens": tokens,
            "identityStatus": "confirmed-unique-internal-stpk-member-name" if len(tokens) == 1 else "blocked-alias-not-unique",
        })
    return {
        "schema": SCHEMA,
        "sourceId": "owner-jstars-victory-vs-plus-20260917",
        "status": "priority-identities-confirmed-partial-index-native-decode-incomplete",
        "method": {
            "description": "QuickBMS cmp_scz.bms partial STPK index only; identities come from internal <id>_<name> member strings",
            "quickBms": {"absolutePath": str(quickbms.resolve()), "sha256": sha256(quickbms)},
            "script": {"absolutePath": str(bms.resolve()), "sha256": sha256(bms)},
            "commandTemplate": [str(quickbms.resolve()), "-Y", "-o", str(bms.resolve()), "<character_model_ID_m.pak>", "<temporary-output>"],
            "completeNativeDecodeClaimed": False,
        },
        "rows": rows,
        "priorityCharacters": priority,
        "summary": {
            "nativeTokensProbed": len(rows),
            "tokensWithInternalIdentity": sum(bool(row["internalIdentityNames"]) for row in rows),
            "priorityIdentitiesConfirmed": sum(row["nativeId"] is not None for row in priority),
            "completeNativeDecodes": sum(row["completeNativeDecode"] for row in rows),
        },
    }


def serialize(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split-root", type=Path, default=default_split_root())
    parser.add_argument("--retained-root", type=Path, default=default_retained_root())
    parser.add_argument("--quickbms", type=Path, default=default_quickbms())
    parser.add_argument("--script", type=Path, default=default_bms())
    parser.add_argument("--output", type=Path, default=default_output())
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    value = build(args.split_root.resolve(), args.retained_root.resolve(), args.quickbms.resolve(), args.script.resolve())
    rendered = serialize(value)
    output = args.output.resolve()
    if args.check:
        if not output.is_file() or output.read_text(encoding="utf-8") != rendered:
            print(f"stale or missing identity receipt: {output}", file=sys.stderr)
            return 1
        print(f"ok: {output} ({value['summary']['priorityIdentitiesConfirmed']} priorities)")
        return 0
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(rendered, encoding="utf-8")
    print(json.dumps({"output": str(output), **value["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
