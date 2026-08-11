/**
 * 把 `docs/engine-atlas.json` 畫成一頁。⛔ 頁面也是**推導**的 ——
 * 手抄一份數字進 HTML 就等於又造了一個會過期的住處（CLAUDE.md 第四個住處）。
 *
 *   npx tsx tools/engine-atlas/atlas.ts && npx tsx tools/engine-atlas/page.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const A = JSON.parse(readFileSync(join(REPO, "docs/engine-atlas.json"), "utf8"));

const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 行內強調：**粗體** 與 `程式碼`。 */
const rich = (s: unknown): string =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");

const PROV: Record<string, { label: string; cls: string }> = {
  import: { label: "引擎常數", cls: "p-import" },
  shipped: { label: "出貨檔", cls: "p-shipped" },
  measured: { label: "實測", cls: "p-measured" },
};

const chip = (p: string): string =>
  `<span class="chip ${PROV[p]?.cls ?? ""}">${esc(PROV[p]?.label ?? p)}</span>`;

const rowsTable = (rows: any[], keyHead: string, valHead: string): string => `
<div class="scroll"><table>
  <thead><tr><th>${esc(keyHead)}</th><th>${esc(valHead)}</th><th class="c">來源</th></tr></thead>
  <tbody>${rows
    .map(
      (r) => `<tr>
      <th scope="row">${rich(r.key)}</th>
      <td><div class="v">${rich(r.value)}</div>${r.note ? `<p class="note">${rich(r.note)}</p>` : ""}</td>
      <td class="c">${chip(r.from)}</td>
    </tr>`,
    )
    .join("")}</tbody>
</table></div>`;

const tokenList = (items: string[]): string =>
  `<ul class="tokens">${items.map((t) => `<li><code>${esc(t)}</code></li>`).join("")}</ul>`;

