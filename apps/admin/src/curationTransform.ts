/**
 * 一鍵清理變身態 — pure logic behind the 內容白名單 page's transform-cleanup panel.
 *
 * owner 2026-08-21:
 *   「白名單還是 59 / 10 個變身態在線上仍然選得到 => 幫我後台跳出一鍵清理變身態的按鈕」
 *
 * ---------------------------------------------------------------------------
 * WHY A BUTTON AND NOT A FILE EDIT
 * ---------------------------------------------------------------------------
 * The whitelist lives at `data/curation/whitelist.json`, which is in
 * `.gitignore`: `git push` + deploy cannot touch it. The local copy has been
 * clean for a while and the live one is not, so the only door is 營運端 — this
 * console.
 *
 * ---------------------------------------------------------------------------
 * THE LIST IS DERIVED, ⛔ NOT A HAND-WRITTEN SET OF TEN IDS
 * ---------------------------------------------------------------------------
 * The single question asked of every champion row is `transform.role ===
 * "alternate"` — read straight off `/content/champions/<id>.json`, which the
 * page already loads to render the list (so this costs zero extra fetches).
 * Consequences that are the whole point:
 *
 *   · a transform champion authored NEXT MONTH is covered on the day its doc
 *     lands, with nobody remembering to update a list;
 *   · a champion RENAMED or re-numbered cannot fall off the list;
 *   · ⛔ there is no id in this file, so no assertion in its test can pass by
 *     agreeing with a copy of the same mistake.
 *
 * ⛔ Deliberately NOT `championForms.ts`'s 26-pair table: that is the w3x import
 * EVIDENCE, and a second consumer of it in the ops console is a second thing to
 * keep in sync. The content tree is what the game actually ships.
 *
 * ---------------------------------------------------------------------------
 * ⭐ WHY THE CONSOLE DERIVES ITS OWN LIST WHEN THE SERVER ALREADY DOES
 * ---------------------------------------------------------------------------
 * The platform holds the same rule as a GATE (apps/platform/internal/curation/
 * transformevict.go) and the write goes through it — the console never sends
 * ids. But that gate is FAIL-OPEN: a platform that cannot read `content/
 * champions/` evicts nothing and serves a whitelist that still has ten dead
 * bodies in it, while looking exactly like a healthy one.
 *
 * So the panel computes its own answer from a completely different path (the
 * static `/content/` route, not the platform's filesystem) and compares. Two
 * numbers that disagree is the fail-loud for an inert gate — ⭐ a relationship
 * between two nouns, ⛔ not a check of each noun on its own (CLAUDE.md 部署協定).
 */
import type { ContentRow, WhitelistDoc } from "./curation";

/** The `transform.role` value that means "this body is not pickable". */
export const TRANSFORM_ROLE_ALTERNATE = "alternate";

/** Is this champion row a 變身態? The one predicate this module owns. */
export function isTransformedBodyRow(row: ContentRow): boolean {
  return row.transformRole === TRANSFORM_ROLE_ALTERNATE;
}

/**
 * Every 變身態 the loaded content rows declare, id → display name.
 *
 * Names, not just ids: 「移除 <一串英數 id>」 is not something an operator can
 * meaningfully agree to, and this action is not reversible from the row list
 * (the ids vanish from the whitelist, so they are no longer on screen to
 * re-tick).
 */
export function transformedBodyNames(rows: readonly ContentRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) if (isTransformedBodyRow(r)) out.set(r.id, r.name);
  return out;
}

/** One champion the cleanup would turn off. */
export interface TransformOffRow {
  id: string;
  /** display name, or the id when the doc never hydrated */
  name: string;
  /** false when we only have the id (a placeholder row) */
  named: boolean;
}

