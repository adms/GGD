/**
 * voxelSkin/rules — layer L2 of the override chain: an ORDERED, FROZEN keyword
 * table matched against the champion's own words.
 *
 * THE HAYSTACK is `稱號 + 本名 + tags + w3x silhouette hint + the first 400
 * chars of the description`. FIRST MATCH PER AXIS WINS and a later rule can
 * never overwrite an axis an earlier one decided — so the table reads
 * top-to-bottom as a priority list, and inserting a rule can only affect
 * champions no earlier rule already claimed on that axis.
 *
 * WHY THE PATTERNS ARE NARROW. The prototype's first pass used `/魔王|惡魔|鬼/`
 * and `/王|皇|King/`; measured over the real roster they fired on 31 and 21
 * champions respectively — a third of the field wearing horns is not an
 * identity, it is a uniform. Every pattern here is either anchored, multi-
 * character, or a specific noun, and the head-motif histogram is asserted in
 * generate.test.ts so a future widening shows up as a red test rather than as a
 * roster that quietly converges.
 *
 * IP NOTE: these are Chinese/English NOUNS about body shape and clothing
 * (骷髏 = skeleton, 鎧 = armour, 兜帽 = hood). They select from OUR OWN palette
 * and motif vocabulary. Nothing here reproduces a copyrighted costume design —
 * the strongest statement any rule makes is "this one is undead, so start from
 * the corpse tone".
 */

/** Which axis of the recipe a rule forces. */
export type RuleAxis = "skin" | "top" | "legs" | "eye" | "mouth" | "head" | "shoulder" | "back";

export interface SkinRule {
  /** matched against the champion haystack (case-insensitive where relevant) */
  re: RegExp;
  axis: RuleAxis;
  value: string;
  /** why this rule exists — shown in the admin sheet next to the match */
  why: string;
}

