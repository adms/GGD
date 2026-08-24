/**
 * assetReviewApp —— `public/asset-review.html`（GH#664）的應用層。
 *
 * owner 逐字：「批次於一頁網頁瀏覽打勾標記通過與否」——
 * 佇列來自 dev server 掛的 `tools/review/middleware.mjs`（R1 lane 的契約）：
 *   GET  /__review/queue    → { items: QueueItem[] }
 *   POST /__review/verdict  → body { id, hash, verdict, note? }；hash 變了回 409。
 *
 * 逐格卡片：vfx 現場渲染成動畫條（走出貨 particleFactory）、sfx 波形＋試聽、
 * model 8 幀 turntable。鍵盤 j/k 移動、y/n/u 打分。
 * ⚠️ 節流：一次只渲染一格（requestIdleCallback 排隊）—— 50 格同時開 50 個
 * scene 會把瀏覽器打死。
 */
import {
  StripStudio,
  openVfxReplay,
  openModelReplay,
  type ReplayHandle,
} from "./babylonStrips";
import { resolveSfx, decodeSfx, drawWaveform, playBuffer } from "./sfxPreview";
import type { VfxDoc } from "@ggd/shared/content";

export type Verdict = "pass" | "fail" | "unsure";

/** 跨 lane 契約的佇列項（多的欄位放行不讀）。 */
export interface QueueItem {
  id: string;
  kind: "vfx" | "sfx" | "model";
  hash: string;
  risk: number;
  reasons: string[];
  /** 引用它的技能 id */
  refs: string[];
  /** owner 對它該長怎樣的描述（撈得到才有） */
  spec?: string;
}

export interface AssetReviewDom {
  cards: HTMLElement;
  counts: HTMLElement;
  calib: HTMLElement;
  banner: HTMLElement;
  studio: HTMLElement;
  modal: HTMLElement;
  modalTitle: HTMLElement;
  modalCanvasHost: HTMLElement;
  modalClose: HTMLElement;
}

interface Card {
  item: QueueItem;
  el: HTMLElement;
  media: HTMLElement;
  note: HTMLInputElement;
  state: HTMLElement;
  buttons: Record<Verdict, HTMLButtonElement>;
}

const KIND_LABEL: Record<QueueItem["kind"], string> = {
  vfx: "vfx 特效",
  sfx: "sfx 音效",
  model: "model 模型",
};

async function fetchQueue(): Promise<QueueItem[]> {
  const res = await fetch("/__review/queue");
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { error?: string; detail?: string; hint?: string };
      detail = [j.error, j.detail, j.hint].filter((s) => typeof s === "string").join("\n");
    } catch {
      /* 純文字就照印 */
    }
    throw new Error(`/__review/queue → ${res.status}\n${detail}`);
  }
  const parsed = JSON.parse(text) as { items?: QueueItem[] };
  if (!Array.isArray(parsed.items)) throw new Error("/__review/queue 回傳裡沒有 items[]");
  return parsed.items;
}

