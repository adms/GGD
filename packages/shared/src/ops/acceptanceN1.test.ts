/**
 * ⭐⭐ **46 份驗收 · 批1「位移與衝鋒」的承重治具**（GH#959）。
 *
 * ⭐ **一套治具跑 7 份**（⛔ 不是 7 條測試 —— 第零守則⑨：N 個同型 ＝ K 個模板 ＋ 一張表）。
 * 那張表住 `docs/_acceptance/ggd-acceptance-n1.json`，⭐ 而**判定是這裡算出來的**，
 * ⛔ 不是抄在那份 JSON 裡 —— 它只存「上一次量到的結論」，修好一支就會紅。
 *
 * ## ⭐ 它問的四題（票文逐字的共用驗證軸）
 *
 * | 軸 | 怎麼量 |
 * |---|---|
 * | 位移量真的發生 | 卡面宣稱衝鋒/瞬移 ⇒ 出貨 effect 樹裡真的有 `dash`/`blink`/`leap` |
 * | 傷害沿線 vs 只在終點 | `damageLine` 兄弟節點 ＝ 沿線；`onEnd`/`onArrive`/`onLand` 裡 ＝ 終點 |
 * | 位移距離與傷害線一致 | `dash.maxDistance` / `blink.distanceUnits` == `damageLine.length` |
 * | ⭐ 瞬移 vs 衝鋒 | ⛔ `blink` **不可以**兌現「衝刺/飛奔」—— 它沒有中間位置 |
 *
 * ## ⛔⛔ 為什麼「起點」是一個真的答案（⛔ 不是我編的第三個選項）
 *
 * `schema/effects/dash.ts` 的 `onEnd` 檔頭**自己量過**：
 * 「實測 `[dash, damageArea]` 寫在同一個 `effects[]` 裡，受害者掉血與**完全不放那個 AoE**
 * 逐字相同（43.47），而同一個 AoE 從終點放是 199.83」——
 * ⇒ ⭐ 位移在 slot 5、effect 在 slot 2b/3 ⇒ **兄弟節點是從起點放的**。
 * ⚠️ 而一條 `fromCaster + aim:"facing"` 且長度等於衝刺距離的 `damageLine`，
 * 從起點放**正好**覆蓋整條路徑 ⇒ ⭐ 那才是「沿線」。
 *
 * ## ⭐⭐ 兩個方向（CLAUDE.md：一把只驗過單邊的尺，⛔ 不算自證過）
 *
 * · 已知**有** —— `godie-edem.e` 量得到 dash＋沿線；`godie-u00v.r` 的 stun 兌現得到
 * · 已知**沒有** —— `godie-hvsh.r` 量不到任何位移；`godie-efur.e` 量不到 charge 宣稱
 *   （⭐ 它的**台詞**逐字是「其實還可以衝刺，但老了」而內文是「龍形**衝擊波**」，
 *    effects 只有一個 `damageArea` ⇒ 兩個誤報陷阱疊在同一支出貨技能上）
 *
 * ⛔ 四個校準點**全部是出貨資料**，⛔ 沒有一個是自造夾具（失敗形態⑤）。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）─────────────────────────────────────
 * M1 `satisfies()` 的 `charge` 從 `dash` 放寬成 `dash || blink`
 *    （＝票文警告的那個錯：拿瞬移充當衝鋒）
 *    → 🔴 ③「判定與契約不符：godie-u00v.r 契約說 不通過、量到 通過」
 * M2 出貨內容 `content/abilities/godie-edem.e.json` 的 `dash.maxDistance` 12.83 → 6
 * ⚠️⚠️ 上面提到的 `content/abilities/*.json` 是**產生器的產物**（`skillremake:json` ·
 * `castderive:build:raw` · `tiers:apply` …）—— ⭐ 這裡只把它們當成**突變標的**（改壞→驗紅→還原），
 * ⛔ 不是叫誰去手改它。真要改請先 `bash scripts/genguard.sh <路徑>`：
 * 產生器的產物 ⇒ 改**來源**（`tools/…`）再 `bash scripts/genrun.sh <step>`。
 * ⛔ 直接改出貨 JSON 會被下一次 sync 打回來，而那個「又紅了」看起來像**新的**錯。
 *    （`python3 scripts/edit-or-die.py`，⛔ 不是 `python3 -c replace`）
 *    → 🔴 ④「位移距離與傷害線長度對不上：godie-edem.e dash=6 vs damageLine=12.83」
 *    → 還原後逐位元組相同（`git diff --stat` 空）
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { aoeTiersFromDoc } from "../content/aoeTiers";
import { cooldownTiersFromDoc, resolveCooldownTier } from "../content/cooldownTiers";

const ROOT = join(__dirname, "../../../..");
const readJson = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as Record<string, unknown>;

const CONTRACT = readJson("docs/_acceptance/ggd-acceptance-n1.json") as unknown as {
  roster: { id: string; name: string; verdict: string; unmet: string[]; why: string }[];
  calibration: {
    knownPresent: { id: string; must: string }[];
    knownAbsent: { id: string; mustNot: string }[];
  };
};

/** 位移 primitive —— ⭐ 「角色的座標真的被改了」的那幾個 kind。 */
const DISPLACEMENT = new Set(["dash", "blink", "leap", "knockback", "pull"]);
/** ⭐ 位移**之後**才跑的鉤子 ⇒ 落在這裡面的傷害是**終點**傷害。 */
const TERMINAL_HOOKS = new Set(["onEnd", "onArrive", "onLand"]);
const DAMAGE_KINDS = new Set(["damage", "damageArea", "damageLine"]);

