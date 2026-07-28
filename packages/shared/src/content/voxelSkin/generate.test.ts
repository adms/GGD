/**
 * voxelSkin/generate — the invariants that make #231 a finished feature rather
 * than a pile of colours.
 *
 * Driven against the REAL champion tree (114 docs), not a fixture. That is the
 * point: "no two champions look the same" is a property of THIS ROSTER, and a
 * fixture of three toy heroes proves nothing about it. Adding a champion that
 * collides with an existing look turns this file red instead of shipping a twin.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import {
  compactRecipe,
  generateAllVoxelSkins,
  generateVoxelSkin,
  haystackOf,
  lookSignature,
  motifBoxCount,
  splitName,
} from "./generate";
import { voxelSkinInputOf, type ChampionLike } from "./roster";
import {
  ELEMENT_BANDS,
  TEAM_HUES,
  avoidTeamHue,
  dominantElement,
  elementOf,
  fromHex,
  hueDistance,
  luminance,
  OUTFIT_LUM_MIN,
  OUTFIT_LUM_MAX,
  EYE_CONTRAST_MIN,
} from "./palette";
import {
  BLIZZARD_MODEL_CHAMPIONS,
  MAX_MOTIF_BOXES,
  STAND_IN_MODEL_KEYS,
  defaultPrefersVoxelBody,
  type VoxelSkinRecipe,
} from "./types";
import { SKIN_RULES } from "./rules";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const CHAMPION_DIR = join(CONTENT_DIR, "champions");

function loadChampionDocs(): ChampionLike[] {
  return readdirSync(CHAMPION_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(CHAMPION_DIR, f), "utf8")) as ChampionLike);
}

const DOCS = loadChampionDocs();
const INPUTS = DOCS.map(voxelSkinInputOf);
const ROSTER = generateAllVoxelSkins(INPUTS);
const ALL: VoxelSkinRecipe[] = [...ROSTER.recipes.values()];

/**
 * Berserker's w3x tint (task #49) — the darkest MULTIPLY in the content ledger
 * and therefore the worst case a generated outfit has to survive.
 */
const DARKEST_TINT = 0.3137;

