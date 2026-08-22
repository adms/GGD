/**
 * tools/sfx-bind/ownership —— 「**這個音檔本來屬於誰**」，以及誰在播別人的音檔。
 *
 * GH#568。owner 2026-08-23 逐字：
 *
 *   「**音效錯用**: 莉娜施展技能 竟然出現**皮卡丘 皮卡皮卡、男人喊叫聲**，打死敵人出現
 *    **皮卡丘、臭作 get you** 音效等⋯**明明場上沒有皮卡丘卻一直有皮卡丘、多拉A夢聲音**」
 *   「莉娜只要施展技能就聽到皮卡丘、蒼月潮，殺死單位就聽到臭作聲音，
 *    **似乎跟這是獨立分開 issue**」
 *
 * ⭐ 最後那一句是這支模組存在的理由：這**不是**「音效停不下來」（#581/#582/#583），
 * 是**播出來的就是別的角色的音檔**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 「屬於誰」是**推導**出來的，⛔ 不是一張手寫名單
 * ═══════════════════════════════════════════════════════════════════════════
 * 兩個來源，都是出貨的東西，兩個都可以被反駁：
 *
 *   ① `content/config/champion-voices.json` —— 一位英雄的 `select` clip 就是**他自己
 *      的聲音**（`source: "map-quip"` = 原作地圖裡那一句台詞）。這是內容自己的宣告。
 *   ② `SFX_BINDINGS.json`（war3map.j 掃描）—— JASS 把某個 gg_snd 綁在英雄 X 的技能上
 *      ⇒ 那個 clip 是 X 的施法聲。
 *
 * ⚠️ ⭐ **只有 map-import 的 clip 會有主人。** 暴雪零售 MPQ 的音效（`wc3.peondeath`
 * 那一族）是**通用音效**，沒有角色 —— 判準是 `wc3_path` 的 `war3mapImported\` 前綴，
 * ⛔ 不是 `kind` 標籤（`build_bindings.py` 的檔頭記著它說謊兩次）。
 * ⛔ 也不是一張「哪些是角色音」的名單 —— 名單會過期，前綴不會。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 出貨的施法音路由（`combatSfx.ts` 的 `abilityCast` 分支，逐字）
 * ═══════════════════════════════════════════════════════════════════════════
 *     abilitySfxCueForAbility(abilityId)   ← ability-sfx-cues.json 的 bindings 覆蓋層
 *  ?? wc3CastKey(sfxKey)                   ← 技能文件自己的 sfxKey
 *  ?? castElementKey(vfxKey)               ← 元素風聲（只有 fire / ice / lightning）
 *  ?? "abilityCast"                        ← ⚠️ **通用退路**
 *
 * ⭐ 根因就在最後那一格：`abilityCast` 在 audio-map 裡是一個 **3 個檔的隨機池**，
 * 而那三個檔全部有主人（蒼月潮 ×2、皮卡娘 ×1）。所以「沒有專屬施法音的技能」
 * ＝「隨機播蒼月潮或皮卡娘的聲音」。莉娜六支技能一支 `sfxKey` 都沒有。
 *
 * ⛔ 這一支**只量，不修** —— 修哪一格是 owner 的裁決（#568 的表拿給他審）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SFX_REACHABILITY, type SfxReachRow } from "../../apps/client/src/audio/sfxReachability";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "../..");

/** 元素風聲的三個 key —— 與 `combatSfx.ts` 的 `ELEMENT_SFX` 同一份事實。 */
const ELEMENT_SFX: Record<string, string> = {
  fire: "magicFire",
  ice: "magicIce",
  lightning: "magicLightning",
};
const GENERIC_CAST_CUE = "abilityCast";
/** 原作地圖自己匯入的檔案前綴 —— 只有這一種 clip 會有「主人」。 */
const MAP_IMPORT_PREFIX = "war3mapimported\\";

const readJson = (rel: string): any => JSON.parse(readFileSync(join(REPO, rel), "utf8"));

