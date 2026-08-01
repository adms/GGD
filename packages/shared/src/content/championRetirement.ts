/**
 * championRetirement — 「這隻英雄已經下架」的**唯一**判準。
 *
 * ── 為什麼它不住在白名單裡 ───────────────────────────────────────────────
 *
 * 白名單答的是「營運**開放**了誰」，下架答的是「這份內容**還沒做完**」。
 * 兩者長得像，但它們在三個地方會分開，而每一個都真的咬過人：
 *
 *   ① **平台連不上時白名單整個消失。** 客戶端退到 `NO_FILTER`
 *      （`ui/panels/champSelectFilter` 的 `NO_FILTER`），伺服器退到
 *      `CurationWhitelist.bypass` —— 兩邊都是 fail-open，也就是 119 隻全開。
 *      localhost 幾乎永遠走這條，所以「在白名單裡拿掉」這個動作
 *      **在我們自己試玩的環境裡是 no-op**。
 *   ② **白名單是可被覆寫的營運狀態**：後台勾選、一鍵回復原廠都會重寫它。
 *      一次手滑就能把半成品放回選人畫面。
 *   ③ 白名單是 id 的**允許**集合，新增內容預設不在裡面；下架是**拒絕**集合，
 *      新增內容預設不在裡面。方向相反，混在一起就會出現「我明明勾了為什麼沒有」。
 *
 * 所以下架是一條**內容規則**，跟 `championForms` 的「變身態不可被選」同一層 ——
 * 差別只在那一條寫死在 TS（形態配對是 w3x 的事實，不會變），
 * 而下架會變（技能補完就該重新上架），所以它是一份 `content/config` 文件。
 *
 * ── 純度 ─────────────────────────────────────────────────────────────────
 *
 * {@link retiredChampionIdsFromDoc} 是純函式（吃 doc、吐 Set），
 * {@link retiredChampionIds} 是它加上一次 registry 讀取的便利包裝。
 * 下游那些「不可以 import registry」的純模組（`champSelectFilter`）
 * 收的是**算好的 Set**，不是這個模組 —— 見那邊的檔頭。
 */
import { Configs } from "./registries";

/** `content/config/roster.json` 的 doc id。 */
export const ROSTER_DOC_ID = "roster";

/** 那份 doc 的 schema 標籤。 */
export const ROSTER_SCHEMA = "config.roster@1";

const EMPTY: ReadonlySet<string> = new Set();

/**
 * 從一份 `config.roster@1` 讀出下架清單。
 *
 * ⚠️ **缺文件 = 空集合（沒有人下架）**，這個方向是刻意的，跟 `stealthRules`
 * 那種「缺文件 = 出貨預設」相反。理由：這份清單的內容是「拒絕誰」，
 * 讀不到時 fail-open 的代價是「兩隻半成品出現在選人畫面」（難看，可回復），
 * fail-closed 的代價是「內容載入出問題時全部英雄消失」——
 * 那就是 2026-08-01 選人畫面整個空掉的那個事故，代價高一個量級。
 */
export function retiredChampionIdsFromDoc(doc: unknown): ReadonlySet<string> {
  if (!doc || typeof doc !== "object") return EMPTY;
  const d = doc as { schema?: unknown; retiredChampions?: unknown };
  if (d.schema !== ROSTER_SCHEMA) return EMPTY;
  if (!Array.isArray(d.retiredChampions)) return EMPTY;
  return new Set(d.retiredChampions.filter((x): x is string => typeof x === "string" && x !== ""));
}

/** 目前生效的下架清單（讀 `Configs` registry）。 */
export function retiredChampionIds(): ReadonlySet<string> {
  return retiredChampionIdsFromDoc(Configs.tryGet(ROSTER_DOC_ID));
}

/** 這一隻是不是已經下架。 */
export function isRetiredChampionId(id: string): boolean {
  return retiredChampionIds().has(id);
}
