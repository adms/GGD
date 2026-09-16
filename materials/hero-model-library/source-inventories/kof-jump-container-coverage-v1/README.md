# KOF XIV / JUMP FORCE 容器覆蓋與轉換缺口

> 本頁由 `build_inventory.py` 產生。路徑索引、已抽出實檔、已轉換候選、後台可選及正式部署是不同狀態。

## 本批增量結論

- JUMP FORCE：6 個 PAK 的固定索引共 256,619 筆關係、221,877 個目前路徑；從完整路徑發現 224 個 `chrNNNN` token，其中 63 個已有現行來源群對應、161 個維持待確認。
- KOF XIV：完整 WAD listing 共 39,889 筆，含 80 個 `Chara/<ID>` 目錄 token；只有 MAI、IOR、KYO 的選定 payload 已抽出並逐檔驗證。
- 本次 `/Volumes/common` 未掛載，沒有重新讀取 Steam 容器 payload；固定索引與既有抽出檔仍可重建盤點。
- 音訊只列來源與數量，不做說話者或技能事件自動綁定。

## JUMP FORCE 路徑種類

| 種類 | 容器關係 | 目前路徑 |
|---|---:|---:|
| `animation-package` | 1 | 1 |
| `audio-package` | 66,024 | 65,614 |
| `character-config-package` | 5,660 | 2,336 |
| `character-package` | 13,519 | 13,437 |
| `other` | 90,438 | 81,379 |
| `skill-config-package` | 2,644 | 1,240 |
| `vfx-package` | 78,333 | 57,870 |

完整 224 個路徑 token 與逐種類計數在 `inventory.json → jumpForce.characterPathTokens`。身份只接受明名中央來源路徑或固定 authority；其餘維持待確認。

## KOF XIV 目錄 token

