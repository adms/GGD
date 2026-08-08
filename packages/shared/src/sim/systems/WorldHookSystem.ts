/**
 * `worldHookSystem` —— 把**已經在事件流裡**的世界時刻，廣播成 hook 事件。
 *
 * ── 這支存在的理由：缺的從來不是「事件」，是「廣播器」 ────────────────────
 *
 * 2026-08-06 逐一對照設計端的 140 個技能標籤時量到的事實：
 * 【死亡時】【復活時】【迴避時】【殭屍王出現】【火圈點燃】【守衛塔倒下】
 * 這六個時刻，**sim 每一場都在發**（`world.emit(...)`，給客戶端畫面用），
 * 而內容側**一個都掛不上去** —— 因為 `fireHooks` 只在七個手寫的呼叫點被叫到，
 * 那七個點全是「某個單位做了某件事」，沒有任何一個讀事件流。
 *
 * 所以這支不是新機制，是**一張對照表 + 一個迴圈**。每多接一個時刻的成本 =
 * 在 `WORLD_HOOKS` 加一列，不是再寫一支系統。
 *
 * ⭐ 這正是「N 個同型項目 = K 個模板 + 一張表」那條規則的形狀（CLAUDE.md
 * 第零守則⑨）。一項一輪的話這是六輪；表格化之後是一輪 + 六列。
 *
 * ── 兩種作用域，差別在「誰的卡片會響」 ──────────────────────────────────
 *
 *  · `"world"` —— 場上**每一位活著、帶 `StatsComp` 的單位**都收到。
 *    用於「這件事發生在世界上」：殭屍王出現、火圈點燃、守衛塔倒下。
 *    hook 沒有 target（同 `onInterval`），所以 `subject:"target"` 的條件葉
 *    一律讀作 false，效果解到持有者自己身上。
 *
 *  · `"actor"` —— 只有事件裡**指名的那一位**收到，`targetKey` 指到的是對手。
 *    用於「這件事發生在某個人身上」：我死了、我被復活、我閃掉了一下。
 *
 * ── ⚠️ 一個明確的決策：world 事件**不發給死人** ──────────────────────────
 *
 * 一張寫「殭屍王出現時獲得 50 金」的卡，持有者正躺在地上時該不該響？
 * 這裡選**不響**，理由是保守的那一邊：躺著的人拿不到場上的好處符合直覺，
 * 而反過來（死人也拿）會讓「趴著等王」變成一個策略。
 * ⚠️ 這是**設計偏好不是技術限制**。owner 若要另一種讀法，正確的做法是把它
 * 變成 `WorldHookRow` 上的一格（或 `HookDef` 上讓作者逐卡決定），
 * 不是在這裡改一行 —— 見 CLAUDE.md 第一守則。
 *
 * `"actor"` 作用域**故意不擋死人**：【死亡時】的持有者依定義就是剛死的那個，
 * 擋掉它等於讓這個事件永遠不發（失敗形態②：做了但沒有人收得到）。
 *
 * ⚠️ 這句話在 2026-08-06 到 08-09 之間**是假的**（CLAUDE.md 第三守則）：這支
 * 系統的迴圈確實沒有過濾死人，但 `fireHooks` 有**它自己**的一道存活閘，把整件
 * 事撤銷回去，於是 `onDeath` 在出貨路徑上一次都沒發出去（#293）。修法不是在
 * `fireHooks` 裡對 `onDeath` 寫一個 if（第〇·五守則點名的形狀），而是讓這張表
 * 說話 —— 見 `WorldHookRow.firesWhenOwnerDead`。
 *
 * ── 純度 ──────────────────────────────────────────────────────────────────
 * 不抽 rng、不看時鐘、沒有三角函式、沒有 `**`。事件流的順序由 emit 順序決定，
 * 而那是同一個 tick 內固定的系統順序；`"world"` 那一支的收件人明確排序。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { HookEvent } from "../stats/modifiers";
import { fireHooks } from "../effects/hooks";

interface WorldHookRow {
  /** `world.emit()` 的事件名。 */
  readonly simEvent: string;
  /** 要發射的 hook 事件。 */
  readonly hook: HookEvent;
  /** `"world"` = 全場活人；`"actor"` = 事件裡指名的那一位。 */
  readonly scope: "world" | "actor";
  /**
   * `scope:"actor"` 時，從 `ev.data` 的哪一格取「持有者」。
   *
   * ⚠️ 這一格要填的是**實體 id**。事件負載裡有一堆長得一模一樣的數字
   * （`seatId` / `teamId` / `zone` / `killerSeatId` / `summonerSeatId`），
   * `idAt` 只認得「正整數」，分不出來 —— 填錯不會爆，只會安靜地把卡片掛到
   * 一個不存在的實體上（#294 就是這樣：`reviveComplete.id` 是**圈圈**）。
   * 加新的一列時，去發射端把那一格的語意讀出來，不要照著欄位名猜。
   */
  readonly actorKey?: string;
  /** 從 `ev.data` 的哪一格取 hook 的 target（對手）。省略 = 沒有對手。 */
  readonly targetKey?: string;
  /**
   * 這一列的持有者**已經死了**的時候，還發不發？省略 = 不發。
   *
   * `fireHooks` 有一道存活閘（死人的被動不該繼續作用），而【死亡時】的持有者
   * **依定義**就是剛死的那個 —— `DeathSystem` 先寫 `hp.alive = false` 才
   * `emit("death")`，所以在這一格出現之前 `onDeath` 一次都沒發出去過（#293）。
   *
   * ⛔ 它是**逐事件**的一格，不是一個「關掉存活閘」的全域開關：死者身上的
   * `onDamageTaken` / `onInterval` / 反彈**仍然**不該響（屍體照樣會被 AoE 掃到，
   * 那些事件真的還在發）。要開一列之前先問「這個時刻的主角是不是本來就該是
   * 死人」—— 只有兩種答案是 true：死亡當下，以及未來某種「陣亡後遺留」。
   */
  readonly firesWhenOwnerDead?: boolean;
}