describe("voxel skin — coverage over the real roster", () => {
  it("generates a look for EVERY champion doc", () => {
    cover("voxel-skin-generate");
    expect(DOCS.length).toBeGreaterThanOrEqual(114);
    expect(ROSTER.recipes.size).toBe(DOCS.length);
    for (const doc of DOCS) expect(ROSTER.recipes.has(doc.id)).toBe(true);
  });

  it("no two champions share a look signature (goal 2, mechanically)", () => {
    cover("voxel-skin-distinct");
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const r of ALL) {
      const sig = lookSignature(r);
      const prev = seen.get(sig);
      if (prev) clashes.push(`${prev} == ${r.championId}`);
      seen.set(sig, r.championId);
    }
    expect(clashes).toEqual([]);
    expect(seen.size).toBe(ALL.length);
    expect(ROSTER.unresolved).toEqual([]);
  });

  it("the four-colour palette alone already separates every champion", () => {
    cover("voxel-skin-distinct");
    const quad = new Set(
      ALL.map((r) =>
        [r.palette.outfitPrimary, r.palette.outfitSecondary, r.palette.skin, r.palette.hair].join("|"),
      ),
    );
    expect(quad.size).toBe(ALL.length);
  });

  it("champions sharing ONE mesh get different faces (the 18 on champ.sela)", () => {
    cover("voxel-skin-distinct");
    for (const key of STAND_IN_MODEL_KEYS) {
      const group = DOCS.filter((d) => d.modelKey === key);
      if (group.length < 2) continue;
      const sigs = new Set(group.map((d) => lookSignature(ROSTER.recipes.get(d.id)!)));
      expect(sigs.size).toBe(group.length);
    }
  });

  it("the 14 exact-name collision pairs still separate (the id is the seed)", () => {
    cover("voxel-skin-distinct");
    const byName = new Map<string, ChampionLike[]>();
    for (const d of DOCS) {
      const list = byName.get(d.name ?? "") ?? [];
      list.push(d);
      byName.set(d.name ?? "", list);
    }
    const pairs = [...byName.values()].filter((g) => g.length > 1);
    expect(pairs.length).toBeGreaterThan(0); // the roster really does have them
    for (const group of pairs) {
      const sigs = new Set(group.map((d) => lookSignature(ROSTER.recipes.get(d.id)!)));
      expect(sigs.size).toBe(group.length);
    }
  });

  /**
   * 43, not the 44 this branch was written against: task #217 gave 喪標麥可
   * (`godie-zombiex`) its OWN zombie mesh (`champ.godie-zombiex`) and dropped its
   * `voxel-standin` tag, so it left the shared-mesh population before #231 merged.
   * It is still both the #215 mob AND a pickable hero — nothing about that
   * identity changed; it simply is not on a shared stand-in mesh any more.
   * Measured distribution was sela 18 / thorne 10 / barbarian 9 / rogue 6 = 43.
   *
   * BACK TO 44 at task #249: importing `godie-o02n` (曹操孟德's BASE unit O02N,
   * whose map model is a Blizzard built-in) added one more `champ.skin.rogue`
   * wearer — rogue 6 → 7.
   */
  it("共用替身英雄:有暴雪模型的走 glb,沒有的才留在體素身體上", () => {
    cover("voxel-skin-standin");
    // ⚠️ 這條測試的方向在 GH#31 反轉了,而反轉本身就是那個 bug 的形狀。
    //
    // 它原本斷言「44 位全部 preferVoxelBody === true」,而那是自洽的:#231 的
    // 前提是這 44 位「沒有自己的美術」。前提在 #10 就已經不成立 —— 其中 40 位的
    // 真實 Warcraft III 模型早就抽進 overlay 了,`blizzardOverlay.ts` 也確實會在
    // 解析時把它換進來。只是 `ChampionView.tryUpgradeToGlb` 在這個旗標上提早
    // return,於是那個 glb 在下一行被丟掉。
    //
    // 兩層各自都對、各自都有測試、沒有任何東西會紅 —— 玩家看到的是 44 位共用
    // 四張臉。owner 2026-07-28:「請你都先用暴雪的 3d model」。
    const standIns = DOCS.filter((d) => STAND_IN_MODEL_KEYS.includes(d.modelKey ?? ""));
    expect(standIns.length).toBe(44);

    const withBlizzard = standIns.filter((d) => BLIZZARD_MODEL_CHAMPIONS.includes(d.id));
    const without = standIns.filter((d) => !BLIZZARD_MODEL_CHAMPIONS.includes(d.id));
    expect(withBlizzard.length, "40 位的 WC3 模型已在 overlay 裡").toBe(40);
    expect(
      without.map((d) => d.id).sort(),
      "只有這四位沒有自己的模型:o02n / u011 沒抽到,sela / thorne 不是地圖英雄",
    ).toEqual(["godie-o02n", "godie-u011", "sela", "thorne"]);

    for (const d of withBlizzard) {
      expect(
        ROSTER.recipes.get(d.id)!.preferVoxelBody,
        `${d.id} 有自己的 WC3 模型,不該被鎖在體素`,
      ).toBe(false);
    }
    for (const d of without) {
      expect(
        ROSTER.recipes.get(d.id)!.preferVoxelBody,
        `${d.id} 沒有任何自己的模型 —— 退回共用替身會讓 #231 整個任務失效`,
      ).toBe(true);
    }

    // ...and a champion with its OWN imported mesh keeps it
    const own = DOCS.filter((d) => (d.modelKey ?? "").startsWith("imported."));
    expect(own.length).toBeGreaterThan(0);
    for (const d of own) expect(ROSTER.recipes.get(d.id)!.preferVoxelBody).toBe(false);
  });
});

