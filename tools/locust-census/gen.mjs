#!/usr/bin/env node
/**
 * 蝗蟲群普查產生器（GH#688 Phase 1–3 產生器化）。
 *
 * ```bash
 * pnpm locust:build     # 重生成 docs/蝗蟲群對應表.md + tools/locust-census/census.json
 * pnpm locust:check     # 唯讀：兩份產物是不是最新（逐位元組）
 * ```
 *
 * ⛔ **兩份產物都是產生的，不可以手改** —— 手寫的表必過期而且沒有東西會紅。
 * ⭐ 這一支是 docs/_reports/locust_scan/（2026-08-25 的一次性偵察）的**正式版寫入端**：
 * 那四份報告保留當偵察紀錄，⛔ 不刪；判準逐字沿用 units.md 寫下的那三條與灰色地帶。
 *
 * 輸入（全部已在 repo，唯讀）：
 *   · OBJECTS.json（units 461 非英雄）—— model / scale / hp / dmg_base / abilities
 *   · UNIT_TINTS.json —— 解析後頂點色（繼承鏈 w3u entry → base → UnitUI.slk → 255）
 *     ⛔ 不讀 w3u 的 tint_raw：raw 值缺 = 繼承，自己解會重蹈 #49 漏繼承鏈的坑
 *   · raw/war3map.j —— 生成點交叉表 + runtime alpha（w3u 結構上沒有 alpha 欄，
 *     ucua 0 次；alpha 只存在於 SetUnitVertexColorBJ 呼叫點，第 4 參數 = 透明度%）
 *
 * ⚠️ 刻意沒有產生日期（同 caps:export / spec:build）：任何隨時鐘變動的欄位都會讓
 * `--check` 的逐位元組比對永遠不相等 —— 一條被放寬的閘等於沒有閘。
 *
 * runtime alpha 回溯（⛔ 不猜）：
 *   · GetLastCreatedUnit() → 同函式往上找最近的 Create* 字面 rawcode
 *   · udg_ 變數 → 先同函式找 `set VAR = …`；找不到再全檔掃：**全部**指派都解到
 *     同一個 rawcode 才算 resolved（var-global），多個候選 → unresolved + candidates
 *   · GetTriggerUnit()/GetDyingUnit() 這族 → event-unit（事件目標不是生成的 dummy）
 *   · 其餘 → unresolved，誠實標出來
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");
const SRC = join(REPO, "tools/w3x-import/out/GoDieEX22s-src");
const OUT_JSON = join(HERE, "census.json");
const OUT_MD = join(REPO, "docs/蝗蟲群對應表.md");
const CMD = "pnpm locust:build";

const objects = JSON.parse(readFileSync(join(SRC, "OBJECTS.json"), "utf8"));
const tintDoc = JSON.parse(readFileSync(join(SRC, "UNIT_TINTS.json"), "utf8"));
const jass = readFileSync(join(SRC, "raw/war3map.j"), "utf8").split(/\r?\n/);

const round2 = (x) => Math.round(x * 100) / 100;
const round4 = (x) => Math.round(x * 10000) / 10000; // w3u 的 float32 噪音（1.2999999523…→1.3）
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/* ───────────────────── Phase 1：單位普查（判準逐字沿用 units.md） ───────────────────── */
const INVISIBLE = new Set([".mdl", "none.mdl", "collision.mdl"]);
const WHITE = (rgb) => rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255;

const units = [];
for (const [id, u] of Object.entries(objects.units)) {
  if (u.is_hero) continue;
  const abilities = u.abilities ?? [];
  const hasAloc = abilities.includes("Aloc");
  const fxName = typeof u.name === "string" && u.name.includes("特效");
  const hp1 =
    typeof u.hp === "number" && u.hp <= 1 && (u.dmg_base === 0 || u.dmg_base == null);
  const criteria = [
    ...(hasAloc ? ["Aloc"] : []),
    ...(fxName ? ["fx-name"] : []),
    ...(hp1 ? ["hp1-noatk"] : []),
  ];
  if (criteria.length === 0) continue;
  const gray = [];
  if (hasAloc && ((u.dmg_base ?? 0) > 0 || (u.hp ?? 0) >= 100)) gray.push("combat-stats");
  if (!hasAloc) gray.push("no-Aloc");
  const model = u.model ?? null;
  const modelKind =
    model == null ? "inherit" : INVISIBLE.has(model.trim().toLowerCase()) ? "invisible" : "model";
  const t = tintDoc.units[id];
  const rgb = t?.rgb255 ?? null;
  units.push({
    id,
    name: u.name ?? null,
    base: u.base ?? null,
    model,
    modelKind,
    scale: typeof u.scale === "number" ? round4(u.scale) : null,
    tint: rgb && !WHITE(rgb) ? rgb : null,
    tintSource: t?.channelSource ?? null,
    runtimeAlphaPct: null, // 填於 runtime alpha 掃描之後（w3u 無 alpha 欄）
    hp: u.hp ?? null,
    dmgBase: u.dmg_base ?? null,
    abilities,
    criteria,
    gray,
  });
}
units.sort(byId);
const censusIds = new Set(units.map((u) => u.id));