export interface Champion {
  readonly id: string;
  readonly name: string;
  readonly modelKey: string;
}
export interface Ability {
  readonly id: string;
  readonly champion: string;
  readonly name: string;
  readonly sfxKey?: string;
  readonly vfxKey?: string;
}
/** 一個 clip 的主人，以及**憑什麼**這樣說。 */
export interface ClipOwner {
  readonly clip: string;
  readonly champions: readonly string[];
  readonly via: readonly string[];
}
/** 一列綁定 = 「誰 · 什麼時機 · 哪一個 cue · 哪幾個檔 · 檔案本來屬於誰」。 */
export interface BindingRow {
  readonly actor: string; // 英雄 id，或 "*" = 每一位英雄
  readonly actorName: string;
  readonly subject: string; // 技能 id / cue / "—"
  readonly subjectName: string;
  readonly when: string;
  readonly cue: string;
  readonly files: readonly string[];
  readonly owners: readonly ClipOwner[]; // 只列**有主人**的檔
  readonly surface: string; // 這一列住在哪一個檔
  readonly foreign: readonly ClipOwner[]; // owners 裡不含 actor 的那些 ⇒ 跨角色誤用
}

export interface Model {
  readonly champions: ReadonlyMap<string, Champion>;
  readonly abilities: readonly Ability[];
  readonly cueFiles: ReadonlyMap<string, readonly string[]>;
  readonly cueGate: ReadonlyMap<string, { gain?: number; cooldownMs?: number; maxConcurrent?: number }>;
  readonly clipOwners: ReadonlyMap<string, ClipOwner>;
  readonly reach: ReadonlyMap<string, SfxReachRow>;
  readonly rows: readonly BindingRow[];
  /** 每一支技能一發施法實際會響的 cue 疊層（同一次施法的所有聲音）。 */
  readonly castStack: ReadonlyMap<string, readonly { cue: string; layer: string }[]>;
}

// ── 載入 ───────────────────────────────────────────────────────────────────────
function loadChampions(): Map<string, Champion> {
  const out = new Map<string, Champion>();
  for (const f of readdirSync(join(REPO, "content/champions")).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const d = JSON.parse(readFileSync(join(REPO, "content/champions", f), "utf8"));
    if (d?.id) out.set(d.id, { id: d.id, name: d.name ?? d.id, modelKey: d.modelKey ?? "" });
  }
  return out;
}

function loadAbilities(): Ability[] {
  const out: Ability[] = [];
  for (const f of readdirSync(join(REPO, "content/abilities")).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const d = JSON.parse(readFileSync(join(REPO, "content/abilities", f), "utf8"));
    if (!d?.id) continue;
    out.push({
      id: d.id,
      champion: String(d.id).split(".")[0]!,
      name: d.name ?? d.id,
      sfxKey: d.sfxKey ?? undefined,
      vfxKey: d.vfxKey ?? undefined,
    });
  }
  return out;
}

/**
 * clip → 主人。⭐ 兩個來源合併，每一列帶著它的 `via`（憑什麼）。
 * ⛔ 沒有第三個來源，也⛔ 沒有任何一列是手寫的。
 */
export function deriveClipOwners(
  cueFiles: ReadonlyMap<string, readonly string[]>,
): Map<string, ClipOwner> {
  const champs = new Map<string, Set<string>>();
  const via = new Map<string, Set<string>>();
  const add = (clip: string, cid: string, why: string): void => {
    if (!champs.has(clip)) champs.set(clip, new Set());
    if (!via.has(clip)) via.set(clip, new Set());
    champs.get(clip)!.add(cid);
    via.get(clip)!.add(why);
  };

  // ① 內容自己的宣告：這位英雄的 select 台詞
  const voices = readJson("content/config/champion-voices.json").champions as Record<
    string,
    { select?: string[]; source?: string }
  >;
  for (const [cid, v] of Object.entries(voices)) {
    for (const clip of v.select ?? []) add(clip, cid, `champion-voices.${cid}.select`);
  }

  // ② JASS：這個 gg_snd 掛在這位英雄的技能上（⭐ 只認 map-import，見檔頭）
  const scan = readJson("tools/w3x-import/out/GoDieEX22s-src/SFX_BINDINGS.json") as {
    abilities: { ability: string; sounds: { gg_snd: string; wc3_path: string }[] }[];
  };
  const cueOf = (gg: string): string =>
    `wc3.${(gg.startsWith("gg_snd_") ? gg.slice(7) : gg).toLowerCase()}`;
  for (const ab of scan.abilities) {
    const cid = ab.ability.split(".")[0]!;
    for (const s of ab.sounds) {
      const path = s.wc3_path.replace(/\\\\/g, "\\").toLowerCase();
      if (!path.startsWith(MAP_IMPORT_PREFIX)) continue; // 暴雪零售音效沒有主人
      for (const clip of cueFiles.get(cueOf(s.gg_snd)) ?? []) {
        add(clip, cid, `JASS ${ab.ability} → ${s.gg_snd}`);
      }
    }
  }

  const out = new Map<string, ClipOwner>();
  for (const [clip, set] of champs) {
    out.set(clip, { clip, champions: [...set].sort(), via: [...via.get(clip)!].sort() });
  }
  return out;
}

