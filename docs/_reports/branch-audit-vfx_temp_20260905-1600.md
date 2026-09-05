# 分支稽核：`fix/vfx-forge-release-gates` · `feat/vfx-forge-codex`

> 唯讀稽核 · 2026-09-05 · 基準 `origin/main` = `91cf16c65`
> ⛔ 本次未 commit / 未 push / 未跑 `skills:sync` / 未改任何檔（本報告除外）

## 結論摘要

| 分支 | ahead/behind | 結論 | 一句理由 |
|---|---:|---|---|
| `origin/fix/vfx-forge-release-gates` | 1 / 61 | ⛔ **STALE** | 唯一那個 commit 已被 cherry-pick 進 main（`4ae7eb5f8`）；14 個檔裡 **9 個與 main 逐位元組相同**，其餘 5 個是 `content:build` 產物且**分支那一份比較舊** |
| `origin/feat/vfx-forge-codex` | 0 / 61 | ✅ **ALREADY-IN** | tip `35b231ef3` **就是**與 main 的 merge-base，且是 main 的祖先 ⇒ 100% 已含入，可刪 |

---

## A. `origin/fix/vfx-forge-release-gates` → **STALE**

### A-1 未合併的 commit

```
$ git log --oneline origin/main..origin/fix/vfx-forge-release-gates
648cc2b3a fix(editor): close VFX release gates

$ git rev-list --left-right --count origin/main...origin/fix/vfx-forge-release-gates
61      1                    # main ahead 61 / branch ahead 1
```

merge-base = `35b231ef3 fix(vfx): repair shipped asset safety and script composition`
（⭐ 注意：這正好是分支 B 的 tip）

### A-2 diff --stat（三點，＝那一個 commit 的內容）

```
$ git diff origin/main...origin/fix/vfx-forge-release-gates --stat
 .dockerignore                                          |   4 +
 apps/content-api/src/aiReview.ts                       |  89 +++++++++-
 apps/content-api/src/editorSourceRoutes.ts             |  24 ++++
 apps/content-api/src/server.test.ts                    | 133 ++++++++++++++-
 apps/content-api/src/server.ts                         |  58 ++++++++-
 content/bundle.json                                    |   2 +-
 content/config/_index.json                             |   6 +-
 content/config/unsafe-textures.json                    | 128 ++++++++--------
 content/editor-target-profile.json                     |   6 +-
 content/manifest.json                                  |   4 +-
 docker/edge.Dockerfile                                 |   7 ++
 packages/shared/.../schema/config/unsafeTextures.ts    |  23 ++--
 packages/shared/.../unsafeTextureQuarantine.test.ts    |  69 ++++++++-
 packages/shared/src/ops/clientContentImports.test.ts   |  19 ++-
 14 files changed, 479 insertions(+), 93 deletions(-)
```

### A-3 ⭐ 逐檔比對 main（`git diff origin/main <branch> -- <path>`，0 = 逐位元組相同）

| diff 行數 | 檔 | 判定 |
|---:|---|---|
| **0** | `.dockerignore` | ⭐ 已在 main |
| **0** | `apps/content-api/src/aiReview.ts` | ⭐ 已在 main |
| **0** | `apps/content-api/src/editorSourceRoutes.ts` | ⭐ 已在 main |
| **0** | `apps/content-api/src/server.test.ts` | ⭐ 已在 main |
| **0** | `apps/content-api/src/server.ts` | ⭐ 已在 main |
| **0** | `content/config/unsafe-textures.json` | ⭐ 已在 main |
| **0** | `packages/shared/src/content/schema/config/unsafeTextures.ts` | ⭐ 已在 main |
| **0** | `packages/shared/src/content/unsafeTextureQuarantine.test.ts` | ⭐ 已在 main |
| **0** | `packages/shared/src/ops/clientContentImports.test.ts` | ⭐ 已在 main |
| 7 | `content/bundle.json` | ⛔ 分支較舊（產物） |
| 25 | `content/config/_index.json` | ⛔ 分支較舊（產物） |
| 883 | `content/editor-target-profile.json` | ⛔ 分支較舊（產物） |
| 52 | `content/manifest.json` | ⛔ 分支較舊（產物） |
| 20 | `docker/edge.Dockerfile` | ⛔ **只有註解不同，且 main 的比較新** |

⇒ ⭐ **9/14 的實質程式與內容已經逐位元組在 main 裡。**

### A-4 那 5 個差異檔：先問「誰是作者」（genguard）

