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

## 08:58 追加：複雜圖片底板與 fail-closed 資源池

- 薄片／billboard 3D 幾何只要貼圖幾乎沒有透明背景，一律視為底板；不再要求背景必須是白色、黑色或單一顏色。這封住「整張照片／雜訊圖仍是完整矩形，但沒有主色所以舊檢查漏掉」的缺口。
- 資源池的「待驗證」現在不可拖入；只有依實際遊戲混合模式得到「實際合成安全」後才可拖曳。雙擊加入與唯一寫回 seam 仍會再次執行同一個 fail-closed 檢查。
- 正式 `content:build` 已重跑完整 661 份 VFX 與 151 份 Model 集合：`vfx-asset-safety: PASS (0 blocker(s))`，內容 bundle 正常產生。
- 在 VFX Forge 對 `godie-hart.r` 以真 Sim／真 VfxSystem 重跑 GPU 時間軸掃描：`底板通過 · 93格`。

## 09:14 追加：薄片漏掃修正與八招完整播放

- 建置掃描原本會略過 `BLEND`、非發光、且 model 文件未列 `fxEmitters` 的材質；現在只要是相對模型尺寸顯著的薄片，就一定解碼內嵌貼圖。這封住「多色不透明圖片掛在普通 BLEND 薄片」的漏掃路徑。
- 掃描因此暴露 `imported.ritsu` 的四頂點工具面。實際 Babylon 模型預覽沒有底板，量測後該面跨度只有角色模型的 0.92%，不是顯著效果卡片；靜態規則改為忽略小於模型跨度 5% 的工具面。若作者在腳本中把它放大，儲存前的真 GPU 時間軸掃描仍會阻擋。
- `pnpm vfxassets:check` 再次掃過完整集合：`PASS (0 blocker(s))`。
- Editor 與建置側安全回歸共 10/10 通過（Editor 6、w3x-import 4）。
- 以「完整技能演出」模式逐招跑真 Sim／真 VfxSystem／真 CameraRig，八招結果如下；此表只證明沒有貼圖底板，不取代演出品質判定：

| 技能 | GPU 掃描 |
|---|---:|
| 04-03 龍破斬 | 底板通過 · 45格 |
| 04-04 神滅斬 | 底板通過 · 32格 |
| 01-04 超究武神霸斬 | 底板通過 · 93格 |
| 08-04 阿邦快速劍X | 底板通過 · 34格 |
| 08-03 龍鬥氣砲咒文 | 底板通過 · 33格 |
| 09-04 龜派氣功 | 底板通過 · 33格 |
| 20-002 理想鄉EX | 底板通過 · 36格 |
| 48-04 騎英之手綱 | 底板通過 · 39格 |
