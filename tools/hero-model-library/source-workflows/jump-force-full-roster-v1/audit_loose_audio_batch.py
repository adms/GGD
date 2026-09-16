#!/usr/bin/env python3
"""Verify the complete existing loose JUMP FORCE Streaming audio batch.

The optional local cache makes repeated checks resumable.  A cache hit requires
the same frozen index digest, expected file digest, size, and nanosecond mtime.
Use ``--full-rehash`` for a fresh byte-for-byte audit.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import wave
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
LOCAL_ROOT = WORKSPACE / "GGD-Asset-Library/extracted/jumpforce-steam-streaming-audio-v1"
INDEX = LOCAL_ROOT / "audio-file-index.json"
SUMMARY = LOCAL_ROOT / "source-summary.json"
CACHE = LOCAL_ROOT / "verification-cache-full-roster-v1.json"
IDENTITY = REPO / "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1/identity-map.json"
BINDINGS = REPO / "materials/hero-model-library/priority-evidence/jump-force-full-roster-v1/audio-identity-bindings.json"
DOWNLOADS = REPO / "materials/hero-model-library/download-sources.json"
OUTPUT = REPO / "materials/hero-model-library/priority-evidence/jump-force-full-roster-v1/loose-streaming-audio-batch.json"
OUTPUT_MD = REPO / "materials/hero-model-library/priority-evidence/jump-force-full-roster-v1/loose-streaming-audio-batch.md"
SOURCE_ID = "steam-jump-force-streaming-audio-816020-build-8523149"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_cache(path: Path, index_sha: str, full_rehash: bool) -> dict[str, dict]:
    if full_rehash or not path.is_file():
        return {}
    cache = json.loads(path.read_text(encoding="utf-8"))
    if cache.get("schema") != "ggd.jumpforce-local-verification-cache@1" or cache.get("audioFileIndexSha256") != index_sha:
        return {}
    return cache.get("files", {})


def verify_wav(path: Path, expected: dict, cached: dict | None) -> tuple[dict, bool]:
    stat = path.stat()
    if stat.st_size != expected["bytes"]:
        raise ValueError(f"size mismatch: {path}")
    reused = bool(
        cached
        and cached.get("bytes") == stat.st_size
        and cached.get("mtimeNs") == stat.st_mtime_ns
        and cached.get("expectedSha256") == expected["sha256"]
        and cached.get("verifiedSha256") == expected["sha256"]
    )
    if not reused and sha256(path) != expected["sha256"]:
        raise ValueError(f"SHA-256 mismatch: {path}")
    with wave.open(str(path), "rb") as stream:
        frames = stream.getnframes()
        rate = stream.getframerate()
        channels = stream.getnchannels()
        sample_width = stream.getsampwidth()
    if frames <= 0 or rate <= 0 or channels <= 0 or sample_width <= 0:
        raise ValueError(f"invalid WAV header: {path}")
    return {
        "bytes": stat.st_size,
        "mtimeNs": stat.st_mtime_ns,
        "expectedSha256": expected["sha256"],
        "verifiedSha256": expected["sha256"],
    }, reused


def build(*, full_rehash: bool = False, cache_path: Path = CACHE) -> tuple[dict, dict, dict]:
    index_sha = sha256(INDEX)
    source_summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
    audio_index = json.loads(INDEX.read_text(encoding="utf-8"))
    identity = json.loads(IDENTITY.read_text(encoding="utf-8"))
    bindings = json.loads(BINDINGS.read_text(encoding="utf-8"))
    downloads = json.loads(DOWNLOADS.read_text(encoding="utf-8"))
    if source_summary.get("sourceId") != SOURCE_ID or audio_index.get("sourceId") != SOURCE_ID:
        raise ValueError("unexpected JUMP FORCE audio source")
    if index_sha != source_summary.get("audioFileIndex", {}).get("sha256"):
        raise ValueError("audio index differs from frozen source summary")
    if audio_index.get("summary", {}).get("decodedFiles") != 4034:
        raise ValueError("expected the complete 4,034-file decoded delivery")

    identity_by_id = {
        row["nativeCharacterIdToken"]: row
        for row in identity.get("tokens", [])
        if row.get("identityConfidence") == "high"
    }
    binding_by_id = {row["nativeCharacterId"]: row for row in bindings.get("bindings", [])}
    source = next(row for row in downloads.get("publicSources", []) if row.get("id") == SOURCE_ID)
    registered_groups = {row["id"]: row for row in source.get("audioGroups", [])}
    old_cache = load_cache(cache_path, index_sha, full_rehash)
    new_cache_files = {}
    stats = {"hashed": 0, "reused": 0}
    groups: dict[str, dict] = {}

    for row in audio_index["files"]:
        relative = row["path"]
        path = (LOCAL_ROOT / relative).resolve()
        if not path.is_relative_to(LOCAL_ROOT) or not path.is_file():
            raise ValueError(f"missing or unsafe decoded path: {relative}")
        cache_row, reused = verify_wav(path, row, old_cache.get(relative))
        new_cache_files[relative] = cache_row
        stats["reused" if reused else "hashed"] += 1
        group_id = row.get("nativeCharacterId") or "common"
        group = groups.setdefault(group_id, {
            "files": 0,
            "bytes": 0,
            "durationSeconds": 0.0,
            "categories": collections.Counter(),
            "digestRows": [],
        })
        group["files"] += 1
        group["bytes"] += row["bytes"]
        group["durationSeconds"] += row.get("durationSeconds", 0.0)
        group["categories"][row["sourceCategory"]] += 1
        group["digestRows"].append(f"{relative}\0{row['bytes']}\0{row['sha256']}")

    character_rows = []
    common = groups.pop("common")
    for native_id, group in sorted(groups.items()):
        identity_row = identity_by_id.get(native_id)
        registered = registered_groups.get(native_id)
        if not registered or registered.get("fileCount") != group["files"]:
            raise ValueError(f"central source group is absent or stale: {native_id}")
        digest = hashlib.sha256("\n".join(sorted(group.pop("digestRows"))).encode("utf-8")).hexdigest()
        binding = binding_by_id.get(native_id)
        character_rows.append({
            "nativeCharacterId": native_id,
            "characterName": registered.get("characterName") or registered.get("name"),
            "identityState": "verified-high-confidence-character-family" if identity_row else "unresolved-native-id-retained",
            "heroIds": list(binding["heroIds"]) if binding else [],
            "decodedFiles": group["files"],
            "decodedBytes": group["bytes"],
            "durationSeconds": group["durationSeconds"],
            "sourceCategoryCounts": dict(sorted(group["categories"].items())),
            "fileSetSha256": digest,
            "sourceCatalogRegistered": True,
            "clipListeningReviewed": False,
            "runtimeBindingCreated": False,
        })

    common_digest = hashlib.sha256("\n".join(sorted(common.pop("digestRows"))).encode("utf-8")).hexdigest()
    mapped = [row for row in character_rows if row["heroIds"]]
    high = [row for row in character_rows if row["identityState"].startswith("verified")]
    category_totals = collections.Counter(row["sourceCategory"] for row in audio_index["files"])
    receipt = {
        "schema": "ggd.jumpforce-loose-streaming-audio-batch@1",
        "asOfDate": "2026-09-15",
        "sourceId": SOURCE_ID,
        "scope": {
            "source": "user-owned Steam App 816020 build 8523149 loose Streaming AWB",
            "excludesEncryptedPakPayload": True,
            "excludedRepeatedCharacters": ["Dai/chr0430", "Popp", "Vearn"],
        },
        "inputs": {
            "audioFileIndex": {"absolutePath": str(INDEX), "bytes": INDEX.stat().st_size, "sha256": index_sha},
            "sourceSummary": {"absolutePath": str(SUMMARY), "bytes": SUMMARY.stat().st_size, "sha256": sha256(SUMMARY)},
            "identityMap": {"gitPath": IDENTITY.relative_to(REPO).as_posix(), "sha256": sha256(IDENTITY)},
            "identityBindings": {"gitPath": BINDINGS.relative_to(REPO).as_posix(), "sha256": sha256(BINDINGS)},
        },
        "summary": {
            "decodedWavFilesVerified": len(audio_index["files"]),
            "decodedWavBytesVerified": sum(row["bytes"] for row in audio_index["files"]),
            "decodedVoiceLabelFiles": category_totals["voice"],
            "decodedSoundEffectFiles": category_totals["sfx"],
            "decodedMusicFiles": category_totals["music"],
            "nativeCharacterGroups": len(character_rows),
            "highConfidenceCharacterGroups": len(high),
            "unresolvedNativeIdGroups": len(character_rows) - len(high),
            "characterFiles": sum(row["decodedFiles"] for row in character_rows),
            "commonMusicAndSfxFiles": common["files"],
            "characterGroupsLinkedToExistingHeroes": len(mapped),
            "distinctExistingHeroIdsLinked": len({hero for row in mapped for hero in row["heroIds"]}),
            "modelsConverted": 0,
            "motionsConverted": 0,
            "vfxConverted": 0,
            "runtimeAudioBindingsCreated": 0,
            "backendOptionsAdded": 0,
            "productionDeployments": 0,
        },
        "modelPolicyForFutureExtractedPayload": {
            "sourceTrianglesAbove": 10000,
            "targetTrianglesStrictlyBelow": 8000,
            "protectedPrimitives": ["face", "eyes", "eye-shadow", "lens", "mouth", "transparent-overlay"],
            "appliedToThisAudioOnlyBatch": False,
        },
        "characters": character_rows,
        "commonAudio": {
            "decodedFiles": common["files"],
            "decodedBytes": common["bytes"],
            "durationSeconds": common["durationSeconds"],
            "sourceCategoryCounts": dict(sorted(common["categories"].items())),
            "fileSetSha256": common_digest,
        },
        "stages": {
            "sourceAwbPreserved": "completed-before-this-batch",
            "decodeToWav": "completed-and-full-local-sha256-verified",
            "sourceCatalogRegistration": "completed-for-37-character-groups-and-common-audio",
            "characterFamilyHeroAssociation": "completed-for-8-exact-groups",
            "clipListeningReview": "pending",
            "speakerLanguageEventMapping": "pending",
            "runtimeBinding": "not-started",
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
    }
    cache = {
        "schema": "ggd.jumpforce-local-verification-cache@1",
        "audioFileIndexSha256": index_sha,
        "files": new_cache_files,
    }
    return receipt, cache, stats


def render_markdown(receipt: dict) -> str:
    s = receipt["summary"]
    lines = [
        "# JUMP FORCE loose Streaming 音訊批次",
        "",
        "> 本頁由 `audit_loose_audio_batch.py` 產生。來源角色群登記不等於逐段說話者、語言、事件、技能或 runtime 綁定。",
        "",
        f"已逐檔驗證 **{s['decodedWavFilesVerified']:,} WAV／{s['decodedWavBytesVerified']:,} bytes**：原生 bank 標籤分類為語音 {s['decodedVoiceLabelFiles']:,}、音效 {s['decodedSoundEffectFiles']:,}、音樂 {s['decodedMusicFiles']:,}。其中 {s['nativeCharacterGroups']} 個原生角色群共 {s['characterFiles']:,} 檔，另有 {s['commonMusicAndSfxFiles']:,} 個共用音樂／音效檔。",
        "",
        f"{s['highConfidenceCharacterGroups']} 個角色群已有高信度 `chr####` 身份；{s['characterGroupsLinkedToExistingHeroes']} 組以明確角色家族關係連到 {s['distinctExistingHeroIdsLinked']} 個現有 GGD hero ID。這仍未建立任何 runtime 音訊事件。",
        "",
        "| 原生 ID | 角色 | WAV | 現有 hero ID | 狀態 |",
        "|---|---|---:|---|---|",
    ]
    for row in receipt["characters"]:
        heroes = "、".join(f"`{hero}`" for hero in row["heroIds"]) or "待對應"
        lines.append(f"| `{row['nativeCharacterId']}` | {row['characterName']} | {row['decodedFiles']} | {heroes} | {row['identityState']}／待逐段聽審 |")
    lines.extend([
        "",
        "模型、動作與 VFX 仍在六顆加密 PAK 內；沒有授權注入的 AES key 時不執行抽取。本批模型／動作／VFX 成品皆為 0，沒有後台選項或正式部署。",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    parser.add_argument("--full-rehash", action="store_true")
    parser.add_argument("--cache", type=Path, default=CACHE)
    args = parser.parse_args()
    receipt, cache, stats = build(full_rehash=args.full_rehash, cache_path=args.cache)
    expected_json = json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
    expected_md = render_markdown(receipt)
    if args.write:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(expected_json, encoding="utf-8")
        OUTPUT_MD.write_text(expected_md, encoding="utf-8")
        args.cache.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    else:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding="utf-8") != expected_json:
            raise SystemExit(f"stale JUMP FORCE loose audio receipt: {OUTPUT}")
        if not OUTPUT_MD.is_file() or OUTPUT_MD.read_text(encoding="utf-8") != expected_md:
            raise SystemExit(f"stale JUMP FORCE loose audio report: {OUTPUT_MD}")
    print(json.dumps({**receipt["summary"], "filesHashedThisRun": stats["hashed"], "filesReusedFromCache": stats["reused"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
