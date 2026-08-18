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
   *
   * ⭐ 出貨 **50**＝實務上「全部」（owner 2026-08-18），後台可調到 **60**
   * （上界，見下面 DISPEL_MAX_COUNT_BOUNDS）。⚠️ 它**不是**效能上限 ——
   * 見下面 DISPEL_MAX_COUNT_BOUNDS 的長註解。要做一發「只解一層」的
   * 弱淨化，是在**那一份文件**寫 `count: 1`，⛔ 不是把這個全域上限調低。
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
  maxCountCap: 50,
  defaultOrder: "newest",
  appliesToMobs: true,
});

/**
 * `maxCountCap` 的界，兩端都閉。
 *
 * ⭐ 2026-08-18 —— 出貨值從 **3 → 50**（owner 定案：「一律統一到 50 我覺得是可以的」），
 * 而**上界另外抬到 60**（同一則的追加：「上限改成 60, 後台可調」，GH#360）。
 *
 * ⚠️ 出貨值（50）與上界（60）是**兩件事**，刻意留了 10 的空間：出貨值住在
 * `content/config/dispel.json`（線上真正生效的那一份住在後台「淨化規則」那一頁的
 * 耐久覆蓋層），上界住在這裡與 `schema/config.ts` 的 Zod —— 上界的用途是
 * **讓後台調得動**，⛔ 不是「建議值」。抬上界不改變任何一場比賽，
 * 真的改變平衡的是那一頁存下去的那個數字。
 *
 * ⇒ 【淨化】的字面意思就是「全部」（owner：「理論上淨化就是解掉所有負面狀態阿，
 * 這是所有遊戲的 common sense」），而在 3 的時候有**七份**文件寫著 `count: 50`、
 * 卡面印著「解除全部負面狀態」，引擎卻逐位元只會拔 3 筆
 * （第一·五守則：卡片上「說了但不會發生」的字）。⚠️ 那七份包含三張與這一批
 * 無關的聖杯願望 —— 也就是說這個靜默夾取存在很久了，而**沒有任何東西叫過一聲**。
 *
 * ⚠️ **50 不是效能上限，這一點最容易被誤讀**（owner 自己也先誤讀過一次，
 * 而那個誤讀是合理的）：一個單位**身上能帶幾個狀態**是**沒有任何上限**的 ——
 * `sim/effects/applyStatus.ts` 那一行就是 `st.effects.push(...)`，全 repo 找不到
 * 任何長度檢查。這一格管的只有「**一發淨化能拔幾個**」。
 * ⇒ 想限制「一個單位最多帶幾個狀態」是**另一個今天不存在的機制**。
 *
 * ⛔ **50 也不是「26 種可淨化減益 + 安全邊際」那種算法**：
 * `applyStatus.ts` 的合併鍵是 **status id + origin** —— 同一種減速由不同來源掛上來
 * 是**兩筆**。一波 30 隻殭屍各給一次減速就是 30 筆，所以**筆數沒有「種類數」那個
 * 上限**。50 的意思是：單挑與小規模團戰（1–5 筆）根本碰不到，只有殭屍海那種極端
 * 情況才摸得到，而那時候「一發拔 50 個」也已經是壓倒性的了。
 *
 * ⭐ 上界 60 同時保住了它原本那個角色：**防手滑**（5 打成 50 擋不住 —— 那還在界內，
 * 但 50 打成 500 擋得住，而那才是會讓一個平衡值靜靜爆表的那種手滑）。
 * 中途曾經提議過 1000，owner 否決 —— 留下這一段是因為「為什麼不是 1000」
 * 與「為什麼不是 3」一樣值得下一個人讀到。
 *
 * ⚠️ 這個上界有**三個住處**（`DISPEL_MAX_COUNT_BOUNDS` · `zConfigDispelDoc.maxCountCap`
 * 的 Zod `.max` · `dispel.count` 的 Zod `.max`），後台那一格的上界是**從 Zod 走出來**的
 * （`apps/admin/src/configForms.ts::readSchema` 讀 `node.max`），所以它自動跟著第二個住處
 * 走 —— ⛔ 不要在標籤表補一個手寫的 `max`，那會變成第四個住處。
 * 三者分歧的守衛：`dispelRules.test.ts`。
 */
export const DISPEL_MAX_COUNT_BOUNDS: readonly [number, number] = [1, 60];

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
