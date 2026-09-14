# JUMP FORCE 全角色批次抽取／轉換計畫

這份計畫使用已固定的完整 PAK path index 與 63 個高信度原生角色 ID。六顆 authority-pinned PAK 已完整鏡像並驗證留存在本機素材庫，後續抽取不再需要 LV99 分享。

- 高信度原生 ID：63 個，分 9 批。
- 第一批就緒收據：六顆 authority PAK 已再次 live SHA 驗證，14,031 筆 member 關係待抽；狀態 `blocked-awaiting-owner-or-runtime-key-injection`（key `not-supplied`），不可算作已抽取。
- 選定檔案關係：86,238 筆；逐檔計畫在 `selected-paths.jsonl.gz`。
- 本機留底：3,466 files／23,856,777,652 bytes；PAK authority 6/6，S3 pending。
- 目前狀態：鏡像已驗證；尚未抽取角色 payload、轉換、建立後台選項或部署。
- 身份範圍：已確認角色 family；服裝、形態、NPC 身份仍須在抽取後逐件核對。
- 動作範圍：目前定位的是 `AnimBP`／`*_anim` 依賴入口；不能把它們直接算成已取得原生動作剪輯。

## 六類素材計畫

| 類別 | 有候選角色 | 套件 | 檔案關係 | 現況 |
|---|---:|---:|---:|---|
| 模型 | 63 | 954 | 1,908 | path-indexed，未抽取 |
| 貼圖 | 63 | 1,929 | 3,868 | path-indexed，未抽取 |
| 骨架 | 63 | 63 | 126 | path-indexed，未抽取 |
| 動作入口 | 63 | 414 | 828 | path-indexed，未抽取 |
| 特效／技能設定 | 60 | 22,515 | 45,106 | path-indexed，未抽取 |
| 音效／語音 | 63 | 16,593 | 33,186 | path-indexed，未抽取 |
| 角色設定 | 63 | 608 | 1,216 | path-indexed，未抽取 |

## 批次

| 批次 | 原生 ID／角色 |
|---:|---|
| 1 | `chr0000` Goku、`chr0010` Vegeta、`chr0020` Trunks、`chr0030` Frieza、`chr0040` Piccolo、`chr0050` Cell、`chr0060` Luffy |
| 2 | `chr0070` Zoro、`chr0080` Sanji、`chr0090` Blackbeard、`chr0100` Hancock、`chr0110` Sabo、`chr0120` Naruto、`chr0130` Sasuke |
| 3 | `chr0140` Kaguya、`chr0150` Gaara、`chr0160` Kakashi、`chr0170` Boruto、`chr0180` Seiya、`chr0190` Shiryū、`chr0220` Ryo Saeba |
| 4 | `chr0230` Kenshiro、`chr0240` Ichigo、`chr0250` Renji、`chr0260` Aizen、`chr0270` Rukia、`chr0300` Gon、`chr0310` Killua |
| 5 | `chr0320` Kurapika、`chr0330` Hisoka、`chr0340` Jotaro、`chr0350` DIO、`chr0360` Yusuke、`chr0370` Toguro、`chr0380` Kenshin |
| 6 | `chr0390` Shishio、`chr0400` Yugi、`chr0410` Deku、`chr0420` Asta、`chr0430` Dai、`chr0450` Kane、`chr0460` Galena |
| 7 | `chr0470` Prometheus、`chr0480` Kaiba、`chr1000` Hitsugaya、`chr1010` Biscuit、`chr1020` All Might、`chr1030` Majin Buu、`chr1040` Bakugo |
| 8 | `chr1050` Madara、`chr1060` Grimmjow、`chr1070` Law、`chr1080` Kane、`chr1090` Galena、`chr1100` Prometheus、`chr1140` Todoroki |
| 9 | `chr1150` Meruem、`chr1160` Hiei、`chr1170` Yoruichi、`chr1180` Giorno、`chr2121` Naruto、`chr2401` Yugi、`chr3180` Giorno |

## 執行順序

1. `prepare_mirror.py` 對六顆 PAK 逐檔驗證大小與 SHA-256；需要時複製到素材庫，再讀回驗證。
2. `extract_batch.py` 只抽取 plan 指定的目前版本檔案，可用 `--batch` 或 `--native-id` 分批。
3. 抽取後先解析依賴 closure，才建立 UE Viewer／Blender／音訊轉換工作；每一階段另外保存逐檔 SHA 與收據。
4. 模型、動作、特效與音訊都須通過個別審查才可註冊；此 plan 不自動建立後台選項。

完整命令、AES 權限界線及重跑方式見 `tools/hero-model-library/source-workflows/jump-force-full-roster-v1/README.md`。
