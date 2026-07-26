# 假完成盤點（False Completions）· 稽核 #2 · 2026-07-24 晚間

> 這份文件只收「**帳本說完成／測試綠燈，但在真實對戰裡不會發生**」的條目，以及它的鏡像「**帳本說 pending、其實做完了**」。
> 所有判定一律以**執行期或產物證據**為準：檔案存在 ✚ 有人引用 ✚ 活的畫面真的讀它。任務描述與測試名稱**不算證據**。
>
> **這是一份活的工作文件，不是一次性報告。**
> 規則一：**已修的條目不刪除，改成「已關閉 + 憑什麼」**。一條悄悄消失的條目什麼都沒教會人，而且下次回歸沒人會發現。
> 規則二：**下一次稽核應該是 diff，不是重做**。所以第 4 節逐條裁決上一輪的每一個 entry，第 3 節的形狀表帶「本輪狀態」欄。
> 規則三：**判錯要說「我當時判錯了」**，不准安靜地改數字。第 7 節專門收這個。
>
> 基準：working tree `campaign/complete-tasks` @ `49dca64(-dirty)`，活體探針 client `[::1]:39527` / game-server `:2567` / platform `:8080` 全部在跑。
> live 策展白名單 `updatedAt 2026-07-24T11:14:58Z` → champions **48** / items **77** / abilities **240**。
> 本輪由五個車道（combat / audio / economy / ui / assets）各自獨立重測後合併去重。

---

## 1. 稽核趨勢（running count）

| 稽核 | 日期 | CONFIRMED-BROKEN | 其中**靜默** | 潛伏（今天無害） | 形狀總數 | 備註 |
|---|---|---|---|---|---|---|
| **#1** | 2026-07-24 上午 | **27** | 17 | — | S1–S11 | 首次盤點；`eventFanout` 白名單一條殺 8 個任務 |
| **#2** | 2026-07-24 晚間 | **20** | 15 | 4 | S1–S17（+6） | 上一輪 20 個 entry：**9 全修 · 5 半修 · 4 全破 · 2 未重測**；新增 10 條 |

**淨變化：−7 條 broken，+6 個形狀。** 形狀增加不是壞消息——上一輪修好的東西騰出視野，讓下面一層的失敗露出來；六個新形狀裡有四個（S12/S13/S16/S17）在稽核 #1 時被更上游的失敗遮住了。

**下一輪應該看什麼**：S12（發了沒人接）與 S16（點修沒稽核整張表）是本輪投報率最高的兩條偵測配方，兩條都能寫成 CI 而且都已經各命中一次。

---

## 2. 一句話結論

上一輪最貴的兩條——**`eventFanout` 硬白名單**與**過期的策展資料**——**都修好了，而且有機器證據**。
`FANNED_OUT_EVENT_TYPES` 現在是集合完備的（65 個 sim emit = 45 fanned + 20 server-only，**0 未分類 / 0 重複 / 0 列了卻沒人 emit**），策展白名單從 30 件道具長到 **77**，商店 30 件可買、寶玉有效池 7 件、20 層封頂用得完 7,500g、三選一 13/13 都在名單裡。**#70 / #82 / #104 / #110 四個任務同時復活。**

本輪最貴的一條換成了**沒有終端消費者**：
sim 發出 `statPathReset` / `statUpgradeBought` / `statCapstoneGranted`，`eventFanout` 也正確放行——**client 全 repo 零引用**。玩家在 19 層時買一件金幣道具會**無聲地丟掉 7,125 金的進度**，沒有 toast、沒有音效、沒有警告，而 `statPath.ts:205-210` 的註解正好承諾這不會發生。這是 **#121 修過的同一張 map**（`RoomStore.SHOP_EVENT_KIND`），修的時候只補了自己那兩列，**沒有回頭稽核整張表** ← 這就是新形狀 **S16**。

第二貴的是 **`hitFeel.flashColor` / `flashMs` 被解碼後丟掉**（N1，**✅ 已修 2026-07-24**）：schema 收、sim 複製、client 解到 struct、然後 `planImpactFeedback` 一行都沒讀。今天已經有 **30 份技能文件在填這兩個欄位**——這不是潛伏，是**活的死內容**。修它是兩行。

第三貴的不是壞掉而是**沒被證明過**：`data/accounts/` 11 個帳號**全部 `games=0`**，`data/history/` 目錄不存在，60 份錄影裡 **48 份是 `dev-*`、另外 12 份是具名測試 fixture，零份來自平台建房**。結算 → M幣 → 水晶 → 解鎖英雄整條養成迴圈的程式今天是對的，但**在這台機器上從來沒有跑過一次**。

---

## 3. 排序規則（可稽核，未變）

依序比較，前者勝出：

1. **家人在前 5 分鐘會不會撞到？**（登入 → 選角 → 第一回合 → 第一次中場）
2. **是不是靜默？**（沒有錯誤訊息、沒有崩潰，玩家與擁有者都不會知道功能不存在）→ 靜默**優先**，因為它不會自己被回報
3. **最後一哩多便宜？**（S = 一行／一筆資料，M = 一支檔案，L = 需要新內容或新子系統）
4. 同分時：**一次修好多個任務的優先**

> 白話：**又靜默、又早、又一行**的，永遠排在**又深、又罕見**的前面。
> 本輪唯一的刻意例外是 **P0-B 結算迴圈**：它不便宜也不在前 5 分鐘，但它是**唯一一條「程式全對、零執行證據」**的，而且它擋著三個任務的驗收。它需要的不是一次編輯，是**一場實驗**。

---

## 4. 依成因分類（GROUPING）—— 這一節才是這份文件真正的價值

分類依「失敗的**形狀**」，不是依功能領域。形狀能**預測下一個**；功能領域不能。
每個形狀附一條**偵測配方**：那條配方應該變成 CI 守衛或排工前的 30 秒探針。

**狀態欄**：🔴 本輪仍在命中 · 🟡 部分關閉 · 🟢 本輪已關閉（配方留著防回歸）· 🆕 本輪新增。

