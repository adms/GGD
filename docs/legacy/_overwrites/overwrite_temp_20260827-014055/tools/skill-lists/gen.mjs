#!/usr/bin/env tsx
/**
 * 技能清單產生器（GH#682 詠唱 >1 秒 ＋ GH#683 移速加成）。
 *
 * owner 2026-08-24（兩張票各逐字點名第二次）：
 * > 「施法準備/詠唱/吟唱時間超過1秒的技能列表(md) & 後台」
 * > 「任何增加移動速度的技能列表(md) &後台」
 *
 * ```bash
 * pnpm speedlists:build     # 重生成 lists.json + docs/技能詠唱清單.md + docs/技能移速清單.md
 * pnpm speedlists:check     # 唯讀：三份產物是不是最新（逐位元組）
 * ```
 *
 * ⛔ **三份產物都是產生的，不可以手改** —— 手寫的表必過期而且沒有東西會紅。
 *
 * ⭐ 資料只算**一次**：`tools/skill-lists/lists.json` 是唯一的資料住處，
 * 兩份 md 由它 render，後台兩頁（apps/admin/src/ui/SkillListsPage.tsx）
 * **import 同一份 JSON** —— md 與後台不可能各說各話（第〇·四守則：一份知識一個住處）。
 *
 * ⭐ 掃的是**真的載入器跑完的註冊表**（loadContentCached + registerAll →
 * Abilities/Items/Augments），⛔ 不是自己 parse content/*.json ——
 * 鑄技工坊模板技（`template` 綁定）的 castTimeSec / modifiers 是 `expandStack()`
 * 在註冊時填進去的，讀生檔會整族漏掉（出貨 89 份模板技）。
 *
 * ⚠️ 刻意沒有產生日期（同 caps:export / spec:build / lowdmg:build）：任何隨時鐘
 * 變動的欄位都會讓 `--check` 的逐位元組比對永遠不相等，於是它只能被放寬成模糊
 * 比對 —— 而一條被放寬的閘等於沒有閘（GH#389 · #426）。
 *
 * ⚠️ 技能語料 = 平衡量測母體（starterChampions − retired − 變身態），
 * 與 lowdmg:build 同一支 `balanceAbilityOwners` —— 變身態的技能是本體那一支的
 * 第二份（同一個 NN-XX 編號），兩份都列就是把同一支技能列兩次。
 * 道具與增益卡沒有母體概念，全列。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadContentCached } from "../../packages/shared/src/content/cache/index";
import { registerAll, Configs } from "../../packages/shared/src/content/registries";
import {
  Abilities,
  Augments,
  Champions,
  Items,
} from "../../packages/shared/src/sim/content/registry";
import {
  applyCastTimeRules,
  castTimeRulesFromDoc,
} from "../../packages/shared/src/sim/castTimeRules";
import {
  BALANCE_POPULATION_PROVENANCE,
  balanceAbilityOwners,
} from "../../packages/shared/testkit/balancePopulation";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_JSON = join(REPO, "tools/skill-lists/lists.json");
const OUT_CAST_MD = join(REPO, "docs/技能詠唱清單.md");
const OUT_MS_MD = join(REPO, "docs/技能移速清單.md");
const CMD = "pnpm speedlists:build";

/** 門檻（秒）——「施法準備/詠唱/吟唱時間超過 1 秒」的那個 1。 */
export const CAST_LIST_MIN_SEC = 1;

/** 正向移速 modifier 的三種 op（owner 點名 flat / pctAdd / pctMult > 0）。 */
const POSITIVE_OPS = new Set(["flat", "pctAdd", "pctMult"]);

const SLOT_RE = /\.(q|w|e|r|ex|passive|innate)$/;
const ownerOf = (id) => id.replace(SLOT_RE, "");
const slotOf = (id) => {
  const m = SLOT_RE.exec(id);
  return m ? m[1].toUpperCase() : "?";
};

const r3 = (x) => Math.round(x * 1000) / 1000;
const pct = (v) => String(r3(v * 100));

