/**
 * 設定文件的**標籤資料**（競技場規則（唯一被四頁同時編輯的文件））—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  // 競技場規則（GH#410）—— 走 barrel，同上面那一族。⚠️ 這一份是全 repo 唯一一份
  // 被四頁共同編輯的 config，所以它是唯一用得到 `ConfigDocSpec.elsewhere` 的。
  zConfigArenaRulesDoc,
} from "@ggd/shared/content";
import type { ConfigDocSpec, ConfigFieldLabel, ElsewhereField } from "../engine";
import { derivedFields, schemaToForm } from "../schemaToForm";

/**
 * ⭐ GH#1001 —— 這幾格的人話住在 Zod 的 `@zh` / `@note`（`../schemaToForm` 讀得懂），
 * ⛔ 不在這裡再打一次（第〇·四守則：一句人話一個住處）。缺 `@zh` 的葉子推導出來是
 * 空字串 ⇒ `configForms.test.ts`「名稱不是中文」當場紅，⛔ 不會安靜地少一格。
 */
const fromZod = (pick: (path: string) => boolean): ConfigFieldLabel[] =>
  schemaToForm(zConfigArenaRulesDoc)
    .fields.filter((f) => pick(f.path))
    .map(({ path, zh, note, optionLabels }) => ({ path, zh, note, ...(optionLabels ? { optionLabels } : {}) }));
// ─────────────────────────────── 競技場規則 (config/arena-rules) — GH#410 ──
//
// ⚠️ 這一份是全 repo **唯一**一份被四頁共同編輯的 config 文件，而 GH#410 量到的
// 缺口就是那個結構的後果：三頁手刻的專屬頁各編一塊（殭屍波系統 / 傳說武器三選一 /
// 對戰設定），而**沒有任何一頁認領剩下的**，於是 rounds · overflow · flowers ·
// reviveCircles · guardianTower · goldDrop · ultUnlockRound · exUnlockRound
// 八個頂層區塊一格都調不到 —— 治療花的回血、守護塔的 HP 與齊射、復活圈的詠唱、
// 掉金、大絕與 EX 解鎖回合，每一格改一次都要完整部署。
//
// ⭐ 共同根因**不是**「八個區塊各自被漏掉」，是**一個**結構性的洞：
// `arena-rules` 走的是 configDocCoverage 的**文件層**豁免（OWN_PAGE），
// 而文件層豁免一旦成立，欄位層就再也沒有任何守衛在數 —— 通用引擎的
// 「每一個葉節點都有標籤」只跑在 CONFIG_DOC_SPECS 上，而它不在裡面。
// ⇒ 修法是把它**放進** CONFIG_DOC_SPECS（於是那條雙向守衛開始管它），
// 已經有專屬頁的區塊走 `elsewhere` 逐列宣告「它在哪一頁編」。
/**
 * ⭐ 這一份被**四頁**共同編輯，所以「這一頁不畫哪幾塊」是一個**決定**，⛔ 不是註解。
 * GH#992 之後 `fields` 由 `derivedFields()` 從 Zod 推導 ⇒ 這張表同時要當**濾網**
 * （`except`）與**宣告**（`elsewhere`）——⛔ 兩份會分頭腐爛，所以只有這一份。
 */
