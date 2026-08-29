/**
 * 🔒 **隔離區的三段污染,一個指令問完**（GH#815，owner 2026-08-27：「請你尋找污染源」）。
 *
 * ⭐ 這條閘**不自己推導** —— 它跑出貨的 `product-quarantine.sh --doctor`。
 * 在此之前入口與孤兒的推導**同時住在這個測試裡和腳本裡**（第〇·四守則：第二個住處），
 * 而兩份會各自漂。⇒ 唯一住處＝那支腳本，這裡只驗它的**結論**與**它量得到東西**。
 *
 * ── 三段各自關掉一個結構性盲區 ────────────────────────────────────────────
 * ① 入口：26/40 產生器 script 曾經裸跑 ⇒ `pnpm content:build` 必 EACCES
 *    （⚠️ 而 CLAUDE.md 自己叫人打它 3 次）——「要記得走 genrun」是判準，這裡變成閘。
 * ② 孤兒：`laneY…④` 的迴圈是 `for (const [f,owners] of claimants)` ⇒ **444 而無人宣告**的檔
 *    永遠進不了 `claimants` ⇒ 它結構上問不出反方向。
 * ③ 分類：`normalizerListIsReal` 四條只問「名字真不真」⇒ 拿掉 `speedtiers:build`
 *    **兩支既有守衛一起是綠的**（2026-08-29 對抗性複驗逐行證過），而下一次 lock
 *    會把 55 份手編英雄卡 chmod 444。現在 doctor 的兩個訊號會指名它。
 *
 * ④ 欄位級（GH#827）：`vfxfam:build` 擁有整份 `config/vfx-families.json`，⛔ 而它
 *    **逐格保留** `sound*` / `groundDecal` / 後台旋鈕 ⇒ 那幾欄產生器不寫、genguard 擋、
 *    隔離區 444 ⇒ ⭐ **沒有任何合法寫入端**，而三個閘一起是綠的。
 *
 * ⚠️ **AC⑤「三段今天都印得出非零」今天做不到** —— ①② 已於 `c4e9f551` 修好（＝ 0）。
 * ⭐ 誠實的等價物是 `calibrate()`：出貨樹上量到 0（已知沒有的量不到）＋
 * 沙盒裡四段各自量到（已知有的量得到）。⛔ 單邊校準的尺會在最需要說話時沉默。
 *
 * ── 突變紀錄（一批一條）──────────────────────────────────────────────────
 *  · 把 `tiers:apply` 從 normalizers.json 拿掉 → ③ 紅並指名它（C=402/402）。實測過。
 *    ⚠️ 那正是 2026-08-29 對抗性複驗逐行證明「A 與 B 一起是瞎的」的那一支：
 *    它的 writes 是 402 條**明確路徑**（A=0），而 merge-io 把自寫的讀從 reads 濾光（B=0）。
 *  · 前一輪的突變（拿掉 `speedtiers:build` → A=72 B=71）仍然成立，⛔ 但它證明不了 C。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** ⭐ 真的跑出貨那一支 —— ⛔ 不是在測試裡重寫一份推導。 */
