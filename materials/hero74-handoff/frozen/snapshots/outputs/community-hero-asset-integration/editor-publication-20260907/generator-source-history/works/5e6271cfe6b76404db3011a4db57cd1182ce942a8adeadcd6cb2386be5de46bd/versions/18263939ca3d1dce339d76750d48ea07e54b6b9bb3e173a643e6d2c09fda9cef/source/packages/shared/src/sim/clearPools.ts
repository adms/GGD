/**
 * `clearPools` —— 「把一個實體身上的暫時性東西清掉」這件事的**唯一**一支函式。
 *
 * ── 為什麼它必須存在（A4，#278）─────────────────────────────────────────────
 *
 * 這個引擎裡「清池」這件事今天散在**三個**站點，每一個都自己手寫，
 * 而且**三個都漏掉同一池**：
 *
 * | 站點 | 清 status | 清 shields | 清 dot |
 * |---|---|---|---|
 * | `revive.ts` 復活 | ✅ | ✅ | ❌ |
 * | `MatchController` 決鬥 enterCombat | ✅ | ✅ | ❌ |
 * | `MatchController` 大亂鬥 enterCombat | ✅ | ✅ | ❌ |
 *
 * ⚠️ 那個 ❌ 不是我推論出來的 —— `effects/dotTick.ts` 的檔頭**自己寫著**：
 *
 * > the host's round reset (`MatchController`) clears shields and statuses but
 * > knows nothing about `world.dot`, so leaving them parked is how a burn leaks
 * > into the NEXT round.
 *
 * 也就是：**死前身上的燃燒會跟著復活的身體一起回來**，而血條上看起來就只是
 * 「復活之後莫名其妙一直在掉血」。那正是 GH#100 / #216「戰鬥沒真正結束」那一族。
 *
 * ── 為什麼是一支函式而不是三段各補一行 ─────────────────────────────────────
 * 因為第四個站點正在來的路上：【淨化】（A4b 的 `dispel` kind）、【破盾】（D1）、
 * 【睡眠】（C4，「受傷即提早解除**這一筆**」）與延遲排程的回合清除（D2）
 * 全部都要清池，而它們要清的是**不同的子集**。四個站點各自手寫子集 = 四份
 * 「哪些池、拔幾層、拔哪幾筆」的規則，而它們分歧的那一天沒有人會發現。
 *
 * ── ⛔ 全序，不是插入序 ────────────────────────────────────────────────────
 * `count` 砍不完的時候「留下哪幾筆」必須是**決定性**的。這裡的排序鍵是
 * `(expiresAtTick, 次要鍵)` 的**全序** —— 只比 `expiresAtTick` 不夠：兩筆同一
 * tick 到期時結果會退回陣列/Map 的迭代順序，而那正是 #198 那一族 desync 的形狀。
 *
 * ── purity ────────────────────────────────────────────────────────────────
 * 只讀 `world.tick`，無 rng、無 `Date.now`、無三角函式。Map 迭代**不**發生在
 * 這裡（每一次呼叫只碰一個實體），所以沒有 Map 順序問題。
 */
import type { SimWorld } from "./SimWorld";
import type { EntityId } from "../ids";
import type { StatusEffect } from "./components";
import type { DotInstance } from "./effects/dot";
import { detachSource } from "./stats/statPipeline";

/** 一個實體身上四種「暫時性」的東西。 */
export interface PoolSelection {
  /** `world.status.get(id).effects` —— 減速/纏繞/暈眩/詛咒/暴走… */
  status?: boolean;
  /** `world.health.get(id).shields` —— 護盾池 */
  shields?: boolean;
  /** `world.dot.get(id)` —— 燃燒/中毒/流血。⚠️ 今天唯一沒有任何移除路徑的一池 */
  dot?: boolean;
  /**
   * `attachSource` 掛上去的 `ModifierSource`（道具被動、增益卡、靈氣投影、
   * 限時 buff）。走 `detachSource`，**不可以**自己 splice —— `sc.dirty = true`
   * 一定要跟著，否則屬性面板會停在拔掉之前的數字。
   */
  buffs?: boolean;
}

/** 誰該被拔。 */
export type ClearPolarity = "buff" | "debuff" | "any";

/** `count` 砍不完時先拔哪一邊。 */
export type ClearOrder = "newest" | "oldest";

