> 切分依據是**檔案領域互斥**，⛔ 不是主題相近 —— 兩條 lane 只要會編到同一個檔就不能併行。

### ⭐ 瓶頸已解除：鎖是 `bundle.json`，不是 `content/` 目錄

原本以為「一次只能有一條 lane 碰 content」。實際上真正的鎖是 **`pnpm content:build` 寫出的 `bundle.json`**。
⇒ 只要**所有 lane 一律禁止跑 build**，content 的**來源檔**可以平行編（檔案互斥即可），
由主 session 最後跑一次 `pnpm skills:sync`。這一改把原本卡住的 31 張全部解開。

| run | 領域 | 票 | 狀態 |
|---|---|---|---|
| `wf_0e721af0` | **#451 連鎖閃電逐跳**（sim 排程 · 弧形視覺 · 內容接線 · 對抗 · 全域） | 451 | ✅ 5/5 |
| `wf_3439ab5b` | W1 平台與後台旋鈕 | 349 352 350 355 360 376 410 | ✅ |
| `wf_c93877d0` | W2 場地幾何與出生點 | 364 422 421 363 345 409 398 | ⏳ |
| `wf_3c43693e` | W3 音效與語音接線 | 402 436 403 440 441 | ✅ |
| `wf_9ab443dc` | W4 測試基建與閘 | 428 359 334 351 353 374 407 412 | ✅ |
| `wf_1407b978` | W5 文件與產生器一致性 | 449 389 426 381 417 335 | ✅ |
| `wf_a12df6a3` | **W6 卡面說了但不會發生** | 373 375 404 424 459 369 419 420 448 | ⏳ |

每條的內部形狀都是**實作 lane 併行 → 一個對抗複驗 + 一個全域檢查**。
⭐ 全域檢查（typecheck / 新鮮度閘 / 卡面說謊閘）**收成一個 agent 跨全部 lane 做一次** ——
六條各做一遍就是同一件事做六遍。

### ⚠️ 併行時會咬人的四件事

1. **假紅（已修）** —— GH#359：`gameAppFacingWiring` 在多 package 併行時撞 5000ms 逾時。
   ⭐ 根因不是票上寫的那個：它每個 `it()` 裡都 `await import("../GameApp")`，
   **2,189 ms 的模組載入被記在第一條斷言的 5,000ms 預算裡**。修法是把 import 搬到模組層
   （⛔ 不是調大逾時 —— 那是把偵測器關掉）。同負載 A/B 20 次：修前 **7 過 13 敗**、修後 **20 過 0 敗**。
2. **工作樹是唯一副本** —— 全部來自這個 session 的多條 lane，**沒有備份**。
   所有 lane 明令禁止 `git checkout <檔>` / `restore` / `stash` / `add -A`
   （2026-08-18 一次 checkout 洗掉三條 lane）。
3. **`bundle.json` 是全域鎖** —— 同時跑 build 會產出壞掉的 bundle（2026-08-01 讓選人畫面整個空掉的形態）。
4. **subagent 紅線** —— 每條 lane 都明令：⛔ `gh issue create`、⛔ ssh/curl 正式站、⛔ `content:build`。

### 📌 這一版的整合待辦（主 session 做，不派工作流）

- `pnpm skills:sync` —— 全部 lane 落地後跑**一次**（`contract:numbers --check` 現在是紅的：引擎長到 40 個 kind）
- `python3 tools/icon-console/emit_style_spec.py` —— 等 `prompt.py` 定稿
- `pnpm exec tsx tools/model-budget/emit_report.ts` —— `report.json` 現在就過期，而**沒有守衛會說**
- `eventFanout.ts:114` 的註解已成假話（線路成本從「施放次數」變成「跳數」）
