/**
 * ⭐⭐【開機就說出「今天有幾隻英雄會畫成體素」】（GH#1230）
 *
 * owner 2026-09-11（逐字）：「確保所有英雄角色都有**特定模型**、ICON、音效、對白對應 **而非體素**」
 * owner 2026-09-11（逐字）：「請你更新 script **每次上架跟啟動自動化處理**」
 *
 * ── ⛔ 這一格在補的洞 ──────────────────────────────────────────────────────
 * 一支英雄的 `modelKey` 指得到一份合法的 `model@1` 文件，
 * ⭐ 而那份文件的 `glbPath` **可以指向一個不存在的檔案** ——
 * 於是內容驗證全過、`content.ok` 為 true、選人畫面看得到他，
 * ⛔ 而玩家進場看到的是**體素替身**。
 *
 * ⚠️ ⭐ 2026-09-11 量到：**153 隻裡 38 隻**是這個狀態，
 * ⛔ 而 `/healthz` 從頭到尾沒有任何一格說得出這件事。
 * ⇒ 這正是本 repo 反覆記錄的形狀：**壞掉跟正常長得一模一樣。**
 *
 * ── ⭐ 為什麼它**不**影響 `ok` ────────────────────────────────────────────
 * 同 `quarantined` 那一格的理由（逐字寫在 `contentHealth.ts`）：
 * `ok` 回答的是「內容載入成功了嗎」，⭐ 而體素替身的定義就是「載入成功了，只是沒有模型」。
 * ⛔ 兩個訊號混在一起，部署後置條件就分不出「38 隻沒模型」與「整份跟映像不相容」——
 * 而後者正是 2026-08-02 的生產故障形態。
 * ⇒ ⭐ fail-open **沒錯**，⛔ 靜默才是缺陷 —— 所以它出現在 body 上，數字說話。
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Champions } from "@ggd/shared/sim/content/registry";

export interface HeroModelHealthSnapshot {
  /** 登錄表裡的英雄數（＝分母）。⭐ 0 代表偵測壞了，⛔ 不是「沒有問題」。 */
  readonly champions: number;
  /** ⭐ `glbPath` 指到的檔案**不存在** ⇒ 進場會是體素替身。 */
  readonly voxelFallback: number;
  /** 哪幾隻（上限 40 筆，⛔ 不讓 payload 無上限長大）。 */
  readonly voxelIds: readonly string[];
  /** ⭐ `modelKey` 連 `model@1` 文件都找不到 —— 比上面更嚴重。 */
  readonly unresolved: number;
  /** 給操作者看的一句話；全乾淨時是 null。 */
  readonly reason: string | null;
}

function contentRoot(): string {
  const declared = process.env.CONTENT_DIR;
  if (declared) return resolve(declared);
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "content");
}

/**
 * ⭐ 開機算一次就好（⛔ 不是每一次 `/healthz` 都去 stat 153 個檔）：
 * `content/` 是 bind-mount，內容換版時容器會重啟 ⇒ 這份快取的壽命正好等於它的正確期。
 */
let cached: HeroModelHealthSnapshot | null = null;

export function resetHeroModelHealth(): void {
  cached = null;
}

export function heroModelHealth(): HeroModelHealthSnapshot {
  if (cached) return cached;
  const root = contentRoot();
  const ids = Champions.ids();
  const voxel: string[] = [];
  let unresolved = 0;
  for (const id of ids) {
    const champ = Champions.get(id) as { modelKey?: string } | undefined;
    const key = champ?.modelKey;
    if (!key) { unresolved += 1; continue; }
    const docPath = join(root, "models", `${key}.json`);
    if (!existsSync(docPath)) { unresolved += 1; continue; }
    try {
      const doc = JSON.parse(readFileSync(docPath, "utf8")) as { glbPath?: string };
      if (!doc.glbPath || !existsSync(join(root, doc.glbPath))) voxel.push(String(id));
    } catch {
      unresolved += 1;
    }
  }
  const parts: string[] = [];
  if (voxel.length) parts.push(`${voxel.length}/${ids.length} 隻英雄的 GLB 不在磁碟上 ⇒ 進場是體素替身`);
  if (unresolved) parts.push(`${unresolved} 隻的 modelKey 解析不到 model@1 文件`);
  cached = {
    champions: ids.length,
    voxelFallback: voxel.length,
    voxelIds: voxel.slice(0, 40),
    unresolved,
    reason: parts.length ? parts.join("；") : null,
  };
  return cached;
}
