#!/usr/bin/env python3
"""Shared helpers for the bounded JUMP FORCE full-roster workflow."""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import re
from pathlib import Path, PurePosixPath
from typing import Iterable


AS_OF_DATE = "2026-09-15"
SOURCE_ID = "steam-jump-force-priority-original-assets-build-8523149"
ASSET_CLASSES = ("model", "texture", "skeleton", "motion", "vfx", "audio", "metadata")
TOKEN_RE = re.compile(r"^chr\d{4}$", re.IGNORECASE)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_member_path(value: str) -> str:
    normalized = value.replace("\\", "/").strip()
    path = PurePosixPath(normalized)
    if not normalized or normalized.startswith("/") or ".." in path.parts or "\0" in normalized:
        raise ValueError(f"unsafe PAK member path: {value!r}")
    return str(path)


def package_stem(path: str) -> str:
    value = safe_member_path(path)
    suffix = PurePosixPath(value).suffix.casefold()
    if suffix in {".uasset", ".uexp", ".ubulk", ".uptnl"}:
        return value[: -len(suffix)]
    return value


def character_matches(path: str, token: str, source_kind: str) -> bool:
    if not TOKEN_RE.fullmatch(token):
        raise ValueError(f"invalid native character token: {token}")
    lowered = path.casefold()
    token = token.casefold()
    if token in lowered:
        return True
    digits = token[3:]
    # The game also uses a bare numeric namespace for character-specific VFX
    # and skill configuration.  Do not accept the same four digits elsewhere:
    # e.g. 0000/1000 are also map IDs and voice event suffixes.
    if source_kind == "vfx-package":
        return bool(re.search(
            rf"/effects/(?:avater/(?:editedgrayscale/)?|equipment/){re.escape(digits)}/",
            lowered,
        ))
    if source_kind == "skill-config-package":
        return bool(re.search(rf"/game/skill_{re.escape(digits)}_", lowered))
    return False


def classify_uasset(path: str, source_kind: str) -> str | None:
    lower = path.casefold()
    if not lower.endswith(".uasset"):
        return None
    name = PurePosixPath(lower).stem
    if source_kind == "audio-package" or "/sound/" in lower:
        return "audio"
    if source_kind == "vfx-package" or "/effects/" in lower:
        return "vfx"
    if "/textures/" in lower or name.startswith("t_"):
        return "texture"
    if "skeleton" in name:
        return "skeleton"
    if (
        source_kind == "animation-package"
        or "animbp" in name
        or name.endswith("_anim")
        or "_anim_" in name
        or "/animation/" in lower
        or "/animations/" in lower
        or "/motion/" in lower
    ):
        return "motion"
    if source_kind == "skill-config-package":
        return "vfx"
    if source_kind == "character-config-package":
        return "metadata"
    if source_kind == "character-package" and not any(part in lower for part in ("/materials/", "/textures/")):
        return "model"
    return None


def load_json(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl_gz(path: Path, rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as stream:
                for row in rows:
                    stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")


def read_jsonl_gz(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]
