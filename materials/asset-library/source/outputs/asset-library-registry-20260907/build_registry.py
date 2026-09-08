#!/usr/bin/env python3
"""Rebuild a local, read-only-source asset registry. Python standard library only."""
import collections
import hashlib
import json
import re
import sqlite3
import unicodedata
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORKSPACE = HERE.parent.parent
GAMES = WORKSPACE / 'outputs/game-asset-library-20260907'
ROOTS = {'300heroes': GAMES / '300heroes', 'mba': GAMES / 'magical-battle-arena',
         'lol': WORKSPACE / 'outputs/community-lol-models-20260907',
         'community37': WORKSPACE / 'GGD社群英雄上傳內容_37名'}

def read(p):
    return json.loads(p.read_text())

def lines(p):
    with p.open() as f:
        for line in f:
            if line.strip():
                yield json.loads(line)

def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def norm(s):
    return unicodedata.normalize('NFKC', s).casefold()

def category(p):
    ext = Path(p).suffix.lower()
    return ('model' if ext in ('.x', '.model', '.skn', '.glb', '.obj') else
            'skeleton' if ext == '.skl' else
            'animation' if ext in ('.anm', '.mtn') else
            'audio' if ext in ('.wav', '.ogg', '.mp3', '.bank', '.fsb') else
            'texture' if ext in ('.dds', '.bmp', '.tga', '.png', '.jpg', '.jpeg', '.webp') else
            'vfx' if ext in ('.efc', '.fx') else
            'video' if ext in ('.wmv', '.mpg', '.mp4') else 'other')

