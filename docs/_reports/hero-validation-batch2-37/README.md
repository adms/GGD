# 第二批 37 名：既有機制組合驗證候選集

對應 [#1142](https://github.com/adms/GGD/issues/1142)。這批給基底／微調模型做完整英雄生成能力的**開發驗證候選**，不是追加訓練，也不是已驗收上場的 37 個黃金答案。

## 固定範圍

依 owner 最新裁定：簡單、惡搞、符合定位、技能有連動；複用既有標籤與模板，不新增引擎積木、註冊模板、狀態 ID、資源系統。精確原作能力還原讓位於明示的 GGD 惡搞改編，不得把笑話當機制。

- 37 名、222 槽；每名 PASSIVE／Q／W／E／R／EX。
- 兩個正式 enabled 模板：`tpl-event-passive`、`tpl-effect-sequence`。
- 五個既有狀態：`rage`、`slow40`、`curse`、`blind`、`confusion`。
- 七個既有 VFX 施法提示選用，不調發射器、微粒、shader，不新增特效模板。
- 19 個程式內 authoring action 是離線配方展開 helper，不是新引擎機制或註冊模板。
- 如月電車 R 複用範圍效果、逐目標隨機分支、瞬移與既有三狀態；8／12／16 距離等權抽選並走現有地形限制，**不是全地圖均勻隨機座標**。

## 工作流入口與資料隔離

先看 [逐名完整設計與自審](英雄設計與逐名審查.md)。

| 路徑 | 用途 | 可給受測模型？ |
|---|---|---|
| `data/public/prompts/` | 37 份題目，含作品、題材、出身與生成約束 | 是 |
| `data/public/catalog.json` | 固定目錄、模板、狀態配方、代理本體與 VFX 選項 | 是 |
| `data/private/teachers/` | `ggd-hero-project@2` 六槽教師草稿 | 否 |
| `data/private/compiled/` | 真編譯器產物，含出身屬性與實際數值 | 否 |
| `data/private/evidence/` | 基礎施放與兩條連招的四組正反對照原始事件 | 否 |
| `data/*-report.json` | 自審、行為、群體傳送、ZIP、暴露風險 | 評分端 |

`private/` 是邏輯分隔，不是存取控制。實際評測請在受測程序只能讀 public 的獨立輸入目錄執行，不能把整個 Git checkout 暴露給模型。尚未提供一個已驗收的模型評測 runner；勿將本資料建立成功報成 12B 表現提升。

使用英雄為最小分組單位；同一名的改寫、六槽、連招與教師答案不得跨訓練／驗證。`trainEligible=false`，沒有加入任何訓練管線。若日後拿本批挑模型、改 prompt、修訓練，就只能稱開發驗證，不再是最终盲測。

## 驗證與限制

權威計數在 `data/report.json`、`behavior-report.json`、`train-report.json`、`package-report.json`，不以本頁敘述代替最新結果。

1. 正式 schema、模板編譯與 baseline SimWorld 基礎六槽施放。
2. 每名固定選兩條作者拓樸上的真前置施法序列；與移除條件加成的配方、無前置配方做四組對照。不得依測試分數挑能過的連招。
3. 電車另跑 6 個固定種子、10 人上限場景、零魔力負例；驗證實際位移、三狀態旗標、友軍／圈外排除、到期移除、合法落點、可重播與不同結果。
4. 正式 HeroPackage 建包、記憶體內 ZIP 往返、重新解析驗證，使用實際本地資產位元組；輸出 hash，ZIP／二進位不進此 Git 變更。
5. 作者親自檢查 37 名六槽來源設計與共用實作，逐名留下一則判讀；**不是獨立人審，也不是完整原作查證**。

目前所有本體仍是 `champ.sela`／`champ.thorne` 代理。**如月的可操作本體還不是電車**；其他人物也沒有原作外觀、獨立圖示或完整實際畫面證據。逐名被動／友軍／失敗邊界／每階數值的完整語意矩陣、正式遊戲匯入與對戰驗收尚未涵蓋。因此 `completeGoldHeroes=0`，完整准入 gate 故意失敗，不能用本包宣稱「37 名從無到完整上場」完成。

## 可重跑命令

於 repo root 執行；需既有專案 Node／tsx 依賴與完整 Main content 目錄，不安裝／下載模型。

```sh
node tools/editor-acceptance/batch2-37/build.mjs
node tools/editor-acceptance/batch2-37/verify.mjs
node tools/editor-acceptance/batch2-37/verify-train.mjs
node tools/editor-acceptance/batch2-37/verify-package.mjs /absolute/path/to/complete/content
node tools/editor-acceptance/batch2-37/review.mjs
node tools/editor-acceptance/batch2-37/check.mjs
```

最後的快速 gate 唯讀，檢查來源／教師／編譯結果雜湊與報告相依。加 `--require-complete` 會因完整驗收尚未完成而 exit 1。變更來源後須重新 build 及其後全部驗證，不得改報告分數。

package verifier 預設讀本 repo 的 `content`；可明確提供已有、含完整二進位的 content 目錄。它不下載、不補假檔、不修改目錄。這次先用主工作樹資產遇到缺少音效，改讀既有社群工作樹完整資產；成功包內仍保留每個實際位元組的 SHA256。正式目標版本欄位明標 `offline-evaluation-only`，不是部署中的 importer receipt。

隔離初篩另外執行：

```sh
node tools/editor-acceptance/batch2-37/audit-exposure.mjs /absolute/inventory.json /absolute/frozen/examples.json
```

這只初篩指定 snapshot 的名稱、子字串與教師文字；不假設各別名不同就是不同角色，也不能保證舊模型從未看過。

## 下次如何比模型

先凍結這份版本、輸入契約與評分政策，基底與微調模型使用**相同 public 題目／目錄／輸出上限／生成次數**；只做相同 JSON 包裝修復，不替任一模型補語意或重設技能。

逐英雄分開報：JSON／結構合法率、出身屬性一致性、六槽完整性、友敵與時序正確性、兩條連招因果通過率、既有模板／標籤選用率、特效合法綁定率；另列趣味與角色辨識度自審，不混成單一「全自動成功率」。等效設計不要求與教師招名或模板排列逐字相同。

**簡化會縮小學習目標，但不保證 fine-tune 收斂或泛化。** 37 名大量共用少數配方，不能當成 37 個獨立機制族。須按配方／組合族另做留出檢驗；目前這批可用來測既有積木組合，不能代表所有英雄机制，更不能代表外觀全自動產製。

待完整驗收與隔離條件足夠再由工作流明確准入；保持候選狀態比把缺口包裝成高分教師答案更重要。本次不開發新機制來補缺口。
