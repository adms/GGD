/**
 * 🗡️ 寶具三選一（/__live/treasures）—— 武器輪抽 + 聖杯願望輪抽的組合對照。
 *
 * 兩張「三選一」其實是兩條不同的管線，這一份把兩邊都攤開：
 *   · 武器側：content/loot-tables/*.json 的池（哪幾件、權重）×
 *     config.arena-rules@1 的 weaponTiers / rounds（哪一回合、多少 %、限幾件）×
 *     content/items/*.json 的現值（cost）× 寶具總表_EX三階.csv 的翻盤力（產生器產物）。
 *   · 聖杯側：content/augments/grail-*.json（60 張願望：tier / weight / selectionSlot /
 *     eligibility）× grailDraft 規則 × tools/grail-wishes CSV 的顯示名（級・第幾願望）。
 *
 * ⭐ 第〇·四守則：一切引用出貨 JSON／產生器產物，⛔ 不重算公式。
 *   「佔比」只是滿池權重的除法（給人看密度用），實際機率還要過
 *   eligibility / 白名單 / 已擁有 / 顯現位置多樣性（sim/economy/draft.ts）——
 *   這裡刻意不模擬那條鏈。
 * build() 不寫任何檔；儲存走共用寫入端（見下面的 `write` 宣告，GH#821／#831）。
 * CSV 解析 spawn python3（多行引號欄位，⛔ 不自己手刻 parser）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 出貨 schema／常數的住處 —— ⛔ 不抄它們的值，每一次都**現讀**（skill90.mjs `shippedBound` 同一招）。 */
const SRC_BANDS = "packages/shared/src/content/schema/common.ts";
const SRC_STATS = "packages/shared/src/sim/stats/statTypes.ts";
const SRC_OUTPUT_AXES = "packages/shared/src/sim/stats/outputMult.ts";
const CFG_STAT_CAPS = "content/config/stat-caps.json";
const CFG_MS_TIERS = "content/config/move-speed-tiers.json";
const SRC_TIER_NAMES = "packages/shared/src/content/skillTiers.ts";

export const deps = [
  "content/config/arena-rules.json",
  "content/loot-tables",
  "content/loot-tables/_index.json",
  "content/items",
  "content/items/_index.json",
  "content/augments",
  "content/augments/_index.json",
  "寶具總表_EX三階.csv",
  "tools/grail-wishes/ggd_sacred_grail_wishes_v1.csv",
  // ⭐ GH#831 —— 可編輯帶是從這幾份**推導**的，所以它們一動這一頁就要重算。
  CFG_STAT_CAPS,
  CFG_MS_TIERS,
  SRC_BANDS,
  SRC_STATS,
  SRC_OUTPUT_AXES,
  SRC_TIER_NAMES,
];

/** python3 -c：兩份 CSV → 一包 JSON（utf-8-sig 吃掉 BOM；csv 模組處理多行引號欄）。 */
const PY_DUMP = `
import csv, json, sys
out = {}
for key, path in (("treasure", sys.argv[1]), ("wishes", sys.argv[2])):
    try:
        with open(path, encoding="utf-8-sig", newline="") as f:
            out[key] = list(csv.DictReader(f))
    except Exception as e:
        out[key + "_error"] = str(e)
print(json.dumps(out, ensure_ascii=False))
`;

const TIER_ZH = { silver: "白銀", gold: "黃金", prismatic: "稜彩" };
/** 池的呈現順序照賽程：基礎 EX（第 2/5 回合）→ EX解放 → EX∅ 根源。 */
const TABLE_ORDER = ["legendary-weapons", "ex-release-weapons", "ex-origin-weapons"];

/* ─────────────────────────────────────────────────────────────────────────────
 * ⭐ GH#831 —— 寶具**本體**的可編輯帶：每一個界都引用得到出處，⛔ 零個我挑的數字
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ⛔ **這一族的界寫不進 `write.rules[].value` 的 `{min,max}`，而那不是偷懶。**
 * `refineItemModifierBand`（`schema/common.ts`）的界是 **`stat` 與 `op` 的函數**：
 *   · `maxHealth flat` ±2500 · `maxHitPctMaxHp flat` ±0.5 · `pctAdd`/`pctMult` 一律 ±3
 *   · `capRaise` **根本不看那張表**（單位是「抬到多少」，硬閘是 stat-caps 的 `unlocked`）
 * ⇒ 在宣告裡寫**任何一個常數**都會是 GH#830 那個缺陷換一件衣服：
 *   寬到存得下 `maxHealth 1200` 的界 ⇒ `critChance` 也存得下 1200 而內容驗證**整份**拒收；
 *   窄到 `critChance` 安全的界（±0.5）⇒ 連現有的 `ad flat 128` 都**存不回去**。
 * ⇒ 界改由 {@link modifierBand} **逐格從出貨的東西推導**，在 `check` 裡強制執行，
 *   而 `build()` 把同一支函式的結果送上頁面（⭐ 頁上看到的帶與擋你的帶是**同一份**）。
 * ⚠️ 讀不到出處就 **拒絕存** —— ⛔ 不是放行：讀不到界等於沒有界。
 *
 * ⚠️ 第一·五守則：一條在出貨設定下**不可能改變任何數字**的 modifier，
 *   開放編輯只是製造謊話。判準逐字抄自 `noOpModifierClaims.test.ts` 的兩條
 *   （⛔ 不抄它的**名單**，抄它的**推導**）：
 *     ① `capRaise`/`capRaisePct` 指向 `unlocked === base` 的屬性
 *     ② `pctMult` 掛在加成型（base 0）屬性上 —— `0 × 任何東西 = 0`
 *   ⇒ 這兩種在頁上是**沒有 ✏️ 的一行灰字**，⛔ 不是一顆按下去會 400 的按鈕。
 */

