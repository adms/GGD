#!/usr/bin/env python3
"""engine_vocab.py — python 端**唯一**的引擎詞彙來源（屬性 / 運算子 / 觸發事件）。

⛔ **這個 repo 的 python 產生器不可以再手抄一張枚舉表。** 這一支存在的理由是量到的：
2026-08-18 一次稽核發現四支產生器各自抄了一份清單，而 2026-08-17 引擎新增了
6 條 `Stat`、1 個 `ModOp`、14 個 hook 事件之後，四份抄本**全部過期**，
四份產物**全部在說謊**，而且沒有任何一個東西會紅：

| 抄本 | 產物 | 說了什麼謊 |
|---|---|---|
| `tools/economy/regen_descriptions.py::STAT_LABEL`（13 條） | 道具的「效能」文案 | 表外的 modifier 被**靜默刪掉**（道具給了、文案不講） |
| `tools/editor-contract/gen_contract_numbers.py::CAP_ROWS`（手挑 7 列） | Codex 合約的上限表 | 出貨的 13 條上限只印得出 5 條 |
| `tools/reference/gen_reference.py::STAT_LABEL`（15 條） | `docs/reference/items.md` | 表外的屬性印**裸 key**（`spellVamp +0.2`） |
| `tools/reference/gen_grail.py::HOOK_LABEL`（19 個） | `mechanics.md` / `grail-wishes.md` | 14 個新事件的中文欄印 `—` |

⭐ 形狀（CLAUDE.md 第〇·五守則 + 「閘不是判準」）：

1. **能推導的一律推導** —— 「有哪些」永遠從出貨的 TS / config 讀出來，
   ⛔ 不是從一張手打的清單。
2. **只有「叫什麼」是人取的**，而它住在**一份**資料檔裡：
   · 觸發事件 → `tools/skill-spec/curated.json` 的 `hookEvents`
     （已經被 `gen_spec.ts::reconcileLabels` 兩個方向對帳）
   · 屬性 → `packages/shared/src/sim/baseBonus.ts` 的 `STAT_LABEL_ZH`
     （`Readonly<Record<Stat, string>>` —— **TypeScript 逼它完整**，
     所以「引擎有一條屬性而沒有中文名」在型別層就不可能存在）
3. ⭐ **缺漏一定要吵** —— 每一支查詢缺漏時 `raise VocabError`，⛔ 不是回 `None`、
   不是印裸 key、不是靜默跳過。那三種正是上面四支安靜說謊的方式。

## 為什麼是「解析 TS」而不是「用 node 導出一份 JSON」

兩者都在任務裡被允許。選解析，理由只有一條：**導出的 JSON 是第二個住處，
而它會過期**。今天沒有人會在改 `Stat` 之後想到去重跑導出腳本 —— 那正是這一支
要修的病。直接讀 TS 的話，`Stat` 多一條的**同一秒**，這裡就看得到它；
`STAT_LABEL_ZH` 少一條的話 TypeScript 自己會紅，python 這邊也會 raise。
兩個方向都不需要有人記得跑什麼。

⚠️ 解析的是**枚舉與字面量表**，不是語意 —— 那兩種語法在 TS 裡是最穩定的一族，
而且解析失敗會 raise（⛔ 不會回一份空表讓下游印出一份空文件）。

守衛：`tools/engine-vocab/test_engine_vocab.py`。
"""
from __future__ import annotations

import functools
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

STAT_TYPES_TS = os.path.join(REPO, "packages", "shared", "src", "sim", "stats", "statTypes.ts")
MODIFIERS_TS = os.path.join(REPO, "packages", "shared", "src", "sim", "stats", "modifiers.ts")
BASE_BONUS_TS = os.path.join(REPO, "packages", "shared", "src", "sim", "baseBonus.ts")
CURATED_JSON = os.path.join(REPO, "tools", "skill-spec", "curated.json")
STAT_CAPS_JSON = os.path.join(REPO, "content", "config", "stat-caps.json")


class VocabError(RuntimeError):
    """詞彙對不起來 —— ⛔ 呼叫端不要吞掉它，它就是那道閘。"""


# ---------------------------------------------------------------------------
# TS 解析（只認枚舉、union 與字面量表這三種語法）
# ---------------------------------------------------------------------------

def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError as e:
        raise VocabError(f"讀不到 {os.path.relpath(path, REPO)}：{e}") from e


def _strip_comments(src: str) -> str:
    """拿掉 `/* … */` 與 `// …`，但**保留字串內容**。

    ⚠️ 非做不可：`modifiers.ts` 的註解裡逐字寫著 `"onLevelUp"`（一個**已經被刪掉**
    的事件），而註解裡也有 `"basic"` / `"ability"` 這些別的欄位的字面量 ——
    不剝註解的話，union 會解析出一堆根本不存在的成員。
    """
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c in ('"', "'", "`"):
            j = i + 1
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == c:
                    break
                j += 1
            out.append(src[i:j + 1])
            i = j + 1
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
        elif src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def _block(src: str, opener: str, path: str) -> str:
    """`opener` 之後那一對大括號之間的東西（深度計數，⛔ 不是貪婪比對）。"""
    i = src.find(opener)
    if i < 0:
        raise VocabError(f"{os.path.relpath(path, REPO)} 裡找不到 `{opener}` —— 它被改名了嗎？")
    start = src.index("{", i)
    depth, j = 0, start
    while j < len(src):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[start + 1:j]
        j += 1
    raise VocabError(f"{os.path.relpath(path, REPO)} 的 `{opener}` 大括號沒有收尾")


