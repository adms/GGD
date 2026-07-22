/**
 * championIdentity — the champion IDENTITY rule and, more importantly, the
 * LENIENCY POLICY behind it.
 *
 * This suite is a POLICY PIN, not just a unit test. The user ruled explicitly
 * (2026-07-22)「遇到疑慮一律判斷寬鬆為多英雄」— when in doubt, treat entries as
 * SEPARATE heroes — because the costs are asymmetric: a wrongly-merged champion
 * silently disappears from the game along with its bespoke kit (the 黑化Saber
 * bug), while a wrongly-kept duplicate is cosmetic and trivially removed later.
 * A future refactor that "cleans up" the rule into something tighter must fail
 * here rather than quietly erase a hero.
 *
 * Everything below runs against the REAL content tree (direct file reads, no
 * ContentLoader/_index.json dependency — same approach as standinRoster.test.ts
 * so the suite is green regardless of when the indexes were last rebuilt), plus
 * a cross-check against the importer's own HERO_NUMBERS.json.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cover } from "../../testkit/cover";
import {
  characterKeys,
  distinctCharacters,
  groupCharacters,
  heroNumberCollisions,
  heroNumberFromAbilityName,
  heroNumberOf,
  isSameCharacter,
  nameComponents,
  RANDOM_HERO_POOL_IDS,
  type IdentityChampion,
} from "./championIdentity";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const CHAMP_DIR = join(CONTENT_DIR, "champions");
const HERO_NUMBERS_PATH = join(
  HERE,
  "../../../../tools/w3x-import/out/GoDieEX22s-src/HERO_NUMBERS.json",
);

interface RawChampion {
  id: string;
  schema?: string;
  name: string;
  modelKey?: string;
  exAbility?: string;
  abilities?: Record<string, { name?: string } | undefined>;
}

/** Every champion@1 doc on disk, as the identity helper wants to see it. */
function loadRoster(): (IdentityChampion & { exAbility?: string })[] {
  const out: (IdentityChampion & { exAbility?: string })[] = [];
  for (const file of readdirSync(CHAMP_DIR).sort()) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(CHAMP_DIR, file), "utf8")) as RawChampion;
    if (doc.schema !== "champion@1") continue;
    const exPath = doc.exAbility ? join(CONTENT_DIR, "abilities", `${doc.exAbility}.json`) : null;
    const exName =
      exPath && existsSync(exPath)
        ? (JSON.parse(readFileSync(exPath, "utf8")) as { name?: string }).name
        : undefined;
    out.push({
      id: doc.id,
      name: doc.name,
      modelKey: doc.modelKey,
      abilities: doc.abilities,
      ...(exName === undefined ? {} : { exAbilityName: exName }),
    });
  }
  return out;
}

const ROSTER = loadRoster();
const byId = new Map(ROSTER.map((c) => [c.id, c]));
const champ = (id: string): IdentityChampion => {
  const c = byId.get(id);
  if (!c) throw new Error(`champion ${id} missing from content/champions`);
  return c;
};
const KEYS = characterKeys(ROSTER);
const sameCharacter = (a: string, b: string): boolean => KEYS.get(a) === KEYS.get(b);

// ---------------------------------------------------------------------------

