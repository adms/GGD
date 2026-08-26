# 🔎 #700–#799 open 票逐張查證（唯讀稽核 lane · 2026-08-27 05:00）

**範圍**：`gh issue list --state open` 裡票號 700–799 者，起始 **62 張**。
**方法**：逐張讀 body 的 `## 驗收` / `Acceptance criteria`，**以那一節為判準**，
到 repo 裡驗（grep 實作 / 讀那幾行 / 跑單檔 vitest）。⛔ 不憑標題猜、⛔ 不憑 commit 訊息認定。
**寫入**：只有 `gh issue close` / `gh issue comment` 與本檔。⛔ 沒有動任何程式碼。

---

## 一、結果總表

| 判定 | 張數 | 動作 |
|---|---:|---|
| **DONE**（驗收逐條成立） | **1** | 關閉並附逐條證據 |
| **PARTIAL**（部分成立） | **9** | 留開 ＋ 補「現況」註解 |
| **NOTDONE**（驗收第一條就不成立） | **52** | ⛔ 不動（避免留一句沒有資訊的註解） |

⇒ 收工後 700 號段 open **61 張**；全 repo open **106 張**。

---

## 二、關閉的（1 張）

### `#776` 後台 121 頁沒有搜尋 —— ⌘K ＋ 導覽地圖 ＋ 標籤 facets
五條驗收逐條成立，本輪實跑 `npx vitest run` 五檔 → **24 passed**。

| AC | 證據 |
|---|---|
| 1 中文/縮寫/查無 | `commandPalette.test.ts` 三條（含突變靶「拿掉 SYNONYM_GROUPS 這一條就紅」） |
| 2 最近用過浮前 | 同檔兩條 |
| 3 地圖不重不漏＋寬度單調 | `navMap.test.ts` 三條 |
| 4 `NAV_TAGS` 覆蓋率 | `navTags.test.ts` 四條，母體 `import { LIVE_ROUTES } from "./ui/live"` ＝出貨常數本身 |
| 5 `navSections` 仍綠 | 10 條全綠（含雙向集合相等） |

⭐ 另查**失敗形態⑧**（消費端存在但消費不到）：`App.tsx:1024` `usePaletteHotkey(openPalette);`
**真的被呼叫**、`:1215` `<CommandPalette rows={rows} …/>`、`:1164` `NavMapPage`，
而 `rows`（`:1015`）就是左欄真的畫的那一份 ⇒ ⛔ 不是第二個住處。
commits `373f5d89` · `43c6fcee` · `3e37833a` · `36180a38`。

---

## 三、部分完成、已補「現況」註解的（9 張）

