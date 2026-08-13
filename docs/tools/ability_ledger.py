#!/usr/bin/env python3
"""
ability_ledger.py — 產生技能保真度帳本。兩種輸出，一份記憶體資料。

owner 2026-08-02:
> 技能完整實作 JASS 模板的個先請你給我列表，標注所有英雄技能 是否照 w3x 內建實作,
> JASS 實作, 特效完美綁定(單位model, 粒子, 球體, 蝗蟲群..) 這幾個欄位，先幫助我了解現況
> 之後也可以對照給 P1 · 模板開 vfx 欄位, P2 · 接上 6 張零採用模板 來作為進度參考使用

用法：
    python3 docs/tools/ability_ledger.py > docs/legacy/_ability-fidelity-ledger.md   # md（預設）
    python3 docs/tools/ability_ledger.py --json                               # 寫 JSON 檔
    python3 docs/tools/ability_ledger.py --json --md > docs/legacy/_ability-fidelity-ledger.md

⚠️ md 與 JSON **走同一份 `build_ledger()` 的結果**，不各自重算 —— 兩條路徑重算會分岔，
   而分岔的那一刻沒有人會發現（失敗形態 ⑤：被測的不是出貨的那個）。

⚠️ 三個判準的定義都寫在產出的檔頭裡，不在這裡 —— 因為讀帳本的人才是需要看到判準的人。
⚠️ 「JASS 簽章對照表」（SIG）是**人定義的**，不是資料自帶的：出貨的 ability doc 裡
   零個 provenance 欄位。換一組定義數字就會變，所以它必須是可見、可質疑的。

決定性（規格 7.3）：所有 dict 依 key 排序、浮點走 Python repr（最短往返，跨執行相同）、
`abilities` 陣列的順序是固定的排序鍵。唯二會變的是 `generatedAt` 與 `generatorFingerprint`。
把 `GGD_LEDGER_NOW` 設成一個 ISO8601 字串可以把時間戳釘住，讓「跑兩次 `cmp` 相同」
真的可以直接驗（守衛要跑得動，才叫守衛）。
"""
import re, json, csv, io, collections, sys, os, hashlib, datetime

GENERATOR_VERSION = 'ledger@4'

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = lambda *a: os.path.join(ROOT, *a)

# ⭐ 2026-08-13：帳本本體已歸檔到 docs/legacy/（owner「舊規格搬 legacy」）。
#    ⛔ 輸出路徑必須跟著走 —— 留在 docs/ 第一層的話，這支腳本下次一跑就把
#    一份**沒有過期標頭**的帳本再生回現役目錄，並撞上 legacySpecQuarantine 閘。
JSON_OUT = p('docs/legacy/_ability-fidelity-ledger.json')

W3X_ABILITY_ART_TS = p('apps/client/src/render/vfx/w3xAbilityArt.ts')
W3X_FAMILY_ART_TS = p('apps/client/src/render/vfx/w3xFamilyArt.ts')
W3X_ART_FAMILIES_TS = p('apps/client/src/render/vfx/w3xArtFamilies.ts')
ART_PARAMS_TS = p('apps/client/src/render/vfx/artParams.ts')

B = json.load(open(p('content/bundle.json'), encoding='utf8'))
C = B['collections']
CONTENT_VERSION = B.get('contentVersion', 'cv_unknown')
d = lambda c: [e['doc'] for e in C.get(c, {}).get('entries', [])]
abilities = {a['id']: a for a in d('abilities')}
champs = {c['id']: c for c in d('champions')}
tpls = {t['id']: t for t in d('ability-templates')}

RX = r'"(godie-[a-z0-9]+\.[a-z0-9]+)"\s*:'
hard = set(re.findall(RX, open(W3X_ABILITY_ART_TS, encoding='utf8').read()))
fam = set(re.findall(RX, open(W3X_FAMILY_ART_TS, encoding='utf8').read()))

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

# 技能名稱前綴的 w3x 編號 —— JASS 的 join key，不可浮動（規格 §1.3）。
W3X_NUMBER_RE = re.compile(r'^(\d{2}-\d{2,3})(?=\s|$)')


