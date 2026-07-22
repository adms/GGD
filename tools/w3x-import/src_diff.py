#!/usr/bin/env python3
"""src_diff.py — diff the SOURCE-map extraction against the old PROTECTED-map
extraction, and inventory the newly-named assets.

Compares the flattened raw file sets:
  OLD  out/GoDieEX22s/raw/         (protected map, 104 blocks never named)
  NEW  out/GoDieEX22s-src/raw/     (source map, intact 467-entry listfile)

Matching is by case-insensitive flattened name (MPQ names are case-insensitive;
on-disk case can differ because the old extractor recovered extensions like
'.BLP' from object data while the listfile uses '.blp').

Emits:
  out/GoDieEX22s-src/FILEDIFF.md
  out/GoDieEX22s-src/INVENTORY.md
  out/GoDieEX22s-src/file_diff.json
"""

from __future__ import annotations

import hashlib
import json
import os

SELF = os.path.dirname(os.path.abspath(__file__))
OLD_RAW = os.path.join(SELF, "out", "GoDieEX22s", "raw")
NEW_RAW = os.path.join(SELF, "out", "GoDieEX22s-src", "raw")
OUT_DIR = os.path.join(SELF, "out", "GoDieEX22s-src")
CONTENT = "/Users/Takuro/GGD/content"