describe("voxel skin — determinism", () => {
  it("two runs of the whole roster are byte-identical", () => {
    cover("voxel-skin-determinism");
    const a = JSON.stringify([...generateAllVoxelSkins(INPUTS).recipes.values()]);
    const b = JSON.stringify([...generateAllVoxelSkins(INPUTS).recipes.values()]);
    expect(a).toBe(b);
  });

  it("input ORDER does not change any champion's look", () => {
    cover("voxel-skin-determinism");
    const reversed = generateAllVoxelSkins([...INPUTS].reverse());
    for (const r of ALL) {
      expect(JSON.stringify(reversed.recipes.get(r.championId))).toBe(JSON.stringify(r));
    }
  });

  it("a single champion regenerates identically in isolation", () => {
    cover("voxel-skin-determinism");
    for (const input of INPUTS.slice(0, 25)) {
      const solo = generateVoxelSkin(input);
      const fromRoster = ROSTER.recipes.get(input.id)!;
      // salt 1 for everyone on this roster (0 escalations) — assert that too
      expect(fromRoster.salt).toBe(1);
      expect(JSON.stringify(solo)).toBe(JSON.stringify(fromRoster));
    }
    expect(ROSTER.escalated).toEqual([]);
  });

  it("uses NOTHING but the champion's own identity (no clock, no randomness)", () => {
    cover("voxel-skin-determinism");
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "generate.ts"), "utf8");
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/Date\.now|new Date\(/);
    // Object.keys iteration order is the classic latent non-determinism (#198)
    expect(src).not.toMatch(/Object\.keys\(/);
  });

  it("the champion id — not the name, not the modelKey — is what separates", () => {
    cover("voxel-skin-determinism");
    const base = INPUTS[0]!;
    const twin = { ...base, id: `${base.id}-twin` };
    expect(lookSignature(generateVoxelSkin(twin))).not.toBe(
      lookSignature(generateVoxelSkin(base)),
    );
    const renamed = { ...base, name: "完全不同的名字 - 別人" };
    // a rename may move a keyword-driven axis, but the hashed axes must not move
    expect(generateVoxelSkin(renamed).palette.outfitPrimary).toBe(
      generateVoxelSkin(base).palette.outfitPrimary,
    );
  });
});

describe("voxel skin — legibility repairs", () => {
  it("outfitPrimary luminance stays inside the readable window", () => {
    cover("voxel-skin-legibility");
    for (const r of ALL) {
      const l = luminance(fromHex(r.palette.outfitPrimary));
      expect(l).toBeGreaterThanOrEqual(OUTFIT_LUM_MIN - 1e-6);
      expect(l).toBeLessThanOrEqual(OUTFIT_LUM_MAX + 1e-6);
    }
  });

  it("survives the darkest #49 tint without collapsing to black", () => {
    cover("voxel-skin-tint-compose");
    for (const r of ALL) {
      const tinted = luminance(fromHex(r.palette.outfitPrimary)) * DARKEST_TINT;
      expect(tinted).toBeGreaterThanOrEqual(0.045);
    }
  });

  it("eyes separate from the outfit in luminance", () => {
    cover("voxel-skin-legibility");
    // The repair runs on float colour; the recipe stores 8-bit hex. Allow one
    // quantisation step (1/255) of slack rather than pretending the round-trip
    // is exact — a champion measured at 0.27999 against a 0.28 floor is the
    // rounding, not a legibility failure.
    const QUANT = 1 / 255;
    for (const r of ALL) {
      const d = Math.abs(
        luminance(fromHex(r.palette.eye)) - luminance(fromHex(r.palette.outfitPrimary)),
      );
      expect(d, r.championId).toBeGreaterThanOrEqual(EYE_CONTRAST_MIN - QUANT);
    }
  });

  it("no saturated hue is reserved for a TEAM colour", () => {
    cover("voxel-skin-team-compose");
    // the guard only applies above the saturation floor; check the transform
    for (const t of TEAM_HUES) {
      const rotated = avoidTeamHue(t, 0.9);
      expect(TEAM_HUES.some((h) => hueDistance(rotated, h) < 22)).toBe(false);
    }
    // and a low-saturation hue is left alone (a grey outfit is not a team read)
    expect(avoidTeamHue(222, 0.1)).toBe(222);
  });
});

describe("voxel skin — budget", () => {
  it("the whole roster's recipes fit in 32 KB of compact JSON", () => {
    cover("voxel-skin-budget");
    const json = JSON.stringify(
      Object.fromEntries(ALL.map((r) => [r.championId, compactRecipe(r)])),
    );
    expect(json.length).toBeLessThan(32 * 1024);
    // and per champion it is a couple of hundred bytes, not a couple of KB
    expect(json.length / ALL.length).toBeLessThan(260);
  });

  it("motif geometry never exceeds the triangle budget", () => {
    cover("voxel-skin-budget");
    for (const r of ALL) expect(motifBoxCount(r)).toBeLessThanOrEqual(MAX_MOTIF_BOXES);
  });
});

