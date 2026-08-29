/**
 * teamGlowCullPolicy.test.ts —— ⭐ GH#770 隊伍發光 rid-2 旋鈕的**承重守衛**。
 *
 * 第一版只驗了**出貨的那個值**（`cull`），於是旋鈕的第三個值 `"lit"` 帶著一句
 * 「翻成 lit 就是把原作的隊色光暈畫出來，⛔ 不必改一行程式」出貨了 ——
 * ⭐ **而那句話是假的**（`lit` 從旋鈕進來會靜默退化成 `keep`，＝ #770 的病灶本身）。
 * ⇒ 一個做不到自己宣稱的旋鈕值**比沒有更糟**：它讓人以為有一條退路（第一·五守則）。
 * ⇒ ⭐ 所以這支**逐值**跑，⛔ 不是只跑出貨的那個。
 *
 * ① 每個被接受的值都要做到 `gltf.CHARACTER_TEAM_GLOW_CLAIMS` 裡它自己宣稱的事，
 *   而宣稱詞彙**封閉** ⇒ 加一個值就非得寫下一個**驗得了**的宣稱。
 *   ⭐ 兩個方向一起量：`emit-invisible` 量得到那個 alpha-0 的面 · `no-prim` 量不到
 *   而且 accessor 一起少掉 —— ⛔ 只驗後者的話「模型根本沒發出來」長得一模一樣。
 * ② ⭐ **兩兩相異** —— 抓的正是 `lit` 那種「加了一個什麼都不做的值」。
 * ③ ⭐ 被排除的值**理由要能被反駁**：它今天確實與某個被接受的值產出相同。
 * ④ 出貨值合法，而且角色那條路**真的解析得到它**（接縫）。
 *
 * 兩個量測空間：`synthetic`（合成模型直接餵 `gltf.convert(…, team_glow="drop")`，
 * `textures_png` **空的**）永遠跑得動；`shipping`（真的 `HeroCloudStrife.mdx` 走
 * `models.convert_all(raw, glb, tex)` —— ⭐ 與 `import_w3x.py:108` 逐字同一個呼叫）
 * 把 `models.py` 那一半也納進來。
 *
 * ### ⚠️ 誠實的界線（⛔ 不要刪這一段）
 * `shipping` 要 PIL；這台 vitest 生出來的 `python3` 是 x86_64 而 PIL 的 `.so` 是
 * arm64 ⇒ 載不動 ⇒ 該空間跳過，而 ⑤ 的**名字裡就寫著「沒驗到」**（⛔ 不是靜靜地綠；
 * ⛔ 也不做成永遠紅的閘 —— 那是形態⑨）。⇒ ⭐ **③ 的「可反駁」只在 `shipping` 成立**：
 * `synthetic` 的 `textures_png` 恆空，`lit ≡ keep` 在那裡是結構上必然的。
 * ⚠️ 上游狀態一律取**出貨的那一份**：第一版夾具預先塞了 rid-2 的 PNG ——
 * 那正是「被測的不是出貨的那個」（形態⑤），而它讓 `lit` 看起來是活的。
 *
 * ⛔ 紅了**不要改測試**：跑 `python3 tools/w3x-import/invisible_prim_census.py`
 * 讀它的 PENDING RE-BAKE，再決定是改旋鈕還是重跑轉檔產線。
 * ⚠️ 出貨的 44 個面**還在**（旋鈕是 build 時的，這一票沒有重跑產線）。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TOOLS = join(ROOT, "tools/w3x-import");
/** 25 份帶 `TeamGlow*` 面的**出貨**模型之一（tracked，⛔ 不是我造的夾具）。 */
const SHIP_FIXTURE = "HeroCloudStrife.mdx";