def sha(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def index(raw_dir: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for name in os.listdir(raw_dir):
        p = os.path.join(raw_dir, name)
        if not os.path.isfile(p):
            continue
        out[name.lower()] = {
            "name": name,
            "size": os.path.getsize(p),
            "sha256": sha(p),
        }
    return out


def main() -> None:
    old = index(OLD_RAW)
    new = index(NEW_RAW)

    old_keys = set(old)
    new_keys = set(new)

    only_new = sorted(new_keys - old_keys)
    only_old = sorted(old_keys - new_keys)
    common = sorted(new_keys & old_keys)

    diff_bytes = []
    for k in common:
        if old[k]["sha256"] != new[k]["sha256"]:
            diff_bytes.append(k)

    # --- classify newly-named assets by type ---
    def ext(k: str) -> str:
        base = k.rsplit("__", 1)[-1]
        return base.rsplit(".", 1)[-1].lower() if "." in base else "(none)"

    by_type: dict[str, list[str]] = {}
    for k in only_new:
        by_type.setdefault(ext(k), []).append(new[k]["name"])

    # --- which newly-named assets does content/ NOT reference? ---
    # Models are referenced by stem in content json/md/ts, so a content-blob
    # check is meaningful for .mdx.  Icons/textures are NOT referenced by their
    # BLP filename in content (the icon pipeline keys them by champion via
    # ICON_MAP.json), so for BLP we instead compare against the prior
    # ICON_MAP.json — anything not in it is a genuinely-new, unmapped asset.
    content_blob = ""
    content_names: set[str] = set()
    for root, _dirs, files in os.walk(CONTENT):
        for fn in files:
            content_names.add(fn.lower())
            if fn.rsplit(".", 1)[-1].lower() in (
                "json", "md", "ts", "js", "txt", "yaml", "yml",
            ):
                try:
                    with open(os.path.join(root, fn), "r",
                              errors="replace") as f:
                        content_blob += f.read().lower() + "\n"
                except Exception:  # noqa: BLE001
                    pass

    icon_map_blob = ""
    icon_map_path = os.path.join(SELF, "out", "GoDieEX22s", "ICON_MAP.json")
    if os.path.exists(icon_map_path):
        with open(icon_map_path, "r", errors="replace") as f:
            icon_map_blob = f.read().lower()

    def stem(name: str) -> str:
        base = name.rsplit("__", 1)[-1]
        return base.rsplit(".", 1)[0].lower()

    unused_models = []      # .mdx not referenced anywhere in content/
    unused_icons = []       # BTN/DIS/PAS icons not in prior ICON_MAP
    unused_tex = []         # other .blp textures not referenced in content/
    for k in only_new:
        e = ext(k)
        st = stem(new[k]["name"])
        if e == "mdx":
            used = (st in content_blob) or any(st in cn for cn in content_names)
            if not used:
                unused_models.append(new[k]["name"])
        elif e == "blp":
            is_icon = ("commandbuttons" in k or "passivebuttons" in k
                       or "btn" in k or "__dis" in k)
            if is_icon:
                if st not in icon_map_blob:
                    unused_icons.append(new[k]["name"])
            else:
                used = (st in content_blob
                        or any(st in cn for cn in content_names))
                if not used:
                    unused_tex.append(new[k]["name"])

    result = {
        "old_raw_count": len(old),
        "new_raw_count": len(new),
        "only_in_source": [new[k]["name"] for k in only_new],
        "only_in_protected": [old[k]["name"] for k in only_old],
        "same_name_diff_bytes": [
            {
                "name": new[k]["name"],
                "old_size": old[k]["size"],
                "new_size": new[k]["size"],
                "old_sha256": old[k]["sha256"][:16],
                "new_sha256": new[k]["sha256"][:16],
            }
            for k in diff_bytes
        ],
        "new_by_type": {t: sorted(v) for t, v in sorted(by_type.items())},
        "unused_in_content": {
            "mdx_models": sorted(unused_models),
            "icons": sorted(unused_icons),
            "textures": sorted(unused_tex),
        },
    }

    with open(os.path.join(OUT_DIR, "file_diff.json"), "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # ---- FILEDIFF.md ----
    md = []
    md.append("# FILEDIFF — source map vs protected-map extraction\n")
    md.append(f"- OLD (protected) raw files: **{len(old)}**")
    md.append(f"- NEW (source) raw files: **{len(new)}**")
    md.append(f"- only-in-source: **{len(only_new)}**")
    md.append(f"- only-in-protected: **{len(only_old)}**")
    md.append(f"- same-name / different-bytes: **{len(diff_bytes)}**\n")

    md.append("## Only in SOURCE (newly named / previously unnamed)\n")
    md.append("These are files the protected-map run could not name (the 104 "
              "unnamed blocks) or that simply were not present. Grouped by "
              "type.\n")
    for t, v in sorted(by_type.items()):
        md.append(f"### .{t}  ({len(v)})")
        for n in sorted(v):
            md.append(f"- {n}")
        md.append("")

    md.append("## Only in PROTECTED (present in old run, absent from source)\n")
    if only_old:
        for k in only_old:
            md.append(f"- {old[k]['name']}  ({old[k]['size']} B)")
    else:
        md.append("_none_")
    md.append("")

    md.append("## Same name, DIFFERENT bytes\n")
    if diff_bytes:
        md.append("| file | old bytes | new bytes | old sha | new sha |")
        md.append("|---|---|---|---|---|")
        for k in diff_bytes:
            o, n = old[k], new[k]
            md.append(
                f"| {n['name']} | {o['size']} | {n['size']} | "
                f"`{o['sha256'][:12]}` | `{n['sha256'][:12]}` |"
            )
    else:
        md.append("_none_")
    md.append("")

    with open(os.path.join(OUT_DIR, "FILEDIFF.md"), "w") as f:
        f.write("\n".join(md) + "\n")

    # ---- INVENTORY.md ----
    inv = []
    inv.append("# INVENTORY — newly-named assets & content-usage flags\n")
    total_new_assets = sum(
        len(v) for t, v in by_type.items() if t in ("mdx", "blp", "mp3", "tga")
    )
    inv.append(f"Newly-named renderable/audio assets only-in-source: "
               f"**{total_new_assets}**\n")
    inv.append("| type | count |")
    inv.append("|---|---|")
    for t in ("mdx", "blp", "mp3", "tga"):
        inv.append(f"| .{t} | {len(by_type.get(t, []))} |")
    inv.append("")

    inv.append("## Newly-named MDX models NOT referenced by content/\n")
    inv.append("Candidate hero/effect models the protected run skipped "
               "(unnamed) and that content/ does not yet use.\n")
    if unused_models:
        for n in sorted(unused_models):
            inv.append(f"- {n}")
    else:
        inv.append("_none — every new .mdx is already referenced_")
    inv.append("")

    inv.append("## Newly-named icons NOT in prior ICON_MAP.json\n")
    inv.append("CommandButtons / PassiveButtons / disabled (DIS*) icons that "
               "the protected run never named and that the prior icon pipeline "
               "therefore never mapped.\n")
    if unused_icons:
        for n in sorted(unused_icons):
            inv.append(f"- {n}")
    else:
        inv.append("_none_")
    inv.append("")

    inv.append("## Newly-named other textures NOT referenced by content/\n")
    if unused_tex:
        for n in sorted(unused_tex):
            inv.append(f"- {n}")
    else:
        inv.append("_none_")
    inv.append("")

    with open(os.path.join(OUT_DIR, "INVENTORY.md"), "w") as f:
        f.write("\n".join(inv) + "\n")

    print(f"OLD={len(old)} NEW={len(new)} only_new={len(only_new)} "
          f"only_old={len(only_old)} diff_bytes={len(diff_bytes)}")
    print(f"new_by_type: " + ", ".join(
        f"{t}={len(v)}" for t, v in sorted(by_type.items())))
    print(f"unused: mdx={len(unused_models)} icons={len(unused_icons)} "
          f"tex={len(unused_tex)}")


if __name__ == "__main__":
    main()
