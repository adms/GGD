/**
 * 淨化規則（`config.dispel@1`，A4b / #278）—— 【淨化】【驅散免疫】那一族的旋鈕。
 *
 * ── 為什麼這些是欄位而不是常數 ─────────────────────────────────────────────
 * 「一發淨化拔掉什麼」是這個引擎裡**最容易被 owner 改**的一組決策：
 *
 *   · 沒標 `dispellable` 的狀態算不算可拔？（14 份 status 文件今天一份都沒標）
 *   · 敵方淨化剝不剝得掉你買的裝備被動？
 *   · 一發拔幾層？拔不完時留下哪幾個？
 *   · 殭屍身上的狀態吃不吃淨化？（第 3 場之後場上大多數敵人就是殭屍）
 *
 * 每一個都是「A 還是 B」而不是「數字大小」，也就是 CLAUDE.md 說的**決策點** ——
 * 寫死等於把它烘進一次部署。
 *
 * ── ⚠️ 三個 `*DefaultDispellable` 是**真的平衡改動**，不是 no-op ────────────
 * 它們決定「作者沒有想過這件事」時的答案。出貨值是刻意不對稱的：
 *
 *   · `status` / `dot` → **true**：減速、纏繞、暈眩、燃燒本來就該被解得掉，
 *     否則【淨化】這張卡在出貨當天什麼都拔不到，而那看起來跟壞掉一模一樣。
 *   · `buffs` → **false**：**沒有人預期自己買的裝備效果可以被敵人剝掉**。
 *     打開它會讓「敵方淨化」變成一個能拆對手裝備的機制 —— 那是一個
 *     設計決定，不是一個預設值。
 */

/** `content/config/dispel.json` 的文件 id。 */
export const DISPEL_DOC_ID = "dispel";

export interface DispelRules {
  /** 止血閥。false = `dispel` 這個 effect kind 整條不作用（但看得見它是關的）。 */
  enabled: boolean;
  /** 沒標 `dispellable` 的 status 算不算可拔。 */
  statusDefaultDispellable: boolean;
  /** 沒標 `dispellable` 的 DoT 算不算可拔。 */
  dotDefaultDispellable: boolean;
  /** 沒標 `dispellable` 的 `ModifierSource`（道具被動/增益卡/靈氣）算不算可拔。 */
  buffDefaultDispellable: boolean;
  /** 一份 dispel 文件沒寫 `pools` 時，預設清哪幾池。 */
  defaultPoolStatus: boolean;
  defaultPoolDot: boolean;
  defaultPoolShields: boolean;
  defaultPoolBuffs: boolean;
  /**
   * 一發淨化最多拔幾層的**全域上限**：文件沒寫 `count` 時用它，
   * 寫了也夾不過它。一句話管到底（照抄 `tauntRules.maxTargetsCap` 的語意），
   * 避免出現「兩個地方各有一個上限，而它們分歧」。
   */
  maxCountCap: number;
  /**
   * `count` 砍不完時**留下哪幾個**。
   *   newest  先拔最晚掛上的（剛被暈到就解得掉 —— 玩家預期的那一種）
   *   oldest  先拔最早掛上的（優先清快過期的殘渣，實際上比較弱）
   */
  defaultOrder: "newest" | "oldest";
  /** 殭屍身上的狀態吃不吃淨化。獨立一格的理由同 `tauntRules.appliesToMobs`。 */
  appliesToMobs: boolean;
}

/**
 * 出貨值。
 *
 * ⚠️ **缺文件 = 這一份，不是空物件**（同 `DEFAULT_BERSERK_RULES` 的規矩）——
 * 一個 undefined 的 `enabled` 會讓淨化整族靜默失效，而畫面上看不出差別。
 */
export const DEFAULT_DISPEL_RULES: DispelRules = Object.freeze({
  enabled: true,
  statusDefaultDispellable: true,
  dotDefaultDispellable: true,
  buffDefaultDispellable: false,
  defaultPoolStatus: true,
  defaultPoolDot: true,
  defaultPoolShields: false,
  defaultPoolBuffs: false,
  maxCountCap: 3,
  defaultOrder: "newest",
  appliesToMobs: true,
});

/** `maxCountCap` 的界，兩端都閉。上界 50 只擋多打一個零。 */
export const DISPEL_MAX_COUNT_BOUNDS: readonly [number, number] = [1, 50];

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * 正規化操作者/文件給的表 —— 三層守衛的**最裡面**一層（同 `normalizeBerserkRules`）：
 * 後台頁擋在前面、Zod 擋在中間，這裡擋的是任何繞過那兩層的來源
 * （手改 overlay.json、舊版主機寫下的文件、測試夾具）。
 */
export function normalizeDispelRules(raw: unknown): DispelRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_DISPEL_RULES;
  const r = raw as Record<string, unknown>;
  const [lo, hi] = DISPEL_MAX_COUNT_BOUNDS;
  const cap =
    typeof r.maxCountCap === "number" && Number.isFinite(r.maxCountCap)
      ? Math.min(hi, Math.max(lo, Math.round(r.maxCountCap)))
      : DEFAULT_DISPEL_RULES.maxCountCap;
  return {
    enabled: bool(r.enabled, DEFAULT_DISPEL_RULES.enabled),
    statusDefaultDispellable: bool(
      r.statusDefaultDispellable,
      DEFAULT_DISPEL_RULES.statusDefaultDispellable,
    ),
    dotDefaultDispellable: bool(r.dotDefaultDispellable, DEFAULT_DISPEL_RULES.dotDefaultDispellable),
    buffDefaultDispellable: bool(
      r.buffDefaultDispellable,
      DEFAULT_DISPEL_RULES.buffDefaultDispellable,
    ),
    defaultPoolStatus: bool(r.defaultPoolStatus, DEFAULT_DISPEL_RULES.defaultPoolStatus),
    defaultPoolDot: bool(r.defaultPoolDot, DEFAULT_DISPEL_RULES.defaultPoolDot),
    defaultPoolShields: bool(r.defaultPoolShields, DEFAULT_DISPEL_RULES.defaultPoolShields),
    defaultPoolBuffs: bool(r.defaultPoolBuffs, DEFAULT_DISPEL_RULES.defaultPoolBuffs),
    maxCountCap: cap,
    defaultOrder: r.defaultOrder === "oldest" ? "oldest" : DEFAULT_DISPEL_RULES.defaultOrder,
    appliesToMobs: bool(r.appliesToMobs, DEFAULT_DISPEL_RULES.appliesToMobs),
  };
}

/** 從 `config.dispel@1` 文件讀出來。缺文件 = 出貨預設。 */
export function dispelRulesFromDoc(doc: unknown): DispelRules {
  const d = doc as { schema?: string } | undefined;
  if (!d || d.schema !== "config.dispel@1") return DEFAULT_DISPEL_RULES;
  return normalizeDispelRules(d);
}
