#!/usr/bin/env python3
"""Synchronize project-seven base event reports into the central source record."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "lol-project-seven-ja-jp-16.18.8159717"
EXPECTED = ["Karthus", "LeeSin", "Lux", "MissFortune", "Warwick", "Xerath", "Yasuo"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def synchronize(catalog: dict, reports_root: Path, repo_root: Path) -> dict:
    matches = [row for row in catalog["publicSources"] if row.get("id") == SOURCE_ID]
    if len(matches) != 1:
        raise ValueError("Central project-seven source is not unique")
    source = matches[0]
    reports = []
    unique_paths = set()
    by_native = {}
    for native_id in EXPECTED:
        path = reports_root / f"{native_id.casefold()}-base.json"
        report = json.loads(path.read_text())
        validation = report["validation"]
        if (report.get("schema") != "ggd-lol-native-event-bindings@1"
                or report.get("sourceId") != SOURCE_ID or report.get("nativeId") != native_id
                or report.get("skinId") != "skin0" or validation.get("eventBindingsVerified") is not True
                or validation.get("speakerVerified") is not False
                or validation.get("perClipLanguageVerified") is not False
                or validation.get("ggdSkillSemanticBindingsVerified") is not False):
            raise ValueError(f"Unexpected report state: {path}")
        for row in report["files"]:
            unique_paths.add(row["absolutePath"])
        relative = path.resolve().relative_to(repo_root.resolve()).as_posix()
        item = {
            "path": relative,
            "sha256": sha256(path),
            "heroId": report["heroId"],
            "nativeId": native_id,
            "skinId": "skin0",
            "eventBoundWavCount": validation["mappedWemIds"],
            "mappedNativeEventCount": validation["mappedEvents"],
            "eventBindingsVerified": True,
            "speakerVerified": False,
            "perClipLanguageVerified": False,
            "ggdSkillSemanticBindingsVerified": False,
        }
        reports.append(item)
        by_native[native_id] = item

    for group in source["audioGroups"]:
        native_id = group["nativeId"].removesuffix(".ja_JP")
        if native_id not in by_native:
            raise ValueError(f"Audio group has no base event report: {native_id}")
        report = by_native[native_id]
        group.update({
            "eventBindingsVerified": False,
            "eventBindingCoverage": "partial-base-skin",
            "eventBoundWavCount": report["eventBoundWavCount"],
            "mappedNativeEventCount": report["mappedNativeEventCount"],
            "eventBindingReport": report["path"],
            "eventBindingReportSha256": report["sha256"],
        })

    total_events = sum(row["mappedNativeEventCount"] for row in reports)
    source["readiness"] = "local-audio-hash-verified-all-seven-base-events-mapped-pending-listening-gain-other-skins-and-runtime"
    source["eventBindingEvidence"] = {
        "state": "all-seven-base-skin-mapped-partial-by-skin",
        "completeForSource": False,
        "reports": reports,
        "nativeEventBoundUniqueFiles": len(unique_paths),
        "mappedNativeEventCount": total_events,
        "note": "All seven base skin0 event graphs are mapped. Other skins, listening, speaker/language/transcript review, GGD skill semantics, backend playback and deployment remain incomplete.",
    }
    source["verification"] = (
        "4,927 exact-seven Float32 WAV files passed fresh SHA checks. All 15,690 frozen raw/container/"
        "intermediate/control files plus one exact delivery JSON have a prior full-GET S3 receipt. "
        f"All seven base skin0 reports map {len(unique_paths)} exact WAVs through {total_events} native events. "
        "Speaker identity, per-clip language, transcript, GGD skill semantic binding, other skins, backend playback and deployment remain pending."
    )
    replacement = "All seven base skin0 event graphs are mapped; other skins and runtime semantic bindings remain incomplete."
    limitations = [row for row in source["limitations"]
                   if "Karthus event mapping currently covers only base skin0" not in row]
    if replacement not in limitations:
        limitations.append(replacement)
    source["limitations"] = limitations
    # The repository's record_supplemental_backup.py owns verified S3 linkage.
    # Remove an obsolete duplicate if an earlier run put this delivery in the
    # older free-form field; keep all unrelated historical backup rows.
    source["supplementalBackups"] = [
        row for row in source.get("supplementalBackups", [])
        if row.get("id") != "lol-project-seven-ja-jp-16.18.8159717-event-bindings-base-seven-v1"
    ]
    return catalog


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--reports", type=Path, required=True)
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    original = args.catalog.read_text()
    catalog = json.loads(original)
    synchronize(catalog, args.reports.resolve(), args.repo_root.resolve())
    rendered = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if rendered != original:
            raise SystemExit("Central source event-binding evidence is stale")
        print("project-seven central event-binding evidence is current")
    else:
        args.catalog.write_text(rendered)
        print(json.dumps({"catalog": str(args.catalog), "reports": len(EXPECTED)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
