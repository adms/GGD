/**
 * glbWrite — a dependency-free, byte-deterministic GLB *writer*.
 *
 * Re-homed from `tools/voxel-gen/glbWrite.ts` into @ggd/shared for task #229
 * and ported from node `Buffer` to `Uint8Array`. The format arithmetic is
 * unchanged; `gen.test.ts`'s sha256 pins are what makes that checkable rather
 * than asserted.
 *
 * WHY WRITE ONE. The repo has no glTF authoring library and deliberately does
 * not add one: `tools/model-budget/glb.ts` already carries the *reading* half
 * of the same primitives (12-byte header, length-prefixed JSON/BIN chunks,
 * 4-byte-aligned bufferViews) and `rebuildGlb` already re-emits a GLB from
 * them. This module is the authoring counterpart, kept small enough that every
 * byte it produces can be re-derived by reading this one file — the same
 * property the measurement side was built for.
 *
 * SCOPE, on purpose. It emits exactly what the blocky humanoid needs and
 * nothing else: ONE skinned triangle primitive, ONE material with ONE embedded
 * PNG, ONE skin, and N animations whose channels target only `rotation` and
 * `translation`. No morph targets, no sparse accessors, no extensions, no
 * external buffers. Anything more would be untested surface.
 *
 * DETERMINISM. Floats are quantised (see `q`) before they reach the buffer so a
 * trigonometric keyframe cannot differ in its last mantissa bit between runs or
 * platforms; the JSON chunk is emitted with a stable key order because it is
 * built from plain object literals in a fixed sequence; the PNG writer uses
 * stored DEFLATE blocks.
 */
import { alloc, concat, f32le, readF32le, u32le, u16le, utf8 } from "./bytes";

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export const COMP_BYTE = 5121; // UNSIGNED_BYTE
export const COMP_USHORT = 5123; // UNSIGNED_SHORT
export const COMP_FLOAT = 5126; // FLOAT

const pad4 = (n: number): number => (n + 3) & ~3;

/**
 * Quantise to 1e-6. Keyframe values come out of `Math.sin`/`Math.cos`, whose
 * last bits are libm-dependent; rounding to a fixed grid BEFORE the float32
 * cast makes the emitted bytes a pure function of the parameter table.
 */
export function q(v: number): number {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}

interface PendingAccessor {
  componentType: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4";
  count: number;
  data: Uint8Array;
  min?: number[];
  max?: number[];
  /** ARRAY_BUFFER (34962) / ELEMENT_ARRAY_BUFFER (34963), or undefined */
  target?: number;
}

const NUM_COMPONENTS: Record<PendingAccessor["type"], number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

export class GlbBuilder {
  private readonly accessors: PendingAccessor[] = [];
  private readonly extraViews: { data: Uint8Array; label: string }[] = [];

