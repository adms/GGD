# 給 Codex Editor 的一鍵貼文（2026-09-05）

> owner 貼給 Codex 的**唯一一則**訊息。之後一律走 PR，⛔ 不再靠 owner 轉貼。
> ⭐ 這一份與 repo 根目錄的 `AGENTS.md` **逐字同源**（`AGENTS.md` commit 進 main 之前，Codex 看不到那份，所以這裡把全文帶上）。

---

Codex，從這一則起，Main（Claude Code）與你之間的協作改走 **Pull Request + CI**，owner 不再替我們轉貼。
下面是你每次開工都會自動讀的 `AGENTS.md` 全文（Main 已起草，票 #988 會把它 commit 進 `origin/main`；
在那之前以這一份為準）。請先做 **§6 的五件事**，並以 **PR** 送出，PR body 用 §3 的 packet 格式。
讀到任何 Main 的宣稱，先跑它附的 `repro.command`，⛔ 不要信摘要。

本輪開的票（給你對照，⛔ 不用回覆這則訊息，回覆一律在 PR 裡）：
#979 #980 #981 CI 基線綠 · #982 regression 61 列 · #983 branch protection＋CODEOWNERS · #984 CI 補四步 ·
#985 `coord:check` · #986 你的 advisory／brickId／逐份指紋（⭐ 你的第一張 PR）· #987 兩條閘盲區 · #988 `AGENTS.md`

---

# GGD — Codex Editor 協作契約（`AGENTS.md`）

> ⭐ Codex 每一次開工都會自動讀這一份。它**只寫有閘擋著的規則**，其餘一律指向機器可讀的檔。
> 衝突時的優先序：**閘（CI／測試）＞ 本檔 ＞ `docs/editor-contract/*.json` ＞ 任何手寫 `.md`**。
> ⛔ 本檔以外的五份「先讀」文件（`CODEX_TYPE_HANDOFF` / `GOAL_CODEX_*` / `README_CODEX_開工清單` /
> `MAIN_TO_EDITOR_RESPONSE_*` / `VFX_FORGE_SPEC_FOR_CODEX`）與它打架時，**以本檔為準**。
> 記於 2026-09-05 · `origin/main` = `57e955735`

---

## 0. 三個角色，一條通道

| 誰 | 是什麼 | GitHub 身分 |
|---|---|---|
| **Main** | Claude Code，跑在 owner 的 Mac 上。做**機制**：effect kind / hook / 條件葉 / schema / 產生器 | `adms` |
| **Codex Editor**（你） | 做**編輯器、特效工坊、驗收治具、內容配方** | `ChaoKuan-Lin` |
| **owner** | 只裁決**設計偏好**。⛔ **他不再是傳輸層** —— 不要請他轉貼任何東西給 Main | `adms` |

⭐ **唯一的通道是 Pull Request。** 只 push 分支而不開 PR ＝ 這件事沒有發生。
（量到：`feat/vfx-forge-codex` 至今 **0 張 PR**；`ci` 工作流**從未**跑過你的程式；
上一輪的 74 個資產 blocker、缺 4 行 `COPY`、授權洞、6 支沒登記的產生器，全部是 owner 手動貼的。）

---

## 1. 每一批工作的流程（⛔ 順序不可換）

1. **從 `origin/main` 長分支**：`git fetch origin && git checkout -b codex/<主題> origin/main`。
   ⛔ 不要從舊的 `feat/vfx-forge-codex` 繼續長 —— 它已經完整併入 main（0 ahead / 15 behind）。
2. **改 `content/` 或 `docs/` 之前先問是誰的**：`bash scripts/genguard.sh <path>`。
   它說「有產生器擁有者」⇒ **改來源**，然後 `bash scripts/genrun.sh <step>` 重生成。
   ⛔ 手改產物在 CI 的 `skills:check` 會被打回，而且下一次 sync 會把你的改動洗掉。
3. **push 之前本機跑一次**（三個一起跑，⛔ 不要做一項跑一項）：

   ```bash
   pnpm skills:check
   pnpm editor:accept:release
   pnpm coord:check      # ← 在 GH#985 落地之前這一行會是 command not found，先跳過
   ```

4. **開 PR**：`gh pr create --base main --title "[codex][<fix|feature|improve>] <一句話>" --body-file <packet 路徑>`。
   PR body 就是 §3 的 packet。沒有 `gh` 就在 GitHub 網頁開，內容一樣。
5. **CI 綠 ＋ Main 對機制目錄的 review 通過 ⇒ merge。**
   ⛔ 紅的 PR 不要開第二張來繞 —— 修同一張。⛔ 不要 force-push 覆蓋 review 過的 commit。

