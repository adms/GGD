# 腳本衛生與公告紀錄：六支閘（2026-09-10）

分支 `worktree-agent-af634fb9427e063f1`（自 main `4413c3c85` 快轉，58 個 commit）。
基準線：7 支測試 **9 條紅**（`/private/tmp/hyg-baseline.log`）。

---

## ⭐ 一、`miniDeployStopsOnBuildFailure` —— 真缺陷，已修

### 具體在哪一行

`scripts/mini-deploy.sh:198`（修前），住在 `roster_coverage_check()` 的
`GGD_DEPLOY_APPLY_STARTER=1` 分支裡：

```bash
r "cd $REMOTE_REPO && docker compose … run --rm platform /seed -starter-union" 2>&1 | tail -3 | sed 's/^/    /'
```

### 失敗時原本會發生什麼

⚠️ ⭐ **根因⛔不是「`$?` 是 tail 的」** —— 這支腳本第 22 行是 `set -uo pipefail`，
⇒ 那個管道的離開碼**一直都是對的**。⭐ 真正的根因與 GH#968 逐字同型：
**離開碼是對的，而 ⛔ 沒有任何人讀它**（⛔ 沒有 `set -e`、那一行 ⛔ 沒有 `|| die`）。

⇒ seed 失敗 ⇒ 只印一行紅字 ⇒ **第 5/6 段照跑**，而它們量的是
「白名單端點還活著」（一個**名詞**）⇒ ⭐ **全部綠**。
⇒ ⭐ **一次失敗的補啟用，與一次成功的補啟用，輸出一模一樣**，
而玩家那邊「選人畫面少人」（GH#1165 的 37 名）原封不動。

⚠️ 這是 GH#968 的**第二個實例** —— 同一支腳本、同一個形狀，build 那一個修好了，
⭐ 而這一個因為住在 opt-in 分支裡活了下來。

### 修法

改走既有的 `run_step`（它 `die`，⛔ 不往下走）。⭐ 選 `die` 而不是 `warn` 是刻意的：
這一段是**操作者明確開旗標要求的修復**，⛔ 不是順帶的讀取
—— 失敗還往下印綠勾，就是替一個沒發生的修復背書。

### ⭐ 行為證據（⛔ 不只是「測試綠了」）

`/private/tmp/hyg-harness.sh`：source 出貨腳本、`r()` 換成會讓 seed 回 1 的假遠端：

```
⛔ 「補啟用官方英雄（starter-union）」失敗（exit 1）—— ⛔ **不往下走**。
HARNESS_EXIT=1 · REACHED_AFTER_ROSTER_CHECK 一次都沒印
```

### 突變（一批一條，挑最承重的）

把那一行改回 `r … | tail -3 | sed` ⇒ 該支第 3 條**紅並指名 `206:`**。改回來，複驗綠。

---

## 二、`shellWideCharVars` —— 已修（⚠️ **本機重現不了**，誠實記下）

`scripts/mini-deploy.sh:188/190` 的 `$n_white）`（`$VAR` 緊接全形右括號）
⇒ 改成 `${n_star}` / `${n_white}` / `${n_short}`。

⚠️ ⭐ **我在這台重現不了那個 `unbound variable`**：bash 3.2 ＋ `LC_CTYPE=C`
下 `echo "（這台啟用 $n_white）"` 正常印出（`/private/tmp/hyg-wc.log`、`LC_ALL=C` 亦同）。
⇒ ⭐ 所以這一支對本機而言是**預防性／可攜性**規則，⛔ 不是我量到的當場故障
（原始事故記在 `scripts/genrun.sh:100`，那是另一個 bash／locale）。
⭐ 修法本身零風險零成本，且它只在**錯誤路徑**上跑 —— ⛔ 平常永遠看不到，
⭐ 而它炸的時候正是你最需要那條錯誤訊息的時候。

---

## ⛔⛔ 三、`guardProseNamesTheGenerator` —— ⭐ **刪了 32 列，而⛔一列都不是被修好的**

### 表面

PENDING 5 列 ＋ GRANDFATHERED 27 列被判「已經修好（或檔案沒了）」⇒ 棘輪要求刪掉。

### ⭐ 真相：分類器**瞎了**，⛔ 不是有人修好了

那 32 句 prose **一個字都沒動**（例：`tools/w3x-import/strip_teamglow.py:26`
仍逐字寫著 `content/champions/*.json`，整檔仍然沒有任何擁有者線索；
`grep` MARKERS／步驟名 ⇒ **零命中**）。

