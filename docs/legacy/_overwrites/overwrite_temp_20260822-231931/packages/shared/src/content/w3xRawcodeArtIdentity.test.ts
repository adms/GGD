/**
 * GH#547 —— 同一個 w3x rawcode 的兩份鏡像**必須長得一樣**。
 *
 * owner 2026-08-22:「一堆攻擊投射物 衝擊波特效都沒移植 請儘快從 w3x 補上」
 *
 * 量到的（2026-08-22）：CONFIRMED join 且有 ≥2 份活著文件的 rawcode 共 **97 個**，
 * 其中 **61 個**的兩份文件指向**不同的特效**（59 個 `vfxKey`、4 個 `projectileId`）。
 * ⭐ 那不是「還沒移植」，是**同一支技能在兩位英雄身上長成兩個樣子** —— 例如
 * `A04R 04-03 龍破斬` 一邊是 `fx.prim.fire.beam`、另一邊是 `fx.prim.void.slash`。
 * 根因：原始指派是**逐份文件**用名稱啟發式做的（`tools/w3x-import/w3xlib/drafts.py::_vfx_for`），
 * 而 rawcode 才是這支技能的身分（`ggd-naming-layer`：名字可以改，編號/rawcode 不行）。
 *
 * ⛔ 這條**不是**判準（「要記得兩邊一起改」）—— 那種東西這個 repo 已經失效過五次。
 * 它是一條棘輪：基準線 JSON 只准變短。多一列 = 新的分岔；少一列而沒更新基準線 = 修好了，
 * 把那一列刪掉。⚠️ 逐項理由寫在基準線裡，⛔ 不是「還沒收」而是能被反駁的一句話。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import baseline from "./w3xRawcodeArtIdentity.baseline.json";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

type Doc = Record<string, unknown>;
const read = (p: string): Doc => JSON.parse(readFileSync(p, "utf-8")) as Doc;

/** 這份文件射出去的每一顆投射物（`spawnProjectile` 可以埋在任意深度）。 */
function projectileIds(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const v of node) projectileIds(v, out);
  else if (node && typeof node === "object") {
    const n = node as Doc;
    if (n.kind === "spawnProjectile" && typeof n.projectileId === "string") out.push(n.projectileId);
    for (const v of Object.values(n)) projectileIds(v, out);
  }
  return out;
}

describe("w3x rawcode ↔ 特效身分 (#547)", () => {
  it("同一個 rawcode 的兩份鏡像指向同一份特效，分岔只准照基準線變短", () => {
    const prov = read(join(CONTENT_DIR, "assets/vfx/w3x-ability-provenance.json"))
      .abilities as Record<string, { rawcodes?: string[]; joinConfidence?: string }>;
    const art = new Map<string, { vfxKey: unknown; proj: string }>();
    for (const f of readdirSync(join(CONTENT_DIR, "abilities"))) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const doc = read(join(CONTENT_DIR, "abilities", f));
      art.set(f.slice(0, -5), { vfxKey: doc.vfxKey, proj: projectileIds(doc.effects).sort().join(",") });
    }
    const byRawcode = new Map<string, string[]>();
    for (const [aid, p] of Object.entries(prov)) {
      if (!art.has(aid) || p.joinConfidence !== "CONFIRMED") continue;
      for (const rc of p.rawcodes ?? []) byRawcode.set(rc, [...(byRawcode.get(rc) ?? []), aid]);
    }

    const divergent = new Set<string>();
    for (const [rc, aids] of byRawcode) {
      if (aids.length < 2) continue;
      const rows = aids.map((a) => art.get(a)!);
      const same = (k: "vfxKey" | "proj") => rows.every((r) => r[k] === rows[0]![k]);
      if (!same("vfxKey") || !same("proj")) divergent.add(rc);
    }

    const known = new Set(Object.keys(baseline.rawcodes));
    const added = [...divergent].filter((rc) => !known.has(rc)).sort();
    const fixed = [...known].filter((rc) => !divergent.has(rc)).sort();
    expect(
      [
        ...added.map((rc) => `⛔ ${rc} 新的分岔 —— 同一支技能在兩位英雄身上長得不一樣，兩邊一起改`),
        ...fixed.map((rc) => `✅ ${rc} 已經一致 —— 把它從 w3xRawcodeArtIdentity.baseline.json 刪掉`),
      ].join("\n"),
    ).toBe("");
  });
});
