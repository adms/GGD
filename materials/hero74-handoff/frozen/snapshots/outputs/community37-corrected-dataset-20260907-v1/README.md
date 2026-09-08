# 37 名英雄：已校正的來源判讀增補資料集

本次工作是**資料校正與匯出**，不是訓練、模型更新或遊戲內容修復。原始設計、HeroProject、runtime、ZIP、舊資料集與模型均未覆寫。

## 現在可用的資料

| 項目 | 數量／狀態 |
| --- | --- |
| 完整英雄參考 | 37 名，含原始 identity 與六槽設計全文 |
| 逐槽校正參考 | 222 槽，原文與原模板保留 |
| 有校正或明確隔離處理的參考槽 | 82 槽 |
| 來源判讀研究訓練增補 | 555 筆：74 英雄設定、481 技能機制 |
| 標籤 | supported 259、contradicted 259、not-stated 37 |
| 已核准原意→模板映射答案 | 0；222 個原映射均隔離，不進正向訓練答案 |
| 新 dev/test | 0；此包全部為 train 增補，不能作未見測試 |
| 訓練／GPU 推論 | 訓練仍未執行；2026-09-07 新授權後已完成 555 題三模型推論，詳見下方更新 |

555 筆是 **259 份鎖定來源（37 個角色身分＋222 個技能槽）上的不同敘述**，不是 555 個獨立英雄或機制來源。

這些標籤由助理逐份閱讀原文後撰寫與審閱，不是人類 Owner Gold、獨立複審、外部原作核實或完整能力驗收。正例檢查的是所選敘述，不表示已完整涵蓋整招所有要求。

## 哪些錯已修正

校正由 `build.mjs` 與 `curation.mjs` 產生，可重建；不是只改一份衍生 Markdown。

- 22 槽 line-sweep：改正同目標去重的目前行為說明，移除把已存在去重當成確定缺口的敘述。
- 6 槽 traveling-wave：補上繼承的終點 damageArea、實際半徑與主波去重；保留「原意是否允許」的檢查要求。
- 13 槽 lock-combo：改成 DoT＋獨立收尾的真實編譯形狀，不稱為 N 次逐刀近戰判定；先查 comboStrikes 重用，不宣稱引擎上限 20。
- 比利 Q/W/E/EX：待補要求改回抓取、防禦、首人停止衝撞、友軍盾＋韌性；不加入原文沒有的 EX 氣勢消耗。
- 37 被動：明確隔離替代底稿；不把普攻追加、受傷反擊或免死標記教成原設計的正確模板。

「修正」指**資料集的描述、需求與訓練標籤**，不表示舊 HeroProject 的錯配已在遊戲裡實作完成。原始配方及離線 ZIP 仍是舊交接版本，請勿把本包當作可投稿的英雄修正版。

## 入口與格式

所有正式輸出都在 `data/`：

- `dataset-registration.json`：此增補集的入口與使用狀態，automaticMerge=false。
- `train.jsonl`：既有研究格式 `{id,messages,target}`；messages 只有 system/user，target 另列。
- `train.chatml.jsonl`：`{messages}`，最後一則 assistant 是正確 verdict JSON。供後續明確選用此格式的訓練器讀取。
- `cases.private.json`：完整任務、來源雜湊、acceptedTargets、審阅範圍與分組。
- `requests.json`／`targets.private.json`：輸入和答案分開保存；這些仍屬 TRAIN，不是盲測題。
- `claim-review.private.json`：555 個判斷的來源、問題與答案對照。
- `corrected-reference.json`：222 槽原始與校正資料；保留 compiled 效果，但不改動 runtime。
- `hero-reference.json`：37 個完整英雄原文，供後續整套技能需求檢索參考。
- `correction-ledger.json`：82 槽 before/after 和校正類型。
- `template-quarantine.json`：222 個未取得原意等價驗收的模板映射，不作訓練正例。
- `dataset-manifest.json`：計數、來源／生成器雜湊、限制及檢查結果。
- `TRAINING_DISABLED.json`：保留停訓限制。推論另依 2026-09-07 的明確授權執行，資料集存在不代表可以恢復訓練。

範例任務的輸出僅為：

```json
{"verdict":"supported"}
```

