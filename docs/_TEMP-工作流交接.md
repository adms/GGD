# 🔄 TEMP 工作流交接 — 2026-07-31

> **下次說「重新開始」時，先讀這一頁，再讀 [`_execution-batches.md`](_execution-batches.md)。**
> 這一份是「銜接用」的臨時檔，等下一輪收工就可以併回批次計畫然後刪掉。

---

## 0. 一句話現況

**v0.9.16 已經上線在 ggd.adms.ai**（`7ea896dd`，2026-07-30 18:48 建置）。
有**一條四線工作流還在跑**，產出 32 個未進版檔案 —— 下面第 3 節寫了怎麼接。

---

## 1. 線上狀態（deploy 已完成）

| | |
|---|---|
| main / 線上 | `7ea896dd` = **v0.9.16** |
| 內容版本 | `cv_cafa5067f210` · 119 英雄 / 219 道具 / 31 強化 |
| 白名單 | 61 啟用 → 扣掉 **10 隻變身態** → 玩家看到 **51 隻** |
| 帳號 | 50 筆，`data/` 是 host bind mount，部署沒動到 |
| Redis | 沒重建 → 登入 session 保留 |

### ⚠️ 這次 deploy 踩到的三個坑（下次直接避開）

1. **`ssh -A` 轉發的是空 agent。** 本機 `~/.ssh/config` 對 github.com 指定
   `IdentityFile ~/.ssh/id_rsa`，所以**本機** push 一直是好的；但**主機**要靠轉發，
   而 agent 在重開機後是空的。
   → `ssh-add --apple-use-keychain ~/.ssh/id_rsa`（那把金鑰無 passphrase）。
   ⚠️ 失敗訊息是「correct access rights / repository exists」，**看起來像權限問題，其實是沒金鑰**。

2. **`make` 沒有裝在主機上。** `make family-up` 不是這台的部署路徑。正確指令：
   ```
   docker compose -f docker/compose.yaml -f docker/compose.family.yaml --env-file docker/.env build
   docker compose -f docker/compose.yaml -f docker/compose.family.yaml --env-file docker/.env up -d
   ```
   ⚠️ **兩個 compose 檔要疊**，只給 family 那個會報 `service "redis" has neither an image nor a build context`。
   ⚠️ **不要**跑 `family-up` 裡的 seed 步驟（`run --rm platform -seed -starter`）—— 那會寫玩家資料。

3. **`content/` 是 live bind-mount，`git pull` 一寫就立刻生效。**
   這次 pull 半途失敗（`data/.gitkeep` 權限），**已經寫了 170 個 content 檔**，
   於是線上變成「v0.9.15 的 client + v0.9.16 的內容」→ 舊 Zod 拒收新欄位 → **選角 0 隻英雄**。
   ⚠️ **game-server 不受影響**（開機就把內容讀進記憶體），**但 client 每次開頁面即時抓** ——
   兩者的差別是我這次判斷錯兩次的原因。
   → 教訓：**content 與程式必須同時換**。pull 之後一定要接 build + restart，中間那段是壞的。

---

## 2. 🔴 還沒做完 / 待確認

### 2-1 owner 正在測，等回報
- 選角是不是 **51 隻、無重複變身態**（強制重載 `Cmd+Shift+R` 之後）
- 揍敵客 EX（F）→ 5 秒內 Q → 那一刀有沒有多出「燒掉法力 × 20%」
- 小呆 EX 變龍魔人，防禦是不是**當下防禦 ×2**（買護甲也一起乘）

### 2-2 release note 太薄（owner 明確抱怨過）
GitHub 上的 v0.9.16 note **只寫了 owner 的七條修正**，但這一版實際是
**737 檔 / +83,171 行 / −3,855 行**，包含：
變身系統 · 13 個新 effect 機制（dot / knockback / summon / evasion / invulnerable /
damageLine / damageArea / cycleBuff / grantAttribute / spendMana / leap / championForm / restore）·
條件系統 · 傳說武器四類定位 · 殭屍波 · 網路對戰優化 · berserk · requirement 系統。
→ **要重寫**。素材：`git diff --stat cba64c28 HEAD`、
`git diff --name-status cba64c28 HEAD -- packages/shared/src/sim/ | grep ^A`

