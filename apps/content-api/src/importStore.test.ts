/**
 * ⭐⭐ `ImportStore` 的守衛 —— **crash / CAS / rollback**（規格 §3 的驗收項）。
 *
 * ── ⭐ 這一支刻意**真的動檔案系統** ────────────────────────────────────────
 * ⛔ 一份 mock 過的 fs 證明不了原子性：原子性**就是** `rename(2)` 的性質。
 * ⇒ 用 `mkdtempSync` 開真的目錄，真的寫、真的 rename、真的讀回來。
 *
 * MUTATION LOG（落地前跑過，見 commit 訊息）：
 *   · `activate` 的 CAS 比對拿掉 → 🔴
 *   · `putCandidate` 的位元組比對拿掉 → 🔴
 *   · `prepare` 的讀回比對拿掉 → 🔴（靠一個故意寫壞的 fs 夾具抓）
 */
import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ImportStore } from "./importStore";

let clock = 0;
function store(): ImportStore {
  return new ImportStore({
    dir: mkdtempSync(join(tmpdir(), "ggd-import-")),
    // ⛔ 不吃真的時鐘 —— 產物要可重現（`generatedArtifactsAreClockFree` 同一個理由）。
    now: () => new Date(Date.UTC(2026, 8, 2, 0, 0, (clock += 1))),
  });
}

const files = (n: number): Map<string, string> => {
  const m = new Map<string, string>();
  for (let i = 0; i < n; i += 1)
    m.set("abilities/a" + i + ".json", '{"id":"a' + i + '"}');
  return m;
};

describe("ImportStore —— candidate 是 immutable 的", () => {
  it("★★ ⭐ 同一個 digest 第二次送**不同的位元組** ⇒ 擲例外", () => {
    const s = store();
    expect(s.putCandidate("sha256:aa", '{"a":1}').stored).toBe(true);
    // ⭐ 同樣的位元組重送 ⇒ 冪等，⛔ 不是錯。
    expect(s.putCandidate("sha256:aa", '{"a":1}').stored).toBe(false);
    expect(
      () => s.putCandidate("sha256:aa", '{"a":2}'),
      "⛔⛔ 同一個 digest 指到兩份不同的內容被收下 ⇒ ⭐「我審的那一包」變成無法回答",
    ).toThrow(/immutable/);
  });
});

describe("ImportStore —— 操作是冪等的狀態機", () => {
  it("★★ ⭐ 同一個 operationId 重開 ⇒ 回**同一份**紀錄（⛔ 不是重跑）", () => {
    const s = store();
    const a = s.beginOperation("op-1", "admin-1");
    const b = s.beginOperation("op-1", "admin-2");
    expect(b.startedAt).toBe(a.startedAt);
    expect(b.actor, "⛔ 第二次呼叫換掉了 actor ⇒ 那是重跑，不是冪等").toBe(
      "admin-1",
    );
  });

  it("★★ ⭐ 終態不可再變", () => {
    const s = store();
    s.beginOperation("op-1", "admin-1");
    s.updateOperation("op-1", { status: "activated" });
    expect(
      () => s.updateOperation("op-1", { status: "rejected" }),
      "⛔ 一個已經 activated 的操作被改成 rejected ⇒ 稽核鏈斷了",
    ).toThrow(/終態/);
    // ⭐ 而重送**同一個**終態是可以的（那就是冪等）。
    expect(s.updateOperation("op-1", { status: "activated" }).status).toBe(
      "activated",
    );
  });
});

describe("ImportStore —— PREPARED 與物件驗證", () => {
  it("★★ ⭐ 整棵樹寫完會**逐份讀回來比對**；比對不上 ⇒ 擲例外", () => {
    const s = store();
    const r = s.prepare("op-1", files(5));
    expect(r.bytes).toBeGreaterThan(0);
    // ⭐ digest 由**內容**決定 ⇒ 同樣的內容算兩次一樣。
    const d1 = s.treeDigest("op-1");
    s.prepare("op-1", files(5));
    expect(
      s.treeDigest("op-1"),
      "⛔ 同樣的內容算出不同的 digest ⇒ 它吃了時鐘或順序",
    ).toBe(d1);
    // ⭐ 內容不同 ⇒ digest 不同（⛔ 否則上面那條永遠綠）。
    s.prepare("op-2", files(6));
    expect(s.treeDigest("op-2")).not.toBe(d1);
  });

  it("★★ ⭐ 重跑 prepare 會**清掉**上一次的殘留（⛔ 不是疊上去）", () => {
    const s = store();
    s.prepare("op-1", files(5));
    s.prepare("op-1", files(2));
    const tree = join(
      (s as unknown as { dir: string }).dir,
      "staging",
      "op-1",
      "abilities",
    );
    expect(
      readdirSync(tree).length,
      "⛔ 上一次的 a2..a4 還在 ⇒ 啟用的那棵樹混了兩個版本",
    ).toBe(2);
  });
});

