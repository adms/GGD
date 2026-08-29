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
 * 💾 **可存**（GH#822，見下面的 `write`）；⛔ 不 import apps/**、packages/**；
 *    回傳物件控制在 2MB 以下（生成點每 dummy 截 8 筆）。
 * ⚠️ 上面①–④點名的 w3x 普查檔與 ⑤ ability-vfx-bindings 全是**產生器產物**
 *    （genguard 查擁有者;這一頁只**讀**它們,要改就改來源再 bash scripts/genrun.sh <step>）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = {
  objects: "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json",
  usage: "tools/w3x-import/out/vfx-census/MODEL_USAGE.json",
  behavior: "tools/w3x-import/out/GoDieEX22s-src/JASS_BEHAVIOR.json",
  census: "tools/w3x-import/out/vfx-census/CENSUS.json",
  bindings: "content/config/ability-vfx-bindings.json",
  // ⑦ ⭐ 可寫的那一份（GH#822）—— 落點技能的「畫哪一組特效」四格綁定。
  art: "content/config/vfx-ability-art.json",
};

/** ⑦ 的路徑（write 規則與 build 共用同一個字串 —— ⛔ 不要兩個住處）。 */
const ART_DOC = SRC.art;

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

/* ──────────────────────────────────────────────────────────────────────────
 * 💾 寫入端（GH#822）
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * ⚠️ 這裡在 2026-08-29 之前是 `readonlyWhy`，理由逐字是
 * 「全頁是 join 推導值，**沒有一格是資料的家**」。
 * ⭐ **推翻它的是產生器自己的檔頭** —— `apps/client/src/render/vfx/
 * generateAbilityArtContent.ts` 的所有權表寫著：`content/config/vfx-ability-art.json`
 * 有四格，而它**只重寫 `family` 一格**，`prim` / `owner` / `promoted`
 * **沒有上游、逐位保留** ⇒ ⭐ 那三格就是家。genguard 也同意（那份文件沒有產生器擁有者）。
 * ⇒ 而這一頁的「GGD 落點」欄逐列就是 `bindings[<abilityId>]` 的 key。
 *
 * 開放的是 owner 2026-08-26 逐字點名的那兩軸：
 * > 「所有光束砲系列都是一樣的，只差在**顏色大小透明度**略有不同」
 *
 * ⛔ **`family` 那一格刻意不開**：它是「原作真的怎麼畫」的**證據**，
 *    `deriveW3xFamilyArt` 每跑一次就整格重寫 ⇒ 改它等於沒改；
 *    推翻它的正確住處是隔壁的 `owner` 格（GH#431，證據原封留著）。
 *
 * ⭐ 上下界一律引用**出貨 schema**（`packages/shared/src/content/schema/vfx.ts`）：
 *    `owner.scale` = `z.number().min(0.05).max(20)`、`promoted.primary` = `min(1).max(96)`。
 * ⭐ 列舉**不抄字面值**（第〇·四守則：不要第二個住處）—— 元素從
 *    `content/vfx/fx.prim.<元素>.*` 的檔名推導、家族從 `vfx-families.json` 的
 *    `families` 鍵推導，兩者都在 `check()` 裡當場算，schema 加一個就自動放行。
 */

/** pointer `/bindings/<abilityId>/…` → 那一列（不存在回 null）。 */
function artRowAt(repoRoot, pointer) {
  const segs = pointer.split("/").filter((s) => s !== "");
  const id = segs[1] ?? "";
  const doc = readJson(join(repoRoot, ART_DOC));
  return { id, row: (doc.bindings ?? {})[id] ?? null };
}

