/**
 * 🔊 sfx-map —— 技能音效對照（技能 → 施放音／特效發射音／命中音／落點音）。
 *
 * 只做 join，⛔ 不重算任何解析邏輯（第〇·四守則）：
 *   · 施放音   = `content/abilities/*.json` 的 `sfxKey`（或 ability-sfx-cues.json 的
 *     bindings 覆蓋層 —— 文件沒填時才用）。沒填的技能執行期會退回「元素 whoosh →
 *     通用 abilityCast 池」（那條退路住 apps/client/src/audio/combatSfx.ts，
 *     這裡**不**重算它 —— 只標「元素/通用」）。
 *   · 特效發射音/命中音/循環/消散 = `content/config/vfx-families.json` 的
 *     abilities[id] 覆寫 → families[family] 原型（覆寫贏，與 resolveVfxSound 同向）。
 *   · 模型音 = effects 裡 spawnModelFx 的 `soundKey`（施放）與 `arriveSoundKey`（落點）。
 *   · 每一個 key 都對 `content/config/audio-map.json` 的 sfx 表驗存在；
 *     `sfxKey` 另外對 ability-sfx-cues.json 的 cues 名單驗（執行期沒宣告會被退回）。
 *   · 建議欄 = tools/sfx-bind/SUGGESTED_SFX_KEYS.json（suggest_keys.py 的產物，唯讀引用）。
 *
 * 零綁定（施放/特效/模型三個通道全空）= 這支技能只會發通用池的聲音 —— 頁面標紅。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ABILITY_DIR = "content/abilities";
const CHAMPION_DIR = "content/champions";
const STATIC_DEPS = [
  "content/config/audio-map.json",
  "content/config/vfx-families.json",
  "content/audio-manifests/ability-sfx-cues.json",
  "tools/sfx-bind/SUGGESTED_SFX_KEYS.json",
  "tools/sfx-bind/UNPORTED_SFX_LEDGER.json",
];

function listJson(repoRoot, dir) {
  const abs = join(repoRoot, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => `${dir}/${f}`);
}

/**
 * ⭐ GH#821 寫入宣告 —— POST /__live/sfx-map/save。
 * 施放音綁定**真正的家**是技能文件的 `sfxKey`（build_bindings.py 檔頭逐字：
 * "WHERE THE BINDING ACTUALLY LIVES: content/abilities/<id>.json's sfxKey"）——
 * ⛔ 不寫 ability-sfx-cues.json（那是 sfxbind:build 的產物，寫了下一次 sync 打回來）。
 * ⚠️ content/abilities 是**混的**（105 份有作者）—— 寫入端逐次 spawn genguard 裁決；
 * 產物會 409 並指名擁有者，手編檔放行（附正規化器提醒）。
 * check：cue 要在 cues 名單＋audio-map 都查得到（執行期查不到會被靜默退回通用池）。
 */
export const write = {
  kind: "source",
  rules: [
    {
      paths: ["content/abilities/*.json"],
      pointers: ["/sfxKey"],
      value: { type: "string", maxLen: 64, nullable: true },
      why: "施放音 cue（null＝移除綁定，退回元素/通用池）",
      check(repoRoot, { value }) {
        if (value === null) return null;
        const cues = JSON.parse(readFileSync(join(repoRoot, "content/audio-manifests/ability-sfx-cues.json"), "utf8"));
        if (!Object.prototype.hasOwnProperty.call(cues.cues ?? {}, value))
          return `「${value}」不在 cues 名單（audio.ability-sfx-cues@1）—— 執行期會被退回通用池，存了等於謊話`;
        const am = JSON.parse(readFileSync(join(repoRoot, "content/config/audio-map.json"), "utf8"));
        if (!Object.prototype.hasOwnProperty.call(am.sfx ?? {}, value))
          return `「${value}」不在 audio-map 的 sfx 表 —— 沒有檔案可播`;
        return null;
      },
    },
  ],
};

/**
 * deps 逐檔列名（⛔ 不是只列目錄）：目錄的 mtime 只在增刪檔時動，
 * 改一支技能的 sfxKey 不會動它 —— 只列目錄的話這一頁就變回「靜態內容」。
 * 目錄本身也列（抓增刪檔）。
 */
export function deps(repoRoot) {
  return [
    ABILITY_DIR,
    CHAMPION_DIR,
    ...listJson(repoRoot, ABILITY_DIR),
    ...listJson(repoRoot, CHAMPION_DIR),
    ...STATIC_DEPS,
  ];
}

function readJson(repoRoot, rel) {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
}

