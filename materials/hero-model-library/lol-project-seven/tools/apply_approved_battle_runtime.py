#!/usr/bin/env python3
"""Register owner-approved LoL seven battle WAVs in the runtime voice packs.

The listening decision file is the approval authority.  Native event targets
are translated only through RUNTIME_CATEGORY_MAP; no transcript, hurt, crit,
kill or other event is inferred.  Source WAVs remain untouched and MP3 output
keeps source gain while adapting the runtime container/rate/channel contract.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections import Counter, defaultdict
from pathlib import Path


SOURCE_ID = "lol-project-seven-ja-jp-16.18.8159717"
REVIEW_DATE = "2026-09-14"
NATIVE_TO_RUNTIME = {
    "Karthus": "lol-karthus",
    "LeeSin": "lol-leesin",
    "Lux": "lol-lux",
    "MissFortune": "lol-missfortune",
    "Warwick": "lol-warwick",
    "Xerath": "lol-xerath",
    "Yasuo": "lol-yasuo",
}
RUNTIME_CATEGORY_MAP = {
    "ability-Q": "skill-name.q",
    "ability-W": "skill-name.w",
    "ability-E": "skill-name.e",
    "ability-R": "skill-name.r",
    "attack": "attack-light",
    "death": "defeat",
}
MANAGED_CATEGORIES = frozenset(RUNTIME_CATEGORY_MAP.values()) | {"attack-heavy"}
RUNTIME_NOTE = (
    " ⭐ 2026-09-14 LoL 七角色戰鬥候選逐項聽審：311 檔依原生事件固定映射註冊；"
    "這一批依決策保留來源增益，只轉為 128k/44.1k/mono MP3，未套 loudnorm。"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def render_json(data: dict, indent: int = 2) -> str:
    return json.dumps(data, ensure_ascii=False, indent=indent) + "\n"


def category_base(key: str) -> str:
    base, separator, suffix = key.rpartition(".")
    return base if separator and suffix.isdigit() else key


def battle_rows(queue: dict) -> list[dict]:
    return [
        row for row in queue["records"]
        if row.get("candidateRuntimeTarget") in RUNTIME_CATEGORY_MAP
    ]


def approved_decision(row: dict, decision: dict) -> bool:
    return (
        decision.get("status") == "verified"
        and decision.get("speaker") == row["nativeId"]
        and decision.get("speakerVerified") is True
        and decision.get("language") == "ja"
        and decision.get("perClipLanguageVerified") is True
        and decision.get("ggdRuntimeTarget") == row["candidateRuntimeTarget"]
        and decision.get("ggdSkillSemanticBindingVerified") is True
        and decision.get("gainDecision") == "keep-source-gain"
        and decision.get("runtimeApproved") is True
    )


def expected_originals(queue: dict, decisions: dict, current: dict) -> tuple[dict, list[dict]]:
    if RUNTIME_NOTE.strip() not in current.get("note", ""):
        current["note"] = current.get("note", "") + RUNTIME_NOTE
    champions = current.setdefault("champions", {})
    rows = battle_rows(queue)
    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        decision = decisions["decisions"].get(row["key"], {})
        if not approved_decision(row, decision):
            raise ValueError(f"Battle review is not completely approved: {row['key']}")
        grouped[(NATIVE_TO_RUNTIME[row["nativeId"]], RUNTIME_CATEGORY_MAP[row["candidateRuntimeTarget"]])].append(row)

    for hero_id in NATIVE_TO_RUNTIME.values():
        existing = champions.setdefault(hero_id, {})
        champions[hero_id] = {
            key: value for key, value in existing.items()
            if category_base(key) not in MANAGED_CATEGORIES
        }

    registrations = []
    for (hero_id, category), own in sorted(grouped.items()):
        own.sort(key=lambda row: (row["wemId"], row["sha256"]))
        for index, row in enumerate(own, 1):
            key = category if index == 1 else f"{category}.{index}"
            native_id = row["nativeId"]
            entry = {
                "src": row["path"],
                "name": f"{native_id}/skin0/{row['wemId']}",
                "group": SOURCE_ID,
                "sha256": row["sha256"],
                "seconds": row["seconds"],
                "lang": "ja",
                "speaker": native_id,
                "assignedBy": "owner-listening-review",
                "why": f"approved native event target {row['candidateRuntimeTarget']}",
                "reviewKey": row["key"],
                "reviewedAt": REVIEW_DATE,
                "gainDecision": "keep-source-gain",
                "nativeEventBindings": row["eventBindings"],
            }
            champions[hero_id][key] = entry
            registrations.append({
                "reviewKey": row["key"],
                "nativeId": native_id,
                "runtimeHeroId": hero_id,
                "candidateRuntimeTarget": row["candidateRuntimeTarget"],
                "runtimeCategory": category,
                "runtimeTakeKey": key,
                "sourcePath": row["path"],
                "sourceSha256": row["sha256"],
                "sourceBytes": row["bytes"],
                "sourceSeconds": row["seconds"],
                "nativeEventBindings": row["eventBindings"],
            })
    registrations.sort(key=lambda row: (row["runtimeHeroId"], row["runtimeCategory"], row["runtimeTakeKey"]))
    return current, registrations


def transcode(source: Path, output: Path, check: bool) -> None:
    if check:
        if not output.is_file():
            raise ValueError(f"Missing runtime MP3: {output}")
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".mp3.tmp")
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-map_metadata", "-1", "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k",
        "-f", "mp3", str(temporary),
    ], check=True)
    temporary.replace(output)


def verify_manifest(repo: Path, registrations: list[dict]) -> str:
    path = repo / "content/assets/audio/voices/champions/MANIFEST.json"
    manifest = read_json(path)
    for row in registrations:
        clips = manifest["champions"][row["runtimeHeroId"]]["lines"][row["runtimeCategory"]]
        expected = f"assets/audio/voices/lines/{row['runtimeHeroId']}/{row['runtimeTakeKey']}.mp3"
        matches = [clip for clip in clips if clip["clip"] == expected]
        if len(matches) != 1:
            raise ValueError(f"Runtime manifest does not register {row['reviewKey']}: {expected}")
        clip = matches[0]
        if clip.get("hash") != row["runtimeSha256"] or clip.get("lang") != "ja":
            raise ValueError(f"Runtime manifest metadata drift: {row['reviewKey']}")
        # MP3 encoder delay/padding can move the probed container duration by
        # about one millisecond relative to the source WAV. The manifest value
        # is rounded to six decimals, so retain a narrow two-millisecond bound.
        if abs(float(clip.get("durationSec", -1)) - row["sourceSeconds"]) > 0.002:
            raise ValueError(f"Runtime manifest duration drift: {row['reviewKey']}")
    return sha256(path)


def verify_central_voice_index(repo: Path, registrations: list[dict]) -> None:
    index_path = repo / "materials/hero-model-library/voice-index.json"
    file_manifest = repo / "materials/hero-model-library/voice-files.jsonl.gz"
    index = read_json(index_path)
    review = index.get("listeningReview", {})
    if review.get("runtimeApproved") != len(registrations) or review.get("runtimeRegistered") != len(registrations):
        raise ValueError("Central voice index does not expose all approved runtime registrations")
    if review.get("decisionsPath") != "materials/hero-model-library/lol-project-seven/listening-review-decisions.json":
        raise ValueError("Central voice index points at a different approval authority")
    if index.get("sourceFileManifestSha256") != sha256(file_manifest):
        raise ValueError("Central voice file manifest SHA drift")


def verify_runtime_git_blobs(repo: Path, registrations: list[dict]) -> None:
    for row in registrations:
        result = subprocess.run(["git", "show", ":" + row["runtimePath"]], cwd=repo, capture_output=True)
        if result.returncode or hashlib.sha256(result.stdout).hexdigest() != row["runtimeSha256"]:
            raise ValueError(f"Runtime MP3 is absent or differs in Git index: {row['runtimePath']}")


def main() -> None:
    default_repo = Path(__file__).resolve().parents[4]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=default_repo)
    parser.add_argument("--asset-workspace", type=Path, required=True)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--skip-runtime-index", action="store_true")
    args = parser.parse_args()
    repo = args.repo_root.resolve()
    workspace = args.asset_workspace.resolve()
    base = repo / "materials/hero-model-library/lol-project-seven"
    queue_path = base / "listening-review-queue.json"
    decisions_path = base / "listening-review-decisions.json"
    originals_path = repo / "content/assets/audio/voices/lines/COMBAT_ORIGINALS.json"
    receipt_path = base / "runtime-registration.json"
    queue, decisions, originals = map(read_json, (queue_path, decisions_path, originals_path))
    if queue.get("sourceId") != SOURCE_ID or decisions.get("sourceId") != SOURCE_ID:
        raise ValueError("Review inputs do not target the fixed LoL seven source")
    if queue["inputs"]["decisions"]["sha256"] != sha256(decisions_path):
        raise ValueError("Listening queue is stale against decisions")
    expected, registrations = expected_originals(queue, decisions, originals)
    if len(registrations) != queue["summary"]["battleReviewCandidates"]:
        raise ValueError("Approved runtime rows do not equal the battle review scope")
    approved_keys = {
        key for key, decision in decisions["decisions"].items()
        if decision.get("runtimeApproved") is True
    }
    if approved_keys != {row["reviewKey"] for row in registrations}:
        raise ValueError("Runtime approval authority contains rows outside the fixed battle review scope")

    rendered = render_json(expected, indent=1)
    if args.check:
        if originals_path.read_text(encoding="utf-8") != rendered:
            raise ValueError("COMBAT_ORIGINALS.json is stale")
    else:
        originals_path.write_text(rendered, encoding="utf-8")

    previous = read_json(receipt_path) if receipt_path.is_file() else {"records": []}
    previous_by_key = {row["reviewKey"]: row for row in previous.get("records", [])}
    for row in registrations:
        source = (workspace / row["sourcePath"]).resolve()
        if not source.is_relative_to(workspace) or not source.is_file():
            raise ValueError(f"Missing source WAV: {source}")
        if source.stat().st_size != row["sourceBytes"] or sha256(source) != row["sourceSha256"]:
            raise ValueError(f"Source WAV drift: {source}")
        output = repo / "content/assets/audio/voices/lines" / row["runtimeHeroId"] / f"{row['runtimeTakeKey']}.mp3"
        prior = previous_by_key.get(row["reviewKey"])
        reusable = (
            not args.check and prior is not None and output.is_file()
            and prior.get("sourceSha256") == row["sourceSha256"]
            and prior.get("runtimePath") == output.relative_to(repo).as_posix()
            and prior.get("runtimeBytes") == output.stat().st_size
            and prior.get("runtimeSha256") == sha256(output)
        )
        if not reusable:
            transcode(source, output, args.check)
        row["runtimePath"] = output.relative_to(repo).as_posix()
        row["runtimeBytes"] = output.stat().st_size
        row["runtimeSha256"] = sha256(output)

    if not args.skip_runtime_index and not args.check:
        subprocess.run([
            "node", "--import", "tsx", "tools/voice-gen/src/build-combat-lines.mjs",
            "--use-pinned-reference-status",
        ], cwd=repo, check=True)
        subprocess.run(["node", "--import", "tsx", "tools/voice-gen/index-lines.mjs"], cwd=repo, check=True)

    manifest_sha = verify_manifest(repo, registrations) if not args.skip_runtime_index else None
    if args.check and not args.skip_runtime_index:
        verify_central_voice_index(repo, registrations)
        verify_runtime_git_blobs(repo, registrations)
    per_hero = Counter(row["runtimeHeroId"] for row in registrations)
    per_target = Counter(row["candidateRuntimeTarget"] for row in registrations)
    receipt = {
        "schema": "ggd-lol-approved-battle-runtime-registration@1",
        "sourceId": SOURCE_ID,
        "approvalAuthority": {
            "path": decisions_path.relative_to(repo).as_posix(),
            "sha256": sha256(decisions_path),
            "reviewer": "owner",
            "reviewedAt": REVIEW_DATE,
        },
        "queue": {"path": queue_path.relative_to(repo).as_posix(), "sha256": sha256(queue_path)},
        "runtimeAuthority": {"path": originals_path.relative_to(repo).as_posix(), "sha256": sha256(originals_path)},
        "runtimeManifest": {
            "path": "content/assets/audio/voices/champions/MANIFEST.json",
            "sha256": manifest_sha,
            "registered": manifest_sha is not None,
        },
        "summary": {
            "approved": len(registrations),
            "runtimeRegistered": len(registrations) if manifest_sha else 0,
            "productionDeployed": False,
            "byHero": dict(sorted(per_hero.items())),
            "byNativeTarget": dict(sorted(per_target.items())),
        },
        "mappingPolicy": RUNTIME_CATEGORY_MAP,
        "scopeGaps": {
            "notReviewedOrRegistered": queue["summary"]["uniqueWavFiles"] - len(registrations),
            "skillSlotsWithoutNativeCandidates": {
                row["nativeId"]: row["missingAbilitySlotEventCandidates"]
                for row in queue["summary"]["byCharacter"]
                if row["missingAbilitySlotEventCandidates"]
            },
            "exAbility": "No EX candidate exists in the fixed native-event review contract.",
        },
        "records": registrations,
    }
    rendered_receipt = render_json(receipt)
    if args.check:
        if receipt_path.read_text(encoding="utf-8") != rendered_receipt:
            raise ValueError("runtime-registration.json is stale")
    else:
        receipt_path.write_text(rendered_receipt, encoding="utf-8")
    print(json.dumps(receipt["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
