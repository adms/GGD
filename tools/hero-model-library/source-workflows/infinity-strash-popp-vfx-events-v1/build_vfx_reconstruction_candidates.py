#!/usr/bin/env python3
"""Build candidate-only Popp VFX reconstruction graphs and static previews."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import pathlib
import struct
from collections import Counter, deque
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageOps


SCHEMA = "ggd.infinity-strash-popp-vfx-reconstruction-candidates@1"
UNKNOWN_NIAGARA_FIELDS = [
    "emitter execution order and enable conditions",
    "system delay, duration, loop count and warm-up time",
    "spawn rate and burst count per emitter",
    "particle lifetime distribution",
    "initial position, velocity, acceleration and drag",
    "local-space/world-space and attachment socket behavior",
    "scale, rotation, color and opacity curves over lifetime",
    "sprite, ribbon, mesh and light renderer binding per emitter",
    "material dynamic parameters and per-emitter overrides",
    "SubUV frame order and playback rate",
    "collision, event receivers and event-trigger timing",
    "renderer sorting, blend order and system bounds",
]


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_ref(path: pathlib.Path, relative_to: pathlib.Path | None = None) -> dict[str, Any]:
    path = path.resolve()
    item: dict[str, Any] = {"absolutePath": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
    if relative_to:
        item["path"] = path.relative_to(relative_to.resolve()).as_posix()
    return item


def load(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def family(reference: str) -> dict[str, str]:
    name = reference.rsplit("/", 1)[-1].lower()
    if "hyadaruko" in name:
        return {"family": "ice", "phase": "core" if "core" in name else "hit"}
    if "raidein" in name:
        return {"family": "lightning", "phase": "charge"}
    if "mera" in name:
        phase = next((part for part in ("firetrail", "landing", "muzzle", "core") if part in name), "unknown")
        return {"family": "fire", "phase": phase}
    if "io" in name:
        return {"family": "explosion", "phase": "projectile" if "bullet" in name else "impact"}
    if "pn030" in name:
        return {"family": "character-special-unknown", "phase": "landing" if "landing" in name else "muzzle"}
    return {"family": "unknown", "phase": "unknown"}


def category(reference: str) -> str:
    if "/Staticmesh/" in reference:
        return "staticMesh"
    if "/Material/" in reference or "/Functions/" in reference or "MaterialFunctions" in reference:
        return "material"
    if "/Texture/" in reference or reference.rsplit("/", 1)[-1].startswith("T_"):
        return "texture"
    if "/NPS/" in reference:
        return "niagara"
    return "support"


def reachable(root: str, packages: dict[str, dict[str, Any]]) -> tuple[list[str], dict[str, int]]:
    distances = {root: 0}
    queue = deque([root])
    while queue:
        current = queue.popleft()
        for dependency in packages.get(current, {}).get("dependencies", []):
            if dependency not in distances:
                distances[dependency] = distances[current] + 1
                queue.append(dependency)
    return sorted(distances, key=lambda ref: (distances[ref], ref)), distances


def read_glb(path: pathlib.Path) -> tuple[dict[str, Any], bytes]:
    raw = path.read_bytes()
    magic, version, declared = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF" or version != 2 or declared != len(raw):
        raise RuntimeError(f"invalid GLB: {path}")
    offset = 12
    document = None
    binary = b""
    while offset < len(raw):
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        payload = raw[offset : offset + length]
        offset += length
        if kind == 0x4E4F534A:
            document = json.loads(payload.decode("utf-8").rstrip(" \x00"))
        elif kind == 0x004E4942:
            binary = payload
    if document is None:
        raise RuntimeError(f"GLB has no JSON: {path}")
    return document, binary


def accessor_values(document: dict[str, Any], binary: bytes, index: int) -> list[Any]:
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    component = accessor["componentType"]
    kinds = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
    if component not in kinds:
        raise RuntimeError(f"unsupported preview component type: {component}")
    code, size = kinds[component]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
    stride = int(view.get("byteStride", width * size))
    fmt = "<" + code * width
    values = []
    for row in range(int(accessor["count"])):
        value = struct.unpack_from(fmt, binary, start + row * stride)
        values.append(value[0] if width == 1 else value)
    return values


def wireframe(path: pathlib.Path, size: tuple[int, int] = (330, 210)) -> Image.Image:
    document, binary = read_glb(path)
    triangles: list[tuple[tuple[float, float, float], tuple[float, float, float], tuple[float, float, float]]] = []
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            position_index = primitive.get("attributes", {}).get("POSITION")
            index_index = primitive.get("indices")
            if not isinstance(position_index, int):
                continue
            positions = accessor_values(document, binary, position_index)
            indices = accessor_values(document, binary, index_index) if isinstance(index_index, int) else list(range(len(positions)))
            for offset in range(0, len(indices) - 2, 3):
                ids = [int(indices[offset + part]) for part in range(3)]
                if all(0 <= item < len(positions) for item in ids):
                    triangles.append(tuple(positions[item] for item in ids))
    canvas = Image.new("RGB", size, "#101822")
    draw = ImageDraw.Draw(canvas)
    if not triangles:
        return canvas
    points = [point for triangle in triangles for point in triangle]
    ranges = [max(point[axis] for point in points) - min(point[axis] for point in points) for axis in range(3)]
    axes = sorted(range(3), key=lambda axis: ranges[axis], reverse=True)[:2]
    projected = [(point[axes[0]], point[axes[1]]) for point in points]
    min_x, max_x = min(p[0] for p in projected), max(p[0] for p in projected)
    min_y, max_y = min(p[1] for p in projected), max(p[1] for p in projected)
    scale = min((size[0] - 24) / max(max_x - min_x, 1e-8), (size[1] - 24) / max(max_y - min_y, 1e-8))
    def project(point: tuple[float, float, float]) -> tuple[float, float]:
        x = 12 + (point[axes[0]] - min_x) * scale
        y = size[1] - 12 - (point[axes[1]] - min_y) * scale
        return x, y
    step = max(1, math.ceil(len(triangles) / 3500))
    for triangle in triangles[::step]:
        pts = [project(point) for point in triangle]
        draw.line([pts[0], pts[1], pts[2], pts[0]], fill="#54d6ff", width=1)
    return canvas


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "Arial Bold.ttf" if bold else "Arial Unicode.ttf"
    return ImageFont.truetype(f"/System/Library/Fonts/Supplemental/{name}", size)


def fit_image(path: pathlib.Path, size: tuple[int, int]) -> Image.Image:
    with Image.open(path) as image:
        image.load()
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")
        if image.mode == "RGBA":
            base = Image.new("RGBA", image.size, "#18212d")
            base.alpha_composite(image)
            image = base.convert("RGB")
        return ImageOps.contain(image.convert("RGB"), size)


def draw_card(recipe: dict[str, Any], catalog_root: pathlib.Path, evidence_root: pathlib.Path) -> Image.Image:
    width, height = 1200, 700
    card = Image.new("RGB", (width, height), "#0d1118")
    draw = ImageDraw.Draw(card)
    draw.rectangle((0, 0, width - 1, height - 1), outline="#344455", width=2)
    draw.text((30, 24), recipe["rootName"], font=font(34, True), fill="#f2f6fb")
    draw.text((30, 70), recipe["rootReference"], font=font(17), fill="#9eb0c4")
    status = f"CANDIDATE ONLY   {recipe['inference']['family']} / {recipe['inference']['phase']}   timing unknown   no skill binding"
    draw.rounded_rectangle((30, 108, 1170, 150), radius=12, fill="#3a2730")
    draw.text((48, 118), status, font=font(18, True), fill="#ffc4b5")
    counts = recipe["counts"]
    draw.text((30, 174), f"materials {counts['materials']}   textures {counts['uniqueTextureAssets']}   meshes {counts['convertedMeshes']}   emitters {counts['knownEmitterCount']}", font=font(19), fill="#b5e3cf")

    texture_x = 30
    for index, asset in enumerate(recipe["previewTextureAssets"][:6]):
        x = texture_x + index * 185
        box = (x, 222, x + 160, 382)
        try:
            image = fit_image(catalog_root / asset["representativePath"], (160, 160))
            px = x + (160 - image.width) // 2
            py = 222 + (160 - image.height) // 2
            card.paste(image, (px, py))
        except Exception:
            draw.rectangle(box, fill="#263241")
            draw.text((x + 10, 280), "preview unavailable", font=font(13), fill="#9aa9b8")
        draw.rectangle(box, outline="#52687e", width=1)
        label = pathlib.Path(asset["representativePath"]).stem[:21]
        draw.text((x, 390), label, font=font(13), fill="#d6dee8")
        draw.text((x, 410), asset["semanticGroup"], font=font(12), fill="#8ba1b6")

    mesh_items = recipe["convertedMeshes"][:3]
    if mesh_items:
        for index, item in enumerate(mesh_items):
            x = 30 + index * 380
            try:
                preview = wireframe(pathlib.Path(item["absolutePath"]), (350, 185))
                card.paste(preview, (x, 465))
            except Exception:
                draw.rectangle((x, 465, x + 350, 650), fill="#101822")
            draw.rectangle((x, 465, x + 350, 650), outline="#3a566c", width=1)
            draw.text((x, 656), pathlib.Path(item["path"]).stem[:37], font=font(13), fill="#cfe9f2")
    else:
        draw.text((30, 510), "No converted StaticMesh in this root closure; sprite/material candidate only.", font=font(20), fill="#d2a467")
    return card


def make_html(data: dict[str, Any], preview_name: str) -> str:
    blocks = []
    for recipe in data["recipes"]:
        materials = "".join(f"<li><code>{html.escape(item)}</code></li>" for item in recipe["directMaterials"])
        meshes = "".join(
            f"<li><code>{html.escape(item['reference'])}</code> &rarr; <code>{html.escape(item['path'])}</code></li>"
            for item in recipe["convertedMeshes"]
        ) or "<li>此根關係中沒有已轉換 StaticMesh</li>"
        unknown = "".join(f"<li>{html.escape(item)}</li>" for item in recipe["unknownNiagaraFields"])
        blocks.append(f"""
