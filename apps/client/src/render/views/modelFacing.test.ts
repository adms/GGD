/**
 * model-facing-measured — THE guard that re-derives every champion model's yaw
 * offset FROM THE SHIPPED .glb BYTES and checks the offset the game actually
 * applies against it.
 *
 * WHY THIS FILE EXISTS (CLAUDE.md 第二守則, 失敗形態 ⑦)
 * ---------------------------------------------------------------------------
 * `glbFacing.test.ts` next door asserts the CONSTANTS ("NATIVE is 0",
 * "IMPORTED is π/2", "IMPORTED − NATIVE is π/2"). Those five cases were all
 * GREEN throughout the incident glbFacing.ts's own header confesses to — the
 * pass where both families rendered 180° backward — because adding 180° to both
 * constants keeps every one of those equalities true. A test that only reads
 * back the number under test cannot notice the number is wrong.
 *
 * So this file never mentions a constant. It opens each real .glb, measures
 * which way the mesh is actually built, computes the offset that geometry
 * REQUIRES, and compares that with what `glbYawOffset()` returns for the
 * shipped doc. Break the offset, break the doc override, or re-export a model
 * with a different bake, and this goes red naming the file.
 *
 * THE LAW BEING CHECKED
 * ---------------------------------------------------------------------------
 *   required offset ≡ φ (mod 360°),  φ = atan2(forward.x, forward.z) on disk
 *
 * derived in glbFacing.ts's header from Babylon's `__root__` (180° about Y
 * combined with scaling.z = −1 ⇒ a pure X mirror) and anchored on two shipped
 * families that disagree by exactly 90°, so it cannot be satisfied by a single
 * global rotation and cannot be fitted to one model.
 *
 * HOW "FORWARD" IS MEASURED WITHOUT TRUSTING NAMES
 * ---------------------------------------------------------------------------
 * A biped's left/right bone pair gives the RIGHT vector, and in a right-handed
 * Y-up frame forward = up × right = (right.z, 0, −right.x). That is sign-exact
 * — but only if the source labelled L and R correctly, and several shipped
 * models DO NOT:
 *
 *   • every WC3 「… Left Ref」/「… Right Ref」 ATTACHMENT node measured here is
 *     mirrored relative to the skeleton in Hblm/H021/goku, so attachment nodes
 *     are excluded outright and only `Bone_*`-style skeleton pairs are used;
 *   • `imported.heropika`'s whole skeleton is L/R-swapped (`Bone_Ear_L` sits on
 *     the geometric right), which is why the chirality cue alone would flag it
 *     as flipped when its tail — and a tail points backwards — puts its forward
 *     squarely at +X with the rest of its family.
 *
 * So a verdict needs BOTH agreement across ≥3 skeleton pairs AND a second,
 * name-independent cue. `heroryuk` is the calibration: it is the one model the
 * retired hardcoded set already called flipped, and the method reproduces that
 * from geometry rather than being fitted to it.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { glbYawOffset, familyGlbYawOffset } from "./glbFacing";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const CONTENT = path.join(REPO, "content");
const MODELS_DIR = path.join(CONTENT, "models");

// ---------------------------------------------------------------------------
// minimal GLB reader (no deps, no Babylon): JSON chunk + node hierarchy
// ---------------------------------------------------------------------------

interface Glb {
  json: {
    nodes?: { name?: string; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
    skins?: { joints: number[] }[];
  };
}

function readGlb(file: string): Glb | null {
  const buf = fs.readFileSync(file);
  if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) return null;
  let off = 12;
  let json: Glb["json"] | null = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + len))) as Glb["json"];
    off += 8 + len;
    off += (4 - (off % 4)) % 4;
  }
  return json ? { json } : null;
}

type M16 = number[];
/** Indexed reads on plain arrays: the workspace runs noUncheckedIndexedAccess. */
const mi = (m: M16, i: number): number => m[i] ?? 0;
function mul(a: M16, b: M16): M16 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += mi(a, k * 4 + r) * mi(b, c * 4 + k);
      o[c * 4 + r] = s;
    }
  return o;
}
function localMatrix(n: NonNullable<Glb["json"]["nodes"]>[number]): M16 {
  if (n.matrix) return [...n.matrix];
  const t = n.translation ?? [0, 0, 0];
  const r4 = n.rotation ?? [0, 0, 0, 1];
  const x = r4[0] ?? 0, y = r4[1] ?? 0, z = r4[2] ?? 0, w = r4[3] ?? 1;
  const s = n.scale ?? [1, 1, 1];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  const m = new Array<number>(16).fill(0);
  const s0 = s[0] ?? 1, s1 = s[1] ?? 1, s2 = s[2] ?? 1;
  m[0] = (1 - 2 * (yy + zz)) * s0; m[1] = 2 * (xy + wz) * s0;   m[2] = 2 * (xz - wy) * s0;
  m[4] = 2 * (xy - wz) * s1;       m[5] = (1 - 2 * (xx + zz)) * s1; m[6] = 2 * (yz + wx) * s1;
  m[8] = 2 * (xz + wy) * s2;       m[9] = 2 * (yz - wx) * s2;     m[10] = (1 - 2 * (xx + yy)) * s2;
  m[12] = t[0] ?? 0; m[13] = t[1] ?? 0; m[14] = t[2] ?? 0; m[15] = 1;
  return m;
}
function worldMatrices(g: Glb): M16[] {
  const nodes = g.json.nodes ?? [];
  const parent = new Array<number>(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const W: (M16 | null)[] = new Array(nodes.length).fill(null);
  const calc = (i: number): M16 => {
    const done = W[i];
    if (done) return done;
    const node = nodes[i];
    if (!node) return new Array<number>(16).fill(0);
    const l = localMatrix(node);
    const pi = parent[i] ?? -1;
    const m = pi < 0 ? l : mul(calc(pi), l);
    W[i] = m;
    return m;
  };
  nodes.forEach((_, i) => calc(i));
  return W as M16[];
}

// ---------------------------------------------------------------------------
// cue 1 — left/right skeleton chirality (attachment "Ref" nodes excluded)
// ---------------------------------------------------------------------------

const isRefNode = (n: string) => /\bRef\s*$/i.test(n);
const looksLeft = (n: string) =>
  /Left/i.test(n) || /_L(?=$|[^a-zA-Z])/.test(n) || /^L[A-Z]/.test(n) || /\bL\d*$/.test(n);

function mirrorCandidates(name: string): string[] {
  const out = new Set<string>();
  const add = (s: string) => { if (s !== name) out.add(s); };
  if (/Left/i.test(name)) { add(name.replace(/Left/g, "Right")); add(name.replace(/left/g, "right")); }
  add(name.replace(/_L(?=$|[^a-zA-Z])/g, "_R"));
  add(name.replace(/\bL(?=\d*$)/g, "R"));
  add(name.replace(/^L(?=[A-Z])/, "R"));
  return [...out];
}

interface Chirality { yawDeg: number; n: number; coherence: number }

function chiralityForward(g: Glb): Chirality | null {
  const nodes = g.json.nodes ?? [];
  const W = worldMatrices(g);
  const byName = new Map<string, number>();
  nodes.forEach((n, i) => { if (n.name) byName.set(n.name, i); });
  const samples: { dx: number; dz: number }[] = [];
  const seen = new Set<string>();
  for (const [name, i] of byName) {
    if (isRefNode(name) || !looksLeft(name)) continue;
    for (const rn of mirrorCandidates(name)) {
      const j = byName.get(rn);
      if (j === undefined || j === i) continue;
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (seen.has(key)) break;
      const wj = W[j], wi = W[i];
      if (!wj || !wi) break;
      const dx = mi(wj, 12) - mi(wi, 12);
      const dz = mi(wj, 14) - mi(wi, 14);
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) break;
      seen.add(key);
      samples.push({ dx: dx / len, dz: dz / len });
      break;
    }
  }
  if (!samples.length) return null;
  // forward = up × right = (right.z, 0, -right.x)
  let fx = 0, fz = 0;
  for (const s of samples) { fx += s.dz; fz += -s.dx; }
  const n = Math.hypot(fx, fz);
  if (n < 1e-9) return null;
  fx /= n; fz /= n;
  let coh = 0;
  for (const s of samples) coh += s.dz * fx + -s.dx * fz;
  return { yawDeg: (Math.atan2(fx, fz) * 180) / Math.PI, n: samples.length, coherence: coh / samples.length };
}

