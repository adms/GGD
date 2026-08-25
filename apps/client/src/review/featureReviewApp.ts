/**
 * featureReviewApp —— `public/feature-review.html`（GH#669）的應用層。
 *
 * owner 2026-08-24（逐字）：
 * > 「[一頁批次後台驗收] 代表**先上線成果**，但是在**後台可以一鍵否決還原**，
 * >  **追加原因的HITL**，但**預設是直接上線**」
 * owner 2026-08-25（逐字）：
 * > 「所有**球體、蝗蟲群**都要進後台**一頁式連續圖片批核**但**預設先上線**」
 *
 * 與 `assetReviewApp`（#664）的差別**只有兩件事**，其餘（帳本 · middleware ·
 * hash 過期制 · j/k/y/n 鍵盤）刻意一模一樣：
 *   ① 一列＝一個**特效家族/技能**，帶的是**連續圖片**（施放→演出→到期，逐張帶亮像素），
 *      ⛔ 不是單張截圖 —— 所以這一頁不需要 Babylon，圖是既有的終端證據。
 *   ② 預設是 **live（已上線）**；打勾是**事後否決** ⇒ 翻該批登記的 rollback 開關。
 *      ⇒ 否決**必填原因**（前端擋一次、middleware 再擋一次）。
 */
export type FeatureVerdict = "keep" | "veto";

export interface FeatureFrame {
  file: string;
  label: string;
  rel: string;
  bright: number | null;
  lit: number | null;
  desc: string;
}

export interface RollbackSwitch {
  configId: string;
  field: string;
  liveValue?: unknown;
  rollbackValue?: unknown;
  note?: string;
}

export interface FeatureBatch {
  id: string;
  title: string;
  dir: string;
  hash: string;
  frames: FeatureFrame[];
  registered: boolean;
  status: "pending" | "confirmed" | "vetoed" | "unregistered";
  blockers: string[];
  family?: string | null;
  issues?: (number | string)[];
  commit?: string | null;
  abilities?: string[];
  rollback?: RollbackSwitch | null;
  rollbackOk?: boolean;
  rollbackDoc?: string | null;
  rollbackCurrent?: unknown;
  verdict?: FeatureVerdict | null;
  reason?: string;
  verdictAt?: string | null;
}

export interface FeatureReviewDom {
  rows: HTMLElement;
  counts: HTMLElement;
  modal: HTMLElement;
  modalTitle: HTMLElement;
  modalImg: HTMLImageElement;
  modalClose: HTMLElement;
}

interface Row {
  batch: FeatureBatch;
  el: HTMLElement;
  state: HTMLElement;
  reason: HTMLInputElement;
  buttons: Record<FeatureVerdict, HTMLButtonElement>;
}

const STATUS_LABEL: Record<FeatureBatch["status"], string> = {
  pending: "🟢 已上線 · 待批核",
  confirmed: "✅ 已上線 · 已確認保留",
  vetoed: "⛔ 已否決 —— 請翻開關還原",
  unregistered: "⚠️ 未登記（缺 rollback 開關）",
};

const frameSrc = (rel: string): string => `/__review/frame?p=${encodeURIComponent(rel)}`;

async function fetchFeatures(): Promise<{ counts: Record<string, number>; batches: FeatureBatch[] }> {
  const res = await fetch("/__review/features");
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { error?: string; detail?: string; hint?: string };
      detail = [j.error, j.detail, j.hint].filter((s) => typeof s === "string").join("\n");
    } catch {
      /* 純文字就照印 */
    }
    throw new Error(`/__review/features → ${res.status}\n${detail}`);
  }
  const parsed = JSON.parse(text) as { counts?: Record<string, number>; batches?: FeatureBatch[] };
  if (!Array.isArray(parsed.batches)) throw new Error("/__review/features 回傳裡沒有 batches[]");
  return { counts: parsed.counts ?? {}, batches: parsed.batches };
}

