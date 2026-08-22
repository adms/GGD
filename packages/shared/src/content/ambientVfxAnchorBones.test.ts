/**
 * GH#564 M1 —— 常駐綁定指名的 `anchorBone` 要**真的長在那具 glb 上**。
 *
 * ⚠️ **兩個名詞之間的關係**：三份東西各自都是好的，壞掉的是「這根骨頭在這具身體
 * 上」。骨頭打錯時 `AmbientVfx.tick` 掃 15 秒後**靜靜退回 root**，緞帶從腳底冒出來
 * 而沒有任何東西會紅。⛔ 逐位元讀 glTF JSON chunk（⛔ 不掃字串，失敗形態⑥）；
 * 名單**從出貨 bindings 推導** —— 加一列自動被驗到，⛔ 不必改測試。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = <T,>(rel: string): T => JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as T;

/** glb 的 glTF JSON chunk → 節點名清單（⛔ 不是字串比對，是真的解容器）。 */
function glbNodeNames(rel: string): string[] {
  const buf = readFileSync(join(ROOT, rel));
  expect(buf.readUInt32LE(0), `${rel} 不是 glb`).toBe(0x46546c67);
  const total = buf.readUInt32LE(8);
  for (let at = 12; at + 8 <= total; at += 8 + buf.readUInt32LE(at)) {
    const len = buf.readUInt32LE(at);
    if (buf.readUInt32LE(at + 4) !== 0x4e4f534a) continue;
    const g = JSON.parse(buf.toString("utf8", at + 8, at + 8 + len)) as { nodes?: { name?: string }[] };
    return (g.nodes ?? []).map((n) => n.name ?? "");
  }
  return [];
}

/** `AmbientVfx.findBoneNode` 的規則，逐字：先 `===`，再 `endsWith`（glb 實體化會加前綴）。 */
const resolves = (names: readonly string[], bone: string): boolean =>
  names.some((n) => n === bone) || names.some((n) => n.endsWith(bone));

describe("config.ambient-vfx@1 的每一根 anchorBone（GH#564）", () => {
  const bindings = read<{ bindings: Record<string, { vfx: string }[]> }>(
    "content/config/ambient-vfx.json",
  ).bindings;
  const nodeCache = new Map<string, string[]>();

  it("綁在 modelKey 上的每一列，骨頭都真的在那具 glb 裡", () => {
    let checked = 0;
    for (const [key, list] of Object.entries(bindings)) {
      const modelRel = `content/models/${key}.json`;
      if (!existsSync(join(ROOT, modelRel))) continue; // championId 鍵 —— 下一條在管
      const glbPath = read<{ glbPath: string }>(modelRel).glbPath;
      for (const { vfx } of list) {
        const docRel = `content/vfx/${vfx}.json`;
        if (!existsSync(join(ROOT, docRel))) continue; // SOFT ref（未著作）
        const bone = read<{ anchorBone?: string }>(docRel).anchorBone;
        if (bone === undefined) continue; // 掛 root，沒有骨頭要驗
        const names =
          nodeCache.get(glbPath) ??
          nodeCache.set(glbPath, glbNodeNames(join("content", glbPath))).get(glbPath)!;
        expect(
          resolves(names, bone),
          `${key} → ${vfx}：${glbPath} 裡沒有 ${bone!}（找得到的有 ${names.filter(Boolean).join(" · ")}）`,
        ).toBe(true);
        checked++;
      }
    }
    expect(checked, "一根骨頭都沒驗到 —— 這條守衛在空轉").toBeGreaterThan(0);
  });

  it("⛔ 帶 anchorBone 的粒子／緞帶不可以綁在 championId 上（AmbientVfx 只查 modelKey）", () => {
    for (const [key, list] of Object.entries(bindings)) {
      if (existsSync(join(ROOT, `content/models/${key}.json`))) continue;
      for (const { vfx } of list) {
        const docRel = `content/vfx/${vfx}.json`;
        if (!existsSync(join(ROOT, docRel))) continue;
        const doc = read<{ schema: string; anchorBone?: string }>(docRel);
        expect(
          doc.schema === "attachment@1",
          `${key} → ${vfx}：${doc.schema} 綁在 championId 上是**靜默無效**的 ——` +
            ` GameApp 只有 attachment@1 那一條路查 championId，AmbientVfx.attach 只拿得到 modelKey`,
        ).toBe(true);
      }
    }
  });
});
