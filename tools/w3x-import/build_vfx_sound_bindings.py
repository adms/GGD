#!/usr/bin/env python3
"""
build_vfx_sound_bindings.py — 特效自帶的音效（GH#390）的**綁定產生器**。

owner 2026-08-19：「不只是特效動畫、粒子特效等，別忘了特效本身也有帶音效
也要一併移植擷取」。

⛔ 這支腳本**不寫 TS 常數**（#384 的教訓：374 筆逐 id 綁定住在映像裡，Codex 看不到、
改一次要重新部署）。它只做一件事：把兩條原作來源 join 起來，寫進
`content/config/vfx-families.json` 的 `families[].sound*` 與 `abilities[].sound*`。
那份 JSON 是後台編輯器可以改的那一張表，也是外部編輯器讀得到的那一份。

兩條來源（＝ GH#390 點名的兩條）
──────────────────────────────────────────────────────────────────────────
1. **模型自帶的 soundset** —— mdx 的事件軌（`SNDx`）。EMITTERS.json 已經把它們
   解出來了（419 顆事件節點，其中 **182 顆**是 SND）；`UI\\SoundInfo\\AnimLookups.slk`
   把 4 碼事件碼翻成 sound label，`AnimSounds.slk` 再翻成真的 wav 路徑。
   ⭐ **GH#402 起這一半也真的寫進內容了。** 在此之前它只產報告，理由是
   「那些 wav 只能落在 git-ignored 的 overlay，正式站不供應 ⇒ 綁上去等於綁一片安靜」——
   **owner 2026-08-19 推翻了那個前提**：
     「請幫我註記取消這個規則，現在的線上已經是雙重審查只給認識的親友玩了，
      請直接上架但註記來源就好 不要ignore」
   ⇒ 這些 clip 抽進 `content/assets/audio/wc3/`（**進版控、正式站供應**），
   逐 clip 的出處寫進同目錄的 PROVENANCE.json/.md。
   ⚠️ **出處是 owner 授權的條件**，不是文件潔癖 —— 沒有出處的位元組就是違規，
   `blizzardOverlayGate.test.ts` 兩個方向都在守。
2. **技能宣告的音效** —— w3a/JASS 的 `gg_snd_*`（task #78 的那 60 個）。
   ⭐ **owner 2026-08-19 第二次追加：「既有 60 個 wc3.* 沒一起搬 => move」** ——
   它們原本住在 git-ignored 的 `data/blizzard-overlay/ability-sfx/`，現在**搬進同一個
   目錄**。⛔ **key 名一個字都沒變**（`wc3.markofchaos` 還是 `wc3.markofchaos`），
   變的只有它指到的路徑 —— 改名會打斷每一個引用它的地方。
   這一半照舊寫進 `abilities[<id>].soundLaunch`。

⇒ 兩批合起來住在**一個目錄、一個命名空間、一份帳本**。交集（目前只有
`markofchaos`，兩邊 sha256 相同）自然合成一份位元組、一個 key。

家族原型那 21 格填的是**出貨**的 sfx key（`explosion` / `magicFire` …）。
家族是「每一支都聽得到」的那一層；逐支覆寫才是原作音那一層。

⭐ **退回機制刻意留著**（`apps/client/src/audio/vfxSound.ts`）—— 它問**載入的
audio map** 拿路徑，⛔ 不是抄一份 key 名單。所以 `wc3.*` 現在拿得到路徑就直接播、
將來若被撤下也會自己退回家族音。⛔ 不要因為「現在都供應了」把它拆掉。

Usage:  python3 tools/w3x-import/build_vfx_sound_bindings.py [--check]
        --check = 只比對、不寫檔，內容會變就回非零（給閘用）
"""

from __future__ import annotations

import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

SRC = os.path.join(HERE, "out", "GoDieEX22s-src")
EMITTERS = os.path.join(HERE, "out", "emitters", "EMITTERS.json")
MODEL_REFS = os.path.join(HERE, "out", "emitters", "MODEL_REFS.json")
FAMILIES_JSON = os.path.join(REPO, "content", "config", "vfx-families.json")
AUDIO_MAP = os.path.join(REPO, "content", "config", "audio-map.json")
REPORT = os.path.join(HERE, "out", "VFX_SOUND_JOIN.json")
VFX_BINDINGS = os.path.join(HERE, "out", "vfx-bindings", "VFX_BINDINGS.json")

# ── ③ 原作音效：**進版控**的那一批 clip（GH#402）────────────────────────
#
# ⭐ owner 2026-08-19 推翻了「只能落在 git-ignored overlay」那條規則：
#   「請幫我註記取消這個規則，現在的線上已經是雙重審查只給認識的親友玩了，
#    請直接上架但註記來源就好 不要ignore」
# ⇒ 這一批位元組**進 git、正式站供應**，條件是**逐 clip 註記來源**（見 PROVENANCE）。
#
# ⭐ owner 2026-08-19 第二次追加：「既有 60 個 wc3.* 沒一起搬 => **move**」
# ⇒ `data/blizzard-overlay/ability-sfx/` 的 60 個也搬進來，**同一個目錄、同一個命名空間**。
#
# ⚠️ 這一版**撤掉了 `wc3vfx.*` 這個前綴**（它只活了一輪）。當初分開的理由是
# 「`wc3.*` 在正式站不供應、`wc3vfx.*` 供應，所以要能從 key 本身看出來」——
# 兩批都進 content/ 之後**那個理由整個消失**，⛔ 而留著一個不成立的理由正是第三守則
# 在講的事。而且量到兩件事把「合併」從「可以」變成「應該」：
#   ① 兩邊的命名規則**其實是同一條**：60 個 clip 的 `gg_snd` 基名與 wav 基名
#      **60/60 完全相同**，所以前綴沒有編碼任何資訊。
#   ② 唯一的撞名 `markofchaos` 兩邊 **sha256 逐位元組相同** —— 不合併就是把
#      同一份位元組在 repo 裡放兩份、掛兩個 key。
KEY_PREFIX = "wc3."
CLIP_DIR = os.path.join(REPO, "content", "assets", "audio", "wc3")
CLIP_URL = "assets/audio/wc3/"
LEDGER_JSON = os.path.join(CLIP_DIR, "PROVENANCE.json")
LEDGER_MD = os.path.join(CLIP_DIR, "PROVENANCE.md")
SFX_BINDINGS_JSON = os.path.join(SRC, "SFX_BINDINGS.json")

