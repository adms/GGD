/**
 * ⭐⭐ **產生器來源轉接器**的 HTTP 面（P0-1）。
 *
 *   GET  /content-api/editor-source?collection=&id=   讀：這一份誰擁有、來源在哪
 *   POST /content-api/editor-source                    寫：CAS 改**來源**再重生成
 *
 * ── ⛔ 為什麼寫入端不是「PUT 那份產物」 ─────────────────────────────────────
 * `content/abilities/` 421 份裡有 **90 份是產生器的產物**。直接寫它們
 * **下一次 `pnpm skills:sync` 就被打回來** —— ⚠️ 而那個「又變回去了」看起來像
 * **新的**錯。CLAUDE.md 逐字記著這個坑發生過**數十次**。
 *
 * ── ⭐ 而擋它的不可以只有編輯器 UI ────────────────────────────────────────
 * `registerProductWriteGuard()` 掛在 `onRequest`（比路由早），對
 * `PUT`／`POST`／`DELETE /content-api/:collection/:id` 檢查擁有權 ——
 * ⇒ ⭐ 一支 curl 也擋得住，⛔ 不是「請編輯器不要這樣做」。
 *
 * ── ⭐ CAS 對的是**來源**，⛔ 不是產物 ─────────────────────────────────────
 * `expectedSourceSha256` 比對來源檔的位元組。不符 ⇒ **409，一個位元組都不寫**。
 * ⚠️ 比對產物是錯的：產物會被正規化器就地改（`castTimeSec`／`provenance`），
 * ⇒ 拿它當 CAS base 會在沒有人改來源的情況下**假衝突**。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  EDITOR_SOURCE_SCHEMA,
  NORMALIZER_OWNED_FIELDS,
  adapterFor,
  membersOf,
  ownershipOf,
  sha256Hex,
  writePolicyFor,
  type NormalizerFacts,
  type SyncIoFacts,
} from "@ggd/shared/content/import/editorSource";

export interface EditorSourceOptions {
  /** repo 根（`tools/`、`content/` 都在它底下）。 */
  repoRoot: string;
  contentDir: string;
  /** ⭐ 注入的執行器，讓測試不必真的跑產生器。預設是真的跑。 */
  runRegenerate?: (command: string, repoRoot: string) => void;
}

const COLLECTION_DIR: Readonly<Record<string, string>> = Object.freeze({
  abilities: "content/abilities",
  champions: "content/champions",
  items: "content/items",
  augments: "content/augments",
  vfx: "content/vfx",
  models: "content/models",
});

interface Facts {
  io: SyncIoFacts;
  norms: NormalizerFacts;
}

function readFacts(repoRoot: string): Facts | null {
  try {
    return {
      io: JSON.parse(
        readFileSync(
          join(repoRoot, "tools/parallel-gates/sync-io.json"),
          "utf8",
        ),
      ) as SyncIoFacts,
      norms: JSON.parse(
        readFileSync(
          join(repoRoot, "tools/parallel-gates/normalizers.json"),
          "utf8",
        ),
      ) as NormalizerFacts,
    };
  } catch {
    return null;
  }
}

/** 產物的 repo-relative 路徑（未知集合 ⇒ null）。 */
export function productPathOf(collection: string, id: string): string | null {
  const dir = COLLECTION_DIR[collection];
  if (dir === undefined) return null;
  // ⛔ 路徑穿越：id 只允許 `[a-z0-9._-]`（同 `curation` 的 idRe）。
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) return null;
  return `${dir}/${id}.json`;
}

function fileFacts(
  abs: string,
): { sha256: string; bytes: number; text: string } | null {
  if (!existsSync(abs)) return null;
  const text = readFileSync(abs, "utf8");
  return { sha256: sha256Hex(text), bytes: statSync(abs).size, text };
}

function bad(
  reply: FastifyReply,
  code: number,
  error: string,
  detail: unknown = {},
): FastifyReply {
  return reply
    .code(code)
    .send({ schema: EDITOR_SOURCE_SCHEMA, error, ...(detail as object) });
}

/**
 * ⭐ **伺服器端**拒絕直接寫產生器的產物。
 * ⚠️ `onRequest` ⇒ 比路由早跑，⛔ 所以繞不過去（同 `registerDevWriteGuard` 的順序）。
 */
