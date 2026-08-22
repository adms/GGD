import { z } from "zod";
import { zId } from "../common";

/**
 * config.vfx-cleanup@1 —— 回合邊界要把特效層的池子回收到什麼程度
 * (`config/vfx-cleanup.json`, task #262)。
 *
 * owner 的症狀是「越打越鈍」「一場就很燙」+ 親眼看到殘留特效。#259 已經把
 * **live** 的一次性效果與 VfxSystem/rig 自己的池子在回合邊界還回去了；量出來
 * 還在漏的是 `Telegraph` 的**每個 Scene 共用**的網格 free-list：它以
 * 「半徑字串」為 key，一個 key 最多 8 個 ring mesh(各自一份 StandardMaterial)，
 * 而那張 Map 沒有人清 —— `TelegraphLayer.dispose()` 也不清。實測 60 個不同
 * 半徑打完，`dispose()` 之後 scene 上仍留著 72 mesh / 73 material /
 * 13 texture / 12 particleSystem。
 *
 * 為什麼是內容而不是常數:「回合之間要不要把暖好的池子丟掉」是**體感取捨**,
 * 不是事實。丟掉 = 穩態記憶體最低,代價是下一回合第一次施法要重新配置;留著
 * = 第一次施法不卡,代價是那些網格整場都在。哪一邊比較好要看 owner 在真機上
 * 打起來的感覺,而寫死的話改一格 = 一次 client rebuild + 重新部署。
 *
 *   · `enabled`                    總開關。false = 完全回到 #259 的行為
 *                                  (只清 live 效果,共用池子不動)。止血閥。
 *   · `purgeSharedPoolsOnRoundEnd` 回合結束是否強制清空共用池子。
 *   · `maxPooledRings`             不強制清空時,整個 scene 允許留幾個預告圈
 *                                  網格。超出的部分在回合邊界被丟掉。0 = 一個
 *                                  都不留(等於強制清空 ring 那一層)。
 *
 * ⚠️ 「角色退場時歸還 tint clone 材質」**刻意不做成開關**:那是正確性修復
 * (未著色英雄 + 成長階級 > 0 的 clone 從來沒被歸還,實測每回合 +30 個
 * material 線性成長),不是 owner 會想推翻的判斷。給它一個開關等於把
 * 「要不要漏記憶體」放上後台。
 */
