/**
 * 【死亡遺留】DEATH WARDS —— 「有人陣亡，就在屍體原地留下一個持久的光環物件」。
 *
 * ⭐ 2026-08-19 —— 這支檔案是 `sim/nightPact.ts` 的**繼承者**，而換名字不是整理：
 * 換掉的是它的**存在方式**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼要拆（CLAUDE.md 第〇·五守則，owner 2026-08-08）
 *
 * > 「所有英雄技能理論上都是 **JSON 技能模板組合**出來的，**沒有例外**」
 * > ⛔ 「看到『為某支技能寫一個 if』就是越線了。」
 *
 * `nightPact.ts` 是這條守則的教科書違規，而且是**最難看見的那一種** ——
 * 它沒有寫 `if (championId === "godie-u00k")`，它把同一件事寫成了一份
 * 叫做 `config.arena-rules@1.nightPact` 的設定區塊，裡面第一格就是
 * `abilityIds: ["godie-u00k.passive"]`。於是：
 *
 *   · 那支天生技的 `passive.ranks[0]` **是空的**（`modifiers: []`）——
 *     castability 普查（`castabilitySweep.test.ts`）因此逐格量出 ❌ FAIL，
 *     而那個 ❌ 說的是實話：**在「技能＝JSON 模板組合」的尺上量起來，它是空的**；
 *   · 半徑 / 上限 / 受益者 / 疊加規則 / 加成內容 **住在競技場規則裡**，
 *     而它們是**這一支技能的**參數，不是這張地圖的參數；
 *   · 想做第二支「陣亡處留下治療光環」的技能，要改**程式**。
 *
 * ⇒ 正解不是讓普查看得見這個檔案（那只是把違規合法化），是把它拆成兩層：
 *
 *   | 層 | 誰負責 | 這裡是什麼 |
 *   |---|---|---|
 *   | **機制** | 程式（這一支） | 「有一種授予叫**死亡遺留光環**」 |
 *   | **技能** | JSON | 71-00 暗夜契約把參數填進 `passive.ranks[0].deathWard` |
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它是**第九個「騎在來源上的授予」**，⛔ 不是第二套機制
 *
 * `stats/sourceGrants.ts` 的檔頭已經把這條路鋪好了：`block` / `critStrike` /
 * `attributes` / `damageTypeOverride` / `flight` / `penetration` /
 * `typeStreakImmunity` / `vision` 八格的共同性質是**引擎完全不看 `kind`** ——
 * 掃的是 `StatsComp.sources`。`deathWard` 是第九格，所以它一次落在**四個
 * 授權面**上，⛔ 不用第二次接線：
 *
 *   · `ability@1.passive.ranks[].deathWard`（天生技 / 被動技 —— 暗夜契約走這條）
 *   · `ability@1.toggle.whileOn.ranks[].deathWard`（切換技開著的期間才留旗）
 *   · `item@1.passive.deathWard`（一件「隊友倒下處生成治療陣」的寶具）
 *   · `applyBuff` 生出來的限時來源（大招期間陣亡才留旗；到期由那份 source 自己收）
 *
 * ⭐ 所以「這個機制解鎖了幾支技能」的答案不是 1：它解鎖的是**一整族** ——
 * 任何「某某死亡後在原地留下一圈東西」的內容，從此是一格 JSON。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 拆掉的另一半：【魔力全失】現在**完全是 JSON**
 *
 * `nightPact.ts` 的 PASS 3（「敵方在死之王附近施法有 12% 機率魔力全失」）
 * 在這支檔案裡**不存在**，而且不是被刪掉 —— 它被寫成了既有機制的組合：
 *
 *   `passive.ranks[0].auras[]`（affects:"enemy" + radius）
 *     └─ `hooks[]`（on:"onAbilityCast" + chance:0.12）
 *          └─ `effects[]`（`spendMana` pctCurrentMana:1 applyTo:"self"）
 *
 * ⭐ 一行新引擎程式都不用寫：`aura/aura.ts` 早就會把 `auras[].hooks` 掛到
 * **圈內的每一個受影響單位**身上（那份檔案的 PASS 1），而 `onAbilityCast`
 * 的持有者依定義就是施法者。「在我附近」＝ 那一圈；「施法時」＝ 那個事件；
 * 「12%」＝ `HookDef.chance`；「魔力全失」＝ 現存法力的 100%。
 *
 * ⚠️ 這正是第〇·五守則要的排序：**先盤點引擎有什麼，再決定要做什麼機制**。
 * 三個 PASS 裡有一個根本不需要新機制，而 2026-07-30 那一版寫了 55 行程式。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 兩個**沒有**被泛化的決策，以及為什麼（誠實的那一半）
 *
 * ① **`beneficiary` / `stacking` 沒有走 `auraSystem`。** 這一段是從
 *    `nightPact.ts` 原封不動繼承的判斷，重測之後仍然成立：
 *      · `auraSystem` 每個**發射體**投一份來源（`auraSourceId(emitter, …)`），
 *        所以 N 面旗必然疊 N 次 —— 「多支重疊只取最大」在那裡**寫不出來**；
 *      · `AuraAffects` 只有 enemy / ally / all，而「只給**帶著這支技能的那個人**」
 *        不是任何一個隊伍謂詞說得出來的話。
 *    ⇒ 兩者都是 owner 會翻的**決策**，所以它們是 grant 上的**欄位**，
 *    而一個共用機構表達不了的欄位就得有自己的 reconcile。
 *    ⛔ 這**不是**「所以只好寫死」：欄位在 JSON 上，程式只有一份，
 *    而且對每一支未來的死亡遺留技能都適用。
 *
 * ② **「誰的死亡算數」寫死成「英雄」。** 原版寫的是 `world.champion.has(victim)`
 *    （owner：「敵我**英雄**死亡」），這裡保持逐位元相同。要泛化成
 *    「小怪也算 / 只有敵人算」的話，正確的形狀是 grant 上再一格 enum，
 *    ⛔ 不是在這裡加一個 if —— 但那需要 owner 決定預設值，所以它是
 *    **一張要拿給他的表**，不是我可以順手挑的東西（第一守則）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECISION —— 逐 tick 從狀態 reconcile，⛔ 永不訂閱
 *
 * {@link deathWardSystem} 每 tick 重算「現在誰該吃到這一圈」並與已掛上的來源
 * 做差集。走出去、死掉、旗子被清掉、回合結束、`world.destroy` 全部是同一種
 * 情況：不在集合裡 → 卸下。這是 `aura.ts` DECISION 2 與 `auraCarrier.ts`
 * DECISION 1 的同一個理由 —— 訂閱模型要為每一種失敗路徑各寫一次拆除，
 * 而漏掉的那一次是一個**永久的 +100% 移速**。
 *
 * ⚠️ 與 `nightPact.ts` 的一個**刻意的**差別：不再有 `world.nightPactRules`
 * 這個「武裝旗標」。機制的開關現在**就是內容**——場上沒有人帶著這個授予，
 * 迴圈第一行就走完了。少一個旗標就少一種「功能做好了但沒有人 arm」的故障
 * （`MatchController.ts` 自己的註解記錄過那一次：radius 都建好了而
 * `nightPactRules` 是 null，整支天生技在真的比賽裡什麼都沒做，
 * 而 `nightPact.test.ts`（現名 `deathWard.test.ts`）全綠）。
 *
 * DETERMINISM。沒有 rng（PASS 3 走 hook 之後，這支檔案**一次都不抽**）、
 * 沒有時鐘、沒有三角函式、沒有 `**`。事件照 emit 順序走，發射體與旗子一律
 * **明確排序**（Map 是插入序，重生的實體會排到最後）。旗子搭 `SimWorld.digest()`
 * 既有的 `transform` 項，所以在不同 tick 立旗的複本會在那個 tick 分岔。
 */
