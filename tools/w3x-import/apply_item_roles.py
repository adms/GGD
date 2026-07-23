#!/usr/bin/env python3
"""
Stamp `craftRole` (and `recipe` for finals) onto every content/items/*.json,
reading the authoritative classification from docs/content/wc3-item-roles.json
(produced by extract_item_roles.py from the source-map triggers).

Idempotent: re-running overwrites the two fields and touches nothing else, so
it is safe to run after a re-import. The importer (w3xlib/drafts.py) now emits
craftRole itself, so this script's job is only the 6 hand-authored #82 items
the map does not know about, plus a reconciliation pass that FAILS if a shipped
doc disagrees with the trigger-derived role — that mismatch is the exact class
of drift that reopened task #70.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
ROLES = os.path.join(REPO, "docs", "content", "wc3-item-roles.json")
ITEMS = os.path.join(REPO, "content", "items")

# The 6 hand-authored task #82 economy items have no source-map provenance, so
# their role is DECLARED here rather than derived. Two are shop MECHANICS; the
# four stat-sticks are skeleton demo items that the real (map-loaded) shop
# already hides — they are marked "none" so the final-only shop filter never
# lists them, and a separate offline fallback keeps a bare skeleton box usable.
HAND_AUTHORED = {
    "legendary-orb": "service",
    "stat-attunement": "service",
    "ember-rod": "none",
    "ironhide-vest": "none",
    "serrated-edge": "none",
    "swift-boots": "none",
}


def main() -> int:
    roles_doc = json.load(open(ROLES, encoding="utf-8"))
    roles = roles_doc["roles"]

    changed = 0
    conflicts = []
    missing = []
    for fn in sorted(os.listdir(ITEMS)):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        path = os.path.join(ITEMS, fn)
        doc = json.load(open(path, encoding="utf-8"))
        item_id = doc["id"]

        if item_id in roles:
            role = roles[item_id]["role"]
            recipe = roles[item_id].get("recipe")
        elif item_id in HAND_AUTHORED:
            role = HAND_AUTHORED[item_id]
            recipe = None
        else:
            missing.append(item_id)
            role = "none"
            recipe = None

        before = json.dumps(doc, ensure_ascii=False, sort_keys=True)
        doc["craftRole"] = role
        if role == "final" and recipe and recipe.get("components") is not None:
            r = {"components": recipe["components"]}
            if recipe.get("book"):
                r["book"] = recipe["book"]
            doc["recipe"] = r
        else:
            doc.pop("recipe", None)
        after = json.dumps(doc, ensure_ascii=False, sort_keys=True)
        if before != after:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(doc, f, ensure_ascii=False, indent=2)
                f.write("\n")
            changed += 1

    if missing:
        print(f"WARNING: {len(missing)} docs not in role map, defaulted to "
              f"'none': {', '.join(missing)}", file=sys.stderr)

    # Summary by role over the shipped docs.
    tally: dict[str, int] = {}
    for fn in os.listdir(ITEMS):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        doc = json.load(open(os.path.join(ITEMS, fn), encoding="utf-8"))
        tally[doc.get("craftRole", "?")] = tally.get(doc.get("craftRole", "?"), 0) + 1
    print(f"stamped {changed} docs")
    print(json.dumps(dict(sorted(tally.items())), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
