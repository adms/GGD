/**
 * ⭐【一顆 MDL ＝ 一個特效家族】GH#688 —— owner 2026-08-26 兩則裁決的閘。
 *
 * > 「因此光束砲家族應該共用特效模板 請你**仔細掃描所有使用相同 mdl 的蝗蟲群對應到的特效**」
 * > 「事實上有**兩個**英雄復活特效 mdl」
 *
 * ⚠️ 這一支問的是**兩個名詞的關係**，⛔ 不是「那個檔案裡有沒有那個字串」：
 * ①反查表是不是最新的（真的把產生器用 `--check` 跑起來，⛔ 不掃原始碼）
 * ②owner 那句「兩個」是不是**還**成立（從產物讀，⛔ 不抄字面 —— 抽取器哪天壞了要紅）
 * ③⭐ 承重：08-03 龍鬥氣砲咒文的出貨節點**真的擺得出一條線**。
 *
 * ⭐ ③ 為什麼是承重：2026-08-27 之前它是 `scaleAxis:[1,1,7.09]` —— 把**一具**龍息彈
 * 沿行進軸拉長 7 倍去湊出「一條線」的樣子。而原作 `j:28838` 是
 * `loop udg_Dragon = 1..10` 逐圈 `CreateNUnitsAtLoc( 1, 'e003', …, 150×i, facing )`：
 * 迴圈體裡**真的有 CreateNUnitsAtLoc** ⇒ 它是 10 具實體。
 * ⛔ 拉伸一具去像十具正是 owner 禁止的第三條路（「用現有參數湊一個看起來像的」），
 * 而它與正確實作在 schema／`content:build`／既有守衛面前**逐位元一樣綠**。
 *
 * 突變紀錄（整批唯一的一條，挑最承重的線）：
 *   · `content/abilities/godie-nbbc.e.json` 的 `count` 拿掉 → ③ 紅並指名
 *     「08-03 退回一具 —— 那條線在畫面上與『沒做』一模一樣」。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Abilities } from "../sim/content/registry";
import { registerAll } from "./registries";
import type { ContentStore } from "./store";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GEN = "tools/locust-census/mdlfamily.mjs";
const PRODUCT = join(REPO, "tools/locust-census/mdl-families.json");

interface Family {
  mdl: string;
  counts: { units: number; sites: number; w3aArt: number; jassFx: number; shipped: number };
}
const families = (): Family[] =>
  (JSON.parse(readFileSync(PRODUCT, "utf-8")) as { families: Family[] }).families;

const load = (coll: string): unknown[] =>
  readdirSync(join(REPO, "content", coll))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(REPO, "content", coll, f), "utf-8")) as unknown);

function modelFxNodes(node: unknown, out: Record<string, unknown>[] = []): Record<
  string,
  unknown
>[] {
  if (Array.isArray(node)) node.forEach((v) => modelFxNodes(v, out));
  else if (node !== null && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (rec["kind"] === "spawnModelFx") out.push(rec);
    Object.values(rec).forEach((v) => modelFxNodes(v, out));
  }
  return out;
}

describe("MDL 家族三通道反查 (GH#688)", () => {
  it("① 反查表是最新的 —— 真的跑產生器的 --check，⛔ 不是掃字串", () => {
    const r = spawnSync("node", [GEN, "--check"], { cwd: REPO, encoding: "utf-8" });
    expect(
      r.status,
      `${GEN} --check 說反查表過期:\n${r.stderr}\n→ 跑 node ${GEN} 然後 git add`,
    ).toBe(0);
  });

  it("② owner 的「兩個英雄復活特效 mdl」仍然量得到 —— 從產物讀，⛔ 不抄字面", () => {
    const byId = new Map(families().map((f) => [f.mdl, f]));
    const used = (k: string): number => {
      const f = byId.get(k);
      return f ? f.counts.units + f.counts.w3aArt + f.counts.jassFx : 0;
    };
    // ⭐ 全 5 顆 stock 復活特效裡,**只有這兩顆**在這張地圖上有人用（⛔ 不是我挑的兩顆）。
    const revive = ["revivehuman", "revivedemon", "reviveorc", "reviveundead", "revivenightelf"];
    expect(
      revive.filter((k) => used(k) > 0).sort().join(","),
      "owner 2026-08-26「事實上有兩個英雄復活特效 mdl」—— 這一格變了代表抽取器或地圖變了",
    ).toBe("revivedemon,revivehuman");
  });

  it("★ ③ 08-03 龍鬥氣砲咒文真的擺出一條線（j:28838 的 10 具），⛔ 不是拉長一具", () => {
    registerAll({
      all: (c: string) =>
        ({ abilities: load("abilities"), config: load("config"), "ability-templates": load("ability-templates") })[
          c
        ] ?? [],
    } as ContentStore);

    // ⭐ 變身對子兩邊一起驗 —— 只動一邊的話 `abilityCodeParityForms` 才會紅,
    //    而**演出**兩邊不一致沒有任何東西會叫（第〇·五守則的變身那一條）。
    for (const id of ["godie-nbbc.e", "godie-n01c.e"]) {
      const node = modelFxNodes(Abilities.tryGet(id as never)).find(
        (n) => n["modelKey"] === "w3x.stock.reddragonmissile",
      );
      expect(node, `${id} 沒有龍息彈節點 —— 08-03 的 e003 整個不見了`).toBeDefined();
      expect(
        Number(node!["count"] ?? 1),
        `${id} 退回一具 —— 原作 j:28838 是 loop i=1..10 的 CreateNUnitsAtLoc,` +
          "而一具在畫面上與「沒做」一模一樣",
      ).toBeGreaterThan(1);
      expect(
        Number(node!["spacing"] ?? 0),
        `${id} 有 count 卻沒有 spacing ⇒ N 具疊在同一點,退化成一具`,
      ).toBeGreaterThan(0);
      // ⛔ 拉伸一具去「像」一條線 —— 那是被禁的第三條路,而它看起來完全正常。
      expect(
        node!["scaleAxis"],
        `${id} 又用 scaleAxis 把一具拉長去假裝一條線（owner 2026-08-26 禁止的第三條路）`,
      ).toBeUndefined();
    }
  });
});
