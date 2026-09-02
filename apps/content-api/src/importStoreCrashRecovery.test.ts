/**
 * ⭐⭐ **掛在半路 ⇒ 重開之後看得到的仍然是一個一致的狀態。**
 *
 * ── ⛔ 交接文件逐字列的必要條件 ─────────────────────────────────────────
 * 「immutable candidate storage、**PREPARED/preload**、**fsync/object verification**、
 *   Base CAS、**原子 ACTIVE pointer**、health read-back…」
 *
 * ⭐ 而 `importRoutesG2.test.ts` 已經驗過 validate / apply / rollback / CAS /
 * 冪等 / ZIP —— ⛔ **沒有一條驗「掛掉」**。
 *
 * ── ⭐ 這一支問的三個崩潰點 ─────────────────────────────────────────────
 *  ① **PREPARED 之後、activate 之前**掛掉
 *     ⇒ ⭐ ACTIVE 一個位元組都不可以動（那棵樹只是躺在旁邊）
 *  ② `atomicReplace` 的 **tmp 檔留下來**（rename 之前掛）
 *     ⇒ ⭐ 重開後 ACTIVE 仍是舊的，⛔ 而不是半份 JSON
 *  ③ **同一個 dir 重新開一個 store**（＝ 進程重啟）
 *     ⇒ ⭐ 讀得到 activate 之前的那一版
 *
 * ⚠️ ⭐ 為什麼「重新 new 一個 store」是對的模擬：這一層**沒有記憶體狀態** ——
 * `active()` 每次都讀 `active.json`。⛔ 而如果哪天它加了快取，這條會紅，
 * ⭐ 那正是它該紅的時候（一個有快取的 ACTIVE 指標在崩潰後會說謊）。
 *
 * MUTATION LOG（落地前真的跑過）：
 *   · ⚠️ ⭐ `atomicReplace` 改成**直接寫目標路徑** → **🟢 仍然綠**
 *     ⇒ ⛔ ②**不是**原子性的證明（理由寫在那一條裡）。誠實記著。
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ImportStore } from "./importStore";

function store(dir: string): ImportStore {
  return new ImportStore({ dir, now: () => new Date("2026-09-02T00:00:00Z") });
}

function tree(s: ImportStore, op: string, id: string): void {
  s.prepare(op, new Map([[`abilities/${id}.json`, JSON.stringify({ id }, null, 2)]]));
}

describe("匯入的崩潰復原", () => {
  it("★★ ⭐ ① PREPARED 之後、activate 之前掛掉 ⇒ ACTIVE **一個位元組都沒動**", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-crash-"));
    try {
      const s = store(dir);
      // 先有一個 ACTIVE
      tree(s, "op-1", "first");
      const a1 = s.activate(
        { tree: "op-1", activationDigest: s.treeDigest("op-1"), packageDigest: "sha256:aaa", operationId: null },
        undefined,
      );
      // ⭐ 再 PREPARE 第二棵，⛔ 而**不** activate（＝在那之間掛掉）
      tree(s, "op-2", "second");
      // ⭐ 重開（＝進程重啟）
      const after = store(dir).active();
      expect(
        after?.activationDigest,
        "⛔⛔ PREPARED 的那一棵影響到了 ACTIVE ⇒\n" +
          "   ⭐ 一棵還沒被啟用的樹，對玩家來說必須**完全不存在**。",
      ).toBe(a1.activationDigest);
      // ⭐ 而那棵樹**還在**（⛔ 沒有被清掉 —— 它是可以繼續 apply 的候選）
      expect(readdirSync(join(dir, "staging"))).toContain("op-2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("★ ⭐ ② 崩潰留下的**殘留 tmp 檔**不影響讀取（⚠️ ⛔ 它證明不了原子性）", () => {
    // ⚠️⚠️ ⭐ **誠實記著：這一條不是原子性的證明。**
    //   突變驗過：把 `atomicReplace` 改成**直接寫目標路徑** → **仍然綠**
    //   ⇒ ⛔ 因為直寫也會產生一份**完整**的 `active.json`，
    //     而這條測試只是放了一個**旁邊的**殘留檔。
    //
    // ⭐ 它真正驗到的是一個**真的會發生**的崩潰後果：
    //   斷電會留下 `active.json.tmp-<pid>` ⇒ ⛔ 讀取端不可以被它干擾。
    //
    // ⚠️ ⭐ 而「寫到一半的目標檔」在這一層**測不到** ——
    //   `atomicReplace` 用 tmp+rename 讓那個狀態**結構上不存在**，
    //   ⛔ 而要證明它就得讓 `writeDurable` 在半路失敗（那需要把它變成可注入的）。
    //   ⇒ ⭐ 記在這裡，⛔ 不假裝這條守住了它。
    const dir = mkdtempSync(join(tmpdir(), "ggd-crash-"));
    try {
      const s = store(dir);
      tree(s, "op-1", "first");
      const a1 = s.activate(
        { tree: "op-1", activationDigest: s.treeDigest("op-1"), packageDigest: "sha256:aaa", operationId: null },
        undefined,
      );
      // ⭐ 模擬「寫到一半就斷電」：tmp 檔在，⛔ 而 rename 沒發生。
      writeFileSync(join(dir, "active.json.tmp-99999"), '{"schema":"半份 JSON', "utf8");
      const after = store(dir).active();
      expect(
        after?.activationDigest,
        "⛔⛔ 半寫的 tmp 檔影響到了讀出來的 ACTIVE ⇒\n" +
          "   ⭐ `atomicReplace` 的整個意義就是**它不會**（先寫 tmp、fsync、再 rename）。",
      ).toBe(a1.activationDigest);
      // ⭐ 而 `active.json` 本身仍然是**完整可解析**的
      expect(() => JSON.parse(readFileSync(join(dir, "active.json"), "utf8"))).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("★★ ⭐ ③ 重啟之後 CAS 的**前提**仍然對得上（⛔ 不是重開就放行）", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-crash-"));
    try {
      const s = store(dir);
      tree(s, "op-1", "first");
      const a1 = s.activate(
        { tree: "op-1", activationDigest: s.treeDigest("op-1"), packageDigest: "sha256:aaa", operationId: null },
        undefined,
      );
      // ⭐ 重啟之後拿**過期的**前提去 activate ⇒ 必須擲例外
      const s2 = store(dir);
      tree(s2, "op-2", "second");
      expect(
        () =>
          s2.activate(
            { tree: "op-2", activationDigest: s2.treeDigest("op-2"), packageDigest: "sha256:bbb", operationId: null },
            "sha256:過期的前提",
          ),
        "⛔⛔ 重啟之後 CAS 放行了一個過期的前提 ⇒\n" +
          "   ⭐ 那正是崩潰之後最危險的一刻：呼叫端手上的**是**過期的讀數。",
      ).toThrow();
      // ⭐ 而 ACTIVE 一個位元組都沒動
      expect(store(dir).active()?.activationDigest).toBe(a1.activationDigest);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