const SECTIONS: { id: string; title: string; lede: string; body: string }[] = [
  {
    id: "stack",
    title: "數值怎麼疊 —— 相加還是相乘",
    lede:
      "下面每一列都是**真的跑一次出貨的 `recomputeStats`** 之後讀回來的數字，不是宣稱。" +
      "選錯 `op` 就是 ×5 與 ×8 的差別。",
    body: rowsTable(A.stacking, "運算子", "實際觀察到的結果"),
  },
  {
    id: "caps",
    title: "上限：一條屬性有四道關卡",
    lede:
      "一個數字要真的到得了玩家身上，得同時過**結構夾限**、**上限表**（後台可調）、" +
      "**後台基礎加成上界**、以及**道具欄位帶**。任何一道漏掉，症狀都是「後台存得下去、玩家拿不到」。",
    body:
      rowsTable(A.caps, "屬性", "四道關卡") +
      `<h3>其他上限</h3>` +
      rowsTable(A.capsExtra, "項目", "值"),
  },
  {
    id: "env",
    title: "全域倍率（後台「戰鬥系統」頁）",
    lede: `${A.counts.combatEnvKeys} 格。每一格是一個 ×倍率；標「公式格」的那些不直接乘任何一條屬性，而是乘在算式的某一步上。`,
    body: rowsTable(A.env, "旋鈕", "出貨值"),
  },
  {
    id: "geo",
    title: "距離與範圍 —— 「大中小」的尺",
    lede:
      "形容詞沒有用，所以這裡全部用**出貨內容量到的分布**說話。" +
      `一個 duel zone 的半徑是 <b>${esc(A.oversizedAoe.zoneRadius)}</b>，所有範圍都該拿它當尺。`,
    body:
      rowsTable(A.geometry.rows, "量什麼", "分布") +
      `<div class="buckets">${A.geometry.buckets
        .map(
          (b: any) =>
            `<div class="bucket"><div class="bk-l">${esc(b.label)}</div><div class="bk-r">${esc(b.range)}</div><div class="bk-c">${esc(b.count)} 個</div></div>`,
        )
        .join("")}</div>`,
  },
  {
    id: "vocab",
    title: "JSON 的完整詞彙",
    lede:
      "引擎認得的全部 token。**不在這裡的東西寫不出來** —— 需要它就要先做機制（第〇·五守則），不是為某一支技能寫一個 if。",
    body: `
      <h3>效果 kind（${A.vocabulary.effectKinds.length}）</h3>${tokenList(A.vocabulary.effectKinds)}
      <h3>[xxx時] 觸發事件（${A.vocabulary.hookEvents.length}）</h3>${tokenList(A.vocabulary.hookEvents)}
      <h3>條件葉（${A.vocabulary.conditionLeafKinds.length}）</h3>${tokenList(A.vocabulary.conditionLeafKinds)}
      <h3>技能模板家族（${A.vocabulary.templateFamilies.length}）</h3>${tokenList(A.vocabulary.templateFamilies)}
      <h3>參數欄位（依用途分組）</h3>
      ${Object.entries(A.geometryFields)
        .map(([k, v]) => `<h4>${esc(k)}</h4>${tokenList(v as string[])}`)
        .join("")}`,
  },
  {
    id: "gaps",
    title: "還沒有的、以及已知壞掉的",
    lede: "⭐ 對外契約多一格「已知壞掉」—— 推導只回答「這個名詞在不在」，發不發得出來是另一回事。",
    body: `
      <h3>不支援（${A.unsupported.length}）</h3>${tokenList(A.unsupported)}
      <h3>部分支援 / 計畫中（${A.planned.length}）</h3>
      <div class="scroll"><table><thead><tr><th>capability</th><th>狀態</th><th>說明</th></tr></thead><tbody>
      ${A.planned
        .map(
          (p: any) =>
            `<tr><th scope="row"><code>${esc(p.key)}</code></th><td class="c"><span class="chip ${
              p.state === "partial" ? "p-shipped" : "p-import"
            }">${esc(p.state)}</span></td><td>${rich(p.caveat ?? p.plan ?? "")}</td></tr>`,
        )
        .join("")}
      </tbody></table></div>
      <h3 class="bad">已知壞掉（${A.knownBroken.length}）</h3>
      ${A.knownBroken
        .map(
          (b: any) =>
            `<div class="broken"><code>${esc(b.token)}</code><p>${rich(b.what)}</p></div>`,
        )
        .join("")}`,
  },
];

const html = `<title>GGD 引擎地圖 · 引擎到底組得出什麼</title>
<style>
:root{
  --bg:#0d1117; --surface:#151b24; --surface2:#1b2330; --line:#26303d;
  --ink:#e6edf3; --muted:#8b98a5; --dim:#6b7885;
  --accent:#5eead4; --amber:#f0a04b; --alarm:#ff6b6b;
  --mono:ui-monospace,SFMono-Regular,Menlo,"Roboto Mono",monospace;
  --cjk:"PingFang TC","Hiragino Sans CNS","Noto Sans TC","Microsoft JhengHei",sans-serif;
}
@media (prefers-color-scheme:light){:root{
  --bg:#f6f8fa; --surface:#fff; --surface2:#f0f3f6; --line:#d5dde5;
  --ink:#121a24; --muted:#57636f; --dim:#78848f;
  --accent:#0f766e; --amber:#a55a09; --alarm:#c0332e;
}}
:root[data-theme="light"]{
  --bg:#f6f8fa; --surface:#fff; --surface2:#f0f3f6; --line:#d5dde5;
  --ink:#121a24; --muted:#57636f; --dim:#78848f;
  --accent:#0f766e; --amber:#a55a09; --alarm:#c0332e;
}
:root[data-theme="dark"]{
  --bg:#0d1117; --surface:#151b24; --surface2:#1b2330; --line:#26303d;
  --ink:#e6edf3; --muted:#8b98a5; --dim:#6b7885;
  --accent:#5eead4; --amber:#f0a04b; --alarm:#ff6b6b;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:var(--cjk);font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px 96px;
  display:grid;grid-template-columns:190px minmax(0,1fr);gap:36px;align-items:start}
@media(max-width:900px){.wrap{grid-template-columns:1fr;gap:0}nav.rail{display:none}}

header.top{grid-column:1/-1;padding:52px 0 26px;border-bottom:1px solid var(--line);margin-bottom:30px}
h1{margin:0 0 6px;font-size:clamp(26px,4vw,40px);font-weight:800;letter-spacing:-.02em;text-wrap:balance}
.sub{margin:0;color:var(--muted);max-width:62ch}
.fp{margin-top:16px;font-family:var(--mono);font-size:12px;color:var(--dim)}
.fp b{color:var(--accent);font-weight:600}