export interface TransformCleanupPlan {
  /**
   * False while the champion collection is still loading. A panel that says
   * 「0 個變身態」 because the docs have not arrived yet is worse than one that
   * says nothing: it is a green tick for a check that never ran.
   */
  ready: boolean;
  /** How many 變身態 the content tree declares in total (whitelisted or not). */
  indexed: number;
  /** Enabled champions before / after the cleanup. */
  before: number;
  after: number;
  /** The whitelisted ones — what the button removes. */
  remove: TransformOffRow[];
  /**
   * Whitelisted champion ids with NO content doc at all. They are a different
   * problem (a dangling id, GH#471) and this button deliberately leaves them
   * alone — but it must SAY so, because otherwise 「清乾淨了」 is a half-truth.
   */
  unresolved: string[];
  /**
   * True when every enabled champion reads as a 變身態. The platform refuses
   * this write (`would_empty_whitelist`); the panel must not offer it either,
   * and the real cause is mis-authored `transform.role`, not a dirty whitelist.
   */
  wouldEmpty: boolean;
}

export interface BuildTransformCleanupInput {
  /** The live whitelist as the server returned it. */
  live: WhitelistDoc;
  /** The champion rows the page loaded from /content/champions/. */
  rows: readonly ContentRow[];
}

export function buildTransformCleanupPlan(
  input: BuildTransformCleanupInput,
): TransformCleanupPlan {
  const { live, rows } = input;
  const ready = rows.length > 0 && rows.every((r) => r.hydrated === true);
  const alternates = transformedBodyNames(rows);
  const known = new Set(rows.map((r) => r.id));

  const remove: TransformOffRow[] = [];
  const unresolved: string[] = [];
  for (const id of [...live.champions].sort()) {
    const name = alternates.get(id);
    if (name !== undefined) {
      remove.push({ id, name: name === "" ? id : name, named: name !== "" && name !== id });
      continue;
    }
    if (!known.has(id)) unresolved.push(id);
  }

  return {
    ready,
    indexed: alternates.size,
    before: live.champions.length,
    after: live.champions.length - remove.length,
    remove,
    unresolved,
    wouldEmpty: remove.length > 0 && remove.length === live.champions.length,
  };
}

/** Can the panel hand over to the confirmation at all? */
export function canCleanTransformed(plan: TransformCleanupPlan): boolean {
  return plan.ready && plan.remove.length > 0 && !plan.wouldEmpty;
}

/**
 * The confirmation headline. Every number comes from the live plan, so the
 * sentence changes when the whitelist does — the operator cannot build muscle
 * memory for one number.
 */
export function transformConfirmSummary(plan: TransformCleanupPlan): string {
  return (
    `這會從白名單移除 ${plan.remove.length} 個變身態：啟用英雄 ${plan.before} → ${plan.after}。` +
    `⭐ 本體（transform.role === "base"）不受影響，變身照舊由技能觸發。` +
    `內容樹目前共宣告 ${plan.indexed} 個變身態。`
  );
}

/**
 * ⭐ THE PAIRING CHECK. `serverRemove` is what the platform's own dry run says
 * it would remove; `plan` is what this console derived from `/content/`.
 *
 * Returns null when they agree, otherwise the sentence to print in red. The
 * case this exists for is `armed === false`: the platform could not read
 * `content/champions/`, so its gate evicts nothing and its dry run is empty —
 * and an empty dry run is indistinguishable from 「已經乾淨了」 unless something
 * compares it with a second, independently computed answer.
 */
export function reconcileWithServer(
  plan: TransformCleanupPlan,
  server: { armed: boolean; remove: readonly string[]; indexed: number },
): string | null {
  if (!plan.ready) return null;
  if (!server.armed) {
    return (
      "⚠ 平台讀不到 content/champions/，伺服器端的變身態閘是**啞的**（它一個都不會擋）。" +
      `後台自己從 /content/ 算出 ${plan.indexed} 個變身態、其中 ${plan.remove.length} 個還勾在白名單上。` +
      "請確認 platform 容器的 CONTENT_DIR 掛載。"
    );
  }
  const mine = [...plan.remove.map((r) => r.id)].sort().join(",");
  const theirs = [...server.remove].sort().join(",");
  if (mine === theirs) return null;
  return (
    `⚠ 後台與平台算出來的變身態名單不一致：後台 ${plan.remove.length} 個（${mine || "無"}），` +
    `平台 ${server.remove.length} 個（${theirs || "無"}）。` +
    "兩邊讀的是同一棵內容樹的不同副本 — 通常代表映像與 content/ 版本不同步，請先確認部署。"
  );
}
