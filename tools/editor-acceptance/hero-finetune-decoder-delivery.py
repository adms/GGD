"""Text-only supplement for the fixed decoder experiment; no AWS or GPU operations."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil

RUN = 'outputs/hero-forge-12b-restart-20260908'
CODE = ['structured-hero-control.py', 'test_structured_hero_control.py',
        'assess-structured-control.mts', 'run-structured-assessment.py', 'STRUCTURED_DECODING_PLAN.md',
        'structured-hero-control-v2.py', 'assess-structured-control-v2.mts', 'run-structured-assessment-v2.py',
        'STRUCTURED_DECODING_V2_PLAN.md', 'test_structured_hero_control_v2.py', 'summarize-structured-control.py',
        'audit-structured-shape.mts']
INPUTS = ['lora-facts-pilot-v1/evaluation.private.json', 'lora-facts-pilot-v1/whole_hero-raw.json',
          'ir2-jsonschema-smoke-v1/raw.json', 'gpu-preflight-v1.json']
TEXT = {'.py', '.mts', '.mjs', '.json', '.md', '.log'}


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def safe_relative(value):
    p = PurePosixPath(value)
    assert value and not p.is_absolute() and '\\' not in value and all(x not in ('', '.', '..') for x in value.split('/')), 'UNSAFE_PATH'
    return p


def entries(root):
    h = root / RUN
    for name in CODE + INPUTS:
        yield h / name
    for run in [h / 'structured-decoding-v1', h / 'structured-decoding-v2']:
        assert run.is_dir() and not run.is_symlink()
        for p in sorted(run.rglob('*')):
            assert not p.is_symlink(), 'NO_SYMLINK'
            if p.is_file(): yield p


def snapshot(source, dest):
    assert not dest.exists(), 'REFUSE_OVERWRITE'
    selected = list(entries(source))
    for p in selected:
        assert p.is_file() and not p.is_symlink() and p.suffix in TEXT, 'TEXT_ONLY'
        p.read_text(encoding='utf-8')
        assert p.stat().st_size < 25 * 1024 * 1024, 'TEXT_BUDGET'
    dest.mkdir(parents=True)
    rows = []
    for p in selected:
        rel = p.relative_to(source).as_posix(); safe_relative(rel)
        short = p.relative_to(source / RUN).as_posix()
        exhibit = 'files/' + short + ('.txt' if p.suffix in {'.py', '.mts', '.mjs'} else '')
        target = dest / exhibit; target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, target)
        rows.append({'sourceRelative': rel, 'exhibit': exhibit, 'bytes': p.stat().st_size, 'sha256': digest(p)})
    index = {'schema': 'ggd-hero-decoder-text-supplement@1', 'files': rows,
        'scriptSha256': digest(Path(__file__)), 'binaryAssetsCreated': False, 'requiresHistoricalResearchRestore': True,
        'baseModel': 'mlx-community/gemma-4-12B-it-8bit', 'baseRevision': '200bb6db075e137a4deb08838865ac4ddb86292e',
        'adapterSha256': '8f18981a6e0cfb9670ec54efd622ae1a62f26fd59657ee3fb2ded49cb45b9acf',
        'baseAndAdapterInExistingS3Backup': True, 'newRemoteReadClaim': False,
        'dependencies': 'Restore the historical research archive and pinned engine first. This is an additive text supplement, not an environment installer.'}
    (dest / 'INDEX.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
    return verify(dest)


def verify(dest):
    assert not dest.is_symlink(), 'NO_SYMLINK'
    index = json.loads((dest / 'INDEX.json').read_text())
    assert index['schema'] == 'ggd-hero-decoder-text-supplement@1'
    assert index['scriptSha256'] == digest(Path(__file__)), 'HELPER_DRIFT'
    sources, exhibits = set(), set()
    for f in index['files']:
        src, ex = str(safe_relative(f['sourceRelative'])), str(safe_relative(f['exhibit']))
        assert src.startswith(RUN + '/') and ex.startswith('files/'), 'SCOPE'
        assert src not in sources and ex not in exhibits, 'DUPLICATE'
        sources.add(src); exhibits.add(ex)
        p = dest / ex
        parts = PurePosixPath(ex).parts
        assert not any((dest.joinpath(*parts[:i])).is_symlink() for i in range(1, len(parts) + 1)), 'NO_SYMLINK'
        assert p.is_file() and p.stat().st_size == f['bytes'] and digest(p) == f['sha256'], 'EXHIBIT_MISMATCH'
        p.read_text(encoding='utf-8')
    assert {p.relative_to(dest).as_posix() for p in (dest / 'files').rglob('*') if p.is_file()} == exhibits, 'UNINDEXED_FILE'
    return {'verifiedTextFiles': len(sources), 'bytes': sum(f['bytes'] for f in index['files']), 'networkUsed': False, 'remoteObjectsVerified': False}


def restore(bundle, dest):
    result = verify(bundle)
    assert not dest.exists(), 'REFUSE_OVERWRITE'
    dest.mkdir(parents=True)
    for f in json.loads((bundle / 'INDEX.json').read_text())['files']:
        p = dest / f['sourceRelative']; p.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(bundle / f['exhibit'], p)
        assert digest(p) == f['sha256'], 'RESTORE_HASH'
    return {**result, 'restored': str(dest), 'historicalDependenciesStillRequired': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['snapshot', 'verify', 'restore'])
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--source', type=Path); parser.add_argument('--destination', type=Path)
    args = parser.parse_args(); bundle = args.bundle.resolve()
    if args.mode == 'snapshot':
        assert args.source; result = snapshot(args.source.resolve(), bundle)
    elif args.mode == 'restore':
        assert args.destination; result = restore(bundle, args.destination.resolve())
    else: result = verify(bundle)
    print(json.dumps(result))
