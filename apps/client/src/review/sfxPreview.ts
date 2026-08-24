/**
 * sfxPreview —— asset-review.html（#664）的音效那一半：
 * 解析 sfx id → 出貨檔案（`content/config/audio-map.json` 的 `sfx` 表，
 * ＝ 對局真的在播的那一份綁定，⛔ 不自己另編一張表）、WebAudio 解碼、
 * 波形圖、▶ 試聽。
 */

interface AudioMapSfxEntry {
  files?: string[];
  gain?: number;
}

let sfxMapPromise: Promise<Record<string, AudioMapSfxEntry>> | null = null;

function loadSfxMap(): Promise<Record<string, AudioMapSfxEntry>> {
  sfxMapPromise ??= fetch("/content/config/audio-map.json")
    .then((r) => {
      if (!r.ok) throw new Error(`audio-map.json → ${r.status}`);
      return r.json() as Promise<{ sfx?: Record<string, AudioMapSfxEntry> }>;
    })
    .then((doc) => doc.sfx ?? {});
  return sfxMapPromise;
}

export interface ResolvedSfx {
  urls: string[];
  gain: number;
}

/** id → 出貨音檔 URL。id 是 audio-map 的 SFX key；帶 "/" 的當 content 相對路徑。 */
export async function resolveSfx(id: string): Promise<ResolvedSfx> {
  if (id.includes("/")) {
    return { urls: ["/content/" + id.replace(/^\/?(?:content\/)?/, "")], gain: 1 };
  }
  const map = await loadSfxMap();
  const entry = map[id];
  const files = entry?.files ?? [];
  if (files.length === 0) {
    throw new Error(`audio-map.json 的 sfx 表裡沒有「${id}」，它也不是一個路徑`);
  }
  return { urls: files.map((f) => "/content/" + f), gain: entry?.gain ?? 1 };
}

let sharedCtx: AudioContext | null = null;

function audioCtx(): AudioContext {
  sharedCtx ??= new AudioContext();
  return sharedCtx;
}

export async function decodeSfx(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const bytes = await res.arrayBuffer();
  return await audioCtx().decodeAudioData(bytes);
}

/** min/max 柱狀波形（跟 BGM audition 同一種讀法：看得出有聲/沒聲/削波）。 */
export function drawWaveform(buffer: AudioBuffer, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#7dd3fc";
  const data = buffer.getChannelData(0);
  const perCol = Math.max(1, Math.floor(data.length / w));
  for (let x = 0; x < w; x++) {
    let min = 1;
    let max = -1;
    const base = x * perCol;
    for (let i = 0; i < perCol; i++) {
      const v = data[base + i] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y0 = ((1 - max) / 2) * h;
    const y1 = ((1 - min) / 2) * h;
    ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
  }
}

/** 試聽（走出貨的 gain）。瀏覽器要求手勢後才出聲 —— 呼叫端綁在 click 上。 */
export function playBuffer(buffer: AudioBuffer, gain = 1): void {
  const c = audioCtx();
  void c.resume();
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(c.destination);
  src.start();
}
