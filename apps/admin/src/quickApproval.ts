/**
 * Quick Approval (task #242) — pure logic behind the 一鍵送出 page.
 *
 * WHY THIS PAGE EXISTS. In one night three separate things stopped dead on
 * "only the owner can decide this": two champions sat in the version-controlled
 * roster (internal/curation/starter.go) but not in the live operator whitelist,
 * a champion was enabled with only one of its five ability slots, and a static
 * route's exposure needed a ruling. The owner asked for those collected onto
 * one page with checkboxes and one submit.
 *
 * THE RULE THAT KEEPS IT HONEST: this module OWNS NO STATE AND KNOWS NO ANSWERS.
 * Every row is DERIVED at view time from live server reads —
 *
 *   starter bundle   GET /api/v1/curation/whitelist/starter   (version-controlled INTENT)
 *   whitelist doc    GET /api/v1/curation/whitelist           (live OPERATOR state)
 *   pending queue    GET /admin/accounts/pending              (real people waiting)
 *   champion docs    /content/champions/<id>.json             (the numbers, for the 體檢)
 *   /editor/ probe   HEAD /editor/                            (a runtime signal)
 *
 * — so nothing here can go stale. Add a hero to starter.go and the row appears
 * on its own; enable it and the row disappears. There is deliberately NOT a
 * single hard-coded champion id, HP number or "today the delta is {x,y}"
 * constant anywhere in this file: baking today's answer in is exactly how a
 * decision page decays into a worse version of a shell script, and the local
 * dev whitelist is not the family host's whitelist anyway.
 *
 * TWO THINGS THIS MODULE REFUSES TO DO:
 *
 *   1. It never produces a `disable` list on the approval path. The live
 *      whitelist holds entries that are in NO starter list (extra items, an
 *      extra champion); a PUT-replace or a draft-diff would delete every one of
 *      them in one click. Approval is UNION-ONLY — see planBulkRequests, whose
 *      `disable` is a frozen empty array, and its test.
 *   2. It never pre-ticks a row. A page that arrives pre-selected is a rubber
 *      stamp, which is strictly worse than the status quo where the owner at
 *      least has to think about each name.
 */
import {
  championStatBase,
  championStatGrowth,
  type AttributeCarrier,
  type ChampionAttributes,
} from "@ggd/shared/sim/stats/attributes";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import type { BulkRequest } from "./curation";

// ---------------------------------------------------------------- slots ----

/**
 * The five ability documents a complete champion ships (the task #11
 * convention, mirrored from starterAbilitySlots in
 * apps/platform/internal/curation/starter.go).
 *
 * All five are listed rather than just `ex` even though `.ex` is the ONLY slot
 * the sim actually gates today (apps/game-server/src/curation/whitelist.ts:
 * `return this.bypass || this.abilities.has(id)`). Enabling a champion without
 * its abilities is what produces a half-enabled champion, and the gate moving
 * to Q/W/E/R later must not silently turn every approval made here into a
 * broken hero.
 */
export const ABILITY_SLOTS: readonly string[] = ["q", "w", "e", "r", "ex"] as const;

/** The five `<id>.<slot>` ability ids belonging to one champion. */
export function abilityIdsFor(championId: string): string[] {
  return ABILITY_SLOTS.map((slot) => `${championId}.${slot}`);
}

/** Which of a champion's five ability ids are NOT enabled in the live doc. */
export function missingAbilitySlots(
  championId: string,
  enabledAbilities: ReadonlySet<string>,
): string[] {
  return abilityIdsFor(championId).filter((id) => !enabledAbilities.has(id));
}

// --------------------------------------------------------------- delta -----

export interface RosterDelta {
  /** declared in starter.go but NOT enabled live — the approval queue */
  waiting: string[];
  /** enabled live but never declared — a warning, never an approval */
  undeclared: string[];
}

/**
 * The two-way roster delta. Both directions matter and they mean OPPOSITE
 * things: `waiting` is "the owner has not said yes yet", `undeclared` is "this
 * is already live and nobody reviewed it". Sorted so the page order is stable
 * between renders.
 */
export function rosterDelta(
  declared: readonly string[],
  live: readonly string[],
): RosterDelta {
  const declaredSet = new Set(declared);
  const liveSet = new Set(live);
  return {
    waiting: [...declaredSet].filter((id) => !liveSet.has(id)).sort(),
    undeclared: [...liveSet].filter((id) => !declaredSet.has(id)).sort(),
  };
}

export interface HalfEnabled {
  id: string;
  missing: string[];
}

/**
 * Enabled champions whose five ability slots are not all enabled. Computable
 * from the whitelist document ALONE, which is why it is checked rather than
 * assumed: a champion can be turned on from any of three doors, and only one of
 * them unions the abilities in with it.
 */
export function halfEnabledChampions(
  champions: readonly string[],
  abilities: readonly string[],
): HalfEnabled[] {
  const enabled = new Set(abilities);
  const out: HalfEnabled[] = [];
  for (const id of [...champions].sort()) {
    const missing = missingAbilitySlots(id, enabled);
    if (missing.length > 0) out.push({ id, missing });
  }
  return out;
}

// ------------------------------------------------------- the 數值體檢 ------

