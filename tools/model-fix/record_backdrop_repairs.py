#!/usr/bin/env python3
"""📝 把貼圖背板修補寫進來源紀錄 —— ⭐ 沿用 `normalize_transparent_component_materials.py` 的結構。

owner 2026-09-14：「請你驗收合併這張票 解決英雄殿跟遊戲回合中 model, 特效, 音效, 語音 等遺漏與不足之處」

⭐ 為什麼要寫紀錄，⛔ 不是只換檔：這兩顆的價值之一是**出處**（空渦龍＝`7bc2fa3f8` 的逐位元組歷史復原；
枯星龍候選＝減面產物，15 組三視角 A/B 就是對著那一份位元組跑的）。
⇒ 原件**釘住**（位元組數＋sha256＋在哪裡找得回來），出貨的是新的內容定址 GLB，
改了什麼逐條寫進 `materialNormalization`（⚠️ 這一次 `binaryChunkByteIdentical: false` —— 動到的是像素，⛔ 不假裝沒動）。

    python3 tools/model-fix/record_backdrop_repairs.py --write
    python3 tools/model-fix/record_backdrop_repairs.py --check
"""
from __future__ import annotations
import argparse, copy, hashlib, json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
INDEX = REPO / "materials/hero-model-library/download-sources.json"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/model-texture-backdrop-repair-v1.json"
ARCHIVE_7BC = "materials/hero-model-library/source-artifacts/historical-model-recovery-7bc2fa3f8"

# ⭐ 每一筆都指得到：修補前的位元組從哪一個 commit 撈得回來、修補後住哪、改了什麼、為什麼是這個修法
REPAIRS = {
    "historical-jetragon-7bc2fa3f8": {
        "beforeSha256": "0d9eed3ab4e8246e20a12e2f0ee03786931aeacfe4976e2c1a07c3bbf9106fa6",
        "afterSha256": "0d533af89dee1680ed68dc321b209b6c3e70871027c6ada53656d625cbff522d",
        "gitCommitOfBefore": "9c8783d0e",
        "changes": [
            "mat2:MI_JetDragon_Extra key-carrier —— BLEND 平面卡的紅色不透明底（94.58%／邊緣 98.0%）摳成透明，保留 8 個粉紅菱形",
            "mat2:MI_JetDragon_Extra zero-hidden-rgb —— 材質帶 emissive，摳掉的底色 RGB 歸零，⛔ 否則自發光把它照回來（量到 94.60%）",
        ],
        "gateBefore": "MODEL_TEXTURE_BACKDROP BLEND planar carrier=94.58% edge=98.0%",
        "gateAfter": "carrier=4.1%/1%・emissive 亮藏色 0.000%",
    },
    "historical-astralym-decimated-f77cf1ee": {
        "beforeSha256": "f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc70642a9f4efed36c2a7",
        "afterSha256": "7d8264d1cbef118a2851e133a7721c3de6243bbe759cc8e81a58e8280440364f",
        "gitCommitOfBefore": "9c8783d0e",
        "changes": [
            "mat1:MI_WorldTreeDragon_Extra zero-hidden-rgb —— alpha ≤ 5（檢查器的 ALPHA_BACKGROUND_MAX）的像素 RGB 歸零，2548 px",
            "mat2:MI_WorldTreeDragon_Eye zero-hidden-rgb —— 同上，3934 px",
        ],
        "gateBefore": "MODEL_TEXTURE_BACKDROP emissive bright-matte=1.41%／2.18%",
        "gateAfter": "emissive 亮藏色 0.000%／0.000%（MASK 材質 ⇒ 底色可見處一個像素都沒動，只清掉自發光照得到的藏色）",
        "visualNote": "⚠️ 15 組三視角 A/B 是對修補前的位元組跑的；這次只清 alpha≤5 的藏色，基底色可見像素不變，自發光的暈點會消失 —— 需要重跑 A/B 才能宣稱像素差不變",
    },
}


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _glb(data: bytes):
    import struct
    jl = struct.unpack("<I", data[12:16])[0]
    j = json.loads(data[20:20 + jl]); off = 20 + jl
    bl = struct.unpack("<I", data[off:off + 4])[0]
    return j, data[off + 8:off + 8 + bl]


def non_image_data_identical(before: bytes, after: bytes) -> dict:
    """⭐ 契約的證明（⛔ 不是一個自己填的布林）：
    ① 每一個**不是貼圖**的 bufferView（幾何・骨架・動作・索引）逐位元組相同
    ② glTF JSON 除了 `images[].mimeType` 與 bufferView/buffer 的**位移與長度**之外語意相同
    ⇒ 修補只可能動到貼圖像素。"""
    jb, bb = _glb(before); ja, ba = _glb(after)
    image_views = {img["bufferView"] for img in jb.get("images", []) if "bufferView" in img}
    assert image_views == {img["bufferView"] for img in ja.get("images", []) if "bufferView" in img}, "貼圖 bufferView 集合不同"
    assert len(jb["bufferViews"]) == len(ja["bufferViews"]), "bufferView 數量不同"
    view = lambda j, b, i: b[j["bufferViews"][i].get("byteOffset", 0):j["bufferViews"][i].get("byteOffset", 0) + j["bufferViews"][i]["byteLength"]]
    changed_images = []
    for i in range(len(jb["bufferViews"])):
        same = view(jb, bb, i) == view(ja, ba, i)
        if i in image_views:
            if not same: changed_images.append(i)
        else:
            assert same, f"⛔ 非貼圖的 bufferView {i} 位元組變了 —— 修補越界"
    strip = lambda j: {k: v for k, v in j.items() if k not in ("bufferViews", "buffers", "images")}
    assert strip(jb) == strip(ja), "⛔ 貼圖以外的 glTF JSON 變了"
    lay = lambda j: [{k: v for k, v in bv.items() if k not in ("byteOffset", "byteLength")} for bv in j["bufferViews"]]
    assert lay(jb) == lay(ja), "⛔ bufferView 的非佈局欄位變了"
    img = lambda j: [{k: v for k, v in im.items() if k != "mimeType"} for im in j.get("images", [])]
    assert img(jb) == img(ja), "⛔ images 除了 mimeType 以外變了"
    return {"nonImageBufferViewsByteIdentical": True, "gltfJsonIdenticalExceptImageLayout": True,
            "changedImageBufferViews": changed_images}


