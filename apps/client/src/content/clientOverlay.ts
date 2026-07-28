/**
 * clientOverlay — the BROWSER's read side of the durable content overlay (#189).
 *
 * ---------------------------------------------------------------------------
 * 為什麼客戶端也必須讀 overlay
 * ---------------------------------------------------------------------------
 * `/content/**` 是一份 read-only 靜態掛載(nginx.conf「game content (RO)」),
 * 而後台的 內容管理 寫的是 `data/content-overlay/` —— 兩個不同的地方。遊戲伺服器
 * 早就在開機時把後者疊上前者(config/contentOverlay.ts),**瀏覽器沒有**。
 *
 * 於是任何「純客戶端決定」的內容,後台改了對玩家就是零效果:
 *
 *   · `config.voxel-bodies@1`(GH#31 的體素身體開關)—— 渲染決定在 ChampionView,
 *     整條路都在瀏覽器裡。後台按下去、overlay 寫成功、頁面顯示已儲存,玩家看到的
 *     還是原本那個身體。**沒有任何東西會報錯。**
 *   · `config.base-bonus@1` 的大廳顯示 —— 戰鬥中的數字由伺服器經
 *     `MatchState.baseBonusJson` 授權,但選角/圖鑑在開打前就要顯示。
 *
 * 這支模組就是把伺服器那一步搬到瀏覽器,**共用同一份 `OverlayContentSource`**
 * (packages/shared/src/content/overlay.ts)。兩邊用不同實作合併的話,會靜默產生
 * 兩份不一樣的內容樹,而 contentVersion 還會宣稱它們一樣。
 *
 * FAIL-SAFE:任何失敗(平台不可達、非 200、格式不對、空 overlay)都回 `null`,
 * 呼叫端就照舊載入出貨內容。overlay 是操作者編輯的加速器,不是開機依賴。
 */
import { isOverlayEmpty, type OverlayBundle } from "@ggd/shared/content";

/** Public, unauthenticated read endpoint (same-origin; vite proxies /api in dev). */
export const OVERLAY_BUNDLE_URL = "/api/v1/content-overlay/bundle";

/** Milliseconds a boot overlay fetch may take before it is abandoned. */
export const OVERLAY_FETCH_TIMEOUT_MS = 4000;

/**
 * Narrow an unknown JSON value into an OverlayBundle, or null.
 *
 * ⚠️ 刻意與 game-server 的 `parseOverlayBundle` 同形:只留 `true` 的墓碑、
 * generation 非數字就當 0。兩邊解析不一致 = 兩台機器合併出不同的樹。
 */
export function parseOverlayBundle(raw: unknown): OverlayBundle | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const docs = r.docs;
  const deleted = r.deleted;
  if (typeof docs !== "object" || docs === null || Array.isArray(docs)) return null;
  if (typeof deleted !== "object" || deleted === null || Array.isArray(deleted)) return null;
  const del: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(deleted as Record<string, unknown>)) {
    if (v === true) del[k] = true;
  }
  return {
    generation: typeof r.generation === "number" ? r.generation : 0,
    docs: docs as Record<string, unknown>,
    deleted: del,
  };
}

export interface FetchOverlayOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  url?: string;
}

/**
 * Fetch the overlay bundle. Resolves to `null` on ANY failure OR when the
 * overlay would change nothing — a null return means「照舊載入出貨內容」, so the
 * caller never has to distinguish "no overlay" from "empty overlay".
 */
export async function fetchOverlayBundle(
  opts: FetchOverlayOptions = {},
): Promise<OverlayBundle | null> {
  const url = opts.url ?? OVERLAY_BUNDLE_URL;
  const doFetch = opts.fetchFn ?? (typeof fetch === "function" ? fetch : undefined);
  if (!doFetch) return null;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer =
    controller !== null
      ? setTimeout(() => controller.abort(), opts.timeoutMs ?? OVERLAY_FETCH_TIMEOUT_MS)
      : null;
  try {
    const res = await doFetch(url, controller ? { signal: controller.signal } : {});
    if (!res.ok) return null;
    const bundle = parseOverlayBundle(await res.json());
    // An empty overlay is the identity element of the merge, so returning null
    // for it is not a shortcut — it keeps the un-edited host on the byte-exact
    // shipped manifest (and its shipped contentVersion, which stamps asset URLs).
    return bundle === null || isOverlayEmpty(bundle) ? null : bundle;
  } catch {
    return null;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
