/**
 * AP 傷害加成的內容側落地器（owner 2026-08-21：「技能傷害都套用公式 (1+AP*1%)」）。
 *
 * ```bash
 * pnpm apdmg:build     # 重生成出貨文件 + Codex 契約文件
 * pnpm apdmg:check     # 唯讀，逐位元組比對；過期或漂了就非零離開
 * ```
 *
 * 產出（兩份，全部由這一支寫，⛔ 不可以手改）：
 *   · content/config/ap-damage-scaling.json          —— 出貨文件（三格 + 導出的說明）
 *   · docs/editor-contract/ap-damage-scaling.md      —— 外部編輯器 / Codex 讀的契約
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ 為什麼這一支存在（owner 2026-08-21，逐字）
 * ═══════════════════════════════════════════════════════════════════════════
 * > 「請記得**全部都要用 script 推導生成 JSON** 喔」
 * > 「**後台、script, JSON, 文件檔**⋯都要一起更新」
 *
 * ⇒ 三個住處（`content/config/` · Zod `DEFAULT_*`/`SHIPPED_*` · 後台）之間的
 * 一致性**不是**一條要記得的判準，是這一支的 `--check`。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `--check` 驗**三件事**，⛔ 不是只驗檔案新不新
 * ═══════════════════════════════════════════════════════════════════════════
 *  ① 兩份產物逐位元組等於現在重生成的結果。
 *  ② **三個住處說同一件事**：`DEFAULT_AP_DAMAGE_SCALING`（引擎讀的）
 *     ↔ `SHIPPED_AP_DAMAGE_SCALING`（Zod / 後台表單的出貨值）
 *     ↔ `content/config/ap-damage-scaling.json`（真的出貨的那一份）。
 *     ⚠️ 這是**兩個名詞的關係**，⛔ 不是三次「這個檔案存在嗎」——
 *     三份各自都合法，只有它們的組合會讓後台顯示的出貨值與遊戲跑的不一樣。
 *  ③ 契約文件裡「哪一種 origin 吃這一層」那張表，是真的呼叫出貨的
 *     `originInScope()` 算出來的，⛔ 不是我打上去的字。引擎改了謂詞就會紅。
 *
 * ⚠️ ⛔ 刻意**沒有產生日期**（同 `caps:export` / `spec:build` / `statcaps:build`）：
 * 任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬 ——
 * 而一條被放寬的閘等於沒有閘（GH#389 · #426）。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AP_DAMAGE_RATE_MAX,
  DEFAULT_AP_DAMAGE_SCALING,
  type ApDamageScope, apCurveMult } from "../../packages/shared/src/sim/combat/apDamageScaling";
import { originInScope } from "../../packages/shared/src/sim/combat/damageTypeOverride";
import { SHIPPED_AP_DAMAGE_SCALING } from "../../packages/shared/src/content/schema/config";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK = process.argv.includes("--check");

const RULES = DEFAULT_AP_DAMAGE_SCALING;
const PCT = (r: number) => `${+(r * 100).toFixed(4)}%`;

// ───────────────────────────────────────────────────────────────────────────
// ① 「哪一種 origin 吃這一層」—— 真的跑出貨的謂詞，⛔ 不是打上去的表
// ───────────────────────────────────────────────────────────────────────────
/**
 * 每一個字串都是 repo 裡**真的**被建構出來的 origin，各自附上建構點。
 * ⚠️ 加一種新的傷害來源而沒有加進這張表，只會讓文件少一列 —— ⛔ 不會靜默說謊，
 * 因為每一列的「吃不吃」都是算出來的。
 */
const ORIGIN_SAMPLES: readonly { origin: string; what: string; where: string }[] = [
  { origin: "ability:<id>", what: "瞬發技能", where: "abilities/abilitySystem.ts" },
  { origin: "ability:<id>", what: "吟唱技能（吟唱結束的那一 tick）", where: "systems/CastResolveSystem.ts" },
  { origin: "ability:<id>", what: "技能投射物命中（原封不動帶著發射者的 origin）", where: "systems/ProjectileSystem.ts" },
  { origin: "ability:<id>", what: "切換型技能的每一跳", where: "abilities/toggle.ts" },
  { origin: "ability:<id>", what: "代放（proxyCast）", where: "effects/proxyCast.ts" },
  { origin: "basic", what: "普通攻擊（近戰與遠程投射物都寫這個字串）", where: "systems/BasicAttackSystem.ts" },
  { origin: "hook:<sourceId>", what: "道具／增益卡的觸發傷害", where: "effects/hooks.ts" },
  { origin: "fireRing", what: "場地環境火焰", where: "sim/fireRing.ts · systems/FireRingSystem.ts" },
  { origin: "guardian", what: "守衛塔", where: "systems/GuardianSystem.ts" },
  { origin: "mob", what: "殭屍", where: "systems/MobSystem.ts" },
  { origin: "flower", what: "花圈", where: "systems/FlowerSystem.ts" },
  { origin: "lifesteal", what: "吸血回饋（不是一發傷害封包）", where: "combat/damage.ts" },
];

