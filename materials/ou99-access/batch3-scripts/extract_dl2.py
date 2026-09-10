#!/usr/bin/env python3
"""解壓 dl2 的 22 個 ou99 ZIP。⚠️ 檔名多半是 GBK ⇒ cp437 -> gbk 轉回來。"""
import os, sys, zipfile, json

SRC = os.path.expanduser("~/GGD-assets/models/dl2")
DST = os.path.join(SRC, "extracted")


def fix(name: str) -> str:
    # zipfile 沒有 UTF-8 旗標時把 bytes 當 cp437 解 ⇒ 轉回 gbk
    try:
        return name.encode("cp437").decode("gbk")
    except Exception:
        pass
    try:
        return name.encode("cp437").decode("utf-8")
    except Exception:
        return name


report = []
for zp in sorted(f for f in os.listdir(SRC) if f.lower().endswith(".zip")):
    tid = zp[:-4]
    out = os.path.join(DST, tid)
    os.makedirs(out, exist_ok=True)
    entry = {"tid": tid, "files": [], "mdx": [], "blp": [], "err": None}
    try:
        with zipfile.ZipFile(os.path.join(SRC, zp)) as z:
            for info in z.infolist():
                raw = info.filename
                nm = raw if (info.flag_bits & 0x800) else fix(raw)
                nm = nm.replace("\\", "/")
                if nm.endswith("/"):
                    continue
                # 攤平路徑但保留子目錄結構（轉換器會遞迴找 BLP）
                parts = [p for p in nm.split("/") if p not in ("", ".", "..")]
                target = os.path.join(out, *parts)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with z.open(info) as fsrc, open(target, "wb") as fdst:
                    fdst.write(fsrc.read())
                entry["files"].append(nm)
                low = nm.lower()
                if low.endswith(".mdx"):
                    entry["mdx"].append(nm)
                elif low.endswith(".blp"):
                    entry["blp"].append(nm)
    except Exception as e:  # noqa
        entry["err"] = f"{type(e).__name__}: {e}"
    report.append(entry)

print(json.dumps(report, ensure_ascii=False, indent=1))
