#!/usr/bin/env python3
"""icon-gen planner — decides WHAT gets an icon, and writes the plan down.

    python3 tools/icon-gen/src/plan.py            # print the plan
    python3 tools/icon-gen/src/plan.py --write    # ... and save it for the UI

Reads the LIVE content tree every run. There is no snapshot and no hard-coded
id list in this file — every classification below is a predicate re-evaluated
against the docs on disk, so a doc that #82 renames or #78 rewrites lands in
the right bucket automatically instead of silently keeping a stale verdict.

Four states:

  have      an icon is already on disk (the map author's own art, extracted).
  drop      deliberately NEVER generated. See the rules below; each names the
            standing decision that justifies it.
  blocked   MUST NOT be generated yet, for a reason a human has to clear
            (today: third-party IP). Not a scope cut — a held gate.
  generate  the batch. Split into tier 1 (reachable on a live surface today)
            and tier 2 (real content, but nothing currently offers it), so a
            first spend can be small and still visibly improve the game.

────────────────────────────────────────────────────────────────────────────
THE VETO COMES FIRST
────────────────────────────────────────────────────────────────────────────
Before any drop rule runs, every id named by a LIVE SURFACE is collected and
made undroppable. The surfaces are scraped rather than hard-coded, and the scrape
is deliberately OVER-INCLUSIVE (every id-shaped token in those files, not just
the ones inside the list that matters) — a veto that is too broad costs a few
dollars, a veto that is too narrow ships a live shop row with no picture.

NOTE the operator curation whitelist (`data/curation/whitelist.json`) is read as
a VETO ONLY, never as a filter. It ships default-empty and is UNION-only — "a
SUGGESTION, not a floor" — so an id being absent from it means nothing at all.
Using it as a drop axis would delete art for everything the moment an operator
enables one champion.
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import sys
from collections import Counter, OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from prompt import TEMPLATE_VERSION  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CONTENT = os.path.join(ROOT, "content")
PLAN_PATH = os.path.join(CONTENT, "config", "icon-plan.json")
ICON_MAP = os.path.join(
    ROOT, "tools", "w3x-import", "out", "GoDieEX22s", "ICON_MAP.json"
)

FAMILIES = ("champions", "abilities", "items")

# Files scraped for the live-surface veto. Missing files are tolerated (the
# tool must run on a checkout that has not built anything yet) but REPORTED,
# because a silently-absent surface file is how a veto quietly narrows.
LIVE_SURFACE_FILES = [
    "apps/platform/internal/curation/starter.go",
    "content/loot-tables/legendary-weapons.json",
    "content/loot-tables/quest-rewards.json",
    "content/loot-tables/round-reward.json",
    "content/config/store.json",
    "content/config/arena-rules.json",
    "packages/shared/src/sim/content/skeleton.ts",
    "data/curation/whitelist.json",
]

# Doc ids as they appear in source: `godie-e001`, `godie-e001.ex`, `ember-rod`.
ID_TOKEN = re.compile(r'"([a-z0-9][a-z0-9-]{2,}(?:\.[a-z]{1,2})?)"')


# ------------------------------------------------------------------ load ----

def load_family(family: str) -> "OrderedDict[str, dict]":
    docs: "OrderedDict[str, dict]" = OrderedDict()
    for path in sorted(glob.glob(os.path.join(CONTENT, family, "*.json"))):
        if os.path.basename(path) == "_index.json":
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                doc = json.load(fh)
        except Exception as exc:  # a half-written doc from a concurrent editor
            print(f"icon-gen: skipping unreadable {path}: {exc}", file=sys.stderr)
            continue
        if isinstance(doc, dict) and isinstance(doc.get("id"), str):
            docs[doc["id"]] = doc
    return docs


def live_surface_ids() -> tuple[set[str], list[str]]:
    """Every id-shaped token in the live-surface files (+ the missing files)."""
    ids: set[str] = set()
    missing: list[str] = []
    for rel in LIVE_SURFACE_FILES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            missing.append(rel)
            continue
        with open(path, encoding="utf-8", errors="replace") as fh:
            ids.update(ID_TOKEN.findall(fh.read()))
    return ids, missing


def icon_map() -> dict:
    try:
        with open(ICON_MAP, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


# ------------------------------------------------------------- predicates ---

def has_text(doc: dict, field: str) -> bool:
    return bool((doc.get(field) or "").strip())


def item_does_something(doc: dict) -> bool:
    """An item is 'effective' if it can change the sim at all."""
    return bool(doc.get("modifiers") or doc.get("passive") or doc.get("hooks") or doc.get("onHit"))


def imported(doc_id: str) -> bool:
    """w3x-imported ids carry the `godie-` prefix; anything else is authored
    by hand and its empty fields are a WIP, not a dead map entry."""
    return doc_id.startswith("godie-")


def champion_of(ability_id: str) -> str:
    return ability_id.rsplit(".", 1)[0]


# ------------------------------------------------------------------ rules ---
#
# Each rule: (key, label, note). `note` is shown in the codex, so it must
# stand on its own — it is the answer to "why does this have no picture?".

DROP_RULES = {
    "recipe-book": (
        "合成書（無合成系統）",
        "名稱含「製作書」。使用者的裁定是「理論上競技場上的所有道具跟武器都不需要合成」——"
        "競技場沒有、也不會有合成步驟，sim 從未實作過 combine 邏輯，任務 #70 的關卡讓這些道具"
        "在四個取得面向上都永遠不可達。給合成書畫圖示，等於在暗示一個不存在的合成介面。",
    ),
    "name-equals-id": (
        "名稱未解析（name === id）",
        "w3x 字串表沒有解出顯示名稱，文件的 name 直接落回 ID。沒有名字就沒有可畫的主體——"
        "提示詞只會是一串代號。先修好名稱，這些才值得產圖。",
    ),
    "inert-and-undescribed": (
        "沒有說明也沒有任何效果",
        "description 是空的，而且沒有 modifiers / passive / hooks——既沒有東西可以生成提示詞，"
        "本身也不能對戰鬥產生任何影響。",
    ),
    "empty-imported-champion": (
        "匯入的空白英雄",
        "從 w3x 匯入但 description 完全是空的。使用者對匯入條目的規則：空說明就是不打算使用的條目。",
    ),
    "placeholder-ability": (
        "佔位技能（name 是 none）",
        "名稱就是字面上的 \"none\"，說明也是空的。這是原圖的佔位格，沒有任何可以下筆的內容。",
    ),
    "kit-of-dropped-champion": (
        "所屬英雄已被排除",
        "技能跟著英雄走：英雄本身被排除，牠的 Q/W/E/R/EX 也不會在任何畫面出現。",
    ),
}

BLOCK_RULES = {
    "third-party-ip": (
        "第三方版權角色（暫停產圖）",
        "英雄名稱或說明帶有「(出自:…)」，直接點名了一個真實作品——羅列出來的有妙蛙花、哆啦A夢、"
        "小熊維尼、貞子、異形。要一個圖像模型畫這些，得到的不是拒絕就是一張仿冒品，"
        "正好重現這個任務要消除的版權風險。這不是刪除，是等一個人來裁定：要嘛改成原創角色，要嘛"
        "維持文字後備。",
    ),
}


def classify(docs: dict[str, dict], family: str, veto: set[str],
             dropped_champions: set[str]) -> dict[str, tuple[str, str]]:
    """-> id -> (state, reason-key). Vetoed ids can only ever be `generate`."""
    out: dict[str, tuple[str, str]] = {}
    for doc_id, doc in docs.items():
        if doc.get("icon"):
            out[doc_id] = ("have", "")
            continue

        protected = doc_id in veto

        # ---- drop rules (a vetoed id is never dropped) ----
        reason = None
        if family == "items":
            if "製作書" in (doc.get("name") or ""):
                reason = "recipe-book"
            elif doc.get("name") == doc_id:
                reason = "name-equals-id"
            elif not has_text(doc, "description") and not item_does_something(doc):
                reason = "inert-and-undescribed"
        elif family == "champions":
            if doc.get("name") == doc_id:
                reason = "name-equals-id"
            elif imported(doc_id) and not has_text(doc, "description"):
                reason = "empty-imported-champion"
        elif family == "abilities":
            if champion_of(doc_id) in dropped_champions:
                reason = "kit-of-dropped-champion"
            elif (doc.get("name") or "").strip().lower() == "none" and not has_text(doc, "description"):
                reason = "placeholder-ability"
            elif doc.get("name") == doc_id:
                reason = "name-equals-id"

        if reason and not protected:
            out[doc_id] = ("drop", reason)
            continue

        # ---- block rules ----
        if family == "champions":
            blob = f"{doc.get('name') or ''}\n{doc.get('description') or ''}"
            if "出自" in blob:
                out[doc_id] = ("blocked", "third-party-ip")
                continue

        out[doc_id] = ("generate", "")
    return out


# ------------------------------------------------------------------ build ---

def content_digest(all_docs: dict[str, dict[str, dict]]) -> str:
    """Stable fingerprint of everything the plan depends on. Recomputing the
    plan on unchanged content therefore rewrites a BYTE-IDENTICAL file — no
    spurious churn while other sessions are editing the same tree."""
    h = hashlib.sha256()
    for family in FAMILIES:
        for doc_id, doc in sorted(all_docs[family].items()):
            h.update(doc_id.encode())
            h.update((doc.get("name") or "").encode())
            h.update((doc.get("description") or "").encode())
            h.update(b"1" if doc.get("icon") else b"0")
    return h.hexdigest()[:16]


def build_plan() -> dict:
    all_docs = {family: load_family(family) for family in FAMILIES}
    veto, missing_surfaces = live_surface_ids()
    imap = icon_map()

    # champions first: their verdict feeds the ability kit rule
    champ_states = classify(all_docs["champions"], "champions", veto, set())
    dropped_champions = {i for i, (s, _) in champ_states.items() if s == "drop"}

    states = {
        "champions": champ_states,
        "abilities": classify(all_docs["abilities"], "abilities", veto, dropped_champions),
        "items": classify(all_docs["items"], "items", veto, dropped_champions),
    }

    reasons: dict[str, dict] = {}
    blocked: dict[str, dict] = {}
    generate = {"tier1": [], "tier2": []}
    counts: dict[str, dict] = {}

    for family in FAMILIES:
        c = Counter(s for s, _ in states[family].values())
        counts[family] = {
            "docs": len(all_docs[family]),
            "have": c.get("have", 0),
            "drop": c.get("drop", 0),
            "blocked": c.get("blocked", 0),
            "generate": c.get("generate", 0),
        }
        for doc_id, (state, key) in sorted(states[family].items()):
            if state == "drop":
                bucket = reasons.setdefault(
                    key, {"label": DROP_RULES[key][0], "note": DROP_RULES[key][1], "ids": []}
                )
                bucket["ids"].append(doc_id)
            elif state == "blocked":
                bucket = blocked.setdefault(
                    key, {"label": BLOCK_RULES[key][0], "note": BLOCK_RULES[key][1], "ids": []}
                )
                bucket["ids"].append(doc_id)
            elif state == "generate":
                tier = "tier1" if doc_id in veto else "tier2"
                generate[tier].append({"id": doc_id, "family": family})

    total = {k: sum(counts[f][k] for f in FAMILIES)
             for k in ("docs", "have", "drop", "blocked", "generate")}
    total["tier1"] = len(generate["tier1"])
    total["tier2"] = len(generate["tier2"])

    # provenance of the missing art, straight from the importer's own table
    prov = Counter()
    for family in FAMILIES:
        for doc_id, (state, _) in states[family].items():
            if state == "have":
                continue
            row = imap.get(doc_id)
            prov[row["resolution"] if row else "not-imported"] += 1

    return {
        "id": "icon-plan",
        "schema": "config.icon-plan@1",
        "templateVersion": TEMPLATE_VERSION,
        "contentDigest": content_digest(all_docs),
        "counts": {"total": total, "byFamily": counts},
        "provenance": dict(sorted(prov.items())),
        "dropped": reasons,
        "blocked": blocked,
        "generate": generate,
        "vetoed": sorted(
            doc_id
            for family in FAMILIES
            for doc_id, (state, _) in states[family].items()
            if state == "generate" and doc_id in veto
        ),
        "missingSurfaceFiles": missing_surfaces,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="plan which docs get a generated icon")
    ap.add_argument("--write", action="store_true", help=f"save to {PLAN_PATH}")
    args = ap.parse_args()

    plan = build_plan()
    t = plan["counts"]["total"]
    print(f"icon-gen plan  (content digest {plan['contentDigest']})")
    print(f"  {'family':<12} {'docs':>6} {'have':>6} {'drop':>6} {'blocked':>8} {'generate':>9}")
    for family in FAMILIES:
        c = plan["counts"]["byFamily"][family]
        print(f"  {family:<12} {c['docs']:>6} {c['have']:>6} {c['drop']:>6} "
              f"{c['blocked']:>8} {c['generate']:>9}")
    print(f"  {'TOTAL':<12} {t['docs']:>6} {t['have']:>6} {t['drop']:>6} "
          f"{t['blocked']:>8} {t['generate']:>9}")
    print(f"\n  generate = tier1 {t['tier1']} (live surface today) + tier2 {t['tier2']}")
    print("\n  dropped, by rule:")
    for key, bucket in sorted(plan["dropped"].items(), key=lambda kv: -len(kv[1]["ids"])):
        print(f"    {key:<26} {len(bucket['ids']):>4}")
    print("  blocked, by rule:")
    for key, bucket in plan["blocked"].items():
        print(f"    {key:<26} {len(bucket['ids']):>4}")
    print("\n  why the art is missing (importer's own resolution):")
    for key, n in plan["provenance"].items():
        print(f"    {key:<26} {n:>4}")
    if plan["missingSurfaceFiles"]:
        print("\n  ⚠ live-surface files NOT found (veto may be too narrow):")
        for rel in plan["missingSurfaceFiles"]:
            print(f"    {rel}")

    if args.write:
        os.makedirs(os.path.dirname(PLAN_PATH), exist_ok=True)
        with open(PLAN_PATH, "w", encoding="utf-8") as fh:
            json.dump(plan, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        print(f"\n  wrote {os.path.relpath(PLAN_PATH, ROOT)}")


if __name__ == "__main__":
    main()