const PROBE = `
import contextlib, io, json, os, shutil, struct, sys, tempfile
sys.path.insert(0, ${JSON.stringify(TOOLS)})
from w3xlib import gltf
from w3xlib.mdx import Geoset, Layer, Material, MDXModel, Texture

# ⭐ 先問**真的**政策檔:出貨那條路(team_glow="drop")解析出來的是什麼。
# ⛔ 一定要在下面把 TEAM_GLOW_POLICY_PATH 改掉**之前**問。
SHIPPING = gltf.resolve_team_glow("drop")

def knob(value):
    pol = os.path.join(tempfile.mkdtemp(), "invisible_prim_policy.json")
    with open(pol, "w") as fh:
        json.dump({"schema": "invisible-prim-policy@1", "characterTeamGlow": value}, fh)
    gltf.TEAM_GLOW_POLICY_PATH = pol

def shape(glb, height):
    jlen = struct.unpack_from("<I", glb, 12)[0]
    doc = json.loads(glb[20:20 + jlen].decode("utf-8"))
    glow = [doc["materials"][p["material"]]
            for mesh in doc.get("meshes", []) for p in mesh["primitives"]
            if (doc["materials"][p["material"]].get("name") or "").startswith("TeamGlow")]
    return {"prims": len(glow),
            "alpha": [m.get("pbrMetallicRoughness", {}).get("baseColorFactor", [1, 1, 1, 1])[3]
                      for m in glow],
            "emissive": ["emissiveTexture" in m for m in glow],
            "accessors": len(doc.get("accessors", [])), "height": round(height, 3)}

def quad(mid, z0, w, h):
    v = [(-w, 0.0, z0), (w, 0.0, z0), (w, 0.0, z0 + h), (-w, 0.0, z0 + h)]
    return Geoset(vertices=v, normals=[(0.0, 0.0, 1.0)] * 4,
                  uvs=[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)],
                  faces=[0, 1, 2, 0, 2, 3], vertex_groups=[0] * 4,
                  matrix_groups=[[]], material_id=mid)

def synthetic(value, via_knob=True):
    """出貨那條路的**引數**:team_glow="drop",而 textures_png **空的**
    (models.py 在 "drop" 下不會去載 TeamGlow00.blp)。"""
    knob(value if via_knob else SHIPPING)
    m = MDXModel(name="tg-probe")
    m.textures = [Texture(1, ""), Texture(2, "")]   # rid1 = 隊伍色身體, rid2 = 隊伍發光
    m.materials = [Material(layers=[Layer(filter_mode=0, shading_flags=0, texture_id=0, alpha=1.0)]),
                   Material(layers=[Layer(filter_mode=3, shading_flags=0, texture_id=1, alpha=1.0)])]
    # ⭐ 隊伍發光刻意做成**身體輪廓內**的一小片:出貨那 44 個正是這一種。做成幾何
    # 離群值的話,既有的 tower/beam/wide 規則會先剔掉它,量到的就不是這一票。
    m.geosets = [quad(0, 0.0, 0.4, 1.7), quad(1, 0.6, 0.3, 0.4)]
    res = gltf.convert(m, {}, 1.0, "tg-probe.mdx", {},
                       team_glow="drop" if via_knob else value)
    return shape(res.glb, res.height)

RAW = os.path.join(${JSON.stringify(TOOLS)}, "out/GoDieEX22s/raw")
FIXTURE = ${JSON.stringify(SHIP_FIXTURE)}

def shipping(value, via_knob=True):
    """⭐ 與 import_w3x.py:108 **逐字同一個呼叫**:convert_all(raw, glb, tex) ——
    ⛔ 沒有 team_glow ⇒ models.py 那一半也在量測範圍內。"""
    from w3xlib import models
    knob(value if via_knob else SHIPPING)
    extra = {} if via_knob else {"team_glow": value}
    tmp = tempfile.mkdtemp()
    raw = os.path.join(tmp, "raw"); os.makedirs(raw)
    shutil.copy(os.path.join(RAW, FIXTURE), raw)
    with contextlib.redirect_stdout(io.StringIO()):
        rep = models.convert_all(raw, os.path.join(tmp, "glb"),
                                 os.path.join(tmp, "tex"), sphere_table={}, **extra)
    e = rep[0]
    out = shape(open(os.path.join(tmp, "glb", e["glb"]), "rb").read(), e["height"])
    shutil.rmtree(tmp, ignore_errors=True)
    return out

# ⛔ 被排除的值也要跑 —— 排除的**理由**要能被反駁(③)。
# ⚠️ 它們走的是**呼叫端引數**那道門,⛔ 不是旋鈕(旋鈕現在會擋下它們,那是設計)。
# ⭐ 而那道門正是「有人把 models.py 接好之後,旋鈕會產出什麼」—— 所以拿它比對
#   就等於問「今天把這個值送到底,會不會比某個既有的值多做到什麼?」
def run(fn):
    return ({k: fn(k) for k in gltf.CHARACTER_TEAM_GLOW_VALUES}
            | {k: fn(k, False) for k in gltf.CHARACTER_TEAM_GLOW_EXCLUDED})

spaces = {"synthetic": run(synthetic)}
try:
    spaces["shipping"] = run(shipping)
except Exception as exc:                       # PIL 不在 ⇒ 明說沒驗到
    spaces["shipping"] = None
    print(f"shipping space unavailable: {exc}", file=sys.stderr)

json.dump({"claims": dict(gltf.CHARACTER_TEAM_GLOW_CLAIMS),
           "excluded": {k: str(v) for k, v in gltf.CHARACTER_TEAM_GLOW_EXCLUDED.items()},
           "callerArgs": list(gltf.TEAM_GLOW_POLICIES), "shipping": SHIPPING,
           "spaces": spaces}, sys.stdout)
`;