| # | 形狀 | 狀態 | 本輪命中 | **偵測配方（一行）** |
|---|---|---|---|---|
| **S1** | **產生了但沒接上**<br>資產／文件生出來了，但沒有任何欄位或引用指向它 | 🟡 | 404 份死 vfx doc（仍在）· 8 個死 SFX key（19→10，見 S1 註）· 228 份 `godie-*-p*` 只有 7 份可達 | `comm -13 <(引用集合 sort -u) <(磁碟集合 sort -u)`；**差集非零 = 待接線**。對 icon / model / vfx / sfx / voice 各建一條，進 CI |
| **S2** | **事件發了但沒進白名單**<br>sim 有 emit、client 有 handler，中間那層硬白名單擋掉 | 🟢 | **已關閉，且用構造封死**：65 emit = 45 fanned + 20 server-only，0 未分類、0 重複、0 幽靈列。4 個 server-only 是**寫明理由的決定**，不是缺口 | `diff <(grep -roh 'world\.emit("[A-Za-z]*"' packages/shared/src/sim \| sort -u) <(白名單 ∪ server-only)`；**三個集合運算都必須回空** |
| **S3** | **別的任務改了設定，讓常數變成不可達**<br>沒有東西壞掉，功能只是靜靜停止存在 | 🟢 **首例已按規範關閉** | `FIRE_RING_SEC = 30` vs 實際剩 **60** 秒 → 2026-07-24 改為由 `combatMaxSec − fireRing.startSec` **推導**（`audio/fireRingWindow.ts`），並補上規範要求的**執行期斷言**：sim 的 `fireRingStart` 一到就跟推導值對帳，不合就 `console.error` 印兩個數字。`Minimap.tsx:129` 靠 **ESM live binding** 免修跟上 | 任何**跨檔常數關係**都要寫成執行期斷言，不准只寫註解。探針：`grep -rn "_SEC = [0-9]" apps/client/src` 逐條問「它跟哪個 config 欄位有隱含關係？」——`fireRingWindow.ts` 是這條規範的參考實作 |
| **S4** | **schema 悄悄拒收**<br>寫入工具「正確地」拒絕，回傳 False，沒人看 | 🟢 | 上一輪的 #110（`augment@1` 是 zod `.strict()`）已關閉；本輪未再命中 | 寫入工具**宣稱寫了 N 筆 vs 文件實際帶欄位 M 筆**必須對帳並印出；`return False` 一律 log 到 stderr |
| **S5** | **修好了，但只在這個環境**<br>本機對、容器/雲端錯 | 🟡 | #48 已關閉；**#66 build stamp 的容器半本輪未重測**（見第 6 節「未重測」） | 每個 env var / build arg 必須在 **(本機, docker/compose, helm, family tier)** 四張表都出現：`grep -L VAR docker/*.yaml deploy/helm/**/*.yaml`；且 `/healthz` 要回報 `source` + `reason` |
| **S6** | **後端做完、前端沒有入口**<br>handler 完整、測試齊全、沒有任何呼叫端 | 🟡 | `crystals/earn` **路由已整條刪除**（不是接上，是換設計，見 P0-A）· #126 審核 console（他車道）· `#39 statusFx` 仍是本形狀最純的一例 | **孤兒路由 = 路由字串集合 − client/admin 原始碼 grep 到的集合**：`for r in $(路由); do grep -rq "$r" apps/client/src apps/admin/src \|\| echo "ORPHAN $r"; done` |
| **S7** | **部署中的策展／營運資料落後於程式模型**<br>程式對，**資料錯**，而且資料不在 git 裡 | 🟢 | **已關閉**：items 30 → **77**（28 final / 23 component / 13 quest / 11 none / 2 service），`legendary-orb` 與 `stat-attunement` 都在，quest 池 13/13、傳說池 14/14。live API 與 `data/curation/whitelist.json` 逐位元組相同 | 從 **live API** 拉策展資料，與 `content/` 當前模型對帳：`craftRole=final` 比例、服務型偽道具是否在內、**任何 loot 池 ∩ whitelist = ∅ 即紅燈** |
| **S8** | **機制上線、內容 0 筆**<br>schema、sim、UI 全部就緒，沒有一份文件填它 | 🟡 | `hitFeel` 0 → **142**（🟢）· `evasion` 0 → **7**（🟢，但歸因錯，見 P1-D）· 武器 tag 0 → **33/113**（🟡）· 語音包 `MANIFEST.json` **0 個角色**（🔴，但已誠實揭露）· 48 份 `innateKind:"passive"` 仍 `effects: []`（🔴） | 每個新欄位／新 Stat 落地時登記一條指標「引用此欄位的文件數」，**長期為 0 = 假完成**：`grep -rl '"hitFeel"' content/ \| wc -l` |
| **S9** | **第二棵渲染樹／第二條入口路徑沒被覆蓋**<br>全域元件掛在一個 root 上，但有第二個 root | 🟡 | 回放頁 chrome **已關閉**（`GlobalChrome.tsx` 兩棵樹共用，DOM 實測）· `CastNoticeLine` 在 `TouchControls` / `CouchHudGrid` **仍缺**（🔴，但已被 `surfaceParity.test.ts` **機器棘輪化**）· `MatchLoadingOverlay` 3 條入場路徑仍只覆蓋 1 條 | 列出所有 `root.render(` 與所有分支渲染樹；**宣稱「全域」的元件必須在每一棵樹裡都 grep 得到**。**升級版**：`surfaceParity.test.ts` 從原始碼推導 surface，`KNOWN_GAPS` **雙向斷言**——沒列的違規紅，列了卻已修好也紅（「你修好了，請刪掉這一列」） |
| **S10** | **量測的分母剛好避開壞掉的地方**<br>綠燈報表覆蓋的正好是能動的那幾格 | 🟡 | #128 第 6 欄是普攻（仍未重量）· `sfxLabCredits.boundKeys` **已改成推導**（🟢，43 現在是真的）· **新**：112 份 champion `hitFeel` 只有 **7 種相異 tuple**，不是 112 種 | 檢查每張驗收表的**分母定義**；**分母若由被測系統自己產生就不算證據**。**新增子規則**：「N 份文件帶了欄位」要同時報「其中有幾個相異值」 |
| **S11** | **假 pending：其實做完了**<br>重排它是這裡第二貴的錯誤 | 🟡 | 見第 8 節；本輪未推翻任何一條，且新增 #156 / #24（半）/ #107 / #14 / #27 進入已完成 | 排工前跑 30 秒探針：**檔案存在？有 `new X(` / `<X ` 的生產呼叫端？** |
| **S12** 🆕 | **發了、放行了、沒有人接**<br>S2 的鏡像：白名單這次是對的，**client 端根本沒寫 handler**。fan-out 成本照付，玩家什麼都沒得到 | 🔴 | `statPathReset` · `statUpgradeBought` · `statCapstoneGranted`——三個都在 `eventFanout.ts:206-208`，client 全 repo **零 hit**（見 P0-C） | `comm -13 <(白名單事件名 sort -u) <(grep -rhoE '"[a-zA-Z]+"' apps/client/src --include=*.ts --include=*.tsx \| tr -d '"' \| sort -u)`<br>**任何放行卻在 client 找不到的事件名，不是死的 fan-out 成本、就是缺了一個玩家提示。進 CI。** |
| **S13** 🆕 | **欄位被解碼之後丟掉**<br>schema 收 → sim 複製 → client 解進 struct → **最後一個 statement 沒讀它**。比 S8 更難抓：內容有、鏈路有、只差最後一次取值 | 🔴 | `hitFeel.flashColor` / `hitFeel.flashMs`（`combatFeedback.ts:171-172` 解出來，`:323` 用 `flashColorFor(dmgType)` 與 `TIER_FX[tier].flashMs` 蓋掉）——**30 份技能文件正在填它們**（見 P0-D） | 對每個 client 端的 `Profile` / `Options` / `Config` interface：**逐欄位 grep 它在賦值處以外的讀取點**。<br>`for f in $(欄位名); do grep -c "profile\.$f\|opts\.$f" src \| grep -q '^0$' && echo "DECODED-BUT-UNUSED $f"; done` |
| **S14** 🆕 | **可達性證明的是程式，不是出貨名單**<br>「這個 key 可達」對**程式碼**成立、對**策展後的 48 人名單**不成立。S10 的上一層：分母是程式，不是玩家真的碰得到的東西 | 🔴 | `gunshot`：唯一帶 `gun` tag 的是 `godie-hlgr` 鋼彈-煌，**不在白名單**。`sfxReachability.ts:124` 宣告它可達（程式上為真），而**對外 credits 頁靠這份帳本背書** | 任何「可達性／覆蓋率」帳本都必須**再與 live 策展白名單求交集**，並分兩欄報：`code-reachable` vs `roster-reachable`。**兩者不同時，公開頁只能引用後者。** |
| **S15** 🆕 | **同一份來源、兩種讀法，出貨的是舊的那個**<br>兩條管線各自解同一個原始欄位，差一個常數因子；新的那條寫了理由，舊的那條先把資料烘出來了 | 🔴 | `extract_particles.py:216` `radius = width * scale` vs `w3xEmitter.ts:425` `halfExtent = max(width,length)/2 * scale`（**差 2×，且新的那條寫明「矩形發射面 → 外接圓」的理由**）→ 228 份 `godie-*-p*.json` 全數偏大，其中 **2 份今天真的在畫面上**（見 P1-E） | 同一個原始欄位若在 >1 處被轉換，**必須共用一支函式，或有一條交叉測試斷言兩者相等**。探針：對每個匯入欄位 `grep -rn "em\.<field>" tools/ apps/` — 出現在兩個 repo 區域就是紅旗 |
| **S15b** 🆕 | **把調校／效能參數烘進「事實」資料**<br>抽取階段就把預算乘進去，之後沒有人能把它調回來，而且看起來像是原始資料 | 🔴 | `extract_particles.py:231` `burstCount = round(max(rate,1.0) * 0.3)`——0.3 是效能預算不是保真度。新管線做對了：`w3xEmitter.ts:509` 吃 caller 給的 `density`，畫質縮減是 `:600` 的**獨立 pass** | 抽取器裡任何**無名浮點常數**都要問：「這是來源的事實，還是我們的偏好？」偏好一律上移成參數 |
| **S16** 🆕 | **點修，沒有稽核整張表**<br>修好一列並寫了很好的註解，**沒有回頭把同一張 map / enum / registry 對著它的生產者重新對帳**。下一個實例就長在那條註解的正下方 | 🔴 | `RoomStore.SHOP_EVENT_KIND`：#121 為 `shopUndone`/`undoRejected` 補了兩列並在 `:470-478` 寫下漂亮的事後檢討，**八行之後就是 statPath 三個事件的缺口**（S12）· 同一形狀：`weaponClassOf` 補了 5 個 tag，**沒問「有沒有第六個武器類別」**（S8 → N2） | 修任何 registry 的一列時，**用生產者集合重算整張表**，並把那次重算變成測試。<br>`comm -13 <(生產者集合) <(registry keys)` — 修完必須回空，不只是你剛加的那兩列 |
| **S17** 🆕 | **降級路徑把缺件變成看不見的成本**<br>fallback 正確地運作，所以沒有錯誤、沒有紅燈——**只有慢**。這是「靜默」的一個更難的變體：連功能都沒少 | 🔴 | `content/bundle.json` 從工作樹**被刪除**（git ` D`），live 探針 `GET /content/bundle.json` → **HTTP 200 `text/html`**（vite SPA fallback）→ `FallbackContentSource` 形狀檢查丟掉它 → 靜靜降到 `HttpContentSource`：**每次開機 1 manifest + 12 index + 1,441 份逐 doc GET**（見 P2-C） | 每一條 fallback 都必須**在降級時大聲說話**（一行 `console.warn` + 一個 `/healthz` 欄位）。探針：把主路徑刻意弄壞，**看得到抱怨才算通過** |

