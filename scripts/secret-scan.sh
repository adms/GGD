#!/usr/bin/env bash
# secret-scan —— 掃這個 public repo 有沒有金鑰／登入憑證／不該公開的資料。
#
#   bash scripts/secret-scan.sh                 # 追蹤中的檔案（預設,幾秒）
#   bash scripts/secret-scan.sh --staged        # pre-commit：只看 staged
#   bash scripts/secret-scan.sh --history       # 所有 blob,含已刪除的（分鐘級）
#   bash scripts/secret-scan.sh --calibrate     # 只跑校準：這把尺量得準嗎
#
# 離開碼： 0=乾淨  1=有發現  3=⭐ 校準失敗（尺瞎了,結論作廢）
set -euo pipefail
exec python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/tools/secret-scan/scan.py" "$@"