### 2-3 線上三條紅燈（已查完，決定出貨）
| 測試 | 判定 |
|---|---|
| `settlement` 贏家收到淘汰廣播 | **HEAD 之前就有** —— 在乾淨 worktree 驗證過，v0.9.15 也帶著它。是真缺陷，修它要動 #193 名次判定 |
| `autoAcquire` IDLE hits=0 / frozenTicks=0 | 前一條 lane **刻意留紅**，檔頭明文「不要用放寬期望蓋掉（e34339b7 因此被 revert）」。缺口是「**bot 不會主動打站著不動的玩家**」 |

### 2-4 順手發現、還沒處理
- **索敵半徑不對稱**：走位卡住的玩家 48，站著不動的只有 6（`OrderSystem.ts` 的 `autoEngageActive`）。
  → 是決策點，**應該做成欄位**（W4 lane 正在做，見第 3 節）
- **暗步鏡頭跟不上**：0.067 秒位移 7.2 單位，實測 44% 被切 / 33% 出框。
  已從弧線構圖守衛豁免（只放過 apex 0 且 ≤0.1 秒），**問題本身歸 #268 鏡頭跟隨**
- **`UNSTAMPED-BUILD`**：線上版本徽章沒有 commit hash（#66 說要能從截圖追溯，現在追不到）
- **`data/replays` = 0 筆**。我沒有事前數字可對照，**不能保證不是我弄丟的**。owner 若記得之前有回放，要去 backup 找

---

## 3. 🔄 進行中的工作流（重點：怎麼接）

**Run ID `wf_49c4e2f0-490`**，四條領域互斥的 lane，每條配三個對抗性複驗者
（其中一個專門重跑突變驗證）。

| Lane | 領域 | 在做什麼 |
|---|---|---|
| **W1** | `shared/content/{schema,template}` · `editor/forge` | **模板複數套用**（owner 全域要求）：`ability@1.template` 單一 ref → 有序陣列、`expand()` 依序套用 + 展開紀錄、鑄技工坊多選 UI |
| **W2** | `apps/admin` · `content/config` | #277 零驗證 / #278 不是下一場生效 / #279 clamp 靜默吃數字 / 殭屍上限 500 / 攻速上限 10.0 |
| **W3** | `apps/client/{GameApp,render,net}` | zone 剔除 · 接上**已存在的 83 個 LOD 變體** · 修死掉的 `Show ping` |
| **W4** | `shared/sim/{OrderSystem,combatFeel}` | 索敵不對稱做成欄位，**預設維持今天的手感** |

### 已產出但未進版的 32 個檔
`apps/admin/src/{baseBonus,combatFeel,mobWaves}.ts` + 三個新測試 ·
`apps/client/src/render/modelLod.ts` + 兩個測試 · `apps/editor/src/forge/*` + `forgeStudioStack.test.ts` ·
`packages/shared/src/content/schema/{ability,config,template}.ts` · `templates/expand.ts` ·
`packages/shared/src/sim/{combatFeel.ts,systems/OrderSystem.ts}` · `content/config/combat-feel.json`

### 重新開始時怎麼接
1. `git status --porcelain` 看那 32 個檔還在不在（**沒 commit 過**）
2. 想繼續同一輪：
   ```
   Workflow({scriptPath: "…/workflows/scripts/ggd-v0917-four-lanes-wf_49c4e2f0-490.js",
             resumeFromRunId: "wf_49c4e2f0-490"})
   ```
   已完成的 agent 會從快取回來，只有改過的重跑。
3. **先跑全套測試再決定收不收** —— 它的複驗結果我沒拿到，等於這批是**未驗證**的。
4. ⚠️ **收的時候一定要 `pnpm content:build`**（它動過 `content/config/combat-feel.json`）。

---

## 4. 📌 過時資料 —— 已標記，**照 owner 指示沒有刪**

owner 2026-07-31：「有一些過時的資料，記得先 mark 起來，但先不要刪掉」

