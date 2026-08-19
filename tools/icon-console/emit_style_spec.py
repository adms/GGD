#!/usr/bin/env python3
"""
emit_style_spec — publish task #72's ART DIRECTION as data the asset console
(client `#assets`) can render, plus a CONTACT SHEET picked from the live plan.

WHY THIS FILE EXISTS AT ALL
---------------------------
Everything the console shows is fetched at view time, from the same files the
game reads — except the style spec, because the style spec is Python. PREFIX,
NEGATIVE and the description→visual-subject lexicons live in
`tools/icon-gen/src/prompt.py` and nothing in a browser can import that.

The lazy fix is to retype the prompt text into the page. That is exactly the
failure this whole task exists to stop: the day #72 tunes PREFIX, the page
would keep confidently displaying the old art direction, and nobody would know.

So instead: this script IMPORTS #72's modules and calls their real functions —
`prompt.build_prompt`, `prompt.derive`, `plan.build_plan`, `plan.load_family`.
It never restates a rule, it evaluates it. If #72 edits a lexicon row, rerunning
this reflects it; if #72 renames a function, this CRASHES rather than quietly
publishing stale art direction.

AND THE STALENESS IS DETECTABLE FROM THE PAGE
---------------------------------------------
This is still a snapshot, so it records `sources[]`: the sha256 and size of
every file it derived from. The console fetches that alongside a LIVE digest
of the same files (the dev server recomputes it per request — see
apps/client/dev/iconConsoleStamp.ts) and shows a loud STALE banner naming the
exact command to rerun when they disagree. A number the user cannot re-check is
worth nothing; a number that hides its own staleness is worse than none.

⛔ NO CLOCK IN THE PUBLISHED SNAPSHOT (GH#395 / the GH#389 precedent)
--------------------------------------------------------------------
This file used to stamp `generatedAt`, and every `sources[]` row used to carry
an `mtime`. Both are gone, and the reason is that this artefact HAS a `--check`:

  · `generatedAt` forced `--check` to be RELAXED ("compare everything else"),
    and a relaxed gate is not a gate — field order, indentation, even a
    hand-edited digest all walked straight through it. It is now a WHOLE-OBJECT
    comparison, so nothing can.
  · `mtime` was worse than useless: it is never read by any verdict
    (`assetConsole.compareFreshness` decides drift on sha256 ALONE) while
    `git checkout` / a deploy rewrites every mtime without changing a byte —
    so it made `--check` report STALE about a file that had not changed, and
    made the checked-in artefact dirty on every clone.

⭐ The snapshot's identity comes from its INPUTS: `contentDigest` plus the
per-source sha256. That is what the page shows and what `--check` compares.
「這份快照是什麼時候產的」 was never the question anyone had — 「它還準不準」 was,
and only the digests answer that.

OWNERSHIP: this reads #72's files and writes ONLY
`content/assets/icon-console/style-spec.json`. It does not modify anything under
tools/icon-gen/. Output goes to content/assets/ (a plain file tree served by
both the dev server and prod nginx) and NOT to content/config/, which is a
schema-validated collection whose closed discriminated union would reject it.

Usage:
    python3 tools/icon-console/emit_style_spec.py            # write
    python3 tools/icon-console/emit_style_spec.py --check    # exit 1 if stale
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ICON_GEN_SRC = os.path.join(ROOT, "tools", "icon-gen", "src")

# Import #72's modules AS MODULES. Their real functions are the only source of
# truth for anything printed here.
sys.path.insert(0, ICON_GEN_SRC)
import plan as icon_plan  # noqa: E402
import prompt as icon_prompt  # noqa: E402

OUT_DIR = os.path.join(ROOT, "content", "assets", "icon-console")
OUT_PATH = os.path.join(OUT_DIR, "style-spec.json")
PRICING_PATH = os.path.join(ICON_GEN_SRC, "pricing.json")

# The files whose contents this snapshot is derived from. The console's live
# freshness check hashes exactly this list, so adding a dependency here without
# adding it to the dev-server stamp would create a blind spot.
SOURCE_FILES = [
    "tools/icon-gen/src/prompt.py",
    "tools/icon-gen/src/plan.py",
    "tools/icon-gen/src/pricing.json",
]

SPEC_VERSION = "icon-console/style-spec@1"


# --------------------------------------------------------------- sources ----

def digest_file(rel: str) -> dict:
    path = os.path.join(ROOT, rel)
    with open(path, "rb") as fh:
        raw = fh.read()
    # ⛔ 沒有 mtime（GH#395）—— 見檔頭「NO CLOCK IN THE PUBLISHED SNAPSHOT」。
    return {
        "path": rel,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
    }


def sources() -> list[dict]:
    return [digest_file(rel) for rel in SOURCE_FILES]


# --------------------------------------------------------- contact sheet ----
#
# 16 slots. THE POINT OF THE SHEET IS TO FAIL LOUDLY, so slots are not "16 nice
# icons" — they are 16 PROBES, each one a question the pinned prompt could get
# wrong, chosen from the live plan by an explicit predicate rather than by hand.
# If a probe finds nothing in the current content set, the slot is emitted with
# `found: false` and says so on the page; it is never silently dropped.

SHEET_SIZE = 16


def _job(doc: dict, family: str, doc_id: str, probe: str, why: str) -> dict:
    """One slot: the doc, what it probes, and the EXACT string that would be
    sent to the image model — built by #72's own build_prompt()."""
    subject, signal, confidence = icon_prompt.derive(doc, family)
    return {
        "probe": probe,
        "why": why,
        "found": True,
        "id": doc_id,
        "family": family,
        "name": (doc.get("name") or "").strip(),
        "description": (doc.get("description") or "").strip(),
        "descriptionChars": len((doc.get("description") or "").strip()),
        "signal": signal,
        "confidence": confidence,
        "subject": subject,
        "prompt": icon_prompt.build_prompt(subject),
    }


