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

**目前共 3306 個檔案**，分佈在 2 個隔離區。

| 隔離區 | 檔數 | 是什麼 |
|---|---:|---|
| [`docs/legacy/`](legacy-index.md#docslegacy) | 2866 | 規格與文件的隔離區（第〇·六守則階梯的第 3–5 層 + 已被取代的同型文件） |
| [`content/_legacy/`](legacy-index.md#contentlegacy) | 440 | **下架的內容文件** —— 英雄、技能、**道具**、config。「消失 ≠ 歸檔」：白名單移除的東西要真的躺在這裡 |

⚠️ **在這裡找到需要的東西之後**：它仍然是階梯第 3–5 層（或已被取代的同型文件）。
要用它之前先問「現行的那一份說什麼」—— 衝突時**現行的贏**（第〇·六守則）。

---

## `docs/legacy/` —— 2866 檔

規格與文件的隔離區（第〇·六守則階梯的第 3–5 層 + 已被取代的同型文件）

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
| `_overwrites/AudioDirector_temp_20260822-0122.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ConfigDocPage_temp_20260821-2358.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/RallyConfirmDialog_temp_20260821-2355.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/_ledger.tsv` | （.tsv 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/audio-mix_temp_20260822-0122.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/audioMixDoc_temp_20260822-0122.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/claims_temp_20260821-2048.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/configForms_temp_20260821-2355.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/configForms_temp_20260821-2358.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/configForms_temp_20260822-0122.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/config_temp_20260821-2355.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/contextualVoice_temp_20260822-0122.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/damageTiers_temp_20260822-0100.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/damageTiers_temp_20260822-0109.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/fieldAdoption_broken_temp_20260822-0126.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/gen_board_temp_20260822-0005.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/godie-e00r_ex_temp_20260822-0017.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/godie-e00r_gen_temp_20260822-0027.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/godie-ogld.ex_temp_20260822-0609.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ledger_table_temp_20260822-0005.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/lobby-rally_temp_20260821-2355.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/nameVoice_temp_20260822-0122.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ruling_temp_20260821-2110.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/skill-normalize-writeback_temp_20260821-033052.tar.gz` | （.gz 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/stat-caps_temp_20260822-0033.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/statTypes_temp_20260822-0033.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/tierize_temp_20260822-0517.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/victoryTaunt_temp_20260822-0122.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/voiceMixPolicy_temp_20260822-0122.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/20260820-012418/CLAUDE.md` | GGD — 開發守則 —— 這一份是**規則**，不是說明書。架構與現況看 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/20260820-012959/docs/_release/board-live.md` | ⭐ 瓶頸已解除：鎖是 `bundle.json`，不是 `content/` 目錄 —— 切分依據是**檔案領域互斥**，⛔ 不是主題相近 —— 兩條 lane 只要會編到同一個檔就不能併行。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/combat-env.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e001.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e002.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e007.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e008.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e00l.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e00n.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e00r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e00s.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e00w.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e00x.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-e010.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-edem.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-efur.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-emfr.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-emns.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-etyr.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-ewar.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-h00l.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-h01n.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-h01o.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-h01u.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-h020.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-h02k.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-h02r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-h02u.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-h02v.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-hapm.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-hart.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-hgam.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-hjai.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-hpb1.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-huth.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-hvsh.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-hvwd.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i000.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i008.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i00l.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i013.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i01o.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i02g.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i02x.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i033.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i03d.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i040.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i049.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i04b.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i04v.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i05h.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i05k.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i05l.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i05o.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i06a.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i06c.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i06d.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i06g.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i06h.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i06i.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i06k.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i06o.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-i06s.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-n003.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-n00b.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-n00p.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-n01c.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-n01g.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-nbbc.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-nsjs.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-o00k.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-o00l.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-o00x.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-o02l.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-o02p.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-o030.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-ofar.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-ogld.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-ogrh.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-orkn.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-osam.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u00h.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u00j.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u00k.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u00l.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u00n.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u00o.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u00v.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u010.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u01u.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-u034.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-ubal.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-ucrl.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-udea.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-udre.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-umal.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-uvng.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/godie-zombiex.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/piercer-crossbow.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/sasumata.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/sela.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ad_fold_temp_20260822-0414/thorne.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/claims-baseline-stale_temp_20260821-033411/grail-ex-13.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/claims-baseline-stale_temp_20260821-033411/grail-ex-18.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/gh417-70-04_temp_20260822-0555/abilityCodeParity.baseline.70.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/gh417-70-04_temp_20260822-0555/godie-e010.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/gh417-70-04_temp_20260822-0555/godie-e010.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/ledger-repair_temp_20260820/2026-08-20.md` | 2026-08-20 補登 —— ⚠️ **這一份是補的。** `2026-08-19.md` 的帳本停在 **#1068**，之後的 16 則我**憑印象**處理， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-014449/content/abilities/godie-e010.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-020339/packages/shared/src/content/descriptionClaims.baseline/godie-zzzz.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-020813/tools/skill-remake/heroes/godie-e002.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-021858/packages/shared/src/content/schema/effect.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-021858/packages/shared/src/sim/effects/effect.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-021858/packages/shared/src/sim/effects/effectRegistry.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-021940/packages/shared/src/content/schema/effect.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-021940/packages/shared/src/sim/effects/effect.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-021940/packages/shared/src/sim/effects/effectRegistry.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-022147/packages/shared/src/content/schema/effect.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-022147/packages/shared/src/sim/effects/effect.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-022147/packages/shared/src/sim/effects/effectRegistry.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-024335/tools/skill-remake/heroes/godie-e002.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-024343/tools/skill-remake/heroes/godie-zzzz.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-024422/tools/skill-remake/heroes/godie-e002.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-024503/packages/shared/src/content/schema/effects/zzprobe.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-024516/packages/shared/src/content/descriptionClaims.baseline/godie-zzzz.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-024616/tools/skill-remake/heroes/godie-e002.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-024616/tools/skill-remake/heroes/godie-h02k.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-035824/content/abilities/godie-e00u.passive.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-040528/packages/shared/src/content/abilityCodeParity.baseline/19.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-045700/data-curation/whitelist.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-191142/packages/shared/src/ops/messageLedgerScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260820-201544/packages/shared/src/ops/rulingScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-001036/packages/shared/src/content/tierSnap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-001053/packages/shared/src/content/tierSnap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-001123/packages/shared/src/content/manaCostTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-003749/tools/card-prose/apply_placeholders.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-023129/packages/shared/src/content/renderAbilityText.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-023330/packages/shared/src/content/renderAbilityText.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-023507/packages/shared/src/ops/supersededTierNumbers.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-023707/docs/legacy-index.md` | GGD · legacy 記憶索引 —— ⚙️ **這一份是產生出來的，⛔ 不要手改。** | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-025704/content/champions/sela.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-025704/content/champions/thorne.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-025726/packages/shared/src/content/descriptionClaims.baseline/godie-udea.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-035855/apps/game-server/src/match/__seedscan_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-125233/packages/shared/src/content/speedGrowthTiers.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-151806/packages/shared/src/sim/effects/_dbg_temp_20260821.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-151845/packages/shared/src/sim/effects/devourPassiveIcd.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-152714/packages/shared/src/sim/effects/_dbg_temp_20260821b.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-173050/tools/_probe/norm.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-175405/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-181658/apps/client/src/ui/platform/roomNoChampionIdMenu.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-190601/apps/admin/src/ui/ChampionIdList.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-190646/apps/admin/src/championLabels.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-190732/apps/admin/src/config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-190732/content/config/replay.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-191214/apps/admin/src/quickCleanup.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260821-195520/packages/shared/scripts/_gh433_check_temp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-010522/packages/shared/src/content/damageTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-010608/tools/bgm-gen/src/ggd/scenefx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-011214/apps/client/src/ui/panels/roundVictoryCollapse.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-012357/apps/client/src/ui/panels/settlementStartFocus.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-031728/apps/client/src/input/gamepadFeelConfig.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-041744/content/config/damage-tier-exemptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-041819/packages/shared/src/content/shippedDamageTiersResolve.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-055344/content/assets/models/_lod.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-055434/content/abilities/godie-e00l.w.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-055434/data/curation/whitelist.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-055752/docs/legacy/_overwrites/godie-e00l.ex_temp_20260822-0700.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-055918/apps/client/src/ui/audioClusterSfx.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-060042/docs/legacy/_overwrites/_lod_temp_20260822-0552.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-060129/packages/shared/src/sim/systems/friendlyFirePayout.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-060150/apps/game-server/src/ai/castRange.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-060733/apps/editor/src/preview/forgeRealCast.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-061106/tools/skill-tiers/gen_tiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-061216/apps/client/src/ui/WorldAnchorLayer.nameSink.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-145554/EVA01.zip` | （.zip 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-145842/lina.zip` | （.zip 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-180319/tools/balance-alert/echo_loop.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-180357/tools/ap-conversion/exemptions.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-180357/tools/ap-conversion/knobs.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-180436/apps/client/src/render/roundWinnerSpacing.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-190418/packages/shared/src/sim/effects/avalon_validate_temp_20260822-1900.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-204907/apps/client/src/ui/pressOpensBanner.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-205109/packages/shared/src/content/schema/config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-212551/packages/shared/src/content/schema/config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-212601/packages/shared/src/content/schema/config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-212628/packages/shared/src/content/schema/config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-212704/packages/shared/src/content/schema/config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-213305/packages/shared/src/content/schema/config/mutantProbe.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-213402/packages/shared/src/content/schema/config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-214555/apps/game-server/src/match/lagprobe_temp_20260823-0100.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-214730/apps/game-server/src/match/lagprobe_temp_20260823-0100.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-215124/apps/client/src/vfx/roundGrowth_probe_temp_20260823-0100.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-215349/apps/client/src/vfx/roundGrowthIsBounded.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-215421/apps/game-server/src/match/roundBoundaryScheduleClear.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-215728/apps/game-server/src/match/lagprobe_temp_20260823-0100.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-220041/content/models/_overlay-hidden-geometry.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-231137/apps/client/src/ui/components/abilityConditionMark.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-231931/packages/shared/src/content/w3xRawcodeArtIdentity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-232654/apps/game-server/src/match/leakprobe_temp_20260823.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-233416/apps/client/src/render/roundArenaGrowth_probe_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260822-233854/apps/game-server/src/match/mobresidue_probe_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-010328/packages/shared/src/sim/championFormRoundBoundary.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-013516/apps/client/src/matchLifecycleWiring.dom.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-014219/content/bundle.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-023315/packages/shared/src/sim/__dbgB2_temp_20260823.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-024128/packages/shared/src/sim/stats/heroInitialAd.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-033318/packages/shared/src/sim/adDriftProbe_temp_20260823.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-033429/packages/shared/src/sim/adDriftProbe_temp_20260823.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-034504/packages/shared/src/sim/adDriftProbe_temp_20260823.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-042905/apps/game-server/src/net/__dbg.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-050040/apps/game-server/src/match/seedscan_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-063159/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-071956/packages/shared/src/sim/effects/clientCues.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-072721/packages/shared/src/sim/effects/variants/applyBuff.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-074509/apps/client/src/render/safeRenderLoop.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-074614/apps/client/src/net/immuneAnchor.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-075938/content/config/cooldown-tiers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-082945/apps/client/src/vfx/arcBolt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-131647/packages/shared/src/sim/systems/ChampionFormSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-140243/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-140922/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-142344/apps/client/src/render/weather.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-154958/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-155118/apps/client/src/predict/predictedStats.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-155840/apps/client/src/render/weatherFogBanks.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-160927/apps/client/src/render/lifecycleLedger.probe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-164209/apps/client/node_modules/.ggd-probe/lag/smoke.probe.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-164341/tools/deploy-timing/tiers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-164531/apps/client/src/predict/_recon_temp_20260823.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-164619/tools/deploy-timing/tiers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-164737/tools/deploy-timing/tier.test.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-164950/apps/client/src/predict/predictedStats.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-165110/apps/client/src/ui/hud/mobBarNoReconcile.test.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-165114/apps/client/src/predict/moveSpeedParity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-165119/apps/client/src/predict/_recon_temp_20260823.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-165501/apps/client/src/predict/predictedStats.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-165620/tools/parallel-gates/reset-sandbox.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-171116/tools/parallel-gates/graph.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-171441/packages/shared/src/ops/shipGateScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-171656/docs/_reports/L5_temp_20260823.md` | L5 —— 內容樹只載入一次 —— 日期** 2026-08-23 · **柵欄** `packages/shared/src/content/` | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-181000/tools/balance-alert/echoLoop.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-181407/apps/client/src/ui/PerfOverlay.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-181651/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-181939/content/abilities/godie-h020.e.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-182026/packages/shared/src/content/authoringRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-182152/tools/skill-templates/shapes.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-182551/packages/shared/src/content/cache/contentCache.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-183401/tools/content-cache/_bench_gen_temp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-184132/docs/_reports/A3_jassfacts-quadratic_temp_20260823b.patch` | （.patch 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-184810/tools/skill-templates/shape_axes.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-184958/packages/shared/src/sim/effects/periodicFieldAnchor.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-192034/apps/client/src/ui/panels/augmentDraftNoReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-192335/apps/client/src/ui/panels/augmentDraftNoReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-200149/packages/shared/src/sim/combat/_measure_temp_20260823f.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-200246/packages/shared/src/sim/combat/_measure_temp_20260823f.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-200348/packages/shared/src/sim/combat/_measure_temp_20260823f.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-201231/packages/shared/src/sim/combat/_measure_temp_20260823f.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260823-201855/apps/game-server/src/net/knockdownFlag.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-011041/apps/platform/internal/gamelink/championusage_test.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-012040/apps/client/src/render/views/mobShadowBench.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-012246/content/config/combat-feel.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-012433/tools/skill-remake/common.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-012700/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-012738/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-012800/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-012822/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-013242/packages/shared/src/sim/atFieldBlockBerserkImmunity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-013325/packages/shared/src/sim/atFieldBlockBerserkImmunity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-013331/packages/shared/src/sim/atFieldBlockBerserkImmunity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-013358/packages/shared/src/sim/atFieldBlockBerserkImmunity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-013444/packages/shared/src/sim/atFieldBlockBerserkImmunity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-013847/packages/shared/src/sim/atFieldBlockBerserkImmunity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014231/packages/shared/src/sim/effects/variants/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014246/packages/shared/src/content/schema/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014252/packages/shared/src/content/schema/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014301/tools/w3x-import/join/derive_join.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014304/packages/shared/src/content/schema/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014305/tools/w3x-import/join/derive_join.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014313/tools/w3x-import/join/derive_join.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014320/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014320/tools/w3x-import/join/derive_join.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014326/tools/w3x-import/join/derive_join.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014328/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014335/tools/w3x-import/join/derive_join.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014339/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014341/tools/w3x-import/join/derive_join.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014446/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014456/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014545/tools/w3x-import/w3xlib/models.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014552/packages/shared/src/content/schema/effects/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014556/tools/w3x-import/w3xlib/models.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014605/tools/w3x-import/w3xlib/models.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014640/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014700/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014712/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014724/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-014800/packages/shared/src/sim/effects/hooks.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-015017/packages/shared/src/sim/effects/spawnVfx.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-015037/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-015054/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-015110/tools/w3x-import/w3xlib/models.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-015116/content/vfx/fx.saber.gold-dust.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-022743/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-022746/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-022749/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-022933/packages/shared/src/content/saberWeaponDust.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-023001/tools/skill-remake/heroes/godie-e002.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-023029/content/assets/models/imported/netherstrike.glb` | （.glb 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-023043/tools/skill-remake/heroes/godie-e002.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-023055/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-023108/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-023118/tools/skill-remake/heroes/godie-e002.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-023153/content/vfx/fx.saber.gold-dust.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042336/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042346/apps/platform/internal/combatenv/combatenv.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042353/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042446/packages/shared/scripts/buildIndexes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042453/apps/platform/internal/combatenv/combatenv.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042502/packages/shared/scripts/buildIndexes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042519/packages/shared/src/map/compile.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042522/packages/shared/src/map/compile.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042542/packages/shared/src/content/schema/config/vfxCleanup.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042546/packages/shared/src/sim/world/ArenaDef.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042551/packages/shared/src/sim/world/ArenaDef.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042552/packages/shared/src/content/schema/config/vfxCleanup.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042604/packages/shared/src/sim/SimWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042613/packages/shared/src/sim/SimWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042638/tools/parallel-gates/worktree.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042644/tools/parallel-gates/worktree.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042711/apps/client/src/vfx/vfxCleanupPolicy.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042725/tools/hero-archetypes/build.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042741/tools/hero-archetypes/build.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042744/tools/hero-archetypes/build.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042749/tools/hero-archetypes/build.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042752/apps/client/src/render/groundTextureCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042758/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042808/apps/client/src/render/groundTextureCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042814/apps/client/src/render/groundTextureCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042824/apps/client/src/render/groundTextureCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042824/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042834/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042857/packages/shared/src/sim/world/ArenaDef.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042907/apps/client/src/render/roundVfxLifecycle.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042910/packages/shared/src/sim/world/ArenaDef.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042919/packages/shared/src/map/gateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-042955/apps/client/src/render/roundFxRegistry.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043004/apps/client/src/render/roundFxRegistry.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043015/packages/shared/src/content/refs.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043024/apps/client/src/render/roundFxRegistry.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043115/tools/sfx-bind/suggest_keys.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043119/tools/sfx-bind/suggest_keys.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043124/tools/sfx-bind/suggest_keys.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043131/tools/sfx-bind/suggest_keys.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043143/content/abilities/godie-hjai.e.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043145/packages/shared/src/content/editorCapabilities.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043147/tools/sfx-bind/build_bindings.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043150/apps/client/src/render/roundFxRegistry.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043229/tools/sfx-bind/suggest_keys.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043230/apps/client/src/render/groundTextureCache.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043248/tools/sfx-bind/suggest_keys.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043322/tools/editor-contract/gen_contract_numbers.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043337/tools/editor-contract/gen_contract_numbers.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043339/tools/sfx-bind/suggest_keys.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043355/tools/editor-contract/gen_contract_numbers.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043402/tools/sfx-bind/build_bindings.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043410/tools/editor-contract/gen_contract_numbers.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043416/tools/editor-contract/gen_contract_numbers.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043423/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043424/tools/editor-contract/gen_contract_numbers.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043431/tools/editor-contract/gen_contract_numbers.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043454/apps/client/src/render/groundTextureCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043515/apps/client/src/render/groundTextureCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043548/tools/skill-spec/gen_spec.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043844/packages/shared/src/content/beamArriveVfx.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-043949/docs/_reports/M1_temp_20260824m.md` | M1 — #563 說謊的卡片（build 硬卡關）＋ #607 光束打到底沒爆炸 —— 2026-08-24 · lane M1 · 路徑柵欄：`content/abilities/**` · `content/champions/**` · | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-044007/docs/_reports/M1_temp_20260824m.md` | M1 — #563 說謊的卡片（build 硬卡關）＋ #607 光束打到底沒爆炸 —— 2026-08-24 · lane M1 · 路徑柵欄：`content/abilities/**` · `content/champions/**` · | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-044029/docs/_reports/M1_temp_20260824m.md` | M1 — #563 說謊的卡片（build 硬卡關）＋ #607 光束打到底沒爆炸 —— 2026-08-24 · lane M1 · 路徑柵欄：`content/abilities/**` · `content/champions/**` · | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-044044/docs/_reports/M1_temp_20260824m.md` | M1 — #563 說謊的卡片（build 硬卡關）＋ #607 光束打到底沒爆炸 —— 2026-08-24 · lane M1 · 路徑柵欄：`content/abilities/**` · `content/champions/**` · | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-044127/docs/_reports/M1_temp_20260824m.md` | M1 — #563 說謊的卡片（build 硬卡關）＋ #607 光束打到底沒爆炸 —— 2026-08-24 · lane M1 · 路徑柵欄：`content/abilities/**` · `content/champions/**` · | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172112/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172115/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172218/packages/shared/src/sim/systems/OrderSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172247/packages/shared/src/sim/targeting.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172254/packages/shared/src/sim/targeting.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172304/packages/shared/src/sim/systems/OrderSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172347/apps/admin/src/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172406/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172606/packages/shared/src/sim/systems/lolCommandDetails.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172613/packages/shared/src/sim/systems/lolCommandDetails.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172701/packages/shared/src/sim/systems/OrderSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-172713/packages/shared/src/sim/systems/OrderSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-173457/apps/client/src/vfx/zzprobe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-173458/packages/shared/src/sim/__p2measure.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174123/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174129/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174138/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174141/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174147/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174157/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174202/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174204/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174209/apps/client/src/vfx/zzprobe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174212/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174252/packages/shared/src/sim/__p2measure.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174259/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174300/packages/shared/src/sim/zzprobe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174301/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174302/packages/shared/src/sim/atFieldBlockBerserkImmunity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174309/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174342/packages/shared/src/sim/atFieldBlockBerserkImmunity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174405/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174420/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174430/packages/shared/src/sim/combat/damage.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-174707/apps/client/src/vfx/moveTrailWire.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190240/apps/client/src/vfx/chainLightningAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190252/apps/client/src/vfx/chainLightningAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190257/apps/client/src/vfx/chainLightningAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190439/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190440/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190546/apps/client/src/vfx/chainLightningAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190547/tools/review/triage.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190549/apps/client/src/vfx/chainLightningAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190557/tools/review/triage.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190853/apps/client/vite.config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190905/apps/client/src/debugPagesNotShipped.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190928/apps/client/src/review/babylonStrips.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190931/apps/client/src/review/babylonStrips.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-190933/apps/client/src/review/babylonStrips.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-191517/apps/client/src/review/babylonStrips.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-191521/apps/client/src/review/babylonStrips.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201752/packages/shared/src/content/schema/config/arenaRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201800/packages/shared/src/content/schema/config/arenaRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201812/packages/shared/src/content/schema/practiceDoc.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201817/packages/shared/src/content/schema/practiceDoc.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201823/packages/shared/src/content/schema/practiceDoc.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201826/packages/shared/src/content/schema/practiceDoc.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201916/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201920/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201924/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201930/packages/shared/src/sim/dispelRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201932/packages/shared/src/sim/dispelRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201933/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201933/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201944/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201945/apps/game-server/src/match/botOnlyRingAccel.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-201955/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202002/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202005/apps/game-server/src/match/botOnlyRingAccel.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202009/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202011/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202016/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202038/packages/shared/src/sim/effects/applyBuff.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202048/packages/shared/src/sim/systems/OrderSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202105/packages/shared/src/sim/effects/applyBuff.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202109/packages/shared/src/sim/stats/matchLedger.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202115/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202122/packages/shared/src/sim/stats/matchLedger.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202134/packages/shared/src/sim/stats/matchLedger.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202140/packages/shared/src/sim/stats/matchLedger.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202158/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202210/apps/game-server/src/stats/damageBoard.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202243/packages/shared/src/content/schema/config/damageRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202303/packages/shared/src/sim/stats/sourceGrants.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202307/packages/shared/src/sim/stats/sourceGrants.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202309/apps/admin/src/damageBoard.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202309/packages/shared/src/sim/stats/sourceGrants.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202319/apps/admin/src/damageBoard.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202319/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202355/apps/admin/src/damageBoard.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202358/packages/shared/src/content/schema/config/vfxCleanup.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202400/packages/shared/src/sim/effects/applyStatus.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202404/packages/shared/src/content/schema/config/vfxCleanup.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202416/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202421/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202426/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202437/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202441/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202444/content/abilities/godie-zombieking.passive.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202449/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202452/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202505/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202515/apps/client/src/vfx/fadeOut.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202541/apps/client/src/vfx/fadeOut.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202555/apps/client/src/vfx/vfxCleanupPolicy.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202606/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202614/apps/client/src/vfx/particleFactory.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202623/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202625/apps/client/src/vfx/particleFactory.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202631/apps/client/src/vfx/particleFactory.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202632/apps/platform/internal/room/invite.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202635/apps/client/src/vfx/particleFactory.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202642/apps/platform/internal/room/invite.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202655/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202726/apps/platform/internal/room/room.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202728/apps/admin/src/damageBoard.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202740/apps/admin/src/damageBoard.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202810/apps/game-server/src/stats/damageBoardOneShot.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202935/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-202935/packages/shared/src/sim/statusTagImmunity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203001/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203016/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203030/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203040/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203147/packages/shared/src/content/fieldAdoption.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203153/packages/shared/src/content/fieldAdoption.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203212/packages/shared/src/sim/statusTagImmunity.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203217/packages/shared/src/sim/stats/sourceGrants.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203226/packages/shared/src/sim/statusTagImmunity.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203227/packages/shared/src/sim/stats/sourceGrants.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203521/apps/client/src/render/ArenaScene.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-203602/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-204645/apps/client/src/render/vfx/w3xRigHonoursDissipateCap.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-205321/apps/client/src/render/vfx/w3xRigHonoursDissipateCap.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211233/packages/shared/src/content/schema/practiceDoc.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211235/packages/shared/src/content/schema/practiceDoc.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211236/packages/shared/src/content/schema/practiceDoc.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211252/content/config/practice.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211338/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211343/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211357/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211412/apps/client/src/ui/platform/FriendsPanel.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211427/apps/client/src/input/mouseTwoStageCast.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211439/apps/client/src/input/mouseTwoStageCast.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211507/apps/client/src/input/InputCapture.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211521/apps/game-server/src/match/practiceDummies.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211525/apps/client/src/input/InputCapture.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211555/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211606/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211630/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211643/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211704/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211712/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211720/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211725/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211735/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211744/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211800/apps/client/src/render/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211817/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211904/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211909/packages/shared/src/sim/systems/DeathSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-211945/content/items/godie-i039.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212000/packages/shared/src/sim/systems/DeathSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212005/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212013/packages/shared/src/sim/systems/DeathSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212125/packages/shared/src/sim/daggerGodieI039.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212150/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212206/packages/shared/src/content/schema/config/weather.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212234/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212239/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212247/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212409/tools/skill-lists/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212411/packages/shared/src/sim/systems/OrderSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212411/tools/skill-lists/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212413/packages/shared/src/sim/daggerGodieI039.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212427/packages/shared/src/sim/systems/MovementSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212453/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212455/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212541/apps/admin/src/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212625/apps/admin/src/ui/App.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212626/apps/admin/src/ui/App.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212653/apps/admin/src/navSections.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212728/content/items/godie-i039.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212742/content/items/godie-i039.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212835/packages/shared/src/sim/systems/MovementSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212849/packages/shared/src/sim/systems/MovementSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-212923/tools/skill-lists/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-221538/packages/shared/src/content/abilityCodeParityForms.baseline.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222731/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222742/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222747/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222759/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222803/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222818/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222822/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222829/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222834/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222854/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222858/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222900/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222913/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222916/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222931/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222935/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222938/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222945/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222949/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-222953/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223016/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223018/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223023/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223029/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223033/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223037/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223048/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223052/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223055/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223113/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223118/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223120/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223128/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223130/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223152/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223154/docs/開發守則大全.md` | 開發守則大全 —— 可轉移的工程紀律十五章 —— 這份文件是一個實際專案（多人併行 AI 工作流、內容驅動的線上服務）兩個月踩坑的沉澱， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-223802/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260824-224155/packages/shared/src/sim/exAbilitiesShipped.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-013915/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014047/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014053/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014055/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014128/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014128/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014129/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014152/packages/shared/src/content/schema/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014209/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014211/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014222/content/ability-templates/tpl-beam-roll.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014225/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014238/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014309/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-014318/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015057/apps/client/src/vfx/beamAuditionWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015102/apps/client/src/vfx/beamAuditionWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015113/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015126/apps/client/public/beam-audition.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015538/apps/client/src/render/modelFxStatic.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015540/apps/client/src/render/modelFxStatic.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015544/apps/client/src/render/modelFxWireContract.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015650/packages/shared/src/content/fieldAdoption.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015920/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-015937/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-112923/tools/review/features.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113014/tools/review/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113033/tools/review/check.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113044/tools/review/check.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113112/tools/review/features.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113332/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113413/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113417/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113419/tools/review/features.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113421/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113431/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113436/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113442/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113449/docs/_review/feature-verdicts.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113517/packages/shared/src/content/schema/template.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113527/packages/shared/src/content/schema/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113531/packages/shared/src/content/schema/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113534/packages/shared/src/content/schema/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113543/packages/shared/src/content/schema/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113547/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113552/packages/shared/src/sim/effects/variants/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113559/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113603/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113608/packages/shared/src/sim/effects/spawnModelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113615/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113616/packages/shared/src/content/modelFxPreset.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113623/apps/client/src/review/featureReviewApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113654/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113738/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113747/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113757/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113808/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113814/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113824/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113846/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113852/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113856/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113859/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-113904/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114127/apps/client/src/render/animProbe_temp_20260825.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114127/tools/skill-remake/common.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114258/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114311/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114331/packages/shared/src/content/locustMonsoonBolt.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114338/packages/shared/src/content/locustMonsoonBolt.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114343/packages/shared/src/content/locustMonsoonBolt.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114344/content/champions/godie-e00x.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114617/tools/skill-templates/shape_axes.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114725/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114735/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114738/tools/locust-census/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114943/packages/shared/src/content/schema/effects/animationFxTemplate.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-114952/packages/shared/src/content/schema/effects/animationFxTemplate.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-115326/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-115543/content/abilities/godie-u00l.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-115614/docs/_reports/o00e_visual-proof_20260825-1200/probe.txt` | （.txt 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120347/apps/client/public/feature-proof-audition.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120356/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120448/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120538/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120545/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120559/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120609/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120613/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120617/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120746/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120750/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120759/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120808/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120811/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120936/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120941/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-120952/apps/client/public/feature-proof-audition.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121114/apps/client/src/render/modelFxRig.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121155/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121209/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121217/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121224/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121243/apps/client/src/render/modelFxRig.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121248/apps/client/src/render/modelFxRig.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121343/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121356/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-121623/apps/client/src/render/fxTintAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-123054/docs/_reports/fxtint_visual-proof_20260825/tick24_left-plain_right-tint100.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-123910/apps/client/src/vfx/WeatherRainFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124108/apps/client/src/vfx/FloatingTextFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124112/apps/client/src/vfx/FloatingTextFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124225/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124234/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124237/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124427/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124430/apps/client/src/ui/floatingTextRenders.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124436/apps/client/src/render/weatherRainGpuPath.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124504/apps/client/src/vfx/WeatherRainFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124507/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124546/apps/client/src/vfx/WeatherRainFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124549/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124602/apps/client/src/render/weatherRainGpuPath.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124606/apps/client/src/render/weatherRainGpuPath.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124619/apps/client/src/render/weatherRainGpuPath.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124622/apps/client/src/vfx/WeatherRainFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-124638/apps/client/src/vfx/WeatherRainFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-125945/packages/shared/src/content/abilityCodeParityForms.baseline.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-161348/CLAUDE.md` | GGD — 開發守則 —— 這一份是**規則**，不是說明書。架構與現況看 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-161353/CLAUDE.md` | GGD — 開發守則 —— 這一份是**規則**，不是說明書。架構與現況看 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-161423/packages/shared/src/content/abilityMirror.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-162440/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164151/apps/client/src/vfx/reflectArcBurst.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164156/packages/shared/src/sim/auraIncludeSelf.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164206/apps/admin/src/statCaps.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164212/packages/shared/src/ops/jassComboTable.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164354/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164359/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164412/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164419/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164426/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164556/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164609/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164721/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164732/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164734/docs/_reports/MSG2_temp_20260825.md` | 訊息誤導閘 —— 棘輪 **39 → 0**（抽乾） —— owner 2026-08-25「請找到全部資訊誤導的根源處」的收尾。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164752/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164816/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-164820/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-165004/tools/skill-remake/common.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-165012/tools/skill-remake/common.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-165431/packages/shared/src/content/w3xDummyModelWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-165557/packages/shared/src/content/templates/locustTemplates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-165559/packages/shared/src/content/templates/locustTemplates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-165734/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-175327/packages/shared/src/content/runtimeAlphaBackfill.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-175559/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-175605/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-175612/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-175619/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-175623/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-175654/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-175948/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180001/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180015/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180044/docs/_reports/weather_rain_visual-proof_20260825/w2_shipped_path_throws.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180141/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180154/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180210/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180237/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180302/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180315/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180322/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180329/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180340/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180501/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180503/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180511/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180514/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180602/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180606/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180612/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180724/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180731/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-180858/apps/client/src/vfx/featureProofAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-181113/docs/_reports/classic_omnislash_visual-proof_20260825/o4_combo_late.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-195724/scripts/genguard.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-195745/scripts/genguard.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-195751/packages/shared/src/ops/normalizerListIsReal.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-195756/packages/shared/src/ops/normalizerListIsReal.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-195759/packages/shared/src/ops/normalizerListIsReal.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-195802/packages/shared/src/ops/normalizerListIsReal.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-200217/CLAUDE.md` | GGD — 開發守則 —— 這一份是**規則**，不是說明書。架構與現況看 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-200232/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-200234/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-200523/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-200525/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-200533/tools/parallel-gates/guard-prose-pending.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-200606/tools/w3x-import/mesh_audit_report.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201727/packages/shared/src/content/statNormalization.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201740/docs/新英雄上架SOP.md` | 新英雄上架 SOP — task #214 —— 這份清單是從 **實際開放 godie-efur（揍敵客桀諾 #13）與 godie-hblm（賈修貝爾 #05）所需要的每一個檔案** 反推出來的， | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201752/docs/_新場地計畫.md` | 新場地計畫 —— AnimeArenaMapGenerator —— GH#324** · 2026-08-14 · 架構決策簡報（Phase 0，**本輪未寫任何程式碼**） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201803/tools/anime-arena-map/gen.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201806/tools/anime-arena-map/gen.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201807/tools/anime-arena-map/gen.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201817/docs/_codex-handoff.md` | 交付給 Codex 技能編輯器 —— 從這裡開始 —— 一句話**：讀 3 份**必給**，其餘照需要。⛔ 權威是**端點**不是文件； | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201819/docs/_codex-handoff.md` | 交付給 Codex 技能編輯器 —— 從這裡開始 —— 一句話**：讀 3 份**必給**，其餘照需要。⛔ 權威是**端點**不是文件； | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201822/docs/_codex-handoff.md` | 交付給 Codex 技能編輯器 —— 從這裡開始 —— 一句話**：讀 3 份**必給**，其餘照需要。⛔ 權威是**端點**不是文件； | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201838/docs/_session-handover.md` | 交接：2026-08-08 —— ⚠️⚠️ **這是 2026-08-08 的快照，已過期**：現況以 `docs/_execution-batches.md` 尾節與 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201839/CLAUDE.md` | GGD — 開發守則 —— 這一份是**規則**，不是說明書。架構與現況看 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-201934/packages/shared/src/content/schema/item.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-202027/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-202146/packages/shared/src/content/schema/config/audioMap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-202157/apps/client/src/render/views/voxelSkin.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-202217/packages/shared/src/content/schema/mapSpecDoc.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-202219/packages/shared/src/content/schema/config/ambientVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-202228/apps/client/src/render/beatDance.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-202230/apps/client/src/render/beatDance.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-205232/content/models/w3x.stock.tornadoelemental.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-205311/tools/skill-remake/heroes/godie-emfr.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-210323/packages/shared/src/content/runtimeAlphaBackfill.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-210333/packages/shared/src/content/runtimeAlphaBackfill.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-210548/packages/shared/src/content/locustTornadoElemental.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-210553/packages/shared/src/content/locustTornadoElemental.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-210600/packages/shared/src/content/locustTornadoElemental.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-215650/docs/_reports/crescent_visual-proof_20260825-2130/shot0_baseline_tick0.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-222816/packages/shared/src/content/locustQuadFamilies.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260825-232153/docs/_reports/penta_visual-proof_20260825-2300/probe.png` | （.png 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000011/tools/w3x-import/stock_vfx_owner_named.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000032/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000056/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000108/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000125/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000145/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000156/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000206/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000227/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-000231/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-002357/docs/_reports/tail_visual-proof_20260826-0000/shot1_hvwd-ex_aquaspike_diff.jpg` | （.jpg 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-003325/content/abilities/godie-hvwd.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-003326/content/champions/godie-hvwd.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-003355/tools/skill-remake/heroes/godie-emfr.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-010707/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-010712/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-010715/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-010718/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-010726/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-010733/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-010748/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-010756/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-010759/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-011127/packages/shared/src/content/vfxDocsBirthVisibility.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-011258/apps/client/src/vfx/beamAuditionWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-012011/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-012600/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-012614/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015455/packages/shared/scripts/deriveCastTimes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015510/packages/shared/scripts/deriveCastTimes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015520/packages/shared/scripts/deriveCastTimes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015524/packages/shared/scripts/deriveCastTimes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015536/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015540/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015544/packages/shared/scripts/deriveCastTimes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015620/packages/shared/scripts/deriveCastTimes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015829/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015842/packages/shared/src/ops/deriveCastTimesFailsLoud.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015846/packages/shared/src/ops/deriveCastTimesFailsLoud.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015853/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015900/packages/shared/src/ops/deriveCastTimesFailsLoud.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-015939/packages/shared/scripts/deriveCastTimes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-020235/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-020351/tools/parallel-gates/ship.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-021339/tools/w3x-import/extract_stock_vfx.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-111436/docs/_reports/TRI-A_temp_20260826-0300.md` | TRI-A 分診報告 —— #300–#559 的 open issue —— 日期 2026-08-26 · lane TRI-A · 範圍：`gh issue list --state open` 落在 #300–#559 的 **23 張** | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-111444/docs/_reports/TRI-A_temp_20260826-0300.md` | TRI-A 分診報告 —— #300–#559 的 open issue —— 日期 2026-08-26 · lane TRI-A · 範圍：`gh issue list --state open` 落在 #300–#559 的 **23 張** | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-112043/tools/w3x-import/test/particles_checks.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-112055/tools/w3x-import/test/particles_checks.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113251/content/ability-templates/tpl-beam-roll.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113353/content/ability-templates/tpl-beam-roll.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113619/content/ability-templates/tpl-beam-roll.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113630/content/ability-templates/tpl-beam-roll.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113639/content/ability-templates/tpl-beam-roll.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113722/docs/_reports/BEAMTRUTH_temp_20260826-1200.md` | 光束砲家族 —— 逐格 JASS 真相稽核（TRUTH-JASS lane） —— 日期：2026-08-26 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113730/docs/_reports/BEAMTRUTH_temp_20260826-1200.md` | 光束砲家族 —— 逐格 JASS 真相稽核（TRUTH-JASS lane） —— 日期：2026-08-26 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113740/docs/_reports/BEAMTRUTH_temp_20260826-1200.md` | 光束砲家族 —— 逐格 JASS 真相稽核（TRUTH-JASS lane） —— 日期：2026-08-26 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113755/docs/_reports/BEAMTRUTH_temp_20260826-1200.md` | 光束砲家族 —— 逐格 JASS 真相稽核（TRUTH-JASS lane） —— 日期：2026-08-26 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113757/apps/client/src/render/modelFxStatic.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-113802/docs/_reports/BEAMTRUTH_temp_20260826-1200.md` | 光束砲家族 —— 逐格 JASS 真相稽核（TRUTH-JASS lane） —— 日期：2026-08-26 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-121249/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-124430/tools/w3x-import/build_ability_w3a.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-124438/tools/w3x-import/build_ability_w3a.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-124516/tools/w3x-import/build_ability_w3a.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-124521/tools/w3x-import/build_ability_w3a.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-124622/tools/w3x-import/build_ability_w3a.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-125749/docs/_reports/beamverify_visual-proof_20260826-1200/frames.md` | 光束砲家族 —— 連續圖片驗收（VERIFY lane · GH#702 · 2026-08-26） —— 台子：`apps/client/public/beam-audition.html?ability=<id>`（`client-beam` :39673，已在跑）。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130333/tools/w3a-translate/gen.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130337/tools/w3a-translate/gen.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130344/tools/w3a-translate/gen.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130351/tools/w3a-translate/gen.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130357/tools/w3a-translate/gen.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130400/tools/w3a-translate/gen.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130550/packages/shared/src/ops/w3aTranslationGaps.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130620/tools/w3a-translate/gap-ledger.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130641/tools/w3a-translate/gen.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130652/tools/w3a-translate/gap-ledger.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-130718/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-134619/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-134640/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-134643/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-134646/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-134653/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-134705/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-134708/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-134725/tools/w3x-import/w3xlib/models.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-134745/tools/w3x-import/w3xlib/models.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-135106/tools/beam-orient/scan.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-135319/content/assets/models/imported/revivehuman.glb` | （.glb 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-140330/content/assets/models/imported/revivehuman.glb` | （.glb 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-140908/content/assets/models/imported/revivehuman.glb` | （.glb 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153345/tools/model-budget/report.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153348/tools/model-budget/report.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153352/tools/model-budget/report.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153355/tools/model-budget/report.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153406/tools/model-budget/report.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153442/scripts/visual-proof.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153454/apps/admin/src/ui/AudioAuditionPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153511/tools/model-budget/report.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153516/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153519/scripts/visual-proof.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153522/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153529/scripts/visual-proof.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153530/tools/model-budget/report.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153532/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153533/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153546/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153555/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153556/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153600/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153621/packages/shared/src/ops/visualProofScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153623/apps/admin/src/config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153639/apps/admin/src/config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153651/apps/client/src/ui/WorldAnchorLayer.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153659/apps/client/src/ui/WorldAnchorLayer.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153725/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153729/apps/client/src/ui/WorldAnchorLayer.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153747/apps/client/src/ui/WorldAnchorLayer.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153756/apps/client/src/ui/WorldAnchorLayer.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153813/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153831/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153834/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153847/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153905/packages/shared/src/ops/ggdAssetsScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153921/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153924/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-153943/packages/shared/src/ops/ggdAssetsScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-154000/apps/client/src/ui/WorldAnchorLayer.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-154013/apps/client/src/ui/WorldAnchorLayer.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-154025/packages/shared/src/ops/ggdAssetsScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-154046/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211400/tools/admin-live/datasets/radar-abilities.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211403/tools/admin-live/datasets/mech-templates.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211406/tools/admin-live/datasets/mech-templates.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211408/tools/admin-live/datasets/mech-templates.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211424/tools/admin-live/datasets/jass-vfx.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211513/tools/admin-live/datasets/ex-roots.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211536/tools/admin-live/datasets/vfx-templates.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211556/tools/admin-live/datasets/vfx-templates.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211613/apps/admin/src/ui/live/MechTemplatesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211701/apps/admin/src/ui/live/Skill90Page.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211706/apps/admin/src/ui/live/Skill90Page.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211711/tools/admin-live/datasets/sfx-map.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211720/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211722/tools/admin-live/datasets/jass-vfx.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211731/tools/admin-live/datasets/skill-authoring.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211748/tools/admin-live/datasets/skill-authoring.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211825/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211830/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-211922/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212128/docs/design/cast-telegraph.md` | 起手預告系統設計（CT / Telegraph System） —— 需求原話：「**CT (起手時間) 很重要，並且一定要有對應的動畫特效等，讓玩家有機會閃躲**」 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212136/docs/design/cast-telegraph.md` | 起手預告系統設計（CT / Telegraph System） —— 需求原話：「**CT (起手時間) 很重要，並且一定要有對應的動畫特效等，讓玩家有機會閃躲**」 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212159/docs/_requirements-audit-gaps.md` | 需求地毯式盤點 — 缺口候選清單（已核對程式碼） —— 來源：四個抽取代理逐字掃完全部 156 個使用者發言（~370 條原子需求），與任務表交叉比對出 39 條「疑似缺口」候選。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212338/tools/skill-remake/refresh_docs.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212342/tools/skill-remake/refresh_docs.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212457/tools/skill-remake/refresh_docs.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212508/tools/skill-remake/refresh_docs.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212743/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212814/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212824/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212829/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212845/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212859/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212923/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212934/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212942/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212947/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-212953/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-213005/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-213210/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-213210/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-213228/packages/shared/src/ops/guardProseNamesTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-213229/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-213239/packages/shared/src/ops/guardMessagesNameTheGenerator.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-214222/tools/parallel-gates/sync-io.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-222300/apps/admin/src/commandPalette.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-222314/apps/admin/src/ui/CommandPalette.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-222328/apps/admin/src/ui/CommandPalette.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-222400/apps/admin/src/navTags.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-222414/apps/admin/src/navTags.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-222521/apps/admin/src/ui/NavMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-222534/apps/admin/src/ui/NavMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260826-222605/apps/admin/src/ui/NavMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-001504/packages/shared/src/sim/systems/ReviveSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-001657/apps/client/src/render/stockGlowAdditive.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-001713/apps/client/src/render/stockGlowAdditive.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-001722/apps/client/src/render/stockGlowAdditive.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-001801/apps/client/src/render/modelFxRigRoundLeak.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002016/apps/client/src/vfx/lightning-bench_temp_20260827.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002017/packages/shared/src/sim/systems/BasicAttackSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002022/apps/client/src/vfx/lightning-bench_temp_20260827.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002030/apps/client/src/vfx/lightning-bench_temp_20260827.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002137/apps/client/src/vfx/lightning-bench_temp_20260827.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002229/packages/shared/src/sim/systems/BasicAttackSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002245/packages/shared/src/sim/systems/BasicAttackSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002300/apps/client/src/vfx/lightning-bench_temp_20260827.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002431/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002450/apps/client/src/render/lifecycleLedger.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002504/apps/client/src/render/lifecycleLedger.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002518/apps/client/src/render/lifecycleLedger.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002539/apps/client/src/ui/PerfOverlay.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002634/apps/client/src/render/modelFxRigRoundLeak.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002752/apps/client/src/render/modelFxRigRoundLeak.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002817/packages/shared/src/content/schema/vfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002833/apps/client/src/vfx/arcBolt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002847/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002857/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002902/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002912/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002927/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002948/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002959/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-002959/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003008/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003012/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003012/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003022/apps/client/src/content/ContentDb.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003048/apps/admin/src/vfxForge.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003050/apps/admin/src/vfxForge.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003058/apps/admin/src/vfxForge.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003101/apps/admin/src/vfxForge.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003104/apps/admin/src/vfxForge.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003147/apps/client/src/render/modelFxRigRoundLeak.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003221/apps/client/src/vfx/vfxHardCap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003227/apps/client/src/vfx/vfxHardCap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003230/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003242/apps/client/src/vfx/vfxHardCap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003244/apps/client/src/render/modelFxRigRoundLeak.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003247/apps/client/src/vfx/ArcBoltFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003307/apps/client/src/vfx/vfxHardCap.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003322/apps/client/src/vfx/vfxHardCap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003338/apps/client/src/vfx/vfxHardCap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003434/apps/client/src/vfx/vfxHardCap.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003450/apps/client/src/vfx/vfxHardCap.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003655/apps/client/src/vfx/arcReshapeDirect.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-003945/apps/client/src/render/dragonslaveShippedChain.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-004222/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010050/docs/_reports/dragonslave_visual-proof_20260827-0030/frames.md` | 🐉 GH#779 莉娜 04-03 龍破斬 — 終端像素證據（beam-audition，2026-08-27 00:30–00:36） —— 頁：`http://localhost:39673/beam-audition.html?ability=godie-h020.e`（`client-bea | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010112/docs/_reports/dragonslave_visual-proof_20260827-0030/frames.md` | 🐉 GH#779 莉娜 04-03 龍破斬 — 終端像素證據（beam-audition，2026-08-27 00:30–00:36） —— 頁：`http://localhost:39673/beam-audition.html?ability=godie-h020.e`（`client-bea | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010547/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010600/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010604/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010609/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010619/apps/admin/src/damageBoardPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010656/apps/admin/src/contentNames.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010703/packages/shared/src/sim/castTimeRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010706/apps/admin/src/contentNames.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010710/packages/shared/src/sim/castTimeRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010715/packages/shared/src/sim/castTimeRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010725/packages/shared/src/sim/castTimeRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010733/packages/shared/src/sim/castTimeRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010747/packages/shared/src/content/schema/config/castTime.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010751/packages/shared/src/content/schema/config/castTime.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010833/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010908/tools/skill-lists/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010918/tools/skill-lists/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-010924/tools/skill-lists/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011032/packages/shared/src/sim/castTimeRules.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011101/packages/shared/src/content/schema/config/feelFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011125/content/config/feel-fx.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011126/apps/admin/src/navPagesRender.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011138/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011141/apps/admin/src/navPagesRender.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011153/packages/shared/src/sim/castTimeRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011201/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011205/packages/shared/src/sim/castTimeRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011357/apps/client/src/vfx/CastPillarFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011407/apps/client/src/vfx/CastPillarFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011414/apps/client/src/vfx/CastPillarFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011420/apps/client/src/vfx/CastPillarFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011539/apps/client/src/vfx/castChargeFx.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011750/apps/client/src/vfx/CastPillarFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011921/apps/client/src/vfx/CastChargeFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011936/apps/client/src/vfx/CastChargeFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-011953/content/config/move-speed-tiers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012134/packages/shared/src/content/schema/common.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012151/packages/shared/src/content/schema/common.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012158/packages/shared/src/content/schema/common.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012203/packages/shared/src/content/schema/common.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012220/packages/shared/src/content/schema/item.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012308/packages/shared/src/content/schema/config/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012322/packages/shared/src/content/schema/config/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012341/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012345/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012351/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012356/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012436/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012441/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012448/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012451/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012454/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012500/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012515/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012522/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012524/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012525/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012534/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012538/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012554/packages/shared/src/content/renderAbilityText.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012641/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012721/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012743/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-012750/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-013456/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-013459/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-013508/packages/shared/src/content/moveSpeedTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-013510/packages/shared/src/content/moveSpeedTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-013843/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-013930/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-013939/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-013948/apps/admin/src/store.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014053/tools/skill-lists/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014055/tools/skill-lists/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014106/tools/skill-lists/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014122/apps/admin/src/ui/SkillListsPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014124/apps/admin/src/ui/SkillListsPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014231/packages/shared/src/content/schema/common.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014251/packages/shared/src/content/abilityProse.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014558/tools/skill-remake/apply_tiers.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014603/tools/skill-remake/apply_tiers.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014805/packages/shared/src/content/moveSpeedTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014807/packages/shared/src/content/moveSpeedTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014827/packages/shared/src/content/moveSpeedTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-014839/packages/shared/src/content/moveSpeedTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-015257/apps/admin/src/navSections.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-040155/docker/review.Dockerfile` | （.Dockerfile 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-040155/tools/review/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-040434/tools/review/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-044535/docs/_review/verdicts/live.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-044924/docs/_review/verdicts/live_temp_20260827-044906.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045537/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045541/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045627/apps/admin/src/contentNames.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045636/apps/admin/src/contentNames.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045645/apps/admin/src/contentNames.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045657/apps/admin/src/ui/MatchesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045702/apps/admin/src/ui/MatchesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045705/apps/admin/src/ui/MatchesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045713/apps/admin/src/ui/MatchesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045746/packages/shared/src/ops/killBountyDocSuperseded.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045750/apps/client/src/render/occlusionZone.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045751/apps/admin/src/contentNames.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045754/apps/admin/src/contentNames.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045803/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045807/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045811/apps/admin/src/ui/AudioAuditionPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045811/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045817/apps/admin/src/ui/AudioAuditionPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045854/packages/shared/src/sim/systems/RegenSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045902/packages/shared/src/sim/stats/statPipeline.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045911/packages/shared/src/sim/abilities/abilitySystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045917/packages/shared/src/sim/effects/manaBarrier.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045920/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045921/packages/shared/src/sim/abilities/toggle.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-045935/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050012/apps/client/src/render/occlusionZone.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050020/packages/shared/src/sim/systems/RegenSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050139/tools/review/adminAuth.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050213/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050353/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050404/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050511/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050517/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050531/packages/shared/src/ops/laneAGenguardHeredoc.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050545/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050613/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050658/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050751/apps/client/src/ui/hud/touchControlsRect.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050801/packages/shared/src/protocol/schema.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050819/packages/shared/src/protocol/schema.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050827/packages/shared/src/ops/killBountyDocSuperseded.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050832/packages/shared/src/protocol/schema.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050834/packages/shared/src/protocol/schema.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050836/packages/shared/src/protocol/schema.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050920/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050937/apps/client/src/render/occlusionZone.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050939/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050943/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050950/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050952/packages/shared/src/ops/killBountyDocSuperseded.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-050956/packages/shared/src/ops/killBountyDocSuperseded.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051008/apps/game-server/src/net/snapshot.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051020/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051156/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051208/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051221/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051226/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051231/packages/shared/src/protocol/messages.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051234/apps/platform/internal/httpx/middleware.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051314/tools/w3x-import/build_pitch.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051345/apps/platform/internal/lobby/hub.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051352/apps/platform/internal/lobby/hub.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051411/apps/platform/internal/lobby/ws.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051422/apps/platform/internal/lobby/ws.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051426/apps/platform/internal/lobby/ws.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051508/apps/platform/internal/config/config.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051625/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051632/apps/platform/cmd/platform/main.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051638/apps/client/src/ui/hud/zzprobe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051651/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051657/tools/w3x-import/build_pitch.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051715/tools/w3x-import/build_pitch.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051730/tools/w3x-import/build_pitch.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051942/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-051947/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-052001/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-052012/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-052019/nginx/nginx.conf` | （.conf 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-052024/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-052026/nginx/nginx.conf` | （.conf 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-052152/packages/shared/src/sim/attackStandstill.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-052243/nginx/nginx.conf` | （.conf 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-052342/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-052833/apps/game-server/src/net/snapshotCensus_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-062925/tools/parallel-gates/sync-io.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063150/scripts/visual-proof.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063212/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063214/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063217/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063219/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063223/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063226/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063232/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063243/apps/client/src/perf/diag.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063246/packages/shared/src/ops/visualProofScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063256/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063301/apps/client/src/ui/WorldAnchorLayer.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063330/scripts/visual-proof.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063331/apps/client/src/perf/frameSegments.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063339/apps/client/src/ui/PerfOverlay.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063436/apps/platform/internal/auth/handlers.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063440/apps/platform/internal/auth/handlers.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063453/apps/platform/internal/auth/handlers.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063459/apps/platform/internal/auth/handlers.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063503/apps/platform/internal/auth/handlers.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063520/apps/platform/internal/config/config.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063654/content/projectiles/imported.wave.ki.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063738/apps/admin/src/session.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063746/apps/admin/src/session.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063808/apps/admin/src/session.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063815/apps/admin/src/session.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063826/apps/admin/src/session.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063845/apps/admin/src/session.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063853/apps/admin/src/session.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063908/apps/admin/src/session.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063937/apps/admin/vite.config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-063947/apps/admin/vite.config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064030/apps/client/vite.config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064033/apps/client/vite.config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064039/apps/client/vite.config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064203/apps/game-server/src/net/zvdbg_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064215/apps/game-server/src/net/zvdbg_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064239/apps/game-server/src/net/zvdbg_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064251/apps/admin/src/session.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064251/apps/client/vite.config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064251/apps/platform/internal/auth/refresh_cookie.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064301/apps/platform/internal/auth/refresh_cookie.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064306/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064337/apps/game-server/src/net/zvdbg_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064506/apps/game-server/src/net/zvmeasure_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-064925/apps/game-server/src/net/zoneView.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-065408/apps/client/src/perf/frameSegments.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-065410/apps/client/src/perf/frameSegments.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-065440/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-074714/apps/admin/src/ui/MatchesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-074719/apps/admin/src/ui/MatchesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-074734/apps/admin/src/ui/MapReportPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-074738/apps/admin/src/ui/MapReportPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-074739/apps/admin/src/ui/MapReportPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-074746/apps/admin/src/ui/ArenaPoolPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-074758/apps/admin/src/ui/ArenaPoolPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075052/tools/skill-templates/scan_shapes.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075114/tools/skill-templates/scan_shapes.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075125/packages/shared/src/content/schema/arena.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075140/packages/shared/src/content/schema/arena.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075245/packages/shared/src/content/schema/config/configUnionCoversDirectory.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075303/packages/shared/src/content/schema/config/configUnionCoversDirectory.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075314/apps/client/src/audio/combatSfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075324/apps/client/src/audio/combatSfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075341/apps/client/src/audio/AudioSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075342/packages/shared/src/content/refs.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075353/packages/shared/src/content/refs.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075400/packages/shared/src/content/refs.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075406/apps/client/src/audio/sfxReachability.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075411/apps/client/src/audio/sfxReachability.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075424/apps/client/src/audio/sfxReachability.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075459/packages/shared/src/content/templateExpandedRefs.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075509/packages/shared/src/content/templateExpandedRefs.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075719/apps/client/src/audio/combatSfx.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075723/packages/shared/src/content/templateExpandedRefs.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075725/apps/client/src/audio/combatSfx.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075728/apps/client/src/GameApp.zoneCull.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075732/packages/shared/src/content/templateExpandedRefs.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075736/apps/client/src/ui/hud/mobHealthBarWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075756/apps/client/src/audio/combatSfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-075803/packages/shared/src/content/refs.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-080115/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-080122/packages/shared/src/content/arenaCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-080347/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-082740/content/champions/godie-h02u.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-083052/packages/shared/src/content/laneRChampionAbilitySlotIdentity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-091647/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-091650/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-091657/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-091700/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-091720/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-091726/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-091733/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-091740/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092030/tools/w3x-import/extract_particles.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092107/packages/shared/src/ops/laneVParticlesRegenIsIdempotent.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092417/packages/shared/src/ops/laneVDryRunWritesNothing.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092527/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092543/packages/shared/src/ops/laneVDryRunWritesNothing.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092551/packages/shared/src/ops/laneVDryRunWritesNothing.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092611/packages/shared/src/ops/laneVDryRunWritesNothing.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092643/packages/shared/src/ops/laneVDryRunWritesNothing.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092649/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092724/packages/shared/src/ops/laneVDryRunWritesNothing.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092949/scripts/commit-ref-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-092959/scripts/commit-ref-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093003/scripts/commit-ref-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093008/scripts/commit-ref-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093113/scripts/commit-ref-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093117/scripts/commit-ref-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093126/packages/shared/src/ops/laneVCommitRefLint.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093157/packages/shared/src/ops/laneVCommitRefLint.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093826/content/abilities/godie-hart.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093837/content/assets/audio/sfx/fx/GENERATE.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093838/content/abilities/godie-hart.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-093926/content/assets/audio/sfx/fx/GENERATE.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094212/docs/_reports/laneW_temp_20260827-0930.md` | lane W —— #565 / #674 / #751 逐項查證與落地 —— 日期 2026-08-27 · 柵欄 `content/**` · `tools/skill-remake/**` · `tools/w3x-import/**` | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094247/apps/client/src/audio/nameVoice.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094301/apps/client/src/audio/nameVoice.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094305/apps/client/src/audio/nameVoice.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094315/apps/client/src/audio/nameVoice.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094319/apps/client/src/audio/nameVoice.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094323/apps/client/src/audio/nameVoice.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094338/apps/client/src/audio/championVoice.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094423/tools/parallel-gates/packages.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094430/tools/tts-gen/src/build-champ-names.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094649/apps/client/src/audio/fxGenerateScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094712/apps/client/src/audio/fxGenerateScript.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-094736/apps/client/src/audio/cryConfirm.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-102942/apps/client/src/ui/panels/MerchantShop.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103153/scripts/genguard.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103205/tools/parallel-gates/normalizers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103224/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103347/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103352/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103634/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103645/packages/shared/src/ops/laneYQuarantineAgreesWithGenguard.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103651/packages/shared/src/ops/laneYQuarantineAgreesWithGenguard.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103656/apps/client/src/ui/hud/hudLayout.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-103744/scripts/genguard.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104002/apps/client/src/ui/hud/touchControlsCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104022/apps/client/src/ui/hud/touchControlsCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104052/apps/client/src/ui/hud/versionBadgeBand.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104123/scripts/ticket-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104145/apps/client/src/ui/hud/zzProbeTemp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104205/scripts/ticket-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104216/scripts/ticket-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104245/apps/client/src/ui/hud/hudLayout.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104315/scripts/ticket-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104401/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104432/scripts/ticket-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104511/scripts/ticket-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104709/apps/client/src/ui/components/AbilityBar.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-104858/tools/parallel-gates/trace.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-105032/tools/parallel-gates/trace.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-105718/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113239/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113519/content/config/roster.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113610/apps/client/src/render/AssetManager.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113802/apps/client/src/render/textureDedup.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113810/apps/client/src/render/textureDedup.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113836/apps/client/src/render/textureDedup.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113845/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113902/apps/client/src/render/textureDedup.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113913/apps/client/src/render/textureDedup.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113916/apps/client/src/render/AssetManager.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-113923/apps/client/src/render/AssetManager.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-114131/tools/model-budget/emit_report.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-114142/tools/model-budget/emit_report.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-114147/tools/model-budget/emit_report.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-114317/tools/model-budget/baseline.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-114537/docs/_reports/texture-dedup_visual-proof_20260827-1144/frames.md` | texture-dedup — 連續圖片驗收（GH#____） —— 📅 **證據的時間身分（GH#795）**：`HEAD=21c218fd` 工作樹 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-123006/content/config/vfx-ability-art.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-123521/content/abilities/godie-nbbc.e.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-125739/tools/tts-gen/src/build-champ-names.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-125755/tools/tts-gen/src/build-champ-names.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-125953/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130023/apps/admin/src/store.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130050/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130053/apps/admin/src/store.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130107/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130127/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130132/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130145/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130149/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130152/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130159/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130209/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130212/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130214/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130243/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130310/tools/tts-gen/src/build-champ-names.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130322/apps/admin/src/store.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130333/tools/tts-gen/src/build-champ-names.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130340/apps/admin/src/store.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130354/tools/skill-remake/heroes/godie-hapm.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130355/tools/skill-remake/heroes/godie-ewar.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130706/apps/admin/src/matchConfig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-130717/apps/admin/src/matchConfig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131016/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131057/packages/shared/src/content/castTimeProse.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131102/packages/shared/src/content/castTimeProse.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131128/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131142/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131259/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131308/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131324/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131330/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131342/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131351/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131400/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131424/apps/admin/src/ui/ConfigDocPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131449/apps/admin/src/ui/ConfigDocPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131455/apps/admin/src/ui/ConfigDocPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131505/apps/admin/src/ui/ConfigDocPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131609/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131613/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131802/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-131818/apps/admin/src/configDocCoverage.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132119/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132136/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132150/apps/admin/src/configTables.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132205/tools/w3x-import/extract_invocation_params.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132214/tools/w3x-import/extract_invocation_params.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132223/tools/w3x-import/extract_invocation_params.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132227/tools/w3x-import/extract_invocation_params.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132234/tools/w3x-import/extract_invocation_params.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132259/tools/w3x-import/extract_invocation_params.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132525/tools/w3x-import/build_vfx_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132528/tools/w3x-import/build_vfx_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132538/tools/w3x-import/build_vfx_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132623/tools/w3x-import/build_vfx_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132626/packages/shared/src/sim/facingLock.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132640/packages/shared/src/sim/facingLock.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132643/packages/shared/src/sim/facingLock.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132649/packages/shared/src/sim/facingLock.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132715/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132727/content/assets/vfx/w3x-ability-provenance.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132814/tools/review/features.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132823/tools/review/features.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132825/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132826/tools/review/features.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132901/packages/shared/src/sim/combatFeel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132936/tools/review/fix-anchor.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-132941/tools/review/fix-anchor.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133005/tools/review/fix-anchor.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133011/tools/review/features.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133018/tools/capability-export/export.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133022/tools/capability-export/export.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133030/content/assets/vfx/w3x-ability-provenance.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133156/tools/review/triage.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133206/packages/shared/src/ops/laneDOCSContractSilence.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133210/tools/review/triage.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133213/tools/review/triage.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133218/tools/review/triage.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133221/packages/shared/src/ops/laneDOCSContractSilence.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133227/tools/review/triage.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133231/packages/shared/src/ops/laneDOCSContractSilence.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133232/tools/review/triage.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133309/tools/review/check.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133350/tools/admin-live/datasets/jass-vfx.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133449/tools/w3x-import/extract_invocation_params.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133450/apps/game-server/src/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133454/apps/game-server/src/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133503/apps/game-server/src/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133514/apps/game-server/src/healthz.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133517/apps/game-server/src/healthz.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133517/tools/w3x-import/extract_invocation_params.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133543/apps/game-server/src/contentCacheHealth.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133546/apps/game-server/src/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133549/apps/game-server/src/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133550/tools/review/fix-anchor.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133559/content/champions/godie-o02p.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133559/packages/shared/src/content/laneFMeleeWeaponTags.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133602/tools/review/fix-anchor.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133615/packages/shared/src/content/laneFMeleeWeaponTags.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133656/tools/w3x-import/build_vfx_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133701/tools/w3x-import/build_vfx_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133702/apps/game-server/src/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133705/tools/w3x-import/build_vfx_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133926/docs/_reports/laneCENSUS_temp_20260827-1400.md` | lane CENSUS —— #777 · #762 · #529（2026-08-27） —— ⚠️ `_temp_` 檔：這份是**一次工作的完整紀錄**，過期就搬 `docs/legacy/_temp-retired/`。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133929/packages/shared/src/ops/laneREVIEWFixAnchor.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133935/packages/shared/src/ops/laneREVIEWFixAnchor.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133940/packages/shared/src/ops/laneREVIEWFixAnchor.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-133950/packages/shared/src/ops/laneREVIEWFixAnchor.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-134009/packages/shared/src/ops/laneREVIEWFixAnchor.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-134107/apps/game-server/src/match/seedscan_temp.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-134122/apps/game-server/src/match/settlement.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-134753/apps/client/src/ui/hud/measure_temp_20260827.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135031/apps/client/src/audio/selectVoiceLadder.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135042/apps/client/src/render/combatFeedback.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135050/apps/client/src/audio/selectVoiceLadder.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135127/apps/client/src/audio/spatialPolicy.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135131/apps/client/src/vfx/vfxPresets.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135137/apps/client/src/audio/spatialPolicy.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135242/apps/client/src/vfx/ScreenFxLayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135254/apps/client/src/vfx/ScreenFxLayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135300/apps/client/src/vfx/ScreenFxLayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135316/apps/client/src/vfx/ScreenFxLayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135620/apps/client/src/audio/selectVoiceCoverage.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135630/apps/client/src/audio/selectVoiceCoverage.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135723/apps/client/src/audio/selectVoiceCoverage.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135731/apps/client/src/ui/cooldownView.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135739/apps/client/src/audio/selectVoiceCoverage.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135745/apps/client/src/audio/selectVoiceCoverage.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135751/apps/client/src/ui/castAnnounce.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135755/apps/client/src/ui/castAnnounce.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135801/apps/client/src/audio/selectVoiceCoverage.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135809/apps/client/src/ui/castAnnounce.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135818/scripts/lane-plan.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135845/apps/client/src/audio/nameVoice.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135907/scripts/lane-plan.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135929/apps/client/src/audio/statusVoiceEdges.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-135940/apps/client/src/audio/statusVoiceEdges.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140123/scripts/lane-plan.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140240/apps/client/src/ui/hud/hudBottomCluster.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140245/apps/client/src/ui/hud/hudBottomCluster.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140302/packages/shared/src/sim/systems/GuardianSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140306/packages/shared/src/sim/systems/GuardianSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140315/packages/shared/src/sim/systems/GuardianSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140320/packages/shared/src/sim/systems/GuardianSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140324/packages/shared/src/sim/systems/GuardianSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140330/packages/shared/src/sim/systems/GuardianSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140345/packages/shared/src/sim/SimWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140400/packages/shared/src/sim/SimWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140407/apps/client/src/render/combatFeedback.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140420/apps/client/src/render/combatFeedback.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140436/packages/shared/src/sim/SimWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140734/packages/shared/src/protocol/schema.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140749/apps/game-server/src/net/snapshot.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140820/apps/game-server/src/net/eventFanout.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140916/apps/game-server/src/match/arenaRules.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140933/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140939/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-140952/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141111/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141134/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141143/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141154/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141206/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141215/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141232/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141246/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141406/content/abilities/godie-u00n.passive.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141421/packages/shared/src/ops/ticketLint.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141441/apps/client/src/vfx/auditionCalibrate.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141512/apps/game-server/src/match/objectiveDuel.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141515/apps/game-server/src/match/objectiveDuel.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141524/apps/client/src/vfx/auditionCalibrate.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141559/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141612/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-141838/docs/_reports/laneCLAIM_temp_20260827-1800.md` | lane CLAIM —— 卡面空宣稱與變身退場（#648 · #623 · #425） —— 2026-08-27。HEAD = `fc710f1d`。⛔ 這一份是**暫存報告**（`_temp_`），過期就進 legacy。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-153711/content/config/vfx-ability-art.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225618/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225622/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225623/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225643/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225657/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225703/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225732/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225735/apps/client/src/render/AssetManager.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225808/packages/shared/src/content/schema/config/vfxCleanup.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225814/packages/shared/src/content/schema/config/vfxCleanup.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225829/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225832/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225836/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225842/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225848/content/config/vfx-cleanup.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-225909/apps/client/src/vfx/vfxCleanupPolicy.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230133/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230149/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230155/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230203/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230208/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230219/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230227/apps/admin/src/ui/live/ExRootsPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230232/apps/admin/src/ui/live/ExRootsPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230246/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230247/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230253/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230255/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230300/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230301/apps/client/src/ui/PerfOverlay.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230327/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230333/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230707/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230835/apps/client/src/render/roundPurge.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230850/apps/client/src/render/roundPurge.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-230958/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-231004/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-231013/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-231054/content/abilities/godie-e008.q.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260827-231305/packages/shared/src/ops/liveWriteCoverage.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-005942/packages/shared/src/content/schema/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010003/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010005/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010807/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010809/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010816/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010820/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010906/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010912/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010913/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-010924/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-011019/packages/shared/src/content/schema/config/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-011025/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-011027/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-011237/packages/shared/src/content/schema/config/index.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-011351/apps/admin/src/configForms.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-011803/apps/client/src/vfx/vfxScriptShippedChain.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-011852/packages/shared/src/content/schema/vfxScript.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-011932/content/vfx-scripts/godie-h020.e.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-012109/apps/client/src/vfx/vfxScriptShippedChain.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-012153/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013045/apps/client/src/vfx/beamAuditionWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013111/apps/client/src/vfx/beamAuditionWorld.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013200/apps/client/vite.config.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013551/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013722/packages/shared/src/content/schema/vfxScript.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013726/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013738/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013744/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013932/apps/client/src/vfx/vfxScriptStudio.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-013951/apps/client/src/vfx/vfxScriptStudio.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-014054/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-014101/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-014518/packages/shared/src/sim/effects/modelFxPlacement.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-015648/apps/admin/src/ui/ContentPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-015649/apps/admin/src/ui/ContentPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-015732/tools/vfx-forge/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-015754/tools/vfx-forge/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-020304/packages/shared/src/sim/effects/delayed.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-020356/packages/shared/src/content/schema/vfxScript.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-024920/apps/client/src/vfx/__exdiag.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-032533/docs/_reports/alpha-keying-rootcause_temp_20260828-0321.md` | 去背（alpha keying）根因稽核 —— Rider EX 地上魔法陣 —— owner 2026-08-28：「Rider EX 地上魔法陣沒有去背透明，**你已經不是第一次沒去背乾淨**，請深入檢討根因改善」 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-032537/docs/_reports/alpha-keying-rootcause_temp_20260828-0321.md` | 去背（alpha keying）根因稽核 —— Rider EX 地上魔法陣 —— owner 2026-08-28：「Rider EX 地上魔法陣沒有去背透明，**你已經不是第一次沒去背乾淨**，請深入檢討根因改善」 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-032542/docs/_reports/alpha-keying-rootcause_temp_20260828-0321.md` | 去背（alpha keying）根因稽核 —— Rider EX 地上魔法陣 —— owner 2026-08-28：「Rider EX 地上魔法陣沒有去背透明，**你已經不是第一次沒去背乾淨**，請深入檢討根因改善」 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-032548/docs/_reports/alpha-keying-rootcause_temp_20260828-0321.md` | 去背（alpha keying）根因稽核 —— Rider EX 地上魔法陣 —— owner 2026-08-28：「Rider EX 地上魔法陣沒有去背透明，**你已經不是第一次沒去背乾淨**，請深入檢討根因改善」 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-141812/packages/shared/src/sim/effects/blink.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-141812/packages/shared/src/sim/effects/clientCues.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-144207/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-164348/apps/admin/src/ui/App.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-164527/apps/admin/src/__probe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-164547/apps/admin/src/__probe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-164717/apps/admin/src/__probe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-164717/apps/admin/src/consoleFooter.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-164736/apps/admin/src/ui/App.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-173915/packages/shared/src/sim/systems/OrderSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-174006/apps/game-server/src/match/MatchController.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-174542/apps/client/src/render/vfx/W3xEmitterRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-174554/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-174652/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-174705/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-174959/apps/client/src/render/__doubleCast.probe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-175525/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-175531/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-175545/tools/admin-live/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-175710/packages/shared/src/ops/liveChecksumCache.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-175803/tools/admin-live/datasets/locust-orbs.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-175819/tools/admin-live/datasets/locust-orbs.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-175822/tools/admin-live/datasets/locust-orbs.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-175850/tools/admin-live/datasets/mech-templates.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-175935/packages/shared/src/content/vfxBindings.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180032/apps/admin/src/ui/live/LocustOrbsPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180035/apps/admin/src/ui/live/LocustOrbsPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180050/apps/admin/src/ui/live/LocustOrbsPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180054/packages/shared/src/content/vfxBindings.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180055/packages/shared/src/content/vfxBindings.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180107/apps/admin/src/ui/live/MechTemplatesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180112/apps/admin/src/ui/live/MechTemplatesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180126/apps/admin/src/ui/live/MechTemplatesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180145/tools/admin-live/cache.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180156/tools/admin-live/cache.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180211/apps/admin/src/ui/live/LocustOrbsPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180415/tools/admin-live/datasets/vfx-templates.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180418/tools/admin-live/datasets/vfx-templates.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180427/apps/admin/src/ui/live/VfxTemplatesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180434/apps/admin/src/ui/live/VfxTemplatesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180440/apps/admin/src/ui/live/VfxTemplatesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180442/apps/admin/src/ui/live/VfxTemplatesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180450/apps/admin/src/ui/live/VfxTemplatesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-180522/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-181052/apps/client/src/render/stockGlowAdditive.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-181107/apps/client/src/render/stockGlowAdditive.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-181430/content/models/imported.midchildernanohaaura.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-181519/content/ability-templates/tpl-locust-orb.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-181703/apps/client/src/render/stockGlowAdditive.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-181709/apps/client/src/render/stockGlowAdditive.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-181717/apps/client/src/render/stockGlowAdditive.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-182451/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-182508/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-190209/packages/shared/src/sim/effects/__dbg2.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-192912/apps/platform/internal/platformarchive/coverage_test.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-192917/apps/platform/internal/platformarchive/coverage_test.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260828-210845/apps/client/src/vfx/vfxScriptFields.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-050918/docker/.env` | （無副檔名 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-090012/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-093902/.claude/worktrees/wf_97bbdb13-479-5/tools/admin-live/datasets/radar-abilities.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-093921/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-093933/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-093938/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-093941/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-093950/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-093959/.claude/worktrees/wf_a0c1e537-f66-3/apps/client/src/ui/panels/settlementModel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094019/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094025/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094035/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094044/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094107/.claude/worktrees/wf_97bbdb13-479-2/tools/admin-live/datasets/jass-vfx.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094111/.claude/worktrees/wf_97bbdb13-479-2/tools/admin-live/datasets/jass-vfx.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094136/.claude/worktrees/wf_97bbdb13-479-2/apps/admin/src/ui/live/JassVfxPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094155/.claude/worktrees/wf_97bbdb13-479-2/apps/admin/src/ui/live/JassVfxPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094201/.claude/worktrees/wf_97bbdb13-479-2/apps/admin/src/ui/live/JassVfxPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094204/.claude/worktrees/wf_97bbdb13-479-2/apps/admin/src/ui/live/JassVfxPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094207/.claude/worktrees/wf_97bbdb13-479-2/apps/admin/src/ui/live/JassVfxPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094212/.claude/worktrees/wf_97bbdb13-479-5/apps/admin/src/ui/live/RadarAbilitiesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094216/.claude/worktrees/wf_a0c1e537-f66-4/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094220/.claude/worktrees/wf_97bbdb13-479-2/apps/admin/src/ui/live/JassVfxPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094226/.claude/worktrees/wf_a0c1e537-f66-4/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094246/.claude/worktrees/wf_a0c1e537-f66-4/apps/client/src/ui/hud/SelfStatusBar.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094254/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094256/.claude/worktrees/wf_a0c1e537-f66-3/apps/client/src/ui/panels/settlementModel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094305/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094307/.claude/worktrees/wf_a0c1e537-f66-3/apps/client/src/ui/panels/settlementModel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094319/.claude/worktrees/wf_a0c1e537-f66-5/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094326/.claude/worktrees/wf_a0c1e537-f66-5/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094341/.claude/worktrees/wf_a0c1e537-f66-5/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094347/.claude/worktrees/wf_a0c1e537-f66-5/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094353/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094403/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094408/.claude/worktrees/wf_a0c1e537-f66-5/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094410/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094415/.claude/worktrees/wf_a0c1e537-f66-5/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094424/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094430/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094435/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094435/.claude/worktrees/wf_a0c1e537-f66-3/apps/client/src/ui/panels/settlementModel.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094447/.claude/worktrees/wf_a0c1e537-f66-4/apps/client/src/ui/hud/SelfStatusBar.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094450/.claude/worktrees/wf_a0c1e537-f66-4/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094452/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094452/.claude/worktrees/wf_97bbdb13-479-6/tools/admin-live/datasets/skill90.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094500/.claude/worktrees/wf_97bbdb13-479-6/tools/admin-live/datasets/skill90.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094502/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094506/.claude/worktrees/wf_a0c1e537-f66-4/apps/client/src/ui/hud/SelfStatusBar.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094507/.claude/worktrees/wf_a0c1e537-f66-4/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094509/.claude/worktrees/wf_97bbdb13-479-6/tools/admin-live/datasets/skill90.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094515/.claude/worktrees/wf_97bbdb13-479-6/tools/admin-live/datasets/skill90.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094525/.claude/worktrees/wf_97bbdb13-479-5/tools/admin-live/datasets/radar-abilities.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094531/.claude/worktrees/wf_97bbdb13-479-6/tools/admin-live/datasets/skill90.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094532/.claude/worktrees/wf_97bbdb13-479-5/tools/admin-live/datasets/radar-abilities.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094543/.claude/worktrees/wf_97bbdb13-479-6/tools/admin-live/datasets/skill90.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094547/.claude/worktrees/wf_a0c1e537-f66-1/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094552/.claude/worktrees/wf_a0c1e537-f66-1/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094559/.claude/worktrees/wf_a0c1e537-f66-1/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094603/.claude/worktrees/wf_97bbdb13-479-1/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094608/.claude/worktrees/wf_a0c1e537-f66-1/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094610/.claude/worktrees/wf_a0c1e537-f66-5/apps/client/src/render/vfx/castHeightApplied.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094617/.claude/worktrees/wf_97bbdb13-479-6/apps/admin/src/ui/live/Skill90Page.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094618/.claude/worktrees/wf_97bbdb13-479-1/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094627/.claude/worktrees/wf_97bbdb13-479-1/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094630/.claude/worktrees/wf_97bbdb13-479-1/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094637/.claude/worktrees/wf_97bbdb13-479-1/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094637/.claude/worktrees/wf_97bbdb13-479-2/tools/admin-live/datasets/jass-vfx.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094638/.claude/worktrees/wf_97bbdb13-479-6/apps/admin/src/ui/live/Skill90Page.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094640/.claude/worktrees/wf_97bbdb13-479-1/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094651/.claude/worktrees/wf_97bbdb13-479-2/tools/admin-live/datasets/jass-vfx.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094655/.claude/worktrees/wf_97bbdb13-479-1/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094702/.claude/worktrees/wf_a0c1e537-f66-2/packages/shared/src/content/schema/effects/floatingText.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094703/.claude/worktrees/wf_97bbdb13-479-1/apps/admin/src/ui/live/MdlFamiliesPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094703/.claude/worktrees/wf_97bbdb13-479-6/apps/admin/src/ui/live/Skill90Page.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094711/.claude/worktrees/wf_a0c1e537-f66-2/packages/shared/src/content/schema/effects/floatingText.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094717/.claude/worktrees/wf_97bbdb13-479-6/apps/admin/src/ui/live/Skill90Page.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094722/.claude/worktrees/wf_a0c1e537-f66-2/packages/shared/src/sim/effects/clientCues.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094725/.claude/worktrees/wf_97bbdb13-479-6/apps/admin/src/ui/live/Skill90Page.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094727/.claude/worktrees/wf_a0c1e537-f66-2/packages/shared/src/sim/effects/clientCues.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094728/.claude/worktrees/wf_97bbdb13-479-6/apps/admin/src/ui/live/Skill90Page.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094730/.claude/worktrees/wf_a0c1e537-f66-2/packages/shared/src/sim/effects/clientCues.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094746/.claude/worktrees/wf_a0c1e537-f66-1/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094749/.claude/worktrees/wf_a0c1e537-f66-2/apps/client/src/vfx/FloatingTextFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094805/.claude/worktrees/wf_a0c1e537-f66-2/apps/client/src/vfx/FloatingTextFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094808/.claude/worktrees/wf_a0c1e537-f66-2/apps/client/src/vfx/FloatingTextFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094812/.claude/worktrees/wf_a0c1e537-f66-5/tools/vfx-bind/scan.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094815/.claude/worktrees/wf_a0c1e537-f66-2/apps/client/src/vfx/FloatingTextFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094819/.claude/worktrees/wf_a0c1e537-f66-5/tools/vfx-bind/scan.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094820/.claude/worktrees/wf_a0c1e537-f66-2/apps/client/src/vfx/FloatingTextFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094928/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-094938/.claude/worktrees/wf_97bbdb13-479-1/tools/admin-live/datasets/mdl-families.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095027/.claude/worktrees/wf_97bbdb13-479-6/content/config/cooldown-tiers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095029/.claude/worktrees/wf_a0c1e537-f66-1/apps/client/src/render/vfx/stockEmitterWindow.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095034/.claude/worktrees/wf_a0c1e537-f66-1/apps/client/src/render/vfx/stockEmitterWindow.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095038/.claude/worktrees/wf_97bbdb13-479-6/tools/admin-live/datasets/skill90.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095038/.claude/worktrees/wf_a0c1e537-f66-5/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095051/.claude/worktrees/wf_a0c1e537-f66-5/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095052/.claude/worktrees/wf_97bbdb13-479-6/tools/admin-live/datasets/skill90.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095055/.claude/worktrees/wf_97bbdb13-479-6/content/config/cooldown-tiers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095059/.claude/worktrees/wf_97bbdb13-479-3/apps/admin/tsconfig.probe_temp_20260829.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095124/.claude/worktrees/wf_97bbdb13-479-6/apps/admin/src/ui/live/Skill90Page.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095128/.claude/worktrees/wf_a0c1e537-f66-1/apps/client/src/render/vfx/stockEmitterWindow.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095215/.claude/worktrees/wf_a0c1e537-f66-1/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095226/.claude/worktrees/wf_a0c1e537-f66-2/apps/client/src/vfx/FloatingTextFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095228/.claude/worktrees/wf_a0c1e537-f66-1/apps/client/src/render/vfx/w3xAbilityArt.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095231/.claude/worktrees/wf_a0c1e537-f66-1/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095238/.claude/worktrees/wf_a0c1e537-f66-2/apps/client/src/vfx/FloatingTextFx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095303/.claude/worktrees/wf_a0c1e537-f66-1/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095346/.claude/worktrees/wf_a0c1e537-f66-2/packages/shared/src/content/fieldAdoption.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095407/.claude/worktrees/wf_a0c1e537-f66-1/packages/shared/src/ops/stockRibbonReport.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095417/.claude/worktrees/wf_a0c1e537-f66-1/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095427/.claude/worktrees/wf_a0c1e537-f66-1/tools/w3x-import/convert_stock_model.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095623/.claude/worktrees/wf_a0c1e537-f66-2/packages/shared/src/sim/effects/variants/floatingText.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095718/.claude/worktrees/wf_a0c1e537-f66-2/packages/shared/src/sim/effects/variants/floatingText.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-095722/.claude/worktrees/wf_a0c1e537-f66-2/packages/shared/src/sim/effects/variants/floatingText.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103322/.claude/worktrees/wf_648b20db-433-3/packages/shared/scripts/buildIndexes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103327/.claude/worktrees/wf_648b20db-433-3/packages/shared/scripts/buildIndexes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103521/.claude/worktrees/wf_648b20db-433-3/packages/shared/src/content/buildIndexesValidates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103617/.claude/worktrees/wf_648b20db-433-3/packages/shared/scripts/buildIndexes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103658/.claude/worktrees/wf_648b20db-433-3/packages/shared/scripts/buildIndexes.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103711/.claude/worktrees/wf_648b20db-433-6/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103719/.claude/worktrees/wf_648b20db-433-6/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103722/.claude/worktrees/wf_648b20db-433-6/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103732/.claude/worktrees/wf_648b20db-433-1/tools/admin-live/datasets/sfx-map.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103742/.claude/worktrees/wf_648b20db-433-5/tools/skill-remake/batch1.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103743/.claude/worktrees/wf_648b20db-433-1/tools/admin-live/datasets/sfx-map.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103749/.claude/worktrees/wf_648b20db-433-1/tools/admin-live/datasets/sfx-map.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103752/.claude/worktrees/wf_648b20db-433-1/tools/admin-live/datasets/sfx-map.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103813/.claude/worktrees/wf_648b20db-433-1/tools/admin-live/datasets/sfx-map.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103819/.claude/worktrees/wf_648b20db-433-1/tools/admin-live/datasets/sfx-map.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103840/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103858/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103908/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103911/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103916/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103919/.claude/worktrees/wf_648b20db-433-1/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103938/.claude/worktrees/wf_648b20db-433-1/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103945/.claude/worktrees/wf_648b20db-433-1/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103950/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103952/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-103959/.claude/worktrees/wf_648b20db-433-1/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104001/.claude/worktrees/wf_648b20db-433-5/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104009/.claude/worktrees/wf_648b20db-433-1/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104014/.claude/worktrees/wf_648b20db-433-1/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104024/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104025/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104029/.claude/worktrees/wf_648b20db-433-1/apps/admin/src/ui/live/SfxMapPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104036/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/skillsSyncCoversGenerators.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104054/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104102/.claude/worktrees/wf_648b20db-433-6/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104106/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/skillsSyncCoversGenerators.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104124/.claude/worktrees/wf_648b20db-433-6/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104128/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/skillsSyncCoversGenerators.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104137/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104141/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/skillsSyncCoversGenerators.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104151/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104158/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104205/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104230/.claude/worktrees/wf_648b20db-433-5/packages/shared/src/ops/formPairGateNeverWritesBaseline.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104238/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104242/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104259/.claude/worktrees/wf_648b20db-433-2/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104300/.claude/worktrees/wf_648b20db-433-5/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104307/.claude/worktrees/wf_648b20db-433-2/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104320/.claude/worktrees/wf_648b20db-433-5/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104326/.claude/worktrees/wf_648b20db-433-2/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104341/.claude/worktrees/wf_648b20db-433-2/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104354/.claude/worktrees/wf_648b20db-433-2/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104426/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104439/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104448/.claude/worktrees/wf_648b20db-433-5/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104450/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104454/.claude/worktrees/wf_648b20db-433-5/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104530/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104535/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104539/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104604/.claude/worktrees/wf_648b20db-433-6/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104617/.claude/worktrees/wf_648b20db-433-6/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104623/.claude/worktrees/wf_648b20db-433-6/scripts/genrun.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104634/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/syncIoRuntimeReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104643/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104658/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104702/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104705/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/filter_mode_probe.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104709/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/syncIoRuntimeReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104728/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/syncIoRuntimeReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104733/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/syncIoRuntimeReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104737/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/syncIoRuntimeReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104741/.claude/worktrees/wf_648b20db-433-6/packages/shared/src/ops/syncIoRuntimeReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104828/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104832/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104849/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104852/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104906/.claude/worktrees/wf_648b20db-433-2/apps/admin/renderprobe_temp_20260829-1050.mts` | （.mts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-104939/.claude/worktrees/wf_648b20db-433-2/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105104/.claude/worktrees/wf_648b20db-433-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105147/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105149/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105153/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105201/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105208/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105212/.claude/worktrees/wf_648b20db-433-2/tools/admin-live/datasets/treasures.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105221/.claude/worktrees/wf_648b20db-433-2/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105225/.claude/worktrees/wf_648b20db-433-2/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-105231/.claude/worktrees/wf_648b20db-433-2/apps/admin/src/ui/live/TreasuresPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112353/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112438/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112452/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112514/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112525/.claude/worktrees/wf_76b5e9f9-b99-4/apps/client/src/vfx/vfxHardCap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112545/.claude/worktrees/wf_76b5e9f9-b99-1/probe_temp_viewgate.mts` | （.mts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112621/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112628/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/_scratch_react.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112642/.claude/worktrees/wf_76b5e9f9-b99-1/packages/shared/probe_temp_viewgate.mts` | （.mts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112752/.claude/worktrees/wf_76b5e9f9-b99-4/apps/client/src/vfx/vfxHardCap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112813/.claude/worktrees/wf_76b5e9f9-b99-4/apps/client/src/vfx/vfxHardCap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112815/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/_scratch_measure.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112845/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/touchControlsCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112849/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112852/.claude/worktrees/wf_76b5e9f9-b99-1/packages/shared/src/protocol/schema.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112856/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/touchControlsCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112907/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/touchControlsCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112910/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-112935/.claude/worktrees/wf_76b5e9f9-b99-2/tools/parallel-gates/normalizers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113010/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/touchControlsCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113026/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/SelfStatusBar.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113029/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/touchControlsCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113107/.claude/worktrees/wf_76b5e9f9-b99-2/tools/parallel-gates/normalizers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113107/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/touchControlsCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113111/.claude/worktrees/wf_76b5e9f9-b99-6/apps/client/src/ui/hud/touchControlsCollision.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113118/.claude/worktrees/wf_76b5e9f9-b99-2/tools/parallel-gates/normalizers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113141/.claude/worktrees/wf_76b5e9f9-b99-1/apps/client/src/net/RoomStore.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113147/.claude/worktrees/wf_76b5e9f9-b99-3/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113205/.claude/worktrees/wf_76b5e9f9-b99-3/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113211/.claude/worktrees/wf_76b5e9f9-b99-5/packages/shared/src/sim/weaponClassCoverage.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113215/.claude/worktrees/wf_76b5e9f9-b99-5/packages/shared/src/sim/weaponClassCoverage.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113226/.claude/worktrees/wf_76b5e9f9-b99-3/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113234/.claude/worktrees/wf_76b5e9f9-b99-1/apps/client/src/net/RoomStore.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113247/.claude/worktrees/wf_76b5e9f9-b99-3/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113256/.claude/worktrees/wf_76b5e9f9-b99-1/apps/client/src/net/viewGatedReads.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113259/.claude/worktrees/wf_76b5e9f9-b99-3/packages/shared/src/content/abilityCodeParityForms.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113308/.claude/worktrees/wf_76b5e9f9-b99-1/apps/client/src/net/viewGatedReads.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113313/.claude/worktrees/wf_76b5e9f9-b99-5/packages/shared/src/sim/systems/BasicAttackSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113322/.claude/worktrees/wf_76b5e9f9-b99-1/apps/client/src/net/viewGatedReads.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113329/.claude/worktrees/wf_76b5e9f9-b99-5/packages/shared/src/sim/systems/BasicAttackSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113403/.claude/worktrees/wf_76b5e9f9-b99-3/tools/skill-remake/heroes/godie-e002.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113615/.claude/worktrees/wf_76b5e9f9-b99-1/packages/shared/src/protocol/viewGatedDelivery.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113630/.claude/worktrees/wf_76b5e9f9-b99-1/apps/client/src/net/viewGatedReads.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113636/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113743/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113803/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113843/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113904/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill_line_audit.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-113953/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill-line-naming.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-114038/.claude/worktrees/wf_76b5e9f9-b99-7/tools/champion-cards/skill-line-naming.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121008/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121014/.claude/worktrees/wf_5e0a2a7b-5a8-1/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121026/.claude/worktrees/wf_5e0a2a7b-5a8-1/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121029/.claude/worktrees/wf_5e0a2a7b-5a8-1/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121033/.claude/worktrees/wf_5e0a2a7b-5a8-1/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121034/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121040/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121043/.claude/worktrees/wf_5e0a2a7b-5a8-1/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121043/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121047/.claude/worktrees/wf_5e0a2a7b-5a8-1/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121103/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121115/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121121/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121209/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121212/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121228/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121324/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121338/.claude/worktrees/wf_5e0a2a7b-5a8-1/apps/game-server/src/config/emptyEnvIsUnset.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121343/.claude/worktrees/wf_5e0a2a7b-5a8-6/apps/client/src/render/vfx/generateFamilyContent.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121418/.claude/worktrees/wf_5e0a2a7b-5a8-1/apps/game-server/src/net/zoneView.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121716/.claude/worktrees/wf_5e0a2a7b-5a8-3/tools/parallel-gates/field-io.mts` | （.mts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121735/.claude/worktrees/wf_5e0a2a7b-5a8-3/tools/parallel-gates/normalizers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121746/.claude/worktrees/wf_5e0a2a7b-5a8-3/tools/parallel-gates/normalizers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121803/.claude/worktrees/wf_5e0a2a7b-5a8-3/tools/parallel-gates/normalizers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121813/.claude/worktrees/wf_5e0a2a7b-5a8-3/tools/parallel-gates/normalizers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121817/.claude/worktrees/wf_5e0a2a7b-5a8-2/packages/shared/src/content/floatingTextDriftParity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121819/.claude/worktrees/wf_5e0a2a7b-5a8-1/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121827/.claude/worktrees/wf_5e0a2a7b-5a8-1/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121830/.claude/worktrees/wf_5e0a2a7b-5a8-2/packages/shared/src/content/floatingTextDriftParity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121836/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121840/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121843/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121847/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121908/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121928/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-121940/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122012/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122022/.claude/worktrees/wf_5e0a2a7b-5a8-3/tools/parallel-gates/normalizers.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122034/.claude/worktrees/wf_5e0a2a7b-5a8-2/packages/shared/src/content/floatingTextDriftParity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122045/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122052/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122055/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122139/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/genguard.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122151/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/genguard.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122223/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122228/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122238/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122317/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122320/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122419/.claude/worktrees/wf_5e0a2a7b-5a8-3/packages/shared/src/ops/laneYQuarantineAgreesWithGenguard.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122512/.claude/worktrees/wf_5e0a2a7b-5a8-3/packages/shared/src/ops/quarantineOrphansAndEntrypoints.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122528/.claude/worktrees/wf_5e0a2a7b-5a8-3/packages/shared/src/ops/quarantineOrphansAndEntrypoints.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122549/.claude/worktrees/wf_5e0a2a7b-5a8-3/packages/shared/src/ops/quarantineOrphansAndEntrypoints.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122710/.claude/worktrees/wf_5e0a2a7b-5a8-3/scripts/product-quarantine.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122716/.claude/worktrees/wf_5e0a2a7b-5a8-3/tools/parallel-gates/field-io.mts` | （.mts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-122730/.claude/worktrees/wf_5e0a2a7b-5a8-3/tools/parallel-gates/field-probes.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-125811/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211842/.claude/worktrees/wf_75f7dbd0-63c-2/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211854/.claude/worktrees/wf_75f7dbd0-63c-2/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211914/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBar.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211921/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211927/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBarKeys.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211930/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211938/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBarKeys.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211946/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211955/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBarKeys.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-211959/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212004/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212012/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212018/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212035/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBarKeys.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212039/.claude/worktrees/wf_75f7dbd0-63c-2/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212051/.claude/worktrees/wf_75f7dbd0-63c-2/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212056/.claude/worktrees/wf_75f7dbd0-63c-1/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212059/.claude/worktrees/wf_75f7dbd0-63c-5/apps/client/src/ui/panels/guardianSettlementRows.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212110/.claude/worktrees/wf_75f7dbd0-63c-1/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212114/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBarKeys.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212118/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBarKeys.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212121/.claude/worktrees/wf_75f7dbd0-63c-1/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212125/.claude/worktrees/wf_75f7dbd0-63c-1/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212137/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBarKeys.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212140/.claude/worktrees/wf_75f7dbd0-63c-1/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212148/.claude/worktrees/wf_75f7dbd0-63c-1/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212157/.claude/worktrees/wf_75f7dbd0-63c-1/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212215/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212216/.claude/worktrees/wf_75f7dbd0-63c-5/apps/client/src/ui/panels/LeaveSettlementOverlay.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212220/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212239/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBarKeys.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212244/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBarKeys.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212247/.claude/worktrees/wf_75f7dbd0-63c-6/apps/client/src/ui/hud/SelfStatusBar.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212248/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212252/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212253/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212256/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212303/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212303/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212312/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212319/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212329/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212332/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212350/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212401/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212404/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212415/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212417/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/invisible_prim_policy.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212421/.claude/worktrees/wf_75f7dbd0-63c-1/packages/shared/src/ops/syncIoRuntimeReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212432/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/invisible_prim_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212505/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/invisible_prim_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212507/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212508/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/invisible_prim_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212513/.claude/worktrees/wf_75f7dbd0-63c-3/apps/client/src/vfx/beamAuditionWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212519/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/invisible_prim_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212521/.claude/worktrees/wf_75f7dbd0-63c-1/packages/shared/src/ops/syncIoRuntimeReconcile.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212539/.claude/worktrees/wf_75f7dbd0-63c-7/packages/shared/src/content/semanticRoleMarkup.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212553/.claude/worktrees/wf_75f7dbd0-63c-7/packages/shared/src/content/semanticRoleMarkup.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212709/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/invisible_prim_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212840/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212853/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212855/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212905/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-212929/.claude/worktrees/wf_75f7dbd0-63c-4/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-213134/.claude/worktrees/wf_75f7dbd0-63c-4/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-213144/.claude/worktrees/wf_75f7dbd0-63c-4/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-213157/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-213207/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-213314/.claude/worktrees/wf_75f7dbd0-63c-4/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-213417/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-213422/.claude/worktrees/wf_75f7dbd0-63c-4/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-215556/.claude/worktrees/wf_1f72ad0e-1c3-3/packages/shared/src/content/semanticRoleMarkup.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-215934/.claude/worktrees/wf_1f72ad0e-1c3-4/packages/shared/src/ops/cardSkillLineKeyIntegrity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-215936/.claude/worktrees/wf_1f72ad0e-1c3-3/packages/shared/src/content/fieldAdoptionBASELINE.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-215942/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-215944/.claude/worktrees/wf_1f72ad0e-1c3-4/packages/shared/src/ops/cardSkillLineKeyIntegrity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-215945/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-215954/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220001/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220004/.claude/worktrees/wf_1f72ad0e-1c3-4/packages/shared/src/ops/cardSkillLineKeyIntegrity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220010/.claude/worktrees/wf_1f72ad0e-1c3-4/packages/shared/src/ops/cardSkillLineKeyIntegrity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220011/.claude/worktrees/wf_1f72ad0e-1c3-3/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220013/.claude/worktrees/wf_1f72ad0e-1c3-4/packages/shared/src/ops/cardSkillLineKeyIntegrity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220018/.claude/worktrees/wf_1f72ad0e-1c3-4/packages/shared/src/ops/cardSkillLineKeyIntegrity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220027/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220032/.claude/worktrees/wf_1f72ad0e-1c3-3/packages/shared/src/content/registries.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220037/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220044/.claude/worktrees/wf_1f72ad0e-1c3-4/packages/shared/src/ops/cardSkillLineKeyIntegrity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220048/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220051/.claude/worktrees/wf_1f72ad0e-1c3-4/packages/shared/src/ops/cardSkillLineKeyIntegrity.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220107/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220132/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220201/.claude/worktrees/wf_1f72ad0e-1c3-5/docs/_reports/766_temp_20260829-2159.md` | GH#766 —— `healthRegen` 外圍量測 —— ⚠️ 這是**量測報告**，⛔ 不是一次改動。這一輪**一個出貨數字都沒有動**。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220213/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220218/.claude/worktrees/wf_1f72ad0e-1c3-1/packages/shared/src/ops/laneYCommitRefHookMounted.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220222/.claude/worktrees/wf_1f72ad0e-1c3-1/packages/shared/src/ops/laneYCommitRefHookMounted.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220234/.claude/worktrees/wf_1f72ad0e-1c3-5/docs/_reports/766_temp_20260829-2159.md` | GH#766 —— `healthRegen` 外圍量測 —— ⚠️ 這是**量測報告**，⛔ 不是一次改動。這一輪**一個出貨數字都沒有動**。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220258/.claude/worktrees/wf_1f72ad0e-1c3-1/packages/shared/src/ops/laneYCommitRefHookMounted.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220320/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220325/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220339/.claude/worktrees/wf_1f72ad0e-1c3-1/packages/shared/src/ops/laneYCommitRefHookMounted.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220342/.claude/worktrees/wf_1f72ad0e-1c3-1/packages/shared/src/ops/laneYCommitRefHookMounted.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220343/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220356/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220405/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220420/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/invisible_prim_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220424/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/invisible_prim_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220432/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/invisible_prim_census.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220454/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220511/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/invisible_prim_policy.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220512/.claude/worktrees/wf_1f72ad0e-1c3-5/packages/shared/src/ops/healthregenProvenance.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220515/.claude/worktrees/wf_1f72ad0e-1c3-5/packages/shared/src/ops/healthregenProvenance.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220517/.claude/worktrees/wf_1f72ad0e-1c3-1/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220524/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220528/.claude/worktrees/wf_1f72ad0e-1c3-5/packages/shared/src/ops/healthregenProvenance.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220532/.claude/worktrees/wf_1f72ad0e-1c3-5/packages/shared/src/ops/healthregenProvenance.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220533/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220540/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220544/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220602/.claude/worktrees/wf_1f72ad0e-1c3-5/docs/_reports/766_temp_20260829-2159.md` | GH#766 —— `healthRegen` 外圍量測 —— ⚠️ 這是**量測報告**，⛔ 不是一次改動。這一輪**一個出貨數字都沒有動**。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220605/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220623/.claude/worktrees/wf_1f72ad0e-1c3-5/docs/_reports/766_temp_20260829-2159.md` | GH#766 —— `healthRegen` 外圍量測 —— ⚠️ 這是**量測報告**，⛔ 不是一次改動。這一輪**一個出貨數字都沒有動**。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220628/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220632/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220648/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220719/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220735/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220740/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220741/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220744/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220749/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220751/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220817/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220821/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220921/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220921/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-220936/.claude/worktrees/wf_1f72ad0e-1c3-6/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221003/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221007/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221016/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221027/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221203/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221209/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221213/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221227/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221254/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221258/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221320/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221401/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221419/.claude/worktrees/wf_1f72ad0e-1c3-2/tools/w3x-import/w3xlib/gltf.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221543/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221550/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221556/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-221601/.claude/worktrees/wf_1f72ad0e-1c3-2/packages/shared/src/ops/teamGlowCullPolicy.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-224515/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-225919/.claude/worktrees/wf_7d528f9e-e28-1/tools/skill-spec/gen_spec.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230106/.claude/worktrees/wf_7d528f9e-e28-1/tools/skill-spec/gen_spec.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230158/.claude/worktrees/wf_7d528f9e-e28-1/packages/shared/src/ops/laneDOCSContractSilence.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230255/.claude/worktrees/wf_7d528f9e-e28-1/tools/skill-spec/gen_spec.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230257/.claude/worktrees/wf_7d528f9e-e28-2/content/abilities/godie-e007.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230259/.claude/worktrees/wf_7d528f9e-e28-1/packages/shared/src/ops/laneDOCSContractSilence.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230259/.claude/worktrees/wf_7d528f9e-e28-2/content/abilities/godie-e007.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230304/.claude/worktrees/wf_7d528f9e-e28-1/packages/shared/src/ops/laneDOCSContractSilence.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230306/.claude/worktrees/wf_7d528f9e-e28-2/content/champions/godie-e007.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230309/.claude/worktrees/wf_7d528f9e-e28-2/content/champions/godie-e007.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230418/.claude/worktrees/wf_7d528f9e-e28-1/tools/skill-spec/gen_spec.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230442/.claude/worktrees/wf_7d528f9e-e28-1/tools/skill-spec/gen_spec.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230500/.claude/worktrees/wf_7d528f9e-e28-5/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230722/.claude/worktrees/wf_7d528f9e-e28-1/packages/shared/src/ops/contractEffectDocAnchors.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230728/.claude/worktrees/wf_7d528f9e-e28-1/packages/shared/src/ops/laneDOCSContractSilence.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230740/.claude/worktrees/wf_7d528f9e-e28-1/packages/shared/src/ops/laneDOCSContractSilence.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230746/.claude/worktrees/wf_7d528f9e-e28-1/packages/shared/src/ops/laneDOCSContractSilence.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230900/.claude/worktrees/wf_7d528f9e-e28-4/content/abilities/godie-o00x.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-230944/.claude/worktrees/wf_7d528f9e-e28-1/packages/shared/src/ops/contractEffectDocAnchors.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-231126/.claude/worktrees/wf_7d528f9e-e28-2/content/abilities/godie-e007.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-231146/.claude/worktrees/wf_7d528f9e-e28-2/content/abilities/godie-e007.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-232021/.claude/worktrees/wf_7d528f9e-e28-4/packages/shared/src/content/lineSweepRegistryProbe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-232147/.claude/worktrees/wf_7d528f9e-e28-4/packages/shared/src/sim/effects/damageLine.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260829-234416/packages/shared/src/ops/contractSharedDocFits.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-000104/.claude/worktrees/wf_dbfffabe-0ec-1/tools/parallel-gates/field-io.mts` | （.mts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-000237/.claude/worktrees/wf_dbfffabe-0ec-1/tools/parallel-gates/field-probes.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-000604/.claude/worktrees/wf_dbfffabe-0ec-4/packages/shared/src/ops/regenOutlierRegister.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-000609/.claude/worktrees/wf_dbfffabe-0ec-4/packages/shared/src/ops/regenOutlierRegister.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-000627/.claude/worktrees/wf_dbfffabe-0ec-4/packages/shared/src/ops/regenOutlierRegister.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-000631/.claude/worktrees/wf_dbfffabe-0ec-4/packages/shared/src/ops/regenOutlierRegister.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-000946/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-000950/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001016/.claude/worktrees/wf_dbfffabe-0ec-2/content/abilities/godie-o00x.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001017/.claude/worktrees/wf_dbfffabe-0ec-2/content/abilities/godie-ogrh.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001026/.claude/worktrees/wf_dbfffabe-0ec-2/content/abilities/godie-h02r.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001027/.claude/worktrees/wf_dbfffabe-0ec-2/content/abilities/godie-hgam.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001038/.claude/worktrees/wf_dbfffabe-0ec-2/content/champions/godie-o00x.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001040/.claude/worktrees/wf_dbfffabe-0ec-2/content/champions/godie-ogrh.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001048/.claude/worktrees/wf_dbfffabe-0ec-2/content/champions/godie-h02r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001050/.claude/worktrees/wf_dbfffabe-0ec-2/content/champions/godie-hgam.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001050/.claude/worktrees/wf_dbfffabe-0ec-4/packages/shared/src/ops/regenOutlierRegister.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001053/.claude/worktrees/wf_dbfffabe-0ec-4/packages/shared/src/ops/regenOutlierRegister.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001121/.claude/worktrees/wf_dbfffabe-0ec-4/packages/shared/src/ops/regenOutlierRegister.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001122/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001148/.claude/worktrees/wf_dbfffabe-0ec-2/packages/shared/src/content/lineSweepIsDamageLine.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001156/.claude/worktrees/wf_dbfffabe-0ec-2/packages/shared/src/content/lineSweepIsDamageLine.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001200/.claude/worktrees/wf_dbfffabe-0ec-2/packages/shared/src/content/lineSweepIsDamageLine.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001212/.claude/worktrees/wf_dbfffabe-0ec-2/packages/shared/src/content/lineSweepIsDamageLine.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001306/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001415/.claude/worktrees/wf_dbfffabe-0ec-3/packages/shared/src/content/periodicClaimHasMechanism.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001455/.claude/worktrees/wf_dbfffabe-0ec-2/content/abilities/godie-o00x.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001513/.claude/worktrees/wf_dbfffabe-0ec-2/content/abilities/godie-o00x.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001519/.claude/worktrees/wf_dbfffabe-0ec-2/docs/_castability-128.md` | 技能 in-game 可施放覆蓋矩陣 — Task #128 —— 生成於 `packages/shared/src/sim/castabilitySweep.test.ts`（每次跑測試即重算）。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001523/.claude/worktrees/wf_dbfffabe-0ec-3/packages/shared/src/content/periodicClaimHasMechanism.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001554/.claude/worktrees/wf_dbfffabe-0ec-3/packages/shared/src/content/periodicClaimHasMechanism.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001558/.claude/worktrees/wf_dbfffabe-0ec-3/content/abilities/godie-huth.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001606/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001620/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001622/.claude/worktrees/wf_dbfffabe-0ec-3/content/abilities/godie-huth.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001625/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001629/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001638/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001701/.claude/worktrees/wf_dbfffabe-0ec-3/packages/shared/src/content/periodicClaimHasMechanism.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001706/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001720/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001724/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-001843/.claude/worktrees/wf_dbfffabe-0ec-3/content/abilities/godie-huth.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002000/.claude/worktrees/wf_dbfffabe-0ec-3/packages/shared/src/content/periodicClaimHasMechanism.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002023/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002028/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002040/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002047/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002054/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002103/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002142/.claude/worktrees/wf_dbfffabe-0ec-2/docs/_castability-128.md` | 技能 in-game 可施放覆蓋矩陣 — Task #128 —— 生成於 `packages/shared/src/sim/castabilitySweep.test.ts`（每次跑測試即重算）。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002228/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002237/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002244/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002358/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002403/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-002501/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/ops/crossheroAssetMisbind.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-003105/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-003115/.claude/worktrees/wf_dbfffabe-0ec-5/packages/shared/src/content/crossHeroAssetBinding.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-005949/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010034/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010045/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010154/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010213/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010257/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010316/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/beamAudition.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010520/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010529/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010543/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010551/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/AimResolver.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010558/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010600/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/AimResolver.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010612/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010613/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/InputCapture.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010620/.claude/worktrees/wf_d6c1056a-bf8-2/docs/_reports/measure-injectable_visual-proof_20260830-0105/frames.md` | measure-injectable — 連續圖片驗收（GH#____） —— 📅 **證據的時間身分（GH#795）**：`HEAD=65e11fea` 工作樹 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010621/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/InputCapture.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010625/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/InputCapture.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010629/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/InputCapture.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010639/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010643/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/TouchInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010644/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010648/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010649/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/TouchInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010710/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/TouchInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010714/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/TouchInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010718/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/TouchInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010722/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010725/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010735/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010738/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010741/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010749/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010749/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010750/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010756/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010757/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010758/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010802/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010804/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010806/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010812/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010815/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010817/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010823/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010824/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010846/.claude/worktrees/wf_d6c1056a-bf8-5/packages/shared/src/ops/geosetFormGating.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010852/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010858/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010924/.claude/worktrees/wf_d6c1056a-bf8-3/apps/game-server/src/contentCacheHealth.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010935/.claude/worktrees/wf_d6c1056a-bf8-3/apps/game-server/src/contentCacheHealth.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-010955/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011002/.claude/worktrees/wf_d6c1056a-bf8-2/apps/client/src/vfx/auditionCalibrates.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011138/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/allyTargets.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011151/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/allyTargetPaths.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011158/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/allyTargetPaths.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011217/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/AimResolver.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011236/.claude/worktrees/wf_d6c1056a-bf8-4/apps/client/src/input/AimResolver.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011359/.claude/worktrees/wf_d6c1056a-bf8-5/packages/shared/src/ops/geosetFormGating.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011437/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011455/.claude/worktrees/wf_d6c1056a-bf8-3/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011714/.claude/worktrees/wf_d6c1056a-bf8-1/content/abilities/godie-o02p.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011729/.claude/worktrees/wf_d6c1056a-bf8-1/content/abilities/godie-o02p.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-011913/.claude/worktrees/wf_d6c1056a-bf8-1/packages/shared/src/content/periodicFieldContentWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-020714/docs/_execution-batches.md` | GGD 執行批次計畫（Execution Batches） —— ⚠️ 2026-07-30 全面重寫。** 上一版寫著「main = `a6b1609d`，線上 **v0.7.0**」—— | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-020814/scripts/mpndd.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024543/.claude/worktrees/wf_fccc16ff-f23-6/packages/shared/src/content/schema/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024623/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024637/.claude/worktrees/wf_fccc16ff-f23-6/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024641/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024647/.claude/worktrees/wf_fccc16ff-f23-6/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024654/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024658/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024711/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024716/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024719/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024820/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.boneAttach.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024828/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.boneAttach.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024845/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.boneAttach.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024901/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/allyTargetPaths.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024907/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/allyTargetPaths.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024910/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/allyTargetPaths.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024926/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024929/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.ts.bak` | （.bak 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024945/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-024952/.claude/worktrees/wf_fccc16ff-f23-6/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025000/.claude/worktrees/wf_fccc16ff-f23-6/packages/shared/src/sim/effects/spawnVfx.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025001/.claude/worktrees/wf_fccc16ff-f23-5/tools/skill-remake/heroes/godie-e002.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025003/.claude/worktrees/wf_fccc16ff-f23-6/packages/shared/src/sim/effects/spawnVfx.ts.bak` | （.bak 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025016/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/allyTargetPaths.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025018/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/allyTargetPaths.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025125/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/allyTargets.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025130/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/allyTargets.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025133/.claude/worktrees/wf_fccc16ff-f23-1/content/ability-templates/tpl-periodic-field.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025148/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025149/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025152/.claude/worktrees/wf_fccc16ff-f23-1/content/ability-templates/tpl-periodic-field.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025159/.claude/worktrees/wf_fccc16ff-f23-1/content/ability-templates/tpl-periodic-field.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025200/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025201/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025202/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/GamepadInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025218/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025224/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/TouchInput.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025225/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025229/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025244/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025249/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025252/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025304/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.boneAttach.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025307/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025317/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025322/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.boneAttach.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025333/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025335/.claude/worktrees/wf_fccc16ff-f23-3/apps/game-server/src/ai/Tier0Brain.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025337/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025345/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025353/.claude/worktrees/wf_fccc16ff-f23-3/apps/game-server/src/ai/Tier0Brain.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025356/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025359/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.boneAttach.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025407/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025407/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.boneAttach.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025416/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025443/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025444/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025457/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025516/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025524/.claude/worktrees/wf_fccc16ff-f23-6/packages/shared/src/sim/effects/spawnVfx.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025527/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025527/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025531/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025539/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025543/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.boneAttach.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025546/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025555/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025601/.claude/worktrees/wf_fccc16ff-f23-6/apps/client/src/vfx/VfxSystem.boneAttach.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025603/.claude/worktrees/wf_fccc16ff-f23-4/content/models/imported.heroichigo.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025607/.claude/worktrees/wf_fccc16ff-f23-4/content/models/imported.heroichigo-bankai.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025612/.claude/worktrees/wf_fccc16ff-f23-6/packages/shared/src/sim/effects/spawnVfx.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025617/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025619/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025626/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025630/scripts/host-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025633/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025648/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025649/.claude/worktrees/wf_fccc16ff-f23-2/apps/game-server/src/contentCacheHealth.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025657/.claude/worktrees/wf_fccc16ff-f23-5/packages/shared/src/sim/effects/modelFxPlacement.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025704/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025707/.claude/worktrees/wf_fccc16ff-f23-2/apps/game-server/src/contentCacheHealth.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025709/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025717/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025726/.claude/worktrees/wf_fccc16ff-f23-2/apps/game-server/src/contentCacheHealth.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025737/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025738/.claude/worktrees/wf_fccc16ff-f23-2/docker/compose.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025832/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/ops/contentCacheShippedPath.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025903/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025948/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/ops/contentCacheShippedPath.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-025952/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/ops/contentCacheShippedPath.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030004/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030007/apps/game-server/src/rooms/ReplayRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030011/apps/game-server/src/rooms/MutationThirdRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030021/scripts/redis-snapshot.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030026/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030046/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030050/.claude/worktrees/wf_fccc16ff-f23-1/content/ability-templates/tpl-periodic-field.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030057/packages/shared/src/content/regenOutlierOrigin.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030059/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030114/packages/shared/src/content/regenOutlierOrigin.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030118/scripts/site-export.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030126/scripts/site-export.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030146/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/contentCache.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030200/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/ops/contentCacheShippedPath.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030221/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030304/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030308/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030324/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030337/scripts/message-ledger.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030349/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030404/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030404/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030409/tools/parallel-gates/ship.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030422/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030422/packages/shared/src/ops/redisSnapshotBeforeShutdown.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030429/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030433/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030433/.claude/worktrees/wf_fccc16ff-f23-4/apps/client/src/render/views/hiddenPrimitives.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030440/tools/w3x-import/measure_weapon_type_authority.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030442/scripts/mini-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030457/.claude/worktrees/wf_fccc16ff-f23-2/packages/shared/src/content/cache/fingerprint.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030506/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030513/packages/shared/src/ops/redisSnapshotBeforeShutdown.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030514/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030519/scripts/mini-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030524/scripts/ledger_table.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030538/scripts/message-ledger.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030546/.claude/worktrees/wf_fccc16ff-f23-1/packages/shared/src/content/periodicFieldTemplateWiring.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030546/scripts/message-ledger.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030552/.claude/worktrees/wf_fccc16ff-f23-5/packages/shared/src/content/beamMuzzleOffset.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030559/packages/shared/src/ops/redisSnapshotBeforeShutdown.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030616/packages/shared/src/ops/redisSnapshotBeforeShutdown.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030618/.claude/worktrees/wf_fccc16ff-f23-4/docs/_reports/ichigo-form-bodies_visual-proof_20260830-0305/frames.md` | ichigo-form-bodies — 連續圖片驗收（GH#____） —— 📅 **證據的時間身分（GH#795）**：`HEAD=26c74bad` 工作樹 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030634/scripts/host-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030634/scripts/mini-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030710/packages/shared/src/ops/redisSnapshotBeforeShutdown.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030716/scripts/host-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030731/tools/parallel-gates/ship.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030732/tools/board/gen_board.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030738/tools/board/gen_board.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030740/scripts/site-export.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030750/tools/board/gen_board.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030811/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030906/apps/game-server/src/rooms/MatchRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030916/.claude/worktrees/wf_fccc16ff-f23-3/apps/client/src/input/allyTargetPaths.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030941/apps/game-server/src/rooms/ReplayRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-030953/scripts/message-ledger.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031012/scripts/message-ledger.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031023/apps/game-server/src/rooms/ReplayRoom.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031131/packages/shared/src/content/regenOutlierOrigin.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031200/packages/shared/src/content/regenOutlierOrigin.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031200/packages/shared/src/content/regenOutlierOrigin.test.ts.bak` | （.bak 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031311/scripts/site-export.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031317/scripts/site-export.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031332/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031349/scripts/site-export.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-031419/tools/deploy/ggd-assets.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032111/scripts/ledger_table.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032128/scripts/message-ledger.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032144/scripts/message-ledger.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032233/tools/parallel-gates/ship.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032317/scripts/mini-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032409/scripts/mini-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032433/scripts/site-export.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032508/scripts/host-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032523/scripts/host-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-032527/scripts/host-deploy.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-041110/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140350/packages/shared/src/content/__baseline648.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140702/packages/shared/src/content/abilityProse.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140718/packages/shared/src/content/__probe648.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140726/apps/client/src/vfx/refireSecondPerformanceRenders.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140734/apps/client/src/vfx/refireSecondPerformanceRenders.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140744/apps/client/src/vfx/refireSecondPerformanceRenders.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140750/apps/client/src/vfx/refireSecondPerformanceRenders.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140808/packages/shared/src/content/abilityProse.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140808/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140844/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140901/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140929/packages/shared/src/content/abilityProse.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-140933/apps/client/src/vfx/refireSecondPerformanceRenders.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141010/tools/w3x-import/texture_color_fidelity.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141105/tools/w3x-import/texture_color_fidelity.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141133/tools/w3x-import/texture_color_fidelity.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141232/tools/w3x-import/texture_color_fidelity.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141247/apps/client/src/ui/hud/zzscratch.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141247/tools/w3x-import/texture_color_fidelity.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141305/tools/w3x-import/texture_color_fidelity.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141317/tools/w3x-import/texture_color_fidelity.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141343/tools/skill-remake/batch1.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141346/val809_temp_20260830-05.mts` | （.mts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141357/tools/skill-remake/batch1.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141524/apps/client/src/vfx/refireSecondPerformanceRenders.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141536/apps/client/src/vfx/refireSecondPerformanceRenders.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141722/packages/shared/scripts/_tmp879_diff.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-141926/packages/shared/src/content/abilityProse.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-142117/apps/client/src/vfx/VfxSystem.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-142219/apps/client/src/vfx/vfxHardCap.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-142248/apps/client/src/render/vfx/W3xEmitterRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-142453/apps/client/src/ui/hud/zzscratch.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-142517/content/abilities/godie-hart.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-142548/apps/client/src/vfx/refireSecondPerformanceRenders.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-143022/tools/skill-remake/batch1.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-143352/apps/client/src/ui/hud/hudLayout.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-143414/apps/client/src/ui/components/GoldLevel.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-143959/apps/client/src/ui/hud/hudBottomCluster.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-144026/apps/client/src/ui/hud/hudBottomCluster.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-154823/apps/editor/src/__probe_audit.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-154853/apps/editor/src/__probe_audit.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260830-164622/docs/legacy/_overwrites/_ledger.tsv` | （.tsv 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-033811/packages/shared/src/content/import/targetProfileTypeMatchesShipped.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-034919/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-041840/apps/client/src/render/vfx/generateFamilyContent.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-050805/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-121018/CLAUDE.md` | GGD — 開發守則 —— 這一份是**規則**，不是說明書。架構與現況看 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-121552/tools/editor-contract/gen_editor_coverage.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-135337/apps/client/src/vfx/VfxScriptPlayer.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-135337/apps/game-server/src/net/eventFanout.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-140722/packages/shared/src/sim/combat/block.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-141833/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-143501/packages/shared/src/content/editorCapabilities.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-144203/tools/skill-remake/heroes/godie-h01n.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-145309/packages/shared/src/content/fieldAdoption.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-145622/scripts/ticket-lint.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-150132/apps/admin/src/ui/CurationPage.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-151456/apps/game-server/src/config/contentBus.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-151940/apps/admin/src/overlayCompose.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-152309/apps/admin/src/contentOverlayEdit.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-153055/apps/admin/src/contentOverlayHistory.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-154501/packages/shared/src/content/noOpModifierClaims.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-155202/tools/review/middleware.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-155828/apps/admin/src/ui/App.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-160300/docs/editor-contract/jass-template-map.md` | JASS 行為類 ↔ 出貨模板 對照表（GH#244） —— ⛔ **這一份是產生的** —— `node tools/jass-template-map/gen.mjs`。 | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-160300/tools/jass-template-map/gen.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-161032/packages/shared/src/content/descriptionClaims.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-161234/packages/shared/src/content/fieldAdoption.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-161538/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-161622/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-161630/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-161848/packages/shared/src/content/templateFamiliesAreAdopted.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-162000/packages/shared/src/content/periodicClaimHasMechanism.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-162045/packages/shared/src/content/periodicFieldAdoptionBlocker.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-162100/packages/shared/src/content/periodicFieldAdoptionBlocker.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-162231/packages/shared/src/content/descriptionClaims.baseline/godie-orkn.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-162238/packages/shared/src/content/descriptionClaims.baseline/godie-orkn.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-162524/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-162838/packages/shared/src/sim/castabilitySweep.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-164804/package.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-164804/packages/shared/src/ops/skillsSyncCoversGenerators.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-170619/.gitignore` | （無副檔名 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-171444/docker/compose.family.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-171505/docker/compose.family.yaml` | （.yaml 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-174334/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-174404/apps/client/src/render/modelFxRig.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-180438/apps/client/src/vfx/blockVfxReplacesSpark.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-183006/tools/review/triage.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-192108/content/abilities/godie-udea.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-192108/content/abilities/godie-udea.w.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-192746/content/models/imported.1hswd-01.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-192746/content/vfx/attach.godie-o02w.1hswd-01.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-200651/content/models/imported.roots.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-201715/content/champions/godie-summon-treant.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-202820/apps/client/src/GameApp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-221345/apps/client/src/audio/spatialPolicy.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260831-223221/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-004957/packages/shared/src/sim/mobs.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-033931/packages/shared/src/sim/collision/spatialHash.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-034242/packages/shared/src/sim/collision/spatialHash.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-050245/content/abilities/godie-e00l.r.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-055606/scripts/release-note-players.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-061118/tools/skill-remake/heroes/godie-e00r.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-062308/packages/shared/src/content/tmpProbe902.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-062415/packages/shared/src/content/emptyCardClaims.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-063739/apps/client/src/ui/hud/markModel.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-064833/packages/shared/src/content/damageTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-065957/packages/shared/src/content/damageTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-065957/tools/skill-remake/tierize.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-070226/packages/shared/src/content/damageTiers.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-071543/apps/client/src/ui/platform/LobbyScreen.tsx` | （.tsx 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-072032/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-072748/packages/shared/src/content/tmpProbe898.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-072946/packages/shared/src/content/tmpP.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-073336/packages/shared/src/content/templates/expand.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-074634/apps/client/src/vfx/additiveBudget.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-080848/packages/shared/src/sim/stuckEscape.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-082821/apps/client/src/render/scriptedMove.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-112715/packages/shared/src/sim/collision/spatialHash.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-112817/packages/shared/src/sim/collision/spatialHashBench.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-112829/packages/shared/src/sim/collision/spatialHash.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-124332/packages/shared/src/sim/targeting.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-125057/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-130029/packages/shared/src/sim/effects/grantXp.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-132738/tools/parallel-gates/sync-io.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-135840/packages/shared/src/sim/stats/rating.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-141346/packages/shared/src/content/import/submission.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-141544/packages/shared/src/content/import/submission.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-141647/packages/shared/src/content/import/submission.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-141717/packages/shared/src/content/import/submission.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-143052/scripts/release-note-players.sh` | （.sh 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-144250/packages/shared/src/sim/combat/__probe.test.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-145701/scripts/preserve-before-overwrite.py` | （.py 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-145807/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-150241/docs/_release/ggd-board.html` | （.html 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-151223/tools/parallel-gates/sync-io.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-151541/tools/parallel-gates/reconcile.mjs` | （.mjs 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-225043/apps/platform/internal/submissions/submissions.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-225455/apps/platform/internal/server/playercontent.go` | （.go 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/overwrite_temp_20260901-234526/packages/shared/src/content/schema/config/uiCues.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/04.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/06.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/08.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/09.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/11.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/12.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/18.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/20.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/22.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/25.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/30.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/38.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/42.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/58.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/70.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/76.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/77.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/79.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/90.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/parity-baseline_temp_20260821-034744/abilityCodeParity.baseline/92.json` | （.json 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_overwrites/tiersnap-lane-collision_temp_20260821-0011/tier-snap-gen.ts` | （.ts 檔） | （未逐檔裁決 —— 補進產生器的 CURATED） |
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