.counts{grid-column:1/-1;display:grid;gap:10px;margin:0 0 30px;
  grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
.count{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:12px 14px}
.count b{display:block;font-family:var(--mono);font-size:26px;font-weight:700;
  color:var(--accent);font-variant-numeric:tabular-nums;line-height:1.2}
.count span{font-size:12px;color:var(--muted)}

nav.rail{position:sticky;top:20px}
nav.rail a{display:block;padding:6px 10px;color:var(--muted);text-decoration:none;
  border-left:2px solid var(--line);font-size:13px}
nav.rail a:hover,nav.rail a:focus-visible{color:var(--ink);border-left-color:var(--accent);background:var(--surface)}

section{margin:0 0 42px;scroll-margin-top:20px}
h2{margin:0 0 8px;font-size:21px;font-weight:700;letter-spacing:-.01em}
h2::before{content:"";display:inline-block;width:3px;height:17px;background:var(--accent);
  margin-right:9px;vertical-align:-2px;border-radius:1px}
h3{margin:26px 0 10px;font-size:15px;font-weight:700;color:var(--ink)}
h3.bad{color:var(--alarm)}
h4{margin:16px 0 6px;font-size:13px;font-weight:700;color:var(--muted)}
.lede{margin:0 0 16px;color:var(--muted);max-width:74ch}

.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:4px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;padding:10px 13px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{background:var(--surface2);color:var(--muted);font-size:11px;font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;position:sticky;top:0}
tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
tbody th{font-weight:600;white-space:nowrap;color:var(--ink)}
td.c,th.c{text-align:center;white-space:nowrap}
.v{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:12.5px}
.note{margin:6px 0 0;font-size:12.5px;color:var(--muted);line-height:1.6;max-width:70ch}
code{font-family:var(--mono);font-size:.9em;background:var(--surface2);
  padding:1px 5px;border-radius:3px;color:var(--ink)}

.chip{display:inline-block;font-size:10.5px;padding:2px 7px;border-radius:99px;
  border:1px solid currentColor;white-space:nowrap;font-weight:600}
.p-import{color:var(--dim)} .p-shipped{color:var(--amber)} .p-measured{color:var(--accent)}

ul.tokens{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
ul.tokens code{background:var(--surface);border:1px solid var(--line);padding:3px 8px;font-size:12px}

.buckets{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
.bucket{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:12px 14px}
.bk-l{font-size:19px;font-weight:800}
.bk-r{font-family:var(--mono);font-size:13px;color:var(--accent);font-variant-numeric:tabular-nums}
.bk-c{font-size:12px;color:var(--muted)}

.alarm{grid-column:1/-1;border:1px solid var(--alarm);border-left-width:3px;border-radius:4px;
  background:color-mix(in srgb,var(--alarm) 7%,var(--surface));padding:18px 20px;margin:0 0 32px}
.alarm.ok{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 7%,var(--surface))}
.alarm.ok h2,.alarm.ok .big{color:var(--accent)}
.alarm.ok h2::before{background:var(--accent)}
.alarm h2{color:var(--alarm)}
.alarm h2::before{background:var(--alarm)}
.alarm .big{font-family:var(--mono);font-size:15px;color:var(--alarm);font-weight:700;
  font-variant-numeric:tabular-nums;margin:2px 0 10px}
.broken{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--alarm);
  border-radius:4px;padding:12px 15px;margin-bottom:10px}
.broken p{margin:6px 0 0;font-size:13px;color:var(--muted);line-height:1.65}
footer{grid-column:1/-1;border-top:1px solid var(--line);padding-top:18px;
  color:var(--dim);font-size:12.5px}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
</style>

<div class="wrap">
<header class="top">
  <h1>GGD 引擎地圖</h1>
  <p class="sub">引擎到底組得出什麼 —— 每一格都是<b>推導</b>的：從引擎常數、出貨檔，或<b>真的跑一次</b>之後量到的結果。這一頁沒有任何手打的數字。</p>
  <p class="fp">capability fingerprint <b>${esc(A.capabilityFingerprint)}</b> · 產生器 <code>tools/engine-atlas/</code> · 重跑一次就是最新</p>
</header>

<div class="counts">
  ${[
    ["效果 kind", A.counts.effectKinds],
    ["[xxx時] 事件", A.counts.hookEvents],
    ["條件葉", A.counts.conditionLeafKinds],
    ["模板家族", A.counts.templateFamilies],
    ["參數欄位", A.counts.effectFields],
    ["屬性", A.counts.stats],
    ["全域倍率", A.counts.combatEnvKeys],
  ]
    .map(([l, v]) => `<div class="count"><b>${esc(v)}</b><span>${esc(l)}</span></div>`)
    .join("")}
</div>

${
  A.oversizedAoe.over.length > 0
    ? `<div class="alarm">
  <h2>這支工具量到的缺陷</h2>
  <p class="big">${A.oversizedAoe.over.length} / ${A.oversizedAoe.total} 支模板技能的實際 AoE 半徑超過整個 duel zone（半徑 ${A.oversizedAoe.zoneRadius}）</p>
  <div class="scroll"><table><thead><tr><th>技能</th><th class="c">實際半徑</th><th class="c">是 zone 的幾倍</th></tr></thead><tbody>
  ${A.oversizedAoe.over
    .map(
      (o: any) =>
        `<tr><th scope="row">${esc(o.name)} <code>${esc(o.id)}</code></th><td class="c v">${esc(o.radius)}</td><td class="c v">×${(o.radius / A.oversizedAoe.zoneRadius).toFixed(1)}</td></tr>`,
    )
    .join("")}
  </tbody></table></div>
</div>`
    : `<div class="alarm ok">
  <h2>更正：先前那份「29 支全場命中」是誤報</h2>
  <p class="big">${A.oversizedAoe.total} / ${A.oversizedAoe.total} 支模板技能的 AoE 半徑都在 zone 半徑 ${A.oversizedAoe.zoneRadius} 之內</p>
  <p class="lede">這一頁的第一版宣稱有 29 支技能「等於全場命中」（GH#310）。<b>那是錯的，錯在量尺。</b><br><br>
  WC3 單位換算一直都有做 —— <code>expand.ts</code> 的 <code>if (slot.unit === "wc3u") return toLen(v)</code>，
  係數 <code>GGD_PER_WC3 = 11/600</code>。513.5 × 11/600 = 9.41，與文件裡的 <code>radius</code> 逐位吻合。
  實際上線的半徑是 3.0–9.41。<br><br>
  第一版的量測對整個 <code>AbilityDef</code> 走訪、收集每一個叫 <code>radius</code> 的數字再取 <b>max</b>，
  於是同時撿到引擎的輸出 <code>9.41</code> 與作者填的原始輸入 <code>513.5</code>（<code>registries.ts</code> 是
  <b>刻意</b>保留 <code>template.params</code> 的，好讓模板升級能重新展開）。max 選了後者。<br><br>
  ⭐ 這正是 CLAUDE.md 失敗形態⑤「<b>被測的不是出貨的那個</b>」——
  發生在一支宣稱「引擎沒辦法對它說謊」的工具自己身上。現在直接讀 <code>def.radius</code>，不走訪。</p>
</div>`
}

<nav class="rail" aria-label="章節">
  ${SECTIONS.map((s) => `<a href="#${s.id}">${esc(s.title.split(" ")[0]!.replace(/[——:：].*/, ""))}</a>`).join("")}
</nav>

<main>
${SECTIONS.map(
  (s) => `<section id="${s.id}"><h2>${esc(s.title)}</h2><p class="lede">${rich(s.lede)}</p>${s.body}</section>`,
).join("")}
</main>

<footer>
  來源分三級：<span class="chip p-import">引擎常數</span> 直接讀登錄表／常數
  <span class="chip p-shipped">出貨檔</span> 讀 <code>content/</code>
  <span class="chip p-measured">實測</span> 真的跑一次再把結果寫下來。<br>
  ⛔ 這一頁刻意沒有日期 —— 有時間戳就沒辦法用「重新產生 → 逐位元比對」當閘。要判斷新不新，看上面那個 fingerprint。
</footer>
</div>`;

writeFileSync(join(REPO, "docs/engine-atlas.html"), html);
console.log("✓ docs/engine-atlas.html");
