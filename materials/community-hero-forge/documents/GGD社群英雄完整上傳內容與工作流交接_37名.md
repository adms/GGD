# GGD 社群英雄完整上傳內容與工作流交接：37 名

日期：2026-09-07。

本文件整合 **37 名英雄、222 槽技能、出身與屬性微調、模板產品、機制規格、特效腳本、模型／動作綁定、原作來源及審查條件**。主工作流讀本檔即可掌握全部內容；正式可機讀資料在旁邊的「GGD社群英雄上傳內容_37名」目錄。

## 目前完成與使用方式

- 37 份正式 `ggd-hero-project@2` 草稿，方案採當前 `ggd-hero-plan@2`；222 槽逐一套用真實 enabled 模板與參數。
- 每名英雄有完整 upload-recipe.json 與獨立投稿文字，保留原設計全文和模板替代差異。出身決定三圍／成長，11 項屬性採級距微調。
- 185 支主動技能有具體 VFX 腳本；被動未掛無法歸屬的假施法事件。模型、六種基本動作及圖示用已出貨 GGD 代理資產，專屬角色造型與動作仍待製。
- 本地驗證：37/37 schema、37/37 compiler、37/37 基本 SimWorld kit、37/37 原始資產 ZIP 往返通過。正式原設計機制和畫面未因此通過；共有 220 槽明列具體差異。
- ZIP 在 `packages-local-preview/`，可供離線內容／編輯格式查驗；`gameRevision=offline-community-handoff-20260907` 是明示離線標記。本次未取得活動服務 target，工作流須對當下 target **重建**後投稿，不能只替換 manifest 的版本字串。
- 本次完成交接檔案；沒有修改 GGD 程式、git 分支、提交、推送、合併 PR 或投稿審查。

## 檔案入口

| 檔案 | 用途 |
| --- | --- |
| `GGD社群英雄上傳內容_37名/index.json` | 37 名角色與正式英雄檔／配方／預覽包索引 |
| `projects/01.hero-project.json`～`37.hero-project.json` | 正式 HeroProject，sourceLock 先為 null，不捏造既有作品 ID |
| `recipes/*.upload-recipe.json` | 原文、映射、微調、有效屬性、實際效果及資產 manifest |
| `upload-text/*.md` | 個別英雄可讀投稿內容與逐槽審查 |
| `機制補強與驗收.md` | 共用機制的具體參數、適用者與失敗條件 |
| `review-matrix.csv` | 222 槽的原設計／目前行為／補強／驗收狀態 |
| `runtime/*.compiled.json` | 由當前 GGD 規則產生的英雄與技能結果 |
| `evidence/report.json` | 各英雄編譯、模擬、ZIP 摘要與雜湊 |
| `evidence/*.simulation.json` | 真實基本場景紀錄，不代表所有目標機制通過 |
| `evidence/template-catalog.json` | 所用模板、參數契約及來源 digest |
| `來源查證補充.md` | 官方／二手／未逐頁確認的來源界線 |

以上相對路徑以 `/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD社群英雄上傳內容_37名` 為資料包根目錄。

## 主工作流執行要求

先以 HeroProject 重用既有英雄鑄造流程，核對每槽 currentBehavior 與 ownerDescription。必須處理 requiredRefinement，或由正式審查明示接受替代方案；不能將護盾當成吸收、暈眩當成時停、固定招當成複製、回血當成死亡回歸。

以正式 schema/compiler/SimWorld/capability 為準；通用機制可用現行 effects 組合時先重用。完成機制後再對模型、技能事件與 VFX 同步驗收，最後重建當下目標 ZIP 並走社群審核。不要依角色名稱新增引擎特判，也不要覆蓋已存在的安茲／飛鼠等正式內容。

## 37 名索引與本地驗證

| # | 英雄 | 出身 | 模板編譯 | 基本模擬 | ZIP 往返 |
| --- | --- | --- | --- | --- | --- |
| 01 | 武藤遊戲 | 法師 | 通過 | 通過 | 通過 |
| 02 | 八神庵 | 鬥士 | 通過 | 通過 | 通過 |
| 03 | 不知火舞 | 鬥士 | 通過 | 通過 | 通過 |
| 04 | 空條承太郎 | 鬥士 | 通過 | 通過 | 通過 |
| 05 | 洛克人 | 射手 | 通過 | 通過 | 通過 |
| 06 | 卡比 | 坦克 | 通過 | 通過 | 通過 |
| 07 | 西索 | 法刺 | 通過 | 通過 | 通過 |
| 08 | 米卡莎 | 鬥士 | 通過 | 通過 | 通過 |
| 09 | 赫蘿 | 軟輔 | 通過 | 通過 | 通過 |
| 10 | 魯路修 | 軟輔 | 通過 | 通過 | 通過 |
| 11 | 利姆路 | 法鬥 | 通過 | 通過 | 通過 |
| 12 | 衛宮士郎 | 法鬥 | 通過 | 通過 | 通過 |
| 13 | 朝田詩乃 | 射手 | 通過 | 通過 | 通過 |
| 14 | 殺老師 | 法刺 | 通過 | 通過 | 通過 |
| 15 | 比利海靈頓 | 硬輔 | 通過 | 通過 | 通過 |
| 16 | 魔法少女☆伊莉雅 | 法師 | 通過 | 通過 | 通過 |
| 17 | 安茲·烏爾·恭 | 法師 | 通過 | 通過 | 通過 |
| 18 | 吉爾伽美什 | 砲手 | 通過 | 通過 | 通過 |
| 19 | 桐谷和人 | 鬥士 | 通過 | 通過 | 通過 |
| 20 | 御坂美琴 | 法師 | 通過 | 通過 | 通過 |
| 21 | 鹿目圓 | 軟輔 | 通過 | 通過 | 通過 |
| 22 | 菜月昴 | 硬輔 | 通過 | 通過 | 通過 |
| 23 | 坂田銀時 | 鬥士 | 通過 | 通過 | 通過 |
| 24 | 奇犽 | 法刺 | 通過 | 通過 | 通過 |
| 25 | 一拳超人 | 狂戰 | 通過 | 通過 | 通過 |
| 26 | 名偵探柯南 | 射手 | 通過 | 通過 | 通過 |
| 27 | 庫洛魔法使 | 軟輔 | 通過 | 通過 | 通過 |
| 28 | 艾莉絲·伯雷亞斯·格雷拉特 | 鬥士 | 通過 | 通過 | 通過 |
| 29 | 芙莉蓮 | 法師 | 通過 | 通過 | 通過 |
| 30 | 尼古貓貓 | 法師 | 通過 | 通過 | 通過 |
| 31 | SUN樂 | 鬥士 | 通過 | 通過 | 通過 |
| 32 | 阿薩謝爾 | 法鬥 | 通過 | 通過 | 通過 |
| 33 | 近衛刀太 | 狂戰 | 通過 | 通過 | 通過 |
| 34 | 高速婆婆 | 狂戰 | 通過 | 通過 | 通過 |
| 35 | 炭治郎 | 鬥士 | 通過 | 通過 | 通過 |
| 36 | 鬼畜王蘭斯 | 狂戰 | 通過 | 通過 | 通過 |
| 37 | 吉伊卡哇 | 硬輔 | 通過 | 通過 | 通過 |

## 共用微調設定与審查契約

## 社群自動對應：機制補強、微調設定與驗收

日期：2026-09-07。這份文件與各英雄的 `upload-recipe.json` 合用。下列 `proposal.*` 是工作流需求識別碼，**不是目前已註冊的 template ID**，不得直接塞入 HeroProject 的 `template.ref`。正式英雄檔只引用此次實際讀到、狀態為 enabled 的 GGD 模板。

### 交付的意義

本包提供完整六槽模板草稿與可追蹤的目標規格。每槽都保留「目標上傳描述」「目前模板行為」「微調／補強要求」。審查者要能看見差異；不能因 schema、SimWorld 基礎場景或 ZIP 通過，就把時停、技能複製、死亡回歸等原設計標成完成。

`recipes/*.upload-recipe.json` 的 `sourceOwnerText` 保存先前設計全文；`projects/*.hero-project.json` 的 `purpose` 同時保存目前可执行行為與目標。前者為工作流旁檔，後者才是正式 GGD 編輯格式。各角色模板是可編譯的起點，不自動獲准以替代效果發佈。

### 自動對應與模板套用順序

1. 先按角色實體、作品、版本識別。保留指定顯示名；一拳超人＝埼玉、名偵探柯南＝江戶川柯南、庫洛魔法使＝木之本櫻、SUN樂＝サンラク。尼古貓貓採《ヤニねこ》的佐藤ヤニ子；阿薩謝爾採《召喚惡魔》的アザゼル篤史。
2. 讀出身與攻擊型態，讓既有 `attributesForOrigin`／`forgeChampion`／stat normalization 生成三圍與成長。11 項屬性使用極小／小／中／大／極大級距；不另算一套屬性規則。
3. 按 `PASSIVE/Q/W/E/R/EX` 逐槽套用本包指定 `template.ref`、`params` 與 `abilityOverrides`。保留技能名稱及原文，衝突策略為 `reject`。
4. 驗證每個 template 仍 enabled、參數契約仍相容，再處理 `requiredRefinement`。如現行 effect 可以組合出目標，就使用原系統組合；只有缺通用能力時才補通用模板。不要寫角色名稱分支。
5. 不同形態／技能副本都使用有版本的白名單。只將真正存在的能力 ID 放入 `capabilityIds`，不能以本文件的提案 ID 宣稱引擎支援。
6. 綁定 `presentation`、資產及事件。模型和圖示目前是 GGD 已出貨代理，特效是既有 VFX 加顏色／時間微調；專屬角色造型不在本包內。
7. 讀取當下服務的 target profile，重建作品 ZIP；先跑檢查，再走既有投稿與審查流程。`sourceLock` 只填服務實際回傳的 canonicalId/versionId，初稿保留 null。

### 建議補強參數與機制契約

這些是 GGD 改編的**初始調整值**，不是原作數值，也不是對目前遊戲規則的覆寫。冷卻、射程、魔力、傷害仍以當下正式級距解析；以下只規定額外機制的有界行為。工作流須確認與現有能力重用或補足後才啟用。

#### M01｜proposal.cast-resource-ledger@1：有限資源與事件去重

適用：遊戲布局、八神紫炎、承太郎精密、西索節奏、赫蘿籌碼、魯路修指揮、士郎解析、吉爾財庫、美琴電荷、小圓希望、柯南線索、小櫻牌序、SUN樂讀招、阿薩謝爾負面能量、蘭斯戰意、吉伊卡哇勇氣等。

- 預設 cap=3；蘭斯 cap=5。初始 0、回合清除；有其他原文時以角色規格為準。
- 每次有效施法最多 +1；去重鍵至少包含 caster、round、castId、resourceKind。多段、持續每跳、自傷、反傷與衍生伤害不重複入帳。
- 不同技能序列需相鄰 abilityId 不同；一次增益消耗後不可由同次命中再補回。
- 支援明確觸發來源：有效助攻、實際吸收傷害、有效閃避、靜止時間、附近友軍交鋒；禁止統一改成普攻命中。
- 資源扣除與施法資格原子化；不足時不進入 castEffect、不播完整招式。中斷退還依 GGD 共通規則，不能每英雄各自決定。
- 赫蘿：同一擊殺助攻只給一次籌碼；每回合最多三次交易，金額用戰鬥經濟配置，禁止帳號資產。吉伊卡哇：有效附近交鋒每秒最多 +1。尼古貓貓：靜止每秒 +1，移動停止累積、受擊歸零。
- 驗收：同幀兩次事件、重送 castId、獨立敵人、多段同招、回合切換、消耗／增益競爭。

#### M02｜proposal.recast-charge-window@1：蓄力與接續輸入

適用：八神葵花／豺華、洛克砲、詩乃狙擊、吉爾 Ea 等。

- 葵花三段，各段接續輸入窗口起始建議 0.8 秒；受控、逾時或第三段完成即結束。一次按鍵不自動走完三段。
- 豺華在八稚女正常完成後開啟 0.8 秒接續資格；不重置 EX 冷卻，獨立使用仍走自身規則。
- 洛克砲蓄力階段建議 0／0.4／0.9 秒，上限 1.2 秒。按住進入蓄力、放開使用一次；中斷與無資源不得補發。
- 詩乃瞄準層建議三層，每 0.5 秒穩定姿勢 +1；移動歸零、受傷至少減一層。射線需受掩體與視線約束，不能替換成必中指定技。
- 驗收：晚按、連按、輸入重送、按住後死亡、移動取消、起手最後一幀中斷。

#### M03｜proposal.bound-summon-trap@1：召喚、陷阱、來源實體

適用：武藤遊戲、安茲。

- 每類召喚物 maxAlive=1，Q/W 分開命名空間；持續初始 6 秒、生命與傷害倍率見原模板參數。主人死亡清除。
- 黑魔導與女孩必須是可受擊、有主人、有仇恨與死亡事件的代理；協同追加建議 1 秒內置冷卻，按兩個不同召喚来源判斷。
- 遊戲 E：存續上限建議 4 秒，第一次合法敵方普攻觸發後立即消耗；抵消與反擊不能各成功兩次。
- 遊戲 EX 必須從存活黑魔導位置起射；召喚物失效按共通施法規則中止，不能默默改由主人射出。
- 天空龍是一次性演出投影，不帶一份完整英雄 AI。
- 驗收：Q/W 上限互不誤傷、主人死亡、召喚途中换目標、同幀雙觸發、EX 途中召喚物死亡。

#### M04｜proposal.local-time-stop@1：局部時停

適用：空條承太郎。

- 初始建議範圍半徑 4 GGD 單位、持續 1.0 秒。受影響敵方單位、施法進度、指定 buff 計時器及敵彈運動使用明確分類表。
- 回合倒數與時停自己的到期時間繼續；不得凍結全世界時計。
- 命中佇列建議上限 16，依 simulation tick＋事件序號固定順序結算；超限必須有明確拒絕／合併規則，不能無限長。
- 重疊時停使用每來源的擁有權／參考計數，單一來源結束不可提前解除另一來源。施法者死亡要清理自身時停並按固定規則結算待處理命中。
- 時停視覺可用灰階環界、低亮度時間裂紋；暈眩加灰屏不算通過。
- 驗收：飛行中投射物、引導、持續傷害、兩時停重疊、結束同幀致死、佇列上限。

#### M05｜proposal.copy-form-weapon@1：技能副本與形態替換

適用：卡比、利姆路、洛克人、伊莉雅、小櫻、赫蘿、刀太、炭治郎。

- 卡比 Q 副本白名單：八神闇拂、不知火舞花蝶扇、美琴電擊之槍。保存技能版本、來源、剩餘次數與到期時間；初始 6 秒／最多三次，先到為準。不可複製卡比 EX 或再複製。
- 利姆路只吸收白名單投射物，一次保存一個樣本；EX 一次使用後清空。取消的原投射物不能繼續命中。傷害以利姆路自身屬性解析，不能夾帶來源腳本。
- 洛克人特殊能源先採標準魔力對應；若新增獨立能源，必須成為同一個有上限資源容器，切武器不補滿。
- 形態持續初始 4 秒；永久切換姿態則直到再切換／死亡／回合結束。生命採相同比例或保留絕對值需由共通形態政策決定，不准利用切換回血。
- 普攻、技能定義、圖示、模型武器及可用槽位一次切換；技能冷卻按 slot 統一保存，正在施放的技能固定使用起手版本。
- 驗收：切換途中受控、死亡還原、同幀切換與施法、來源版本缺失、連續切換保留冷卻、禁用槽位。

#### M06｜proposal.anchor-tether-carry@1：錨點、牽引與抓取

適用：西索、米卡莎、比利、柯南、卡比、菜月昴鞭繩。

- 錨點必須來自允許類型，最大連線距離建議 6 GGD 單位，存續建議 3 秒；目標死亡、錨點消失、超距、碰撞不合法時斷開。
- 拉自己與拉敵人是兩種明確模式，不能以傳送假裝鉤索。米卡莎弧線要有實際路徑與途中碰撞。
- 抓取最多一個目標，擁有權不可重入；抓取期間不能再被另一抓取無限遞迴。投擲終點須合法，死亡／中斷時安全放置。
- 比利雙人動作使用同一抓取事件／開始 tick 對齊；渲染落後不能改變模擬位置。
- 原文只要求牽引的技能，不能照底稿模板自動附帶摔投傷害。
- 驗收：牆角、跨邊界、錨點消失、多人爭搶同一目標、抓住時死亡、短距離超大速度。

#### M07｜proposal.defense-window@1：格擋、反擊、閃避、睡眠

適用：SUN樂、奇犽、銀時、士郎、桐人、阿薩謝爾 E、柯南 W 等。

- 精準窗口初始 0.25 秒，反擊窗口初始 0.5 秒。成功需有正確攻擊來源、方向、距離与實際防禦事件；空按、自然落空、無敵免傷不可混成同一成功。
- 一次窗口最多一個成功反擊，反擊來源不得再觸發自身反擊；建議同來源內置冷卻 1 秒。
- 「下一次近戰強化」初始資格 2 秒，消耗一次後清除。
- 柯南麻醉初始 0.7 秒，後續有效傷害提前喚醒；命中本身不立即把自己剛上的睡眠打掉。
- 主動护盾与被動受傷反擊都不能替代上述事件語意。專屬成功演出需綁正確防守者與技能 ID。
- 驗收：同幀多段、遠近交界、側背攻擊、免控、睡眠後 DOT、反擊打到另一反擊者。

#### M08｜proposal.command-once-per-target@1：有限命令

適用：魯路修 Geass。

- 有效命令持續建議 1 秒，只能沿合法路徑移動到本次指定位置。
- 記錄鍵 caster＋target＋round；只在命令成功生效時消耗每目標每回合一次資格。
- 視線失败、免控、非法終點不記成功；淨化後恢復原輸入權。不能命令購物、交出資源、使用任意 API 或操作玩家帳號。
- 驗收：死亡重生後同回合、回合重置、兩魯路修來源隔離、控制結束恢復、路徑突然堵住。

#### M09｜proposal.personal-checkpoint@1：死亡回歸與共享存檔

適用：菜月昴 R／EX。

- R 保存自身位置與生命，存檔有效 5 秒，最多一份。回復生命上限起始建議為最大生命的 40%，仍不高於存檔生命。
- R 致死攔截與 EX 主動回復競爭同一個原子消耗狀態；同幀只有一方成功。每回合最多成功一次。
- 舊位置非法時找限定距離內最近合法點；找不到則按共通安全失敗政策處理，不能傳送到界外。
- 不回溯世界時間、其他角色、金幣、經驗、冷卻、掉落、傷害帳本。保命與死亡獎勵只能經一次標準流程。
- 驗收：同幀連續致死、處決、R→EX、EX 與致死競爭、存檔到期、回合切換與復活。

#### M10｜proposal.curse-reversal@1：THE END OF SON 惡搞核心

適用：阿薩謝爾。

- P：有效技能命中每施法一次 +1 負面能量，最多三層；排除自傷、反伤、派生與每跳。
- Q：短起手普通拳，位移量建議 0.4 GGD 單位。重點是誇張起手和普通一拳的反差。
- W：三波白色魔力雨，間隔 0.45 秒；每波每敵人最多一次。不用身體部位作命中判定。
- E：闇人格影子只承接一次合法近身受擊反擊；闇人格是來源註記，反擊用法是 GGD 改編。
- R：蓄力 0.8 秒起始提案；命中「萎靡」4 秒，AD/AP 各 -15%。放出成功反噬自身最大生命 3%，最低留下 1 HP；這次反噬禁止入 P、吸血、反擊資源。
- EX：先消耗三層。未萎靡者：傷害＋2 秒 AD/AP -20%；已受**同一來源 R 萎靡**者：移除該詛咒，改成 2 秒 AD/AP +10%，不再施加通常分支傷害。不得把所有同名 debuff 不分來源清光。
- 判斷、移除／增益與扣資源在同一結算序列完成；不同分支有不同事件與文字。敵人反轉增益用金光及上揚輸出圖示，阿薩謝爾驚愕。
- 必測：R→EX 變強、EX→乾淨目標變弱、R 淨化後 EX、R 到期後 EX、兩個阿薩謝爾交錯、控制免疫、同幀命中、自傷 1 HP 邊界、反擊循環。
- 正式招名採 **THE END OF SON**。辭典終章拼字 `FAINAL` 未核對漫畫原頁，顯示名用 `THE END OF SON〔終章〕`，不得宣稱已獲漫畫原頁證實。`ファイナルビッグベン` 是貝西卜招式，不能混進本人六槽。