| # | 已成立 | 還沒 | 擋住的是 |
|---|---|---|---|
| **771** | AC2 四支 `writes` 全補完（今天宣告 0 產物的只剩 3 支，全在豁免表）；新閘 `syncIoDeclaresWrites.test.ts` 3 tests 綠、含 sentinel 與突變紀錄 | AC3「三處寫入端自解鎖拆掉」 | ⭐ **它被反過來做了**：`writeProduct.ts` 檔頭現在逐字論證「解鎖的責任跟著**寫的那一行**走」。⇒ 要嘛改票，要嘛補 Scope③ 那條「step 寫了不在自己 writes 裡的檔 ⇒ 紅」對帳閘（**今天不存在**） |
| **767** | 驗收① `fxLongAxisVisibleGeometry.test.ts` 2 tests 綠（問**關係**不問名詞、有 sentinel、母體是全部出貨 `model@1`）。⭐ `revivehuman` 的 `fxLongAxis` 仍是 `"y"` 而閘綠 ⇒ 隱形面片真的被修成看得見，⛔ 不是改宣告蒙混 | 驗收②三性質 | 唯一量過形狀的證據是 **08-26 12:00**，而 additive 修在 **20:57** ⇒ **形狀從沒在修完的版本上量過**。長寬比 2.28（要 ≥6）· 暈/核 1.00–1.02（要 >1.2） |
| **721** | 根因寫進守則；家族按 JASS 重建（`bd24b4af`）；`frames.md` 的「對應原作哪一張」欄格式正確；A/B 有底噪申報 | 形狀一致 | ⭐ **驗收比它要驗的重建早 89 分鐘**（12:00 vs 13:29）。`docs/_reports/shot_visual-proof_20260826-0500/` 不存在。Scope ④AT力場 ⑤世界終結 零證據 |
| **775** | AC1 13 頁齊（`LIVE_ROUTES` 13 列、`datasets/` 14 支含 ping）· AC2 `adminLiveDatasets.test.ts` 逐支 build 過 · AC4 兩頁真的畫 SVG | AC3 前半「沒有任何一組 > 20 頁」 | **`SEC_SYS`＝24 頁**（票自己記的基準是 23，又長一頁）。⭐ 而且**沒有閘在數每組頁數** ⇒ 這條 AC 今天是散文 |
| **706** | 四處裡三處補了真閘並改了註解：`configFacadeSurface` · `statNormalizationShipped` · `reviveShipped`（3 passed） | 第 4 處 public route 對帳閘 | `announcements.ts:18` 今天仍逐字 `publicFeedReaders.test.ts never landed — GH#706`。票自己的 Known risks 就說它「可拆後票」 |
| **707** | ⭐ **症狀消失了**：normalizer-only 檔案 **0 份**（其中鎖著的 0 份）；票點名的 `godie-e00l.r.json` 今天 genguard 判 AUTHOR＝`skillremake:provenance`，與 444 說法一致 | 三條 Scope 一條都沒落地 | ⭐ **消失的原因是 #771 的戶籍重量測（副作用），⛔ 不是修好**。`product-quarantine.sh` 對 normalizer 零命中 · genguard NORMALIZER 分支訊息**零提 444** · `productQuarantine.test.ts` 對 normalizer 零命中 ⇒ 類別一旦再長出成員，矛盾原封不動回來且不會有東西紅 |
| **768** | ⚠️ **票的前提要修一半**：`beamAudition.ts:336-350` 有 `calibrate()`（量到 0 就 throw），`:546` 建台時真的跑一次 —— 但那是 **#767 `76d098c5` 的既有物** | AC1 `measure()` 自己自證 · AC2/AC3 守衛 | `:325-333` 的 `measure()` 全文只有 render×2 + readPixels，量到 0 照樣回 `lit:0`；`auditionCalibrates.test.ts` 不存在 ⇒ 拿掉 `:546` 那一行不會有東西紅（失敗形態③） |
| **731** | Scope④ 六列假 dispatched 改真：`taunt`/`charge`/`free-move`/`thanks`/`thumbs-up`/`watch`，且守衛母體含 `PERFORM_VOICE_CATEGORIES` | ①②③ | `retreat`/`love`/`puzzled`/`respond.ok`/`respond.no` 五列仍 `dispatched: false`；`pingWheel\|commsWheel\|commsRadial` 全樹零命中；lobby 無 `playContextualVoice`。⭐ ④只是把帳本上的謊話改成真話 —— **玩家聽到的一個都沒變** |
| **754** | 兩份引用產物存在；舊票 **超額**收斂（`#<300` 只剩 1 張） | 「建議下一波」A/B/G 三批 | 一批都沒收；open 總數 99 → **106**（方向往上）。⭐ 它正在複製 CLAUDE.md 逐字禁止的「排版次」形狀 |

---

## 四、NOTDONE（52 張，⛔ 未留註解）

⚠️ 這 52 張**每一張都逐條驗過**，⛔ 不是「看起來是新票所以跳過」。
它們的共同形狀：**驗收的第一條就不成立**，而且多半是一行 grep 就判得出來的。

```
793 792 791 777 774 773 772 770 769 766 765 764 763 762 761 760 759 758
757 756 755 753 752 751 748 747 746 745 744 743 742 741 740 739 738 737
736 734 733 730 729 727 726 725 724 723 722 718 717 716 715 713
```

抽樣的判定證據（每張都有，此處只列可代表的幾條）：

| # | 一行判死的證據 |
|---|---|
| 716 | `wc -l apps/client/src/GameApp.ts` = **4341**（開票時 4,336，**不減反增**；AC 要 <4,000） |
| 713 | `vfx-families.json` 的 `abilities` 313 鍵裡 **94 鍵**在 `content/abilities/` 無檔 —— 票說 4 支死列，**實際 94 支** |
| 717 | `grep -rl loadContentCached apps/` = **0**（Redis 內容快取在執行期仍零消費端） |
| 758 | `grep -ci superseded docs/_attribute-derivation-248.md` = **0**（AC 要 >0） |
| 759 | `versionBadgeBand.test.ts:269` 的 `GUTTER_INTRUDERS` **仍非空**，且 `latency-visibility.md:115` 仍寫 `in-progress` |
| 745 | 實測 51 隻近戰裡 **29 隻**無 weapon tag（與票逐字相符），`BasicAttackSystem.ts:147` 仍落回 `"sword"` |
| 723 | `loader.ts:173/195` 的 `validateReferences(store)` 仍早於任何展開（loader 全檔沒有 expand 呼叫） |
| 722 | 全樹 `pickAllyAt\|allyUnitsFor\|nearestAlly` = **0 命中** |
| 760 | `snapshot.ts:406-407` 實體迴圈唯一的 `continue` 是 `auraCarrier`，**零 zone 剔除** |
| 744 | `GENERATE.sh` 27 個 `synth`(吐 wav) vs 磁碟 **0 個 .wav / 32 個 .mp3** ⇒ 重跑即 27 個 404 |