| **S18** 🆕 | **驗收斷言的方向與缺陷的方向相反**<br>缺陷是「A 不見了」，測試斷言的是「B 不該在」。無論 A 在不在，測試永遠綠。任務標題往往自己就寫著正確答案，執行時被讀成了反面 | 🔴 | **#73**「sweep un-merged **sphere**/orb attachment geometry」→ 執行時把 sphere 讀成「圓形的雜物」,交付 `strip_teamglow.py`(**刪掉** 36 塊隊色光暈)。三條驗收 `expect(offenders).toEqual([])` 全是缺席斷言;孫悟空的頭住在**另一個檔案** `Gokuhead.mdx`,由 w3a 的 `Asph`+`atat` 掛上,兩份資料源(只掃 JASS 的 `DUMMY_ORB_MAP.json`、只量單一 glb 的 `geoset_alpha_report.py`)結構上都看不到它。帳本標 completed,**同一個 repo 裡的 `_suspicious-verification-list.md` 第一級與 `_requirements-audit-gaps.md` 都還寫著沒做完** —— 三份文件兩份說沒完成,沒人去對。修於 #267（2026-07-26） | 任何「掃描/普查/補齊」型任務，驗收裡**至少要有一條 PRESENCE 斷言**：不是「X 不該在」，而是「每個 N 都必須有 Y，且 Y 的量測值 ≥ 門檻」。門檻用**全 roster 實測分布**校準並把數字寫進註解（#267：頭骨頂點佔比全 roster 最低 10.3% → 門檻 6%；缺陷值 2.3%）。<br>**外加一條帳本對帳**：`_task-ledger.json` 標 completed 的任務，若仍出現在 `_suspicious-verification-list.md` 或 `_requirements-audit-gaps.md` 的未完成列，就是紅燈 —— 這條矛盾當時已經存在三個月 |

> **S1 註（帳本修正）**：上一輪寫「21 個未接線 SFX key」，本輪獨立重數是 **89 個 key 裡 10 個不可達**（8 個真孤兒 + 2 個刻意遮蔽且已宣告）。19 → 10 的差額全部來自今天修好的 6 個 fan-out + 3 個補上觸發點的 効果音ラボ clip。

---

## 5. 上一輪 20 個 entry 的逐條裁決（**這就是 diff**）

> 已修的**留在表上**。刪掉它等於把回歸偵測一起刪掉。

