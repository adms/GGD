#!/usr/bin/env python3
"""組出 batch3-ledger.json 與 batch3-ready-to-register.json。"""
import hashlib, json, os, sys, time

ROOT = "/Users/Takuro/GGD"
sys.path.insert(0, os.path.join(ROOT, "tools/w3x-import"))
import model_intake as mi  # noqa: E402

# tid → (ou99 實際標題, 目標角色, [heroId…], kind)
MAP = [
    ("463344", "斗笠帽子功夫熊猫胖猫",       "熊貓",          ["godie-h02k"],                    "style-proxy"),
    ("470225", "示巴女王花仙子",             "白木卡迪那",    ["godie-e00s", "godie-e010"],      "style-proxy"),
    ("495978", "骷髅头男孩",                 "黑人牙膏",      ["godie-ogld"],                    "style-proxy"),
    ("459087", "冬装二次元女",               "死之王",        ["godie-u00k"],                    "style-proxy"),
    ("469191", "复仇七夜志贵",               "飛鼠先生",      ["godie-udea"],                    "style-proxy"),
    ("454069", "童子霹雳火剑圣带攻击特效",   "善逸",          ["b2-zenitsu"],                    "style-proxy"),
    ("413694", "【ssr】鲁路修·兰佩路基",     "魯魯修",        ["community-review-10-20260907"],  "exact"),
    ("457780", "兔儿可爱小女孩",             "芙莉蓮",        ["community-review-29-20260907"],  "style-proxy"),
    ("310996", "远坂凛",                     "遠坂凜",        ["b2-rin"],                        "exact"),
    ("478121", "白磷蜘蛛可爱蜘蛛助手",       "蜘蛛子",        ["b2-kumoko"],                     "style-proxy"),
    ("466002", "鬼灭之刃炭治郎",             "炭治郎",        ["community-review-35-20260907"],  "exact"),
    ("497213", "空条承太郎",                 "空條承太郎",    ["community-review-04-20260907"],  "exact"),
    ("497400", "雷电小鸣人",                 "奇犽",          ["community-review-24-20260907"],  "style-proxy"),
    ("497746", "金甲动漫男",                 "吉爾伽美什",    ["community-review-18-20260907"],  "style-proxy"),
    ("283718", "炮姐（精美模型）",           "御坂美琴",      ["community-review-20-20260907"],  "exact"),
    ("460977", "副本BOSS罗刹王恶魔怪物",     "凱茲",          ["b2-guts"],                       "style-proxy"),
    ("457874", "绿叶版福娃娃",               "野原新之助",    ["b2-shinchan"],                   "style-proxy"),
    ("328403", "berserker",                  "Fate Berserker", ["godie-hapm"],                   "exact"),
    ("464696", "北斗星拳健次郎",             "拳四郎",        ["godie-umal"],                    "exact"),
    ("467165", "伊蕾娜魔女可爱版",           "貓貓",          ["b2-maomao"],                     "style-proxy"),
    ("470782", "高清版张辽",                 "岩谷尚文",      ["b2-naofumi"],                    "style-proxy"),
    ("457710", "眼镜金币版小黄人",           "伊藤開司",      ["b2-kaiji"],                      "style-proxy"),
]

VIS = json.load(open(sys.argv[1], encoding="utf-8"))          # 實拍台量到的
CONV = {e["tid"]: e for e in json.load(
    open(os.path.expanduser("~/GGD-assets/models/dl2/glb/_convert-report.json"),
         encoding="utf-8")) if e.get("status") == "ok"}

# ⭐ 逐顆的**人眼**判讀與例外註記（⛔ 不是「之後再看」——每一條都寫得出畫面上的證據）
NOTES = {
    "460977": ("pass-dark",
               "⚠️ lit(>60)=1,411 **低於 2,000 門檻** —— ⭐ 而它不是「沒東西」："
               "同一張圖 notBg=18,659（＝與背景 rgb(21,21,26) 不同的像素），"
               "人眼看到的是一具**駝背重甲惡魔＋長披風**的完整身體。"
               "⇒ ⭐ 這個門檻量的是**亮度**，⛔ 不是**存在**，而這顆的貼圖幾乎全黑。"
               "⛔ 不改資產（原作就是黑的）。"),
    "464696": ("pass-with-artifact",
               "⛔ **畫面上有一片常駐的白色 starflash 光刃**（`mat4`／204 面／transparent，"
               "貼圖 `starflash_grey_jcl.blp`），在 Stand/Walk/Attack/Death/Spell 五個動作下"
               "都量得到（lit 5,807→1,636 隨姿勢變）。⭐ 根因是**轉換器的已知缺口**："
               "`tools/w3x-import/w3xlib/models.py:17` 逐字寫著「GEOA per-sequence visibility "
               "are skipped」⇒ 原作用 GEOA alpha 藏起來的特效面片變成**永遠都在**。"
               "⭐ 人體本身是好的（5,849+15,392+288 面三塊身體）。"
               "⇒ ⛔ 我沒有動這顆的幾何（那是美術決定）——最小修法是丟掉 `mat4` 那 204 面，"
               "根治是讓轉換器讀 GEOA。⭐ 註冊前請 owner 看一眼。"),
    "478121": ("pass",
               "⭐ 這顆是**蜘蛛身體**（非人形）—— ⛔ 但那正是 蜘蛛子 的本體，"
               "⛔ 不是「霧狀特效」或「立繪半身像」⇒ `heroBody: true`。"
               "⚠️ 另一件事：轉換器的 `classify()` 要 walk+attack+death 才算 hero，"
               "而這顆**沒有 attack 序列** ⇒ 走 DEFAULT_SCALE ⇒ glb 只有 **0.92 高**"
               "（其餘 21 顆都是 1.7）。⇒ ⭐ 文件的 `scale` 補成 **1.8482**（=1.7/0.9198）"
               "把管線自己的不變量補回來。⛔ 一鍵 rollback：把那一格改回 1.0。"
               "⚠️ 連帶：`clipMap.attack` 只能用 `Stand 1` 頂替（這顆沒有攻擊動作）。"),
    "454069": ("pass",
               "⚠️ 這顆**沒有任何 spell 序列** ⇒ `clipMap.cast` 用 `Attack` 頂替。"),
    "457710": ("pass",
               "⚠️ 這顆**沒有 spell 序列** ⇒ `clipMap.cast` 用 `attack 2` 頂替。"),
    "457874": ("pass",
               "⚠️ 這顆只有 4 個動作、**沒有 spell** ⇒ `clipMap.cast` 用 `attack` 頂替。"),
}