/* ───────────────────── Phase 3：JASS 生成點交叉表 ───────────────────── */
const CREATE_RE = /\b(CreateNUnitsAtLocFacingLocBJ|CreateNUnitsAtLoc|CreateUnitAtLoc|CreateUnit)\s*\(/;
const RAW_RE = /'([^']{4})'/;
const trigBase = (fn) =>
  fn && fn.startsWith("Trig_")
    ? fn
        .slice(5)
        .replace(/_Func\w*$/, "")
        .replace(/_(Actions|Conditions)$/, "")
        .replace(/_/g, " ")
    : null;
const firstFloat = (s) => {
  const m = /(-?\d+(?:\.\d+)?)/.exec(s.slice(s.indexOf("(") + 1));
  return m ? round2(Number(m[1])) : null;
};

/** 函式表（名字 → 行區間），與逐行的生成點/演出呼叫歸屬（視窗 = 生成行 → 下一個生成行）。 */
const fns = []; // {name, start, end}
const sites = []; // {rawcode|null, line, fn, trigger, isTrig, inLoop, calls, sleepSecs, timedLifeSecs}
{
  let fn = null;
  let loopDepth = 0;
  let cur = null;
  for (let i = 0; i < jass.length; i++) {
    const line = jass[i];
    const fm = /^function\s+(\w+)\s+takes/.exec(line);
    if (fm) {
      fn = { name: fm[1], start: i, end: i };
      fns.push(fn);
      loopDepth = 0;
      cur = null;
      continue;
    }
    if (!fn) continue;
    fn.end = i;
    const t = line.trim();
    if (t === "endfunction") {
      fn = null;
      cur = null;
      continue;
    }
    if (t === "loop") loopDepth++;
    else if (t === "endloop") loopDepth = Math.max(0, loopDepth - 1);
    if (CREATE_RE.test(line) && !line.trimStart().startsWith("function")) {
      const raw = RAW_RE.exec(line);
      cur = {
        rawcode: raw ? raw[1] : null,
        line: i + 1,
        fn: fn.name,
        trigger: trigBase(fn.name),
        isTrig: fn.name.startsWith("Trig_"),
        inLoop: loopDepth > 0,
        calls: { sleep: 0, timedLife: 0, moves: 0, scale: 0, vertexColor: 0, anim: 0, timeScale: 0 },
        sleepSecs: [],
        timedLifeSecs: [],
      };
      sites.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.includes("TriggerSleepAction(")) {
      cur.calls.sleep++;
      const v = firstFloat(line);
      if (v != null) cur.sleepSecs.push(v);
    } else if (line.includes("UnitApplyTimedLife")) {
      cur.calls.timedLife++;
      const v = firstFloat(line); // BJ 形式第一參數就是秒數
      if (v != null) cur.timedLifeSecs.push(v);
    } else if (line.includes("SetUnitPosition")) cur.calls.moves++;
    else if (line.includes("SetUnitScalePercent(")) cur.calls.scale++;
    else if (line.includes("SetUnitVertexColor")) cur.calls.vertexColor++;
    else if (line.includes("SetUnitAnimation")) cur.calls.anim++;
    else if (line.includes("SetUnitTimeScalePercent(")) cur.calls.timeScale++;
  }
}
const fnAt = (lineIdx) => fns.find((f) => f.start <= lineIdx && lineIdx <= f.end) ?? null;

