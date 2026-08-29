# 交付給 Codex 技能編輯器 —— 從這裡開始

> **一句話**：讀 3 份**必給**，其餘照需要。⛔ 權威是**端點**不是文件；
> 而定價規則目前**還只是散文**（端點沒做）—— 那一格下面明講。

最後更新：**2026-08-18** · 引擎能力指紋：**以 `docs/editor-contract/ggd-runtime-capabilities.md` 檔頭為準**（該行有守衛，⛔ 本頁不再貼字面值 —— 貼了必過期）

> ⚠️ **這一頁本身也會過期，所以它現在有守衛。**
> `packages/shared/src/ops/codexHandoffFresh.test.ts` 逐一檢查下面每一個檔案路徑
> 真的存在；`codexContractFresh.test.ts` 檢查合約文件貼的指紋等於引擎算出來的。
> 兩條都是 2026-08-14 補的，因為**這一頁當天同時在說兩個謊**（見文末「這一頁的病歷」）。

### ⭐ 2026-08-18 這一版變了什麼（GH#354 / #356，九個缺口）

指紋走了兩步：`c8deb8d8` → `5f1cd23e` → `9a5fed3e`。**交付前一定要重講的四件事**：

| 變的是 | 一句話 | 合約文件哪一節 |
|---|---|---|
| **6 條新屬性** | 輸出倍率三兄弟 · 單發傷害上限 · 無法迴避 · 冷卻流逝速度 | 第一節末 |
| **1 個新 op** `capRaisePct` | 解鎖上限的**百分比**形式（0.25 = 一般上限 +25%） | 第一、二節 |
| **1 個新事件 + 條件葉的 `other`** | 【屬性首次到頂】· 比較式的第二個運算元（自己 vs 目標） | 第五節 |
| **`permanentScope` · 複利疊層的 `maxStacks`** | 「本回合內」寫得出來了；「每層 ×k 最多 N 層」也是 | 第三節 |

⚠️ **這四項各帶一個量到的陷阱，三個會讓 JSON「存得下去、玩家拿不到」** ——
合約文件用 ⛔ 標出來了，第十四節的自檢清單也各加了一條。⛔ 交付時不要只說「多了幾個名字」：
名字在 `/capabilities` 裡本來就查得到，**陷阱只寫在合約散文裡**。

⚠️ **同一批也讓合約文件的一個舊數字露餡**：第十節寫著「19 個 hook 事件」而引擎已是
**33**（2026-08-18 改掉了）。⛔ 這正是「別把數字抄進編輯器程式」那條規矩的理由 ——
指紋對帳有守衛，散文裡的計數**沒有**。

### 🔴 已交付版本裡有一個**照抄就會被拒收**的範例（2026-08-18 修正）

合約第五節「條件葉」那張表的 `stat` 範例，在此之前寫的是
`{kind:"stat", subject:"self", stat:"hp", op:"lte", value:0.3}` —— **兩處硬錯**：

- ⛔ 比較運算子只有 **`>=` `<=` `>` `<` `==` `!=` 六個符號**。
  `lte` / `gte` / `lt` / `gt` 一個都不存在。
- ⛔ `hp` / `mp` 的 **`mode` 是必填**（`absolute` / `percent`），那個範例整個沒有。

⇒ 那是全份合約裡**唯一**一個手寫的條件葉範例，而它產不出一份載得進去的文件。
**如果對方已經照著寫了條件葉，這一條要主動講。**
（⭐ 出貨內容裡的真實寫法一直是對的 —— 錯的只有那一格散文。）

---

## 1 · 必給（沒有這三樣沒辦法開工）

| # | 路徑 | 是什麼 |
|---|---|---|
| **1** | [`docs/技能編輯器引擎須知 20260811.md`](技能編輯器引擎須知%2020260811.md) | **合約本體**。⭐ 先讀**第〇章**（五層優先序階梯）—— 它決定其他每一章的答案 |
| **2** | [`docs/英雄技能第一批重製-90支.md`](英雄技能第一批重製-90支.md) | **90 支範例**：owner 原始規格 ↔ 產出 JSON **並排**，一支一節。⭐ 這是「一份好的技能說明長什麼樣」的唯一樣本 |
| **3** | [`skill-tag-manifest.json`](../skill-tag-manifest.json)（repo 根目錄） | **139 個標籤 → `engineToken` 的機器對照**，帶 `authorWarning` |