type Outcome = {
  prims: number;
  alpha: number[];
  emissive: boolean[];
  accessors: number;
  height: number;
};
type Space = Record<string, Outcome>;
type Probe = {
  claims: Record<string, string>;
  excluded: Record<string, string>;
  callerArgs: string[];
  shipping: string;
  spaces: { synthetic: Space; shipping: Space | null };
};

const probe = JSON.parse(
  execFileSync("python3", ["-c", PROBE], { cwd: ROOT, encoding: "utf8" }),
) as Probe;
const SPACES: [string, Space][] = Object.entries(probe.spaces).filter(
  (e): e is [string, Space] => e[1] !== null,
);
const sig = (s: Space, k: string) => JSON.stringify(s[k]);
/** ⭐ 一個**不存在的鍵是缺陷,⛔ 不是 undefined** —— 讓它當場說出是哪一個。 */
const at = (s: Space, k: string): Outcome => {
  const o = s[k];
  expect(o, `探針沒有量到旋鈕值 ${k} ⇒ 這把尺是瞎的,其餘結論一併作廢`).toBeDefined();
  return o as Outcome;
};

/** 封閉詞彙表 —— ⭐ 一個宣稱要嘛在這裡驗得了，⛔ 要嘛它不可以當宣稱。 */
const CHECK: Record<string, (o: Outcome, s: Space, claims: Probe["claims"]) => void> = {
  "emit-invisible": (o) => {
    expect(o.prims, "宣稱會發一個 TeamGlow 面,⛔ 而它沒發 ⇒ 這把尺是瞎的").toBeGreaterThan(0);
    expect(o.alpha.every((a) => a === 0), "#770 的病灶就是那一片 alpha 0").toBe(true);
    expect(o.emissive.some(Boolean), "⛔ 它不該是發光的 —— 那是 lit 的宣稱").toBe(false);
  },
  "no-prim": (o, s, claims) => {
    expect(o.prims, "宣稱一個都不發").toBe(0);
    for (const e of Object.keys(claims).filter((k) => claims[k] === "emit-invisible")) {
      const emitter = at(s, e);
      expect(o.accessors, "prim 沒了但 accessor 還在 ⇒ 只省了 draw call").toBeLessThan(
        emitter.accessors,
      );
      expect(o.height, "剔掉看不見的面⛔不可以動到身高正規化").toBe(emitter.height);
    }
  },
};

