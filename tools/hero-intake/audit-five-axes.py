"""📋 五個軸逐支量：模組 · 骨架 · 動作 · 音效 · 語音（＋角色對白）。

owner 2026-09-11：「請你列表告訴我 **哪些角色 缺模組 骨架 動作 音效 語音**」

⭐ 全部從 repo 量出來，⛔ 不引用任何既有報告。⚠️ 三個**容易誤讀**的地方寫在各軸旁邊：
  · 🔊 音效「通用」⛔ **不是無聲** —— `combatSfx.ts` 的解析鏈會退到元素風聲
  · 🎙 語音「借用」⛔ **不是缺** —— `MANIFEST.formShares` 是變身態的播放期借用
  · 🧍 模組「共用」⛔ **不一定是缺** —— 同一角色的本體↔變身共用是正常的

```sh
python3 tools/hero-intake/audit-five-axes.py            # 印統計，明細寫到 /private/tmp/audit5.json
```
"""
import collections, json, pathlib, struct, subprocess, sys

ROOT = pathlib.Path('.').resolve(); C = ROOT/'content'
jl = lambda p: json.loads(pathlib.Path(p).read_text(encoding='utf-8'))

tracked = {p[len('content/'):] for p in subprocess.run(
    ['git','ls-files','content/assets/models'], capture_output=True, text=True).stdout.split('\n') if p}
models = {}
for f in (C/'models').glob('*.json'):
    if f.name.startswith('_'): continue
    d = jl(f)
    if d.get('id'): models[d['id']] = d

# ⭐ 直接讀 glb 的 JSON chunk：skins（骨架）與 animations（動作）——⛔ 不看檔名猜
glb_cache = {}
def glb_info(rel):
    if rel in glb_cache: return glb_cache[rel]
    p = C/rel; out = {'ok': False}
    if p.exists():
        with p.open('rb') as fh:
            hdr = fh.read(20)
            if len(hdr) == 20 and hdr[:4] == b'glTF':
                ln = struct.unpack('<I', hdr[12:16])[0]
                try:
                    j = json.loads(fh.read(ln))
                    out = {'ok': True, 'skins': len(j.get('skins') or []),
                           'anims': [a.get('name','') for a in (j.get('animations') or [])],
                           'joints': sum(len(s.get('joints') or []) for s in (j.get('skins') or [])),
                           'meshes': len(j.get('meshes') or [])}
                except Exception as ex: out = {'ok': False, 'err': str(ex)[:60]}
    glb_cache[rel] = out
    return out

CLIPS = ['idle','run','attack','cast','hurt','death']
manifest = jl(C/'assets/audio/voices/champions/MANIFEST.json')
REQUIRED = (jl(C/'assets/audio/voices/lines/CATEGORIES.json').get('shipGate') or {}).get('required') or []
FORM_SHARE = {x['championId']: x['sharedFrom'] for x in (manifest.get('formShares') or [])}
quotes = jl(C/'assets/audio/voices/quotes/quotes.json')
unsourced = {u['id'] for u in quotes['unsourced']}
sfx_cues = set(jl(C/'audio-manifests/ability-sfx-cues.json').get('cues') or {})

share = collections.defaultdict(list)
rows = []
champs = {f.stem: jl(f) for f in sorted((C/'champions').glob('*.json')) if not f.name.startswith('_')}
for hid, c in champs.items():
    if c.get('modelKey'): share[c['modelKey']].append(hid)