/** per-rawcode 聚合（動態 id 的生成點只進 meta，⛔ 不進表）。 */
const jassByRaw = new Map();
for (const s of sites) {
  if (!s.rawcode) continue;
  let g = jassByRaw.get(s.rawcode);
  if (!g) {
    g = {
      rawcode: s.rawcode,
      inCensus: censusIds.has(s.rawcode),
      name: objects.units[s.rawcode]?.name ?? null,
      sites: 0,
      triggers: new Set(),
      calls: { sleep: 0, timedLife: 0, moves: 0, scale: 0, vertexColor: 0, anim: 0, timeScale: 0 },
      sleepSecs: new Set(),
      timedLifeSecs: new Set(),
    };
    jassByRaw.set(s.rawcode, g);
  }
  g.sites++;
  if (s.isTrig && s.trigger) g.triggers.add(s.trigger);
  for (const k of Object.keys(g.calls)) g.calls[k] += s.calls[k];
  for (const v of s.sleepSecs) g.sleepSecs.add(v);
  for (const v of s.timedLifeSecs) g.timedLifeSecs.add(v);
}
const jassRows = [...jassByRaw.values()]
  .map((g) => ({
    ...g,
    triggers: [...g.triggers].sort(),
    trigFns: g.triggers.size,
    sleepSecs: [...g.sleepSecs].sort((a, b) => a - b),
    timedLifeSecs: [...g.timedLifeSecs].sort((a, b) => a - b),
  }))
  .sort(
    (a, b) =>
      b.trigFns - a.trigFns ||
      b.sites - a.sites ||
      (a.rawcode < b.rawcode ? -1 : a.rawcode > b.rawcode ? 1 : 0),
  );

/* ───────────────────── Phase 0（alpha 那半）：runtime alpha 回溯 ───────────────────── */
const splitArgs = (s) => {
  const out = [];
  let depth = 0;
  let curArg = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(curArg);
      curArg = "";
    } else curArg += ch;
  }
  out.push(curArg);
  return out.map((a) => a.trim());
};
const litOrExpr = (s) => {
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : s.replace(/\s+/g, " ");
};
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 從 idx 往上（不出函式）找最近的 Create* 字面 rawcode；動態 id 回 null。 */
function createAbove(idx, startIdx) {
  for (let k = idx - 1; k >= startIdx; k--) {
    if (CREATE_RE.test(jass[k])) {
      const m = RAW_RE.exec(jass[k]);
      return m ? m[1] : null;
    }
  }
  return undefined; // 這個函式裡沒有生成點
}

const EVENT_UNIT_RE =
  /^Get(TriggerUnit|SpellAbilityUnit|DyingUnit|KillingUnit\w*|AttackedUnitBJ|EnumUnit|SummonedUnit|OrderedUnit)\(\)$/;

/** 解一行 `set VAR = …` 的 RHS：created(rawcode) / event（事件單位） / opaque（解不開）。 */
function resolveAssignment(lineIdx) {
  const line = jass[lineIdx];
  if (CREATE_RE.test(line)) {
    const m = RAW_RE.exec(line);
    return m ? { kind: "created", rawcode: m[1] } : { kind: "opaque", rawcode: null };
  }
  if (line.includes("GetLastCreatedUnit()")) {
    const f = fnAt(lineIdx);
    const r = f ? createAbove(lineIdx, f.start) : undefined;
    return r ? { kind: "created", rawcode: r } : { kind: "opaque", rawcode: null };
  }
  const rhs = line.slice(line.indexOf("=") + 1).trim();
  if (EVENT_UNIT_RE.test(rhs)) return { kind: "event", rawcode: null };
  return { kind: "opaque", rawcode: null };
}

/** 變數回溯：同函式最近指派優先，其次全檔（全部指派同一 rawcode 才算 resolved，⛔ 不猜）。 */
function resolveVar(unitExpr, callIdx, fnStart) {
  const assignRe = new RegExp(`^\\s*set\\s+${escRe(unitExpr)}\\s*=`);
  for (let k = callIdx - 1; k >= fnStart; k--) {
    if (assignRe.test(jass[k])) {
      const a = resolveAssignment(k);
      if (a.kind === "created") return { rawcode: a.rawcode, source: "var-local", candidates: null };
      if (a.kind === "event") return { rawcode: null, source: "event-unit-var", candidates: null };
      return { rawcode: null, source: "unresolved", candidates: null };
    }
  }
  const seen = new Set();
  let events = 0;
  let total = 0;
  for (let k = 0; k < jass.length; k++) {
    if (!assignRe.test(jass[k])) continue;
    total++;
    const a = resolveAssignment(k);
    if (a.kind === "created") seen.add(a.rawcode);
    else if (a.kind === "event") events++;
    else return { rawcode: null, source: "unresolved", candidates: null }; // 有解不開的指派 ⇒ 不猜
  }
  if (seen.size === 1 && events === 0)
    return { rawcode: [...seen][0], source: "var-global", candidates: null };
  if (seen.size === 0 && events > 0 && total === events)
    return { rawcode: null, source: "event-unit-var", candidates: null };
  return {
    rawcode: null,
    source: "unresolved",
    candidates: seen.size > 0 ? [...seen].sort() : null,
  };
}