const SCOPES: readonly ApDamageScope[] = ["ability", "basic", "all"];

/** ⚠️ `ability:<id>` 是樣板，謂詞讀的是前綴 —— 餵一個真的 id 進去問。 */
const probe = (origin: string) => (origin === "ability:<id>" ? "ability:godie-h001.q" : origin);

// ───────────────────────────────────────────────────────────────────────────
// ② 「拿掉 ap 係數會怎樣」—— 從 content/abilities 真的數，⛔ 不是我記得的數字
// ───────────────────────────────────────────────────────────────────────────
const DAMAGE_KINDS = new Set(["damage", "damageArea", "damageLine", "dot", "chainLightning"]);
const SCALING_FIELDS = ["amount", "amountPerTick"] as const;

interface RatioCensus {
  /** 掃到的技能傷害 `Scaling` 節點總數。 */
  nodes: number;
  /** 其中帶 `ratios: [{stat:"ap"}]` 的。 */
  withAp: number;
  /** 那些節點裡，**拿掉 ap 之後完全沒有屬性相依**（＝變成純固定值）的。 */
  becomeFixed: number;
  /** ap 係數的分佈。 */
  minCoeff: number;
  maxCoeff: number;
  medianCoeff: number;
  /** 掃到的技能檔數（GUARD-THE-GUARD：0 就是掃錯路徑）。 */
  files: number;
}

