/**
 * ✍️ 技能撰寫助手 dataset —— GET 回參考資料，POST {name, description} 回建議的 effects JSON 骨架。
 *
 * owner 逐字：「這些後台頁面的內容都要 **script 實時動態產生**，**不是靜態內容**喔」
 * ⇒ 每一格都在請求當下從磁碟現況讀，⛔ 沒有任何 build-time 烘進頁面的資料。
 *
 * 知識的住處（第〇·四守則 —— 這裡**一個字面值都不重算**）：
 *   · 軸的定義        ← tools/skill-templates/shape_axes.json（scan_shapes.py 的唯一來源）
 *   · 宣稱側的正則    ← tools/skill-templates/prose_markers.json（同上）
 *   · effect kind 名單 ← docs/editor-contract/ggd-runtime-capabilities.json（caps:export 產物）
 *   · 五級距名        ← content/config/damage-tiers.json 的 damage 鍵（anchors:build 產物）
 *   · 範例節點        ← content/abilities/*.json —— ⭐ 逐字抄出貨節點，⛔ 不自己編
 *     （與 spec:build 同一條規矩：「範例一律從 content/ 抄」）
 *   · 狀態 id         ← content/status-effects/*.json
 *
 * ⭐ 這個檔**自己擁有**的只有兩張「可以被反駁」的判斷表（與 prose_markers.requiresAxes 同族）：
 *   TEXT_RULES（內文關鍵詞 → effect kind）與 TAG_RULES（[標籤] → 建議）。
 *   每一列都帶 why；kind 逐列對照 capabilities JSON 驗證 —— 引擎砍掉一個 kind，
 *   那一列自動失效並列進回應的 honest 段，⛔ 不是安靜地建議一個不存在的機制。
 *
 * ⛔ 對白剝除（第〇·六守則②，owner 2026-08-12）：任何讀說明找機制的東西都要先剝
 *   整段 `「…」`（含跨行、含行中）—— 與 tools/skill-remake/common.py::_mechanics_text
 *   同一個正則。`{{…}}` 佔位也剝（prose_markers._placeholderStrip）。
 *
 * ⛔ 唯讀：不寫任何檔。建議的 JSON 只回給瀏覽器讓人複製。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const deps = [
  "tools/skill-templates/shape_axes.json",
  "tools/skill-templates/prose_markers.json",
  "docs/editor-contract/ggd-runtime-capabilities.json",
  "content/editor-target-profile.json",
  "content/config/damage-tiers.json",
  "content/abilities",
  "content/abilities/_index.json",
  "content/augments/_index.json",
  "content/items/_index.json",
  "content/champions/_index.json",
  "content/status-effects",
  "content/status-effects/_index.json",
];

/** 範例節點掃這幾個集合（有些 kind 只在增益卡/道具/英雄卡上出現過，例：revive・shieldBreak）。 */
const EXAMPLE_COLLECTIONS = ["abilities", "augments", "items", "champions"];

/* ───────────────────────── 判斷表（可反駁；kind 逐列對照 capabilities 驗證） ───────────────────────── */

