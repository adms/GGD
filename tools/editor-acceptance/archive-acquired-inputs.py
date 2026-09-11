"""Archive only SHA-verified files named by the acquired intake; never reads credentials."""
import argparse, hashlib, io, json, pathlib, re, subprocess, tarfile
p = argparse.ArgumentParser()
p.add_argument('--intake', required=True)
p.add_argument('--out', required=True)
p.add_argument('--allowed-root', action='append', required=True)
a = p.parse_args()
source = pathlib.Path(a.intake).resolve()
output = pathlib.Path(a.out).resolve()
roots = [pathlib.Path(v).resolve() for v in a.allowed_root]
assert not output.exists(), 'Choose a new archive path.'
files = {}
def visit(value):
    if isinstance(value, dict):
        if all(k in value for k in ('absolutePath', 'sha256', 'bytes')):
            path = pathlib.Path(value['absolutePath']).resolve()
            assert any(path.is_relative_to(root) for root in roots), path
            proof = {'sha256': value['sha256'], 'bytes': value['bytes']}
            assert str(path) not in files or files[str(path)] == proof, path
            files[str(path)] = proof
        for child in value.values():
            visit(child)
    elif isinstance(value, list):
        for child in value:
            visit(child)
intake = json.loads(source.read_text())
# The top-level inputs are mutable registry/index snapshots. They remain embedded
# in intake.json as provenance, while this source archive contains the exact model,
# animation, VFX and audio candidate files selected for each hero.
visit(intake.get('heroes', []))
assert files, 'No intake file proofs found.'
rows = []
seen = set()
with tarfile.open(output, 'w:gz', compresslevel=1) as archive:
    for filename, proof in sorted(files.items()):
        path = pathlib.Path(filename)
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        # The shared library can advance while a batch runs. Restore the exact
        # indexed metadata revision, never silently archive newer bytes.
        restored = None
        if digest != proof['sha256']:
            for repo_key, commit_key in [('sourceRepo', 'sourceCommit'), ('mainFileRepo', 'mainFileRepoCommit')]:
                repo = pathlib.Path(intake[repo_key]).resolve()
                commit = intake[commit_key]
                if path.is_relative_to(repo) and re.fullmatch(r'[a-f0-9]{7,40}', commit):
                    candidate = subprocess.run(['git', '-C', str(repo), 'show', commit + ':' + path.relative_to(repo).as_posix()], capture_output=True)
                    if candidate.returncode == 0 and hashlib.sha256(candidate.stdout).hexdigest() == proof['sha256']:
                        data = candidate.stdout
                        digest = proof['sha256']
                        restored = commit
                        break
        assert digest == proof['sha256'] and len(data) == proof['bytes'], filename
        member = 'sources/' + digest + '/' + path.name
        rows.append({'originalPath': filename, 'member': member, **proof, **({'restoredFromCommit': restored} if restored else {})})
        if member in seen:
            continue
        seen.add(member)
        info = tarfile.TarInfo(member)
        info.size = len(data)
        info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
    index = json.dumps({'schema': 'ggd-acquired-source-archive@1', 'files': rows}, ensure_ascii=False, indent=2).encode()
    info = tarfile.TarInfo('source-files.json')
    info.size = len(index)
    archive.addfile(info, io.BytesIO(index))
    archive.add(source, arcname='intake.json', recursive=False)
h = hashlib.sha256()
with output.open('rb') as stream:
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(block)
receipt = {'schema': 'ggd-acquired-source-archive-receipt@1', 'path': str(output), 'bytes': output.stat().st_size, 'sha256': h.hexdigest(), 'sourceFiles': len(rows), 'uniqueMembers': len(seen), 'sourceBytes': sum(x['bytes'] for x in rows), 'intakeSha256': hashlib.sha256(source.read_bytes()).hexdigest()}
output.with_suffix(output.suffix + '.receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt), flush=True)