/**
 * ⭐ 剝掉角色對白（第〇·六守則細則②）。
 * ⚠️ 正則的**住處**是 `tools/skill-remake/common.py::_mechanics_text`；
 * 這裡是它的鏡像（⛔ 跨語言，共用不了；分岔的那天症狀是「某一支技能多出一個機制」）。
 * ⭐ 方括號是 owner 規格的**標記**（`[直線]`/`[衝刺]`）⇒ 一併拿掉，
 * ⛔ 否則「一[直線]」讀不出「一直線」。
 */
function mechanicsText(desc: unknown): string {
  return typeof desc === "string" ? desc.replace(/「[^」]*」/gs, "").replace(/[[\]]/g, "") : "";
}

/**
 * 卡面**宣稱**了什麼。
 * ⚠️ `衝擊(?!波)` 是量出來的：`godie-efur.e` 的內文是「龍形**衝擊波**包裹全身」，
 * 而它 effects 只有 `damageArea` ⇒ 一個裸的 `衝擊` 會把**名詞**讀成衝鋒。
 */
const CLAIM_PATTERNS: Readonly<Record<string, RegExp>> = {
  blink: /瞬間移動|瞬移|閃現/,
  charge: /衝刺|衝鋒|衝擊(?!波)|飛奔|突進/,
  alongPath: /沿途|沿線|一直線/,
  knockback: /擊退|擊飛|拋出|丟出/,
  drag: /抓回|拉近|抓取/,
  stun: /暈眩|昏迷|定身/,
};

interface Audit {
  primitives: string[];
  /** 「起點」/「沿線」/「終點」—— 傷害相對於位移落在哪一段。 */
  placements: string[];
  travel: { kind: string; units: number }[];
  lines: { length: number; width: number }[];
  statusIds: string[];
  dragToCaster: boolean;
  throwDistance: number;
  inlineStun: boolean;
}