| 上一輪 entry | 裁決 | **憑什麼**（可重跑的證據） |
|---|---|---|
| **P0-1** `eventFanout` 擋 9 種事件 | 🟢 **已關閉**（一次關 8 個任務） | 自行 scrape：65 sim emit = 45 fanned + 20 server-only；三個集合運算（未分類／重複／幽靈）**全部回空**。`evade` `explosion` `buffApply` `reviveChannel` `fireRingStart` `rankUp` 都在名單裡；`auraApply/End` `recoveryBegin/End` 移到 `SERVER_ONLY_EVENT_TYPES` **並寫明理由**（無消費者、無 HUD）。閘門在 `MatchRoom.ts:492` + `ReplayRoom.ts:217`，檔案本身現在有兩檔契約說明 |
| **P0-2** live 策展白名單過期 | 🟢 **已關閉**（一次關 4 個任務） | `data/curation/whitelist.json` = live `GET /api/v1/curation/whitelist`，`updatedAt 2026-07-24T11:14:58Z`，48/**77**/240。`craftRole` 分布 28 final / 23 component / 13 quest / 11 none / 2 service；**零個白名單 id 找不到內容文件**。商店 `shopCatalogue()` 重算 = **28 finals（28 個都有 modifiers 或 passive）+ 2 services = 30 件可買**，正是 #70 對齊的數字 |
| **P0-3** 天生技第 6 槽 | 🟡 **程式已關閉，內容仍缺 48 份** | `castAnnounce.ts:82` 現在是 `export const INNATE_ACTIVE_CASTABLE = true;`（實測）· `InputCapture.ts` 綁 **D** 到 PASSIVE 槽並附三條理由（WC3 command-card D 槽）· `GameApp.abilityForSeat` 有 PASSIVE 分支（`:1289+`）· **兩棵 HUD 樹都消費了旗標**（`AbilityBar.tsx:458` **與** `TouchControls.tsx:429`）——這次沒有重犯 S9。**殘餘**：108 份 innate doc 裡 48 份 `innateKind:"passive"` 仍 `effects: []`，按鈕在、按下去沒事 |
| **P0-4** #118 水晶沒有呼叫端 | 🔴 **設計已換，水龍頭從未打開** | 上一輪說「`crystals/earn` 唯一 hit 是路由註冊本身」——**現在那條路由整條不存在了**，`wallet/meta.go:22` 寫明「NO client-callable earn route」是刻意的。發放改掛結算路徑（`gamelink/callback.go buildSettlement` → `settle.go:167-170`，帶 `> 0` 重播守衛）。**但**：11 個帳號 `games=0 mcoin=0`、`crystal` 欄位根本不存在，`data/history/` 目錄不存在 → **一次都沒發過** |
| **P0-5** #6/#25 從未結算到平台 | 🔴 **程式已修好，仍零執行證據** | `MatchRoom.settleToPlatform()`（`:681-745`）現在是對的：欄位對映、雙目標、HMAC、非 2xx 記 body、記平台自己回的 `ack.settled`。兩個歷史 bug 在 `:662-670` 具名。**但** `data/replays/` 60 份裡 **48 份 `dev-*`、12 份是具名測試 fixture（`m-bare` `verify-555000999` …），零份來自平台建房** → `:695-703` 正確地 bail，資料自然是空的 |
| **P0-6(a)** build stamp 在容器裡蓋成 `dev` | ⚪ **本輪未重測** | 五個車道都沒碰 `docker/**`（P0 車道持有）。**下一輪必查**，配方見 S5 |
| **P0-6(b)/P1-8** 回放樹沒有徽章／音訊開關 | 🟢 **已關閉，DOM 實證** | 新檔 `apps/client/src/ui/GlobalChrome.tsx` 一次宣告全域集合；`AppRoot.tsx:125` 與 `ReplayApp.tsx:92` 都 render 它，而那是**僅有的兩個 `root.render(`**（`main.tsx:127,170`）。同分頁配對量測：`/` → 徽章 `49dca64-dirty 2026-07-24`、`[data-bus]`×2、`[data-ggd-audio-expand]`×1；`/#replay=…` 硬重載 → **同樣三項全在** |
| **P1-1** #27 點自己角色 97/113 靜默 | 🟢 **已關閉，0/113 靜默** | 五階梯 `selectVoiceLadder.ts`，在真實資料上用 Python 重跑一次而不是信它：全 113 → authored 16 / name 95 / quote 2 / **SILENT 0**；開放 48 → 8 / 40 / 0 / **SILENT 0**。**每一個解出的 clip 都在磁碟上（0 缺檔）**。點擊路徑 `InputCapture.ts:173-177` → `GameApp.ts:485`，且限自己英雄 |
| **P1-2** 手機上技能被拒不說原因 | 🔴 **仍破，但已機器棘輪化** | 唯一生產呼叫點仍是 `AbilityBar.tsx:200`；`HudRoot.tsx:144` `{!touchControls && <AbilityBar/>}` vs `:157` `{touchControls && <TouchControls/>}`、`:158` `CouchHudGrid`。`surfaceParity.test.ts` 從原始碼推導 surface 並**雙向斷言** `KNOWN_GAPS`（`:460` 未列違規紅、`:470` 已修好還列著也紅），`hud-input-variant/TouchControls` 與 `/CouchHudGrid` **兩列都還在** → **測試綠燈本身就證明缺口還活著**。`components/CastNotice.tsx:31` 早就定義了 `TOUCH_BOTTOM = 190`——元件本來就是為這個介面寫的 |
| **P1-3** #132 火圈 | 🟡 **4 個子失敗修好 2 個** | (a) **仍破**：`grep -rni "fire.?ring\|closingRing" apps/client/src/render apps/client/src/vfx` → **0 hit**，全 repo 沒有環狀 mesh。(b) **仍破**：`FireRingSystem.ts:52` 直接 `hp.hp -= dmg`，`fireRingDamage` **正確地**是 server-only（360 msg/s），所以沒有浮動數字。**(c) 已修（2026-07-24）**：`FIRE_RING_SEC` 移入新的 `audio/fireRingWindow.ts`，由 `combatMaxSec − fireRing.startSec` 推導（live = **60**），且是 **ESM live binding** → `Minimap.tsx:41` 不用改就跟著校正；`fireRingStart` 抵達時 `noteFireRingIgnition()` 比對推導值，差 >1.5 s 就 `console.error` 印出兩個數字。瀏覽器實測 :39527：`derivedWindowSec 60` / `bed_at_61s_left "combat"` / `bed_at_60s_left "fireRing"`。(d) **仍破**：`Minimap.tsx:112-116` 註解說「sim 沒有縮圈實體」——**假的**，`world.fireRingRules` 在燒血（UI 車道的檔案，只報告）。**音訊半早已修**：`fireRingStart` 過線並對到 `fireRingLoop`（`combatSfx.ts:345`），`sfxReachability.ts:183` 機器證明綁定 |
| **P1-4** #39 狀態視覺沒人驅動 | 🔴 **仍破，逐字不變** | `StatusAuraFx.set()`（`StatusAuraFx.ts:72`）是**唯一**能生 aura 的方法，**零生產呼叫點**。`VfxSystem.ts` 對 `this.status` 只有 `:411` 建構 / `:1016` forget / `:1209` update / `:1222` dispose——**每一幀都在抽空池**。server 有資料：`net/snapshot.ts:258-260` 寫 `ROOTED/STUNNED/SLOWED`、`:250` 寫 `DASHING`；`GameApp.ts:1082,1714` 只讀 `CHANNELLING/CONTESTED` |
| **P1-5** 3 個 clip 沒觸發點 + credits 謊報 | 🟢 **已關閉，兩件都是** | 三個 clip 各追到 sim emit 的一個 payload 欄位：`castCircle` ← `castBegin.castTimeSec`（`abilitySystem.ts:243-249`，**240 個白名單技能裡 76 個 `castTimeSec >= 0.5`**，門檻不是空集合上的門檻）· `arrowRelease` ← `basicAttack.weaponClass` ⨝ `projectileSpawn.projectileId === "basic-attack"` · `arrowPierce` ← `basicAttackHit` 帶 `projectileId`。credits `boundKeys` 現在是**推導**的（`sfxLabCredits.ts:191` = `mapKeys ∩ PLAYABLE_SFX_KEYS`），獨立重數 **54 個 lab clip → 43 個至少一個可達 key、0 個 mapped-but-silent** → **上一輪說的「帳本報 43 實際 40」當時對，現在 43 是真的** |
| **P1-6** 0/113 角色帶武器 tag | 🟡 **數字修好了，結構缺口沒修** | 實測 **33/113** 帶 tag（katana 20 / sword 8 / greatsword 3 / gun 1 / bow 1），`attackKatana` 與 `attackGreatsword` **第一次真正可達**。**但**：48 個白名單角色裡 **31 個仍未 tag**（13 遠程 → `bowDraw`、18 近戰 → `attackSword1/2`），而且 `gunshot` 唯一擁有者不在白名單（S14）。**更關鍵**：`WEAPON_TAGS` 沒有第六類，法師無 tag 可加（見 P0-E） |
| **P1-7** #126 審核 console | ⚪ **本輪未重測**（`apps/admin/**` 屬 platform 車道） | — |
| **P2-1** w3x 美術 100% 不可達 | 🟡 **引擎已上線，內容綁定仍缺** | **上一輪「`W3xEmitterRig` 只跑在 dev audition 頁」現在是假的**：`VfxSystem.ts:419` 建 `W3xCastFx`、`:618` 在**活的施法路徑**呼叫 `play()`、`:1201` tick、`:1229` dispose。30 個技能經 `w3xAbilityArt` 晉升（13 個在名單上）。**仍缺**：662 份技能文件的 `vfxKey` 絕大多數還是 `fx.prim.*` |
| **P2-2** `hitFeel` 0 份內容 | 🟢 **機制已關閉**（換成 S13，見 P0-D） | **142 份**（112 champion + 30 ability）。**48 個白名單角色全部有**；30 份 hitFeel 技能裡 13 個在名單上。10 個 schema 欄位裡 **8 個真的到畫面**：`hitstopTicks`/`hitstunTicks`/`knockbackMag`（sim）、`shakeMag`+`shakeStyle`+`camKick`（`combatFeedback.ts:325,329,330`）、`sparkKind`（`VfxSystem.ts:939`，每 kind 不同色）、`exFreeze`（有解碼，0 份文件填）。**誠實縮編見第 7 節** |
| **P2-3** 迴避內容 0 筆 | 🟡 **stat 已關閉，歸因仍缺** | **7 份 champion doc** 帶 `baseStats.evasion` 0.18–0.25，**其中 4 個在白名單**（`godie-e007` `godie-h02u` `godie-u00j` `godie-edem`）。live 探針 `GET /content/champions/godie-e007.json` → `baseStats.evasion: 0.2`。全鏈通：`evade` 過線 → `RoomConnection.ts:295` → `recordEvade` → `frameBus.ts:446` → `combatText.ts:236` 畫 MISS。**潛伏地雷已拆**：`shopGrouping.ts:119` 現在有 `evasion: "defense"`。**仍缺**見 P1-D |
| **P2-4** #156 顯示名稱沒送出 | 🟢 **已關閉** | `ui/platform/store.ts:282` `setLocalDisplayName(account.username)`（`:460` 登出清空）→ `RoomConnection.ts:217 displayName()` → `:227 joinOptions()` → `:243 connectDev` / `:252 connectDevJoin` → `MatchRoom.ts:559-561`（只在讀到 `""` 或 `/^(Bot \|Player )/` 時覆寫）→ `Scoreboard.tsx:73` 等四處。**誠實註記**：未登入的「離線打電腦」路徑 `localDisplayName === ""`，席位仍寫 `Player 0`——但**回報的症狀（自己席位寫 Bot）在每一條路徑上都消失了** |
| **P2-5** #24「所有按鈕」不是所有按鈕 | 🟡 **玩家面前兩個已修，總數 23 → 18** | `MerchantShop.tsx` 賣裝備磚已是 `<SfxButton kind="subdued">`（~`:854`，附 `#24` 註解）· `ChampSelectPanel.tsx:347` ✕ 已是 `<SfxButton>`。**但本輪新增兩條**（P2-D、P2-E） |
| **P2-6** 宣告的 z-index 是虛構的 | 🟢 **已關閉，且上一輪的數字是錯的** | 上一輪說 `grep -n "zIndex" MerchantShop.tsx` → 0 hit。**現在是 3 hit**：`:294`（收合軌）與 `:365`（卡片根）都是 `zIndex: INTERMISSION_Z.panel`，`intermissionLayout.ts:118` 定義它 = `HUD_Z.screen` = 40，在 `slot` 25 / `expanded` 30 之上。`:355-364` 的註解具名引用 #107/#106 |

**小計：9 全修 · 5 半修 · 4 全破 · 2 未重測。**

---

## 6. P0 · 立刻做（靜默 ✚ 前 5 分鐘 ✚ 便宜）

### P0-C · 三個 statPath 事件放行了卻沒有人接 → 19 層無聲蒸發 7,125 金
- **形狀**：**S12**（🆕）**+ S16**
- **任務**：#82 / #104（皆 completed）
- **現況**：`statPathReset` · `statUpgradeBought` · `statCapstoneGranted` 全部在 `eventFanout.ts:206-208`、全部由 `packages/shared/src/sim/economy/statPath.ts` emit。**全 client grep 這三個字串 → 0 hit。** `RoomStore.SHOP_EVENT_KIND`（`apps/client/src/net/RoomStore.ts:479-486`）只有 `itemBought/itemSold/buyRejected/sellRejected/shopUndone/undoRejected` 六列（已實測確認）。
- **為什麼特別惡劣**：`statPath.ts:205-210` 的註解白紙黑字承諾「玩家不可能在不知情下摧毀 19 層」。今天在 19 層買任何金幣道具就會 `resetStatPath`，**沒有 toast、沒有音效、沒有警告**——`N / 20` 計數器只是安靜地歸零。封頂達成時也一樣，只有 `statCapstonePct` 悄悄改變數值面板。
- **這是 S16 的教科書案例**：`RoomStore.ts:470-478` 那段為 #121 寫的事後檢討（「sim 從 undo 落地那天起就在發 `shopUndone`/`undoRejected`，但兩者都不在這張 map 裡，於是 `isShopEvent` 把它們丟在地上」）**就在缺口上方八行**。那次補了自己那兩列，**沒有拿生產者集合重算整張表**。
- **缺的最後一哩**：`SHOP_EVENT_KIND` 加 `statPathReset`（與 `statCapstoneGranted`）＋ `ShopEventView["kind"]` 新成員；`shopFeedback.ts` 用 `ev.data.lost`（層數）與 `ev.data.cause` 大聲說出來。
- **成本**：**S**
- **⚠️ 擁有權**：`apps/client/src/net/RoomStore.ts` 與 `ui/panels/**` 屬 **UI 車道**。本輪**只報告，未修改**。

