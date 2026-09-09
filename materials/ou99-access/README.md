# ou99 會員身分實測資料 —— 交給 hero-model-library 工作流

⭐ 這個目錄是**單向交接**：main session 量到的東西放這裡，
⛔ **不寫進 `materials/hero-model-library/download-sources.json`** ——
那是另一條工作流的寫入端，兩個寫入端共用一個檔就是 CLAUDE.md 記的「讀寫混淆」。

## ⚠️ 最重要的一件事：訪客 ≠ 會員

`download-sources.json` 的取用檢查是**訪客身分**做的，於是每一筆都是：

```
"paymentRequirement": "not-visible"
```

⛔ **那不是「不用付費」，是「看不到付費門」。**
⭐ 以 **偶久至尊会员** 身分實測，同樣這些帖每一筆都要 **599–1,999 元宝**（中位 899）。

⇒ 只讀那一欄會得到「免費」的錯誤結論。

## 內容

| 區塊 | 是什麼 |
|---|---|
| `measuredPrices` | ⭐ **114 帖逐帖實測價格**（⛔ 非推估）。合計 109,586 元宝 ≈ ¥1,096 |
| `downloadPath` | ⭐ 已打通的下載鏈路：302 → `attach.ou99.com` → curl 直取 |
| `conversionPipeline` | ⭐ mdx＋blp → glb 已驗證：**36 個動畫群組 · 1 副骨架 · 23 mesh** |

## 為什麼會員看得到價格而不用回覆

至尊特權含「**网站免回复查看内容**」⇒ 隱藏內容（含價格）不必回覆就讀得到。
⚠️ 會員到期後價格會縮回回覆閘後面。

## 兩個時限

- 付費內容 **24 小時**失效（站方逐字：`付费内容有效期24小时（下载后自行保存）`）
- `aid` token 也是短時效 ⇒ ⛔ 不要存 aid，每次重取

## 工具

```bash
bash scripts/ou99-prices.sh --file ids.txt --merge docs/ou99價格表.json   # 查價（零貼文）
bash scripts/ou99-fetch.sh <帖號…>                                       # 下載
```

⚠️ 兩支都要 `~/.ou99-cookie`（已登入分頁 console 的 `document.cookie`）——
⛔ 那一步機器做不到。
