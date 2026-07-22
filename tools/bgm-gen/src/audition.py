#!/usr/bin/env python3
"""Regenerate apps/client/public/bgm-audition.html — audition the WHOLE audio
pack in the browser: all 12 self-made BGM tracks (the theme is TWO tracks now —
the epic menu bed + the serene menuNocturne that rotates with it) AND every SFX
cue, each with a play button for testing.

No 魔王魂 anywhere any more. That pack is gone, not shipped, and its files were
overwritten during rendering — there is nothing to compare against and no reason
to name it. This is a straight auditor of the finished, self-made pack.

Durations are MEASURED with ffprobe; everything else is read from the manifest
and content/config/audio-map.json, so the page can never disagree with what the
game actually loads.

    python3 tools/bgm-gen/src/audition.py
"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BGM_DIR = os.path.join(ROOT, "content", "assets", "audio", "bgm")
CONTENT = os.path.join(ROOT, "content")
MANIFEST = os.path.join(BGM_DIR, "MANIFEST.json")
AUDIO_MAP = os.path.join(ROOT, "content", "config", "audio-map.json")
OUT = os.path.join(ROOT, "apps", "client", "public", "bgm-audition.html")

# The two theme tracks lead the list; the rest follow in play order.
THEME = ["menu", "menuNocturne"]
REST_ORDER = [
    "lobby", "champSelect", "battleStart", "combat", "fireRing",
    "room", "intermission", "settlement", "victory", "defeat",
]

SCENE_ZH = {
    "menu": "主題曲 · 史詩", "menuNocturne": "主題曲 · 寧靜女聲",
    "lobby": "大廳", "champSelect": "選英雄", "battleStart": "開戰",
    "combat": "戰鬥", "fireRing": "火環（場地危機）", "room": "控室",
    "intermission": "中場（商店）", "settlement": "結算", "victory": "勝利",
    "defeat": "戰敗",
}

# SFX groups, in display order, keyed by a folder/name predicate.
SFX_GROUPS = [
    ("介面 UI", lambda k, f: k.startswith(("ui", "count", "champSelect", "button", "hover", "click"))),
    ("戰鬥 Combat", lambda k, f: any(s in k.lower() for s in ("attack", "hit", "crit", "block", "guard", "knock", "whiff", "damage", "cast", "projectile", "flower"))),
    ("旁白 Announcer", lambda k, f: bool(f) and "announcer" in f[0]),
    ("其他 Misc", lambda k, f: True),
]


def duration(path: str) -> float:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=20,
        ).stdout.strip()
        return round(float(out), 2)
    except Exception:
        return 0.0


def url_for(content_rel: str) -> str:
    """A content-relative path -> the URL the dev server serves it at."""
    return "/content/" + content_rel.lstrip("/")


def bgm_rows() -> list[dict]:
    man = json.load(open(MANIFEST, encoding="utf-8"))
    meta = {t["scene"]: t for t in man["tracks"]}
    amap = json.load(open(AUDIO_MAP, encoding="utf-8"))["bgm"]
    order = THEME + [s for s in REST_ORDER if s in meta]
    order += [s for s in meta if s not in order]  # never silently drop a track
    rows = []
    for scene in order:
        m = meta[scene]
        path = os.path.join(BGM_DIR, f"{scene}.mp3")
        rows.append({
            "scene": scene,
            "zh": SCENE_ZH.get(scene, scene),
            "title": m.get("title", scene),
            "mood": m.get("mood", ""),
            "bpm": m.get("bpm"), "key": m.get("key"),
            "sec": duration(path),
            "loop": bool(m.get("loop")),
            "gain": amap.get(scene, {}).get("gain"),
            "url": url_for(f"assets/audio/bgm/{scene}.mp3"),
            "theme": scene in THEME,
        })
    return rows


def sfx_rows():
    amap = json.load(open(AUDIO_MAP, encoding="utf-8"))["sfx"]
    rows = []
    for key, v in amap.items():
        files = v.get("files", [])
        first = os.path.join(CONTENT, files[0]) if files else ""
        rows.append({
            "key": key,
            "files": files,
            "sec": duration(first) if first and os.path.exists(first) else 0.0,
            "gain": v.get("gain"),
            "cooldownMs": v.get("cooldownMs"),
            "url": url_for(files[0]) if files else "",
            "variants": len(files),
        })
    grouped: dict = {name: [] for name, _ in SFX_GROUPS}
    for r in rows:
        for name, pred in SFX_GROUPS:
            if pred(r["key"], r["files"]):
                grouped[name].append(r)
                break
    return [(name, grouped[name]) for name, _ in SFX_GROUPS if grouped[name]]


CSS = """
:root{--bg:#0c0f1a;--panel:#161b2c;--line:#28304a;--ink:#e7ecf7;--dim:#93a0c0;--accent:#f2a13c;--theme:#7ea2ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "Segoe UI",system-ui,sans-serif;padding:28px 18px 80px}
.wrap{max-width:960px;margin:0 auto}
h1{font-size:24px;margin:0 0 4px}
.sub{color:var(--dim);margin:0 0 24px;max-width:70ch}
h2{font-size:16px;margin:30px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line);color:var(--accent)}
h2.grp{font-size:14px;color:var(--dim);border:0;margin:18px 0 6px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px}
.card.theme{border-color:var(--theme)}
.hd{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.hd .zh{font-weight:700}
.hd .en{color:var(--dim);font-size:13px}
.badge{font-size:11px;color:var(--theme);border:1px solid var(--theme);border-radius:4px;padding:1px 6px}
.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--dim);font-size:12px;margin:4px 0 8px;font-variant-numeric:tabular-nums}
.mood{color:#c3cbdd;font-size:13px;margin:2px 0 8px}
audio{width:100%;height:34px}
.sfxrow{display:grid;grid-template-columns:200px 1fr;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}
.sfxrow:last-child{border-bottom:0}
.sfxrow .k{font-weight:600;font-size:13px}
.sfxrow .k small{display:block;color:var(--dim);font-weight:400;font-variant-numeric:tabular-nums}
.sfxrow audio{max-width:360px}
@media(max-width:640px){.sfxrow{grid-template-columns:1fr}}
"""


def esc(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def render() -> str:
    bgm = bgm_rows()
    sfx = sfx_rows()
    p = ['<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         "<title>GGD 音樂・音效試聽</title>", "<style>", CSS, "</style></head><body><div class='wrap'>"]
    p.append("<h1>GGD 音樂・音效試聽</h1>")
    p.append("<p class='sub'>全部為本專案自製／授權素材，可直接播放測試。"
             "主題曲收錄兩首（史詩版 + 寧靜女聲版，登入頁輪播）。時長為 ffprobe 實測。</p>")

    p.append(f"<h2>背景音樂 BGM（{len(bgm)} 首）</h2>")
    for r in bgm:
        cls = "card theme" if r["theme"] else "card"
        badge = "<span class='badge'>主題曲</span>" if r["theme"] else ""
        p.append(f"<div class='{cls}'>")
        p.append(f"<div class='hd'><span class='zh'>{esc(r['zh'])}</span>"
                 f"<span class='en'>{esc(r['title'])}</span>{badge}</div>")
        meta = [f"{r['sec']:.1f}s", f"gain {r['gain']}", "loop" if r["loop"] else "one-shot"]
        if r["bpm"]:
            meta.append(f"{r['bpm']}bpm")
        if r["key"]:
            meta.append(esc(r["key"]))
        p.append("<div class='meta'>" + " · ".join(str(m) for m in meta) + "</div>")
        if r["mood"]:
            p.append(f"<div class='mood'>{esc(r['mood'])}</div>")
        p.append(f"<audio controls preload='none' src='{r['url']}'></audio></div>")

    total_sfx = sum(len(rows) for _, rows in sfx)
    p.append(f"<h2>音效 SFX（{total_sfx} 個事件，可播放測試）</h2>")
    for name, rows in sfx:
        p.append(f"<h2 class='grp'>{esc(name)}（{len(rows)}）</h2><div class='card'>")
        for r in rows:
            v = f" ×{r['variants']}" if r["variants"] > 1 else ""
            sub = f"{r['sec']:.2f}s · gain {r['gain']} · cd {r['cooldownMs']}ms{v}"
            player = (f"<audio controls preload='none' src='{r['url']}'></audio>"
                      if r["url"] else "<span style='color:var(--dim)'>(no file)</span>")
            p.append(f"<div class='sfxrow'><div class='k'>{esc(r['key'])}<small>{sub}</small></div>"
                     f"<div>{player}</div></div>")
        p.append("</div>")

    p.append("</div></body></html>")
    return "".join(p)


def main() -> None:
    html = render()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"wrote {OUT}")
    print(f"  {len(bgm_rows())} BGM tracks (theme x2) + SFX grouped and playable, no 魔王魂")


if __name__ == "__main__":
    main()
