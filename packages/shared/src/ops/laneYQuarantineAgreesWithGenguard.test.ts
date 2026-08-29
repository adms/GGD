/**
 * 🔒↔🚫 **隔離區與 genguard 對同一個檔不可以意見相左**（GH#707）。
 *
 * 量到的（2026-08-27 主樹）：`genguard.sh` 對 **388 份**檔回 `NORMALIZER`
 * ＝「這一支不擋你」，而隔離區把**同樣那 388 份**chmod 444 ⇒ 合法手編吃 EACCES，
 * 而訊息裡零指引。**意見相左是 100% 的**（反方向 0 份 —— 真產物都鎖著，那是對的）。
 * 根因：兩支腳本各自硬寫一份正規化器清單，而**隔離區連這個概念都沒有**。
 *
 * ⭐ 兩個方向都要驗，⛔ 只驗一邊就是「為了讓自己過而放寬判準」：
 *   ① **該放的真的放得過** —— 只被正規化器認領的檔，lock 之後仍寫得進去
 *      （而且是**主動放行**：444 進去、644 出來，⛔ 不是「跳過」）
 *   ② **該擋的仍擋** —— 有作者認領的檔（含「正規化器＋作者共同認領」的），lock 之後 EACCES
 *   ③ ⭐ **收工後仍然對** —— 模擬 genrun.sh 的「解鎖→跑→重鎖」，那些檔還是可寫的
 *      （⛔ 否則修了等於沒修：下一次 sync 又把它們鎖回去）
 *   ④ **出貨態掃描** —— 掃現在這棵樹，「genguard 說可以改而檔案是 444」必須是 0 份
 *      （⛔ 不看 diff：已經壞掉的東西沒有 diff 會碰它）
 *
 * 突變紀錄（2026-08-27 實跑）：把 product-quarantine.sh 的 `if author and writable:`
 * 改回 `if writable:`（＝修復前的行為）→ ①③ 一起紅：①指名 norm-open.json 被鎖走、③指名重鎖把手編檔鎖回去。改回來。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, closeSync, globSync, mkdtempSync, openSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (f: string): string => readFileSync(join(REPO, f), "utf8");

/** 真的開檔寫 —— ⛔ 不是 `os.access`：隔離區守的正是「檔案 API 直寫」那條路。 */
function probe(p: string): "WRITABLE" | "EACCES" {
  try {
    closeSync(openSync(p, "a")); // "a" 不截斷、不寫位元組 ⇒ 內容不變
    return "WRITABLE";
  } catch {
    return "EACCES";
  }
}