/**
 * ⛔ 這張表是**結構對照**不是可調參數：「`death` 這個 sim 事件對應到
 * `onDeath` 這個 hook」不是 owner 會想改的東西，改了就是換一個語意。
 * 真正屬於後台的旋鈕是**卡片上**的 `internalCooldown` / `chance` / `condition`，
 * 那些本來就在 `HookDef` 上。
 *
 * 加一個新時刻的完整成本：這裡一列 + `HookEvent` 一個成員 + `zHookEvent` 一個
 * 成員 + `fieldAdoption` 一筆豁免。**不需要動這支系統的程式碼。**
 */
const WORLD_HOOKS: readonly WorldHookRow[] = [
  // ── 場上節點（世界廣播）──────────────────────────────────────────────
  // 殭屍王出現。發射點 `sim/mobs.ts` 的 `mobBossSpawn`。
  { simEvent: "mobBossSpawn", hook: "onBossSpawn", scope: "world" },
  // 火圈點燃 —— 只在 `ticksSinceStart === 0` 那一 tick 發一次，不是每 tick。
  { simEvent: "fireRingStart", hook: "onFireRingIgnite", scope: "world" },
  // 守衛塔倒下。⚠️ 打倒守衛塔**不發 `onKill`**（獎勵由 GuardianSystem 自己付），
  // 所以在這一列之前，內容側完全接不到「塔倒了」。
  { simEvent: "guardianSlain", hook: "onGuardianDown", scope: "world" },

  // ── 個人時刻（發給當事人）────────────────────────────────────────────
  // 死亡時。`data.killer` 可能是 undefined（火圈/DoT 燒死、自然死亡），
  // 那時 hook 沒有 target —— 這是對的，不是缺陷。
  // ⚠️ `firesWhenOwnerDead` 是這一列唯一能發出去的理由，見那個欄位。
  {
    simEvent: "death",
    hook: "onDeath",
    scope: "actor",
    actorKey: "id",
    targetKey: "killer",
    firesWhenOwnerDead: true,
  },
  // 復活時。持有者是被復活的那個人，不是頂著圈圈的隊友。
  // ⚠️ `ownerId` 不是 `id`：走復活圈那條路（`ReviveSystem.completeRevive`，實戰
  // 唯一那條）`id` 是**圈圈的實體**，發完就 destroy；只有 `ownerId` 在兩個發射端
  // （圈圈與 `effects/revive.ts`）都指向英雄本人。#294。
  { simEvent: "reviveComplete", hook: "onRevive", scope: "actor", actorKey: "ownerId" },
  // 迴避時。⚠️ 持有者是**閃掉的那個**（`data.target`），對手是攻擊者
  // （`data.source`）—— 兩個 key 是反的，照抄會把卡片掛到攻擊者身上。
  { simEvent: "evade", hook: "onEvade", scope: "actor", actorKey: "target", targetKey: "source" },
];

const BY_EVENT = new Map<string, WorldHookRow[]>();
for (const row of WORLD_HOOKS) {
  const list = BY_EVENT.get(row.simEvent);
  if (list) list.push(row);
  else BY_EVENT.set(row.simEvent, [row]);
}

/** `ev.data` 的一格取成 EntityId；不是正數就當作沒有。 */
function idAt(data: Record<string, unknown>, key: string | undefined): EntityId | undefined {
  if (key === undefined) return undefined;
  const v = data[key];
  return typeof v === "number" && v > 0 ? (v as EntityId) : undefined;
}

export function worldHookSystem(world: SimWorld): void {
  // 與 `intervalHookSystem` 同一道閘：戰鬥沒開始時整支是 no-op，
  // 所以既有的錄影與測試逐位元不變。
  if (!world.combatActive) return;
  if (world.events.length === 0) return;

  // ⚠️ 收件人只算一次。`world` 作用域的六列如果各自重算，同一 tick 內
  // 一個死掉的人可能對第一列還活著、對第三列已經不在 —— 那種不一致
  // 在 replay 上會表現成「同一場重播結果不同」。
  let audience: EntityId[] | undefined;

  for (const ev of world.events) {
    const rows = BY_EVENT.get(ev.type);
    if (!rows) continue;
    for (const row of rows) {
      if (row.scope === "actor") {
        const owner = idAt(ev.data, row.actorKey);
        if (owner === undefined) continue;
        // 兩個 `undefined` 是 `abilitySlot` 與 `incoming`：事件流上的時刻不從
        // 技能槽來，也沒有「觸發它的那一發傷害封包」。
        fireHooks(
          world,
          owner,
          row.hook,
          idAt(ev.data, row.targetKey),
          undefined,
          undefined,
          row.firesWhenOwnerDead,
        );
        continue;
      }
      if (audience === undefined) {
        // Map 的插入順序不是規則，明確排序（同 intervalHookSystem）。
        audience = [...world.stats.keys()].sort((a, b) => a - b).filter((id) => {
          const hp = world.health.get(id);
          // 沒有生命元件的單位照樣可以帶 hook，所以只擋「有生命而且死了」。
          return hp === undefined || hp.alive;
        });
      }
      for (const id of audience) fireHooks(world, id, row.hook);
    }
  }
}
