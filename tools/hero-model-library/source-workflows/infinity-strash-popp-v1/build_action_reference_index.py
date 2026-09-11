#!/usr/bin/env python3
"""Index extracted PN020 UE4 action-controller package references without playing them.

The input is a bounded UE4.26 export-table analysis generated from the preserved
PAK.  This tool rechecks every referenced action package's bytes and SHA-256,
then records only names/imports that identify potential motion, VFX, audio, and
voice dependencies.  It deliberately does not decode AnimSequence tracks or
call controller references playable GGD actions.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path


PN020_ACTION_PREFIX = "Strash/Chara/Player/PN020/Action/"


def sha256(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def reference_groups(package):
    names = set(package.get("names", []))
    imports = package.get("imports", [])
    import_names = {entry["objectName"] for entry in imports}
    all_names = names | import_names
    def matching(predicate):
        return sorted(name for name in all_names if predicate(name))
    return {
        "animationObjectNames": matching(lambda name: name.startswith(("AM_PN020", "AS_PN020"))),
        "skeletonObjectNames": matching(lambda name: name == "SK_PN020_Skeleton"),
        "vfxPackagePaths": matching(lambda name: name.startswith("/Game/Strash/VFX/")),
        "akEventObjectNames": sorted(entry["objectName"] for entry in imports if entry["className"] == "AkAudioEvent"),
        "voiceEventObjectNames": matching(lambda name: name.startswith("Play_VO_")),
        "niagaraSystemObjectNames": sorted(entry["objectName"] for entry in imports if entry["className"] == "NiagaraSystem"),
    }


def intended_event(category, stem):
    if category == "NormalAttack":
        return "normal-attack-reference"
    if category == "Base" and stem.endswith("_Dead"):
        return "death-reference"
    if category == "Base" and stem.endswith("_Damage"):
        return "damage-reference"
    if category == "Base" and stem.endswith("_Locomotion"):
        return "locomotion-reference"
    if category in {"Skill", "ActiveSkill", "Special", "Extra"}:
        return "skill-or-special-reference"
    if category == "Emote":
        return "emote-reference"
    return "unclassified-action-controller-reference"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--export-analysis", type=Path, required=True)
    parser.add_argument("--extracted-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    export_analysis = args.export_analysis.resolve()
    extracted_root = args.extracted_root.resolve()
    output = args.output.resolve()
    if output.exists():
        raise ValueError("output must be new to preserve a reproducible analysis stage")
    document = json.loads(export_analysis.read_text())
    rows = []
    for package in document.get("packages", []):
        relative = package["relativePath"]
        if not relative.startswith(PN020_ACTION_PREFIX):
            continue
        uasset = extracted_root / relative
        uexp = uasset.with_suffix(".uexp")
        if not uasset.is_file() or not uexp.is_file():
            raise ValueError("missing extracted action pair: " + relative)
        if sha256(uasset) != package["uassetSha256"] or sha256(uexp) != package["uexpSha256"]:
            raise ValueError("action package hash drift: " + relative)
        suffix = relative.removeprefix(PN020_ACTION_PREFIX)
        parts = suffix.split("/")
        category = parts[0] if len(parts) > 1 else "root"
        stem = Path(relative).stem
        refs = reference_groups(package)
        rows.append({
            "id": stem,
            "category": category,
            "intendedEventReference": intended_event(category, stem),
            "uasset": {"path": str(uasset), "sha256": package["uassetSha256"], "bytes": uasset.stat().st_size},
            "uexp": {"path": str(uexp), "sha256": package["uexpSha256"], "bytes": uexp.stat().st_size},
            "exportClasses": sorted({entry["className"] for entry in package.get("exports", [])}),
            "references": refs,
            "playbackState": "not-decoded-not-playable",
            "nativeOriginalState": "community-mod-package; original-game byte equivalence not established",
            "ggdActionState": "reference-only; no retarget, event timing, or clip availability verified",
        })
    if not rows:
        raise ValueError("no PN020 action controllers found")
    groups = collections.Counter(row["category"] for row in rows)
    events = collections.Counter(row["intendedEventReference"] for row in rows)
    result = {
        "schema": "ggd-infinity-strash-pn020-action-reference-index@1",
        "sourceId": "parallel-infinity-strash-sorcerer-popp",
        "heroIds": ["b2-popp"],
        "sourceCharacterId": "PN020",
        "sourceWork": "Infinity Strash: DRAGON QUEST The Adventure of Dai",
        "sourcePlatform": "PC community MOD package over UE4.26; not a base-game asset dump",
        "inputs": {
            "exportAnalysis": {"path": str(export_analysis), "sha256": sha256(export_analysis), "bytes": export_analysis.stat().st_size},
            "extractedRoot": str(extracted_root),
        },
        "actionControllerCount": len(rows),
        "categoryCounts": dict(sorted(groups.items())),
        "eventReferenceCounts": dict(sorted(events.items())),
        "actionControllers": rows,
        "knownNativeMotionAssets": {
            "animSequenceCount": 1,
            "animMontageCount": 5,
            "decodedPlayableGlbClipCount": 0,
            "claim": "Only the separately indexed AnimSequence/Montage package bytes are retained. Controller references do not prove a clip exists locally or plays on the missing skeleton.",
        },
        "gaps": [
            "SK_PN020_Skeleton and PN020 body mesh are external dependencies and absent from this package.",
            "Compressed AnimSequence tracks are not decoded and no controller state machine has been executed.",
            "AkEvent and Niagara references identify missing dependencies; they are not recovered audio or VFX payloads.",
            "No rendered model, action playback, backend option, default selection, or deployment is proven by this index.",
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "sha256": sha256(output), "actionControllerCount": len(rows), "categoryCounts": result["categoryCounts"], "eventReferenceCounts": result["eventReferenceCounts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
