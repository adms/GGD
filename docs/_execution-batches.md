# GGD 執行批次計畫（Execution Batches）

> 這不是進度日誌，也不是流水帳。這是一張**照這個順序交辦下去**的作戰表。
> 每一批 = 一個可以整批丟出去、丟完可以走開的波次；批內切成**檔案領域互斥的平行 lane**，好幾個 agent 同時跑不會撞檔。
>
> 改寫日期 2026-07-23 · 取代前一版五批計畫（前一版的完成度欄位已被證實**雙向失真**，見〈訂正區〉）
> 依據：對 branch `campaign/complete-tasks` @ `0c47fce` 的實地查核 —— 每一條宣稱都拿程式碼、`pnpm content:validate`、或用 repo 自己的 `ContentLoader + registerAll` 實跑驗過，文件與程式碼衝突時**一律以程式碼為準**。

## 這份檔案的使用規則

1. **相依 = 同批，沒有例外。** 兩件事碰同一份檔案，或一件需要另一件的 schema／資料，就是同一批。跨批只允許一種關係：**前批的產出被後批消費**（圖中虛線）。
2. **Lane 是檔案領域，不是主題。** 每個 lane 標明它**獨佔哪些路徑**。lane 之間不共用任何一個檔案。批內若有先後，會在 lane 描述裡寫明「等 X 落地才能開第二步」。
3. **排序依據是「使用者按下去會不會覺得被騙」**，不是內部整潔度 —— 唯一的例外是**衛生工作解鎖了整個叢集**時（例如註冊表權威、VFX 產生器），那種衛生工作會被提到最前面。
4. **規模**：S ≤ 半天 · M ≈ 1–2 天 · L ≈ 3–5 天 · XL = 自成一波。
5. 每批收工，回寫 `docs/_requirements-audit-gaps.md`、三張活頁、以及本檔的〈附錄：已驗證完成〉。

---

## 覆核紀錄 · 第二輪（2026-07-23，對本檔自身的對抗性審查）

本檔第一版寫完後做了一次**專門找相依錯排與 lane 撞檔**的覆核。以下 11 項已直接改進本檔，列在這裡是為了讓下一個讀者知道**哪些結論是被推翻過的**。

| # | 發現 | 種類 | 已如何修 |
|---|---|---|---|
| 1 | **1A-1 的方案 (a) 會製造新的謊言。** 有 6 個執行期呼叫點繞過註冊表直讀 `champion.abilities[slot]`（tooltip／技能圖示／射程預覽／champ-select／**bot AI**），拿掉重註冊只會讓 sim 與 UI 各說各話；且其中 `GameApp.ts` 是 Lane B 獨佔 → **跨 lane 撞檔** | 相依 + lane 衝突 | 裁決走 (b)，Lane A 寫入面收斂到 `content/champions/*.json`；1A-3 加第二條斷言 |
| 2 | **1A-2 的規模被高估。** 實測 452 份內嵌副本 194 份不一致，欄位只有 `vfxKey`(192) + `castTimeSec`(2)，`perRank`/`coeff`/`cooldown`/`maxRange` **零分歧** | 證據不支持 | 1A-2 由 M 降 S，驗收改成實測數字 |
| 3 | **Lane C 漏掉 `render/overheadAnchors.ts`** —— 守護者血條的顏色／高度／`hasOverheadBar` 全在那支純函式 | 漏檔 | 補進 Lane C 獨佔路徑，並註明因此不必碰 Lane B 的 `WorldAnchorLayer` |
| 4 | **1E-1 的實機簽收需要 #48，而 #48 排在批次 8。** platform 沒起來時 curation → allow-all、combat-env → bundled 預設，**在 fail-safe 環境簽收「畫面顯示的就是實際發生的」是自欺** | **相依錯排（跨 6 批）** | #48 殘留前移為 **1E-0**，成為簽收局的前置 |
| 5 | **1E-1 只抄了 11 項，gap-log:70 列的是 16 項。** 漏掉 #93 的 6 細節、#3 的 4 細項、#90、#82、#85 | 靜默漏項 | 全部補回 1E-1 |
| 6 | **舊 2A 與 2B 都獨佔 `tools/w3x-import`**（`descriptionRoles` 的輸出端就在匯入器裡），且 2B 的內容是 2A 產出的 | lane 衝突 + 相依 | 2B 併入 2A 成序列末步，lane 重新編號 |
| 7 | **舊 3A/3B/3C 三個 lane 都寫 `content/abilities/*.json`。** JSON 是整檔寫入，「我只碰某個欄位」在檔案系統層級不成立 | lane 衝突 | 改為「單一寫者 + 兩張補丁表」，這本來就是 #123 的目的 |
| 8 | **3C 的輸入（#50 的 per-invocation 參數）宣稱由批次 2 產出，但 2A 的內容清單裡沒有那一步** | 相依斷鏈 | 補成 2A ⑤，與 #78 道具半共用同一次 JASS 重讀 |
| 9 | **舊 4B 與 4C 都寫英雄／道具文件**，且 `buildPriority` 其實是英雄欄位不是道具欄位（實測 champions 113/113、items 0） | lane 衝突 + 事實錯誤 | 併進 4B 序列尾；4C 縮成純程式的閘門復原 |
| 10 | **舊 5E 必然要改 5A 獨佔的 `settlementModel.ts`**；且 5A 的路徑寫成 `ui/hud/settlementModel.ts`（**該檔案不存在**，實際在 `ui/panels/`） | lane 衝突 + 路徑錯誤 | 5E 併入 5A，路徑更正 |
| 11 | **舊 6A 宣稱 `models/imported/**`、6E 宣稱 `models/**`（後者包含前者）**，兩個 XL lane 平行；且順序只寫了 6C 沒寫 6E。**7C 宣稱 `apps/client/src/**`，包住 7E 與 7F 的路徑** | lane 衝突 | 批次 6 改為序列波（6E-a → 6A → 6C → 6E-b）並建議把 6E-b 切成批次 6′；7C 路徑收斂並從 7F 明確挖掉 `session.ts` |

**遺漏盤點（in / out）：** 對照帳本 173 件與兩份稽核清單逐一 grep，**唯一完全沒出現在任何批次的 pending 帳本項是 #75（龍吼環境音重新對齊 + 加深殘響，8 個細節）** → 已排進 2E。另有 **#143 已完成卻全檔 0 次提及** → 補進附錄（1E-4）。其餘 outstanding 項目（含 content-07 / content-10 / #85 量測代理 / #139 的 46 支非名冊 VO）皆已各自歸位。

**覆核後被我自己否決的懷疑（列出來，免得下一輪再查一次）：**
- 「1B-1 狀態光環要改 `VfxSystem.ts`」→ **否決**：`statusFx` getter 與 `StatusAuraFx` 都已就緒，只缺 `GameApp` 的呼叫，不跨 lane。
- 「1B-3 要改 `render/deathFocus.ts`」→ **否決**：從 `GameApp` 的來源端修 `teamId` 就夠，`buildFocusSources` 只是消費者。
- 「批次 3 的 #79 非名冊重綁會與批次 1 撞檔」→ **否決**：批次 1 只寫 `content/champions`，批次 3 寫 `content/abilities`，且是前批產出被後批消費的合法關係。
- 「#145 的三個投機分支其實是活的」→ **否決**：`snapshot.ts:32` 每回合寫 `state.mapId = ctl.arena.id`，`roundArenaId`/`roundMapId`/`arenaId` 三個欄位在協定中不存在，1D-3 刪得對。
- 「#121 的 `undoDepth` 其實有人讀」→ **否決**：全 repo grep 只有 schema 宣告與 `snapshot.ts:100` 的寫入，client 0 個讀者，`MerchantShop.tsx:119` 確實是 last-event 啟發式。

---

## 批次 0 · 已在飛行中（不要重排、但要接它們的產出）

四個背景 workflow 正在跑，會在批次 1 期間陸續落地。**它們不是待辦，是待接。**

| workflow | 內容 | 落地後解鎖什麼 |
|---|---|---|
| **A · 載入最佳化** | `.glb` gzip + brotli、AI icon → WebP 128×128、1441 份 content 文件合併成單一請求、4 個泛用英雄 glb（13.81 MB）瘦身、`docs/_audio-load-analysis.md` | 讓 #63 的「模型／語音 per-scene warm set」有真實 payload 尺寸可以對；與 #115 / #81 / #99 / #158 重疊，**批次 6 的模型工程必須以 A 的輸出為起點**，不要重壓一次 |
| **B · README + 產生器** | 事實查核過的 README，附一支維護名冊／技能／道具表格的產生器 | 建立「表格由程式產生、不手抄」的樣板 —— 批次 8 的三張活頁改成執行期計算時直接沿用 |
| **C · 平台首位管理員** | 首個註冊帳號自動成為管理員，取代三步 `ADMIN_BOOTSTRAP` | 解除 `apps/platform/internal/auth/service.go` 的寫入鎖。**批次 7 的 sec-154 平台鏈與 #126 核准閘門在 C 落地前一律不能開工**（同一支註冊函式） |
| **D · 場景資產稽核** | 逐場景實測 eager-byte 數字 | #63 擴充的 warm set **就是** D 產出的 scene→asset 對照表。批次 6 照著填，不要用猜的填一次再修一次 |

> ⚠️ 本批期間受其他 agent 獨佔、任何人不得改：`README.md`、`docs/_audio-load-analysis.md`、`nginx/`、`content/assets/`、`apps/platform/`、`packages/shared/src/content/`。

---

## 訂正區 · 假完成與死碼（本計畫價值最高的一段）

這一節單獨存在的理由：以下每一項在某張活頁上都被標成「完成」，但**實跑起來是假的**。它們不是新需求，是已經付過錢卻沒拿到貨的工作。全部被排回真實批次。

### 一個根因解釋三個最嚴重的發現

`packages/shared/src/content/registries.ts:73-74` 先註冊 standalone ability 文件、**再**註冊 champion；而 `packages/shared/src/sim/content/registry.ts:41-46` 的 `registerChampion` 會把 champion 文件裡**內嵌的 Q/W/E/R 副本重新蓋回去**。

因此：**任何寫進 `content/abilities/*.json` 的 QWER 修改，在執行期是看不見的。**