/** 內文關鍵詞 → effect kind。pattern 跑在**剝完對白與佔位**的句子上。 */
const TEXT_RULES = [
  { pattern: "(?:前方|沿線)?[^，。\\n]*直線[^，。\\n]*(?:傷害|敵人)|貫穿", kind: "damageLine", why: "「[前方][直線]敵人造成傷害」是出貨 damageLine 說明最一致的寫法" },
  { pattern: "(?:周圍|附近|範圍內|半徑)[^，。\\n]*(?:傷害|敵)", kind: "damageArea", why: "圈型傷害的宣稱" },
  { pattern: "隨機[^，。\\n]*(?:區域|位置|地點|落下)", kind: "randomArea", why: "隨機落點家族（隨機12次區域傷害）" },
  { pattern: "造成[^，。\\n]*傷害", kind: "damage", why: "傷害的最泛宣稱 —— 沒被 line/area 接走時的預設", weak: true },
  { pattern: "燃燒|灼燒|中毒|劇毒|流血|每秒[^，。\\n]*傷害|持續[^，。\\n]*傷害", kind: "dot", why: "持續傷害家族" },
  { pattern: "回復[^，。\\n]*(?:生命|血量|HP)|治癒|治療|回血", kind: "heal", why: "生命回復" },
  { pattern: "回復[^，。\\n]*(?:魔力|MP)|補魔|回魔", kind: "restore", why: "資源回復（restore 管非生命資源）" },
  { pattern: "護盾|護罩|吸收[^，。\\n]*傷害", kind: "shield", why: "護盾" },
  { pattern: "魔力(?:護盾|屏障)|魔力代替", kind: "manaBarrier", why: "魔力墊傷" },
  { pattern: "暈眩|擊暈|嚇昏|昏迷", kind: "applyStatus", statusSearch: ["暈眩", "stun"], why: "控制狀態 —— 期間住 applyStatus，statusId 從出貨狀態表找" },
  { pattern: "緩慢|減速|移動速度(?:降低|減少)", kind: "applyStatus", statusSearch: ["slow", "緩慢"], why: "減速家族（slow20…slow60）" },
  { pattern: "定身|紮根|無法移動", kind: "applyStatus", statusSearch: ["root", "定身"], why: "定身" },
  { pattern: "沉默|禁魔", kind: "applyStatus", statusSearch: ["沉默", "silence"], why: "沉默（⚠️ 出貨狀態表沒有就會誠實回「找不到」）" },
  { pattern: "恐懼|恐慌", kind: "applyStatus", statusSearch: ["恐懼", "fear"], why: "恐懼" },
  { pattern: "致盲|失明", kind: "applyStatus", statusSearch: ["致盲", "blind"], why: "致盲" },
  { pattern: "混亂", kind: "applyStatus", statusSearch: ["混亂", "confusion"], why: "混亂" },
  { pattern: "詛咒", kind: "applyStatus", statusSearch: ["詛咒", "curse"], why: "詛咒" },
  { pattern: "麻痺|癱瘓", kind: "applyStatus", statusSearch: ["麻痺", "癱瘓", "paralysis", "numbness"], why: "麻痺／癱瘓" },
  { pattern: "禁療|無法(?:被)?治療", kind: "applyStatus", statusSearch: ["禁療", "no-heal"], why: "禁療" },
  { pattern: "破甲", kind: "applyStatus", statusSearch: ["破甲", "armor-break"], why: "破甲" },
  { pattern: "破魔", kind: "applyStatus", statusSearch: ["破魔", "magic-break"], why: "破魔" },
  { pattern: "魅惑", kind: "applyStatus", statusSearch: ["魅惑", "charmed"], why: "魅惑" },
  { pattern: "暴走|狂怒|狂暴", kind: "applyStatus", statusSearch: ["暴走", "狂怒", "berserk", "rage"], why: "暴走／狂怒" },
  { pattern: "擊退|擊飛|推開|轟飛", kind: "knockback", why: "位移：推離" },
  { pattern: "拉(?:到|向|近|回)|勾(?:到|中)", kind: "pull", why: "位移：拉近" },
  { pattern: "衝刺|突進|衝向", kind: "dash", why: "位移：衝刺" },
  { pattern: "跳(?:躍|向|到)|躍向|飛撲", kind: "leap", why: "位移：跳躍" },
  { pattern: "瞬移|閃現|傳送", kind: "blink", why: "位移：瞬移" },
  { pattern: "召喚|喚出", kind: "summon", why: "召喚物" },
  { pattern: "變身|化身|型態|形態", kind: "championForm", why: "變身形態（互斥組住 exclusiveGroup）" },
  { pattern: "投擲|射出|發射|擲出|丟出|拋出|飛出", kind: "spawnProjectile", why: "投射物（飛行時間＝等待軸的 speed）" },
  { pattern: "連鎖|彈射|跳向(?:下一|另一)", kind: "chainLightning", why: "連鎖跳躍家族" },
  { pattern: "連續\\s*\\d+\\s*[次下擊]|\\d+\\s*連斬|連段", kind: "comboStrikes", why: "多段連擊" },
  { pattern: "無敵|免疫(?:所有)?傷害", kind: "invulnerable", why: "無敵（期間住 durationSec）" },
  { pattern: "嘲諷|強迫[^，。\\n]*攻擊", kind: "taunt", why: "嘲諷" },
  { pattern: "驅散|淨化|解除[^，。\\n]*(?:狀態|效果)", kind: "dispel", why: "驅散（pools 選驅散池）" },
  { pattern: "秒後[^，。\\n]*(?:造成|爆炸|發生|落下)|延遲[^，。\\n]*(?:造成|結算)", kind: "delayed", why: "等待軸：延遲結算（count:1 逐字＝純延遲）" },
  { pattern: "每(?:隔)?\\s*[\\d.]*\\s*秒[^，。\\n]*(?:造成|回復|觸發|發射)", kind: "delayed", loopHint: true, why: "迴圈軸：每隔 T 秒一次 ⇒ delayed 的 count×intervalSec（或 dot）" },
  { pattern: "吞噬|吞食", kind: "devour", why: "吞噬" },
  { pattern: "金幣|賞金|獲得[^，。\\n]*金", kind: "grantGold", why: "給錢" },
  { pattern: "復活|重生", kind: "revive", why: "復活" },
  { pattern: "迴避|閃避", kind: "evasion", why: "閃避" },
  { pattern: "(?:提升|增加|提高|強化)[^，。\\n]*(?:攻擊|移動速度|攻速|防禦|魔力|AP|AD|速度|屬性)", kind: "applyBuff", why: "自身/友方屬性增益（modifiers＋duration）" },
  { pattern: "吸血|生命偷取", kind: "applyBuff", why: "吸血走 applyBuff 的 lifesteal modifier" },
  { pattern: "獲得[^，。\\n]*(?:力量|敏捷|智力)", kind: "grantAttribute", why: "三圍成長" },
  { pattern: "冷卻[^，。\\n]*(?:縮短|減少|歸零|重置)", kind: "modifyCooldown", why: "冷卻操作" },
];

