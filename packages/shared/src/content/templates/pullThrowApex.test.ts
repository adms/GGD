/**
 * GH#1060 —— `tpl-pull-throw.apexHeight` 標 `wc3h` 卻填了出貨節點的 GGD 值 1.2，
 * `num()` 再換算一次 ⇒ 弧頂 0.005 GGD（貼地滑行）。
 *
 * 兩條，都驗**尺**不驗數字：
 *   ① 展開後的弧頂 = default × `GGD_APEX_PER_WC3`（從單位換算推導，⛔ 不抄 1.2），
 *      而且與出貨 exemplar `godie-hapm.w.json` 的 `leap.apexHeight` 同一個**量級**
 *      （ratio ∈ (0.5, 2)；⛔ 不釘死相等 —— 那一格是 owner 會調的）。
 *   ② 全部模板：`wc3u`／`wc3h` 槽的 default／min／max 都是**整數** —— JASS 字面值
 *      （300.00 / 400.00）在原作那把尺上是整數；一個小數（1.2 · 7.33 · 4.95）幾乎一定是
 *      GGD 節點的值漏進了 wc3 槽。體驗層薄守衛，⛔ 不做突變。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import type { EffectDef } from "../../sim/effects/effect";
import { defaultParamsFor } from "./paramsSchema";
import { expand, GGD_APEX_PER_WC3 } from "./expand";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const TPL = join(ROOT, "content/ability-templates");
const templates: TemplateDoc[] = readdirSync(TPL)
  .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
  .map((f) => zTemplateDoc.parse(JSON.parse(readFileSync(join(TPL, f), "utf8"))));

describe("GH#1060 wc3 槽的 default 要在原作那把尺上", () => {
  it("① tpl-pull-throw：弧頂 = default × 1/250，且與出貨 godie-hapm.w 同一個量級", () => {
    const t = templates.find((x) => x.id === "tpl-pull-throw")!;
    const slot = t.params["apexHeight"]!;
    expect(slot.unit).toBe("wc3h");
    const leap = expand(t, defaultParamsFor(t)).effects.find((e) => e.kind === "leap") as
      | Extract<EffectDef, { kind: "leap" }>
      | undefined;
    expect(leap?.kind).toBe("leap");
    expect(leap!.apexHeight).toBeCloseTo((slot.default as number) * GGD_APEX_PER_WC3, 3);
    const hapm = JSON.parse(readFileSync(join(ROOT, "content/abilities/godie-hapm.w.json"), "utf8")) as {
      effects: { kind: string; apexHeight?: number }[];
    };
    const shipped = hapm.effects.find((e) => e.kind === "leap")!.apexHeight!;
    const ratio = leap!.apexHeight / shipped;
    expect(
      ratio,
      `模板弧頂 ${leap!.apexHeight} vs 出貨 exemplar ${shipped}：差 ${ratio}× —— 兩把尺混用（GH#1060 是 250×）`,
    ).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it("② 每一份模板：wc3u／wc3h 槽的 default／min／max 都是整數（小數＝GGD 值漏進來了）", () => {
    const bad: string[] = [];
    for (const t of templates)
      for (const [k, s] of Object.entries(t.params)) {
        if (s.unit !== "wc3u" && s.unit !== "wc3h") continue;
        for (const f of ["default", "min", "max"] as const) {
          const v = s[f];
          if (typeof v === "number" && !Number.isInteger(v)) bad.push(`${t.id}.${k}.${f} = ${v}（${s.unit}）`);
        }
      }
    expect(
      bad,
      `這些 wc3 槽填的是 GGD 尺度的值（小數）—— 改成原作 JASS 的字面值並在 origin 貼 j:行號，⛔ 不要改 unit 去遷就它:\n  ${bad.join("\n  ")}`,
    ).toEqual([]);
  });
});
