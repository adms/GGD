/**
 * voxelLook guard (#226).
 *
 * The whole point of the module is that 44 champions sharing four meshes still
 * read as 44 different characters, WITHOUT randomness. So the two things worth
 * testing are exactly those: determinism, and spread across the REAL roster —
 * not a synthetic id list, because the actual champion ids are CJK strings whose
 * shared prefixes are precisely what a weak hash collides on.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCHETYPE_BY_MODEL_KEY,
  appearanceModelKey,
  fallbackAccentFor,
  fnv1a,
  voxelLookFor,
} from "./voxelLook";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../../content");

type BodyVersion = { sourceModelKey: string; legacyAppearance: boolean };
function bodyVersionOf(modelKey: string): BodyVersion | undefined {
  const p = join(CONTENT, "models", `${modelKey}.json`);
  if (!existsSync(p)) return undefined;
  return (JSON.parse(readFileSync(p, "utf8")) as { bodyVersion?: BodyVersion }).bodyVersion;
}

/**
 * Every (champion, blocky mesh) pair the game can put on screen.
 *
 * ⚠️ 2026-09-15 —— 這個母體以前只讀 `doc.modelKey` 且要求它**字面上**是 `champ.*`。
 *   09-10／09-11 那幾批（4058d8166 · b1a939f7c · 107626f90 · 0c2446749）把幾十位英雄
 *   從方塊人換成真模型，⭐ 而**舊的方塊人一顆都沒刪**：它們被凍結成
 *   `version.body.*`（`bodyVersion.legacyAppearance: true`），留在各自的
 *   `modelVersions[]` 裡 —— 後台一個 `activate` 就換回來。
 *   ⇒ 只讀字面 modelKey，champ.sela 上從 18 位掉到 1 位（它自己），
 *   ⛔ 而那 10 位**隨時可以被切回**方塊法師的英雄一位都沒被量到。
 * ⭐ 所以母體 = 目前套用的 modelKey ∪ 每一個模型版本，都先過出貨的
 *   `appearanceModelKey`（`championBody.modelOverrideFor` 用的同一支）再查 archetype。
 */
function blockyRoster(): { id: string; modelKey: string }[] {
  const out: { id: string; modelKey: string }[] = [];
  for (const f of readdirSync(join(CONTENT, "champions"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(CONTENT, "champions", f), "utf8")) as {
      id?: string;
      modelKey?: string;
      modelVersions?: { modelKey: string }[];
    };
    if (!doc.id) continue;
    const seen = new Set<string>();
    for (const key of [doc.modelKey, ...(doc.modelVersions ?? []).map((v) => v.modelKey)]) {
      if (!key) continue;
      const looksLike = appearanceModelKey(key, bodyVersionOf(key));
      if (!ARCHETYPE_BY_MODEL_KEY[looksLike] || seen.has(looksLike)) continue;
      seen.add(looksLike);
      out.push({ id: doc.id, modelKey: looksLike });
    }
  }
  return out;
}

const ROSTER = blockyRoster();

/**
 * 每一位真英雄的 id —— 給「archetype 偏好」那一組用。那一組**明寫** archetype 參數，
 * 驗的是偏好表本身，⛔ 與「誰現在穿方塊人」無關 ⇒ 母體不該跟著模型換裝一起縮。
 * （⚠️ 2026-09-15 量到：用穿方塊人的那一小群當母體，名單一換裝，統計就擲硬幣。）
 */
const ALL_IDS: readonly { id: string }[] = readdirSync(join(CONTENT, "champions"))
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => ({ id: (JSON.parse(readFileSync(join(CONTENT, "champions", f), "utf8")) as { id: string }).id }));