describe("GH#770 隊伍發光旋鈕:**每一個值**都要做得到它宣稱的事", () => {
  it.each(SPACES.flatMap(([n, s]) => Object.keys(probe.claims).map((v) => [n, v, s] as const)))(
    "① [%s] 值 %s 做得到自己宣稱的事(兩個方向)",
    (_name, value, space) => {
      const claim = probe.claims[value] ?? "";
      expect(Object.keys(CHECK), `宣稱 ${claim} 沒有人驗得了 ⇒ 補一條,⛔ 不要留一句散文`).toContain(
        claim,
      );
      CHECK[claim]!(at(space, value), space, probe.claims);
    },
  );

  it("② 任兩個值的結果都不一樣(⛔ 不可以有一個什麼都不做的值)", () => {
    for (const [name, space] of SPACES) {
      const seen = new Map<string, string>();
      for (const v of Object.keys(probe.claims)) {
        const dup = seen.get(sig(space, v));
        expect(dup, `[${name}] 旋鈕值 ${v} 與 ${dup} 產出完全相同 ⇒ 其中一個是空的`).toBeUndefined();
        seen.set(sig(space, v), v);
      }
    }
  });

  it("③ 被排除的值:理由今天仍然成立,⭐ 而它是可以被反駁的", () => {
    for (const [bad, why] of Object.entries(probe.excluded)) {
      expect(Object.keys(probe.claims), `${bad} 同時在接受與排除兩張表裡`).not.toContain(bad);
      expect(probe.callerArgs, `${bad} 連呼叫端引數都不是 ⇒ 這條排除是對誰說的?`).toContain(bad);
      expect(why.length, `${bad} 的排除沒有寫理由`).toBeGreaterThan(40);
      for (const [name, space] of SPACES) {
        expect(
          Object.keys(probe.claims).filter((k) => sig(space, k) === sig(space, bad)),
          `⭐ [${name}] 旋鈕值 ${bad} 現在產出與任何被接受的值都不同 ⇒ 它宣稱的事今天做得到了。` +
            `⛔ 不要改這條測試 —— 去 gltf.py 把 ${bad} 從 CHARACTER_TEAM_GLOW_EXCLUDED 搬回` +
            ` CHARACTER_TEAM_GLOW_CLAIMS 並寫下它的宣稱。原本的排除理由:${why}`,
        ).not.toHaveLength(0);
      }
    }
  });

  it("④ 出貨值合法,而且角色那條路真的解析得到它(⛔ 值本身不抄進斷言)", () => {
    const pol = JSON.parse(readFileSync(join(TOOLS, "invisible_prim_policy.json"), "utf8")) as {
      characterTeamGlow?: string;
    };
    expect(pol.characterTeamGlow, "policy 少了 characterTeamGlow 這一格").toBeDefined();
    expect(Object.keys(probe.claims)).toContain(pol.characterTeamGlow);
    // ⭐ 接縫:出貨那條路傳的是 "drop"(import_w3x.py 沒傳值),它必須解析到**這一格**。
    expect(probe.shipping, "convert() 沒有解析到旋鈕 —— 角色那條路吃不到它").toBe(
      pol.characterTeamGlow,
    );
  });

  // ⚠️ 真模型空間跑不動時**顯示成 SKIPPED 而且名字裡就寫著「沒驗到」**,
  // ⛔ 不是靜靜地綠,⛔ 也不是永遠紅(一條在正確的 checkout 上永遠紅的閘 = 形態⑨,
  // 它會被學會忽略)。
  it.skipIf(!probe.spaces.shipping)(
    probe.spaces.shipping
      ? `⑤ [shipping] 真模型 ${SHIP_FIXTURE} 逐值都跑過了(③ 的可反駁性靠這一格)`
      : `⑤ [shipping] ⚠️ **沒驗到** —— 這台的 python3 載不動 PIL(w3xlib.blp) ⇒ 真模型` +
        "空間整個沒跑,③ 這一輪只證到結構那一半(見檔頭「誠實的界線」)",
    () => {
      const ship = probe.spaces.shipping!;
      // 校準:這個空間量得到東西,而且它與合成空間**指向同一個結論**。
      expect(Object.keys(ship).sort()).toEqual(Object.keys(probe.spaces.synthetic).sort());
      for (const v of Object.keys(probe.claims)) expect(at(ship, v).height).toBeGreaterThan(0);
    },
  );
});
