# 🔗 出貨 `.glb` 的**後處理鏈**（GH#841 Scope④ 的答案）

> ⭐ 這一份回答一個問題：**「重跑轉檔器為什麼會毀資料？」**
> ⛔ 答案不是「轉檔器有 bug」，是 **出貨樹上疊著轉檔器不知道的四層後處理**。

---

## ⭐ 量到的（2026-09-01）

`tools/w3x-import/convert_stock_model.py` 把 mdx 轉成 glb。
⭐ 而出貨樹上的檔案**不是它的直接產物** —— 它們之後被**四支腳本**改寫過：

| # | 腳本 | 它做什麼 | 重現得出來嗎 |
|---:|---|---|---|
| ① | `strip_geoset_prims.py` | 拿掉 GEOA 藏起來的特效 primitive（task #59） | ⭐ **要**：`JOBS` 是一張**手寫的名單**（索隆／飛影／林克三筆） |
| ② | `rebake_stripped.py` | 把英雄重烘過特效 geoset 閘（task #17/#32） | ⭐ **要**：逐支呼叫 |
| ③ | `rebake_textures.py` | 換掉內嵌的 8×8 灰色佔位貼圖（task #33） | ⭐ **要**：只對「有佔位圖」的檔跑 |
| ④ | `flatten_root_float.py` | 殺掉 root-motion 浮空（task #162） | ⭐ **要**：逐支 |

⇒ ⭐ **裸重跑 `convert_stock_model.py` ＝ 把這四層全部丟掉。**

---

## ⭐ 這正是那 10 份掉 TeamGlow 的機制

GH#841 這一輪量到：重跑 129 份裡 **10 份掉 TeamGlow**、16 份 prim 變多、15 份只換 `alphaMode`。
⭐ 掉 TeamGlow 的那 10 份，掉的就是 ①／② 的產物。

⚠️ ⭐ 而**沒有任何東西會紅** —— glb 仍然合法、載得進去、畫得出來，
只是**少了一層**。⇒ 棘輪 `glbRegenRatchet.test.ts`（TeamGlow 12 只能變多）就是為此而立。

---

## ⛔ 所以 Scope④「重跑產線」的正確形狀

⛔ **不是** `for f in *.mdx; do convert_stock_model.py $f; done`
⭐ **而是**：

```
① convert_stock_model.py            ← 轉檔（唯一產生者）
② strip_geoset_prims.py             ← 照 JOBS 名單
③ rebake_stripped.py                ← 逐支
④ rebake_textures.py                ← 只對有佔位圖的
⑤ flatten_root_float.py             ← 逐支
⑥ npx vitest run …glbRegenRatchet   ← ⭐ 棘輪驗「TeamGlow 沒變少」
```

⚠️ ⭐ 而 ②③④⑤ 的**輸入名單本身是散在四個檔裡的手寫表** ——
⇒ ⭐ **這才是 Scope④ 真正要做的事**：把那四張表收成**一份可讀的清單**，
⛔ 不是「再跑一次轉檔器」。

---

## ⭐ 判準（下一輪動它之前先問）

| ⛔ 不要問 | ⭐ 要問 |
|---|---|
| 「轉檔器輸出對不對？」 | 「這一份出貨檔**經過幾層後處理**？」 |
| 「重跑之後 diff 大不大？」 | 「⭐ **TeamGlow 有沒有變少**？」（那是無聲的損失） |
