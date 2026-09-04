/**
 * ⛔ **一份隔離契約如果只是「一張寫死的清單」，它會靜靜地過期。**
 *
 * 這一支守 `content/config/unsafe-textures.json`（Codex 阻塞清單 P0-6）。
 * 它問四件事，⭐ 四件都是**關係**，⛔ 沒有一件是「這一格填了嗎」：
 *
 *  ①【隔離指得到東西】每一張列進來的貼圖**真的存在於磁碟上**，而且 `sha256`
 *    對得上**現在**那份位元組。⛔ 一個指向不存在檔案的隔離是空的；
 *    ⛔ 一份描述舊位元組的量測比沒有量測更糟（它看起來是量過的）。
 *
 *  ②【數字是被釘住的宣稱，⛔ 不是被信任的數字】`usage` 的四個數字**當場重算**
 *    再逐格比對。⚠️ 它們確實是「第二個住處」（第〇·四守則）—— 而這一條就是那個
 *    住處的代價：內容一漂它就**紅**。⛔ 不是「先寫下來以後再說」。
 *
 *  ③【⭐ 真正的關係：`(貼圖, blendMode)` 的配對】標成 `safe` 的貼圖，
 *    **每一份消費它的 vfx 文件**的 `blendMode` 都必須在 `safeBlendModes` 裡。
 *    ⚠️ 這一條是整支的重點：`zap1` 的 alpha 全 255，它在 additive 下安全**只是因為
 *    它的邊緣是黑的**；有人把某一份文件改成 `blendMode:"alpha"`，那張 128×64 的
 *    貼圖當場變成一塊實心方板 —— ⛔ 而 schema 合法、`content:build` 全綠、
 *    每一條既有守衛都不會說話。**只驗名詞驗不到它。**
 *
 *  ④【棘輪】被隔離的張數**只能變少**。修好一張就把 `quarantineRatchet` 調小一格；
 *    ⛔ 想多隔離一張就會撞到它，而那需要一個解釋。
 *
 * ⚠️ **GUARD-THE-GUARD**：這一支自己先證明它掃得到東西（vfx 文件數 ≥ 300、
 * 契約列數 ≥ 1）。⛔ 一支掃到 0 份還全綠的守衛，與不存在沒有差別
 * （前例 `bundle.test.ts`：759 條全綠推了一份過期的 bundle 上線）。
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./modulateIdentity";
import { zConfigUnsafeTexturesDoc } from "./schema/config/unsafeTextures";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CONTENT = join(REPO, "content");

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

const round = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/**
 * PNG 位元組 → unsafe-textures.measured。
 *
 * ⭐ 量尺與契約放在同一個守衛裡：修圖之後不能只換 hash、沿用舊結論。
 * `borderEffAdditive` 沿用原契約的定義＝四條邊各自平均後再平均；角落因此在
 * 兩條邊各算一次，非正方形貼圖也不會因長邊像素較多而淹沒短邊缺陷。
 */
function measureTexture(file: string): {
  size: string;
  hasAlphaShape: boolean;
  opaquePct: number;
  minAlpha: number;
  maxAlpha: number;
  alphaRange: number;
  distinctAlphaValues: number;
  borderEffAdditive: number;
  edgeEffAdditive: { top: number; bottom: number; left: number; right: number };
} {
  const { w, h, rgba } = decodePng(readFileSync(file));
  const alphas: number[] = [];
  for (let i = 3; i < rgba.length; i += 4) alphas.push(rgba[i]!);
  const minAlpha = Math.min(...alphas);
  const maxAlpha = Math.max(...alphas);

  const effectiveAdditive = (x: number, y: number): number => {
    const i = (y * w + x) * 4;
    const brightness = (rgba[i]! + rgba[i + 1]! + rgba[i + 2]!) / 3;
    return brightness * rgba[i + 3]! / 255;
  };
  const mean = (values: readonly number[]): number =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const edgeRaw = {
    top: mean(Array.from({ length: w }, (_, x) => effectiveAdditive(x, 0))),
    bottom: mean(Array.from({ length: w }, (_, x) => effectiveAdditive(x, h - 1))),
    left: mean(Array.from({ length: h }, (_, y) => effectiveAdditive(0, y))),
    right: mean(Array.from({ length: h }, (_, y) => effectiveAdditive(w - 1, y))),
  };
  const edgeEffAdditive = {
    top: round(edgeRaw.top, 1),
    bottom: round(edgeRaw.bottom, 1),
    left: round(edgeRaw.left, 1),
    right: round(edgeRaw.right, 1),
  };

  return {
    size: `${w}x${h}`,
    hasAlphaShape: maxAlpha - minAlpha > 8,
    opaquePct: round(alphas.filter((alpha) => alpha === 255).length * 100 / alphas.length, 2),
    minAlpha,
    maxAlpha,
    alphaRange: maxAlpha - minAlpha,
    distinctAlphaValues: new Set(alphas).size,
    borderEffAdditive: round(mean(Object.values(edgeRaw)), 1),
    edgeEffAdditive,
  };
}