import type { EntityId, TeamId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { ModifierSource, StatModifier } from "./stats/modifiers";
import { attachSource, detachSource } from "./stats/statPipeline";
import { resolveAuraRadius } from "./aura/aura";

/**
 * 出貨的死亡遺留物長什麼樣 —— 71-00 的**暗夜旗**。
 *
 * ⚠️ 它是 `DeathWardGrant.modelKey` 的**預設值**，⛔ 不是一條規則：
 * 一支「陣亡處長出一棵樹」的技能只要在 JSON 裡填自己的 model id。
 */
export const DEFAULT_DEATH_WARD_MODEL_KEY = "prop.night-flag";

/** 這一圈給誰。⛔ 不是隊伍謂詞說得出來的話 —— 見檔頭「沒有被泛化的決策 ①」。 */
export type DeathWardBeneficiary = "owner" | "team";

/** 多個遺留物重疊時怎麼合。真的會改變平衡的決策，所以是欄位。 */
export type DeathWardStacking = "max" | "add";

/**
 * 【死亡遺留】授予本體 —— 一份 `ModifierSource` 上的第九格。
 *
 * 讀它的只有這支檔案，而它走 `StatsComp.sources` 且**不問 `kind`**，
 * 所以同一份 JSON 掛在天生技 rank、道具、增益卡或一份限時 buff 上，
 * 行為完全相同（`stats/sourceGrants.ts` 檔頭那條共同性質）。
 */
export interface DeathWardGrant {
  /** 遺留物光環的**基礎**半徑，套 #136 的 `abilityRange` 係數之前 */
  radius: number;
  /** 同一區同時最多幾個遺留物 */
  maxPerZone: number;
  beneficiary: DeathWardBeneficiary;
  stacking: DeathWardStacking;
  /** 遺留物在線上發佈的 `EntityState.key`；缺席 = {@link DEFAULT_DEATH_WARD_MODEL_KEY} */
  modelKey?: string;
  /**
   * 圈內受益者吃到的加成。
   *
   * ⚠️ 它**不是** rank 區塊自己的 `modifiers`：那一份是「持有者常駐」，
   * 這一份是「站進圈裡才有」。兩者同時存在是合法的，而且是兩件事。
   */
  modifiers: readonly StatModifier[];
}

/** 一個站著的遺留物。鍵是**遺留物自己**的 entity id。 */
export interface DeathWardComp {
  /** 它站在哪一區 —— 遺留物永遠不跨區 */
  zone: number;
  /** 立起它的那位持有者的隊伍（呈現用；⛔ 遺留物自己沒有 TeamComp） */
  teamId: TeamId;
  /** 誰的死立起了它（呈現 + 測試） */
  victim: EntityId;
  /**
   * 立起它的那一份 `ModifierSource.id`（例：`abilityPassive:godie-u00k.passive`）。
   * 這是 reconcile 的**鍵**：兩支不同的死亡遺留技能各自結算自己的圈。
   */
  sourceId: string;
  /** 立起它的當下那一份授予的快照 —— 半徑/加成不會因為持有者事後換裝而變 */
  grant: DeathWardGrant;
}

/** 這個來源投影出去的那一份加成的 id。一份**來源**一個，⛔ 不是一面旗一個。 */
export function deathWardSourceId(sourceId: string): string {
  return `deathWard:${sourceId}`;
}

/** 這個實體身上所有的死亡遺留授予，來源 id 升冪。 */
function grantsOn(world: SimWorld, id: EntityId): { sourceId: string; grant: DeathWardGrant }[] {
  const sc = world.stats.get(id);
  if (!sc) return [];
  const out: { sourceId: string; grant: DeathWardGrant }[] = [];
  for (const s of sc.sources) {
    if (s.deathWard) out.push({ sourceId: s.id, grant: s.deathWard });
  }
  return out.sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
}

/**
 * 活著、帶著至少一份死亡遺留授予的英雄，id 升冪。
 *
 * ⚠️ 只走 `world.champion`（不是整張 `world.stats`），與 `nightPact.ts` 相同：
 * 這是每 tick 的迴圈，而 N ≤ 12。要讓召喚物也能帶，正確的做法是把這一行
 * 換成 `world.stats` 並量一次成本，⛔ 不是在別處補第二支掃描器。
 */
function wardCarriers(world: SimWorld): EntityId[] {
  const out: EntityId[] = [];
  for (const id of world.champion.keys()) {
    if (!world.health.get(id)?.alive) continue;
    if (grantsOn(world, id).length > 0) out.push(id);
  }
  return out.sort((a, b) => a - b);
}

/** 這一區裡、由這一份來源立起來的遺留物有幾個。 */
function wardsInZone(world: SimWorld, zone: number, sourceId: string): number {
  let n = 0;
  for (const w of world.deathWard.values()) if (w.zone === zone && w.sourceId === sourceId) n++;
  return n;
}

/** 平面距離平方 —— 沒有 `Math.sqrt`、沒有三角函式（純度閘）。 */
function distSq(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

/**
 * 立起一個遺留物。⛔ 不匯出：一個沒有人要求的遺留物依定義就是洩漏，
 * 而唯一的呼叫點是下面那條死亡通道。
 */
function spawnDeathWard(
  world: SimWorld,
  args: {
    zone: number;
    pos: { x: number; z: number };
    teamId: TeamId;
    victim: EntityId;
    sourceId: string;
    grant: DeathWardGrant;
  },
): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: args.pos.x, z: args.pos.z },
    vel: { x: 0, z: 0 },
    // 固定朝向：沒有人讀它，而抄一份屍體的旋轉只會讓 `digest()` 多帶一個
    // 不含資訊的數字。
    facing: { x: 0, z: 1 },
    // 半徑 0 —— 旗子不是身體。`MovementSystem` 的柔性分離直接走
    // `world.transform`，真的半徑會把每一個 id 更大的實體推開。同 auraCarrier。
    radius: 0,
    zone: args.zone,
  });
  // ⛔ 刻意沒有 TeamComp 也沒有 Health，和掉在地上的金幣一樣：隊伍會污染
  // `teamAliveInZone` 與決鬥結算，血量會讓它可以被打、還會把 hp 灌進
  // `SimWorld.digest`。持有者的隊伍改成純資料留在標記上。
  world.deathWard.set(id, {
    zone: args.zone,
    teamId: args.teamId,
    victim: args.victim,
    sourceId: args.sourceId,
    grant: args.grant,
  });
  world.emit("deathWardSpawn", {
    id,
    zone: args.zone,
    teamId: args.teamId,
    victim: args.victim,
    x: args.pos.x,
    z: args.pos.z,
  });
  return id;
}