### ⭐ 還沒重製的那 371 支 —— 工作清單就是這張 Excel

| 路徑 | 是什麼 |
|---|---|
| [`docs/skill-remake/GGD-技能重製-待填.xlsx`](skill-remake/GGD-技能重製-待填.xlsx) | **待填工作簿**，`tools/skill-remake/export_xlsx.py` 產生 |

2026-08-14 重新產生（**退場那 41 位之後**）的規模：

| 分頁 | 內容 |
|---|---:|
| **待重製** | **371 支 / 64 位英雄**（其中營運白名單內 38 位） |
| **已完成90支** | 90 支 / 15 位英雄 —— 對照用，讓作者看得到**上一批的格式** |
| **填寫說明** | 標籤詞彙 **60 種**（量出來的，不是想像的） |

⚠️ **數字是推導的**：371 = 出貨技能 461 − 已重製 90。⛔ 不要抄這張表上的數字當常數，
名單一動就變 —— 要用就重跑產生器：

```bash
python3 tools/skill-remake/export_xlsx.py
```

⚠️ 這一份**不是**給 Codex 讀的合約，是給**寫技能說明的人**（owner／內容作者）填的。
Codex 拿到的是填完之後、經過 `batch1.py` 產生的 JSON。兩者不要混。

### ⚠️ 第 3 份最容易被跳過，而跳過的代價已經量到了

那張表**早就在 repo 裡**，而 GGD 自己的產生器 **一次都沒讀它** ——
於是 `[暴走]`、`[拉扯]` 這些標籤寫在描述裡、機制**一個都沒產出**，
而且**沒有任何東西叫**（2026-08-12 的真因分析 A-3）。

它不只是對照表，還帶著**已經踩過的坑**。例：

> `[指定]` → `castType:"targeted"`
> **authorWarning**：只能指定敵人⋯把技能設成指定友軍（治療／增益）時，玩家按下去
> 不會有任何反應 —— 四條輸入路徑仍然只餵得出敵方目標。⚠️ 出貨內容裡已經有
> **13 份獨立技能文件**踩到這一格（全部是「按了什麼都不會發生」）。

⭐ **編輯器該做的第一件自動檢查就是它**：作者寫了標籤 → 查 `engineToken` →
輸出的 JSON 找不到那個 token 就標黃。

---

## 2 · 建議給（少踩坑，不給也能做）

| 路徑 | 為什麼 |
|---|---|
| [`docs/_skill-remake-batch1-真因分析.md`](_skill-remake-batch1-真因分析.md) | **8 個模板缺口的完整清單** —— 那是「一個外部作者翻譯 90 支技能會犯的錯」的**實測**名單，不是想像的 |
| [`docs/legacy/_w3x-fidelity-superseded.md`](legacy/_w3x-fidelity-superseded.md) | 第〇章第 3–5 層的具體範例：被新版取代的原作數值長什麼樣、誰在哪天裁的。⚠️ 2026-08-13 起在 `legacy/` 底下（`c24fc429` 把舊規格整批退場），這一頁的舊連結曾經指錯 |

---

## 3 · ⛔ 不要給

`docs/legacy/_skill-mechanics-coverage-20260808.md` · `_skill-judgment-values.md` · `skill-forge-design.md`

都是**內部工作紀錄**，而且部分已經過期（08-08 的機制盤點在 A 類修完後不準了）。
給了只會製造**第二個真相來源** —— 那正是第〇章要防的事。

---

## 4 · ⭐ 活的端點 vs 會過期的散文

第〇章明寫了：**權威是端點，不是文件。** 現況要講清楚，因為兩者混在一起最危險。

### ⭐ 正式站的唯讀契約檔（**編輯器在別台機器上，先打這個**）

```
GET https://ggd.adms.ai/content/editor-target-profile.json
```

