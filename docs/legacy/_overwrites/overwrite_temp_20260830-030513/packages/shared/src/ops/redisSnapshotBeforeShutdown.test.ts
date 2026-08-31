/**
 * redisSnapshotBeforeShutdown.test.ts —— 停 Redis 之前**一定**先快照（GH#860）
 *
 * ── owner 的裁決（逐字，2026-08-28）─────────────────────────────────────────
 * > 「Redis 要停機時也要有備份機制，**不要等待暖開機**，
 * >  因為我還有**排行榜等資料**在上面**不只快取**」
 *
 * 它上面真的不只是快取（2026-08-28 量到的 key 前綴）：
 *   `lb:*` 37（排行榜）· `wallet:*`＋`walletmeta:*` 120（M幣）· `match:*` 530
 *   —— 只有 `refresh:*` 6163 才是真的快取。掉了不是「重新暖機就好」。
 *
 * ── 為什麼需要這一條 ────────────────────────────────────────────────────────
 * `scripts/redis-snapshot.sh` 已經存在，而 2026-08-29 的現況複驗逐字量到：
 * 「把 host-deploy.sh:277 那段刪掉**不會有任何東西變紅**」。
 * ⇒ ⭐ 一個**沒有閘守著的保護**，與一個不存在的保護，差別只是**時間**。
 *
 * 2026-08-30 反方向掃一次就抓到**兩個已經存在的洞**，而兩個都是綠燈下的：
 *   ① `mini-deploy.sh` —— 3 條 `up -d` 路徑**零快照**。GGD 在 2026-08-29 搬到
 *      mini，⇒ ⭐ 保護留在了**已經不是主力的那個環境**裡。
 *      （CLAUDE.md：「『它沒有在跑』與『**它在哪一個環境**沒有在跑』是兩件事」）
 *   ② `host-deploy.sh` **回滾路徑** —— 它自己有一個 `up -d`，而快照在它**下面**
 *      19 行 ⇒ 快照發生在 Redis 已經被重建**之後**，等於沒有。
 *      ⚠️ 而它看起來完全正確：腳本裡有快照、部署那條路的順序也對
 *        ⇒ 失敗形態⑪「兩條各自對的路，**接縫**沒有人站著」。
 *      ⭐ 而回滾正是事情已經在出錯的那一刻 —— 最需要那份保險的時候。
 *
 * ⚠️ 掃原始碼是刻意的取捨（同 hostDeployScript.test.ts）：被測的是 bash 腳本，
 * 真的跑起來要 docker 加一台配置好的主機。⭐ 但掃的是**順序關係**（哪一行在哪一行
 * 前面），⛔ 不是「檔案裡有沒有出現這個字」—— 後者對上面兩個洞都會是綠的。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "../../../../scripts");

/**
 * 這一行會不會**重建 redis**？
 *
 * ⭐ `up -d` 後面指名了服務 ⇒ 只有那幾個會被重建；沒指名 ⇒ **全部**（含 redis）。
 *
 * ⛔⛔ 第一版寫成一個帶負向前瞻的正則：`up -d`(?!.*\b(redis|caddy|…)\b)。
 *   ⚠️ 而它把 `up -d --scale caddy=0` 判成「只動 caddy」——
 *     ⭐ `--scale caddy=0` 是**旗標**，那一行其實會重建**每一個**服務。
 *   ⇒ 也就是說：**tunnel 那條路會被靜默放行**。
 *   ⭐ 下面那條「量尺先自證」的斷言當場抓到它 —— ⛔ 而如果我沒寫那一條，
 *     這條守衛會帶著一個洞上線，而且**看起來是綠的**。
 */
