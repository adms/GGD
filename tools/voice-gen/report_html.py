#!/usr/bin/env python3
"""The per-champion audition page.

The owner is not going to listen to 2,208 clips. This page exists so he listens
to the FLAGGED ones — grouped by champion, worst first, each row carrying the
number that flagged it and a play button next to that number.

Deliberately a single self-contained file with no external requests: it is
opened straight off disk with `open qa.html`, often from a scratch directory
that no server is pointed at. Audio is referenced by relative path, so keep the
report next to (or above) the clips.

Stdlib only. This must run in the same bare-python3 stage as the gate.
"""
from __future__ import annotations

import html
import json
import os

VERDICT_ORDER = ["blocked", "fallback", "retry", "review", "pass"]
VERDICT_LABEL = {
    "pass": "PASS",
    "review": "REVIEW",
    "retry": "RETRY",
    "fallback": "FALLBACK",
    "blocked": "BLOCKED",
}
VERDICT_BLURB = {
    "pass": "No defect found. That is not the same as good — see the limits.",
    "review": "The tool cannot judge this one. Listen.",
    "retry": "Defective, but the cheap fix is unspent: re-render best-of-N on the "
             "same engine.",
    "fallback": "Defective and the same engine has had its chances. Re-render on "
                "the other engine and keep whichever scores better.",
    "blocked": "Defective, and rerouting cannot help — IndexTTS-2 cannot speak "
               "Japanese without a romaji reading. Fix the kana spelling.",
}

CSS = """
*,*::before,*::after{box-sizing:border-box}
:root{
  --bg:#fbfaf8; --fg:#1a1a1a; --muted:#6b6b6b; --line:#e2e0dc; --card:#fff;
  --pass:#2e7d4f; --review:#8a6d1f; --retry:#1f5f8a; --fallback:#a33a2a;
  --blocked:#6b2f8a; --accent:#1a1a1a;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#16151a; --fg:#ece9e4; --muted:#a09c95; --line:#302e36; --card:#1e1d24;
  --pass:#6cc48d; --review:#d9b64e; --retry:#68b0e0; --fallback:#e88a76;
  --blocked:#c194e0; --accent:#ece9e4;
}}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);
  font:15px/1.55 ui-sans-serif,-apple-system,"Hiragino Sans","Noto Sans JP",system-ui,sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:1.55rem;margin:0 0 4px;letter-spacing:-.01em}
h2{font-size:1.1rem;margin:36px 0 10px;letter-spacing:-.01em}
.sub{color:var(--muted);margin:0 0 24px;font-size:.9rem}
.tiles{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 8px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;
  padding:10px 16px;min-width:104px}
.tile .n{font-size:1.5rem;font-weight:650;font-variant-numeric:tabular-nums;
  line-height:1.1}
.tile .k{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;
  color:var(--muted)}
.limits{background:var(--card);border:1px solid var(--line);
  border-left:3px solid var(--review);border-radius:8px;padding:14px 18px;margin:18px 0}
.limits h3{margin:0 0 8px;font-size:.82rem;text-transform:uppercase;
  letter-spacing:.07em;color:var(--review)}
.limits li{margin:6px 0}
.limits ul{margin:0;padding-left:18px}
details{background:var(--card);border:1px solid var(--line);border-radius:10px;
  margin:10px 0;overflow:hidden}
summary{cursor:pointer;padding:12px 16px;font-weight:600;display:flex;
  flex-wrap:wrap;gap:10px;align-items:baseline}
summary::-webkit-details-marker{display:none}
summary::before{content:"▸";color:var(--muted);font-weight:400}
details[open] summary::before{content:"▾"}
.champ{flex:1;min-width:140px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.85rem;min-width:720px}
th,td{text-align:left;padding:7px 10px;border-top:1px solid var(--line);
  vertical-align:top}
th{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;
  color:var(--muted);font-weight:600}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:.68rem;
  font-weight:700;letter-spacing:.04em;border:1px solid currentColor}
.v-pass{color:var(--pass)} .v-review{color:var(--review)}
.v-retry{color:var(--retry)} .v-fallback{color:var(--fallback)}
.v-blocked{color:var(--blocked)}
.why{color:var(--muted);font-size:.8rem;max-width:38ch}
.ja{font-size:.86rem}
audio{height:30px;max-width:180px;vertical-align:middle}
.legend{font-size:.83rem;color:var(--muted);margin:6px 0 0}
.legend b{color:var(--fg)}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);
  color:var(--muted);font-size:.8rem}
code{font:.85em ui-monospace,SFMono-Regular,Menlo,monospace;
  background:color-mix(in srgb,var(--fg) 7%,transparent);padding:1px 5px;border-radius:4px}
"""


def _n(v, digits: int = 3) -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.{digits}f}"
    return str(v)


def _pct(v) -> str:
    return "—" if v is None else f"{v * 100:.2f}%"