export async function startFeatureReview(dom: FeatureReviewDom): Promise<void> {
  const { counts, batches } = await fetchFeatures();
  const rows: Row[] = [];
  let selected = -1;

  dom.counts.textContent =
    `${counts.total ?? batches.length} 批 —— 待批核 ${counts.pending ?? 0} · ` +
    `已確認 ${counts.confirmed ?? 0} · 已否決 ${counts.vetoed ?? 0} · 未登記 ${counts.unregistered ?? 0}` +
    `（⭐ 全部**已經上線**；打勾是事後否決）`;

  // ── 放大檢視 ──────────────────────────────────────────────────────────
  const closeModal = (): void => dom.modal.classList.remove("open");
  const openModal = (title: string, rel: string): void => {
    dom.modalTitle.textContent = title;
    dom.modalImg.src = frameSrc(rel);
    dom.modal.classList.add("open");
  };
  dom.modalClose.addEventListener("click", closeModal);
  dom.modal.addEventListener("click", (e) => {
    if (e.target === dom.modal) closeModal();
  });

  const setState = (row: Row, text: string, tone: "" | "warn" | "bad" = ""): void => {
    row.state.textContent = text;
    row.state.className = tone === "" ? "state" : `state ${tone}`;
  };

  const paint = (row: Row): void => {
    const { batch } = row;
    row.el.classList.remove("s-pending", "s-confirmed", "s-vetoed", "s-unregistered");
    row.el.classList.add(`s-${batch.status}`);
    row.buttons.keep.className = batch.verdict === "keep" ? "on-keep" : "";
    row.buttons.veto.className = batch.verdict === "veto" ? "on-veto" : "";
  };

  const post = async (row: Row, verdict: FeatureVerdict): Promise<void> => {
    const { batch } = row;
    const reason = row.reason.value.trim();
    // ⭐ 否決必填原因 —— 前端先擋（middleware 也擋，⛔ 兩邊都要，因為前端擋得掉的只有手滑）
    if (verdict === "veto" && reason === "") {
      setState(row, "⛔ 否決必填原因 —— 寫下為什麼要翻開關", "bad");
      row.reason.focus();
      return;
    }
    setState(row, "送出中…");
    const res = await fetch("/__review/feature-verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: batch.id, hash: batch.hash, verdict, reason }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      blockers?: string[];
      rollback?: RollbackSwitch;
      status?: string;
    };
    if (!res.ok) {
      setState(row, `⚠️ ${res.status}：${body.error ?? "未知錯誤"}`, "warn");
      return;
    }
    batch.verdict = verdict;
    batch.reason = reason;
    batch.status = verdict === "veto" ? "vetoed" : "confirmed";
    paint(row);
    const rb = body.rollback;
    setState(
      row,
      verdict === "veto"
        ? `⛔ 已否決 —— 請翻：${rb?.configId ?? "?"} → ${rb?.field ?? "?"} = ` +
            `${JSON.stringify(rb?.rollbackValue)}（原因已入帳本）`
        : "✅ 已確認保留（維持上線）",
      verdict === "veto" ? "warn" : "",
    );
  };

  const select = (i: number): void => {
    if (rows.length === 0) return;
    const n = Math.max(0, Math.min(rows.length - 1, i));
    rows[selected]?.el.classList.remove("selected");
    selected = n;
    const row = rows[n];
    if (row === undefined) return;
    row.el.classList.add("selected");
    row.el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  // ── 一列一家族 ────────────────────────────────────────────────────────
  for (const batch of batches) {
    const el = document.createElement("section");
    el.className = "row";

    const head = document.createElement("div");
    head.className = "head";
    const st = document.createElement("span");
    st.className = "badge";
    st.textContent = STATUS_LABEL[batch.status] ?? batch.status;
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = batch.title;
    head.append(st, title);
    if (typeof batch.family === "string" && batch.family !== "") {
      const fam = document.createElement("span");
      fam.className = "fam";
      fam.textContent = batch.family;
      head.appendChild(fam);
    }
    for (const n of batch.issues ?? []) {
      const a = document.createElement("a");
      a.className = "issue";
      a.href = `https://github.com/adms/GGD/issues/${n}`;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = `#${n}`;
      head.appendChild(a);
    }
    el.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "meta";
    const bits = [`序列 ${batch.dir}`, `${batch.frames.length} 幀`];
    if (typeof batch.commit === "string" && batch.commit !== "") bits.push(`上線 commit ${batch.commit}`);
    if ((batch.abilities ?? []).length > 0) bits.push(`技能：${(batch.abilities ?? []).join("、")}`);
    meta.textContent = bits.join(" · ");
    el.appendChild(meta);

    // rollback 開關 —— 這一列的存在理由：否決＝翻這一格，⛔ 不是 revert commit
    const rb = document.createElement("div");
    rb.className = batch.rollbackOk === true ? "rollback" : "rollback bad";
    rb.textContent =
      batch.rollback == null
        ? "⛔ 沒有登記 rollback 開關 ⇒ 不可判定"
        : `🔁 一鍵還原：${batch.rollback.configId} → ${batch.rollback.field} ` +
          `＝ ${JSON.stringify(batch.rollbackCurrent)} ⇒ ${JSON.stringify(batch.rollback.rollbackValue)}` +
          (typeof batch.rollback.note === "string" && batch.rollback.note !== ""
            ? `　（${batch.rollback.note}）`
            : "");
    el.appendChild(rb);

    for (const b of batch.blockers) {
      const w = document.createElement("div");
      w.className = "blocker";
      w.textContent = b;
      el.appendChild(w);
    }

    // ⭐ 連續圖片：橫向一排，逐張帶亮像素（⛔ 不是單張截圖）
    const strip = document.createElement("div");
    strip.className = "strip";
    for (const f of batch.frames) {
      const cell = document.createElement("figure");
      cell.className = "frame";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = frameSrc(f.rel);
      img.alt = f.label;
      img.addEventListener("click", () => openModal(`${batch.id} — ${f.label}`, f.rel));
      const cap = document.createElement("figcaption");
      const name = document.createElement("span");
      name.className = "fname";
      name.textContent = f.label;
      const px = document.createElement("span");
      px.className = f.bright === null ? "px none" : f.bright > 0 ? "px lit" : "px dark";
      px.textContent = f.bright === null ? "亮像素 —" : `亮 ${f.bright.toLocaleString()}`;
      cap.append(name, px);
      if (f.desc !== "") cell.title = f.desc;
      cell.append(img, cap);
      strip.appendChild(cell);
    }
    el.appendChild(strip);

    const bar = document.createElement("div");
    bar.className = "verdicts";
    const buttons = {} as Record<FeatureVerdict, HTMLButtonElement>;
    const row: Row = {
      batch,
      el,
      state: document.createElement("span"),
      reason: document.createElement("input"),
      buttons,
    };
    for (const [v, label] of [
      ["keep", "✅ 確認保留 (y)"],
      ["veto", "⛔ 否決還原 (n)"],
    ] as const) {
      const b = document.createElement("button");
      b.textContent = label;
      b.disabled = batch.rollbackOk !== true;
      b.addEventListener("click", () => void post(row, v));
      buttons[v] = b;
      bar.appendChild(b);
    }
    row.reason.className = "reason";
    row.reason.placeholder = "否決原因（必填 —— 為什麼要翻掉這一批）";
    row.reason.value = batch.reason ?? "";
    row.state.className = "state";
    bar.append(row.reason, row.state);
    el.appendChild(bar);

    if (batch.verdict === "veto")
      setState(row, `⛔ 已否決於 ${batch.verdictAt ?? "?"}：${batch.reason ?? ""}`, "warn");
    else if (batch.verdict === "keep") setState(row, `✅ 已確認保留於 ${batch.verdictAt ?? "?"}`);
    else if (batch.rollbackOk !== true) setState(row, "⛔ 不可判定 —— 先登記 rollback 開關", "bad");
    else setState(row, "預設＝已上線；不同意就否決", "");

    el.addEventListener("mousedown", () => select(rows.indexOf(row)));
    dom.rows.appendChild(el);
    rows.push(row);
    paint(row);
  }

  if (batches.length === 0) dom.rows.textContent = "沒有連續圖片序列 —— docs/_reports 底下找不到 *_visual-proof_* 目錄。";
  else select(0);

  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t !== null && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      closeModal();
      return;
    }
    const row = rows[selected];
    switch (e.key) {
      case "j":
        select(selected + 1);
        e.preventDefault();
        break;
      case "k":
        select(selected - 1);
        e.preventDefault();
        break;
      // ⚠️ preventDefault 是必要的：`n` 沒有原因時 post() 會把焦點丟進 reason 輸入框，
      //    而**同一個** keydown 的預設動作接著就會把「n」打進去 —— 每一則否決原因
      //    都會多一個 n 開頭。（實測到的，⛔ 不是理論上的。）
      case "y":
        e.preventDefault();
        if (row !== undefined) void post(row, "keep");
        break;
      case "n":
        e.preventDefault();
        if (row !== undefined) void post(row, "veto");
        break;
      default:
        break;
    }
  });

  // 截圖自動化 seam（跟其他 audition 頁同型）
  (window as unknown as { __featureReview?: unknown }).__featureReview = {
    batches,
    select,
    frameCount: (): number => batches.reduce((n, b) => n + b.frames.length, 0),
  };
}