describe("voxel skin — the rule table does not converge", () => {
  it("no head motif claims more than a third of the roster", () => {
    cover("voxel-skin-rules");
    const hist = new Map<string, number>();
    for (const r of ALL) hist.set(r.motifs.head, (hist.get(r.motifs.head) ?? 0) + 1);
    for (const [motif, n] of hist) {
      expect(n, `head motif ${motif} on ${n}/${ALL.length}`).toBeLessThan(ALL.length / 3);
    }
    expect(hist.size).toBeGreaterThanOrEqual(8); // the vocabulary is actually used
  });

  it("no outfit top claims more than a third of the roster", () => {
    cover("voxel-skin-rules");
    const hist = new Map<string, number>();
    for (const r of ALL) hist.set(r.outfit.top, (hist.get(r.outfit.top) ?? 0) + 1);
    for (const [top, n] of hist) {
      expect(n, `top ${top} on ${n}/${ALL.length}`).toBeLessThan(ALL.length / 3);
    }
  });

  it("every rule is reachable — none is dead weight in the table", () => {
    cover("voxel-skin-rules");
    const haystacks = INPUTS.map(haystackOf);
    const unusedButIntentional = new Set<string>();
    for (const rule of SKIN_RULES) {
      const fires = haystacks.some((h) => rule.re.test(h));
      if (!fires) unusedButIntentional.add(rule.re.source);
    }
    // a rule that matches nothing today is allowed (it is a forward-compatible
    // vocabulary), but MOST of the table must be earning its place.
    expect(unusedButIntentional.size).toBeLessThan(SKIN_RULES.length / 2);
  });
});

describe("voxel skin — inputs and adapters", () => {
  it("splits 稱號 / 本名 on the doc's ' - ' convention", () => {
    cover("voxel-skin-generate");
    expect(splitName("七夜怪談 - 貞子")).toEqual({ title: "七夜怪談", proper: "貞子" });
    expect(splitName("死亡騎士")).toEqual({ title: "死亡騎士", proper: "死亡騎士" });
    expect(splitName(undefined)).toEqual({ title: "", proper: "" });
  });

  it("resolves the dominant element off the ability vfxKeys", () => {
    cover("voxel-skin-generate");
    expect(elementOf("vfx.nova.ice.frostNova")).toBe("ice");
    expect(elementOf("vfx.nova.notAnElement.x")).toBe("?");
    expect(elementOf(undefined)).toBe("?");
    // a 2-2 tie resolves by the frozen priority list, never by key order
    expect(dominantElement(["ice", "fire", "ice", "fire"])).toBe("ice");
    expect(dominantElement(["physical", "void"])).toBe("void");
  });

  it("every element the roster actually uses has a band", () => {
    cover("voxel-skin-generate");
    for (const input of INPUTS) {
      for (const key of input.vfxKeys ?? []) {
        expect(ELEMENT_BANDS[elementOf(key)]).toBeDefined();
      }
    }
  });

  it("a hand-authored override wins over everything the generator chose", () => {
    cover("voxel-skin-override");
    const base = generateVoxelSkin(INPUTS[0]!);
    const overridden = generateVoxelSkin(INPUTS[0]!, {
      override: {
        palette: { outfitPrimary: "#123456" },
        motifs: { head: "crown" },
        preferVoxelBody: true,
      },
    });
    expect(overridden.palette.outfitPrimary).toBe("#123456");
    expect(overridden.motifs.head).toBe("crown");
    expect(overridden.preferVoxelBody).toBe(true);
    // untouched axes are untouched
    expect(overridden.palette.skin).toBe(base.palette.skin);
    expect(overridden.outfit.top).toBe(base.outfit.top);
  });
});

describe("voxel skin — the committed roster snapshot", () => {
  /**
   * The snapshot is the REVIEW ARTIFACT: any drift in the generator, the
   * ladders or the rule table shows up as a file diff a human can read, rather
   * than as heroes silently changing face between builds.
   *
   * Regenerate deliberately with `pnpm --filter @ggd/shared voxel-skins:snapshot`.
   */
  it("matches every champion's committed look signature", () => {
    cover("voxel-skin-snapshot");
    const snapPath = join(dirname(fileURLToPath(import.meta.url)), "__snapshots__/roster.json");
    const snap = JSON.parse(readFileSync(snapPath, "utf8")) as {
      count: number;
      signatures: Record<string, string>;
    };
    expect(snap.count).toBe(ALL.length);
    const drift: string[] = [];
    for (const r of ALL) {
      const want = snap.signatures[r.championId];
      const got = lookSignature(r);
      if (want !== got) drift.push(`${r.championId}: ${want} -> ${got}`);
    }
    expect(drift).toEqual([]);
  });
});

