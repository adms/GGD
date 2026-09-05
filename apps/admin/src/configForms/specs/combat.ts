/**
 * 設定文件的**標籤資料**（爽度特效・血腥・護盾/格擋/暴擊・傷害規則・傷口/虛弱・冷卻規則）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigControllerSchemeDoc,
  zConfigOneShotClampDoc,
  zConfigGoreDoc,
  // 爽度特效（GH#494）—— 金幣吸回 · 連段音階 · 施法餘燼壽命。
  zConfigFeelFxDoc,
  zConfigBlockDoc,
  zConfigCritDoc,
  zConfigCooldownRulesDoc,
  zConfigWoundsDoc,
  zConfigWeaknessDoc,
  zConfigDamageRulesDoc,
  zConfigApDamageScalingDoc,
  zConfigShieldDoc,
} from "@ggd/shared/content";
// ⛔ AP 傷害加成的出貨值與上界也只有一份 —— 這一頁的每一個乘數例子都從它算，
// ⛔ 不抄字面值（owner 調 rate 的那一天，說明會自己跟著變）。
import {
  AP_DAMAGE_RATE_MAX,
  DEFAULT_AP_DAMAGE_SCALING,
} from "@ggd/shared/sim/combat/apDamageScaling";
import type { ConfigDocSpec } from "../engine";
// ───────────────────────────────────────────── 爽度特效 (config/feel-fx) ───

export const FEEL_FX_SPEC: ConfigDocSpec<"feelFx"> = {
  page: "feelFx",
  collection: "config",
  docId: "feel-fx",
  schemaTag: "config.feel-fx@1",
  zod: zConfigFeelFxDoc,
  title: "爽度特效",
  intro: [
    "殭屍死掉之後掉出來的那一枚小金幣：躺在屍體上停一下，然後沿著一條會加速的弧線飛回擊殺者身上，落袋時「叮」一聲；連續擊殺時那一聲會逐段升高音階（到頂就停住，不會刺耳）。owner 的原話是「提高爽度 模仿肉鴿遊戲的氛圍感」。",
    "⛔ 這一頁沒有一格會改變任何人拿到的金幣。擊殺賞金是伺服器發的，早在金幣畫出來之前就已經進了口袋；這裡調的只是「那一刻看得到、聽得到什麼」。把總開關關掉，玩家拿到的錢一毛不差，只是不畫也不響。",
    "最後一區是施法光柱腳邊那圈往上飄的餘燼 —— owner 2026-08-21：「特效存活時間真的太長了，請你砍半，不需要後半段飄到天空」。三格要一起看：只砍壽命會讓粒子在半空中被剪掉（看起來像破圖），所以上升的力道與阻力也要讓它在壽命結束之前自己停住。",
    "蓄力集氣（GH#788）—— owner 2026-08-27：「所有吟唱時間超過0.3秒以上都要有蓄力特效（粒子特效從外往身體內縮多道小光束像集氣一樣如圖但顏色是隊伍顏色光芒）」。吟唱夠長的每一次施放，多道細光束從四周向施法者身體內縮，顏色是那位施法者的隊色（從連線資料的隊伍編號解析，不分敵我陣營寫死）。它與施法光柱疊在一起但職責不同：光柱說「還有多久」，集氣說「正在蓄力」。",
  ],
  consumer:
    "apps/client/src/vfx/feelFx.ts 的 feelFx() → GoldPickupFx（掉落/停留/貝茲飛行/落袋音效）與 castPillar.ts 的 moteSpec()（施法上升餘燼）；castCharge 由 apps/client/src/vfx/CastChargeFx.ts 的 readCastCharge() 讀（施法窗口的集氣光束）",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時載內容覆蓋層）。⛔ 不必重開一場，但已經在飛的金幣會用它出發時的那一份設定飛完。",
  fields: [
    {
      path: "goldPickup.enabled",
      zh: "金幣吸取特效總開關",
      note: "關掉＝殭屍死了不畫金幣、不播落袋音效。⭐ 玩家拿到的錢**一毛不差**（賞金是伺服器發的，跟這一層無關），所以這是純粹的止血閥：畫面太吵、手機掉幀、或這個特效出了任何問題時，關它就回到這個功能存在之前。",
    },
    {
      path: "goldPickup.hoverSeconds",
      zh: "金幣落地後停留幾秒",
      note: "金幣掉在屍體上、開始飛之前先在原地閃多久。owner 指定 1 秒。調小＝錢一掉就被吸走，節奏更快但看不清楚掉了幾枚；調大＝戰場上會同時躺著更多枚金幣，更有肉鴿味但也更亂。",
    },
    {
      path: "goldPickup.flightSeconds",
      zh: "金幣飛回來要幾秒",
      note: "從起飛到沒入英雄身體的時間，也就是「吸力」有多強。短＝啪一下就進口袋（爽，但幾乎看不到軌跡）；長＝看得清楚它繞過來，但太長會讓「殭屍死掉」和「拿到獎勵」在感覺上斷開。",
    },
    {
      path: "goldPickup.easePower",
      zh: "飛行加速力道",
      note: "owner 特別點名要「加速」而不是等速直線。1＝等速（回到他不要的那個）；越大越像被磁鐵吸走 —— 起步慢慢飄、末段暴衝進身體。這一格只管步調，弧彎多少是下面那格。",
    },
    {
      path: "goldPickup.arcHeight",
      zh: "飛行弧線抬多高",
      note: "貝茲曲線的控制點往上抬幾個世界單位。0＝退化成直線（同樣是 owner 不要的那個）；越大拋得越高、弧越誇張。太大金幣會飛出畫面上緣再掉回來。抬高而不是往側邊偏，是因為戰鬥相機固定 68 度俯角，側偏在螢幕上幾乎看不出來。",
    },
    {
      path: "goldPickup.maxConcurrent",
      zh: "同時最多幾枚在飛",
      note: "超過的直接算成已經吸走（不畫那一段軌跡）。⭐ 這是畫面預算，**不是掉落上限**，更不是金錢上限 —— 被略過的那幾枚，錢一樣早就到手了。",
    },
    {
      path: "goldPickup.sfxThrottleMs",
      zh: "落袋音效最短間隔（毫秒）",
      note: "兩聲「叮」之間至少隔多久。一次範圍技掃掉一排殭屍時，這一格決定你聽到的是清脆的幾聲還是一團糊掉的噪音。⛔ 被擋掉的那幾發是**不播**，不是排隊等一下再播（排隊只會把噪音往後挪）。0＝完全不節流。",
    },
    {
      path: "goldPickup.sfxVolume",
      zh: "落袋音效音量倍率",
      note: "乘在這個音效自己的音量上。owner 要的字是「**輕**」—— 一場幾十隻殭屍，開太大就會蓋掉技能聲與打擊聲。0＝靜音（金幣照飛）。",
    },
    {
      path: "comboPitch.enabled",
      zh: "連段音階總開關",
      note: "關掉＝每一枚金幣都用同一個音高。⭐ 連擊本身照樣算、HUD 上的連殺數字照樣顯示，只是聽不出高低 —— 這一格碰不到任何機制。",
    },
    {
      path: "comboPitch.semitonesPerStep",
      zh: "每連一段升幾個半音",
      note: "1＝半音階（candy crush 那種一階一階爬上去的感覺，出貨值）；2＝全音階，更明顯但很快就到頂。0＝等於關掉。",
    },
    {
      path: "comboPitch.maxSteps",
      zh: "最多升到第幾段",
      note: "⭐ 這一格就是「不刺耳」的保證：升到這一段之後就停住，再連下去也不會更高。12 段 × 1 半音＝剛好一個八度。調更大會越來越尖，過了某個點聽起來就只是壞掉。",
    },
    {
      path: "comboPitch.resetAfterSeconds",
      zh: "多久沒擊殺就把音階歸零（秒）",
      note: "⚠️ 這是**聲音**的記憶，和畫面上那個連殺數字是兩件事（那個由伺服器用 5 秒視窗決定）。出貨值刻意設成一樣，所以耳朵和眼睛預設是同步的；設小＝音階更容易回到起點，設大＝聲音會記得比畫面久。",
    },
    {
      path: "castMotes.lifetimeMinSec",
      zh: "施法餘燼最短壽命（秒）",
      note: "施法光柱腳邊那圈往上飄的粒子活多久。owner 2026-08-21 要求「砍半」，所以出貨值是原本的一半。⚠️ 只調這兩格會讓粒子在還往上衝的時候被剪掉（看起來像破圖）—— 要一起看下面的重力與阻力。",
    },
    {
      path: "castMotes.lifetimeMaxSec",
      zh: "施法餘燼最長壽命（秒）",
      note: "同上的另一端。調大＝回到「一路飄到天空」的舊畫面，那正是 owner 說「太長了」的那個。",
    },
    {
      path: "castMotes.gravityY",
      zh: "施法餘燼往上的力道",
      note: "全遊戲唯一一處重力是往上的地方 —— 它就是「飄到天空」那個動作本身。越大爬得越高越久；0＝粒子原地擴散不上升，光柱會失去「能量被吸進去」的讀法。",
    },
    {
      path: "castMotes.drag",
      zh: "施法餘燼空氣阻力",
      note: "每秒保留幾成速度。越小煞得越快 —— ⭐ 這是讓上升在「還看得見的時候」自己停住的那一格，也就是不靠壽命硬切掉粒子的正解。1＝完全不減速（衝上天）。",
    },
    {
      path: "castCharge.enabled",
      zh: "蓄力集氣總開關",
      note: "關掉＝吟唱時完全不畫集氣光束，逐位元回到 GH#788 之前。⭐ 施法光柱、吟唱條、技能本身一格都不動 —— 這一層純粹是演出，碰不到任何機制，所以這是一鍵 rollback 的止血閥。",
    },
    {
      path: "castCharge.minCastSec",
      zh: "吟唱幾秒以上才配集氣（秒）",
      note: "owner 指定的門檻（出貨 {{出貨值}}）。⚠️ 量的是吟唱規則頁（floor/cap/倍率）夾完之後的**最終**吟唱窗口，不是技能文件裡的原始值 —— 所以全域把吟唱調快之後，剛好掉到門檻以下的技能會自動失去集氣。0＝每一次有吟唱的施放都畫。",
    },
    {
      path: "castCharge.beamCount",
      zh: "同時幾道光束在內縮",
      note: "越多越像參考圖那種滿天集氣，也越吃畫面預算。⭐ 畫質自動降級（AdaptiveQuality）會按比例少畫幾道，這一格是**滿畫質**時的上限；不足此數的部分永遠不會分配網格，所以調小也是省資源的一格。",
    },
    {
      path: "castCharge.convergeSec",
      zh: "一道光束飛進身體要幾秒",
      note: "內縮速度的倒數：調小＝吸得更急、磁鐵感更強；調大＝緩慢匯聚。光束到達身體那一刻被吸收並在外圈重生，整段吟唱連續循環 —— 所以短吟唱至少看得到一輪，長吟唱是持續的能量流。",
    },
    {
      path: "castCharge.beamLength",
      zh: "一道光束的長度（世界單位）",
      note: "越長越像「光的線」被抽進身體，越短越像一群光點。光束在接近身體時會自己縮短（被吸收的讀法），這一格是它剛出生時的長度。",
    },
    {
      path: "castCharge.brightness",
      zh: "集氣亮度倍率",
      note: "乘在加法混合的透明度上。0＝看不見（循環還在跑 —— 要真正關掉請用總開關）；上限被夾在轉為不透明之前，所以再亮也蓋不住施法者本體，受害者永遠讀得出是誰在施法。與施法光柱視覺打架時，先把這格調亮、光柱那頁調暗。",
    },
    {
      path: "castCharge.startRadius",
      zh: "光束從離身體多遠開始（世界單位）",
      note: "外圈半徑：光束出生的距離。調大＝集氣範圍更壯觀、但單道光束在畫面上的速度感更快；調小＝貼身的緊湊蓄力。⚠️ 它只是演出半徑，跟技能的施法距離、命中範圍完全無關。",
    },
    {
      path: "impactSmokeLifeScale",
      zh: "命中煙的尾巴長度倍率",
      note: "1＝出貨（輕擊 0.3 秒收乾淨、重擊與 EX 保留約 0.6 秒）。⭐ 它是**乘在分級上**的倍率，⛔ 不是一個絕對秒數 —— 寫成絕對值會把三檔壓成一檔，而「輕重分得出來」正是這一批要的東西。調大＝尾巴更久更黏、畫面更髒；調小＝收得乾淨但打擊感變薄。",
    },
    {
      path: "impactDebris.enabled",
      zh: "命中/死亡噴體素碎塊",
      note: "⭐ **這是 GH#725 AC⑤ 的 rollback 開關**。開著＝打中的時候噴出會被重力拉下去的方塊。⚠️ ⭐ 它與火花是**兩件事**：火花是**光**（additive、亮、瞬間），碎塊是**物質**（standard blend、落地、看得出是方的）—— ⛔ 把它調成 additive 就只是多一層火花，那是這一層存在的反面。⭐ 顆數**跟著打擊重量走**（乘上該 tier 的火花數比例）⛔ 不是每一擊都噴同樣多。",
    },
    {
      path: "impactDebris.count",
      zh: "碎塊顆數（重擊基準）",
      note: "heavy 級噴幾顆；其他 tier 按火花數比例縮放。⚠️ 調太大在多人混戰時是**粒子預算**的問題，⛔ 不只是視覺。",
    },
    {
      path: "impactDebris.lifeSec",
      zh: "碎塊活多久（秒）",
      note: "⚠️ 太長會讓地上一直有東西在跳，而那會吃掉「剛剛發生了什麼」這個訊息。",
    },
    {
      path: "impactDebris.size",
      zh: "碎塊多大（世界單位）",
      note: "⭐ 要看得出**是方的**，這一層才成立 —— 太小就跟火花分不出來，等於白噴一層粒子；太大會蓋住命中點本身，讓玩家看不到自己打中了哪裡。",
    },
    {
      path: "impactDebris.speed",
      zh: "碎塊噴多快",
      note: "初速。⚠️ 重力固定 -9.8，所以速度同時決定飛多遠與滯空多久。",
    },
    {

      path: "exDim.enabled",
      zh: "EX 施放時畫面壓暗總開關",
      note: "關掉＝只剩推鏡、沒有壓暗，逐位元回到這個功能存在之前。⭐ 這是一鍵 rollback 的止血閥：壓暗是純演出層，碰不到任何機制。",
    },
    {
      path: "exDim.peakAlpha",
      zh: "最暗那一刻的黑幕不透明度",
      note: "0＝完全不暗。⚠️ 調太高會把 EX 自己的特效一起蓋掉 —— 這一層的用意是讓 EX 跳出來，⛔ 不是讓畫面變黑。",
    },
    {
      path: "exDim.saturate",
      zh: "去飽和強度",
      note: "0＝不動顏色，1＝全灰。⭐ 這一格才是讓 EX 的顏色「跳出來」的主力：周圍褪色而技能本身不褪。壓暗（上一格）負責亮度，這一格負責彩度，兩者獨立。",
    },
    {
      path: "exDim.durationMs",
      zh: "壓暗整段持續幾毫秒",
      note: "出貨值**逐字等於**推鏡的時長（EX_PUNCH_MS）。⚠️ 兩者不一致時，壓暗會比推鏡早收或晚收，而那在畫面上看起來像**掉幀**，⛔ 不像演出。要改就連推鏡一起想。",
    },
    {
      path: "cooldownPredict.enabled",
      zh: "冷卻圈按下當幀就起轉",
      note: "關掉＝回到「等一趟 RTT、伺服器回來才起轉」的今天。⭐ 這一格只影響**你自己畫面上的圈**，⛔ 不影響任何實際冷卻 —— 權威快照一到就以權威為準。",
    },
    {
      path: "cooldownPredict.graceMs",
      zh: "預測最多先轉幾毫秒",
      note: "超過這個時間權威還沒回來，圈就回到未起轉的樣子（避免斷線時圈一直在轉而技能其實還能按）。⛔⛔ 它只能**提前**起轉，永遠不會**延長**冷卻 —— 那會變成一個玩家看得到、伺服器不知情的作弊面。",
      },
      {
        path: "orderFeedback.enabled",
        zh: "🖱 右鍵指令按下當下的回饋（總開關）",
        note: "owner 2026-07-29：「點右鍵攻擊會讓目標物**閃紅圈圈** 並且玩家角色發出**攻擊語音**；取消...等其他動作也是播對應音效」。⭐ 關掉＝逐位元回到「按下去什麼都不發生」的今天。⚠️ 在這一格出現以前，`GameApp` 的三個 `onOrder` 呼叫點**都是直通** `setOrder` —— 零個回饋呼叫，而目標環那一套 decal 早就存在、只有**手把**那條路在用。⭐ 本地零延遲播放（你自己的指令，⛔ 不等伺服器）。",
      },
      {
        path: "orderFeedback.ring",
        zh: "🖱 指令當下目標腳下閃一圈",
        note: "複用瞄準/範圍那一套地面環（⛔ 不是新做一層）。⭐ 只有**指定目標**的指令會閃 —— 右鍵地面／A 鍵點地不閃（那時候還沒有目標）。關掉＝只留聲音。",
      },
      {
        path: "orderFeedback.voice",
        zh: "🖱 指令當下的音效（攻擊/移動/停止/取消）",
        note: "選**既有**語音池，⛔ 不錄新的。⭐ 右鍵地面**也會出聲** —— ⚠️ 沉默與「按鍵沒吃到」在玩家手上長得一模一樣。⭐ A 鍵點地播的是**移動**音，⛔ 不是攻擊音：那時候他還沒有指定目標，攻擊音會讓他以為鎖到人了。關掉＝只留紅圈。",
      },
  ],
  preserved: [],
};

// ──────────────────────────────────────────────────── 濺血 (config/gore) ───

export const GORE_SPEC: ConfigDocSpec<"gore"> = {
  page: "gore",
  collection: "config",
  docId: "gore",
  schemaTag: "config.gore@1",
  zod: zConfigGoreDoc,
  title: "濺血程度",
  intro: [
    "名單上皮卡丘、初音跟死亡騎士、鋼彈站在一起，所以「打中會噴多少血」是調性決定而不是技術決定 —— 家裡有人在旁邊看的時候，這一頁是那個開關。",
    "玩家自己的畫面設定是一道**地板**：這裡設 blood，玩家仍然可以自己選 stylized 或 off；反過來，玩家選了 off 之後這一頁**加不回去**。",
  ],
  consumer: "apps/client/src/vfx/goreConfig.ts 的 applyGoreDoc()（由 ContentDb.load 呼叫）→ goreConfig() → 濺血特效層",
  effect: "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時套用）。",
  fields: [
    {
      path: "style",
      zh: "濺血樣式",
      note: "blood＝紅色血滴＋噴霧＋會淡掉的地面血漬；stylized＝同樣方向的噴濺但畫成依傷害屬性上色的能量爆，沒有紅色也沒有地面血漬；off＝這一層完全不噴（打擊感的火花／碎屑不受影響，所以還是打得出手感）。",
      optionLabels: { blood: "blood 紅血", stylized: "stylized 能量爆", off: "off 完全不噴" },
    },
    {
      path: "intensity",
      zh: "濺血強度",
      note: "同時縮放血滴數量、血滴大小與地面血漬的不透明度。0＝這一層等於關掉；1＝最誇張。出貨值 {{出貨值}} 是「明顯但不到搞笑」的那一點。",
    },
  ],
  preserved: [
    {
      path: "championStyles",
      why: "逐英雄的**降級**表（機械／不死／植物系的十位角色改噴火花或能量，不噴紅血）。這一頁不編輯它，但每次儲存都原封不動帶著走 —— 掉了的話那十位角色會從此開始噴紅血，而畫面上完全看不出來。",
    },
  ],
};

// ─────────────────────────────────────────────── 護盾規則 (config/shield) ──

export const SHIELD_SPEC: ConfigDocSpec<"shieldRules"> = {
  page: "shieldRules",
  collection: "config",
  docId: "shield",
  schemaTag: "config.shield@1",
  zod: zConfigShieldDoc,
  title: "護盾規則",
  intro: [
    "同一個角色身上同時掛著兩道以上的護盾時，一發傷害先花掉哪一道。場上真的會同時出現：破法對咒是**別人**幫你上的抗魔盾，守護之光／機警則是全類型的盾，兩者疊在同一個人身上是常態而不是例外。",
    "這一頁不改護盾的**數值**（吸收多少、持續幾秒寫在各自的技能文件裡，全域倍率在 戰鬥系統 的 shield 那一格），只改**消耗順序** —— 它決定同一波輸出打下去，對面還剩哪一種保護。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/shield.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/combat/damage.ts 的 absorbOrder()（每一發傷害封包都會呼叫，讀 world.shieldRules.absorbOrder）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.shieldRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。這份文件不在 content-bus 的三份即時文件裡（那三份是白名單／戰鬥系統／系統運維），它是 shard 開機載入內容樹時讀一次就定格 —— 和 基礎加成 同一個形態(#278)，寫成「下一場生效」會害操作者以為功能壞了。",
  fields: [
    {
      path: "absorbOrder",
      zh: "多盾同時在身上時的消耗順序",
      note: "決定「先打掉哪一種保護」。specificFirst 會先燒掉專用盾，所以泛用盾留到最後、對面的下一發不管什麼屬性都還擋得住；generalFirst 反過來，先把泛用盾清光，逼出只剩抗魔盾的空窗，讓物理輸出有一段真的打得進去的窗口；insertionOrder 完全不看屬性，先上的先花 —— 護盾**會過期**，通常先上的也先到期，所以這一格是「不要讓盾白白過期」的近似解。三種對防守方的總吸收量一樣，差別在對面能不能操作出破口，所以這是節奏設計不是強弱調整。",
      optionLabels: {
        specificFirst: "specificFirst 專用盾先花（出貨值＝改成欄位之前的行為）",
        generalFirst: "generalFirst 泛用盾先花（逼出抗魔盾空窗）",
        insertionOrder: "insertionOrder 不看屬性，先上的先花",
      },
    },
  ],
  preserved: [],
};


// ─────────────────────────────────────────────── 格擋規則 (config/block) ──

export const BLOCK_SPEC: ConfigDocSpec<"blockRules"> = {
  page: "blockRules",
  collection: "config",
  docId: "block",
  schemaTag: "config.block@1",
  zod: zConfigBlockDoc,
  title: "格擋規則",
  intro: [
    "同一個角色身上同時有兩件以上帶 [格擋] 的傳說武器時，它們怎麼疊。場上真的湊得出來：晨曦之光與殺豬刀都在傳說池裡、都不是唯一裝備，兩件都寫著「30%機率 抵擋致命一擊」。",
    "owner 2026-07-31 的裁決是「這種情形應該是**獨立判斷兩次**，拿第一次檔掉剩餘繼續算下一次」，所以出貨值是 independent —— 兩件 30% 合起來是 51%（1 − 0.7 × 0.7），不是 30%。",
    "⚠️ 這一頁**會改變平衡**，和 護盾規則 那一頁不同（那一頁的出貨值刻意等於改成欄位之前的行為）。舊行為保留成 best，切回去就是「只有最強的那一件會擋，整發只抽一次」。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/block.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/combat/block.ts 的 blockCutFor()（每一發傷害封包都會呼叫，讀 world.blockRules.stacking）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.blockRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 護盾規則／基礎加成 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格，寫成「下一場生效」會害操作者以為功能壞了。",
  fields: [
    {
      path: "stacking",
      zh: "多件格擋同時在身上時怎麼疊",
      note: "independent＝每一件各抽各的骰子，擋中的那一件從**剩下的**傷害裡扣掉自己的比例，再把剩下的交給下一件；兩件 30% 全額格擋 = 51% 擋得下來，而兩件「擋一半」都擋中就剩四分之一。best＝只有期望減傷（機率 × 比例）最高的那一件會參與，整發只抽一次，所以第二件格擋等於白帶。差別只在**同時帶兩件以上**的時候，帶一件的人兩種設定完全一樣。",
      optionLabels: {
        independent: "independent 各自獨立判定、剩餘往下傳（出貨值＝owner 裁決）",
        best: "best 只有最強的那一件會擋（改成欄位之前的行為）",
      },
    },
    {
      path: "chanceMult",
      zh: "格擋觸發率的系統倍率",
      note:
        "⭐ 每一件格擋的**機率**都乘上這一格（出貨 1.0 ＝ 逐位元同今天）。" +
        "⚠️ 它存在的理由是一次量測,⛔ 不是平衡想法:owner 回報過**兩次**「初號機 AT力場" +
        "格擋成功沒出現橘色光盾特效」,⭐ 而跑出貨鏈量到的是 **擋中時特效真的會發**。" +
        "⭐ 而他判斷「格擋成功」的依據（畫面上的 GUARD 字）**不是那一格擋的** —— " +
        "GUARD 只在**整發被吃光**時出現,而 AT力場只擋 50% ⇒ 最可能是那 10% 沒抽中。" +
        "⇒ ⭐ 調到 3（＝30%）就能在幾發之內自己驗證它出不出來,驗完調回 1。" +
        "⚠️ 上界 5:再高會把所有機率夾到 1（每一發都擋）—— 那不是旋鈕是開關。" +
        "⭐ 0 是合法的:那是「把格擋整族關掉」的除錯狀態。",
    },
  ],
  preserved: [],
};

// ───────────────────────────────────────────────── 暴擊規則 (config/crit) ──

export const CRIT_SPEC: ConfigDocSpec<"critRules"> = {
  page: "critRules",
  collection: "config",
  docId: "crit",
  schemaTag: "config.crit@1",
  zod: zConfigCritDoc,
  title: "暴擊規則",
  intro: [
    "一次攻擊上同時有**好幾條**暴擊時，它們怎麼合起來算。來源有兩種：英雄自己的暴擊率（屬性面板那一格），加上每一件裝備／每一張三選一卡片各自帶的暴擊（例：天堂之劍「6%機率造成10倍暴擊傷害」）。",
    "owner 2026-08-09 的裁決是「**每一條暴擊獨立算完傷害再帶入下一條**」，他自己舉的例子是：同時拿到「1%機率100倍」與「10%機率2倍」，會有三種結果 —— 兩條都中 100×2＝200 倍、只中第一條 100 倍、只中第二條 2 倍。所以出貨值是 multiply。",
    "⚠️ 這一頁**會改變平衡**，和 護盾規則 那一頁不同（那一頁的出貨值刻意等於改成欄位之前的行為）。舊行為保留成 max，切回去就是「只有期望值最高的那一條會算，整發只抽一次骰」—— 那個世界裡玩家的第二張暴擊卡是廢牌，撿到它畫面上什麼都不會變。",
    "⚠️ 改成獨立骰之後，一次攻擊抽幾次亂數變成「這個人身上有幾條暴擊」的函式，所以**同一顆種子的舊錄影會對不上**（owner 已接受：錄影只在同一個版本內有效）。「最多算幾條」那一格給了它一個上界，所以次數不是無限的。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/crit.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/combat/critStrike.ts 的 rollCritStrike()（每一次普攻的傷害點都會呼叫一次，近戰在 systems/BasicAttackSystem.ts、遠程同一處算好之後塞進投射物，讀 world.critRules）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.critRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 格擋規則／護盾規則／基礎加成 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格，寫成「下一場生效」會害操作者以為功能壞了。",
  fields: [
    {
      path: "stackMode",
      zh: "多條暴擊同時成立時怎麼合成",
      note: "multiply＝每一條各抽各的骰，抽中的把自己的倍率**乘**上去（1%×100倍 與 10%×2倍 都中 = 200 倍）；這是唯一一個讓第二張暴擊卡真的變強的選項，肉鴿三選一疊得起來就靠它。max＝只有期望增益（機率×倍率）最高的那一條會算，整發只抽一次骰，所以第二件暴擊裝完全白帶（這是 2026-08-09 之前的行為，連抽骰次數都一樣，切回去等於整條回滾）。add＝各抽各的骰但倍率**相加**（上面那個例子 = 102 倍），疊得起來但很快就被上限追上。差別只在**同時有兩條以上**的時候，只有一條暴擊的人三種設定完全一樣。",
      optionLabels: {
        multiply: "multiply 每條獨立骰、倍率相乘（出貨值＝owner 裁決）",
        max: "max 只取最高的那一條（2026-08-09 之前的行為）",
        add: "add 每條獨立骰、倍率相加",
      },
    },
    {
      path: "maxTotalMult",
      zh: "一次攻擊的總倍率上限",
      note: "合成完之後夾在這個數字（出貨 {{出貨值}}，owner 指定）。⚠️ 夾的是**總倍率**不是逐條：owner 例子裡那個 100×2＝200 在出貨設定下會被夾回 100，也就是說第二條暴擊在那個極端組合下確實吃不到 —— 這是刻意的，multiply 沒有上限就是指數爆炸，五張暴擊卡疊起來一刀刪掉對手，遊戲就沒了。調小＝爆發封頂變低、後期靠疊暴擊的路線變弱；調大＝允許更誇張的一擊必殺 build。",
    },
    {
      path: "sourceCap",
      zh: "同一次攻擊最多算幾條暴擊來源",
      note: "身上暴擊來源超過這個數量時，只有**期望增益（機率×倍率）最高的前幾條**參與，其餘整條不算、連骰都不抽（出貨 {{出貨值}}，owner 指定）。丟掉的一定是最弱的那幾條，不是最晚買的 —— 所以剛買到的強力武器不會被上限吃掉。它同時是每一發攻擊的亂數預算上界，也就是「換一個版本之後錄影還能不能對得上」的那個界。⚠️ 它**不管英雄自己的暴擊率**（那是一條聚合屬性，永遠只有一條）；讓它算進來的話，把這一格填 1 會讓每一個堆了暴擊率的英雄完全吃不到暴擊武器，而畫面上看起來就是那把武器壞了。",
    },
  ],
  preserved: [],
};

export const DAMAGE_RULES_SPEC: ConfigDocSpec<"damageRules"> = {
  page: "damageRules",
  collection: "config",
  docId: "damage-rules",
  schemaTag: "config.damage-rules@1",
  zod: zConfigDamageRulesDoc,
  title: "傷害規則",
  intro: [
    "一份傷害效果**沒有寫**傷害型別時，遊戲要當它是哪一種。owner 2026-08-05：「技能傷害預設都改成 AP 傷害」。",
    "⚠️ **在這之前沒有預設** —— 傷害型別是必填的，忘了寫會在載入時被擋下來。現在忘了寫會**安靜地變成魔法傷害**，所以這一頁存在的意義就是讓那個「安靜」變成看得到、改得到的一格。",
    "⚠️ 這一格**只影響沒寫的那些**。已經明寫型別的技能（出貨的絕大多數都寫了）一支都不會被改到，所以在這裡改成物理不會把全樹翻過來。",
    "⚠️ 它**不是**「技能吃 AP 加成」。傷害型別決定吃護甲還是魔抗；數字多大是每個效果自己的係數（力量/敏捷/智慧/AD/AP）決定的，兩者互不影響 —— 一支「數字吃 AP、打出去是物理」的技能完全合法。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/damage-rules.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/effects/damage.ts（以及 damageArea.ts / damageLine.ts / dot.ts，共五個 `e.damageType ?? world.damageRules.defaultAbilityDamageType` 讀取點）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.damageRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 淨化規則／重創規則／格擋規則 同一個形態(#278)。",
  fields: [
    {
      path: "defaultAbilityDamageType",
      zh: "沒寫型別時當成哪一種傷害",
      note: "魔法＝吃目標的魔抗（出貨值，owner 2026-08-05 裁定）；物理＝吃護甲；真實＝什麼減免都不吃，血條直接掉。⚠️ 選「真實」要非常小心：那等於讓每一張忘記填型別的卡都變成無視防禦，而防禦裝在那一刻對它完全沒有用。",
      optionLabels: {
        physical: "物理（吃護甲）",
        magic: "魔法 / AP（吃魔抗，出貨值）",
        true: "真實（什麼都不吃）",
      },
    },
    {
      path: "oneShotPctOfMaxHp",
      zh: "「一擊秒人」的標記門檻（GH#658）",
      note: "owner 2026-08-24（GH#658）:「後台單次傷害排行榜（**另外標記該傷害是否一擊超過英雄目標 80% 生命傷害**）」。⭐ 這一格就是那個界線，寫成**比例**（八成 = 零點八，出貨 {{出貨值}}）。分子是一次施放打在**單一英雄**身上的最大一擊，分母是那個人**命中當下**的最大生命 —— ⛔ 不是榜上那一列的總傷害（AoE 的總傷害沒有落在任何一個人身上）。⛔ 它**不影響任何一場比賽**：傷害、結算、獎勵一格都不動，只決定「⚔️ 傷害排行榜」那一頁哪幾列標紅、以及「只看超標的」那個勾選框的界線。⚠️ 上界大於一是刻意的：溢傷（打出去比整條血還多）是一個真的、看得到的量。⚠️ 這一頁存檔寫的是耐久覆蓋層，排行榜那一頁讀的也是它，改完重新整理就生效（⛔ 不必重啟 shard）。",
    },
    {
      path: "abilitySelfDamageGuard",
      zh: "self 施放的傷害要說清楚打在誰身上（內容閘，GH#1019）",
      note: "⭐ `castType:self` 的技能，`damage` 效果沒明寫 `applyTo:self` 就會打在**施法者自己**身上（小傑 Q/W 曾是一顆自殺鍵，GH#1018）。開著（出貨 {{出貨值}}）＝ 內容閘 `selfCastDamageTargeting.test.ts` 會紅並逐支指名；關掉＝只印警告不擋（一鍵 rollback）。⛔ 它**不改任何一場比賽**：引擎不會替你把傷害移開（刻意自傷的天破壤碎照樣扣自己的血），只決定作者寫錯時有沒有東西紅。⚠️ 名字與預設值是我挑的（owner 2026-08-23「留後台開關可以簡易 rollback」），⛔ 不是 owner 的裁決。",
    },
  ],
  preserved: [],
};

export const AP_DAMAGE_SCALING_SPEC: ConfigDocSpec<"apDamageScaling"> = {
  page: "apDamageScaling",
  collection: "config",
  docId: "ap-damage-scaling",
  schemaTag: "config.ap-damage-scaling@1",
  zod: zConfigApDamageScalingDoc,
  title: "AP 傷害加成",
  intro: [
    "⭐ **這是調整「技能 vs 普攻」全域關係的唯一旋鈕。** owner 2026-08-21：「技能傷害都套用公式 (1+AP\\*1%)⋯物理意義來說 就是 **AP 變為原本傷害的額外加成**」「**=> 預設 0.5%**」。",
    `⭐ 公式是 **最終傷害 = 基礎傷害 × (1 + 法強 × 加成率)**。出貨 ${DEFAULT_AP_DAMAGE_SCALING.rate}（${+(DEFAULT_AP_DAMAGE_SCALING.rate * 100).toFixed(4)}%/點）⇒ 法強 100 的人技能打 **×${+(1 + 100 * DEFAULT_AP_DAMAGE_SCALING.rate).toFixed(3)}**、法強 200 打 **×${+(1 + 200 * DEFAULT_AP_DAMAGE_SCALING.rate).toFixed(3)}**、法強 300 打 **×${+(1 + 300 * DEFAULT_AP_DAMAGE_SCALING.rate).toFixed(3)}**。`,
    "⚠️ **動這一格等於同時動每一支技能。** 它掛在傷害佇列上（減傷之前、與全域傷害倍率同一層），⛔ 不是某一支技能的數值 —— 每一支技能、技能投射物、技能種下的持續傷害都走這一行。",
    "⭐ **加成率填 0 = 這一層整個不存在**（乘數恆為 1），也就是**一鍵 rollback** 回到這個欄位出現之前的每一場比賽。這是這一頁最重要的一句話：不確定就填 0，不會有任何殘留。",
    "⚠️ 它與「傷害規則」是兩件事：那一頁決定技能傷害**吃護甲還是魔抗**，這一頁決定**乘多少**。",
    "⚠️ **反彈不吃這一層**（不論範圍填什麼）—— 反彈的量是「剛剛打中我的那一下」的百分比，那個讀數已經吃過攻擊者的乘數；反彈者再乘一次自己的，反彈比例就不等於卡面寫的百分比了。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ap-damage-scaling.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/combat/apDamageScaling.ts::apDamageMult（唯一讀取點，由 combat/damage.ts 的傷害佇列排空迴圈每發封包呼叫一次）與 ::apRatiosSuppressed（effects/effectCommon.ts::casterDamageStats，五個傷害葉共用）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.apDamageScaling",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 傷害規則／重創規則／格擋規則 同一個形態(#278)。",
  fields: [
    {
      path: "rate",
      // ⛔ 這裡**不填** `max` —— Zod 已經給了上界（`AP_DAMAGE_RATE_MAX`），
      // 而 `boundsFor` 明令兩邊只能有一個（兩份上界就是兩個會分頭腐爛的答案）。
      zh: "每 1 點法強讓技能多幾成傷害",
      note: `最終傷害 = 基礎傷害 ×(1 + 法強 × 這一格)。出貨 {{出貨值}} = ${+(DEFAULT_AP_DAMAGE_SCALING.rate * 100).toFixed(4)}%/點。⭐ 調大 → 技能整體變重、堆法強的收益變陡、**出身差距被拉開**（法師與射手的技能傷害終於不一樣）；調小 → 技能回到只吃自己卡面的數字，法強變成一根幾乎沒有感覺的屬性。⭐ **填 0 = 一鍵 rollback**：乘數恆為 1，逐位元回到這個欄位出現之前。⚠️ 上界 ${AP_DAMAGE_RATE_MAX}（${+(AP_DAMAGE_RATE_MAX * 100).toFixed(2)}%/點）不是保險起見 —— 那已經是「法強 200 的人技能打 ×11」的區間，再高就不是平衡而是打錯字（#277：50 打成 500 會過後台）。`,
    },
    {
      path: "scope",
      zh: "哪一類傷害吃這一層",
      note: "技能＝只有技能傷害（出貨值，owner 說的「**技能**傷害都套用」）：瞬發／吟唱技能、技能投射物、技能種下的持續傷害、代放，全部算。普攻＝只有普通攻擊。全部＝再加上道具／增益卡的觸發傷害、場地火焰、守衛塔、殭屍。⚠️ 選「全部」是一個**大得多**的平衡改動：每一件「造成 N 點傷害」的道具會跟著法強長，而那些道具的數字當初是照著沒有這一層設計的。逐一列出哪個來源落在哪一格的表在 `docs/editor-contract/ap-damage-scaling.md`（那張表是算出來的，不是寫上去的）。",
      optionLabels: {
        ability: "技能傷害（出貨值）",
        basic: "只有普通攻擊",
        all: "全部傷害來源",
      },
    },
    {
      path: "apRatioMode",
      zh: "與技能卡上既有的法強係數怎麼共存",
      note: "疊加＝兩層都吃（出貨值）：卡面係數決定「**這一支**特別吃法強」，上面那一格決定「技能**整體**吃多少」，兩者是不同的軸。取代＝卡面的法強係數在技能傷害上不算，只留上面那一層。⚠️ 選「取代」之前先看 `docs/editor-contract/ap-damage-scaling.md` 那張**量出來**的表：帶法強係數的技能傷害節點，絕大多數拿掉係數之後就**完全沒有屬性相依**（變成純固定值），而係數今天橫跨一個數量級 —— 取代會把「特別吃法強的大招」與「幾乎不吃的小招」壓成同一支。⭐ 它存在是為了**回頭**，⛔ 不是為了觀望。⚠️ 它只摀技能**傷害**：跟著法強長的治療與護盾一格都不動。",
      optionLabels: {
        stack: "疊加：卡面係數 + 這一層（出貨值）",
        replace: "取代：只留這一層",
      },
    },
    {
      path: "resourcePctSkipsGlobalMult",
      zh: "「目標最大生命 X%」要不要吃這一層",
      note:
        "⭐ 開著（出貨值）＝ **不吃** —— 卡面說「目標最大生命 10%」就真的是 10%。" +
        "⚠️ ⭐ 關掉會回到這個欄位出現之前的行為,而那時**卡面說 10% 而實際打了 27%**:" +
        "那一發的量已經是「目標血量的一個比例」,再乘一次施法者的法強乘數就變成一句謊話。" +
        "⭐ 而**反彈封包早就因為同一個理由被豁免了**（它的三個讀數已經吃過攻擊者的乘數）" +
        "⇒ 這一格只是把同一條規則說出口。" +
        "⚠️ 它只影響「按比例吃血」那一族,⛔ 固定值與係數傷害一格都不動。",
    },
  ],
  preserved: [],
};

export const WOUNDS_SPEC: ConfigDocSpec<"woundRules"> = {
  page: "woundRules",
  collection: "config",
  docId: "wounds",
  schemaTag: "config.wounds@1",
  zod: zConfigWoundsDoc,
  title: "重創規則",
  intro: [
    "【重創】= 治療、吸血、自然回復同時打折（owner 2026-08-03：「【減療 / 禁療】=> 用重創代替就好，吸血/治療同時減半」）。",
    "⚠️ **三格倍率不在這一頁** —— 它們寫在施加重創的那一張卡上（技能／道具的 applyStatus），因為每一支技能的重創本來就該不一樣重。這一頁只管「同時中了兩發重創怎麼算」。",
    "⚠️ 【禁療】不是第二個機制：它就是三格倍率都填 0 的一份內容文件（content/status-effects/no-heal.json），所以淨化拔得掉它、到期規則也完全一樣。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/wounds.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/grievousWounds.ts::woundMult（三個讀取點各呼叫一次：combat/restore.ts 的治療、combat/damage.ts 的吸血係數、systems/RegenSystem.ts 的自然回復）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.woundRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 淨化規則／格擋規則／暴走規則 同一個形態(#278)。",
  fields: [
    {
      path: "stackMode",
      zh: "同時中了兩發重創怎麼算",
      note: "取最重（出貨值）＝只算打折最兇的那一筆，與「失手率取最大值」一致；相乘＝兩層 0.5 變成 0.25，疊到第三層幾乎等於禁療。引擎自己對「同型效果怎麼疊」沒有一致答案（失手率取最大、護盾相加），所以這一格是留給你決定的，不是一個技術細節。",
      optionLabels: {
        max: "取最重（出貨值）",
        multiply: "相乘（會疊爆）",
      },
    },
  ],
  // 這一頁只有一格純量,沒有任何不編輯的分支要原封帶走。
  preserved: [],
};

export const WEAKNESS_SPEC: ConfigDocSpec<"weaknessRules"> = {
  page: "weaknessRules",
  collection: "config",
  docId: "weakness",
  schemaTag: "config.weakness@1",
  zod: zConfigWeaknessDoc,
  title: "虛弱規則",
  intro: [
    "【虛弱】= 攻擊速度減半 + **造成的傷害**減半（owner 2026-08-09：「虛弱 => 攻擊速度暫時減半、AP/AD 造成傷害暫時減半」）。",
    "⚠️ 「造成的傷害」不等於「AD/AP 屬性」：這一頁砍的是他**打出去的每一發**，所以連「固定 300 點」那種不吃屬性的技能也一起減半。砍屬性的寫法對固定值一點作用都沒有。",
    "⚠️ 屬性面板**不會**顯示 AD/AP 掉一半 —— 它們真的沒掉。虛弱是掛在身上的減益，該出現的地方是狀態列不是屬性表。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/weakness.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/weakness.ts::weaknessMult（兩個讀取點各呼叫一次：systems/BasicAttackSystem.ts 的攻速、combat/damage.ts 的出手傷害）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.weaknessRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 淨化規則／重創規則／格擋規則 同一個形態(#278)。",
  fields: [
    {
      path: "statusTag",
      zh: "哪一個狀態分類算虛弱",
      note: "引擎不認任何寫死的狀態編號 —— 它問的是「這個人身上有沒有一筆帶著這個分類的狀態」。所以只要一份狀態文件的 tags 帶了這個字，任何技能掛上它就會虛弱。⚠️ 目前出貨的 28 份狀態沒有一份帶這個分類，所以在那一份文件上架之前，這個機制一場比賽裡一次都不會發生。",
    },
    {
      path: "attackSpeedMult",
      zh: "被虛弱時攻速乘多少",
      note: "0.5 = 減半（出貨值）。1 = 把攻速那一半關掉，只留傷害那一半。0 = 完全打不出普攻。⚠️ 它乘的是最終攻速，不進屬性面板。",
    },
    {
      path: "damageDealtMult",
      zh: "被虛弱時造成的傷害乘多少",
      note: "0.5 = 減半（出貨值）。⚠️ 是「他打出去的」不是「他受到的」—— 單挑時兩者看起來一樣，混戰裡完全不同：虛弱的人打誰都軟。普攻／技能／持續傷害／道具觸發全部走同一條隊列，所以每一發各打折一次。",
    },
  ],
  // 這一頁三格純量,沒有任何不編輯的分支要原封帶走。
  preserved: [],
};

export const COOLDOWN_RULES_SPEC: ConfigDocSpec<"cooldownRules"> = {
  page: "cooldownRules",
  collection: "config",
  docId: "cooldown-rules",
  schemaTag: "config.cooldown-rules@1",
  zod: zConfigCooldownRulesDoc,
  title: "冷卻規則",
  intro: [
    "冷卻能縮到多短。owner 2026-08-10：「cdr 天花板可以是 0.99（99%減免），但要卡最低秒數 0.1 秒」。",
    "⭐ **那是兩個旋鈕，住在兩頁**：比率天花板在「屬性上限」頁的 `cdr`（現在 0.99），秒數地板在這一頁。兩個一起才蓋得住整個值域 —— 比率上限對短冷卻的技能沒用（一支 1 秒的技能在 99% 減免下是 0.01 秒，等於每個 tick 都放得出來），秒數地板對長冷卻的技能沒用（120 秒的 EX 永遠碰不到 0.1）。",
    "算式是：`基礎冷卻[等級] × (1 − 冷卻縮減) × 全域冷卻倍率 × 暴走倍率`，**然後**才夾這個地板。地板放在最後一步，否則「全域冷卻 ×2」會把已經觸底的技能推回地板之上，讀起來像 bug。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/cooldown-rules.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/cooldownRules.ts 的 applyCooldownFloor（唯一知道地板怎麼作用的地方）← abilities/abilitySystem.ts 每一次付冷卻成本時呼叫；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.cooldownRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 淨化規則／格擋規則／暴走規則 同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "秒數地板總開關",
      note: "關掉之後冷卻可以被縮到任意短（受比率天花板限制）。⚠️ 它**不**關掉冷卻縮減本身 —— 那是一格屬性，天花板在「屬性上限」頁。",
    },
    {
      path: "minSeconds",
      zh: "最短冷卻秒數",
      note: "一支技能的實際冷卻不會低於這個秒數。出貨 **{{出貨值}}**（owner 指定）。填 0 ＝ 沒有地板。⚠️ 上界 10：再高就會把大多數技能的冷卻**拉長**而不是設地板（一支 3 秒 CD 的技能配一個 30 秒的「地板」），那是打錯數字的樣子。",
    },
    {
      path: "hookMinSeconds",
      zh: "被動觸發器最短內部冷卻（秒）",
      note: "一條**觸發器**（英雄被動 / 道具被動 / 增益卡的 hook）真的發動之後，最短隔多久才能再發動。出貨 **{{出貨值}} ＝ 沒有地板**。⚠️ 它與上面那一格是**兩種秒**：技能冷卻填的是**卡面秒**（引擎再乘「技能冷卻時間」倍率 `combatEnv.cooldown` —— ⛔ **這裡刻意不抄那個數字**：它是**你的旋鈕**，值住 `content/config/owner-knobs.json`。2026-08-23 抓到這一句寫著「出貨 0.2 ⇒ 60 卡面秒 = 12 實際秒」，而你 08-22 已經把它轉成 0.4 ⇒ 真值是 24。閘：`ops/knobValueNotRestated.test.ts`），而觸發器的內部冷卻從來就是**實際秒**、不吃那個倍率 —— 用同一格夾兩種秒就是用同一把尺量兩個空間。⭐ 想一次壓住所有被動的觸發頻率就填 **1.2**（＝冷卻表最便宜的一格「單體·極小」6 卡面秒 × `combatEnv.cooldown`）；填 0 就是回到今天。⚠️ 出貨值刻意是 0：量到有 **52 條**既有觸發器的內部冷卻低於 1.2 秒（0.5 / 0.6 / 1.0），預設拉高會一次改掉那 52 張卡的手感。⚠️ 它**只夾有填內部冷卻的那些** —— 沒填的（例如相轉移裝甲每 tick 續期的魔免）代表作者明說「每一次事件都算」，夾住它們會讓常駐效果變成閃爍的。",
    },
  ],
  // 三格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};


// ── 手把操作版本（config/controller-scheme）—— GH#863 ────────────────────────
export const CONTROLLER_SCHEME_SPEC: ConfigDocSpec<"controllerScheme"> = {
  page: "controllerScheme",
  collection: "config",
  docId: "controller-scheme",
  schemaTag: "config.controller-scheme@1",
  zod: zConfigControllerSchemeDoc,
  title: "手把操作版本",
  intro: [
    "owner 2026-08-28：「我給你一份**手把操作v4**的設計 請你存成md後來實作」／「所以我要你把這版當作 **v4 後台可切換的其中一種手把操作版本**」",
    "⭐ 這一頁只有**一格**：現在用哪一版。其餘全部是各版本自己的內容（住 `content/config/controller-scheme.json`）—— ⛔ 那是**設計**不是旋鈕，改它要改設計檔。",
    "⭐ **v3（出貨）** 是 2026-07-27 起的配置（owner 當時的裁決「the triggers swapped」）：A/B/X/Y = Q/W/E/R、LB = EX、RB = 天生、**LT = attack-move**。自動索敵走 LoL 模型 —— 有指令就聽指令，**走位時不索敵**。",
    "⭐ **v4** 三個本質差別：① **LT 變成「玩家專注」** —— 按住時攻擊與指定敵人的技能**只選敵方玩家**（殭屍海裡找得到人）；② **左搖桿移動⛔不算戰鬥輸入** ⇒ 一邊走位一邊自動清怪；③ 近戰**差一小段距離時會自動貼近殭屍**，左搖桿一碰立刻取消。⛔ 對敵方玩家永遠不會自動追。",
    "⚠️ **兩版都不會自動放技能**，也**都不會**自動攻擊敵方玩家 —— 那兩條是 schema 擋著的硬規則，⛔ 不是靠這一頁的說明。",
    "⚠️ 這一格**打錯字**（填一個不存在的版本名）會讓遊戲退回 v3 並在 console 大聲說；⛔ 它不會靜默壞掉，但也不會被這一頁擋下來 —— 請照上面的名字填。",
  ],
  consumer:
    "packages/shared/src/content/schema/config/controllerScheme.ts 的 resolveControllerScheme() → apps/client/src/input/GamepadInput.ts（按鍵語意）與自動清怪的判準",
  effect:
    "玩家**下一次重新整理遊戲頁面**之後生效（手把對應是載入時解析的，⛔ 不是每幀讀）。⛔ 不必重新部署。",
  fields: [
    {
      path: "active",
      zh: "現在用哪一版",
      note: '⭐ 就是這一格。填 `v3-shipped` 或 `v4`（要跟設計檔裡的名字一字不差）。**切回 `v3-shipped` ＝ 一鍵 rollback**，回到這個功能之前的行為。',
    },
  ],
  // ⚠️ `schemes` 是 `z.record`（鍵是版本名，⛔ 不是固定欄位），通用引擎列不出
  // 「有哪些鍵」，畫出來會是一頁空的 —— 與 `arena-rules.rounds` / `per-level-bonus` /
  // `stat-caps.caps` / `vfx-ability-art.bindings` 是同一個引擎缺口。
  preserved: [
    {
      path: "schemes",
      why: "**每一個版本的完整定義**（十顆鍵綁什麼、移動算不算戰鬥輸入、瞄準用哪一種評分、近戰貼不貼近）。它是 `z.record`（鍵是版本名），通用引擎畫不出來。⛔ 掉了的話 `active` 會指向一個不存在的版本 ⇒ 手把整個退回預設，而後台這一頁看起來完全正常。⭐ 它是**設計**：要加第三版就編 `content/config/controller-scheme.json`，⛔ 不是在這一頁點。",
    },
  ],
};

// ──────────────────── 一擊必殺夾限 (config/one-shot-clamp) ─

/**
 * ⭐⭐ GH#928 —— owner 2026-09-02 逐字：「我們來檢討傷害排行榜上的技能傷害」
 * （他貼了線上榜單前 100）。
 */
