# VFX Forge 八招與 main 比較／main 驗收交接

狀態：**feature branch ready for main review；不代表票已關閉**

比較基準：`origin/main@ead4a6a3`

工作分支：`feat/vfx-forge-codex`

視覺證據：[連續影格與舞台截圖](./vfx_forge_visual_proof_20260901/README.md)

## 評分方法

每招以五分制評估：角色／技能辨識度、起手到命中的節奏、真正 3D／MDL 主體、透明與 additive 安全、收尾是否清楚。`origin/main` 的評價來自該版本的 ability 與 `vfx-script@1` 結構；分支評價另有實際 Editor CameraRig 渲染截圖。測試只防止結構回退，不能替代這份視覺判斷。

## 八招逐項比較

| # | 技能 | `origin/main` | 分支視覺 | 可參考與不可照抄 |
|---:|---|---|---|---|
| 1 | 04-03 龍破斬 | **1.5/5**。只有 1 個 `modelFx`＋1 個 `vfx`，比較像起手提示，沒有「飛一段再爆炸」。 | **3/5**。七段火焰前進後，遠端爆炸與圓環收尾已可讀；仍偏通用火球，日後可換更有龍形辨識度且透明安全的 brick。 | main 的簡單起手可留；不可把 RedDragonMissile 卡片或 Bahamut 白模當飛行主體。 |
| 2 | 04-04 神滅斬 | **0.5/5**。main 沒有腳本，無 dash 斬擊演出。 | **3/5**。角色隱藏、紫色高速刀身飛行、落點斬痕三段成立。 | 可重用「hideBody → toTarget modelFx → target slash」配方；行為傷害仍留在 ability。 |
| 3 | 01-04 超究武神霸斬 | **2.5/5**。12 節點與 JASS 美術來源豐富，但用 6 個 `modelFx` 疊演出，缺少 Cloud 本體逐刀換位，容易像特效播放清單。 | **3.5/5**。七刀 `bodyMove`、攻擊／受擊動畫與黃藍直立光柱終結成立；藍色主要在柱底，仍可再提高色塊分離。 | main 的斬痕、音效與 JASS provenance 值得沿用；角色位置必須由 body brick 驅動，不用 dummy 模型假裝 Cloud。 |
| 4 | 08-04 阿邦快速劍X | **2/5**。`hideBody`＋dummy model 有 JASS 味，但看不出 A 衝擊波＋B dash，且 `imported.crescent` 會露出不透明白卡。 | **2.5/5，未達最終視覺驗收**。真小呆本體 dash 已成立，A 波仍被 main ability 的白卡破壞。 | 保留「角色本體移動」；`imported.crescent` 必須由 main/source generator 換成透明安全的衝擊波。 |
| 5 | 08-03 龍鬥氣砲咒文 | **1.5/5**。main 沒有腳本；ability 有 beam roll，但用 RedDragonMissile 造成紅色薄條，和藍色經典氣功砲衝突。 | **3.5/5，受 main 來源阻擋**。ReviveHuman 旋轉 90° 的藍色 MDL 主體與脈衝成立，但底下仍可看到 main 的紅條。 | 採用與龜派氣功同一 MDL brick、換色即可；main/source generator 必須移除 `w3x.stock.reddragonmissile`。 |
| 6 | 09-04 龜派氣功 | **3.5/5**。八招中 main 的最佳架構：`tpl-beam-roll`＋`w3x.stock.revivehuman`＋`scaleAxis`，真正用 MDL 當光束主體。 | **4/5**。保留橘色 MDL 主體，只用時序粒子補脈衝與邊緣；方向、長度和命中讀得清楚。 | 這是 Editor recipe 的主要範本：主體只生一次，顏色／長度／時間是參數，粒子不取代主體。 |
| 7 | 20-002 理想鄉 EX | **3/5**。17 節點最完整，也保留聲音與 JASS 層，但 8 個 `modelFx` 偏擁擠、沒有逐刀角色位置，容易 additive 洗白。 | **4/5**。`reflectSuccess` 起手、六次 bodyMove、斬擊與第七段橫向 MDL 砲完整；仍可再減少反擊圈與斬痕同時疊亮。 | main 的反彈聲音與既有 art layer 可挑選沿用；「反擊事件」不能偽裝成主動 cast，script 有時取代預設綁定而非疊加。 |
| 8 | 48-04 騎英之手綱 | **1/5**。main 沒有腳本，無 Rider dash 與藍色橫砲。 | **4/5**。真 Rider 本體弧形 dash、動畫、藍色 ReviveHuman MDL 主體、粒子脈衝與命中成立。 | 可重用「bodyMove arc＋classic-beam-blue」兩塊；不用白色替身，不把粒子當光束本體。 |

## 可抽成積木的共同做法