export function registerProductWriteGuard(
  app: FastifyInstance,
  opts: EditorSourceOptions,
): void {
  const repoRoot = resolve(opts.repoRoot);
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const m = /^\/content-api\/([a-z-]+)\/([^/?]+)$/.exec(
      req.url.split("?")[0] ?? "",
    );
    if (m === null) return;
    if (!["PUT", "POST", "PATCH", "DELETE"].includes(req.method)) return;
    const path = productPathOf(m[1]!, decodeURIComponent(m[2]!));
    if (path === null) return;
    const facts = readFacts(repoRoot);
    if (facts === null) return; // 讀不到戶籍表 ⇒ 不擋（⛔ 而 GET 那條會說出來）
    const { ownership, authors } = ownershipOf(path, facts.io, facts.norms);
    if (ownership !== "generator-owned") return;
    const a = adapterFor(path, authors);
    await bad(reply, 409, "GENERATOR_OWNED_PRODUCT", {
      collection: m[1],
      id: decodeURIComponent(m[2]!),
      path,
      authors,
      message:
        `⛔ \`${path}\` 是產生器 **${authors.join(" / ")}** 的產物 —— 直接寫它，` +
        "下一次 `pnpm skills:sync` 就會把它打回來，⚠️ 而那個「又變回去了」看起來像**新的**錯。",
      fix:
        a === null
          ? "⛔ 這一份今天**沒有** source adapter ⇒ 對編輯器來說它是唯讀的。"
          : `⭐ 改來源：POST /content-api/editor-source（來源 \`${a.sourceFor(path)}\`，` +
            `重生成 \`${a.regenerate}\`）`,
    });
  });
}

