#!/usr/bin/env python3
"""Overlay Popp approval/conversion evidence onto the last valid central voice index."""

from __future__ import annotations

import gzip
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / "materials/hero-model-library"
INDEX = BASE / "voice-index.json"
FILES = BASE / "voice-files.jsonl.gz"
REPORT = BASE / "角色語音索引.md"
MANIFEST = ROOT / "content/assets/audio/original/strash/popp/MANIFEST.json"
RECEIPT = BASE / "priority-evidence/infinity-strash-popp-approved-audio-v1/receipt.json"
EVENT_TABLE = BASE / "priority-evidence/infinity-strash-popp-approved-audio-v1/runtime-event-table.json"
BLOCKERS = BASE / "priority-evidence/infinity-strash-popp-approved-audio-v1/candidate-blockers.json"
START = "<!-- generated:popp-approved-audio-v1:start -->"
END = "<!-- generated:popp-approved-audio-v1:end -->"
PARAGRAPH = (
    "波普 PN020 已核准 36 筆原生事件音訊關係，轉為 35 份不同 MP3 並建立 8 個原生事件列。"
    "核准收據沒有指定唯一 GGD 技能／狀態目標，故 runtime 綁定仍為 0；逐候選 blocker 見 "
    "`priority-evidence/infinity-strash-popp-approved-audio-v1/candidate-blockers.json`。"
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    index = read(INDEX)
    manifest = read(MANIFEST)
    receipt = read(RECEIPT)
    event_table = read(EVENT_TABLE)
    blockers = read(BLOCKERS)
    if receipt["summary"]["gameAudioFiles"] != 35 or receipt["summary"]["gameAudioCandidateRelationships"] != 36:
        raise ValueError("Popp conversion receipt changed")
    if event_table["runtimeBindingAuthorized"] is not False or len(event_table["events"]) != 8:
        raise ValueError("Popp native event table changed")
    if blockers["summary"] != {"candidates": 36, "runtimeBindable": 0, "blocked": 36}:
        raise ValueError("Popp blocker boundary changed")
    rows = [json.loads(line) for line in gzip.decompress(FILES.read_bytes()).decode("utf-8").splitlines() if line]
    workspace = Path(index["localWorkspace"]).resolve()
    by_source = defaultdict(list)
    for candidate in manifest["candidates"]:
        source = Path(candidate["source"]["absolutePath"]).resolve()
        if not source.is_relative_to(workspace):
            raise ValueError("Popp source escaped indexed workspace")
        by_source[source.relative_to(workspace).as_posix()].append(candidate)
    seen = set()
    group_counts = Counter()
    relationships = 0
    for row in rows:
        candidates = by_source.get(row["path"])
        if not candidates:
            continue
        if any(candidate["source"]["sha256"] != row["sha256"] for candidate in candidates):
            raise ValueError("Popp source row SHA changed: " + row["path"])
        row.update(
            poppOwnerReviewed=True,
            poppApprovedCandidateIds=[candidate["candidateId"] for candidate in candidates],
            poppApprovedNativeEvents=sorted({candidate["nativeEvent"] for candidate in candidates}),
            gameAudioCandidates=[{
                "gitPath": candidate["runtimeCandidate"]["gitPath"],
                "sha256": candidate["runtimeCandidate"]["sha256"],
                "bytes": candidate["runtimeCandidate"]["bytes"],
                "codec": candidate["runtimeCandidate"]["codec"],
                "channels": candidate["runtimeCandidate"]["channels"],
                "sampleRate": candidate["runtimeCandidate"]["sampleRate"],
                "nativeEvent": candidate["nativeEvent"],
            } for candidate in candidates],
            ggdRuntimeBindingAuthorized=False,
            ggdRuntimeBindingStatus="blocked-no-owner-approved-unique-ggd-runtime-target",
            runtimeSelectable=False,
            speakerVerified=False,
            synthesisReady=False,
        )
        seen.add(row["path"])
        relationships += len(candidates)
        group_counts[row["groupId"]] += len(candidates)
    if seen != set(by_source) or len(seen) != 35 or relationships != 36:
        raise ValueError("Popp approved candidates did not join the central voice file rows exactly")
    for group in index["groups"]:
        count = group_counts[group["id"]]
        if count:
            group.update(
                poppOwnerReviewedCandidateRelationships=count,
                poppGameFormatConverted=True,
                poppGgdRuntimeBindings=0,
                poppRuntimeBindingStatus="blocked-no-owner-approved-unique-ggd-runtime-target",
            )
    index["poppApprovedAudio"] = {
        "receiptPath": RECEIPT.relative_to(ROOT).as_posix(),
        "receiptSha256": sha(RECEIPT),
        "eventTablePath": EVENT_TABLE.relative_to(ROOT).as_posix(),
        "blockersPath": BLOCKERS.relative_to(ROOT).as_posix(),
        "ownerApprovedCandidates": 36,
        "uniqueSourceWavFiles": 35,
        "gameAudioFiles": 35,
        "nativeEventRows": 8,
        "runtimeBindings": 0,
        "runtimeSelectable": False,
        "productionDeployed": False,
    }
    index["summary"].update(
        poppOwnerApprovedCandidates=36,
        poppGameAudioFiles=35,
        poppNativeEventRows=8,
        poppRuntimeBindings=0,
    )
    input_paths = [RECEIPT, EVENT_TABLE, BLOCKERS, MANIFEST]
    # Preserve the last valid generator output byte-for-byte apart from this
    # workflow's own input rows.  Older snapshots may contain duplicated input
    # evidence; cleaning those belongs to the central generator, not this
    # narrowly scoped overlay.
    inputs = list(index["inputs"])
    positions = {row["path"]: offset for offset, row in enumerate(inputs)}
    for path in input_paths:
        relative = path.relative_to(ROOT).as_posix()
        value = {"path": relative, "sha256": sha(path)}
        if relative in positions:
            inputs[positions[relative]] = value
        else:
            positions[relative] = len(inputs)
            inputs.append(value)
    index["inputs"] = inputs
    text = "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows)
    compressed = gzip.compress(text.encode("utf-8"), mtime=0)
    FILES.write_bytes(compressed)
    index["sourceFileManifestSha256"] = hashlib.sha256(compressed).hexdigest()
    index["uncompressedFileManifestSha256"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
    INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = REPORT.read_text(encoding="utf-8")
    block = START + "\n" + PARAGRAPH + "\n" + END
    if START in report or END in report:
        if report.count(START) != 1 or report.count(END) != 1:
            raise ValueError("Popp audio report markers are malformed")
        left, tail = report.split(START, 1)
        _, right = tail.split(END, 1)
        report = left + block + right
    else:
        anchor = "目前索引 **"
        if report.count(anchor) != 1:
            raise ValueError("voice report insertion anchor is absent or ambiguous")
        report = report.replace(anchor, block + "\n\n" + anchor)
    REPORT.write_text(report, encoding="utf-8")
    print(json.dumps({"annotatedSourceFiles": len(seen), "candidateRelationships": relationships, "runtimeBindings": 0}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
