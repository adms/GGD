# 三條七月遠端分支的合併稽核（唯讀）

- 稽核日：2026-09-05／06
- 基準：`origin/main` @ `91cf16c65`
- 判準：⛔ **不是「它有沒有 commit」**，⭐ 是「**它有沒有 main 今天缺的東西**」
- 範圍：唯讀。⛔ 沒有 commit／push／`skills:sync`／改檔（本報告除外）

---

## 結論總表

| 分支 | ahead/behind | 結論 | 一句理由 |
|---|---|---|---|
| `origin/claude/keen-varahamihira-5757ea` | 1 / 2136 | ⛔ **ALREADY-IN**（可刪） | 那 40 行**逐位元組**已在 `deploy/helm/ggd/files/nginx.conf:643-682` |
| `origin/feat/206-transform-wip` | 1 / 1984 | ⛔⛔ **STALE**（應關掉，⭐ 有真實破壞性） | 合併會把 **48 隻已下架英雄**從 `content/_legacy/` 復活回營運名單 |
| `origin/feat/attack-standstill` | 3 / 2015 | ⛔ **STALE**（應關掉）⭐ **但先撿走 `9611fcf89` 的 4 個檔** | 3 個 commit 有 2 個已在 main 且更強；第 3 個**真的缺** |

---

## ① `claude/keen-varahamihira-5757ea` → **ALREADY-IN**

```
74b4efa3f fix(infra): helm chart 的 nginx 副本補上 #243 兩個 location
 deploy/helm/ggd/files/nginx.conf | 40 ++++++++++++++++++++++++++++++++++++++++
```

### 證據：逐位元組相同

把分支新增的 40 行與 main 的 `nginx.conf:643-682` 對拉：

```
$ diff <(git show origin/main:deploy/helm/ggd/files/nginx.conf | sed -n '643,682p') <branch 新增的 40 行>
✅ IDENTICAL byte-for-byte (40 lines)
```

⭐ 連**中英文註解一字不差** —— 包含 `# ---- #243 平台資料搬遷` 的抬頭、
「THE ONLY route allowed a large request body」、以及
「both are required, and both are 512 MiB」那句。

兩個 location 在 main 上的位置：

| | 檔 | 行 |
|---|---|---|
| `location = /api/v1/admin/platform-archive/stage` | `deploy/helm/ggd/files/nginx.conf` | **653** |
| `location = /api/v1/admin/platform-archive/export` | 同上 | **671** |
| 同兩個（來源側） | `nginx/nginx.conf` | **653 / 671** |

### ⭐ 而 main 今天比這條分支多了一道**閘**

`packages/shared/src/ops/helmNginxInSync.test.ts` —— 逐位元組比對
`nginx/nginx.conf` ↔ `deploy/helm/ggd/files/nginx.conf`。它的檔頭逐字記著這個病：

> 「`keep the copy in sync; this file is the source of truth` ⭐ 而那句話是**散文**
>  ⇒ ⛔ 沒有任何東西在驗。」

⇒ 這條分支修的是**症狀（那一次漂掉）**，main 修的是**病（沒有人問它們一不一樣）**。

### 合併會發生什麼

分支上那份 `nginx.conf` 比 main 的**少 220 行**（`git diff branch:file main:file --stat`
→ `220 insertions, 3 deletions`）。合併沒有任何收穫，只有把 220 行往回帶的風險。

**⇒ 可刪。**

---

## ② `feat/206-transform-wip` → **STALE**（⭐ 這條最危險）

```
f3b1909ae wip(變身): Pattern A 原語做好了,但**線沒接上、內容零採用** —— 不進 main
 74 files changed, 3995 insertions(+), 23 deletions(-)
```

⚠️ ⭐ **commit 訊息自己說「不進 main」** —— 它從一開始就不是要合併的東西。

### ⭐ 最重要的發現：那 48 隻英雄是**被刻意下架的**，⛔ 不是 main 缺的

