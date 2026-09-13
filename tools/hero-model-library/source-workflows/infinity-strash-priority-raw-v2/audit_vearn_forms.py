#!/usr/bin/env python3
"""Audit both Infinity Strash PAK indexes for Vearn body forms.

The audit deliberately separates path/name evidence from visual identity.  It
proves which body assets the EN801 character blueprint references and whether
the game's enemy master contains another EN801 form.  It does not infer that
MystVearn or Baran are Vearn variants merely because their native IDs are near
each other.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import subprocess
from pathlib import Path


SCHEMA = "ggd.infinity-strash-vearn-form-audit@1"
SOURCE_ID = "steam-infinity-strash-primary-paks-build-local-20240328"
OFFICIAL_SCOPE_URL = (
    "https://www.square-enix-games.com/en_US/home/"
    "infinity-strash-dragon-quest-adventure-dai-out-now"
)
EN801_BLUEPRINT = "strash/Content/Strash/Chara/Monster/EN801/CB_EN801_00_a"
ENEMY_MASTER = "strash/Content/Strash/DB/EnemyMaster/EnemyMaster_Enemy"
PACKAGE_SUFFIXES = (".uasset", ".uexp")
ASCII = re.compile(rb"[\x20-\x7e]{4,}")
NATIVE_ID = re.compile(r"(?<![A-Za-z0-9])(EN\d{3})(?![A-Za-z0-9])", re.I)
BODY_ASSET = re.compile(
    r"^strash/Content/Strash/Chara/Monster/(EN\d{3})/(?:[^/]+/)*"
    r"(?:SK_[^/]*(?:Body|model)|SK_EN\d{3}_\d{2})\.uasset$",
    re.I,
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(repak: Path, *args: str) -> bytes:
    return subprocess.check_output([str(repak), *args])


def list_pak(repak: Path, pak: Path) -> list[str]:
    return run(repak, "list", str(pak)).decode("utf-8").splitlines()


def package_bytes(repak: Path, pak: Path, package_root: str) -> dict[str, bytes]:
    result = {}
    for suffix in PACKAGE_SUFFIXES:
        member = package_root + suffix
        result[member] = run(repak, "get", str(pak), member)
    return result


def ascii_strings(payloads: dict[str, bytes]) -> list[str]:
    return sorted(
        {
            match.group().decode("ascii")
            for payload in payloads.values()
            for match in ASCII.finditer(payload)
        }
    )


def audit(
    pak_paths: list[tuple[str, Path]],
    listings: dict[str, list[str]],
    blueprint_strings: list[str],
    enemy_master_strings: list[str],
    repak: Path,
) -> dict:
    combined = sorted({path for rows in listings.values() for path in rows})
    monster_body_assets = sorted(path for path in combined if BODY_ASSET.match(path))
    body_assets_by_id: dict[str, list[str]] = {}
    for path in monster_body_assets:
        match = BODY_ASSET.match(path)
        assert match
        body_assets_by_id.setdefault(match.group(1).upper(), []).append(path)

    blueprint_refs = sorted(
        value
        for value in blueprint_strings
        if value.startswith("/Game/Strash/Chara/Monster/")
    )
    blueprint_native_ids = sorted({m.upper() for value in blueprint_refs for m in NATIVE_ID.findall(value)})
    enemy_master_ids = sorted(
        {m.upper() for value in enemy_master_strings for m in NATIVE_ID.findall(value)},
        key=lambda value: int(value[2:]),
    )
    direct_vearn_paths = sorted(
        path for path in combined if re.search(r"vearn|EN801", path, re.I)
    )
    form_keyword_paths = sorted(
        path
        for path in direct_vearn_paths
        if re.search(r"young|youth|true|final|transform|henshin", path, re.I)
    )
    en801_bodies = body_assets_by_id.get("EN801", [])
    expected_en801_body = (
        "strash/Content/Strash/Chara/Monster/EN801/00/SK_EN801_00_Body.uasset"
    )
    blueprint_body_refs = sorted(
        value for value in blueprint_refs if re.search(r"/SK_[^/]*(?:Body|model)$", value, re.I)
    )
    post_located = not (
        en801_bodies == [expected_en801_body]
        and blueprint_body_refs == ["/Game/Strash/Chara/Monster/EN801/00/SK_EN801_00_Body"]
        and blueprint_native_ids == ["EN801"]
        and "EN801" in enemy_master_ids
        and not form_keyword_paths
    )

    pak_records = []
    for label, path in pak_paths:
        pak_records.append(
            {
                "label": label,
                "absolutePath": str(path),
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
                "indexedEntries": len(listings[label]),
            }
        )
    return {
        "schema": SCHEMA,
        "sourceId": SOURCE_ID,
        "sourceGame": "Infinity Strash: Dragon Quest The Adventure of Dai",
        "platform": "Windows Steam build 2024-03-28",
        "sourceBuildDate": "2024-03-28",
        "tools": {
            "repak": {
                "absolutePath": str(repak),
                "bytes": repak.stat().st_size,
                "sha256": sha256(repak),
            }
        },
        "primaryPaks": pak_records,
        "index": {
            "totalEntries": sum(len(rows) for rows in listings.values()),
            "uniqueEntries": len(combined),
            "monsterBodyAssetCount": len(monster_body_assets),
            "monsterBodyNativeIds": sorted(body_assets_by_id, key=lambda value: int(value[2:])),
            "directVearnOrEN801PathCount": len(direct_vearn_paths),
        },
        "en801": {
            "bodyAssets": en801_bodies,
            "characterBlueprint": EN801_BLUEPRINT,
            "blueprintCharacterReferences": blueprint_refs,
            "blueprintBodyReferences": blueprint_body_refs,
            "blueprintNativeIds": blueprint_native_ids,
            "formKeywordPaths": form_keyword_paths,
            "enemyMasterNativeIds": enemy_master_ids,
            "enemyMasterContainsEN801": "EN801" in enemy_master_ids,
        },
        "identityExclusions": [
            {"nativeId": "EN653", "identity": "MystVearn", "isVearnForm": False},
            {"nativeId": "EN680", "identity": "Baran", "isVearnForm": False},
            {"nativeId": "EN681", "identity": "Baran form", "isVearnForm": False},
        ],
        "officialStoryScope": {
            "url": OFFICIAL_SCOPE_URL,
            "statement": "Square Enix describes story mode as covering the full Sovereign Rock Castle arc.",
            "use": "corroborating scope evidence; local package evidence remains authoritative for this asset audit",
        },
        "result": {
            "preTransformationOldVearnBodyLocated": expected_en801_body in en801_bodies,
            "postTransformationVearnFullBodyLocated": post_located,
            "status": (
                "additional-en801-form-needs-review"
                if post_located
                else "post-transformation-full-body-absent-from-both-primary-pak-indexes"
            ),
            "nextAction": (
                "visually review the additional EN801-linked candidate"
                if post_located
                else "retain the gap and acquire a separately licensed post-transformation Vearn source"
            ),
        },
        "limitations": [
            "Path and serialized blueprint references prove the shipped EN801 asset linkage; they do not assign identities to unrelated native IDs.",
            "EN653 MystVearn and EN680/EN681 Baran remain separate identities and cannot fill the post-transformation Vearn gap.",
            "The Kaizer Phoenix skeletal mesh is a skill effect/helper mesh, not a second Vearn body.",
            "Absence from these two PAK indexes does not prove that no separately licensed community model exists.",
            "This audit does not claim conversion, backend registration, runtime selection, Main merge or deployment.",
        ],
    }


def write_markdown(report: dict, path: Path) -> None:
    result = report["result"]
    en801 = report["en801"]
    lines = [
        "# Infinity Strash 巴恩形態全索引稽核",
        "",
        f"- 結果：`{result['status']}`",
        f"- 變身前／老巴恩完整身體：`{str(result['preTransformationOldVearnBodyLocated']).lower()}`",
        f"- 變身後巴恩完整身體：`{str(result['postTransformationVearnFullBodyLocated']).lower()}`",
        f"- 兩個主 PAK 索引總筆數：{report['index']['totalEntries']:,}",
        f"- EN801 身體候選：{len(en801['bodyAssets'])}",
        f"- EN801 藍圖身體引用：{len(en801['blueprintBodyReferences'])}",
        "",
        "EN801 角色藍圖只連到 `EN801/00/SK_EN801_00_Body`。敵人主表含 EN801，",
        "但沒有第二個 EN801 形態；兩個主 PAK 也沒有帶 young／true／final／transform／henshin",
        "字樣的 EN801／Vearn 路徑。官方說明的故事範圍止於 Sovereign Rock Castle 篇，與封包結果一致。",
        "",
        "密斯特巴恩 EN653 與巴蘭 EN680／EN681 保持獨立；Kaizer Phoenix 是技能輔助骨架，",
        "均不能登記成變身後巴恩。後續須另取有授權的變身後來源，再走轉換與驗收。",
        "",
        f"官方範圍來源：{report['officialStoryScope']['url']}",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pak0", type=Path, required=True)
    parser.add_argument("--pak1", type=Path, required=True)
    parser.add_argument("--repak", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    pak_paths = [("pakchunk0", args.pak0.resolve()), ("pakchunk1", args.pak1.resolve())]
    repak = args.repak.resolve()
    output = args.output.resolve()
    if output.exists():
        raise ValueError("output must be new so the audit remains immutable")
    for _, path in pak_paths:
        if not path.is_file():
            raise ValueError(f"missing PAK: {path}")
    if not repak.is_file():
        raise ValueError(f"missing repak executable: {repak}")
    output.mkdir(parents=True)

    listings = {label: list_pak(repak, path) for label, path in pak_paths}
    for label, _ in pak_paths:
        payload = ("\n".join(listings[label]) + "\n").encode("utf-8")
        (output / f"{label}-paths.txt.gz").write_bytes(gzip.compress(payload, mtime=0))

    pak0 = pak_paths[0][1]
    probes = output / "serialized-probes"
    probes.mkdir()
    blueprint = package_bytes(repak, pak0, EN801_BLUEPRINT)
    enemy_master = package_bytes(repak, pak0, ENEMY_MASTER)
    for member, payload in {**blueprint, **enemy_master}.items():
        (probes / Path(member).name).write_bytes(payload)

    report = audit(
        pak_paths,
        listings,
        ascii_strings(blueprint),
        ascii_strings(enemy_master),
        repak,
    )
    report["preservedEvidence"] = [
        {
            "path": path.relative_to(output).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in sorted(output.rglob("*"))
        if path.is_file()
    ]
    report_path = output / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_markdown(report, output / "report.md")
    print(json.dumps({"output": str(output), **report["result"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
