/**
 * ⭐⭐ **46 份驗收 · 批2「投射與光束」（8 份）的一套治具**（GH#960）。
 *
 * ⭐ 票文的 [思考策略] 逐字：「⛔ 不要逐份驗（8 輪）—— 本批 8 份**共用同一組斷言**
 * （投射物先飛行再爆炸 · 沿途命中與終點範圍分開 · 光束長寬與傷害線一致 · 連鎖跳數與衰減）」
 * ⇒ ⭐ **一套治具 × 一張 8 列的表**，⛔ 不是 8 條測試。
 *
 * ── ⚠️⚠️ 前提回驗（2026-09-03 實查，⛔ 兩條不成立）────────────────────────
 * ① 票文：「本批的 id 清單只有一個住處（#953 定案的 **#838 body**）」
 *    ⇒ ⛔ **今天不成立**：#838 的 body 裡 `godie-hvwd` 0 命中，而 #953 的檔頭逐字說
 *      它「⛔ 一個字都沒有動那張票」。46 份清單今天唯一的住處是
 *      `docs/_daily/ledger-source_temp_20260903.md` —— ⚠️ **git 未追蹤 ＋ `_temp_` 命名**
 *      ⇒ `temp-sweep.sh --move` 七天後就會把它搬走。
 *    ⇒ ⭐ 本輪照 #953 的前例落一份**只含批 2** 的機器住處（其餘五批各自一份 ⇒ 零檔案重疊）。
 * ② 票文：「已量到 46 份裡 **27 份缺 rangeTier**」
 *    ⇒ ⭐ 全庫實測 **235/421 缺**，⛔ 而**本批 8 份裡只有 1 份缺**（`godie-udea.r`，
 *      它 `range: 0` ＋ 連鎖以施法者為圓心 ⇒ 缺得**可能有道理**）。
 * ③ ⚠️⚠️ **2026-09-03 更正（第三次前提回驗）**：共同規則 #4「五級距標籤不存在
 *    ⇒ 阻塞於 #943」⛔ **兩個軸都判錯**，而兩個理由都逐字寫在出貨原始碼的檔頭裡
 *    （見 `axisIsVerifiable` 的註解）。⇒ ⭐ 本批阻塞份數從 **8** 變成 **0**：
 *    `conditionTier` 缺席是 #943 的設計（推導）· `udea.r` 的字面 `range: 0.0` 是
 *    `rangeTiers.ts:109` 明文允許的寫法。⛔ 「照規則判阻塞」在這裡不是嚴謹，
 *    是把一條**假規則**當成了證據。
 *
 * ── ⭐ 兩個方向（⛔ 單邊校準過的尺不算自證過）──────────────────────────────
 * ⭐ 本批 8 張卡裡**恰好 4 張**宣稱「直線」：`ogrh.r` `o00x.r` **做得出來**（`damageLine`），
 * 而 `hvwd.e`（`tpl-single-strike` ＝ 單體）·`o00k.e`（`tpl-instant-blast` ＝ 瞬發範圍）
 * **做不出來** ⇒ ⭐ 治具必須**正好**指名那兩支：
 * · 少指 ⇒ 靜默通過（AC #3 的「⛔ 不通過」）· 多指 ⇒ 它是一個會對每支都喊的橡皮圖章。
 *
 * ── 🧬 突變紀錄（實跑：改壞 → 🔴 → 還原；⭐ 走 `scripts/edit-or-die.py`）──────
 * M1【出貨資料】`content/abilities/godie-udea.r.json` 的 `"jumps": 16` → `12`
 *    ⇒ 🔴 ⑤「連鎖」：`godie-udea.r · jumps: 卡面說 16 而節點是 12`
 *    ⇒ ⭐ 證明治具讀的是**出貨的那一份**，⛔ 不是自己造的夾具（失敗形態⑤）。
 * M2【治具承重行】`strip` 改成 identity（`(s) => s`，⇒ 不再剝 `「…」`／`{{…}}`）
 *    ⇒ 🔴 ③「量尺自證」：剝離不再改變任何一張卡 ⇒ 指名「⛔ 對白剝離沒有在跑」。
 * M3【治具承重行】`LINE_TPL` 的家族判準 `/line|beam|wave/` → `/./`（⇒ 每個模板都算直線）
 *    ⇒ 🔴 ②「已知**沒有**的那一邊」：`hvwd.e` / `o00k.e` 不再被指名 ⇒ 橡皮圖章被抓到。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
// ⭐ 驗收「這一軸驗不驗得到」一律問**出貨的解析器**，⛔ 不問「欄位在不在」（見 axisIsVerifiable）。
import { CONDITION_TIER_UNCONDITIONAL, resolveConditionTier, scalingIsGated } from "../content/conditionTiers";
import { rangeTiersFromDoc, resolveRangeTier } from "../content/rangeTiers";

const ROOT = join(__dirname, "../../../..");
const ABILITY_DIR = join(ROOT, "content/abilities");
const TEMPLATE_DIR = join(ROOT, "content/ability-templates");

type Json = Record<string, unknown>;
const read = (p: string): Json => JSON.parse(readFileSync(p, "utf8")) as Json;
const jsonFiles = (dir: string): string[] =>
  readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_index.json");

/** ⭐ 名冊住在檔案裡（第〇·四守則）—— ⛔ 這一支測試裡**沒有**任何一個 id 字面值。 */
const ROSTER = read(join(ROOT, "docs/editor-contract/ggd-acceptance-batch2-projectile-beam.json")) as {
  rows: { n: number; id: string; name: string; type: string; knownConflict?: boolean }[];
  mirrorPairs: [string, string][];
  cosmeticKeys: string[];
  commonRule4: { axes: string[] };
};

