#!/usr/bin/env python3
"""新英雄上架 SOP 稽核器 — task #214.

Walks the 16-row checklist in docs/新英雄上架SOP.md against one or more champion
ids and prints a PASS/FAIL table. The doc is the human-readable contract; this is
the machine that checks it, so "we followed the SOP" is verifiable instead of
asserted.

WHY A SCRIPT AND NOT ONLY A DOC. #214 exists because #212 shipped a hero that was
registered everywhere a human would look (content docs, indexes, voices, EX map)
and enabled NOWHERE that matters. A prose checklist would have been read and
ticked exactly the same way. Rows 12-16 — the enablement half — are the ones a
reader's eye slides over, so they are the ones that need a machine.

WHAT IT DOES NOT DO. It does not run the castability sweep (row 15) or the test
suites; those are commands the doc names, and their results are pasted back into
the doc. It checks the STATE those commands depend on.

Usage:
    python3 tools/hero-onboarding/audit_hero.py godie-hblm godie-efur
    python3 tools/hero-onboarding/audit_hero.py --all-starter     # the whole roster

Exit code is 1 if any row FAILs, so it can gate a release step.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SLOTS = ["passive", "q", "w", "e", "r", "ex"]
CORE = ["q", "w", "e", "r"]
STARTER_GO = "apps/platform/internal/curation/starter.go"


def p(*parts: str) -> str:
    return os.path.join(ROOT, *parts)


def load(path: str):
    with open(p(path), encoding="utf-8") as fh:
        return json.load(fh)


def index_ids(idx) -> set[str]:
    entries = idx.get("entries", idx)
    if isinstance(entries, dict):
        return set(entries.keys())
    return {e.get("id") for e in entries}


def starter_roster() -> list[str]:
    """Parse `starterChampions` out of the tracked Go source.

    Mirrors packages/shared/testkit/starterRoster.ts on purpose — same block, same
    comment-stripping, so this script and the TS suites can never disagree about
    what the roster is.
    """
    src = open(p(STARTER_GO), encoding="utf-8").read()
    start = src.index("starterChampions = []string{")
    open_i = src.index("{", start)
    close = src.index("\n\t}", open_i)
    body = re.sub(r"//[^\n]*", "", src[open_i:close])
    return re.findall(r'"([^"]+)"', body)


def audit(hid: str) -> list[tuple[str, bool, str]]:
    """Return [(row label, ok, detail)] for one champion id."""
    rows: list[tuple[str, bool, str]] = []

    def row(label: str, ok: bool, detail: str = "") -> None:
        rows.append((label, bool(ok), detail))

    # -- 1. champion doc -----------------------------------------------------
    champ_path = f"content/champions/{hid}.json"
    has_champ = os.path.exists(p(champ_path))
    champ = load(champ_path) if has_champ else {}
    row(
        "1 champion doc",
        has_champ and champ.get("schema") == "champion@1" and bool(champ.get("name")),
        champ.get("name", "MISSING"),
    )

    # -- 2. six ability docs -------------------------------------------------
    abil: dict[str, dict] = {}
    missing = []
    for s in SLOTS:
        ap = f"content/abilities/{hid}.{s}.json"
        if os.path.exists(p(ap)):
            abil[s] = load(ap)
        else:
            missing.append(s)
    row("2 六支技能文件", not missing, "缺 " + ",".join(missing) if missing else "passive+QWER+EX")

    # -- 3. ability <-> champion MIRROR --------------------------------------
    # The champion doc embeds copies of Q/W/E/R. They must equal the standalone
    # docs modulo the `schema` key, which is standalone-only tree-wide.
    drift = []
    for slot in CORE:
        emb = (champ.get("abilities") or {}).get(slot.upper())
        std = abil.get(slot)
        if emb is None or std is None:
            drift.append(slot.upper())
            continue
        if emb != {k: v for k, v in std.items() if k != "schema"}:
            drift.append(slot.upper())
    row("3 mirror 同步", not drift, "漂移 " + ",".join(drift) if drift else "QWER 一致")

    # -- 4. index registration ----------------------------------------------
    champ_idx = index_ids(load("content/champions/_index.json"))
    abil_idx = index_ids(load("content/abilities/_index.json"))
    not_indexed = [s for s in SLOTS if f"{hid}.{s}" not in abil_idx]
    row(
        "4 _index 註冊",
        hid in champ_idx and not not_indexed,
        "跑 pnpm content:build" if (hid not in champ_idx or not_indexed) else "champions+abilities",
    )

    # -- 5. hero-number convention (task #11) --------------------------------
    # The rule is ONE hero number shared by all six, and the six code suffixes
    # forming exactly {00, 01, 02, 03, 04, 002}. It is deliberately NOT
    # "Q must be 01": the w3x's own ability ordering is preserved (faithful
    # import), so 賈修 Q is 05-01 while Saber Q is 20-02 and both are correct.
    nums, codes, unparsed = set(), [], []
    for s in SLOTS:
        m = re.match(r"^(\d{2,3})-(\d{2,3})\s", abil.get(s, {}).get("name", ""))
        if not m:
            unparsed.append(s)
            continue
        nums.add(m.group(1))
        codes.append(m.group(2))
    row(
        "5 英雄編號規約",
        len(nums) == 1 and not unparsed and sorted(codes) == sorted(["00", "01", "02", "03", "04", "002"]),
        f"編號 {sorted(nums)}" + (f"，無法解析 {','.join(unparsed)}" if unparsed else ""),
    )

    # -- 6. JP name census ---------------------------------------------------
    nd = "content/assets/audio/voices/names"
    clips = [f"{nd}/{hid}{suf}" for suf in (".mp3", ".name.mp3", ".title.mp3")]
    have_clips = all(os.path.exists(p(c)) for c in clips)
    in_manifest = hid in json.dumps(load(f"{nd}/MANIFEST.json"))
    in_builder = hid in open(p("tools/tts-gen/src/build-champ-names.mjs"), encoding="utf-8").read()
    row("6 日文名字普查", have_clips and in_manifest and in_builder, "3 clips + MANIFEST + builder row")

    # -- 7. 名言 quote -------------------------------------------------------
    quote_ok = os.path.exists(p(f"content/assets/audio/voices/quotes/{hid}.mp3"))
    quote_row = hid in open(p("tools/tts-gen/src/build-champ-quotes.mjs"), encoding="utf-8").read()
    row("7 名言語音", quote_ok and quote_row, "quotes/<id>.mp3 + builder row")

    # -- 8. EX map -----------------------------------------------------------
    exmap = load("tools/w3x-import/out/GoDieEX22s/EX_MAP.json")
    entry = exmap.get("heroes", {}).get(hid)
    row(
        "8 EX rawcode 對照",
        bool(entry and entry.get("exAbility")) and hid not in exmap.get("withoutEx", []),
        (entry or {}).get("exAbility", "MISSING"),
    )

    # -- 9. voice pack -------------------------------------------------------
    ldir = p(f"content/assets/audio/voices/lines/{hid}")
    n_lines = len([f for f in os.listdir(ldir) if f.endswith(".mp3")]) if os.path.isdir(ldir) else 0
    in_roster = hid in json.dumps(load("content/assets/audio/voices/lines/ROSTER.json"))
    row("9 戰鬥語音包", n_lines > 0 and in_roster, f"{n_lines} clips, ROSTER={'yes' if in_roster else 'NO'}")

    # -- 10. champion-voices click entry ------------------------------------
    # An entry must exist, and its `select` clips must not be shared with ANOTHER
    # CHAMPION IN THE ROSTER — two selectable heroes answering a click with the
    # same line is the audible failure (the same property
    # apps/client/src/audio/selectVoiceCoverage.test.ts pins).
    #
    # NOT machine-checkable, and therefore called out in the doc as a HUMAN step:
    # whether the clip is this character's line at all. That is exactly how #212
    # shipped 揍敵客 speaking 飛影's 87joke — the binding was unique, just wrong.
    all_voices = load("content/config/champion-voices.json")["champions"]
    cv = all_voices.get(hid)
    roster_ids = set(starter_roster())
    shared = []
    if cv:
        for f in cv.get("select", []):
            for cid, e in all_voices.items():
                if cid != hid and f in e.get("select", []) and cid in roster_ids:
                    shared.append(f"{f}={cid}")
    row(
        "10 點擊語音綁定",
        cv is not None and not shared,
        "與名單內他人共用 " + ",".join(shared) if shared else (cv or {}).get("source", "MISSING"),
    )

    # -- 11. icons (ADVISORY) ------------------------------------------------
    # starter.go deliberately does NOT gate on icons: stock-art heroes ship with
    # none, and #72/#178 are still filling the tree in. Reported, never blocking.
    champ_icon = any(os.path.exists(p(f"content/assets/icons/champions/{hid}{e}")) for e in (".png", ".webp"))
    ab_icons = [s for s in SLOTS if not os.path.exists(p(f"content/assets/icons/abilities/{hid}.{s}.webp"))]
    row(
        "11 圖示 (advisory)",
        champ_icon,
        ("缺技能圖 " + ",".join(ab_icons) + "（#72/#178 待補，不阻擋）") if ab_icons else "champion + 6 abilities",
    )

    # -- 12. FIRST OPEN ROSTER (the row #212 missed) -------------------------
    roster = starter_roster()
    row("12 首發名單 starter.go", hid in roster, f"roster={len(roster)}")

    # -- 13. pinned Go roster ------------------------------------------------
    pinned = open(p("apps/platform/internal/curation/starter_content_test.go"), encoding="utf-8").read()
    row("13 Go 釘死名單", f'"{hid}"' in pinned, "firstOpenRoster literal")

    # -- 14. operator whitelist (gitignored; advisory only) ------------------
    wl_path = p("data/curation/whitelist.json")
    if os.path.exists(wl_path):
        with open(wl_path, encoding="utf-8") as fh:
            wl = json.load(fh)
        ok = hid in wl.get("champions", []) and f"{hid}.ex" in wl.get("abilities", [])
        detail = "champions + <id>.ex" if ok else "缺 champion 或 <id>.ex"
    else:
        ok, detail = True, "本機無 whitelist.json（正常：gitignore 的營運狀態）— 需在部署主機的後台『內容白名單』手動加開"
    row("14 營運白名單 (advisory)", ok, detail)

    # -- 15. castability sweep report ---------------------------------------
    report = open(p("docs/_castability-128.md"), encoding="utf-8").read()
    line = next((l for l in report.splitlines() if f"`{hid}`" in l), "")
    cells = [c.strip() for c in line.split("|")[4:10]] if line else []
    row("15 可施放掃描", bool(cells) and all(c in ("✅", "🟣") for c in cells), " ".join(cells) or "未出現在報告中")

    # -- 16. store catalog ---------------------------------------------------
    prices = load("content/config/store.json")["championPrices"]
    row(
        "16 商店目錄",
        hid in prices,
        f"{prices[hid]} 水晶" if hid in prices else "不在 championPrices → 喜愛/解鎖 API 會 404",
    )
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--all-starter", action="store_true", help="audit the whole first open roster")
    args = ap.parse_args()

    ids = starter_roster() if args.all_starter else args.ids
    if not ids:
        ap.error("give at least one champion id, or --all-starter")

    failed = False
    for hid in ids:
        rows = audit(hid)
        bad = [r for r in rows if not r[1]]
        failed = failed or bool(bad)
        print(f"\n=== {hid} — {len(rows) - len(bad)}/{len(rows)} PASS ===")
        for label, ok, detail in rows:
            print(f"  {'PASS' if ok else 'FAIL'}  {label:<28} {detail}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
