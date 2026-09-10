/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  傷害型別轉換 —— 無視防禦 / 真實傷害家族
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 三件 owner 文案承諾了「這一發傷害換一個型別」的傳說武器:
 *
 *   · 霸王破甲槍   `godie-i00f` 「[無視] 普攻無視敵方防禦真實傷害」
 *   · 死之王的長槍 `godie-i01d` 「[無視] 普通攻擊無視防禦給予傷害」
 *   · 惡夢魔王碎片 `godie-i067` 「[真實傷害] 所有裝備者技能傷害都轉為真實傷害」
 *
 * 注意**範圍不一樣**:前兩件換的是普通攻擊,第三件換的是技能。那個差異就是設計
 * 本身,所以它是一個**欄位**({@link DamageTypeOverride.scope}),不是兩條程式路徑。
 *
 * ── ① 為什麼是「重蓋封包型別」,不是新的減傷數學 ───────────────────────────
 *
 * `combat/damage.ts` 的 `mitigate()` 在 `pkt.type === "true"` 就直接 return
 * `pkt.amount` —— 護甲/魔抗那條 `100/(100+resist)` 曲線整個跳過。所以「無視防禦」
 * 在這個 sim 裡**已經有一個精確的表示法**了,缺的只是「誰把封包蓋成 true」。
 *
 * 另一條路是新增一個 `Stat.ArmorPen`(兩份 authoringNote 都把它列為方案 (a))。
 * 它要動 `statTypes` / `STAT_CLAMPS` / `ITEM_MODIFIER_LIMITS` / 面板 / 商店即時
 * 預覽,而且**表達不出 惡夢魔王碎片**:那件講的是「技能傷害轉為真實傷害」,
 * 穿甲值對法術傷害無話可說。一個穿甲屬性會讓三件裡的一件永遠做不出來。
 *
 * ── ② 為什麼接縫在**傷害佇列**,不在 BasicAttackSystem ─────────────────────
 *
 * 兩份 authoringNote 都建議「由 `BasicAttackSystem` 組封包時讀」。那會是**錯的
 * 接縫**,而且錯法是可以數出來的:全樹有 **9** 個 `world.damageQueue.push` 站點
 * (BasicAttackSystem · ProjectileSystem · effects/damage · effects/damageArea ·
 * effects/damageLine · effects/dotTick · MobSystem · GuardianSystem ×2)。普攻
 * 自己就佔兩個 —— 近戰在 `BasicAttackSystem`,遠程在 `ProjectileSystem` ——
 * 所以「在 BasicAttackSystem 蓋」的意思是**遠程英雄拿霸王破甲槍沒有效果**,
 * 而那正是 CLAUDE.md 失敗形態 ②(做了但玩家拿不到)。
 *
 * 佇列的抽乾迴圈是那 9 個站點的**唯一匯流處**,而且 `combatResolveSystem` 的
 * 註解自己就寫著「Every damage source (basics, abilities, item/augment procs,
 * DoTs) drains through this queue」。在那裡蓋一次 = 普攻(近+遠) + 技能(瞬發/
 * 讀條/投射物) + DoT 全部一次到位,而且新增第 10 個 push 站點也自動被涵蓋。
 *
 * ── ③ 為什麼它掛在 `ModifierSource` 上 ────────────────────────────────────
 *
 * 跟 `evasionScope` / `vision` / `flight` 同一個理由,而且這裡更強:
 * 「我的普攻是真實傷害」是**那件裝備**的性質,不是一個可以加總的數字。
 * 沒有任何一條 `Stat` 能記住「A 這件讓普攻變真傷、B 這件沒有」——
 * 聚合出來的單一數字一定會把兩者混成一個。
 *
 * `economy/itemSource.ts` 是道具變成 `ModifierSource` 的**唯一**地方,所以
 * 「三件道具上線」的全部成本就是那個檔的一行轉發 —— 商店的即時預覽、codex、
 * 快照摘要讀的都是同一個 source,不可能跟 sim 講不一樣的話。
 *
 * ── ④ 純度 ────────────────────────────────────────────────────────────────
 *
 * 沒有 rng、沒有 `Date.now`、沒有三角函式、沒有 `**`。唯一的迭代是對
 * `StatsComp.sources` 這個**陣列**依索引掃描,沒有任何 Map 迭代,所以不會有
 * 順序洩漏。到期判斷用絕對 tick(`expiresAtTick > world.tick`),沒有遞減計數器。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { DamageType } from "../effects/effect";

