# Codex ↔ main 分工協作計畫（2026-08-31）

> ⚠️ 這一份回答的是「**往前怎麼走**」。
> 「**現在差多少**」在 [`CODEX_CATCHUP_20260830.md`](CODEX_CATCHUP_20260830.md)（398 行，⛔ 不重複）。

---

## 0. ⭐ owner 的裁決（逐字，⛔ 這是分工的唯一依據）

> 「不用管 codex branch，**以遊戲主程式 main 為主**，我再讓 codex 配合」（2026-08-31）

> 「`feat/ability-review-authoring` 是 codex 的 branch，你可以**參考思路**，
>  但**獨立編輯器 桌面版 Electron 還是 codex 的獨立工作**喔」（2026-08-31）

⇒ 兩句話合起來就是下面那張表。⛔ 沒有第三種解釋。

---

## 1. 誰擁有什麼

| 東西 | 擁有者 | 判準 |
|---|---|---|
| `main` 的遊戲程式（sim / client / game-server / platform） | **main** | owner：「以遊戲主程式 main 為主」 |
| `content/**` 出貨內容與產生器（`tools/**`） | **main** | 產物隔離區 + genguard 都住這裡 |
| `packages/shared` 的 schema 與 capability 推導 | **main** | ⭐ **契約的來源**，⛔ 不是副本 |
| `apps/admin` 後台（含 no-code 編輯器那條線） | **main** | owner：「後台編輯器的抽象化⋯很重要」 |
| `apps/content-api` 的 route | **main** | ⚠️ 但**新增 route 由 Codex 的需求驅動**（見 §3） |
| **Electron 桌面版獨立編輯器** | ⭐ **Codex** | owner 逐字：「還是 codex 的獨立工作」 |
| `feat/ability-review-authoring` 分支 | ⭐ **Codex** | ⛔ main 不合併它（見 §4） |

---

## 2. ⭐ 接縫只有兩份檔 —— 而且**兩份都是機器讀的**

⚠️ ⛔ **不要靠散文對齊。** 這個 repo 已經記錄過「一份被散文守著的數字活過了它的保存期限」。

| 契約 | 產生 | 回答什麼 | 新鮮度閘 |
|---|---|---|---|
| `docs/editor-contract/ggd-runtime-capabilities.md` | `pnpm caps:export` | 「**這個名字存不存在**」 | `caps:check` |
| `docs/editor-contract/ggd-editor-coverage.json` | `tools/editor-contract/gen_editor_coverage.ts` | 「**編輯器要蓋到哪些欄位**」<br>⭐ `required` **546** 筆 · `notRequired` **15** 筆 · `fingerprint: 60ddb509bf66`<br>⚠️ ⭐ `notRequired` ⛔ **不是「不要做」**，是「**之後會實作**」（owner 2026-08-31）—— 今天引擎做不到而已 | `editorCoverageFresh.test.ts` |

⭐ **Codex 的驗收就是這兩份**：`fingerprint` 對得上 ＋ `required` 的 **546** 格都畫得出來。
⛔ 不是「看起來都在」。

⚠️ ⭐ **兩份都是產物** —— Codex ⛔ 不可以手改它們來讓自己過關。
改的方式是改 main 的 schema／註冊表，然後 main 重跑產生器。

---

## 3. 「編輯器連遠端 Base」那 5 項 —— ⭐ **量過的**歸屬

2026-08-31 逐項量 main 側（⛔ 不是印象）：

| 項 | main 側現況（量到的） | 歸屬 |
|---|---|---|
| `targetProfileOverride` | **零命中** —— main 沒有「覆寫 profile」的概念 | Codex |
| `GET /content-api/editor-source` | ⭐ main 已有 **6 條** route（`/active/target-profile` · `/capabilities` · `/authoring-rules` · `/content-import` · `/active/runtime-bundle` · `/health`），⛔ 沒有這一條 | ⭐ **main 做，但等 Codex 要**（見下） |
| `editor-authoring` sidecar | `apps/` 七個 app 裡沒有 | Codex |
| 遠端素材 read-through 快取 | ⛔ **0 個檔**提到遠端 base | Codex |
| `remoteAsset.test.ts` | 同上 | Codex |

### ⛔ 為什麼 `editor-source` 我**現在不做**

⭐ 一條**零呼叫端**的 route ＝ owner 2026-08-31 當面質疑過的那個形狀
（「`zipSafety` 零呼叫端⋯**你修這個好處跟必要性是？**」）。
⇒ ⭐ **Codex 的編輯器真的要打它的那一天，開一張票，main 一天內給。**
⛔ 在那之前它是複雜度，不是功能。

⭐ **要的時候請在票裡寫清楚三件**：① 要回傳什麼（欄位）② 誰會讀它（哪一行程式）
③ 認證怎麼過（⚠️ content-api 今天是 **loopback-only**，⛔ 遠端打不到 —— 見 §5）。

---

## 4. ⛔ 分支政策：**main 不合併 Codex 的分支**

| | |
|---|---|
| **Codex** | 在 `feat/ability-review-authoring`（或後續分支）上工作，⭐ **定期 rebase 到 main** |
| **main** | ⛔ **不 cherry-pick、不合併**。⭐ 要它的某個想法 ⇒ **在 main 上重做**，⛔ 不是搬 commit |