export async function startAssetReview(dom: AssetReviewDom): Promise<void> {
  const items = await fetchQueue();
  // 風險高的排前面 —— HITL 的預算先花在辨識能力差的那一批
  items.sort((a, b) => b.risk - a.risk || a.id.localeCompare(b.id));

  const studio = new StripStudio(dom.studio);
  const cards: Card[] = [];
  let selected = -1;
  let rendered = 0;
  let liveReplay: ReplayHandle | null = null;

  const counts = { vfx: 0, sfx: 0, model: 0 } as Record<QueueItem["kind"], number>;
  for (const it of items) counts[it.kind] = (counts[it.kind] ?? 0) + 1;
  const updateCounts = (): void => {
    dom.counts.textContent =
      `${items.length} 項（vfx ${counts.vfx} · sfx ${counts.sfx} · model ${counts.model}）` +
      `· 已渲染 ${rendered}/${items.length}`;
  };
  updateCounts();

  // ── 一次一格的渲染排程 ────────────────────────────────────────────────
  const jobs: (() => Promise<void>)[] = [];
  let pumping = false;
  const idle = (cb: () => void): void => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => cb(), { timeout: 800 });
    else window.setTimeout(cb, 60);
  };
  const pump = (): void => {
    if (pumping) return;
    const job = jobs.shift();
    if (job === undefined) return;
    pumping = true;
    idle(() => {
      void job()
        .catch((err: unknown) => console.error("[asset-review]", err))
        .finally(() => {
          pumping = false;
          pump();
        });
    });
  };
  const enqueue = (job: () => Promise<void>): void => {
    jobs.push(job);
    pump();
  };

  // ── 量尺（第一個要用 Babylon 的 job 之前跑一次）─────────────────────────
  let calibrated = false;
  const calibrateOnce = async (): Promise<void> => {
    if (calibrated) return;
    calibrated = true;
    const ok = await studio.calibrate();
    dom.calib.textContent = ok ? "量尺：OK（亮 quad 讀得到）" : "量尺：失效";
    dom.calib.className = ok ? "meta ok" : "meta bad";
    if (!ok) {
      dom.banner.textContent = "⚠️ 量尺失效，本頁結論不算數（校正 quad readback 讀不到亮像素）";
      dom.banner.style.display = "block";
    }
  };

  // ── modal ────────────────────────────────────────────────────────────
  const closeModal = (): void => {
    liveReplay?.dispose();
    liveReplay = null;
    dom.modal.classList.remove("open");
  };
  const openModal = (title: string, start: (canvas: HTMLCanvasElement) => ReplayHandle): void => {
    closeModal();
    // 每次開都換一顆新 canvas —— 同一顆 canvas 反覆綁新 Engine 會留舊 context
    const old = dom.modalCanvasHost.querySelector("canvas");
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 440;
    if (old !== null) old.replaceWith(canvas);
    else dom.modalCanvasHost.appendChild(canvas);
    dom.modalTitle.textContent = title;
    dom.modal.classList.add("open");
    liveReplay = start(canvas);
  };
  dom.modalClose.addEventListener("click", closeModal);
  dom.modal.addEventListener("click", (e) => {
    if (e.target === dom.modal) closeModal();
  });

  // ── 每一種 kind 的媒體渲染 ────────────────────────────────────────────
  /** model 文件 → glbPath（跟出貨一樣先問 model@1，退而用 modelKey 慣例）。 */
  const resolveGlbPath = async (idOrKey: string): Promise<string> => {
    const res = await fetch(`/content/models/${encodeURIComponent(idOrKey)}.json`);
    if (res.ok) {
      const doc = (await res.json()) as { glbPath?: string };
      if (typeof doc.glbPath === "string") return doc.glbPath;
    }
    if (idOrKey.endsWith(".glb")) return idOrKey.replace(/^\/?(?:content\/)?/, "");
    const dot = idOrKey.indexOf(".");
    if (dot > 0) {
      // modelKey 慣例：`imported.awing` → assets/models/imported/awing.glb
      return `assets/models/${idOrKey.slice(0, dot)}/${idOrKey.slice(dot + 1)}.glb`;
    }
    throw new Error(`解析不到「${idOrKey}」的 glb 路徑（沒有 model 文件、也不是 modelKey/路徑）`);
  };

  const renderModelInto = async (card: Card, glbPath: string, note?: string): Promise<void> => {
    await calibrateOnce();
    const strip = await studio.modelStrip(glbPath);
    strip.title = "點擊 → live turntable";
    strip.addEventListener("click", () => {
      openModal(`${card.item.id} — live turntable`, (c) => openModelReplay(c, glbPath));
    });
    card.media.replaceChildren(strip);
    const meta = document.createElement("div");
    meta.className = "medianote";
    meta.textContent = note !== undefined ? `${note} · /content/${glbPath}` : `/content/${glbPath}`;
    card.media.appendChild(meta);
  };

  const renderMedia = async (card: Card): Promise<void> => {
    const { item } = card;
    card.media.textContent = "渲染中…";
    try {
      if (item.kind === "vfx") {
        const res = await fetch(`/content/vfx/${encodeURIComponent(item.id)}.json`);
        if (!res.ok) throw new Error(`/content/vfx/${item.id}.json → ${res.status}`);
        const doc = (await res.json()) as { schema?: string; modelKey?: string };
        if (doc.schema === "vfx@1") {
          await calibrateOnce();
          const vfxDoc = doc as unknown as VfxDoc;
          const strip = await studio.vfxStrip(vfxDoc);
          strip.title = "點擊 → live 重播";
          strip.addEventListener("click", () => {
            openModal(`${item.id} — live 重播`, (c) => openVfxReplay(c, vfxDoc));
          });
          card.media.replaceChildren(strip);
        } else if (typeof doc.modelKey === "string") {
          await renderModelInto(card, await resolveGlbPath(doc.modelKey), `${doc.schema ?? "attachment"} → 模型附著，以 turntable 呈現`);
        } else {
          throw new Error(`不認得的 vfx 文件 schema：${doc.schema ?? "(無)"}`);
        }
      } else if (item.kind === "model") {
        await renderModelInto(card, await resolveGlbPath(item.id));
      } else {
        const { urls, gain } = await resolveSfx(item.id);
        const first = urls[0];
        if (first === undefined) throw new Error("解析到 0 個音檔");
        const buffer = await decodeSfx(first);
        const wave = document.createElement("canvas");
        wave.className = "wave";
        wave.width = 420;
        wave.height = 64;
        drawWaveform(buffer, wave);
        const play = document.createElement("button");
        play.textContent = "▶ 試聽";
        play.addEventListener("click", () => playBuffer(buffer, gain));
        const meta = document.createElement("div");
        meta.className = "medianote";
        meta.textContent =
          `${buffer.duration.toFixed(2)}s · gain ${gain} · ${first}` +
          (urls.length > 1 ? ` （共 ${urls.length} 檔，試聽第一檔）` : "");
        card.media.replaceChildren(play, wave, meta);
      }
      card.media.classList.remove("err");
    } catch (err) {
      card.media.classList.add("err");
      card.media.textContent = `⚠ ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      rendered++;
      updateCounts();
    }
  };

  // ── 打分 ──────────────────────────────────────────────────────────────
  const setState = (card: Card, text: string, warn = false): void => {
    card.state.textContent = text;
    card.state.className = warn ? "state warn" : "state";
  };

  const markVerdict = (card: Card, v: Verdict | null): void => {
    card.el.classList.remove("v-pass", "v-fail", "v-unsure");
    for (const [k, b] of Object.entries(card.buttons)) b.className = k === v ? `on-${v}` : "";
    if (v !== null) card.el.classList.add(`v-${v}`);
  };

  const postVerdict = async (card: Card, verdict: Verdict): Promise<void> => {
    const { item } = card;
    const note = card.note.value.trim();
    setState(card, "送出中…");
    const res = await fetch("/__review/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, hash: item.hash, verdict, ...(note !== "" ? { note } : {}) }),
    });
    if (res.status === 409) {
      // 契約：hash 變了 —— 顯示並刷新該格
      try {
        const fresh = await fetchQueue();
        const nu = fresh.find((x) => x.id === item.id);
        if (nu !== undefined) {
          item.hash = nu.hash;
          item.risk = nu.risk;
          item.reasons = nu.reasons;
          markVerdict(card, null);
          setState(card, "⚠️ 內容已變（hash 不同）—— 已刷新，請重看再判定", true);
          enqueue(() => renderMedia(card));
        } else {
          setState(card, "⚠️ 內容已變（hash 不同），且它已不在佇列裡", true);
        }
      } catch (err) {
        setState(card, `⚠️ 409（hash 變了），刷新失敗：${err instanceof Error ? err.message : String(err)}`, true);
      }
      return;
    }
    if (!res.ok) {
      setState(card, `⚠️ /__review/verdict → ${res.status}`, true);
      return;
    }
    markVerdict(card, verdict);
    setState(card, `已記錄 ${verdict}${note !== "" ? "（含備註）" : ""}`);
  };

  // ── 卡片 ──────────────────────────────────────────────────────────────
  const select = (i: number): void => {
    if (cards.length === 0) return;
    const n = Math.max(0, Math.min(cards.length - 1, i));
    cards[selected]?.el.classList.remove("selected");
    selected = n;
    const card = cards[n];
    if (card === undefined) return;
    card.el.classList.add("selected");
    card.el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  for (const item of items) {
    const el = document.createElement("section");
    el.className = "card";

    const head = document.createElement("div");
    head.className = "head";
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = KIND_LABEL[item.kind] ?? item.kind;
    const id = document.createElement("code");
    id.className = "id";
    id.textContent = item.id;
    const risk = document.createElement("span");
    risk.className = "risk";
    risk.textContent = `風險 ${item.risk}`;
    head.append(kind, id, risk);
    el.appendChild(head);

    if (item.refs.length > 0) {
      const refs = document.createElement("div");
      refs.className = "refs";
      refs.textContent = `引用技能：${item.refs.join("、")}`;
      el.appendChild(refs);
    }
    if (item.reasons.length > 0) {
      const ul = document.createElement("ul");
      ul.className = "reasons";
      for (const r of item.reasons) {
        const li = document.createElement("li");
        li.textContent = r;
        ul.appendChild(li);
      }
      el.appendChild(ul);
    }
    if (typeof item.spec === "string" && item.spec !== "") {
      const q = document.createElement("blockquote");
      q.className = "spec";
      q.textContent = item.spec;
      el.appendChild(q);
    }

    const media = document.createElement("div");
    media.className = "media";
    media.textContent = "排隊等待渲染…";
    el.appendChild(media);

    const row = document.createElement("div");
    row.className = "verdicts";
    const buttons = {} as Record<Verdict, HTMLButtonElement>;
    const card: Card = {
      item,
      el,
      media,
      state: document.createElement("span"),
      note: document.createElement("input"),
      buttons,
    };
    for (const [v, label] of [
      ["pass", "✅ 通過 (y)"],
      ["fail", "❌ 不通過 (n)"],
      ["unsure", "😐 不確定 (u)"],
    ] as const) {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", () => void postVerdict(card, v));
      buttons[v] = b;
      row.appendChild(b);
    }
    card.note.className = "note";
    card.note.placeholder = "備註（隨 verdict 一起送）";
    card.state.className = "state";
    row.append(card.note, card.state);
    el.appendChild(row);

    el.addEventListener("mousedown", () => select(cards.indexOf(card)));
    dom.cards.appendChild(el);
    cards.push(card);
    enqueue(() => renderMedia(card));
  }

  if (items.length === 0) {
    dom.cards.textContent = "佇列是空的 —— 沒有待審素材。";
  } else {
    select(0);
  }

  // ── 鍵盤：owner 逐字「批次於一頁網頁瀏覽打勾」────────────────────────────
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t !== null && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      closeModal();
      return;
    }
    const card = cards[selected];
    switch (e.key) {
      case "j":
        select(selected + 1);
        e.preventDefault();
        break;
      case "k":
        select(selected - 1);
        e.preventDefault();
        break;
      case "y":
        if (card !== undefined) void postVerdict(card, "pass");
        break;
      case "n":
        if (card !== undefined) void postVerdict(card, "fail");
        break;
      case "u":
        if (card !== undefined) void postVerdict(card, "unsure");
        break;
      default:
        break;
    }
  });

  // 截圖自動化 seam（跟其他 audition 頁同型）
  (window as unknown as { __assetReview?: unknown }).__assetReview = {
    items,
    renderedCount: (): number => rendered,
    calibrationOk: (): boolean | null => studio.calibrationOk,
    select,
  };
}
