// ggd:writes docs/editor-contract/jass-template-map.md
/**
 * ⭐⭐ GH#244 —— **JASS 行為類 ↔ 出貨模板** 的對照表。
 *
 * ── ⛔ 為什麼它必須是**產生的** ──────────────────────────────────────────────
 * 票文要的是「全 JASS 掃描 → **模板總類表** → UI 編輯器 → 併入後台」。
 * ⚠️ 而一張**手寫**的總類表會立刻過期：`content/ability-templates/` 每加一支、
 * 每有一支技能套上模板，那張表就少一列真相 —— ⛔ 而沒有任何東西會叫。
 *
 * ── ⭐⭐ join key 是**技能編號**（`90-00`），⛔ 不是 rawcode ────────────────
 * CLAUDE.md 逐字：「編號↔技能是 JASS 對照的 join key（綁死，`92-02` 永遠是消化液）」。
 * ⚠️ 2026-08-31 我第一次拿 **rawcode** 當 key ⇒ 309 支只對上 **1** 支，
 * ⭐ 而那個 1 讀起來完全像個合理的答案（⛔ 它是量尺瞎了）。
 * ⇒ 換成編號之後：**154 支**對得上。
 *
 * ── ⭐ 它回答的一題 ────────────────────────────────────────────────────────
 * 「**下一批模板該做哪一類**」—— 按**擋住幾支**排序（第〇·五守則：
 * 盤點 → 按擋住的支數做機制，⛔ 不是按技能順序做技能）。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const JASS = join(REPO, "tools/w3x-import/out/GoDieEX22s-src/JASS_BEHAVIOR.json");
const OUT = join(REPO, "docs/editor-contract/jass-template-map.md");
const NUM = /^(\d{2}-\d{2,3})/;

/** 出貨 ability：**編號** → { id, template }。⛔ 編號是唯一的 join key。 */
function shippedByNumber() {
  const dir = join(REPO, "content/abilities");
  const out = new Map();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const d = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const m = NUM.exec(String(d.name ?? ""));
    if (m) out.set(m[1], { id: f.slice(0, -5), template: d.template?.ref ?? d.template ?? null });
  }
  return out;
}

export function buildMap() {
  const REAL_SUMMON = /召喚|summon|'n0|olddie|生命週期/i;
  const DUMMY_CARRIER = /dummy/i;
  const shapeOf = (s) => {
    const t = `${s.evidence ?? ""} ${s.notes ?? ""}`;
    if (REAL_SUMMON.test(t)) return "真召喚";
    if (DUMMY_CARRIER.test(t)) return "dummy 載體";
    return "判不出來";
  };

  const skills = JSON.parse(readFileSync(JASS, "utf8")).skills;
  const ship = shippedByNumber();
  const rows = [];
  for (const s of skills) {
    const m = NUM.exec(String(s.skill_name ?? ""));
    const num = m?.[1] ?? null;
    const hit = num ? ship.get(num) : undefined;
    rows.push({
      num, name: s.skill_name ?? "", hero: s.hero ?? "", rawcode: s.rawcode ?? "",
      jassTemplate: s.template ?? "(無)",
      shippedId: hit?.id ?? null,
      shippedTemplate: hit?.template ?? null,
      shape: shapeOf(s),
    });
  }
  // ⭐⭐ **「召喚代理」這個 JASS 分類把兩種機制混在一起了**（2026-08-31 逐支讀 evidence）：
  //   · **真召喚** —— `18-04 億年樹` 生 `'n010'` ＋ `OldTreeDie` 生命週期 ⇒ ⭐ 需要 `summon` effect
  //   · **dummy 載體** —— `65-04 天譴` 的 `per-unit dummy`、`42-04 世界終結` 的 `12 隻 u013 clap`
  //     ⇒ ⭐ 那是**特效／傷害的搬運工**，GGD 今天用 `spawnVfx` / `damageArea` / `delayed` 表達得出來
  //   量到：58 支裡 **真召喚 13 · dummy 載體 32 · 判不出來 13**
  //
  // ⚠️ ⭐ 少了這一層，「擋住 19 支」會被讀成「19 支需要召喚機制」——
  //   ⛔ 而那會讓下一個人去做一個**沒有那麼多支在等**的機制（第〇·五守則的反面）。

  // ⭐ 按「擋住幾支」排序 —— ⛔ 不是按技能順序
  const blocked = new Map();
  for (const r of rows) {
    if (r.shippedId === null || r.shippedTemplate !== null) continue;
    blocked.set(r.jassTemplate, (blocked.get(r.jassTemplate) ?? 0) + 1);
  }
  return { rows, blocked: [...blocked.entries()].sort((a, b) => b[1] - a[1]) };
}