/**
 * The champion stats this module compares — EFFECTIVE level-1 values, not the
 * raw card.
 *
 * WHY THAT DISTINCTION IS THE WHOLE POINT (the #248 regression). Before #248 a
 * champion doc's `baseStats.maxHealth` WAS its level-1 health, so reading the
 * field raw was correct. #248 rebased `baseStats` onto the source map's raw
 * w3x card and moved the 三圍 term into the sim, so today 100 of the 114 docs
 * literally read `"maxHealth": 150` and the real number is
 * `150 + strToMaxHealth × STR`. Reading the field raw collapsed this page:
 *
 *   - the peer median HP fell 480 → 150 and armour 7.5 → 0, so
 *     `cand.maxHealth < median × 0.5` became `150 < 75` — unfireable, and the
 *     armour finding (guarded by `median > 0`) became dead code
 *   - 喪標麥可's real 「護甲 0 — 完全不減傷」 finding silently stopped firing
 *   - 克勞薩先生 printed 「血量 -450 … −300%」 off his raw card
 *
 * …and every test still passed, because the suite fed synthetic fixtures and
 * never one real champion doc. So the numbers below now come through the SIM'S
 * OWN SEAM (`championStatBase`), the same one `recomputeStats`, the shop
 * preview and the champ-select 屬性 tab use. What the owner approves on is what
 * the game computes.
 *
 * UNITS: content units at level 1 — the layer BEFORE the combat-env ×factors
 * (血量 ×4 …), exactly like the codex and champ-select sheets. Candidate and
 * peer median are both on that scale, so the comparison is apples to apples.
 */
export interface ChampionStats {
  id: string;
  name: string;
  role: string;
  maxHealth?: number;
  growthHealth?: number;
  armor?: number;
  mr?: number;
  ms?: number;
  /**
   * 每秒回血 / 每秒回魔 at level 1, through the same seam as everything above.
   *
   * ⭐ GH#177 —— 這兩格是**後補的,而它們的缺席是可以量的**。四份英雄卡從 w3x 照抄
   * 進來時帶著 `healthRegen` 8 / 12 / 15 / **75**（全體中位數 1.15），其中兩位
   * （`godie-huth` · `godie-u00k`）就在預設開放名單上。而
   * `sim/stats/statTypes.ts` 的 `STAT_CLAMPS` **完全沒有** `HealthRegen` /
   * `ManaRegen` 條目,`sim/systems/RegenSystem.ts` 也只夾最大值不夾速率 ——
   * ⛔ **下游沒有任何一層會攔住它**。
   *
   * 在此之前這一頁比的是 `maxHealth / growthHealth / armor / mr / ms` 五項,
   * 所以核准那兩位的時候螢幕上**一個回復數字都不會出現**：不是體檢說「沒問題」,
   * 是體檢根本沒看。
   */
  healthRegen?: number;
  manaRegen?: number;
  /**
   * true when the doc carried a readable `attributes` block, so the numbers
   * above went through the 三圍 derivation. false means the doc predates #248
   * or is hand-authored and `baseStats` really is the level-1 truth for it.
   */
  attributeDerived: boolean;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function numRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v === null || typeof v !== "object") return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = num(val);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

/**
 * The 三圍 block, or undefined when the doc has none / it is malformed.
 *
 * Deliberately strict: a HALF-read attributes block would derive a wrong
 * number and present it as authoritative, which is worse than falling back to
 * the raw card and worse than showing "?". All six numbers or nothing.
 */
function parseAttributes(v: unknown): ChampionAttributes | undefined {
  if (v === null || typeof v !== "object") return undefined;
  const a = v as Record<string, unknown>;
  const str = num(a["str"]);
  const agi = num(a["agi"]);
  const int = num(a["int"]);
  const strGrowth = num(a["strGrowth"]);
  const agiGrowth = num(a["agiGrowth"]);
  const intGrowth = num(a["intGrowth"]);
  if (
    str === undefined ||
    agi === undefined ||
    int === undefined ||
    strGrowth === undefined ||
    agiGrowth === undefined ||
    intGrowth === undefined
  ) {
    return undefined;
  }
  const primary = a["primary"];
  const source = a["source"];
  return {
    str,
    agi,
    int,
    strGrowth,
    agiGrowth,
    intGrowth,
    primary: primary === "AGI" || primary === "INT" ? primary : "STR",
    source: source === "authored" ? "authored" : "w3x",
  };
}

/**
 * Project a fetched champion doc down to the compared fields, resolving each
 * one through `championStatBase` at level 1.
 *
 * `env` is the LIVE combat-env table when the page could read it, so a coefficient
 * the operator retuned in 戰鬥系統 shows up here too; omitting it uses the shipped
 * coefficients. Either way the peer median is computed from champions parsed with
 * the SAME table, so the comparison never mixes two scales.
 */
