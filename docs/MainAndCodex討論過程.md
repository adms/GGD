# Main ↔ Codex Editor 協作：討論過程與量到的事實

> ⭐ **這一份是給「另開一個乾淨 session 討論協作機制」用的交接文件。**
> ⛔ 它**不是**規格，也不是結論 —— 它是**已經量到的東西**與**還沒決定的東西**。
>
> ⚠️ 讀它的時候套第三守則：**下面每一個數字都要能重量**。指令都附在旁邊。
> 記於 2026-09-05 · `origin/main` 當時在 `1acedaa3f`

---

## 0. 一句話：問題不是「兩個 AI 溝通不良」，是**沒有自動通道**

owner 現在是**傳輸層** —— 兩邊的每一則訊息都靠他複製貼上。
⭐ 而量到的根因只有一個：

```bash
grep -E "^on:|push:|pull_request:" .github/workflows/ci.yml
#   on: push: branches:[main] + pull_request

gh pr list --state all --limit 20 --json headRefName --jq '.[].headRefName' | grep vfx-forge
#   （空的）⇒ ⛔ feat/vfx-forge-codex 從來沒開過 PR
```

⇒ ⭐⭐ **CI 一次都沒跑過 Codex 的程式。**
⇒ 這一輪的 74 個資產 blocker、缺 4 行 `COPY`、`ai-review/promote` 授權洞、
6 支沒登記的產生器 —— **全部都是 CI 會自動抓的**，⛔ 而它們是 owner 手動貼給我的。

---

## 1. echo loop：Codex 的診斷（⭐ 他們對）

```
Editor 逐招調特效
→ 發現現有積木不好用
→ 請 Main 補積木
→ Main 更新契約與模板
→ Editor 分支沒有立即同步        ← ⭐ 關鍵那一段
→ 舊驗收再次報告缺同一類積木
→ 又產生新 handoff
```

⚠️ ⭐ **而還有第三段是 Main 這邊的**（Codex 沒提到）：
每次任一邊加產生器 ⇒ `skills:check` 一路過期 ⇒ 另一邊追一輪。
⇒ 這一輪已經處理（6 支登記／豁免、5 支 I/O 量進戶籍），⛔ 但根治要靠 CI。

### ⭐ 我一開始判斷錯了

我說「不是 echo loop」——⛔ 因為我只看了最近兩回合（他們修 → 我驗 → 收斂），
⭐ 而他們看的是整段歷史。**這件事本身就是 loop 的症狀：兩邊看的視窗不一樣。**

---

## 2. ⭐ Codex 六條批評的逐條裁決（7 個 agent 查證，每條要求 檔案:行號）

⭐ **六條全部是「兩邊都只對一半」。** 逐條：

| # | 主張 | 裁決 |
|---|---|---|
| 1 | CI 要能自動發現未登記 generator | ⭐ `*:check` 那一軸**已經自動**（`skillsSyncCoversGenerators.test.ts:335-337` 推導名單，`ci.yml:14`+`:93` 在每個 PR 跑）。⛔ 而「沒登記 **I/O**」那一軸**在 CI 上不會紅**（`sync.mjs:62` 的 chain 比對只在 runtime 響，⭐ 而 CI 不跑 `skills:sync`） |
| 2 | 「擋住幾支」只能排序⛔不能否決 | ⭐ **Codex 對，而 Main 自己的契約也站他那邊**（`CODEX_TYPE_HANDOFF.md:282` 逐字「是排序依據」，⛔ 而 `fea7fa139` 的 commit 訊息把它當判準）。⛔ 但 Codex **沒有提出替代量尺**，且忽略 owner 2026-09-04 10:43 逐字「把我們**調好的常用**幾種作為 type 積木」 |
| 3 | `barrier-domain` 的判準錯 | ⭐ 對，⛔ 而且**被出貨家族反證**：`tpl-buff-self` N=28 全員一致的 default **0 格**、`tpl-locust-orb` N=29 同樣 —— 而兩者都是好家族。⚠️ **但結論不翻**：拿 Codex 自己的四軸量，`godie-hvsh.e` 仍是 N=1 |
| 4 | JASS 可追溯只適用重製 | ⭐ 對，⛔ 而他提的「正確階梯」與 `CLAUDE.md:177` **逐字一樣**，且 `templateDefaultsHaveOrigin.test.ts:41` 的 `TOKENS` **早就收** `owner:`／`derived:`／`taxonomy:` ⇒ 要改的是**散文**，⛔ 不是閘。⛔ 而他這條有循環：新技能「來源是設計師 JSON」而被驗的就是那份 JSON |
| 5 | `codeOnlyKnobs` 不能結案 | ⭐⭐ **兩邊都錯，見 §3** |
| 6 | pickable ≠ 全部旋鈕可用 | ⭐ 對。⚠️ 而更糟的是 `paramsSchema.test.ts:97` 逐字 `if (slot.type !== "number") continue;` ⇒ **19 格 inert 宣告只有 12 格被雙向驗證**，剩 7 格（含 `tpl-dragon-*`）**沒有人驗過它們真的無效** |