### P0-D · `hitFeel.flashColor` / `flashMs` 被解碼後丟在地上 —— 30 份文件正在填活的死內容
- **形狀**：**S13**（🆕）
- **任務**：#133（completed）
- **現況**：`combatFeedback.ts:171-172` 正確地把兩個欄位從線上解進 client 的 `ImpactProfile`。然後 `planImpactFeedback`（`:323`）建的是：
  ```ts
  victimFlash: { rgb: flashColorFor(ctx.dmgType), alpha: fx.flashAlpha, ms: fx.flashMs },
  ```
  `profile.flashColor` 與 `profile.flashMs` **一次都沒被讀**；`fx` 是 `TIER_FX[tier]`。`EntityViewRegistry.ts:319` 是唯一消費者且原封照抄 `plan.victimFlash`，**沒有第二條路**。
- **這不是潛伏**：30 份技能文件已經在填這兩個欄位。live 探針 `GET /content/abilities/godie-e007.r.json` → `{"flashColor":[1.0,0.92,0.6],"flashMs":178,"sparkKind":"magic",…}`，而 `godie-e007` 與 `godie-e007.r` **兩者都在 live 白名單裡**。
- **玩家會看到**：放那個 R，看到的是通用的魔法紫 `[0.7,0.4,1.0]` 閃光、tier 預設毫秒數，**永遠不是作者寫的金白色 178ms**。
- **缺的最後一哩**：兩行 —— `profile.flashColor ?? flashColorFor(ctx.dmgType)` 與 `profile.flashMs ?? fx.flashMs`。
- **成本**：**S** · **擁有權：本車道**（`apps/client/src/render/combatFeedback.ts`）。

#### ✅ 已修（2026-07-24，本車道）—— 但**不是**原本寫的那兩行

原本的「兩行修法」`profile.flashColor ?? flashColorFor(ctx.dmgType)` **會製造一個更難發現的迴歸**：
sim 端的 `deriveCosmetics` 對**每一次命中**都填了 `flashColor`（`FLASH_PHYSICAL/MAGIC/TRUE/BLOCK`），
所以 `??` 的右手邊**永遠不會執行**——等於用 sim 那份**從未量測過**的調色盤，
把 client 那份**對真實 model tint 量測過**的調色盤全域換掉。
其中 `FLASH_TRUE = [1,1,1]`，正是 `flashColorFor` 的註解已經證明「在淺色模型上是 no-op」的那個顏色。

實際採用的分層：

1. **傷害類型仍是 default，而且是絕大多數**：112 份有 `hitFeel` 的英雄文件**沒有任何一份**寫 flash
   （只寫 hitstop/shake/knockback），所以**每一次普攻**都走量測過的紅／洋紅。粗讀完整保留。
2. **有作者指定的技能改讀「元素」**：金／冰藍／火橙／虛紫。這是**細化**不是抹除——玩家剛看完那個大招的施法。
3. **alpha 永不可被 content 指定**：它是 tier 的 hit-weight，且 `ui/combatText.ts` 的黑框對比分析依賴它。
4. **可讀性守門 `legibleFlashColor`**：30 份裡有 8 份的色度太低（最糟 `[0.85,0.92,1.0]`，
   對淺色模型最大 Δ 僅 0.06 vs 紅色的 0.45），會**根本看不見**。守門把色度拉到 0.65
   （＝洋紅 default 自己的色度，「作者色不得比量測通過的最淡顏色更淡」），
   作法是繞最大通道加飽和，**完全保留色相家族**。灰階輸入無色相可救 → 退回紅色。

**同時刪掉（不是接線）**：sim 的 `FLASH_PHYSICAL/MAGIC/TRUE/BLOCK` + `FLASH_MS_BY_TIER`
——第二套 flash 調色盤，隨每個 `hitImpact` 上線、**一個像素都沒到過**。
flash 兩欄現在在線上是**有作者才存在**，這個「在／不在」本身就是 client 需要的訊號。

**觀測結果**（真實 content，非 fixture）：30 份文件全部生效，13 份在 live 白名單上。
例：`godie-e007.r`（12-04 龍氣爆發，live）**之前** `[1.00,0.35,0.90]/160ms`
→ **現在** `[1.00,0.87,0.35]/178ms`。`godie-hart.r`（live）之前同樣的洋紅
→ 現在 `[0.35,0.65,1.00]/211ms`。

### P0-E · `weaponClassOf` 沒有第六個武器類別 → 13 個白名單法師的普攻是**拉弓＋放箭＋箭矢命中**
- **🟢 已修（2026-07-24，戰鬥車道）**。加了**兩**類：`magic`（新 clip `magicBolt` ←
  効果音ラボ「気弾1」，走 ACQUIRE.py 同一條管線落地，已列入版權頁）與 `thrown`
  （**明寫**成通用揮擊聲，不是預設落下去的）。**33 個遠程角色全部逐一 tag**，依據是
  暴雪 `Units/*UnitFunc.txt` 的 `Missileart=`（Arrow/MoonPriestess→bow、
  Warden/Brewmaster→thrown、其餘→magic），**不是角色名字、也不是 `role`**
  （importer 把 33 個遠程全填成 marksman，這欄說不出任何事）。
  預設也從 `bow` 改成 `magic`（普查 22/5/5/1），但**沒有任何出貨角色再依賴預設**——
  `sim/weaponClassCoverage.test.ts` 擋住。`arrowRelease`/`arrowPierce` 的擁有者從
  「14 個假的」變成 **5 個真的弓手**（3 個在白名單），不再是電鼠在放箭。
  觀測：真 SimWorld 讓皮卡丘揮一拳 → 事件 `weaponClass=magic` → `combatSfxKey`
  → `magicBolt` → live server `/content/assets/audio/sfx/lab/magic-bolt.mp3`
  HTTP 200 / 22613 B。
- **形狀**：**S8 + S16**
- **任務**：#51（completed）
- **現況**：`weaponClassOf()`（`BasicAttackSystem.ts:67-77`，已實測）的 `WEAPON_TAGS` 只有 `greatsword|katana|gun|bow|sword`，末尾 `return attackType === "ranged" ? "bow" : "sword"`。開放 48 人裡解到 `bow` 的有 14 個，**其中 13 個是沒有 tag 的**——皮卡丘、依文潔琳、黑人牙膏、莉娜因巴斯、夜神月都在內；只有桔梗（除魔巫女）帶真的 `bow` tag。因為 `arrowRelease`/`arrowPierce` 就掛在 `weaponClass === "bow"` 上，**一隻電鼠的普攻現在會播「拉弓 → 放箭 → 箭矢穿刺」**。
- **⚠️ 上級指令的說法要修正**：交辦文說「每個法師施法時回一個拉弓聲」——**不成立**。`weaponClass` **只**蓋在 `basicAttack` 上（`BasicAttackSystem.ts:265,278`）；`abilityCast` 走 `castElementKey(d.vfxKey)`，完全不碰它。**施法不受影響，受影響的是普攻。** 底下的缺陷是真的，範圍比交辦文小。
- **加 tag 治不好它**：沒有 staff/wand/magic 這個類別可指，`combatSfx.WEAPON_SFX` 也沒有那一列。
- **缺的最後一哩**：`BasicAttackSystem.ts:57` 加第六類 ＋ `combatSfx.ts:100` 加一列 clip ＋ ~13 份角色文件加 tag。**三個檔案都在本車道**，可端到端做完。
- **權衡要寫在決策裡**：把 ranged 預設從 `bow` 改掉，會讓 `arrowRelease`/`arrowPierce` 的擁有者從 14 個掉到 1 個。**建議：加第六類 + 逐一 tag，不動預設**，這樣兩組音效都有真實擁有者。
- **成本**：**S**（程式）+ **S**（內容）

### P0-B · 結算 → M幣 → 水晶 → 解鎖英雄：整條迴圈在這台機器上**從未跑過一次**
- **形狀**：**S5**（環境）·（P0-4 + P0-5 合併，因為**同一場實驗**同時結案兩者）
- **任務**：#6 · #25 · #118（皆 completed）
- **程式現況（都是好的）**：`settleToPlatform()`（`MatchRoom.ts:681-745`）欄位對映正確、雙目標、HMAC 簽章、非 2xx 記 body、記平台自己回的 `ack.settled`。水晶發放在 `gamelink/callback.go buildSettlement` → `settle.go:167-170`，帶 `> 0` 重播守衛。
- **證據現況（全空）**：`data/accounts/` **11 個帳號全部 `mmr=1000 games=0 wins=0 mcoin=0`，`crystal` 欄位不存在**；`data/history/` **目錄不存在**；`data/journal/` 只有合成的 `probe-harvest-1`；`data/replays/` 60 份 = 48 份 `dev-*` + 12 份具名測試 fixture，**零份平台建房**。
- **玩家會看到**：打完整場、看到結算畫面、回大廳發現排行榜空的、M COIN 是 0、💎 是 0、解鎖英雄永遠買不起——**因為唯一的水龍頭從沒開過**。
- **缺的最後一哩**：**不是一次編輯，是一場實驗。**
  1. 用兩個真平台帳號登入
  2. **透過平台建房**（不是 dev 直連）
  3. 打完一整場
  4. 驗四件事：(a) 出現一份**沒有 `dev-` 前綴**的錄影 · (b) `data/history/<accountId>.jsonl` 多一列 · (c) 帳號 JSON `games=1` 且 `crystal` 非零 · (d) game-server log 寫 `settled: 2` 不是 `settled: 0`
