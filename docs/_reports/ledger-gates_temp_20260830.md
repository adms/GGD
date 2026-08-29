# GH#876 · msgledger／board 兩支閘「永遠不可能綠」—— 量測與修法

> 2026-08-30 · lane #876 · 柵欄 `tools/board/` · `scripts/message-ledger.sh` · `scripts/ledger_table.py` · `packages/shared/src/ops/*ledger*.test.ts`

---

## 0. 柵欄的一個小更正（先寫，免得下一輪找不到檔）

派工單的柵欄寫 `tools/msg-ledger/ · scripts/ledger*.sh` —— ⛔ **這兩個 glob 一個檔都沒對到**。
msgledger 產生器實際住在：

| 派工單寫的 | 實際 |
|---|---|
| `tools/msg-ledger/` | ⛔ 不存在 |
| `scripts/ledger*.sh` | ⛔ 不存在（是 `scripts/message-ledger.sh` ＋ `scripts/ledger_table.py`） |
| `tools/board/` | ✅ `gen_board.py` · `board.css` |

⇒ 本輪把「msgledger 產生器的那兩支 script」當成柵欄內，⛔ 沒有碰 `docs/_daily/*.md`（那是 444 產物，且不在柵欄裡）。

---

## 1. 基線（動手前量到的，⛔ 不是票文的轉述）

```
$ pnpm -s msgledger:check > ml1.log; echo $?     → 1
$ pnpm -s msgledger:check > ml2.log; echo $?     → 1
$ diff ml1.log ml2.log                            → 完全相同
```

輸出（兩次逐位元組相同）：

```
⛔ 漏了 01:12  我接下來還會多一個給玩家看的 release note 要發佈在 discord…
⛔ 漏了 01:28  你自動發版就發玩家discord 公告就好 但記得不要講實作細節…
⛔ 漏了 01:36  算了 太複雜 我們把目前的票處理完就好…
⛔ 未對票 docs/_daily/2026-08-30.md:12  00:45  不是說好部署是透過 github?…
```

```
$ pnpm -s board:check ×2                          → 1 / 1
ggd-board.html is STALE — rerun: python3 tools/board/gen_board.py
```

### ⭐ 票文的前提**只對一半** —— 兩支的病不一樣

| 閘 | 紅的原因 | 是不是「永遠不會綠」 |
|---|---|---|
| `msgledger:check` | 今天的 transcript **一直在長** ⇒ owner 每講一句就多一則「沒有列」的訊息；而 `msgledger:build` 補進去的列票號是 `⏸ 未對票` ＝ **第二種紅** | ⭐ **是**。一條還在跑的 session 裡，**沒有任何動作能讓它綠** |
| `board:check` | 逐位元組比對只差 **1 行**：`線上 v0.31.9` vs `v0.32.2` | ⛔ **不是**。它是**單純 stale**：`release.sh --tag` 打完 tag 之後，⛔ 工作樹裡沒有任何來源檔改動，而產物當場過期 |

`board` 的 39 行裡只有版號那一格不同 —— **今天的帳本內容是同步的**。
⇒ 它不是形態⑨，它是「**tag 不在工作樹裡**」造成的 stale，而清掉它要跑 `board:build`
（那支在 `skills:sync` 裡，⛔ 併行 lane 一律禁跑）⇒ 對一條 lane 而言仍然是**修不掉的紅**。

---

## 2. 挑了哪一條出路，為什麼

票給了三條。⭐ 挑 **②**，⛔ 但不是票文寫的那個形狀。

| 出路 | 判定 |
|---|---|
| ① 產生器排除當前 session 的 transcript | ⛔ **不行**。判定「哪一份 jsonl 還活著」只能靠 mtime ⇒ 一個**跟著時鐘走**的輸入 ⇒ 閘會變成不確定的 |
| ② 對「只有當日檔在動」放行 | ⭐ **採用**，但改成講得清楚的形狀：**分母**從「今天」換成「**已經結束的每一天**」 |
| ③ 搬去收工才跑的聚合 | ⛔ 要改 `package.json` 與 `skillsSyncCoversGenerators.test.ts` —— **兩個都在柵欄外**；而且它把問題藏起來，⛔ 不是解掉 |

