/**
 * 設定文件的**標籤資料**（傷害顏色・場地火圈・勝利演出/頒獎台・體型/回復・錄影・首領入場）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigAmbientVfxDoc,
  zConfigBossIntroDoc,
  zConfigDamageColorsDoc,
  zConfigReplayDoc,
  zConfigBodyScaleDoc,
  zConfigRegenDoc,
  zConfigVictoryFxDoc,
} from "@ggd/shared/content";
// ⚠️ 深路徑 import：`config.victory-podium@1` 的 Zod 住在自己的檔案裡（欄位的理由
// 很長，而且客戶端 render/** 直接吃它），`content/schema/index.ts` **沒有**再匯出
// 一次，所以這裡走 package.json 的 `"./*"` 子路徑。`laneConfigDocs.test.ts` 走的是
// 同一條。
import { zConfigVictoryPodiumDoc } from "@ggd/shared/content/schema/victoryPodium";
import { HEX6, HEX6_ERROR } from "./_shared";
import type { ConfigDocSpec } from "../engine";
import { derivedFields } from "../schemaToForm";
// ─────────────────────────────────── 傷害數字配色 (config/damage-colors) ───


export const DAMAGE_COLORS_SPEC: ConfigDocSpec<"damageColors"> = {
  page: "damageColors",
  collection: "config",
  docId: "damage-colors",
  schemaTag: "config.damage-colors@1",
  zod: zConfigDamageColorsDoc,
  title: "傷害數字配色",
  intro: [
    "owner 2026-08-01：「真實傷害目前在畫面上看不出來 => 顯示白色傷害數字(紅物理; 紫魔法; 白真實; 綠治療)」。這一頁就是那四個顏色。",
    "在這一頁出現之前，客戶端只判斷「是不是魔法」，所以**真實傷害的數字和物理傷害一模一樣** —— [無視] 這件事在畫面上唯一的證據是「對面死得比較快」。火花、噴血與音效本來就分得出三種，飄字與身體閃光是唯二沒分的兩條，也是最大聲的兩條。",
    "⚠️ **飄字與閃光的值不一樣是刻意的，不是抄漏。** 飄字是畫在黑框上的文字，純白最清楚（對黑框 21:1）；身體閃光是疊色（結果 = 原色×0.4 + 疊色×0.6），白色只能把三個通道往上推，在淺色模型上實測只移動 ΔRGB 0.03~0.09 —— 也就是說「白色閃光」在最需要它的那些模型上等於沒有閃。所以真實傷害的**閃光**是青白色，那是還看得見的最白的一個。",
    "⚠️ 每一格的出貨值都對四個真實地面（土色／暗土／石地／白岩）與四個隊伍色量過。要換色的話請記得兩件事：**紫色不要調太深**（黑框在暗土上只有 2.13:1，深紫會連框帶字一起變成一團），**不要用接近隊伍色的顏色**（會被讀成隊伍標示而不是傷害）。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/damage-colors.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
    "── 外框（第二個通道）── owner 2026-08-01：「加第二個通道，不動色相 => ok」。上面那條裁決把顏色花在「哪一種傷害」上，代價是**「我打人」和「我被打」變成同一個顏色**。下面四格把那個分別放回去，但**不動顏色**：填色繼續講傷害屬性，外框講「這是誰的血」—— 我打人黑框、我被打深紅框。兩個通道用的是不同的畫素，所以不會互相搶。",
    "⚠️ **這裡調的是外圈，不是那圈黑框。** 黑框是 #164「傷害數字看起來是黑色」修好之後留下的辨識度地板，而且它**沒有餘裕可以換色**：實測黑框對土色地面（#6d6250）只有 3.51:1，而物理傷害的填色 #FF5900 在同一個地面只有 1.90:1 —— 那個地面完全靠黑框撐。把黑框換成任何一個看得出來是紅色的顏色（#5A0000 → 2.45:1）就會掉到 3.0 以下，整個數字在土地上糊成一團。所以做法是**在黑框後面多畫一圈**：黑框原封不動，外圈提供顏色。",
  ],
  consumer:
    "apps/client/src/render/damagePalette.ts 的 applyDamageColorsDoc()（由 ContentDb.load 呼叫）→ damageTextColor() 被 ui/combatText.ts 的 combatTextStyle() 讀走畫飄字，damageFlashRgb() 被 render/combatFeedback.ts 的 flashColorFor() 讀走畫身體閃光，damageOutlineMode()/damageOutlineColor()/damageOutlineWidthMult() 被 ui/combatText.ts 的 combatTextBand() 讀走決定外圈，最後由 combatTextShadow() 疊進 WorldAnchorLayer 真的寫上去的那個 text-shadow",
  effect: "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時套用）。",
  fields: derivedFields(zConfigDamageColorsDoc, [
    { path: "text.physical", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "text.magic", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "text.true", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "text.heal", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "flash.physical", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "flash.magic", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "flash.true", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "outline.outgoing", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "outline.incoming", pattern: HEX6, patternError: HEX6_ERROR },
  ]),
  preserved: [],
};


// ───────────────────────────────── 場地環境火焰 (config/ambient-vfx.arenaFire) ─

export const ARENA_FIRE_SPEC: ConfigDocSpec<"arenaFire"> = {
  page: "arenaFire",
  collection: "config",
  docId: "ambient-vfx",
  schemaTag: "config.ambient-vfx@1",
  zod: zConfigAmbientVfxDoc,
  title: "場地環境：火焰、圓盤外背景與場景特色",
  intro: [
    "這一頁管的是同一份文件（`config/ambient-vfx`）裡的三件事：**場地環境火焰**（GH#251）、**圓盤外的 2D 景深背景**（GH#324）與**場景特色**（配色／會動的打光／裝飾散佈，GH#362）。⚠️ 它們合在一頁不是分類偷懶 —— 通用表單引擎是**整份文件存回去**的，同一份文件拆成兩頁會讓兩頁互相蓋掉對方的欄位。",
    "⭐ 兩者的出貨值**故意相反**：火焰是**關**的（owner 說礙眼），背景是**開**的（owner 說要填補場景外的空缺）。同一條原則 —— 讀不到設定時要退回 owner 要的那一邊。",
    "owner 2026-08-01 實戰回饋：「場地天空火焰很礙眼 請全部場地都去掉」(GH#251)。這一頁就是那把火的開關，出貨值已經是**關**。",
    "在這一頁出現之前，這件事寫死在 `dressArena` 的一行 `d.model.includes(\"torch\")` 裡：只要場地文件擺了一支火把，就一定有一團常駐的加色火焰粒子，後台一格都調不到。實際數量是 skeleton（**預設場地**）16 團、castle 16 團、colosseum 16 團、royale 4 團，dota 與 godie 0 團。",
    "⚠️ 火焰是**加色混合**（additive）的，所以它在暗色地面上永遠是畫面裡最亮的東西之一，而且 16 團全在場地邊緣 —— 那正是 owner 說「礙眼」的位置。要開回來的話建議先把「同時幾團」調小再開，而不是直接 16 團全點。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ambient-vfx.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/render/ArenaScene.ts 的 dressArena()（由 GameApp.applyArena 呼叫，政策從 ContentDb.arenaFire() 取得）→ 每一個命中的 decor 道具呼叫一次 attachFlame()",
  effect:
    "玩家**下一次重新整理遊戲頁面**、而且**下一次換場地**（dressArena 重跑）時生效。已經蓋好的場地不會中途點火或熄火 —— 那是刻意的：dressArena 是一次性的布景 pass，不是每幀跑的東西。",
  fields: derivedFields(zConfigAmbientVfxDoc, [
    {
      path: "arenaFire.enabled",
      zh: "場地要不要有環境火焰",
      note: "關（出貨值）＝ 所有場地的火把一團火都不冒，也就是 owner 要的結果；開＝ 命中的布景道具每一支都掛一團常駐的加色火焰。這是唯一決定「場上有沒有火」的一格，下面三格只有在它開著時才有意義。",
    },
    {
      path: "arenaFire.maxEmitters",
      zh: "一張場地最多幾團火",
      note: "同時存在的火焰粒子系統上限，超過的火把就單純不冒火（依場地文件的順序先到先得）。每一團都是一組獨立的粒子系統加一張貼圖，所以這個數字直接就是「這張場地為了火焰多付出的繪製成本」。16 ＝ 出貨場地的火把全部點燃；填 4 就是只點四支，畫面上仍然有火但不會沿著整圈邊緣亮一排。",
    },
    {
      path: "arenaFire.emitRate",
      zh: "每團火每秒噴幾顆粒子",
      note: "火焰的濃密程度。18（出貨值）是一團看得出在燒的小火；調低會變成稀疏的火星、調高會變成一團實心的亮塊 —— 而 16 團同時調高就是 owner 抱怨的那個畫面。它同時決定同螢幕的粒子總量，手機發燙時這一格比關掉整個功能溫和。",
    },
    {
      path: "arenaFire.sizeScale",
      zh: "火焰粒子的大小倍率",
      note: "1（出貨值）＝ 每顆粒子 0.3–0.6 個世界單位，大約是英雄身高的五分之一到三分之一。這一格直接決定火焰在畫面上佔多大 —— 它比上面那格更影響「礙不礙眼」，因為粒子變大是面積成長不是數量成長。2 已經是一團跟英雄一樣高的火。",
    },
    {
      path: "backdrop.enabled",
      zh: "圓盤外要不要有景深背景",
      note: "開（出貨值）＝ 場地邊界外面鋪上一層層往下沉的環帶，看起來像場地漂在一個有深度的世界裡；關＝ 圓盤外回到純色底（深藍黑），也就是這個功能做之前的樣子。⚠️ 攝影機俯角 68 度，畫面最上緣在水平線下方 45 度，所以**地平線永遠不進畫面** —— 圓盤外看得到的只有地板平面，這也是為什麼這裡是一層層攤平的環帶而不是一面天空盒。",
    },
    {
      path: "backdrop.maxLayers",
      zh: "最多畫幾層背景",
      note: "每一層是 1 個繪製呼叫、最多 128 個三角面（對照：一隻英雄 1,500–2,000 面），所以 4 層（出貨值）的成本大約是四分之一隻英雄。⭐ 手機掉幀時這一格是最先該調的：砍掉的是**最外圈**那幾層（最遠、最暗的先消失），所以調到 1 也不會在場地邊界旁邊留下一圈黑洞。填 0 等同關閉。",
    },
    {
      path: "backdrop.alphaScale",
      zh: "背景整體透明度倍率",
      note: "乘在每一層自己的透明度上。1（出貨值）＝ 照地圖文件寫的畫。⭐ 覺得「背景太搶戲、看不清楚場上」的時候先動這一格，而不是直接關掉整個功能 —— 調到 0.4 會讓整個背景往後退成一層淡淡的底，場地邊界仍然讀得出來。0 ＝ 全透明（看起來跟關掉一樣，但仍然付繪製成本，所以真的不要就用上面那格關掉）。",
    },
    {
      path: "scenery.enabled",
      zh: "場地要不要有各自的場景特色",
      note: "開（出貨值）＝ 每張場地用自己的地板／牆壁染色、自己的燈（而且**燈會動**）、自己那一組散佈裝飾；關＝ 13 張場地全部退回同一組灰石板配色加同一顆不會動的太陽，也就是 owner 2026-08-18 抱怨的那個樣子。⭐ 這一格是**一鍵 rollback**：整批換皮不喜歡就關掉，不必回滾一次部署。",
    },
    {
      path: "scenery.maxPropsPerZone",
      zh: "每個對戰分區最多長幾件特色裝飾",
      note: "地圖文件用「規則」描述裝飾（例如「沿著 0.9 倍半徑擺 18 根柱子」），這一格是展開出來的件數上限。每一件是一次模型實例化加一塊接觸陰影 —— 手機掉幀時先調這一格，比關掉整個功能溫和。40（出貨值）比出貨場地實際用量還高，所以現在一件都不會被砍；它擋的是作者一次填八條規則那種上千件的情況。⚠️ 砍的是**規則順序的後面**，所以地圖作者要把最能代表這張圖的規則寫在最前面。",
    },
    {
      path: "scenery.outlineShells",
      zh: "下載來的水晶布景要不要保留自帶的黑色描邊",
      note: "開（出貨值）＝ 維持今天畫面上的樣子。`content/assets/models/scenery-cc0/` 的 16 件水晶／斷牆／破甕（crystal-crossroads 那一系列）在原作者那邊是卡通描邊風格，每一件都多帶一層向外翻的黑色輪廓殼（材質名逐字叫 `Outliner_Mat`）；關＝ 只把那層殼藏起來，本體原封不動。⭐ 為什麼會是一格開關而不是直接決定：GGD 的英雄是平面著色的方塊人，**沒有描邊**，所以那 16 件站在場上會自帶一圈黑邊、跟旁邊的東西不同調 —— 這是喜好問題不是缺陷，所以選擇權留在這裡。⚠️ 順帶的效果是那 16 件的繪製呼叫會少掉大約一半（描邊殼是獨立的一份幾何），手機掉幀時關掉它比拿掉整批裝飾溫和。",
    },
    {
      path: "scenery.animateLights",
      zh: "場地的燈要不要真的會動",
      note: "開（出貨值）＝ 每張圖的光照它自己的波形變化（呼吸／搖曳／掃掠／雷雨），影子會轉、亮度會起伏；關＝ **保留**這張圖的燈光顏色與角度，但停在波形的起點，變回一盞不動的燈。⭐ 這一格單獨切掉「動」那一半是刻意的：對閃爍敏感的玩家要的是「留下配色、拿掉閃爍」，而不是連場景特色一起失去。",
    },
  ]),
  preserved: [
    {
      path: "attackTrail.byWeaponTag",
      why: "⭐ 哪一個武器 tag 放哪一道殘影 —— **整份是資料**（`content/config/ambient-vfx.json`）。⭐ **順序＝優先序**（大劍贏過劍）。要加一個新武器類型就在那裡加一列 `{tag, vfxId, y}`，⛔ 不必改任何程式。⚠️ 今天在後台編不到，理由與 `bindings` 同型：通用引擎畫得動的是固定形狀的純量葉，而這是一份會長大的清單。⚠️ ⭐ `vfxId` 打錯字**不會報錯，它只是靜靜什麼都不放** —— 守衛 `attackTrail.test.ts` 在對這份清單與 `content/vfx/_index.json`。",
    },
    {
      path: "bindings",
      why: "逐模型的**環境特效綁定表**（英雄身上的常駐光暈／餘燼尾巴／緞帶翅膀，9 個模型共 17 條）。這一頁不編輯它，但每次儲存都必須原封不動帶著走 —— 掉了的話那 9 位角色身上的常駐特效會全部消失，而畫面上沒有任何錯誤訊息。",
    },
    {
      path: "arenaFire.models",
      why: "哪些布景道具會冒火（對 decor 的 `model` 路徑做子字串比對，出貨值是 `[\"torch\"]`，命中 torch.glb 與 torch_mounted.glb）。通用表單引擎畫不了字串陣列，所以這一頁不編輯它；掉了的話就算開關打開也一團火都不會出現。要改它請走內容覆蓋層。",
    },
  ],
};

// ───────────────────────────────── 勝利煙火 (config/victory-fx) ────────────

export const VICTORY_FX_SPEC: ConfigDocSpec<"victoryFx"> = {
  page: "victoryFx",
  collection: "config",
  docId: "victory-fx",
  schemaTag: "config.victory-fx@1",
  zod: zConfigVictoryFxDoc,
  title: "勝利煙火",
  intro: [
    "owner 2026-08-02 實戰回饋：「天空的火焰似乎沒有被移除，我懷疑是煙火的時間太長」→ 裁決「請你直接取消煙火(變成後台開關)」。這一頁就是那兩把開關，**出貨兩格都是關的**。",
    "程式碼一行都沒有刪。「贏了要不要放煙火」是一個決策點不是一個 bug，所以它是兩格開關而不是一次刪除 —— 改主意時打勾就好，不必再改程式碼＋重新部署一次。形狀和 場地環境火焰 (GH#251) 一模一樣，理由也一樣。",
    "⚠️ **量到的煙火長度其實很短**：回合小煙火約 1.3 秒、烤雞煙火約 4.3 秒，而且結束後場上不留任何粒子系統。owner 感覺到的「時間太長」有一個已知的機制解釋 —— 煙火的收尾**完全靠 requestAnimationFrame 驅動**，切到別的分頁／手機息屏時整個凍結在那一幀，切回來才在一幀之內自癒。所以「切出去再切回來」看到的就是一團不動的火。這一頁關掉煙火就不會遇到；要開回來的話這件事還在。",
    "⚠️ 這兩格**只關煙火**。結算畫面的灰底（回合）與暗底（全場）、以及勝利嘲弄語音都不受影響 —— 那些是別的功能，一起關掉會是沒有人要求的迴歸。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/victory-fx.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/vfx/VictoryFireworks.ts 的 sync()（GameApp 每幀呼叫；政策由 ContentDb.load() 經 vfx/victoryFxPolicy 的 applyVictoryFxDoc 推進來）→ 決定 SmallFireworkFx.play() / ChickenFireworkFx.play() 要不要被呼叫；烤雞那格同時決定 ui/panels/MatchEndPanel 要不要把計分卡壓住 2340 毫秒",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（設定是在內容載入時讀進特效層的）。已經在進行中的那一場不會中途改變。",
  fields: [
    {
      path: "roundVolley.enabled",
      zh: "每回合贏的時候放小煙火",
      note: "關（出貨值）＝ 打贏一個回合時天空不會有任何煙火，畫面只剩下灰底與獲勝者的角色。開＝ 每贏一回合放一輪三發的小煙火，約 1.3 秒。這是一場裡最常看到的那一種（一場打 3–5 回合就放 3–5 次），也是三個數字裡最貴的一個：峰值會多出約 28 個粒子系統，手機上最有感的就是它。",
    },
    {
      path: "matchChicken.enabled",
      zh: "全場獲勝時放烤雞煙火",
      note: "關（出貨值）＝ 吃雞時天空不會出現那隻全螢幕的烤雞，而且**結算計分卡會立刻出現**（那 2.34 秒的延遲存在的唯一理由就是讓烤雞被看到，煙火關掉之後它就只是純粹的空等）。開＝ 一場只放一次、約 4.3 秒，然後計分卡才淡入。這是 #93 花了七次迭代才做到看得出是一隻雞的那個東西。",
    },
  ],
  preserved: [],
};

// ────────────────────────────────── 回合頒獎台 (config/victory-podium) ─────

/**
 * 三個「播哪一個剪輯」共用同一組中文。三格問的是同一個問題，答案不一樣的時候
 * 才有訊息（三個都 celebrate 就沒有「誰是第一」了），所以選項的說明要一致。
 */
