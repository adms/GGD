#!/usr/bin/env python3
"""Build a deterministic, relationship-preserving index for encrypted Unreal PAKs.

The AES key is read only from an environment variable when ``--refresh`` is
requested.  It is passed directly to repak, never printed or written.  Indexing
an existing set of raw lists needs no key.  Duplicate paths remain as separate
source relations while the summary also records the winning (last PAK) source.
"""

from __future__ import annotations

import argparse
import collections
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from typing import Iterable


SCHEMA = "ggd-encrypted-unreal-pak-index@1"


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def safe_entry_path(raw: str) -> str:
    value = raw.strip().replace("\\", "/")
    path = PurePosixPath(value)
    if not value or value.startswith("/") or ".." in path.parts or "\0" in value:
        raise ValueError(f"unsafe PAK entry path: {raw!r}")
    return str(path)


def raw_list_name(pak_name: str) -> str:
    return f"{Path(pak_name).stem}.txt"


def source_kind(path: str) -> str:
    lowered = path.lower()
    if "/sound/" in lowered or lowered.startswith("sound/"):
        return "audio-package"
    if "/effects/" in lowered or lowered.startswith("effects/"):
        return "vfx-package"
    if "/animation/" in lowered or "/animations/" in lowered:
        return "animation-package"
    if "/character/" in lowered or lowered.startswith("character/"):
        return "character-package"
    if "/game/skill_" in lowered or lowered.startswith("game/skill_"):
        return "skill-config-package"
    if "/game/chr" in lowered or lowered.startswith("game/chr"):
        return "character-config-package"
    return "other"


def parse_character_map(values: Iterable[str]) -> dict[str, dict[str, object]]:
    result: dict[str, dict[str, object]] = {}
    for value in values:
        fields = value.split(":")
        if len(fields) < 2 or not fields[0] or not fields[1]:
            raise ValueError("--character-map must be nativeId:name[:heroId[,heroId...]]")
        native_id, name = fields[:2]
        hero_ids = [item for item in fields[2].split(",") if item] if len(fields) > 2 else []
        result[native_id.lower()] = {
            "nativeCharacterId": native_id,
            "name": name,
            "heroIds": hero_ids,
        }
    return result


def matches_character(path: str, native_id: str) -> bool:
    """Match both chr0430 and the game's parallel /0430/ namespaces."""
    lowered = path.lower()
    native_id = native_id.lower()
    if native_id in lowered:
        return True
    digits = native_id[3:] if native_id.startswith("chr") else native_id
    return bool(digits.isdigit() and re.search(rf"(?<!\d){re.escape(digits)}(?!\d)", lowered))


def refresh_lists(repak: Path, containers: list[dict[str, object]], raw_dir: Path, key_env: str) -> str:
    key = os.environ.get(key_env, "")
    if not key:
        raise ValueError(f"--refresh requires AES key in environment variable {key_env}")
    key_bytes = bytes.fromhex(key[2:] if key.startswith("0x") else key)
    if len(key_bytes) != 32:
        raise ValueError("AES key must decode to exactly 32 bytes")
    raw_dir.mkdir(parents=True, exist_ok=True)
    for row in containers:
        pak = Path(str(row["path"]))
        result = subprocess.run(
            [str(repak), "--aes-key", key, "list", str(pak)],
            check=True,
            capture_output=True,
            text=True,
        )
        (raw_dir / raw_list_name(pak.name)).write_text(result.stdout, encoding="utf-8")
    return hashlib.sha256(key_bytes).hexdigest()