### ⭐ 為什麼②**不是**「放寬成模糊比對」

比對本身**一個字都沒有放寬**。改的是**檢查哪幾天**，而且

> ⭐ **每一天最終都會被硬檢查一次 —— 在它結束的隔天。**

⇒ 一則沒有對票的訊息**逃不掉**，只是它的死線從「當下」變成「明天」。
而「當下」那個死線是**物理上滿足不了的**（transcript 還在長）。

---

## 3. 做了什麼（四個檔）

### ① `scripts/message-ledger.sh` —— `--check` 的分母

| 日子 | 行為 |
|---|---|
| **已經結束的每一天** | 硬檢查。最近那一天（昨天）驗 `漏列 + 未對票`；更早的每一份帳本驗 `未對票`（⭐ 只讀 md，⛔ 不碰 transcript ⇒ 幾乎免費，且是永久棘輪） |
| **今天（進行中）** | ⏳ **印出來但不擋**（exit 0）。⛔ fail-open 但**不靜默** —— 每一則都逐條印，並印出硬檢查它的指令 |
| `--date <D>` **明確指定** | ⭐ 一律硬檢查那一天（⛔ 不看它是不是今天）。部署協定第 1 步用這條 |

⭐ 逃生口（＝一鍵回頭的開關；這是**開發閘**⛔ 不是玩家設定，所以住環境變數⛔ 不是三個住處）：

```bash
GGD_LEDGER_STRICT_TODAY=1 pnpm msgledger:check          # 今天也硬檢查（＝退回舊行為）
bash scripts/message-ledger.sh --check --date 2026-08-30
```

⭐ 順帶把 transcript 掃描改成**一趟掃完要的每一天**（⛔ 不是一天一趟）——
出貨那份 transcript 是 **14GB**，一趟 ≈ 8–26 秒；一天一趟會讓「今天＋昨天」變兩倍。
實測改完之後 `msgledger:check` **8.4 秒**（改之前 26 秒）。

### ② `scripts/ledger_table.py` —— `decided()` 搬進來 ＋ 新增 `--map`

**(a) `decided()` 的假紅**（⛔ 這個不修，②就會被假紅淹掉）

舊判準是 `re.search(r"#\d{2,4}", …)` —— **強制要有 `#`**，而 `#` 是排版⛔ 不是語意。
一開始掃已結束的日子就量到 **5 列已經對到票的列被誤報成「未對票」**：

| 帳本 | 那一格寫的 |
|---|---|
| `2026-08-20.md` × 3 | `447` · `447` · `447 445 446` |
| `2026-08-28.md` × 2 | `860` · `863` |

⇒ 改成「有票號（`#877` 或 `877`）**或** 以 `—` 開頭的理由」＝ 已決定。
⛔ 仍然拒絕：留空、`⏸ 未對票`（兩者都沒有數字）。
⭐ 規則住 `LT.decided()` **一處**，`message-ledger.sh` 與 `--map` 都問它（第〇·四守則）。

**(b) `--map`：填票號在此之前沒有合法路徑**

`--check` 印的修法指示是「把每一列的票號填上」，而：

| | |
|---|---|
| 帳本平時 | `-r--r--r--`（444，產物隔離區） |
| genguard | Write／Edit 一律擋（`msgledger:build` 的產物） |
| `LT.insert()` | 只**附加新列**，⛔ 不會改既有列的票號欄 |

⇒ ⭐ **「填票號」只能靠手動 chmod（CLAUDE.md 逐字禁止）或繞過 genguard。**
一條「紅了而修不了」的閘，與「永遠不會綠的閘」是同一個病的兩半。

