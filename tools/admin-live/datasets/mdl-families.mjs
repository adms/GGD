/**
 * 🌪 MDL 特效家族總表 dataset（GET /__live/mdl-families）
 *
 * owner 2026-08-26（逐字）：
 * > 「所有光束砲系列都是一樣的，只差在**顏色大小透明度**略有不同」
 * > 「光束砲家族**應該共用特效模板**，請你仔細掃描**所有使用相同 mdl 的蝗蟲群**對應到的特效」
 *
 * 一顆 MDL ＝ 一個特效家族。這一份把 join **當場重跑**（⛔ 不 parse docs/ 的 md）：
 *
 *   ① OBJECTS.json units（w3u custom 且有 model）      → dummy 單位（rawcode/名/scale）
 *   ② MODEL_USAGE.json models[stem].refs jass.unitSpawn → 生成點（j:行號/trigger/技能 rawcode）
 *   ③ JASS_BEHAVIOR.json skills（rawcode/trigger_stems）→ 原作技能編號＋名（15-03 雷電風暴）
 *   ④ CENSUS.json rows（rawcodes ↔ 出貨 abilityId）     → GGD 落點（rawcode join，CONFIRMED 那套）
 *   ⑤ content/config/ability-vfx-bindings.json          → GGD 落點（w3a art:caster 那套）
 *   ⑥ content/abilities/*.json                          → 出貨現況：vfxKey / spawnModelFx.modelKey
 *      （第〇·四守則：vfxKey/modelKey **引用出貨 JSON**，census 的 currentVfxKey 只當備援 ——
 *       census 是 7/26 產的，出貨檔之後還會動）
 *
 * 清算狀態是**推導**的（resolved／partial／queued／noEvidence —— 看落點對上幾成）。
 * ⚠️ docs/MDL特效家族總表.md 裡的人工裁決（✅ 已清算、「刻意不轉」）**沒有結構化住處**，
 *    機器推不出來 —— 那一半誠實寫進 honest，⛔ 不編資料充數。
 *
 * ⛔ 唯讀；⛔ 不 import apps/**、packages/**；回傳物件控制在 2MB 以下（生成點每 dummy 截 8 筆）。
 * ⚠️ 上面點名的 content/** 檔全是**產生器產物**（genguard 查擁有者;這一頁只**讀**它們,
 *    要改就改來源再 bash scripts/genrun.sh <step>）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = {
  objects: "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json",
  usage: "tools/w3x-import/out/vfx-census/MODEL_USAGE.json",
  behavior: "tools/w3x-import/out/GoDieEX22s-src/JASS_BEHAVIOR.json",
  census: "tools/w3x-import/out/vfx-census/CENSUS.json",
  bindings: "content/config/ability-vfx-bindings.json",
};

/** deps 逐檔列（目錄 mtime 在 macOS 不會因改檔內容而動 —— radar-abilities 的同一課）。 */
export function deps(repoRoot) {
  const out = [...Object.values(SRC), "content/abilities"];
  try {
    for (const f of readdirSync(join(repoRoot, "content/abilities"))) {
      if (f.endsWith(".json")) out.push(`content/abilities/${f}`);
    }
  } catch {
    /* 目錄不在 → depsKey 記 absent，build() 把它寫進 honest */
  }
  return out;
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** `Abilities\Spells\Other\Tornado\TornadoElemental.mdl` → { stem:"tornadoelemental", base:"TornadoElemental.mdl" } */
function splitModelPath(p) {
  const base = p.replace(/\\/g, "/").split("/").pop() ?? p;
  return { stem: base.replace(/\.(mdl|mdx)$/i, "").toLowerCase(), base };
}

/** trigger 名正規化（去空白/底線、小寫）—— behavior 的 stems 用空白、census 的 trigger 用底線。 */
const normTrig = (s) => String(s ?? "").toLowerCase().replace(/[\s_]/g, "");

/** 「15-03 雷電風暴」→ "15-03"（也收 92-002 這種 EX 編號）。 */
function numberOf(name) {
  const m = /^(\d{2}-\d{2,3})/.exec(String(name ?? ""));
  return m ? m[1] : null;
}

/** 出貨 ability 文件樹裡撈 spawnModelFx.modelKey（一支可能有多顆）。 */
function collectModelKeys(node, acc) {
  if (Array.isArray(node)) {
    for (const n of node) collectModelKeys(n, acc);
  } else if (node && typeof node === "object") {
    if (typeof node.modelKey === "string") acc.add(node.modelKey);
    for (const v of Object.values(node)) collectModelKeys(v, acc);
  }
  return acc;
}

export async function build(repoRoot) {
  const honest = [
    "「已清算/刻意不轉」的人工裁決只活在 docs/MDL特效家族總表.md（手編對照表，無結構化住處）——本頁的狀態欄是機器推導（落點對上幾成），⛔ 不是那份裁決。",
  ];
  const abs = (p) => join(repoRoot, p);

  // ── ① dummy 單位：OBJECTS.json 的 custom units（有 model 的）按 stem 分組 ──
  let objects;
  try {
    objects = readJson(abs(SRC.objects));
  } catch (err) {
    return { families: [], stats: {}, honest: [`讀不到 ${SRC.objects}：${err}`] };
  }
  const unitsById = objects.units ?? {};
  /** stem → { path, dummies: Map<rawcode, dummy> } */
  const byStem = new Map();
  for (const [uid, u] of Object.entries(unitsById)) {
    if (u.table !== "custom" || !u.model) continue;
    const { stem, base } = splitModelPath(u.model);
    let g = byStem.get(stem);
    if (!g) byStem.set(stem, (g = { mdl: base, mdlPath: u.model, dummies: new Map() }));
    g.dummies.set(uid, {
      rawcode: uid,
      name: u.name ?? uid,
      scale: u.scale ?? null,
      base: u.base ?? null,
      hp: u.hp ?? null,
      spawnSites: 0,
      sites: [],
      siteOverflow: 0,
      rawcodes: new Set(), // 生成點指到的技能 rawcode（strong 先、weak 補）
      triggers: new Set(),
    });
  }

  // ── ② 生成點：MODEL_USAGE 的 jass.unitSpawn refs，掛回 dummy ──
  let usage = null;
  try {
    usage = readJson(abs(SRC.usage));
  } catch (err) {
    honest.push(`讀不到 ${SRC.usage}：${err} —— 生成點/家族標籤整欄缺`);
  }
  const famLabelByStem = new Map();
  if (usage?.families) {
    for (const f of usage.families) {
      for (const m of f.models ?? []) famLabelByStem.set(m.stem, f.label ?? f.id);
    }
  }
  if (usage?.models) {
    for (const [stem, m] of Object.entries(usage.models)) {
      for (const r of m.refs ?? []) {
        if (r.channel !== "jass.unitSpawn" || !r.objectId) continue;
        // ⚠️ 用 ref 自己的 objectId 找 dummy（模型 stem 可能與 w3u 的不同大小寫 → 都已 lowercase）
        const g = byStem.get(stem);
        const d = g?.dummies.get(r.objectId);
        if (!d) continue; // 生成的不是 custom unit（例：stock 單位）→ 不屬於本表
        d.spawnSites += 1;
        if (d.sites.length < 8) {
          d.sites.push({
            line: r.line ?? null,
            trigger: r.trigger ?? null,
            fn: r.function ?? null,
            count: r.spawnCount ?? 1,
          });
        } else d.siteOverflow += 1;
        for (const rc of r.abilityIds ?? []) d.rawcodes.add(rc);
        for (const rc of r.abilityIdsWeak ?? []) d.rawcodes.add(rc);
        if (r.trigger) d.triggers.add(r.trigger);
      }
    }
  }

  // ── ③ 原作行為卡：rawcode / trigger stem → 技能編號＋名 ──
  let behavior = [];
  try {
    behavior = readJson(abs(SRC.behavior)).skills ?? [];
  } catch (err) {
    honest.push(`讀不到 ${SRC.behavior}：${err} —— 原作技能名整欄缺`);
  }
  const behByRawcode = new Map();
  const behByTrig = []; // [normStem, skill]
  for (const s of behavior) {
    if (s.rawcode && !behByRawcode.has(s.rawcode)) behByRawcode.set(s.rawcode, s);
    for (const t of s.trigger_stems ?? []) behByTrig.push([normTrig(t), s]);
  }
  const behaviorByTrigger = (trigger) => {
    const nt = normTrig(trigger);
    if (!nt) return null;
    let best = null;
    for (const [ns, s] of behByTrig) {
      if (ns === nt) return s;
      if ((nt.startsWith(ns) || ns.startsWith(nt)) && ns.length >= 4) best ??= s;
    }
    return best;
  };

  // ── ④⑤⑥ GGD 落點三條通道 ──
  let censusRows = [];
  try {
    censusRows = readJson(abs(SRC.census)).rows ?? [];
  } catch (err) {
    honest.push(`讀不到 ${SRC.census}：${err} —— rawcode→出貨 join 少一條通道`);
  }
  const censusByRawcode = new Map(); // rawcode → [row]
  for (const row of censusRows) {
    for (const rc of row.rawcodes ?? []) {
      const arr = censusByRawcode.get(rc) ?? [];
      arr.push(row);
      censusByRawcode.set(rc, arr);
    }
  }
  let bindings = [];
  try {
    bindings = readJson(abs(SRC.bindings)).bindings ?? [];
  } catch (err) {
    honest.push(`讀不到 ${SRC.bindings}：${err} —— w3a 綁定通道缺`);
  }
  const bindByRawcode = new Map();
  for (const b of bindings) {
    if (!b.rawcode) continue;
    const arr = bindByRawcode.get(b.rawcode) ?? [];
    arr.push(b);
    bindByRawcode.set(b.rawcode, arr);
  }
  // 出貨現況：abilityId → { name, vfxKey, modelKeys }；編號 → [abilityId]
  const shippedById = new Map();
  const shippedByNumber = new Map();
  try {
    const dir = abs("content/abilities");
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      let d;
      try {
        d = readJson(join(dir, f));
      } catch (err) {
        honest.push(`content/abilities/${f} 解析失敗：${err}`);
        continue;
      }
      const id = d.id ?? f.slice(0, -5);
      const modelKeys = [...collectModelKeys(d, new Set())];
      shippedById.set(id, { id, name: d.name ?? id, vfxKey: d.vfxKey ?? null, modelKeys });
      const num = numberOf(d.name);
      if (num) {
        const arr = shippedByNumber.get(num) ?? [];
        arr.push(id);
        shippedByNumber.set(num, arr);
      }
    }
  } catch (err) {
    honest.push(`讀不到 content/abilities：${err} —— 出貨落點整欄缺`);
  }

  const shippedRef = (id) => {
    const s = shippedById.get(id);
    return s
      ? { id: s.id, name: s.name, vfxKey: s.vfxKey, modelKeys: s.modelKeys }
      : { id, name: null, vfxKey: null, modelKeys: [], stale: true }; // census 指到的 id 已不在出貨
  };

  /** 一個 dummy 的技能解析：rawcode 三通道 + trigger 補位，去重後回列表。 */
  function resolveSkills(d) {
    const out = new Map(); // key = rawcode|trigger → entry
    const push = (key, entry) => {
      const hit = out.get(key);
      if (!hit) out.set(key, entry);
      else {
        for (const s of entry.shipped) if (!hit.shipped.some((x) => x.id === s.id)) hit.shipped.push(s);
        hit.via = [...new Set([...hit.via, ...entry.via])];
        hit.w3xName ??= entry.w3xName;
        hit.hero ??= entry.hero;
      }
    };
    for (const rc of d.rawcodes) {
      const beh = behByRawcode.get(rc) ?? null;
      const shipped = [];
      const via = [];
      for (const row of censusByRawcode.get(rc) ?? []) {
        shipped.push(shippedRef(row.abilityId));
        via.push("census");
      }
      for (const b of bindByRawcode.get(rc) ?? []) {
        if (!shipped.some((s) => s.id === b.abilityId)) shipped.push(shippedRef(b.abilityId));
        via.push("w3a-binding");
      }
      const num = numberOf(beh?.skill_name);
      if (num) {
        for (const id of shippedByNumber.get(num) ?? []) {
          if (!shipped.some((s) => s.id === id)) shipped.push(shippedRef(id));
        }
        if ((shippedByNumber.get(num) ?? []).length) via.push("編號");
      }
      push(rc, {
        rawcode: rc,
        w3xName: beh?.skill_name ?? null,
        hero: beh?.hero ?? null,
        shipped,
        via: [...new Set(via)],
      });
    }
    // trigger 補位：生成點沒點名 rawcode 時，用 trigger 對 behavior
    for (const t of d.triggers) {
      const beh = behaviorByTrigger(t);
      if (!beh) continue;
      if (beh.rawcode && out.has(beh.rawcode)) continue; // 已由 rawcode 通道收到
      const shipped = [];
      const num = numberOf(beh.skill_name);
      for (const id of shippedByNumber.get(num) ?? []) shipped.push(shippedRef(id));
      push(`trig:${beh.rawcode ?? t}`, {
        rawcode: beh.rawcode ?? null,
        w3xName: beh.skill_name ?? null,
        hero: beh.hero ?? null,
        trigger: t,
        shipped,
        via: shipped.length ? ["trigger", "編號"] : ["trigger"],
      });
    }
    return [...out.values()];
  }

  // ── 組家族列 ──
  const families = [];
  for (const [stem, g] of byStem) {
    const dummies = [...g.dummies.values()]
      .sort((a, b) => b.spawnSites - a.spawnSites || a.rawcode.localeCompare(b.rawcode))
      .map((d) => {
        const skills = resolveSkills(d);
        return {
          rawcode: d.rawcode,
          name: d.name,
          scale: d.scale,
          base: d.base,
          spawnSites: d.spawnSites,
          sites: d.sites,
          siteOverflow: d.siteOverflow,
          skills,
        };
      });
    const withEvidence = dummies.filter((d) => d.skills.length > 0);
    const withShipped = dummies.filter((d) => d.skills.some((s) => s.shipped.length > 0));
    const status =
      withEvidence.length === 0
        ? "noEvidence"
        : withShipped.length === 0
          ? "queued"
          : withShipped.length < withEvidence.length
            ? "partial"
            : "resolved";
    families.push({
      stem,
      mdl: g.mdl,
      mdlPath: g.mdlPath,
      familyLabel: famLabelByStem.get(stem) ?? null,
      dummyCount: dummies.length,
      spawnSiteTotal: dummies.reduce((n, d) => n + d.spawnSites, 0),
      zeroSpawnDummies: dummies.filter((d) => d.spawnSites === 0).length,
      status,
      dummies,
    });
  }
  families.sort((a, b) => b.dummyCount - a.dummyCount || b.spawnSiteTotal - a.spawnSiteTotal || a.mdl.localeCompare(b.mdl));

  const multi = families.filter((f) => f.dummyCount >= 2);
  const stats = {
    mdlCount: families.length,
    multiDummyMdl: multi.length,
    dummyTotal: families.reduce((n, f) => n + f.dummyCount, 0),
    dummyInMulti: multi.reduce((n, f) => n + f.dummyCount, 0),
    spawnSiteTotal: families.reduce((n, f) => n + f.spawnSiteTotal, 0),
    zeroSpawnDummies: families.reduce((n, f) => n + f.zeroSpawnDummies, 0),
    byStatus: families.reduce((acc, f) => ((acc[f.status] = (acc[f.status] ?? 0) + 1), acc), {}),
    shippedAbilities: shippedById.size,
  };
  honest.push(
    "「零生成點」有兩種（原作就沒有 vs 我們還沒做到）—— 這裡只量得到「census 的 jass.unitSpawn 裡沒有它」，分不出哪一種；w3a 通道（Art-Missile／召喚欄）的落點走 ability-vfx-bindings 那條 join，沒進 bindings 的仍會顯示為零證據。",
  );
  return { families, stats, honest };
}
