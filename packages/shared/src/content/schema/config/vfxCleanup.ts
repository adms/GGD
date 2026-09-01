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
/**
 * 尾段 fade 上限的上下界（GH#569）。⭐ 這是**唯一**的住處：下面的 Zod
 * `.min/.max` 與 `vfxCleanupPolicy` 的防禦性夾子都從這裡讀，
 * ⛔ 不可以再抄一次字面值（第〇·四守則）。
 */
export const VFX_FADE_OUT_MAX_SEC_BOUNDS = { min: 0.05, max: 3 } as const;

/**
 * 💨 **收尾全長**上限的上下界（GH#660）。⭐ 同上，這是**唯一**的住處。
 *
 * 上界 8 秒＝出貨文件裡最長的那一份（`sephboom` 那一族 8.0 秒）⇒ 拉到 8
 * 就等於「這道夾子實際上不會叫」＝ 一鍵回到 GH#660 之前的畫面（止血閥），
 * ⛔ 不是建議值。下界 0.05＝三幀，和上面那格同一個理由。
 */
export const VFX_DISSIPATE_MAX_SEC_BOUNDS = { min: 0.05, max: 8 } as const;
/** 染色下限的界（GH#697）：0＝連純黑都染（黑剪影會消失）· 1.1＝完全不染（止血閥）。 */
export const FX_TINT_EMISSIVE_FLOOR_BOUNDS = { min: 0, max: 1.1 } as const;

/**
 * ⏳ **終極**壽命上限的上下界（GH#570）。⭐ 同上，這是**唯一**的住處。
 *
 * 上界 30 秒不是建議值，是**止血閥的量級**：把它拉到 30 就等於「這道兜底
 * 實際上不會叫」，而 owner 仍然看得到這一格存在、知道要調哪裡回來。
 * 下界 0.5 秒＝比任何一次打擊感（0.6 秒餘燼）還短，再低就是把所有特效關掉。
 */
export const VFX_HARD_MAX_LIFE_SEC_BOUNDS = { min: 0.5, max: 30 } as const;

/** 兜底掃描的涵蓋範圍（`vfxHardCapScope`）。 */
export const VFX_HARD_CAP_SCOPES = ["scene", "managed", "off"] as const;
export type VfxHardCapScope = (typeof VFX_HARD_CAP_SCOPES)[number];

/**
 * 🧹 回合間完整清理的三個檔位（GH#819）。⭐ 這是**唯一**的住處 ——
 * client 的 `roundPurge.ts` 與 admin 欄位都從這裡讀，⛔ 不再抄一次字面值。
 *
 *   · `"off"`  完全不跑（逐位元回到 GH#819 之前的行為，**止血閥**）。
 *   · `"soft"` 回合結束把特效幾何／粒子／free-list 硬重置（共用容器不動）。
 *   · `"full"` soft ＋ 丟掉特效層的共用模型容器 ＋ **重新盤點**本場要用的資產
 *              並載入，**全部 ready 才放行進戰鬥**（出貨預設，owner 2026-08-27）。
 */
export const ROUND_PURGE_MODES = ["off", "soft", "full"] as const;
export type RoundPurgeMode = (typeof ROUND_PURGE_MODES)[number];

/**
 * 🖼 地面貼圖快取的「同時留幾**組**」上下界（GH#561）。⭐ 同上，這是**唯一**的住處。
 *
 * ⚠️ **下界是 4，⛔ 不是 1**，而且那是一個正確性下界不是品味：一張場地有兩個區，
 * 兩個區的 `boundaryRadius` 不同時會是**兩個不同的快取鍵**（鍵含 uv scale）。
 * 上限低於「同一張場地同時要用的鍵數」的話，建場的第二次 `acquire` 會把第一次
 * 那一組淘汰掉 —— 而那一組**正掛在材質上** ⇒ 逐位元回到 GH#536 的**地板全黑**。
 * 4 = 兩個區 × 一倍餘裕。上界 64 遠高於出貨 13 張場地能產生的鍵數，
 * 打錯一個 0 不會靜默通過（#277 的形狀）。
 */