```bash
python3 scripts/ledger_table.py --map docs/_daily/2026-08-29.md 13:03 "— 停機通知，不需開票"
```

自解鎖（沿用既有的 `_unlock()`）· 只改**最後一格**（⛔ 不重建整列 —— `cells()` 是解跳脫的，
重建會吃掉內容裡的 `\|`，那正是 2026-08-22 作戰板炸掉的形狀；已驗跳脫保存）·
填了還是不合法的值會**拒絕並說為什麼**。

### ③ `tools/board/gen_board.py` —— `--check` 的**歸因**（⛔ 沒有放寬）

```
ggd-board.html is STALE —— ⭐ **只有版號那一格**：v0.31.9 → v0.32.2
   ⇒ 這是 `release.sh --tag` 打完 tag 的必然狀態（tag ⛔ 不在工作樹裡，所以沒有任何來源檔改動）。
   ⇒ 重生成：bash scripts/genrun.sh board:build
```

做法：拿**產物裡**那一格版號重算一次頁面，一致 ⇒ 歸因為版號；否則 ⇒ 來源文件真的變了。
⚠️ **兩種都仍然 exit 1** —— ⛔ 不可以改成「版號那一格不比對」（一條被放寬的閘等於沒有閘）。

然後跑 `bash scripts/genrun.sh board:build` 把產物補回當前狀態 ⇒ `board:check` **exit 0**。

### ④ `packages/shared/src/ops/messageLedgerScript.test.ts` —— 承重守衛

一條 `it()`：昨天有 `⏸ 未對票` ⇒ **紅**；用 `--map` 填掉之後，**今天仍然有漏列**卻要 **綠**；
`GGD_LEDGER_STRICT_TODAY=1` ⇒ 又紅。

> **突變紀錄（真的跑過）**：把
> `hard, live = [yesterday(TODAY)], (None if STRICT_TODAY else TODAY)`
> 改回 `hard, live = [yesterday(TODAY), TODAY], None`（＝退回「今天也硬檢查」）
> → `× 今天（進行中）漏列不擋…` 紅，訊息指名 `⏳ 漏了 10:30` 不見了。已改回。

---

## 4. 現在的狀態

| 閘 | 之前 | 現在 |
|---|---|---|
| `board:check` | ⛔ 1（訊息看不出原因） | ✅ **0** |
| `msgledger:check` | ⛔ 1（4 條紅，**沒有一條修得掉**） | ⛔ 1（⭐ **1 條紅，而它修得掉**） |

剩下的那一條是**真的**：

```
⛔ 未對票 docs/_daily/2026-08-29.md:79  13:03  馬上要停止了…
```

⚠️ ⛔ **本輪刻意不修它**，兩個理由：
① `docs/_daily/` 不在柵欄裡；
② ⭐ 更重要 —— 「`馬上要停止了` 該對到哪張票 / 該不該開票」是對 **owner 訊息的判讀**，
那是主 session 的事，⛔ 不是一條工具 lane 該替他決定的。

修它一行（工具已經備好）：

```bash
python3 scripts/ledger_table.py --map docs/_daily/2026-08-29.md 13:03 "— 停機通知，不需開票"
```

---

## 5. 撞到但**沒有開新票**的兩件事（owner 2026-08-30：⛔ 不要因為猜測開新票）

1. ⭐ **`scripts/release.sh --tag` 打完 tag 之後應該接 `bash scripts/genrun.sh board:build`。**
   否則每一次發版都會讓 `board:check` 紅到下一次 `skills:sync` 為止，而併行 lane 禁跑 sync
   ⇒ 對它們是修不掉的紅。⛔ `release.sh` 不在本輪柵欄裡。
   （已把這段量測與結論寫進 `gen_board.py::shipped_version()` 的 docstring，下一手看得到。）
2. `docs/_daily/2026-08-29.md:79` 的票號欄（上一節）。
