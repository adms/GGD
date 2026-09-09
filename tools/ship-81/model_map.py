#!/usr/bin/env python3
"""⭐ 從 owner 維護的 `全角色模型盤點.md` 推導每一名英雄的 `modelKey`。

⛔⛔ **這一支不存任何對應表。** owner 2026-09-10 逐字：
「**全角色模型盤點.md 會持續更新模型預設對應表，請你也配合改變上架設定**」
⇒ ⭐ 抄一份進程式碼就是第〇·四守則的第二個住處 —— 他改了而它不動。
⇒ ⭐ 這一支**每次讀那份表**，⛔ 而它自己只有 join 的規則。

── ⭐ 四種狀態，⛔ 而它們的處置完全不同（2026-09-10 實測 81 名）────────
  ① ⭐ **真模型**（41 名）：`預設模型` 那一欄對得到素材庫 `catalog.json` 的 `title`
  ② ⚠️ **表明用骨架**（13 名）：來源欄寫 `GGD 原版｜《GGD 模型預設》`
     ⇒ ⛔ 那**不是**「查不到」，是表**明說**這一名今天就是穿骨架
  ③ ⛔ **待取得核准模型**（27 名）：`預設模型` 欄逐字是 `**待取得核准模型**`
  ④ ⛔ **待轉換**：`預設模型` 欄逐字是 `**待轉換**`

⚠️⚠️ ⭐ ②③④ 都會拿到骨架，⛔ **而它們必須被分開記錄** ——
② 是**設計決定**，③④ 是**還沒做完**。⛔ 混在一起的話，
「27 名在等模型」這件事會消失在「40 名穿骨架」這個數字裡。

── ⚠️ 表會比現實舊 ────────────────────────────────────────────────
2026-09-10 實測：表寫 李星／沃維克／犽宿「待取得核准模型」，
⭐ 而它們當天已經入庫（catalog 91 → 94）。
⇒ ⭐ 所以 ③④ 會**再查一次 catalog 的角色名** —— 對得到就升級成 ①，
⛔ 而**在報告裡指名**「表已經對這一名過期了」。
"""
import json
import re
from pathlib import Path

GGD_NATIVE = re.compile(r"GGD\s*原版")
PENDING_MODEL = re.compile(r"待取得核准模型")
PENDING_CONVERT = re.compile(r"待轉換")
# ⭐ 骨架的兩顆（`main.tsx` fail-open 時註冊的那兩隻）
SKELETON = {"fighter": "champ.thorne", "mage": "champ.sela"}

SECTIONS = ("## 第一批 37 名", "## 第二批 37 名", "## LOL 追加 7 名")


def parse_inventory(path: Path) -> list[dict]:
    """⭐ 逐列讀表。⛔ 不容忍格式漂掉：解析不到就少一列，而那會被覆蓋率斷言抓到。"""
    lines = path.read_text(encoding="utf-8").split("\n")
    out: list[dict] = []
    for hdr in SECTIONS:
        try:
            i = next(j for j, l in enumerate(lines) if l.startswith(hdr))
        except StopIteration:
            raise ValueError(f"⛔ 盤點表少了一節：{hdr} —— 表的結構變了，這支要跟著改")
        for line in lines[i + 1 :]:
            if line.startswith("## "):
                break
            if not line.startswith("|") or line.startswith("|---") or "角色出處" in line:
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 4:
                continue
            m = re.search(r"`([^`]+)`", cells[1])
            if not m:
                continue
            out.append({
                "section": hdr[3:],
                "heroId": m.group(1),
                "heroName": re.sub(r"<br>.*", "", cells[1]).strip(),
                "defaultModel": cells[2],
                "modelSource": cells[3],
            })
    return out


def catalog_titles(catalog: Path) -> dict[str, dict]:
    doc = json.loads(catalog.read_text(encoding="utf-8"))
    return {(e.get("title") or "").strip(): e for e in doc["entries"] if e.get("title")}