describe("voxelLookFor is deterministic", () => {
  it("returns the same look for the same id, every call", () => {
    for (const { id, modelKey } of ROSTER.slice(0, 12)) {
      const a = voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!);
      const b = voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("never consults Math.random — a stubbed-out RNG changes nothing", () => {
    const real = Math.random;
    const first = voxelLookFor("godie-n00b", "mage");
    Math.random = () => 0.123456;
    try {
      expect(JSON.stringify(voxelLookFor("godie-n00b", "mage"))).toBe(JSON.stringify(first));
    } finally {
      Math.random = real;
    }
  });

  it("is total: an empty id and an unknown archetype still produce a look", () => {
    const look = voxelLookFor("", "no-such-archetype");
    expect(look.palette).toHaveLength(8);
    expect(look.proportions.head).toBeGreaterThan(0);
  });

  it("folds the HIGH byte of every character, so CJK ids cannot collide on a prefix", () => {
    // charCodeAt > 0xff for these; a naive `h ^= code & 0xff` hashes 丘 and 桶
    // identically whenever their low bytes match.
    expect(fnv1a("皮卡丘")).not.toBe(fnv1a("皮卡桶"));
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });
});

describe("the real roster comes out visually distinct", () => {
  it("穿體素身體的英雄都被涵蓋到 —— 而且不是空跑", () => {
    // GH#323 —— ⛔ 不寫 `>= 40`：那是搬家前的族群大小，名單一動就用
    //    「21 不到 40」這種跟「外觀會不會撞」無關的訊息紅。
    expect(ROSTER.length, "沒有任何英雄穿體素身體 —— 底下每一條都會空跑").toBeGreaterThan(0);
  });

  it("no two champions share BOTH a palette and a prop silhouette", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const { id, modelKey } of ROSTER) {
      const look = voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!);
      // the two axes a player actually reads at combat camera distance
      const sig = `${modelKey}|${look.palette.map((c) => c.join(",")).join(";")}|${Object.values(look.props).join("")}`;
      const prev = seen.get(sig);
      if (prev) clashes.push(`${prev} ↔ ${id}`);
      else seen.set(sig, id);
    }
    expect(clashes, `champions rendering identically: ${clashes.join(", ")}`).toEqual([]);
  });

  it("champions on the SAME mesh still differ in colour", () => {
    // the case the retired 2-entry ACCENTS table could never handle: 18
    // champions on champ.sela used to render in one shade of grey.
    const sela = ROSTER.filter((c) => c.modelKey === "champ.sela");
    expect(sela.length).toBeGreaterThan(5);
    const cloths = new Set(sela.map((c) => voxelLookFor(c.id, "mage").palette[1].join(",")));
    expect(cloths.size).toBeGreaterThan(sela.length / 2);
  });

  it("keeps every proportion set inside ±20 % so #150's uniform height survives", () => {
    for (const { id, modelKey } of ROSTER) {
      const p = voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!).proportions;
      for (const [axis, v] of Object.entries(p)) {
        if (axis === "shoulderOffset") {
          expect(Math.abs(v)).toBeLessThanOrEqual(0.03);
          continue;
        }
        expect(v, `${id}.${axis}`).toBeGreaterThanOrEqual(0.8);
        expect(v, `${id}.${axis}`).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it("emits colour channels in 0..1, never out of gamut", () => {
    for (const { id, modelKey } of ROSTER) {
      for (const c of voxelLookFor(id, ARCHETYPE_BY_MODEL_KEY[modelKey]!).palette) {
        for (const ch of c) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("the archetype biases the props without deciding the colours", () => {
  it("a barbarian is usually bare-headed, a mage usually is not", () => {
    const hats = (arch: string) =>
      ALL_IDS.filter((c) => voxelLookFor(c.id, arch).props.hat).length / ALL_IDS.length;
    expect(hats("mage")).toBeGreaterThan(hats("barbarian"));
  });

  it("the undead wears no props at all by bias, and shambles", () => {
    const bare = (arch: string) =>
      ALL_IDS.filter((c) => {
        const p = voxelLookFor(c.id, arch).props;
        return !p.hat && !p.pack && !p.pauldron;
      }).length / ALL_IDS.length;
    // ⚠️ 2026-09-15 —— 這一條以前是 `bare("undead") > 0.6` 一個固定門檻。
    //   量到的：同一支雜湊在**全部 153 位真英雄**上給 0.608、在可切回方塊人的 40 位上給
    //   正好 0.600 —— ⇒ 0.6 不是地板，是這個分布的**平均值**（#226 當年 44 位的樣本剛好在上面）。
    //   ⛔ 一個坐在平均值上的門檻，名單一動就擲硬幣。
    // ⭐ 改成和上一條同一個形狀：**同一批 id、只換 archetype** 的差分。
    //   基準是中性偏好（未知 archetype ⇒ DEFAULT_BIAS，見上面「is total」那條）。
    //   突變：undead 的偏好被拿掉（退回 DEFAULT_BIAS）⇒ 兩邊相等 ⇒ 紅。
    expect(bare("undead")).toBeGreaterThan(2 * bare("no-such-archetype"));
    expect(bare("undead")).toBeGreaterThan(bare("barbarian"));
  });
});

describe("the procedural fallback shares the champion's seed", () => {
  it("the fallback accent IS the baked accent slot — the two paths cannot drift", () => {
    const look = voxelLookFor("godie-n00b", "mage");
    expect(fallbackAccentFor("godie-n00b", "mage")).toEqual([...look.palette[3]]);
  });

  it("falls back to neutral grey when the seat has not resolved yet", () => {
    expect(fallbackAccentFor(null, "mage")).toEqual([0.5, 0.5, 0.55]);
  });
});