export interface ClearPoolsOpts {
  pools: PoolSelection;
  /**
   * 只拔這一種極性的。`"any"` = 不分。
   *
   * ⚠️ 極性住在**施加的那一刻**寫下的欄位，不是事後推導的：一個 source 可以
   * 同時帶 `{ms,+0.3}` 與 `{armor,-0.5}`，任何啟發式都會在某一張卡上錯，
   * 而且從編輯器修不掉。
   */
  polarity?: ClearPolarity;
  /**
   * 只拔標了「可被驅散」的那些。
   *
   * ⚠️ **回合重置與復活要傳 `false`** —— 它們是「這一局結束了」，
   * 不是「有人對你放了淨化」。一個標了 `dispellable: false` 的減速仍然不可以
   * 跨過墳墓活下來。
   */
  requireDispellable?: boolean;
  /** 最多拔幾筆（每一池各自計數）。省略 = 不限。 */
  count?: number;
  /** 見 {@link ClearOrder}。省略 = `"newest"`。 */
  order?: ClearOrder;
  /** 判斷「沒標 dispellable 時算不算可拔」的預設，由 `world.dispelRules` 供給。 */
  defaults?: {
    status?: boolean;
    dot?: boolean;
    buffs?: boolean;
  };
}

/** 實際拔掉了幾筆，逐池分開回報（給呼叫端做 UI/事件用）。 */
export interface ClearPoolsResult {
  status: number;
  shields: number;
  dot: number;
  buffs: number;
  get total(): number;
}

function dispellableOf(
  flag: boolean | undefined,
  fallback: boolean | undefined,
): boolean {
  return flag ?? fallback ?? true;
}

function polarityPasses(want: ClearPolarity, got: "buff" | "debuff" | undefined): boolean {
  if (want === "any") return true;
  // 沒標極性的一律**不**被有極性條件的淨化拔掉。理由與 `dispellable` 相同：
  // 「不知道」不可以被當成「是」——一個沒標的道具被動被敵方淨化剝掉，
  // 而作者從來沒有選擇過那件事。
  return got === want;
}

/**
 * 全序比較器 —— `(expiresAtTick, 次要鍵)`。
 *
 * ⛔ 第二關鍵字不是裝飾：兩筆同一 tick 到期時，只比第一關鍵字會讓「拔哪一筆」
 * 退回陣列順序，而那是實作定義的。
 */
function cmpByOrder<T>(
  order: ClearOrder,
  expiresOf: (x: T) => number,
  tieOf: (x: T) => string,
): (a: T, b: T) => number {
  const sign = order === "newest" ? -1 : 1;
  return (a, b) => {
    const d = (expiresOf(a) - expiresOf(b)) * sign;
    if (d !== 0) return d;
    const ta = tieOf(a);
    const tb = tieOf(b);
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  };
}

/**
 * 從一個陣列裡拔掉符合條件的前 `count` 筆，**就地**改寫。
 * 回傳拔掉幾筆。
 */
function pluck<T>(
  arr: T[],
  eligible: (x: T) => boolean,
  cmp: (a: T, b: T) => number,
  count: number | undefined,
): { kept: T[]; removed: number } {
  const cand = arr.filter(eligible);
  if (cand.length === 0) return { kept: arr, removed: 0 };
  // 全部符合且不限量 → 直接清空這一池，省掉排序。
  if (count === undefined && cand.length === arr.length) return { kept: [], removed: arr.length };
  const doomed = new Set<T>([...cand].sort(cmp).slice(0, count ?? cand.length));
  const kept = arr.filter((x) => !doomed.has(x));
  return { kept, removed: arr.length - kept.length };
}

/**
 * 清掉一個實體身上選定的池子。
 *
 * @returns 逐池拔掉的筆數。
 */
