> 切分依據是**檔案領域互斥**，⛔ 不是主題相近 —— 兩條 lane 只要會編到同一個檔就不能併行。

### ⭐ 瓶頸已解除：鎖是 `bundle.json`，不是 `content/` 目錄

原本以為「一次只能有一條 lane 碰 content」。實際上真正的鎖是 **`pnpm content:build` 寫出的 `bundle.json`**。
⇒ 只要**所有 lane 一律禁止跑 build**，content 的**來源檔**可以平行編（檔案互斥即可），
由主 session 最後跑一次 `pnpm skills:sync`。這一改把原本卡住的 31 張全部解開。

### 📊 這一版的統整（2026-08-16 起）

| | 數 |
|---|---:|
| 本版開票總數 | **136** |
| 已關 | 29 |
| **仍開** | **107** |
| 　└ 已排進 9 條工作流 | **54** |
| 　└ **還沒排** | **53** |

### 已派出的 9 條

| run | 領域 | 票 | 狀態 |
|---|---|---|---|
| batch 1 | ground 護盾 · 商店回血 · 宿敵榜 · 逐階冷卻 · slash 動畫 · LoRA/SDXL · 卡面說謊 · 文案規則 | 458 455 454 464 456 457 459 461 | ✅ 13/13 |
| batch 2 | 連鎖閃電機制 · FATE 配色 · 場外背景 · 描述↔JSON 對帳 | 451 453 452 462 | ✅ 4/4 |
| `wf_0e721af0` | **#451 連鎖閃電逐跳**（sim 排程 · 弧形視覺 · 內容接線 · 對抗 · 全域） | 451 | ✅ 5/5 |
| `wf_3439ab5b` | W1 平台與後台旋鈕 | 349 352 350 355 360 376 410 | ✅ |
| `wf_c93877d0` | W2 場地幾何與出生點 | 364 422 421 363 345 409 398 | ✅ |
| `wf_3c43693e` | W3 音效與語音接線 | 402 436 403 440 441 | ✅ |
| `wf_9ab443dc` | W4 測試基建與閘 | 428 359 334 351 353 374 407 412 | ✅ |
| `wf_1407b978` | W5 文件與產生器一致性 | 449 389 426 381 417 335 | ✅ |
| `wf_a12df6a3` | **W6 卡面說了但不會發生** | 373 375 404 424 459 369 419 420 448 | ⏳ |
| `wf_03096cae` | **W7 特效家族與綁定搬進 content** | 378 427 384 431 439 425 392 | ⏳ |

### 🔀 還沒排的 53 張 → 下一批工作流（按檔案領域互斥切）

| 候選 | 領域（互斥的檔） | 票 |
|---|---|---|
| **W8 四軸級距與數值** | tier config · `skillTiers.ts` · admin · docs | 414 438 444 445 446 447 460 465 433 464 430 |
| **W9 EX／三選一內容** | `content/augments` · `content/items` · grail CSV | 333 356 357 358 347 354 |
| **W10 特效方位與形狀** | vfx 方位 · slash · 沿線推進 · 掛件 | 377 379 385 400 401 432 442 450 366 |
| **W11 場景與資產** | arena 裝飾 · scenery · VRAM · 場外背景 | 332 362 382 386 396 397 346 452 |
| **W12 HUD 與練習模式** | `apps/client/src/ui` · 練習房 | 343 344 361 365 367 368 370 348 |
| **W13 回合清理與召喚** | 回合邊界 · 召喚生命週期 | 429 423 |
| **W14 契約與普查** | Codex 契約 · 全英雄普查 · 版權規則 | 371 372 443 |

⚠️ **W8 是其他幾條的前置**（級距數值定了，卡面文案與普查才有基準），但它**現在被 owner 的四份三選一擋著**。

### ⛔ 尚未開票、但 owner 已經說過的

| 事 | 出處 | 現況 |
|---|---|---|
| **魔力每級成長曲線重算**（50 級連續 4~8 次範圍技能耗盡 · 0→滿魔 20 秒） | 08-19 22:30 | 已回寫 #446，⛔ 還沒有獨立票 |
| **參考錨點改 30/50/99**（不是 L18） | 08-19 19:30 | 已回寫 #446 #447 |
| **9 支技能的級距直接裁決**（鬼眼→極大⋯式神炸裂→中） | 08-19 22:30 | 已回寫 #433，⛔ 一支都還沒落地 |
| **FATE 圖示全量重產**（「backup all icons then re-gen」） | 08-19 19:05 | 備份完成 2168 檔，⛔ **重產未做** |
| **檔案拆分策略**（讓大量改技能時的平行化不卡住） | 08-20 01:2x | ✅ **#467 已落地**（見下） |

