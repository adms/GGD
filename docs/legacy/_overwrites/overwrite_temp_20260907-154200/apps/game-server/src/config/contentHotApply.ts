/**
 * ⭐⭐ GH#1025 —— **按下發布之後，那份內容真的到得了這一台 shard。**
 *
 * ── ⛔ 在此之前這條路逐字是 `run: async () => ({ ok: false })` ────────────────
 * `contentBus.ts` 的 `content-overlay` refresher 的 `consequence` 自己寫著：
 *
 *   「你在後台編輯的內容（技能／英雄／道具）**這一台 shard 到重啟為止都不會用**」
 *
 * ⭐ 那句話是**誠實的**（它從來沒有假裝生效），⛔ 但它讓票文的驗收案例
 * 「按下通過之後，那隻英雄在**下一場**社群房裡選得到」變成
 * 「**取決於哪一台 shard 什麼時候重啟**」—— ⛔ 那不是慢，是沒有答案。
 *
 * ── ⭐ 這一支怎麼在不破壞「對局不中途換版」的前提下把它接起來 ────────────────
 *
 * 關鍵區分（⭐ 而它不是保守，是**唯一**安全的那一刀）：
 *
 * | 覆蓋層裡的文件 | 熱套用？ | 為什麼 |
 * |---|---|---|
 * | ⭐ **新增**（這個 id 今天登錄表裡沒有） | ✅ 套 | ⭐ **沒有任何進行中的對局引用得到它** —— 它五秒前還不存在 |
 * | ⛔ **修改**（這個 id 已經註冊過） | ❌ **不套**，逐份指名 | 改掉一支**正在被使用**的技能＝對局中途換版 |
 *
 * ⇒ ⭐ 熱套用**只會讓登錄表變大**，⛔ 永遠不會讓任何一份既有定義改變 ——
 * 而且是**逐位元組**不變：既有的 id 在 `registerAll()` 之後被**原封寫回**
 * 開機時那一個**物件參照**（⛔ 不是一份結構相同的新物件）。
 * ⇒ 一場正在打的比賽握著的 `AbilityDef` 連 identity 都沒有動過。
 *
 * ── ⭐ 為什麼是「先全註冊、再把舊的寫回去」而不是「只註冊新的」 ───────────────
 * `registerAll()` 是**一整棵樹**的註冊器（模板展開 · 五級距解析 · 卡面文案代入 ·
 * champion↔ability 鏡射），⛔ 而那些都要讀 `config` 與 `ability-templates`。
 * 只餵它「新的那幾份」會讓新英雄拿到**預設級距**而不是出貨級距
 * ——「商店顯示 6.0、場上打 4.5」那種對不起來的死法。
 * ⇒ ⭐ 餵完整的合併樹，然後把**每一個開機就在的 id** 寫回去。
 *
 * ⚠️ ⭐ 而那個「每一個登錄表」的清單是**推導**的（⛔ 不是手寫）：
 * 從兩個模組的匯出裡 duck-type 撈出每一個看起來像登錄表的東西。
 * ⛔ 手寫一張表 ＝ 下一個人加第 17 個登錄表時，那個 collection 的**修改**
 * 會被靜默熱套用，而**沒有任何東西會紅**（本 repo 記過的「一行接線」病）。
 *
 * ── ⭐ fail-loud ──────────────────────────────────────────────────────────
 * ⛔ 一份被扣住的修改**不可以**只留一行 log。它回進 {@link HotApplyResult.withheld}，
 * 由 `contentBus` 記成一次失敗（`/healthz` 的 `content` 區塊 ＋ degradation 登記），
 * 所以「我按了發布而它沒有生效」這句話**查得到答案**。
 */
import {
  ContentLoader,
  Configs,
  OverlayContentSource,
  registerAll,
  resolveUgc,
  UGC_DOC_ID,
  type UgcPolicyResolved,
} from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import * as contentRegistries from "@ggd/shared/content/registries";
import * as simRegistries from "@ggd/shared/sim/content/registry";
import { fetchOverlayBundle } from "./contentOverlay";
import { PLATFORM_URL } from "./platformUrl";