- 實跑證據（用 repo 自己的 `ContentLoader + registerAll` 跑 tsx 讀註冊表，非 grep 推論）：`godie-n003.q/.e/.r` → `fx.ember-bolt-cast`；只有 `godie-n003.ex` → `fx.prim.ice.pulse-lg`，因為 EX 沒有被內嵌進 champion 文件所以活了下來。
- 全域：**460 / 554 個技能在註冊表裡解析成 `fx.ember-bolt-cast`（83%）**；名冊 192 個 QWER 槽有 **175 個還是火焰 placeholder**；452 份內嵌副本有 **192 份與 standalone 文件不一致**。
- 消費端 `apps/client/src/vfx/VfxSystem.ts:609` 讀的正是被蓋掉的那張表。
- 綠燈測試 `apps/client/src/render/vfx/bindings.test.ts:41-43` **只斷言記憶體裡的 ROSTER 表**，從不碰出貨內容與註冊表 —— 這正是 #93 讓使用者被燒過的同一種失效形狀。

> **⚠ 覆核補正（2026-07-23 二次查核）：內嵌副本有第二條消費路徑，所以「拿掉重註冊」單獨不成立。**
>
> 前一版把 1A-1 寫成「(a) 拿掉 `registry.ts:41-46` 的重註冊 或 (b) 反向傳播進內嵌副本，二擇一」。**(a) 單獨做會製造一個更難查的謊言**：有六個執行期呼叫點**繞過 `Abilities` 註冊表、直接讀 `champion.abilities[slot]`** ——
> `apps/client/src/GameApp.ts:1262`（施放派送／射程預覽）、`apps/client/src/ui/panels/skillDetails.ts:108`（tooltip 的冷卻／魔耗／說明）、`apps/client/src/ui/abilityHold.ts:122`、`apps/client/src/ui/icons.ts:35`（技能圖示）、`apps/client/src/ui/panels/champselect/playstyle.ts:99`、以及 **`apps/game-server/src/ai/Tier0Brain.ts:304`（bot 的 manaCost / castType 判斷）**。
> 只做 (a)，sim 會照 standalone 文件跑，而 **tooltip、圖示、射程預覽與 bot AI 仍照舊的內嵌副本走** —— 顯示的和實際發生的再次不一致，正是本批要消滅的病。
> 而且 `GameApp.ts` 是 **Lane B 獨佔路徑**，(a) 需要 Lane A 進去改它 → 直接撞 lane。
>
> **裁決：1A-1 走 (b)。** 內嵌副本是唯一權威來源，standalone 文件的 `vfxKey` 反向傳播進 champion 文件；`registry.ts` 的重註冊**保留不動**（它現在是正確行為）。這讓 Lane A 的寫入面收斂成 `content/champions/*.json` 一處，與 Lane B 完全不相交。
>
> **實測差異規模（本次親自跑過，取代前一版的估計）：** 452 份內嵌 QWER 副本中 **194 份**與 standalone 不一致，而不一致的欄位幾乎全部是 `vfxKey`（192 份）**加上 `castTimeSec` 兩份** —— **沒有任何一份 `perRank` / `coeff` / `cooldown` / `maxRange` 不一致**。前一版擔心的「換權威會一次偷改 192 個技能的數值」**不成立**，1A-2 因此從 M 降為 S：要裁決的只有那 2 格 `castTimeSec`。
> 名冊範圍：192 個 QWER 槽，**standalone 已 0 個是火、內嵌 175 個是火**。全註冊表範圍：452 個 QWER 槽，standalone 231 火 / 內嵌 406 火。

| 帳本 | 活頁怎麼說 | 真實狀態 | 排到哪 |
|---|---|---|---|
| **#79** | gap-log:23 / 舊 B3-09 都寫「名冊 240 個技能已重綁，依文潔琳的冰藍是驗收案例」 | **死碼** —— 重綁確實寫進 `content/abilities/*.json`，但在註冊時被 champion 內嵌副本蓋掉。使用者的驗收案例在遊戲裡**依然是火** | **批次 1 · Lane A**（vfxKey 傳播進內嵌副本）+ **批次 3**（非名冊） |
| **#98** | gap-log:23「名冊範圍 ✅」 | **死碼** —— 該宣稱完全建立在 #79 的重綁上，而重綁沒到執行期。替代表本身是對的（`docs/todo/ability-vfx.md:40-56`） | **批次 1 · Lane A** 後即成立；刪空 GLB 在**批次 3** |
| **#123** | gap-log:20「✅」 | **部分** —— 94 份 `fx.prim.*` 文件與 `render/vfx/{primitives,elements,artParams,bindings}.ts` 都是真的，但 94 份裡**只有 25 份**能被註冊表解析到（其餘被 QWER 覆寫擋住）；`curatedDocs()` / `rosterBindings()`（`bindings.ts:178,188`）除了自己的測試外**沒有任何 import**，執行期與 `content:build` 都不呼叫 → 模組與出貨文件會靜默分歧 | **批次 3 · Lane A**（產生器 + 漂移守門） |
| **#89** | 帳本 pending、`gen_status.py:91` 標 📐「只有設計」 | **反過來的死碼：機制已在正式環境上線，但完全沒有 client。** `content/config/arena-rules.json` 出貨了完整 guardianTower 區塊（hpBase 1450 / volleyDamageBase 108 / radius 2.5），`MatchController.ts:725-731` 每次進戰鬥都武裝它，`roundPacing.test.ts:120-143` 證明每個活躍對決區都會生一座。但 `apps/game-server/src/net/snapshot.ts:144-215` 沒有 `world.structure` 分支 → 守護者掉進最後的 else，被編碼成 **kind 0（champion）、seatId -1、key ""**；`protocol/schema.ts:378-382` 沒有 GUARDIAN kind；`apps/client/src` 全域 grep「guardian」只有一句過期註解。**玩家現在面對的是每個對決區中央一顆看不見的 1450 HP 物件，會放沒有預告的 AoE 齊射。** | **批次 1 · Lane C**（視為線上可玩性 bug，不是功能缺口） |
| **#105** | 帳本 in_progress、`gen_status.py:108` 標 ⏸「11/12 agent 完成」 | **未開始** —— 只有美術落地（4 個 guardian glb，7/22）。`content/models` 只有一份 `prop.guardian.json` 硬指 `guardian_stone.glb`，五份 arena 文件都沒有 guardian 欄位，`spawnGuardian`（`GuardianSystem.ts:216-250`）根本不寫 model key | **批次 1 · Lane C**（與 #89 同一條 entity view 縫） |
| **狀態光環** | #133 標完成、#147 標 pending | **死碼** —— `VfxSystem.ts:395-398` 的註解直接把缺的那一行寫出來了：`vfx.statusFx.set(es.id, es.flags, pos.x, pos.z, nowMs)`。`StatusAuraFx.ts` + 測試都在，全 client grep `statusFx` 只有 getter 與那句註解。**暈眩／定身／緩速現在完全看不見** | **批次 1 · Lane B** |
| **花 / 守護者選取** | 舊 B1-09「server 端已可被打，client 選不到」 | **部分** —— `apps/client/src/GameApp.ts:1309` 的 `if (es.kind !== 0 || !es.alive) return;` 把 kind 2（花）與守護者結構從**每一張選取清單**濾掉（pickEnemyAt:1318、觸控最近敵人:539、攻擊移動:511）。中立血條顏色反而已經做好了（`overheadAnchors.ts:38`） | **批次 1 · Lane B** |
| **`useItem`** | 帳本 #128 completed，標題寫「技能 + 道具 IN-GAME 可施放性」 | **死碼** —— `packages/shared/src/sim/systems/CommandSystem.ts:98-100`：`case "recall": case "useItem": // deferred features — accepted but inert`。上游 intent／驗證／replay 過濾整條都通。#128 的 288 格矩陣**只涵蓋 48×6 技能槽，道具半完全沒被測過因為根本用不了** | **批次 2 · Lane C** |
| **`recall`** | 舊 B4-12 | **死碼** —— 螢幕上一顆按鈕（`TouchControls.tsx:402`）、手把 LB（`GamepadInput.ts:151`）、鍵盤 B（`InputCapture.ts:49`），按下去什麼都不發生 | **批次 2 · Lane C**（實作或刪掉，二選一） |
| **`hitFeel` 內容** | 帳本 #133 completed | **死碼** —— `grep -rl hitFeel content/` = **0 份**。每一次命中都還在吃「由傷害推導」的預設值，「每個技能手感不同」尚未兌現 | **批次 3 · Lane B** |
| **`descriptionRoles`** | 帳本 #114 completed | **死碼** —— `grep -rl descriptionRoles content/` = **0 份**。讀取端 `abilityText.ts:47-52` 全部就緒，所有 tooltip 都是死白字 | **批次 2 · Lane B** |
| **`canCrit` / `spriteSheet` / `gacha`** | 各自「模型已建好」 | **未開始（內容 0 筆）** —— 沒有任何技能 opt-in 暴擊（暴擊裝備只影響普攻）；1441 份文件 0 份帶 `spriteSheet`（每顆粒子都是靜態圖）；`arena-rules.json` 沒有 `gacha` 區塊，`round-reward.json` 是孤兒 | **批次 2 · Lane D / 批次 3 · Lane A** |
| **`undoDepth`** | schema 註解宣稱已接線 | **部分** —— `snapshot.ts:100` 每 tick 廣播，client 端 **0 個讀者**；`MerchantShop.tsx:119` 用 last-event 啟發式自己猜 | **批次 1 · Lane D** |
| **gore 設定** | 舊 B2-16 | **死碼** —— store 欄位、夾限、持久化、即時傳播全通過測試，`SettingsScreen.tsx` grep gore = 0 命中。**玩家關不掉血** | **批次 1 · Lane D** |
| **孤兒音效** | gap-log:258 | **死碼** —— `mapFlavor*` / `settlementReveal` / `matchEndGong` / `vsReveal` 在 `audio-map.json:504,512,528` 授權了，`sfxManifest.ts:44-45` 明說「故意不列，因為沒有東西會觸發」 | **批次 5 · Lane A**（呈現層 pass 順手安置） |
| **teamId `?? 0`** | 未被任何文件記錄 | **部分** —— `GameApp.ts:1033` 與 `:1613` 用 `?? 0`，`:1656`／`:1298`／`:1300` 用 `?? -1`。**team 0 是真的隊伍** → 尚未到達的席位會被畫成藍隊、拿到友軍血條色，還會被當隊友餵進 #85 的 `buildFocusSources` | **批次 1 · Lane B** |
| **#114 ↔ #125 地雷** | gap-log:256「潛在衝突」 | **未爆** —— `abilityText.ts:255-262,288-296` 的 `rescaleAbilityProse` 錨定在「數字緊鄰 傷害／秒冷卻／damage」上，而角色標記會把 `[/c]` 插進兩者之間。**只要 `descriptionRoles` 一有內容，所有 tooltip 立刻退回顯示未乘倍率的數字，而且不會有任何測試變紅** | **批次 2 · Lane B，必須是同一個 commit** |