| | |
|---|---|
| 分支的 `content/champions/*.json` | **120 份** |
| main 的營運名單 | **72 份** |
| 差額 | **48 份** |
| ⭐ 那 48 份**全部**在 `content/_legacy/champions/` | **48 / 48（100%）** |

逐檔驗過（`godie-h00w.json`）：分支的那一份與 main 的
`content/_legacy/champions/godie-h00w.json` **IDENTICAL**。

下架的動作是 commit `c4cf16175`（2026-08-13，`feat(gen)(#317)`），
而 `content/_legacy/` 是一個**載入器一份都不開**的退休區 ——
`packages/shared/src/content/cache/contentCache.ts:181` 逐字寫著：

> 「（⛔ 不含 `bundle.json` / `assets/` / `_legacy/` —— loader 一份都不開）」

⇒ ⭐ **合併這條分支＝把 48 隻已下架英雄整批復活回營運名單。**
⚠️ 而且它會**同時**帶回 48 隻份的 abilities（`godie-h00w.q` 那一族，
main 也已經搬進 `content/_legacy/abilities/`）與 icon 資產。

### 「Pattern A 原語」在 main 上不但存在，而且已經被超越

| 東西 | 分支 | main |
|---|---|---|
| `sim/systems/ChampionFormSystem.ts` | 299 行 | ⭐ **425 行** |
| `protocol/schema.ts` FORM bits | 新增 | ⭐ `FORM_A:4096` / `FORM_B:8192` @ **1290-1292**，加上 `formIndexFromFlags()` @1456、`flagsFromFormIndex()` @1484 |
| effect kind 抽出來 | ⛔ 還在 `effectRunner` switch 裡 | ⭐ `sim/effects/championForm.ts`（GH#289 搬出來的） |
| Zod schema | ⛔ 無 | ⭐ `content/schema/effects/championForm.ts` |
| 變體 | ⛔ 無 | ⭐ `sim/effects/variants/championForm.ts` |
| 守衛 | 3 支 | ⭐ **13 支**（Adoption / Exclusive / Toggle / Visuals / Goku / Visibility / Attachment / BodyTeardown / RoundBoundary / Snapshot …） |

### ⭐ 而分支的 `championForms.ts` 改動**也已經在 main 上了**

分支把 4 格 `alternateInContent: false → true` 並改寫註解。
main 的 `packages/shared/src/content/championForms.ts:98` 逐字就是分支寫的那句：

> 「Four alternate bodies were the last gap (H00W 26洨者狀態 / O030 30變態紳士 /
>  N01B 40萬解 / E010 70紮根)」

而 main 上 26 個 `alternateInContent` **全部是 `true`**（行 127–463）。
⇒ 這一半是 **ALREADY-IN**，⛔ 分支沒有任何獨佔內容。

### ⚠️ 順帶量到的一個**可能的 main 側不一致**（⛔ 不在本次任務範圍，僅記錄）

| 替身 | `alternateInContent` | 營運名單裡在不在 |
|---|---|---|
| `godie-e010` | true | ✅ 在 |
| `godie-o030` | true | ✅ 在 |
| **`godie-h00w`** | true | ⛔ **不在**（在 `_legacy/`） |
| **`godie-n01b`** | true | ⛔ **不在**（在 `_legacy/`） |

⚠️ ⭐ 而**分支自己的註解**逐字說明了這為什麼要緊：

> 「`sim/content/registry.ts` `Registry.get()` **THROWS** on an unregistered id,
>  and `apps/game-server/src/net/snapshot.ts` calls it for every champion entity
>  every tick — so a transform into a body with no doc would **take the whole
>  room down**, not merely fail to render.」

（`registry.ts:25` 確實是 `if (!v) throw new Error(...)`。）
main 上有 `championFormsResolve.test.ts` 應該在守這件事 —— ⛔ 本次唯讀稽核**沒有跑測試**，
所以這只是一個**待查的觀察**，⛔ 不是一個已證實的缺陷。⭐ 值得單獨開一張票去問
「那兩格 `true` 今天由誰保證解析得到」。

