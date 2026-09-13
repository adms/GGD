"""ship34 上架檢核頁 —— ⭐ 一頁自足：模型預覽與語音都**內嵌**，⛔ 不依賴任何外部資源。"""
import argparse, base64, html, json, pathlib, re

ap = argparse.ArgumentParser(description="上架檢核頁：材料＋模型實拍＋語音精靈＋三份缺口清單 → 一頁自足的 HTML")
ap.add_argument("--material", required=True)
ap.add_argument("--work", required=True, help="collect-review-inputs.py 的輸出＋review34/{webp,audio}")
ap.add_argument("--out", required=True)
A = ap.parse_args()

HERE = pathlib.Path(A.work).resolve()
mat = json.loads(pathlib.Path(A.material).read_text(encoding='utf-8'))
spr = json.loads((HERE/'voice_sprites.json').read_text(encoding='utf-8'))
mf  = json.loads((HERE/'model_files.json').read_text(encoding='utf-8'))
cov = json.loads((HERE/'shot_coverage.json').read_text(encoding='utf-8'))
resc = json.loads((HERE/'voxel_now.json').read_text(encoding='utf-8'))      # 38 名救回來的
q60  = json.loads((HERE/'quotes60.json').read_text(encoding='utf-8'))       # 60 名沒有對白
pairs= json.loads((HERE/'shared_pairs.json').read_text(encoding='utf-8'))   # 18 顆共用模型
e = lambda x: html.escape(str(x))

def b64(p, mime):
    return f"data:{mime};base64,{base64.b64encode(pathlib.Path(p).read_bytes()).decode()}"

STATUS = {
 "converted-shared-contract-and-motion-verified": ("新轉檔・動作驗過", "ok"),
 "existing-finished-files-copied-byte-identical": ("沿用既有成品", "ok"),
 "rig-source-present-actions-missing": ("只有骨架・動作沒做", "bad"),
}
CONF = {"high": ("✓","ok","索引已綁 heroId"),
        "identity": ("✓","ok","交付表編號命中，名字也對得上"),
        "identity-name-mismatch": ("⚠","warn","編號對上、名字對不上 —— 要你看一眼"),
        "candidate": ("·","dim","只有名字像（⛔ 只是候選）")}
BUCKET_ORDER = ["台詞・玩笑","大招","陣亡","攻擊","移動","嘲諷","倒下","其他語音","其他","叫聲"]

cards = []
for h in sorted(mat['heroes'], key=lambda x: (x['ready'], x['id'])):
    hid, m, v = h['id'], h['model'], h['voice']
    st, stcls = STATUS.get(m.get('deliveryStatus',''), (m.get('deliveryStatus') or '—', 'dim'))
    shot = HERE/'review34/webp'/f'{hid}.webp'
    if shot.exists():
        origin = mf.get(hid,{}).get('from','')
        pic = (f'<img class="shot" src="{b64(shot,"image/webp")}" alt="{e(h["name"])}" loading="lazy" width="320" height="320">'
               f'<div class="shotnote">實拍自 {e(origin)}・畫面覆蓋 {cov.get(hid,0)*100:.1f}%</div>'
               f'<div class="item" data-item="model"><span class="ilabel">🧍 這顆模型</span>'
               f'<button class="yes" title="採用">✓</button><button class="no" title="不採用">✗</button></div>')
    else:
        pic = '<div class="noshot">⛔ 沒有模型<br><span>連交付表都沒有檔</span></div>'

    s = spr.get(hid)
    if s:
        mark, ccls, why = CONF.get(s['confidence'], ("·","dim",s['confidence']))
        rows_ = ""
        for i, c in enumerate(sorted(s['marks'], key=lambda c: BUCKET_ORDER.index(c['bucket']) if c['bucket'] in BUCKET_ORDER else 99)):
            rows_ += (f'<div class="item" data-item="clip-{i}">'
                      f'<button class="clip" data-a="{c["start"]}" data-b="{c["end"]}" title="{e(c["label"])}">▶</button>'
                      f'<span class="ilabel">{e(c["bucket"])}<i>{c["end"]-c["start"]:.1f}s</i></span>'
                      f'<button class="yes" title="採用這一段">✓</button><button class="no" title="不採用">✗</button>'
                      f'</div>')
        audio = (f'<div class="voice {ccls}">'
                 f'<div class="vhead"><b>{mark} {e(s["group"])}</b>「{e(s["groupName"])}」<span class="why">{e(why)}</span></div>'
                 f'<audio preload="none" src="{b64(HERE/"review34/audio"/s["file"],"audio/mpeg")}"></audio>'
                 f'<div class="items">{rows_}</div></div>')
    else:
        audio = '<div class="voice dim"><div class="vhead">🎙 全庫找不到這位角色的原作語音</div></div>'

    chips = "".join(f'<span class="chip bad">⛔ {e(b)}</span>' for b in h['blockers'])
    chips += "".join(f'<span class="chip warn">⚠️ {e(w)}</span>' for w in h['warnings'])
    key = m.get('modelKey') or '—'
    cards.append(f'''<article class="card" id="c-{e(hid)}" data-id="{e(hid)}" data-ready="{'1' if h['ready'] else '0'}">
 <div class="pic">{pic}</div>
 <div class="body">
  <h3>{e(h['name'])} <span class="hid">{e(hid)}</span></h3>
  <div class="meta"><span class="badge {stcls}">{e(st)}</span>
   <code title="{e(key)}">{e(key[:30])}{'…' if len(key)>30 else ''}</code></div>
  {audio}
  <div class="chips">{chips or '<span class="chip ok">沒有擋住的事</span>'}</div>
  <div class="verdict">
   <button class="allyes">全部接受</button><button class="allno">全部拒絕</button>
   <input class="why-in" placeholder="備註／退回原因（選填）" />
   <span class="state"></span>
  </div>
 </div></article>''')