1. **經典橫向氣功砲**：`w3x.stock.revivehuman` 旋轉 90°、`scaleAxis` 拉長；色彩、長度、持續、掛點是參數。已在 Editor 提供 `classic-beam-fire` 與 `classic-beam-blue` recipe。
2. **dash 斬擊**：角色 `bodyMove`／`anim` 是主體，斬痕和 ribbon 是輔助；禁止用替身模型掩蓋角色沒有移動。
3. **定距投射後爆炸**：同一個安全 projectile brick 以時間與 forward offset 排出旅程，最後才生成 explosion／ring。
4. **多段斬擊**：`strikeIndex` 決定角色位置、斬痕與終結段，傷害次數與數值仍由 ability JSON 掌權。
5. **事件型反擊**：`reflectSuccess` 才播放，不能改掛 `castStart` 讓預覽好看卻改變語意。

## 仍需 main／來源產生器處理的兩個紅色阻擋

- `content/abilities/godie-nbbc.r.json` 仍生成 `modelKey: "imported.crescent"`，實際畫面是有底色的白色波／卡片。Editor 依硬規則不可直接改生成的 ability JSON。
- `content/abilities/godie-nbbc.e.json` 仍生成 10 個 `w3x.stock.reddragonmissile`，在藍色氣功砲下露出紅色薄條。Editor script 無法安全覆蓋 ability-owned model。

這兩項不是「Editor 再加一層特效」能修的問題；來源模板／generator 應移除或替換資產，否則 #547／#803 不能宣稱完整通過。

## 票號交接狀態（不關票）

| 票 | 狀態給 main | 說明 |
|---|---|---|
| #838 | **可進 main 驗收** | 資源池拖拉、真 CameraRig、slider、時間軸、所見即所得、middleware 寫回、安全門與 reusable recipes 已在分支；八招有實際圖證。 |
| #547 | **部分可驗；保留開啟** | 通用 prototype 與八招內容已有示範；阿邦白卡、龍鬥氣砲紅條需 main/source 修。 |
| #623 | **唯一安全的一對已完成；票保留開啟** | 逐張卡面複核後，只把 `godie-h01o`（一護卍解態）加入 `retiredChampions`；專用入口／退場守衛通過。其餘 13 對會造成卡面失真、空入口或丟失不同 3D 身體，全部維持不動。部署時若正式站已有 roster durable overlay，仍須在後台「英雄上下架」同步這一格。 |
| #650 | **等待 main 正確事件接縫** | Editor 已能寫現有事件與 block 的 `vfxId`；`blockSuccess` 不能掛攻擊者，禁止用錯 owner 的 workaround。 |
| #664 | **可進 main 驗收** | 不透明背景、魔法陣卡片、additive 預算與實際 compositor 圖證納入安全門。 |
| #734 | **沒有新的 Editor 內容變更** | 右鍵攻擊回饋屬既有 main 工作；本批不假裝已驗收。 |
| #736 | **已由 main 關閉；不動作** | 本分支不重開也不關票。 |
| #803 | **部分可驗；保留開啟** | 橘／藍 beam recipe 與龜派／Rider 圖證完成；龍鬥氣砲仍受 RedDragonMissile 來源阻擋。 |
| #244 | **Editor 套用面可驗** | 模板與 script 可在表單、recipe 與時間軸組合；JASS 翻譯規則仍歸 main。 |
| #887 | **Editor 呼叫端可驗；票保留開啟** | Editor 已定義 `ggd-editor-source@1`、呼叫 `/content-api/editor-source`，且 route 缺席時 fail-safe 唯讀；main 的 descriptor route／真正 source adapter 尚未出貨，不能宣稱端到端完成。 |
| #888 | **可進 main 驗收** | coverage walker 的 record／tuple 展開修正維持在分支。 |
| #885 | **內容可驗** | 理想鄉 EX 已用 `reflectSuccess` 完成實際演出與圖證。 |
| #903 | **不可關，等待美術／數值決策** | 14-04／39-04 缺的是新身體與數值；repo 沒有可忠實代用的四神／式神資產，不捏造內容也不拿相似模型硬湊。 |

## main 驗收時的最小檢查

1. 開啟八招各看代表幀與連續影格；不能只看 Zod／Vitest 綠燈。
2. 先確認阿邦白卡與龍鬥氣砲紅條的來源修正，再重錄這兩招。
3. 執行 `pnpm content:build`、`pnpm caps:check`、`pnpm editorcov:check`、Editor typecheck 與 VFX asset safety check。
4. main 可挑選 commit 或合併 feature branch；**不要讓內容腳本和生成 ability 形成重複綁定**。

## 本分支完成的關鍵驗證

- `pnpm content:build`：通過；1,786 份內容、13 份 VFX script，資產安全 0 blocker。
- `pnpm caps:check`：通過；能力指紋 `e534e6ef`。
- `pnpm editorcov:check` 與 `editorCoverageFresh.test.ts`：通過。
- `pnpm --filter @ggd/editor typecheck`：通過。
- VFX Forge recipe／model／八招視覺文法：3 個 test files、21 tests 通過。
- #623 `transformRetireGate`／`transformEntryRetired`：2 個 test files、3 tests 通過；只退唯一有完整替代狀態的一護卍解態。

上述只證明契約與資料沒有退化；八招是否像原作仍以本報告的逐招圖片評價為準。
