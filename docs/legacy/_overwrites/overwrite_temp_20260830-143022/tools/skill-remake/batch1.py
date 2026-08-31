#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英雄技能第一批重製 —— 15 位英雄 × 6 格 = 90 支，從 owner 的描述翻成 JSON。

⭐ 為什麼是一支產生器而不是 90 次手改（CLAUDE.md 第零守則⑨）：
   這 90 支只差「參數」，逐支手改是 90 輪各自會腐爛的編輯。一張表 + 一個寫入器
   讓「同一份資料同時產生**出貨內容**與**給 Codex 的示範文件**」——
   兩邊不可能漂移，因為它們是同一個 dict 印兩次。

⭐ 檔案佈局（GH#467 —— 這一份現在是**薄殼**，不再是 3,345 行的單體）：

     heroes/<champion-id>.py   一位英雄一檔，只有**那一位**的 6 列表格
     common.py                 機制側：模板（amt/dmg/area/line/buff）、級距、
                               所有的閘、以及 `build()`
     batch1.py（這一份）       `HERO` 註冊表 + 掃 heroes/ 匯總 + 閘 + 收工

   ⚠️ 拆的理由是**併行**：這 20 個英雄 id 原本擠在同一個檔裡，於是任何要動到
      其中一位的工作都只能排隊。對外介面**一個字都沒變** —— `T` / `HERO` /
      `build()` / 命令列旗標全部原樣（`refresh_docs.py`、`emit_spec_md.py`、
      `stamp_provenance.py`、`export_xlsx.py` 與三支 TS 守衛都照舊）。

   ⛔ 新增／移除一位英雄要**同時**動兩個地方：`heroes/` 的檔案 + 下面的 `HERO`。
      只做一半 → `load_heroes()` 的雙向閘當場紅（那是閘，不是判準）。

⛔ 寫 JSON **不是**這支腳本的最後一步。客戶端讀 `content/bundle.json`、game-server
   開機讀 `manifest.json` + 各集合 `_index.json` —— 三者都是 `pnpm content:build`
   的產物。所以 `main()` 末端**一定**要跑 `finalize_content()`，失敗就非零離開。

⭐ 那一關同時是**唯一**會驗 schema 的地方：`packages/shared/scripts/buildIndexes.ts`
   先跑嚴格 `ContentLoader.load()` 再寫檔，欄位名猜錯會在那裡指名檔案與欄位，
   而不是幾分鐘後在別支測試裡以「別的文件參照不到」的形式爆出來。

⚠️ 2026-08-12 訂正（第三守則）：這一段原本寫「驗證由 content:build 做，而且
   `tools/skill-remake/validate.test.ts` 會逐份 safeParse」——**兩句都是假的**。
   那個指令這支腳本從來沒跑過（A-2，7 條紅），而那個測試檔**不存在**。

用法：
    python3 tools/skill-remake/batch1.py               # 寫內容 + 重建產物 + 更新文件章節
    python3 tools/skill-remake/batch1.py --dry-run     # 只印出來，什麼都不寫
    python3 tools/skill-remake/batch1.py --no-build    # ⛔ 只在迭代表格時用，產物會過期
    python3 tools/skill-remake/batch1.py --audit-only  # 只跑閘，一個檔案都不動
