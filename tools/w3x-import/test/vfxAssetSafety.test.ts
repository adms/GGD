import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findPython } from "../../testkit/findPython";

/**
 * ⏱ GH#979 —— 這一支 `spawnSync` **自己的**逾時（⛔ 不是 vitest 的 `testTimeout`）。
 *
 * ⛔⛔ 2026-09-05 在 CI 上是 `spawnSync python3 **ETIMEDOUT**`：
 * 每一次呼叫都要用 Pillow 把**全部出貨的粒子貼圖**逐張解碼，
 * 而 GitHub runner 比開發機慢 3–5 倍 ⇒ 120 秒／30 秒都不夠。
 *
 * ⚠️ ⭐ 而 `ETIMEDOUT` 在 vitest 的輸出裡讀起來像「python 壞了」——
 * ⛔ 它不是；它是**這一行的數字太小**。
 * ⭐ 一個具名常數而不是 6 個字面值（第〇·四守則：下一次要調它是改一行）。
 */
const SPAWN_TIMEOUT_MS = 600_000;

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");

// GH#1013: shared sentinel-checked probe (tools/testkit/findPython); the scalar
// safety path does not require numpy, only Pillow.
const PYTHON = findPython({ imports: "from PIL import Image" });

describe.skipIf(PYTHON === null)("shipped VFX carrier texture safety", () => {
  it("rejects no shipped particle sprite under its actual blend equation", () => {
    const output = execFileSync(
      PYTHON![0]!,
      [...PYTHON!.slice(1), join(ROOT, "tools", "vfx-asset-safety", "check.py"), "--scope", "vfx"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: SPAWN_TIMEOUT_MS },
    );
    expect(output).toContain("PASS (0 blocker(s))");
  }, 125_000);

  it("has no silently repairable backdrop left after the committed repair", () => {
    const output = execFileSync(
      PYTHON![0]!,
      [...PYTHON!.slice(1), join(ROOT, "tools", "vfx-asset-safety", "repair.py")],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: SPAWN_TIMEOUT_MS },
    );
    expect(output).toContain("nothing to do");
  }, 125_000);

  it("has no opaque GLB carrier image left for the image-only migration", () => {
    const output = execFileSync(
      PYTHON![0]!,
      [...PYTHON!.slice(1), join(ROOT, "tools", "vfx-asset-safety", "repair_models.py"), "--check"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: SPAWN_TIMEOUT_MS },
    );
    expect(output).toContain("checked: 0");
  }, 125_000);

  it("has no recoverable WC3 material blend metadata left outside shipped GLBs", () => {
    const output = execFileSync(
      PYTHON![0]!,
      [...PYTHON!.slice(1), join(ROOT, "tools", "vfx-asset-safety", "repair_material_metadata.py"), "--check"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: SPAWN_TIMEOUT_MS },
    );
    expect(output).toContain("checked: 0");
  }, 125_000);

  it("repairs hidden emissive RGB without changing visible texels or alpha", () => {
    const repairer = join(ROOT, "tools", "vfx-asset-safety", "repair_models.py");
    const probe = [
      "import importlib.util,io,sys",
      "from PIL import Image",
      "p=sys.argv[1]",
      "s=importlib.util.spec_from_file_location('vfx_model_repair',p)",
      "m=importlib.util.module_from_spec(s);s.loader.exec_module(m)",
      "im=Image.new('RGBA',(2,1));im.putdata([(255,64,32,0),(9,8,7,255)])",
      "raw=io.BytesIO();im.save(raw,'PNG');png=raw.getvalue()",
      "doc={'images':[{'bufferView':0}],'bufferViews':[{'byteOffset':0,'byteLength':len(png)}],'textures':[{'source':0}],'materials':[{'name':'glow','alphaMode':'BLEND','emissiveFactor':[1,1,1],'pbrMetallicRoughness':{'baseColorTexture':{'index':0}}}]}",
      "replacements,notes=m.replacements_for(doc,png,effect_model=False)",
      "assert 0 in replacements and 'hidden RGB' in notes[0]",
      "out=Image.open(io.BytesIO(replacements[0])).convert('RGBA')",
      "assert list(out.getdata())==[(0,0,0,0),(9,8,7,255)]",
      "print('hidden-emissive-rgb-repair: PASS')",
    ].join(";");
    const output = execFileSync(
      PYTHON![0]!,
      [...PYTHON!.slice(1), "-c", probe, repairer],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: SPAWN_TIMEOUT_MS },
    );
    expect(output).toContain("PASS");
  }, 35_000);

  it("detects an opaque matte only on thin carrier geometry", () => {
    const checker = join(ROOT, "tools", "vfx-asset-safety", "check.py");
    const probe = [
      "import importlib.util,sys",
      "from PIL import Image",

      "p=sys.argv[1]",
      "s=importlib.util.spec_from_file_location('vfx_asset_safety',p)",
      "m=importlib.util.module_from_spec(s);s.loader.exec_module(m)",
      "im=Image.new('RGBA',(10,10),(0,0,0,255))",
      "assert m.opaque_carrier_shares(im)==(1.0,1.0)",
      "base={'meshes':[{'primitives':[{'material':0,'attributes':{'POSITION':0}}]}]}",
      "flat={**base,'accessors':[{'min':[-1,-1,0],'max':[1,1,0]}]}",
      "solid={**base,'accessors':[{'min':[-1,-1,-1],'max':[1,1,1]}]}",
      "assert m.material_is_planar_card(flat,0)",
      "assert not m.material_is_planar_card(solid,0)",
      "tiny={'meshes':[{'primitives':[{'material':0,'attributes':{'POSITION':0}},{'material':1,'attributes':{'POSITION':1}}]}],'accessors':[{'min':[-.01,0,-.01],'max':[.01,0,.01]},{'min':[-1,-1,-1],'max':[1,1,1]}]}",
      "assert not m.material_is_planar_card(tiny,0)",
      "blend={'alphaMode':'BLEND','emissiveFactor':[0,0,0]}",
      "assert m.material_is_planar_card(flat,0) and blend['alphaMode']=='BLEND'",
      "assert m.material_requires_backdrop_decode('BLEND',0,False,True)",
      "assert not m.material_requires_backdrop_decode('BLEND',0,False,False)",
      "assert all(a==255 for a in im.getchannel('A').getdata())",
      "print('opaque-planar-probe: PASS')",
    ].join(";");
    const output = execFileSync(
      PYTHON![0]!,
      [...PYTHON!.slice(1), "-c", probe, checker],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: SPAWN_TIMEOUT_MS },
    );
    expect(output).toContain("PASS");
  }, 35_000);
});
