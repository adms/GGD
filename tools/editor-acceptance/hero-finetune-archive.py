"""Explicit local research archival, hash verification and safe extraction.
Does not run models, publish, mutate source data or claim quality qualification.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import zipfile

SKIP = {'.git', 'node_modules', '__pycache__', '.cache', '.venv', 'isolated-engine-v1'}
TEXT = {'.md', '.json', '.jsonl', '.py', '.mjs', '.mts', '.ts', '.txt', '.log', '.html', '.css', '.yaml', '.yml', '.toml', '.csv', '.sh', '.jinja'}
SECRETS = re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{35,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)')


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def write(path, value):
    with path.open('x') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')


def build(workspace, out, include=None, terminal_state=None):
    workspace, out = workspace.resolve(), out.resolve()
    assert not out.exists(), 'NEW_ARCHIVE_DIRECTORY_REQUIRED'
    outputs = workspace / 'outputs'
    if include:
        assert terminal_state, 'EXPLICIT_TERMINAL_STATE_REQUIRED'
        assert all(not p.is_absolute() and '..' not in p.parts for p in include), 'RELATIVE_SOURCE_PATH_REQUIRED'
        roots = [workspace / p for p in include]
        assert len(set(roots)) == len(roots), 'DUPLICATE_ROOT'
        assert all(not a.is_relative_to(b) for a in roots for b in roots if a != b), 'OVERLAPPING_ROOTS'
    else:
        roots = [p for p in sorted(outputs.iterdir()) if p.name.startswith(('forge-', 'community37-')) or p.name in
            {'hero-forge-12b-restart-20260908', 'mid-model-comparison-20260907', 'qwen38-local-comparison-20260907', 'model-research-integrated-20260908'}]
        roots += [workspace / 'GGD-hero-auto-forge/tools/forge-training']
        roots += [workspace / name for name in ['Finetune 英雄技能特效與機制全自動鑄造小模型全自動實作計畫.md', 'Finetune_英雄技能模型_最終研究報告_20260907.md']]
    assert all(p.exists() for p in roots)
    assert all(p.resolve().is_relative_to(workspace) and not out.is_relative_to(p.resolve()) for p in roots), 'SOURCE_SCOPE_OR_RECURSIVE_OUTPUT'
    # Only archive a terminal new workflow, never a misleading running snapshot.
    terminal = terminal_state or Path('outputs/hero-forge-12b-restart-20260908/ir5-workflow-v1/state.json')
    assert not terminal.is_absolute() and '..' not in terminal.parts, 'RELATIVE_STATE_PATH_REQUIRED'
    workflow = json.loads((workspace / terminal).read_text())
    assert workflow['status'] in {'completed-experiment-not-promoted', 'completed-control-not-promoted', 'stopped-report-written'}, 'WORKFLOW_NOT_TERMINAL'
    out.mkdir(parents=True)
    (out / 'archives').mkdir()
    (out / 'models').mkdir()
    entries, omitted, archives = [], [], []

    def walk(p):
        if p.is_symlink():
            omitted.append({'path': p.relative_to(workspace).as_posix(), 'reason': 'symlink-not-followed'})
        elif p.name in SKIP:
            omitted.append({'path': p.relative_to(workspace).as_posix(), 'reason': 'environment-cache-or-duplicate-engine'})
        elif p.is_dir():
            for child in sorted(p.iterdir()):
                yield from walk(child)
        else:
            yield p

    for n, root in enumerate(roots):
        archive_name = f'archives/{n:02d}-{root.name}.zip'
        with zipfile.ZipFile(out / archive_name, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for f in walk(root):
                rel = f.relative_to(workspace).as_posix()
                if f.name.startswith('.env') or f.name in {'.DS_Store', 'gpu.lock'} or f.suffix in {'.pyc', '.tmp'}:
                    omitted.append({'path': rel, 'reason': 'environment-or-volatile-file'})
                    continue
                size = f.stat().st_size
                if f.suffix == '.safetensors':
                    keep = size < 64 * 1024**2 and (any(x in f.parts for x in ['selected-adapter', 'research-adapter', 'native-adapter']) or
                        'hero-forge-12b-restart-20260908' in f.parts)
                    h = digest(f)
                    if not keep:
                        omitted.append({'path': rel, 'bytes': size, 'sha256': h, 'reason': 'base-fused-or-unselected-weight-not-in-git'})
                        continue
                    blob = 'models/' + h + '.safetensors'
                    if not (out / blob).exists():
                        shutil.copyfile(f, out / blob)
                    entries.append({'path': rel, 'bytes': size, 'sha256': h, 'modelBlob': blob})
                    continue
                if f.suffix not in TEXT and f.suffix not in {'.png', '.svg'} and f.name not in {'LICENSE', 'NOTICE', 'STOP', 'CANCEL'}:
                    omitted.append({'path': rel, 'bytes': size, 'reason': 'non-source-or-nested-package',
                        **({'sha256': digest(f)} if size < 64 * 1024**2 else {})})
                    continue
                data = f.read_bytes()
                if f.suffix in TEXT or f.name in {'LICENSE', 'NOTICE'}:
                    assert not SECRETS.search(data), f'POSSIBLE_SECRET:{rel}'
                h = hashlib.sha256(data).hexdigest()
                info = zipfile.ZipInfo(rel, date_time=(2026, 9, 8, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, data)
                entries.append({'path': rel, 'bytes': len(data), 'sha256': h, 'archive': archive_name})
        assert (out / archive_name).stat().st_size < 95 * 1024**2, 'ARCHIVE_EXCEEDS_GIT_FILE_LIMIT'
        archives.append({'path': archive_name, 'bytes': (out / archive_name).stat().st_size, 'sha256': digest(out / archive_name)})
    # Readable source mirrors allow review without opening ZIPs; hashes stay original.
    mirrors = []
    mirror_roots = [] if include else [('12b', outputs / 'hero-forge-12b-restart-20260908'), ('4b', workspace / 'GGD-hero-auto-forge/tools/forge-training')]
    for name, src in mirror_roots:
        dest = out / 'sources' / name
        dest.mkdir(parents=True)
        for f in sorted(src.iterdir()):
            if f.is_file() and f.suffix in {'.py', '.mjs', '.mts', '.ts', '.md'}:
                # Archived tests are exhibits, not tests of the current checkout.
                name = f.name if f.suffix == '.md' else f.name + '.txt'
                shutil.copyfile(f, dest / name)
                mirrors.append({'path': (dest / name).relative_to(out).as_posix(), 'sha256': digest(f)})
    if include:
        for f in roots:
            if f.is_file() and f.suffix in {'.py', '.mjs', '.mts', '.ts', '.md'}:
                rel = f.relative_to(workspace).as_posix() + ('' if f.suffix == '.md' else '.txt')
                dest = out / 'sources' / 'supplement' / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(f, dest)
                mirrors.append({'path': dest.relative_to(out).as_posix(), 'sha256': digest(f)})
    manifest = {'schema': 'ggd-hero-finetune-research-archive@1', 'entries': entries, 'archives': archives,
        'sourceMirrors': mirrors, 'omitted': omitted, 'secretPatternCheckPassed': True,
        'scriptSha256': digest(Path(__file__)), 'productionQualified': False,
        'scope': 'Explicit incremental research supplement; baseline dependencies remain in the original archive.' if include else 'Historical 4B/9B/12B/27B research, new IR5 experiment, scripts, raw evidence and selected adapters. Base/fused weights and duplicate environments excluded.',
        'includedRoots': [p.relative_to(workspace).as_posix() for p in roots],
        'terminalState': {'path': str(terminal), 'sha256': digest(workspace / terminal), 'status': workflow['status']},
        'privacyNote': 'Historical machine paths and fictional hero source texts are preserved for evidence integrity; no credential files are included.'}
    write(out / 'manifest.json', manifest)
    verify(out)


def verify(out):
    m = json.loads((out / 'manifest.json').read_text())
    assert m['schema'] == 'ggd-hero-finetune-research-archive@1' and not m['productionQualified']
    assert len({e['path'] for e in m['entries']}) == len(m['entries']), 'DUPLICATE_ENTRY'
    archive_names = {a['path'] for a in m['archives']}
    assert len(archive_names) == len(m['archives']), 'DUPLICATE_ARCHIVE'
    by_archive = {}
    for e in m['entries']:
        name = PurePosixPath(e['path'])
        assert not name.is_absolute() and '..' not in name.parts
        if 'modelBlob' in e:
            blob = out / e['modelBlob']
            assert blob.resolve().is_relative_to(out.resolve())
            assert blob.stat().st_size == e['bytes'] and digest(blob) == e['sha256']
        else:
            assert e['archive'] in archive_names, 'UNREGISTERED_ARCHIVE'
            by_archive.setdefault(e['archive'], []).append(e)
    for a in m['archives']:
        p = out / a['path']
        assert p.resolve().is_relative_to(out.resolve()) and digest(p) == a['sha256']
        with zipfile.ZipFile(p) as z:
            expected = by_archive.get(a['path'], [])
            assert sorted(z.namelist()) == sorted(e['path'] for e in expected)
            for e in expected:
                data = z.read(e['path'])
                assert len(data) == e['bytes'] and hashlib.sha256(data).hexdigest() == e['sha256']
    for e in m['sourceMirrors']:
        assert (out / e['path']).resolve().is_relative_to(out.resolve()), 'SOURCE_MIRROR_ESCAPE'
        assert digest(out / e['path']) == e['sha256']
    print(json.dumps({'verified': True, 'files': len(m['entries']), 'archives': len(m['archives']),
        'uniqueAdapterBlobs': len({e['modelBlob'] for e in m['entries'] if 'modelBlob' in e}), 'productionQualified': False}))


def extract(out, destination):
    verify(out)
    assert not destination.exists(), 'NEW_EXTRACTION_DIRECTORY_REQUIRED'
    destination.mkdir(parents=True)
    m = json.loads((out / 'manifest.json').read_text())
    for a in m['archives']:
        with zipfile.ZipFile(out / a['path']) as z:
            z.extractall(destination)
    for e in m['entries']:
        if 'modelBlob' in e:
            p = destination / e['path']
            p.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(out / e['modelBlob'], p)
    print(json.dumps({'extracted': str(destination), 'missingBaseWeights': True, 'gpuStarted': False}))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('mode', choices=['build', 'verify', 'extract'])
    p.add_argument('archive', type=Path)
    p.add_argument('--workspace', type=Path)
    p.add_argument('--destination', type=Path)
    p.add_argument('--include', type=Path, action='append')
    p.add_argument('--terminal-state', type=Path)
    a = p.parse_args()
    if a.mode == 'build':
        assert a.workspace
        build(a.workspace.resolve(), a.archive.resolve(), a.include, a.terminal_state)
    elif a.mode == 'verify':
        verify(a.archive.resolve())
    else:
        assert a.destination
        extract(a.archive.resolve(), a.destination.resolve())
