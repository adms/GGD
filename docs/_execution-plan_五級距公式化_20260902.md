# 執行計畫：五級距全面公式化 ＋ 平行化編排（2026-09-02）

## ⭐⭐ 0. 大方向與角色分工（⛔ 每張票動手前先讀這一節）

> owner 逐字：「**開放讓玩家自己設計 英雄、技能、特效，不是靠 AI 無止境的逼近太沒效率**」
> 「所以**後台編輯器的抽象化、完整性、視覺化可操作性很重要**，因為所有功能都要可 JSON 操作設定，
>  並且也有 **no code 遊戲引擎等級的操作介面**」
> 「並且盡量**特效模組化 像 JASS 一樣可以呼叫設定 來拼湊組合**，並非每個技能都一個特定特效」

### ⭐ 角色分工

| 誰 | 角色 | 負責 |
|---|---|---|
| **[後台編輯器 ＋ Codex 編輯器]** | ⭐ **堆積木** —— 要充分了解有哪些積木 | 八招成品 · 時間軸 · 配色 · 鏡頭 · 拖拉介面 · 視覺驗收 · 反覆調整 |
| **[Main 遊戲主程式]** | ⭐ **做出積木供人使用** | 可重用 primitive · runtime 行為 · 限制 resolver · 機器契約 |

⇒ ⭐ 只有當某個積木在 **JSON 語意上根本表達不了**時，Editor 才交一張**最小 primitive 票**給 Main，
⛔ 而且那張票**不可以要求 Main 幫忙拼完整技能**。

### ⭐ 每張票先過一次「角色分流」

問一句：**這張票缺的是「一塊積木」還是「一次拼裝」？**

| 判定 | 誰做 | 怎麼收 |
|---|---|---|
| 缺**積木**（沒有這個 effect kind / hook 事件 / 條件葉 / 表示形標籤 / resolver） | ⭐ **Main** | 做 primitive ＋ 一條承重守衛 ＋ `pnpm editorcov:build` |
| 只是**拼裝**（積木都在，只是這支技能的 JSON 沒拼或拼錯） | ⛔ **不是 Main** | 寫下「用哪幾塊積木拼得出來」，標 `editor-scope` 關掉 |

⚠️ 判準是**能不能用現有標籤表達**，⛔ 不是「這件事大不大」。
⚠️ 「為某支技能寫一個 `if`」永遠是越線 —— 那個 `if` 應該是一個**條件葉**。

### ⭐ 「收掉」的四種結局（⛔ 沒有第五種）

| # | 結局 | 動作 |
|---|---|---|
| ① | 做完 | `gh issue close` ＋ `bash scripts/ticket-progress.sh` 帶 `--commit <sha>` 與 `--player` 一句 |
| ② | 前提回驗發現**已經完成** | 直接關，留言寫下是誰在什麼時候做的 |
| ③ | 分流判定是**拼裝** | 標 `editor-scope`，寫下用哪幾塊積木拼得出來，關掉 |
| ④ | ⭐ **做成後台開關收掉** | 能落地的一半上線，剩下的做成預設關閉的開關，**關票** |

### ⭐⭐ 卡住怎麼辦 —— 三階，⛔ 每一階都往前走，⛔ 沒有一階是停

> owner 逐字：「**有問題就做成後台開關可以 rollback 就好，而不是碰到困難停下來**」

| 第幾次卡住 | 做什麼 |
|---:|---|
| **1** | ⭐ **換一個做法**（不同機制／不同切入點／不同的檔），⛔ 不要重試同一條路 |
| **2** | ⭐ **縮小範圍** —— 做得到的那一半先落地並上線，剩下的寫進票的留言 |
| **3** | ⭐ **做成一格後台開關**（三個住處：`content/config/*.json` ＋ Zod `DEFAULT_*` ＋ admin `SHIPPED_*`），預設挑最好的那個、可一鍵 rollback、加一條承重守衛 ⇒ **關票**並寫下「開關叫什麼、剩下的一半是什麼」⇒ ⭐ 走下一張 |

⛔ **任何情況都不要停下來等 owner**，⛔ 不要把票留在 open 等裁決。
⛔ owner 的系統倍率（`content/config/owner-knobs.json`）擋住 ⇒ 做在**它旁邊的新開關**上，⛔ 不動它本身。

### ⛔ 輸出紀律（⚠️ 這條管**說話**，⛔ 不管工作）