def resolve(row: dict, titles: dict[str, dict], role: str) -> dict:
    """⭐ 一列 → `{modelKey, state, why}`。⛔ 每一種狀態都說得出**為什麼**。"""
    name = row["defaultModel"].strip().strip("*")
    entry = titles.get(name)
    if entry:
        return {"modelKey": _model_key(entry), "state": "real", "why": f"盤點表指定「{name}」，素材庫對得到"}
    # ⭐ ③④：表說還沒好 —— ⛔ 但表可能比現實舊 ⇒ 用**角色名**再查一次
    if PENDING_MODEL.search(row["defaultModel"]) or PENDING_CONVERT.search(row["defaultModel"]):
        late = titles.get(row["heroName"].strip())
        if late:
            return {
                "modelKey": _model_key(late),
                "state": "real-late",
                "why": f"⚠️ 盤點表寫「{row['defaultModel'].strip('*')}」，⭐ 而素材庫已經有「{row['heroName']}」了 ⇒ 表對這一名過期",
            }
        state = "pending-convert" if PENDING_CONVERT.search(row["defaultModel"]) else "pending-approval"
        return {"modelKey": SKELETON.get(role, SKELETON["fighter"]), "state": state,
                "why": f"⛔ 盤點表：{row['defaultModel'].strip('*')} —— 暫用骨架，⛔ 不是設計決定"}
    if GGD_NATIVE.search(row["modelSource"]):
        return {"modelKey": SKELETON.get(role, SKELETON["fighter"]), "state": "skeleton-by-design",
                "why": f"⭐ 盤點表明說用 GGD 原版：「{name}」"}
    return {"modelKey": SKELETON.get(role, SKELETON["fighter"]), "state": "unmapped",
            "why": f"⛔ 盤點表寫「{name}」而素材庫對不到，來源欄也不是 GGD 原版 —— **要問**"}


def _model_key(entry: dict) -> str:
    src = (entry.get("provenance") or {}).get("sources") or [{}]
    key = src[0].get("modelKey")
    if not key:
        raise ValueError(f"⛔ catalog 的 {entry.get('id')} 沒有 modelKey —— 它入庫時就缺了")
    return key


# ⭐⭐ 盤點表的**阻塞理由**也會過期 —— 而它過期時沒有任何東西會紅。
#
# ⛔⛔ 量到的（2026-09-10，GH#1165）：盤點表把三名英雄聯盟角色標成
# 「待取得核准模型」，理由逐字是
#
#     「單段動作通道 196 超過英雄模型上限 **160**。」（李星／沃維克／犽宿）
#
# ⭐ 而 GH#1164 已經把那個上限改成**後台設定**（warn 300 / limit 500）
# ⇒ 三個理由**全部不再成立**，⛔ 而表上一個字都沒變。
#
# ⚠️ ⭐ 這是第三守則的形狀：**一句在它到期之後還活著的散文** ——
# 而它比一般的過期註解更貴，因為 owner 讀那張表來決定**下一步買什麼模型**。
#
# ⇒ ⭐ 判準不是「記得回頭看那張表」（判準 0/4 全破），
#   是**把理由裡的數字抓出來，跟出貨設定比一次**。
STALE_LIMIT_RE = re.compile(
    r"通道\s*(?P<value>\d+)\s*超過[^0-9]*?(?P<limit>\d+)")


def stale_blockers(path: Path, shipped_limit: int) -> list[dict]:
    """
    ⭐ 回傳盤點表裡「理由引用的上限已經被改掉」的每一列。

    ⛔ 它**不改表**（那是 owner 的檔）——它只說得出「這一列該重新評估了」。
    ⚠️ ⭐ 而它刻意只認**引用得到數字**的理由：一句「模型品質不夠」沒有數字，
    ⛔ 這支程式無權判斷它過期沒有。
    """
    out = []
    for raw in path.read_text(encoding="utf-8").split("\n"):
        m = STALE_LIMIT_RE.search(raw)
        if not m:
            continue
        value, cited = int(m.group("value")), int(m.group("limit"))
        if cited >= shipped_limit or value > shipped_limit:
            continue          # ⭐ 理由仍然成立（或今天仍然超標）⇒ ⛔ 不要喊
        cells = [c.strip() for c in raw.strip("|").split("|")]
        out.append({
            "row": cells[0] if cells else raw.strip()[:60],
            "value": value,
            "citedLimit": cited,
            "shippedLimit": shipped_limit,
            "why": f"⭐ 理由引用上限 {cited}，⛔ 而出貨值已經是 {shipped_limit} "
                   f"⇒ 通道 {value} **今天過得了** —— 這一列該重新評估",
        })
    return out
