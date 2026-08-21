/**
 * Quick Approval (task #242) — every decision that is waiting on the owner, on
 * one page, with one submit.
 *
 * THE OWNER'S ASK, verbatim: 「請你做成後台快速一鍵確認的按鈕…把所有需要審查確認的
 * 項目條列在這一頁，打勾/取消 後，一鍵送出確認」.
 *
 * THREE THINGS THAT MAKE IT WORTH HAVING (and would make it harmful without):
 *
 *  1. IT SHIPS IN THE PRODUCTION BUNDLE. This module is imported EAGERLY and
 *     STATICALLY by ui/App.tsx, exactly like ApprovalsPage — never through the
 *     `if (!import.meta.env.DEV) return;` dynamic-import gate that dead-folds
 *     內容管理 out of a production build. A Quick Approval that only exists on
 *     localhost would be useless for the situation it was asked for: the owner
 *     on ggd.adms.ai, on a phone. quickApprovalBundle.test.ts fails if this
 *     page ever falls out of a real `vite build`.
 *
 *  2. EVERY ROW CARRIES ITS REASON AND ITS RISK. A tick box next to a bare
 *     label makes it EASIER to step on a trap; that is worse than no page. Each
 *     row prints 這是什麼 / 為什麼在等 / 送出後會發生什麼 / 風險, and champion
 *     rows additionally print a live 數值體檢 against the median of the roster
 *     already enabled — so a hero that would be handed to the family at 100 HP
 *     shows up red, unticked, and demands a second confirmation naming that
 *     consequence. Nothing on this page is pre-ticked.
 *
 *  3. IT WRITES ONLY THROUGH THE EXISTING AUDITED SEAMS. The whitelist half
 *     goes through POST /curation/whitelist/bulk (admin-only, union-merged
 *     server-side, audited `curation.bulk`); the account half goes through POST
 *     /admin/accounts/{id}/approve (admin-only, last-admin guarded, audited
 *     `approval_approved`); the cleanup half goes through POST
 *     /curation/whitelist/evict-transformed and /curation/whitelist/restore.
 *     No new endpoint, and deliberately NO import of saveWhitelist/diffDoc —
 *     that draft machinery emits a `disable` array computed from whatever this
 *     page happens to know, and would delete the operator's extra entries.
 *
 * ---------------------------------------------------------------------------
 * ⭐ 2026-08-21 (GH#495): TWO ZONES — 加入 and 清理／移除
 * ---------------------------------------------------------------------------
 * owner:「清理變身態、通過邀請碼審查、上下架角色道具 等常用批核，應該都要在
 * [Quick Approval] 這邊簡易一鍵批核通過吧？」
 *
 * The removals could NOT simply join the tick list. 一鍵送出確認's safety comes
 * from every request it sends carrying `disable: []` — that is what makes it
 * pressable without reading. So:
 *
 *   ① 加入 (the rows + one submit)  every bulk request has `disable: []`
 *   ② 清理／移除 (QuickCleanupSection) preview by name+id → confirm → 一鍵還原
 *
 * The per-row 停用 button that used to sit on a 未經名單審查 row is GONE: it was a
 * removal without an item list and without an undo point, and while a second
 * removal door existed on this page, 「移除一定經過預覽」 was not something a
 * guard could prove.
 *
 * This file is presentation + wiring only; all the derivation lives in
 * ../quickApproval.ts and ../quickCleanup.ts as pure functions (unit-tested
 * under plain node).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveAccount,
  backfillAdminFriends,
  bulkWhitelist,
  evictTransformedBodies,
  getCombatEnv,
  getStarterSet,
  getWhitelist,
  listPendingAccounts,
  restoreWhitelistSnapshot,
} from "../api";
import { normalizeCombatEnv, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import { loadDocsByIds, rowFromDoc } from "../content";
import { useApp, type Page } from "../store";
import { waitedText } from "../approvals";
import { isTransformedBodyRow } from "../curationTransform";
import type { Kind } from "../curation";
import {
  buildPlan,
  buildRows,
  describePlan,
  parseChampionStats,
  planBulkRequests,
  planIsEmpty,
  rosterDelta,
  rowsNeedingSecondConfirm,
  secondConfirmText,
  summarizeResult,
  type ChampionStats,
  type QuickRow,
  type StepResult,
  type SubmitResult,
} from "../quickApproval";
import {
  OWNER_ONLY_ACTIONS,
  cleanupWriteRequest,
  disablePreview,
  transformPreview,
  undoRequest,
  type CleanupItem,
  type CleanupPreview,
} from "../quickCleanup";
import {
  QuickCleanupSection,
  type CleanupAction,
  type CleanupOutcome,
} from "./QuickCleanupSection";
import { Btn, ErrorBanner, Panel } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";

/** The submit label — also the string quickApprovalBundle.test.ts greps for. */
const SUBMIT_LABEL = "一鍵送出確認";

