/**
 * ContentLoader — readManifest → per-collection _index → objects →
 * schema.parse → ContentStore → validateReferences. Call `registerAll(store)`
 * afterwards to populate the registries. Transport is pluggable
 * (FsContentSource on the server, HttpContentSource in the browser).
 */
import { ZodError } from "zod";
import {
  ContentError,
  ContentLoadError,
  ManifestError,
  SchemaValidationError,
  zodIssues,
  type FieldIssue,
} from "./errors";
import { findNonFiniteNumbers, nonFiniteDetail } from "./finiteNumbers";
import { validateReferences } from "./refs";
import { validateRetiredLootTables } from "./retiredLootTables";
import { COLLECTIONS, isCollectionName, type CollectionName } from "./schema/index";
import {
  CONTENT_LOAD_DOC_ID,
  DEFAULT_CONTENT_LOAD,
  type ConfigContentLoadDoc,
  type ContentLoadPolicy,
} from "./schema/config";
import { ContentStore } from "./store";
import type { ContentSource, Manifest } from "./types";
import type { DanglingRefError } from "./errors";

/**
 * 一份被隔離的文件。⭐ 這個型別存在的理由是 CLAUDE.md「fail-open 沒錯,**靜默**
 * 才是缺陷」—— 隔離本身是對的,但如果沒有人說得出**哪幾份**被隔離、**為什麼**,
 * 它就從「一份壞文件不會殺掉全站」退化成「壞掉跟正常長得一模一樣」。
 */
export interface QuarantineEntry {
  readonly collection: string;
  readonly id: string;
  readonly reason: "read" | "schema" | "id-mismatch" | "dangling-ref" | "retired-loot";
  /** 給人看的一句話(已經含 collection/id)。 */
  readonly detail: string;
  /** schema 失敗時的逐條 Zod issue。 */
  readonly issues?: FieldIssue[];
}

export interface LoadResult {
  store: ContentStore;
  manifest: Manifest;
  /** dangling SOFT refs (vfx / status-effects not authored yet) */
  warnings: DanglingRefError[];
  /**
   * ⭐ GH#326 —— 被隔離的文件。空陣列 = 這次載入全乾淨。
   *
   * ⚠️ 呼叫端**必須**把非空的這一格送到一個看得見的地方(`/healthz` 的
   * `content.quarantined` 與後台的重要事件頁)。⛔ 一行 console.warn 不算。
   */
  quarantined: QuarantineEntry[];
  /** 這次真的用了哪一種政策(可能因為超過 `maxQuarantined` 而退回 fail-closed)。 */
  policyUsed: ContentLoadPolicy;
}

export class ContentLoader {
  constructor(private readonly source: ContentSource) {}