describe("hero-number parsing (champion-identity-hero-number)", () => {
  it("reads the task #11 `NN-0X` / `NN-00X` prefix, including the unspaced ones", () => {
    cover("champion-identity-hero-number");
    expect(heroNumberFromAbilityName("20-01 風王結界")).toBe("20");
    expect(heroNumberFromAbilityName("69-02 黑泥召喚")).toBe("69");
    expect(heroNumberFromAbilityName("20-002 解放.約束勝利劍MAX")).toBe("20");
    // real content: godie-u011's Q ships with no space after the prefix
    expect(heroNumberFromAbilityName("61-01惡魔球")).toBe("61");
    // not a hero-number prefix
    expect(heroNumberFromAbilityName("風王結界")).toBeNull();
    expect(heroNumberFromAbilityName("1-01 foo")).toBeNull();
    expect(heroNumberFromAbilityName("20-0123 foo")).toBeNull();
    expect(heroNumberFromAbilityName(undefined)).toBeNull();
  });

  it("resolves a champion's number from its kit, and refuses when the kit disagrees", () => {
    expect(heroNumberOf(champ("godie-e002"))).toBe("20");
    expect(heroNumberOf(champ("godie-e00q"))).toBe("69");
    // AMBIGUOUS kit ⇒ null ⇒ (per policy) can never prove sameness.
    const mixed: IdentityChampion = {
      id: "x",
      name: "x",
      abilities: { Q: { name: "20-01 a" }, W: { name: "69-02 b" } },
    };
    expect(heroNumberOf(mixed)).toBeNull();
    expect(isSameCharacter(mixed, champ("godie-e002"))).toBe(false);
  });

  it("agrees with the importer's HERO_NUMBERS.json on every champion it knows", () => {
    cover("champion-identity-importer-agreement");
    if (!existsSync(HERO_NUMBERS_PATH)) return; // importer output not checked out
    const raw = JSON.parse(readFileSync(HERO_NUMBERS_PATH, "utf8")) as {
      hero_to_number: Record<string, string>;
    };
    const authority = new Map(
      Object.entries(raw.hero_to_number).map(([code, num]) => [`godie-${code.toLowerCase()}`, num]),
    );
    const disagreements: string[] = [];
    let checked = 0;
    for (const c of ROSTER) {
      const want = authority.get(c.id);
      if (want === undefined) continue;
      checked++;
      const got = heroNumberOf(c);
      if (got !== want) disagreements.push(`${c.id} ${c.name}: docs say ${got}, importer says ${want}`);
    }
    expect(disagreements).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(100);
  });
});

describe("黑化Saber stays a separate hero (champion-identity-saber-alter)", () => {
  it("does NOT collapse godie-e00q into godie-e002 / godie-e00l", () => {
    cover("champion-identity-saber-alter");
    // Same mesh, same extracted portrait, near-identical name — every heuristic
    // the old code used said "duplicate". The hero number says otherwise.
    expect(champ("godie-e00q").modelKey).toBe(champ("godie-e002").modelKey);
    expect(heroNumberOf(champ("godie-e00q"))).toBe("69");
    expect(heroNumberOf(champ("godie-e002"))).toBe("20");

    expect(isSameCharacter(champ("godie-e00q"), champ("godie-e002"))).toBe(false);
    expect(isSameCharacter(champ("godie-e00q"), champ("godie-e00l"))).toBe(false);
    expect(sameCharacter("godie-e00q", "godie-e002")).toBe(false);
    expect(sameCharacter("godie-e00q", "godie-e00l")).toBe(false);

    // …while its two genuine twins DO collapse, to one surviving entry.
    expect(sameCharacter("godie-e002", "godie-e00l")).toBe(true);

    const survivors = distinctCharacters(ROSTER).map((c) => c.id);
    expect(survivors).toContain("godie-e00q");
    expect(survivors).toContain("godie-e002");
    expect(survivors).not.toContain("godie-e00l");

    // 黑泥召喚 is bespoke — it exists on this champion and nowhere else. If a
    // merge ever swallows e00q, this kit is what gets lost.
    const w = champ("godie-e00q").abilities?.["W"]?.name ?? "";
    expect(w).toContain("黑泥");
    const others = ROSTER.filter((c) => c.id !== "godie-e00q").flatMap((c) =>
      Object.values(c.abilities ?? {}).map((a) => a?.name ?? ""),
    );
    expect(others.some((n) => n.includes("黑泥"))).toBe(false);
  });
});

