#!/usr/bin/env python3
"""Build the SELF-CONTAINED hosted page for the 13 per-arena battle themes.

    python3 tools/bgm-gen/src/hosted_page.py [out.html]

owner 2026-07-29 是常設規矩:「以後都用 hosted 頁面吧 **這樣才有機會留歷史記錄資料**」，
2026-08-22 又說「**不要再給我 localhost 了喔**」。`bgm-audition.html` 靠 dev server 的
`/content/**` 路徑取音檔，⛔ 一離開那台機器就是 13 個 0:00 的播放器 —— 所以 hosted 版
必須把音訊**帶在身上**。

⚠️ 為什麼是內嵌而不是資產上傳：artifact 的 `assets` 能力這個帳號沒有開，
所以唯一的路是 data: URI，而頁面有 **16 MB** 上限。實測：
    AAC 48k 單聲道 → 8.7 MB · **AAC 64k → 11.6 MB** · mp3 64k → 11.2 MB · mp3 96k → 16.9 MB(爆)
⇒ 取 AAC 64k 單聲道。⛔ 這是**預覽品質**,出貨檔仍是 128 kbps 立體聲,頁面上明講。

⭐ 弧線是用**量到的**每段 RMS 畫的,⛔ 不是畫一個示意圖:看到的形狀就是檔案裡的形狀。
"""
from __future__ import annotations

import base64
import html
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

import numpy as np                                              # noqa: E402
from ggd import aot                                             # noqa: E402

BGM = os.path.join(ROOT, "content", "assets", "audio", "bgm")
MANIFEST = os.path.join(BGM, "MANIFEST.json")
LINES = os.path.join(ROOT, "tools", "bgm-gen", "vox", "lines.json")
ENV_MAN = os.path.join(ROOT, "tools", "bgm-gen", "env", "MANIFEST.json")
SR = 44100
BAR = 4 * 60.0 / aot.BPM
#: The dB window the arc bars are drawn against. Fixed across all 13 so the
#: shapes are COMPARABLE — a per-track autoscale would make every arc look
#: identical, which is the one thing this drawing exists to disprove.
DB_LO, DB_HI = -21.0, -12.0
SECTIONS = [("純環境音", *aot.ENV_ONLY), ("招牌旋律", *aot.SIGNATURE),
            ("熱血驅動", *aot.DRIVE), ("收束靜止低潮", *aot.HOLLOW),
            ("轉折", *aot.TURN), ("高潮", *aot.CLIMAX), ("回落→LOOP", *aot.DESCENT)]
#: ⭐ Derived from the section NAMES, so adding or reordering a section can never
#: again make the page quote a different pair of numbers than it claims to.
I_ENV = [n for n, *_ in SECTIONS].index("純環境音")
I_LOW = [n for n, *_ in SECTIONS].index("收束靜止低潮")
I_PEAK = [n for n, *_ in SECTIONS].index("高潮")


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def pcm(path: str) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le",
                          "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def arc_db(x: np.ndarray) -> list[float]:
    out = []
    for _n, b0, b1 in SECTIONS:
        seg = x[int(b0 * BAR * SR):int(b1 * BAR * SR)]
        out.append(round(float(20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-12)), 1))
    return out


def preview_b64(path: str, tmp: str) -> str:
    out = os.path.join(tmp, os.path.basename(path) + ".m4a")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path, "-ac", "1",
                    "-c:a", "aac", "-b:a", "64k", out], check=True)
    with open(out, "rb") as fh:
        return base64.b64encode(fh.read()).decode("ascii")


