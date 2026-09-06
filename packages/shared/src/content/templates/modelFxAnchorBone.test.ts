/**
 * GH#1063 —— `spawnModelFx.anchor:"bone"` 開了、說明寫「要配 attach＋boneOn」，
 * ⛔ 而 refine 不擋、`tpl-beam-roll` 的表單也開著 bone 卻沒有那兩格 ⇒ 載入照過、
 * 畫面上掛在哪裡沒有人保證（第一·五守則：說了但不一定發生）。
 *
 *   ① 載入側：bone 不帶 attach ⇒ 拒收並指名 `attach`；attach／boneOn 落單 ⇒ 指名那一格。
 *   ② 表單側：modelFx 家族每一份模板的 `anchor.values ⊆ modelFxAnchorsFor(t)`
 *      —— 合法值從 Zod 推導，bone 只在模板宣告了 `attach` 時才開（同 GH#1057 的 path）。
 *   ③ AC②：`tpl-beam-roll` 的每一個 anchor 值展開後都過載入驗證。
 *
 * MUTATION LOG（靈魂層一次）：拿掉 refine 的「anchor:"bone" 一定要有 attach」⇒ ① 紅。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { zEffectDef } from "../schema/effect";
import { defaultParamsFor } from "./paramsSchema";
import { expand, modelFxAnchorsFor } from "./expand";

const TPL = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content/ability-templates");
const templates: TemplateDoc[] = readdirSync(TPL)
  .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
  .map((f) => zTemplateDoc.parse(JSON.parse(readFileSync(join(TPL, f), "utf8"))));

const STATIC = { kind: "spawnModelFx", shape: "single", modelKey: "w3x.stock.revivehuman", path: "static", lifeSec: 2 };
const issuePaths = (node: unknown): string[] => {
  const r = zEffectDef.safeParse(node);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("GH#1063 anchor:bone ⇔ attach", () => {
  it("① 選 bone 不帶 attach ⇒ 載入拒收並指名 attach；attach／boneOn 落單 ⇒ 指名那一格", () => {
    expect(issuePaths({ ...STATIC, anchor: "bone" })).toContain("attach");
    expect(issuePaths({ ...STATIC, anchor: "bone", attach: "chest" })).toEqual([]);
    expect(issuePaths({ ...STATIC, anchor: "self", attach: "chest" })).toContain("attach");
    expect(issuePaths({ ...STATIC, boneOn: "victim" })).toContain("boneOn");
  });

  it("② modelFx 家族：anchor.values ⊆ modelFxAnchorsFor(t)（bone 只在宣告了 attach 時才開）", () => {
    const fam = templates.filter(
      (t) => t.status === "enabled" && expand(t, defaultParamsFor(t)).effects[0]?.kind === "spawnModelFx",
    );
    expect(fam.length, "量到的家族回空的 —— 偵測壞了").toBeGreaterThanOrEqual(10);
    const bad: string[] = [];
    for (const t of fam) {
      const slot = t.params["anchor"];
      if (slot === undefined) continue;
      const allowed = modelFxAnchorsFor(t) as readonly string[];
      for (const v of slot.values ?? [])
        if (!allowed.includes(v)) bad.push(`${t.id}.anchor=${v}：模板撐不起（撐得起的只有 ${allowed.join("/")}）`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("③ tpl-beam-roll 的每一個 anchor 值展開後都過載入驗證（AC②）", () => {
    const t = templates.find((x) => x.id === "tpl-beam-roll")!;
    for (const v of t.params["anchor"]!.values ?? []) {
      const node = expand(t, { ...defaultParamsFor(t), anchor: v }).effects[0];
      expect(issuePaths(node), `anchor=${v}`).toEqual([]);
    }
  });
});