const runtimeAlpha = [];
for (let i = 0; i < jass.length; i++) {
  const at = jass[i].indexOf("SetUnitVertexColorBJ(");
  if (at < 0) continue;
  const inner = jass[i].slice(at + "SetUnitVertexColorBJ(".length, jass[i].lastIndexOf(")"));
  const [unitExpr, rS, gS, bS, tS] = splitArgs(inner);
  const f = fnAt(i);
  let rawcode = null;
  let source = "unresolved";
  let candidates = null;
  if (unitExpr === "GetLastCreatedUnit()") {
    const r = f ? createAbove(i, f.start) : undefined;
    rawcode = r ?? null;
    source = rawcode ? "last-created" : "unresolved";
  } else if (EVENT_UNIT_RE.test(unitExpr)) {
    source = "event-unit"; // 事件目標（施法者/死者/被攻擊者）—— 不是生成的 dummy
  } else if (unitExpr.startsWith("udg_")) {
    ({ rawcode, source, candidates } = resolveVar(unitExpr, i, f ? f.start : 0));
  }
  const call = [rS, gS, bS, tS].map(litOrExpr);
  const t = typeof call[3] === "number" ? call[3] : null;
  const numeric = call.every((v) => typeof v === "number");
  runtimeAlpha.push({
    line: i + 1,
    fn: f?.name ?? null,
    trigger: trigBase(f?.name ?? null),
    unit: unitExpr,
    source,
    rawcode,
    ...(candidates ? { candidates } : {}),
    call, // [R%, G%, B%, 透明度%]（BJ 語意；非字面值保留運算式）
    alphaPct: t == null ? null : round2(100 - t),
    rgba255: numeric
      ? [...call.slice(0, 3).map((v) => Math.round(v * 2.55)), Math.round((100 - call[3]) * 2.55)]
      : null,
  });
}

/* 單位普查表回填 runtime alpha（同 rawcode 的 resolved 呼叫點 → 不重複的 alpha% 清單）。 */
{
  const perRaw = new Map();
  for (const e of runtimeAlpha) {
    if (!e.rawcode || e.alphaPct == null) continue;
    if (!perRaw.has(e.rawcode)) perRaw.set(e.rawcode, new Set());
    perRaw.get(e.rawcode).add(e.alphaPct);
  }
  for (const u of units) {
    const s = perRaw.get(u.id);
    if (s) u.runtimeAlphaPct = [...s].sort((a, b) => a - b);
  }
}

/* ───────────────────── 產物 ───────────────────── */
const meta = {
  sources: [
    "tools/w3x-import/out/GoDieEX22s-src/OBJECTS.json (units)",
    "tools/w3x-import/out/GoDieEX22s-src/UNIT_TINTS.json",
    "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j",
  ],
  criteria:
    "Aloc in abilities OR name contains 特效 OR (hp<=1 AND dmg_base in {0,null})；" +
    "灰色地帶：combat-stats = Aloc 且 (dmg_base>0 或 hp>=100)；no-Aloc = 進集但沒掛 Aloc" +
    "（判準逐字沿用 docs/_reports/locust_scan/units.md）",
  alpha:
    "w3u 結構上沒有 alpha 欄（ucua 0 次）——runtimeAlpha 節是唯一來源：" +
    "SetUnitVertexColorBJ 第 4 參數 = 透明度%，alpha% = 100−透明度%，alpha255 = (100−t)×2.55",
  counts: {
    census: units.length,
    aloc: units.filter((u) => u.criteria.includes("Aloc")).length,
    fxName: units.filter((u) => u.criteria.includes("fx-name")).length,
    hp1Noatk: units.filter((u) => u.criteria.includes("hp1-noatk")).length,
    grayCombatStats: units.filter((u) => u.gray.includes("combat-stats")).length,
    grayNoAloc: units.filter((u) => u.gray.includes("no-Aloc")).length,
    nonWhiteTint: units.filter((u) => u.tint != null).length,
    invisibleModel: units.filter((u) => u.modelKind === "invisible").length,
    inheritModel: units.filter((u) => u.modelKind === "inherit").length,
    jassSites: sites.length,
    jassSitesTrig: sites.filter((s) => s.isTrig).length,
    jassSitesDynamicId: sites.filter((s) => !s.rawcode).length,
    jassRawcodes: jassByRaw.size,
    vertexColorCalls: runtimeAlpha.length,
    alphaResolved: runtimeAlpha.filter((e) => e.rawcode).length,
    alphaEventUnit: runtimeAlpha.filter((e) => e.source.startsWith("event-unit")).length,
    alphaUnresolved: runtimeAlpha.filter((e) => e.source === "unresolved").length,
  },
};

