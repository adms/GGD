/**
 * GH#498 —— 「**預設不刪除**」是一條行為，不是一個數字。
 *
 * owner 2026-08-21：「對戰錄影 超過幾天的錄影一律刪掉 **預設不刪除**」
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 被測的是**出貨的那一份**，而且測的是磁碟上的檔案
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 對 `DEFAULT_REPLAY_POLICY.retainMaxAgeDays` 斷言 0 是一條永遠綠的廢話 ——
 * 那只是把常數抄一遍（失敗形態 ⑤：被測的不是出貨的那個）。所以這裡：
 *   ① 讀 `content/config/replay.json` 的**位元組**，用出貨 schema 驗過再註冊；
 *   ② 在一個 temp 目錄裡放兩份 mtime 被推到**一年前**的假錄影；
 *   ③ 跑真的 `pruneReplays()`，看檔案**還在不在**。
 *
 * ⚠️ 出貨值（0 / 0）刻意**不寫進斷言** —— CLAUDE.md 第零守則：出貨數值住進測試
 * 就是第四個住處，而且它一定會過期。所有門檻都從讀進來的那份出貨文件推導
 * （`ageDays` 由 `retainMaxAgeDays` 算出來），所以 owner 哪天把它調成 7 天，
 * 這一支仍然在測「7 天以內的不刪、7 天以上的刪」而不是紅在一個字面值上。
 *
 * ── 突變（做過）────────────────────────────────────────────────────────────
 * `content/config/replay.json` 的 `retainMaxAgeDays` 改回 30 →
 *   「⭐ 出貨設定下，一年前的錄影不會被刪」紅（兩份都被刪掉）。
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Configs, zConfigReplayDoc } from "@ggd/shared/content";
import { pruneReplays, replayStorage } from "./store";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SHIPPED = join(REPO_ROOT, "content", "config", "replay.json");

/** 出貨的那一份，先過出貨 Zod 再用 —— 一份 schema 拒絕的文件不該讓這支綠。 */
function shipped(): ReturnType<typeof zConfigReplayDoc.parse> {
  return zConfigReplayDoc.parse(JSON.parse(readFileSync(SHIPPED, "utf8")));
}

let dir = "";
let savedDir: string | undefined;

/** 一份佔位錄影，mtime 推到 `ageDays` 天前。 */
function tape(id: string, ageDays: number): void {
  const path = join(dir, `${id}.jsonl.gz`);
  writeFileSync(path, "not a real recording, prune does not parse\n");
  const t = new Date(Date.now() - ageDays * 86_400_000);
  utimesSync(path, t, t);
}

function tapes(): string[] {
  return readdirSync(dir).filter((n) => n.endsWith(".jsonl") || n.endsWith(".jsonl.gz"));
}

beforeEach(() => {
  savedDir = process.env.GGD_REPLAY_DIR;
  dir = mkdtempSync(join(tmpdir(), "ggd-replay-retention-"));
  process.env.GGD_REPLAY_DIR = dir;
  Configs.clear();
});

afterEach(() => {
  Configs.clear();
  if (savedDir === undefined) delete process.env.GGD_REPLAY_DIR;
  else process.env.GGD_REPLAY_DIR = savedDir;
  rmSync(dir, { recursive: true, force: true });
});

describe("錄影保留量：出貨預設不刪 (replay-retention-default-keeps)", () => {
  it("⭐ 出貨設定下，一年前的錄影不會被刪 —— 也不會因為份數被刪", async () => {
    const doc = shipped();
    Configs.register(doc as never);
    tape("last-year", 365);
    tape("last-week", 7);
    // 「份數」那一條也要被關上：只讓天數認得 0 的實作在這裡仍然是綠的，
    // 所以再放一份，並確認**三份都還在**（份數上限若還是 1 就會刪掉兩份）。
    tape("yesterday", 1);

    const deleted = await pruneReplays([]);
    expect(deleted, "出貨設定下不應該刪掉任何一份錄影").toEqual([]);
    expect(tapes().sort()).toEqual(["last-week.jsonl.gz", "last-year.jsonl.gz", "yesterday.jsonl.gz"]);
  });

  it("填了天數就照刪 —— 「不刪」是 0 的意思，不是「保留功能被拿掉了」", async () => {
    // 對照組。沒有它，一個把 pruneReplays 整段改成 `return []` 的實作也會讓
    // 上面那條綠（失敗形態 ③：可以從樹上刪掉而測試全綠）。
    const days = 3;
    Configs.register({ ...shipped(), retainMaxAgeDays: days, retainMaxFiles: 0 } as never);
    tape("too-old", days * 2);
    tape("fresh", 0);
    expect(await pruneReplays([])).toEqual(["too-old"]);
    expect(tapes()).toEqual(["fresh.jsonl.gz"]);
  });

  it("填了份數就照刪，而且和天數各自獨立（只改一條不會關掉另一條）", async () => {
    Configs.register({ ...shipped(), retainMaxFiles: 1, retainMaxAgeDays: 0 } as never);
    tape("older", 2);
    tape("newest", 0);
    expect(await pruneReplays([])).toEqual(["older"]);
    expect(tapes()).toEqual(["newest.jsonl.gz"]);
  });

  it("正在錄的那一場永遠不會被刪，即使兩條規則都指著它", async () => {
    Configs.register({ ...shipped(), retainMaxFiles: 1, retainMaxAgeDays: 1 } as never);
    tape("live-now", 999);
    expect(await pruneReplays(["live-now"])).toEqual([]);
    expect(tapes()).toEqual(["live-now.jsonl.gz"]);
  });

  it("⭐「不刪」的煞車：後台拿得到佔用量、份數與**整顆碟的剩餘空間**", async () => {
    // 這一條就是「為什麼可以安心把預設改成不刪」的那一半。⛔ 只回自己佔多少
    // 是一個只驗名詞的儀表 —— 磁碟快滿的那一天它仍然是綠的。
    Configs.register(shipped() as never);
    tape("a", 0);
    tape("b", 0);
    const s = await replayStorage();
    expect(s.files).toBe(2);
    expect(s.bytes).toBeGreaterThan(0);
    expect(s.dir).toBe(dir);
    // 保留量隨著設定走（後台不必自己再讀一次內容登錄表）。
    expect(s.retainMaxAgeDays).toBe(shipped().retainMaxAgeDays);
    expect(s.retainMaxFiles).toBe(shipped().retainMaxFiles);
    // statfs 在 CI 的某些檔案系統上可能不答；不答要回 null 而不是丟。
    if (s.freeBytes !== null) expect(s.freeBytes).toBeGreaterThan(0);
    if (s.totalBytes !== null) expect(s.totalBytes).toBeGreaterThan(0);
  });
});
