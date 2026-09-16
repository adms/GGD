# 任天堂明星大亂鬥歷代來源盤點（N64／Melee／Brawl）

> 由 `build_inventory.py` 產生；請不要只手改本檔。Ultimate 不計入本批統計。

| 作品 | 平台 | 可讀原始內容 | 原始包 | 已驗 SHA 檔案 | PCM WAV | 模型／骨架／動作／VFX | 轉換 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Super Smash Bros. | N64 | 0 | 0 | 0 | 0 | 0 | 0 |
| Super Smash Bros. Melee | GameCube | 是（音訊） | 51 | 2011 | 1766 | 0 | 0 |
| Super Smash Bros. Brawl | Wii | 是（音訊） | 12 | 462 | 448 | 0 | 0 |

## N64 inventory metadata

這四列只是 Windows 掃描 metadata：`ContentRead=False`，沒有 SHA-256，不視為已取得原始遊戲位元組。`Let's Smash (Japan)` 是其他作品，已排除。

| 版本／檔名 | 報告大小 | 狀態 |
|---|---:|---|
| `N64 全明星大亂鬥.7z` | 41897954 | inventory-metadata-only |
| `Super Smash Bros. (Australia).zip` | 12543026 | inventory-metadata-only |
| `Super Smash Bros. (Europe) (En,Fr,De).zip` | 16058110 | inventory-metadata-only |
| `Super Smash Bros. (USA).zip` | 12539753 | inventory-metadata-only |

## 已取得實檔

- Melee：51 包、1766 WAV、1803.332199 秒；2011 個完整歸檔成員已逐檔 SHA-256 驗證。
- Brawl：12 包、448 WAV、369.191373 秒；462 個完整歸檔成員已逐檔 SHA-256 驗證。
- 這些 WAV 的 PCM 載荷可解碼；說話者、語言與技能事件仍需逐項聽審，未綁定到 runtime。
- S3 位置與讀回驗證保留在 JSON 的各 source 摘要；本批沒有新增大型原始檔，因此沒有新 S3 上傳。

## Ultimate 邊界

Ultimate 屬 Nintendo Switch 獨立來源，不納入上表歷代總數。請查 `materials/hero-model-library/priority-evidence/ssbu-ultimate-nsandns2-20260914/reconciliation.json`。

## 精確缺口

- N64: Windows scan has four relevant filenames and sizes, but ContentRead=False and no SHA-256; no ROM payload is currently mounted.
- Melee: acquired material is audio-only; no original model, texture, skeleton, native motion or VFX bytes are present in the indexed source roots.
- Brawl: acquired material is audio-only; no original model, texture, skeleton, native motion or VFX bytes are present in the indexed source root.
- No repository-backed N64/Melee/Brawl asset extractor was found, so no extraction or conversion is claimed.
- Audio groups mix voices and effects and have no complete listening/event review; no runtime binding is claimed.

## 身分與英雄對應

- Existing explicit mappings are retained only: Melee Kirby -> community-review-06-20260907; Melee Pikachu -> godie-ofar; Brawl SSBB_Link coverage -> godie-h00l.
- Marth and the 48-package Melee reserve remain unmapped. Mario and Mewtwo names in audio groups are not model evidence.
- No new GGD hero ID is inferred or created by this inventory.

## 重建與驗證

```bash
python3 tools/hero-model-library/source-workflows/smash-legacy-sources-v1/build_inventory.py --check
python3 -m unittest tools/hero-model-library/source-workflows/smash-legacy-sources-v1/test_build_inventory.py
python3 tools/hero-model-library/current_resource_index.py --check --check-git
```
