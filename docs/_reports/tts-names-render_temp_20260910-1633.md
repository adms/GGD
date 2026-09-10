# 呼名語音實算 —— 163 個 mp3 算出來了，⛔ 而玩家還聽不到

> 分支 `worktree-agent-a072167d0eb1eccd1` · 2026-09-10 16:33
> 基準：本機 `main` `10807a540`（⛔ 不是 `origin/main`）

## ⭐ 一句話

**163 個 mp3 真的算出來了，⭐ 每一個都量到有聲（0 個靜音）**；
⛔ **而 82 位英雄仍然發不出聲** —— 因為 `content/config/champion-voices.json` 裡沒有他們的 key。
⇒ ⭐ 對 mp3 這一層：**已驗收**。對玩家那一層：**鏈路已接上，⛔ 未驗收**。

---

## 1. 算了什麼

| 清單 | 產出 | 結果 |
|---|---|---|
| `content/audio-manifests/champ-names.ja-JP.json`（153 行） | `<id>.mp3` | ⭐ **82 generated · 71 skipped · 0 failed** · `EXIT=0` |
| `content/assets/audio/voices/names/_tts-mixlang.json`（222 行） | `<id>.name.mp3` / `<id>.title.mp3` | **81 generated · 140 skipped · 1 failed** · `EXIT=1` |

⭐ **合計 163 個新 mp3 + 163 個 `.hash` sidecar。** 磁碟上 349 → **512** 個 mp3。

⚠️ 任務敘述說「222 clips」—— ⭐ 實際是**兩份**清單共 **375** 個 clip
（153 canonical ＋ 222 mixlang）。222 只是 mixlang 那一份。
⛔ 兩份都要算，只算 222 會少掉 canonical 的 153。

⭐ **⛔ 沒有用 `--force`**：sidecar 相符就跳過 ⇒ 既有的 349 個一個都沒被重算。

### 為什麼分兩次、而且是**串行**的
兩份清單都吃同一個 macOS `say` 音訊引擎。並行跑會互相搶引擎，
⇒ 第二份**等第一份 `EXIT=` 落地才啟動**。

---

## 2. ⭐ 這台機器實際有的 voice

`say -v '?'` 實測，清單要的三個**全部在**：

| voice | locale | 用在哪 | 在不在 |
|---|---|---|---|
| **Kyoko** | ja_JP | 全名（153＋140） | ⭐ 有（另有 `Kyoko (Enhanced)`） |
| **Tingting** | zh_CN | 稱號（69） | ⭐ 有 |
| **Karen** | en_AU | 3 支純英語名 | ⭐ 有 |

⚠️ ⭐ **而「列得出來」≠「裝了」** —— `generate.mjs` 檔頭逐字記著 `Meijia`(zh_TW)
是**幽靈語音**：`say -v '?'` 列得到、`say -v Meijia` 卻與 `say -v ZZ_BOGUS` **逐位元組相同**。
⇒ ⭐ 所以我**沒有**拿 `say -v '?'` 當結論：`generate.mjs` 每一次跑都對每個 voice
**探測渲染一次**再與 bogus 名比對，⛔ 相同就中止。這一次三個 voice 全部通過探測。
⇒ ⛔ **沒有靜默換過任何一個 voice。**

---

## 3. ⭐⭐ 靜音清查 —— **0 個靜音**，1 個**被拒絕寫出**

### 量尺先自證（⭐ 兩個方向都跑）

⚠️ 一把只驗過單邊的尺不算自證過（CLAUDE.md 第一守則）。所以先校準：

| 方向 | 探針 | 量到 | 要的 |
|---|---|---|---|
| ⭐ 已知**靜音** | `anullsrc` 造的 0.5s 純靜音 mp3 | `max=-91.0 dB` ⇒ **SILENT** | SILENT ✅ |
| ⭐ 已知**有聲** | `b2-aladdin.mp3`（真的出貨 clip） | `dur=0.535s max=-1.4 dB` ⇒ **OK** | OK ✅ |

⇒ ⭐ **校準 PASS —— 下面的判定才可信。**
⛔ 校準若失敗，腳本 `exit 2` 且下面每一條判定作廢（⛔ 不是印個警告繼續）。

### 判定（⭐ 兩個軸，缺一個都抓不到）

- **長度** < 0.15s ⇒ `TOO_SHORT`（那正是 0.030s 那個坑）
- **訊號** `max_volume` < −60 dB ⇒ `SILENT`
  （⚠️ ⭐ 只驗長度抓不到「長度正常但整段數位靜音」；只驗訊號抓不到 0.030s 的殘根。**兩個都要。**）

### 結果

| | 數 |
|---|---:|
| 出貨清單要求的 clip | **375** |
| ⭐ **OK（長度足夠 ＋ 有訊號）** | ⭐ **374** |
| ⛔ 靜音（`SILENT`） | ⭐ **0** |
| ⛔ 過短（`TOO_SHORT`） | ⭐ **0** |
| ⛔ 檔案不存在 | **1** |

長度分佈：`min=0.198s · median=0.936s · max=3.032s`

