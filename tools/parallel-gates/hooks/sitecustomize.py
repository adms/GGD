"""⭐ **推導**用的 python I/O 探針 —— ⛔ 不是手寫的相依表。

`trace.mjs` 把這個資料夾放進 `PYTHONPATH`,於是**每一個** python 直譯器(含子行程、
含 `message-ledger.sh` 那種 `exec python3 - <<PY` 的 heredoc)開檔時都會留下一行。

⚠️ 只記**讀**取用得到的那一半就夠了 —— 寫入端由 `trace.mjs` 的 mtime 差分量,
   那條路徑對子行程與任何語言都成立(⛔ 探針做不到)。
"""
import os
import sys

_log = os.environ.get("GGD_TRACE_LOG")
_root = os.environ.get("GGD_TRACE_ROOT")

if _log and _root:
    _root = os.path.abspath(_root).rstrip("/") + "/"
    _fh = open(_log, "a", buffering=1)          # ⚠️ 要在裝 hook **之前**開,不然會遞迴

    def _rec(kind, path):
        try:
            if isinstance(path, int):
                return
            if isinstance(path, bytes):
                path = path.decode("utf-8", "replace")
            if not isinstance(path, str):
                path = str(path)
            p = os.path.abspath(path)
            if p.startswith(_root):
                _fh.write("%s\t%s\n" % (kind, p[len(_root):]))
        except Exception:
            pass

    _WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_TRUNC

    def _hook(event, args):
        try:
            if event == "open":
                path, mode, flags = args
                if isinstance(mode, str):
                    w = any(c in mode for c in "wax+")
                else:
                    w = bool((flags or 0) & _WRITE_FLAGS)
                _rec("W" if w else "R", path)
            elif event in ("os.rename", "os.replace", "shutil.move", "shutil.copyfile"):
                _rec("R", args[0])
                _rec("W", args[1])
            elif event in ("os.remove", "os.unlink", "os.truncate"):
                _rec("W", args[0])
            elif event == "os.listdir" or event == "os.scandir":
                _rec("R", args[0] if args else ".")
        except Exception:
            pass

    sys.addaudithook(_hook)
