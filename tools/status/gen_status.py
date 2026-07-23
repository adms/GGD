#!/usr/bin/env python3
"""gen_status.py — regenerate docs/requirements-status.md from the task ledger.

The user asked for a live status file they can keep open
(「請你將地毯式搜索的結果及進度動態更新到一個 md 檔上供我查看」). This is the
generator: the single TASKS table below is the source of truth, and one run
rewrites the md with a fresh timestamp. Update a status here, re-run, done —
that is the "dynamic" the user wants without a database.

status codes:
  done     ✅ shipped + verified
  flight   🔄 a background workflow is implementing it right now
  designed 📐 full spec written, not yet built
  pending  ⬜ not started
  blocked  ⛔ waiting on something outside our control (e.g. an operator key)
"""
import datetime, os, collections

# (id, domain, status, zh one-liner)
TASKS = [
    # ── audio ──────────────────────────────────────────────────────────────
    (2,  "audio", "done",    "11 場景 BGM + SFX 接上遊戲事件"),
    (14, "audio", "done",    "每個畫面頂層音樂/音效開關"),
    (20, "audio", "done",    "登入雙龍遠近吼聲 + 打字音效 + 騎龍進場"),
    (24, "audio", "done",    "所有按鈕 hover+click 音效 + 按壓特效"),
    (26, "audio", "done",    "憤怒動作吼 vs 環境長吟 區分"),
    (27, "audio", "done",    "點角色播該英雄語音"),
    (30, "audio", "done",    "選英雄倒數最後 5 秒漸強 + 獨立結尾音"),
    (34, "audio", "done",    "系統廣播旁白 VO"),
    (35, "audio", "done",    "選英雄唸全名（日文女聲）"),
    (40, "audio", "done",    "系統旁白統一日文女聲 Kyoko"),
    (51, "audio", "done",    "整合効果音ラボ 免費商用音效"),
    (52, "audio", "done",    "自製 BGM 取代魔王魂"),
    (54, "audio", "done",    "音量滑桿 + 自訂游標"),
    (57, "audio", "done",    "惡搞路線 VO（中英日）"),
    (87, "audio", "done",    "BGM loop 加長 + 新轉折 B 段"),
    (88, "audio", "done",    "登入第二首寧靜女聲 nocturne 輪播"),
    (86, "audio", "done",    "賽博 hover 改成咻咻電流(非低頻鼓聲)"),
    (75, "audio", "pending", "龍吟重配到縮短錨點 + 加殘響"),
    (62, "audio", "pending", "背景任務靜音保證"),
    (63, "audio", "pending", "音效分場景預載"),
    (109,"audio", "pending", "BGM 每回合從 bar 0 重播，後半段聽不到"),
    (53, "audio", "pending", "真 AI 音樂供應商"),
    # ── ui ─────────────────────────────────────────────────────────────────
    (12, "ui", "done",    "程序化 isekai 登入背景"),
    (15, "ui", "done",    "登入頁重設計（暗黑史詩）"),
    (18, "ui", "done",    "登入英雄頭像跑馬燈"),
    (21, "ui", "done",    "戰鬥 HUD 技能提示 + EX 快捷 F"),
    (23, "ui", "done",    "編輯器 AI 圖示生成 + 後台供應商設定"),
    (25, "ui", "done",    "勝利結算 S+/A 評分 + 排行榜"),
    (31, "ui", "done",    "預設最近視角 + 隊色小地圖"),
    (36, "ui", "done",    "結算排名自動捲動到自己"),
    (42, "ui", "done",    "HUD 左上角碰撞修正"),
    (58, "ui", "done",    "小地圖 LoL 規格"),
    (71, "ui", "done",    "內容圖鑑動態頁"),
    (38, "ui", "done",    "中場中央商店 + JRPG 旅行商人"),
    (95, "ui", "done",    "商店限時倒數 + 音效"),
    (96, "ui", "done",    "localhost 免登入編輯圖鑑"),
    (97, "ui", "done",    "圖示覆蓋率即時進度條"),
    (101,"ui", "done",    "圖示生成頁 + 資產主控台整併"),
    (94, "ui", "done",    "商店移左半邊 + 功能分群貨架"),
    (106,"ui", "done",    "商品內聯說明 + 六格上限 + 即時屬性預覽"),
    (107,"ui", "stalled",  "介面邊界契約（FPS 不再擋商店）"),
    (110,"ui", "stalled",  "三選一卡片炫彩流光 + 必含 icon + 科技音"),
    (76, "ui", "stalled",  "60 秒選英雄 + 前 10 秒規則說明 + 英雄詳介"),
    (102,"ui", "stalled",  "後台管理整併（loopback=admin）"),
    (99, "ui", "stalled",  "資產預算頁 + 離線批次優化"),
    (114,"ui", "stalled",  "w3x 描述色碼 → 語意角色（遊戲/後台/圖鑑）"),
    (115,"models","stalled", "模型 LOD 分級（-mid/-small）讓畫質設定真的換檔案"),
    (116,"models","stalled", "版權模型替換：Sketchfab 逐項搜尋＋自己捏"),
    (13, "ui", "pending", "遊戲內致謝 + 授權標示"),
    (19, "ui", "pending", "三語 UI 框架"),
    (41, "ui", "pending", "選英雄 hover 觸發稱號+全名語音"),
    (44, "ui", "pending", "HUD 常駐裝備列 + 格位規則"),
    (66, "ui", "pending", "版號置底每個畫面"),
    (67, "ui", "pending", "小地圖只顯示自己對戰區"),
    (74, "ui", "pending", "登入→戰鬥載入橋接 + 己方發光"),
    # ── combat ─────────────────────────────────────────────────────────────
    (3,  "combat", "done",    "打擊回饋（震動/閃白/擊退/停頓）"),
    (28, "combat", "done",    "戰鬥環境倍率表 + 後台動態設定"),
    (29, "combat", "done",    "固定視角無遮擋物稽核"),
    (33, "combat", "done",    "戰鬥粒子特效大改"),
    (39, "combat", "done",    "濺血/塵土/槍口閃光等回饋特效"),
    (43, "combat", "done",    "走路抖動根因（補間 + 動態解析度）"),
    (60, "combat", "done",    "攻擊動作/受傷變紅/遠程飛行物"),
    (84, "combat", "done",    "死亡火圈 + 隊友引導復活一次"),
    (82, "combat", "done",    "三價經濟 + 傳說寶玉 + 20 次屬性路線"),
    (93, "combat", "stalled",  "勝利表演（灰+煙火+嘲諷 / 吃雞烤雞煙火）"),
    (92, "combat", "done",    "RO 風格傷害/補血/補魔數字"),
    (85, "combat", "pending", "死亡灰階只留隊友色（被 #100 擋著）"),
    (89, "combat", "designed","守護塔（樹人/石頭人…）打塔獎勵"),
    (90, "combat", "designed","擊殺賞金 300g，復活的不再多給"),
    (100,"combat", "pending", "回合結束後角色還會打 66 秒"),
    (104,"combat", "pending", "20 次強化閘門移到第 6 回合"),
    (46, "combat", "pending", "戰鬥中 sim 偶爾停止 tick（已升級）"),
    (7,  "combat", "pending", "花朵整合驗證 + 完整測試 + 實測"),
    # ── models ─────────────────────────────────────────────────────────────
    (1,  "models", "done",    "模型朝向 + 全英雄縮放稽核"),
    (9,  "models", "done",    "WC3 虛擬特效單位 → VFX/環境"),
    (16, "models", "done",    "登入 CC0 龍模型"),
    (17, "models", "done",    "移除模型內多餘大特效網格"),
    (22, "models", "done",    "治療花朵可見化"),
    (32, "models", "done",    "妙蛙種子模型修正"),
    (37, "models", "done",    "刀光殘影 ≤0.25s"),
    (49, "models", "done",    "移植模型頂點色/透明度"),
    (59, "models", "done",    "索隆龍捲風只在特定動作出現"),
    (80, "models", "done",    "競技場地面重建"),
    (105,"models", "stalled",  "守護塔各地圖不同形象"),
    (103,"models", "done",    "店員被自己攤位擋住（sightline 測試）"),
    (111,"models", "stalled",  "皮卡丘倒地 + 購買時勝利動作"),
    (68, "models", "pending", "26 模型根骨旋轉錯誤"),
    (73, "models", "pending", "全模型掃描：未合併的球體/蝗蟲群附件幾何（孫悟空沒頭只是其中一例）"),
    (77, "models", "pending", "替身 fallback 丟失真模型與縮放"),
    (79, "models", "pending", "92% 技能共用一個火焰佔位特效"),
    (98, "models", "pending", "11 個零幾何特效模型"),
    (50, "models", "pending", "移植虛擬特效單位逐次參數"),
    (61, "models", "pending", "全模型稽核只修壞的"),
    (64, "models", "pending", "受傷變紅畫在方塊而非 3D 模型"),
    (69, "models", "pending", "補完近戰攻擊閃光 + 一角色無攻擊動作"),
    # ── content ────────────────────────────────────────────────────────────
    (4,  "content", "done",    "內容白名單（後台啟用）"),
    (8,  "content", "done",    "從未加密源地圖重新匯入"),
    (11, "content", "done",    "英雄編號技能命名規則"),
    (47, "content", "done",    "示範英雄組合"),
    (55, "content", "done",    "英雄身分＝編號非模型（黑化Saber）"),
    (70, "content", "done",    "只有最終道具進商店，任務進三選一"),
    (78, "content", "stalled", "1:1 技能+道具對照帳(全專案最大保真缺口，長期任務，未完成)"),
    (128,"content", "pending", "全英雄技能/道具 in-game 可施放覆蓋掃描：每個 QWER+EX 按下去真的有效（pass/fail 矩陣，非 #78 保真、非 #79 特效）"),
    (72, "content", "blocked", "AI 圖示：0 張，卡在 #112 + 供應商金鑰"),
    (108,"content", "stalled",  "傳說池誤放修正 + 說明對數值稽核"),
    (113,"content", "pending", "14 對同名英雄查重複或獨立"),
    (56, "content", "pending", "匯入器丟掉 150/180 欄位"),
    (83, "content", "pending", "4 個道具數值被匯入器加倍"),
    (81, "content", "pending", "清理 Blizzard 資產債"),
    (91, "content", "pending", "清掉殘留魔王魂文字"),
    # ── infra ──────────────────────────────────────────────────────────────
    (5,  "infra", "done",    "固定連接埠 39527 / 60721"),
    (6,  "infra", "done",    "排位天梯"),
    (10, "infra", "done",    "抽取 Blizzard 模型 + 音效（本機限定）"),
    (65, "infra", "pending", "git init（整個專案沒有版控）"),
    (112,"infra", "blocked", "AI 圖片路徑壞掉（金鑰也修不了）"),
    (48, "infra", "pending", "遊戲伺服器寫死 k8s 主機名"),
    (118,"content","pending","水晶/M幣 meta 養成：打場解鎖英雄+喜愛置頂+造型（稽核找到的真缺口）"),
    (119,"combat", "pending","英雄變身/形態切換系統：每回合或計時自動變回（真缺口）"),
    (117,"infra", "done",    "關閉 LAN 曝露的無密碼 redis（token 竊取路徑）"),
    (120,"audio",  "pending","選英雄語音：稱號中文+全名日文混搭(更有喜感)"),
    (121,"ui",      "pending","商店賣出可還原(反沖 40% 退款、算對錢)"),
    (122,"ui",      "pending","商店分頁改 屬性|技能 + 顯示英雄頭圖"),
    (123,"models",  "pending","共用特效 primitive 庫(龍捲風/衝擊波/爆炸/蝗蟲群…) 一個服務多技能"),
    (124,"audio",  "pending","中場改編成下課打鐘開心歡樂風(需先加 bell 音色)"),
    (125,"ui",      "pending","所有顯示數值=倍率計算後最終值(冷卻已設 25%)"),
    (126,"infra",  "pending","私人發佈閘：註冊→pending→管理員核准才能玩 + 上線硬化"),
    (127,"infra",  "pending","環境分級閘：版權物/單機只在 localhost/LAN 開放"),
    # ── 2026-07-23 整合波（#128-#171 補列仍是既有的 live-page sync 缺口）──────
    (85, "models", "done",   "死亡觀戰整個畫面去飽和，只有自己的隊友保持有顏色（復活圈色池已收到剪影尺度）"),
    (93, "models", "flight", "勝利演出：回合=灰底+小煙火+英雄嘲諷 / 決賽=暗底+巨大烤雞煙火+嗆聲 VO"),
    (143,"models", "flight", "回合勝利：贏家 3D 模型置中 + 語音（與 #93 灰底同一拍）"),
    (173,"combat", "done",   "回合 MVP 輪空殘留：TeamState.roundOutcome 參戰訊號 + 優先勝方的選擇器"),
]