- **成本**：**M**（一場對局的時間）
- **為何破例排 P0**：它擋著三個 completed 任務的驗收，而且**每多打一場 dev 直連，就多累積一份「看起來在動」的假證據**。

### P0-A · `crystals/earn` 的裁決更正
- 上一輪 P0-4 寫「`crystals/earn` 唯一 hit 是路由註冊本身」。**那條路由現在整條不存在**——`apps/platform/internal/wallet/handlers.go` 只掛 wallet/owns/catalog/buy/equip/unlockChampion/favourite/grantMCoin，`wallet/meta.go:22` 寫明「NO client-callable earn route」是**刻意移除**。
- 上一輪順帶提的「裸的已登入自助發放、無冪等」風險因此**也一併消失**——設計換成結算側絕對值寫入 + 重播守衛，比接上原本那個端點好。
- **這條從 S6（孤兒路由）除名**，剩下的問題純粹是 P0-B 的「從沒跑過」。

---

## 7. P1 · 家人會遇到，但不在第一分鐘（或最後一哩較貴）

### P1-A · #181/#160 手機／沙發 HUD 上，技能被拒絕時永遠不告訴你原因
- **形狀**：**S9** · **成本 S** · **仍破，逐字不變**
- 兩個 surface 缺 `<CastNoticeLine/>`：`TouchControls.tsx`、`components/CouchHudGrid.tsx`。四句話（冷卻中／魔力不足／距離太遠／尚未學習）算好了就丟掉。
- **好消息**：`surfaceParity.test.ts` 已把它棘輪化（雙向斷言），修好那天測試會**主動要求你刪掉那一列**。`npx vitest run src/ui/surfaceParity.test.ts src/ui/globalChrome.test.ts` → 9 passed，**綠燈正是缺口還在的證據**。
- **⚠️ 擁有權**：UI 車道。

### P1-B · #39 狀態視覺：蓋好了、export 了、**從來沒有人驅動**
- **形狀**：**S6** · **成本 S（一行）** · **仍破，逐字不變**
- 缺的最後一哩就是既有 per-entity pass 裡的一行：`vfx.statusFx.set(es.id, es.flags, pos.x, pos.z, nowMs)`。
- **玩家會看到**：被暈住／被定身／被減速的角色，外觀跟健康的角色**一模一樣**。
- **⚠️ 擁有權**：`apps/client/src/GameApp.ts` 屬 **P0 車道**。只報告。

### P1-C · #132 火圈：仍然看不見、沒有數字，但**時間點已經校準**
- **形狀**：**S3 + S1** · **成本 M** · **4 個子失敗修好 2 個**（音訊 + 時間點）
- (a) 沒有任何環狀 mesh（全 repo 0 hit）· (b) 燒傷不走 `damageQueue` 所以沒有浮動數字（**這是對的設計**，360 msg/s）· ~~(c) `FIRE_RING_SEC = 30` vs 剩 60 秒~~ **已修（2026-07-24）** · (d) `Minimap.tsx:112-116` 的註解**事實錯誤**，正在為一個真實缺口辯護。
- **(c) 已修**：常數搬進新的 `apps/client/src/audio/fireRingWindow.ts`，由 `match.combatMaxSec − match.fireRing.startSec` **推導**（live 240−180 = **60**）。`FIRE_RING_SEC` 現在是 **ESM live binding**，所以 `Minimap.tsx:41` 那個 import **不用改一個字就跟著校正**——鏡頭火圈提示與燒傷同一秒開始。**執行期斷言**也上線：sim 的 `fireRingStart` 事件抵達時，`combatSfx.ts` 呼叫 `noteFireRingIgnition(phaseSecondsLeft)`，推導值與真實點火差 >1.5 s 就 `console.error` 印出**兩個數字**（S3 要的那條「把關係綁住」的守衛）。測試：`apps/client/src/audio/fireRingWindow.test.ts`（9 條，含源碼鎖 `FIRE_RING_SEC = <數字>` 不得再出現）+ `packages/shared/src/sim/fireRing.test.ts` 從 **tick 側**證明同一條公式。
- **(d) 仍破，且是 UI 車道的檔案**：`Minimap.tsx:112-116` 的註解說「the sim has no shrinking-ring entity, so the map must not draw one」——**假的**，`world.fireRingRules` 正在燒血。該註解現在同時（1）事實錯誤、（2）在替 (a) 的缺口辯護、（3）沒有反映 `FIRE_RING_SEC` 已改成推導值。**只報告，不代改。**
- **待裁決（沿用 `_execution-batches.md` D4）**：給它真實幾何，還是誠實改名成「全域流血 + 可見倒數」。**兩個選項都不可以改走 `damageQueue`**（會重新開放護甲／護盾／吸血／擊殺歸屬）。

### P1-D · 迴避上線了，但**沒有歸因給那三個被動**，而且 sim 的註解現在在說謊
- **形狀**：**S8**（殘餘半條）· **成本 M（內容）**
- 修法是給 7 份角色文件加 **base stat**，不是 `sim/combat/evasion.ts:16-19` 自己預告的 modifier（「a later content lane fills the 29 blocks with `{stat:"evasion"…}`」）。`grep -rl '"evasion"' content/` → **只有 champion doc，零份 ability modifier**。
- 後果：**感應意脈 / JENOVA / 憂鬱的眼神**這三個被動仍然是惰性的——數值是活的，但沒有掛在應該賦予它的那個被動上。玩家看到自己會閃避，**但看不出是誰給的**。
- **順帶**：那段 docstring 現在自相矛盾，應該一起改掉（**本車道擁有 `packages/shared/src/sim/**`**）。

### P1-E · 匯入的 emitter 半徑全部大 2 倍（S15），其中 **2 份今天真的在畫面上**
- **形狀**：**S15 + S15b** · **成本 S（工具）+ 交接（資料）**
- `extract_particles.py:216` `radius = max(0.05, em.width * scale)` vs `w3xEmitter.ts:425` `halfExtent = (max(width,length)/2) * scale`（後者附註「矩形 W×L 發射面 → 外接圓」）。**兩條都產 `vfx@1 emitter.radius`，差正好 2×。** `extract_emitters.py:508` 把 `em.width * scale` 命名為 `emitterHalfWidth`——**同一個舊讀法，而且跟自己的標籤矛盾**。**有寫明理由的新讀法應該獲勝。**
- **範圍比交辦文小**：磁碟上 **228** 份 `godie-*-p*`（不是 282），其中只有 **7** 份經 `w3xAbilityArt` 可達，那 7 份裡 5 份被 0.05 下限夾住 → **真正畫錯的只有 2 份**：`godie-fireblast-p1`（1.171，應 ~0.586）與 `godie-tectonicfury-p0`（2.778，應 ~1.389）。這兩份**今天才開始真的被畫**（`W3xCastFx` 上線）。其餘 221 份是錯的但沒人引用。
- **S15b**：`:231` `burstCount = round(max(rate,1.0) * 0.3)` 把效能預算烘進保真度數字。新管線做對了（`w3xEmitter.ts:509` 吃 caller 的 `density`，畫質縮減是 `:600` 的獨立 pass）。0.3 應該是參數。
- **⚠️ 擁有權夾層**：`tools/w3x-import/**` 是本車道的，但重生 228 份文件會寫進 **VFX 車道**擁有的 `content/vfx/**` → **要交接，不能單方面重跑**。

### P1-F · 48 份被動天生技仍是空殼
- **形狀**：**S8** · **成本 M（純內容）**
- 108 份 innate doc 裡 60 份 `innateKind:"active"` 有完整 effects/cooldown/mana；**48 份 `innateKind:"passive"` 仍 `effects: []`**。按鈕在（D 鍵已綁），按下去什麼都不會發生。
- 這是 P0-3 修完後**唯一剩下的**天生技缺口，也是本輪唯一一條「上一輪就知道、範圍完全沒變」的內容債。

---

## 8. P2 · 真的壞，但深或罕見

### P2-A · `gunshot` 在開放名單上**結構性無主**（S14 🆕）
全 113 人裡只有 `godie-hlgr` 鋼彈-煌帶 `gun` tag（已實測），**不在白名單**。開放 48 人武器分布：sword 22 / bow 14 / katana 10 / greatsword 2 / **gun 0**。`combatSfx.ts:103` `gun: "gunshot"` 因此在任何可玩的對局裡都不可能響。
**真正的問題比缺一個音效大**：`sfxReachability.ts:124` 宣告 `gunshot` 可達——**對程式為真，對出貨名單為假**——而**對外的 credits 頁靠這份帳本背書**。
**缺的最後一哩**：一筆白名單 or 一個 tag（**策展資料不屬本車道，只報告**）。**外加**：可達性帳本要分 `code-reachable` / `roster-reachable` 兩欄。

