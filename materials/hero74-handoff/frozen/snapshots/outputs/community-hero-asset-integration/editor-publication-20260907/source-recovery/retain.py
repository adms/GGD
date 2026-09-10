from pathlib import Path
import hashlib, json, shutil, subprocess

repo = Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge')
proof = Path('/private/tmp/ggd-source-recovery-proof')
target = repo.parent / 'outputs/community-hero-asset-integration/editor-publication-20260907/source-recovery'
code = [f'apps/content-api/src/{name}' for name in ['editorSourceRoutes.ts', 'editorSourceRecovery.ts', 'editorSourceRecovery.test.ts']]
source_facts = []
for rel in code:
    data = (repo / rel).read_bytes()
    output = proof / 'source' / rel
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    source_facts.append({'path': rel, 'sha256': hashlib.sha256(data).hexdigest()})
base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
(proof / 'source-proof.json').write_text(json.dumps({'baseCommit': base, 'files': source_facts, 'mutation': 'Vite transform in the test process only; no source mutation'}, indent=2) + '\n')
(proof / 'verification.json').write_text(json.dumps({'regressionBefore': {'expected': 1, 'result': 1}, 'finalTests': {'exit': 0, 'passed': 17}, 'typecheck': 0, 'mutation': {'expected': 1, 'result': 1}, 'readOnlyCheckpoint': 0, 'publishedHeroChanges': False, 'scope': 'caught synchronous local generator failures; not process termination or external CLI concurrency'}, indent=2) + '\n')
mutated = Path('/var/folders/nh/0xwcm79d52v3qyr1ntzqvwnc0000gq/T/ggd-source-recovery-pBJ2Wc')
if mutated.is_dir():
    shutil.copytree(mutated, proof / 'mutation-recovery', dirs_exist_ok=True)
target.mkdir(parents=True, exist_ok=True)
files = []
for path in sorted(proof.rglob('*')):
    if not path.is_file():
        continue
    rel = path.relative_to(proof)
    data = path.read_bytes()
    dest = target / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)
    assert dest.read_bytes() == data, str(rel)
    files.append({'path': str(rel), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
(target / 'evidence-retention.json').write_text(json.dumps({'files': files, 'count': len(files), 'bytes': sum(f['bytes'] for f in files)}, indent=2) + '\n')
if mutated.is_dir():
    shutil.rmtree(mutated)
print(json.dumps({'target': str(target), 'files': len(files), 'bytes': sum(f['bytes'] for f in files)}))
