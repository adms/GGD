import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

/**
 * ⭐ GH#1021 —— 玩家公告閘用 `updatedAt` 撈票 ⇒ 三張與 v0.39.0 無關的舊票（#971／#916／#838）擋住了公告。
 *
 * 承重的不變量（⭐ 關係，⛔ 不是名詞）：**被撈進來的每一張票，都要有一個在 SINCE..NOW 裡的 commit 指名它**
 *   —— commit 訊息含 `#N`，**或**它進度標記的 commit 落在 SINCE..NOW（#916 在 v0.37.2..v0.38.0 只有後者）。
 * ⭐ 兩個方向：已知零玩家改動的 v0.38.2..v0.39.0 撈不到那三張；已知有的 v0.37.2..v0.38.0 仍撈得到。
 * ⭐ 量尺自證：`GGD_PLAYERNOTE_SCOPE=updated`（舊行為）在同一個區間**要**撈到越界的票，不然下面的 0 是瞎的。
 * ⚠️ 真的跑腳本、真的打 gh（本機與 CI 都有 token）；gh 跑不起來 ⇒ 明說「沒驗到」再跳過。
 * 突變：把 `drop（不在 …）` 那行的 `continue` 拿掉 ⇒ 紅並指名 #971／#916／#838。
 */
const REPO = new URL("../../../..", import.meta.url).pathname;
const run = promisify(execFile);
const git = (...a: string[]): boolean => {
  try { execFileSync("git", a, { cwd: REPO, stdio: "ignore" }); return true; } catch { return false; }
};
const gitOut = (...a: string[]) => execFileSync("git", a, { cwd: REPO, encoding: "utf8" });

type Row = { n: number; sha: string; bucket: string };
const parse = (stderr: string): Row[] =>
  [...stderr.matchAll(/^🔎 #(\d+) sha=(\S+) → (\w+)/gmu)]
    .map((m) => ({ n: Number(m[1]), sha: m[2] ?? "-", bucket: m[3] ?? "" }));

async function trace(since: string, until: string, scope = "commits"): Promise<Row[] | null> {
  const opts = {
    cwd: REPO, encoding: "utf8" as const, timeout: 240_000, maxBuffer: 1 << 24,
    env: { ...process.env, GGD_PLAYERNOTE_TRACE: "1", GGD_PLAYERNOTE_SCOPE: scope },
  };
  try {
    return parse((await run("bash", ["scripts/release-note-players.sh", "--since", since, "--until", until], opts)).stderr);
  } catch (e) {
    const err = e as { stderr?: string };            // ⚠️ 「沒寫玩家句就不發」是 exit 1 —— 不是閘壞了
    if (!err.stderr || /gh 連不上/.test(err.stderr)) return null;
    return parse(err.stderr);
  }
}

/** 區間裡的 commit 訊息（標題＋body）指名了哪些票 —— ⭐ 測試自己算，⛔ 不信腳本的判斷 */
const named = (since: string, until: string) =>
  new Set([...gitOut("log", "--format=%s%n%b", `${since}..${until}`).matchAll(/#(\d+)/g)].map((m) => +m[1]));
const inRange = (sha: string, since: string, until: string) =>
  sha !== "-" && git("cat-file", "-e", sha) && git("merge-base", "--is-ancestor", sha, until)
  && !git("merge-base", "--is-ancestor", sha, since);
/** 進了公告決策（lines／missing）卻沒有任何區間內 commit 指名它的票 */
const violators = (rows: Row[], since: string, until: string) => {
  const nm = named(since, until);
  return rows.filter((r) => (r.bucket === "lines" || r.bucket === "missing") && !nm.has(r.n) && !inRange(r.sha, since, until))
    .map((r) => r.n);
};

describe("玩家公告只撈這一版真的做了的票（GH#1021）", () => {
  it("★ 兩個方向 ＋ 量尺自證（真的跑腳本、真的打 gh）", async () => {
    const [bad, legacy, good] = await Promise.all([
      trace("v0.38.2", "v0.39.0"), trace("v0.38.2", "v0.39.0", "updated"), trace("v0.37.2", "v0.38.0"),
    ]);
    if (!bad || !legacy || !good) {
      console.warn("⚠️ 這條閘**沒有驗到** —— 腳本／gh 跑不起來。⛔ 這不是「範圍對了」。要驗：`gh auth status` 然後重跑。");
      return;
    }
    // 量尺自證：舊行為在同一個區間要撈到越界的票（2026-09-05 量到的是 #971／#916／#838）
    expect(violators(legacy, "v0.38.2", "v0.39.0").length, "舊行為撈不到任何越界的票 ⇒ 量尺瞎了").toBeGreaterThan(0);
    // 方向一：已知零玩家改動的區間 ⇒ 撈進來的每一張都有區間內的 commit 指名
    expect(violators(bad, "v0.38.2", "v0.39.0"), "這幾張不在 v0.38.2..v0.39.0 卻被撈進了公告決策").toEqual([]);
    for (const n of [971, 916, 838])
      expect(bad.filter((r) => r.n === n && r.bucket !== "drop"), `#${n} 是 09-02／09-03 關的，⛔ 不在 v0.39.0`).toEqual([]);
    // 方向二：已知有玩家改動的區間仍撈得到（⛔ 不可以為了方向一綠而把它變瞎）
    //   ⚠️ 讀的是 #916 今天在 GitHub 上的進度標記；它若被改寫，換一個 note 裡有 🎮 段的區間，⛔ 不是刪這條
    expect(good.filter((r) => r.bucket === "lines").length, "v0.37.2..v0.38.0 有玩家可見的票 ⇒ 撈到 0 = 閘瞎了").toBeGreaterThan(0);
    expect(violators(good, "v0.37.2", "v0.38.0")).toEqual([]);
  }, 300_000);
});