/** 場上每一個遺留物的 id，升冪。測試 + HUD。 */
export function deathWardIds(world: SimWorld): EntityId[] {
  return [...world.deathWard.keys()].sort((a, b) => a - b);
}

/**
 * PASS 1 —— 這一 tick 有英雄陣亡，而同一區站著一位帶授予的持有者：立旗。
 *
 * ⚠️ **持有者那道閘就是機制本身。** 拿掉它，每一場的每一次英雄陣亡都會立旗
 * —— 那正是守衛的突變對象。
 */
function raiseWardsForDeaths(world: SimWorld): void {
  const carriers = wardCarriers(world);
  if (carriers.length === 0) return;
  // 快照：spawnDeathWard 會 emit，而 `world.events` 就是我們正在走的那個陣列。
  const events = [...world.events];
  for (const ev of events) {
    if (ev.type !== "death") continue;
    const victim = ev.data.id as EntityId;
    // 敵我**英雄** —— 小怪、守衛塔與花不立旗（見檔頭「沒有被泛化的決策 ②」）。
    if (!world.champion.has(victim)) continue;
    const t = world.transform.get(victim);
    if (!t) continue;
    if (world.settledZones.has(t.zone)) continue; // #216: 這一區的戰鬥已經結束
    // 「有該技能英雄在場上的時候」讀作「活著、而且在**這一區**」——
    // 在別的決鬥裡打的持有者不能在他不在的戰場上立旗。
    for (const carrier of carriers) {
      if (world.transform.get(carrier)?.zone !== t.zone) continue;
      const team = world.team.get(carrier);
      if (!team) continue;
      for (const { sourceId, grant } of grantsOn(world, carrier)) {
        if (wardsInZone(world, t.zone, sourceId) >= grant.maxPerZone) continue;
        spawnDeathWard(world, {
          zone: t.zone,
          pos: t.pos,
          teamId: team.teamId,
          victim,
          sourceId,
          grant,
        });
      }
      // 同一區有兩位持有者時只有 id 最小的那位立旗 —— 與 `nightPact.ts` 的
      // `carriers().find(...)` 逐位元相同（一次死亡 = 一面旗，不是兩面）。
      break;
    }
  }
}