describe("true duplicates still collapse (champion-identity-true-duplicates)", () => {
  /**
   * The 14 model-keyed pairs established in the main session, plus the two
   * pairs whose mesh carries a THIRD champion so they are not a clean "pair"
   * (herosaber also wears 黑化Saber; heromusashimiyamoto also wears the test
   * hero godie-u01q), plus the two cross-MODEL pairs whose display names are
   * byte-identical (one entry got the real import, its twin a stand-in).
   */
  const PAIRS: readonly (readonly [string, string, string])[] = [
    ["90", "godie-hgam", "godie-h02r"], // 種子神奇寶貝 妙蛙種子/妙蛙花  imported.bulbasaur
    ["09", "godie-ogrh", "godie-o00x"], // 悟空 / 超級賽亞人-悟空        imported.goku
    ["38", "godie-uvng", "godie-u010"], // 邪眼師 - 飛影                imported.herohehi
    ["79", "godie-h01n", "godie-h01o"], // 黑崎一護                     imported.heroichigo
    ["19", "godie-e00k", "godie-e00z"], // 戰國刺客Azumi - 安云          imported.herokunoichi
    ["12", "godie-ewar", "godie-e007"], // 龍之子 - 天地志狼             imported.herolingtong
    ["92", "godie-h02v", "godie-h02u"], // 看似憂鬱的神獸 - 草泥馬        imported.horse
    ["04", "godie-hjai", "godie-h020"], // 黑魔導士 - 莉娜因巴斯          imported.linainvers
    ["42", "godie-n003", "godie-n01g"], // 黑暗福音 - 依文潔琳            imported.long
    ["76", "godie-u00n", "godie-u00o"], // 草帽小子 - 蒙其.D.魯夫         imported.luffe
    ["77", "godie-e00w", "godie-e00x"], // 神鳴流劍士 - 櫻綻剎那          imported.mfls
    ["81", "godie-o01z", "godie-o02v"], // 高町奈葉 魔砲少女/白色惡魔     imported.niya
    ["22", "godie-e001", "godie-e00n"], // 蟬在叫人壞掉 - 龍宮禮奈        imported.renaryugu2
    ["08", "godie-nbbc", "godie-n01c"], // 傳說的龍騎士 - 勇者小呆        imported.sd2
    ["20", "godie-e002", "godie-e00l"], // 亞瑟王 - Saber                imported.herosaber
    ["11", "godie-udre", "godie-u01u"], // 三刀流劍士 - 索隆              imported.heromusashimiyamoto
    ["06", "godie-ucrl", "godie-u034"], // 職業獵人 - 傑 富力士  (thorne stand-in ⇄ herobiggon)
    ["18", "godie-nsjs", "godie-n00p"], // 妖狐藏馬 - 南野秀一   (fox2 ⇄ fox)
  ] as const;

  it("collapses every known duplicate pair to exactly one surviving entry", () => {
    cover("champion-identity-true-duplicates");
    const survivors = new Set(distinctCharacters(ROSTER).map((c) => c.id));
    for (const [num, keep, drop] of PAIRS) {
      expect(heroNumberOf(champ(keep)), `${keep} number`).toBe(num);
      expect(heroNumberOf(champ(drop)), `${drop} number`).toBe(num);
      expect(isSameCharacter(champ(keep), champ(drop)), `${keep} ≡ ${drop}`).toBe(true);
      expect(sameCharacter(keep, drop), `${keep} ≡ ${drop} in roster`).toBe(true);
      expect(survivors.has(keep), `${keep} survives`).toBe(true);
      expect(survivors.has(drop), `${drop} folded away`).toBe(false);
    }
    // 18 pairs fold ⇒ the roster loses exactly 18 entries and nothing else.
    expect(ROSTER.length - survivors.size).toBe(PAIRS.length);
  });

  it("keeps the map's own random-hero pick as the canonical id of each pair", () => {
    // The pool ORDERS a proven group; it never forms one (see the constant's
    // comment — misreading it as an identity signal is what hid 黑化Saber).
    for (const [, keep, drop] of PAIRS) {
      if (!RANDOM_HERO_POOL_IDS.has(keep) && !RANDOM_HERO_POOL_IDS.has(drop)) continue;
      expect(RANDOM_HERO_POOL_IDS.has(keep), `${keep} is the pool entry`).toBe(true);
      expect(RANDOM_HERO_POOL_IDS.has(drop), `${drop} is not the pool entry`).toBe(false);
    }
  });
});