export function parseChampionStats(
  id: string,
  raw: unknown,
  env?: CombatEnvMultipliers,
): ChampionStats {
  const out: ChampionStats = { id, name: id, role: "", attributeDerived: false };
  if (raw === null || typeof raw !== "object") return out;
  const doc = raw as Record<string, unknown>;
  if (typeof doc["name"] === "string" && doc["name"] !== "") out.name = doc["name"];
  if (typeof doc["role"] === "string") out.role = doc["role"];

  const baseStats = numRecord(doc["baseStats"]);
  const growth = numRecord(doc["growth"]);
  const attributes = parseAttributes(doc["attributes"]);
  out.attributeDerived = attributes !== undefined;

  // A stat the card is silent about stays undefined — `championStatBase` would
  // happily answer 0 + coefficient·attr for a missing row, and "護甲 0" read off
  // a card that never mentioned armour is a fabricated finding, not a reading.
  const carrier: AttributeCarrier = {
    baseStats: baseStats as AttributeCarrier["baseStats"],
    growth: growth as AttributeCarrier["growth"],
    ...(attributes !== undefined ? { attributes } : {}),
  };
  const at1 = (key: string, stat: Stat): number | undefined =>
    key in baseStats || key in growth ? championStatBase(carrier, stat, 1, env) : undefined;

  out.maxHealth = at1("maxHealth", Stat.MaxHealth);
  out.armor = at1("armor", Stat.Armor);
  out.mr = at1("mr", Stat.MagicResist);
  out.ms = at1("ms", Stat.MoveSpeed);
  // GH#177 —— 同一條路徑,所以 STR→回血 / INT→回魔 的派生與 `manaRegen` 的系統
  // 倍率都被算進去了（那個倍率是 8×,把一張看起來普通的卡變成每秒 37 點魔力）。
  out.healthRegen = at1("healthRegen", Stat.HealthRegen);
  out.manaRegen = at1("manaRegen", Stat.ManaRegen);
  // 每級 for health includes the attribute growth (str_growth × strToMaxHealth),
  // which is the only reason a champion with `growth.maxHealth: 0` can still
  // gain health per level — and the reason 熊貓 (all three growths 0) does not.
  out.growthHealth =
    "maxHealth" in baseStats || "maxHealth" in growth
      ? championStatGrowth(carrier, Stat.MaxHealth, env)
      : undefined;
  return out;
}

/** Median of the defined values, or undefined when there is nothing to compare. */
export function median(values: readonly (number | undefined)[]): number | undefined {
  const nums = values.filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  if (nums.length === 0) return undefined;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return ((nums[mid - 1] as number) + (nums[mid] as number)) / 2;
}

export interface PeerBaseline {
  count: number;
  maxHealth?: number;
  armor?: number;
  mr?: number;
  ms?: number;
  healthRegen?: number;
  manaRegen?: number;
}

/** The middle of the roster this champion would actually be matched against. */
export function peerBaseline(peers: readonly ChampionStats[]): PeerBaseline {
  return {
    count: peers.length,
    maxHealth: median(peers.map((p) => p.maxHealth)),
    armor: median(peers.map((p) => p.armor)),
    mr: median(peers.map((p) => p.mr)),
    ms: median(peers.map((p) => p.ms)),
    healthRegen: median(peers.map((p) => p.healthRegen)),
    manaRegen: median(peers.map((p) => p.manaRegen)),
  };
}

/**
 * GH#177 —— 幾倍於同場中位數才算「離群」。
 *
 * ⚠️ 刻意鬆（和這一頁其他三條門檻同一個理由：會亂喊的頁面會被無腦點過）。
 * 5× 是「一眼看得出是另一個量級」的線 —— 一張中位數 1.15 的名單上，這條抓的是
 * 8 / 12 / 15 / 75 那一族，⛔ 不會抓 2.5 那種只是偏高的卡。
 *
 * ⛔ 這不是一個平衡數值,所以它不進 `content/config/` ——
 * 它是這一頁「什麼時候該提醒操作者」的判準,和上面的 0.5 / 0.7 同一層。
 */
export const REGEN_OUTLIER_MULT = 5;

export interface StatAudit {
  /** false when at least one finding fired, OR when there was nothing to check */
  ok: boolean;
  /** true when the numbers could not be read at all (fail-safe: treat as risky) */
  unknown: boolean;
  /** plain-中文 findings, worst first */
  findings: string[];
  /** the one-line stat readout, always shown */
  line: string;
}

/**
 * 數值體檢 — is this champion survivable next to the ones already enabled?
 *
 * A GENERAL RULE, NOT A NAMED SPECIAL CASE. The owner's brief was about one
 * hero whose champion sheet had been retuned to serve its trash-mob avatar
 * (100 base HP, no resistances, half move speed) — but hard-coding that id
 * would fix exactly one champion once and then quietly approve the next one.
 * So the check is a comparison against the LIVE median of the enabled roster,
 * with the actual numbers printed either way: approving a healthy hero shows a
 * green readout, approving a 100-HP hero shows red and demands a second
 * confirmation.
 *
 * Thresholds are deliberately loose — this must catch "unplayable", not
 * "slightly under-tuned", because a page that cries wolf gets clicked through.
 */