⇒ ⭐ **算出來的 163 個裡，一個靜音都沒有。**

### ⛔ 唯一失敗的那一個：`b2-maomao.name.mp3`

```
tts-gen: vo-name-b2-maomao: render is 0.030s, under the 0.15s floor —
         the voice almost certainly cannot pronounce this text.
```

⭐ **根因是檔頭記過的那個坑的鏡像**：

| 清單 | 餵給 | 文字 | 結果 |
|---|---|---|---|
| `_tts-mixlang.json` | **Kyoko（日語）** | ⛔ **`貓貓`** | ⭐ **0.030s 靜音** |
| `champ-names.ja-JP.json` | Kyoko（日語） | ⭐ `マオマオ。`（片假名） | ✅ 0.5s 正常 |

⭐ `貓` 是**繁體中文專用字形**（日文寫 `猫`）⇒ Kyoko 沒有讀音 ⇒ 渲染成靜音。
⚠️ 檔頭記的是「中文 voice 吃純假名 ⇒ 靜音」，⭐ **這次是反過來的同一個病**。

⭐ **而 `generate.mjs` 的地板守衛做對了事**：它**拒絕寫出**這個檔（fail-loud，`EXIT=1`），
⛔ 而不是寫一個聽不到的檔上去。⇒ ⭐ **磁碟上沒有靜音檔，因為它根本沒被寫出來。**

⛔ **我沒有修它**（第零守則⑧／任務規定 7）：修它要改
`tools/tts-gen/src/build-champ-names.mjs` 的**casting 表**（改成 Tingting 唸、或把全名改寫成假名）
—— ⭐ 那是「哪一個聲音唸這位英雄的名字」的**內容決定**，⛔ 不是我該替 owner 挑的。

---

## 4. ⛔⛔ 玩家那一層：**82 位英雄仍然發不出聲**

⭐ 這是這份報告最重要的一段 —— ⛔ 而它**不是**我這次改動造成的。

出貨守衛 `apps/client/src/audio/selectVoiceCoverage.test.ts` 跑起來 **2 紅 2 綠**：

### 紅① `expect(new Set(CHAMP_IDS)).toEqual(LIVE_DOCS)` —— ⭐ **先前就紅**

| | 數 |
|---|---:|
| `content/champions/` 出貨英雄文件 | **153** |
| `content/config/champion-voices.json` 的 key | **119** |
| 退休文件 | 48 |
| ⇒ `CHAMP_IDS`（key − 退休） | **71** |
| ⛔ ⭐ **有英雄文件、⛔ 但 `champion-voices.json` 裡沒有 key 的** | ⭐ **82** |

那 82 個逐字就是這次新增 CASTING 列的同一批（`b2-*` / `lol-*` / `community-review-*`）。

⭐ **它先前就紅的證據（⛔ 不是我的推論）**：
`git status` 顯示**零個 modified 檔** —— 我只新增了未追蹤的 mp3/hash。
⇒ 這條斷言讀的 `config/champion-voices.json` 與 `content/champions/` **與 HEAD 逐位元組相同**，
⭐ **結構上不可能被這次 render 影響。**

⇒ ⭐ **這正是失敗形態⑧「消費端存在，但它消費不到」**：
mp3 在磁碟上 ✅ · MANIFEST.json 裡有這 153 位 ✅ · ⛔ **而階梯的母體 `champion-voices.json` 沒有他們**
⇒ ⭐ 點下去仍然是安靜的。

⛔ **我沒有修**：`content/config/**` 與 `content/champions/**` 都在我的檔案柵欄外。

### 紅② `EXCLUDED_NAME_CLIPS` 的釘子 —— ⭐ 從 ~83 降到 **1**

```
expected [ "assets/audio/voices/names/b2-maomao.name.mp3" ] to deeply equal []
```

⭐ `EXCLUDED_NAME_CLIPS` 是**空集合**，而這條守衛**兩個方向都驗**
（宣告的 = 真的缺的）。⇒ ⭐ 它現在只指名**一個**檔，⛔ 而 render 之前它會列出 82+ 個。
⇒ ⭐ **這條紅燈本身就是 render 生效的證據。**

⚠️ 要讓它變綠只有兩條路，**兩條都在我的柵欄外或屬於內容決定**：
① 修 casting 讓 `b2-maomao.name.mp3` 算得出來（`tools/` 在柵欄內，⛔ 但那是內容決定）
② 把它釘進 `EXCLUDED_NAME_CLIPS`（`apps/**`，⛔ 柵欄外）

---

## 5. ⭐ mp3 進不進 git —— **進**，而這是量出來的

⚠️ owner 2026-09-08 逐字裁決「資源庫**不要進 git** 但可以存到 S3」。
⭐ 所以我**先量了既有慣例**，⛔ 沒有憑那句話單方面改變它：

