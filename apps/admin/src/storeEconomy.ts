/**
 * 商店經濟 — the pure logic behind 後台 → 商店經濟 (`config/store.json`).
 *
 * owner, 2026-07-30:「所有英雄藍水晶都是統一價，新上架預設也是一樣價格」，
 * 12 位免費英雄改成一個**免費名單**欄位，「他隨時可以清空變成完全統一」。
 *
 * ⚠️ 這一頁存在的理由不是「多一個表單」，是**這份文件以前根本沒有後台入口**。
 * 一個沒有入口的欄位不叫可調 —— 改英雄解鎖價要改 `content/config/store.json`
 * 然後 rebuild + 重啟容器，而 client 和 Go 兩邊還各自寫死一份 300。
 *
 * ⚠️⚠️ **有入口也還不叫可調（#241）。** 這一頁的第一版把值存進覆蓋層，而平台
 * 讀的是出貨樹 —— 存了、回 200、重整還看得到自己填的數字，**玩家那邊完全沒變**。
 * 現在 `apps/platform/internal/wallet/economy.go` 會在每一次請求去讀覆蓋層的
 * `config/store`，端到端的守衛是 `wallet/economy_api_test.go` 的
 * `TestOperatorPriceEditReachesGetWallet`：後台存一個價格 →`GET /wallet` 必須
 * 回那個價格，不重啟、不重整。**改這一頁的存檔路徑時，請確認那條測試還是綠的。**
 *
 * ⚠️ 生效範圍不是整份文件：`championUnlockCost` 與 `freeChampionIds` 是即時的，
 * `mcoinRewards` **不是**（結算發 M幣 走 `internal/gamelink`，它拿的是開機時的
 * catalog 副本）。頁面上的文案必須照這個講，不要說「整份文件即時生效」。
 *
 * ⚠️ 存檔一定寫**整份文件**（`storeDocFor` 一定要收 `mcoinRewards`）。只寫
 * `championUnlockCost` + `freeChampionIds` 的話，覆蓋層裡就會出現一份沒有
 * `mcoinRewards` 的 store 文件 —— Zod 是 `.strict()` 且該欄位必填，所以那份
 * 覆蓋層要嘛驗不過、要嘛（若驗證被繞過）讓吃雞的 1 枚 M幣 靜靜消失。
 * 這是 屬性上限 那一頁同一條教訓的第二個受害者。
 */

/** The `config` collection doc the console writes through the durable overlay. */
export const STORE_COLLECTION = "config";
export const STORE_DOC_ID = "store";
export const STORE_SCHEMA = "config.store@1";

/**
 * Bounds MIRROR `zConfigStoreDoc` in
 * packages/shared/src/content/schema/config.ts. A console that offers a value
 * the schema refuses is worse than no client validation at all.
 *
 * The UPPER bound is the one people forget. 300 typed as 3000 is a plausible
 * slip and it silently turns「一個晚上解鎖一隻」into「四個晚上」; 1,000,000 is
 * the hard schema ceiling, and the page additionally WARNS (does not block)
 * above SANE_UNLOCK_COST because past that point nobody can afford anything.
 */
export const MIN_UNLOCK_COST = 0;
export const MAX_UNLOCK_COST = 1_000_000;

/**
 * Above this the page shows a warning, not an error. It is the crystal a new
 * account is seeded with (GGD_NEW_ACCOUNT_CRYSTALS, 1000 on the real binary):
 * price a champion above the welcome grant and a brand-new player cannot unlock
 * ANYTHING until they have played several matches — which, with an empty free
 * list, means they cannot play at all.
 */
export const SANE_UNLOCK_COST = 1000;

/**
 * 隨機選角（🎲）在**擁有權讀不到**的時候該怎麼辦。
 *
 * owner 2026-08-02:「隨機選角的時候，只能隨機到自己有解鎖的角色」。這是決策不是
 * 數值，所以它是一個下拉選單而不是程式裡的一個 `if`。它**只**在一種狀態下起
 * 作用：玩家有登入 session，但 `GET /wallet` / `/store/catalog` 讀不到（平台故障、
 * 逾時，或選角剛開場那段還在載入）。已經讀到擁有權、以及根本沒登入（本機開發）
 * 的兩種情況都不受這一欄影響 —— 前者一律只抽已解鎖的，後者沒有帳號可言。
 */
