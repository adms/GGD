#!/usr/bin/env python3
"""Generate content/audio-manifests/ability-sfx-cues.json from its sources.

GH#554. ⛔ THAT FILE IS NO LONGER HAND-MAINTAINED — run this instead.

═══════════════════════════════════════════════════════════════════════════════
WHY (CLAUDE.md 第〇·四 —— 值在載入時從共用表解析，⛔ 不烘進每一份文件)
═══════════════════════════════════════════════════════════════════════════════
GH#529 moved the 52-cue allow-list out of a TypeScript `Set` and into JSON. That
fixed the deployment cost (client is baked at build time) but left the file
HAND-WRITTEN, and a hand-written derived file rots in the specific way CLAUDE.md
第三守則 describes — it says something that used to be true and nothing goes red.
It had already happened when this generator was written: two `unmatched` rows
carried the reason 「補它要先跑 tools/w3x-import 的抽取」, which is advice that can
never work (the clip is absent from the source map — see `reserved.json`).

So every field is now DERIVED from something measurable:

  cues[k].ggSnd   ← SFX_BINDINGS.json (the war3map.j scan)
  cues[k].origin  ← the `war3mapImported\\` prefix on wc3_path, ⛔ not the `kind`
                     label (which lies twice — see extract_stock_sfx.py)
  cues[k].note    ← the ability ids + names that resolve to k
  bindings        ← abilities with a content doc, no `sfxKey`, and one usable cue
  unmatched[]     ← every (shipped ability, gg_snd) pair that does NOT sound,
                     each with a `cause` the guard can assert on

⭐ WHERE THE BINDING ACTUALLY LIVES: `content/abilities/<id>.json`'s `sfxKey`.
This generator READS that and never re-copies it into `cues`/`bindings` — two
homes for one fact necessarily diverge. `bindings` is only the overlay for
abilities whose doc has no `sfxKey` at all.

═══════════════════════════════════════════════════════════════════════════════
THE TWO THINGS A GENERATOR MAY NOT DECIDE  → tools/sfx-bind/reserved.json
═══════════════════════════════════════════════════════════════════════════════
① When a JASS ability binds several gg_snds, which one is THE cast sound is a
   design choice. For a ported ability that choice lives in the doc's `sfxKey`.
   For an ability whose champion is not in content yet there is no doc, so the
   choice is recorded in `reserved.json.primaryForUnported` WITH A REASON THAT
   CAN BE ARGUED WITH. ⛔ The generator must not invent a tiebreak.
② "The source map itself is silent here" is a claim about bytes that are not in
   version control (the MPQs), so it is recorded in `reserved.json.sourceMapSilent`
   with its evidence rather than re-probed on every run.

Usage:
    python3 tools/sfx-bind/build_bindings.py            # write
    python3 tools/sfx-bind/build_bindings.py --check    # exit 1 if stale
"""

from __future__ import annotations

import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

SFX_BINDINGS = os.path.join(
    REPO, "tools", "w3x-import", "out", "GoDieEX22s-src", "SFX_BINDINGS.json"
)
AUDIO_MAP = os.path.join(REPO, "content", "config", "audio-map.json")
ABILITIES_DIR = os.path.join(REPO, "content", "abilities")
RESERVED = os.path.join(HERE, "reserved.json")
OUT = os.path.join(REPO, "content", "audio-manifests", "ability-sfx-cues.json")
LEDGER = os.path.join(HERE, "UNPORTED_SFX_LEDGER.json")

SCHEMA = "audio.ability-sfx-cues@1"
MAP_IMPORT_PREFIX = "war3mapimported\\"


# ── causes ─────────────────────────────────────────────────────────────────────
# The prose reason is derived from the cause so the two cannot drift; the guard
# asserts the CAUSE (a mechanism), ⛔ never the prose (content, it will change).
CAUSE_REASON = {
    "source-map-silent": (
        "⭐ 原作**自己就是啞的** —— war3map.j 宣告並呼叫了 {gg}，但它指向的匯入檔"
        "不在任何一份地圖封存裡（證據與 probe 結果：tools/sfx-bind/reserved.json）。"
        "⛔ 這不是我們欠的帳，也**不可能**靠重跑抽取補上"
    ),
    "not-extracted": (
        "{gg} 對應的 clip 還沒進 content/config/audio-map.json ⇒ 綁上去只會換成一次 "
        "audio-map miss（＝靜音），⛔ 不是原作音。補它要先跑 "
        "tools/w3x-import/extract_stock_sfx.py"
    ),
    "secondary-cue": (
        "一次施法只播**一個** cue，而 JASS 在這支技能上綁了不只一個 gg_snd；"
        "這是沒有被選中的那一個（要播它需要**分層播放**這個機制，⛔ 不是一列綁定）。"
        "被選中的是 {primary}"
    ),
}


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(2)


def cue_of(gg_snd: str) -> str:
    base = gg_snd[len("gg_snd_"):] if gg_snd.startswith("gg_snd_") else gg_snd
    return f"wc3.{base.lower()}"