### 反向漂移：活頁說沒做、其實做完了

以下 11 件被帳本或狀態頁標成 pending／stalled，實測**已端到端出貨**。全部收進〈附錄〉，**不得再排工**：#100、#63、#107、#110、#121、#128（技能半）、#131、#142、#145、#147、#148。細節與證據見附錄。

另有 6 條 gap-log 條目已被 `13afaf9` / `0c47fce` 修掉而未回寫：#78 的 `perRank [1,1,1]` / `coeff 0.003` 殘留（實測 0 份）、#136 投射物射程縮放、#89 的 structure 傷害減免、#133 的 EX／counter-hit stub、方向性運鏡 kick + EX punch-in（`GameApp.ts:1181,1185` 已有呼叫者）、`content:validate` 紅燈（實跑：`content OK: 1441 docs, cv_31aca38e2fb6`）。

---

## 現在就要問使用者的三個決策（不要等排到才問）

這三個答案卡在關鍵路徑上，全部應該在**批次 1 開工的同一天**丟出去：

1. **Civitai API token（#112 / #72）** —— 本機 M 系列管線已經能跑（≈5s/張、$0，已產出 282 張 icon），但使用者指定的 Civitai 模型沒有 token 會 401。這一個 token 擋住**整個批次 4**。
2. **重複英雄文件要不要實體刪除（#113）** —— 14 對 byte-identical、`isSameCharacter` 已判定，執行期也已折疊。刪或不刪決定 icon 要寫進哪份文件、`baseAttackTime` 要回填幾份。擋住批次 2 與批次 4 的寫入順序。
3. **`uhpr` / `umpr` 回復值要不要匯入（#144）** —— 原始值被 WC3 預設值汙染，硬匯入反而會把角色差異壓平。擋住批次 2 的尾巴，因此也擋住批次 2 的 TTK 簽收。

---

## 批次 1 · 讓畫面說實話

> **為什麼是這一批。** 使用者現在坐下來打一場，會遇到四件遊戲在對他說謊的事：依文潔琳放出來的是火（他親口指定的驗收案例）、對決區中央有一顆看不見的 1450 HP 砲台在放無預告 AoE、被暈住跟沒被暈住長得一模一樣、花跟守護者點不到。這些**沒有一件是新功能** —— 產生端全部已經上線，只是消費端從來沒接上。這批的每一項都是「把已經付過錢的東西接出來」。
> **解鎖：** 一個可信的手測環境。批次 2 之後所有的手感／數值調校都建立在「畫面顯示的就是實際發生的」這個前提上。

### Lane A · 內容權威修正（解 #79 / #98 / #123 的共同根因）

**獨佔路徑：** `content/champions/*.json` · 新測試 `packages/shared/src/content/abilityAuthority.test.ts` · `packages/shared/src/content/registries.ts`（僅在需要加註解時）
（註：`packages/shared/src/content` 目前被批次 0 的 agent 佔用，本 lane 的測試檔在其釋出後才寫；**內容寫入（`content/champions/*.json`）不受該鎖影響，可立即開工**。
**不碰** `packages/shared/src/sim/content/registry.ts`、**不碰** `apps/client/src/GameApp.ts`（Lane B 獨佔）—— 見上方〈覆核補正〉，走 (b) 就是為了讓這條界線成立。）

| # | 任務 | 使用者原話 / 為什麼在這批 | 驗收準則 | 規模 |
|---|---|---|---|---|
| **1A-1** | **把 standalone 文件的 `vfxKey` 反向傳播進 champion 內嵌 QWER 副本**（方案 b）。`registerChampion` 的重註冊**保留不動** | 「依文潔琳的冰要是冰」。這是整份計畫裡**單一改動解鎖最多既有工作**的一項：它同時讓 #79 的名冊半、#98 的名冊宣稱、#123 的 69 份被擱置 primitive 一次生效。**必須走 (b)**：另有六個呼叫點直接讀內嵌副本（tooltip／圖示／射程預覽／bot AI，清單見〈覆核補正〉），拿掉重註冊只會讓 sim 與 UI 各說各話 | 用真的 `ContentLoader + registerAll` 跑起來後：`Abilities.get("godie-n003.q").vfxKey === "fx.prim.ice.shockwave"`；**名冊 192 個 QWER 槽 0 個是火焰 placeholder**（現況內嵌 175 火）；全 452 個 QWER 槽解析成 `fx.ember-bolt-cast` 的數量從 **406 降到 231**（其餘 231 是非名冊，批次 3 處理）；`skillDetails` / `icons` / `Tier0Brain` 讀到的是同一份值 | M |
| **1A-2** | **與 1A-1 同一個 commit**：embedded ↔ standalone 逐欄差異稽核並附在 commit 訊息裡 | 換權威前必須先看差異表，否則等於在使用者不知情下偷改數值。**已實測：194 份不一致，欄位只有 `vfxKey`（192）與 `castTimeSec`（2），`perRank` / `coeff` / `cooldown` / `maxRange` 完全沒有分歧** —— 所以真正要人裁決的只有那 2 格 | 差異表落在 commit；2 格 `castTimeSec` 各有明確裁決；套用後 `pnpm content:validate` 綠燈 | S |
| **1A-3** | 補一支**會抓到這種失效**的測試：載入真實 content → `registerAll` → 斷言 `Abilities.get(id).vfxKey`，**並且**斷言 `Champions.get(cid).abilities[slot].vfxKey` 與它一致（把兩條消費路徑一起釘死） | 現有的 `bindings.test.ts:41-43` 綠燈綠了整段時間卻沒抓到 83% 的技能是火。只釘註冊表不夠 —— tooltip／圖示／bot AI 走的是另一條路 | 刻意把一份 champion 內嵌副本改回 `fx.ember-bolt-cast`，測試必須紅；刻意只改 standalone 而不改內嵌，測試也必須紅 | S |
| **1A-4** | `godie-n01g`（第二份依文潔琳）不在 `ROSTER` 內、兩份檔案都還是火 | 交棒給批次 2 的 #113 正典 id 決策，本批只要確保它不會出現在名冊 | 名冊解析結果不含 `godie-n01g` | S |

### Lane B · client 一行接線波

**獨佔路徑：** `apps/client/src/GameApp.ts` · `apps/client/src/ui/WorldAnchorLayer.tsx`
（`apps/client/src/vfx/VfxSystem.ts` **不需要改** —— `statusFx` getter 與 `StatusAuraFx` 都已就緒，缺的只是 `GameApp` 的呼叫。`render/deathFocus.ts` 也不需要改，1B-3 從來源端修就夠。）

| # | 任務 | 使用者原話 / 為什麼在這批 | 驗收準則 | 規模 |
|---|---|---|---|---|
| **1B-1** | 狀態光環解碼接線：在 entity sync 迴圈加 `vfx.statusFx.set(es.id, es.flags, pos.x, pos.z, nowMs)` | `VfxSystem.ts:395-398` 的註解**直接把缺的那一行寫出來了**。bitmask 從協定寫好那天就在線上飛，client 從來沒讀過 → CC 完全隱形。順帶白送衝刺揚塵 | 暈眩／定身／緩速／衝刺四種 flag 在畫面上各有可辨識光環；新增測試斷言 sync 迴圈確實呼叫 `statusFx.set` | S |
| **1B-2** | `enemyUnitsFor` 放寬到可攻擊中立物：花（kind 2）與守護者（structure），各自 pick radius | `GameApp.ts:1309` 那**一個 `es.kind !== 0` 濾網同時擋掉兩個功能**的選取。server 端花早就能被打，玩家點不到 | 右鍵能點到花並開始攻擊；攻擊移動與觸控最近敵人也吃得到；守護者可被指定（**此步等 Lane C 的 entity kind 落地**，花的部分可立即開工） | S |
| **1B-3** | `teamId` 統一成 `-1 = 未知`（`:1033`、`:1613` 目前是 `?? 0`） | team 0 是**真的隊伍**。尚未進 snapshot 的席位會被畫成藍隊、拿到友軍血條色，還會被當隊友餵進 #85 的 `buildFocusSources`（未知實體周圍出現一圈彩色池） | 未知席位不再取得任何隊伍顏色；`deathFocus` 的來源清單不含未知席位 | S |
| **1B-4** | 🔀 **F-06 / sec-154-06**：`makeChampionNode` 改用 `textContent` + `element.style`，停止字串拼 HTML | **跨主題但必須同批**：與 1B-2 的中立血條是同一個函式，一次開檔兩處改，分批等於同一段程式改兩次。也是唯一一個 high 等級的 client 安全洞（displayName 直接進 `innerHTML`，DOM/stored XSS） | 把 displayName 設成 `<img src=x onerror=...>`，畫面顯示為純文字且沒有任何 script 執行 | S |

### Lane C · 守護者上線（#89 client 半 + #105）

**獨佔路徑：** `packages/shared/src/protocol/schema.ts` · `apps/game-server/src/net/snapshot.ts` · `apps/client/src/render/EntityViewRegistry.ts` · **`apps/client/src/render/overheadAnchors.ts`** · `packages/shared/src/sim/systems/GuardianSystem.ts` · `content/models/prop.guardian*.json` · `content/arenas/*.json` · `apps/client/src/ui/panels/champselect/briefingContent.ts`

> **前一版漏掉 `overheadAnchors.ts`。** 守護者的血條走的是這支純函式（`KIND_*` 常數、`hasOverheadBar()`、`anchorColorFor()`、`anchorHeightFor()`，目前只認得 champion 0 / flower 2 / reviveCircle 3），新增 `KIND_GUARDIAN` 必須改它。好消息是**改完就不用碰 `WorldAnchorLayer.tsx`（Lane B 獨佔）** —— 顏色與高度都是從這裡取的。若最後仍需要動 `WorldAnchorLayer`，必須排在 1B-4 之後，不得平行。