<details class="recipe"><summary><b>{html.escape(recipe['rootName'])}</b> <span>{html.escape(recipe['inference']['family'])}/{html.escape(recipe['inference']['phase'])}</span></summary>
<img src="{html.escape(recipe['previewPath'])}" alt="{html.escape(recipe['rootName'])} static candidate preview">
<p><code>{html.escape(recipe['rootReference'])}</code></p>
<p>已知 export table：{recipe['counts']['knownEmitterCount']} emitters、{recipe['counts']['knownMeshRendererCount']} mesh renderers、{recipe['counts']['knownSpriteRendererCount']} sprite renderers、{recipe['counts']['knownLightRendererCount']} light renderers。</p>
<p>關係閉包：{recipe['counts']['materials']} materials、{recipe['counts']['uniqueTextureAssets']} unique texture assets、{recipe['counts']['convertedMeshes']} converted meshes。</p>
<h3>直接材質候選</h3><ul>{materials}</ul>
<h3>已轉換 mesh 候選</h3><ul>{meshes}</ul>
<h3>仍缺 Niagara 時序與行為參數</h3><ul>{unknown}</ul>
</details>""")
    return f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>波普 VFX 重建候選審查</title><style>
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0a0e14;color:#e8edf4;margin:0;padding:28px}}main{{max-width:1280px;margin:auto}}.notice{{background:#3a2730;border:1px solid #a85a5f;padding:16px;border-radius:12px}}.hero{{width:100%;height:auto;border:1px solid #344455;border-radius:12px;margin:18px 0}}details{{background:#111822;border:1px solid #304153;border-radius:12px;margin:14px 0;padding:16px}}summary{{cursor:pointer;font-size:20px}}summary span{{color:#92b8cf;margin-left:12px}}details img{{width:100%;height:auto;margin:16px 0;border-radius:8px}}code{{color:#a9dcff;word-break:break-all}}li{{margin:5px 0}}h1{{margin-bottom:8px}}.stats{{color:#b5e3cf}}
</style></head><body><main><h1>波普 VFX 重建候選配方</h1><p class="notice"><b>候選資料，尚未綁定。</b> 這些頁面只呈現來源關係、已轉換支援素材與靜態組合線索。沒有 Niagara emitter 時序、動態參數或可接受的實際播放，所以不能標成完整特效或已上架。</p><p class="stats">14 個 Niagara system roots；另有 2 個 curve 與 1 個 material parameter collection 支援根。87 個 unique image assets、33 個 StaticMesh GLB 都保留來源關係。</p><img class="hero" src="{html.escape(preview_name)}" alt="all candidate previews">{''.join(blocks)}</main></body></html>"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipt", type=pathlib.Path, required=True)
    parser.add_argument("--closure", type=pathlib.Path, required=True)
    parser.add_argument("--catalog", type=pathlib.Path, required=True)
    parser.add_argument("--meshes", type=pathlib.Path, required=True)
    parser.add_argument("--output-json", type=pathlib.Path, required=True)
    parser.add_argument("--output-html", type=pathlib.Path, required=True)
    parser.add_argument("--preview-dir", type=pathlib.Path, required=True)
    parser.add_argument("--contact-sheet", type=pathlib.Path, required=True)
    args = parser.parse_args()
    inputs = {name: path.resolve() for name, path in (("receipt", args.receipt), ("closure", args.closure), ("catalog", args.catalog), ("meshes", args.meshes))}
    receipt, closure, catalog, mesh_manifest = (load(inputs[name]) for name in ("receipt", "closure", "catalog", "meshes"))
    packages = {row["reference"]: row for row in closure["packages"]}
    mesh_by_reference = {row["reference"]: row for row in mesh_manifest["rows"]}
    catalog_root = pathlib.Path(catalog["exportRoot"])
    recipes = []
    for root_index, root in enumerate(item for item in receipt["vfx"] if item["kind"] == "niagara-system"):
        refs, distances = reachable(root["reference"], packages)
        ref_set = set(refs)
        direct = packages[root["reference"]]["dependencies"]
        materials = [ref for ref in refs if category(ref) == "material"]
        meshes = []
        for ref in refs:
            row = mesh_by_reference.get(ref)
            if not row or row["status"] != "converted-staticmesh-support":
                continue
            for glb in row["glb"]:
                meshes.append({"reference": ref, "distance": distances[ref], **glb})
        assets = []
        for asset in catalog["uniqueAssets"]:
            linked = sorted(ref_set.intersection(asset["packageReferences"]))
            if not linked:
                continue
            direct_link = sorted(set(direct).intersection(asset["packageReferences"]))
            assets.append({
                "assetId": asset["assetId"], "sha256": asset["sha256"], "bytes": asset["bytes"],
                "semanticGroup": asset["semanticGroup"], "representativePath": asset["representativePath"],
                "inspection": asset["inspection"], "linkedPackageReferences": linked,
                "directPackageReferences": direct_link,
            })
        assets.sort(key=lambda item: (not bool(item["directPackageReferences"]), item["semanticGroup"] == "Utility", item["semanticGroup"] == "HDR", -float(item["inspection"].get("lumaStdDev") or 0), item["representativePath"]))
        structure = root["structuralAnalysis"]["exportClassCounts"]
        recipe = {
            "candidateId": f"popp-vfx-candidate-{root_index + 1:02d}",
            "rootReference": root["reference"],
            "rootName": root["reference"].rsplit("/", 1)[-1],
            "rootPackageState": root["directPackageState"],
            "inference": {**family(root["reference"]), "basis": "root path/name token only; not a skill binding"},
            "knownStructuralAnalysis": root["structuralAnalysis"],
            "directDependencies": direct,
            "directMaterials": [ref for ref in direct if category(ref) == "material"],
            "directStaticMeshes": [ref for ref in direct if category(ref) == "staticMesh"],
            "reachableReferences": refs,
            "materials": materials,
            "materialRelations": [
                {"material": ref, "distance": distances[ref], "dependencies": packages.get(ref, {}).get("dependencies", [])}
                for ref in materials
            ],
            "convertedMeshes": sorted(meshes, key=lambda item: (item["distance"], item["reference"])),
            "uniqueTextureAssets": assets,
            "previewTextureAssets": [item for item in assets if pathlib.Path(item["representativePath"]).suffix.lower() != ".hdr"][:6],
            "counts": {
                "reachableReferences": len(refs), "materials": len(materials), "uniqueTextureAssets": len(assets),
                "convertedMeshes": len(meshes), "knownEmitterCount": structure.get("NiagaraEmitter", 0),
                "knownMeshRendererCount": structure.get("NiagaraMeshRendererProperties", 0),
                "knownSpriteRendererCount": structure.get("NiagaraSpriteRendererProperties", 0),
                "knownLightRendererCount": structure.get("NiagaraLightRendererProperties", 0),
            },
            "unknownNiagaraFields": UNKNOWN_NIAGARA_FIELDS,
            "states": {"candidateRelationshipsBuilt": True, "staticPreviewBuilt": True, "niagaraTimingRecovered": False, "ggdVfxBuilt": False, "skillBound": False, "visuallyAccepted": False, "runtimeSelectable": False, "deployed": False},
        }
        recipes.append(recipe)
    supports = [
        {"reference": item["reference"], "kind": item["kind"], "packageState": item["directPackageState"], "structuralAnalysis": item["structuralAnalysis"]}
        for item in receipt["vfx"] if item["kind"] != "niagara-system"
    ]
    data = {
        "schema": SCHEMA,
        "heroId": receipt["heroId"],
        "sourceId": "steam-infinity-strash-popp-vfx-reconstruction-candidates-local-20240328",
        "inputs": {name: file_ref(path) for name, path in inputs.items()},
        "summary": {
            "rootReferences": len(receipt["vfx"]), "niagaraSystemCandidates": len(recipes), "supportRoots": len(supports),
            "catalogUniqueImageAssets": catalog["summary"]["uniqueByteAssets"], "catalogImageOccurrences": catalog["summary"]["fileOccurrencesInspected"],
            "convertedStaticMeshAssets": mesh_manifest["summary"]["glbFiles"], "candidateRecipes": len(recipes),
            "niagaraSystemsConverted": 0, "ggdVfxBuilt": 0, "skillBindingsCreated": 0,
        },
        "supportRoots": supports,
        "recipes": recipes,
        "claim": "This artifact records candidate source relationships and static previews only. It does not recover Niagara timing, create GGD VFX, prove visual equivalence, bind skills, expose runtime choices, or prove deployment.",
    }
    args.preview_dir.mkdir(parents=True, exist_ok=False)
    card_paths = []
    for recipe in recipes:
        card_path = args.preview_dir / f"{recipe['candidateId']}.png"
        draw_card(recipe, catalog_root, args.output_json.parent).save(card_path, optimize=True)
        recipe["previewPath"] = card_path.relative_to(args.output_html.parent).as_posix()
        recipe["preview"] = file_ref(card_path, args.output_json.parent)
        card_paths.append(card_path)
    columns = 2
    thumb_size = (600, 350)
    rows = math.ceil(len(card_paths) / columns)
    sheet = Image.new("RGB", (columns * thumb_size[0], rows * thumb_size[1]), "#080c12")
    for index, path in enumerate(card_paths):
        with Image.open(path) as image:
            sheet.paste(image.resize(thumb_size, Image.Resampling.LANCZOS), ((index % columns) * thumb_size[0], (index // columns) * thumb_size[1]))
    sheet.save(args.contact_sheet, optimize=True)
    data["staticEvidence"] = {"contactSheet": file_ref(args.contact_sheet, args.output_json.parent), "recipePreviews": [recipe["preview"] for recipe in recipes]}
    data["generator"] = file_ref(pathlib.Path(__file__))
    args.output_json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.output_html.write_text(make_html(data, args.contact_sheet.relative_to(args.output_html.parent).as_posix()), encoding="utf-8")
    print(json.dumps({"json": str(args.output_json.resolve()), "html": str(args.output_html.resolve()), **data["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
