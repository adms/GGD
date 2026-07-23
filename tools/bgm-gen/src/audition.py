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
import csv
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
# 名言 / champion voice-line section (task #137 addendum) sources.
QUOTES = os.path.join(CONTENT, "assets", "audio", "voices", "quotes", "quotes.json")
CHAMPIONS_CSV = os.path.join(ROOT, "docs", "champions.csv")
ICONS_DIR = os.path.join(CONTENT, "assets", "icons", "champions")
# Shipping icon extensions, in preference order. The AI-generated set is 128²
# WebP; the legacy 64² w3x extracts are still PNG. Never hard-code one of these.
ICON_EXTS = (".webp", ".png")

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

# The signature 5-10 s INTRO each non-theme scene now opens on (task #135), so
# no two openings sound alike. The theme tracks have none (untouched).
SCENE_INTRO = {
    "lobby": "0–2.5s 音樂盒 — 相對大調(F)的高音敲鐘 F4-A4-D5-A4，全曲唯一的音樂盒音色，暖廳空氣底。",
    "champSelect": "0–4s 觀眾吶喊漸強 + supersaw 吸氣，最後落在一記低太鼓 BOOM；全曲唯一的人群聲。",
    "battleStart": "0–1.8s 鐵閘 — 金屬呻吟下滑 + 摩擦，轟然 SLAM 甩出加速太鼓滾奏；全曲唯一的機械嘎吱→撞擊。",
    "combat": "0–1.7s 和聲高音驟落低音（地板抽空的緊張感）＋ We Will Rock You「咚咚·搭」×2 低調爆炸悶鼓，直衝下拍。取代原本刺耳的鋼刃 zing。",
    "fireRing": "0–3.5s 先是遠處微弱的二戰空襲警報（緩慢升降的嗚咽、低增益遠濾，陰森背景）→ 一句囂張中文嘲諷「還想跑～來不及囉！」（Rocko 台灣男聲，say）→ 爆炸（impact）→ 才進入火焰劈啪床＋低音兩調警報 klaxon；漸強已縮短（起振 0.05s，非慢速堆疊）。警報響、嘲諷落、炸裂、火環點燃。",
    "room": "0–4.5s 大教堂『吸氣』：管風琴＋聖歌人聲自靜默漸起、遠處教堂鐘聲，壓上黑人牧師佈道「Brothers and sisters, only one walks out.」（Reed 美式沉穩男聲，say）。全曲已重寫為教堂：管風琴＋SATB 聖歌浸在巨大石廳殘響（IR RT60≈4.6s）中，中後段沉積成高潮——女高音唱出主題 hook（旋律高潮轉折）＋嘲諷佈道「Kneel down. Your hour has come.」，再收回開場的柔和聖歌讓 loop 無縫。取代原本冰冷機械嗡鳴。",
    "intermission": "0–2.6s 柔和 Rhodes 電鋼和弦 SWELL（Dm9）自黑膠空氣中漸起，無鐘、無敲擊，直接融入慵懶 groove（取代原下課鐘）。全曲為 city-pop 慵懶→女聲情緒累積→爆發四四拍 EDM→收回慵懶的四段式：A 頭(0–32s) 爵士 7/9 和弦電鋼＋滑順電貝斯＋半拍鼓＋sax 感 lead；B 中段(32–48s) 女聲(合唱 soprano)音高＋強度累積(+980Hz/+6.5dB)＋riser＋snare build；C(48–69s) impact 爆炸→four-on-floor(每0.667s)＋supersaw stabs＋16分 hat(快節奏感)＋女聲高飛/切碎；A′ 尾(69–85s) 收回慵懶讓 loop 接縫 citypop→citypop 無縫。",
    "settlement": "0–3s 鋼片琴下行到靜止 + 計分「滴答」漸慢停下；全曲唯一的計分動機，最柔最慢的開頭。",
    "victory": "0–1.8s 上行號角 D-F-A-D + 人群歡呼，衝上啟動 HOOK_A 的重擊；戰敗的完全鏡像。",
    "defeat": "0–2.2s 下行嘆息（濾過的合唱 ahh 滑音）+ 一記低沉喪鐘；全曲唯一下行、唯一單一鐘鳴。",
}

