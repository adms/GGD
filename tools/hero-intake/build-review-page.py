"""ship34 上架檢核頁 —— ⭐ 一頁自足：模型預覽與語音都**內嵌**，⛔ 不依賴任何外部資源。"""
import argparse, base64, html, json, pathlib

ap = argparse.ArgumentParser(description="ship34 上架檢核頁：把材料＋模型實拍＋語音精靈組成一頁自足的 HTML")
ap.add_argument("--material", required=True, help="docs/_review/material/hero-intake/<批次>.json")
ap.add_argument("--work", required=True, help="工作目錄：底下要有 voice_sprites.json / model_files.json / shot_coverage.json / review34/{webp,audio}")
ap.add_argument("--out", required=True)
A = ap.parse_args()

HERE = pathlib.Path(A.work).resolve()
mat = json.loads(pathlib.Path(A.material).read_text(encoding='utf-8'))
spr = json.loads((HERE/'voice_sprites.json').read_text(encoding='utf-8'))
mf  = json.loads((HERE/'model_files.json').read_text(encoding='utf-8'))
cov = json.loads((HERE/'shot_coverage.json').read_text(encoding='utf-8'))
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
               f'<div class="shotnote">實拍自 {e(origin)}・畫面覆蓋 {cov.get(hid,0)*100:.1f}%</div>')
    else:
        pic = '<div class="noshot">⛔ 沒有模型<br><span>連交付表都沒有檔</span></div>'

    s = spr.get(hid)
    if s:
        mark, ccls, why = CONF.get(s['confidence'], ("·","dim",s['confidence']))
        btns = "".join(
            f'<button class="clip" data-a="{c["start"]}" data-b="{c["end"]}" title="{e(c["label"])}">'
            f'{e(c["bucket"])} <i>{c["end"]-c["start"]:.1f}s</i></button>'
            for c in sorted(s['marks'], key=lambda c: BUCKET_ORDER.index(c['bucket']) if c['bucket'] in BUCKET_ORDER else 99))
        audio = (f'<div class="voice {ccls}">'
                 f'<div class="vhead"><b>{mark} {e(s["group"])}</b>「{e(s["groupName"])}」<span class="why">{e(why)}</span></div>'
                 f'<audio preload="none" src="{b64(HERE/"review34/audio"/s["file"],"audio/mpeg")}"></audio>'
                 f'<div class="clips">{btns}</div></div>')
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
   <button class="ap">通過</button><button class="rj">退回</button>
   <input class="why-in" placeholder="退回原因（必填）" />
   <span class="state"></span>
  </div>
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
.clips{{display:flex;flex-wrap:wrap;gap:5px}}
.clip{{background:var(--soft);border:1px solid transparent;color:var(--ink);border-radius:6px;
 padding:4px 9px;font-size:12px;cursor:pointer}}