def kinds(a):
    """這支技能**寫在文件裡**的 effect kind。

    ⛔ 這裡**不含模板展開**。曾經有一段註解說它含，那是假的（第三守則）：
    模板文件裡沒有任何 `kind` 欄位，只有 param slot 宣告，所以走模板的那 143 支
    在這裡一律得到空集合。真正的展開器是 TypeScript 的
    `packages/shared/src/content/templates/expand.ts`（`FAMILIES` 那張表），
    這支 Python 產生器跑不到它。

    所以 JSON 帶 `effectKindsComplete: false` 把這件事講出來，而不是讓下游
    把空集合讀成「這支技能什麼都不做」（失敗形態 ⑦：掃屬性代替掃行為）。
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


def vfx_authority(a):
    """誰說了算：內容 / 硬綁表 / 族群表。⚠️ 後兩者在執行期改寫 vfxKey，
    也就是**編輯器改了不會生效**的那 270 支（硬表 34 + 族群 236，實測 2026-08-03）。
    `hard` 與 `fam` 是解析 w3xAbilityArt.ts 與 w3xFamilyArt.ts 得到的。"""
    aid = a['id']
    if aid in hard:
        return 'w3xAbilityArt'
    if aid in fam:
        return 'w3xFamilyArt'
    return 'content'


def is_passive_only(a):
    """⚠️ 不可以用 slot 判斷（owner 2026-08-03：「天生技 也有可能是主動技喔」——
    實測 114/114 的天生技槽都有主動特徵）。出貨路徑用的判準是
    apps/client/src/vfx/telegraphShape.ts 的 `def.passive !== undefined &&
    def.effects.length === 0`，而 `effects` 必須是**展開後**的（143 支綁模板的
    原始檔是 []）—— 這裡用「有沒有 castType / 冷卻 / 模板」當展開的代理判準。"""
    if a.get('passive') is None:
        return False
    if a.get('effects'):
        return False
    if a.get('template'):
        return False           # 綁了模板 ⇒ 展開後有效果 ⇒ 不是純被動
    ct = a.get('castType')
    if ct and ct not in ('none', 'passive'):
        return False
    cd = a.get('cooldown')
    if cd and any(x for x in (cd if isinstance(cd, list) else [cd])):
        return False
    return True


SLOT = ['passive', 'q', 'w', 'e', 'r', 'ex']
SLOTLBL = {'passive': '天生', 'q': 'Q', 'w': 'W', 'e': 'E', 'r': 'R', 'ex': 'EX'}


def _tplrefs(a):
    """這一支綁了哪幾張模板卡。單張與多張(stack)兩種寫法都要吃。"""
    t = a.get('template')
    if not t:
        return []
    if isinstance(t, dict):
        if 'cards' in t:
            return [c.get('ref', '') for c in (t.get('cards') or [])]
        return [t.get('ref', '')] if t.get('ref') else []
    return []


def _tplcards(a):
    """[(ref, params), …]，順序照文件。"""
    t = a.get('template')
    if not isinstance(t, dict):
        return []
    if 'cards' in t:
        return [(c.get('ref', ''), c.get('params') or {}) for c in (t.get('cards') or [])]
    return [(t['ref'], t.get('params') or {})] if t.get('ref') else []


def _cell(txt):
    """把任意文字塞進 markdown 表格的一格:換行變 <br>,豎線跳脫。"""
    return (txt or '').replace('|', '\\|').replace('\r', '').replace('\n', '<br>')


def _effects_source(a):
    has_inline = bool(a.get('effects'))
    has_tpl = bool(_tplrefs(a))
    if has_inline and has_tpl:
        return 'both'
    if has_tpl:
        return 'template'
    if has_inline:
        return 'inline'
    return 'none'


# ---------------------------------------------------------------------------
# 缺口 1a · 模板表（33 份）—— 型別/上下界一律從模板文件本身讀，沒宣告就說沒宣告
# ---------------------------------------------------------------------------

UNIT_LBL = {'wc3u': 'WC3 平面長度（展開時換算成 GGD 單位）',
            'wc3h': 'WC3 飛行高度（走另一條換算，垂直軸由鏡頭決定）',
            's': '秒', 'count': '次數／個數', 'ratio': '比例（0–1）'}


def _param_note(slot):
    """一句「它影響什麼」。**只由模板文件宣告過的欄位組出來，不編。**

    模板文件目前沒有 per-param 的說明欄位（`zParamSlot` 只有 type/default/min/max/
    unit/values/optional/inert），所以這裡能給的就是這些事實的組合。真正的人話說明
    是一個內容缺口，記在帳本的模板節開頭，不在這裡假裝已經有了。
    """
    bits = []
    if slot.get('inert'):
        bits.append('⛔ **本版不生效**：' + slot['inert'])
    u = slot.get('unit')
    if u:
        bits.append('單位＝' + UNIT_LBL.get(u, u))
    if slot.get('type') == 'enum' and slot.get('values'):
        bits.append('可選：' + ' / '.join(f'`{v}`' for v in slot['values']))
    if slot.get('optional'):
        bits.append('可省略（省略＝沿用預設或整段丟掉，**空白 ≠ false**）')
    if not bits:
        bits.append('模板未宣告說明')
    return '；'.join(bits)


def _bounds_text(slot):
    lo, hi = slot.get('min'), slot.get('max')
    if lo is None and hi is None:
        return '模板未宣告'
    if lo is None:
        return f'≤ {hi}（下界模板未宣告）'
    if hi is None:
        return f'≥ {lo}（**上界模板未宣告** ⚠️）'
    return f'{lo} – {hi}'


def build_templates(bound_by_ref):
    out = []
    for tid in sorted(tpls):
        t = tpls[tid]
        params = []
        for key, slot in t.get('params', {}).items():     # 文件的 slot 順序 = 表單順序
            e = {'key': key, 'type': slot.get('type'), 'note': _param_note(slot)}
            if 'default' in slot:
                e['default'] = slot['default']
            if 'min' in slot:
                e['min'] = slot['min']
            if 'max' in slot:
                e['max'] = slot['max']
            if 'unit' in slot:
                e['unit'] = slot['unit']
            if 'values' in slot:
                e['values'] = slot['values']
            if slot.get('optional'):
                e['optional'] = True
            if slot.get('inert'):
                e['inert'] = slot['inert']
            e['boundsDeclared'] = ('min' in slot) or ('max' in slot)
            params.append(e)
        out.append({
            'ref': tid,
            'name': t.get('name', ''),
            'family': t.get('family', ''),
            'status': t.get('status', ''),
            'gapScore': t.get('gapScore'),
            'requires': list(t.get('requires') or []),
            'exemplar': t.get('exemplar') or {},
            'summary': t.get('description', ''),
            'params': params,
            'boundAbilityIds': sorted(bound_by_ref.get(tid, [])),
            'boundCount': len(bound_by_ref.get(tid, [])),
        })
    return out


# ---------------------------------------------------------------------------
# 缺口 1b · vfx 族 —— 解析兩支 TS 常數表
# ---------------------------------------------------------------------------

FAMILY_ROW_RE = re.compile(r'"(godie-[a-z0-9]+\.[a-z0-9]+)"\s*:\s*\{\s*family:\s*"([A-Za-z]+)"')
PROTO_RE = re.compile(
    r'^  ([A-Za-z]+): \{\n'
    r'(?:.*?\n)*?'
    r'    label: "([^"]*)",\n'
    r'(?:.*?\n)*?'
    r'    refCount: (\d+),\n'
    r'(?:.*?\n)*?'
    r'    primitive: "([^"]*)",\n'
    r'(?:.*?\n)*?'
    r'    note: "([^"]*)",\n',
    re.M)


def parse_art_params_keys():
    """`ArtParams` 的可選旋鈕 —— 一層特效實際可被覆寫的欄位（artParams.ts）。"""
    src = open(ART_PARAMS_TS, encoding='utf8').read()
    m = re.search(r'export interface ArtParams \{(.*?)\n\}', src, re.S)
    if not m:
        raise SystemExit('SANITY: artParams.ts 的 `export interface ArtParams` 解析不到')
    return sorted(set(re.findall(r'^\s*(\w+)\?:', m.group(1), re.M)))


def count_object_literal_keys(path, const_decl):
    """獨立於正規表示式的第二種解析：對匯出的物件字面值做**括號深度掃描**，
    數 depth-1 的成員個數。

    ⚠️ 這是刻意的重複工作。健全性檢查 3 要比對的是「兩種不同解析方式看同一張表
    會不會得到同一個數」—— 只用同一條 regex 數兩次是驗一個名詞，驗不出這條 regex
    哪天悄悄停止 match（部署後置條件那課：只驗名詞的檢查在相容性故障面前必然是綠的）。
    """
    src = open(path, encoding='utf8').read()
    # ⚠️ 不可以 index(name) —— 檔頭的說明註解裡就有這個名字，會找到註解裡的 `{`。
    m = re.search(r'^export const ' + re.escape(const_decl) + r'\b[^=]*=\s*', src, re.M)
    if not m:
        raise SystemExit(f'SANITY: {os.path.basename(path)} 找不到 `export const {const_decl}`')
    i = src.index('{', m.end() - 1)
    depth, n, j = 0, 0, i
    in_str = in_line_c = in_blk_c = False
    esc = False
    while j < len(src):
        ch = src[j]
        nxt = src[j + 1] if j + 1 < len(src) else ''
        if in_str:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == '"':
                in_str = False
        elif in_line_c:
            if ch == '\n':
                in_line_c = False
        elif in_blk_c:
            if ch == '*' and nxt == '/':
                in_blk_c = False
                j += 1
        elif ch == '/' and nxt == '/':
            in_line_c = True
            j += 1
        elif ch == '/' and nxt == '*':
            in_blk_c = True
            j += 1
        elif ch == '"':
            in_str = True
        elif ch in '{[':
            depth += 1
        elif ch in '}]':
            depth -= 1
            if depth == 0:
                break
        elif ch == ':' and depth == 1:
            n += 1
        j += 1
    return n


def build_vfx_families(overridable):
    src_rows = open(W3X_FAMILY_ART_TS, encoding='utf8').read()
    by_ability = dict(FAMILY_ROW_RE.findall(src_rows))
    protos = {}
    src_proto = open(W3X_ART_FAMILIES_TS, encoding='utf8').read()
    for fid, label, refc, prim, note in PROTO_RE.findall(src_proto):
        protos.setdefault(fid, {'label': label, 'refCount': int(refc),
                                'primitive': prim, 'note': note})
    used = collections.defaultdict(list)
    for aid, fid in by_ability.items():
        if aid in abilities:
            used[fid].append(aid)
    out = []
    for fid in sorted(set(protos) | set(used)):
        pr = protos.get(fid, {})
        listed = sorted(used.get(fid, []))
        # ⚠️ 22 支同時出現在硬綁表裡，硬綁表贏（`vfx_authority` 先看 hard）。
        # 所以「這一族列了幾支」與「這一族真的說了算幾支」不是同一個數 ——
        # 兩個都要出，只給一個會讓下游把 258 與 236 對不起來。
        effective = [a for a in listed if a not in hard]
        out.append({
            'family': fid,
            'label': pr.get('label', fid),
            'primitive': pr.get('primitive', ''),
            'censusRefCount': pr.get('refCount'),
            'summary': pr.get('note', ''),
            # 陷阱 A：族群晉升在**執行期**改寫 vfxKey，內容檔說了不算。
            'authority': 'code',
            'overridableFields': list(overridable),
            'boundAbilityIds': listed,
            'boundCount': len(listed),
            'effectiveAbilityIds': effective,
            'effectiveCount': len(effective),
            'shadowedByAbilityArtCount': len(listed) - len(effective),
        })
    return out


# ---------------------------------------------------------------------------
# 一份記憶體資料 —— md 與 JSON 都讀它
# ---------------------------------------------------------------------------

def _fingerprint():
    h = hashlib.sha256()
    for f in (os.path.abspath(__file__), p('docs/tools/ability_ledger.header.md'),
              p('docs/tools/ability_ledger.footer.md'), p('docs/ability-templates.csv'),
              W3X_ABILITY_ART_TS, W3X_FAMILY_ART_TS, W3X_ART_FAMILIES_TS, ART_PARAMS_TS,
              p('apps/platform/internal/curation/starter.go')):
        h.update(open(f, 'rb').read())
    return f'{GENERATOR_VERSION}+{CONTENT_VERSION}+in_{h.hexdigest()[:12]}'


def _now():
    v = os.environ.get('GGD_LEDGER_NOW')
    if v:
        return v
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def build_ledger():
    bound_by_ref = collections.defaultdict(list)
    rows_out = []
    for aid, a in abilities.items():
        cid = aid.split('.')[0]
        slot = aid.split('.')[-1]
        r = csvby.get(aid)
        cards = _tplcards(a)
        for ref, _ in cards:
            bound_by_ref[ref].append(aid)
        merged = {}
        for _, prm in cards:
            merged.update(prm)
        nm = a.get('name', '')
        mnum = W3X_NUMBER_RE.match(nm)
        w3x, jass, vfx = col_w3x(a, r), col_jass(a, r), col_vfx(a)
        auth = vfx_authority(a)
        src = _effects_source(a)
        rows_out.append({
            'id': aid,
            'championId': cid,
            'championName': (champs.get(cid) or {}).get('name', cid),
            'star': cid in star,
            'slot': slot.upper(),
            'slotLabel': SLOTLBL.get(slot, slot),
            'name': nm,
            'w3xNumber': mnum.group(1) if mnum else None,
            'description': a.get('description') or '',
            'builtin': {'verdict': w3x[0], 'reason': w3x[1]},
            'jass': {'verdict': jass[0], 'reason': jass[1]},
            'vfx': {'verdict': vfx[0], 'reason': vfx[1]},
            'castType': a.get('castType') or None,
            'cooldown': a.get('cooldown') or None,
            'range': a.get('range'),
            'maxRank': a.get('maxRank'),
            'isPassiveOnly': is_passive_only(a),
            'template': {'refs': [c[0] for c in cards],
                         'cards': [{'ref': c[0], 'params': c[1]} for c in cards],
                         'params': merged},
            'effectKinds': sorted(k for k in kinds(a) if not k.startswith('__')),
            'effectsSource': src,
            # ⚠️ 走模板的那 143 支，這支 Python 產生器展不開（見 kinds() 的檔頭）。
            'effectKindsComplete': src in ('inline', 'none'),
            'vfxKey': a.get('vfxKey') or None,
            'vfxLayers': a.get('vfxLayers') or None,
            'vfxAuthority': auth,
            'vfxEditable': auth == 'content',
            'flags': {
                # △ = fx.prim.* 程序原語，就是通用替身
                'usesGenericPlaceholder': vfx[0] == '△',
                # ⚠ = 傷害 perRank 命中匯入器 placeholder 指紋，數值不可信
                'usesImporterPlaceholderDamage': w3x[0] == '⚠',
                # 規格 §1.4。⛔ 目前沒有偵測器 —— 一律 null，不是「沒有衝突」。
                'descriptionJassConflict': None,
            },
            'review': {'checked': False},
        })
    rows_out.sort(key=lambda x: (not x['star'], x['championName'],
                                 SLOT.index(x['slot'].lower()) if x['slot'].lower() in SLOT else 9))

    overridable = parse_art_params_keys()
    families = build_vfx_families(overridable)
    templates = build_templates(bound_by_ref)

    return {
        'id': 'ability-ledger',
        'schema': 'ability-ledger@1',
        'generatedAt': _now(),
        'generatorFingerprint': _fingerprint(),
        'contentVersion': CONTENT_VERSION,
        'counts': {'abilities': len(rows_out), 'abilityTemplates': len(templates),
                   'vfxFamilies': len(families),
                   'vfxAuthorityContent': sum(1 for r in rows_out if r['vfxAuthority'] == 'content'),
                   'vfxAuthorityW3xAbilityArt': sum(1 for r in rows_out if r['vfxAuthority'] == 'w3xAbilityArt'),
                   'vfxAuthorityW3xFamilyArt': sum(1 for r in rows_out if r['vfxAuthority'] == 'w3xFamilyArt')},
        # 誠實欄：這一版**還沒有**算出來的東西。空的推導欄位長得跟「沒有問題」一樣，
        # 所以把它寫在資料裡，介面才不會把 null 讀成「已檢查、沒衝突」。
        'notComputed': {
            'flags.descriptionJassConflict':
                '規格 §1.4 的描述↔JASS 衝突偵測器還不存在，所有列一律 null（不等於沒有衝突）。',
            'effectKinds(effectsSource=template)':
                '模板展開器是 TS 的 templates/expand.ts，這支 Python 產生器跑不到；'
                '走模板的列 effectKindsComplete=false，effectKinds 只含 inline 的部分。',
        },
        'abilities': rows_out,
        'abilityTemplates': templates,
        'vfxFamilies': families,
    }


# ---------------------------------------------------------------------------
# 健全性檢查（規格 7.4）—— 失敗回非零，不是印 warning
# ---------------------------------------------------------------------------

def sanity(L):
    errs = []

    # 1. 技能數對得上 content/abilities/ 的實際檔數
    disk = sorted(f for f in os.listdir(p('content/abilities'))
                  if f.endswith('.json') and f != '_index.json')
    if L['counts']['abilities'] != len(L['abilities']):
        errs.append(f"counts.abilities={L['counts']['abilities']} != len(abilities)={len(L['abilities'])}")
    if len(L['abilities']) != len(disk):
        errs.append(f"帳本 {len(L['abilities'])} 支 != content/abilities/ 實際 {len(disk)} 個檔"
                    f"（bundle.json 過期？跑 pnpm content:build）")
    disk_ids = {f[:-5] for f in disk}
    ledger_ids = {r['id'] for r in L['abilities']}
    if disk_ids != ledger_ids:
        only_disk = sorted(disk_ids - ledger_ids)[:5]
        only_led = sorted(ledger_ids - disk_ids)[:5]
        errs.append(f'技能 id 集合不一致：只在檔案系統 {only_disk} / 只在 bundle {only_led}')

    # 2. 每個 template ref 都能在 abilityTemplates 找到
    known = {t['ref'] for t in L['abilityTemplates']}
    for r in L['abilities']:
        for ref in r['template']['refs']:
            if ref not in known:
                errs.append(f"{r['id']} 綁到不存在的模板 `{ref}`（執行期會 throw）")

    # 3. vfxAuthority != content 的數量 == 兩張晉升表的實際筆數
    #    兩張表各用**兩種不同的解析**數一次，對不上就是有一種解析壞了。
    hard_n = count_object_literal_keys(W3X_ABILITY_ART_TS, 'W3X_ABILITY_ART')
    fam_n = count_object_literal_keys(W3X_FAMILY_ART_TS, 'W3X_FAMILY_ART')
    if hard_n != len(hard):
        errs.append(f'w3xAbilityArt.ts：深度掃描數到 {hard_n} 列，regex 數到 {len(hard)} 列')
    if fam_n != len(fam):
        errs.append(f'w3xFamilyArt.ts：深度掃描數到 {fam_n} 列，regex 數到 {len(fam)} 列')
    unknown = sorted((hard | fam) - set(abilities))
    if unknown:
        errs.append(f'晉升表指到不存在的技能：{unknown[:5]}（表改了而內容沒跟上）')
    promoted = len(hard | fam)
    coded = sum(1 for r in L['abilities'] if r['vfxAuthority'] != 'content')
    if coded != promoted:
        errs.append(f'vfxAuthority != content 的有 {coded} 支，晉升表聯集卻是 {promoted} 支')

    if errs:
        sys.stderr.write('\n'.join('❌ SANITY: ' + e for e in errs) + '\n')
        return False
    return True


# ---------------------------------------------------------------------------
# 輸出 · JSON
# ---------------------------------------------------------------------------

def write_json(L, path=JSON_OUT):
    out = {k: v for k, v in L.items() if not k.startswith('_')}
    with open(path, 'w', encoding='utf8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write('\n')
    return path


# ---------------------------------------------------------------------------
# 輸出 · markdown（**只讀 L，不重算**）
# ---------------------------------------------------------------------------

def render_md(L, W):
    recs = L['abilities']
    tal = lambda k, only=False: collections.Counter(
        r[k]['verdict'] for r in recs if (r['star'] or not only))
    W(open(p('docs/tools/ability_ledger.header.md'), encoding='utf8').read())
    W('## 總覽\n\n| 欄位 | ✔ | ◐ / ⚠ | △ / ✘ | ? | — |\n|---|---|---|---|---|---|\n')
    a, b, c = tal('builtin'), tal('jass'), tal('vfx')
    W(f"| **w3x 內建對照** | {a['✔']} | ⚠ {a['⚠']} | — | — | {a['—']} |\n")
    W(f"| **JASS 實作** | {b['✔']} | — | ✘ {b['✘']} | {b['?']} | {b['—']} |\n")
    W(f"| **特效綁定** | {c['✔']} | ◐ {c['◐']} | △ {c['△']} / ✘ {c['✘']} | — | — |\n")
    W(f"\n技能總數 **{len(recs)}** 支 · 53 隻出貨名單內 **{sum(1 for r in recs if r['star'])}** 支。\n\n")
    W('### 只看 53 隻出貨名單（玩家真的會碰到的）\n\n| 欄位 | ✔ | ◐ / ⚠ | △ / ✘ | ? | — |\n|---|---|---|---|---|---|\n')
    a, b, c = tal('builtin', True), tal('jass', True), tal('vfx', True)
    W(f"| w3x 內建對照 | {a['✔']} | ⚠ {a['⚠']} | — | — | {a['—']} |\n")
    W(f"| JASS 實作 | {b['✔']} | — | ✘ {b['✘']} | {b['?']} | {b['—']} |\n")
    W(f"| 特效綁定 | {c['✔']} | ◐ {c['◐']} | △ {c['△']} / ✘ {c['✘']} | — | — |\n")
    bb = tal('jass')
    W(f"\n**JASS 實作率 = {bb['✔']} / {bb['✔'] + bb['✘']} = "
      f"{100 * bb['✔'] / max(1, bb['✔'] + bb['✘']):.1f}%**（分母＝有可測簽章的技能）\n\n")

    cnt = L['counts']
    W('### 特效由誰說了算（`vfxAuthority`）\n\n')
    W('| 誰說了算 | 支數 | 佔比 | 編輯器能改嗎 |\n|---|---|---|---|\n')
    tot = cnt['abilities']
    for key, lbl, edit in (('vfxAuthorityContent', '`content`（內容檔）', '✅ 能'),
                           ('vfxAuthorityW3xAbilityArt', '`w3xAbilityArt`（硬綁表）', '❌ 不能'),
                           ('vfxAuthorityW3xFamilyArt', '`w3xFamilyArt`（族群表）', '❌ 不能')):
        W(f"| {lbl} | {cnt[key]} | {100 * cnt[key] / tot:.1f}% | {edit} |\n")
    coded = cnt['vfxAuthorityW3xAbilityArt'] + cnt['vfxAuthorityW3xFamilyArt']
    W(f"\n**程式決定 {coded} / {tot} = {100 * coded / tot:.1f}%** —— "
      '這些技能在 JSON 裡把 `vfxKey` 改成 A，遊戲裡照樣播 B。\n\n')

    W('### JASS 缺口按分類（`✘` 由多到少）\n\n| 分類 | ✘ 未實作 | ✔ 已實作 |\n|---|---|---|\n')
    byc = collections.defaultdict(lambda: [0, 0])
    for r in recs:
        m, cl = r['jass']['verdict'], r['jass']['reason']
        if m == '✘':
            byc[cl][0] += 1
        elif m == '✔':
            byc[cl][1] += 1
    for cl, (bad, good) in sorted(byc.items(), key=lambda kv: -kv[1][0]):
        W(f"| {cl} | **{bad}** | {good} |\n")

    render_templates_md(L, W)
    render_families_md(L, W)

    W('\n---\n\n## 逐支明細\n\n**★ = 53 隻出貨名單。**未上架的排在後面。\n')
    cur = None
    for r in recs:
        if r['championId'] != cur:
            cur = r['championId']
            W(f"\n### {'★ ' if r['star'] else ''}{r['championName']} `{r['championId']}`\n\n")
            W('| 槽 | 技能 | w3x | JASS | 特效 | 模板 | 技能描述（原文） |\n'
              '|---|---|---|---|---|---|---|\n')
        nm = (r['name'] or r['id']).replace('|', '\\|')
        tp = ' + '.join(f"`{x}`" for x in r['template']['refs']) if r['template']['refs'] else '—'
        W(f"| {r['slotLabel']} | {nm} | {r['builtin']['verdict']} | "
          f"{r['jass']['verdict']} <sub>{r['jass']['reason']}</sub> | "
          f"{r['vfx']['verdict']} <sub>{r['vfx']['reason']}</sub> | "
          f"{tp} | {_cell(r['description']) or '—'} |\n")
    W(open(p('docs/tools/ability_ledger.footer.md'), encoding='utf8').read())


def _fmt_default(v):
    if v is None:
        return '—'
    if isinstance(v, (dict, list)):
        return '`' + json.dumps(v, ensure_ascii=False, sort_keys=True) + '`'
    if isinstance(v, bool):
        return '`true`' if v else '`false`'
    return f'`{v}`'


def render_templates_md(L, W):
    ts = L['abilityTemplates']
    used = [t for t in ts if t['boundCount']]
    zero = [t for t in ts if not t['boundCount']]
    nparams = sum(len(t['params']) for t in ts)
    nobounds = sum(1 for t in ts for q in t['params']
                   if q['type'] == 'number' and not q['boundsDeclared'])
    W('\n---\n\n## 技能模板（`content/ability-templates/`，'
      f"{len(ts)} 份）\n\n")
    W('> **「目前有幾支技能綁著它」是這一節最有用的一欄** —— 它把「這台機器做得出來」與\n'
      '> 「真的有人在用」分開。\n>\n'
      '> ⚠️ **型別與上下界一律讀模板文件本身**（`zParamSlot`：`type` / `default` / `min` /\n'
      '> `max` / `unit` / `values` / `optional` / `inert`）。模板沒宣告的就寫「模板未宣告」，\n'
      '> 不編一個看起來合理的數字。\n>\n'
      '> ⚠️ **模板文件沒有 per-param 的人話說明欄位**，所以「它影響什麼」那一欄只由\n'
      '> 宣告過的事實組出來（單位、列舉值、可省略、`inert`）。給 owner 讀的一句話說明\n'
      '> 是一個**內容缺口**，要補在模板文件裡，不是補在這個產生器裡。\n>\n'
      f"> 統計：{len(ts)} 份模板 · {nparams} 個參數 slot · 其中 **{nobounds} 個數值 slot 連一個界都沒宣告**\n"
      f"> · 有人綁 **{len(used)}** 份 / 零採用 **{len(zero)}** 份。\n\n")
    W('| ref | 名稱 | 狀態 | 引擎支援度 | **綁定支數** | 它做什麼（模板文件的 description 首句） |\n'
      '|---|---|---|---|---|---|\n')
    for t in sorted(ts, key=lambda x: (-x['boundCount'], x['ref'])):
        head = (t['summary'] or '').split('。')[0]
        head = head[:80] + ('…' if len(head) > 80 else '')
        W(f"| `{t['ref']}` | {t['name']} | {t['status']} | {t['gapScore']}/10 | "
          f"**{t['boundCount']}** | {_cell(head)} |\n")

    W('\n### 逐份參數清單\n\n')
    for t in sorted(ts, key=lambda x: (-x['boundCount'], x['ref'])):
        W(f"#### `{t['ref']}` · {t['name']}　—　綁定 **{t['boundCount']}** 支"
          f"（{t['status']} · 引擎支援度 {t['gapScore']}/10）\n\n")
        W(f"{_cell(t['summary'])}\n\n")
        req = '、'.join(f'`{x}`' for x in t['requires']) or '（無）'
        ex = t['exemplar'] or {}
        W(f"- 需要的 sim 能力：{req}\n")
        W(f"- 範例來源：{ex.get('skill', '—')}（JASS `{ex.get('jass', '—')}`）\n")
        if t['boundCount']:
            ids = '、'.join(f'`{x}`' for x in t['boundAbilityIds'][:12])
            more = f'…等 {t["boundCount"]} 支' if t['boundCount'] > 12 else ''
            W(f"- 綁著它的技能：{ids}{more}\n")
        else:
            W('- 綁著它的技能：**零採用** —— 這台機器做出來了但沒有任何技能在用（P2 的目標）\n')
        W('\n| 參數 | 型別 | 上下界 | 預設 | 它影響什麼 |\n|---|---|---|---|---|\n')
        if not t['params']:
            W('| （無參數） | — | — | — | 這張卡沒有任何可填的 slot |\n')
        for q in t['params']:
            W(f"| `{q['key']}` | `{q['type']}` | {_bounds_text(q)} | "
              f"{_fmt_default(q.get('default'))} | {_cell(q['note'])} |\n")
        W('\n')


def render_families_md(L, W):
    fs = L['vfxFamilies']
    listed = sum(f['boundCount'] for f in fs)
    eff = sum(f['effectiveCount'] for f in fs)
    zero = sum(1 for f in fs if not f['boundCount'])
    ov = ' '.join(f'`{x}`' for x in (fs[0]['overridableFields'] if fs else []))
    W('\n---\n\n## vfx 族（`apps/client/src/render/vfx/w3xFamilyArt.ts`，'
      f'{len(fs)} 族 / 列了 {listed} 支）\n\n')
    W('> ⚠️ **這一整節的 `authority` 都是 `code`。** 族群晉升發生在**執行期**：\n'
      '> `w3xFamilyArt.ts` 這張表在施法那一刻改寫 `vfxKey`，所以這些技能\n'
      '> **在內容檔裡改 `vfxKey` 不會生效**。編輯器必須把它們顯示成唯讀 + 說明為什麼\n'
      '> —— 一個存了不會生效的欄位比一個唯讀欄位糟糕得多（規格 §3.3）。\n>\n'
      f'> ⚠️ **「列了」與「說了算」不是同一個數**：族群表列了 {listed} 支，其中\n'
      f'> **{listed - eff} 支同時出現在逐支硬綁表 `w3xAbilityArt.ts` 裡，硬綁表贏**，\n'
      f'> 所以族群表真正說了算的是 **{eff} 支**。上面 `vfxAuthority` 那張表用的是後者。\n>\n'
      '> 族的原型（形狀、預設顏色、預設大小）在 `w3xArtFamilies.ts`；\n'
      f'> 每一次呼叫可以覆寫的旋鈕是 `artParams.ts` 的 `ArtParams`：{ov}\n>\n'
      f'> 原型有 {len(fs)} 個，其中 **{zero} 個零採用**（做了但沒有任何技能綁上去）。\n\n')
    W('| 族 | 中文 | 形狀原語 | 表上列了 | **說了算** | 被硬表蓋掉 | 普查引用數 | authority | 它長什麼樣 |\n'
      '|---|---|---|---|---|---|---|---|---|\n')
    for f in sorted(fs, key=lambda x: (-x['effectiveCount'], -x['boundCount'], x['family'])):
        W(f"| `{f['family']}` | {f['label']} | `{f['primitive']}` | {f['boundCount']} | "
          f"**{f['effectiveCount']}** | {f['shadowedByAbilityArtCount']} | "
          f"{f['censusRefCount']} | `{f['authority']}` | {_cell(f['summary'])} |\n")
    W(f"\n另外還有 **{L['counts']['vfxAuthorityW3xAbilityArt']} 支**走"
      '`w3xAbilityArt.ts` 的**逐支硬綁表**（不分族，一支一個具名 emitter 文件），'
      '它們的 authority 同樣是 `code`。\n')


# ---------------------------------------------------------------------------

def main(argv):
    want_json = '--json' in argv
    want_md = ('--md' in argv) or not want_json
    L = build_ledger()
    ok = sanity(L)
    if not ok:
        return 2
    if want_json:
        path = write_json(L)
        sys.stderr.write(f'✅ wrote {path}\n')
    if want_md:
        render_md(L, sys.stdout.write)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