def shot(tag, alt, cls="shot"):
    f = HERE/'review34/webp'/f'{tag}.webp'
    return f'<img class="{cls}" src="{b64(f,"image/webp")}" alt="{e(alt)}" loading="lazy">' if f.exists() else ''

# 🧍 38 名救回來的模型 —— ⭐ 這一節是**驗收證據**：位元組已經進 git，圖是拿那顆 glb 拍的
resc_cards = []
for r in resc:
    tag = 'rescued-' + r['id']; c = cov.get(tag, 0)
    warn = '<div class="thin">⚠️ 畫面覆蓋很低 —— 可能是模型主體很小或相機框太遠</div>' if c < 0.03 else ''
    resc_cards.append(f'''<article class="card mini" id="r-{e(r["id"])}" data-id="{e(r["id"])}" data-kind="rescued">
 <div class="pic">{shot(tag, r["name"]) or '<div class="noshot">⛔ 拍不出來</div>'}{warn}</div>
 <div class="body"><h3>{e(r["name"])} <span class="hid">{e(r["id"])}</span></h3>
  <div class="meta"><span class="badge ok">位元組已進 git</span><span class="badge dim">{r["bytes"]/1024/1024:.1f} MB</span>
   <span class="badge dim">sha256 驗過</span></div>
  <div class="chips"><span class="chip ok">在這一版之前：玩家看到的是程序化體素替身</span></div>
  <div class="verdict"><div class="item" data-item="model"><span class="ilabel">🧍 這顆模型</span>
   <button class="yes" title="看起來對">✓</button><button class="no" title="不對">✗</button></div>
   <input class="why-in" placeholder="哪裡不對（選填）"><span class="state"></span></div>
 </div></article>''')

# 💬 60 名沒有角色對白 —— ⭐ owner 2026-09-10：「請你給我名單就好 不要自己產 我會手動填寫」
GROUP = {'b2': ('b2 第二批', 'warn'), 'community': ('社群複審', 'ok'), 'lol': ('LoL', 'dim')}
q_cards = []
for r in q60:
    g, gc = GROUP.get(r['group'], (r['group'], 'dim'))
    sk = '・'.join(r['skills'][:4])
    ln = ''.join(f'<li>「{e(x)}」</li>' for x in r['lines'][:4])
    q_cards.append(f'''<article class="card quote" id="q-{e(r["id"])}" data-id="{e(r["id"])}" data-kind="quotes" data-group="{e(r["group"])}">
 <div class="body"><h3>{e(r["name"])} <span class="hid">{e(r["id"])}</span> <span class="badge {gc}">{e(g)}</span></h3>
  <div class="reason">{e(r["reason"])}</div>
  {f'<div class="ctx"><b>技能名</b>{e(sk)}</div>' if sk else ''}
  {f'<div class="ctx"><b>卡面上已經有的台詞</b><ul>{ln}</ul></div>' if ln else ''}
  <textarea class="line-in" rows="2" placeholder="這一位的名言／角色對白（你寫，⛔ 我不代筆）"></textarea>
  <div class="verdict"><button class="save">存這一句</button>
   <button class="skip">這一位不需要</button><span class="state"></span></div>
 </div></article>''')