/** ───────────────────────── ① 詠唱 >1 秒 ───────────────────────── */
function buildCastList(owners, rules) {
  const rows = [];
  for (const def of Abilities.all()) {
    const spec = def.castTimeSec;
    if (typeof spec !== "number" || !(spec > CAST_LIST_MIN_SEC)) continue;
    const owner = ownerOf(def.id);
    if (!owners.has(owner)) continue;
    const effective = r3(applyCastTimeRules(rules, spec));
    rows.push({
      id: def.id,
      name: def.name ?? def.id,
      champion: owner,
      championName: Champions.tryGet(owner)?.name ?? owner,
      slot: slotOf(def.id),
      /** 原值（模板補完後的 castTimeSec，⛔ 未套 config.cast-time@1） */
      castTimeSec: r3(spec),
      /** 夾後＝玩家實際等的秒數 = applyCastTimeRules(出貨 cast-time 文件, 原值) */
      effectiveSec: effective,
      /**
       * ⏳ #787 owner 夾的「後台記錄」兩欄（owner 2026-08-27：「把所有詠唱超過
       * 一秒的都調整至一秒 但是在後台留下記錄」）—— 差＝原值−夾後；clamped＝
       * castTimeMaxSec 真的咬到了這一支（⛔ 從出貨規則推導，不假設 95 支全中：
       * 止血閥拉到 8 之後這一欄自己歸零）。
       */
      deltaSec: r3(spec - effective),
      clamped: rules.enabled && spec > rules.castTimeMaxSec,
      castType: def.castType,
      /** 被打會不會斷：schema 預設 "none" ＝ 只有死亡/暈眩/擊倒會斷 */
      interruptOn: def.interruptOn ?? "none",
      /** 施法期間定身：schema 預設 true */
      rootWhileCasting: def.rootWhileCasting !== false,
    });
  }
  rows.sort((a, b) => b.castTimeSec - a.castTimeSec || a.id.localeCompare(b.id));
  return rows;
}

/** ───────────────────────── ② 移速加成 ─────────────────────────
 * 通用走訪：任何深度的 `{stat:"ms", op:flat|pctAdd|pctMult, value>0}` 都算 ——
 * applyBuff.modifiers、applyBuff.perRank[].modifiers、passive.ranks[].modifiers、
 * auras、deathWard、道具本體 modifiers、增益卡 modifiers、hook effects 全包。
 * ⛔ 跳過 `.template.` 子樹：模板綁定的 params 是**作者填的來源**，展開後的
 * effects 才是出貨行為 —— 兩邊都算就是同一條 modifier 數兩次。
 */
function scanMsHits(root) {
  const hits = [];
  const seen = new WeakSet();
  const visit = (node, path, ancestors) => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((v, i) => visit(v, `${path}[${i}]`, ancestors));
      return;
    }
    if (
      node.stat === "ms" &&
      POSITIVE_OPS.has(node.op) &&
      typeof node.value === "number" &&
      node.value > 0
    ) {
      hits.push({ node, path, ancestors: [...ancestors] });
    }
    const next = [...ancestors, node];
    for (const [k, v] of Object.entries(node)) {
      if (k === "template") continue;
      visit(v, `${path}.${k}`, next);
    }
  };
  visit(root, "", []);
  return hits;
}

/** 一筆 hit 的「持續多久」＋「掛在哪」。 */
function describeHit(hit, kind) {
  // 最近的、帶時長語意的祖先：applyBuff（duration / permanent）或 perRank 覆寫
  for (let i = hit.ancestors.length - 1; i >= 0; i--) {
    const a = hit.ancestors[i];
    if (a && typeof a === "object" && !Array.isArray(a)) {
      if (a.permanent === true) {
        return {
          ctx: "施放後增益",
          dur: a.permanentScope === "round" ? "永久（本回合）" : "永久（整場）",
        };
      }
      if (a.kind === "applyBuff") {
        return {
          ctx: "施放後增益",
          dur: typeof a.duration === "number" ? `${r3(a.duration)} 秒` : "—",
        };
      }
    }
  }
  if (hit.path.includes(".auras[")) return { ctx: "靈氣", dur: "範圍內持續" };
  if (hit.path.includes(".deathWard")) return { ctx: "死亡守衛", dur: "守衛存活期間" };
  if (hit.path.includes(".passive.ranks[")) return { ctx: "常駐被動", dur: "常駐" };
  if (hit.path.startsWith(".modifiers[")) {
    if (kind === "item") return { ctx: "道具屬性", dur: "持有期間" };
    if (kind === "augment") return { ctx: "增益卡屬性", dur: "整場" };
    return { ctx: "本體屬性", dur: "常駐" };
  }
  return { ctx: "其他", dur: "—" };
}

function amountText(op, values) {
  const vs = [...new Set(values.map(r3))].sort((a, b) => a - b);
  const one = (v) =>
    op === "flat" ? `+${v} 移速` : op === "pctAdd" ? `+${pct(v)}%` : `+${pct(v)}%（乘區）`;
  return vs.length === 1 ? one(vs[0]) : `${one(vs[0])} ~ ${one(vs[vs.length - 1])}（隨階級）`;
}

