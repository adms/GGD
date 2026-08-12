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
 *
 * ── 2026-08-13:兩棵樹,兩種母體 ──────────────────────────────────────────────
 * owner 把 41 位沒上架的英雄搬到 `content/_legacy/champions/`(不在
 * `COLLECTION_NAMES` 裡,引擎完全讀不到)。這支測試因此要分清楚兩件事:
 *
 *   `CORPUS` = 營運內容 + 備份區。**規則**的母體。`isSameCharacter` 是一個純函式,
 *              它的政策 pin 是「這兩份文件是不是同一個角色」—— 把一位英雄下架
 *              並不會讓 黑化Saber 變成 Saber。⛔ 這些 pin 不可以因為某一位被下架
 *              就消失,那正是這個檔案存在要防的事(一個角色靜悄悄不見了)。
 *   `LIVE`   = 只有營運內容。**出貨行為**的母體:玩家真的選得到的那些卡,去重之後
 *              還是不是一人一列。
 *
 * ⛔ 讀 `_legacy/` 不等於把它接回引擎 —— 這裡只是讀檔案,註冊表由
 * `COLLECTION_NAMES` 決定,那一份沒有變。
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
import { isAlternateForm, isW3xFormPair } from "./championForms";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const CHAMP_DIR = join(CONTENT_DIR, "champions");
const LEGACY_CHAMP_DIR = join(CONTENT_DIR, "_legacy/champions");
const ABILITY_DIRS = [join(CONTENT_DIR, "abilities"), join(CONTENT_DIR, "_legacy/abilities")];
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

/** The EX ability's display name, from whichever tree still holds the doc. */
function exAbilityName(id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  for (const dir of ABILITY_DIRS) {
    const p = join(dir, `${id}.json`);
    if (existsSync(p)) return (JSON.parse(readFileSync(p, "utf8")) as { name?: string }).name;
  }
  return undefined;
}

/** Every champion@1 doc in one tree, as the identity helper wants to see it. */
function loadRoster(dir: string): (IdentityChampion & { exAbility?: string })[] {
  const out: (IdentityChampion & { exAbility?: string })[] = [];
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".json") || file.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, file), "utf8")) as RawChampion;
    if (doc.schema !== "champion@1") continue;
    const exName = exAbilityName(doc.exAbility);
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

/** 營運內容 —— 玩家真的選得到的那些卡(引擎的註冊表就是這一份)。 */
const LIVE = loadRoster(CHAMP_DIR);
/** 備份區 —— 2026-08-13 下架的那些。引擎讀不到,但**規則**仍然要對它們成立。 */
const ARCHIVE = loadRoster(LEGACY_CHAMP_DIR);
/** 規則的母體:兩棵樹合起來。見檔頭「兩棵樹,兩種母體」。 */
const CORPUS = [...LIVE, ...ARCHIVE];
const LIVE_IDS = new Set(LIVE.map((c) => c.id));

