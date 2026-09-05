# GH#988 Scope 2 · 3 —— `AGENTS.md` 的閘與五份「先讀」文件的檔頭

2026-09-05 04:31 · 一條 lane · ⛔ 未 commit（留在工作樹）

---

## 0. 做了什麼

| Scope | 動作 | 狀態 |
|---|---|---|
| **2** | 新增 `packages/shared/src/ops/agentsMdIsHonest.test.ts`（78 行，含哨兵） | ✅ 綠 |
| **3** | 五份「先讀」文件檔頭各加一行 | ⚠️ **4/5** —— `CODEX_TYPE_HANDOFF.md` 被 genguard 擋下，⛔ 沒動 |

---

## 1. Scope 2 —— 閘的形狀

⭐ **三條檢查住同一支 `audit()` 函式** ⇒ 真檔與哨兵走的是**同一條路**
（⛔ 不是失敗形態⑤：測試自己造一個虛構通道）。

| # | 驗什麼 | 分母（⛔ 不抄字串常數） |
|---|---|---|
| ① | 每一個 `pnpm <script>` | 真的讀根 `package.json` 的 `scripts` |
| ② | 每一個 `bash scripts/<x>.sh` | 真的 `existsSync` |
| ③ | §3 表列的 packet 欄位名 ⊆ coord 契約 | `tools/coord/schema.mjs` 的 `REQUIRED` ∪ `FORBIDDEN`（動態 `import`）**＋** `check.mjs` 真的讀到的 `packet.X` / `c.X` |

### 今天量到的母體

```
pnpm:   bricks:check · coord:check · editor:accept:release · editor:accept:visual
        · skillforge:visual-advisory:check · skills:check          → 6/6 都在
bash:   scripts/genguard.sh · scripts/genrun.sh                    → 2/2 都在
§3 欄位: kind · dedupeKey · contractFingerprint · baseCommit · claims
        · evidence · unblocks · ownerQuotes · status                → 9/9 都認得
```

### 哨兵（⭐ 這是它的自證，⛔ 不做突變）

自造一段假的 AGENTS.md 文字（`pnpm nope:check` ＋ `bash scripts/nope.sh` ＋ 一列
`` `nopeField` ``）餵進**同一支** `audit()`，斷言：
- 三種缺陷**都被指名**（`toHaveLength(3)`）
- ⭐ **而同一張表裡真的欄位 `kind` ⛔ 不被誤判** —— ⛔ 只驗「會紅」證明不了它沒擋過頭

---

## 2. ⭐ 最重要的一個發現：`evidence` 沒有住處

`tools/coord/schema.mjs` 的檔頭逐字寫著它是「**欄位表的唯一住處**」，並且
「⛔ 不要在 `check.mjs` 裡再抄一份欄位名：那是第二個住處，而它會安靜地漂」。

⚠️ ⭐ **而 `evidence` 在 `schema.mjs` 裡一個字都沒有** —— 它只住在 `check.mjs`
（`check.mjs:118` `c.evidence`、`check.mjs:217` `packet.evidence`）。
`unblocks` 好一點，但也只以註解裡的 `` `unblocks[]` `` 出現，⛔ 不是一個可程式讀取的宣告。

⇒ ⭐ **`schema.mjs` 只宣告了「必填」與「禁止」，⛔ 沒有宣告「選填」** ——
所以票文那句「⊆ schema.mjs 的必填／選填欄位」今天**字面上做不到**：
照字面實作，`evidence` 會讓這條閘一落地就紅。

**這一輪的處置**（⭐ 量現況，⛔ 不替它辯護）：
第 ③ 條的分母 = `schema.mjs` 宣告的 ＋ `check.mjs` **真的讀到的屬性**。
這仍然是量出來的（⛔ 不是手寫名單），而且它問的是**對的那個問題**：
「AGENTS.md §3 答應 Codex 的欄位，驗證器**認不認得**？」

**建議的下一步**（⛔ 不在本 lane 的檔案柵欄裡，所以沒做）：
`schema.mjs` 補一個 `export const OPTIONAL = ["evidence", "unblocks", "ownerQuotes", "asks", "brickId"]`，
然後把本閘第 ③ 條的分母收窄成 `REQUIRED ∪ OPTIONAL ∪ FORBIDDEN`，
並把 `check.mjs` 那兩處改成讀 `S.OPTIONAL`。⇒ 那才是「一個住處」。

---

## 3. ⚠️ `AGENTS.md` 有一行已經過期（⛔ 本 lane 不准動它，只回報）

`AGENTS.md:37`：

```bash
pnpm coord:check      # ← 在 GH#985 落地之前這一行會是 command not found，先跳過
```

⭐ **`coord:check` 今天已經在根 `package.json` 裡**，而且 `tools/coord/{schema,check}.mjs`
與守衛 `packages/shared/src/ops/coordCheck.test.ts` 都落地了。
⇒ 那句「會是 command not found，先跳過」**當場就是假的**，而它是 Codex 每次開工會讀的第一批指令。

