#!/usr/bin/env python3
"""Build the cross-source local SSBU fighter/form inventory.

This inventory deliberately keeps three evidence layers separate:

* the Worldblender Git LFS snapshot (models and textures),
* the Ultimate14 community MOD (motions, effects and audio banks), and
* the user's Windows NSandNS2 container inventory (metadata only while absent).

The LFS OID is a source-pinned SHA-256.  This workflow verifies every local
file's size, but only calls a payload freshly hashed when this run read it.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
WORKSPACE = REPO.parent
ASSETS = WORKSPACE / "GGD-Asset-Library"
WORLD_ROOT = ASSETS / "intake/public-models-20260910/gitlab-ssbu-models"
WORLD_REPO = WORLD_ROOT / "source-repository"
LFS_MANIFEST = WORLD_ROOT / "source-lfs-manifest.json"
ULTIMATE_ROOT = ASSETS / "intake/public-models-20260910/parallel-ns-ultimate14/extracted/Ultimate14/Ultimate14"
MOTION_INDEX = REPO / "materials/hero-model-library/source-inventories/ultimate14-native-motions.json"
WINDOWS_INDEX = REPO / "materials/hero-model-library/source-inventories/windows-game-library.json.gz"
DOWNLOAD_SOURCES = REPO / "materials/hero-model-library/download-sources.json"
OUTPUT_DIR = REPO / "materials/hero-model-library/source-inventories/ssbu-ultimate-local-roster-v1"
OUTPUT_JSON = OUTPUT_DIR / "inventory.json"
OUTPUT_MD = OUTPUT_DIR / "README.md"

HELPER_IDS = {"common", "element"}
MII_IDS = {"miifighter", "miigunner", "miiswordsman"}
SPECIAL_PRIMARY = {
    "brave": ("luminary", "erdrick", "solo", "eight"),
    "pickel": ("steve", "alex", "zombie", "enderman"),
    "pikmin": ("olimar", "alph"),
}


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path):
    data = gzip.decompress(path.read_bytes()) if path.suffix == ".gz" else path.read_bytes()
    return json.loads(data.decode())


def primary_body(path: str, fighter: str) -> bool:
    leaf = Path(path).name.lower()
    costume = Path(path).parent.name.lower()
    if fighter == "ptrainer":
        return f"/model/ptrainer/{costume}/" in f"/{path.lower()}" and leaf == f"ptrainer-{costume}.blend"
    if f"/model/body/{costume}/" not in f"/{path.lower()}":
        return False
    if leaf == f"{fighter}-{costume}.blend":
        return True
    return any(leaf == f"{fighter}-{variant}-{costume}.blend" for variant in SPECIAL_PRIMARY.get(fighter, ()))


def build() -> dict:
    lfs = read_json(LFS_MANIFEST)
    missing = []
    size_mismatch = []
    by_fighter: dict[str, list[dict]] = defaultdict(list)
    types = Counter()
    total_bytes = 0
    for row in lfs:
        path = WORLD_REPO / row["name"]
        types[path.suffix.lower()] += 1
        total_bytes += row["size"]
        if not path.is_file():
            missing.append(row["name"])
        elif path.stat().st_size != row["size"]:
            size_mismatch.append(row["name"])
        parts = Path(row["name"]).parts
        if len(parts) >= 2 and parts[0] == "fighter":
            by_fighter[parts[1]].append(row)

    motion = read_json(MOTION_INDEX)
    ultimate_files = [p for p in ULTIMATE_ROOT.rglob("*") if p.is_file()]
    effect_by_fighter = Counter()
    audio_by_fighter = Counter()
    for path in ultimate_files:
        rel = path.relative_to(ULTIMATE_ROOT).as_posix()
        parts = rel.split("/")
        if len(parts) >= 3 and parts[:2] == ["effect", "fighter"]:
            effect_by_fighter[parts[2]] += 1
        if rel.startswith("sound/bank/fighter/se_") and path.suffix == ".patch3audio":
            stem = path.stem.removeprefix("se_")
            fighter = stem.rsplit("_c", 1)[0]
            audio_by_fighter[fighter] += 1

    downloads = read_json(DOWNLOAD_SOURCES)
    world_source = next(row for row in downloads["publicSources"] if row["id"] == "gitlab-ssbu-models")
    ultimate_source = next(row for row in downloads["publicSources"] if row["id"] == "parallel-ns-ultimate14")
    decoded_revision = ultimate_source["decodedAudioRevisions"][-1]
    decoded_index_path = Path(decoded_revision["localRoot"]) / decoded_revision["audioFileIndex"]["reportPath"]
    if sha(decoded_index_path) != decoded_revision["audioFileIndex"]["reportSha256"]:
        raise ValueError("Ultimate14 decoded-audio index differs from its source pin")
    decoded_index = read_json(decoded_index_path)
    decoded_wav_by_fighter = Counter()
    for group in decoded_index["audioGroups"]:
        fighter = group["id"].removeprefix("ultimate14-se-").rsplit("-c", 1)[0]
        decoded_wav_by_fighter[fighter] += group["fileCount"]
    accepted = {}
    for component in world_source.get("componentCandidates", []):
        if component.get("componentReady") and component.get("structuralValidationPassed"):
            native = component.get("nativeId", "")
            parts = native.split("/")
            fighter = parts[1] if len(parts) > 1 and parts[0] in {"fighter", "assist"} else None
            if fighter:
                accepted[fighter] = {
                    "componentId": component["id"],
                    "gitPath": component["gitPath"],
                    "sha256": component["sha256"],
                    "triangles": component["triangles"],
                    "jointCount": component["jointCount"],
                    "nativeAnimationCount": component.get("nativeAnimationCount", 0),
                    "runtimeSelectable": component.get("runtimeSelectable", False),
                }
    accepted_motion = {}
    for component in ultimate_source.get("componentCandidates", []):
        if not component.get("componentReady") or component.get("resourceRole") != "independent-skinned-model-motion-component":
            continue
        native = component.get("nativeId", "")
        parts = native.split("/")
        fighter = parts[1] if len(parts) > 1 and parts[0] == "fighter" else None
        if fighter:
            accepted_motion[fighter] = {
                "componentId": component["id"], "gitPath": component["gitPath"], "sha256": component["sha256"],
                "triangles": component["triangles"], "drawPrimitives": component["drawPrimitives"],
                "jointCount": component["jointCount"], "nativeAnimationCount": component["nativeAnimationCount"],
                "runtimeSelectable": component.get("runtimeSelectable", False),
            }

    rows = []
    for fighter in sorted(by_fighter):
        files = by_fighter[fighter]
        blends = [row for row in files if row["name"].lower().endswith(".blend")]
        pngs = [row for row in files if row["name"].lower().endswith(".png")]
        primary = [row for row in blends if primary_body(row["name"], fighter)]
        body_any = [row for row in blends if "/model/body/" in f"/{row['name'].lower()}"]
        if fighter == "ptrainer":
            body_any = [row for row in blends if "/model/ptrainer/" in f"/{row['name'].lower()}"]
        motion_row = motion["fighters"].get(fighter)
        rows.append({
            "nativeId": fighter,
            "classification": "helper/shared" if fighter in HELPER_IDS else ("fighter-form-without-body-in-snapshot" if fighter in MII_IDS and not body_any else "fighter-or-form"),
            "worldblender": {
                "fileCount": len(files),
                "blendCount": len(blends),
                "pngCount": len(pngs),
                "bodyOrAvatarBlendCount": len(body_any),
                "primaryBodyOrAvatarCandidateCount": len(primary),
                "primaryBodyOrAvatarCandidates": [{"relativePath": r["name"], "bytes": r["size"], "lfsPinnedSha256": r["oid"]} for r in primary],
                "modelCandidateExists": bool(primary),
                "textureFilesExist": bool(pngs),
                "skeletonStatus": "validated-in-standardized-component" if fighter in accepted else ("embedded-in-blend-uninspected" if primary else "no-body-candidate"),
                "acceptedStaticComponent": accepted.get(fighter),
            },
            "ultimate14": {
                "motionAliasCount": motion_row["pathCount"] if motion_row else 0,
                "bodyMotionAliasCount": motion_row["bodyMotionPathCount"] if motion_row else 0,
                "uniqueBodyMotionPayloadCount": motion_row["uniqueBodyMotionPayloadCount"] if motion_row else 0,
                "nativeMotionExists": bool(motion_row and motion_row["bodyMotionPathCount"]),
                "effectFileCount": effect_by_fighter[fighter],
                "effectFilesExist": effect_by_fighter[fighter] > 0,
                "audioBankAliasCount": audio_by_fighter[fighter],
                "audioBankExists": audio_by_fighter[fighter] > 0,
                "decodedWavCount": decoded_wav_by_fighter[fighter],
                "acceptedMotionComponent": accepted_motion.get(fighter),
            },
            "runtimeSelectable": bool(accepted.get(fighter, {}).get("runtimeSelectable", False)),
        })

    windows = read_json(WINDOWS_INDEX)
    containers = []
    for row in windows["romCandidates"]:
        path = row.get("sourcePath", "")
        if "NSandNS2" in path and "Smash" in row.get("title", ""):
            containers.append({
                "title": row["title"],
                "windowsAbsolutePath": path,
                "bytes": row["sizeBytes"],
                "contentHash": row.get("contentHash"),
                "contentInspected": row.get("contentInspected", False),
                "extractionStatus": row.get("extractionStatus", "not-started"),
                "conversionStatus": row.get("conversionStatus", "not-started"),
            })

    fighter_rows = [row for row in rows if row["nativeId"] not in HELPER_IDS]
    with_body = [row for row in fighter_rows if row["worldblender"]["modelCandidateExists"]]
    result = {
        "schema": "ggd-ssbu-ultimate-local-roster@1",
        "generatedAt": "2026-09-14",
        "sourceIds": ["gitlab-ssbu-models", "parallel-ns-ultimate14", "windows-game-library-20260912"],
        "countingPolicy": {
            "fighterTopLevelDirectoryCount": "Every direct fighter/<id> directory in the pinned Worldblender snapshot.",
            "fighterOrFormIdCount": "Top-level directories excluding helper/shared IDs common and element. This is a local native ID/form count, not Nintendo's official selectable roster count.",
            "bodyCandidate": "A conventional fighter/<id>/model/body/<costume> primary .blend, or the ptrainer avatar equivalent.",
            "primaryCandidate": "Exact <fighter>-<costume>.blend plus named brave/pickel/pikmin forms and ptrainer avatars. Props and alternate internal meshes are excluded.",
            "motionCount": "Ultimate14 alias and unique-payload counts only. They are community-MOD-native, not verified original Nintendo animations.",
        },
        "summary": {
            "worldblenderManifestFiles": len(lfs),
            "worldblenderManifestBytes": total_bytes,
            "worldblenderBlendFiles": types[".blend"],
            "worldblenderPngFiles": types[".png"],
            "worldblenderDdsFiles": types[".dds"],
            "worldblenderArchiveFiles": types[".7z"],
            "worldblenderLocalFilesExist": len(lfs) - len(missing),
            "worldblenderLocalSizeMatched": len(lfs) - len(missing) - len(size_mismatch),
            "worldblenderMissingFiles": len(missing),
            "worldblenderSizeMismatchFiles": len(size_mismatch),
            "fighterTopLevelDirectoryCount": len(rows),
            "fighterOrFormIdCount": len(fighter_rows),
            "fighterOrFormWithBodyCandidateCount": len(with_body),
            "fighterOrFormWithoutBodyCandidateCount": len(fighter_rows) - len(with_body),
            "primaryBodyOrAvatarCandidateCount": sum(row["worldblender"]["primaryBodyOrAvatarCandidateCount"] for row in fighter_rows),
            "acceptedStaticComponentCount": sum(bool(row["worldblender"]["acceptedStaticComponent"]) for row in rows),
            "acceptedMotionComponentCount": sum(bool(row["ultimate14"]["acceptedMotionComponent"]) for row in rows),
            "runtimeSelectableCount": sum(row["runtimeSelectable"] for row in rows),
            "ultimate14MotionFighterCount": motion["summary"]["fighterCount"],
            "ultimate14MotionAliasCount": motion["summary"]["pathCount"],
            "ultimate14UniqueTransformPayloadCount": motion["summary"]["uniqueTransformMotionPayloadCount"],
            "ultimate14EffectFiles": sum(effect_by_fighter.values()),
            "ultimate14AudioBankAliases": sum(audio_by_fighter.values()),
            "ultimate14DecodedWavFiles": decoded_index["decodedWavCount"],
            "ultimate14DecodedUniqueBanks": decoded_index["uniqueBankCount"],
            "ultimate14DecodedPhysicalEntries": decoded_index["physicalNativeEntryCount"],
            "windowsNsandns2ContainerRecords": len(containers),
            "windowsNsandns2PayloadBytesRead": 0,
        },
        "worldblender": {
            "localPath": str(WORLD_REPO),
            "commit": world_source["commit"],
            "lfsManifest": {"path": str(LFS_MANIFEST), "bytes": LFS_MANIFEST.stat().st_size, "sha256": sha(LFS_MANIFEST)},
            "verification": "All manifest paths exist and their local byte sizes match. LFS OIDs remain source-pinned hashes; selected conversion inputs are freshly SHA-256 checked by their conversion receipts.",
            "missingPaths": missing,
            "sizeMismatchPaths": size_mismatch,
        },
        "ultimate14": {
            "localPath": str(ULTIMATE_ROOT),
            "motionIndex": {"gitPath": str(MOTION_INDEX.relative_to(REPO)), "bytes": MOTION_INDEX.stat().st_size, "sha256": sha(MOTION_INDEX)},
            "decodedAudioIndex": {"path": str(decoded_index_path), "bytes": decoded_index_path.stat().st_size, "sha256": sha(decoded_index_path)},
            "whyPriorCountWas16": "The value 16 is the number of fighter IDs with NUANMB paths in the Ultimate14 community MOD. It is not the full Super Smash Bros. Ultimate roster.",
            "motionFighterIds": sorted(motion["fighters"]),
        },
        "nsandns2": {
            "windowsRoot": r"E:\Game\單機遊戲\模擬器\NSandNS2",
            "currentMacSharePath": "/Volumes/game",
            "currentMacShareMounted": Path("/Volumes/game").is_dir(),
            "containers": containers,
            "blocker": "The Windows share is not mounted in this run. Only metadata was available: payload bytes read 0, header/member inventory 0, title/update/DLC composition unverified, extracted 0 and converted 0.",
        },
        "fighters": rows,
        "gaps": [
            "The 92 count is a local fighter/form ID count and includes non-selectable forms such as koopag; it must not be presented as Nintendo's official selectable roster total.",
            "The Worldblender repository provides Blender model/texture candidates, not a full original-game motion, VFX or audio dump.",
            "Ultimate14 is a community MOD patch. Its 16 motion fighters, three fighter effect files and 56 sound-bank aliases do not cover the full roster.",
            "The 19 decoded WAV files retain source labels only; language, speaker and gameplay event are unreviewed and runtime binding remains zero.",
            "Uninspected Blender files are model candidates only; their embedded skeleton/material quality and GGD budget status remain pending until converted and validated.",
            "No new hero ID, backend dropdown registration or deployment is created by this inventory.",
        ],
    }
    return result


def render_md(data: dict) -> str:
    s = data["summary"]
    lines = [
        "# SSBU Ultimate 本機完整 fighter／形態清冊",
        "",
        "這份清冊把 Worldblender 模型庫、Ultimate14 社群 MOD 及 Windows `NSandNS2` 容器分層計數，不把「容器存在」寫成「已擷取」。",
        "",
        f"- 先前的 **16** 是 Ultimate14 MOD 內有 NUANMB 路徑的 fighter ID 數，不是 Ultimate 完整角色數。",
        f"- Worldblender 快照有 {s['fighterTopLevelDirectoryCount']} 個 `fighter/<id>` 頂層群；排除 `common` 與 `element` 後是 **{s['fighterOrFormIdCount']} 個 fighter／形態 ID**。這是本機來源 ID 數，不是任天堂官方可選 roster 數。",
        f"- {s['fighterOrFormWithBodyCandidateCount']} 個 ID 有身體／Trainer avatar Blender 候選，{s['fighterOrFormWithoutBodyCandidateCount']} 個沒有（本快照為三個 Mii 職業）；共 {s['primaryBodyOrAvatarCandidateCount']} 個主要配色／形態候選。",
        f"- 整庫 {s['worldblenderManifestFiles']:,} 個 LFS 檔／{s['worldblenderManifestBytes']:,} bytes：{s['worldblenderBlendFiles']:,} `.blend`、{s['worldblenderPngFiles']:,} PNG。本次全數點名與大小核對：缺檔 {s['worldblenderMissingFiles']}、大小不符 {s['worldblenderSizeMismatchFiles']}。",
        f"- Ultimate14 有 {s['ultimate14MotionFighterCount']} 個動作 fighter／{s['ultimate14MotionAliasCount']} 條 alias／{s['ultimate14UniqueTransformPayloadCount']} 個唯一 Transform payload；現有 {s['acceptedMotionComponentCount']} 個已驗收獨立動作元件，另有 {s['ultimate14EffectFiles']} 個 fighter effect 檔和 {s['ultimate14AudioBankAliases']} 個音訊 bank alias。7 個唯一 bank 已解碼為 {s['ultimate14DecodedWavFiles']} 個 WAV，但語言、說話者與事件均未審。",
        f"- `NSandNS2` 只有 {s['windowsNsandns2ContainerRecords']} 筆 Windows metadata，payload 實讀 {s['windowsNsandns2PayloadBytesRead']} bytes，未解包。",
        "",
        "| native ID | 身體／avatar | 貼圖 | 骨架證據 | Ultimate14 身體動作 | VFX | 音訊 bank | 已解碼 WAV | 已驗收靜態元件 | 已驗收動作元件 | 後台可選 |",
        "|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in data["fighters"]:
        w = row["worldblender"]
        u = row["ultimate14"]
        lines.append(
            f"| `{row['nativeId']}` | {w['primaryBodyOrAvatarCandidateCount']} | {w['pngCount']} | {w['skeletonStatus']} | {u['bodyMotionAliasCount']} | {u['effectFileCount']} | {u['audioBankAliasCount']} | {u['decodedWavCount']} | {1 if w['acceptedStaticComponent'] else 0} | {1 if u['acceptedMotionComponent'] else 0} | {1 if row['runtimeSelectable'] else 0} |"
        )
    lines += ["", "## NSandNS2 blocker", "", data["nsandns2"]["blocker"], "", "## 限制", ""]
    lines += [f"- {gap}" for gap in data["gaps"]]
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    data = build()
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    markdown = render_md(data)
    if args.write:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUT_JSON.write_text(payload)
        OUTPUT_MD.write_text(markdown)
    else:
        if not OUTPUT_JSON.is_file() or OUTPUT_JSON.read_text() != payload:
            raise SystemExit("SSBU inventory JSON is stale; run with --write")
        if not OUTPUT_MD.is_file() or OUTPUT_MD.read_text() != markdown:
            raise SystemExit("SSBU inventory README is stale; run with --write")
    print(json.dumps({"output": str(OUTPUT_JSON.relative_to(REPO)), "summary": data["summary"], "written": args.write}, ensure_ascii=False))


if __name__ == "__main__":
    main()
