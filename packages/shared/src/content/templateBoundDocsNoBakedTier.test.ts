/**
 * GH#1079 —— 接了模板的文件，⛔ 不可以再帶一格**出貨 merge 會丟掉**的字面值（第〇·四守則）。
 *
 * 量到的（2026-09-06）：`godie-h02r.q`／`godie-hgam.q` 接 `tpl-periodic-field`（`params.radiusTier:"小"`，
 * `anchor:"caster"` ⇒ 展開**不發** `radius`），⛔ 而文件層還帶著 `radius:4.5` —— `mergeExpansion` 把它當
 * 形狀鍵整格刪掉 ⇒ 那一格**零讀者**：改它什麼都不會發生；而只要 `radius` 哪天搬去可組合鍵那一組，
 * 兩支技能就無聲長出一個 4.5 的圈。⚠️ 級距的住處是 `params.radiusTier`（這一支⛔ 不動它）。
 *
 * 兩個方向（⛔ 一把只驗單邊的尺不算自證過）：
 *   ① 量尺：模板不發 `radius` 的每一份文件，把文件層 `radius` 改成別的數 ⇒ 註冊表**逐位元不變**；
 *      控制組：**沒接模板**、也沒 `radiusTier` 的文件（它的 `radius` 真的有讀者）改了 ⇒ 註冊表**會變**。
 *   ② 閘：接了模板的 standalone 文件，文件層不可以有一格出貨 merge 之後**消失**的鍵。
 *      ⭐ 從出貨 merge 推導（`keys(doc) − keys(merged)`），⛔ 不抄 SHAPE_KEYS、⛔ 不記 id。
 *      反方向：沒接模板的文件不受管（它們的 `radius` 是合法的手寫值）。
 *
 * 突變紀錄：把 `"radius": 4.5` 加回 `godie-h02r.q.json` ⇒ ② 紅並指名它（＝修之前跑這一支的結果，
 * 兩份都被點名）；① 在修之前、修之後都綠 —— 那一格本來就零讀者。
 *
 * ⚠️ 這一支點名的 `content/abilities/*.json` 被 `castderive:build:raw`／`tiers:apply` 就地正規化 ——
 *    先 `bash scripts/genguard.sh <path>`；內嵌鏡射（`content/champions`）由 `tiers:apply` 的 `_mirror` 跟著刪。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Abilities } from "../sim/content/registry";
import { registerAll } from "./registries";
import { zTemplateDoc } from "./schema/template";
import type { ContentStore } from "./store";
import { hasTemplateBinding, resolveTemplateExpansion } from "./templates/resolve";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
type Doc = Record<string, unknown>;
const load = (coll: string): Doc[] =>
  readdirSync(join(CONTENT, coll))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(CONTENT, coll, f), "utf8")) as Doc);
const abilities = load("abilities");
const configDocs = load("config");
const templateDocs = load("ability-templates");
const templates = new Map(templateDocs.map((d) => zTemplateDoc.parse(d)).map((t) => [t.id, t] as const));
const bound = abilities.filter(hasTemplateBinding);
const id = (d: Doc): string => String(d["id"]);
const expansionOf = (d: Doc) => {
  const r = resolveTemplateExpansion(d, templates);
  return r.ok ? r : null; // 展不開的另有守衛（registries 的 TemplateExpansionFailure）
};
/** 走**出貨的**註冊路徑（展開 → 級距解析），回傳每一支的註冊結果（深拷貝，⛔ 不共用參照）。 */
function registered(docs: Doc[]): Map<string, unknown> {
  const by: Record<string, Doc[]> = { abilities: docs, config: configDocs, "ability-templates": templateDocs };
  registerAll({ all: (c: string) => by[c] ?? [] } as ContentStore);
  return new Map(docs.map((d) => [id(d), structuredClone(Abilities.tryGet(id(d) as never))]));
}

describe("GH#1079 —— 模板已宣告級距槽的文件，文件層不可以再烘一格零讀者的字面值", () => {
  it("① 量尺：模板不發 radius ⇒ 文件層 radius 零讀者；沒接模板的 radius 才有讀者（控制組）", () => {
    const probes = bound.filter((d) => expansionOf(d)?.expansion.radius === undefined);
    const control = abilities.find(
      (d) => !hasTemplateBinding(d) && id(d).startsWith("godie-") && typeof d["radius"] === "number" && d["radiusTier"] === undefined,
    );
    expect(probes.length, "母體空掉 ＝ 量尺失明").toBeGreaterThan(10);
    expect(control, "找不到一份 radius 真的有讀者的文件 —— 量尺校不了").toBeDefined();
    const base = registered(abilities);
    const poked = new Set<Doc>([...probes, control!]);
    const mutated = registered(abilities.map((d) => (poked.has(d) ? { ...d, radius: 7.25 } : d)));
    for (const d of probes)
      expect(mutated.get(id(d)), `${id(d)}: 文件層 radius 改了而註冊表跟著變 —— 它有讀者，閘②的前提不成立`).toEqual(base.get(id(d)));
    expect(mutated.get(id(control!)), "控制組：沒接模板的 radius 改了註冊表卻沒變 —— 量尺瞎了").not.toEqual(base.get(id(control!)));
  });

  it("② 閘：接了模板的 standalone 文件，文件層不可以帶一格出貨 merge 會丟掉的值", () => {
    expect(bound.length, "母體空掉 ＝ 量尺失明").toBeGreaterThan(50);
    expect(
      abilities.some((d) => !hasTemplateBinding(d) && typeof d["radius"] === "number"),
      "反方向的母體：沒接模板而帶 radius 的文件要存在 —— 它們刻意不受這條閘管",
    ).toBe(true);
    const bad: string[] = [];
    for (const d of bound) {
      const r = expansionOf(d);
      if (!r) continue;
      for (const k of Object.keys(d).filter((k) => !(k in r.merged))) {
        const slot = r.refs.map((ref) => templates.get(ref)).find((t) => t !== undefined && `${k}Tier` in t.params);
        bad.push(
          `${id(d)}: 文件層 ${k}=${JSON.stringify(d[k])} 在出貨 merge 之後消失（零讀者）` +
            (slot ? ` —— 級距住處是 ${slot.id}.params.${k}Tier，⛔ 不可以再烘一格字面值` : ""),
        );
      }
    }
    expect(bad, "把那一格從文件拿掉（先 genguard；內嵌鏡射由 tiers:apply 跟著刪）").toEqual([]);
  });
});