const ARENA_RULES_ELSEWHERE = [
    {
      path: "mobWaves",
      why: "殭屍波系統（`apps/admin/src/mobWaves.ts` + ui/MobWavesPage.tsx）整頁在編這一塊 —— 生怪節奏、小怪／精英／殭屍王的三套數值、分紅結算、血條。⛔ 在這裡再畫一次那 150 格＝第二份會 drift 的標籤表。",
    },
    {
      path: "itemDraft",
      why: "傳說武器三選一（`apps/admin/src/itemDraft.ts` + ui/ItemDraftPage.tsx）在編：候選不足時發短卡／借表／重複補滿、備援獎池、單張卡抽取上限。",
    },
    {
      path: "grailDraft",
      why: "傳說武器三選一那一頁的「聖杯顯現規則」區塊（`apps/admin/src/grailDraft.ts`）在編：靈基適性條件、槽位多樣性、偏好加權、舊池收不收。",
    },
    {
      path: "legendaryShelf",
      why: "傳說武器三選一那一頁的「寶具能不能直接買」區塊在編：上架開關、統一價倍率、賣出退款率。⚠️ 那三格與這一頁的「普通武器道具上不上架」是**兩個不同的貨架**（owner 2026-08-17 只讓寶具上架），刻意分開。",
    },
    {
      path: "draftConflict",
      why: "傳說武器三選一那一頁的「同一回合撞卡時發哪一個」（#340）。它有五個選項而且每一個都附一段「玩家會看到什麼」，那種說明放在通用長表單的一格下拉旁邊讀不完。",
    },
    {
      path: "bothDraftsExtraSec",
      why: "傳說武器三選一那一頁在編（owner 2026-08-18「商店時間要延長 10 秒鐘」）。它只在**真的兩張都發出去**的回合才加，與上面那格撞卡裁決是同一個決定的兩半，所以同頁。",
    },
    {
      path: "disadvantageWeights",
      why: "傳說武器三選一那一頁在編（GH#355 已補上的三格純量：回合勝場差／裝備價值差／近期戰績差）。它決定「誰算劣勢方」，而劣勢值同時餵給寶具與聖杯兩張升級表，所以和那兩張表同頁。",
    },
    {
      path: "offerCount",
      why: "對戰設定（`apps/admin/src/matchConfig.ts`）在編，傳說武器三選一那一頁**唯讀**顯示它。⚠️ 它同時管聖杯願望與寶具兩種卡的張數 —— 在這裡再開一個輸入框會讓操作者以為自己只改了其中一種。",
    },
    {
      path: "overflow",
      why: "⛔ **今天沒有任何一頁在編它，而且這一頁刻意不畫** —— 這一塊在出貨文件裡**整塊缺席**（＝機制關著），而通用引擎只寫被改過的那幾格，於是填一格會送出半塊 `overflow`，被 Zod 的 `.strict()` 整份退回 → 內容載入整份失敗 → 骨架英雄（2026-08-02 事故的形狀）。要打開它請走「內容管理」貼整塊 JSON。⚠️ 通用引擎長出「整塊啟用／停用」的開關那一天，這一列該退場。",
    },
    {
      path: "gacha",
      why: "⛔ 同 `overflow`：**整塊缺席**的舊版每回合免費抽獎（現在的做法是回合表的 `weaponLootTable` 三選一）。它在出貨文件裡不存在，畫出來只會請操作者寫出半塊文件。⚠️ 這個機制正式退場的那一天，這一列應該連同 schema 的欄位一起刪掉，⛔ 不是留著一個沒有人記得的舊路徑。",
    },
  ];
/** `ARENA_RULES_ELSEWHERE` 涵蓋到的路徑（含子路徑）—— 這一頁不畫它們。 */
const arenaRulesElsewhere = (path: string): boolean =>
  ARENA_RULES_ELSEWHERE.some((e) => path === e.path || path.startsWith(`${e.path}.`));