/** 這一份來源的遺留物現在蓋住 `id` 幾個（已套 #136 的範圍係數）。 */
function wardsCovering(world: SimWorld, id: EntityId, sourceId: string): number {
  const t = world.transform.get(id);
  if (!t) return 0;
  let n = 0;
  for (const [wid, w] of world.deathWard) {
    if (w.sourceId !== sourceId) continue;
    if (w.zone !== t.zone) continue;
    const wt = world.transform.get(wid);
    if (!wt) continue;
    const r = resolveAuraRadius(world, w.grant.radius);
    if (distSq(wt.pos, t.pos) <= r * r) n++;
  }
  return n;
}

/** `id` 是不是和某位**活著的**持有者同隊、同區。 */
function teamHasLivingCarrier(world: SimWorld, id: EntityId, sourceId: string): boolean {
  const mine = world.team.get(id);
  const t = world.transform.get(id);
  if (!mine || !t) return false;
  for (const c of wardCarriers(world)) {
    if (!grantsOn(world, c).some((g) => g.sourceId === sourceId)) continue;
    const ct = world.team.get(c);
    const cf = world.transform.get(c);
    if (ct?.teamId === mine.teamId && cf?.zone === t.zone) return true;
  }
  return false;
}

/** 投影出去的那一份加成。`stacks` 就是 `recomputeStats` 會乘上去的層數。 */
function wardAuraSource(sourceId: string, grant: DeathWardGrant, stacks: number): ModifierSource {
  return {
    id: deathWardSourceId(sourceId),
    // `"passive"` 而不是 `"buff"`：它沒有 `expiresAtTick`，所以
    // `buffExpirySystem` 絕對不可以擁有它 —— 下面的 reconcile 是唯一能卸下它
    // 的東西。也不是 `"aura"`：`aura.ts` DECISION 5 在收集發射體時會跳過那個
    // kind，而那個 kind 保留給它自己擁有的來源。
    kind: "passive",
    stacks,
    modifiers: [...grant.modifiers],
  };
}

