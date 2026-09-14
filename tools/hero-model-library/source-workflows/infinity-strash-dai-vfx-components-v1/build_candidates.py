#!/usr/bin/env python3
"""Export and normalize only verifiable support components for six Dai VFX roots."""

from __future__ import annotations

import argparse
import base64
import collections
import datetime
import hashlib
import html
import io
import json
import math
import shutil
import struct
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps, __version__ as PILLOW_VERSION


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
SOURCE_POINTER = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vearn-av-v1/vfx-source-index.json"
_SOURCE_INPUT = Path(json.loads(SOURCE_POINTER.read_text())["sourceInput"]["absolutePath"])
LIBRARY = next(parent for parent in _SOURCE_INPUT.parents if parent.name == "GGD-Asset-Library")
CLOSURE = LIBRARY / "intake/windows-readonly-20260914/infinity-strash-dai-vfx-components-v1"
CONVERSION = LIBRARY / "conversions/infinity-strash-dai-vfx-components-v1"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vfx-components-v1"
PUBLIC = REPO / "apps/client/public"
TEXTURE_UMODEL = LIBRARY / "tools/UEViewer/specific-infinity-strash-macos-v1-texture-export-fix/umodel"
MESH_UMODEL = LIBRARY / "tools/UEViewer/specific-infinity-strash-macos-v2-staticmesh-export/umodel"
ASSIMP = Path("/usr/local/bin/assimp")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def pin(path: Path, relative_to: Path | None = None) -> dict:
    item = {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}
    if relative_to is not None:
        item["path"] = path.relative_to(relative_to.resolve()).as_posix()
    return item


def verify(item: dict) -> Path:
    portable = REPO / item["path"] if item.get("path") else None
    path = portable if portable is not None and portable.is_file() else Path(item["absolutePath"])
    if not path.is_file() or path.stat().st_size != item["bytes"] or sha256(path) != item["sha256"]:
        raise ValueError(f"byte drift: {path}")
    return path


def glb_metrics(path: Path) -> dict:
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 4)[0] != 2 or struct.unpack_from("<I", raw, 8)[0] != len(raw):
        raise ValueError(f"invalid GLB: {path}")
    chunk_len, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A:
        raise ValueError(f"GLB JSON is not first: {path}")
    doc = json.loads(raw[20 : 20 + chunk_len].decode("utf-8").rstrip(" \x00"))
    accessors = doc.get("accessors", [])
    primitives = [primitive for mesh in doc.get("meshes", []) for primitive in mesh.get("primitives", [])]
    triangles = 0
    vertices = 0
    for primitive in primitives:
        pos = primitive.get("attributes", {}).get("POSITION")
        if isinstance(pos, int):
            vertices += int(accessors[pos].get("count", 0))
        index = primitive.get("indices")
        elements = int(accessors[index].get("count", 0)) if isinstance(index, int) else int(accessors[pos].get("count", 0)) if isinstance(pos, int) else 0
        mode = int(primitive.get("mode", 4))
        triangles += elements // 3 if mode == 4 else max(0, elements - 2) if mode in (5, 6) else 0
    return {
        "triangles": triangles,
        "vertices": vertices,
        "drawPrimitives": len(primitives),
        "materials": len(doc.get("materials", [])),
        "animations": len(doc.get("animations", [])),
        "embeddedImages": len(doc.get("images", [])),
    }