export const ARENA_RULES_SPEC: ConfigDocSpec<"arenaTuning"> = {
  page: "arenaTuning",
  collection: "config",
  docId: "arena-rules",
  schemaTag: "config.arena-rules@1",
  zod: zConfigArenaRulesDoc,
  title: "競技場規則",
  intro: [
    "一場比賽的**場上規則**：治療花、復活圈、守護塔、陣亡投幣，加上大絕／EX 解鎖回合、最後一回合、bot 怎麼花錢、以及 #261 那 70 把普通武器上不上架。",
    "⭐ 這一頁補的是 GH#410 —— 這幾格在 2026-08-20 之前**一格都調不到**（只走「原封不動帶著走」），改一個數字要改 repo、重建映像、重啟容器。",
    "⚠️ 同一份文件還有三頁在編別的區塊：**殭屍波系統**（mobWaves）、**傳說武器三選一**（三選一規則／撞卡裁決／寶具貨架／劣勢權重）、**對戰設定**（卡片張數）。下面的欄位刻意**不重複**那三頁的任何一格 —— 同一個數字兩個輸入框，改了哪一個會贏是操作者猜不出來的。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/arena-rules.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
    "⚠️ **一個機制整塊缺席時（`overflow` / `gacha`）這一頁不畫它** —— 那兩塊在出貨文件裡不存在（＝機制關著），而通用引擎只寫你改過的那幾格，半塊送出去會讓整份 arena-rules 被 Zod 退回，於是**整份內容載入失敗、退回骨架英雄**（2026-08-02 那次線上事故的形狀）。要打開它們請走「內容管理」貼整塊 JSON。",
    "⛔⛔ **第十一回合（`round11`）那 21 格今天是一副骨架** —— 出貨 `enabled: false`，而 sim 那一半（生怪、大轟炸、換邊操作王、計分）**還沒接**（GH#919–#925）。⚠️ 打開總開關**不會發生任何事**，⛔ 它今天不是「開了就能玩」的開關。⭐ 這一塊與 `overflow` / `gacha` **不同**：它在出貨文件裡是**完整存在**的，所以這一頁畫得出來也存得回去，⛔ 不會送出半塊文件。",
  ],
  consumer:
    "apps/game-server/src/match/arenaRules.ts 的 resolveArenaRules() → rulesFromDoc()，再由 MatchController 在 tick 0 之前轉成 ticks 灌進 SimWorld（flowerRules / reviveRules / guardianRules / coinRules / weaponShelfOpen / ultGateOverride）",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場（`Configs` 登錄表是開機時載入的）。⛔ 進行中的那一場不會中途換規則 —— 這幾組值在 MatchController 建構時就定格了。和 淨化規則／基礎加成 同一個形態（#278）。",
  fields: derivedFields(zConfigArenaRulesDoc, [
    // ⭐ GH#1033 —— 真人座位從第幾回合起算真人。人話住 Zod 的 `@zh`（GH#1001 的推導路）。
    ...fromZod((p) => p === "humanSeatsFromRound"),
    // ── 🧟 第十一回合・生存模式（GH#919–#925）──────────────────────────────
    // ⛔⛔ 這一族的**總開關出貨是關的**，而 sim 那一半還沒做 —— 見上面 intro 的
    // 最後一段。標籤是**必要**的：`configForms.test.ts` 的雙向斷言（少寫紅、
    // 多寫也紅）從 schema 走出來，而 schema 已經有這 21 格了。少了它們，這一頁
    // 會**安靜地少畫 21 個旋鈕**，而畫面上不會有任何錯誤（那正是這條守衛在擋的）。
    // ⭐ GH#1001 —— 這 21 格的人話住在 `arenaRules.round11.ts` 的 `@zh` / `@note`，
    // 由 `schemaToForm()` 推導；⛔ 這裡不再打第二份（2026-09-05 那一晚手打的 21 格
    // 是修 CI 紅的排程結果，⛔ 不是設計）。順序＝Zod 的宣告順序，與手打時逐格相同。
    // ⚠️ 上下界一律住 Zod（round11 每一格都有上界），推導出來的標籤不帶 `max`。
    ...fromZod((p) => p.startsWith("round11.")),
  ], { except: arenaRulesElsewhere }),
  // ⚠️ 這八條分支不是「忘了做」——走訪器只長得出純量欄位，而這八條各自有自己的
  // 編輯路徑（或還沒有）。少一條 = 這一頁存檔時把它從線上文件裡刪掉。
  preserved: [
    {
      path: "rounds",
      why: "**整張回合排程**（每一回合發幾等、幾金、自動學哪幾格、發哪一級聖杯願望／哪一張寶具表）。它是 `z.record`（鍵是回合編號，不是固定欄位），通用引擎列不出「有哪些鍵」，畫出來會是一頁空的 —— 和 `per-level-bonus` / `stat-caps.caps` / `vfx-ability-art.bindings` 是同一個引擎缺口的第四個實例。⛔ 掉了的話整場比賽一毛金幣一級經驗都不發，而畫面上完全看不出來。",
    },
    {
      path: "weaponTiers",
      why: "[EX解放] / [EX∅ 根源] 的出現窗口與機率。它在**傳說武器三選一**那一頁有真的表格編輯器（`configRows.ts`，GH#355），這一頁只負責原封不動帶著走 —— 掉了的話那兩階寶具整批抽不到，而三選一照樣發卡，所以看起來只是「運氣不好」。",
    },
    {
      path: "augmentTiers",
      why: "聖杯願望的階級升級表（GH#357「階級由劣勢決定」），與 `weaponTiers` 同一個引擎、同一頁編輯。掉了的話回合表排什麼等級就發什麼，劣勢方再也拿不到升級 —— 而那正是這個機制存在的全部理由。",
    },
    {
      path: "retiredLootTables",
      why: "已退場的抽獎池（owner 2026-08-01 的裁決）。⚠️ 它擋的是**後台耐久覆蓋層**那條路（#283 那裡沒有 Zod），掉了之後有人把 `quest-rewards` 排回某個回合就會真的發出去。編輯它的地方是「傳說武器三選一」那一頁。",
    },
    {
      path: "legendaryShelf.randomOnlyTables",
      why: "隨機限定的抽獎表名單（那幾張表裡的寶具永遠不上架，只能抽到）。同在「傳說武器三選一」那一頁編輯。掉了的話那些道具會靜靜地出現在商店裡 —— 買得到，而且沒有任何東西會叫。",
    },
    {
      path: "itemDraft.excludedCraftRoles",
      why: "三選一與傳說寶玉**都不會發**的 craftRole 清單（出貨 token / service）。同在「傳說武器三選一」那一頁編輯。掉了的話兌換券與商店服務會混進獎勵池，玩家會抽到一張「能力屬性強化」當作三選一。",
    },
    {
      path: "mobWaves.schedule",
      why: "殭屍波的**逐回合覆寫表**（第 6/7/8/9 回合的每波上限與同時存活上限，第 10 回合歸零）。它在**殭屍波系統**那一頁編輯。掉了的話後段回合會退回基礎值，殭屍海突然變成小貓兩三隻，而回合照常進行。",
    },
    {
      path: "round11.waveTable.events",
      why: "第十一回合的**波次事件表**（GH#924）—— 一列一個「權重 × 事件種類」（一般／精英／王／大轟炸／復活圈）的**物件陣列**。⛔ 通用引擎的三種表格形狀（`recordEnum` / `stringList` / `recordScalars`）沒有一種表達得了「物件陣列 × 可增刪列」，硬套會變成一格要手打 JSON 的文字框。⚠️ 掉了的話 schema 仍然收（`events` 允許空陣列＝只生一般殭屍，那是一個**合法**設定）⇒ 大轟炸與復活圈**整個消失**，而畫面上、後台上、Zod 上全都不會有任何錯誤。",
    },
  ],
  // ⚠️ 這十列是 GH#410 的**逃生口**（見 `ElsewhereField` 的長註解）：這一份是全
  // repo 唯一一份被四頁共同編輯的文件，所以「每一個葉節點都有標籤」必須能宣告
  // 「那一格在別頁」。⛔ 每一列都要指得出**哪一頁**，或說得出為什麼今天沒人編。
  elsewhere: ARENA_RULES_ELSEWHERE,
};