describe("stand-in meshes never imply sameness (champion-identity-standin-mesh)", () => {
  const STAND_INS = ["champ.sela", "champ.thorne", "champ.skin.barbarian", "champ.skin.rogue"];

  it("treats every champion sharing a CC0 stand-in as its own character", () => {
    cover("champion-identity-standin-mesh");
    for (const mesh of STAND_INS) {
      const wearers = ROSTER.filter((c) => c.modelKey === mesh);
      expect(wearers.length, `${mesh} wearers`).toBeGreaterThan(1);
      const keys = new Set(wearers.map((c) => KEYS.get(c.id)));
      // Every wearer keeps its own identity — no two are ever folded together.
      expect(keys.size, `${mesh} wearers stay distinct`).toBe(wearers.length);
      for (const a of wearers) {
        for (const b of wearers) {
          if (a.id === b.id) continue;
          expect(isSameCharacter(a, b), `${a.id} vs ${b.id} on ${mesh}`).toBe(false);
        }
      }
    }
    // The headline example: champ.sela is worn by 18 unrelated characters.
    expect(ROSTER.filter((c) => c.modelKey === "champ.sela").length).toBeGreaterThanOrEqual(15);
  });
});

describe("numberless champions each stay distinct (champion-identity-no-number)", () => {
  /** The documented fallback set: no parseable number anywhere in the kit. */
  const NUMBERLESS = [
    "godie-e00u", // 完全而瀟灑的女僕 - 十六夜Sakuya
    "godie-u01f", // 萬夫莫敵 - 黑化張飛
    "godie-h02n", // 腦包英雄 - 打我阿笨蛋
    "godie-u01q", // 測試英雄 - 索隆 (a test hero — still its own identity here)
    "sela", // non-w3x original
    "thorne", // non-w3x original
  ];

  it("gives each an `id:` key of its own and never merges two of them", () => {
    cover("champion-identity-no-number");
    const found = ROSTER.filter((c) => heroNumberOf(c) === null).map((c) => c.id).sort();
    expect(found).toEqual([...NUMBERLESS].sort());

    for (const id of NUMBERLESS) {
      expect(KEYS.get(id), `${id} is its own canonical`).toBe(id);
    }
    const groups = groupCharacters(ROSTER);
    for (const id of NUMBERLESS) {
      const g = groups.find((x) => x.canonicalId === id);
      expect(g?.key, `${id} key`).toBe(`id:${id}`);
      expect(g?.ids, `${id} group`).toEqual([id]);
      expect(g?.heroNumber).toBeNull();
    }
    // …and never merged into a NUMBERED hero either, however similar the name.
    // godie-u01q 測試英雄-索隆 shares 索隆 AND its mesh with hero 11's 三刀流劍士.
    expect(champ("godie-u01q").modelKey).toBe(champ("godie-udre").modelKey);
    expect(isSameCharacter(champ("godie-u01q"), champ("godie-udre"))).toBe(false);
    // 黑化張飛 vs 十六夜Sakuya: both numberless — still two heroes, not one.
    expect(isSameCharacter(champ("godie-u01f"), champ("godie-e00u"))).toBe(false);
    expect(distinctCharacters(ROSTER).map((c) => c.id)).toEqual(
      expect.arrayContaining(NUMBERLESS),
    );
  });
});

