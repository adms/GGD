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
          (e) => `${e.statusId} ${e.sourceId}`,
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
          (d) => `${d.origin} ${String(d.sourceId)}`,
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
 * 三個站點（`revive.ts`、`MatchController` 的兩個 `enterCombat`）**全部**走它，
 * 所以「復活清什麼」與「開新回合清什麼」在結構上不可能再分岔。
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