// ---------------------------------------------------------------------------
// cue 2 — name-independent: a TAIL points backwards; a HEAD leans forwards
// ---------------------------------------------------------------------------

function axialCue(g: Glb): { fx: number; source: string } | null {
  const nodes = g.json.nodes ?? [];
  const W = worldMatrices(g);
  const at = (re: RegExp) => nodes.map((n, i) => [n.name ?? "", i] as const).filter(([n]) => re.test(n) && !isRefNode(n));
  const origin = at(/pelvis|hips|^root$|bone_root/i)[0];
  const originM = origin ? W[origin[1]] : undefined;
  const ox = originM ? mi(originM, 12) : 0;
  for (const [re, sign, label] of [
    [/tail/i, -1, "tail"],
    [/jaw|nose|snout|muzzle/i, +1, "jaw"],
  ] as const) {
    const hits = at(re);
    if (!hits.length) continue;
    let acc = 0;
    for (const [, i] of hits) {
      const m = W[i];
      if (m) acc += mi(m, 12) - ox;
    }
    if (Math.abs(acc) < 1e-3) continue;
    // tail at -X ⇒ forward +X (sign = -1 flips it)
    return { fx: Math.sign(acc) * sign, source: label };
  }
  return null;
}

// ---------------------------------------------------------------------------