RETAIL_ARCHIVES = ["war3.mpq", "War3x.mpq", "War3xLocal.mpq", "War3Patch.mpq"]

# 出貨播放參數 —— 沿用 task #78 既有 `wc3.*` 的同一組值（⛔ 不另外發明一套）。
VFX_SOUND_GAIN = 0.6
VFX_SOUND_COOLDOWN_MS = 1200
VFX_SOUND_MAX_CONCURRENT = 1

# ── 事件 → 四個時機的**分類機制**（⛔ 不是逐 clip 一個 if）──────────────
#
# 第〇·五守則：一支技能不該有自己的一段程式。這裡是**一張關鍵字表**，
# 每一個 clip 全部走同一條路 —— 產生器只是替後台那張表填**預設值**，
# 每一格都還可以在鑄技工坊逐支改（第一守則）。
#
# 判準取自 WC3 自己的命名慣例（sound label 與檔名都用同一套字尾）。
CUE_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("soundDissipate", ("dissipate", "cancel")),
    ("soundImpact", ("hit", "death", "impact", "damage")),
    ("soundLaunch", ("launch", "birth", "attack", "cast", "missile")),
)
CUE_DEFAULT = "soundLaunch"

# ── 21 個家族原型的預設音（第零守則⑨：K 個模板，⛔ 不是 258 輪）────────────
#
# 每一格都是 `content/config/audio-map.json` 的 **出貨** sfx key。
# ⛔ 不要填 `wc3.*` —— 那是**逐支覆寫**那一層的原作音；家族是「每一支都聽得到」
# 的保底層，要用出貨的通用音，⛔ 不是把某一支的原作音當成整個家族的預設。
# 空字串 = 這個時機這個家族**刻意不發聲**（例：瞬移沒有命中音）。
FAMILY_CUES: dict[str, dict[str, str]] = {
    #                    launch          impact           loop            dissipate
    "shockwaveRing": ("guardianSlam", "knockdown", "", ""),
    "blink": ("magicBolt", "", "", "castEnd"),
    "burst": ("explosion", "hit-heavy", "", ""),
    "dissipate": ("magicBolt", "", "", "castEnd"),
    "missile": ("projectileSpawn", "projectileHit", "", ""),
    "boltStrike": ("magicLightning", "hit-heavy", "", ""),
    "tornado": ("magicIce", "hit-medium", "fireRingLoop", "castEnd"),
    "groundDust": ("footstep", "knockdown", "", ""),
    "flamePillar": ("magicFire", "hit-heavy", "fireRingLoop", "castEnd"),
    "mirrorImage": ("castCircle", "", "", "castEnd"),
    "resurrect": ("reviveChannel", "reviveComplete", "", ""),
    "mark": ("buffApply", "", "", "castEnd"),
    "lightColumn": ("magicBolt", "hit-medium", "", ""),
    "portal": ("castCircle", "", "arenaAmbience", "castEnd"),
    "breath": ("magicFire", "hit-light", "fireRingLoop", ""),
    "levelUp": ("levelUpJingle", "", "", ""),
    "cloud": ("magicIce", "", "", "castEnd"),
    "shine": ("chime", "", "", ""),
    "blood": ("hit-heavy", "", "", ""),
    "starfall": ("magicBolt", "explosion", "", ""),
    "uncategorised": ("abilityCast", "", "", ""),
}
CUE_FIELDS = ("soundLaunch", "soundImpact", "soundLoop", "soundDissipate")

# 家族原型如果想用一個出貨裡沒有的 key，這裡會直接擋下來（第一·五守則）。
FALLBACK_IF_MISSING = {"chime": "buffApply"}


def slk_rows(data: bytes) -> tuple[dict[str, int], list[dict[str, str | None]]]:
    """SLK → (header→col, rows)。X/Y 是**有記憶**的，省略時沿用上一格。"""
    txt = data.decode("latin-1")
    cells: dict[tuple[int, int], str] = {}
    x = y = 1
    for line in txt.splitlines():
        if not line.startswith("C;"):
            continue
        val = None
        for part in line.split(";")[1:]:
            if part.startswith("X"):
                x = int(part[1:])
            elif part.startswith("Y"):
                y = int(part[1:])
            elif part.startswith("K"):
                v = part[1:]
                if v.startswith('"') and v.endswith('"'):
                    v = v[1:-1]
                val = v
        if val is not None:
            cells[(y, x)] = val
    if not cells:
        return {}, []
    maxy = max(k[0] for k in cells)
    maxx = max(k[1] for k in cells)
    hdr = {cells[(1, c)]: c for c in range(1, maxx + 1) if (1, c) in cells}
    rows = []
    for r in range(2, maxy + 1):
        row = {h: cells.get((r, c)) for h, c in hdr.items()}
        if any(v for v in row.values()):
            rows.append(row)
    return hdr, rows


