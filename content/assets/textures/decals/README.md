# 地面痕跡貼圖 —— GENERATED, DO NOT HAND-EDIT

這個目錄裡每一張 PNG 都是 `apps/client/scripts/gen-decals.ts` 寫出來的：

    pnpm tsx apps/client/scripts/gen-decals.ts

產生器是決定論的（seeded 整數 hash，⛔ 沒有 `Math.random`），所以重跑逐位元組
重現。要改長相就改那支腳本再重跑，⛔ 不要修圖。

## Provenance / licence

100% 由這個 repo 自己的程式算出來的。沒有第三方美術、沒有 Blizzard 資產、
沒有下載任何東西 —— 所以 `content/assets/CREDITS.md`（那份追的是**第三方**出處）
沒有東西要補。

⚠️ 這一點是它存在的理由之一：Kenney 的 `particles` 包裡**沒有任何一張地面裂痕**，
而原作 WarStomp 那一族的痕跡是 Blizzard 的美術。

## 內容

| 檔 | 尺寸 | 格式 | 是什麼 |
|---|---|---|---|
| `crack_01.png` | 256² | RGBA | 地面震裂。**alpha 帶形狀、RGB 全白** |

RGB 全白是刻意的：`GroundDecalPool` 開 `useAlphaFromDiffuseTexture`，顏色來自
`DecalSpec.tint`（寫進 `emissiveColor`），所以同一張遮罩換不同 tint 就能重用。

哪一個特效家族用哪一張，是 `content/config/vfx-families.json` 的
`families.<家族>.groundDecal` 那一格（後台可調，見 🎨 特效鑄造所）。