// ===========================================================================
// GH#31 —— 預設身體規則:有暴雪模型的走暴雪,沒有的才是體素
// ===========================================================================
//
// owner 2026-07-28:「請你都先用暴雪的 3d model，要替換成體素是我從後台設定套用
// 才生效」。
//
// ⚠️ 這一組守的不是「旗標算得對」,而是「**旗標存在的理由沒有被推翻**」。
// 舊規則 `preferVoxelBody = isStandIn` 是自洽的、有測試的、也有一段言之成理的
// 註解 —— 它唯一的問題是 `ChampionView.tryUpgradeToGlb` 在這個旗標上提早 return,
// 於是 overlay 已經解析出來的 40 個真實 WC3 模型,在下一行被丟掉。
// 沒有任何測試會紅,因為每一層各自都對。
describe("GH#31 預設身體:暴雪模型優先,體素是後台選項", () => {
  it("BLIZZARD_MODEL_CHAMPIONS 必須與真實 MANIFEST 逐 id 相符", () => {
    // ⚠️ 這條是整組的地基。那 40 個 id 是抄進 repo 的(manifest 住在
    // data/blizzard-overlay/,不進部署樹),所以它會腐爛 —— 除非有人比對。
    // 抽出新模型卻沒更新清單 → 那位英雄繼續穿體素,而且沒人會知道。
    const manifestPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../../data/blizzard-overlay/MANIFEST.json",
    );
    if (!existsSync(manifestPath)) {
      // overlay 是 git-ignored 的本機資產。CI 沒有它時跳過比對,但**不能**讓
      // 這變成「永遠跳過」—— 下面那條 length 斷言在任何環境都會跑。
      expect(BLIZZARD_MODEL_CHAMPIONS.length).toBe(40);
      return;
    }
    const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      units: Record<string, { champId?: string }>;
    };
    const fromManifest = [
      ...new Set(Object.values(m.units).map((u) => u.champId).filter(Boolean) as string[]),
    ].sort();
    expect([...BLIZZARD_MODEL_CHAMPIONS].sort()).toEqual(fromManifest);
  });

  it("40 位有暴雪模型的替身英雄,預設 NOT 體素", () => {
    // 突變:把 defaultPrefersVoxelBody 改回 `STAND_IN_MODEL_KEYS.includes(...)`
    // → 這 40 條全紅。
    for (const id of BLIZZARD_MODEL_CHAMPIONS) {
      for (const key of STAND_IN_MODEL_KEYS) {
        expect(
          defaultPrefersVoxelBody(key, id),
          `${id} 有抽出來的 WC3 模型,預設不該被鎖在體素`,
        ).toBe(false);
      }
    }
  });

  it("沒有暴雪模型的替身英雄,預設仍是體素", () => {
    // 這四位是唯一還該穿體素的:o02n / u011 沒有抽出模型,sela / thorne 是 CC0
    // 角色本身、不是地圖英雄。少了這條,他們會退回四張共用臉 —— 也就是 #231
    // 整個任務存在的理由被撤銷,而其他每條測試都還是綠的。
    for (const id of ["godie-o02n", "godie-u011", "sela", "thorne"]) {
      expect(defaultPrefersVoxelBody("champ.sela", id), `${id} 沒有自己的模型`).toBe(true);
    }
  });

  it("不是替身的英雄,永遠不會被預設成體素", () => {
    expect(defaultPrefersVoxelBody("imported.heroichigo", "godie-h01n")).toBe(false);
    expect(defaultPrefersVoxelBody(undefined, "godie-h01n")).toBe(false);
  });

  it("後台 override 雙向都能蓋過預設", () => {
    // 「要替換成體素是我從後台設定套用才生效」—— 所以 true 要能開;
    // 而 false 也要能關,否則 operator 只能單向操作,那不是開關是閘刀。
    const base = generateVoxelSkin({ id: "godie-hapm", name: "x", modelKey: "champ.thorne" });
    expect(base.preferVoxelBody, "hapm 有暴雪模型").toBe(false);

    const forcedVoxel = generateVoxelSkin(
      { id: "godie-hapm", name: "x", modelKey: "champ.thorne" },
      { override: { preferVoxelBody: true } },
    );
    expect(forcedVoxel.preferVoxelBody).toBe(true);

    const forcedGlb = generateVoxelSkin(
      { id: "godie-o02n", name: "x", modelKey: "champ.skin.rogue" },
      { override: { preferVoxelBody: false } },
    );
    expect(forcedGlb.preferVoxelBody, "operator 也要能把體素關掉").toBe(false);
  });
});