/**
 * WHICH outgoing packets a source converts.
 *
 * ⚠️ 先把**出貨的 origin 字彙**列出來,因為這個欄位的語意完全掛在它上面。
 * 全樹只有 9 個 `world.damageQueue.push` 站點(同上面 ② 數的那 9 個),它們寫得
 * 出來的 origin 只有:
 *
 *   `"basic"`            —— `systems/BasicAttackSystem.ts`(近戰)與
 *                           `systems/ProjectileSystem.ts`(遠程普攻投射物)
 *   `` `ability:${id}` `` —— `abilities/abilitySystem.ts` / `systems/CastResolveSystem.ts`
 *                           寫進 `EffectCtx.origin`,再由 `effects/damage.ts`、
 *                           `effects/damageArea.ts`、`effects/damageLine.ts` 與
 *                           **`effects/dotTick.ts`**(經 `DotInstance.origin`)
 *                           原封不動帶下去。投射物也一樣:`effects/spawnProjectile.ts`
 *                           把 `ctx.origin` 存進 `ProjectileComp.origin`,
 *                           `ProjectileSystem` 命中時再用它跑 `onHit` 的效果。
 *   `` `hook:${srcId}` `` —— `effects/hooks.ts`(道具/被動的 proc)
 *   `"mob"`              —— `systems/MobSystem.ts`
 *   `"guardian"` / `"guardian-heir"` —— `systems/GuardianSystem.ts`
 *
 * (`"fireRing"` / `"flower"` / `"lifesteal"` 看起來像但**不是**傷害封包的
 * origin:火圈走 `combat/environmentalBurn.ts` 的環境燒傷出口 —— 過無敵/免死,
 * 但**不進佇列**,所以型別轉換碰不到它;另外兩個是治療/事件。)
 *
 *   · `"basic"`   —— `origin === "basic"`,也就是普通攻擊(近戰在
 *                    `BasicAttackSystem`,遠程在 `ProjectileSystem`,兩個都算)。
 *   · `"ability"` —— `origin` 以 `"ability:"` 開頭。**技能**打出去的每一發,
 *                    ⚠️ **包含技能留下的延燒/中毒每一跳**。
 *   · `"all"`     —— 這個來源打出去的每一發封包,額外把 `hook:`(道具/被動
 *                    proc)、`mob`、`guardian` / `guardian-heir` 也蓋進來。
 *
 * ── ⚠️ 「技能留下的延燒算不算技能傷害」 = **算**(owner 2026-08-01) ──────────
 *
 * owner 的裁決是「技能留下的延燒,算不算『技能傷害』? => yes,除非特別講真傷」。
 * 程式本來就是這樣跑的,而不是巧合:`effects/dot.ts` 把 `ctx.origin` 原封不動
 * 寫進 `DotInstance.origin`,`effects/dotTick.ts` 又把它原封不動寫進封包,所以
 * 一支技能授權的燒傷每一跳都帶著 `ability:<id>` → 落在 `"ability"` 裡 → 惡夢魔王
 * 碎片**會**把它轉成真傷。
 *
 * 「除非特別講真傷」那半句在這個機制裡是**自動成立**的:一支已經寫成
 * `damageType: "true"` 的燒傷被轉成 `"true"` 是恆等式,`mitigate()` 對它的行為
 * 一個字都不會變(守衛:`damageTypeOverride.test.ts` 的
 * 「an ability-authored DoT already written as TRUE damage is not double-handled」)。
 *
 * ⚠️ 一個 **`hook:` 授權的**燒傷(道具 proc 掛上去的)帶的是 `hook:<srcId>`,
 * 所以它**不**在 `"ability"` 裡 —— 落差在「誰授權的」,不在「它是不是 DoT」。
 *
 * ⚠️ **為什麼沒有 `"nonBasic"`**(`HookDef.damageSource` 有那個成員)。那個欄位
 * 是在問「打到我的是不是普攻」,而「不是普攻」是一個誠實的補集。這裡問的是
 * 「我要換掉哪些」,而 owner 的文案講的是**技能**(「所有裝備者技能傷害」)——
 * 一個叫 `nonBasic` 卻被用來實作「技能」的欄位會把道具 proc(`hook:`)與守衛塔
 * 封包偷偷帶進來,那是一個名字說謊的欄位(CLAUDE.md 第三守則)。要「全部」的人
 * 寫 `"all"`,而 `"all"` 沒有假裝自己只有技能。
 */