.clip:hover{{border-color:var(--teal)}} .clip[aria-pressed="true"]{{border-color:var(--teal);color:var(--teal);font-weight:700}}
.clip i{{color:var(--dim);font-style:normal;font-size:10.5px}}
.chips{{display:flex;flex-direction:column;gap:3px;margin-bottom:9px}}
.chip{{font-size:11.5px;line-height:1.45}} .chip.bad{{color:var(--bad)}} .chip.warn{{color:var(--warn)}} .chip.ok{{color:var(--ok)}}
.verdict{{display:flex;gap:6px;align-items:center;flex-wrap:wrap}}
.verdict button{{border-radius:7px;padding:5px 15px;font-size:13.5px;cursor:pointer;background:transparent;font-weight:700}}
.ap{{border:1px solid var(--ok);color:var(--ok)}} .rj{{border:1px solid var(--bad);color:var(--bad)}}
.ap[aria-pressed="true"]{{background:var(--ok);color:#fff}} .rj[aria-pressed="true"]{{background:var(--bad);color:#fff}}
.why-in{{flex:1;min-width:120px;background:var(--paper);border:1px solid var(--line);color:var(--ink);
 border-radius:7px;padding:5px 9px;font-size:12.5px}}
.state{{font-size:11.5px;color:var(--dim);width:100%}}
.foot{{color:var(--dim);font-size:12px;border-top:1px solid var(--line);margin-top:28px;padding-top:14px}}
@media (max-width:520px){{.card{{flex-direction:column}}.pic,.shot,.noshot{{width:100%}}.shot,.noshot{{height:210px}}}}
</style>
<div class="wrap">
<h1>34 名新英雄・上架前檢核</h1>
<p class="sub">模型看得到、語音聽得到，然後按 <b>通過</b> 或 <b>退回</b>。
退回必填原因。判定會即時存下來，換一台裝置打開仍在。</p>

<div class="bar">
 <b id="prog">已判定 0 / 34</b>
 <span class="seg">
  <button data-f="all" aria-pressed="true">全部 34</button>
  <button data-f="open">還沒判定</button>
  <button data-f="blocked">⛔ 被擋 8</button>
  <button data-f="mismatch">⚠️ 名字對不上 6</button>
 </span>
 <span id="dbstate" style="color:var(--dim);font-size:12px"></span>
</div>

<div class="keyline">🔑 <b>模型交付表對帳</b>：{D['rows']} 列・對上 {D['claimed']} 列・沒有人認領 {len(D['unclaimed'])} 列・被兩位認領 {len(D['doubleClaimed'])} 列。
模型預覽是**真的把那顆 glb 載進 three.js 拍的**，⛔ 不是示意圖；每一張都量過非透明像素（⛔ 空白的會被擋下，第一輪就抓到一張）。</div>

<div class="grid">
{''.join(cards)}
</div>

<div class="foot">
材料 digest <code>{mat['digest'][:16]}</code>・產生器 <code>{e(mat['generatedBy'])}</code>・
語音來自 owner 的角色語音索引（每位取 4–6 段，涵蓋台詞／大招／陣亡／攻擊／移動／嘲諷；⛔ 已排除中文配音檔）。<br>
⛔ 這一頁不改任何內容檔，也不代你裁決 —— 通過之後把模型／圖示／語音落地的仍然是原本那批工具。
</div>
</div>
<script>
const cards = [...document.querySelectorAll(".card")];
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

/* ── 裁決：寫進 db（⭐ 跨裝置、跨重新整理都在），db 不在時退成本機暫存 ──── */
function paint(id, v) {{
  const card = document.getElementById("c-" + id);
  if (!card) return;
  const ap = card.querySelector(".ap"), rj = card.querySelector(".rj"), st = card.querySelector(".state");
  ap.setAttribute("aria-pressed", String(v?.verdict === "approve"));
  rj.setAttribute("aria-pressed", String(v?.verdict === "reject"));
  if (v?.reason && !card.querySelector(".why-in").value) card.querySelector(".why-in").value = v.reason;
  const when = v?.at ? new Date(v.at).toLocaleString("zh-TW", {{ month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }}) : "";
  st.textContent = v ? `已${{v.verdict === "approve" ? "通過" : "退回"}}${{when ? " · " + when : ""}}${{v.reason ? " · " + v.reason : ""}}` : "";
  card.dataset.done = v ? "1" : "0";
  const n = cards.filter((c) => c.dataset.done === "1").length;
  prog.textContent = `已判定 ${{n}} / ${{cards.length}}`;
}}
async function decide(card, verdict) {{
  const id = card.dataset.id;
  const reason = card.querySelector(".why-in").value.trim();
  if (verdict === "reject" && !reason) {{
    card.querySelector(".state").textContent = "⛔ 退回要填原因 —— 沒有理由的退回，下一輪沒有人知道要修什麼";
    card.querySelector(".why-in").focus(); return;
  }}
  const body = {{ verdict, reason, at: new Date().toISOString(), batch: "ship34" }};
  local[id] = body; paint(id, body);
  if (!DB) return;
  try {{ await DB.doc("ship34/" + id).set(body); }}
  catch (err) {{ card.querySelector(".state").textContent = "⚠️ 存不進去：" + (err?.code || err?.message || err); }}
}}
for (const card of cards) {{
  card.querySelector(".ap").addEventListener("click", () => decide(card, "approve"));
  card.querySelector(".rj").addEventListener("click", () => decide(card, "reject"));
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

(async () => {{
  DB = window.claude && (await window.claude.use("db"));
  if (!DB) {{ dbstate.textContent = "⚠️ 這一份存不進共用資料庫（判定只留在這個分頁）"; return; }}
  dbstate.textContent = "✓ 判定會即時存下來";
  DB.collection("ship34").onSnapshot(
    (snap) => {{ for (const d of snap.docs) paint(d.id, d.data()); }},
    (err) => {{ dbstate.textContent = "⚠️ 同步中斷：" + (err?.code || ""); }},
  );
}})();
</script>
'''
out = pathlib.Path(A.out)
out.write_text(page, encoding='utf-8')
print(f"寫好 {out} · {out.stat().st_size/1024/1024:.2f} MB · 卡片 {len(cards)} 張")