/** 13 個元素 —— 從出貨的 `fx.prim.<元素>.<形狀>.json` 檔名推導。 */
function elementSet(repoRoot) {
  const out = new Set();
  for (const f of readdirSync(join(repoRoot, "content/vfx"))) {
    const m = /^fx\.prim\.([a-z0-9]+)\./.exec(f);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * ⭐ `prim` 是**後備**：`promoted` / `family` 在的那一列，改 prim 逐位等於不存在。
 * 存得下、頁上變了、遊戲裡零差別 —— 那正是第一·五守則要擋的形狀，所以擋在存之前。
 */
function primIsDead(row) {
  if (row.promoted) return "promoted（晉升的原作 emitter 直接指名 doc，它贏過一切）";
  if (row.family) return "family（原作證據的家族原型，它贏過 prim）";
  return null;
}

/** owner 覆寫格必須**已經存在** —— 共用寫入端只設最後一段，⛔ 不創造中途節點。 */
function needOwner(id, row) {
  if (row.owner) return null;
  return (
    `${id} 還沒有 owner 那一格,而共用寫入端**不創造中途節點** ⇒ 請先在 ${ART_DOC} 的 ` +
    `bindings["${id}"] 補上 owner（schema 要求 why 至少 8 字,且至少覆寫一格）：` +
    `{"owner":{"scale":1.0,"why":"owner <日期>：<原話>"}} —— 補完就能在頁上調了`
  );
}

export const write = {
  kind: "source",
  rules: [
    {
      paths: [ART_DOC],
      pointers: ["/bindings/*/prim/element"],
      value: { type: "string", maxLen: 16 },
      why: "顏色（元素）—— fx.prim.* 的配色來源；⛔ 有 family/promoted 的那一列改它是死改動",
      check(repoRoot, { pointer, value }) {
        const { id, row } = artRowAt(repoRoot, pointer);
        if (!row) return `${ART_DOC} 沒有 ${id} 這一列（這個端點只改既有列，⛔ 不創列）`;
        if (!row.prim) return `${id} 沒有 prim 那一格 —— 這條路只改既有的基準線`;
        const dead = primIsDead(row);
        if (dead !== null)
          return `${id} 有 ${dead} ⇒ 改 prim 玩家看不到任何差別（第一·五守則）。要推翻原作請改 owner 那一格`;
        const set = elementSet(repoRoot);
        if (!set.has(value))
          return `「${value}」不是出貨的元素 —— 出貨的是 ${[...set].sort().join(" / ")}`;
        return "";
      },
    },
    {
      paths: [ART_DOC],
      pointers: ["/bindings/*/prim/size"],
      value: { type: "string", maxLen: 2, enum: ["sm", "md", "lg"], nullable: true },
      why: "大小覆寫（空＝移除這一格，回到槽位規則：R／EX 讀大、其餘中等）",
      check(repoRoot, { pointer }) {
        const { id, row } = artRowAt(repoRoot, pointer);
        if (!row) return `${ART_DOC} 沒有 ${id} 這一列（這個端點只改既有列，⛔ 不創列）`;
        if (!row.prim) return `${id} 沒有 prim 那一格 —— 這條路只改既有的基準線`;
        const dead = primIsDead(row);
        if (dead !== null)
          return `${id} 有 ${dead} ⇒ 改 prim 玩家看不到任何差別（第一·五守則）。要推翻原作請改 owner 那一格`;
        return "";
      },
    },
    {
      paths: [ART_DOC],
      pointers: ["/bindings/*/promoted/primary"],
      value: { type: "string", maxLen: 96 },
      why: "主 emitter —— 這一支技能的 vfxKey 就是它（頁上「GGD 落點」那一欄顯示的值）",
      check(repoRoot, { pointer, value }) {
        const { id, row } = artRowAt(repoRoot, pointer);
        if (!row) return `${ART_DOC} 沒有 ${id} 這一列（這個端點只改既有列，⛔ 不創列）`;
        if (!row.promoted) return `${id} 沒有 promoted 那一格 —— 晉升清單是人挑的，⛔ 這條路不新增`;
        if (value.trim() === "") return "主 emitter 不可以是空字串（schema 要 min(1)）";
        // 指不到就是缺陷（vfxPromotedRefsResolve.test.ts 會紅）—— 擋在存之前而不是閘上。
        if (!existsSync(join(repoRoot, "content/vfx", `${value}.json`)))
          return `content/vfx/${value}.json 不存在 —— 懸空的晉升綁定會讓 vfxPromotedRefsResolve 紅`;
        return "";
      },
    },
    {
      paths: [ART_DOC],
      pointers: ["/bindings/*/owner/scale"],
      // ⭐ 上下界逐字引用出貨 schema 的 zVfxOwnerBinding.scale = z.number().min(0.05).max(20)
      //    ——⛔ 不是我自己挑一個看起來合理的範圍（ex-roots 的 offerCount 就是那樣寫寬的）。
      value: { type: "number", min: 0.05, max: 20 },
      why: "owner 的設計覆寫縮放（GH#431，第〇·六守則第 1 層）—— 蓋在證據上面，證據原封留在隔壁",
      check(repoRoot, { pointer }) {
        const { id, row } = artRowAt(repoRoot, pointer);
        if (!row) return `${ART_DOC} 沒有 ${id} 這一列（這個端點只改既有列，⛔ 不創列）`;
        const miss = needOwner(id, row);
        if (miss !== null) return miss;
        return "";
      },
    },
  ],
};

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

  // ── ⑦ 可寫的那一份：逐技能的四層特效綁定（GH#822 —— 頁上的編輯格吃它）──
  let artBindings = {};
  try {
    artBindings = readJson(abs(ART_DOC)).bindings ?? {};
  } catch (err) {
    honest.push(`讀不到 ${ART_DOC}：${err} —— 編輯格整欄缺（頁上會是唯讀）`);
  }

  /**
   * 一支落點技能的「可編輯格」摘要。
   * ⭐ `deadPrim` 是**推導**的（有 promoted/family ⇒ 改 prim 是死改動）——
   * 頁面照它決定畫不畫鉛筆，而伺服器端 check() 用同一條規則再擋一次
   * （⛔ 前端擋不算擋：兩邊各一次，而裁決者是後者）。
   */
  const artCells = (id) => {
    const row = artBindings[id];
    if (!row) return null;
    const deadPrim = row.promoted ? "promoted" : row.family ? "family" : null;
    return {
      element: row.prim?.element ?? null,
      size: row.prim?.size ?? null,
      hasPrim: !!row.prim,
      deadPrim,
      promotedPrimary: row.promoted?.primary ?? null,
      ownerScale: typeof row.owner?.scale === "number" ? row.owner.scale : null,
      hasOwner: !!row.owner,
      ownerWhy: row.owner?.why ?? null,
      family: row.family?.family ?? null,
    };
  };

  const shippedRef = (id) => {
    const s = shippedById.get(id);
    const art = artCells(id);
    return s
      ? { id: s.id, name: s.name, vfxKey: s.vfxKey, modelKeys: s.modelKeys, art }
      : { id, name: null, vfxKey: null, modelKeys: [], art, stale: true }; // census 指到的 id 已不在出貨
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
    "💾 可編輯的只有「GGD 落點」那一欄的四格（顏色／大小／主 emitter／owner 縮放，住 content/config/vfx-ability-art.json）——" +
      " 其餘每一欄（rawcode／dummy 名／scale／生成點）都是 w3x 普查產物的推導值，⛔ 改不動也不該改；" +
      " 而有 family／promoted 證據的那幾列，prim 的兩格是**死改動**（證據贏），頁上不畫鉛筆、伺服器端也會擋。",
  );
  honest.push(
    "「零生成點」有兩種（原作就沒有 vs 我們還沒做到）—— 這裡只量得到「census 的 jass.unitSpawn 裡沒有它」，分不出哪一種；w3a 通道（Art-Missile／召喚欄）的落點走 ability-vfx-bindings 那條 join，沒進 bindings 的仍會顯示為零證據。",
  );
  return { families, stats, honest };
}
