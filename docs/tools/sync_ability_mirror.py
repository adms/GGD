#!/usr/bin/env python3
"""
sync_ability_mirror.py — 把獨立技能檔同步到英雄檔裡的內嵌鏡像。

    content/abilities/<id>.json          ← STANDALONE（執行期贏，唯一的真相）
    content/champions/<hero>.json        ← abilities.<SLOT> 內嵌鏡像（選角畫面 / codex 讀）

⛔ **方向永遠是 standalone → embedded，不可反向。**
   `registries.ts` 的註冊順序讓獨立檔在執行期獲勝，所以只寫英雄檔＝遊戲完全不會變
   （一個看不出來的失敗）；只寫獨立檔＝遊戲對、但選角/codex 顯示舊值（看得出來的失敗）。
   這支工具只開英雄檔來寫，**永遠不會寫 content/abilities/**。

⚠️ **不做整份 JSON round-trip。** 原始檔有 `350.0` 這種 Python 匯出的浮點寫法，
   `json.load` + `json.dump` 會把它變成 `350`，在一個檔上產生幾十行無意義 diff。
   這裡走**文字層的定點替換**：只有真的不一樣的那幾個 key 被 splice 掉，
   而且替換文字直接**抄獨立檔的原始位元組**（再依縮排差平移），所以 `350.0` 原樣保留。

用法：
    python3 docs/tools/sync_ability_mirror.py                 # dry-run（預設），有漂移回 1
    python3 docs/tools/sync_ability_mirror.py --write         # 真的寫
    python3 docs/tools/sync_ability_mirror.py --filter godie-uvng

離開碼：0 = 沒有漂移（或 --write 已修好）· 1 = dry-run 發現漂移 · 2 = 有錯（缺檔、寫壞）
"""
import json, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p = lambda *a: os.path.join(ROOT, *a)

# 鏡像不帶 `schema`：英雄檔的 `abilities.<SLOT>` 走 zAbilityDef（champion@1 的一部分），
# 獨立檔走 ability@1 才需要 `schema` tag。這是唯一一個**刻意**不同步的 key。
MIRROR_DROP_KEYS = {'schema'}


# ---------------------------------------------------------------------------
# 極小的 JSON 掃描器 —— 只為了拿到「每個成員的原始位元組落在哪」
# ---------------------------------------------------------------------------

def _skip_ws(s, i):
    while i < len(s) and s[i] in ' \t\r\n':
        i += 1
    return i


def _skip_string(s, i):
    assert s[i] == '"', f'expected string at {i}: {s[i-20:i+20]!r}'
    i += 1
    while i < len(s):
        if s[i] == '\\':
            i += 2
            continue
        if s[i] == '"':
            return i + 1
        i += 1
    raise ValueError('unterminated string')


def _skip_value(s, i):
    i = _skip_ws(s, i)
    c = s[i]
    if c == '"':
        return _skip_string(s, i)
    if c in '{[':
        depth = 0
        while i < len(s):
            ch = s[i]
            if ch == '"':
                i = _skip_string(s, i)
                continue
            if ch in '{[':
                depth += 1
            elif ch in '}]':
                depth -= 1
                if depth == 0:
                    return i + 1
            i += 1
        raise ValueError('unterminated container')
    j = i
    while j < len(s) and s[j] not in ',}] \t\r\n':
        j += 1
    return j


def scan_members(s, obj_start):
    """obj_start 指向 '{'。回傳 (members, close_brace_index)。

    members = [{'key', 'ks'(key 起), 've'(value 迄), 'vs'(value 起), 'ms'(成員起，含前面的逗號)}]
    """
    assert s[obj_start] == '{', f'expected {{ at {obj_start}'
    i = obj_start + 1
    out = []
    prev_end = obj_start + 1          # 上一個成員結束的位置（給刪除用）
    while True:
        j = _skip_ws(s, i)
        if s[j] == '}':
            return out, j
        ks = j
        ke = _skip_string(s, j)
        key = json.loads(s[ks:ke])
        c = _skip_ws(s, ke)
        assert s[c] == ':', f'expected : after {key}'
        vs = _skip_ws(s, c + 1)
        ve = _skip_value(s, vs)
        out.append({'key': key, 'ks': ks, 'vs': vs, 've': ve, 'ms': prev_end})
        i = _skip_ws(s, ve)
        if s[i] == ',':
            i += 1
        prev_end = ve


