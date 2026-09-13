#!/usr/bin/env python3
"""Index Steam games across any number of read-only mounted steamapps shares."""

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path


FIELD = re.compile(r'^\s*"([^"]+)"\s+"([^"]*)"\s*$')
PRIORITY = re.compile(
    r'jump\s*force|j-?stars(?:\s+victory)?|king[\s_-]*of[\s_-]*fighters|\bkof\b|maximum\s*impact|'
    r'infinity\s*strash|fate.?unlimited.?codes?|super\s*smash|smash\s*bros|'
    r'magical\s*battle\s*arena|300\s*(?:heroes|英雄)|palworld|palserver|幻獸帕魯',
    re.I,
)


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


def locate_steam_layout(root: Path) -> tuple[Path | None, Path, str]:
    if root.name.casefold() == 'common':
        return None, root, 'direct-common-share'
    if root.name.lower() == 'steamapps':
        return root, root / 'common', 'steamapps'
    nested = root / 'steamapps'
    if nested.is_dir():
        return nested, nested / 'common', 'library-root'
    if (root / 'common').is_dir() or next(root.glob('appmanifest_*.acf'), None):
        return root, root / 'common', 'steamapps-contents-share'
    raise ValueError(f'No Steam library, steamapps contents, or direct common share at {root}')


def load_catalog(path: Path | None) -> list[dict]:
    if path is None:
        return []
    payload = path.read_bytes()
    if path.suffix == '.gz':
        payload = gzip.decompress(payload)
    data = json.loads(payload.decode('utf-8'))
    if isinstance(data, dict):
        return data.get('steamGames', [])
    return data if isinstance(data, list) else []


def catalog_by_install_directory(rows: list[dict]) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}
    for row in rows:
        install_dir = row.get('installDirectory') or row.get('installDir')
        if isinstance(install_dir, str) and install_dir:
            result.setdefault(install_dir.casefold(), []).append(row)
    return result


def scan(mounts: list[Path], catalog: list[dict] | None = None) -> dict:
    games = []
    libraries = []
    known_by_directory = catalog_by_install_directory(catalog or [])
    for supplied in mounts:
        root = supplied.expanduser().resolve()
        steamapps, common, layout = locate_steam_layout(root)
        manifests = sorted(steamapps.glob('appmanifest_*.acf')) if steamapps else []
        libraries.append({
            'mountPath': str(root),
            'layout': layout,
            'steamappsPath': str(steamapps) if steamapps else None,
            'commonPath': str(common),
            'manifestCount': len(manifests),
        })
        for manifest in manifests:
            row = parse_manifest(manifest)
            game_path = common / row['installDir']
            row.update({
                'libraryMount': str(root),
                'manifestPath': str(manifest),
                'gamePath': str(game_path),
                'gameDirectoryPresent': game_path.is_dir(),
                'prioritySource': bool(PRIORITY.search(f"{row['name']} {row['installDir']}")),
                'inventoryMethod': 'steam-appmanifest',
            })
            games.append(row)
        if steamapps is None:
            for game_path in sorted((path for path in common.iterdir() if path.is_dir()),
                                    key=lambda path: path.name.casefold()):
                matches = known_by_directory.get(game_path.name.casefold(), [])
                known = matches[0] if len(matches) == 1 else {}
                name = known.get('title') or known.get('name') or game_path.name
                row = {
                    'appId': known.get('appId'),
                    'name': name,
                    'installDir': game_path.name,
                    'buildId': known.get('buildId'),
                    'lastUpdated': None,
                    'stateFlags': None,
                    'libraryMount': str(root),
                    'manifestPath': None,
                    'gamePath': str(game_path),
                    'gameDirectoryPresent': True,
                    'prioritySource': bool(PRIORITY.search(f'{name} {game_path.name}')),
                    'inventoryMethod': 'direct-common-directory',
                    'catalogMatched': len(matches) == 1,
                    'catalogMatchCount': len(matches),
                }
                games.append(row)
    duplicate_ids = {app_id for app_id in (row['appId'] for row in games) if app_id
                     if sum(other['appId'] == app_id for other in games) > 1}
    for row in games:
        row['duplicateInstall'] = bool(row['appId']) and row['appId'] in duplicate_ids
    games.sort(key=lambda row: (not row['prioritySource'], row['name'].casefold(), row['libraryMount']))
    identities = {
        f"app:{row['appId']}" if row['appId'] else f"directory:{row['installDir'].casefold()}"
        for row in games
    }
    return {
        'schema': 'ggd-mounted-steam-library-index@1',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'readOnlySourceExpected': True,
        'libraryCount': len(libraries),
        'gameInstallCount': len(games),
        'distinctAppCount': len(identities),
        'libraries': libraries,
        'games': games,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mount', action='append', type=Path, required=True,
                        help='Mounted share root or its steamapps directory; repeat once per drive.')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--catalog', type=Path,
                        help='Optional windows-game-library.json[.gz] used to recover App ID/build ID for a direct common share.')
    parser.add_argument('--usage-output', type=Path,
                        help='Optional GGDSteamStatus/usage.json path for the Windows GUI.')
    args = parser.parse_args()
    result = scan(args.mount, load_catalog(args.catalog))
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