#### M11｜proposal.ordered-multihit@1：多段、波次與總傷害

適用：桐人、承太郎、吉爾伽美什、不知火舞、殺老師、埼玉、遊戲 R 等。

- 桐人 R=16 段、EX=27 段，段序從 1 開始。現行 `tpl-lock-combo.hitCount` 上限是 20；EX 的 20 段底稿不能當 27 段完成，兩個平行產品也不構成有序 27 段。
- 每段重新確認存活、距離、控制及目標資格；第 n 段中斷後不得繼續第 n+1 段。
- 整招總傷害按 GGD 級距分配，而非每一段都給完整終結技傷害；是否重複觸發吸血、被動、命中特效須各自設次數上限。
- 初始演出只在首段、末段產生較大效果；中間斬線使用物件池與限量短生命特效。不能假設動畫 27 揮就等於模擬 27 次。
- 隨機彈幕使用模擬種子，重播落點一致；逐波提前顯示對應預警，不能只在第一次施法畫一個圈冒充全部落點。
- 驗收：段序、總傷害、敵人走出範圍、中途死亡、同幀擊殺、反傷与吸血最大觸發數。

#### M12｜proposal.directional-support-field@1：方向防禦、友軍場與情報

適用：芙莉蓮、伊莉雅、小圓、小櫻、赫蘿、殺老師、尼古貓貓等。

- 方向防壁：起始建議正面 120°，有限耐久、到期 3 秒；後方傷害不吸收。摧毀時要有真實事件，粉碎特效不增加傷害。
- 友軍支援：自己／友軍／區域篩選必須由 gameplay 定義，不能只有友軍特效。初始區域半徑 3 GGD 單位、持續 3 秒、每目標首次進入一次。
- 花田解除恐懼與護盾、小圓淨化、吉伊卡哇抗恐懼均列 GGD 改編，遵循可淨化狀態與免疫種類。
- 芙莉蓮魔力抑制僅作用於魔力感知資訊，不是隱形；柯南／詩乃揭示只讀目前合法世界資訊。
- 煙霧干擾需明示規則；建議命中率／鎖定干擾由既有受支持效果挑選後定值，不直接刪除敵方 UI 或永久隱身。
- 驗收：友軍／敵軍篩選、重入、護盾更新策略、方向邊界、淨化免疫、視線遮擋、退出與回合清理。

### 模型、動作與特效的完成條件

- 本體至少能對應 idle/run/attack/cast/hurt/death；保留出貨模型的碰撞與遊戲讀值。角色體型不能自行縮小命中區。
- 每個主動槽本包已具體填入 castStart 的動畫／小光、castEffect 的主效果，顏色為整數 RGB 0–255；連擊末段另掛 strikeIndex。這些是可解析的演出草稿。
- 自動選到的 VFX `requestedShape` 與 `resolvedVfxId` 都保存。找不到形狀時只能使用明示的同色 pulse 預覽；角色特有造型仍待製，不能稱為對應完成。
- PASSIVE 不掛沒有實際被動事件可觸發的假 cast-only 特效；需要觸發歸屬的項目保留待補，不可用每秒閃光裝成被動成功。
- 蓄力、格擋成功、時停凍結、吸入／釋放、雙人抓投、切換形態、狙擊、死亡回歸、反轉詛咒都需要對應實際事件。畫面位置、方向、半徑、到期和中斷須與模擬一致。
- 音效目前採既有 generic-cast；本包未含原作語音、角色模型或動畫素材。圖示是現有 GGD 代理，換成專屬圖示時用既有資產包管線攜帶 bytes。
- 效能按主工作流既定平板約 30fps 方向評估，以實際機器及場景做近似對照即可，不新增 A17 Pro 實機硬門檻。粒子與模型預算讀取正式配置；不得從這份內容檔改寫全局預算。

### 工作流收尾清單

1. 逐英雄核對 `sourceOwnerText`、六槽名稱、實體版本與來源層級；阿薩謝爾優先驗证角色歸屬與反效果。
2. 自動套用 37 份 HeroProject；原文字不可被模型摘要取代。完成全部 requiredRefinement 或明確记录經審查接受的改編。
3. 通過真實 schema/compiler、逐槽及連招 SimWorld，另加本文件的條件／邊界場景。
4. 預覽完整英雄、特效、動作、武器、形態與 UI；逐槽標記畫面驗收。
5. 以當下 target 重建 ZIP、檢查資產雜湊與依賴，走社群投稿→審查→核准／退回→版本實際載入。
6. 結果分開填：內容資料、模板編譯、目標機制、畫面動作、投稿審查、多人遊戲。此包不預填審查核准 receipt。


# 逐名英雄完整上傳內容

## 01｜武藤遊戲：社群上傳內容與套用設定

英雄檔：`projects/01.hero-project.json`  
工作流資料：`recipes/01.upload-recipe.json`

作品：《遊戲王》  
採用：武藤遊戲／闇遊戲的黑魔導牌組意象。  
定位：召喚、陷阱、協同施法。

出身：法師；定位：mage；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":13,"agi":18,"int":29,"strGrowth":1.25,"agiGrowth":1.67,"intGrowth":2.78}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"小","maxHealth":"小","maxMana":"大","ad":"小","ap":"大","as":"小","healthRegen":"小","manaRegen":"大","range":"大"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：卡片框光、紫色法陣；R 使用金色雷電，召喚代理保持可受擊輪廓。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔決鬥者的布局〕

**目標上傳描述**：召喚物命中與陷阱成功觸發，各累積布局；每次施法最多增加一層，上限三層，供 EX 消耗。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需補召喚／陷阱成功事件去重、三層布局及 EX 扣除。

**特效**：`fx.prim.arcane.pulse-sm`，tint [163,56,242]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜黑魔導

**目標上傳描述**：召喚一名可受擊的黑魔導；再次下令可更換攻擊目標，同種召喚物最多一名。