export type RandomPickOwnership = "block" | "whitelist";

/** The fields this page owns, plus the reward table it must preserve. */
export interface StoreEconomy {
  championUnlockCost: number;
  freeChampionIds: string[];
  /** 見 {@link RandomPickOwnership} */
  randomPickOwnership: RandomPickOwnership;
  mcoinRewards: McoinRewards;
}

/** 下拉選單的兩個選項 —— 說明寫「它影響什麼」，不是複述欄位名。 */
export const RANDOM_PICK_OWNERSHIP_OPTIONS: readonly {
  value: RandomPickOwnership;
  label: string;
  help: string;
}[] = [
  {
    value: "block",
    label: "不隨機（保護玩家的擁有權）",
    help:
      "平台讀不到玩家錢包時，🎲 這一次不抽，並在選角畫面說明原因。" +
      "代價：平台故障期間登入中的玩家按 🎲 沒有東西可抽（手動點選英雄不受影響）。" +
      "好處：絕不會抽出一隻玩家還沒用藍水晶解鎖的英雄 —— 那個當下伺服器那道擁有權" +
      "檢查同樣拿不到名單，所以那一抽會真的打進場。",
  },
  {
    value: "whitelist",
    label: "照抽全部開放英雄（舊行為）",
    help:
      "平台讀不到錢包時，🎲 照樣從所有已開放的英雄裡抽。按鈕永遠能按，" +
      "代價是平台故障期間可能抽到玩家沒解鎖的英雄。",
  },
];

export interface McoinRewards {
  placement1: number;
  placement2: number;
  placement3: number;
  placement4: number;
}

/** What ships in content/config/store.json — the page's "出貨值" column. */
export const SHIPPED_UNLOCK_COST = 300;
export const SHIPPED_FREE_CHAMPION_IDS: readonly string[] = [
  "godie-e002",
  "godie-emfr",
  "godie-etyr",
  "godie-h00l",
  "godie-h01n",
  "godie-hart",
  "godie-hjai",
  "godie-n00b",
  "godie-ofar",
  "godie-ogrh",
  "godie-u00n",
  "godie-udre",
];
/** 出貨值 —— owner 明說的那個（`content/config/store.json`）。 */
export const SHIPPED_RANDOM_PICK_OWNERSHIP: RandomPickOwnership = "block";

const DEFAULT_REWARDS: McoinRewards = { placement1: 1, placement2: 0, placement3: 0, placement4: 0 };

function intOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

/**
 * Pull the economy out of whatever the API returned (overlay doc, shipped doc,
 * or nothing). A WRONG SCHEMA yields null rather than being read anyway — an
 * operator who mis-saved some other config doc here would otherwise see its
 * fields rendered as a champion price.
 */
export function extractStore(doc: unknown): StoreEconomy | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;
  if (d.schema !== STORE_SCHEMA) return null;
  const rewardsRaw = (d.mcoinRewards ?? {}) as Record<string, unknown>;
  return {
    championUnlockCost: intOr(d.championUnlockCost, SHIPPED_UNLOCK_COST),
    freeChampionIds: Array.isArray(d.freeChampionIds)
      ? d.freeChampionIds.filter((x): x is string => typeof x === "string")
      : [],
    // 缺欄位（2026-08-02 之前存的舊 overlay）⇒ 出貨預設，與 client 的
    // `randomPickOwnershipMode` 及 Zod 的 DEFAULT_RANDOM_PICK_OWNERSHIP 同一個值。
    randomPickOwnership:
      d.randomPickOwnership === "whitelist" || d.randomPickOwnership === "block"
        ? d.randomPickOwnership
        : SHIPPED_RANDOM_PICK_OWNERSHIP,
    mcoinRewards: {
      placement1: intOr(rewardsRaw.placement1, DEFAULT_REWARDS.placement1),
      placement2: intOr(rewardsRaw.placement2, DEFAULT_REWARDS.placement2),
      placement3: intOr(rewardsRaw.placement3, DEFAULT_REWARDS.placement3),
      placement4: intOr(rewardsRaw.placement4, DEFAULT_REWARDS.placement4),
    },
  };
}

