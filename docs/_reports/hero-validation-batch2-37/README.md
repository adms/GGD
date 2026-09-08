# 第二批37名完整英雄生成：v2開發驗證參考集

v2 已取代被否決的 v1（`d374865c1`）。本批實際重寫 37 名／222 槽，走正式 HeroPlan、HeroProject、生成器、編譯器、SimWorld 與套件格式。最新准入以 [ACTIVE.json](data/ACTIVE.json) 指向的報告及來源雜湊為準；`build-history/` 與舊 exposure 收據不代表目前合格。

對應 [#1142](https://github.com/adms/GGD/issues/1142)。用途是**完整六槽與既有機制組合的開發驗證參考答案**；`external-evaluation-only`、`trainEligible=false`，沒有模型訓練、雲端操作或引擎擴充。

## 分層結果

| 層 | v2 結果 | 證據与界限 |
|---|---|---|
| 正式合法性 | 37／37、222／222 槽 | schema、enabled模板參數、引用、出身屬性、數值鏡像、正式編譯及基礎六槽情境 |
| 因果行為 | 37／37 | 74 條連動、296 條配對時間線；每條有真前置／無前置、保留／移除連動四組對照 |
| 一般邊界 | 313 項、37 名被動、76 項到期檢查 | 有效盾池、狀態、buff等；條件效果未在孤立施法建立的項目明列 not-observed，不冒稱全覆蓋 |
| 特殊邊界 | 17 cases、166 timelines、325 assertions | 反彈通道與單次消耗、雙門檻、取消排程、卸載附魔、存款消耗、固定24種子分支等 |
| 如月專項 | 16 cases、17 組檢查 | 真傳送、三正式狀態、友敵與圈外、精確到期和恢復接收命令、合法落點、種子、上限及資源對照 |
| 逐槽內容審查 | 37 名、222 則逐槽意見 | 兩位代理作者審查，A組另有交叉複核；不是獨立人類測玩或平衡認證 |
| 正式離線套件 | 37／37 | 37 個實際 ZIP 寫入磁碟、重讀與正式parser往返；逐資產bytes SHA、假descriptor及受損bytes负例 |
| 完整遊戲上場 | **0／37** | 正式遊戲匯入、畫面、操作、碰撞及對戰未驗收；36名仍用核准代理本體 |
| 嚴格盲測／訓練資格 | **0／37／禁止訓練** | 已按英雄分組並隔離公開輸入，但無完整歷史訓練暴露和所有別名簽核 |

實際工具測試 15／15（4 個結構診斷測試＋11 個 SimWorld 測試機制測試）。這些通過只證明工具對應行為，不能代替內容品質。所有最新執行碼與 log 見 [pipeline-report.json](data/pipeline-report.json)。

## 角色特色與相似性

[37名招牌／因果／最接近者矩陣](特色差異矩陣.md) 和 [逐名完整正文與222槽審查](英雄設計與逐名審查.md) 是內容入口。原作身分、採用版本與來源分級見 [identity-sources.json](../../../tools/editor-acceptance/batch2-37/identity-sources.json)；Ned 的官方來源只確認作品，角色對應的次級佐證已明列。原作辨識元素和 GGD 喜劇玩法分開。

未發現六槽完全同套的英雄，但有 **11 對明列的共用子循環／相似家族**，不把它們稱成新發明：凜／開司存款、尚文／章魚嗶友軍貼紙換治療、蜘蛛子／克勞斯搬動跟身場、波吉／幸運超人閃避回饋、凱茲／艾爾瑪壓血收益、何布／阿爾巴斯位移後急救、哥殺／托卡搬人進區域、蕾姆／凱茲自損加班、阿爾巴斯／歐菲冷卻回收、托卡／小新定身後搬人、阿箱／凱亞爾治療憑證換盾。矩陣逐對列共同結構、可執行笑點、差異與仍然相似的部分。

整套結構正規化沒有 exact/near 命中，**不代表零相似、37種獨立玩法或保證好玩**。它不是完整機制圖同構判定。使用目錄重新確認為 43 個 enabled 模板、51 個狀態、702 個 VFX；本批實際覆蓋 19 個模板、25 種 effect、14 種 hook、5 種條件葉、20 個狀態、9 種定位、11 個 VFX，11 槽使用多卡。詳見 [diversity-report.json](data/diversity-report.json) 的頻率及集中度；沒有以湊滿目錄當品質目標。

## 如月與素材

如月的可操作本體資料現在指向**實際原創電車 GLB**，不再是 `champ.thorne` 換名字。原始幾何、輪子與車門、六段真動畫，經正式 prepare/verifyUploadedHeroModel 及 Khronos 檢查；實際 accessor 渲染預覽與資料見 [assets/README](../../../tools/editor-acceptance/batch2-37/assets/README.md)。這是原創 GGD 電車，不是原作抽出模型。

R 對每位圈內敵人分別等權抽 8／12／16 單位，朝施法者方向傳送，允許越過車身並受合法落點限制；**不是全地圖均勻亂數**。半徑4採正式碰撞體重疊規則，不能以中心距離單独判圈外。到站沿出貨配方施 curse（5秒、失手50%）、blind（1秒、失手50%）、confusion（1秒、berserk/targetsAllies）；實際旗標與到期後命令接受均有證據。

其餘36名仍用 Sela／Thorne 核准代理；圖示用既有 UI fallback，不宣稱原作外觀或逐英雄獨立圖示。電車細長外形仍用既有 uploaded-model 0.6 碰撞半徑，畫面與碰撞對位需正式遊戲複核。離線渲染不冒充遊戲上場。

## 資料與模型输入隔離

| 路徑 | 用途 | 受測模型可讀 |
|---|---|---|
| `data/public/prompts/` | 37份完整英雄生成題目 | 是 |
| `data/public/catalog.json` | 既有模板、狀態實作配方、VFX、代理與原創電車可用descriptor | 是 |
| `data/public/assets/` | 公開可用原創電車bytes，由來源重建 | 是 |
| `data/private/teachers/` | 私有HeroProject教師答案 | 否 |
| `data/private/compiled/` | 私有編譯結果與正式出身數值 | 否 |
| `data/private/evidence/` | 原始每tick狀態／事件與四組對照；gzip無損壓縮 | 否 |
| `data/private/packages/` | 實際可重播ZIP，每包約2–3MB | 否 |
| `data/*-report.json` | 評分端收據與分層資格 | 評分端 |

`private/` 是邏輯分隔，並非存取控制。模型只能取得 allowlist 匯出的新目錄，不能掛載整個 repo 或讀教師檔。`partition-report.json` 將已知角色名、原名、六槽、改寫、分身型態與教師答案綁同一英雄組；未来別名必須回歸同組。舊 `exposure-report.json` 是歷史部分盤點，不是本輪新訓練清單簽核。用本批選模型、改prompt後只可稱開發驗證。

合理等效設計是有效答案，不要求模型猜中教師招名、唯一模板排列或私有連招。這37名不能代表所有英雄生成能力，也不構成完整美術自動生成基準。本輪沒有跑受測模型、產生模型分數或證明微調提升。

## 一鍵重跑

在此 repo root、既有專案 Node/tsx 依賴與正式content可用的環境：

```sh
node tools/editor-acceptance/batch2-37/run.mjs
```

順序為工具測試、生成、一般行為、特殊邊界、電車專項、磁碟ZIP、差異統計、隔離、固定審查receipt比對與准入。修改內容後，逐槽審查的project/compiled SHA若不符會失敗；runner不會自動重新蓋章。所有生成／驗證來源位於 `tools/editor-acceptance/batch2-37/`。

```sh
# 新目錄必須尚不存在；只匯出模型可讀題目、目錄及原創電車素材。
node tools/editor-acceptance/batch2-37/partition.mjs --export=/absolute/new/model-input
# 唯讀，比對收據與磁碟ZIP。
node tools/editor-acceptance/batch2-37/check.mjs
# 僅驗Git交付收據；不聲稱重播本地未入Git的ZIP/GLB。
node tools/editor-acceptance/batch2-37/check.mjs --receipt-only
# 完整遊戲准入仍缺證據，預期exit 1。
node tools/editor-acceptance/batch2-37/check.mjs --require-complete
```

套件資產預設只讀本repo content及旁邊既有 `GGD-community-hero-forge/content`；也可對 `verify-package.mjs` 明確傳其他完整content根目錄。缺bytes即失敗，不補假檔、不下載、不改該目錄。ZIP／GLB／預覽二進位留在本地，由原創資產來源與已核准素材引用重建；本次Git提交來源、正式JSON與原始測試收據，不提交依賴symlink或第三方素材。

完整repo的三項pre-push gate與此批資料資格是不同層，執行紀錄見 `prepush-gates.json`；CI與必要Main review未完成前不視為合併。