def build_index(
    containers: list[dict[str, object]],
    raw_dir: Path,
    characters: dict[str, dict[str, object]],
    source_id: str,
    key_sha256: str | None,
) -> tuple[dict[str, object], list[dict[str, object]]]:
    relations: list[dict[str, object]] = []
    path_sources: dict[str, list[int]] = collections.defaultdict(list)
    container_summaries: list[dict[str, object]] = []
    for order, container in enumerate(containers):
        pak_path = Path(str(container["path"]))
        raw_path = raw_dir / raw_list_name(pak_path.name)
        if not raw_path.is_file():
            raise FileNotFoundError(f"missing raw list for {pak_path.name}: {raw_path}")
        count = 0
        kinds: collections.Counter[str] = collections.Counter()
        with raw_path.open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                entry = safe_entry_path(line)
                kind = source_kind(entry)
                matched = [cid for cid in characters if matches_character(entry, cid)]
                relation = {
                    "path": entry,
                    "container": pak_path.name,
                    "containerOrder": order,
                    "containerSha256": container.get("sha256"),
                    "sourceKind": kind,
                    "nativeCharacterIds": [characters[cid]["nativeCharacterId"] for cid in matched],
                }
                relations.append(relation)
                path_sources[entry].append(len(relations) - 1)
                count += 1
                kinds[kind] += 1
        container_summaries.append({
            "name": pak_path.name,
            "originPath": str(pak_path),
            "bytes": container.get("size", container.get("bytes")),
            "sha256": container.get("sha256"),
            "order": order,
            "entryCount": count,
            "sourceKindCounts": dict(sorted(kinds.items())),
            "rawList": str(raw_path),
        })

    for indices in path_sources.values():
        winner = indices[-1]
        for relation_index in indices:
            relation = relations[relation_index]
            relation["selectedByPatchOrder"] = relation_index == winner
            relation["overriddenBy"] = [relations[i]["container"] for i in indices if i > relation_index]

    unique_paths = len(path_sources)
    duplicate_relations = len(relations) - unique_paths
    kind_counts = collections.Counter(row["sourceKind"] for row in relations)
    selected_kind_counts = collections.Counter(
        row["sourceKind"] for row in relations if row["selectedByPatchOrder"]
    )
    character_rows: list[dict[str, object]] = []
    for key, record in characters.items():
        rows = [row for row in relations if matches_character(str(row["path"]), key)]
        selected = [row for row in rows if row["selectedByPatchOrder"]]
        character_rows.append({
            **record,
            "relationCount": len(rows),
            "uniquePathCount": len({row["path"] for row in rows}),
            "selectedPathCount": len(selected),
            "sourceKindCounts": dict(sorted(collections.Counter(row["sourceKind"] for row in rows).items())),
        })

    summary: dict[str, object] = {
        "schema": SCHEMA,
        "sourceId": source_id,
        "indexEncryption": {
            "encrypted": True,
            "keyRetained": False,
            "keySha256": key_sha256,
            "keyHandling": "environment-only during refresh; value is never written or printed",
        },
        "patchOrderPolicy": "Input container order is base-to-patch; the last relation for a path wins.",
        "containerCount": len(containers),
        "relationCount": len(relations),
        "uniquePathCount": unique_paths,
        "duplicateRelationCount": duplicate_relations,
        "sourceKindRelationCounts": dict(sorted(kind_counts.items())),
        "sourceKindSelectedPathCounts": dict(sorted(selected_kind_counts.items())),
        "containers": container_summaries,
        "characters": character_rows,
        "readiness": "indexed-only; extraction, conversion, validation, registration and deployment are separate states",
    }
    return summary, relations


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl_gz(path: Path, rows: Iterable[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as handle:
                for row in rows:
                    handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


def render_markdown(summary: dict[str, object]) -> str:
    lines = [
        "# JUMP FORCE Steam PAK 索引",
        "",
        f"- 來源 ID：`{summary['sourceId']}`",
        f"- 容器：{summary['containerCount']} 個",
        f"- 來源關係：{summary['relationCount']:,} 筆",
        f"- 唯一路徑：{summary['uniquePathCount']:,} 筆",
        f"- 覆寫／重複關係：{summary['duplicateRelationCount']:,} 筆",
        "- 狀態：只完成 PAK 目錄索引；未等同擷取、轉換、驗收、註冊、可切換或部署。",
        "- AES：金鑰只由環境變數傳入，索引不保存金鑰值。",
        "",
        "## 容器",
        "",
        "| 次序 | PAK | 位元組 | 條目 | SHA-256 |",
        "|---:|---|---:|---:|---|",
    ]
    for row in summary["containers"]:  # type: ignore[index]
        lines.append(
            f"| {row['order']} | `{row['name']}` | {row['bytes']:,} | {row['entryCount']:,} | `{row['sha256']}` |"
        )
    lines.extend(["", "## 已辨識角色", "", "| 原生 ID | 角色 | GGD hero ID | 關係數 | 唯一路徑 |", "|---|---|---|---:|---:|"])
    for row in summary["characters"]:  # type: ignore[index]
        hero_ids = ", ".join(f"`{item}`" for item in row["heroIds"]) or "待綁定"
        lines.append(
            f"| `{row['nativeCharacterId']}` | {row['name']} | {hero_ids} | {row['relationCount']:,} | {row['uniquePathCount']:,} |"
        )
    lines.extend(["", "## 可重建命令", "", "詳見 `tools/hero-model-library/source-workflows/jump-force-steam-dai-v1/README.md`。", ""])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container-manifest", type=Path, required=True)
    parser.add_argument("--raw-list-dir", type=Path, required=True)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--path-contains", default="JUMP FORCE/JUMP_FORCE/Content/Paks/")
    parser.add_argument("--character-map", action="append", default=[])
    parser.add_argument("--summary-json", type=Path, required=True)
    parser.add_argument("--summary-md", type=Path, required=True)
    parser.add_argument("--full-index", type=Path, required=True)
    parser.add_argument("--key-sha256")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--repak", type=Path)
    parser.add_argument("--aes-key-env", default="UNREAL_PAK_AES_KEY")
    args = parser.parse_args()

    data = load_json(args.container_manifest)
    if not isinstance(data, dict) or not isinstance(data.get("files"), list):
        raise ValueError("container manifest must contain a files array")
    containers = [row for row in data["files"] if args.path_contains in str(row.get("path", ""))]
    if not containers:
        raise ValueError("no containers matched --path-contains")
    key_sha256 = args.key_sha256
    if args.refresh:
        if not args.repak:
            raise ValueError("--refresh requires --repak")
        key_sha256 = refresh_lists(args.repak, containers, args.raw_list_dir, args.aes_key_env)
    if key_sha256 and (len(key_sha256) != 64 or any(c not in "0123456789abcdef" for c in key_sha256.lower())):
        raise ValueError("--key-sha256 must be a 64-character hexadecimal digest")

    summary, relations = build_index(
        containers,
        args.raw_list_dir,
        parse_character_map(args.character_map),
        args.source_id,
        key_sha256,
    )
    write_json(args.summary_json, summary)
    args.summary_md.parent.mkdir(parents=True, exist_ok=True)
    args.summary_md.write_text(render_markdown(summary), encoding="utf-8")
    write_jsonl_gz(args.full_index, relations)
    print(json.dumps({
        "summaryJson": str(args.summary_json),
        "summaryMarkdown": str(args.summary_md),
        "fullIndex": str(args.full_index),
        "relationCount": summary["relationCount"],
        "uniquePathCount": summary["uniquePathCount"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
