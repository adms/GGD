#!/usr/bin/env python3
"""Copy only resource-library management sources into Git, never binary assets."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEXT = {'.json', '.jsonl', '.md', '.txt', '.py', '.js', '.mjs', '.cjs', '.ts',
        '.mts', '.tsx', '.html', '.css', '.csv', '.tsv', '.yaml', '.yml', '.toml',
        '.sh', '.bat', '.ps1'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workspace', required=True, type=Path)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    selected = set()

    def add(path, recursive=False):
        if not path.exists():
            raise FileNotFoundError(path)
        paths = path.rglob('*') if recursive else (path.iterdir() if path.is_dir() else [path])
        for file in paths:
            if file.is_symlink() or not file.is_file() or '__pycache__' in file.parts:
                continue
            if file.suffix.lower() in TEXT or file.name in {'LICENSE', 'LICENSE.txt'}:
                selected.add(file)

    add(workspace/'ASSET_LIBRARIES.md')
    library = workspace/'GGD-Asset-Library'
    add(library)
    for name in ['tools', 'intake', 'staging', 'ready']:
        add(library/name, recursive=True)
    add(library/'shared')
    add(library/'shared/control')
    add(library/'backups')
    pointer = json.loads((library/'backups/latest.json').read_text())
    # Include per-file proofs, but never archive segments or duplicate release ZIPs.
    add(library/'backups'/pointer['snapshot'], recursive=True)
    game = workspace/'outputs/game-asset-library-20260907'
    add(game)
    add(game/'tools', recursive=True)
    for name in ['300heroes', 'magical-battle-arena']:
        add(game/name)
        add(game/name/'indexes', recursive=True)
    add(workspace/'outputs/asset-library-registry-20260907', recursive=True)
    add(workspace/'outputs/community-lol-models-20260907', recursive=True)
    add(workspace/'GGD社群英雄上傳內容_37名', recursive=True)

    # Inspect only the explicitly selected public management sources. Never read AWS files.
    blocked = []
    for file in sorted(selected):
        text = file.read_text(encoding='utf-8')
        if '\x00' in text or re.search(r'(?:AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----', text):
            blocked.append(str(file.relative_to(workspace)))
        for match in re.finditer(r'''["']?password["']?\s*[:=]\s*["']([^"']+)["']''', text, re.I):
            value = match.group(1)
            if value not in {'REDACTED_TEST_PASSWORD', 'password', '********', '<password>'}:
                blocked.append(str(file.relative_to(workspace)))
    if blocked:
        raise ValueError('Review sensitive-looking literals before Git export; paths only: '+str(sorted(set(blocked))))

    records = []
    for file in sorted(selected):
        rel = file.relative_to(workspace)
        target = ROOT/'source'/rel
        data = file.read_bytes()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        records.append(dict(path=str(rel), bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
    report = dict(schema='ggd-asset-library-git-sources@1', files=records,
                  file_count=len(records), total_bytes=sum(r['bytes'] for r in records),
                  binary_assets_included=False,
                  native_game_parsing_json_included=False,
                  scope='management sources, catalogs, authored GGD JSON, recipes and validation evidence')
    (ROOT/'source-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