/** 走**出貨的**那一份文件（⛔ 不是夾具），把四個軸量出來。 */
function audit(doc: Record<string, unknown>): Audit {
  const a: Audit = {
    primitives: [],
    placements: [],
    travel: [],
    lines: [],
    statusIds: [],
    dragToCaster: false,
    throwDistance: 0,
    inlineStun: false,
  };
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
  const walk = (node: unknown, inTerminalHook: boolean): void => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, inTerminalHook));
    if (node === null || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const kind = rec["kind"];
    if (typeof kind === "string" && DISPLACEMENT.has(kind)) {
      a.primitives.push(kind);
      const units = num(
        kind === "dash"
          ? rec["maxDistance"]
          : kind === "blink"
            ? rec["distanceUnits"]
            : kind === "leap"
              ? rec["throwDistance"]
              : rec["distance"],
      );
      if (units !== undefined) a.travel.push({ kind, units });
      if (kind === "leap") {
        if (rec["dragToCaster"] === true) a.dragToCaster = true;
        a.throwDistance = num(rec["throwDistance"]) ?? a.throwDistance;
      }
    }
    if (kind === "applyStatus") {
      if (typeof rec["statusId"] === "string") a.statusIds.push(rec["statusId"]);
      if (rec["stun"] === true) a.inlineStun = true;
    }
    if (typeof kind === "string" && DAMAGE_KINDS.has(kind)) {
      const len = num(rec["length"]);
      const wid = num(rec["width"]);
      if (kind === "damageLine" && len !== undefined && wid !== undefined) a.lines.push({ length: len, width: wid });
      a.placements.push(inTerminalHook ? "終點" : kind === "damageLine" ? "沿線" : "起點");
    }
    for (const [key, v] of Object.entries(rec)) walk(v, inTerminalHook || TERMINAL_HOOKS.has(key));
  };
  walk(doc["effects"], false);
  return a;
}