const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** Snap a measured yaw to the nearest quarter turn (bakes are axis-aligned). */
const quarter = (d: number) => norm360(Math.round(norm360(d) / 90) * 90);

interface ModelDocLite { id: string; glbPath: string; yawOffsetDeg?: number }

function loadModelDocs(): ModelDocLite[] {
  return fs
    .readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(MODELS_DIR, f), "utf8")) as ModelDocLite)
    .filter((d) => typeof d.glbPath === "string");
}

/** Docs whose .glb is present AND yields a confident chirality reading. */
function measurable(): { doc: ModelDocLite; chir: Chirality; axial: ReturnType<typeof axialCue> }[] {
  const out: { doc: ModelDocLite; chir: Chirality; axial: ReturnType<typeof axialCue> }[] = [];
  for (const doc of loadModelDocs()) {
    const file = path.join(CONTENT, doc.glbPath);
    if (!fs.existsSync(file)) continue;
    const g = readGlb(file);
    if (!g) continue;
    const chir = chiralityForward(g);
    if (!chir || chir.n < 3 || chir.coherence < 0.99) continue;
    out.push({ doc, chir, axial: axialCue(g) });
  }
  return out;
}

type Measured = { doc: ModelDocLite; chir: Chirality; axial: ReturnType<typeof axialCue> };

// ---------------------------------------------------------------------------
// GH#216 —— 普查：**每一具**出貨模型都要被歸到一格，⛔ 沒有「安靜地不算」
// ---------------------------------------------------------------------------
/**
 * `measurable()` 上面那一版把讀不出來的模型**直接 continue 掉**，而唯一的下界是
 * 一個手寫的 `>= 40`。出貨模型量到 124 具 ⇒ 最多 84 具可以無聲地退出普查而
 * 每一條斷言照樣全綠（CLAUDE.md 失敗形態 ③）。而 GH#216 要的正是
 * 「**N 支正確 / M 支偏差**的判定與證據」+「**靜默退回要紅**」。
 *
 * ⇒ 這裡把同一批模型**窮舉**成互斥的幾格，下界改成**從語料推導**的等式
 * （measured + noSkeleton === 全部），⛔ 不是一個會過期的數字。
 */
type CensusVerdict =
  /** 讀得出骨架方向：進入下面每一條「面向對不對」的斷言 */
  | { kind: "measured" }
  /** 一對 L/R 骨頭都沒有 —— **結構性**讀不出來（靜態道具、單網格模型），⛔ 不是退步 */
  | { kind: "no-skeleton" }
  /** 有 1–2 對：樣本太少，方向可能是巧合 */
  | { kind: "few-pairs"; n: number }
  /** 有 ≥3 對但**彼此不同意** —— 這一格才是真的可疑（骨架被鏡射過？） */
  | { kind: "incoherent"; n: number; coherence: number }
  /** .glb 根本讀不開 —— 內容壞了 */
  | { kind: "unreadable" };

