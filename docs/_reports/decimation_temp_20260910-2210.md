# 模型減面 ≥10,000 → ≤8,000 —— 完整報告（2026-09-10）

> owner 逐字：「超過一萬面 減面到 8000以下 並且要通過檢驗 通過以後原始檔一樣保留只是放到S3 只有正式採用才放到git」

| | |
|---|---|
| 帳本 | `materials/model-decimation/decimation-ledger.json` |
| 要重新註冊的英雄 | `materials/model-decimation/needs-reregister.json` |
| 原始檔（S3） | `s3://ggd-390630837668-ap-east-2-an/model-decimation/20260910/originals/`（17 顆 ＋ `_originals.sha256`，⭐ **下載回來逐顆比對過 17/17 相符**） |
| 本機留底 | `docs/legacy/_overwrites/decimate_temp_20260910-215710/`（未追蹤，⛔ 不進 git） |
| 候選樹 | `tools/model-budget/optimized-out/`（優化器從不就地覆蓋；採用是我另外複製的一步） |

---

## ⛔⛔ 最重要的一件事：**減來源檔，玩家端一個位元組都不會變**

13 隻英雄的 `modelKey` **全部**是 `version.body.<hash>`，而那個模型文件的 `glbPath` 指向
`content/assets/models/*/versions/<sha256>.glb` —— ⭐ **內容定址的凍結副本**。

```
champion.modelKey  →  content/models/version.body.<h>.json  →  assets/models/ou99/versions/<sha>.glb
                                                                 ↑ 玩家真的載入的是這一顆
content/models/ou99.456546.json → assets/models/ou99/ou99_456546.glb
                                   ↑ 我減面的是這一顆
```

⚠️ 量到的：**13/13 個「現用 glb >10,000 面」的英雄，用的都是凍結副本，⛔ 零個用來源檔。**
⇒ 這是 CLAUDE.md 失敗形態⑧（「消費端存在，但它消費不到」）與
「鏈路已接上 ≠ 玩家看得到」的同一個形狀 —— ⭐ 而**每一條既有的閘都會是綠的**：
檔案減面了、rig 沒壞、驗證全過、`budget:guard` 對來源檔會說 OK。

⭐ **要讓玩家拿到 8k 版，必須跑模型版本流程**（register + activate）把**現在已減面的來源**
凍成一份新的 `version.body.*`，並把 `champion.modelKey` 指過去。
⛔ 那要寫 `content/champions/*.json` —— **不在我的柵欄裡**，所以我只產出清單：
`materials/model-decimation/needs-reregister.json`（**12 隻**要重新註冊）。

⚠️ 而這是**會漂的**：我做這件事的同時，另一條 lane 正在寫新的 `versions/*.glb`
（`content/assets/models/**/*.glb` 從 506 顆長到 527 顆，其中
`versions/845d3bd….glb` 的時間戳 21:45 比我第一次量測還晚）。
⇒ ⭐ **每一次在減面之前凍結，就把一顆 >10k 的模型鎖進玩家路徑一次。**

---

## 結果：掃 17 顆來源模型，**採用 14 · 不採用 3**

| | 面數 | 亮像素 Δ | 判定 |
|---|---:|---:|---|
| `ou99.456546` | 17,942 → 7,999 | −0.01% | ✅ 採用 |
| `ou99.459617` | 17,216 → 7,995 | 0.00% | ✅ 採用 |
| `ou99.491448` | 16,643 → 7,963 | −2.34% | ✅ 採用 |
| `ou99.472038` | 16,328 → 7,995 | −2.43% | ✅ 採用 |
| `ou99.497211` | 15,989 → 7,970 | −1.08% | ✅ 採用 |
| `ou99.453949` | 13,968 → 7,987 | +0.81% | ✅ 採用 |
| `ou99.498214` | 13,132 → 7,997 | −0.76% | ✅ 採用 |
| `ou99.472035` | 12,942 → 7,985 | −2.79% | ✅ 採用 |
| `ou99.467227` | 12,778 → 7,997 | +0.48% | ✅ 採用 |
| `ou99.481732` | 12,171 → 7,992 | +4.52% | ✅ 採用（離門檻最近，肉眼同一隻） |
| `ou99.491497` | 10,558 → 7,994 | −0.73% | ✅ 採用 |
| `ou99.487191` | 10,416 → 7,997 | −1.96% | ✅ 採用 |
| `ou99.496452` | 10,110 → 7,998 | +0.11% | ✅ 採用 |
| `imported.doraemon-cat` | 19,681 → 7,864 | −0.28% | ✅ 採用 |
| **`ou99.496905`** | 19,681 →（不動） | **−10.29%** | ⛔ **不採用** |
| **`menu/dragon2.glb`** | 19,542 →（不動） | **量不到** | ⛔ **不採用** |
| **`menu/dragon2-mid.glb`** | 10,748 →（不動） | **量不到** | ⛔ **不採用** |

