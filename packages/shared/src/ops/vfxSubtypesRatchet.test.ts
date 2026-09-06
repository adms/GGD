/**
 * 🧩 GH#990 —— 特效**子模組**的棘輪 ＋ 出處 ＋ 等價閘。
 *
 * ⭐ **來源**（owner 2026-09-05，逐字）：
 * > 「並且盡量特效模組化(甚至 sub-type) 像JASS一樣可以呼叫設定 來拼湊組合
 * >  並非每個技能都一個特定特效」
 *
 * ⇒ 「並非每個技能都一個特定特效」是一句**可以量的**話：
 *   **只被 1 支技能引用的特效 key**（＝專屬積木）的數量。
 *   它今天是 **69**，而這條閘讓它**只能變少**。
 *
 * ── ⭐ 五條斷言，⛔ 沒有一條靠人讀 ────────────────────────────────────────
 * ① **棘輪（雙向）**：專屬特效數與「零 `call` 的 vfx-script 數」變多 ⇒ 紅；
 *    ⭐ 變**少**也紅 —— 並指名新的數字，逼下一批把基準線降下來。
 *    ⚠️ 單向棘輪的病：做完一批之後閘照樣綠，於是**下一批可以把它做回去**。
 * ② **出處對得上**：每一格 `params[*].origin` 的 `census:vfx-scripts/<id>#<i>.<欄位>`
 *    ⭐ 真的去讀那一支腳本**展開後**的那一段的那一格，並比對它**等不等於** `default`。
 *    ⚠️ 2026-09-06 誠實註記：8 支腳本改成 `call` 之後，一支沒有 `params` 覆寫的腳本
 *    展開後那一格**就是** default ⇒ 這一條對它們只剩「地址解得到、欄位還在那一段」；
 *    「default 不是編出來的」由 callify 當下的逐位元組等價（`tools/vfx-subtypes/callify.mjs`
 *    寫檔前的閘）＋ 一次性的 commit 證據擔保，⛔ 不再是活的斷言。
 * ③ **等價**（⭐ 承重）：`expandVfxSubtypeRaw(doc)` 用**預設值**展開的結果，
 *    要與 `derivedFrom` 的每一支腳本**經共用展開器展開後**的 `segments` **逐位元組相等**。
 *    ⇒ 展開器回空陣列／掉欄位／順序錯，在這裡當場紅（2026-09-06 突變驗過）。
 * ④ **sentinel**：自造**必然違規**的假資料，斷言檢查器抓得到它們（含呼叫段的展開器：
 *    子模組不存在／參數超界 ⇒ 擲）。校準要驗兩個方向 —— 一把只驗過單邊的尺不算自證過。
 * ⑤ **出貨 script 全部展得開**：每一支的每一個 `call` 都解得到子模組、參數合法、
 *    展開後零個 `call` 殘留，段數 ＝ Σ(子模組段數) ＋ inline 段數。
 *
 * 紅了怎麼辦：⛔ 不要改這裡的數字去配合現況。
 * · ① 變多 ⇒ 去看是誰又加了一顆只有一支技能用的特效／誰把 call 手寫回 inline；
 * · ① 變少 ⇒ ⭐ 恭喜，把基準線改成訊息裡那個數字並寫進 commit；
 * · ②③⑤ ⇒ 去 `content/vfx-subtypes/`／`content/vfx-scripts/` 修內容，⛔ 不是放寬這條閘。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  zVfxSubtypeDoc,
  expandVfxSubtypeRaw,
  VFX_SUBTYPE_CENSUS_RE,
  type VfxSubtypeDoc,
} from "../content/schema/vfxSubtype";
import { isVfxScriptCall, type VfxScriptAuthoredDoc as VfxScriptDoc } from "../content/schema/vfxScript";
import { canonJson as canon, expandVfxScriptEntries, VfxScriptExpandError } from "../content/vfxSubtypes/expand";
import { readVfxScriptExpanded, vfxSubtypeResolverFromDir } from "../content/vfxSubtypes/loadFromDir";

const ROOT = join(__dirname, "../../../..");
const VFX_DIR = join(ROOT, "content/vfx");
const ABILITY_DIR = join(ROOT, "content/abilities");
const SCRIPT_DIR = join(ROOT, "content/vfx-scripts");
const SUBTYPE_DIR = join(ROOT, "content/vfx-subtypes");

/**
 * ⭐ 量到的（2026-09-05，`content/abilities/*.json` 421 份 × `content/vfx/` 702 份）：
 * 被技能引用的不同特效 key **179**，其中只被 **1** 支技能引用的 **69**、2–4 支 81、
 * ≥5 支 29。⚠️ 票文寫的是 178/68（技能數 422）—— 差一支，⭐ 這裡用**重量到**的。
 * ⚠️ 2026-09-06 重量：仍是 69 —— 子模組動的是 vfx-script 那一層，⛔ 技能↔特效 key 的引用一格沒變。
 */