export const ONE_SHOT_CLAMP_SPEC: ConfigDocSpec<"oneShotClamp"> = {
  page: "oneShotClamp",
  collection: "config",
  docId: "one-shot-clamp",
  schemaTag: "config.one-shot-clamp@1",
  zod: zConfigOneShotClampDoc,
  title: "一擊必殺夾限",
  intro: [
    "⭐ 一次技能最多能打掉一名英雄**幾成最大生命** —— ⭐ 出貨**開著**（owner 2026-09-06 逐字「先做 A 但我想深入了解 B」，A ＝ 翻開這一格，GH#1017）。",
    "⛔⛔ 量到的（owner 2026-09-02 貼的榜單前 100，⛔ 不是估計）：**12 列**打掉單一英雄超過 **100% 最大生命**，最高 **401%**（48-04 騎英之疆繩）· 301%（39-03 蛟龍）· 187%（44-04 心臟麻痺）；**17/100** 標著「☠ 一擊」。",
    "⭐⭐ 根因是**五級距只管加法項**：`傷害 = 小級距(500) + 0.8 × AP`，而五級距是從**純基礎**血量反推的 —— ⭐ 那個空間裡 AP ＝ **0**，⛔ 而榜上 100 列沒有一列在那個空間裡。⇒ 級距回答的是「零裝備時要打幾發」，而玩家從商店開門起就不在那個世界。",
    "⚠️ ⭐ 這一頁**不改公式、不夾 AP、不動任何技能的數值** —— 它只是在傷害的**最後一步**把單次傷害壓住，讓「一擊必殺」變成一個關得掉的東西。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/one-shot-clamp.json`**。",
  ],
  consumer: "packages/shared/src/sim/combat/damage.ts 的 `mitigate()` 之後、護盾之前（全專案唯一的夾點）",
  effect: "**要重啟 game-server shard 才生效**（`Configs` 是 boot 時載入的，同 combatFeel #863）。",
  fields: [
    {
      path: "enabled",
      zh: "夾限總開關",
      note:
        "⭐ **出貨開著**（owner 2026-09-06 逐字：「先做 A 但我想深入了解 B」—— A ＝ 翻開這一格，GH#1017；B ＝ 級距反推空間，另案）。" +
        "⚠️ 開著會改變**每一場**比賽的結果 —— 翻回關閉 ＝ 一鍵 rollback。⭐ 關著時整條夾限逐位元 no-op（⛔ 不是「夾到 100%」）。",
    },
    {
      path: "maxFractionOfMaxHp",
      zh: "單次上限 — 目標最大生命的倍數",
      note:
        "⭐ `1.0` ＝ 一發最多打掉他滿血；`0.5` ＝ 最多半條（出貨值 {{出貨值}}）。" +
        "⚠️ 上界 10：再高就等於沒有夾（榜上最高是 **4.01**）。" +
        "⚠️ 下界 0.05：低於這個值會讓每一場比賽都打不死人。",
    },
    {
      path: "alsoClampMinions",
      zh: "小怪也夾",
      note:
        "⛔ 預設**不夾** —— 榜單量到的 B 類（總傷害大但**單體佔比低**）打的正是小怪，" +
        "⭐ 而那**不是缺陷**（59-04 用 `damageLine` 掃 22 列、80-02 用 `damageArea`）。",
    },
  ],
  preserved: [],
};
