/**
 * audio/abilitySfxCues —— 技能施法音的 cue 註冊表，**住 JSON**（GH#529）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 它為什麼存在
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 2026-08-20 逐字：「每一次更動技能相關機制或內容⋯包含⋯**特效音效綁定**⋯
 * 都請整理更新到 **JSON** 並讓 **script 動態更新**」。
 *
 * 而在這之前，「哪些 cue 允許出現在 `ability@1.sfxKey`」是
 * `combatSfx.ts` 裡的一個 TypeScript `Set`：52 個字面值加 52 行註解記著哪一支技能
 * 用哪一個。⛔ 那份東西的成本不是難看 —— **client 是 build 時烘進映像的**，
 * 所以動一個 cue 等於一次完整部署；而那 52 行註解是 prose，沒有任何東西在守它。
 *
 * 現在只有一份宣告：`content/audio-manifests/ability-sfx-cues.json`。
 * ⭐ `sfxReachability` 那 52 列的 `site` 也一起指到那份 JSON —— 於是「這個 cue
 * 存在」這件事**由那個檔決定**，⛔ 不再由某一支 .ts 決定（同 `VFX_SOUND_SITE`
 * 已經做過的事）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 退路是**推導**出來的，不是第二份名單
 * ═══════════════════════════════════════════════════════════════════════════
 * 內容還在載、fetch 404、JSON 壞掉 —— 這三種情況下註冊表退回
 * {@link derivedAbilityCastCues}，而它是從 `SFX_REACHABILITY` **走出來**的：
 * 每一列 `kind: "combat"` 且 `payload.abilityCast` 讀 `"sfxKey"` 的 key。
 * 那張表本來就一列對一個 audio-map key，而且 `sfxReachability.test.ts` 兩個方向
 * 都釘死。⛔ 抄一份 52 個字串當退路 = 第二個住處（CLAUDE.md 第〇·四），
 * 而它一定會過期。
 *
 * ⚠️ 所以 fail-open 的代價是**明確且有界**的：註冊表退回推導值 ⇒ 行為與
 * 2026-08-22 之前**逐位元相同**，⛔ 不是靜音。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 兩層，⛔ 不要混
 * ═══════════════════════════════════════════════════════════════════════════
 * | 層 | 家 | 誰改 |
 * |---|---|---|
 * | **哪些 cue 存在**（`cues`） | 這份 JSON | 出貨時；刪一列 = 那個 cue 當場失效 |
 * | **哪一支技能用哪一個**（綁定） | ⭐ `content/abilities/*.json` 的 `sfxKey` | 技能作者 |
 * | 上面那格的**覆蓋層**（`bindings`） | 這份 JSON | 技能文件上沒有 `sfxKey` 時才用 |
 *
 * ⛔ 一支技能不可以同時出現在 `bindings` 與自己的 `sfxKey` ——
 * `abilitySfxCues.test.ts` 在擋。兩個住處必然分岔。
 */
import { SFX_REACHABILITY } from "./sfxReachability";

/** 相對 `content/` 的路徑（`AudioSystem.urlFor` 會補前綴）。 */
export const ABILITY_SFX_CUES_PATH = "audio-manifests/ability-sfx-cues.json";

/** 這份文件的 schema tag；對不上一律忽略整份（→ 退回推導值）。 */
export const ABILITY_SFX_CUES_SCHEMA = "audio.ability-sfx-cues@1";

export interface AbilitySfxCueRegistry {
  /** 允許出現在 `ability@1.sfxKey` 的 cue。 */
  readonly cues: ReadonlySet<string>;
  /** 技能 doc id → cue，給文件上沒有 `sfxKey` 的技能。 */
  readonly bindings: ReadonlyMap<string, string>;
}

/**
 * ⭐ 出貨退路 —— **從 `SFX_REACHABILITY` 推導**，⛔ 不是手寫名單。
 *
 * 判準逐字就是那張表自己的宣告：這一列由 combat 那條路播、它讀 `abilityCast`
 * 事件的 `sfxKey` 欄位。⇒ 加一個新的 wc3 cue 只要照常補它的 reachability 列
 * （那本來就是每一個 audio-map key 的義務），這裡自動跟上。
 */
export function derivedAbilityCastCues(): ReadonlySet<string> {
  const out = new Set<string>();
  for (const row of SFX_REACHABILITY) {
    if (row.kind !== "combat") continue;
    if (row.payload?.abilityCast?.includes("sfxKey")) out.add(row.key);
  }
  return out;
}

const DERIVED: ReadonlySet<string> = derivedAbilityCastCues();

let registry: AbilitySfxCueRegistry = { cues: DERIVED, bindings: new Map() };

/**
 * 文件 → 註冊表。**null 代表「這不是那份文件」**（schema 不符／不是物件／
 * `cues` 不是物件），呼叫端據此保留現行值。
 *
 * ⚠️ 只收**看起來是 cue 的字串**（非空字串鍵 + 物件值）。一列壞掉不會讓整份被丟掉：
 * 一個技能沒有原作音的後果是元素 whoosh，⛔ 而整份被丟掉的後果是 52 支一起退回。
 */
export function abilitySfxCuesFromDoc(doc: unknown): AbilitySfxCueRegistry | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as Record<string, unknown>;
  if (d.schema !== ABILITY_SFX_CUES_SCHEMA) return null;
  const rawCues = d.cues;
  if (!rawCues || typeof rawCues !== "object" || Array.isArray(rawCues)) return null;
  const cues = new Set<string>();
  for (const key of Object.keys(rawCues as Record<string, unknown>)) {
    if (key.length > 0) cues.add(key);
  }
  if (cues.size === 0) return null;
  const bindings = new Map<string, string>();
  const rawBindings = d.bindings;
  if (rawBindings && typeof rawBindings === "object" && !Array.isArray(rawBindings)) {
    for (const [abilityId, cue] of Object.entries(rawBindings as Record<string, unknown>)) {
      // ⛔ 覆蓋層不可以引進一個沒有宣告過的 cue —— 那就是它要防的 audio-map miss。
      if (typeof cue === "string" && cues.has(cue) && abilityId.length > 0) {
        bindings.set(abilityId, cue);
      }
    }
  }
  return { cues, bindings };
}

/** 裝上一份文件。回傳它有沒有被接受（false ⇒ 現行註冊表原封不動）。 */
export function applyAbilitySfxCuesDoc(doc: unknown): boolean {
  const parsed = abilitySfxCuesFromDoc(doc);
  if (!parsed) return false;
  registry = parsed;
  return true;
}

/** 現行註冊表（診斷／測試）。 */
export function abilitySfxCueRegistry(): AbilitySfxCueRegistry {
  return registry;
}

/**
 * 技能文件宣告的 cue，或 null 讓呼叫端退回元素 whoosh。
 * 只有**宣告過**的 cue 過得了 —— 一個內容 typo 因此退回 whoosh，
 * ⛔ 不是變成一次 audio-map miss（＝靜音）。
 */
export function abilitySfxCueAllowed(sfxKey: unknown): string | null {
  if (typeof sfxKey !== "string") return null;
  return registry.cues.has(sfxKey) ? sfxKey : null;
}

/** `bindings` 覆蓋層：這支技能 id 有沒有被指定一個 cue。 */
export function abilitySfxCueForAbility(abilityId: unknown): string | null {
  if (typeof abilityId !== "string") return null;
  return registry.bindings.get(abilityId) ?? null;
}

/** 測試／teardown：回到推導出來的出貨退路。 */
export function resetAbilitySfxCuesForTest(): void {
  registry = { cues: DERIVED, bindings: new Map() };
}
