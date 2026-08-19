/**
 * GH#457 —— 產圖器的 LoRA 與 SDXL，三條薄守衛（工具層，⛔ 不開對抗輪）。
 *
 * ⛔ 不掃原始碼字串（失敗形態⑥），也⛔ 不依賴 `tools/icon-gen/models/` 那幾個
 * gitignore 的多 GB 權重檔 —— 那種測試在別人機器上必紅，而會誤紅的守衛很快就被
 * 關掉。做法是**現場合成 safetensors 檔頭**（8 bytes 長度 + 一段 JSON），因為
 * 架構判定本來就只讀那一段：SD1.5 的 cross-attention dim 是 768，SDXL 是 2048。
 *
 * 三個「壞了畫面看不出來」的點：①SDXL 被當成 SD1.5 在 512 出圖（糊但不報錯）
 * ②「我明明掛了 LoRA」而畫風一樣 ③owner 2026-08-19：圖示⛔不應該直接畫出角色，
 * 而英雄頭像是明著的例外。
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..", "..");

const PY = `
import json, os, struct, sys, tempfile
sys.path[:0] = [os.path.join(${JSON.stringify(REPO)}, "tools/icon-gen/local"),
                os.path.join(${JSON.stringify(REPO)}, "tools/icon-gen/src")]
import keywords, pipeline
REPO, tmp, out = ${JSON.stringify(REPO)}, tempfile.mkdtemp(), {}

def fake(name, ctx, lora):
    key = ("lora_unet_blocks_0_attn2_to_k.lora_down.weight" if lora else
           "model.diffusion_model.input_blocks.4.1.transformer_blocks.0.attn2.to_k.weight")
    blob = json.dumps({key: {"dtype": "F16", "shape": [16, ctx],
                             "data_offsets": [0, 0]}}).encode()
    path = os.path.join(tmp, name)
    open(path, "wb").write(struct.pack("<Q", len(blob)) + blob)
    return path

# ① 檔名故意跟內容相反 —— 靠檔名猜的實作在這裡就會翻車
out["by_file"] = [pipeline.detect_arch(fake("looks_like_xl.safetensors", 768, False)),
                  pipeline.detect_arch(fake("v1.0-sd15.safetensors", 2048, False))]
out["lora_dim"] = pipeline.context_dim_of_file(fake("l.safetensors", 768, True))

# ② config -> pipeline 的接線（相對路徑要解到 tools/icon-gen/models/）
doc = json.load(open(os.path.join(REPO, "content/config/icon-style.json"), encoding="utf-8"))
doc["loras"] = [{"path": "civitai/x.safetensors", "weight": 0.7}]
keywords.ICON_STYLE_PATH = os.path.join(tmp, "icon-style.json")
json.dump(doc, open(keywords.ICON_STYLE_PATH, "w", encoding="utf-8"), ensure_ascii=False)
keywords._icon_style_cache = None
out["specs"] = [[os.path.relpath(p, os.path.join(REPO, "tools/icon-gen/models")), w]
                for p, w in pipeline._lora_specs()]

# ③ 構圖跟著家族走
d = {"id": "x", "name": "炎殺", "description": "造成傷害"}
out["comp"] = {f: list(keywords.pass1_prompt(f, d)[:2])
               for f in ("champions", "abilities", "items")}
print(json.dumps(out))
`;

describe("GH#457 產圖器：LoRA 接線 + SDXL 架構判定", () => {
  const out = JSON.parse(
    execFileSync("python3", ["-c", PY], { encoding: "utf8", cwd: REPO }).trim(),
  ) as { by_file: string[]; lora_dim: number; specs: [string, number][];
         comp: Record<string, [string, string]> };

  it("① 架構讀的是**檔案**，⛔ 不是檔名", () => {
    // 檔名寫 xl 的內容是 768，檔名寫 sd15 的內容是 2048 —— 兩格都要跟著內容走。
    expect(out.by_file).toEqual(["sd15", "sdxl"]);
    // LoRA 也讀得出來（`lora_up` 那一半的第二軸是 rank，混進去就會得到 16）。
    expect(out.lora_dim).toBe(768);
  });

  it("② `loras` 從 content/config 走到 pipeline，相對路徑解到 models/", () => {
    expect(out.specs).toEqual([["civitai/x.safetensors", 0.7]]);
  });

  it("③ 只有英雄畫角色，其餘家族明著擋掉", () => {
    expect(out.comp.champions![1]).not.toContain("full character");
    for (const fam of ["abilities", "items"]) {
      expect(out.comp[fam]![0]).toContain("WITHOUT a character");
      expect(out.comp[fam]![1]).toContain("full character");
    }
  });
});