### P2-B · 31/48 白名單角色仍未 tag → 武器音效仍是粗分類
13 遠程 → `bowDraw`（且順帶播放箭聲，見 P0-E）、18 近戰 → `attackSword1/2`。**成本 S**（可腳本化），**本車道擁有 `content/champions/**`**。

### P2-C · `content/bundle.json` 從工作樹消失 → 每次開機 1,441 次逐 doc 請求（S17 🆕）
`git status` 顯示 ` D content/bundle.json`（tracked、最後 commit 在 `6f93241`、磁碟上不存在，實測確認）。live 探針 `GET /content/bundle.json` → **HTTP 200 `text/html`**（vite SPA index fallback，2,260 bytes）。`FallbackContentSource` 形狀檢查丟掉它，**靜靜降到 `HttpContentSource`**：1 manifest + 12 `_index.json` + **1,441 份 doc GET**。逐 doc 路徑是好的（`/content/items/legendary-orb.json` → 200），所以**沒有任何東西看起來壞掉**。
**⚠️ 現在不要重生**：七個車道正在編輯 `content/`，`pnpm content:build` 會把半成品烘進 committed bundle。**這應該是合併閘的最後一步。**
**除此之外要修的是形狀本身**：降級時必須 `console.warn` + 在 `/healthz` 留一欄。

### P2-D · `AudioToggle.tsx:355` 的 🎚 展開鍵是啞的（#24 的續集）
同 S1 形狀，而且它是**全遊戲最全域的按鈕**——它在 `GlobalChrome` 裡，所以每個畫面都有，包括回放頁（實測兩棵樹 DOM 各 `[data-ggd-audio-expand]`×1）。它的兄弟會回應：`onToggle`（`:478-484`）播 `uiToggle`。`onToggleExpanded`（`:363` → `:540`）**什麼都不播、也沒有按壓 FX**。一行。**⚠️ 擁有權**：P0/UI 車道。

### P2-E · `ReplayControls.tsx` 上一輪被歸成「內部頁」——**那是判錯**
它的 4 個原生按鈕（`:119,127,148,159`）零 `playSfx`/`SfxButton`/`audioSystem`。而 `GlobalChrome.tsx` 自己的 docblock 主張回放頁「不是角落：它是**擁有者截圖回饋試玩用的那一頁**」——**那正是用來把 #14/#66 修到回放樹的理由**。同一個理由讓回放 transport 屬於 #24 的**玩家面前**那一桶，不是內部桶。

### P2-F · 11 個可達的戰鬥音效不在場景預載清單裡（**低**）
`attackSword1/2` `attackGreatsword` `attackKatana` `bowDraw` `gunshot` `arrowRelease` `arrowPierce` `magicFire/Ice/Lightning`（外加 `lowHealth` `levelUpJingle` `exUnlockSting`）不在 `sfxManifest.ts:212` 的 `SFX_BY_SCENE.combat` 裡。
**校準：這是延遲，不是靜音。** `playSfx`（`AudioSystem.ts:765`）會 `await loadBuffer(file)` 再播，所以聲音**會**出來，只是慢一次冷抓取。clip 6.6–35 KB，LAN 上是每個武器類別每 session 第一次揮擊的數十毫秒。**值得在清單裡補一行，不值得開一張任務。**

### P2-G · #79/#123/#182/#183 匯入美術的內容綁定（**引擎已上線，內容仍缺**）
`content/vfx/` 553 份，149 份被引用，404 份是死的。662 份技能文件的 `vfxKey` 絕大多數仍是 `fx.prim.*`；`w3xAbilityArt` 只晉升了 30 個（13 個在名單上）。**上一輪的「引擎沒上線」已經不成立**，剩下的純粹是綁定工作量。**成本 L**。**⚠️ 擁有權**：VFX 車道。

---

## 9. 潛伏（今天無害，會咬人）

| 項目 | 為何今天無害 | 何時會咬 |
|---|---|---|
| **quest 三選一「先抽後濾」** | `MatchController.ts:541` 先 roll 再 `filterItems`。今天 13/13 全在白名單，濾是 no-op | 白名單只要部分策展，玩家就會拿到 1 張或 2 張的「三選一」，**而且不會有錯誤**。`legendaryOrb` 刻意**先濾後抽**——同一個 repo 裡兩種寫法，對的那個沒被推廣（**S16**）。⚠️ Arena 車道 |
| **`burstCount` 的 0.3**（S15b） | 只影響 228 份多半不可達的 doc | 一旦 emitter 綁定推進（P2-G），錯的密度會跟著上畫面 |
| **`arenaSelect.ts:24-28` 讀三個不存在的欄位** | `roundArenaId`/`roundMapId`/`arenaId` 都不在 schema，純靠 fallback 到 `mapId` 運作 | 有人「修好」fallback 的那天 |
| **語音包 `MANIFEST.json` 0 個角色** | 五階梯的第 5 階保證不靜音（**0/113 靜默**已驗證），而且模組 header 自己揭露「0 today → 48」 | 不是假完成——**是誠實揭露的 S8**。但 #184「每角色音色」今天**背後沒有任何內容** |

---

## 10. 我當時判錯了（帳本準確性修正）

> 規則：**判錯要說出來**，不准安靜地改數字。左欄是稽核 #1 寫的，右欄是本輪實測。

| 稽核 #1 說 | 本輪實測 | 判定 |
|---|---|---|
| **#178「還缺 602 個 icon」** | abilities **646/663**、items 214/214、champions 113/113，**0 個 icon 欄位指向缺檔**（live 探針 `abilities/godie-hblm.r.webp` → 200 image/webp 10,724 B） | 稽核 #1 已經指出 602 是錯的、殘餘是 16。**本輪再修正一次：殘餘是 0**（那 16 個之後被補上或被 `blocked.third-party-ip` 正式排除） |
| **P1-6「0/113 角色帶武器 tag」** | **33/113**（katana 20 / sword 8 / greatsword 3 / gun 1 / bow 1） | **數字過期了，而且方向誤導。** 它指向的真缺陷（`gunshot` 死、遠程都拉弓）**活著，但是結構性的（沒有第六類），不是編輯待辦** |
| **P2-2「0 份內容帶 `hitFeel`」** | **142 份** | **過期。** 換上來的是更難抓的 S13（兩個欄位被丟掉） |
| **P2-3「evasion: 0 個內容檔」** | **7 份 champion doc，4 個在白名單，端到端驗證過** | **過期。** 但做法與 `evasion.ts` docstring 承諾的不同 → 那段 docstring 現在是假的 |
| **P2-1「`W3xEmitterRig` 只跑在 dev audition 頁」** | 在活的施法路徑上（`VfxSystem.ts:618`） | **過期。** 這改變了 P1-E 的爆炸半徑（那 2 份錯半徑的 doc 現在真的會被看到） |
| **P0-3「`INNATE_ACTIVE_CASTABLE = false`」** | `true`，而且**兩棵 HUD 樹都接了**（沒有重犯 S9） | **過期** |
| **P2-6「`MerchantShop.tsx` zIndex 0 hit」** | **3 hit**（`:294`、`:362-365`），`INTERMISSION_Z.panel` = 40 | **過期** |
| **P1-5「帳本報 43 個已綁，實際 40」** | 43 現在是**推導**出來的且正確（54 lab clip → 43 有可達 key、0 個 mapped-but-silent） | **當時對，現在過期**——這是最好的一種過期 |
| **P1-1「#27 對外分級 97/113 靜默」** | **0/113 靜默**（五階梯，Python 獨立重跑，0 缺檔） | **過期** |
| **P0-4「`crystals/earn` 的唯一 hit 是路由註冊」** | **那條路由整條不存在了**（刻意移除，`wallet/meta.go:22` 有寫） | **過期，而且是換設計不是接線** |
| **P2-5「23 個原生 button」** | **18 個**，兩個玩家面前的都修了；但 `ReplayControls` 的 4 個**分類判錯**（見 P2-E），`AudioToggle` 展開鍵是新增的 | **半錯**：數字對，**分桶錯** |
| **「19 個 SFX key 不可達」** | **10 個**（8 真孤兒 + 2 刻意遮蔽且已宣告） | **過期**；差額 = 6 個 fan-out + 3 個補觸發點 |
| **交辦文「每個法師施法回一個拉弓聲」** | `weaponClass` **只**蓋在 `basicAttack` 上；`abilityCast` 走 `castElementKey`。**施法不受影響** | **交辦文判錯**。底下的缺陷是真的但範圍較小（見 P0-E） |
| **交辦文「282 份 `godie-*-p*` 半徑全錯」** | 磁碟 **228** 份，可達 7 份，**真的畫錯的 2 份** | **交辦文判錯**（分母與爆炸半徑都高估） |
| **「112 個角色 hitFeel」讀起來像 112 種手感** | 112 份文件 → **7 種相異 tuple**（`{1, 0.18, 0}` ×35 … `{4, 0.55, 0.45}` ×4）。這是**重量級分級**，是可辯護的交付 | **不是假完成，是帳本用詞過寬。** 帳本應寫「**112 個角色分 7 個帶**」，任務標題說「每角色」要改 |