export function clearPools(
  world: SimWorld,
  id: EntityId,
  opts: ClearPoolsOpts,
): ClearPoolsResult {
  const polarity = opts.polarity ?? "any";
  const need = opts.requireDispellable ?? false;
  const order = opts.order ?? "newest";
  const out = {
    status: 0,
    shields: 0,
    dot: 0,
    buffs: 0,
    get total(): number {
      return this.status + this.shields + this.dot + this.buffs;
    },
  };

  if (opts.pools.status === true) {
    const st = world.status.get(id);
    if (st && st.effects.length > 0) {
      const r = pluck<StatusEffect>(
        st.effects,
        (e) =>
          (!need || dispellableOf(e.dispellable, opts.defaults?.status)) &&
          polarityPasses(polarity, e.polarity),
        cmpByOrder(
          order,
          (e) => e.expiresAtTick,
          // 次要鍵：`statusId` 再 `sourceId`。兩者都是穩定的字串，
          // 而且**同一份 status 由兩個來源掛上來**是真的會發生的（雙持減速）。
          (e) => `${e.statusId}\0${e.sourceId}`,
        ),
        opts.count,
      );
      st.effects = r.kept;
      out.status = r.removed;
    }
  }

  if (opts.pools.shields === true) {
    const hp = world.health.get(id);
    if (hp && hp.shields.length > 0) {
      const r = pluck(
        hp.shields,
        // 護盾沒有極性也沒有 dispellable 欄位 —— 它就是「一片盾」。
        // 一個 `polarity: "debuff"` 的淨化不該吃掉自己的護盾，所以在
        // debuff-only 的呼叫下這一池整池跳過。
        () => polarity !== "debuff",
        cmpByOrder(
          order,
          (s) => s.expiresAtTick,
          (s) => s.sourceId,
        ),
        opts.count,
      );
      hp.shields = r.kept;
      out.shields = r.removed;
    }
  }

  if (opts.pools.dot === true) {
    const list = world.dot.get(id);
    if (list && list.length > 0) {
      const r = pluck<DotInstance>(
        list,
        (d) =>
          (!need || dispellableOf(d.dispellable, opts.defaults?.dot)) &&
          // DoT 幾乎一定是 debuff，但**不假設** —— 讀它自己那一格，
          // 缺席時當 debuff（那是這個池子裡唯一出現過的東西）。
          polarityPasses(polarity, d.polarity ?? "debuff"),
        cmpByOrder(
          order,
          // DoT 用「還剩幾跳」當到期：`expiresAtTick` 不在它身上。
          (d) => d.expiresAtTick,
          (d) => `${d.origin}\0${String(d.sourceId)}`,
        ),
        opts.count,
      );
      if (r.kept.length === 0) world.dot.delete(id);
      else world.dot.set(id, r.kept);
      out.dot = r.removed;
    }
  }

  if (opts.pools.buffs === true) {
    const sc = world.stats.get(id);
    if (sc) {
      const cand = [...sc.sources.values()].filter(
        (s) =>
          (!need || dispellableOf(s.dispellable, opts.defaults?.buffs)) &&
          polarityPasses(polarity, s.polarity),
      );
      const doomed = [...cand]
        .sort(
          cmpByOrder(
            order,
            // 永久來源（沒有到期）排在最後 —— 「先拔快到期的」與
            // 「先拔剛掛上的」都不該把一件道具的常駐被動當成第一順位。
            (s) => s.expiresAtTick ?? Number.MAX_SAFE_INTEGER,
            (s) => s.id,
          ),
        )
        .slice(0, opts.count ?? cand.length);
      for (const s of doomed) {
        // ⛔ 走 `detachSource`，不要自己 delete —— `sc.dirty = true` 與
        // 授予技能的回收都在那裡面。
        detachSource(world, id, s.id);
        out.buffs++;
      }
    }
  }

  return out;
}

/**
 * 「這一局對這個身體結束了」—— 復活與回合重置共用的那一組。
 *
 * `revive.ts` 直接走它；回合邊界那一族改走 {@link restoreForNextRound}（它把
 * 「滿血滿魔站起來」也包進來，見下面）。所以「復活清什麼」與「開新回合清什麼」
 * 在結構上不可能再分岔。
 *
 * ⚠️ `requireDispellable: false` 是刻意的：這不是淨化，是重置。一個標了
 * 不可驅散的減速也不可以跨過墳墓／回合活下來。
 */
export function clearForFreshBody(world: SimWorld, id: EntityId): ClearPoolsResult {
  return clearPools(world, id, {
    pools: { status: true, shields: true, dot: true },
    polarity: "any",
    requireDispellable: false,
  });
}

/**
 * ⭐ GH#455 —— 「這具身體準備好打下一回合了」：站起來、滿血、滿魔，**而且**
 * 上一回合的池子（狀態／護盾／延燒）已經清乾淨。
 *
 * ── 它為什麼存在 ─────────────────────────────────────────────────────────
 * 這四行以前**逐字散在 `MatchController` 的四條路徑上**（決鬥擺位 / 大亂鬥
 * 擺位 / 練習入場 / 練習自動復活），而那四處**全部**在 `enterCombat` ——
 * 也就是**下一回合開打的那一刻**。於是中場（商店）整段期間，玩家身上帶的是
 * 上一回合打完的殘血，而中場的功能正好就是**看著自己的數字做採買決策**
 * （GH#106 的即時屬性預覽刻意做成「不可以說謊」的東西 —— 它在說謊）。
 *
 * ⛔ **修法不是把那幾行再抄一份到 `enterIntermission`**：那是第五個住處，
 * 下一次有人加一格（充能、某個回合資源）就會漏掉其中一站 —— 而漏掉的那一站
 * 只在某一種擺位路徑上發作，測起來像隨機故障（`placeRoyale` 的註解自己就
 * 為了同一件事寫過警告）。⇒ 一支函式，五個站點全走它。
 *
 * ⚠️ **回滿與清池必須綁在一起**，這是把還原搬早之後才成立的約束：只回滿而
 * 不清池的話，上一回合那份延燒會在中場繼續扣，而且是扣在**剛剛被補滿**的
 * 血條上 —— 比原本的殘血更難看懂。
 *
 * ⚠️ **冪等是承重的**：中場呼叫過之後 `enterCombat` 仍然照呼叫一次，因為
 * `enterIntermission` **是可以被跳過的**（`skipPhase` 作弊與 fault failsafe
 * 都會直接推進到 `enterCombat`；理由與 `resetMarksForRound` 那一段第 3 點
 * 逐字相同）。而且中場期間玩家會買東西 → `maxHp` 變大 → 開打前要再頂一次。
 */
