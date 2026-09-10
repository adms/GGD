# GGD · legacy 記憶索引

> ⚙️ **這一份是產生出來的，⛔ 不要手改。**
> 
> ```bash
> python3 tools/legacy-index/build_index.py
> ```
> 
> 守衛：`packages/shared/src/ops/legacyIndexFresh.test.ts`（真的用 `--check` 跑腳本）。
> 它紅了不要改它 —— 跑上面那行，然後 `git add docs/legacy-index.md`。

---

## 這一份在回答什麼

owner 2026-08-13：

> 「請你搬移過時資料到 legacy **不要刪除舊資料**，並且將所有搬到 legacy 資料夾的檔案
>   都作一個檔案簡介 放在 docs/ 底下一個 legacy-index.md，
>   **以免真的需要的時候還是可以有個記憶索引**」

⭐ 歸檔**不是刪除**。第〇·六守則逐字：「『分開』不是『丟掉』——
測試可以跟著設計走，**知識不可以無聲消失**」。
所以每一份都留著，而這一份是找回它們的地圖。

**目前共 4031 個檔案**，分佈在 2 個隔離區。

| 隔離區 | 檔數 | 是什麼 |
|---|---:|---|
| [`docs/legacy/`](legacy-index.md#docslegacy) | 3591 | 規格與文件的隔離區（第〇·六守則階梯的第 3–5 層 + 已被取代的同型文件） |
| [`content/_legacy/`](legacy-index.md#contentlegacy) | 440 | **下架的內容文件** —— 英雄、技能、**道具**、config。「消失 ≠ 歸檔」：白名單移除的東西要真的躺在這裡 |

⚠️ **在這裡找到需要的東西之後**：它仍然是階梯第 3–5 層（或已被取代的同型文件）。
要用它之前先問「現行的那一份說什麼」—— 衝突時**現行的贏**（第〇·六守則）。

---

## `docs/legacy/` —— 3591 檔

規格與文件的隔離區（第〇·六守則階梯的第 3–5 層 + 已被取代的同型文件）

> ⚠️ ⛔ **`_overwrites/` 刻意不逐檔列。** 那裡是`scripts/preserve-before-overwrite.py`（PreToolUse hook）的**自動留底**，⭐ 每覆蓋一個檔就多一個目錄 —— 2026-09-02 量到它佔這份索引的 **82%**（3367 條裡 2762 條），⇒ 把 605 條真的條目埋掉，而且讓這份索引在一個工作 session 裡過期 **5 次以上**。
>
> ⭐ **它有自己的帳本**：[`docs/legacy/_overwrites/_ledger.tsv`](legacy/_overwrites/_ledger.tsv) —— CLAUDE.md 逐字指名那一份。⇒ 要找某一次覆蓋的留底就查那裡，⛔ 檔案一個都沒有被刪。

| 檔案 | 是什麼 | 為什麼在這裡 / 誤讀會怎樣 |
|---|---|---|
| `README.md` | 隔離區的規則本身 | 說明為什麼有這個資料夾、什麼該進來、閘在哪裡 |
| `_TEMP-工作流交接.md` | 臨時工作流交接（自稱 `_TEMP-`） | 自陳「等下一輪收工就可以刪掉」，卻又說「下次重新開始先讀這一頁」。它寫「v0.9.16 已上線」，實際差 15 個版號 |
| `_ability-fidelity-ledger.json` | 同上的 JSON 版（編輯器吃這一份，不要 parse md） | 同上 |
| `_ability-fidelity-ledger.md` | 696 支技能的三欄帳本（描述 vs 實作 vs w3x） | 第三欄的權威是 w3x。⚠️ 產生器 `docs/tools/ability_ledger.py` 的輸出路徑已改指這裡 |
| `_ability-ledger-editor-spec.md` | 保真度編輯器規格 | 第三欄權威是 w3x；它操作的帳本本體早就在 legacy，規格卻留在第一層 |
| `_ability-prose-residual-claims_temp_20260821-0110.tsv` | （.tsv 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ap-conversion-superseded.md` | 被 2026-08-21「屬性額外傷害 → AP 百分比」換算取代的知識 —— ⭐ **測試可以跟著設計走，知識不可以無聲消失**（CLAUDE.md 第一·五守則 · 第〇·六守則）。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_attr-growth-zeroed-superseded.md` | 被 2026-08-21 架構裁決取代的三圍成長知識 —— ⭐ **測試可以跟著設計走，知識不可以無聲消失**（CLAUDE.md 第〇·六守則）。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bot-build-priority-retired-20260820.md` | 退場：12 位英雄的「推薦出裝」梯子（`champion@1.buildPriority`） —— owner 2026-08-18：「66 位英雄的推薦出裝變成空的 => **不需要推薦出裝**」 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_card-prose-superseded.md` | 被取代的卡面文案（原文另存） —— ⛔ **測試可以跟著設計走，知識不可以無聲消失**（CLAUDE.md 第一·五守則）。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_champion-attack-range-20260731.md` | 07-31 的英雄攻擊距離快照 | 自陳「這是一份時間點快照」，而「過期了就補一行指向新檔」那一行從沒補上 |
| `_champion-dedup-113.md` | #113 英雄去重的**舊**接手檔 | 它的接班檔自己寫「本檔取代…那份的結論方向對、**理由是錯的**」。正確版是 `docs/_audit-113-duplicate-pairs.md` |
| `_derived-stats-248.md` | 從 w3u/UnitBalance.slk 重算全 114 位的三圍推導表 | 它寫「倍率該留在 ×8 不要動」，而出貨的 `maxHealth` 是 **4.0** —— 照它調平衡回合長度直接翻倍 |
| `_execution-batches-history-20260725.md` | 作戰表歷史封存（07-25） | ⚠️ 它的部署段寫「用裸的 docker compose build」—— 照做會踩地雷 4（掉版本戳 → 徽章寫 UNSTAMPED-BUILD） |
| `_execution-batches-history-20260726.md` | 作戰表歷史封存（07-26，120KB） | 已結案內容與活的作戰表同名同型住在同一層 —— 正是 legacy/README 指出的根因 |
| `_execution-batches-history-20260727.md` | 作戰表歷史封存（07-26 深夜～07-27） | 含 v0.6.0 的部署驗收數字；當現況會用 07-27 的線上狀態判斷今天 |
| `_fidelity-audit-78.md` | task #78「1:1 對照 w3x」的稽核報告 | #78 的預設立場被第〇·六守則推翻了 —— 它把 JASS/w3x 當真理，而那是第 3–5 層 |
| `_item-authoring-notes-full.md` | 寶具 authoringNote 全文（`item@1.authoringNote` 2000 字上限的溢位備份） —— ⛔ **這一份存在的理由：`authoringNote` 有 2000 字硬上限，而知識不可以因為一個字數限制無聲消失。** | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_kit-fidelity-audit-247.md` | 114 位英雄技能組・描述 vs 實作對帳清單 | 同一個 w3x 保真度年代的產物 |
| `_live-progress.md` | 即時進度看板 | 自稱「每有工作流回報就更新」，最後更新停在 **07-26**。已上線欄寫 v0.5.10（實際 v0.15.x）；「誠實覆蓋率 16.9%」今天是 100% |
| `_outstanding-20260802.md` | 08-02 的待辦帳本 | 自稱「當下的待辦帳本，不是歷史紀錄」，標題卻釘死 08-02。用 11 天前的 T0 清單覆蓋現在的優先序 |
| `_proportionality-owner-cell-20260819.md` | 退休：owner 2026-08-19 手填的相稱性那一格（範圍・極小 →「大」） —— owner 2026-08-20（GH#465 逐字裁決）： | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_range-tier-writeback.md` | 施法距離級距寫回前的原始 `range` 值（GH#414 / GH#438） —— owner 2026-08-19：「先把已有的那軸寫回去」。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_release-note-v0.18.1-superseded.md` | v0.18.1 release note —— **被取代的原始版本** —— ⚠️ **這一份是被取代的舊 body，⛔ 不是現行的 release note。** | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_retired-guards.md` | 退休的守衛 —— **被設計取代掉的斷言**住這裡 —— ⚠️ 這裡的東西是**另存**不是刪除。CLAUDE.md 第〇·六守則逐字： | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_semantic-role-markup-superseded.md` | 語意色彩標記（`descriptionRoles` / `[c=role]…[/c]`）—— 被取代的那一份知識 —— GH#757**（接手已關的 **#114**）· 定案 **2026-08-29** · 決定：**(a) 拆** | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_session-handoff-2026-07-24.md` | session 交接（07-24，系列最舊） | 接到 20 天前、11 個次版號以前的 v0.4.1 現場 |
| `_session-handoff-20260725.md` | session 交接（07-25） | 自陳是 temp/過渡文件。⚠️ §7 明文寫著兩個外洩憑證的值 —— 搬檔**不改變資安態勢**，真正的修法是輪替（GH#181） |
| `_session-handover-0731.md` | session 交接（07-31） | 以為部署卡在 ssh 私鑰、線上是 v0.9.15。⚠️ 搬移時已把 `_execution-batches.md` 的轉介路徑改掉 |
| `_session-handover-2026-07-29.md` | session 交接（07-29） | 兩次要求「下次開機第一件事：線上打一場」—— **直接違反現行守則**（owner 2026-08-09 已退掉手動打一場） |
| `_skill-mechanics-coverage-20260808.md` | 90 支重製技能 → 機制覆蓋矩陣 | 檔頭釘死查證 commit `8cfb22d3`，而**下一個** commit 就把 kinds 27→34、hooks 9→15。照它會判斷一堆「引擎做不到」而去繞路。現行權威是 `GET /capabilities` |
| `_superseded-rulings.md` | 被取代的 owner 裁決（存檔，⛔ 不要刪） —— ⭐ **測試可以跟著設計走，知識不可以無聲消失**（CLAUDE.md 第〇·六守則）。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_vfx-ability-art-authoring-notes.md` | 逐技能特效綁定 —— 搬家前的作者註記（GH#384） —— ⚠️ 這一份是**知識的備份**，⛔ 不是資料。資料在 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_vfx-fidelity-w3x.md` | w3x 特效保真度對照 | 「資料來源（權威順序）」逐條是 w3a / AbilityFunc.txt / war3map.j / w3u —— 定義上就是階梯第 3–5 層 |
| `_w3x-fidelity-superseded.md` | 被 owner 新版設計取代的原作數值 | 定義上就是「已被取代」。留著是因為知識不可以無聲消失 |
| `abilities_vfx_editor_readme.md` | 外部編輯器交接（2026-08-03 版） | 新版 `_codex-handoff.md`（08-12）的「必給三份」裡沒有它。照它交付的編輯器不知道五層階梯、不知道 `GET /capabilities` 才是權威 |
| `champions-before-attrgrowth-zero_temp_20260821-1543.tar.gz` | （.gz 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `tiering-proposal.md` | 英雄分級**提案**（08-11） | 自陳「本文件沒有動過任何 content/ 檔案」，而隔天裁決就落地了。把已決事項當待辦重開 |
| `transforms-before-attrgrowth-zero_temp_20260821-1622.tar.gz` | （.gz 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `五級距全轉_原始數值_20260821.tsv` | （.tsv 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `平衡數值決策建議-465改版前_temp_20260820-2034.md` | 平衡數值決策建議 —— 產生時間：2026-08-20 19:35（GMT+8） · `{用途}_temp_{timestamp}` 暫存檔，決策勾完就可以退休到 `docs/legacy/` | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `平衡數值決策建議-600落地前_temp_20260821-0020.md` | 平衡數值決策建議 —— 初版 2026-08-20 19:35 · **改版 2026-08-20 23:30**（GMT+8） · `{用途}_temp_{timestamp}` 暫存檔，勾完就退休到 `docs/legacy/` | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `平衡數值決策建議-錨點裁決前_temp_20260820-2319.md` | 平衡數值決策建議 —— 產生時間：2026-08-20 19:35（GMT+8） · `{用途}_temp_{timestamp}` 暫存檔，決策勾完就可以退休到 `docs/legacy/` | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `平衡數值決策建議_temp_20260820-1935_superseded-20260821.md` | 平衡數值決策建議 —— 最後更新 2026-08-21 00:20（GMT+8）** · 初版 2026-08-20 19:35 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `改進延遲.md` | 延遲改進計畫**第一版** | 第 1 行逐字「⛔⛔ 已廢棄 —— 不要參考這份文件 ⛔⛔」。現行版是 `docs/_延遲改進計畫.md`（雙向指認一致） |
| `效果標籤詞彙表.md` | 效果標籤詞彙表 **v1** | 已被 `docs/效果標籤詞彙表v2.md` 取代（v2 的檔頭自己就這樣寫） |
| `新英雄範本-Saber填入.md` | 新英雄填空表（Saber 填好的樣本） | 把 `godie-e002` 標成「與 `godie-e00l` 完全重複（#113 去重對象）」—— 而 #113 的裁決是 14 對**全部是本體↔變身態，一個都不能 dedup** |
| `新英雄範本-完整範例.md` | 新英雄填空表（帶範例） | 建議帶母體是 n=111，是 stat-normalization 上線**前**的原始分佈 |
| `新英雄範本.md` | 新英雄填空表（最早，07-25 12:22） | 寫「英雄編號 100 ← 目前最大 099」，而 100 已被佔用。編號是 JASS 對照的 join key，填錯是綁死的東西出錯 |
| `英雄屬性正規化提案.md` | 屬性正規化**提案**（初版） | 自己把權威讓出去：「三個整包方案在計畫書第二·五節，**先讀那一份**」。`config.stat-normalization@1` 已出貨 |
| `_ability-prose-before-placeholders_temp_2026082016403/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **326** 支技能、**393** 個 JSON、**67** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082016403/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082016462/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **327** 支技能、**394** 個 JSON、**67** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082016462/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082017032/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **18** 支技能、**33** 個 JSON、**2** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082017032/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082118304/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **1** 支技能、**2** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082118304/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082206082/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **1** 支技能、**1** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082206082/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082700284/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **3** 支技能、**6** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026082700284/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090606242/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **12** 支技能、**22** 個 JSON、**10** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090606242/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090606283/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **58** 支技能、**95** 個 JSON、**21** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090606283/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090606391/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **8** 支技能、**15** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090606391/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090606581/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **38** 支技能、**66** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090606581/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090608252/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **9** 支技能、**9** 個 JSON、**1** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090608252/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090610341/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **5** 支技能、**10** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090610341/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090709125/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **1** 支技能、**2** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090709125/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090710050/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **1** 支技能、**2** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090710050/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090921352/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **26** 支技能、**38** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090921352/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090921502/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **26** 支技能、**38** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090921502/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090922225/README.md` | 技能說明改成佔位符 —— 轉檔前的原文（說明推導（票號待開）） —— · 改寫 **12** 支技能、**12** 個 JSON、**0** 處產生器規格字串。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_ability-prose-before-placeholders_temp_2026090922225/descriptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/_vox/frieren.0_temp_20260822-0239_b5c924117e30bbe2.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/_vox/heavens-arena.0_temp_20260822-0239_64118f01b35f60d0.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/_vox/infinity-castle.0_temp_20260822-0237_d2c644bff4d29776.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/_vox/nazarick.0_temp_20260822-0238_57154d275f161665.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/_vox/world-tree.0_temp_20260822-0239_7afe3d36c559a82a.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/README.md` | BGM 版本備份 20260822-0235 —— owner 2026-08-22：「**舊的歌不要刪除，移到 legacy 備份就好 不要直接取代**」 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.castle.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.colosseum.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.dota.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.frieren.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.godie.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.heavens-arena.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.holy-grail.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.infinity-castle.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.nazarick.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.royale.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.shiganshina.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.skeleton.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/bgm/map.world-tree.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/vox/frieren.0.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/vox/heavens-arena.0.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/vox/holy-grail.0.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/vox/infinity-castle.0.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/vox/lines.json.committed` | （.committed 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/vox/lines.json.prev` | （.prev 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/vox/nazarick.0.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/vox/shiganshina.0.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/bgm_temp_20260822-0235/vox/world-tree.0.wav` | （.wav 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.castle/map.castle_temp_20260822-0306_53944a29e086c268.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.castle/map.castle_temp_20260822-0329_ab49ae1c84d009ce.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.castle/map.castle_temp_20260822-0340_12dbc18aac06828e.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.castle/map.castle_temp_20260822-0418_b61a6fce0f332ae7.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.colosseum/map.colosseum_temp_20260822-0330_59a39c646e63f193.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.colosseum/map.colosseum_temp_20260822-0419_a708d99a1c37026e.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.dota/map.dota_temp_20260822-0307_94dd80633a987f90.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.dota/map.dota_temp_20260822-0331_060ac728da77ca3f.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.dota/map.dota_temp_20260822-0420_ac0243274f2716ce.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.frieren/map.frieren_temp_20260822-0242_4c196f15d14935f5.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.frieren/map.frieren_temp_20260822-0303_35bb6685196a2d1a.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.frieren/map.frieren_temp_20260822-0321_0fb9e46fbad64da0.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.frieren/map.frieren_temp_20260822-0412_09acf8f69c2036f2.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.godie/map.godie_temp_20260822-0308_8801d931347bf83a.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.godie/map.godie_temp_20260822-0332_061f36b49a549442.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.godie/map.godie_temp_20260822-0421_77a0c785f73f41fe.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.heavens-arena/map.heavens-arena_temp_20260822-0242_08166a1fef285dfe.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.heavens-arena/map.heavens-arena_temp_20260822-0304_3bcd73c94e43a751.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.heavens-arena/map.heavens-arena_temp_20260822-0323_97d87925a62947eb.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.heavens-arena/map.heavens-arena_temp_20260822-0413_48bd578312a38d81.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.holy-grail/map.holy-grail_temp_20260822-0304_12a2bfef133b3bd3.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.holy-grail/map.holy-grail_temp_20260822-0324_b7f3e598bbff16c4.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.holy-grail/map.holy-grail_temp_20260822-0413_2e26e2afc7de759c.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.infinity-castle/map.infinity-castle_temp_20260822-0243_73653dd2f11c1ffe.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.infinity-castle/map.infinity-castle_temp_20260822-0305_e08ae77a5e978e12.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.infinity-castle/map.infinity-castle_temp_20260822-0325_62166e303f1e85a2.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.infinity-castle/map.infinity-castle_temp_20260822-0414_b4d01416d004da9d.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.nazarick/map.nazarick_temp_20260822-0244_9eed7ae1d21a2f82.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.nazarick/map.nazarick_temp_20260822-0326_91de01bbea4dd1b6.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.nazarick/map.nazarick_temp_20260822-0415_170c4c9ee326540c.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.royale/map.royale_temp_20260822-0307_bac3512b266bf177.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.royale/map.royale_temp_20260822-0335_36d70fca69009e04.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.royale/map.royale_temp_20260822-0423_2236ffc20461cafb.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.shiganshina/map.shiganshina_temp_20260822-0327_c5f8f6bd7ac7cac9.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.shiganshina/map.shiganshina_temp_20260822-0416_d151cdef95ad8b02.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.skeleton/map.skeleton_temp_20260822-0309_195e8bdf326a79ea.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.skeleton/map.skeleton_temp_20260822-0333_14b31d525247c016.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.skeleton/map.skeleton_temp_20260822-0352_5d7c1094fe5e2bdc.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.skeleton/map.skeleton_temp_20260822-0422_5da328aeb30477dc.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.world-tree/map.world-tree_temp_20260822-0244_ac0478fc9bb9387a.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.world-tree/map.world-tree_temp_20260822-0309_be3365b2ad89e72d.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.world-tree/map.world-tree_temp_20260822-0328_3d56ac069fa10c56.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_bgm-versions/map.world-tree/map.world-tree_temp_20260822-0417_e98d50e86826221f.mp3` | （.mp3 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/ember-rod.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/ember-rod.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00j.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00k.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00q.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e00z.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e012.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-e015.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ecen.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.q.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ekee.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ewrd.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h001.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h00w.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h00w.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h00w.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h00w.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h00w.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h00w.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h00w.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h021.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h022.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02y.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-h02z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-harf.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hblm.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hlgr.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-hpal.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i005.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i005.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i009.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i009.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i00y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i011.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i011.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i015.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i015.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i017.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i017.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i019.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i019.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01e.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01f.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i01z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i021.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i021.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i022.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i023.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i023.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i024.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i024.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i025.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i025.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i026.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i026.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i028.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i028.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i029.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i02z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i032.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i032.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i034.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i034.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i035.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i036.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i036.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i037.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i03z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i042.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i042.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i044.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04c.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i04y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i051.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i051.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i053.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i053.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i054.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i054.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i055.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i055.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i056.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i056.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i059.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i059.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i05y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i065.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i065.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i066.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i066.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i069.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i069.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i06b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i06b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i06m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i06m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i06p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i06p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i06r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-i06r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01b.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01b.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01b.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01b.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01b.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01b.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01b.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-n01l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-naka.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nbst.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nman.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-nplh.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-ntin.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o01z.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02n.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02o.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02s.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02v.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-o02w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-obla.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.r.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-opgh.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-oshd.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-othr.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u00b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u011.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u012.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-u01q.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-usyl.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/godie-uwar.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/ironhide-vest.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/ironhide-vest.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/serrated-edge.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/serrated-edge.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/swift-boots.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-orphan_temp_20260909-120955/swift-boots.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e001.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e002.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.e.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.r.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e007.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e008.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00j.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00k.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00l.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00n.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00q.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00r.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00s.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00t.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00u.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00v.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00w.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00x.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e00z.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e010.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e010.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e010.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e010.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e010.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e012.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-e015.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ecen.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.r.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-edem.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-efur.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.q.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ekee.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emfr.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-emns.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-etyr.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.e.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.r.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewar.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ewrd.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h001.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00l.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00w.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00w.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00w.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00w.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00w.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h00w.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01n.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01o.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h01u.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h020.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h021.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h022.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02k.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02r.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02s.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02u.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02v.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02y.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-h02z.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hapm.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-harf.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hart.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hblm.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hgam.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hjai.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hlgr.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpal.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hpb1.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-huth.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvsh.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.e.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-hvwd.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n003.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00b.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n00p.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01b.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01b.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01b.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01b.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01b.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01b.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01c.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01g.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-n01l.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-naka.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbbc.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nbst.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nman.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nplh.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-nsjs.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ntin.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00k.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00l.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o00x.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o01z.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02l.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02n.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02o.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02p.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02s.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02v.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o02w.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o030.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o030.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o030.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o030.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o030.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-o030.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-obla.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ofar.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogld.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ogrh.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.r.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-opgh.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-orkn.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-osam.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-oshd.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-othr.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00b.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.ex.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00h.w.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00j.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00k.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00l.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00n.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00o.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u00v.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u010.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u011.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u012.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01f.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u01u.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.r.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-u034.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.q.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ubal.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.r.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-ucrl.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udea.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-udre.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-umal.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-usyl.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uvng.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-uwar.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.ex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.ex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.passive.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.passive.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/godie-zombiex.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/sela.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/sela.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/sela.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/sela.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/sela.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/sela.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/sela.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/sela.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/thorne.e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/thorne.e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/thorne.q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/thorne.q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/thorne.r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/thorne.r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/thorne.w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/abilities/thorne.w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/aegis-surge.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/aegis-surge.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/arcane-focus.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/arcane-focus.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/arcane-haste.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/arcane-haste.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/arcane-overload.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/arcane-overload.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/berserkers-fury.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/berserkers-fury.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/blood-tyrant.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/blood-tyrant.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/bloodlet-ward.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/bloodlet-ward.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/bloodlust.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/bloodlust.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/bone-splitter.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/bone-splitter.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/chill-touch.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/chill-touch.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/conqueror.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/conqueror.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/executioner-edge.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/executioner-edge.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/frost-shatter.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/frost-shatter.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-01.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-01.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-02.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-02.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-03.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-03.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-04.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-04.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-05.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-05.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-06.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-06.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-07.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-07.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-08.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-08.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-09.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-09.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-10.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-10.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-11.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-11.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-12.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-12.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-13.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-13.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-14.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-14.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-14.webp.prev.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-15.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-15.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-16.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-16.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-17.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-17.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-17.webp.prev.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-18.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-18.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-19.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-19.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-20.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-a-20.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-01.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-01.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-02.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-02.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-03.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-03.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-04.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-04.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-05.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-05.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-06.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-06.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-06.webp.prev.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-07.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-07.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-08.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-08.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-09.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-09.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-10.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-10.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-11.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-11.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-11.webp.prev.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-12.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-12.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-13.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-13.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-14.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-14.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-15.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-15.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-16.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-16.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-17.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-17.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-18.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-18.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-19.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-19.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-20.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-c-20.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-01.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-01.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-02.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-02.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-03.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-03.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-04.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-04.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-04.webp.prev.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-05.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-05.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-06.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-06.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-07.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-07.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-08.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-08.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-09.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-09.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-10.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-10.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-11.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-11.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-12.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-12.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-13.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-13.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-14.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-14.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-15.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-15.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-16.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-16.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-17.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-17.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-18.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-18.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-19.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-19.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-20.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/grail-ex-20.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/guardian-ward.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/guardian-ward.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/hunters-instinct.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/hunters-instinct.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/immortal-bulwark.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/immortal-bulwark.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/iron-bulwark.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/iron-bulwark.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/last-stand.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/last-stand.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/limit-breaker.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/limit-breaker.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/momentum-core.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/momentum-core.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/overdrive-engine.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/overdrive-engine.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/phantom-step.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/phantom-step.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/second-wind.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/second-wind.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/siege-breaker.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/siege-breaker.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/soul-reaver.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/soul-reaver.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/spell-blade.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/spell-blade.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/storm-arrow.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/storm-arrow.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/swift-strikes.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/swift-strikes.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/titan-heart.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/titan-heart.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/vital-surge.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/vital-surge.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/void-hunger.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/augments/void-hunger.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e001.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e002.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e007.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e008.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00j.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00k.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00l.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00n.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00q.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00r.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00w.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00x.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e00z.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e010.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e012.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-e015.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ecen.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ecen.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-edem.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-efur.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-efur.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ekee.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ekee.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-emfr.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-emns.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-etyr.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ewar.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ewrd.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h001.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h00l.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h00w.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h01n.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h01o.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h01u.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h020.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h021.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h022.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02y.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-h02z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hapm.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-harf.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hart.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hblm.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hgam.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hgam.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hjai.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hlgr.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hpal.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hpb1.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-huth.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hvsh.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-hvwd.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-n003.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-n00b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-n00b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-n00p.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-n01b.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-n01c.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-n01g.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-n01l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-n01l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-naka.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-nbbc.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-nbst.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-nman.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-nplh.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-nsjs.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ntin.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o00k.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o00l.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o00x.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o01z.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o02l.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o02n.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o02o.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o02p.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o02s.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o02v.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o02w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o02w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-o030.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-obla.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-obla.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ofar.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ogld.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ogld.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ogrh.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-opgh.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-orkn.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-osam.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-oshd.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-othr.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00h.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00j.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00l.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00n.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00o.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u00v.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u010.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u011.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u012.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u01f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u01f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u01q.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u01u.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-u034.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ubal.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-ucrl.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-udea.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-udea.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-udre.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-umal.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-usyl.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-usyl.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-uvng.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-uwar.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-uwar.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-zombiex.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/godie-zombiex.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/sela.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/sela.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/thorne.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/champions/thorne.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/all-might-hair.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/all-might-hair.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/bezoar-of-the-apothecary.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/bezoar-of-the-apothecary.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/book-of-gospel.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/book-of-gospel.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/bulwark-charge-greaves.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/bulwark-charge-greaves.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/cleaver-of-the-warden.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/cleaver-of-the-warden.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/collar-of-the-deadly-soul.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/collar-of-the-deadly-soul.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/ember-rod.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/ember-rod.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/endless-edge.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/fingerless-gloves.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/fingerless-gloves.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/gantz-suit.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/gantz-suit.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i000.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i000.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i001.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i001.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i002.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i002.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i003.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i003.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i004.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i004.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i005.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i005.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i006.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i006.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i007.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i007.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i008.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i008.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i009.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i009.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00d.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00d.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i00z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i010.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i010.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i011.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i011.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i012.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i012.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i013.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i013.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i014.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i014.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i015.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i015.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i016.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i016.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i017.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i017.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i018.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i018.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i019.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i019.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01d.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01d.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01e.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01f.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i01z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i020.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i020.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i021.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i021.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i022.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i023.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i023.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i024.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i024.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i025.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i025.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i026.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i026.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i027.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i027.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i028.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i028.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i029.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02d.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i02z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i030.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i030.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i031.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i031.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i032.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i032.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i033.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i033.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i034.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i034.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i035.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i036.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i036.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i037.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i038.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i038.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i039.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i039.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03d.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03d.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i03z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i040.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i040.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i041.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i041.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i042.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i042.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i044.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i045.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i049.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i049.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04b.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04c.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04d.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i04y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i051.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i051.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i053.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i053.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i054.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i054.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i055.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i055.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i056.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i056.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i059.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i059.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i05z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i060.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i060.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i061.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i061.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i062.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i062.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i063.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i063.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i065.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i065.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i066.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i066.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i067.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i067.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i068.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i068.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i069.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i069.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06d.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06k.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/godie-i06s.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/gravity-sword-black-rod.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/gravity-sword-black-rod.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/grief-seed.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/grief-seed.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/icha-icha-paradise.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/icha-icha-paradise.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/ironhide-vest.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/ironhide-vest.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/lance-kongotetsu.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/lance-kongotetsu.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/legendary-orb.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/legendary-orb.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/magic-armor-type-zero.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/magic-armor-type-zero.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/master-ball.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/master-ball.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/meat-cleaver.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/meat-cleaver.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/meteor-ring.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/meteor-ring.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/millennium-puzzle.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/millennium-puzzle.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/mystery-scrap-of-paper.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/mystery-scrap-of-paper.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/nezuko-box.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/nezuko-box.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/odm-gear.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/odm-gear.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/pale-moon-requiem-crown.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/pale-moon-requiem-crown.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/piercer-crossbow.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/piercer-crossbow.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/red-comet-mask.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/red-comet-mask.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/sage-ward-amulet.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/sage-ward-amulet.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/sasumata.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/sasumata.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/scouter.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/scouter.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/senzu-bean.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/senzu-bean.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/serrated-edge.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/serrated-edge.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/shining-golden-orbs.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/shining-golden-orbs.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/slime-suit.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/slime-suit.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/soul-eater.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/soul-eater.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/soul-gem.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/soul-gem.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/spear-of-lightning.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/spear-of-lightning.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/staff-of-ainz-ooal-gown.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/staff-of-ainz-ooal-gown.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/stat-attunement.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/stat-attunement.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/stone-mask.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/stone-mask.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/swift-boots.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/swift-boots.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/teardrop-of-rebirth.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/teardrop-of-rebirth.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/torch-master.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/torch-master.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/touyako.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/touyako.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/ultimate-mod-shiranui.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/ultimate-mod-shiranui.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/usagizuki-twin-crescents.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/items/usagizuki-twin-crescents.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-prefate_temp_20260909-0317/shop/traveling-merchant.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/manifest.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-e00s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-e00s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-e00t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-e00t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-e00u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-e00u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-e00v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-e00v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-ecen.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-ecen.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-efur.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-efur.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-ekee.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-ekee.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-h02z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-hgam.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-hgam.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-n00b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-n00b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-n01l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-n01l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-o02w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-o02w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-obla.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-obla.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-ogld.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-ogld.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-u00b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-u00b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-u00k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-u00k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-u01f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-u01f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-udea.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-udea.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-usyl.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-usyl.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-uwar.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/godie-uwar.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/sela.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/sela.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/thorne.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/champions/thorne.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/ember-rod.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/ember-rod.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i000.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i000.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i001.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i001.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i002.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i002.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i003.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i003.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i004.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i004.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i005.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i005.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i006.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i006.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i007.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i007.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i008.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i008.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i009.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i009.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00d.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00d.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i00z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i010.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i010.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i011.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i011.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i012.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i012.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i013.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i013.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i014.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i014.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i015.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i015.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i016.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i016.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i017.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i017.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i018.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i018.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i019.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i019.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01d.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01d.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i01z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i020.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i020.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i021.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i021.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i023.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i023.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i024.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i024.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i025.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i025.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i026.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i026.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i027.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i027.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i028.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i028.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i02z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i030.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i030.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i031.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i031.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i032.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i032.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i033.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i033.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i034.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i034.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i036.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i036.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i038.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i038.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i039.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i039.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03d.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03d.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03p.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03p.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i03z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i040.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i040.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i041.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i041.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i042.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i042.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i049.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i049.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i04y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i051.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i051.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i053.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i053.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i054.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i054.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i055.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i055.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i056.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i056.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i059.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i059.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05k.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05k.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05s.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05s.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05t.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05t.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05u.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05u.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05v.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05v.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05w.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05w.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05x.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05x.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05y.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05y.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05z.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i05z.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i060.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i060.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i061.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i061.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i062.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i062.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i063.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i063.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i066.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i066.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i067.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i067.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i068.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i068.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i069.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i069.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06a.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06a.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06b.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06b.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06c.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06c.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06e.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06e.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06f.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06f.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06g.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06g.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06h.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06h.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06i.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06i.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06j.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06j.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06l.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06l.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06m.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06m.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06n.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06n.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06o.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06o.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06q.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06q.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06r.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/godie-i06r.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/ironhide-vest.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/ironhide-vest.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/legendary-orb.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/legendary-orb.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/serrated-edge.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/serrated-edge.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/stat-attunement.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/stat-attunement.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/swift-boots.webp` | （.webp 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_icons-twopass-v1_temp_20260909-152227/items/swift-boots.webp.method` | （.method 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_retired-chains/role-markup-114.md` | 語意色彩鏈（role markup, task #114）—— **2026-09-03 拆除**（GH#757） —— ⭐ 為什麼拆：整條鏈**蓋好了、接上 UI 了、schema 開好欄位了，而內容端是零**，兩個月沒有變。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_retired-ui/AbilityDescriptionOverlay.tsx.retired-20260822` | （.retired-20260822 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_retired-ui/README.md` | 退休的 UI 元件 —— ⭐ owner 2026-08-22（逐字）： | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_temp-retired/技能正規化計畫_temp_20260821-0258.md` | 技能正規化計畫 —— 420 支一趟算完 —— ⚙️ 這一份是 `pnpm tsx tools/skill-normalize/plan.ts` **產生的**。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `code/apps/game-server/src/match/__autoattack_probe.test.ts` | 自動攻擊調查用的探測檔（同上） | 180 行、唯一的 expect 是夾具健檢。接班守衛 `autoAcquireWhileMoving.test.ts`（25 個 expect）已經很厚 |
| `code/apps/game-server/src/match/__mana_probe.test.ts` | 魔力倍率調查用的探測檔（原 `apps/game-server/src/match/`） | 267 行、`expect(` **0 次**、`console.log` 8 次 —— 永遠不會紅，卻把「跑一場真比賽」掛在每次 pnpm test 上 |
| `code/apps/game-server/src/match/__pacing_probe.test.ts` | 回合節奏 TTK 傾印（同上） | 39 行、`expect(` **0 次**。結論已寫進 docs，回合節奏改由 config 驅動 |
| `code/tools/model-budget/optimize/_decim-test.mjs` | meshopt 減面參數探測（07-22，原 `tools/model-budget/optimize/`） | ⚠️ 它**會真的寫出一個 glb** —— 有人拿它順手減模型就會產出沒走出貨路徑的資產。出貨的是 `decimate.mjs` |
| `code/tools/model-budget/optimize/_decim-test2.mjs` | 上一支的第二版（同上） | 同一支探測腳本留了兩代，**兩代都不是出貨的那一支** |
| `code/tools/model-budget/optimize/_diag.mjs` | glb 統計傾印 + error 掃描（同上） | 它算三角形只認 `mode===4`，隔壁那支還處理 5/6 —— 同一個資料夾兩支對「幾個三角形」給不同答案 |
| `code/tools/model-budget/optimize/_weldtest.mjs` | weld tolerance 掃描（同上） | **沒有結論**的掃描腳本 —— 跑出來是一張數字表，檔案裡沒有一行說最後選了哪一格 |
| `code/tools/w3x-import/mesh_audit.mjs` | `mesh_audit.mts` 的 tsc 編譯產物（原 `tools/w3x-import/`） | 專案一律用 tsx 直接跑 `.mts`。改到 `.mjs` 那份＝改了一個沒有人執行的檔案（靜默無效） |
| `code/tools/w3x-import/mesh_audit.mjs.map` | 上一項的 sourcemap | 決定性證據：第一行 `"sources":["mesh_audit.mts"]` |
| `code/tools/w3x-import/validate_glb.mjs` | `validate_glb.mts` 的 tsc 編譯產物（同上） | ⛔ **`.mts` 是活的出貨工具**（`package.json` 的 `validate:glb` 真的在跑它），這裡歸檔的只有編譯殘留 |
| `code/tools/w3x-import/validate_glb.mjs.map` | 上一項的 sourcemap | 同上 |
| `shard-baseline_temp/baseline.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |

---

## `content/_legacy/` —— 440 檔

**下架的內容文件** —— 英雄、技能、**道具**、config。「消失 ≠ 歸檔」：白名單移除的東西要真的躺在這裡

**下架的內容文件**。它們不是「規格過期」，是「這一支不再出貨」——`invulnerableBinding.test.ts` 逐字釘著「**消失 ≠ 歸檔**」：白名單上不再出貨的，必須真的躺在這裡而不是憑空不見。⚠️ 有 6 支以上的活測試會讀這個目錄，⛔ 不要清空。

⭐ **目錄位置本身就是宣告**（owner 2026-08-18：「不應該再出現在現有任何文件上或讓任何 script 浪費算力處理」）。`content/_legacy/` 不在 `COLLECTION_NAMES` 裡，所以 `pnpm content:build`、`bundle.json`、每一支 `content/<collection>/` 逐檔掃描的產生器（`gen_overview.ts` / `gen_spec.ts` / `gen_reference.py` / `gen_readme_lists.py`）與後台的道具清單**全部自動看不到它們** —— ⛔ 沒有任何一份「要跳過哪些 id」的硬編名單，那會是第四個住處，必然過期。

### `abilities/` （276 檔）

| 檔案 | 是什麼 |
|---|---|
| `godie-e00j.e.json` | 技能「95-03 皇者戰氣第五十重天」，槽位 E |
| `godie-e00j.ex.json` | 技能「95-002 固有結界-和諧世界」，槽位 EX |
| `godie-e00j.passive.json` | 技能「95-00 紅色龍氣」，槽位 PASSIVE |
| `godie-e00j.q.json` | 技能「95-01 謝謝指教」，槽位 Q |
| `godie-e00j.r.json` | 技能「95-04 藍色戰氣一百重天」，槽位 R |
| `godie-e00j.w.json` | 技能「95-02 大和戰氣」，槽位 W |
| `godie-e00k.e.json` | 技能「19-03 瞬切百殺」，槽位 E |
| `godie-e00k.ex.json` | 技能「19-002 紫色披風」，槽位 EX |
| `godie-e00k.passive.json` | 技能「19-00 閃擊」，槽位 PASSIVE |
| `godie-e00k.q.json` | 技能「19-01 斷末」，槽位 Q |
| `godie-e00k.r.json` | 技能「19-04 幻影暗殺」，槽位 R |
| `godie-e00k.w.json` | 技能「19-02 迴切」，槽位 W |
| `godie-e00q.e.json` | 技能「69-03 約束與勝利之劍」，槽位 E |
| `godie-e00q.ex.json` | 技能「69-002 固有結界-黑洞」，槽位 EX |
| `godie-e00q.passive.json` | 技能「69-001 黑化之力」，槽位 PASSIVE |
| `godie-e00q.q.json` | 技能「69-01 力量強化」，槽位 Q |
| `godie-e00q.r.json` | 技能「69-04 魔力增幅」，槽位 R |
| `godie-e00q.w.json` | 技能「69-02 黑泥召喚」，槽位 W |
| `godie-e00t.e.json` | 技能「66-03 七夜怪談」，槽位 E |
| `godie-e00t.ex.json` | 技能「66-002 死亡漫延」，槽位 EX |
| `godie-e00t.passive.json` | 技能「66-00 恐懼」，槽位 PASSIVE |
| `godie-e00t.q.json` | 技能「66-01 靈體化」，槽位 Q |
| `godie-e00t.r.json` | 技能「66-04  靈壓震撼」，槽位 R |
| `godie-e00t.w.json` | 技能「66-02 驚駭」，槽位 W |
| `godie-e00u.e.json` | 技能「none」，槽位 E |
| `godie-e00u.passive.json` | 技能「44-00 機警」，槽位 PASSIVE |
| `godie-e00u.q.json` | 技能「none」，槽位 Q |
| `godie-e00u.r.json` | 技能「none」，槽位 R |
| `godie-e00u.w.json` | 技能「none」，槽位 W |
| `godie-e00v.e.json` | 技能「84-03 蜜汁」，槽位 E |
| `godie-e00v.ex.json` | 技能「84-002 我只想確定你在這裡」，槽位 EX |
| `godie-e00v.passive.json` | 技能「84-00 熊巴巴」，槽位 PASSIVE |
| `godie-e00v.q.json` | 技能「84-01 冷笑話」，槽位 Q |
| `godie-e00v.r.json` | 技能「84-04 給我蜂蜜」，槽位 R |
| `godie-e00v.w.json` | 技能「84-02 保齡球」，槽位 W |
| `godie-e00z.e.json` | 技能「19-03 瞬切百殺」，槽位 E |
| `godie-e00z.ex.json` | 技能「19-002 紫色披風」，槽位 EX |
| `godie-e00z.passive.json` | 技能「19-00 閃擊」，槽位 PASSIVE |
| `godie-e00z.q.json` | 技能「19-01 斷末」，槽位 Q |
| `godie-e00z.r.json` | 技能「19-04 幻影暗殺」，槽位 R |
| `godie-e00z.w.json` | 技能「19-02 迴切」，槽位 W |
| `godie-e012.e.json` | 技能「47-03 九頭龍閃」，槽位 E |
| `godie-e012.passive.json` | 技能「47-00 龍搥閃」，槽位 PASSIVE |
| `godie-e012.q.json` | 技能「47-01 飛龍閃」，槽位 Q |
| `godie-e012.r.json` | 技能「47-04 天翔龍閃」，槽位 R |
| `godie-e012.w.json` | 技能「47-02 神速」，槽位 W |
| `godie-e015.e.json` | 技能「94-03 珍奶顏射」，槽位 E |
| `godie-e015.ex.json` | 技能「94-002 歹戲拖棚」，槽位 EX |
| `godie-e015.passive.json` | 技能「94-00 恰恰~」，槽位 PASSIVE |
| `godie-e015.q.json` | 技能「94-01 北斗爆橘拳」，槽位 Q |
| `godie-e015.r.json` | 技能「94-04 賣扣~~」，槽位 R |
| `godie-e015.w.json` | 技能「94-02 橘山斬空破」，槽位 W |
| `godie-ecen.e.json` | 技能「64-03 工廠機器人」，槽位 E |
| `godie-ecen.ex.json` | 技能「64-002 魔幻嘉年華」，槽位 EX |
| `godie-ecen.passive.json` | 技能「64-00 開瓶特技」，槽位 PASSIVE |
| `godie-ecen.q.json` | 技能「64-01 威士忌攻擊」，槽位 Q |
| `godie-ecen.r.json` | 技能「64-04 魔幻浮水印」，槽位 R |
| `godie-ecen.w.json` | 技能「64-02 酒釀精華」，槽位 W |
| `godie-ekee.e.json` | 技能「93-03 這次考試很簡單」，槽位 E |
| `godie-ekee.ex.json` | 技能「93-002 二一」，槽位 EX |
| `godie-ekee.passive.json` | 技能「93-00 小考」，槽位 PASSIVE |
| `godie-ekee.q.json` | 技能「93-01 期末報告」，槽位 Q |
| `godie-ekee.r.json` | 技能「93-04 當掉」，槽位 R |
| `godie-ekee.w.json` | 技能「93-02 抽點名」，槽位 W |
| `godie-ewrd.e.json` | 技能「17-03 空破圓斬」，槽位 E |
| `godie-ewrd.ex.json` | 技能「17-002 天照龍門」，槽位 EX |
| `godie-ewrd.passive.json` | 技能「17-00 右腕焰增」，槽位 PASSIVE |
| `godie-ewrd.q.json` | 技能「17-01 鬼-真夜」，槽位 Q |
| `godie-ewrd.r.json` | 技能「17-04 狂龍斬」，槽位 R |
| `godie-ewrd.w.json` | 技能「17-02 殺無真空斬」，槽位 W |
| `godie-h001.e.json` | 技能「41-03 召喚術」，槽位 E |
| `godie-h001.ex.json` | 技能「41-002 絕對屏障」，槽位 EX |
| `godie-h001.passive.json` | 技能「41-00 木乃伊的詛咒」，槽位 PASSIVE |
| `godie-h001.q.json` | 技能「41-01 吸血鬼之吻」，槽位 Q |
| `godie-h001.r.json` | 技能「41-04 究極魔法流星雨」，槽位 R |
| `godie-h001.w.json` | 技能「41-02 地裂術」，槽位 W |
| `godie-h00w.e.json` | 技能「26-03 熱血」，槽位 E |
| `godie-h00w.ex.json` | 技能「26-002 鄉民的正義」，槽位 EX |
| `godie-h00w.passive.json` | 技能「26-00 吃洨火鍋」，槽位 PASSIVE |
| `godie-h00w.q.json` | 技能「26-01 腳底按摩」，槽位 Q |
| `godie-h00w.r.json` | 技能「26-04 開天闢地‧洨者聖臨」，槽位 R |
| `godie-h00w.w.json` | 技能「26-02 亂入」，槽位 W |
| `godie-h021.e.json` | 技能「05-03 及喀爾度」，槽位 E |
| `godie-h021.passive.json` | 技能「05-00 啦嗚薩喀爾」，槽位 PASSIVE |
| `godie-h021.q.json` | 技能「05-01 薩喀爾」，槽位 Q |
| `godie-h021.r.json` | 技能「05-04 巴歐．薩喀爾嘎」，槽位 R |
| `godie-h021.w.json` | 技能「05-02 薩喀爾嘎」，槽位 W |
| `godie-h022.e.json` | 技能「82-03 雷之投擲」，槽位 E |
| `godie-h022.ex.json` | 技能「82-001 太陰道-敵彈吸收陣」，槽位 EX |
| `godie-h022.passive.json` | 技能「82-00 天生法術書」，槽位 PASSIVE |
| `godie-h022.q.json` | 技能「82-01 雷之斧」，槽位 Q |
| `godie-h022.r.json` | 技能「82-04 闇之魔法」，槽位 R |
| `godie-h022.w.json` | 技能「82-02 虛空瞬動」，槽位 W |
| `godie-h02n.e.json` | 技能「none」，槽位 E |
| `godie-h02n.q.json` | 技能「none」，槽位 Q |
| `godie-h02n.r.json` | 技能「none」，槽位 R |
| `godie-h02n.w.json` | 技能「none」，槽位 W |
| `godie-h02s.e.json` | 技能「91-03 碎心打擊」，槽位 E |
| `godie-h02s.ex.json` | 技能「91-002 亡靈大軍」，槽位 EX |
| `godie-h02s.passive.json` | 技能「91-00 符文鍛造 - 墮落十字軍符文」，槽位 PASSIVE |
| `godie-h02s.q.json` | 技能「91-01 死亡之握」，槽位 Q |
| `godie-h02s.r.json` | 技能「91-04 血魄暴噬」，槽位 R |
| `godie-h02s.w.json` | 技能「91-02 疫病」，槽位 W |
| `godie-h02y.e.json` | 技能「97-03 弱肉強食」，槽位 E |
| `godie-h02y.ex.json` | 技能「97-002 終極秘劍-火產靈神」，槽位 EX |
| `godie-h02y.passive.json` | 技能「35-00 召喚佩」，槽位 PASSIVE |
| `godie-h02y.q.json` | 技能「97-01 壹之秘劍-焰靈」，槽位 Q |
| `godie-h02y.r.json` | 技能「97-04 終極秘劍-火產靈神」，槽位 R |
| `godie-h02y.w.json` | 技能「97-02 貳之秘劍-紅蓮腕」，槽位 W |
| `godie-h02z.e.json` | 技能「91-03 碎心打擊」，槽位 E |
| `godie-h02z.ex.json` | 技能「91-002 亡靈大軍」，槽位 EX |
| `godie-h02z.passive.json` | 技能「91-00 符文鍛造 - 墮落十字軍符文」，槽位 PASSIVE |
| `godie-h02z.q.json` | 技能「91-01 死亡之握」，槽位 Q |
| `godie-h02z.r.json` | 技能「91-04 血魄暴噬」，槽位 R |
| `godie-h02z.w.json` | 技能「91-02 疫病」，槽位 W |
| `godie-harf.e.json` | 技能「26-03 熱血」，槽位 E |
| `godie-harf.ex.json` | 技能「26-002 鄉民的正義」，槽位 EX |
| `godie-harf.passive.json` | 技能「26-00 吃洨火鍋」，槽位 PASSIVE |
| `godie-harf.q.json` | 技能「26-01 腳底按摩」，槽位 Q |
| `godie-harf.r.json` | 技能「26-04 開天闢地‧洨者聖臨」，槽位 R |
| `godie-harf.w.json` | 技能「26-02 亂入」，槽位 W |
| `godie-hblm.e.json` | 技能「05-03 及喀爾度」，槽位 E |
| `godie-hblm.ex.json` | 技能「05-002 金色巨龍」，槽位 EX |
| `godie-hblm.passive.json` | 技能「05-00 啦嗚薩喀爾」，槽位 PASSIVE |
| `godie-hblm.q.json` | 技能「05-01 薩喀爾」，槽位 Q |
| `godie-hblm.r.json` | 技能「05-04 巴歐．薩喀爾嘎」，槽位 R |
| `godie-hblm.w.json` | 技能「05-02 薩喀爾嘎」，槽位 W |
| `godie-hlgr.e.json` | 技能「03-03 鯨式電漿光束炮」，槽位 E |
| `godie-hlgr.ex.json` | 技能「03-001 龍騎兵」，槽位 EX |
| `godie-hlgr.passive.json` | 技能「03-00 相轉移裝甲」，槽位 PASSIVE |
| `godie-hlgr.q.json` | 技能「03-02 詭雷」，槽位 Q |
| `godie-hlgr.r.json` | 技能「03-04 全彈發射」，槽位 R |
| `godie-hlgr.w.json` | 技能「03-01 磁軌砲」，槽位 W |
| `godie-hpal.e.json` | 技能「35-03 鏡蠱」，槽位 E |
| `godie-hpal.ex.json` | 技能「35-002 出來吧!全部的魔獸」，槽位 EX |
| `godie-hpal.passive.json` | 技能「35-00 召喚佩」，槽位 PASSIVE |
| `godie-hpal.q.json` | 技能「35-01 土爪」，槽位 Q |
| `godie-hpal.r.json` | 技能「35-04 光牙」，槽位 R |
| `godie-hpal.w.json` | 技能「35-02 石絲」，槽位 W |
| `godie-n01b.e.json` | 技能「40-03 萬解-貓王胖虎」，槽位 E |
| `godie-n01b.ex.json` | 技能「40-002 環繞音響」，槽位 EX |
| `godie-n01b.passive.json` | 技能「40-00 我~是~孩~子~王~」，槽位 PASSIVE |
| `godie-n01b.q.json` | 技能「40-01 威脅之拳」，槽位 Q |
| `godie-n01b.r.json` | 技能「40-04 地獄搖滾」，槽位 R |
| `godie-n01b.w.json` | 技能「40-02 必殺！爆熱神音！」，槽位 W |
| `godie-n01l.e.json` | 技能「98-03 從過去中學習」，槽位 E |
| `godie-n01l.ex.json` | 技能「98-002 夢想前程的彼方」，槽位 EX |
| `godie-n01l.passive.json` | 技能「98-00 正妹優勢」，槽位 PASSIVE |
| `godie-n01l.q.json` | 技能「98-01 理財的習慣」，槽位 Q |
| `godie-n01l.r.json` | 技能「98-04 自在飛翔」，槽位 R |
| `godie-n01l.w.json` | 技能「98-02 平易近人的笑容」，槽位 W |
| `godie-naka.e.json` | 技能「27-03 忍法千變萬化之刀」，槽位 E |
| `godie-naka.ex.json` | 技能「27-002 祕法-霧隱分身之術」，槽位 EX |
| `godie-naka.passive.json` | 技能「27-00 永久性的隱形術」，槽位 PASSIVE |
| `godie-naka.q.json` | 技能「27-01 忍法風魔手裡劍」，槽位 Q |
| `godie-naka.r.json` | 技能「27-04 忍法暗殺奧義-飛燕閃」，槽位 R |
| `godie-naka.w.json` | 技能「27-02 忍法鬼穿刺」，槽位 W |
| `godie-nbst.e.json` | 技能「24-03 變態絕技悶絕地獄車」，槽位 E |
| `godie-nbst.ex.json` | 技能「24-002 來~快點吃吧」，槽位 EX |
| `godie-nbst.passive.json` | 技能「24-00 SM派對」，槽位 PASSIVE |
| `godie-nbst.q.json` | 技能「24-01 這是我的豆皮壽司」，槽位 Q |
| `godie-nbst.r.json` | 技能「24-04 內褲變身」，槽位 R |
| `godie-nbst.w.json` | 技能「24-02 變態根性」，槽位 W |
| `godie-nman.e.json` | 技能「40-03 萬解-貓王胖虎」，槽位 E |
| `godie-nman.ex.json` | 技能「40-002 環繞音響」，槽位 EX |
| `godie-nman.passive.json` | 技能「40-00 我~是~孩~子~王~」，槽位 PASSIVE |
| `godie-nman.q.json` | 技能「40-01 威脅之拳」，槽位 Q |
| `godie-nman.r.json` | 技能「40-04 地獄搖滾」，槽位 R |
| `godie-nman.w.json` | 技能「40-02 必殺！爆熱神音！」，槽位 W |
| `godie-nplh.e.json` | 技能「16-04 劍之精靈」，槽位 E |
| `godie-nplh.ex.json` | 技能「16-002 布都御魂」，槽位 EX |
| `godie-nplh.passive.json` | 技能「16-00 通靈能力」，槽位 PASSIVE |
| `godie-nplh.q.json` | 技能「16-03 無無明亦無」，槽位 Q |
| `godie-nplh.r.json` | 技能「16-02 阿彌陀流真空佛陀斬」，槽位 R |
| `godie-nplh.w.json` | 技能「16-01 超．占事略決」，槽位 W |
| `godie-ntin.e.json` | 技能「23-03 雷牙一閃˙雷牙烈霸」，槽位 E |
| `godie-ntin.ex.json` | 技能「23-002 雙刀模式」，槽位 EX |
| `godie-ntin.passive.json` | 技能「23-00 雷光枷鎖」，槽位 PASSIVE |
| `godie-ntin.q.json` | 技能「23-01 電離光槍 - 繁星飛躍」，槽位 Q |
| `godie-ntin.r.json` | 技能「23-04 雷焰聖劍」，槽位 R |
| `godie-ntin.w.json` | 技能「23-02 超音型態」，槽位 W |
| `godie-o01z.e.json` | 技能「81-03 Divine Buster Extention」，槽位 E |
| `godie-o01z.ex.json` | 技能「81-002 Exellion Mode」，槽位 EX |
| `godie-o01z.passive.json` | 技能「81-00 守護之光」，槽位 PASSIVE |
| `godie-o01z.q.json` | 技能「81-01 Barrel Shot」，槽位 Q |
| `godie-o01z.r.json` | 技能「81-04 Starlight Breaker Plus」，槽位 R |
| `godie-o01z.w.json` | 技能「81-02 Acxel Shooter」，槽位 W |
| `godie-o02n.e.json` | 技能「87-03 天下號令」，槽位 E |
| `godie-o02n.passive.json` | 技能「87-00 虛空碎靈」，槽位 PASSIVE |
| `godie-o02n.q.json` | 技能「87-01 大紅蓮斬」，槽位 Q |
| `godie-o02n.r.json` | 技能「87-04 逆我必殺」，槽位 R |
| `godie-o02n.w.json` | 技能「87-02 霸體」，槽位 W |
| `godie-o02o.e.json` | 技能「87-03 天下號令」，槽位 E |
| `godie-o02o.passive.json` | 技能「87-00 虛空碎靈」，槽位 PASSIVE |
| `godie-o02o.q.json` | 技能「87-01 大紅蓮斬」，槽位 Q |
| `godie-o02o.r.json` | 技能「87-04 逆我必殺」，槽位 R |
| `godie-o02o.w.json` | 技能「87-02 霸體」，槽位 W |
| `godie-o02s.e.json` | 技能「53-04 暴爆咒」，槽位 E |
| `godie-o02s.passive.json` | 技能「53-00 空間穿梭」，槽位 PASSIVE |
| `godie-o02s.q.json` | 技能「53-02 強化炸彈陣」，槽位 Q |
| `godie-o02s.r.json` | 技能「53-03 破法對咒」，槽位 R |
| `godie-o02s.w.json` | 技能「53-01 獸王牙操彈」，槽位 W |
| `godie-o02v.e.json` | 技能「81-03 Divine Buster Extention」，槽位 E |
| `godie-o02v.ex.json` | 技能「81-002 Exellion Mode」，槽位 EX |
| `godie-o02v.passive.json` | 技能「81-00 守護之光」，槽位 PASSIVE |
| `godie-o02v.q.json` | 技能「81-01 Barrel Shot」，槽位 Q |
| `godie-o02v.r.json` | 技能「81-04 Starlight Breaker Plus」，槽位 R |
| `godie-o02v.w.json` | 技能「81-02 Acxel Shooter」，槽位 W |
| `godie-o02w.e.json` | 技能「96-03 吸星大法」，槽位 E |
| `godie-o02w.ex.json` | 技能「96-002 易筋經」，槽位 EX |
| `godie-o02w.passive.json` | 技能「96-00 天香斷續膠」，槽位 PASSIVE |
| `godie-o02w.q.json` | 技能「96-01 華山劍法」，槽位 Q |
| `godie-o02w.r.json` | 技能「96-04 獨孤九劍」，槽位 R |
| `godie-o02w.w.json` | 技能「96-02 混元掌」，槽位 W |
| `godie-obla.e.json` | 技能「33-03 地道突襲」，槽位 E |
| `godie-obla.ex.json` | 技能「33-001 喝了再上」，槽位 EX |
| `godie-obla.passive.json` | 技能「33-00 砍樹」，槽位 PASSIVE |
| `godie-obla.q.json` | 技能「33-01 放山雞」，槽位 Q |
| `godie-obla.r.json` | 技能「33-04 動物拳法」，槽位 R |
| `godie-obla.w.json` | 技能「33-02 吃完的口香糖」，槽位 W |
| `godie-opgh.e.json` | 技能「32-03 閃光龍牙」，槽位 E |
| `godie-opgh.ex.json` | 技能「32-002 見龍卸甲」，槽位 EX |
| `godie-opgh.passive.json` | 技能「32-00 青龍槍術」，槽位 PASSIVE |
| `godie-opgh.q.json` | 技能「32-01 一騎槍閃」，槽位 Q |
| `godie-opgh.r.json` | 技能「32-04 狂龍霸體」，槽位 R |
| `godie-opgh.w.json` | 技能「32-02 橫掃千軍」，槽位 W |
| `godie-oshd.e.json` | 技能「29-03 有功夫無懦夫」，槽位 E |
| `godie-oshd.ex.json` | 技能「29-002 慢著!來人餵公子吃餅」，槽位 EX |
| `godie-oshd.passive.json` | 技能「29-00 開設雜貨店」，槽位 PASSIVE |
| `godie-oshd.q.json` | 技能「29-01 鐵砂掌」，槽位 Q |
| `godie-oshd.r.json` | 技能「29-04 電光毒龍鑽」，槽位 R |
| `godie-oshd.w.json` | 技能「29-02 鬼王流星雨」，槽位 W |
| `godie-othr.e.json` | 技能「31-03 野性的呼喚」，槽位 E |
| `godie-othr.ex.json` | 技能「31-002 武士之魂」，槽位 EX |
| `godie-othr.passive.json` | 技能「31-00 再生能力」，槽位 PASSIVE |
| `godie-othr.q.json` | 技能「31-01 迴旋爪擊」，槽位 Q |
| `godie-othr.r.json` | 技能「31-04 不要踢我蛋蛋」，槽位 R |
| `godie-othr.w.json` | 技能「31-02 重爪擊」，槽位 W |
| `godie-u00b.e.json` | 技能「75-02 龍捲風」，槽位 E |
| `godie-u00b.passive.json` | 技能「75-00 戰鬥之歌」，槽位 PASSIVE |
| `godie-u00b.q.json` | 技能「75-01 超．祕技略決」，槽位 Q |
| `godie-u00b.r.json` | 技能「75-03 暴雷無限刃」，槽位 R |
| `godie-u00b.w.json` | 技能「75-02 幻影鬥氣」，槽位 W |
| `godie-u011.e.json` | 技能「61-03 打屁股風林火豬」，槽位 E |
| `godie-u011.ex.json` | 技能「61-002 惡魔吉他」，槽位 EX |
| `godie-u011.passive.json` | 技能「61-00百連我殺」，槽位 PASSIVE |
| `godie-u011.q.json` | 技能「61-01惡魔球」，槽位 Q |
| `godie-u011.r.json` | 技能「61-04 瘋狂怪物」，槽位 R |
| `godie-u011.w.json` | 技能「61-02 霸獸盔甲」，槽位 W |
| `godie-u012.e.json` | 技能「61-03 打屁股風林火豬」，槽位 E |
| `godie-u012.ex.json` | 技能「61-002 惡魔吉他」，槽位 EX |
| `godie-u012.passive.json` | 技能「61-00百連我殺」，槽位 PASSIVE |
| `godie-u012.q.json` | 技能「61-01惡魔球」，槽位 Q |
| `godie-u012.r.json` | 技能「61-04 瘋狂怪物」，槽位 R |
| `godie-u012.w.json` | 技能「61-02 霸獸盔甲」，槽位 W |
| `godie-u01f.e.json` | 技能「none」，槽位 E |
| `godie-u01f.passive.json` | 技能「16-00 通靈能力」，槽位 PASSIVE |
| `godie-u01f.q.json` | 技能「none」，槽位 Q |
| `godie-u01f.r.json` | 技能「none」，槽位 R |
| `godie-u01f.w.json` | 技能「none」，槽位 W |
| `godie-u01q.e.json` | 技能「none」，槽位 E |
| `godie-u01q.q.json` | 技能「none」，槽位 Q |
| `godie-u01q.r.json` | 技能「none」，槽位 R |
| `godie-u01q.w.json` | 技能「none」，槽位 W |
| `godie-usyl.e.json` | 技能「49-03 蛻變」，槽位 E |
| `godie-usyl.ex.json` | 技能「49-002 產卵」，槽位 EX |
| `godie-usyl.passive.json` | 技能「49-00 撲殺爪擊」，槽位 PASSIVE |
| `godie-usyl.q.json` | 技能「49-01 遮斷獵殺」，槽位 Q |
| `godie-usyl.r.json` | 技能「49-04 母體」，槽位 R |
| `godie-usyl.w.json` | 技能「49-02 腐蝕毒液」，槽位 W |
| `godie-uwar.e.json` | 技能「43-04 爆裂海景佛跳牆」，槽位 E |
| `godie-uwar.ex.json` | 技能「43-002 食神歸位」，槽位 EX |
| `godie-uwar.passive.json` | 技能「43-00 觀音大士的守護」，槽位 PASSIVE |
| `godie-uwar.q.json` | 技能「43-01 得罪了方丈還想走」，槽位 Q |
| `godie-uwar.r.json` | 技能「43-03 少林絕學-火雲掌」，槽位 R |
| `godie-uwar.w.json` | 技能「43-02 打狗鏟」，槽位 W |

### `champions/` （48 檔）

| 檔案 | 是什麼 |
|---|---|
| `godie-e00j.json` | 英雄「皇者 - 騜」，4 格技能 |
| `godie-e00k.json` | 英雄「戰國刺客Azumi - 安云」，4 格技能 |
| `godie-e00q.json` | 英雄「英靈-亞瑟王 - 黑化Saber」，4 格技能 |
| `godie-e00t.json` | 英雄「七夜怪談 - 貞子」，4 格技能 |
| `godie-e00u.json` | 英雄「完全而瀟灑的女僕 - 十六夜Sakuya」，4 格技能 |
| `godie-e00v.json` | 英雄「百畝森林的霸主 - 維尼」，4 格技能 |
| `godie-e00z.json` | 英雄「戰國刺客Azumi - 安云」，4 格技能 |
| `godie-e012.json` | 英雄「殺人劍客 - 佐佐木小次郎」，4 格技能 |
| `godie-e015.json` | 英雄「夜市人生 - 金居福」，4 格技能 |
| `godie-ecen.json` | 英雄「姜窩肯 - 約翰走路」，4 格技能 |
| `godie-ekee.json` | 英雄「會叫的野獸 - 傳說中的大刀」，4 格技能 |
| `godie-ewrd.json` | 英雄「天上天下 - 棗 真夜」，4 格技能 |
| `godie-h001.json` | 英雄「地獄來襲者 - 斑剎」，4 格技能 |
| `godie-h00w.json` | 英雄「豪洨天王 - 鄭先生」，4 格技能 |
| `godie-h021.json` | 英雄「破銅爛鐵 - 阿強一號」，4 格技能 |
| `godie-h022.json` | 英雄「白色之翼 - 涅吉。史普林。菲爾德」，4 格技能 |
| `godie-h02n.json` | 英雄「腦包英雄 - 打我阿笨蛋」，4 格技能 |
| `godie-h02s.json` | 英雄「死亡騎士」，4 格技能 |
| `godie-h02y.json` | 英雄「幕末復仇狂者 - 志志雄真實」，4 格技能 |
| `godie-h02z.json` | 英雄「不良少年」，4 格技能 |
| `godie-harf.json` | 英雄「豪洨天王 - 鄭先生」，4 格技能 |
| `godie-hblm.json` | 英雄「慈悲的王者 - 賈修貝爾」，4 格技能 |
| `godie-hlgr.json` | 英雄「鋼彈 - 煌」，4 格技能 |
| `godie-hpal.json` | 英雄「不死之身-無 - 藤井八雲」，4 格技能 |
| `godie-n01b.json` | 英雄「地獄歌神 - 憤怒的胖虎」，4 格技能 |
| `godie-n01l.json` | 英雄「學姊 - 小派」，4 格技能 |
| `godie-naka.json` | 英雄「猿飛佐助 - 風魔小次郎」，4 格技能 |
| `godie-nbst.json` | 英雄「變態正義 - 瘋狂假面」，4 格技能 |
| `godie-nman.json` | 英雄「地獄歌神 - 憤怒的胖虎」，4 格技能 |
| `godie-nplh.json` | 英雄「通靈人 - 麻倉葉」，4 格技能 |
| `godie-ntin.json` | 英雄「時空管理局執務官 - 菲特·泰斯塔羅沙」，4 格技能 |
| `godie-o01z.json` | 英雄「魔砲少女 - 高町奈葉」，4 格技能 |
| `godie-o02n.json` | 英雄「曹操孟德 - 阿瞞大人」，4 格技能 |
| `godie-o02o.json` | 英雄「曹操孟德 - 阿瞞大人」，4 格技能 |
| `godie-o02s.json` | 英雄「憂鬱少女 - 涼宮八ㄦ匕」，4 格技能 |
| `godie-o02v.json` | 英雄「白色惡魔 - 高町奈葉」，4 格技能 |
| `godie-o02w.json` | 英雄「笑傲江湖 - 令狐沖」，4 格技能 |
| `godie-obla.json` | 英雄「被剝削的勞工階級 - 牧太郎」，4 格技能 |
| `godie-opgh.json` | 英雄「常勝將軍 - 趙子龍」，4 格技能 |
| `godie-oshd.json` | 英雄「魔鬼筋肉人 - 鬼王達」，4 格技能 |
| `godie-othr.json` | 英雄「X戰警 - 金鋼狼」，4 格技能 |
| `godie-u00b.json` | 英雄「最M的魔法Jizz - 清蒸 飛鼠先生」，4 格技能 |
| `godie-u011.json` | 英雄「死亡老二 - 克勞薩先生」，4 格技能 |
| `godie-u012.json` | 英雄「重金屬樂團的怪物 - 克勞薩II世」，4 格技能 |
| `godie-u01f.json` | 英雄「萬夫莫敵 - 黑化張飛」，4 格技能 |
| `godie-u01q.json` | 英雄「測試英雄 - 索隆」，4 格技能 |
| `godie-usyl.json` | 英雄「殺戮之牙 - 異形」，4 格技能 |
| `godie-uwar.json` | 英雄「食神 - 撒尿牛丸」，4 格技能 |

### `config/` （2 檔）

| 檔案 | 是什麼 |
|---|---|
| `arena-rules-rounds-11-13.json` | owner 2026-08-18：「我早就已經把**第十回合作為最終回合**全部玩家同一地圖大亂鬥，並且**打完就全部結算了**」「你是不是又查到舊資料了阿 快整理到 legacy 去」 |
| `unit-tints-legacy.json` | 它是 41 位未上架英雄的 tint 保真度紀錄，跟著他們一起搬過來的 |

### `items/` （112 檔）

| 檔案 | 是什麼 |
|---|---|
| `ember-rod.json` | 道具「餘燼魔杖」，craftRole=none |
| `godie-i005.json` | 道具「初心者寶石」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i009.json` | 道具「分手之鎚製作書」，製作書系列 |
| `godie-i00a.json` | 道具「刺針製作書」，製作書系列 |
| `godie-i00b.json` | 道具「失心匕首製作書」，製作書系列 |
| `godie-i00g.json` | 道具「奇美拉之翼」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i00h.json` | 道具「風行天衣製作書」，製作書系列 |
| `godie-i00k.json` | 道具「女神之淚」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i00n.json` | 道具「分手之鎚」，合成過渡期道具（craftRole=component，原價 1200） |
| `godie-i00p.json` | 道具「聖誕之靴」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i00q.json` | 道具「伊娃之盾」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i00r.json` | 道具「山之書」，合成過渡期道具（craftRole=component，原價 2785） |
| `godie-i00t.json` | 道具「風之書」，合成過渡期道具（craftRole=component，原價 1950） |
| `godie-i00v.json` | 道具「四魂之玉的碎片-荒魂」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i00w.json` | 道具「四魂之玉的碎片-和魂」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i00x.json` | 道具「四魂之玉的碎片-幸魂」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i00y.json` | 道具「四魂之玉的碎片-奇魂」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i011.json` | 道具「名刀-天狼製作書」，製作書系列 |
| `godie-i015.json` | 道具「瑪那魔杖製作書」，製作書系列 |
| `godie-i017.json` | 道具「祕銀鎖子甲製作書」，製作書系列 |
| `godie-i019.json` | 道具「霸王槍製作書」，製作書系列 |
| `godie-i01b.json` | 道具「林之書」，合成過渡期道具（craftRole=component，原價 2550） |
| `godie-i01c.json` | 道具「火之書」，合成過渡期道具（craftRole=component，原價 2040） |
| `godie-i01e.json` | 道具「和道一文字製作書」，製作書系列 |
| `godie-i01f.json` | 道具「和道一文字」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i01h.json` | 道具「貫雷槍製作書」，製作書系列 |
| `godie-i01k.json` | 道具「火焰泰坦腰帶」，craftRole=quest |
| `godie-i01l.json` | 道具「雷神之鎚製作書」，製作書系列 |
| `godie-i01m.json` | 道具「黑核晶」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i01p.json` | 道具「聖誕之靴製作書」，製作書系列 |
| `godie-i01q.json` | 道具「光魔杖製作書」，製作書系列 |
| `godie-i01r.json` | 道具「一克拉鑽戒製作書」，製作書系列 |
| `godie-i01t.json` | 道具「晨曦之光製作書」，製作書系列 |
| `godie-i01u.json` | 道具「伊娃之盾製作書」，製作書系列 |
| `godie-i01x.json` | 道具「思念的守護製作書」，製作書系列 |
| `godie-i01y.json` | 道具「熾天使之弓製作書」，製作書系列 |
| `godie-i01z.json` | 道具「八取武士刀製作書」，製作書系列 |
| `godie-i021.json` | 道具「天叢雲劍製作書」，製作書系列 |
| `godie-i022.json` | 道具「龍騎士之劍製作書」，製作書系列 |
| `godie-i023.json` | 道具「妖刀村正製作書」，製作書系列 |
| `godie-i024.json` | 道具「朗基努斯之槍製作書」，製作書系列 |
| `godie-i025.json` | 道具「惡夢魔王碎片製作書」，製作書系列 |
| `godie-i026.json` | 道具「雅典娜的驚嘆號製作書」，製作書系列 |
| `godie-i028.json` | 道具「月神槍製作書」，製作書系列 |
| `godie-i029.json` | 道具「斬龍刀製作書」，製作書系列 |
| `godie-i02a.json` | 道具「炎神弩製作書」，製作書系列 |
| `godie-i02b.json` | 道具「妖物碎殺牙製作書」，製作書系列 |
| `godie-i02c.json` | 道具「狂暴軒轅劍製作書」，製作書系列 |
| `godie-i02f.json` | 道具「死神裝束製作書」，製作書系列 |
| `godie-i02h.json` | 道具「戰旗」，craftRole=quest |
| `godie-i02i.json` | 道具「泰坦之魂」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i02j.json` | 道具「復仇之袍」，craftRole=quest |
| `godie-i02k.json` | 道具「惡魔吉他」，craftRole=quest |
| `godie-i02l.json` | 道具「舊系服」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i02m.json` | 道具「牛蒡男」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i02n.json` | 道具「斯巴達圓盾」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i02o.json` | 道具「空罐頭」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i02p.json` | 道具「網友手環」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i02q.json` | 道具「澤之書」，合成過渡期道具（craftRole=component，原價 2785） |
| `godie-i02s.json` | 道具「奇蹟之墜製作書」，製作書系列 |
| `godie-i02u.json` | 道具「黑色魔書製作書」，製作書系列 |
| `godie-i02v.json` | 道具「黑核晶製作書」，製作書系列 |
| `godie-i02w.json` | 道具「靈魂魔石製作書」，製作書系列 |
| `godie-i02y.json` | 道具「斬岩刃製作書」，製作書系列 |
| `godie-i02z.json` | 道具「盾甲天書製作書」，製作書系列 |
| `godie-i032.json` | 道具「天生牙製作書」，製作書系列 |
| `godie-i034.json` | 道具「大地泰坦角盔」，craftRole=quest |
| `godie-i035.json` | 道具「海潮泰坦護盾」，craftRole=quest |
| `godie-i036.json` | 道具「嗜血邪書製作書」，製作書系列 |
| `godie-i037.json` | 道具「隱密介紹信」，合成過渡期道具（craftRole=component，原價 1000） |
| `godie-i03a.json` | 道具「幻之匕首製作書」，製作書系列 |
| `godie-i03c.json` | 道具「雅典娜的驚嘆號．改」，合成過渡期道具（craftRole=component，原價 1200） |
| `godie-i03e.json` | 道具「光明虎徹製作書」，製作書系列 |
| `godie-i03g.json` | 道具「甘豆腐之袍製作書」，製作書系列 |
| `godie-i03i.json` | 道具「天地崩裂魔杖製作書」，製作書系列 |
| `godie-i03o.json` | 道具「死之王長槍的碎片」，合成過渡期道具（craftRole=component，原價 4300） |
| `godie-i03p.json` | 道具「死之王意志的碎片」，合成過渡期道具（craftRole=component，原價 4600） |
| `godie-i03q.json` | 道具「死之王神盾的碎片」，合成過渡期道具（craftRole=component，原價 4000） |
| `godie-i03x.json` | 道具「破甲槍製作書」，製作書系列 |
| `godie-i03z.json` | 道具「螺旋劍製作書」，製作書系列 |
| `godie-i042.json` | 道具「火閃電製作書」，製作書系列 |
| `godie-i044.json` | 道具「寂靜刃 - 詠月製作書」，製作書系列 |
| `godie-i04a.json` | 道具「賢者之石製作書」，製作書系列 |
| `godie-i04c.json` | 道具「冰晶虎魄製作書」，製作書系列 |
| `godie-i04e.json` | 道具「冰晶虎魄 - 改製作書」，製作書系列 |
| `godie-i04g.json` | 道具「奇門遁甲製作書」，製作書系列 |
| `godie-i04h.json` | 道具「炎龍巨弩製作書」，製作書系列 |
| `godie-i04k.json` | 道具「厄夜鐮刀製作書」，製作書系列 |
| `godie-i04m.json` | 道具「殺豬刀製作書」，製作書系列 |
| `godie-i04y.json` | 道具「兌換空罐頭」，兌換券（craftRole=token） |
| `godie-i051.json` | 道具「兌換仙后座」，兌換券（craftRole=token） |
| `godie-i053.json` | 道具「仙后座殘骸」，合成過渡期道具（craftRole=component，原價 0） |
| `godie-i054.json` | 道具「認領寵物」，兌換券（craftRole=token） |
| `godie-i055.json` | 道具「兌換牛蒡男」，兌換券（craftRole=token） |
| `godie-i056.json` | 道具「交換寵物」，兌換券（craftRole=token） |
| `godie-i059.json` | 道具「兌換舊系服」，兌換券（craftRole=token） |
| `godie-i05a.json` | 道具「兌換泰坦之魂」，兌換券（craftRole=token） |
| `godie-i05e.json` | 道具「兌換斯巴達圓盾」，兌換券（craftRole=token） |
| `godie-i05g.json` | 道具「世界樹的果實」，合成過渡期道具（craftRole=component，原價 1800） |
| `godie-i05s.json` | 道具「嚇人假面」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i05w.json` | 道具「觀音菩薩護身符」，合成過渡期道具（craftRole=component，原價 1650） |
| `godie-i05y.json` | 道具「蜂蜜罐」，craftRole=quest |
| `godie-i065.json` | 道具「godie-i065」，合成過渡期道具（craftRole=component，原價 1150） |
| `godie-i066.json` | 道具「復仇之玉」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i069.json` | 道具「女神之淚製作書」，製作書系列 |
| `godie-i06b.json` | 道具「思念的守護」，合成過渡期道具（craftRole=component，原價 300） |
| `godie-i06m.json` | 道具「真知之石」，合成過渡期道具（craftRole=component，原價 950） |
| `godie-i06p.json` | 道具「godie-i06p」，合成過渡期道具（craftRole=component，原價 1250） |
| `godie-i06r.json` | 道具「一克拉鑽戒」，合成過渡期道具（craftRole=component，原價 300） |
| `ironhide-vest.json` | 道具「鐵皮護甲背心」，craftRole=none |
| `serrated-edge.json` | 道具「鋸齒之刃」，craftRole=none |
| `swift-boots.json` | 道具「疾風之靴」，craftRole=none |

### `loot-tables/` （2 檔）

| 檔案 | 是什麼 |
|---|---|
| `quest-rewards.json` | loot-table@1「quest-rewards」 |
| `round-reward.json` | loot-table@1「round-reward」 |