/**
 * GH#789 —— 這一列的**五級距**欄。
 * · 有 `msBonusTier` 的節點（% 列）：印級別（逐階不同就 `中→極大`）。
 * · 沒有的：豁免列 —— flat（單位 u/s 不是 %）或具名豁免（赤色彗星／首輪），
 *   印「豁免」讓表上看得出**哪幾列不吃表**（⛔ 不是留白——留白跟漏掉長一樣）。
 * 級別 → 值的表住 `content/config/move-speed-tiers.json`（後台「移速加成五級距」頁）。
 */
function tierText(op, tiers) {
  const ts = [...new Set(tiers)].filter(Boolean);
  if (ts.length === 0) return op === "flat" ? "豁免（flat u/s）" : "豁免（字面值）";
  return ts.length === 1 ? ts[0] : `${ts[0]}→${ts[ts.length - 1]}`;
}

function buildMsList(owners) {
  const groups = new Map();
  const add = (kind, def, championName) => {
    for (const hit of scanMsHits(def)) {
      const { ctx, dur } = describeHit(hit, kind);
      const key = `${kind}|${def.id}|${ctx}|${hit.node.op}`;
      const g = groups.get(key) ?? {
        kind,
        id: def.id,
        name: def.name ?? def.id,
        championName,
        ctx,
        op: hit.node.op,
        values: [],
        tiers: [],
        durs: new Set(),
      };
      g.values.push(hit.node.value);
      // GH#789 —— 級別留在節點上（resolveMsBonusTier 只補 value 不刪 tier），
      // 所以這裡讀得到「這一列住在梯子的哪一格」。
      if (typeof hit.node.msBonusTier === "string") g.tiers.push(hit.node.msBonusTier);
      g.durs.add(dur);
      groups.set(key, g);
    }
  };
  for (const def of Abilities.all()) {
    const owner = ownerOf(def.id);
    if (!owners.has(owner)) continue;
    add("ability", def, Champions.tryGet(owner)?.name ?? owner);
  }
  for (const def of Items.all()) add("item", def, null);
  for (const def of Augments.all()) add("augment", def, null);

  const KIND_ORDER = { ability: 0, item: 1, augment: 2 };
  return [...groups.values()]
    .map((g) => ({
      kind: g.kind,
      id: g.id,
      name: g.name,
      championName: g.championName,
      context: g.ctx,
      op: g.op,
      amountText: amountText(g.op, g.values),
      durationText: [...g.durs].sort().join("／"),
    }))
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.id.localeCompare(b.id) ||
        a.context.localeCompare(b.context) ||
        a.op.localeCompare(b.op),
    );
}

/** ───────────────────────── render ───────────────────────── */
const GEN_BANNER = [
  "> ⚙️ **這一份是產生出來的，⛔ 不要手改。**",
  ">",
  "> ```bash",
  `> ${CMD}     # 重生成`,
  "> pnpm speedlists:check     # 唯讀：過期就回非零",
  "> ```",
];

const KIND_ZH = { ability: "技能", item: "道具", augment: "增益卡" };
const INTERRUPT_ZH = {
  none: "不會（僅死亡/暈眩/擊倒）",
  damage: "會（掉血就斷）",
};

function renderCastMd(data) {
  const L = [];
  L.push("# 技能詠唱清單（GH#682）");
  L.push("");
  L.push(...GEN_BANNER);
  L.push(">");
  L.push("> owner 2026-08-24（逐字）：");
  L.push("> 「**施法準備/詠唱/吟唱時間超過1秒的技能列表(md) & 後台**」");
  L.push(">");
  L.push("> ⏳ owner 2026-08-27（逐字，#787）：");
  L.push("> 「**把所有詠唱超過一秒的都調整至一秒 但是在後台留下記錄**」");
  L.push("> ⇒ 這一份就是那個記錄：原值／夾後／差三欄。夾在載入時的唯一解析入口");
  L.push("> （`config.cast-time@1` 的 `castTimeMaxSec`，出貨 1.0），⛔ 95 份技能 JSON 一份都沒動。");
  L.push("");
  L.push(`母體：${data.provenance}`);
  L.push("");
  L.push(
    `原值＝技能文件（含鑄技工坊模板補完）的 \`castTimeSec\`；` +
      `夾後＝套完出貨 \`config.cast-time@1\`（**castTimeMaxSec=${data.castTimeMaxSec}** /倍率/上下限/tick 對齊）後玩家實際等的秒數；` +
      `差＝原值−夾後。「⏳」＝被 castTimeMaxSec 咬到的（止血閥拉到 8 之後這一欄自己歸零）。`,
  );
  L.push("");
  L.push(
    `共 **${data.cast.length}** 支技能詠唱超過 ${data.castThresholdSec} 秒，` +
      `其中 **${data.cast.filter((r) => r.clamped).length}** 支被夾。`,
  );
  L.push("");
  L.push("| 技能 id | 技能名 | 英雄 | 格 | 詠唱（原值） | 詠唱（夾後） | 差 | castType | 可否被打斷 |");
  L.push("|---|---|---|---|---:|---:|---:|---|---|");
  for (const r of data.cast) {
    L.push(
      `| \`${r.id}\` | ${r.name} | ${r.championName} | ${r.slot} | ${r.castTimeSec} | ` +
        `${r.effectiveSec} | ${r.clamped ? "⏳ " : ""}${r.deltaSec} | ` +
        `${r.castType} | ${INTERRUPT_ZH[r.interruptOn]} |`,
    );
  }
  L.push("");
  L.push("後台同一份資料：管理後台 →「戰鬥規則」→「📜 詠唱>1秒清單」。");
  L.push("");
  return L.join("\n");
}

