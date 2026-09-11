#!/usr/bin/env python3
"""Index Steam games across any number of read-only mounted steamapps shares."""

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path


FIELD = re.compile(r'^\s*"([^"]+)"\s+"([^"]*)"\s*$')
PRIORITY = re.compile(r'jump\s*force|king\s*of\s*fighters|\bkof\b|infinity\s*strash', re.I)


def parse_manifest(path: Path) -> dict:
    values = {}
    for line in path.read_text(encoding='utf-8-sig', errors='replace').splitlines():
        match = FIELD.match(line)
        if match:
            values[match.group(1).lower()] = match.group(2)
    app_id = values.get('appid') or re.search(r'appmanifest_(\d+)\.acf$', path.name, re.I).group(1)
    install_dir = values.get('installdir', '')
    return {
        'appId': app_id,
        'name': values.get('name') or install_dir or f'Steam app {app_id}',
        'installDir': install_dir,
        'buildId': values.get('buildid'),
        'lastUpdated': values.get('lastupdated'),
        'stateFlags': values.get('stateflags'),
    }


def locate_steamapps(root: Path) -> Path:
    if root.name.lower() == 'steamapps':
        return root
    nested = root / 'steamapps'
    if nested.is_dir():
        return nested
    if (root / 'common').is_dir() or next(root.glob('appmanifest_*.acf'), None):
        return root
    raise ValueError(f'No steamapps directory or share content at {root}')


def scan(mounts: list[Path]) -> dict:
    games = []
    libraries = []
    for supplied in mounts:
        root = supplied.expanduser().resolve()
        steamapps = locate_steamapps(root)
        manifests = sorted(steamapps.glob('appmanifest_*.acf'))
        libraries.append({'mountPath': str(root), 'steamappsPath': str(steamapps), 'manifestCount': len(manifests)})
        for manifest in manifests:
            row = parse_manifest(manifest)
            game_path = steamapps / 'common' / row['installDir']
            row.update({
                'libraryMount': str(root),
                'manifestPath': str(manifest),
                'gamePath': str(game_path),
                'gameDirectoryPresent': game_path.is_dir(),
                'prioritySource': bool(PRIORITY.search(f"{row['name']} {row['installDir']}")),
            })
            games.append(row)
    duplicate_ids = {app_id for app_id in (row['appId'] for row in games)
                     if sum(other['appId'] == app_id for other in games) > 1}
    for row in games:
        row['duplicateInstall'] = row['appId'] in duplicate_ids
    games.sort(key=lambda row: (not row['prioritySource'], row['name'].casefold(), row['libraryMount']))
    return {
        'schema': 'ggd-mounted-steam-library-index@1',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'readOnlySourceExpected': True,
        'libraryCount': len(libraries),
        'gameInstallCount': len(games),
        'distinctAppCount': len({row['appId'] for row in games}),
        'libraries': libraries,
        'games': games,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mount', action='append', type=Path, required=True,
                        help='Mounted share root or its steamapps directory; repeat once per drive.')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--usage-output', type=Path,
                        help='Optional GGDSteamStatus/usage.json path for the Windows GUI.')
    args = parser.parse_args()
    result = scan(args.mount)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    if args.usage_output:
        usage = {
            'schema': 'ggd-steam-bridge-usage@1',
            'updatedAt': result['generatedAt'],
            'games': [
                {'appId': row['appId'], 'name': row['name'], 'buildId': row['buildId'],
                 'libraryMount': row['libraryMount'], 'status': 'scanned'}
                for row in result['games']
            ],
        }
        args.usage_output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.usage_output.with_suffix(args.usage_output.suffix + '.tmp')
        temporary.write_text(json.dumps(usage, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(args.usage_output)
    print(json.dumps({key: result[key] for key in ('libraryCount', 'gameInstallCount', 'distinctAppCount')},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