/** 每一個字串葉節點 —— ⛔ 不猜欄位名，⭐ 比對**值**（欄位名會漂，vfx id 不會）。 */
function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const n of node) strings(n, out);
  else if (node && typeof node === "object")
    for (const v of Object.values(node as Record<string, unknown>)) strings(v, out);
  return out;
}

const docsIn = (coll: string): { id: string; doc: Record<string, unknown> }[] => {
  const dir = join(CONTENT, coll);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => {
      const doc = readJson(join(dir, f)) as Record<string, unknown>;
      return { id: (doc.id as string) ?? f.slice(0, -5), doc };
    });
};

/** vfx doc id → 它引用的貼圖檔名；以及 → 它的 blendMode。 */
function vfxIndex(): { tex: Map<string, string[]>; blend: Map<string, string> } {
  const tex = new Map<string, string[]>();
  const blend = new Map<string, string>();
  for (const { id, doc } of docsIn("vfx")) {
    tex.set(
      id,
      strings(doc)
        .filter((s) => s.includes("textures/"))
        .map((s) => s.split("/").pop() as string),
    );
    blend.set(id, (doc.blendMode as string) ?? "<unset>");
  }
  return { tex, blend };
}

/** 一張貼圖今天真正的分母：可達的 vfx / 技能 / 英雄。 */
function usageOf(texFile: string, tex: Map<string, string[]>): {
  vfxDocs: number;
  reachableVfxDocs: number;
  abilities: number;
  champions: number;
  vfxIds: string[];
} {
  const base = texFile.split("/").pop() as string;
  const vfxIds = [...tex.entries()].filter(([, ts]) => ts.includes(base)).map(([id]) => id);
  const mine = new Set(vfxIds);

  // ── 誰引用得到這些 vfx（⭐ 全 content/,⛔ 不只 abilities）────────────────
  const referenced = new Set<string>();
  const abilities = new Set<string>();
  const champions = new Set<string>();
  for (const coll of readdirSync(CONTENT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "vfx")
    .map((e) => e.name)
    .sort()) {
    for (const { id, doc } of docsIn(coll)) {
      for (const s of strings(doc)) if (mine.has(s)) referenced.add(s);
    }
  }
  // 技能：直接引用 + config/ability-vfx-bindings 展開
  for (const { id, doc } of docsIn("abilities"))
    if (strings(doc).some((s) => mine.has(s))) abilities.add(id);
  const avb = readJson(join(CONTENT, "config", "ability-vfx-bindings.json")) as {
    bindings?: { abilityId: string; vfxKeys?: string[] }[];
  };
  for (const b of avb.bindings ?? [])
    if ((b.vfxKeys ?? []).some((k) => mine.has(k))) abilities.add(b.abilityId);

  // 英雄：直接引用 + config/ambient-vfx 的 modelKey 展開
  const modelOf = new Map<string, string[]>();
  for (const { id, doc } of docsIn("champions")) {
    if (strings(doc).some((s) => mine.has(s))) champions.add(id);
    modelOf.set(id, strings(doc));
  }
  const amb = readJson(join(CONTENT, "config", "ambient-vfx.json")) as {
    bindings?: Record<string, { vfx?: string }[]>;
  };
  for (const [modelKey, list] of Object.entries(amb.bindings ?? {}))
    if ((list ?? []).some((e) => e?.vfx !== undefined && mine.has(e.vfx)))
      for (const [cid, ss] of modelOf) if (ss.includes(modelKey)) champions.add(cid);

  return {
    vfxDocs: vfxIds.length,
    reachableVfxDocs: [...mine].filter((v) => referenced.has(v)).length,
    abilities: abilities.size,
    champions: champions.size,
    vfxIds,
  };
}

