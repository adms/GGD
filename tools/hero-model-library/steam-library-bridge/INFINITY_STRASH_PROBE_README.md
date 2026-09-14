# 《Infinity Strash》唯讀 PAK 探測

雙擊 `RUN_INFINITY_STRASH_PROBE.cmd`。預設只讀取：

`F:\SteamLibrary\steamapps\common\Strash`

工具會找出 `.pak/.sig/.utoc/.ucas`，逐檔計算 SHA-256、大小與實際連續讀取速度，並在桌面產生 `GGD-Infinity-Strash-Probe-日期時間.zip`。它不會複製 PAK、不會修改遊戲、不會變更分享或帳號權限。

若把官方 `umodel.exe` 放在此資料夾、桌面或 Downloads，工具會依序嘗試自動偵測、UE 4.27、4.26、4.25，以唯讀 `-list *.uasset` 產生完整 package 清單與小呆／巴恩相關字串候選。沒有 UModel 時仍會輸出可用的 PAK 雜湊清單；之後再補工具重跑即可。

UModel 官方文件說明它支援 Unreal Engine 1–4 的模型、骨架、動作、貼圖與音訊檢視／匯出；全包命令列列舉方式是 `umodel -export -path=... *.uasset`，本探測階段只使用 `-list`，不匯出素材。

回傳 ZIP 後，整合工作流會先辨識 package 路徑、引擎版本與是否加密，再建立只擷取小呆、巴恩老年、巴恩年輕真身，以及相關動作、VFX、SFX、語音的第二階段清單。`Vearn` 與 `Baran` 必須分開；名稱命中仍要經模型與貼圖視覺驗收。