| # | 任務 | 使用者原話 / 為什麼在這批 | 驗收準則 | 規模 |
|---|---|---|---|---|
| **1C-1** | 新增 `ENTITY_KIND.GUARDIAN` + `snapshot.ts` 的 `world.structure` 分支，帶 model key / hp / maxHp | **這是本次掃描找到最高的可玩性風險，不是功能缺口。** 機制已經在正式路徑上跑（`arena-rules.json` 出貨 hpBase 1450、`MatchController.ts:725-731` 每次進戰鬥武裝、`roundPacing.test.ts` 證明生成），但沒有任何 client 半 → 現在被編碼成 kind 0 / seatId -1 / key ""，畫成一隻沒染色的程序化 voxel 英雄還帶血條 | 守護者在 snapshot 中以自己的 kind 出現，攜帶 model key 與 hp；`snapshot.test` 覆蓋 | M |
| **1C-2** | `EntityViewRegistry` 守護者 view（中立血條色）+ **齊射地面預告** | 沒有預告的 AoE 對玩家而言就是「莫名其妙被打」 | 進入戰鬥回合後每個活躍對決區中央看得到守護者本體；被打會掉血；每次齊射前地面有可見預告 | M |
| **1C-3** | **#105** 每場地身份：`spawnGuardian`（`GuardianSystem.ts:216-250`）寫入 model key，改由 arena 文件的 `guardian` 欄位決定；補 5 份 model 文件（樹人／石頭人／巨獸人） | 美術已在磁碟上（`guardian_stone` / `guardian_beast` / `guardian_treant_trunk` / `guardian_treant_roots`），程式碼卻硬編 `GUARDIAN_MODEL_KEY = "prop.guardian"`（`GuardianSystem.ts:50`）。**跟 1C-1/1C-2 是同一條 entity view 縫，分批等於開兩次** | 每回合換場地時守護者的臉跟著換；缺 `guardian` 欄位的場地退回 stone 且不報錯 | M |
| **1C-4** | 刪掉 `briefingContent.ts:9` 那句對玩家說守護者「NOT BUILT YET」的字串 | server 每回合都在生它，選角簡報卻告訴玩家還沒做 | 簡報文字描述真實行為 | S |

### Lane D · 產出已上線、消費端從沒接

**獨佔路徑：** `apps/client/src/ui/SettingsScreen.tsx` · `apps/client/src/ui/panels/MerchantShop.tsx` · `apps/client/src/render/arenaSelect.ts`

| # | 任務 | 使用者原話 / 為什麼在這批 | 驗收準則 | 規模 |
|---|---|---|---|---|
| **1D-1** | 血腥風格／強度控制項進設定頁 | `settings/types.ts:57-60,92-93,139-142` 的 store、夾限、持久化、per-champion 覆寫、即時傳播**全部做完並測過**，`main.tsx:16` 也綁好了 —— 只差一個 UI 控制項。**玩家現在關不掉血** | 設定頁能切風格與強度、能關到 0、重開仍保留 | S |
| **1D-2** | `MerchantShop` 改讀權威的 `SeatState.undoDepth`，取代 `:119` 的 last-event 啟發式 | 欄位每 tick 廣播、client 0 個讀者。啟發式在多步撤銷或封包順序異常時會給錯的按鈕狀態 | 復原按鈕的顯示條件直接由 `undoDepth > 0` 決定；grep `undoDepth` 在 client 有讀者 | S |
| **1D-3** | **#145 client 清理**：刪掉 `arenaSelect.ts:23-29` 三個不存在的協定欄位分支（`roundArenaId` / `roundMapId` / `arenaId`），只留 `mapId` | 每回合換場地**整條已經是通的**（server `MatchController.ts:582-587` 決定性選場、`snapshot.ts:32` 廣播、client `GameApp.ts:733-734` → `applyArena` 重建），這三個投機分支只會讓下一個讀這段程式的人以為它壞了 | 換場地行為不變；`arenaRotation.test.ts` 仍綠 | S |

### Lane E · 實機簽收與活頁對帳

**獨佔路徑：** `tools/status/gen_status.py` · `docs/requirements-status.md` · `docs/_requirements-audit-gaps.md` · `apps/game-server/src/curation/whitelist.ts`（僅 1E-0 的 fail-safe 可見度）

| # | 任務 | 為什麼在這批 | 驗收準則 | 規模 |
|---|---|---|---|---|
| **1E-0** | 🔺 **從批次 8 前移的前置：#48 殘留。** 開簽收局之前，先確認本機 platform 真的起著、而且 **curation 白名單與 combat-env 都不在 fail-safe 路徑上**；若在，簽收局量到的是 fail-safe 的數字不是出貨內容 | **前一版把 #48 排在批次 8，但 1E-1 需要它。** URL 解析本身已修好（`config/platformUrl.ts` 有 `http://localhost:8080` fallback），殘留的是「platform 沒起來時整場靜默走 fail-safe」：curation → allow-all、combat-env → bundled 預設。**這正是最近才修掉的那個 bug 的同一種形狀**（未設定的 platform 送出一張全 1.0 的表，靜默覆蓋掉每一個內容作者寫的倍率）。在這種環境下簽收「畫面顯示的就是實際發生的」是自欺 | 開局時 HUD／log 能一眼看出兩條 fetch 是「真的拿到 platform 資料」還是 fail-safe；簽收局在**非 fail-safe** 狀態下進行 | S |
| **1E-1** | **一場實機僵局回合**，用既有的零冷卻 / 清場 cheat（`CheatConsole.tsx:256,263`）逐項簽收「已完成但從來沒被眼睛看過」的工作：#100 回合結算凍結、#131 白爆點、#110 抽牌卡、#121 商店復原、#145 換場地、#147 打擊感、#148 商人提示、#142 名言 VO、#107 安全區（回報症狀是 FPS pill 蓋住商店）、#164 傷害數字顏色、#166 被動虛線框、**#85 死亡去飽和**、**#93 勝利呈現的 6 個細節**、**#3 Capcom 手感的 4 個細項**、**#90 復活不重複發賞金**、**#82 雙公式模擬** | **這是整份計畫裡每小時信心增益最高的一件事。** 程式與測試都綠，沒有一件被眼睛看過 —— 而 #93 的教訓正是綠燈測試可以整段時間都在斷言錯的東西。**後 5 項是前一版漏掉的**：gap-log:70 明白列出「仍需人工逐項細看而非只是 grep」的清單（#93 的 6、#75 的 8、#3 的 4、#90、#82），前一版只抄了 11 項就收尾 | 逐項 pass/fail 簽收表（含子細節層級）；fail 的項目當場開成批次 2 的列 | M |
| **1E-2** | 修 `gen_status.py` 的三處自相矛盾：#85 重複列（combat ⬜ / models ✅）、#93 重複列（combat ⏸ / models 🔄）、`:128` 仍把 #128 標 pending | 現在任何人拿 `requirements-status.md` 規劃都在讀小說（頁面日期 07-22、統計 131 件 vs 帳本 173 件） | 重跑 `gen_status.py` 後無重複 id、無與本檔訂正區衝突的狀態 | S |
| **1E-3** | 回寫 gap-log：6 條已被 `13afaf9`／`0c47fce` 修掉的 status-drift 條目關掉；#79/#98 那兩個**自己是錯的** ✅ 改成本檔的判定 | 滾動紀錄紀律。gap-log 整體比另外兩張活頁準，唯獨 #79/#98 反了 | gap-log 與本檔訂正區一致 | S |
| **1E-4** | 把 **#143**（回合勝利者 3D model + VO，已於 `2031f7a` 落地）與 **#172 / #173** 補進本檔〈附錄〉 | 前一版全檔 0 次提及 #143 —— 一件已經做完的工作既不在批次也不在附錄，下一個規劃者會把它當新工作重排 | 三者都在附錄且標明證據 | S |

**批次 1 的完成定義：** 使用者在**確認不是 fail-safe** 的環境開一場，看得到守護者、看得到 CC、點得到花、依文潔琳放的是冰、能關掉血，而且手上有一張 16 項（含子細節）的實機簽收表。

---

## 批次 2 · 數值鏈、道具語意、手感表面

> **為什麼是這一批。** 三條互相獨立、但**內部絕不能拆**的鏈子。(1) 匯入器 → 每角色數值 → TTK → 增幅簽收：分開做等於後面每一步都會推翻前一步的結論。(2) 道具語意：`useItem` 是死碼，所以「主動效果道具」這整類 w3x 內容做不出來，#128 的道具半也無法測。(3) BGM 與手機佈局是兩個**完全互斥的檔案領域**，正好塞進來當平行 lane，而且 BGM 需要使用者聽了才算數 —— 越早問越好。
> **解鎖：** 數值凍結。批次 3、4 的內容量產才不會建立在會變的數字上。
> **🔺 跨批硬約束（前一版沒寫）：2A 會重跑匯入器並重寫 `content/champions/*.json` —— 那正是批次 1 Lane A 寫入 `vfxKey` 的同一批檔案。** 匯入器若原樣覆蓋，會**靜默回退整個批次 1 的成果**（而且沒有任何測試會紅，因為 `bindings.test.ts` 只看記憶體表）。**2A 的收工條件之一是 `abilityAuthority.test.ts` 仍然綠**，且匯入器對已存在的 `vfxKey` 採保留語意（或重跑後立即以 1A 的傳播腳本補寫）。

> **🔧 覆核修正：前一版的 2A 與 2B 宣稱互斥，實際上都獨佔 `tools/w3x-import`。** 2B 的 `descriptionRoles` **輸出端就在匯入器裡**（2A 的路徑），而且 #114 的內容又是 2A 的 `#56 rawMods` 透傳產出的。兩個 agent 平行進去必撞。**已合併：2B 併入 2A，成為批內序列的最後一步**，並保留「#114 + #125 必須同一個 commit」的硬規則。以下 lane 已重新編號。