export type DamageConversionScope = "basic" | "ability" | "all";

/**
 * 這個來源何時把封包蓋掉 —— **一個決策點,所以是一個欄位**。
 *
 * `combatResolveSystem` 的封包迴圈依序是:
 *
 *   ① 無敵/免疫 `refusesDamage(world, target, pkt.type)`
 *   ② 閃避(技能通道)`rollEvadeAbility(…, pkt.type === "true")`
 *   ── 這裡是 "afterGates" ──
 *   ③ 全域傷害倍率 → ④ `mitigate()` 護甲/魔抗 → ⑤ 護盾池(依 `absorbs` 型別過濾)
 *
 * 蓋在 ① 之前還是之後,答案完全不同,而且**兩個都講得通**:
 *
 *   · `"afterGates"`(**預設**)—— ①② 看到的是**原本的型別**。魔法免疫
 *     (47-04 天翔龍閃、97-04 火產靈神)照樣擋得住 惡夢魔王碎片 轉出來的法術;
 *     一個「連技能也閃」的迴避來源照樣閃得掉。轉換只影響 ④⑤(護甲/魔抗與
 *     護盾型別),也就是「無視防禦」這句話**字面上**要的東西,一點不多。
 *   · `"beforeGates"` —— ①② 看到的是 `"true"`。於是魔法免疫擋不住它了
 *     (`blocksTrueDamage` 是另一根軸,見 `effects/invulnerable.ts`),
 *     預設的迴避也閃不掉它(`EvasionScope.trueDamage` 預設 false)。
 *
 * **預設選 `"afterGates"`,因為它改的東西嚴格比較少。** owner 的文案只說了
 * 「無視防禦」,沒有說「無視免疫」;讓一件武器順便穿透三支英雄技能與一件道具的
 * 魔法免疫,是一個沒有人要求過的隱性升級。要那個語意就在文件裡寫出來,它會出現
 * 在編輯器的卡片上 —— 而不是藏在這裡的一行程式裡。
 */
export type DamageConversionPhase = "afterGates" | "beforeGates";

