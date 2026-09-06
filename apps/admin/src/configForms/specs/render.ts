import { derivedFields, schemaToForm } from "../schemaToForm";
/**
 * 設定文件的**標籤資料**（畫質・特效回收・世界演出・場地天氣）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigModelLodDoc,
  zConfigVfxCleanupDoc,
  zConfigVfxScriptsDoc,
  zConfigVfxBudgetDoc,
  // 世界演出（2026-08-23 稽核）—— 六則「某個東西在某個座標出現／消失／掃過」
  // 的事件合成兩個模板 + 一張表。走 barrel，同上面那一族。
  zConfigWorldCuesDoc,
  zConfigWeatherDoc,
  WEATHER_KINDS,
  WEATHER_KIND_LABELS,
} from "@ggd/shared/content";
import type { ConfigDocSpec } from "../engine";
// ────────────────────────────────────────────── 畫質分級 (config/model-lod) ─

export const MODEL_LOD_SPEC: ConfigDocSpec<"modelLod"> = {
  page: "modelLod",
  collection: "config",
  docId: "model-lod",
  schemaTag: "config.model-lod@1",
  zod: zConfigModelLodDoc,
  title: "畫質分級",
  intro: [
    "玩家把畫質設成低／中／高／自適應時，遊戲實際去下載哪一階模型檔。目前 167 個模型裡有 83 個生了 -mid / -small 變體（49.7%），沒有變體的自動退回原檔，所以這張表不可能因為某個模型沒生變體而 404。",
    "這是效能↔畫質的取捨，不是事實 —— 手機發燙就往下調，模型太糊就往上調。",
  ],
  consumer: "apps/client/src/render/modelLod.ts 的 applyModelLodPolicy() → lodTierForPreset() → AssetManager 的 resolveLodPath()",
  effect: "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時才讀內容覆蓋層）。已經載進場的模型不會中途換階，那是刻意的：換階＝重新下載。",
  fields: derivedFields(zConfigModelLodDoc, []),
  preserved: [],
};

// ──────────────────────────────────────────── 特效回收 (config/vfx-cleanup) ─

export const VFX_CLEANUP_SPEC: ConfigDocSpec<"vfxCleanup"> = {
  page: "vfxCleanup",
  collection: "config",
  docId: "vfx-cleanup",
  schemaTag: "config.vfx-cleanup@1",
  zod: zConfigVfxCleanupDoc,
  title: "特效回收",
  intro: [
    "回合與回合之間，要把特效層那些「暖好的」共用網格池回收到什麼程度。實測過的症狀是「越打越鈍」「一場就很燙」：60 個不同半徑的預告圈打完，連 dispose() 之後場景上都還留著 72 個 mesh / 73 份材質。",
    "這是體感取捨：丟掉＝穩態記憶體最低，代價是下一回合第一次施法要重新配置；留著＝第一次施法不卡，代價是那些網格整場都在。",
  ],
  consumer: "apps/client/src/vfx/vfxCleanupPolicy.ts 的 vfxCleanupPolicy() → ringCapForRoundBoundary() → VfxSystem.resetForRound() 的 trimTelegraphPools()",
  effect: "玩家**下一次重新整理遊戲頁面**之後的每一個回合邊界生效（讀的時候才查，所以不必重開一場，但要重新載入客戶端才拿得到新的文件）。",
  fields: derivedFields(zConfigVfxCleanupDoc, []),
  preserved: [
    {
      path: "vfxHardCapExemptPrefixes",
      why: "⏳ 三秒終極上限的**常駐特效豁免表**（比對粒子系統名稱前綴）：torch-flame-（場地火把）、fire-ring-（火圈，整回合都在）、revive-（復活圈餘燼，活到有人救起來）、proj-（投射物拖尾）、coin- / flower-（地上的金幣與花的光點，活到被撿走）、login- / intermission-（登入頁與中場背景）。通用表單引擎畫不了字串陣列，所以這一頁不編輯它，但每次儲存都必須原封不動帶著走 —— 掉了的話上面那格「掃到哪裡」設成 scene 時，場地火把與地上的金幣光點會每三秒被收掉一次。要改它請走內容覆蓋層。⚠️ 走特效管線建立的常駐特效（角色身上的光暈、拖尾、火圈）**不必列在這張表**：它們在建立當下就被程式標成常駐了，這張表只是給那一族「直接 new 出來、不走管線」的系統用的。",
    },
  ],
};

// ───────────────────────────────────── 世界演出 (config/world-cues, 2026-08-23) ─

export const WORLD_CUES_SPEC: ConfigDocSpec<"worldCues"> = {
  page: "worldCues",
  collection: "config",
  docId: "world-cues",
  schemaTag: "config.world-cues@1",
  zod: zConfigWorldCuesDoc,
  title: "世界演出",
  intro: [
    "⚠️ 這一頁修的是**六件在遊戲裡看不見的事**。2026-08-23 的窮舉稽核（把伺服器發出的每一則事件對客戶端逐一比對）抓到七則事件：伺服器每次都算、每次都送到玩家的瀏覽器，而畫面上**一次都沒有發生過**。殭屍憑空出現、召喚物憑空出現又憑空消失、暗夜旗插下去沒有任何動靜、守護者睡著了沒有人知道、荊棘的鞭子從來沒被畫出來過。傷害照樣掉血，所以它看起來完全正常。",
    "六則接上去了，而且**不是六段程式** —— 它們在做同一件事（「某個東西在某個座標出現／消失／掃過了」），所以是**兩個模板 + 這一張表**：點（一個座標上的一次性爆發，5 列）與線（兩端之間的一道掃過，1 列）。要加第七則不必改程式，只要多一列。",
    "第七則（守護者出現）**刻意沒有接** —— 雕像是開場就站在那裡的實體，身體本來就畫得出來，而玩家真正要看的那一拍是它**甦醒**，那一則早就有畫。理由與「什麼時候這條理由會失效」寫在程式裡的豁免表，並且有一條測試在守：一則送到客戶端的事件要嘛有人畫、要嘛在豁免表上帶著理由，兩者皆非就紅。",
    "⛔ 這一頁沒有一格會改變任何傷害、任何一塊錢、任何一個實體的存在。每一列的第一格關掉，畫面就逐位元回到這一版之前。",
  ],
  consumer:
    "apps/client/src/vfx/worldCues.ts 的 worldCues() → worldCuePoint() / worldCueLine()，由 VfxSystem.handleEvent 的世界演出模板呼叫（點走 layeredPop，線走 strikeArc）",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時載內容覆蓋層）。⛔ 不必重開一場。",
  fields: derivedFields(zConfigWorldCuesDoc, [
    {
      path: "point.mobSpawn.enabled",
      zh: "殭屍破土：畫不畫",
      note: "殭屍在生怪點冒出來的那一瞬間。⭐ 在這一版之前這一則事件過線了但**沒有人畫它** —— 殭屍是憑空出現的。關掉＝逐位元回到這一版之前（事件照樣送、實體照樣在、傷害照樣結算，只是那一團不畫）。⭐ 這一格是這一列的一鍵 rollback。",
    },
    {
      path: "point.mobSpawn.heavy",
      zh: "殭屍破土：用重版",
      note: "關＝輕版（小、短、不搶戲）；開＝重版（大、亮、看得到）。⚠️ 沒有第三檔 —— 最亮的那一檔是死亡與 EX 施法在用的，這一頁的六件事沒有一件該跟它們一樣響。",
    },
    {
      path: "point.mobSpawn.heightY",
      zh: "殭屍破土：離地多高",
      note: "這一團從離地幾個世界單位的地方冒出來。0＝貼地，1 以上＝身體中段。⚠️ 綁錯高度的特效不是「醜」，是**看不見** —— 埋進地板下或飄在頭頂外。",
    },
    {
      path: "point.mobSpawn.tintR",
      zh: "殭屍破土：紅",
      note: "這一團顏色的紅成分（0–1）。三格一起看：殭屍破土的出貨配色是刻意跟它旁邊會發生的事分開的，改成跟傷害數字同色會讓玩家誤讀成一次打擊。",
    },
    {
      path: "point.mobSpawn.tintG",
      zh: "殭屍破土：綠",
      note: "這一團顏色的綠成分（0–1）。三格一起決定它在戰場上一眼分不分得出來 —— 跟地板、血條或傷害數字同色的演出，等於沒畫。",
    },
    {
      path: "point.mobSpawn.tintB",
      zh: "殭屍破土：藍",
      note: "這一團顏色的藍成分（0–1）。⚠️ 三格全部調到 0 不會關掉這一團，只會讓它變成黑的（黑色的加色特效在畫面上幾乎看不見）。要關請用第一格。",
    },
    {
      path: "point.summonSpawn.enabled",
      zh: "召喚物成形：畫不畫",
      note: "召喚物（96-04 獨孤九劍的九柄劍魂、91-002 亡靈大軍的食屍鬼）成形的那一下。同樣是在這一版之前完全沒有人畫。關掉＝逐位元回到這一版之前（事件照樣送、實體照樣在、傷害照樣結算，只是那一團不畫）。⭐ 這一格是這一列的一鍵 rollback。",
    },
    {
      path: "point.summonSpawn.heavy",
      zh: "召喚物成形：用重版",
      note: "關＝輕版（小、短、不搶戲）；開＝重版（大、亮、看得到）。⚠️ 沒有第三檔 —— 最亮的那一檔是死亡與 EX 施法在用的，這一頁的六件事沒有一件該跟它們一樣響。",
    },
    {
      path: "point.summonSpawn.heightY",
      zh: "召喚物成形：離地多高",
      note: "這一團從離地幾個世界單位的地方冒出來。0＝貼地，1 以上＝身體中段。⚠️ 綁錯高度的特效不是「醜」，是**看不見** —— 埋進地板下或飄在頭頂外。",
    },
    {
      path: "point.summonSpawn.tintR",
      zh: "召喚物成形：紅",
      note: "這一團顏色的紅成分（0–1）。三格一起看：召喚物成形的出貨配色是刻意跟它旁邊會發生的事分開的，改成跟傷害數字同色會讓玩家誤讀成一次打擊。",
    },
    {
      path: "point.summonSpawn.tintG",
      zh: "召喚物成形：綠",
      note: "這一團顏色的綠成分（0–1）。三格一起決定它在戰場上一眼分不分得出來 —— 跟地板、血條或傷害數字同色的演出，等於沒畫。",
    },
    {
      path: "point.summonSpawn.tintB",
      zh: "召喚物成形：藍",
      note: "這一團顏色的藍成分（0–1）。⚠️ 三格全部調到 0 不會關掉這一團，只會讓它變成黑的（黑色的加色特效在畫面上幾乎看不見）。要關請用第一格。",
    },
    {
      path: "point.summonDespawn.enabled",
      zh: "召喚物消散：畫不畫",
      note: "召喚物到期／被殺／主人死了／被新的擠掉時消失的那一下。關掉＝逐位元回到這一版之前（事件照樣送、實體照樣在、傷害照樣結算，只是那一團不畫）。⭐ 這一格是這一列的一鍵 rollback。",
    },
    {
      path: "point.summonDespawn.heavy",
      zh: "召喚物消散：用重版",
      note: "關＝輕版（小、短、不搶戲）；開＝重版（大、亮、看得到）。⚠️ 沒有第三檔 —— 最亮的那一檔是死亡與 EX 施法在用的，這一頁的六件事沒有一件該跟它們一樣響。",
    },
    {
      path: "point.summonDespawn.heightY",
      zh: "召喚物消散：離地多高",
      note: "這一團從離地幾個世界單位的地方冒出來。0＝貼地，1 以上＝身體中段。⚠️ 綁錯高度的特效不是「醜」，是**看不見** —— 埋進地板下或飄在頭頂外。",
    },
    {
      path: "point.summonDespawn.tintR",
      zh: "召喚物消散：紅",
      note: "這一團顏色的紅成分（0–1）。三格一起看：召喚物消散的出貨配色是刻意跟它旁邊會發生的事分開的，改成跟傷害數字同色會讓玩家誤讀成一次打擊。",
    },
    {
      path: "point.summonDespawn.tintG",
      zh: "召喚物消散：綠",
      note: "這一團顏色的綠成分（0–1）。三格一起決定它在戰場上一眼分不分得出來 —— 跟地板、血條或傷害數字同色的演出，等於沒畫。",
    },
    {
      path: "point.summonDespawn.tintB",
      zh: "召喚物消散：藍",
      note: "這一團顏色的藍成分（0–1）。⚠️ 三格全部調到 0 不會關掉這一團，只會讓它變成黑的（黑色的加色特效在畫面上幾乎看不見）。要關請用第一格。",
    },
    {
      path: "point.deathWardSpawn.enabled",
      zh: "死亡遺留插旗：畫不畫",
      note: "71-00 暗夜契約的暗夜旗在英雄倒下的地方豎起來的那一下。⭐ **黑圈本身不在這一頁** —— 那是一個實體，半徑是伺服器權威的；這裡只管插旗的那一瞬間。關掉＝逐位元回到這一版之前（事件照樣送、實體照樣在、傷害照樣結算，只是那一團不畫）。⭐ 這一格是這一列的一鍵 rollback。",
    },
    {
      path: "point.deathWardSpawn.heavy",
      zh: "死亡遺留插旗：用重版",
      note: "關＝輕版（小、短、不搶戲）；開＝重版（大、亮、看得到）。⚠️ 沒有第三檔 —— 最亮的那一檔是死亡與 EX 施法在用的，這一頁的六件事沒有一件該跟它們一樣響。",
    },
    {
      path: "point.deathWardSpawn.heightY",
      zh: "死亡遺留插旗：離地多高",
      note: "這一團從離地幾個世界單位的地方冒出來。0＝貼地，1 以上＝身體中段。⚠️ 綁錯高度的特效不是「醜」，是**看不見** —— 埋進地板下或飄在頭頂外。",
    },
    {
      path: "point.deathWardSpawn.tintR",
      zh: "死亡遺留插旗：紅",
      note: "這一團顏色的紅成分（0–1）。三格一起看：死亡遺留插旗的出貨配色是刻意跟它旁邊會發生的事分開的，改成跟傷害數字同色會讓玩家誤讀成一次打擊。",
    },
    {
      path: "point.deathWardSpawn.tintG",
      zh: "死亡遺留插旗：綠",
      note: "這一團顏色的綠成分（0–1）。三格一起決定它在戰場上一眼分不分得出來 —— 跟地板、血條或傷害數字同色的演出，等於沒畫。",
    },
    {
      path: "point.deathWardSpawn.tintB",
      zh: "死亡遺留插旗：藍",
      note: "這一團顏色的藍成分（0–1）。⚠️ 三格全部調到 0 不會關掉這一團，只會讓它變成黑的（黑色的加色特效在畫面上幾乎看不見）。要關請用第一格。",
    },
    {
      path: "point.guardianSleep.enabled",
      zh: "守護者重新睡著：畫不畫",
      note: "守護者久沒被打就回到休眠。這是「威脅解除」的訊號 —— 不知道它睡了的隊伍會繼續繞路。⚠️ 這一則事件的資料**只有一個 id**，位置是客戶端從那具身體現在站的地方讀來的。關掉＝逐位元回到這一版之前（事件照樣送、實體照樣在、傷害照樣結算，只是那一團不畫）。⭐ 這一格是這一列的一鍵 rollback。",
    },
    {
      path: "point.guardianSleep.heavy",
      zh: "守護者重新睡著：用重版",
      note: "關＝輕版（小、短、不搶戲）；開＝重版（大、亮、看得到）。⚠️ 沒有第三檔 —— 最亮的那一檔是死亡與 EX 施法在用的，這一頁的六件事沒有一件該跟它們一樣響。",
    },
    {
      path: "point.guardianSleep.heightY",
      zh: "守護者重新睡著：離地多高",
      note: "這一團從離地幾個世界單位的地方冒出來。0＝貼地，1 以上＝身體中段。⚠️ 綁錯高度的特效不是「醜」，是**看不見** —— 埋進地板下或飄在頭頂外。",
    },
    {
      path: "point.guardianSleep.tintR",
      zh: "守護者重新睡著：紅",
      note: "這一團顏色的紅成分（0–1）。三格一起看：守護者重新睡著的出貨配色是刻意跟它旁邊會發生的事分開的，改成跟傷害數字同色會讓玩家誤讀成一次打擊。",
    },
    {
      path: "point.guardianSleep.tintG",
      zh: "守護者重新睡著：綠",
      note: "這一團顏色的綠成分（0–1）。三格一起決定它在戰場上一眼分不分得出來 —— 跟地板、血條或傷害數字同色的演出，等於沒畫。",
    },
    {
      path: "point.guardianSleep.tintB",
      zh: "守護者重新睡著：藍",
      note: "這一團顏色的藍成分（0–1）。⚠️ 三格全部調到 0 不會關掉這一團，只會讓它變成黑的（黑色的加色特效在畫面上幾乎看不見）。要關請用第一格。",
    },
    {
      path: "line.damageLine.enabled",
      zh: "荊棘直線：畫不畫",
      note: "18-00 薔薇荊棘之刃（妖狐藏馬）每一次普攻掃出去的那條直線。⛔ 在這一版之前，被打到的人只看得到自己莫名其妙掉血 —— 寫這個效果的人自己留了一句「玩家必須**看見**那一鞭，而不只是被它打到」，而那條線一次都沒有被畫出來過。關掉＝回到那個狀態。",
    },
    {
      path: "line.damageLine.power",
      zh: "荊棘直線：多粗多炸",
      note: "0.4＝一絲細線；2＝又粗又炸（粗細與分岔一起放大）。⚠️ 它與傷害無關 —— 打多痛是技能設定的事，這一格只決定看起來多痛。",
    },
    {
      path: "line.damageLine.lifeMs",
      zh: "荊棘直線：留幾毫秒",
      note: "太短＝眨眼就錯過（等於沒畫）；太長＝這支英雄**每一次普攻**都會掃一條，畫面會被塗滿。出貨值刻意偏短，因為它是普攻觸發而不是技能觸發。",
    },
    {
      path: "line.damageLine.heightY",
      zh: "荊棘直線：離地多高",
      note: "這條線畫在離地幾個世界單位。太低會沉進地板、太高會從敵人頭上飛過去 —— 兩種都會讓玩家覺得「明明沒打到我」。",
    },
    {
      path: "line.damageLine.tintR",
      zh: "荊棘直線：紅",
      note: "線的紅成分（0–1）。三格一起看：出貨配色是荊棘綠，刻意跟傷害數字的紅／紫分開 —— 同色會讓玩家把這條線讀成一次打擊而不是一道範圍。",
    },
    {
      path: "line.damageLine.tintG",
      zh: "荊棘直線：綠",
      note: "線的綠成分（0–1）。三格一起決定這條鞭子在戰場上一眼分不分得出來 —— 跟地板或血條同色的線，等於沒畫。",
    },
    {
      path: "line.damageLine.tintB",
      zh: "荊棘直線：藍",
      note: "線的藍成分（0–1）。⚠️ 三格全部調到 0 不會關掉這條線，只會讓它變成黑的（幾乎看不見）。要關請用第一格。",
    },
    {
      path: "hud.mobBossFadeInSec",
      zh: "殭屍王橫幅：淡入秒數",
      note: "殭屍王降臨橫幅與（殭屍王／特殊殭屍）分紅結算面板從透明淡入到全亮要幾秒。⭐ owner 2026-08-24（#642）「太佔螢幕 說明半秒淡出半秒就好」——出貨 {{出貨值}}。⚠️ **淡入＋淡出就是橫幅在畫面上的全部壽命**（中間沒有停住的一段，太佔螢幕的正是停住那一段）；兩格都調 0＝這兩張橫幅完全不畫（獎金照發、音效照播，只是沒有畫面說明）。",
    },
    {
      path: "hud.mobBossFadeOutSec",
      zh: "殭屍王橫幅：淡出秒數",
      note: "同一對橫幅從全亮淡回透明要幾秒，出貨 {{出貨值}}（#642）。玩家實際能讀字的時間大約就是淡入的後半＋這一段的前半 —— 覺得結算表閃太快讀不完，調大**這一格**（例如 2）就拿回停留感，不必改程式。",
    },
  ]),
  preserved: [],
};

// ──────────────────────────────────────────── 場地天氣 (config/weather) ────

const WEATHER_KIND_OPTIONS = WEATHER_KINDS.map((k) => ({
  value: k,
  // ⚠️ 選項的中文**從 schema 讀**，⛔ 不在這裡重打一次 —— 重打就是第二份會漂的
  //    知識，而 `configTables.test.ts` 正是為了這種 drift 才拿 Zod enum 交叉比對。
  zh: `${k}｜${WEATHER_KIND_LABELS[k]}`,
}));

export const WEATHER_SPEC: ConfigDocSpec<"weather"> = {
  page: "weather",
  collection: "config",
  docId: "weather",
  schemaTag: "config.weather@1",
  zod: zConfigWeatherDoc,
  title: "場地天氣",
  intro: [
    "owner 2026-08-23：「**do it, 但有開關**」／「但是**有些場景是室內**，請**不要下雨**會很奇怪」／「另外一個天氣特效是**起霧** 你覺得如何？」",
    "⭐ 這一頁是「光追的質感」裡**玩家真的看得到**的那一部分。WebGPU 標準沒有光線查詢，而這一版相機俯角 68° ⇒ 地面佔畫面八成、而地面在光追之前沒有東西可以反射 —— 所以做的是**地面本身**：它濕不濕、有沒有積水、空氣有多濁。⭐ 成本是**零個額外 render pass**（材質常數 ＋ 已經在跑的那顆 scene.fog）。",
    "⭐ 最下面那張表是**逐場地一格**。左邊是場地 id，右邊是它是哪一種天氣 —— 而 `indoor-` 開頭的那兩個就是 owner 說的「室內不要下雨」：它們的降雨權重是 0，而且那是**機器可驗的**（守衛只看 id 前綴）。⚠️ 沒有列在表上的場地一律算「晴朗」＝ 這一版之前的樣子，所以一張新地圖不會因為忘了填而突然下雨。",
    "⚠️ **閃電不在這一頁選。**「這張圖有沒有雷」早就有住處了：場地自己的 `scenery.lighting.wave = storm`（出貨的無限城與終局大混戰兩張都宣告了）。這一頁只提供「閃到多亮」。⇒ 於是無限城（榻榻米地板＝室內）同時是「⛔ 不下雨」與「⭐ 會閃電」，⛔ 不必為它開例外。",
    "⚠️ **霧的上界是玩法界線，⛔ 不是品味**：owner 說過這張地圖是全視野、就算牆後也看得到。所以霧只可以讓遠方**朦朧**，⛔ 不可以讓遠方**消失** —— 那條線由一條會紅的測試守著（它拿出貨場地量得到的最遠對戰距離去算殘留亮度）。把霧調到上限仍然看得到敵人。",
    "⭐⭐ **起霧是「一片飄過去」，⛔ 不是全場地一片均勻。** owner 2026-08-23：「起霧＝空氣漫反射同一顆旋鈕轉大 => **不是全場地都霧喔，而是像真實一樣會有一片飄過去，隨機產生不規則形狀霧**」。⇒ 霧有**兩層**，而它們**共用這一頁的同一格開關與同一個級別權重**：①**空氣**（`起霧：最濃時的濃度`，遠處被洗淡的那一半，⭐ 它是基礎不是霧）②**飄過去的那一片**（下面五格 `起霧：…`）。⚠️ 因為這一則裁決，①的出貨值被**砍半**（0.005 → 0.0025），預算搬到了②。",
    "⭐ 那一片霧的顏色**不在這一頁選** —— 它每幀從這一刻的空氣色抄（＝天光＋主光，雷雨場地閃電打下來時它會跟著亮）。⇒ ⛔ 不可能出現「空氣是暖的、飄過去那片是灰的」。",
    "⭐ **N 片霧 = N 條互斥車道，而且全部同一個高度** ⇒ 畫面上任何一點**最多被一片蓋到**。這不是統計是幾何（霧片的外接半徑被夾進車道半寬），而玩法閘正是靠它才有一個算得出來的最壞情況。⚠️ 所以「片數」調大**不會**讓某一點變濃，只會讓每一片變窄。",
  ],
  consumer:
    "apps/client/src/render/weather.ts 的 weatherPolicy() → ArenaScene.buildArena() 的 buildZoneGround（濕地面／積水材質）與 buildFogBanks（飄過去的那一片霧）與 Lighting.write()（全域霧濃度／雷擊補光）",
  effect:
    "全域霧（①空氣）與雷擊補光：玩家**下一次重新整理遊戲頁面**之後**立即**生效（不必重開一場）。濕地面、積水與**飄過去的那一片霧**（②）：**下一回合換圖**時生效（它們是建場地當下決定的 mesh／材質，⛔ 不是每幀寫的東西）。",
  fields: derivedFields(zConfigWeatherDoc, []),
  tables: [
    {
      path: "arenas",
      shape: "recordEnum",
      title: "逐場地天氣（出貨 13 列）",
      intro: [
        "**左邊是場地 id，右邊是它是哪一種天氣。** 這是 owner「有些場景是室內，不要下雨」那句話唯一的落點。",
        "⚠️ 左邊是**逐字比對**的場地 id（`arena.nazarick` 這種）。打錯一個字的後果是那張圖靜靜地回到「晴朗」，⛔ 而畫面上不會有任何錯誤 —— 所以打完請對照場地輪替那一頁的清單。",
        "⚠️ 這張表**整批取代**，不和出貨值合併：刪掉一列 = 那張圖從此算「晴朗」，⛔ 不是「回到出貨的那一種」。",
        "⭐ 出貨那 13 列裡**只有兩列有逐字證據**：`arena.castle` 的名字寫著「城堡競技場（室內）」、`arena.colosseum` 寫著「羅馬大擂台（室外）」。其餘 11 列是依場地名稱、地板材質與作者已經畫好的天光判斷的 —— 覺得哪一張判錯了，改這一格就好，⛔ 不必改任何程式。",
        "⭐ 判不出來的一律填了 `clear` 或 `fog`（**兩者都不濕**）⇒ 就算某張室內圖被誤判成室外，玩家也**不會**看到室內下雨。保守的方向是刻意的。",
      ],
      key: {
        zh: "場地 id",
        note: "`content/arenas/*.json` 的 `id` 欄位，逐字。⚠️ 不是場地的中文名字 —— 填中文名字的那一列永遠不會命中，而症狀只是那張圖沒有天氣。",
        maxLen: 64,
      },
      value: {
        zh: "哪一種天氣",
        note: "⭐ `indoor-` 開頭的兩個是**室內**：`indoor-dry` 完全沒有天氣，`indoor-damp` 是洞窟／地窖的滲水（地面濕、有積水、薄霧）——⭐ 滲水**不是雨**，所以它不違反 owner 的「室內不要下雨」。",
        options: WEATHER_KIND_OPTIONS,
      },
      minRows: 0,
      maxRows: 200,
    },
  ],
  preserved: [],
};


// ─────────────────────────────────── 演出腳本開關 (config/vfx-scripts) ──

export const VFX_SCRIPTS_SPEC: ConfigDocSpec<"vfxScripts"> = {
  page: "vfxScripts",
  collection: "config",
  docId: "vfx-scripts",
  schemaTag: "config.vfx-scripts@1",
  zod: zConfigVfxScriptsDoc,
  title: "演出腳本",
  intro: [
    "GH#838 特效工坊：`content/vfx-scripts/` 裡每一份演出腳本（一支技能一份時間軸 —— 超究武神霸斬、龍破斬、理想鄉EX 這一族的全動畫）要不要播。",
    "這一格是「自己判斷但留後台開關」的那個開關：關掉＝播放器對每一個事件直接跳過，有腳本的技能退回它沒有腳本時的預設演出，**逐位元同開關存在之前**。⛔ 它不影響任何傷害／行為 —— 腳本是純演出，行為真相在技能 JSON。",
  ],
  consumer:
    "apps/client/src/vfx/VfxSystem.ts 的 VfxScriptPlayer（每一個事件都活讀這一格；缺文件＝開，⛔ 不是關 —— 部署漏帶 JSON 不可以讓整座工坊靜默消失）",
  effect: "玩家**下一次重新整理遊戲頁面**生效（客戶端載入內容時讀，一場中途改要重整）。",
  fields: derivedFields(zConfigVfxScriptsDoc, []),
  preserved: [],
};


// ───────────────────────────────── 粒子密度上限 (config/vfx-budget) ──

export const VFX_BUDGET_SPEC: ConfigDocSpec<"vfxBudget"> = {
  page: "vfxBudget",
  collection: "config",
  docId: "vfx-budget",
  schemaTag: "config.vfx-budget@1",
  zod: zConfigVfxBudgetDoc,
  title: "粒子密度上限",
  intro: [
    "owner 2026-08-28：「所有特效粒子特效密度要受到上限值管制，後台可設定，這次的特效編輯器裡設定共同遵守上限值，這個上限值也會**卡入實際遊戲前端執行的單個特效上限值**」。",
    "⭐ 一份文件、三個消費端共用：出貨前端的每一個粒子系統（particleFactory 的 capacityFor/rateFor）、特效工坊 studio 的預覽、以及這一頁。所以**編輯器裡看到的密度就是上線的密度** —— ⛔ 不會出現「工坊調得很漂亮、上線被另一套上限砍掉」。",
    "⚠️ 這是**單發**的上限（一個特效自己能多密），⛔ 不是「場上總共幾個特效」——那一族是 特效回收 與 三秒鐵則 在管，兩者不衝突。",
  ],
  consumer:
    "apps/client/src/vfx/particleFactory.ts 的 capacityFor()／rateFor()（每一個 ParticleSystem 的容量與 emitRate 都從這兩支出來）；由 ContentDb.load() 裝上，與 setOneShotMaxLifeSec／setFamilyTuning 同一條路",
  effect: "玩家**下一次重新整理遊戲頁面**之後生效（客戶端載入內容時讀一次）。",
  fields: derivedFields(zConfigVfxBudgetDoc, []),
  preserved: [],
};
