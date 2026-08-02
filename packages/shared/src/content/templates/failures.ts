/**
 * 模板展開失敗的現場紀錄 — the module-level ledger `registerAll` writes into when
 * it degrades a skill instead of taking the whole content set down with it.
 *
 * SHAPED AFTER `apps/client/src/ui/hudErrorModel.ts` ON PURPOSE, and for the same
 * reason its header gives: 「出事的當下沒有人開著 devtools」. A `console.error` is
 * gone the moment the tab is closed, and the one person who could act on it
 * (owner, mid-match, on a phone) is never looking at it. A list that survives the
 * boot is the only artefact an after-the-fact question can be asked of.
 *
 * ⚠️ THE COUNTERPART FAILURE THIS EXISTS TO PREVENT is 靜默降級, the shape that
 * has hurt this project most: content half-dies and looks exactly like content
 * that is fine. So a degrade writes THREE signals, not one:
 *   1. this ledger (queryable after the fact, from anywhere in the process);
 *   2. one aggregated `console.error` line per `registerAll` — the boot-log line
 *      the 30-second deploy smoke test can grep for, next to
 *      `[client] content loaded: …`;
 *   3. the degraded ability's own tooltip text, which is the only one of the
 *      three a PLAYER can see (see `DEGRADED_ABILITY_NOTE` in registries.ts).
 */

/** One skill that failed to expand and was registered in degraded form. */
export interface TemplateExpansionFailure {
  readonly abilityId: string;
  /**
   * Which of the ability's TWO copies this was. An ability lives twice (the
   * standalone `content/abilities/<id>.json` and the copy embedded in its
   * champion's slot) and BOTH are expanded at registration, so one broken doc
   * normally produces two records. Losing that distinction would make
   * 「只有 standalone 壞了」 indistinguishable from 「兩邊都壞了」, which is the
   * difference between a mirror drift and a missing template.
   */
  readonly where: "standalone" | "embedded";
  /** set only on `where: "embedded"` */
  readonly championId?: string;
  /** set only on `where: "embedded"` */
  readonly slot?: string;
  readonly phase: "binding" | "ref" | "expand";
  /** every template ref the binding named */
  readonly refs: readonly string[];
  /** the refs that resolved to nothing */
  readonly missingRefs: readonly string[];
  readonly message: string;
  /**
   * How many EffectDefs the degraded registration kept — i.e. what the skill
   * still does. 0 means it does nothing at all, which is the normal case for a
   * template-authored doc (the design stores `effects: []` on disk and expands
   * at load). Recorded as a number rather than assumed, because the answer
   * decides whether this is「技能變弱」or「技能整個沒了」.
   */
  readonly degradedEffectCount: number;
}

/**
 * Ledger ceiling.
 *
 * ⚠️ 200, not 20 like the HUD log, because these failures arrive in FAMILIES:
 * one renamed template ref breaks every ability that references it, and the SET
 * of victims is the diagnosis (「哪一張模板不見了」). A cap of 20 would truncate
 * exactly the evidence. 200 still bounds a pathological content set.
 */
export const TEMPLATE_FAILURE_LOG_CAP = 200;

const log: TemplateExpansionFailure[] = [];

/**
 * Record failures.
 *
 * Keeps the OLDEST on overflow, same call as `recordHudError`: the first
 * failures name the first broken template, and later ones are usually its
 * downstream victims.
 */
export function recordTemplateExpansionFailures(
  failures: readonly TemplateExpansionFailure[],
): void {
  for (const f of failures) {
    if (log.length >= TEMPLATE_FAILURE_LOG_CAP) break;
    log.push(f);
  }
}

/** Everything recorded so far (read-only copy). */
export function templateExpansionFailures(): readonly TemplateExpansionFailure[] {
  return log.slice();
}

/** Clear (tests, and a future「回報問題」button). */
export function clearTemplateExpansionFailures(): void {
  log.length = 0;
}

/**
 * ONE line, greppable, naming the missing templates and how many skills each
 * took down. This is what goes to `console.error` — the deploy smoke test reads
 * boot-log lines, and a line that only says「有錯誤」sends the reader back to a
 * console they no longer have.
 */
export function templateExpansionFailureSummary(
  failures: readonly TemplateExpansionFailure[],
): string {
  if (failures.length === 0) return "";
  const abilities = [...new Set(failures.map((f) => f.abilityId))].sort();
  const missing = [...new Set(failures.flatMap((f) => f.missingRefs))].sort();
  const dead = failures.filter((f) => f.degradedEffectCount === 0).length;
  const parts = [
    `${abilities.length} 支技能的模板展開失敗，已個別降級（其餘內容照常註冊）`,
    `技能: ${abilities.slice(0, 10).join(", ")}${abilities.length > 10 ? ` …+${abilities.length - 10}` : ""}`,
  ];
  if (missing.length > 0) parts.push(`找不到的模板: ${missing.join(", ")}`);
  parts.push(`其中 ${dead} 份降級後完全沒有效果`);
  return parts.join(" · ");
}
