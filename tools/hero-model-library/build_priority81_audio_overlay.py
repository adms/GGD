#!/usr/bin/env python3
"""Audit b2-kisaragi additions and owner-reviewed branch replacements.

Separates clips already present in the current Main revision from the two branch
additions.  An existing Main path may only differ in the branch when its exact
replacement is present in the owner-reviewed LoL runtime registration; that
replacement stays explicitly branch-only.  Writes an independent overlay,
per-hero view and receipt. Never edits the frozen baseline, runtime audio,
source manifest, COMBAT_ORIGINALS or voice generators.
"""
from __future__ import annotations

import argparse
import collections
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


HERO = "b2-kisaragi"
CATEGORIES = ("taunt", "victory")
BASE = Path("materials/hero-model-library/priority-evidence/main-81-handoff")
LOL_RUNTIME_REGISTRATION = Path("materials/hero-model-library/lol-project-seven/runtime-registration.json")


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build(repo, source_manifest, main_ref):
    pins = {}

    main_revision = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", main_ref],
        check=True, capture_output=True, text=True,
    ).stdout.strip()

    def main_blobs(git_paths):
        git_paths = list(dict.fromkeys(git_paths))
        query = "".join(f"{main_revision}:{path}\n" for path in git_paths).encode()
        raw = subprocess.run(
            ["git", "-C", str(repo), "cat-file", "--batch"],
            input=query, check=True, capture_output=True,
        ).stdout
        result, offset = {}, 0
        for git_path in git_paths:
            end = raw.index(b"\n", offset)
            header = raw[offset:end].decode()
            offset = end + 1
            if header.endswith(" missing"):
                result[git_path] = None
                continue
            object_id, kind, size = header.split()
            if kind != "blob":
                raise ValueError(f"Current Main object is not a blob: {git_path}")
            size = int(size)
            data = raw[offset:offset + size]
            offset += size + 1
            result[git_path] = {
                "data": data,
                "pin": {
                    "revision": main_revision,
                    "gitPath": git_path,
                    "gitObjectId": object_id,
                    "bytes": size,
                    "sha256": hashlib.sha256(data).hexdigest(),
                },
            }
        return result

    def pin(path):
        path = path.resolve()
        if not path.is_file():
            raise ValueError(f"Pending required file: {path}")
        if str(path) not in pins:
            try:
                git_path = path.relative_to(repo).as_posix()
            except ValueError:
                git_path = None
            pins[str(path)] = {"localPath": str(path), "gitPath": git_path,
                               "bytes": path.stat().st_size, "sha256": sha(path)}
        return dict(pins[str(path)])

    def read(path):
        pin(path)
        return json.loads(path.read_text())

    baseline_dir = repo / BASE / "audio"
    baseline = read(baseline_dir / "per-hero.json")
    baseline_files = read(baseline_dir / "main-committed-clip-audit.json")
    baseline_summary = read(baseline_dir / "main-committed-summary.json")
    baseline_hero = next(h for h in baseline["heroes"] if h["heroId"] == HERO)
    baseline_voice = baseline_hero["mainCommittedVoice"]
    previous_hero_files = [f for f in baseline_files["files"] if f["heroId"] == HERO]
    if any(category in f["categories"] for f in previous_hero_files for category in CATEGORIES):
        raise ValueError("Requested additions already occur in the frozen Main baseline")
    status_path = repo / f"content/assets/audio/voices/lines/{HERO}/status.json"
    originals_path = repo / "content/assets/audio/voices/lines/COMBAT_ORIGINALS.json"
    manifest_path = repo / "content/assets/audio/voices/champions/MANIFEST.json"
    status, originals, manifest = read(status_path), read(originals_path), read(manifest_path)
    lol_runtime = read(repo / LOL_RUNTIME_REGISTRATION)
    lol_runtime_records = lol_runtime.get("records", [])
    if (lol_runtime.get("schema") != "ggd-lol-approved-battle-runtime-registration@1"
            or lol_runtime.get("summary", {}).get("approved") != len(lol_runtime_records)
            or lol_runtime.get("summary", {}).get("runtimeRegistered") != len(lol_runtime_records)
            or lol_runtime.get("summary", {}).get("productionDeployed") is not False):
        raise ValueError("LoL approved runtime registration is not current")
    runtime_by_path = {}
    for row in lol_runtime_records:
        runtime_path = row.get("runtimePath")
        if not runtime_path or runtime_path in runtime_by_path:
            raise ValueError("LoL runtime registration contains an invalid or duplicate path")
        runtime_by_path[runtime_path] = row
    document_paths = [
        "content/assets/audio/voices/champions/MANIFEST.json",
        "content/assets/audio/voices/lines/COMBAT_ORIGINALS.json",
    ]
    scope = [(row["heroId"], row["runtimeHeroId"]) for row in baseline["heroes"]]
    status_paths = [
        f"content/assets/audio/voices/lines/{runtime_id}/status.json"
        for _, runtime_id in scope
    ]
    main_documents = main_blobs(document_paths + status_paths)
    if any(main_documents[path] is None for path in document_paths):
        raise ValueError("Current Main is missing its voice manifest or original-source registry")
    main_manifest = json.loads(main_documents[document_paths[0]]["data"])
    main_originals = json.loads(main_documents[document_paths[1]]["data"])
    main_statuses = {
        runtime_id: json.loads(main_documents[path]["data"])
        for (_, runtime_id), path in zip(scope, status_paths)
        if main_documents[path] is not None
    }
    current_main_pins = [main_documents[path]["pin"] for path in document_paths + status_paths
                         if main_documents[path] is not None]
    main_manifest_lines = main_manifest.get("champions", {}).get(HERO, {}).get("lines", {})
    conversion_path = repo / "materials/hero-model-library/priority-evidence/kisaragi-train-audio/conversion.json"
    conversion = pin(conversion_path)
    if status.get("championId") != HERO:
        raise ValueError("Current status champion ID mismatch")
    source = read(source_manifest)
    if source.get("schema") != "ggd.source-audio-delivery@1" or source.get("frozen") is not True:
        raise ValueError("Expected the frozen two-file source audio delivery")
    original_bindings = originals.get("champions", {}).get(HERO, {})
    manifest_lines = manifest.get("champions", {}).get(HERO, {}).get("lines", {})

    main_records = {}
    for hero_id, runtime_id in scope:
        pack = main_manifest.get("champions", {}).get(runtime_id)
        if not pack:
            continue
        for category, rows in pack.get("lines", {}).items():
            for manifest_row in rows:
                clip = manifest_row.get("clip")
                if not clip:
                    continue
                record = main_records.setdefault(clip, {
                    "heroId": hero_id,
                    "runtimeHeroId": runtime_id,
                    "clip": clip,
                    "categories": [],
                    "manifestBindings": [],
                })
                if record["heroId"] != hero_id:
                    raise ValueError(f"Current Main clip is shared across different heroes: {clip}")
                record["categories"].append(category)
                record["manifestBindings"].append(manifest_row)
    main_clip_blobs = main_blobs("content/" + clip for clip in main_records)
    current_main_files = []
    current_main_reference_files = []
    approved_branch_replacements = []
    for clip, record in main_records.items():
        git_path = "content/" + clip
        blob = main_clip_blobs[git_path]
        if blob is None:
            raise ValueError(f"Current Main manifest references a missing clip: {clip}")
        main_pin = blob["pin"]
        manifest_hashes = {row.get("hash") for row in record["manifestBindings"]}
        if manifest_hashes != {main_pin["sha256"]}:
            raise ValueError(f"Current Main manifest hash mismatch: {clip}")
        current = pin(repo / git_path)
        if current["sha256"] != main_pin["sha256"] or current["bytes"] != main_pin["bytes"]:
            replacement = runtime_by_path.get(git_path)
            if (not replacement or replacement.get("runtimeHeroId") != record["runtimeHeroId"]
                    or replacement.get("runtimeSha256") != current["sha256"]
                    or replacement.get("runtimeBytes") != current["bytes"]):
                raise ValueError(f"Current branch differs from Current Main clip without an owner-reviewed runtime registration: {clip}")
            approved_branch_replacements.append({
                **record, **current,
                "classification": "owner-reviewed-runtime-registered-replacement",
                "changeKind": "current-branch-owner-reviewed-runtime-replacement",
                "publicationState": "current-branch-pending-main-merge",
                "mainMerged": False,
                "speakerVerified": True,
                "currentMainRevision": main_revision,
                "currentMainBlob": main_pin,
                "runtimeRegistration": replacement,
            })
            current_main_reference_files.append({
                **record,
                "gitPath": git_path,
                "bytes": main_pin["bytes"],
                "sha256": main_pin["sha256"],
                "classification": "current-main-snapshot",
                "changeKind": "current-main-snapshot",
                "publicationState": "current-main-at-pinned-revision",
                "mainMerged": True,
                "speakerVerified": False,
                "currentMainRevision": main_revision,
                "currentMainBlob": main_pin,
                "mainWorktreeMatches": False,
            })
            continue
        runtime_id = record["runtimeHeroId"]
        source_key = Path(clip).stem
        source_binding = main_originals.get("champions", {}).get(runtime_id, {}).get(source_key)
        status_row = main_statuses.get(runtime_id, {}).get("lines", {}).get(source_key, {})
        status_current = status_row.get("current") or {}
        if source_binding:
            classification = "source-file-reused-not-speaker-verified"
        elif status_current.get("engine") in {"cosyvoice3", "cosyvoice", "piper", "edge-tts", "say", "tts"}:
            reference_kind = main_statuses.get(runtime_id, {}).get("reference", {}).get("sourceKind")
            classification = ("synthetic-donor-reference" if reference_kind == "donor"
                              else "synthetic-own-reference-labelled")
        else:
            classification = "main-manifest-entry-unclassified"
        current_main_files.append({
            **record,
            **current,
            "classification": classification,
            "changeKind": "current-main-snapshot",
            "publicationState": "current-main-at-pinned-revision",
            "mainMerged": True,
            "speakerVerified": False,
            "currentMainRevision": main_revision,
            "currentMainBlob": main_pin,
            "statusPointer": {
                "gitPath": f"content/assets/audio/voices/lines/{runtime_id}/status.json",
                "key": source_key,
                "currentHashMatches": status_current.get("hash") == main_pin["sha256"],
            },
            "originalBinding": source_binding,
        })
        current_main_reference_files.append(current_main_files[-1])
    additions = []
    for category in CATEGORIES:
        content_path = f"assets/audio/voices/lines/{HERO}/{category}.mp3"
        runtime = pin(repo / "content" / content_path)
        state = status.get("lines", {}).get(category, {})
        current = state.get("current") or {}
        if current.get("hash") != runtime["sha256"] or current.get("bytes") != runtime["bytes"]:
            raise ValueError(f"Pending or mismatched status for {category}")
        if state.get("state") != "generated" or current.get("stub") is not False:
            raise ValueError(f"Audio is not a generated non-stub status: {category}")
        records = [f for f in manifest_lines.get(category, []) if f.get("clip") == content_path]
        if len(records) != 1 or records[0].get("hash") != runtime["sha256"]:
            raise ValueError(f"Pending or mismatched runtime manifest binding: {category}")
        if any(row.get("clip") == content_path for row in main_manifest_lines.get(category, [])):
            # The former branch-only addition has since landed in Main. It is
            # already represented and verified in current_main_files above.
            continue
        binding = original_bindings.get(category)
        if not binding:
            raise ValueError(f"COMBAT_ORIGINALS lacks {HERO}.{category}")
        srcs = [s for s in source.get("sources", [])
                if s.get("proposedCategory") == category and HERO in s.get("heroIds", [])]
        if len(srcs) != 1:
            raise ValueError(f"Expected one frozen source for {category}")
        src = srcs[0]
        original = pin(Path(src["path"]))
        if original["sha256"] != src["sha256"] or original["bytes"] != src["bytes"]:
            raise ValueError(f"Original file mismatch: {category}")
        if binding.get("sha256") != original["sha256"]:
            raise ValueError(f"COMBAT_ORIGINALS source SHA mismatch: {category}")
        source_path = Path(binding.get("src", ""))
        if not source_path.is_absolute():
            # Existing source registry paths are relative to the parent workspace.
            source_path = repo.parent / source_path
        if not source_path.is_file() or sha(source_path) != original["sha256"]:
            raise ValueError(f"COMBAT_ORIGINALS source path mismatch: {category}")
        pin(source_path)
        additions.append({
            "heroId": HERO, "runtimeHeroId": HERO, "clip": content_path,
            "categories": [category], **runtime,
            "classification": "source-file-reused-not-speaker-verified",
            "contentKind": "railway-announcement" if category == "taunt" else "departure-melody-sfx",
            "changeKind": "current-branch-addition",
            "publicationState": "current-branch-pending-main-merge", "mainMerged": False,
            "speakerVerified": False, "originalCharacterPerformance": False,
            "excludedFromSpeechInput": binding.get("excludedFromSpeechInput", False),
            "synthetic": False, "status": state, "manifestBinding": records[0],
            "originalBinding": binding, "originalFile": original,
            "sourceMetadata": src,
            "conversionReceipt": conversion,
        })
    baseline_count = len({f["clip"] for f in baseline_files["files"]})
    baseline_by_clip = {row["clip"]: row for row in baseline_files["files"]}
    current_main_by_clip = {row["clip"]: row for row in current_main_reference_files}
    added_since_baseline = sorted(set(current_main_by_clip) - set(baseline_by_clip))
    removed_since_baseline = sorted(set(baseline_by_clip) - set(current_main_by_clip))
    changed_since_baseline = sorted(
        clip for clip in set(current_main_by_clip) & set(baseline_by_clip)
        if current_main_by_clip[clip]["sha256"] != baseline_by_clip[clip]["sha256"]
    )
    unchanged_since_baseline = (
        len(set(current_main_by_clip) & set(baseline_by_clip)) - len(changed_since_baseline)
    )
    required = main_manifest.get("shipGate", {}).get("required", [])
    extended = list(dict.fromkeys(required + ["taunt", "victory"]))
    main_files_by_hero = collections.defaultdict(list)
    branch_replacements_by_hero = collections.defaultdict(list)
    for row in current_main_reference_files:
        main_files_by_hero[row["heroId"]].append(row)
    for row in approved_branch_replacements:
        branch_replacements_by_hero[row["heroId"]].append(row)
    overlay_heroes = []
    for baseline_row in baseline["heroes"]:
        hero_id, runtime_id = baseline_row["heroId"], baseline_row["runtimeHeroId"]
        pack = main_manifest.get("champions", {}).get(runtime_id)
        rows = main_files_by_hero[hero_id]
        classes = collections.Counter(row["classification"] for row in rows)
        lines = (pack or {}).get("lines", {})
        current_main_voice = {
            "heroId": hero_id,
            "runtimeHeroId": runtime_id,
            "revision": main_revision,
            "packPresent": pack is not None,
            "publicationState": "current-main-at-pinned-revision",
            "uniqueClipCount": len(rows),
            "originalSourceLabelledCount": classes["source-file-reused-not-speaker-verified"],
            "syntheticCount": sum(value for key, value in classes.items() if key.startswith("synthetic")),
            "donorSyntheticCount": classes["synthetic-donor-reference"],
            "ownReferenceSyntheticCount": classes["synthetic-own-reference-labelled"],
            "unclassifiedCount": classes["main-manifest-entry-unclassified"],
            "categoryCounts": {category: len(items) for category, items in lines.items()},
            "missingCategories": (pack or {}).get("missingCategories", []),
            "missingCoreCategories": [category for category in required if not lines.get(category)],
            "missingExtended11Categories": [category for category in extended if not lines.get(category)],
            "allGitHashesVerified": bool(rows) and all(row["currentMainBlob"]["sha256"] == row["sha256"] for row in rows),
            "allWorktreeFilesMatchMain": bool(rows) and all(row.get("mainWorktreeMatches", True) for row in rows),
            "sourceSpeakerVerified": False,
            "note": "Current Main manifest and Git blobs are pinned; source identity and listening claims remain as declared by their source records.",
        }
        branch_voice = copy.deepcopy(current_main_voice)
        branch_voice["mainBaselineRevision"] = baseline_summary["revision"]
        branch_voice["mainMergedAdditions"] = True
        replacements = branch_replacements_by_hero[hero_id]
        if replacements:
            branch_voice.update({
                "publicationState": "current-branch-owner-reviewed-runtime-replacement-pending-main-merge",
                "mainMergedAdditions": False,
                "ownerReviewedRuntimeReplacementCount": len(replacements),
                "allCurrentFilesShaVerified": True,
                "note": "Current Main snapshot with owner-reviewed LoL runtime replacements; these files remain branch-only until Main merges them.",
            })
        if hero_id == HERO:
            addition_categories = [row["categories"][0] for row in additions]
            if addition_categories:
                branch_voice.update({
                    "publicationState": "current-branch-pending-main-merge",
                    "mainMergedAdditions": False,
                    "uniqueClipCount": current_main_voice["uniqueClipCount"] + len(additions),
                    "originalSourceLabelledCount": current_main_voice["originalSourceLabelledCount"] + len(additions),
                    "addedCategories": addition_categories,
                    "additionalSourceFileCount": len(additions),
                    "allCurrentFilesShaVerified": True,
                    "note": "Current Main snapshot plus branch-only railway audio bindings; not original character performance or Main merge evidence.",
                })
                for key in ("missingCategories", "missingCoreCategories", "missingExtended11Categories"):
                    branch_voice[key] = [category for category in current_main_voice[key] if category not in addition_categories]
                branch_voice["categoryCounts"] = {
                    **current_main_voice["categoryCounts"], **{category: 1 for category in addition_categories}
                }
        overlay_heroes.append({
            "heroId": hero_id,
            "runtimeHeroId": runtime_id,
            "mainBaselineVoice": baseline_row.get("mainCommittedVoice"),
            "currentMainVoice": current_main_voice,
            "currentBranchVoice": branch_voice,
        })
    all_paths = set(current_main_by_clip) | {f["clip"] for f in additions} | {f["clip"] for f in approved_branch_replacements}
    if len(all_paths) != len(current_main_files) + len(additions) + len(approved_branch_replacements):
        raise ValueError("Branch audio additions or replacements are not distinct runtime paths")
    summary = {"baselineRevision": baseline_summary["revision"], "currentMainRevision": main_revision,
               "baselineUniqueClipPaths": baseline_count,
               "currentMainUniqueClipPaths": len(current_main_reference_files),
               "unchangedFrozenBaselinePaths": unchanged_since_baseline,
               "currentMainChangedPathsAfterBaseline": len(changed_since_baseline),
               "currentMainAddedPathsAfterBaseline": len(added_since_baseline),
               "currentMainRemovedPathsAfterBaseline": len(removed_since_baseline),
               "currentBranchAdditionalFiles": len(additions),
               "currentBranchOwnerReviewedReplacementFiles": len(approved_branch_replacements),
               "currentUniqueClipPaths": len(all_paths),
               "currentHeroesCompleteExtended11": sum(
                   row["currentBranchVoice"]["packPresent"]
                   and not row["currentBranchVoice"]["missingExtended11Categories"]
                   for row in overlay_heroes
               ),
               "mainMergedAdditions": not additions, "productionPlaybackVerified": False}
    evidence = [pins[p] for p in sorted(pins)]
    for p, item in pins.items():
        if sha(Path(p)) != item["sha256"]:
            raise ValueError(f"Input changed during overlay generation: {p}")
    overlay = {"schema": "ggd.priority81.audio-branch-overlay@1",
               "generator": "tools/hero-model-library/build_priority81_audio_overlay.py",
               "generatorSha256": sha(Path(__file__).resolve()),
               "baselineUnmodified": True, "scopeHeroIds": [row[0] for row in scope],
               "branchAdditionHeroIds": [HERO] if additions else [],
               "branchReplacementHeroIds": sorted(branch_replacements_by_hero),
               "scopeCategories": list(CATEGORIES),
               "inputs": evidence, "inputsSha256": hashlib.sha256(encode(evidence)).hexdigest(),
               "currentMainPins": current_main_pins,
               "summary": summary, "files": additions,
               "approvedBranchReplacementFiles": approved_branch_replacements,
               "currentMainFiles": current_main_files,
               "currentMainReferenceFiles": current_main_reference_files,
               "mainSynchronizedFiles": [current_main_by_clip[clip] for clip in added_since_baseline + changed_since_baseline],
               "currentMainRemovedBaselineFiles": [baseline_by_clip[clip] for clip in removed_since_baseline],
               "heroes": overlay_heroes,
               "limitations": ["The frozen baseline is retained; the current Main snapshot reports later additions, removals and replacements separately.",
                               ("Remaining additions are current branch changes, not evidence of Main merging them."
                                if additions else "The former railway additions are present in the pinned current Main snapshot."),
                               "Railway source audio is not original character voice performance.",
                               "Source rights/listening limitations are retained verbatim in sourceMetadata."]}
    current = {"schema": "ggd.priority81.current-branch-audio@1", "summary": summary,
               "heroes": overlay["heroes"], "files": additions}
    products = {"overlay.json": encode(overlay), "current-per-hero.json": encode(current)}
    receipt = {"schema": "ggd.priority81.audio-overlay-receipt@1", "summary": summary,
               "baselineUnmodified": True, "checks": {"originalSourceSha": True, "statusSha": True,
               "runtimeManifestSha": True, "combatOriginalsSha": True,
               "allCurrentMainManifestFilesMatchGitAndWorktree": not approved_branch_replacements,
               "ownerReviewedBranchReplacementFiles": len(approved_branch_replacements),
               "frozenBaselineFileCount": baseline_count,
               "currentMainFileCount": len(current_main_reference_files),
               "currentMainDeltaBalances": baseline_count + len(added_since_baseline) - len(removed_since_baseline) == len(current_main_reference_files)},
               "products": [{"path": name, "bytes": len(contents), "sha256": hashlib.sha256(contents).hexdigest()}
                            for name, contents in products.items()]}
    products["receipt.json"] = encode(receipt)
    return products, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--source-manifest", type=Path)
    parser.add_argument("--main-ref", default="origin/main",
                        help="Current Main ref used to distinguish merged replacements from branch-only changes")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    source = args.source_manifest or repo.parent / "GGD-Asset-Library/intake/public-audio-20260911/yamanote-kisaragi/manifest.json"
    products, summary = build(repo, source, args.main_ref)
    out = args.out or repo / BASE / "current-branch-audio"
    if args.check:
        stale = [name for name, data in products.items() if not (out / name).is_file() or (out / name).read_bytes() != data]
        if stale:
            raise ValueError("Stale current-branch audio overlay: " + ", ".join(stale))
    else:
        out.mkdir(parents=True, exist_ok=True)
        for name, data in products.items():
            temporary = out / (name + ".tmp")
            with temporary.open("xb") as stream:
                stream.write(data)
            os.replace(temporary, out / name)
    print(json.dumps({"check": args.check, **summary}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, StopIteration, subprocess.CalledProcessError) as error:
        print(f"OVERLAY ERROR: {error}", file=sys.stderr)
        raise SystemExit(2)