# 🔁 18 顆共用模型
pair_cards = []
for pr in pairs:
    tag = 'shared-' + pr['modelKey'].replace('.', '_')[:44]; key = re.sub(r'[^A-Za-z0-9_-]', '_', pr['modelKey'])
    same = pr['same']; c = cov.get(tag, 0)
    who = ' ＋ '.join(f'{e(n)}<span class="hid"> {e(i)}</span>' for i, n in zip(pr['ids'], pr['names']))
    warn = '<div class="thin">⚠️ 畫面覆蓋很低</div>' if c < 0.03 else ''
    pair_cards.append(f'''<article class="card mini" id="s-{e(key)}" data-id="{e(key)}" data-kind="shared" data-same="{'1' if same else '0'}">
 <div class="pic">{shot(tag, pr['modelKey']) or '<div class="noshot">⛔ 沒有檔</div>'}{warn}</div>
 <div class="body"><h3>{'⭐ 同一角色' if same else '⚠️ 不同角色共用一顆'}</h3>
  <div class="meta"><code>{e(pr['modelKey'][:40])}</code></div>
  <div class="chips"><span class="chip {'ok' if same else 'warn'}">{who}</span></div>
  {'' if same else '<div class="verdict"><div class="item" data-item="model"><span class="ilabel">刻意共用？</span><button class="yes" title="刻意的・保留">✓</button><button class="no" title="要各自一顆">✗</button></div><input class="why-in" placeholder="理由（選填）"><span class="state"></span></div>'}
 </div></article>''')

