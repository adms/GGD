# AI 參考全自動鑄造守則

版本：1.0 · 2026-09-09 · 適用：GGD 社群英雄、六槽技能、機制、特效、模型與動作的生成及修正。

本文件供其他生成 AI 直接引用。目標是把完整原設計轉成可以實際操作、驗證、投稿與版本回復的英雄。**能通過 schema、編譯、基本模擬或 ZIP 往返，只證明相應階段通過，不能宣稱英雄原設計完成。**

## 1. 開工入口與真相來源

先讀本文件及 [AGENTS.md](AGENTS.md)。使用者本次明確授權與設計裁決優先；本文件不改寫專案協作契約、權限或執行中的 schema。不要把另一個 AI 的摘要當成原稿。

開始時記錄 Git 分支、HEAD、工作樹狀態、原稿 SHA-256、契約指紋及建包目標版本。工作放在 feature branch，保留其他人的變更；Main 負責審查與合併。不要自行把工作派給其他任務。

| 要確認的內容 | 必讀來源 |
| --- | --- |
| 原名、完整描述、每槽 requiredRefinement | 當次使用者原稿；37 名案例的 [原始配方目錄](materials/community-hero-forge/recipes/) |
| 作品、方案、來源、鎖定與修訂 | [schema.ts](packages/shared/src/content/heroForge/schema.ts)、[plan.ts](packages/shared/src/content/heroForge/plan.ts)、[sourceDesign.ts](packages/shared/src/content/heroForge/sourceDesign.ts)、[handoff.ts](packages/shared/src/content/heroForge/handoff.ts) |
| 可用效果、事件、條件、模板及欄位 | [能力清單](docs/editor-contract/ggd-runtime-capabilities.json)、[積木清單](docs/editor-contract/ggd-bricks.json)、[型別契約](docs/editor-contract/ggd-type-catalog.json) |
| 真正接受的技能／效果／事件結構 | [ability.ts](packages/shared/src/content/schema/ability.ts)、[effect.ts](packages/shared/src/content/schema/effect.ts)、[_hook.ts](packages/shared/src/content/schema/effects/_hook.ts)、[template.ts](packages/shared/src/content/schema/template.ts) |
| 展開與執行行為 | [generator.ts](packages/shared/src/content/heroForge/generator.ts)、[expand.ts](packages/shared/src/content/templates/expand.ts)、[SimWorld.ts](packages/shared/src/sim/SimWorld.ts) 及對應執行器 |
| 演出時間軸與動作詞彙 | [vfxScript.ts](packages/shared/src/content/schema/vfxScript.ts)、[animPulse.ts](packages/shared/src/content/animPulse.ts) |
| 模板及模型版本 | [templateVersions.ts](packages/shared/src/content/heroForge/templateVersions.ts)、[heroModelSchema.ts](packages/shared/src/content/modelUpload/heroModelSchema.ts) |
| 既有錯配與局部修正案例 | [修正說明](materials/community-hero-forge/refinements/README.md)、[222 槽原文對照](materials/community-hero-forge/refinements/design-audit.json)、[#1132](https://github.com/adms/GGD/issues/1132) |

清單可能過期。若清單、schema、生成器及執行器互相矛盾，先確認實際讀端並修正來源、用官方產生器重建；不能刪除必要機制來迎合過期清單。不要在本文件複製一份完整 effect/hook enum，也不要假設 schema 接受的欄位必然有執行效果。

沒有取得這些來源或不能執行驗證的 AI，只能交付「待驗證設計／草稿」與缺少的資料，不能偽造版本、編譯結果、畫面或發布收據。

## 2. 先拆原設計，再選模板

1. 完整保留角色名稱、來源作品、角色／形態識別、招式名稱、描述、台詞、換行及 requiredRefinement。改編說明另寫，不覆蓋原文；對白不自動視為技能效果。
2. 每名英雄覆蓋 `PASSIVE / Q / W / E / R / EX`。確認英雄出身、屬性、攻擊型態與六槽相依關係，而不是先把六個預設模板塞滿。
3. 將每條原設計拆成可觀察的要求，再對應既有積木。每項要求至少記錄：觸發、施法者、作用對象、條件、狀態／資源、消耗、效果、時序、結束／重置、演出及驗證方式。
4. 同一原句若包含多個要求，逐項驗證。例如「指定友軍護盾，消耗希望加強」包含友軍選取、護盾、資源資格／扣除、強化分支，不能只做其中一項便關閉整槽待補項。
5. 數值採現行 GGD 級距、規則與可調設定；可調整數值和演出尺度，但不能把機制種類、對象或事件條件換掉。

可以用下表作**設計／驗收文件**，這不是可直接塞入 HeroProject 的新 schema：

| 原文要求與位置 | 對應積木／實際讀端 | 正常路徑 | 不應發生的路徑 | 證據與版本 | 狀態／問題票 |
| --- | --- | --- | --- | --- | --- |
| 指定友軍獲得護盾 | 友方目標選取＋shield | 指定友軍盾量增加 | 敵方不可選；未指定的施法者不憑空獲盾 | 實際施法、盾量、畫面 | 分別記錄機制及視覺結果 |

原始 requiredRefinement 不因修正而刪除。以旁附對照記錄「哪項已完成、對應提交與證據、哪項仍待補」。文件中的「完成」必須能回到原要求及實際行為。

## 3. 不可接受的機制替代

| 原設計 | 不可當作完成的替代 | 必須落實的核心 |
| --- | --- | --- |
| 布局、電力、線索、希望、牌序 | 普攻追加傷害、一般魔力、文字計數 | 正確取得事件、歸屬、上限、去重、消耗、失敗與重置 |
| 指定友軍／附近友軍護盾 | 自身護盾 | 真正友方選取或範圍取樣，明確定義是否包含自身 |
| 有效治療／護盾吸收才集氣 | 施放治療或生成護盾即集氣 | 實際有效量；溢出、零吸收、無效目標不計 |
| 受傷會解除的睡眠 | 固定暈眩 | 睡眠狀態、傷害喚醒及解除時序 |
| 陷阱成功觸發並反擊 | 自身盾或固定傷害圈 | 可辨識陷阱、合法觸發事件、來源、一次性消耗與反擊 |
| 召喚物發射、協同或再次下令 | 英雄本體施法、固定召喚代理 | 存活及歸屬檢查、發射位置、指令／協同條件、數量限制 |
| 變身、換牌、替換普攻 | 單純 AD／攻速增益 | 真正替換對應技能／普攻，並處理共用冷卻、資源與還原 |
| 致死攔截、回溯、每回合一次 | 大護盾、持續回血或不死模板 | 原文指定時點、存活結果、次數與重置範圍 |
| 特定模型、投射物或場景演出 | 同色光球、預設圓圈、浮字說明 | 實際資產與正確事件、位置、方向及時間軸；替代需明示 |

`onShieldGained` 不等於「盾實際吸收傷害」。`onHeal` 的觀察者及事件資料必須檢查，不能憑事件名稱假定它通知施法者或代表有效治療量。`oncePerCast` 的可用事件受 schema 限制，不能複製到不支援的 hook；以目前實作而言，它只允許 `onDamageDealt`，不代表召喚命中、陷阱成功或護盾事件也已具有施法去重。

## 4. 資源、事件與技能連動的必要規格

每種資源／狀態先決定以下語意，再組裝技能：

- **持有者與來源**：自身、目標、召喚物或場地？不同施法者對同一目標是否隔離？狀態 ID 與 stack key 不得意外共用。
- **取得與去重**：實際有效事件才增加；每次施法、每個目標、每種事件類型是不同的去重範圍。多段、多目標、衍生傷害不能重複計數。
- **上限及生命週期**：初始值、最大值、刷新、到期、死亡、換形態及回合重置分開定義。
- **資格及扣除**：先檢查合法目標／資源／召喚物，再按原設計結算。資源不足、目標非法、被取消時，魔力、冷卻與資源是否扣除必須明確且一致。不能用一個無效果分支掩飾已支付的失敗施法。
- **分支與連動**：消耗一層、全部剩餘、持續扣除、共用冷卻、切換及關閉不得混用。計時器有次數上限、停止條件及清理方式。
- **循環防止**：反傷、反擊、被動及召喚衍生事件不應互相無限觸發。用實際來源／深度／次數限制，不靠描述保證。

**阿薩謝爾特例必須保留**：THE END OF SON 的重複詛咒反轉增益不是錯誤，不得自動「修正」成更強傷害。現有 GGD 改編需區分目標有／沒有**本施法者 R 詛咒**；同來源分支移除該詛咒並給目標短效增益，不再執行普通 EX 傷害。其他施法者詛咒不能被錯誤消耗。保留三層負面能量施放資格、扣除、詛咒到期與回合重置測試。具體數值與程式以 [實作](packages/shared/src/content/heroForge/communityRefinements/azazel.ts) 及 [行為測試](packages/shared/src/content/heroForge/communityRefinements/azazel.test.ts) 為準；其中仍標記待補的美術及其他機制不自動算完成。

## 5. 模板、生成器與成品一起維護

流程為：**原稿 → HeroPlan／模板產品 → 實體微調 → 生成器 → 可編譯作品 → Editor 驗收 → 當前服務 ZIP**。

- 優先使用既有通用模板、effect、hook 與條件；只改成品 JSON 而不修配方／生成來源，下一次生成會復發。
- 每個模板產品有獨立 `instanceId`、參數與版本。用既有 `pinHeroPlanTemplates` 等版本工具保存定義及雜湊，不能只引用會變動的模板 ID 或手造 SHA。
- 共用模板的新版本不應改掉既有英雄。每名英雄採用的模板、生成器、來源、模型與完整成品都有可追溯版本；修改建立新 revision，舊版保留。
- 套用新模板前處理衝突與舊 overrides，避免舊自身盾或舊 castType 偷偷疊回來。不能略過驗證器的衝突來讓編譯變綠。
- 修改後將受影響驗證及建包狀態設為過期，重新生成收據。不能搬用舊 revision 的成功收據。
- 既有 [微調套用器](packages/shared/src/content/heroForge/communityRefinements/apply.ts) 與逐英雄 JSON 是局部修正案例，不代表其他角色套用後自然具備完整原機制。
- 原設計確實缺通用能力時，查既有票、補最小可重現案例，再修正共用能力並送 Main 審查。不能在通用引擎依角色名寫特殊 if，也不要為每一英雄另造一套模板系統。

修改 `content/` 或 `docs/` 前先執行 `bash scripts/genguard.sh <path>`；有產生器就修改來源並走 `scripts/genrun.sh`，不手改生成產物。

## 6. 特效、音效與動作必須跟真實事件一致

技能行為住 ability/effect，VFX script 是演出。用演出畫三次命中，不會產生三次傷害；用浮字寫「反轉成功」，不會產生反轉機制。

逐槽核對：

1. **觸發時點**：施法開始、實際結算、逐段、彈體出生／命中等分開；只用當前 `VFX_SCRIPT_TRIGGERS` 支援且播放器能收到的事件。不要自行發明事件字串。
2. **位置與方向**：施法者、指定友軍、敵人、落點、彈體、召喚物的錨點不得混淆。友軍盾的結算演出要在實際受益者；骨點、朝向、高度和尺度須看模型實際結果。
3. **時序與提示**：預警、傷害區域、段數、間隔、投射物碰撞與狀態到期一致。詠唱被打斷或目標失效後，不能留下假命中、音效循環或殘留物件。
4. **通道接管**：使用既有演出通道規則，避免自訂特效和預設施法裝飾重複播放；不可遮掉遊戲必要的範圍／施法提示。
5. **音效**：確認實際素材、事件、位置、音量與停止方式。沒有原作音效就標示替代或待補，不宣稱由模型內自動取得。
6. **驗收**：實際執行技能並查看必要連續時間片段；靜態截圖只能證明那一幀。若缺 UI／錄影能力，明列未驗證，不用測試通過抵充畫面驗收。

## 7. 模型及素材查詢、替代與預算

先讀工作區最新 `ASSET_LIBRARIES.md`（本機位於 GGD repo 的父工作區），按入口指定的 `query.py` 與其 `--help` 查詢，不猜參數。依角色名、作品、角色 ID、素材種類與格式交叉確認。Git 的 [素材來源相依說明](materials/asset-library/DEPENDENCIES.md) 可供還原環境；[舊入口快照](materials/community-hero-forge/asset-library-sources/ASSET_LIBRARIES.md) 僅供追溯，不能代替最新入庫狀態。

- 先確認 `exists_local`、`readiness`、角色／作品／形態對應依據，再讀取查詢回傳的絕對路徑。跨庫同名只是候選；不得把同名或檔案存在當成完成匯入。
- 保留 300 英雄的動漫來源。OBJ 只用作靜態預覽，不能宣稱含骨架或可用動作。MBA 來源是已取得的 1.60，不能標成未取得的 1.70；缺件依清單保留。
- LoL 素材可用完整動作或六動作精簡版；目前來源未擷取原作獨立特效／音效，不能宣稱已具備。使用者指定的角色名保留。
- 使用者已接受相近風格模型：找不到精確角色時可採有依據的替代，記錄原角色、素材角色、作品、選用理由、資產雜湊及限制。例如已接受 Archer UBW 士郎對應衛宮，以及合適風格時使用不知火舞。**美術替代授權不涵蓋技能機制替代。**
- 使用實際匯入管線接受的格式。通用來源格式需先驗證／轉換，不能承諾任意 FBX、BVH、OBJ 等都能直接上傳。依 [GLB 驗證器](packages/shared/src/content/modelUpload/glb.ts) 及當前服務限制處理，原始位元組保留。
- 基本模型狀態為 `idle / run / attack / cast / hurt / death`，以 `ANIM_STATES` 為準；六槽技能不等於六條同名模型動作。額外閃避、格擋等脈衝要映射到實際剪輯或明示降級，不能杜撰不存在的 clip。
- 模型、骨架、動作重綁後確認比例、朝向、骨點、clipMap、變形、循環及死亡。共用一條剪輯或尚未完成重綁，須如實標記。
- 目前產品方向排除手機，以 iPad mini A17 Pro 約 30 fps 為效能參考；使用者接受相近效能估算，不要求該實機必須通過。仍應控制同場模型／材質／特效／聲音負載，遵守現行 GGD 限額，且不能把估算寫成實機測得。

後台選擇實際上線模型要保留舊版選項。新模型完成必要驗證後，可按使用者授權成為預設；回選某名英雄舊模型／舊英雄版本不能改到其他英雄或全域模板。

## 8. 最少必要驗收：集中執行，但逐項對應

先按共用機制分類集中測試，重用治具與既有工具，不為每一槽複製測試框架。每一原要求仍須對應到其實際配置／版本及證據；同一模板的測試不能證明所有角色參數、資產與連動都正確。

| 階段 | 驗什麼 | 能宣稱什麼 |
| --- | --- | --- |
| 來源與結構 | 原名原文、六槽、配方 SHA、欄位及相依資料 | 資料完整／結構有效 |
| 編譯與序列化 | 實際模板及微調展開、相依閉包、ZIP 往返 | 能產生及還原套件 |
| 機制 | 真正施法、事件、目標、數值／狀態變化及連動 | 被測原要求的行為通過 |
| 呈現 | 模型、動作、特效、音效及各分支時序 | 被查看版本的呈現通過 |
| 服務流程 | 當前服務建包、投稿、管理員核准、普通名單／對局與回復 | 被測環境的流程通過 |
| 正式交付 | 相容服務已部署，正式版本已發布及核對 | 正式上線；不能由隔離收據推論 |

機制驗收至少涵蓋受影響的正常與反例：

- 友方／敵方／自身、範圍內外、死亡或失效目標。
- 資源不足、剛好足夠、上限、消耗後狀態；持續扣除及耗盡停止。
- 同次多段、多目標、多位施法者、反擊／衍生事件去重；死亡、到期及回合重置。
- 失敗或取消施放不產生錯誤消耗與演出；變身／換牌的冷卻、資源與還原。
- 關鍵分支具有反向證據：例如把友軍改回自身，測試應失敗。不要只測 JSON 裡寫了某個字。
- 一名英雄回復舊版後，另一名英雄及共用定義不變。

數值級距／等級造成行為差異時，覆蓋端點及分支，不用機械重跑所有等級。修正後重跑失敗及受影響範圍；未變動、可追溯到相同來源的證據可以沿用，明列範圍。

新批次統一使用 [批次驗證腳本與用法](tools/community-hero-forge/BATCH_VERIFICATION.md)：指定 `--batch-dir`，自動核對來源、編譯並集中執行 `validation-plan.json` 登記的行為測試；`--release` 同批執行三個發布閘，`--resume-from` 僅重用來源與日誌 SHA 相符的成功結果。退出碼 `2` 表示自動檢查通過但仍有槽未配行為測試，不能当成原設計完成。第二批須按它自己的原稿建立測試對應，不能照抄第一批的通過清單。

現有局部回歸指令（在 repo 根目錄）：

```bash
pnpm --filter @ggd/shared exec vitest run src/content/heroForge/communityRefinements/friendlyProtection.test.ts src/content/heroForge/communityRefinements/azazel.test.ts src/content/heroForge/templateVersions.test.ts src/content/heroForge/productInstances.test.ts src/content/templates/expand.test.ts
pnpm --filter @ggd/shared typecheck
```

這組測試不代表其餘英雄已完成。推送前依 AGENTS **同批啟動** `pnpm skills:check`、`pnpm editor:accept:release`、`pnpm coord:check`；記錄各自退出碼、版本與失敗原因。檢查失敗不改寫成通過，也不靠刪測試、降低需求或假填訊息／發布帳本解決。

具名資源的持續技能可用 `toggle.upkeepResource="status"`＋`upkeepStatus.statusId`；費用為正整數層數，沿用 `whileOn` 的真實生命週期。`statusCost.count="all"` 在合法施法開始時一次扣清，零層拒絕，不可用效果結尾的扣款假裝前置成本。測試須包含週期間被其他技能耗盡、最後一次扣款、手動關閉、歸屬及不足不部分扣款。

`onEvade` 的既有提示事件也包含攻擊者失手。需要「有效迴避」時指定 `evadeSource="defender"`；只獎勵本技能造成的迴避則用 `thisSource`，按實際抽中的來源判定，不猜最高迴避來源。`evadeChannel="basic"`／`"ability"` 可限定通道。零上下文、失手、其他來源與無敵免傷需有負例；限次反擊還須驗證共用額度、間隔及雙方反擊不循環。參考 [奇犽配方](materials/community-hero-forge/refinements/24.json) 與 [行為測試](packages/shared/src/content/heroForge/communityRefinements/kirua.test.ts)，模型及原作特效未因此取得視覺通過。

## 9. 投稿、版本、存放與協作

1. 先在 Editor 完成作品，再讀取**當下目標服務**的 profile，透過既有流程建立 ZIP。不能靠修改舊 ZIP 內版本欄位偽裝新服務相容。
2. 原稿、模板、生成器、技能、模型及成品版本可追溯，投稿引用不可變快照。管理員核准後就是一般正式英雄，沒有另一套永久「社群版」身分。
3. 上架與未上架英雄都需要版本管理。保留原模型／英雄選項及獨立 rollback；發布前確認分支與環境授權。隔離平台通過不代表正式平台已部署或已發布。
4. 原始模型、動畫、大型原生解析 JSON 放 S3；程式、英雄／技能設定、模板、版本清單、SHA-256、文件放 Git。不要把大型 runtime dump 當作可維護設定塞回 PR。每份素材要有可還原的清單與雜湊；「上傳完成」與「還原比對通過」分開記錄。
5. AWS 固定使用已配置的 `vibe-coding` profile、`ap-east-2` 及授權 bucket `ggd-390630837668-ap-east-2-an`。不得讀取／輸出 `~/.aws/credentials`、索取或建立憑證、換 profile、改 IAM、刪除 S3 或繞過 AccessDenied。需要 AWS 時按既有工具與入口操作；身份 ARN 必須包含 `assumed-role/vibe-coding-s3-role/`，不符就停止；AccessDenied 記錄 action／resource 並向使用者回報。`legacy/` 是否可取用依最新入口及明確授權，不猜拼字、不把備份路徑改成正式發布路徑。
6. 問題先查重；缺票再依 [CLAUDE.md](CLAUDE.md) 開票守則建立。標題與內文帶優先級／類型，六節為 Objective、Scope、Files / modules likely affected、Implementation constraints、Acceptance criteria、Test / verification criteria，另含 [思考策略]、[解決模板]。用 `bash scripts/ticket-lint.sh --body-file <草稿>` 檢查。
7. 完成後在原票備註實際提交、測試、環境與未完成事項。只有票內驗收條件全數完成才關票；部分修正不能用 `Fixes #…` 提前自動結案。#1132 的局部護盾修正不代表全部原設計缺口完成。
8. 程式、文件、設定及素材索引一併 commit；push 並按 AGENTS 以 coordination packet 建立／更新草稿 PR，讓 Main 審查。沒有使用者授權不要另派任務或傳訊給別的工作線。

## 10. 交付清單與可複製的 AI 指令

每批交付至少包含：原文與版本、六槽需求對照、可被既有 schema 接受的作品／模板微調、機制連動、演出與模型綁定、資產來源／替代說明、檢查與畫面證據、未完成要求／問題票、ZIP 與目標服務版本（若已建包）、提交／PR 及每名英雄的回復方式。不能用一個總體 `passed` 蓋過未完成項。

可貼給其他生成 AI：

> 請先讀取 repo 的 AGENTS.md、AI參考全自動鑄造守則.md、我提供的完整原稿及當前 schema／能力清單。保留原名、完整原文和全部 requiredRefinement。先把 PASSIVE/Q/W/E/R/EX 逐項拆成觸發、對象、資源、時序、分支、演出及驗收，再以既有模板實體化並微調；同步維護生成來源和不可變版本。不得把布局／電力／線索等資源變成普攻加傷，不得把友軍效果變成自身，不得以代理美術或能編譯宣稱完成。素材先查最新入口、角色來源、exists_local/readiness 及實際檔案；允許的風格替代須保留來源與限制。逐項落實機制並執行正反例、連動及必要畫面驗收，保留阿薩謝爾同來源重複詛咒反轉增益。缺能力先查票再開票修正，完成後附證據才關票。不能完成的部分明列，不能虛構收據。完成作品後依當前服務重建 ZIP、按授權走投稿審查，保留所有英雄／模型／模板／生成器版本及獨立 rollback。請交付實際檔案、提交與逐項狀態，不只提供計畫。

本守則是生成與驗收約束，不是引擎能力清單，也不是「所有英雄均已完成」的證書。

## 召喚物、陷阱與攻擊嘗試的實作規則

- `onSummonHit` 來自真正召喚物的有效普攻傷害（含護盾吸收），事件回報給主人。`oncePerCast` 使用建立身體時的施法身分，一次召喚多具身體、命中多個目標或多次攻擊仍只有一份額度。`summon.onCap=retarget` 只改指令，不刷新生命、期限或施法額度；Q/W 等不同槽須各自獨立。
- 兩個召喚物協同必須驗證雙方實際命中同一敵人、時間窗口及共用冷卻；暫存命中狀態使用 `sourceScope=caster` 搭配 `appliedBy=self`，防止兩位玩家借用彼此的命中。英雄自身的具名 mark 沒有施加者身分，消耗這種資源時不要套用詛咒專用的 `appliedBy` 條件。
- 一次性反射陷阱用定點 `trap`，在普攻傷害點攔截，先移除再執行反擊；遠程被抵消時不可仍生成彈體。明訂啟動時間、半徑、期限、上限、主人死亡與多陷阱順序；不能用自身護盾或跟隨英雄的光圈抵充。畫面範圍須從實際陷阱狀態取得，重連與回放也要驗證。
- 由召喚物發射的技能用 `requiredSummonSlot` 檢查使用條件，`damageLine.fromSummonSlot` 決定實際出發位置。施法中身體死亡／消失時不得退回英雄位置，是否退款須明訂。缺少召喚物要顯示理由；Editor 補足資源不會偷偷造出召喚物。
- 「停止攻擊後回復」使用 `onAttackAttempt` 的攻擊提交時刻。有效命中、失手、被閃避及前搖後取消要走真實攻擊系統測試，不能只手動呼叫命中 hook。新增巢狀效果或拒絕理由後，必須跑型別檢查，涵蓋子效果鏈與所有回饋對照表。

可重用的實作與負例見 [武藤遊戲配方](materials/community-hero-forge/refinements/01.json)、[武藤遊戲行為測試](packages/shared/src/content/heroForge/communityRefinements/yugi.test.ts) 與 [集中證據](materials/community-hero-forge/refinements/yugi-verification.json)。專屬召喚物及天空龍仍為素材缺口，這些機制範例不表示原作演出已完成。

## 觀察事件、目標資源與睡眠

- `onObservedCombat` 觀察同一有效對決內當前可見的敵方英雄；`observedEvent` 分普攻命中、技能命中、實際治療與成功控制。目標是作出事件的敵人，不能換成受害者。免疫、零傷與過量治療不計；有效護盾吸收可算命中。需要逐種類去重時，使用依施法者分開的回合來源，並驗證多敵人、多觀察者與真正回合清除。
- `statusCost.subject=target` 只用於指定目標技能。配合 `appliedBy=self` 只消耗該目標身上自己的資源；合法目標與足額檢查後才一併支付。消耗資源和清除已見種類是兩件事，原稿未要求重置時不可偷偷重置。Editor 單槽預覽不會偽造目標線索。
- `applyBuff.vision.revealed=true` 揭示承受者，不重啟隱形時鐘；來源到期或驅散後回到原隱形規則。檢查施法中離區、死亡與對決結束；施加後移往另一對決也不能持續洩漏位置。
- 睡眠用 `breakOnDamage`，正值實際 HP 傷害才提前喚醒；零傷或完全由護盾吸收的命中不喚醒。用真實投射物碰撞與傷害系統驗證，不以直接塞狀態或呼叫解除函式冒充完整行為。

範例：[柯南配方](materials/community-hero-forge/refinements/26.json)、[行為測試](packages/shared/src/content/heroForge/communityRefinements/conan.test.ts)、[證據與缺口](materials/community-hero-forge/refinements/conan-verification.json)。該 v1 證據是四槽歷史收據；E／EX 移動見下節，專用演出仍待完成。

## 加減速移動與有限牽引

- `applyBuff.drive` 由來源壽命控制加速、煞車、急轉減速與停止／碰撞狀態。移速沿用角色屬性及減速效果，不寫死一份移速；瞄準與施法面向優先於移動面向。到期／死亡移除移動狀態，不能刪除其他来源增益。
- `pull.grapple` 是沿施法方向連接首個合法敵人或實體障礙物：敵人被拉向施法者，地形則拉施法者。空白落點不是錨點，不自行增加摔投、傷害或擊飛。它只支援 `shape=single`，不可混用 legacy 的 destination／side／uncontrollable 模式。
- `maxTravel` 限制整次總行程，移動錨點不能補充行程。超距／離區／死亡／碰撞須中止；測試必須斷言中止當下的位置，不能只等自然行程跑完再聲稱「超距會停」。
- 位移、导航與最後碰撞整理須使用同一份當前障礙物（包括玩家撐開的閘門）。畫面從真實快照或事件的階段與端點繪製，不能用假軌跡動畫冒充移動效果；回放重置與單位消失均須清除圖形。
- 試玩移動路線／實體牆面是單次情境輸入，不寫入英雄配方。程序滑板、輪子與白線是可驗收的狀態標記，不能據此宣稱角色原稿美術或完整畫面已驗收。

範例：[柯南 v2 配方](materials/community-hero-forge/refinements/26.json)、[移動行為案例](packages/shared/src/content/heroForge/communityRefinements/conanMobility.test.ts)、[跨端回放案例](apps/editor/src/vfx-forge/AbilityMotionReplay.test.ts)、[證據及剩餘缺口](materials/community-hero-forge/refinements/conan-mobility-verification.json)。

位移畫面可依 [批次驗證的瀏覽器設定](tools/community-hero-forge/BATCH_VERIFICATION.md) 收集。先核對技能槽、時間、實際網格狀態與座標，再判斷畫面物件；不能把固定施法標記誤認為移動模型。單英雄畫面或 NullEngine 通過不代表整批畫面通過。預設情境資源不足的拒絕必須保留，另建立有真實前置事件的可施放情境，不能移除成本或偽造線索來取得全綠。

### 前置條件也要走實際行為

需要敵方事件才能取得的目標資源，驗收場景必須啟動實際戰鬥系統。共用情境現在依 `statusCost.subject=target`，先讓敵方以真正普攻指令嘗試攻擊三秒，再停止指令；用練習場既有的受控席位阻止空白幀自行索敵。傷害、位置、狀態及取得的資源全部保留，沒有直接加線索。若原機制不能從這個行為取得資源，就應繼續拒絕，另設適當案例。

Editor 的「敵方前置行動」可切換自動、靜止或普攻，並显示資源在施放前及情境結束的數量。正例必須同時通過 Editor 與投稿端的同一情境；負例至少含靜止敵人、移除取得資源的被動，以及成本高於真實所得。柯南 R 的 `all` 成本只需至少一條自己的線索，不應誤寫成三條。前置事件也必須計入回放長度。

參考 [前置行為測試](packages/shared/src/content/heroForge/communityRefinements/conanAcceptance.test.ts) 及 [Editor／投稿一致性測試](apps/editor/src/hero/validationBaseline.test.ts)。這些是測試場景的可施放證據，不能取代逐項原設計、實際模型畫面或正式發布驗收。

## 補給、招架與可中斷施法的實作規則

- 脫戰補給必須使用真正的接受施法／攻擊嘗試和交戰資料。`onAbilityCast` 是完成施法的事件，不能單靠它阻止「開始休息、移動取消、立刻補回」；以 `recentCast` 的接受紀錄補足。mark 到期後讀有效層數，不讀殘留物件的原 count。
- `onBlock` 只由正值的實際格擋觸發；`blockSource="thisSource"` 只接受該技能增益的來源。普通盾吸收、別件裝備格擋、真實傷害、過期招架及空事件資料都不能獎勵同一反擊。反擊另需一次性資源、有效期限及真正普攻消耗。
- `interruptOn="damageOrMove"` 比對實際移動與連接成功的正值傷害封包，盾／格擋吸收仍算受擊；零值或免疫不算。舊 `damage` 仍以 HP 下降判定。`interruptible=false` 保護前搖，死亡仍取消。消耗於接受時支付，中斷不自行退款。
- `interruptCast` 只終止合法敵方尚在執行的可打斷前搖，沿用免控及區域邊界；不等於暈眩、不能倒轉已結算效果。前方弧形使用 `damageArea.fromCaster` 與 `arcHalfAngleCos`，須驗證後方、友軍、距離及實際輸入方向。
- 新增效果必須同步接上 Editor 的預覽與 schema 表單，保留完整種類的窮盡檢查。參考 [銀時微調](materials/community-hero-forge/refinements/23.json)、[實際行為案例](packages/shared/src/content/heroForge/communityRefinements/gintoki.test.ts) 與 [驗證收據](materials/community-hero-forge/refinements/gintoki-verification.json)。六槽機制通過不代表木刀、牛奶或專用動作演出通過。

## 位移閃避與目標交鋒資格

- 位移成功、閃避成功與資源獲得是三件事。`onEvade` 搭配 `evadeSource="thisSource"`、`evadeDuring="dash"`，以實際閃避事件當下的衝刺和位移快照判斷；空按、撞停、失手、別來源與事件後才移動都不能加讀招。`applyBuff.evasionScope.abilities` 可開啟既有技能迴避通道，仍受 GGD 上限約束，不是必中閃避。
- `requiredTargetStatus` 是施放資格，與 `statusCost` 消耗分開。可要求目標上自己的標記及最低層數；先判斷合法對象、有效來源／期限，再接近或扣費，抵達後重查。其他玩家標記、已過期／非法目標不可借用，也不能不小心消耗資格標記。
- 招架接續使用短效、自己來源的目標標記；一次追加以實際消耗觸發。驗證第一次有追加、第二次沒有、他人及過期標記無效。
- 單槽試玩準備具名資源必須明列，不能聲稱它證明實際取得資源。整套煙霧情境沒有完成成功閃避時應保留 EX 拒絕；另用真實 W／E／Q／R／EX 行動驗證同一世界連段，不得灌層數掩蓋缺口。
- 參考 [SUN樂微調](materials/community-hero-forge/refinements/31.json)、[共用戰鬥治具](packages/shared/testkit/communityActionFixture.ts)、[行為測試](packages/shared/src/content/heroForge/communityRefinements/sunraku.test.ts)、[试玩反例](packages/shared/src/content/heroForge/communityRefinements/sunrakuAcceptance.test.ts) 及 [收據](materials/community-hero-forge/refinements/sunraku-verification.json)。哈桑風格代理未證明鳥頭、短劍或原角色演出。

## 接觸停止、短期交鋒與禁止自動接近

- 「命中後停下」使用實際位移接觸，不可以起點範圍傷害冒充。`dash.stopOnHit` 選敵人或敵方英雄，`onHit` 僅對第一次合法接觸結算；地形先限制路徑，保留 GGD 位移速度上限、友軍身體擠壓及既有控制規則。空放、只撞牆、背後身體、死亡、跨區、替換或零方向不得附加錯誤命中。
- 「剛進入交鋒的首次近戰命中」需逐目標及施法者保留有限窗口、同目標冷卻與脫戰条件，不能直接配置每次普攻追加。`damageConnected: true` 只接受實際扣血或消耗護盾的事件；零值或完全免疫不能製造交鋒資源，也不能搭配扣血前的免傷反彈判斷。
- 「超距不能使用」配置 `allowApproach: false`；驗證超距直接拒絕、沒有自動移動及扣費，近期自己的目標標記仍保留。他人、過期與非法目標須分別拒絕。
- 前置技能驗收以實際 Q／R 命中取得標記，再執行 EX；空放及無傷害的接近步不得補標記。短效防禦需驗證有效期、刷新不疊加及到期還原。
- 參考 [艾莉絲微調](materials/community-hero-forge/refinements/28.json)、[行為測試](packages/shared/src/content/heroForge/communityRefinements/eris.test.ts)、[前置命中试玩](packages/shared/src/content/heroForge/communityRefinements/erisAcceptance.test.ts) 與 [收據](materials/community-hero-forge/refinements/eris-verification.json)。本尊模型綁定仍不代表專用劍擊、光線、高攻速動作或音效已验收。

## 停留資源、移動取消護盾與逐波落點

- 「停止移動後逐步累積」用 `onInterval.stationaryForSec` 觀察實際位置並搭配 `internalCooldown`，不用普攻事件代替。冷卻中也要取樣；空走撞牆、轉向不算位移，垂直移動／換區、死亡、中場及新回合需重新等待。資源要有上限、清層事件、合法消耗和逐英雄隔離。
- 「受擊清空」若採實際命中語意，使用 `damageConnected: true`，納入護盾吸收而排除零傷及完全免疫。具名 mark 的 delta 節點仍需 schema 要求的 `duration`；具名 mark 自己的生命週期由 mark spec 決定。
- 「原地護盾，移動後提前結束」使用 `shield.breakOnMove`；每片盾保存自己的位置，移動只到期該片盾，不清除其他技能或友軍的護盾，也不偽造敵方破盾事件。重新施加需明確 `replace`，禁止與不同位置的盾量模糊混合。
- 投擲落地與分波落點需延遲後重新取得當時範圍目標，分別測移出、後進、友軍、死亡及回合結束。煙霧命中干擾要明寫失手機率、有效範圍、進出與免控規則，不能用減速或隱形冒充。
- 測試走路需送出真正指令並確認位移；不可只改導航意圖後宣稱驗到移动。EX 以空資源起跑，等待真實蓄層再施放；消耗時點與後續自然蓄層分開斷言。
- 參考 [尼古貓貓微調](materials/community-hero-forge/refinements/30.json)、[行為測試](packages/shared/src/content/heroForge/communityRefinements/yanineko.test.ts)、[實際等待試玩](packages/shared/src/content/heroForge/communityRefinements/yaninekoAcceptance.test.ts) 與 [收據](materials/community-hero-forge/refinements/yanineko-verification.json)。既有煙霧、脈衝或玉藻前模型是待驗收替代，不能當作原設計的菸灰缸／雜物／角色／動作／音效已完成。
