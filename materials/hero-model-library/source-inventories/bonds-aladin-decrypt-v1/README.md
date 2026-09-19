# 《燃魂羈絆》Aladin 解密庫存

- 狀態：`runtime-v2-git-candidates-published-animation-clips-not-embedded-awaiting-owner-approval-and-game-registration`
- 已解密：**51 UnityFS / 22,536,492 bytes**
- 模型相關：**16**
- 動作相關：**6**
- 直接命名 `kiganohburn`：**3**（特效／過場 UnityFS）
- Unity 物件：**19 Mesh / 148 AnimationClip / 39 Texture2D**
- 視覺審查匯出：**19 OBJ / 39 PNG**
- Rigged GLB：**2 個來源版 / 2 個 runtime-v1 中間版 / 2 個 runtime-v2**
- Khronos Validator：**6 檔 / 0 errors / 32 warnings**
- Git 可取用候選：**2 GLB / 6 previews**

| 原生 ID | UnityFS | bytes | 種類 | 身分狀態 |
| --- | ---: | ---: | --- | --- |
| `ch027003700` | 4 | 7,207,600 | animation 2, mesh 1, prefab 1 | `true-vearn-shinBurn-family-not-Ghost-Eye` |
| `ch027003800` | 6 | 3,856,851 | animation 2, material 1, mesh 1, prefab 1, texture 1 | `super-mage-zaboera-chyoZaboera-not-Vearn` |
| `ch027005800` | 5 | 3,672,731 | animation 1, material 1, mesh 1, prefab 1, texture 1 | `Ghost-Eye-Vearn-kiganBurn-parts-directly-named` |
| `ch027005801` | 3 | 1,631,854 | animation 1, mesh 1, prefab 1 | `Ghost-Eye-Vearn-kigan-variant-directly-named` |

## 鬼眼王 rigged / runtime 輸出

| 原生 ID | 原始面數 | v1 面數 | v2 面數 | v2 draw | v2 貼圖上限 | 動畫來源／GLB | 視覺驗收 | 已註冊 / 已部署 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| `ch027005800` | 29,990 | 7,898 | 7,898 | 5 | 256 | 1（GLB 0） | `three-view-generated-awaiting-owner-approval` | 0 / 0 |
| `ch027005801` | 29,990 | 7,897 | 7,897 | 5 | 256 | 3（GLB 0） | `three-view-generated-awaiting-owner-approval` | 0 / 0 |

## Git 候選路徑

- `ch027005800`：`materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/candidates/ch027005800-runtime-v2.glb`，SHA-256 `a79a5471d0ef01fb6091ff26457327379ab972bcd33fcffbf062a77b782505f6`
- `ch027005801`：`materials/hero-model-library/source-inventories/bonds-aladin-decrypt-v1/candidates/ch027005801-runtime-v2.glb`，SHA-256 `14623eaa192b8e798f398271575bb1f396d7f5975e55a2b366c2ba923ff7f97d`

## 結論

DeNA Aladin 加密已解開，51 個候選全部驗出 `UnityFS`，不再是「runtime key stream 取得中」。已解密檔位於 `GGD-Asset-Library/conversions/heros-bonds-aladin-decrypted-v1/`，完整路徑與 SHA-256 見 `decryption-receipt.json`。UnityPy 已讀取全部 51 包，匯出收據見 `unity-object-receipt.json`。

Unity 物件名已排除 `ch027003800`（`chyoZaboera`）。`ch027005800` 的材質與貼圖直接命名 `kiganBurnHead`、`kiganBurn_body`、`kiganBurn_eye`，`ch027005801` 也有同系 `kigan_Head/body/eye`，因此這兩組是分開保存的鬼眼王原作模型候選。兩組都保留 29,990 面來源 GLB；runtime-v1 只有面數合格，仍是 12 draws／1024px 貼圖的中間產物。runtime-v2 經 atlas 與 UV 重映射後為 7,898／7,897 面、5 draws、5 張內嵌貼圖、貼圖上限 256px、1 skin，通過模型 hard limits，Khronos 驗證 0 errors。兩顆 runtime-v2 與六張三視圖已複製到上述 Git 相對路徑，Main 與其他工作流不需讀本機絕對路徑。AnimationClip 已留存並分開列出，但 GLB 仍為 0 animations；仍待使用者視覺核准。遊戲註冊、後台選項與部署皆尚未進行，數量為 0。`ch027003700` 是 `shinBurn` 真巴恩系，不是鬼眼王。

解密原理、RVA 及重建指令見 `tools/hero-model-library/source-workflows/bonds-aladin-decrypt-v1/README.md`。