const byId = new Map(CORPUS.map((c) => [c.id, c]));
const champ = (id: string): IdentityChampion => {
  const c = byId.get(id);
  if (!c) throw new Error(`champion ${id} missing from content/champions and content/_legacy`);
  return c;
};
const KEYS = characterKeys(CORPUS);
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
    for (const c of CORPUS) {
      const want = authority.get(c.id);
      if (want === undefined) continue;
      checked++;
      const got = heroNumberOf(c);
      if (got !== want) disagreements.push(`${c.id} ${c.name}: docs say ${got}, importer says ${want}`);
    }
    expect(disagreements).toEqual([]);
    // 反空轉。以前這裡寫 `>= 100`,那是「119 隻」時代的出貨值 —— 母體一動它就紅,
    // 而且是用錯誤的訊息紅(它會說「和 importer 不一致」,真相是有人被下架)。
    // 現在從 importer 那張表本身推導:它認得而語料庫裡也有的 id,**一個都不能被
    // 靜默跳過**,而且那不是三隻 —— 語料庫絕大多數英雄都出自這一次 w3x 匯入。
    const knownHere = CORPUS.filter((c) => authority.has(c.id));
    expect(checked).toBe(knownHere.length);
    expect(knownHere.length).toBeGreaterThan(CORPUS.length * 0.9);
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

    const survivors = distinctCharacters(CORPUS).map((c) => c.id);
    expect(survivors).toContain("godie-e00q");
    expect(survivors).toContain("godie-e002");
    expect(survivors).not.toContain("godie-e00l");

    // 黑泥召喚 is bespoke — it exists on this champion and nowhere else. If a
    // merge ever swallows e00q, this kit is what gets lost. The guard pins the
    // whole ability name 黑泥召喚, NOT the bare 黑泥 motif: 聖杯黑泥醬
    // (godie-zombiex) is legitimately mud-themed (黑泥噴吐 / 黑泥硬化).
    const w = champ("godie-e00q").abilities?.["W"]?.name ?? "";
    expect(w).toContain("黑泥召喚");
    const others = CORPUS.filter((c) => c.id !== "godie-e00q").flatMap((c) =>
      Object.values(c.abilities ?? {}).map((a) => a?.name ?? ""),
    );
    expect(others.some((n) => n.includes("黑泥召喚"))).toBe(false);
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
    ["87", "godie-o02n", "godie-o02o"], // 曹操孟德 - 阿瞞大人   (#249 imported the base O02N)
    // The four 變身 ALTERNATE bodies #249 imported when the transform mechanic
    // landed. They fold by the SAME rule as everything above — byte-identical
    // authored name AND the same stand-in mesh — which is also exactly why they
    // are not in the first playable batch: two halves that share a modelKey are
    // indistinguishable on screen, so the swap needs the FORM bits (and, later,
    // its own art) before a player can see it happen.
    ["70", "godie-e00s", "godie-e010"], // 白木老樹精 - 白木卡迪那 (A0O6 70-00 紮根)
    ["26", "godie-harf", "godie-h00w"], // 豪洨天王 - 鄭先生      (A0EW 26-04 洨者聖臨)
    ["40", "godie-nman", "godie-n01b"], // 地獄歌神 - 憤怒的胖虎   (A0ND 40-03 萬解)
    ["30", "godie-orkn", "godie-o030"], // 電車癡漢 - 臭作        (A0YT 30-002 變態紳士)
  ] as const;

  /**
   * The three pairs that fold ONLY because of the w3x `Eme1`/`Emeu` exception
   * (owner ruling 2026-07-26). They share a hero 編號 but differ in BOTH 稱號 and
   * mesh, so no name/mesh rule above reaches them — they used to be recorded as
   * hero-number COLLISIONS. Kept in their own list so the two mechanisms stay
   * visibly separate: PAIRS folds on names/meshes, this folds on map evidence.
   */
  const W3X_OVERTURNED: readonly (readonly [string, string, string])[] = [
    ["25", "godie-umal", "godie-u00l"], // 北斗神拳掌門人/北斗之鼠 — A0HW 25-04 ChangeDNA
    ["58", "godie-ofar", "godie-o02l"], // 神奇寶貝兒/神騎寶貝    — A040 58-04 瘋狂皮卡丘
    ["61", "godie-u012", "godie-u011"], // 克勞薩II世/克勞薩先生   — Aphx 61-00 百連我殺
  ] as const;

  it("collapses every known duplicate pair to exactly one surviving entry", () => {
    cover("champion-identity-true-duplicates");
    const survivors = new Set(distinctCharacters(CORPUS).map((c) => c.id));
    for (const [num, keep, drop] of [...PAIRS, ...W3X_OVERTURNED]) {
      expect(heroNumberOf(champ(keep)), `${keep} number`).toBe(num);
      expect(heroNumberOf(champ(drop)), `${drop} number`).toBe(num);
      expect(isSameCharacter(champ(keep), champ(drop)), `${keep} ≡ ${drop}`).toBe(true);
      expect(sameCharacter(keep, drop), `${keep} ≡ ${drop} in roster`).toBe(true);
      expect(survivors.has(keep), `${keep} survives`).toBe(true);
      expect(survivors.has(drop), `${drop} folded away`).toBe(false);
    }
    // 19 + 3 pairs fold ⇒ the corpus loses exactly that many entries, nothing else.
    expect(CORPUS.length - survivors.size).toBe(PAIRS.length + W3X_OVERTURNED.length);
  });

  it("搬遷沒有把任何一對切成兩半,而營運內容自己也一人一列", () => {
    cover("champion-identity-true-duplicates");
    const ALL = [...PAIRS, ...W3X_OVERTURNED];
    // ① 2026-08-13 的下架搬遷:一對的兩半必須在**同一側**。base 留在營運內容而
    //    alternate 被搬到 _legacy = 變身時 `Champions.get()` 直接丟例外,而且只有
    //    真的有人按下那一顆技能才會炸(第二守則失敗形態②的親戚:壞掉跟正常長得
    //    一模一樣)。這一條是那個的閘,而且它自己推導,不抄任何隻數。
    const split = ALL.filter(([, a, b]) => LIVE_IDS.has(a) !== LIVE_IDS.has(b));
    expect(
      split.map(([num, a, b]) => `${num}: ${a} ⇄ ${b}`),
      "這幾對被下架搬遷切成了兩半",
    ).toEqual([]);

    // ② 出貨行為:留在營運內容的那些對,在**營運母體**裡仍然摺成一位 —— 摺掉的
    //    數量剛好等於「兩半都還在」的對數,不多(沒有意外合併)也不少(沒有漏摺)。
    const livePairs = ALL.filter(([, a, b]) => LIVE_IDS.has(a) && LIVE_IDS.has(b));
    const liveSurvivors = new Set(distinctCharacters(LIVE).map((c) => c.id));
    expect(LIVE.length - liveSurvivors.size).toBe(livePairs.length);
    // 反空轉:兩棵樹都要真的有東西,否則上面兩條都是對空集合成立。
    expect(livePairs.length).toBeGreaterThan(0);
    expect(ARCHIVE.length).toBeGreaterThan(0);
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

  /**
   * The stand-in wearers that ARE one character: base⇄變身 unit pairs whose w3x
   * model is a Blizzard built-in, so BOTH halves fall through to the same CC0
   * stand-in. They fold on their IDENTICAL AUTHORED NAME plus the w3x form link
   * — never on the shared mesh, which is what this suite exists to forbid.
   *
   * A LIST OF GROUPS, not one flat set (it was a flat set while 曹操 was the only
   * case). `champ.sela` now carries TWO independent pairs, and a flat set would
   * count all four of its members as one group and expect three foldings where
   * only two happen — the arithmetic below has to be per-pair.
   */
  const SAME_CHARACTER_GROUPS: readonly ReadonlySet<string>[] = [
    new Set(["godie-o02n", "godie-o02o"]), // 曹操孟德       — champ.skin.rogue
    new Set(["godie-e00s", "godie-e010"]), // 白木卡迪那 #249 — champ.sela
    new Set(["godie-orkn", "godie-o030"]), // 臭作      #249 — champ.sela
    new Set(["godie-harf", "godie-h00w"]), // 鄭先生    #249 — champ.skin.barbarian
    new Set(["godie-nman", "godie-n01b"]), // 憤怒的胖虎 #249 — champ.skin.rogue
  ];

  /** The group `id` belongs to, or undefined when it is nobody's twin. */
  const groupOf = (id: string): ReadonlySet<string> | undefined =>
    SAME_CHARACTER_GROUPS.find((g) => g.has(id));

  it("treats every champion sharing a CC0 stand-in as its own character", () => {
    cover("champion-identity-standin-mesh");
    for (const mesh of STAND_INS) {
      const wearers = CORPUS.filter((c) => c.modelKey === mesh);
      expect(wearers.length, `${mesh} wearers`).toBeGreaterThan(1);
      const keys = new Set(wearers.map((c) => KEYS.get(c.id)));
      // Every wearer keeps its own identity — no two are ever folded together,
      // except the documented same-character groups above. Each group present on
      // THIS mesh with n>1 members collapses to 1, i.e. loses n-1 keys.
      const folded = SAME_CHARACTER_GROUPS.reduce((n, g) => {
        const here = wearers.filter((c) => g.has(c.id)).length;
        return n + (here > 1 ? here - 1 : 0);
      }, 0);
      expect(keys.size, `${mesh} wearers stay distinct`).toBe(wearers.length - folded);
      for (const a of wearers) {
        for (const b of wearers) {
          if (a.id === b.id) continue;
          if (groupOf(a.id) !== undefined && groupOf(a.id) === groupOf(b.id)) {
            // proven by NAME, so removing the mesh evidence changes nothing
            expect(a.name, "the exemption is a name match, not a mesh match").toBe(b.name);
            continue;
          }
          expect(isSameCharacter(a, b), `${a.id} vs ${b.id} on ${mesh}`).toBe(false);
        }
      }
    }
    // The headline example: champ.sela is worn by 18 unrelated characters.
    expect(CORPUS.filter((c) => c.modelKey === "champ.sela").length).toBeGreaterThanOrEqual(15);
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
    const found = CORPUS.filter((c) => heroNumberOf(c) === null).map((c) => c.id).sort();
    expect(found).toEqual([...NUMBERLESS].sort());

    for (const id of NUMBERLESS) {
      expect(KEYS.get(id), `${id} is its own canonical`).toBe(id);
    }
    const groups = groupCharacters(CORPUS);
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
    expect(distinctCharacters(CORPUS).map((c) => c.id)).toEqual(
      expect.arrayContaining(NUMBERLESS),
    );
  });
});

