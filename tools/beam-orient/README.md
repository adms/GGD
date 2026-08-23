# beam-orient —— 「90 度橫放的 beam」的量尺（#555）

> owner 2026-08-22：「**翻滾光束應該包含 90 度橫放的 beam 吧**」
> 　　　　　　　　　「許多角色的**衝擊波特效橫放 beam**」

```bash
python3 tools/beam-orient/scan.py            # 普查表（哪一份模型的長軸在哪一軸）
python3 tools/beam-orient/scan.py --json     # 重寫 census.json
python3 tools/beam-orient/scan.py --write    # 把提案寫進 content/models/*.json
python3 tools/beam-orient/scan.py --check    # 閘：**兩個方向**（非零離開）
```

## ⭐ 2026-08-23：`--check` 從一個方向變成兩個

owner：「橫放 beam 從未生效⋯**太扯了 這一版一定要上線**」

在此之前 `--check` 只問**方向①「宣告了的對不對」**，而缺陷是
**「在用的沒有宣告」** —— 兩件事，而①**結構上叫不出**②：

| | 問什麼 | 對 2026-08-23 的缺陷 |
|---|---|---|
| ① 出貨文件 vs 現場重解 | 「這 2 份宣告的軸對不對」 | **永遠綠**（那 2 份確實是對的） |
| ⭐ ② 在用的有沒有結論 | 「會動的節點用到的每一份，有沒有一個答案」 | 逐支指名 |

根因在**掃描器**：`spawn_model_fx_uses()` 在此之前只認**字面** `modelKey`，
而 `content/modelFxPreset.ts` 是在**載入時**才把 `params[*].default` 補進節點。
⇒ 走 `preset` 的節點對它完全隱形 ⇒ 普查表上沒有「★使用中」⇒
`--write` 的名單（來自 `usedBy`）**從來不會包含 owner 點名的四支經典**。
現在掃描器展開 `content/ability-templates/*.json`，`via` 欄位記著它是
`literal` 還是 `preset:tpl-beam-roll`。

⚠️ 方向②**只看會動的節點**：`path:"orbit"` 的實例 sim 送 `dx=dz=0`
（`sim/effects/spawnModelFx.ts` 逐字：「`dx=dz=0` = sim 說這一具**不動**」），
長軸修正對它逐位元沒有效果 ⇒ 替它宣告是一句「說了但不會發生」（第一·五守則）。
出貨的 30 個 `spawnModelFx` 節點裡有 **10 個**是 orbit。

## 缺陷（量到的，⛔ 不是推測）

`spawnModelFx` 只給了模型一個**繞世界 Y 的偏航**。偏航轉不動「立著的東西」，
所以一份沿自己 X（或 Y）建的網格，它的長軸**恆**垂直於行進方向 ——
不管施法者朝哪裡、不管翻滾轉到第幾圈（`modelFxAxis.test.ts` 第三、四條斷言把
這個「恆等於零」釘住）。

| 模型 | rest bbox | 誰在用 | 畫面上 |
|---|---|---|---|
| `imported.netherstrike` | 26.92 × **30.71** × 26.92 | 四支經典 × 本體/變身態＝**7 個**節點（全部走 `preset:tpl-beam-roll`） | 一根**直立**的柱子平移過去 |
| `imported.fireblast` | **4.03** × 2.67 × 2.56 | 莉娜 龍破斬（`godie-h020.e` / `godie-hjai.e`，走 `preset:tpl-line-blast`） | 火焰**橫著**飛 |
| `imported.darkraor` | **2.53** × 2.50 × 2.17 | 38-03 邪王炎殺黑龍波的**龍頭**，4 個節點 | 龍頭**側著**飛（2026-08-23 補上 `x`） |

## 出貨的 30 個 `spawnModelFx` 節點，逐一有個歸屬（2026-08-23 量到）

| 份 | 節點 | 裁決 |
|---|---:|---|
| `imported.netherstrike` | 7 | 宣告 `y` ✅ |
| `imported.fireblast` | 2 | 宣告 `x` ✅ |
| `imported.darkraor` | 4 | ⭐ 宣告 `x`（這一版補的） |
| `imported.frostnova` | 2 | ⭕ **旋轉對稱**（14 邊形圓環，±9.36 × 0 × ±9.60，完全置中）⇒ 沒有長軸 |
| `imported.blackhole` | 4 | ⛔ **豁免**：`.glb` 的 `meshes` 是空陣列（原作的可見部分是粒子發射器，mdx→glb 沒帶過來） |
| `imported.herocloudstrife` | 1 | 規則①：`walks` ⇒ ⛔ 不可以被放倒 |
| 6 份（tectonicfury / herocloudcyd / deathwave / earthtornado2 / oblivionaura / heromusashimiyamoto） | 10 | `path:"orbit"` ⇒ `dx=dz=0`，長軸修正逐位元沒有效果 |

