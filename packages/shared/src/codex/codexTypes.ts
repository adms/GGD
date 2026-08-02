/**
 * codexTypes — the normalised shapes the 內容圖鑑 (content codex) renders.
 *
 * LIVENESS CONTRACT (task #71, the load-bearing requirement 「動態即時非寫死」):
 * every field below is DERIVED AT RUNTIME from a document fetched over HTTP
 * from the /content mount. Nothing in this directory may embed a champion /
 * item / ability name, description or number — edit a JSON under content/,
 * press 重新載入 (or F5), and the page must show the new value. The gate that
 * keeps it that way is `codexLive.test.ts`.
 *
 * Each entry keeps its `doc` — the raw parsed JSON exactly as fetched — so the
 * detail view can render fields nobody normalised yet (and so a reader can see
 * that what is on screen IS the file on disk).
 */

import type { ChampionAttributes } from "../sim/stats/attributes";
import type { ClassRequirement } from "../sim/content/requirement";

/** The three browsable collections. */
export type CodexKind = "item" | "champion" | "ability";

/** Ability slot as authored (Q/W/E/R core kit + the standalone EX). */
export type CodexSlot = "Q" | "W" | "E" | "R" | "EX";

/** A stat modifier as authored on an item (`{stat, op, value}`). */
export interface CodexModifier {
  readonly stat: string;
  readonly op: string;
  readonly value: number;
  /**
   * 職業限定閘 — 「這一條給誰」, carried through from the authored doc.
   *
   * ⚠️ NOT OPTIONAL DECORATION. The normaliser used to DROP this key, and the
   * result was a codex that contradicted itself: 貫雷槍 (godie-i01g) authors
   * 「近戰攻擊距離+4；遠戰攻擊距離+2」 as two gated rows on one stat, so the
   * detail page printed two bare lines 「攻擊距離 +4」 / 「攻擊距離 +2」 and a
   * reader had no way to learn that he gets exactly one of them. The shop card
   * had already solved this (`panels/itemStats.formatAuthoredBonus` appends
   * `requirementShortLabel`); the codex simply never carried the field.
   *
   * Rendered by `codexLabels.formatModifier` through that SAME shared renderer,
   * so the sentence is derived from the object the sim gates on rather than
   * typed in twice (CLAUDE.md 第三守則 — a hand-copied condition is a comment,
   * and comments lie).
   */
  readonly requires?: ClassRequirement;
}

/**
 * Item classification.
 *
 * Task #70 is restructuring content/items/** into FINAL / COMPONENT / RECIPE
 * BOOK / QUEST REWARD / TOKEN-NO-OP. When that lands, the item docs will carry
 * the bucket themselves and `bucketOf()` returns it verbatim (`source: "doc"`).
 * Until then we DEGRADE GRACEFULLY to a derived, honestly-labelled split
 * (`source: "derived"`) — recipe book by name, quest reward by cost 0, then
 * simply "carries modifiers" vs "carries none", which is all the current docs
 * can support.
 */
export type CodexItemBucket =
  | "final"
  | "component"
  | "recipe-book"
  | "quest-reward"
  | "token-no-op"
  | "with-modifiers"
  | "no-modifiers";

export interface CodexItem {
  readonly kind: "item";
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly cost: number;
  readonly tier: number;
  readonly tags: readonly string[];
  readonly modifiers: readonly CodexModifier[];
  readonly unique: boolean;
  readonly hasPassive: boolean;
  readonly icon: string | null;
  readonly bucket: CodexItemBucket;
  /** "doc" = authored by task #70; "derived" = inferred here, see above. */
  readonly bucketSource: "doc" | "derived";
  /** lowercased haystack for instant substring search */
  readonly searchKey: string;
  readonly doc: Readonly<Record<string, unknown>>;
}

