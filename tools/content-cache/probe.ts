/**
 * 一支**產生器的樣子**：開一個行程、把出貨內容載一次、印出毫秒數，然後結束。
 * `cli.ts bench` 用它量「每一個行程的第一次」—— ⛔ 那才是產生器付的錢。
 *
 * 最後一行固定是 `<ms> <hit> <docs>`，⛔ 不要動它的格式（cli 會 parse）。
 */
import { loadContentCached } from "../../packages/shared/src/content/cache/index";

async function main(): Promise<void> {
  const t0 = performance.now();
  const r = await loadContentCached();
  const dt = performance.now() - t0;
  console.log(`${dt.toFixed(1)} ${r.cache.hit} ${r.store.totalCount()}`);
}

void main();