describe("隔離區 × genguard：同一個檔只准有一種說法", () => {
  const dir = mkdtempSync(join(tmpdir(), "laneY-pq-"));
  const author = join(dir, "author.json"); // 只有作者
  const normOnly = join(dir, "norm-only.json"); // 只有正規化器 ⇒ 手編檔（先 444，驗**放行**）
  const normOpen = join(dir, "norm-open.json"); // 同上但先 644 ⇒ 驗 lock **不去鎖它**
  const shared = join(dir, "shared.json"); // 兩者都認領 ⇒ 仍然是產物
  const io = join(dir, "io.json");
  const norms = join(dir, "normalizers.json");
  for (const f of [author, normOnly, normOpen, shared]) writeFileSync(f, "{}\n");
  chmodSync(normOnly, 0o444); // ⭐ 先鎖住：要驗 lock **主動放行**，⛔ 不是「跳過」
  writeFileSync(
    io,
    JSON.stringify({
      steps: [
        { name: "fake:build", writes: [author, shared] },
        { name: "fake:norm", writes: [normOnly, normOpen, shared] },
      ],
    }),
  );
  writeFileSync(norms, JSON.stringify({ normalizers: [{ step: "fake:norm", reason: "沙盒用" }] }));
  const run = (args: string[]): string =>
    execFileSync("bash", ["scripts/product-quarantine.sh", ...args], {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, GGD_QUARANTINE_IO: io, GGD_QUARANTINE_NORMALIZERS: norms },
    });

  it("① 該放的放得過 · ② 該擋的仍擋（lock 之後）", () => {
    run(["lock"]);
    expect(probe(normOnly), "只被正規化器認領的檔被鎖了 ⇒ genguard 說可以改而檔案改不動（GH#707）")
      .toBe("WRITABLE");
    expect(statSync(normOnly).mode & 0o200, "lock 要**主動放行**（444→644），⛔ 不是跳過").not.toBe(0);
    expect(probe(normOpen), "本來就可寫的手編檔被 lock 鎖走了 ⇒ 這正是 GH#707 的 388 份").toBe(
      "WRITABLE",
    );
    expect(probe(author), "作者的產物沒鎖上 ⇒ 隔離區失效（owner 記錄過上百次的通道）").toBe("EACCES");
    expect(probe(shared), "「正規化器＋作者共同認領」仍然是產物 —— 判準要對**全部**步驟算").toBe(
      "EACCES",
    );
  });

  it("③ 模擬 genrun 的解鎖→跑→重鎖：收工後那些檔還是可寫的", () => {
    run(["unlock", "--step", "fake:norm"]);
    run(["lock", "--step", "fake:norm"]);
    expect(probe(normOnly), "重鎖把手編檔又鎖回去 ⇒ 下一次 sync 就是 GH#707 重演").toBe("WRITABLE");
    expect(probe(shared), "共同認領的產物在正規化器收工時要鎖回去").toBe("EACCES");
    run(["unlock"]);
    for (const f of [author, normOnly, normOpen, shared]) chmodSync(f, 0o644);
  });

  it("④ 出貨態掃描：這棵樹上「genguard 說可以改而檔案 444」是 0 份", () => {
    // ⭐ 2026-08-29（GH#815 複驗）：分類是**逐檔**的 —— 每一格可以帶 `only`（路徑 glob），
    //    意思是「**只有**這些路徑算正規化器，其餘路徑照樣是作者」。
    //    ⚠️ 這裡不把 `only` 讀進來，這條閘就會比出貨腳本**更寬**，於是
    //    `docs/_data/ap-conversion-applied.json`（apconv:build 自己整份 emit 的清單）
    //    被鎖之後這裡會誤報成「正規化器專屬卻唯讀」= 一條會亂紅的閘。
    const NORM_SCOPE = new Map<string, Set<string> | null>(
      (
        JSON.parse(read("tools/parallel-gates/normalizers.json")) as {
          normalizers: { step: string; only?: string[] }[];
        }
      ).normalizers.map((n) => [
        n.step,
        n.only ? new Set(n.only.flatMap((g) => (/[*?[]/.test(g) ? globSync(g, { cwd: REPO }) : [g]))) : null,
      ]),
    );
    const normalizes = (step: string, f: string): boolean => {
      if (!NORM_SCOPE.has(step)) return false;
      const only = NORM_SCOPE.get(step);
      return only === null || only === undefined || only.has(f);
    };
    const claimants = new Map<string, Set<string>>();
    for (const s of (JSON.parse(read("tools/parallel-gates/sync-io.json")) as {
      steps: { name: string; writes?: string[] }[];
    }).steps) {
      for (const w of s.writes ?? []) {
        const hits = /[*?[]/.test(w) ? globSync(w, { cwd: REPO }) : [w];
        for (const f of hits) (claimants.get(f) ?? claimants.set(f, new Set()).get(f)!).add(s.name);
      }
    }
    const stuck: string[] = [];
    for (const [f, owners] of claimants) {
      if ([...owners].some((n) => !normalizes(n, f))) continue; // 有作者 ⇒ 本來就該鎖
      try {
        if ((statSync(join(REPO, f)).mode & 0o200) === 0) stuck.push(f);
      } catch {
        /* 不存在 ⇒ 不是這條閘的事 */
      }
    }
    expect(
      stuck.slice(0, 8),
      `${stuck.length} 份只被正規化器認領卻是唯讀 —— 修法：bash scripts/product-quarantine.sh lock`,
    ).toEqual([]);
  });
});
