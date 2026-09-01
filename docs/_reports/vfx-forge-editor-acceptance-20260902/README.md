# VFX Forge 八招驗收與來源評價

狀態：**Editor capability 候選已完成；Owner 人工 pass/fail 尚未裁決**  
日期：2026-09-02（Asia/Taipei）  
分支：`feat/vfx-forge-codex`（未寫入 `main`）

## 結論

- 八招都已從空白畫布使用 Forge 公開積木重建，不靠載入 fixture JSON 冒充操作成果。
- 每招送審前都跑完整 Runtime／真 `CameraRig`／雙方實際 3D model／真 `VfxSystem` 的底板掃描；八筆送審均通過。
- `docs/_review/ai-proposals/` 現有八筆 `editor-capability-fixture`，每筆含兩張候選畫面，共 16 張；預覽對手固定記錄為 `godie-e00r`。
- 八筆均由伺服器強制 `promotable:false`。後台只顯示 pass/fail 與人類 0～10 分，不顯示 Promote。
- 這是「編輯器能表達」的驗收，不等於這些演出已獲 Owner 核准，也不會直接取代遊戲 `main` 的技能內容。

後台單頁證據：[`admin-one-page-human-review-avalon.png`](admin-one-page-human-review-avalon.png)

## 三種真相不可混成一種

| 來源 | 最可靠地回答 | 優點 | 不能直接當成什麼 |
| --- | --- | --- | --- |
| Owner 最新目標 | 現在希望玩家看到什麼 | 最終產品方向；能明確推翻歷史表現 | 不是時序、座標與資產細節的完整實作規格 |
| 目前 `main` | 今天遊戲實際能播什麼 | 真 Sim、真事件 provenance、真 CameraRig、真模型／粒子與 config-backed 限制；最能驗證可維護性 | 不是視覺品質保證；有些技能只有 ability art、缺 script，亦可能仍保留舊紅飛彈或重複層 |
| JASS＋蝗蟲群 W3X | 原作當年「怎麼演」 | 逐段時間、隱藏／換位、飛行高度、動畫速度、dummy/locust 排列與鏡頭震動最具參考價值 | 不是現代引擎 schema；大量 magic number、隱藏單位與 WC3 模型副作用不能直接逐字移植 |

採用順序是：**Owner 決定產品目標；JASS 提供原作編舞證據；main 決定今天能否正確、可維護地播放。** 三者衝突時必須在來源面板與送審紀錄明示 `partial` 或 `owner-override`，不能偷偷折衷。

## 八招逐項評價

分數是 AI 的初步肉眼評價，不是 Owner 裁決。

