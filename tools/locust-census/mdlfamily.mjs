#!/usr/bin/env node
/**
 * MDL 家族**三通道反查**（GH#688，owner 2026-08-26 兩則裁決）。
 *
 * > 「因此光束砲家族應該共用特效模板 請你仔細掃描**所有使用相同 mdl 的蝗蟲群對應到的特效**
 * >  我記得還有 小呆 龍鬥氣砲咒文、Rider EX 等一堆人都有用到這個特效」
 * > 「事實上有**兩個**英雄復活特效 mdl」
 * > 「我之前給過你一堆 mdl 清單 請你**比照一樣的方法清算**」
 *
 * ```bash
 * node tools/locust-census/mdlfamily.mjs            # 重生成 mdl-families.json
 * node tools/locust-census/mdlfamily.mjs --check    # 唯讀：逐位元組比對
 * ```
 *
 * ⛔ **產物不可以手改** —— 手寫的表必過期而且沒有東西會紅。
 *
 * ⚠️ ⭐ **為什麼要三個通道**：在此之前的 `docs/MDL特效家族總表.md`（2026-08-26 一次性）
 * 只走**單位通道**（w3u 的 `umdl`）⇒ 65 個家族裡 **79 列**寫著「零生成點（w3a 通道待查）」。
 * 那句話本身就是這支掃描器的規格：一顆 mdl 可以從三個地方被引用，而只查一個會得到
 * 「這顆 mdl 沒人用」——⛔ 一個看起來像結論的空白。
 *
 * | 通道 | 來源 | 它是什麼 | 已量到 |
 * |---|---|---|---|
 * | ① `units` | `OBJECTS.json.units[*].model` | **蝗蟲群 dummy 的身分**（CreateNUnitsAtLoc 生出來的那具） | 461 隻單位 |
 * | ② `w3aArt` | `ABILITY_W3A.json.abilities[*].art.models` | **技能自己的美術欄**（Missileart/TargetArt/CasterArt/EffectArt/SpecialArt/Areaeffectart/LightningEffect）—— ⭐ 這一通道**帶著 GGD 落點**（`ggd.shipped.abilityId`），⛔ 不必再猜 | 530 支技能 / 253 顆 mdl |
 * | ③ `jassFx` | `raw/war3map.j` 的 `AddSpecialEffect*` 字面路徑 | **傷害段的視覺**（⛔ 不是實體，⛔ 不可以數成 `spawnModelFx.count`） | 全檔掃 |
 *
 * ⚠️ ⭐ 第③通道刻意**與 ①分開列**：CLAUDE.md 第一守則逐字 ——
 * 「把 `AddSpecialEffectLocBJ` 數成 `count` ＝ 把同一條傷害線畫成第二份視覺」。
 * 兩個通道混成一欄就是那個錯誤的溫床，所以這支掃描器**永遠不合併它們**。
 *
 * ⚠️ **已知缺口（誠實列出，⛔ 不要當成「這顆沒人用」）**：w3a 的**單位型別欄**
 * （召喚欄 `Uin4` / `Neg1` 那一族）目前不在 `ABILITY_W3A.json` 的抽取範圍裡 ——
 * 前例 Meteor 族（GH#688 第四批）四隻 trigger census 全 0，真落點就在召喚欄。
 * ⇒ `counts.sites === 0 && w3aArt.length === 0` 的家族**不代表死內容**，
 * 它代表「還有一個通道沒查」。補法＝擴 `tools/w3x-import/build_ability_w3a.py`。
 *
 * ⚠️ 刻意沒有產生日期（同 locust:build / caps:export）：任何隨時鐘變動的欄位都會讓
 * `--check` 的逐位元組比對永遠不相等 —— 一條被放寬的閘等於沒有閘。
 */