⚠️ **為什麼是檔不是端點**：`/capabilities` 與 `/active/target-profile` 住在
content-api，而**正式站沒有把 content-api 對外開**。編輯器拿得到的只有
`https://ggd.adms.ai/content/*`（edge 直接服務的 live bind-mount）⇒ 這份檔是
遠端唯一拿得到的 base receipt。零認證、零 CORS。

`ggd-editor-target-profile@1` 一次給齊（owner 2026-08-14 指定的九項）：

| 欄位 | 內容 |
|---|---|
| `content.contentVersion` / `content.collections` | contentVersion ＋**每個集合的 hash 與 count**（14 個） |
| `contract.*` | profile / capabilities schema 版本、compiler contract（⚠️ 目前 `null`，GH#313／#314 未做） |
| `runtimeCapabilities` | 整份 manifest，含 `fingerprint` |
| `tagManifest` | schemaVersion / generated / tagCount / **檔案 hash** ＋ ⭐ `matchesEngine` |
| `authoringRules` | 定價來源（散文，會過期）＋ **6 條 normative 規則**（Promote／scope／strict params／allowlist） |
| `curation.*` | 英雄／道具開放清單 digest ＋ count（拿不到就 `null`，另給 live 端點） |
| `assetManifestDigest` | LOD manifest 的 digest |
| `deltaExportAllowed` | **固定 false** —— 正式站沒有 authoring store base，只支援 `bootstrap` |
| `unavailable[]` | **每一個 null 的出處**。⚠️ 沒有它，null 跟「忘了填」長得一模一樣 |

⭐ **`tagManifest.matchesEngine` 是最該先看的一格**：標籤清單宣稱的引擎指紋
等不等於引擎現在算出來的。⚠️ **2026-08-18 它仍然是 `false`** ——
標籤清單宣稱的那一串停在 2026-08-09（`ef984bcc`），而引擎已經走了三步到 `9a5fed3e`。
⇒ 那 139 個標籤的裁決是**對舊引擎**做的，而且距離又拉大了一次。

⭐ 這一格現在會**連帶回一份 `policy`**，交付時要照著講：
`tagAuthoring` 與 `tagDerivedMechanics` 都是 **`blocked`**（⛔ 標籤本身不可以再被
新增／改寫／反推），`typedPackages` 是 **`allowed`**（typed mechanics 走 capability
驗證、不經過 tag，所以不受影響）。⚠️ 2026-08-18 新增的六條屬性與 `capRaisePct`
**沒有任何標籤** —— 它們只能走 typed 那條路。

⛔ 整份是**推導**的，跟著 `pnpm content:build` 走，守衛
`shippedEditorProfileIsCurrent.test.ts` **逐位元組**比對。⛔ 不要手改那個檔。

⚠️ **它刻意沒有時間戳**（GH#389，2026-08-19 拿掉的）。這一段之前寫著
「`profileDigest` 刻意不含 `generatedAt`，否則每次乾淨重跑都會紅」—— 現在整格都不在了：
一個隨時鐘變動的欄位會逼守衛從逐位元組退化成模糊比對，而一條被放寬的閘等於沒有閘。
⇒ 要判「這是不是同一份 / 有沒有更新」，pin **`content.contentVersion`** 或
**`profileDigest`**（兩者都只有內容真的變了才會變）。⛔ 不要拿抓取時間當版本。

### 已經在跑（打它，⛔ 不要抄文件）

```
GET  <content-api prefix>/capabilities            # 引擎能做什麼（從出貨註冊表推導）
GET  <content-api prefix>/active/target-profile
GET  <content-api prefix>/health
```

實作在 [`apps/content-api/src/importRoutes.ts`](../apps/content-api/src/importRoutes.ts)。
`capabilities` 回 `ggd-runtime-capabilities@1`，內容全部是**推導**的。
2026-08-18 量到的規模（⛔ 這張表是**當天的快照**，不是常數）：

