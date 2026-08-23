/**
 * ⭐ 從**量到的** I/O(`sync-io.json`)推導 `skills:sync` 的相依圖。
 * ⛔ 這裡沒有任何一條手寫的邊 —— 手寫的表會過期而且不會有東西紅。
 */
import { readFileSync } from "node:fs";

/** 兩個 Set 有沒有交集(⛔ 不建中間陣列)。 */
const hits = (small, big) => {
  for (const x of small) if (big.has(x)) return x;
  return null;
};

/**
 * ⭐ 邊的**兩種**來源,兩種都是真的相依:
 *   ① **讀後寫**(read-after-write) —— B 讀了 A 寫的檔 ⇒ B 必須在 A 之後。
 *      這是已知那一條的形狀:`contract:numbers` 讀 `content:build` 產的 bundle。
 *   ② **寫後寫**(write-after-write) —— A 與 B 寫同一個檔 ⇒ 誰最後寫決定內容,
 *      ⛔ 併行會得到「一半新一半舊」而且**兩支都說自己 OK**。
 *
 * ⚠️ 方向一律取**宣告順序**(package.json 那條 `&&` 鏈) —— 那是已知正確的全序,
 * 任何正確的相依圖都是它的子圖。⇒ ⛔ 不可能推出一個反向的邊。
 */
export function buildGraph(io) {
  /** 全部產物 = 任何一支寫過的檔。⭐ 它同時是下面那條「就地改寫」規則的字典。 */
  const artifacts = new Set();
  for (const s of io.steps) for (const w of s.writes) artifacts.add(w);

  const steps = io.steps.map((s) => {
    /**
     * ⭐⭐ **就地改寫型**的產生器:量了四趟(含把它讀過的每個檔都加一個換行)仍然 0 寫入。
     * 原因是它們的冪等判準**不是位元組相等** —— `stamp_provenance.py` 是
     * 「`provenance` 欄位已經等於 want 就 `continue`」,`speed-growth/gen.ts` 是
     * 「`next === raw` 就跳過」,而 `next` 是從 `raw` 算出來的 ⇒ 加換行兩邊一起變。
     * ⛔ 但它們**確實會寫**(原始碼裡就是 `json.dump(..., open(f,"w"))` 與 `writeFileSync(path,…)`)。
     *
     * ⇒ 保守地把「它讀過的產物」當成它可能寫的東西。⭐ 這是**可靠的上界**:
     *   一支無條件寫的工具前面三趟就量得到了 ⇒ 還是 0 的必然是「讀出來比一比才寫」,
     *   ⇒ 它**一定讀得到自己的產物**。多算的邊只會少一點併行,⛔ 不會漏掉相依。
     */
    const assumed = s.writes.length === 0 ? s.reads.filter((r) => artifacts.has(r)) : [];
    return {
      ...s,
      R: new Set(s.reads),
      W: new Set(s.writes.length ? s.writes : assumed),
      assumedWrites: assumed.length,
      /** ⭐ 探針沒留下任何讀取 ⇒ 這一支**不可信** ⇒ 當柵欄(⛔ 不猜它安全)。 */
      opaque: s.readCount === 0,
    };
  });
  const n = steps.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = steps[i], b = steps[j];
      if (a.opaque || b.opaque) {
        edges.push({ from: i, to: j, why: "opaque", file: null });
        continue;
      }
      const raw = hits(b.R, a.W);
      if (raw) { edges.push({ from: i, to: j, why: "read-after-write", file: raw }); continue; }
      const waw = hits(b.W, a.W);
      if (waw) edges.push({ from: i, to: j, why: "write-after-write", file: waw });
    }
  }
  return { steps, edges };
}

/** 拓撲分層:level(v) = 最長前置鏈長度。同一層彼此無依賴 ⇒ 可以同時跑。 */
export function layers({ steps, edges }) {
  const lvl = new Array(steps.length).fill(0);
  for (const e of edges) lvl[e.to] = Math.max(lvl[e.to], lvl[e.from] + 1);
  const out = [];
  for (let i = 0; i < steps.length; i++) (out[lvl[i]] ??= []).push(i);
  return out;
}

/**
 * ⭐⭐ 優先序 = **到終點的最長路徑(critical path)**,時間用時間帳本的毫秒。
 * owner 2026-08-23:「根據**排隊理論**,**最慢又不可平行分拆的任務要不要盡可能最先做**」。
 * ⭐ 這是 LPT 在 DAG 上的正確一般化:純 LPT 只看自己多長,⛔ 看不到「它後面還拖著多少」。
 */
export function priorities({ steps, edges }, ms) {
  const succ = steps.map(() => []);
  for (const e of edges) succ[e.from].push(e.to);
  const memo = new Array(steps.length).fill(-1);
  const walk = (i) => {
    if (memo[i] >= 0) return memo[i];
    let best = 0;
    for (const j of succ[i]) best = Math.max(best, walk(j));
    return (memo[i] = best + (ms[steps[i].name] ?? steps[i].ms ?? 1000));
  };
  for (let i = steps.length - 1; i >= 0; i--) walk(i);
  return memo;
}

export function loadIo(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}
