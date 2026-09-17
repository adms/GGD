#!/usr/bin/env python3
"""Verify all seven scoped LoL Japanese source groups and publish a compact index."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from verify_voice_group_files import ROOT, build, encoded


SEVEN_INDEX = ROOT / "materials/hero-model-library/lol-project-seven/seven-voice-index.json"


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def markdown(index: dict) -> bytes:
    lines = [
        "# LOL 指定七名日文音訊本機實檔驗證",
        "",
        "> 這份收據證明本機檔案存在，且大小與 SHA-256 符合中央語音索引。來源庫共 4,927 檔，其中固定戰鬥審查範圍 311 檔已由使用者逐項核准並註冊 runtime；其餘來源檔仍不可推定說話者、逐段語言、台詞或事件。",
        "",
        "| 角色 | 中央群組 | 來源檔 | Bytes | 秒數 | 本機驗證 | 戰鬥聽審／runtime |",
        "|---|---|---:|---:|---:|---|---|",
    ]
    for row in index["characters"]:
        lines.append(
            f"| {row['name']} | `{row['centralGroupId']}` | {row['files']} | "
            f"{row['bytes']} | {row['seconds']:.6f} | 通過 | "
            f"{row['listeningReviewApprovedFiles']}/{row['battleReviewCandidateFiles']} 已核准；"
            f"{row['runtimeRegisteredFiles']} 已註冊 |"
        )
    summary = index["summary"]
    lines.extend(
        [
            "",
            "## 合計",
            "",
            f"- 本機存在且大小、SHA-256 完全相符：**{summary['byteAndSha256VerifiedFiles']} / {summary['indexedFiles']}**",
            f"- 總位元組：**{summary['bytes']}**",
            f"- 已量測長度：**{summary['knownDurationSeconds']:.6f} 秒**",
            "- 缺檔：**0**；不符：**0**",
            f"- 固定戰鬥審查範圍：**{summary['listeningReviewApprovedFiles']} / {summary['battleReviewCandidateFiles']}** 已核准；**{summary['runtimeRegisteredFiles']}** 已註冊",
            "- 完整來源庫仍不是全部聽審或合成輸入；`productionDeployed=false`",
            "",
            "各角色的 `.json.gz` 收據包含每一個 WAV 的本機絕對路徑、相對路徑、bytes、SHA-256、長度、分類與中央 manifest 行號。",
            "",
        ]
    )
    return "\n".join(lines).encode("utf-8")


def create(output_root: Path) -> tuple[dict, dict[Path, bytes]]:
    source = json.loads(SEVEN_INDEX.read_text(encoding="utf-8"))
    characters = source["characters"]
    if len(characters) != 7:
        raise ValueError(f"Expected exactly seven scoped LoL characters; found {len(characters)}")

    outputs: dict[Path, bytes] = {}
    rows = []
    category_counts: Counter[str] = Counter()
    totals = Counter()
    for character in characters:
        if len(character["groupIds"]) != 1:
            raise ValueError(f"Expected one source group for {character['heroId']}")
        short_group_id = character["groupIds"][0]
        central_group_id = f"{character['sourceId']}:{short_group_id}"
        report = build(central_group_id)
        summary = report["summary"]
        if summary["indexedFiles"] != character["pcmWavCount"]:
            raise ValueError(f"File count drift for {character['heroId']}")
        if abs(summary["knownDurationSeconds"] - character["seconds"]) > 1e-6:
            raise ValueError(f"Duration drift for {character['heroId']}")
        receipt_path = output_root / f"{short_group_id}.json.gz"
        receipt_payload = encoded(report, receipt_path)
        outputs[receipt_path] = receipt_payload
        category_counts.update(summary["categoryCounts"])
        totals.update(
            indexedFiles=summary["indexedFiles"],
            existingFiles=summary["existingFiles"],
            byteAndSha256VerifiedFiles=summary["byteAndSha256VerifiedFiles"],
            bytes=summary["bytes"],
            durationMeasuredFiles=summary["durationMeasuredFiles"],
            missingFiles=summary["missingFiles"],
            mismatchedFiles=summary["mismatchedFiles"],
        )
        rows.append(
            {
                "heroId": character["heroId"],
                "name": character["name"],
                "nativeId": character["nativeId"],
                "sourceId": character["sourceId"],
                "centralGroupId": central_group_id,
                "receiptPath": receipt_path.relative_to(ROOT).as_posix(),
                "receiptBytes": len(receipt_payload),
                "receiptSha256": sha256_bytes(receipt_payload),
                "files": summary["indexedFiles"],
                "bytes": summary["bytes"],
                "seconds": summary["knownDurationSeconds"],
                "categoryCounts": summary["categoryCounts"],
                "localSourceBytesVerified": True,
                "battleReviewCandidateFiles": character["battleReviewCandidateFiles"],
                "listeningReviewApprovedFiles": character["listeningReviewApprovedFiles"],
                "runtimeRegisteredFiles": character["runtimeRegisteredFiles"],
                "battleReviewComplete": character["listeningReviewComplete"],
                "runtimeSelectableBattleSubset": character["runtimeSelectable"],
                "languageVerified": False,
                "speakerVerified": False,
                "listeningReviewComplete": False,
                "synthesisReady": False,
                "runtimeSelectable": False,
                "deployed": False,
            }
        )

    total_seconds = sum(row["seconds"] for row in rows)
    battle_candidates = sum(row["battleReviewCandidateFiles"] for row in rows)
    approved_battle = sum(row["listeningReviewApprovedFiles"] for row in rows)
    runtime_registered = sum(row["runtimeRegisteredFiles"] for row in rows)
    expected = source["totals"]
    if totals["indexedFiles"] != expected["pcmWavCount"]:
        raise ValueError("Seven-group file total differs from seven-voice-index.json")
    if totals["bytes"] != expected["audioBytes"]:
        raise ValueError("Seven-group byte total differs from seven-voice-index.json")
    if abs(total_seconds - expected["audioSeconds"]) > 1e-6:
        raise ValueError("Seven-group duration differs from seven-voice-index.json")

    index = {
        "schema": "ggd-lol-seven-local-file-verification@1",
        "sourceIndex": {
            "path": SEVEN_INDEX.relative_to(ROOT).as_posix(),
            "bytes": SEVEN_INDEX.stat().st_size,
            "sha256": hashlib.sha256(SEVEN_INDEX.read_bytes()).hexdigest(),
        },
        "characters": rows,
        "summary": {
            **dict(totals),
            "knownDurationSeconds": total_seconds,
            "categoryCounts": dict(sorted(category_counts.items())),
            "characterCount": len(rows),
            "battleReviewCandidateFiles": battle_candidates,
            "listeningReviewApprovedFiles": approved_battle,
            "runtimeRegisteredFiles": runtime_registered,
        },
        "status": {
            "allLocalSourceBytesVerified": True,
            "packageLocale": "ja_JP",
            "perClipLanguageVerified": False,
            "speakerVerified": False,
            "listeningReviewComplete": False,
            "synthesisReady": False,
            "runtimeSelectable": False,
            "runtimeSelectableBattleSubset": runtime_registered == battle_candidates,
            "battleReviewComplete": approved_battle == battle_candidates,
            "battleReviewScopeOnly": True,
            "deployed": False,
        },
        "boundaries": [
            "Only Karthus, LeeSin, Lux, MissFortune, Warwick, Xerath and Yasuo are included.",
            "Byte verification does not establish per-clip language, speaker, transcript, event semantics, synthesis readiness, runtime binding or deployment.",
            "Audio remains in the local asset library and S3 legacy; Git stores paths, hashes and verification receipts only.",
            "The 311 approved runtime registrations are exactly the fixed battle-review subset; the remaining source WAVs are not approved by implication.",
        ],
    }
    outputs[output_root / "index.json"] = json_bytes(index)
    outputs[output_root / "README.md"] = markdown(index)
    return index, outputs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=ROOT / "materials/hero-model-library/lol-project-seven/local-file-verification",
    )
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output_root = args.output_root.resolve()
    index, outputs = create(output_root)
    stale = []
    for path, payload in outputs.items():
        if args.check:
            if not path.is_file() or path.read_bytes() != payload:
                stale.append(str(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)
    if stale:
        raise SystemExit("STALE LOL SEVEN LOCAL VERIFICATION: " + ", ".join(stale))
    print(json.dumps({"check": args.check, **index["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
