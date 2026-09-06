/**
 * Feature extraction — turn a champion@1 doc (plus its standalone EX ability
 * and, when available, the raw w3x hero record) into the flat numeric/boolean
 * evidence the classifier scores.
 *
 * READ-ONLY. Nothing in this file writes to content/.
 *
 * Three sources, in order of authority:
 *   1. content/champions/<id>.json — baseStats, growth, embedded Q/W/E/R.
 *   2. content/abilities/<id>.ex.json — the EX, which the champion only refs.
 *      Skipping it would lose a hero's single most characterful skill.
 *   3. tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json — the raw w3x hero
 *      table. OPTIONAL (it is an import artifact); when present it supplies
 *      `primary_attr` and the STR/AGI/INT growth triple, which is the single
 *      strongest role signal WC3 hands us. When absent we recover the same
 *      triple from the "角色成長：" block the importer left in `description`
 *      (present for 100 of 113), and fall back to `null` for the rest.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  championStatBase,
  championStatGrowth,
  type AttributeCarrier,
} from "@ggd/shared/sim/stats/attributes";
import { ALL_STATS, type Stat } from "@ggd/shared/sim/stats/statTypes";
import { resolveTemplateExpansion } from "@ggd/shared/content/templates/resolve";
import { zTemplateDoc, type TemplateDoc } from "@ggd/shared/content/schema/template";

export type Attr = "STR" | "AGI" | "INT";

/**
 * The champion's RESOLVED stat sheet — `baseStats`/`growth` plus the 三圍 term
 * (task #248), at the shipped coefficients. The raw records are no longer the
 * hero: `baseStats.maxHealth` is the source map's 150, not the 575 the sim
 * gives the champion, so classifying on them would score every hero as a
 * fragile low-damage blob.
 */
function resolvedSheet(doc: AttributeCarrier, level: 1 | 2): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of ALL_STATS) {
    out[s as string] =
      level === 1 ? championStatBase(doc, s as Stat, 1) : championStatGrowth(doc, s as Stat);
  }
  return out;
}
const resolvedBase = (doc: AttributeCarrier): Record<string, number> => resolvedSheet(doc, 1);
const resolvedGrowth = (doc: AttributeCarrier): Record<string, number> => resolvedSheet(doc, 2);

export interface Features {
  id: string;
  name: string;
  currentRole: string;
  attackType: "melee" | "ranged";
  tags: string[];
  /**
   * True for the 111 docs the w3x importer generated — the ones whose `role`
   * is a mechanical echo of `attackType` and therefore the ONLY ones this tool
   * proposes to change. sela and thorne are hand-authored CC0 stand-ins that
   * already carry curated roles; they are classified for calibration and then
   * held, never overwritten.
   */
  imported: boolean;

  // --- baseStats / growth ------------------------------------------------
  hp: number;
  hpGrowth: number;
  mana: number;
  manaRegen: number;
  ad: number;
  adGrowth: number;
  armor: number;
  attackSpeed: number;
  moveSpeed: number;
  range: number;

  // --- WC3 attributes ----------------------------------------------------
  /** w3x `primary_attr` when explicitly set, else the highest growth attr. */
  primaryAttr: Attr | null;
  /** true when primaryAttr came from the max-growth fallback, not the map. */
  primaryAttrInferred: boolean;
  strGrowth: number;
  agiGrowth: number;
  intGrowth: number;

  // --- kit shape (Q/W/E/R + EX) -----------------------------------------
  nDamage: number;
  nMagicDamage: number;
  nPhysicalDamage: number;
  nHeal: number;
  nShield: number;
  nCc: number;
  nHardCc: number;
  nDash: number;
  nProjectile: number;
  /**
   * Heal/shield aimed at SOMEONE ELSE — a non-enemy ability whose castType is
   * not "self". The self/ally split is what separates a support from a tank:
   * a self-only shield is personal mitigation, the same shield on a targeted
   * cast is a support kit. `castType` is the only handle the schema gives us.
   */
  nAllyEffect: number;
  /** highest single damage number anywhere in the kit (burst proxy). */
  peakDamage: number;

