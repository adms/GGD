#!/usr/bin/env python3
"""
ability_ledger.py — 產生 docs/_ability-fidelity-ledger.md（技能保真度三欄帳本）。

owner 2026-08-02:
> 技能完整實作 JASS 模板的個先請你給我列表，標注所有英雄技能 是否照 w3x 內建實作,
> JASS 實作, 特效完美綁定(單位model, 粒子, 球體, 蝗蟲群..) 這幾個欄位，先幫助我了解現況
> 之後也可以對照給 P1 · 模板開 vfx 欄位, P2 · 接上 6 張零採用模板 來作為進度參考使用

用法：
    python3 docs/tools/ability_ledger.py > docs/_ability-fidelity-ledger.md

⚠️ 三個判準的定義都寫在產出的檔頭裡，不在這裡 —— 因為讀帳本的人才是需要看到判準的人。
⚠️ 「JASS 簽章對照表」（SIG）是**人定義的**，不是資料自帶的：出貨的 ability doc 裡
   零個 provenance 欄位。換一組定義數字就會變，所以它必須是可見、可質疑的。
"""
import re, json, csv, io, collections, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = lambda *a: os.path.join(ROOT, *a)

B = json.load(open(p('content/bundle.json'), encoding='utf8'))
C = B['collections']
d = lambda c: [e['doc'] for e in C.get(c, {}).get('entries', [])]
abilities = {a['id']: a for a in d('abilities')}
champs = {c['id']: c for c in d('champions')}
tpls = {t['id']: t for t in d('ability-templates')}

RX = r'"(godie-[a-z0-9]+\.[a-z0-9]+)"\s*:'
hard = set(re.findall(RX, open(p('apps/client/src/render/vfx/w3xAbilityArt.ts'), encoding='utf8').read()))
fam = set(re.findall(RX, open(p('apps/client/src/render/vfx/w3xFamilyArt.ts'), encoding='utf8').read()))

rows = list(csv.DictReader(io.StringIO(open(p('docs/ability-templates.csv'), encoding='utf-8-sig').read())))
csvby = {}
for r in rows:
    for aid in (r.get('實例ID') or '').split(';'):
        aid = aid.strip()
        if aid:
            csvby[aid] = r

star = set(re.findall(r'"(godie-[a-z0-9]+)"', open(p('apps/platform/internal/curation/starter.go'), encoding='utf8').read()))

# 每個 JASS 行為分類「做出來了」的簽章 effect kind。見檔頭的 ⚠️。
SIG = {
    '召喚代理': {'summon'}, '變身強化': {'championForm'},
    '衝鋒推撞': {'dash', 'knockback'}, '攻擊觸發': {'__hooks'}, '受擊反應': {'__hooks'},
    '瞬發點爆': {'damageArea', 'damage'}, '單體斬擊': {'damage'},
    '行進波動': {'spawnProjectile', 'damageLine'}, '原地震波': {'damageArea'},
    '週期領域': {'dot'}, '跳躍落地': {'leap'}, '瞬移突斬': {'dash'},
    '拉扯投擲': {'knockback'}, '死亡機制': {'revive'},
    '資源運營': {'grantGold', 'restore'}, '引導通魔': {'dot', 'damage'},
    '成長蓄能': {'grantAttribute', 'applyBuff'},
}
# 匯入器留下的 placeholder 傷害指紋（#78 點名的）。
PLACEHOLDER = {(80, 120, 160, 200), (80, 120, 160, 200, 240), (80, 120, 160)}


def kinds(a):
    """這支技能**實際會產生**的 effect kind —— 含模板展開。

    ⚠️ 只讀 `a['effects']` 會把 143 支綁模板的技能全部誤判成「沒有效果」，
    因為轉換之後它們的 effects 是 `[]`，行為由展開產生（失敗形態 ⑦）。
    """
    out = set()

    def w(n):
        if isinstance(n, list):
            for x in n:
                w(x)
        elif isinstance(n, dict):
            k = n.get('kind')
            if isinstance(k, str):
                out.add(k)
            for v in n.values():
                w(v)

    w(a.get('effects') or [])
    t = a.get('template')
    if isinstance(t, dict):
        refs = [t['ref']] if 'ref' in t else [c.get('ref') for c in (t.get('cards') or [])]
        for rf in refs:
            if rf and rf in tpls:
                w(tpls[rf])
            if rf and ('on-attack' in rf or 'on-hit' in rf):
                out.add('__hooks')
    pas = a.get('passive')
    if pas:
        out.add('__passive')
        if pas.get('hooks'):
            out.add('__hooks')
    return out


def col_w3x(a, r):
    if not r or not (r.get('rawcode') or '').strip():
        return ('—', '無 w3x 對照')
    ph = False

    def w(n):
        nonlocal ph
        if isinstance(n, list):
            for x in n:
                w(x)
        elif isinstance(n, dict):
            am = n.get('amount')
            if isinstance(am, dict) and tuple(am.get('perRank') or []) in PLACEHOLDER:
                ph = True
            for v in n.values():
                w(v)

    w(a.get('effects') or [])
    return ('⚠', '匯入器 placeholder 數值') if ph else ('✔', f"rawcode {r['rawcode']}")


