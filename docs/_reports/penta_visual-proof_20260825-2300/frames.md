# ForgottenOneTent（聖杯黑泥）— 連續圖片驗收（GH#688 Phase 6 · PENTA lane · 2026-08-25）

台子：`apps/client/public/beam-audition.html?ability=godie-zombiex.r`／`?ability=godie-zombiex.ex`
（client-beam :39673），量尺先過 `calibrate()`（全亮 quad **462,400** 亮像素 > 0 ⇒ 量尺自證）。
鏈路：真 SimWorld → 出貨 `godie-zombiex.r`（castAbility，詠唱 1.5s＝45 tick）→ 真
`modelFxSpawn` → 真 VfxSystem/ModelFxRig → 真 `forgottenonetent.glb`
（本批 War3x.mpq → glb 轉換，visiblePrims 1/1）。內容經 `workingTreeSource()` 逐檔讀工作樹
（`PILOT_MODEL_DOCS` 補了 forgottenonetent/thunderclapcaster 的索引列）。

## ⭐ 這一族要用「像素差分」尺，⛔ 不是亮像素尺

聖杯黑泥的 census tint 是 **[0.1176,0,0]**（w3u 30,0,0）—— 它**本來就是一團近黑的泥**。
亮像素尺（`lit` = 通道 >96）在數學上**永遠量不到它**（albedo 0.1176 × 光照 ≤ 30–60）；
但「黑」不等於「看不見」—— 它的可見性模式是**與背景的對比**。⇒ 追加一把 A/B 像素差分尺
（rig setEnabled on/off 兩幀逐像素比對，通道差 >8 記一點），**先用已知可見的 caster 方塊自證**。

### godie-zombiex.r（100-04 百式・哈基米 ← u02S 黑洞聖杯泥，9 具散布→環）

| 擷圖 | tick | 量尺 | 讀數 | 說明 |
|---|--:|---|--:|---|
| shot0_baseline | 0 | lit | **0** | 施放前基線（calibrate 462,400 自證過） |
| shot1_mudring_tick46 | 46 | 差分（control=caster 方塊 **4,691**） | **6,761** | cast resolve：**9 具 rig 全誕生**（spawns=1 事件 → count 9 等分環 r=3），暗紅泥觸手環繞施法者，**目視可辨** |
| shot2_AB_rigs_off | 46 | 差分 | （同上的 off 幀） | ⭐ A/B：9 具 rig `setEnabled(false)` ⇒ 差 6,761 px 全部來自 ForgottenOneTent |
| shot3_expired | 296+ | 差分 | **0**（enabled rig=0） | lifeSec 8（240 tick）到期：回收乾淨，png 位元組數與 shot0 相同（28,789） |

### godie-zombiex.ex（100-002 此世全部之咖哩 ← u02V/W/X 聖杯黑泥召喚，取 L3 外觀）

| 擷圖 | tick | 量尺 | 讀數 | 說明 |
|---|--:|---|--:|---|
| （基線） | 0 | lit | 0 | calibrate 462,400 |
| shot4_ex_mudblob_tick33 | 33 | 差分（control **4,190**） | **735** | 詠唱 1.033s 後單具泥觸手立在施法者**旁**（r=1.5），目視可辨 |
| （到期） | 123 | — | enabled rig=**0** | 模板預設 lifeSec 2.5（75 tick）回收 |

⭐ **過程中抓到並修掉一個真缺陷**：EX 節點最初吃模板預設 `distance 0.1`（貼在施法者正中），
audition 差分尺量到 **0 px** —— bounding box 實測整具泥 100% 被施法者模型包住（第一·五守則
「說了但不會發生」的形狀）。修法＝節點寫自己的 `distance: 1.5`（原作 AOsw 召喚物立在施法者
**旁邊**，不在體內）→ 差分 735 px。⛔ 沒有差分尺這缺陷會全綠出貨。

## ThunderClapCaster —— 動態證明**待主 session `pnpm skills:sync`**

o006（45-03 千鳥）的落點 `godie-edem.e` 是 skillremake:json 的產物（champion 鏡射也是）⇒
本 lane 只能改來源 `tools/skill-remake/heroes/godie-edem.py`。sync 落地後跑：
`beam-audition.html?ability=godie-edem.e` → cast → +61 tick（詠唱 2s）→ 雷環（scale 3.5 紅）
應在施法者腳下出現 1 秒。靜態那半已由 `locustPentaFamilies.test.ts` ① 守住
（glb 2/2 prim 出生可見＋貼圖＋UV；轉換紀錄 3 貼圖全 shape-in-rgb、emitter peak 255）。
誠實限制：原作頭頂電光的**材質動畫**（flipbook）不在 glb —— 雷環幾何與電光面片在，
但不閃爍（同 mdl-params.md 的既有結論）。

## ChaosOrcRange —— 全族零可見落點 ⇒ ⛔ 刻意不轉（無圖）

oshm 五個生成點逐點 `ShowUnitHide`（隱形 bloodlust/stomp 代理）· h019 屬 Othr（31 金鋼狼，
`_legacy`）· o031 零生成點。詳 PENTA 報告 §無落點表。
