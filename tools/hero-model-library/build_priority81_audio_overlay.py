#!/usr/bin/env python3
"""Audit only the two b2-kisaragi audio additions against the frozen Main baseline.

Writes an independent overlay, per-hero view and receipt. Never edits the frozen
baseline, runtime audio, source manifest, COMBAT_ORIGINALS or voice generators.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import sys


HERO = "b2-kisaragi"
CATEGORIES = ("taunt", "victory")
BASE = Path("materials/hero-model-library/priority-evidence/main-81-handoff")


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build(repo, source_manifest):
    pins = {}

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
    hero = next(h for h in baseline["heroes"] if h["heroId"] == HERO)
    main = hero["mainCommittedVoice"]
    previous = [f for f in baseline_files["files"] if f["heroId"] == HERO]
    if any(category in f["categories"] for f in previous for category in CATEGORIES):
        raise ValueError("Requested additions already occur in the frozen Main baseline")
    for item in previous:
        evidence = pin(repo / "content" / item["clip"])
        if evidence["sha256"] != item["sha256"]:
            raise ValueError(f"Existing Main clip changed: {item['clip']}")
    status_path = repo / f"content/assets/audio/voices/lines/{HERO}/status.json"
    originals_path = repo / "content/assets/audio/voices/lines/COMBAT_ORIGINALS.json"
    manifest_path = repo / "content/assets/audio/voices/champions/MANIFEST.json"
    status, originals, manifest = read(status_path), read(originals_path), read(manifest_path)
    conversion_path = repo / "materials/hero-model-library/priority-evidence/kisaragi-train-audio/conversion.json"
    conversion = pin(conversion_path)
    if status.get("championId") != HERO:
        raise ValueError("Current status champion ID mismatch")
    source = read(source_manifest)
    if source.get("schema") != "ggd.source-audio-delivery@1" or source.get("frozen") is not True:
        raise ValueError("Expected the frozen two-file source audio delivery")
    original_bindings = originals.get("champions", {}).get(HERO, {})
    manifest_lines = manifest.get("champions", {}).get(HERO, {}).get("lines", {})
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
            "publicationState": "current-branch-pending-main-merge", "mainMerged": False,
            "speakerVerified": False, "originalCharacterPerformance": False,
            "excludedFromSpeechInput": binding.get("excludedFromSpeechInput", False),
            "synthetic": False, "status": state, "manifestBinding": records[0],
            "originalBinding": binding, "originalFile": original,
            "sourceMetadata": src,
            "conversionReceipt": conversion,
        })
    view = copy.deepcopy(main)
    view.pop("revision", None)
    view.pop("allGitHashesVerified", None)
    view.pop("allWorktreeFilesMatchMain", None)
    view.update({"mainBaselineRevision": main["revision"],
                 "publicationState": "current-branch-pending-main-merge", "mainMergedAdditions": False,
                 "uniqueClipCount": main["uniqueClipCount"] + len(additions),
                 "originalSourceLabelledCount": main["originalSourceLabelledCount"] + len(additions),
                 "addedCategories": list(CATEGORIES), "additionalSourceFileCount": len(additions),
                 "allCurrentFilesShaVerified": True,
                 "note": "Frozen Main baseline plus two current-branch railway audio bindings; not original character performance or Main merge evidence."})
    for key in ("missingCategories", "missingCoreCategories", "missingExtended11Categories"):
        view[key] = [c for c in main.get(key, []) if c not in CATEGORIES]
    view["categoryCounts"] = {**main["categoryCounts"], **{c: 1 for c in CATEGORIES}}
    baseline_count = len({f["clip"] for f in baseline_files["files"]})
    all_paths = {f["clip"] for f in baseline_files["files"]} | {f["clip"] for f in additions}
    if len(all_paths) != baseline_count + 2:
        raise ValueError("The two additions are not distinct new runtime paths")
    summary = {"baselineRevision": main["revision"], "baselineUniqueClipPaths": baseline_count,
               "currentBranchAdditionalFiles": len(additions), "currentUniqueClipPaths": len(all_paths),
               "currentHeroesCompleteExtended11": baseline_summary["heroesCompleteExtended11"] +
               int(bool(main["missingExtended11Categories"]) and not view["missingExtended11Categories"]),
               "mainMergedAdditions": False, "productionPlaybackVerified": False}
    evidence = [pins[p] for p in sorted(pins)]
    for p, item in pins.items():
        if sha(Path(p)) != item["sha256"]:
            raise ValueError(f"Input changed during overlay generation: {p}")
    overlay = {"schema": "ggd.priority81.audio-branch-overlay@1",
               "generator": "tools/hero-model-library/build_priority81_audio_overlay.py",
               "generatorSha256": sha(Path(__file__).resolve()),
               "baselineUnmodified": True, "scopeHeroIds": [HERO], "scopeCategories": list(CATEGORIES),
               "inputs": evidence, "inputsSha256": hashlib.sha256(encode(evidence)).hexdigest(),
               "summary": summary, "files": additions,
               "heroes": [{"heroId": HERO, "runtimeHeroId": HERO, "mainBaselineVoice": main,
                           "currentBranchVoice": view}],
               "limitations": ["Two additions are current branch changes, not evidence of Main merging them.",
                               "Railway source audio is not original character voice performance.",
                               "Source rights/listening limitations are retained verbatim in sourceMetadata."]}
    current = {"schema": "ggd.priority81.current-branch-audio@1", "summary": summary,
               "heroes": overlay["heroes"], "files": additions}
    products = {"overlay.json": encode(overlay), "current-per-hero.json": encode(current)}
    receipt = {"schema": "ggd.priority81.audio-overlay-receipt@1", "summary": summary,
               "baselineUnmodified": True, "checks": {"originalSourceSha": True, "statusSha": True,
               "runtimeManifestSha": True, "combatOriginalsSha": True, "previousNineFilesUnchanged": len(previous) == 9},
               "products": [{"path": name, "bytes": len(contents), "sha256": hashlib.sha256(contents).hexdigest()}
                            for name, contents in products.items()]}
    products["receipt.json"] = encode(receipt)
    return products, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--source-manifest", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    source = args.source_manifest or repo.parent / "GGD-Asset-Library/intake/public-audio-20260911/yamanote-kisaragi/manifest.json"
    products, summary = build(repo, source)
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
    except (OSError, ValueError, KeyError, StopIteration) as error:
        print(f"OVERLAY ERROR: {error}", file=sys.stderr)
        raise SystemExit(2)
