#!/usr/bin/env python3
"""Apply the existing shipped transparent-atlas repair to one immutable body.

Keep the original file; record and verify that geometry, animation and image
buffer bytes are unchanged. Feed the resulting receipt to finalize-library-body.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("model_document", type=Path)
p.add_argument("output", type=Path)
p.add_argument("--source-body", type=Path, help="Archived GLB path when the previous model is no longer in the shipped catalog")
a = p.parse_args()
repo = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("alpha_repair", repo / "tools/w3x-import/repair_alpha_backdrops.py")
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)
model = json.loads(a.model_document.read_text())
source = a.source_body or repo / "content" / model["glbPath"]
data = source.read_bytes()
doc, binary = repair.chunks(data)
before = copy.deepcopy(doc)
changes = repair.repairs(doc, binary)
if not changes:
    raise SystemExit("No transparent-atlas repair needed")
encoded = repair.encode(doc, binary)
after, after_binary = repair.chunks(encoded)
assert after_binary == binary
for material in after["materials"]:
    material.pop("alphaMode", None)
    material.pop("alphaCutoff", None)
for material in before["materials"]:
    material.pop("alphaMode", None)
    material.pop("alphaCutoff", None)
assert before == after
out = a.output.resolve()
out.mkdir(parents=True, exist_ok=False)
target = out / "body.glb"
target.write_bytes(encoded)
def artifact(path):
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
receipt = {"schema": "ggd-library-model-preparation@1", "asset": model["id"],
           "source": artifact(source), "output": artifact(target), "stateClips": model["clipMap"],
           "repair": {"tool": "tools/w3x-import/repair_alpha_backdrops.py", "changes": changes, "binaryUnchanged": True},
           "limitations": ["Material metadata correction only; original visual acceptance still pending."]}
(out / "preparation.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(receipt["repair"]))