def main():
    tmp = HERE / 'catalog.building.sqlite'
    if tmp.exists():
        tmp.unlink()
    db = sqlite3.connect(tmp)
    db.executescript('''
      CREATE TABLE characters(id TEXT PRIMARY KEY, library TEXT, name TEXT, origin TEXT, search TEXT, data TEXT);
      CREATE TABLE assets(id TEXT PRIMARY KEY, library TEXT, kind TEXT, tags TEXT, format TEXT,
        name TEXT, path TEXT, exists_local INTEGER, readiness TEXT, search TEXT, data TEXT);
      CREATE TABLE links(character_id TEXT, asset_id TEXT, confidence TEXT,
        PRIMARY KEY(character_id,asset_id));
      CREATE INDEX assets_library_kind ON assets(library,kind);
      CREATE INDEX links_asset ON links(asset_id);
    ''')
    chars, missing, inputs = [], [], set()

    def load(p, jsonl=False):
        inputs.add(p)
        return lines(p) if jsonl else read(p)

    def char(lib, key, name, origin, aliases, **extra):
        r = dict(id=f'{lib}:{key}', library=lib, name=name, origin=origin,
                 aliases=sorted(set([name, str(key)] + [a for a in aliases if a])), **extra)
        chars.append(r)
        db.execute('INSERT INTO characters VALUES(?,?,?,?,?,?)',
                   (r['id'], lib, name, origin, norm(' '.join(r['aliases']) + ' ' + origin), json.dumps(r, ensure_ascii=False)))
        return r['id']

    def asset(lib, path, kind=None, tags=(), readiness='native', character=None,
              confidence='source_manifest', locator='', name=None, **extra):
        path = path.resolve()
        rel = str(path.relative_to(ROOTS[lib])) if path.is_relative_to(ROOTS[lib]) else str(path)
        aid = f'{lib}:' + hashlib.sha256((rel + '#' + locator).encode()).hexdigest()[:24]
        kind = kind or category(path)
        exists = path.is_file()
        if not exists:
            missing.append(dict(library=lib, path=str(path), locator=locator))
        record = dict(id=aid, library=lib, kind=kind, tags=sorted(set([kind, *tags])),
                      format=path.suffix.lower().lstrip('.'), name=name or path.name, path=str(path),
                      exists_local=exists, readiness=readiness, locator=locator, **extra)
        db.execute('INSERT OR IGNORE INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                   (aid, lib, kind, '|'.join(record['tags']), record['format'], record['name'], str(path),
                    int(exists), readiness, norm(rel + ' ' + record['name'] + ' ' + locator), json.dumps(record, ensure_ascii=False)))
        if character:
            db.execute('INSERT OR REPLACE INTO links VALUES(?,?,?)', (character, aid, confidence))
        return aid

    # 300 Heroes: official base association; variants and hero audio use the original prefix heuristic.
    r300 = ROOTS['300heroes']
    roster = {r['id']: r for r in load(GAMES / '300heroes-roster.json')['characters']}
    candidates = load(r300 / 'character-candidates.json')
    native_chars, base_models = {}, {}
    for c in candidates:
        r = roster[c['id']]
        base = c['client_base_model'].replace('\\', '/').removeprefix('../').lower()
        cid = char('300heroes', c['id'], c['name'], c['origin_work'],
                   [r.get('canonical_character', ''), r.get('name_key', '')],
                   origin_sources=r.get('origin_sources', []), origin_status=r.get('origin_status'),
                   source_index=str(r300 / 'character-candidates.json'),
                   base_model=str(r300 / 'raw' / base), base_model_present=c['base_model_present'],
                   model_files=c['model_files'], animation_clips=c['animation_clips'],
                   mapping_note=c['matching_note'], readiness='native_and_static_preview')
        base_models[cid] = base
        for p in c['native_model_paths']:
            native_chars[p] = cid

    def owner300(p):
        return native_chars.get(p)

    def confidence300(cid, p):
        return 'official_base_model' if base_models.get(cid) == p else 'numeric_prefix_candidate'

    for r in load(r300 / 'asset-index.jsonl', True):
        p = r['path']; cid = owner300(p)
        tags = ['vfx'] if p.startswith(('data/effect/', 'data/magic/')) else []
        asset('300heroes', r300 / 'raw' / p, tags=tags, character=cid,
              confidence=confidence300(cid, p), source_record=r)
    for m in load(r300 / 'models/model-index.jsonl', True):
        p = m['source']; cid = owner300(p); confidence = confidence300(cid, p)
        for key, kind, readiness in [('obj', 'model', 'static_preview'), ('animation_binary', 'animation', 'native_key_data')]:
            if m.get(key):
                out = GAMES / m[key]
                asset('300heroes', out, kind, readiness=readiness, character=cid, confidence=confidence,
                      source_native=str(r300 / 'raw' / p))
                if key == 'obj':
                    for sidecar in ['mesh.mtl', 'model.json', 'materials.json']:
                        if (out.parent / sidecar).exists():
                            asset('300heroes', out.parent / sidecar, 'metadata', character=cid,
                                  confidence=confidence, source_native=str(r300 / 'raw' / p))
        for i, clip in enumerate(m.get('clips', [])):
            asset('300heroes', r300 / 'raw' / p, 'animation', readiness='native_clip', character=cid,
                  confidence=confidence, locator=f'clips/{i}', name=clip['name'], clip=clip,
                  timing='native frames; FPS unspecified',
                  key_data=str(GAMES / m['animation_binary']) if m.get('animation_binary') else None)
    for r in load(r300 / 'indexes/audio-playable.jsonl', True):
        match = re.match(r'^(\d+)(?:_|\.|$)', Path(r['source_bank']).name)
        cid = f"300heroes:{int(match[1])}" if '/hero/' in r['source_bank'] and match and int(match[1]) in roster else None
        asset('300heroes', r300 / r['path'], 'audio', readiness='playable', character=cid,
              confidence='numeric_prefix_candidate', source_record=r)

    # MBA: definition-to-model mapping, including missing models, never invented from the roster.
    mba = ROOTS['mba']
    mba_roster = {r['id']: r for r in load(GAMES / 'magical-battle-arena-roster.json')['characters']}
    definition_roster = {'Chara01':'nanoha', 'Chara01_O':'ruru', 'Chara02':'lina', 'Chara02_O':'nowel',
                        'Chara03':'sakura', 'Chara04_01':'fate', 'Chara04_02':'fate', 'Chara05':'kirara',
                        'Chara06':'sarara', 'Chara07_01':'kukuri', 'Chara07_02':'kukuri', 'Chara08':'naga',
                        'Chara09':'gajet', 'Chara10':'hayate', 'Chara11':'vita', 'Chara12_01':'nanohasts',
                        'Chara12_02':'nanohasts', 'Chara13':'lsama', 'Chara14':'oyaji',
                        'Chara15_01':'fatests', 'Chara15_02':'fatests'}
    mba_owners = {}
    mc = load(mba / 'character-candidates.json')
    for c in mc:
        key = Path(c['definition']).stem; r = mba_roster[definition_roster[key]]
        present = (mba / 'raw' / c['native_model']).is_file()
        cid = char('mba', key, r['name_zh'], r['series'], [c['name'], r['name_ja'], r['id']],
                   source_index=str(mba / 'character-candidates.json'), definition=str(mba / 'raw' / c['definition']),
                   base_model=str(mba / 'raw' / c['native_model']), base_model_present=present,
                   glb=str(mba / c['glb']) if c['glb'] else None, animation_clips=c['animations'],
                   readiness='glb_candidate' if c['glb'] else ('native_model_conversion_failed' if present else 'definition_only_missing_model'))
        mba_owners[c['native_model'].casefold()] = cid
        asset('mba', mba / 'raw' / c['definition'], 'metadata', character=cid, confidence='character_definition')
        if not present:
            asset('mba', mba / 'raw' / c['native_model'], 'model', character=cid,
                  readiness='missing', confidence='character_definition')
    for r in load(mba / 'asset-index.jsonl', True):
        asset('mba', mba / 'raw' / r['path'], character=mba_owners.get(r['path'].casefold()),
              readiness='playable' if category(r['path']) == 'audio' else 'native',
              confidence='character_definition', source_record=r)
    for m in load(mba / 'models/model-index.jsonl', True):
        cid = mba_owners.get(m['source'].casefold())
        if m.get('status') != 'converted':
            continue
        asset('mba', mba / m['glb'], 'model', readiness='glb_candidate', character=cid,
              confidence='character_definition', model=m)
        for i, clip in enumerate(m.get('animations', [])):
            asset('mba', mba / m['glb'], 'animation', readiness='glb_clip', character=cid,
                  confidence='character_definition', locator=f'animations/{i}', name=clip['name'], clip=clip)

    # LoL: preserve all conversion stages and clip-level access.
    lol = ROOTS['lol']
    preview = load(lol / 'forge-preview/summary.json')
    selection = load(lol / 'clip-selection.json')
    for c in preview['captures']:
        char('lol', c['id'], c['name'], '英雄聯盟 League of Legends', [c['id'], c['modelKey']],
             full_model=str(lol / 'converted' / (c['id'] + '.glb')),
             preferred_model=str(lol / 'ggd-runtime-candidate' / (c['id'] + '.glb')),
             state_to_clip=dict(zip(selection['states'], selection['models'][c['id']])),
             source_index=str(lol / 'conversion-manifest.json'), readiness='local_ggd_preview_candidate',
             limitations=preview['limitations'])
    extraction = load(lol / 'extraction-manifest.json')
    for c in extraction['characters']:
        for f in c['files']:
            asset('lol', lol / f['file'], character='lol:' + c['champion'].lower(), source_record=f)
    for manifest, stage in [('conversion-manifest.json','full'), ('ggd-selected-manifest.json','selected'),
                            ('optimization-safe-manifest.json','optimized_safe'), ('ggd-optimized-manifest.json','optimized'),
                            ('ggd-runtime-candidate-manifest.json','runtime_candidate')]:
        for m in load(lol / manifest)['models']:
            cid = 'lol:' + m['character']
            asset('lol', lol / m['file'], 'model', readiness='glb_candidate', character=cid, stage=stage,
                  manifest=str(lol / manifest), source_record=m)
            # Read the actual GLB JSON, not differing per-stage manifest animation schemas.
            with (lol / m['file']).open('rb') as f:
                header = f.read(20)
                assert header[:4] == b'glTF' and header[16:20] == b'JSON'
                gltf = json.loads(f.read(int.from_bytes(header[12:16], 'little')))
            for i, clip in enumerate(gltf.get('animations', [])):
                asset('lol', lol / m['file'], 'animation', readiness='glb_clip', character=cid, stage=stage,
                      locator=f'animations/{i}', name=clip.get('name', str(i)), channels=len(clip['channels']))

    # Community handoff is design/configuration data with proxy art, not 37 bespoke model packs.
    community = ROOTS['community37']
    for c in load(community / 'index.json')['heroes']:
        recipe = load(community / c['recipe'])
        match = re.search(r'作品：《([^》]+)》', recipe['identity'])
        cid = char('community37', c['index'], c['name'], match[1] if match else recipe['identity'],
                   [c['projectId']], readiness='design_with_proxy_assets',
                   project=str(community / c['project']), recipe=str(community / c['recipe']),
                   presentation=recipe['presentation'])
        for key, kind in [('project','hero_project'), ('recipe','recipe'), ('previewPackage','preview_package')]:
            asset('community37', community / c[key], kind, character=cid, readiness='offline_preview')
        for i, slot in enumerate(recipe['slots']):
            if slot.get('vfx', {}).get('script'):
                asset('community37', community / c['recipe'], 'vfx', character=cid,
                      readiness='ggd_script_proxy', locator=f'/slots/{i}/vfx/script',
                      name=f"{c['name']} {slot['slot']} {slot['name']}", script_id=slot['vfx']['script']['id'])

    # Name matches are suggestions only; never conflate IDs or silently replace a model.
    def names(c):
        result = set()
        for alias in [c['name'], *c['aliases']]:
            for a in re.split('[／/；;]', alias):
                a = re.sub(r'[（(].*?[）)]', '', a).strip()
                if len(a) > 1 and not a.isdigit(): result.add(norm(a))
        return result
    crosswalk = []
    for c in chars:
        if c['library'] != 'community37': continue
        matches = []
        for other in chars:
            if other['library'] == 'community37': continue
            common = names(c) & names(other)
            if common:
                matches.append(dict(character_id=other['id'], name=other['name'], origin=other['origin'],
                                    matched_aliases=sorted(common), readiness=other['readiness'],
                                    confidence='name_match_candidate_not_identity_proof'))
        crosswalk.append(dict(character_id=c['id'], name=c['name'], candidates=matches,
                              unmatched_note=None if matches else 'No exact normalized alias match; query manually by work/name.'))
    write(HERE / 'characters.json', chars)
    write(HERE / 'community-crosswalk.json', crosswalk)
    stats = {}
    for lib in ROOTS:
        stats[lib] = dict(character_entries=sum(c['library'] == lib for c in chars),
                         indexed_records=db.execute('SELECT count(*) FROM assets WHERE library=?', (lib,)).fetchone()[0],
                         kinds=dict(db.execute('SELECT kind,count(*) FROM assets WHERE library=? GROUP BY kind', (lib,))),
                         missing_paths=len({m['path'] for m in missing if m['library'] == lib}))
    db.commit()
    assert not db.execute('SELECT character_id FROM links LEFT JOIN characters ON links.character_id=characters.id WHERE characters.id IS NULL').fetchall()
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    db.close()
    tmp.replace(HERE / 'catalog.sqlite')
    issues = dict(missing_paths=missing,
                  mba_missing_character_models=[c for c in chars if c['readiness'] == 'definition_only_missing_model'],
                  mba_conversion_failures=[m for m in load(mba / 'models/model-index.jsonl', True) if m.get('status') != 'converted'],
                  notes=['300 Heroes: 4 undecoded audio payloads; 4 OBJ conversion issues; 3236 unresolved material references.',
                         f"MBA: {len(mc)} definitions, {sum(bool(c['glb']) for c in mc)} matched main models. 1.70 not acquired.",
                         'Character VFX/audio links are incomplete; use global path search. No result is not proof of absence.'])
    write(HERE / 'issues.json', issues)
    libraries = []
    for lib, title, version, entry, scope in [
        ('300heroes','300 英雄','202609021','../ASSET_LIBRARY.md','native assets and static OBJ; native skeletal animation data'),
        ('mba','魔法少女武鬥祭',load(mba / 'library-summary.json')['version'],'ASSET_LIBRARY.md','native assets and GLB; model presence tracked per character'),
        ('lol','LoL 七位角色','local snapshot 20260907','README-local-preview.md','seven bodies, textures and animations; original VFX/audio not extracted'),
        ('community37','37 名社群英雄工作流','20260907','README.md','designs and 185 VFX scripts using GGD proxy assets')]:
        libraries.append(dict(id=lib, title=title, version=version, root=str(ROOTS[lib]),
                              entry=str((ROOTS[lib] / entry).resolve()), scope=scope, **stats[lib]))
    fingerprints = [dict(path=str(p), bytes=p.stat().st_size, sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in sorted(inputs)]
    write(HERE / 'catalog.json', dict(schema='ggd-local-asset-registry@1', generated_at=datetime.now().astimezone().isoformat(),
                                    database=str(HERE / 'catalog.sqlite'), query_tool=str(HERE / 'query.py'),
                                    libraries=libraries, source_indexes=fingerprints,
                                    counting_note='Asset rows include native files, derivatives, and embedded clip/script locators; do not sum as unique models or characters.'))
    write(HERE / 'validation.json', dict(sqlite_integrity='ok', all_indexed_paths_checked=True,
                                        unique_missing_paths=sorted({m['path'] for m in missing}), stats=stats,
                                        evidence_scope='File existence and index integrity; no new visual/runtime or content hash audit.'))
    print(json.dumps(stats, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
