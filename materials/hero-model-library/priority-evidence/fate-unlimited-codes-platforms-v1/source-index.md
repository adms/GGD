# Fate/unlimited codes 平台來源與轉換狀態

> 本文件由 `build_source_index.py` 依 Windows 清單、中央來源表與驗證收據產生；請勿只手改數字。

## 原作遊戲映像

| 來源 ID | 平台／區域 | 容器 | 清單大小 | 實檔狀態 | 擷取／轉換／註冊 |
| --- | --- | --- | ---: | --- | --- |
| `lv99-fuc-psp-japan-portable-zip` | Sony PSP／Japan | ZIP | 509977835 | inventory-metadata-only | not-started／not-started／not-registered |
| `lv99-fuc-psp-usa-portable-iso` | Sony PSP／USA | ISO | 738394112 | inventory-metadata-only | not-started／not-started／not-registered |

兩筆目前都只是 LV99 Windows 清單 metadata：掃描讀取 payload 為 0 bytes，沒有內容 SHA-256。

## 其他平台與社群來源

- PS2 公開音訊來源：3 組，共 653 檔；已有本機索引，角色／事件仍待逐段聽審。
- PS2 原作光碟與 Arcade 原始資料：尚未找到實檔。
- FateUBW Minecraft：獨立社群來源，14 名英靈、132 個來源片段、127 個已轉換原生時長片段；5 個無時長來源姿勢另列衍生處理，不冒充原作 FUC 素材。
- 所有項目目前都未因本索引而成為後台可切換選項，也未證明正式站部署。

## 下一步

1. 以唯讀掛載或複製方式提供日版 ZIP 與美版 ISO 實檔，為每個版本建立獨立 intake 目錄。
2. 用 `extract_disc_payload.py` 先做成員清單、路徑安全檢查、來源 SHA-256，再解到全新目錄。
3. 對擷取出的 FPK 使用既有 `first-batch/extract_fate_fpk.py`；其真實 FUC 樣本驗證仍為缺口。
4. 依 GMO／GIM／音訊容器實際結果選擇轉換器，逐角色驗證後才能註冊模型選項。