function renderMsMd(data) {
  const L = [];
  L.push("# 技能移速清單（GH#683）");
  L.push("");
  L.push(...GEN_BANNER);
  L.push(">");
  L.push("> owner 2026-08-24（逐字）：");
  L.push("> 「**任何增加移動速度的技能列表(md) &後台**」");
  L.push("");
  L.push(`技能母體：${data.provenance}（道具與增益卡全列）`);
  L.push("");
  L.push(
    "收錄條件：`stat: ms` 且 `op` 為 flat / pctAdd / pctMult、`value > 0` 的 modifier —— " +
      "含 applyBuff（與其 perRank）、常駐被動、靈氣、死亡守衛、道具本體、增益卡。",
  );
  L.push("");
  L.push(`共 **${data.ms.length}** 列。`);
  L.push("");
  L.push("| 來源 id | 名稱 | 種類 | 英雄 | 掛在哪 | 加多少 | 持續多久 |");
  L.push("|---|---|---|---|---|---|---|");
  for (const r of data.ms) {
    L.push(
      `| \`${r.id}\` | ${r.name} | ${KIND_ZH[r.kind]} | ${r.championName ?? "—"} | ` +
        `${r.context} | ${r.amountText} | ${r.durationText} |`,
    );
  }
  L.push("");
  L.push("後台同一份資料：管理後台 →「戰鬥規則」→「💨 移速加成清單」。");
  L.push("");
  return L.join("\n");
}

/** ───────────────────────── main ───────────────────────── */
export async function buildData() {
  const loaded = await loadContentCached({ rootDir: join(REPO, "content") });
  registerAll(loaded.store);
  const owners = balanceAbilityOwners(REPO);
  const rules = castTimeRulesFromDoc(Configs.tryGet("cast-time"));
  return {
    $generator: `tools/skill-lists/gen.mjs —— ${CMD}（⛔ 產生的，不要手改）`,
    provenance: BALANCE_POPULATION_PROVENANCE,
    castThresholdSec: CAST_LIST_MIN_SEC,
    /** ⏳ #787：出貨的 owner 夾（config.cast-time@1 的 castTimeMaxSec）。 */
    castTimeMaxSec: rules.castTimeMaxSec,
    cast: buildCastList(owners, rules),
    ms: buildMsList(owners),
  };
}

async function main() {
  const check = process.argv.includes("--check");
  const data = await buildData();
  const outputs = [
    [OUT_JSON, JSON.stringify(data, null, 2) + "\n"],
    [OUT_CAST_MD, renderCastMd(data)],
    [OUT_MS_MD, renderMsMd(data)],
  ];
  if (check) {
    const stale = outputs.filter(
      ([p, want]) => !existsSync(p) || readFileSync(p, "utf8") !== want,
    );
    if (stale.length > 0) {
      console.error(
        `speedlists:check 過期：\n${stale.map(([p]) => `  ${p}`).join("\n")}\n→ 跑 ${CMD} 然後 git add`,
      );
      process.exit(1);
    }
    console.log(`speedlists:check OK（${outputs.length} 份產物皆最新）`);
    return;
  }
  for (const [p, body] of outputs) writeFileSync(p, body);
  console.log(
    `speedlists:build 完成：詠唱>${CAST_LIST_MIN_SEC}s ${data.cast.length} 支 · 移速 ${data.ms.length} 列`,
  );
}

const invoked = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invoked || process.argv[1]?.endsWith("gen.mjs")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