"""
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tag_gate  # noqa: E402  —— A-3 標籤閘（同目錄）
import form_counterparts  # noqa: E402  —— GH#854 變身態作者閘（同目錄）
import common  # noqa: E402  —— 機制側（模板 / 閘 / build），⛔ 裡面沒有任何一位英雄的資料
from common import (  # noqa: E402
    AB,
    AUDIT,
    CARRY_KINDS,
    CH,
    COSMETIC_LOG,
    DROP_LOG,
    FOLD_LOG,
    FORM_TAG_TO,
    FORM_TAG_WAIVED,
    FORM_TRIGGERS,
    FORMS_EMITTED,
    ROOT,
    T,
    b1_report,
    build,
    lead_tags,
    # ⚠️ 只被**外部守衛**讀：`packages/shared/src/ops/skillDescQuotesAreDialogue.test.ts`
    #    把這一份 import 起來之後呼叫 `b._mechanics_text(...)`（它驗的是行為，不是字串）。
    #    ⛔ 拿掉這一行 = 那條守衛以 AttributeError 紅，而它說的會是別的故事。
    _mechanics_text,  # noqa: F401
)

HEROES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "heroes")

# 英雄編號 → 本體 champion id。⚠️ 有兩個 id 的編號一律取**本體**
# （變身態的身體玩家選不到，見 apps/game-server/src/curation/transformedBodyGate.test.ts）。
#
# ⭐ 這張表現在同時是三件事：
#   ① `heroes/` 的**註冊表** —— 一列 ↔ 一個 `heroes/<champion-id>.py`（雙向，見 load_heroes）
#   ② **載入順序** —— 也就是 `T` 的順序。⛔ 不要改成按編號排：`emit_spec_md.py`
#      產出的並排文件是照 `T` 走的，重排等於整份文件重寫一次。
#   ③ 「哪 90 支歸產生器管」的答案 —— **三個外部讀者用正則抓這個字面值**：
#      `stamp_provenance.py`、`export_xlsx.py`、以及出貨守衛
#      `packages/shared/src/content/abilityProvenance.test.ts`。
#      ⛔ 所以它必須留在這一份、必須是字面值、必須以第 0 欄的 `}` 收尾。
HERO = {
    "20": "godie-e002", "59": "godie-e00r", "70": "godie-e00s", "77": "godie-e00w",
    "45": "godie-edem", "13": "godie-efur", "15": "godie-emfr", "44": "godie-emns",
    "12": "godie-ewar", "60": "godie-h00l", "79": "godie-h01n", "80": "godie-h01u",
    "89": "godie-h02k", "92": "godie-h02v", "52": "godie-hapm",
}
common.register_heroes(HERO)


def load_heroes():
    """把 `heroes/` 的 15 份分片載進 `common.T`，順序照 `HERO` 的宣告序。

    ⭐ 這裡是**雙向閘**（第零守則：閘，不是判準）。分片之後多出兩種以前不存在的
       失敗形態，兩種都是**靜默**的：

         · 加了 `heroes/godie-xxxx.py` 但忘了寫進 `HERO`
           → 那位英雄的 6 支**根本不會被載入**，而 `assert len(docs) == 90`
             只會說「表裡只有 84 支」，⛔ 不會說是誰。
         · `HERO` 有一列但檔案被刪掉／改名
           → `FileNotFoundError`，訊息指的是路徑不是原因。

       所以兩個方向都在這裡當場點名。⛔ 不要把它放寬成「掃到什麼載什麼」——
       那樣 `HERO`（三個外部讀者的真理來源）就會悄悄與實際載入的東西脫鉤。

    ⚠️ 第三個方向：一個檔案只能放**它自己**那位英雄的 6 列。放錯檔會讓
       `slot_suffix()` 的雙射斷言以「槽位解析不是雙射」紅 —— 那是正確的紅燈配
       錯誤的故事，所以這裡先講清楚。
    """
    found = {
        f[: -len(".py")]
        for f in os.listdir(HEROES_DIR)
        if f.endswith(".py") and not f.startswith("_")
    }
    want = set(HERO.values())
    unregistered = sorted(found - want)
    missing = sorted(want - found)
    assert not unregistered and not missing, (
        "heroes/ 與 HERO 註冊表對不起來：\n"
        + "".join(f"  ⛔ heroes/{c}.py 存在，但 HERO 裡沒有這一列（它不會被載入）\n"
                 for c in unregistered)
        + "".join(f"  ⛔ HERO 有 {c}，但 heroes/{c}.py 不存在\n" for c in missing)
        + "修法：加/減英雄要**同時**動 heroes/ 的檔案與這一份的 HERO。"
    )
    for num, cid in HERO.items():
        before = len(T)
        spec = importlib.util.spec_from_file_location(
            "ggd_hero_" + cid.replace("-", "_"), os.path.join(HEROES_DIR, cid + ".py")
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        rows = T[before:]
        strays = sorted({r["num"].split("-")[0] for r in rows} - {num})
        assert len(rows) == 6 and not strays, (
            f"heroes/{cid}.py 應該剛好放 {num} 這一位的 6 支，"
            f"實際 {len(rows)} 支"
            + (f"，而且混進了別位英雄的編號：{'、'.join(strays)}" if strays else "")
        )


load_heroes()



# ─────────────────────────────────────────────────────────────────────────────
# ⛔ 寫完 JSON **不等於**出貨。客戶端讀 content/bundle.json，game-server 開機讀
#    manifest.json + 各集合 _index.json —— 全部是 `pnpm content:build` 的產物。
#    少跑這一段的代價已經量過兩次：
#      · 2026-08-01：一份過期的 bundle 帶著全綠的測試上線，選人畫面整個空的。
#      · 這一批 90 支重製稿：`shippedBundleIsCurrent` 4 條 +『bundle』3 條紅，
#        而那 90 份 JSON 本身一份都沒錯。
#    所以這不是「順手做一下」，它是產生器的**最後一段**。
#
# ⚠️ 任何一關失敗都非零離開。這裡 fail-open 就是 2026-08-01 事故本身。
# ─────────────────────────────────────────────────────────────────────────────
def finalize_content():
    """把「內容 → 出貨產物」跑完；任何一關失敗就以非零離開碼停下來。"""
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        sys.exit(
            "✖ PATH 上找不到 pnpm —— 索引與 bundle **沒有**重建。\n"
            "  ⛔ 不要當成成功：客戶端讀的是 bundle.json，不是你剛寫的那 90 份 JSON。"
        )
    # 明寫 GGD_CONTENT_DIR：讓「寫進哪棵樹」與「重建哪棵樹」是同一次宣告，
    # 而不是兩邊各自推導出來、只是碰巧相等（配對式後置條件）。
    env = dict(os.environ, GGD_CONTENT_DIR=os.path.join(ROOT, "content"))
    # ⭐ castTimeSec 的唯一來源是 castTimeFormula.deriveCastTime()（RETIRED 那張表
    #    說明了為什麼舊值不可以抄回來）。這一步就是那個「後處理」。
    # ⭐⭐ 2026-08-27（GH#835）——**順序**是承重的，⛔ 不是風格問題。
    #   `deriveCastTime()` 要讀 `config.cast-time@1`（`castTimeMaxSec` 的夾子），
    #   而它走的是**載入器**，也就是 `_index.json` / `bundle.json`。
    #   ⇒ ⛔ 在 `content:build` **之前**跑，它讀到的是**上一次**的設定
    #     ⇒ 算出來的 castTimeSec 用**舊的**夾子（實測 `godie-ewar.r` = 1.233），
    #     而 `castTimeCoverage.test.ts` 拿**新的**公式對它 ⇒ 紅，
    #     ⭐ 訊息說「內容 1.233 != 公式 1」而真相是「**它讀了舊設定**」。
    #   ⇒ 三步：先 build（讓設定新鮮）→ 再 derive → 再 build（把新值烘進 bundle）。
    #   ⚠️ 兩次 build 是必要的，⛔ 不是浪費：第一次餵公式，第二次收成果。
    def build(tag: str) -> None:
        print(f"→ pnpm content:build（{tag}）")
        rc = subprocess.run([pnpm, "content:build"], cwd=ROOT, env=env).returncode
        if rc != 0:
            sys.exit(
                f"✖ pnpm content:build 失敗（exit {rc}）—— 索引與 bundle **沒有**重建。\n"
                "  上面那幾行已經指名出問題的檔與欄位（buildIndexes.ts 是先驗再寫）。\n"
                "  ⛔ 不要 commit：現在 content/ 的來源檔是新的、產物是舊的。"
            )

    # ⭐⭐ 2026-08-30（GH#879）—— **一趟 derive 不是定點**，⛔ 而在此之前這裡只跑一趟。
    #   量到的形狀（乾淨的 HEAD 上逐步重現）：
    #     ① `{{cast}}` 佔位在**註冊時**就被渲染進 `description`（registries.ts），
    #        而 `castTimeFormula.authoredCastSec()` 讀的正是**渲染後**的那一段
    #        ⇒ ⭐ 公式把**自己上一次的輸出**當成「規格寫的吟唱秒數」讀回來。
    #     ② 這一支照 RETIRED 先把 castTimeSec 丟掉再 derive ⇒ 第一趟看到「沒有這一格」
    #        ⇒ 走 scored 階梯（實測 godie-ewar.r = 1.233、.ex = 1.133、
    #        godie-emns.ex / godie-hapm.ex = 1.033）。
    #     ③ 第二趟看到 1.233 ⇒ `{{cast}}` 渲染成 `min(1.233, castTimeMaxSec=1)` = 1
    #        ⇒ 走 authored ⇒ 寫回 **1**（= 出貨值）。
    #   ⇒ ⭐ **出貨的那一份是「兩趟」的結果** —— `skills:sync` 的下一步
    #     `castderive:build:raw` 剛好又跑了一趟。而 `bash scripts/genrun.sh skillremake:json`
    #     只跑一趟 ⇒ 乾淨的 HEAD 上跑一次就把那 4 支推開，`abilityCodeParity` 與
    #     `abilityCodeParityForms` 兩條閘同時紅（變身態 godie-e007 不在這 90 支裡，
    #     它的 castTimeSec 沒被丟掉 ⇒ 只有本體那一邊動了 ⇒ 「⛔ 單邊」），
    #     而產物隔離區擋著、還原不了 ⇒ lane 沒有出口。
    #   ⇒ ⭐ 修法是**跑到定點**：derive → build，重複到 derive 一個位元組都沒改為止。
    #   ⚠️ ⛔ 不是「不要丟掉舊值」—— 那會讓每一支帶 `{{cast}}` 的技能**永遠釘在舊值**上，
    #     機制改了也不會重算（RETIRED 那一格存在的理由）。
    #   ⚠️ ⛔ 也不是把夾子搬進公式 —— `castTimeMaxSec` 是 owner 的止血閥（#787），
    #     它**刻意**夾在載入時（`castTimeRules.ts`），烘進資料就轉不回去了
    #     （`castTimeProse.test.ts` ③ 正是在驗那一格轉得動）。
    #   ⚠️ 收斂性（為什麼 4 趟夠）：s 缺席 → L（階梯值）；s = L → min(L, 夾)；
    #     s = min(L, 夾) → 自己。⇒ **最多兩趟會寫**，第三趟就是 0。
    #     ⛔ 沒收斂就非零離開並指名，⛔ 不要安靜地留下一棵「半新」的樹。
    MAX_CAST_PASSES = 1
    build("① 先讓 config.cast-time 新鮮 —— 公式要讀它")
    for _pass in range(1, MAX_CAST_PASSES + 1):
        print(f"→ deriveCastTimes --write（第 {_pass} 趟；castTimeSec 由公式重算，含英雄卡鏡像）")
        proc = subprocess.run(
            [pnpm, "--filter", "@ggd/shared", "exec", "tsx", "scripts/deriveCastTimes.ts", "--write"],
            cwd=ROOT, env=env, capture_output=True, text=True,
        )
        # ⛔ 一行都不吞：這支腳本的 `skips` / `對帳` 是它唯一的說話管道。
        sys.stdout.write(proc.stdout)
        sys.stderr.write(proc.stderr)
        sys.stdout.flush()
        if proc.returncode != 0:
            sys.exit(
                f"✖ deriveCastTimes 失敗（exit {proc.returncode}，第 {_pass} 趟）"
                "—— castTimeSec 沒有補上，⛔ 不要 commit。"
            )
        m = re.search(r"WROTE (\d+) ability docs, (\d+) champion docs", proc.stdout)
        if m is None:
            sys.exit(
                "✖ deriveCastTimes 沒有印出 `WROTE … ability docs, … champion docs` —— \n"
                "  ⛔ 不要當成「收斂了」：那一行是這個迴圈**唯一**的定點判準。\n"
                "  它改了格式就要一起改這裡（⇒ packages/shared/scripts/deriveCastTimes.ts）。"
            )
        if int(m.group(1)) + int(m.group(2)) == 0:
            print(f"✓ castTimeSec 已收斂（第 {_pass} 趟一個位元組都沒改 ⇒ 產物已是新鮮的）")
            break
        build(f"② 第 {_pass} 趟：把重算後的 castTimeSec 烘進 _index / manifest / bundle")
    else:
        sys.exit(
            f"✖ castTimeSec 跑了 {MAX_CAST_PASSES} 趟仍然沒有收斂 —— ⛔ 不要 commit。\n"
            "  ⭐ 這代表公式的輸入裡有一格是它自己的輸出（`{{cast}}` 渲染進 description，\n"
            "     `authoredCastSec()` 又把它讀回去），而這一次不是 2-循環而是更長的循環。\n"
            "  ⇒ 去看 packages/shared/src/content/castTimeFormula.ts::authoredCastSec()。"
        )
    # 2026-08-02 事故的另一半：content:build 讀的是**工作區**，看得到未追蹤的來源檔，
    # 於是「產物進了 git、來源檔沒進」的組合會被 push 出去（deploy 走 git pull）。
    # 守衛 shippedBundleHasTrackedSources.test.ts 只在跑測試時響；這裡當場響。
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "content"],
        cwd=ROOT, capture_output=True, text=True,
    ).stdout.splitlines()
    if untracked:
        sys.exit(
            "✖ 這些來源檔已經被烘進 bundle，但**不在版控裡**（deploy 走 git pull）：\n  "
            + "\n  ".join(untracked)
            + "\n  修法：git add content/"
        )
    print("✓ 產物已重建。commit 記得 `git add content/`：bundle.json / manifest.json / 各 _index.json")


def main():
    dry = "--dry-run" in sys.argv
    no_build = "--no-build" in sys.argv
    docs = [build(e) for e in T]
    assert len(docs) == 90, f"表裡只有 {len(docs)} 支，應該是 90"
    # ── A-1 的閘：w3x 指名的變身觸發技，一支都不可以無聲消失 ──────────────
    # ⭐ 這是「閘」不是「判準」（CLAUDE.md 第零守則）：下一批 90 支再漏一次
    #    變身詞彙，會在**產生器當場**炸掉，而不是等到某條測試用別的訊息紅。
    missing = sorted(
        n for n in FORM_TRIGGERS if n not in FORMS_EMITTED and n not in FORM_TAG_WAIVED
    )
    assert not missing, (
        "這幾支是 w3x 指名的變身觸發技，但輸出裡沒有 championForm：\n  "
        + "\n  ".join(f"{n} → {FORM_TRIGGERS[n]}" for n in missing)
        + "\n（要嘛規格的標籤列漏了 [變身]/[切換]，要嘛這是一個設計變更 —— "
        "是設計變更就把編號加進 FORM_TAG_WAIVED，並寫上是誰、哪一天裁決的）"
    )
    for n, why in sorted(FORM_TAG_WAIVED.items()):
        print(f"⚠️  {n} 的變身被**明示**放掉：{why}")
    # 反方向：帶標籤但沒有第二具身體 = buff 形態，不是換身體。印出來，不 assert。
    orphan = [
        x["num"]
        for x in T
        if any(k in lead_tags(x["desc"]) for k in FORM_TAG_TO)
        and FORM_TRIGGERS.get(x["num"]) is None
    ]
    if orphan:
        print("ℹ️  帶 [變身]/[切換] 標籤但沒有第二具身體（buff 形態，不換身體）："
              + "、".join(orphan))
    print(f"championForm：{len(FORMS_EMITTED)} 支（w3x 觸發技 {len(FORM_TRIGGERS)} 支，"
          f"明示放掉 {len(FORM_TAG_WAIVED)} 支）")
    # ── GH#854 的閘：**變身態的技能檔有沒有一個作者** ─────────────────────────
    # ⭐ 這一支產生器只擁有**本體**（`HERO` 的註解逐字說「一律取本體」），而
    #    15 位裡有 6 位是變身對子的本體 ⇒ 那 6 個變身態**沒有任何人寫**。
    #    ⛔ 那不是「還沒做」，它是一個**半個**的狀態：本體被規格重寫、變身態停在
    #    w3x 匯入值，而 `deriveCastTimes.ts` 照兩份各自的機制算 castTimeSec
    #    ⇒ 每跑一次推開一點，且沒有任何東西會紅（2026-08-29 量到 14/36 vs 5/84）。
    # ⇒ 每一個變身態必須**二選一**地宣告作者，理由與兩個方向的閘住 form_counterparts.py。
    bad = form_counterparts.audit(set(HERO.values()), CH)
    assert not bad, (
        "變身態的技能檔沒有作者（GH#854）：\n  " + "\n  ".join(bad)
    )
    print(form_counterparts.report(set(HERO.values()), CH))
    # ── A-5 的閘 ────────────────────────────────────────────────────────────
    # ⚠️ 讀的是**最終要寫出去的那份 doc**，不是 carry_mechanisms 的暫存 ——
    #    所以「接上了但被後面某一步蓋掉」也會紅（第二守則失敗形態②）。
    leaks, report = [], []
    for _cid, _slot, d in docs:
        a = AUDIT.get(d["id"])
        if a is None:
            continue
        now = {x.get("kind") for x in d["effects"] if isinstance(x, dict)}
        lost = [k for k in a["prev_kinds"] if k not in now]
        for k in lost:
            if k in CARRY_KINDS and k not in a["dropped"]:
                leaks.append(f"  {d['id']} 掉了 {k}")
        bits = []
        if a["carried"]:
            bits.append("沿用 " + "/".join(a["carried"]))
        if a["dropped"]:
            bits.append("明示退場 " + "/".join(a["dropped"]))
        spec_rewrote = [k for k in lost if k not in CARRY_KINDS]
        if spec_rewrote:
            bits.append("規格改寫掉 " + "/".join(spec_rewrote))
        if bits:
            report.append(f"  {d['id']}: " + "；".join(bits))
    assert not leaks, (
        "A-5：規格沒點名的既有機制被靜默丟掉了 —— 沉默 ≠ 移除。\n"
        + "\n".join(leaks)
        + "\n真的要讓它退場，就在那一列填 retire={'<kind>': '為什麼'}，留下紙本痕跡；"
        "⛔ 不要把它從 CARRY_KINDS 拿掉。"
    )
    print(f"── 機制差異報表：{len(report)} 支與舊出貨文件不同 ──")
    for line in report:
        print(line)
    if DROP_LOG:
        print(f"── A-6 明示退場的欄位：{len(DROP_LOG)} 份文件 ──")
        for aid in sorted(DROP_LOG):
            print(f"  {aid}: " + "、".join(sorted(DROP_LOG[aid])))
    # ⭐ 五級距全轉（owner 2026-08-21 ①②③④⑦）—— ⛔ 這一段不可以安靜：
    #    一次改 90 支的傷害／冷卻／耗魔如果沒有印出來，它就是失敗形態②。
    hits = {a: v for a, v in common.TIERIZE_LOG.items() if v}
    if hits:
        n = sum(len(v) for v in hits.values())
        print(f"── 五級距全轉：{n} 格 / {len(hits)} 支 ──")
        for aid in sorted(hits):
            print(f"  {aid}: " + "；".join(f"{r[0]} {r[1]}→{r[2]}（{r[3]}）" for r in hits[aid]))
    if COSMETIC_LOG:
        print(f"── GH#375 純視覺彈道 → spawnVfx：{len(COSMETIC_LOG)} 支 ──")
        for aid in sorted(COSMETIC_LOG):
            print(f"  {aid}: " + "、".join(COSMETIC_LOG[aid]))
    if FOLD_LOG:
        n = sum(len(v) for v in FOLD_LOG.values())
        print(f"── B1-B 兄弟酬載折進 onHitTargets：{n} 個節點 / {len(FOLD_LOG)} 支 ──")
        for num in sorted(FOLD_LOG):
            print(f"  {num}: " + "、".join(f"{s}←{p}" for s, p in FOLD_LOG[num]))
    b1_report()
    # ⭐ A-3 標籤閘。⛔ 一定要在寫任何檔案**之前** —— 擋下來的時候一個檔案都沒動。
    gaps, stale = tag_gate.audit([(e["desc"], d) for e, (_c, _s, d) in zip(T, docs)])
    if gaps or stale:
        for aid, tag, why in gaps:
            print(f"❌ {aid}  [{tag}]  {why}", file=sys.stderr)
        for (aid, tag), why in stale:
            print(f"❌ 過期豁免 {aid} [{tag}] —— 缺口已經補好了，把這一列刪掉（原理由：{why}）",
                  file=sys.stderr)
        print(f"\n標籤閘擋下 {len(gaps)} 個缺口 / {len(stale)} 筆過期豁免 —— 一個檔案都沒寫。\n"
              f"修法二選一：把機制寫進表格，或在 tag_gate.WAIVERS 加一列**帶理由**的豁免。",
              file=sys.stderr)
        sys.exit(1)
    print("標籤閘：90 支的標籤全部找得到對應機制（含 %d 筆有理由的豁免）"
          % (len(tag_gate.WAIVERS) + len(tag_gate.BLOCKED_WAIVERS)))
    if "--audit-only" in sys.argv:
        return

    # ⭐ GH#319 —— 「帶印記的文件必須等於現在跑產生器的輸出」。
    #
    # 症狀（issue 逐字）：在後台／Codex 編輯器改一支「90 支重製」裡的技能，存檔成功；
    # 任何人下次跑這支產生器，**那筆編輯被無聲覆寫** —— 沒有紅燈、沒有 log、
    # 跟正常一模一樣。問題不是「誰該贏」（第〇·五守則已經回答：產生器贏），
    # 是**沒有人宣告誰該贏**，所以變成「誰最後跑誰贏」。
    #
    # ⛔ 這一格不是「改成不要覆寫」——那會讓 90 支從推導資料變回手寫資料。
    #    它是**讓覆寫變成看得見的**：手改之後 `--check` 當場回非零並指名檔案，
    #    而不是等下一次重生成才無聲消失。守衛在
    #    `packages/shared/src/ops/skillRemakeJsonFresh.test.ts`。
    if "--check" in sys.argv:
        drift = []
        for cid, slot, d in docs:
            p = os.path.join(AB, f"{d['id']}.json")
            try:
                have = json.load(open(p, encoding="utf-8"))
            except FileNotFoundError:
                drift.append(f"{d['id']}.json（不存在）")
                continue
            # ⚠️ `castTimeSec` **不比** —— 它由後處理器 `deriveCastTimes.ts --write`
            #    在這支寫完之後才蓋上去（見 main() 尾端）。把它算進來的話，
            #    這條閘會在**每一次乾淨的重跑**都紅（實測 50/90 份），
            #    那就是一個永遠紅的守衛 = 一個沒有人會看的守衛。
            # ⛔⛔ 但要知道**這一格因此量不到什麼**（GH#879，2026-08-30）：
            #    `--check` 回 0 **不代表**「跑一次不會改東西」—— 它對 castTimeSec
            #    ⭐ 結構上失明，而 castTimeSec 正是這支腳本會改的東西之一。
            #    ⇒ 2026-08-30 量到的正是這個組合：`--check` EXIT 0（樹是同步的），
            #      而 `genrun.sh skillremake:json` 跑下去改了 4 支的 castTimeSec
            #      ⇒ 兩條 parity 閘同時紅。⭐ 一把只驗過單邊的尺。
            #    ⇒ 「跑一次是不是 no-op」的閘不在這裡，在 `finalize_content()` 的
            #      **收斂迴圈**（derive → build 跑到一個位元組都不動為止）。
            if {k: v for k, v in have.items() if k != "castTimeSec"} != {
                k: v for k, v in d.items() if k != "castTimeSec"
            }:
                drift.append(f"{d['id']}.json")
        if drift:
            print(f"⛔ {len(drift)} 份出貨技能與產生器的輸出不一致："
                  f"{'、'.join(drift[:8])}{' …' if len(drift) > 8 else ''}", file=sys.stderr)
            print("  這 90 支是**產生器的輸出**（第〇·五守則）。手改會在下一次重生成時"
                  "被無聲覆寫 —— 所以這裡先紅。", file=sys.stderr)
            print("  要改請改 `tools/skill-remake/batch1.py`，然後跑："
                  "\n    python3 tools/skill-remake/batch1.py", file=sys.stderr)
            sys.exit(1)
        print(f"產生器印記一致：{len(docs)} 支")
        return

    by_champ = {}
    for cid, slot, d in docs:
        by_champ.setdefault(cid, {})[slot] = d
        if not dry:
            with open(os.path.join(AB, f"{d['id']}.json"), "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, indent=2)
                f.write("\n")
    # 鏡射：英雄卡內嵌 Q/W/E/R（⚠️ 內嵌版不帶 `schema`，見 ggd-mirror-authority-model）
    for cid, slots in by_champ.items():
        p = os.path.join(CH, f"{cid}.json")
        ch = json.load(open(p, encoding="utf-8"))
        for s in ("Q", "W", "E", "R"):
            if s in slots:
                m = dict(slots[s])
                m.pop("schema", None)
                ch["abilities"][s] = m
        if not dry:
            with open(p, "w", encoding="utf-8") as f:
                json.dump(ch, f, ensure_ascii=False, indent=2)
                f.write("\n")
    print(f"寫入 {len(docs)} 支技能 / {len(by_champ)} 位英雄" + ("（dry-run）" if dry else ""))
    # 給文件用的 JSON 章節
    out = []
    for hero in sorted(HERO, key=lambda x: int(x)):
        cid = HERO[hero]
        mine = [d for c, _, d in docs if c == cid]
        if not mine:
            continue
        out.append(f"\n### {hero} — `{cid}`\n")
        for d in mine:
            out.append(f"<details><summary><code>{d['id']}</code> — {d['name']}</summary>\n")
            out.append("```jsonc")
            out.append(json.dumps(d, ensure_ascii=False, indent=2))
            out.append("```\n</details>\n")
    with open("/private/tmp/skill-chapter.md", "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("章節寫到 /private/tmp/skill-chapter.md")
    # ⛔ 產生器的最後一段：內容 → 出貨產物（A-2）。
    if dry:
        print("（dry-run：沒有寫任何檔，所以不重建產物）")
    elif no_build:
        print(
            "⚠️ --no-build：略過了 pnpm content:build。\n"
            "   ⛔ 現在 content/ 的來源檔是新的、產物是舊的 —— 這正是 A-2 那個缺陷的狀態。\n"
            "   `shippedBundleIsCurrent.test.ts`(4) 與 `bundle.test.ts`(3) 會紅，而且**不可以** commit。"
        )
    else:
        finalize_content()


if __name__ == "__main__":
    main()