def glb_wireframe(path: Path, size: tuple[int, int] = (220, 150)) -> Image.Image:
    raw = path.read_bytes()
    chunk_len, _ = struct.unpack_from("<II", raw, 12)
    doc = json.loads(raw[20 : 20 + chunk_len].decode("utf-8").rstrip(" \x00"))
    binary_offset = 20 + chunk_len
    while binary_offset % 4:
        binary_offset += 1
    bin_len, bin_type = struct.unpack_from("<II", raw, binary_offset)
    if bin_type != 0x004E4942:
        raise ValueError("GLB has no binary chunk")
    binary = raw[binary_offset + 8 : binary_offset + 8 + bin_len]

    def values(index: int) -> list:
        accessor = doc["accessors"][index]
        view = doc["bufferViews"][accessor["bufferView"]]
        kinds = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
        code, scalar = kinds[accessor["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
        offset = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
        stride = int(view.get("byteStride", width * scalar))
        fmt = "<" + code * width
        rows = []
        for row in range(int(accessor["count"])):
            item = struct.unpack_from(fmt, binary, offset + row * stride)
            rows.append(item[0] if width == 1 else item)
        return rows

    triangles = []
    for mesh in doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            position_index = primitive.get("attributes", {}).get("POSITION")
            if not isinstance(position_index, int):
                continue
            positions = values(position_index)
            index = primitive.get("indices")
            indices = values(index) if isinstance(index, int) else list(range(len(positions)))
            for at in range(0, len(indices) - 2, 3):
                ids = [int(indices[at + part]) for part in range(3)]
                if all(0 <= item < len(positions) for item in ids):
                    triangles.append(tuple(positions[item] for item in ids))
    canvas = Image.new("RGB", size, "#14202a")
    if not triangles:
        return canvas
    points = [point for triangle in triangles for point in triangle]
    spans = [max(point[axis] for point in points) - min(point[axis] for point in points) for axis in range(3)]
    axes = sorted(range(3), key=lambda axis: spans[axis], reverse=True)[:2]
    min_x, max_x = min(point[axes[0]] for point in points), max(point[axes[0]] for point in points)
    min_y, max_y = min(point[axes[1]] for point in points), max(point[axes[1]] for point in points)
    scale = min((size[0] - 20) / max(max_x - min_x, 1e-8), (size[1] - 20) / max(max_y - min_y, 1e-8))
    project = lambda point: (10 + (point[axes[0]] - min_x) * scale, size[1] - 10 - (point[axes[1]] - min_y) * scale)
    draw = ImageDraw.Draw(canvas)
    step = max(1, math.ceil(len(triangles) / 2000))
    for triangle in triangles[::step]:
        polygon = [project(point) for point in triangle]
        draw.line([polygon[0], polygon[1], polygon[2], polygon[0]], fill="#55c9f0", width=1)
    return canvas


def reachable(root: str, packages: dict[str, dict]) -> set[str]:
    seen: set[str] = set()
    queue = [root]
    while queue:
        current = queue.pop()
        if current in seen:
            continue
        seen.add(current)
        queue.extend(packages.get(current, {}).get("structuralAnalysis", {}).get("dependencies", []))
    return seen


def run_umodel(tool: Path, source: Path, output: Path, gltf: bool = False) -> tuple[int, str, list[Path]]:
    output.mkdir(parents=True)
    command = [str(tool), "-game=strash", "-export"]
    if gltf:
        command.append("-gltf")
    command += [f"-out={output}", str(source)]
    process = subprocess.run(command, text=True, capture_output=True, timeout=120)
    log = process.stdout + process.stderr
    (output / "umodel.log").write_text(log)
    return process.returncode, log, sorted(path for path in output.rglob("*") if path.is_file() and path.name != "umodel.log")


def normalize_texture(source: Path, target: Path, max_texture_edge: int) -> dict:
    with Image.open(source) as opened:
        opened.load()
        original = {"width": opened.width, "height": opened.height, "mode": opened.mode, "format": opened.format}
        image = opened.convert("RGBA")
        image.thumbnail((max_texture_edge, max_texture_edge), Image.Resampling.LANCZOS)
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "PNG", optimize=False, compress_level=9)
        return {"source": original, "output": {"width": image.width, "height": image.height, "mode": "RGBA", "format": "PNG"}}


def make_contact_sheet(textures: list[dict], meshes: list[dict]) -> bytes:
    font = ImageFont.load_default()
    cards: list[tuple[str, Image.Image, str]] = []
    for item in textures:
        with Image.open(REPO / item["gitPath"]) as opened:
            canvas = Image.new("RGB", (220, 150), "#202833")
            preview = ImageOps.contain(opened.convert("RGBA"), (210, 140))
            canvas.paste(preview, ((220 - preview.width) // 2, (150 - preview.height) // 2), preview)
        cards.append((item["componentId"], canvas, f"{item['metrics']['output']['width']}x{item['metrics']['output']['height']} PNG"))
    for item in meshes:
        canvas = glb_wireframe(REPO / item["gitPath"])
        cards.append((item["componentId"], canvas, f"{item['metrics']['triangles']} tris / {item['metrics']['drawPrimitives']} draw"))
    columns, width, height = 4, 260, 205
    rows = max(1, math.ceil(len(cards) / columns))
    sheet = Image.new("RGB", (columns * width, 72 + rows * height), "#0b1017")
    draw = ImageDraw.Draw(sheet)
    draw.text((18, 14), "Infinity Strash Dai PN010 - verified VFX support components", fill="white", font=font)
    draw.text((18, 34), "Static component evidence only; Niagara timing, skill binding and runtime remain pending.", fill="#ffbd73", font=font)
    for index, (label, image, metric) in enumerate(cards):
        left, top = (index % columns) * width, 72 + (index // columns) * height
        sheet.paste(image, (left + 20, top + 4))
        draw.text((left + 20, top + 160), label[:34], fill="#e6edf3", font=font)
        draw.text((left + 20, top + 178), metric, fill="#9fb4c8", font=font)
    out = io.BytesIO()
    sheet.save(out, "PNG", optimize=False, compress_level=9)
    return out.getvalue()


def make_html(report: dict) -> str:
    rows = []
    for root in report["roots"]:
        rows.append(
            "<tr>"
            f"<td><code>{html.escape(root['nativePackageStem'])}</code></td>"
            f"<td>{root['metrics']['emitters']}</td><td>{root['metrics']['spriteRenderers']}</td><td>{root['metrics']['meshRenderers']}</td>"
            f"<td>{root['linkedComponents']['textures']}</td><td>{root['linkedComponents']['meshes']}</td>"
            "<td>靜態支援元件候選；時序、曲線語意與技能綁定待確認</td></tr>"
        )
    return f"""<!doctype html><html lang=\"zh-Hant\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>達伊 PN010 特效元件審查</title><style>body{{background:#090e14;color:#e9eef5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:28px}}main{{max-width:1180px;margin:auto}}.warning{{background:#432c25;border:1px solid #b97858;padding:16px;border-radius:12px}}img{{max-width:100%;border:1px solid #33465b;border-radius:10px}}table{{width:100%;border-collapse:collapse;margin-top:20px}}th,td{{padding:10px;border:1px solid #33404e;text-align:left}}th{{background:#182332}}code{{color:#9fd8ff}}</style></head><body><main><h1>達伊 PN010：Infinity Strash 特效支援元件審查</h1><p class=\"warning\"><b>這不是完整特效，也尚未上架。</b> 六個原作 NiagaraSystem 的來源 package、依賴、貼圖與 StaticMesh 已逐檔驗證；目前沒有可信的 Niagara 播放時序、曲線語意、材質動態參數或技能事件映射，因此技能綁定與 runtime 均維持 0。</p><p>本批：{report['summary']['boundedRoots']} 個根、{report['summary']['textureComponents']} 個依現行 vfx-model 貼圖上限轉出的 PNG 元件候選、{report['summary']['meshComponentsConverted']} 個待 live policy check 的 GLB 元件候選。</p><img src=\"infinity-strash-dai-vfx-components.png\" alt=\"靜態元件接觸表\"><table><thead><tr><th>原作根</th><th>Emitter</th><th>Sprite</th><th>Mesh renderer</th><th>貼圖</th><th>Mesh</th><th>狀態</th></tr></thead><tbody>{''.join(rows)}</tbody></table></main></body></html>"""


def build(args: argparse.Namespace) -> dict:
    closure_path = args.closure.resolve() / "source-manifest.json"
    closure = json.loads(closure_path.read_text())
    if closure.get("schema") != "ggd.infinity-strash-dai-vfx-component-closure@1":
        raise ValueError("unexpected closure manifest")
    for item in closure["files"]:
        verify(item)
    if args.conversion.exists() and any(args.conversion.iterdir()):
        raise ValueError(f"refusing to mix with non-empty conversion output: {args.conversion}")
    args.conversion.mkdir(parents=True, exist_ok=True)
    packages = {row["reference"]: row for row in closure["packages"]}
    roots = []
    for row in closure["roots"]:
        reference = "/Game/" + row["sourcePaths"][0].removeprefix("strash/Content/").removesuffix(".uasset")
        analysis = packages[reference]["structuralAnalysis"]
        classes = analysis["exportClassCounts"]
        roots.append({
            "candidateId": row["candidateId"], "nativePackageStem": row["nativePackageStem"], "sourcePaths": row["sourcePaths"],
            "sourceFiles": row["files"], "reference": reference,
            "metrics": {"emitters": classes.get("NiagaraEmitter", 0), "spriteRenderers": classes.get("NiagaraSpriteRendererProperties", 0), "meshRenderers": classes.get("NiagaraMeshRendererProperties", 0)},
            "reachable": reachable(reference, packages),
        })
    texture_rows = []
    mesh_rows = []
    for index, package in enumerate(closure["packages"]):
        classes = package["structuralAnalysis"]["exportClassCounts"]
        source = args.closure / "raw" / f"{package['pakStem']}.uasset"
        tag = f"{index:03d}-{hashlib.sha256(package['reference'].encode()).hexdigest()[:10]}"
        if classes.get("Texture2D", 0):
            code, log, files = run_umodel(args.texture_umodel, source, args.conversion / "texture-export" / tag)
            for emitted in files:
                if emitted.suffix.lower() not in {".tga", ".png"}:
                    continue
                source_pin = pin(emitted, args.conversion)
                temp = args.conversion / "normalized" / f"{hashlib.sha256(emitted.read_bytes()).hexdigest()}.png"
                metrics = normalize_texture(emitted, temp, args.max_texture_edge)
                output_sha = sha256(temp)
                reference = package["reference"]
                name = reference.rsplit("/", 1)[-1].lower()
                classification = "engine-utility" if reference.startswith("/Engine/") else "vfx-utility" if any(token in name for token in ("blank", "black", "c_check")) else "vfx-texture-component"
                eligible = classification == "vfx-texture-component"
                git_path = EVIDENCE / "assets/textures" / f"{output_sha}.png" if eligible else None
                if git_path is not None:
                    git_path.parent.mkdir(parents=True, exist_ok=True)
                    if not git_path.exists():
                        shutil.copy2(temp, git_path)
                texture_rows.append({"reference": reference, "source": source_pin, "componentId": f"dai-vfx-texture-{output_sha[:12]}", "classification": classification, "componentEligible": eligible, "gitPath": git_path.relative_to(REPO).as_posix() if git_path else None, "normalizedLocal": pin(temp, args.conversion), "output": pin(git_path, REPO) if git_path else None, "metrics": metrics, "umodelReturnCode": code, "logSha256": hashlib.sha256(log.encode()).hexdigest()})
        if classes.get("StaticMesh", 0):
            code, log, files = run_umodel(args.mesh_umodel, source, args.conversion / "mesh-export" / tag, gltf=True)
            for emitted in files:
                if emitted.suffix.lower() != ".gltf":
                    continue
                target = args.conversion / "glb" / tag / f"{emitted.stem}.glb"
                target.parent.mkdir(parents=True, exist_ok=True)
                process = subprocess.run([str(args.assimp), "export", str(emitted), str(target), "-f", "glb2"], text=True, capture_output=True, timeout=120)
                if process.returncode != 0 or not target.is_file():
                    continue
                metrics = glb_metrics(target)
                git_path = EVIDENCE / "assets/meshes" / f"{sha256(target)}.glb"
                git_path.parent.mkdir(parents=True, exist_ok=True)
                if not git_path.exists():
                    shutil.copy2(target, git_path)
                mesh_rows.append({"reference": package["reference"], "source": pin(source), "componentId": f"dai-vfx-mesh-{sha256(target)[:12]}", "converted": pin(target, args.conversion), "gitPath": git_path.relative_to(REPO).as_posix(), "metrics": metrics, "policyRole": "vfx-model", "policyCheck": "generated-separately-from-live-gate", "umodelReturnCode": code, "assimpReturnCode": process.returncode, "logSha256": hashlib.sha256((log + process.stdout + process.stderr).encode()).hexdigest()})
    # Collapse duplicate normalized bytes without losing every source relation.
    dedup_textures = {}
    for item in texture_rows:
        key = item["normalizedLocal"]["sha256"]
        if key not in dedup_textures:
            dedup_textures[key] = {**item, "sourceRelations": []}
        dedup_textures[key]["sourceRelations"].append({"reference": item["reference"], "source": item["source"]})
    textures = list(dedup_textures.values())
    candidate_textures = [item for item in textures if item["componentEligible"]]
    passed_meshes = mesh_rows
    for root in roots:
        root["linkedComponents"] = {
            "textureIds": sorted({item["componentId"] for item in candidate_textures if any(rel["reference"] in root["reachable"] for rel in item["sourceRelations"])}),
            "meshIds": sorted({item["componentId"] for item in passed_meshes if item["reference"] in root["reachable"]}),
        }
        root["linkedComponents"]["textures"] = len(root["linkedComponents"]["textureIds"])
        root["linkedComponents"]["meshes"] = len(root["linkedComponents"]["meshIds"])
        del root["reachable"]
    summary = {
        "boundedRoots": len(roots),
        "sourcePackageReferences": closure["summary"]["referencesAcquired"],
        "textureOccurrencesExported": len(texture_rows),
        "textureComponents": len(candidate_textures),
        "textureUtilitiesRetainedLocally": len(textures) - len(candidate_textures),
        "textureComponentsWithinConfiguredEdge": sum(max(item["metrics"]["output"]["width"], item["metrics"]["output"]["height"]) <= args.max_texture_edge for item in candidate_textures),
        "staticMeshPackages": len(mesh_rows),
        "meshComponentsConverted": len(passed_meshes),
        "niagaraSystemsConverted": 0,
        "skillBindingsCreated": 0,
    }
    report = {
        "schema": "ggd.infinity-strash-dai-vfx-component-candidates@1",
        "sourceId": "steam-infinity-strash-dai-vfx-component-candidates-build-local-20240328",
        "character": {"nativeId": "PN010", "heroIds": ["godie-nbbc", "godie-n01c"], "nameZh": "小呆／達伊", "form": "PN010 source family; skill/form binding pending"},
        "inputs": {"closure": pin(closure_path), "textureUmodel": pin(args.texture_umodel), "meshUmodel": pin(args.mesh_umodel), "assimp": pin(args.assimp), "generator": pin(Path(__file__), REPO)},
        "conversionParameters": {"texture": {"format": "PNG RGBA", "maxEdge": args.max_texture_edge, "maxEdgeSource": "live vfx-model gate supplied by build.mts", "resample": "Pillow LANCZOS", "pillowVersion": PILLOW_VERSION}, "mesh": {"source": "patched UModel glTF", "container": "Assimp glb2"}},
        "summary": summary,
        "roots": roots,
        "textureComponents": textures,
        "meshComponents": mesh_rows,
        "states": {"sourceClosureComplete": True, "supportComponentsConverted": True, "niagaraTimingRecovered": False, "ggdVfxBuilt": False, "visualAcceptance": "pending-owner-review-of-static-components", "skillBindingsCreated": 0, "runtimeSelectable": False, "deployed": False},
        "s3": {"rawAndConversionBackup": "pending"},
        "blockers": ["Cooked Niagara emitter execution order, burst/spawn timing, lifetime and curve semantics are not decoded.", "Material dynamic parameters and renderer bindings are not reconstructed.", "The six source-native names identify PN010 skill families but do not prove a GGD ability-slot mapping."],
        "claim": "PNG and GLB rows are byte-pinned support-component candidates only. They are not complete VFX and have no skill/runtime binding.",
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    report_path = EVIDENCE / "candidates.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    sheet = make_contact_sheet(candidate_textures, passed_meshes)
    (EVIDENCE / "contact-sheet.png").write_bytes(sheet)
    (PUBLIC / "infinity-strash-dai-vfx-components.png").write_bytes(sheet)
    (PUBLIC / "infinity-strash-dai-vfx-components.html").write_text(make_html(report))
    receipt = {"schema": "ggd.infinity-strash-dai-vfx-component-candidates-receipt@1", "report": pin(report_path, REPO), "contactSheet": pin(EVIDENCE / "contact-sheet.png", REPO), "publicReview": {"html": pin(PUBLIC / "infinity-strash-dai-vfx-components.html", REPO), "image": pin(PUBLIC / "infinity-strash-dai-vfx-components.png", REPO)}, "summary": summary, "allGitCandidateBytesVerified": True, "states": report["states"]}
    (EVIDENCE / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    return report


def check(args: argparse.Namespace) -> dict:
    report = json.loads((EVIDENCE / "candidates.json").read_text())
    receipt = json.loads((EVIDENCE / "receipt.json").read_text())
    for item in report["inputs"].values(): verify(item)
    for item in report["textureComponents"]:
        verify(item["normalizedLocal"])
        if item["gitPath"]:
            verify(item["output"])
            target = REPO / item["gitPath"]
            if sha256(target) != item["output"]["sha256"]: raise ValueError(f"Git texture drift: {target}")
    for item in report["meshComponents"]:
        verify(item["source"]); verify(item["converted"])
        if item["gitPath"] and sha256(REPO / item["gitPath"]) != item["converted"]["sha256"]: raise ValueError("Git mesh drift")
    for item in (receipt["report"], receipt["contactSheet"], receipt["publicReview"]["html"], receipt["publicReview"]["image"]): verify(item)
    if report["states"]["ggdVfxBuilt"] is not False or report["states"]["runtimeSelectable"] is not False or report["summary"]["skillBindingsCreated"] != 0: raise ValueError("candidate overclaim")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--closure", type=Path, default=CLOSURE)
    parser.add_argument("--conversion", type=Path, default=CONVERSION)
    parser.add_argument("--texture-umodel", type=Path, default=TEXTURE_UMODEL)
    parser.add_argument("--mesh-umodel", type=Path, default=MESH_UMODEL)
    parser.add_argument("--assimp", type=Path, default=ASSIMP)
    parser.add_argument("--max-texture-edge", type=int, required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    report = check(args) if args.check else build(args)
    print(json.dumps({"status": "current" if args.check else "built", **report["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