@functools.lru_cache(maxsize=None)
def stat_members() -> dict:
    """`Stat` 枚舉：成員名 → 字面值（`"MaxHealth"` → `"maxHealth"`），照宣告順序。"""
    body = _block(_strip_comments(_read(STAT_TYPES_TS)), "export enum Stat", STAT_TYPES_TS)
    members = dict(re.findall(r"(\w+)\s*=\s*\"([^\"]+)\"", body))
    if not members:
        raise VocabError("statTypes.ts 的 `Stat` 解析出 0 個成員 —— 解析器與程式碼分家了")
    return members


def stats() -> list:
    """出貨的每一條屬性（字面值），照 `Stat` 的宣告順序。"""
    return list(stat_members().values())


@functools.lru_cache(maxsize=None)
def mod_ops() -> tuple:
    """`ModOp` 枚舉的字面值（`flat` / `pctAdd` / … / `capRaisePct` / `percentOf`）。"""
    body = _block(_strip_comments(_read(MODIFIERS_TS)), "export enum ModOp", MODIFIERS_TS)
    ops = tuple(v for _, v in re.findall(r"(\w+)\s*=\s*\"([^\"]+)\"", body))
    if not ops:
        raise VocabError("modifiers.ts 的 `ModOp` 解析出 0 個成員 —— 解析器與程式碼分家了")
    return ops


@functools.lru_cache(maxsize=None)
def hook_events() -> tuple:
    """`HookEvent` union 的每一個成員，照宣告順序。"""
    src = _strip_comments(_read(MODIFIERS_TS))
    m = re.search(r"export type HookEvent\s*=(.*?);", src, re.S)
    if not m:
        raise VocabError("modifiers.ts 裡找不到 `export type HookEvent` —— 它被改名了嗎？")
    events = tuple(re.findall(r"\"([A-Za-z]+)\"", m.group(1)))
    if not events:
        raise VocabError("`HookEvent` 解析出 0 個成員 —— 解析器與程式碼分家了")
    return events


@functools.lru_cache(maxsize=None)
def stat_labels() -> dict:
    """屬性的中文名 —— 讀 `baseBonus.ts` 的 `STAT_LABEL_ZH`。

    ⭐ 那一份是 `Readonly<Record<Stat, string>>`，所以**它不可能漏**：漏了 TS 就紅。
    這裡再驗一次，是為了擋「解析器讀漏」而不是「作者寫漏」。
    """
    body = _block(_strip_comments(_read(BASE_BONUS_TS)), "export const STAT_LABEL_ZH", BASE_BONUS_TS)
    members = stat_members()
    out = {}
    for member, label in re.findall(r"\[Stat\.(\w+)\]\s*:\s*\"([^\"]+)\"", body):
        if member not in members:
            raise VocabError(f"STAT_LABEL_ZH 有一條 `Stat.{member}`，而 `Stat` 沒有這個成員")
        out[members[member]] = label
    missing = [s for s in stats() if s not in out]
    if missing:
        raise VocabError(
            "STAT_LABEL_ZH 少了 %d 條屬性的中文名：%s\n"
            "   → 補在 packages/shared/src/sim/baseBonus.ts 的 STAT_LABEL_ZH（TS 本來就會紅）"
            % (len(missing), "、".join(missing))
        )
    return out


@functools.lru_cache(maxsize=None)
def curated_labels(section: str) -> dict:
    """`tools/skill-spec/curated.json` 的某一節（`effectKinds` / `conditionLeaves` …）。

    ⛔ **不要再抄第四份。** 那一份是這個 repo 唯一的手寫詞彙檔，而且已經被
    `gen_spec.ts::reconcileLabels` 兩個方向對帳過。
    """
    try:
        with open(CURATED_JSON, encoding="utf-8") as f:
            curated = json.load(f) or {}
    except OSError as e:
        raise VocabError(f"讀不到 {os.path.relpath(CURATED_JSON, REPO)}：{e}") from e
    table = curated.get(section)
    if not isinstance(table, dict) or not table:
        raise VocabError(f"curated.json 沒有 `{section}` 這一節（或它是空的）")
    return dict(table)


