# 給下一個 Main session 的一鍵貼文（2026-09-05 夜，owner 已去睡）

> owner 2026-09-05（逐字）：「我現在要請另外一個 session 把所有你開的票都解決 並且滿足以下需求」
> 「我要去睡了 所以請你要搭配 goal 來做完所有相關的事情」
> 他的四句需求已用 `ruling.sh` 逐字前置到 #838，並拆成 #989–#993。⛔ 不要再問他。

---

## 0. Session goal（貼進 goal 欄的那一段，⛔ 逐字）

```
#979–#993 每一張都落在兩種狀態之一：(a) 關閉，留言逐條勾 AC 並附證據指標（測試名／commit sha）；
(b) 留言寫「量到的進度 · 剩餘 · 下一步 · 棘輪基準線」，且 Codex lane 的部分（#986 A–D、#992 Codex lane、#991 入口）
已寫成 packet 放在 docs/editor-contract/coordination/ 等 Codex 的 PR。
硬性必須是 (a) 的：#979 #980 #981 #983 #984 #985 #987 #988 #989。
其餘（#982 #986 #990 #991 #992 #993）至少落到 (b)，而且 schema／閘／第一批已 commit。
另外四個可檢查條件：origin/main 的 ci 三個 job（unit／go-platform／vuln）綠；AGENTS.md 與 .github/CODEOWNERS 在 origin/main；
pnpm skills:check、逐包 pnpm test、pnpm typecheck 全綠；工作樹乾淨、全部已 push、release note 已寫（release.sh --tag）。
⛔ 不部署正式站（部署協定第 2 步要 owner 勾）。最後一則回報含逐票表、「我挑了哪些開關」、一行部署指令。
```

⚠️ goal 的判準要能**自己滿足**：(b) 是為了讓 Codex lane 與四張大票不會把你鎖進無限迴圈（記憶 `ggd-unsatisfiable-session-goal-loop`）。⛔ 不要把 goal 改成「全部關閉」。

---

## 1. 這一夜的授權與邊界

| 可以 | ⛔ 不可以 |
|---|---|
| commit · push · `bash scripts/release.sh --tag "…"`（owner 逐字「做完所有相關的事情」；#979–#981 的 AC 就是 origin/main 的 CI 綠） | 部署（`mini-deploy.sh`／`host-deploy.sh`）—— 回報附一行指令給他按 |
| 自己判斷、留開關、回報點名開關（owner 2026-08-23 常設指令） | 問 owner；把自己的推測寫成他的需求（票裡只有 `> 引言` 是他的） |
| 開平行 lane（8–12 條，**檔案級**柵欄，⛔ 兩階段） | 多條 lane 同時跑 `skills:sync`（全域只能一條；lane 一律 `--check`） |
| 順手發現的缺陷 `gh issue create` | 順手修（除非是這一批自己造成的） |

沒有別的 Main session 在跑（開票那條已收工）。⚠️ Codex 可能在推 PR：合併前 `git fetch`，收工必跑
`npx vitest run packages/shared/src/ops/noStrandedLaneCommits.test.ts`。

---

## 2. 順序（只有「同時跑會撞車」才分批，全部同一夜）

| 批 | 票 | 為什麼這個順序 |
|---|---|---|
| ① | #979 · #980 · #981（三條 lane 平行，不同檔）→ push → 看 `gh run list --workflow ci --branch main --limit 1` | 基線紅，後面每一張的 PR 紅分不出新舊 |
| ② | #983（等①綠才 `apply`）· #984 · #985 · #987 · #988（commit `AGENTS.md`，已在工作樹）· #986 的 Main lane E/F/G/H ＋ 寫 packet 給 Codex | 通道 |
| ③ | #989（清冊，先）→ #990 · #993 · #992 Main lane · #991（第 0 步是 content-api 上正式站的決定） | 積木層；#989 是其餘三張的輸入 |
| ④ | #982（先量，再分類，清不完就留言並讓 #983 不 require `regression`） | 唯一沒重量過的數字 |
| ⑤ | 收工：`noStrandedLaneCommits` · `pnpm skills:check` · 逐包 `pnpm test` · `pnpm typecheck` · `release.sh --tag` · 回報 | |

---

## 3. 每一張票都要照的規矩（都在 CLAUDE.md，這裡只是索引）

- **改任何檔之前** `bash scripts/genguard.sh <path>`；紅了改**來源**再 `bash scripts/genrun.sh <step>`。
- **測試攢起來跑**：一批 ≤ 3 次 vitest、1 次 tsc；紅了**一次撈全部**（三個閘寫進三個 log 再讀）；同一個閘紅第三次 ⇒ 停，找結構性根因。
- **> 5 分鐘沒新輸出** ⇒ `ps` 看 CPU，0% ＝ 掛了。⛔ 不用 `until … sleep` 輪詢背景任務。
- **離開碼**：`… > log 2>&1; echo "EXIT=$?"`，⛔ 不 `| tail`；背景通知的 exit 是 echo 的。
- **commit**：`git commit -F msg -- <逐檔 pathspec>`；⛔ `add -A`／`--amend`／`checkout <檔>`。
- **守衛驗機制不驗數字**；靈魂層一條承重 ＋ 一次突變；體驗層 ≤ 80 行不突變；純數值 0 行。
- **每一格開關落三個住處**（`content/config/*.json` ＋ Zod `DEFAULT_*` ＋ admin `SHIPPED_*`），預設＝你挑的。
- **owner 的旋鈕不要動**（`content/config/owner-knobs.json`）；公式已定。
- **犯規當下** `bash scripts/rule-slip.sh <守則代號> <成因代號> "一句話"`。
- **context ≥ 95%** ⇒ `bash scripts/memory-temp.sh` 並填三節。
- **「玩家看得到」才叫做完**：畫面層的「已修」要帶 `@visual-proof` 或報告路徑；沒有就寫「鏈路已接上，⛔ 未驗收」。

---

## 4. 最後一則回報的格式

1. 逐票表：票 · 狀態（(a)/(b)）· 證據指標 · 我挑的開關（config id ＋ 欄位 ＋ 預設值）。
2. 一行部署指令（⛔ 不執行）：
   `GGD_PUBLIC_HOST=ggd.adms.ai GGD_SITE_HOSTS="ggd.adms.ai test.adms.ai" GGD_MINI_USER=genieacceler GGD_MINI_HOST=192.168.0.133 bash scripts/mini-deploy.sh deploy`
3. 順手開的 issue 表（是什麼 · 多嚴重 · 修起來多大 · 不修玩家會遇到什麼）—— owner 醒來勾要不要併進這一版。
4. 給 Codex 的 packet 清單（路徑 ＋ dedupeKey），owner 只要把 `AGENTS.md` 那一則貼文送出一次。
