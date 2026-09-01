import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");

function pythonWithImaging(): string[] | null {
  for (const candidate of [
    ["python3"],
    ["arch", "-arm64", "python3"],
    ["/opt/homebrew/bin/python3"],
    ["/usr/bin/python3"],
  ]) {
    try {
      execFileSync(candidate[0]!, [...candidate.slice(1), "-c", "from PIL import Image"], { stdio: "pipe" });
      return candidate;
    } catch {
      // Try the next host Python; the scalar safety path does not require numpy.
    }
  }
  return null;
}

const PYTHON = pythonWithImaging();

describe.skipIf(PYTHON === null)("shipped VFX carrier texture safety", () => {
  it("rejects no shipped particle sprite under its actual blend equation", () => {
    const output = execFileSync(
      PYTHON![0]!,
      [...PYTHON!.slice(1), join(ROOT, "tools", "vfx-asset-safety", "check.py"), "--scope", "vfx"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: 120_000 },
    );
    expect(output).toContain("PASS (0 blocker(s))");
  }, 125_000);

  it("has no silently repairable backdrop left after the committed repair", () => {
    const output = execFileSync(
      PYTHON![0]!,
      [...PYTHON!.slice(1), join(ROOT, "tools", "vfx-asset-safety", "repair.py")],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: 120_000 },
    );
    expect(output).toContain("nothing to do");
  }, 125_000);

  it("has no opaque GLB carrier image left for the image-only migration", () => {
    const output = execFileSync(
      PYTHON![0]!,
      [...PYTHON!.slice(1), join(ROOT, "tools", "vfx-asset-safety", "repair_models.py"), "--check"],
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: 120_000 },
    );
    expect(output).toContain("checked: 0");
  }, 125_000);

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
      { cwd: ROOT, encoding: "utf8", stdio: "pipe", timeout: 30_000 },
    );
    expect(output).toContain("PASS");
  }, 35_000);
});
