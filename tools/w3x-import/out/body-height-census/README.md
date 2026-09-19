# ou99 body-height census（GH#1176 的量測）

⭐ 問的是**一個關係**，⛔ 不是一個名詞：
**角色的頭**在「客戶端會拿去正規化的那個 bbox」裡佔幾成。

```bash
python3 tools/w3x-import/out/body-height-census/measure.py . \
  > tools/w3x-import/out/body-height-census/ou99-body-height.json
```

| | |
|---|---|
| 消費端 | `apps/client/src/render/views/modelSizing.ts` 的 `normalizedModelScale()`（`TARGET_HEIGHT = 1.8`） |
| 頭頂怎麼定 | 模型自己宣告的 `Overhead` 掛點 worldY（WC3 慣例：頭頂正上方）—— ⛔ 不猜「哪一片是身體」 |
| 分母 | `content/assets/models/ou99/*.glb` 130 顆；⛔ 其中 12 顆**沒有** `Overhead` ⇒ 回報「量不到」 |

⭐ 量尺兩個方向都校準過：
`ou99_467258` 量到 **0.526u / 29.22%**，而它自己的 `heroBodyNote` 獨立寫著「**0.53u ≈ 29%**」；
`ou99_487742`（batch4 判 pass、實拍 29,202 亮像素）量到 **2.084u** ⇒ 遠在門檻之上。

⚠️ 這份是 lane 的量測產出，⛔ 還不是閘。提案把它變成 `model_intake.py` 的第 ⑧ 項 ——
見 `docs/_reports/lubu-altria_temp_20260919-1707.md`。