/**
 * ⚠️ **量到的洞，逐具具名** —— 出貨模型裡面向**沒有任何守衛在看**的那些（2026-09-15 起 66 具，原本 3 具）。
 * ⛔ 它們不可以繼續躲在一個 `continue` 後面：列在這裡 = 洞還在，但它**有名字、有理由、
 * 而且不會長大**（表外多一具就紅）。⭐ 反方向也關：哪天有人把某一具修好變成量得出來，
 * 它還留在這張表上一樣紅 —— 一張活得比缺陷還久的豁免表就是下一個謊。
 *
 * ⚠️ 這三具**不是**「已知面向錯誤」，是「**面向對不對沒有人知道**」。
 * 前兩具是真的上場英雄（`godie-u00n/u00o` 魯夫、`godie-emns` 夜神月）
 * ⇒ 要真的判定它們，得靠 `axialCue()` 之外的第三個線索，那是 GH#216 的後續。
 */
const FACING_UNVERIFIED: Readonly<Record<string, string>> = {
  "imported.luffe": "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合（英雄 godie-u00n / u00o 魯夫）",
  "imported.herolight": "7 對 L/R 骨頭彼此不同意（骨架疑似被鏡射過）（英雄 godie-emns 夜神月）",
  "prop.guardian.beast": "8 對骨頭略微不同意；是場景 prop，⛔ 不是英雄模型",
  // ⭐ 2026-09-15 —— 以下 63 具是 09-10 起的批次匯入（ou99／community 骨架、以及 PR #1152
  //   的 `version.body.*` 凍結副本）量出來的洞：v0.44.1 時 22 具未宣告、合併前 main 24 具、
  //   合併 PR #1152 之後 63 具。⚠️ 它們**不是**「已知面向錯誤」，是「面向對不對沒有人知道」——
  //   這批骨架的 L/R 骨頭命名少（多數只有 1–2 對），`chiralityForward()` 量不出方向。
  //   ⛔ 逐具具名、理由是量到的 n／coherence，⭐ 第 64 具出現照樣紅；修好一具（量得出來）
  //   ④ 會叫你把它從表上拿掉。要真的判定它們，仍然是 GH#216 的後續（第三個線索）。
  "community.body.0bcbde77f00fedccc721ef59c941e3b6ed10e48f97649f8c":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "community.body.0d9eed3ab4e8246e20a12e2f0ee03786931aeacfe4976e2c":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "community.body.6d64a9f6883b5f7b6fc6de78cef8d9acbc6880af087a1b7c":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "community.body.70cf6a6025b1d6f6de4c2dc660ad90a84ef2c4013ac2315d":
    "4 對 L/R 骨頭彼此不同意（coherence 0.750）—— 骨架疑似被鏡射過",
  "community.body.d5743afe53dd93c4e69d1f951702a55c1f9fe1ca04c3b9bb":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.452782":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.454482":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.454482-standard-v2":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.457280":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.457280-standard-v2":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.463198":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.470426":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.474798":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.478915":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.487191":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.487487-7yzc0mtk":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.487487-7yzc0mtk-standard-v2":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.491448":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.491448-standard-v3":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.497400":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.498214":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.498214-standard-v2":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "ou99.498517":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.06d16d67ecdfa30538206289955afffc2d1f525a57292fd7":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.06f84bffd4849686b5a832e8e458fc52bc01c585cf25c062":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.0c5df87ee0f8b37a38897e2b5bc903c681d8250dbe156c75":
    "4 對 L/R 骨頭彼此不同意（coherence 0.750）—— 骨架疑似被鏡射過",
  "version.body.0cb6555ccbf4b9e95eb4bc18071445cebafcf75d5675eb00":
    "4 對 L/R 骨頭彼此不同意（coherence 0.750）—— 骨架疑似被鏡射過",
  "version.body.115a4c5a7e643388bd988c1caab582482f6d1175616a0437":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.165caee7a12e8a86a1af39acc54bd4547454e2a6ba0d0556":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.17eba4aed3947bd8e58067b3d1c87632d64cda76d0a4620a":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.1a87cfbf719afb88a1d7195443786a06c76fdcaa12245bd4":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合（英雄 b2-kisaragi）",
  "version.body.1d22559edc8a7be9b96c3a1bc452fff1f678b1ec80eabc46":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.1d851b0481a1b6c0b162697e8caebfe2b824da3c93e2ae7d":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.279f1646f87d33f6963e3edcd04d3770fa2cc41c3af7c473":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.287ebb2bdd01052cd0faf8a27dafd0e9fe63623172b35bb9":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.2a62bf437a4de27aeb05ddc5233dbfbe2937c332e302b435":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.2cd8263fe794211d10db3b4f1074534395a911318ba1a17d":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合（英雄 b2-uncle）",
  "version.body.36e538b4aa3d6bb68f748f9cf4af64f0393015ca7ca979c6":
    "4 對 L/R 骨頭彼此不同意（coherence 0.750）—— 骨架疑似被鏡射過（英雄 lol-karthus）",
  "version.body.39c18a9b1921088ab533c174a64f6ae0bf908933d72ed3ea":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.558344068b0ffb74a9ad7a00ec70fa65b214cbab2d7fdbb5":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.5c472ca70369050fa42ba784d7bbcaaa0dd5b23e00cdb047":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合（英雄 godie-u00n / godie-u00o）",
  "version.body.5e2e903e4c01e42cbf728251ea0dbeddfca81bd66f32ba6e":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合（英雄 godie-n003）",
  "version.body.66347ee0e95b4a1960dd0b58b17e50bedd726e4dddea3a67":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.671511d9b65665e63376d243d1dce315078056f36646ebc2":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.7135f29cae6eb26851a90d407801e0b7dc27671ca3b08909":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.71c301c8921460768d1bcf29863ce903bc588aa0cc5efdf8":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合（英雄 b2-boxxo）",
  "version.body.7746382d498189e79235a1a5aeac79a232dcd1bfa70bc353":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.799894656f162f2c3a59eaf222696fce5bb8381b5a4fd08f":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.80c676912c0c63a47519b75f49821316bb6d80cc335f3801":
    "4 對 L/R 骨頭彼此不同意（coherence 0.750）—— 骨架疑似被鏡射過",
  "version.body.8194b95b37f0deeaaad85dae9f5b86c3db28d03ce914854e":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.8c7d9c17a45eacbf0463ad09896708d85b8a8602f16344c5":
    "4 對 L/R 骨頭彼此不同意（coherence 0.750）—— 骨架疑似被鏡射過",
  "version.body.8ccd5ce36ba95dcfbe12a95f88e973cc09b630b883632578":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.96a2831657ca63fde8c35729d776d058253366c75c5a68d9":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.9dc018e902d47bae413635f604c326742a8dcfba4fe52a56":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.ab9d5c54fb910d8a7ba267b1078f811979824d9df1b14184":
    "只有 2 對 L/R 骨頭 —— 樣本數不足以排除巧合（英雄 b2-klaus）",
  "version.body.b2772908591ba8d3dfa879382b8b99f03ab711f05d76e483":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合（英雄 community-review-30-20260907）",
  "version.body.b7be82ea1fd14a9f5916b8b76515e1e428124a6dbbf664f3":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.c7d8c416ee24ef7532f51deda99df79e73c0609cee1f6100":
    "4 對 L/R 骨頭彼此不同意（coherence 0.750）—— 骨架疑似被鏡射過",
  "version.body.d0dd376d8dc09d756500861ccc7c4ddb9e797aeca35c3b0c":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.d9d8dbfa8ead890dff3d5009b07231e2aee65455e619a061":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
  "version.body.de07eb4d2080d69ca2438240aa358f37615fab1d4738d7b4":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合（英雄 community-review-11-20260907）",
  "version.body.e2db418dc4431b5e5ccdcc50ca8ecc33946efeb840296340":
    "4 對 L/R 骨頭彼此不同意（coherence 0.750）—— 骨架疑似被鏡射過",
  "version.body.e934a767de2b7cd47af4cdff17b3e5fe30d2e848cde241f4":
    "只有 1 對 L/R 骨頭 —— 樣本數不足以排除巧合",
};

