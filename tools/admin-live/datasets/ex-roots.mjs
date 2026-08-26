/**
 * 🧬 ex-roots —— EX解放／EX∅ 根源 三選一 對照（GET /__live/ex-roots）。
 *
 * ⭐ 誠實聲明（先講清楚資料側**有什麼**）：
 *   repo 裡「三選一」＋「根源」的唯一結構是**寶具獎池**那一套 ——
 *   階級 EX ＜ [EX解放] ＜ [EX∅ 根源]（owner 2026-08-17 定名），
 *   三選一＝`config.arena-rules@1.offerCount = 3` 的隨機寶具抽選。
 *   ⛔ **「每一支 EX 技能各自有三個根源選項」這種 per-skill 結構不存在**：
 *   ability@1 / champion@1 沒有任何 roots／liberation 欄位，
 *   EX 技能與根源寶具之間沒有結構化 join。這份 dataset 把「最近的東西」
 *   全部擺出來（三階獎池現值 + 逐件寶具 + 逐英雄 EX 技能），並在 `honest`
 *   欄位把缺口寫死 —— ⛔ 不編資料充數。
 *
 * 值一律引用出貨 JSON（第〇·四守則），⛔ 不重算公式。
 * ⚠️ 讀的是 repo 的 content/，後台 override（putOverlayDoc）若蓋掉 arena-rules，
 *   這一頁看不到 —— 這也寫進 honest。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const CONFIG = "content/config/arena-rules.json";
const TABLES = [
  "content/loot-tables/legendary-weapons.json",
  "content/loot-tables/ex-release-weapons.json",
  "content/loot-tables/ex-origin-weapons.json",
];

function listJson(repoRoot, dir) {
  return readdirSync(join(repoRoot, dir))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => `${dir}/${f}`);
}

/**
 * deps 是**函式**：目錄 mtime 只在增刪檔時動，逐檔列 mtime 才會在「編某一份
 * ability/item JSON」時失效快取 ——「實時」＝與磁碟現況一致。
 */
export function deps(repoRoot) {
  return [
    CONFIG,
    ...TABLES,
    "content/abilities",
    "content/champions",
    "content/items",
    ...listJson(repoRoot, "content/abilities").filter((p) => p.endsWith(".ex.json")),
    ...listJson(repoRoot, "content/champions"),
    ...listJson(repoRoot, "content/items"),
  ];
}

/** item@1 裡「拿到會發生事情」的欄位（metadata 以外全算 payload）。 */
const ITEM_PAYLOAD_KEYS = [
  "modifiers",
  "passive",
  "auras",
  "block",
  "attributes",
  "sets",
  "marks",
  "vision",
  "flight",
  "damageTypeOverride",
  "typeStreakImmunity",
  "penetration",
  "critStrike",
];

function readJson(repoRoot, rel) {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
}

/** modifiers → 「ad flat +55 · as pctAdd +0.25」這種短句（值照抄 JSON）。 */
function modifierText(mods) {
  if (!Array.isArray(mods)) return [];
  return mods.map((m) => `${m.stat ?? "?"} ${m.op ?? "?"} ${m.value ?? "?"}`);
}

/** passive → 「onInterval: carry+restore」；只列 kind，⛔ 不複述數值。 */
function passiveText(passive) {
  if (!Array.isArray(passive)) return [];
  return passive.map((p) => {
    const kinds = [...new Set((p.effects ?? []).map((e) => e.kind))];
    return `${p.on ?? "?"}: ${kinds.join("+") || "(無 effects)"}`;
  });
}

/** 技能 effects（含 passive.hooks 巢狀）出現過哪些 kind。 */
function collectKinds(node, out) {
  if (Array.isArray(node)) {
    for (const n of node) collectKinds(n, out);
    return;
  }
  if (node && typeof node === "object") {
    if (typeof node.kind === "string") out.add(node.kind);
    for (const k of ["effects", "onHitTargets", "onArrive", "finalEffects"]) {
      if (node[k]) collectKinds(node[k], out);
    }
  }
}