## 答案住在 `model@1.fxLongAxis`，⛔ 不住在技能上

「這一份 mdx 當初朝哪一軸建」是**網格自己的性質**。同一份 `netherstrike.glb`
今天被兩支技能引用，⛔ 寫在技能上就是同一個事實有 N 個住處（第〇·四守則）。
文件只寫**哪一軸**（級別名），角度在載入時由 `modelFxAxisCorrection()` 解析。

## 三條**拒絕提案**的規則

| 規則 | 為什麼 |
|---|---|
| ⛔ **會走路的模型不提案**（glb 裡有 `walk`/`run` 動畫） | 克勞德幻影 / Saber 殘影這一族長軸也是 Y。把它們對齊行進方向＝**把角色摔在地上** |
| ⛔ **`z` 不寫進文件** | Babylon 的前方就是 +Z ⇒ `"z"` 是恆等變換。寫了是一句「說了但不會發生」的宣稱（第一·五守則），ABSENT 已經是它的意思 |
| ⭐ ⛔ **旋轉對稱的網格沒有長軸** | `imported.frostnova` 是一個 14 邊形**圓環**（±9.36 × 0 × ±9.60，三軸偏心全 0.000）。bbox 會硬選 `z`（只贏 2.6%），⛔ 但那是取樣雜訊 —— 一個圓盤怎麼繞 Y 轉都一樣 |

`--write` 另外**只動被「會動的」節點引用的模型**（`--all` 才寫全部）——
一個沒有人用、或用在 `orbit` 上的欄位，就是一句沒有人驗過的宣稱。
⚠️ 在補上這一條之前，照 README 跑 `--write` 會替 `imported.earthtornado2` 與
`imported.oblivionaura` 各寫一格 —— 而那兩份**只被 `orbit` 節點引用**。

## `ratio` 那一欄是提醒，⛔ 不是門檻 —— 而它需要第二個訊號

`ambiguousRatio = 1.20`（最長邊 / 第二長邊）只標「這個排名穩不穩」，
⛔ 不是「夠不夠細長」—— 後者會把 `netherstrike`（27×31×27，粗但真的是**立著**的柱子）
誤殺，而它正是 owner 點名的那一支。

⭐ **但排名平手的時候 bbox 就是擲硬幣**，而規則是「⛔ 不要猜一個軸」。
`imported.darkraor`（黑龍波的龍頭）是 2.532 × 2.496 × 2.167 —— 最長只贏 **1.4%**。
⇒ 再量一個獨立的訊號：**幾何往哪一邊長出去**（`offsetFrac` ＝ bbox 中心離原點多遠，
佔那一軸半邊長的比例）。一具沿自己某軸建的飛行物，頭在前面 ⇒ 幾何**偏**在那一軸。

| 模型 | bbox 排名 | offsetFrac | 結論 |
|---|---|---|---|
| `netherstrike` | y（1.141，平手） | **y 0.844** · x 0.005 · z 0.014 | y ✅（與已裁決的一致） |
| `fireblast` | x（1.509） | **x 0.649** | x ✅（與已裁決的一致） |
| `darkraor` | x（1.014，**擲硬幣**） | **x 0.567** · y 0.285 · z 0.038 | ⭐ x —— ⛔ 不是猜的 |
| `frostnova` | z（1.026） | 0.000 · — · 0.000 | ⭕ 旋轉對稱，沒有長軸 |
| `tectonicfury` | z（1.140） | **x 0.801** | ⚠️ **兩個訊號打架** ⇒ ⛔ 不提案（它只被 orbit 用，今天不咬人） |

⭐ 旁證（⛔ 不寫進程式，這裡只是說明為什麼 `darkraor` 的 x 站得住）：
那份 glb 的骨架是 `Bone_Rocket`(−0.232, 0, 0) → `Rocket`(+0.700, 0, 0)，
**一條純 X 的鏈**；而 w3x 的飛行物慣例本來就是沿 +X 建。

## ⛔ 豁免表：有在用、會動，而永遠不會有長軸

`scan.py` 的 `EXEMPT` 一列一個**能被反駁的理由**，而且 `expect` 每次都被重解 ——
那份 `.glb` 哪天重匯出成別的樣子，這一列**自己過期並紅**（⛔ 不是靜靜地繼續豁免）。

今天只有一列：`imported.blackhole` —— 那份 `.glb` 的 `meshes` 是**空陣列**，
10 個節點全是 Dummy/Bone（原作 `BlackHole.mdl` 的可見部分是粒子發射器，
mdx→glb 沒有帶過來）。⇒ 沒有幾何可以對齊。
⚠️ 它同時是一個**更大的**缺陷：38-03 邪王炎殺黑龍波的「龍身」在畫面上一個像素都沒有
（而 `fxTint` 還替它填了純黑）—— ⛔ 那不歸這支工具修。
