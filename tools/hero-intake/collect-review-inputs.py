#!/usr/bin/env python3
"""🧾 檢核頁的三份輸入 —— ⭐ 全部**從 repo 量出來**，⛔ 不是手抄的清單。

owner 2026-09-11：「缺的兩項：38 名跑進體素替身（GLB 不在版控，#1181）、
60 名沒有角色對白（b2 37／community 16／lol 7，對應 #1170）。
另有 36 名共用 18 顆模型（非專屬），包含 14 對變身態共用是正常的。你要一起處理」

輸出（到 --work）：
  · `voxel_now.json`   —— modelKey 的 GLB **不在 git** 的英雄（＝玩家看到體素替身的那些）
  · `quotes60.json`    —— `quotes.json.unsourced` ＋ 技能名／卡面上已有的「台詞」當寫作素材
  · `shared_pairs.json`—— 共用同一顆 modelKey 的英雄，並標出**是不是同一角色**

```sh
python3 tools/hero-intake/collect-review-inputs.py --work /tmp/review
```
"""
import argparse, collections, json, pathlib, re, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
C = ROOT / "content"

REASON = {
    "b2Identity": "交接資料只給**身分**（作品／官方角色頁），⛔ 沒有台詞",
    "ggdPlaceholderMoves": "技能名是 **GGD 自己取的**佔位名，⛔ 引用不到原作台詞",
    "descriptiveMoveName": "技能名是**描述性**的，⛔ 不是原作招式名",
    "lolNoVoiceLines": "LoL 這幾名**沒有**可引用的角色台詞",
    "formOfUnsourced": "它是另一支沒有台詞的英雄的**變身態**",
}


def jload(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))


def champions():
    return {f.stem: jload(f) for f in sorted((C / "champions").glob("*.json")) if not f.name.startswith("_")}


def models():
    out = {}
    for f in (C / "models").glob("*.json"):
        if f.name.startswith("_"):
            continue
        d = jload(f)
        if d.get("id"):
            out[d["id"]] = d
    return out


def tracked_models():
    """⭐ 出貨的是 **git** —— 部署走 `git fetch + checkout`，⛔ 不是這台機器的工作樹。"""
    out = subprocess.run(["git", "ls-files", "content/assets/models"], cwd=ROOT, capture_output=True, text=True).stdout
    return {p[len("content/"):] for p in out.split("\n") if p}


def base_name(n):
    return (n or "").split(" - ")[-1].replace("（變身）", "").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    a = ap.parse_args()
    work = pathlib.Path(a.work)
    work.mkdir(parents=True, exist_ok=True)

    champs, mdl, tracked = champions(), models(), tracked_models()
    off = jload(C / "assets-offdisk.json")["entries"]

    # ① 體素替身：modelKey 解析得到 glbPath，⛔ 而那個檔不在 git
    voxel = []
    share = collections.defaultdict(list)
    for hid, c in champs.items():
        k = c.get("modelKey")
        if k:
            share[k].append(hid)
        g = (mdl.get(k) or {}).get("glbPath")
        if not g or g in tracked:
            continue
        voxel.append({"id": hid, "name": c.get("name"), "modelKey": k, "glb": g,
                      "bytes": off.get(g, {}).get("bytes", 0), "sha256": off.get(g, {}).get("sha256", ""),
                      "declaredOffDisk": g in off, "onDisk": (C / g).exists()})
    (work / "voxel_now.json").write_text(json.dumps(voxel, ensure_ascii=False, indent=1), encoding="utf-8")

    # ② 沒有角色對白：⛔ 只給名單與素材（owner 2026-09-10「請你給我名單就好 不要自己產」）
    q = jload(C / "assets/audio/voices/quotes/quotes.json")
    rows = []
    for u in q["unsourced"]:
        c = champs.get(u["id"], {})
        ab = c.get("abilities") or {}
        skills, lines = [], []
        for s in list(ab.values() if isinstance(ab, dict) else ab) + [c.get("exAbility"), c.get("passiveAbility")]:
            if not isinstance(s, dict):
                continue
            if s.get("name"):
                skills.append(s["name"])
            lines += re.findall(r"「([^」]{2,40})」", s.get("description") or "")
        rows.append({"id": u["id"], "name": u["name"],
                     "group": "b2" if u["id"].startswith("b2-") else ("community" if u["id"].startswith("community-review") else "lol"),
                     "reasonKey": u["reasonKey"], "reason": REASON.get(u["reasonKey"], u["reasonKey"]),
                     "role": c.get("role") or "", "archetype": c.get("archetype") or "",
                     "desc": (c.get("description") or "")[:140],
                     "skills": skills[:6], "lines": list(dict.fromkeys(lines))[:6]})
    (work / "quotes60.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    # ③ 共用模型：⭐ 同一角色（本體↔變身）是正常的，⚠️ 不同角色共用才要人看一眼
    pairs = []
    for k, v in sorted({k: v for k, v in share.items() if len(v) > 1}.items()):
        ns = [champs[i].get("name") for i in v]
        pairs.append({"modelKey": k, "ids": v, "names": ns,
                      "same": len({base_name(n) for n in ns}) == 1,
                      "glb": (mdl.get(k) or {}).get("glbPath")})
    (work / "shared_pairs.json").write_text(json.dumps(pairs, ensure_ascii=False, indent=1), encoding="utf-8")

    same = sum(1 for p in pairs if p["same"])
    print(f"[collect] 體素替身 {len(voxel)} 名 · 沒有對白 {len(rows)} 名"
          f"（{collections.Counter(r['group'] for r in rows)}）· 共用 {len(pairs)} 顆（同一角色 {same}／不同角色 {len(pairs)-same}）")
    print(f"[collect] → {work}")


if __name__ == "__main__":
    main()
