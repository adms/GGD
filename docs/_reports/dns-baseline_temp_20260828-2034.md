# adms.ai DNS 基準（搬到 Cloudflare 之前）

量測時間：2026-08-28T20:34:11Z

## NS
- ns01.trademarkarea.com.
- ns03.trademarkarea.com.
- ns02.trademarkarea.com.

## 查得到的記錄
- `adms.ai` A → 114.32.220.203
- `adms.ai` NS → ns02.trademarkarea.com.
- `adms.ai` NS → ns01.trademarkarea.com.
- `adms.ai` NS → ns03.trademarkarea.com.
- `adms.ai` SOA → ns01.trademarkarea.com. postmaster.adms.ai. 2021121783 3660 1000 604800 84600
- `ggd.adms.ai` A → 34.81.104.163

## 常見子網域探測（⚠️ 這**不是**完整清單 —— DNS 查不出 zone 的全部內容）

## ⛔ 搬家後要逐筆對回來的
1. `adms.ai` A → 114.32.220.203（⚠️ 另一個服務,⛔ 不是 GGD）
2. `ggd.adms.ai` → 搬完之後由 Cloudflare Tunnel 自動建 CNAME

⚠️ **在 trademarkarea 的後台匯出完整 zone file** —— 那才是權威清單,
上面這份只是我從外面查得到的部分。

---

## ⭐ owner 的裁決（2026-08-29）

> 「`adms.ai A 114.32.220.203` **已經廢除了 沒差**」

⇒ 這筆記錄**刻意不搬到 Cloudflare**。
⚠️ 委派之後 `adms.ai`（根網域）會解析不到 —— ⭐ **那是預期的**，
⛔ 不是搬遷失誤。任何指向 `http://adms.ai` 的舊連結會失效。

⭐ 記在這裡的理由：一筆「刻意不搬」的記錄與一筆「不小心漏掉」的記錄，
在 DNS 上長得**一模一樣**。⛔ 沒有這一段，下一個讀到這份基準的人
（包含下一輪的我）會把它讀成事故。

## ⇒ 委派後的預期狀態
| 名稱 | 預期 |
|---|---|
| `ggd.adms.ai` | `34.81.104.163`（正式站，⛔ 不變）→ 之後改成 tunnel 的 CNAME |
| `adms.ai` | ⭐ **無回應（刻意）** |