# EXPERIMENTAL rap/VO lines dropped into three intros via macOS `say`. Baked
# only when rendered with `render.py --tts`; the user judges them here.
SCENE_RAP = {
    "champSelect": ("Meijia zh_TW", "「選啊 快選啊 時間到了沒！」— 搞笑主持人在 BOOM 上半吼"),
    "victory": ("Kyoko ja", "「勝った〜！泣かないで〜、また来てね〜」— 假甜嘲諷，號角衝頂後丟入"),
    "defeat": ("Sinji zh_HK", "「輸咗喇……當冇發生過吖。」— 面癱惡搞，壓在喪鐘上（最實驗，可能削弱悲情）"),
    "fireRing": ("Rocko 中文（台灣）", "「還想跑～來不及囉！」— 深沉囂張的台灣男聲，嘲諷逃跑的人，夾在遠處空襲警報與爆炸之間"),
    "room": ("Reed 英文（美國）", "開場黑人牧師佈道「Brothers and sisters, only one walks out.」＋中後段高潮嘲諷「Kneel down. Your hour has come.」— 沉穩美式男聲，泡在教堂殘響裡"),
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
            "intro": SCENE_INTRO.get(scene, ""),
            "rap": SCENE_RAP.get(scene),
        })
    return rows


def samantha_rows() -> list[dict]:
    """The 12 Samantha-James deep-house variants (task #137), read from the
    manifest's `samanthaVariants` array (NOT `tracks`). Each pairs with a base
    scene and rotates with it in-game (except `menu`, which stays single-theme)."""
    man = json.load(open(MANIFEST, encoding="utf-8"))
    variants = man.get("samanthaVariants", [])
    amap = json.load(open(AUDIO_MAP, encoding="utf-8"))["bgm"]
    rows = []
    for m in variants:
        base = m.get("variantOf") or m["scene"].split(".")[0]
        rel = f"assets/audio/bgm/{m['file']}"
        rows.append({
            "scene": m["scene"],
            "zh": SCENE_ZH.get(base, base) + " · Samantha James 變體",
            "title": m.get("title", m["scene"]),
            "mood": m.get("mood", ""),
            "bpm": m.get("bpm"), "key": m.get("key"),
            "sec": duration(os.path.join(BGM_DIR, m["file"])),
            "loop": bool(m.get("loop")),
            "gain": amap.get(base, {}).get("gain"),
            "url": url_for(rel),
            "theme": False, "intro": "", "rap": None,
        })
    return rows