  // --- text ---------------------------------------------------------------
  /** the w3x author's own playstyle label ("推薦玩家 : 團戰殺手"), if any. */
  playstyle: string | null;
  /** every keyword group that fired, for the report's "why" column. */
  keywords: string[];
  /**
   * Tooltip lines that heal/cleanse/buff and NAME AN ALLY on the same line.
   *
   * Whole-doc keyword matching cannot do this job: "恢復" appears in 24 of 113
   * champions, but 夏娜's is "恢復所有生命及瑪那" — a self-restore on kill — and
   * 安云's is lore ("恢復自由之身"). Exactly 6 champions in the roster heal
   * someone else. Scoping the match to one line, and requiring an ally word on
   * that line, is the difference between finding those 6 and inventing 24.
   */
  nAllyLines: number;
  /** heal/regen lines with no ally on them — self-sustain, a bruiser trait. */
  nSelfSustainLines: number;
}

/** Keyword groups over the Chinese description text. Order is not meaningful. */
const KEYWORD_GROUPS: Record<string, readonly string[]> = {
  revive: ["復活", "重生"],
  mitigate: ["結界", "減傷", "無敵", "護盾", "格擋", "護甲增加", "抵擋"],
  // Only genuine in-kit taunt words. 肉盾/坦克/血牛 live in the "推薦玩家"
  // label, which the playstyle rules own — scoring them here too double-counted
  // the same six characters and manufactured tanks.
  taunt: ["嘲諷", "吸引仇恨", "吸引敵人"],
  stealth: ["隱形", "隱身", "鬼隱", "潛行"],
  assassinate: ["暗殺", "秒殺", "斬殺", "直接死亡", "即死"],
  hardCc: ["暈眩", "昏迷", "定身", "沉默", "擊飛", "擊退", "束縛"],
  burst: ["爆發", "巨砲", "砲台", "狙擊", "轟炸"],
  poke: ["牽制", "騷擾", "擾亂"],
  chase: ["追擊", "追殺", "衝鋒", "衝刺", "突進"],
  sustain: ["吸血", "偷取生命", "生命偷取"],
  summon: ["召喚", "招喚", "分身"],
};

/** Benefit verbs — the thing a support does TO someone. */
const BENEFIT_WORDS = ["治療", "回復", "恢復", "補血", "回血", "淨化", "驅散", "解除", "護盾", "增加", "提升"] as const;
/** Words that name a recipient other than the caster. */
const ALLY_WORDS = ["友方", "友軍", "隊友", "我方", "全隊", "同伴", "隊上", "附近友", "週遭友", "周遭友"] as const;
/** Heal words that, without an ally on the line, mean the caster sustains itself. */
const SUSTAIN_WORDS = ["治療", "回復", "恢復", "補血", "回血", "吸血"] as const;

/** Split the tooltip corpus into ally-directed lines and self-sustain lines. */
function scanLines(text: string): { nAllyLines: number; nSelfSustainLines: number } {
  let nAllyLines = 0;
  let nSelfSustainLines = 0;
  for (const line of text.split("\n")) {
    const hasAlly = ALLY_WORDS.some((w) => line.includes(w));
    if (hasAlly && BENEFIT_WORDS.some((w) => line.includes(w))) nAllyLines++;
    else if (!hasAlly && SUSTAIN_WORDS.some((w) => line.includes(w))) nSelfSustainLines++;
  }
  return { nAllyLines, nSelfSustainLines };
}

