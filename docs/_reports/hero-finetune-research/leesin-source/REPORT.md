# 李星六槽來源候選：可繼續的本地資料工作

本輪新增一份依完整原文重新建立、通過六槽針對性行為與離線 ZIP 往返的開發候選。**不是模型生成的成功案例，不是新盲測，也尚未投入正式 SFT。** 這證明等待 Main 的點位修正時，其他英雄資料仍有可做的工作；缺外部最終評估資料不能被當作全部停工的理由。

## 實際結果

| 檢查 | 結果 | 範圍 |
| --- | --- | --- |
| 原文／身分／六槽 | 全文與每槽 hash、出身鬥士、編譯後 originOf 均核對 | 歷史 GGD 改編，不是 LoL 原版或新 Owner 核准 |
| 正向行為 v2 | 28/28 | 14 個情境 × 2 seeds，真實 compiler／registry／SimWorld |
| 錯誤配方 | 12/12 檢出 | 每種均成功編譯，且具有同一探針的通過控制組 |
| 通用研究編譯工具 | 7/7 測試 | 來源漂移、出身、模板、參數、槽位及不誤升級 |
| 離線套件 | 往返後完整 HeroProject、編譯內容一致 | 336 entries；ZIP 2,890,218 bytes；重建逐位元相同 |
| 偽造 runtime | 拒絕 | 外層內容／package hashes 重算、ZIP transport 可讀，仍被正式重編譯比對拒絕 |
| GPU／模型 | 未啟動 | 沒有新增推論、訓練、adapter 或模型準度結論 |

ZIP SHA-256：`28b5ce6dd54861814e8ec8a7eeabb7690a0d62a0a169ce165e7f32e070245bfe`。

## 原文明示與驗證

| 槽／關係 | 原文重點 | 實際檢查 |
| --- | --- | --- |
| PASSIVE | 普攻極小級物理追加，2 秒內置冷卻 | 真实普攻及切換目標；型別、級距、間隔；技能不誤觸發普攻追加 |
| Q | 中級距指定敵人；無自動二段位移 | 單體命中、拒絕友軍、施法者不移動、不自動發 EX、冷卻仍有效 |
| W | 自身 3 秒盾與 20% 攻速 | 實際吸收、友軍無盾／無加成、到期還原、過期盾不再吸收 |
| E | 近處可指定落點，小級物理爆破 | 空間內／外對照、cast point 一致、友軍不受傷、類型與級距 |
| R | 短距進身後打擊並向前推開；無無敵／全場追蹤 | 進身完成才命中、推開近敵、遠敵／離開者不命中、施法者仍吃真傷、不能無限重放 |
| EX | 朝落點跳躍，著地才打擊附近敵人 | 起跳／飛行中無傷害、同 tick 著地事件與傷害、落點一致；敵人離開則落空；沒有追加敵方擊退 |
| Q／EX | 拆成獨立技能，無二段重放 | 未放 Q 也能用 EX；放 Q 後不自動發 EX，仍可獨立施放 |
| 共通規則 | 能量改用共通魔力 | 使用正式 manaCost；死亡後五個主動技能皆拒絕 |

R 使用現有 `dash.onEnd → damageArea.onHitTargets → knockback`，EX 使用 `leap.onLand`。沒有為李星新增引擎 if，也沒有把衝刺與傷害平鋪後誤稱「移動後才傷害」。本候選尚未接入舊 IR5 模型輸出契約；編譯它不代表舊模型已能生成這種動作結構。

## 首輪失敗及修正證據

v1 為 22/28 正向、9/12 可計數反例；完整保留在 `leesin-plan-audit-v1/`。

- 普攻情境沿用直接 nav.order 與較遠目標，近戰角色沒有真正發動攻擊。v2 以公開玩家指令啟動首次攻擊，兩名敵人都在合法、互不重疊的近戰距離，並以公開指令切換目標。
- 事件使用執行中的 tick，而 probe-harness 在 world.step 完成、tick 加一後才記錄位置。v1 使用 `frame.tick == event.tick`，因此讀到落地前一幀。v2 使用 `event.tick + 1`，另要求同 tick 的真正著地 explosion，其點位等於指定點。
- v2 以 deepEqual 強制與 v1 的整份編譯輸出相同。没有改原文、傷害、移動、模板或引擎來讓測試過關。

這兩項是測試設定錯誤，不是產品回歸，也不是模型效果提升。

## 資料准入邊界

候選保留十類原文未指定的預覽選擇，例如 Q／R／EX 傷害型別及量、W 盾量與吸收型別／堆疊、R 方向式地面施放與距離／速度／範圍、EX 高度／時間及模板成本／冷卻。它們在 `leesin-plan-v1.mts` 的 `sourceChoices` 中明列，不得整份當唯一正解做 full-value SFT。

目前可確認的是 **一份通過具體正反情境與離線套件驗證的開發配方**。不是所有方向／地形／戰況的窮舉，亦未驗證 live importer、實機遊戲、VFX 視覺、模型生成或獨立泛化。特效仍為預設展示，沒有訓練細部參數。

舊 44 人 ledger 保持凍結且重新驗證通過；不藉改 true 將其升格正式 Gold。下一步應把這份完整候選的已知機制與未知選擇映射到可表達「進身完成後打擊」的版本化模型契約，再依來源准入規約累積更多完整英雄；只有資料與對照齊備才跑有界 LoRA。

## 檔案與重跑

- `leesin-plan-v1.mts`：完整來源候選及不確定選擇。
- `compile-reviewed-products-v1.mts`：通用合法模板組装，保留完整來源，不自動認證。
- `leesin-probes-v2.mts`、`audit-leesin-plan-v2.mts`：正向／反例一次跑完，任何未解失敗則退出非零。
- `leesin-plan-audit-v2/`：候選、編譯成品、原始事件／幀、每個反例及 pins。
- `package-leesin-v1.mts`、`leesin-package-v1/`：可編輯 HeroProject、正式格式離線 ZIP、偽造拒絕及結果。

使用已記錄的 isolated-engine 版本與相鄰研究目錄，輸出必須新名稱：

```sh
node --import tsx --test ../outputs/hero-forge-12b-restart-20260908/reviewed-products.test.mts
node --import tsx ../outputs/hero-forge-12b-restart-20260908/audit-leesin-plan-v2.mts ../outputs/hero-forge-12b-restart-20260908/leesin-audit-rerun
node --import tsx ../outputs/hero-forge-12b-restart-20260908/package-leesin-v1.mts ../outputs/hero-forge-12b-restart-20260908/leesin-package-rerun
```

上述環境預期退出碼皆 0。v2 核對已封存 v1 的成品；套件工具核對已封存 v2 的成功收據與全部 pins，不會自動採用任意同名新結果。套件 target 明示 offline-research-not-live，不是正式伺服器部署收據。