const TONE_COLOR: Record<QuickRow["tone"], string> = {
  ok: OK,
  warn: WARN,
  danger: DANGER,
  dim: TEXT_DIM,
};

const KIND_LABEL: Record<QuickRow["kind"], string> = {
  "account-approve": "帳號審核",
  "champion-open": "開放英雄",
  "ability-fill": "補技能格",
  "item-open": "上架道具",
  "champion-undeclared": "未經名單審查",
  "item-undeclared": "未經名單審查",
  exposure: "對外暴露",
};

/** Step label per whitelist kind — the union writes 第①區 can produce. */
const BULK_LABEL: Record<Kind, string> = {
  champions: "開放英雄",
  abilities: "補技能格",
  items: "上架道具",
};

interface Loaded {
  rows: QuickRow[];
  /** live whitelist champion count, for the header line */
  liveChampions: number;
  declaredChampions: number;
  /** live whitelist item count — the denominator 第②區's 下架 preview quotes */
  liveItems: number;
  /**
   * GH#495 第②區 inputs, derived in the SAME pass as the rows so the zone can
   * never describe a different world from the one above it.
   */
  cleanup: {
    /** live champions reading `transform.role === "alternate"`, for the pairing check */
    alternates: string[];
    /** live-but-undeclared champions MINUS the alternates (those are 清理變身態's) */
    undeclaredChampions: CleanupItem[];
    /** live-but-undeclared item ids; names are fetched at preview time */
    undeclaredItems: string[];
  };
  /** the FULL server-side pending count… */
  pendingTotal: number;
  /** …and how many of them this page actually loaded as rows */
  pendingRows: number;
  contentOk: boolean;
  /** false when the queue could not be read at all (say so; do not show 0) */
  pendingOk: boolean;
}

/**
 * Probe /editor/ from the browser, same-origin.
 *
 * A RUNTIME SIGNAL, NOT A CLAIM: the admin console sits behind the same nginx,
 * so this request answers for THIS deploy rather than for whatever the repo
 * looked like when the page was written. `no-store` because a cached answer
 * would make the row lie after a redeploy that changed the route.
 *
 * WHY NOT HEAD, AND WHY THE BODY IS READ (task #241). The status code alone
 * CANNOT answer the question any more. Now that the /editor/ location is
 * dev-only, a request for it in production falls through to `location /` and
 * `try_files … /index.html` — which returns **200 with the game client's
 * index.html**. A HEAD probe would therefore see 200 and go on reporting
 * 「這個環境確實對外開著」 forever, on a deploy where the editor does not exist.
 * That is worse than no probe: a security row that cries wolf gets ignored.
 * So the probe reads the body and looks for the editor's own <title>. Exposed
 * means "the editor answered", not "something answered".
 */
const EDITOR_MARKER = "GGD Content Editor";