interface RawHero {
  primary_attr?: string | null;
  str_growth?: number | null;
  agi_growth?: number | null;
  int_growth?: number | null;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Load the optional w3x hero table, keyed by LOWERCASED rawcode ("hpb1"). */
function loadRawHeroes(repoRoot: string): Map<string, RawHero> {
  const path = join(repoRoot, "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json");
  const out = new Map<string, RawHero>();
  if (!existsSync(path)) return out;
  const heroes = readJson(path).heroes as Record<string, RawHero> | undefined;
  for (const [code, hero] of Object.entries(heroes ?? {})) out.set(code.toLowerCase(), hero);
  return out;
}

/** Recover the STR/AGI/INT growth triple from the "角色成長：" description block. */
function attrsFromDescription(desc: string): { str: number; agi: number; int: number } | null {
  const str = /力量\s*\+\s*([\d.]+)/.exec(desc);
  const agi = /敏捷\s*\+\s*([\d.]+)/.exec(desc);
  const int = /智[慧惠]\s*\+\s*([\d.]+)/.exec(desc);
  if (!str || !agi || !int) return null;
  return { str: Number(str[1]), agi: Number(agi[1]), int: Number(int[1]) };
}

/** Every numeric leaf under a `zScaling` amount — used for the burst proxy. */
function scalingMax(amount: unknown): number {
  let max = 0;
  const walk = (v: unknown): void => {
    if (typeof v === "number") max = Math.max(max, v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      // ⭐ 2026-09-06 GH#1058：`when` 條件式係數是**情境**的（變身中／EX 學了之後才有），
      //   ⛔ 不是基線爆發；而 `when` 底下的 withinSec 之類根本不是數值量。跳過整條。
      if ("when" in (v as Record<string, unknown>)) return;
      Object.values(v).forEach(walk);
    }
  };
  walk(amount);
  return max;
}

interface KitTally {
  nDamage: number;
  nMagicDamage: number;
  nPhysicalDamage: number;
  nHeal: number;
  nShield: number;
  nCc: number;
  nHardCc: number;
  nDash: number;
  nProjectile: number;
  nAllyEffect: number;
  peakDamage: number;
}

const emptyTally = (): KitTally => ({
  nDamage: 0,
  nMagicDamage: 0,
  nPhysicalDamage: 0,
  nHeal: 0,
  nShield: 0,
  nCc: 0,
  nHardCc: 0,
  nDash: 0,
  nProjectile: 0,
  nAllyEffect: 0,
  peakDamage: 0,
});

// ⭐ 2026-09-07（#993 第三批）：76 支技能的 effects 住在 template.params ⇒ 統計前用出貨那一支展開器攤開，
//   ⛔ 否則整個 roster 的 burst／CC 計數一起塌，百分位全漂（hpb1 就是這樣被判成 bruiser 的）。
let TEMPLATES_CACHE: { root: string; map: Map<string, TemplateDoc> } | null = null;
function templatesFor(root: string): Map<string, TemplateDoc> {
  if (TEMPLATES_CACHE && TEMPLATES_CACHE.root === root) return TEMPLATES_CACHE.map;
  const dir = join(root, "content/ability-templates");
  const map = new Map<string, TemplateDoc>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.startsWith("tpl-") || !f.endsWith(".json")) continue;
      const t = zTemplateDoc.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
      map.set(t.id, t);
    }
  }
  TEMPLATES_CACHE = { root, map };
  return map;
}
function expandIfTemplated(ability: any, root: string): any {
  if (!ability || typeof ability !== "object" || ability.template === undefined) return ability;
  const res = resolveTemplateExpansion(ability, templatesFor(root));
  return res.ok ? res.merged : ability;
}

/** Walk one ability's effect tree (spawnProjectile.onHit recurses) into `t`. */
function tallyAbility(ability: any, t: KitTally): void {
  const targetsEnemies = ability?.targetsEnemies === true;
  const onAlly = !targetsEnemies && ability?.castType !== "self";
  const walk = (effects: unknown): void => {
    if (!Array.isArray(effects)) return;
    for (const e of effects as any[]) {
      switch (e?.kind) {
        case "damage":
          t.nDamage++;
          if (e.damageType === "magic") t.nMagicDamage++;
          else if (e.damageType === "physical") t.nPhysicalDamage++;
          t.peakDamage = Math.max(t.peakDamage, scalingMax(e.amount));
          break;
        case "heal":
          t.nHeal++;
          if (onAlly) t.nAllyEffect++;
          break;
        case "shield":
          t.nShield++;
          if (onAlly) t.nAllyEffect++;
          break;
        case "applyStatus":
          t.nCc++;
          if (e.stun === true || e.root === true) t.nHardCc++;
          break;
        case "dash":
          t.nDash++;
          break;
        case "spawnProjectile":
          t.nProjectile++;
          walk(e.onHit);
          break;
        default:
          break;
      }
    }
  };
  walk(ability?.effects);
}