const VICTORY_PODIUM_CLIP_LABELS: Record<string, string> = {
  celebrate: "celebrate（慶祝｜找模型自己的 cheer／Stand Victory，沒有的退回站姿並在 console 警告一次）",
  idle: "idle（站著｜和在商店裡發呆同一個動作）",
  death: "death（倒下｜給「敗方也上台」那種玩法用的）",
};

export const VICTORY_PODIUM_SPEC: ConfigDocSpec<"victoryPodium"> = {
  page: "victoryPodium",
  collection: "config",
  docId: "victory-podium",
  schemaTag: "config.victory-podium@1",
  zod: zConfigVictoryPodiumDoc,
  title: "回合頒獎台",
  intro: [
    "一個回合分出勝負時，畫面中央那一排 3D 模型要站幾個人、誰站正中間、誰在慶祝、第一名開口說什麼。owner 2026-08-03：「回合勝利出現的 3d model 是勝利角色 但現在不是」——**站位**那一格就是那句話的答案。",
    "⚠️ 這一頁在 2026-08-03 之前是**存了不生效**的：文件在、Zod 在、進了 bundle，但畫面讀的是程式裡寫死的常數。現在 `RoundWinnerStage` 真的去內容登錄表讀這一份，所以這一頁的每一格都改得到畫面。",
    "⚠️ **頒獎台人數不是一個純顯示的數字**：每一位站上台的角色是一個獨立的 WebGL context，而瀏覽器同時大約只給 16 個。調高會直接吃顯示記憶體，手機最先受不了。",
    "⚠️ **第一名的台詞出貨是「兩個都說」，那就是現行行為**，不是這一頁新加的東西：名言在勝負底定的那一刻、嘲諷在 2.2 秒之後。改成「只嘲諷」才是改變行為（＝把已經在放的名言關掉）。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/victory-podium.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/render/RoundWinnerStage.ts 的 victoryPodiumPolicy()（每一回合從 Configs 登錄表重讀一次）→ planRoundWinnerShow() 的 cfg 預設值 → podiumSlotOrder / StorePreview 的剪輯與縮放；台詞那一格同時決定 ui/RoundEndVoice 與 audio/victoryTaunt 誰會出聲",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（內容登錄表是開機時載入的），之後的每一個回合結束都會重讀。不需要重開 game-server —— 這整段演出活在客戶端。",
  fields: [
    {
      path: "podiumSize",
      zh: "頒獎台站幾個人",
      note: "回合結束時中央排幾個 3D 模型。⚠️ 每一個都是一個獨立的 WebGL context，而瀏覽器同時大約只開得了 16 個 —— 這一格是這一頁唯一會直接吃顯示記憶體的東西，調高在手機上最先炸。排不滿的時候怎麼辦看下面那一格。",
    },
    {
      path: "podiumScope",
      zh: "排名要算誰",
      note: "只排勝方三人，還是這一回合上場過的所有座位。3v3 裡兩者幾乎永遠同解（最後活著的三個人就是勝方），**只有勝方有人中途斷線時才會分岔** —— 那時候 allFought 會讓敗方裡活最久的那位補進名次，winnerTeam 則是少一位。",
      optionLabels: {
        winnerTeam: "winnerTeam（只排勝方隊伍｜「回合勝利畫面」的字面意思）",
        allFought: "allFought（這一回合上場過的所有座位｜含敗方）",
      },
    },
    {
      path: "podiumFill",
      zh: "人數排不滿時",
      note: "排得出來的人比上面那一格少的時候要不要補人。⚠️ 補人是**設計偏好不是資料修補**：把剛剛被打倒的敵人擺上勝利頒獎台是一種玩法，不是一個更完整的畫面。空著的台階讀起來像 bug，所以出貨是「有幾個站幾個」。",
      optionLabels: {
        shrink: "shrink（有幾個站幾個｜出貨值）",
        opponents: "opponents（用敗方裡活最久的補滿）",
      },
    },
    {
      path: "podiumLayout",
      zh: "第一名站哪裡",
      note: "owner 2026-08-03「回合勝利出現的 3d model 是勝利角色 但現在不是」講的就是這一格：由左到右照名次排的話，三個人時**螢幕正中央站的是第二名**，而第二名依定義是這一回合倒下的人 —— 玩家的眼睛先看中間，於是「誰贏了」讀起來是錯的。",
      optionLabels: {
        rank: "rank（由左到右照名次｜三個人時正中央是第二名）",
        centreFirst: "centreFirst（金冠站正中央、銀左銅右｜出貨值）",
        soloWinner: "soloWinner（只站第一名一位｜最不會誤讀，但沒有隊伍三人的畫面）",
      },
    },
    {
      path: "winnerScale",
      zh: "第一名那張卡放大幾倍",
      note: "第一名相對其他人的尺寸倍率，同時決定它疊在上層。1 ＝ 三張一樣大，那時候「誰贏了」只剩皇冠顏色一個線索（金銀銅在暗底上並不好分）。往下調到 1 以下是刻意的反差玩法，不是壞掉。",
    },
    {
      path: "clipGold",
      zh: "第一名做什麼動作",
      note: "站上台的那一刻播哪一個動作剪輯。在這一格出現之前三個人一律站著不動 —— 也就是「勝利」和「在商店裡逛街」看起來一模一樣，這是玩家最直接感覺到「贏了但沒有反應」的地方。",
      optionLabels: VICTORY_PODIUM_CLIP_LABELS,
    },
    {
      path: "clipSilver",
      zh: "第二名做什麼動作",
      note: "同上，但這一格的重點是**不要跟第一名一樣**：三個人一起慶祝的話，「誰是第一」這個訊息就從畫面上完全消失了，只剩下皇冠顏色。",
      optionLabels: VICTORY_PODIUM_CLIP_LABELS,
    },
    {
      path: "clipBronze",
      zh: "第三名做什麼動作",
      note: "同上。把敗方補上台（上面「人數排不滿時」選 opponents）的玩法可以把這一格設成倒下，讓被補上來的人躺在台上 —— 那時候台上就同時說得出「誰贏了」和「誰輸了」。",
      optionLabels: VICTORY_PODIUM_CLIP_LABELS,
    },
    {
      path: "roundWinLine",
      zh: "第一名開口說什麼",
      note: "⚠️ 出貨是「兩個都說」，而那**就是現行行為**：名言在勝負底定的那一刻、嘲諷在 2.2 秒之後。所以選「只嘲諷」不是維持現狀，是把已經在放的名言關掉。選「只說名言」時，該英雄沒有名言剪輯就自動退回嘲諷，不會變成一片安靜。",
      optionLabels: {
        taunt: "taunt（只嘲諷敗方）",
        quote: "quote（只說自己的名言｜沒有剪輯時退回嘲諷）",
        both: "both（名言 → 2.2 秒後嘲諷｜出貨值，也是現行行為）",
      },
    },
    {
      path: "podiumZoneSource",
      zh: "頒獎台看哪一區的勝負",
      note: "一個回合有**兩個競技場、兩個勝方**，伺服器逐區都記了勝負。owner 2026-08-03「為什麼我最後活著 勝利的還是顯示別的隊伍」就是這裡：以前頒獎台自己再推導一次「誰贏」，而兩隊都是勝方時它挑戰績最好的那一隊。⚠️ 改這一格**不會**改變任何人的實際勝負或分數，只改變你死後／按了「前往觀戰」跑去看別區時，台上站的是誰。",
      optionLabels: {
        localSeat: "localSeat（永遠演你自己英雄站的那一區｜出貨值，owner 要的那個）",
        spectated: "spectated（演你鏡頭當下正在看的那一區）",
      },
    },
    {
      path: "podiumSpacing",
      zh: "三張卡散多開",
      note: "1 ＝ 三張卡把**整個視窗寬度**均分，也就是這一格出現之前逐字的行為；越小三個人越往中間靠。⚠️ 卡片的寬度是由視窗**高度**決定的（`min(vh, vw)`），而間距是視窗**寬度**的百分比 —— 兩者單位不同，所以同一個數字在 16:9 桌機上是「相隔約 3.1 個卡片寬」（owner 看到的那個），在直式手機上只隔 1.1 個。⇒ 往下調的時候**先看手機那一側**，桌機還很鬆的時候手機可能已經疊住了。填 1 就是一鍵回到舊畫面。",
    },
    {
      path: "roundCardCollapsed",
      zh: "成績卡預設收合",
      note: "回合結算那張成績卡（右上角的評價／建議／團隊積分）一開始**只留一條卡頭**，還是整張攤開。⚠️ 攤開的那張 340 寬、停在右上角 slot 欄的內側，而頒獎台是「銀左·金中·銅右」—— 也就是說攤開的成績卡正好蓋住**站在畫面右邊的銅牌那一位**的 3D 模型（owner 2026-08-22：「回合結算的成績會檔到右邊勝利第三人的3d model 最好做成可以摺疊展開」）。出貨 true ＝ 收合，因為那是「不擋到模型」的那一邊；收合仍然看得到大字母等第與標題，玩家按卡頭右邊的摺疊鈕（手把也按得到）就展開，而展開狀態**每一回合重置回這一格**。",
    },
    {
      path: "roundPresentSec",
      zh: "頒獎台在螢幕上停幾秒",
      note: "回合結束後三位模型 + 灰幕佔著畫面幾秒，時間到就收掉、進商店。⚠️ 在這一格出現之前它是程式裡寫死的 **3.6 秒**，而嘲諷語音要到第 **2.2 秒**才開口 —— 只剩 1.4 秒空檔，而實測 60 支嘲諷剪輯的中位長度是 **3.29 秒** ⇒ **59/60（98%）被切在一半**（owner 2026-08-14：「回合勝利 語音還沒播完 就會進商店 語音也被截斷」）。⭐ 現在**語音不再被這一格切掉**（畫面收掉、聲音自己講完），所以這一格純粹是「你想看模型看多久」。出貨 {{出貨值}} 秒 ＝ 2.2 + 3.3，大約蓋得住一半以上的剪輯。調大會延後進商店的時間，⚠️ 但它不會延長回合結算的秒數（那是 戰鬥系統 的 resolutionSec）。",
    },
  ],
  preserved: [],
};

// ───────────────────────────────────────── 體型與射程 (config/body-scale) ──

export const BODY_SCALE_SPEC: ConfigDocSpec<"bodyScale"> = {
  page: "bodyScale",
  collection: "config",
  docId: "body-scale",
  schemaTag: "config.body-scale@1",
  zod: zConfigBodyScaleDoc,
  title: "體型與射程",
  intro: [
    "owner 2026-08-01 實戰回饋：「身體放大倍數 會影響攻擊距離延長倍數」。放大的角色看起來手長卻打不到，是因為在這一頁出現之前，**伺服器根本不知道任何一位英雄有多大** —— 螢幕上的大小住在一份客戶端專用的檔案裡（content/models/_standin-overrides.json），它不在內容清單裡，遊戲伺服器從來讀不到。",
    "owner 同日更正：「**通常不會是等比倍率**，例如 2x body, 1.2x 攻擊距離；3x body 1.3x攻擊距離」。所以這一頁調的是一張**斷點表**而不是一個係數 —— 係數只畫得出一條直線，畫不出「1→2 加 0.2、2→3 只再加 0.1」這種遞減。",
    "⚠️ 這一頁**只管普攻射程**。技能施放距離與 AoE 半徑走 戰鬥系統 的 abilityRange（出貨 0.6，是刻意壓過的），**刻意不跟著體型連動** —— 再乘一次會讓那個 0.6 對大體型英雄悄悄失效。要不要一起連動是下一個決定。",
    "⚠️ 這一頁**會改變平衡**：出貨內容有 24 位英雄體型不是 1（0.6 ～ 3.0）。照出貨曲線，體型 3.0 的 godie-o030 普攻射程從 12.0 變成 15.6（單一決鬥區半徑是 24），體型 0.6 ～ 1.0 的那些人一格都沒有變。要退回舊行為就關掉總開關。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/body-scale.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/bodyScale.ts 的 attackRangeScaleFactor() → sim/baseBonus.ts finalizeStat() 的 rangeScale → Stat.AttackRange（每次 recomputeStats 都會呼叫）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.bodyScaleRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 護盾規則／格擋規則／嘲弄規則 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格，寫成「下一場生效」會害操作者以為功能壞了。",
  fields: derivedFields(zConfigBodyScaleDoc, []),
  preserved: [],
  curve: {
    path: "attackRangeCurve",
    title: "體型 → 普攻射程倍率（斷點表）",
    intro: [
      "由上到下**體型由小到大**。表上沒有的體型走**線性內插**：出貨表裡 2.0 是 1.20、3.0 是 1.30，所以 2.5 拿到的是 1.25。",
      "⚠️ **兩端夾住，不會外推。** 比第一列小的體型一律拿第一列的倍率、比最後一列大的一律拿最後一列 —— 所以出貨表底下，體型 0.6 的小隻角色射程一格都不會少。要涵蓋更大的體型（例如殭屍王的 sizeMult），請**加一列**；不加的話它只會停在最後一列的倍率，不會自己長出去。這是刻意的：外推等於替你猜一條沒有人看過的斜率。",
      "倍率是乘在英雄卡的普攻射程上。近戰角色卡面通常是 1.6，遠程 6～12；乘完之後還有一條「貼身一定打得到」的地板（自己半徑＋對方半徑＋0.1），所以把倍率調很低不會讓近戰完全打不到人，只會讓遠程角色被迫貼上去。",
    ],
    x: {
      key: "bodyScale",
      zh: "體型（幾倍大）",
      note: "英雄卡上的 bodyScale。1 = 一般體型（出貨 89 位沒填這一格，等於 1）。出貨最小 0.6、最大 3.0。上界 10 是 小怪波 那一頁 殭屍王體型倍率 的出貨值 —— 想替放大後的王加一列時填得進來，同時擋住貼錯格。",
      min: 0.1,
      max: 10,
    },
    y: {
      key: "rangeMult",
      zh: "普攻射程倍率",
      note: "這個體型的人，普攻打得到卡面射程的幾倍遠。1 = 照卡面。上界 3 擋的是把百分比當倍率填（打 120 進去＝120 倍射程，那位英雄會從整張地圖外面開打）；下界 0.1 是「這個機制最多拿走九成射程」。",
      min: 0.1,
      max: 3,
    },
    minRows: 2,
    maxRows: 8,
    previewAt: [
      { x: 0.6, who: "出貨最小體型（godie-ofar 等）" },
      { x: 1, who: "一般體型（89 位沒填 bodyScale 的人）" },
      { x: 1.5, who: "godie-obla（斷點之間，看得出內插）" },
      { x: 2, who: "godie-u01f 黑化張飛" },
      { x: 2.5, who: "斷點之間" },
      { x: 3, who: "godie-o030 臭作（出貨最大）" },
      { x: 8, who: "假想的放大殭屍王（表外，被夾住）" },
    ],
  },
};

// ───────────────────────────────────────────── 回血規則 (config/regen) ──

export const REGEN_SPEC: ConfigDocSpec<"regenRules"> = {
  page: "regenRules",
  collection: "config",
  docId: "regen",
  schemaTag: "config.regen@1",
  zod: zConfigRegenDoc,
  title: "回血與扣血規則",
  intro: [
    "⚠️ owner 2026-08-02 更正：「Berserker 是每秒**損失** 1%生命, 直到生命不足1%」。方向和 8/1 那句「回血 1%每秒」**相反**，而且多了一條 8/1 沒有的地板。所以出貨的英雄卡填的是**扣血** 1%，回血那一族目前沒有任何一位英雄在用。",
    "兩族欄位都是「英雄卡有填才啟動」：回血看 healthRegenPctOfMax（目前**沒有人**填），扣血看 healthDrainPctOfMax（只有 海克力斯 - Berserker 填了 0.01 ＝ 每秒 1%）。",
    "⚠️ **扣血不是傷害。** 它不走傷害管線，所以不吃 戰鬥系統 的傷害倍率、不會被護盾吸、不噴傷害數字、不算進任何人的輸出統計，也**扣不死人** —— 到了下面那條地板就停。要真的把人扣死，用的是天生技的真實傷害。",
    "⚠️ 扣血只在**戰鬥中**進行（和火圈、殭屍波同一條規矩），中場與商店不扣；回血則不設這道閘，維持既有行為。",
  ],
  consumer:
    "packages/shared/src/sim/regenRules.ts 的 healthRegenPerSec() / healthDrainPerSec() + applyHealthDrain()，由 sim/systems/RegenSystem.ts 每 tick 對每一個活著的單位呼叫；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.regenRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 護盾規則／格擋規則 同一個形態(#278)。",
  fields: derivedFields(zConfigRegenDoc, []),
  preserved: [],
};

// ─────────────────────────────────────────── 對戰錄影 (config/replay) ──

export const REPLAY_SPEC: ConfigDocSpec<"replayPolicy"> = {
  page: "replayPolicy",
  collection: "config",
  docId: "replay",
  schemaTag: "config.replay@1",
  zod: zConfigReplayDoc,
  title: "對戰錄影",
  intro: [
    "owner 2026-08-02：「請幫我預設打開，就算玩到一半就離開也應該有 replay 才對」。這一頁就是那個開關 —— 在它出現之前錄影**完全沒有開關**：`MatchRoom` 無條件開錄影檔，落地間隔與保留量寫死在程式裡，要動任何一個都得重建映像。",
    "⚠️ 「玩到一半就離開」本來就會留下一份錄影：錄影檔是**邊打邊寫**的（預設每 0.5 秒把緩衝交給磁碟），中途離場只是少了結尾那一行，列表會標成「未完成」，但仍然可以播。所以這一頁能改善的是「被硬砍時**最多丟幾秒**」，也就是下面的落地間隔。",
    "⚠️ 錄影是否真的寫得進磁碟**不在這一頁**。正式機曾經整段時間一場都沒錄到，原因是 `/data/replays` 的擁有者不是容器的 uid（EACCES），而那件事只有 `/healthz` 的 `replay.writable` 看得出來 —— 查法寫在 `docs/replay-observability.md`。這一頁全開也救不了一個寫不進去的目錄。",
    "⚠️ 錄影檔帶著每一位玩家的顯示名稱，所以下面兩格保留量同時是**個資保留期限**，不只是磁碟策略。",
  ],
  consumer:
    "apps/game-server/src/replay/policy.ts 的 replayPolicy() / replayRecordingEnabled() → MatchRoom.onCreate() 決定要不要 MatchRecorder.open()、Recorder.ts 的 flushMs() 設定落地間隔、store.ts 的 pruneReplays() 套用兩條保留量",
  effect:
    "**要重啟 game-server shard 才生效**（`Configs` 是開機時載入的內容登錄表，只有 戰鬥系統 與 基礎加成 有即時快取）。和 屬性上限／回血規則 同一個形態(#278)，這裡不假裝它是「下一場生效」。",
  fields: derivedFields(zConfigReplayDoc, []),
  preserved: [],
};

/**
 * 掛上後台的設定文件。
 *
 * ⚠️ **加一份新的之前，先確認它有真的消費端。** 判準是能不能替
 * {@link ConfigDocSpec.consumer} 寫出一個具體的、production 會呼叫到的函式。
 * 寫不出來就不要掛 —— 見檔頭第 1 條。
 */

// ─────────────────────────────────── 殭屍王出場演出 (config/boss-intro) ──

export const BOSS_INTRO_SPEC: ConfigDocSpec<"bossIntro"> = {
  page: "bossIntro",
  collection: "config",
  docId: "boss-intro",
  schemaTag: "config.boss-intro@1",
  zod: zConfigBossIntroDoc,
  title: "殭屍王出場演出",
  intro: [
    "殭屍王走進場的那幾秒要演什麼：既有的恐怖音效之後，中央跳出一面提示 —— 大字名言、那位英雄的描述、攻略要點、弱點 —— 停留幾秒之後淡出。",
    "⚠️ **「那位英雄」不是固定的喪標麥可。** `mobWaves.boss.championSource` 的出貨值是 **隨機**，王每次上場借的是當回合抽到的那一位英雄的臉、模型與數值。所以這一頁調的是「演多久、講幾條」，逐英雄要講什麼是文件裡的 `champions` 表（這一頁不編輯它，但儲存時原封不動帶著走）。",
    "⚠️ **名言（quote）出貨全部是空的，那不是漏填。** 每位英雄的名言是 GH#139／#142，資料還不存在；編一句台詞塞進去等於把缺資料偽裝成功能。空的時候大字整段不畫，其餘幾段照常顯示。",
    "⚠️ 這一段提示全程不吃點擊、也不會蓋住血條或技能列（#107）：擺不下的時候它先丟描述、再丟攻略要點，真的放不下就整個不畫。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/boss-intro.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/ui/hud/bossIntroModel.ts 的 bossIntroRules()／bossIntroContent()／bossIntroLifetime()，由 ui/hud/BossIntroOverlay.tsx 在 HudRoot 的渲染樹裡消費；文件走客戶端開機時 bootContent 灌進去的 Configs registry",
  effect:
    "**下一次客戶端重新載入時生效**（內容 bundle 是開機時讀進 Configs 的），不需要重開 game-server —— 這一段演出整段活在客戶端。",
  fields: derivedFields(zConfigBossIntroDoc, []),
  preserved: [
    {
      // #291 —— 走訪器把陣列一律歸成「不編輯的分支」，而這一格的合法值是
      // 三個字面字串的 enum。通用引擎唯一畫得出陣列的形狀是 `tables` 的
      // `stringList`，而它收的是**自由文字**：操作者打成 `descrption` 後台會放行、
      // 平台的嚴格 Zod 在 PUT 那一關才退回，理由是一句英文的 schema 錯誤。
      // 那比「這一頁不編輯它」更糟，所以它先走 preserved。
      path: "dropOrder",
      why: "走廊高度不夠時**先丟哪一段**（出貨 描述 → 攻略要點 → 弱點）。這一頁不編輯它，但每次儲存都原封不動帶著走 —— 掉了的話它會靜靜地退回出貨順序，於是「我明明設過先丟攻略要點」在下一次存檔之後就消失了，而畫面上只有在矮螢幕、而且剛好放不下的那幾場才看得出來。",
    },
    {
      path: "champions",
      why: "逐英雄的出場文案表（名言／攻略要點／弱點／推導依據）。這一頁不編輯它，但每次儲存都原封不動帶著走 —— 掉了的話王照樣會出場、面板照樣會跳，只是每一隻都只剩名字和描述，而畫面上完全看不出來少了東西。",
    },
  ],
};

