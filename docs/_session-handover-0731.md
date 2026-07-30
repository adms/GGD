# 交接 · 2026-07-31（v0.9.16 出貨後暫停）

> owner 說「暫時關機暫停這個 session」，這一份就是**下次說「重新開始」時要先讀的那一頁**。
> 架構與長期現況看 [`_session-handover.md`](_session-handover.md)，
> 批次計畫看 [`_execution-batches.md`](_execution-batches.md)，
> owner 的逐條裁決看 [`_owner-corrections-0731.md`](_owner-corrections-0731.md)。

---

## 1. 這個 session 停在哪裡

| 項目 | 狀態 |
|---|---|
| main | **v0.9.16 已合併、已推、已標籤** |
| 全套測試 | **3 條已知紅**（`settlement` 贏家淘汰廣播 —— HEAD 就有；`autoAcquire` ×2 —— 前一條 lane 刻意留紅）。其餘 5,400+ 條綠 |
| 型別 | 綠（`pnpm typecheck` EXIT=0）— ⚠️ 一定要看**離開碼**，`\| tail` 會偷走 `$?` |
| 線上 ggd.adms.ai | ⛔ **仍是 v0.9.15（`cba64c28`）—— deploy 卡住，需要 owner 本人** |
| 進行中的工作流 | **零**。所有 agent / workflow 都已收工，沒有背景任務在跑 |

---

## 1b. ⛔ deploy 卡在哪裡（**下次第一件事就是解這個**）

**症狀**：在 `can@34.81.104.163` 上 `git pull` 一律回
「Please make sure you have the correct access rights and the repository exists.」
`HEAD` 停在 `cba64c28` = v0.9.15。

**根因（已查清，不是猜的）**：
1. 遠端 `~/.ssh/` **只有 `authorized_keys`，沒有任何私鑰** —— 那台機器自己無法對 GitHub 認證。
2. 本機 `ssh-add -l` 回 **「The agent has no identities.」** —— 所以 `ssh -A` 轉發過去的是一個**空的** agent。

⚠️ 這就是 CLAUDE.md 警告的那個誤導訊息：它看起來像權限/repo 問題，實際上是**沒有金鑰可用**。
⚠️ 而且它跟「pull 要在前景做」是**兩回事** —— 這次 pull 就是在前景做的，一樣失敗。

**owner 需要做的（二選一，我不能代做，因為那是你的憑證）**：
- 在本機把 GitHub 金鑰載入 agent：`ssh-add ~/.ssh/<你的 github key>`，然後叫我重跑 deploy；或
- 在那台主機上放一把 **deploy key** 並登記到 GitHub repo，之後就不需要 agent 轉發。

**確認金鑰可用之後的 deploy 步驟**（映像是在主機上 build 的，五個容器：
edge / platform / game / redis / caddy）：
```
ssh -A can@34.81.104.163
cd GGD && git pull --ff-only origin main   # 前景做完
# 再把 build/restart 丟背景
```

---

## 2. 「重新開始」時的第一件事

按這個順序，不要跳：

1. `git log --oneline -5` + `git status --porcelain` — 確認樹是乾淨的，
   確認**沒有別的 session 在我睡著時 commit 過**（這件事真的發生過）。
2. 讀 `docs/_execution-batches.md` 的 **「🎯 接下來的批次」**。那一段已經是排好的，
   **第一批（模板複數套用）擋住其他技能工作**，不要先做第二批。
3. 讀下面第 4 節「還沒做的事」，那是我離開時心裡真正還掛著的清單。

---

## 3. v0.9.16 這一版做了什麼（一句話版）

**owner 2026-07-31 的七條修正全部落地，而且每一條都有「改壞就會紅」的守衛。**

最值得記住的三個技術決定：

1. **`pctMult` 才是「跟著裝備走的倍率」。** `statPipeline` 是
   `(base + Σflat) × (1 + ΣpctAdd) × Π(1 + pctMult)`。
   「防禦 ×2」寫成 `pctAdd 1.0` 只有在**沒有其他 pctAdd 來源**時才等於 ×2；
   寫進第二形態的 `baseStats` 更糟 —— 那等於**變身瞬間丟掉所有裝備防禦**。
   ⚠️ 下一次看到「×N 倍」的需求，先問這一題。

2. **「在 A 時刻結算、在 B 時刻送出」需要一個存款。**
   13-002 揍敵客 EX 燒光法力，追加傷害卻由幾秒後的免費牙突送出 ——
   那時 `hp.mana` 已經是 0，任何在傷害那一刻讀法力的公式都算出 0（失敗形態②）。
   解法是三個欄位：`spendMana.bankAs` → `StatusEffect.magnitude` →
   `damage.bankedBonus`。**通用機制，不是為這一支寫死的。**

