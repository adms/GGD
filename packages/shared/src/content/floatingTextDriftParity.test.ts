/**
 * ⭐【GH#853】喊招字的 drift 角度 ↔ `war3map.j` 的 `SetTextTagVelocityBJ` —— **兩頭都走**。
 *
 * #853 的機制（`driftSpeed` / `driftAngleDeg` / `driftAngleStepDeg` / `driftFrom`）已經接上，
 * 而 AC 是「**照 JASS 角度飛**」⇒ 剩下的是內容側逐支翻。在此之前「哪幾支該翻」
 * **只以散文存在**於票與報告裡，⛔ 而那份散文錯了（2026-08-29 量到）：
 *
 *   · 報告寫「`tools/skill-remake/` 的 15 位英雄裡**只有一顆** floatingText 的 JASS 出處
 *     是非 90°」⇒ ⛔ 實際是**三處**（j:32063 銀色甲胄 · j:32585 `{{i}}Hit` · j:32624「8Hit」）。
 *     ⭐ 根因是**掃描只從 GGD 那一頭走**：它問「每個**存在的** GGD 節點的出處是什麼」，
 *     於是**原作有而 GGD 沒有的**那兩處**結構上進不了母體**（CLAUDE.md 失敗形態⑫）。
 *   · 從 JASS 那一頭走，第一次量到的最大一筆根本不在票上：**04-03 龍破斬的五句詠唱**
 *     （j:29895/29901/29907/29913/29919，`SetTextTagVelocityBJ(tag, 32.00,
 *     GetUnitFacing(GetTriggerUnit()))`）⇄ `godie-h020.e` / `godie-hjai.e` 各五顆
 *     floatingText，**五句逐字對得上**。
 *
 * ⇒ ⭐ 這條閘把那份母體變成**每次跑都重算**的東西。
 * ⚠️ ⛔ 它**不裁決** `driftSpeed` 填多少 —— JASS 的速度走 `TextTagSpeed2Velocity`
 *    (=speed*0.071/128) 是**螢幕**速度，與 GGD 的世界單位/秒之間**沒有推導得出來的換算**
 *    （第一守則：引用不到就是我編的）。這條閘只保證**角度**指得到 JASS 的某一行。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { abilityCode } from "./abilityCodeParity";
import { zFloatingText } from "./schema/effects/floatingText";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const JASS = join(ROOT, "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j");
const DIRS = ["content/abilities", "content/champions"].map((d) => join(ROOT, d));

/** 角度**運算式**的家族 —— 從 JASS 重算，⛔ 不是宣告的。 */
type AngleKind = "unitFacing" | "random" | "global" | "other";

interface Site {
  readonly line: number;
  /** `Trig_<fam>_Actions` / `_FuncNNNA` 去殼之後的觸發器家族名。 */
  readonly fam: string;
  readonly speed: string;
  readonly angle: string;
}

/**
 * ⭐ 全 `war3map.j` 的 **26 個非 90° 呼叫**（另有 94 個逐字 `90` ＝ 直升 ＝ GGD 的
 * `riseSpeed`，⛔ 不是 drift）。`code` 是 w3x 技能編號：家族在 `jass-spells/INDEX.json`
 * 查得到的佔 20 個；⚠️ 另外 6 個是**輔助觸發器／掛在英雄 unit 上的天生技**
 * （CLAUDE.md：天生技的 JASS 掛在**英雄 rawcode** 上）⇒ 手工對應，
 * 其中 `saber`／`ExcaliburMAX` 住 `unit-E002.j`（＝ Saber `godie-e002`）。
 */
