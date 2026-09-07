/**
 * 設定文件的**標籤資料**（混音・手把・練習模式・排名獎勵・圖示畫風）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  // 混音（owner 2026-08-17）。⚠️ 它的 Zod 住在 `schema/audioMixDoc.ts`，但
  // `schema/index.ts` 有把它 re-export 出來（和 mapSpecDoc 同一條路），所以這裡
  // 走 barrel 而不是深路徑 —— 深路徑那條沒有守衛在看，遲早會指到搬走的檔案。
  zConfigAudioMixDoc,
  // 練習模式（GH#343）—— 同上，schema/index.ts 有 re-export，走 barrel。
  zConfigPracticeDoc,
  // 排名獎勵（owner 2026-08-17）—— 同上，schema/index.ts 有 re-export，走 barrel。
  zConfigRankingDoc,
  // 地端產圖的風格（owner 2026-08-17）—— 同上，schema/index.ts 有 re-export。
  zConfigIconStyleDoc,
  // 手把手感（GH#520，owner 2026-08-22）—— 走 barrel，同上面那一族。
  zConfigGamepadDoc,
} from "@ggd/shared/content";
import type { ConfigDocSpec } from "../engine";
import { derivedFields } from "../schemaToForm";
// ────────────────────────────────────────────────── 混音 (config/audio-mix) ─

export const AUDIO_MIX_SPEC: ConfigDocSpec<"audioMix"> = {
  page: "audioMix",
  collection: "config",
  docId: "audio-mix",
  schemaTag: "config.audio-mix@1",
  zod: zConfigAudioMixDoc,
  title: "混音",
  intro: [
    "⭐ owner 2026-08-17：「**其他角色語音應該是自己的一半**」。這一頁就是那個比例。",
    "⚠️ 它**疊在**空間化衰減之上，不取代它：遠處的敵人本來就比較小聲，這一格是把「不是我」那一整族（敵人／隊友／小怪）整體再壓下去。所以調它不會讓遠近的差別消失。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/audio-mix.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "apps/client/src/audio/voiceAudience.ts 的「其他角色」音量（文件由 ContentDb 載入時餵進去；接線本身屬於 #339 那一條 lane，這一頁只負責讓它可調）；回合結束那兩格則是 apps/client/src/audio/roundEndVoice.ts（GH#527，同一份文件同一個 voice 物件，由 voiceMixPolicy.applyAudioMixDoc 一起轉發）",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時才讀內容覆蓋層）。⛔ 不需要重啟 game-server —— 語音整段活在客戶端。",
  fields: derivedFields(zConfigAudioMixDoc, []),
  preserved: [],
};

// ─────────────────────────────────────────────── 手把手感 (config/gamepad) ─

export const GAMEPAD_SPEC: ConfigDocSpec<"gamepad"> = {
  page: "gamepad",
  collection: "config",
  docId: "gamepad",
  schemaTag: "config.gamepad@1",
  zod: zConfigGamepadDoc,
  title: "手把手感",
  intro: [
    "手把摸起來是什麼感覺，全部在這一頁。GH#520 之前這五格是 `apps/client/src/input/GamepadInput.ts` 的五個 module-level 常數 —— 想把死區調鬆一格要改程式、重建 client 映像、重新部署（第一守則）。而死區太緊／太鬆是**每一個手把玩家第一天就會抱怨**的東西。",
    "⭐ **這一頁上線的當天，手感一個位元都沒有變**：五格的出貨值逐字等於原本那五個常數。機制上線、數值一格沒動 —— 所以「後台調得到了」與「手感被改掉了」不會混在同一次部署裡。",
    "⚠️ 消費端是**客戶端**（`input/GamepadInput.ts` 每一幀重讀），所以存檔之後玩家**重整一次分頁**就生效，⛔ 不必重建映像、⛔ 不必重啟 shard。",
    "⚠️ 這一頁**只管手把**。觸控（`input/TouchInput.ts`）今天仍然吃出貨常數，⛔ 存這一頁不會改變觸控的手感 —— 那要另一份文件，⛔ 不是借住這一份。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/gamepad.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/input/GamepadInput.ts 的 activeGamepadFeel()（讀 Configs 登錄表），由 GamepadInput.poll()（死區＋長按門檻）與 mapGamepadFrame()（兩個前導距離＋搜敵半徑）每一幀消費",
  effect: "**存檔就生效**，玩家重整一次分頁即可。⛔ 不必重建映像，也⛔ 不必重啟任何服務。",
  fields: derivedFields(zConfigGamepadDoc, []),
  preserved: [],
};

// ───────────────────────────────────────────── 練習模式 (config/practice) ─

export const PRACTICE_SPEC: ConfigDocSpec<"practice"> = {
  page: "practice",
  collection: "config",
  docId: "practice",
  schemaTag: "config.practice@1",
  zod: zConfigPracticeDoc,
  title: "練習模式",
  intro: [
    "⭐ owner 2026-08-17：「新增練習模式，可以選擇場地及角色，但**進入不會有對戰**，可以使用各種功能測試碼，以及**即時生成殭屍**等特殊單位」。這一頁是那間沙盒房的五格規則。",
    "⚠️ 練習房是**單人沙盒**：沒有敵隊、不結算、⛔ 不發水晶、⛔ 不動 MMR、⛔ 不寫任何玩家資料。正因為它對經濟與排名零影響，「在練習房裡開放測試碼」才不是經濟漏洞。",
    "⚠️ 這一頁**不影響任何一場正式比賽** —— 一間房要先被開成練習房才會讀到這份文件。要整個關掉就把總開關關掉，那就是一鍵 rollback。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/practice.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/game-server/src/match/MatchController.ts（相位機不配對手／不結束、火圈與自動復活）與 apps/game-server/src/match/cheatGate.ts（練習房開放測試碼）",
  effect: "**要重啟 game-server shard 才生效**。和 冷卻規則／減傷規則 同一個形態(#278)。",
  fields: derivedFields(zConfigPracticeDoc, []),
  preserved: [],
};

// ─────────────────────────────────────────── 排名獎勵 (config/ranking) ─

export const RANKING_SPEC: ConfigDocSpec<"ranking"> = {
  page: "ranking",
  collection: "config",
  docId: "ranking",
  schemaTag: "config.ranking@1",
  zod: zConfigRankingDoc,
  title: "排名獎勵",
  intro: [
    "⭐ owner 2026-08-17：「**MMR 倍率跟賽季積分也是類似的規則**，獎勵大家多打真人賽，並且**真實記錄 vs 特定玩家的幾勝幾敗**來影響 MMR & 賽季積分」。這一頁就是那兩件事的全部參數。",
    "⚠️ 這一組真人倍率與**藍水晶那一組是分開的兩份**（可以各自調，出貨值刻意一致）：operator 想加碼經濟獎勵而不動排名、或反過來，都不該被迫連動。要改水晶那一半請去 商店經濟。",
    "⭐ **賽季積分吃滿倍率、MMR 只吃 5%**，這是設計判斷不是做一半：Elo 是一個**收斂到真實實力的估計值**，直接乘 13 會讓排名劇烈震盪，而且**打一場 bot 局就把它拉回去**（bot 局倍率是 1，同一個實力估計被兩種尺度輪流拉扯，估得更差）。想讓 MMR 也吃滿就把「MMR 吃多少倍率」調到 100。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ranking.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "apps/platform/internal/ranking/standingsoverride.go 的 StandingsRulesNow()（每一場結算重讀覆蓋層）→ standings.go 的 SeasonPointsMulPct / RatingKMulPct / RivalryTotalPct",
  effect:
    "**存檔就生效，下一場結算就是新規則。** ⛔ 不需要重啟任何東西 —— platform 在每一場結算的當下重讀覆蓋層（⚠️ 和 M幣 那一段不一樣，那一段要重啟）。",
  fields: derivedFields(zConfigRankingDoc, []),
  preserved: [],
};

// ─────────────────────────────────────── 圖示畫風 (config/icon-style) ─

export const ICON_STYLE_SPEC: ConfigDocSpec<"iconStyle"> = {
  page: "iconStyle",
  collection: "config",
  docId: "icon-style",
  schemaTag: "config.icon-style@1",
  zod: zConfigIconStyleDoc,
  title: "圖示畫風",
  intro: [
    "⭐ owner 2026-08-17：圖示要**地端生成**，兩階段 ——「第一階段生成**特徵**，第二階段生成**風格（日本 2D RPG）**，精緻但**不要過度花俏複雜**的顏色內容」。這一頁就是**第二階段**那一段風格，以及兩階段共用的取樣火候。",
    "⚠️⚠️ **這一頁跟其他每一頁的生效時機都不一樣。** 別的設定是遊戲執行時讀的，改了下一場就不同；這一份是**產圖那台機器**讀的 —— 它只在**下一次跑產圖時生效，⛔ 不影響任何一張已經產出的圖**。改完之後畫面上不會有任何變化，要重跑產圖（`python3 tools/icon-gen/local/batch.py --force`）才看得到差別。",
    "⚠️ 第一階段畫的是**「這張圖畫的是什麼」**（哪一位英雄、哪一張聖杯願望），那份特徵表住在 `tools/icon-gen/local/keywords.py`，⛔ 不在這一頁。這一頁只管**畫風**。兩者分開是刻意的：把風格詞寫進第一階段，主體會被塗成一團看不出是什麼的東西 —— 那正是兩階段當初要修的缺陷。",
    "⚠️⚠️ **要在跑產圖的那台機器上改這一頁。** 產圖器讀的是 repo 裡的 `content/config/icon-style.json`；在**線上** admin 存檔寫的是伺服器 `data/` 的耐久覆蓋層，⛔ 那份覆蓋層不會回到任何人的工作區，所以線上改完再去本機跑產圖，畫出來的還是舊風格。在 localhost 的後台／編輯器改就沒這個問題（那條路直接寫 repo 檔案）。",
  ],
  consumer:
    "tools/icon-gen/local/keywords.py 的 load_icon_style() → pass2_prompt()（風格與負向提示詞）與 batch.py 的取樣參數預設值（strength / 步數 / CFG / 邊長）",
  effect:
    "**下一次跑產圖時生效，⛔ 不影響已經產出的圖。** 遊戲端、game-server 都不讀這份文件，所以⛔ 不需要重啟任何東西。",
  fields: derivedFields(zConfigIconStyleDoc, []),
  preserved: [
    {
      path: "loras",
      why: "⭐ GH#457 掛在產圖模型上的 **LoRA 清單**（`[{path, weight}]`，路徑相對於 `tools/icon-gen/models/`）。**這一頁畫不出它** —— 通用走訪器只長得出純量欄位，`{路徑, 強度}` 的陣列一律歸成不編輯的分支，所以它走「原封不動帶著走」這條路：⛔ 掉了的話下一次產圖會**整批換一個畫風**，而畫面上完全看不出來（`content/config/icon-style.json` 裡它就消失了）。要改它請直接改那份 JSON，或用 localhost 的內容編輯器。⚠️ 順帶：LoRA 檔本身是 gitignore 的本機檔，所以在**線上** admin 填一個路徑一定是空的 —— 那也是這一格不做成輸入框的第二個理由。",
    },
  ],
};