| Lane | 獨佔路徑 | 內容 | 規模 |
|---|---|---|---|
| **2A · 匯入器 → 數值 → tooltip 語意（單寫者，批內序列）** | `tools/w3x-import/**` · `content/champions/*.json` · `content/items/*.json` · `content/abilities/*.json` · `apps/client/src/ui/components/abilityText.ts` | **① #113 正典 id 定案**（先做，決定後面所有寫入的目標檔）→ **② #56** `rawMods` 透傳（`umvs`／攻擊冷卻＋後搖／`uhpr`／`umpr`／`\|cAARRGGBB` 全部從這裡出來）→ **③ #144** `baseAttackTime` 回填 113 份（目前全吃 1.0s 預設；移動速度已落地，18 級距 4.0–10.1，只需複驗）→ **④ #78 道具半的 1:1 覆核**（技能半已驗淨，道具半從未被任何 commit 提及）→ **⑤ #50 的 per-invocation 美術參數抽取**（dummy-effect／special-effect 呼叫點的 scale／tint／alpha／count／timeScale —— **同一次 JASS 重讀，兩個消費者；不在這裡抽，批次 3C 就沒有值可以填**）→ **⑥ #83 w3x-22 守門** + **legend-01 守門** + **#108 說明↔modifier 逐項複驗** → **⑦ #114 `descriptionRoles` 輸出 + #125 rescale 錨點修正（必須是同一個 commit）**：`rescaleAbilityProse`（`abilityText.ts:255-262,288-296`）錨定在數字緊鄰「傷害／秒冷卻」，角色標記會把 `[/c]` 插進中間 → 一旦有內容，所有 tooltip 靜默退回未乘倍率的數字，**而且不會有任何測試變紅** | XL |
| **2B · 道具語意** | `packages/shared/src/sim/systems/CommandSystem.ts` · `packages/shared/src/sim/effects/**` · `apps/client/src/ui/TouchControls.tsx` · `apps/client/src/input/**` | **`useItem` 實作**（sim 端 + 商店 UI 派送）→ **`recall` 決策**（實作自我傳送回泉水／商店，或刪掉按鈕＋手把＋鍵盤綁定；螢幕上一顆按不動的按鈕對玩家就是 bug）→ **#128 道具半掃描**（技能半 288 格已 281 PASS / 7 被動 / 0 FAIL，道具半在 `useItem` 之前無從測起）→ 使用者親手做的**遠程 vs 近戰操作差異**測試（指定／地面／skillshot，headless 掃描代替不了） | L |
| **2C · 平衡拍板** | `content/augments/*.json` · `content/config/arena-rules.json` · `content/loot-tables/round-reward.json` | **TTK 重測**（#153 的 `TTK ≈ 13.8×maxHealth−4` 是在攻速還沒差異化前量的，必須等 2A ③）→ **#149 增幅池擴充**（現在銀 6／金 8／稜彩 7；不重複抽牌 + 排除已持有 → 每回合都抽的人約第 10 回合把稜彩池抽乾，`MatchController.ts:487` 之後就**靜默不再發牌**）→ **gacha 決策**（`arenaRules.ts:47,68` 的 legacy 預設有 `gacha`，出貨的 `arena-rules.json` 沒有 → 開它或刪 `round-reward.json`）→ **`canCrit` 授權政策**（目前 0 份內容 opt-in，暴擊裝備只影響普攻；**政策在這裡拍板、內容在批次 3 由單一寫者落**） | M |
| **2D · 手機與安全區** | `apps/client/src/ui/hud/hudLayout.ts` · `apps/client/src/ui/hud/**` | **#151 iPhone 橫向（390px 高）選單重疊** + **#107 最後兩個硬編碼**（`:272` Leave 按鈕 right:10/top:10、`:376` 計分板差 4px）。兩者改同一批常數，分開做會逐行相撞，而且共用同一場真機 session。戰鬥強制橫向 = 玩家實際待著的方向 | M |
| **2E · 音訊硬序列（單寫者）** | `tools/bgm-gen/**` · `content/assets/audio/bgm/**` · `content/assets/audio/sfx/ambient/**` | `bgm-gen` 一次只能跑一軌、每個 job 都改寫同一份 `audition.py`，**兩個 agent 進來會互相毀掉頁面**。序列：**#135** 每場景 signature intro 的 rap/VO 層目前預設關閉（只有 `--tts` 才烘）→ 使用者 audition 簽收 → **火圈 intro 重寫**（遠方空襲警報 + 嘲諷中文 rap → 爆炸，crescendo 縮短，gap-log:162，**從未有帳本編號**）→ **控制室整軌改寫**（教堂／福音、神父 rap intro、中段嘲諷 rap，gap-log:163，**從未有帳本編號**）→ **🔺 #75 龍吼環境音**（把 ambient cries 重新對齊**縮短後的 anchor**、加深殘響 —— **前一版全檔 0 次提及，是本次覆核找到唯一被完全遺漏的 pending 帳本項**；使用者列了 8 個細節，逐項對、不要 grep）→ **#137 12 支變奏檔上架驗證**（audition 擴到 24）→ **#142 audition 頁「英雄名言」區** | L |

---

## 批次 3 · VFX 生成鏈與技能表現

> **為什麼在這裡。** 批次 1 把註冊表打通之後，`content/abilities` 才第一次真的是可見的；批次 2 的 JASS 重讀順手產出 #50 需要的 per-invocation 參數表。這批是**量產**，不是設計。
> **🔧 覆核修正：前一版把 3A / 3B / 3C 並列成「平行 lane」，但三者都直接寫 `content/abilities/*.json`（555 份）。** JSON 是**整檔寫入**，不是欄位寫入 —— 宣稱「我只碰 `vfxKey` 欄位、他只碰 `hitFeel` 欄位」在檔案系統層級不成立，三個 agent 平行跑會互相覆蓋，`content:build` 也會三方打架。
> **已改為「單一寫者 + 三張輸入表」：** 3A 先把 `render/vfx` 做成建置期真理來源（#123），**同一支產生器順勢成為 `content/abilities` 的唯一寫入者**；3B / 3C **不直接改 JSON**，各自產出一張以 ability id 為 key 的**欄位補丁表**（`hitFeel` 表、`artParams` 表），由 3A 的產生器一次套用、一次 `content:build`。這樣三條工作流仍然平行，衝突面收斂成一個寫入點 —— 而且這本來就是 #123「模組是真理來源」的目的。
> **硬約束不變：** 這四個 lane 必須同一批。

| Lane | 獨佔路徑 | 內容 | 規模 |
|---|---|---|---|
| **3A · 產生器與唯一寫入者** | `apps/client/src/render/vfx/**` · `content/vfx/**` · **`content/abilities/*.json`（本批唯一的寫入者）** | **#123** 讓 `render/vfx` 成為 94 份 `fx.prim.*.json` 的**建置期真理來源**：`curatedDocs()`／`rosterBindings()` 加 CLI/npm script + 漂移守門測試（目前執行期與 `content:build` 都沒有任何 import → 模組與出貨文件可以靜默分歧）→ 擴成能套用 3B/3C 補丁表的 **content 產生器** → **#79** 非名冊重綁（實測：批次 1 之後仍有 **231 個 QWER 槽 + 非 QWER 技能**指向 `fx.ember-bolt-cast`）→ **#98** 非名冊引用改指原生 primitive 並把 **11 個零幾何 GLB 從 `model-budget/report.json` 刪掉** → **`spriteSheet`**：mdx→vfx 匯入器輸出 WC3 翻頁動畫（1441 份文件 0 命中，每顆粒子都是靜態圖） | XL |
| **3B · 手感內容授權（產出補丁表，不寫 JSON）** | `content/_patches/hitFeel.json`（新）· `packages/shared/src/content/schema/ability.ts` 的既有欄位 | **`hitFeel` 授權 pass**：per-champion / per-ability 旋鈕目前 content 內 0 筆，每次命中都吃傷害推導的預設值 —— 「每個技能手感不同」的真正兌現在這裡。順帶落 **2C 拍板**的 `canCrit` opt-in。**交付物是補丁表 + 一支驗證它涵蓋率的測試，套用由 3A 執行** | L |
| **3C · 美術參數資料半（產出補丁表，不寫 JSON）** | `apps/client/src/render/vfx/artParams.ts` · `content/_patches/artParams.json`（新） | **#50**：地圖 dummy-effect／special-effect 呼叫點的真實 scale／tint／alpha／count／timeScale。轉換與測試都在，缺的是值 —— **值來自批次 2A ⑤ 的 JASS 重讀**（前一版說「批次 2 會產出」但 2A 的內容清單裡根本沒有這一步，已補上）。**交付物是補丁表，套用由 3A 執行** | L |
| **3D · 陰影殘留** | `apps/client/src/render/Lighting.ts` | **#147 殘留**：目前沒有真正的 shadow-map pass（`Lighting.ts:1-7` 自己寫明），`setShadowsEnabled` 只調整平行光強度 0.9 ↔ 0.25。blob 影子已足夠支撐 gameplay 判讀，但**標著「陰影」的品質選項並不會切換 ShadowGenerator**。這是本批唯一真正無關的檔案領域，可完全平行 | M |

---

## 批次 4 · 圖像管線與美術補完

> **為什麼在這裡。** 整批**卡在單一外部輸入**（Civitai token），而且必須跟在批次 2 的 #113 正典 id 決策後面 —— 否則 icon 欄位會被寫進之後要刪掉的文件。
> **注意：** `apps/platform` 在批次 0 的 workflow C 落地前不得開工。

| Lane | 獨佔路徑 | 內容 | 規模 |
|---|---|---|---|
| **4A · provider + SSRF（同檔案，必須同批）** | `apps/platform/internal/**/provider.go` · `music.go` | **#112** provider 設定（真正的根因是沒設定 provider，不是程式壞了；本機 M 系列管線已產出 282 張 icon）**＋🔀 sec-154-08 SSRF 白名單**（限 https、擋 loopback／link-local／RFC1918／169.254.169.254、限定 provider 網域、絕不把 API key 送到外部主機）。兩件改的是同一段 fetch，分批等於同一支函式改兩次 | M |
| **4B · 英雄／道具文件的唯一寫入者（icon + 出裝梯子）** | `content/assets/icons/**` · `content/champions/*.json` · `content/items/*.json` | **① #72 殘留範圍**（現況：champions 109、items 157、**augments 只有 3 張對 22 份文件**、abilities 13 —— 活頁上「0 張」的說法是過期的）。抽牌是使用者指名的「不要盲猜」表面，優先補 augments → **② #146** 商人頭像單張 PNG（`layout.ts:88` 指著 `assets/icons/shop/traveling-merchant.png`，該目錄不存在，`MerchantTipBox.tsx:79` 永遠退化成字母 glyph）→ **③ ident-11** 9 張錯配頭像重抽（曹操掛皮卡丘的圖）→ **④ 名冊首發缺件**（妙蛙花沒有頭像、魔人普烏 EX 說明是空的 —— `starter.go:78-100` 明白記錄「為了讓 48 名先出貨而拿掉 icon 與文案閘門」）→ **⑤ `buildPriority` 回填**（多數名冊角色只有 2 階梯子，直接影響 bot 出裝品質與商店推薦） | L |
| **4C · 策展閘門（程式，不碰內容）** | `apps/platform/internal/curation/**` | 把 `starter.go:93-100` 被拿掉的 **≥4 階出裝閘門**與 icon／文案閘門**裝回去**，讓 4B ④⑤ 的缺件無法再靜默出貨。**不寫任何 content 文件** | S |