export function extractFeatures(repoRoot: string): Features[] {
  const champDir = join(repoRoot, "content/champions");
  const abilityDir = join(repoRoot, "content/abilities");
  const rawHeroes = loadRawHeroes(repoRoot);

  const files = readdirSync(champDir)
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .sort();

  return files.map((file) => {
    const doc = readJson(join(champDir, file));
    // #248: `baseStats`/`growth` are the RAW w3x card — the 三圍 term is added
    // by the sim. Read the resolved sheet, or every hero looks like a 150 hp
    // 25 ad blob and the whole classification is scored on the wrong numbers.
    const b = resolvedBase(doc);
    const g = resolvedGrowth(doc);

    // ---- kit: embedded Q/W/E/R plus the standalone EX doc ----------------
    const t = emptyTally();
    const texts: string[] = [doc.description ?? ""];
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const ab = expandIfTemplated(doc.abilities?.[slot], repoRoot);
      if (!ab) continue;
      tallyAbility(ab, t);
      texts.push(ab.name ?? "", ab.description ?? "");
    }
    if (doc.exAbility) {
      const exPath = join(abilityDir, `${doc.exAbility}.json`);
      if (existsSync(exPath)) {
        const ex = expandIfTemplated(readJson(exPath), repoRoot);
        tallyAbility(ex, t);
        texts.push(ex.name ?? "", ex.description ?? "");
      }
    }
    // The "推薦玩家 : …" / "上手度 : …" lines are scored separately by the
    // playstyle rules; leaving them in the keyword corpus made every hero whose
    // label says 肉盾 score tank twice for one piece of evidence.
    const text = texts
      .join("\n")
      .split("\n")
      .filter((line) => !/^\s*(推薦玩家|上手度)\s*[:：]/.test(line))
      .join("\n");

    // ---- WC3 attributes ---------------------------------------------------
    const raw = doc.id.startsWith("godie-") ? rawHeroes.get(doc.id.slice("godie-".length)) : undefined;
    const fromDesc = attrsFromDescription(doc.description ?? "");
    const strGrowth = raw?.str_growth ?? fromDesc?.str ?? 0;
    const agiGrowth = raw?.agi_growth ?? fromDesc?.agi ?? 0;
    const intGrowth = raw?.int_growth ?? fromDesc?.int ?? 0;

    // The map sets `primary_attr` on only 42 of 111 heroes (it is written only
    // when the author overrode the Blizzard base unit). Where it IS set it
    // agrees with the highest growth attr 38/42 times, so max-growth is a sound
    // fallback — flagged as inferred so the report can show which is which.
    let primaryAttr: Attr | null = null;
    let primaryAttrInferred = false;
    const declared = raw?.primary_attr;
    if (declared === "STR" || declared === "AGI" || declared === "INT") {
      primaryAttr = declared;
    } else if (strGrowth > 0 || agiGrowth > 0 || intGrowth > 0) {
      const pairs: [Attr, number][] = [
        ["STR", strGrowth],
        ["AGI", agiGrowth],
        ["INT", intGrowth],
      ];
      pairs.sort((x, y) => y[1] - x[1]);
      primaryAttr = pairs[0]![0];
      primaryAttrInferred = true;
    }

    // ---- text signals -----------------------------------------------------
    const keywords = Object.entries(KEYWORD_GROUPS)
      .filter(([, needles]) => needles.some((n) => text.includes(n)))
      .map(([group]) => group);
    const playstyleMatch = /推薦玩家\s*[:：]\s*(.+)/.exec(doc.description ?? "");
    const playstyle = playstyleMatch ? playstyleMatch[1]!.trim() : null;

    return {
      id: doc.id,
      name: doc.name,
      currentRole: doc.role,
      attackType: doc.attackType,
      tags: doc.tags ?? [],
      imported: (doc.tags ?? []).includes("wc3-import"),
      hp: b.maxHealth ?? 0,
      hpGrowth: g.maxHealth ?? 0,
      mana: b.maxMana ?? 0,
      manaRegen: b.manaRegen ?? 0,
      ad: b.ad ?? 0,
      adGrowth: g.ad ?? 0,
      armor: b.armor ?? 0,
      attackSpeed: b.as ?? 0,
      moveSpeed: b.ms ?? 0,
      range: b.range ?? 0,
      primaryAttr,
      primaryAttrInferred,
      strGrowth,
      agiGrowth,
      intGrowth,
      ...t,
      playstyle,
      keywords,
      ...scanLines(text),
    };
  });
}