3. **守衛自己也會壞掉，而且是無聲的。**
   `fieldAdoption` 的 GUARD-THE-GUARD 因為 `zStatModifier` 長出一個 `from` 欄位，
   走訪器的「兄弟塌縮」把 `stat` 與 `from` 都改名成 `*`，
   那條 `key.includes("].stat=")` 的過濾器**變成空集合**，
   底下每一條斷言都跟著變成真空。**它是被自己抓到的。**

---

## 4. 還沒做的事（誠實清單，不要當成做完了）

### 🔴 owner 的全域要求，還沒開工
- **模板複數套用**：「一支技能同時套多張模板卡」。
  今天 `ability@1.template` 是**單一 ref**，而且 `fieldAdoption` 記錄它是
  **0 採用** —— 沒有任何一支出貨技能是用模板表達的。
  → `_execution-batches.md` 第一批 1-A ~ 1-D。

### 🟡 機制上線但內容是 0（S8 形態，30 天後 `fieldAdoption` 會再紅一次）
- **條件系統的 13 個成員**：三個比較運算子（`!=` `<=` `==`）＋十個屬性軸。
  今天只有 `hp` 有出貨採用（59-00 暴走、52-00 十二道試煉）。
- **擊退的六個子欄位**全部靠程式預設（那是對的，但要知道它們沒被行使過）。
- **`whileForm: "base"`**：「變身後就失去」的天生技一支都沒有。

### 🔴 出貨時仍紅的三條（不是忘了，是查完決定出貨的）
1. **`settlement` 贏家收到淘汰廣播** —— 在乾淨的 HEAD worktree 上驗證過，**v0.9.15 線上已經帶著它**。修它要動 #193 的名次判定
2. **`autoAcquire` IDLE / frozenTicks** —— 前一條 lane 的檔頭明文「留紅，不要用放寬期望蓋掉（e34339b7 因此被 revert）」。
   真正的缺口是「**bot 不會主動去打站著不動的玩家**」
3. ⚠️ 順手發現：索敵半徑不對稱 —— 卡住 48 / 站著 6。**要不要讓 idle 也吃 seekRadius 是決策點，應做成欄位**

### 🟠 等 owner 一句話
1. 模板覆蓋率的分母：**696 vs 去重後的 592**
2. **`autoEngage` 出貨預設**目前是 `true`（會搶玩家方向盤）
3. **#230 的 `heightY` 視覺改動**：會同時改 229 支技能的觀感
4. **火圈要不要吃護盾** —— `FireRingSystem.ts:98` 直接寫 `hp.hp -= dmg`，
   **繞過整條傷害佇列**，所以護盾今天完全擋不住火圈
5. **`content/assets/icons-pixel/` 142 個零引用檔要不要刪**（不進 bundle，刪它是淨整理）
6. **#209 魔法老師是哪一隻**：編號 15 vs 82

### ⚪ 已知但刻意沒動的
- **`godie-h01o.passive`（黑崎一護變身態的天生技）是孤兒** ——
  `godie-h01o` 的 champion doc 只有 Q/W/E/R，沒有 PASSIVE 槽。
  ⚠️ **這是功能缺口不是垃圾檔**：變身不會重新指向 `passiveSlot`。
  用「刪掉那個檔」來修它是錯的方向。
- **`godie-e00u` 十六夜Sakuya / `godie-u01f`** 的下架還沒執行（owner 2026-07-30 說要下架）。

---

## 5. 這個 session 學到、值得帶去下一次的東西

1. **背景任務通知的離開碼是「整串包裝命令」的，不是你關心的那個指令的。**
   `(pnpm test > log; echo "EXIT=$?" >> log)` 丟到背景 → 通知永遠回報 0，
   因為最後一個指令是 `echo`。**一律去 log 裡撈 `TEST_EXIT=`。**
   同一個陷阱的第二種變形：`pnpm typecheck | tail -5; echo "EXIT=$?"` → `$?` 是 `tail` 的。

2. **「測試全綠」與「型別全綠」是兩件事**，兩個都要跑。

3. **突變驗證要驗到「改壞真的會紅」，不是「我覺得會紅」。**
   這個 session 抓到三條假守衛，都是「刪掉關鍵那行還是綠」。

4. **不要用刪除來修「零引用」。** 先問它為什麼零引用 ——
   `godie-h01o.passive` 的零引用是變身系統的缺口，刪掉會讓缺口消失在雷達上。

---

## 6. 環境備忘

- 部署：`ggd.adms.ai`（GCP，asia-east1）。
  ⚠️ `ssh -A … 'nohup bash deploy.sh &'` **一次做完 pull+build 會失敗** ——
  ssh 一斷線轉發的 agent socket 就沒了，`git pull` 會報誤導人的
  「correct access rights / repository exists」。**pull 在前景做完，build 才丟背景。**
- ⛔ **測試一律 localhost 或 `/private/tmp`，永遠不要在正式站上測。**
- 每一次 `content/` 編輯都要 `pnpm content:build`，否則 `bundle.test.ts` 紅。
- 不要 `git add -A`。