---

## 五、⭐ 最重要的一個發現

### 「已修」的宣稱與「驗收過了」的宣稱，在票上長得一模一樣 —— 而 #767/#721 是同一個病的第二個載體

CLAUDE.md 已經記過這個形狀兩次：
**票裡 owner 的原話與我的推測長得一樣** ⇒ 幾小時後被自己當成需求引用；
**模板 `params[*].default` 裡的推測** ⇒ 變成「原作就是這樣」。

⭐ 這一輪量到**第三個載體：證據檔的時間戳**。

`#721` / `#767` 兩張票各自有 commit、有報告目錄、有逐格量到的數字 ——
看起來完全像「做完了」。但把時間軸攤開：

```
11:32  根因寫進守則                  ✅
12:00  📄 連續圖片驗收（唯一量過形狀的一份）
13:29  🔧 光束砲家族按 JASS 真相重建   ← ⭐ 驗收在這之前 89 分鐘
20:57  🔧 additive 改 ALPHA_ONEONE（亮度 75 → 238）
21:50  📄 stockglow 報告（只有亮度/飽和度，⛔ 沒有 aspect / 暈:核）
```

⇒ ⭐ **那份「驗收」描述的是一個已經不存在的版本。**
而任何人（包括下一輪的我）打開 `beamverify_visual-proof_20260826-1200/frames.md`，
看到的是一份格式完美、量尺自證過、逐張對位原作的報告 ——
**它唯一的問題是它比被驗的東西早了 89 分鐘，而那件事只寫在檔名裡。**

⚠️ 這比「沒有證據」更危險：沒有證據時我會說「未驗收」；
**有一份過期的證據時，我會說「已修」** —— v0.26.0 的「電弧回歸」就是這樣寫出來的。

### ⇒ 可以當場檢查的規矩（建議進 CLAUDE.md 的 👁 節）

> ⭐ **一份 `*_visual-proof_*` 報告要記下它量的那個 commit（`git rev-parse HEAD`），⛔ 不是只有日期。**
> 引用它當「已修」的證據之前，先問「**這個 hash 是不是 HEAD 的祖先，且中間沒有動過被驗的那條鏈**」。
> 答不出來 ⇒ 那份報告只證明了歷史，⛔ 不證明現在。

⭐ 它可以是閘，⛔ 不必是散文：`scripts/visual-proof.sh` 已經在掃 `@visual-proof` 標記與
可見性斷言詞彙，**再加一問「報告目錄裡有沒有 `COMMIT` 檔，且它是 HEAD 祖先」** 即可。
成本一行，而它擋住的是這一輪在 **兩張[緊急]票**上同時發生的事。

---

## 六、另外三件順帶量到的（⛔ 未開票，交給 owner 排序）

1. **`SEC_SYS` 24 頁 > 20** —— `#775` AC3 的門檻**沒有任何閘在守**（`navSections.test.ts` 十條都不數頁數）。
   ⇒ 加第 11 條棘輪閘（只能變小），否則下一頁加進去時不會紅。
2. **`#707` 的類別今天是空的（0 份）** —— 這是**最好加閘的時刻**：
   一條斷言「normalizer-only ∧ locked 的集合為空」今天就是綠的，而它守的正是「再長出來時當場紅」。
3. **`/private/tmp/ggd-triage/` 有兩條 lane 在共用** —— 本輪開工時寫進去的 62 份 body 快取
   被另一條稽核 lane（`#300–#699`，目錄裡是 `325.json`…`699.json`）清掉，
   三個子 lane 因此都撲空、改用 `gh issue view` 重抓（結論不受影響，成本多了三次重抓）。
   ⇒ ⭐ 暫存目錄要帶 lane 名（`{用途}_temp_{timestamp}` 那條規矩的同一個理由）。