---

## 2. 分工（`CODEOWNERS` 會強制，GH#983）

| 目錄 | 誰改 | 你要動它的話 |
|---|---|---|
| `packages/shared/src/sim/**` · `packages/shared/src/content/schema/**` · `tools/**/gen*.ts` · `content/config/**` · `scripts/**` · `.github/**` | **Main** | 送 `kind: brick-request` 或 `kind: claim` 的 packet（§3） |
| `apps/editor/**` · `apps/editor-desktop/**` · `tools/vfx-forge/**` · `tools/editor-acceptance/**` · `tools/skill-forge/**` · `docs/editor-contract/coordination/**` | **你** | 直接 PR |
| `content/abilities` · `content/vfx` · `content/champions` 等內容 | 先 `genguard` | 它說沒有擁有者才手改，否則改來源 |

⭐ 判準（CLAUDE.md 第〇·五守則）：**如果你在為某一支技能寫 if，你就越線了** —— 那個 if 該是 Main 的一個條件葉，
你的技能該在 JSON 裡引用它。連續調同一族特效**超過 2 輪**還沒收斂 ⇒ 停手，那不是參數問題，送 packet。

---

## 3. Packet：一則訊息 ＝ 一個 JSON 檔

路徑 **`docs/editor-contract/coordination/<dedupeKey>.json`**，跟著 PR 一起送。
⛔ 不要再寫日期戳的 handoff `.md`（`docs/editor-contract/` 已有 10 份，全部過期，沒有任何東西會告訴你哪一份還算數）。
⛔ 不要建 inbox / outbox / `state.json` / heartbeat —— PR 就是這四樣。

schema `ggd-coord-packet@1`（`pnpm coord:check` 驗，GH#985）：

```json
{
  "schema": "ggd-coord-packet@1",
  "dedupeKey": "brick-request.solid-beam",
  "kind": "brick-request",
  "from": "codex",
  "to": "main",
  "baseCommit": "57e955735",
  "contractFingerprint": "<shasum -a 256 docs/editor-contract/ggd-type-catalog.json | cut -c1-16>",
  "title": "缺一個「連續實心寬光束」積木",
  "claims": [
    {
      "kind": "confirmed",
      "text": "現有 fx.prim 組合只能得到數條細 trace，沒有連續實心體",
      "repro": { "command": "pnpm editor:accept:visual", "expectedExit": 1 },
      "commit": "35b231ef3",
      "evidence": ["docs/_reports/editor-skill-codex-advisory/review.json"]
    }
  ],
  "unblocks": ["godie-nbbc.e", "godie-ogrh.r", "godie-o00x.r", "godie-hart.r", "godie-e002.ex", "godie-e00l.ex", "godie-hvsh.r"],
  "ownerQuotes": [
    { "date": "2026-09-04", "text": "整個矩陣是用來微調的，你的任務是將我們調好的常用幾種作為 type 積木讓編輯器選用後，可以再用矩陣微調節省時間" }
  ],
  "asks": ["Main 提供一個實心光束的 type（spawnModelFx preset 或新 effect kind）；原作出處 war3map.j:<行號>（有就附）"]
}
```

欄位規則（每一條都是 `coord:check` 會紅的東西，⛔ 不是建議）：

| 欄位 | 規則 |
|---|---|
| `kind` | `brick-request` · `claim` · `question` · `advisory-refresh` · `owner-decision` |
| `dedupeKey` | `<kind>.<主題-kebab>`。同 key 的 packet **已 merge 且 `contractFingerprint` 沒變** ⇒ 不准再送（＝同一題重問） |
| `contractFingerprint` | `shasum -a 256 docs/editor-contract/ggd-type-catalog.json \| cut -c1-16`。契約沒變就不要重開舊題 |
| `baseCommit` | 你分支出來的 `origin/main` sha。不是 `origin/main` 的祖先 ⇒ 紅 |
| `claims[]` | 每一條要有 `kind`（`confirmed` / `refuted` / `inferred` / `owner-decision`）＋ `repro.command` ＋ `repro.expectedExit` ＋ `commit`。⭐ **CI 會真的跑那條指令，離開碼對不上就紅。** 指令只准這幾種前綴：`pnpm ` · `npx vitest run ` · `bash scripts/` · `node tools/` · `python3 tools/` |
| `evidence[]` | 路徑必須存在於這張 PR 的樹裡。寫「缺 X」要同時寫**哪一行程式會讀它**（`a/b.ts:NN`），否則「缺席」驗證不了 |
| `unblocks[]` | `brick-request` 必填：至少 **2** 個 `docs/_reports/editor-skill-acceptance-42x46.json` 的 row id，且那些 row 的 `machineIssues` 帶 `MISSING_VISUAL_BRICK` 與**同一個 `brickId`**。⭐ 這就是「擋住幾支」：它現在是驗收包裡機器發的計數，⛔ 不是口頭說的支數。**1 支 ＝ 專屬積木，不做**（GH#916 的判準） |
| `ownerQuotes[]` | owner 說過的話**只能**住這裡，逐字＋日期。其他任何句子一律視為**你的推測** |
| `status` | ⛔ **沒有這個欄位**。狀態住在 PR：open＝NEW · review requested＝ACKNOWLEDGED · checks 綠＝VERIFIED · merged＝RESOLVED · label `owner-decision`＝OWNER_DECISION · closed 未 merge＝DEFERRED |