⛔ 不要輸出與上一則**等值**的訊息。沒有新進展就**不要說話，直接做下一步**。
⭐ 要說就說**新的東西**：哪一張關了、哪一格開關叫什麼、哪一個前提被推翻了。

---

> ⭐ 量測基礎：54 張開票 · 248 個被點名的檔 · 濾掉工具檔後 11 個連通分量。
> ⭐ 關鍵判準：「這張票不做 **Codex/編輯器**會不會卡」⛔ 不是優先級 tag。

## 0. 為什麼五級距是關鍵票（證據）

`docs/editor-contract/ggd-editor-coverage.json`（4,983 格）裡兩者並排：

```
{"group":"effectFieldPath","name":"amount.damageTier"}    ← ⭐ 契約有 14 種 *Tier ⇒ 渲染成五格下拉選單
{"group":"effectFieldPath","name":"amount.ratios.coeff"}  ← ⛔ 只是一個欄位路徑 ⇒ 空白數字框
```

⇒ ⭐ 玩家在編輯器裡設計技能時，AP 加成是「請自己填一個數字」，
⛔ 而沒有東西告訴他 0.1 與 7.0 差 70 倍 ⇒ **這就是 no-code 介面失敗的樣子**。

## 1. 五條 lane（柵欄互斥，可同時跑）

| Lane | 票 | ⛔ 為什麼不能再拆 |
|---|---|---|
| **L1 第十一回合** | 909 918 919 920 921 922 923 924 925 | `content/config/arena-rules.json` **8 張撞** · `arenaRules.mobWaves.ts` 7 張 · `admin/mobWaves.ts` 7 張 |
| **L2 五級距/係數** | **948 → 943 → 942** → 941 944 929 936 938 → **945**（最後）→ 937 946 928 906 | `dynamicTerms.ts` 4 張 · `_shared.ts` 4 張 |
| **L3 積木/表示形** | **650 → 940 → 916** → 900 935 934 951 547 623 | `schema/common.ts` 4 張 |
| **L4 w3x 匯入** | 699 753 803 880 | ⭐ 完全獨立的連通分量 |
| **L5 小票並行** | 734 883 888 903 905 908 917 927 949 | ⭐ 互不相干 ⇒ 可各自一條 |

## 2. ⭐ 橋檔 —— **只有主 session 能改，lane 內一律不碰**

```
apps/admin/src/configForms.ts                          (4 張)
apps/game-server/src/match/MatchController.ts          (4 張)
packages/shared/src/sim/components.ts                  (5 張)
apps/client/src/GameApp.ts                             (3 張)
packages/shared/src/content/import/contractIndex.ts    (3 張)
packages/shared/src/content/schema/ability.ts
packages/shared/src/content/schema/schema/common.ts    ← ⚠️ L2(#943) × L3(#940/#951) 唯一接觸點
packages/shared/src/sim/content/condition.ts
tools/review/middleware.mjs
apps/admin/src/store.ts · apps/admin/src/ui/App.tsx     (既有的兩個)
```

## 3. 執行順序

```
Day 1  L2: #948 → #943      ｜ L3: #650 → #940      ｜ L5: 9 張小票（先前提回驗）
Day 2  L2: #942             ｜ L3: #916             ｜ L4: 4 張
Day 3  L2: #941 #944 #929 #936 #938 → #945          ｜ L1: 第十一回合 9 張（序列）
收尾   主 session 改橋檔 → pnpm skills:sync → editorcov:build → noStrandedLaneCommits
```

## 4. 硬規則（每條 lane 都適用）

- ⛔ `pnpm skills:sync` 是**全域鎖** —— 平行時全部禁跑，主 session 最後跑一次（`--check` 唯讀，隨便跑）
- ⛔ commit 一律 `git commit -F msg.txt -- <逐檔 pathspec>`，⛔ **不要 `git add`**（index 全域共用）
- ⛔ 動 `content/` 前一律 `bash scripts/genguard.sh <path>`（621 份是產物）
- ⛔ 突變驗證用 `python3 scripts/edit-or-die.py`，⛔ 不要 `python3 -c "…replace…"`
- ⭐ 動 schema 或註冊表之後跑 `pnpm editorcov:build`（4,983 格要跟著長）
- ⛔ 讀離開碼寫 `cmd > log 2>&1; echo "EXIT=$?"`，⛔ 不要 `| grep` / `| tail`
- ⚠️ 任何指令 >5 分鐘沒新輸出 ⇒ `ps` 看 CPU，0% = 掛了
