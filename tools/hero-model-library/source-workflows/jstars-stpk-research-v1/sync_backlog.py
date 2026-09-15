#!/usr/bin/env python3
"""Add the four split J-Stars native model-source members to the fixed backlog input."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


IDENTITIES = [
    ("000", "luffy", "蒙其·D·魯夫", "Monkey D. Luffy", ["魯夫", "路飛", "モンキー・D・ルフィ"], ["godie-u00n", "godie-u00o"]),
    ("013", "toriko", "阿虜", "Toriko", ["特瑞科", "トリコ"], []),
    ("014", "zebra", "澤布拉", "Zebra", ["傑布拉", "ゼブラ"], []),
    ("018", "killua", "奇犽·揍敵客", "Killua Zoldyck", ["奇犽", "キルア＝ゾルディック"], ["community-review-24-20260907"]),
]
SOURCE_ID = "zenhax-jstars-pak-stpk-comparison-v1"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ref(path: Path) -> dict:
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[4])
    parser.add_argument("--workspace", required=True, type=Path)
    args = parser.parse_args()
    repo, workspace = args.repo.resolve(), args.workspace.resolve()
    base = repo / "materials/hero-model-library/design-backlog"
    supplemental_path, locale_path = base / "sources-supplemental.json", base / "localization-zh-TW.json"
    supplemental, locale = json.loads(supplemental_path.read_text()), json.loads(locale_path.read_text())
    conversion = workspace / "GGD-Asset-Library/conversions/jstars-stpk-research-v1"
    rows = []
    for native_id, slug, name_zh, english, aliases, hero_ids in IDENTITIES:
        mesh = next(p for p in sorted((conversion / slug / "i").iterdir()) if p.suffix == ".srdi")
        texture = next(p for p in sorted((conversion / slug / "v").iterdir()) if p.suffix == ".srdv")
        descriptor = next(p for p in sorted((conversion / slug / "m").iterdir()) if p.suffix == ".srd" and "shader" not in p.name and "texture" not in p.name)
        identity_id = "native:jstars-" + native_id
        candidate = {
            "id": f"{SOURCE_ID}:{native_id}.srdi", "library": "original-game-research-sample",
            **ref(mesh), "format": "srdi", "readiness": "native-container-member-split-pending-geometry-and-texture-decoding",
            "existsLocal": True, "resourceRole": "character-body-mesh-source",
            "sourceClass": "original-game-direct-extraction-research-sample",
            "sourceId": SOURCE_ID, "sourceUrl": "https://zenhax.com/viewtopic.php@t=13160.html",
            "nativeCharacterId": native_id, "isStandaloneModelCandidate": False,
            "textureCompanion": ref(texture), "descriptorCompanion": ref(descriptor),
            "identityConfidence": "archive-directory-and-internal-member-name-not-visually-confirmed",
        }
        rows.append({
            "id": identity_id, "name": english, "work": "J-Stars Victory VS+",
            "sourceIds": [SOURCE_ID], "aliases": [name_zh, english, *aliases],
            "modelCandidates": [candidate], "identityHeroIds": hero_ids,
            "designStatus": "designed" if hero_ids else "not-defined",
            "acquisitionNote": "PS3 public research sample STPK member safely split and hashed; still requires geometry/texture decoding and visual identity review.",
            "limitations": ["not a standardized GLB", "texture remains SRDV", "skeleton and skin not verified", "no native motion/VFX/audio extraction", "not registered as a backend option"],
        })
        locale.setdefault("names", {})[identity_id] = {"zhTW": name_zh, "basis": "source internal name and established Traditional Chinese character name"}
    locale.setdefault("works", {})["J-Stars Victory VS+"] = {"zhTW": "J-STARS 勝利對決+", "basis": "official game title transliteration"}
    existing = {row["id"]: row for row in supplemental["characters"]}
    for row in rows:
        prior = existing.get(row["id"])
        if prior is not None and prior != row:
            raise ValueError("existing backlog row differs: " + row["id"])
        if prior is None:
            supplemental["characters"].append(row)
    supplemental_path.write_text(json.dumps(supplemental, ensure_ascii=False, indent=2) + "\n")
    locale_path.write_text(json.dumps(locale, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sourceId": SOURCE_ID, "characters": len(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