function censusApRatios(): RatioCensus {
  const dir = join(REPO, "content/abilities");
  const out: RatioCensus = {
    nodes: 0,
    withAp: 0,
    becomeFixed: 0,
    minCoeff: 0,
    maxCoeff: 0,
    medianCoeff: 0,
    files: 0,
  };
  const coeffs: number[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (typeof obj["kind"] === "string" && DAMAGE_KINDS.has(obj["kind"])) {
      for (const f of SCALING_FIELDS) {
        const sc = obj[f];
        if (!sc || typeof sc !== "object" || Array.isArray(sc)) continue;
        const s = sc as { ratios?: { stat?: string; coeff?: number }[]; attrRatios?: unknown[] };
        out.nodes += 1;
        const ratios = s.ratios ?? [];
        const ap = ratios.filter((r) => r.stat === "ap");
        if (ap.length === 0) continue;
        out.withAp += 1;
        for (const r of ap) coeffs.push(r.coeff ?? 0);
        const others = ratios.filter((r) => r.stat !== "ap");
        if (others.length === 0 && (s.attrRatios ?? []).length === 0) out.becomeFixed += 1;
      }
    }
    for (const v of Object.values(obj)) visit(v);
  };
  const names = readdirSync(dir)
    .filter((n) => n.endsWith(".json") && !n.startsWith("_"))
    .sort();
  for (const n of names) {
    out.files += 1;
    visit(JSON.parse(readFileSync(join(dir, n), "utf8")));
  }
  // GUARD-THE-GUARD：掃到 0 份 = 路徑或過濾條件壞了，⛔ 不是「今天剛好沒有」。
  if (out.files < 100 || out.nodes < 50) {
    console.error(
      `[apdmg] ⛔ 語料掃壞了：${out.files} 份技能檔 / ${out.nodes} 個傷害節點 —— 路徑或過濾條件不對`,
    );
    process.exit(2);
  }
  coeffs.sort((a, b) => a - b);
  out.minCoeff = coeffs[0] ?? 0;
  out.maxCoeff = coeffs[coeffs.length - 1] ?? 0;
  out.medianCoeff = coeffs[Math.floor((coeffs.length - 1) / 2)] ?? 0;
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// ③ 產物
// ───────────────────────────────────────────────────────────────────────────
const CENSUS = censusApRatios();

/** AP → 乘數的梯子。⛔ 每一格都是 `1 + ap × rate` 算出來的。 */
// ⭐ GH#1029：梯子延伸到膝點之後（611 一件 · 1931 三件 · 3503 六件 · 31874 ＋千年積木）—— 三段式在那裡才看得出來。
const LADDER = [0, 25, 50, 100, 150, 200, 250, 300, 400, 500, 611, 1931, 3503, 31874];
const multAt = (ap: number) => +apCurveMult(ap, RULES).toFixed(4);

function configJson(): string {
  const doc = {
    id: "ap-damage-scaling",
    schema: "config.ap-damage-scaling@1",
    note:
      `AP 傷害加成（owner 2026-08-21：「技能傷害都套用公式 (1+AP*1%)⋯物理意義來說 就是 AP 變為原本傷害的額外加成」「=> 預設 0.5%」）。` +
      `⭐ 最終傷害 = 基礎傷害 × (1 + 法強 × ${RULES.rate})，出貨 ${PCT(RULES.rate)}/點 ⇒ 法強 100 → ×${multAt(100)}、法強 200 → ×${multAt(200)}。` +
      `⚠️ 這一格是調整「技能 vs 普攻」全域關係的唯一旋鈕，⛔ 不是某一支技能的數值 —— 動它等於同時動每一支技能。` +
      `⭐ rate 填 0 = 這一層整個不存在（乘數恆為 1），也就是一鍵 rollback。` +
      `⭐ GH#1029 三段式：法強 ≤ K(${RULES.apCurveK}) 逐位元等於直線；之後 1 + rate × [K + (K/p) × ((法強/K)^p − 1)]（p=${RULES.apCurveP}，邊際遞減、永不為 0）；乘數 ≤ 1+M（M=${RULES.apCurveMaxMult}）。p 填 1 = 回到直線。` +
      `⚠️ 反彈封包不吃這一層（它的三個讀數已經吃過攻擊者的乘數），與全域傷害倍率共用同一個旗標。` +
      `⛔ 這份文件由 tools/ap-damage-scaling/gen.ts 產生，不要手改 —— 跑 pnpm apdmg:build。`,
    rate: RULES.rate,
    scope: RULES.scope,
    apRatioMode: RULES.apRatioMode,
    // ⭐ GH#929 —— 從 `DEFAULT_AP_DAMAGE_SCALING` 同一顆值出來,⛔ 不是這裡再挑一次。
    resourcePctSkipsGlobalMult: RULES.resourcePctSkipsGlobalMult,
    apCurveK: RULES.apCurveK,
    apCurveP: RULES.apCurveP,
    apCurveMaxMult: RULES.apCurveMaxMult,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function contractMd(): string {
  const L: string[] = [];
  L.push("# AP 傷害加成 —— 引擎契約（`config.ap-damage-scaling@1`）");
  L.push("");
  L.push("> ⚙️ **這一份是產生出來的，⛔ 不要手改。**");
  L.push(">");
  L.push("> ```bash");
  L.push("> pnpm apdmg:build            # 重生成");
  L.push("> pnpm apdmg:check            # 唯讀：過期就回非零");
  L.push("> ```");
  L.push("");
  L.push("owner 2026-08-21（逐字）：");
  L.push("");
  L.push("> 「我有個更好的建議，就是**技能傷害都套用公式 (1+AP\\*1%)**");
  L.push(">  物理意義來說 就是 **AP 變為原本傷害的額外加成**，");
  L.push(">  例如 AP 37 => 額外 37% AP 傷害；AP 245 => 額外 245% AP 傷害」");
  L.push("> 「=> **預設 0.5%**」");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## ⭐ 公式");
  L.push("");
  L.push("```");
  L.push("最終傷害 = 基礎傷害 × (1 + 施法者法強 × 加成率)");
  L.push("```");
  L.push("");
  L.push("⛔⛔ **`加成率` 那一格刻意不在這份契約裡**（owner 2026-08-23 · 2026-08-31，兩次）：");
  L.push("> 「編輯器只編輯**原始資料**（五級距），**根本不需要知道**⋯避免雙重編輯」");
  // ⚠️⚠️ ⛔ **這裡刻意不印那個數字**（owner 2026-08-31 第三次指名,逐字:
  //   「**系統參數⋯不應該提到 那是我人工旋鈕**」)。
  // ⭐ 印出來它就有了第二個住處(第〇·四守則),⭐ 而第二個住處必然過期。
  // ⇒ 唯一的住處是 `content/config/ap-damage-scaling.json` 的 `rate`,
  //   ⭐ 而它只有 owner 調(閘:`content/config/owner-knobs.json` + `ownerKnobs.test.ts`)。
  L.push("> 「契約中**不應該考慮**⋯（那一格的值）」");
  L.push("");
  L.push("⚠️ ⭐ owner 2026-08-31 第三次指名同一件事，逐字：");
  L.push("> 「**系統參數⋯不應該提到 那是我人工旋鈕**」");
  L.push("");
  L.push("⇒ ⭐ **所以這份文件連引用他的話時都不印那個數字** —— ⛔ 印出來它就有了第二個住處");
  L.push("（第〇·四守則），⭐ 而第二個住處必然過期。唯一的住處是");
  L.push("`content/config/ap-damage-scaling.json` 的 `rate`，⭐ 而它只有 owner 調");
  L.push("（閘：`content/config/owner-knobs.json` ＋ `ownerKnobs.test.ts`）。");
  L.push("");
  L.push("⇒ ⭐ 編輯器要編的是**技能自己的資料**（級距、係數、目標）。");
  L.push("這一層是**全域的、owner 專屬的**，它在**每一發傷害之後**才乘上去 ——");
  L.push("⛔ 編輯器既不需要顯示它，也不可以把它算進任何預覽。");
  L.push("⚠️ ⭐ 把它寫進契約會造成**雙重編輯**：兩邊各有一份，而它們一定會漂開。");
  L.push("");
  L.push("| 格 | 型別／範圍（⭐ **這一欄才是契約**） | 意思 |");
  L.push("|---|---|---|");
  L.push(`| \`scope\` | **${RULES.scope}** | 哪一類傷害吃這一層（下表） |`);
  L.push(
    `| \`apRatioMode\` | **${RULES.apRatioMode}** | 與技能卡上既有的法強係數怎麼共存 |`,
  );
  L.push("");
  L.push("⭐ **`rate = 0` 是完整的一鍵 rollback** —— 乘數逐位元回到 1，也就是這一層出現之前的每一場比賽。");
  L.push("");
  L.push("### 法強 → 乘數（⛔ 每一格都是算出來的）");
  L.push("");
  L.push(`| 法強 | ${LADDER.map((a) => a).join(" | ")} |`);
  L.push(`|---|${LADDER.map(() => "---:").join("|")}|`);
  L.push(`| **乘數** | ${LADDER.map((a) => `×${multAt(a)}`).join(" | ")} |`);
  L.push("");
  L.push("---");
  L.push("");
  L.push("## ⭐ 哪一種傷害吃這一層");
  L.push("");
  L.push(
    "⛔ 這張表**不是打上去的** —— 每一格都是拿那個 origin 去問出貨的 `originInScope()`（`sim/combat/damageTypeOverride.ts`）算出來的。",
  );
  L.push("引擎改了那支謂詞，這份文件就會過期而 `--check` 會紅。");
  L.push("");
  L.push(`| origin | 是什麼 | 建構點 | ${SCOPES.map((s) => `\`${s}\``).join(" | ")} |`);
  L.push(`|---|---|---|${SCOPES.map(() => ":---:").join("|")}|`);
  for (const s of ORIGIN_SAMPLES) {
    const cells = SCOPES.map((sc) => (originInScope(probe(s.origin), sc) ? "✅" : "—"));
    L.push(`| \`${s.origin}\` | ${s.what} | \`${s.where}\` | ${cells.join(" | ")} |`);
  }
  L.push("");
  L.push(`⭐ 出貨 \`scope: "${RULES.scope}"\` ⇒ 上表 **\`${RULES.scope}\` 那一欄**就是今天真的會發生的事。`);
  L.push("");
  L.push("⚠️ **技能掛上去的持續傷害（DoT）也吃**，而且不需要第二條規則：");
  L.push("`DotInstance.origin` 原封不動抄施放它的那一次執行的 `ctx.origin`，所以一支技能種下的 DoT 每一跳都是 `ability:<id>`。");
  L.push("");
  L.push("⚠️ **反彈封包不吃**（不論 `scope` 填什麼）：一發反彈的量是「剛剛打中我的那一下」的百分比，");
  L.push("而那三個讀數已經吃過**攻擊者**的乘數 —— 反彈者再乘一次自己的，反彈比例就不等於卡面寫的百分比。");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## ⚠️ 給外部編輯器 / Codex：作者填的數字是**乘之前**的");
  L.push("");
  L.push("一支技能 JSON 裡的 `amount.flat` / `amount.perRank` / `amount.ratios` 全部是**基礎傷害**。");
  L.push("玩家看到的數字由**遊戲主程式在執行期產生**（這一層只是其中一道）。");
  L.push("⛔ **不要**把這一層預先算進卡面的數字裡 —— 那會讓它被乘兩次，而且 owner 調 `rate` 時那一支不會跟著動。");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## ⭐ `apRatioMode` —— 量出來的（⛔ 不是估的）");
  L.push("");
  L.push(`語料：\`content/abilities/*.json\` **${CENSUS.files} 份**，掃到 **${CENSUS.nodes}** 個技能傷害 \`Scaling\` 節點。`);
  L.push("");
  L.push("| | 數量 | 佔傷害節點 |");
  L.push("|---|---:|---:|");
  L.push(
    `| 帶法強係數（\`ratios:{stat:"ap"}\`） | **${CENSUS.withAp}** | ${((CENSUS.withAp / CENSUS.nodes) * 100).toFixed(1)}% |`,
  );
  L.push(
    `| 其中：拿掉係數之後**完全沒有屬性相依**（＝變成純固定值） | **${CENSUS.becomeFixed}** | ${((CENSUS.becomeFixed / CENSUS.nodes) * 100).toFixed(1)}% |`,
  );
  L.push("");
  L.push(
    `法強係數的分佈：最小 **${CENSUS.minCoeff}** · 中位 **${CENSUS.medianCoeff}** · 最大 **${CENSUS.maxCoeff}**。`,
  );
  L.push("");
  L.push(`⇒ 出貨 \`apRatioMode: "${RULES.apRatioMode}"\`。理由是上面那兩列：`);
  L.push(
    `切成 \`"replace"\` 會讓那 ${CENSUS.becomeFixed} 個節點變成**與任何屬性都無關的常數**，`,
  );
  L.push(
    `而係數今天橫跨 ${CENSUS.minCoeff}〜${CENSUS.maxCoeff}（${(CENSUS.maxCoeff / (CENSUS.minCoeff || 1)).toFixed(0)} 倍）—— 也就是「特別吃法強的大招」與「幾乎不吃的小招」會被壓成同一支。`,
  );
  L.push("`\"replace\"` 存在是為了**回頭**，⛔ 不是為了觀望。");
  L.push("");
  return `${L.join("\n")}\n`;
}

