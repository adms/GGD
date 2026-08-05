/**
 * 【重創】—— 治療 / 吸血 / 自然回復三格獨立倍率（A6，#278）。
 *
 * owner 逐字：「【減療 / 禁療】=> 用**重創**代替就好，吸血/治療同時減半」，
 * 裁決⑥：「**三格獨立倍率，預設全部 0.5**」（含自然回復 —— 推翻了我的建議）。
 *
 * ── 做在 status 上而不是 Stat 上 ─────────────────────────────────────────
 * 這樣它自動拿到到期、`statusExpirySystem` 的拆除、`enterCombat` 的清空，
 * 而且**天生可以被 A4b 的淨化拔掉**。做成 Stat 的話上面每一項都要另外接一次。
 *
 * ── ⛔ 有三個讀取點，不是一個 ────────────────────────────────────────────
 * 這是裁決帶來的實際差異，也是這一族最容易「做一半而看起來像做完」的地方：
 *
 * | 路徑 | 讀取點 | 誰走這條 |
 * |---|---|---|
 * | 治療     | `combat/restore.ts::healTarget` | heal · restore · 治療花 · 守衛塔 |
 * | 吸血係數 | `combat/damage.ts` 的 `dmg * ls` | 只有普攻吸血 |
 * | 自然回復 | `systems/RegenSystem.ts`         | 英雄每秒回血 |
 *
 * ⛔ **吸血絕對不可以打折兩次。** 吸血最後是一發 `healTarget`，所以
 * `healingTakenMult` 已經會咬到它 —— `lifestealMult` 必須作用在**係數**那一步，
 * 否則帶重創的人吸血是 0.25 倍而不是 0.5 倍。守衛 `grievousWounds.test.ts`
 * 的第四條就是在釘這個。
 *
 * ── 多個來源相乘還是取 max ───────────────────────────────────────────────
 * 引擎自己沒有一致答案（`missChance` 取 max、護盾相加），所以這是 CLAUDE.md
 * 說的**決策點** → 一格欄位，預設 `max`（跟最接近的鄰居一致）。
 *
 * ⚠️ **禁療不是第二個機制** —— 它就是三格都填 0 的一份內容文件
 *（`content/status-effects/no-heal.json`）。
 *
 * ── purity ──────────────────────────────────────────────────────────────
 * 純函式：無 rng、無時鐘、無三角函式。只讀一個實體的 status 陣列。
 */
import type { SimWorld } from "./SimWorld";
import type { EntityId } from "../ids";
import type { StatusEffect } from "./components";

/** 三格倍率各自的取用軸。 */
export type WoundAxis = "healingTakenMult" | "lifestealMult" | "regenMult";

/** 多筆重創怎麼疊。 */
export type WoundStackMode = "max" | "multiply";

/**
 * 這一格的**全域**規則。今天只有一格，但它是一個真的決策點（見檔頭），
 * 所以它住在 `world` 上而不是寫死在下面那個 `reduce` 裡。
 */
export interface WoundRules {
  /**
   * 多筆重創同時在身上時怎麼合成。
   *
   *   max       取**最重**的那一筆（＝最小的倍率）。與 `missChance` 一致。
   *   multiply  相乘。兩層 0.5 → 0.25，也就是疊到第三層幾乎等於禁療。
   */
  stackMode: WoundStackMode;
}

export const DEFAULT_WOUND_RULES: WoundRules = Object.freeze({ stackMode: "max" });

/** `content/config/wounds.json` 的文件 id。 */
export const WOUNDS_DOC_ID = "wounds";

/**
 * 從 `config.wounds@1` 文件讀出來。缺文件 / 認不得的值 = 出貨預設。
 *
 * ⚠️ 三層守衛的**最裡面**一層（同 `normalizeDispelRules`）：後台頁擋在前面、
 * Zod 擋在中間，這裡擋的是任何繞過那兩層的來源（手改 overlay.json、舊版主機
 * 寫下的文件、測試夾具）。
 */
export function woundRulesFromDoc(doc: unknown): WoundRules {
  const d = doc as { schema?: string; stackMode?: unknown } | undefined;
  if (!d || d.schema !== "config.wounds@1") return DEFAULT_WOUND_RULES;
  return { stackMode: d.stackMode === "multiply" ? "multiply" : "max" };
}

/**
 * 一個實體身上這一軸的合成倍率。沒有任何一筆重創時回 `1`（＝不打折）。
 *
 * ⚠️ 回 `1` 而不是 `undefined` 是刻意的：呼叫端一律無腦乘，
 * 少乘一次就是一個「做一半」的讀取點，而那在畫面上看不出來。
 */
export function woundMult(world: SimWorld, id: EntityId, axis: WoundAxis): number {
  const st = world.status.get(id);
  if (!st || st.effects.length === 0) return 1;
  // 快路徑：這支函式在 regen 那條**每 tick 都跑**的路上，而絕大多數身體
  // 身上一筆重創都沒有。`some` 在沒命中時不配置陣列。
  if (!st.effects.some((e) => e[axis] !== undefined)) return 1;

  const mode = world.woundRules.stackMode;
  let out = 1;
  let seen = false;
  for (const e of st.effects) {
    const m = (e as StatusEffect)[axis];
    if (m === undefined) continue;
    if (!seen) {
      out = m;
      seen = true;
    } else if (mode === "multiply") {
      out *= m;
    } else {
      // max = 取最重的那一筆 = 最小的倍率。
      out = Math.min(out, m);
    }
  }
  return out;
}