describe("leniency policy pins (champion-identity-leniency)", () => {
  it("keeps BOTH sides of every hero-number collision, and reports them", () => {
    cover("champion-identity-leniency");
    const collisions = heroNumberCollisions(CORPUS);
    // Was ["05","25","53","58","61","91"]. 25 / 58 / 61 left the list at task
    // #249: the w3x `Eme1`/`Emeu` fields prove each is one hero in two bodies,
    // and the owner ruled (2026-07-26) that such evidence beats the lenient
    // default. The three that remain carry NO transform evidence — the author
    // simply cloned a hero and never renumbered it — so they stay two heroes,
    // which is the point: the exception did not loosen the rule.
    expect(collisions.map((c) => c.heroNumber)).toEqual(["05", "53", "91"]);

    const members = (num: string): string[] =>
      (collisions.find((c) => c.heroNumber === num)?.characters ?? [])
        .map((g) => g.canonicalId)
        .sort();
    // UNRELATED — the map author cloned a hero and never renumbered it.
    expect(members("05")).toEqual(["godie-h021", "godie-hblm"]); // 阿強一號 / 賈修貝爾
    expect(members("53")).toEqual(["godie-o00l", "godie-o02s"]); // 傑洛士 / 涼宮八ㄦ匕
    expect(members("91")).toEqual(["godie-h02s", "godie-h02z"]); // 死亡騎士 / 不良少年
    const related = (num: string): boolean =>
      collisions.find((c) => c.heroNumber === num)?.related ?? false;
    expect([related("05"), related("53"), related("91")]).toEqual([false, false, false]);

    // Shipped behaviour, both flavours: every colliding champion stays.
    const survivors = new Set(distinctCharacters(CORPUS).map((c) => c.id));
    for (const c of collisions) {
      for (const g of c.characters) {
        expect(survivors.has(g.canonicalId), `${g.canonicalId} kept despite the collision`).toBe(
          true,
        );
      }
    }
  });

  it("a shared name component ALONE still never merges (the rule is unchanged)", () => {
    // This used to pin 拳四郎 (25) and 皮卡丘 (58) apart. Both now merge — but on
    // the w3x transform evidence, NOT on names or meshes. The underlying rule is
    // untouched, and the way to show that is to strip the id (which is all the
    // exception reads) and re-ask: with a synthetic id the pair is two heroes
    // again, exactly as before.
    const anonymised = (id: string, as: string): IdentityChampion => ({
      ...champ(id),
      id: as,
    });
    expect(
      isSameCharacter(anonymised("godie-umal", "x1"), anonymised("godie-u00l", "x2")),
      "25 拳四郎: shared 拳四郎 component + different meshes ⇒ still NOT a merge",
    ).toBe(false);
    expect(
      isSameCharacter(anonymised("godie-ofar", "y1"), anonymised("godie-o02l", "y2")),
      "58 皮卡丘: same",
    ).toBe(false);
    expect(nameComponents("北斗神拳掌門人 - 拳四郎")).toEqual(["北斗神拳掌門人", "拳四郎"]);
    expect(nameComponents("英靈-亞瑟王 - 黑化Saber")).toEqual(["英靈-亞瑟王", "黑化Saber"]);
  });

  it("the w3x exception fires ONLY on a real Eme1/Emeu pair (champion-identity-form-exception)", () => {
    cover("champion-identity-form-exception");
    // OVERTURNED: the three the owner ruled on (2026-07-26), now one hero each.
    expect(sameCharacter("godie-umal", "godie-u00l")).toBe(true); // 25 拳四郎
    expect(sameCharacter("godie-ofar", "godie-o02l")).toBe(true); // 58 皮卡丘
    expect(sameCharacter("godie-u012", "godie-u011")).toBe(true); // 61 克勞薩
    expect(isW3xFormPair("godie-umal", "godie-u00l")).toBe(true);
    expect(isW3xFormPair("godie-u00l", "godie-umal")).toBe(true); // symmetric

    // …and the BASE is the id that represents the character, never the body.
    for (const [base, alt] of [
      ["godie-umal", "godie-u00l"],
      ["godie-ofar", "godie-o02l"],
      ["godie-u012", "godie-u011"],
    ] as const) {
      expect(KEYS.get(alt), `${alt} resolves to its base`).toBe(base);
      expect(isAlternateForm(alt), `${alt} is the alternate`).toBe(true);
      expect(isAlternateForm(base), `${base} is not`).toBe(false);
    }

    // NOT OVERTURNED: an unrelated lookalike with no transform evidence stays
    // two heroes. 05 賈修貝爾/阿強一號 share a hero number, the SAME child mesh,
    // the SAME portrait bytes and the same four ability rawcodes — everything
    // except an Eme1/Emeu pair. That is the whole difference.
    expect(isW3xFormPair("godie-hblm", "godie-h021")).toBe(false);
    expect(sameCharacter("godie-hblm", "godie-h021")).toBe(false);
    expect(isW3xFormPair("godie-o00l", "godie-o02s")).toBe(false); // 53
    expect(sameCharacter("godie-o00l", "godie-o02s")).toBe(false);
    expect(isW3xFormPair("godie-h02s", "godie-h02z")).toBe(false); // 91
    expect(sameCharacter("godie-h02s", "godie-h02z")).toBe(false);
    // …and it can never cross a hero number: 黑化Saber (69) vs Saber (20).
    expect(isW3xFormPair("godie-e002", "godie-e00q")).toBe(false);
    expect(sameCharacter("godie-e002", "godie-e00q")).toBe(false);
  });

  it("is reflexive, symmetric and order-independent", () => {
    for (const c of CORPUS) expect(isSameCharacter(c, c)).toBe(true);
    const pairs: [string, string][] = [
      ["godie-e002", "godie-e00l"],
      ["godie-e002", "godie-e00q"],
      ["godie-h021", "godie-hblm"],
    ];
    for (const [a, b] of pairs) {
      expect(isSameCharacter(champ(a), champ(b))).toBe(isSameCharacter(champ(b), champ(a)));
    }
    const reversed = characterKeys([...CORPUS].reverse());
    const groupOf = (m: Map<string, string>, id: string): string[] =>
      [...m.entries()].filter(([, k]) => k === m.get(id)).map(([i]) => i).sort();
    for (const c of CORPUS) {
      expect(groupOf(reversed, c.id), `${c.id} grouping is order-independent`).toEqual(
        groupOf(KEYS, c.id),
      );
    }
  });

  it("never merges on missing evidence — a partial view can only look MORE distinct", () => {
    // Same champions, but the caller only knows id+name (no mesh, no kit).
    const thin = CORPUS.map((c) => ({ id: c.id, name: c.name }));
    const thinKeys = characterKeys(thin);
    for (const c of CORPUS) expect(thinKeys.get(c.id)).toBe(c.id);
    expect(distinctCharacters(thin)).toHaveLength(CORPUS.length);
  });
});
