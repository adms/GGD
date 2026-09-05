/**
 * ⭐⭐ P0-1 —— route / 權限 / CAS 的證據。
 *
 * ⚠️ ⭐ 這一支讀**真的戶籍表**（⛔ 不是自造夾具）：擁有權來自出貨的
 * `tools/parallel-gates/sync-io.json` 與 `normalizers.json`，
 * ⇒ ⛔ 一份自造的戶籍表證明不了「出貨時擋得住」（失敗形態⑤）。
 * ⭐ GH#1002：那幾份**複製**到 `mkdtemp()` 沙盒（`testSourceSandbox.ts`）再當 repoRoot ——
 * ④⑤⑥ 會寫 `heroes/godie-e00s.py`，⛔ 寫的是沙盒那一份，出貨樹一個位元組都不動
 * （`finally` 還原只在 process 活著時跑；worker 被殺就留殘骸 —— 那正是 #1002 的形狀）。
 *
 * ⭐ 而**重生成器被注入**（`runRegenerate`）—— 真的跑 `skillremake:json` 要幾分鐘，
 * ⛔ 而這條守衛要驗的是**接線與 CAS**，不是產生器本身。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `registerProductWriteGuard` 的 `if (ownership !== "generator-owned") return;`
 *     改成無條件 return → 🔴（②：直接 PUT 產物被放行）
 *   · CAS 那一段（`before.sha256 !== expectedSourceSha256`）拿掉 → 🔴（④）
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { makeSourceSandbox, removeSandbox } from "./testSourceSandbox";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { sha256Hex } from "@ggd/shared/content/import/editorSource";
import {
  registerEditorSourceRoutes,
  registerProductWriteGuard,
} from "./editorSourceRoutes";

/** ⭐ 沙盒根（GH#1002）—— ④⑤⑥ 寫來源，寫的都是它底下那一份，⛔ 不是出貨樹。 */
let root: string;
beforeAll(() => {
  root = makeSourceSandbox("routes");
});
afterAll(() => removeSandbox(root));
/** ⭐ 一份**產生器擁有**的技能（`skillremake:json` → `godie-e00s.py`）。 */
const GEN = { collection: "abilities", id: "godie-e00s.r" };
/** ⭐ 一份**只被正規化器碰過**的技能 ⇒ 可直接寫產物。 */
const PLAIN = { collection: "abilities", id: "godie-e010.r" };

let app: FastifyInstance;
const ran: string[] = [];

beforeEach(async () => {
  ran.length = 0;
  app = Fastify({ logger: false });
  const opts = {
    repoRoot: root,
    contentDir: resolve(root, "content"),
    runRegenerate: (cmd: string): void => void ran.push(cmd),
  };
  registerProductWriteGuard(app, opts);
  registerEditorSourceRoutes(app, opts);
  await app.ready();
});
afterEach(async () => {
  await app.close();
});

