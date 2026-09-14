#!/usr/bin/env python3
"""Build an immutable local evidence set for post-transformation Vearn.

This workflow searches both complete Infinity Strash PAK indexes, verifies the
source PAK bytes, rehashes every already-extracted EN801/EN653 package, and
extracts a small set of EN680/EN681 comparison probes.  The comparison probes
exist to preserve the identity boundary: Baran and MystVearn must never be
silently relabelled as Vearn's post-transformation body.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path


SCHEMA = "ggd.infinity-strash-vearn-post-form-audit@2"
SOURCE_ID = "infinity-strash-vearn-post-form-local-audit-v2"
EXPECTED_PAKS = {
    "pakchunk0": {
        "bytes": 8_332_792_957,
        "sha256": "192069367059ef2a258c6c3f1e12908a16a05bcf5cfdb32e252cb676f766b5ee",
        "indexedEntries": 181_304,
    },
    "pakchunk1": {
        "bytes": 4_382_548_320,
        "sha256": "78edc35c624dbab88a378cf3d2b20ed48c43c05d844ec342a00a868771733095",
        "indexedEntries": 12_254,
    },
}
IDENTITIES = {
    "EN801": {
        "nameZh": "巴恩大魔王（老年／變身前）",
        "originalName": "Vearn",
        "relationship": "target-pre-transformation-form",
        "identityPath": "strash/Content/WwiseAudio/Events/EN_Boss/EN801_Vearn/EN801_Vearn_FOLDER.uasset",
        "bodyRoot": "strash/Content/Strash/Chara/Monster/EN801/00/SK_EN801_00_Body",
        "blueprintRoot": "strash/Content/Strash/Chara/Monster/EN801/CB_EN801_00_a",
    },
    "EN653": {
        "nameZh": "密斯特巴恩",
        "originalName": "MystVearn",
        "relationship": "separate-character-not-post-transformation-vearn",
        "identityPath": "strash/Content/WwiseAudio/Events/EN_Boss/EN653_MystVearn/Atk01_kugutsusyo/Atk01_kugutsusyo_FOLDER.uasset",
        "bodyRoot": "strash/Content/Strash/Chara/Monster/EN653/01/SK_EN653_01_model",
        "blueprintRoot": "strash/Content/Strash/Chara/Monster/EN653/CB_EN653_00_a",
    },
    "EN680": {
        "nameZh": "巴蘭",
        "originalName": "Baran",
        "relationship": "separate-character-not-vearn",
        "identityPath": "strash/Content/WwiseAudio/Events/EN_Boss/EN680_Baran/EN680_Baran_FOLDER.uasset",
        "bodyRoot": "strash/Content/Strash/Chara/Monster/EN680/00/SK_EN680_00_model",
        "blueprintRoot": "strash/Content/Strash/Chara/Monster/EN680/CB_EN680_00_a",
    },
    "EN681": {
        "nameZh": "龍魔人巴蘭",
        "originalName": "Ryu Baran / Baran_ma",
        "relationship": "separate-baran-form-not-vearn",
        "identityPath": "strash/Content/Strash/LevelDesign/Spawner/AISpawnerData/BG17_FM0007_FG16_ADDBOSS0018/BG17_FM0008_FG19_ADDBOSS0012_StrashAISpawner_W2_EN681_RyuBaran.uasset",
        "bodyRoot": "strash/Content/Strash/Chara/Monster/EN681/00/SK_EN681_00_model",
        "blueprintRoot": "strash/Content/Strash/Chara/Monster/EN681/CB_EN681_00_a",
    },
}
POST_FORM_PATTERNS = tuple(
    re.compile(value, re.I)
    for value in (
        r"(?:young|youth|true|final|shin|post)[_-]?(?:dark[_-]?king[_-]?)?vearn",
        r"vearn[_-]?(?:young|youth|true|final|shin|post|transform)",
        r"(?:真|若|青年).*バーン",
    )
)
PACKAGE_SUFFIXES = (".uasset", ".uexp", ".ubulk")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def classify(path: str) -> str:
    lower = path.lower()
    stem = Path(path).stem.lower()
    if "/wwiseaudio/" in lower or "/sound/" in lower or "/audio/" in lower:
        return "audio"
    if "/vfx/" in lower or "/effect/" in lower or stem.startswith(("nps_", "ns_", "ps_")):
        return "vfx"
    if "/animations/" in lower or stem.startswith(("as_", "am_", "ab_")):
        return "motion"
    if "skeleton" in stem:
        return "skeleton"
    if stem.startswith("t_") or "/texture" in lower:
        return "texture"
    if stem.startswith("sk_"):
        return "model"
    if stem.startswith(("m_", "mi_")) or "/material" in lower:
        return "material"
    if stem.startswith(("cb_", "ai", "dt_")) or "/db/" in lower:
        return "configuration"
    return "related-package"


def read_listing(path: Path) -> list[str]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return stream.read().splitlines()


def file_record(path: Path, *, archive_path: str | None = None) -> dict:
    return {
        "archivePath": archive_path,
        "absolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "category": classify(archive_path or path.name),
    }


def package_members(root: str, all_paths: set[str]) -> list[str]:
    return [root + suffix for suffix in PACKAGE_SUFFIXES if root + suffix in all_paths]


def extract_member(repak: Path, pak: Path, member: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as stream:
        subprocess.run([str(repak), "get", str(pak), member], check=True, stdout=stream)


def build(args: argparse.Namespace) -> dict:
    repo = Path(__file__).resolve().parents[4]
    output = args.output.resolve()
    if output.exists():
        raise ValueError("output must be new so the evidence set remains immutable")
    output.mkdir(parents=True)

    listing_paths = {"pakchunk0": args.pak0_index.resolve(), "pakchunk1": args.pak1_index.resolve()}
    listings = {label: read_listing(path) for label, path in listing_paths.items()}
    combined = sorted({row for values in listings.values() for row in values})
    all_paths = set(combined)
    if len(combined) != 193_558:
        raise ValueError(f"unexpected unique PAK entry count: {len(combined)}")

    pak_paths = {"pakchunk0": args.pak0.resolve(), "pakchunk1": args.pak1.resolve()}
    pak_records = []
    for label, pak in pak_paths.items():
        expected = EXPECTED_PAKS[label]
        actual = {"bytes": pak.stat().st_size, "sha256": sha256(pak), "indexedEntries": len(listings[label])}
        if actual != expected:
            raise ValueError(f"{label} differs: {actual}")
        pak_records.append({"label": label, "absolutePath": str(pak), **actual})

    repak = args.repak.resolve()
    repak_record = file_record(repak)
    listing_records = [file_record(path) for path in listing_paths.values()]

    priority_index_path = args.priority_index.resolve()
    priority = json.loads(priority_index_path.read_text(encoding="utf-8"))
    if priority.get("selection", {}).get("nativeIdTokens") != ["PN010", "EN801", "EN653"]:
        raise ValueError("unexpected priority extraction selection")
    priority_rows = {native_id: [] for native_id in ("EN801", "EN653")}
    for row in priority["files"]:
        native_id = row.get("identityId")
        if native_id not in priority_rows:
            continue
        local = Path(row["absolutePath"])
        actual = file_record(local, archive_path=row["path"])
        if (actual["bytes"], actual["sha256"]) != (row["bytes"], row["sha256"]):
            raise ValueError(f"priority extraction byte mismatch: {local}")
        priority_rows[native_id].append(actual)

    identities = {}
    critical_probes = []
    for native_id, identity in IDENTITIES.items():
        native_paths = [path for path in combined if re.search(rf"(?<![A-Za-z0-9]){native_id}(?![A-Za-z0-9])", path, re.I)]
        if identity["identityPath"] not in all_paths:
            raise ValueError(f"identity evidence path is missing: {identity['identityPath']}")
        body_members = package_members(identity["bodyRoot"], all_paths)
        blueprint_members = package_members(identity["blueprintRoot"], all_paths)
        if not body_members or not blueprint_members:
            raise ValueError(f"critical {native_id} package is incomplete")
        probe_records = []
        for member in body_members + blueprint_members:
            destination = output / "serialized-probes" / native_id / Path(member).name
            extract_member(repak, pak_paths["pakchunk0"], member, destination)
            record = file_record(destination, archive_path=member)
            probe_records.append(record)
            critical_probes.append(record)

        categories = Counter(classify(path) for path in native_paths)
        extracted_rows = priority_rows.get(native_id, [])
        identities[native_id] = {
            **identity,
            "indexedPathCount": len(native_paths),
            "indexedCategoryCounts": dict(sorted(categories.items())),
            "bodyPackageMembers": body_members,
            "blueprintPackageMembers": blueprint_members,
            "criticalProbeFiles": probe_records,
            "alreadyExtractedFilesRehashed": len(extracted_rows),
            "alreadyExtractedBytesRehashed": sum(row["bytes"] for row in extracted_rows),
            "alreadyExtractedCategoryCounts": dict(sorted(Counter(row["category"] for row in extracted_rows).items())),
        }

    body_regex = re.compile(
        r"^strash/Content/Strash/Chara/Monster/(EN\d{3})/(?:[^/]+/)*"
        r"(?:SK_[^/]*(?:Body|model)|SK_EN\d{3}_\d{2})\.uasset$",
        re.I,
    )
    monster_bodies = [path for path in combined if body_regex.match(path)]
    en8xx_bodies = [path for path in monster_bodies if re.search(r"/EN8\d{2}/", path, re.I)]
    post_name_hits = [path for path in combined if any(pattern.search(path) for pattern in POST_FORM_PATTERNS)]
    en801_body_members = identities["EN801"]["bodyPackageMembers"]
    en801_body_assets = [path for path in en801_body_members if path.endswith(".uasset")]
    if en801_body_assets != ["strash/Content/Strash/Chara/Monster/EN801/00/SK_EN801_00_Body.uasset"]:
        raise ValueError(f"unexpected EN801 body assets: {en801_body_assets}")
    if post_name_hits:
        raise ValueError(f"post-form name candidate requires human review: {post_name_hits[:5]}")

    prior_form_audit = repo / "materials/hero-model-library/priority-evidence/infinity-strash-vearn-form-audit-v1/report.json"
    prior_visual = (
        repo
        / "materials/hero-model-library/priority-evidence/infinity-strash-original-raw-v2/macos-native-export/"
        "runtime-candidates-v1/vearn-en801-pre-transformation/contact-sheet.png"
    )
    if not prior_form_audit.is_file() or not prior_visual.is_file():
        raise ValueError("pre-transformation identity evidence is missing")

    report = {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "platform": "Windows Steam build represented by the user-owned 2024-03-28 source snapshot",
        "sourceContainers": pak_records,
        "tools": {"repak": repak_record},
        "listingEvidence": listing_records,
        "sourceLineage": {
            "priorityExtractionIndex": file_record(priority_index_path),
            "priorFormAudit": {
                "gitPath": prior_form_audit.relative_to(repo).as_posix(),
                "bytes": prior_form_audit.stat().st_size,
                "sha256": sha256(prior_form_audit),
            },
            "preTransformationVisualEvidence": {
                "gitPath": prior_visual.relative_to(repo).as_posix(),
                "bytes": prior_visual.stat().st_size,
                "sha256": sha256(prior_visual),
                "identityConclusion": "EN801/00 is elderly/pre-transformation Vearn",
            },
        },
        "scope": {
            "indexedEntries": sum(len(rows) for rows in listings.values()),
            "uniqueIndexedEntries": len(combined),
            "monsterBodyAssets": len(monster_bodies),
            "en8xxBodyAssets": en8xx_bodies,
            "postTransformationNamePatterns": [
                "young/youth/true/final/shin/post + Vearn",
                "Vearn + young/youth/true/final/shin/post/transform",
                "Japanese young/true + Vearn",
            ],
            "postTransformationNameHits": post_name_hits,
        },
        "identities": identities,
        "criticalProbeSummary": {
            "files": len(critical_probes),
            "bytes": sum(row["bytes"] for row in critical_probes),
            "allFilesSha256Recorded": True,
        },
        "result": {
            "preTransformationOldVearnNativeBodyLocated": True,
            "postTransformationYoungTrueBodyLocated": False,
            "convertedPostTransformationModelCount": 0,
            "postTransformationRuntimeOptionCount": 0,
            "status": "identity-separated-source-gap-confirmed",
            "nextAction": "retain post-transformation Vearn as not-located and acquire an explicitly identified licensed source",
        },
        "identityRules": [
            "EN801 is Vearn and the shipped body has already been visually accepted only as elderly/pre-transformation Vearn.",
            "EN653 is MystVearn, a separate character; its static component cannot fill Vearn's post-transformation gap.",
            "EN680 is Baran and EN681 is a Baran form; neither is Vearn.",
            "Kaizer Phoenix is a skill/helper mesh and cannot be counted as a second character body.",
            "No unconfirmed EN native ID may be assigned to young/post-transformation Vearn from numeric proximity alone.",
        ],
        "limitations": [
            "This audit establishes the state of the two preserved primary PAKs and existing local acquisition index only.",
            "A zero result does not prove that no separately licensed community or other-game model exists.",
            "No new post-transformation model was found, so conversion, validation, dropdown registration and deployment remain zero.",
            "The EN680/EN681 probes are identity evidence only and are not conversion or hero-registration work.",
        ],
    }
    report_path = output / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest_files = []
    for path in sorted(p for p in output.rglob("*") if p.is_file() and p != report_path):
        manifest_files.append(file_record(path))
    manifest = {
        "schema": "ggd.asset-evidence-manifest@1",
        "sourceId": SOURCE_ID,
        "files": manifest_files,
        "fileCount": len(manifest_files),
        "bytes": sum(row["bytes"] for row in manifest_files),
    }
    (output / "files.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pak0", type=Path, required=True)
    parser.add_argument("--pak1", type=Path, required=True)
    parser.add_argument("--pak0-index", type=Path, required=True)
    parser.add_argument("--pak1-index", type=Path, required=True)
    parser.add_argument("--priority-index", type=Path, required=True)
    parser.add_argument("--repak", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build(args)
    print(json.dumps({
        "sourceId": report["sourceId"],
        "status": report["result"]["status"],
        "postTransformationBody": report["result"]["postTransformationYoungTrueBodyLocated"],
        "criticalProbeFiles": report["criticalProbeSummary"]["files"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