/**
 * PASS 2 —— 把每一位英雄身上的「遺留光環」對齊到它**現在**該有的樣子。
 *
 * 讀的是最終想要的層數再與已掛上的做差集，所以進圈 / 出圈 / 旗子被清 /
 * 死亡 / 回合結束全部收斂成同一條路。
 */
function reconcileWardAuras(world: SimWorld): void {
  // 場上現在有哪幾份來源立過旗 —— reconcile 的定義域。
  const active = new Map<string, DeathWardGrant>();
  for (const w of world.deathWard.values()) if (!active.has(w.sourceId)) active.set(w.sourceId, w.grant);

  for (const id of [...world.champion.keys()].sort((a, b) => a - b)) {
    const sc = world.stats.get(id);
    if (!sc) continue;
    // 已經掛在身上的每一份遺留光環（可能來自已經不存在的旗，那就要卸下）。
    const attached = new Set(
      sc.sources.filter((s) => s.id.startsWith("deathWard:")).map((s) => s.id),
    );
    const alive = world.health.get(id)?.alive === true;

    for (const [sourceId, grant] of [...active].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const wantId = deathWardSourceId(sourceId);
      attached.delete(wantId);
      let want = 0;
      if (alive) {
        // 受益者 —— `owner` = 只有帶著這份授予的那個單位；`team` = 他整隊。
        const eligible =
          grant.beneficiary === "owner"
            ? grantsOn(world, id).some((g) => g.sourceId === sourceId)
            : teamHasLivingCarrier(world, id, sourceId);
        if (eligible) {
          const covered = wardsCovering(world, id, sourceId);
          // 疊加規則 —— `max` 把任意數量的重疊收成一劑；`add` 是字面上的加總。
          want = grant.stacking === "max" ? Math.min(1, covered) : covered;
        }
      }
      const existing = sc.sources.find((s) => s.id === wantId);
      if (want <= 0) {
        if (existing) detachSource(world, id, wantId);
        continue;
      }
      if (existing) {
        if (existing.stacks !== want) {
          existing.stacks = want;
          sc.dirty = true;
        }
        continue;
      }
      attachSource(world, id, wardAuraSource(sourceId, grant, want));
    }
    // 剩下的是「旗全部沒了但來源還掛著」——一定要卸，否則就是永久加成。
    for (const stale of [...attached].sort()) detachSource(world, id, stale);
  }
}

