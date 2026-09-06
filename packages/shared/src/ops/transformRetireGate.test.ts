/**
 * transformRetireGate —— 下架一個**變身態**，⛔ 不可以留下一顆按了什麼都不會發生的按鈕。
 *
 * owner 2026-08-22（GH#552，逐字）：
 *
 * > 「**變身帶來許多問題**，因此我想要開啟變身態盡可能**下架**項目群組如下
 * >  godie-e007 / godie-h020 / godie-h02u / godie-n01c / godie-u010
 * >  => **沒有變更 3d model，效果及增益可以用效果狀態及增益狀態完美替換**」
 *
 * ── 這條守衛守的是哪兩份東西的**關係** ─────────────────────────────────────
 *
 *   `roster.json` 的下架清單  ↔  那個形態的**入口技能還剩下什麼**
 *
 * ⭐ owner 的後半句是這一條的全部內容：入口關掉之後，那支技能必須**自己**用
 * 狀態／增益把形態帶來的東西補回來。⛔ 只剩一個 `championForm` 的技能，在入口
 * 關掉的那一刻**逐位元組等於不存在** —— 而卡面上那段文字還在，那正是第一·五
 * 守則說的「說了但不會發生」。⚠️ 沒有任何既有的閘會紅：schema 收得下、
 * `content:build` 全綠、`roster:check` 十二條全綠，只有玩家按下去什麼都沒有。
 *
 * ── 入口技能怎麼**推導**出來（⛔ 不是一張手寫名單） ────────────────────────
 *
 * 兩條路取聯集，缺一條都會漏：
 *   ① 這支技能身上真的有 `championForm`（`to !== "base"`）—— 今天的四支。
 *   ② 它的名字等於本體 `transform.triggerAbility.name`（w3a 自己說的那支）——
 *      ⭐ 這一條是**未來**那一半：有人把 `championForm` 拿掉卻沒補替代品時，
 *      ① 會跟著消失（沒有 form 就不是入口了），而 ② 仍然指得到它。
 *      只有 ① 的話，這條守衛會在它最該紅的那一刻自己失明。
 *
 * ⚠️ 名字對不上**不是**缺陷：12-03 被 owner 重製成 [被動][暴擊] 之後，
 * `godie-ewar` 已經沒有任何入口技能（12-03 破凰之心。空破山 ≠ w3a 的
 * 「12-03 破凰之心-徒手空破山」）—— 那正是這張票要的**終局狀態**，所以它通過。
 *
 * 突變（2026-08-22，記在 commit）：把 `godie-nbbc.ex` 的 `applyBuff` 拿掉
 * ⇒ 紅，訊息指名 08-002 龍魔人。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { retiredChampionIdsFromDoc } from "../content/championRetirement";
import { resolveTemplateExpansion } from "../content/templates/resolve";
import { zTemplateDoc, type TemplateDoc } from "../content/schema/template";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TPL_DIR_FOR_SCAN = join(ROOT, "content/ability-templates");

// ⭐ GH#1067（2026-09-07）：變身技能的 `championForm` 現在住在 `template.params`（`tpl-transform`）——
//   讀原始 JSON 的掃描看不到它（實測：可達變身 14 → 9、`godie-nsjs` 整隻消失）。
//   ⇒ 用**出貨那一支**展開器攤開再掃，⛔ 不是加一張「哪些模板算變身」的手寫表。
const TPL_FOR_SCAN = new Map<string, TemplateDoc>(
  readdirSync(TPL_DIR_FOR_SCAN)
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => {
      const t = zTemplateDoc.parse(JSON.parse(readFileSync(join(TPL_DIR_FOR_SCAN, f), "utf8")));
      return [t.id, t] as const;
    }),
);
function expandForScan<T>(doc: T): T {
  const d = doc as unknown as Record<string, unknown>;
  if (!d || typeof d !== "object" || d["template"] === undefined) return doc;
  const res = resolveTemplateExpansion(d, TPL_FOR_SCAN);
  return res.ok ? (res.merged as unknown as T) : doc;
}


interface EffectLike {
  readonly kind?: string;
  readonly to?: string;
}
interface AbilityLike {
  readonly id?: string;
  readonly name?: string;
  readonly effects?: readonly EffectLike[];
  readonly passive?: unknown;
}
interface ChampionLike {
  readonly id?: string;
  readonly transform?: {
    readonly role?: string;
    readonly counterpartId?: string;
    readonly triggerAbility?: { readonly name?: string };
  };
}

/** owner 的「效果**狀態**及增益**狀態**」在 effect kind 上的樣子。 */
export const REPLACEMENT_KINDS: ReadonlySet<string> = new Set([
  "applyStatus",
  "applyBuff",
  "cycleBuff",
  "extendBuff",
]);

