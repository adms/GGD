#!/usr/bin/env python3
"""Query local registry. Does not import, modify, download, or execute any asset."""
import argparse
import json
import sqlite3
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('query', nargs='?', default='')
    p.add_argument('--mode', choices=['libraries', 'characters', 'assets', 'crosswalk'], default='characters')
    p.add_argument('--library', choices=['300heroes', 'mba', 'lol', 'community37'])
    p.add_argument('--character', help='Exact namespaced character ID returned by characters mode')
    p.add_argument('--kind', help='model, animation, vfx, audio, texture, skeleton, metadata, recipe, hero_project, preview_package, other, video')
    p.add_argument('--format', help='glb, obj, wav, ogg, x, etc.')
    p.add_argument('--stage', help='LoL: full, selected, optimized_safe, optimized, runtime_candidate')
    p.add_argument('--available', action='store_true', help='Only existing local paths')
    p.add_argument('--limit', type=int, default=20)
    p.add_argument('--offset', type=int, default=0)
    a = p.parse_args()
    if not 1 <= a.limit <= 1000 or a.offset < 0: p.error('limit must be 1..1000; offset must be >= 0')
    q = unicodedata.normalize('NFKC', a.query).casefold()
    if a.mode in ('libraries', 'crosswalk'):
        value = json.loads((HERE / ('catalog.json' if a.mode == 'libraries' else 'community-crosswalk.json')).read_text())
        rows = value['libraries'] if isinstance(value, dict) else value
        rows = [r for r in rows if (not a.library or r.get('id') == a.library) and
                (not a.character or r.get('character_id') == a.character) and
                (not q or q in unicodedata.normalize('NFKC', json.dumps(r, ensure_ascii=False)).casefold())]
        result = dict(total=len(rows), offset=a.offset, results=rows[a.offset:a.offset+a.limit])
    else:
        db = sqlite3.connect((HERE / 'catalog.sqlite').as_uri() + '?mode=ro', uri=True)
        table = 'characters' if a.mode == 'characters' else 'assets'
        where, args = ['1=1'], []
        def add(sql, v): where.append(sql); args.append(v)
        if q: add('instr(search,?) > 0', q)
        if a.library: add('library=?', a.library)
        if a.mode == 'assets':
            if a.character: add('id IN (SELECT asset_id FROM links WHERE character_id=?)', a.character)
            if a.kind: add("instr('|' || tags || '|',?) > 0", '|' + a.kind + '|')
            if a.format: add('format=?', a.format.lower().lstrip('.'))
            if a.available: where.append('exists_local=1')
            if a.stage: add("json_extract(data,'$.stage')=?", a.stage)
        elif a.character: add('id=?', a.character)
        condition = ' AND '.join(where)
        total = db.execute(f'SELECT count(*) FROM {table} WHERE {condition}', args).fetchone()[0]
        rows = [json.loads(r[0]) for r in db.execute(f'SELECT data FROM {table} WHERE {condition} ORDER BY id LIMIT ? OFFSET ?', [*args, a.limit, a.offset])]
        if a.mode == 'assets':
            for r in rows:
                r['character_links'] = [dict(character_id=x, confidence=y) for x,y in db.execute('SELECT character_id,confidence FROM links WHERE asset_id=?', (r['id'],))]
        result = dict(total=total, offset=a.offset, returned=len(rows), results=rows)
        if a.mode == 'assets' and a.character:
            result['mapping_note'] = 'Only indexed associations; numeric-prefix/name matches are candidates. Unassigned VFX/audio require global path search.'
        db.close()
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