def col_jass(a, r):
    if not r:
        return ('—', '不在對照表')
    cl = (r.get('JASS行為模板') or '').strip()
    if cl in ('物件資料技能(無觸發)', ''):
        return ('—', '無 JASS 觸發')
    if cl == '純演出/物件資料':
        return ('—', '純演出')
    sig = SIG.get(cl)
    if not sig:
        return ('?', f'{cl}（無可測簽章）')
    return ('✔', cl) if (kinds(a) & sig) else ('✘', cl)


def col_vfx(a):
    aid, k, layers = a['id'], a.get('vfxKey'), a.get('vfxLayers')
    if aid in hard:
        return ('✔', '硬表晉升→原作 emitter')
    if aid in fam:
        return ('◐', '家族晉升→原型')
    if layers:
        return ('✔', f'{len(layers)} 層自訂')
    if not k:
        return ('✘', '無 vfxKey')
    if k.startswith('fx.prim.'):
        return ('△', '程序原語（通用）')
    if k.startswith('fx.w3x.') or k.startswith('godie-'):
        return ('✔', '原作 emitter')
    return ('◐', k)


SLOT = ['passive', 'q', 'w', 'e', 'r', 'ex']
SLOTLBL = {'passive': '天生', 'q': 'Q', 'w': 'W', 'e': 'E', 'r': 'R', 'ex': 'EX'}

recs = []
for aid, a in abilities.items():
    cid = aid.split('.')[0]
    r = csvby.get(aid)
    recs.append(dict(cid=cid, hero=(champs.get(cid) or {}).get('name', cid), aid=aid,
                     slot=aid.split('.')[-1], name=a.get('name', ''), star=cid in star,
                     w3x=col_w3x(a, r), jass=col_jass(a, r), vfx=col_vfx(a)))
recs.sort(key=lambda x: (not x['star'], x['hero'], SLOT.index(x['slot']) if x['slot'] in SLOT else 9))

if __name__ == '__main__':
    tal = lambda k, only=False: collections.Counter(
        r[k][0] for r in recs if (r['star'] or not only))
    W = sys.stdout.write
    W(open(p('docs/tools/ability_ledger.header.md'), encoding='utf8').read())
    W('## 總覽\n\n| 欄位 | ✔ | ◐ / ⚠ | △ / ✘ | ? | — |\n|---|---|---|---|---|---|\n')
    for only, head in ((False, '**'), ):
        a, b, c = tal('w3x'), tal('jass'), tal('vfx')
        W(f"| **w3x 內建對照** | {a['✔']} | ⚠ {a['⚠']} | — | — | {a['—']} |\n")
        W(f"| **JASS 實作** | {b['✔']} | — | ✘ {b['✘']} | {b['?']} | {b['—']} |\n")
        W(f"| **特效綁定** | {c['✔']} | ◐ {c['◐']} | △ {c['△']} / ✘ {c['✘']} | — | — |\n")
    W(f"\n技能總數 **{len(recs)}** 支 · 53 隻出貨名單內 **{sum(1 for r in recs if r['star'])}** 支。\n\n")
    W('### 只看 53 隻出貨名單（玩家真的會碰到的）\n\n| 欄位 | ✔ | ◐ / ⚠ | △ / ✘ | ? | — |\n|---|---|---|---|---|---|\n')
    a, b, c = tal('w3x', True), tal('jass', True), tal('vfx', True)
    W(f"| w3x 內建對照 | {a['✔']} | ⚠ {a['⚠']} | — | — | {a['—']} |\n")
    W(f"| JASS 實作 | {b['✔']} | — | ✘ {b['✘']} | {b['?']} | {b['—']} |\n")
    W(f"| 特效綁定 | {c['✔']} | ◐ {c['◐']} | △ {c['△']} / ✘ {c['✘']} | — | — |\n")
    bb = tal('jass')
    W(f"\n**JASS 實作率 = {bb['✔']} / {bb['✔'] + bb['✘']} = "
      f"{100 * bb['✔'] / max(1, bb['✔'] + bb['✘']):.1f}%**（分母＝有可測簽章的技能）\n\n")
    W('### JASS 缺口按分類（`✘` 由多到少）\n\n| 分類 | ✘ 未實作 | ✔ 已實作 |\n|---|---|---|\n')
    byc = collections.defaultdict(lambda: [0, 0])
    for r in recs:
        m, cl = r['jass']
        if m == '✘':
            byc[cl][0] += 1
        elif m == '✔':
            byc[cl][1] += 1
    for cl, (bad, good) in sorted(byc.items(), key=lambda kv: -kv[1][0]):
        W(f"| {cl} | **{bad}** | {good} |\n")
    W('\n---\n\n## 逐支明細\n\n**★ = 53 隻出貨名單。**未上架的排在後面。\n')
    cur = None
    for r in recs:
        if r['cid'] != cur:
            cur = r['cid']
            W(f"\n### {'★ ' if r['star'] else ''}{r['hero']} `{r['cid']}`\n\n")
            W('| 槽 | 技能 | w3x | JASS | 特效 |\n|---|---|---|---|---|\n')
        nm = (r['name'] or r['aid']).replace('|', '\\|')
        W(f"| {SLOTLBL.get(r['slot'], r['slot'])} | {nm} | {r['w3x'][0]} | "
          f"{r['jass'][0]} <sub>{r['jass'][1]}</sub> | {r['vfx'][0]} <sub>{r['vfx'][1]}</sub> |\n")
    W(open(p('docs/tools/ability_ledger.footer.md'), encoding='utf8').read())
