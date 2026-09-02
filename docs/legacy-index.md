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

**目前共 586 個檔案**，分佈在 2 個隔離區。

| 隔離區 | 檔數 | 是什麼 |
|---|---:|---|
| [`docs/legacy/`](legacy-index.md#docslegacy) | 146 | 規格與文件的隔離區（第〇·六守則階梯的第 3–5 層 + 已被取代的同型文件） |
| [`content/_legacy/`](legacy-index.md#contentlegacy) | 440 | **下架的內容文件** —— 英雄、技能、**道具**、config。「消失 ≠ 歸檔」：白名單移除的東西要真的躺在這裡 |

⚠️ **在這裡找到需要的東西之後**：它仍然是階梯第 3–5 層（或已被取代的同型文件）。
要用它之前先問「現行的那一份說什麼」—— 衝突時**現行的贏**（第〇·六守則）。

---

## `docs/legacy/` —— 146 檔

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
| `_semantic-role-markup-superseded.md` | 語意色彩標記（`descriptionRoles` / `[c=role]…[/c]`）—— 被取代的那一份知識 —— GH#757**（接手已關的 **#114**）· 定案 **2026-08-29** · 決定：**(a) 拆** | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_session-handoff-2026-07-24.md` | session 交接（07-24，系列最舊） | 接到 20 天前、11 個次版號以前的 v0.4.1 現場 |
| `_session-handoff-20260725.md` | session 交接（07-25） | 自陳是 temp/過渡文件。⚠️ §7 明文寫著兩個外洩憑證的值 —— 搬檔**不改變資安態勢**，真正的修法是輪替（GH#181） |
| `_session-handover-0731.md` | session 交接（07-31） | 以為部署卡在 ssh 私鑰、線上是 v0.9.15。⚠️ 搬移時已把 `_execution-batches.md` 的轉介路徑改掉 |
| `_session-handover-2026-07-29.md` | session 交接（07-29） | 兩次要求「下次開機第一件事：線上打一場」—— **直接違反現行守則**（owner 2026-08-09 已退掉手動打一場） |
| `_skill-mechanics-coverage-20260808.md` | 90 支重製技能 → 機制覆蓋矩陣 | 檔頭釘死查證 commit `8cfb22d3`，而**下一個** commit 就把 kinds 27→34、hooks 9→15。照它會判斷一堆「引擎做不到」而去繞路。現行權威是 `GET /capabilities` |
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