export function restoreForNextRound(world: SimWorld, id: EntityId): ClearPoolsResult {
  const hp = world.health.get(id);
  if (hp) {
    hp.alive = true;
    hp.hp = hp.maxHp;
    hp.mana = hp.maxMana;
  }
  return clearForFreshBody(world, id);
}

/**
 * ⭐ GH#354 / G3 —— 拔掉這個身體上所有**只到這一回合為止**的永久來源
 *（`applyBuff.permanentScope: "round"` → `ModifierSource.roundScoped`）。
 *
 * ⛔ **不是** `clearForFreshBody` 的一部分，而且刻意不合併進去。那一支
 * **復活時也會跑**（`revive.ts`），所以掛進去的話「這一回合」的實際語意會變成
 * 「直到你死一次」—— 一個名字與行為對不上的旋鈕，而且是**看不出來**的那種：
 * 沒死的人身上留著、死過的人身上沒了，兩邊都不會有任何訊息。
 *
 * ⚠️ 呼叫點只有一個，而且**時機是承重的**：host 在 `enterCombat()` 裡、
 * **發射 `roundStart` 之前**逐席位跑一次。順序反過來的話，一條回應
 * 【回合開始】而掛上回合增益的 hook 會在同一幀被這支函式立刻拔掉
 *（失敗形態②：文件、後台、卡片全都對，遊戲裡什麼都沒有）。
 *
 * ⚠️ 掃的是**每一個席位**，⛔ 不是「這一回合被排進對戰的那些」——
 * 輪空的隊伍不進 pairing 迴圈，漏掉他們就等於「輪空 = 回合增益多留一回合」。
 *
 * ── ⭐ 2026-08-18 —— **同型連擊表也在這裡歸零**（owner 的裁決）───────────────
 *
 * > 「純物理殭屍波不存在，場上一定會有其他敵方或特殊殭屍給 AP 傷害打斷，
 * >  **但的確不應該跨回合殘留**」
 *
 * 史萊姆裝的 `typeStreakImmunity` 把「我連續挨了幾發同型」記在
 * `world.damageStreak`，而那張表**沒有到期**（`streakTimeoutSec` 省略 = 永不逾時，
 * 見 `combat/typeStreakImmunity.ts`）。上一回合結束時凍結在門檻上的連擊，
 * 下一回合開打的第一秒就是免疫 —— 而玩家沒有做任何事來換到它。
 *
 * ⛔ **修法刻意不是一個 `streakTimeoutSec` 出貨值**：那是一個平衡數字，
 * 而 owner 明說回合內的打斷本來就會發生。回合邊界是一件**結構**上的事，
 * 它不該由「猜一個比回合長度短的秒數」來實現（回合長度是相位機決定的，
 * 決賽 180 秒而平時 100 秒，火圈提前收場更是常態 —— 猜長了跨回合、
 * 猜短了在回合中途無聲消失）。
 *
 * ⚠️ 位置在 `sc` 的早退**之前**：一具沒有 `StatsComp` 的身體照樣可能有連擊紀錄
 *（`noteDamageStreak` 只在有授予時記帳，但授予會過期而紀錄不會），
 * 而回合結束時那筆紀錄一樣不可以留著。
 */
export function clearRoundScoped(world: SimWorld, id: EntityId): number {
  // ⭐ 回合邊界歸零同型連擊（見上面那一段）。⛔ 不計進回傳值 ——
  // 回傳的語意是「拔掉幾份 roundScoped 來源」，混進另一池會讓呼叫端的帳失真。
  world.damageStreak.delete(id);
  const sc = world.stats.get(id);
  if (!sc) return 0;
  // ⛔ 先收集再拔 —— `detachSource` 會改寫 `sc.sources`，邊走邊拔會跳過元素。
  const doomed: string[] = [];
  for (const s of sc.sources) if (s.roundScoped === true) doomed.push(s.id);
  for (const sid of doomed) detachSource(world, id, sid);
  return doomed.length;
}
