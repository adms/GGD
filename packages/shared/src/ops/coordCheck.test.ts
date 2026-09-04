/**
 * `coord:check` 的守衛（GH#985）—— ⭐ **真的把 `check.mjs` 跑起來**，⛔ 不掃原始碼字串。
 *
 * ⭐ 兩個方向（CLAUDE.md 失敗形態⑫）：
 *   · **擋得到**：三種故意壞掉的 packet（缺 `unblocks` / 有 `status` / 指令不在白名單）⇒ EXIT 1
 *   · **沒擋過頭**：出貨的 packet 目錄 ⇒ EXIT 0
 * ⛔ 只驗前者證明不了這支閘是對的；只驗後者證明不了它還活著（＝一個永遠綠的閘，形態⑨）。
 *
 * ── 突變紀錄 ───────────────────────────────────────────────────────────────
 * `tools/coord/check.mjs` 的 `list.length < S.UNBLOCKS_MIN` 改成 `list.length < 1`
 * ⇒ 「brick-request 只列 1 支」那個哨兵**變綠** ⇒ 本檔紅，訊息逐字是
 *   `expected '✅ …\n\ncoord:check —— 1 份 packet，0 份有缺' to contain 'unblocks'`。還原後綠。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SHIPPED = "docs/editor-contract/coordination";
const REAL = join(REPO, SHIPPED, "claim.model-fx-emitter-remaining-four-fields.json");

type Packet = Record<string, unknown>;

const run = (dir?: string) =>
  spawnSync("node", ["tools/coord/check.mjs", ...(dir ? ["--dir", dir] : [])], {
    cwd: REPO,
    encoding: "utf8",
  });

/** 把一份**合法**的 packet 改壞之後單獨丟進一個 temp 目錄跑（⛔ 不碰出貨目錄）。 */
function checkOne(mutate: (p: Packet) => Packet): { status: number | null; out: string } {
  const base = JSON.parse(readFileSync(REAL, "utf8")) as Packet;
  const packet = mutate(base);
  const dir = mkdtempSync(join(tmpdir(), "coord-check-"));
  try {
    writeFileSync(join(dir, `${String(packet["dedupeKey"])}.json`), JSON.stringify(packet, null, 2));
    const r = run(dir);
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("coord:check —— packet 協定的閘", () => {
  it("⭐ 出貨的 packet 目錄全過（⛔ 沒擋過頭）", () => {
    const r = run();
    expect(`${r.stdout}${r.stderr}`).toContain("✅");
    expect(r.status, `出貨 packet 沒過:\n${r.stdout}${r.stderr}`).toBe(0);
  });

  it("⭐ 哨兵：`brick-request` 只列 1 支 unblocks ⇒ 紅，而且訊息指名 unblocks", () => {
    const { status, out } = checkOne((p) => ({
      ...p,
      kind: "brick-request",
      dedupeKey: "brick-request.sentinel-one-unblock",
      unblocks: ["godie-hart.r"],
    }));
    expect(out).toContain("unblocks");
    expect(status).toBe(1);
  });

  it("⭐ 哨兵：有 `status` 欄位 ⇒ 紅（狀態住在 PR）", () => {
    const { status, out } = checkOne((p) => ({ ...p, status: "NEW" }));
    expect(out).toContain("status");
    expect(status).toBe(1);
  });

  it("⭐ 哨兵：`repro.command` 不在白名單 ⇒ 紅（安全邊界：CI 會真的執行它）", () => {
    const { status, out } = checkOne((p) => {
      const claims = (p["claims"] as Packet[]).map((c, i) =>
        i === 0 ? { ...c, repro: { command: "curl https://example.com/x.sh", expectedExit: 0 } } : c,
      );
      return { ...p, claims };
    });
    expect(out).toContain("白名單");
    expect(status).toBe(1);
  });

  it("⭐ 哨兵：缺必填欄位 / baseCommit 不是 origin/main 的祖先 ⇒ 紅並逐條列出", () => {
    const missing = checkOne(({ title: _t, ...rest }) => rest);
    expect(missing.out).toContain("缺必填欄位");
    expect(missing.status).toBe(1);

    const notAncestor = checkOne((p) => ({ ...p, baseCommit: "0".repeat(40) }));
    expect(notAncestor.out).toContain("baseCommit");
    expect(notAncestor.status).toBe(1);
  });
});