const EXCLUSIVE_VFX_BASELINE = 69;
/**
 * ⭐ 量到的（2026-09-06）：10 支 vfx-script，**8 支**改成 `call`（4 顆子模組各 2 個呼叫端），
 * 剩 2 支零 call：`godie-hart.r`（12 段，沒有 ≥2 呼叫端的重複）、`godie-udea.r`（1 段 screenShake）。
 */
const CALLLESS_SCRIPT_BASELINE = 2;

const jsonFiles = (dir: string): string[] =>
  readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_index.json");

const read = (p: string): unknown => JSON.parse(readFileSync(p, "utf-8"));

/** 深走一份文件，吐出每一個字串葉子。 */
function* strings(o: unknown): Generator<string> {
  if (typeof o === "string") yield o;
  else if (Array.isArray(o)) for (const v of o) yield* strings(v);
  else if (o && typeof o === "object") for (const v of Object.values(o)) yield* strings(v);
}

/** 每一顆特效 key → 引用它的技能 id 集合。 */
function referenceCensus(): Map<string, Set<string>> {
  const vfxIds = new Set<string>();
  for (const f of jsonFiles(VFX_DIR)) {
    const d = read(join(VFX_DIR, f)) as { id?: string };
    if (d.id) vfxIds.add(d.id);
  }
  const byVfx = new Map<string, Set<string>>();
  for (const f of jsonFiles(ABILITY_DIR)) {
    const d = read(join(ABILITY_DIR, f)) as { id?: string };
    const aid = d.id ?? f;
    for (const s of strings(d)) {
      if (!vfxIds.has(s)) continue;
      let set = byVfx.get(s);
      if (!set) byVfx.set(s, (set = new Set()));
      set.add(aid);
    }
  }
  return byVfx;
}

/** 出貨腳本**展開後**的段落（⭐ 走共用展開器 —— 播放器看到的就是這一份）。 */
const resolveSub = vfxSubtypeResolverFromDir(SUBTYPE_DIR);
const scriptSegments = (id: string): Record<string, unknown>[] =>
  readVfxScriptExpanded(join(SCRIPT_DIR, `${id}.json`), resolveSub).segments as Record<string, unknown>[];

const subtypeFiles = jsonFiles(SUBTYPE_DIR);
const subtypes: VfxSubtypeDoc[] = subtypeFiles.map(
  (f) => read(join(SUBTYPE_DIR, f)) as VfxSubtypeDoc,
);

/** ② 一格出處指到的那個值，與 default 對不對得上。回傳每一筆不符。 */
function originMismatches(doc: VfxSubtypeDoc): string[] {
  const bad: string[] = [];
  for (const [name, p] of Object.entries(doc.params)) {
    const m = VFX_SUBTYPE_CENSUS_RE.exec(p.origin);
    if (!m) {
      bad.push(`${doc.id}.${name} —— origin 沒有可解析的 census:vfx-scripts/<id>#<i>.<欄位>`);
      continue;
    }
    const [, sid, idx, field] = m;
    const path = join(SCRIPT_DIR, `${sid}.json`);
    if (!existsSync(path)) {
      bad.push(`${doc.id}.${name} —— origin 指到不存在的腳本 ${sid}`);
      continue;
    }
    const seg = scriptSegments(sid!)[Number(idx)];
    if (seg === undefined) {
      bad.push(`${doc.id}.${name} —— ${sid} 沒有第 ${idx} 段`);
      continue;
    }
    if (!(field! in seg)) {
      bad.push(`${doc.id}.${name} —— ${sid}#${idx} 沒有 ${field} 這一格`);
      continue;
    }
    const there = JSON.stringify(seg[field!]);
    const here = JSON.stringify(p.default);
    if (there !== here) {
      bad.push(`${doc.id}.${name} —— default ${here} ≠ 出處 ${sid}#${idx}.${field} 的 ${there}`);
    }
  }
  return bad;
}