export interface CodexChampion {
  readonly kind: "champion";
  readonly id: string;
  /** raw `name` as authored — the WC3 convention 「稱號 - 全名」 */
  readonly name: string;
  /** 稱號 (the title half), null for the four entries with no dash */
  readonly title: string | null;
  /** 全名 (the character half); === name when there is no dash */
  readonly fullName: string;
  /** hero 編號 via the shared identity rule, null when unprovable */
  readonly heroNumber: string | null;
  readonly description: string | null;
  readonly role: string;
  readonly attackType: string;
  readonly modelKey: string | null;
  readonly icon: string | null;
  /** RAW card — the attribute term is NOT in here; see `attributes` (#248) */
  readonly baseStats: Readonly<Record<string, number>>;
  /** per-level, for the stats with no attribute source (since #248: `mr`) */
  readonly growth: Readonly<Record<string, number>>;
  /** 三圍 STR/AGI/INT + growths (task #248); null when the doc has none */
  readonly attributes: ChampionAttributes | null;
  /** ability ids for Q/W/E/R in slot order (missing slots omitted) */
  readonly abilityIds: readonly string[];
  readonly exAbilityId: string | null;
  readonly buildPriority: readonly string[];
  readonly tags: readonly string[];
  readonly searchKey: string;
  readonly doc: Readonly<Record<string, unknown>>;
}

export interface CodexAbility {
  readonly kind: "ability";
  readonly id: string;
  /** raw name, still carrying the `NN-0X` / `NN-00X` 編號 prefix (task #11) */
  readonly name: string;
  /** name with the 編號 prefix stripped (the in-game display name) */
  readonly cleanName: string;
  readonly heroNumber: string | null;
  /** the skill index from the prefix: "01".."04", "002" for an EX */
  readonly skillIndex: string | null;
  readonly slot: CodexSlot;
  /** owner champion id, parsed off the ability id (`godie-e002.q`) */
  readonly championId: string | null;
  readonly description: string | null;
  readonly castType: string;
  readonly maxRank: number;
  readonly cooldown: readonly number[];
  readonly manaCost: readonly number[];
  readonly range: number;
  readonly radius: number | null;
  readonly castTimeSec: number | null;
  readonly targetsEnemies: boolean | null;
  readonly effects: readonly Readonly<Record<string, unknown>>[];
  readonly vfxKey: string | null;
  readonly icon: string | null;
  readonly searchKey: string;
  readonly doc: Readonly<Record<string, unknown>>;
}

export type CodexEntry = CodexItem | CodexChampion | CodexAbility;

/** A pointer into the codex, used by cross-links and the issue table. */
export interface CodexRef {
  readonly kind: CodexKind;
  readonly id: string;
}

/** Operator curation snapshot (GET /api/v1/curation/whitelist). */
export interface CodexWhitelist {
  /** false = platform unreachable (offline/dev) → "啟用狀態未知", not "disabled" */
  readonly enforced: boolean;
  readonly champions: ReadonlySet<string>;
  readonly items: ReadonlySet<string>;
  readonly abilities: ReadonlySet<string>;
}

/** What the manifest claims vs what the collection index actually listed. */
export interface CodexCollectionCount {
  /** count recorded in content/manifest.json (may be STALE) */
  readonly manifest: number | null;
  /** entries listed in the collection's _index.json */
  readonly indexed: number;
  /** documents that actually fetched + parsed */
  readonly loaded: number;
}

/** Everything one codex load produced. */
export interface CodexData {
  /** contentVersion from content/manifest.json ("cv_…"), null if unavailable */
  readonly contentVersion: string | null;
  readonly counts: Readonly<Record<CodexKind, CodexCollectionCount>>;
  readonly items: readonly CodexItem[];
  readonly champions: readonly CodexChampion[];
  readonly abilities: readonly CodexAbility[];
  readonly whitelist: CodexWhitelist;
  /** epoch ms the load finished — proves a reload actually re-read content */
  readonly loadedAt: number;
  /** non-fatal problems with the LOAD itself (404s, parse failures) */
  readonly loadErrors: readonly string[];
}
