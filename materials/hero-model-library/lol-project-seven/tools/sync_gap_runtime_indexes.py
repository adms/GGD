#!/usr/bin/env python3
"""Project approved LoL gap registrations into the existing central voice indexes.

This narrow updater deliberately avoids rebuilding unrelated source archives. It
verifies the frozen registration and updates only matching review-key rows plus
their aggregate counts.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / "materials/hero-model-library/lol-project-seven"
VOICE_INDEX = ROOT / "materials/hero-model-library/voice-index.json"
VOICE_FILES = ROOT / "materials/hero-model-library/voice-files.jsonl.gz"
NATIVE_TO_RUNTIME = {
    "Karthus": "lol-karthus", "LeeSin": "lol-leesin", "Lux": "lol-lux",
    "MissFortune": "lol-missfortune", "Warwick": "lol-warwick",
    "Xerath": "lol-xerath", "Yasuo": "lol-yasuo",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build() -> tuple[bytes, str]:
    registration = json.loads((BASE / "runtime-registration.json").read_text())
    gap = json.loads((BASE / "gap-listening-decisions.json").read_text())
    gap_keys = {row["key"] for row in gap["decisions"] if row["runtimeApproved"]}
    records = {row["reviewKey"]: row for row in registration["records"] if row["reviewKey"] in gap_keys}
    if set(records) != gap_keys or len(records) != gap["summary"]["approved"]:
        raise ValueError("runtime registration does not contain every approved gap decision")

    rows = []
    updated = Counter()
    with gzip.open(VOICE_FILES, "rt", encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            record = records.get(row.get("listeningReviewKey"))
            if record is not None:
                if (row.get("sha256"), row.get("bytes")) != (record["sourceSha256"], record["sourceBytes"]):
                    raise ValueError("central source row differs: " + record["reviewKey"])
                row.update(
                    candidateRuntimeTarget=record["candidateRuntimeTarget"],
                    reviewStatus="verified", speakerCandidate=record["nativeId"],
                    speakerVerified=True, language="ja", perClipLanguageVerified=True,
                    gainDecision="keep-source-gain", ggdSkillSemanticBindingVerified=True,
                    runtimeApproved=True, runtimeSelectable=True, listeningReviewComplete=True,
                    runtimeHeroId=record["runtimeHeroId"], runtimeCategory=record["runtimeCategory"],
                    runtimeTakeKey=record["runtimeTakeKey"], runtimePath=record["runtimePath"],
                    runtimeSha256=record["runtimeSha256"], approvalAuthority=record["approvalAuthority"],
                )
                updated[record["reviewKey"]] += 1
            rows.append(row)
    if set(updated) != gap_keys or any(count < 1 for count in updated.values()):
        raise ValueError("one or more approved gap keys are absent from voice-files")
    manifest = "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows)
    compressed = gzip.compress(manifest.encode(), mtime=0)

    index = json.loads(VOICE_INDEX.read_text())
    review = index["listeningReview"]
    review.update(
        gapDecisionsPath="materials/hero-model-library/lol-project-seven/gap-listening-decisions.json",
        gapDecisionsSha256=sha256(BASE / "gap-listening-decisions.json"),
        baseRuntimeApproved=registration["summary"]["approved"] - gap["summary"]["approved"],
        gapRuntimeApproved=gap["summary"]["approved"],
        runtimeApproved=registration["summary"]["approved"],
        runtimeRegistered=registration["summary"]["runtimeRegistered"],
    )
    index["summary"]["listeningReviewApprovedFiles"] = registration["summary"]["approved"]
    per_native = Counter(row["nativeId"] for row in registration["records"])
    for source in index["nativeEventBindingSources"]:
        if source["nativeId"] in per_native:
            source["listeningReviewApprovedFiles"] = per_native[source["nativeId"]]
    for group in index["groups"]:
        for native_id, count in per_native.items():
            if group["id"].endswith(":" + NATIVE_TO_RUNTIME[native_id] + "-ja-jp-16-18-8159717"):
                group["listeningReviewApprovedFiles"] = count
    index["sourceFileManifestSha256"] = hashlib.sha256(compressed).hexdigest()
    return compressed, json.dumps(index, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    voice_files, voice_index = build()
    if args.write:
        VOICE_FILES.write_bytes(voice_files)
        VOICE_INDEX.write_text(voice_index)
    elif VOICE_FILES.read_bytes() != voice_files or VOICE_INDEX.read_text() != voice_index:
        raise ValueError("central gap runtime indexes are stale; rerun with --write")
    registration = json.loads((BASE / "runtime-registration.json").read_text())
    gap = json.loads((BASE / "gap-listening-decisions.json").read_text())
    print(json.dumps({"runtimeApproved": registration["summary"]["approved"], "gapRows": gap["summary"]["approved"], "voiceFileRowsUpdated": True}))


if __name__ == "__main__":
    main()
