#!/usr/bin/env python3
"""Build an evidence-only inventory for the J-Stars Nube/Luckyman/Hiei lane.

This workflow never infers native character IDs from roster order.  It records
the owner archive only when the file is locally observable, and keeps material
from another game as an explicit alternate-source reserve.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any


SCHEMA = "ggd.jstars-priority-nube-luckyman-hiei-inventory@1"
ARCHIVE_NAME = "J-Stars Victory Vs+.7z"
MODULES = ("model", "skeleton", "motion", "vfx", "sfx", "voice")
CHARACTERS = (
    {
        "slug": "nube",
        "nameZhTW": "鵺野鳴介／神眉",
        "nameEnglish": "Meisuke Nueno",
        "workZhTW": "靈異教師神眉",
        "ggdHeroIds": ["b2-nube"],
    },
    {
        "slug": "luckyman",
        "nameZhTW": "幸運超人",
        "nameEnglish": "Luckyman",
        "workZhTW": "幸運超人",
        "ggdHeroIds": ["b2-luckyman"],
    },
    {
        "slug": "hiei",
        "nameZhTW": "飛影",
        "nameEnglish": "Hiei",
        "workZhTW": "幽遊白書",
        "ggdHeroIds": ["godie-u010", "godie-uvng"],
    },
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def asset_root(repo: Path) -> Path:
    return repo.parent / "GGD-Asset-Library"


def output_root(repo: Path) -> Path:
    return repo / "materials/hero-model-library/source-inventories/jstars-priority-nube-luckyman-hiei-v1"


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"expected JSON object: {path}")
    return data


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_receipt(path: Path) -> dict[str, Any]:
    return {
        "path": str(path),
        "existsLocal": path.is_file(),
        "bytes": path.stat().st_size if path.is_file() else None,
        "sha256": sha256_file(path) if path.is_file() else None,
    }


def archive_candidates(repo: Path) -> list[Path]:
    direct_owner_archive = Path.home() / ARCHIVE_NAME
    roots = [
        asset_root(repo) / "intake",
        Path.home() / "Downloads",
        Path.home() / "Desktop",
        repo.parent,
    ]
    matches: dict[str, Path] = {}
    if direct_owner_archive.is_file():
        matches[str(direct_owner_archive.resolve())] = direct_owner_archive.resolve()
    for root in roots:
        if not root.is_dir():
            continue
        if root == repo.parent:
            candidates = [root / ARCHIVE_NAME]
        else:
            candidates = []
            for current, dirs, files in os.walk(root, followlinks=False):
                dirs[:] = sorted(d for d in dirs if d not in {".git", "node_modules", ".pnpm-store"})
                for name in sorted(files):
                    if name.casefold() == ARCHIVE_NAME.casefold():
                        candidates.append(Path(current) / name)
        for path in candidates:
            if path.is_file():
                matches[str(path.resolve())] = path.resolve()
    return [matches[key] for key in sorted(matches)]


def hiei_jumpforce_reserve(repo: Path) -> dict[str, Any]:
    root = asset_root(repo) / (
        "intake/public-models-20260910/parallel-ps-jumpforce-audio-remaining/"
        "JForce_Hiei"
    )
    archive = root / "original/JForce_Hiei.7z"
    validation_path = root / "validation.json"
    validation = load_json(validation_path)
    return {
        "sourceId": "parallel-ps-jumpforce-local-next32:jumpforce-hiei",
        "sourceGame": "JUMP FORCE",
        "relationship": "alternate-source-reserve-not-jstars",
        "archive": file_receipt(archive),
        "validationPath": str(validation_path),
        "validationExists": validation is not None,
        "audioFileCount": validation.get("audioFileCount") if validation else None,
        "durationSeconds": validation.get("durationSeconds") if validation else None,
        "sourceCategoryCounts": validation.get("sourceCategoryCounts") if validation else None,
        "decodeErrorCount": validation.get("oggStructureErrorCount") if validation else None,
        "reviewState": "pending-per-clip-speaker-language-and-event-review",
        "runtimeBound": False,
    }


def missing_module(kind: str) -> dict[str, Any]:
    return {
        "kind": kind,
        "acquisition": "not-observed",
        "extraction": "not-started",
        "conversion": "not-started",
        "validation": "not-started",
        "registration": "not-started",
        "deployment": "not-started",
        "evidence": [],
    }


def build(repo: Path) -> dict[str, Any]:
    upstream_receipt_path = repo / (
        "materials/hero-model-library/source-inventories/"
        "jstars-owner-archive-extract-v1/receipt.json"
    )
    upstream = load_json(upstream_receipt_path)
    cpk_inventory_path = repo / (
        "materials/hero-model-library/source-inventories/"
        "jstars-owner-archive-extract-v1/cpk-inventory.json"
    )
    cpk_inventory = load_json(cpk_inventory_path)
    cpk_by_slug = {
        str(row["slug"]): row
        for row in (cpk_inventory or {}).get("priorityCharacters", [])
        if isinstance(row, dict) and row.get("slug")
    }
    owner_archives = archive_candidates(repo)
    owner_archive_receipts = [file_receipt(path) for path in owner_archives]
    owner_archive_found = bool(owner_archives)
    jumpforce_hiei = hiei_jumpforce_reserve(repo)

    rows = []
    for definition in CHARACTERS:
        modules = {kind: missing_module(kind) for kind in MODULES}
        cpk_character = cpk_by_slug.get(definition["slug"])
        alternate_sources = []
        if definition["slug"] == "hiei" and jumpforce_hiei["archive"]["existsLocal"]:
            alternate_sources.append(jumpforce_hiei)
            for kind in ("sfx", "voice"):
                modules[kind]["alternateSourceObserved"] = True
                modules[kind]["alternateSourceId"] = jumpforce_hiei["sourceId"]
                modules[kind]["alternateSourceStatus"] = "decoded-reserve-pending-owner-listening-review"

        if cpk_character and cpk_character.get("nativeId"):
            identity_status = str(cpk_character["identityStatus"])
            blocker = "$CMP/$CH0 complete decode and validated PS3 SRD conversion remain unavailable"
            source_status = "native-containers-hashed-conversion-blocked"
            for kind in MODULES:
                hints = "model" if kind == "skeleton" else kind
                evidence = [
                    {
                        "container": member["container"],
                        "path": member["path"],
                        "bytes": member["bytes"],
                        "sha256": member["sha256"],
                    }
                    for member in cpk_character["members"]
                    if hints in member.get("moduleHints", [])
                ]
                if evidence:
                    modules[kind] = {
                        "kind": kind,
                        "acquisition": "owner-disc-member-hashed",
                        "extraction": "numeric-token-member-split",
                        "conversion": "blocked-cmp-ch0-and-ps3-srd",
                        "validation": "not-started",
                        "registration": "not-started",
                        "deployment": "not-started",
                        "evidence": evidence,
                    }
        elif owner_archive_found:
            identity_status = "owner-archive-found-native-id-and-containers-not-yet-proven"
            blocker = "archive must be inventoried before any native ID or module can be assigned"
            source_status = "archive-observed-inventory-pending"
        else:
            identity_status = "blocked-owner-archive-not-local-native-id-unproven"
            blocker = "J-Stars owner archive is not visible locally; no character-specific native container is proven"
            source_status = "blocked-archive-not-found"

        rows.append(
            {
                **definition,
                "sourceId": "owner-jstars-victory-vs-plus-20260917",
                "sourceStatus": source_status,
                "nativeId": cpk_character.get("nativeId") if cpk_character else None,
                "identityStatus": identity_status,
                "modules": modules,
                "alternateSources": alternate_sources,
                "runtimeReady": False,
                "backendOptionRegistered": False,
                "defaultApplied": False,
                "deployed": False,
                "blocker": blocker,
            }
        )

    return {
        "schema": SCHEMA,
        "sourceId": "owner-jstars-victory-vs-plus-20260917",
        "scope": [row["slug"] for row in rows],
        "ownerArchive": {
            "expectedFilename": ARCHIVE_NAME,
            "found": owner_archive_found,
            "candidates": owner_archive_receipts,
            "upstreamReceiptPath": str(upstream_receipt_path),
            "upstreamReceiptStatus": upstream.get("status") if upstream else "missing",
            "cpkInventoryPath": str(cpk_inventory_path),
            "cpkInventoryStatus": cpk_inventory.get("status") if cpk_inventory else "missing",
            "cpkSummary": cpk_inventory.get("summary", {}) if cpk_inventory else {},
        },
        "characters": rows,
        "summary": {
            "characters": len(rows),
            "ownerArchivesFound": len(owner_archive_receipts),
            "jstarsNativeIdsProven": sum(row["nativeId"] is not None for row in rows),
            "jstarsSourceContainersProven": sum(
                module["acquisition"] == "owner-disc-member-hashed"
                for row in rows for module in row["modules"].values()
            ),
            "convertedModels": 0,
            "convertedMotions": 0,
            "convertedVfx": 0,
            "runtimeRegistrations": 0,
            "deployments": 0,
            "alternateDecodedAudioFiles": jumpforce_hiei.get("audioFileCount") or 0,
        },
        "rerun": (
            "python3 tools/hero-model-library/source-workflows/"
            "jstars-priority-nube-luckyman-hiei-v1/build_inventory.py"
        ),
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# J-Stars 優先三名素材盤點",
        "",
        "本表由 `build_inventory.py` 產生。它只記錄可由本機實檔重現的證據；不同遊戲的素材會明列為替代來源，不會冒充 J-Stars 原生素材。",
        "",
        f"- Owner archive：`{'已找到' if payload['ownerArchive']['found'] else '本機未找到'}`",
        f"- J-Stars 已證明原生 ID：{payload['summary']['jstarsNativeIdsProven']}",
        f"- J-Stars 已轉換模型／動作／特效：{payload['summary']['convertedModels']}／{payload['summary']['convertedMotions']}／{payload['summary']['convertedVfx']}",
        f"- 已註冊／已部署：{payload['summary']['runtimeRegistrations']}／{payload['summary']['deployments']}",
        "",
        "| 角色 | GGD ID | J-Stars 原生 ID | 模型 | 骨架 | 動作 | 特效 | 音效 | 語音 | 精確狀態 |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for row in payload["characters"]:
        states = [row["modules"][kind]["acquisition"] for kind in MODULES]
        lines.append(
            "| {name} | `{ids}` | {native} | {modules} | {status} |".format(
                name=row["nameZhTW"],
                ids="`, `".join(row["ggdHeroIds"]),
                native=row["nativeId"] or "未證明",
                modules=" | ".join(states),
                status=row["sourceStatus"],
            )
        )
    lines.extend(
        [
            "",
            "## 可立即使用的替代來源證據",
            "",
            "飛影已有 JUMP FORCE 音訊儲備：239 個已解碼 OGG（220 voice、19 SFX），來源 archive SHA-256 `49acb22c8278fafa68e0d44af58bd21ae83c854d8248c3eeacebeb61e8836cbb`。它尚未逐檔確認說話者、語言與技能事件，也不是 J-Stars 素材，因此目前只算待聽審替代候選。",
            "",
            "## 重跑",
            "",
            "```bash",
            payload["rerun"],
            "python3 tools/hero-model-library/source-workflows/jstars-priority-nube-luckyman-hiei-v1/test_inventory.py",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = repo_root()
    root = output_root(repo)
    json_path = root / "inventory.json"
    md_path = root / "README.md"
    payload = build(repo)
    json_text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    md_text = render_markdown(payload)
    if args.check:
        if not json_path.is_file() or json_path.read_text(encoding="utf-8") != json_text:
            raise SystemExit(f"stale generated inventory: {json_path}")
        if not md_path.is_file() or md_path.read_text(encoding="utf-8") != md_text:
            raise SystemExit(f"stale generated inventory: {md_path}")
        return 0
    root.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json_text, encoding="utf-8")
    md_path.write_text(md_text, encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