describe("leniency policy pins (champion-identity-leniency)", () => {
  it("keeps BOTH sides of every hero-number collision, and reports them", () => {
    cover("champion-identity-leniency");
    const collisions = heroNumberCollisions(ROSTER);
    expect(collisions.map((c) => c.heroNumber)).toEqual(["05", "25", "53", "58", "61", "91"]);

    const members = (num: string): string[] =>
      (collisions.find((c) => c.heroNumber === num)?.characters ?? [])
        .map((g) => g.canonicalId)
        .sort();
    // UNRELATED — the map author cloned a hero and never renumbered it.
    expect(members("05")).toEqual(["godie-h021", "godie-hblm"]); // 阿強一號 / 賈修貝爾
    expect(members("53")).toEqual(["godie-o00l", "godie-o02s"]); // 傑洛士 / 涼宮八ㄦ匕
    expect(members("61")).toEqual(["godie-u011", "godie-u012"]); // 克勞薩先生 / 克勞薩II世
    expect(members("91")).toEqual(["godie-h02s", "godie-h02z"]); // 死亡騎士 / 不良少年
    // RELATED — a skin/variant of one franchise character on two meshes.
    expect(members("25")).toEqual(["godie-u00l", "godie-umal"]); // 拳四郎 ×2
    expect(members("58")).toEqual(["godie-o02l", "godie-ofar"]); // 皮卡丘 ×2
    const related = (num: string): boolean =>
      collisions.find((c) => c.heroNumber === num)?.related ?? false;
    expect([related("25"), related("58")]).toEqual([true, true]);
    expect([related("05"), related("53"), related("61"), related("91")]).toEqual([
      false,
      false,
      false,
      false,
    ]);

    // Shipped behaviour, both flavours: every colliding champion stays.
    const survivors = new Set(distinctCharacters(ROSTER).map((c) => c.id));
    for (const c of collisions) {
      for (const g of c.characters) {
        expect(survivors.has(g.canonicalId), `${g.canonicalId} kept despite the collision`).toBe(
          true,
        );
      }
    }
  });

  it("keeps same-number/different-mesh variants apart (skins are not duplicates)", () => {
    // hero 25 拳四郎 and hero 58 皮卡丘 each appear on two DIFFERENT meshes with
    // different 稱號. A shared name component alone must never merge them.
    expect(sameCharacter("godie-umal", "godie-u00l")).toBe(false);
    expect(sameCharacter("godie-ofar", "godie-o02l")).toBe(false);
    expect(nameComponents("北斗神拳掌門人 - 拳四郎")).toEqual(["北斗神拳掌門人", "拳四郎"]);
    expect(nameComponents("英靈-亞瑟王 - 黑化Saber")).toEqual(["英靈-亞瑟王", "黑化Saber"]);
  });

  it("is reflexive, symmetric and order-independent", () => {
    for (const c of ROSTER) expect(isSameCharacter(c, c)).toBe(true);
    const pairs: [string, string][] = [
      ["godie-e002", "godie-e00l"],
      ["godie-e002", "godie-e00q"],
      ["godie-h021", "godie-hblm"],
    ];
    for (const [a, b] of pairs) {
      expect(isSameCharacter(champ(a), champ(b))).toBe(isSameCharacter(champ(b), champ(a)));
    }
    const reversed = characterKeys([...ROSTER].reverse());
    const groupOf = (m: Map<string, string>, id: string): string[] =>
      [...m.entries()].filter(([, k]) => k === m.get(id)).map(([i]) => i).sort();
    for (const c of ROSTER) {
      expect(groupOf(reversed, c.id), `${c.id} grouping is order-independent`).toEqual(
        groupOf(KEYS, c.id),
      );
    }
  });

  it("never merges on missing evidence — a partial view can only look MORE distinct", () => {
    // Same champions, but the caller only knows id+name (no mesh, no kit).
    const thin = ROSTER.map((c) => ({ id: c.id, name: c.name }));
    const thinKeys = characterKeys(thin);
    for (const c of ROSTER) expect(thinKeys.get(c.id)).toBe(c.id);
    expect(distinctCharacters(thin)).toHaveLength(ROSTER.length);
  });
});