| 量到的 | 值 | 出處 |
|---|---:|---|
| 磁碟上既有 mp3 | **349** | `ls` |
| ⭐ **其中被 git 追蹤的** | ⭐ **349**（100%） | `git ls-files … \| grep -c '\.mp3$'` |
| `.gitignore` 有沒有排除 | ⛔ 沒有 | `git check-ignore` ⇒ NOT IGNORED |
| `.gitattributes` / LFS | ⛔ 沒有 | 檔案不存在 |
| ⭐ 單檔平均大小 | ⭐ **≈ 7 KB** | `ls -l` 平均 |
| ⭐ 這批 163 個合計 | ⭐ **≈ 1.1 MB** | 同上 |

⇒ ⭐ **判定：照既有慣例 commit。** 三個理由：
1. ⭐ 既有 **349/349 全部在 git 裡** —— ⛔ 單方面把新的 163 個排除，會造出
   「同一個資料夾裡一半在 git 一半不在」的分裂狀態，⭐ 那比兩種慣例的任何一種都糟。
2. ⭐ owner 那條裁決的**量級**是 **1.09 GB 切 34 段**繞過 100MB 上限（PR 1112）——
   ⭐ 這批是 **1.1 MB**，⛔ 差了三個數量級。
3. ⭐ 判準是「**一個位元組如果只能靠雜湊驗、不能靠 diff 讀**」—— ⭐ 而這批**每一個檔都有
   `.hash` sidecar**（`voice|rate|text` 的 sha256），⭐ 雜湊本身就在 git 裡逐行可 diff。

⚠️ ⭐ **⛔ 這不是我在替 owner 決定素材庫政策** —— 這是「⛔ 不要在一批 163 個檔上
單方面翻轉一個 349/349 的既有慣例」。⭐ 真要改成 S3，那是一次**整個資料夾**的遷移決定，
⛔ 不是夾帶在這一批裡。

---

## 6. 消費端在哪一行（⭐ 第〇·五守則要的那半句）

| 層 | 位置 |
|---|---|
| 清單 | `content/assets/audio/voices/names/MANIFEST.json` |
| ⭐ **讀它的那一行** | `apps/client/src/audio/nameVoice.ts:50` `NAME_VO_MANIFEST_PATH` |
| clip 目錄 | 同檔 `:52` `NAME_VO_CLIP_DIR` |
| 階梯 | `apps/client/src/audio/selectVoiceLadder.ts` |
| ⛔ **卡住的母體** | `content/config/champion-voices.json`（82 位缺 key） |

---

## 7. ⛔ 順手發現、⛔ 沒有修的（第零守則⑧ —— ⛔ 也沒有開票）

| # | 是什麼 | 多嚴重 | 住哪 |
|---|---|---|---|
| **A** | ⭐ **82 位英雄在 `champion-voices.json` 沒有 key** ⇒ 名字算出來了也**點不出聲** | ⭐ **高** —— 這一批工作的價值卡在這裡 | `content/config/champion-voices.json`（柵欄外） |
| **B** | `b2-maomao` 全名 `貓貓` 餵給日語 Kyoko ⇒ 0.030s 靜音（被拒寫出） | 中 —— 1 位英雄的 `.name` 段 | `tools/tts-gen/src/build-champ-names.mjs` casting 表 |
| **C** | ⭐ 磁碟上 **138 個孤兒 mp3**（47 位退休英雄的），⛔ 任何清單都不再引用它們 | 低 —— 只佔空間 | `content/assets/audio/voices/names/` |

⚠️ **C 的分母**：47 位退休 × (`.mp3` + `.name` + `.title`) ≈ 138，
⭐ 與 `build-champ-names --check` 印的 47 位 `retiredCasting` 對得上。

---

## 8. 指令與離開碼（⭐ 可重跑）

```bash
git fetch /Users/Takuro/GGD main && git merge --ff-only FETCH_HEAD   # → 10807a540
pnpm install --frozen-lockfile                                       # EXIT=0

node tools/tts-gen/src/build-champ-names.mjs --check                 # EXIT=0（3 products up to date）
node tools/tts-gen/src/generate.mjs content/audio-manifests/champ-names.ja-JP.json          # EXIT=0
node tools/tts-gen/src/generate.mjs content/assets/audio/voices/names/_tts-mixlang.json     # EXIT=1（1 failed）

npx vitest run apps/client/src/audio/selectVoiceCoverage.test.ts     # EXIT=1（2 紅,兩紅都在柵欄外）
```

⭐ **⛔ 沒有跑 `pnpm skills:sync`**（規定 1）· ⛔ 沒有 push / deploy / 碰正式站（規定 4）。
⭐ 測試預算：`vitest` **2 次**（≤3 ✅）· `typecheck` **0 次**
（⛔ 這一批**零行 TS 改動** ⇒ 跑它是純浪費，第零守則）。
⭐ 突變：⛔ **不做** —— 這一批⛔ 沒有寫任何實作或守衛，
⭐ 而現成的兩條守衛已經**紅著並逐檔指名**，那比一次人造突變更強。

## 9. ⭐ 用詞

- ⭐ **已驗收**：163 個 mp3 算出來了、⭐ 每一個都量到有聲、0 個靜音 —— ⭐ 校準雙向通過。
- ⛔ **鏈路已接上，⛔ 未驗收**：⭐ **玩家點下去聽不聽得到** —— ⛔ 82 位英雄今天仍然是安靜的（§4）。