def voiceline_rows() -> list[dict]:
    """名言・英雄語音 (task #137 addendum): one row per champion that has a JP
    voice-line clip. Joins quotes.json (jpQuote / romaji / zhGloss / voice) with
    docs/champions.csv (全名 / 稱號). Sorted by champion id for a stable order.
    Missing icons degrade to no image; a missing csv row falls back to the
    quote's own display name."""
    try:
        doc = json.load(open(QUOTES, encoding="utf-8"))
    except Exception:
        return []
    quotes = doc.get("quotes", {}) if isinstance(doc, dict) else {}
    meta: dict[str, dict] = {}
    try:
        with open(CHAMPIONS_CSV, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                cid = (r.get("編號") or "").strip()
                if cid:
                    meta[cid] = r
    except Exception:
        meta = {}
    rows = []
    for cid in sorted(quotes):
        q = quotes[cid] or {}
        m = meta.get(cid, {})
        # Probe EVERY shipping icon extension, not just .png. The AI-generated
        # icon set was converted to 128² WebP (tools/icon-gen/convert-webp.mjs)
        # and the .png originals deleted; the legacy 64² w3x extracts stay PNG.
        # Probing ".png" alone silently dropped 24 champions to the "♪"
        # placeholder — and before that, hard-coding ".png" in the URL shipped
        # 24 dead <img> links on this page. Extension order = preference order.
        ext = next(
            (e for e in ICON_EXTS if os.path.exists(os.path.join(ICONS_DIR, f"{cid}{e}"))),
            None,
        )
        clip_rel = q.get("clip") or f"assets/audio/voices/quotes/{cid}.mp3"
        rows.append({
            "id": cid,
            "fullname": (m.get("全名") or q.get("name") or cid).strip(),
            "title": (m.get("稱號") or "").strip(),
            "character": q.get("character", ""),
            "voice": q.get("voice", ""),
            "jp": q.get("jpQuote") or (m.get("名言") or ""),
            "romaji": q.get("romaji", ""),
            "gloss": q.get("zhGloss", ""),
            "icon": url_for(f"assets/icons/champions/{cid}{ext}") if ext else "",
            "url": url_for(clip_rel),
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
.badge.rap{color:var(--accent);border-color:var(--accent)}
.intro{background:rgba(242,161,60,.09);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;padding:7px 10px;margin:2px 0 8px;font-size:13px;color:#f4d9b4}
.intro b{color:var(--accent);font-weight:700;letter-spacing:.02em}
.rapline{font-size:12px;color:var(--dim);margin:0 0 8px;padding-left:10px;border-left:2px dashed var(--accent)}
.rapline b{color:var(--accent)}
.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--dim);font-size:12px;margin:4px 0 8px;font-variant-numeric:tabular-nums}
.mood{color:#c3cbdd;font-size:13px;margin:2px 0 8px}
audio{width:100%;height:34px}
.sfxrow{display:grid;grid-template-columns:200px 1fr;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}
.sfxrow:last-child{border-bottom:0}
.sfxrow .k{font-weight:600;font-size:13px}
.sfxrow .k small{display:block;color:var(--dim);font-weight:400;font-variant-numeric:tabular-nums}
.sfxrow audio{max-width:360px}
@media(max-width:640px){.sfxrow{grid-template-columns:1fr}}
.card.variant{border-color:var(--accent)}
.badge.sam{color:var(--accent);border-color:var(--accent)}
.vcard{display:grid;grid-template-columns:56px 1fr;gap:12px;align-items:start}
.vico{width:56px;height:56px;border-radius:8px;object-fit:cover;background:#0a0d16;border:1px solid var(--line)}
.vico.ph{display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:22px}
.vname{font-weight:700}
.vname small{color:var(--dim);font-weight:400;margin-left:6px}
.vquote{font-size:16px;margin:4px 0 2px}
.vromaji{color:var(--dim);font-size:12px;margin:0 0 2px;font-style:italic}
.vgloss{color:#c3cbdd;font-size:13px;margin:0 0 8px}
.vcard audio{max-width:340px}
@media(max-width:640px){.vcard{grid-template-columns:44px 1fr}.vico{width:44px;height:44px}}
"""


def esc(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def bgm_card(p: list, r: dict, variant: bool = False) -> None:
    """Append one BGM card (shared by the originals and the Samantha variants)."""
    cls = "card variant" if variant else ("card theme" if r.get("theme") else "card")
    if variant:
        badge = "<span class='badge sam'>Samantha 變體</span>"
    else:
        badge = "<span class='badge'>主題曲</span>" if r.get("theme") else ""
        if r.get("rap"):
            badge += " <span class='badge rap'>含實驗饒舌/語音</span>"
    p.append(f"<div class='{cls}'>")
    p.append(f"<div class='hd'><span class='zh'>{esc(r['zh'])}</span>"
             f"<span class='en'>{esc(r['title'])}</span>{badge}</div>")
    meta = [f"{r['sec']:.1f}s", f"gain {r['gain']}", "loop" if r["loop"] else "one-shot"]
    if r.get("bpm"):
        meta.append(f"{r['bpm']}bpm")
    if r.get("key"):
        meta.append(esc(r["key"]))
    p.append("<div class='meta'>" + " · ".join(str(m) for m in meta) + "</div>")
    if r.get("intro"):
        p.append(f"<div class='intro'><b>招牌開場 ▸</b> {esc(r['intro'])}</div>")
    if r.get("rap"):
        voice, line = r["rap"]
        p.append(f"<div class='rapline'><b>饒舌/語音（{esc(voice)}）：</b>{esc(line)}</div>")
    if r.get("mood"):
        p.append(f"<div class='mood'>{esc(r['mood'])}</div>")
    p.append(f"<audio controls preload='none' src='{r['url']}'></audio></div>")


def render() -> str:
    bgm = bgm_rows()
    sam = samantha_rows()
    voice = voiceline_rows()
    sfx = sfx_rows()
    p = ['<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         "<title>GGD 音樂・音效試聽</title>", "<style>", CSS, "</style></head><body><div class='wrap'>"]
    p.append("<h1>GGD 音樂・音效試聽</h1>")
    p.append("<p class='sub'>全部為本專案自製／授權素材，可直接播放測試。"
             "主題曲收錄兩首（史詩版 + 寧靜女聲版，登入頁輪播）。時長為 ffprobe 實測。</p>")

    n_intro = sum(1 for r in bgm if r["intro"])
    n_rap = sum(1 for r in bgm if r["rap"])
    p.append("<p class='sub'>★ <b style='color:var(--accent)'>#135 新增：每首非主題曲都有專屬的 5–10 秒"
             f"「開場招牌」</b>——過去所有場景一開頭都是同一組鋼琴 ostinato + 低吟，"
             f"前 5–8 秒幾乎難以分辨；現在 {n_intro} 首各有獨一無二的第一印象音色（音樂盒／人群吶喊／"
             f"鐵閘／驟落和聲＋踏踏搭／火焰警報／機械嗡鳴／慵懶電鋼 swell／計分鋼片琴／號角／喪鐘）。其中 "
             f"{n_rap} 首附「實驗性」饒舌／語音（macOS say），播放版已烘進，等你驗收取捨。"
             "主題曲兩首維持原樣、未動。</p>")

    p.append("<p class='sub'>★ <b style='color:var(--accent)'>#137 新增：每個場景多一首"
             "「Samantha James」nu-jazz / deep-house 變體</b>——原曲 12 首 ＋ 變體 12 首＝"
             "「12＋12」。變體為約 120 bpm four-on-the-floor 沙發浩室（爵士電鋼 7/9 和弦、"
             "滑順貝斯、刷擦鼓＋沙鈴、氣聲女聲 pad/hook），保留各場景的調性與情緒、換一套編曲。"
             "遊戲中「進場時」在原曲與變體之間輪播（登入 <code>menu</code> 依 #134 維持單一史詩版、不輪播）。</p>")

    p.append(f"<h2>背景音樂 BGM · 原曲（{len(bgm)} 首）</h2>")
    for r in bgm:
        bgm_card(p, r)

    p.append(f"<h2>Samantha James 變體 · nu-jazz / deep house（{len(sam)} 首 · 輪播）</h2>")
    for r in sam:
        bgm_card(p, r, variant=True)

    # 名言・英雄語音 (task #137 addendum): champion voice-line cards.
    p.append(f"<h2>名言・英雄語音（{len(voice)} 首）</h2>")
    p.append("<p class='sub'>每位英雄的日文名言語音（macOS say 生成）。含頭圖、全名＋稱號、"
             "日文台詞＋羅馬拼音＋中文語義，依英雄編號排序。</p>")
    p.append("<div class='card'>")
    for v in voice:
        img = (f"<img class='vico' src='{v['icon']}' alt='' loading='lazy'>"
               if v["icon"] else "<div class='vico ph'>♪</div>")
        name = f"<span class='vname'>{esc(v['fullname'])}"
        if v["title"]:
            name += f"<small>{esc(v['title'])}</small>"
        if v["character"]:
            name += f"<small>{esc(v['character'])}</small>"
        name += "</span>"
        body = [f"<div class='hd'>{name}</div>"]
        if v["jp"]:
            body.append(f"<div class='vquote'>「{esc(v['jp'])}」</div>")
        if v["romaji"]:
            body.append(f"<div class='vromaji'>{esc(v['romaji'])}</div>")
        gloss_bits = []
        if v["gloss"]:
            gloss_bits.append(esc(v["gloss"]))
        if v["voice"]:
            gloss_bits.append(f"聲線：{esc(v['voice'])}")
        gloss_bits.append(esc(v["id"]))
        body.append(f"<div class='vgloss'>{' · '.join(gloss_bits)}</div>")
        body.append(f"<audio controls preload='none' src='{v['url']}'></audio>")
        p.append(f"<div class='vcard'>{img}<div>{''.join(body)}</div></div>")
    p.append("</div>")

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
    print(f"  {len(bgm_rows())} 原曲 + {len(samantha_rows())} Samantha 變體 (12+12) "
          f"+ {len(voiceline_rows())} 名言 + SFX, playable, no 魔王魂")


if __name__ == "__main__":
    main()