export function registerEditorSourceRoutes(
  app: FastifyInstance,
  opts: EditorSourceOptions,
): void {
  const repoRoot = resolve(opts.repoRoot);
  const run =
    opts.runRegenerate ??
    ((command: string, cwd: string): void => {
      // ⚠️ `shell: false` —— 指令來自**這個 repo 裡的常數表**，⛔ 不是請求。
      const parts = command.split(" ");
      execFileSync(parts[0]!, parts.slice(1), {
        cwd,
        stdio: "pipe",
        timeout: 15 * 60_000,
      });
    });

  app.get<{ Querystring: { collection?: string; id?: string } }>(
    "/content-api/editor-source",
    async (req, reply) => {
      const { collection, id } = req.query;
      if (!collection || !id)
        return bad(reply, 400, "MISSING_COLLECTION_OR_ID");
      const path = productPathOf(collection, id);
      if (path === null)
        return bad(reply, 400, "UNKNOWN_COLLECTION_OR_BAD_ID", {
          collection,
          id,
        });
      const facts = readFacts(repoRoot);
      if (facts === null) return bad(reply, 503, "OWNERSHIP_TABLE_UNREADABLE");
      const product = fileFacts(join(repoRoot, path));
      if (product === null)
        return bad(reply, 404, "PRODUCT_NOT_FOUND", { path });
      const { ownership, writers, authors } = ownershipOf(
        path,
        facts.io,
        facts.norms,
      );
      const a =
        ownership === "generator-owned" ? adapterFor(path, authors) : null;
      const srcPath = a?.sourceFor(path) ?? null;
      const source =
        srcPath === null ? null : fileFacts(join(repoRoot, srcPath));
      const members =
        a === null || srcPath === null ? [] : membersOf(srcPath, a, facts.io);
      return reply.send({
        schema: EDITOR_SOURCE_SCHEMA,
        collection,
        id,
        outputPath: path,
        ownership: {
          kind: ownership,
          producer: authors[0] ?? null,
          sourcePaths: srcPath === null ? [] : [srcPath],
          regenerateCommand: a?.regenerate ?? null,
          // ⭐ 改這一份來源會**一起重生成**的每一份（⛔ 不只編輯器點開的那一份）。
          editableMembers: members,
        },
        writePolicy: writePolicyFor(ownership, srcPath !== null),
        // ── 底下是規格最小集之外的**加項**，⛔ 不是裝飾 ────────────────────────
        // ⭐ CAS 需要 `source.sha256`；編輯器的 diff 需要 `source.text`。
        writers,
        product: { path, sha256: product.sha256, bytes: product.bytes },
        source:
          srcPath === null || source === null
            ? null
            : {
                path: srcPath,
                sha256: source.sha256,
                bytes: source.bytes,
                text: source.text,
              },
        // ⭐⭐ **這幾格改了不會原樣存活** —— 量出來的，⛔ 不是猜的。
        //   ⚠️ 少了這一格，編輯器寫 `cooldown:77`、拿回 `90`，會判定接縫壞掉並開一張假票。
        //   ⭐ 而真相是 `tierize()` 把它解析回級距值（第〇·四守則要的行為）。
        normalizedFields: NORMALIZER_OWNED_FIELDS,
        why:
          ownership === "generator-owned"
            ? srcPath === null
              ? "⛔ 產生器的產物，而今天**沒有** source adapter ⇒ 唯讀。"
              : `⭐ 產生器的產物 ⇒ 改**來源** \`${srcPath}\`，再跑 \`${a?.regenerate}\`。`
            : ownership === "normalizer-only"
              ? "⭐ 只有正規化器就地改幾個欄位（⛔ 它不是作者）⇒ 可直接寫產物。"
              : "⭐ 沒有任何產生器碰它 ⇒ 可直接寫產物。",
      });
    },
  );

  app.post<{
    Body: {
      collection?: string;
      id?: string;
      expectedSourceSha256?: string;
      source?: string;
      reason?: string;
    };
  }>("/content-api/editor-source", async (req, reply) => {
    const { collection, id, expectedSourceSha256, source, reason } =
      req.body ?? {};
    if (
      !collection ||
      !id ||
      typeof source !== "string" ||
      !expectedSourceSha256
    ) {
      return bad(reply, 400, "MISSING_FIELDS", {
        need: ["collection", "id", "expectedSourceSha256", "source"],
      });
    }
    const path = productPathOf(collection, id);
    if (path === null)
      return bad(reply, 400, "UNKNOWN_COLLECTION_OR_BAD_ID", {
        collection,
        id,
      });
    const facts = readFacts(repoRoot);
    if (facts === null) return bad(reply, 503, "OWNERSHIP_TABLE_UNREADABLE");
    const { ownership, authors } = ownershipOf(path, facts.io, facts.norms);
    if (ownership !== "generator-owned") {
      return bad(reply, 400, "NOT_GENERATOR_OWNED", {
        path,
        ownership,
        message:
          "⭐ 這一份可以直接寫產物（`PUT /content-api/:collection/:id`）⇒ ⛔ 不必走來源。",
      });
    }
    const a = adapterFor(path, authors);
    const srcPath = a?.sourceFor(path) ?? null;
    if (a === null || srcPath === null)
      return bad(reply, 501, "NO_SOURCE_ADAPTER", { path, authors });
    const srcAbs = join(repoRoot, srcPath);
    const before = fileFacts(srcAbs);
    if (before === null)
      return bad(reply, 404, "SOURCE_NOT_FOUND", { path: srcPath });
    // ⭐⭐ CAS —— 不符 ⇒ **一個位元組都不寫**。
    if (before.sha256 !== expectedSourceSha256) {
      return bad(reply, 409, "SOURCE_CHANGED", {
        path: srcPath,
        expected: expectedSourceSha256,
        actual: before.sha256,
        message:
          "⛔ 來源在你讀它之後被改過了。⭐ 重新 GET 一次、把你的改動合上去，再送一次 ——" +
          "⛔ 這裡不會替你合併（那會**安靜地**吃掉一邊）。",
      });
    }
    const productBefore = fileFacts(join(repoRoot, path));
    writeFileSync(srcAbs, source, "utf8");
    try {
      run(a.regenerate, repoRoot);
    } catch (e) {
      // ⭐ 重生成失敗 ⇒ **把來源還原**（⛔ 不留一個「來源新、產物舊」的半套狀態）。
      writeFileSync(srcAbs, before.text, "utf8");
      return bad(reply, 422, "REGENERATE_FAILED", {
        command: a.regenerate,
        detail: e instanceof Error ? e.message.slice(0, 2000) : String(e),
        message:
          "⛔ 產生器拒絕了這份來源 ⇒ 來源已還原，⭐ 產物一個位元組都沒動。",
      });
    }
    const productAfter = fileFacts(join(repoRoot, path));
    return reply.send({
      schema: EDITOR_SOURCE_SCHEMA,
      collection,
      id,
      applied: true,
      reason: reason ?? null,
      source: {
        path: srcPath,
        sha256: sha256Hex(source),
        bytes: Buffer.byteLength(source),
      },
      regenerate: { adapterId: a.adapterId, step: a.step, command: a.regenerate },
      product: {
        path,
        before: productBefore?.sha256 ?? null,
        after: productAfter?.sha256 ?? null,
        // ⚠️ ⭐ `changed:false` **不是錯誤** —— 一次只改註解的來源改動不會動到產物。
        //   ⛔ 但它必須說出來：對面要據此決定「我的改動是不是真的落地了」。
        changed:
          (productBefore?.sha256 ?? null) !== (productAfter?.sha256 ?? null),
      },
    });
  });
}
