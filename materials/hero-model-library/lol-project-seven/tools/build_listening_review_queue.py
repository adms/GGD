#!/usr/bin/env python3
"""Build a hash-verified listening queue for the fixed seven LoL base voices.

The native event reports are authoritative for event relationships only.  This
tool deliberately keeps speaker, per-clip language, transcript, gain and GGD
runtime decisions pending until a human review is recorded separately.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path


SOURCE_ID = "lol-project-seven-ja-jp-16.18.8159717"
EXPECTED = ["Karthus", "LeeSin", "Lux", "MissFortune", "Warwick", "Xerath", "Yasuo"]
ABILITY_SLOTS = ["Q", "W", "E", "R"]
RUNTIME_CATEGORY_TARGETS = {
    "attack": "attack",
    "death": "death",
    "move": "move",
    "recall": "recall",
    "emote": "emote",
}
PRIORITY = {
    "ability-cast": 1,
    "death": 1,
    "attack": 2,
    "move": 3,
    "recall": 3,
    "emote": 4,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def runtime_target(categories: list[str], slots: list[str]) -> str | None:
    """Return only a native-event candidate; never invent a semantic binding."""
    if categories == ["ability-cast"] and len(slots) == 1:
        return f"ability-{slots[0]}"
    if len(categories) == 1:
        return RUNTIME_CATEGORY_TARGETS.get(categories[0])
    return None


def review_priority(categories: list[str]) -> int:
    return min((PRIORITY.get(category, 5) for category in categories), default=5)


def load_decisions(path: Path) -> dict[str, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != "ggd-lol-listening-review-decisions@1":
        raise ValueError("Unexpected listening decision schema")
    if data.get("sourceId") != SOURCE_ID or not isinstance(data.get("decisions"), dict):
        raise ValueError("Listening decisions do not target the fixed project-seven source")
    return data["decisions"]


def validate_decision(key: str, decision: dict | None) -> None:
    if decision is None:
        return
    allowed_statuses = {"pending", "verified", "rejected", "needs-context"}
    if decision.get("status", "pending") not in allowed_statuses:
        raise ValueError(f"Unsupported review status: {key}")
    language = decision.get("language", "unreviewed")
    if decision.get("perClipLanguageVerified") and language == "unreviewed":
        raise ValueError(f"Verified language cannot remain unreviewed: {key}")
    if decision.get("speakerVerified") and not decision.get("speaker"):
        raise ValueError(f"Verified speaker requires a recorded speaker: {key}")
    if decision.get("ggdSkillSemanticBindingVerified") and not decision.get("ggdRuntimeTarget"):
        raise ValueError(f"Verified GGD semantics require a runtime target: {key}")
    if decision.get("runtimeApproved"):
        required = (
            decision.get("status") == "verified"
            and decision.get("speakerVerified") is True
            and decision.get("perClipLanguageVerified") is True
            and decision.get("ggdSkillSemanticBindingVerified") is True
            and decision.get("gainDecision") not in {None, "pending"}
            and bool(decision.get("ggdRuntimeTarget"))
        )
        if not required:
            raise ValueError(f"Runtime approval lacks completed review evidence: {key}")


def build(repo_root: Path, asset_workspace: Path, decisions_path: Path) -> dict:
    reports_root = repo_root / "materials/hero-model-library/lol-project-seven/event-bindings"
    decisions = load_decisions(decisions_path)
    records: list[dict] = []
    report_inputs = []
    seen_keys = set()
    seen_paths = set()

    for native_id in EXPECTED:
        report_path = reports_root / f"{native_id.casefold()}-base.json"
        report = json.loads(report_path.read_text(encoding="utf-8"))
        validation = report.get("validation", {})
        if (
            report.get("schema") != "ggd-lol-native-event-bindings@1"
            or report.get("sourceId") != SOURCE_ID
            or report.get("nativeId") != native_id
            or report.get("skinId") != "skin0"
            or validation.get("eventBindingsVerified") is not True
            or validation.get("speakerVerified") is not False
            or validation.get("perClipLanguageVerified") is not False
            or validation.get("ggdSkillSemanticBindingsVerified") is not False
        ):
            raise ValueError(f"Unexpected event report state: {report_path}")

        relative_report = report_path.relative_to(repo_root).as_posix()
        report_inputs.append({
            "path": relative_report,
            "sha256": sha256(report_path),
            "nativeId": native_id,
            "mappedEvents": validation["mappedEvents"],
            "mappedWemIds": validation["mappedWemIds"],
        })

        for source in report["files"]:
            key = f"{native_id}:skin0:{source['wemId']}"
            if key in seen_keys:
                raise ValueError(f"Duplicate stable review key: {key}")
            seen_keys.add(key)
            path = Path(source["absolutePath"])
            expected_path = (asset_workspace / source["path"]).resolve()
            if path.resolve() != expected_path:
                raise ValueError(f"Absolute and workspace paths differ: {key}")
            if not path.is_file() or path.stat().st_size != source["bytes"]:
                raise ValueError(f"Missing or size-changed WAV: {path}")
            if sha256(path) != source["sha256"]:
                raise ValueError(f"SHA-256 mismatch: {path}")
            if source["path"] in seen_paths:
                raise ValueError(f"One project-seven WAV appears in multiple reports: {source['path']}")
            seen_paths.add(source["path"])

            categories = sorted(set(source["categories"]))
            slots = sorted(set(source["abilitySlotCandidates"]), key=ABILITY_SLOTS.index)
            bindings = sorted(
                source["eventBindings"],
                key=lambda row: (row["eventName"], row["eventId"]),
            )
            if any(binding["category"] not in categories for binding in bindings):
                raise ValueError(f"Event category missing from file summary: {key}")
            if any(binding.get("abilitySlotCandidate") not in slots
                   for binding in bindings if binding.get("abilitySlotCandidate")):
                raise ValueError(f"Ability slot missing from file summary: {key}")

            decision = decisions.get(key)
            if decision is not None and not isinstance(decision, dict):
                raise ValueError(f"Decision must be an object: {key}")
            validate_decision(key, decision)
            target = runtime_target(categories, slots)
            records.append({
                "key": key,
                "heroId": report["heroId"],
                "nativeId": native_id,
                "skinId": "skin0",
                "reportedLocale": report["reportedLocale"],
                "wemId": source["wemId"],
                "sourceWem": source["sourceWem"],
                "sourceWemSha256": source["sourceWemSha256"],
                "path": source["path"],
                "absolutePath": source["absolutePath"],
                "bytes": source["bytes"],
                "sha256": source["sha256"],
                "seconds": source["seconds"],
                "nativeEventCategories": categories,
                "abilitySlotCandidates": slots,
                "eventBindings": bindings,
                "eventBindingsVerified": True,
                "candidateRuntimeTarget": target,
                "candidateOnly": True,
                "reviewPriority": review_priority(categories),
                "reviewStatus": (decision or {}).get("status", "pending"),
                "decision": decision,
                "speakerCandidate": native_id,
                "speakerVerified": bool((decision or {}).get("speakerVerified", False)),
                "language": (decision or {}).get("language", "unreviewed"),
                "perClipLanguageVerified": bool((decision or {}).get("perClipLanguageVerified", False)),
                "transcriptStatus": (decision or {}).get("transcriptStatus", "not-transcribed"),
                "gainDecision": (decision or {}).get("gainDecision", "pending"),
                "ggdSkillSemanticBindingVerified": bool(
                    (decision or {}).get("ggdSkillSemanticBindingVerified", False)
                ),
                "runtimeApproved": bool((decision or {}).get("runtimeApproved", False)),
                "runtimeSelectable": False,
                "sourceEventReport": relative_report,
            })

    unknown = sorted(set(decisions) - seen_keys)
    if unknown:
        raise ValueError("Decisions reference unknown review keys: " + ", ".join(unknown))
    records.sort(key=lambda row: (
        row["reviewPriority"], EXPECTED.index(row["nativeId"]),
        row["candidateRuntimeTarget"] or "zz", row["wemId"],
    ))

    by_character = []
    for native_id in EXPECTED:
        own = [row for row in records if row["nativeId"] == native_id]
        categories = Counter(category for row in own for category in row["nativeEventCategories"])
        slots = Counter(slot for row in own for slot in row["abilitySlotCandidates"])
        by_character.append({
            "nativeId": native_id,
            "heroId": own[0]["heroId"],
            "files": len(own),
            "seconds": sum(row["seconds"] for row in own),
            "bytes": sum(row["bytes"] for row in own),
            "categoryFileRelationships": dict(sorted(categories.items())),
            "abilitySlotFileRelationships": {slot: slots[slot] for slot in ABILITY_SLOTS},
            "missingAbilitySlotEventCandidates": [slot for slot in ABILITY_SLOTS if slots[slot] == 0],
            "pendingReviews": sum(row["reviewStatus"] == "pending" for row in own),
            "runtimeApproved": sum(row["runtimeApproved"] for row in own),
        })

    return {
        "schema": "ggd-lol-listening-review-queue@1",
        "sourceId": SOURCE_ID,
        "scope": "Exact seven named champions, ja_JP release, base skin0 native event mappings only.",
        "sourceSemantics": {
            "reportedLocale": "ja_JP",
            "eventBindingsVerified": True,
            "speakerVerifiedByDefault": False,
            "perClipLanguageVerifiedByDefault": False,
            "ggdSkillSemanticBindingVerifiedByDefault": False,
            "runtimeSelectable": False,
            "note": "Event names provide review candidates only. They do not prove the spoken language, speaker, transcript, gain, GGD slot semantics or runtime approval.",
        },
        "inputs": {
            "eventReports": report_inputs,
            "decisions": {
                "path": decisions_path.relative_to(repo_root).as_posix(),
                "sha256": sha256(decisions_path),
            },
        },
        "summary": {
            "characters": len(EXPECTED),
            "uniqueWavFiles": len(records),
            "bytes": sum(row["bytes"] for row in records),
            "seconds": sum(row["seconds"] for row in records),
            "pendingReviews": sum(row["reviewStatus"] == "pending" for row in records),
            "speakerVerified": sum(row["speakerVerified"] for row in records),
            "perClipLanguageVerified": sum(row["perClipLanguageVerified"] for row in records),
            "ggdSkillSemanticBindingVerified": sum(
                row["ggdSkillSemanticBindingVerified"] for row in records
            ),
            "runtimeApproved": sum(row["runtimeApproved"] for row in records),
            "allLocalWavBytesAndSha256Verified": True,
            "byCharacter": by_character,
        },
        "reviewFields": [
            "status", "speakerVerified", "language", "perClipLanguageVerified",
            "transcript", "transcriptStatus", "clipType", "gainDecision",
            "ggdSkillSemanticBindingVerified", "runtimeApproved", "notes",
            "reviewer", "reviewedAt",
        ],
        "records": records,
    }


def markdown(data: dict) -> str:
    summary = data["summary"]
    lines = [
        "# LOL 七角色原生事件聽審佇列",
        "",
        "固定來源為 ja_JP release 的七名指定英雄 base／skin0。原生事件圖與 754 個 WAV 的本機位元組、大小及 SHA-256 已重新驗證；逐段說話者、實際語言、台詞、增益與 GGD 技能語義仍需聽審。",
        "",
        "事件類別與 Q／W／E／R 只作候選提示。`Joke` 保留為 `emote`，`Death` 保留為 `death`；產生器不會把事件改標成受傷，也不會把缺少事件證據的片段硬塞進技能槽。",
        "",
        f"- 不同 WAV：{summary['uniqueWavFiles']} 檔",
        f"- 總長：{summary['seconds']:.2f} 秒",
        f"- 本機位元組：{summary['bytes']:,} bytes",
        f"- 待聽審：{summary['pendingReviews']} 檔",
        f"- 已核准進 runtime：{summary['runtimeApproved']} 檔",
        "",
        "| 角色 | WAV | Q | W | E | R | 原生事件未提供的技能候選 | 待聽審 |",
        "|---|---:|---:|---:|---:|---:|---|---:|",
    ]
    for row in summary["byCharacter"]:
        slots = row["abilitySlotFileRelationships"]
        missing = "、".join(row["missingAbilitySlotEventCandidates"]) or "無"
        lines.append(
            f"| {row['nativeId']} | {row['files']} | {slots['Q']} | {slots['W']} | "
            f"{slots['E']} | {slots['R']} | {missing} | {row['pendingReviews']} |"
        )
    lines += [
        "",
        "逐檔機器入口：`listening-review-queue.json`。人工決定只寫入 `listening-review-decisions.json`，再重跑產生器；不要直接修改生成的佇列。每筆保留絕對 WAV 路徑、SHA-256、WEM ID、原生事件名稱、候選類別與候選技能槽。",
        "",
        "重建：",
        "",
        "```sh",
        "python3 materials/hero-model-library/lol-project-seven/tools/build_listening_review_queue.py \\",
        "  --asset-workspace \"/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT\"",
        "```",
        "",
        "產生器只讀既有音訊，不轉碼、不覆寫來源，也不啟用 `content/config/champion-voices.json`。",
        "",
    ]
    return "\n".join(lines)


def render_json(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def write_or_check(path: Path, content: str, check: bool) -> None:
    if check:
        if not path.is_file() or path.read_text(encoding="utf-8") != content:
            raise SystemExit(f"Generated file is stale: {path}")
        return
    path.write_text(content, encoding="utf-8")


def receipt(repo_root: Path, data: dict, json_output: Path, markdown_output: Path,
            decisions: Path, script: Path) -> dict:
    test_script = script.with_name("test_build_listening_review_queue.py")
    return {
        "schema": "ggd-lol-listening-review-queue-receipt@1",
        "sourceId": SOURCE_ID,
        "files": [
            {"path": json_output.relative_to(repo_root).as_posix(),
             "bytes": json_output.stat().st_size, "sha256": sha256(json_output)},
            {"path": markdown_output.relative_to(repo_root).as_posix(),
             "bytes": markdown_output.stat().st_size, "sha256": sha256(markdown_output)},
            {"path": decisions.relative_to(repo_root).as_posix(),
             "bytes": decisions.stat().st_size, "sha256": sha256(decisions)},
            {"path": script.relative_to(repo_root).as_posix(),
             "bytes": script.stat().st_size, "sha256": sha256(script)},
            {"path": test_script.relative_to(repo_root).as_posix(),
             "bytes": test_script.stat().st_size, "sha256": sha256(test_script)},
        ],
        "summary": data["summary"],
        "claims": {
            "allLocalWavBytesAndSha256Verified": True,
            "eventBindingsVerified": True,
            "speakerVerifiedCount": data["summary"]["speakerVerified"],
            "perClipLanguageVerifiedCount": data["summary"]["perClipLanguageVerified"],
            "runtimeApprovedCount": data["summary"]["runtimeApproved"],
            "runtimeConfigChanged": False,
            "deployed": False,
        },
    }


def main() -> None:
    repo_default = Path(__file__).resolve().parents[4]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=repo_default)
    parser.add_argument("--asset-workspace", type=Path, required=True)
    parser.add_argument("--decisions", type=Path)
    parser.add_argument("--json-output", type=Path)
    parser.add_argument("--markdown-output", type=Path)
    parser.add_argument("--receipt-output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()
    base = repo_root / "materials/hero-model-library/lol-project-seven"
    decisions = (args.decisions or base / "listening-review-decisions.json").resolve()
    json_output = (args.json_output or base / "listening-review-queue.json").resolve()
    markdown_output = (args.markdown_output or base / "listening-review-queue.md").resolve()
    receipt_output = (args.receipt_output or base / "listening-review-receipt.json").resolve()
    data = build(repo_root, args.asset_workspace.resolve(), decisions)
    write_or_check(json_output, render_json(data), args.check)
    write_or_check(markdown_output, markdown(data), args.check)
    receipt_data = receipt(repo_root, data, json_output, markdown_output, decisions,
                           Path(__file__).resolve())
    write_or_check(receipt_output, render_json(receipt_data), args.check)
    print(json.dumps({
        "json": str(json_output),
        "markdown": str(markdown_output),
        "receipt": str(receipt_output),
        **{key: data["summary"][key] for key in (
            "characters", "uniqueWavFiles", "bytes", "seconds", "pendingReviews",
            "runtimeApproved", "allLocalWavBytesAndSha256Verified",
        )},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