---

## 11. 假 pending —— **不得再排工**

> 最貴的錯誤永遠是：**把綠燈測試當成「功能會發生」的證據**。第二貴的是**重排已完成的東西**。

| 任務 | 判定 | 證據（產物層） |
|---|---|---|
| **#48** | 已修，關閉 | `GET :2567/healthz` → `platform.url=http://127.0.0.1:8080, source=env, degraded=false, degradations=[]`。**這是本輪一切經濟面驗證的前提**：白名單真的被抓取且被強制執行，不是 `bypass` 保險絲 |
| **#70 / #82 / #104 / #110** | **本輪新增進此表**（P0-2 復活） | 商店 28 finals + 2 services = 30 件可買且 28 件都有效果 · 寶玉有效池 7 ≥ count 3（`orbEligible` 濾掉 component/token/service）· 20 層封頂：`round >= 6` 閘門真的關（`statPath.ts:60,68`，`world.round` 每次中場寫入 `MatchController.ts:523`），round-6 手上約 8,350–9,100g vs 需要 7,500g · quest 池 13/13 |
| **#27 / #14 / #66(b) / #156 / #107 / #106** | **本輪新增進此表** | 見第 5 節逐條證據 |
| **#63 / #139 / #142 / #143 / #145 / #147 / #148** | 沿用，本輪未推翻 | — |
| **#77 / #124** | **各完成一半**（#77 scale 半已完成、模型半仍缺；#124 鐘已完成、BGM 重編曲仍缺） | 沿用 |
| **#50 / #130 / #167** | 沿用，維持關閉 | — |
| 既有清單 | 沿用 | `#100` `#131` `#173` `#85` `#93` `#121` `#118`(卡片半) `#162` `#128`(技能半) `#94`(卡片靠左半) `#136` `#133`(機制半) `#89`(sim 半) `#98` |

---

## 12. CONFIRMED-OK（抽驗過，不需排工）

僅列曾被懷疑或與上表相鄰、而**證據明確為好**的：

- **`eventFanout` 的兩檔契約**：檔案現在自己說明「加一個 emit 就必須在兩個集合之一裡具名」，且四個 server-only 分類**寫了理由**（無消費者、無 HUD）。**這是本輪唯一一個「用構造封死形狀」的例子，值得抄。**
- **`surfaceParity.test.ts` 的雙向棘輪**：從原始碼推導 surface（`rendersDeep` 走 import graph、剝註解），`KNOWN_GAPS` 兩個方向都斷言。**「你修好了，請刪掉這一列」比任何文件都可靠。**
- **`sfxReachability.ts` / `sfxLabCredits.ts` 改成推導**：`boundKeys = mapKeys ∩ PLAYABLE_SFX_KEYS`。獨立重數（**刻意把這兩份帳本排除在參考 grep 之外，不讓帳本自己背書**）三個數字全對。
- **#28 combat-env**、**#106 屬性預覽不說謊**、**#121 商店回購**、**#164 黑色傷害數字**、**#59 geoset 可見性**、**#158 音訊上限**、**#109 相位連續 BGM**、**#175 回放**：沿用稽核 #1 的證據，本輪未推翻。
- **資產完整性掃描**：119/119 model doc 的 `glbPath` 可解 · 113/113 角色 `modelKey` 對得到 model doc · 48/48 相異 vfx `texture` 存在 · **0 個 icon 欄位指向缺檔**。

---

## 13. UNVERIFIABLE —— 誠實列出，並寫明「什麼證據才能結案」

| 項目 | 為何驗不掉 | **什麼證據能結案** |
|---|---|---|
| **7 帶 hitFeel 在手感上是否真的分得出來** | 檔案證明數值不同且到得了 renderer；相鄰帶差 ±0.06 `shakeMag` 是否可感知不是檔案系統事實 | 拿第 1 帶與第 4 帶各一個角色打同一個目標，背對背 |
| **那 2 份大 2 倍的 emitter 看起來錯不錯** | 同上 | `render/vfx/w3xEmitterAudition.ts`（頁面已存在）渲 `godie-fireblast-p1` 1.171 vs 0.586，對照原始 `FireBlast.mdx` |
| **`fireRingLoop` 在戰鬥音床下聽不聽得見** | 混音／遮蔽 | 一次晚回合試玩 |
| **可達的音效是否**聽得見 | `attackKatana` 0.23 / `arrowPierce` 0.34 / `footstep` 0.22 都是刻意壓低的 | 一次戴耳機的試玩 |
| **手機 HUD 的 in-match DOM** | `__ggdForceTouch` hatch 存在（`mobileDetect.ts:26,36`），但 game-server 拒絕 client 建房（`OFFLINE_RESTRICTED_MESSAGE`，`firstOwner.ts:49`） | 允許 dev create 的 game-server，或平台登入 + 席位預約；然後 `__ggdForceTouch = true` 狂按 Q，查 `[data-cast-notice]`——桌機應在、觸控應缺 |
| **#6/#25/#118 家用／遠端部署** | 本機只有 dev 直連 | **見 P0-B 的四點驗收** |
| **#66(a) 容器 build stamp** | 本輪沒有車道碰 `docker/**` | `grep -rn "BUILD_STAMP" docker deploy Makefile nginx`，然後看 `ggd.adms.ai` 的徽章是不是 `dev` |
| **#87/#88/#109/#135/#137 BGM 音樂性** · **#124 重編曲** · **#75 殘響** | 感知問題 | 一次帶耳朵的試玩，逐首標記 |
| **#68/#61 每動畫朝向** · **#93 烤雞像不像** · **#103/#111/#146 中場幾何** | 視覺判斷 | 逐 clip frame capture / 一張中場截圖 |
| **615 個 procedural vfx 綁定主題上對不對** | `render/vfx/bindings.ts:56+` 依中文技能名分類，合理但未審 | 抽樣 30 支人工對照 |
| **9 份非 PASSIVE 但 `effects: []` 的技能文件** | 很可能就是 #128 已豁免的 7 個「🟣 真被動」格，但沒 1:1 對上 | 逐份比對 #128 的豁免清單 |

---

## 14. 一句話的行動建議

**先做四件 S 成本的事，全部都是靜默失敗：**
1. ~~**P0-D**（兩行）`combatFeedback.ts:323` 讀 `profile.flashColor` / `profile.flashMs`~~ —— **✅ 已修 2026-07-24**。實際不是兩行：`??` 的右手邊永遠不會執行（sim 對每次命中都填了 flashColor），照那樣改會用未量測的 sim 調色盤蓋掉量測過的 client 調色盤。見 P0-D 內文的分層。
2. **P0-C**（幾行，UI 車道）`SHOP_EVENT_KIND` 補 statPath 三事件 —— 現在每一次 19 層買錯東西都是無聲的 7,125 金
3. **P0-E**（一個 enum + 一列 clip + 13 個 tag，全在本車道）第六個武器類別 —— 順手讓皮卡丘不要再放箭
4. **P1-B**（一行，P0 車道）`vfx.statusFx.set(...)` —— 暈眩／定身／緩速第一次看得見

**然後排那場實驗（P0-B）**：兩個真帳號、平台建房、打完一場、驗四件事。它一次結案 #6 / #25 / #118。

**最後，把新形狀的偵測配方寫成 CI**——本輪最該進 CI 的兩條：
```bash
# S12：放行了卻沒有人接
comm -13 <(grep -oE '"[a-zA-Z]+"' apps/game-server/src/net/eventFanout.ts | tr -d '"' | sort -u) \
         <(grep -rhoE '"[a-zA-Z]+"' apps/client/src --include=*.ts --include=*.tsx | tr -d '"' | sort -u)

# S13：解碼了卻沒有人讀
for f in $(欄位名清單); do
  grep -rq "profile\.$f\|opts\.$f" apps/client/src || echo "DECODED-BUT-UNUSED $f"
done
```
S2 已經證明這招有效：**它從「本輪最貴的一條」變成「用構造封死、三個集合運算全回空」，只花了一天。**

> **給下一次稽核的一句話**：不要重讀這份文件然後重測所有東西。**讀第 5 節，只測那 4 條 🔴 和 2 條 ⚪，再跑一次第 4 節的 17 條配方。** 新命中的填進表裡，關掉的移到第 5 節並寫上憑什麼。這份文件應該一輪比一輪短——**除非我們在製造新形狀，那才是真正要看的訊號。**