export async function build(repoRoot) {
  const errors = [];
  const safe = (rel) => {
    try {
      return readJson(repoRoot, rel);
    } catch (err) {
      errors.push(`${rel}: ${String(err)}`);
      return null;
    }
  };

  const audioMap = safe("content/config/audio-map.json");
  const vf = safe("content/config/vfx-families.json");
  const cuesDoc = safe("content/audio-manifests/ability-sfx-cues.json");
  const sugDoc = safe("tools/sfx-bind/SUGGESTED_SFX_KEYS.json");
  const unportedDoc = safe("tools/sfx-bind/UNPORTED_SFX_LEDGER.json");

  const sfxTable = (audioMap && audioMap.sfx) || {};
  const inAudioMap = (k) => Object.prototype.hasOwnProperty.call(sfxTable, k);
  // cues 是 dict（cue key → {ggSnd, origin, note}），名單＝它的 key 集合。
  const cueSet = new Set(Object.keys((cuesDoc && cuesDoc.cues) || {}));
  const overlayBindings = (cuesDoc && cuesDoc.bindings) || {};
  const families = (vf && vf.families) || {};
  const vfAbilities = (vf && vf.abilities) || {};

  /** 建議表：ability id → 摘要（唯讀引用產生器產物，⛔ 不重算）。 */
  const suggestions = new Map();
  for (const s of (sugDoc && sugDoc.suggestions) || []) {
    suggestions.set(s.ability, {
      key: s.sfxKey ?? null,
      tier: s.tier ?? null,
      applicable: s.applicable === true,
      needsCueDeclaration: s.needsCueDeclaration === true,
    });
  }

  /** champion id → 名稱（從 content/champions 掃；技能歸屬用 id 前綴 join）。 */
  const championNames = new Map();
  for (const rel of listJson(repoRoot, CHAMPION_DIR)) {
    const doc = safe(rel);
    if (doc && typeof doc.id === "string") championNames.set(doc.id, doc.name ?? doc.id);
  }

  /** 走 effects 樹收 spawnModelFx 的 soundKey / arriveSoundKey。 */
  const collectModelSounds = (node, out) => {
    if (Array.isArray(node)) {
      for (const v of node) collectModelSounds(v, out);
      return;
    }
    if (node === null || typeof node !== "object") return;
    if (typeof node.soundKey === "string") out.push({ when: "launch", key: node.soundKey });
    if (typeof node.arriveSoundKey === "string") out.push({ when: "arrive", key: node.arriveSoundKey });
    for (const v of Object.values(node)) collectModelSounds(v, out);
  };

  const rows = [];
  for (const rel of listJson(repoRoot, ABILITY_DIR)) {
    const doc = safe(rel);
    if (!doc || typeof doc.id !== "string") continue;
    const id = doc.id;
    const champId = id.includes(".") ? id.slice(0, id.indexOf(".")) : id;
    const bad = [];

    // ── 施放音（宣告層）─────────────────────────────────────────────
    let cast = null;
    let castSrc = null;
    if (typeof doc.sfxKey === "string") {
      cast = doc.sfxKey;
      castSrc = "doc";
    } else if (typeof overlayBindings[id] === "string") {
      cast = overlayBindings[id];
      castSrc = "overlay";
    }
    if (cast !== null) {
      if (!cueSet.has(cast)) bad.push(`施放音 ${cast}（不在 cues 名單，執行期會被退回）`);
      else if (!inAudioMap(cast)) bad.push(`施放音 ${cast}（audio-map 查無此 key）`);
    }

    // ── 特效層（覆寫 > 家族，與 resolveVfxSound 同向）───────────────
    const ov = vfAbilities[id];
    const famKey = ov && typeof ov.family === "string" ? ov.family : null;
    const fam = famKey !== null ? (families[famKey] ?? null) : null;
    const pick = (field) => {
      if (ov && typeof ov[field] === "string") return { key: ov[field], src: "覆寫" };
      if (fam && typeof fam[field] === "string") return { key: fam[field], src: "家族" };
      return null;
    };
    const launch = pick("soundLaunch");
    const impact = pick("soundImpact");
    const loop = pick("soundLoop");
    const dissipate = pick("soundDissipate");
    for (const [label, hit] of [
      ["發射音", launch],
      ["命中音", impact],
      ["循環音", loop],
      ["消散音", dissipate],
    ]) {
      if (hit && !inAudioMap(hit.key)) bad.push(`${label} ${hit.key}（audio-map 查無此 key）`);
    }

    // ── 模型音（spawnModelFx）───────────────────────────────────────
    const model = [];
    collectModelSounds(doc.effects ?? [], model);
    for (const m of model) {
      if (!inAudioMap(m.key))
        bad.push(`模型${m.when === "arrive" ? "落點" : "施放"}音 ${m.key}（audio-map 查無此 key）`);
    }

    const silent = cast === null && launch === null && impact === null && loop === null && dissipate === null && model.length === 0;

    rows.push({
      id,
      name: doc.name ?? id,
      slot: doc.slot ?? "—",
      champ: champId,
      champName: championNames.get(champId) ?? null,
      cast,
      castSrc,
      fam: famKey,
      launch,
      impact,
      loop,
      dissipate,
      model,
      sug: suggestions.get(id) ?? null,
      bad,
      silent,
    });
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const count = (fn) => rows.filter(fn).length;
  return {
    id: "sfx-map",
    stats: {
      abilities: rows.length,
      cast: count((r) => r.cast !== null),
      vfxLaunch: count((r) => r.launch !== null),
      vfxImpact: count((r) => r.impact !== null),
      loopOrDissipate: count((r) => r.loop !== null || r.dissipate !== null),
      modelSound: count((r) => r.model.length > 0),
      silent: count((r) => r.silent),
      broken: count((r) => r.bad.length > 0),
      audioMapKeys: Object.keys(sfxTable).length,
      declaredCues: cueSet.size,
      suggestionCensus: (sugDoc && sugDoc.summary && sugDoc.summary.census) ?? null,
    },
    rows,
    unported: ((unportedDoc && unportedDoc.abilities) || []).map((u) => ({
      ability: u.ability,
      name: u.name ?? u.ability,
      champion: u.champion ?? "—",
      reservedCue: u.reservedCue ?? null,
    })),
    errors,
  };
}
