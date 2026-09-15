#!/usr/bin/env python3
"""Render fixed-camera source/candidate comparisons for the Ash atlas stage."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

BLENDER_SCRIPT = r'''
import hashlib,json,os,sys
from pathlib import Path
for key,slug in [('BLENDER_USER_CONFIG','config'),('BLENDER_USER_SCRIPTS','scripts'),('BLENDER_USER_DATAFILES','data')]:
 p=Path('/private/tmp/ggd-ash-universal-atlas-blender')/slug;p.mkdir(parents=True,exist_ok=True);os.environ[key]=str(p)
import bpy
from mathutils import Vector
model=Path(sys.argv[-3]);out=Path(sys.argv[-2]);label=sys.argv[-1]
bpy.context.preferences.filepaths.use_scripts_auto_execute=False
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(model))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='Icosphere']
if len(meshes)!=2: raise RuntimeError('expected exactly two Ash meshes: '+repr([o.name for o in meshes]))
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8';scene.render.film_transparent=False;scene.render.dither_intensity=0
scene.view_settings.view_transform='AgX';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.world=bpy.data.worlds.new('world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.065,.065,.065,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
for name,loc,power,size in [('key',(3,-4,5),600,4),('fill',(-3,-1,3),400,3),('rim',(2,4,4),750,3)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('camera');cam=bpy.data.objects.new('camera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO'
views=[('front',[0,-4,.9],[0,0,.9],2.05,[384,576]),('three-quarter',[3,-4,1.35],[0,0,.9],2.1,[384,576]),('face',[0,-4,1.61],[0,0,1.61],.46,[448,448])]
rows=[];out.mkdir(parents=True,exist_ok=True)
for name,loc,target,scale,res in views:
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();camdata.ortho_scale=scale;scene.render.resolution_x,scene.render.resolution_y=res;p=out/(name+'.png');scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);rows.append({'label':label,'view':name,'path':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'camera':{'location':loc,'target':target,'orthoScale':scale,'resolution':res}})
print(json.dumps(rows))
'''


def render(blender: Path, model: Path, output: Path, label: str) -> list[dict]:
    output.parent.mkdir(parents=True, exist_ok=True)
    script = output.parent / f".{label}-render.py"
    script.write_text(BLENDER_SCRIPT)
    process = subprocess.run([str(blender), "--background", "--factory-startup", "--python", str(script), "--", str(model), str(output), label], text=True, capture_output=True, check=False)
    script.unlink(missing_ok=True)
    if process.returncode:
        raise RuntimeError(process.stdout + process.stderr)
    line = next((row for row in reversed(process.stdout.splitlines()) if row.startswith("[")), None)
    if line is None:
        raise RuntimeError("renderer emitted no receipt:\n" + process.stdout[-4000:] + process.stderr[-1000:])
    return json.loads(line)


def compare(source: Path, candidate: Path, output: Path) -> dict:
    from PIL import Image
    import numpy as np
    rows = []
    for source_image in sorted(source.glob("*.png")):
        candidate_image = candidate / source_image.name
        a = np.asarray(Image.open(source_image).convert("RGB"), dtype=np.int16)
        b = np.asarray(Image.open(candidate_image).convert("RGB"), dtype=np.int16)
        if a.shape != b.shape:
            raise ValueError("render dimensions differ")
        difference = np.max(np.abs(a - b), axis=2)
        changed = difference > 12
        rows.append({"view": source_image.stem, "pixels": int(changed.size), "changedPixels": int(changed.sum()),
                     "changedPixelPct": float(changed.mean() * 100), "meanMaxChannelDelta": float(difference.mean()),
                     "maxChannelDelta": int(difference.max())})
    return {"schema": "ggd.kof-xv-ash-universal-atlas-render-comparison@1", "threshold": {"changedPixelChannelDelta": 12, "maxChangedPixelPct": 5}, "views": rows, "maxChangedPixelPct": max(row["changedPixelPct"] for row in rows), "visualAcceptance": "pending-owner-review"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--blender", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve(); source_dir = out / "source"; candidate_dir = out / "candidate"
    result = {"source": {"path": str(args.source.resolve()), "sha256": hashlib.sha256(args.source.read_bytes()).hexdigest()}, "candidate": {"path": str(args.candidate.resolve()), "sha256": hashlib.sha256(args.candidate.read_bytes()).hexdigest()}, "renders": {"source": render(args.blender, args.source, source_dir, "source"), "candidate": render(args.blender, args.candidate, candidate_dir, "candidate")}}
    result["comparison"] = compare(source_dir, candidate_dir, out)
    (out / "comparison.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result["comparison"], ensure_ascii=False))


if __name__ == "__main__":
    main()