def _missing(probe: str, why: str) -> dict:
    return {"probe": probe, "why": why, "found": False}


def build_contact_sheet(pl: dict, docs: dict[str, dict[str, dict]]) -> list[dict]:
    # The candidate pool is exactly what the planner says would be generated —
    # never the whole content set. A probe that picked a dropped or blocked doc
    # would be validating art nobody is going to make.
    pool: list[tuple[str, str, dict]] = []
    for tier in ("tier1", "tier2"):
        for row in pl["generate"][tier]:
            doc = docs[row["family"]].get(row["id"])
            if doc is not None:
                pool.append((row["id"], row["family"], doc))
    by_id = {doc_id: (family, doc) for doc_id, family, doc in pool}

    def derived(doc: dict, family: str) -> tuple[str, str, str]:
        return icon_prompt.derive(doc, family)

    slots: list[dict] = []
    used: set[str] = set()

    def take(probe: str, why: str, picks: list[tuple[str, str, dict]]) -> None:
        for doc_id, family, doc in picks:
            if doc_id in used:
                continue
            used.add(doc_id)
            slots.append(_job(doc, family, doc_id, probe, why))
            return
        slots.append(_missing(probe, why))

    tier1 = [(i, f, d) for i, f, d in pool if i in set(pl.get("vetoed") or [])]

    # ---- HARD CASE 1: a vague description -----------------------------------
    # The lexicon matched nothing and the prompt fell back to the [tag] default.
    # If the sheet renders these as interchangeable blobs, the fallback needs
    # work; that is a finding, not a failure of the run.
    vague = sorted(
        (t for t in pool if derived(t[2], t[1])[2] == "low"),
        key=lambda t: len(icon_prompt.clean_body((t[2].get("description") or ""))),
    )
    take(
        "vague-description",
        "說明過短或完全沒有可視覺化的名詞：詞庫沒命中，主體是 [tag] 的預設值。"
        "這格是用來檢查『最差的提示詞』畫出來還能不能看。",
        vague,
    )
    take(
        "vague-description-2",
        "同上，第二個低信心樣本——兩格如果畫出幾乎一樣的東西，代表 fallback 太籠統。",
        vague,
    )

    # ---- HARD CASE 2: a very long description -------------------------------
    longest = sorted(pool, key=lambda t: -len((t[2].get("description") or "")))
    take(
        "longest-description",
        "全計畫中說明最長的一筆。clean_body() 要把數值與制式用語全部剝掉、只留下可畫的意象；"
        "這格檢查長文會不會把主體稀釋成一團模糊。",
        longest,
    )

    # ---- HARD CASE 3: two that MUST look like siblings ----------------------
    # Same champion kit: Q/W/E/R of one hero must read as one character's
    # techniques, not four unrelated pictures.
    kits: dict[str, list[tuple[str, str, dict]]] = {}
    for doc_id, family, doc in pool:
        if family == "abilities":
            kits.setdefault(icon_plan.champion_of(doc_id), []).append((doc_id, family, doc))
    sibling_kit = next(
        (
            sorted(v, key=lambda t: t[0])
            for _, v in sorted(kits.items())
            if len(v) >= 2
        ),
        [],
    )
    take(
        "siblings-same-kit-a",
        "同一位英雄的技能組（第一格）。這兩格必須看起來像同一個角色的招式——"
        "共用的重點色與筆觸是 PREFIX 的責任，如果兩格像來自兩款遊戲，風格前綴就沒生效。",
        sibling_kit,
    )
    take(
        "siblings-same-kit-b",
        "同一位英雄的技能組（第二格）。與上一格成對判讀。",
        sibling_kit,
    )

    # ---- HARD CASE 4: two that MUST look distinct ---------------------------
    # prompt.py's own docstring admits this risk: two docs whose derived subject
    # is character-for-character identical WILL very likely render the same
    # picture. Finding a real collision in the live plan and putting BOTH on the
    # sheet is the sharpest test the set has.
    subject_index: dict[str, list[tuple[str, str, dict]]] = {}
    for doc_id, family, doc in pool:
        subject_index.setdefault(derived(doc, family)[0], []).append((doc_id, family, doc))
    collisions = sorted(
        (v for v in subject_index.values() if len(v) >= 2),
        key=lambda v: (-len(v), v[0][0]),
    )
    collision = collisions[0] if collisions else []
    take(
        "identical-subject-a",
        "警告格：這一筆與下一筆推導出的 SUBJECT 逐字相同，所以幾乎一定會畫出同一張圖，"
        "但它們是不同的內容。prompt.py 自己的註解已經點名這個風險——這是全張表最尖銳的一格。",
        collision,
    )
    take(
        "identical-subject-b",
        "警告格（第二半）。若兩格果然相同，就證明需要 --subject=text 或加寬詞庫，"
        "而不是直接付錢跑完 660 張。",
        collision,
    )

    # ---- coverage of the signal paths ---------------------------------------
    def by(pred) -> list[tuple[str, str, dict]]:
        return [t for t in pool if pred(t)]

    take(
        "tier1-champion",
        "上線面向（tier 1）的英雄。角色肖像的推導路徑與技能/道具完全不同，必須各驗一格。",
        [t for t in tier1 if t[1] == "champions"],
    )
    take(
        "tier1-item-en",
        "手寫英文的 tier 1 道具：走的是 NAME_NOUN_EN／ELEMENT_HUE_EN 這條分支，"
        "中文詞庫一格都不會命中。",
        [t for t in tier1 if t[1] == "items" and t[0].isascii()],
    )
    take(
        "tier1-ability",
        "上線面向（tier 1）的技能——玩家最常盯著看的圖示。",
        [t for t in tier1 if t[1] == "abilities"],
    )
    take(
        "ability-name-signal",
        "名稱命中詞庫的高信心技能。這是最好的情況，用來當作整組的品質上限。",
        by(lambda t: t[1] == "abilities" and derived(t[2], t[1])[1] == "name"),
    )
    take(
        "ability-body-signal",
        "名稱沒命中、改由說明命中的中信心技能。prompt.py 的註解記著這條路曾把「妖狐變化」"
        "誤判成一隻拳頭，所以這條分支必須被看見。",
        by(lambda t: t[1] == "abilities" and derived(t[2], t[1])[1] == "body"),
    )
    take(
        "ability-passive-composition",
        "被動技能：構圖應該是靜態的紋章，而不是出招的瞬間。這格驗 ABILITY_COMP 的分流。",
        by(
            lambda t: t[1] == "abilities"
            and "still heraldic emblem" in derived(t[2], t[1])[0]
        ),
    )
    take(
        "ability-active-composition",
        "主動技能：構圖應該是命中的瞬間、能量朝觀者爆開。與上一格對照才看得出分流有沒有效。",
        by(
            lambda t: t[1] == "abilities"
            and "instant of the strike" in derived(t[2], t[1])[0]
        ),
    )
    take(
        "item-category-only",
        "只靠分類命中的道具（名稱沒有可畫的名詞）。主體會是「一件武器」這種泛稱，"
        "檢查泛稱能不能撐起一張可辨識的圖。",
        by(lambda t: t[1] == "items" and derived(t[2], t[1])[1] == "category"),
    )
    take(
        "item-fallback",
        "連分類都沒命中的道具，落到「an adventuring relic」。這是道具端的最差情況。",
        by(lambda t: t[1] == "items" and derived(t[2], t[1])[1] == "fallback"),
    )
    take(
        "item-stat-hue",
        "帶有力量／敏捷／智慧等屬性的道具：重點色由 STAT_HUE 決定，"
        "整組道具的顏色語言要能一眼分辨屬性。",
        by(lambda t: t[1] == "items" and derived(t[2], t[1])[1] == "name+category"),
    )

    # Never silently over- or under-fill: the sheet is a fixed 16-slot contract
    # and the runner's --limit 16 is sized to it.
    return slots[:SHEET_SIZE]


