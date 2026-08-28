# /__live checksum 快取層 ＋ 8 頁豁免複審（#822~834 收尾）

> owner 2026-08-28（逐字）：
> 「#822~834 記得要修成可以視覺化編輯，並且**善用redis cache在原資料沒更新
> (md5+checksum)的時候讀取cache就好不用每次都重算**」

## 一、checksum 快取層（全部 14 頁共用，已落地）

| | |
|---|---|
| 新檔 | `tools/admin-live/cache.mjs`（md5 memo · 目錄遞迴展開 · 檔案/redis 後端） |
| 接線 | `tools/admin-live/middleware.mjs` GET 路徑：deps 逐檔 md5（＋dataset 模組自己）合成 key → L1 記憶體 → L2 後端 → miss 才 `build()` |
| 後端 | **有 `REDIS_URL` ⇒ redis**（node:net 手寫最小 RESP：AUTH/SELECT/GET/SET，⛔ 零新增 npm 依賴，TTL 7 天）；**沒有 ⇒ 檔案**（`/private/tmp/ggd-live-cache/`；linux 退 os.tmpdir()）。⚠️ 本機沒有 REDIS_URL ⇒ 本機實跑的是檔案後端；redis 路真的走 socket 對迷你 RESP server 驗過 roundtrip＋miss（守衛第 3 條），host 上只要有 `REDIS_URL` 就接上 |
| 誠實 header | `X-Live-Cache: hit\|miss\|off key=<前8碼> store=memory\|file\|redis[-unreachable]` —— 靜默的快取跟算錯一樣難查 |
| 開關 | `GGD_LIVE_CACHE=0` 全關（header 標 `off`）；`GGD_LIVE_CACHE_DIR` 換快取目錄 |
| fail-open | 後端連不上 ⇒ 續算 ＋ console.warn 一次 ＋ header 標 `-unreachable`（量到：`store=redis-unreachable`） |

⭐ **為什麼比舊制（mtime 鍵）對**：macOS 目錄 mtime 不因就地改檔而動 ⇒ 舊制對目錄型
deps（treasures 的 `content/loot-tables` 那一族）在外部編輯（git pull／別的編輯器）時回**過期**快取；
md5 兩個方向都對 —— bytes 變必 miss、沒變（含 touch／改回同 bytes）必 hit。
順帶：快取現在**跨 dev server 重啟**存活（實測 proc1 miss → proc2 hit store=file）。

**守衛**：`packages/shared/src/ops/liveChecksumCache.test.ts`（4 條）——
① key 兩個方向（改 bytes ⇒ 變；沒改／改回同 bytes ⇒ 不變 —— 後者同時釘住「是 checksum 不是 mtime」；目錄型 dep 就地改檔也要變）
② 檔案後端 roundtrip＋miss ③ redis 後端**真的走 socket** 對迷你 RESP server roundtrip＋miss
④ middleware header 誠實（miss→hit 同 key → off）。
**突變**：`md5OfFile` 改回常數 ⇒ ①紅（`expected '17b0fca…' not to be '17b0fca…'`）⇒ 改回綠。

## 二、8 頁豁免逐張複審