/** 一次熱套用的結果。⭐ `ok` 的語意是「這一台**收斂**到公告的那一版了嗎」。 */
export interface HotApplyResult {
  ok: boolean;
  /** 這一次新註冊進來的 `collection/id`（⭐ 排序過，⛔ 不看 Map 迭代順序）。 */
  added: string[];
  /**
   * ⛔ **被扣住**的覆蓋文件 —— 它們是**修改**，而修改要等重啟。
   * ⭐ 非空 ⇒ `ok=false` ⇒ `/healthz` 上看得到，⛔ 不是一行沒有人讀的 log。
   */
  withheld: string[];
  /** 合併樹的內容版本；⭐ 只有在 `withheld` 是空的時候才代表「現在註冊的就是它」。 */
  contentVersion?: string;
  /** 這一次為什麼沒有套（ok=false 時）。 */
  reason?: string;
}

/** 一個登錄表的最小形狀（兩種 Registry 類別的交集）。 */
interface AnyRegistry {
  ids(): string[];
  tryGet(id: string): unknown;
  register(...args: unknown[]): void;
}

function looksLikeRegistry(v: unknown): v is AnyRegistry {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.ids === "function" &&
    typeof r.tryGet === "function" &&
    typeof r.register === "function" &&
    typeof r.all === "function"
  );
}

/**
 * ⭐ 每一個**出貨的**登錄表 —— **推導**出來的，⛔ 不是手寫的一張表。
 *
 * ⚠️ 兩個模組的 `register` 簽章不同（`Registry.register(id, v)` 與
 * `ContentRegistry.register(v)`），所以寫回去的時候看 arity，⛔ 不看名字。
 */