```
$ bash scripts/genguard.sh content/bundle.json
🚫 content/bundle.json 是產生器 **content:build** 的產物
$ bash scripts/genguard.sh content/config/_index.json
🚫 ... 產生器 **content:build** 的產物
$ bash scripts/genguard.sh content/editor-target-profile.json
🚫 ... 產生器 **content:build** 的產物
$ bash scripts/genguard.sh content/manifest.json
🚫 ... 產生器 **content:build** 的產物
$ bash scripts/genguard.sh docker/edge.Dockerfile
✓ 沒有產生器擁有者
```

⇒ ⭐ **4/5 是 `content:build` 的產物** —— 照守則，產物的差異多半代表「來源已在 main 而分支的產物過期」。
這一次可以直接證明它就是：main 有一個 commit 逐字寫著重跑了它。

### A-5 ⭐ 決定性證據：main 已經 cherry-pick 過它，而且有兩個收尾 commit

```
$ git log --oneline --all --grep='648cc2b3'
57e955735 chore(gates): 🔁 cherry-pick `648cc2b3` 之後把戶籍與閘補齊
d77b38b9d chore(content): 🔁 cherry-pick `648cc2b3` 後重跑 content:build

$ git log -1 --format='%H %ad %an%n%s' --date=iso 4ae7eb5f8
4ae7eb5f887900d1af224d3d5aef1089bfa9b62d 2026-09-05 00:22:05 +0800 CanLin
fix(editor): close VFX release gates          ← ⭐ 同作者、同時間戳、同標題

$ git merge-base --is-ancestor 4ae7eb5f8 origin/main   → yes
$ git merge-base --is-ancestor 648cc2b3a origin/main   → no（原 commit 物件不在，但內容在）
```

⚠️ patch-id 不相等（`5648878c…` vs `2260da4d…`）是**正常的** ——
cherry-pick 落在**不同的 base** 上（main 那時已含 `103d19b5d`、`18b5ffecb`），
所以 hunk 的上下文不同。⭐ 判準是**最終檔案內容**，而那個是 0 行 diff（A-3）。
證據：main 的 `4ae7eb5f8` 對 `editorSourceRoutes.ts` 改了 45 行（分支只有 24 行），
`server.ts` 改了 93 行（分支 58 行）—— 補上落差之後**兩邊的最終內容一致**。

### A-6 ⛔ 合併它會**刪掉** main 上比較新的東西

`git log 35b231ef3..origin/main -- <那 5 個檔>` 顯示 main 在 merge-base 之後
又動過它們 **6 次**（`4ae7eb5f8` → `d77b38b9d` → `7c0e1e7b8` → `51b2baa42` →
`c40493591` → `9aac15a40`）。逐項會被回捲的東西：

| 會被刪掉的 | 證據 | 來自 main 的哪一個 commit |
|---|---|---|
| **整個 `vfx-subtypes` 集合（4 份）** | `manifest.json` 的 `"vfx-subtypes": {hash 356bb93fc4d8, count 4}` 只有 main 有 | `51b2baa42`（#990 #991 #992） |
| **`config/ugc.json` 的索引項** | `config` count **101 → 100**；`_index.json` 少一列 `"id": "ugc"`。`git ls-tree origin/main content/config/ugc.json` 有，分支**沒有** | `51b2baa42`（UGC 開關） |
| **`contentVersion`** | `cv_f97908667d9b` → `cv_8572d8a7fa14`（回捲） | `9aac15a40`（#979） |
| `abilities` / `ability-templates` 集合 hash | `f2d12af4b2ab`→`969f791f7daa`、`c71bcb6bc5b4`→`e8842b4e9e3d` | `7c0e1e7b8` 等 |
| `editor-target-profile.json` **淨 −386 行** | main 6,130 行 / 分支 5,744 行（+91 / −477） | `c40493591`、`9aac15a40` |
| **`edge.Dockerfile` 的事故註解** | 見下 | `103d19b5d` 之後的 `4ae7eb5f8` |

⭐ **`docker/edge.Dockerfile` 是最乾淨的一槍**：實際的 `COPY` 指令**兩邊完全一樣**，
差別只有註解 —— 而 **main 的註解逐字引用了這個分支的 commit hash**：

```
main:   # ⭐ Codex 的補充（`648cc2b3`）：逐檔 COPY 讓 `clientContentImports.test.ts`
        #   能**雙向**確認 —— 沒有缺件，也沒有多塞一份靜態副本。
branch: # 逐檔 COPY 讓 `clientContentImports.test.ts` 能雙向確認沒有缺件或多塞一份靜態副本。
```