連帶：§7 誠實表的 `pnpm coord:check`／GH#985 那一列也該改成 ✅。

⭐ **副作用**：因為 `coord:check` 已存在，票文說的「`coord:check` 落地前那一行允許帶
『落地前跳過』註記，測試讀那個註記」這個豁免 **⛔ 不需要了** —— 閘可以是嚴格的，
而它今天就是嚴格的。⇒ 那個豁免**沒有寫進閘**（⛔ 不留一個沒有人需要的洞）。

---

## 4. ⛔ `CODEX_TYPE_HANDOFF.md` —— genguard 擋下，沒動

```
$ bash scripts/genguard.sh docs/editor-contract/CODEX_TYPE_HANDOFF.md      # exit=1
🚫 戶籍無主,⛔ 但**它自己的檔頭寫著它是產生的** —— 相信檔案,⛔ 不要手改。
```

⭐ **而查下去它是 genguard 的 banner 啟發式誤判**（三條證據）：

| 證據 | 內容 |
|---|---|
| 觸發的那一行 | `CODEX_TYPE_HANDOFF.md:63` 逐字是「⛔ **不要手改** `_index.json` —— 它是 `content:build` 的產物」⇒ ⭐ 它在講**別的檔** |
| genguard 的規則 | `scripts/genguard.sh:147` 掃**前 4000 bytes** 裡的 `不要手改` 等字樣，⛔ 不管那句話的受詞是誰 |
| 唯一提到它的產生器 | `tools/type-catalog/gen.ts` 只寫 `ggd-type-catalog.{json,md}`（`writeFileSync` 兩處）；它第 49 行反而逐字說 `CODEX_TYPE_HANDOFF.md` 是**手寫**的 |

⇒ ⭐ 它**極可能可以手改**，⛔ 但本 lane 的硬性規則是「genguard 說有擁有者就停下來回報」，
所以**沒有硬改**。要補那一行的話那是一次一行的編輯，指令是：

```bash
python3 scripts/edit-or-die.py docs/editor-contract/CODEX_TYPE_HANDOFF.md --line 1 --new-file <新>
# 新內容 = 原 H1 + 空行 + 那一行 banner
```

⚠️ 順帶：genguard 這個誤判是**通用的** —— 任何一份「教別人不要手改產物」的文件都會被它擋。
（值得一張獨立的票：banner 比對應該要求那句話的**受詞是自己**。）

---

## 5. 動到的檔

| 檔 | 動作 |
|---|---|
| `packages/shared/src/ops/agentsMdIsHonest.test.ts` | **新增**（78 行 · 2 個 `it` · 含哨兵） |
| `docs/editor-contract/GOAL_CODEX_20260901.md` | 檔頭 +1 行 |
| `docs/editor-contract/README_CODEX_開工清單.md` | 檔頭 +1 行 |
| `docs/editor-contract/MAIN_TO_EDITOR_RESPONSE_20260902.md` | 檔頭 +1 行 |
| `docs/editor-contract/VFX_FORGE_SPEC_FOR_CODEX.md` | 檔頭 +1 行 |
| `docs/editor-contract/CODEX_TYPE_HANDOFF.md` | ⛔ **沒動**（§4） |
| `AGENTS.md` · `package.json` · `tools/coord/*` | ⛔ **一個位元組都沒動** |

加的那一行（四份逐字相同，插在 H1 之後）：

```markdown
> ⛔ **與根目錄 `AGENTS.md` 衝突時以 `AGENTS.md` 為準**（GH#988）—— 這一份是背景與細節，⛔ 不是規則的來源。
```

---

## 6. 離開碼

| 指令 | EXIT |
|---|---|
| `gh issue view 988` | 0 |
| `bash scripts/genguard.sh`（新測試 · 4 份文件 · 報告） | 0 |
| `bash scripts/genguard.sh docs/editor-contract/CODEX_TYPE_HANDOFF.md` | **1** ⇒ 跳過 |
| `python3 scripts/edit-or-die.py`（4 份文件 ＋ 2 次自我修剪） | 0 ×6 |
| `npx vitest run …/agentsMdIsHonest.test.ts` | 0（跑 3 次：初驗 · 修剪後 · 修完型別後） |
| `pnpm typecheck`（全 repo，第 1 次） | **1** —— 3 個 `TS2345`，⭐ 是本檔的 regex capture 在 strict 下是 `string \| undefined` |
| `pnpm --filter @ggd/shared typecheck`（修完） | 0 |

⚠️ 那 3 個型別錯是**本 lane 造成的**，已修（改用 `caps()` helper `String(m[1])`）。
其餘 17 個 package 的 typecheck 第一次就是綠的。

---

## 7. ⛔ 沒做的（不在柵欄裡）

- 票文 Scope 1（commit `AGENTS.md`）· Scope 4（`docs/MainAndCodex討論過程.md` §0 更正）· Scope 5（§7 打 ✅）
- ⛔ 沒 commit / 沒 `git add` / 沒 push · ⛔ 沒跑 `pnpm skills:sync`
