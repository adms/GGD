/**
 * GH#1024 A1／A3／A5 —— 出貨英雄卡對「出身模板」的三條閘（讀**出貨的那一份**，失敗形態⑤）。
 *
 *  A1 十出身的值域：`ORIGINS`（schema 的 enum 來源）⇔ `content/config/origin-routes.json` 的鍵，
 *     連順序一起鎖。⚠️ 誠實：值域是 TS 常數鏡射那份表，⛔ 不是 build 時從 JSON 推導 ——
 *     `packages/shared/tsconfig.json` 的 `rootDir: "."` 擋掉跨 package 的 JSON import；
 *     兩邊漂了這一條紅，訊息指名哪一邊多／少了什麼。
 *  A3 `statOverrides` 覆寫的屬性必須在 `appliesTo` 裡 —— 覆寫一項沒被正規化的屬性，
 *     卡面就說了一件不會發生的事（第一·五守則）。
 *  A5 每一份英雄卡要嘛有 `origin`、要嘛在豁免表裡帶理由；⭐ 反方向也掃：豁免列的文件要存在、
 *     前提（kind）要仍成立、量到的推導出身要仍相等、而且它**還沒有** origin（有了就是過期列）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import exemptions from "./championOrigin.exemptions.json";
import { ORIGINS, isOrigin, originOf, statNormalizationFromDoc } from "./statNormalization";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const readJson = (p: string): Record<string, unknown> => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
const champions = (): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    readdirSync(join(CONTENT, "champions"))
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => [f.slice(0, -5), readJson(join(CONTENT, "champions", f))]),
  );
type Row = { kind: string; derivedOrigin: string; counterpartId: string | null; counterpartOrigin: string | null };
const rows = exemptions.exemptions as Record<string, Row>;

describe("出身模板 —— 出貨英雄卡的三條閘 (GH#1024)", () => {
  it("A1 十出身：ORIGINS ⇔ origin-routes.json 的鍵（含順序）", () => {
    const table = readJson(join(CONTENT, "config/origin-routes.json"))["origins"] as Record<string, unknown>;
    expect(Object.keys(table)).toEqual([...ORIGINS]);
  });

  it("A5 每一份英雄卡：有 origin，或在豁免表裡帶理由（兩個方向）", () => {
    const docs = champions();
    expect(Object.keys(docs).length).toBeGreaterThan(50); // 守住量尺：真的讀到了整棵樹
    const missing = Object.entries(docs)
      .filter(([id, d]) => !isOrigin(d["origin"]) && rows[id] === undefined)
      .map(([id]) => id);
    expect(missing, "沒有 origin 也不在 championOrigin.exemptions.json 的英雄").toEqual([]);

    const stale: string[] = [];
    for (const [id, row] of Object.entries(rows)) {
      const d = docs[id];
      if (!d) { stale.push(`${id}: 文件不存在`); continue; }
      if (isOrigin(d["origin"])) stale.push(`${id}: 已經有 origin=${String(d["origin"])} —— 刪掉這一列`);
      const xf = d["transform"] as { role?: unknown; counterpartId?: unknown } | undefined;
      if (row.kind === "alternate-form") {
        if (xf?.role !== "alternate") stale.push(`${id}: 前提不成立（transform.role≠alternate）`);
        const cp = typeof xf?.counterpartId === "string" ? docs[xf.counterpartId] : undefined;
        if ((cp?.["origin"] ?? null) !== row.counterpartOrigin) stale.push(`${id}: 本體出身變了（表 ${row.counterpartOrigin}）`);
      } else if (row.kind === "authored-skeleton") {
        if ((d["attributes"] as { source?: unknown } | undefined)?.source !== "authored") stale.push(`${id}: 前提不成立（不是 authored）`);
      } else stale.push(`${id}: 不認得的 kind ${row.kind}`);
      if (originOf(d as never) !== row.derivedOrigin) stale.push(`${id}: 推導出身變了（表 ${row.derivedOrigin}，現在 ${originOf(d as never)}）—— 理由要重讀`);
    }
    expect(stale, "豁免表過期列").toEqual([]);
  });

  it("A3 statOverrides 只能覆寫 appliesTo 裡的屬性（否則卡面說了不會發生的事）", () => {
    const norm = statNormalizationFromDoc(readJson(join(CONTENT, "config/stat-normalization.json")));
    const dead: string[] = [];
    for (const [id, d] of Object.entries(champions())) {
      for (const key of Object.keys((d["statOverrides"] as Record<string, unknown> | undefined) ?? {})) {
        if (!(norm.appliesTo as readonly string[]).includes(key)) dead.push(`${id}.statOverrides.${key}`);
      }
    }
    expect(dead, "覆寫了沒有被正規化的屬性").toEqual([]);
  });
});