/**
 * 被轉換過的封包,**擊倒判定**要讀哪一個型別 —— 一個決策點,所以是一個欄位。
 *
 * 為什麼這件事存在:`combat/damage.ts` 的 `applyImpact` 用
 * `type !== "magic"` 當擊倒的閘(「法術會推但不會把人打趴」)。轉換發生在那一行
 * **之前**,所以在這個欄位出現以前,惡夢魔王碎片 把 magic 蓋成 true 的同時,
 * **持有者的每一發法術都順便多了一個它本來沒有的擊倒** —— 一個 owner 的文案
 * 一個字都沒提、也沒有任何人選過的硬控升級。
 *
 *   · `"original"`(**預設**)—— 擊倒讀**轉換前**的型別。惡夢魔王碎片 的法術
 *     跳過魔抗與魔法護盾(那是文案承諾的),但**不會**因此多出擊倒。
 *     「轉換傷害型別不會偷偷送出控場」是保守的那一側,所以它是預設。
 *   · `"converted"` —— 擊倒讀**轉換後**的型別,也就是這個欄位出現之前的行為:
 *     magic→true 的法術會開始把人打趴。想要「真傷連帶硬直升級」的武器就寫這個,
 *     它會出現在編輯器的卡片上,而不是藏在 `applyImpact` 的一行程式裡。
 *
 * ⚠️ 對 `scope: "basic"` 的兩件武器(霸王破甲槍 / 死之王的長槍)這一格是**嚴格
 * 的 no-op**:普攻本來就是 physical,physical 與 true 在那道閘的同一側。
 * 會被它改到的只有「原本是 magic、被轉成非 magic」這一種封包。
 *
 * ── ⚠️⚠️ 同名陷阱:`impactType` 曾經是兩個型別不同的欄位(2026-08-01 拆開) ──
 *
 * 這個 union 是 {@link DamageTypeOverride.impactType} 的型別 ——
 * `"original" | "converted"`,一個**政策**。它跟封包上那個「擊倒閘讀哪一個傷害
 * 型別」的欄位長得很像,而後者的值是 `"physical" | "magic" | "true"`。兩者曾經
 * **都叫 `impactType`**,而且在 `applyDamageConversion` 裡並肩出現:
 *
 *     if (conv.impactType === "converted") delete pkt.impactType;   // 舊寫法
 *
 * 那一行沒有錯,但下一個人只要把其中一個 `impactType` 讀成另一個的意思,寫出
 * `pkt.impactType = conv.impactType` 就會通過型別檢查嗎?**不會** —— 兩個 union
 * 沒有交集,TypeScript 會擋。真正的代價不是型別安全,是**閱讀**:兩個同名欄位在
 * 同一個運算式裡,任何關於它的註解都得先花一句話講「我說的是哪一個」,而這正是
 * 上一版註解說錯話(見 `applyDamageConversion` 的四列表)的土壤。
 *
 * 所以 2026-08-01 把**封包那一個**改名成 `DamagePacket.impactGateType`(讀取器
 * 同步改名成 `impactGateTypeOf`)。改封包側而不是改這一側,是因為:
 *   · 封包欄位是 sim 內部的,只有 `applyDamageConversion` 寫、只有
 *     `impactGateTypeOf` 讀,不上 Colyseus schema、不進 `content/`;
 *   · **這一側是 `content/` 的 schema 欄位** —— `content/schema/item.ts` 收它、
 *     惡夢魔王碎片 `godie-i067.json` 出貨帶著它、後台編輯器顯示它。改這一側等於
 *     改出貨資料 + 重跑 `content:build` + 動 `damageTypeOverride.shipped.test.ts`,
 *     而且 owner 已經在卡片上看過這個名字了。
 */
export type ConvertedImpactType = "original" | "converted";

/**
 * 一個來源(道具/技能被動/buff)對它**打出去**的傷害做的型別轉換。
 *
 * 四個欄位都是決策點:換哪些({@link scope})、換成什麼({@link becomes})、
 * 什麼時候換({@link applyAt})、換完之後**擊倒**讀哪一個({@link impactType})。
 */
export interface DamageTypeOverride {
  /** 換哪些封包。沒有預設 —— 必填,因為「普攻」與「技能」的差別就是這一族的設計。 */
  scope: DamageConversionScope;
  /**
   * 換成什麼型別。出貨的三件都是 `"true"`(真實傷害)。
   *
   * 它是一個完整的 `DamageType` 而不是一個 `toTrue: boolean`,因為 WC3 有一整族
   * 「攻擊屬性轉換」(把物理打成魔法或反過來)的道具與光環,而那一族用同一個
   * 機制就表達得出來 —— 多開一個 boolean 才是把決策烘進程式。
   */
  becomes: DamageType;
  /**
   * 相對於無敵/閃避兩道閘,什麼時候蓋。省略 = `"afterGates"`(保守的那個)。
   * 見 {@link DamageConversionPhase}。
   */
  applyAt?: DamageConversionPhase;
  /**
   * 蓋完之後,**擊倒判定**讀轉換前還是轉換後的型別。省略 = `"original"`
   * (保守的那個:轉換傷害型別不會偷偷送出控場)。見 {@link ConvertedImpactType}。
   */
  impactType?: ConvertedImpactType;
}