/** 帶 `stun` 標籤的狀態（⭐ 從出貨的 `content/status-effects/` 推導，⛔ 不抄名單）。 */
const STUN_STATUS_IDS: ReadonlySet<string> = new Set(
  readdirSync(join(ROOT, "content/status-effects"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => readJson(`content/status-effects/${f}`))
    .filter((s) => Array.isArray(s["tags"]) && (s["tags"] as string[]).includes("stun"))
    .map((s) => String(s["id"])),
);

/**
 * ⭐⭐ 這一條宣稱**兌現得了嗎** —— 本批的承重那一行。
 * ⚠️ `charge` 只認 `dash`：⛔ `blink` 沒有中間位置（`sim/effects/variants/blink.ts` 檔頭
 * 逐字說它刻意沒有 `arriveRadius`）⇒ 拿它充當「飛奔」正是票文點名的已知衝突。
 */
function satisfies(claim: string, a: Audit): boolean {
  switch (claim) {
    case "blink":
      return a.primitives.includes("blink");
    case "charge":
      return a.primitives.includes("dash");
    case "alongPath":
      return a.lines.length > 0 || a.primitives.includes("dash");
    case "knockback":
      return a.primitives.includes("knockback") || a.throwDistance > 0;
    case "drag":
      return a.primitives.includes("pull") || a.dragToCaster;
    case "stun":
      return a.inlineStun || a.statusIds.some((s) => STUN_STATUS_IDS.has(s));
    default:
      return false;
  }
}

function claimsOf(doc: Record<string, unknown>): string[] {
  const text = mechanicsText(doc["description"]);
  return Object.entries(CLAIM_PATTERNS)
    .filter(([, re]) => re.test(text))
    .map(([k]) => k);
}

/** 一份技能的完整判定（⭐ 算出來的，⛔ 不是查表）。 */
function verdictOf(id: string): { unmet: string[]; verdict: string; a: Audit } {
  const doc = readJson(`content/abilities/${id}.json`);
  const a = audit(doc);
  const unmet = claimsOf(doc).filter((c) => !satisfies(c, a));
  return { unmet, verdict: unmet.length === 0 ? "通過" : "不通過", a };
}

describe("46 份驗收 · 批1 位移與衝鋒（GH#959）", () => {
  it("★★ ⭐ 7 份**逐份**有判定，而且每一份指得到一份真的技能（⛔ 沒有一份空白）", () => {
    expect(CONTRACT.roster.length, "⛔ 本批是 7 份").toBe(7);
    const bad = CONTRACT.roster.filter(
      (r) => !r.verdict || (r.why ?? "").length < 20 || !["通過", "不通過", "阻塞於 #943"].includes(r.verdict),
    );
    expect(bad.map((r) => r.id), "⛔ 判定空白／沒有理由 ⇒ ⭐ 下一輪讀到時它就是一句繞得過去的散文").toEqual([]);
    for (const r of CONTRACT.roster) expect(() => readJson(`content/abilities/${r.id}.json`)).not.toThrow();
  });

  it("★★ ⭐⭐ **已知有的量得到**（⛔ 一把只驗過單邊的尺不算自證過）", () => {
    // ⭐ 45-03 千鳥 —— 本批唯一「衝刺＋沿途受傷」都真的存在的一支
    const chidori = verdictOf("godie-edem.e");
    expect(chidori.a.primitives, "⛔⛔ 量不到 `godie-edem.e` 的 dash ⇒ ⭐ 這把尺對**已知存在的衝鋒**是瞎的").toContain("dash");
    expect(chidori.a.placements, "⛔⛔ 量不到千鳥的**沿線**傷害 ⇒ 尺分不出「沿途」與「終點爆炸」").toContain("沿線");
    // ⭐ 78-04 的 `burnstun` 帶 `stun` 標籤 ⇒ stun 這一軸兌現得到
    const elbow = verdictOf("godie-u00v.r");
    expect(elbow.unmet, "⛔ `godie-u00v.r` 的暈眩兌現不到 ⇒ ⭐ 那 stun 這一軸永遠不會說「有」").not.toContain("stun");
    expect(STUN_STATUS_IDS.size, "⛔ 一個 `stun` 狀態都沒推導到 ⇒ 這一軸整條是死的").toBeGreaterThan(0);
  });

  it("★★ ⭐⭐ **已知沒有的量不到**（⛔ 效能/可見性這一族的缺陷都長成「沒生效」）", () => {
    // ⭐ 48-04：卡面說「衝擊前方」而 effect 樹零位移 —— 尺若把 spawnModelFx/template 誤讀成位移就會漏掉它
    const pegasus = verdictOf("godie-hvsh.r");
    expect(
      pegasus.a.primitives,
      "⛔⛔ `godie-hvsh.r` 量到了位移 —— ⭐ 它出貨的 effect 只有 3 個 spawnModelFx ＋ tpl-single-strike\n" +
        "  ⇒ 尺把「有東西在動」讀成了「角色在動」，⛔ 而這一批問的正是後者。",
    ).toEqual([]);
    expect(pegasus.unmet, "⛔ 48-04 的「衝擊前方」沒有被標紅 ⇒ 靜默通過 ＝ 不通過（票文 AC#3）").toContain("charge");
    // ⭐ 13-03：台詞「其實還可以衝刺，但老了」＋ 內文「龍形衝擊**波**」，而 effects 只有 damageArea
    const furyu = readJson("content/abilities/godie-efur.e.json");
    expect(
      claimsOf(furyu),
      "⛔⛔ `godie-efur.e` 被判成宣稱了位移 —— 兩個誤報源二選一：\n" +
        "  ① 台詞沒剝乾淨（第〇·六守則細則②：「」裡是對白，⛔ 不是效果）\n" +
        "  ② `衝擊` 正則吃到了**名詞**「衝擊波」⇒ 判準必須是 `衝擊(?!波)`",
    ).toEqual([]);
    expect(mechanicsText(furyu["description"]), "⛔ 剝台詞沒有真的發生").not.toContain("但老了");
  });

  it("★★ ⭐ 逐份判定與契約一致（⭐ 棘輪：修好一支就紅，⛔ 要人去改契約而不是無聲飄走）", () => {
    const drift: string[] = [];
    for (const r of CONTRACT.roster) {
      const v = verdictOf(r.id);
      if (v.verdict !== r.verdict || v.unmet.join(",") !== r.unmet.join(","))
        drift.push(
          `${r.id}（${r.name}）：契約說 ${r.verdict}[${r.unmet.join(",") || "-"}]、` +
            `量到 ${v.verdict}[${v.unmet.join(",") || "-"}]`,
        );
    }
    expect(
      drift,
      "⛔⛔ 判定漂了。⭐ **修好了**就把 `docs/_acceptance/ggd-acceptance-n1.json` 的那一列改掉\n" +
        "  （⛔ 不要改這條測試）；**變壞了**就是回歸，去看那一份的 effects。",
    ).toEqual([]);
  });

  it("★★ ⭐ 位移距離 == 傷害線長度，而走廊寬度 == 2 × 卡面半徑（⛔ 對不上＝兩個數字各自漂）", () => {
    const aoe = aoeTiersFromDoc(readJson("content/config/aoe-tiers.json"));
    const bad: string[] = [];
    for (const r of CONTRACT.roster) {
      const doc = readJson(`content/abilities/${r.id}.json`);
      const a = audit(doc);
      if (!a.travel.length || !a.lines.length) continue; // 只驗「兩者都在」的那幾支
      const t = a.travel.find((x) => x.kind !== "knockback");
      const line = a.lines[0];
      if (!t || !line) continue;
      if (Math.abs(t.units - line.length) > 0.01)
        bad.push(`${r.id}：位移 ${t.kind}=${t.units} vs 傷害線 length=${line.length} ⇒ 沿線傷害蓋不住路徑`);
      const tier = doc["radiusTier"];
      if (typeof tier === "string") {
        const radius = aoe.radius[tier as keyof typeof aoe.radius];
        if (typeof radius === "number" && Math.abs(line.width - radius * 2) > 0.01)
          bad.push(`${r.id}：走廊 width=${line.width} ≠ 2 × radiusTier(${tier})=${radius * 2} ⇒ 卡面半徑是謊話`);
      }
    }
    expect(bad, "⛔⛔ 位移與傷害線是**同一條路徑的兩個數字** —— 它們分開住就一定會漂").toEqual([]);
  });

  it("★ ⭐⭐ 共同規則 #5 的兩個「必測案例」今天**零落差**（⛔ 票文的前提已經死了）", () => {
    // ⚠️ 票文/#953 規則 B 逐字：nbbc.r 極大·**範圍** ⇒ 120s（陣列寫 60）、e00r.q 極小·範圍 ⇒ 30s（陣列寫 6）。
    // ⭐ 量到：兩份都帶顯式 `cooldownShape:"單體"`（`cooldownShapeOf` 第 1 條：手填的永遠贏）⇒ 落差 0。
    const tiers = cooldownTiersFromDoc(readJson("content/config/cooldown-tiers.json"));
    for (const id of ["godie-nbbc.r", "godie-e00r.q"]) {
      const doc = readJson(`content/abilities/${id}.json`);
      const authored = (doc["cooldown"] as number[])[0];
      const resolved = (resolveCooldownTier(doc, tiers)["cooldown"] as number[])[0];
      expect(
        resolved,
        `⛔⛔ ${id} 的解析冷卻 (${resolved}s) 與作者值 (${authored}s) 又分開了。\n` +
          "  ⭐ 這**不是壞消息** —— 它代表規則 B 的前提回來了：\n" +
          "  去把 `ggd-acceptance-n1.json` 的 correctedPremises 那一條改掉（⛔ 不要改這條測試）。\n" +
          `  ⚠️ 目前 ${id} 帶顯式 cooldownShape=${String(doc["cooldownShape"])}，` +
          "而 `godie-nbbc.r` 的那一格是 #838 自己的 lane 在 `62b259ce9` 加的。",
      ).toBe(authored);
    }
  });
});