def git_blob(commit: str, path: str) -> bytes:
    import subprocess
    return subprocess.run(["git", "show", f"{commit}:{path}"], cwd=REPO, capture_output=True, check=True).stdout


def build(index: dict):
    updated = copy.deepcopy(index); rows = []; writes = []; found = set()
    for sec in ("publicSources", "paidSources"):
        for source in updated.get(sec, []):
            for c in source.get("componentCandidates", []):
                r = REPAIRS.get(c.get("id"))
                if not r: continue
                found.add(c["id"])
                before_git = f"content/assets/models/community/{r['beforeSha256']}.glb"
                before = git_blob(r["gitCommitOfBefore"], before_git)
                assert sha(before) == r["beforeSha256"], c["id"]
                after_rel = f"content/assets/models/community/{r['afterSha256']}.glb"
                after = (REPO / after_rel).read_bytes()
                assert sha(after) == r["afterSha256"], c["id"]
                src = copy.deepcopy(c.get("sourceArtifact")) or {
                    "absolutePath": c.get("absolutePath"), "bytes": len(before), "sha256": r["beforeSha256"],
                    "gitPathAtIngest": before_git, "gitCommitAtIngest": r["gitCommitOfBefore"],
                    "s3Uri": c.get("s3Uri"), "s3ArchiveMember": c.get("s3ArchiveMember"),
                    "backupReceiptPath": c.get("backupReceiptPath"), "backupReceiptSha256": c.get("backupReceiptSha256"),
                }
                # ⭐ 歷史復原（7bc2fa3f8）⇒ 照 kita-kita／lord-nightmares 的前例，git 內另存一份逐位元組原件，
                #    因為 validate_historical_model_recovery.mts 讀的是 `sourceArtifact.gitArchivePath`
                if c.get("recoveredFromGitCommit") == "7bc2fa3f8":
                    src["gitArchivePath"] = f"{ARCHIVE_7BC}/{r['beforeSha256']}.glb"
                    writes.append((REPO / src["gitArchivePath"], before))
                proof = non_image_data_identical(before, after)
                c.update({"bytes": len(after), "sha256": r["afterSha256"], "gitPath": after_rel, "sourceArtifact": src,
                          "materialNormalization": {
                              "schema": "ggd-model-texture-backdrop-repair@1", "revision": 1,
                              "changes": r["changes"], "binaryChunkByteIdentical": False,
                              "nonMaterialJsonByteSemanticIdentical": False, **proof}})
                rows.append({"candidateId": c["id"], "schema": "ggd-model-texture-backdrop-repair@1",
                             "source": {"sha256": r["beforeSha256"], "bytes": len(before), "gitCommit": r["gitCommitOfBefore"], "gitPath": before_git,
                                        "gitArchivePath": src.get("gitArchivePath")},
                             "output": {"sha256": r["afterSha256"], "bytes": len(after), "gitPath": after_rel},
                             "changes": r["changes"], "gateBefore": r["gateBefore"], "gateAfter": r["gateAfter"],
                             "binaryChunkByteIdentical": False, **proof,
                             **({"visualNote": r["visualNote"]} if r.get("visualNote") else {})})
    assert found == set(REPAIRS), (found, set(REPAIRS))
    evidence = {"schema": "ggd-model-texture-backdrop-repair-batch@1",
                "tool": "tools/model-fix/fix_glb_textures.py",
                "gate": "tools/vfx-asset-safety/check.py MODEL_TEXTURE_BACKDROP",
                "records": sorted(rows, key=lambda x: x["candidateId"]),
                "sourceBytesPreserved": True, "deployed": False}
    eb = (json.dumps(evidence, ensure_ascii=False, indent=2) + "\n").encode()
    pin = {"gitPath": EVIDENCE.relative_to(REPO).as_posix(), "bytes": len(eb), "sha256": sha(eb)}
    for sec in ("publicSources", "paidSources"):
        for source in updated.get(sec, []):
            for c in source.get("componentCandidates", []):
                if c.get("id") in REPAIRS: c["normalizationEvidence"] = pin
    return updated, eb, writes


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    m = ap.add_mutually_exclusive_group(required=True)
    m.add_argument("--check", action="store_true"); m.add_argument("--write", action="store_true")
    a = ap.parse_args()
    current = json.loads(INDEX.read_text(encoding="utf-8"))
    updated, eb, writes = build(current)
    if a.check:
        assert current == updated, "download-sources.json 還沒記下貼圖背板修補"
        assert EVIDENCE.read_bytes() == eb, "修補證據過期"
        for p, data in writes: assert p.read_bytes() == data, f"歷史原件缺或不一致：{p}"
    else:
        for p, data in writes:
            p.parent.mkdir(parents=True, exist_ok=True)
            if p.exists(): assert p.read_bytes() == data, f"⛔ 不覆蓋已存在且不同的原件：{p}"
            else: p.write_bytes(data)
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True); EVIDENCE.write_bytes(eb)
        INDEX.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(REPAIRS), "written": a.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