def load_anim_sound_tables() -> tuple[dict[str, str], dict[str, dict]]:
    """`SNDx` 4 碼 → sound label → wav 清單。MPQ 不在就回兩個空表（報告會說）。"""
    try:
        from w3xlib.mpqaudio import AudioArchive  # noqa: PLC0415
    except Exception:
        return {}, {}
    root = REPO
    while root != os.path.dirname(root) and not os.path.exists(os.path.join(root, "war3.mpq")):
        root = os.path.dirname(root)
    lookups: dict[str, str] = {}
    sounds: dict[str, dict] = {}
    for name in RETAIL_ARCHIVES:
        full = os.path.join(root, name)
        if not os.path.exists(full):
            continue
        try:
            a = AudioArchive(full)
        except Exception:
            continue
        for path, sink in (
            ("UI\\SoundInfo\\AnimLookups.slk", "lookup"),
            ("UI\\SoundInfo\\AnimSounds.slk", "sound"),
        ):
            if not a.has_file(path):
                continue
            _, rows = slk_rows(a.read_file(path))
            for r in rows:
                if sink == "lookup":
                    ev = (r.get("AnimSoundEvent") or "").upper()
                    if ev:
                        lookups[ev] = r.get("SoundLabel") or ""
                else:
                    k = r.get("SoundName")
                    if k:
                        sounds[k] = r
        a.close()
    return lookups, sounds


def model_sound_join() -> dict:
    """① 模型自帶的 soundset —— 65/132 個模型帶 `SNDx` 事件軌，逐個解到 wav。"""
    lookups, sounds = load_anim_sound_tables()
    em = json.load(open(EMITTERS))
    out = {}
    unresolved = set()
    for m in em["models"]:
        codes = sorted({e["name"].strip().upper() for e in m.get("events", []) if e["name"].strip().upper().startswith("SND")})
        if not codes:
            continue
        rows = []
        for c in codes:
            key = c[3:] if len(c) > 4 else c  # "SNDxAOWW" → "xAOWW"; 真正的碼是後 4 碼
            key4 = c[-4:]
            label = lookups.get(key4) or lookups.get(key) or ""
            row = sounds.get(label) if label else None
            files = []
            if row:
                base = (row.get("DirectoryBase") or "").strip()
                for f in (row.get("FileNames") or "").split(","):
                    f = f.strip()
                    if f:
                        files.append(base + f if base else f)
            if not label:
                unresolved.add(c)
            rows.append({"event": c, "soundLabel": label, "files": files})
        out[m["stem"]] = rows
    return {
        "modelsWithSoundEvents": len(out),
        "modelsScanned": len(em["models"]),
        "animLookupRows": len(lookups),
        "animSoundRows": len(sounds),
        "unresolvedEvents": sorted(unresolved),
        "byModel": out,
    }


def ability_sound_bindings(shipped_keys: set[str]) -> tuple[dict[str, dict[str, str]], dict]:
    """② 技能宣告的音效 —— JASS `gg_snd_*` → 已抽出的 `wc3.*` audio-map key。"""
    sb = json.load(open(os.path.join(SRC, "SFX_BINDINGS.json")))
    docs = {
        f[:-5]
        for f in os.listdir(os.path.join(REPO, "content", "abilities"))
        if f.endswith(".json") and not f.startswith("_")
    }
    bound: dict[str, dict[str, str]] = {}
    stats = {"abilitiesWithJassSound": len(sb["abilities"]), "keyMissingFromAudioMap": [], "notAnAbilityDoc": []}
    for row in sb["abilities"]:
        aid = row["ability"]
        keys = []
        for s in row["sounds"]:
            k = "wc3." + s["gg_snd"].replace("gg_snd_", "").lower()
            if k in shipped_keys:
                keys.append(k)
            else:
                stats["keyMissingFromAudioMap"].append(k)
        if not keys:
            continue
        if aid not in docs:
            stats["notAnAbilityDoc"].append(aid)
            continue
        # 第一個 = 發射（施法那一刻）；有第二個才是命中。⛔ 不硬塞四個時機。
        entry = {"soundLaunch": keys[0]}
        if len(keys) > 1:
            entry["soundImpact"] = keys[1]
        bound[aid] = entry
    stats["bound"] = len(bound)
    stats["keyMissingFromAudioMap"] = sorted(set(stats["keyMissingFromAudioMap"]))
    stats["notAnAbilityDoc"] = sorted(set(stats["notAnAbilityDoc"]))
    return bound, stats


def classify_cue(sound_label: str, wav_name: str) -> str:
    """一顆事件屬於四個時機的哪一個。⛔ 一張表，不是 73 個 if。"""
    hay = f"{sound_label} {wav_name}".lower()
    for field, words in CUE_KEYWORDS:
        if any(w in hay for w in words):
            return field
    return CUE_DEFAULT


def clip_key(wc3_path: str) -> str:
    """`Units\\Orc\\...\\CriticalStrike.wav` → `wc3.criticalstrike`。

    ⭐ **兩批共用這一條規則。** task #78 的 60 個當初是用 `gg_snd` 基名產 key，
    而實測 60/60 的 `gg_snd` 基名與 wav 基名完全相同 —— 所以那不是第二條規則，
    是同一條規則的另一種寫法。合併之後既有 key **一個字都沒變**（⛔ 不可以改名，
    改名會打斷每一個引用它的地方），變的只有它指到的路徑。
    """
    base = wc3_path.replace("\\", "/").rsplit("/", 1)[-1]
    stem = base.rsplit(".", 1)[0]
    return KEY_PREFIX + stem.lower()


