#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 `tierize.py` 套到**直接編的那 330 份** ability JSON 上，並鏡射進英雄卡。

⭐ 為什麼要兩個入口（這一支 + `common.py::build()`）：
   `content/abilities/` 的 420 份文件有**兩個擁有者**，而它們的寫入路徑不一樣：

     | 誰 | 幾份 | 怎麼改 |
     |---|---:|---|
     | `tools/skill-remake/heroes/*.py` 的產生器 | **90** | 改產生器，重跑 `batch1.py` |
     | 直接編的 JSON | **330** | 這一支 |

   ⛔ 直接改那 90 份的 JSON 會在下一次 `skills:sync` **靜默消失**（GH#319），
      而 `skillRemakeJsonFresh.test.ts` 會先紅。所以這一支**跳過**它們 ——
      它們由 `build()` 在重生成的當下套用**同一個** `tierize()`。

用法：
    python3 tools/skill-remake/apply_tiers.py            # 套用並寫檔
    python3 tools/skill-remake/apply_tiers.py --check    # 唯讀；有東西沒收就非零離開
    python3 tools/skill-remake/apply_tiers.py --report   # 印出每一支被改了什麼
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tierize import Grids, tierize  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AB = os.path.join(ROOT, "content", "abilities")
CH = os.path.join(ROOT, "content", "champions")

#: 產生器擁有的英雄 id。⚠️ 這一份是**推導**的（跟著 `batch1.py` 的 `HERO` 走），
#: ⛔ 不是抄一份名單 —— 抄的那一份會在加/減一位英雄時安靜地錯掉。
def generator_owned():
    import batch1  # noqa: F401  —— import 的副作用就是把 heroes/ 掃進 HERO

    return set(batch1.HERO.values())


#: 鏡射時要跟著動的頂層欄位（英雄卡內嵌版是同一份資料的第二個住處）。
MIRRORED = (
    "castType",
    "targetsEnemies",
    "description",
    "cooldown",
    "cooldownTier",
    "manaCost",
    # ⭐ 2026-08-21 —— 五軸的最後一軸。⚠️ 少了這一列，英雄卡內嵌版會停在
    #    「有 manaCost 沒有 manaCostTier」，於是**同一支技能**在 standalone 與
    #    內嵌兩條註冊路徑上算出兩個不同的耗魔，⛔ 而且沒有任何東西會紅。
    "manaCostTier",
    # ⭐ 2026-08-21 —— `radius` 在此之前**不在這張表上**，而 `radiusTier` 在。
    #    ⚠️ 那個組合的後果：級距把 standalone 的 radius 從 4.58 收成 4.5，
    #    英雄卡內嵌版卻還是 4.58 ⇒ `abilityMirror.test.ts` 判「兩份副本互相矛盾」
    #    （2026-08-21 實測 30 筆）。⛔ 級別與它的原始值必須一起鏡射。
    "radius",
    "range",
    "rangeTier",
    "radiusTier",
    "template",
    "effects",
)


def _insert_after(doc, key, after, value):
    """把 `key` 插在 `after` 後面（純可讀性；Zod 不在意鍵序）。"""
    if key in doc:
        doc[key] = value
        return
    out = {}
    for k, v in doc.items():
        out[k] = v
        if k == after:
            out[key] = value
    if key not in out:
        out[key] = value
    doc.clear()
    doc.update(out)


def run(write, report):
    grids = Grids()
    gen = generator_owned()
    changed, logs = [], {}
    for name in sorted(os.listdir(AB)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        cid = name[:-5].rpartition(".")[0]
        if cid in gen:
            continue  # ⛔ 產生器的，見檔頭
        path = os.path.join(AB, name)
        with open(path, encoding="utf-8") as f:
            before = f.read()
        doc = json.loads(before)
        log = []
        tierize(doc, grids, log)
        if "cooldownTier" in doc:
            t = doc.pop("cooldownTier")
            _insert_after(doc, "cooldownTier", "cooldown", t)
        if "manaCostTier" in doc:
            t = doc.pop("manaCostTier")
            _insert_after(doc, "manaCostTier", "manaCost", t)
        after = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
        if after != before:
            changed.append(name)
            logs[name] = log
            if write:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(after)
    mirrored = _mirror(write)
    if report:
        for name in changed:
            print(f"\n{name}")
            for row in logs[name]:
                print("   ", row)
    print(f"收進級距：{len(changed)} / {len(os.listdir(AB)) - 1} 份直接編的技能文件"
          f"（產生器擁有的 {len(gen)} 位英雄由 batch1.py 套用同一個 tierize）")
    print(f"英雄卡內嵌鏡射：{mirrored} 份")
    return changed, mirrored


def _load_abilities():
    out = {}
    for name in sorted(os.listdir(AB)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        with open(os.path.join(AB, name), encoding="utf-8") as f:
            d = json.load(f)
        out[d["id"]] = d
    return out


def _mirror(write=True):
    """standalone → embedded。⭐ 方向是**單向**的（記憶 ggd-mirror-authority-model：
    owner 選了 STRICT model）。⛔ 不要反過來 —— 內嵌版沒有 `schema`，反向會把它洗掉。"""
    abilities = _load_abilities()
    n = 0
    for name in sorted(os.listdir(CH)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        path = os.path.join(CH, name)
        with open(path, encoding="utf-8") as f:
            before = f.read()
        ch = json.loads(before)
        for slot, emb in (ch.get("abilities") or {}).items():
            if not isinstance(emb, dict):
                continue
            src = abilities.get(emb.get("id"))
            if src is None:
                continue
            for k in MIRRORED:
                if k in src:
                    emb[k] = json.loads(json.dumps(src[k]))
                elif k in emb:
                    del emb[k]
        after = json.dumps(ch, ensure_ascii=False, indent=2) + "\n"
        if after != before:
            n += 1
            if write:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(after)
    return n


def main():
    check = "--check" in sys.argv
    changed, mirrored = run(write=not check, report="--report" in sys.argv)
    if check and (changed or mirrored):
        print(
            "⛔ 這幾支還沒收進五級距（或原始值與級別不一致 / 英雄卡內嵌版沒跟著動）：\n  "
            + "\n  ".join(changed[:20])
            + ("\n  …" if len(changed) > 20 else "")
            + f"\n  英雄卡待鏡射 {mirrored} 份"
            + "\n跑 `python3 tools/skill-remake/apply_tiers.py` 然後 `git add content/`。",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
