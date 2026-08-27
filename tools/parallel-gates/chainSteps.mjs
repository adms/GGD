/**
 * ⭐ 把一個 package.json script 的**鏈**切成「逐支怎麼跑」—— `trace.mjs` 的解析層。
 *
 * ⛔ 它住在自己的檔案裡，是為了**驗得到**：`trace.mjs` 一 import 就會去建沙盒
 * （頂層副作用），所以守衛沒辦法載它。⇒ 純函式搬出來，⛔ 不是掃原始碼字串。
 *
 * ── GH#804/#810：鏈的每一節⛔ 不一定是「pnpm <script 名>」 ──────────────
 * 舊版是 `chain.split("&&").map(s => s.trim().replace(/^pnpm\s+/, ""))` 再
 * `spawn("pnpm", [那一節])`。它只對 `skills:sync` 成立（38 節**剛好**全是 `pnpm x:y`），
 * 而對另外兩種形狀**靜默地量出一個假的答案**（`ok:false · writes:[]`）：
 *
 * | 形狀 | 例 | 舊行為 |
 * |---|---|---|
 * | **葉子**（沒有 pnpm 前綴） | `vfxfam:build` = `tsx apps/client/…/generateFamilyContent.ts` | `pnpm "tsx apps/…"` ⇒ Command not found |
 * | **多 token** | `content:build` 的 `pnpm --filter @ggd/shared content:build` | 整串當成一個 script 名 ⇒ 同上 |
 *
 * ⚠️ 而 trace 的收尾訊息會說「⚠️ 沙盒裡紅了 N 支(⛔ 不影響 I/O 量測)」——
 * ⛔ 在這個情況那一句是**假的**，量測正是被它毀掉的。⇒ 訊息指向錯的地方，
 * 上一輪因此往權限與探針查了兩圈，而根因在**解析**這一層。
 *
 * ⭐ 葉子的正解是**原封不動跑 `pnpm <SCRIPT>` 本人**，⛔ 不是把它拆開自己執行：
 * 第一版改成 `bash -lc "tsx apps/…"` 得到 **exit 127**（`tsx` 不在 login shell 的
 * PATH 上）—— 那是同一個病的第二層：把 pnpm 的工作（架好 `node_modules/.bin`）
 * 自己重做一遍，然後在別的地方失敗。
 */

/**
 * @param {string} chain   package.json 裡那一行（`pnpm a && pnpm b` 或一句原始指令）
 * @param {string} script  `--script` 給的名字（葉子時它就是步驟名）
 * @returns {{label:string, cmd:string, args:string[], raw:boolean}[]}
 */
export function parseChain(chain, script) {
  return String(chain)
    .split("&&")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((seg, _i, all) => {
      const tok = seg.split(/\s+/);
      if (tok[0] !== "pnpm") {
        // ⭐ 葉子：讓 pnpm 自己跑它（PATH／cwd／生命週期全部照舊）。
        if (all.length === 1) return { label: script, cmd: "pnpm", args: [script], raw: false };
        return { label: seg, cmd: "bash", args: ["-c", seg], raw: true };
      }
      const rest = tok.slice(1);
      // 標籤取**最後一個帶冒號的 token**（`pnpm --filter @ggd/shared content:build` ⇒ content:build）。
      const label = [...rest].reverse().find((t) => t.includes(":")) ?? rest.join(" ");
      return { label, cmd: "pnpm", args: rest, raw: false };
    });
}

/**
 * 解析出來卻**不存在**的 script 名 —— ⛔ 有這種就不要跑下去產出假量測。
 * @param {{args:string[], raw:boolean}[]} steps
 * @param {Record<string,string>} scripts
 */
export function ghostSteps(steps, scripts) {
  return steps.filter((s) => !s.raw && s.args.length === 1 && !scripts?.[s.args[0]]).map((s) => s.args[0]);
}