### ⭐ 一個兩邊都沒提到的缺口

```
skillsSyncCoversGenerators.test.ts:337 的判準是 `k in EXEMPT`  ← ⛔ 值是空字串也會過
```
⇒ ⭐ 「理由要能被反駁」今天**純粹是散文**。而實例就在表裡：
`skillforge:visual-advisory:check` 的理由逐字寫著「它會寫檔 ⇒ 照規矩該接進 skills:check，
這一列是**暫時**的」——⭐ **一個已知的真缺口正在豁免表裡全綠。**

---

## 3. ⛔⛔ `codeOnlyKnobs`：我對 owner 說了兩次錯話，⭐ 而錯的來源是**閘在說謊**

```bash
git log -S "const RATCHET = 59" -- packages/shared/src/ops/codeOnlyKnobs.test.ts
#   4843f7ef3  2026-09-01   ← 基準線
git log -1 -S "MAX_DISPATCH_PASSES" -- packages/shared/src/sim/systems/WorldHookSystem.ts
#   4e3ebc881  2026-08-09   ← ⭐ 比基準線早，一直在 59 裡面
git log -1 -- packages/shared/src/sim/effects/fanRotation.ts
#   77ccda83e  2026-09-04   ← ⭐ 真兇：我自己的 FAN_STEP_DEG / FAN_MAX_TOTAL_DEG
```

⭐ 訊息那一行原本是 `rows.slice(RATCHET)` ⇒ 它印的是**排序後的最後 N 筆**，
⛔ 而不是「比基準線多出來的那幾筆」。⇒ **錯誤訊息指著錯的檔，而每一個人都往那裡查。**

⚠️ ⭐ **而 Codex 的三個子問題若真的照跑，會得到「這兩格是死角、要搬進 config」——
⛔ 那也是錯的修法**（搬了紅燈照樣在）。⇒ **兩邊被同一個假訊息騙。**

已修（`1acedaa3f`）：訊息改成明說「這不是新增的那幾筆」＋附真的比對方法；
那兩格進 `EXEMPT_BY_NAME` 帶理由（⭐ 它們是**常數表的刻度與上界**，⛔ 不是旋鈕）。
⛔ RATCHET 一位都沒動。

---

## 4. Codex 的協調機制提案（原文摘要）

**兩層**：
- 第一層：`tools/editor-coordination/` ＋ `docs/editor-contract/coordination/{main-outbox,editor-outbox,state.json}`，
  不可變 JSON packet（`schema` / `id` / `from` / `to` / `kind` / `baseCommit` /
  `contractFingerprint` / `dedupeKey` / `evidence[]` / `status`），CLI `coord:send|reply|sync|check|status`
- 第二層：Codex 任務間直接傳訊 ＋ heartbeat 定期 fetch

**狀態機**：`NEW → ACKNOWLEDGED → VERIFIED → {RESOLVED | OWNER_DECISION | DEFERRED}`
**硬規則**：`dedupeKey` 不重送 · fingerprint 沒變不重開 · 一次澄清往返 ·
Editor 配方問題不送 Main · 手寫 Markdown 不是狀態來源