/** 技能傷害的 origin 前綴。兩個建造點都是 `` `ability:${id}` `` 樣板字串 —— */
/** `abilities/abilitySystem.ts` 與 `systems/CastResolveSystem.ts` —— 所以前綴 */
/** 永遠在位置 0,`startsWith` 與 `indexOf >= 0` 在出貨內容上等價。 */
const ABILITY_ORIGIN_PREFIX = "ability:";

/** 普通攻擊的 origin(近戰與遠程投射物都寫這個字串)。 */
const BASIC_ORIGIN = "basic";

/** 這一發封包落不落在這個範圍裡。純字串判斷,沒有世界狀態。 */
export function originInScope(origin: string, scope: DamageConversionScope): boolean {
  if (scope === "all") return true;
  if (scope === "basic") return origin === BASIC_ORIGIN;
  return origin.startsWith(ABILITY_ORIGIN_PREFIX);
}

/**
 * 兩個來源同時想蓋同一發封包時,誰贏 —— 一個**全序**,所以答案跟裝備順序無關。
 *
 * 為什麼需要它:`StatsComp.sources` 的順序是 attach 順序(= 買東西的順序),
 * 「先掃到的贏」會讓「先買 A 再買 B」與「先買 B 再買 A」跑出不同的結果。那是
 * 一個玩家看得見、卻沒有任何人設計過的差別,而且在重播/預測兩邊都可能對不上。
 *
 * ⚠️ **這張表是刻意寫死的,不是一個漏掉的後台欄位。** CLAUDE.md 第一守則說寫死
 * 才需要理由,所以這裡是理由 —— 以及「把它開成欄位會壞掉什麼」:
 *
 *   ① **正確性來自「它是一個全序」,不是來自那三個數字。** 任何一組兩兩相異的
 *      整數都給出同一個保證(結果與裝備順序無關)。開成欄位之後 operator 唯一
 *      新增的表達力就是**打破全序** —— 填成平手,或漏填一格。而平手 = 回到
 *      「先掃到的贏」= `StatsComp.sources` 的 attach 順序(買東西的順序)決定
 *      結果,那正是這個常數存在要消滅的那個缺陷,而且它在重播與客戶端預測兩邊
 *      都會對不上。一個只能用來製造那個缺陷的欄位不是彈性。
 *   ② **它在畫面上沒有任何投影。** 沒有一張卡片、一個 tooltip、一行 codex 顯示
 *      「轉換優先度」。一個看不到效果的欄位只有兩種狀態:預設值,或是被調錯了
 *      而沒有人會發現。
 *   ③ **真正屬於設計的那一格已經是欄位了** —— {@link DamageTypeOverride.becomes}
 *      (「我這一件換成什麼」)。這裡決定的是「兩件同時想換的時候平手怎麼判」,
 *      那是一條政策,不是某一件道具的性質。
 *   ④ 出貨的三件 `becomes` 全部是 `"true"`(`damageTypeOverride.shipped.test.ts`
 *      的 `EXPECTED` 把三件逐件釘死),所以**今天沒有任何一組出貨內容碰得到這個
 *      比較**。要它變成一個有意義的旋鈕,得先有人做出兩件 `becomes` 不同又會
 *      同時生效的道具 —— 到那一天該問的是「哪一件的**描述**說了它蓋過另一件」,
 *      而那個答案會是一個道具欄位,不是這張全域表。
 *
 * 唯一有設計意義的一條是 `"true"` 排最高:真實傷害是最強的那一種,所以它永遠不會
 * 被同時裝備的另一件道具降級。physical 與 magic 之間誰高誰低沒有設計意義 ——
 * 重點不是選了哪一個,而是**永遠選同一個**。
 */
const CONVERSION_RANK: Record<DamageType, number> = { physical: 1, magic: 2, true: 3 };

/**
 * 一次**已經決定好的**轉換:蓋成什麼,以及擊倒判定跟著誰。
 * `impactType` 已經把 ABSENT 解成 `"original"`,所以呼叫端不用再記預設值。
 */
export interface ResolvedDamageConversion {
  becomes: DamageType;
  impactType: ConvertedImpactType;
}