def strip_number(name: str) -> str:
    """"33-01 放山雞" → "放山雞"; the number is the join key, not the label."""
    head, _, tail = name.partition(" ")
    return tail if tail and "-" in head and head.replace("-", "").isalnum() else name


def load_json(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build() -> tuple[dict, dict]:
    scan = load_json(SFX_BINDINGS)
    audio_map_keys = set(load_json(AUDIO_MAP)["sfx"])
    reserved = load_json(RESERVED)
    primary_reserved = {
        k: v for k, v in reserved["primaryForUnported"].items() if not k.startswith("_")
    }
    silent = {
        k: v for k, v in reserved["sourceMapSilent"].items() if not k.startswith("_")
    }

    docs: dict[str, dict] = {}
    for path in sorted(glob.glob(os.path.join(ABILITIES_DIR, "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        d = load_json(path)
        if isinstance(d, dict) and d.get("id"):
            docs[d["id"]] = d

    # ── per-ability: what did the JASS bind, and which one sounds? ────────────
    paths: dict[str, str] = {}  # gg_snd → wc3_path
    rows = []  # (ability, jass_name, [gg_snd...])
    for ab in scan["abilities"]:
        snds = []
        for s in ab["sounds"]:
            paths[s["gg_snd"]] = s["wc3_path"].replace("\\\\", "\\")
            snds.append(s["gg_snd"])
        rows.append((ab["ability"], ab.get("name", ""), snds))
    rows.sort()

    users: dict[str, list[tuple[str, str]]] = {}  # cue → [(ability, label)]
    unmatched, ledger = [], []

    for ability, jass_name, snds in rows:
        doc = docs.get(ability)
        label = strip_number(doc["name"] if doc and doc.get("name") else jass_name)
        usable = [g for g in snds if cue_of(g) in audio_map_keys]

        if doc is None:
            # champion not in content yet — knowledge goes to the tool-side ledger,
            # ⛔ NOT to `unmatched` (that list is guarded to name shipped abilities).
            if len(usable) == 1:
                primary = usable[0]
            elif ability in primary_reserved:
                want = primary_reserved[ability]["cue"]
                primary = next((g for g in snds if cue_of(g) == want), None)
                if primary is None:
                    die(f"reserved.primaryForUnported[{ability}] 指到 JASS 沒綁的 {want}")
            else:
                primary = None
            if primary is not None:
                users.setdefault(cue_of(primary), []).append((ability, label))
            ledger.append(
                {
                    "ability": ability,
                    "name": jass_name,
                    "champion": ability.split(".")[0],
                    "ggSnds": snds,
                    "reservedCue": cue_of(primary) if primary else None,
                    "note": (
                        "英雄還沒進 content/champions ⇒ 這支技能沒有 doc 可以掛 `sfxKey`。"
                        "英雄進來的時候把 reservedCue 寫進它的 `sfxKey`"
                    ),
                }
            )
            continue

        primary = doc.get("sfxKey")
        if primary is not None:
            if primary not in audio_map_keys:
                die(f"{ability}.sfxKey = {primary} 不在 audio-map ⇒ 執行期是一次 miss")
            users.setdefault(primary, []).append((ability, label))

        for gg in snds:
            cue = cue_of(gg)
            if cue == primary:
                continue
            if gg in silent:
                cause = "source-map-silent"
            elif cue not in audio_map_keys:
                cause = "not-extracted"
            else:
                cause = "secondary-cue"
            unmatched.append(
                {
                    "ability": ability,
                    "ggSnd": gg,
                    "cue": cue,
                    "cause": cause,
                    "reason": CAUSE_REASON[cause].format(gg=gg, primary=primary),
                }
            )

    # ── cues: map-imports first (same order the shipped file used) ────────────
    def origin(cue: str) -> str:
        gg = next(g for g in paths if cue_of(g) == cue)
        return (
            "map-import"
            if paths[gg].lower().startswith(MAP_IMPORT_PREFIX)
            else "stock-mpq"
        )

    cues = {}
    for cue in sorted(users, key=lambda c: (origin(c) != "map-import", c)):
        gg = next(g for g in paths if cue_of(g) == cue)
        by_label: dict[str, list[str]] = {}
        for ability, label in sorted(users[cue]):
            by_label.setdefault(label, []).append(ability)
        cues[cue] = {
            "ggSnd": gg,
            "origin": origin(cue),
            "note": ", ".join(
                f"{' / '.join(ids)} {label}" for label, ids in sorted(by_label.items())
            ),
        }

    # ── bindings: doc exists, has no sfxKey, and exactly one cue is usable ────
    bindings = {}
    for ability, _n, snds in rows:
        doc = docs.get(ability)
        if doc is None or doc.get("sfxKey"):
            continue
        usable = sorted({cue_of(g) for g in snds if cue_of(g) in cues})
        if len(usable) == 1:
            bindings[ability] = usable[0]

    unmatched.sort(key=lambda r: (r["ability"], r["ggSnd"]))
    ledger.sort(key=lambda r: r["ability"])

    doc_out = {
        "id": "ability-sfx-cues",
        "schema": SCHEMA,
        "note": (
            "GH#554 —— ⛔ **這份檔案是產生的**，不要手改："
            "`python3 tools/sfx-bind/build_bindings.py`（`--check` 是唯讀的閘）。"
            "GH#529 把 cue 名單從 `apps/client/src/audio/combatSfx.ts` 的 TypeScript "
            "`Set` 搬進 JSON（住 TS 的代價：改一個 cue = 重建 client 映像 + 一次完整部署），"
            "而 GH#554 讓每一格都從來源**推導** —— 手寫的衍生檔會用「看起來對」的方式腐爛，"
            "它已經發生過（兩列 unmatched 的理由要人去跑一個**不可能成功**的抽取）。"
        ),
        "source": (
            "tools/w3x-import/out/GoDieEX22s-src/SFX_BINDINGS.json（war3map.j 的 gg_snd 掃描）"
            " × content/config/audio-map.json（哪些 clip 真的出貨）"
            " × content/abilities/*.json 的 `sfxKey`（⭐ **綁定的家**，這份表⛔ 不重抄）"
            " × tools/sfx-bind/reserved.json（產生器推導不出來的兩件事，逐列帶理由）"
        ),
        "fields": {
            "cues": "允許出現在 `ability@1.sfxKey` 的 cue 名單。鍵 = audio-map 的 SFX key；⛔ 不在這裡的字串一律退回元素 whoosh，⛔ 不會變成一次 audio-map miss",
            "cues.*.ggSnd": "原作 war3map.j 裡的 gg_snd 變數名（出處，⛔ 不是執行期讀的東西）",
            "cues.*.origin": "map-import = 原作者自己匯入的 mp3；stock-mpq = 暴雪零售 MPQ 的位元組（出處帳本 content/assets/audio/wc3/PROVENANCE.md）。⭐ 由 wc3_path 的 `war3mapImported\\` 前綴推導，⛔ 不讀 SFX_BINDINGS 的 `kind` 標籤（它有兩列是假的）",
            "cues.*.note": "人看的備註（哪一支技能用它）。⛔ 它不是資料 —— 由 content/abilities/*.json 的 sfxKey 推導出來",
            "bindings": "⭐ **技能 id → cue 的覆蓋層**，給「技能文件上沒有 sfxKey、但 JASS 只給了一個能用的 cue」的情況。⛔ 一支技能不可以同時出現在這裡與自己的 `sfxKey`（守衛在擋）",
            "unmatched": "掃到了但**沒有**接上去的 (技能, gg_snd)，每一列帶 `cause`（機制，守衛驗這個）與 `reason`（人看的，由 cause 推導）。⚠️ 只列**有 content doc** 的技能；英雄還沒進 content 的那些住 tools/sfx-bind/UNPORTED_SFX_LEDGER.json",
            "unmatched.*.cause": "source-map-silent = 原作自己就是啞的（匯入檔不在封存裡）｜not-extracted = clip 還沒進 audio-map｜secondary-cue = 這支技能綁了不只一個 gg_snd，這是沒被選中的那個（要播它需要分層播放）",
        },
        "cues": cues,
        "bindings": bindings,
        "unmatched": unmatched,
    }

    ledger_out = {
        "id": "unported-sfx-ledger",
        "note": (
            "GH#554 —— JASS 掃到有施法音、但**英雄還沒進 content** 的技能。"
            "⛔ 不可以放進 content 的 `unmatched`（那張表被守衛要求逐列指向一支出貨的技能），"
            "而丟掉它就是第一·五守則說的「知識無聲消失」。⭐ 英雄進 content 的時候，"
            "把 reservedCue 寫進那支技能 doc 的 `sfxKey`，這一列會自動消失。"
        ),
        "generator": "tools/sfx-bind/build_bindings.py",
        "abilities": ledger,
    }
    return doc_out, ledger_out


def dumps(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"


def main(argv: list[str]) -> int:
    check = "--check" in argv
    doc_out, ledger_out = build()
    stale = []
    # GH#554② —— 建議表跟這一支共用同一個閘（⛔ 不是第 15 支要記得跑的產生器）。
    suggestion_stale = suggest_keys.run(check)
    if suggestion_stale:
        stale.append(suggestion_stale)
    for path, text in ((OUT, dumps(doc_out)), (LEDGER, dumps(ledger_out))):
        current = None
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                current = f.read()
        if check:
            if current != text:
                stale.append(os.path.relpath(path, REPO))
            continue
        if current != text:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            print(f"wrote {os.path.relpath(path, REPO)}")
        else:
            print(f"up to date {os.path.relpath(path, REPO)}")

    if check and stale:
        print(
            "ERROR: 這幾份是產生的，而它們跟來源對不上了：\n  "
            + "\n  ".join(stale)
            + "\n⇒ 跑 `python3 tools/sfx-bind/build_bindings.py` 然後 git add，"
            "⛔ 不要手改它們。",
            file=sys.stderr,
        )
        return 1
    if check:
        print("ability-sfx-cues.json / UNPORTED_SFX_LEDGER.json 都是最新的")
    print(
        f"  {len(doc_out['cues'])} cues · {len(doc_out['bindings'])} bindings · "
        f"{len(doc_out['unmatched'])} unmatched · {len(ledger_out['abilities'])} unported"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