`productOwners()` 判準③是「glob 涵蓋的檔**只要有一個不是產物 ⇒ 整條 glob 回 null**」
（刻意偏漏報）。而社群英雄（`b2-*`）落地之後**實測**：

| 目錄 | 檔數 | ⛔ 不是產物 |
|---|---:|---:|
| `content/champions/` | 154 | **82** |
| `content/abilities/` | 908 | **486** |

⇒ `content/champions/*.json`、`content/abilities/<id>.json` 這一族**寬 glob 一律回 null**
⇒ 那幾句 prose 不再被算成違規。

### ⭐ 反證（⛔ 不是我推測的）

**活下來的那幾列正好都是「具名」產物**：
`extract_ex.py` / `gen_ex_content.py` 寫的是 `content/champions/godie-<rawcode>.json`
（只吃得到 `godie-*`，全部是產物 ⇒ 仍然解析得出擁有者 ⇒ 仍然紅）；
GRANDFATHERED 留下的 16 列同理（`godie-udea.r.json`、`content/config/vfx-families.json`、
`content/champions/_index.json`…）。

### ⇒ ⚠️ **順手發現的真缺口（⛔ 未修，未開票 —— 照規則 6）**

⭐ **這條閘今天對「寬 glob 的產物路徑」結構上失明** —— 而那正是它最該說話的那一種
（`content/champions/*.json` 是本專案誤導源第一名）。
⛔ 本輪柵欄內**不動判準③**：改它是**設計決定**（會把偏漏報翻成偏誤報，
而混合目錄下擁有者可能標錯），⛔ 不該由一條腳本衛生 lane 單方面翻。

⭐ **已把上面整段寫進兩個住處**（知識不可以無聲消失）：
`tools/parallel-gates/guard-prose-pending.json` 的 `_note`、
`guardProseNamesTheGenerator.test.ts` 的 GRANDFATHERED 檔頭。
⇒ ⛔ 下一輪不要把那 32 列讀成「修好了」。

---

## 四、`attributeDerivationDocSuperseded` —— 已修

`docs/_attribute-derivation-248.md` 的 SUPERSEDED 標頭說 champion **71/71 份**，
而出貨是 **153**。⭐ 逐項實測（⛔ 不是抄測試訊息）：

| 標頭宣稱 | 實測 | 判定 |
|---|---|---|
| champion 份數 71/71 | **153**，`critDamage` 全部一致 | ⛔ 過期 ⇒ 改成 153/153 |
| `critDamage` = 1.75 | 153/153 全是 1.75 | ✅ 仍然對 |
| `as` = `{base:4, unlocked:10}` | 同左 | ✅ 仍然對 |

⭐ 同一句話在**兩個地方**（標頭第 34 行 ＋ 內文第 391 行），**兩處都改**
—— 只改標頭會留下同一個謊的第二份。

---

## ⛔ 五、`formPairGateNeverWritesBaseline` —— **⛔ 沒修（柵欄外）**

⚠️ ⭐ **任務表上給我的訊息與實際紅的不是同一條**：
表上寫 `expected 'shallow clone ⇒ 祖先關係驗不到…'` —— 那句話住在
`packages/shared/src/ops/agentsMdIsHonest.test.ts:43`（**另一支測試，不在柵欄內**）。

實際紅的是**校準①（控制組應該綠）**：它把出貨基準線原封不動餵給
`abilityCodeParityForms.test.ts`，而那一支對**真實出貨內容**紅：

```
⛔ 單邊　12-002　只有本體 godie-ewar 動了 —— 變身態 godie-e007 的 12-002 還是舊的
⛔ 單邊　79-03 　只有本體 godie-h01n 動了 —— 變身態 godie-h01o 還是舊的
                （分歧欄位：castTimeSec, castType, effects, manaCost, manaCostTier）
```

⇒ ⭐ **這是真的內容缺陷，而那條閘正在正確地叫**（玩家變身之後用的是變身態那一份）。
修它要動 `content/abilities/`＋`abilityCodeParityForms.baseline.json` ⇒ **柵欄外**。

⛔ **而且我刻意⛔不重生成基準線** —— 那正是這支守衛存在的理由
（GH#854：一個會自己重寫基準線的閘等於沒有閘）。⭐ 基準線是紀錄，⛔ 不是待調整的旋鈕。
⇒ 這一支要等內容側把兩個變身對子同步（或 owner 裁決）才會綠。**基準線已保持未動。**

---

## 六、`playerNoteDeclaredNone` ＋ `playerNoteNoRepeat` —— 已修（同一個根因）

⭐ 兩支紅的是**同一句話的兩半**：`SHIPPED_N` 那道閘（GH#976/#1109）
把「**有人看過了**」與「**沒有人回答**」壓成同一件事。

