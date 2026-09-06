/**
 * GH#1065 —— `mergeExpansion` 的三個洞（#993 量到：25 支「形狀對得上模板卻轉不了」裡 15 支
 * 卡在同一個「先全刪、只放回展開有發的」迴圈）。每一洞拿 #993 點名的技能一支，走**出貨的**
 * 那條路（骨架＋綁定 → `resolveTemplateExpansion` → `zAbilityDoc`），⛔ 不自己 merge。
 * ⚠️ 行為半（applyBuff 的 modifiers／duration）**凍成字面值**：這幾份文件下一輪就會被
 *    `templatize.py` 轉成 `effects:[]`，讀磁碟當夾具就是 expand.test.ts 記過的失敗形態⑤。突變紀錄見 `docs/_reports/1065_temp_*.md`。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zAbilityDoc } from "../schema/ability";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { expand } from "./expand";
import { defaultParamsFor } from "./paramsSchema";
import { resolveTemplateExpansion } from "./resolve";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const TEMPLATES = new Map<string, TemplateDoc>(
  readdirSync(join(CONTENT, "ability-templates"))
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => zTemplateDoc.parse(JSON.parse(readFileSync(join(CONTENT, "ability-templates", f), "utf8"))))
    .map((t) => [t.id, t] as const),
);
type Doc = Record<string, unknown>;
const read = (id: string): Doc => JSON.parse(readFileSync(join(CONTENT, "abilities", `${id}.json`), "utf8")) as Doc;
const buffSelf = (id: string, modifiers: Doc[], duration: number): Doc => ({
  ...read(id), effects: [], template: { ref: "tpl-buff-self", params: { modifiers, duration } },
});
/** 骨架 → 出貨路徑 → Zod；拒絕時回傳訊息（⛔ 不 throw，讓斷言印得出是哪一洞）。 */
function ship(doc: Doc): { parsed: Doc | null; why: string; merged: Doc } {
  const res = resolveTemplateExpansion(doc, TEMPLATES);
  if (!res.ok) return { parsed: null, why: res.failure.message, merged: {} };
  const p = zAbilityDoc.safeParse(res.merged);
  const why = p.success ? "" : p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
  return { parsed: p.success ? (p.data as unknown as Doc) : null, why, merged: res.merged };
}

describe("GH#1065 —— mergeExpansion 的三個洞，各拿 #993 點名的一支重現", () => {
  it("① 42-00 魔法障壁（PASSIVE＋innateKind:active）接 tpl-buff-self：骨架與合併結果都過 zAbilityDoc，innateKind 仍是 active", () => {
    const mods = [{ stat: "armor", op: "flat", value: 10 }];
    const doc = buffSelf("godie-n003.passive", mods, 9);
    expect([doc["slot"], doc["innateKind"]]).toEqual(["PASSIVE", "active"]);
    const onDisk = zAbilityDoc.safeParse(doc); // 門 (b)：磁碟骨架要過 content:build 的嚴格驗證
    expect(onDisk.success, `骨架被 schema 拒：${onDisk.success ? "" : onDisk.error.issues[0]?.message}`).toBe(true);
    const { parsed, why } = ship(doc); // 門 (a)：merge 不可以把 innateKind 刪掉
    expect(parsed, `展開後被拒 —— ${why}`).not.toBeNull();
    expect(parsed!["innateKind"]).toBe("active");
    expect(parsed!["effects"]).toEqual([{ kind: "applyBuff", modifiers: mods, duration: 9 }]);
  });

  it("② 58-02 鋼鐵尾巴（effects＋passive 並存）接 tpl-buff-self：文件層 passive 逐位元活下來", () => {
    const mods = [{ stat: "as", op: "flat", value: 0.25 }];
    const doc = buffSelf("godie-o02l.w", mods, 3);
    expect(doc["passive"], "夾具前提：磁碟上的文件帶 passive 鉤子").toBeDefined();
    const { parsed, why } = ship(doc);
    expect(parsed, `展開後被拒 —— ${why}`).not.toBeNull();
    // 與「手寫形」走同一個 zAbilityDoc 比（schema 預設值兩邊都有，⛔ 不算差異）
    const hand = zAbilityDoc.parse({ ...doc, effects: [{ kind: "applyBuff", modifiers: mods, duration: 3 }], template: undefined });
    expect([parsed!["passive"], parsed!["effects"]]).toEqual([hand.passive, hand.effects]);
  });

  it("③ tpl-blink-strike 的 params.range 要寫回；模板沒發 range 時文件自己的值站著", () => {
    const n01c = read("godie-n01c.w");
    const binding = n01c["template"] as { ref: string; params: Doc };
    expect(binding.ref).toBe("tpl-blink-strike");
    const nine = { ...n01c, effects: [], template: { ref: binding.ref, params: { ...binding.params, range: 9 } } };
    expect(ship(nine).merged["range"], "params.range=9 而文件層寫 6 ⇒ 合併結果要是 9（⛔ 不是空宣稱）").toBe(9);
    const silent = { ...buffSelf("godie-n003.passive", [{ stat: "armor", op: "flat", value: 10 }], 9), range: 6 };
    expect(ship(silent).merged["range"], "buff-self 不發 range ⇒ 文件的 6 不可以被刪").toBe(6);
  });

  it("⭐ 閘：每一張 enabled 模板要嘛發 effects、要嘛宣告自己 passive —— 否則 refineInnate 對綁定骨架的放行會漏一個方向", () => {
    const bad = [...TEMPLATES.values()]
      .filter((t) => t.status === "enabled")
      .map((t) => [t.id, expand(t, defaultParamsFor(t))] as const)
      .filter(([, ex]) => ex.effects.length === 0 && ex.innateKind !== "passive")
      .map(([id]) => id);
    expect(bad, "展開後 effects 空、又沒說自己是 passive ⇒ innateKind:active 的骨架會帶著空 effects 溜過 schema").toEqual([]);
  });
});