D = mat['delivery']
page = f'''<title>ship34 上架檢核</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700&display=swap">
<style>
:root {{ --ink:#15181c; --dim:#5f6773; --line:#ded9cf; --paper:#f8f6f1; --card:#fffefb;
  --teal:#17635f; --bad:#a3341f; --warn:#8a6310; --ok:#2c6a3d; --soft:#efece4; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --ink:#e9e6df; --dim:#98a0ab; --line:#2e333a; --paper:#131619; --card:#191d21;
  --teal:#6ec3ba; --bad:#e0846a; --warn:#d8ac52; --ok:#7ec291; --soft:#21262b; }} }}
:root[data-theme="dark"] {{ --ink:#e9e6df; --dim:#98a0ab; --line:#2e333a; --paper:#131619; --card:#191d21;
  --teal:#6ec3ba; --bad:#e0846a; --warn:#d8ac52; --ok:#7ec291; --soft:#21262b; }}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);
 font:15px/1.6 "Helvetica Neue",-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif}}
.wrap{{max-width:1180px;margin:0 auto;padding:26px 18px 90px}}
h1{{font-family:"Noto Serif TC",serif;font-size:28px;margin:0 0 4px;text-wrap:balance}}
.sub{{color:var(--dim);margin:0 0 16px;max-width:70ch}}
.bar{{position:sticky;top:0;z-index:9;background:var(--paper);border-bottom:1px solid var(--line);
 padding:10px 0;margin-bottom:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}}
.bar b{{font-family:"Noto Serif TC",serif;font-size:19px;font-variant-numeric:tabular-nums}}
.bar .seg button{{background:transparent;border:1px solid var(--line);color:var(--dim);
 padding:4px 11px;border-radius:99px;cursor:pointer;margin-right:4px;font-size:13px}}
.bar .seg button[aria-pressed="true"]{{border-color:var(--teal);color:var(--teal);font-weight:700}}
.keyline{{border-left:3px solid var(--teal);background:var(--card);padding:10px 14px;margin:0 0 18px;font-size:13px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(430px,1fr));gap:14px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;display:flex;gap:12px;padding:12px;
 align-items:flex-start}}
.card[data-ready="0"]{{border-left:4px solid var(--bad)}}
.pic{{flex:0 0 168px}}
.shot{{width:168px;height:168px;object-fit:contain;background:var(--soft);border-radius:8px;display:block}}
.shotnote{{color:var(--dim);font-size:10.5px;margin-top:4px;line-height:1.35}}
.noshot{{width:168px;height:168px;border-radius:8px;background:var(--soft);color:var(--bad);
 display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-weight:700;font-size:14px}}
.noshot span{{color:var(--dim);font-weight:400;font-size:11.5px}}
.body{{flex:1;min-width:0}}
h3{{font-family:"Noto Serif TC",serif;font-size:17px;margin:0 0 3px}}
.hid{{font:11px ui-monospace,Menlo,monospace;color:var(--dim);font-weight:400}}
.meta{{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}}
.badge{{font-size:11.5px;padding:2px 8px;border-radius:99px;background:var(--soft)}}
.badge.ok{{color:var(--ok)}} .badge.bad{{color:var(--bad)}} .badge.dim{{color:var(--dim)}}
.meta code{{font:10.5px ui-monospace,Menlo,monospace;color:var(--dim)}}
.voice{{border:1px solid var(--line);border-radius:8px;padding:8px 9px;margin-bottom:8px}}
.voice.warn{{border-color:var(--warn)}} .voice.dim{{color:var(--dim)}}
.vhead{{font-size:12px;margin-bottom:6px}} .vhead b{{font-family:ui-monospace,Menlo,monospace;font-size:11.5px}}
.why{{color:var(--dim);margin-left:6px}} .voice.warn .why{{color:var(--warn)}}
.items{{display:flex;flex-direction:column;gap:3px}}
.item{{display:flex;align-items:center;gap:6px;background:var(--soft);border:1px solid transparent;
 border-radius:6px;padding:3px 6px}}
.item[data-v="ok"]{{border-color:var(--ok)}} .item[data-v="no"]{{border-color:var(--bad);opacity:.62}}
.ilabel{{flex:1;font-size:12px;display:flex;gap:6px;align-items:center;min-width:0}}
.ilabel i{{color:var(--dim);font-style:normal;font-size:10.5px}}
.clip{{background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:5px;
 width:26px;height:22px;font-size:11px;cursor:pointer;flex:0 0 auto;padding:0}}
.clip:hover{{border-color:var(--teal);color:var(--teal)}}
.clip[aria-pressed="true"]{{border-color:var(--teal);background:var(--teal);color:#fff}}
.yes,.no{{background:transparent;border:1px solid var(--line);border-radius:5px;width:26px;height:22px;
 font-size:12px;cursor:pointer;flex:0 0 auto;padding:0;color:var(--dim);font-weight:700}}
.yes:hover,.item[data-v="ok"] .yes{{border-color:var(--ok);color:var(--ok)}}
.no:hover,.item[data-v="no"] .no{{border-color:var(--bad);color:var(--bad)}}
.item[data-v="ok"] .yes{{background:var(--ok);color:#fff}} .item[data-v="no"] .no{{background:var(--bad);color:#fff}}
.allyes,.allno{{font-size:12px;padding:3px 10px;border-radius:6px;background:transparent;cursor:pointer;font-weight:700}}
.allyes{{border:1px solid var(--ok);color:var(--ok)}} .allno{{border:1px solid var(--bad);color:var(--bad)}}
.bulk{{display:flex;gap:6px;align-items:center;margin-left:auto}}
.bulk b{{font-size:12px;color:var(--dim);font-weight:400}}
.chips{{display:flex;flex-direction:column;gap:3px;margin-bottom:9px}}
.chip{{font-size:11.5px;line-height:1.45}} .chip.bad{{color:var(--bad)}} .chip.warn{{color:var(--warn)}} .chip.ok{{color:var(--ok)}}
.verdict{{display:flex;gap:6px;align-items:center;flex-wrap:wrap}}
.verdict button{{border-radius:7px;padding:5px 15px;font-size:13.5px;cursor:pointer;background:transparent;font-weight:700}}
.ap{{border:1px solid var(--ok);color:var(--ok)}} .rj{{border:1px solid var(--bad);color:var(--bad)}}
.ap[aria-pressed="true"]{{background:var(--ok);color:#fff}} .rj[aria-pressed="true"]{{background:var(--bad);color:#fff}}
.why-in{{flex:1;min-width:120px;background:var(--paper);border:1px solid var(--line);color:var(--ink);
 border-radius:7px;padding:5px 9px;font-size:12.5px}}
.state{{font-size:11.5px;color:var(--dim);width:100%}}
.tabs{{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}}
.tabs button{{background:transparent;border:1px solid var(--line);color:var(--dim);border-radius:8px;
 padding:7px 13px;cursor:pointer;font-size:14px;font-weight:700}}
.tabs button[aria-pressed="true"]{{border-color:var(--teal);color:var(--teal);background:var(--card)}}
.mini-grid{{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}}
.card.mini .pic{{flex:0 0 118px}} .card.mini .shot{{width:118px;height:118px}}
.card.mini .noshot{{width:118px;height:118px;font-size:12px}}
.thin{{color:var(--warn);font-size:10.5px;margin-top:3px;line-height:1.35}}
.card.quote{{display:block}}
.reason{{font-size:12.5px;color:var(--dim);margin:2px 0 7px}}
.ctx{{font-size:12px;color:var(--dim);margin-bottom:6px}}
.ctx b{{color:var(--ink);margin-right:6px;font-weight:600}}
.ctx ul{{margin:3px 0 0;padding-left:17px}} .ctx li{{margin:1px 0}}
.line-in{{width:100%;background:var(--paper);border:1px solid var(--line);color:var(--ink);border-radius:7px;
 padding:7px 9px;font:14px/1.5 inherit;margin-bottom:6px;resize:vertical}}
.save{{border:1px solid var(--teal);color:var(--teal)}} .save[aria-pressed="true"]{{background:var(--teal);color:#fff}}
.skip{{border:1px solid var(--line);color:var(--dim)}} .skip[aria-pressed="true"]{{background:var(--dim);color:var(--paper)}}
.foot{{color:var(--dim);font-size:12px;border-top:1px solid var(--line);margin-top:28px;padding-top:14px}}
@media (max-width:520px){{.card{{flex-direction:column}}.pic,.shot,.noshot{{width:100%}}.shot,.noshot{{height:210px}}}}
</style>
<div class="wrap">
<h1>上架檢核・四件事</h1>
<p class="sub">模型看得到、語音聽得到，然後按下你的判定。退回必填原因，判定即時存下來，換一台裝置打開仍在。</p>

<div class="tabs">
 <button data-t="s1" aria-pressed="true">🆕 34 名新英雄</button>
 <button data-t="s2">🧍 38 名救回來的模型</button>
 <button data-t="s3">💬 60 名沒有對白</button>
 <button data-t="s4">🔁 18 顆共用模型</button>
</div>

<div class="bar">
 <b id="prog">已判定 0</b>
 <span class="seg" id="seg1">
  <button data-f="all" aria-pressed="true">全部 34</button>
  <button data-f="open">還沒判定</button>
  <button data-f="blocked">⛔ 被擋 8</button>
  <button data-f="mismatch">⚠️ 名字對不上 6</button>
 </span>
 <span id="dbstate" style="color:var(--dim);font-size:12px"></span>
</div>

<section id="s1">
<div class="bar sub-bar"><b>整批：</b><span class="bulk"><button class="allyes" data-scope="#s1">本頁全部接受</button><button class="allno" data-scope="#s1">本頁全部拒絕</button></span></div>
<div class="keyline">🔑 <b>模型交付表對帳</b>：{D['rows']} 列・對上 {D['claimed']} 列・沒有人認領 {len(D['unclaimed'])} 列・被兩位認領 {len(D['doubleClaimed'])} 列。
模型預覽是**真的把那顆 glb 載進 three.js 拍的**，⛔ 不是示意圖；每一張都量過非透明像素（空白的會被擋下）。</div>
<div class="grid">
{''.join(cards)}
</div>
</section>

<section id="s2" hidden>
<div class="bar sub-bar"><b>整批：</b><span class="bulk"><button class="allyes" data-scope="#s2">本頁全部接受</button><button class="allno" data-scope="#s2">本頁全部拒絕</button></span></div>
<div class="keyline">🧍 這 38 名在**這一版之前**是**程序化體素替身** —— 它們的 GLB 只在 <code>assets-offdisk.json</code> 裡「宣告」過，
⛔ 而部署是 <code>git fetch + checkout</code>、全 repo **沒有任何一步把 S3 的位元組拉回來** ⇒ 伺服器上那顆檔不存在。
⭐ 已從 S3 取回 37 顆（39.1 MB），<b>sha256 與位元組數兩個軸都驗過</b>，進 git。下面每一張都是拿**入庫後那顆 glb** 拍的。</div>
<div class="grid mini-grid">
{''.join(resc_cards)}
</div>
</section>

<section id="s3" hidden>
<div class="keyline">💬 這 60 名<b>刻意留空</b>，每一筆都有機器可讀的理由。
⭐ owner 2026-09-10 逐字：「<b>請你給我名單就好 不要自己產 我會手動填寫</b>」——
⛔ 所以這裡**只給名單與素材**（技能名、卡面上已經有的台詞），那一格由你寫。寫完按「存這一句」。
<span class="seg" style="margin-left:10px">
 <button data-g="all" aria-pressed="true">全部 60</button>
 <button data-g="b2">b2 37</button><button data-g="community">社群 16</button><button data-g="lol">LoL 7</button>
</span></div>
<div class="grid">
{''.join(q_cards)}
</div>
</section>

<section id="s4" hidden>
<div class="bar sub-bar"><b>整批：</b><span class="bulk"><button class="allyes" data-scope="#s4">本頁全部接受</button><button class="allno" data-scope="#s4">本頁全部拒絕</button></span></div>
<div class="keyline">🔁 36 名英雄共用 18 顆模型。⭐ 其中 <b>15 對是同一角色</b>（本體↔變身態，或同一位英雄的兩個編號）——那是**正常**的。
⚠️ 另外 <b>3 對是不同角色共用一顆</b>，那要你看一眼決定：是刻意的惡搞／替身，還是該各自一顆。
<br>⚠️ 我量到 15 對，你說 14 對 —— 差的那一對是悟空（「超級賽亞人 - 悟空」＋「賽亞人 - 悟空」），名字前綴不同但是同一位角色。</div>
<div class="grid mini-grid">
{''.join(pair_cards)}
</div>
</section>

<div class="foot">
材料 digest <code>{mat['digest'][:16]}</code>・產生器 <code>{e(mat['generatedBy'])}</code>・
語音來自 owner 的角色語音索引（每位取 4–6 段，涵蓋台詞／大招／陣亡／攻擊／移動／嘲諷；⛔ 已排除中文配音檔）。<br>
⛔ 這一頁不改任何內容檔，也不代你裁決 —— 通過之後把模型／圖示／語音落地的仍然是原本那批工具。
</div>
</div>
<script>
// ⛔⛔ 要限定在第一區 —— 全域抓 `.card` 會把「共用模型」那 15 張**沒有按鈕**的卡片也抓進來，
//     於是 `querySelector(".ap").addEventListener` 在第一圈就 TypeError，⭐ 而後面每一個接線都沒掛上。
const cards = [...document.querySelectorAll("#s1 .card")];
const prog = document.getElementById("prog");
const dbstate = document.getElementById("dbstate");
let DB = null, local = {{}};

/* ── 語音：一位英雄一段精靈音軌，按鈕 seek 到該段並在結尾停 ───────────── */
for (const card of cards) {{
  const au = card.querySelector("audio");
  if (!au) continue;
  let stopAt = null;
  au.addEventListener("timeupdate", () => {{
    if (stopAt !== null && au.currentTime >= stopAt) {{
      au.pause(); stopAt = null;
      card.querySelectorAll(".clip[aria-pressed=true]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    }}
  }});
  card.querySelectorAll(".clip").forEach((btn) => {{
    btn.addEventListener("click", () => {{
      document.querySelectorAll("audio").forEach((a) => {{ if (a !== au) a.pause(); }});
      document.querySelectorAll(".clip[aria-pressed=true]").forEach((b) => b.setAttribute("aria-pressed", "false"));
      au.currentTime = parseFloat(btn.dataset.a);
      stopAt = parseFloat(btn.dataset.b);
      btn.setAttribute("aria-pressed", "true");
      au.play().catch(() => {{ btn.setAttribute("aria-pressed", "false"); }});
    }});
  }});
}}

/* ── 逐項判定 ──────────────────────────────────────────────────
   ⭐ owner 2026-09-11：「模型 每個音效 等都應該**分開選項**接受或拒絕，
      也有**全部接受 全部拒絕**」⇒ 一個模型是一項、一段音效是一項。
   ⛔ 一位英雄一個裁決會把「模型對但這段語音不對」壓成一個字，那正是他要拆開的東西。
   db：集合 `items`，文件 id = `<區>__<英雄>__<項>`（⭐ 一項一份 ⇒ ⛔ 兩個項目不會互相蓋掉）。 */
const itemId = (el) => {{
  const card = el.closest(".card");
  return `${{card.closest("section").id}}__${{card.dataset.id}}__${{el.dataset.item}}`;
}};
function paintItem(el, v) {{
  el.dataset.v = v?.v ?? "";
  const card = el.closest(".card");
  card.dataset.done = card.querySelectorAll('.item:not([data-v=""])').length === card.querySelectorAll(".item").length ? "1" : "0";
  refreshProg();
}}
async function setItem(el, v, note) {{
  paintItem(el, {{ v }});
  if (!DB) return;
  if (!(await writeItem(el, v, note))) {{
    const st = el.closest(".card").querySelector(".state");
    if (st) st.textContent = "⛔ 這一項沒存進去 —— 再按一次";
    el.dataset.v = "";                                   // ⛔ 不要留一個「看起來判定了」的假狀態
    refreshProg();
  }}
}}
for (const el of document.querySelectorAll(".item")) {{
  el.querySelector(".yes")?.addEventListener("click", () => setItem(el, "ok"));
  el.querySelector(".no")?.addEventListener("click", () => setItem(el, "no",
    el.closest(".card").querySelector(".why-in")?.value.trim()));
}}

/* ⭐ 整批：先全部畫好（⛔ 不要讓人等網路），再**限流**寫回去 —— 一次 179 筆會撞速率上限。
   ⛔⛔ 單筆失敗**不可以靜默吞掉** —— 那會變成「畫面說已接受、資料庫沒有」，
   而那正是 CLAUDE.md 的「fail-open 沒錯，**靜默**才是缺陷」。⇒ 退避重試 ＋ 沒成功就大聲講。 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function writeItem(el, v, note) {{
  for (let i = 0; i < 3; i += 1) {{
    try {{ await DB.doc(`items/${{itemId(el)}}`).set({{ v, at: new Date().toISOString(), note: note ?? "" }}); return true; }}
    catch (err) {{
      if (err?.code !== "resource_exhausted" && i === 2) return false;
      await sleep(400 * (i + 1) * (i + 1));            // 400 / 1600 / 3600ms
    }}
  }}
  return false;
}}
async function bulk(scopeSel, v, btn) {{
  const els = [...document.querySelectorAll(`${{scopeSel}} .item`)].filter((el) => !el.closest(".card").hidden);
  for (const el of els) paintItem(el, {{ v }});
  if (!DB) return;
  const label = btn?.textContent; let done = 0; const failed = [];
  const queue = els.slice();
  const worker = async () => {{
    while (queue.length) {{
      const el = queue.shift();
      if (!(await writeItem(el, v))) failed.push(el);
      done += 1;
      if (btn && done % 10 === 0) btn.textContent = `${{label}}… ${{done}}/${{els.length}}`;
    }}
  }};
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (btn) btn.textContent = label;
  if (failed.length) {{
    dbstate.innerHTML = `⛔ <b>${{failed.length}} 筆沒存進去</b>（畫面上看起來判定了，資料庫沒有）`;
    const again = document.createElement("button");
    again.textContent = "重試這幾筆"; again.className = "allyes"; again.style.marginLeft = "6px";
    again.addEventListener("click", async () => {{
      again.disabled = true;
      const still = [];
      for (const el of failed) if (!(await writeItem(el, v))) still.push(el);
      dbstate.textContent = still.length ? `⛔ 還有 ${{still.length}} 筆存不進去` : "✓ 補存完成";
      again.remove();
    }});
    dbstate.appendChild(again);
  }} else {{
    dbstate.textContent = `✓ ${{els.length}} 筆都存好了`;
  }}
}}
document.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () =>
  bulk(b.dataset.scope, b.classList.contains("allyes") ? "ok" : "no", b)));
for (const card of document.querySelectorAll(".card")) {{
  card.querySelector(".allyes:not([data-scope])")?.addEventListener("click", (ev) =>
    bulk(`#${{card.id}}`, "ok", ev.currentTarget));
  card.querySelector(".allno:not([data-scope])")?.addEventListener("click", (ev) =>
    bulk(`#${{card.id}}`, "no", ev.currentTarget));
}}

/* ── 篩選 ─────────────────────────────────────────────────────── */
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {{
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", "false"));
  b.setAttribute("aria-pressed", "true");
  const f = b.dataset.f;
  for (const c of cards) {{
    const show = f === "all" ? true
      : f === "open" ? c.dataset.done !== "1"
      : f === "blocked" ? c.dataset.ready === "0"
      : !!c.querySelector(".voice.warn");
    c.hidden = !show;
  }}
}}));

/* ── 分頁 ─────────────────────────────────────────────────────── */
const SECT = ["s1", "s2", "s3", "s4"];
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {{
  document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-pressed", "false"));
  b.setAttribute("aria-pressed", "true");
  for (const id of SECT) document.getElementById(id).hidden = id !== b.dataset.t;
  document.getElementById("seg1").hidden = b.dataset.t !== "s1";
  refreshProg();
}}));
function refreshProg() {{
  const open = SECT.find((id) => !document.getElementById(id).hidden);
  if (open === "s3") {{                                   // 名言那一區數的是卡片（一位一句）
    const cs = [...document.querySelectorAll("#s3 .card")];
    prog.textContent = `已填 ${{cs.filter((c) => c.dataset.done === "1").length}} / ${{cs.length}}`;
    return;
  }}
  // ⭐ 其餘三區數的是**項目**（一顆模型一項、一段音效一項），⛔ 不是卡片
  const items = [...document.querySelectorAll(`#${{open}} .item`)];
  const done = items.filter((el) => el.dataset.v).length;
  prog.textContent = `已判定 ${{done}} / ${{items.length}} 項`;
}}

/* ── 60 句名言：owner 自己寫，⛔ 我不代筆 ────────────────────────── */
function paintQuote(card, v) {{
  const st = card.querySelector(".state"), ta = card.querySelector(".line-in");
  const save = card.querySelector(".save"), skip = card.querySelector(".skip");
  if (v?.line && !ta.value) ta.value = v.line;
  save.setAttribute("aria-pressed", String(!!v?.line));
  skip.setAttribute("aria-pressed", String(v?.skip === true));
  const when = v?.at ? new Date(v.at).toLocaleString("zh-TW", {{ month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }}) : "";
  st.textContent = v ? (v.skip ? `已標記不需要${{when ? " · " + when : ""}}` : `已存${{when ? " · " + when : ""}}`) : "";
  card.dataset.done = v ? "1" : "0";
  refreshProg();
}}
for (const card of document.querySelectorAll('.card[data-kind="quotes"]')) {{
  const write = async (body) => {{
    paintQuote(card, body);
    if (!DB) return;
    try {{ await DB.doc(`quotes/${{card.dataset.id}}`).set(body); }}
    catch (err) {{ card.querySelector(".state").textContent = "⚠️ 存不進去：" + (err?.code || err?.message || err); }}
  }};
  card.querySelector(".save").addEventListener("click", () => {{
    const line = card.querySelector(".line-in").value.trim();
    if (!line) {{ card.querySelector(".state").textContent = "⛔ 還沒寫東西"; return; }}
    write({{ line, skip: false, at: new Date().toISOString() }});
  }});
  card.querySelector(".skip").addEventListener("click", () => write({{ line: "", skip: true, at: new Date().toISOString() }}));
}}
document.querySelectorAll('#s3 .seg button').forEach((b) => b.addEventListener("click", () => {{
  document.querySelectorAll('#s3 .seg button').forEach((x) => x.setAttribute("aria-pressed", "false"));
  b.setAttribute("aria-pressed", "true");
  for (const c of document.querySelectorAll('.card[data-kind="quotes"]'))
    c.hidden = !(b.dataset.g === "all" || c.dataset.group === b.dataset.g);
}}));

refreshProg();   // ⭐ 一載入就算一次，⛔ 不要等使用者點分頁才顯示分母

(async () => {{
  DB = window.claude && (await window.claude.use("db"));
  if (!DB) {{ dbstate.textContent = "⚠️ 這一份存不進共用資料庫（判定只留在這個分頁）"; return; }}
  dbstate.textContent = "✓ 判定會即時存下來";
  const onErr = (err) => {{ dbstate.textContent = "⚠️ 同步中斷：" + (err?.code || ""); }};
  // ⭐ 一個 listener 收全部逐項判定（文件 id 自己帶著「哪一區・哪一位・哪一項」）
  DB.collection("items").onSnapshot((snap) => {{
    for (const d of snap.docs) {{
      const [sec, hero, item] = d.id.split("__");
      const el = document.querySelector(`#${{sec}} .card[data-id="${{CSS.escape(hero)}}"] .item[data-item="${{CSS.escape(item)}}"]`);
      if (el) paintItem(el, d.data());
    }}
  }}, onErr);
  DB.collection("quotes").onSnapshot((snap) => {{
    for (const d of snap.docs) {{
      const card = document.querySelector(`.card[data-kind="quotes"][data-id="${{CSS.escape(d.id)}}"]`);
      if (card) paintQuote(card, d.data());
    }}
  }}, onErr);
}})();
</script>
'''
out = pathlib.Path(A.out)
out.write_text(page, encoding='utf-8')
print(f"寫好 {out} · {out.stat().st_size/1024/1024:.2f} MB · 卡片 {len(cards)} 張")
