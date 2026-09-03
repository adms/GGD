#!/usr/bin/env bash
# ou99-fetch.sh —— 從 ou99 抓已購買的模型附件
#
# ⭐ 用法（帶網址或帖號都可以）：
#     bash scripts/ou99-fetch.sh https://www.ou99.com/thread-496905-1-1.html
#     bash scripts/ou99-fetch.sh 496905
#     bash scripts/ou99-fetch.sh 496905 456924 481518        # 多支
#
# ⭐ Cookie 從哪來（⛔ 這一步機器做不到，要人去瀏覽器複製）：
#     在已登入 ou99 的分頁 console 打 `document.cookie`，整串存成
#       ~/.ou99-cookie          （或用環境變數 OU99_COOKIE）
#     ⚠️ 每次登入會換，過期就重存一次。
#
# ⭐ 為什麼是這個流程（2026-09-03 打通，⛔ 不要再重想）：
#     ① 附件端點 forum.php?mod=attachment&aid=… 會回 **302**
#     ② Location 指到 attach.ou99.com/forum/<yyyymm>/<dd>/<亂數>.zip
#     ③ ⭐ **那台不需認證** —— curl 直接抓得到（圖片也是這樣抓的）
#     ⛔ 不要試 fetch / XHR / navigate / <a download>：瀏覽器沙箱一律擋下載回應
#
# ⚠️ 兩個時限：
#     · 付費內容 **24 小時**後失效（買了要馬上抓）
#     · aid token 本身也是短時效的（腳本每次都重新取，⛔ 不要存 aid）
set -euo pipefail

OUT="${OU99_OUT:-$HOME/GGD-assets/models}"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

COOKIE="${OU99_COOKIE:-}"
if [ -z "$COOKIE" ] && [ -f "$HOME/.ou99-cookie" ]; then
  COOKIE="$(tr -d '\n' < "$HOME/.ou99-cookie")"
fi
if [ -z "$COOKIE" ]; then
  echo "⛔ 沒有 cookie。在已登入的 ou99 分頁 console 打 document.cookie，" >&2
  echo "   整串存成 ~/.ou99-cookie（或設 OU99_COOKIE）。" >&2
  exit 2
fi

[ $# -ge 1 ] || { echo "用法: $0 <帖號或網址> [更多…]" >&2; exit 2; }
mkdir -p "$OUT"

ok=0; fail=0
for arg in "$@"; do
  # 帖號：吃 thread-NNNNNN、tid=NNNNNN、或裸的 6 位數
  tid="$(printf '%s' "$arg" | grep -oE '(thread-|tid=)?[0-9]{6}' | grep -oE '[0-9]{6}' | head -1 || true)"
  [ -n "$tid" ] || { echo "⛔ 認不出帖號: $arg" >&2; fail=$((fail+1)); continue; }

  page="$(curl -sS --compressed -H "Cookie: $COOKIE" -H "User-Agent: $UA" \
          "https://www.ou99.com/forum.php?mod=viewthread&tid=${tid}" || true)"
  if [ -z "$page" ]; then echo "⛔ $tid 讀不到帖子頁" >&2; fail=$((fail+1)); continue; fi

  # ⚠️ 站是 GBK。只取「附件是壓縮檔」那一個 aid（⛔ 不是預覽圖那個）
  aid="$(printf '%s' "$page" \
        | tr '>' '\n' \
        | grep -iE 'mod=attachment' \
        | grep -oE 'aid=[A-Za-z0-9%=_-]+' \
        | sed 's/^aid=//' | tail -1 || true)"

  # 更穩：找「檔名含 .zip/.rar/.7z」的那個連結
  aid_zip="$(printf '%s' "$page" \
        | perl -0777 -ne 'while(/href="forum\.php\?mod=attachment&amp;aid=([^"]+)"[^>]*>([^<]*\.(?:zip|rar|7z))</gi){print "$1\n"}' \
        | head -1 || true)"
  [ -n "$aid_zip" ] && aid="$aid_zip"
  [ -n "$aid" ] || { echo "⛔ $tid 沒有附件連結（未購買？或只有預覽圖）" >&2; fail=$((fail+1)); continue; }
  aid="${aid//&amp;/&}"

  # ① 取 302 的 Location（⛔ 不 follow —— follow 會因為 Content-Disposition 而中斷）
  loc="$(curl -sS -D - -o /dev/null \
        -H "Cookie: $COOKIE" -H "User-Agent: $UA" \
        -H "Referer: https://www.ou99.com/forum.php?mod=viewthread&tid=${tid}" \
        "https://www.ou99.com/forum.php?mod=attachment&aid=${aid}" \
        | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}' | tail -1 || true)"

  if [ -z "$loc" ]; then
    echo "⛔ $tid 沒拿到 Location —— 多半是**還沒購買**，或 cookie 過期" >&2
    fail=$((fail+1)); continue
  fi

  # ② 從靜態主機抓（⭐ 不需認證）
  ext="${loc##*.}"; [ ${#ext} -le 4 ] || ext=zip
  dest="$OUT/${tid}.${ext}"
  code="$(curl -sS --max-time 180 -o "$dest" -w '%{http_code}' \
          -H "Referer: https://www.ou99.com/" -H "User-Agent: $UA" "$loc" || echo 000)"

  # ③ 驗真的是壓縮檔（⛔ 不是 HTML 錯誤頁）
  if [ "$code" = "200" ] && [ -s "$dest" ] && \
     head -c 2 "$dest" | grep -qE 'PK|Rar|7z' 2>/dev/null; then
    sz="$(wc -c < "$dest" | tr -d ' ')"
    echo "⭐ $tid → $dest ($sz bytes)  ←  $loc"
    ok=$((ok+1))
  else
    echo "⛔ $tid 下載失敗 (HTTP $code) $loc" >&2
    rm -f "$dest"; fail=$((fail+1))
  fi
done

echo "── ⭐ 成功 $ok ｜ ⛔ 失敗 $fail ｜ 落點 $OUT"
[ "$fail" -eq 0 ]