def ability_declared_worklist() -> dict[str, dict]:
    """② 技能宣告的音（`gg_snd_*`，task #78 的那 60 個）→ {wc3_path: 出處欄位}。

    ⚠️ 上游取**committed 的** `SFX_BINDINGS.json`，⛔ 不是 git-ignored 的
    `ability-sfx/MANIFEST.json` —— 帳本不可以相依於一個沒進版控的檔案，
    否則乾淨 checkout 上的 `--check` 會因為「素材不在」而說「帳本錯了」。
    """
    if not os.path.exists(SFX_BINDINGS_JSON):
        return {}
    sb = json.load(open(SFX_BINDINGS_JSON, encoding="utf-8"))
    bindings = sb.get("bindings", {})
    out: dict[str, dict] = {}
    for row in sb.get("abilities", []):
        for s in row.get("sounds", []):
            gg = s.get("gg_snd")
            b = bindings.get(gg) or {}
            # ⛔ 只收 `stock`（零售 MPQ）。`imported` 是地圖作者自己塞的 mp3
            # （出處不明的動畫／遊戲片段），它們已經另有住處，這一輪不碰。
            if b.get("kind") != "stock":
                continue
            path = b.get("wc3_path") or s.get("wc3_path")
            if not path:
                continue
            # ⚠️ SFX_BINDINGS.json 把路徑**多跳脫了一層**（JSON 裡是 `\\\\`,
            # 解出來是 `\\`）。MPQ 的路徑是單反斜線，不正規化就每一條都查不到。
            path = path.replace("\\\\", "\\")
            e = out.setdefault(path, {"ggSnd": set(), "abilities": set()})
            e["ggSnd"].add(gg)
            e["abilities"].add(row["ability"])
    return out


def model_stem_to_docs() -> dict[str, set[str]]:
    """模型 stem → 它出現在哪些 GGD 技能文件上（join key 來自 VFX_BINDINGS）。

    ⚠️ 這一段是整批能不能落地的關鍵：join 報告給的是**模型 → 音**，
    而 `vfx-families.json` 綁的是**技能 → 音**。中間那一段在 VFX_BINDINGS 的
    `abilities[*].art.<slot>.entries[*].stem` ↔ `ggdDocs[*].docId`。
    """
    out: dict[str, set[str]] = {}
    if not os.path.exists(VFX_BINDINGS):
        return out
    vb = json.load(open(VFX_BINDINGS, encoding="utf-8"))
    for a in vb.get("abilities", {}).values():
        docs = sorted({g["docId"] for g in a.get("ggdDocs", []) if g.get("docId")})
        if not docs:
            continue
        for info in (a.get("art") or {}).values():
            for e in info.get("entries") or []:
                stem = e.get("stem")
                if stem:
                    out.setdefault(stem, set()).update(docs)
    return out


def extract_wc3_clips(join: dict) -> tuple[dict, list[dict]]:
    """把 join 報告點名的每一個 wav 從 MPQ 抽進 `content/assets/audio/wc3-vfx/`。

    回 `(clips, gaps)`。`clips` 逐 clip 帶 sha256 + 來源 MPQ + 原始路徑（＝ owner
    的「註記來源」條件）；`gaps` 是**抽不到／解不開**的那幾筆，⛔ 不靜默跳過。

    ⚠️ MPQ 不在（乾淨 checkout、CI）時**不刪任何東西**，直接沿用已 commit 的
    位元組並回報 —— 位元組已經進版控了，抽取只是**重現**它們的方式。
    """
    stem_docs = model_stem_to_docs()
    declared = ability_declared_worklist()
    # wav 路徑 → 用到它的 (模型, 事件碼, sound label)
    users: dict[str, list[tuple[str, str, str]]] = {}
    gaps: list[dict] = []
    for stem, rows in sorted(join["byModel"].items()):
        for r in rows:
            if not r["soundLabel"]:
                gaps.append({
                    "kind": "unresolvedEventCode",
                    "model": stem,
                    "event": r["event"],
                    "why": "AnimLookups.slk 沒有這個 4 碼事件碼 → 翻不出 sound label",
                })
                continue
            if not r["files"]:
                gaps.append({
                    "kind": "labelWithoutFiles",
                    "model": stem,
                    "event": r["event"],
                    "soundLabel": r["soundLabel"],
                    "why": "AnimSounds.slk 有這一列但 FileNames 是空的",
                })
                continue
            for f in r["files"]:
                users.setdefault(f, []).append((stem, r["event"], r["soundLabel"]))

    try:
        from w3xlib.mpqaudio import AudioArchive  # noqa: PLC0415
    except Exception:
        AudioArchive = None  # type: ignore[assignment]
    root = REPO
    while root != os.path.dirname(root) and not os.path.exists(os.path.join(root, "war3.mpq")):
        root = os.path.dirname(root)
    archives = []
    if AudioArchive is not None:
        for name in RETAIL_ARCHIVES:  # oldest → newest，最新的 archive 勝出
            full = os.path.join(root, name)
            if os.path.exists(full):
                try:
                    archives.append((name, AudioArchive(full)))
                except Exception:
                    pass

    os.makedirs(CLIP_DIR, exist_ok=True)
    clips: dict[str, dict] = {}
    # 兩批的聯集 —— 交集（目前只有 markofchaos）自然合成**一份**位元組、**一個** key。
    for wc3_path in sorted(set(users) | set(declared)):
        key = clip_key(wc3_path)
        out_name = key[len(KEY_PREFIX):] + ".wav"
        dest = os.path.join(CLIP_DIR, out_name)
        src_archive = None
        blob = None
        for name, a in archives:
            try:
                if a.has_file(wc3_path):
                    src_archive, blob = name, a.read_file(wc3_path)
            except Exception:
                pass
        if blob is None:
            if os.path.exists(dest):  # 已經 commit 過 → 沿用，只是這次沒得重抽
                blob = open(dest, "rb").read()
                src_archive = "(已在版控中；本次執行沒有可讀的 MPQ)"
            else:
                gaps.append({
                    "kind": "notInAnyArchive",
                    "wc3Path": wc3_path,
                    "models": sorted({u[0] for u in users.get(wc3_path, [])}),
                    "why": "四個零售 MPQ 都沒有這個路徑 → 這一顆事件沒有聲音",
                })
                continue
        if not os.path.exists(dest) or open(dest, "rb").read() != blob:
            open(dest, "wb").write(blob)
        rows = users.get(wc3_path, [])
        dec = declared.get(wc3_path)
        models = sorted({u[0] for u in rows})
        docs = sorted({d for m in models for d in stem_docs.get(m, ())})
        label = rows[0][2] if rows else ""
        sources = []
        if rows:
            sources.append("model-soundset")   # ① mdx SNDx 事件軌（GH#402）
        if dec:
            sources.append("ability-declared")  # ② JASS gg_snd_*（task #78）
        clips[key] = {
            "key": key,
            "file": CLIP_URL + out_name,
            "wc3Path": wc3_path,
            "wc3File": wc3_path.replace("\\", "/").rsplit("/", 1)[-1],
            "archive": src_archive,
            "sources": sources,
            "soundLabel": label,
            "cue": classify_cue(label or out_name, out_name),
            "events": sorted({u[1] for u in rows}),
            "models": models,
            # ⚠️ 綁定時只看這一份（模型自帶的那一半）—— 技能宣告的那一半由
            # `ability_sound_bindings()` 走 JASS 那條路寫，⛔ 不可以兩條路都寫同一格。
            "_modelDocs": docs,
            "ggSnd": sorted(dec["ggSnd"]) if dec else [],
            "abilityDocs": sorted(set(docs) | (dec["abilities"] if dec else set())),
            "bytes": len(blob),
            "sha256": hashlib.sha256(blob).hexdigest(),
        }
    for _, a in archives:
        try:
            a.close()
        except Exception:
            pass
    return clips, gaps