import { readFileSync, writeFileSync, existsSync, chmodSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");
const SRC = join(REPO, "tools/w3x-import/out/GoDieEX22s-src");
const OUT = join(HERE, "mdl-families.json");
const CMD = "node tools/locust-census/mdlfamily.mjs";

const objects = JSON.parse(readFileSync(join(SRC, "OBJECTS.json"), "utf8"));
const w3a = JSON.parse(
  readFileSync(join(REPO, "tools/w3x-import/out/GoDieEX22s/ABILITY_W3A.json"), "utf8"),
).abilities;
const census = JSON.parse(readFileSync(join(HERE, "census.json"), "utf8"));
const jassLines = readFileSync(join(SRC, "raw/war3map.j"), "utf8").split(/\r?\n/);

/** `Abilities\Spells\Human\ReviveHuman\ReviveHuman.mdl` → `revivehuman`（副檔名/目錄都不是身分）。 */
const key = (raw) => {
  const tail = String(raw ?? "")
    .replace(/\//g, "\\")
    .split("\\")
    .pop()
    .trim();
  return tail.replace(/\.(mdl|mdx)$/i, "").toLowerCase();
};

/* ── 家族桶 ───────────────────────────────────────────────────────────── */
const fam = new Map();
const bucket = (mdlKey, path) => {
  let f = fam.get(mdlKey);
  if (!f) {
    f = { mdl: mdlKey, paths: new Set(), units: [], w3aArt: [], jassFx: [] };
    fam.set(mdlKey, f);
  }
  if (path) f.paths.add(path);
  return f;
};

/* ── 通道①：單位（蝗蟲群 dummy 的身分） ────────────────────────────────── */
// census 的 units/sites 已經是產生的（locust:build）⇒ 這裡只 join，⛔ 不重算判準。
const censusUnit = new Map(census.units.map((u) => [u.id, u]));
const sitesByRawcode = new Map();
for (const s of census.sites) {
  const arr = sitesByRawcode.get(s.rawcode) ?? [];
  arr.push(s);
  sitesByRawcode.set(s.rawcode, arr);
}

for (const [id, u] of Object.entries(objects.units)) {
  if (u.is_hero) continue;
  const model = u.model;
  if (!model || !/\.(mdl|mdx)$/i.test(model.trim())) continue; // 承襲/隱形 ⇒ 不是一顆 mdl
  const k = key(model);
  if (!k) continue;
  const sites = sitesByRawcode.get(id) ?? [];
  const c = censusUnit.get(id);
  bucket(k, model.replace(/\//g, "\\")).units.push({
    rawcode: id,
    name: u.name ?? null,
    scale: typeof u.scale === "number" ? Math.round(u.scale * 10000) / 10000 : null,
    tint: c?.tint ?? null,
    inCensus: c != null,
    sites: sites.length,
    inLoop: sites.some((s) => s.inLoop),
    moves: sites.some((s) => (s.calls?.moves ?? 0) > 0),
    triggers: [...new Set(sites.map((s) => s.trigger ?? s.fn).filter(Boolean))].sort(),
  });
}

/* ── 通道②：w3a 美術欄（⭐ 唯一自帶 GGD 落點的通道） ───────────────────── */
for (const [aid, a] of Object.entries(w3a)) {
  const models = a?.art?.models ?? {};
  for (const [field, byLevel] of Object.entries(models)) {
    // 同一格可能寫多個路徑（逗號分隔，例：DefendCaster,DefendCaster）
    const perKey = new Map();
    for (const [lvl, v] of Object.entries(byLevel)) {
      for (const part of String(v ?? "").split(",")) {
        const p = part.trim();
        if (!p || !/\.(mdl|mdx)$/i.test(p)) continue;
        const k = key(p);
        if (!k) continue;
        const e = perKey.get(k) ?? { path: p.replace(/\//g, "\\"), levels: new Set() };
        e.levels.add(lvl);
        perKey.set(k, e);
      }
    }
    for (const [k, e] of perKey) {
      const g = a.ggd ?? {};
      bucket(k, e.path).w3aArt.push({
        ability: aid,
        name: a.name ?? null,
        field,
        levels: [...e.levels].sort(),
        joinKey: g.joinKey ?? null,
        shipped: g.shipped?.abilityId ?? null,
        candidates: g.candidates ?? [],
      });
    }
  }
}

/* ── 通道③：JASS 的 AddSpecialEffect 字面路徑（傷害段的視覺，⛔ 不是實體） ── */
const FX_CALL = /Add(?:SpecialEffect|SpecialEffectLoc|SpecialEffectTarget)[A-Za-z]*\s*\(/;
const STRING_LIT = /"((?:[^"\\]|\\.)*)"/g;
let fn = null;
jassLines.forEach((line, i) => {
  const m = /^\s*function\s+([A-Za-z0-9_]+)\s/.exec(line);
  if (m) fn = m[1];
  if (!FX_CALL.test(line)) return;
  STRING_LIT.lastIndex = 0;
  let s;
  while ((s = STRING_LIT.exec(line)) !== null) {
    const lit = s[1].replace(/\\\\/g, "\\");
    if (!/\.(mdl|mdx)$/i.test(lit)) continue;
    const k = key(lit);
    if (!k) continue;
    bucket(k, lit).jassFx.push({ line: i + 1, fn });
  }
});

/* ── GGD 側：這顆 mdl 轉檔了沒有（從 content/models 推導，⛔ 不手寫「glb 有/無」） ── */
const modelDocs = new Map();
for (const f of readdirSync(join(REPO, "content/models"))) {
  if (!f.endsWith(".json") || f.startsWith("_")) continue;
  const id = f.slice(0, -5);
  const tail = id.split(".").pop().toLowerCase();
  if (!modelDocs.has(tail)) modelDocs.set(tail, []);
  modelDocs.get(tail).push(id);
}

/* ── 出表 ─────────────────────────────────────────────────────────────── */
const families = [...fam.values()]
  .map((f) => {
    const shipped = [
      ...new Set(f.w3aArt.map((x) => x.shipped).filter((x) => typeof x === "string")),
    ].sort();
    const sites = f.units.reduce((n, u) => n + u.sites, 0);
    return {
      mdl: f.mdl,
      paths: [...f.paths].sort(),
      ggdModelIds: (modelDocs.get(f.mdl) ?? []).sort(),
      counts: {
        units: f.units.length,
        sites,
        w3aArt: f.w3aArt.length,
        jassFx: f.jassFx.length,
        shipped: shipped.length,
      },
      shipped,
      units: f.units.sort((a, b) => (a.rawcode < b.rawcode ? -1 : 1)),
      w3aArt: f.w3aArt.sort((a, b) =>
        a.ability === b.ability ? (a.field < b.field ? -1 : 1) : a.ability < b.ability ? -1 : 1,
      ),
      jassFx: f.jassFx.sort((a, b) => a.line - b.line),
    };
  })
  .sort((a, b) => {
    const wa = a.counts.units + a.counts.w3aArt + a.counts.jassFx;
    const wb = b.counts.units + b.counts.w3aArt + b.counts.jassFx;
    return wb - wa || (a.mdl < b.mdl ? -1 : a.mdl > b.mdl ? 1 : 0);
  });

const totals = {
  families: families.length,
  multiChannel: families.filter(
    (f) => [f.counts.units, f.counts.w3aArt, f.counts.jassFx].filter((n) => n > 0).length >= 2,
  ).length,
  unitOnly: families.filter((f) => f.counts.units > 0 && f.counts.w3aArt + f.counts.jassFx === 0)
    .length,
  w3aOnly: families.filter((f) => f.counts.units === 0 && f.counts.w3aArt > 0).length,
  shared: families.filter((f) => f.counts.units + f.counts.w3aArt + f.counts.jassFx >= 2).length,
  converted: families.filter((f) => f.ggdModelIds.length > 0).length,
  // ⭐ 這一格就是「還有一個通道沒查」的隊列（⛔ 不是「死內容」的隊列）：
  //    單位通道有 dummy、但 0 生成點 且 w3a 美術欄與 JASS 都沒引用它。
  zeroChannelUnits: families.filter(
    (f) => f.counts.units > 0 && f.counts.sites === 0 && f.counts.w3aArt + f.counts.jassFx === 0,
  ).length,
};

const doc = {
  $generator: "tools/locust-census/mdlfamily.mjs",
  meta: {
    purpose:
      "一顆 MDL ＝ 一個特效家族。三個通道反查「誰在用這顆 mdl」：①蝗蟲群 dummy 的身分 " +
      "②技能自己的 w3a 美術欄（⭐ 帶 GGD 落點）③JASS 的 AddSpecialEffect 字面路徑（傷害段視覺，" +
      "⛔ 不是實體、⛔ 不可以數成 spawnModelFx.count）。",
    sources: [
      "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json (units)",
      "tools/w3x-import/out/GoDieEX22s/ABILITY_W3A.json (abilities[*].art.models + ggd 落點)",
      "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j (AddSpecialEffect* 字面路徑)",
      "tools/locust-census/census.json (locust:build 的生成點/頂點色，⛔ 不重算判準)",
      "content/models/*.json (轉檔了沒有 —— 推導,⛔ 不手寫「glb 有/無」)",
    ],
    knownGap:
      "w3a 的**單位型別欄**（召喚欄 Uin4 / Neg1 那一族）不在 ABILITY_W3A.json 的抽取範圍 ⇒ " +
      "counts.sites=0 且 w3aArt=0 的家族**不是死內容**，是「還有一個通道沒查」" +
      "（前例：Meteor 族四隻 trigger census 全 0，真落點在召喚欄）。補法＝擴 build_ability_w3a.py。",
    totals,
  },
  families,
};

/* ── main ─────────────────────────────────────────────────────────────── */
const body = JSON.stringify(doc, null, 1) + "\n";
if (process.argv.includes("--check")) {
  if (!existsSync(OUT) || readFileSync(OUT, "utf8") !== body) {
    console.error(`mdl-families 過期：\n  ${OUT}\n→ 跑 ${CMD} 然後 git add`);
    process.exit(1);
  }
  console.log(`mdlfamily --check OK（${totals.families} 個家族皆最新）`);
} else {
  if (existsSync(OUT)) chmodSync(OUT, 0o644);
  writeFileSync(OUT, body);
  console.log(
    `mdlfamily 完成：${totals.families} 個 mdl 家族 · 多通道 ${totals.multiChannel} · ` +
      `僅單位 ${totals.unitOnly} · 僅 w3a ${totals.w3aOnly} · 已轉檔 ${totals.converted} · ` +
      `三通道皆空的 dummy 家族 ${totals.zeroChannelUnits}`,
  );
}