describe("不安全 VFX 貼圖的隔離契約 (content-unsafe-texture-quarantine)", () => {
  const parsed = zConfigUnsafeTexturesDoc.parse(
    readJson(join(CONTENT, "config", "unsafe-textures.json")),
  );
  const { tex, blend } = vfxIndex();

  it("GUARD-THE-GUARD：真的掃到 vfx 文件與契約列", () => {
    expect(tex.size, "掃到的 vfx 文件太少 —— 路徑或過濾條件壞了").toBeGreaterThanOrEqual(300);
    expect(parsed.textures.length).toBeGreaterThanOrEqual(1);
  });

  it("① 每一張被列的貼圖真的在磁碟上,而且 sha256 與完整像素量測都對得上", () => {
    for (const t of parsed.textures) {
      const abs = join(CONTENT, t.file);
      expect(existsSync(abs), `隔離表指向一個不存在的檔案:${t.file} —— 這個隔離是空的`).toBe(true);
      const actual = createHash("sha256").update(readFileSync(abs)).digest("hex");
      expect(
        actual,
        `${t.file} 的位元組變了 —— 契約裡那一整組量測描述的是**另一份檔案**。` +
          `重新量再更新這一列,⛔ 不要只改 hash。`,
      ).toBe(t.sha256);
      expect(
        measureTexture(abs),
        `${t.file} 的像素量測過期了 —— 必須重算完整 measured，⛔ 不得只換 hash。`,
      ).toEqual(t.measured);
    }
  });

  it("② usage 的四個數字當場重算都對得上（⛔ 不是一份寫死的普查）", () => {
    for (const t of parsed.textures) {
      const live = usageOf(t.file, tex);
      expect(
        {
          vfxDocs: live.vfxDocs,
          reachableVfxDocs: live.reachableVfxDocs,
          abilities: live.abilities,
          champions: live.champions,
        },
        `${t.file} 的 usage 過期了 —— 內容動過。把契約那一列更新成重算的值。`,
      ).toEqual(t.usage);
    }
  });

  it("③ ⭐ 標成 safe 的貼圖,每一份消費它的 vfx 文件都在 safeBlendModes 裡", () => {
    for (const t of parsed.textures) {
      if (t.status !== "safe") continue;
      const allowed = new Set<string>(t.safeBlendModes);
      for (const vid of usageOf(t.file, tex).vfxIds) {
        const bm = blend.get(vid) ?? "<unset>";
        expect(
          allowed.has(bm),
          `vfx「${vid}」用 ${t.file} 卻是 blendMode="${bm}" —— 契約只允許 ` +
            `${[...allowed].join("/")}。⭐ 這張貼圖的 alpha 沒有形狀,換掉 additive ` +
            `它就是一塊實心方板(而 schema 合法、content:build 全綠)。`,
        ).toBe(true);
      }
    }
  });

  it("④ 棘輪:被隔離的張數只能變少", () => {
    const n = parsed.textures.filter((t) => t.status === "quarantined").length;
    expect(
      n,
      `隔離張數 ${n} 超過棘輪 ${parsed.quarantineRatchet} —— 想多隔離一張要先解釋為什麼。`,
    ).toBeLessThanOrEqual(parsed.quarantineRatchet);
  });
});