**⇒ 應關掉。合併會刪掉／覆蓋 main 的下架決定，並復活 48 隻英雄。**

---

## ③ `feat/attack-standstill` → **STALE**，⭐ 但有一小塊**真的缺**

```
852c965c8 fix(security): gosec 的 5 個發現
9611fcf89 fix(infra): testrunner image 根本建不起來        ← ⭐ 這個有東西
550d33d95 feat: 打就站定 —— 移動中不得出手（照 WC3）
```

### ③-a `550d33d95` 打就站定 → **ALREADY-IN，而且 main 修好了它的一個真缺陷**

main 有 `packages/shared/src/sim/combatFeel.ts:1317` 的 `standstillBlocks()`，
`BasicAttackSystem.ts:34` import 它、在 **274 / 346 / 382** 三處呼叫。
守衛 `sim/attackStandstill.test.ts` ＋ `sim/autoAttackWhileMovingCensus.test.ts`。

⭐ **而且它已經是一格後台開關**（第一守則），`content/config/combat-feel.json`：

```json
"standstill": {
  "enabled": true, "walkEps": 0.5, "applyToMobs": true,
  "stillEps": 1e-06, "closingRatio": 0.5, "legacyAbsoluteClosing": false
}
```

⭐ **關鍵：main 修掉了分支版本的一個真缺陷（GH#755）。**
分支用**同一個常數 `WALK_EPS = 0.5`** 同時當「有沒有在動」與「有沒有在靠近」兩個門檻：

```ts
const WALK_EPS = 0.5;
const walking = lenSq(t.vel) > WALK_EPS_SQ;        // ← 門檻①
function closingOnTarget(...) { return dot(t.vel, to) >= WALK_EPS; }  // ← 門檻②
```

main 的 `combatFeel.ts:1330-1334` 逐字記著那個後果：

> 「① 有沒有在動 —— 雜訊地板 `stillEps`（⛔ 不是 `walkEps`）。
>  舊版拿 0.5 當這一格 ⇒ **有效移速 ≤ 0.5 的單位整條規則靜默關閉**，
>  重減速之下純後退風箏拿全額輸出」

⇒ ⭐ 分支的版本在**重減速**之下會靜默失效 —— ⛔ 正好是這條規則最該生效的場合。
main 另外多了 `applyToMobs`（分支沒有，小怪不吃這條規則）與
`legacyAbsoluteClosing` 這格一鍵 rollback。

⇒ **合併這個 commit 會把硬寫死的 `WALK_EPS = 0.5` 帶回來、拿掉那格後台開關、
並復原 GH#755 修掉的缺陷。** `BasicAttackSystem.ts` main 662 行 vs 分支 538 行。

`docs/todo/combat-timing.md` 的 24 行也一樣 —— main 上該檔已存在且已演進。

### ③-b `852c965c8` gosec → **ALREADY-IN，且 main 的形狀更好**

五個發現逐一比對：

| 發現 | 分支的做法 | main 今天 |
|---|---|---|
| `inspect.go` CompressedSize64 溢位（**真缺陷**） | 就地加 `if f.CompressedSize64 > math.MaxInt64` | ⭐ **抽成 `ratioGuard()`**（`inspect.go:450-477`，可測試），呼叫點在 **:240** |
| `inspect.go:210` UncompressedSize64 G115 | `#nosec` + 理由 | ⭐ 有，`:211`（理由重寫過，標明是**刻意的 fail-CLOSED 方向**） |
| `freespace_unix.go` G115 | `#nosec` + 理由 | ⭐ 有，`:20` |
| `approvelink/token.go` G101 | `#nosec` + 理由 | ⭐ 有，`:55`（並指向 `:109` 的 `h.Write` 證明它是**訊息**不是密鑰） |
| `staging.go` G703 | `#nosec` + 理由 | ⭐ 有，`:239` |