| 支 | 症狀 | 根因 |
|---|---|---|
| `NoRepeat` ② | 期望 exit 0，實得 **1** | 唯一那句玩家句**發過了** ⇒ `P` 清空 ⇒ `LINES` 空 ⇒ 撞上 `SHIPPED_N` 閘 ⇒ ⛔ **整版公告被擋**，而訊息說「⛔ 沒有一句玩家公告」——⭐ **那是假的，句子有，只是發過了** |
| `DeclaredNone` ②③ | exit 1 ✅ 但 out ⛔ 沒有 `#9999` | `SHIPPED_N` 閘 `exit 1` **在 `MISSING` 那一節之前** ⇒ ⭐ `MISSING` 永遠印不到 |

### 修法（`scripts/release-note-players.sh`，兩處）

1. ⭐ **`DUP` 也是「有人看過」的證據**：通過條件從 `[ -n "$DECLARED" ]`
   改成 `{ [ -n "$DECLARED" ] || [ -n "$DUP" ]; }`，並分別印出各自的理由。
   ⚠️ ⭐ 它與 `DECLARED` 同一類（**這一版有人看過**），⛔ 與「沒人寫」相反 ——
   而在此之前它的唯一出口是**再寫一句新的**，⭐ 而那正是重複公告。
2. ⭐ 閘 `exit 1` 之前**把 `MISSING` 印出來**：它叫人「補 `<票號>`」，
   ⭐ 而它自己一直答得出是哪幾張，⛔ 只是沒有說。

⛔ **沒有為了變綠亂塞公告句**（第一·五守則）：`LINES` 一個字都沒動，
改的只有「這一版要不要被擋下」與「擋下時說不說得出是哪幾張」。

---

## ⚠️ 順手發現，⛔ 未修、未開票（規則 6）

1. ⭐ **`playerNoteNeverEmpty.test.ts` 在 main 上就是紅的**（⛔ 不是我弄紅的 ——
   已用 `git show HEAD:` 取出**原始腳本**實跑複驗：`PRISTINE_HEAD_SCRIPT_EXIT=1`）。
   根因是**兩條閘互相矛盾**：`neverEmpty` 要「沒有票也要發一行」（owner 2026-08-30 常設指令），
   而 `SHIPPED_N` 閘（GH#976）要「有玩家面向 commit 而沒有一句 ⇒ 擋」——
   ⭐ 而 `GGD_PLAYERNOTE_NO_GH=1` 那條路**依定義沒有票** ⇒ `DECLARED`／`DUP` 必空 ⇒ 必被擋。
   ⇒ ⛔ 這需要 owner 決定哪一條贏，⛔ 不是我在柵欄裡挑。
2. `guardProseNamesTheGenerator` 的寬 glob 失明（見第三節）。
3. `roster_coverage_check()` 以 `[ … ] && { … }` 收尾 ⇒ 條件為假時**函式回 1**。
   今天無害（`cmd_deploy` 結尾明確 `return 0`），⛔ 但它是同族陷阱。
4. `cmd_deploy` 結尾**無條件 `return 0`** ⇒ `bad()` 累積的 `FAIL` **不影響離開碼**
   （⇒ 我沒有用 `bad` 來處理 seed 失敗，那會是「印了但沒人讀」的第三個實例）。

---

## 額度與結果

| | |
|---|---|
| `npx vitest run` | **3 次**（基準線 · 驗證 · 突變）—— 上限 3 ✅ |
| `pnpm typecheck` | **1 次**，`TYPECHECK_EXIT=0` ✅ |
| 突變 | **一批一條**（`miniDeployStopsOnBuildFailure`）✅ |
| ⛔ `pnpm skills:sync` | **沒有跑** ✅ |
| ⛔ push／deploy／正式站 | **完全沒有碰** ✅ |
| genguard | `mini-deploy.sh` · `release-note-players.sh` · `guard-prose-pending.json` · 該 doc 全部「沒有產生器擁有者」✅ |

**驗證run：11 支測試 10 綠 / 1 紅**（唯一的紅 = 上面第 1 點，main 既有）。
六支目標裡 **5 支轉綠**，`formPairGateNeverWritesBaseline` 因柵欄外的內容缺陷保持紅。

⚠️ **柵欄備註**：柵欄寫的是 `docs/reference/attribute*` 與 `docs/**SUPERSEDED**`，
而那份 doc 的實際路徑是 `docs/_attribute-derivation-248.md`（標頭才含 SUPERSEDED）。
⭐ 依任務指派它是六支之一、且該測試逐字要求改它，故視為在範圍內。
