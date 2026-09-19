#!/usr/bin/env python3
"""Build a read-only Unity/APK inventory for Dragon Quest Dai: A Hero's Bonds.

The APK is treated as a ZIP container.  No member is extracted and no APK,
DEX, shared library, Unity script, or managed assembly is executed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, BinaryIO, Iterable


SCHEMA = "ggd.dqdai-souls-apk-readonly-inventory@1"
CHUNK_BYTES = 4 * 1024 * 1024
DEFAULT_MAX_SCAN_MEMBER_BYTES = 256 * 1024 * 1024
DEFAULT_MAX_SCAN_TOTAL_BYTES = 4 * 1024 * 1024 * 1024
MAX_MEMBERS = 300_000

# Specific forms precede the generic form.  A specific Japanese name contains
# 「バーン」, so generic Vearn is suppressed for that same evidence string.
TARGET_ALIASES: dict[str, tuple[str, ...]] = {
    "old-vearn": (
        "老巴恩",
        "老バーン",
        "老バーン様",
        "old vearn",
        "old_vearn",
        "old-vearn",
        "oldvearn",
    ),
    "young-vearn": (
        "年輕巴恩",
        "年轻巴恩",
        "若バーン",
        "若きバーン",
        "真・大魔王バーン",
        "真大魔王バーン",
        "young vearn",
        "young_vearn",
        "young-vearn",
        "youngvearn",
        "true vearn",
        "true_vearn",
    ),
    "kigan-king-vearn": (
        "鬼眼王巴恩",
        "鬼眼王バーン",
        "鬼眼王",
        "鬼眼バーン",
        "kigan king vearn",
        "kigan_king_vearn",
        "kigan-king-vearn",
        "kiganou vearn",
        "kiganou_vearn",
    ),
    "mystvearn": (
        "密斯特巴恩",
        "ミストバーン",
        "ミスト・バーン",
        "mystvearn",
        "myst vearn",
        "myst_vearn",
        "myst-vearn",
    ),
    "vearn": (
        "巴恩",
        "大魔王巴恩",
        "バーン",
        "大魔王バーン",
        "vearn",
    ),
}

# Baran is a different character.  These aliases are never promoted to a
# Vearn hit.  They are retained as explicit exclusion evidence in the report.
EXCLUDED_ALIASES: dict[str, tuple[str, ...]] = {
    "baran": (
        "バラン",
        "巴蘭",
        "巴兰",
        "baran",
    ),
}

UNITY_PATH_RULES = (
    ("unity-data", re.compile(r"^assets/bin/data(?:/|$)", re.I)),
    ("streaming-assets", re.compile(r"(?:^|/)streamingassets(?:/|$)", re.I)),
    ("unity-managed", re.compile(r"(?:^|/)managed(?:/|$)", re.I)),
    ("il2cpp-metadata", re.compile(r"(?:^|/)global-metadata\.dat$", re.I)),
    ("unity-player-library", re.compile(r"(?:^|/)libunity\.so$", re.I)),
    ("il2cpp-library", re.compile(r"(?:^|/)libil2cpp\.so$", re.I)),
    ("unity-resources", re.compile(r"(?:^|/)(?:globalgamemanagers|resources\.assets|sharedassets\d+\.assets)$", re.I)),
)

BUNDLE_EXTENSIONS = {".bundle", ".unity3d", ".assetbundle", ".ab"}
BUNDLE_MAGIC = (b"UnityFS\x00", b"UnityRaw\x00", b"UnityWeb\x00")
SERIALIZED_EXTENSIONS = {".assets", ".resource", ".ress", ".resS"}
ADDRESSABLE_PATTERN = re.compile(
    r"(?:^|/)(?:aa|addressables?)(?:/|$)|(?:^|/)(?:catalog(?:_[^/]*)?\.(?:json|hash|bin)|settings\.json)$",
    re.I,
)

AUDIO_EXTENSIONS: dict[str, str] = {
    ".acb": "CRI Atom cue-sheet container",
    ".awb": "CRI Atom Wave Bank container",
    ".hca": "CRI HCA stream",
    ".adx": "CRI ADX stream",
    ".aix": "CRI AIX container",
    ".bnk": "Audiokinetic Wwise bank",
    ".wem": "Audiokinetic Wwise media",
    ".bank": "FMOD bank candidate",
    ".fsb": "FMOD sample bank",
    ".ogg": "Ogg audio stream",
    ".wav": "RIFF/WAVE audio stream",
    ".mp3": "MPEG audio stream",
    ".m4a": "MPEG-4 audio stream",
    ".aac": "AAC audio stream",
    ".opus": "Opus audio stream",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def member_row(info: zipfile.ZipInfo) -> dict[str, Any]:
    return {
        "path": info.filename.replace("\\", "/"),
        "bytes": info.file_size,
        "compressedBytes": info.compress_size,
        "crc32": f"{info.CRC:08x}",
    }


def encoded_patterns(alias: str) -> tuple[tuple[str, bytes], ...]:
    return (
        ("utf-8", alias.encode("utf-8")),
        ("utf-16le", alias.encode("utf-16le")),
        ("utf-16be", alias.encode("utf-16be")),
    )


def is_ascii_word(value: int) -> bool:
    return (48 <= value <= 57) or (65 <= value <= 90) or (97 <= value <= 122) or value == 95


def byte_pattern_found(data: bytes, pattern: bytes, alias: str, encoding: str) -> bool:
    """Find an alias, enforcing token boundaries for Latin aliases."""
    latin = alias.isascii() and any(character.isalpha() for character in alias)
    search_data = data.lower() if latin else data
    search_pattern = pattern.lower() if latin else pattern
    start = 0
    while True:
        index = search_data.find(search_pattern, start)
        if index < 0:
            return False
        if not latin:
            return True
        before_ok = True
        after_ok = True
        if encoding == "utf-8":
            if index > 0:
                before_ok = not is_ascii_word(data[index - 1])
            end = index + len(search_pattern)
            if end < len(data):
                after_ok = not is_ascii_word(data[end])
        else:
            little = encoding == "utf-16le"
            if index >= 2:
                before_unit = int.from_bytes(data[index - 2:index], "little" if little else "big")
                before_ok = before_unit > 127 or not is_ascii_word(before_unit)
            end = index + len(search_pattern)
            if end + 1 < len(data):
                after_unit = int.from_bytes(data[end:end + 2], "little" if little else "big")
                after_ok = after_unit > 127 or not is_ascii_word(after_unit)
        if before_ok and after_ok:
            return True
        start = index + 1


def aliases_in_bytes(data: bytes, aliases: dict[str, tuple[str, ...]]) -> dict[str, list[str]]:
    hits: dict[str, list[str]] = {}
    for group, values in aliases.items():
        group_hits = []
        for alias in values:
            if any(byte_pattern_found(data, pattern, alias, encoding) for encoding, pattern in encoded_patterns(alias)):
                group_hits.append(alias)
        if group_hits:
            hits[group] = group_hits
    return suppress_generic_vearn(hits)


def aliases_in_text(text: str, aliases: dict[str, tuple[str, ...]]) -> dict[str, list[str]]:
    encoded = text.encode("utf-8", errors="surrogatepass")
    return aliases_in_bytes(encoded, aliases)


def suppress_generic_vearn(hits: dict[str, list[str]]) -> dict[str, list[str]]:
    if "vearn" in hits and any(group in hits for group in ("old-vearn", "young-vearn", "kigan-king-vearn", "mystvearn")):
        hits = dict(hits)
        hits.pop("vearn", None)
    return hits


def merge_hits(target: dict[str, set[str]], incoming: dict[str, list[str]]) -> None:
    for group, aliases in incoming.items():
        target.setdefault(group, set()).update(aliases)


def scan_stream(stream: BinaryIO, limit: int) -> tuple[dict[str, list[str]], dict[str, list[str]], int]:
    patterns = [
        encoded
        for aliases in tuple(TARGET_ALIASES.values()) + tuple(EXCLUDED_ALIASES.values())
        for alias in aliases
        for _encoding, encoded in encoded_patterns(alias)
    ]
    overlap = max(map(len, patterns)) - 1
    target_hits: dict[str, set[str]] = {}
    excluded_hits: dict[str, set[str]] = {}
    carry = b""
    read_bytes = 0
    while read_bytes < limit:
        chunk = stream.read(min(CHUNK_BYTES, limit - read_bytes))
        if not chunk:
            break
        read_bytes += len(chunk)
        window = carry + chunk
        merge_hits(target_hits, aliases_in_bytes(window, TARGET_ALIASES))
        merge_hits(excluded_hits, aliases_in_bytes(window, EXCLUDED_ALIASES))
        carry = window[-overlap:] if overlap else b""
    return (
        {group: sorted(values) for group, values in sorted(target_hits.items())},
        {group: sorted(values) for group, values in sorted(excluded_hits.items())},
        read_bytes,
    )


def read_magic(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    if info.is_dir() or info.file_size == 0:
        return b""
    with archive.open(info, "r") as stream:
        return stream.read(16)


def bundle_reasons(path: str, magic: bytes) -> list[str]:
    reasons = []
    if Path(path).suffix.casefold() in {item.casefold() for item in BUNDLE_EXTENSIONS}:
        reasons.append("bundle-extension")
    if magic.startswith(BUNDLE_MAGIC):
        reasons.append("unity-bundle-magic")
    if Path(path).suffix in SERIALIZED_EXTENSIONS or Path(path).suffix.casefold() in {item.casefold() for item in SERIALIZED_EXTENSIONS}:
        reasons.append("unity-serialized-resource-extension")
    return reasons


def inventory(
    apk: Path,
    *,
    expected_sha256: str | None = None,
    max_scan_member_bytes: int = DEFAULT_MAX_SCAN_MEMBER_BYTES,
    max_scan_total_bytes: int = DEFAULT_MAX_SCAN_TOTAL_BYTES,
) -> dict[str, Any]:
    apk = apk.resolve()
    if not apk.is_file():
        raise FileNotFoundError(apk)
    if apk.suffix.casefold() != ".apk":
        raise ValueError("Input must have an .apk suffix")
    if not zipfile.is_zipfile(apk):
        raise ValueError("Input is not a readable APK/ZIP container")

    source_sha256 = sha256_file(apk)
    if expected_sha256 and source_sha256.casefold() != expected_sha256.casefold():
        raise ValueError(f"APK SHA-256 mismatch: expected {expected_sha256}, got {source_sha256}")

    unity_paths = []
    bundles = []
    addressables = []
    audio = []
    identity_matches = []
    baran_exclusions = []
    extension_counts: Counter[str] = Counter()
    scanned_bytes = 0
    skipped_large = []
    skipped_budget = []

    with zipfile.ZipFile(apk) as archive:
        infos = sorted(archive.infolist(), key=lambda info: info.filename.casefold())
        if len(infos) > MAX_MEMBERS:
            raise ValueError(f"APK member limit exceeded: {len(infos)} > {MAX_MEMBERS}")

        for info in infos:
            if info.is_dir():
                continue
            row = member_row(info)
            path = row["path"]
            suffix = Path(path).suffix.casefold() or "(none)"
            extension_counts[suffix] += 1

            unity_kinds = [kind for kind, pattern in UNITY_PATH_RULES if pattern.search(path)]
            if unity_kinds:
                unity_paths.append({**row, "kinds": unity_kinds})

            magic = read_magic(archive, info)
            reasons = bundle_reasons(path, magic)
            if reasons:
                bundles.append({**row, "detectionReasons": reasons, "magicAscii": magic[:8].decode("ascii", errors="replace")})

            if ADDRESSABLE_PATTERN.search(path):
                addressables.append({**row, "detectionReason": "addressables-path-pattern"})

            audio_kind = AUDIO_EXTENSIONS.get(Path(path).suffix.casefold())
            if audio_kind:
                audio.append({**row, "containerType": audio_kind})

            path_targets = aliases_in_text(path, TARGET_ALIASES)
            path_exclusions = aliases_in_text(path, EXCLUDED_ALIASES)
            content_targets: dict[str, list[str]] = {}
            content_exclusions: dict[str, list[str]] = {}
            content_bytes = 0
            scan_status = "scanned"
            if info.file_size > max_scan_member_bytes:
                scan_status = "skipped-member-limit"
                skipped_large.append(row)
            elif scanned_bytes + info.file_size > max_scan_total_bytes:
                scan_status = "skipped-total-budget"
                skipped_budget.append(row)
            else:
                with archive.open(info, "r") as stream:
                    content_targets, content_exclusions, content_bytes = scan_stream(stream, info.file_size)
                scanned_bytes += content_bytes

            target_combined: dict[str, set[str]] = {}
            exclusion_combined: dict[str, set[str]] = {}
            merge_hits(target_combined, path_targets)
            merge_hits(target_combined, content_targets)
            merge_hits(exclusion_combined, path_exclusions)
            merge_hits(exclusion_combined, content_exclusions)
            target_serialized = {
                group: sorted(values) for group, values in sorted(target_combined.items())
            }
            target_serialized = suppress_generic_vearn(target_serialized)
            exclusion_serialized = {
                group: sorted(values) for group, values in sorted(exclusion_combined.items())
            }
            if target_serialized:
                identity_matches.append({
                    **row,
                    "targetForms": sorted(target_serialized),
                    "matchedAliases": target_serialized,
                    "evidence": {
                        "path": bool(path_targets),
                        "content": bool(content_targets),
                        "contentScanStatus": scan_status,
                        "contentBytesRead": content_bytes,
                    },
                    "baranAliasesAlsoPresent": exclusion_serialized,
                    "identityStatus": "alias-hit-only-needs-unity-object-or-catalog-correlation",
                })
            if exclusion_serialized:
                baran_exclusions.append({
                    **row,
                    "excludedIdentity": "baran",
                    "matchedAliases": exclusion_serialized,
                    "evidence": {
                        "path": bool(path_exclusions),
                        "content": bool(content_exclusions),
                        "contentScanStatus": scan_status,
                        "contentBytesRead": content_bytes,
                    },
                    "rule": "Baran is not Vearn and must never be registered as a Vearn candidate.",
                })

    unity_evidence = sorted({kind for row in unity_paths for kind in row["kinds"]})
    return {
        "schema": SCHEMA,
        "source": {
            "absolutePath": str(apk),
            "bytes": apk.stat().st_size,
            "sha256": source_sha256,
            "container": "APK/ZIP",
        },
        "safety": {
            "readOnly": True,
            "membersExtracted": False,
            "apkCodeExecuted": False,
            "dexOrNativeLibrariesExecuted": False,
            "unityOrManagedCodeExecuted": False,
        },
        "summary": {
            "memberCount": len(infos),
            "unityPathCount": len(unity_paths),
            "bundleCandidateCount": len(bundles),
            "addressableCandidateCount": len(addressables),
            "audioContainerCandidateCount": len(audio),
            "vearnAliasEvidenceCount": len(identity_matches),
            "baranExcludedEvidenceCount": len(baran_exclusions),
            "contentBytesScanned": scanned_bytes,
            "contentMembersSkippedBySize": len(skipped_large),
            "contentMembersSkippedByBudget": len(skipped_budget),
        },
        "unityDetection": {
            "isUnityCandidate": bool(unity_paths or bundles),
            "evidenceKinds": unity_evidence,
            "paths": unity_paths,
        },
        "bundleCandidates": bundles,
        "addressableCandidates": addressables,
        "audioContainerCandidates": audio,
        "identitySearch": {
            "targetAliases": {group: list(values) for group, values in TARGET_ALIASES.items()},
            "excludedAliases": {group: list(values) for group, values in EXCLUDED_ALIASES.items()},
            "matches": identity_matches,
            "baranExclusions": baran_exclusions,
            "interpretation": "An alias hit is discovery evidence only; it does not prove that a complete model, motion, VFX, SFX, or voice asset is present.",
        },
        "scanLimits": {
            "maxMemberBytes": max_scan_member_bytes,
            "maxTotalBytes": max_scan_total_bytes,
            "skippedByMemberLimit": skipped_large,
            "skippedByTotalBudget": skipped_budget,
        },
        "extensionCounts": dict(sorted(extension_counts.items())),
        "readiness": {
            "apkAcquired": True,
            "apkInventoried": True,
            "unityObjectsParsed": False,
            "characterIdentityConfirmed": False,
            "converted": False,
            "validated": False,
            "registered": False,
            "runtimeSelectable": False,
            "deployed": False,
        },
    }


def serialize(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be non-negative")
    return parsed


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path, help="Path to the Japanese APK")
    parser.add_argument("--output", type=Path, help="Write JSON here; stdout when omitted")
    parser.add_argument("--expected-sha256", help="Fail if the APK does not match this SHA-256")
    parser.add_argument("--max-scan-member-bytes", type=positive_int, default=DEFAULT_MAX_SCAN_MEMBER_BYTES)
    parser.add_argument("--max-scan-total-bytes", type=positive_int, default=DEFAULT_MAX_SCAN_TOTAL_BYTES)
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        payload = inventory(
            args.apk,
            expected_sha256=args.expected_sha256,
            max_scan_member_bytes=args.max_scan_member_bytes,
            max_scan_total_bytes=args.max_scan_total_bytes,
        )
        rendered = serialize(payload)
        if args.output:
            output = args.output.resolve()
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(rendered, encoding="utf-8")
        else:
            sys.stdout.write(rendered)
        return 0
    except (FileNotFoundError, ValueError, zipfile.BadZipFile, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