**套用模板**：`tpl-summon-agent`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-summon-agent",
    "inheritDefaults": true,
    "params": {
      "count": 1,
      "body": "champion",
      "championId": "sela",
      "durationSec": 6,
      "damageMult": 0.25,
      "hpMult": 0.3,
      "formation": "ring",
      "spread": 1.5,
      "maxAlive": 1,
      "onOwnerDeath": "despawn",
      "cleanse": "none",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：召喚 1 名 sela 樣板代理，6 秒、25% 傷害、30% 生命，同類上限 1、主人死亡清除。

**微調／補強要求**：黑魔導專屬造型與再次下令換目標未提供；代理採 sela。

**特效**：`fx.prim.arcane.summon`，tint [163,56,242]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜黑魔導女孩

**目標上傳描述**：召喚一名可受擊的黑魔導女孩；與黑魔導共同攻擊同一目標時，觸發有內置冷卻的協同追加傷害。

**套用模板**：`tpl-summon-agent`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-summon-agent",
    "inheritDefaults": true,
    "params": {
      "count": 1,
      "body": "champion",
      "championId": "sela",
      "durationSec": 6,
      "damageMult": 0.25,
      "hpMult": 0.3,
      "formation": "ring",
      "spread": 1.5,
      "maxAlive": 1,
      "onOwnerDeath": "despawn",
      "cleanse": "none",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：召喚 1 名 sela 樣板代理，6 秒、25% 傷害、30% 生命，同類上限 1、主人死亡清除。

**微調／補強要求**：黑魔導女孩造型、與黑魔導協同事件未提供；目前同模板上限須驗證跨槽隔離。

**特效**：`fx.prim.arcane.summon`，tint [163,56,242]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜神聖彗星・反射力量

**目標上傳描述**：設置一個可辨識的陷阱；範圍內首次敵方普攻觸發時，抵消該次攻擊並反擊來源，隨後消失。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-01-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-01-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目標設計是一次觸發陷阱與反射；目前只有自身護盾，不能驗收陷阱。

**特效**：`fx.prim.arcane.pulse`，tint [163,56,242]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜歐西里斯的天空龍

**目標上傳描述**：以天空龍投影演出有預警的區域雷擊；此招是一次性施法投影，不增加常駐召喚物。

**套用模板**：`tpl-ground-nova`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-ground-nova",
    "inheritDefaults": true,
    "params": {
      "radius": 300,
      "damage": {
        "damageTier": "大",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：指定落點半徑 300 wc3u 的一次大級範圍傷害。

**微調／補強要求**：天空龍投影是待製資產；預覽以雷電區域脈衝表達。

**特效**：`fx.prim.lightning.nova`，tint [163,56,242]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜黑・魔・導

**目標上傳描述**：消耗布局，由存活的黑魔導射出強化直線魔法；缺少黑魔導時顯示使用條件。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需由存活黑魔導發射並消耗布局；目前是英雄本體施法。

**特效**：`fx.prim.arcane.beam`，tint [163,56,242]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

Q/W 必須具有生命、仇恨、主人與死亡事件；驗證召喚者死亡、陷阱重複觸發、協同傷害去重，以及 EX 施法途中召喚物被擊殺。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | skillshot | 1 | [90] | [576] | 6 | 0.1 |

機制補強條目：M01、M03，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 02｜八神庵：社群上傳內容與套用設定

英雄檔：`projects/02.hero-project.json`  
工作流資料：`recipes/02.upload-recipe.json`

作品：《THE KING OF FIGHTERS》  
採用：具有紫炎的八神庵。  
定位：接續輸入、近身連段、爆發。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：紫炎低飽和外圈、白色拳爪切線；末段亮度提高但不延長實際判定。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔八神之炎〕

**目標上傳描述**：不同主動技能連續命中同一敵人，累積最多三層紫炎；下一次終結技消耗層數增傷。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需技能命中三層紫炎與終結技消耗。

**特效**：`fx.prim.fire.pulse-sm`，tint [143,38,240]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜百八式・闇拂

**目標上傳描述**：沿地面前進的紫炎投射物，遇到有效碰撞結算。

**套用模板**：`tpl-traveling-wave`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-traveling-wave",
    "inheritDefaults": true,
    "params": {
      "stepSize": 100,
      "stepCount": 4,
      "stepIntervalSec": 0.12,
      "aoePerStep": 100,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。

**微調／補強要求**：推進波並非遇第一個單位即停的投射物。

**特效**：`fx.prim.fire.bolt`，tint [143,38,240]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜百式・鬼燒

**目標上傳描述**：原地上升火焰打擊，提供短暫迎擊窗口與有限擊退。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 180,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：固定落點跳擊；需原地迎擊與受擊窗口。

**特效**：`fx.prim.fire.arc`，tint [143,38,240]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜百二十七式・葵花

**目標上傳描述**：三段接續技；每段須在指定窗口再次輸入，逾時、受控或第三段完成後結束。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 3,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：3 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：目前一次施法完成三段；需三次輸入窗口及中斷狀態機。

**特效**：`fx.prim.fire.slash`，tint [143,38,240]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜禁千二百十一式・八稚女

**目標上傳描述**：突進命中後進入有限連擊，最後一擊引爆紫炎層數。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 8,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：8 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：缺命中突進接續與紫炎引爆。

**特效**：`fx.prim.fire.slash`，tint [143,38,240]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜裏三百十六式・豺華

**目標上傳描述**：可獨立使用；在八稚女完成後的短窗口內使用，改為接續追擊並消耗自己的冷卻。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 3,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：3 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：獨立三段追擊；需接八稚女成功事件的使用窗口。

**特效**：`fx.prim.fire.slash`，tint [143,38,240]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

接續輸入是真正的技能狀態；測試晚按、連按、斷線重送、控制中斷，以及 R→EX 的消耗與傷害只結算一次。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | targeted | 4 | [45,45,45,45] | [144,144,144,144] | 3 | 0.1 |
| R | targeted | 3 | [90,90,90] | [576,576,576] | 3 | 0.5 |
| EX | targeted | 1 | [90] | [576] | 3 | 0.1 |

機制補強條目：M01、M02、M11，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 03｜不知火舞：社群上傳內容與套用設定

英雄檔：`projects/03.hero-project.json`  
工作流資料：`recipes/03.upload-recipe.json`

作品：《THE KING OF FIGHTERS》  
定位：飛行道具、近身範圍、突進。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：紅扇軌跡、橘焰弧、落點火星；殘像只作演出，不增加完整英雄。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔不知火流身法〕

**目標上傳描述**：完成位移後獲得一次短效普攻強化；刷新不疊加。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需位移完成後一次普攻增益，刷新不疊加。

**特效**：`fx.prim.fire.pulse-sm`，tint [255,71,41]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜花蝶扇

**目標上傳描述**：投出扇子，對沿途合法目標造成傷害。

**套用模板**：`tpl-traveling-wave`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-traveling-wave",
    "inheritDefaults": true,
    "params": {
      "stepSize": 100,
      "stepCount": 4,
      "stepIntervalSec": 0.12,
      "aoePerStep": 100,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。

**微調／補強要求**：扇子模型及逐彈碰撞需補，模板是分段傷害波。

**特效**：`fx.prim.fire.bolt`，tint [255,71,41]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜龍炎舞

**目標上傳描述**：向前揮出近身火焰弧，適合迎擊貼身敵人。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：目前為窄直線，需前方近身弧形判定。

**特效**：`fx.prim.fire.beam`，tint [255,71,41]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜必殺忍蜂

**目標上傳描述**：直線突進撞擊；遇牆或到達最大距離停止。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 300,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 300 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：核對 Owner 原文與模擬／畫面後才可驗收。

**特效**：`fx.prim.fire.slash`，tint [255,71,41]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜超必殺忍蜂

**目標上傳描述**：有明顯起手的強化突進連擊，末段小範圍爆發。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 4,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：4 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：缺突進命中後才接連擊條件。

**特效**：`fx.prim.fire.slash`，tint [255,71,41]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜陽炎之舞

**目標上傳描述**：短時間產生跟隨施法的火焰殘像；追加傷害有次數上限，殘像不獨立尋敵。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：ad +15%。

**微調／補強要求**：目前為自身 3 秒 +15% AD；需限次跟隨施法殘像及去重。

**特效**：`fx.prim.fire.pulse`，tint [255,71,41]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

扇子、身體與火焰弧各自有正確判定；驗證穿牆、同目標重複碰撞，以及殘像再觸發殘像的循環。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| R | targeted | 3 | [90,90,90] | [576,576,576] | 3 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M01、M11，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 04｜空條承太郎：社群上傳內容與套用設定

英雄檔：`projects/04.hero-project.json`  
工作流資料：`recipes/04.upload-recipe.json`

作品：《JoJo 的奇妙冒險》  
採用：第三部後期、已能停止時間。  
定位：替身近戰、局部時停。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：白金之星為待製副模型；拳線紫白、時停要求灰階環界與恢復裂紋，視覺不能代替模擬。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔白金之星・精密動作〕

**目標上傳描述**：近距離命中累積精密層數；滿層後強化下一次 Q 的末擊。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需精密層數與 Q 末擊消耗。

**特效**：`fx.prim.physical.pulse-sm`，tint [161,94,235]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜歐拉連打

**目標上傳描述**：白金之星在前方進行多段拳擊，每段重新確認距離與目標。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 6,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：6 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：需逐段距離重新檢查、替身掛點及雙模型動作。

**特效**：`fx.prim.physical.slash`，tint [161,94,235]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜流星指刺

**目標上傳描述**：中短距離直線刺擊，用於追擊離開普攻範圍的敵人。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需單條流星指刺與單目標去重。

**特效**：`fx.prim.physical.beam`，tint [161,94,235]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔替身護衛〕

**目標上傳描述**：白金之星進入短暫防禦姿態，減免一次正面攻擊並推開近身敵人。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-04-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-04-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需正面一次格擋與推開近敵，不能以一般護盾驗收。

**特效**：`fx.prim.physical.pulse`，tint [161,94,235]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜白金之星・世界

**目標上傳描述**：建立短暫局部時停區域。暫停範圍內敵方單位的動作與指定計時器，以及敵方投射物運動。對決倒數及時停自身的結束計時繼續。承太郎在期間造成的命中記入有限佇列，時停結束後依序結算。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "stun",
        "duration": 0.8,
        "applyTo": "target",
        "stun": true
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"stun","duration":0.8,"applyTo":"target","stun":true}]。

**微調／補強要求**：此槽僅單體 0.8 秒暈眩作模板預覽；局部時停、投射物暫停、計時器分類及命中佇列尚未提供。

**特效**：`fx.prim.physical.slash`，tint [161,94,235]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔歐拉終結拳〕

**目標上傳描述**：有起手動作的重拳；時停期間使用時，加入同一套待結算命中佇列。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：目前立即结算；需與時停共用待結算佇列。

**特效**：`fx.prim.physical.slash`，tint [161,94,235]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

驗證投射物、施法進度、持續效果與解除時序；時停須具有模擬行為，並測試承太郎死亡、兩個時停重疊及結束瞬間的致死傷害。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [45,45,45,45] | [144,144,144,144] | 3 | 0.1 |
| W | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | targeted | 3 | [45,45,45] | [576,576,576] | 4.5 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M04、M07、M11，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 05｜洛克人：社群上傳內容與套用設定

英雄檔：`projects/05.hero-project.json`  
工作流資料：`recipes/05.upload-recipe.json`

作品：《Mega Man》  
採用：初代洛克人，不混入 X 或 EXE。  
定位：蓄力、武器能源、技能切換。

出身：射手；定位：marksman；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":13,"agi":29,"int":18,"strGrowth":1.25,"agiGrowth":2.78,"intGrowth":1.67}`

屬性覆寫：`{"ms":"中","mr":"小","armor":"小","maxHealth":"小","maxMana":"中","ad":"大","ap":"小","as":"大","healthRegen":"小","manaRegen":"中","range":"大"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：青藍砲口、白心彈體；刀刃用金屬灰、Leaf Shield 用綠色。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔武器能源管理〕

**目標上傳描述**：特殊武器共用有限能源；能源隨時間恢復，切換武器不補滿。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需共用武器能源、恢復與切換保留；預覽沿用 GGD 魔力。

**特效**：`fx.prim.lightning.pulse-sm`，tint [36,145,255]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜洛克砲

**目標上傳描述**：按住蓄力、放開射擊；依蓄力階段決定彈體與傷害。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：目前固定起手；需按住／放開與分段蓄力。

**特效**：`fx.prim.lightning.beam`，tint [36,145,255]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜Metal Blade

**目標上傳描述**：投出金屬刀刃，可選擇射擊方向，消耗武器能源。

**套用模板**：`tpl-traveling-wave`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-traveling-wave",
    "inheritDefaults": true,
    "params": {
      "stepSize": 100,
      "stepCount": 4,
      "stepIntervalSec": 0.12,
      "aoePerStep": 100,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。

**微調／補強要求**：Metal Blade 的方向與刀刃模型待補。

**特效**：`fx.prim.lightning.bolt`，tint [36,145,255]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜Leaf Shield

**目標上傳描述**：形成有限耐久的葉片護盾；再次使用可將剩餘葉片射出。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-05-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-05-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：缺再次輸入射出剩餘葉片及護盾剩餘量換算。

**特效**：`fx.prim.lightning.pulse`，tint [36,145,255]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔全武裝齊射〕

**目標上傳描述**：按固定次序發射砲彈、刀刃與葉片，整套共享總傷害預算。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 6,
      "intervalSec": 0.35,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：在指定區域依序落下 6 發；每發間隔 0.35 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：彈種固定時序及整套共享總預算需補。

**特效**：`fx.prim.lightning.nova`，tint [36,145,255]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔特殊武器切換〕

**目標上傳描述**：讓 Q 在洛克砲與已核准的特殊武器版本間切換；保留各自冷卻與共用能源。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：as +20%。

**微調／補強要求**：僅自身攻速增益；需 Q 技能版本切換、圖示與共用冷卻。

**特效**：`fx.prim.lightning.pulse`，tint [36,145,255]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

蓄力中斷、護盾剩餘耐久轉換、切換後圖示與實際技能一致；反覆切換不能重置冷卻或複製能源。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 8 | 0.1 |
| W | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 8 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 8 | 0.5 |
| EX | self | 1 | [45] | [576] | 8 | 0.1 |

機制補強條目：M02、M05，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 06｜卡比：社群上傳內容與套用設定

英雄檔：`projects/06.hero-project.json`  
工作流資料：`recipes/06.upload-recipe.json`

作品：《星之卡比》  
定位：吸入、吐出、受控技能複製。

出身：坦克；定位：tank；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":29,"agi":18,"int":13,"strGrowth":2.78,"agiGrowth":1.67,"intGrowth":1.25}`

屬性覆寫：`{"ms":"小","mr":"大","armor":"大","maxHealth":"大","maxMana":"中","ad":"中","ap":"小","as":"小","healthRegen":"大","manaRegen":"小","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：粉紅輪廓、黃色星星、石頭灰面、巨劍金白；保留公平碰撞尺寸。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔圓滾滾的韌性〕

**目標上傳描述**：脫離戰鬥後逐步恢復少量生命；受擊即中斷。

**套用模板**：`tpl-mark-stacks`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-mark-stacks",
    "inheritDefaults": true,
    "params": {
      "markId": "community-review-06-20260907.last-chance",
      "initial": 1,
      "max": 1,
      "durationSec": -1,
      "resetOn": "match",
      "perStackLost": [],
      "lethalMode": "save",
      "lethalConsume": 1,
      "surviveHpPct": 0.01,
      "internalCooldown": 1,
      "invulnerableSec": 0.5,
      "restoreHealthPct": 0.15,
      "aoeRadius": 0,
      "knockbackDistance": 0,
      "stunSec": 0
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：本場一層免死標記，首次致死消耗並回復 15% 生命，保護 0.5 秒。

**微調／補強要求**：免死只是驗收底稿；需脫戰漸進回血且受擊中斷。

**特效**：`fx.prim.holy.pulse-sm`，tint [255,122,179]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜吸入

**目標上傳描述**：錐形牽引；短暫含住一個合法目標或可吸收物件，期間移動受限。

**套用模板**：`tpl-pull-throw`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-pull-throw",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "grabMode": "dragToCaster",
      "throwMode": "distance",
      "apexHeight": 1.2,
      "durationSec": 0.45,
      "throwDistance": 120,
      "landRadius": 2,
      "landDamageTier": "小",
      "landApRatio": 0,
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：拖拉指定目標後向前投擲 120 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。

**微調／補強要求**：不是錐形吸入與含住；需吞入持有狀態、單目標釋放。

**特效**：`fx.prim.holy.arc`，tint [255,122,179]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜吐出

**目標上傳描述**：含住目標時將其安全釋放並射出星彈；空腹時只能使用較弱的普通星彈。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：目前固定星光線；需持有物判斷與安全吐出。

**特效**：`fx.prim.holy.beam`，tint [255,122,179]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜石頭

**目標上傳描述**：變為石頭，短暫大幅減傷且無法移動；結束後恢復原狀。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 160,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-06-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":160,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-06-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需石頭形態、禁移動與禁施法，護盾不足以代表變石。

**特效**：`fx.prim.holy.pulse`，tint [255,122,179]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜超級巨劍

**目標上傳描述**：有預警的大範圍揮砍，提供卡比本體的固定終結能力。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：巨劍造型待補；目前四段直線物理波。

**特效**：`fx.prim.holy.beam`，tint [255,122,179]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜複製能力

**目標上傳描述**：從最近成功吸入的英雄取得一個核准的 Q 技能版本，替換自己的 Q，限時或用盡次數後還原。首批白名單：八神庵闇拂、不知火舞花蝶扇、御坂美琴電擊之槍。其他目標明確顯示不可複製。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。

**微調／補強要求**：固定魔法攻擊供預覽；需三技能白名單、暫存副本、死亡還原。

**特效**：`fx.prim.holy.slash`，tint [255,122,179]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

複製後要改變技能定義、圖示、消耗及施法行為；驗證複製另一隻卡比、死亡還原、含住者死亡與技能版本相容性。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | ground | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | skillshot | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M05、M06，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 07｜西索：社群上傳內容與套用設定

英雄檔：`projects/07.hero-project.json`  
工作流資料：`recipes/07.upload-recipe.json`

作品：《HUNTER×HUNTER》  
定位：連線、牽引、表面偽裝。

出身：法刺；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":12,"agi":25,"int":23,"strGrowth":1.18,"agiGrowth":2.36,"intGrowth":2.17}`

屬性覆寫：`{"ms":"大","mr":"小","armor":"小","maxHealth":"小","maxMana":"中","ad":"中","ap":"大","as":"中","healthRegen":"小","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：粉色彈性念線、撲克牌尖角、收線回彈；偽裝不能改變陣營。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔魔術師的節奏〕

**目標上傳描述**：以不同技能命中同一目標，強化下一次撲克牌攻擊；最多保存一次。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需不同技能序列及下一次牌擊消耗。

**特效**：`fx.prim.arcane.pulse-sm`，tint [245,61,161]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔撲克牌連射〕

**目標上傳描述**：扇形投出三張牌，同一目標的額外命中採遞減傷害。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 3,
      "intervalSec": 0.12,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：在指定區域依序落下 3 發；每發間隔 0.12 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：三發為落點散射；需扇形牌彈與同目標遞減。

**特效**：`fx.prim.arcane.nova`，tint [245,61,161]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜伸縮自在的愛

**目標上傳描述**：將念線附著於一個敵人或合法場景錨點；超距、死亡或期限到達時斷線。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "root",
        "duration": 0.7,
        "applyTo": "target",
        "root": true
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"root","duration":0.7,"applyTo":"target","root":true}]。

**微調／補強要求**：只有短暫鎖足；需有端點的彈性連線及斷線規則。

**特效**：`fx.prim.arcane.slash`，tint [245,61,161]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔收線〕

**目標上傳描述**：附著敵人時牽引敵人；附著錨點時拉動自己。兩種行為都受碰撞與最大位移限制。

**套用模板**：`tpl-pull-throw`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-pull-throw",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "grabMode": "dragToCaster",
      "throwMode": "distance",
      "apexHeight": 1.2,
      "durationSec": 0.45,
      "throwDistance": 120,
      "landRadius": 2,
      "landDamageTier": "小",
      "landApRatio": 0,
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：拖拉指定目標後向前投擲 120 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。

**微調／補強要求**：僅敵人抓投；需錨點拉動自己與敵人牽引的分支。

**特效**：`fx.prim.arcane.arc`，tint [245,61,161]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔彈性殺陣〕

**目標上傳描述**：短暫建立最多兩條額外念線，結束時向中心牽引一次。

**套用模板**：`tpl-ground-nova`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-ground-nova",
    "inheritDefaults": true,
    "params": {
      "radius": 300,
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：指定落點半徑 300 wc3u 的一次小級範圍傷害。

**微調／補強要求**：目前單次區域傷害；需最多兩條额外念線及一次中心牽引。

**特效**：`fx.prim.arcane.nova`，tint [245,61,161]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜輕薄的假象

**目標上傳描述**：在地面製作一個假的陷阱外觀，或改變自身表面外觀。偽裝不改變真實陣營、碰撞與伺服器身分。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速。

**微調／補強要求**：僅短效移速；需假陷阱／表面偽裝及敵我顯示隔離。

**特效**：`fx.prim.arcane.pulse`，tint [245,61,161]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

連線的來源、端點及斷線條件可追蹤；驗證雙向牽引、牆角、錨點消失，以及偽裝對敵我資訊的顯示範圍。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| E | ground | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M01、M06，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 08｜米卡莎：社群上傳內容與套用設定

英雄檔：`projects/08.hero-project.json`  
工作流資料：`recipes/08.upload-recipe.json`

作品：《進擊的巨人》  
採用：配備立體機動裝置與雷槍的版本。  
定位：錨點移動、氣體與刀刃雙資源。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"大","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：雙刃白線、鋼索細線、瓦斯短尾跡、雷槍橘色延遲警示圈。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔阿卡曼戰鬥直覺〕

**目標上傳描述**：成功避開攻擊後，下一次刀刃命中獲得有限增傷；有觸發間隔。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需有效閃避事件、內置冷卻與下一刀增傷。

**特效**：`fx.prim.physical.pulse-sm`，tint [158,196,209]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔雙刃斬擊〕

**目標上傳描述**：近身雙段斬擊，消耗刀刃耐久。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 2,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：2 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：缺刀刃耐久。

**特效**：`fx.prim.physical.slash`，tint [158,196,209]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜立體機動裝置

**目標上傳描述**：射出鉤索連接合法錨點，消耗氣體沿路徑移動。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 250,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：需合法場景錨點、鉤索路径、氣體消耗；不是自由跳躍。

**特效**：`fx.prim.physical.arc`，tint [158,196,209]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔補給與換刃〕

**目標上傳描述**：短暫停留更換刀刃並補充部分氣體；受到控制會中斷。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "restore",
        "manaPct": 0.15,
        "applyTo": "self"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"restore","manaPct":0.15,"applyTo":"self"}]。

**微調／補強要求**：需換刃及氣體資源／控制中斷。

**特效**：`fx.prim.physical.pulse`，tint [158,196,209]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜雷槍

**目標上傳描述**：發射兩支可辨識的雷槍，命中或落地後延遲爆炸。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 2,
      "intervalSec": 0.4,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：在指定區域依序落下 2 發；每發間隔 0.4 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：兩發落點爆炸；需雷槍投射物、黏附與延遲引爆。

**特效**：`fx.prim.physical.nova`，tint [158,196,209]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔立體機動・迴旋斬〕

**目標上傳描述**：選定錨點與敵人後，沿限定弧線移動斬擊；路線失效時安全停止。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 400,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 400 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：目前直線；需錨點弧線與路徑失效停止。

**特效**：`fx.prim.physical.slash`，tint [158,196,209]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

驗證找不到錨點、氣體不足、換刃中斷、鉤索目標消失與高速碰撞；禁止僅播放飛行動作而直接傳送。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [45,45,45,45] | [144,144,144,144] | 3 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | ground | 1 | [90] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M06、M07，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 09｜赫蘿：社群上傳內容與套用設定

英雄檔：`projects/09.hero-project.json`  
工作流資料：`recipes/09.upload-recipe.json`

作品：《狼與辛香料》  
定位：資源支援、判斷、狼形態。  
註：戰鬥招式及交易效果為依角色特徵創編。

出身：軟輔；定位：fighter；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":21,"agi":20,"int":19,"strGrowth":1.99,"agiGrowth":1.89,"intGrowth":1.83}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"大","ad":"小","ap":"中","as":"小","healthRegen":"中","manaRegen":"大","range":"中"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：麥金色護盾、麥穗環、赤褐狼影；交易用小型籌碼提示，狼本體待製。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔賢狼的眼光〕

**目標上傳描述**：參與有效助攻獲得交易籌碼，上限三枚；同一擊殺事件只結算一次。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需助攻一次性籌碼，上限三枚。

**特效**：`fx.prim.nature.pulse-sm`，tint [235,166,56]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔狼牙警告〕

**目標上傳描述**：短距離狼影撲咬，造成傷害與短暫緩速。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "slow30",
        "duration": 1,
        "applyTo": "target",
        "moveSpeedMult": 0.7
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1,"applyTo":"target","moveSpeedMult":0.7}]。

**微調／補強要求**：狼影造型待補。

**特效**：`fx.prim.nature.slash`，tint [235,166,56]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔行商議價〕

**目標上傳描述**：消耗一枚籌碼，取得少量當局戰鬥金幣；每回合最多三次。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "restore",
        "manaPct": 0.1,
        "applyTo": "self"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"restore","manaPct":0.1,"applyTo":"self"}]。

**微調／補強要求**：預覽只回復 10% 魔力；需籌碼消耗與每回合三次戰鬥金幣交易。

**特效**：`fx.prim.nature.pulse`，tint [235,166,56]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔麥穗庇護〕

**目標上傳描述**：為指定友軍提供小額護盾及短效移速。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-09-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-09-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目前自身；需指定友軍盾與加速。

**特效**：`fx.prim.nature.pulse`，tint [235,166,56]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜賢狼真身

**目標上傳描述**：變為有限體型的大狼，強化普攻與 Q，暫時失去 W 的交易功能。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 4,
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        },
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：自身取得 4 秒增益：ad +15%、極小級移速。

**微調／補強要求**：目前 4 秒 AD／移速；需狼形態、碰撞調整、Q 替換及 W 禁用。

**特效**：`fx.prim.nature.pulse`，tint [235,166,56]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔豐收的約定〕

**目標上傳描述**：消耗剩餘籌碼，按消耗量強化附近友軍的護盾；不另外產生金幣。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 150,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-09-20260907.ex.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":150,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-09-20260907.ex.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目前自身固定盾；需扣除剩餘籌碼並擴展附近友軍。

**特效**：`fx.prim.nature.pulse`，tint [235,166,56]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

區分交易籌碼、戰鬥金幣與帳號資產；測試助攻去重、交易上限、變形碰撞與 EX 消耗，不把她寫成原作已有整套元素魔法。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 8 | 0.5 |
| EX | self | 1 | [45] | [576] | 8 | 0.1 |

機制補強條目：M01、M05、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 10｜魯路修：社群上傳內容與套用設定

英雄檔：`projects/10.hero-project.json`  
工作流資料：`recipes/10.upload-recipe.json`

作品：《Code Geass 反叛的魯路修》  
定位：戰術標記、有限命令、隊伍配合。

出身：軟輔；定位：fighter；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":21,"agi":20,"int":19,"strGrowth":1.99,"agiGrowth":1.89,"intGrowth":1.83}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"大","ad":"小","ap":"中","as":"小","healthRegen":"中","manaRegen":"大","range":"中"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：紅色 Geass 眼形、棋盤格區域、黑紅戰術標記；控制完成要有清楚復原提示。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔戰局推演〕

**目標上傳描述**：友軍命中自己的戰術標記時累積指揮層數，同一技能多段命中只計一次。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需友軍命中戰術標記與施法去重指揮層數。

**特效**：`fx.prim.void.pulse-sm`，tint [191,20,59]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔戰術射擊〕

**目標上傳描述**：中距離單發射擊，對帶標記目標造成額外傷害。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：缺戰術標記額外傷害。

**特效**：`fx.prim.void.slash`，tint [191,20,59]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔集中火力〕

**目標上傳描述**：標記一個可見敵人，讓下一次友軍有效命中獲得追加效果。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "slow30",
        "duration": 1.5,
        "applyTo": "target",
        "moveSpeedMult": 0.7
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1.5,"applyTo":"target","moveSpeedMult":0.7}]。

**微調／補強要求**：固定緩速；需標記與下一次友軍命中消耗。

**特效**：`fx.prim.void.slash`，tint [191,20,59]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔撤退指令〕

**目標上傳描述**：為附近友軍提供朝安全方向移動時的短效加速。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速。

**微調／補強要求**：目前只加速自身；需朝安全方向移動的友軍條件。

**特效**：`fx.prim.void.pulse`，tint [191,20,59]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜絕對遵守的 Geass

**目標上傳描述**：在視線成立後，命令一名敵人沿合法路徑朝指定位置移動，持續約 1 秒。每名目標每回合只能成功受此命令一次；控制免疫或視線失敗時不記為成功。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "stun",
        "duration": 0.8,
        "applyTo": "target",
        "stun": true
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"stun","duration":0.8,"applyTo":"target","stun":true}]。

**微調／補強要求**：單體 0.8 秒暈眩不能代替 Geass；需視線、強制合法移動與每目標每回合成功一次。

**特效**：`fx.prim.void.slash`，tint [191,20,59]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔Checkmate〕

**目標上傳描述**：消耗指揮層數，對已標記區域發動有預警的戰術打擊。

**套用模板**：`tpl-ground-nova`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-ground-nova",
    "inheritDefaults": true,
    "params": {
      "radius": 300,
      "damage": {
        "damageTier": "中",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定落點半徑 300 wc3u 的一次中級範圍傷害。

**微調／補強要求**：缺指揮層數消耗。

**特效**：`fx.prim.void.nova`，tint [191,20,59]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

驗證視線、命令成功紀錄、路徑失效、淨化與控制恢復；不允許命令玩家購物、交出資產或執行任意指令。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| R | targeted | 3 | [45,45,45] | [576,576,576] | 4.5 | 0.5 |
| EX | ground | 1 | [90] | [576] | 8 | 0.1 |

機制補強條目：M01、M08、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 11｜利姆路：社群上傳內容與套用設定

英雄檔：`projects/11.hero-project.json`  
工作流資料：`recipes/11.upload-recipe.json`

作品：《關於我轉生變成史萊姆這檔事》  
採用：以大賢者、捕食者、擬態為核心的版本。  
定位：吸收分析、有限技能取得、變形。

出身：法鬥；定位：mage；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":13,"int":29,"strGrowth":1.67,"agiGrowth":1.25,"intGrowth":2.78}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"中","ap":"大","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：水藍水刃、黑紫黑炎、解析圓環；史萊姆與人形本體待製。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜大賢者

**目標上傳描述**：分析最近承受的技能類型，提供該類型的短效有限減傷；同時只保存一種分析結果。

**套用模板**：`tpl-on-hit-react`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-hit-react",
    "inheritDefaults": true,
    "params": {
      "chance": 1,
      "reflectDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "reflectRadius": 300,
      "internalCooldown": 4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：受傷時觸發有 4 秒冷卻的小範圍反擊；不是防禦成功或閃避成功事件。

**微調／補強要求**：需最近受擊類型分析及同時只留一種減傷結果。

**特效**：`fx.prim.ice.pulse-sm`，tint [46,189,237]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜水刃

**目標上傳描述**：直線水刃，可穿過有限數量目標。

**套用模板**：`tpl-traveling-wave`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-traveling-wave",
    "inheritDefaults": true,
    "params": {
      "stepSize": 100,
      "stepCount": 4,
      "stepIntervalSec": 0.12,
      "aoePerStep": 100,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。

**微調／補強要求**：需穿透人數上限及單彈命中去重。

**特效**：`fx.prim.ice.bolt`，tint [46,189,237]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜捕食者

**目標上傳描述**：短窗口吸收一個白名單敵方投射物，取消其後續命中並保存分析樣本。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-11-20260907.w.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-11-20260907.w.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：護盾不會吸收或刪除敵彈；需白名單投射物與樣本持有。

**特效**：`fx.prim.ice.pulse-sm`，tint [46,189,237]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜擬態

**目標上傳描述**：在人形與史萊姆形態間切換，改變普攻及移動表現，保留生命、資源與冷卻。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速。

**微調／補強要求**：需人形／史萊姆形態、普攻替換與生命冷卻保留。

**特效**：`fx.prim.ice.pulse-sm`，tint [46,189,237]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜黑炎

**目標上傳描述**：在指定區域產生有限脈衝的黑炎，結束後清理全部區域效果。

**套用模板**：`tpl-periodic-field`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-periodic-field",
    "inheritDefaults": true,
    "params": {
      "intervalSec": 1,
      "durationSec": 3,
      "radiusTier": "小",
      "anchor": "point",
      "applyTo": "enemies",
      "damageTier": "極小",
      "damageType": "magic",
      "castTimeSec": 0.3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：指定落點維持 3 秒的小級半徑傷害區，每秒一跳極小級傷害。

**微調／補強要求**：固定 3 秒黑炎可作基本區域驗收；黑炎色覆寫。

**特效**：`fx.prim.ice.nova`，tint [46,189,237]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔解析完成・能力再現〕

**目標上傳描述**：消耗 W 的樣本，以自己的屬性施放一次核准的技能副本；使用後清空樣本。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。

**微調／補強要求**：固定攻擊不是能力副本；需樣本版本、消耗與禁止遞迴。

**特效**：`fx.prim.ice.pulse-sm`，tint [46,189,237]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

吸收與複製必須經白名單；測試不可吸收物、同幀多彈、複製來源死亡，以及樣本內不得夾帶任意腳本或遞迴複製。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M05，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 12｜衛宮士郎：社群上傳內容與套用設定

英雄檔：`projects/12.hero-project.json`  
工作流資料：`recipes/12.upload-recipe.json`

作品：《Fate/stay night》  
採用：Unlimited Blade Works 路線。  
定位：投影武器、短期武裝、區域劍製。

出身：法鬥；定位：mage；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":13,"int":29,"strGrowth":1.67,"agiGrowth":1.25,"intGrowth":2.78}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"中","ap":"大","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：橘色投影線稿、鋼色雙劍、紅褐劍域；不得生成永久背包武器。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔武器解析〕

**目標上傳描述**：近戰交鋒累積解析層數，降低下一次投影的資源消耗；有最低消耗限制。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需近戰解析層與投影最低資源消耗。

**特效**：`fx.prim.physical.pulse-sm`，tint [247,99,51]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜干將・莫邪

**目標上傳描述**：投影雙劍進行近身交叉斬擊。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 2,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：2 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：雙劍掛點與交叉斬動畫待製。

**特效**：`fx.prim.physical.slash`，tint [247,99,51]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔投影・飛劍〕

**目標上傳描述**：將有限數量的投影劍射向指定方向。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 3,
      "intervalSec": 0.15,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：在指定區域依序落下 3 發；每發間隔 0.15 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：目前定點三發落劍；需按方向投影飛劍。

**特效**：`fx.prim.physical.nova`，tint [247,99,51]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔強化・踏步〕

**目標上傳描述**：短距離移動並強化下一次近戰命中。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 250,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：缺下一次近戰強化。

**特效**：`fx.prim.physical.slash`，tint [247,99,51]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜無限劍製

**目標上傳描述**：展開有期限的劍域，強化 W 並在固定節奏追加投影劍；領域不改寫地圖邊界。

**套用模板**：`tpl-periodic-field`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-periodic-field",
    "inheritDefaults": true,
    "params": {
      "intervalSec": 1,
      "durationSec": 3,
      "radiusTier": "小",
      "anchor": "point",
      "applyTo": "enemies",
      "damageTier": "極小",
      "damageType": "physical",
      "castTimeSec": 0.3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：指定落點維持 3 秒的小級半徑傷害區，每秒一跳極小級傷害。

**微調／補強要求**：目前領域傷害；需領域内 W 強化、投影劍生成與退出還原。

**特效**：`fx.prim.physical.nova`，tint [247,99,51]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔投影・迎擊〕

**目標上傳描述**：投影武器攔截一次正面攻擊，成功後開啟一次反擊。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-12-20260907.ex.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-12-20260907.ex.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需一次正面迎擊成功後反擊窗口。

**特效**：`fx.prim.physical.pulse`，tint [247,99,51]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

投影武器具有期限與數量上限，不生成永久背包物品；驗證劍域退出、死亡清理及武器模型掛點。避免混入 HF 的移植手臂設定。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [45,45,45,45] | [144,144,144,144] | 3 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M01、M07、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 13｜朝田詩乃：社群上傳內容與套用設定

英雄檔：`projects/13.hero-project.json`  
工作流資料：`recipes/13.upload-recipe.json`

作品：《刀劍神域》  
採用：GGO 的詩乃，使用 Hecate II。  
定位：瞄準、視線、狙擊與撤離。

出身：射手；定位：marksman；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":13,"agi":29,"int":18,"strGrowth":1.25,"agiGrowth":2.78,"intGrowth":1.67}`

屬性覆寫：`{"ms":"中","mr":"小","armor":"小","maxHealth":"小","maxMana":"中","ad":"大","ap":"小","as":"大","healthRegen":"小","manaRegen":"中","range":"大"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：青色狙擊線、金色槍口火、灰色翻滾塵；採 GGO 槍械版本。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔狙擊專注〕

**目標上傳描述**：保持穩定姿勢累積瞄準，移動或受擊降低；效果有上限。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需静止瞄準層與移動受傷衰退。

**特效**：`fx.prim.physical.pulse-sm`，tint [66,179,176]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔Hecate II・精準射擊〕

**目標上傳描述**：短蓄力直線射擊，依瞄準層數提高傷害。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：固定起手分段線；需蓄力、射線掩體與瞄準層增傷。

**特效**：`fx.prim.physical.beam`，tint [66,179,176]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔觀測射界〕

**目標上傳描述**：顯示有效射線與遮蔽物，短暫標記一名已可見敵人。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：as +20%。

**微調／補強要求**：目前攻速增益；需射界 UI、合法可見敵人的觀測標記。

**特效**：`fx.prim.physical.pulse`，tint [66,179,176]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔戰術翻滾〕

**目標上傳描述**：短距離翻滾，打斷自己的瞄準並重新定位。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 70,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：翻滾應為貼地移動且清空瞄準，目前是低弧跳躍。

**特效**：`fx.prim.physical.arc`，tint [66,179,176]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔Hecate II・決定性一槍〕

**目標上傳描述**：較長瞄準後射出高傷害子彈，敵人可見射線預警。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需單發高傷害射線、較長瞄準與移動取消。

**特效**：`fx.prim.physical.beam`，tint [66,179,176]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔副武器應急射擊〕

**目標上傳描述**：近距離快速射擊，附帶小幅後退；給狙擊手有限自保能力。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：缺小幅後退位移。

**特效**：`fx.prim.physical.slash`，tint [66,179,176]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

傷害依伺服器射線與碰撞結算；驗證掩體、視線中斷、移動取消與高速目標。版本中不混入 ALO 弓箭或詩乃神帳號能力。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 8 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 8 | 0.1 |
| R | skillshot | 3 | [90,90,90] | [576,576,576] | 8 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M02、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 14｜殺老師：社群上傳內容與套用設定

英雄檔：`projects/14.hero-project.json`  
工作流資料：`recipes/14.upload-recipe.json`

作品：《暗殺教室》  
定位：高速移動、觸手多工、限時防禦。

出身：法刺；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":12,"agi":25,"int":23,"strGrowth":1.18,"agiGrowth":2.36,"intGrowth":2.17}`

屬性覆寫：`{"ms":"大","mr":"小","armor":"小","maxHealth":"小","maxMana":"中","ad":"中","ap":"大","as":"中","healthRegen":"小","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：黄色觸手弧、三段殘像、白金防禦球；球體不得藏掉可受擊位置。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔教師的觀察〕

**目標上傳描述**：同一敵人反覆以相同招式攻擊時，短暫提高對該招的有限防禦；不同技能可打破適應。

**套用模板**：`tpl-on-hit-react`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-hit-react",
    "inheritDefaults": true,
    "params": {
      "chance": 1,
      "reflectDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "reflectRadius": 300,
      "internalCooldown": 4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：受傷時觸發有 4 秒冷卻的小範圍反擊；不是防禦成功或閃避成功事件。

**微調／補強要求**：需按敵人技能 ID 適應，不是所有受擊反擊。

**特效**：`fx.prim.wind.pulse-sm`，tint [255,214,41]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔觸手批改〕

**目標上傳描述**：前方多段觸手打擊，整招共享觸發次數上限。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 4,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：4 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：觸手多掛點與整招觸發上限待補。

**特效**：`fx.prim.wind.slash`，tint [255,214,41]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔高速授課〕

**目標上傳描述**：沿指定路線快速移動，到達終點時給附近友軍短效加速。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 450,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 450 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：缺到達終點後的友軍加速。

**特效**：`fx.prim.wind.slash`，tint [255,214,41]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔觸手再生〕

**目標上傳描述**：消耗資源分段恢復生命，受控制時停止。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "heal",
        "amount": {
          "flat": 100,
          "ratios": []
        },
        "applyTo": "self"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":100,"ratios":[]},"applyTo":"self"}]。

**微調／補強要求**：目前立即回血；需分段再生與受控中止。

**特效**：`fx.prim.wind.pulse`，tint [255,214,41]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜完全防禦形態

**目標上傳描述**：進入短暫球體防禦，期間無法移動及施法；結束後有明顯恢復動作。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 180,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-14-20260907.r.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":180,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-14-20260907.r.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需球體變形、禁移動禁施法與限時防禦；目前只有盾。

**特效**：`fx.prim.wind.pulse`，tint [255,214,41]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔分身式教學〕

**目標上傳描述**：以高速殘像演出三處依序打擊，實際由同一本體按時序結算。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 3,
      "intervalSec": 0.2,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：在指定區域依序落下 3 發；每發間隔 0.2 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：三個落點固定脈衝；需本體依序定位及殘像對齊。

**特效**：`fx.prim.wind.nova`，tint [255,214,41]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

高速位移仍處理路徑碰撞；防禦不能無限續接；殘像不生成三個完整英雄，也不重複獲得被動與擊殺獎勵。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [45,45,45,45] | [144,144,144,144] | 3 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | ground | 1 | [90] | [576] | 6 | 0.1 |

機制補強條目：M07、M11、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 15｜比利海靈頓：社群上傳內容與套用設定

英雄檔：`projects/15.hero-project.json`  
工作流資料：`recipes/15.upload-recipe.json`

來源：摔角與網路迷因形象。  
定位：抓取、雙人動作同步、近身支援。  
註：本組招式名稱為 GGD 創編。

出身：硬輔；定位：tank；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":25,"agi":12,"int":23,"strGrowth":2.36,"agiGrowth":1.18,"intGrowth":2.17}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"大","maxHealth":"大","maxMana":"中","ad":"中","ap":"小","as":"小","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：藍白摔角衝擊線、落地塵環、夥伴鼓舞光；招式名均為 GGD 創編。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔兄貴的氣勢〕

**目標上傳描述**：成功抓取或保護友軍累積氣勢，上限三層。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需抓取成功／有效保護事件的氣勢資源。

**特效**：`fx.prim.physical.pulse-sm`，tint [89,153,242]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔正面擒抱〕

**目標上傳描述**：抓取一名近身敵人，雙方短暫進入配對動作；抓取總時間有上限。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：核對 Owner 原文與模擬／畫面後才可驗收。

**特效**：`fx.prim.physical.slash`，tint [89,153,242]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔肌肉防線〕

**目標上傳描述**：消耗氣勢提高短期防禦，無氣勢時仍有較弱效果。

**套用模板**：`tpl-pull-throw`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-pull-throw",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "grabMode": "dragToCaster",
      "throwMode": "distance",
      "apexHeight": 1.2,
      "durationSec": 0.45,
      "throwDistance": 200,
      "landRadius": 2,
      "landDamageTier": "小",
      "landApRatio": 0,
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：拖拉指定目標後向前投擲 200 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。

**微調／補強要求**：雙人摔角動作、抓取免疫與同步挂點須驗收。

**特效**：`fx.prim.physical.arc`，tint [89,153,242]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔肩膀衝撞〕

**目標上傳描述**：向前衝撞，命中第一名敵人後停止。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-15-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-15-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需保護指定友軍與氣勢；目前自身。

**特效**：`fx.prim.physical.pulse`，tint [89,153,242]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔兄貴背摔〕

**目標上傳描述**：對抓取中的目標進行背摔；未抓取時先做可被閃避的近身捕捉。

**套用模板**：`tpl-pull-throw`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-pull-throw",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "grabMode": "dragToCaster",
      "throwMode": "distance",
      "apexHeight": 1.2,
      "durationSec": 0.45,
      "throwDistance": 400,
      "landRadius": 2,
      "landDamageTier": "小",
      "landApRatio": 0,
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：拖拉指定目標後向前投擲 400 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。

**微調／補強要求**：目前單次投擲；需大摔技雙人動作同步與有限區域衝擊。

**特效**：`fx.prim.physical.arc`，tint [89,153,242]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔兄弟站起來〕

**目標上傳描述**：為附近友軍提供護盾與短效韌性，以振奮及健美姿勢演出。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 100,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-15-20260907.ex.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：as +20%；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":100,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-15-20260907.ex.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需氣勢消耗及附近隊友；目前自身攻速與盾。

**特效**：`fx.prim.physical.pulse`，tint [89,153,242]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

重點是兩個角色的動畫、位置與控制狀態同步；任一方死亡、淨化、斷線或回合結束時，配對關係均須正確解除。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | ground | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | ground | 3 | [45,45,45] | [576,576,576] | 4.5 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M01、M06、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 16｜魔法少女☆伊莉雅：社群上傳內容與套用設定

英雄檔：`projects/16.hero-project.json`  
工作流資料：`recipes/16.upload-recipe.json`

作品：《Fate/kaleid liner 魔法少女☆伊莉雅》  
定位：魔杖射擊、職階卡、限時武裝。

出身：法師；定位：mage；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":13,"agi":18,"int":29,"strGrowth":1.25,"agiGrowth":1.67,"intGrowth":2.78}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"小","maxHealth":"小","maxMana":"大","ad":"小","ap":"大","as":"小","healthRegen":"小","manaRegen":"大","range":"大"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：粉白魔法陣、紅寶石杖尖、Saber 金藍裝甲與金色光束。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔紅寶石的支援〕

**目標上傳描述**：不同魔法技能連續施放後，強化下一次防禦或攻擊，不能由同一次多段命中快速疊滿。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需不同魔法施放序列及一次强化消耗。

**特效**：`fx.prim.holy.pulse-sm`，tint [255,99,191]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔魔力砲擊〕

**目標上傳描述**：由紅寶石之星發射直線魔力彈。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：魔杖彈体待製；目前分段光路。

**特效**：`fx.prim.holy.beam`，tint [255,99,191]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔魔力防壁〕

**目標上傳描述**：展開有限耐久的正面護盾。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-16-20260907.w.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-16-20260907.w.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目前全方向自身盾；需正面防壁。

**特效**：`fx.prim.holy.pulse`，tint [255,99,191]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔魔法少女飛行〕

**目標上傳描述**：短距離浮空移動，仍受對決邊界與落點合法性限制。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 250,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：有限落點跳躍，不是持續飛行。

**特效**：`fx.prim.holy.arc`，tint [255,99,191]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜夢幻召喚・Saber

**目標上傳描述**：限時取得 Saber 武裝，替換普攻與 Q；結束後還原，生命與冷卻持續。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 4,
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        },
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：自身取得 4 秒增益：ad +15%、as +20%。

**微調／補強要求**：目前 AD／攻速；需 Saber 武裝、普攻与 Q 替換與還原。

**特效**：`fx.prim.holy.pulse`，tint [255,99,191]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜限定展開・Excalibur

**目標上傳描述**：展開寶具進行一次有起手的直線光束攻擊。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：限定展開為一次光束，可作基礎驗收；需寶具武器掛點。

**特效**：`fx.prim.holy.beam`，tint [255,99,191]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

區分限定展開與夢幻召喚；測試卡片形態、武器掛點、切回技能及死亡還原，不借用其他伊莉雅版本的身世或能力補槽。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | skillshot | 1 | [90] | [576] | 8 | 0.5 |

機制補強條目：M01、M05、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 17｜安茲·烏爾·恭：社群上傳內容與套用設定

英雄檔：`projects/17.hero-project.json`  
工作流資料：`recipes/17.upload-recipe.json`

作品：《OVERLORD》  
定位：死亡魔法、召喚、延遲終結。

出身：法師；定位：mage；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":13,"agi":18,"int":29,"strGrowth":1.25,"agiGrowth":1.67,"intGrowth":2.78}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"小","maxHealth":"小","maxMana":"大","ad":"小","ap":"大","as":"小","healthRegen":"小","manaRegen":"大","range":"大"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：紫黑骷髏法印、綠色情緒抑制光、墜落天空白熱預警；社群 ID 不覆蓋飛鼠。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔情緒抑制〕

**目標上傳描述**：受到控制後獲得短效控制抗性，具有內置冷卻。

**套用模板**：`tpl-on-hit-react`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-hit-react",
    "inheritDefaults": true,
    "params": {
      "chance": 1,
      "reflectDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "reflectRadius": 300,
      "internalCooldown": 4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：受傷時觸發有 4 秒冷卻的小範圍反擊；不是防禦成功或閃避成功事件。

**微調／補強要求**：需受控後控制抗性及冷卻；目前受傷反擊。

**特效**：`fx.prim.void.pulse-sm`，tint [112,41,179]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜心臟掌握

**目標上傳描述**：對單一目標造成魔法傷害；低生命時追加有限傷害，仍經正常致死與保命流程。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。

**微調／補強要求**：缺低生命有限追加與處決流程專測。

**特效**：`fx.prim.void.slash`，tint [112,41,179]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜死亡騎士

**目標上傳描述**：召喚一名可受擊的死亡騎士，負責近身牽制。

**套用模板**：`tpl-summon-agent`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-summon-agent",
    "inheritDefaults": true,
    "params": {
      "count": 1,
      "body": "champion",
      "championId": "thorne",
      "durationSec": 6,
      "damageMult": 0.25,
      "hpMult": 0.3,
      "formation": "ring",
      "spread": 1.5,
      "maxAlive": 1,
      "onOwnerDeath": "despawn",
      "cleanse": "none",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：召喚 1 名 thorne 樣板代理，6 秒、25% 傷害、30% 生命，同類上限 1、主人死亡清除。

**微調／補強要求**：死亡騎士造型待製，代理採 thorne。

**特效**：`fx.prim.void.summon`，tint [112,41,179]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜高階傳送

**目標上傳描述**：移動到合法落點，保留可辨識的起點與終點演出。

**套用模板**：`tpl-teleport`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-teleport",
    "inheritDefaults": true,
    "params": {
      "destination": "castPoint",
      "castTimeSec": 0.25,
      "travelSec": 0.15,
      "arriveRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：傳送到指定落點，抵達後小範圍極小級傷害。

**微調／補強要求**：原設計只有傳送，模板帶抵達傷害，需審查這項改編。

**特效**：`fx.prim.void.pulse`，tint [112,41,179]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜墜落天空

**目標上傳描述**：長起手的區域超位魔法，具有明顯預警與中斷機會。

**套用模板**：`tpl-ground-nova`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-ground-nova",
    "inheritDefaults": true,
    "params": {
      "radius": 300,
      "damage": {
        "damageTier": "大",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "極大"
  }
}
```

**目前模板行為**：指定落點半徑 300 wc3u 的一次大級範圍傷害。

**微調／補強要求**：需長吟唱途中真正可中斷與落點預警。

**特效**：`fx.prim.void.nova`，tint [112,41,179]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜死亡是所有生命的終點

**目標上傳描述**：對範圍內敵人施加倒數詛咒。到期後，低於生命門檻者進入標準處決結算，其餘受到有限傷害。可依 GGD 規則以離開有效條件、淨化或保命能力反制。

**套用模板**：`tpl-ground-nova`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-ground-nova",
    "inheritDefaults": true,
    "params": {
      "radius": 300,
      "damage": {
        "damageTier": "中",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定落點半徑 300 wc3u 的一次中級範圍傷害。

**微調／補強要求**：目前立即範圍傷害；需倒數詛咒、標準處決、淨化與保命優先序。

**特效**：`fx.prim.void.nova`，tint [112,41,179]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

處決不能直接刪除單位；驗證倒數期間死亡、召喚主死亡、保命優先序及重複結算。先比對既有飛鼠／安茲內容，建立社群版本而非覆蓋。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 8 | 1 |
| EX | ground | 1 | [90] | [576] | 6 | 0.1 |

機制補強條目：M03、M09，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 18｜吉爾伽美什：社群上傳內容與套用設定

英雄檔：`projects/18.hero-project.json`  
工作流資料：`recipes/18.upload-recipe.json`

作品：《Fate》  
採用：Archer 英雄王。  
定位：多投射物、束縛、大型蓄力攻擊。

出身：砲手；定位：marksman；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":29,"agi":13,"int":18,"strGrowth":2.78,"agiGrowth":1.25,"intGrowth":1.67}`

屬性覆寫：`{"ms":"小","mr":"小","armor":"中","maxHealth":"中","maxMana":"大","ad":"大","ap":"中","as":"小","healthRegen":"小","manaRegen":"中","range":"大"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：金色門環、寶物白金軌跡、天之鎖金線、Ea 紅色旋流。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔王的財庫〕

**目標上傳描述**：技能按次累積財庫能量，供 EX 消耗；命中段數不等於獲得次數。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需每次施法一次財庫能量與 EX 消耗。

**特效**：`fx.prim.holy.pulse-sm`，tint [255,186,41]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜王之財寶

**目標上傳描述**：開啟三個門，依序發射武器。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 3,
      "intervalSec": 0.18,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：在指定區域依序落下 3 發；每發間隔 0.18 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：目前三發落點打擊；需三門武器投射物及門的掛點。

**特效**：`fx.prim.holy.nova`，tint [255,186,41]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜天之鎖

**目標上傳描述**：射出鎖鏈，命中後短暫束縛；目標超出有效距離時解除。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "root",
        "duration": 0.7,
        "applyTo": "target",
        "root": true
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"root","duration":0.7,"applyTo":"target","root":true}]。

**微調／補強要求**：鎖足可作基礎控制；需超距解鎖、鎖鏈端點。

**特效**：`fx.prim.holy.slash`，tint [255,186,41]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔黃金甲冑〕

**目標上傳描述**：提供短效護盾，降低正面承受的爆發。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-18-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-18-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目前全方向盾；缺正面條件。

**特效**：`fx.prim.holy.pulse`，tint [255,186,41]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜天地乖離開闢之星

**目標上傳描述**：以 Ea 進行明顯蓄力後的扇形／直線範圍攻擊。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：Ea 造型、蓄力層與單一總傷害預算需補。

**特效**：`fx.prim.holy.beam`，tint [255,186,41]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔王之財寶・齊射〕

**目標上傳描述**：消耗財庫能量，分波發射最多十二件武器；各波有固定間隔。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 12,
      "intervalSec": 0.12,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：在指定區域依序落下 12 發；每發間隔 0.12 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：12 發已有限；需扣財庫能量及武器多樣外觀。

**特效**：`fx.prim.holy.nova`，tint [255,186,41]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

門、武器與命中判定分開計數；驗證同目標多彈傷害預算、鎖鏈解除、蓄力中斷與特效併發成本。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | ground | 4 | [45,45,45,45] | [144,144,144,144] | 8 | 0.1 |
| W | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| R | skillshot | 3 | [90,90,90] | [576,576,576] | 8 | 0.5 |
| EX | ground | 1 | [90] | [576] | 8 | 0.1 |

機制補強條目：M01、M02、M11，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 19｜桐谷和人：社群上傳內容與套用設定

英雄檔：`projects/19.hero-project.json`  
工作流資料：`recipes/19.upload-recipe.json`

作品：《刀劍神域》  
採用：SAO 二刀流桐人。  
定位：多段近戰、連擊中斷、雙武器動作。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：黑白雙劍加青色斬線；命中特效節流，只有末段放大閃光。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜二刀流

**目標上傳描述**：交替命中累積連擊節奏，停止交鋒後衰退；提供有限攻速加成。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需左右手交替命中、節奏衰退與攻速。

**特效**：`fx.prim.physical.pulse-sm`，tint [77,173,240]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔雙劍交叉斬〕

**目標上傳描述**：左右手各進行一次近戰判定。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 2,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：2 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：需左右手掛點對應。

**特效**：`fx.prim.physical.slash`，tint [77,173,240]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔劍技招架〕

**目標上傳描述**：短窗口迎擊正面攻擊，成功後強化下一次近戰。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-19-20260907.w.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-19-20260907.w.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需迎擊窗口與成功後下一刀加成。

**特效**：`fx.prim.physical.pulse`，tint [77,173,240]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜Sonic Leap

**目標上傳描述**：短距離躍進斬擊，碰撞或落點失效時安全停止。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 160,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：需對目標的躍進斬、牆體與落點失效處理。

**特效**：`fx.prim.physical.arc`，tint [77,173,240]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜Starburst Stream

**目標上傳描述**：十六次依序發生的斬擊機會；每次重新檢查目標範圍，整招共享傷害預算。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 16,
      "hitIntervalSec": 0.1,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：16 段連擊，間隔 0.1 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：16 段已可配置；須證明每段重查距離、中斷後不再命中及總預算。

**特效**：`fx.prim.physical.slash`，tint [77,173,240]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜The Eclipse

**目標上傳描述**：更長起手的二十七連擊終結技；具有更高的暴露時間與中斷風險。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 20,
      "hitIntervalSec": 0.1,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：20 段連擊，間隔 0.1 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：模板 hitCount 上限 20，不能冒稱 27 連擊；需有序 27 段的共用模板擴充，不採兩個並行連擊拼接。

**特效**：`fx.prim.physical.slash`，tint [77,173,240]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

驗證第幾段中斷、目標移出範圍、左右武器命中點，以及吸血、被動和命中特效的觸發頻率。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [45,45,45,45] | [144,144,144,144] | 3 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| R | targeted | 3 | [90,90,90] | [576,576,576] | 3 | 0.5 |
| EX | targeted | 1 | [90] | [576] | 3 | 0.1 |

機制補強條目：M01、M07、M11，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 20｜御坂美琴：社群上傳內容與套用設定

英雄檔：`projects/20.hero-project.json`  
工作流資料：`recipes/20.upload-recipe.json`

作品：《科學超電磁砲》  
定位：電擊連鎖、電磁防禦、直線爆發。

出身：法師；定位：mage；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":13,"agi":18,"int":29,"strGrowth":1.25,"agiGrowth":1.67,"intGrowth":2.78}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"小","maxHealth":"小","maxMana":"大","ad":"小","ap":"大","as":"小","healthRegen":"小","manaRegen":"大","range":"大"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：藍白放電、橘白超電磁砲、灰黑鐵砂盾；鏈線不得超出實際目標序列。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔電荷累積〕

**目標上傳描述**：不同技能命中累積電荷，上限三層；下一次強化技消耗。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需三層電荷及下一次強化技消耗。

**特效**：`fx.prim.lightning.pulse-sm`，tint [115,196,255]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜電擊之槍

**目標上傳描述**：直線電擊，主要作為穩定消耗。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需單道電擊與貫穿去重。

**特效**：`fx.prim.lightning.beam`，tint [115,196,255]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔連鎖放電〕

**目標上傳描述**：在附近不同敵人間跳躍，同一施法不重複命中同一目標。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "chainLightning",
        "shape": "single",
        "amount": {
          "damageTier": "極小",
          "ratios": []
        },
        "damageType": "magic",
        "jumps": 3,
        "jumpRange": 3,
        "decay": 0.8,
        "revisit": false,
        "maxTotalJumps": 3,
        "jumpIntervalSec": 0.12
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"chainLightning","shape":"single","amount":{"damageTier":"極小","ratios":[]},"damageType":"magic","jumps":3,"jumpRange":3,"decay":0.8,"revisit":false,"maxTotalJumps":3,"jumpIntervalSec":0.12}]。

**微調／補強要求**：模板主命中加鏈起點會對起點追加；需原設計整招同目標只命中一次。

**特效**：`fx.prim.lightning.slash`，tint [115,196,255]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔鐵砂防壁〕

**目標上傳描述**：用鐵砂建立短效護盾，破盾時散開為純視覺碎粒。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-20-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-20-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：鐵砂碎粒及破盾事件待補。

**特效**：`fx.prim.lightning.pulse`，tint [115,196,255]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜超電磁砲

**目標上傳描述**：彈出硬幣後發射有預警的高傷害直線攻擊。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：目前四段線；需硬幣彈出、單發射線與整體傷害上限。

**特效**：`fx.prim.lightning.beam`，tint [115,196,255]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔電磁過載〕

**目標上傳描述**：消耗電荷，強化下一次 Q 的範圍或 W 的跳躍數；使用時明示強化結果。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ap",
          "op": "pctAdd",
          "value": 0.15
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：ap +15%。

**微調／補強要求**：僅 AP 增益；需電荷扣除與 Q／W 指定版本強化。

**特效**：`fx.prim.lightning.pulse`，tint [115,196,255]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

驗證跳躍去重、目標死亡後改選、射線碰撞與電荷消耗。鐵砂護盾不自動等同永久可阻擋地形。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | skillshot | 3 | [90,90,90] | [576,576,576] | 8 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M01、M11，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 21｜鹿目圓：社群上傳內容與套用設定

英雄檔：`projects/21.hero-project.json`  
工作流資料：`recipes/21.upload-recipe.json`

作品：《魔法少女小圓》  
採用：魔法少女圓為主，EX 借用圓環之理意象。  
定位：弓箭、保護、有限救援。

出身：軟輔；定位：fighter；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":21,"agi":20,"int":19,"strGrowth":1.99,"agiGrowth":1.89,"intGrowth":1.83}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"大","ad":"小","ap":"中","as":"小","healthRegen":"中","manaRegen":"大","range":"中"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：粉白弓光、玫瑰花瓣盾、圓環環帶；不使用時停。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔希望的連結〕

**目標上傳描述**：有效保護友軍時累積希望，上限三層；溢出治療與無效護盾不提供資源。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需有效治療／吸收量計算希望，溢出不計。

**特效**：`fx.prim.holy.pulse-sm`，tint [255,158,212]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔光之箭〕

**目標上傳描述**：發射直線魔法箭。

**套用模板**：`tpl-traveling-wave`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-traveling-wave",
    "inheritDefaults": true,
    "params": {
      "stepSize": 100,
      "stepCount": 4,
      "stepIntervalSec": 0.12,
      "aoePerStep": 100,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。

**微調／補強要求**：需魔法箭投射物。

**特效**：`fx.prim.holy.pulse`，tint [255,158,212]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔希望之弓〕

**目標上傳描述**：為指定友軍提供護盾；消耗一層希望可加強。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-21-20260907.w.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-21-20260907.w.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目前自身；需指定友軍及希望消耗。

**特效**：`fx.prim.holy.pulse`，tint [255,158,212]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔淨化之願〕

**目標上傳描述**：解除一項可淨化的負面狀態，並提供短效移速。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速。

**微調／補強要求**：目前自身加速；需一項可淨化狀態移除。

**特效**：`fx.prim.holy.pulse`，tint [255,158,212]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔願望箭雨〕

**目標上傳描述**：對指定區域發射有限波次的箭雨。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 3,
      "intervalSec": 0.35,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：在指定區域依序落下 3 發；每發間隔 0.35 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：有限三波箭雨已對應；箭形資產待製。

**特效**：`fx.prim.holy.nova`，tint [255,158,212]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜圓環之理

**目標上傳描述**：對一名友軍施加短期保命印記。首次受到致死傷害時消耗印記，保留少量生命並短暫保護。同一目標每回合限一次。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 160,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-21-20260907.ex.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":160,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-21-20260907.ex.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：護盾不是友軍致死攔截；需限時保命印記與每目標每回合一次。

**特效**：`fx.prim.holy.pulse`，tint [255,158,212]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

驗證保命與處決的順序、重複印記、有效保護量及希望計算；不加入曉美焰的時間停止能力。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 8 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 8 | 0.5 |
| EX | self | 1 | [45] | [576] | 8 | 0.1 |

機制補強條目：M01、M09、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 22｜菜月昴：社群上傳內容與套用設定

英雄檔：`projects/22.hero-project.json`  
工作流資料：`recipes/22.upload-recipe.json`

作品：《Re:從零開始的異世界生活》  
定位：個人狀態保存、有限致死攔截、資訊累積。

出身：硬輔；定位：tank；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":25,"agi":12,"int":23,"strGrowth":2.36,"agiGrowth":1.18,"intGrowth":2.17}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"大","maxHealth":"大","maxMana":"中","ad":"中","ap":"小","as":"小","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：黑紫 Shamac、存檔沙漏符號、舊位置輪廓與回復線；不得以瞬移加回血冒稱回溯。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔記住這次失敗〕

**目標上傳描述**：完成一次死亡回歸後，短暫標記造成致死傷害的敵人；只顯示當前合法可見資訊。

**套用模板**：`tpl-mark-stacks`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-mark-stacks",
    "inheritDefaults": true,
    "params": {
      "markId": "community-review-22-20260907.last-chance",
      "initial": 1,
      "max": 1,
      "durationSec": -1,
      "resetOn": "match",
      "perStackLost": [],
      "lethalMode": "save",
      "lethalConsume": 1,
      "surviveHpPct": 0.01,
      "internalCooldown": 1,
      "invulnerableSec": 0.5,
      "restoreHealthPct": 0.15,
      "aoeRadius": 0,
      "knockbackDistance": 0,
      "stunSec": 0
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：本場一層免死標記，首次致死消耗並回復 15% 生命，保護 0.5 秒。

**微調／補強要求**：本場免死不是死亡回歸；需與 R／EX 共用存檔並合法顯示致死來源。

**特效**：`fx.prim.void.pulse-sm`，tint [140,77,171]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜Shamac

**目標上傳描述**：製造短暫黑霧干擾，效果限定於 GGD 核准的視覺／命中干擾範圍。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "slow30",
        "duration": 1.5,
        "applyTo": "target",
        "moveSpeedMult": 0.7
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1.5,"applyTo":"target","moveSpeedMult":0.7}]。

**微調／補強要求**：固定緩速不代表黑霧感官／命中干擾。

**特效**：`fx.prim.void.slash`，tint [140,77,171]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔鞭繩牽制〕

**目標上傳描述**：中短距離鞭擊，命中後小幅牽引。

**套用模板**：`tpl-pull-throw`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-pull-throw",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "grabMode": "dragToCaster",
      "throwMode": "distance",
      "apexHeight": 1.2,
      "durationSec": 0.45,
      "throwDistance": 100,
      "landRadius": 2,
      "landDamageTier": "小",
      "landApRatio": 0,
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：拖拉指定目標後向前投擲 100 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。

**微調／補強要求**：抓投是模板預覽；需鞭擊後小幅牽引，不應拋飛目標。

**特效**：`fx.prim.void.arc`，tint [140,77,171]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔重新振作〕

**目標上傳描述**：提供自己與附近一名友軍小額護盾，協助重新進入戰鬥。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-22-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-22-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需自己及附近一名友軍。

**特效**：`fx.prim.void.pulse`，tint [140,77,171]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜死亡回歸

**目標上傳描述**：施放時保存自己的位置與生命，存檔有效五秒。期間首次致死傷害被攔截，返回合法存檔位置，恢復到存檔生命但不超過既定上限。每回合最多成功一次。其他角色、世界時間、傷害紀錄、金幣、經驗與冷卻均繼續。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大",
    "effects": [
      {
        "kind": "heal",
        "amount": {
          "flat": 100,
          "ratios": []
        },
        "applyTo": "self"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":100,"ratios":[]},"applyTo":"self"}]。

**微調／補強要求**：目前立即恢復 100 生命；需五秒位置生命快照、致死回溯與合法落點。

**特效**：`fx.prim.void.pulse`，tint [140,77,171]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔重新選擇〕

**目標上傳描述**：R 存檔有效且自己仍存活時，主動消耗同一存檔，回復位置與受上限限制的生命。使用後該存檔不再攔截致死傷害。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "heal",
        "amount": {
          "flat": 80,
          "ratios": []
        },
        "applyTo": "self"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":80,"ratios":[]},"applyTo":"self"}]。

**微調／補強要求**：目前立即恢復 80 生命；需主動消耗 R 同一快照且不得重置冷卻。

**特效**：`fx.prim.void.pulse`，tint [140,77,171]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

這是 GGD 個人回復版死亡回歸。驗證非法舊位置、連續致死、R/EX 同幀競爭，以及生命回復不重置技能、獎勵或其他角色狀態。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | ground | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M06、M09，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 23｜坂田銀時：社群上傳內容與套用設定

英雄檔：`projects/23.hero-project.json`  
工作流資料：`recipes/23.upload-recipe.json`

作品：《銀魂》  
定位：木刀近戰、反擊、喜劇節奏。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：木刀淺藍斬線、粉白補給光、漫畫速度線與短吐槽，不讓文字解析成機制。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔糖分補給〕

**目標上傳描述**：脫戰後累積一份補給，供 W 消耗；最多保存一份。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需脫戰保存一份補給給 W。

**特效**：`fx.prim.physical.pulse-sm`，tint [158,207,245]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔洞爺湖・橫斬〕

**目標上傳描述**：木刀橫掃前方。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需木刀近身弧形判定。

**特效**：`fx.prim.physical.beam`，tint [158,207,245]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔草莓牛奶休息時間〕

**目標上傳描述**：短暫飲用補給恢復生命，受擊或移動會中斷。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "heal",
        "amount": {
          "flat": 100,
          "ratios": []
        },
        "applyTo": "self"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":100,"ratios":[]},"applyTo":"self"}]。

**微調／補強要求**：需喝草莓牛奶動作、移動／受擊中斷。

**特效**：`fx.prim.physical.pulse`，tint [158,207,245]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔萬事屋式反擊〕

**目標上傳描述**：短時間招架，成功後可接一次木刀反擊。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-23-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-23-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需招架成功後一次反擊窗口。

**特效**：`fx.prim.physical.pulse`，tint [158,207,245]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔白夜叉〕

**目標上傳描述**：限時強化近戰動作與追擊能力，不提供永久變形。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 4,
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        },
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：自身取得 4 秒增益：ad +15%、極小級移速。

**微調／補強要求**：短期 AD＋移速對應基础强化；白夜叉動作待製。

**特效**：`fx.prim.physical.pulse`，tint [158,207,245]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔吐槽也是武器〕

**目標上傳描述**：近身重擊打斷一個可中斷的施法，以吐槽文字及誇張表情演出。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "stun",
        "duration": 0.5,
        "applyTo": "target",
        "stun": true
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。 附加效果：[{"kind":"applyStatus","statusId":"stun","duration":0.5,"applyTo":"target","stun":true}]。

**微調／補強要求**：0.5 秒暈眩可測基本打斷；須限定可中斷施法與吐槽文字對齊。

**特效**：`fx.prim.physical.slash`，tint [158,207,245]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

喜劇文字與真正控制事件對齊；測試反擊失敗、補給中斷與強化結束，不把台詞解析成額外技能指令。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M07，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 24｜奇犽：社群上傳內容與套用設定

英雄檔：`projects/24.hero-project.json`  
工作流資料：`recipes/24.upload-recipe.json`

作品：《HUNTER×HUNTER》  
定位：電力資源、高速移動、自動反應。

出身：法刺；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":12,"agi":25,"int":23,"strGrowth":1.18,"agiGrowth":2.36,"intGrowth":2.17}`

屬性覆寫：`{"ms":"大","mr":"小","armor":"小","maxHealth":"小","maxMana":"中","ad":"中","ap":"大","as":"中","healthRegen":"小","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：藍白短電弧、側移殘像、神速輪廓電流；電量 UI 不以裝飾光冒充。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔電力儲備〕

**目標上傳描述**：技能消耗電力；停止攻擊一段時間後逐步充電，設上限。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需電力上限／脫戰充電；目前用標準魔力。

**特效**：`fx.prim.lightning.pulse-sm`，tint [138,196,255]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜落雷

**目標上傳描述**：指定小區域的延遲電擊。

**套用模板**：`tpl-ground-nova`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-ground-nova",
    "inheritDefaults": true,
    "params": {
      "radius": 300,
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定落點半徑 300 wc3u 的一次小級範圍傷害。

**微調／補強要求**：短起手落點電擊對應基礎版。

**特效**：`fx.prim.lightning.nova`，tint [138,196,255]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜肢曲

**目標上傳描述**：短距離側移並留下殘像；只有有效迴避才觸發後續反擊資源。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 50,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：需貼地肢曲殘像與有效閃避事件。

**特效**：`fx.prim.lightning.arc`，tint [138,196,255]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜電光石火

**目標上傳描述**：持續消耗電力提高移動速度，關閉或電力耗盡時停止。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速。

**微調／補強要求**：目前固定 3 秒加速；需開關及持續扣電。

**特效**：`fx.prim.lightning.pulse`，tint [138,196,255]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜神速・疾風迅雷

**目標上傳描述**：短期開啟自動反應：符合距離與攻擊條件時進行有限次反擊，每次消耗電力且有觸發間隔。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        },
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：as +20%、極小級移速。

**微調／補強要求**：目前攻速／移速；需受攻擊條件自動反應、限次扣電及循環防止。

**特效**：`fx.prim.lightning.pulse`，tint [138,196,255]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔充電釋放〕

**目標上傳描述**：消耗剩餘電力進行近身爆發，之後進入低電力狀態。

**套用模板**：`tpl-ground-nova`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-ground-nova",
    "inheritDefaults": true,
    "params": {
      "radius": 300,
      "damage": {
        "damageTier": "中",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定落點半徑 300 wc3u 的一次中級範圍傷害。

**微調／補強要求**：固定傷害；需消耗剩餘電力與低電力狀態。

**特效**：`fx.prim.lightning.nova`，tint [138,196,255]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

區分有效迴避、攻擊落空與無敵免傷；反擊不得再次觸發自己的反擊，充電與消耗須可重播。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | ground | 1 | [90] | [576] | 6 | 0.1 |

機制補強條目：M01、M07，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 25｜一拳超人：社群上傳內容與套用設定

英雄檔：`projects/25.hero-project.json`  
工作流資料：`recipes/25.upload-recipe.json`

作品：《一拳超人》  
角色實體：埼玉；保留「一拳超人」顯示名稱。  
定位：高辨識單擊、長起手、傷害上限。

出身：狂戰；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":25,"agi":23,"int":12,"strGrowth":2.36,"agiGrowth":2.17,"intGrowth":1.18}`

屬性覆寫：`{"ms":"中","mr":"小","armor":"中","maxHealth":"大","maxMana":"小","ad":"大","ap":"小","as":"中","healthRegen":"大","manaRegen":"小","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：白拳壓、黃色衣色識別、認真一拳前安靜蓄勢後單次強衝擊。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔興趣使然的英雄〕

**目標上傳描述**：一段時間未攻擊後，下一次普通拳獲得有限強化。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需未攻擊時間與下一拳一次消耗。

**特效**：`fx.prim.ki.pulse-sm`，tint [255,209,89]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜普通拳

**目標上傳描述**：短距離單次重拳。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：普通拳仍走標準傷害。

**特效**：`fx.prim.ki.slash`，tint [255,209,89]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜連續普通拳

**目標上傳描述**：多段拳擊，整招使用固定傷害預算。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 5,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：5 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：需要整招總傷害預算；目前每段各自級距。

**特效**：`fx.prim.ki.slash`，tint [255,209,89]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔趕上特賣〕

**目標上傳描述**：直線快速移動，碰撞後停止。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 450,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 450 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：碰撞安全需場景驗收。

**特效**：`fx.prim.ki.slash`，tint [255,209,89]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜認真系列・認真一拳

**目標上傳描述**：長起手後的高傷害衝擊波，具有明顯方向與閃避窗口。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "極大"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：四段衝擊波不等於單拳總結算；需高單擊預算與較長起手。

**特效**：`fx.prim.ki.beam`，tint [255,209,89]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜認真系列・認真反覆橫跳

**目標上傳描述**：短期快速左右移動並產生殘像，提供有限迴避機會。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速。

**微調／補強要求**：目前移速增益；需左右連續側移與有限次有效迴避。

**特效**：`fx.prim.ki.pulse`，tint [255,209,89]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

認真一拳仍經過護盾、減傷與保命結算；驗證高傷害溢位、碰撞與多段觸發，保留「一拳」演出而不直接刪除敵人。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | targeted | 4 | [45,45,45,45] | [144,144,144,144] | 3 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| R | skillshot | 3 | [90,90,90] | [576,576,576] | 8 | 1 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M02、M07、M11，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 26｜名偵探柯南：社群上傳內容與套用設定

英雄檔：`projects/26.hero-project.json`  
工作流資料：`recipes/26.upload-recipe.json`

作品：《名偵探柯南》  
角色實體：江戶川柯南；保留指定顯示名稱。  
定位：情報標記、可喚醒控制、道具射擊。

出身：射手；定位：marksman；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":13,"agi":29,"int":18,"strGrowth":1.25,"agiGrowth":2.78,"intGrowth":1.67}`

屬性覆寫：`{"ms":"中","mr":"小","armor":"小","maxHealth":"小","maxMana":"中","ad":"大","ap":"小","as":"大","healthRegen":"小","manaRegen":"中","range":"大"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：足球白線、麻醉針微光、藍色滑板尾跡、放大鏡標記；不用黑客式資訊揭露。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔線索整理〕

**目標上傳描述**：對已觀察敵人收集最多三條線索，每種有效戰鬥事件只計一次。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需觀察線索、事件類型去重與三層上限。

**特效**：`fx.prim.physical.pulse-sm`，tint [77,148,237]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜足球射擊

**目標上傳描述**：以腳力增強鞋踢出足球，依射線與碰撞命中。

**套用模板**：`tpl-traveling-wave`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-traveling-wave",
    "inheritDefaults": true,
    "params": {
      "stepSize": 100,
      "stepCount": 4,
      "stepIntervalSec": 0.12,
      "aoePerStep": 100,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：四段沿直線推進的波，每 0.12 秒向前 100 wc3u；各段獨立區域傷害。

**微調／補強要求**：需足球單彈碰撞與腳踢動作。

**特效**：`fx.prim.physical.bolt`，tint [77,148,237]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜手錶型麻醉槍

**目標上傳描述**：單發針造成短暫睡眠；目標受到後續傷害時提前醒來。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "stun",
        "duration": 0.7,
        "applyTo": "target",
        "stun": true
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"stun","duration":0.7,"applyTo":"target","stun":true}]。

**微調／補強要求**：0.7 秒暈眩只是底稿；需受傷可喚醒的睡眠及針彈碰撞。

**特效**：`fx.prim.physical.slash`，tint [77,148,237]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜渦輪引擎滑板

**目標上傳描述**：短期提高移動能力，急轉、碰撞與停止均有清楚狀態。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速。

**微調／補強要求**：僅 3 秒移速；需滑板加減速、急轉與碰撞狀態。

**特效**：`fx.prim.physical.pulse`，tint [77,148,237]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔真相只有一個〕

**目標上傳描述**：消耗目標線索，揭示其當前位置並施加短效弱點標記；不揭露對決外或未授權資訊。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "slow30",
        "duration": 2,
        "applyTo": "target",
        "moveSpeedMult": 0.7
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":2,"applyTo":"target","moveSpeedMult":0.7}]。

**微調／補強要求**：目前緩速；需消耗線索、弱點標記及合法位置揭示。

**特效**：`fx.prim.physical.slash`，tint [77,148,237]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜伸縮吊帶

**目標上傳描述**：連接合法目標或錨點，完成一次有限拉動；超距與碰撞時中止。

**套用模板**：`tpl-pull-throw`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-pull-throw",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "grabMode": "dragToCaster",
      "throwMode": "distance",
      "apexHeight": 1.2,
      "durationSec": 0.45,
      "throwDistance": 120,
      "landRadius": 2,
      "landDamageTier": "小",
      "landApRatio": 0,
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：拖拉指定目標後向前投擲 120 wc3u，0.45 秒拋物線，落地半徑 2 GGD 單位小級傷害。

**微調／補強要求**：需吊帶錨點分支與有限拉動，不應預設摔投。

**特效**：`fx.prim.physical.arc`，tint [77,148,237]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

麻醉是受擊可解除的睡眠；驗證彈藥／冷卻、滑板碰撞、線索去重與資訊權限，不能讀取玩家私密資料來「推理」。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 8 | 0.1 |
| W | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| R | targeted | 3 | [45,45,45] | [576,576,576] | 4.5 | 0.5 |
| EX | ground | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M06、M07、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 27｜庫洛魔法使：社群上傳內容與套用設定

英雄檔：`projects/27.hero-project.json`  
工作流資料：`recipes/27.upload-recipe.json`

作品：《庫洛魔法使》  
角色實體：木之本櫻；採庫洛牌篇能力意象。  
定位：固定牌組、技能替換、短期武裝。

出身：軟輔；定位：fighter；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":21,"agi":20,"int":19,"strGrowth":1.99,"agiGrowth":1.89,"intGrowth":1.83}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"大","ad":"小","ap":"中","as":"小","healthRegen":"中","manaRegen":"大","range":"中"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：粉金牌框、綠風、葉枝束縛、羽翼與細劍；各牌圖示跟真實狀態同步。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔卡牌連結〕

**目標上傳描述**：依序使用不同卡牌累積連結，上限三層，強化下一次護盾。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需不同牌序列三層與護盾消耗。

**特效**：`fx.prim.wind.pulse-sm`，tint [255,161,199]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜風牌

**目標上傳描述**：以風束攻擊並推動目標。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。

**微調／補強要求**：風束推動缺 knockback；目前單體魔法。

**特效**：`fx.prim.wind.slash`，tint [255,161,199]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜盾牌

**目標上傳描述**：為自己或指定友軍提供護盾。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-27-20260907.w.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-27-20260907.w.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目前自身；需友軍選取。

**特效**：`fx.prim.wind.pulse`，tint [255,161,199]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜翔牌

**目標上傳描述**：短期飛行位移，具有合法落點與高度限制。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 220,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：有限落點飛躍可預覽；翔牌武器姿態待補。

**特效**：`fx.prim.wind.arc`，tint [255,161,199]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜劍牌

**目標上傳描述**：短期將法杖化為劍，替換普攻並強化近戰。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 4,
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        },
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "大",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：自身取得 4 秒增益：ad +15%、as +20%。

**微調／補強要求**：AD／攻速强化不等於劍牌；需普攻替換、武器及還原。

**特效**：`fx.prim.wind.pulse`，tint [255,161,199]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔換牌：風與樹〕

**目標上傳描述**：將 Q 在風牌推動與樹牌束縛之間切換；兩者共享 Q 的冷卻與資源。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "root",
        "duration": 0.7,
        "applyTo": "target",
        "root": true
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"root","duration":0.7,"applyTo":"target","root":true}]。

**微調／補強要求**：目前固定樹牌鎖足；需風／樹 Q 版本切換，共享冷卻。

**特效**：`fx.prim.wind.slash`，tint [255,161,199]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

牌面、圖示與實際技能同步；驗證切換中的施法、共用冷卻、劍牌結束，以及飛行不穿越對決邊界。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 8 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 8 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 8 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M05、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 28｜艾莉絲·伯雷亞斯·格雷拉特：社群上傳內容與套用設定

英雄檔：`projects/28.hero-project.json`  
工作流資料：`recipes/28.upload-recipe.json`

作品：《無職轉生》  
採用：接受劍之聖地訓練後的劍士版本。  
定位：先手、重斬、近身追擊。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：紅髮色輪廓、白銀重斬、光之太刀單道細亮線；避免螢幕全白。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔劍神流・先發制人〕

**目標上傳描述**：對剛進入交鋒的目標，首次近戰命中獲得有限強化；同一目標有冷卻。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需對剛交鋒目標的首次命中及每目標冷卻。

**特效**：`fx.prim.physical.pulse-sm`，tint [232,82,51]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔猛進斬〕

**目標上傳描述**：向前踏步斬擊。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 180,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 180 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：短踏步可以預覽；需武器斬擊時點。

**特效**：`fx.prim.physical.slash`，tint [232,82,51]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔鬥氣護身〕

**目標上傳描述**：短時間提高承傷能力，無法無限疊加。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-28-20260907.w.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-28-20260907.w.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：有限承傷對應基礎版。

**特效**：`fx.prim.physical.pulse`，tint [232,82,51]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔逼近步〕

**目標上傳描述**：短距離接近，保留可被攔截的路徑。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 250,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：此模板附帶傷害推移，需審查逼近步是否保留這項改編。

**特效**：`fx.prim.physical.slash`，tint [232,82,51]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜光之太刀

**目標上傳描述**：有明確起手的高速直線斬擊，命中後停在合法位置。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 450,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：向指定方向突進 450 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：需較長起手、高速單段斬及命中停點。

**特效**：`fx.prim.physical.slash`，tint [232,82,51]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔狂劍追擊〕

**目標上傳描述**：對剛被自己擊中的近身目標進行一次額外追擊，超距時不能使用。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：需剛被自身命中的目標條件與追擊窗口。

**特效**：`fx.prim.physical.slash`，tint [232,82,51]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

光速意象轉為有限距離與可見起手；驗證先手判定、追擊窗口、突進碰撞與高攻速下的動作完整性。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 4.5 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M11，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 29｜芙莉蓮：社群上傳內容與套用設定

英雄檔：`projects/29.hero-project.json`  
工作流資料：`recipes/29.upload-recipe.json`

作品：《葬送的芙莉蓮》  
定位：魔法射擊、防壁、魔力資訊、生活魔法改編。

出身：法師；定位：mage；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":13,"agi":18,"int":29,"strGrowth":1.25,"agiGrowth":1.67,"intGrowth":2.78}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"小","maxHealth":"小","maxMana":"大","ad":"小","ap":"大","as":"小","healthRegen":"小","manaRegen":"大","range":"大"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：淡金 Zoltraak、青白六角防壁、柔色花田；不把其他角色專屬魔法填入。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜魔力抑制

**目標上傳描述**：降低敵方魔力感知類技能取得的強度資訊；不等同隱形，也不隱藏基本敵我識別。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需魔力感知的資訊層抑制，不可用隱形或傷害被動冒充。

**特效**：`fx.prim.arcane.pulse-sm`，tint [209,222,166]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜一般攻擊魔法・Zoltraak

**目標上傳描述**：直線魔法射擊。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：Zoltraak 原型；需單束碰撞去重。

**特效**：`fx.prim.arcane.beam`，tint [209,222,166]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜防禦魔法

**目標上傳描述**：展開方向明確的防壁，消耗資源抵擋有限傷害。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-29-20260907.w.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-29-20260907.w.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目前無方向盾；需六角防壁方向、耐久與持續消耗。

**特效**：`fx.prim.arcane.pulse`，tint [209,222,166]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜飛行魔法

**目標上傳描述**：短距離浮空移動。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 250,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：短期浮空可用落點跳躍預覽，不提供持續飛行。

**特效**：`fx.prim.arcane.arc`，tint [209,222,166]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔葬送連射〕

**目標上傳描述**：依序射出多方向魔法束，每束有獨立射線及整招總傷害上限。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 6,
      "intervalSec": 0.35,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：在指定區域依序落下 6 發；每發間隔 0.35 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：目前定點六波；需各方向獨立射線及總傷害上限。

**特效**：`fx.prim.arcane.nova`，tint [209,222,166]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜變出花田的魔法

**目標上傳描述**：生成短期花田；GGD 改編效果為友軍首次進入時解除恐懼並取得小額護盾。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-29-20260907.ex.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-29-20260907.ex.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目前自身盾；需花田區域、友軍首次進入解除恐懼及一次護盾。

**特效**：`fx.prim.arcane.pulse`，tint [209,222,166]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

區分外觀魔力量、真實資源與可見性；防壁需處理方向及耐久。花田的戰鬥效果明列為 GGD 改編，不借用其他角色專屬魔法。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 30｜尼古貓貓：社群上傳內容與套用設定

英雄檔：`projects/30.hero-project.json`  
工作流資料：`recipes/30.upload-recipe.json`

作品識別：《ヤニねこ／尼古喵喵》  
角色實體：佐藤ヤニ子；保留「尼古貓貓」顯示名稱。  
定位：日常喜劇角色轉譯、區域干擾。  
註：以下戰鬥技能全部為 GGD 創編。

出身：法師；定位：mage；攻擊：ranged。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":13,"agi":18,"int":29,"strGrowth":1.25,"agiGrowth":1.67,"intGrowth":2.78}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"小","maxHealth":"小","maxMana":"大","ad":"小","ap":"大","as":"小","healthRegen":"小","manaRegen":"大","range":"大"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：灰煙低透明、雜物卡通輪廓、紅色驚慌符號；技能全部為 GGD 日常惡搞改編。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔拖延症〕

**目標上傳描述**：停止移動後逐步累積拖延，上限三層；受擊時清空，施法可消耗強化。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需靜止三層拖延、受擊清除與施法消耗。

**特效**：`fx.prim.sound.pulse-sm`，tint [166,158,150]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔菸灰缸飛過去〕

**目標上傳描述**：投擲道具，落地造成一次小範圍傷害。

**套用模板**：`tpl-ground-nova`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-ground-nova",
    "inheritDefaults": true,
    "params": {
      "radius": 300,
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.4
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定落點半徑 300 wc3u 的一次小級範圍傷害。

**微調／補強要求**：菸灰缸道具拋物線未綁；落地一次傷害可測。

**特效**：`fx.prim.sound.nova`，tint [166,158,150]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔煙霧瀰漫〕

**目標上傳描述**：形成有期限的小型煙霧區，提供明示的命中干擾；不自動賦予完整隱形。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "slow30",
        "duration": 1.5,
        "applyTo": "target",
        "moveSpeedMult": 0.7
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1.5,"applyTo":"target","moveSpeedMult":0.7}]。

**微調／補強要求**：單體緩速不是煙霧區命中干擾；需區域及明示效果。

**特效**：`fx.prim.sound.pulse`，tint [166,158,150]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔先溜再說〕

**目標上傳描述**：短距離狼狽撤退，留下純視覺雜物殘影。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 250,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：撤退应無碰撞輸出，模板帶推移傷害，須審查改編。

**特效**：`fx.prim.sound.pulse`，tint [166,158,150]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔房間大崩壞〕

**目標上傳描述**：在指定區域分三波掉落卡通雜物，具有清楚落點預警。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 3,
      "intervalSec": 0.5,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：在指定區域依序落下 3 發；每發間隔 0.5 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：三波落點可測；卡通雜物模型與逐波預警待補。

**特效**：`fx.prim.sound.nova`，tint [166,158,150]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔今天真的不想動〕

**目標上傳描述**：消耗拖延層數，原地取得護盾；移動後提前結束。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 160,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-30-20260907.ex.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":160,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-30-20260907.ex.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需拖延消耗與移動取消盾。

**特效**：`fx.prim.sound.pulse`，tint [166,158,150]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

日常設定與 GGD 原創效果清楚分開；驗證煙霧資訊、場景道具併發、靜止蓄力與受擊清除，保留喜劇辨識度。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| R | ground | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M01、M11、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 31｜SUN樂：社群上傳內容與套用設定

英雄檔：`projects/31.hero-project.json`  
工作流資料：`recipes/31.upload-recipe.json`

作品：《香格里拉・開拓異境》  
角色實體：サンラク／陽務樂郎。  
定位：精準回避、反擊、短期強化。  
來源錨點：作者公開小說中的實際招式。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"大","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：鳥頭面具待製、青色滑步線、反擊橙色火花、螺旋短刃切線。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔糞作獵人的讀招〕

**目標上傳描述**：成功以位移避開有效攻擊後，獲得一層讀招，上限三層。單純空按移動不增加。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需真正閃避事件的三層讀招，空按不增加。

**特效**：`fx.prim.wind.pulse-sm`，tint [64,181,230]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜Spiral Edge

**目標上傳描述**：短劍螺旋刺擊；對剛被自己反擊的目標有有限追加效果。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：需螺旋刃動畫與反擊後目標追加條件。

**特效**：`fx.prim.wind.slash`，tint [64,181,230]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜Slide Move

**目標上傳描述**：滑步位移，提供很短的精準迴避窗口。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 40,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：模板低跳不是精準迴避；需傷害來臨時間窗口。

**特效**：`fx.prim.wind.arc`，tint [64,181,230]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜Repel Counter

**目標上傳描述**：短窗口迎擊攻擊，成功時擊退攻擊者，並提供一次 Q 接續機會。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-31-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-31-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：護盾不是 Repel Counter；需格擋成功、擊退與 Q 窗口。

**特效**：`fx.prim.wind.pulse`，tint [64,181,230]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜Accel

**目標上傳描述**：短期提高移速與近戰輸出能力，保留原本技能冷卻。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        },
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速、as +20%。

**微調／補強要求**：Accel 基礎移速／攻速增益；持續 3 秒且保留冷卻。

**特效**：`fx.prim.wind.pulse`，tint [64,181,230]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔攻略完成〕

**目標上傳描述**：消耗三層讀招，對近期交鋒目標進行一次有方向的高傷害短劍終結。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：需消耗三層讀招並限定近期交鋒目標。

**特效**：`fx.prim.wind.slash`，tint [64,181,230]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

精準迴避、格擋、反擊及擊退必須是不同事件；測試未受攻擊空按、範圍技、多段技與反擊窗口結束瞬間。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M07，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 32｜阿薩謝爾：社群上傳內容與套用設定

英雄檔：`projects/32.hero-project.json`  
工作流資料：`recipes/32.upload-recipe.json`

作品：《召喚惡魔／よんでますよ、アザゼルさん。》  
角色實體：アザゼル篤史。  
定位：負面能量、反噬、重複詛咒反轉、惡搞演出。

**查證紀錄**：

- 淫奔：角色的職能，官方動畫介紹可確認。
- 肩パンチ：招式辭典記載於第 34 話，使用者為阿薩謝爾。
- THE END OF SON：官方動畫採此拼法；辭典記載漫畫第 64 話出現。
- 闇ぱんち：辭典記載第 73 話，使用者為闇阿薩謝爾。
- 流精群（ホワイトレイン）：辭典記載第 160 話，使用者為阿薩謝爾。
- THE END OF SON FAINAL：辭典的終章條目原樣拼字，尚未核對漫畫原頁。
- 遊戲以 THE END OF SON〔終章〕顯示最後一項；「終章」是本稿區分標籤。
- ファイナルビッグベン 屬於貝西卜，不納入阿薩謝爾本人基本技能。

出身：法鬥；定位：mage；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":13,"int":29,"strGrowth":1.67,"agiGrowth":1.25,"intGrowth":2.78}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"中","ap":"大","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.sela`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：Q 普通一拳配誇張凝重起手；W 白色魔力雨；R 紫黑能量球；EX 反轉時敵人金光、施法者驚愕。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜淫奔

**目標上傳描述**：轉譯為「負面能量」資源。對敵人造成有效技能傷害時累積，最多三層，每次施法最多一層。自傷、反傷及持續傷害的每跳不重複增加。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級魔法傷害，內置冷卻 3 秒。

**微調／補強要求**：需每次有效施法一次負面能量，上限三；自傷反傷與每跳不得增加。

**特效**：`fx.prim.void.pulse-sm`，tint [125,43,150]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜肩パンチ

**目標上傳描述**：近距離肩膀拳，造成小幅擊退。演出重點是一本正經地使出很普通的一拳，保留喜劇落差。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：肩膀拳需小幅擊退与一本正經起手，当前只是單擊。

**特效**：`fx.prim.void.slash`，tint [125,43,150]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜流精群（ホワイトレイン）

**目標上傳描述**：指定區域落下三波白色魔力雨。每波對同一目標最多命中一次；以白色光點、漫畫速度線及誇張表情演出。

**套用模板**：`tpl-random-barrage`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-random-barrage",
    "inheritDefaults": true,
    "params": {
      "count": 3,
      "intervalSec": 0.45,
      "impactDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "magic",
      "impactRadius": 150,
      "scatterRadius": 120,
      "payout": "perImpact",
      "castTimeSec": 0.5
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：在指定區域依序落下 3 發；每發間隔 0.45 秒、半徑 150 wc3u、極小級傷害，可多次命中。

**微調／補強要求**：三波白色雨可作時序預覽；每波同目標一次與白點落下造型須驗收。

**特效**：`fx.prim.void.nova`，tint [247,247,255]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜闇ぱんち

**目標上傳描述**：短暫叫出闇人格的影子進入反擊窗口。受到第一個符合條件的近身攻擊後，影子向攻擊者出拳並消失。「闇人格向敵人反擊」為 GGD 改編，不改寫原作招式使用者。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-32-20260907.e.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-32-20260907.e.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：護盾不代表闇人格反擊；需第一個近身受擊成功事件及一次出拳。

**特效**：`fx.prim.void.pulse`，tint [125,43,150]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜THE END OF SON

**目標上傳描述**：舉起負面能量球，蓄力後投出。命中造成傷害，並施加四秒「萎靡」：降低目標輸出。成功放出時，阿薩謝爾承受有生命底線的少量反噬。施法被中斷時按 GGD 中斷規則處理，不產生完整命中效果。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。

**微調／補強要求**：需四秒萎靡的輸出降低，以及不致死反噬；目前只有可預覽的單體魔法命中。

**特效**：`fx.prim.void.slash`，tint [125,43,150]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜THE END OF SON〔終章〕

**目標上傳描述**：消耗三層負面能量，施放較集中的強化詛咒。未處於「萎靡」的目標受到傷害及較強、較短的輸出降低。已處於「萎靡」的目標移除原詛咒，改獲短暫的有限輸出增益，作為重複詛咒的反效果。因此 R→EX 可以實際觸發「本來想補刀，結果把對手弄強」的惡搞失誤。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。

**微調／補強要求**：需三層消耗及已萎靡目標反轉增益。R→EX 把敵人變強是必要驗收，不得刪成普通強化傷害。

**特效**：`fx.prim.void.slash`，tint [125,43,150]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

1. 原作招式名稱、使用者與 GGD 改編效果分欄保存。
2. E 的影子只反擊一次，反擊傷害不再觸發反擊。
3. R 反噬不自行觸發負面能量、吸血或無限保命循環。
4. R→EX 分別測試成功命中、R 被淨化、R 到期、控制免疫及同幀命中。
5. 反效果的友好增益必須在敵方 UI 顯示，不能只換特效。
6. 保留卡通魔力、失落表情、垂下的武器圖示等喜劇演出；不以角色身體部位作命中判定。
7. 終章名稱的來源拼字保留於註記，不宣稱 FAINAL 已經漫畫原頁核實。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | targeted | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | targeted | 1 | [45] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M07、M10，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,768,347 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 33｜近衛刀太：社群上傳內容與套用設定

英雄檔：`projects/33.hero-project.json`  
工作流資料：`recipes/33.upload-recipe.json`

作品：《UQ HOLDER!》  
採用：不死身與重力劍為核心的版本。  
定位：再生、武器重量、有限致死恢復。

出身：狂戰；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":25,"agi":23,"int":12,"strGrowth":2.36,"agiGrowth":2.17,"intGrowth":1.18}`

屬性覆寫：`{"ms":"中","mr":"小","armor":"中","maxHealth":"大","maxMana":"小","ad":"大","ap":"小","as":"中","healthRegen":"大","manaRegen":"小","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：暗紅再生細線、重劍深色厚軌、輕劍白色細軌；再起保留可辨識硬直。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔不死者再生〕

**目標上傳描述**：受到傷害後延遲恢復部分損失生命；再次受擊延後恢復，且有每段時間上限。

**套用模板**：`tpl-mark-stacks`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-mark-stacks",
    "inheritDefaults": true,
    "params": {
      "markId": "community-review-33-20260907.last-chance",
      "initial": 1,
      "max": 1,
      "durationSec": -1,
      "resetOn": "match",
      "perStackLost": [],
      "lethalMode": "save",
      "lethalConsume": 1,
      "surviveHpPct": 0.01,
      "internalCooldown": 1,
      "invulnerableSec": 0.5,
      "restoreHealthPct": 0.15,
      "aoeRadius": 0,
      "knockbackDistance": 0,
      "stunSec": 0
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：本場一層免死標記，首次致死消耗並回復 15% 生命，保護 0.5 秒。

**微調／補強要求**：本場被動免死只是基底；需受傷延後再生与 R 短期再起资格，不能無條件常駐代替。

**特效**：`fx.prim.blood.pulse-sm`，tint [214,46,64]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔重力劍・橫掃〕

**目標上傳描述**：使用重力劍進行扇形斬擊。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需重力劍扇形判定。

**特效**：`fx.prim.blood.pulse-sm`，tint [214,46,64]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔重量切換〕

**目標上傳描述**：在輕劍與重劍模式間切換：輕模式較快、重模式傷害較高且動作較慢。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：ad +15%。

**微調／補強要求**：固定 AD 增益；需輕／重模式、攻速與動作時長同步。

**特效**：`fx.prim.blood.pulse-sm`，tint [214,46,64]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔踏地突進〕

**目標上傳描述**：短距離接近並揮劍。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 250,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：近身突進可作基礎驗收。

**特效**：`fx.prim.blood.slash`，tint [214,46,64]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔不死者的再起〕

**目標上傳描述**：短時間準備再起；首次致死傷害被攔截，經明顯恢復動作後回復有限生命。每回合一次。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大",
    "effects": [
      {
        "kind": "heal",
        "amount": {
          "flat": 100,
          "ratios": []
        },
        "applyTo": "self"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":100,"ratios":[]},"applyTo":"self"}]。

**微調／補強要求**：目前立即回復；需主動再起窗口、首次致死截取與每回合一次。

**特效**：`fx.prim.blood.pulse-sm`，tint [214,46,64]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔重力劍・壓潰〕

**目標上傳描述**：固定為重劍模式的蓄力重擊，完成後短暫降低移速。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需固定重劍模式蓄力与完成後緩速。

**特效**：`fx.prim.blood.pulse-sm`，tint [214,46,64]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

測試極低生命、同幀多次致死、治療限制、再起中受控與重量切換；避免死亡獎勵、生命底線及復原事件重複。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | skillshot | 1 | [90] | [576] | 6 | 0.5 |

機制補強條目：M05、M09，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 34｜高速婆婆：社群上傳內容與套用設定

英雄檔：`projects/34.hero-project.json`  
工作流資料：`recipes/34.upload-recipe.json`

作品：《膽大黨》  
採用：高速婆婆本體的妖怪戰鬥意象。  
定位：高速追擊、轉向、有限詛咒。

出身：狂戰；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":25,"agi":23,"int":12,"strGrowth":2.36,"agiGrowth":2.17,"intGrowth":1.18}`

屬性覆寫：`{"ms":"大","mr":"小","armor":"中","maxHealth":"大","maxMana":"小","ad":"大","ap":"小","as":"中","healthRegen":"大","manaRegen":"小","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：紅黑風線、追獵咒紋、急轉地面擦痕；採妖怪本體，不用厄卡倫或招財貓。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔追上你了〕

**目標上傳描述**：持續追逐同一可見目標時累積速度，轉換目標、失去視線或停止追逐後衰退。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需同一可見目標追逐速度與轉目標衰退。

**特效**：`fx.prim.wind.pulse-sm`，tint [204,46,46]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔疾走爪擊〕

**目標上傳描述**：短距離突進爪擊。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 250,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 250 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：爪擊模型待製。

**特效**：`fx.prim.wind.slash`，tint [204,46,46]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔急轉彎〕

**目標上傳描述**：快速改變方向，降低當前加速層數以換取操作能力。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 30,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：需急轉向與消耗加速層，不能單純低跳。

**特效**：`fx.prim.wind.arc`，tint [204,46,46]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔妖怪的咒印〕

**目標上傳描述**：標記一個可見敵人，使自己朝其移動時獲得有限加速。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "magic",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "applyStatus",
        "statusId": "slow30",
        "duration": 1.5,
        "applyTo": "target",
        "moveSpeedMult": 0.7
      }
    ]
  }
}
```

**目前模板行為**：指定單一敵人造成小級魔法傷害。 附加效果：[{"kind":"applyStatus","statusId":"slow30","duration":1.5,"applyTo":"target","moveSpeedMult":0.7}]。

**微調／補強要求**：緩速只是底稿；需追獵目標標記與朝向加速。

**特效**：`fx.prim.wind.slash`，tint [204,46,46]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔全速追獵〕

**目標上傳描述**：短期提升速度上限與轉向能力，期間仍須通過碰撞檢查。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速。

**微調／補強要求**：3 秒移速增益；需上限与轉向能力独立参数。

**特效**：`fx.prim.wind.pulse`，tint [204,46,46]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔百公里衝撞〕

**目標上傳描述**：蓄勢後沿長直線衝撞，命中第一名英雄或障礙物時停止。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 500,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 500 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：需命中第一英雄或牆即停止，不能穿越後繼續連撞。

**特效**：`fx.prim.wind.slash`，tint [204,46,46]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

測試高速穿牆、轉角、目標死亡及追擊超距；區分高速婆婆、招財貓容器與厄卡倫的能力持有狀態。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| R | self | 3 | [45,45,45] | [576,576,576] | 6 | 0.5 |
| EX | ground | 1 | [90] | [576] | 4.5 | 0.1 |

機制補強條目：M01、M06，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 35｜炭治郎：社群上傳內容與套用設定

英雄檔：`projects/35.hero-project.json`  
工作流資料：`recipes/35.upload-recipe.json`

作品：《鬼滅之刃》  
採用：能使用水之呼吸與火之神神樂的版本。  
定位：呼吸姿態、資源消耗、刀技方向。

出身：鬥士；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":18,"agi":29,"int":13,"strGrowth":1.67,"agiGrowth":2.78,"intGrowth":1.25}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"中","maxHealth":"中","maxMana":"中","ad":"大","ap":"小","as":"中","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：青藍水弧、圓舞橘紅火帶；水火只演出，不生永久地形。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔嗅覺・破綻辨識〕

**目標上傳描述**：成功閃過敵人攻擊後，短暫顯示該敵人的近身破綻；下一次刀技命中消耗。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需有效閃避後近身破綻標記與下一刀消耗。

**特效**：`fx.prim.ice.pulse-sm`，tint [64,191,217]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜水之呼吸・水面斬

**目標上傳描述**：前方橫斬，適合穩定輸出。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需水面斬前方橫弧，目前四段直線。

**特效**：`fx.prim.ice.beam`，tint [64,191,217]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜水之呼吸・水車

**目標上傳描述**：旋轉斬擊並進行短距離位移。

**套用模板**：`tpl-leap-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-leap-strike",
    "inheritDefaults": true,
    "params": {
      "mode": "toPoint",
      "applyTo": "self",
      "apexHeight": 220,
      "durationSec": 0.5,
      "landRadius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：朝落點進行 0.5 秒跳躍，著地小範圍極小級傷害。

**微調／補強要求**：需水車旋轉斬与武器動作。

**特效**：`fx.prim.ice.pulse-sm`，tint [64,191,217]，錨點 point。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔呼吸調整〕

**目標上傳描述**：短暫調息恢復呼吸資源，移動或受擊會降低恢復效率。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "restore",
        "manaPct": 0.15,
        "applyTo": "self"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"restore","manaPct":0.15,"applyTo":"self"}]。

**微調／補強要求**：標準魔力回復 15%；需呼吸資源、調息中移動受傷降效率。

**特效**：`fx.prim.ice.pulse-sm`，tint [64,191,217]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜火之神神樂・圓舞

**目標上傳描述**：明顯蓄勢後的高傷害斬擊，消耗較多呼吸資源。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需火之神單次高傷斬與呼吸高消耗。

**特效**：`fx.prim.fire.beam`，tint [64,191,217]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔呼吸切換〕

**目標上傳描述**：讓 Q 在水面斬與火之神神樂的強化斬版本間切換。共用 Q 冷卻；火之神版本消耗較高並增加自身負擔。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ad",
          "op": "pctAdd",
          "value": 0.15
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：ad +15%。

**微調／補強要求**：固定 AD 增益不是切換；需水／火 Q 版本、共用冷卻与負擔。

**特效**：`fx.prim.ice.pulse-sm`，tint [64,191,217]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

姿態切換保留冷卻及資源；驗證嗅覺標記的可見性、呼吸不足與高負擔狀態。水火演出不自動生成永久水域或燃燒地形。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | skillshot | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M01、M05、M07，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 36｜鬼畜王蘭斯：社群上傳內容與套用設定

英雄檔：`projects/36.hero-project.json`  
工作流資料：`recipes/36.upload-recipe.json`

作品：《鬼畜王蘭斯／Rance》  
角色實體：蘭斯；與鬼眼狂刀 KYO 無關。  
定位：近戰爆發、有限成長、隊伍衝鋒。

出身：狂戰；定位：fighter；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":25,"agi":23,"int":12,"strGrowth":2.36,"agiGrowth":2.17,"intGrowth":1.18}`

屬性覆寫：`{"ms":"中","mr":"小","armor":"中","maxHealth":"大","maxMana":"小","ad":"大","ap":"小","as":"中","healthRegen":"大","manaRegen":"小","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：綠色勇猛光、厚重白斬、漫畫喊招；不導入成人情節或其他人的招式。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔自信過剩〕

**目標上傳描述**：參與擊殺獲得當回合戰意，上限五層，提升有限近戰能力。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需擊殺／助攻一次戰意，上限五層、回合重置。

**特效**：`fx.prim.physical.pulse-sm`，tint [64,184,74]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔蠻力斬擊〕

**目標上傳描述**：大開大合的正面斬擊。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需正面蠻力弧形斬。

**特效**：`fx.prim.physical.beam`，tint [64,184,74]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔本大爺還沒認真〕

**目標上傳描述**：短暫蓄勢取得護盾，下一次主動攻擊消耗護盾換取有限增傷。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-36-20260907.w.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-36-20260907.w.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：需下一次主動攻擊消耗剩餘盾換取有限增傷。

**特效**：`fx.prim.physical.pulse`，tint [64,184,74]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔霸王突進〕

**目標上傳描述**：直線衝鋒，命中後停止。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 350,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 350 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：需命中第一人後停止。

**特效**：`fx.prim.physical.slash`，tint [64,184,74]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜Rance Attack／蘭斯攻擊

**目標上傳描述**：蓄力後的大範圍重斬，保留喊招與誇張爆發。

**套用模板**：`tpl-line-sweep`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-line-sweep",
    "inheritDefaults": true,
    "params": {
      "segmentCount": 4,
      "stepSize": 100,
      "segmentAoe": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.35
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：向前依序展開四個窄區域判定，各段極小級傷害；交疊段可重複命中。

**微調／補強要求**：需大範圍重斬、長起手與總傷害預算。

**特效**：`fx.prim.physical.beam`，tint [64,184,74]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔跟著本大爺衝〕

**目標上傳描述**：消耗戰意，為附近友軍提供短效移速與一次普攻強化。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [
        {
          "stat": "ms",
          "op": "pctAdd",
          "msBonusTier": "極小"
        },
        {
          "stat": "as",
          "op": "pctAdd",
          "value": 0.2
        }
      ],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：自身取得 3 秒增益：極小級移速、as +20%。

**微調／補強要求**：目前自身加速攻速；需戰意消耗及附近友軍一次普攻增益。

**特效**：`fx.prim.physical.pulse`，tint [64,184,74]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

檢查戰意上限、助攻去重、護盾轉換及群體增益；角色辨識放在戰鬥、性格與演出，技能定義不混用其他作品人物。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | skillshot | 4 | [45,45,45,45] | [144,144,144,144] | 6 | 0.1 |
| W | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| E | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| R | skillshot | 3 | [90,90,90] | [576,576,576] | 6 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M01、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



---

## 37｜吉伊卡哇：社群上傳內容與套用設定

英雄檔：`projects/37.hero-project.json`  
工作流資料：`recipes/37.upload-recipe.json`

作品：《吉伊卡哇》  
採用：吉伊卡哇本人。  
定位：膽怯與勇氣、短兵器、小型角色可讀性。  
註：以下名稱與戰鬥效果為 GGD 創編。

出身：硬輔；定位：tank；攻擊：melee。三圍由 GGD 自動生成，屬性只用級距微調。

三圍／成長預覽：`{"str":25,"agi":12,"int":23,"strGrowth":2.36,"agiGrowth":1.18,"intGrowth":2.17}`

屬性覆寫：`{"ms":"中","mr":"中","armor":"大","maxHealth":"大","maxMana":"中","ad":"中","ap":"小","as":"小","healthRegen":"中","manaRegen":"中","range":"小"}`

模型：`champ.thorne`（GGD 代理）；六狀態：idle/run/attack/cast/hurt/death。

演出方向：奶白輪廓、淡橘討伐叉線、星形勇氣提示、小點心回復光。

模型與圖示為已出貨代理，專屬武器／角色動作待製。音效採 generic-cast。以下每槽的原設計仍是功能審查目標。

### PASSIVE｜〔雖然害怕還是努力〕

**目標上傳描述**：附近友軍交戰時累積勇氣，上限三層；以時間間隔累積，避免多段傷害快速疊滿。

**套用模板**：`tpl-on-attack`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-on-attack",
    "inheritDefaults": true,
    "params": {
      "event": "onBasicAttack",
      "condition": {
        "kind": "chance",
        "p": 1
      },
      "bonusDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "internalCooldown": 3
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json"
  }
}
```

**目前模板行為**：普攻追加極小級物理傷害，內置冷卻 3 秒。

**微調／補強要求**：需附近友軍交战依時間累積勇氣，上限三層。

**特效**：`fx.prim.holy.pulse-sm`，tint [255,201,156]，錨點 target。被動不掛 cast-only 演出；正確事件歸屬待補。

**動作**：以真實觸發事件驅動提示，不新增假施法。

### Q｜〔討伐叉刺擊〕

**目標上傳描述**：短距離刺擊，武器判定與外觀一致。

**套用模板**：`tpl-single-strike`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-single-strike",
    "inheritDefaults": true,
    "params": {
      "damage": {
        "damageTier": "小",
        "ratios": []
      },
      "damageType": "physical",
      "castTimeSec": 0.2
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：指定單一敵人造成小級物理傷害。

**微調／補強要求**：討伐叉造型與近身命中對齊待製。

**特效**：`fx.prim.holy.slash`，tint [255,201,156]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### W｜〔哇啊啊撤退〕

**目標上傳描述**：朝指定方向短距離逃跑，消耗一層勇氣可取得小護盾。

**套用模板**：`tpl-charge-push`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-charge-push",
    "inheritDefaults": true,
    "params": {
      "dashDistance": 220,
      "dashDurationSec": 0.3,
      "apexHeight": 0,
      "radius": 150,
      "damage": {
        "damageTier": "極小",
        "ratios": []
      },
      "damageType": "physical",
      "pushDistance": 200,
      "pushSpeed": 872,
      "pushFrom": "facing",
      "pushLaunchHeight": 0,
      "castTimeSec": 0.1
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "小",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小"
  }
}
```

**目前模板行為**：向指定方向突進 220 wc3u，造成極小級碰撞範圍傷害與推移。

**微調／補強要求**：需無傷害撤退並可扣勇氣換小盾；目前衝撞模板不等價。

**特效**：`fx.prim.holy.slash`，tint [255,201,156]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### E｜〔點心時間〕

**目標上傳描述**：短暫停留恢復少量生命，受擊中斷。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 4。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "小",
    "manaCostTier": "小",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "heal",
        "amount": {
          "flat": 70,
          "ratios": []
        },
        "applyTo": "self"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"heal","amount":{"flat":70,"ratios":[]},"applyTo":"self"}]。

**微調／補強要求**：需停留吃點心及受擊中斷。

**特效**：`fx.prim.holy.pulse`，tint [255,201,156]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### R｜〔鼓起勇氣討伐〕

**目標上傳描述**：消耗勇氣發動數次叉擊，層數決定有限的強化幅度。

**套用模板**：`tpl-lock-combo`；衝突策略 reject；最高等級 3。

```json
{
  "template": {
    "ref": "tpl-lock-combo",
    "inheritDefaults": true,
    "params": {
      "hitCount": 3,
      "hitIntervalSec": 0.18,
      "perHitDamage": {
        "damageTier": "極小",
        "ratios": []
      },
      "finisherDamage": {
        "damageTier": "小",
        "ratios": []
      },
      "finisherRadius": 150,
      "damageType": "physical",
      "lockTarget": "none",
      "casterGuard": "none",
      "trigger": "onCast"
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "極小",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "大"
  }
}
```

**目前模板行為**：3 段連擊，間隔 0.18 秒；各段極小級、末段小級，不附帶鎖足或施法者無敵。

**微調／補強要求**：固定三段；需勇氣消耗与有限強化幅度。

**特效**：`fx.prim.holy.slash`，tint [255,201,156]，錨點 target。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### EX｜〔一起加油〕

**目標上傳描述**：為附近友軍提供護盾與短效抗恐懼，自己也獲得相同效果。

**套用模板**：`tpl-buff-self`；衝突策略 reject；最高等級 1。

```json
{
  "template": {
    "ref": "tpl-buff-self",
    "inheritDefaults": true,
    "params": {
      "duration": 3,
      "modifiers": [],
      "castTimeSec": 0.15
    }
  },
  "abilityOverrides": {
    "provenance": "editor-json",
    "rangeTier": "中",
    "cooldownTier": "大",
    "manaCostTier": "大",
    "castTimeTier": "小",
    "effects": [
      {
        "kind": "shield",
        "amount": {
          "flat": 120,
          "ratios": []
        },
        "duration": 3,
        "absorbs": "all",
        "stackKey": "community-review-37-20260907.ex.guard",
        "onExisting": "keepLarger"
      }
    ]
  }
}
```

**目前模板行為**：自身取得 3 秒增益：無屬性加成；另結算下列護盾／回復等 effects。 附加效果：[{"kind":"shield","amount":{"flat":120,"ratios":[]},"duration":3,"absorbs":"all","stackKey":"community-review-37-20260907.ex.guard","onExisting":"keepLarger"}]。

**微調／補強要求**：目前自身；需附近友軍盾與短效抗恐懼。

**特效**：`fx.prim.holy.pulse`，tint [255,201,156]，錨點 self。castStart 小光圈，castEffect 主效果；完整 script 在英雄檔。

**動作**：現有 cast clip；attack/hurt/death 沿用角色狀態；專屬動作按原設計製作。

### 整體審查

小型模型仍要有公平且清楚的受擊範圍；驗證勇氣產生、恐懼解除與撤退方向，避免將小八台詞或兔兔招式當成本人的原作招式。

本地證據：schema passed；compiler passed；kit accepted；ZIP passed。

原設計機制、畫面、多人與社群審核尚未驗收。

### 本次編譯後的實際值

以下是正式規則解析結果，優先於編輯輸入中的秒數預設值。template 的 castTimeSec 也可能被 castTimeTier 正規化覆寫，不能只讀模板參數猜最後生效時間。

| 槽位 | 施放 | 等級 | 冷卻（秒） | 魔力 | 射程 | 起手（秒） |
| --- | --- | --- | --- | --- | --- | --- |
| PASSIVE | self | 1 | [0] | [0] | 0 | 0 |
| Q | targeted | 4 | [15,15,15,15] | [144,144,144,144] | 4.5 | 0.1 |
| W | ground | 4 | [45,45,45,45] | [144,144,144,144] | 4.5 | 0.1 |
| E | self | 4 | [15,15,15,15] | [144,144,144,144] | 6 | 0.1 |
| R | targeted | 3 | [90,90,90] | [576,576,576] | 3 | 0.5 |
| EX | self | 1 | [45] | [576] | 6 | 0.1 |

機制補強條目：M01、M12，詳見「機制補強與驗收.md」。

資產包含 97 個實際資產，1,769,117 bytes。雜湊與大小保存在本英雄 upload-recipe.json 的 assets.manifest；不是外部模型下載連結。



# 來源與查證界線

### 七、公開查證來源

以下連結支持相應的角色識別、原作能力或官方衍生招式；不代表本稿的 GGD 數值、資源與技能組合來自原作。

| 對象 | 來源與層級 | 本稿用途 |
| --- | --- | --- |
| 阿薩謝爾 | [BS11 官方動畫介紹](https://www.bs11.jp/anime/z-1/) | 淫奔職能、THE END OF SON 名稱、闇人格情節 |
| 阿薩謝爾 | [民間漫畫招式辭典](https://hissatuwaza.kill.jp/setume/azazerusan.htm) | 肩パンチ、流精群、闇ぱんち、終章條目及章回索引；非漫畫原頁驗證 |
| 阿薩謝爾 | [RENOTE 作品整理](https://renote.net/articles/9040) | 重複詛咒產生反效果的二手整理參考 |
| SUN樂 | [作者公開小說第 29 篇](https://ncode.syosetu.com/n6169dz/29/) | Spiral Edge、Slide Move、Repel Counter、Accel 的實際使用 |
| SUN樂 | [漫畫官方角色介紹](https://comic.shangrilafrontier.com/character/sanraku/) | サンラク／陽務樂郎身分及遊戲經驗 |
| 八神庵、不知火舞 | [SNK 官方 KOF XV 技名表](https://www.snk-corp.co.jp/sesp/img/fankit/technique.pdf) | 招式名稱及歸屬 |
| 武藤遊戲 | [Bandai Namco 官方 JUMP FORCE 介紹](https://en.bandainamcoent.eu/jump-force/news/iconic-yu-gi-oh-cards-revealed-jump-force-character-yugi-muto) | 黑魔導、黑魔導女孩、天空龍在官方衍生戰鬥中的運用 |
| 卡比 | [任天堂官方大亂鬥角色介紹](https://www.smashbros.com/wii/en_uk/characters/kirby.html) | 吸入與複製能力的官方衍生遊戲參考 |
| 洛克人 | [任天堂官方大亂鬥角色介紹](https://www.smashbros.com/en_AU/fighter/46.html) | 初代洛克人的官方衍生遊戲識別 |
| 奇犽 | [官方 NEN×IMPACT 角色介紹](https://hunterhunter-ni.bushiroad.com/character/killua/) | 神速與高速近戰意象 |
| 赫蘿 | [原作官方角色介紹](https://spicy-wolf.com/original/character.html) | 賢狼、豐收與行商話術的角色錨點 |
| 利姆路 | [Bandai Namco 官方角色介紹](https://ten-sura-t.bn-ent.net/character/) | 大賢者與捕食者 |
| 朝田詩乃 | [Aniplex 官方消息](https://www.aniplex.co.jp/lineup/swordartonline/news/detail/?id=29056) | Hecate II 與詩乃的武器歸屬 |
| 殺老師 | [《暗殺教室》官方角色介紹](https://www.ansatsu-anime.com/2014-2016/character/chara/chara_1.php) | 高速移動與觸手 |
| 伊莉雅 | [官方動畫故事介紹](https://anime.prisma-illya.jp/1st//story/) | Prisma Illya 版本與紅寶石之星 |
| 伊莉雅 | [TMdict 資料集轉錄](https://www.tmdict.com/ja/sa.servant-card) | 限定展開與夢幻召喚的區分；資料集轉錄來源 |
| 御坂美琴 | [SEGA 官方角色介紹](https://climax.sega.jp/1st/character01_03.html) | 超電磁砲、電擊使與戰鬥運用 |
| 菜月昴 | [原作官方故事介紹](https://re-zero.com/story/) | 死亡回歸的原作概念；個人回復限制為 GGD 改編 |
| 柯南 | [讀賣電視台官方道具介紹](https://www.ytv.co.jp/conan/item/) | 麻醉槍、腳力增強鞋、滑板、吊帶等道具 |
| 艾莉絲 | [官方修行篇介紹](https://mushokutensei.jp/news/260619_01/) | 劍神流聖地修行版本 |
| 芙莉蓮 | [官方魔法介紹](https://frieren-anime.jp/special/magic/) | 魔法名詞對照；列表包含其他人物的魔法，不將整頁視為芙莉蓮個人技能表 |
| 尼古貓貓 | [《ヤニねこ》官方介紹](https://yanineko-anime.com/) | 佐藤ヤニ子與日常角色設定；戰鬥技能為 GGD 原創 |
| 高速婆婆 | [《膽大黨》官方角色介紹](https://anime-dandadan.com/character/) | 高速婆婆、招財貓與厄卡倫的角色區分 |
| 炭治郎 | [官方《火之神血風譚 2》角色介紹](https://game.kimetsu.com/hinokami2/character/?chara=5) | 同時使用水之呼吸與火之神神樂的版本 |
| 蘭斯 | [AliceSoft 官方《鬼畜王蘭斯》說明](https://www.alicesoft.com/support/kichiku-rance.html) | Rance Attack 招式存在與作品歸屬 |
| 吉伊卡哇 | [官方動畫角色介紹](https://www.anime-chiikawa.jp/chara.html) | 吉伊卡哇本人的性格與討伐生活 |


## 原作與招式來源補充

日期：2026-09-07。原始設計稿末尾的公開來源表一併收入總交接文件。以下補足角色身分來源與查證界線；**角色介紹並不等於該角色每一個招式都已逐頁核對漫畫**。222 槽的數值、冷卻、資源、機制限制與 VFX 設定都是 GGD 改編。

### 阿薩謝爾：明確保留經典名稱與反效果

- 官方播出介紹確有第 10 話 **THE END OF SON**，並描述阿薩謝爾的究極奧義；第 13 話說明與另一個自己對峙。正式顯示拼法以此為據。[BS11 官方節目介紹](https://www.bs11.jp/anime/z-1/)
- 民間招式辭典的作品索引列出肩パンチ、闇ぱんち、流精群（ホワイトレイン）、THE END OF SON 及 THE END OF SON FAINAL。它是二手整理；`FAINAL` 保留為來源拼字，不能改稱漫畫原頁已證實。本次詳細頁重新開啟失敗，不能把索引頁當成章回原頁。[招式辭典作品索引](https://hissatuwaza.kill.jp/list/yo.htm)、[詳細條目](https://hissatuwaza.kill.jp/setume/azazerusan.htm)
- 重複受到 THE END OF SON 後，敵人因副作用變強，二手剧情整理有記載。GGD 因此設計 R→EX 的「萎靡轉增益」分支；來源不提供本包的 4 秒、15%、2 秒、10% 等遊戲數值。[RENOTE 劇情整理](https://renote.net/articles/9040)
- `ファイナルビッグベン` 歸貝西卜，不挪作阿薩謝爾招式。[同一劇情整理](https://renote.net/articles/9040)
- 原設計稿中的第 34／64／73／160 話是先前二手辭典索引紀錄，**不是本次查閱漫畫原頁的證據**；工作流不得將這些數字標為「漫畫原頁已核實」。

### 補充角色與版本識別來源

| 對象 | 來源 | 可支持的範圍與限制 |
| --- | --- | --- |
| 空條承太郎 | [JOJO 官方角色頁](https://jojo-portal.com/en/anime/sc/character/01/)、[官方 ASBR 角色頁](https://jojoasbr.bn-ent.net/character/character.php?chara=m7de25c6) | 白金之星、近距離拳擊及精密性；本包局部時停的計時器／佇列不是原作規則 |
| 米卡莎 | [光榮特庫摩官方角色頁](https://www.gamecity.ne.jp/shingeki2/finalbattle/data-chara/c02.html) | 米卡莎・阿卡曼身分；氣體／刀刃等 GGD 有界設定為改編 |
| 魯路修 | [官方 Geass 世界設定](https://geass.jp/first/world_06.html) | 經眼睛作用的絕對服從能力；本包只強制合法移動的限制是 GGD 設計 |
| 衛宮士郎、吉爾伽美什 | [Aniplex UBW 官方故事](https://www.aniplex.co.jp/lineup/fate-sn-ubw/story/?p=2) | UBW 路線角色與對決；不借此證明所有宝具譯名或 GGD 技能效果 |
| 比利海靈頓 | [Good Smile 官方 figma 介紹](https://www.goodsmile.info/ja/product/2338/figma%2B%E3%83%93%E3%83%AA%E3%83%BC%2B%E3%83%98%E3%83%AA%E3%83%B3%E3%83%88%E3%83%B3.html) | 網路兄貴／摔角迷因形象；六槽名稱與戰鬥規則皆為 GGD 創編 |
| 安茲·烏爾·恭 | [OVERLORD 官方角色頁](https://overlord-anime.com/_season1/character.html?c=6) | 飛鼠／安茲的角色身分；招式逐字、處決與倒數細節未逐頁核對小說 |
| 鹿目圓 | [魔法少女小圓官方角色頁](https://www.madoka-magica.com/tv/youtube-streaming/character/) | 鹿目圓角色身分；友軍護盾、一次免死為 GGD 改編，不是官方技能表 |
| 坂田銀時 | [官方電影角色頁](https://wwws.warnerbros.co.jp/gintamamovie/character/) | 銀時及作品角色；本包招式名以〔〕標記 GGD 創編 |
| 一拳超人 | [官方動畫角色頁](https://onepunchman-anime.net/character/) | 角色實體埼玉及英雄背景；有限傷害、冷卻與反制是 GGD 改編 |
| 庫洛魔法使 | [官方《小櫻新聞》第一號](https://ccsakura-official.com/core_sys/images/main/cont/special/paper/vol01.pdf) | 木之本櫻、庫洛牌篇角色身分；雙版本 Q 與共用冷卻是 GGD 設計 |
| 近衛刀太 | [UQ HOLDER! 官方角色頁](https://uqholder.jp/character/)、[講談社作品頁](https://www.kodansha.co.jp/titles/1000006525) | 刀太與作品識別；主動保命窗口／回合限制為 GGD 改編 |
| 桐谷和人 EX | [SAOP 民間技能條目](https://w.atwiki.jp/saop/pages/1321.html)、[SAO Arcade 民間攻略條目](https://w.atwiki.jp/saoac/pages/113.html) | The Eclipse／ジ・イクリプス的 27 次連擊有二手整理；本次未獲原小說頁面，故不標原頁核實 |

### 工作流來源欄位

來源至少分為：官方角色／作品、原作者公開正文、官方衍生遊戲、民間資料轉錄、GGD 原創。技能名稱可以保留原作常用名，但「控制時間」「造成什麼 debuff」「資源上限」「動畫 clip」不得因此標成原作事實。

沒有逐頁確證的名字或版本差異，可以保留為帶來源狀態的候選；不能自動升級為「全部原作招式核實」。商店人氣、作品累積熱度和使用者選定名單不同，本包不捏造 37 人的熱門度排名。