**「完整理解後回答」**：接收方必須 fetch packet 指定的 commit、確認 fingerprint、
讀原始碼／schema／測試、**執行重現指令**，再分標「已確認／已否定／只能推論／需 owner 決策」

### ⭐ 我同意的三個核心洞見

1. **repo 是唯一真相**
2. **`dedupeKey` ＋ 狀態機**（直接打中「同一題被重問」）
3. ⭐⭐ **「接收方不能只讀另一個 AI 的結論，要獨立重建證據」**
   —— 這一輪就驗證了它：owner 貼 Codex 的回報給我，我去查 ⇒
   GitHub 說 `35b231ef` 不存在（`gh api …/commits/35b231ef` → HTTP 422）。
   ⛔ 我若信了摘要，我們會在一個不存在的 commit 上規劃兩輪。

### ⛔ 我反對的載體（三條，都有出處）

**① 我們已經蓋過這個系統三次了。**
```bash
ls docs/editor-contract/ | grep -E "COORDINATION|DELTA|CATCHUP|HANDSHAKE|HANDOFF|HANDBACK|BLOCKERS"
#   16 份日期戳的一次性協調文件
python3 -c "import json;s=json.load(open('package.json'))['scripts'];print([k for k in s if 'handback' in k])"
#   已有兩支 handback 產生器
```
⇒ ⭐ 他的提案會是**第四次**，⛔ 而且多一套 CLI／schema／inbox／狀態機／heartbeat。

**② 提案從頭到尾沒提 PR 和 CI** —— ⭐ 而那是**已經存在**的通道：

| 他要蓋的 | PR 已經是 |
|---|---|
| inbox / outbox | PR 留言串 |
| `NEW→ACK→VERIFIED→RESOLVED` | PR 的 open / review / merged |
| heartbeat 偵測未讀 | PR 的 webhook 通知 |
| ⭐ **「接收方獨立重建證據」** | ⭐ **CI 就是那個重建** |
| fingerprint 沒變不重開 | check 只在 push 時重跑 |

**③ heartbeat 需要有人跑它** —— 兩邊都不是 daemon。
⇒ ⛔ 那只是把「owner 貼」換成「有人要記得跑 heartbeat」，
⭐ 而這份 repo 的元規則逐字是「**判準 0/4 全破，只有閘有用**」。

**④ 第〇·四守則**：協調狀態會有兩個住處（他的 `state.json` ＋ GitHub 的 PR 狀態）。

### ⛔ 一個事實更正

Codex 寫「若 Main 是另一個 Codex 任務，只要讓它出現在同一個 App 的任務清單中」——
⛔ **Main 不是 Codex 任務**，是 Claude Code 跑在 owner 的 Mac 上。
⇒ 「任務間直接傳訊」那條路**不存在**，⭐ 而 git remote 對兩邊都存在。

---

## 5. ⭐ Main 的反提案（同樣的性質，⛔ 少 90% 新程式）

```
1. Codex 開 PR，⛔ 不是只 push 分支          ← 通道／狀態機／通知／閘一次到位
2. packet 保留 Codex 的 schema，但它是 PR 裡的一個檔
   docs/editor-contract/coordination/<dedupeKey>.json
3. 狀態走 PR 的狀態，⛔ 不自己維護第二份（第〇·四守則）
4. 「獨立重建證據」＝ CI 的 job，⛔ 不是紀律
5. 唯一的新程式：一支 coord:check 進 skills:check ——
   packet 的 baseCommit 不是 origin/main 的祖先 ⇒ 紅
```

⚠️ **前提**：main 的 CI 現在是紅的（見 §6）。
⭐ **一個永遠紅的基線讓 PR 的紅分不出新舊** ⇒ ⛔ 不修的話第 1 條沒用
（CLAUDE.md 失敗形態⑨：一個永遠紅的閘＝一個不存在的閘）。

---