async function probeEditor(): Promise<{
  status: number | null;
  servesEditor?: boolean;
  error?: string;
}> {
  try {
    const res = await fetch("/editor/", { cache: "no-store" });
    // Only a 2xx can be the editor; anything else is decided by status alone.
    if (!res.ok) return { status: res.status, servesEditor: false };
    const body = await res.text();
    return { status: res.status, servesEditor: body.includes(EDITOR_MARKER) };
  } catch (err) {
    return { status: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The write for a previewed 下架, and its undo. Both id lists come from
 * `preview.items` and from nowhere else — this function has no way to remove an
 * id the operator did not just read (GH#495's whole point).
 */
async function runDisable(
  preview: CleanupPreview,
  after: () => Promise<void>,
): Promise<CleanupOutcome> {
  const req = cleanupWriteRequest(preview);
  const back = undoRequest(preview);
  if (req === null || back === null) throw new Error("這個動作沒有 bulk 寫入路徑");
  await bulkWhitelist(req);
  await after();
  return {
    text: `✓ 已下架 ${req.disable.length} 個：${preview.before} → ${preview.after}。按 ↩ 可以整批加回去。`,
    undo: async () => {
      await bulkWhitelist(back);
      await after();
      return `已把 ${back.enable.length} 個 id 加回白名單。`;
    },
  };
}

export function QuickApprovalPage(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate);
  const refreshPendingCount = useApp((s) => s.refreshPendingCount);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  /**
   * Recompute the whole page from live state. Everything is a derived view, so
   * "refresh" is the same code path as "load" — there is no local draft that a
   * reload could clobber, which is why this page can be re-read after every
   * submit and show server truth instead of an optimistic guess.
   */
  const reload = useCallback(async (): Promise<void> => {
    setErr(null);
    try {
      const [starter, live] = await Promise.all([getStarterSet(), getWhitelist()]);

      // The account queue is fetched SEPARATELY and its failure is contained.
      // These are four independent sources, and an older platform build with no
      // /admin/accounts/pending must not blank out the roster rows — a page that
      // shows nothing because one of its four reads 404'd is a page the owner
      // stops trusting.
      let pending: { accounts: { id: string; username: string; createdAt: string }[]; total: number } = {
        accounts: [],
        total: 0,
      };
      let pendingOk = true;
      try {
        const res = await listPendingAccounts(1, 50);
        const accounts = Array.isArray(res.accounts) ? res.accounts : [];
        pending = {
          accounts,
          total: typeof res.total === "number" ? res.total : accounts.length,
        };
      } catch {
        pendingOk = false;
      }

      // champion docs for the 數值體檢: the candidates AND the already-enabled
      // roster they would be matched against. Failure is survivable and SAID —
      // an unreadable stat sheet downgrades every champion row to "unchecked",
      // which forces the second confirmation rather than waving it through.
      let stats = new Map<string, ChampionStats>();
      // GH#495: the SAME champion docs answer a second question — which live
      // champions are 變身態. Deriving it here costs zero extra fetches and gives
      // 第②區 an answer computed on a different path from the platform's, which
      // is the only way to notice that the platform's fail-open gate went inert.
      let alternates: string[] = [];
      let contentOk = true;
      try {
        // The 三圍 coefficients are OPERATOR-TUNABLE (戰鬥系統). Reading them
        // live means the 體檢 shows the numbers this deployment will actually
        // compute; if the read fails we fall back to the shipped table rather
        // than refusing to check, and BOTH the candidate and the peers are
        // parsed with the same table so the medians never mix two scales.
        let env: CombatEnvMultipliers | undefined;
        try {
          env = normalizeCombatEnv((await getCombatEnv()).multipliers);
        } catch {
          env = undefined;
        }
        const wanted = [...new Set([...starter.champions, ...live.champions])];
        const docs = await loadDocsByIds("champions", wanted);
        stats = new Map([...docs].map(([id, raw]) => [id, parseChampionStats(id, raw, env)]));
        alternates = live.champions.filter((id) => {
          const raw = docs.get(id);
          return raw !== undefined && isTransformedBodyRow(rowFromDoc(id, raw));
        });
      } catch {
        contentOk = false;
      }

      const probe = await probeEditor();
      const now = new Date();
      const rows = buildRows({
        declaredChampions: starter.champions,
        liveChampions: live.champions,
        liveAbilities: live.abilities,
        declaredItems: starter.items,
        liveItems: live.items,
        stats,
        pendingAccounts: pending.accounts.map((a) => ({
          id: a.id,
          username: a.username,
          waited: waitedText(a.createdAt, now),
        })),
        editorProbe: probe,
      });
      // 第②區's two 下架 lists, from the same delta the rows above are built on.
      // ⭐ The 變身態 are SUBTRACTED here: they are undeclared too, but they have
      // their own action with the platform's own re-derivation and an undo
      // snapshot — offering the same champion under two buttons would let one
      // preview quietly disagree with the other.
      const alternateSet = new Set(alternates);
      const undeclaredChampions = rosterDelta(starter.champions, live.champions)
        .undeclared.filter((id) => !alternateSet.has(id))
        .map((id) => ({ id, name: stats.get(id)?.name ?? id }));

      setLoaded({
        rows,
        liveChampions: live.champions.length,
        declaredChampions: starter.champions.length,
        liveItems: live.items.length,
        cleanup: {
          alternates,
          undeclaredChampions,
          undeclaredItems: rosterDelta(starter.items, live.items).undeclared,
        },
        pendingTotal: pending.total,
        pendingRows: pending.accounts.length,
        contentOk,
        pendingOk,
      });
      // drop ticks for rows that no longer exist (e.g. just-approved ones)
      setTicked((cur) => {
        const keys = new Set(rows.map((r) => r.key));
        const next = new Set([...cur].filter((k) => keys.has(k)));
        return next.size === cur.size ? cur : next;
      });
    } catch (e) {
      setErr(
        `讀取待確認項目失敗：${e instanceof Error ? e.message : String(e)}` +
          "（需要管理員登入；平台需提供 /curation/whitelist 與 /admin/accounts/pending）",
      );
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = loaded?.rows ?? [];
  const plan = useMemo(() => buildPlan(rows, ticked), [rows, ticked]);
  const tickableCount = rows.filter((r) => r.tickable).length;

  const toggle = (key: string): void => {
    setResult(null);
    setTicked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /**
   * THE ONE SUBMIT. Order is deliberate: whitelist writes first (they are
   * idempotent unions, so a retry is free), account approvals last (they touch
   * real people and are individually reported). Every step is reported by name,
   * and a failure mid-way does NOT roll back — it says exactly what did and did
   * not land, because a whitelist union that already succeeded must not be
   * described as "failed".
   */
  const onSubmit = async (): Promise<void> => {
    if (planIsEmpty(plan)) return;
    const risky = rowsNeedingSecondConfirm(rows, ticked);
    if (risky.length > 0 && !window.confirm(secondConfirmText(risky))) return;

    setBusy(true);
    setErr(null);
    const steps: StepResult[] = [];
    try {
      for (const req of planBulkRequests(plan)) {
        const label = BULK_LABEL[req.kind];
        try {
          const doc = await bulkWhitelist(req);
          const after = doc[req.kind];
          const landed = req.enable.filter((id) => after.includes(id));
          steps.push({
            ok: landed.length === req.enable.length,
            label,
            detail:
              landed.length === req.enable.length
                ? `已加入 ${req.enable.length} 個 id：${req.enable.join("、")}（回讀確認）`
                : `送出 ${req.enable.length} 個，回讀只看到 ${landed.length} 個 — 請到「內容白名單」確認。`,
          });
        } catch (e) {
          steps.push({
            ok: false,
            label,
            detail: `失敗：${e instanceof Error ? e.message : String(e)}（白名單未變更）`,
          });
        }
      }
      for (const id of plan.accounts) {
        const row = rows.find((r) => r.accountId === id);
        try {
          await approveAccount(id, "quick approval");
          steps.push({ ok: true, label: "通過帳號", detail: `${row?.title ?? id} 已通過，可以進大廳了。` });
        } catch (e) {
          steps.push({
            ok: false,
            label: "通過帳號",
            detail: `${row?.title ?? id} 失敗：${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
      setResult(summarizeResult(steps, plan));
      setTicked(new Set());
      await refreshPendingCount();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  /**
   * 第②區 (GH#495) — every REMOVAL the owner used to have to go find on another
   * page, as parameter sets of one two-stage card.
   *
   * Each entry answers only two questions: where does the preview come from, and
   * where does the confirmed write go. The preview→confirm→還原 contract itself
   * belongs to CleanupCard, so a fourth removal cannot ship a weaker version of
   * it by accident.
   */
  const cleanupActions = useMemo((): CleanupAction[] => {
    const notLoaded = loaded === null ? "載入中…" : null;
    const cleanup = loaded?.cleanup;
    const after = async (): Promise<void> => {
      await reload();
    };
    return [
      {
        kind: "transform",
        unavailable: notLoaded,
        blurb: (
          <>
            變身態（<code>transform.role === &quot;alternate&quot;</code>）是**技能觸發**才會出現的第二具身體，
            永遠不是一個可以被選的英雄。⭐ 名單由<b>平台自己</b>從內容樹推導（後台不送 id），
            這一頁再用 <code>/content/</code> 算一次來對帳。<b>本體不受影響。</b>
            <br />
            還原：平台會在寫入前留一個<b>快照</b>，做完直接按 ↩ 一鍵還原。
          </>
        ),
        preview: async () =>
          transformPreview(await evictTransformedBodies({ dryRun: true }), {
            ok: loaded?.contentOk === true,
            liveAlternateIds: cleanup?.alternates ?? [],
          }),
        run: async (p) => {
          // ⭐ `expect` is the SERVER's own dry-run count, re-checked under its
          // mutex — a list that moved since the preview comes back 409 instead
          // of deleting more than the operator agreed to.
          const res = await evictTransformedBodies({ dryRun: false, expect: p.items.length });
          const snap = res.snapshotId;
          await after();
          return {
            text:
              `✓ 已清理 ${res.remove.length} 個變身態：啟用英雄 ${res.before} → ${res.after}。` +
              (snap ? `　還原點 ${snap}` : "　⚠ 平台沒有回還原點。"),
            undo:
              snap === undefined
                ? null
                : async () => {
                    const r = await restoreWhitelistSnapshot(snap);
                    await after();
                    return `已還原到 ${snap}（新的還原點 ${r.undoSnapshotId}）。`;
                  },
          };
        },
      },
      {
        kind: "undeclared-champions",
        unavailable: notLoaded,
        blurb: (
          <>
            上面標成「未經名單審查」的英雄 —— 已經開放中，但不在版本控管的開放名單（
            <code>starter.go</code>）裡，所以<b>沒有任何一次審查涵蓋他們</b>。
            <br />
            還原：白名單是一個集合，所以「把同一批 id 加回去」就是逐位元的還原 —— 做完按 ↩ 即可。
          </>
        ),
        preview: async () =>
          disablePreview(
            "undeclared-champions",
            cleanup?.undeclaredChampions ?? [],
            loaded?.liveChampions ?? 0,
            loaded?.contentOk === false
              ? ["註：讀不到英雄文件，下面只有 id 沒有名字 — 建議先確認 /content 再下架。"]
              : [],
          ),
        run: (p) => runDisable(p, after),
      },
      {
        kind: "undeclared-items",
        unavailable: notLoaded,
        blurb: (
          <>
            商店買得到、但不在版本控管開放名單裡的道具。⚠️ 營運手動加的道具長得<b>一模一樣</b>，
            所以這一顆只在你確定那批是誤加時才按。
            <br />
            還原：同上，按 ↩ 就把同一批 id 加回白名單。
          </>
        ),
        preview: async () => {
          const ids = cleanup?.undeclaredItems ?? [];
          // names are fetched HERE, for these ids only: the page never loads the
          // whole item collection, and 「移除 <一串英數 id>」 is not something an
          // operator can meaningfully agree to.
          let named: CleanupItem[] = ids.map((id) => ({ id, name: id }));
          const notes: string[] = [];
          try {
            const docs = await loadDocsByIds("items", ids);
            named = ids.map((id) => {
              const raw = docs.get(id);
              return { id, name: raw === undefined ? id : rowFromDoc(id, raw).name };
            });
          } catch {
            notes.push("註：讀不到 /content/items/ 的道具文件，下面只有 id 沒有名字。");
          }
          return disablePreview("undeclared-items", named, loaded?.liveItems ?? 0, notes);
        },
        run: (p) => runDisable(p, after),
      },
    ];
  }, [loaded, reload]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1000 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN }}>Quick Approval · 待你確認</div>
        <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 4, lineHeight: 1.8 }}>
          這一頁把「只有你能決定」的事情列在一起，分成<b>兩區</b>：
          <br />
          <b>① 加入</b>（下面這一區）：打勾要通過的，按 {SUBMIT_LABEL}。
          它<b>只會「加入」，永遠不會替你移除任何已啟用的內容</b>（送出的每個請求 disable 都是空的）——
          所以它可以不用讀就按。
          <br />
          <b>② 清理／移除</b>（頁面下半）：<b>會</b>動到已啟用的東西，所以<b>不在</b>那顆一鍵裡。
          每一個都是<b>先逐項預覽 → 再確認 → 給你一鍵還原</b>。
          <br />
          每一列都是<b>當下即時算出來的</b> — 比對版本控管的開放名單、這台伺服器的白名單、待審帳號佇列，
          以及對 /editor/ 的即時探測。沒有任何一列是寫死的清單，所以它不會過期。
        </div>
      </div>

      <ErrorBanner text={err} onDismiss={() => setErr(null)} />

      {loaded === null && !err && <div style={{ color: TEXT_DIM, fontSize: 13 }}>載入中…</div>}

      {loaded !== null && (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              padding: "10px 14px",
              borderRadius: 10,
              border: PANEL_BORDER,
              background: "#141a28",
              fontSize: 12,
              color: TEXT_DIM,
            }}
          >
            <span>
              待你處理 <b style={{ color: tickableCount > 0 ? GOLD : OK }}>{tickableCount}</b> 項
            </span>
            <span>
              待審帳號{" "}
              <b style={{ color: loaded.pendingOk ? TEXT_MAIN : WARN }}>
                {loaded.pendingOk ? loaded.pendingTotal : "讀不到"}
              </b>
            </span>
            <span>
              名單 <b style={{ color: TEXT_MAIN }}>{loaded.declaredChampions}</b> 位 · 已開放{" "}
              <b style={{ color: TEXT_MAIN }}>{loaded.liveChampions}</b> 位
            </span>
            {!loaded.contentOk && (
              <span style={{ color: WARN }}>⚠ 讀不到 /content 的英雄數值 — 數值體檢無法進行</span>
            )}
            {/* the queue can be longer than the page we fetched; saying so is
                the difference between "I approved everyone" and "I approved the
                first 50 and did not know there were more" */}
            {!loaded.pendingOk && (
              <span style={{ color: WARN }}>
                ⚠ 讀不到待審帳號佇列（/admin/accounts/pending）— 這一頁少列了那一類項目
              </span>
            )}
            {loaded.pendingOk && loaded.pendingTotal > loaded.pendingRows && (
              <span style={{ color: WARN }}>
                ⚠ 待審 {loaded.pendingTotal} 人，這裡只列出最早的 {loaded.pendingRows} 人 — 送出後請再重新整理
              </span>
            )}
            <Btn small onClick={() => void reload()} disabled={busy} style={{ marginLeft: "auto" }}>
              重新整理
            </Btn>
          </div>

          {tickableCount === 0 && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${OK}`,
                background: "#12241a",
                fontSize: 13,
                color: TEXT_MAIN,
              }}
            >
              ✓ 目前沒有任何需要你按的項目。下面唯讀的幾列是「需要你決定、但不是在這一頁按」的事。
            </div>
          )}

          {rows.map((row) => (
            <RowCard
              key={row.key}
              row={row}
              checked={ticked.has(row.key)}
              onToggle={() => toggle(row.key)}
              onNavigate={(p) => navigate(p as Page)}
              busy={busy}
            />
          ))}

          {/* the submit bar */}
          <div
            style={{
              position: "sticky",
              bottom: 0,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              padding: "12px 14px",
              borderRadius: 10,
              border: PANEL_BORDER,
              background: "#141a28",
            }}
          >
            <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: planIsEmpty(plan) ? TEXT_DIM : GOLD }}>
              {describePlan(plan)}
              {plan.skipped.length > 0 && (
                <span style={{ color: TEXT_DIM }}>　·　略過 {plan.skipped.length} 項</span>
              )}
            </div>
            <Btn small onClick={() => setTicked(new Set())} disabled={planIsEmpty(plan) || busy}>
              全部取消勾選
            </Btn>
            <Btn kind="primary" onClick={() => void onSubmit()} disabled={planIsEmpty(plan) || busy}>
              {busy ? "送出中…" : SUBMIT_LABEL}
            </Btn>
          </div>

          {result !== null && <ResultPanel result={result} />}

          <AdminFriendBackfillCard busy={busy} />
        </>
      )}

      {/* ② 清理／移除 — rendered even before the first read lands, so the owner
          can see the zone exists (its cards say 載入中 and refuse to preview). */}
      <QuickCleanupSection actions={cleanupActions} busy={busy} />

      <OwnerOnlyElsewhere onNavigate={(p) => navigate(p)} />
    </div>
  );
}

/**
 * 管理員預設好友 的回填 (GH#499) — owner 2026-08-21:「所有人預設都會加管理員帳號
 * 為好友」.
 *
 * ⭐ IT LIVES IN ZONE ①, and that is a claim this component has to earn: the
 * action only ever ADDS friendships and can never remove one, so it needs no
 * two-step preview and no restore point (#495's rule for what may sit behind one
 * press). ⛔ If it ever grows an "unlink" direction it belongs in 第②區, not here.
 *
 * New accounts are linked at creation time by the platform, and existing ones at
 * boot — so this button is for the case where the owner has JUST changed
 * `adminAccountId` in 管理員預設好友 and does not want to restart to see it apply.
 * Idempotent, so pressing it twice costs nothing.
 */
export function AdminFriendBackfillCard(props: { busy: boolean }): React.JSX.Element {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const run = async (): Promise<void> => {
    setRunning(true);
    setMsg(null);
    try {
      const r = await backfillAdminFriends();
      setFailed(r.failed > 0);
      setMsg(
        `✓ 掃過 ${r.scanned} 個帳號，新接上 ${r.linked} 個（其餘本來就已經是好友）` +
          (r.failed > 0 ? `，⚠ ${r.failed} 個失敗，請看平台 log` : ""),
      );
    } catch (e) {
      setFailed(true);
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };
  return (
    <Panel title="① 加入 · 管理員預設好友回填">
      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.8 }}>
        把<b>每一個既有帳號</b>都接上管理員好友（<b>強制雙向，不送請求</b>）。
        新帳號在註冊當下就會接上，這一顆是給「剛剛在 <b>管理員預設好友</b> 換了帳號 id、
        不想等平台重啟」的情況。<b>只會加入，永遠不會移除任何好友關係</b>，重複按也不會有副作用。
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <Btn kind="primary" onClick={() => void run()} disabled={running || props.busy}>
          {running ? "回填中…" : "回填既有帳號"}
        </Btn>
        {msg !== null && (
          <span style={{ fontSize: 12, color: failed ? WARN : OK }}>{msg}</span>
        )}
      </div>
    </Panel>
  );
}

/**
 * ③ 其他只有你能按的動作 (GH#495 item 4) — the reason #242 was opened was
 * 「一直撞到 only you can do this」, and the honest answer is that Quick Approval
 * covers the common ones and NOT the rest. Printing the rest with a 前往 button
 * is worth more than pretending the list is complete.
 */
export function OwnerOnlyElsewhere(props: {
  onNavigate: (page: Page) => void;
}): React.JSX.Element {
  return (
    <Panel
      title="③ 其他只有你能按的動作"
      right={
        <span style={{ fontSize: 11, color: TEXT_DIM }}>
          已收攏 {OWNER_ONLY_ACTIONS.filter((a) => a.covered).length} / {OWNER_ONLY_ACTIONS.length}
        </span>
      }
    >
      <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.8, marginBottom: 10 }}>
        這些動作<b>沒有</b>收進上面兩區 —— 它們要嘛是逐人／逐份的決定（沒有批次語意），
        要嘛沒有還原點。這一段只是<b>指路</b>，按不到任何東西。
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {OWNER_ONLY_ACTIONS.map((a) => (
          <div
            key={`${a.page}:${a.action}`}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "baseline",
              flexWrap: "wrap",
              fontSize: 12,
              color: TEXT_DIM,
              borderTop: PANEL_BORDER,
              paddingTop: 8,
            }}
          >
            <span style={{ color: a.covered ? OK : GOLD, fontSize: 11, fontWeight: 700 }}>
              {a.covered ? "✓ 已收攏" : "↗ 在別頁"}
            </span>
            <span style={{ color: TEXT_MAIN, fontWeight: 700 }}>{a.action}</span>
            <span style={{ flex: 1, minWidth: 200 }}>{a.what}</span>
            <Btn small onClick={() => props.onNavigate(a.page)}>
              前往「{a.where}」
            </Btn>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/**
 * One decision, with everything needed to make it. Exported so the smoke test
 * can render every row SHAPE (approvable / risky / read-only / account) without
 * a browser — the row renderer is the densest JSX on the page and the one most
 * likely to crash on a field the page can legitimately produce.
 */
export function RowCard(props: {
  row: QuickRow;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onNavigate: (page: string) => void;
}): React.JSX.Element {
  const { row } = props;
  const color = TONE_COLOR[row.tone];
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${row.tone === "danger" ? DANGER : "#232c40"}`,
        borderLeft: `4px solid ${color}`,
        background: "#141a28",
      }}
    >
      <div style={{ paddingTop: 2 }}>
        {row.tickable ? (
          <input
            type="checkbox"
            checked={props.checked}
            onChange={props.onToggle}
            disabled={props.busy}
            aria-label={row.title}
            style={{ width: 18, height: 18, accentColor: ACCENT, cursor: "pointer" }}
          />
        ) : (
          <span title="唯讀：這一頁按不了" style={{ fontSize: 16, opacity: 0.7 }}>
            🔒
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color }}>
            {KIND_LABEL[row.kind]}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_MAIN }}>{row.title}</span>
          <span style={{ fontSize: 11, color: TEXT_DIM }}>{row.subtitle}</span>
        </div>
        <dl style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.8, color: TEXT_DIM }}>
          <Line label="這是什麼" text={row.what} />
          <Line label="為什麼在等" text={row.why} />
          <Line label="送出後" text={row.effect} />
          <Line label="風險" text={row.risk ?? "沒有已知風險。"} tone={row.tone === "danger" ? DANGER : undefined} />
          {row.stats && <Line label="數值" text={row.stats} mono />}
        </dl>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {row.ownerPage !== undefined && (
            <OwnerPageLink page={row.ownerPage} onNavigate={props.onNavigate} />
          )}
          {/* ⛔ GH#495: no 停用 button here any more. Removals live in 第②區,
              behind a mandatory preview — a second door would make the zone's
              guarantee unprovable. */}
        </div>
      </div>
    </div>
  );
}

/**
 * "This page owns nothing" made clickable: every row points at the console page
 * that actually owns the thing it describes.
 */
function OwnerPageLink(props: {
  page: { page: string; label: string };
  onNavigate: (page: string) => void;
}): React.JSX.Element {
  return (
    <Btn small onClick={() => props.onNavigate(props.page.page)}>
      前往「{props.page.label}」
    </Btn>
  );
}

function Line(props: { label: string; text: string; tone?: string; mono?: boolean }): React.JSX.Element {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <dt style={{ flex: "0 0 76px", color: TEXT_DIM, opacity: 0.75 }}>{props.label}</dt>
      <dd
        style={{
          margin: 0,
          flex: 1,
          color: props.tone ?? TEXT_MAIN,
          fontFamily: props.mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          fontSize: props.mono ? 11 : undefined,
        }}
      >
        {props.text}
      </dd>
    </div>
  );
}

/** What actually changed — and what did not, with the reason. */
export function ResultPanel(props: { result: SubmitResult }): React.JSX.Element {
  const { result } = props;
  return (
    <Panel
      title="送出結果"
      right={
        <span style={{ fontSize: 11, color: result.allOk ? OK : DANGER }}>
          {result.allOk ? "全部成功" : "有項目失敗"}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
        {result.steps.length === 0 && <div style={{ color: TEXT_DIM }}>沒有送出任何變更。</div>}
        {result.steps.map((s, i) => (
          <div key={i} style={{ color: s.ok ? TEXT_MAIN : DANGER }}>
            {s.ok ? "✓" : "✕"} <b>{s.label}</b>　{s.detail}
          </div>
        ))}
        {result.skipped.length > 0 && (
          <div style={{ marginTop: 8, borderTop: PANEL_BORDER, paddingTop: 8 }}>
            <div style={{ color: TEXT_DIM, marginBottom: 4 }}>沒有動到的項目：</div>
            {result.skipped.map((s) => (
              <div key={s.key} style={{ color: TEXT_DIM }}>
                · {s.title} — {s.why}
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