掃描器 pin：分支 pin 到 `gosec v2.28.0` / `govulncheck v1.6.0`；
main 的 `.github/workflows/ci.yml:284` 已是 **`gosec@v2.29.0`**、`:273` **`govulncheck@v1.1.4`**，
而且 `:278` 逐字寫著「⛔⛔ **這一行沒有 pin，就是 gosec 連紅 42 天的根因**（GH#981）」。

⇒ main **獨立地重新發現並修好了同一件事**。分支的版本比較舊。

### ③-c ⭐ `9611fcf89` testrunner → **真的缺，四個檔 main 都沒有**

⭐ **這是三條分支裡唯一 main 今天沒有的東西。**

| 檔 | main 今天 | 分支補的 |
|---|---|---|
| `.dockerignore` | `**/coverage`（**:33**），⛔ **沒有例外行** | `!tools/testrunner/internal/coverage` |
| `docker/testrunner.Dockerfile` | `RUN corepack enable && apk add --no-cache git` | ＋`python3 py3-pip py3-pillow` ＋ `pip install mpyq` |
| `tools/icon-gen/test/icon-gen.test.ts` | `findPython()` **:37** 無條件探測 `["arch","-arm64","python3"]` | 用 `process.platform === "darwin"` 圍起來 |
| `tools/w3x-import/test/w3x-import.test.ts` | 同病，**:24-28** | 同修法 |

**① `.dockerignore` 的缺口是實的**：`tools/testrunner/internal/coverage/coverage.go`
在 main 上**確實存在**（是一個 Go **原始碼**套件，⛔ 不是產物目錄），
而 `**/coverage` 會把它吞掉 ⇒ `docker/testrunner.Dockerfile` **建不起來**。
分支的註解記著它的症狀為什麼難查：

> 「The failure had nothing to do with docker in its output — the build died on
>  `internal/api/api.go:29:2: no required module provides package …/internal/coverage`
>  i.e. it read as a broken go.mod, so the ignore file was the last place anyone
>  would look.」

該映像今天仍然是活的基礎建設：`skaffold.yaml:45-48` 建 `ggd-testrunner`。

**② `arch` 探測是一個「⛔ 不用跑 python 就能回答 yes」的假陽性閘** ——
正是 CLAUDE.md「一條綠燈有四種假的來源」的形態⑨/⑩。
Linux 上 `arch` 是真的 busybox applet，**印出機器架構並忽略參數、exit 0**
⇒ 沒有 python 的 Linux 機器上探測會「成功」，然後整套 suite 用
「少了 PASS 行」而不是 `ModuleNotFoundError` 失敗。

⚠️ **緩解事實（誠實列出）**：`ci.yml:100` 直接裝
`python3 -m pip install Pillow mpyq`，所以 **CI 這條路今天不受影響** ——
第一個候選 `["python3"]` 就會命中，`arch` 永遠走不到。
⇒ 缺口只在 **docker/skaffold 那條路**（helm `values.yaml:103` `test.enabled: false`）。
⇒ ⭐ **真缺陷，但不緊急**。

### ⇒ 分支③ 的處置

**整條 STALE，應關掉** —— 合併會回退 `standstill`（③-a）與 gosec pin（③-b）。
⭐ **但 `9611fcf89` 的四個檔值得單獨撿走**（`git cherry-pick -x 9611fcf89`，
或逐檔重打；⚠️ 那四個檔在 main 上都已演進，cherry-pick 會衝突，
⭐ 建議**重打**而不是 pick）。

---

## 一句話總結

三條分支**沒有一條該合併**。
② 與 ③-a 的合併會**主動刪掉 main 今天的東西**（48 隻下架英雄復活、GH#755 的修復被回退）——
正是關掉 #13 / #182 的同一個理由。
⭐ 唯一的收穫是 `9611fcf89` 的四個檔（testrunner 映像建不起來 ＋ 兩支假陽性 python 探測），
⭐ 而它值得一張自己的票，⛔ 不是一次合併。