| 技能 | `main` 參考價值 | JASS＋蝗蟲群參考價值 | Editor 候選 | 採用與剩餘風險 |
| --- | --- | --- | ---: | --- |
| 龍破斬 `godie-hjai.e` | 5/10：已有 2 段 script，但遠端爆炸與沿途層次偏薄 | 8/10：A04R 清楚給出週期推進與抵達爆炸 | 7/10 | 保留投射→爆炸時序，採 Owner 紅橘體積；[側視](01-dragon-slave-endpoint-side.png)／[俯視](01-dragon-slave-endpoint-top.png) |
| 神滅斬 `godie-hjai.r` | 3/10：只有 ability 演出，缺專用 script | 5/10：A07F 的震屏／路徑效果有用，但原作推的是受害者 | 6/10 | Owner 明確改成施法者 dash；不能聲稱 JASS 1:1。[命中](02-ragna-blade-hit-side.png)／[穿越](02-ragna-blade-exit-side.png) |
| 超究武神霸斬 `godie-hart.r` | 7/10：12 段 script，是八招最好的 main 基線 | 9/10：A077/A0B1 有逐刀站位、升空、受害者定格與逐段加速 | 7/10 | 已有多段斬與黃藍直立終結；逐段速度／高度仍是 Owner 評分重點。[連斬](03-omnislash-combo-side.png)／[終結](03-omnislash-final-side.png) |
| 阿邦快速劍X `godie-nbbc.r` | 5/10：ability 已有真 blink，但舊 script 的 hideBody／替身會重複位移 | 7/10：A0EZ 明確記錄隱藏本體、550 wc3u 位移與落點 | 6/10 | A 段採 Owner 藍衝擊波；B 段只補動畫，不再以 script 移動 authority。[A 段](04-avan-x-wave-side.png)／[B 段](04-avan-x-dash-final-side.png) |
| 龍鬥氣砲咒文 `godie-nbbc.e` | 3/10：只有 ability 的十顆 RedDragonMissile，與 Owner 藍光束衝突 | 7/10（歷史）／3/10（Owner 目標）：A05J 的十 dummy 節奏清楚，但顏色與形狀不同 | 5/10 | Editor 能畫藍白寬 beam；若 main 的 ability-owned 紅飛彈未被 presentation replacement 壓掉，仍不得上線。[安全寬度](05-dragon-aura-beam-fixed-side.png) |
| 龜派氣功 `godie-ogrh.r` | 6/10：已有 ReviveHuman／FlameStrike 資源與 script，但輪廓偏薄 | 8/10：A03S 的槍口、六段路徑、震屏與收尾資訊完整 | 7/10 | 保留資源家族，使用安全的橫向比例重建橘金寬 beam；禁止回到巨大拉伸白卡。[畫面](06-kamehameha-beam-side.png) |
| 理想鄉EX `godie-e002.ex` | 6/10：17 段 script 與真 reflect provenance 已存在，但模型／換位品質仍需肉眼驗收 | 9/10：A0CT 與 EX 鏈能證明反彈成功→多段斬→終結的因果 | 7/10 | 新成品組合含 reflect 起手、六次本體換位與第七段黃藍橫砲。[反彈](07-avalon-reflect-side.png)／[連斬](07-avalon-slashes-side.png)／[終結](07-avalon-final-side.png) |
| 騎英之手綱 `godie-hvsh.r` | 3/10：只有 ability 單次傷害／法陣，缺 dash＋beam script | 8/10（編舞）／4/10（Owner 形狀）：A0RQ 的曲線、高度與 h024 路徑很有用，但不是藍長 beam | 6.5/10 | 依 Owner 做 Rider 本體 dash＋藍白光束；永久保留 owner-override 紀錄。[突進](08-bellerophon-dash-beam-side.png)／[落點](08-bellerophon-exit-side.png) |

## 過程中真正抓到的缺陷

1. Forge 曾把真 CameraRig 強制拉到 10u，12u 技能的落點直接出框；已改回 main 的 config-backed 18u 預設。
2. Textureless PBR 地板會在冷載入停在 Babylon 白色 placeholder；已改成固定中性 unlit 場地材質。
3. 冷 seek 會在貼圖解碼前消耗首發 burst；預覽現在先 GPU primer，再重播權威畫格。
4. `imported.linainvers` 的 alpha-bearing 貼圖宣告為 OPAQUE；神滅斬改成移動真正施法者，不生成危險分身。
5. ReviveHuman 遺失 WC3 PRE2 ribbon；過度拉伸到長軸 8 會變巨大白卡。保留通過畫面的 `scale:4`、`scaleAxis:[0.9,0.9,4.4]`，粒子只做有限外暈。
6. 阿邦快速劍X 的 ability 已擁有 blink；script 再加 `bodyMove` 會雙重位移。已加結構守衛，main 若移除 blink 測試會轉紅。
7. 舊預設對手 `sela` 是 blockout 方塊模型，白色頭部會被誤認為小型近白底板，也不符合「雙方 3D model」驗收。改用真英雄 `godie-e00r`；切換目標會清除舊證據。失敗診斷保留在 [`07-avalon-audit-failure-side.png`](07-avalon-audit-failure-side.png)。
8. 最初後台只有文字與 JSON；人類無法在一頁看候選畫面。現在 proposal 嵌入格式／大小受限的 WebP/PNG framebuffer，修改 draft 即清空，後台同頁顯示後才可打分。
9. 「伺服器鎖定不可 Promote」只能防止錯候選直接上線，不能判斷配方選錯。實測曾把火球配方送進超究武神霸斬；後續以正確候選覆寫，並新增理想鄉／Rider 多階段成品卡降低誤操作。

## 尚待 Owner 做的事

在後台「AI 變更上線前批核」逐筆檢查 16 張候選畫面、來源對照與 JSON，填入肉眼分數及意見，再按 pass 或 fail。這是刻意留下的人類裁決點；Editor／AI 不會替 Owner 自動按通過。