export function render() {
  const { rows, blocked } = buildMap();
  const matched = rows.filter((r) => r.shippedId !== null);
  const withTpl = matched.filter((r) => r.shippedTemplate !== null);
  const L = [];
  L.push("# JASS 行為類 ↔ 出貨模板 對照表（GH#244）");
  L.push("");
  L.push("> ⛔ **這一份是產生的** —— `node tools/jass-template-map/gen.mjs`。");
  L.push("> ⚠️ 手改它下一次重生成就打回來；⭐ 要改請改 `content/ability-templates/` 或技能的 `template`。");
  L.push("");
  L.push("## ⭐ 現況");
  L.push("");
  L.push("| | |");
  L.push("|---|---:|");
  L.push(`| JASS 掃到的技能 | **${rows.length}** |`);
  L.push(`| ⭐ 對得上出貨 ability 的（join key ＝ **技能編號**） | **${matched.length}** |`);
  L.push(`| 其中**已套模板** | **${withTpl.length}** |`);
  L.push(`| ⛔ **沒套** | **${matched.length - withTpl.length}** |`);
  L.push("");
  L.push("⚠️ ⭐ **join key 是編號，⛔ 不是 rawcode** —— 2026-08-31 拿 rawcode 量到的是「309 支只對上 **1** 支」，");
  L.push("而那個 1 讀起來完全像個合理的答案。⭐ 換成編號之後是 " + matched.length + " 支。");
  L.push("");
  L.push("## ⭐ 下一批該做哪一類 —— 按**擋住幾支**排序（第〇·五守則）");
  L.push("");
  L.push("| 擋住 | JASS 行為類 |");
  L.push("|---:|---|");
  for (const [t, n] of blocked.slice(0, 20)) L.push(`| **${n}** | ${t} |`);
  L.push("");
  L.push("⭐ 判準逐字：「**按擋住的支數做機制，⛔ 不是按技能順序做技能**」。");
  L.push("");
  // ⭐ 「召喚代理」的分解 —— ⛔ 沒有它,那個 19 會被讀成「19 支需要召喚機制」
  const summonRows = rows.filter((r) => r.jassTemplate === "召喚代理");
  if (summonRows.length > 0) {
    const byShape = new Map();
    for (const r of summonRows) byShape.set(r.shape, (byShape.get(r.shape) ?? 0) + 1);
    L.push("## ⚠️⭐ 「召喚代理」是**兩種機制**，⛔ 不是一種");
    L.push("");
    L.push("| 形狀 | 支數 | GGD 今天表達得出來嗎 |");
    L.push("|---|---:|---|");
    L.push(`| **真召喚**（生一隻有生命週期的單位） | **${byShape.get("真召喚") ?? 0}** | ⛔ 需要 \`summon\` effect（schema 有、**內容零份在用**） |`);
    L.push(`| **dummy 載體**（特效／傷害的搬運工） | **${byShape.get("dummy 載體") ?? 0}** | ⭐ **可以** —— \`spawnVfx\` / \`damageArea\` / \`delayed\` |`);
    L.push(`| 判不出來 | ${byShape.get("判不出來") ?? 0} | ⚠️ 要逐支讀 JASS |`);
    L.push("");
    L.push("⚠️ ⭐ 上面那張「擋住幾支」的表裡，`召喚代理` 的數字**含這三種**——");
    L.push("⛔ 它 ⛔ 不等於「這麼多支在等 `summon` 機制」。");
    L.push("");
  }
  L.push("## 逐支");
  L.push("");
  L.push("| 編號 | 技能 | 英雄 | JASS 行為類 | 出貨 id | 出貨模板 |");
  L.push("|---|---|---|---|---|---|");
  for (const r of rows) {
    L.push(`| ${r.num ?? "—"} | ${r.name} | ${r.hero} | ${r.jassTemplate} | ${r.shippedId ?? "⛔ 對不上"} | ${r.shippedTemplate ?? "⛔ 沒套"} |`);
  }
  return L.join("\n") + "\n";
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const text = render();
  if (process.argv.includes("--check")) {
    const cur = readFileSync(OUT, "utf8");
    if (cur !== text) { console.error("⛔ jass-template-map.md 過期 —— 跑 node tools/jass-template-map/gen.mjs"); process.exit(1); }
    console.log("✓ jass-template-map.md 是新鮮的");
  } else {
    writeFileSync(OUT, text);
    console.log(`✓ ${OUT}`);
  }
}
