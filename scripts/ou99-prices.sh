#!/usr/bin/env bash
# ou99-prices.sh —— 批次查 ou99 付費模型的價格（⛔ 零貼文）
#
# ⭐ 用法：
#     bash scripts/ou99-prices.sh 497211 468771 457280        # 帶帖號
#     bash scripts/ou99-prices.sh --file ids.txt              # 一行一個
#     bash scripts/ou99-prices.sh --file ids.txt --merge docs/ou99價格表.json
#
# ⭐ Cookie（⛔ 這一步機器做不到，要人去瀏覽器複製）：
#     在已登入 ou99 的分頁 console 打 `document.cookie`，整串存成 ~/.ou99-cookie
#     （或設環境變數 OU99_COOKIE）。⚠️ 每次登入會換。
#
# ⭐ 為什麼走 curl 而不是瀏覽器（2026-09-10 量到，⛔ 不要再走回頭路）：
#   · ⭐ **curl 讀得到帖子頁**（HTTP 200、真 HTML）—— 舊筆記寫的「WAF 擋 curl」
#     對這個端點**已經不成立**。
#   · ⛔ 瀏覽器 pane 每次重開就掉登入（已經咬過三次），curl 帶 cookie 檔則不會。
#
# ⭐ 為什麼不用回覆就看得到價格：
#     帳號是 **偶久至尊会员**，特權含「网站免回复查看内容」。
#     ⛔ 若哪天會員到期，價格會縮回「回覆可見」後面，這支就會回 0 筆。
set -euo pipefail

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
COOKIE="${OU99_COOKIE:-}"
[ -z "$COOKIE" ] && [ -f "$HOME/.ou99-cookie" ] && COOKIE="$(tr -d '\n' < "$HOME/.ou99-cookie")"
if [ -z "$COOKIE" ]; then
  echo "⛔ 沒有 cookie。在已登入的 ou99 分頁 console 打 document.cookie，存成 ~/.ou99-cookie" >&2
  exit 2
fi

IDS=(); MERGE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --file)  mapfile -t more < "$2"; IDS+=("${more[@]}"); shift 2 ;;
    --merge) MERGE="$2"; shift 2 ;;
    *)       IDS+=("$1"); shift ;;
  esac
done
[ ${#IDS[@]} -gt 0 ] || { echo "用法: $0 <帖號…> | --file <檔>" >&2; exit 2; }

PY=/usr/local/bin/python3
[ -x "$PY" ] || PY=python3

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
ok=0; miss=0
: > "$tmp/out.tsv"
for raw in "${IDS[@]}"; do
  tid="$(printf '%s' "$raw" | grep -oE '[0-9]{6}' | head -1 || true)"
  [ -n "$tid" ] || continue
  curl -sS --max-time 30 -o "$tmp/p.html" \
    -H "Cookie: $COOKIE" -H "User-Agent: $UA" \
    "https://www.ou99.com/forum.php?mod=viewthread&tid=${tid}" 2>/dev/null || true
  p="$("$PY" - "$tmp/p.html" <<'PYEOF'
import re,sys
h=open(sys.argv[1],'rb').read().decode('gbk','replace')
m=(re.search(r'需支付[\s\S]{0,80}?(\d{2,6})\s*元宝',h)
   or re.search(r'解锁付费内容[\s\S]{0,120}?(\d{2,6})\s*元宝',h))
if m: print(m.group(1))
elif re.search(r'付费内容有效期|已购买',h): print(0)     # 已買過
PYEOF
)"
  if [ -n "$p" ]; then printf '%s\t%s\n' "$tid" "$p" >> "$tmp/out.tsv"; ok=$((ok+1))
  else echo "⛔ $tid 查不到價（未登入？帖已下架？）" >&2; miss=$((miss+1)); fi
done

cat "$tmp/out.tsv"
echo "── ⭐ 取得 $ok ｜ ⛔ 失敗 $miss" >&2

if [ -n "$MERGE" ]; then
  "$PY" - "$MERGE" "$tmp/out.tsv" <<'PYEOF'
import json,sys,os
path,tsv=sys.argv[1],sys.argv[2]
P=json.load(open(path)) if os.path.exists(path) else {}
n=0
for line in open(tsv):
    a=line.split()
    if len(a)==2 and a[0] not in P: P[a[0]]=int(a[1]); n+=1
json.dump(P,open(path,'w'),indent=0,ensure_ascii=False)
print(f"⭐ 併入 {n} 筆 → {path}（共 {len(P)} 支）",file=sys.stderr)
PYEOF
fi
