#!/usr/bin/env python3
import argparse,pathlib,subprocess,sys
p=argparse.ArgumentParser();p.add_argument('root',type=pathlib.Path);p.add_argument('--repo',required=True,type=pathlib.Path);a=p.parse_args();r=a.root.resolve();tool=pathlib.Path(__file__).with_name('render.py')
for prop,stage in [('back','256'),('handheld','native'),('back','native')]:
 source=r/'outputs'/prop/'component.glb' if stage=='256' else r/'intermediate'/prop/'source-materials.glb'
 out=r/'evidence'/('webgl-'+prop+'-'+stage)
 subprocess.run([sys.executable,str(tool),str(source),str(out),'--repo',str(a.repo.resolve())],check=True)
