/**
 * battlefieldIntel — 全場戰況：每個人（含敵方）的 等級 · 生命 · 攻速 · AP · AD · 裝備。
 *
 * owner 2026-07-30 (GH#220)：
 * > 「在商店要能看到所有人**包括敵方**的等級 生命 攻速/AP/AD 裝備
 * >   作為**制定反打參考 增加策略性**」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. 為什麼每一個數字都必須走 `computeStatBlock`，不能自己算
 * ═══════════════════════════════════════════════════════════════════════════
 * 這一份面板存在的唯一理由是「**制定反打參考**」。一個拿來做決策的數字如果是
 * base（未乘 combat-env、未加基礎加成、未套上限），玩家會照著它去買反制裝，然後
 * 在戰鬥裡發現對方的攻速是他看到的兩倍。**顯示 base 比不顯示更糟** —— 不顯示只是
 * 少一個資訊，顯示錯的是主動誤導（#125 的原話）。
 *
 * 所以這裡一行自己的數學都沒有：`intelStatsOf` 把 seat 丟進
 * `statContextFromSeat` → `computeStatBlock`，也就是**商店自己那一頁
 * (`MerchantShop.GoodsTab` → `StatPanel`) 用的同一支函式**。那支函式會 spawn 一個
 * scratch `SimWorld` 跑真的 `recomputeStats`，所以 env 倍率、基礎加成、屬性上限、
 * 三圍、道具、增幅、傳說強化全部都在裡面（見 statPreview.ts 檔頭）。
 *
 * 「同一來源，不是兩份」是任務明寫的守衛條件：
 * `battlefieldIntel.test.ts` 用**渲染出來的字串**比對「我看敵方 S 的那一列」與
 * 「S 自己商店面板上的那一列」，不是比兩支函式的回傳值 —— 回傳值一樣而畫面印別的
 * 東西正是第⑤種故障。
 *
 * ⚠️ 生命那一格特別處理：`StatPanel.shown()` 在 `authMaxHp > 0` 時會**釘住**伺服器
 * 權威值而不是重建值。這裡必須套同一條規則，否則同一個英雄的血量會在兩個面板上
 * 印出兩個數字。`SeatView.maxHp`（任何座位）與 `HudState.localMaxHp`（自己那一個）
 * 在 net/RoomStore 裡是**同一行程式**算出來的（`Math.round(es.maxHp)`），所以「我看
 * 到的敵方血量」與「他自己看到的血量」是同一個整數，不是兩個近似值。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 2. 敵方那幾列為什麼是「上一回合結束的封存」而不是即時
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 指定的，理由也是他的：即時會變成雙方在商店互相偷看、互改買的**無限迴圈**
 * —— 我看到你買了護甲就改買穿甲，你看到我改買穿甲就改買生命，中場 25 秒全部花在
 * 互相 react 而不是做決策。
 *
 * 實作上**不靠捕捉單一次 phase 邊緣**（那會變成「哪一次 render 贏」的競態）：
 * {@link roundIntelLedger} 在 combat 期間持續把每個座位寫進 `live` 緩衝，離開
 * combat 時把 `live` 整份搬進 `sealed`。讀取端**永遠只讀 `sealed`**，所以
 *   · 中場看到的是上一場結束的樣子；
 *   · 陣亡玩家在 combat 中開商店（shopGate 允許）看到的也是**上一回合**的封存，
 *     不是這一回合的即時 —— 一條規則，沒有第二種情況要記。
 *
 * 第一回合沒有任何封存：面板印「—」與「尚無上回合資料」，**不退回即時值**。
 * 退回即時就是把洩漏偷偷放回來，而且會是最難發現的那一種（只在第一回合以外的
 * 某些狀況發生）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 3. 後台可調（第一守則）
 * ═══════════════════════════════════════════════════════════════════════════
 * 「敵方情報要不要開」「敵方資料是封存還是即時」「裝備要不要露」——這三個都是
 * owner 之後極可能想改的**玩法**旋鈕，不是實作細節。特別是 `enemyFreshness`：
 * owner 給了 `sealed` 的理由，但「互相偷看」在 3 人小房間裡也可能反而是樂趣。
 * 依 CLAUDE.md 的規矩，**拿不定主意就兩種模式都做、後台可切，預設值選 owner
 * 明說的那個** —— 所以 `sealed` 是預設，`live` 是可切的第二種模式。
 *
 * 讀取seam 抄 `displayFinal` 已經驗證過的形狀：`parseBattlefieldIntelJson` 純函式
 * ＋ 一個 ambient 單例（`setBattlefieldIntelConfigJson` / `getBattlefieldIntelConfig`）。
 *
 * ⚠️ **誠實揭露：目前線上沒有人餵這個 JSON。** 這一份工作流的領域只有
 * `apps/client/src/ui/**`，而一個真正的後台欄位要同時落在
 *   1. `content/config/battlefield-intel.json`
 *   2. `packages/shared/src/content/schema/config.ts`（Zod + DEFAULT_）＋ `MatchState`
 *      上一個 `battlefieldIntelJson` 欄位（Colyseus `defineTypes` 是 APPEND-ONLY）
 *   3. `apps/admin/src/*.ts`（SHIPPED_ ＋ 欄位 union ＋ 標籤 ＋ 分組 ＋ configFromForm）
 * 三個地方，全都在領域外。所以這裡把**接線點縮到一行**（`setBattlefieldIntelConfigJson`
 * 接上未來的 wire 欄位即可），並把這三處落地列成待辦，而不是假裝已經可調。
 * 在那之前面板跑的是 {@link SHIPPED_BATTLEFIELD_INTEL}，也就是 owner 明說的那組。
 */
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import type { BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import type { StatCapTable } from "@ggd/shared/sim/statCaps";
import { INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { computeStatBlock, statContextFromSeat } from "./statPreview";

// ---------------------------------------------------------------------------
// §3 config
// ---------------------------------------------------------------------------

/** 敵方資料時效。`sealed` = 上一回合結束的封存（owner 指定）；`live` = 即時。 */
export type EnemyFreshness = "sealed" | "live";

export interface BattlefieldIntelConfig {
  /** 面板總開關。關掉 = 商店不長出「戰況」分頁。 */
  readonly enabled: boolean;
  /** 是否顯示敵方列。關掉只剩自己隊伍 —— 面板還在，策略性沒了。 */
  readonly showEnemies: boolean;
  /** 見 §2。預設 `sealed`。 */
  readonly enemyFreshness: EnemyFreshness;
  /** 敵方的 6 格裝備要不要露。數值露、裝備不露是合法的中間態。 */
  readonly showEnemyItems: boolean;
  /** 哪幾欄要印。全部關掉等於只剩名字＋隊色，所以至少留一欄才有意義。 */
  readonly showLevel: boolean;
  readonly showHealth: boolean;
  readonly showAttackSpeed: boolean;
  readonly showAbilityPower: boolean;
  readonly showAttackDamage: boolean;
}

/**
 * 出貨值 = owner 2026-07-30 明說的那一組：所有人、含敵方、含裝備、敵方封存。
 * 這一份物件是 `content/config/battlefield-intel.json` 未來要對齊的那一份
 * （drift 測試會比對，見檔頭 §3）。
 */
export const SHIPPED_BATTLEFIELD_INTEL: BattlefieldIntelConfig = {
  enabled: true,
  showEnemies: true,
  enemyFreshness: "sealed",
  showEnemyItems: true,
  showLevel: true,
  showHealth: true,
  showAttackSpeed: true,
  showAbilityPower: true,
  showAttackDamage: true,
};

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * 解析後台 JSON。**任何壞掉的欄位一律退回出貨值，不退回 false** —— 一個打錯字的
 * key 讓整個面板消失，會被讀成「這個功能沒做」而不是「設定錯了」。
 */
export function parseBattlefieldIntelJson(json: string | null | undefined): BattlefieldIntelConfig {
  if (!json) return SHIPPED_BATTLEFIELD_INTEL;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return SHIPPED_BATTLEFIELD_INTEL;
  }
  if (typeof raw !== "object" || raw === null) return SHIPPED_BATTLEFIELD_INTEL;
  const o = raw as Record<string, unknown>;
  const freshness = o.enemyFreshness;
  return {
    enabled: asBool(o.enabled, SHIPPED_BATTLEFIELD_INTEL.enabled),
    showEnemies: asBool(o.showEnemies, SHIPPED_BATTLEFIELD_INTEL.showEnemies),
    enemyFreshness:
      freshness === "live" || freshness === "sealed"
        ? freshness
        : SHIPPED_BATTLEFIELD_INTEL.enemyFreshness,
    showEnemyItems: asBool(o.showEnemyItems, SHIPPED_BATTLEFIELD_INTEL.showEnemyItems),
    showLevel: asBool(o.showLevel, SHIPPED_BATTLEFIELD_INTEL.showLevel),
    showHealth: asBool(o.showHealth, SHIPPED_BATTLEFIELD_INTEL.showHealth),
    showAttackSpeed: asBool(o.showAttackSpeed, SHIPPED_BATTLEFIELD_INTEL.showAttackSpeed),
    showAbilityPower: asBool(o.showAbilityPower, SHIPPED_BATTLEFIELD_INTEL.showAbilityPower),
    showAttackDamage: asBool(o.showAttackDamage, SHIPPED_BATTLEFIELD_INTEL.showAttackDamage),
  };
}

let currentConfig: BattlefieldIntelConfig = SHIPPED_BATTLEFIELD_INTEL;
let currentJson = "";

/** 面板現在跑的那一組設定。 */
export function getBattlefieldIntelConfig(): BattlefieldIntelConfig {
  return currentConfig;
}

/** 裝上一份後台 JSON（冪等）。未來 wire 欄位接進來就是呼叫這一支。 */
export function setBattlefieldIntelConfigJson(json: string | null | undefined): void {
  const j = json ?? "";
  if (j === currentJson) return;
  currentJson = j;
  currentConfig = parseBattlefieldIntelJson(j);
}

/** 測試隔離用：回到出貨值。 */
export function resetBattlefieldIntelConfig(): void {
  currentConfig = SHIPPED_BATTLEFIELD_INTEL;
  currentJson = "";
}

// ---------------------------------------------------------------------------
// §2 封存
// ---------------------------------------------------------------------------

/**
 * 一個座位被封存下來的樣子 —— **只留 `computeStatBlock` 讀得到的欄位**，其餘
 * （hp / mana / gold / cooldowns…）刻意不留：留下來就會有人拿去畫即時血條，那正是
 * §2 要擋掉的洩漏，而且會長得像一個很合理的功能。
 */
export interface IntelSeatSource {
  readonly seatId: number;
  readonly teamId: number;
  readonly displayName: string;
  readonly championId: string;
  readonly level: number;
  readonly abilityRanks: readonly number[];
  readonly exAbilityId: string;
  readonly exRank: number;
  readonly items: readonly string[];
  readonly augments: readonly string[];
  readonly statCapstonePct: number;
  readonly attrBonus?: readonly number[];
  /**
   * 伺服器權威的 maxHp（`SeatView.maxHp`）。0 = 那個瞬間沒有實體，讀取端就退回
   * 重建值。見檔頭 §1 的「生命那一格特別處理」。
   */
  readonly authMaxHp: number;
}

/** SeatView 裡這份面板真正會讀到的那些欄位。 */
export interface IntelSeatLike {
  seatId: number;
  teamId: number;
  displayName: string;
  championId: string;
  level: number;
  abilityRanks: readonly number[];
  exAbilityId: string;
  exRank: number;
  items: readonly string[];
  augments: readonly string[];
  statCapstonePct: number;
  attrBonus?: readonly number[];
  maxHp: number;
}

/** 把一個 SeatView 凍成 {@link IntelSeatSource}（陣列一律複製，不共用參考）。 */
export function intelSourceOf(seat: IntelSeatLike): IntelSeatSource {
  return {
    seatId: seat.seatId,
    teamId: seat.teamId,
    displayName: seat.displayName,
    championId: seat.championId,
    level: seat.level,
    abilityRanks: [...seat.abilityRanks],
    exAbilityId: seat.exAbilityId,
    exRank: seat.exRank,
    items: [...seat.items],
    augments: [...seat.augments],
    statCapstonePct: seat.statCapstonePct,
    attrBonus: seat.attrBonus ? [...seat.attrBonus] : undefined,
    authMaxHp: seat.maxHp,
  };
}

/**
 * 「上一回合結束時大家長什麼樣子」的帳。
 *
 * 兩個緩衝：`live` 在 combat 期間被覆寫，`sealed` 只在離開 combat 時被 `live` 填。
 * 讀取端只看得到 `sealed`（沒有讀 `live` 的公開方法，這是刻意的 —— 見 §2）。
 * 換一場（matchId 變）整份丟掉：忘記清空的後果是「上一場的敵方裝備跟進下一場」，
 * 而那是一個看起來完全合理的畫面。
 */
class RoundIntelLedger {
  private matchId = "";
  private live = new Map<number, IntelSeatSource>();
  private liveRound = 0;
  private sealed = new Map<number, IntelSeatSource>();
  private sealedRound = 0;
  /**
   * ── 為什麼這個帳需要是可訂閱的 ─────────────────────────────────────────
   * 封存是在一個 `useEffect` 裡發生的（離開 combat 時），而商店面板是在**同一次
   * commit 的 render 階段**讀這份帳的。effect 一定跑在 render 之後，所以如果這裡
   * 只是一個普通物件，phase 翻到 intermission 的那一次 render 會讀到「還沒封存」，
   * 而且**不會有第二次 render 來修正它** —— 面板會停在「尚無上回合資料」直到玩家
   * 剛好碰到別的狀態變化。這是典型的第②種故障：算出來了但沒送到畫面。
   *
   * 所以帳自己帶一個 version + 訂閱者，`useSyncExternalStore` 讀它。
   * **只有 `seal` / 換場會 bump** —— `observeCombat` 每個 snapshot 都在跑，bump 它
   * 等於戰鬥中每 tick 重算六個 scratch world。
   */
  private version = 0;
  private readonly listeners = new Set<() => void>();

  private bump(): void {
    this.version += 1;
    for (const fn of [...this.listeners]) fn();
  }

  /** `useSyncExternalStore` 的訂閱端。 */
  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** `useSyncExternalStore` 的快照端：封存換過幾次。 */
  readonly getVersion = (): number => this.version;

  private ensureMatch(matchId: string): void {
    if (this.matchId === matchId) return;
    this.matchId = matchId;
    this.live.clear();
    this.sealed.clear();
    this.liveRound = 0;
    this.sealedRound = 0;
    this.bump();
  }

  /** combat 期間的每一次 seats 更新都餵進來（覆寫，所以餵幾次都一樣）。 */
  observeCombat(matchId: string, round: number, seats: readonly IntelSeatLike[]): void {
    this.ensureMatch(matchId);
    if (!Number.isFinite(round) || round <= 0) return;
    // 換回合時先把上一回合殘留的 live 丟掉：seal 沒被呼叫到（例如整場只跑一個
    // phase 事件）也不該讓兩個回合的資料混在同一份緩衝裡。
    if (round !== this.liveRound) {
      this.live.clear();
      this.liveRound = round;
    }
    for (const s of seats) {
      if (!s.championId) continue;
      this.live.set(s.seatId, intelSourceOf(s));
    }
  }

  /**
   * 離開 combat：把 `live` 整份搬進 `sealed`。
   * **冪等** —— 搬完 `live` 就空了，第二次呼叫是 no-op，所以 React 重新 render、
   * phase 抖動、同一個 resolution 走兩次都不會把封存換成別的東西。
   */
  seal(matchId: string): void {
    this.ensureMatch(matchId);
    if (this.live.size === 0) return;
    this.sealed = new Map(this.live);
    this.sealedRound = this.liveRound;
    this.live.clear();
    this.bump();
  }

  /** 封存裡的某一個座位；沒有就是 null（第一回合、剛重連）。 */
  sealedSourceOf(seatId: number): IntelSeatSource | null {
    return this.sealed.get(seatId) ?? null;
  }

  /** 封存的是第幾回合結束的樣子；0 = 還沒有任何封存。面板要印它。 */
  sealedRoundNumber(): number {
    return this.sealedRound;
  }

  /** 測試用。 */
  clear(): void {
    this.matchId = "";
    this.live.clear();
    this.sealed.clear();
    this.liveRound = 0;
    this.sealedRound = 0;
    this.bump();
  }
}

/** 這台機器這一場的那一份帳（單例，理由同 teamLedger）。 */
export const roundIntelLedger = new RoundIntelLedger();

/** 戰鬥中的相位名（與 shopGate / RoomStore 用的是同一個字串）。 */
export const COMBAT_PHASE = "combat";

/**
 * 一幀的記錄決定：**戰鬥中就記，不在戰鬥中就封存**。
 *
 * 抽成純函式而不是留在 hook 裡，是因為 hook 的 effect 在 node 測試環境跑不到
 * （client 的 vitest 是 `node` env，`renderToStaticMarkup` 不跑 effect）。留在
 * hook 裡等於這條規則永遠沒有守衛 —— 而它壞掉的樣子是「敵方那幾列永遠是空的」，
 * 一個看起來像「這個功能還沒做」的失敗。
 */
export function recordIntelFrame(input: {
  matchId: string;
  phase: string;
  round: number;
  seats: readonly IntelSeatLike[];
}): void {
  if (input.phase === COMBAT_PHASE) {
    roundIntelLedger.observeCombat(input.matchId, input.round, input.seats);
    return;
  }
  roundIntelLedger.seal(input.matchId);
}

// ---------------------------------------------------------------------------
// §1 數值
// ---------------------------------------------------------------------------

/** 面板要印的四個數字，全部是 post-multiplier 的最終值。 */
export interface IntelStats {
  readonly maxHealth: number;
  readonly attackSpeed: number;
  readonly abilityPower: number;
  readonly attackDamage: number;
}

/**
 * 一個座位的最終數值。**唯一的計算處**（檔頭 §1）—— 任何一邊自己再算一次就是 bug。
 * 回傳 null = 那個英雄不在 registry（未選英雄、未白名單），面板就印「—」而不是
 * 印一個錯的。
 */
export function intelStatsOf(
  src: IntelSeatSource,
  env?: CombatEnvMultipliers,
  baseBonus?: BaseBonusTable,
  statCaps?: StatCapTable,
): IntelStats | null {
  const block = computeStatBlock(
    statContextFromSeat(
      {
        championId: src.championId,
        level: src.level,
        abilityRanks: src.abilityRanks,
        exAbilityId: src.exAbilityId,
        exRank: src.exRank,
        items: src.items,
        augments: src.augments,
        statCapstonePct: src.statCapstonePct,
        attrBonus: src.attrBonus,
      },
      env,
      baseBonus,
      statCaps,
    ),
  );
  if (!block) return null;
  return {
    // 釘住伺服器權威值，跟 StatPanel.shown() 同一條規則（檔頭 §1 的 ⚠️）。
    maxHealth: src.authMaxHp > 0 ? src.authMaxHp : block[Stat.MaxHealth],
    attackSpeed: block[Stat.AttackSpeed],
    abilityPower: block[Stat.AbilityPower],
    attackDamage: block[Stat.AttackDamage],
  };
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

export interface IntelRow {
  readonly seatId: number;
  readonly teamId: number;
  readonly name: string;
  readonly championId: string;
  /** 同隊（含自己） */
  readonly ally: boolean;
  /** 就是自己那一列 */
  readonly self: boolean;
  /** 這一列的資料是封存的（敵方 + sealed 模式） */
  readonly stale: boolean;
  /**
   * 這一列有沒有資料。false = 敵方在 sealed 模式下還沒有任何封存（第一回合），
   * 面板必須印「—」而不是 0，也**不會**偷偷退回即時值。
   */
  readonly known: boolean;
  readonly level: number;
  /** null = 英雄不在 registry，或 `known === false`。 */
  readonly stats: IntelStats | null;
  /** 永遠 6 格（"" = 空格）。`known === false` 或設定關掉時全空。 */
  readonly items: readonly string[];
}

const EMPTY_SLOTS: readonly string[] = Array.from({ length: INVENTORY_SLOTS }, () => "");

/** 補滿／截斷成 6 格，這樣面板的格子數是常數，不會因為 wire 少一格就縮排。 */
function sixSlots(items: readonly string[]): string[] {
  return Array.from({ length: INVENTORY_SLOTS }, (_, i) => items[i] ?? "");
}

export interface IntelRowsInput {
  readonly seats: readonly IntelSeatLike[];
  readonly localSeatId: number | null;
  readonly config: BattlefieldIntelConfig;
  readonly env?: CombatEnvMultipliers;
  readonly baseBonus?: BaseBonusTable;
  readonly statCaps?: StatCapTable;
  /**
   * 封存查詢。注入而不是直接讀單例，這樣這支函式是純的、可以在 node 測試裡餵任意
   * 封存狀態（第一回合、部分封存、換場後）。正式路徑餵
   * `(id) => roundIntelLedger.sealedSourceOf(id)`。
   */
  readonly sealedOf?: (seatId: number) => IntelSeatSource | null;
}

/**
 * 全場每一列。排序：**自己 → 同隊 → 敵方**（隊內照 seatId 升冪，敵隊照 teamId
 * 升冪）。自己在最上面，因為玩家要拿自己去比對面 —— 一個要捲動才找得到自己的
 * 對照表不是對照表。
 */
export function buildIntelRows(input: IntelRowsInput): IntelRow[] {
  const { seats, localSeatId, config } = input;
  const local = localSeatId === null ? null : (seats.find((s) => s.seatId === localSeatId) ?? null);
  const localTeam = local?.teamId ?? null;

  const rows: IntelRow[] = [];
  for (const seat of seats) {
    if (!seat.championId) continue; // 還沒選英雄的空座位不是一列
    const ally = localTeam !== null && seat.teamId === localTeam;
    if (!ally && !config.showEnemies) continue;

    // 同隊（含自己）永遠即時 —— 你買了什麼自己當然知道，凍住反而是 bug。
    // 敵方依 `enemyFreshness`：`sealed` 讀封存，`live` 讀即時。
    const useSealed = !ally && config.enemyFreshness === "sealed";
    const src = useSealed ? (input.sealedOf?.(seat.seatId) ?? null) : intelSourceOf(seat);
    const known = src !== null;
    const stats = src ? intelStatsOf(src, input.env, input.baseBonus, input.statCaps) : null;
    const showItems = ally || config.showEnemyItems;

    rows.push({
      seatId: seat.seatId,
      teamId: seat.teamId,
      name: seat.displayName || seat.championId || `Seat ${seat.seatId}`,
      // 英雄圖示／名字用**即時**的 championId：換英雄不會發生在一場裡，而封存缺席
      // 時（第一回合）還是要畫得出那一列的頭像，否則整列變成一團「—」。
      championId: seat.championId,
      ally,
      self: local !== null && seat.seatId === local.seatId,
      stale: useSealed && known,
      known,
      level: src?.level ?? 0,
      stats,
      items: src && showItems ? sixSlots(src.items) : [...EMPTY_SLOTS],
    });
  }

  rows.sort((a, b) => {
    if (a.self !== b.self) return a.self ? -1 : 1;
    if (a.ally !== b.ally) return a.ally ? -1 : 1;
    if (a.teamId !== b.teamId) return a.teamId - b.teamId;
    return a.seatId - b.seatId;
  });
  return rows;
}

/**
 * 面板頂上那一行揭露文字。**封存的範圍必須看得見** —— 玩家不知道自己在看第幾回合
 * 的資料，就會把它當成即時的，而那正是這個設計要避免的誤導。
 */
export function intelFreshnessNote(config: BattlefieldIntelConfig, sealedRound: number): string {
  // 後台把敵方關掉了：講「敵方資料：…」會讓玩家去找一組根本不存在的列。
  if (!config.showEnemies) return "僅顯示我方（敵方情報已由後台關閉）";
  if (config.enemyFreshness === "live") return "敵方資料：即時";
  if (sealedRound > 0) return `敵方資料：第 ${sealedRound} 回合結束時的快照`;
  return "敵方資料：尚無上回合資料";
}