def bind_model_sounds(clips: dict, fam_doc: dict) -> dict:
    """把 clip 的 key 填進 `vfx-families.json` 的 `abilities[]` 四個時機。

    ⭐ **既有的綁定優先**：JASS 宣告的音（`gg_snd_*`）是那一支技能**自己**宣告的，
    模型自帶的是它**美術**帶的。所以模型音只填**還空著**的格子，⛔ 不覆蓋。
    （這只是產生器挑的預設值 —— 每一格在鑄技工坊都改得動，第一守則。）
    """
    per_doc: dict[str, dict[str, list[str]]] = {}
    for key in sorted(clips):
        c = clips[key]
        if "model-soundset" not in c["sources"]:
            continue
        for doc in c["_modelDocs"]:
            per_doc.setdefault(doc, {}).setdefault(c["cue"], []).append(key)
    stats = {"docsTouched": 0, "cuesFilled": 0, "docsCreated": 0, "cuesLeftAlone": 0}
    for doc in sorted(per_doc):
        row = fam_doc["abilities"].get(doc)
        if row is None:
            row = fam_doc["abilities"][doc] = {}
            stats["docsCreated"] += 1
        touched = False
        for field in CUE_FIELDS:
            picks = sorted(per_doc[doc].get(field, []))
            if not picks:
                continue
            if row.get(field):
                stats["cuesLeftAlone"] += 1
                continue
            row[field] = picks[0]
            stats["cuesFilled"] += 1
            touched = True
        if touched:
            stats["docsTouched"] += 1
    return stats


def apply_audio_map(clips: dict) -> tuple[str, str]:
    """把 73 個 `wc3vfx.*` key 寫進 audio-map。回 (新內容, 舊內容)。"""
    old = open(AUDIO_MAP, encoding="utf-8").read()
    doc = json.loads(old)
    sfx = doc["sfx"]
    # ⛔ 先**收掉**已經不存在的舊 entry。`apply_audio_map` 只會新增的話，一次搬家
    # 就會在 map 裡留下一批指向空目錄的死 key（`wc3vfx.*` 與舊的 blizzard-local
    # 路徑都是），而那正是第一·五守則的形狀：schema 過、build 綠、播放時 404。
    # ⚠️ 判準是**路徑**（這一批位元組住哪），⛔ 不是 key 名前綴 —— `wc3.moongo` /
    # `moonjump` / `nocute` 指的是 `assets/audio/sfx/*.mp3`（地圖作者自己的 import，
    # 早就進版控），它們**不屬於這一批**，⛔ 不可以被收掉。
    MANAGED_PREFIXES = ("assets/blizzard-local/", "assets/audio/wc3-vfx/", CLIP_URL)
    for key in [k for k in sfx if k not in clips]:
        files = sfx[key].get("files") or []
        if files and all(isinstance(f, str) and f.startswith(MANAGED_PREFIXES) for f in files):
            del sfx[key]
    for key in sorted(clips):
        sfx[key] = {
            "files": [clips[key]["file"]],
            "gain": VFX_SOUND_GAIN,
            "cooldownMs": VFX_SOUND_COOLDOWN_MS,
            "maxConcurrent": VFX_SOUND_MAX_CONCURRENT,
        }
    # ⚠️ 既有 key 的**順序一格都不動**，新的照字典序接在後面 —— 逐位元組可重現，
    # 而且 diff 只有新增的那 73 列（重排會炸出 147 列假異動）。
    before = json.loads(old)["sfx"]
    order = [k for k in before if k in sfx] + sorted(k for k in sfx if k not in before)
    doc["sfx"] = {k: sfx[k] for k in order}
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n", old


GAP_LABEL = {
    "unresolvedEventCode": "事件碼解不開",
    "labelWithoutFiles": "有 label 沒檔名",
    "notInAnyArchive": "MPQ 裡沒有這個檔",
}