CSS = """
:root{
  /* Dark-first on purpose: this is a listening tool for a night-time arena game,
     and the arc drawing only reads against a dark ground. Both themes are still
     defined as complete token sets. */
  --ground:#0B0E16; --surface:#151B29; --raise:#1C2334; --edge:#28314A;
  --ink:#E6EBF7; --dim:#8C99B8; --faint:#5D688A;
  --cold:#5B739E;      /* the hollow — steel */
  --ember:#FF6A45;     /* the climax — the one hot colour on the page */
  --ok:#5FD1A0; --warn:#E0A33C;
}
/* ⭐ SINGLE-THEME BY CHOICE, not by omission. The arc drawing is the page's
   whole argument, and it works by a bright ember peak reading against a dark
   floor — invert it and the loudest section becomes the palest. So every token
   is defined once, on bare :root, and `body` paints its own ground: the page
   therefore holds identically whichever theme the viewer's host is in.
   ⛔ Do not add a half-written [data-theme="light"] block — a token defined only
   inside such a block never applies in the un-stamped "system" state, which is
   what most viewers actually see. */
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--ground);color:var(--ink);
  font:16px/1.7 "Noto Sans TC","Hiragino Sans","Microsoft JhengHei",system-ui,sans-serif;
  padding:clamp(20px,4vw,52px) clamp(14px,4vw,32px) 90px;
}
.wrap{max-width:840px;margin:0 auto;display:flex;flex-direction:column;gap:30px}

header{display:flex;flex-direction:column;gap:12px}
.eyebrow{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;
  letter-spacing:.20em;text-transform:uppercase;color:var(--ember)}
h1{font-family:"Noto Serif TC",serif;font-weight:900;font-size:clamp(30px,5.5vw,46px);
  line-height:1.2;margin:0;text-wrap:balance;letter-spacing:.01em}
.lede{color:var(--dim);max-width:62ch;margin:0;font-size:15px}
.lede b{color:var(--ink);font-weight:500}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;
  background:var(--edge);border:1px solid var(--edge);border-radius:12px;overflow:hidden}
.stat{background:var(--surface);padding:14px 16px;display:flex;flex-direction:column;gap:3px}
.stat .n{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:23px;font-weight:500;
  font-variant-numeric:tabular-nums;color:var(--ink);line-height:1.1}
.stat .l{font-size:11px;color:var(--faint);letter-spacing:.06em}

.card{background:var(--surface);border:1px solid var(--edge);border-radius:14px;
  padding:20px clamp(16px,3vw,24px);display:flex;flex-direction:column;gap:14px}
.card.quiet{opacity:.94}
.top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.name{font-family:"Noto Serif TC",serif;font-weight:900;font-size:24px;line-height:1.25}
.aid{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;color:var(--faint)}
.work{margin-left:auto;font-size:12px;color:var(--cold);border:1px solid var(--cold);
  border-radius:999px;padding:2px 10px;white-space:nowrap}
.work.none{color:var(--faint);border-color:var(--edge)}

.spec{display:flex;flex-wrap:wrap;gap:4px 16px;font-family:"IBM Plex Mono",ui-monospace,monospace;
  font-size:12px;color:var(--dim);font-variant-numeric:tabular-nums}

/* the arc — heights are MEASURED, not decorative */
.arc{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;align-items:end;
  height:96px;padding:0;margin:2px 0 0}
.seg{position:relative;display:flex;flex-direction:column;justify-content:flex-end;height:100%}
.seg .bar{border-radius:3px 3px 0 0;background:var(--cold);transition:none}
.seg.env .bar{background:linear-gradient(180deg,#3B4A6B,transparent 160%)}
.arclabels span.env{color:#7E92BE}
.seg.low .bar{background:linear-gradient(180deg,var(--faint),transparent 140%)}
.seg.peak .bar{background:linear-gradient(180deg,var(--ember),#B8402A)}
.seg .db{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10px;color:var(--faint);
  text-align:center;padding-bottom:3px;font-variant-numeric:tabular-nums}
.arclabels{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-top:6px}
.arclabels span{font-size:10.5px;color:var(--dim);text-align:center;line-height:1.35}
.arclabels span b{display:block;color:var(--faint);font-family:"IBM Plex Mono",monospace;
  font-weight:400;font-size:9.5px}
.arclabels span.peak{color:var(--ember)}

.row{display:flex;gap:9px;font-size:13.5px;line-height:1.6}
.row .k{flex:0 0 62px;color:var(--faint);font-size:11.5px;padding-top:3px;letter-spacing:.04em}
.row .v{flex:1;min-width:0;color:var(--dim)}
.row .v em{font-style:normal;color:var(--ink)}

.quote{background:var(--raise);border-left:2px solid var(--cold);border-radius:0 8px 8px 0;
  padding:11px 14px;display:flex;flex-direction:column;gap:5px}
.quote .jp{font-family:"Noto Serif TC",serif;font-size:19px;font-weight:700;color:var(--ink);
  line-height:1.45}
.quote .meta{font-size:11.5px;color:var(--faint);font-family:"IBM Plex Mono",monospace;
  font-variant-numeric:tabular-nums}
.chip{display:inline-block;font-size:10.5px;border-radius:4px;padding:1px 7px;margin-left:8px;
  vertical-align:2px;font-family:"Noto Sans TC",sans-serif}
.chip.high{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}
.chip.medium{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}

audio{width:100%;height:36px;border-radius:8px}
footer{color:var(--faint);font-size:12.5px;border-top:1px solid var(--edge);padding-top:20px;
  display:flex;flex-direction:column;gap:8px}
footer code{font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--dim)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
"""