沿用既有 `hero-source`／`owner-mechanism` 的三類 verdict 契約，但使用本包自己的鎖定 system prompt。引號中的狀態名稱（如萎靡）不被當作台詞盲目刪除；純演出台詞不推導額外機制。

## 正確使用界線

1. **拿來訓練／分析「讀懂所給來源」**，不是直接生成可執行英雄的正確 JSON，也不是引擎支援分類的 Gold。
2. 技能題只依輸入中該槽原文判讀；不能偷偷拿未提供的兄弟技能、共用補強文件、模板預設或外部常識補答案。`not-stated` 表示這份輸入沒有足夠資訊，不是整個世界沒有答案。
3. 本包 37 題 not-stated 相對少，**不應整包取代原課程**；未來混入課程前須檢查類別比例和來源重疊，不靠複製題目宣稱新增獨立資料。
4. 全部 train-only。任何本批英雄、改寫或同系列分組進訓練後，不得再把它們當全新未見案例；舊 dev/test 檔案未改，不代表與新資料的語意洩漏已排除。
5. 不替换舊 run 的 train.jsonl 或雜湊。下一輪必須建立新 run、重新核對來源與課程權重，並取得明確訓練授權。
6. 原生 tokenizer 已對 555 題逐一驗證長度，並完成既有模型推論；loss mask、實際 trainer 載入與使用本批資料訓練後的效果仍未驗證。ChatML 匯出格式存在不等於已跑過 MLX 訓練。

## CPU 驗證與重建

本輪薄守衛已通過：555 筆唯一 request、37 角色／222 槽正反例覆蓋、來源摘要、兩種匯出格式、答案不混入模型輸入、錯誤模板不被晉級；竄改來源摘要、將答案塞回輸入或把模板設為 admitted 會被拒絕。這些結構檢查**不取代語意審閱**。

從工作區根目錄執行檢查（不使用 GPU）：

```sh
node --test outputs/community37-corrected-dataset-20260907-v1/validate.test.mjs
```

重建需給定全新輸出目錄；既有輸出拒絕覆寫。若原交接來源已變，須先重新稽核，不得改雜湊來繞過：

```sh
node outputs/community37-corrected-dataset-20260907-v1/build.mjs \
  /absolute/path/to/ABxVFX_EDIT \
  /absolute/path/to/new-output-directory
```

現有正式位置為本目錄下 `data/`；另指定新輸出後，須明確更新新批次使用入口，不會自動替舊 run 換資料。

## 主工作流回饋

本包的 `correction-ledger.json` 與上一輪 `../community37-static-review-20260907-v1/REVIEW.md` 可供主工作流修正其源配方，再自行重建英雄內容。此輪沒有推送程式、開新遠端 issue、投稿或替其他任務修改內容。

## 補充：既有保留集重疊檢查

`PRIOR_OVERLAP_AUDIT.json` 已對 R3 與 R7-v2 的凍結 cases 檔執行 CPU 檢查，涵蓋其合計 59 份不同保留來源。新 555 題與上述保留集的完整 request、完整來源文字、忽略空白的来源文字、宣告作品分組均未發現相同項。

這不是全部歷史資料或語意改寫去重證明，**不解除 automaticMerge=false，也不授權恢復訓練**。舊原創角色「飛鼠先生」不能只因暱稱就合併到 OVERLORD 的安茲；蘭斯也不與 KYO 合併。檢查程式為 `check-prior-overlap.mjs`，輸出若已存在會拒絕覆寫。

## 2026-09-07 推論更新：資料未改、沒有新訓練

使用者明確表示「可以推論了」後，先完成 43 題小批，再對本包全部 555 題執行基底／R3／R7 同條件對照。完整結果為基底 529/555（95.32%）、R3 500/555（90.09%）、R7 511/555（92.07%）；三者各有 1 題錯誤放行。55 題失敗聯集皆已回讀原文覆核，未修改原標籤或任何 data 檔案。

完整報告：[555 題全量推論](../community37-inference-full-20260907-v1/REPORT.md)。全量包含先前 43 題，不能算成 598 題。新 555 題沒有被用來訓練這三個模型；本包仍是 train-candidate，不變成獨立未見測試集。全量程序合計 707.92 秒、Metal 峰值 8.61–9.03 GiB，工作已結束；不自動再開 GPU 或訓練。