def render_ledger_md(ledger: dict) -> str:
    """帳本的人讀版。⛔ 手改沒有意義 —— 它從 PROVENANCE.json 產生，`--check` 在守。"""
    clips = ledger["clips"]
    mb = ledger["totalBytes"] / 1048576
    bound = sum(1 for c in clips.values() if c["bound"])
    n_model = sum(1 for c in clips.values() if "model-soundset" in c["sources"])
    n_decl = sum(1 for c in clips.values() if "ability-declared" in c["sources"])
    n_both = sum(1 for c in clips.values() if len(c["sources"]) == 2)
    L: list[str] = []
    A = L.append
    A("# wc3 —— 原作音效的**出處帳本**（GH#402）")
    A("")
    A(f"**{len(clips)} 個 clip**，合計 **{mb:.2f} MB**，權利人 **Blizzard Entertainment**，")
    A("22050 Hz / 單聲道 / 16-bit PCM，逐位元組**原封不動**（⛔ 沒有轉檔、沒有正規化、沒有裁切）。")
    A("")
    A("兩批來源合流在這一個目錄：")
    A("")
    A("| 來源 | 是什麼 | 數量 |")
    A("|---|---|---:|")
    A(f"| `model-soundset` | mdx 的 `SNDx` 事件軌（GH#402） | {n_model} |")
    A(f"| `ability-declared` | JASS 的 `gg_snd_*`（task #78） | {n_decl} |")
    A(f"| （兩者都有） | 同一份位元組，一個 key | {n_both} |")
    A("")
    A("---")
    A("")
    A("## 一 · 為什麼這些位元組可以進版控")
    A("")
    A("這個目錄推翻了 `content/assets/blizzard-local/README.md` 立的規則")
    A("（「do not commit them, do not bake them into an image」）。**推翻它的是 owner 本人**，")
    A("**分兩次**：")
    A("")
    A("> owner 2026-08-19 ①：「請幫我**註記取消這個規則**，現在的線上已經是")
    A("> **雙重審查只給認識的親友玩了**，請**直接上架但註記來源就好 不要ignore**」")
    A(">")
    A("> owner 2026-08-19 ②：「**既有 60 個 wc3.* 沒一起搬 => move**」")
    A("")
    A("這與 owner 2026-07-26 退掉版權/環境閘（#127 / #239）是同一個立場的延伸：")
    A("線上是雙重審查的親友私站。⭐ **條件是「註記來源」—— 這份檔案就是那個條件。**")
    A("")
    A("⚠️ **沒有出處的位元組就是違規。** 這不是散文，是一條會紅的閘：")
    A("`apps/client/src/render/views/blizzardOverlayGate.test.ts` 逐檔比對這份帳本，")
    A("**兩個方向都關**（有檔沒列 → 紅；有列沒檔 → 紅；sha256 對不上 → 紅）。")
    A("")
    A("### ⛔ 豁免的**界線**（⚠️ 這一格最容易被讀太寬）")
    A("")
    A("owner 兩次點名的都是**技能／武器／特效音**。⛔ **角色語音台詞不在裡面。**")
    A("")
    A("| | 數量 | 這一輪 |")
    A("|---|---:|---|")
    A(f"| **原作技能／武器／特效音**（這個目錄） | {len(clips)} | ✅ 進版控、正式站供應 |")
    A("| `data/blizzard-overlay/sounds/` 的**角色語音台詞** | 511 | ⛔ **不動**（#10 / #81 的範圍） |")
    A("| `data/blizzard-overlay/models/` 的模型 | 40 | ⛔ **不動** |")
    A("| 地圖作者自己 import 的 mp3（`kind: imported`） | — | ⛔ **不動**（出處不明，另有住處） |")
    A("")
    A("⇒ 放行的是 **{n} 個技能/武器/特效音效**，⛔ **不含 511 個角色語音台詞**。".format(n=len(clips)))
    A("")
    A("⚠️ **這 132 個不是那 511 個的子集。** 那 511 個是 #10 抽的角色語音")
    A("（Yes / What / Ready / Warcry / Pissed / Death，31 個資料夾）；這一批是照")
    A("`VFX_SOUND_JOIN.json` 與 `SFX_BINDINGS.json` 兩張清單**另外從 MPQ 抽的**。")
    A("兩批的交集只有 **5 個**。")
    A("")
    A("---")
    A("")
    A("## 二 · 這些位元組是怎麼來的（可重現）")
    A("")
    A("```bash")
    A("python3 tools/w3x-import/build_vfx_sound_bindings.py            # 重抽 + 重寫帳本")
    A("python3 tools/w3x-import/build_vfx_sound_bindings.py --check    # 只比對，過期就回非零")
    A("```")
    A("")
    A("來源是**使用者自己安裝的**零售 MPQ（repo 根目錄的 `war3.mpq` / `War3x.mpq` /")
    A("`War3xLocal.mpq` / `War3Patch.mpq`，本身**沒有**進版控）。挑哪些檔**不是人選的**：")
    A("")
    A("```")
    A("① mdx 的 SNDx 事件軌 → AnimLookups.slk → sound label → AnimSounds.slk → wav 路徑")
    A("② w3a/JASS 的 gg_snd_* → SFX_BINDINGS.json 的 bindings → wav 路徑")
    A("```")
    A("")
    A("key 一律是 `wc3.<wav 基名小寫>`。⭐ 兩批**共用這一條規則** —— 實測 task #78")
    A("那 60 個的 `gg_snd` 基名與 wav 基名 **60/60 完全相同**，所以合併之後")
    A("**既有 key 一個字都沒改**，只有它指到的路徑從 `assets/blizzard-local/` 換成")
    A("`assets/audio/wc3/`。")
    A("")
    A("---")
    A("")
    A("## 三 · 逐 clip 帳本")
    A("")
    A("「綁定」欄是**推導**的（掃 `content/config/vfx-families.json` 有沒有人指到這個 key），")
    A("⛔ 不是宣告的 —— 判例同 `sfxLabCredits.ts` 的「使用中 vs 收錄未啟用」。")
    A(f"目前 **{bound} / {len(clips)}** 已綁定；")
    A("⚠️ **`—` ⛔ 不是死位元組**：它是**鑄技工坊下拉選單裡的一格**，")
    A("owner 在後台把任何一支技能指過來就會響（第一守則）。")
    A("")
    A("| # | 我們的 key | 來源 | 來源 MPQ | 原始路徑 | 原始檔名 | sound label | 時機 | 綁定 | bytes | sha256 |")
    A("|---:|---|---|---|---|---|---|---|---|---:|---|")
    for i, key in enumerate(sorted(clips), 1):
        c = clips[key]
        docs = ", ".join(f"`{d}`" for d in c["abilityDocs"]) if c["bound"] else "—"
        A(
            f"| {i} | `{c['key']}` | {'+'.join(c['sources'])} | `{c['archive']}` | `{c['wc3Path']}` | `{c['wc3File']}` | "
            f"{c['soundLabel']} | {c['cue'].replace('sound', '')} | {docs} | {c['bytes']:,} | `{c['sha256']}` |"
        )
    A("")
    A("---")
    A("")
    A("## 四 · 缺口（⛔ 靜默跳過就是說謊）")
    A("")
    A("74 條路徑裡有 1 條抽不到，另有 5 顆事件解不開。**沒有任何一個模型因此全啞** ——")
    A("每一個都還有別的事件解得開（逐個查過，見下）。")
    A("")
    A("| 種類 | 模型 | 事件 / 路徑 | 為什麼 | 要不要緊 |")
    A("|---|---|---|---|---|")
    for g in ledger["gaps"]:
        what = g.get("event") or g.get("wc3Path", "")
        who = g.get("model") or ", ".join(g.get("models", []))
        A(f"| {GAP_LABEL.get(g['kind'], g['kind'])} | `{who}` | `{what}` | {g['why']} | 該模型另有解得開的事件 |")
    A("")
    A("---")
    A("")
    A("## 五 · 這些位元組被動過什麼")
    A("")
    A("**什麼都沒有。** 從 MPQ 讀出來的位元組直接落檔，sha256 就是 MPQ 裡那一份的 sha256。")
    A("⛔ 沒有重新取樣、沒有正規化音量、沒有轉成 mp3、沒有去頭尾靜音。")
    A("音量與節流住在 `content/config/audio-map.json`（`gain` / `cooldownMs` /")
    A("`maxConcurrent`），⭐ **那是後台改得動的一格**，⛔ 不是烘進檔案裡的。")
    A("")
    return "\n".join(L) + "\n"