/** ③ 用預設值展開之後，與 derivedFrom 的每一支腳本逐位元組相等嗎。 */
function equivalenceFailures(doc: VfxSubtypeDoc): string[] {
  const bad: string[] = [];
  const a = canon(expandVfxSubtypeRaw(doc));
  for (const sid of doc.derivedFrom) {
    if (!existsSync(join(SCRIPT_DIR, `${sid}.json`))) {
      bad.push(`${doc.id} 的出處腳本 ${sid} 不見了`);
      continue;
    }
    const b = canon(scriptSegments(sid));
    if (a !== b) bad.push(`${doc.id} 展開後 ≠ ${sid} 的 segments\n    展開: ${a}\n    來源: ${b}`);
  }
  return bad;
}

describe("GH#990 特效子模組 —— 棘輪 · 出處 · 等價", () => {
  it("GUARD THE GUARD：這條閘真的讀到了東西", () => {
    expect(subtypes.length, "content/vfx-subtypes/ 一份都沒讀到 ⇒ 這條閘在空轉").toBeGreaterThan(0);
    expect(jsonFiles(SCRIPT_DIR).length, "content/vfx-scripts/ 空了 ⇒ 路徑過期").toBeGreaterThan(0);
    expect(jsonFiles(VFX_DIR).length, "content/vfx/ 空了 ⇒ 路徑過期").toBeGreaterThan(100);
  });

  it("每一份 vfx-subtype 都通過 schema（含第〇·四的「第二個住處」檢查）", () => {
    const bad = subtypes
      .map((d) => zVfxSubtypeDoc.safeParse(d))
      .flatMap((r, i) =>
        r.success
          ? []
          : [`${subtypeFiles[i]}: ${r.error.issues.map((e) => `${e.path.join(".")} ${e.message}`).join(" · ")}`],
      );
    expect(bad, `vfx-subtype 文件不合法:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("② 每一格 default 的出處都指得到那一支腳本的那一格，而且值對得上", () => {
    const bad = subtypes.flatMap(originMismatches);
    expect(
      bad,
      "出處對不上 —— ⛔ 不要改這條閘，去把 content/vfx-subtypes/ 的 default 或 origin 修對:\n  " +
        bad.join("\n  "),
    ).toEqual([]);
  });

  it("③ 用預設值展開之後，與出處腳本的 segments 逐位元組相等（⭐ 承重）", () => {
    const bad = subtypes.flatMap(equivalenceFailures);
    expect(
      bad,
      "展開結果與出處不符 ⇒ 這一塊裡有一個**編出來的**值:\n  " + bad.join("\n  "),
    ).toEqual([]);
  });

  it("① 棘輪（雙向）：只被 1 支技能引用的專屬特效數只能變少", () => {
    const census = referenceCensus();
    const exclusive = [...census.entries()].filter(([, a]) => a.size === 1).map(([k]) => k);
    const n = exclusive.length;
    expect(
      n,
      `專屬特效（只有 1 支技能用）變多了：${n} > 基準線 ${EXCLUSIVE_VFX_BASELINE}。` +
        `⛔ 不要調高這個數字 —— 去看是誰又加了一顆只有一支技能用的特效。`,
    ).toBeLessThanOrEqual(EXCLUSIVE_VFX_BASELINE);
    expect(
      n,
      `⭐ 專屬特效降到 ${n} 了（基準線還寫著 ${EXCLUSIVE_VFX_BASELINE}）——` +
        ` 把 EXCLUSIVE_VFX_BASELINE 改成 ${n} 並寫進 commit，⛔ 否則下一批可以把它做回去`,
    ).toBeGreaterThanOrEqual(EXCLUSIVE_VFX_BASELINE);
  });

  it("① 棘輪（雙向）：零 `call` 的 vfx-script 數只能變少", () => {
    const callless = jsonFiles(SCRIPT_DIR).filter((f) => {
      const segs = (read(join(SCRIPT_DIR, f)) as { segments?: unknown[] }).segments ?? [];
      return !segs.some((s) => !!s && typeof s === "object" && "call" in (s as object));
    });
    const n = callless.length;
    expect(
      n,
      `還沒改用 call 的 vfx-script 變多了：${n} > ${CALLLESS_SCRIPT_BASELINE}`,
    ).toBeLessThanOrEqual(CALLLESS_SCRIPT_BASELINE);
    expect(
      n,
      `⭐ 剩 ${n} 支還沒改用 call —— 把 CALLLESS_SCRIPT_BASELINE 改成 ${n}`,
    ).toBeGreaterThanOrEqual(CALLLESS_SCRIPT_BASELINE);
  });

  it("⑤ 出貨的每一支 vfx-script 都展得開：call 解得到、參數合法、零 call 殘留、段數對得上", () => {
    const byId = new Map(subtypes.map((s) => [s.id, s]));
    const bad: string[] = [];
    for (const f of jsonFiles(SCRIPT_DIR)) {
      const raw = read(join(SCRIPT_DIR, f)) as VfxScriptDoc;
      let expanded: Record<string, unknown>[];
      try {
        expanded = expandVfxScriptEntries(raw.segments, resolveSub, { scriptId: raw.id }) as Record<string, unknown>[];
      } catch (e) {
        bad.push(`${f}: ${(e as Error).message}`);
        continue;
      }
      if (expanded.some(isVfxScriptCall)) bad.push(`${f}: 展開後還有 call 段`);
      const want = raw.segments.reduce(
        (n, e) => n + (isVfxScriptCall(e) ? (byId.get(e.call.subtype)?.segments.length ?? 0) : 1),
        0,
      );
      if (expanded.length !== want) bad.push(`${f}: 展開後 ${expanded.length} 段 ≠ 預期 ${want}`);
    }
    expect(bad, "出貨 script 展不開 —— 修 content，⛔ 不是放寬這條:\n  " + bad.join("\n  ")).toEqual([]);
  });

  it("④ sentinel：自造的違規資料，每一個檢查器都抓得到", () => {
    const base = subtypes[0]!;

    // (d) 呼叫段的展開器：子模組不存在 ⇒ 擲；參數超界 ⇒ 擲（⛔ 不是靜默略過那一段）
    const numParam = Object.entries(base.params).find(([, p]) => p.type === "number");
    expect(() => expandVfxScriptEntries([{ call: { subtype: "sub.does-not-exist" } }], resolveSub)).toThrow(
      VfxScriptExpandError,
    );
    if (numParam) {
      const [name, p] = numParam;
      const outOfRange = (p.max ?? 0) + 1;
      expect(() =>
        expandVfxScriptEntries([{ call: { subtype: base.id, params: { [name]: outOfRange } } }], resolveSub),
      ).toThrow(VfxScriptExpandError);
    }
    expect(() => expandVfxScriptEntries([{ call: { subtype: base.id, params: { 沒有這一格: 1 } } }], resolveSub)).toThrow(
      /不是 .* 的參數/,
    );

    // (a) 第二個住處：被 bind 的欄位同時寫回樣板 ⇒ schema 要擋
    const doubleHome = JSON.parse(JSON.stringify(base)) as VfxSubtypeDoc;
    const firstParam = Object.keys(doubleHome.params)[0]!;
    const b0 = doubleHome.params[firstParam]!.bind[0]!;
    doubleHome.segments[b0.segment]![b0.field] = doubleHome.params[firstParam]!.default;
    const r = zVfxSubtypeDoc.safeParse(doubleHome);
    expect(r.success, "sentinel(a)：同一格住兩個地方竟然通過了 schema").toBe(false);
    expect(
      r.success ? "" : r.error.issues.map((e) => e.message).join(" "),
      "sentinel(a)：訊息要指名「兩個住處」",
    ).toContain("兩個住處");

    // (b) 出處對不上：把 default 改掉，origin 不動
    const wrongDefault = JSON.parse(JSON.stringify(base)) as VfxSubtypeDoc;
    wrongDefault.params[firstParam]!.default = "⛔ 一個編出來的值";
    expect(
      originMismatches(wrongDefault).length,
      "sentinel(b)：一個與出處不符的 default 竟然沒被抓到",
    ).toBeGreaterThan(0);

    // (c) 等價漂掉：把樣板的一段刪掉
    const shortened = JSON.parse(JSON.stringify(base)) as VfxSubtypeDoc;
    shortened.segments.pop();
    expect(
      equivalenceFailures(shortened).length,
      "sentinel(c)：展開結果少了一段竟然還等價",
    ).toBeGreaterThan(0);
  });
});