export interface RetiredFormAudit {
  /** 推導出來的入口技能 id —— 空集合代表探測器壞了，⛔ 不是「大家都收斂好了」。 */
  readonly triggers: readonly string[];
  /** 關掉入口之後就什麼都不剩的那幾支。 */
  readonly hollow: readonly string[];
}

/** 純函式：吃三份 doc，吐出「哪一支入口技能是空的」。 */
export function auditRetiredForms(
  retired: ReadonlySet<string>,
  champions: readonly ChampionLike[],
  abilities: readonly AbilityLike[],
): RetiredFormAudit {
  const byId = new Map(champions.filter((c) => c.id !== undefined).map((c) => [c.id!, c]));
  const triggers: string[] = [];
  const hollow: string[] = [];
  for (const altId of [...retired].sort()) {
    const alt = byId.get(altId);
    if (alt?.transform?.role !== "alternate") continue; // 只管變身態，⛔ 不管整位下架的英雄
    const baseId = alt.transform.counterpartId;
    if (baseId === undefined) continue;
    const w3xName = byId.get(baseId)?.transform?.triggerAbility?.name;
    for (const a of abilities) {
      if (a.id === undefined || !a.id.startsWith(`${baseId}.`)) continue;
      const fx = a.effects ?? [];
      const carriesForm = fx.some((e) => e.kind === "championForm" && e.to !== "base");
      if (!carriesForm && !(w3xName !== undefined && a.name === w3xName)) continue;
      triggers.push(a.id);
      const leftBehind =
        fx.some((e) => e.kind !== undefined && REPLACEMENT_KINDS.has(e.kind)) ||
        a.passive !== undefined;
      if (!leftBehind) {
        hollow.push(
          `${altId} 已下架，而它的入口 ${a.id}（${a.name ?? "?"}）除了 championForm ` +
            `之外沒有任何狀態／增益 —— 入口一關這顆按鈕就逐位元組等於不存在`,
        );
      }
    }
  }
  return { triggers, hollow };
}

const read = (rel: string): unknown => expandForScan(JSON.parse(readFileSync(join(ROOT, rel), "utf8")));
const docsIn = <T,>(rel: string): T[] =>
  readdirSync(join(ROOT, rel))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => read(`${rel}/${f}`) as T);

describe("GH#552 已下架的變身態", () => {
  it("它的入口技能必須留著狀態／增益，⛔ 不可以只剩一個 championForm", () => {
    const { triggers, hollow } = auditRetiredForms(
      retiredChampionIdsFromDoc(read("content/config/roster.json")),
      docsIn<ChampionLike>("content/champions"),
      docsIn<AbilityLike>("content/abilities"),
    );
    // ⚠️ 一支都推導不到 = 探測器死了。一支永遠回空的探測器，對「全都補好了」
    //    與「它根本沒在看」給出一模一樣的答案。
    expect(triggers.length, "推導不到任何入口技能 —— 是探測器壞了，⛔ 不是都收斂好了").toBeGreaterThan(0);
    expect(hollow, "下架的變身態留下了按了不會發生任何事的按鈕").toEqual([]);
  });
});
