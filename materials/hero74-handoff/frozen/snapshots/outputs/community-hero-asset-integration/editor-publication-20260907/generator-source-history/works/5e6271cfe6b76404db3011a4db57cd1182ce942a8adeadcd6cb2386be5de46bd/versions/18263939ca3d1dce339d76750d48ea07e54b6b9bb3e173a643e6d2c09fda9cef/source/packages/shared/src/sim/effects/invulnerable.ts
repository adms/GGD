/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  `invulnerable` — 無敵 / 免疫 (GH#289 lane P3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── ① 為什麼是一個 kind,而不是 `StatusComp` 上多一個旗標 ────────────────────
 *
 * 接縫留下來的理由是「熱路徑,陣列掃描太慢」。那是真的,但**不是決定性的理由**
 * —— 決定性的是這三件:
 *
 *   (a) **免疫和它要擋的東西不能住在同一個容器裡。** 控制免疫要做的事就是
 *       「不要讓這一筆 CC 進 `st.effects`」。如果免疫本身也是 `st.effects` 的
 *       一員,那「擋不擋」的答案就取決於同一個陣列的內容與順序 —— 一個
 *       `applyStatus` 可以在同一 tick 內先塞 CC 再塞免疫,結果就變成掃描順序決定
 *       生死。獨立的 store 讓「誰在擋」永遠不可能是「誰正要被擋」。
 *
 *   (b) **`StatusEffect` 沒有地方放 `blocksDamage` / `blocksControl`。** 要放就得
 *       動 `components.ts`,而那是好幾條 lane 共用的檔(接縫的 header 明講)。
 *
 *   (c) **一個 status 是靠 `applyStatus` 掛上去的**,也就是控制免疫要攔截的那條
 *       路。隊友幫你上無敵會走進自己剛剛關上的門 —— 自我封鎖。
 *
 * 所以 P3 用 {@link SimWorld.invulnerable},而且它的值不是「一個到期 tick」,
 * 是**四根軸各自的到期 tick**(見 {@link ImmunityGrant})。
 *
 * ── ② 無敵 vs 免疫:到底有幾根軸 ────────────────────────────────────────────
 *
 * 原作 WC3 有兩個機制,出貨內容各要一種,而且**還有第三種**:
 *
 *   · `Avul`(SetUnitInvulnerable)—— 完全無敵。JASS 裡 30+ 個站點:
 *     `Trig_ExcaliburMAX`(Saber)、`Trig_HundredKill`(百連我殺)、
 *     `Trig_Nine_Lives_EX`、`Trig_Trample_Start`(蹂躪)、`Trig_MoonKnock`
 *     (蒼月潮 07-02)、`Trig_WildCut`、`Trig_Luf_Three`、`Trig_Hell_Rock`、
 *     `Trig_GiveMeHoney`、`Trig_HehiSword`、`Trig_SuperFF7`…
 *     內容面:41-002 絕對屏障「單位狀態為無敵」、29-03 有功夫無懦夫「統統進入
 *     無敵狀態」。
 *   · **魔法免疫** —— 只免魔法傷害(且在 WC3 裡連帶免掉敵方法術):
 *     47-04 天翔龍閃「魔法免疫」、97-04 / 97-002 火產靈神「擁有魔法免疫」、
 *     99-04 世界第一的公主殿下「不受任何魔法傷害」、道具 黃昏公主的血脈
 *     「6秒內將可對所有魔法免疫」。
 *   · **只擋負面狀態,完全不擋傷害** —— 07-01 臨、兵、鬥「可抵擋對方負性魔法」。
 *     這一支證明了 **免傷與免控必須可以分開授予**:它是純免控。
 *
 * 於是欄位是三個正交的決策點,而不是一個 boolean:
 *   `blocksDamage`("all" | "none" | "physical" | "magic")
 *   `blocksTrueDamage`(真實傷害 —— 火圈 #270 就是這一種)
 *   `blocksControl`(免控)
 *
 * ⚠️ **`blocksControl` 預設 false,而且這是刻意的**,不是漏了。WC3 的 `Avul`
 * 確實連法術一起擋,照抄的話「免控」會**搭便車**掛在每一個免傷上 —— 14 支技能
 * 裡有 13 支的免控就變成後台看不見、內容也讀不出來的隱性效果,而那正是 owner
 * 2026-07-30「尤其是決策點」要治的病。想要 Avul 的完整語意就在文件裡寫
 * `blocksControl: true`,它會出現在編輯器的卡片上。
 *
 * ── ③ 為什麼是「每根軸各自一個到期 tick」而不是「一個到期 + 一組旗標」 ──────
 *
 * 兩層免疫會重疊:5 秒魔法免疫身上再吃 1 秒 Avul。單一到期的模型只能在
 * 「取 max 再 OR 旗標」(→ 物理免疫被錯誤延長到 5 秒)與「後者覆蓋前者」
 * (→ 魔法免疫被 1 秒的 Avul 砍短)之間二選一,兩個都是錯的。四個獨立的
 * 絕對 tick 取 max 之後語意精確,而且仍然是 O(1) 讀取。
 *
 * ── ④ 純度 ────────────────────────────────────────────────────────────────
 *
 * 全部是**絕對 tick**(`world.tick + N`),沒有遞減計數器;沒有 rng、沒有
 * `Date.now`、沒有三角函式、沒有 `**`。到期的 grant 只是「不再回 true」,
 * 不需要任何 system 去清 —— 也因此 P3 完全不必碰 `sim/systems/`。
 * `digest()` 只折進**還活著**的軸,所以一個過期的 grant 對 hash 不可見。
 *
 * ── ⑤ 這一版**沒有**做的三件事(不是忘了) ───────────────────────────────────
 *
 *   · **不可選取 / 不可被指定**(`Avul` 在 WC3 的第三個效果)。targeting 是
 *     `sim/targeting.ts` + 各 system 的查詢,牽動自動攻擊、小怪 AI、投射物,
 *     範圍遠大於 P3,而且會讓「無敵」順便變成「隱身」。列在 openQuestions。
 *   · **驅散 / 淨化**。整個 sim 沒有任何 dispel/purge 原語(grep 過:零個站點)。
 *     加一個 `dispellable` 欄位會是**沒有任何讀者的欄位** —— 正好是 CLAUDE.md
 *     失敗形態 ②(卡片上寫了,遊戲裡不存在)。等 dispel 這根軸真的存在再加。
 *   · ~~**火圈**~~ —— ✅ **已修 (GH#287, 2026-08-09)**。這一段原本寫著
 *     「champion 的火圈燒傷直接寫 `hp.hp -=`⋯修法是一行⋯」,而**那一行一年
 *     沒有被加**,連它引用的行號都漂掉了 —— CLAUDE.md 第三守則的活教材:
 *     一份沒有守衛的修法備忘不會紅,所以它會一直是備忘。
 *     現在火圈(champion / 召喚物 / 小怪三條路)都經過
 *     `combat/environmentalBurn.ts::applyEnvironmentalBurn`,而那個函式問的就是
 *     這個檔的 `refusesDamage(world, id, "true")`。所以 `blocksTrueDamage` 現在
 *     **真的**擋得住火圈。守衛:`systems/FireRingSystem.test.ts` 的
 *     「無敵擋得住火圈 (firering-invuln)」——把那道閘拿掉會紅。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { DamageType } from "./effect";
import type { EffectKindSpec } from "./effectKind";

/**
 * 一個實體身上的免疫狀態:**四根軸,各自一個絕對到期 tick**。
 *
 * `0` = 從來沒被授予過這根軸(tick 從 0 開始,而任何正的 duration 至少換到
 * `tick + 1`,所以 0 永遠讀作「沒有」)。判定一律是 `until > world.tick`,
 * 所以「到期」不需要任何人去清掉條目。
 */
export interface ImmunityGrant {
  /** 物理傷害被拒絕到哪一 tick */
  physicalUntil: number;
  /** 魔法傷害被拒絕到哪一 tick */
  magicUntil: number;
  /** 真實傷害被拒絕到哪一 tick(火圈是這一種 —— 見檔頭 ⑤) */
  trueUntil: number;
  /** 敵方的硬控/減速被拒絕到哪一 tick */
  controlUntil: number;
}

/** 一個空的 grant(四根軸都沒授予)。呼叫端自己填要的那幾根。 */
function emptyGrant(): ImmunityGrant {
  return { physicalUntil: 0, magicUntil: 0, trueUntil: 0, controlUntil: 0 };
}

/** 這個傷害類型對應的軸。 */
function damageAxis(g: ImmunityGrant, type: DamageType): number {
  return type === "physical" ? g.physicalUntil : type === "magic" ? g.magicUntil : g.trueUntil;
}

/**
 * 這一筆**傷害**現在會不會被拒絕。`combatResolveSystem` 對佇列裡的每一個封包問
 * 一次,所以是兩次 Map 查詢 + 一個比較,沒有配置、沒有掃描。
 */
export function refusesDamage(world: SimWorld, id: EntityId, type: DamageType): boolean {
  const g = world.invulnerable.get(id);
  if (g === undefined) return false;
  return damageAxis(g, type) > world.tick;
}

/**
 * 這個實體現在免不免**控制**。免控與免傷是完全分開的兩根軸 —— 一個只帶
 * `blocksControl` 的 grant(07-01 臨、兵、鬥)照樣會流血。
 */
export function refusesControl(world: SimWorld, id: EntityId): boolean {
  const g = world.invulnerable.get(id);
  if (g === undefined) return false;
  return g.controlUntil > world.tick;
}

/**
 * 授予/延長免疫。**逐軸取 max**,所以兩層免疫重疊時每一根軸都在自己該結束的
 * 時候結束(見檔頭 ③)。呼叫端負責算出絕對 tick。
 */
export function grantImmunity(world: SimWorld, target: EntityId, add: ImmunityGrant): void {
  const cur = world.invulnerable.get(target);
  if (cur === undefined) {
    // ⚠️ **COPY**, never store the caller's object. `apply()` computes ONE `add`
    // and walks a whole subject list with it (29-03 有功夫無懦夫「統統進入無敵
    // 狀態」is `applyTo:"target"` over an AoE), so storing it by reference makes
    // every newly-covered body share a single grant record. The next
    // `grantImmunity` on ANY of them then extends ALL of them through the
    // `Math.max` writes below — a bystander who silently never stops being
    // invulnerable. Nothing crashes and no digest disagrees between replicas
    // (they all alias identically), which is exactly why it survived.
    // 守衛:「一次蓋兩個人:之後延長其中一人,旁邊那個人**照樣**準時到期」。
    world.invulnerable.set(target, { ...add });
    return;
  }
  cur.physicalUntil = Math.max(cur.physicalUntil, add.physicalUntil);
  cur.magicUntil = Math.max(cur.magicUntil, add.magicUntil);
  cur.trueUntil = Math.max(cur.trueUntil, add.trueUntil);
  cur.controlUntil = Math.max(cur.controlUntil, add.controlUntil);
}

export const invulnerableEffect: EffectKindSpec<"invulnerable"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const until = world.tick + Math.round(e.durationSec / world.dt);
    const mode = e.blocksDamage ?? "all";
    const add = emptyGrant();
    // 三根傷害軸各自獨立。`blocksTrueDamage` **不是** `mode` 的子句:省略時它跟
    // 著 "all"(WC3 `Avul` 擋所有東西),寫出來時它就是自己那一根軸的答案 ——
    // 所以「擋物理與魔法但火圈照燒」寫成 `blocksDamage:"all",
    // blocksTrueDamage:false`,而「魔法免疫外加免真傷」也表達得出來。沒有任何
    // 一個欄位會被靜默忽略。
    if (mode === "all" || mode === "physical") add.physicalUntil = until;
    if (mode === "all" || mode === "magic") add.magicUntil = until;
    if (e.blocksTrueDamage ?? mode === "all") add.trueUntil = until;
    if (e.blocksControl === true) add.controlUntil = until;

    const subjects = e.applyTo === "target" ? ctx.targets : [ctx.caster];
    for (const target of subjects) {
      // 死人不吃無敵:一個屍體帶著免疫進復活流程,復活之後會莫名其妙無敵。
      const hp = world.health.get(target);
      if (!hp || !hp.alive) continue;
      grantImmunity(world, target, add);
      // ② 「算了但沒送到客戶端」:免疫是一個玩家必須看得見的狀態,所以授予的
      // 那一刻就發事件。持續期間的常駐光暈需要 snapshot 的一個 ENTITY_FLAG
      // bit —— 只剩兩格,六條 lane 在跑,不由 P3 單方面占用(見 openQuestions)。
      world.emit("immunityGranted", {
        target,
        origin: ctx.origin,
        untilTick: until,
        blocksPhysical: add.physicalUntil > world.tick,
        blocksMagic: add.magicUntil > world.tick,
        blocksTrue: add.trueUntil > world.tick,
        blocksControl: add.controlUntil > world.tick,
      });
    }
  },
};