ledger, ready = [], []
for tid, title, target, heroes, kind in MAP:
    glb = os.path.join(ROOT, "content/assets/models/ou99/ou99_%s.glb" % tid)
    doc = json.load(open(os.path.join(ROOT, "content/models/ou99.%s.json" % tid),
                         encoding="utf-8"))
    s = mi.inspect(glb)
    v = VIS[tid]
    verdict, why = NOTES.get(tid, ("pass", "⭐ 入庫檢查乾淨、Zod 過、`inspectModelUpload` 過、"
                                           "六格 clipMap 各自對到唯一具名片段、實拍台載得進去且 idle 播得動。"))
    ledger.append({
        "threadId": tid,
        "ou99Title": title,
        "targetCharacter": target,
        "heroIds": heroes,
        "matchKind": kind,
        "sha256": hashlib.sha256(open(glb, "rb").read()).hexdigest(),
        "bytes": os.path.getsize(glb),
        "tris": s["tris"],
        "draws": s["draws"],
        "texEdge": s["texEdge"],
        "anims": len(CONV[tid].get("anim_names") or []),
        "clipMap": doc["clipMap"],
        "scale": doc["scale"],
        "glbHeight": CONV[tid].get("height"),
        "litPixels": v["lit"],
        "nonBackgroundPixels": v["notBg"],
        "shotClip": v["shotClip"],
        "verdict": verdict,
        "heroBody": True,
        "why": why,
        "reference": "https://www.ou99.com/thread-%s-1-1.html" % tid,
    })
    for h in heroes:
        ready.append({
            "heroId": h,
            "sourceModelKey": "ou99.%s" % tid,
            "label": ("ou99 %s（本尊）" % target) if kind == "exact"
                     else ("ou99「%s」（相似造型）" % title),
            "kind": kind,
            "character": target,
            "work": title,
            "reference": "https://www.ou99.com/thread-%s-1-1.html" % tid,
        })

stamp = time.strftime("%Y-%m-%dT%H:%M:%S+08:00")
out_dir = os.path.join(ROOT, "materials/ou99-access")
with open(os.path.join(out_dir, "batch3-ledger.json"), "w", encoding="utf-8") as f:
    json.dump({
        "schema": "ggd-ou99-batch-ledger@1",
        "batch": "batch3-dl2",
        "producedAt": stamp,
        "notice": "⭐ owner 2026-09-10 逐字:「我故意把相似的放上清單 這不是錯誤」⇒ "
                  "ou99 標題與目標角色不同是**刻意的相似代理**,⛔ 不是配對錯誤。"
                  "⭐ 身分誠實記錄:`targetCharacter` 是目標角色,`ou99Title` 是 ou99 的實際標題。",
        "meterCalibration": {
            "tool": "apps/client/public/ou99-model-shots.html + window.__lit()",
            "threshold": "max(r,g,b) > 60（背景 rgb(21,21,26)）",
            "positive": "ou99_287871.glb → 24,350 亮像素（>2,000 ✅）",
            "negative": "不存在的路徑 → 0 亮像素 ✅；⭐ 而且是在**載過一顆好的之後**再量到 0，"
                        "⛔ 不是只有空白頁才 0 ⇒ 尺在「應該少」那個方向也證明過",
            "caveat": "⚠️ `litPixels` 量的是**亮度**,⛔ 不是**存在**。"
                      "問「有沒有東西」要看 `nonBackgroundPixels`（460977 就是這個差別）。",
        },
        "count": len(ledger),
        "models": ledger,
    }, f, ensure_ascii=False, indent=1)
    f.write("\n")

with open(os.path.join(out_dir, "batch3-ready-to-register.json"), "w", encoding="utf-8") as f:
    json.dump(ready, f, ensure_ascii=False, indent=1)
    f.write("\n")

print(json.dumps({"ledger": len(ledger), "ready": len(ready),
                  "verdicts": {v: sum(1 for m in ledger if m["verdict"] == v)
                               for v in {m["verdict"] for m in ledger}}},
                 ensure_ascii=False))
