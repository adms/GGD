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

**目前共 319 個檔案**，分佈在 2 個隔離區。

| 隔離區 | 檔數 | 是什麼 |
|---|---:|---|
| [`docs/legacy/`](legacy-index.md#docslegacy) | 42 | 規格與文件的隔離區（第〇·六守則階梯的第 3–5 層 + 已被取代的同型文件） |
| [`content/_legacy/`](legacy-index.md#contentlegacy) | 277 | **下架的內容文件** —— 英雄、技能、config。「消失 ≠ 歸檔」：白名單移除的東西要真的躺在這裡 |

⚠️ **在這裡找到需要的東西之後**：它仍然是階梯第 3–5 層（或已被取代的同型文件）。
要用它之前先問「現行的那一份說什麼」—— 衝突時**現行的贏**（第〇·六守則）。

---

## `docs/legacy/` —— 42 檔

規格與文件的隔離區（第〇·六守則階梯的第 3–5 層 + 已被取代的同型文件）

| 檔案 | 是什麼 | 為什麼在這裡 / 誤讀會怎樣 |
|---|---|---|
| `README.md` | 隔離區的規則本身 | 說明為什麼有這個資料夾、什麼該進來、閘在哪裡 |
| `_TEMP-工作流交接.md` | 臨時工作流交接（自稱 `_TEMP-`） | 自陳「等下一輪收工就可以刪掉」，卻又說「下次重新開始先讀這一頁」。它寫「v0.9.16 已上線」，實際差 15 個版號 |
| `_ability-fidelity-ledger.json` | 同上的 JSON 版（編輯器吃這一份，不要 parse md） | 同上 |
| `_ability-fidelity-ledger.md` | 696 支技能的三欄帳本（描述 vs 實作 vs w3x） | 第三欄的權威是 w3x。⚠️ 產生器 `docs/tools/ability_ledger.py` 的輸出路徑已改指這裡 |
| `_ability-ledger-editor-spec.md` | 保真度編輯器規格 | 第三欄權威是 w3x；它操作的帳本本體早就在 legacy，規格卻留在第一層 |
| `_champion-attack-range-20260731.md` | 07-31 的英雄攻擊距離快照 | 自陳「這是一份時間點快照」，而「過期了就補一行指向新檔」那一行從沒補上 |
| `_champion-dedup-113.md` | #113 英雄去重的**舊**接手檔 | 它的接班檔自己寫「本檔取代…那份的結論方向對、**理由是錯的**」。正確版是 `docs/_audit-113-duplicate-pairs.md` |
| `_derived-stats-248.md` | 從 w3u/UnitBalance.slk 重算全 114 位的三圍推導表 | 它寫「倍率該留在 ×8 不要動」，而出貨的 `maxHealth` 是 **4.0** —— 照它調平衡回合長度直接翻倍 |
| `_execution-batches-history-20260725.md` | 作戰表歷史封存（07-25） | ⚠️ 它的部署段寫「用裸的 docker compose build」—— 照做會踩地雷 4（掉版本戳 → 徽章寫 UNSTAMPED-BUILD） |
| `_execution-batches-history-20260726.md` | 作戰表歷史封存（07-26，120KB） | 已結案內容與活的作戰表同名同型住在同一層 —— 正是 legacy/README 指出的根因 |
| `_execution-batches-history-20260727.md` | 作戰表歷史封存（07-26 深夜～07-27） | 含 v0.6.0 的部署驗收數字；當現況會用 07-27 的線上狀態判斷今天 |
| `_fidelity-audit-78.md` | task #78「1:1 對照 w3x」的稽核報告 | #78 的預設立場被第〇·六守則推翻了 —— 它把 JASS/w3x 當真理，而那是第 3–5 層 |
| `_kit-fidelity-audit-247.md` | 114 位英雄技能組・描述 vs 實作對帳清單 | 同一個 w3x 保真度年代的產物 |
| `_live-progress.md` | 即時進度看板 | 自稱「每有工作流回報就更新」，最後更新停在 **07-26**。已上線欄寫 v0.5.10（實際 v0.15.x）；「誠實覆蓋率 16.9%」今天是 100% |
| `_outstanding-20260802.md` | 08-02 的待辦帳本 | 自稱「當下的待辦帳本，不是歷史紀錄」，標題卻釘死 08-02。用 11 天前的 T0 清單覆蓋現在的優先序 |
| `_release-note-v0.18.1-superseded.md` | v0.18.1 release note —— **被取代的原始版本** —— ⚠️ **這一份是被取代的舊 body，⛔ 不是現行的 release note。** | （未逐檔裁決 —— 補進產生器的 CURATED） |
| `_session-handoff-2026-07-24.md` | session 交接（07-24，系列最舊） | 接到 20 天前、11 個次版號以前的 v0.4.1 現場 |
| `_session-handoff-20260725.md` | session 交接（07-25） | 自陳是 temp/過渡文件。⚠️ §7 明文寫著兩個外洩憑證的值 —— 搬檔**不改變資安態勢**，真正的修法是輪替（GH#181） |
| `_session-handover-0731.md` | session 交接（07-31） | 以為部署卡在 ssh 私鑰、線上是 v0.9.15。⚠️ 搬移時已把 `_execution-batches.md` 的轉介路徑改掉 |
| `_session-handover-2026-07-29.md` | session 交接（07-29） | 兩次要求「下次開機第一件事：線上打一場」—— **直接違反現行守則**（owner 2026-08-09 已退掉手動打一場） |
| `_skill-mechanics-coverage-20260808.md` | 90 支重製技能 → 機制覆蓋矩陣 | 檔頭釘死查證 commit `8cfb22d3`，而**下一個** commit 就把 kinds 27→34、hooks 9→15。照它會判斷一堆「引擎做不到」而去繞路。現行權威是 `GET /capabilities` |
| `_vfx-fidelity-w3x.md` | w3x 特效保真度對照 | 「資料來源（權威順序）」逐條是 w3a / AbilityFunc.txt / war3map.j / w3u —— 定義上就是階梯第 3–5 層 |
| `_w3x-fidelity-superseded.md` | 被 owner 新版設計取代的原作數值 | 定義上就是「已被取代」。留著是因為知識不可以無聲消失 |
| `abilities_vfx_editor_readme.md` | 外部編輯器交接（2026-08-03 版） | 新版 `_codex-handoff.md`（08-12）的「必給三份」裡沒有它。照它交付的編輯器不知道五層階梯、不知道 `GET /capabilities` 才是權威 |
| `tiering-proposal.md` | 英雄分級**提案**（08-11） | 自陳「本文件沒有動過任何 content/ 檔案」，而隔天裁決就落地了。把已決事項當待辦重開 |
| `改進延遲.md` | 延遲改進計畫**第一版** | 第 1 行逐字「⛔⛔ 已廢棄 —— 不要參考這份文件 ⛔⛔」。現行版是 `docs/_延遲改進計畫.md`（雙向指認一致） |
| `效果標籤詞彙表.md` | 效果標籤詞彙表 **v1** | 已被 `docs/效果標籤詞彙表v2.md` 取代（v2 的檔頭自己就這樣寫） |
| `新英雄範本-Saber填入.md` | 新英雄填空表（Saber 填好的樣本） | 把 `godie-e002` 標成「與 `godie-e00l` 完全重複（#113 去重對象）」—— 而 #113 的裁決是 14 對**全部是本體↔變身態，一個都不能 dedup** |
| `新英雄範本-完整範例.md` | 新英雄填空表（帶範例） | 建議帶母體是 n=111，是 stat-normalization 上線**前**的原始分佈 |
| `新英雄範本.md` | 新英雄填空表（最早，07-25 12:22） | 寫「英雄編號 100 ← 目前最大 099」，而 100 已被佔用。編號是 JASS 對照的 join key，填錯是綁死的東西出錯 |
| `英雄屬性正規化提案.md` | 屬性正規化**提案**（初版） | 自己把權威讓出去：「三個整包方案在計畫書第二·五節，**先讀那一份**」。`config.stat-normalization@1` 已出貨 |
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

---

## `content/_legacy/` —— 277 檔

**下架的內容文件** —— 英雄、技能、config。「消失 ≠ 歸檔」：白名單移除的東西要真的躺在這裡

**下架的內容文件**。它們不是「規格過期」，是「這一支不再出貨」——`invulnerableBinding.test.ts` 逐字釘著「**消失 ≠ 歸檔**」：白名單上不再出貨的，必須真的躺在這裡而不是憑空不見。⚠️ 有 6 支以上的活測試會讀這個目錄，⛔ 不要清空。

### `abilities/` （235 檔）

| 檔案 | 是什麼 |
|---|---|
| `godie-e00j.e.json` | 技能「95-03 皇者戰氣第五十重天」，槽位 E |
| `godie-e00j.ex.json` | 技能「95-002 固有結界-和諧世界」，槽位 EX |
| `godie-e00j.passive.json` | 技能「95-00 紅色龍氣」，槽位 PASSIVE |
| `godie-e00j.q.json` | 技能「95-01 謝謝指教」，槽位 Q |
| `godie-e00j.r.json` | 技能「95-04 藍色戰氣一百重天」，槽位 R |
| `godie-e00j.w.json` | 技能「95-02 大和戰氣」，槽位 W |
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
| `godie-e00v.e.json` | 技能「84-03 蜜汁」，槽位 E |
| `godie-e00v.ex.json` | 技能「84-002 我只想確定你在這裡」，槽位 EX |
| `godie-e00v.passive.json` | 技能「84-00 熊巴巴」，槽位 PASSIVE |
| `godie-e00v.q.json` | 技能「84-01 冷笑話」，槽位 Q |
| `godie-e00v.r.json` | 技能「84-04 給我蜂蜜」，槽位 R |
| `godie-e00v.w.json` | 技能「84-02 保齡球」，槽位 W |
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
| `godie-hlgr.e.json` | 技能「03-03 鯨式電漿光束炮」，槽位 E |
| `godie-hlgr.ex.json` | 技能「03-001 龍騎兵」，槽位 EX |
| `godie-hlgr.passive.json` | 技能「03-00 相轉移裝甲」，槽位 PASSIVE |
| `godie-hlgr.q.json` | 技能「03-02 詭雷」，槽位 Q |
| `godie-hlgr.r.json` | 技能「03-04 全彈發射」，槽位 R |
| `godie-hlgr.w.json` | 技能「03-01 磁軌砲」，槽位 W |
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

### `champions/` （41 檔）

| 檔案 | 是什麼 |
|---|---|
| `godie-e00j.json` | 英雄「皇者 - 騜」，4 格技能 |
| `godie-e00q.json` | 英雄「英靈-亞瑟王 - 黑化Saber」，4 格技能 |
| `godie-e00t.json` | 英雄「七夜怪談 - 貞子」，4 格技能 |
| `godie-e00v.json` | 英雄「百畝森林的霸主 - 維尼」，4 格技能 |
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
| `godie-hlgr.json` | 英雄「鋼彈 - 煌」，4 格技能 |
| `godie-n01b.json` | 英雄「地獄歌神 - 憤怒的胖虎」，4 格技能 |
| `godie-n01l.json` | 英雄「學姊 - 小派」，4 格技能 |
| `godie-naka.json` | 英雄「猿飛佐助 - 風魔小次郎」，4 格技能 |
| `godie-nbst.json` | 英雄「變態正義 - 瘋狂假面」，4 格技能 |
| `godie-nman.json` | 英雄「地獄歌神 - 憤怒的胖虎」，4 格技能 |
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
| `godie-u01q.json` | 英雄「測試英雄 - 索隆」，4 格技能 |
| `godie-usyl.json` | 英雄「殺戮之牙 - 異形」，4 格技能 |
| `godie-uwar.json` | 英雄「食神 - 撒尿牛丸」，4 格技能 |

### `config/` （1 檔）

| 檔案 | 是什麼 |
|---|---|
| `unit-tints-legacy.json` | ?「」 |