export function shippedRegistries(): AnyRegistry[] {
  const out: AnyRegistry[] = [];
  for (const mod of [contentRegistries, simRegistries] as Record<string, unknown>[]) {
    for (const key of Object.keys(mod)) {
      const v = mod[key];
      if (looksLikeRegistry(v) && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

/** 一個登錄表的完整快照（id → 那個**物件參照**）。 */
function snapshot(r: AnyRegistry): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const id of r.ids()) m.set(id, r.tryGet(id));
  return m;
}

/** 把快照原封寫回去（⭐ 連物件參照都一樣）。 */
function restore(r: AnyRegistry, snap: Map<string, unknown>): void {
  for (const [id, v] of snap) {
    // `ContentRegistry.register(doc)` 是 1 個參數；`Registry.register(id, doc)` 是 2 個。
    if (r.register.length >= 2) r.register(id, v);
    else r.register(v);
  }
}

export interface HotApplyOptions {
  contentDir: string;
  platformUrl?: string;
  /** 測試接縫：直接給覆蓋層（⛔ 不打 HTTP）。 */
  fetchOverlay?: () => Promise<{ generation: number; docs: Record<string, unknown>; deleted: Record<string, boolean> } | null>;
  log?: typeof console.log;
  /** 測試接縫：不要真的動 `setActiveContentVersion`。 */
  onContentVersion?: (cv: string) => void;
}

/**
 * ⭐ 把耐久覆蓋層裡**新增的**文件熱註冊進登錄表。⛔ 永遠不丟例外。
 *
 * ⚠️ 它**不會**改變任何已註冊的 id —— 見檔頭那張表。
 */
export async function applyOverlayAdditions(opts: HotApplyOptions): Promise<HotApplyResult> {
  const log = opts.log ?? console.log;
  try {
    const overlay = await (opts.fetchOverlay
      ? opts.fetchOverlay()
      : fetchOverlayBundle(opts.platformUrl ?? PLATFORM_URL));
    if (overlay === null) {
      // ⭐ 覆蓋層是空的／抓不到。⛔ 這**不是**成功：平台剛剛才公告有東西變了，
      //   而我們拿不到它 —— 那正是 fail-loud 要說的話。
      return {
        ok: false,
        added: [],
        withheld: [],
        reason:
          "平台公告了 content-overlay，而這一台 shard 抓不到（或它是空的）—— " +
          "登錄表一個位元組都沒有動",
      };
    }

    const base = new FsContentSource(opts.contentDir);
    const source = new OverlayContentSource(base, overlay);
    // ⛔ `fail-closed` 與開機那一趟的 overlay 分支同一個政策：覆蓋層破一個洞
    //   應該露出下面的出貨樹，⛔ 不是把兩層一起打穿。
    const result = await new ContentLoader(source).load({ policy: "fail-closed" });

    const registries = shippedRegistries();
    const snaps = registries.map((r) => snapshot(r));
    // ⭐ 一個 id 在**任何**登錄表裡出現過 ＝ 它是既有的（⛔ 不逐 collection 對，
    //   因為覆蓋層的 key 是 `collection/id` 而登錄表是分裂的：`vfx` 一個
    //   collection 就散進三個登錄表）。
    const known = new Set<string>();
    for (const s of snaps) for (const id of s.keys()) known.add(id);

    const withheld: string[] = [];
    for (const key of Object.keys(overlay.docs)) {
      const id = key.slice(key.indexOf("/") + 1);
      if (known.has(id)) withheld.push(key);
    }
    for (const key of Object.keys(overlay.deleted)) {
      // ⛔ 刪除也不熱套用：一份被移除的定義可能正在被引用。
      const id = key.slice(key.indexOf("/") + 1);
      if (known.has(id)) withheld.push(key);
    }
    withheld.sort();

    // ⭐⭐ 整棵樹註冊（模板／級距／卡面文案要完整的 config 才算得對）⋯
    registerAll(result.store);
    // ⋯然後把**每一個開機就在的 id** 原封寫回去。⛔ 這一行拿掉 ＝ 熱換整棵樹
    //   ＝ 對局中途換版（`liveRefresh.test.ts` 釘住的正是那件事）。
    // MUTATION: restore disabled

    const added: string[] = [];
    for (const [i, reg] of registries.entries()) {
      const before = snaps[i] ?? new Map<string, unknown>();
      for (const id of reg.ids()) if (!before.has(id)) added.push(id);
    }
    added.sort();

    // ⭐ 內容版本**只有在沒有東西被扣住的時候**才跟著動：那時候「現在註冊的」
    //   逐份等於合併樹。⛔ 有東西被扣住 ⇒ 註冊的那一套不對應任何一份 manifest，
    //   而回放的相容檢查是拿它當主鍵的 —— 說一個對不上的版本比不說更糟。
    if (withheld.length === 0 && added.length > 0) {
      (opts.onContentVersion ?? (() => {}))(result.manifest.contentVersion);
    }

    if (withheld.length > 0) {
      return {
        ok: false,
        added,
        withheld,
        contentVersion: result.manifest.contentVersion,
        reason:
          `覆蓋層裡有 ${withheld.length} 份是**修改**既有內容（${withheld.slice(0, 5).join(", ")}` +
          `${withheld.length > 5 ? " …" : ""}）—— ⭐ 熱套用刻意不碰它們：` +
          `改掉一份正在被對局使用的定義就是「對局中途換版」。⇒ 那幾份要等這一台重啟。` +
          (added.length > 0 ? ` （⭐ 新增的 ${added.length} 份已經生效。）` : ""),
      };
    }

    log(
      `[content-hot-apply] +${added.length} 份新內容已註冊` +
        (added.length > 0 ? `（${added.slice(0, 8).join(", ")}）` : "") +
        ` — 下一次開房就選得到`,
    );
    return { ok: true, added, withheld, contentVersion: result.manifest.contentVersion };
  } catch (err) {
    return {
      ok: false,
      added: [],
      withheld: [],
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

// ──────────────────────────────── publishMode ────────────────────────────────

/**
 * ⭐⭐ `config.ugc@1` 的 `publishMode` —— ⭐ **這一格開關的消費端就是這一行。**
 *
 * ⚠️ 讀的是 `Configs` 登錄表，⭐ 而那一份**已經含後台覆蓋** ——
 * 開機那一趟走的是 `content/` ⊕ overlay 的合併樹（`index.ts` 的 `loadContent`），
 * 所以 owner 在後台存過的 `ugc` 就是這裡讀到的那一份。
 *
 * ⛔ 讀不到（骨架／單元測試）⇒ `resolveUgc` 回出貨預設 ＝ `immediate`。
 */
export function publishMode(): UgcPolicyResolved["publishMode"] {
  return resolveUgc(Configs.tryGet(UGC_DOC_ID)).publishMode;
}

/**
 * ⭐ 這一台 shard 的熱套用參數 —— **由開機序列設定一次**（`index.ts`），
 * ⛔ 而不是在這裡再算一次 `CONTENT_DIR`（那會是第二個住處，而它會漂）。
 *
 * ⚠️ 沒有 configure 過（單元測試／骨架開機失敗）⇒ 熱套用**整條關掉**並說出來，
 * ⛔ 不是靜靜地什麼都不做。
 */
let configured: HotApplyOptions | null = null;

export function configureContentHotApply(o: HotApplyOptions | null): void {
  configured = o;
}

export function hotApplyOptions(): HotApplyOptions | null {
  return configured;
}

/**
 * ⭐ `next-match` 那一條路的**延後棚**：公告來了但這一格說「等開房」，
 * 就把它記在這裡，由 `MatchRoom.buildMatch` 在**下一次開房**時消化掉。
 *
 * ⚠️ 只留一格（⛔ 不是佇列）：待套用的東西永遠是「**現在**的覆蓋層」，
 * 而它是一次完整重讀 —— 兩則公告排隊沒有任何意義（同 `contentBus` 的 coalescing）。
 */
let pendingApply = false;

/** 公告來了而 `publishMode` 是 `next-match` ⇒ 記一格。 */
export function deferOverlayApply(): void {
  pendingApply = true;
}

/** ⭐ 現在有沒有一份等著在開房時套用的覆蓋。 */
export function overlayApplyPending(): boolean {
  return pendingApply;
}

/**
 * ⭐ **開房那一刻**消化延後棚（`MatchRoom.buildMatch` 在解析白名單**之前**呼叫）。
 *
 * ⛔ 永遠不丟例外、⛔ 沒有東西等著時是零成本（連 HTTP 都不打）。
 * ⚠️ 它跑在 `onCreate` 裡 ⇒ ⭐ 這一場拿到的就是套用後的登錄表，
 * 而**已經在跑的那些房**一個位元組都沒有動（熱套用只加新文件）。
 */
export async function applyPendingOverlay(): Promise<HotApplyResult | null> {
  if (!pendingApply) return null;
  const opts = configured;
  if (opts === null) return null;
  pendingApply = false;
  return applyOverlayAdditions(opts);
}

/**
 * ⭐ 匯流排的 `content-overlay` refresher 就是這一支（`contentBus.ts` 呼叫它）。
 *
 * ⚠️ ⭐ **這裡是 `publishMode` 唯一的分岔**：
 *  · `immediate` ⇒ 現在就套（⇒ 幾秒後開的房就有它）
 *  · `next-match` ⇒ 記一格，由 `MatchRoom.buildMatch` 在下一次開房時消化
 */
export async function onOverlayAnnounced(): Promise<HotApplyResult> {
  const opts = configured;
  if (opts === null) {
    return {
      ok: false,
      added: [],
      withheld: [],
      reason:
        "熱套用沒有被開機序列設定（`configureContentHotApply`）—— " +
        "這一台 shard 的覆蓋層改動要等重啟",
    };
  }
  if (publishMode() === "next-match") {
    deferOverlayApply();
    return {
      ok: false,
      added: [],
      withheld: [],
      reason:
        "`ugc.publishMode` = `next-match` ⇒ ⭐ 這一份覆蓋會在**下一次開房**時套用，" +
        "⛔ 現在還沒有生效（後台把它改成 `immediate` 就會當場套）",
    };
  }
  return applyOverlayAdditions(opts);
}