| 頁（dataset） | 票 | 裁決 | 落地 |
|---|---|---|---|
| 蝗蟲群對照 locust-orbs | #824 | ⭐ **可存** —— 舊豁免漏了第三側：tpl-locust-*.json 是**手編檔**（genguard ✓、sync-io 只認領 _index.json、tools/ 零寫入端），params 是 object ⇒ **名字定址安全** | ✅ write＋UI 新面板（含「動到哪幾支」欄）；**順帶修一個真缺陷**：dataset 用 `Array.isArray(doc.params)` 讀 object 形 params ⇒ 模板預設整段靜默 null |
| 機制模板·範圍 mech-templates | #825 | ⭐ **可存**（模板 params）—— 舊豁免「所有 target 都是 genguard AUTHOR」被它自己的反駁法反駁（tpl-*.json 全 ✓）。五級距表**仍唯讀**：值推導自 skillTiers.ts 的梯子、已有 rangeTiers/aoeTiers 設定頁（⛔ 不放第二份表單，第〇·四守則） | ✅ write＋「參數格」展開逐格編輯 |
| 特效模板·視覺 vfx-templates | #826 | ⭐ **半可存** —— ①模板數字預設（scale/alpha/lifeSec/count…）可存（同上）；②model@1 視覺欄仍唯讀（要 audition 終端證據，👁 用詞紀律）；③vfx-families.json（pitch/color 那一族）是 `vfxfam:build` **產物** ⇒ 要「寫來源＋自動 genrun」新機制 | ✅ write＋家族預設格條；**票留言、不關**（owner 點名的 pitch/color 還沒到） |
| MDL特效家族 mdl-families | #822 | ⛔ 今天豁免成立 —— 落點 `tools/locust-census/mdl-families.json` 檔頭 `$generator: mdlfamily.mjs`（產物；⚠️ genguard 回 ✓ 是戶籍洞，票留言記了）⇒ 要人工覆寫 overlay 機制 | 票留言（評估＋機制形狀），不硬做半套 |
| 90支重製 skill90 | #832 | ⛔ 今天豁免成立 —— 「來源」是 `batch1.py`＋`heroes/*.py`（**程式**），出貨 JSON 每一欄都是 skillremake:json 產物 ⇒ 「頁上改規格重生成」要結構化規格 overlay＋產生器管線 | 票留言，不硬做半套 |
| 平行處理盤 parallel-board | #833 | ✅ **合法豁免**（票自己預測的結論）—— 內容從 GitHub 票＋git 現況推導，可編的家在 GitHub 本身 | 關票（豁免理由已在閘裡） |
| 平行柵欄 lane-fences | #834 | ✅ **合法豁免** —— 柵欄定義鏡照派工慣例（住在派工 prompt，不在 repo）；造一份沒有消費者的 JSON ＝ 票自己警告的「沒人要的編輯功能」 | 關票（＋反駁法：哪天派工真的讀檔，那個檔就是可編的家） |
| 技能撰寫建議 skill-authoring | （無票） | 豁免成立（輸出是骨架，頁上沒有一格是出貨資料的家） | 不動 |

## 三、可存格的邊界（rule.check 當場裁決，全部量過）

- 只改**已有數字預設**的格；留白格（tint/alpha 那一族）擋下並說明「刻意留白＝逐支填」——
  新增 default 不帶 origin 會讓 `templateDefaultsHaveOrigin` 閘紅。
- 上下界用**那一格自己宣告的** min/max（量到：count=99 ⇒ 「高於這一格自己的上界 12」）。
- 非 number 參數擋下（量到：enum 格 ⇒ 400）。
- `/params/<名>/origin` 另一條規則：要含閘認得的 token；格子在豁免表上 ⇒ 擋下並指路
  「先把 templateOriginBaseline 那一列拿掉（棘輪變短）」。

## 四、終端證據（e2e，走真的 middleware＋真的檔案）

```
① GET locust-orbs：count=3 scale=0.6 adopters=2 numeric=7（修好 join 之後才有值）
② POST save 3→4：200 old=3 value=4
③ GET 重讀：count=4，X-Live-Cache miss（key 變了 —— checksum 快取自動失效）
⑧ POST 還原 4→3：200
⑨ 還原後 cache key 回到原值（content-keyed 的證明）；git status 乾淨（byte-identical）
```

skills:sync 存活論證（⛔ 本 lane 禁跑 sync）：tpl-*.json 在 `sync-io.json` 的 writes
只有 `_index.json` 一筆、genguard ✓、`grep -rl tpl-locust tools/` 零寫入端 ⇒ 沒有任何
產生器會把它打回來。

## 五、沒做的（誠實列）

- redis 接線在 host 要 `REDIS_URL` 環境變數（介面留好、fail-open 有聲音）；本機出貨路是檔案後端。
- #826 的 pitch/color（vfx-families 產物）與 #822 overlay、#832 規格管線 —— 票上有評估留言。
- 「距離/範圍用拖的改」（#825 scope 一句）：tier 值的家在 rangeTiers/aoeTiers 設定頁
  （有 overlay 寫入），在對照頁上加拖曳＝第二份表單 —— 關票留言裡寫了這個理由，owner 不同意可反駁。