/**
 * `source` 這個實體在 `phase` 這一刻,要怎麼蓋一發 `origin` 的封包 ——
 * 沒有任何來源要蓋就回 `undefined`。
 *
 * ⚠️ **回 `undefined` 與「回原本的型別」不是同一件事**,呼叫端不可以把兩者合併:
 * 前者是「沒有人要動它」,後者是「有人蓋了,只是蓋成一樣的」。目前兩者的行為
 * 相同,但把它們混起來會讓之後任何一個「有沒有被轉換過」的讀者(浮動數字的
 * 樣式、記分板、稽核)拿到假的答案。
 */
export function resolveDamageConversion(
  world: SimWorld,
  source: EntityId,
  origin: string,
  phase: DamageConversionPhase,
): ResolvedDamageConversion | undefined {
  const sc = world.stats.get(source);
  if (!sc) return undefined;
  let best: ResolvedDamageConversion | undefined;
  // 陣列,依索引 —— 沒有 Map 迭代,所以沒有順序洩漏(sim/purity.test.ts)。
  for (let i = 0; i < sc.sources.length; i++) {
    const src = sc.sources[i];
    const ov = src?.damageTypeOverride;
    if (ov === undefined || src === undefined) continue;
    // 到期的 buff 不再轉換。絕對 tick 比較,跟 `hasDamageReductionBuff` 同一條
    // 規則 —— 沒有這一行,一個 3 秒的「真傷附魔」會在來源被清掉之前的那幾 tick
    // 繼續生效,而且只在某些 tick 生效(誰先掃到誰贏)。
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if ((ov.applyAt ?? "afterGates") !== phase) continue;
    if (!originInScope(origin, ov.scope)) continue;
    // ⚠️ 贏家是**整組**帶走的,不是逐欄位取最大。`becomes` 與 `impactType` 是同
    // 一件裝備上的一組設定,拆開取「最高的 becomes + 最寬鬆的 impactType」會組出
    // 一個沒有任何一件道具描述過的行為(而且那個組合不會出現在任何一張卡片上)。
    if (best === undefined || CONVERSION_RANK[ov.becomes] > CONVERSION_RANK[best.becomes]) {
      best = { becomes: ov.becomes, impactType: ov.impactType ?? "original" };
    }
  }
  return best;
}

/**
 * 舊介面的薄包裝 —— 只要「蓋成什麼」的呼叫端(與大量既有測試)用這個。
 * 語意與回 `undefined` 的意義跟 {@link resolveDamageConversion} 一模一樣。
 */
export function resolveDamageTypeOverride(
  world: SimWorld,
  source: EntityId,
  origin: string,
  phase: DamageConversionPhase,
): DamageType | undefined {
  return resolveDamageConversion(world, source, origin, phase)?.becomes;
}