> **🔧 覆核修正。** 前一版的 4C 宣稱獨佔 `content/items/*.json`，但 **`buildPriority` 是英雄欄位不是道具欄位**（實測：`content/champions` 113 份全部帶 `buildPriority`，`content/items` 0 份），而且 4B 同時在寫同一批英雄文件 → 兩個 lane 平行必撞。已把 `buildPriority` 回填併入 4B 的序列尾，4C 縮成純程式的閘門復原。

---

## 批次 5 · 選角、呈現層、登入場景

> **為什麼在這裡。** 這批是「回合結束到底誰贏」「按下確認角色有沒有反應」那一類**每一場都會經過**的表面。放在批次 4 之後，是因為選角檔案面板要展示的正是批次 4 產出的頭像。

| Lane | 獨佔路徑 | 內容 | 規模 |
|---|---|---|---|
| **5A · 呈現層收尾（含 #142 權威第一名）** | `apps/client/src/ui/panels/MatchEndPanel.tsx` · `apps/client/src/ui/RoundEndVoice.tsx` · **`apps/client/src/ui/panels/settlementModel.ts`**（前一版寫成 `ui/hud/`，該路徑不存在）· `apps/game-server/src/match/MatchController.ts` · `packages/shared/src/protocol/schema.ts` | **#93 殘留**：卡片停留、savage VO、名言全部從**面板掛載**計時，不是從煙火發射計時（`MatchEndPanel.tsx:332-337` 自承「假設兩者同一幀」）→ 改成錨在煙火的 launch callback，保留現有計時器當 fail-open → **孤兒音效安置**（`mapFlavor*`／`settlementReveal`／`matchEndGong`／`vsReveal`）→ **結算自動跳戰績**（目前是按鈕，使用者要的是自動）→ **#173 bye-round 簽收**（優先慶祝「贏了對決」的隊伍，導致一般四隊回合裡生命數領先但輸掉對決的隊伍永遠不被慶祝 —— 需要使用者在實機看一次拍板）→ **🔀 併入的前 5E：#142 權威第一名**。回合結束第一名目前由 client 從共享 schema 推導（`settlementModel.ts:411` 讀 `roundOutcome`）。#173 已加進權威的每回合 K/D（`TeamState.roundOutcome`、`SeatState.roundKills/roundDeaths`），升級成廣播欄位很便宜 —— 剩一個使用者決策：接受推導值，還是要真 MVP | L |
| **5B · 選角畫面** | `apps/client/src/ui/panels/champselect/**` · `apps/client/src/audio/nameVoice.ts` | **#76** 角色檔案面板 → **#41** hover 觸發 title+name 呼叫語（VO 內容已存在，缺的只是 handler，且它從 #76 正在做的面板觸發）→ **#139** Codex 英雄頁顯示名言（113 句都在 `quotes.json`，使用者明確要求 codex 也要看得到）→ **#167 選角鎖定改 server 權威**（目前純 client，`lockGate.ts:13-24`；改造過的 client 鎖完還能換，其他席也看不到鎖定） | M |
| **5C · 登入場景** | `apps/client/src/ui/platform/AuthScreen.tsx` | **#74** 登入→戰鬥交接（龍吼淡出的 gate 已在 `:99-103`，缺 ≥1s 載入條與自己英雄的隊伍輝光）→ **逐字打字火花**（打字音效已接在 `:188`，視覺沒有）→（選配）AnalyserNode 讓魔法陣隨音樂呼吸 | M |
| **5D · 商店場景** | `apps/client/src/render/intermission/layout.ts` · `apps/client/src/ui/panels/MerchantShop.tsx` | **#94** 商店卡片靠左 —— 同一份 composition 已被 #146 重新對準過（商人置中、`CHAMPION_STAND +0.15`）並被 `layout.test.ts` 與 #103 視線測試釘住，**移動卡片必須在同一次編輯裡重新滿足那兩條斷言** | S |
> **🔧 覆核修正：前一版的 5E 已併入 5A。** 「把第一名改成伺服器廣播」必然要改 `settlementModel.ts` 的推導端（`:411` 的 `roundOutcome` 判定就是那段推導），而那是 5A 的獨佔檔案 —— 兩個 lane 平行會逐行相撞，而且 5A 的 RoundEndVoice／MatchEndPanel 正是這個值的唯一消費者。**同一個資料流，同一個 lane。**
> 另補：**#139 的 46 句非名冊名言仍沒有 VO 音檔**（名冊 113 句已齊）。若使用者要 codex 上每個角色都能播，這 46 支要排進批次 2E 的 TTS 佇列，不要留在 5B 當隱形殘留。

---

## 批次 6 · 模型工程與變身系統

> **為什麼在這裡。** 這批**只能一次做完**：每一項都改寫 `content/assets/models/imported/**.glb` 的位元組，並讓 `packages/shared/src/content/modelScale.fixture.json` 與 mdl-01..08／mdl-61..65／mdl-150a-c 整套回歸失效 —— 那份 fixture 每次匯出只能重生一次。同時它必須跟在批次 0 的 workflow A（glb 瘦身／壓縮）與 D（實測 eager bytes）之後，否則等於壓縮兩次、量測兩次。
>
> **🔧 覆核修正：這批不是「五個平行 lane」，是一條序列 + 兩條平行支線。** 前一版讓 6A 宣稱 `content/assets/models/imported/**` 而 6E 宣稱 `content/assets/models/**` —— **後者包含前者**，兩個 XL lane 平行跑會互相覆蓋位元組。而且順序邏輯前一版只寫了一半（寫了「6C 排在 6A 之後」，沒寫 6E）。
>
> **本批的正確執行序：**
> **① 6E-a 存活清單裁決**（129 個 imported GLB 哪些要換掉、哪些留下）→ **② 6A 全量重匯**（只對存活者做 mdl-06 基準烘焙 / #61 / #73，一次重生 fixture）→ **③ 6C 減面**（對定案後的網格）→ **④ 6E-b 替換件回到 6A 的匯出管線**。
> 對這條序列做任何顛倒都是白工：對即將被換掉的模型重匯或減面，成果直接丟掉。
> **真正可平行的只有兩條：6B（變身系統，`packages/shared/src/sim/**`）與 6D（載入，`AssetManager` / `audio`）。**
> 因為這條序列本身就是一個波，**建議把 6E-b（129 件替換素材的取得與授權舉證）獨立成批次 6′**，否則這一批無法一次交辦出去。

| Lane | 獨佔路徑 | 內容 | 規模 |
|---|---|---|---|
| **6A · 匯出與稽核（批內序列）** | `tools/w3x-import/w3xlib/gltf.py` · `content/assets/models/imported/**` · `packages/shared/src/content/modelScale.fixture.json` | **mdl-06** 把 +90° 基準旋轉烘進匯出器並全量重匯 → **#61** 補回被丟掉的可見度軌與幾何 → **#73** 掛件幾何合併（悟空沒頭那一類）→ **#68 交付物是一張表**：使用者要的是**每角色 × 每片段動畫的 pass/fail**，不要他自己一個個看 113 個模型（他點名的案例：血輪眼左助飛行、皮卡丘 idle 翻轉、桔梗 walk） | XL |
| **6B · 變身系統** | `packages/shared/src/sim/**`（form-swap 新模組）· `content/champions/*.json` | **#119**：`grep -rn 'formSwap\|revertForm\|transformInto' packages/shared/src` = **0 命中**，全 repo 只有兩件工作是真正的零。**必須與 6A 同批**：mdl-73-03 那批被保守留下的 geoset 正是 heroichigo 的 TRANSFORM-BODY 組 —— 沒有 #119 就沒有 gate 可綁，而剝掉它們就是刪掉 #119 將來要用的變身美術 | L |
| **6C · 資產工程** | `tools/lod-gen/**` · `content/assets/model-budget/**` | **#115 LOD**（`tools/lod-gen` 目前只有一個 `node_modules` symlink，零份原始碼 —— 帳本標 in_progress 是錯的）→ mb-07 骨架感知簡化 + 綁定存活驗證 → **#99 資產預算頁**（三角數／貼圖／使用處，依專案慣例做成**執行期計算的站內活頁**）。**必須排在 6A 之後**：對即將被 #116/#81 換掉的 129 個 glb 做減面等於白做 | L |
| **6D · 場景範圍載入擴充** | `apps/client/src/render/AssetManager.ts` · `apps/client/src/audio/**` | **#63 擴充**：SFX 半已完成（`AudioSystem.ts:257-266,403-405,467-471`），模型與語音沒有 per-scene warm set。使用者原話是「只載入戰鬥必要素材」。**warm set 就是 workflow D 量出來的 scene→asset 對照表**，照著填，不要先猜再修。順帶補 #63 規格漏掉的兩項：champSelect 對戰鬥集合的 LOOKAHEAD 預熱（否則回合第一次命中仍可能冷抓）、以及前後 byte／延遲對照報告 | M |
| **6E-a · 存活清單裁決（本批第一步，序列）** | `content/assets/model-budget/**`（清單文件） | **#81 / #116 的前半**：逐一裁決 129 個 imported GLB「換掉 / 留下」，產出存活清單。**6A 與 6C 都以這份清單為輸入** | M |
| **6E-b · 暴雪素材債替換（建議獨立成批次 6′）** | `content/assets/models/replacements/**` → 完成後才進 `imported/**` | **#81 / #116 的後半**：實際取得 129 件替換素材 + 逐件授權舉證，再走 6A 的匯出管線。這是版權層的**永久解**（批次 8 的環境分層只是把它擋住不出貨）。**與 6A 共享 `content/assets/models/**`，絕不可與 6A 平行** | XL |

---

## 批次 7 · 平台安全、測試基礎建設、編輯器

> **為什麼在這裡。** 這批不改變「現在好不好玩」，只決定「以後改動會不會壞」與「敢不敢把網址給別人」。放在內容之後是因為 E2E 要有穩定畫面才錄得起來。
> **前置：** 7A 必須等批次 0 的 workflow C 落地（同一支 `service.go` 註冊函式）。