/** 出貨的施法音路由，逐字照 `combatSfx.ts` 的 `abilityCast` 分支。 */
export function castCueFor(
  ab: Ability,
  overlay: ReadonlyMap<string, string>,
): { cue: string; route: string } {
  const ov = overlay.get(ab.id);
  if (ov) return { cue: ov, route: "ability-sfx-cues.bindings 覆蓋層" };
  if (ab.sfxKey) return { cue: ab.sfxKey, route: "技能文件的 sfxKey" };
  const el = ab.vfxKey ? castElement(ab.vfxKey) : null;
  if (el) return { cue: el, route: "元素風聲（vfxKey）" };
  return { cue: GENERIC_CAST_CUE, route: "⚠️ 通用退路（沒有專屬音）" };
}
function castElement(vfxKey: string): string | null {
  const p = vfxKey.split(".");
  if (p[0] !== "fx" || p[1] !== "prim" || p[2] === undefined) return null;
  return ELEMENT_SFX[p[2]] ?? null;
}

/**
 * 一個 cue 是不是**通用**的 —— 每一位英雄身上都可能響。
 * ⭐ 判準從出貨的註冊表推導：`combat` 列的 payload 裡有 `sfxKey` ⇒ 它是**逐技能**挑的；
 * 其餘（含每一列 `client`）都是「誰觸發都一樣」。⛔ 不是一張手寫的通用 cue 名單。
 */
export function isGenericCue(row: SfxReachRow | undefined): boolean {
  if (!row || row.kind === "unreachable") return false;
  const payload = row.payload ?? {};
  return !Object.values(payload).some((fields) => fields.includes("sfxKey"));
}