/** [標籤] → 建議。effect kind 之外也可以是頂層欄位的提示（field）。 */
const TAG_RULES = [
  { tag: "直線", kind: "damageLine", why: "線型傷害" },
  { tag: "範圍", kind: "damageArea", why: "圈型傷害" },
  { tag: "小範圍", kind: "damageArea", why: "圈型傷害（radiusTier 選小）" },
  { tag: "大範圍", kind: "damageArea", why: "圈型傷害（radiusTier 選大）" },
  { tag: "周圍", kind: "damageArea", why: "以自身為圓心的圈" },
  { tag: "擊退", kind: "knockback", why: "位移：推離" },
  { tag: "暈眩", kind: "applyStatus", statusSearch: ["暈眩", "stun"], why: "控制狀態" },
  { tag: "定身", kind: "applyStatus", statusSearch: ["root", "定身"], why: "控制狀態" },
  { tag: "致盲", kind: "applyStatus", statusSearch: ["致盲", "blind"], why: "控制狀態" },
  { tag: "混亂", kind: "applyStatus", statusSearch: ["混亂", "confusion"], why: "控制狀態" },
  { tag: "恐懼", kind: "applyStatus", statusSearch: ["恐懼", "fear"], why: "控制狀態" },
  { tag: "詛咒", kind: "applyStatus", statusSearch: ["詛咒", "curse"], why: "減益狀態" },
  { tag: "燃燒", kind: "dot", why: "持續傷害" },
  { tag: "緩慢", kind: "applyStatus", statusSearch: ["slow", "緩慢"], why: "減速" },
  { tag: "暴走", kind: "applyStatus", statusSearch: ["暴走", "berserk"], why: "暴走" },
  { tag: "護盾", kind: "shield", why: "護盾" },
  { tag: "回復", kind: "heal", why: "生命回復" },
  { tag: "變身", kind: "championForm", why: "變身形態" },
  { tag: "切換", kind: "championForm", why: "形態切換（exclusiveGroup）" },
  { tag: "變化", kind: "championForm", why: "形態變化" },
  { tag: "衝刺", kind: "dash", why: "位移" },
  { tag: "吞噬", kind: "devour", why: "吞噬" },
  { tag: "淨化", kind: "dispel", why: "驅散" },
  { tag: "破魔", kind: "dispel", why: "驅散魔法效果（或 applyStatus magic-break，看內文）" },
  { tag: "迴避", kind: "evasion", why: "閃避" },
  { tag: "免疫", kind: "invulnerable", why: "免疫（⚠️ 只免狀態的話走 passive.statusImmunity）" },
  { tag: "強化", kind: "applyBuff", why: "屬性增益" },
  { tag: "吸血", kind: "applyBuff", why: "lifesteal modifier" },
  { tag: "週期", kind: "delayed", why: "迴圈：count×intervalSec" },
  { tag: "反彈", field: "passive.hooks[on=onDamageTaken]", why: "反彈是被動觸發器，⛔ 不是主動 effect —— 掛 onDamageTaken" },
  { tag: "普攻時", field: "passive.hooks[on=onBasicAttack]", why: "普攻觸發器" },
  { tag: "攻擊時", field: "passive.hooks[on=onBasicAttack]", why: "普攻觸發器" },
  { tag: "機率", field: "hooks[].chance 或 weightedBranch", why: "機率住觸發器的 chance，擇一結果用 weightedBranch" },
  { tag: "屬性門檻", field: "condition（stat 條件葉）", why: "條件閘" },
  { tag: "身上有某狀態時", field: "condition（status 條件葉）", why: "條件閘（condition.target-status@1）" },
  { tag: "層數累積", field: "marks / applyStatus.stacks", why: "層數住標記或狀態的 stacks" },
  { tag: "靈氣", field: "passive.ranks[].auras", why: "光環住被動的 auras（持續軸）" },
  { tag: "AP加成", field: "amount.ratios[{stat:'ap'}]", why: "係數住 amount.ratios，⛔ 不要把算好的值烘進 flat" },
  { tag: "AP", field: "amount.ratios[{stat:'ap'}]", why: "同上" },
  { tag: "AD", field: "amount.ratios[{stat:'ad'}]", why: "同上" },
  { tag: "指向", field: "castType: targeted", why: "施放型態" },
  { tag: "指定", field: "castType: targeted", why: "施放型態" },
  { tag: "被動", field: "passive（hooks/auras 容器）", why: "被動技的機制住 passive.ranks[]，⛔ 不是 effects" },
];