export function auditStats(cand: ChampionStats, base: PeerBaseline): StatAudit {
  // Derived values are rarely round (a 2.8 str growth × 23 hp is 64.4), and a
  // readout the owner scans in two seconds must not turn into 120.39999999999999.
  const show = (v: number | undefined): string =>
    v === undefined ? "?" : `${Math.round(v * 100) / 100}`;
  const parts: string[] = [];
  parts.push(cand.maxHealth === undefined ? "血量 ?" : `血量 ${show(cand.maxHealth)}`);
  if (cand.growthHealth !== undefined) parts.push(`每級 +${show(cand.growthHealth)}`);
  parts.push(cand.armor === undefined ? "護甲 ?" : `護甲 ${show(cand.armor)}`);
  parts.push(cand.mr === undefined ? "魔抗 ?" : `魔抗 ${show(cand.mr)}`);
  parts.push(cand.ms === undefined ? "移速 ?" : `移速 ${show(cand.ms)}`);
  // GH#177 —— 回復兩格。印出來是這條的一半價值：在此之前核准一位每秒回 12 點血的
  // 英雄時,螢幕上不會出現任何回復數字,所以「沒看到警告」等於「沒有人看過」。
  parts.push(cand.healthRegen === undefined ? "回血 ?" : `回血 ${show(cand.healthRegen)}/秒`);
  parts.push(cand.manaRegen === undefined ? "回魔 ?" : `回魔 ${show(cand.manaRegen)}/秒`);
  const line =
    `${parts.join(" · ")}` +
    (base.count > 0
      ? `　（已開放 ${base.count} 名英雄的中位數：血量 ${show(base.maxHealth)} · 護甲 ${show(base.armor)} · 魔抗 ${show(base.mr)} · 移速 ${show(base.ms)} · 回血 ${show(base.healthRegen)}/秒 · 回魔 ${show(base.manaRegen)}/秒）`
      : "　（沒有可比較的已開放英雄）");

  if (cand.maxHealth === undefined || base.count === 0 || base.maxHealth === undefined) {
    return {
      ok: false,
      unknown: true,
      findings: ["讀不到 content 數值，無法做體檢 — 請當成「未經檢查」處理。"],
      line,
    };
  }

  const findings: string[] = [];
  const pct = (v: number, of: number): string => `${Math.round((v / of) * 100)}%`;
  if (cand.maxHealth < base.maxHealth * 0.5) {
    findings.push(
      `血量 ${cand.maxHealth}，只有同場英雄中位數 ${base.maxHealth} 的 ${pct(cand.maxHealth, base.maxHealth)} — 會被秒殺。`,
    );
  }
  if (base.armor !== undefined && base.armor > 0 && (cand.armor ?? 0) <= 0) {
    findings.push(`護甲 ${cand.armor ?? 0}（同場中位數 ${base.armor}）— 完全不減傷。`);
  }
  if (base.mr !== undefined && base.mr > 0 && (cand.mr ?? 0) <= 0) {
    findings.push(`魔抗 ${cand.mr ?? 0}（同場中位數 ${base.mr}）— 法術傷害全額吃下。`);
  }
  if (base.ms !== undefined && cand.ms !== undefined && cand.ms < base.ms * 0.7) {
    findings.push(
      `移速 ${cand.ms}，同場中位數 ${base.ms} — 跑不掉也追不到（約 ${pct(cand.ms, base.ms)}）。`,
    );
  }
  // ── GH#177 回復離群 ────────────────────────────────────────────────────────
  // ⚠️ 這兩條的措辭刻意講出「下游沒有夾限」：它是這個 finding 存在的全部理由。
  // 一個離群的護甲值最後仍然被減傷公式吃掉，一個離群的回復值**不會被任何東西吃掉**
  // —— `STAT_CLAMPS` 沒有這兩項，`RegenSystem` 只夾最大值不夾速率。
  const regenFinding = (
    what: string,
    value: number | undefined,
    peer: number | undefined,
    tail: string,
  ): void => {
    if (value === undefined || peer === undefined || !(peer > 0)) return;
    if (!(value > peer * REGEN_OUTLIER_MULT)) return;
    findings.push(
      `${what} ${show(value)}/秒，是同場中位數 ${show(peer)}/秒 的 ${show(value / peer)} 倍${tail}` +
        ` ⚠️ 系統沒有任何回復速率上限（STAT_CLAMPS 沒有這一項），所以下游不會替你夾住它。`,
    );
  };
  regenFinding(
    "回血",
    cand.healthRegen,
    base.healthRegen,
    cand.maxHealth !== undefined && cand.maxHealth > 0
      ? `，等於每秒回滿血的 ${pct(cand.healthRegen ?? 0, cand.maxHealth)}。`
      : "。",
  );
  regenFinding("回魔", cand.manaRegen, base.manaRegen, "。");
  return { ok: findings.length === 0, unknown: false, findings, line };
}

// ---------------------------------------------------------------- rows -----

export type RowKind =
  /** declared in starter.go, not enabled live — the thing the owner is asked to approve */
  | "champion-open"
  /** enabled live but missing ability slots — approving fills them in */
  | "ability-fill"
  /**
   * 上架道具 (GH#495) — items declared in starter.go but not enabled live.
   *
   * ⭐ ONE AGGREGATE ROW, not one row per item. A champion row earns its own
   * card because it carries a 數值體檢 the owner has to read; an item id does
   * not, and forty single-line cards would bury the four rows that do matter.
   */
  | "item-open"
  /** enabled live but never declared — a warning; no tick can "approve" it */
  | "champion-undeclared"
  /** items enabled live but in no starter list — the 下架 candidates for 第②區 */
  | "item-undeclared"
  /** a real person waiting in the #126 queue */
  | "account-approve"
  /** a live probe of something this page CANNOT change */
  | "exposure";