export const zConfigVfxCleanupDoc = z
  .object({
    id: zId,
    schema: z.literal("config.vfx-cleanup@1"),
    note: z.string().optional(),
    /** 總開關。false = 回合邊界不碰共用池子(#259 的行為)。 */
    enabled: z.boolean(),
    /** 回合結束是否強制清空共用池子(ring / fill / shockwave free-list)。 */
    purgeSharedPoolsOnRoundEnd: z.boolean(),
    /**
     * 不強制清空時,整個 scene 允許留下的預告圈網格上限。每一個網格帶一份
     * StandardMaterial,所以這個數字直接就是「回合之間常駐的 mesh/material 數」。
     * 上下界都有:0 = 一個都不留;512 是實測 60 個半徑 × 每個 key 上限 8 的
     * 量級,再高就沒有意義而只會讓打錯的數字靜默通過(#277 的形狀)。
     */
    maxPooledRings: z.number().int().min(0).max(512),

    /* ── GH#267 死亡火焰的收斂（owner 2026-08-03）─────────────────────────
     *
     * 「我找到場地天空火的兇手了，是角色死亡後的特效，持續太久了變得很干擾」
     *
     * 兇手是**復活圈的火**：#196 把圈圈的存續時間整個拿掉，所以每死一位英雄，
     * 場上就多一團永遠不滅、往天上飄的橘色火。這三格決定它燒多久、收斂到多暗、
     * 以及有人來救時要不要燒回全亮。消費端是
     * `apps/client/src/render/views/deathFxBurn.ts`（逐格降級讀取）。
     *
     * ⚠️ 三格都 `.optional()`，而且**必須**是 optional：`config.vfx-cleanup@1`
     * 已經有耐久覆蓋層在線上（後台存過就有），一份存於新欄位之前的 override
     * 少了必填欄就會整份被 Zod 退回 → 內容載入失敗 → fail-open 退回骨架。
     * 那是 2026-08-02 兩次事故的形狀，不要再走一次。
     */

    /**
     * 英雄倒下後留在屍體上的那團火（火柱／火舌／往天上飄的餘燼）用**全亮**燒幾秒。
     * 燒完之後降到下面那格的比例。0 = 一出現就是低調狀態。
     *
     * ⚠️ 這只改**看起來**多久，不改復活圈本身還救不救得回來 —— 圈圈的存活由
     * 伺服器決定（#196 無到期），這一格碰不到它。改大 = 回到 GH#267 之前那種
     * 「燒到回合結束」的畫面。上界 600 秒＝十分鐘，比任何一個回合都長。
     */
    deathFxBurnSec: z.number().min(0).max(600).optional(),
    /**
     * 全亮秒數過完之後，火剩下原本的幾成（火柱與火舌的 alpha、餘燼的噴發速率
     * 一起乘上這個數）。
     *
     * 1 = 永遠不收斂，等於一鍵回到 #196 的行為（**止血閥**）；0 = 完全熄掉，
     * 只剩地上那圈。⚠️ 地上那圈的亮度**不受這一格影響**，因為它是玩家判斷
     * 「這裡還救得回來」的錨點 —— 讓機制不可讀不是一個可選的美術取捨。
     */
    deathFxCalmScale: z.number().min(0).max(1).optional(),
    /**
     * 隊友踩進圈圈開始復活、或敵人站進來卡住時，要不要立刻把火燒回全亮。
     *
     * true（出貨）= 收斂不會吃掉「有人在救／被卡住」這個一眼可讀的訊號。
     * false = 圈圈收斂後就一直低調，畫面最乾淨但要靠 HUD 才知道有人在救。
     */
    deathFxRelightOnChannel: z.boolean().optional(),

    /* ── GH#270 一次性發射器的「有界」保證（owner 2026-08-04 實測）──────────
     *
     * owner 用 v0.9.33 的診斷面板在真的線上對局量到 **線性洩漏**：
     * Round 2 = 144 個發射器 / 2,819 顆活粒子 → Round 4 = 266 / 5,975。
     * 每回合大約 +60 個發射器。
     *
     * 上面 #262 那三格管的是**預告圈網格**；一次性**粒子發射器**的池子當時
     * 完全沒有人管：
     *   · `HitSpark` 的共用 `ImpactComposer`（`vfx-preset-*`）掛在
     *     per-Scene WeakMap 上，**不屬於 VfxSystem**，`resetForRound()` 明文
     *     寫著不碰它；它唯一的回收器 `BurstPool.update()` 又只在**還有活的
     *     HitSpark** 時才被打點 —— 戰鬥一安靜就再也不回收。
     *   · `AmbientVfx.psPool`（`ambient-*`）只增不減、沒有上限、沒有回合重置。
     *
     * 兩者都是**只長不縮**。所以這三格把它變成有界的：
     *   · `maxOneShotEmitters`      同時允許幾個閒置的一次性發射器（硬上限）
     *   · `emitterSweepSec`         多久掃一次（把閒置的還回去）
     *   · `purgeImpactPoolOnRoundEnd` 回合結束要不要把打擊感池整個丟掉
     *
     * ⚠️ 全部 `.optional()`，理由和上面那三格一樣：線上已經有耐久覆蓋層，
     * 少一個必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 → 退回骨架。
     */

    /**
     * 同時允許**閒置**的一次性粒子發射器上限（整個 scene）。
     *
     * 「閒置」= 這一格的池子裡沒有粒子在飛、也沒有人正在用。超出的部分在下一次
     * 掃描時被丟掉（最久沒用的先丟），而且**會被說出來**：`VfxSystem` 把每一次
     * 驅逐的數字累加在 `oneShotEvictions` 上，診斷面板讀得到（CLAUDE.md：
     * 靜默夾掉才是缺陷）。
     *
     * 上下界都有。下界 16 = 一組打擊感（3 層 × 4 個實例）加上幾個常見 doc，
     * 再低就等於每一拳都要重新配置。上界 1024 遠高於 owner 量到的 266，
     * 打錯一個 0 不會靜默通過（#277 的形狀）。
     */
    maxOneShotEmitters: z.number().int().min(16).max(1024).optional(),
    /**
     * 多久掃一次閒置發射器（秒）。掃描本身只走一次 `scene.particleSystems`
     * 等級的清單，很便宜；設小 = 殘骸活得更短、記憶體更平，代價是回收動作
     * 更頻繁。0.5–60 秒。
     */
    emitterSweepSec: z.number().min(0.5).max(60).optional(),
    /**
     * 回合結束要不要把**打擊感共用池**（`vfx-preset-*`：白光/火花/煙）整個丟掉。
     *
     * true（出貨）= 商店那一段場上一個一次性發射器都不留，下一回合從零長回來。
     * false = 留著，下一回合第一拳不用重新配置，代價是那些系統整場都在場景裡
     * 被每一幀走訪 —— 那正是 GH#270 量到的東西，所以關它是**止血閥**不是省事。
     */
    purgeImpactPoolOnRoundEnd: z.boolean().optional(),

    /* ── 勝利煙火跨回合殘留（owner 2026-08-17）──────────────────────────────
     *
     * 上面三批管的都是**池子**（預告圈網格 / 一次性發射器 / 打擊感）。這一格管
     * 的是另一種殘留：上一回合的**勝利煙火**還在飛的時候，下一回合已經開打了。
     *
     * ⚠️ 它是一個**決策點**（第一守則）：場地乾淨 vs 煙火當表演，兩邊都講得通，
     * 而 owner 會改主意 —— 所以⛔ 不寫死。同 `.optional()`，理由與上面六格逐字
     * 相同（線上已有耐久覆蓋層）。
     */

    /**
     * 下一回合開打的那一幀，要不要強制停掉上一回合還在飛的勝利煙火並**重新武裝
     * 勝利偵測**。
     *
     * true（出貨）= 場地乾淨：開打的畫面上不會有上一局的煙火，而且勝利偵測回到
     * 待命狀態，這一回合的勝利照樣放得出來。
     * false = 煙火可以飄進下一回合當表演（**止血閥**：如果強制停掉的動作本身造成
     * 閃爍或把這一回合的煙火一起吃掉，這一格是不必重新 build 就能回頭的路）。
     */
    purgeVictoryFxOnCombatStart: z.boolean().optional(),
  })
  .strict();
