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
 *     ⭐ GH#827 起連**節點的 JSON pointer** 一起送（`rows[].modelFx`）—— 那是「可寫的
 *     那一格」的地址，所以空的兩格也在裡面（⛔ 不是只送已經填了的值）。
 *   · 每一個 key 都對 `content/config/audio-map.json` 的 sfx 表驗存在；
 *     `sfxKey` 另外對 ability-sfx-cues.json 的 cues 名單驗（執行期沒宣告會被退回）。
 *   · 建議欄 = tools/sfx-bind/SUGGESTED_SFX_KEYS.json（suggest_keys.py 的產物，唯讀引用）。
 *
 * 零綁定（施放/特效/模型三個通道全空）= 這支技能只會發通用池的聲音 —— 頁面標紅。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ABILITY_DIR = "content/abilities";
const CHAMPION_DIR = "content/champions";
const AUDIO_MAP = "content/config/audio-map.json";
const VFX_FAMILIES = "content/config/vfx-families.json";
const STATIC_DEPS = [
  AUDIO_MAP,
  VFX_FAMILIES,
  "content/audio-manifests/ability-sfx-cues.json",
  "tools/sfx-bind/SUGGESTED_SFX_KEYS.json",
  "tools/sfx-bind/UNPORTED_SFX_LEDGER.json",
  // ⭐ genguard 的**擁有者表** —— 「特效音效綁定那四欄改不改得動」是**它**回答的
  //    （見下面的 `genguardVerdict`），所以它變了這一頁就要重算。
  //    ⛔ 不是把那個答案寫成一句散文 —— 那句話會活過它的保存期限而沒有東西變紅。
  "tools/parallel-gates/sync-io.json",
  "tools/parallel-gates/normalizers.json",
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
 * 一顆 key 在執行期**真的播得出來**嗎（⛔ 不是「audio-map 有這個鍵」）。
 *
 * ⚠️ 判準抄自出貨的 `apps/client/src/audio/vfxSound.ts` 的 `serveable()`：它要
 * `sfx[key].files` 是**非空陣列**，否則整格被當成「這一格沒填」**靜默丟掉** ——
 * 存得下、頁上看得到、遊戲裡零聲音，正是第一·五守則要擋的形狀。
 * ⭐ 一個住處：施放音與模型音兩條規則共用它（⛔ 不要兩份會各自漂的判準）。
 */
function sfxServeable(repoRoot, key) {
  const am = JSON.parse(readFileSync(join(repoRoot, AUDIO_MAP), "utf8"));
  const entry = (am.sfx ?? {})[key];
  if (entry === undefined) return `「${key}」不在 audio-map 的 sfx 表 —— 沒有檔案可播`;
  if (!Array.isArray(entry.files) || entry.files.length === 0)
    return `「${key}」在 audio-map 有一列、但 files 是空的 —— vfxSound.serveable() 會把它當成「沒填」靜默丟掉`;
  return null;
}

/**
 * ⭐ GH#821 / GH#827 寫入宣告 —— POST /__live/sfx-map/save。
 *
 * ① **施放音**綁定的家是技能文件的 `sfxKey`（build_bindings.py 檔頭逐字：
 *    "WHERE THE BINDING ACTUALLY LIVES: content/abilities/<id>.json's sfxKey"）——
 *    ⛔ 不寫 ability-sfx-cues.json（那是 sfxbind:build 的產物，寫了下一次 sync 打回來）。
 * ② ⭐ **GH#827 —— 模型特效自帶的音效**（owner 2026-08-20 逐字點名的「特效音效綁定」
 *    的那一半）：`spawnModelFx` 節點上的 `soundKey`（施放）與 `arriveSoundKey`（落點）。
 *    ⚠️ 它們**不是**另一個分類 —— `apps/client/src/audio/modelFxSound.ts:69` 逐字寫著
 *    「`soundKey` = 施放那一刻 ⇒ **特效發射**；`arriveSoundKey` = 落點 ⇒ **特效命中**」。
 *    ⭐ 量到的母體（⛔ 不是估的）：出貨內容 **77 個 spawnModelFx 節點，全部在
 *    `/effects/<i>`（零個巢狀）**，其中 **30 個兩格全空** —— 那 30 個就是「改不動」。
 *    ⇒ 這一條同時開了「改」與「補」（共用寫入端會在既有物件上新增那一格）。
 *
 * ⚠️ content/abilities 是**混的**（54 份帶 spawnModelFx 的檔裡 42 份手編、12 份是
 * skillremake:json 的產物）—— 寫入端逐次 spawn genguard 裁決：產物 409 並指名擁有者，
 * 手編檔放行。⛔ 這裡不抄那張表。
 *
 * ⛔ **特效家族音（發射/命中/循環/消散）不在這裡** —— 它們住
 * `content/config/vfx-families.json`，而那是 `vfxfam:build` 的產物 ⇒ 照第〇·六守則
 * **擋下來並指名**（`genguardVerdict()` 當場問，答案畫在頁上）。
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
        return sfxServeable(repoRoot, value);
      },
    },
    {
      paths: ["content/abilities/*.json"],
      pointers: ["/effects/*/soundKey", "/effects/*/arriveSoundKey"],
      // 出貨 schema（schema/effects/spawnModelFx.ts）是 `z.string().min(1).optional()`
      // —— ⛔ 沒有上界，所以 64 是**收窄**不是放寬；null＝刪掉這一格（欄位是 optional）。
      value: { type: "string", maxLen: 64, nullable: true },
      why: "模型特效自帶的音效：soundKey＝施放那一刻（特效發射層）／arriveSoundKey＝落點那一刻（特效命中層）。null＝移除",
      check(repoRoot, { path, pointer, value }) {
        const segs = pointer.split("/").filter((s) => s !== ""); // ["effects", "<i>", "<欄位>"]
        const doc = JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
        const node = (doc.effects ?? [])[Number(segs[1])];
        if (node === undefined || node === null || typeof node !== "object")
          return `${path} 的 effects[${segs[1]}] 不存在 —— 共用寫入端⛔不創造中途節點`;
        // ⭐ 只有 spawnModelFx 讀得到這兩格（modelFxSound.ts 的 readModelFxSoundEvent）。
        //   填在別的 kind 上：schema 的 `.strict()` 會拒收，而在它拒收之前這一頁會
        //   先畫出一個「已存」——⛔ 那就是卡片上說了但不會發生的字。
        if (node.kind !== "spawnModelFx")
          return `effects[${segs[1]}] 的 kind 是 ${String(node.kind)}，⛔ 不是 spawnModelFx —— 只有這一族讀得到 ${segs[2]}（apps/client/src/audio/modelFxSound.ts）`;
        if (value === null) return null;
        return sfxServeable(repoRoot, value);
      },
    },
  ],
};

/**
 * ⭐ 「這個落點改不改得動」**當場問 genguard**，⛔ 不是在這裡寫一句散文。
 *
 * 理由是元規則：一句「vfx-families 是產物」的註解會活過它的保存期限而**沒有東西變紅**；
 * 而 genguard 是**量出來的**擁有者表（`tools/parallel-gates/sync-io.json`）的唯一問法，
 * 也正是共用寫入端落盤前會跑的同一支腳本 ⇒ 頁上顯示的裁決與存檔時的裁決不可能打架。
 *
 * ⚠️ fail-open（跑不起來就當成「不可寫」）但**不靜默**：`asked:false` 會畫在頁上。
 */
function genguardVerdict(repoRoot, rel) {
  try {
    const r = spawnSync("bash", ["scripts/genguard.sh", rel], { cwd: repoRoot, encoding: "utf8", timeout: 20000 });
    if (r.error) return { asked: false, blocked: null, owner: null, message: `genguard 跑不起來：${String(r.error.message)}` };
    const message = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
    return {
      asked: true,
      blocked: r.status !== 0,
      // 訊息形狀：「🚫 <path> 是產生器 **<step>** 的產物 —— …」
      owner: /產生器\s*\*\*([^*]+)\*\*/.exec(message)?.[1] ?? null,
      message,
    };
  } catch (err) {
    return { asked: false, blocked: null, owner: null, message: `genguard 跑不起來：${String(err)}` };
  }
}

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

  /**
   * 走 effects 樹收 **spawnModelFx 節點本身**，連同它的 **JSON pointer** ——
   * ⭐ 那個 pointer 就是「可寫的那一格」的地址（GH#827）。
   * ⛔ 在此之前這裡只收「已經填了的值」⇒ **空的那一格連地址都沒有** ⇒ 頁上改不動也補不了。
   * ⚠️ 兩格都空的節點也要收（量到 77 個節點裡 30 個是這一種）。
   */
  const collectModelFx = (node, ptr, out) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => collectModelFx(v, `${ptr}/${i}`, out));
      return;
    }
    if (node === null || typeof node !== "object") return;
    if (node.kind === "spawnModelFx")
      out.push({
        ptr,
        model: typeof node.modelKey === "string" ? node.modelKey : typeof node.preset === "string" ? node.preset : null,
        launch: typeof node.soundKey === "string" ? node.soundKey : null,
        arrive: typeof node.arriveSoundKey === "string" ? node.arriveSoundKey : null,
      });
    for (const [k, v] of Object.entries(node)) collectModelFx(v, `${ptr}/${k}`, out);
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
    const modelFx = [];
    collectModelFx(doc.effects ?? [], "/effects", modelFx);
    // `model` = **已經填了的**那些（統計／壞引用／零綁定判定的母體不變）；
    // `modelFx` = **每一個節點的兩格**（含空的）—— 那是可編輯的那一份。
    const model = [];
    for (const n of modelFx) {
      if (n.launch !== null) model.push({ when: "launch", key: n.launch });
      if (n.arrive !== null) model.push({ when: "arrive", key: n.arrive });
    }
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
      modelFx,
      sug: suggestions.get(id) ?? null,
      bad,
      silent,
    });
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // ⭐ 「特效音效綁定那四欄改不改得動」—— 問 genguard，⛔ 不猜（一次 spawn，結果進 checksum 快取）。
  const vfxGate = genguardVerdict(repoRoot, VFX_FAMILIES);
  const modelFxNodes = rows.reduce((n, r) => n + r.modelFx.length, 0);
  const modelFxEmptySlots = rows.reduce(
    (n, r) => n + r.modelFx.reduce((k, m) => k + (m.launch === null ? 1 : 0) + (m.arrive === null ? 1 : 0), 0),
    0,
  );

  const count = (fn) => rows.filter(fn).length;
  return {
    id: "sfx-map",
    /**
     * ⭐ 逐欄「這一格的家在哪、改不改得動」—— 頁面的編輯權由**這裡**決定，
     * ⛔ 不是前端自己判斷（兩個住處會漂）。`editable` 對 vfx 那一列是 genguard 當場答的。
     */
    soundHomes: {
      model: {
        path: `${ABILITY_DIR}/<技能 id>.json`,
        pointers: ["/effects/<i>/soundKey", "/effects/<i>/arriveSoundKey"],
        editable: true,
        note:
          "模型特效自帶的音效（modelFxSound.ts：soundKey＝特效發射層／arriveSoundKey＝特效命中層）。" +
          "content/abilities 是混編目錄 ⇒ 存的那一刻共用寫入端逐檔 spawn genguard：產物 409 並指名擁有者。",
      },
      vfx: {
        path: VFX_FAMILIES,
        pointers: ["/families/<家族>/sound{Launch,Impact,Loop,Dissipate}", "/abilities/<技能 id>/sound…"],
        editable: vfxGate.asked === true && vfxGate.blocked === false,
        asked: vfxGate.asked,
        owner: vfxGate.owner,
        genguard: vfxGate.message,
        note:
          "⛔ 這四欄的落點是產生器產物 ⇒ 照第〇·六守則**擋下來並指名**，這一頁不給一格永遠存不進去的 ✏️。" +
          " ⚠️ 而它的**欄位級**擁有者是另一支：tools/w3x-import/build_vfx_sound_bindings.py" +
          "（vfxfam:build 的 mergeRow() 只擁有 primitive/element/scale/alpha/timeScale/heightY，sound* 是逐格保留的）" +
          " —— genguard 的擁有者表是**檔案級**的，所以整份被擋。要改就改那支的來源再重生成。",
      },
    },
    stats: {
      abilities: rows.length,
      modelFxNodes,
      modelFxEmptySlots,
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