| Lane | 獨佔路徑 | 內容 | 規模 |
|---|---|---|---|
| **7A · 遊戲伺服器入口硬化** | `apps/game-server/src/net/validateInput.ts` · `apps/game-server/src/match/MatchRoom.ts` | **sec-154-01 + sec-154-04 必須同批**（同一個 mailbox 接縫）：INPUT 白名單化（未知 kind 丟棄、slot ∈ {Q,W,E,R,EX}、itemSlot 範圍內整數、座標有限）+ `commands[]` 上限與每 session 速率限制。**F-01 一則訊息就能讓 `Registry.get(undefined)` 拋錯 → tick catch 把整個房間踢線**；#46 的 try/catch 不是緩解，它只是把拋錯換成全房斷線。這兩件與 F-04 是**唯二能被單一封包用來殺掉一場正在打的比賽**的洞 → 加上 sec-154-03（onCreate 需 server-only 證明）、sec-154-07（displayName 清洗、拒絕 client 給的 `options.seats`）、sec-154-14（`PLATFORM_GAME_SHARED_SECRET` 開機守門，目前密鑰為空時 **fail-OPEN**） | M |
| **7B · 平台安全鏈（硬序列）** | `apps/platform/internal/{auth,httpx,server}/**` | **sec-154-05 可信代理 ClientIP 是這條鏈的根**：限流器 key 在可偽造的 `X-Real-Ip` 上（`middleware.go:35-44`），繞過邊緣直連就完全失效 → sec-154-02 註冊 per-IP 限流 + argon2 併發信號量 → **#126 核准閘門** → sec-154-11 未核准帳號上限與 TTL 回收（**無界成長正是核准閘門造成的**，SetNX ttl 0）→ sec-154-18 註冊衝突回應統一 + 時序對齊。加上 sec-154-09/10/12/19 四項平台硬化 | L |
| **7C · client 安全與傳輸** | `apps/client/vite.config.ts` · `apps/client/index.html` · **`apps/client/src/ui/platform/session.ts`（明確從 7F 的宣稱中挖掉）** · `apps/client/src/*.html`（audition/debug） | sec-154-15 真正的 CSP（目前 prod 只有 `frame-ancestors 'none'`，零 XSS 緩解）→ sec-154-21 refresh token 改 httpOnly+Secure+SameSite=Strict cookie、access token 只放記憶體 → sec-154-16 prod build 排除 audition/debug HTML（**目前打包進 prod 並公開提供**，約 20 個 innerHTML sink；注意 `bgm-audition.html` 是使用者現役簽收工具，排除不能弄壞本機使用）→ sec-154-17 / 22 vite staticHandler `realpathSync` + `nosniff` | L |
| **7D · 測試 beacon 總開關** | `tools/testrunner/**` · 新 playwright 套件 · `apps/client/src/render/deathFocus.test.ts` | **建起 `playwright-e2e` 套件本體**（`suites.yaml:162-169` 目前 `enabled: false`，註解寫「placeholder」）。**一次做完解鎖七列**：webui-11/12、client-09/10、couch-16、roster-08、rankui-11 —— 除 client-10（斷線寬限重連）之外全部手動驗過，只缺自動 beacon。加 col-11 + sim-07（碰撞 replay 一致性只有在系統順序被釘死之後才有意義）+ **content-07 / content-10** + **🔺 #85 的量測代理修正**（`deathFocus.test.ts:357-385` 用**世界空間**面積比 7.8% < 8% 當「畫面讀起來是灰的」的守門，但使用者的需求是**螢幕**；靠近鏡頭的色池佔的螢幕面積遠大於它的地面佔比 → 改成投影面積指標，或在測試裡寫明這個代理的極限） | L |
| **7E · 編輯器與協作** | `apps/admin/**` · `apps/client/src/ui/editor/**` | editor-04 RefSelect 選項來自目標集合索引 → editor-05/content-11 BabylonPreview 走真渲染器而非 mock → **#141 站內 VFX 編輯器 Tier-1 MVP**（`fx-compose@1`、1–3 層 primitive、5 個核心旋鈕）—— **primitive 函式庫就是編輯器的調色盤，批次 3 讓它成為建置期真理來源之前沒有東西可以選** → editor-06 地圖編輯器 → **#102 後台整併**（比賽詳情 drill-in、一鍵套用 starter set，兩支 API 都是孤兒；順帶驗收 hitFeel 倍率能在後台即時調） | L |
| **7F · 平台功能殘留** | `apps/client/src/ui/platform/**` **（不含 `session.ts` —— 那是 7C 的）** · `apps/platform/internal/wallet/**` | `removeFriend()`（`api.ts:66` 端點與型別都在，0 個呼叫者；好友清單就是 #126 私密部署的門禁面）→ 沙發同樂債（`RoomListPanel.tsx:75-83` 的人數輸入被 `min=1 max=1` 永久鎖死，讀起來像 bug）→ **#118 只做 UI 複驗，不重建**（前一版把 #118 同時列在附錄「已完成」和這裡當待辦 —— `wallet/{wallet,meta,handlers}.go` + client `walletMeta.ts` / `ChampMetaControls.tsx` 都在磁碟上，這裡只欠一次眼睛） | M |

---

## 批次 8 · 上線收尾

> **為什麼在最後。** 這批不改遊戲，改的是「敢不敢把網址給別人」。全部排在功能凍結之後，因為它們一旦提前落地就會被新程式碼推翻。

| Lane | 獨佔路徑 | 內容 | 規模 |
|---|---|---|---|
| **8A · 三張活頁改成執行期計算** | `apps/client/src/ui/routes/**` · `tools/status/**` | 依專案慣例，`requirements-status.md` / 缺口稽核 / hit-feel 稽核**應該是站內即時計算的活頁，不是靜態文件**（現在 `gen_status.py` 的 TASKS 陣列停在 #127 只手加了 4 列，#129–#142 與 #144–#173 完全不在）。沿用批次 0 workflow B 的產生器樣板。順帶補寫七份從未撰寫的 todo 檔（champions / items / augments / map-editor / vfx-editor / model-inspector / ai-bots，`docs/todo/_index.md:77` 標 Planned） | M |
| **8B · 基礎建設 beacon** | `infra/**` · `docs/todo/security-infra.md` | sec-infra-01..04 的 `cover()` beacon（四項都已實作並手動驗證，卡在 beacon 需要 helm-render + 真 nginx 容器 harness —— 那個 harness 也是 7C 要的）→ `make up` 在 kind 叢集起完整堆疊 → `data/` 跨重啟持久化 → sec-154-20 弱密鑰拒絕 + 四支 CI 守門 | L |
| **8C · 版權與掛名** | `apps/client/**` · 部署設定 | **#127 殘留**：(a) client 在 public tier 隱藏單人入口 (b) 真正的公開部署**實體排除 129 個 imported GLB**（雲端 LB 之後 `$remote_addr` 是 LB 私網位址，IP 判斷不可靠）→ **#13** 致謝／出處頁（素材、TTS、字體、原地圖作者）→ **#19** i18n chrome | L |
| **8D · 上線閘門** | — | **#7 完整驗收掃描**（完整堆疊 + 真機 + 多人打完一場）→ 拿著批次 2 的可施放性矩陣與批次 1 的實機簽收表**逐項簽名**。這不是「再玩一次」，是拿著矩陣簽字。（**#48 已前移至 1E-0** —— 它是批次 1 簽收局的前置，不是收尾工作：在 fail-safe 環境下做的任何簽收都不算數） | M |

---

## 批次相依圖

> 只畫**真正的阻塞邊**。批次之間的實線 = 時間順序；虛線 = 前批的資料／能力被後批消費。

```mermaid
graph TD
  subgraph B0["批次 0 · 飛行中"]
    WA["A 載入最佳化"]
    WB["B README 產生器"]
    WC["C 平台首位管理員"]
    WD["D 場景資產稽核"]
  end

  subgraph B1["批次 1 · 讓畫面說實話"]
    REG["1A vfxKey 傳播進內嵌副本（#79 根因）"]
    WIRE["1B statusFx / 選取 / teamId / F-06"]
    GRD["1C 守護者上線 #89+#105"]
    DEAD["1D gore UI / undoDepth / #145 清理"]
    PRE["1E-0 #48 非 fail-safe 前置"]
    SIGN["1E 16 項實機簽收"]
    GRD -->|entity kind| WIRE
    PRE --> SIGN
  end

  subgraph B2["批次 2 · 數值鏈與道具語意"]
    IMP["2A #113→#56→#144→#78道具→#50抽參數→守門→#114+#125"]
    ITEM["2B useItem / recall / #128 道具半"]
    BAL["2C TTK 重測 → #149 → gacha → canCrit 政策"]
    MOB["2D #151 + #107"]
    BGM["2E 音訊硬序列（含 #75）"]
    IMP --> BAL
    ITEM --> BAL
  end

  subgraph B3["批次 3 · VFX 生成鏈"]
    GEN["3A #123 產生器＝content/abilities 唯一寫入者"]
    HF["3B hitFeel 補丁表"]
    ART["3C #50 artParams 補丁表"]
    HF -->|補丁表| GEN
    ART -->|補丁表| GEN
  end

  subgraph B4["批次 4 · 圖像管線"]
    PRV["4A #112 provider ⊕ F-08 SSRF"]
    ICON["4B icon 量產 + #146 頭像"]
    PRV --> ICON
  end

  B0 ==> B1 ==> B2 ==> B3 ==> B4
  B4 ==> B5["批次 5 · 選角/呈現/登入"] ==> B6["批次 6 · 模型工程 + #119（序列波）"]
  B6 ==> B6P["批次 6′ · 129 件替換素材"] ==> B7["批次 7 · 安全/E2E/編輯器"] ==> B8["批次 8 · 上線收尾"]

  REG -.內嵌副本可見.-> GEN
  REG -.重跑匯入器不得回退.-> IMP
  IMP -.JASS 重讀產出的參數表.-> ART
  BAL -.數值凍結.-> HF
  WA -.實測 payload.-> B6
  WD -.scene→asset 對照表.-> B6
  WC -.釋出 service.go.-> B7
  ICON -.商人頭像 PNG.-> B5
  SIGN -.簽收表.-> B8
  ITEM -.道具矩陣.-> B8
```

---

## 附錄 · 已驗證完成（不得重排）

以下每一項都以**程式碼證據**確認端到端出貨。帳本／狀態頁上任何相反的標記以本表為準。