DOMAINS = [
    ("audio",   "🎵 音樂 / 音效"),
    ("ui",      "🖥️ 介面 UI"),
    ("combat",  "⚔️ 戰鬥系統 / 玩法"),
    ("models",  "🎭 模型 / 特效"),
    ("content", "📦 內容 / 經濟 / 資料"),
    ("infra",   "🔧 基礎建設 / 技術債"),
]
MARK = {"done": "✅", "flight": "🔄", "stalled": "⏸", "designed": "📐", "pending": "⬜", "blocked": "⛔"}
LABEL = {"done": "已完成", "flight": "進行中", "stalled": "做中·待續跑(花費上限中斷)",
         "designed": "已設計未實作", "pending": "待辦", "blocked": "受阻"}
# NOTE: "flight" was in MARK/LABEL but missing here, so the first in-progress
# row ever added would crash the generator with a ValueError. Every key of MARK
# must appear in ORDER.
ORDER = ["stalled", "flight", "blocked", "designed", "pending", "done"]

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(REPO, "docs", "requirements-status.md")

# deep-audit block: a plain file the carpet-search writes when it lands.
AUDIT_FILE = os.path.join(REPO, "docs", "_requirements-audit-gaps.md")


def main():
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    counts = collections.Counter(s for _, _, s, _ in TASKS)
    total = len(TASKS)
    L = []
    L.append("# 去死團的逆襲 — 需求完成狀況")
    L.append("")
    L.append(f"> 最後更新 **{now}** · 由 `tools/status/gen_status.py` 產生。")
    L.append("> 這份檔案是動態的：每當有任務狀態改變，重跑一次就會刷新。")
    L.append("")
    L.append("| 狀態 | 數量 |")
    L.append("|---|---|")
    for s in ORDER:
        if counts[s]:
            L.append(f"| {MARK[s]} {LABEL[s]} | {counts[s]} |")
    L.append(f"| **合計** | **{total}** |")
    pct = round(100 * counts["done"] / total)
    L.append("")
    L.append(f"**完成度：{counts['done']}/{total} ≈ {pct}%**（進行中 {counts['flight']} 項正在跑背景任務）")
    L.append("")
    L.append("圖例：✅ 已完成並驗證　🔄 背景任務實作中　📐 已設計未實作　⬜ 待辦　⛔ 受阻（等外部條件，如供應商金鑰）")
    L.append("")

    for dkey, dtitle in DOMAINS:
        rows = [t for t in TASKS if t[1] == dkey]
        rows.sort(key=lambda t: (ORDER.index(t[2]), t[0]))
        d = collections.Counter(s for _, _, s, _ in rows)
        head = " · ".join(f"{MARK[s]}{d[s]}" for s in ORDER if d[s])
        L.append(f"## {dtitle}　<sub>{head}</sub>")
        L.append("")
        L.append("| | # | 需求 |")
        L.append("|---|---|---|")
        for tid, _, st, zh in rows:
            L.append(f"| {MARK[st]} | {tid} | {zh} |")
        L.append("")

    # highest-priority callouts
    L.append("## 🔺 最該優先")
    L.append("")
    L.append("1. **#65 git init** — 整個專案沒有版控，已因此永久遺失過檔案。每個任務都在裸奔。")
    L.append("2. **#100 戰鬥不停** — 回合結束後角色還打 66 秒，正擋著 #85 死亡灰階看不到效果。")
    L.append("3. **#112 + 供應商金鑰** — AI 圖示 0 張；我修圖片路徑，你在後台設金鑰，才跑得動。")
    L.append("")

    # append the carpet-search gaps if the audit has written them
    if os.path.exists(AUDIT_FILE):
        L.append("---")
        L.append("")
        with open(AUDIT_FILE, encoding="utf-8") as f:
            L.append(f.read().rstrip())
        L.append("")
    else:
        L.append("---")
        L.append("")
        L.append("## 🔎 地毯式搜索（進行中）")
        L.append("")
        L.append("156 條使用者發言已抽取，正在逐域比對程式碼找出**尚未進追蹤清單**的漏項。")
        L.append("完成後這一段會自動換成漏項清單（寫入 `docs/_requirements-audit-gaps.md`，重跑本工具即併入）。")
        L.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"wrote {OUT} — {total} tasks, {counts['done']} done ({pct}%)")


if __name__ == "__main__":
    main()