const SITES: readonly (Site & { readonly code: string })[] = [
  { line: 27347, fam: "ComeToEat", speed: "48.00", angle: "GetUnitFacing(udg_Auzimi)", code: "24-002" },
  { line: 27491, fam: "HundredKill", speed: "32.00", angle: "GetUnitFacing(udg_Auzimi)", code: "19-03" },
  { line: 27497, fam: "HundredKill", speed: "32.00", angle: "GetUnitFacing(udg_Auzimi)", code: "19-03" },
  { line: 27591, fam: "HundredKillEffect", speed: "8.00", angle: "GetUnitFacing(GetEnumUnit())", code: "19-03" },
  { line: 27618, fam: "HundredKillEffect", speed: "48.00", angle: "GetUnitFacing(udg_Auzimi)", code: "19-03" },
  { line: 28602, fam: "WildCut", speed: "64.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "17-04" },
  { line: 28674, fam: "WildCut_Effect", speed: "350.00", angle: "GetRandomDirectionDeg()", code: "17-04" },
  { line: 28922, fam: "ABanX", speed: "12.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "08-04" },
  { line: 29895, fam: "Fire_NOVA", speed: "32.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "04-03" },
  { line: 29901, fam: "Fire_NOVA", speed: "32.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "04-03" },
  { line: 29907, fam: "Fire_NOVA", speed: "32.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "04-03" },
  { line: 29913, fam: "Fire_NOVA", speed: "32.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "04-03" },
  { line: 29919, fam: "Fire_NOVA", speed: "32.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "04-03" },
  { line: 32063, fam: "saber", speed: "32.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "20-00" },
  { line: 32585, fam: "ExcaliburMAX", speed: "100.00", angle: "GetRandomDirectionDeg()", code: "20-002" },
  { line: 32624, fam: "ExcaliburMAX", speed: "100.00", angle: "udg_superAngle", code: "20-002" },
  { line: 33091, fam: "CloseDestAddAb", speed: "10.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "21-04" },
  { line: 33809, fam: "SuperFF7", speed: "64.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "01-04" },
  { line: 33857, fam: "SuperFF7", speed: "100.00", angle: "udg_superAngle", code: "01-04" },
  { line: 34153, fam: "order123", speed: "64.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "07-01" },
  { line: 34219, fam: "Jump_Start", speed: "64.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "07-03" },
  { line: 34411, fam: "MoonKnock", speed: "64.00", angle: "GetUnitFacing(GetTriggerUnit())", code: "07-02" },
  { line: 38828, fam: "HunrThum", speed: "64", angle: "GetRandomDirectionDeg()", code: "25-03" },
  { line: 52162, fam: "Nine_Lives_Hits", speed: "180.00", angle: "GetRandomDirectionDeg()", code: "52-002" },
  { line: 52261, fam: "Nine_Lives_out", speed: "150.00", angle: "GetRandomDirectionDeg()", code: "52-002" },
  { line: 52267, fam: "Nine_Lives_out", speed: "180.00", angle: "GetRandomDirectionDeg()", code: "52-002" },
];

/** 逐字 `90` 的呼叫數 —— ⭐ 直升是**大宗**，⛔ 票文寫的「大宗是 64/90 以外」是假的。 */
const LITERAL_90 = 94;

/**
 * ⭐ **還沒翻的**：原作有非 90° 角度、GGD 也**已經有** floatingText 節點、而節點上沒有
 * 任何 `drift*`。⇒ 這就是 #853 的 AC 剩下的**全部**表面積，⭐ 而它是量出來的。
 * ⚠️ 棘輪：翻好一支就拿掉，⛔ 新增一筆＝有人加了指得到 JASS 角度卻沒跟著翻的節點。
 * ⛔ 兩支都**不是** `skillremake:json` 的產物（`godie-h020` / `godie-hjai` / `godie-hart`
 *    的 provenance 是 `w3x-import`）⇒ 改它們要動 `content/`。
 */
const UNTRANSLATED = [
  "04-03|29895", "04-03|29901", "04-03|29907", "04-03|29913", "04-03|29919",
  // ⭐ **01-04 超究武神霸斬翻好了**（2026-08-29）—— 棘輪只准變少，這兩筆拿掉：
  //   · `j:33809` 速度 **64.00** 沿 `GetUnitFacing(GetTriggerUnit())`（裸面向 ⇒ 角度 0）
  //     ⇒ finisher 節點：`driftSpeed:0.64` · `driftFrom:"casterFacing"` · `driftAngleDeg:0`
  //   · `j:33857` 速度 **100.00** 沿 `udg_superAngle`，而 `j:33850` 每一刀 `+270.00`
  //     ⇒ perStrike 節點：`driftSpeed:1.0` · `driftAngleStepDeg:270` · `driftFrom:"casterFacing"`
  // ⚠️ `driftSpeed` 的數字是**速度比例**（原作 8…350）⇒ 64→0.64 / 100→1.0 是**比例翻譯**，
  //   ⛔ 不是像素換算 —— 那一格的絕對觀感要一次視覺驗收才定得下來（票上已記）。
  // ⭐ standalone 與 `content/champions/godie-hart.json` 的內嵌版**兩份都動了**。
] as const;

const DRIFT_KEYS = ["driftSpeed", "driftAngleDeg", "driftAngleStepDeg", "driftFrom"] as const;

const famOf = (fn: string): string =>
  fn.replace(/^Trig_/, "").replace(/_Func\w*$/, "").replace(/_(Actions|Conditions)$/, "");

function angleKind(a: string): AngleKind {
  if (a.includes("GetRandomDirectionDeg")) return "random";
  if (a.includes("GetUnitFacing")) return "unitFacing";
  if (/^udg_\w+$/.test(a)) return "global";
  return "other";
}

/** 逐字元配對括號切頂層參數 —— ⛔ 只吃數字字面值的正則會漏掉一半（CLAUDE.md 記過）。 */
function args(line: string, open: number): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = open; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "(") {
      depth++;
      if (depth === 1) continue;
    } else if (ch === ")") {
      if (--depth === 0) break;
    } else if (ch === "," && depth === 1) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

interface Jass {
  readonly sites: Site[];
  readonly literal90: number;
  /** 家族 → 它自己**指派過**的 `udg_*` 名字（⛔ 註解掉的不算）。 */
  readonly writes: Map<string, Set<string>>;
  readonly commented: Set<number>;
}

function scanJass(): Jass {
  const lines = readFileSync(JASS, "utf8").split("\n");
  const sites: Site[] = [];
  const writes = new Map<string, Set<string>>();
  const commented = new Set<number>();
  let literal90 = 0;
  let fn = "";
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const dec = /^\s*function\s+(\w+)\s+takes/.exec(l);
    if (dec) fn = dec[1]!;
    else if (/^\s*endfunction/.test(l)) fn = "";
    const isComment = l.trimStart().startsWith("//");
    const set = /^\s*set\s+(udg_\w+)\s*=/.exec(l);
    if (set && !isComment) {
      const bucket = writes.get(famOf(fn)) ?? new Set<string>();
      bucket.add(set[1]!);
      writes.set(famOf(fn), bucket);
    }
    const at = l.indexOf("SetTextTagVelocityBJ(");
    if (at < 0) continue;
    const a = args(l, l.indexOf("(", at));
    const angle = (a[2] ?? "").trim();
    if (/^-?\d+(\.\d+)?$/.test(angle) && Number(angle) === 90) {
      literal90++;
      continue;
    }
    if (isComment) commented.add(i + 1);
    sites.push({ line: i + 1, fam: famOf(fn), speed: (a[1] ?? "").trim(), angle });
  }
  return { sites, literal90, writes, commented };
}

/** 編號 → GGD 今天出貨的 floatingText 狀態（standalone **與**內嵌兩份住處一起掃）。 */
function ggdByCode(): Map<string, { nodes: number; drift: string[] }> {
  const out = new Map<string, { nodes: number; drift: string[] }>();
  const walk = (o: unknown, code: string | null, file: string): void => {
    if (Array.isArray(o)) return void o.forEach((v) => walk(v, code, file));
    if (!o || typeof o !== "object") return;
    const rec = o as Record<string, unknown>;
    const own = abilityCode(rec.name) ?? code;
    if (rec.kind === "floatingText" && own) {
      const e = out.get(own) ?? { nodes: 0, drift: [] };
      e.nodes++;
      for (const k of DRIFT_KEYS) if (rec[k] !== undefined) e.drift.push(`${file}:${k}`);
      out.set(own, e);
    }
    for (const v of Object.values(rec)) walk(v, own, file);
  };
  for (const dir of DIRS) {
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      walk(JSON.parse(readFileSync(join(dir, f), "utf8")), null, f);
    }
  }
  return out;
}

describe("floatingText drift ↔ war3map.j 的 SetTextTagVelocityBJ（GH#853）", () => {
  const jass = scanJass();
  const ggd = ggdByCode();
  const key = (s: Site): string => `j:${s.line} ${s.fam} speed=${s.speed} angle=${s.angle}`;

  it("⭐ JASS 端的母體不可以漂（26 個非 90° ＋ 94 個逐字 90）", () => {
    const now = jass.sites.map(key);
    const want = SITES.map(key);
    expect(
      [
        ...now.filter((x) => !want.includes(x)).map((x) => `⛔ 表上沒有　${x}`),
        ...want.filter((x) => !now.includes(x)).map((x) => `⛔ 表上有而 JASS 沒有　${x}`),
      ].join("\n"),
      "⛔ `war3map.j` 的喊招字呼叫點與 SITES 對不上（重新匯入 w3x 之後最可能）。\n" +
        "⭐ 這條的存在理由：在此之前這份母體只以**報告裡的散文**存在，而它錯了 ——\n" +
        "   「只有一顆非 90°」實際是三處。照 j: 行號逐行讀 JASS 再更新 SITES。",
    ).toBe("");
    expect(jass.literal90, "⛔ 逐字 90°（＝直升＝riseSpeed）的呼叫數變了").toBe(LITERAL_90);
    expect([...jass.commented], "⛔ 只有 08-04 阿邦快速劍X 那段是註解掉的（原作沒有喊招字）").toEqual([28922]);
  });

  it("⛔ GGD 端不可以有指不到 JASS 出處的 drift（第二頭）", () => {
    const live = new Map<string, AngleKind[]>();
    for (const s of SITES) {
      if (jass.commented.has(s.line)) continue;
      live.set(s.code, [...(live.get(s.code) ?? []), angleKind(s.angle)]);
    }
    const bad: string[] = [];
    for (const [code, st] of [...ggd].sort()) {
      if (st.drift.length === 0) continue;
      const kinds = live.get(code);
      if (!kinds) {
        bad.push(`⛔ ${code} 帶了 drift，而 war3map.j 裡它沒有任何非 90° 出處：${st.drift.join(" ")}`);
        continue;
      }
      if (st.drift.some((d) => d.endsWith(":driftFrom")) && !kinds.includes("unitFacing"))
        bad.push(`⛔ ${code} 用了 driftFrom，而它的 JASS 角度不是 GetUnitFacing`);
      if (st.drift.some((d) => d.endsWith(":driftAngleStepDeg")) && !kinds.includes("global"))
        bad.push(`⛔ ${code} 用了 driftAngleStepDeg，而它的 JASS 角度不是逐段遞增的 udg_*`);
    }
    expect(bad.join("\n"), "⛔ 翻譯 ≠ 近似：每一格角度都要指得到 `SetTextTagVelocityBJ` 的某一行。").toBe("");
  });

  it("⭐ 「還沒翻的」只准變少（⛔ 新增一筆＝加了節點卻沒跟著翻角度）", () => {
    const open = SITES.filter((s) => {
      if (jass.commented.has(s.line)) return false;
      const k = angleKind(s.angle);
      // ⛔ `random` 表達不了（見下一條）；`global` 只有在**它自己的家族會寫它**時才算得出來。
      return k === "unitFacing" || (k === "global" && (jass.writes.get(s.fam)?.has(s.angle) ?? false));
    })
      .filter((s) => {
        const st = ggd.get(s.code);
        return st !== undefined && st.nodes > 0 && st.drift.length === 0;
      })
      .map((s) => `${s.code}|${s.line}`);
    const known = new Set<string>(UNTRANSLATED);
    expect(
      [
        ...open.filter((k) => !known.has(k)).map((k) => `⛔ 新增　${k}　JASS 角度指得到，而 GGD 節點上沒有 drift`),
        ...UNTRANSLATED.filter((k) => !open.includes(k)).map((k) => `✅ 翻好了　${k}　把它從 UNTRANSLATED 拿掉`),
      ].join("\n"),
      `⛔ 「還沒翻的」從 ${UNTRANSLATED.length} 變成 ${open.length}（GH#853 的 AC 表面積）。\n` +
        '⭐ 逐支翻：在那顆 floatingText 上補 `driftFrom:"casterFacing"`（`GetUnitFacing`）或\n' +
        "   `driftAngleStepDeg`（逐段遞增的 `udg_*`），⛔ 而 `driftSpeed` 的數字**沒有換算**\n" +
        "   ⇒ 那一格要 owner 或一次視覺驗收定。\n" +
        "⚠️ 動之前先 `bash scripts/genguard.sh content/abilities/<id>.json`，而且 standalone\n" +
        "   與 `content/champions/<hero>.json` 的內嵌版**兩份都要動**。",
    ).toBe("");
  });

  it("⛔ 表達不了的兩族要自己過期（⛔ 不是一句活過保存期限的散文）", () => {
    const arms = zFloatingText.shape.driftFrom.unwrap().options as readonly string[];
    const randoms = SITES.filter((s) => angleKind(s.angle) === "random").map((s) => `j:${s.line} ${s.code}`);
    expect(
      arms.includes("random") ? `⭐ driftFrom 多了 random ⇒ 回頭翻這 ${randoms.length} 顆：${randoms.join(" · ")}` : "",
      "⭐ 這條刻意是**反過來**的：`driftFrom` 今天只有 world／casterFacing 兩臂 ⇒ " +
        "`GetRandomDirectionDeg()` 那一族表達不了、刻意留白。加了第三臂就要回頭把它們翻掉。",
    ).toBe("");
    expect(randoms.length, "⛔ 隨機方向的呼叫點數變了").toBe(6);
    // ⭐ j:32624「8Hit」讀的 `udg_superAngle`，**它自己的觸發器從來沒寫過** —— 值是
    //    01-04 超究武神霸斬（另一位英雄的技能）留下來的 ⇒ 角度**推導不出來**，刻意不翻。
    expect(jass.writes.get("ExcaliburMAX")?.has("udg_superAngle") ?? false).toBe(false);
    expect(jass.writes.get("SuperFF7")?.has("udg_superAngle") ?? false).toBe(true);
  });
});
