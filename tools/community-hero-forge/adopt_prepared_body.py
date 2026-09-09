#!/usr/bin/env python3
"""採納一顆**已經備妥**的 GLB 成為素材庫的 body 候選（⛔ 不做任何轉換）。

⭐ 為什麼需要這一支（GH#1158）
================================
`finalize-library-body.mts` 吃一份 `ggd-library-model-preparation@1` 收據。
⛔ 而 repo 裡產生那份收據的兩支**都綁死了來源庫**：

    prepare_mba_body.py       →  row["library"] == "mba"
    prepare-native-batch.py   →  --library 300heroes

⇒ ⛔ 第三個來源庫（`lol`）沒有對應的那一支，而**再寫第三支綁死的**正是
   第〇·五守則的反面（「看到為某一支寫一個 if 就是越線」）。

⭐ 這一支的分工刻意很窄：它**不轉換**。
   來源已經是備妥的成品（已轉檔、已修剪、六格動作齊）——
   ⇒ 它只做三件事：**驗**、**複製到不可變的版本路徑**、**出收據**。
   ⚠️ 真正的處理仍然在 `finalize-library-body.mts`（修剪成六格、驗上傳契約）。

⛔ 它**不會**覆寫任何既有輸出（版本是不可變的，同 prepare_mba_body.py）。

用法
----
    python3 tools/community-hero-forge/adopt_prepared_body.py \
      --registry <query.py 的 JSON 輸出> --asset lol:yasuo \
      --glb <已備妥的.glb> --out <新的版本路徑.glb>
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

MAX_BYTES = 32 * 1024 * 1024  # 與 MODEL_UPLOAD_LIMITS.fileBytes 同一個數字
# ⭐ 六格執行期狀態 —— 與 `HERO_MODEL_STATES` 同一組（⛔ 少一格 finalize 會拒絕）。
STATES = ("idle", "run", "attack", "cast", "hurt", "death")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def glb_clip_names(data: bytes) -> list[str]:
    """讀 GLB 的 JSON chunk 取動畫名。⛔ 不解析 BIN（這一支不碰幾何）。"""
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("不是一個 GLB（magic 不對）")
    length, _kind = struct.unpack_from("<II", data, 12)
    doc = json.loads(data[20 : 20 + length].decode("utf-8"))
    return [a.get("name", "") for a in doc.get("animations", [])]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--registry", type=Path, required=True, help="query.py 的 JSON 輸出")
    ap.add_argument("--asset", required=True, help="例：lol:yasuo")
    ap.add_argument("--glb", type=Path, required=True, help="已備妥的 GLB")
    ap.add_argument("--out", type=Path, required=True, help="新的**不可變**版本路徑")
    args = ap.parse_args()

    rows = json.loads(args.registry.read_text())["results"]
    matching = [r for r in rows if r["id"] == args.asset]
    if len(matching) != 1:
        raise ValueError(f"⛔ `{args.asset}` 在登記表裡有 {len(matching)} 筆 —— 要正好一筆")
    row = matching[0]

    # ── ⭐ 六格動作對照:登記表宣告的每一支,GLB 裡都要**真的有** ──────────
    # ⛔ 這一條不可以省:finalize 會照這份對照去挑 clip,而挑不到時它拿到的是 -1
    #    ⇒ 一顆「六格齊」的收據配上一顆缺動作的模型,下游看起來完全正常。
    registry_map = dict(row.get("state_to_clip") or {})
    # ⭐⭐ **登記表的六格與執行期的六格不是同一組。**
    #
    #   登記表：idle · run · attack · cast · death · **celebrate**
    #   執行期：idle · run · attack · cast · death · **hurt**   （`CLIP_STATES`）
    #
    # ⭐ 而素材庫自己的 `limitations` 逐字寫著「**Hurt maps explicitly to idle**」
    # ⇒ ⛔ 那不是漏填,是一個**刻意的替代**。
    #
    # ⚠️⚠️ ⭐ 而它必須被**寫下來**,⛔ 不可以只讓兩格的值碰巧相等:
    #   GH#1148 量到 4 名本尊的收據就是那樣 —— `hurt` 與 `idle` 都是 `bat_idle`,
    #   ⭐ 那個替代關係**只能靠比對兩個字串推出來**。⛔ 哪天有人換掉待機動作,
    #   兩格就不再相等 ⇒ **替代關係當場消失,而沒有任何地方記得它曾經存在**。
    #   ⇒ owner 2026-09-08 第 3 道界線：「共用動作 ⛔ 不得宣稱成獨立原作動作」。
    clip_map = dict(registry_map)
    substitutions: dict[str, str] = {}
    if "hurt" not in clip_map:
        if "idle" not in clip_map:
            raise ValueError("⛔ 登記表既沒有 hurt 也沒有 idle —— 無法頂替")
        clip_map["hurt"] = clip_map["idle"]
        substitutions["hurt"] = "idle"
    missing_states = [s for s in STATES if s not in clip_map]
    if missing_states:
        raise ValueError(f"⛔ 登記表的 state_to_clip 缺 {missing_states} —— 六格要齊")
    if not args.glb.is_file():
        raise ValueError(f"⛔ 找不到 {args.glb}")
    raw = args.glb.read_bytes()
    if not 0 < len(raw) <= MAX_BYTES:
        raise ValueError(f"⛔ {len(raw)} bytes 超過 32 MiB 的離線準備上限")
    have = set(glb_clip_names(raw))
    absent = sorted({clip_map[s] for s in STATES} - have)
    if absent:
        raise ValueError(f"⛔ GLB 裡找不到這幾支動作：{absent}（它有 {sorted(have)}）")

    # ── ⭐ 版本不可變:⛔ 既有輸出與它旁邊的收據都不覆寫 ────────────────
    receipt_path = args.out.with_suffix(".receipt.json")
    if args.out.exists() or receipt_path.exists():
        raise ValueError("⛔ 輸出已存在 —— 版本是不可變的，換一個新路徑")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("xb") as stream:
        stream.write(raw)

    receipt = {
        "schema": "ggd-library-model-preparation@1",
        "asset": row["id"],
        # ⭐ 來源與輸出**逐位元組相同**（這一支不轉換）—— ⛔ 而兩邊都要記，
        #   因為 finalize 會逐一驗 sha 與大小沒有在準備之後被動過。
        "source": {
            "path": str(args.glb.resolve()),
            "sha256": digest(raw),
            "bytes": len(raw),
            "characterLinks": row.get("character_links") or row.get("aliases") or [],
        },
        "output": {"path": str(args.out.resolve()), "sha256": digest(raw), "bytes": len(raw)},
        "stateClips": {s: clip_map[s] for s in STATES},
        # ⭐⭐ **替代要被宣告,⛔ 不是靠兩個字串碰巧相等推出來**（GH#1148）。
        #   ⭐ 空的 dict 也有意義:它說「這一顆沒有任何頂替」。
        "stateClipSubstitutions": substitutions,
        # ⭐ 登記表原本給的那一份**原樣保留** —— ⛔ 免得「celebrate 去哪了」無從追。
        "registryStateClips": registry_map,
        "validation": "pending-shared-validator-and-visual-review",
        # ⭐ owner 2026-09-08 第 2／3 道界線：保留**替代模型的實際身分**，
        #   ⛔ 而「同名匹配只是候選」。⇒ 逐字帶著來源角色與作品。
        "sourceIdentity": {
            "character": row.get("name"),
            "work": row.get("origin"),
            "assetId": row["id"],
            "basis": (row.get("identity") or {}).get("basis"),
            # ⛔ 素材庫自己記的限制**原樣帶下去** —— 不可以在整合過程中靜靜消失。
            "limitations": row.get("limitations") or [],
            "remaining": row.get("remaining") or [],
        },
        "adoptedWithoutConversion": True,
    }
    with receipt_path.open("x") as stream:
        stream.write(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"out": str(args.out), "receipt": str(receipt_path), "sha256": receipt["output"]["sha256"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