/**
 * 對齊這一 tick 的死亡遺留。跑在 `deathSystem` / `reviveSystem` 之後，
 * 所以它看得到**這一 tick**的死亡（與 reviveSystem 同一條理由）。
 *
 * 它掛上的加成由**下一 tick** 的 `statRecomputeSystem` 折進去 —— 那是
 * `aura.ts` DECISION 4 記錄的、每一個對晚期事件反應的光環都有的同一格延遲。
 * 均勻、決定性、在複本上一致。
 */
export function deathWardSystem(world: SimWorld): void {
  if (world.combatActive) raiseWardsForDeaths(world);
  // ⚠️ reconcile **不受 `combatActive` 保護**，而那是刻意的：戰鬥結束的那一格
  // 必須把已經發出去的加成收回來。旗子由 `endCombatDeathWards` 清掉之後，
  // 這裡的差集自然把來源卸下 —— 少了它，回合之間會殘留一份永久的加成。
  reconcileWardAuras(world);
}

/**
 * 戰鬥開始：清掉任何殘留。冪等，形狀與 `beginCombatCoins` / `beginCombatRevives`
 * 一致。⚠️ 這裡**沒有東西要武裝** —— 機制的開關就是內容（見檔頭 DECISION）。
 */
export function beginCombatDeathWards(world: SimWorld): void {
  endCombatDeathWards(world);
}

/**
 * 戰鬥結束 ——「回合結束則一起被清除」。每一個遺留物被銷毀、每一份投影出去的
 * 加成被剝掉，所以什麼都活不到結算、商店或下一回合。冪等。
 *
 * ⚠️ **兩半都是承重的。** 只銷毀遺留物的話，加成會多留一 tick；
 * 而 `world.destroy` 之後若剛好沒有人再跑 reconcile（例如 host 直接進商店），
 * 那就是一份**永久的**加成被帶進下一回合。
 */
export function endCombatDeathWards(world: SimWorld): void {
  for (const id of [...world.deathWard.keys()].sort((a, b) => a - b)) world.destroy(id);
  for (const id of [...world.stats.keys()].sort((a, b) => a - b)) {
    const sc = world.stats.get(id);
    if (!sc) continue;
    for (const s of sc.sources.filter((x) => x.id.startsWith("deathWard:")).map((x) => x.id).sort()) {
      detachSource(world, id, s);
    }
  }
}