/** ⭐ 「哪些模板是直線／光束形狀」從**出貨模板文件的 `family`** 推導，⛔ 不手寫 id 清單。 */
const TPL = new Map<string, { family: string; defaults: Json }>();
for (const f of jsonFiles(TEMPLATE_DIR)) {
  const t = read(join(TEMPLATE_DIR, f)) as { id: string; family: string; params?: Record<string, Json> };
  const defaults: Json = {};
  for (const [k, v] of Object.entries(t.params ?? {})) defaults[k] = v["default"];
  TPL.set(t.id, { family: t.family, defaults });
}
const LINE_TPL = new Set([...TPL].filter(([, t]) => /line|beam|wave/.test(t.family)).map(([id]) => id));

/** ⭐ 第〇·六守則細則②：讀機制之前先剝掉整段 `「…」`（角色對白）與 `{{…}}`（佔位）。 */
const strip = (s: string): string => s.replace(/「[^」]*」/gs, "").replace(/\{\{[^}]*\}\}/g, "");
const CLAIMS_LINE = /一直線|直線|貫穿/;

/** ⭐ 出貨的距離級距表（⛔ 不是自己編的），`resolveRangeTier` 要吃它。 */
const RANGE_TIERS = rangeTiersFromDoc(read(join(ROOT, "content/config/range-tiers.json")));

/** 這一支技能上所有帶 `ratios` / `condition` 的節點。 */
function scalingNodes(node: unknown, out: Json[] = []): Json[] {
  if (Array.isArray(node)) {
    for (const x of node) scalingNodes(x, out);
  } else if (node !== null && typeof node === "object") {
    const rec = node as Json;
    if ("ratios" in rec || "condition" in rec) out.push(rec);
    for (const v of Object.values(rec)) scalingNodes(v, out);
  }
  return out;
}

/**
 * ⭐⭐ **「這一軸驗得到嗎」問的是解析器，⛔ 不是「欄位在不在」。**
 *
 * ⚠️ 這一段在 2026-09-03 之前是 `!(k in doc)` —— 而那條規則**兩個軸都判錯**，
 * 兩個理由不同，⭐ 而兩個理由都逐字寫在出貨原始碼的檔頭裡：
 *
 * · `conditionTier` —— `conditionTiers.ts:56`「⭐ **唯一的查表入口**。**缺席 ⇒ 推導**；
 *   填了 ⇒ 照填的（⛔ 作者贏）」⇒ #943（`3bdb3f925`，標題逐字「正解是**推導**，
 *   ⛔ 不是去填 235 份檔」）之後，**欄位缺席就是正常狀態** ⇒ 這一軸**恆可驗**。
 * · `rangeTier` —— `rangeTiers.ts:109`「沒有 `rangeTier` → 原樣返回。
 *   **手寫 `range` 是完全合法的寫法**」⇒ 缺標籤只代表作者直接寫了數字。
 *   ⇒ 真正驗不到的只有「解析完**一個距離都拿不出來**」。
 *
 * ⇒ ⭐ 判準因此是**解析後的結果**，⛔ 不是文件上的字面。
 */
