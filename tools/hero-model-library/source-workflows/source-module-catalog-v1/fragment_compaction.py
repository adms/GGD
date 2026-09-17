"""Lossless compact representation for source-module catalog fragments.

The tracked fragments keep every candidate identity and module count, but move
repeated source-level cells into defaults and repeated prose into a note table.
``expand_fragment`` restores the original v1 shape for existing consumers.
"""

from __future__ import annotations

import copy
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


COMPACT_SCHEMA = "ggd.source-module-catalog-fragment@2"
EXPANDED_SCHEMA = "ggd.source-module-catalog-fragment@1"
MODULE_FIELDS = (
    "container", "payload", "model", "texture", "skeleton", "motion",
    "vfx", "sfx", "voice", "registration", "deployment",
)
BACKUP_PREFIX = "../GGD-Asset-Library/conversions/pr1284-preparation-final-v1/payload"
GIT_MANIFEST = "materials/hero-model-library/pr1284-preparation-s3.json"


def _key(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _mode(values: list[Any]) -> tuple[Any, int]:
    key, count = Counter(_key(value) for value in values).most_common(1)[0]
    return json.loads(key), count


def full_audit_reference(repo_relative_path: str, expanded_bytes: bytes) -> dict[str, Any]:
    return {
        "status": "local-preserved-s3-readback-pending",
        "bytes": len(expanded_bytes),
        "sha256": hashlib.sha256(expanded_bytes).hexdigest(),
        "localPath": f"{BACKUP_PREFIX}/{repo_relative_path}",
        "gitManifest": GIT_MANIFEST,
        "archiveMember": repo_relative_path,
        "archiveStatus": "pending-manifest-publication-and-readback",
        "restoreRequiredForCatalogBuild": False,
    }


def compact_fragment(
    fragment: dict[str, Any],
    *,
    repo_relative_path: str,
    expanded_bytes: bytes,
) -> dict[str, Any]:
    """Return a readable, lossless v2 fragment with source-level defaults."""
    result = copy.deepcopy(fragment)
    if result.get("schema") != EXPANDED_SCHEMA:
        raise ValueError(f"cannot compact schema {result.get('schema')!r}")
    result["schema"] = COMPACT_SCHEMA
    result["expandedSchema"] = EXPANDED_SCHEMA
    result["fullAudit"] = full_audit_reference(repo_relative_path, expanded_bytes)

    for group in result.get("sourceGroups", []):
        candidates = group.get("candidates", [])
        notes: list[str] = []
        note_ids: dict[str, str] = {}
        for row in candidates:
            for module_name in MODULE_FIELDS:
                cell = row.get(module_name)
                if not isinstance(cell, dict) or cell.get("note") is None:
                    continue
                note = str(cell.pop("note"))
                if note not in note_ids:
                    note_ids[note] = f"n{len(notes) + 1}"
                    notes.append(note)
                cell["noteRef"] = note_ids[note]
        if notes:
            group["notes"] = {f"n{index + 1}": note for index, note in enumerate(notes)}

        module_defaults: dict[str, dict[str, Any]] = {}
        for module_name in MODULE_FIELDS:
            cells = [row[module_name] for row in candidates if isinstance(row.get(module_name), dict)]
            if len(cells) < 2:
                continue
            default: dict[str, Any] = {}
            for field in ("stage", "count", "noteRef", "sourcePoolCount"):
                values = [cell[field] for cell in cells if field in cell]
                if len(values) < 2:
                    continue
                value, occurrences = _mode(values)
                if occurrences >= 2:
                    default[field] = value
            if not default:
                continue
            module_defaults[module_name] = default
            for row in candidates:
                cell = row.get(module_name)
                if not isinstance(cell, dict):
                    continue
                override = {
                    key: value
                    for key, value in cell.items()
                    if key not in default or default[key] != value
                }
                if override:
                    row[module_name] = override
                else:
                    row.pop(module_name)
        if module_defaults:
            group["moduleDefaults"] = module_defaults

        candidate_defaults: dict[str, Any] = {}
        for field in ("work", "evidence"):
            values = [row[field] for row in candidates if field in row]
            if len(values) < 2:
                continue
            value, occurrences = _mode(values)
            if occurrences < 2:
                continue
            candidate_defaults[field] = value
            for row in candidates:
                if row.get(field) == value:
                    row.pop(field)
        if candidate_defaults:
            group["candidateDefaults"] = candidate_defaults
    return result


def expand_fragment(fragment: dict[str, Any]) -> dict[str, Any]:
    """Expand v2 defaults/note references into the legacy v1 consumer shape."""
    if fragment.get("schema") == EXPANDED_SCHEMA:
        return copy.deepcopy(fragment)
    if fragment.get("schema") != COMPACT_SCHEMA:
        raise ValueError(f"unsupported fragment schema: {fragment.get('schema')!r}")
    result = copy.deepcopy(fragment)
    result["schema"] = str(result.pop("expandedSchema", EXPANDED_SCHEMA))
    result.pop("fullAudit", None)
    for group in result.get("sourceGroups", []):
        notes = group.pop("notes", {})
        module_defaults = group.pop("moduleDefaults", {})
        candidate_defaults = group.pop("candidateDefaults", {})
        for row in group.get("candidates", []):
            for field, value in candidate_defaults.items():
                row.setdefault(field, copy.deepcopy(value))
            for module_name in MODULE_FIELDS:
                default = module_defaults.get(module_name, {})
                override = row.get(module_name, {})
                if default or override:
                    cell = copy.deepcopy(default)
                    cell.update(copy.deepcopy(override))
                    note_ref = cell.pop("noteRef", None)
                    cell["note"] = notes.get(note_ref) if note_ref is not None else None
                    row[module_name] = cell
    return result


def expanded_json_bytes(fragment: dict[str, Any]) -> bytes:
    return (json.dumps(fragment, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