// ───────────────────────────────────────────────────────────────────────────
// ④ 三個住處說同一件事（②）—— **兩個名詞的關係**，⛔ 不是三次「檔案在嗎」
// ───────────────────────────────────────────────────────────────────────────
function assertThreeHomesAgree(): string[] {
  const bad: string[] = [];
  for (const k of ["rate", "scope", "apRatioMode"] as const) {
    if (SHIPPED_AP_DAMAGE_SCALING[k] !== RULES[k]) {
      bad.push(
        `Zod SHIPPED_AP_DAMAGE_SCALING.${k} = ${JSON.stringify(SHIPPED_AP_DAMAGE_SCALING[k])} ` +
          `≠ 引擎 DEFAULT_AP_DAMAGE_SCALING.${k} = ${JSON.stringify(RULES[k])} ` +
          `—— 後台顯示的出貨值與遊戲真的跑的不一樣`,
      );
    }
  }
  return bad;
}

const OUTPUTS: readonly { path: string; body: string }[] = [
  { path: "content/config/ap-damage-scaling.json", body: configJson() },
  { path: "docs/editor-contract/ap-damage-scaling.md", body: contractMd() },
];

const drift = assertThreeHomesAgree();
if (drift.length > 0) {
  for (const d of drift) console.error(`[apdmg] ⛔ 三個住處不一致：${d}`);
  process.exit(1);
}

if (CHECK) {
  let stale = 0;
  for (const o of OUTPUTS) {
    const p = join(REPO, o.path);
    const cur = existsSync(p) ? readFileSync(p, "utf8") : null;
    if (cur !== o.body) {
      console.error(`[apdmg] ⛔ 過期：${o.path}（跑 pnpm apdmg:build 然後 git add）`);
      stale += 1;
    }
  }
  if (stale > 0) process.exit(1);
  console.log(`[apdmg] ✅ ${OUTPUTS.length} 份產物都是最新的；三個住處一致`);
} else {
  for (const o of OUTPUTS) {
    const p = join(REPO, o.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, o.body, "utf8");
    console.log(`[apdmg] 寫入 ${o.path}`);
  }
}