export async function build(repoRoot) {
  const t0 = Date.now();
  const rules = readJson(repoRoot, CONFIG);

  // ── 寶具池（逐件） ─────────────────────────────────────────────
  const items = new Map();
  for (const rel of listJson(repoRoot, "content/items")) {
    const d = readJson(repoRoot, rel);
    items.set(d.id, d);
  }
  const tableToTier = new Map(
    (rules.weaponTiers ?? []).map((t) => [t.table, t]),
  );
  const pools = [];
  for (const rel of TABLES) {
    const lt = readJson(repoRoot, rel);
    const tier = tableToTier.get(lt.id) ?? null;
    const rows = [];
    for (const e of lt.entries ?? []) {
      const it = items.get(e.itemId);
      if (!it) {
        rows.push({ id: e.itemId, name: "⛔ 缺 item JSON", missing: true });
        continue;
      }
      const payloadKeys = ITEM_PAYLOAD_KEYS.filter((k) => it[k] != null);
      rows.push({
        id: it.id,
        name: it.name,
        tags: it.tags ?? [],
        payloadKeys,
        emptyPayload: payloadKeys.length === 0,
        modifiers: modifierText(it.modifiers),
        passives: passiveText(it.passive),
        descFirstLine: String(it.description ?? "").split("\n").find((l) => l.trim().startsWith("[")) ?? "",
      });
    }
    pools.push({
      table: lt.id,
      poolName: lt.name,
      tierLabel: tier?.label ?? (lt.id === "legendary-weapons" ? "EX（基礎）" : "（不在 weaponTiers）"),
      // 現值：整列照抄 arena-rules（legendary-weapons 走回合表排程，沒有 tier 列）
      tier: tier
        ? {
            id: tier.id,
            minRound: tier.minRound ?? null,
            maxRound: tier.maxRound ?? null,
            basePct: tier.basePct,
            underdogFactor: tier.underdogFactor,
            underdogExponent: tier.underdogExponent,
            limitScope: tier.limitScope,
            limitCount: tier.limitCount,
          }
        : null,
      itemCount: rows.length,
      items: rows,
    });
  }

  // ── 逐英雄 EX 技能（champion.exAbility → abilities/*.ex.json） ────
  const exDocs = new Map();
  for (const rel of listJson(repoRoot, "content/abilities")) {
    if (!rel.endsWith(".ex.json")) continue;
    const d = readJson(repoRoot, rel);
    exDocs.set(d.id, { doc: d, file: basename(rel), referenced: false });
  }
  const exRows = [];
  let champTotal = 0;
  const champsNoEx = [];
  for (const rel of listJson(repoRoot, "content/champions")) {
    const c = readJson(repoRoot, rel);
    champTotal += 1;
    if (!c.exAbility) {
      champsNoEx.push(`${c.id} ${c.name ?? ""}`.trim());
      continue;
    }
    const hit = exDocs.get(c.exAbility);
    if (!hit) {
      exRows.push({ championId: c.id, championName: c.name ?? "", exId: c.exAbility, exName: "⛔ 缺 ability JSON", broken: true });
      continue;
    }
    hit.referenced = true;
    const a = hit.doc;
    const kinds = new Set();
    collectKinds(a.effects, kinds);
    const hooks = [];
    for (const rank of a.passive?.ranks ?? []) {
      for (const h of rank.hooks ?? []) {
        if (h.on) hooks.push(h.on);
        collectKinds(h.effects, kinds);
      }
    }
    exRows.push({
      championId: c.id,
      championName: c.name ?? "",
      exId: a.id,
      exName: a.name,
      cooldown: a.cooldown?.[0] ?? null,
      cooldownTier: a.cooldownTier ?? null,
      manaCost: a.manaCost?.[0] ?? null,
      castType: a.castType,
      templateRef: a.template?.ref ?? null,
      hooks: [...new Set(hooks)],
      effectKinds: [...kinds].sort(),
      tagLine: String(a.description ?? "").split("\n").find((l) => l.trim().startsWith("[")) ?? "",
    });
  }
  exRows.sort((x, y) => (x.exId < y.exId ? -1 : 1));
  const orphanEx = [...exDocs.values()]
    .filter((v) => !v.referenced)
    .map((v) => `${v.doc.id} ${v.doc.name ?? ""}`.trim());

  // ── 三選一抽選的現值（照抄 arena-rules；⛔ 不重算機率） ─────────
  const round10 = rules.rounds?.["10"] ?? {};
  const draft = {
    offerCount: rules.offerCount ?? null,
    exUnlockRound: rules.exUnlockRound ?? null,
    finalRound: rules.finalRound ?? null,
    round10WeaponTable: round10.weaponLootTable ?? null,
    round10DraftBoth: round10.draftBoth ?? false,
    randomOnlyTables: rules.legendaryShelf?.randomOnlyTables ?? [],
    weaponShelfOpen: rules.weaponShelfOpen ?? null,
  };

  return {
    ladder: "EX ＜ [EX解放] ＜ [EX∅ 根源]（owner 2026-08-17 定名；階級＝這件東西在哪一張獎池，⛔ 不是道具上的欄位）",
    draft,
    pools,
    exAbilities: exRows,
    stats: {
      champions: champTotal,
      championsWithEx: exRows.length,
      championsWithoutEx: champsNoEx,
      exAbilityDocs: exDocs.size,
      orphanExDocs: orphanEx,
      poolItems: pools.reduce((s, p) => s + p.itemCount, 0),
    },
    honest: [
      "⛔ 資料側沒有「每支 EX 技能三選一根源」的結構：ability@1 / champion@1 沒有 roots／liberation 欄位，EX 技能與根源寶具之間沒有結構化 join。",
      "本頁列的是最近的既有結構：①三階寶具獎池（EX＜EX解放＜EX∅根源，arena-rules.weaponTiers）＋ offerCount=3 的隨機三選一抽選 ②逐英雄 EX 技能（champion.exAbility → *.ex.json）。",
      "現值讀的是 repo 的 content/config/arena-rules.json；線上後台 override（putOverlayDoc）若蓋掉它，這一頁看不到那份 override。",
      "機率欄（basePct／劣勢加權）照抄設定值，⛔ 未重算實際抽中機率（那住在 sim/economy/weaponTiers.ts）。",
    ],
    buildMs: Date.now() - t0,
  };
}