const census = {
  $generator: `tools/locust-census/gen.mjs —— ${CMD}（⛔ 產生的，不要手改）`,
  meta,
  units,
  jass: jassRows,
  sites: sites.map(({ rawcode, line, fn, trigger, isTrig, inLoop, calls, sleepSecs, timedLifeSecs }) => ({
    rawcode,
    line,
    fn,
    trigger,
    isTrig,
    inLoop,
    calls,
    sleepSecs,
    timedLifeSecs,
  })),
  runtimeAlpha,
};

/* ───────────────────── md render ───────────────────── */
function renderMd() {
  const L = [];
  const basename = (m) => (m == null ? null : m.split("\\").pop());
  const modelCell = (u) =>
    u.modelKind === "inherit"
      ? "(承襲)"
      : u.modelKind === "invisible"
        ? `(隱形:\`${u.model.trim()}\`)`
        : `\`${basename(u.model)}\``;
  const c = meta.counts;
  L.push("# 蝗蟲群對應表（GH#688 Phase 1–3 · 正式版）");
  L.push("");
  L.push("> ⚙️ **這一份是產生出來的，⛔ 不要手改。**");
  L.push(">");
  L.push("> ```bash");
  L.push(`> ${CMD}     # 重生成（含機讀版 tools/locust-census/census.json）`);
  L.push("> pnpm locust:check     # 唯讀：過期就回非零");
  L.push("> ```");
  L.push(">");
  L.push("> 一次性偵察紀錄（前身，保留⛔不刪）：`docs/_reports/locust_scan/`。");
  L.push("> 判準逐字沿用該偵察 `units.md`；追蹤主檔：`docs/蝗蟲群移植計畫.md`。");
  L.push("");
  L.push(`來源：${meta.sources.map((s) => `\`${s}\``).join(" · ")}`);
  L.push("");
  L.push("## 一、判準與統計");
  L.push("");
  L.push("| 判準 | 條件 | 命中 |");
  L.push("|---|---|---:|");
  L.push(`| \`Aloc\` | abilities 含 Aloc（WC3 的「不可選取 dummy」標記） | ${c.aloc} |`);
  L.push(`| \`fx-name\` | name 含「特效」 | ${c.fxName} |`);
  L.push(`| \`hp1-noatk\` | hp ≤ 1 且 dmg_base ∈ {0, null} | ${c.hp1Noatk} |`);
  L.push("");
  L.push(
    `聯集 = **${c.census} 隻**。灰色地帶：\`combat-stats\` ${c.grayCombatStats} 隻` +
      `（有 Aloc 但 dmg_base>0 或 hp≥100 —— 仍在集內，做「純視覺 dummy」清單時自行過濾）、` +
      `\`no-Aloc\` ${c.grayNoAloc} 隻。非白 tint **${c.nonWhiteTint}** 隻；` +
      `隱形佔位 ${c.invisibleModel} 隻；承襲 base 模型 ${c.inheritModel} 隻。`,
  );
  L.push("");
  L.push(
    `⚠️ **alpha 欄**：w3u 結構上沒有這個欄位（\`ucua\` 0 次）——本表的 runtime alpha 來自` +
      ` war3map.j 的 ${c.vertexColorCalls} 個 \`SetUnitVertexColorBJ\` 呼叫點回溯` +
      `（resolved ${c.alphaResolved} · event-unit ${c.alphaEventUnit} · unresolved ${c.alphaUnresolved}，見第四節）。`,
  );
  L.push("");
  L.push(`## 二、單位普查表（${c.census} 隻）`);
  L.push("");
  L.push("tint = 解析後 rgb255（空 = 未染色 255/255/255）；runtime α% = 不透明度（100−透明度%）。");
  L.push("");
  L.push("| id | name | model | scale | tint | runtime α% | 判準 | 灰 |");
  L.push("|---|---|---|---:|---|---|---|---|");
  for (const u of units) {
    L.push(
      `| \`${u.id}\` | ${u.name ?? ""} | ${modelCell(u)} | ${u.scale ?? ""} | ` +
        `${u.tint ? u.tint.join(",") : ""} | ${u.runtimeAlphaPct ? u.runtimeAlphaPct.join("→") : ""} | ` +
        `${u.criteria.join("+")} | ${u.gray.join(",")} |`,
    );
  }
  L.push("");
  L.push(`## 三、JASS 交叉表（${c.jassRawcodes} 個 rawcode × ${c.jassSites} 個生成點）`);
  L.push("");
  L.push(
    "演出時序欄位以「生成行 → 同函式下一個生成行」為歸屬視窗；sleep/timedLife 超出視窗的歸最後一個生成點。" +
      `非 Trig_ 函式（地圖擺放/初始化）的生成點含在「生成點」欄；動態 id 生成點 ${c.jassSitesDynamicId} 個只進機讀版。`,
  );
  L.push("");
  L.push(
    "| rawcode | 普查集 | 生成點 | 不同 Trig_ | sleep | timedLife | moves | scale | vtxColor | anim | timeScale | 觸發器 |",
  );
  L.push("|---|:-:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|");
  for (const g of jassRows) {
    const trig = g.triggers.slice(0, 6).join(", ") + (g.triggers.length > 6 ? " …" : "");
    L.push(
      `| \`${g.rawcode}\` | ${g.inCensus ? "✓" : ""} | ${g.sites} | ${g.trigFns} | ` +
        `${g.calls.sleep} | ${g.calls.timedLife} | ${g.calls.moves} | ${g.calls.scale} | ` +
        `${g.calls.vertexColor} | ${g.calls.anim} | ${g.calls.timeScale} | ${trig} |`,
    );
  }
  L.push("");
  L.push(`## 四、runtime alpha（${c.vertexColorCalls} 個 \`SetUnitVertexColorBJ\` 呼叫點）`);
  L.push("");
  L.push(
    "BJ 語意：R/G/B 是 0–100%，第 4 參數是**透明度%**（100=全隱形）；alpha255 = (100−t)×2.55。" +
      "回溯不到的誠實標 `unresolved`（⛔ 不猜）；`event-unit(-var)` = 目標是事件單位（施法者/死者），不是生成的 dummy。",
  );
  L.push("");
  L.push("| 行 | 觸發器 | unit | 來源 | rawcode | R,G,B (%) | 透明度% | α% | RGBA(0-255) |");
  L.push("|--:|---|---|---|---|---|---|---|---|");
  for (const e of runtimeAlpha) {
    const cell = (v) => (typeof v === "number" ? String(v) : `\`${v}\``);
    L.push(
      `| ${e.line} | ${e.trigger ?? e.fn ?? ""} | \`${e.unit}\` | ${e.source} | ` +
        `${e.rawcode ? `\`${e.rawcode}\`` : e.candidates ? `? ${e.candidates.join("/")}` : "—"} | ` +
        `${e.call.slice(0, 3).map(cell).join(", ")} | ${cell(e.call[3])} | ` +
        `${e.alphaPct ?? "—"} | ${e.rgba255 ? e.rgba255.join(",") : "—"} |`,
    );
  }
  L.push("");
  return L.join("\n") + "\n";
}

/* ───────────────────── main ───────────────────── */
const check = process.argv.includes("--check");
const outputs = [
  [OUT_JSON, JSON.stringify(census, null, 1) + "\n"],
  [OUT_MD, renderMd()],
];
if (check) {
  const stale = outputs.filter(([p, want]) => !existsSync(p) || readFileSync(p, "utf8") !== want);
  if (stale.length > 0) {
    console.error(
      `locust:check 過期：\n${stale.map(([p]) => `  ${p}`).join("\n")}\n→ 跑 ${CMD} 然後 git add`,
    );
    process.exit(1);
  }
  console.log(`locust:check OK（${outputs.length} 份產物皆最新）`);
} else {
  try {
    for (const [p, body] of outputs) writeFileSync(p, body);
  } catch (e) {
    if (e.code === "EACCES") {
      console.error(`⛔ 產物在隔離區鎖著 —— 用 bash scripts/genrun.sh locust:build（${e.path}）`);
      process.exit(1);
    }
    throw e;
  }
  const c = meta.counts;
  console.log(
    `locust:build 完成：普查 ${c.census} 隻 · 生成點 ${c.jassSites}（${c.jassRawcodes} rawcode）· ` +
      `runtimeAlpha ${c.vertexColorCalls}（resolved ${c.alphaResolved}）`,
  );
}