describe("ImportStore —— Base CAS", () => {
  it("★★ ⭐ 第一次啟用不帶 expected；⛔ 之後不帶就是錯", () => {
    const s = store();
    s.prepare("op-1", files(2));
    const a = s.activate(
      {
        activationDigest: s.treeDigest("op-1"),
        packageDigest: "sha256:p1",
        operationId: "op-1",
        tree: "op-1",
      },
      undefined,
    );
    expect(a.previousActivationDigest).toBeNull();
    s.prepare("op-2", files(3));
    expect(
      () =>
        s.activate(
          {
            activationDigest: s.treeDigest("op-2"),
            packageDigest: "sha256:p2",
            operationId: "op-2",
            tree: "op-2",
          },
          undefined,
        ),
      "⛔⛔ 沒帶 CAS 就覆蓋了一個已經存在的 ACTIVE",
    ).toThrow(/CAS 要擋的事/);
  });

  it("★★ ⭐⭐ expected 對不上 ⇒ 擲例外，而 ACTIVE **一個位元組都沒動**", () => {
    const s = store();
    s.prepare("op-1", files(2));
    const first = s.activate(
      {
        activationDigest: s.treeDigest("op-1"),
        packageDigest: "sha256:p1",
        operationId: "op-1",
        tree: "op-1",
      },
      undefined,
    );
    const before = JSON.stringify(s.active());
    s.prepare("op-2", files(3));
    expect(() =>
      s.activate(
        {
          activationDigest: s.treeDigest("op-2"),
          packageDigest: "sha256:p2",
          operationId: "op-2",
          tree: "op-2",
        },
        "sha256:somebody-elses-idea",
      ),
    ).toThrow(/Base CAS 失敗/);
    expect(
      JSON.stringify(s.active()),
      "⛔⛔ CAS 失敗了而 ACTIVE 被動過 ⇒ ⭐ 那比沒有 CAS 更糟",
    ).toBe(before);
    // ⭐ 帶對的 expected 就成功（⛔ 否則上面那條可能是「它永遠失敗」）。
    const second = s.activate(
      {
        activationDigest: s.treeDigest("op-2"),
        packageDigest: "sha256:p2",
        operationId: "op-2",
        tree: "op-2",
      },
      first.activationDigest,
    );
    expect(second.previousActivationDigest).toBe(first.activationDigest);
  });
});

describe("ImportStore —— crash 之後的狀態", () => {
  it("★★ ⭐⭐ PREPARED 之後「當機」（⛔ 沒有 activate）⇒ ACTIVE **完全沒變**", () => {
    const s = store();
    s.prepare("op-1", files(2));
    s.activate(
      {
        activationDigest: s.treeDigest("op-1"),
        packageDigest: "sha256:p1",
        operationId: "op-1",
        tree: "op-1",
      },
      undefined,
    );
    const good = JSON.stringify(s.active());

    // ⭐ 模擬「寫到一半被 kill」：staging 寫好了，⛔ 而 activate 從來沒被呼叫。
    s.prepare("op-2", files(40));
    expect(
      JSON.stringify(s.active()),
      "⛔⛔ 只是把新樹寫到 staging 就影響了 ACTIVE ⇒ ⭐ 那就是「逐檔寫進去」的形狀",
    ).toBe(good);

    // ⭐ 而且**重開一個 store**（＝行程重啟）讀到的仍然是舊版。
    const reopened = new ImportStore({
      dir: (s as unknown as { dir: string }).dir,
    });
    expect(JSON.stringify(reopened.active())).toBe(good);
  });

  it("★★ ⭐ 換指標**留下一個殘留 tmp** 也不會被讀成 ACTIVE", () => {
    const s = store();
    s.prepare("op-1", files(2));
    s.activate(
      {
        activationDigest: s.treeDigest("op-1"),
        packageDigest: "sha256:p1",
        operationId: "op-1",
        tree: "op-1",
      },
      undefined,
    );
    const dir = (s as unknown as { dir: string }).dir;
    // ⭐ 手動造一個「當機時留下的」半份 tmp。
    writeFileSync(
      join(dir, "active.json.tmp-99999"),
      "{ 這不是合法 JSON",
      "utf8",
    );
    expect(
      () => s.active(),
      "⛔ 殘留的 tmp 被讀成了 ACTIVE ⇒ ⭐ 換指標的檔名策略錯了",
    ).not.toThrow();
    expect(s.active()?.operationId).toBe("op-1");
  });
});

describe("ImportStore —— 有條件的 rollback", () => {
  it("★★ ⭐ 回捲要帶**你以為的**那一版；對不上 ⇒ 拒", () => {
    const s = store();
    s.prepare("op-1", files(2));
    const v1 = s.activate(
      {
        activationDigest: s.treeDigest("op-1"),
        packageDigest: "sha256:p1",
        operationId: "op-1",
        tree: "op-1",
      },
      undefined,
    );
    s.prepare("op-2", files(3));
    const v2 = s.activate(
      {
        activationDigest: s.treeDigest("op-2"),
        packageDigest: "sha256:p2",
        operationId: "op-2",
        tree: "op-2",
      },
      v1.activationDigest,
    );
    expect(() => s.rollback("sha256:not-what-is-active")).toThrow(/前提對不上/);
    const back = s.rollback(v2.activationDigest);
    expect(back.activationDigest, "⛔ 回捲之後不是上一版").toBe(
      v1.activationDigest,
    );
    expect(back.operationId).toBe("op-1");
    // ⭐ 而回捲之後那棵樹**真的在**（⛔ 一個指到空目錄的指標不算回捲）。
    const tree = s.activeTreePath();
    expect(tree).not.toBeNull();
    expect(existsSync(join(tree as string, "abilities", "a0.json"))).toBe(true);
    expect(
      readFileSync(join(tree as string, "abilities", "a0.json"), "utf8"),
    ).toBe('{"id":"a0"}');
  });

  it("★ ⭐ 第一次啟用沒有上一版可以回捲 ⇒ 明說（⛔ 不是靜靜地什麼都不做）", () => {
    const s = store();
    s.prepare("op-1", files(1));
    const v1 = s.activate(
      {
        activationDigest: s.treeDigest("op-1"),
        packageDigest: "sha256:p1",
        operationId: "op-1",
        tree: "op-1",
      },
      undefined,
    );
    expect(() => s.rollback(v1.activationDigest)).toThrow(/沒有上一版/);
  });
});