export const GROUND_TEX_CACHE_BOUNDS = { min: 4, max: 64 } as const;

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
     * ⭐⭐ P1-2（2026-09-02）—— **同時活著的刀光／緞帶上限**。
     *
     * ⚠️ 在此之前它是 `apps/client/src/vfx/RibbonTrail.ts` 的 `MAX_ACTIVE_RIBBONS = 10`
     * ——⛔ 一個**只有改程式碰得到**的角落，而外部編輯器**看不到它**：
     * 它做得出一份會同時開 30 條刀光的內容，而遊戲會靜默偷走 20 條。
     *
     * ⭐ 超過上限時**偷走最久沒開的那一條**（`RibbonBudget.open()`），⛔ 不是拒絕新的。
     */
    maxActiveRibbons: z.number().int().min(1).max(64).optional(),
    /**
     * ⭐⭐ P1-2 —— **一條緞帶最多活／淡多久**（秒）。
     *
     * ⚠️ 在此之前是 `ribbonMath.ts` 的 `RIBBON_MAX_LIFESPAN_SEC = 0.2`。
     * ⭐ 它同時是「刀光尾巴多長」與「淡出多久」——緞帶的 alpha 是沿著取樣環
     * 依 `age/lifespan` 算的，⇒ 壽命就是淡出預算，⛔ 不是兩個數字。
     */
    ribbonFadeBudgetSec: z.number().min(0.02).max(2).optional(),
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

    /* ── ⏱ 尾段 fade out 的**常設**上限（owner 2026-08-23, GH#569）────────────
     *
     * > 「有許多特效**最尾段的 fade out 都太久了**，我**統一規定 fade out 尾段
     * >  一律最多佔 0.5 秒**後**一定要清理乾淨**」
     *
     * ⭐ 這是一條**規定**，⛔ 不是一次調整 —— 所以它是一格（第一守則三個住處），
     * 而且是**在載入時從這一格解析**、⛔ 不是把 0.5 烘進 584 份 vfx 文件
     * （第〇·四守則：同一個數字不可以有第二個住處）。
     *
     * 「尾段」的定義是可以逐位元算出來的：一份 vfx@1 的 alpha 梯度上，**最後一個
     * 還看得見（alpha > 0）的關鍵格** → **它後面第一個 alpha 歸零的關鍵格**，
     * 那一段乘上 `lifetimeSec.max` 就是這份文件的尾段秒數。
     * 夾的做法是把那一段壓到這一格，並且**把歸零之後還活著的部分整個丟掉**
     * （owner 的第二句話：「一定要清理乾淨」—— 看不見卻還佔著發射器的粒子
     * 就是 #559 那一族的形狀）。
     *
     * 消費端 `apps/client/src/vfx/fadeOut.ts` → `particleFactory.toParticleSystem()`
     * （**唯一**的解析入口：VfxSystem / AmbientVfx / FireRingFx / W3xEmitterRig /
     * 編輯器預覽全部走它）＋ `W3xEmitterRig` 的效果存活期（才會真的被回收）。
     *
     * 上界 3 秒＝與 `MAX_ONE_SHOT_MAX_LIFE_SEC` 同一個量級的「止血閥」，
     * ⛔ 不是建議值；下界 0.05＝三幀，再低就是硬切不是 fade。
     */
    vfxFadeOutMaxSec: z
      .number()
      .min(VFX_FADE_OUT_MAX_SEC_BOUNDS.min)
      .max(VFX_FADE_OUT_MAX_SEC_BOUNDS.max)
      .optional(),

    /**
     * 💨 一顆粒子**從開始變淡到完全消失**最多幾秒（GH#660，出貨 0.5）。
     *
     * owner 2026-08-24（逐字，⚠️ 他自己說「我們討論調整過好幾次了」）：
     *
     * > 「每次施法會**淡出飛上天的粒子特效** 淡出時間可以縮短
     * >  我**不喜歡天空有殘留特效**」
     *
     * ⚠️ 為什麼上面那格（`vfxFadeOutMaxSec`）抓不到他看到的東西 —— **量到的**：
     * `fx.fam.dissipate.*` 整族壽命 **1.107 秒**，而它的「尾段」（最後一個還看得見
     * 的關鍵格 → 第一個歸零的關鍵格）只有 **0.443 秒** ⇒ **在 0.5 以下，那道閘
     * 一次都沒有叫過**。玩家看到的殘留是從 α 開始掉的那一刻起算的 **0.886 秒**：
     * 這份文件的 alpha 是 0.75 → 0.75 → 0.315 → 0，中間那一格把「淡出」切成兩段，
     * 於是只有最後一段被量到。
     *
     * ⇒ 這一格量的是**整段收尾**：alpha 梯度上**最後一個還在峰值的關鍵格**
     * → **同一個歸零的關鍵格**。⭐ 兩格共用同一支夾子與同一條時間重映
     * （`apps/client/src/vfx/fadeOut.ts`），**比較嚴的那個贏**，⛔ 不是兩套規則。
     *
     * ⭐ **只夾非常駐特效**（`toParticleSystem` 的 `persistent` 旗標／文件自己的
     * `ambient: true`）。GH#660 的原話點名「持續 5 秒的光環 ⛔ 那不該被砍」——
     * 那一族正是常駐旗標標記的那一族，所以判準是**已經存在的資料**，
     * ⛔ 不是一張會腐爛的豁免名單。
     *
     * ⭐ 出貨 0.5 = owner 在 GH#569 立的那條常設規定的秒數（「fade out 尾段一律
     * 最多佔 0.5 秒」），⛔ 不是我另外挑的一個數字。
     * 量到的影響面：585 份出貨文件裡 **173 份非常駐**會被夾，壽命中位數縮 **25%**。
     */
    vfxDissipateMaxSec: z
      .number()
      .min(VFX_DISSIPATE_MAX_SEC_BOUNDS.min)
      .max(VFX_DISSIPATE_MAX_SEC_BOUNDS.max)
      .optional(),

    /**
     * 🎨 **染色下限**（GH#697）：`tint` 的最大分量低於它時,**不碰自發光那一格**。
     *
     * ⚠️ 這條退路不是假設 —— 出貨的 `imported.blackhole`（5/5 材質全 glow）與
     * `imported.darkraor` 的 `fxTint` 都是 `[0,0,0]`（原作的黑色剪影）,天真地乘 0
     * 會讓黑龍波**整具消失**。門檻 0.05 量自 `UNIT_TINTS` 的 72 種色：0.0 / 0.0392
     * / 0.1176 之間那道**三倍空隙**（用 max 不用亮度 —— 純紅 [1,0,0] 的亮度只有 0.21）。
     * ⭐ 調到 **1.1** ＝ 自發光那一格完全不染 ＝ 回到 2026-08-25 之前的畫面（**止血閥**）。
     */
    fxTintEmissiveFloor: z
      .number()
      .min(FX_TINT_EMISSIVE_FLOOR_BOUNDS.min)
      .max(FX_TINT_EMISSIVE_FLOOR_BOUNDS.max)
      .optional(),

    /**
     * 🔆 **原作 additive 混合**（GH#767）：stock 特效模型的 glow 材質要不要用
     * **加法**混合畫（`ALPHA_ADD`），⛔ 而不是今天的 alpha 混合（`BLEND`）。
     *
     * ⚠️ 這一格補的是**引擎缺的一個機制**，⛔ 不是一個口味參數。原作那一族
     * （`filter_mode >= 3` 且無不透明底層）在 WC3 裡是 **additive** —— 光是**加**到
     * 背景上的，所以①暗地板上的光束會非常亮 ②**兩層疊起來會更亮**。
     * 而 `w3xlib/gltf.py` 的 `gltf_texture_luma()` 檔頭自己寫著它只是
     * 「approximates WC3 additive blending in **plain glTF BLEND**」——
     * 而 alpha 混合的結果**永遠 ≤ 兩者的最大值** ⇒ 上面那兩件事**結構上不可能發生**。
     *
     * ⭐ 量到的（20-03 約束與勝利之劍，2026-08-26）：光束 lum 中位數 **56–76**
     * vs 原作擷圖 **246–254**（暗約 4 倍）；多層疊加的暈/核比 **0.63–1.05**
     * vs 原作 **1.27–3.06** —— ⭐ 兩項驗收是**同一個**缺陷的兩半。
     *
     * ⛔ **只碰自發光非全黑的材質**（＝轉檔的 glow 分支，全 repo 404 份 glb 裡
     * 152 個）。不透明 body 的 `emissiveColor` 是全黑 ⇒ 一格都不會被碰到。
     *
     * ⭐ `false` ＝ **止血閥**：逐位元回到 2026-08-26 之前的畫面。
     * ⚠️ 它在**載入時**生效（與 `fxTintEmissiveFloor` 同一條路）⇒ 後台存檔後要重載。
     */
    stockGlowAdditive: z.boolean().optional(),

    /**
     * 施法光柱腳邊那圈**往上飄的餘燼**，只在施法窗口的前幾成生成（0–1）。
     *
     * owner 2026-08-23（GH#569）：
     * > 「施展技能時 會有類似**火群粒子飛上天，時間還是太久了**，特別是莉娜
     * >  施展技能時出現**紅色粒子飄上天時間都要減半以上**」
     *
     * ⚠️ 這一格與上面那格是**兩件不同的事**（量過才分開的）：餘燼的**單顆壽命**
     * 早就只有 0.175–0.35 秒（GH#494 砍過一次），尾段沒有超標；真正長的是
     * **生成窗口** —— 餘燼每 150ms 補一發、補滿整段施法時間，而莉娜四支技能的
     * 施法時間全部高於中位數（0.767 / 1.233 / 1.433 / 2.0 秒 vs 中位 0.667），
     * 所以她那串紅色粒子在畫面上待了 1.12–2.35 秒。⇒ 要砍的是**窗口**。
     *
     * 1 = 整段施法都在補（GH#569 之前的行為，止血閥）。出貨 0.5 = owner 的
     * 「減半」。光柱本體（核心／外殼／地面光暈）**不受影響** —— 它是施法時間的
     * 讀數，砍它等於讓玩家看不出還要吟唱多久。
     * 消費端 `apps/client/src/vfx/CastPillarFx.ts`。
     */
    castMoteEmitShare: z.number().min(0).max(1).optional(),

    /* ── ⏳ 終極壽命上限（owner 2026-08-23, GH#570）─────────────────────────────
     *
     * > 「我發現**還是有特效超過三秒以上停留在場上**（老毛病，**飛向天空的殘留
     * >  半透明煙霧**），請妳作一個**終極限制，不管什麼特效，包含技能、場地特效等，
     * >  產生後生命週期最多維持三秒，三秒後一律強制清理回收**」
     *
     * ⚠️ 上面那一格（`vfxFadeOutMaxSec`）夾的是**一顆粒子**的尾段；這一格夾的是
     * **整個效果**在場上的總時間。兩者刻意不同，因為超標的路徑不是粒子壽命：
     * 量到的是 `godie-u010.q/.r`（FlamesSmoke）—— 四支發射器，`p03` 是
     * `smoke_07.png` × `alpha` × 近乎垂直的錐（`angleDeg: 1`）× 速度 2.2–6.7，
     * 逐字就是 owner 說的「飛向天空的半透明煙霧」。它的單顆壽命被 #569 夾成
     * 3.0 秒沒錯，⛔ 但**效果**是「發射 0.55 秒 → 排空 3.0 秒」＝ 3.55 秒，
     * 而排空那一段完全在既有三道閘的外面。
     *
     * ⭐ 兜底落在**資源被建立出來的那一層**（⛔ 不是每一種特效各加一次）：
     *   · `apps/client/src/vfx/vfxHardCap.ts`   一個掃描器（唯一的機制）
     *   · `particleFactory.toParticleSystem()`  建立當下標記 managed / persistent
     *   · `W3xEmitterRig`                       效果總壽命夾進這一格（真的回池）
     *   · `ModelFxRig`                          `maxEffectSec` 由這一格供給
     */

    /**
     * ⏳ 任何**非常駐**特效資源從產生到被強制回收的最長秒數（出貨 3 ＝ owner 的原話）。
     *
     * 「強制回收」= `stop()` + `reset()`（在飛的粒子直接丟掉）+ 把發射器與 mesh
     * 還回池子，⛔ 不是「變透明後留在場上」。
     *
     * ⚠️ 它與 `vfxFadeOutMaxSec` / `oneShotMaxLifeSec` 是**疊在一起**的天花板，
     * 比較嚴的那個贏。這一格是**最後一道**：即使某條路徑繞過了前面每一道，
     * 它也會在這個秒數被收掉。
     */
    vfxHardMaxLifeSec: z
      .number()
      .min(VFX_HARD_MAX_LIFE_SEC_BOUNDS.min)
      .max(VFX_HARD_MAX_LIFE_SEC_BOUNDS.max)
      .optional(),

    /**
     * ⭐⭐ GH#803 —— `model@1.fxEmitters`（模型自己帶的粒子）要不要播。
     *
     * ── 它關掉什麼 ────────────────────────────────────────────────────────
     * 原作的一顆 .mdx 是「geoset ＋ 它自己的 PRE2 粒子」，而
     * `convert_stock_model.py` **只轉 geoset** ⇒ 出貨 .glb 是那顆模型的**一半**。
     * ReviveHuman 的 5 張貼圖 **4 張 sat 0.000–0.066**（灰/白），⭐ 而金色住在
     * PRE2 的 `segment_color[0] = (1.000, 0.890, 0.459)` ⇒ **sat 0.541**
     * （2026-08-31 直接解 MPQ 的 .mdx 量到）⇒ ⛔ 沒有任何 tint 參數補得回來。
     * 這一格 = false ⇒ 逐位元回到「只有 geoset」的今天。
     *
     * ⭐ 出貨 **true**（第〇·六守則：「優先權大的更新後都是預設啟動」）。
     */
    modelFxEmittersEnabled: z.boolean().optional(),

    /**
     * 兜底掃描涵蓋到哪裡。⭐ 出貨 `"scene"` ＝ owner 的「**不管什麼特效**」。
     *
     *   · `"scene"`   場景裡**每一個**粒子系統（含 `ArenaScene` 的場地火把這種
     *                 不走 vfx 管線的），只有下面那張豁免表與程式標記過的常駐
     *                 特效除外。
     *   · `"managed"` 只掃 vfx 管線自己建的（`toParticleSystem`）。⛔ 場地特效
     *                 不在內 —— 這是「兜底本身造成問題」時的中間檔位。
     *   · `"off"`     完全不掃（回到 GH#570 之前的行為，**止血閥**）。
     */
    vfxHardCapScope: z.enum(VFX_HARD_CAP_SCOPES).optional(),

    /**
     * 🧹 回合間完整清理（GH#819）。owner 2026-08-27（逐字）：
     * > 「lag 本身沒修 —— 一定是**物件、特效沒回收乾淨**，必要手段就是
     * >  **每回合開始前多一個完整清理重新載入的按鈕** 先試試看」
     * > 「既然做成開關 那就請你**預設是會清理完重新盤點必要物件載入後
     * >  再進入戰鬥回合**」
     *
     * ⇒ 出貨預設 **`"full"`**（他的第二句話）：回合結束 → 特效幾何／粒子／
     * free-list 硬重置 → 丟掉特效層的共用模型容器 → 重新盤點本場要用的資產
     * （英雄 glb ＋ 技能特效模型）並載入 → **全部 ready 才放行進戰鬥**
     * （沒 ready 時畫面上有「載入中＋進度」，⛔ 不是黑畫面）。
     * `"off"` ＝ 逐位元回到 GH#819 之前的行為（**止血閥**）。
     * 消費端 `apps/client/src/render/roundPurge.ts`；⚠️ `.optional()` 理由同
     * 這一族每一格：線上耐久 override 少這一格不可以讓整份 config 被退回。
     */
    roundPurgeMode: z.enum(ROUND_PURGE_MODES).optional(),

    /**
     * ⭐ **豁免表** —— 這些粒子系統是**刻意長命**的，兜底不碰它們。
     * 比對的是 Babylon `ParticleSystem.name` 的**前綴**。
     *
     * ⚠️ 為什麼常駐特效的豁免要有**兩個**機制：走 vfx 管線建的東西可以在建立
     * 當下用一格旗標說「我是常駐的」（`toParticleSystem` 的 `persistent`，
     * 或文件自己的 `vfx@1.ambient`）—— 那是最好的形狀。⛔ 但場景裡有一整族
     * 粒子系統**不走那條路**（場地火把、金幣/花的光點、投射物拖尾、復活圈餘燼、
     * 登入頁），而 `"scene"` 模式的重點就是要掃到那一族。
     * ⇒ 它們的豁免只能是**資料**，而這張表就是那格顯式旗標。
     * ⛔ 沒有列在這裡也沒有被程式標記過的東西，就是「該被收掉的」。
     */
    vfxHardCapExemptPrefixes: z.array(z.string().min(1).max(48)).max(24).optional(),

    /* ── 🔬 生命週期登記表（owner 2026-08-23）────────────────────────────────
     *
     * > 「這版改完**還是 LAG** 一定有地方有問題, **到第七回合就很難動作**，
     * >  可能其中一個原因也是**累積，沒清理到殘留物**
     * >  請你要**設計一個機制捕捉與監控每個物件的生命週期及存活時間限制**，
     * >  才可以**精準縮小範圍來除錯**」
     *
     * ⛔ 上面每一格都在**回收**；這五格是**量測** —— 它一個東西都不收，只回答
     * 「到第七回合，哪一類東西沒有回到第一回合的水準」。
     * 消費端 `apps/client/src/render/lifecycleLedger.ts`。
     *
     * ⚠️ 五格全部 `.optional()`，理由同上面每一族：線上已經有耐久 override，
     * 少一個必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 → 退回骨架。
     */

    /**
     * 總開關。⭐ 出貨 **true** —— owner 現在正在 lag，一個預設關掉的儀表對他
     * 沒有任何用處（他要先知道有這個東西、還要先去後台打開，而那正是他回報
     * 問題的那一刻做不到的事）。關掉 = 普查完全不跑（**止血閥**）。
     */
    lifecycleLedgerEnabled: z.boolean().optional(),
    /**
     * 多久普查一次（秒）。普查 = 走一次場景的六份清單，成本與**一幀**要走訪的
     * 東西同一個數量級，而它跑在 UI 的取樣計時器上（⛔ 不在 rAF 迴圈裡），
     * 所以 2 秒一次對畫面是量不到的。調大 = 更省，代價是「最老活了幾秒」更粗。
     */
    lifecycleSampleSec: z.number().min(0.25).max(60).optional(),
    /**
     * 記幾個回合的快照。⭐ 這是**登記表自己的上限** —— 一個沒有上限的登記表
     * 就是下一個洩漏，所以它是環狀緩衝，滿了就把最舊的擠掉。
     * 調大 = 看得到更長的趨勢，代價是那幾份快照一直留在記憶體裡。
     */
    lifecycleRoundHistory: z.number().int().min(2).max(64).optional(),
    /**
     * 一類東西**多長幾個**才算「還在長」。⭐ 這是警報的門檻，⛔ 不是清理的門檻。
     * 調小 = 更敏感（也更容易被正常的暖機波動觸發）；調大 = 只抓大魚。
     */
    lifecycleGrowthMinDelta: z.number().int().min(1).max(4096).optional(),
    /**
     * 一類東西裡最老的那個活超過幾秒，就在匯出的表上標成「超齡」。
     * ⛔ **它不會把任何東西收掉** —— 收的是 `vfxHardMaxLifeSec` 那一格。
     * 0 = 不標記。出貨 180 秒 ≈ 兩個回合，所以被標到的東西一定跨過回合邊界活著。
     */
    lifecycleMaxAgeSec: z.number().min(0).max(3600).optional(),

    /* ── 🖼 地面貼圖跨回合快取的上限（GH#561）────────────────────────────────
     *
     * GH#536「地板全黑」的正解是**貼圖跨回合留著**（`render/groundTextureCache`
     * 的 per-Scene `WeakMap`），⭐ 那是對的設計 —— ⛔ 但它**沒有上限**。
     *
     * 量到的（8 個回合逐輪換出貨場地）：`scene.textures` = 5 → 9 → 13 → 13 →
     * 17 → 21 → 21 → **25**（碰到重複的風格會持平 ⇒ 它**有界**，界是「不同的
     * `style@uvScale` 組數」）。出貨 13 張場地 ⇒ 上界約 13 組 × 4 張 = **52 張**
     * 512² 地面 PNG 常駐（含 mipmap ≈ 5.6 MB / 組 ⇒ **≈ 73 MB VRAM**）。
     * ⚠️ 而「商店階段預熱」（`warmGroundTextures`）會在**第一個中場**就把每一種
     * 風格都抓進來 —— 也就是說那 52 張在第一個商店就全部到位，
     * 而 `AdaptiveQuality` 的降級階梯**碰不到它**。
     *
     * ⇒ 這兩格就是那個降級階梯。**組數**上限（⛔ 不是張數：一組必然是四張，
     * 用張數當單位會讓「3 張」這種畫不出來的數字通過）。
     * 超出時淘汰**最久沒有被建場用過的那一組**（LRU），⛔ 而預熱**永遠不淘汰**
     * 任何東西 —— 它只在還沒滿的時候補，滿了就不再預熱（⛔ 不是抓下來再丟掉）。
     *
     * ⚠️ 兩格都 `.optional()`，理由同上面每一族：線上已經有耐久 override，
     * 少一個必填欄會讓整份 config 被 Zod 退回 → 內容載入失敗 → 退回骨架。
     */

    /**
     * 🖼 桌機：同時保留幾**組**地面貼圖（一組＝albedo/normal/orm/macro 四張）。
     *
     * 調小＝省 VRAM，代價是換到一張被淘汰過的場地時，那幾幀地板是**平色**
     * （⛔ 不是黑的 —— 平色退場是 GH#536 一起做的漸進式增強）。
     * 調大＝換圖無縫，代價是記憶體。
     */
    groundTextureCacheMax: z
      .number()
      .int()
      .min(GROUND_TEX_CACHE_BOUNDS.min)
      .max(GROUND_TEX_CACHE_BOUNDS.max)
      .optional(),
    /**
     * 🖼 手機／低畫質：同時保留幾組。⭐ 這一格存在的理由就是 issue 的那句話 ——
     * 「⚠️ 手機／內顯上這可能是致命的，而降級階梯碰不到它」。
     * 讀的是 `effectiveQuality() === "mobile"`（含 auto 判定成 mobile 的內顯）。
     */
    groundTextureCacheMaxMobile: z
      .number()
      .int()
      .min(GROUND_TEX_CACHE_BOUNDS.min)
      .max(GROUND_TEX_CACHE_BOUNDS.max)
      .optional(),
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
  // `content/vfxCleanupConfig.test.ts` 的 drift 斷言在守。
  maxOneShotEmitters: 96,
  // ⭐ 出貨值＝搬過來之前 `RibbonTrail.ts` / `ribbonMath.ts` 的那兩個常數。
  maxActiveRibbons: 10,
  ribbonFadeBudgetSec: 0.2,
  emitterSweepSec: 2,
  purgeImpactPoolOnRoundEnd: true,
  // owner 2026-08-17 —— 下一回合開打就把上一回合的勝利煙火停掉並重新武裝勝利偵測。
  // 三個住處都有它：這裡 · Zod（`.optional()`，線上舊 override 沒有這一格）·
  // `content/config/vfx-cleanup.json`。
  purgeVictoryFxOnCombatStart: true,
  // owner 2026-08-23 GH#569 —— 「fade out 尾段一律最多佔 0.5 秒後一定要清理乾淨」
  // 是**常設規定**，所以出貨值就是他說的那個數字，⛔ 不是我挑的。
  vfxFadeOutMaxSec: 0.5,
  // 💨 owner 2026-08-24 GH#660 —— 「淡出時間可以縮短 我不喜歡天空有殘留特效」。
  // 出貨值沿用他在 GH#569 立的那條常設規定的秒數（0.5），⛔ 不是我另外挑的數字。
  vfxDissipateMaxSec: 0.5,
  fxTintEmissiveFloor: 0.05,
  // 🔆 ⭐ **我挑的**（owner 2026-08-23 常設：「沒做完以前別問我了自己判斷 但是留
  // 後台開關可以簡易 rollback」）：預設 `true`，因為原作那一族**就是** additive
  // （`w3xlib/gltf.py` 自己的檔頭承認 BLEND 只是 approximation），而第〇·六守則的
  // 階梯說高優先序的來源贏 ⇒ 它「預設啟動」。⛔ 這一格引用不到 owner 的任何一句
  // 原話，所以它**不可以**寫進 release note 的「owner 的裁決」那一節。
  stockGlowAdditive: true,
  // owner 2026-08-23 GH#569 —— 「紅色粒子飄上天時間都要減半以上」＝生成窗口減半。
  castMoteEmitShare: 0.5,
  // ⏳ owner 2026-08-23 GH#570 —— 「產生後生命週期最多維持三秒，三秒後一律強制
  // 清理回收」。出貨值就是他說的那個數字，⛔ 不是我挑的。
  vfxHardMaxLifeSec: 5,
    // ⭐ GH#803 —— 我挑的（owner 2026-08-23 常設指令：「沒做完以前別問我了自己判斷
    //    **但是留後台開關可以簡易 rollback**」）。預設**啟動**（第〇·六守則：優先權大的
    //    更新後都是預設啟動）。關掉 ⇒ 逐位元回到「只有 geoset、沒有原作粒子」的今天。
    modelFxEmittersEnabled: true,
  // 🧹 owner 2026-08-27 GH#819 —— 「既然做成開關 那就請你**預設是會清理完重新
  // 盤點必要物件載入後 再進入戰鬥回合**」⇒ 預設就是他點名的 full，⛔ 不是我挑的。
  roundPurgeMode: "full",
  // ⭐ 我挑的（owner 2026-08-23:「沒做完以前別問我了自己判斷 但是留後台開關可以
  // 簡易 rollback」）：預設 `"scene"`，因為他的原話是「**不管什麼特效，包含技能、
  // 場地特效等**」—— 場地火把不走 vfx 管線，只有 `"scene"` 掃得到它。
  vfxHardCapScope: "scene",
  // ⭐ 刻意長命的那一族（逐個查過出貨的 `new ParticleSystem(...)` 命名）：
  //   torch-flame- ArenaScene 場地火把（常駐布景）
  //   fire-ring-   火圈（整回合都在，`FireRingFx` 另外也用旗標標過）
  //   revive-      復活圈餘燼（活到有人救起來為止，是伺服器決定的）
  //   proj-        投射物拖尾（活到投射物落地）
  //   coin- / flower-  地上的金幣/花的光點（活到被撿走）
  //   login- / intermission-  登入頁與中場的背景粒子（不在對局場景裡）
  vfxHardCapExemptPrefixes: [
    "torch-flame-",
    "fire-ring-",
    "revive-",
    "proj-",
    "coin-",
    "flower-",
    "login-",
    "intermission-",
  ],
  // 🔬 owner 2026-08-23「設計一個機制捕捉與監控每個物件的生命週期及存活時間限制」。
  // ⭐ 五格都是**我挑的**（owner 2026-08-23:「沒做完以前別問我了自己判斷 但是留
  // 後台開關可以簡易 rollback」）—— 他只說了要有這個機制，⛔ 沒有給任何數字。
  // 出貨 true 的理由：他**現在**正在 lag，一個要先去後台打開的儀表幫不到那一刻。
  lifecycleLedgerEnabled: true,
  lifecycleSampleSec: 2,
  lifecycleRoundHistory: 16,
  lifecycleGrowthMinDelta: 8,
  lifecycleMaxAgeSec: 180,
  // 🖼 GH#561 —— ⭐ 兩格都是**我挑的**（owner 2026-08-23:「沒做完以前別問我了
  // 自己判斷 但是留後台開關可以簡易 rollback」）。⛔ 他沒有給任何數字。
  //   · 桌機 8 組（≈45 MB）：出貨只有 7 種地面風格,8 組表示「同一種風格的兩個
  //     半徑變體」也還放得下 ⇒ 正常一場比賽**幾乎不會淘汰**,而 13 張場地能長到
  //     的 13 組被擋在 8 ⇒ 上界從 ≈73 MB 降到 ≈45 MB。
  //   · 手機 4 組（≈22 MB）＝下界：一張場地最多兩個鍵,4 組 = 當前那一張 + 上一張,
  //     所以「上一回合剛打過的那張」重播時仍然是零抓取。
  // 要一鍵回到 GH#561 之前（完全不淘汰）就把兩格都拉到上界 64。
  groundTextureCacheMax: 8,
  groundTextureCacheMaxMobile: 4,
};