export type ConfigVfxCleanupDoc = z.infer<typeof zConfigVfxCleanupDoc>;

/**
 * 出貨預設 —— `content/config/vfx-cleanup.json` 不存在(舊部署 / 內容掛掉)時,
 * `applyVfxCleanupPolicy` 回退到的就是這一份。
 *
 * ⚠️ 每一格都要和 `content/config/vfx-cleanup.json` 一字不差 ——
 * `packages/shared/src/content/vfxCleanupConfig.test.ts` 的 drift 斷言在守。
 * 兩份存在的理由不同:JSON 是**出貨值**(操作者會改),這份是**程式的保險絲**。
 *
 * 預設選 `purgeSharedPoolsOnRoundEnd: true` 的理由是 owner 的原話 ——
 * 「洩漏的粒子/mesh 回收 很重要」「一場就很燙」:在「省記憶體」和
 * 「下一回合第一次施法少一次配置」之間,他已經表態要前者。
 */
export const DEFAULT_VFX_CLEANUP: ConfigVfxCleanupDoc = {
  id: "vfx-cleanup",
  schema: "config.vfx-cleanup@1",
  enabled: true,
  purgeSharedPoolsOnRoundEnd: true,
  maxPooledRings: 24,
  // GH#270 —— 出貨值必須和 `content/config/vfx-cleanup.json` 一字不差；
  // `vfxCleanupPolicy.test.ts` 的 drift 斷言在守。
  maxOneShotEmitters: 96,
  emitterSweepSec: 2,
  purgeImpactPoolOnRoundEnd: true,
  // owner 2026-08-17 —— 下一回合開打就把上一回合的勝利煙火停掉並重新武裝勝利偵測。
  // 三個住處都有它：這裡 · Zod（`.optional()`，線上舊 override 沒有這一格）·
  // `content/config/vfx-cleanup.json`。
  purgeVictoryFxOnCombatStart: true,
};
