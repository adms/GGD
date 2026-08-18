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
   解出來了（419 顆事件節點）；`UI\\SoundInfo\\AnimLookups.slk` 把 4 碼事件碼翻成
   sound label，`AnimSounds.slk` 再翻成真的 wav 路徑。
   ⚠️ 這一半這支腳本只**產報告**（`out/VFX_SOUND_JOIN.json`），⛔ 不動內容 ——
   因為那些 wav 是 Blizzard 的，只能落在 git-ignored 的 overlay，
   而 overlay 在正式站上**不供應**⇒ 綁上去等於在正式站上綁一片安靜。
   報告是下一步（把它們接成 overlay 升級）的輸入。
2. **技能宣告的音效** —— w3a/JASS 的 `gg_snd_*`。SFX_BINDINGS.json 有 98 支，
   而其中大多數的 clip **早就抽出來且早就有 audio-map key**（`wc3.*`，task #78）。
   這一半**真的寫進內容**：`abilities[<id>].soundLaunch`。

家族原型那 21 格填的是**出貨**的 sfx key（`explosion` / `magicFire` …），
⛔ 不是 overlay key —— 家族是「每一支都聽得到」的那一層，正式站必須有聲音。
逐支覆寫才是 overlay 那一層（客戶端在 overlay 不在時會退回家族音，見
`apps/client/src/audio/vfxSound.ts`）。

Usage:  python3 tools/w3x-import/build_vfx_sound_bindings.py [--check]
        --check = 只比對、不寫檔，內容會變就回非零（給閘用）
"""

from __future__ import annotations

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

RETAIL_ARCHIVES = ["war3.mpq", "War3x.mpq", "War3xLocal.mpq", "War3Patch.mpq"]

# ── 21 個家族原型的預設音（第零守則⑨：K 個模板，⛔ 不是 258 輪）────────────
#
# 每一格都是 `content/config/audio-map.json` 的 **出貨** sfx key。
# ⛔ 不要填 `wc3.*` —— 那些 clip 住在 git-ignored 的 overlay，正式站不供應。
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


def main() -> int:
    check = "--check" in sys.argv
    audio = json.load(open(AUDIO_MAP))
    all_keys = set(audio["sfx"].keys())

    fam_doc = json.load(open(FAMILIES_JSON))
    fam_doc.setdefault("soundEnabled", True)

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

    join = model_sound_join()
    report = {
        "schema": "ggd-vfx-sound-join@1",
        "generator": "tools/w3x-import/build_vfx_sound_bindings.py",
        "modelBoundSoundsets": join,
        "abilityDeclaredSounds": stats,
        "familyPrototypes": {
            "families": len(FAMILY_CUES),
            "missingAudioMapKeys": missing_family_keys,
        },
    }

    new_families = json.dumps(fam_doc, ensure_ascii=False, indent=2) + "\n"
    old_families = open(FAMILIES_JSON, encoding="utf-8").read()
    changed = new_families != old_families
    if check:
        if changed:
            print("⛔ content/config/vfx-families.json 的音效綁定過期了 —— 跑 "
                  "`python3 tools/w3x-import/build_vfx_sound_bindings.py` 再 `pnpm content:build`",
                  file=sys.stderr)
            return 1
        print("vfx sound bindings up to date")
        return 0
    if changed:
        open(FAMILIES_JSON, "w", encoding="utf-8").write(new_families)
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    json.dump(report, open(REPORT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"families with sound cues : {len(FAMILY_CUES)}")
    print(f"abilities bound          : {stats['bound']} / {stats['abilitiesWithJassSound']} with JASS sound")
    print(f"models with SND events   : {join['modelsWithSoundEvents']} / {join['modelsScanned']}"
          f"  (AnimLookups rows {join['animLookupRows']}, unresolved {len(join['unresolvedEvents'])})")
    if missing_family_keys:
        print(f"⚠️ family cues dropped (key not in audio-map): {missing_family_keys}")
    print(f"report → {os.path.relpath(REPORT, REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
