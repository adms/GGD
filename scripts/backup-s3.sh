#!/usr/bin/env bash
# ⭐⭐【S3 備份站點：成品 · 產生器 · 抽取器 · 半成品，全部各一份】(GH#1231)
#
# owner 2026-09-11（逐字）：
#   「**S3 是備份不是互斥** 所有產生器 抽取器 成品也都要在 S3 上一份 作為備份站點」
#
# ⭐ 「不是互斥」是這支腳本的**全部設計** —— 它只上傳，⛔ 從不從 git 拿走任何東西。
#   ⇒ 它是**純加法**，因此不需要 rollback 開關（⛔ 改寫 git 歷史才需要，而那件事這裡不做）。
#
# ── ⭐ 備份什麼 ────────────────────────────────────────────────────────────
#   ① `git archive HEAD` 的 tar.gz —— ⭐ 這一顆就涵蓋了**所有產生器 · 抽取器 · 成品 · 文件**
#   ② 沒進 git 的半成品／來源樹（抽取器產物 · 準備材料 · 音色庫）
#
# ── ⛔⛔ 「sync 回 0」⛔ 不等於「傳對了」 ──────────────────────────────────
# ⭐ 所以 `--check` 做的是**把位元組抓回來重算 sha256**，⛔ 不是問 S3「你有沒有這個 key」。
#   （一把只驗過單邊的尺不算自證過 —— 本 repo 的常設判準。）
#
# ⛔⛔ 憑證：這支腳本**從不碰憑證**。只設 AWS_PROFILE，讓 AWS CLI 自己解析。
#   ⛔ 不讀 ~/.aws/credentials · ⛔ 不接受環境變數裡的 key · ⛔ 不印任何憑證。
#   收到 AccessDenied ⇒ ⭐ 那是**刻意的安全邊界**，⛔ 不擴權、⛔ 不另建憑證。
#
# 用法：
#   bash scripts/backup-s3.sh            # 備份當下的 HEAD（⭐ 會寫 manifest）
#   bash scripts/backup-s3.sh --check    # ⛔ 唯讀：manifest 每一筆在 S3 上真的存在且雜湊對得上
set -uo pipefail
cd "$(dirname "$0")/.."
BUCKET="${GGD_S3_BUCKET:-ggd-390630837668-ap-east-2-an}"
REGION="${GGD_S3_REGION:-ap-east-2}"
PROFILE="${AWS_PROFILE:-vibe-coding}"
MANIFEST="docs/_data/s3-backup-manifest.json"
TREES=("tools/w3x-import/out" "materials" "tools/bgm-gen/sf")
check=0; [ "${1:-}" = "--check" ] && check=1

aws_() { AWS_PROFILE="$PROFILE" aws --region "$REGION" "$@"; }

# ⭐ 身分自證 —— ⛔ 跑錯角色與「沒有權限」長得不一樣,要先分開。
arn="$(aws_ sts get-caller-identity --query Arn --output text 2>&1)"
case "$arn" in
  *assumed-role/vibe-coding-s3-role/*) : ;;
  *) echo "⛔ 身分不是預期的角色（拿到：$arn）⇒ 停手，⛔ 不要嘗試換 profile 或擴權。"; exit 1 ;;
esac

sha() { shasum -a 256 "$1" | cut -d' ' -f1; }

if [ "$check" = "1" ]; then
  [ -f "$MANIFEST" ] || { echo "⛔ 沒有 $MANIFEST —— 先跑一次 \`bash scripts/backup-s3.sh\`。"; exit 1; }
  key="$(python3 -c "import json;print(json.load(open('$MANIFEST'))['gitTree']['key'])")"
  want="$(python3 -c "import json;print(json.load(open('$MANIFEST'))['gitTree']['sha256'])")"
  tmp="$(mktemp -t ggd-backup-verify)"
  if ! aws_ s3 cp "s3://$BUCKET/$key" "$tmp" --no-progress > /dev/null 2>&1; then
    echo "⛔ 抓不回 s3://$BUCKET/$key —— ⭐ 備份**不存在或讀不到**，⛔ 不是「應該沒問題」。"
    rm -f "$tmp"; exit 1
  fi
  got="$(sha "$tmp")"; rm -f "$tmp"
  if [ "$got" != "$want" ]; then
    echo "⛔⛔ 備份的位元組與 manifest 對不上：manifest $want ≠ 實際 $got"
    echo "   ⇒ ⭐ 「傳上去了」⛔ 不等於「傳對了」—— 重跑 \`bash scripts/backup-s3.sh\`。"
    exit 1
  fi
  echo "⭐ 備份驗過：$key 抓回來重算 sha256 對得上（${want:0:16}…）。"
  exit 0
fi

head_sha="$(git rev-parse HEAD)"
key="backup/git-tree/$head_sha.tar.gz"
tar_path="$(mktemp -t ggd-git-archive).tar.gz"
git archive --format=tar HEAD | gzip -6 > "$tar_path" || { echo "⛔ git archive 失敗"; rm -f "$tar_path"; exit 1; }
digest="$(sha "$tar_path")"
bytes="$(wc -c < "$tar_path" | tr -d ' ')"
aws_ s3 cp "$tar_path" "s3://$BUCKET/$key" --no-progress > /dev/null || { echo "⛔ 上傳失敗"; rm -f "$tar_path"; exit 1; }
rm -f "$tar_path"
echo "⭐ git 樹已備份：$key（$bytes bytes）"

trees_json="["; first=1
for t in "${TREES[@]}"; do
  [ -d "$t" ] || continue
  prefix="intermediates/${t//\//_}/"
  aws_ s3 sync "$t" "s3://$BUCKET/$prefix" --no-progress > /dev/null 2>&1
  n="$(aws_ s3 ls "s3://$BUCKET/$prefix" --recursive --summarize 2>/dev/null | sed -n 's/.*Total Objects: *\([0-9]*\).*/\1/p' | tail -1)"
  : "${n:=0}"
  [ "$first" = "0" ] && trees_json="$trees_json,"
  trees_json="$trees_json{\"tree\":\"$t\",\"prefix\":\"$prefix\",\"objects\":$n}"
  first=0
  echo "⭐ $t → $prefix（$n 個物件）"
done
trees_json="$trees_json]"

mkdir -p "$(dirname "$MANIFEST")"
python3 - "$MANIFEST" "$head_sha" "$key" "$digest" "$bytes" "$trees_json" <<'PY'
import json, sys
path, head, key, digest, size, trees = sys.argv[1:7]
doc = {
  "schema": "ggd-s3-backup-manifest@1",
  "note": ("⭐ S3 **備份站點**的收據（GH#1231）。owner 2026-09-11 逐字：「S3 是備份不是互斥 "
           "所有產生器 抽取器 成品也都要在 S3 上一份 作為備份站點」。"
           "⛔ 不要手改：跑 `bash scripts/backup-s3.sh`。"
           "⭐ 位元組在 S3、**雜湊在 git** —— 這一份就是那個雜湊。"),
  "bucket": "ggd-390630837668-ap-east-2-an",
  "gitTree": {"commit": head, "key": key, "sha256": digest, "bytes": int(size)},
  "intermediates": json.loads(trees),
}
with open(path, "w", encoding="utf-8") as f:
    f.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
print(f"⭐ 寫了 {path}")
PY
