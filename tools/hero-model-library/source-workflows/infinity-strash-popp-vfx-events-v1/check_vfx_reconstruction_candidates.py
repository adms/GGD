#!/usr/bin/env python3
"""Verify candidate recipe inputs, asset links, static previews and honest states."""

import argparse
import hashlib
import json
import pathlib
from datetime import datetime, timezone

from PIL import Image


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ref(path: pathlib.Path) -> dict[str, object]:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def verify(item: dict[str, object]) -> pathlib.Path:
    path = pathlib.Path(str(item["absolutePath"]))
    if not path.is_file() or path.stat().st_size != item["bytes"] or sha256(path) != item["sha256"]:
        raise RuntimeError(f"byte drift: {path}")
    return path


parser = argparse.ArgumentParser()
parser.add_argument("--candidates", type=pathlib.Path, required=True)
parser.add_argument("--html", type=pathlib.Path, required=True)
parser.add_argument("--output", type=pathlib.Path, required=True)
args = parser.parse_args()
data = json.loads(args.candidates.read_text(encoding="utf-8"))
if data.get("schema") != "ggd.infinity-strash-popp-vfx-reconstruction-candidates@1":
    raise RuntimeError(f"unexpected schema: {data.get('schema')}")
for item in data["inputs"].values():
    verify(item)
if data["summary"]["rootReferences"] != 17 or len(data["recipes"]) != 14 or len(data["supportRoots"]) != 3:
    raise RuntimeError("root partition drift")
asset_ids = set()
mesh_refs = set()
preview_dimensions = []
catalog_path = pathlib.Path(data["inputs"]["catalog"]["absolutePath"])
catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
for recipe in data["recipes"]:
    required_false = ("niagaraTimingRecovered", "ggdVfxBuilt", "skillBound", "visuallyAccepted", "runtimeSelectable", "deployed")
    if any(recipe["states"].get(field) is not False for field in required_false):
        raise RuntimeError(f"candidate state overclaim: {recipe['candidateId']}")
    if not recipe["unknownNiagaraFields"]:
        raise RuntimeError(f"missing Niagara unknowns: {recipe['candidateId']}")
    for asset in recipe["uniqueTextureAssets"]:
        asset_ids.add(asset["assetId"])
        physical = pathlib.Path(catalog["exportRoot"]) / asset["representativePath"]
        if not physical.is_file() or sha256(physical) != asset["sha256"]:
            raise RuntimeError(f"texture candidate drift: {physical}")
    for mesh in recipe["convertedMeshes"]:
        mesh_refs.add(mesh["reference"])
        verify(mesh)
    preview = verify(recipe["preview"])
    with Image.open(preview) as image:
        preview_dimensions.append({"path": str(preview), "width": image.width, "height": image.height})
contact = verify(data["staticEvidence"]["contactSheet"])
with Image.open(contact) as image:
    contact_dimensions = {"width": image.width, "height": image.height}
html_text = args.html.read_text(encoding="utf-8")
for recipe in data["recipes"]:
    if recipe["rootName"] not in html_text or recipe["rootReference"] not in html_text:
        raise RuntimeError(f"HTML omits candidate: {recipe['candidateId']}")
if "候選資料，尚未綁定" not in html_text:
    raise RuntimeError("HTML lacks candidate-only warning")
summary = {
    "rootReferences": 17,
    "niagaraSystemCandidates": len(data["recipes"]),
    "supportRoots": len(data["supportRoots"]),
    "uniqueTextureAssetsLinked": len(asset_ids),
    "convertedStaticMeshesLinked": len(mesh_refs),
    "recipePreviewImages": len(preview_dimensions),
    "contactSheetDimensions": contact_dimensions,
    "allInputAndLinkedBytesVerified": True,
    "honestIncompleteStatesVerified": True,
}
result = {
    "schema": "ggd.infinity-strash-popp-vfx-reconstruction-candidates-receipt@1",
    "inputs": {"candidates": ref(args.candidates), "html": ref(args.html)},
    "validator": ref(pathlib.Path(__file__)),
    "staticEvidence": {"contactSheet": data["staticEvidence"]["contactSheet"], "recipePreviewDimensions": preview_dimensions},
    "summary": summary,
    "states": {"candidateRelationshipsBuilt": True, "staticPreviewsBuilt": True, "niagaraTimingRecovered": False, "ggdVfxBuilt": False, "skillBindingsCreated": 0, "visualAcceptancePassed": False, "runtimeSelectable": False, "deployed": False},
    "claim": "The receipt verifies candidate relationships, linked source bytes, mesh bytes, preview bytes and explicit incomplete states only.",
    "createdAt": datetime.now(timezone.utc).isoformat(),
}
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"output": str(args.output.resolve()), **summary}, ensure_ascii=False))
