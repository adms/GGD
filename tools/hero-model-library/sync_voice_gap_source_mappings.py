#!/usr/bin/env python3
"""Apply the reviewed 2026-09-16 voice source mappings to central indexes.

This small post-generator is intentionally composable with voice_index.py.  It
keeps the frozen 2026-09-10 Riot delivery intact, reads the seven later decoder
receipts, and writes deterministic central JSON/GZIP/Markdown indexes.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "materials/hero-model-library"


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def file_counts(rows: list[dict]) -> dict:
    paths: dict[str, tuple[str, int]] = {}
    for row in rows:
        payload = (row["sha256"], row["bytes"])
        previous = paths.get(row["path"])
        if previous is not None and previous != payload:
            raise ValueError("Conflicting indexed path: " + row["path"])
        paths[row["path"]] = payload
    return {
        "audioFiles": len(rows),
        "bytes": sum(row["bytes"] for row in rows),
        "sourceFileRelationshipRows": len(rows),
        "uniqueLocalPaths": len(paths),
        "uniqueSha256Payloads": len({row["sha256"] for row in rows}),
        "uniqueLocalPathBytes": sum(value[1] for value in paths.values()),
    }


def replace_generated_block(text: str, marker: str, body: str) -> str:
    start = f"<!-- generated:{marker}:start -->"
    end = f"<!-- generated:{marker}:end -->"
    block = start + "\n" + body.rstrip() + "\n" + end
    if start in text:
        before, rest = text.split(start, 1)
        _, after = rest.split(end, 1)
        return before + block + after
    anchor = "## 角色與來源分組"
    assert anchor in text
    return text.replace(anchor, block + "\n\n" + anchor, 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, default=REPO.parent)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    config_path = OUT / "voice-gap-source-mappings-20260916.json"
    config = json.loads(config_path.read_text())
    assert config["schema"] == "ggd.voice-gap-source-mappings@1"

    index_path = OUT / "voice-index.json"
    files_path = OUT / "voice-files.jsonl.gz"
    index = json.loads(index_path.read_text())
    rows = [json.loads(line) for line in gzip.decompress(files_path.read_bytes()).decode().splitlines() if line]
    groups = {group["id"]: group for group in index["groups"]}
    inputs = list(index["inputs"])
    input_pairs = {(row["path"], row["sha256"]) for row in inputs}
    source_id = "lol-riot-ja-jp-16.18.8159717"
    source = next(item for item in json.loads((OUT / "download-sources.json").read_text())["publicSources"] if item["id"] == source_id)
    local_root = workspace / source["localPath"]

    for binding in config["lolSecondBatch"]:
        group_id = f"{source_id}:lol-{binding['groupSlug']}-ja-jp-16-18-8159717"
        group = groups.get(group_id)
        if group is None:
            receipt_path = local_root / "audio/decoded" / binding["nativeId"] / "decoding.json"
            receipt = json.loads(receipt_path.read_text())
            assert receipt["failedCount"] == 0
            assert receipt["decodedCount"] == len(receipt["files"])
            portable_receipt = str(receipt_path.relative_to(workspace))
            input_row = {"path": portable_receipt, "sha256": sha(receipt_path)}
            if (input_row["path"], input_row["sha256"]) not in input_pairs:
                inputs.append(input_row)
                input_pairs.add((input_row["path"], input_row["sha256"]))
            group = {
                "id": group_id,
                "name": f"League of Legends / {binding['nativeId'].removesuffix('.ja_JP')} / ja_JP / 16.18.8159717",
                "library": "公開來源",
                "sourceId": source_id,
                "heroIds": [],
                "mappingEvidence": "Riot 官方 ja_JP 角色目錄與解碼收據；逐段說話者、台詞及 GGD 戰鬥事件仍待聽審",
                "language": "unreviewed",
                "reportedLanguage": "ja_JP",
                "languageEvidence": "Riot official manifest flag ja_JP; per-clip listening pending",
                "speakerVerified": False,
                "transcriptStatus": "not-transcribed",
                "confirmedVoiceCount": None,
                "synthesisReady": False,
                "listeningReviewComplete": False,
                "fileCount": 0,
                "bytes": 0,
                "knownDurationSeconds": 0.0,
                "durationMeasuredFiles": 0,
                "voiceFilenameCandidates": 0,
                "originalBanks": [],
                "backupIds": ["public:" + source_id],
                "sourceUrl": source["url"],
                "work": "League of Legends",
                "languagePreferenceRank": 0,
                "languagePreferenceBasis": "reported-language-only; listening review still required",
                "runtimeApproved": False,
            }
            for decoded in receipt["files"]:
                assert decoded["decoded"] is True
                relative_inside = f"audio/decoded/{binding['nativeId']}/{decoded['output']}"
                local = local_root / relative_inside
                assert local.is_file() and local.stat().st_size == decoded["bytes"]
                rows.append({
                    "groupId": group_id,
                    "path": source["localPath"] + "/" + relative_inside,
                    "sha256": decoded["sha256"],
                    "bytes": decoded["bytes"],
                    "backupId": "public:" + source_id,
                    "archiveMember": None,
                    "localSizeVerified": True,
                    "category": "unclassified",
                    "synthesisReady": False,
                    "sourceIsSynthetic": False,
                    "sourceContainsSynthetic": False,
                    "excludedFromSpeechInput": False,
                    "seconds": decoded["pcm"]["seconds"],
                })
                group["fileCount"] += 1
                group["bytes"] += decoded["bytes"]
                group["knownDurationSeconds"] += decoded["pcm"]["seconds"]
                group["durationMeasuredFiles"] += 1
            group["categoryCounts"] = {"unclassified": group["fileCount"]}
            groups[group_id] = group
        if binding["heroId"] not in group["heroIds"]:
            group["heroIds"].append(binding["heroId"])
            group["heroIds"].sort()
        group["heroBindingEvidence"] = [{
            "heroId": binding["heroId"],
            "relationship": "official-ja-jp-native-character-directory",
            "runtimeApproved": False,
            "authority": str(config_path.relative_to(REPO)),
        }]

    for binding in config["heroGroupBindings"]:
        group = groups[binding["groupId"]]
        if binding["heroId"] not in group["heroIds"]:
            group["heroIds"].append(binding["heroId"])
            group["heroIds"].sort()
        evidence = group.setdefault("heroBindingEvidence", [])
        if not isinstance(evidence, list):
            evidence = group["heroBindingEvidence"] = []
        item = {
            "heroId": binding["heroId"],
            "relationship": binding["relationship"],
            "runtimeApproved": binding["runtimeApproved"],
            "authority": str(config_path.relative_to(REPO)),
        }
        if item not in evidence:
            evidence.append(item)

    index["groups"] = list(groups.values())
    index["inputs"] = inputs
    index["voiceGapSourceMappings"] = {
        "path": str(config_path.relative_to(REPO)),
        "sha256": sha(config_path),
        "lolSecondBatch": len(config["lolSecondBatch"]),
        "explicitHeroGroupBindings": len(config["heroGroupBindings"]),
        "noExactVoiceGroups": len(config["noExactVoiceGroup"]),
    }
    counts = file_counts(rows)
    index["summary"].update(counts)
    index["summary"]["groups"] = len(groups)
    index["summary"]["missingOrSizeChanged"] = sum(not row["localSizeVerified"] for row in rows)

    manifest = "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in rows)
    compressed = gzip.compress(manifest.encode(), mtime=0)
    files_path.write_bytes(compressed)
    index["sourceFileManifestSha256"] = hashlib.sha256(compressed).hexdigest()
    index["uncompressedFileManifestSha256"] = hashlib.sha256(manifest.encode()).hexdigest()
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")

    lol_second_batch_wav = sum(
        groups[f"{source_id}:lol-{binding['groupSlug']}-ja-jp-16-18-8159717"]["fileCount"]
        for binding in config["lolSecondBatch"]
    )
    lines = [
        "## 2026-09-16 Main 語音缺口對應",
        "",
        "這是來源群組對應，不代表逐段說話者、語言、台詞或戰鬥事件已驗收。",
        "",
        "| 批次 | 結果 |",
        "|---|---|",
        f"| LoL 第二批 | 11/11 皆有 Riot 官方 `ja_JP` 解碼 WAV，共 {lol_second_batch_wav:,} 段；全部待逐項聽審與 runtime 綁定。 |",
        f"| 明確角色／來源對應 | {len(config['heroGroupBindings'])} 筆；`heroIds` 已回寫中央索引。 |",
        f"| 目前無 exact 角色語音群組 | {len(config['noExactVoiceGroup'])} 名：" + "、".join(item["name"] for item in config["noExactVoiceGroup"]) + "。 |",
        "| 帕魯三名 | 各 6 段非語言叫聲／音效；不標成日文台詞。 |",
    ]
    report_path = OUT / "角色語音索引.md"
    report = replace_generated_block(report_path.read_text(), "voice-gap-source-mappings-20260916", "\n".join(lines))
    report_path.write_text(report)
    print(json.dumps({"groups": len(groups), **counts, "lolSecondBatchWav": lol_second_batch_wav}, ensure_ascii=False))


if __name__ == "__main__":
    main()