合計 249,845 → 161,704 面；採用的 14 顆檔案大小共省 **7.4 MB**。

### ⛔ `ou99.496905`（哆拉A夢，godie-n00b 現用）—— 紅披風第一刀就塌

亮像素 −10.29%，**肉眼確認**：角色本體完好，紅色披風從一整片塌成一條細片。

⭐ 而它**與預算無關** —— 我把 `errorBound` 收到 0.001（停在 **11,938** 面，遠高於 8,000）
仍然掉到 34,238（−9.6%）：

| | 面數 | 亮像素 |
|---|---:|---:|
| 來源 | 19,681 | 37,873 |
| errorBound 0.001 | 11,938 | 34,238 |
| errorBound 0.004 | 8,738 | 34,001 |
| 出貨候選 0.02 | 7,958 | 33,977 |

⇒ 披風是**薄片**，`weld()` + `simplify()` 第一刀就吃掉它的寬度。⛔ 再調參數沒有用。

⭐ **出路在內容側**：**同一個角色**的另一份匯出 `imported.doraemon-cat`
（22 個 primitive，⛔ 不是 3 個）減到 **7,864 面只掉 0.28%**，披風完好。
⇒ 讓 `godie-n00b` 走 doraemon-cat 那一脈就同時拿到 8k 與視覺無損 ——
⛔ 那是 `content/champions/*.json` 的決定，不在我的柵欄。

### ⛔ `menu/dragon2.glb` / `dragon2-mid.glb`（登入巨龍）—— A/B **無法判定**

⭐ **「減面前」在實拍台上就渲不出任何像素**（`litA = 0`，而量尺已雙向校準）。
逐位元組查了它的 glTF：

```
extensionsUsed : EXT_texture_webp, KHR_materials_pbrSpecularGlossiness
material_0     : alphaMode MASK · doubleSided · ⛔ pbrMetallicRoughness 沒有 baseColorTexture
```

three.js 的 GLTFLoader **已經不支援** `KHR_materials_pbrSpecularGlossiness`
⇒ 退回核心 PBR ⇒ 沒有貼圖 ＋ `alphaMode:MASK` ⇒ 整顆被 alphaTest 切光。

⚠️ ⭐ **這是「它在哪一個環境沒有在跑」，⛔ 不是「它壞了」** ——
遊戲用的是 Babylon，這台實拍台是 three.js。
⛔ 量不到「之前」就量不到「差異」⇒ 依驗收條件**不採用**。

⭐ 候選檔仍在 `tools/model-budget/optimized-out/assets/models/menu/`
（7,999 / 8,000 面、rig ok、`model_intake` 零新問題）。**要採用只差一件事**：
換一台 Babylon 的實拍台把 `litA > 0` 量出來。
⚠️ 順帶：這兩顆是**登入畫面的道具**（`hero-prop`，`usedBy: LOGIN 登入巨龍 ×2`），
⛔ 沒有任何 `model@1` 文件，⛔ 也不是英雄預算的一部分。

---

## 驗證：四關，每一關都記下「它為什麼算數」

### ① rig 存活（優化器內建）
17/17 `skins` / `joints` / `clips` / `channelsPerFrame` 前後完全相同，`0 rejected`。
（meshopt 的 simplifier 是 skin-aware，會把 `JOINTS_0` / `WEIGHTS_0` 帶過去。）

### ② `model_intake.py` —— ⛔ **它的離開碼不是閘**

⭐ 校準時抓到的：餵它 200 KB 亂數，它印「⛔ 讀不開：不是 GLB」而 **離開碼仍然是 0**。
⇒ 要讀「⛔ 有問題 N」那一行，⛔ 不要讀 `$?`。

⇒ 所以我**對來源也跑了一次**當基準線，比的是**新增的**問題：

| | 17 顆 |
|---|---|
| 減面**引入**的新問題 | ⭐ **0** |
| 來源自己的既有債（照舊） | `doraemon-cat` draw 22 > 6 · `dragon2{,-mid}` 貼圖是佔位圖 |

