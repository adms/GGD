# VFX／模型貼圖底板防線：視覺證據

時間：2026-09-01 06:39（Asia/Taipei）
分支：`feat/vfx-forge-codex`

## 問題與修正

- 內容庫掃描先找出 4 張粒子貼圖、25 個 VFX 引用的邊緣不透明風險，已用 4px 邊緣退場修復。
- VFX Forge 在拖放與儲存前逐素材 fail-closed；未知、解碼失敗與底板風險都禁止寫回。
- `content:build` 現在固定掃完整 VFX 集合與完整 3D Model GLB 內嵌貼圖，任何 blocker 都不產生遊戲 bundle。
- GLB 不只查 alpha：薄平面，或自發光特效材質，只要外框大面積保留同一個不透明底色就禁止使用；這也涵蓋多張交叉 billboard 共用一個 3D 包圍盒的情況。正常立體模型的非發光 `MASK`／`OPAQUE` 皮膚不會被這條誤擋。
- 全庫因此抓到 `imported.blackhole` 與 `w3x.stock.flamestriketarget` 兩個確定的白底內嵌圖片。遷移只重寫該 GLB 的 image bufferView，並逐 byte 證明 mesh／accessor／skin／animation／node／material 與其他 bufferView 都沒有變動。
- 直線技能預警走廊曾保留 Babylon `StandardMaterial` 預設白色 diffuse，會與 emissive 疊加成整片白卡；現在 diffuse/specular 固定為黑，只允許 emissive 通道上色。

## 實際畫面

- `goku_0500ms.png`：龜派氣功吟唱中，灰色場地仍可見，直線預警沒有白色底板。
- `goku_0880ms.png`：發射後的橘金光束與通道色預警可見，畫面沒有矩形／全屏白卡。
- `blackhole_repaired.png`：編輯器直接載入修復後 GLB 的實際 Babylon 預覽；煙霧／黑洞演出保留，沒有原本的白色方形底板。
- `flamestriketarget_repaired.png`：編輯器直接載入修復後 GLB；關閉 hitbox 後只有特效本體，不再出現白色方形底板。

## 機械證據

```text
pnpm vfxassets:check
vfx-asset-safety: PASS (0 blocker(s))

pnpm --filter @ggd/client exec vitest run \
  src/vfx/TelegraphLayer.test.ts \
  src/vfx/telegraphRune.test.ts \
  src/vfx/VfxSystem.authoringOverride.test.ts
13 passed

pnpm --filter @ggd/editor exec vitest run src/vfx-forge/assetSafety.test.ts
5 passed

pnpm --filter @ggd/w3x-import exec vitest run test/vfxAssetSafety.test.ts
4 passed

pnpm --filter @ggd/shared exec vitest run src/ops/w3xFilterModeContract.test.ts
8 passed
```

這份證據只宣稱「底板不再出現」；八招演出品質仍由各自的逐格視覺驗收報告判定。