| ID | 身份 | 檔案 | 模型容器 | 動作容器 | 貼圖 | VFX/依賴 | 音訊/中繼 | 取得狀態 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `ADY` | 待確認 | 294 | 23 | 9 | 78 | 40 | 149 | wad-listing-only |
| `AGL` | 待確認 | 324 | 9 | 9 | 111 | 18 | 168 | wad-listing-only |
| `AGL1` | 待確認 | 118 | 3 | 1 | 105 | 1 | 2 | wad-listing-only |
| `ALC` | 待確認 | 295 | 16 | 9 | 79 | 27 | 161 | wad-listing-only |
| `ANT` | 待確認 | 295 | 27 | 9 | 73 | 44 | 149 | wad-listing-only |
| `ANT_BOSS` | 待確認 | 11 | 0 | 4 | 0 | 1 | 2 | wad-listing-only |
| `ATN` | 待確認 | 371 | 19 | 9 | 109 | 60 | 174 | wad-listing-only |
| `BDR` | 待確認 | 306 | 21 | 9 | 85 | 30 | 163 | wad-listing-only |
| `BEN` | 待確認 | 299 | 20 | 9 | 70 | 41 | 161 | wad-listing-only |
| `BGT` | 待確認 | 39 | 3 | 6 | 15 | 2 | 8 | wad-listing-only |
| `BLY` | 待確認 | 332 | 20 | 10 | 107 | 36 | 159 | wad-listing-only |
| `CAT` | 待確認 | 331 | 19 | 1 | 90 | 59 | 171 | wad-listing-only |
| `CHN` | 待確認 | 280 | 16 | 9 | 73 | 22 | 154 | wad-listing-only |
| `CHO` | 待確認 | 309 | 21 | 9 | 89 | 34 | 159 | wad-listing-only |
| `CIO` | 待確認 | 224 | 3 | 1 | 54 | 1 | 158 | wad-listing-only |
| `CLK` | 待確認 | 262 | 8 | 9 | 66 | 12 | 157 | wad-listing-only |
| `CMN` | 待確認 | 148 | 24 | 5 | 65 | 70 | 3 | wad-listing-only |
| `CNG` | 待確認 | 281 | 13 | 10 | 64 | 22 | 166 | wad-listing-only |
| `CN_MRY` | 待確認 | 77 | 5 | 5 | 60 | 2 | 0 | wad-listing-only |
| `CN_NJD` | 待確認 | 102 | 3 | 5 | 88 | 1 | 0 | wad-listing-only |
| `COC` | 待確認 | 48 | 2 | 6 | 20 | 2 | 8 | wad-listing-only |
| `CommonSound` | 待確認 | 398 | 0 | 0 | 0 | 0 | 398 | wad-listing-only |
| `DMN` | 待確認 | 245 | 10 | 9 | 52 | 14 | 151 | wad-listing-only |
| `DRG` | 待確認 | 63 | 2 | 6 | 38 | 2 | 5 | wad-listing-only |
| `GAN` | 待確認 | 292 | 21 | 9 | 72 | 33 | 160 | wad-listing-only |
| `GES` | 待確認 | 323 | 25 | 9 | 85 | 46 | 165 | wad-listing-only |
| `GRN` | 待確認 | 252 | 3 | 1 | 51 | 1 | 188 | wad-listing-only |
| `HDR` | 待確認 | 346 | 26 | 9 | 99 | 56 | 164 | wad-listing-only |
| `IOR` | 八神庵 | 365 | 29 | 9 | 110 | 66 | 161 | selected-files-extracted-and-sha256-verified |
| `JOE` | 待確認 | 287 | 20 | 9 | 76 | 34 | 150 | wad-listing-only |
| `KDS` | 待確認 | 348 | 25 | 9 | 108 | 51 | 161 | wad-listing-only |
| `KIM` | 待確認 | 265 | 9 | 9 | 59 | 26 | 153 | wad-listing-only |
| `KKR` | 待確認 | 307 | 27 | 9 | 76 | 58 | 146 | wad-listing-only |
| `KLA` | 待確認 | 343 | 34 | 9 | 73 | 82 | 160 | wad-listing-only |
| `KLA1` | 待確認 | 248 | 3 | 1 | 79 | 1 | 157 | wad-listing-only |
| `KNG` | 待確認 | 293 | 16 | 9 | 80 | 26 | 152 | wad-listing-only |
| `KNS` | 待確認 | 312 | 15 | 9 | 93 | 29 | 163 | wad-listing-only |
| `KOD` | 待確認 | 338 | 16 | 9 | 116 | 31 | 164 | wad-listing-only |
| `KYO` | 草薙京 | 354 | 22 | 9 | 93 | 56 | 177 | selected-files-extracted-and-sha256-verified |
| `LEO` | 待確認 | 330 | 22 | 9 | 96 | 57 | 150 | wad-listing-only |
| `LUO` | 待確認 | 295 | 16 | 9 | 88 | 31 | 149 | wad-listing-only |
| `LVH` | 待確認 | 312 | 20 | 9 | 88 | 39 | 157 | wad-listing-only |
| `MAI` | 不知火舞 | 369 | 47 | 9 | 116 | 54 | 157 | selected-files-extracted-and-sha256-verified |
| `MIA` | 待確認 | 326 | 19 | 9 | 100 | 31 | 165 | wad-listing-only |
| `MMH` | 待確認 | 82 | 7 | 8 | 36 | 14 | 12 | wad-listing-only |
| `MMH1` | 待確認 | 44 | 2 | 1 | 32 | 1 | 2 | wad-listing-only |
| `MRY` | 待確認 | 325 | 21 | 9 | 85 | 39 | 172 | wad-listing-only |
| `MTK` | 待確認 | 341 | 28 | 10 | 96 | 49 | 166 | wad-listing-only |
| `MTK1` | 待確認 | 345 | 28 | 1 | 117 | 48 | 166 | wad-listing-only |
| `MTR` | 待確認 | 351 | 32 | 9 | 119 | 57 | 145 | wad-listing-only |
| `MUI` | 待確認 | 313 | 19 | 9 | 85 | 40 | 160 | wad-listing-only |
| `MXI` | 待確認 | 323 | 19 | 9 | 93 | 46 | 158 | wad-listing-only |
| `NEL` | 待確認 | 317 | 22 | 9 | 85 | 37 | 164 | wad-listing-only |
| `NJD` | 待確認 | 446 | 55 | 9 | 99 | 156 | 163 | wad-listing-only |
| `NKR` | 待確認 | 283 | 13 | 9 | 81 | 25 | 149 | wad-listing-only |
| `NKR1` | 待確認 | 234 | 5 | 3 | 69 | 2 | 149 | wad-listing-only |
| `NMG` | 待確認 | 228 | 3 | 1 | 54 | 1 | 162 | wad-listing-only |
| `OSW` | 待確認 | 453 | 87 | 9 | 101 | 125 | 182 | wad-listing-only |
| `RBT` | 待確認 | 334 | 22 | 9 | 93 | 49 | 165 | wad-listing-only |
| `RLF` | 待確認 | 308 | 10 | 9 | 91 | 31 | 158 | wad-listing-only |
| `RMN` | 待確認 | 248 | 5 | 9 | 52 | 9 | 161 | wad-listing-only |
| `ROC` | 待確認 | 607 | 142 | 9 | 182 | 206 | 189 | wad-listing-only |
| `RYO` | 待確認 | 306 | 16 | 9 | 92 | 30 | 157 | wad-listing-only |
| `SHU` | 待確認 | 375 | 32 | 9 | 127 | 55 | 164 | wad-listing-only |
| `SHU1` | 待確認 | 238 | 7 | 1 | 64 | 3 | 158 | wad-listing-only |
| `SLV` | 待確認 | 388 | 37 | 9 | 131 | 65 | 163 | wad-listing-only |
| `SLV1` | 待確認 | 323 | 36 | 1 | 88 | 62 | 161 | wad-listing-only |
| `SSL` | 待確認 | 321 | 21 | 9 | 94 | 36 | 164 | wad-listing-only |
| `TRY` | 待確認 | 375 | 30 | 9 | 127 | 54 | 166 | wad-listing-only |
| `TUN` | 待確認 | 325 | 31 | 9 | 85 | 50 | 163 | wad-listing-only |
| `TUTORIAL` | 待確認 | 2 | 0 | 0 | 0 | 0 | 1 | wad-listing-only |
| `VIC` | 待確認 | 335 | 24 | 9 | 124 | 36 | 147 | wad-listing-only |
| `VNS` | 待確認 | 355 | 31 | 9 | 91 | 54 | 180 | wad-listing-only |
| `VRS` | 待確認 | 267 | 15 | 9 | 103 | 54 | 83 | wad-listing-only |
| `VRS_BOSS` | 待確認 | 11 | 0 | 4 | 0 | 1 | 2 | wad-listing-only |
| `WHP` | 待確認 | 441 | 54 | 10 | 123 | 80 | 203 | wad-listing-only |
| `XND` | 待確認 | 303 | 20 | 9 | 84 | 38 | 154 | wad-listing-only |
| `YMZ` | 待確認 | 443 | 58 | 9 | 127 | 92 | 190 | wad-listing-only |
| `YRI` | 待確認 | 391 | 28 | 9 | 128 | 66 | 162 | wad-listing-only |
| `ZRN` | 待確認 | 309 | 18 | 9 | 76 | 28 | 178 | wad-listing-only |

## 狀態與下一步

| 來源 | acquisition | extraction | conversion | readiness |
|---|---|---|---|---|
| JUMP FORCE 六 PAK | 容器 SHA 與索引已固定 | 達伊等已選範圍另案抽出；本批未讀 payload | 路徑 token 未轉換 | 索引儲備，不可選 |
| KOF XIV MAI/IOR/KYO | 選定實檔已逐檔 SHA 驗證 | 已抽出 | 模型/骨架/動作容器仍缺 reader；貼圖另案處理 | 來源候選，不可選 |
| KOF XIV 其餘 ID | 只有 WAD listing | 未抽出 | 未開始 | 索引儲備，不可選 |

重建：

```bash
python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/build_inventory.py --workspace ..
python3 tools/hero-model-library/source-workflows/kof-jump-container-coverage-v1/build_inventory.py --workspace .. --check
```
