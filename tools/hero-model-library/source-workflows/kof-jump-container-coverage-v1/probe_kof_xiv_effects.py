#!/usr/bin/env python3
"""Build reproducible KOF XIV EFF -> texture/mesh/curve evidence and review UI.

The proprietary binary formats are not treated as decoded.  This probe only
accepts exact NUL-terminated ASCII references whose basename exists beside the
EFF file.  Material, blend, timing and attachment values remain pending unless
the binary itself exposes an unambiguous label.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import importlib.util
import json
import re
import struct
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


CHARACTERS = {
    "MAI": {"nameZh": "不知火舞", "heroIds": ["community-review-03-20260907"]},
    "IOR": {"nameZh": "八神庵", "heroIds": ["community-review-02-20260907"]},
    "KYO": {"nameZh": "草薙京", "heroIds": []},
}
SOURCE_ID = "steam-kofxiv-priority-mai-ior-kyo-build-local-v126"
BACKUP_ID = "kof-xiv-priority-vfx-textures-20260914-v1-backup"
BACKUP_RECEIPT_GIT_PATH = "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1/s3-backup-receipt.json"
ASCII_RUN = re.compile(rb"[ -~]{3,}")
MEANINGFUL_LABEL = re.compile(
    r"(?:fire|smoke|grain|light|glare|spark|locus|shockwave|distortion|blur|paper|"
    r"bone|impact|ring|shell|core|claw|aura|flash|shadow|particle|explosion|born|"
    r"fraction|screw|elbow|skin|model)", re.I
)
ATTACHMENT_HINT = re.compile(r"(?:hand|finger|elbow|eye|head|foot|leg|arm)", re.I)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ascii_runs(data: bytes) -> list[tuple[int, str]]:
    rows: list[tuple[int, str]] = []
    for match in ASCII_RUN.finditer(data):
        value = match.group().decode("ascii", "strict").strip(" \0")
        if value:
            rows.append((match.start(), value))
    return rows


def file_record(path: Path, kind: str, offsets: Iterable[int]) -> dict[str, object]:
    return {
        "kind": kind,
        "basename": path.stem,
        "extension": path.suffix.lower(),
        "sourceAbsolutePath": str(path.resolve()),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "occurrenceOffsets": list(offsets),
    }


def png_metrics(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        return {"width": image.width, "height": image.height, "mode": image.mode}


def load_vfx_safety_gate(repo: Path):
    path = repo / "tools/vfx-asset-safety/check.py"
    spec = importlib.util.spec_from_file_location("ggd_vfx_asset_safety", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load VFX safety authority: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def blend_carrier_audit(path: Path, gate) -> dict[str, object]:
    with Image.open(path) as source:
        width, height, pixels = gate.rgba_pixels(source)
    rows = {}
    for blend in ("additive", "alpha", "modulate"):
        neutral, edge = gate.neutral_shares(width, height, pixels, blend, [[1, 1, 1, 1]])
        rows[blend] = {
            "neutralShare": round(neutral, 8),
            "edgeNeutralShare": round(edge, 8),
            "safeCarrier": neutral >= gate.MIN_NEUTRAL_SHARE and edge >= gate.MIN_NEUTRAL_EDGE_SHARE,
        }
    return {
        "authorityGitPath": "tools/vfx-asset-safety/check.py",
        "whiteTintCompatibilityOnly": True,
        "doesNotIdentifyNativeBlendMode": True,
        "thresholds": {
            "minNeutralShare": gate.MIN_NEUTRAL_SHARE,
            "minNeutralEdgeShare": gate.MIN_NEUTRAL_EDGE_SHARE,
        },
        "modes": rows,
        "compatibleModes": [name for name, row in rows.items() if row["safeCarrier"]],
    }


def make_contact_sheet(rows: list[dict[str, object]], output: Path) -> None:
    columns, thumb, label_h, gap = 5, 144, 46, 12
    cell_w, cell_h = thumb + gap * 2, thumb + label_h + gap * 2
    line_count = (len(rows) + columns - 1) // columns
    canvas = Image.new("RGBA", (columns * cell_w, line_count * cell_h), (20, 23, 29, 255))
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    for index, row in enumerate(rows):
        col, line = index % columns, index // columns
        x, y = col * cell_w + gap, line * cell_h + gap
        # Alpha must remain visible during review, so composite over a checker.
        checker = Image.new("RGBA", (thumb, thumb), (42, 45, 53, 255))
        cd = ImageDraw.Draw(checker)
        for yy in range(0, thumb, 12):
            for xx in range(0, thumb, 12):
                if ((xx // 12) + (yy // 12)) % 2:
                    cd.rectangle((xx, yy, xx + 11, yy + 11), fill=(69, 73, 83, 255))
        with Image.open(str(row["outputAbsolutePath"])) as source:
            image = source.convert("RGBA")
            image.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
            px = x + (thumb - image.width) // 2
            py = y + (thumb - image.height) // 2
            checker.alpha_composite(image, (px - x, py - y))
        canvas.alpha_composite(checker, (x, y))
        label = Path(str(row["outputAbsolutePath"])).name
        chunks = [label[i:i + 22] for i in range(0, len(label), 22)][:2]
        draw.multiline_text((x, y + thumb + 5), "\n".join(chunks), fill=(235, 238, 244, 255), font=font, spacing=2)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, "PNG", optimize=False, compress_level=9)


def render_html(payload: dict[str, object], sheet_dir: str) -> str:
    characters = payload["characters"]
    sections = []
    for native_id in CHARACTERS:
        entry = characters[native_id]
        cards = []
        for group in entry["effectGroups"]:
            texture_refs = [ref for ref in group["references"] if ref["kind"] == "converted-effect-texture"]
            texture_names = [ref["basename"] for ref in texture_refs]
            texture_modes = [f'{ref["basename"]}: {"/".join(ref["convertedPng"]["blendCarrierAudit"]["compatibleModes"]) or "無安全模式"}' for ref in texture_refs]
            dependencies = [ref["basename"] + ref["extension"] for ref in group["references"] if ref["kind"] != "converted-effect-texture"]
            labels = [label["value"] for label in group["componentLabels"]]
            cards.append(
                '<article class="card">'
                f'<h3>{html.escape(group["nativeEffectFile"])} <code>{html.escape(group["candidateId"])}</code></h3>'
                f'<p><b>可攜紋理：</b>{html.escape(", ".join(texture_names) or "無")}</p>'
                f'<p><b>GGD 白色 tint 載體相容：</b>{html.escape("；".join(texture_modes) or "無")}</p>'
                f'<p><b>OBAC/ONC/既有 PNG：</b>{html.escape(", ".join(dependencies) or "無")}</p>'
                f'<p><b>二進位內可讀標籤：</b>{html.escape(", ".join(labels) or "無")}</p>'
                f'<p><b>混合／時序／掛點：</b>{html.escape(group["runtimeBlocker"])}</p>'
                '</article>'
            )
        sections.append(
            f'<section><h2>{html.escape(entry["characterNameZh"])} / {native_id}</h2>'
            f'<p>{entry["effectGroupCount"]} 組 EFF；{entry["groupsWithConvertedTexture"]} 組直接引用已轉換 DDS；'
            f'{entry["uniqueConvertedTexturesReferenced"]} 張已轉換紋理被引用。</p>'
            f'<img class="sheet" src="{sheet_dir}/{native_id}.png" alt="{native_id} texture contact sheet">'
            f'<div class="grid">{"".join(cards)}</div></section>'
        )
    summary = payload["summary"]
    return """<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>KOF XIV EFF 映射審查</title>