def build() -> str:
    man = json.load(open(MANIFEST, encoding="utf-8"))["mapThemes"]
    lines = json.load(open(LINES, encoding="utf-8"))["arenas"]
    env = json.load(open(ENV_MAN, encoding="utf-8"))["scenes"]
    by_arena = {t["arena"]: t for t in man["tracks"]}

    cards, drops = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for arena, m in aot.MAPS.items():
            t = by_arena[arena]
            path = os.path.join(BGM, t["file"])
            db = arc_db(pcm(path))
            # ⚠️ 索引是**推導**出來的,⛔ 不是硬寫 4 與 2。SECTIONS 從六段變七段
            # (加了「純環境音」與「招牌旋律」)時,寫死的索引悄悄變成算「轉折 − 熱血」,
            # 頁面就印出一個負的「低潮→高潮」。名字不會位移,位置會。
            drops.append(round(db[I_PEAK] - db[I_LOW], 1))
            b64 = preview_b64(path, tmp)
            v = lines.get(arena)

            segs, labs = [], []
            for i, (nm, b0, b1) in enumerate(SECTIONS):
                frac = max(0.06, min(1.0, (db[i] - DB_LO) / (DB_HI - DB_LO)))
                cls = "env" if i == I_ENV else ("low" if i == I_LOW else
                                                ("peak" if i == I_PEAK else ""))
                segs.append(f"<div class='seg {cls}'><div class='db'>{db[i]:.1f}</div>"
                            f"<div class='bar' style='height:{frac*100:.0f}%'></div></div>")
                labs.append(f"<span class='{cls}'>{esc(nm)}<b>{b0}–{b1}</b></span>")

            sfx = " ＋ ".join(f"{title}<span style='color:var(--faint)'>（{role}）</span>"
                             for _r, title, _g, role in env[arena])
            quotes = ""
            if v:
                seen = []
                for ln in v["lines"]:
                    if ln["text"] in [q[0] for q in seen]:
                        seen[[q[0] for q in seen].index(ln["text"])][1].append(ln["bar"])
                        continue
                    seen.append([ln["text"], [ln["bar"]], ln["confidence"]])
                for text, bars, conf in seen:
                    lbl = {"high": "原文把握 高", "medium": "原文把握 中"}.get(conf, "GGD 原創")
                    quotes += (f"<div class='quote'><div class='jp'>「{esc(text)}」"
                               f"<span class='chip {esc(conf)}'>{esc(lbl)}</span></div>"
                               f"<div class='meta'>bar {' · bar '.join(f'{b:g}' for b in bars)}"
                               f" · {esc(v['work'])}</div></div>")
            work = (f"<span class='work'>{esc(v['work'])}</span>" if v
                    else "<span class='work none'>非改編作品 · 無名句</span>")

            cards.append(
                f"<article class='card{'' if v else ' quiet'}'>"
                f"<div class='top'><span class='name'>{esc(m['name'])}</span>"
                f"<span class='aid'>{esc(arena)}</span>{work}</div>"
                f"<div class='spec'><span>{t['durationSec']:.1f}s</span><span>135 bpm</span>"
                f"<span>D 小調</span><span>48 小節 = loop 格線 ×2</span>"
                f"<span>低潮→高潮 {db[I_PEAK]-db[I_LOW]:+.1f} dB</span></div>"
                f"<div><div class='arc'>{''.join(segs)}</div>"
                f"<div class='arclabels'>{''.join(labs)}</div></div>"
                f"<div class='row'><span class='k'>場景音效</span>"
                f"<span class='v'>{sfx}</span></div>"
                f"{quotes}"
                f"<audio controls preload='metadata' "
                f"src='data:audio/mp4;base64,{b64}'></audio></article>")

    lo, hi = min(drops), max(drops)
    med = sorted(drops)[len(drops) // 2]
    n_quote = sum(1 for a in aot.MAPS if a in lines)
    return (
        "<title>GGD 場地戰鬥曲</title>"
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        'family=Noto+Sans+TC:wght@400;500&family=Noto+Serif+TC:wght@700;900&'
        'family=IBM+Plex+Mono:wght@400;500&display=swap">'
        f"<style>{CSS}</style>"
        "<div class='wrap'><header>"
        "<div class='eyebrow'>GH#531 · 2026-08-22</div>"
        "<h1>十三張場地，十三首戰鬥曲</h1>"
        "<p class='lede'>在這之前，十三張場地共用同一首 <b>combat</b>。"
        "每一首都是同一條弧線：<b>純環境音</b> → 招牌旋律 → 熱血驅動 → "
        "<b>收束靜止低潮</b> → <b>轉折</b> → <b>高潮</b> → 回落成 LOOP。"
        "下面每張卡片的弧線是<b>量出來的</b>——柱高就是那一段在檔案裡的實際 RMS，"
        "⛔ 不是示意圖。</p>"
        "<p class='lede'>⭐ <b>開頭 3.6 秒一件樂器都沒有</b>，只有那張圖自己的環境音"
        "（實測 −29～−33 dB，而接著進來的招牌旋律比它大 +11～+17 dB）。"
        "接著是<b>那張圖專屬的旋律</b>，用<b>那張圖專屬的樂器</b>——"
        "十三張的音色與旋律全部不重複。</p>"
        "<p class='lede'>⭐ <b>每張圖的主旋律用的是「那個設定的時代樂器」</b>，十三種全不重複——"
        "大正日本的三味線、古羅馬的銅管、魔獸人類主題的蘇格蘭風笛、骷髏場的木琴（死亡之舞）、"
        "巨人來襲的警鐘。三張刻意留在<b>現代</b>：現代都市高塔、電子競技、未來大逃殺。</p>"
        "<p class='lede'>⚠️ 「聽起來太現代」量到的原因<b>不是樂器</b>，是四個製作慣例："
        "側鏈抽吸、supersaw、reese 低音、四四拍鼓組。十張已全部關掉——"
        "實測抽吸深度 <b>4.0–5.4 dB</b>（現代那三張是 7.6–7.8），零重疊。</p>"
        "<p class='lede'>樂器是 <b>MuseScore_General.sf3</b>（MIT）的真實錄音經 fluidsynth 演奏；"
        "場景音效是 <b>Warcraft III 原作環境音</b>（遊戲一支都沒綁，所以不會被誤判成技能）；"
        "名句由 <b>CosyVoice 3</b> 預先算成檔案，沒有名句的六張場地則由"
        "<b>合唱團唱該圖的旋律</b>。⛔ 全曲不含任何合成過場件。</p>"
        "</header>"
        "<div class='stats'>"
        f"<div class='stat'><span class='n'>13</span><span class='l'>場地 · 每張一首</span></div>"
        f"<div class='stat'><span class='n'>13/13</span><span class='l'>通過全部音訊閘</span></div>"
        f"<div class='stat'><span class='n'>{lo}–{hi}</span>"
        f"<span class='l'>低潮→高潮 dB（中位 {med}）</span></div>"
        f"<div class='stat'><span class='n'>13</span><span class='l'>不重複音色 · 不重複環境音</span></div>"
        "</div>"
        + "".join(cards) +
        "<footer>"
        "<div>⚠️ 這裡的音檔是 <b>AAC 64 kbps 單聲道預覽</b>，為了讓整頁自帶音訊。"
        "出貨檔是 128 kbps 立體聲，−16 LUFS，真峰 ≤ −1 dBTP。</div>"
        "<div>⛔ 火圈不受影響：那是對著時鐘寫的緊急 cue，在每張圖上都該是同一個意思。</div>"
        "<div>⛔ 場景音效不使用遊戲已在播的任何音效 —— 之前那批有 3 支與 castBegin / "
        "exUnlock / matchStart <b>逐檔相同</b>，會讓玩家誤判成有人施法。</div>"
        "<div>逐筆授權見 <code>content/assets/CREDITS.md</code>；"
        "舊版曲子留在 <code>docs/legacy/_bgm-versions/</code>，⛔ 不覆蓋刪除。</div>"
        "</footer></div>")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.environ.get("TMPDIR", "/tmp"), "ggd-map-themes.html")
    h = build()
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(h)
    print(f"wrote {out}  ({len(h.encode())/1048576:.1f} MB)")
