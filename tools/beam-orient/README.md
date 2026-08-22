# beam-orient —— 「90 度橫放的 beam」的量尺（#555）

> owner 2026-08-22：「**翻滾光束應該包含 90 度橫放的 beam 吧**」
> 　　　　　　　　　「許多角色的**衝擊波特效橫放 beam**」

```bash
python3 tools/beam-orient/scan.py            # 普查表（哪一份模型的長軸在哪一軸）
python3 tools/beam-orient/scan.py --json     # 重寫 census.json
python3 tools/beam-orient/scan.py --write    # 把提案寫進 content/models/*.json
python3 tools/beam-orient/scan.py --check    # 閘：出貨文件 vs 現場重解（非零離開）
```

## 缺陷（量到的，⛔ 不是推測）

`spawnModelFx` 只給了模型一個**繞世界 Y 的偏航**。偏航轉不動「立著的東西」，
所以一份沿自己 X（或 Y）建的網格，它的長軸**恆**垂直於行進方向 ——
不管施法者朝哪裡、不管翻滾轉到第幾圈（`modelFxAxis.test.ts` 第三、四條斷言把
這個「恆等於零」釘住）。

| 模型 | rest bbox | 誰在用 | 畫面上 |
|---|---|---|---|
| `imported.netherstrike` | 26.92 × **30.71** × 26.92 | Saber 約束與勝利之劍（`godie-e002.e` / `godie-e00l.e`） | 一根**直立**的柱子平移過去 |
| `imported.fireblast` | **4.03** × 2.67 × 2.56 | 莉娜 龍破斬（`godie-h020.e` / `godie-hjai.e`） | 火焰**橫著**飛 |

## 答案住在 `model@1.fxLongAxis`，⛔ 不住在技能上

「這一份 mdx 當初朝哪一軸建」是**網格自己的性質**。同一份 `netherstrike.glb`
今天被兩支技能引用，⛔ 寫在技能上就是同一個事實有 N 個住處（第〇·四守則）。
文件只寫**哪一軸**（級別名），角度在載入時由 `modelFxAxisCorrection()` 解析。

## 兩條**拒絕提案**的規則

| 規則 | 為什麼 |
|---|---|
| ⛔ **會走路的模型不提案**（glb 裡有 `walk`/`run` 動畫） | 克勞德幻影 / Saber 殘影這一族長軸也是 Y。把它們對齊行進方向＝**把角色摔在地上** |
| ⛔ **`z` 不寫進文件** | Babylon 的前方就是 +Z ⇒ `"z"` 是恆等變換。寫了是一句「說了但不會發生」的宣稱（第一·五守則），ABSENT 已經是它的意思 |

`--write` 另外**只動正在被 `spawnModelFx` 引用的模型**（`--all` 才寫全部）——
一個沒有人用的欄位就是一句沒有人驗過的宣稱。

## `ratio` 那一欄是提醒，⛔ 不是門檻

`ambiguousRatio = 1.20`（最長邊 / 第二長邊）只標「這個排名穩不穩」，
⛔ 不是「夠不夠細長」—— 後者會把 `netherstrike`（27×31×27，粗但真的是**立著**的柱子）
誤殺，而它正是 owner 點名的那一支。