<style>body{margin:0;background:#11141a;color:#edf0f6;font:14px/1.5 system-ui,sans-serif}header,section{padding:18px 24px}header{background:#1b202a;position:sticky;top:0;z-index:2}h1,h2,h3{margin:.2em 0 .5em}p{margin:.35em 0}.warn{color:#ffd38a}.sheet{display:block;max-width:100%%;border:1px solid #495264;background:#20242c}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:14px}.card{background:#1a1f28;border:1px solid #343d4d;border-radius:8px;padding:12px;overflow-wrap:anywhere}.card code{font-size:11px;color:#91ccff}</style></head><body>
<header><h1>KOF XIV MAI／IOR／KYO EFF 映射審查</h1>
<p>精確 ASCII 交叉參照：%d 組來源 EFF，%d 組直接引用已轉換特效紋理，%d／55 張紋理獲 EFF 直接引用。</p>
<p class="warn">本頁不代表技能綁定或上架。專有格式尚未完整解碼，混合模式、秒制時序與骨架掛點仍待原生 reader 或人工驗收。</p></header>%s</body></html>""" % (
        summary["sourceNativeEffectGroups"], summary["groupsWithConvertedTexture"],
        summary["convertedTexturesDirectlyReferenced"], "".join(sections)
    )


def build(repo: Path, workspace: Path, write: bool) -> dict[str, object]:
    source_root = workspace / "GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-priority-mai-ior-kyo-v1/extracted/Chara"
    conversion_manifest_path = workspace / "GGD-Asset-Library/conversions/kof-xiv-priority-vfx-textures-20260914-v1/manifest.json"
    conversion = json.loads(conversion_manifest_path.read_text(encoding="utf-8"))
    public_files = json.loads((repo / "materials/hero-model-library/public-source-files.json").read_text(encoding="utf-8"))
    backup_rows = [row for row in public_files["sources"] if row.get("id") == BACKUP_ID]
    if len(backup_rows) != 1:
        raise ValueError("missing unique KOF XIV VFX conversion backup")
    backup = backup_rows[0]
    if not all(backup.get(key) is True for key in ("fullReadbackVerified", "s3ReadbackVerified", "localPreserved")):
        raise ValueError("KOF XIV VFX conversion backup is not fully read-back verified")
    backup_receipt = repo / BACKUP_RECEIPT_GIT_PATH
    if not backup_receipt.is_file() or sha256(backup_receipt) != backup["receiptSha256"]:
        raise ValueError("Git copy of KOF XIV VFX backup receipt is missing or changed")
    backup_members = {row["path"]: row for row in backup["files"]}
    for row in conversion["files"]:
        member = Path(row["outputAbsolutePath"]).resolve().relative_to(conversion_manifest_path.parent.resolve()).as_posix()
        pinned = backup_members.get(member)
        if pinned is None or (pinned["bytes"], pinned["sha256"]) != (row["outputBytes"], row["outputSha256"]):
            raise ValueError(f"verified KOF XIV VFX backup does not cover {member}")
    gate = load_vfx_safety_gate(repo)
    carrier_audits = {
        row["outputAbsolutePath"]: blend_carrier_audit(Path(row["outputAbsolutePath"]), gate)
        for row in conversion["files"]
    }
    converted_by_character = {
        native_id: {Path(row["sourceAbsolutePath"]).stem.lower(): row for row in conversion["files"] if row["nativeCharacterId"] == native_id}
        for native_id in CHARACTERS
    }
    characters: dict[str, object] = {}
    all_groups: list[dict[str, object]] = []
    all_referenced_converted: set[tuple[str, str]] = set()
    for native_id, identity in CHARACTERS.items():
        effect_dir = source_root / native_id / "Effect"
        files_by_stem: dict[str, list[Path]] = defaultdict(list)
        for path in effect_dir.iterdir():
            if path.is_file():
                files_by_stem[path.stem.lower()].append(path)
        groups = []
        for eff in sorted(effect_dir.glob("*.eff")):
            data = eff.read_bytes()
            if not data.startswith(b"#EFF"):
                raise ValueError(f"unexpected EFF magic: {eff}")
            occurrences: dict[Path, list[int]] = defaultdict(list)
            labels = []
            for offset, value in ascii_runs(data):
                matches = files_by_stem.get(value.lower(), [])
                if matches:
                    for match in matches:
                        if match != eff:
                            occurrences[match].append(offset)
                elif value != "#EFF" and MEANINGFUL_LABEL.search(value) and re.fullmatch(r"[A-Za-z0-9_ -]{3,48}", value):
                    labels.append({"offset": offset, "value": value})
            references = []
            mapped_texture_names = set()
            for path in sorted(occurrences, key=lambda item: (item.suffix, item.name.lower())):
                kind = {".dds": "effect-texture-source", ".png": "native-png-dependency", ".obac": "mesh-or-particle-object", ".onc": "curve-container"}.get(path.suffix.lower(), "other-dependency")
                record = file_record(path, kind, occurrences[path])
                converted = converted_by_character[native_id].get(path.stem.lower()) if path.suffix.lower() == ".dds" else None
                if converted:
                    record["kind"] = "converted-effect-texture"
                    record["convertedPng"] = {
                        "absolutePath": converted["outputAbsolutePath"],
                        "bytes": converted["outputBytes"],
                        "sha256": converted["outputSha256"],
                        "format": converted["outputFormat"],
                        "blendCarrierAudit": carrier_audits[converted["outputAbsolutePath"]],
                    }
                    mapped_texture_names.add(path.stem.lower())
                    all_referenced_converted.add((native_id, path.stem.lower()))
                references.append(record)
            hint_values = [eff.stem] + [ref["basename"] for ref in references] + [row["value"] for row in labels]
            attachment_hints = sorted({value for value in hint_values if ATTACHMENT_HINT.search(value)})
            blend_hints = []
            for row in labels:
                value = row["value"].lower()
                if value.endswith("_add") or "model_add" in value:
                    blend_hints.append({"value": row["value"], "hint": "additive", "confidence": "name-only-unverified"})
                elif value.endswith("_tra"):
                    blend_hints.append({"value": row["value"], "hint": "transparent-or-alpha", "confidence": "name-only-unverified"})
            runtime_blocker = "EFF/OBAC/ONC reader 尚未證明 blend、秒制 lifetime、發射器與骨架掛點；不可產生 vfx@1。"
            group = {
                "candidateId": f"kofxiv-{native_id.lower()}-{eff.stem.lower().replace('_', '-')}",
                "nativeCharacterId": native_id,
                "characterNameZh": identity["nameZh"],
                "heroIds": identity["heroIds"],
                "nativeEffectFile": eff.name,
                "effectSource": file_record(eff, "native-effect-group", [0]),
                "componentLabels": labels,
                "references": references,
                "mappedConvertedTextureCount": len(mapped_texture_names),
                "materialEvidence": {"state": "texture-references-mapped; material parameters pending"},
                "blendEvidence": {"state": "pending", "nameOnlyHints": blend_hints},
                "timingEvidence": {"state": "pending-proprietary-eff-decoder"},
                "attachmentEvidence": {"state": "pending", "nameOnlyHints": attachment_hints},
                "sourceNativeGroupCandidate": True,
                "ggdRuntimeVfxCandidate": False,
                "skillBindingCreated": False,
                "runtimeBlocker": runtime_blocker,
            }
            groups.append(group)
            all_groups.append(group)
        referenced = {(native_id, Path(ref["sourceAbsolutePath"]).stem.lower()) for group in groups for ref in group["references"] if ref["kind"] == "converted-effect-texture"}
        available = set((native_id, stem) for stem in converted_by_character[native_id])
        characters[native_id] = {
            "characterNameZh": identity["nameZh"],
            "heroIds": identity["heroIds"],
            "effectGroupCount": len(groups),
            "groupsWithConvertedTexture": sum(group["mappedConvertedTextureCount"] > 0 for group in groups),
            "uniqueConvertedTexturesReferenced": len(referenced),
            "convertedTexturesWithoutDirectEffReference": sorted(stem for _, stem in available - referenced),
            "effectGroups": groups,
        }
    converted_all = {(row["nativeCharacterId"], Path(row["sourceAbsolutePath"]).stem.lower()) for row in conversion["files"]}
    all_effect_files = [
        path for native_id in CHARACTERS
        for path in (source_root / native_id / "Effect").iterdir() if path.is_file()
    ]
    mapped_source_paths = {
        group["effectSource"]["sourceAbsolutePath"] for group in all_groups
    } | {
        ref["sourceAbsolutePath"] for group in all_groups for ref in group["references"]
    } | {
        row["sourceAbsolutePath"] for row in conversion["files"]
    }
    source_format_counts = dict(sorted(Counter(path.suffix.lower() for path in all_effect_files).items()))
    carrier_mode_counts = {
        blend: sum(audit["modes"][blend]["safeCarrier"] for audit in carrier_audits.values())
        for blend in ("additive", "alpha", "modulate")
    }
    result = {
        "schema": "ggd.kof-xiv-eff-reference-mapping@1",
        "sourceId": SOURCE_ID,
        "sourceGame": "THE KING OF FIGHTERS XIV",
        "platform": "Windows (Steam)",
        "probeMethod": "Exact printable ASCII basename intersection against files in each acquired Effect directory; no guessed binary fields.",
        "sourceRoot": str(source_root.resolve()),
        "textureConversionManifest": {
            "absolutePath": str(conversion_manifest_path.resolve()),
            "sha256": sha256(conversion_manifest_path),
            "convertedPngFiles": len(conversion["files"]),
        },
        "textureConversionBackup": {
            "id": BACKUP_ID,
            "s3Uri": backup["s3Uri"],
            "manifestUri": backup["manifestUri"],
            "archiveBytes": backup["bytes"],
            "archiveSha256": backup["sha256"],
            "fileCount": backup["fileCount"],
            "fullGetVerified": True,
            "allMemberSha256Verified": True,
            "localUnchanged": True,
            "receiptGitPath": BACKUP_RECEIPT_GIT_PATH,
            "receiptSha256": backup["receiptSha256"],
            "s3Use": "backup-only-not-runtime-entry",
        },
        "summary": {
            "characters": len(characters),
            "acquiredEffectDirectoryFiles": len(all_effect_files),
            "sourceFormatCounts": source_format_counts,
            "sourceFilesCoveredBySha256Evidence": len(mapped_source_paths),
            "allEffectDirectoryFilesSha256Covered": len(mapped_source_paths) == len(all_effect_files),
            "sourceNativeEffectGroups": len(all_groups),
            "groupsWithAnyExactDependencyReference": sum(bool(group["references"]) for group in all_groups),
            "groupsWithConvertedTexture": sum(group["mappedConvertedTextureCount"] > 0 for group in all_groups),
            "convertedTexturesDirectlyReferenced": len(all_referenced_converted),
            "convertedTexturesWithoutDirectEffReference": len(converted_all - all_referenced_converted),
            "blendCarrierCompatibleTextureCounts": carrier_mode_counts,
            "texturesWithNoSafeWhiteTintCarrierMode": sum(not audit["compatibleModes"] for audit in carrier_audits.values()),
            "exactReferenceOccurrences": sum(len(ref["occurrenceOffsets"]) for group in all_groups for ref in group["references"]),
            "uniqueReferencedSourceFiles": len({ref["sourceAbsolutePath"] for group in all_groups for ref in group["references"]}),
            "sourceNativeGroupCandidates": len(all_groups),
            "ggdRuntimeVfxCandidates": 0,
            "skillBindingsCreated": 0,
            "productionDeploymentVerified": False,
        },
        "policy": {
            "binaryFormatsFullyDecoded": False,
            "materialBlendTimingAttachmentValidated": False,
            "blendCarrierCompatibilityUsesCurrentGateAuthority": "tools/vfx-asset-safety/check.py",
            "automaticSkillBindingAllowed": False,
            "sourceNativeGroupCandidateDoesNotMeanRuntimeReady": True,
        },
        "characters": characters,
        "blockers": [
            "No authoritative EFF/OBAC/ONC format reader is present.",
            "Exact texture/object/curve references do not prove blend equations, durations, emitter parameters or bone attachments.",
            "A vfx@1 document would require invented values, so runtime VFX generation remains fail-closed.",
            "The 55 decoded PNGs require owner visual review before any skill binding.",
        ],
    }
    out_dir = repo / "materials/hero-model-library/source-inventories/kof-jump-container-coverage-v1"
    mapping_path = out_dir / "effect-mapping.json"
    review_path = out_dir / "effect-review.html"
    sheet_dir = out_dir / "effect-contact-sheets"
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    rendered = render_html(result, "effect-contact-sheets")
    if write:
        out_dir.mkdir(parents=True, exist_ok=True)
        mapping_path.write_text(encoded, encoding="utf-8")
        review_path.write_text(rendered, encoding="utf-8")
        for native_id in CHARACTERS:
            rows = [row for row in conversion["files"] if row["nativeCharacterId"] == native_id]
            make_contact_sheet(rows, sheet_dir / f"{native_id}.png")
    else:
        if mapping_path.read_text(encoding="utf-8") != encoded:
            raise SystemExit(f"stale generated file: {mapping_path}")
        if review_path.read_text(encoding="utf-8") != rendered:
            raise SystemExit(f"stale generated file: {review_path}")
        for native_id in CHARACTERS:
            rows = [row for row in conversion["files"] if row["nativeCharacterId"] == native_id]
            from tempfile import TemporaryDirectory
            with TemporaryDirectory(prefix="ggd-kofxiv-sheet-") as temp:
                candidate = Path(temp) / f"{native_id}.png"
                make_contact_sheet(rows, candidate)
                actual = sheet_dir / f"{native_id}.png"
                if not actual.is_file() or actual.read_bytes() != candidate.read_bytes():
                    raise SystemExit(f"stale generated file: {actual}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    result = build(args.repo.resolve(), args.workspace.resolve(), args.write)
    print(json.dumps(result["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