for hid, c in champs.items():
    k = c.get('modelKey'); d = models.get(k) or {}
    glb = d.get('glbPath')
    # ① 模組
    if not k or not d: model = ('⛔ 缺', 'modelKey 指不到 model 文件')
    elif not glb:      model = ('⛔ 缺', 'model 文件沒有 glbPath')
    elif glb not in tracked: model = ('⛔ 缺', 'GLB 不在版控 ⇒ 玩家看到體素替身')
    elif len(share[k]) > 1:  model = ('⚠️ 共用', f"與 {len([x for x in share[k] if x!=hid])} 位共用同一顆")
    else: model = ('✓', '')
    info = glb_info(glb) if glb and glb in tracked else {'ok': False}
    # ② 骨架
    if not info.get('ok'): rig = ('—', '沒有模組就談不上骨架')
    elif info['skins'] == 0: rig = ('⛔ 缺', '這顆 glb **沒有 skin／joints** ⇒ 只能整體位移，⛔ 不能做動作')
    else: rig = ('✓', f"{info['skins']} 個 skin・{info['joints']} 根骨")
    # ③ 動作
    cm = d.get('clipMap') or {}
    missing = [x for x in CLIPS if not cm.get(x)]
    if not info.get('ok'): anim = ('—', '')
    elif not cm: anim = ('⛔ 缺', f"model 文件沒有 clipMap（glb 內有 {len(info['anims'])} 段動畫）")
    elif missing: anim = ('⚠️ 缺格', '缺 ' + '／'.join(missing))
    else: anim = ('✓', f"六格齊・glb 內 {len(info['anims'])} 段")
    # ④ 音效：每一支技能要有 sfxKey
    ab = c.get('abilities') or {}
    slots = list(ab.items()) if isinstance(ab, dict) else [(str(i), x) for i, x in enumerate(ab)]
    for extra, nm in ((c.get('exAbility'), 'EX'), (c.get('passiveAbility'), '天生')):
        if isinstance(extra, dict): slots.append((nm, extra))
    nosfx = [s for s, a in slots if isinstance(a, dict) and not a.get('sfxKey')]
    bad  = [s for s, a in slots if isinstance(a, dict) and a.get('sfxKey') and a['sfxKey'] not in sfx_cues]
    # ⭐⭐ 「沒有 sfxKey」⛔ 不等於「無聲」：`combatSfx.ts:690` 的解析鏈是
    #    覆蓋層 → 技能自己的 cue → **元素風聲** → 通用施法音 ⇒ 一定有聲音。
    #    ⇒ 這一軸量的是「有沒有**原作專屬**音效」，⛔ 不是「有沒有聲音」。
    if not slots: sfx = ('—', '沒有技能')
    elif len(nosfx) == len(slots): sfx = ('· 通用', f"{len(slots)} 格都退到元素風聲（⛔ 不是無聲，只是沒有原作專屬音）")
    elif nosfx: sfx = ('⚠️ 部分', f"{len(slots)-len(nosfx)}/{len(slots)} 格有原作專屬音，其餘退元素風聲：{'／'.join(nosfx)}")
    elif bad: sfx = ('⚠️ 不在名單', '／'.join(bad))
    else: sfx = ('✓ 專屬', f"{len(slots)} 格都有原作專屬音")
    # ⑤ 語音
    ent = (manifest.get('champions') or {}).get(hid)
    lines = (ent or {}).get('lines') or {}
    have = [x for x in REQUIRED if lines.get(x)]
    miss = [x for x in REQUIRED if not lines.get(x)]
    # ⭐⭐ MANIFEST 的 `champions` 沒有它 ⛔ 不等於「沒有語音」——
    #    `formShares` 是**播放期的借用表**（owner 2026-07-26「變身前/後共用就好」）：
    #    本體與變身態是同一個角色，一份包服務兩邊。⇒ 先問借用表，⛔ 不要直接判缺。
    if ent is None and hid in FORM_SHARE:
        voice = ('✓ 借用', f"變身態・借本體 {FORM_SHARE[hid]} 的包（⭐ 播放期 fallback，⛔ 不是缺）")
    elif ent is None: voice = ('⛔ 缺', '沒有語音包，也不在變身借用表裡')
    elif miss: voice = ('⚠️ 缺格', f"出貨門檻缺 {len(miss)}/{len(REQUIRED)}：{'／'.join(miss)}")
    else: voice = ('✓', f"九格齊" + (f"・借 {ent['sharedFrom']}" if ent.get('sharedFrom') else ''))
    quote = ('⛔ 缺', '沒有角色對白（刻意留空，等你填）') if hid in unsourced else ('✓', '')
    rows.append({'id': hid, 'name': c.get('name'), 'model': model, 'rig': rig,
                 'anim': anim, 'sfx': sfx, 'voice': voice, 'quote': quote})

OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/audit5.json')
json.dump(rows, OUT.open('w'), ensure_ascii=False, indent=1)
def tally(ax):
    return collections.Counter(r[ax][0] for r in rows)
print(f"153 支逐支量完（實際 {len(rows)} 支）\n")
for ax, nm in [('model','① 模組'),('rig','② 骨架'),('anim','③ 動作'),('sfx','④ 音效'),('voice','⑤ 語音'),('quote','⑥ 角色對白')]:
    t = tally(ax)
    print(f"{nm}: " + ' · '.join(f"{k} {v}" for k, v in sorted(t.items())))
