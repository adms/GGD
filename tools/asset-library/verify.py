#!/usr/bin/env python3
"""Verify the Git management snapshot without downloading or consuming S3 assets."""
import ast
import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / 'materials/asset-library'


def main():
    manifest = json.loads((ROOT/'source-manifest.json').read_text())
    policy_path = ROOT/'source/GGD-Asset-Library/STORAGE_POLICY.json'
    policy = json.loads(policy_path.read_text())
    assert policy['decision_status'] == 'confirmed'
    assert policy['legacy_automatic_consumption'] is False
    assert policy['legacy_requires_explicit_human_authorization'] is True
    assert manifest['storage_policy_sha256'] == hashlib.sha256(policy_path.read_bytes()).hexdigest()
    assert manifest['binary_assets_included'] is False
    assert manifest['native_game_parsing_json_included'] is False
    excluded = tuple(policy['git_excluded_source_roots'])
    seen = set()
    total = 0
    for record in manifest['files']:
        rel = record['path']
        assert rel not in seen and not rel.startswith(excluded), rel
        seen.add(rel)
        path = (ROOT/'source'/rel).resolve()
        assert path.is_relative_to((ROOT/'source').resolve()), rel
        data = path.read_bytes()
        assert len(data) == record['bytes'], rel
        assert hashlib.sha256(data).hexdigest() == record['sha256'], rel
        text = data.decode('utf-8')
        assert '\x00' not in text, rel
        if path.suffix == '.json':
            json.loads(text)
        elif path.suffix == '.py':
            ast.parse(text, filename=rel)
        total += len(data)
    actual = {p.relative_to(ROOT/'source').as_posix() for p in (ROOT/'source').rglob('*')
              if p.is_file() and '__pycache__' not in p.parts}
    assert actual == seen, 'Source tree and manifest differ'
    assert len(seen) == manifest['file_count']
    assert total == manifest['total_bytes']
    for required in ['index_300_models.py', 'extract_300_audio.py', 'convert_mba_models.py',
                     'fadpcm_local.c', 'fadpcm_decoder.c', 'python-fsb5/fsb5/__init__.py']:
        assert 'outputs/game-asset-library-20260907/tools/'+required in seen, required
    print(f'PASS: {len(seen)} management sources, exact SHA-256, confirmed storage policy, no native payload roots')


if __name__ == '__main__':
    main()