export type RowTone = "ok" | "warn" | "danger" | "dim";

/**
 * ONE row. Every field below is mandatory prose because the owner's second
 * requirement is that a row must never be a bare label with a checkbox: what it
 * is, why it is waiting, what happens on approval, and the known risk.
 */
export interface QuickRow {
  /** stable key: react key, tick-set member and plan identifier */
  key: string;
  kind: RowKind;
  title: string;
  subtitle: string;
  /** 這是什麼 */
  what: string;
  /** 為什麼還在等 */
  why: string;
  /** 打勾送出後會發生什麼 */
  effect: string;
  /** 已知風險 — null only when there genuinely is none */
  risk: string | null;
  /** the raw stat readout, when this row is about a champion */
  stats?: string;
  tone: RowTone;
  /** false ⇒ read-only row: it is shown because it needs a decision elsewhere */
  tickable: boolean;
  /** ticking this needs an extra, consequence-naming confirmation */
  needsSecondConfirm: boolean;
  /** champion ids this row's tick unions in */
  champions?: string[];
  /** ability ids this row's tick unions in */
  abilities?: string[];
  /** item ids this row's tick unions in (GH#495) */
  items?: string[];
  /** account id this row's tick approves */
  accountId?: string;
  /** the page that OWNS this thing (Quick Approval owns nothing) */
  ownerPage?: { page: string; label: string };
}

export interface BuildRowsInput {
  /** GET /curation/whitelist/starter → champions */
  declaredChampions: readonly string[];
  /** GET /curation/whitelist */
  liveChampions: readonly string[];
  liveAbilities: readonly string[];
  /**
   * The ITEM halves of the same two documents (GH#495 「上下架角色道具」).
   *
   * OPTIONAL on purpose: champions and items are independent lists on the
   * platform, and a caller that can only read one of them must still get the
   * rows for the other. Omitting them means "I did not read the item lists",
   * which produces no item rows — never a row claiming an empty item whitelist.
   */
  declaredItems?: readonly string[];
  liveItems?: readonly string[];
  /** champion docs, by id — may be partial or empty when /content is unreachable */
  stats: ReadonlyMap<string, ChampionStats>;
  /**
   * The #126 queue as fetched, OLDEST FIRST. Deliberately just the page the
   * caller loaded: the FULL server-side count is the caller's to display (it
   * must say so when the queue is longer than the page), not something this
   * module can turn into rows it does not have.
   */
  pendingAccounts: readonly { id: string; username: string; waited: string }[];
  /**
   * GET /editor/ → status plus whether the EDITOR actually answered.
   * `servesEditor` matters because since #241 a production deploy has no
   * /editor/ location, so the request falls through to the client SPA and comes
   * back 200 — the status alone can no longer tell the two apart.
   */
  editorProbe: { status: number | null; servesEditor?: boolean; error?: string };
}

/**
 * A subtitle for an aggregate row: the first few ids, then how many more.
 * The full list is what the tick writes, so the subtitle must never READ as the
 * whole list — hence the explicit 「…等 N 件」 rather than a bare ellipsis.
 */
function previewIds(ids: readonly string[], head = 5): string {
  if (ids.length <= head) return ids.join("、");
  return `${ids.slice(0, head).join("、")} …等 ${ids.length} 件`;
}

const NAME_OF = (id: string, stats: ReadonlyMap<string, ChampionStats>): string => {
  const s = stats.get(id);
  return s && s.name !== id ? `${s.name}` : id;
};

/**
 * Build every row from live state. Order is decision-first: the people waiting,
 * then the roster the owner asked about, then the repairs, then the warnings,
 * then the things this page cannot change.
 */