# ------------------------------------------------------------------ spec ----

def build_spec() -> dict:
    pl = icon_plan.build_plan()
    docs = {family: icon_plan.load_family(family) for family in icon_plan.FAMILIES}
    with open(PRICING_PATH, encoding="utf-8") as fh:
        pricing = json.load(fh)

    sheet = build_contact_sheet(pl, docs)

    return {
        "schema": SPEC_VERSION,
        # ⛔ 沒有 generatedAt（GH#395）—— 見檔頭。身分由 contentDigest + sources[].sha256 給。
        "generatedBy": "tools/icon-console/emit_style_spec.py",
        # Ties this snapshot to the plan it was derived from. The console
        # re-fetches icon-plan.json live and warns if the digests diverge.
        "templateVersion": icon_prompt.TEMPLATE_VERSION,
        "contentDigest": pl["contentDigest"],
        "sources": sources(),
        "template": {
            "prefix": icon_prompt.PREFIX,
            "negative": icon_prompt.NEGATIVE,
            # The literal assembly, so the page can show the shape without
            # re-implementing it.
            "shape": 'PREFIX + " SUBJECT: " + subject + ". " + NEGATIVE',
            "example": icon_prompt.build_prompt("«SUBJECT»"),
        },
        "textMode": {
            "field": icon_prompt.TEXT_SYSTEM_FIELD,
            "instruction": icon_prompt.TEXT_INSTRUCTION,
            "note": "--subject=text 改用一次 /ai/text 呼叫產生主體句；PREFIX 與 NEGATIVE 永不外包。",
        },
        # The description→visual-subject rule, as data. Ordered exactly as the
        # matcher walks them, because order IS the rule (longer/more specific
        # entries must be matched first).
        "lexicon": {
            "nameNoun": [list(r) for r in icon_prompt.NAME_NOUN],
            "nameNounEn": [list(r) for r in icon_prompt.NAME_NOUN_EN],
            "elementHue": [list(r) for r in icon_prompt.ELEMENT_HUE],
            "elementHueEn": [list(r) for r in icon_prompt.ELEMENT_HUE_EN],
            "itemArchetype": [[k, v] for k, v in icon_prompt.ITEM_ARCHETYPE.items()],
            "statHue": [list(r) for r in icon_prompt.STAT_HUE],
            "abilityComposition": [[k, v] for k, v in icon_prompt.ABILITY_COMP.items()],
            "tagFallbackNoun": [[k, v] for k, v in icon_prompt._TAG_FALLBACK_NOUN.items()],
            "boilerplate": list(icon_prompt.BOILER),
        },
        "rules": [
            {
                "id": "name-first",
                "text": "名稱優先比對。曾經有一版先比對說明，把「妖狐變化」變成了 an impacting fist——"
                        "因為制式用語「攻擊力」裡有個「擊」。",
            },
            {
                "id": "numbers-are-mechanics",
                "text": "數字是機制不是視覺，比對前先被剝除。",
            },
            {
                "id": "no-raw-prose",
                "text": "任何中文機制敘述都不會被送進圖像模型。只有名稱以「」包起來、當作專有名詞送出。",
            },
            {
                "id": "no-border",
                "text": "NEGATIVE 明確禁止外框／浮雕／按鈕邊。已萃取的 113 張把 WC3 的邊框燒在圖裡，"
                        "新生成的這一組刻意不跟。",
            },
        ],
        "contactSheet": {
            "size": SHEET_SIZE,
            "runCommand": (
                "python3 tools/icon-gen/src/generate.py --tier 1 --quality low "
                "--limit 16 --max-spend 1.00 --i-have-confirmed-pricing"
            ),
            "note": "這 16 格是刻意挑出來會出問題的樣本，不是 16 張好看的圖。",
            "slots": sheet,
        },
        "pricing": pricing,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if the published spec differs from a fresh one")
    args = ap.parse_args()

    spec = build_spec()

    if args.check:
        try:
            with open(OUT_PATH, encoding="utf-8") as fh:
                current = json.load(fh)
        except Exception:
            print("style-spec.json missing or unreadable — rerun without --check")
            sys.exit(1)
        # ⭐ GH#395 —— **整個物件**比對，⛔ 不再豁免任何欄位。這條以前寫著
        # 「generatedAt always differs; compare everything else」，而那個豁免
        # 就是這個閘的洞：被豁免掉的不只是那格時間，是「已發布的那一份與新產的
        # 那一份逐欄相等」這句話本身。
        if current != spec:
            print("style-spec.json is STALE — rerun: python3 tools/icon-console/emit_style_spec.py")
            sys.exit(1)
        print("style-spec.json is current")
        return

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(spec, fh, ensure_ascii=False, indent=1, sort_keys=False)
        fh.write("\n")

    found = sum(1 for s in spec["contactSheet"]["slots"] if s.get("found"))
    print(f"wrote {os.path.relpath(OUT_PATH, ROOT)}")
    print(f"  template   {spec['templateVersion']}  content digest {spec['contentDigest']}")
    print(f"  sheet      {found}/{SHEET_SIZE} slots resolved to a real document")
    for s in spec["sources"]:
        print(f"  source     {s['path']}  {s['sha256'][:12]}  {s['bytes']}B")


if __name__ == "__main__":
    main()