/**
 * 把一次轉換**套用**到封包上 —— 唯一會寫 `pkt.type` / `pkt.impactGateType` 的
 * 地方。
 *
 * 為什麼是一個函式而不是呼叫端的兩行:`combatResolveSystem` 有**兩個**相位呼叫
 * 它(`beforeGates` / `afterGates`),而「擊倒讀哪一個型別」的記帳只要在其中一個
 * 相位漏掉,行為就會依 owner 有沒有把 `applyAt` 調成 `beforeGates` 而不同 ——
 * 一個只在後台某一格被撥動之後才出現的差異,是最難被看見的那種。
 *
 * ⚠️⚠️ **兩個同名的 `impactType` 是兩種不同的東西**(見 {@link ConvertedImpactType}
 * 檔頭的「同名陷阱」)。這個函式的兩個參數各帶一個:
 *   · `conv.impactType`      是 {@link ConvertedImpactType}(`"original"|"converted"`)
 *                            —— **這一次轉換的政策**。
 *   · `pkt.impactGateType`   是 {@link DamageType}(`"physical"|"magic"|"true"`)
 *                            —— **擊倒那道閘要讀的型別**。它以前也叫 `impactType`,
 *                            2026-08-01 改名就是為了讓上面這一行不用解釋。
 *
 * ── 記帳規則,逐字對應下面三行 ──────────────────────────────────────────────
 *
 *   · `"original"`(預設)—— `pkt.impactGateType = pkt.impactGateType ?? before`,
 *     其中 `before` 是**這一次呼叫進來時**封包上的型別。所以它記的是
 *     「**我這一次**蓋之前的型別」,而 `??` 讓**已經有記錄的**那一個活下來。
 *   · `"converted"` —— **刪掉**記錄。`impactGateTypeOf` 就回去讀 `pkt.type`
 *     (也就是這個欄位出現之前的行為)。刪除是它的語意本身,不是最佳化。
 *
 * ── ⚠️ 兩個相位都蓋的時候會怎樣 —— **四種組合逐一寫出來,因為它們不對稱** ──
 *
 * (原始型別 magic,兩個來源都轉 true;實測 2026-08-01)
 *
 *   | beforeGates  | afterGates   | 最後 `impactGateType` | 擊倒閘讀到 |
 *   |--------------|--------------|----------------------|-----------|
 *   | `original`   | `original`   | `magic`              | `magic`   |
 *   | `original`   | `converted`  | ABSENT               | `true`    |
 *   | `converted`  | `original`   | **`true`**           | `true`    |
 *   | `converted`  | `converted`  | ABSENT               | `true`    |
 *
 * ⚠️ **第三列是這個檔案 2026-08-01 之前的註解說謊的地方。** 那句話寫著
 * 「`??` 而不是直接賦值,所以兩個相位都蓋時保留的是最原始的那一個」—— 對第一列
 * 成立,對第三列**不成立**:`converted` 已經把記錄刪掉了,所以第二相位的
 * `?? before` 找到 ABSENT,記下的是**第一相位的產物**(`true`),不是最原始的
 * `magic`。守衛:`damageTypeOverride.test.ts` 的
 * 「applyDamageConversion — 兩個相位都蓋時的四種組合」,四列全部釘死。
 *
 * ── 為什麼**程式是對的、話才是錯的** ────────────────────────────────────────
 *
 * `impactType` 是**一個來源對它自己那一次轉換**講的話,不是對整發封包的裁決:
 * `"original"` 的意思是「**別讓我這一次**轉換把擊倒閘推開」,而不是「把別人明講
 * 要的擊倒收回去」。第三列裡的 `converted` 來源是 operator 在後台**明著選**的
 * 加成(它的卡片上寫著這件事),讓一件後買的、只是不想自己送控場的道具默默把它
 * 撤銷,會讓**一件道具的自述行為取決於你身上還帶了什麼**,而兩張卡片都不會提到
 * 對方。目前這個寫法下,兩個來源各自要的東西都拿到了。
 *
 * 要讓那句舊話成立,得在封包上再開**第三個**欄位記住「最最原始的型別」——
 * `"converted"` 的語意就是刪掉記錄,不刪它就不是 `"converted"` 了。多一個欄位、
 * 多一條記帳規則,換一個**沒有任何出貨內容產得出來**的組合(三件出貨道具都省略
 * `applyAt`,只有 惡夢魔王碎片 明寫 `impactType:"original"`,見
 * `damageTypeOverride.shipped.test.ts`),不划算。所以:改話,不改程式。
 */
export function applyDamageConversion(
  pkt: { type: DamageType; impactGateType?: DamageType },
  conv: ResolvedDamageConversion,
): void {
  const before = pkt.type;
  pkt.type = conv.becomes;
  if (conv.impactType === "converted") delete pkt.impactGateType;
  else pkt.impactGateType = pkt.impactGateType ?? before;
}

/**
 * 擊倒/硬直這一類**衝擊反應**要讀的型別。ABSENT `impactGateType` = 沒有人轉換過
 * 這一發(或最後一個轉換者選了 `"converted"`)= 讀 `type`,也就是這個欄位出現
 * 之前的每一發封包 —— 所以加上它是一個嚴格的 no-op。
 */
export function impactGateTypeOf(pkt: {
  type: DamageType;
  impactGateType?: DamageType;
}): DamageType {
  return pkt.impactGateType ?? pkt.type;
}