  /** Add a float accessor; returns its index. */
  addFloat(
    type: PendingAccessor["type"],
    values: readonly number[],
    opts?: { minMax?: boolean; target?: number },
  ): number {
    const n = NUM_COMPONENTS[type];
    if (values.length % n !== 0) throw new Error(`${type} needs a multiple of ${n} values`);
    const count = values.length / n;
    const data = alloc(values.length * 4);
    values.forEach((v, i) => f32le(data, i * 4, q(v)));
    let min: number[] | undefined;
    let max: number[] | undefined;
    if (opts?.minMax) {
      min = new Array<number>(n).fill(Infinity);
      max = new Array<number>(n).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < n; c++) {
          // read back the ROUNDED float32 so min/max are exactly representable
          const v = readF32le(data, (i * n + c) * 4);
          if (v < min[c]!) min[c] = v;
          if (v > max[c]!) max[c] = v;
        }
      }
    }
    this.accessors.push({
      componentType: COMP_FLOAT,
      type,
      count,
      data,
      min,
      max,
      target: opts?.target,
    });
    return this.accessors.length - 1;
  }

  /** Add an unsigned-short SCALAR index accessor. */
  addIndices(values: readonly number[]): number {
    const data = alloc(pad4(values.length * 2));
    values.forEach((v, i) => u16le(data, i * 2, v));
    this.accessors.push({
      componentType: COMP_USHORT,
      type: "SCALAR",
      count: values.length,
      data,
      target: 34963,
    });
    return this.accessors.length - 1;
  }

  /** Add an unsigned-byte VEC4 accessor (JOINTS_0). */
  addJoints(values: readonly number[]): number {
    if (values.length % 4 !== 0) throw new Error("JOINTS_0 needs a multiple of 4 values");
    const data = alloc(pad4(values.length));
    values.forEach((v, i) => {
      data[i] = v & 0xff;
    });
    this.accessors.push({
      componentType: COMP_BYTE,
      type: "VEC4",
      count: values.length / 4,
      data,
      target: 34962,
    });
    return this.accessors.length - 1;
  }

  /** Add a raw (non-accessor) bufferView, e.g. an embedded image. */
  addRawView(data: Uint8Array, label: string): number {
    this.extraViews.push({ data, label });
    return this.accessors.length + this.extraViews.length - 1;
  }

  /** Serialise. `doc` is the rest of the glTF document. */
  build(doc: Record<string, unknown>): Uint8Array {
    const parts: Uint8Array[] = [];
    let offset = 0;
    const views: Record<string, unknown>[] = [];
    const push = (data: Uint8Array, target?: number): number => {
      const start = offset;
      parts.push(data);
      offset += data.length;
      const padded = pad4(offset);
      if (padded > offset) {
        parts.push(alloc(padded - offset));
        offset = padded;
      }
      views.push(
        target === undefined
          ? { buffer: 0, byteOffset: start, byteLength: data.length }
          : { buffer: 0, byteOffset: start, byteLength: data.length, target },
      );
      return views.length - 1;
    };

    const accessorJson = this.accessors.map((a) => {
      const viewIndex = push(a.data, a.target);
      const j: Record<string, unknown> = {
        bufferView: viewIndex,
        componentType: a.componentType,
        count: a.count,
        type: a.type,
      };
      if (a.min && a.max) {
        j.min = a.min;
        j.max = a.max;
      }
      return j;
    });
    const rawViewIndex = this.extraViews.map((v) => push(v.data));

    const json = {
      asset: { version: "2.0", generator: "ggd-voxel-gen" },
      ...doc,
      accessors: accessorJson,
      bufferViews: views,
      buffers: [{ byteLength: offset }],
    };

    const bin = concat(parts);
    const jsonStr = utf8(JSON.stringify(json));
    const jsonPad = alloc(pad4(jsonStr.length) - jsonStr.length);
    jsonPad.fill(0x20);
    const jsonChunk = concat([jsonStr, jsonPad]);
    const binChunk = concat([bin, alloc(pad4(bin.length) - bin.length)]);
    const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;

    const head = alloc(12);
    u32le(head, 0, GLB_MAGIC);
    u32le(head, 4, 2);
    u32le(head, 8, total);
    const jh = alloc(8);
    u32le(jh, 0, jsonChunk.length);
    u32le(jh, 4, CHUNK_JSON);
    const bh = alloc(8);
    u32le(bh, 0, binChunk.length);
    u32le(bh, 4, CHUNK_BIN);
    void rawViewIndex;
    return concat([head, jh, jsonChunk, bh, binChunk]);
  }

  /** The bufferView index a raw view will occupy once `build` runs. */
  rawViewSlot(i: number): number {
    return this.accessors.length + i;
  }
}

/** Euler-X rotation → glTF quaternion (x, y, z, w). */
export function quatX(rad: number): [number, number, number, number] {
  const h = rad / 2;
  return [q(Math.sin(h)), 0, 0, q(Math.cos(h))];
}

/** Euler-Y rotation → quaternion. */
export function quatY(rad: number): [number, number, number, number] {
  const h = rad / 2;
  return [0, q(Math.sin(h)), 0, q(Math.cos(h))];
}

/** Euler-Z rotation → quaternion. */
export function quatZ(rad: number): [number, number, number, number] {
  const h = rad / 2;
  return [0, 0, q(Math.sin(h)), q(Math.cos(h))];
}

/** Column-major 4x4 translation matrix, glTF order. */
export function translationMat(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, q(x), q(y), q(z), 1];
}
