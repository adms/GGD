#!/usr/bin/env python3
"""Query registry, convert explicit native selections, verify shared upload and motion.

Writes only a NEW output directory. Does not approve, publish or modify heroes.
Per-entry failures are retained; the process finishes the remaining selections
and exits nonzero when anything failed. Original assets remain at their source.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from convert_jumpx_body import model_identity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registry', type=Path, required=True, help='query.py from ASSET_LIBRARIES.md')
    parser.add_argument('--selections', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    selection = json.loads(args.selections.read_text())
    if selection.get('schema') != 'ggd-native-library-selection@1' or not 1 <= len(selection.get('entries', [])) <= 100:
        raise ValueError('Expected 1-100 explicit native selections')
    identifiers = [entry['characterId'] for entry in selection['entries']]
    if len(set(identifiers)) != len(identifiers) or any(not i.startswith('300heroes:') or not i.split(':')[1].isdigit() for i in identifiers):
        raise ValueError('Each native character ID must occur once')
    registry = args.registry.resolve(strict=True)
    output = args.out.resolve()
    output.mkdir(parents=True, exist_ok=False)
    tools = Path(__file__).resolve().parent
    repo = tools.parent.parent
    summary = []

    def query(directory, label, arguments):
        results = []
        for page in range(10):
            raw = subprocess.check_output([sys.executable, str(registry), *arguments, '--limit', '1000', '--offset', str(page * 1000)])
            (directory / f'{label}.page-{page}.json').write_bytes(raw)
            data = json.loads(raw)
            results.extend(data['results'])
            if len(results) >= data['total']:
                return results
        raise ValueError('Registry query exceeds 10,000 rows; use narrower texture searches')

    def execute(command, log):
        with log.open('x') as stream:
            result = subprocess.run(command, cwd=repo, stdout=stream, stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError(f'{log.name}: exit {result.returncode}\n' + log.read_text()[-2000:])

    for entry in selection['entries']:
        character_id = entry['characterId']
        directory = output / character_id.replace(':', '-')
        directory.mkdir()
        query_dir = directory / 'queries'; query_dir.mkdir()
        result = {'characterId': character_id, 'target': entry['target'], 'directory': str(directory), 'stage': 'query', 'visualAcceptance': 'pending'}
        summary.append(result)
        try:
            characters = query(query_dir, 'character', ['--mode', 'characters', '--character', character_id])
            character = next(row for row in characters if row['id'] == character_id)
            if character['name'] != entry['sourceName'] or character['origin'] != entry['sourceOrigin']:
                raise ValueError('Registry character or anime origin changed; review the selection')
            models = query(query_dir, 'models', ['--mode', 'assets', '--character', character_id, '--kind', 'model', '--format', 'x', '--available'])
            if not any(row['id'] == entry['asset'] for row in models) and character.get('base_model_present'):
                models.extend(query(query_dir, 'official-base-path', ['--mode', 'assets', '--library', '300heroes', '--kind', 'model', '--format', 'x', '--available', '/' + Path(character['base_model']).name]))
            selected = next(row for row in models if row['id'] == entry['asset'])
            result['identity'] = model_identity(selected, entry, characters)
            textures = query(query_dir, 'textures', ['--mode', 'assets', '--character', character_id, '--kind', 'texture', '--available'])
            for index, term in enumerate(entry.get('textureSearches', [])):
                if set(entry['textures'].values()).issubset({r['id'] for r in textures}):
                    break
                textures.extend(query(query_dir, f'texture-search-{index}', ['--mode', 'assets', '--library', '300heroes', '--kind', 'texture', '--available', term]))
            textures = list({row['id']: row for row in textures}.values())
            for name, rows in [('models', models), ('textures', textures), ('characters', characters)]:
                (directory / f'{name}.json').write_text(json.dumps({'results': rows}, ensure_ascii=False, indent=2) + '\n')
            selection_path = directory / 'selection.json'
            selection_path.write_text(json.dumps(entry, ensure_ascii=False, indent=2) + '\n')
            result['stage'] = 'conversion'
            execute([sys.executable, str(tools/'convert_jumpx_body.py'), '--model-query', str(directory/'models.json'), '--character-query', str(directory/'characters.json'), '--texture-query', str(directory/'textures.json'), '--selection', str(selection_path), '--out', str(directory/'body.glb')], directory/'conversion.log')
            result['stage'] = 'shared-upload-validation'
            execute(['node', '--import', 'tsx', str(tools/'finalize-library-body.mts'), '--receipt', str(directory/'body.receipt.json'), '--out', str(directory/'runtime')], directory/'validation.log')
            result['stage'] = 'runtime-motion'
            execute(['node', str(tools/'inspect-library-motion.mjs'), str(directory/'runtime'), str(directory/'runtime/motion.json')], directory/'motion.log')
            receipt = json.loads((directory/'runtime/receipt.json').read_text())
            motion = json.loads((directory/'runtime/motion.json').read_text())
            result.update(stage='prepared', model=receipt['document'], metrics=receipt['metrics'], warnings=receipt['warnings'], nativePoseComparison=motion['nativePoseComparison'])
        except Exception as error:
            result['error'] = str(error)
        (output/'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({k: result[k] for k in ['characterId', 'stage', 'error'] if k in result}, ensure_ascii=False), flush=True)
    return 1 if any('error' in row for row in summary) else 0


if __name__ == '__main__':
    raise SystemExit(main())