| 位置 | 過時的東西 | 現在怎樣 |
|---|---|---|
| `docs/_execution-batches.md:433` | 「生命全域倍率 ×8 → ×4」 | ✅ 已改成正確值並註明歷程 ×3→×4→×6→**×9** |
| `docs/_attribute-derivation-248.md:52` | 「血量 ×8.0 / 魔力 ×3.0 / 回魔 ×4.0」**三個全錯** | ✅ 已改（實際 9.0 / 1.0 / 8.0）。那是「本文數字怎麼讀」的前言，下游全繼承了錯誤 |
| `docs/_requirements-audit-gaps20260723.md:199,205` | 「已改 maxHealth ×4」「目前 maxHealth ×4」 | ✅ 已改標成「當時」 |
| `docs/_audit-285-rerun.md`、`_execution-batches-history-*`、`_session-handover-2026-07-29.md` | 大量 ×3.0 / ×4.0 的敘述 | ⚠️ **刻意不動** —— 那是稽核與歷史紀錄，「當時是 ×4」是證據不是錯誤 |
| `content/assets/icons-pixel/` | 142 個零引用檔 | ⚠️ **沒刪**（不進 bundle，刪它是淨整理，等 owner 一句話） |
| `godie-h01o.passive` | 孤兒（變身不重指 `passiveSlot`） | ⚠️ **沒刪** —— 這是**功能缺口**不是垃圾檔，刪掉會讓缺口消失在雷達上 |
| `godie-e00u` 十六夜Sakuya / `godie-u01f` | owner 2026-07-30 說要下架 | ⚠️ **還沒執行** |

### 🛡️ 防止再腐爛的守衛（新增）
`tools/todo-check/src/docEnvTruth.test.ts` —— 掃「會被當成現況讀」的四份文件，
把它們引用的 combat-env 倍率跟 `content/config/combat-env.json` 對帳，不一致就紅。
- 一行只要自己寫「當時 / 之前寫著 / 曾經 / 歷史」就放過（保護歷史紀錄）
- 有 GUARD-THE-GUARD：抓不到任何宣稱也算紅
- **突變驗證過**：把 maxHealth 改回 4.0 → 紅；還原 → 綠；檔案 byte-identical
- ⚠️ 它上線第一次跑就抓到我肉眼漏掉的第四處（`:205`）

---

## 5. 下一輪的批次（完整版在 `_execution-batches.md`）

**可平行**：第一批（模板複數套用）＋ 第四批（後台）＋ 第六批（延遲第一層）
**必須排隊**（共用 `content:build`）：1-D → 2-A → 3-A → 3-C

1. **模板複數套用** ← 擋住其他技能工作（W1 已開工）
2. on-attack 條件系統的**內容**採用（機制已上線，13 個成員 0 採用）
3. 傳說武器擴充 ← **其實 v0.9.16 已做完**（池子 20→24，四類定位全在 `starter.go`）
4. 後台三洞 + 兩上限（W2 已開工）
5. #230 VFX 真實引用普查（106 支原作特效閒置）
6. 延遲第一層（W3 已開工）
7. 戰場任務 #262 / #263

### ⛔ 等 owner 裁決
分母 696 vs 592 · `autoEngage` 預設 `true` · `heightY` 改 229 支觀感 ·
火圈吃不吃護盾（`FireRingSystem.ts:98` 直接寫 `hp.hp -= dmg`，**繞過整條傷害佇列**）·
`icons-pixel/` 刪不刪 · #209 魔法老師編號 15 vs 82

---

## 6. 這一輪我判斷錯、值得記下來的

1. **「主機沒被我動到」——錯。** 失敗的 pull 已經寫了 170 個檔。
   → 教訓：**pull 報錯不等於沒有副作用**，checkout 階段的錯誤代表它已經寫了一部分。
2. **「不是我造成的」——對一半。** game-server 開機載入記憶體（不受影響），
   但 client 每次開頁面即時抓 `content/`（被我弄壞）。
   → 教訓：**同一份檔案對不同服務有不同的生效時機**，回答「有沒有影響」要分服務講。
3. **「bundle 裡找不到 `resolveToPickable` 所以新 client 沒上去」——錯。**
   那是模組內函式，壓縮時會改名。
   → 教訓：**用時間戳/映像建立時間判斷部署，不要用壓縮後的字串**。