function run(args: string[], env: NodeJS.ProcessEnv = {}): { out: string; code: number } {
  try {
    const out = execFileSync("bash", ["scripts/product-quarantine.sh", ...args], {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: (err.stdout ?? "") + (err.stderr ?? ""), code: err.status ?? -1 };
  }
}

describe("隔離區體檢 --doctor (quarantine-orphans-and-entrypoints)", () => {
  it("① 出貨態：入口 · 孤兒 · 未分類正規化器 三段都是 0", () => {
    const { out, code } = run(["--doctor"]);
    expect(out, "⛔ 隔離區還有污染 —— 修法逐段印在上面\n").toContain("總計 0");
    expect(code, "doctor 要 fail-loud：有污染就回非零").toBe(0);
  });

  it("② calibrate：沙盒裡三段各自量得到（⛔ 一個永遠印 0 的 doctor 是空殼）", () => {
    const d = mkdtempSync(join(tmpdir(), "pq-doc-"));
    mkdirSync(join(d, "content"));
    mkdirSync(join(d, "many"));
    const orphan = join(d, "content", "orphan.json");
    writeFileSync(orphan, "{}\n");
    for (const f of ["a", "b"]) writeFileSync(join(d, "many", `${f}.json`), "{}\n");
    const io = join(d, "io.json");
    const pkg = join(d, "package.json");
    const norm = join(d, "normalizers.json");
    const fam = join(d, "content", "fam.json");
    const fio = join(d, "field-io.json");
    const fpr = join(d, "field-probes.json");
    // `fake:build` 一條 glob 認領 2 份（訊號 A）且入口沒包 genrun ⇒ ①③ 各一。
    // ⭐ `co:a` / `co:b` 各自用**明確路徑**寫同一批 —— A=0 B=0，只有 C 看得見
    //   （＝ `tiers:apply` 的形狀，2026-08-29 複驗證明舊的兩個訊號對它是瞎的）。
    //   `co:b` 進 $rejected 帶理由 ⇒ 同時驗「豁免表真的關得掉一格」。
    const co = [`${d}/many/a.json`, `${d}/many/b.json`];
    writeFileSync(
      io,
      JSON.stringify({
        steps: [
          { name: "fake:build", writes: [`${d}/many/*.json`] },
          { name: "co:a", writes: co },
          { name: "co:b", writes: co },
        ],
      }),
    );
    writeFileSync(pkg, JSON.stringify({ scripts: { "fake:build": "node fake.js" } }));
    writeFileSync(
      norm,
      JSON.stringify({
        normalizers: [],
        // ⚠️ 理由 <20 字 ⇒ 豁免表**不算數**（與出貨判準逐字一致）。夾具刻意寫足。
        $rejected: [{ step: "co:b", "why-not": "夾具：逐行看過它了，它是整份 emit 的作者，⛔ 不是就地改欄位。" }],
      }),
    );
    // ④ 欄位級孤兒：擁有者算得出 `primitive`，而 `soundLaunch` 沒有人認領。
    writeFileSync(fam, JSON.stringify({ families: { r1: { primitive: "x", soundLaunch: "s" } } }));
    writeFileSync(fio, JSON.stringify({ files: [{ path: fam, fileOwner: "fake:build", owned: { "families[*]": ["primitive"] } }] }));
    writeFileSync(fpr, JSON.stringify({ probes: [{ path: fam, fieldAuthors: {} }] }));
    chmodSync(orphan, 0o444); // ② 444 而 io 零命中 ⇒ 孤兒

    const { out, code } = run(["--doctor"], {
      GGD_QUARANTINE_IO: io,
      GGD_QUARANTINE_NORMALIZERS: norm,
      GGD_QUARANTINE_PKG: pkg,
      GGD_QUARANTINE_SCAN: join(d, "content"),
      GGD_QUARANTINE_FIELDIO: fio,
      GGD_QUARANTINE_FIELDPROBES: fpr,
    });
    chmodSync(orphan, 0o644);
    expect(out, "⛔ 已知有污染而 doctor 量不到 —— 這把尺在它最需要說話時是瞎的").toContain(
      "入口 1 · 孤兒 1 · 未分類 2 · 欄位級孤兒 1 · 總計 5",
    );
    expect(out, "⛔ C 訊號看不見『明確路徑的共寫』⇒ tiers:apply 那個 387 份死路照樣不會紅").toContain("co:a");
    expect(code, "有污染要回非零").not.toBe(0);
  });

  it("⑤ 欄位級擁有權是**量出來的**（field-io.json 過期就紅 —— GH#827）", () => {
    // ⭐ 它呼叫產生器自己的推導函式（`shippedFamilyConfig({})` / `ownedRowFields`），
    //   ⛔ 不是一張手抄的欄位表 —— 產生器多算一格少算一格，這一條會跟著紅。
    let out = "";
    let code = 0;
    try {
      out = execFileSync("node_modules/.bin/tsx", ["tools/parallel-gates/field-io.mts", "--check"], {
        cwd: REPO,
        encoding: "utf8",
      });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; status?: number };
      out = (err.stdout ?? "") + (err.stderr ?? "");
      code = err.status ?? -1;
    }
    expect(out + `\n(exit ${code})`, "⛔ 過期 ⇒ node_modules/.bin/tsx tools/parallel-gates/field-io.mts").toContain(
      "是最新的",
    );
  });

  it("③ 不認得的模式要出聲，⛔ 不是靜靜跑 unlock（打錯字與成功長得一模一樣）", () => {
    const { out, code } = run(["lokc"]);
    expect(code, "⛔ 未知模式回 0 ⇒ 一個打錯字的指令會把整個隔離區解鎖而沒有人知道").not.toBe(0);
    expect(out).toContain("不認得的模式");
  });

  it("④ 巢狀防護真的在：`sync.mjs` 宣告已解鎖，`genrun.sh` 看得懂", () => {
    const read = (p: string): string => readFileSync(join(REPO, p), "utf8");
    for (const f of ["tools/parallel-gates/sync.mjs", "scripts/genrun.sh"])
      expect(
        read(f),
        `⛔ ${f} 不認得已解鎖上下文 ⇒ 鏈上第一支跑完就把產物鎖回去，\n` +
          "   後面寫同一批檔的步驟吃 EACCES —— 而每一支單獨跑都是綠的。",
      ).toContain("GGD_QUARANTINE_UNLOCKED");
  });
});
