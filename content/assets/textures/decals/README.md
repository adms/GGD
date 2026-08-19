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
| `scorch_01.png` | 256² | RGBA | 焦痕（GH#453 新產）。⚠️ 與 `particles/scorch_01.png` **同名不同檔** |
| `kickup_01.png` | 256² | RGBA | 揚起的塵土（GH#453 新產） |

⭐ **GH#453**：後兩張是新的。在此之前「焦痕」與「揚塵」指的是 Kenney 粒子包裡的
`assets/textures/particles/{scorch_01,dirt_02}.png` —— 那兩張是**通用粒子**（一顆
爆閃、一撮圓石），不是為了「被踩在地上的痕跡」畫的。三張現在共用
`gen-decals.ts` 的**同一支組裝器**（五層：裂縫／燒穿／拖曳／碎屑／⭐魔力光點），
差別只在 `MARKS` 那張參數表的數字。

RGB 全白是刻意的：`GroundDecalPool` 開 `useAlphaFromDiffuseTexture`，顏色來自
`DecalSpec.tint`（寫進 `emissiveColor`），所以同一張遮罩換不同 tint 就能重用。
⭐ 那三個 tint 現在是 FATE token 算出來的（緋紅焦痕／靛藍裂縫／暖金塵），
住在 `apps/client/src/vfx/feedbackPresets.ts`，來源是
`packages/shared/src/art/fatePalette.ts`。

哪一個特效家族用哪一張，是 `content/config/vfx-families.json` 的
`families.<家族>.groundDecal` 那一格（後台可調，見 🎨 特效鑄造所）。