def find_member(s, obj_start, key):
    ms, close = scan_members(s, obj_start)
    for m in ms:
        if m['key'] == key:
            return m, ms, close
    return None, ms, close


def root_object_start(s):
    return _skip_ws(s, 0)


def _col(s, idx):
    """idx 在它那一行的第幾欄（0-based）。"""
    ls = s.rfind('\n', 0, idx) + 1
    return idx - ls


def reindent(block, delta):
    """把一段多行的原始 JSON 值，除了第一行以外每行平移 delta 欄。"""
    if delta == 0 or '\n' not in block:
        return block
    lines = block.split('\n')
    pad = ' ' * delta if delta > 0 else ''
    out = [lines[0]]
    for ln in lines[1:]:
        if delta > 0:
            out.append(pad + ln)
        else:
            strip = min(-delta, len(ln) - len(ln.lstrip(' ')))
            out.append(ln[strip:])
    return '\n'.join(out)


# ---------------------------------------------------------------------------

def _short(v):
    t = json.dumps(v, ensure_ascii=False)
    return t if len(t) <= 90 else t[:87] + '…'


def plan_for_champion(cpath):
    """回傳 (edits, notes)。edits 是 [(start, end, replacement_text)]，位置以 champion 全文為準。"""
    ctext = open(cpath, encoding='utf8').read()
    cdoc = json.loads(ctext)
    edits, notes = [], []
    ab_member, _, _ = find_member(ctext, root_object_start(ctext), 'abilities')
    if ab_member is None:
        return [], []
    for slot, emb in sorted((cdoc.get('abilities') or {}).items()):
        aid = emb.get('id')
        spath = p('content/abilities', f'{aid}.json')
        if not aid or not os.path.exists(spath):
            notes.append(('MISSING', cpath, slot, aid, '獨立檔不存在'))
            continue
        stext = open(spath, encoding='utf8').read()
        sdoc = json.loads(stext)
        want = {k: v for k, v in sdoc.items() if k not in MIRROR_DROP_KEYS}

        slot_member, _, _ = find_member(ctext, ab_member['vs'], slot)
        assert slot_member is not None, f'{cpath}: abilities.{slot} 掃不到'
        emb_members, emb_close = scan_members(ctext, slot_member['vs'])
        emb_by_key = {m['key']: m for m in emb_members}
        s_members, _ = scan_members(stext, root_object_start(stext))
        s_by_key = {m['key']: m for m in s_members}

        # 1) 值不一樣 → 定點換掉 value 的位元組
        for key in want:
            m = emb_by_key.get(key)
            if m is None:
                continue
            if emb.get(key) == want[key]:
                continue
            sm = s_by_key[key]
            raw = stext[sm['vs']:sm['ve']]
            delta = _col(ctext, m['ks']) - _col(stext, sm['ks'])
            edits.append((m['vs'], m['ve'], reindent(raw, delta)))
            notes.append(('CHANGE', cpath, slot, key,
                          f'{_short(emb.get(key))}  →  {_short(want[key])}'))

        # 2) 鏡像少了 key → 補在最後一個成員後面
        add = [k for k in want if k not in emb_by_key]
        if add:
            ind = ' ' * _col(ctext, emb_members[0]['ks']) if emb_members else '      '
            chunk = ''
            for key in add:
                sm = s_by_key[key]
                delta = len(ind) - _col(stext, sm['ks'])
                chunk += f',\n{ind}"{key}": ' + reindent(stext[sm['vs']:sm['ve']], delta)
                notes.append(('ADD', cpath, slot, key, _short(want[key])))
            at = emb_members[-1]['ve'] if emb_members else slot_member['vs'] + 1
            edits.append((at, at, chunk))

        # 3) 鏡像多了 key → 整個成員刪掉
        #    ⚠️ 逗號要跟著走，而且**第一個成員的逗號在後面**：吃掉前面的逗號會留下
        #    `{,` 這種不合法的 JSON。第一個成員刪到下一個成員的開頭，其餘往前吃逗號。
        for idx, m in enumerate(emb_members):
            if m['key'] in want or m['key'] in MIRROR_DROP_KEYS:
                continue
            if idx == 0:
                nxt = emb_members[1]['ks'] if len(emb_members) > 1 else emb_close
                edits.append((m['ks'], nxt, ''))
            else:
                edits.append((m['ms'], m['ve'], ''))
            notes.append(('DROP', cpath, slot, m['key'], _short(emb.get(m['key']))))
    return edits, notes


