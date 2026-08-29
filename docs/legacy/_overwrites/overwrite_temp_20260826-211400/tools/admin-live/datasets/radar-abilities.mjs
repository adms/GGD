/**
 * 📡 技能四軸級距雷達 dataset（GET /__live/radar-abilities）
 *
 * 來源（全部唯讀）：
 *   · content/abilities/*.json —— 每支技能的級距欄：
 *       cooldownTier / manaCostTier / rangeTier / radiusTier（頂層）
 *       damageTier（內嵌在 effects 樹的 amount 節點 / template.params.damage）
 *   · content/champions/*.json —— 英雄 ↔ 技能 join（abilities.Q/W/E/R、exAbility）
 *   · content/config/{damage,cooldown,mana,range,aoe}-tiers.json —— 級別 → 值的解析表
 *     （第〇·四守則：值**引用**出貨表，⛔ 這裡不重算任何公式）
 *
 * ⚠️ 冷卻的秒數要先知道形狀（單體/範圍/變身）。這裡照抄
 *    packages/shared/src/content/cooldownTiers.ts 的 cooldownShapeOf 規則：
 *    手填 cooldownShape 永遠贏；autoShape 開著 → 樹裡有 championForm（鍵或 kind）
 *    → 變身；有 radius/radiusTier → 範圍；其餘 → 單體。
 *    ⛔ 這是一份**規則的複本**（node 環境 import 不到 TS）—— 引擎那邊改了推導，
 *    這裡要跟著改（兩邊都以 cooldownTiers.ts 的 doc comment 為準）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TIER_ORDER = ["極小", "小", "中", "大", "極大"];
const CONFIGS = [
  "content/config/damage-tiers.json",
  "content/config/cooldown-tiers.json",
  "content/config/mana-tiers.json",
  "content/config/range-tiers.json",
  "content/config/aoe-tiers.json",
];

/** deps 逐檔列（⛔ 不是只列目錄 —— 目錄 mtime 在 macOS 不會因為改檔內容而動）。 */
export function deps(repoRoot) {
  const out = ["content/abilities", "content/champions", ...CONFIGS];
  for (const dir of ["content/abilities", "content/champions"]) {
    try {
      for (const f of readdirSync(join(repoRoot, dir))) {
        if (f.endsWith(".json")) out.push(`${dir}/${f}`);
      }
    } catch {
      /* 目錄不在 → depsKey 記 absent，build() 會把它寫進 honest */
    }
  }
  return out;
}

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

/** 樹裡撈 damageTier：回 { max, nodes }（一支技能可能有多個傷害節點，雷達取最重的那格）。 */
function collectDamageTiers(node, acc) {
  if (Array.isArray(node)) {
    for (const n of node) collectDamageTiers(n, acc);
    return acc;
  }
  if (node === null || typeof node !== "object") return acc;
  const t = node.damageTier;
  if (typeof t === "string" && TIER_ORDER.includes(t)) acc.push(t);
  for (const v of Object.values(node)) collectDamageTiers(v, acc);
  return acc;
}

/** 樹裡有沒有「叫這些名字的鍵」或「kind 是這些名字的效果」（照抄 cooldownTiers.ts::mentions）。 */
function mentions(node, names) {
  if (Array.isArray(node)) return node.some((n) => mentions(n, names));
  if (node === null || typeof node !== "object") return false;
  for (const k of names) {
    if (node[k] !== undefined) return true;
    if (node.kind === k) return true;
  }
  return Object.values(node).some((v) => mentions(v, names));
}

function cooldownShapeOf(def, autoShape) {
  const explicit = def.cooldownShape;
  if (explicit === "單體" || explicit === "範圍" || explicit === "變身") return explicit;
  if (!autoShape) return "單體";
  if (mentions(def, ["championForm"])) return "變身";
  if (mentions(def, ["radius", "radiusTier"])) return "範圍";
  return "單體";
}

/** 內嵌 radiusTier（頂層沒有時退而求其次取最大的那格）。 */
function collectRadiusTiers(node, acc) {
  if (Array.isArray(node)) {
    for (const n of node) collectRadiusTiers(n, acc);
    return acc;
  }
  if (node === null || typeof node !== "object") return acc;
  const t = node.radiusTier;
  if (typeof t === "string" && TIER_ORDER.includes(t)) acc.push(t);
  for (const v of Object.values(node)) collectRadiusTiers(v, acc);
  return acc;
}

function maxTier(list) {
  let best = null;
  for (const t of list) {
    const i = TIER_ORDER.indexOf(t);
    if (best === null || i > TIER_ORDER.indexOf(best)) best = t;
  }
  return best;
}

const SLOT_BY_SUFFIX = { passive: "天生", q: "Q", w: "W", e: "E", r: "R", ex: "EX" };