---

## 4. 讀 Main 的 packet（也在 PR 裡）

⛔ 不要信摘要。每一條 `claims[]` 先跑它的 `repro.command`，離開碼對不上就在 PR 留言貼 log 並標 `refuted`。
（量到的教訓：上一輪一邊說「已推送」而 GitHub 對那個 commit 回 HTTP 422；另一邊說「不是我的」而它就是。）

---

## 5. 什麼時候問 owner

只有**設計偏好**（兩個都對、要挑一個）。送 `kind: owner-decision` packet：列選項、**你自己的預設**、
以及**回頭的開關在哪一格**（config id ＋ 欄位名）。⛔ 沒有開關的選項不准送 —— owner 的常設指令是
「沒做完以前別問我，自己判斷，但是留後台開關可以簡易 rollback」（2026-08-23）。
⛔ 數值、公式、系統倍率**不要問**：公式已定，倍率是 owner 的旋鈕（`content/config/owner-knobs.json`）。

---

## 6. 現在就做的五件（你的第一張 PR）

| | 做什麼 | 為什麼 |
|---|---|---|
| **A** | 對指紋 `692c8240…` 重跑 advisory：`node tools/skill-forge/build-codex-visual-advisory.mjs`，讓 `pnpm skillforge:visual-advisory:check` EXIT 0 | 它今天紅在**你的** advisory 對不上 Main 合併後的包，⛔ 不是等 owner |
| **B** | `tools/skill-forge/build-visual-review-packet.mjs`：`sourceDigest` 改成**逐份文件**一個，過期只作廢那一份 | 今天是整包一個 hash：改 1 份作廢 46 份 —— 這就是 echo loop 的機械形式 |
| **C** | `machineIssues[]` 的 `MISSING_VISUAL_BRICK` 加 `brickId` | 今天 7 列共用同一句泛話，積木名只住在肉眼備註的散文裡，機器數不出「擋住幾支」 |
| **D** | 送第一則 packet `brick-request.solid-beam`（§3 那份），`unblocks` 填那 7 列 | 它會是 `coord:check` 的第一個真實輸入 |
| **E** | 以上全部走 **PR**，⛔ 不是 push 分支 | §0 |

（對應票：GH#986）

---

## 7. 尚未上線的閘（誠實表 —— 上線一個就把那一列改成 ✅）

| 閘 | 票 | 上線之前靠什麼 |
|---|---|---|
| branch protection ＋ `CODEOWNERS` | GH#983 | Main 的 PR review |
| CI 補 `skills:check` / `editor:accept:release` / `docker build` / `coord:check` | GH#984 | 你本機跑 §1 第 3 步 |
| `pnpm coord:check`（packet lint ＋ CI 重跑 repro） | GH#985 | 照 §3 手寫，Main review 時逐格比對 |
| CI 基線綠（`unit` / `go-platform` / `vuln`） | GH#979 · GH#980 · GH#981 | ⛔ 現在 main 的 CI 是紅的（42 天），PR 的紅分不出新舊 —— 先看 CI 的**第一個**紅是不是你造成的 |
| `AGENTS.md` 本身有閘（引用的每一條指令都存在） | GH#988 | —— |

---

## 8. ⛔ 不要做的（每一條都踩過）

- 手改 `docs/技能標記機制與效果規則.md` · `docs/editor-contract/ggd-*.json` · `content/bundle.json` 之類的**產物**（§1 第 2 步）
- 用現有參數「湊一個看起來像的」（`count × spacing` 拼粗光束）—— 翻不過去就送 `brick-request`
- 讀技能說明找機制時把 `「…」` 裡的**角色對白**當效果
- 在票或 packet 裡把自己的推測寫成 owner 的需求（§3 `ownerQuotes`）
- `git add -A` · `git commit --amend` · `git checkout <檔>`（不可逆，會洗掉別人的 lane）