### ③ 視覺 A/B —— 量尺**雙向校準**，而校準抓到了量尺自己的缺陷

量尺：`ou99-model-shots.html`（three.js，512×512，背景 `#15151a`），
「亮像素」＝ 與背景色歐氏距離 > 24 的像素數。

| 方向 | 期望 | 量到 |
|---|---|---|
| 已知**有** | > 2000 | 37,873 ✅ |
| 已知**沒有**（不存在的路徑） | == 0 | 0 ✅ |
| 可重複 | 相同 | 37,873 ✅ |

⛔⛔ **第一版校準是紅的，而它救了整份結論**：載入失敗時量到 37,873（＝「已知沒有」量成
「有」）。根因是 `__load` 的**錯誤路徑不呼叫 `renderer.render()`** ⇒ canvas 還留著
**上一顆模型的那一幀**。⭐ 這正是 CLAUDE.md 記過的「`readPixels` 讀到上一幀」。
修法：讀像素前先 `__shot()` 強制重繪。
⚠️ **只驗「已知有」那一邊的話，這條 lane 的每一個 −0.28% 都是假的。**

判準：`|Δ亮像素| < 5%` **且**肉眼是同一個角色（我逐格看了接觸表；
14 顆的剪影、配色、姿勢與來源無法區分）。

### ④ 貼圖**完全沒動**（刻意）
一律加 `--tex-edge 1024` ⇒ 貼圖階段對這批全部是 no-op。
實測 VRAM 前後相等（例：`dragon2` 21.33 → 21.33 MB）⇒ ⭐ 這一批**只動幾何**。

---

## 改到的一支工具：`tools/model-budget/optimize/decimate.mjs`

第一次整批跑的時候在 `dragon2-mid.glb` **整個中止**：

```
Error: Missing required extension, "EXT_texture_webp".
    at GLTFReader.validate  →  at decimate.mjs:36
```

⚠️ ⭐ 而那**不是**「這顆減不下去」，是 `io.read()` **根本沒讀進來** ——
⛔ 而它用 `execFileSync` 擲出去，於是**後面 15 顆一顆都沒跑**。

修法一行：`new NodeIO().registerExtensions(ALL_EXTENSIONS)`
（`@gltf-transform/extensions` 本來就在 `.optvendor` 裡）。註冊只讓讀寫**原樣搬運**
那些擴充的位元組；減面動的仍然只有 index / vertex buffer。

⭐ 另外把整批改成**逐顆一個 process**：⛔ 一顆炸掉不可以帶走其餘 16 顆。

---

## S3（owner：「原始檔一樣保留只是放到S3 只有正式採用才放到git」）

```
s3://ggd-390630837668-ap-east-2-an/model-decimation/20260910/originals/
    _originals.sha256                      ← 17 顆的 sha256
    assets/models/imported/doraemon-cat.glb
    assets/models/menu/dragon2{,-mid}.glb
    assets/models/ou99/ou99_*.glb          （14 顆）
```

⭐ **上傳完整個抓回來 `shasum -c` 過：17/17 相符。**
⚠️ 值得記一筆：第一次 `aws s3 sync` 下載被 120s 逾時截斷 ⇒ 兩顆沒下完 ⇒ 驗證報 FAILED。
⭐ **「`sync` 離開碼 0」⛔ 不是「東西上去了」的證據** —— 是那次逐顆比對才問得出真話。

進 git 的只有：**14 顆已採用的減面檔** ＋ 帳本 ＋ 這份報告 ＋ 那一行 `decimate.mjs`。
⛔ 原始檔（46 MB）**不進 git**。

---

## 接手要做的三件事（⛔ 都不在我的柵欄裡）

1. ⭐ **12 隻英雄重新註冊模型版本** —— 見 `needs-reregister.json`。
   ⛔ 不做的話，這條 lane 對玩家的效果是**零**。
2. `godie-n00b`（哆拉A夢）：決定要不要切回 `imported.doraemon-cat` 那一脈
   （8k ＋ 披風完好），或維持 `ou99.496905` 的 19,681 面。
3. 登入巨龍兩顆：需要一台 **Babylon** 的實拍台才驗得了；候選檔已經備妥。

⚠️ 另外：`content/assets/model-budget/report.json` 是 `emit_report` 的產物，
現在對這 14 顆是**過期的**（它還記著舊面數）。⛔ 我沒有跑它（併行工作流的鎖）。
