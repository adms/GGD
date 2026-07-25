/**
 * glbWrite — a dependency-free, byte-deterministic GLB *writer*.
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
 * stored DEFLATE blocks. `gen.test.ts` pins the resulting sha256.
 */

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
  data: Buffer;
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
  private readonly extraViews: { data: Buffer; label: string }[] = [];

  /** Add a float accessor; returns its index. */
  addFloat(
    type: PendingAccessor["type"],
    values: readonly number[],
    opts?: { minMax?: boolean; target?: number },
  ): number {
    const n = NUM_COMPONENTS[type];
    if (values.length % n !== 0) throw new Error(`${type} needs a multiple of ${n} values`);
    const count = values.length / n;
    const data = Buffer.alloc(values.length * 4);
    values.forEach((v, i) => data.writeFloatLE(Math.fround(q(v)), i * 4));
    let min: number[] | undefined;
    let max: number[] | undefined;
    if (opts?.minMax) {
      min = new Array(n).fill(Infinity);
      max = new Array(n).fill(-Infinity);
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < n; c++) {
          // read back the ROUNDED float32 so min/max are exactly representable
          const v = data.readFloatLE((i * n + c) * 4);
          if (v < min![c]!) min![c] = v;
          if (v > max![c]!) max![c] = v;
        }
      }
    }
    this.accessors.push({ componentType: COMP_FLOAT, type, count, data, min, max, target: opts?.target });
    return this.accessors.length - 1;
  }

  /** Add an unsigned-short SCALAR index accessor. */
  addIndices(values: readonly number[]): number {
    const data = Buffer.alloc(pad4(values.length * 2));
    values.forEach((v, i) => data.writeUInt16LE(v, i * 2));
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
    const data = Buffer.alloc(pad4(values.length));
    values.forEach((v, i) => data.writeUInt8(v, i));
    this.accessors.push({
      componentType: COMP_BYTE,
      type: "VEC4",
      count: values.length / 4,
      data,
      target: 34962,
    });
    return this.accessors.length - 1;
  }

  /** Add a raw (non-accessor) bufferView, e.g. an embedded image. Returns its index offset marker. */
  addRawView(data: Buffer, label: string): number {
    this.extraViews.push({ data, label });
    return this.accessors.length + this.extraViews.length - 1;
  }

  /**
   * Serialise. `buildJson` receives the accessor index → glTF accessor index
   * map (identity here) and the raw-view indices, and returns the rest of the
   * glTF document.
   */
  build(doc: Record<string, unknown>): Buffer {
    const parts: Buffer[] = [];
    let offset = 0;
    const views: Record<string, unknown>[] = [];
    const push = (data: Buffer, target?: number): number => {
      const start = offset;
      parts.push(data);
      offset += data.length;
      const padded = pad4(offset);
      if (padded > offset) {
        parts.push(Buffer.alloc(padded - offset, 0));
        offset = padded;
      }
      views.push(target === undefined
        ? { buffer: 0, byteOffset: start, byteLength: data.length }
        : { buffer: 0, byteOffset: start, byteLength: data.length, target });
      return views.length - 1;
    };

    const accessorJson = this.accessors.map((a) => {
      const view = push(a.data, a.target);
      const j: Record<string, unknown> = {
        bufferView: view,
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

    const bin = Buffer.concat(parts);
    const jsonStr = Buffer.from(JSON.stringify(json), "utf8");
    const jsonChunk = Buffer.concat([
      jsonStr,
      Buffer.alloc(pad4(jsonStr.length) - jsonStr.length, 0x20),
    ]);
    const binChunk = Buffer.concat([bin, Buffer.alloc(pad4(bin.length) - bin.length, 0)]);
    const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;

    const head = Buffer.alloc(12);
    head.writeUInt32LE(GLB_MAGIC, 0);
    head.writeUInt32LE(2, 4);
    head.writeUInt32LE(total, 8);
    const jh = Buffer.alloc(8);
    jh.writeUInt32LE(jsonChunk.length, 0);
    jh.writeUInt32LE(CHUNK_JSON, 4);
    const bh = Buffer.alloc(8);
    bh.writeUInt32LE(binChunk.length, 0);
    bh.writeUInt32LE(CHUNK_BIN, 4);
    void rawViewIndex;
    return Buffer.concat([head, jh, jsonChunk, bh, binChunk]);
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
