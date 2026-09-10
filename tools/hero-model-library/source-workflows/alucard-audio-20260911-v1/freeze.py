#!/usr/bin/env python3
"""Back up local decoder dependencies and freeze a completed audio delivery."""
import argparse
import json
import shutil
import subprocess
from pathlib import Path
from decode import sha, put

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument('output', type=Path)
ap.add_argument('--vgmstream-source', type=Path, default=Path('/private/tmp/ggd-vgmstream-r2117'))
args = ap.parse_args()
out = args.output.resolve()
report = json.loads((out/'audioFileIndex.json').read_text())
deps = out/'dependencies'
assert not deps.exists(), 'Do not overwrite a prior dependency freeze'
deps.mkdir()
queue = [Path(report['toolInfo'][k]['path']) for k in ('decoder','ffmpeg')]
seen, rows = set(), []
while queue:
    original = queue.pop(0)
    real = original.resolve()
    if real in seen:
        continue
    seen.add(real)
    assert real.is_file()
    dest = deps/'files'/str(real).lstrip('/')
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(real, dest)
    assert sha(real) == sha(dest)
    result = subprocess.run(['/usr/bin/otool','-L',str(real)],capture_output=True,text=True,check=True)
    links = []
    for line in result.stdout.splitlines()[1:]:
        name = line.strip().split(' (compatibility version',1)[0]
        links.append(name)
        if name.startswith(('/System/','/usr/lib/')):
            continue
        if name.startswith('@loader_path/'):
            name = str(real.parent/name.removeprefix('@loader_path/'))
        assert name.startswith('/'), f'Unresolved dynamic dependency {name}'
        queue.append(Path(name))
    rows.append({'originalPath':str(original),'resolvedPath':str(real),
                 'backupPath':dest.relative_to(out).as_posix(),'bytes':real.stat().st_size,
                 'sha256':sha(real),'dynamicLinks':links})
source_commit = subprocess.check_output(['git','-C',str(args.vgmstream_source),'rev-parse','HEAD'],text=True).strip()
assert source_commit == '71e2361042531fe767fb98300cf8c1ee95e539a0'
archive = deps/'vgmstream-r2117-source.tar'
subprocess.run(['git','-C',str(args.vgmstream_source),'archive','--format=tar',f'--output={archive}',source_commit],check=True)
info = {'schema':'ggd-local-tool-dependencies@1','files':rows,
        'vgmstreamSource':{'commit':source_commit,'path':archive.relative_to(out).as_posix(),
                           'sha256':sha(archive),'bytes':archive.stat().st_size},
        'runtime':'Python 3.10+ standard library; macOS system libraries remain operating-system dependencies.',
        'restoration':'These are preserved originals with existing absolute dylib install names, not a relocated standalone executable bundle.'}
put(out/'dependencies.json',info)
for p in Path(__file__).parent.iterdir():
    if p.is_file():
        shutil.copy2(p,out/'tools'/p.name)
counts = {}
for group in report['audioGroups']:
    files = [x for x in report['files'] if x['groupId']==group['id']]
    counts[group['id']] = {'files':len(files),'seconds':sum(x['seconds'] for x in files),
                           'silentPlaceholders':sum(x['sourceSilentPlaceholder'] for x in files)}
delivery = json.loads((out/'delivery.json').read_text())
delivery.update(audioFileIndex={'path':'audioFileIndex.json','sha256':sha(out/'audioFileIndex.json')},
                groupCounts=counts,dependencies={'path':'dependencies.json','sha256':sha(out/'dependencies.json')},
                longestStream=max(report['files'],key=lambda x:x['seconds']),
                maxPeak=max(x['peakAbsoluteNormalized'] for x in report['files']),
                fullScaleSamples=sum(x['fullScaleSampleCount'] for x in report['files']))
put(out/'delivery.json',delivery)
put(out/'files-sha256.json',{'schema':'ggd-local-file-manifest@1','files':[
    {'path':p.relative_to(out).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)}
    for p in sorted(out.rglob('*')) if p.is_file() and p.name!='files-sha256.json']})
frozen = json.loads((out/'files-sha256.json').read_text())
for spec in frozen['files']:
    p=out/spec['path']; assert p.stat().st_size==spec['bytes'] and sha(p)==spec['sha256']
print(json.dumps({'files':len(frozen['files']),'dependencyBinaries':len(rows),
                  'deliverySha256':sha(out/'delivery.json'),'manifestSha256':sha(out/'files-sha256.json')}))