function census(): { doc: ModelDocLite; verdict: CensusVerdict }[] {
  const out: { doc: ModelDocLite; verdict: CensusVerdict }[] = [];
  for (const doc of loadModelDocs()) {
    const file = path.join(CONTENT, doc.glbPath);
    if (!fs.existsSync(file)) continue; // 沒出貨這個檔就不在語料裡
    const g = readGlb(file);
    if (!g) { out.push({ doc, verdict: { kind: "unreadable" } }); continue; }
    const chir = chiralityForward(g);
    if (!chir) { out.push({ doc, verdict: { kind: "no-skeleton" } }); continue; }
    if (chir.n < 3) { out.push({ doc, verdict: { kind: "few-pairs", n: chir.n } }); continue; }
    if (chir.coherence < 0.99) {
      out.push({ doc, verdict: { kind: "incoherent", n: chir.n, coherence: chir.coherence } });
      continue;
    }
    out.push({ doc, verdict: { kind: "measured" } });
  }
  return out;
}

/**
 * The yaw a model's own geometry requires — ONE definition, used by every case
 * below so no assertion can quietly disagree with another about what "flipped"
 * means. Chirality fixes the axis; an axial cue (tail/jaw), when the model has
 * one, overrules the sign, because bone NAMES are demonstrably swappable and
 * a tail is not.
 */