export const SKIN_RULES: readonly SkinRule[] = Object.freeze([
  // ---- material / pallor: the strongest single read on the body ----
  {
    re: /骷髏|不死|亡靈|殭屍|喪屍|屍體|幽靈|怨靈|貞子|Banshee|Undead|Ghost|Skeleton|Zombie/,
    axis: "skin",
    value: "corpse",
    why: "undead / spectral — corpse pallor",
  },
  {
    re: /機械|機器人|鋼鐵人|破銅爛鐵|鐵人|初號機|兵器|Robot|Golem|Statue|Mecha/,
    axis: "skin",
    value: "chrome",
    why: "construct / mecha — plated chrome",
  },
  {
    re: /熊貓|北極熊|狗熊|Panda|PolarBear|Bear|Wolf|Beast|Satyr/,
    axis: "skin",
    value: "fur-ochre",
    why: "beast silhouette — fur",
  },
  {
    re: /樹精|老樹|古樹|森林|AncientProtector|Treant/,
    axis: "skin",
    value: "verdigris",
    why: "plant / ancient — bark verdigris",
  },
  {
    re: /惡魔|魔族|Eredar|Demon|Felguard|Doomguard/,
    axis: "skin",
    value: "ink",
    why: "demonic — ink hide",
  },
  // ---- silhouette of the outfit ----
  {
    re: /女僕|maid|Sakuya/,
    axis: "top",
    value: "tunic",
    why: "maid uniform — fitted tunic",
  },
  {
    re: /法師|魔導|魔女|巫師|僧侶|袈裟|Mage|Warlock|Witch|Sorcer|Priest/,
    axis: "top",
    value: "robe",
    why: "caster — robe",
  },
  {
    re: /騎士|鎧甲|甲冑|聖騎|Paladin|Knight|Arthas|MountainKing/,
    axis: "top",
    value: "plate",
    why: "armoured — plate",
  },
  {
    re: /忍者|忍|刺客|Assassin|Kunoichi|Rogue|Runner/,
    axis: "top",
    value: "jacket",
    why: "stealth — close jacket",
  },
  {
    re: /劍士|劍客|武士|浪人|katana|居合|Samurai|Kenshin|Musashi/,
    axis: "top",
    value: "kimono",
    why: "swordsman — kimono",
  },
  {
    re: /筋肉|肌肉|蠻族|野獸人|Grunt|Barbarian|Berserker|Brewmaster/,
    axis: "top",
    value: "bare-chest",
    why: "brawler — bare chest",
  },
  // ---- face ----
  {
    re: /獨眼|單眼|眼罩|義眼|Eyepatch|OneEye/,
    axis: "eye",
    value: "single-eyepatch",
    why: "one-eyed — eyepatch",
  },
  {
    re: /面具|假面|蒙面|Mask|Masked/,
    axis: "mouth",
    value: "mask-band",
    why: "masked — face band",
  },
  {
    re: /獠牙|吸血|Vampire|Fang/,
    axis: "mouth",
    value: "fang",
    why: "fanged",
  },
  // ---- head motif ----
  {
    re: /角魔|魔王|大魔王|牛頭|Horned|Hellscream|Doom/,
    axis: "head",
    value: "horns",
    why: "demon lord — horns",
  },
  {
    re: /貓耳|狐耳|犬耳|獸耳|九尾|熊貓|Panda|Kitsune/,
    axis: "head",
    value: "beast-ears",
    why: "beast ears",
  },
  {
    re: /^(?:大帝|皇帝|國王|女王|王者)|陛下|Emperor|Monarch/,
    axis: "head",
    value: "crown",
    why: "sovereign — crown",
  },
  {
    re: /兜帽|斗篷客|死神|Reaper|Hooded|Banshee/,
    axis: "head",
    value: "hood",
    why: "hooded",
  },
  {
    re: /天使|聖女|神官|Angel|Seraph|Holy/,
    axis: "head",
    value: "halo",
    why: "celestial — halo",
  },
  {
    re: /斗笠|草帽|禮帽|Hat|Straw/,
    axis: "head",
    value: "brim-hat",
    why: "hatted",
  },
  // ---- back motif ----
  {
    re: /九尾|尾巴|狐狸|Tail|Fox/,
    axis: "back",
    value: "tail",
    why: "tailed",
  },
  {
    re: /圍巾|披風|斗篷|Cape|Cloak|Scarf/,
    axis: "back",
    value: "cape",
    why: "cloaked",
  },
  {
    re: /背包|行商|旅人|Backpack|Traveler/,
    axis: "back",
    value: "backpack",
    why: "traveller — pack",
  },
  {
    re: /翅膀|羽翼|Wing|Winged/,
    axis: "back",
    value: "wing-stubs",
    why: "winged",
  },
  // ---- shoulder motif ----
  {
    re: /重裝|將軍|大將|Warlord|General|Chieftain/,
    axis: "shoulder",
    value: "pauldrons",
    why: "commander — pauldrons",
  },
  {
    re: /荊棘|尖刺|Spike|Thorn/,
    axis: "shoulder",
    value: "spikes",
    why: "spiked",
  },
]);

/** A rule that fired, with the axis it claimed — surfaced by the admin sheet. */
export interface RuleHit {
  axis: RuleAxis;
  value: string;
  why: string;
  /**
   * The literal text in the champion's own words that fired this rule (task
   * #231's inspectability requirement). "the 稱號 matched" is not an
   * explanation; 「貞子」 is. Without it the sheet can say WHICH rule decided an
   * axis but not WHY that rule thought this champion qualified, which is the
   * half an owner needs to judge whether the derivation is right or merely
   * confident. Filled from the RegExp's own match, so it cannot drift from the
   * pattern that produced it.
   */
  match: string;
}

/**
 * Run the table over `haystack`. FIRST MATCH PER AXIS WINS; later rules on an
 * already-decided axis are skipped, not merged.
 */
export function matchRules(haystack: string): { forced: Map<RuleAxis, string>; hits: RuleHit[] } {
  const forced = new Map<RuleAxis, string>();
  const hits: RuleHit[] = [];
  for (const rule of SKIN_RULES) {
    if (forced.has(rule.axis)) continue;
    // `exec`, not `test`: it decides the same thing and additionally reports
    // WHICH word fired. Every pattern here is unanchored and stateless (no /g),
    // so `exec` cannot advance a lastIndex between champions.
    const m = rule.re.exec(haystack);
    if (m === null) continue;
    forced.set(rule.axis, rule.value);
    hits.push({ axis: rule.axis, value: rule.value, why: rule.why, match: m[0] });
  }
  return { forced, hits };
}