def _clip_row(r: dict, base: str) -> str:
    e = html.escape
    verdict = r.get("verdict", "pass")
    src = r.get("out") or ""
    try:
        rel = os.path.relpath(src, base)
    except ValueError:
        rel = src
    player = (f'<audio controls preload="none" src="{e(rel)}"></audio>'
              if src else "—")
    why = "; ".join(r.get("reasons") or []) or "; ".join(r.get("advisories") or [])
    return (
        "<tr>"
        f'<td><span class="badge v-{verdict}">{VERDICT_LABEL.get(verdict, verdict)}</span></td>'
        f"<td><code>{e(r.get('id', ''))}</code></td>"
        f"<td class='ja'>{e(str(r.get('text') or r.get('expectKana') or ''))}</td>"
        f"<td class='num'>{_n(r.get('spkSim'))}</td>"
        f"<td class='num'>{_n(r.get('asrCer'), 2)}</td>"
        f"<td class='num'>{_pct(r.get('clippedFraction'))}</td>"
        f"<td class='num'>{_n(r.get('durationSec'), 2)}s</td>"
        f"<td class='ja'>{e(str(r.get('transcript') or '—'))}</td>"
        f"<td>{player}</td>"
        f'<td class="why">{e(why)}</td>'
        "</tr>")


def render(report: dict, base: str) -> str:
    e = html.escape
    totals = report.get("totals", {})
    clips = report.get("clips", [])
    by_champ: dict[str, list] = {}
    for r in clips:
        by_champ.setdefault(r.get("champion") or "—", []).append(r)

    rank = {v: i for i, v in enumerate(VERDICT_ORDER)}

    def champ_sort(item):
        name, rows = item
        flagged = sum(1 for r in rows
                      if r.get("verdict") in ("blocked", "fallback", "retry"))
        worst = min((rank.get(r.get("verdict"), 9) for r in rows), default=9)
        return (-flagged, worst, name)

    tiles = "".join(
        f'<div class="tile"><div class="n">{totals.get(k, 0)}</div>'
        f'<div class="k">{k}</div></div>'
        for k in ("measured", "pass", "review", "retry", "fallback", "blocked",
                  "notRendered"))

    limits = "".join(f"<li>{e(x)}</li>" for x in report.get("limitations", []))
    gate = report.get("gate", {})

    sections = []
    for name, rows in sorted(by_champ.items(), key=champ_sort):
        rows = sorted(rows, key=lambda r: (rank.get(r.get("verdict"), 9),
                                           r.get("spkSim") if r.get("spkSim")
                                           is not None else 9))
        counts = {}
        for r in rows:
            counts[r.get("verdict")] = counts.get(r.get("verdict"), 0) + 1
        chips = " ".join(
            f'<span class="badge v-{v}">{counts[v]} {VERDICT_LABEL.get(v, v)}</span>'
            for v in VERDICT_ORDER if counts.get(v))
        flagged = sum(counts.get(v, 0) for v in ("blocked", "fallback", "retry"))
        body = "".join(_clip_row(r, base) for r in rows)
        sections.append(
            f"<details{' open' if flagged else ''}>"
            f'<summary><span class="champ">{e(name)}</span>{chips}</summary>'
            '<div class="scroll"><table><thead><tr>'
            "<th>verdict</th><th>id</th><th>line</th><th>spk sim</th><th>asr err</th>"
            "<th>clipped</th><th>dur</th><th>heard</th><th>listen</th><th>why</th>"
            f"</tr></thead><tbody>{body}</tbody></table></div></details>")

    return f"""<title>voice-gen QA — audition report</title>
<style>{CSS}</style>
<div class="wrap">
<h1>voice-gen QA — audition report</h1>
<p class="sub">{e(str(report.get('manifest', '')))} · shard {e(str(report.get('shard', '')))}
 · {e(str(report.get('generatedAt', '')))}</p>

<div class="tiles">{tiles}</div>
<p class="legend"><b>Decides:</b> {e(', '.join(gate.get('decides', [])))}.
 <b>Informs only:</b> {e(', '.join(gate.get('informsOnly', [])))}.
 Speaker-similarity gate {e(str(gate.get('minSpeakerSim')))}, retry floor
 {e(str(gate.get('retryFloor')))}.</p>

<div class="limits">
<h3>What these numbers cannot see</h3>
<ul>{limits}</ul>
</div>

<h2>By champion — flagged first</h2>
<p class="sub">Every champion with a RETRY, FALLBACK or BLOCKED line is expanded.
Play the clip next to the number that flagged it. If it sounds right to you, it
is right — overrule the gate.</p>
{''.join(sections)}

<footer>
{e(VERDICT_BLURB['fallback'])}<br>
Generated by <code>tools/voice-gen/qa.py</code>. Thresholds and the measurements
behind them are in <code>tools/voice-gen/score.py</code>.
</footer>
</div>
"""


def write(report: dict, path: str) -> str:
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(render(report, os.path.dirname(path)))
    return path


if __name__ == "__main__":       # `report_html.py qa.json qa.html`
    import sys
    if len(sys.argv) != 3:
        sys.exit("usage: report_html.py REPORT.json OUT.html")
    write(json.load(open(sys.argv[1], encoding="utf-8")), sys.argv[2])
