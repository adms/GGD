# texture-dedup — 貼圖去重的終端證據（GH#382 · 連帶 #614）

> 📅 **證據的時間身分（GH#795）**：`HEAD=21c218fd` 工作樹
>
> ⭐ 這一行是 `visual-proof.sh --new` **拍攝當下**蓋的，⛔ 不是事後補的。

## ⚠️ 先講這份證據**不是**什麼

⛔ 這**不是**亮像素 A/B。這個改動**刻意不改變任何一個像素** ——
它讓內容相同的貼圖共用同一塊 GPU 記憶體，畫面應該**逐格不變**，只是少用 26–48 MB VRAM。
⇒ 「亮起來了嗎」在這裡是錯的問題；對的問題是 **「有沒有東西變不見」** 與
**「GPU 上真的少了幾塊」**。這份報告量的是這兩題。

⭐ 而**在真瀏覽器上看過**這件事 —— ⛔ **未驗收**。這條 lane 沒有 GPU 環境。
⇒ 用詞紀律：**鏈路已接上、資源層已量到，⛔ 螢幕未驗收**。
需要的最後一步寫在最下面「還缺的那一步」。

## 台子與鏈路（⛔ 沒有一段是台子造的）

| 段 | 用的是什麼 |
|---|---|
| 位元組 | `content/assets/models/props/{pillar,torch,chest}.glb` —— **出貨的檔案** |
| 載入 | 出貨的 `AssetManager.load()`（真的 `fetch` 打到 repo 的 `content/` 樹） |
| 解析 | 真的 `@babylonjs/loaders/glTF` 外掛 |
| 引擎 | 真的 `NullEngine` + 真的 `Scene` |
| 被測的 | 出貨的 `shareDuplicateTextures()`（⛔ 沒有夾具、⛔ 沒有手寫 payload） |

守衛：`apps/client/src/render/textureDedup.test.ts`（`@visual-proof`）。

## ⭐ 量尺先自證 —— 而它**第一版真的說了謊**

**第一版的尺**：`engine.getLoadedTexturesCache().length`。
⚠️ 那在真 WebGL 上是對的（`thinEngine._releaseTexture` 會把它 `splice` 掉），
⛔ 但 **`NullEngine._releaseTexture(texture) { }` 是空的**（`nullEngine.js:560`）
⇒ 那份清單在 headless 底下**永遠不會變短**，於是
**「去重生效」與「去重沒生效」量起來一模一樣**（實測：兩邊都是 3）。
⭐ 這正是今天第四個量尺陷阱，已記進測試檔頭。

**改用的尺**：這幾個 container 的貼圖真的指向**幾塊不同的 `InternalTexture`**
＋ Babylon 自己的**引用計數**（歸零＝真引擎在那一刻呼叫 `_releaseTexture()` 刪 GPU 貼圖）。

**自證（`CALIBRATION` 那一條 `it`）**：關掉去重，三份已知共用同一張 atlas 的 prop
**必須量到 3**。量不到 3 ⇒ ⛔ **底下每一條結論作廢**。

| | 量到 |
|---|---|
| 校準（去重 OFF，已知重複） | **3 塊** ✅ 尺看得見重複 |
| 三份 .glb 的圖片內容摘要 | **1 個**（`set(digests).size === 1`）⇒ 重複是真的，⛔ 不是我假設的 |
| 去重 ON | **1 塊** ⇒ 3 → 1 |
| 正典的引用計數 | **3**（三個 container 都持有 ⇒ 真引擎不會刪掉還在用的圖） |
| 被換掉的兩塊 | 引用計數歸零 ⇒ `_releaseTexture()` 真的被呼叫 |
| 跨 Scene | 第二個 Scene 拿到**自己的**那一塊（⛔ 不是借第一個的 ⇒ 第 2 回合不會整片變黑） |

## 👁 「有沒有東西變不見」—— 逐項斷言（這是可見性的那一半）

去重之後，對三個 container 的**每一個**物件：

| 斷言 | 結果 |
|---|---|
| 每張貼圖 `isReady()` | true |
| 每張貼圖 `width × height` | > 0（⛔ 不是被換成一塊空的） |
| 每個 mesh `isEnabled()` | true |
| 每個材質 `alpha` | 1（⛔ 沒有被順手改成透明） |

⭐ **突變驗證**：把承重那一行（`_texture = theirs` 的指標交換）拿掉 ⇒
**4 條裡 3 條紅**，而 `CALIBRATION` 那條**維持綠**（正確 —— 它量的是尺，⛔ 不是功能）。

## 📐 換算到出貨場景（⛔ 區間 ＋ 分母）

分母：`content/assets/model-budget/report.json` 的 **17 個畫面 · 285 個模型**（出貨態普查）。

| | 區間 |
|---|---|
| 每個戰鬥場景省下的 VRAM | **26.7 – 48.0 MB**（分母：13 個 scene 列） |
| 第一回合的貼圖**上傳次數** | **9 – 26 次 → 5 – 18 次**（每場景省 1–9 次 1024² 上傳） |
| 48 MB 閘 | 13 個「已接受」的 scene 越界裡 **11 個回到閘內** |

⚠️ 這是**行為相依**的量：實際省多少取決於那一場用哪張圖、擺了哪些 prop
⇒ ⛔ 不報單一數字。

## ⛔ 還缺的那一步（誠實）

1. **真瀏覽器逐格 A/B** —— 開 `ggd.adms.ai` 之外的 localhost，同一張圖前後各一張截圖，
   確認**逐格相同**（這個改動的正確結果是「看不出差別」）。
   ⇒ 在這一步之前：**⛔ 不可以說「已修」**，只能說「鏈路已接上、資源層已量到」。
2. **`report.json` 依「每張不同的圖」重算** —— 那支寫在本 lane 柵欄外
   （`content/assets/model-budget/`），重算之後 11 個 accepted 列才刪得掉。
3. **後台三住處開關** —— 目前的一鍵回頭是
   `localStorage["ggd.textureDedup"]="off"` / console `__ggdTextureDedup(false)`；
   `content/config` + Zod + admin 那三格在柵欄外，要另一條 lane 補。
