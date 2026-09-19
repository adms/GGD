"""逐顆量：**角色的頭**在「客戶端會正規化的那個 bbox」裡佔幾成。

為什麼是這個問法（⛔ 不是「身體那一片是哪一片」）：
  · `apps/client/src/render/views/modelSizing.ts` 的 `normalizedModelScale()`
    把**整份可見 bbox** 正規化到 TARGET_HEIGHT = 1.8u。
  · ⇒ 只要模型帶著「高過頭頂」的特效幾何而沒有列進 `hiddenPrimitives`，
    被正規化的就是**特效的高度**，角色按 head/full 的比例縮小。
  · 角色頭頂在哪，⛔ 不用猜 primitive —— WC3 模型自己宣告：`Overhead` 掛點
    （慣例：頭頂正上方）。`content/models/ou99.467258.json` 的 heroBodyNote
    就是用它算的。

⭐ 兩個口徑都輸出（掛點 ＋ 面數最多那一片的幾何），不一致的逐顆標出來。
Pure measurement; no side effects.
"""
import json, os, struct, sys, glob

TARGET_HEIGHT = 1.8
HEAD_KEYS = ("overhead",)

def read_glb(p):
    b = open(p, 'rb').read()
    if len(b) < 12 or struct.unpack_from('<I', b, 0)[0] != 0x46546C67: return None
    off, j = 12, None
    while off + 8 <= len(b):
        cl, ct = struct.unpack_from('<II', b, off)
        if ct == 0x4E4F534A: j = json.loads(b[off+8:off+8+cl].decode('utf-8'))
        off += 8 + cl
    return j

def world_y(nodes, parent, i):
    y, seen = 0.0, set()
    while i is not None and i not in seen:
        seen.add(i)
        t = nodes[i].get('translation')
        if t: y += t[1]
        m = nodes[i].get('matrix')
        if m: y += m[13]
        i = parent.get(i)
    return y

def measure(path, hidden):
    g = read_glb(path)
    if not g: return {"error": "not a glb"}
    acc, mats = g.get('accessors', []), g.get('materials', [])
    rows = []
    for mesh in g.get('meshes', []):
        for p in mesh.get('primitives', []):
            pa = p.get('attributes', {}).get('POSITION')
            if pa is None or pa >= len(acc): continue
            a = acc[pa]
            if not a.get('min') or not a.get('max'): continue
            idx = p.get('indices')
            rows.append({"tris": (acc[idx]['count']//3) if (idx is not None and idx < len(acc)) else a['count']//3,
                         "min": a['min'], "max": a['max']})
    vis = [r for i, r in enumerate(rows) if i not in hidden]
    if not vis: return {"error": "no visible prims"}
    fmin = min(r['min'][1] for r in vis); fmax = max(r['max'][1] for r in vis)
    full_h = fmax - fmin
    nodes = g.get('nodes', [])
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []): parent[c] = i
    head = None
    for i, n in enumerate(nodes):
        nm = (n.get('name') or '').lower()
        if any(k in nm for k in HEAD_KEYS):
            y = world_y(nodes, parent, i)
            head = y if head is None else max(head, y)
    dom = max(vis, key=lambda r: r['tris'])
    out = {"prims": len(rows), "visiblePrims": len(vis),
           "fullMinY": round(fmin, 3), "fullMaxY": round(fmax, 3), "fullH": round(full_h, 3),
           "domTris": dom['tris'], "domTopY": round(dom['max'][1], 3),
           "renderScale": round(TARGET_HEIGHT/full_h, 5) if full_h > 1e-9 else None}
    if head is not None and full_h > 1e-9:
        out.update({"overheadY": round(head, 3),
                    "headFrac": round((head - fmin)/full_h, 4),
                    "headOnScreenU": round((head - fmin)*TARGET_HEIGHT/full_h, 3)})
    if full_h > 1e-9:
        out["domFrac"] = round((dom['max'][1]-fmin)/full_h, 4)
        if "headFrac" in out:
            out["metricsDisagree"] = abs(out["domFrac"] - out["headFrac"]) > 0.15
    return out

root = sys.argv[1]
docs = {}
for f in glob.glob(os.path.join(root, 'content/models/*.json')):
    try: d = json.load(open(f))
    except Exception: continue
    if d.get('glbPath'): docs.setdefault(os.path.basename(d['glbPath']), []).append(d)

out = []
for gp in sorted(glob.glob(os.path.join(root, 'content/assets/models/ou99/*.glb'))):
    base = os.path.basename(gp)
    ds = docs.get(base, [])
    hidden = set()
    for d in ds: hidden |= set(d.get('hiddenPrimitives') or [])
    rec = {"glb": base, "docs": [d['id'] for d in ds],
           "heroBody": [d.get('heroBody') for d in ds],
           "hasHeroBodyNote": [bool(d.get('heroBodyNote')) for d in ds],
           "hiddenPrimitives": sorted(hidden)}
    rec.update(measure(gp, hidden))
    out.append(rec)

print(json.dumps({"target_height": TARGET_HEIGHT, "count": len(out),
                  "headDef": "world-Y of the 'Overhead' attach node (WC3 convention: just above the head)",
                  "consumer": "apps/client/src/render/views/modelSizing.ts normalizedModelScale()",
                  "models": out}, ensure_ascii=False, indent=1))