⇒ ⭐ **main 的那一行是「這個分支的內容進來之後」才寫的** ——
合併回去會把 2026-09-05 那次「本機全綠 / 正式 build 死在 rollup `Could not resolve`」
的事故紀錄一起刪掉（第一·五守則同族：知識不可以無聲消失）。

### A-7 結論

⛔ **STALE —— 應該關掉分支，⛔ 不要合併。**
- 它**沒有任何 main 缺少的東西**（9/14 逐位元組相同；其餘 4 個是產物、1 個是註解）
- 合併會回捲 `vfx-subtypes`（4 份）、`ugc` config、`contentVersion`、
  `editor-target-profile.json` 386 行，以及 Dockerfile 的事故註解
- ⚠️ 實務上不會「靜默回捲」—— 兩邊都在 merge-base 之後改過同樣 5 個檔 ⇒
  **必然衝突**。而衝突落在 `content:build` 產物上，正解永遠是「取 main 那一份再重跑產生器」，
  ⛔ 不是手動選邊 ⇒ 這次合併的期望產出是 **零**，成本是一輪衝突處理。

---

## B. `origin/feat/vfx-forge-codex` → **ALREADY-IN**

```
$ git log --oneline origin/main..origin/feat/vfx-forge-codex
（空）

$ git rev-list --left-right --count origin/main...origin/feat/vfx-forge-codex
61      0

$ git diff origin/main...origin/feat/vfx-forge-codex --stat
（空）

$ git merge-base origin/main origin/feat/vfx-forge-codex
35b231ef37186f266c4f852dff205d76b1fcc43b     ← ⭐ 就是這條分支的 tip

$ git log -1 --format='%H %ad' --date=iso origin/feat/vfx-forge-codex
35b231ef37186f266c4f852dff205d76b1fcc43b 2026-09-04 22:55:21 +0800
fix(vfx): repair shipped asset safety and script composition

$ git merge-base --is-ancestor origin/feat/vfx-forge-codex origin/main
→ YES
```

⭐ tip **等於** merge-base，且是 main 的祖先 ⇒ 這條分支的每一個 commit 都已經在 main 裡，
diff 為空。**沒有任何東西可合，可以安全刪除。**

⚠️ 對照 CLAUDE.md「⑤ lane 的 commit 要真的進 main」那一條：
這條分支是**正確**的形狀（真的合進去了），⛔ 不是那 85 個擱淺 commit 的族類。

---

## ⭐ 最重要的一個發現

**「ahead=1」不等於「有 1 個 commit 的內容缺席」。**
`648cc2b3a` 的 14 個檔裡有 9 個與 main **逐位元組相同**，
差異全部集中在 4 份 `content:build` 產物 ＋ 1 段註解，
而那 5 個**每一個都是 main 比較新**。

⚠️ 而讓這件事**看得出來**的不是 `git log`（它說「不在 main」），
是 ⭐ **逐檔 `git diff origin/main <branch> -- <path>` 的 0 行**
＋ ⭐ **`genguard` 指認產物** ＋ ⭐ **main 自己的 commit 訊息裡的
`cherry-pick 648cc2b3`**。三者缺一，這條分支看起來都像「還有東西沒進來」。

⇒ 這正是 CLAUDE.md 第〇·四／第三守則同族的形狀：
**一個「commit 不在 main」的事實，被讀成「內容不在 main」。**
若照 commit 圖去合併，付出的是一輪產物衝突，換回的是**負的**內容
（刪掉 4 份 `vfx-subtypes` ＋ `ugc` 開關的索引）。

---

## 建議動作（⛔ 本次未執行）

```bash
# 兩條都可以刪；A 先確認 owner 不需要保留那個 commit 物件當紀錄
git push origin --delete fix/vfx-forge-release-gates    # STALE
git push origin --delete feat/vfx-forge-codex           # ALREADY-IN
```

⚠️ 刪之前值得一提：`648cc2b3a` 這個 **commit 物件本身**不在 main（只有內容在）。
若要保留「Codex 原始提交」的可追溯性，main 的 `4ae7eb5f8` ＋
`57e955735` / `d77b38b9d` 兩個收尾 commit 的訊息**已經逐字記著 `648cc2b3`** ⇒
可追溯性已經有住處，⛔ 不需要靠留著分支。