def apply_edits(text, edits):
    for start, end, rep in sorted(edits, key=lambda e: -e[0]):
        text = text[:start] + rep + text[end:]
    return text


def verify(cpath, ctext):
    """寫完之後真的再讀一次：檔案還是合法 JSON，而且鏡像逐欄位等於獨立檔。"""
    cdoc = json.loads(ctext)
    for slot, emb in (cdoc.get('abilities') or {}).items():
        spath = p('content/abilities', f"{emb.get('id')}.json")
        if not os.path.exists(spath):
            continue
        sdoc = json.loads(open(spath, encoding='utf8').read())
        want = {k: v for k, v in sdoc.items() if k not in MIRROR_DROP_KEYS}
        if emb != want:
            bad = sorted(k for k in set(want) | set(emb) if want.get(k) != emb.get(k))
            raise SystemExit(f'❌ {cpath} abilities.{slot} 同步後仍不一致：{bad}')


def main(argv):
    write = '--write' in argv
    filt = None
    if '--filter' in argv:
        filt = argv[argv.index('--filter') + 1]

    files = sorted(glob.glob(p('content/champions', 'godie-*.json')))
    if filt:
        files = [f for f in files if filt in os.path.basename(f)]
    if not files:
        sys.stderr.write('沒有符合的英雄檔\n')
        return 2

    all_notes, changed, missing = [], [], []
    for cpath in files:
        edits, notes = plan_for_champion(cpath)
        all_notes += notes
        if any(n[0] == 'MISSING' for n in notes):
            missing += [n for n in notes if n[0] == 'MISSING']
        if not edits:
            continue
        changed.append(cpath)
        if write:
            text = open(cpath, encoding='utf8').read()
            new = apply_edits(text, edits)
            json.loads(new)                     # 寫壞就在這裡炸，不是在載入時
            open(cpath, 'w', encoding='utf8').write(new)
            verify(cpath, new)

    rel = lambda f: os.path.relpath(f, ROOT)
    cur = None
    for kind, cpath, slot, key, detail in all_notes:
        if cpath != cur:
            cur = cpath
            print(rel(cpath))
        print(f'  [{kind:6}] abilities.{slot}.{key}  {detail}')

    if not all_notes:
        print(f'✅ {len(files)} 個英雄檔，鏡像與獨立檔完全一致（0 個欄位漂移）')
        return 0
    verb = '已同步' if write else '會同步（dry-run，加 --write 才真的寫）'
    print(f'\n{verb}：{len(changed)} 個英雄檔 · '
          f"{sum(1 for n in all_notes if n[0] in ('CHANGE', 'ADD', 'DROP'))} 個欄位")
    if missing:
        print(f'⚠️  {len(missing)} 個內嵌鏡像找不到對應的獨立檔 —— 這種只能人來看，工具不猜')
        return 2
    return 0 if write else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