def reconcile(labels: dict, tokens, what: str) -> None:
    """`tokens`（引擎真的有的）每一個都要有中文名，否則 raise。

    ⭐ 這是這一族產生器的閘：以前的寫法是 `labels.get(t, '—')`，於是一個沒被命名的
    新機制會**以一格 `—` 的樣子**出現在文件裡 —— 看起來像「這個沒有中文名」，
    實際上是「這份文件比引擎舊了一個版本」。兩者在畫面上一模一樣。
    """
    missing = [t for t in tokens if t not in labels]
    if missing:
        raise VocabError(
            "%s 有 %d 個 token 沒有中文名：%s\n"
            "   → 補在 tools/skill-spec/curated.json，⛔ 不要改產生器、⛔ 不要讓它印 `—`"
            % (what, len(missing), "、".join(missing))
        )


@functools.lru_cache(maxsize=None)
def hook_labels() -> dict:
    """觸發事件的中文名 —— 讀 `curated.json` 的 `hookEvents`，並與 `HookEvent` 對帳。

    兩個方向都關起來（與 `gen_spec.ts` 同一組判準），因為下游可能在
    `pnpm spec:build` 沒跑的情況下就產生文件。
    """
    curated = curated_labels("hookEvents")
    engine = set(hook_events())
    missing = [e for e in hook_events() if e not in curated]
    if missing:
        raise VocabError(
            "curated.json 少了 %d 個觸發事件的中文名：%s\n"
            "   → 補在 tools/skill-spec/curated.json 的 `hookEvents`，⛔ 不要改產生器"
            % (len(missing), "、".join(missing))
        )
    lies = sorted(t for t in curated if t not in engine)
    if lies:
        raise VocabError(
            "curated.json 的 `hookEvents` 有 %d 個引擎不認得的 token：%s\n"
            "   → 引擎刪掉它們了？把這幾條移到 `retiredTokens`" % (len(lies), "、".join(lies))
        )
    return dict(curated)


def hook_label(token: str) -> str:
    """一個事件的中文名。⛔ 查不到 raise —— 不印裸 token、不印 `—`。"""
    labels = hook_labels()
    if token not in labels:
        raise VocabError(
            f"觸發事件 `{token}` 沒有中文名，而且引擎也不認得它。\n"
            "   → 引擎真的有它 → 補 tools/skill-spec/curated.json；"
            "打錯字 → 改那份內容 JSON"
        )
    return labels[token]


@functools.lru_cache(maxsize=None)
def stat_caps() -> dict:
    """`content/config/stat-caps.json` 的 `caps`（後台可調的那一份，⛔ 不是 STAT_CLAMPS）。"""
    try:
        with open(STAT_CAPS_JSON, encoding="utf-8") as f:
            caps = (json.load(f) or {}).get("caps") or {}
    except OSError as e:
        raise VocabError(f"讀不到 {os.path.relpath(STAT_CAPS_JSON, REPO)}：{e}") from e
    unknown = sorted(k for k in caps if k not in set(stats()))
    if unknown:
        raise VocabError(
            "stat-caps.json 有 %d 條引擎不認得的屬性：%s —— 它們的上限對誰都不生效"
            % (len(unknown), "、".join(unknown))
        )
    return caps


# ---------------------------------------------------------------------------
# 給產生器用的組裝器
# ---------------------------------------------------------------------------

def label_table(overrides: dict, what: str = "屬性") -> dict:
    """`overrides` ∪ `STAT_LABEL_ZH`，**覆蓋每一條出貨屬性**，否則 raise。

    `overrides` 是那一支產生器自己的用語（原圖的 WC3 措辭、表格要短一點的簡稱…）。
    它**只是覆蓋**，⛔ 不是清單 —— 「有哪些」永遠是 `stats()`，所以引擎多一條屬性
    的那一天，這裡自動多一列（拿 `STAT_LABEL_ZH` 的名字），而不是安靜地少一列。
    """
    unknown = sorted(k for k in overrides if k not in set(stats()))
    if unknown:
        raise VocabError(
            "%s 的自訂名有 %d 條引擎不認得：%s\n"
            "   → `Stat` 把它刪掉／改名了，請一起改" % (what, len(unknown), "、".join(unknown))
        )
    base = stat_labels()
    table = {s: overrides.get(s, base[s]) for s in stats()}
    blank = sorted(s for s, v in table.items() if not v)
    if blank:
        raise VocabError(f"{what} 有 {len(blank)} 條的名字是空字串：{'、'.join(blank)}")
    return table


def require_ops(known: dict, what: str) -> None:
    """`known` 必須說明**每一個** `ModOp` 該怎麼呈現，否則 raise。

    ⚠️ 這一條擋的是最貴的那一種失敗：一個沒被想過的運算子被**折進加總**裡。
    `capRaise as 10`（解鎖攻速上限到 10）被當成 `+10` 折進攻速，然後印出
    「攻擊速度+1000%」—— 一句帶著數字的假話，而它看起來跟正確的一模一樣。
    """
    missing = [op for op in mod_ops() if op not in known]
    if missing:
        raise VocabError(
            "%s 沒有說明這 %d 個運算子怎麼呈現：%s\n"
            "   → 在那支產生器裡補上它們，⛔ 不要讓它們被折進加總（那會印出假的數字）"
            % (what, len(missing), "、".join(missing))
        )