export function buildModel(): Model {
  const champions = loadChampions();
  const abilities = loadAbilities();
  const audioMap = readJson("content/config/audio-map.json").sfx as Record<
    string,
    { files?: string[]; gain?: number; cooldownMs?: number; maxConcurrent?: number }
  >;
  const cueFiles = new Map<string, readonly string[]>();
  const cueGate = new Map<string, { gain?: number; cooldownMs?: number; maxConcurrent?: number }>();
  for (const [k, v] of Object.entries(audioMap)) {
    cueFiles.set(k, v.files ?? []);
    cueGate.set(k, { gain: v.gain, cooldownMs: v.cooldownMs, maxConcurrent: v.maxConcurrent });
  }
  const clipOwners = deriveClipOwners(cueFiles);
  const reach = new Map(SFX_REACHABILITY.map((r) => [r.key, r]));
  const overlay = new Map<string, string>(
    Object.entries(
      (readJson("content/audio-manifests/ability-sfx-cues.json").bindings ?? {}) as Record<
        string,
        string
      >,
    ),
  );
  const vfx = readJson("content/config/vfx-families.json") as {
    soundEnabled?: boolean;
    families: Record<string, Record<string, unknown>>;
    abilities: Record<string, Record<string, unknown>>;
  };

  const rows: BindingRow[] = [];
  const nameOf = (cid: string): string => champions.get(cid)?.name ?? cid;
  const push = (r: Omit<BindingRow, "owners" | "files" | "foreign">): void => {
    const files = cueFiles.get(r.cue) ?? [];
    const owners = files.map((f) => clipOwners.get(f)).filter((o): o is ClipOwner => !!o);
    const foreign = owners.filter((o) => r.actor === "*" || !o.champions.includes(r.actor));
    rows.push({ ...r, files, owners, foreign });
  };

  // ── ① 施法音（每一支技能一列，走出貨的那條路由） ────────────────────────
  const castStack = new Map<string, { cue: string; layer: string }[]>();
  for (const ab of abilities) {
    const { cue, route } = castCueFor(ab, overlay);
    push({
      actor: ab.champion,
      actorName: nameOf(ab.champion),
      subject: ab.id,
      subjectName: ab.name,
      when: `施法（abilityCast）· ${route}`,
      cue,
      surface: overlay.has(ab.id)
        ? "content/audio-manifests/ability-sfx-cues.json"
        : ab.sfxKey
          ? "content/abilities/*.json .sfxKey"
          : "content/config/audio-map.json（退路）",
    });
    const stack: { cue: string; layer: string }[] = [{ cue, layer: "施法音" }];
    // ── ② 特效自帶的音（家族 + 逐支覆寫，precedence 同 resolveVfxSound） ──
    if (vfx.soundEnabled !== false) {
      const abRow = vfx.abilities[ab.id];
      const fam = abRow?.family ? vfx.families[String(abRow.family)] : undefined;
      if (!(abRow?.enabled === false) && !(fam?.enabled === false)) {
        for (const [field, label] of [
          ["soundLaunch", "特效發射"],
          ["soundImpact", "特效命中"],
          ["soundLoop", "特效循環"],
          ["soundDissipate", "特效消散"],
        ] as const) {
          const key = (abRow?.[field] as string | undefined) ?? (fam?.[field] as string | undefined);
          if (!key) continue;
          stack.push({ cue: key, layer: label });
          push({
            actor: ab.champion,
            actorName: nameOf(ab.champion),
            subject: ab.id,
            subjectName: ab.name,
            when: `${label}（${String(abRow?.family ?? "—")}）`,
            cue: key,
            surface: abRow?.[field]
              ? "content/config/vfx-families.json .abilities"
              : "content/config/vfx-families.json .families",
          });
        }
      }
    }
    castStack.set(ab.id, stack);
  }

  // ── ③ 英雄語音（選人） ──────────────────────────────────────────────────
  const voices = readJson("content/config/champion-voices.json").champions as Record<
    string,
    { select?: string[] }
  >;
  for (const [cid, v] of Object.entries(voices)) {
    for (const clip of v.select ?? []) {
      const owner = clipOwners.get(clip);
      rows.push({
        actor: cid,
        actorName: nameOf(cid),
        subject: "—",
        subjectName: "選人語音",
        when: "選人（champion-voices.select）",
        cue: "—",
        files: [clip],
        owners: owner ? [owner] : [],
        foreign: owner && !owner.champions.includes(cid) ? [owner] : [],
        surface: "content/config/champion-voices.json",
      });
    }
  }

  // ── ④ 通用 cue：每一位英雄身上都會響的那些 ────────────────────────────
  for (const [cue, files] of cueFiles) {
    const row = reach.get(cue);
    if (!isGenericCue(row)) continue;
    const owners = files.map((f) => clipOwners.get(f)).filter((o): o is ClipOwner => !!o);
    if (owners.length === 0) continue; // 沒有角色音 ⇒ 不是這張表要問的事
    rows.push({
      actor: "*",
      actorName: "⚠️ 每一位英雄",
      subject: cue,
      subjectName: "通用音效池",
      when: `${row!.kind === "combat" ? `戰鬥事件 ${(row!.events ?? []).join(" / ")}` : "客戶端"}（${row!.site ?? "—"}）`,
      cue,
      files,
      owners,
      foreign: owners,
      surface: "content/config/audio-map.json .sfx",
    });
  }

  return { champions, abilities, cueFiles, cueGate, clipOwners, reach, rows, castStack };
}

/** 🚨 跨角色誤用 —— 播出來的是別位英雄的音檔。 */
export function crossCharacterRows(m: Model): BindingRow[] {
  return m.rows.filter((r) => r.foreign.length > 0);
}

/**
 * 🚨 **逐支技能**自己宣告的施法音指到別位英雄的音檔。
 * ⭐ 這是最嚴重的形態（有人手動填錯一格），所以它的容忍度是 **0** ——
 * ⛔ 沒有豁免表，因為現在一列都沒有，而多出一列就是一次真的手滑。
 */
export function abilityLevelForeign(m: Model): BindingRow[] {
  return m.rows.filter(
    (r) =>
      r.foreign.length > 0 &&
      (r.surface.includes(".sfxKey") || r.surface.includes("ability-sfx-cues")),
  );
}

/**
 * 🚨 **通用音效池**（誰觸發都一樣）裡混進了角色專屬語音。
 * 回傳 `cue → 有主人的檔案清單`，⭐ 這是 #568 的根因那一層。
 */
export function contaminatedPools(m: Model): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of m.rows) {
    if (r.actor !== "*" || r.foreign.length === 0) continue;
    out.set(r.cue, r.foreign.map((o) => o.clip).sort());
  }
  return out;
}