| 欄位 | 2026-08-14 | **2026-08-18** |
|---|---:|---:|
| `effectKinds` | 37 | **37** |
| `hookEvents` | 19 | **33** ⭐ |
| `conditionLeafKinds` | 5 | **5**（`other` 是**欄位**不是新葉子）|
| `templateFamilies` | 17 | **17** |
| `effectFields` | 190 | **191** |
| `hookFields` | — | **21** |
| `planned`（逐筆 supported / partial / unsupported） | 28 | **28** |
| `knownBroken` | 1 | **1**（仍然是 `hook:onDeath` 的小怪那一半，GH#296）|

⭐ 它有 `fingerprint`（現在是 `9a5fed3e`）—— 拿它 pin base，引擎一變你就知道。

> ⚠️ **但別忘了文件裡那一份是快照。** 2026-08-14 實測：引擎已經走到 `c8deb8d8`，
> 合約文件卻還貼著 `7f2a3d75`，而**四個數字（37/19/5/17）當時全部還是對的** ——
> 逐項核對也看不出來。變的是 `knownBroken` 的內文。
> ⇒ **每次交付前先打一次端點，用回來的 fingerprint 對一次文件。**
> （現在 `codexContractFresh.test.ts` 會替你紅。）
>
> ⚠️ **2026-08-18 是這句話的反面示範**：這一次**指紋有守衛所以是對的**，
> 露餡的是**沒有守衛的那個計數** —— 合約第十節寫著 19 個 hook 而引擎已經 33。
> ⭐ 判準：**指紋只證明「引擎變了會被抓到」，不證明散文裡的數字是對的。**

### ⛔ **還不存在**：`GET /authoring-rules`

第九章承諾的定價合約端點（MP 公式係數、冷卻的硬界／原則界、規則清單）
**還沒實作**（GH#313 / #314）。

**所以現在的實際狀況：**

| 你要的東西 | 從哪拿 | 會過期嗎 |
|---|---|---|
| 有哪些 effect kind / hook / 條件葉 | `GET /capabilities` | ❌ 活的 |
| 標籤 → engineToken | `skill-tag-manifest.json` | ⚠️ 檔案，但有守衛在對帳 |
| **MP 公式、冷卻界線** | **第九章的散文** | ⚠️ **會**。端點做好前這是唯一來源 |
| 90 支的 JSON 範例 | 第 2 份文件 | ❌ 有守衛（見下） |
| **哪些能力已知壞掉** | `capabilities.knownBroken` | ❌ 活的。⛔ 別抄第十一章的散文 |
| 一個 effect / modifier / 條件葉的**完整參數與上下界** | [`docs/技能標記機制與效果規則.md`](技能標記機制與效果規則.md) | ❌ `pnpm spec:build` 產生，有守衛 |
| ⭐ **一個機制的「陷阱」** | **合約文件的散文** | ⚠️ **會**。這是唯一住處，沒有守衛 |

⚠️ **最後那一列是這份交付最容易漏掉的一半。** `/capabilities` 與
`技能標記機制與效果規則.md` 回答的是「**這個名字存不存在**」與「**它的欄位長怎樣**」，
⛔ **兩者都不會告訴你「填了會不會發生任何事」** ——
`pctMult` 掛在 `outputDamagePct` 上、`capRaise` 掛在 `unlocked === base` 的屬性上，
兩者都是**合法 JSON、通過 schema、上線之後什麼都不會發生**。
那些只寫在合約文件裡（2026-08-18 各補了一節）。

---

## 5 · 那兩份文件不會無聲過期（有閘）

`docs/英雄技能第一批重製-90支.md` 與 `技能編輯器引擎須知` §13.10 **都是生成的**：

```bash
python3 tools/skill-remake/refresh_docs.py          # 重生成
python3 tools/skill-remake/refresh_docs.py --check  # 過期就回非零
```

守衛：`packages/shared/src/ops/skillRemakeDocsFresh.test.ts`（真的把腳本跑起來）。

⚠️ **這條守衛是踩過坑才有的**：2026-08-12 產生器修了 8 個缺陷、90 支 JSON 全變了，
而 §13.10 還貼著舊的 —— 而那正是 Codex 會照著抄的東西。

⛔ **所以不要手改那兩份文件**（包括覺得哪裡寫錯的時候）。改產生器，然後重跑。

---

## 6 · ⚠️ 內容名單在 2026-08-13 縮過一次

