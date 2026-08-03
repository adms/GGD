/**
 * Champion MODEL geometry + per-clip orientation guards (tasks #73, #68).
 *
 * Reads the SHIPPED champion .glbs directly (JSON + BIN chunks, no Babylon) and
 * asserts the two model fixes hold:
 *   #73 — no champion model ships a stray `TeamGlow*` ground-billboard mesh
 *         (strip_teamglow.py); the team read is ChampionView's own ring.
 *   #68 — every clip that `fix_clip_orientation.py` re-grounded now starts
 *         UPRIGHT: the root bone's frame-0 rotation is ~identity, so no
 *         idle/run/hurt renders face-down (heropikachu #111) and no attack/cast
 *         renders inverted.
 *
 * Guarded so it degrades cleanly when the content tree is absent.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const CH_DIR = join(REPO, "content", "champions");
const MODELS_DIR = join(REPO, "content", "models");
const SKIN_DIR = join(REPO, "content", "skins");
const CONTENT = join(REPO, "content");
const haveContent = existsSync(CH_DIR) && existsSync(MODELS_DIR);

interface Gltf {
  materials?: { name?: string }[];
  nodes?: { name?: string; children?: number[] }[];
  animations?: { name?: string; channels: { target: { node: number; path: string }; sampler: number }[]; samplers: { input: number; output: number }[] }[];
  accessors?: { bufferView: number; byteOffset?: number; count: number; type: string; componentType: number }[];
  bufferViews?: { byteOffset?: number; byteLength: number }[];
}

function readGlb(path: string): { gltf: Gltf; bin: Buffer } {
  const data = readFileSync(path);
  let off = 12;
  let gltf: Gltf | null = null;
  let bin = Buffer.alloc(0);
  while (off < data.length) {
    const clen = data.readUInt32LE(off);
    const ctype = data.readUInt32LE(off + 4);
    off += 8;
    const chunk = data.subarray(off, off + clen);
    off += clen;
    if (ctype === 0x4e4f534a) gltf = JSON.parse(chunk.toString("utf8")) as Gltf;
    else if (ctype === 0x004e4942) bin = chunk;
  }
  if (!gltf) throw new Error(`${path}: no JSON chunk`);
  return { gltf, bin };
}

/** modelKey -> glb absolute path, for every imported.* champion model. */
function championModels(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of readdirSync(CH_DIR)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    let d: { schema?: string; modelKey?: string };
    try {
      d = JSON.parse(readFileSync(join(CH_DIR, f), "utf8"));
    } catch {
      continue;
    }
    if (d.schema !== "champion@1" || !d.modelKey?.startsWith("imported.")) continue;
    if (out.has(d.modelKey)) continue;
    const doc = JSON.parse(readFileSync(join(MODELS_DIR, `${d.modelKey}.json`), "utf8"));
    out.set(d.modelKey, join(CONTENT, doc.glbPath));
  }
  return out;
}

/**
 * Every `imported.*` body a SKIN puts on a champion (`skin@1.modelKey`).
 *
 * A skin swaps the champion's whole body glb, so these are shipped champion
 * bodies by every definition that matters to the player — but they are named by
 * NO champion doc, which is why `championModels()` above cannot see them.
 */
function skinBodyModelKeys(): string[] {
  if (!existsSync(SKIN_DIR)) return [];
  const out: string[] = [];
  for (const f of readdirSync(SKIN_DIR)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    let d: { schema?: string; modelKey?: string };
    try {
      d = JSON.parse(readFileSync(join(SKIN_DIR, f), "utf8"));
    } catch {
      continue;
    }
    if (d.schema === "skin@1" && d.modelKey?.startsWith("imported.")) out.push(d.modelKey);
  }
  return [...new Set(out)].sort();
}