export type CostResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Validate the flat unlock cost: a whole number inside the SCHEMA's bounds.
 *
 * Both ends are checked. `validateField` elsewhere in this console only checked
 * `min` until 2026-07-29, which is how 50 typed as 500 got past the form and
 * was rejected (or silently clamped) somewhere downstream instead.
 */
export function parseUnlockCost(raw: string): CostResult {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "請輸入解鎖價" };
  if (!/^\d+$/.test(text)) return { ok: false, error: "解鎖價必須是不含小數的正整數（0 = 全部免費）" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, error: "解鎖價不是有效數字" };
  if (value < MIN_UNLOCK_COST) return { ok: false, error: `解鎖價不可小於 ${MIN_UNLOCK_COST}` };
  if (value > MAX_UNLOCK_COST) {
    return { ok: false, error: `解鎖價不可超過 ${MAX_UNLOCK_COST.toLocaleString()}（schema 上限）` };
  }
  return { ok: true, value };
}

export interface FreeListParse {
  /** deduped + sorted ids, ready to save */
  ids: string[];
  /** ids that are NOT on the operator's champion whitelist — almost always typos */
  unknown: string[];
  /** ids typed more than once (harmless, but reported so the box can be tidied) */
  duplicates: string[];
}

/**
 * Parse the free-list textarea. Accepts newline / comma / whitespace separated
 * ids, because an operator pasting from a doc will produce all three.
 *
 * `known` is the champion id set the deploy actually offers (the curation
 * whitelist). An id outside it is reported as UNKNOWN but NOT dropped: the
 * operator may be pre-seeding a champion he is about to whitelist, and silently
 * deleting his input is worse than telling him. What must never happen is the
 * typo being invisible — a mistyped id frees nobody while the champion it meant
 * to name quietly costs full price, and nothing downstream notices.
 */
export function parseFreeChampionIds(raw: string, known: ReadonlySet<string>): FreeListParse {
  const tokens = raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t !== "");
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) duplicates.push(t);
    else seen.add(t);
  }
  const ids = [...seen].sort();
  const unknown = known.size === 0 ? [] : ids.filter((id) => !known.has(id));
  return { ids, unknown, duplicates: [...new Set(duplicates)].sort() };
}

/** Render a free list back into the textarea (one id per line, sorted). */
export function freeListText(ids: readonly string[]): string {
  return [...ids].sort().join("\n");
}

/**
 * The doc body to PUT. ALWAYS the full document, including `mcoinRewards`.
 *
 * See the module header: `mcoinRewards` is required and `.strict()`, so a
 * partial write is either rejected or (worse) drops the 吃雞 M幣 reward. The
 * page therefore has to carry the rewards it read, even though it does not
 * edit them.
 */
export function storeDocFor(economy: StoreEconomy): Record<string, unknown> {
  return {
    id: STORE_DOC_ID,
    schema: STORE_SCHEMA,
    championUnlockCost: economy.championUnlockCost,
    freeChampionIds: [...economy.freeChampionIds].sort(),
    randomPickOwnership: economy.randomPickOwnership,
    mcoinRewards: { ...economy.mcoinRewards },
  };
}

/** Human summary for the page header. */
export function economySummary(economy: StoreEconomy, rosterSize: number | null): string {
  const free = economy.freeChampionIds.length;
  const cost = economy.championUnlockCost;
  const priced = rosterSize === null ? null : Math.max(0, rosterSize - free);
  const costPart = cost === 0 ? "所有英雄免費（統一價 0）" : `統一價 ${cost} 藍水晶`;
  const freePart = free === 0 ? "沒有任何免費英雄" : `${free} 位免費`;
  const pricedPart = priced === null ? "" : ` · ${priced} 位要付費`;
  return `${costPart} · ${freePart}${pricedPart}`;
}