export function buildRows(input: BuildRowsInput): QuickRow[] {
  const rows: QuickRow[] = [];
  const delta = rosterDelta(input.declaredChampions, input.liveChampions);
  const enabledAbilities = new Set(input.liveAbilities);

  // the peer baseline is the roster ALREADY enabled — the heroes a new pick
  // would actually stand next to
  const peers = input.liveChampions
    .map((id) => input.stats.get(id))
    .filter((s): s is ChampionStats => s !== undefined);
  const base = peerBaseline(peers);

  // --- D4: real people, waiting right now -----------------------------------
  for (const acct of input.pendingAccounts) {
    rows.push({
      key: `account:${acct.id}`,
      kind: "account-approve",
      title: acct.username,
      subtitle: acct.waited,
      what: "一個註冊後停在「等待審核」畫面的帳號。",
      why: "私人部署：註冊後預設 pending，沒有人按「通過」就進不了對戰。",
      effect: "帳號變成已通過，下一個請求就能進大廳與對戰。",
      risk: "只該放行你認得的人。放行後仍可在「帳號審核」頁改成婉拒。",
      tone: "warn",
      tickable: true,
      needsSecondConfirm: false,
      accountId: acct.id,
      ownerPage: { page: "approvals", label: "帳號審核" },
    });
  }

  // --- D1: declared but not enabled — the roster the owner asked about -------
  for (const id of delta.waiting) {
    const cand = input.stats.get(id);
    const audit = cand ? auditStats(cand, base) : null;
    const missing = missingAbilitySlots(id, enabledAbilities);
    const bad = audit === null || !audit.ok;
    rows.push({
      key: `champion:${id}`,
      kind: "champion-open",
      title: NAME_OF(id, input.stats),
      subtitle: `${id}${cand?.role ? ` · ${cand.role}` : ""}`,
      what: "這名英雄寫在版本控管的開放名單（starter.go）裡，但這台伺服器的白名單還沒有他。",
      why:
        "白名單是「營運狀態」，預設全空，而自動套用起始組合只在白名單「一名英雄都沒有」時才會跑（ApplyStarterSetIfEmpty）。" +
        `現在已經有 ${input.liveChampions.length} 名，所以重開機、重新部署都永遠不會補上他 — 只能你在這裡按。`,
      effect: `英雄 ${id} 加入白名單，同時補上 ${missing.length} 個技能格（${ABILITY_SLOTS.join("/")}），選角畫面立刻可選。`,
      risk: bad
        ? (audit?.findings.join(" ") ?? "讀不到數值，無法體檢。") + " 建議先修數值再開放。"
        : "只做「加入」，不會動到任何現有的啟用項目。",
      stats: audit?.line,
      tone: bad ? "danger" : "ok",
      tickable: true,
      needsSecondConfirm: bad,
      champions: [id],
      abilities: missing,
      ownerPage: { page: "curation", label: "內容白名單" },
    });
  }

  // --- D3: enabled but half-wired ------------------------------------------
  for (const half of halfEnabledChampions(input.liveChampions, input.liveAbilities)) {
    // a champion in D1 is not yet enabled, so it cannot also be half-enabled;
    // this list is by construction disjoint from the rows above
    rows.push({
      key: `abilities:${half.id}`,
      kind: "ability-fill",
      title: `${NAME_OF(half.id, input.stats)} — 技能格沒補滿`,
      subtitle: `${half.id} · 缺 ${half.missing.length} / ${ABILITY_SLOTS.length}`,
      what: `這名英雄已經開放，但白名單裡缺這些技能：${half.missing.join("、")}。`,
      why:
        "英雄與技能是兩份清單。從「內容白名單」單獨勾一個英雄、或用 bulk 只送 champions，都會留下這種半開放狀態。",
      effect: `補上 ${half.missing.length} 個技能 id（union，不會移除任何東西）。`,
      risk:
        "技能 id 進白名單不代表技能有實作內容 — 若該英雄本來就沒有這幾支技能文件，補進來只是讓 id 存在。",
      tone: "warn",
      tickable: true,
      needsSecondConfirm: false,
      abilities: half.missing,
      ownerPage: { page: "curation", label: "內容白名單" },
    });
  }

  // --- D1b: 上架道具 (GH#495) — one aggregate row, ticked or not as a whole --
  const itemDelta =
    input.declaredItems !== undefined && input.liveItems !== undefined
      ? rosterDelta(input.declaredItems, input.liveItems)
      : null;
  if (itemDelta !== null && itemDelta.waiting.length > 0) {
    rows.push({
      key: "items:open",
      kind: "item-open",
      title: `開放 ${itemDelta.waiting.length} 件道具`,
      subtitle: previewIds(itemDelta.waiting),
      what: "這些道具寫在版本控管的開放名單（starter.go）裡，但這台伺服器的白名單還沒有它們。",
      why:
        "英雄與道具是兩份清單：開放一名英雄不會連帶開放商店道具，而自動套用起始組合只在白名單全空時跑過一次。",
      effect: `${itemDelta.waiting.length} 個道具 id 加入白名單（union），商店立刻買得到。`,
      risk: "只做「加入」，不會動到任何現有的啟用項目。道具 id 進白名單不代表它的數值平衡過。",
      tone: "warn",
      tickable: true,
      needsSecondConfirm: false,
      items: itemDelta.waiting,
      ownerPage: { page: "curation", label: "內容白名單" },
    });
  }

  // --- D2: enabled but never declared — a WARNING, not an approval ----------
  for (const id of delta.undeclared) {
    const cand = input.stats.get(id);
    const audit = cand ? auditStats(cand, base) : null;
    const bad = audit === null || !audit.ok;
    rows.push({
      key: `undeclared:${id}`,
      kind: "champion-undeclared",
      title: `${NAME_OF(id, input.stats)} — 已經開放中`,
      subtitle: `${id}${cand?.role ? ` · ${cand.role}` : ""}`,
      what: "這名英雄已經在白名單裡，但不在版本控管的開放名單（starter.go）中 — 沒有任何一次審查涵蓋他。",
      why: "他已經是啟用狀態，所以這裡沒有「通過」可按 — 打勾也不會改變任何事。",
      effect:
        "（無）這一列不參與送出。要下架他，用下面第②區的「下架未經名單審查的英雄」" +
        "（會先逐項預覽，做完給你一鍵還原）；或把數值補好再正式列入名單。",
      risk: bad
        ? (audit?.findings.join(" ") ?? "讀不到數值，無法體檢。") +
          " 家人現在就選得到他，而且會直接輸掉。"
        : "沒有經過名單審查，但數值體檢沒有發現異常。",
      stats: audit?.line,
      tone: bad ? "danger" : "dim",
      tickable: false,
      needsSecondConfirm: false,
      champions: [id],
      ownerPage: { page: "curation", label: "內容白名單" },
    });
  }

  // --- D2b: items enabled but never declared (GH#495) -----------------------
  if (itemDelta !== null && itemDelta.undeclared.length > 0) {
    rows.push({
      key: "items:undeclared",
      kind: "item-undeclared",
      title: `${itemDelta.undeclared.length} 件道具沒有經過名單審查`,
      subtitle: previewIds(itemDelta.undeclared),
      what: "這些道具已經在白名單裡（商店買得到），但不在版本控管的開放名單（starter.go）中。",
      why:
        "他們已經是啟用狀態，所以這裡沒有「通過」可按。這不一定是錯的 — 營運手動加的道具長得就是這樣。",
      effect:
        "（無）這一列不參與送出。確定是誤加的話，用下面第②區的「下架未經名單審查的道具」。",
      risk: "沒有經過名單審查，所以沒有人看過它們的價格與數值。",
      tone: "dim",
      tickable: false,
      needsSecondConfirm: false,
      items: itemDelta.undeclared,
      ownerPage: { page: "curation", label: "內容白名單" },
    });
  }

  // --- D5: a live probe of something this page cannot change ---------------
  rows.push(editorExposureRow(input.editorProbe));

  return rows;
}