function recreatesRedis(line: string): boolean {
  if (/docker\s+compose[^\n]*\bdown\b/.test(line)) return true;
  const m = /docker\s+compose[^\n]*?\bup\s+-d\b(.*)$/.exec(line);
  if (!m) return false;
  // shell 的下一段（管線／引號結尾）不是 compose 的參數 —— 先切掉
  const args = m[1].split(/["'|;]|&&/)[0];
  const services = args
    .split(/\s+/)
    .filter((t) => t && !t.startsWith("-") && !t.includes("=") && /^[a-z][a-z0-9-]*$/.test(t));
  return services.length === 0; // 沒指名任何服務 ⇒ 全部重建 ⇒ 含 redis
}

/** 一行程式碼（⛔ 註解與 warn/die 字串裡的示範指令不算「會執行」）。 */
function codeLines(src: string): { n: number; text: string }[] {
  return src.split("\n").map((text, i) => ({ n: i + 1, text })).filter(
    (l) => !/^\s*#/.test(l.text) && !/^\s*(warn|info|say|die|ok)\s/.test(l.text),
  );
}

/**
 * 棘輪豁免表 —— ⭐ **只能變短**，每一筆要帶一個**可以被反駁的**理由。
 * ⛔ 「還沒排到」不是理由。
 */
const EXEMPT: Record<string, string> = {};

const scripts = readdirSync(DIR).filter((f) => f.endsWith(".sh"));

describe("停 Redis 之前一定先快照 —— 排行榜與 M幣不是快取（GH#860）", () => {
  it("⭐ 量尺先自證：偵測器兩個方向都準", () => {
    // 正向：一個真的會重建全部服務的指令要抓得到
    expect(recreatesRedis("docker compose -f a.yaml up -d")).toBe(true);
    expect(recreatesRedis("docker compose up -d --scale caddy=0")).toBe(true);
    // ⭐ 反方向：只重建**指名的那一個**服務時**不可以**抓到
    //   （`up -d caddy` 不會碰 redis —— 誤報會逼人加假的快照）
    expect(recreatesRedis("docker compose -f a.yaml up -d caddy")).toBe(false);
    // 而且真的有腳本被掃到（⛔ 掃到 0 支 = 這條守衛在空轉）
    const hit = scripts.filter((f) =>
      codeLines(readFileSync(join(DIR, f), "utf8")).some((l) => recreatesRedis(l.text)),
    );
    expect(hit.length, "一支會重建容器的腳本都沒掃到 ⇒ 偵測器壞了").toBeGreaterThan(1);
  });

  it("★ 每一支會重建容器的腳本，都要在那一行**之前**呼叫 redis-snapshot.sh", () => {
    const bad: string[] = [];
    for (const f of scripts) {
      if (f === "redis-snapshot.sh" || f in EXEMPT) continue;
      const lines = codeLines(readFileSync(join(DIR, f), "utf8"));
      const firstRecreate = lines.find((l) => recreatesRedis(l.text));
      if (!firstRecreate) continue;
      const snap = lines.find((l) => /redis-snapshot\.sh|redis_snapshot_before_shutdown/.test(l.text));
      if (!snap) bad.push(`${f}:${firstRecreate.n} —— ⛔ 整支都沒有快照`);
      else if (snap.n > firstRecreate.n)
        bad.push(`${f} —— 快照在 :${snap.n}，而重建在 :${firstRecreate.n}（⛔ 太晚了，等於沒有）`);
    }
    expect(
      bad,
      `⛔ 這幾條停機路徑上，排行榜與 M幣沒有保護：\n   ${bad.join("\n   ")}\n` +
        `   ⇒ 在那一行**之前**呼叫 scripts/redis-snapshot.sh。`,
    ).toEqual([]);
  });

  it("★ redis-snapshot.sh 有還原演練（⛔ 「備份得出來」只是尺的一邊）", () => {
    const s = readFileSync(join(DIR, "redis-snapshot.sh"), "utf8");
    expect(/cmd_verify\s*\(\)/.test(s), "沒有 verify 子指令").toBe(true);
    // 演練必須**真的載進一個容器**再問 key，⛔ 不是看檔案大小
    expect(/docker run[^\n]*\$IMG|docker run[^\n]*"\$IMG"/.test(s), "verify 沒有起容器").toBe(true);
    expect(/DBSIZE/.test(s) && /lb wallet|lb\s+wallet/.test(s), "沒有問 owner 點名的前綴").toBe(true);
  });
});