function axisIsVerifiable(axis: string, doc: Json): boolean {
  if (axis === "conditionTier") return scalingNodes(doc).every((n) => typeof resolveConditionTier(n) === "string");
  if (axis === "rangeTier") {
    const resolved = resolveRangeTier(doc, RANGE_TIERS) as Json;
    return typeof resolved["range"] === "number" || doc["rangeUnlimited"] === true;
  }
  return axis in doc;
}

const NEST = ["effects", "onArrive", "onTouch", "onHit", "onHitTargets", "finalEffects"] as const;
function walk(nodes: unknown, out: Json[] = []): Json[] {
  if (!Array.isArray(nodes)) return out;
  for (const n of nodes as Json[]) {
    out.push(n);
    for (const k of NEST) walk(n[k], out);
  }
  return out;
}

type Row = {
  id: string;
  doc: Json;
  nodes: Json[];
  kinds: string[];
  claimsLine: boolean;
  lineNodes: string[];
  tplFamily: string | null;
  missingTiers: string[];
  verdict: string;
};

/** ⭐⭐ 治具：一支進 → 一列出。8 份共用它，⛔ 不是 8 條測試。 */
function assess(id: string): Row {
  const doc = read(join(ABILITY_DIR, `${id}.json`));
  const nodes = walk(doc["effects"]);
  const kinds = nodes.map((n) => String(n["kind"]));
  const tplRef = (doc["template"] as Json | undefined)?.["ref"] as string | undefined;
  const lineNodes: string[] = [];
  if (kinds.includes("damageLine")) lineNodes.push("damageLine");
  if (kinds.includes("spawnProjectile")) lineNodes.push("spawnProjectile");
  for (const n of nodes) {
    const preset = n["preset"];
    // ⚠️ 光束**預設**只給演出幾何（`tpl-line-blast` 檔頭逐字：⛔ 不自動塞傷害）
    //    ⇒ ⭐ 只有作者真的接了 `onTouch` / `onArrive` 才算「做得出一條線」。
    if (typeof preset === "string" && LINE_TPL.has(preset) && (n["onTouch"] ?? n["onArrive"]))
      lineNodes.push(`spawnModelFx:${preset}`);
  }
  if (tplRef && LINE_TPL.has(tplRef)) lineNodes.push(`template:${tplRef}`);
  const claimsLine = CLAIMS_LINE.test(strip(String(doc["description"] ?? "")));
  const missingTiers = ROSTER.commonRule4.axes.filter((k) => !axisIsVerifiable(k, doc));
  const conflict = claimsLine && lineNodes.length === 0;
  return {
    id,
    doc,
    nodes,
    kinds,
    claimsLine,
    lineNodes,
    tplFamily: tplRef ? (TPL.get(tplRef)?.family ?? null) : null,
    missingTiers,
    verdict: conflict
      ? `⛔ 不通過（語意衝突：卡面說直線，而機制是 ${tplRef ? TPL.get(tplRef)?.family : kinds.join("+") || "空"}）`
      : missingTiers.length
        ? `⛔ 阻塞（解析器拿不出值：${missingTiers.join(" / ")}）`
        : "通過",
  };
}

const ROWS: Row[] = ROSTER.rows.map((r) => assess(r.id));
const byId = (id: string): Row => ROWS.find((r) => r.id === id)!;