/**
 * The /editor/ row. READ-ONLY BY CONSTRUCTION: whether the editor is served is
 * decided by the edge IMAGE (docker/edge.Dockerfile's GGD_INCLUDE_EDITOR, off
 * by default) and by whether nginx/dev/ is mounted — a deploy decision with no
 * admin write path at all. Rendering it with a checkbox would let the owner
 * "approve" something the click cannot change — a lie in the UI. So it renders
 * as a probe result and a sentence saying where the decision actually lives.
 *
 * #241: the verdict is `servesEditor`, NOT the status code. With the route gone,
 * /editor/ falls through to the client SPA and returns 200; reading 200 as
 * 「開著」 would keep the warning lit forever on a deploy that fixed it, and a
 * security row that cries wolf gets ignored. A probe that could not tell (an
 * older caller that only sent HEAD, so `servesEditor` is undefined) says so
 * rather than guessing in either direction.
 */
export function editorExposureRow(probe: {
  status: number | null;
  servesEditor?: boolean;
  error?: string;
}): QuickRow {
  const answered = probe.status !== null && probe.status >= 200 && probe.status < 400;
  const exposed = answered && probe.servesEditor === true;
  const unknown = answered && probe.servesEditor === undefined;
  const result =
    probe.status === null
      ? `無法探測（${probe.error ?? "請求失敗"}）`
      : unknown
        ? `GET /editor/ → ${probe.status}，但這次探測沒有讀回內容，無法分辨是編輯器還是遊戲前端的 SPA fallback。`
        : exposed
          ? `GET /editor/ → ${probe.status} 且回的是編輯器本體：這個環境確實對外開著，而且不需要登入。`
          : `GET /editor/ → ${probe.status}，回的不是編輯器（落到遊戲前端的 SPA fallback）：這個環境沒有提供 /editor/。`;
  return {
    key: "exposure:editor",
    kind: "exposure",
    title: "/editor/ 未驗證就對外開放",
    subtitle: "唯讀 · 這一頁按不了",
    what:
      "編輯器前端曾被無條件 COPY 進 edge 映像，nginx 以純靜態、無驗證的方式提供 /editor/。" +
      "#241 之後：映像預設不含它（build arg GGD_INCLUDE_EDITOR=0），路由移到只在 dev 掛載的 nginx/dev/editor.conf。",
    why: "這是部署/映像的決定，後台沒有任何一條寫入路徑可以改它。",
    effect: "（無）這一列不參與送出。要改必須動 nginx 設定與 edge 映像並重新部署。",
    risk: "它只是前端；真正的寫入權在 loopback 的 content-api，遠端打不到。但頁面本身若還在，就是公開可見的。",
    stats: result,
    tone: exposed || unknown ? "warn" : "dim",
    tickable: false,
    needsSecondConfirm: false,
  };
}

// ---------------------------------------------------------------- plan -----

export interface SkippedItem {
  key: string;
  title: string;
  why: string;
}

export interface SubmitPlan {
  /** champion ids to UNION into the whitelist */
  champions: string[];
  /** ability ids to UNION into the whitelist */
  abilities: string[];
  /** item ids to UNION into the whitelist (GH#495) */
  items: string[];
  /** account ids to approve */
  accounts: string[];
  /** everything on the page that will NOT be touched, and why */
  skipped: SkippedItem[];
}

/** Nothing is planned. */
export function emptyPlan(): SubmitPlan {
  return { champions: [], abilities: [], items: [], accounts: [], skipped: [] };
}

/**
 * Turn the ticked rows into exactly what will be written, plus an explicit
 * account of everything that will not be. The "what was skipped and why" half
 * is not decoration: a one-click page that silently drops a row is how an owner
 * ends up believing something was approved when it was not.
 */