/** A python3 that can run the sweep (stdlib only), or null → the test skips. */
function findPython(): string[] | null {
  for (const c of [["python3"], ["/opt/homebrew/bin/python3"], ["/usr/bin/python3"]]) {
    try {
      execFileSync(c[0]!, [...c.slice(1), "-c", "import json, glob"], { stdio: "pipe" });
      return c;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

function nodeDepths(gltf: Gltf): number[] {
  const nodes = gltf.nodes ?? [];
  const depth = new Array<number>(nodes.length).fill(-1);
  const roots = new Set(nodes.map((_, i) => i));
  for (const n of nodes) for (const c of n.children ?? []) roots.delete(c);
  const walk = (i: number, d: number): void => {
    depth[i] = d;
    for (const c of nodes[i]!.children ?? []) walk(c, d + 1);
  };
  for (const r of [...roots].sort((a, b) => a - b)) walk(r, 0);
  return depth;
}

/** frame-0 quaternion of a clip's shallowest rotation channel (or null). */
function rootFrame0Quat(gltf: Gltf, bin: Buffer, clipName: string): [number, number, number, number] | null {
  const anim = (gltf.animations ?? []).find((a) => a.name === clipName);
  if (!anim) return null;
  const depth = nodeDepths(gltf);
  const rot = anim.channels.filter((c) => c.target.path === "rotation");
  if (rot.length === 0) return null;
  const root = rot.reduce((a, b) => (depth[b.target.node]! < depth[a.target.node]! ? b : a));
  const acc = gltf.accessors![anim.samplers[root.sampler]!.output]!;
  const bv = gltf.bufferViews![acc.bufferView]!;
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return [
    bin.readFloatLE(base),
    bin.readFloatLE(base + 4),
    bin.readFloatLE(base + 8),
    bin.readFloatLE(base + 12),
  ];
}

const angleDeg = (q: [number, number, number, number]): number =>
  (2 * Math.acos(Math.min(1, Math.abs(q[3])))) * 180 / Math.PI;

// Clips fix_clip_orientation.py re-grounded (must now start upright).
const FIXED_CLIPS: Record<string, string[]> = {
  "imported.heropikachu": ["Stand - 1", "Walk"],
  "imported.herosasuke": ["Stand", "Walk"],
  "imported.ma": ["Stand -1", "Walk"],
  "imported.pika": ["Stand - 1"],
  "imported.sd2": ["Stand - 1", "Walk"],
  "imported.herobuu": ["Walk"],
  "imported.heroichigo": ["Walk"],
  "imported.herooichi": ["Walk", "Attack", "Spell"],
  "imported.kikyou": ["walk", "attack - 1"],
  "imported.linkstik": ["Stand Hit"],
  "imported.herofate": ["Spell"],
  "imported.herohanzouhattori": ["Attack"],
  "imported.herolight": ["Spell"],
  "imported.herorider": ["Attack"],
  "imported.herosaber": ["Spell"],
  "imported.heroshana": ["Spell"],
  "imported.lubu": ["Spell"],
  "imported.niya": ["Spell"],
  "imported.renaryugu2": ["Spell"],
};

describe.runIf(haveContent)("champion model geometry + orientation guards", () => {
  const models = championModels();

  it("no champion model ships a stray TeamGlow ground billboard (#73)", () => {
    cover("model-teamglow-stripped");
    const offenders: string[] = [];
    for (const [mk, path] of models) {
      const { gltf } = readGlb(path);
      const glow = (gltf.materials ?? []).filter((m) => /^teamglow/i.test(m.name ?? ""));
      if (glow.length) offenders.push(`${mk}: ${glow.map((m) => m.name).join(",")}`);
    }
    expect(offenders, `models still carry a baked team-glow billboard:\n${offenders.join("\n")}`).toEqual([]);
  });

  /**
   * GH#233 —— 上面那條 `#73 no TeamGlow` 判的是 `championModels()`,而那個集合
   * 是**比出貨集合小的**:它只讀 `content/champions/*.json` 的 `modelKey`。
   * `skin@1` 也指定身體 glb,兩邊都看不到它 —— 於是
   * `strip_teamglow.py --dry-run` 印 0 行、上面那條測試全綠,而出貨的
   * `heropika.glb`(`skin.godie-u00l.heropika`,godie-u00l 的皮卡丘造型)
   * **還帶著 `TeamGlow1` @ primitive 1**(直接讀 glb 位元組量到的)。
   * CLAUDE.md 失敗形態 ⑤:被測的不是出貨的那個。
   *
   * 這一條釘的是**機制**:那支掃描器判斷用的集合,必須涵蓋每一具會被穿到身上的
   * 身體。斷言讀的是 `strip_teamglow.py --list-models` 真的吐出來的東西
   * (跑那支程式,不是 grep 它的原始碼 —— 失敗形態 ⑥),再跟這裡獨立從
   * `content/skins/` 讀出來的清單對帳。
   */
  it("the #73 TeamGlow sweep must see SKIN-selected champion bodies too (GH#233)", () => {
    cover("model-teamglow-stripped");
    const py = findPython();
    if (!py) return; // python3 absent (CI image without it) — nothing to check
    const skins = skinBodyModelKeys();
    expect(skins.length, "content/skins ships no imported.* body — premise gone").toBeGreaterThan(0);

    const out = execFileSync(py[0]!, [...py.slice(1), join(HERE, "..", "strip_teamglow.py"), "--list-models"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const swept = new Set(
      out
        .split("\n")
        .map((l) => l.split("\t")[0]!.trim())
        .filter(Boolean),
    );
    const blind = skins.filter((mk) => !swept.has(mk));
    expect(
      blind,
      `strip_teamglow.py's sweep is blind to these SHIPPED skin bodies, so its\n` +
        `"clean" verdict says nothing about them:\n  ${blind.join("\n  ")}\n` +
        `Fix the enumerator (champion_body_model_keys), not this test.`,
    ).toEqual([]);
  });

  it("every re-grounded clip now starts UPRIGHT (root frame-0 ≈ identity) (#68)", () => {
    cover("model-clip-orientation-upright");
    const bad: string[] = [];
    for (const [mk, clips] of Object.entries(FIXED_CLIPS)) {
      const path = models.get(mk);
      if (!path) continue;
      const { gltf, bin } = readGlb(path);
      for (const clip of clips) {
        const q = rootFrame0Quat(gltf, bin, clip);
        if (!q) {
          bad.push(`${mk} '${clip}': clip/root-channel not found`);
          continue;
        }
        const deg = angleDeg(q);
        if (deg > 15) bad.push(`${mk} '${clip}': still ${deg.toFixed(1)}deg off upright`);
      }
    }
    expect(bad, `re-grounded clips regressed:\n${bad.join("\n")}`).toEqual([]);
  });

  it("a known-tilted clip is corrected upright: heropikachu idle 'Stand - 1' (99.7°→0°) (#68/#111)", () => {
    cover("model-clip-orientation-upright");
    const path = models.get("imported.heropikachu");
    expect(path, "heropikachu model missing").toBeTruthy();
    const { gltf, bin } = readGlb(path!);
    const q = rootFrame0Quat(gltf, bin, "Stand - 1");
    expect(q, "Stand - 1 root rotation channel not found").toBeTruthy();
    expect(angleDeg(q!)).toBeLessThan(5); // was 99.7° face-down (#111), now upright
  });
});