  /**
   * Full load.
   *
   * ── GH#326:全有全無**是一個政策,不是結構限制** ──────────────────────
   * 這個迴圈從第一天就是**逐份**收集錯誤的(每一份壞的都記下 collection、id、
   * Zod 的逐條 issue),只是最後一行把整批丟掉。owner 2026-08-14 把那個決定
   * 換成一格後台欄位 `config.content-load@1`,出貨值 `quarantine`。
   *
   * ⚠️ 政策自己住在被載入的內容裡,所以它**只能在迴圈跑完之後讀** —— 這不是
   * 妥協,而是剛好對:要不要丟掉的決定本來就發生在最後。那份文件自己壞掉時
   * 退回 `DEFAULT_CONTENT_LOAD`(而且它自己會出現在隔離清單裡)。
   *
   * ⭐【`opts.policy` —— 呼叫端可以硬指定,而且它贏過內容裡的那份設定】
   *
   * ⚠️ 這不是一個方便的旋鈕,它是一條**情境分界**:
   *
   * | 情境 | 政策 | 為什麼 |
   * |---|---|---|
   * | **執行期**(game shard / 客戶端開機) | 內容說了算(出貨 `quarantine`) | 玩家已經在等了 —— 少一份設定好過整站退回骨架 |
   * | **產出期**(`pnpm content:build`) | ⛔ 一律 `fail-closed` | 這裡**沒有玩家在等**。靜默丟掉一份文件會產出一個「bundle 有、來源沒有」的組合,而那正是 2026-08-01 / 08-02 兩次事故的形狀 |
   *
   * ⛔ 所以 `buildIndexes.ts` **必須**傳 `fail-closed`。少了那一行,超過上下界的
   *    欄位會被安靜地隔離掉,然後那份缺一塊的 bundle 照樣被 commit 出貨 ——
   *    隔離在執行期是止血,在產出期是**製造**出血。
   *
   * Throws ContentLoadError 當政策是 `fail-closed`,或隔離數超過 `maxQuarantined`。
   */
  async load(opts?: { policy?: ContentLoadPolicy }): Promise<LoadResult> {
    const manifest = await this.source.readManifest();
    if (typeof manifest?.contentVersion !== "string" || !manifest.collections) {
      throw new ManifestError("manifest.json is malformed (contentVersion/collections missing)");
    }

    const store = new ContentStore();
    const errors: ContentError[] = [];
    const quarantined: QuarantineEntry[] = [];

    for (const name of Object.keys(manifest.collections)) {
      if (!isCollectionName(name)) {
        errors.push(new ManifestError(`manifest lists unknown collection "${name}"`));
        continue;
      }
      const spec = COLLECTIONS[name];
      const index = await this.source.readIndex(name);
      for (const entry of index.entries) {
        let raw: unknown;
        try {
          raw = await this.source.readObject(name, entry);
        } catch (e) {
          const err = new ContentError(`${name}/${entry.id}: read failed — ${String(e)}`);
          errors.push(err);
          quarantined.push({ collection: name, id: entry.id, reason: "read", detail: err.message });
          continue;
        }
        try {
            // ⭐⭐ **非有限的數字要在 Zod 之前擋** —— ⛔ 因為 Zod 擋不住它。
            //   實測：`Infinity` 過得了 `z.number()`／`.positive()`／`.min(0)`，
            //   ⭐ 只有 `.max()` 擋得住 —— 而出貨 schema **245/861 格沒有它**。
            //   ⚠️ 而 JSON 送得進來：`1e400` 解析出來就是 `Infinity`。
            const nf = findNonFiniteNumbers(raw);
            if (nf.length > 0) {
              const detail = nonFiniteDetail(nf);
              const nfIssues: FieldIssue[] = nf.slice(0, 5).map((h) => ({
                path: h.path,
                message: `非有限的數字（${h.value}）`,
                code: "custom",
              }));
              errors.push(new SchemaValidationError(name, entry.id, nfIssues));
              quarantined.push({ collection: name, id: entry.id, reason: "schema", detail, issues: nfIssues });
              continue;
            }
          const doc = spec.schema.parse(raw) as { id: string; schema: string };
          if (doc.id !== entry.id) {
            const issues = [idMismatchIssue(doc.id, entry.id)];
            errors.push(new SchemaValidationError(name, entry.id, issues));
            quarantined.push({
              collection: name,
              id: entry.id,
              reason: "id-mismatch",
              detail: issues[0]!.message,
              issues,
            });
            continue;
          }
          store.add(name, doc.id, doc);
        } catch (e) {
          if (e instanceof ZodError) {
            const issues = zodIssues(e);
            errors.push(new SchemaValidationError(name, entry.id, issues));
            quarantined.push({
              collection: name,
              id: entry.id,
              reason: "schema",
              detail: issues.map((i) => `${i.path}: ${i.message}`).join("; "),
              issues,
            });
            } else if (e instanceof RangeError) {
              // ⛔⛔ **一份深度巢狀的文件會讓 `parse` 自己爆掉，而它擲的不是 `ZodError`。**
              //
              // ⭐ 2026-08-30 量到（對抗式稽核）：`zEffectDef` 是 `z.lazy` 遞迴且
              //   **沒有深度上界** ⇒ 深度 100 通過驗證、深度 **600 就擲
              //   `RangeError: Maximum call stack size exceeded`**。
              //
              // ⚠️ ⭐ 而在此之前這裡走 `throw e` ⇒ 那個 RangeError **逃出隔離**
              //   ⇒ 整份內容載入死掉 ⇒ 每個玩家退回 **2 隻骨架英雄**。
              //   ⭐ 那正是 2026-08-01 事故的形狀：網站打得開、看起來完全正常，
              //   ⛔ 而唯一的破綻只有 console 那一行。
              //
              // ⇒ ⭐ **一份壞文件只能毀掉它自己** —— 那是隔離機制的整個重點，
              //   ⛔ 而「壞」不可以只定義成「Zod 說不合法」。
              //
              // ⚠️ ⭐ 這**不是** UGC 的未來問題：`ContentPage.tsx` 的 edit/save
              //   今天就寫得進 `content/`，而這條路在每個玩家與每台 game shard 的開機路徑上。
              // ⚠️⚠️ ⭐ **這一段刻意沒有行為守衛，而理由要寫下來**（⛔ 不是忘了寫）：
              //   `EFFECT_MAX_NESTING_DEPTH` 裝上去之後，深度計數器在**遞迴之前**就 return
              //   ⇒ ⭐ 效果巢狀這條路**再也產生不出 RangeError** —— 它會是一個誠實的 ZodError。
              //   ⇒ 我寫過一條測試想驗這裡，⛔ 而它是**假的**（夾具被 `.strict()` 先以
              //     ZodError 擋掉，根本走不到這個分支）⇒ 突變（把這個分支拿掉）不會紅
              //     ⇒ **刪掉了**（⛔ 不出貨一個非守衛，第二守則）。
              //
              // ⭐ 它仍然留著，因為它守的是**下一個**遞迴 schema：
              //   今天 `zEffectDef` 有上界了，⛔ 而 `z.lazy` 不只它一個，
              //   而且新的遞迴欄位不會自動帶上界。
              //   ⇒ ⭐ 這一段的價值是「**下一次**有人加了沒有上界的遞迴時，
              //     壞的只毀掉它自己」——⛔ 而那一天沒有人會記得回來加這個 catch。
              //
              // ⭐ 到期條件：哪天有一條路真的能產生 RangeError 且測得到 ⇒ 補上守衛。
              const detail = `文件太深或太大 —— 解析時堆疊爆掉（${e.message}）`;
              const issues: FieldIssue[] = [{ path: "(root)", message: detail, code: "custom" }];
              errors.push(new SchemaValidationError(name, entry.id, issues));
              quarantined.push({
                collection: name,
                id: entry.id,
                reason: "schema",
                detail,
                issues,
              });
          } else {
            throw e;
          }
        }
      }
    }

    // ⚠️ 政策要在**這裡**讀 —— 上面的迴圈剛把它載進 store。它自己壞掉(或還沒
    // 被 authored)時退回出貨預設,而且它會出現在 `quarantined` 裡,所以
    // 「靜默地用了預設」不會發生。
    const policyDoc = store.tryGet<ConfigContentLoadDoc>("config", CONTENT_LOAD_DOC_ID);
    // ⭐ 呼叫端硬指定的贏過內容 —— 產出期一律 fail-closed(見 `load()` 的檔頭)。
    const policy: ContentLoadPolicy =
      opts?.policy ?? policyDoc?.policy ?? DEFAULT_CONTENT_LOAD.policy;
    const cascade = policyDoc?.cascadeDanglingRefs ?? DEFAULT_CONTENT_LOAD.cascadeDanglingRefs;
    const maxQuarantined = policyDoc?.maxQuarantined ?? DEFAULT_CONTENT_LOAD.maxQuarantined;

    // 退場的抽獎池不可以被排回任何發放入口 (owner 2026-08-01). 這是一條**跨欄位**
    // 規則,所以它不能待在 Zod 裡:`zConfigDoc` 是 discriminated union,而它的成員
    // 必須是 ZodObject —— 一個 `.superRefine` 會讓整個 config 聯集失效。理由與
    // 規則本身都寫在 ./retiredLootTables.ts。
    const retired = validateRetiredLootTables(store);
    errors.push(...retired);

    // ── fail-closed:舊行為,一份壞掉整份失敗 ────────────────────────────
    // ⚠️ 也涵蓋「隔離太多」:少四份設定與「內容整份跟這個映像不相容」是兩件事,
    //    而後者隔離出來的結果是一個**空的遊戲** —— 那比誠實地退回骨架更糟,
    //    因為骨架至少會讓 `/healthz` 的 `content.ok` 變 false。
    // ⛔⛔ **`maxQuarantined` 分不出「映像不相容」與「有人送了一堆壞文件」。**
    //
    // ⭐ 這個上限的理由是對的（見下面那則訊息）：50+ 份被隔離**通常**代表
    //   `content/` 與這個映像不相容 —— ⛔ 而那時候一個「只缺 50 份」的世界
    //   比誠實地退回骨架更糟。
    //
    // ⚠️ ⭐ 但 2026-08-30 的對抗式稽核指出它的反面：**51 份壞文件**也會觸發它
    //   ⇒ ⭐⭐ **為了防止一份壞文件殺全站而做的隔離機制，自己是第二個攻擊面。**
    //   而 UGC 一開放，「送 51 份壞文件」是任何人都做得到的事。
    //
    // ⇒ ⭐ 修法是**分辨那兩件事**，⛔ 不是把數字調大（調大只是把門檻挪一格）：
    //   · **不相容**的簽名 ＝ 失敗**集中**（映像的 Zod union 不認得那幾個新
    //     schema tag ⇒ 用到它們的那一個集合整片倒）
    //   · **壞文件**的簽名 ＝ 失敗**散落**在很多不同的 collection 上
    //
    // ⭐ 判準：被隔離的文件**集中在 ≤2 個 collection 且占比 ≥80%** ⇒ 不相容 ⇒ 照舊 fail-closed。
    //   否則是內容品質問題 ⇒ ⭐ **逐份隔離**，⛔ 不要因為「數量多」就把好的那些一起丟掉。
    const concentrated = ((): boolean => {
      if (quarantined.length === 0) return false;
      const byCollection = new Map<string, number>();
      for (const q of quarantined) byCollection.set(q.collection, (byCollection.get(q.collection) ?? 0) + 1);
      const top = [...byCollection.values()].sort((a, b) => b - a).slice(0, 2);
      const share = top.reduce((a, b) => a + b, 0) / quarantined.length;
      return byCollection.size <= 2 && share >= 0.8;
    })();
    const overBudget = quarantined.length > maxQuarantined && concentrated;
    if (policy === "fail-closed" || overBudget) {
      const refs = validateReferences(store);
      errors.push(...refs.errors);
      if (errors.length > 0) {
        if (overBudget) {
          errors.unshift(
            new ContentError(
              `隔離了 ${quarantined.length} 份文件,超過 config.content-load@1 的 ` +
                `maxQuarantined=${maxQuarantined} ⇒ 退回 fail-closed。` +
                `這通常代表 content/ 與這個映像不相容(新的 schema tag 或欄位不在映像的 Zod union 裡),` +
                `而不是幾份文件寫壞了。`,
            ),
          );
        }
        throw new ContentLoadError(errors);
      }
      return { store, manifest, warnings: refs.warnings, quarantined, policyUsed: policy };
    }

    // ── quarantine(出貨預設)──────────────────────────────────────────
    // 硬參照斷掉的文件**自己也被拿掉**(cascade),否則會留下半個世界:英雄在、
    // 他的 Q 不在 = 一格空技能,而且沒有人會發現(失敗形態②)。
    // 每一輪至少拿掉一份 ⇒ 必然收斂,不需要額外的迴圈上界。
    let refs = validateReferences(store);
    while (cascade && refs.errors.length > 0) {
      for (const e of refs.errors) {
        if (!isCollectionName(e.fromCollection)) continue;
        if (!store.remove(e.fromCollection, e.fromId)) continue;
        quarantined.push({
          collection: e.fromCollection,
          id: e.fromId,
          reason: "dangling-ref",
          detail:
            `硬參照 ${e.targetCollection}/${e.targetId}(欄位 "${e.field}")找不到 —— ` +
            `目標可能自己被隔離了,所以這一份跟著隔離,避免留下半個世界。`,
        });
      }
      refs = validateReferences(store);
    }

    // ⚠️ cascade 關掉時,斷掉的硬參照**不可以就這樣消失** —— 它們降級成 warnings,
    //    因為文件還在 store 裡(所以說它「被隔離」會是謊話),但沒有人知道它半殘
    //    才是真正的缺陷。
    const softWarnings = cascade ? refs.warnings : [...refs.warnings, ...refs.errors];

    for (const e of retired) {
      if (!store.remove("config", e.docId)) continue;
      quarantined.push({
        collection: "config",
        id: e.docId,
        reason: "retired-loot",
        detail: e.message,
      });
    }

    return { store, manifest, warnings: softWarnings, quarantined, policyUsed: policy };
  }
}

function idMismatchIssue(docId: string, entryId: string): FieldIssue {
  return {
    path: "id",
    message: `doc id "${docId}" does not match index/filename id "${entryId}"`,
    code: "custom",
  };
}

/** Validate one raw doc against its collection schema (editor/content-api dry-run). */
export function validateDoc(
  collection: CollectionName,
  raw: unknown,
): { ok: true; doc: unknown } | { ok: false; issues: FieldIssue[] } {
  // ⭐ 與 `load()` **同一道**檢查 —— ⛔ 兩道門要用同一個機制，
  //   否則 content-api 寫得進去的東西，載入時才被隔離（⚠️ 而作者以為存好了）。
  const nf = findNonFiniteNumbers(raw);
  if (nf.length > 0) {
    return {
      ok: false,
      issues: nf.slice(0, 5).map((h) => ({
        path: h.path,
        message: `非有限的數字（${h.value}）—— ${nonFiniteDetail(nf)}`,
        code: "custom" as const,
      })),
    };
  }
  const res = COLLECTIONS[collection].schema.safeParse(raw);
  if (res.success) return { ok: true, doc: res.data };
  return { ok: false, issues: zodIssues(res.error) };
}