## 6. ⛔ main 的 CI 現在紅（連續 6 次），⭐ 而**兩個都是真缺陷**

```bash
gh run list --limit 20 --json name,conclusion,event --jq '.[] | select(.name=="ci")'
#   main  push  failure  ×6
```

三個 job：

| job | 根因 | 上次綠 |
|---|---|---|
| `unit → Static TODO gate` | ⭐ **真缺陷**：三列 `docs/todo/*.md` 的資料違規（例 `latency-visibility.md:115` 的 `pc-09` invalid），⛔ 不是掃描器母體變了 | ⭐ **`1dddf5c90`（2026-07-30）—— 之後 36 天沒綠過** |
| `go-platform → go test apps/platform` | ⭐ **真缺陷**：`27948b23f`（2026-09-02，#949 版本戳）在 `apps/game-server/src/buildHealth.ts:92` 新增讀 `GGD_BUILD_ST…` | run `33597400639`（2026-09-02T06:06Z） |
| `vuln → govulncheck` | （工作流跑到這裡時本文件已寫，見當時輸出） | —— |

⚠️ ⭐ **「36 天沒綠過」本身就是失敗形態⑨**：一個從來沒人看它綠過的閘，
與一個不存在的閘沒有差別。⇒ 修它之前要先問「它這 36 天擋住過什麼嗎」。

---

## 7. 這一輪已經落地的（⭐ 新 session 不必重做）

| | |
|---|---|
| Codex 的 `35b231ef` | ⭐ 已合併並發版 **v0.38.0**、已部署（站台 HTTP 200） |
| 資產 blocker | **74 → 0**（Codex 修的，我驗過） |
| `content:build` | ⭐ 從 EXIT=1 回到 **0** |
| `#977` emitter 外觀繼承 | ⭐ 修好：`lostByEmitters` **8→4** · `nodesActuallyLosing` **14→6** |
| Dockerfile 缺 `COPY` | ⭐ 補 4 行（⛔ 不補正式 build 會死在 rollup，而本機全綠） |
| `ai-review/promote` 授權洞 | ⭐ 關掉（取 Codex 的實作 —— 他們的比我的好） |
| 6 支沒登記的產生器 | ⭐ 4 支接閘 · 2 支帶理由豁免 · 5 支包 `genrun` |
| 38-002 三條黑龍 | ⭐ `radial` → `fan`（**玩家看得到的第一個接線**） |

---

## 8. ⛔ 還沒決定的（⭐ 新 session 要討論的就是這些）

1. **⭐ 協作載體**：PR + CI（Main 提議）vs `editor-coordination` CLI（Codex 提議）vs 混合
2. **⭐ 「擋住幾支」的替代量尺** —— Main 提議用 Codex 自己給的
   「阻塞 42 主題／46 文件的**必要驗收類型**」（那是一份存在、可查的清單）
3. **CI 三個 job** 要不要現在修（⭐ 兩個是真缺陷 ⇒ 修它們會改到別人的東西）
4. **豁免表的理由沒有閘** —— 要不要加一條（例：理由必須含 token ＋ 長度下限）
5. **7 格沒被驗證的 inert 宣告**（`paramsSchema.test.ts:97` 只驗 number）
6. **`skillforge:visual-advisory` 的人工批核** —— ⛔ 需要**人**重新看過

---

## 9. ⚠️ 給新 session 的三個陷阱（都踩過）

1. ⛔ **不要信任何一邊的摘要** —— 這一輪 Codex 說「已推送」而 GitHub 說那個
   commit 不存在；我說「不是我的」而它就是我的。⭐ **每一個宣稱都去重量。**
2. ⛔ **閘的錯誤訊息也會說謊** —— `codeOnlyKnobs` 的 `rows.slice(RATCHET)` 指著錯的檔。
   ⭐ 判準：訊息說「新增的是 X」時，去問「它**怎麼知道**什麼是新的」。
3. ⛔ **不要用 `until … sleep` 輪詢背景任務** —— 背景任務本來就會通知，
   輪詢是純浪費（owner 2026-09-05 當場指出）。
