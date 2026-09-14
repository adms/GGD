# 任天堂明星大亂鬥跨世代來源就緒度

此檔由 `build_inventory.py` 生成。它把 N64、GameCube、Wii、Switch 的本機可讀來源與僅有檔案名稱的來源分開；不可將 ROM／NSP 檔名或舊掃描資料說成已擷取。

- 本次可讀的原作遊戲 payload：**0**。
- 已逐檔驗證的 Melee＋Brawl WAV：**2,214**；兩者都是音訊來源，沒有相應模型、骨架、原生動作或 VFX 原檔。
- Switch 社群來源：**698** 個 Worldblender body／avatar 候選、**175** 個 Ultimate14 motion payload；已有 **18** 個獨立元件，後台可切換仍為 0。
- 本次新增轉換候選：**0**；正式站部署驗證：**否**。
- Ultimate reconciliation 的 `download-sources.json` pin：**已過期，需重建**。

| 世代／來源層 | 已登記來源檔 | 現在可讀 payload | 模型候選 | 動作候選 | VFX | 已驗證音訊 | 已轉換元件 | 後台可選 | 狀態 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Nintendo 64 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | metadata-only |
| GameCube | 2,011 | 2,011 | 0 | 0 | 0 | 1,766 | 0 | 0 | audio-only-source-bytes-verified |
| Wii | 462 | 462 | 0 | 0 | 0 | 448 | 0 | 0 | audio-only-source-bytes-verified |
| Nintendo Switch community sources | 29,752 | 29,752 | 698 | 175 | 3 | 19 | 18 | 0 | community-model-and-motion-source-present |
| Nintendo Switch game containers | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | metadata-only-share-unmounted |

## 工具與受控轉換探針

- 轉換器：`tools/hero-model-library/source-workflows/ssbu-models-v1/convert_blend_component.py`（SHA-256 `1d773f0422883f0caba5d10114c17f99f6eacecc82f7efc7b6413cadb9c532ab`）。
- Blender：`/Applications/Blender.app/Contents/MacOS/Blender`；Blender 5.2.1 LTS。
- Mario c00 真實重建探針：blocked-tool-crash。Blender background conversion exited from SIGSEGV before emitting a GLB or a conversion receipt. The partial local output root is retained for diagnosis and is not a candidate.

## 限制與下一步

- The cross-generation counts retain the current checked-in reconciliation values, but its source-catalog pin must be rebuilt before treating that reconciliation as a fresh full-pipeline check.
- The GameCube and Wii counts are locally verified audio source members, not full game extractions.
- The Switch model and motion counts are community-source candidates. They are not Nintendo base-game payloads.
- NSandNS2 containers are inventory metadata only until their local bytes, headers and member table are actually read.
- The Mario controlled rebuild probe crashed before a GLB existed; it neither adds a component nor changes any approval, dropdown or deployment state.