describe("P0-1 editor-source", () => {
  it("★ ① GET 說得出擁有權、來源與**唯一**的重生成指令", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/content-api/editor-source?collection=${GEN.collection}&id=${GEN.id}`,
    });
    expect(r.statusCode).toBe(200);
    const b = r.json() as Record<string, unknown>;
    expect(b["schema"]).toBe("ggd-editor-source@1");
    const own = b["ownership"] as {
      kind: string;
      sourcePaths: string[];
      regenerateCommand: string;
      editableMembers: string[];
    };
    expect(own.kind).toBe("generator-owned");
    expect(b["outputPath"]).toBe("content/abilities/godie-e00s.r.json");
    expect(b["writePolicy"], "⛔ 產生器的產物不可以標成可直接寫").toBe(
      "source-adapter",
    );
    expect(own.sourcePaths).toEqual([
      "tools/skill-remake/heroes/godie-e00s.py",
    ]);
    expect(own.regenerateCommand).toBe(
      "bash scripts/genrun.sh skillremake:json",
    );
    // ⭐ blast radius：改這份來源會**一起**重生成六支技能 ＋ 一張英雄卡。
    expect(
      own.editableMembers,
      "⛔ 沒有交出 blast radius ⇒ 編輯器以為改來源只動它點開的那一份",
    ).toContain("content/champions/godie-e00s.json");
    expect(own.editableMembers.length).toBeGreaterThan(1);
    // ⭐⭐ 契約要**明說**哪幾格不會原樣存活（量出來的：77 與 90 同級距 ⇒ 都回 90）。
    expect(
      b["normalizedFields"] as string[],
      "⛔ 沒有宣告級距擁有的欄位 ⇒ 編輯器寫 77 拿回 90，會判定接縫壞掉",
    ).toContain("cooldown");
    const src = b["source"] as { path: string; sha256: string; text: string };
    expect(src.path).toBe("tools/skill-remake/heroes/godie-e00s.py");
    expect(src.sha256).toHaveLength(64);
    expect(
      src.text.length,
      "⛔ 沒有把來源文字交出去 ⇒ 編輯器改不了它",
    ).toBeGreaterThan(100);
    const src2 = b["source"] as { path: string };
    expect(src2.path, "儀器：來源路徑與 ownership 那一份必須一致").toBe(
      own.sourcePaths[0],
    );
  });

  it("★★ ⭐ ② **伺服器**拒絕直接寫產生器的產物（⛔ 不是靠編輯器 UI）", async () => {
    for (const method of ["PUT", "POST", "DELETE"] as const) {
      const r = await app.inject({
        method,
        url: `/content-api/${GEN.collection}/${GEN.id}`,
        payload:
          method === "DELETE" ? undefined : { id: GEN.id, schema: "ability@1" },
      });
      expect(
        r.statusCode,
        `⛔⛔ ${method} 直接寫產生器的產物被**放行**了 —— 下一次 skills:sync 會把它打回來，\n` +
          `⭐ 而那個「又變回去了」看起來像新的錯。`,
      ).toBe(409);
      expect((r.json() as { error: string }).error).toBe(
        "GENERATOR_OWNED_PRODUCT",
      );
    }
  });

  it("⭐ ③ 只被**正規化器**碰過的那一份**放行**（⛔ 不可以全部擋掉）", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/content-api/editor-source?collection=${PLAIN.collection}&id=${PLAIN.id}`,
    });
    const b = r.json() as { ownership: { kind: string }; writePolicy: string };
    expect(
      b.ownership.kind,
      "⛔ 把正規化器算成作者 ⇒ 331 份手編技能全部變成唯讀",
    ).toBe("normalizer-only");
    expect(b.writePolicy).toBe("document");
    // ⭐ 而 onRequest 那道閘也必須放行它（⛔ 只有 GET 說可以是不夠的）。
    const w = await app.inject({
      method: "PUT",
      url: `/content-api/${PLAIN.collection}/${PLAIN.id}`,
      payload: {},
    });
    expect(w.statusCode, "⛔ 閘擋掉了一份可以直接寫的文件").not.toBe(409);
  });

  it("★★ ⭐ ④ CAS：來源 hash 不符 ⇒ **409，一個位元組都不寫**", async () => {
    const srcAbs = resolve(root, "tools/skill-remake/heroes/godie-e00s.py");
    const before = readFileSync(srcAbs, "utf8");
    // ⛔⛔ 2026-09-02 的事故：這一條斷言「檔案沒被改」，⇒ 我**沒有寫 finally**。
    //   而做突變（把 CAS 拿掉）時那個寫入**真的發生了** —— 16,633 bytes 的來源檔
    //   變成 33 bytes，⭐ 救回來是靠一份手動 `cp` 的備份。
    // ⇒ ⭐ 判準：**任何會寫真實檔案的測試，`finally` 一律無條件還原** ——
    //   ⛔ 不是「這條測試理論上不會寫」（突變的整個用途就是讓它寫）。
    try {
      const r = await app.inject({
        method: "POST",
        url: "/content-api/editor-source",
        payload: {
          ...GEN,
          expectedSourceSha256: "0".repeat(64),
          source: "# 這一份不可以被寫進去\n",
        },
      });
      expect(r.statusCode).toBe(409);
      expect((r.json() as { error: string }).error).toBe("SOURCE_CHANGED");
      expect(
        readFileSync(srcAbs, "utf8"),
        "⛔⛔ CAS 失敗而來源**被改了** —— 那正是 CAS 要防的事",
      ).toBe(before);
      expect(ran, "⛔ CAS 失敗還跑了重生成").toEqual([]);
    } finally {
      writeFileSync(srcAbs, before, "utf8");
    }
  });

  it("★★ ⭐ ⑤ CAS 相符 ⇒ 寫來源 ＋ 跑**那一個**重生成指令；⚠️ 而重生成失敗要**還原**", async () => {
    const srcAbs = resolve(root, "tools/skill-remake/heroes/godie-e00s.py");
    const before = readFileSync(srcAbs, "utf8");
    const edited = `${before}\n# editor-source CAS 測試（測試自己會還原）\n`;
    try {
      const ok = await app.inject({
        method: "POST",
        url: "/content-api/editor-source",
        payload: {
          ...GEN,
          expectedSourceSha256: sha256Hex(before),
          source: edited,
          reason: "test",
        },
      });
      expect(ok.statusCode, `⛔ ${JSON.stringify(ok.json())}`).toBe(200);
      expect(readFileSync(srcAbs, "utf8"), "⛔ 來源沒有被寫進去").toBe(edited);
      expect(ran, "⛔ 沒有跑重生成 ⇒ 產物與來源會不一致").toEqual([
        "bash scripts/genrun.sh skillremake:json",
      ]);
      const body = ok.json() as {
        product: { changed: boolean; before: string; after: string };
      };
      // ⚠️ ⭐ 只加一行註解 ⇒ 產物**不會**變 —— 而回應必須**說出來**（⛔ 不是假裝有變）。
      expect(body.product.changed).toBe(false);
    } finally {
      writeFileSync(srcAbs, before, "utf8");
    }
  });

  it("⭐ ⑥ 重生成失敗 ⇒ 來源**還原**，⛔ 不留半套狀態", async () => {
    const srcAbs = resolve(root, "tools/skill-remake/heroes/godie-e00s.py");
    const before = readFileSync(srcAbs, "utf8");
    const boom = Fastify({ logger: false });
    registerEditorSourceRoutes(boom, {
      repoRoot: root,
      contentDir: resolve(root, "content"),
      runRegenerate: () => {
        throw new Error("產生器拒絕了這份來源");
      },
    });
    await boom.ready();
    try {
      const r = await boom.inject({
        method: "POST",
        url: "/content-api/editor-source",
        payload: {
          ...GEN,
          expectedSourceSha256: sha256Hex(before),
          source: `${before}\n# 壞的\n`,
        },
      });
      expect(r.statusCode).toBe(422);
      expect((r.json() as { error: string }).error).toBe("REGENERATE_FAILED");
      expect(
        readFileSync(srcAbs, "utf8"),
        "⛔⛔ 重生成失敗而來源**留著新的** ⇒ 一個「來源新、產物舊」的半套狀態，\n" +
          "⭐ 而下一次任何人跑 sync 都會看到一個他沒做過的改動。",
      ).toBe(before);
    } finally {
      await boom.close();
      writeFileSync(srcAbs, before, "utf8");
    }
  });
});