/**
 * 🔁 **rollback 開關**（owner 常設：「自己判斷 **但留後台開關可以簡易 rollback**」）。
 * `GGD_TREASURE_ITEM_EDIT=0` ⇒ `content/items` 那三條退回**唯讀**（loot table 的權重不受影響）。
 * ⚠️ **每次請求讀**（⛔ 不是 module load 時鎖死），所以改完重啟 dev server 就生效。
 * ⚠️ 慣例跟著**同一個模組既有的**環境開關走（`GGD_LIVE_CACHE` / `GGD_LIVE_FRESHNESS_BAR`）——
 * ⛔ 不開一份 `content/config/*.json`：那會逼著改 `apps/admin/src/store.ts` 與 `ui/App.tsx`
 * 各一行，而那兩個檔是 CLAUDE.md 逐字點名的「已知唯一真正共用的檔」。
 */
function itemEditOff(env = process.env) {
  return env.GGD_TREASURE_ITEM_EDIT === "0";
}
const ITEM_EDIT_OFF_WHY =
  "🔁 GGD_TREASURE_ITEM_EDIT=0 —— 寶具本體（modifier／級別／現值）那幾格被 rollback 開關關成唯讀。";

/** `\n};` 之前的那一塊（⛔ 非貪婪：常數檔裡後面還有別的物件字面值）。 */
function block(src, decl) {
  const m = new RegExp(`export const ${decl}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(src);
  return m ? m[1] : null;
}
function constNum(src, name) {
  const m = new RegExp(`export const ${name} = (-?[0-9]+(?:\\.[0-9]+)?);`).exec(src);
  return m ? Number(m[1]) : null;
}

/**
 * 出貨的三張表，**現讀現解**：
 *   · `ITEM_MODIFIER_LIMITS` / `ITEM_PERCENT_LIMIT` / `CAP_RAISE_PCT_*`（schema/common.ts）
 *   · `Stat` 列舉（`[Stat.MaxHealth]` → `"maxHealth"`）
 *   · `OutputAxis`（加成型那三條 —— ⛔ 不在這裡打三個字串）
 * 任何一段解不出來 ⇒ 回 `null`，呼叫端**大聲**失敗。
 */
function shippedItemBands(repoRoot) {
  try {
    const common = readFileSync(join(repoRoot, SRC_BANDS), "utf8");
    const statsSrc = readFileSync(join(repoRoot, SRC_STATS), "utf8");
    const enumBody = /export enum Stat \{([\s\S]*?)\n\}/.exec(statsSrc);
    if (enumBody === null) return null;
    const member = new Map(); // "MaxHealth" → "maxHealth"
    for (const m of enumBody[1].matchAll(/^\s*(\w+)\s*=\s*"([^"]+)"/gm)) member.set(m[1], m[2]);
    const limitsBody = block(common, "ITEM_MODIFIER_LIMITS");
    if (limitsBody === null || member.size === 0) return null;
    const perStat = new Map();
    for (const m of limitsBody.matchAll(/\[Stat\.(\w+)\]:\s*(-?[0-9.]+)/g)) {
      const stat = member.get(m[1]);
      if (stat === undefined) return null; // 名字對不上 ⇒ 停（⛔ 不猜）
      perStat.set(stat, Number(m[2]));
    }
    // 加成型（base 0）那一族 —— `OutputAxis` 是出貨的那份清單，多開一條它自動跟上。
    const axes = /export type OutputAxis =([^;]+);/.exec(
      readFileSync(join(repoRoot, SRC_OUTPUT_AXES), "utf8"),
    );
    if (axes === null) return null;
    const addend = new Set();
    for (const m of axes[1].matchAll(/Stat\.(\w+)/g)) {
      const stat = member.get(m[1]);
      if (stat === undefined) return null;
      addend.add(stat);
    }
    const percent = constNum(common, "ITEM_PERCENT_LIMIT");
    const capPctMin = constNum(common, "CAP_RAISE_PCT_MIN");
    const capPctMax = constNum(common, "CAP_RAISE_PCT_MAX");
    if (perStat.size === 0 || addend.size === 0 || percent === null || capPctMin === null || capPctMax === null)
      return null;
    return { perStat, addend, percent, capPctMin, capPctMax };
  } catch {
    return null;
  }
}

/** `config.stat-caps@1` → `stat → {base, unlocked}`（⛔ 不抄字面值，這是 owner 的旋鈕）。 */
function statCapTable(repoRoot) {
  try {
    const caps = JSON.parse(readFileSync(join(repoRoot, CFG_STAT_CAPS), "utf8")).caps;
    const out = new Map();
    for (const [stat, c] of Object.entries(caps ?? {}))
      if (Number.isFinite(c?.base) && Number.isFinite(c?.unlocked)) out.set(stat, c);
    return out.size > 0 ? out : null;
  } catch {
    return null;
  }
}

const ITEM_FILE_RE = /^content\/items\/([^/]+)\.json$/;
/** 逐格帶（含「這一格是死的」）—— `build()` 與 `check()` **共用這一支**。 */
function modifierBand(mod, bands, caps) {
  const stat = mod?.stat;
  const op = mod?.op;
  if (typeof stat !== "string" || typeof op !== "string") return { error: "這個節點沒有 stat/op —— 它不是一條 modifier" };
  if (op === "capRaise" || op === "capRaisePct") {
    const c = caps.get(stat);
    if (c === undefined || !(c.unlocked > c.base))
      return {
        dead:
          `「${stat}」在 config.stat-caps@1 裡 unlocked === base（沒有解鎖空間）` +
          `→ effectiveCap 會把它夾回去，這條 modifier 逐位元等於不存在`,
      };
    if (op === "capRaise")
      return {
        // ⚠️ 下界是**開區間**：`effectiveCap` 是 `raised > base ? raised : base`，
        //   所以「抬到 ≤ 一般上限」逐位元等於沒抬（第一·五守則的卡面謊話）。
        min: c.base,
        minExclusive: true,
        max: c.unlocked,
        why: `抬到多少（⛔ 不是加多少）：> 一般上限 ${c.base}、≤ 解鎖上限 ${c.unlocked}（config.stat-caps@1）`,
      };
    // `lifted = base × (1 + value)` 再與 unlocked 取小（statPipeline.ts:238）⇒ 天花板是解鎖/一般 − 1。
    const roomPct = c.unlocked / c.base - 1;
    return {
      min: bands.capPctMin,
      max: Math.min(bands.capPctMax, roomPct),
      why:
        `比一般上限多幾成：schema ${bands.capPctMin}~${bands.capPctMax}，` +
        `而 ${stat} 的解鎖空間只到 +${(roomPct * 100).toFixed(2)}%（${c.base}→${c.unlocked}），取小的那個`,
    };
  }
  if (op === "pctMult" && bands.addend.has(stat))
    return {
      dead:
        `「${stat}」是**加成型**（base 0），而管線是 (base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult) ` +
        `→ 0×任何東西=0。只有 flat 動得了它`,
    };
  if (op === "pctAdd" || op === "pctMult")
    return { min: -bands.percent, max: bands.percent, why: `ITEM_PERCENT_LIMIT ±${bands.percent}（百分比 op 共用一條帶）` };
  if (op === "flat" || op === "percentOf" || op === "override") {
    const lim = bands.perStat.get(stat);
    if (lim === undefined) return { error: `ITEM_MODIFIER_LIMITS 裡沒有「${stat}」這一列 —— 這一格的界讀不到，⛔ 不給存` };
    return { min: -lim, max: lim, why: `ITEM_MODIFIER_LIMITS.${stat} ±${lim}` };
  }
  return { error: `op「${op}」這條檢查沒學過 —— ⛔ 不給存（猜錯的那一邊是內容驗證整份失敗）` };
}

/** `/modifiers/<i>/<欄位>` → i；⛔ 其餘一律 null（pointer 樣式已經由 middleware 比過，這裡是第二道）。 */
function modifierIndex(pointer, field) {
  const m = new RegExp(`^/modifiers/(\\d+)/${field}$`).exec(pointer);
  return m === null ? null : Number(m[1]);
}

/** 讀出目標那一條 modifier；回字串＝錯誤訊息。 */
function readModifier(repoRoot, path, index) {
  if (!ITEM_FILE_RE.test(path)) return `${path} 不是一份 content/items 文件`;
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
  } catch (err) {
    return `讀不了 ${path}：${String(err)}`;
  }
  const mod = (doc.modifiers ?? [])[index];
  if (mod === undefined || mod === null || typeof mod !== "object")
    return `${path} 的 /modifiers/${index} 不存在（這個端點只改既有的節點，⛔ 不長新的一條）`;
  return mod;
}

/** 兩張表都讀得到才回 `{bands, caps}`；否則回一句**指名出處**的拒絕理由。 */
function loadBands(repoRoot) {
  const bands = shippedItemBands(repoRoot);
  const caps = statCapTable(repoRoot);
  if (bands === null)
    return `讀不到出貨的量級帶（${SRC_BANDS} 的 ITEM_MODIFIER_LIMITS／ITEM_PERCENT_LIMIT／CAP_RAISE_PCT_*、${SRC_STATS} 的 Stat、${SRC_OUTPUT_AXES} 的 OutputAxis）—— ⛔ 讀不到界就是沒有界，這一格不給存。`;
  if (caps === null) return `讀不到 ${CFG_STAT_CAPS} 的 caps —— capRaise 那一族的天花板無從判斷，這一格不給存。`;
  return { bands, caps };
}

// ✏️ `/modifiers/<第幾條>/value` —— 帶逐格推導，⛔ 不是一個常數。
// ⚠️ 這幾行是 `//` 註解：pointer 樣式含 `*` 加 `/`，寫進區塊註解會**提早關掉它**
//    （middleware.mjs 的 `pointerHit` 上面逐字踩過同一個坑）。
/**
 * 這一次改值，會不會讓**卡面**（`description`）變成謊話？（GH#831）
 *
 * ⭐ 判準：卡面裡**印著舊值的字面數字**、而它**不是佔位**（`{{...}}`）⇒ 會說謊 ⇒ 擋。
 * ⛔ 不比對整句文案（那要一套文案解析器）—— 只問「舊的那個數字還在不在句子裡」。
 * ⚠️ 誠實的界線：卡面用別的寫法（換算過、四捨五入）表達同一個值時它看不出來
 *   —— ⭐ 那種情況 `legendaryClaims.test.ts` 才是最終裁判，這裡只擋**看得出來**的。
 */
function descriptionWouldLie(repoRoot, path, mod, next) {
  let desc;
  try {
    desc = JSON.parse(readFileSync(join(repoRoot, path), "utf8")).description;
  } catch {
    return null;
  }
  if (typeof desc !== "string" || desc === "") return null;
  const old = mod.value;
  if (typeof old !== "number" || old === next) return null;
  // 佔位寫的卡面會自己跟著走（`prose:build` / `apply_placeholders.ts`）⇒ 放行。
  if (/\{\{[^}]+\}\}/.test(desc)) return null;
  const shown = [String(old), String(Math.round(old)), String(Math.round(old * 100))];
  const hit = shown.find((t) => t.length >= 2 && new RegExp(`(^|[^\\d.])${t}([^\\d.]|$)`).test(desc));
  if (hit === undefined) return null;
  return (
    `⛔ 這一格有**第二個住處**：同一份文件的卡面 \`description\` 印著「${hit}」。\n` +
    `  改成 ${next} 只動 modifier 這一半 ⇒ ⭐ **卡面當場變成謊話**（第一·五守則），\n` +
    `  而 legendaryClaims 這條出貨閘會紅。\n` +
    `  ⭐ 這一格要與卡面一起改 —— 本端點改不到那一半（改法：把卡面改成佔位 {{...}}，或兩邊一起改）。`
  );
}

function itemModifierValueCheck(repoRoot, { path, pointer, value }) {
  if (itemEditOff()) return ITEM_EDIT_OFF_WHY;
  const i = modifierIndex(pointer, "value");
  if (i === null) return `pointer 要長成 /modifiers/<第幾條>/value（收到 ${pointer}）`;
  const mod = readModifier(repoRoot, path, i);
  if (typeof mod === "string") return mod;
  if (mod.msBonusTier !== undefined)
    return (
      `這一條帶著 msBonusTier「${mod.msBonusTier}」—— 第〇·四守則的 exclusive 模型下它**沒有 value**，` +
      `值在載入時由 resolveMsBonusTier() 從 config.move-speed-tiers@1 解析。⇒ 要改量級請改**級別**那一格。`
    );
  const loaded = loadBands(repoRoot);
  if (typeof loaded === "string") return loaded;
  const band = modifierBand(mod, loaded.bands, loaded.caps);
  if (band.error !== undefined) return band.error;
  if (band.dead !== undefined)
    return `⛔ 這一條 modifier 在出貨設定下不可能改變任何數字（第一·五守則）：${band.dead}。⇒ 改值沒有用，要換一個做得到的機制。`;
  if (value === 0)
    return "0 是一條看起來有設、什麼都不做的 modifier（第一·五守則）—— 要移除它請刪掉那個節點，⛔ 不是填 0。";
  const lo = band.minExclusive === true ? `>${band.min}` : `${band.min}`;
  if (band.minExclusive === true ? !(value > band.min) : value < band.min)
    return `低於下界（要 ${lo}，收到 ${value}）：${band.why}`;
  if (value > band.max) return `高於上界（要 ≤${band.max}，收到 ${value}）：${band.why}`;
  // ⭐ **第二個住處：玩家抽卡時讀的卡面**（GH#831，2026-08-29 對抗性複驗抓到）。
  //
  // ⚠️ 量到的：91 格可編輯的 value 裡 **86 格**把自己的值印在**同一份文件**的
  //   `description` 裡（例 `godie-i06d` 的「攻擊力+128」↔ `modifiers[0]={ad,flat,128}`），
  //   第三個住處是 `寶具總表_EX三階.csv` 的「效能（卡面逐行）」欄。
  //   ⇒ ⛔ 只改 modifier ⇒ **卡面當場變成謊話**（第一·五守則），
  //   而且 `legendaryClaims.test.ts` 這條今天綠的出貨閘會紅。
  //
  // ⭐ 這條路改不到卡面（description 不在本 dataset 的 pointers 裡）
  //   ⇒ **擋下來並指名**，⛔ 不是偷偷改文案（第〇·六守則）。
  //   ⚠️ 用**佔位**（`{{...}}`）寫的卡面會自己跟著走 ⇒ 放行。
  const stale = descriptionWouldLie(repoRoot, path, mod, value);
  if (stale !== null) return stale;
  return null;
}

// ✏️ `/modifiers/<第幾條>/msBonusTier` —— 級別名兩邊要**對得上**（config × 出貨常數）。
function itemMsTierCheck(repoRoot, { path, pointer, value }) {
  if (itemEditOff()) return ITEM_EDIT_OFF_WHY;
  const i = modifierIndex(pointer, "msBonusTier");
  if (i === null) return `pointer 要長成 /modifiers/<第幾條>/msBonusTier（收到 ${pointer}）`;
  const mod = readModifier(repoRoot, path, i);
  if (typeof mod === "string") return mod;
  if (mod.value !== undefined)
    return `這一條有 value=${mod.value} —— 級別與算好的值不可以同時存在（第〇·四守則，refineMsBonusTier 會拒收整份文件）。`;
  // refineMsBonusTier：只對 stat=ms、op=pctAdd/pctMult 合法。
  if (mod.stat !== "ms" || (mod.op !== "pctAdd" && mod.op !== "pctMult"))
    return `msBonusTier 只對 stat=ms、op=pctAdd/pctMult 合法（這一條是 ${mod.stat} ${mod.op}）。`;
  const names = tierNames(repoRoot);
  if (typeof names === "string") return names;
  if (!names.includes(value)) return `級別要是 ${names.join("／")} 之一（收到「${value}」）。`;
  return null;
}

/**
 * 五個級別名 —— **兩個住處要對得上**（`config.move-speed-tiers@1` 的 `bonus` 鍵
 * × `skillTiers.ts` 的 `SKILL_TIER_NAMES`）。對不上就**不給存**並指名兩邊，
 * ⛔ 不是挑一邊 —— 那正是「同步之後兩邊一致，而兩邊一起是錯的」。
 */
function tierNames(repoRoot) {
  let fromConfig;
  let fromSrc;
  try {
    fromConfig = Object.keys(JSON.parse(readFileSync(join(repoRoot, CFG_MS_TIERS), "utf8")).bonus ?? {});
    const m = /export const SKILL_TIER_NAMES = \[([^\]]*)\]/.exec(readFileSync(join(repoRoot, SRC_TIER_NAMES), "utf8"));
    fromSrc = m === null ? [] : [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  } catch (err) {
    return `讀不到級別名（${CFG_MS_TIERS} / ${SRC_TIER_NAMES}）：${String(err)}`;
  }
  if (fromConfig.length === 0 || fromSrc.length === 0)
    return `級別名讀出來是空的（${CFG_MS_TIERS} 的 bonus=${fromConfig.length} 格、${SRC_TIER_NAMES} 的 SKILL_TIER_NAMES=${fromSrc.length} 格）—— ⛔ 不給存。`;
  if (fromConfig.join("|") !== fromSrc.join("|"))
    return `級別名兩邊對不上：${CFG_MS_TIERS} 是 ${fromConfig.join("／")}，${SRC_TIER_NAMES} 是 ${fromSrc.join("／")} —— 先讓它們一致再存。`;
  return fromSrc;
}

/**
 * ⭐ GH#821／#831 寫入宣告 —— POST /__live/treasures/save。
 * loot table 與 content/items 都是手編檔（genguard ✓；寫入端每次寫前仍會再問它，
 * 所以 `content/items/_index.json`（skillremake:json 的產物）走到這裡是 **409**）。
 * pointer 用**檔案裡的原始索引**（rows 的 srcIndex / modifiers 的 index），
 * ⛔ 不是頁面排序後的位置。
 */
export const write = {
  kind: "source",
  rules: [
    {
      paths: ["content/loot-tables/*.json"],
      pointers: ["/entries/*/weight"],
        // ⚠️ 下界是**大於 0**：出貨 schema 是 `z.number().positive()`（`lootTable.ts:27`）。
        //   ⛔ 這裡曾寫 `min: 0` —— 存 0 進去，內容驗證會拒收**整份**文件。
        //   閘：`packages/shared/src/ops/liveWriteBoundsMatchSchema.test.ts`（GH#830）。
      value: { type: "number", min: 0.0001, max: 1000 },
      why: "獎池逐件權重（sharePct 由它推導）",
    },
    {
      paths: ["content/items/*.json"],
      pointers: ["/modifiers/*/value"],
        // ⛔ **刻意沒有 min/max** —— 界是 stat×op 的函數，理由寫在上面那一整段。
        //   真正的界由 `itemModifierValueCheck` 逐格從出貨的東西推導並強制執行。
      value: { type: "number" },
      why: "寶具本體的一條屬性加成值（帶＝ITEM_MODIFIER_LIMITS[stat] / ITEM_PERCENT_LIMIT / stat-caps 的解鎖空間，逐格推導）",
      check: itemModifierValueCheck,
    },
    {
      paths: ["content/items/*.json"],
      pointers: ["/modifiers/*/msBonusTier"],
        // ⚠️ 帶 msBonusTier 的節點**沒有 value**（exclusive 模型）⇒ 它的量級只有這一格改得到。
      value: { type: "string", maxLen: 8 },
      why: "移速加成五級距的級別名（config.move-speed-tiers@1 解析成 %；這一族沒有 value）",
      check: itemMsTierCheck,
    },
    {
      paths: ["content/items/*.json"],
      pointers: ["/cost"],
        // ⚠️ 逐字鏡射出貨 schema 的 `cost: z.number().int().min(0)`（`schema/item.ts:395`）——
        //   ⛔ 那裡沒有上界，所以這裡也**不發明**一個（第〇·四：那會是第二個住處）。
      value: { type: "number", integer: true, min: 0 },
      why: "寶具現值（商店價與架上價 ×priceMultiplier 都從它推導）",
      check: () => (itemEditOff() ? ITEM_EDIT_OFF_WHY : null),
    },
  ],
};

export async function build(repoRoot) {
  const { readdirSync, existsSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");

  const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), "utf8"));
  const warnings = [];
  const rules = readJson("content/config/arena-rules.json");

  // ⭐ GH#831 —— 可編輯帶：頁上顯示的與 `check` 擋你的是**同一支函式**。
  //    讀不到就**大聲**（頁上一行警告 + 每一格退回唯讀），⛔ 不是安靜地畫出按鈕。
  const loaded = loadBands(repoRoot);
  const bands = typeof loaded === "string" ? null : loaded.bands;
  const caps = typeof loaded === "string" ? null : loaded.caps;
  if (typeof loaded === "string") warnings.push(`寶具 modifier 的可編輯帶讀不到 ⇒ 那幾格退回唯讀：${loaded}`);
  // 🔁 rollback 開關關著時，頁上**不畫** ✏️（⛔ 不是畫一顆按下去必被 check 擋的按鈕）。
  const itemEdit = { on: !itemEditOff(), why: itemEditOff() ? ITEM_EDIT_OFF_WHY : null };
  if (!itemEdit.on) warnings.push(ITEM_EDIT_OFF_WHY);
  const msTierValues = (() => {
    try {
      return readJson(CFG_MS_TIERS).bonus ?? {};
    } catch {
      return {};
    }
  })();
  /** 一件寶具的 modifier 逐條攤開（含帶／死因）—— 頁面的 ✏️ 只長在 `editable` 上。 */
  const modifierRows = (doc) =>
    (doc?.modifiers ?? []).map((m, index) => {
      const band = bands === null || caps === null ? { error: "帶讀不到" } : modifierBand(m, bands, caps);
      const tier = typeof m.msBonusTier === "string" ? m.msBonusTier : null;
      return {
        index,
        stat: m.stat ?? "?",
        op: m.op ?? "?",
        // ⭐ **哪一格才是這條 modifier 的量級住處**（第〇·四守則的 exclusive 模型）：
        //   帶級別的沒有 value ⇒ 頁面要長的是**級別**那一格，⛔ 不是一顆存不進去的 value。
        field: tier === null ? "value" : "msBonusTier",
        value: typeof m.value === "number" ? m.value : null,
        msBonusTier: tier,
        tierValue: tier !== null && typeof msTierValues[tier] === "number" ? msTierValues[tier] : null,
        tierNames: tier === null ? [] : Object.keys(msTierValues),
        requires: m.requires ? JSON.stringify(m.requires) : null,
        scope: m.scopeSlot ?? m.scopeAbilityId ?? null,
        // ⭐ 帶是給人看的（⛔ 不是給前端當驗證用 —— 裁決者永遠是伺服器）
        min: tier === null ? (band.min ?? null) : null,
        max: tier === null ? (band.max ?? null) : null,
        minExclusive: tier === null && band.minExclusive === true,
        why:
          tier === null
            ? (band.why ?? null)
            : `級別在載入時由 config.move-speed-tiers@1 解析成 %（${Object.entries(msTierValues)
                .map(([k, v]) => `${k}=${v}`)
                .join("／")}）`,
        // 死的（第一·五守則）與唯讀的（帶讀不到／rollback 開關），兩種都**不長 ✏️**，
        // 但理由不一樣所以分開列 —— ⛔ 「壞掉」與「刻意關著」不可以長得一樣。
        dead: band.dead ?? null,
        error: band.error ?? (itemEdit.on ? null : ITEM_EDIT_OFF_WHY),
        editable: itemEdit.on && band.dead === undefined && band.error === undefined,
      };
    });

  // ---- 產生器產物的兩份 CSV（join 用，⛔ 不是資料的主住處） ----
  const treasureCsv = new Map();
  const wishCsv = new Map();
  const py = spawnSync(
    "python3",
    ["-c", PY_DUMP, join(repoRoot, "寶具總表_EX三階.csv"), join(repoRoot, "tools/grail-wishes/ggd_sacred_grail_wishes_v1.csv")],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (py.status === 0 && py.stdout) {
    const dump = JSON.parse(py.stdout);
    for (const r of dump.treasure ?? []) treasureCsv.set(r.id, r);
    for (const r of dump.wishes ?? []) wishCsv.set(r.id, r);
    if (dump.treasure_error) warnings.push(`寶具總表_EX三階.csv 讀取失敗：${dump.treasure_error}`);
    if (dump.wishes_error) warnings.push(`grail-wishes CSV 讀取失敗：${dump.wishes_error}`);
  } else {
    warnings.push(`python3 CSV dump 失敗（exit ${py.status}）：${(py.stderr || "").slice(0, 300)}`);
  }

  // ---- 武器側：loot table × weaponTiers × rounds × items ----
  const tierByTable = new Map((rules.weaponTiers ?? []).map((t) => [t.table, t]));
  /** table id → 固定發卡的回合（rounds.<n>.weaponLootTable）。 */
  const fixedRounds = new Map();
  for (const [rd, cfg] of Object.entries(rules.rounds ?? {})) {
    if (!cfg || !cfg.weaponLootTable) continue;
    const list = fixedRounds.get(cfg.weaponLootTable) ?? [];
    list.push({ round: Number(rd), pct: cfg.weaponDraftPct ?? null, draftBoth: cfg.draftBoth === true });
    fixedRounds.set(cfg.weaponLootTable, list);
  }

  const lootDir = join(repoRoot, "content/loot-tables");
  const tables = [];
  const outOfBand = [];
  let missingItems = 0;
  let csvMisses = 0;
  for (const f of readdirSync(lootDir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const table = JSON.parse(readFileSync(join(lootDir, f), "utf8"));
    const tid = table.id ?? f.slice(0, -5);
    const tierRow = tierByTable.get(tid) ?? null;
    const entries = [];
    const totalWeight = (table.entries ?? []).reduce((s, e) => s + (e.weight ?? 1), 0);
    let srcIndex = -1; // 檔案裡的原始索引（寫入端的 pointer 用它；entries 稍後會重排）
    for (const e of table.entries ?? []) {
      srcIndex += 1;
      const p = join(repoRoot, "content/items", `${e.itemId}.json`);
      let doc = null;
      if (existsSync(p)) doc = JSON.parse(readFileSync(p, "utf8"));
      else missingItems++;
      const csvRow = treasureCsv.get(e.itemId) ?? null;
      if (!csvRow) csvMisses++;
      const swingRaw = csvRow ? String(csvRow["翻盤力"] ?? "") : "";
      const bar = swingRaw.indexOf("｜");
      const mods = doc === null ? [] : modifierRows(doc);
      // ⭐ 出貨的**現值**落在推導出來的帶外 ⇒ 那一格會是「按下去存不回去」的按鈕
      //    （skill90 那條豁免逐字警告過這件事）。⇒ 大聲說出來，⛔ 不是安靜地畫出來。
      for (const m of mods) {
        if (!m.editable || m.value === null) continue;
        const lowBad = m.minExclusive ? !(m.value > m.min) : m.value < m.min;
        if (lowBad || m.value > m.max)
          outOfBand.push(`${e.itemId} /modifiers/${m.index}（${m.stat} ${m.op}）現值 ${m.value} 不在推導帶 [${m.min}, ${m.max}] 內`);
      }
      entries.push({
        srcIndex,
        itemId: e.itemId,
        itemFile: doc === null ? null : `content/items/${e.itemId}.json`, // 寫入端的 path（⛔ 缺檔就不長 ✏️）
        modifiers: mods,
        name: doc?.name ?? "（content/items 缺這一份）",
        weight: e.weight ?? 1,
        sharePct: totalWeight > 0 ? Math.round(((e.weight ?? 1) / totalWeight) * 1000) / 10 : 0,
        cost: doc?.cost ?? null,
        craftRole: doc?.craftRole ?? "none",
        draftEligible: doc?.draftEligible !== false, // 省略＝true（schema/item.ts）
        requiresAttackType: doc?.requiresAttackType ?? null,
        swingScore: bar > 0 ? Number(swingRaw.slice(0, bar)) : null,
        swingMarks: bar > 0 ? swingRaw.slice(bar + 1) : swingRaw || null,
        tags: doc?.tags ?? [],
      });
    }
    entries.sort((a, b) => (b.swingScore ?? -1) - (a.swingScore ?? -1) || a.itemId.localeCompare(b.itemId));
    tables.push({
      id: tid,
      file: `content/loot-tables/${f}`, // 寫入端的 path 用它（⛔ 不從 id 拼檔名）
      name: table.name ?? tid,
      note: table.note ?? "",
      label: tierRow?.label ?? "EX（基礎池）",
      tier: tierRow, // minRound/maxRound/basePct/underdog*/guaranteeAtD/limitScope/limitCount —— 出貨值原樣
      fixedRounds: fixedRounds.get(tid) ?? [],
      entryCount: entries.length,
      totalWeight,
      entries,
    });
  }
  tables.sort((a, b) => {
    const ia = TABLE_ORDER.indexOf(a.id);
    const ib = TABLE_ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.id.localeCompare(b.id);
  });
  if (missingItems > 0) warnings.push(`loot table 指到 ${missingItems} 件 content/items 沒有的道具`);
  if (outOfBand.length > 0)
    warnings.push(
      `⛔ ${outOfBand.length} 條 modifier 的**現值**落在推導帶外 —— 那一格的 ✏️ 按下去會被自己的 check 擋掉：` +
        outOfBand.slice(0, 6).join("；") +
        (outOfBand.length > 6 ? `（另有 ${outOfBand.length - 6} 條）` : ""),
    );
  if (csvMisses > 0 && treasureCsv.size > 0)
    warnings.push(`${csvMisses} 件不在 寶具總表_EX三階.csv 裡（產物過期？跑 python3 tools/economy/gen_treasure_csv.py）`);

  // ---- 聖杯側：出貨 augments（60 願望 + 31 舊卡） ----
  const augDir = join(repoRoot, "content/augments");
  const wishes = [];
  const legacy = [];
  for (const f of readdirSync(augDir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = JSON.parse(readFileSync(join(augDir, f), "utf8"));
    const isWish = Array.isArray(doc.tags) && doc.tags.includes("grail-wish");
    if (!isWish) {
      legacy.push({ id: doc.id, name: doc.name, tier: doc.tier, weight: doc.weight });
      continue;
    }
    const csvRow = wishCsv.get(doc.id) ?? null;
    wishes.push({
      id: doc.id,
      name: doc.name,
      tier: doc.tier,
      tierZh: TIER_ZH[doc.tier] ?? doc.tier,
      rankDisplay: csvRow?.rank_display ?? "",
      weight: doc.weight,
      slot: doc.selectionSlot ?? "generic",
      slotDisplay: csvRow?.selection_slot_display ?? "",
      eligibility: doc.eligibility ? JSON.stringify(doc.eligibility) : "",
      tags: doc.tags,
      description: doc.description ?? "",
    });
  }
  const tierOrder = { silver: 0, gold: 1, prismatic: 2 };
  wishes.sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9) || a.id.localeCompare(b.id));
  legacy.sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9) || a.id.localeCompare(b.id));
  const wishCsvMisses = wishes.filter((w) => w.slotDisplay === "").length;
  if (wishCsvMisses > 0 && wishCsv.size > 0)
    warnings.push(`${wishCsvMisses} 張願望不在 tools/grail-wishes CSV 裡（顯示名列不出「第幾願望」）`);

  const bySlot = {};
  const byTier = {};
  for (const w of wishes) {
    bySlot[w.slot] = (bySlot[w.slot] ?? 0) + 1;
    const t = (byTier[w.tier] ??= { count: 0, totalWeight: 0 });
    t.count += 1;
    t.totalWeight += w.weight;
  }

  /** 每一回合發哪一階的願望卡（rounds.<n>.augmentTier，出貨值原樣）。 */
  const roundAugmentTiers = Object.entries(rules.rounds ?? {})
    .filter(([, c]) => c && c.augmentTier)
    .map(([rd, c]) => ({ round: Number(rd), tier: c.augmentTier }))
    .sort((a, b) => a.round - b.round);

  return {
    warnings,
    weapon: {
      itemEdit, // 🔁 rollback 開關的現況（頁面用它決定 /cost 那一格畫不畫 ✏️）
      offerCount: rules.offerCount ?? 3,
      draftConflict: rules.draftConflict ?? "",
      itemDraft: rules.itemDraft ?? {},
      legendaryShelf: rules.legendaryShelf ?? {},
      tables,
    },
    grail: {
      rules: rules.grailDraft ?? {},
      augmentTiers: rules.augmentTiers ?? [],
      roundAugmentTiers,
      bySlot,
      byTier,
      wishCount: wishes.length,
      legacyCount: legacy.length,
      wishes,
      legacy,
    },
  };
}