export async function build(repoRoot) {
  const honest = [];
  const tables = {};
  const cfg = {};
  for (const p of CONFIGS) {
    try {
      cfg[p] = readJson(join(repoRoot, p));
    } catch (err) {
      honest.push(`讀不到 ${p}：${err}`);
      cfg[p] = null;
    }
  }
  tables.damage = cfg[CONFIGS[0]]?.damage ?? null;
  tables.cooldown = cfg[CONFIGS[1]]?.seconds ?? null; // { 單體/範圍/變身: {級別: 秒} }
  const autoShape = cfg[CONFIGS[1]]?.autoShape !== false;
  tables.manaCost = cfg[CONFIGS[2]]?.manaCost ?? null;
  tables.range = cfg[CONFIGS[3]]?.range ?? null;
  tables.radius = cfg[CONFIGS[4]]?.radius ?? null;

  // 英雄側：id → { name, alternate }；slot 佈局拿來對 join 的帳
  const champions = [];
  const champById = new Map();
  const champDir = join(repoRoot, "content/champions");
  for (const f of readdirSync(champDir).sort()) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    let d;
    try {
      d = readJson(join(champDir, f));
    } catch (err) {
      honest.push(`content/champions/${f} 解析失敗：${err}`);
      continue;
    }
    const alternate = d.transform && d.transform.role === "alternate";
    const c = { id: d.id, name: d.name ?? d.id, alternate: !!alternate };
    champions.push(c);
    champById.set(d.id, c);
  }

  // 技能側
  const abilities = [];
  const abilDir = join(repoRoot, "content/abilities");
  let orphans = 0;
  for (const f of readdirSync(abilDir).sort()) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    let d;
    try {
      d = readJson(join(abilDir, f));
    } catch (err) {
      honest.push(`content/abilities/${f} 解析失敗：${err}`);
      continue;
    }
    const id = d.id ?? f.slice(0, -5);
    const dot = id.lastIndexOf(".");
    const champId = dot > 0 ? id.slice(0, dot) : id;
    const suffix = dot > 0 ? id.slice(dot + 1) : "";
    const champ = champById.get(champId) ?? null;
    if (!champ) orphans += 1;

    const dmgNodes = collectDamageTiers(d.effects ?? d, []);
    // template.params.damage.damageTier 也算（effects 之外）
    if (d.template) collectDamageTiers(d.template, dmgNodes);
    const damageTier = maxTier(dmgNodes);

    let radiusTier = typeof d.radiusTier === "string" ? d.radiusTier : null;
    let radiusNested = false;
    if (!radiusTier) {
      const nested = collectRadiusTiers(d.effects ?? [], []);
      radiusTier = maxTier(nested);
      radiusNested = radiusTier !== null;
    }

    const cooldownTier = typeof d.cooldownTier === "string" ? d.cooldownTier : null;
    const shape = cooldownShapeOf(d, autoShape);
    const manaCostTier = typeof d.manaCostTier === "string" ? d.manaCostTier : null;
    const rangeTier = typeof d.rangeTier === "string" ? d.rangeTier : null;

    abilities.push({
      id,
      name: d.name ?? id,
      slot: d.slot ?? SLOT_BY_SUFFIX[suffix] ?? suffix.toUpperCase(),
      championId: champ ? champId : null,
      championName: champ ? champ.name : null,
      tiers: {
        damage: damageTier,
        cooldown: cooldownTier,
        manaCost: manaCostTier,
        range: rangeTier,
        radius: radiusTier,
      },
      damageNodeCount: dmgNodes.length,
      radiusFromNested: radiusNested,
      cooldownShape: shape,
      resolved: {
        damage: damageTier && tables.damage ? tables.damage[damageTier] ?? null : null,
        cooldownSec:
          cooldownTier && tables.cooldown ? tables.cooldown[shape]?.[cooldownTier] ?? null : null,
        manaCost: manaCostTier && tables.manaCost ? tables.manaCost[manaCostTier] ?? null : null,
        range: rangeTier && tables.range ? tables.range[rangeTier] ?? null : null,
        radius: radiusTier && tables.radius ? tables.radius[radiusTier] ?? null : null,
      },
    });
  }

  const axisCounts = { damage: 0, cooldown: 0, manaCost: 0, range: 0, radius: 0 };
  for (const a of abilities) {
    for (const k of Object.keys(axisCounts)) if (a.tiers[k]) axisCounts[k] += 1;
  }
  if (orphans > 0) {
    honest.push(`${orphans} 支技能的 id 前綴對不到任何英雄卡（championId 記為 null，仍列在全表）`);
  }

  return {
    tierOrder: TIER_ORDER,
    tables,
    autoShape,
    champions,
    abilities,
    stats: { abilityCount: abilities.length, championCount: champions.length, axisCounts, orphans },
    honest,
  };
}