41 位英雄（235 支技能）從 `content/` 搬進 **`content/_legacy/`**。對編輯器的影響：

- **出貨英雄 78 位 / 技能 461 支**（`content/` 底下），⛔ 不是舊文件裡的 119 / 696
- 引用一支技能的 id 之前，先確認它在 `content/abilities/` 而不是 `content/_legacy/abilities/`
- ⚠️ 退場**不是刪除**：`_legacy/` 裡的文件留著是刻意的（將來可能復活），
  所以「這個 id 存在」不等於「這個 id 出貨」

---

## 7 · 交付前對一次

- [ ] 三份必給都給了，而且 **`skill-tag-manifest.json` 沒有漏**
- [ ] **打一次 `GET /capabilities`，用回來的 `fingerprint` 對一次合約文件的檔頭**
- [ ] 講清楚 **`/capabilities` 是活的、第九章的定價是暫時的散文**
- [ ] 講清楚 **第〇章的五層階梯**是衝突時的唯一判準，而且
      「可以停就列表確認、不能停就做成開關（**預設走高層級**）」
- [ ] 講清楚 **測試只做預設啟動的那一邊**（不需要全做選項）
- [ ] ⭐ **講清楚 2026-08-18 的四項新機制與它們各自的陷阱**（見本頁開頭那張表）——
      ⛔ 只說「多了幾個名字」不算，名字他們自己查得到，**陷阱查不到**
- [ ] ⚠️ 講清楚 **`tagManifest.matchesEngine` 仍然是 `false`**，
      所以 `tagAuthoring` / `tagDerivedMechanics` 是 `blocked`、只有 typed 那條路可走
- [ ] 講清楚 **出貨名單是 78 位英雄**，`_legacy/` 裡的不算
- [ ] 如果這一輪要**新寫技能說明**：`export_xlsx.py` 重跑過，拿到的是最新的 371 支清單

---

## 8 · 這一頁的病歷（⚠️ 留著，因為它解釋了為什麼有守衛）

**2026-08-14 稽核，這一頁同時在說兩個謊，而且都沒有東西叫：**

| # | 謊 | 代價 |
|---|---|---|
| 1 | 合約文件貼 `指紋 7f2a3d75`，引擎已經是 `8d30566f` | 對方被叫去「拿指紋 pin base」，而 pin 到一個不存在的基準；`knownBroken` 的內文早就改了（GH#296 的成因在 08-09 換過），對方會照舊的去繞一條不存在的路 |
| 2 | 「建議給」指向 `docs/_w3x-fidelity-superseded.md` | **檔案不在那裡**（`c24fc429` 搬去 `docs/legacy/`）。交付時那一份會直接漏掉 |

⭐ 兩個都不是「忘了改」的個案 —— 是**手寫索引必然的衰變**。所以現在：

- `codexContractFresh.test.ts` —— 指紋對帳（突變驗過：改一個字元會紅並指名行號）
- `codexHandoffFresh.test.ts` —— **這一頁列的每一個 repo 路徑都必須存在**
  （突變驗過：把任一路徑改錯會紅並印出那一行）

⛔ 這兩條紅了不要改測試，改這一頁 / 改文件。

**2026-08-18 稽核，第三個謊 —— 而且它剛好落在那兩條守衛的縫裡：**

| # | 謊 | 為什麼沒有東西叫 |
|---|---|---|
| 3 | 合約文件第十節寫「**19 個 hook 事件**」，引擎已經是 **33** | `codexContractFresh` 只比對**指紋**（那一格當天是對的，因為它有人維護）；`codexHandoffFresh` 只比對**路徑存不存在**。⛔ **散文裡的計數兩條都不碰** |

⭐ 這一次的教訓與前兩次同型但更細一階：
**「有守衛」保護的是那一格，不是那份文件。**
指紋對得上，只證明「引擎變了會被抓到」——⛔ 不證明散文裡抄下來的數字還是真的。
⇒ 所以合約文件現在在那個數字旁邊寫著「**⛔ 不要抄這個數字進編輯器程式**」，
而每一處計數都附上它的活出處（`/capabilities`）。
