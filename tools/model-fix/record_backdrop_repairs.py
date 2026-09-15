#!/usr/bin/env python3
"""📝 把貼圖背板修補寫進來源紀錄 —— ⭐ 沿用 `normalize_transparent_component_materials.py` 的結構。

owner 2026-09-14：「請你驗收合併這張票 解決英雄殿跟遊戲回合中 model, 特效, 音效, 語音 等遺漏與不足之處」

⭐ 為什麼要寫紀錄，⛔ 不是只換檔：這兩顆的價值之一是**出處**（空渦龍＝`7bc2fa3f8` 的逐位元組歷史復原；
枯星龍候選＝減面產物，15 組三視角 A/B 就是對著那一份位元組跑的；神劍闖江湖三顆執行期交付＝18 態 WebGL 取樣對著那一份跑的）。
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
# ⭐ 執行期交付（`priority-runtime-options.json`）的修補前原件 —— 它們被 WebGL 取樣驗收過的是**這一份**位元組
RUNTIME_INDEX = REPO / "materials/hero-model-library/priority-runtime-options.json"
ARCHIVE_RUNTIME = "materials/hero-model-library/source-artifacts/pre-texture-backdrop-repair-v1"

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


# ⭐ 執行期交付：⛔ 在此之前 `apply-pr1152-model-fixes.mts` 只問「還有沒有 model 文件引用舊 GLB」就把它刪了，
#    ⛔ 沒問中央素材庫（`priority-runtime-options.json` 釘著它的 sha256 與文件 sha256）⇒ `current_resource_index.py` 讀不到檔。
#    ⇒ 原件逐位元組歸檔、目錄那一列改指修補後的位元組，並把「驗收跑在哪一份」寫明。
# gateBefore／gateAfter 是 2026-09-14 用 `tools/vfx-asset-safety/check.py` 對兩份位元組實跑的輸出（⛔ 不是抄的）。
RUNTIME_REPAIRS = {
    "runtime:infinity-strash-dai-pn010-02-native-v1": {
        "beforeSha256": "2aa1be9bad767cbc496c6dc147b708714c5e7e0781f9d9d0df02058d4cdb6d66",
        "afterSha256": "450c0a54c8d074ad3a68aa5b561f873ee1164755282d19e5a98902e7abbcdc59",
        "gitCommitOfBefore": "9c8783d0e",
        "changes": [
            "mat2:GGD_faceDecal1 key-carrier —— BLEND 平面臉部貼花的不透明底卡摳成透明：image 3 的 alpha 改了 88.95% 像素，RGB 0 像素",
        ],
        "gateBefore": "MODEL_TEXTURE_BACKDROP mat2:GGD_faceDecal1 BLEND planar carrier=80.04% edge=95.5%",
        "gateAfter": "MODEL_TEXTURE_BACKDROP 0 條",
        "visualNote": "⚠️ 18 態 Babylon WebGL 取樣是對修補前的位元組跑的；BLEND 貼花拿掉底卡是看得到的變化 —— 需要重跑取樣才能宣稱畫面驗收",
    },
    "runtime:infinity-strash-dai-pn010-05-daino-tsurugi-native-v1": {
        "beforeSha256": "1e1379ec54152a09339c2c5f92e79ee4320fb848ba3ea8da52d723efb1d2c55d",
        "afterSha256": "82b646921e3645038e7e8c8173638461fa14bfbd10086f8354554a4c0e29f151",
        "gitCommitOfBefore": "9c8783d0e",
        "changes": [
            "mat2:GGD_faceDecal1 key-carrier —— BLEND 平面臉部貼花的不透明底卡摳成透明：image 3 的 alpha 改了 88.95% 像素，RGB 0 像素",
        ],
        "gateBefore": "MODEL_TEXTURE_BACKDROP mat2:GGD_faceDecal1 BLEND planar carrier=80.04% edge=95.5%",
        "gateAfter": "MODEL_TEXTURE_BACKDROP 0 條",
        "visualNote": "⚠️ 18 態 Babylon WebGL 取樣是對修補前的位元組跑的；BLEND 貼花拿掉底卡是看得到的變化 —— 需要重跑取樣才能宣稱畫面驗收",
    },
    "runtime:infinity-strash-vearn-en801-pre-transformation-native-v1": {
        "beforeSha256": "c0f4ea5c363f2847d2eb9324cfb72a80c8f007a134fa4ac728d95d350ca69d02",
        "afterSha256": "a4f597cadea7977b21c95025b8407858cbb9a6a5fee9201376031002511bab49",
        "gitCommitOfBefore": "9c8783d0e",
        "changes": [
            "mat0:GGD_body flatten-alpha —— OPAQUE 材質上的藏色透明壓成 255：image 1 的 alpha 改了 22.47% 像素，RGB 0 像素",
        ],
        "gateBefore": "MODEL_TEXTURE_BACKDROP mat0:GGD_body transparent=2.16% alphaMode=OPAQUE",
        "gateAfter": "MODEL_TEXTURE_BACKDROP 0 條",
        "visualNote": "OPAQUE 材質渲染時不讀 alpha ⇒ 預期畫面不變；⚠️ 但 18 態取樣仍是對修補前的位元組跑的，⛔ 未重跑",
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


def before_bytes(archive_rel: str | None, commit: str, git_path: str, digest: str) -> bytes:
    """⭐ 先讀 git 內的逐位元組歸檔 —— ⛔ PR 的 commit 在 squash 合併之後就不在 main 上了，
    只靠 `git show <commit>:` 的話這支 `--check` 在 main 上**永遠不會綠**。歸檔還沒寫出來（第一次 --write）才回頭找 commit。"""
    if archive_rel and (REPO / archive_rel).is_file():
        data = (REPO / archive_rel).read_bytes()
    else:
        data = git_blob(commit, git_path)
    assert sha(data) == digest, f"原件雜湊不符：{git_path}"
    return data


def build(index: dict, runtime: dict):
    updated = copy.deepcopy(index); rows = []; writes = []; found = set()
    for sec in ("publicSources", "paidSources"):
        for source in updated.get(sec, []):
            for c in source.get("componentCandidates", []):
                r = REPAIRS.get(c.get("id"))
                if not r: continue
                found.add(c["id"])
                before_git = f"content/assets/models/community/{r['beforeSha256']}.glb"
                archive_rel = f"{ARCHIVE_7BC}/{r['beforeSha256']}.glb" if c.get("recoveredFromGitCommit") == "7bc2fa3f8" else None
                before = before_bytes(archive_rel, r["gitCommitOfBefore"], before_git, r["beforeSha256"])
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

    # ── 執行期交付 ────────────────────────────────────────────────────────
    updated_runtime = copy.deepcopy(runtime); runtime_found = set()
    for row in updated_runtime["models"]:
        r = RUNTIME_REPAIRS.get(row.get("id"))
        if not r: continue
        runtime_found.add(row["id"])
        prior = row.get("sourceDelivery") or {}
        old_glb = prior.get("glbPath") or row["glbPath"]
        src_doc_sha = prior.get("documentSha256") or row["documentSha256"]
        doc_raw = (REPO / "content/models" / f"{row['modelKey']}.json").read_bytes()
        doc_text = doc_raw.decode("utf-8")
        new_glb = json.loads(doc_text)["glbPath"]
        assert new_glb == f"assets/models/community/{r['afterSha256']}.glb", (row["id"], new_glb)
        # ⭐ 文件只改了 glbPath 的**位元組層**證明：把那一格換回舊路徑，雜湊要等於驗收時釘住的文件雜湊
        assert doc_text.count(json.dumps(new_glb)) == 1, row["id"]
        rebuilt = doc_text.replace(json.dumps(new_glb), json.dumps(old_glb), 1).encode("utf-8")
        assert sha(rebuilt) == src_doc_sha, f"⛔ {row['id']} 的模型文件除了 glbPath 還改了別的"
        archive_rel = f"{ARCHIVE_RUNTIME}/{r['beforeSha256']}.glb"
        before = before_bytes(archive_rel, r["gitCommitOfBefore"], "content/" + old_glb, r["beforeSha256"])
        after = (REPO / "content" / new_glb).read_bytes()
        assert sha(after) == r["afterSha256"], row["id"]
        proof = non_image_data_identical(before, after)
        src = copy.deepcopy(prior) or {
            "sha256": r["beforeSha256"], "bytes": len(before), "glbPath": old_glb,
            "gitPathAtIngest": "content/" + old_glb, "gitCommitAtIngest": r["gitCommitOfBefore"],
            "documentSha256": src_doc_sha, "validation": row.get("validation"),
        }
        src["gitArchivePath"] = archive_rel
        writes.append((REPO / archive_rel, before))
        row.update({"glbPath": new_glb, "gitPath": "content/" + new_glb, "sha256": r["afterSha256"], "bytes": len(after),
                    "documentSha256": sha(doc_raw), "sourceDelivery": src,
                    "validationSubjectSha256": r["beforeSha256"], "postRepairVisualReviewPending": True,
                    "materialNormalization": {
                        "schema": "ggd-model-texture-backdrop-repair@1", "revision": 1,
                        "changes": r["changes"], "binaryChunkByteIdentical": False,
                        "modelDocumentChange": "glbPath-only-byte-reconstruction-verified", **proof}})
        rows.append({"candidateId": row["id"], "catalog": RUNTIME_INDEX.relative_to(REPO).as_posix(),
                     "schema": "ggd-model-texture-backdrop-repair@1",
                     "source": {"sha256": r["beforeSha256"], "bytes": len(before), "gitCommit": r["gitCommitOfBefore"],
                                "gitPath": "content/" + old_glb, "gitArchivePath": archive_rel, "documentSha256": src_doc_sha},
                     "output": {"sha256": r["afterSha256"], "bytes": len(after), "gitPath": "content/" + new_glb,
                                "documentSha256": sha(doc_raw)},
                     "changes": r["changes"], "gateBefore": r["gateBefore"], "gateAfter": r["gateAfter"],
                     "binaryChunkByteIdentical": False, "modelDocumentChange": "glbPath-only-byte-reconstruction-verified",
                     **proof, "visualNote": r["visualNote"]})
    assert runtime_found == set(RUNTIME_REPAIRS), (runtime_found, set(RUNTIME_REPAIRS))
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
    for row in updated_runtime["models"]:
        if row.get("id") in RUNTIME_REPAIRS: row["normalizationEvidence"] = pin
    return updated, updated_runtime, eb, writes


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    m = ap.add_mutually_exclusive_group(required=True)
    m.add_argument("--check", action="store_true"); m.add_argument("--write", action="store_true")
    a = ap.parse_args()
    current = json.loads(INDEX.read_text(encoding="utf-8"))
    runtime = json.loads(RUNTIME_INDEX.read_text(encoding="utf-8"))
    updated, updated_runtime, eb, writes = build(current, runtime)
    if a.check:
        assert current == updated, "download-sources.json 還沒記下貼圖背板修補"
        assert runtime == updated_runtime, "priority-runtime-options.json 還沒記下貼圖背板修補"
        assert EVIDENCE.read_bytes() == eb, "修補證據過期"
        for p, data in writes: assert p.read_bytes() == data, f"歷史原件缺或不一致：{p}"
    else:
        for p, data in writes:
            p.parent.mkdir(parents=True, exist_ok=True)
            if p.exists(): assert p.read_bytes() == data, f"⛔ 不覆蓋已存在且不同的原件：{p}"
            else: p.write_bytes(data)
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True); EVIDENCE.write_bytes(eb)
        INDEX.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        RUNTIME_INDEX.write_text(json.dumps(updated_runtime, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(REPAIRS) + len(RUNTIME_REPAIRS), "written": a.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