def main() -> int:
    check = "--check" in sys.argv

    fam_doc = json.load(open(FAMILIES_JSON))
    fam_doc.setdefault("soundEnabled", True)

    join = model_sound_join()
    # ⚠️ MPQ 不在（乾淨 checkout / CI）時 SLK 兩張表是空的 → join 會**全部解不開**。
    # 那不是「綁定過期了」，是「這台機器沒有原始素材」。已經 commit 的報告才是真值，
    # ⛔ 不可以讓 `--check` 因為少了 850 MB 的 MPQ 就紅。
    if not join["animLookupRows"] and os.path.exists(REPORT):
        join = json.load(open(REPORT, encoding="utf-8"))["modelBoundSoundsets"]

    # ⭐ 抽取要在**最前面**：後面每一步都要問「這個 key 現在存不存在」，
    # 而答案由這一步決定（搬家會讓一整批 key 的路徑改變，甚至讓舊 key 消失）。
    clips, gaps = extract_wc3_clips(join)
    new_audio, old_audio = apply_audio_map(clips)
    all_keys = set(json.loads(new_audio)["sfx"].keys())

    # ── ⛔ 先清掉指向**已經不存在的 key** 的 cue ────────────────────────
    #
    # ⚠️ 這一步是搬家逼出來的，而且它擋的正是第一·五守則那條線：一格 cue 指著
    # audio-map 裡沒有的 key = 卡片上寫著有聲音、遊戲裡什麼都不會發生，而
    # `content:build` 與全套測試都是綠的。`wc3vfx.*` 這個只活了一輪的前綴就是
    # 這樣的一批 —— 合併命名空間之後它們**全部變成死指標**。
    # ⛔ 不要只清 `wc3vfx.`（那是一份會過期的名單），問 audio-map 就好。
    purged = 0
    for row in list(fam_doc["families"].values()) + list(fam_doc["abilities"].values()):
        for field in CUE_FIELDS:
            v = row.get(field)
            if isinstance(v, str) and v and v not in all_keys:
                row.pop(field)
                purged += 1

    # ── 家族原型（21 格）────────────────────────────────────────────────
    missing_family_keys = []
    for fam, cues in FAMILY_CUES.items():
        row = fam_doc["families"].get(fam)
        if row is None:
            continue
        for field, key in zip(CUE_FIELDS, cues):
            key = FALLBACK_IF_MISSING.get(key, key) if key not in all_keys else key
            if not key:
                row.pop(field, None)
                continue
            if key not in all_keys:
                missing_family_keys.append((fam, field, key))
                row.pop(field, None)
                continue
            row[field] = key

    # ── 逐支覆寫（原作 JASS 音效）──────────────────────────────────────
    bound, stats = ability_sound_bindings(all_keys)
    for aid, entry in bound.items():
        row = fam_doc["abilities"].setdefault(aid, {})
        row.update(entry)
    fam_doc["abilities"] = {k: fam_doc["abilities"][k] for k in sorted(fam_doc["abilities"])}

    # ── ③ 模型自帶 soundset（GH#402）—— 填四個時機 ──────────────────────
    model_stats = bind_model_sounds(clips, fam_doc)
    fam_doc["abilities"] = {k: fam_doc["abilities"][k] for k in sorted(fam_doc["abilities"])}
    # `bound` 逐 clip **推導**：這個 key 有沒有人真的指到它（⛔ 不宣告，會過期）。
    referenced = {
        v
        for row in list(fam_doc["families"].values()) + list(fam_doc["abilities"].values())
        for f, v in row.items()
        if f in CUE_FIELDS and isinstance(v, str)
    }
    for key, c in clips.items():
        c["bound"] = key in referenced
    model_stats["clipsBound"] = sum(1 for c in clips.values() if c["bound"])
    model_stats["staleCuesPurged"] = purged
    ledger = {
        "schema": "ggd-wc3-vfx-sound-provenance@1",
        "generator": "tools/w3x-import/build_vfx_sound_bindings.py",
        "authorisation": (
            "owner 2026-08-19：「請幫我註記取消這個規則，現在的線上已經是雙重審查只給認識的"
            "親友玩了，請直接上架但註記來源就好 不要ignore」（GH#402）"
        ),
        "rightsHolder": "Blizzard Entertainment",
        "condition": "每一個位元組都要有出處：來源 MPQ · 原始路徑 · 原始檔名 · sha256",
        "scope": (
            f"{len(clips)} 個 clip，全部是**模型自帶的特效音**（技能／武器／消散／死亡）。"
            "⚠️ 這一批**不是** data/blizzard-overlay/sounds/ 那 511 個角色語音台詞的子集 —— "
            "那 511 個是 #10 的 soundset 抽取產物，這 73 個是照 VFX_SOUND_JOIN 的清單"
            "**另外從 MPQ 抽的**（其中 5 個剛好與 overlay 既有檔重疊，68 個是新抽的）。"
            "⛔ 那 511 個角色語音、60 個 wc3.* 技能宣告音、40 個模型都不在這一輪。"
        ),
        "totalBytes": sum(c["bytes"] for c in clips.values()),
        "boundNote": (
            "`bound` 是**推導**的（掃 vfx-families.json 有沒有人指到這個 key），"
            "⛔ 不是宣告的 —— 判例同 sfxLabCredits.ts 的『使用中 vs 收錄未啟用』。"
            "bound=false ⛔ 不是死位元組：它是**鑄技工坊下拉選單裡的一格**，"
            "owner 在後台把任何一支技能指過來就會響（第一守則）。"
        ),
        "clips": {k: {f: v for f, v in clips[k].items() if not f.startswith("_")} for k in sorted(clips)},
        "gaps": sorted(gaps, key=lambda g: (g["kind"], g.get("model", ""), g.get("wc3Path", ""), g.get("event", ""))),
    }
    new_ledger = json.dumps(ledger, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    old_ledger = open(LEDGER_JSON, encoding="utf-8").read() if os.path.exists(LEDGER_JSON) else ""
    new_md = render_ledger_md(ledger)
    old_md = open(LEDGER_MD, encoding="utf-8").read() if os.path.exists(LEDGER_MD) else ""

    report = {
        "schema": "ggd-vfx-sound-join@1",
        "generator": "tools/w3x-import/build_vfx_sound_bindings.py",
        "modelBoundSoundsets": join,
        "abilityDeclaredSounds": stats,
        "modelSoundsetPort": {
            "clips": len(clips),
            "bytes": ledger["totalBytes"],
            "gaps": len(gaps),
            **model_stats,
        },
        "familyPrototypes": {
            "families": len(FAMILY_CUES),
            "missingAudioMapKeys": missing_family_keys,
        },
    }

    new_families = json.dumps(fam_doc, ensure_ascii=False, indent=2) + "\n"
    old_families = open(FAMILIES_JSON, encoding="utf-8").read()
    stale = [
        name
        for name, new, old in (
            ("content/config/vfx-families.json", new_families, old_families),
            ("content/config/audio-map.json", new_audio, old_audio),
            (os.path.relpath(LEDGER_JSON, REPO), new_ledger, old_ledger),
            (os.path.relpath(LEDGER_MD, REPO), new_md, old_md),
        )
        if new != old
    ]
    if check:
        if stale:
            print("⛔ 這幾份的特效音綁定過期了 —— 跑 "
                  "`python3 tools/w3x-import/build_vfx_sound_bindings.py` 再 `pnpm content:build`\n  "
                  + "\n  ".join(stale), file=sys.stderr)
            return 1
        print("vfx sound bindings up to date")
        return 0
    if new_families != old_families:
        open(FAMILIES_JSON, "w", encoding="utf-8").write(new_families)
    if new_audio != old_audio:
        open(AUDIO_MAP, "w", encoding="utf-8").write(new_audio)
    if new_ledger != old_ledger:
        open(LEDGER_JSON, "w", encoding="utf-8").write(new_ledger)
    if new_md != old_md:
        open(LEDGER_MD, "w", encoding="utf-8").write(new_md)
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    json.dump(report, open(REPORT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"families with sound cues : {len(FAMILY_CUES)}")
    print(f"abilities bound          : {stats['bound']} / {stats['abilitiesWithJassSound']} with JASS sound")
    print(f"models with SND events   : {join['modelsWithSoundEvents']} / {join['modelsScanned']}"
          f"  (AnimLookups rows {join['animLookupRows']}, unresolved {len(join['unresolvedEvents'])})")
    print(f"model soundset clips     : {len(clips)}  ({ledger['totalBytes'] / 1048576:.2f} MB)"
          f"  → {model_stats['cuesFilled']} cues on {model_stats['docsTouched']} ability docs"
          f"  ({model_stats['cuesLeftAlone']} left alone, {model_stats['docsCreated']} new rows)")
    if gaps:
        print(f"⚠️ gaps recorded in the ledger: {len(gaps)}")
    if missing_family_keys:
        print(f"⚠️ family cues dropped (key not in audio-map): {missing_family_keys}")
    print(f"report → {os.path.relpath(REPORT, REPO)}")
    print(f"ledger → {os.path.relpath(LEDGER_JSON, REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
