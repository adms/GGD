# GGD 社群角色動作對應清單

依目前 `model@1`、ClipAnimator 與購買反應的實際消費端整理。遊戲用 GLB 只保留會用到的片段；本機轉出的 251 段原始動作另存備份。

| 用途 | 代號 | 契約／播放方式 |
| --- | --- | --- |
| 待機 | idle | clipMap 必填；循環 |
| 移動 | run | clipMap 必填；循環，速度隨移動速度調整 |
| 普攻 | attack | clipMap 必填；一次性，對齊攻擊前搖與命中時點 |
| 施法 | cast | clipMap 必填；一次性，配合技能施法時間 |
| 受擊 | hurt | clipMap 必填；短暫反應，移動時不搶走移動動畫 |
| 死亡 | death | clipMap 必填；停留最後一格 |
| 慶祝／勝利 | celebrate | 演出用途；以 celebrate／cheer／victory／dance 名稱尋找 |
| 格擋 | guard | 演出用途；尋找 defend／block／guard／shield／parry |
| 閃避 | dodge | 演出用途；尋找 dodge／evade／roll／sidestep／walk |

六個核心欄位都需要填入名稱，但可以共用片段。這不等於每項都已有獨立動畫；找不到片段時現有播放器會警告並退回 idle。格擋與閃避不可用受擊動作冒充。

## 現有消費端

- `packages/shared/src/content/schema/model.ts`：`zClipMap` 六個核心欄位，嚴格 schema。
- `apps/client/src/render/ClipAnimator.ts`：三種額外演出用途、名稱解析、循環／一次性播放。
- `apps/client/src/render/anim/AnimationStateMachine.ts`：事件優先序及移動中的受擊處理。
- `apps/client/src/render/intermission/reactionClip.ts`：購買反應直接挑 GLB 原始名稱；優先慶祝，再普攻，再施法，不讀 clipMap。
- `tools/model-budget/trimClips.ts`：裁剪器以引用該 GLB 的模型文件 clipMap、播放器實際解析、購買反應和具名保留清單取聯集，寫入另一份候選檔案。本批補上播放器解析，避免刪掉 clipMap 之外的格擋與閃避。

目前 Q／W／E／R／EX 都走共用 `cast`；`vfxScript` 的 `anim` 段只能指定語意脈衝與時間窗，尚不能指定任意原始 clip。要讓每個技能播放不同原作動作，需另接通用動作綁定欄位。保留所有 spell 片段不會自動讓它們被播放。

## 七位角色的最小候選集合

以下名稱均存在於實際轉出的 GLB，這是接線候選，不代表已完成 GGD 遊戲內綁定。

| 角色 | idle | run | attack | cast | death | celebrate |
| --- | --- | --- | --- | --- | --- | --- |
| 沃維克 | warwick_idle_v1 | warwick_run | warwick_attack1 | warwick_spell1 | warwick_death | warwick_dance_loop |
| 卡爾瑟斯 | karthus_idle01 | karthus_run | karthus_attack1 | karthus_spell1a | karthus_death | karthus_dance_loop |
| 拉克絲 | lux_idle1 | lux_run | lux_attack1 | lux_spell1 | lux_death | lux_dance_60fps |
| 犽宿 | yasuo_idle1 | yasuo_run1 | yasuo_attack1 | yasuo_spell1a | yasuo_death | yasuo_dance_loop |
| 好運姐 | missfortune_idle1 | missfortune_run | missfortune_attack1 | missfortune_spell1 | missfortune_death | missfortune_dance |
| 李星 | idle_active | run_combat | attack1 | spell1_cast | death | dance |
| 齊勒斯 | xerath_idle1 | xerath_run | xerath_attack1 | xerath_spell1 | xerath_death | xerath_dance |

目前這批原始清單沒有明確命名的 hurt／guard／dodge；不把任意原作技能片段算作已完成這三種對應。接線時可補短反應或明確採用既有回退。裁剪先保留上表六段，共 42 段，後續只在新增消費端時增加片段。

## 預算

平板目標為 iPad mini A17 Pro、30 fps；使用開發機成本與 3 倍保守係數估算，A17 Pro 實機測試不列交付門檻。每隻 160 個動畫通道、同場 12 隻共 1,920；三角面 28,000、Mesh 5、貼圖最長邊 1,024 px 維持。

片段數影響檔案、載入與儲存成本；每幀通道數指當下動畫對節點位置／旋轉／縮放的運算。裁成六段不保證每段低於 160，因此裁剪後仍按現有工具量一次。