export function buildPlan(rows: readonly QuickRow[], ticked: ReadonlySet<string>): SubmitPlan {
  const plan = emptyPlan();
  const champions = new Set<string>();
  const abilities = new Set<string>();
  const items = new Set<string>();
  for (const row of rows) {
    if (!row.tickable) {
      plan.skipped.push({
        key: row.key,
        title: row.title,
        why:
          row.kind === "exposure"
            ? "唯讀：這一頁沒有可以改變它的寫入路徑。"
            : "唯讀：已經是啟用狀態，沒有「通過」可按。",
      });
      continue;
    }
    if (!ticked.has(row.key)) {
      plan.skipped.push({ key: row.key, title: row.title, why: "沒有打勾 — 這次不送出。" });
      continue;
    }
    for (const id of row.champions ?? []) champions.add(id);
    for (const id of row.abilities ?? []) abilities.add(id);
    for (const id of row.items ?? []) items.add(id);
    if (row.accountId !== undefined) plan.accounts.push(row.accountId);
  }
  plan.champions = [...champions].sort();
  plan.abilities = [...abilities].sort();
  plan.items = [...items].sort();
  return plan;
}

/** True when the plan would write nothing at all. */
export function planIsEmpty(plan: SubmitPlan): boolean {
  return (
    plan.champions.length === 0 &&
    plan.abilities.length === 0 &&
    plan.items.length === 0 &&
    plan.accounts.length === 0
  );
}

/**
 * The bulk requests for a plan — the ONLY shape this page writes the whitelist
 * with.
 *
 * `disable` is ALWAYS empty. POST /curation/whitelist/bulk merges `enable` into
 * the existing list server-side (Service.Bulk), so this is union-only and
 * idempotent; the operator's extra entries — items and champions that appear in
 * no starter list — survive untouched. PUT /curation/whitelist (Replace) and
 * the 內容白名單 page's saveWhitelist/diffDoc draft machinery would compute a
 * `disable` array from whatever this page happens to know about, and delete
 * them. That is why neither is imported here.
 */
export function planBulkRequests(plan: SubmitPlan): BulkRequest[] {
  const out: BulkRequest[] = [];
  if (plan.champions.length > 0) {
    out.push({ kind: "champions", enable: [...plan.champions], disable: [] });
  }
  if (plan.abilities.length > 0) {
    out.push({ kind: "abilities", enable: [...plan.abilities], disable: [] });
  }
  if (plan.items.length > 0) {
    out.push({ kind: "items", enable: [...plan.items], disable: [] });
  }
  return out;
}

/**
 * ⛔ NO `disable` BUILDER LIVES IN THIS MODULE ANY MORE (GH#495).
 *
 * Until 2026-08-21 a D2 row carried its own 停用 button backed by a
 * `disableChampionRequest()` here — one window.confirm, no item list, no undo
 * point. 第②區 (../quickCleanup.ts) now owns every removal behind a mandatory
 * preview, and leaving a second, preview-less removal path on the SAME page
 * would have made the zone contract unenforceable: a guard can only prove
 * 「移除一定經過預覽」 while there is exactly one door.
 */

/** Which rows still need the extra confirmation, given the current ticks. */
export function rowsNeedingSecondConfirm(
  rows: readonly QuickRow[],
  ticked: ReadonlySet<string>,
): QuickRow[] {
  return rows.filter((r) => r.tickable && r.needsSecondConfirm && ticked.has(r.key));
}

/**
 * The confirmation text for a risky tick. NAMES THE CONSEQUENCE — a generic
 * 「確定嗎？」 is answered "yes" reflexively and therefore protects nobody.
 */
export function secondConfirmText(rows: readonly QuickRow[]): string {
  const lines = rows.map((r) => `・${r.title}（${r.subtitle}）\n　${r.risk ?? ""}`);
  return (
    "以下項目的數值體檢沒有通過：\n\n" +
    lines.join("\n\n") +
    "\n\n開放後家人就選得到他們。仍要送出嗎？"
  );
}

/** One-line preview for the submit button / confirmation line. */
export function describePlan(plan: SubmitPlan): string {
  const parts: string[] = [];
  if (plan.accounts.length > 0) parts.push(`通過帳號 ${plan.accounts.length}`);
  if (plan.champions.length > 0) parts.push(`開放英雄 ${plan.champions.length}`);
  if (plan.abilities.length > 0) parts.push(`補技能 ${plan.abilities.length}`);
  if (plan.items.length > 0) parts.push(`開放道具 ${plan.items.length}`);
  if (parts.length === 0) return "沒有勾選任何項目";
  return parts.join("、");
}

// -------------------------------------------------------------- result -----

export interface StepResult {
  label: string;
  ok: boolean;
  detail: string;
}

export interface SubmitResult {
  steps: StepResult[];
  skipped: SkippedItem[];
  /** true when every attempted step succeeded */
  allOk: boolean;
}

/** Assemble the post-submit report (steps + the untouched rows and why). */
export function summarizeResult(steps: readonly StepResult[], plan: SubmitPlan): SubmitResult {
  return {
    steps: [...steps],
    skipped: [...plan.skipped],
    allOk: steps.every((s) => s.ok),
  };
}