/* ───────────────────────── 讀檔與快取 ───────────────────────── */

function loadJson(repoRoot, rel) {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
}

/** 剝對白 —— 與 tools/skill-remake/common.py::_mechanics_text 同一個正則（整段「…」，含跨行、含行中）。 */
function stripDialogue(text) {
  const spans = text.match(/「[^」]*」/g) ?? [];
  return { cleaned: text.replace(/「[^」]*」/g, ""), spans };
}

/** 剝 {{…}} 佔位（prose_markers._placeholderStrip：{{cd}}秒冷卻 不可以被「N秒」家族讀成時序）。 */
function stripPlaceholders(text) {
  return text.replace(/\{\{[^}]*\}\}/g, "");
}

/** 走訪整份文件，收集所有 kind ∈ effectKinds 的節點（含巢狀 onArrive/onHit/finalEffects…）。 */
function walkEffectNodes(node, kindSet, out) {
  if (Array.isArray(node)) {
    for (const x of node) walkEffectNodes(x, kindSet, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  if (typeof node.kind === "string" && kindSet.has(node.kind)) out.push(node);
  for (const v of Object.values(node)) walkEffectNodes(v, kindSet, out);
}

let abilityCache = null; // { key, value } —— POST 每一鍵都來，422 份不必每次重讀

function scanShipped(repoRoot, effectKinds) {
  let key = "";
  for (const c of EXAMPLE_COLLECTIONS) {
    try {
      key += `${c}:${statSync(join(repoRoot, "content", c, "_index.json")).mtimeMs}|`;
    } catch {
      key += `${c}:absent|`;
    }
  }
  if (abilityCache && abilityCache.key === key) return abilityCache.value;

  const kindSet = new Set(effectKinds);
  const usage = new Map(); // kind → count（跨 EXAMPLE_COLLECTIONS）
  const example = new Map(); // kind → { sourceAbility, node, bytes, tierScore, abilityScore }
  const tagVocab = new Map(); // tag → count（只算 abilities 的說明）
  let abilityCount = 0;
  for (const coll of EXAMPLE_COLLECTIONS) {
    const dir = join(repoRoot, "content", coll);
    let files = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_index.json");
    } catch {
      continue;
    }
    for (const f of files) {
      let doc;
      try {
        doc = JSON.parse(readFileSync(join(dir, f), "utf8"));
      } catch {
        continue;
      }
      if (coll === "abilities") {
        abilityCount++;
        for (const t of String(doc.description ?? "").matchAll(/\[([^\[\]{}\n]{1,12})\]/g))
          tagVocab.set(t[1], (tagVocab.get(t[1]) ?? 0) + 1);
      }
      const nodes = [];
      walkEffectNodes(doc, kindSet, nodes);
      for (const node of nodes) {
        usage.set(node.kind, (usage.get(node.kind) ?? 0) + 1);
        const json = JSON.stringify(node);
        const tierScore = /Tier"/.test(json) ? 1 : 0; // ⭐ 偏好帶級距名的節點（第〇·四守則）
        const abilityScore = coll === "abilities" ? 1 : 0; // ⭐ 技能節點優先當範例
        const prev = example.get(node.kind);
        if (
          !prev ||
          abilityScore > prev.abilityScore ||
          (abilityScore === prev.abilityScore && tierScore > prev.tierScore) ||
          (abilityScore === prev.abilityScore && tierScore === prev.tierScore && json.length < prev.bytes)
        ) {
          example.set(node.kind, {
            sourceAbility: `${coll}/${doc.id}`,
            node,
            bytes: json.length,
            tierScore,
            abilityScore,
          });
        }
      }
    }
  }

  // 狀態表（applyStatus 的 statusId 提示從這裡查，⛔ 不自己編 id）
  const statuses = [];
  try {
    const sdir = join(repoRoot, "content/status-effects");
    for (const f of readdirSync(sdir)) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      try {
        const d = JSON.parse(readFileSync(join(sdir, f), "utf8"));
        if (d.id) statuses.push({ id: String(d.id), name: String(d.name ?? "") });
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }

  const value = { usage, example, tagVocab, abilityCount, statuses };
  abilityCache = { key, value };
  return value;
}

function findStatusIds(statuses, terms) {
  const hits = new Set();
  for (const t of terms) {
    const needle = t.toLowerCase();
    for (const s of statuses) {
      if (s.id.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)) hits.add(s.id);
    }
  }
  return [...hits].sort();
}

function loadSources(repoRoot) {
  const axes = loadJson(repoRoot, "tools/skill-templates/shape_axes.json");
  const markers = loadJson(repoRoot, "tools/skill-templates/prose_markers.json");
  const caps = loadJson(repoRoot, "docs/editor-contract/ggd-runtime-capabilities.json");
  const profile = loadJson(repoRoot, "content/editor-target-profile.json");
  const dmgTiers = loadJson(repoRoot, "content/config/damage-tiers.json");
  const tierNames = Object.keys(dmgTiers.damage ?? {}); // 極小/小/中/大/極大 —— 從表讀，⛔ 不寫死
  return { axes, markers, caps, profile, tierNames };
}

/** 判斷表 vs capabilities 的對帳：kind 不在引擎名單裡的列＝失效列，誠實列出。 */
function splitValidRules(rules, effectKinds) {
  const kindSet = new Set(effectKinds);
  const valid = [];
  const invalid = [];
  for (const r of rules) {
    if (r.kind && !kindSet.has(r.kind)) invalid.push(r);
    else valid.push(r);
  }
  return { valid, invalid };
}

/* ───────────────────────── GET：參考資料 ───────────────────────── */

export async function build(repoRoot) {
  const { axes, markers, caps, profile, tierNames } = loadSources(repoRoot);
  const shipped = scanShipped(repoRoot, caps.effectKinds ?? []);

  const text = splitValidRules(TEXT_RULES, caps.effectKinds ?? []);
  const tag = splitValidRules(TAG_RULES, caps.effectKinds ?? []);

  const kindStats = (caps.effectKinds ?? []).map((k) => ({
    kind: k,
    shippedNodes: shipped.usage.get(k) ?? 0,
    exampleFrom: shipped.example.get(k)?.sourceAbility ?? null,
  }));

  const tagVocab = [...shipped.tagVocab.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([t, count]) => ({
      tag: t,
      count,
      mapped: TAG_RULES.some((r) => r.tag === t),
    }));

  return {
    meta: {
      contentVersion: profile?.content?.contentVersion ?? null,
      abilityCount: shipped.abilityCount,
      capsFingerprint: caps.fingerprint ?? null,
      tierNames,
      statusCount: shipped.statuses.length,
    },
    axes: Object.entries(axes.axes ?? {}).map(([key, v]) => ({
      axis: key,
      owner: v.owner,
      means: v.means,
      patterns: markers.markers?.[key]?.patterns ?? [],
      negative: markers.markers?.[key]?.negative ?? [],
    })),
    textRules: text.valid.map((r) => ({ pattern: r.pattern, kind: r.kind, why: r.why })),
    tagRules: tag.valid.map((r) => ({ tag: r.tag, kind: r.kind ?? null, field: r.field ?? null, why: r.why })),
    kindStats,
    tagVocab,
    honest: {
      invalidTextRules: text.invalid.map((r) => ({ pattern: r.pattern, kind: r.kind })),
      invalidTagRules: tag.invalid.map((r) => ({ tag: r.tag, kind: r.kind })),
      note:
        "建議是關鍵詞判斷表（可反駁），⛔ 不是 LLM 也不是 schema 驗證器 —— 產出的骨架要進編輯器/Zod 才算數。範例節點逐字抄自出貨 content/abilities。",
    },
  };
}

/* ───────────────────────── POST：{name, description} → 建議 ───────────────────────── */

export async function compute(repoRoot, body) {
  const t0 = Date.now();
  const name = String(body?.name ?? "").trim();
  const description = String(body?.description ?? "");
  const { axes, markers, caps, tierNames } = loadSources(repoRoot);
  const shipped = scanShipped(repoRoot, caps.effectKinds ?? []);
  const { valid: textRules } = splitValidRules(TEXT_RULES, caps.effectKinds ?? []);
  const { valid: tagRules } = splitValidRules(TAG_RULES, caps.effectKinds ?? []);

  // ① 剝對白（第〇·六守則②）再剝 {{…}} 佔位 —— 只有這一份拿去找機制
  const { cleaned: noDialogue, spans: dialogue } = stripDialogue(description);
  const mech = stripPlaceholders(noDialogue);

  // ② 標籤與句子
  const tags = [...mech.matchAll(/\[([^\[\]{}\n]{1,12})\]/g)].map((m) => m[1]);
  const sentences = mech
    .split(/[。\n；;！!？?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // ③ 宣稱側：六條軸（prose_markers 的正則 + negative）
  const axisClaims = [];
  for (const [axis, m] of Object.entries(markers.markers ?? {})) {
    for (const s of sentences) {
      if ((m.negative ?? []).some((n) => new RegExp(n).test(s))) continue;
      const hit = (m.patterns ?? []).find((p) => new RegExp(p).test(s));
      if (hit) {
        axisClaims.push({ axis, sentence: s, pattern: hit, means: axes.axes?.[axis]?.means ?? "" });
        break; // 一軸列一句代表句就夠了
      }
    }
  }

  // ④ 機制側：標籤規則 + 內文規則 → kind 建議（每一筆帶出處）
  /** kind → { kind, evidence:[], statusIdCandidates?, field 建議另收 } */
  const byKind = new Map();
  const fieldHints = [];
  const addKind = (kind, evidence, statusSearch, loopHint) => {
    const cur = byKind.get(kind) ?? { kind, evidence: [], statusIdCandidates: [], loopHint: false };
    cur.evidence.push(evidence);
    if (statusSearch) {
      for (const id of findStatusIds(shipped.statuses, statusSearch))
        if (!cur.statusIdCandidates.includes(id)) cur.statusIdCandidates.push(id);
    }
    if (loopHint) cur.loopHint = true;
    byKind.set(kind, cur);
  };

  for (const t of tags) {
    const r = tagRules.find((x) => x.tag === t);
    if (!r) continue;
    if (r.kind) addKind(r.kind, { from: "tag", text: `[${t}]`, why: r.why }, r.statusSearch);
    else fieldHints.push({ from: "tag", text: `[${t}]`, field: r.field, why: r.why });
  }
  for (const r of textRules) {
    const re = new RegExp(r.pattern);
    for (const s of sentences) {
      const m = re.exec(s);
      if (!m) continue;
      // weak 規則（泛用「造成傷害」）讓位給已經命中的形狀規則
      if (r.weak && [...byKind.keys()].some((k) => ["damageLine", "damageArea", "randomArea", "dot", "chainLightning", "comboStrikes"].includes(k)))
        break;
      addKind(r.kind, { from: "text", text: s, matched: m[0], why: r.why }, r.statusSearch, r.loopHint);
      break; // 一條規則列一句代表句
    }
  }

  // ⑤ 每個建議附出貨範例節點（逐字抄，⛔ 不自己編）
  const suggestions = [...byKind.values()].map((s) => {
    const ex = shipped.example.get(s.kind);
    return {
      kind: s.kind,
      evidence: s.evidence,
      statusIdCandidates: s.statusIdCandidates,
      loopHint: s.loopHint,
      shippedNodes: shipped.usage.get(s.kind) ?? 0,
      example: ex ? { sourceAbility: ex.sourceAbility, node: ex.node } : null,
    };
  });

  // ⑥ 組骨架：頂層欄位 + 範例節點。級距欄一律「選一格」，⛔ 不烘數字（第〇·四守則）
  const tierPick = `《選一格：${tierNames.join("|")}》`;
  const castType = tags.includes("指向") || tags.includes("指定")
    ? "targeted"
    : tags.some((t) => ["範圍", "周圍", "小範圍", "大範圍"].includes(t))
      ? "ground"
      : "self";
  const isPassive = tags.includes("被動");
  const skeleton = {
    id: "godie-XXXX.q",
    schema: "ability@1",
    name: name || "（技能名）",
    provenance: "owner-spec",
    description,
    slot: "Q",
    castType,
    maxRank: 4,
    cooldownTier: tierPick,
    manaCostTier: tierPick,
    rangeTier: tierPick,
    effects: isPassive ? [] : suggestions.filter((s) => s.example).map((s) => s.example.node),
  };
  if (isPassive) {
    skeleton.passive = {
      note: "[被動] ⇒ 機制住 passive.ranks[]（hooks/auras），⛔ 不是 effects — 右側建議節點供觸發後的 effects 參考",
    };
  }

  // ⑦ 誠實段：沒對到的標籤、宣稱了軸但一個建議都沒有的
  const unknownTags = [...new Set(tags.filter((t) => !tagRules.some((r) => r.tag === t)))];
  const claimedAxesWithoutSuggestion = axisClaims
    .filter(() => suggestions.length === 0)
    .map((c) => c.axis);

  return {
    input: { name, descriptionChars: description.length },
    dialogueStripped: dialogue,
    tags,
    axisClaims,
    suggestions,
    fieldHints,
    skeleton,
    honest: {
      unknownTags,
      claimedAxesWithoutSuggestion: [...new Set(claimedAxesWithoutSuggestion)],
      note: "骨架的 effects 逐字抄自出貨技能的節點（來源見各建議的 example.sourceAbility）—— 參數要自己改；級距欄要選一格級距名，⛔ 不要填算好的數字。",
    },
    _live: { computedAt: new Date().toISOString(), ms: Date.now() - t0, via: "compute" },
  };
}