describe("46 份驗收 · 批2 投射與光束（GH#960）", () => {
  it("★★ ⭐ 8 份**逐份有判定**，⛔ 沒有一份空白（AC #1）", () => {
    const missing = ROSTER.rows.filter((r) => !existsSync(join(ABILITY_DIR, `${r.id}.json`))).map((r) => r.id);
    expect(missing, "⛔⛔ 名冊指向不存在的技能 ⇒ 那一列永遠驗不到東西").toEqual([]);
    expect(ROWS.length, "⛔ 批 2 是 8 份 —— 少一份 = 在驗一個更小的母體").toBe(8);
    expect(
      ROWS.filter((r) => !r.verdict).map((r) => r.id),
      "⛔ 有一份沒有判定 —— ⭐ AC #1 要的是「通過／阻塞／不通過」三選一，⛔ 不是空白",
    ).toEqual([]);
  });

  it("★★ ⭐⭐ **已知語意衝突要被指名**，⛔ 靜默通過 ＝ 不通過（AC #3）", () => {
    // ⭐ 已知**有**的那一邊：名冊上標了 knownConflict 的那兩支
    const expectConflict = ROSTER.rows.filter((r) => r.knownConflict).map((r) => r.id).sort();
    const flagged = ROWS.filter((r) => r.verdict.startsWith("⛔ 不通過")).map((r) => r.id).sort();
    expect(
      flagged,
      "⛔⛔ 語意衝突沒有被指名 ⇒ ⭐ AC #3 逐字：「靜默通過 ＝ 不通過」。\n" +
        `  · 應該被指名：${expectConflict.join(" / ")}（卡面說直線，而模板是單體／瞬發範圍）\n` +
        `  · 實際指名：${flagged.join(" / ") || "（一支都沒有）"}\n` +
        "  ⇒ ⭐ 修法是把那一支換成直線積木（`tpl-line-blast` / `tpl-line-sweep` / `damageLine`），\n" +
        "     ⛔ 不是把這條斷言放寬。",
    ).toEqual(expectConflict);
    // ⭐ 已知**沒有**的那一邊：另外兩張也宣稱直線的卡**做得出來** ⇒ ⛔ 不可以被指名
    const alsoClaimLine = ROWS.filter((r) => r.claimsLine && !flagged.includes(r.id));
    expect(
      alsoClaimLine.map((r) => r.id).sort(),
      "⛔⛔ 反方向壞了 —— ⭐ 本批有 4 張卡宣稱直線，其中 2 張**做得出來**（`damageLine`）。\n" +
        "  ⇒ 它們被指名 ＝ 這支治具對每一支都喊 ＝ 橡皮圖章（⛔ 單邊校準過的尺不算自證過）。",
    ).toHaveLength(2);
    for (const r of alsoClaimLine)
      expect(r.lineNodes, `⛔ ${r.id} 宣稱直線卻找不到任何直線節點`).not.toEqual([]);
  });

  it("★★ ⭐ **量尺自證**：對白／佔位剝離真的在跑（⛔ 沒剝就會把台詞讀成機制）", () => {
    const changed = jsonFiles(ABILITY_DIR).filter((f) => {
      const d = String(read(join(ABILITY_DIR, f))["description"] ?? "");
      return strip(d) !== d;
    });
    expect(
      changed.length,
      "⛔⛔ 對白剝離沒有在跑 —— ⭐ 第〇·六守則②：`「…」` 是角色對白⛔ 不是效果。\n" +
        "  ⚠️ 沒剝的話「…在35秒後宣布勝利吧。」會被讀成一支有 35 秒時序的技能。",
    ).toBeGreaterThan(0);
  });

  it("★★ ⭐⭐ **飛行 → 落點是兩串班表**：沿途命中與終點範圍分開", () => {
    const travellers = ROWS.flatMap((r) =>
      r.nodes
        .filter((n) => typeof n["preset"] === "string" && LINE_TPL.has(String(n["preset"])) && (n["onTouch"] ?? n["onArrive"]))
        .map((n) => ({ id: r.id, n })),
    );
    expect(
      travellers.length,
      "⛔ 一個會飛的節點都沒量到 ⇒ ⭐ 這條斷言是**空的**（分母 0 的綠燈證明不了任何事）",
    ).toBeGreaterThan(0);
    const both = travellers.filter((t) => Array.isArray(t.n["onTouch"]) && Array.isArray(t.n["onArrive"]));
    expect(
      both.map((t) => t.id),
      "⛔⛔ 沒有任何一支同時有 `onTouch`（沿途）與 `onArrive`（落點）——\n" +
        "  ⭐ `tpl-line-blast` 檔頭逐字：「兩段是**兩串班表**而不是一串：合成一串的話，\n" +
        "    路上已經被掃到的人會被『一人一次』的過濾器擋在爆炸外面」。",
    ).not.toEqual([]);
    for (const t of both) {
      const terminal = walk(t.n["onArrive"]).map((x) => String(x["kind"]));
      const enroute = walk(t.n["onTouch"]).map((x) => String(x["kind"]));
      expect(
        terminal.some((k) => k === "damageArea"),
        `⛔ ${t.id} 的落點沒有範圍傷害 ⇒ ⭐「飛完全程後在落點炸開一個範圍」變成只有畫面沒有傷害`,
      ).toBe(true);
      expect(
        enroute.includes("damageArea"),
        `⛔ ${t.id} 把終點的範圍傷害也塞進了沿途班表 ⇒ ⭐ 兩段被合成一串（見上）`,
      ).toBe(false);
    }
  });

  it("★★ ⭐⭐ **光束行進距離 == 傷害線長度**（⛔ 兩個名詞的關係，不是各驗一半）", () => {
    let compared = 0;
    for (const r of ROWS) {
      const line = r.nodes.find((n) => n["kind"] === "damageLine");
      if (!line) continue;
      for (const n of r.nodes) {
        const preset = n["preset"];
        if (typeof preset !== "string" || !LINE_TPL.has(preset)) continue;
        const distance = (n["distance"] ?? TPL.get(preset)?.defaults["distance"]) as number | undefined;
        if (typeof distance !== "number") continue; // ⚠️ 該預設沒有 distance（例：locust-line）⇒ 這一格量不到,明說跳過
        compared += 1;
        expect(
          distance,
          `⛔⛔ ${r.id}：光束 \`${preset}\` 走 ${distance} 格，而傷害線 \`damageLine.length\` 是 ${String(line["length"])} 格。\n` +
            "  ⇒ ⭐ 玩家看到的光束與傷害真的落下的地方**不是同一段** —— ⛔ 這一格改一邊要改兩邊。",
        ).toBe(line["length"]);
      }
    }
    expect(
      compared,
      "⛔ 一組都沒有比到 ⇒ ⭐ 這條斷言變成空的（⛔ 分母 0 的綠燈與『沒有這條斷言』沒有差別）",
    ).toBeGreaterThan(0);
  });

  it("★★ ⭐⭐ **連鎖跳數與衰減：卡面的數字 == 出貨節點的那幾格**（第一·五守則）", () => {
    const chains = ROWS.filter((r) => r.kinds.includes("chainLightning"));
    expect(chains.length, "⛔ 本批應該有一支多起點連鎖 —— 量不到就是名冊或內容漂了").toBeGreaterThan(0);
    for (const r of chains) {
      const node = r.nodes.find((n) => n["kind"] === "chainLightning")!;
      const card = strip(String(r.doc["description"] ?? ""));
      // ⚠️ 卡面的數字有兩種寫法：阿拉伯（「最多20名」）與中文（「只剩前一次的**九**成」）
      const CJK = "零一二三四五六七八九";
      const num = (re: RegExp): number | null => {
        const m = re.exec(card);
        if (!m?.[1]) return null;
        return CJK.includes(m[1]) ? CJK.indexOf(m[1]) : Number(m[1]);
      };
      const burn = walk(node["onHitTargets"]).find((n) => n["kind"] === "spendMana");
      const perRank = ((burn?.["amount"] as Json | undefined)?.["perRank"] as number[] | undefined) ?? [];
      const pairs: [string, number | null, unknown][] = [
        ["maxSources（最多幾個起點）", num(/最多\s*(\d+)\s*名/), node["maxSources"]],
        ["jumps（一條鏈最多幾跳）", num(/最多打到\s*(\d+)\s*個/), node["jumps"]],
        ["decay（每跳剩幾成）", num(/只剩前一次的([\d零一二三四五六七八九])成/), Math.round(Number(node["decay"]) * 10)],
        ["spendMana（削去多少魔力）", num(/削去\s*(\d+)\s*點魔力/), perRank[0]],
      ];
      for (const [what, said, shipped] of pairs)
        expect(
          shipped,
          `⛔⛔ ${r.id} · ${what}：⭐ 卡面說 **${String(said)}**，而出貨節點是 **${String(shipped)}**。\n` +
            "  ⇒ ⭐ 卡面上出現了一句「說了但不會發生」的字（第一·五守則）——\n" +
            "     ⛔ 修法是改回去或改卡面，⛔ 不是把這條斷言拿掉。",
        ).toBe(said);
    }
  });

  it("★★ ⭐ **鏡像逐欄比較**：非裝飾欄逐位元組相同（共同規則 #13）", () => {
    const cosmetic = new Set(ROSTER.cosmeticKeys);
    for (const [a, b] of ROSTER.mirrorPairs) {
      const A = byId(a).doc;
      const B = byId(b).doc;
      const drift = [...new Set([...Object.keys(A), ...Object.keys(B)])]
        .filter((k) => !cosmetic.has(k))
        .filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
      expect(
        drift,
        `⛔⛔ 鏡像對 ${a} ↔ ${b} 在**非裝飾欄**上漂了：${drift.join(" / ")}\n` +
          "  ⇒ ⭐ 共同規則 #13：「任一版本修改時，Editor 必須顯示鏡像差異」——\n" +
          `     ⛔ 只有 ${[...cosmetic].join(" / ")} 允許不同（模型差異⛔ 不得改變傷害線、時間與光束尺寸）。`,
      ).toEqual([]);
    }
  });

  it("★★ ⭐⭐ **條件級距的推導,兩個方向各校準一次**(共同規則 #4,2026-09-03 改寫)", () => {
    // ⚠️⚠️ 這一條在此之前斷言 `withCondition === 0` —— ⭐ **一條永遠不會響的絆線**
    //   (失敗形態⑨):它等著有人「去把 `conditionTier` 填進 421 份檔」,
    //   ⛔ 而 #943 (`3bdb3f925`) 的標題逐字就是「正解是**推導**,⛔ 不是去填 235 份檔」
    //   ⇒ 它等的那件事**設計上永遠不會發生**,於是這一格恆綠而什麼都沒驗到。
    // ⇒ ⭐ 改成驗**推導本身**,而且兩個方向都走(⛔ 單邊校準過的尺不算自證過)。
    const nodes = ROWS.flatMap((r) => scalingNodes(r.doc).map((n) => ({ id: r.id, n })));
    const gated = nodes.filter((x) => scalingIsGated(x.n));
    const plain = nodes.filter((x) => !scalingIsGated(x.n));

    // ⭐ 量尺自證:兩邊都要有樣本,⛔ 否則下面兩條斷言有一條是在空集合上通過。
    // ⚠️ 刻意不寫死數字(那會是第二個住處):只要求**兩邊都不是 0**。
    expect(gated.length, "⛔ 沒有任何**帶條件**的節點 ⇒「有條件會被認出來」這一邊沒驗到").toBeGreaterThan(0);
    expect(plain.length, "⛔ 沒有任何**無條件**的節點 ⇒「無條件不會被誤判」這一邊沒驗到").toBeGreaterThan(0);

    // ① 已知**有**:帶 `when` / `condition` 的節點要推導成「不是無條件」那一格
    expect(
      gated.filter((x) => resolveConditionTier(x.n) === CONDITION_TIER_UNCONDITIONAL).map((x) => x.id),
      "⛔⛔ 一個**帶條件**的節點被推導成「無條件」⇒ ⭐ 卡面宣稱「這條很難吃到」而係數恆真(第一·五守則)",
    ).toEqual([]);
    // ② 已知**沒有**:不帶條件的節點⛔ 不可以被推導成有條件(否則它是一個對每支都喊的橡皮圖章)
    expect(
      plain.filter((x) => resolveConditionTier(x.n) !== CONDITION_TIER_UNCONDITIONAL).map((x) => x.id),
      "⛔⛔ 一個**無條件**的節點被推導成有條件 ⇒ ⭐ 這把尺對每個節點都喊,它證明不了任何事",
    ).toEqual([]);
  });
});
