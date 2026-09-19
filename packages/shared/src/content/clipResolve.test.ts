/**
 * ⭐ GH#1261 —— 預覽挑動作必須與比賽同一套規則。三條各關一個方向：
 * ①票上那四隻（⛔ 只有指名比對挑不到）②全部出貨模型六格都挑得到
 * ③與**比賽那一份**逐字相同（⛔ 不是相信註解 —— 第三守則）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIP_NAME_ALIASES, pickClip, pickClipMap, type NamedClip } from "./clipResolve";
import { ANIM_STATES } from "./animPulse";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT = join(ROOT, "content");

/** glb 的 AnimationGroup 名 —— 只讀 JSON chunk，⛔ 不必開 Babylon。 */
function glbClipNames(rel: string): NamedClip[] {
  let buf: Buffer;
  try { buf = readFileSync(join(CONTENT, rel)); } catch { return []; } // 素材走 S3 ⇒ 跳過
  const total = buf.readUInt32LE(8);
  for (let off = 12, len = 0; off + 8 <= total; off += 8 + len) {
    len = buf.readUInt32LE(off);
    if (buf.readUInt32LE(off + 4) !== 0x4e4f534a) continue;
    const j = JSON.parse(buf.subarray(off + 8, off + 8 + len).toString("utf-8"));
    return (j.animations ?? []).map((a: { name?: string }) => ({ name: a.name ?? "" }));
  }
  return [];
}

type Shipped = { id: string; clipMap: Record<string, string>; clips: NamedClip[] };

/** 出貨的 model 文件 ＋ 讀得到、且**真的有剪輯**的 glb（道具／爆炸沒有剪輯，不歸這條管）。 */
const MODELS: Shipped[] = readdirSync(join(CONTENT, "models")).sort()
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => {
    const d = JSON.parse(readFileSync(join(CONTENT, "models", f), "utf-8")) as
      { glbPath?: string; clipMap?: Record<string, string> };
    return { id: f, clipMap: d.clipMap ?? {}, clips: d.glbPath ? glbClipNames(d.glbPath) : [] };
  })
  .filter((m) => m.clips.length > 0 && Object.keys(m.clipMap).length > 0);

/** 預覽在 GH#1261 之前的規則：精確 ＋ 忽略大小寫，⛔ 沒有別名那一步。 */
const namedOnly = (clips: NamedClip[], want: string) =>
  clips.find((c) => c.name === want || c.name.toLowerCase() === want.toLowerCase()) ?? null;

describe("GH#1261 挑動作的規則只有一份", () => {
  it("票上那四隻：舊的預覽規則挑不到，別名把它們救回來", () => {
    // ⚠️ 分母是**全部**出貨模型 × 六格，⛔ 不是「clipMap 寫 walk 的那些」——
    // 128 份寫 `run:"walk"`，而其中 124 份的 glb **真的有** walk ⇒ 它們一直是好的。
    const broken: string[] = [];
    for (const m of MODELS)
      for (const state of ANIM_STATES) {
        const want = m.clipMap[state];
        if (want && !namedOnly(m.clips, want) && pickClip(m.clips, state, want).clip)
          broken.push(`${m.id} ${state}→"${want}"`);
      }
    expect(broken).toEqual([
      'champ.godie-zombiex.json run→"walk"',
      'champ.mob.zombie-king.json run→"walk"',
      'champ.mob.zombie-special.json run→"walk"',
      'champ.mob.zombie.json run→"walk"',
    ]);
    const z = MODELS.find((m) => m.id === "champ.godie-zombiex.json")!;
    expect(pickClip(z.clips, "run", "walk")).toMatchObject({ viaAlias: true });
    expect(pickClip(z.clips, "run", "walk").clip?.name).toBe("run");
  });

  it("全部出貨模型：六格都挑得到", () => {
    expect(MODELS.length).toBeGreaterThan(900); // 分母：⛔ 別讓掃描壞掉而靜默變成 0
    const dead: string[] = [];
    for (const m of MODELS)
      for (const [state, pick] of pickClipMap(m.clips, m.clipMap))
        if (!pick.clip) dead.push(`${m.id} ${state}→"${m.clipMap[state]}"`);
    expect(dead).toEqual([]);
  });

  it("這張別名表與比賽那一份逐字相同", () => {
    const src = readFileSync(join(ROOT, "apps/client/src/render/ClipAnimator.ts"), "utf-8");
    const from = src.indexOf("DEFAULT_CLIP_NAMES"), to = src.indexOf("const LOOPING");
    expect(Math.min(from, to - from)).toBeGreaterThan(0); // ⛔ 切不到就不是「比對過」
    for (const state of ANIM_STATES) {
      const hit = new RegExp(`\\b${state}:\\s*\\[([^\\]]*)\\]`).exec(src.slice(from, to));
      const names = hit?.[1]?.match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1));
      expect({ [state]: names }).toEqual({ [state]: [...CLIP_NAME_ALIASES[state]] });
    }
  });
});