### ✅ #467 拆檔案（owner：**優先做因為關鍵**）—— 四個單一寫入者已全部拆掉

| 檔 | 原本 | 誰被擋住 | 現在 |
|---|---:|---|---|
| `tools/skill-remake/batch1.py` | **3,354 行**，擁有 20 個 id / 113 份 JSON | 任何改到那 20 位英雄的 lane | 393 行殼 + `common.py` + **`heroes/<英雄 id>.py` × 15** |
| `packages/shared/src/content/schema/effect.ts` | **4,754 行 / 40 個 kind** 在一個 union | 任何**新機制** | 299 行門面 + **`schema/effects/<kind>.ts` × 40** |
| `packages/shared/src/sim/effects/effect.ts` | **2,751 行**（同一個 TS union） | 同上 | 430 行 + **`sim/effects/variants/<kind>.ts` × 40** |
| `descriptionClaims.baseline.ts`（181）· `abilityCodeParity.baseline.ts`（342） | 全域棘輪 | 每一條修卡面的 lane | 兩支只剩 loader（50 / 48 行）+ **60 / 22 份逐英雄 JSON** |
| ✅ `content/abilities/` | **462 檔，一技能一檔** | — | ⭐ 本來就切好了 —— 瓶頸**不在內容** |

**分片軸**：內容按**英雄**（正規化+說明校正+實作+該支驗證要一起做）·
引擎按**機制**（一個 effect kind 解鎖 N 支）· 全域檢查**收一次**。
⇒ 三條軸的併行上限從 **1** 變成 **15 / 40 / 60**。

**安全網**：`tools/shard/snapshot_generated.py`
—— 基準取自**凍結的 commit**（⛔ 不是會被別的 lane 編輯的工作樹），
分片後產出必須**逐位元組相同**。收工時 `--compare` 只有一筆漂移
（`godie-e010.r.json`，W6 的**內容修正**，與分片無關）＝ **新漂移 0**。
它在啟用當下就抓到那一筆，證明它會紅；分片途中另外抓到**兩次真的行為漂移**
（refiner 派發表漏 12 處 → 7 條負向探針從「拒絕」變「通過」；`zEffectDef` 從
`ZodLazy` 變 `ZodEffects` → 三個 walker 分岔而不報錯），兩處都已還原。

**三條會紅的閘**（⛔ 不是三條要記得的判準）：`batch1.py::load_heroes()` 的雙向註冊表閘 ·
`schema/effects/effectShardWiring.test.ts` 的四向閘 · `baselineShards.ts` loader
（檔名↔內容錯位 / `[]` 空殼 / 跨檔重複 / 孤兒檔）。三條都做過突變驗證。

**對外落點已寫**：README §9「大量改技能時的檔案分片」· Codex 契約 §3 覆蓋表（**產生的**）·
`docs/技能標記機制與效果規則.md` §5 每個 kind 的「定義檔」行（**產生的**）·
`v0.21.5-draft.md` 的 #467 一節。⛔ `package.json` 與後台設定不需要改，理由寫在 release note。

### ⚠️ 併行時會咬人的四件事

1. **假紅（已修）** —— GH#359：`gameAppFacingWiring` 每個 `it()` 裡都 `await import("../GameApp")`，
   **2,189 ms 的模組載入被記在第一條斷言的 5,000ms 預算裡**。修法是把 import 搬到模組層
   （⛔ 不是調大逾時 —— 那是把偵測器關掉）。同負載 A/B 20 次：修前 **7 過 13 敗**、修後 **20 過 0 敗**。
2. **工作樹是唯一副本** —— 全部來自這個 session 的多條 lane。
   所有 lane 明令禁止 `git checkout <檔>` / `restore` / `stash` / `add -A`。
   ⭐ **2026-08-20 新增 PreToolUse hook**：任何 `Write` 或 Bash 的 `>` `rm` `truncate` `tee` `mv` `cp`
   `git checkout|restore`，**動作發生前**自動留底到 `docs/legacy/_overwrites/<時間戳>/`。
3. **`bundle.json` 是全域鎖** —— 同時跑 build 會產出壞掉的 bundle。
4. **subagent 紅線** —— ⛔ `gh issue create`、⛔ ssh/curl 正式站、⛔ `content:build`。

### 📌 這一版的整合待辦（主 session 做，不派工作流）

- `pnpm skills:sync` —— 全部 lane 落地後跑**一次**
- `python3 tools/icon-console/emit_style_spec.py` —— 等 `prompt.py` 定稿
- `pnpm exec tsx tools/model-budget/emit_report.ts` —— `report.json` 現在就過期，而**沒有守衛會說**
- `eventFanout.ts:114` 的註解已成假話（線路成本從「施放次數」變成「跳數」）