| 帳本 | 結論 | 證據 |
|---|---|---|
| **#100** 回合結算後戰鬥要真的停 | **完成**（只欠實機看一眼） | `MatchController.ts:1199-1203` 在 `checkCombatEnd`(760-781) 回報全部配對結束的同一 tick 呼叫 `concludeCombat`(841-857)，設 `world.combatActive=false` 並 `freezeControls()`（清 nav order／moveTarget／attackTarget／override、in-flight cast 與 swing、歸零動量）；`:1112` 之後每一幀都 `freezeCombatIntent`，只留商店／準備／offer；`FireRingSystem.ts:28`、`matchStats.ts:282` 同旗標。**三張活頁仍把它列為 #85 的阻塞者 —— 那是錯的** |
| **#63** 場景範圍 SFX 預載 | **完成（SFX 半）** | `AudioSystem.ts:257-266` boot 不抓任何 SFX；`unlock()` 只暖 SFX_CORE + 當前場景(403-405)；`playBgm/setScene` 暖進入的場景(467-471)；`sfxManifest.ts` 持有 per-scene 表；`AudioDirector.tsx:109 → useAudio.ts:44 → setScene` 全線活的。**未做：LOOKAHEAD 預熱、前後對照報告 → 併入 6D** |
| **#107** 安全區契約 | **完成**（只欠截圖驗證） | `hudLayout.ts:565-620` 的 `HudPanelSpec` 詞彙（edge/size/covers/phases/z/providesExit/managed）疊在 #42 slot 登記表上；`useHudPanels.ts` 被 PerfOverlay／PauseMenu／SettingsCorner／CheatConsole／TeamLivesBar／ReviveBanner／EnemyTeamPanel／HudRoot 消費；`hudLayout.test.ts:430,499,518` 三條守門（含「沒有任何 HUD 檔案硬編角落位置」）。**回報症狀 FPS pill 蓋住商店已由 `useHudSlotHidden` 讓位** |
| **#110** 三選一抽牌卡 | **完成** | `AugmentDraftPanel.tsx` 三件齊備（`SfxButton kind='card'` cyber-glow + tier 染色 `--ggd-card-glow`／`GlyphTile` fallback 保證沒有空洞卡／`DRAFT_CONFIRM_SFX`），掛在 `HudRoot.tsx:169`；抽牌真的會發生（`arena-rules.json` r1-6 + overflow 的 #157 修正、`MatchController.ts:484-495` 建 offer） |
| **#121** 商店賣出復原 | **完成** | `shop.ts:121,140` push `ShopTxn`；`undoShopAction`(167-203) 還原道具/槽位並 `gold -= txn.goldDelta`（精確反向）、pop 掉避免二次復原；`commitShopSession`(211-213) 在 `MatchController.ts:618` 進戰鬥時清空堆疊（關掉跨回合套利）；`CommandSystem.ts:72`＋`validateInput.ts:134`；`snapshot.ts:98-100` 投影 `undoDepth`；`MerchantShop.tsx:103-117,398` 渲染「↩ 復原上一步」。**殘留：client 沒讀權威欄位 → 1D-2** |
| **#128** 可施放性掃描（技能半） | **完成** | `castabilitySweep.test.ts` 用真的 content tree（`FsContentSource + registerAll`）在真 `SimWorld` 逐槽施放；`docs/_castability-128.md` 記 288 格（48×6）、**281 PASS / 7 永久被動 / 0 FAIL**，觸發通道直方圖（damage 180、buff 70、projectile 14、heal 8、dash 5、shield 2、status 2）證明不是橡皮圖章。**`gen_status.py:128` 仍標 pending → 1E-2 修** |
| **#131** 右上角卡住的白色爆點 | **完成** | 根因寫在 `docs/todo/ability-vfx.md`（EX `layeredPop` 接受了 truthy 的 `{x:NaN}` caster 位置，而 `play()` 已經擋掉）；`VfxSystem.ts:218` 的 `isFinitePos` 現在守住每一條生成路徑（503,505,619,635-636,647,665,733,826），回歸測試 `topRightBurst.test.ts` |
| **#142** 113 句性別正確日文名言 VO | **完成** | `quotes.json` 113 筆，coverage {ids:113, real:82, original:31}，**真的分性別**：Otoya (Enhanced) 72 / Kyoko 41，對上 gender {male 72, female 28, neutral 13}，113 支 mp3 在旁；三個播放時機全接：選角確認第三段（`nameVoice.ts:386`、`ProfileBlock.tsx:203-227`）、結算本地勝利（`MatchEndPanel.tsx:384-387` via `settlementModel.ts:270`）、回合結束第一名（`RoundEndVoice.tsx` ← `HudRoot.tsx:133` via `settlementModel.ts:437`）。**舊 B3-19「男聲靜默退回 Kyoko」的擔憂與 manifest 不符** |
| **#145** 每回合隨機場地 | **完成** | `arenaSelect.ts:30-60` 固定順序輪替池；`MatchRoom.ts:183` 注入；`MatchController.ts:582-587` `selectRoundArena` 由 `enterCombat`(615) 呼叫，**在任何人被放置之前**用 matchSeed 決定性選場；`snapshot.ts:32` 廣播；client `GameApp.ts:733-734` → `applyArena`(684-719) 重建並去重。`arenaRotation.test.ts` 覆蓋不重複性質 |
| **#147** 戰鬥打擊感 VFX | **完成（五項全上）** | blob 影子 + 速度閘門走路揚塵：`VfxSystem.ts:223`、`ShadowLayer` 建於 384／同步於 917、`emitWalkDust` 932-956（步幅／間隔／傳送閘門）；施法地面印記 `GroundDecalPool` 369/385，每次 `abilityCast` 於 637 蓋章；命中火花 `HitSpark` 651-652；噴血 `BloodFx` 591。**殘留：沒有真 shadow-map pass → 3D** |
| **#148** 商人輪播提示 | **完成** | `merchantTips.ts` 13 則分類提示（rule／tip／weapon-rec，例：「兩場 3v3 同時開打」「買錯了？點『↩ 復原上一步』」）；`MerchantTipBox.tsx:38-48` 5000ms 輪替 + 不重複 `nextTipIndex`；掛在 `IntermissionStage.tsx:94` ← `HudRoot.tsx:162`（phase === 'intermission'） |
| **#146** 商店 3D 構圖 | **部分完成（版面已好）** | `render/intermission/{IntermissionScene,layout}.ts` 有實測過的商人／推車／攤位比例(37-46)，並明白實作了要求的取景（209-216 英雄四分之三背向、353-354 直接引用「旅行商人…3D model 在中央，玩家 model 在右方」），掛在 `IntermissionStage.tsx` ← `HudRoot.tsx:162`。**缺的只有頭像 PNG → 4B** |
| **#77 / #150** 每角色尺寸例外 | **完成** | `GameApp.ts:374-377,606-617` 的 `modelOverrideFor` 經 `contentDb` 讀 `content/models/_standin-overrides.json`，於 `EntityViewRegistry.ts:427` 消費。舊 B1-08 可關 |
| **#78** 「大絕造成 1 點傷害」stub | **技能半完成** | `grep -rl '"perRank": [1, 1, 1]' content/abilities` → 0；`grep -rl 0.003 content/abilities` → 0（由 `0c47fce` 修掉）。**道具 1:1 從未被 commit 提及 → 重新界定為 2A 的一部分** |
| **#89** sim 半 + 傷害減免 | **完成** | `combat/damage.ts:9` import `StructureComp`；`:442-466` `mitigateStructure()` 在 `StatsComp` 路徑之前分岔（armor／magicResist／maxHitPctMaxHp） |
| **#136** 投射物射程縮放 | **完成** | `effectRunner.ts:190` `remainingRange: resolveAbilityRange(world, def.maxRange)` |
| **#133** EX / counter-hit | **完成（機制半）** | `damage.ts:176-182` `originIsEX` 經 `AbilitiesComp.exSlot` + EX 後綴解析；`:200-204` `isCounterHit` 讀受害者 windup/cast；於 `:279,:355` 消費。**內容半 0 筆 → 3B** |
| 方向性運鏡 kick / EX punch-in | **完成** | `GameApp.ts:1181` `cameraRig.addShake(k.amp, k.durationMs, {dir, style, kick})`、`:1185` `exPunchIn(EX_PUNCH_DEPTH, EX_PUNCH_MS)` |
| `content:validate` 紅燈 | **已綠** | 實跑：`content OK: 1441 docs, contentVersion cv_31aca38e2fb6`。舊 B1-03 不要佔批次名額 |
| **#124** 下課鐘 BGM | **關帳** | 方向已被使用者否決並整軌改寫成 city-pop，無工作殘留 |
| **#137** Samantha James 變奏 | **完成（待上架複驗）** | `bgmVariants.ts` 存在且 menu 為 ROTATION_LOCKED；12 支 `<scene>.samantha.mp3` 需在 2F 順手確認在磁碟上並出現在 audition 頁（共 24） |
| **#118 / #162** | **完成** | `apps/platform/internal/wallet/{wallet,meta,handlers}.go` + client `walletMeta.ts` / `ChampMetaControls.tsx` |
| **#68** 動畫方向 | **⚠️ 降級為「單一軸向無缺陷」，不是全項完成** | mdl-68-01 掃描只證明一件事：43 個 imported 英雄全部在 **Z 軸側向分裂**。**它沒有涵蓋使用者點名的三個 per-clip 案例**（血輪眼左助飛行、皮卡丘 idle 翻轉、桔梗 walk），也沒有產出他要的「每角色 × 每片段 pass/fail」表 —— 那正是批次 6A 還排著 #68 的原因。前一版把它寫進「已驗證完成」與批次 6 同時列工，自相矛盾；**以此列為準：未完成** |
| **#83 / #108** | **#83 資料已修；#108 未逐項複驗** | #83：四個 modifier 重複的道具已在內容中去重，只欠一支回歸守門 → 2A ⑥。**#108（傳說池策展 + 說明↔modifier 不一致）沒有等價證據** —— 抽驗的 `godie-i02p`（網友手環）說明與 modifier 一致且 tier 1，但 22 份傳說候選沒有逐項比對過。帳本標 in_progress 是對的 → 逐項複驗排在 2A ⑥ |
| **#143** 回合勝利者 3D model + VO | **完成** | 已於 `2031f7a` 落地：選角器挑出真正的每回合 MVP 並以「仍存活」為條件。**前一版全檔 0 次提及 #143** —— 補進此表以免下一輪規劃把它當新工作重排 |
| **#172 / #173** | **完成** | #172 自助改密碼（platform endpoint + admin UI）；#173 bye-round 每回合 MVP 殘留（`TeamState.roundOutcome` + 三段式選角器）。**#173 的呈現面殘留（永遠不慶祝「輸掉對決但生命領先」的隊伍）需使用者實機拍板 → 5A** |
| **#144** 移動速度 | **完成** | `extract_unit_stats.py` 比例映射（WC3 300 == 5.8，clamp [4.0,11.0]），實際 18 級距 4.0 / 5.9 / 10.1。**`baseAttackTime` 仍未填 → 2A** |
| **#72** icon 現況 | **部分（活頁的「0 張」是過期的）** | `content/assets/icons`：champions 109、items 157、augments 3、abilities 13，共 282 檔 |