function requiredPhi(m: Measured): number {
  const phi = quarter(m.chir.yawDeg);
  if (!m.axial) return phi;
  const chiralFx = Math.sin((phi * Math.PI) / 180);
  if (Math.abs(chiralFx) > 0.5 && Math.sign(chiralFx) !== m.axial.fx) return norm360(phi + 180);
  return phi;
}

describe("champion model facing, re-measured from the shipped .glb (model-facing-measured)", () => {
  it("GH#216 普查 — every shipped model lands in a bucket; none drops out silently", () => {
    cover("model-facing-measured");
    // Guards 失敗形態 ③/⑥. The retired form of this case was
    // `expect(measurable().length).toBeGreaterThanOrEqual(40)` — a hand-written
    // floor under a corpus that is now far larger, i.e. most of the roster
    // could stop being measured and every assertion below would still be green.
    const all = census();
    const of = (k: CensusVerdict["kind"]) => all.filter((c) => c.verdict.kind === k);
    const name = (c: (typeof all)[number]) => `${c.doc.id} (${c.doc.glbPath})`;

    // ① 語料不是空的，而且下界是**推導**的：measurable() 就是 measured 那一格。
    expect(all.length, "no shipped model docs point at a .glb that exists").toBeGreaterThan(0);
    expect(measurable().length).toBe(of("measured").length);

    // ② 內容壞掉要紅（讀不開的 .glb 在遊戲裡也是讀不開的）。
    expect(of("unreadable").map(name), "shipped .glb files that do not parse").toEqual([]);

    // ③ ⭐ 這是 #216 真正要的那一條：**沒有第三種下場**。一具模型要嘛量得出方向，
    //    要嘛「一對 L/R 骨頭都沒有」這個結構性事實。落在中間兩格的（樣本太少 /
    //    骨頭彼此不同意）代表這具模型的面向**沒有人在看**，⛔ 而它以前是靜默的。
    const holes = all.filter(
      (c) => c.verdict.kind === "few-pairs" || c.verdict.kind === "incoherent",
    );
    expect(
      holes
        .filter((c) => !(c.doc.id in FACING_UNVERIFIED))
        .map((c) =>
          c.verdict.kind === "few-pairs"
            ? `${name(c)}: only ${c.verdict.n} L/R bone pair(s) — direction may be coincidence`
            : `${name(c)}: ${(c.verdict as { n: number }).n} pairs disagree ` +
              `(coherence ${(c.verdict as { coherence: number }).coherence.toFixed(3)}) — skeleton mirrored?`,
        ),
      "models whose facing nothing measures and which are not declared in FACING_UNVERIFIED",
    ).toEqual([]);

    // ④ 反方向：豁免表不可以活得比缺陷久。修好一具就要把它從表上拿掉。
    const holeIds = new Set(holes.map((c) => c.doc.id));
    expect(
      Object.keys(FACING_UNVERIFIED).filter((id) => !holeIds.has(id)),
      "FACING_UNVERIFIED entries that are no longer holes — delete them",
    ).toEqual([]);

    // ⑤ 判定與證據（#216 的「N 支正確 / M 支偏差」）：窮舉且互斥 —— 每一具模型
    //    要嘛量得出來、要嘛沒有骨架、要嘛在具名的豁免表上。⛔ 沒有第四種下場。
    expect(of("measured").length + of("no-skeleton").length + holes.length).toBe(all.length);
  });

  it("the SHIPPED offset equals the offset each model's own geometry requires", () => {
    cover("model-facing-measured");
    const wrong: string[] = [];
    for (const m of measurable()) {
      const { doc, chir, axial } = m;
      const phi = requiredPhi(m);
      const applied = norm360((glbYawOffset(doc) * 180) / Math.PI);
      if (applied !== phi) {
        wrong.push(
          `${doc.id} (${doc.glbPath}): geometry requires ${phi}°, game applies ${applied}°` +
            ` [chirality ${chir.yawDeg.toFixed(1)}° n=${chir.n} coh=${chir.coherence.toFixed(3)}` +
            `${axial ? `, ${axial.source} cue fx=${axial.fx}` : ", no axial cue"}]`,
        );
      }
    }
    expect(wrong, `models whose rendered facing disagrees with their mesh:\n${wrong.join("\n")}`).toEqual([]);
  });

  it("reproduces the known-flipped model from geometry alone (method calibration)", () => {
    cover("model-facing-measured");
    // imported.heroryuk is the one model the RETIRED hardcoded set already
    // called flipped. The measurement must rediscover that independently —
    // otherwise this whole file is just reading its own answer back.
    const ryuk = measurable().find((m) => m.doc.id === "imported.heroryuk");
    expect(ryuk, "imported.heroryuk must be measurable or the calibration is vacuous").toBeDefined();
    expect(requiredPhi(ryuk!)).toBe(270);
    // and it must NOT be what the path-prefix family rule alone would give
    expect(norm360((familyGlbYawOffset(ryuk!.doc.glbPath) * 180) / Math.PI)).toBe(90);
  });

  it("the flipped models are carried by content, not by client code", () => {
    cover("model-facing-measured");
    // 第一守則: a mis-baked model must be correctable by editing content/ (a
    // live bind-mount), not by rebuilding and redeploying the client image.
    const flipped = measurable().filter((m) => requiredPhi(m) === 270);
    expect(flipped.length).toBeGreaterThan(0);
    for (const m of flipped) {
      expect(m.doc.yawOffsetDeg, `${m.doc.id} must carry its correction in its doc`).toBe(270);
    }
    // and the client source must no longer hold a per-model exception list
    const src = fs.readFileSync(path.join(HERE, "glbFacing.ts"), "utf8");
    expect(src).not.toMatch(/FLIPPED_IMPORTED_MODEL_KEYS\s*[:=]/);
  });

  it("imported.linkstik — 時空勇者 - 林克's mesh — is one of them", () => {
    cover("model-facing-measured");
    // The regression this file was written for: linkstik measures 180° from
    // its family, is shipped on a real champion, and the retired hardcoded set
    // did not list it. Pinned by id so a silent revert cannot pass quietly.
    const link = measurable().find((m) => m.doc.id === "imported.linkstik");
    expect(link, "imported.linkstik must stay measurable").toBeDefined();
    expect(requiredPhi(link!)).toBe(270);
    expect(norm360((glbYawOffset(link!.doc) * 180) / Math.PI)).toBe(270);
  });

  it("heropika keeps the family default despite reading flipped by bone names", () => {
    cover("model-facing-measured");
    // The counter-example that keeps the method honest: heropika's SKELETON is
    // L/R-swapped, so chirality alone says 270. Its tail (tails point backwards)
    // says +X. It must end up on the family default, i.e. no doc override.
    const pika = loadModelDocs().find((d) => d.id === "imported.heropika");
    expect(pika).toBeDefined();
    expect(pika!.yawOffsetDeg).toBeUndefined();
    expect(norm360((glbYawOffset(pika!) * 180) / Math.PI)).toBe(90);
  });
});
