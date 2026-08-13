/**
 * voxelSkin/generate — the invariants that make #231 a finished feature rather
 * than a pile of colours.
 *
 * Driven against the REAL champion tree read off disk, not a fixture. That is
 * the point: "no two champions look the same" is a property of THIS ROSTER, and
 * a fixture of three toy heroes proves nothing about it. Adding a champion that
 * collides with an existing look turns this file red instead of shipping a twin.
 *
 * ⚠️ THE ROSTER SIZE IS NOT A CONSTANT AND MUST NOT BE WRITTEN DOWN HERE.
 * It has been 114, then 119, and on 2026-08-13 it became 78 when every
 * unreleased champion moved to `content/_legacy/` (out of `COLLECTION_NAMES`,
 * so the engine cannot read them at all). Four assertions in this file had that
 * number copied into them and all four went red at once while the generator was
 * perfectly fine. Everything below is derived from `DOCS` / `ALL`; the only
 * floors are structural ones ("not zero", "both sides of the partition are
 * populated") that say why an empty set would make the surrounding loop a
 * green no-op.
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
import { counterpartFormId } from "../championForms";
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
    // Structural floor only — an empty read would make the `for` below (and
    // every other loop in this file) pass by doing nothing. The census itself
    // is `DOCS.length`, which is the roster, not a number typed here.
    expect(DOCS.length, "champions/ read as empty").toBeGreaterThan(0);
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
   * ⚠️ THE POPULATION OF THIS TEST IS A MOVING NUMBER — DO NOT WRITE IT DOWN.
   *
   * The shared-stand-in population has been 43 (#217 gave 喪標麥可 its own zombie
   * mesh and it left the group), then 44 (#249 imported 曹操孟德's BASE unit
   * O02N), then 48 (#249's transform mechanic forced the four 變身 ALTERNATE
   * bodies to be imported for real, each wearing its BASE half's stand-in), and
   * on 2026-08-13 it dropped again when the unreleased champions moved to
   * `content/_legacy/`. Every one of those moves was a CORRECT change, and every
   * one of them broke a hardcoded census here. The counts and the id list are
   * therefore gone; what is asserted is the RELATION the counts existed to
   * protect:
   *
   *     拿得到 WC3 模型(自己或變身對半) ⇔ 不該被鎖在體素身體上
   *
   * plus a structural check that BOTH sides of that partition are populated, so
   * the loop can never degenerate into a one-sided assertion.
   *
   * ⚠️ Still true and still recorded: a champion can be on a stand-in mesh and
   * reach NO model at all, and that is a real art gap rather than a bug here.
   * `BLIZZARD_MODEL_CHAMPIONS` is asserted id-for-id against
   * `data/blizzard-overlay/MANIFEST.json` below; where the #10 extraction never
   * pulled a model, the honest fix is an extraction pass, not an edit to that
   * list. The 變身 ALTERNATE halves are the usual case — their BASE halves are on
   * the manifest, so a transform on such a pair swaps a real WC3 model for a
   * voxel stand-in.
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
    // 結構性下界,不是普查:替身族群空了,下面那個迴圈就是一條綠色的空迴圈,
    // 而 #231 存在的理由(不要 N 位英雄共用一張臉)也就沒有任何東西在守。
    expect(standIns.length, "沒有任何英雄共用替身網格 —— 這條測試會退化成空迴圈").toBeGreaterThan(0);

    /**
     * ⚠️ 2026-07-30 (#223) —— 「拿不拿得到 WC3 模型」不等於「自己在 manifest 裡」。
     * 這一段本來寫的是 `withBlizzard → false / without → true`,也就是把
     * `BLIZZARD_MODEL_CHAMPIONS` 當成判準抄了一份。#223 之後多了一條
     * 「缺省即繼承」:變身態可以**經由對半**拿到模型(抽取器只拉了 40 個可選
     * 單位,所以 26 對裡的 `Emeu` 那一半天生不在名單上)。舊寫法於是把
     * e010 / h00w / n01b / o030 / u011 / o02n 判在錯的一邊。
     * 判準改成陳述**意圖**:自己或對半任一有模型 ⇒ 不該鎖體素。
     */
    const reachesAModel = (id: string): boolean =>
      BLIZZARD_MODEL_CHAMPIONS.includes(id) ||
      BLIZZARD_MODEL_CHAMPIONS.includes(counterpartFormId(id) ?? "");
    for (const d of standIns) {
      expect(
        ROSTER.recipes.get(d.id)!.preferVoxelBody,
        reachesAModel(d.id)
          ? `${d.id} 拿得到 WC3 模型(自己或變身對半),不該被鎖在體素`
          : `${d.id} 沒有任何模型可穿 —— 退回共用替身會讓 #231 整個任務失效`,
      ).toBe(!reachesAModel(d.id));
    }
    // 而且兩邊都不可以是空的,否則上面那個迴圈退化成單邊斷言 —— 全部 true 或
    // 全部 false 的迴圈,對「反過來也對」的實作一樣是綠的(失敗形態④)。
    // ⛔ 兩邊的**人數**不寫在這裡:那是名冊,名冊會變(見上面的區塊註解)。
    expect(
      standIns.filter((d) => reachesAModel(d.id)).length,
      "沒有一位替身英雄拿得到 WC3 模型 —— 迴圈變成單邊斷言",
    ).toBeGreaterThan(0);
    expect(
      standIns.filter((d) => !reachesAModel(d.id)).length,
      "沒有一位替身英雄需要體素身體 —— 迴圈變成單邊斷言",
    ).toBeGreaterThan(0);

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
   *
   * ── 2026-07-30 的一次刻意重生成，記在這裡因為它是這個快照存在的理由 ──
   * `godie-hlgr` 與 `godie-hvwd` 的四組顏色變了，**而部件完全相同**。
   * 那個組合（同部件、換顏色）就是診斷：顏色走 `frac(id, salt, …)`，只吃 id 與
   * salt；部件走規則表。部件沒動 ⇒ 規則沒變 ⇒ **只可能是 salt 變了**。
   *
   * salt 來自碰撞棘輪。同一天 `types.ts` 的 `preferVoxelBody` 加了「變身的另一半
   * 繼承對方的答案」那條（#223），**6 位英雄從方塊人換回自己真正的 WC3 網格**
   * （godie-h00w→Harf、o030→Orkn、n01b→Nman、e010→E00S、u011→U012、o02n→O02O）。
   * 體素名冊縮小 ⇒ 棘輪重新分配 salt ⇒ 排在後面的兩位換了配色。
   *
   * 也就是說：**這次漂移是一個好改動的正確後果，不是缺陷。** 重生成後仍是
   * 每位英雄一種外觀（零碰撞），owner 要的那個性質沒有被破壞。
   * ⚠️ 下次看到漂移時先做同一個判斷：**部件也變了嗎？** 變了才是規則或階梯出事。
   *
   * ── 2026-08-13 的第二次刻意重生成 —— 而它是「零漂移」的那一種 ──
   * 未上架英雄搬進 `content/_legacy/`，名冊 119 → 78。快照因此要重生成，
   * ⚠️ 但重生成前先量過一件事：**留下來的每一位，簽章逐字未變**（78/78 相同，
   * 0 筆漂移）。所以這次的 diff 是**純刪掉 41 列**，沒有任何人換臉。
   * 那個量測不是禮貌，是判斷依據：外觀走 `frac(id, salt, …)`，只有**碰撞棘輪**
   * 會讓名冊大小影響顏色 —— 而 `ROSTER.escalated` 兩邊都是空的（上面那條
   * determinism 測試在守），所以縮小名冊本來就不該動到任何人。量到 0 筆漂移，
   * 就證明棘輪確實沒被驚動。⚠️ 如果哪天縮名冊卻量到漂移，先去看 escalated。
   *
   * ── 2026-08-13 的第三次刻意重生成 —— **一位英雄，只有顏色** ──
   * 15-03 獄炎煉我的 `vfxKey` 從繼承來的 `fx.prim.lightning.nova` 改成
   * `fx.prim.fire.nova`（一支內文講三次火的技能，畫面上炸開的是藍色雷電）。
   * ⭐ 而配色的**元素帶**正是從 `input.vfxKeys` 推的（`generate.ts` 的 L3），
   *   所以涅吉 `godie-emfr` 的主/次元素跟著移 ⇒ 前兩格顏色變了。
   * ⚠️ 照這份檔自己立的判準先問「**部件也變了嗎？**」——
   *   `bowl|single-eyepatch|tunic|shorts|eye|headband|spikes|tail` **逐字未變**。
   *   ⇒ 這是一個好改動的正確後果，⛔ 不是規則或階梯出事。
   *   漂移 1 位，其餘 77 位逐字相同。
   */
  it("matches every champion's committed look signature", () => {
    cover("voxel-skin-snapshot");
    const snapPath = join(dirname(fileURLToPath(import.meta.url)), "__snapshots__/roster.json");
    const snap = JSON.parse(readFileSync(snapPath, "utf8")) as {
      count: number;
      signatures: Record<string, string>;
    };
    expect(snap.count).toBe(ALL.length);
    // ⚠️ `count` is a FIELD, so it can agree with the roster while `signatures`
    // still carries rows for champions that left it — exactly the shape of the
    // 2026-08-13 legacy migration. The drift loop below only walks `ALL`, so it
    // would never look at those ghosts. One line closes it.
    expect(
      Object.keys(snap.signatures).length,
      "快照裡有名冊上已經沒有的英雄(或少了人) —— 重跑 voxel-skins:snapshot",
    ).toBe(snap.count);
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

  it("完全沒有模型可穿的替身英雄,預設仍是體素", () => {
    // ⚠️ 2026-07-30 (#223):這裡本來列的是 o02n / u011 / sela / thorne。
    // 前兩位**已經不該在這張名單上** —— 它們各自的變身對半(o02o / u012)在
    // manifest 裡,「缺省即繼承」讓它們穿得到真的 WC3 模型。留著舊名單就是
    // 一條把「英雄穿方塊人」釘死的測試。
    // 只剩 sela / thorne:CC0 角色本身,不是地圖英雄,沒有任何 WC3 單位在背後。
    // 少了這條,他們會退回共用臉 —— #231 整個任務存在的理由被撤銷,而其他每條
    // 測試都還是綠的。
    for (const id of ["sela", "thorne"]) {
      expect(counterpartFormId(id), `${id} 不該有變身對半`).toBeNull();
      expect(defaultPrefersVoxelBody("champ.sela", id), `${id} 沒有任何模型可穿`).toBe(true);
    }
    // 反向:那兩位是**經由對半**才拿到模型的,所以他們證明繼承那一條真的通了
    for (const id of ["godie-o02n", "godie-u011"]) {
      expect(BLIZZARD_MODEL_CHAMPIONS.includes(id), `${id} 自己不在 manifest 裡`).toBe(false);
      expect(
        defaultPrefersVoxelBody("champ.sela", id),
        `${id}: 缺省即繼承沒生效 —— 這位英雄會被鎖在方塊人身體裡`,
      ).toBe(false);
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