⭐ **為什麼**：2026-08-30 逐項比對 97 項，量到**接近 40% 會是退步**
（例：`EffectGraphWorkbench` 296 行、只有 localStorage、**零寫回**，
而 main 的 `ForgeStudio` 964 行 ＋ `expand.ts` 2,490 行）。
⇒ ⭐ 「分支比較新」⛔ 不等於「分支比較好」。逐項判斷，⛔ 不整批搬。

⚠️ ⭐ 還有一個**靜默**的：那個分支把 `radiusTier` 的語意漂掉了
（**小 3→4.5 ＝ +50%**，面積 **+125%**），而 **51/55 個使用點名字沒變、驗證全綠**。
⇒ ⛔ 合併它會讓一批技能的範圍**在沒有任何東西變紅的情況下**變大。

---

## 5. ⚠️ 今天量到的三個**會咬 Codex** 的陷阱

⭐ 這三個是 2026-08-30/31 **真的踩到**的，⛔ 不是預想。
（另外九個在 [`CODEX_CATCHUP_20260830.md` §4](CODEX_CATCHUP_20260830.md)。）

### ⑩ ⛔⛔ 兩個 schema tag，**名字只差一個詞**，而它們是不同的文件

| tag | 誰產生 | 有 `generatedAt` |
|---|---|---|
| `ggd-**content**-target-profile@1` | live 端點 `/active/target-profile` | ✅ 呼叫端灌 |
| `ggd-**editor**-target-profile@1` | `content/editor-target-profile.json` | ⛔ **沒有**（GH#389：留著每次 build 就髒） |

⭐ 那份出貨檔的 **17 個鍵**裡，`TargetProfile` 型別的 **9 個必填欄位一個都沒有**。
⚠️ ⭐ **我 2026-08-31 自己中了這一個** —— 看到出貨檔沒有 `generatedAt`，
就去把型別鬆綁成選填。⛔ 兩份根本不是同一個東西。
⇒ ⭐ 讀那份檔之前先看 `schema` 那一格。

### ⑪ ⛔ content-api 是 **loopback-only**

`apps/content-api/src/guard.ts` 只放行 loopback origin。
⇒ ⭐ **遠端編輯器今天打不到它**（這正是「連遠端 Base」那 5 項存在的原因）。
⚠️ ⭐ **六條 route 分成兩組，⛔ 不要一概而論**（2026-08-31 逐行讀出貨原始碼）：

| 組 | route | 今天回什麼 |
|---|---|---|
| **可以用** | `/capabilities` · `/authoring-rules` · `/active/target-profile` · `/health` | ✅ 真的回資料 |
| **importer** | `POST /validate` `/apply` `/rollback` · `GET /active` `/active/runtime-bundle` `/operations/:id` | ⛔ **501** ＋ 一則指名階段的診斷 |

⭐ 501 是**刻意**的（`importRoutes.ts:11` 逐字：「⛔ 不留任何『暫時先這樣』的成功路徑」）——
⚠️ 一條回 200 假資料的 route 會讓 Codex 以為接通了。
⇒ ⛔ 不要以為「route 在＝可以用」——⭐ **先打一次看回什麼**。

### ⑫ ⛔ `apps/editor` 的欄位涵蓋有**兩個方向**的閘

`apps/editor/src/form/coverageMatchesContract.test.ts` 兩邊都問：
契約有而 `walkZod` 走不到 ⇒ 紅（對方做出上線就是死的內容）；
`walkZod` 走得到而契約沒宣告 ⇒ 紅（對方白白繞路）。
⚠️ ⭐ 而它會被一個**看起來無害**的改動打瞎：在 `zEffectDef` 外面包一層
`superRefine` / `z.any()` ⇒ 可內省型別從 `discriminatedUnion` 變成 `unknown`
⇒ ⭐ **46 種 effect kind 全部走不到，而 tsc 是綠的**。
（⚠️ 我 2026-08-31 做過這件事。`_shared.ts` 檔頭現在記著「⛔ 不要在這裡包」。）

---

## 6. ⭐ 節奏：Codex 每次開工前的**三行**

```bash
git fetch origin && git log --oneline origin/main -5    # ① main 動了什麼
pnpm caps:check && npx vitest run packages/shared/src/ops/editorCoverageFresh.test.ts   # ② 契約新不新鮮
python3 -c "import json;print(json.load(open('docs/editor-contract/ggd-editor-coverage.json'))['fingerprint'])"   # ③ 對得上嗎
```

⭐ `fingerprint` 變了 ⇒ 去讀 `required` 的 diff，⛔ 不要整份重讀。

---

## 7. ⛔ 兩邊都不要做的事

| ⛔ | 為什麼 |
|---|---|
| 手改 `docs/editor-contract/*` | 產物。⭐ 改 main 的 schema 再重跑產生器 |
| 在 `packages/shared/src/sim/**` 用 `Math.random` / `Date.now` | `sim/purity.test.ts` 會紅 |
| `git add -A` · `git commit --amend` · `git checkout <檔>` | ⭐ 併行時它們動到的是**別人的**東西 |
| 為了讓契約過關而改測試 | ⭐ 契約紅了 ⇒ 跑產生器 ＋ `git add`，⛔ 不是改斷言 |
