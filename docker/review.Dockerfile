# docker/review.Dockerfile —— 🧑‍⚖️ 批核頁的**資料面 sidecar**（GH#794）。
#
# owner 2026-08-27：「請**同步到線上**，並且**線上批核的結果也同步到本機端**」
#
# ⭐ 這個映像刻意**小到近乎沒有**：`tools/review/**` 是**零外部依賴**的
# （只 import node: 內建），所以不必 pnpm install、不必 build、不必 workspace。
# ⇒ 它與 `pnpm dev` 跑的是**同一份 .mjs**（第〇·四守則：⛔ 不造第二個住處）。
#
# ## 🔐 權限住在**掛載**裡，⛔ 不在程式的判斷裡（compose / helm 負責）
#   /srv/repo/docs/_review/material  :ro   📦 材料 —— 線上讀得到、寫不進去
#   /srv/repo/docs/_reports          :ro   📸 連續圖片
#   /srv/repo/content                :ro   🔧 rollback 開關要解析
#   /srv/repo/docs/_review/verdicts  :rw   🧑‍⚖️ 結果 —— **線上唯一寫得動的東西**
#
# ⚠️ USER node（uid 1000）：verdicts 那個 bind mount 在 host 上必須讓 1000 寫得動，
#    否則 /healthz 會 **503 並指名 EACCES**（⛔ 不是靜默地什麼都不寫）。
#    修法寫在 scripts/host-deploy.sh 的 review 段。
#
# 建置的 context 是 repo 根：docker build -f docker/review.Dockerfile .

FROM node:22-alpine
# ⛔⛔ `python3` 是**必要**的,⛔ 不是可選 —— 而它在 2026-08-29 之前一直缺席。
#
# `tools/admin-live/datasets/` 底下有三支資料集 **spawn python3** 產生資料：
#   · skill90.mjs      —— import `tools/skill-remake/batch1.py` 的 T 表跑 drift 稽核
#   · jass-vfx.mjs     —— 讀 w3x 匯入的普查
#   · treasures.mjs    —— `tools/economy/gen_treasure_csv.py`
#
# ⚠️ 沒有它的症狀是後台那三頁回 **HTTP 500：`spawn python3 ENOENT`** ——
#   ⭐ 而**其餘 11 個資料集完全正常**,所以它看起來像「後台一堆服務壞了」
#     而不是「這個映像少一個套件」。
#
# ⚠️⚠️ 這**不是**搬遷造成的:2026-08-29 實測 **GCP 的 review 容器也沒有 python3**
#   ⇒ 那三頁在舊站上一樣壞,只是沒有人去點。
#   ⭐ 教訓:一個「只有某幾頁會用到」的執行期相依,可以在出貨映像裡缺席很久
#     而沒有任何東西變紅 —— 因為**沒有人點的頁面不會失敗**。
#
# ⭐ 那些腳本**只用標準庫**（相對 import 的是 repo 自己的模組）⇒ ⛔ 不需要 pip。
# ⭐ `git` 也是必要的:`tools/skill-remake/common.py` 用 `git ls-tree HEAD content/abilities/`
#   決定出貨的技能編號 ⇒ 沒有它,`skill90` 在**裝了 python3 之後**才會露出下一個錯
#   （2026-08-29 就是這樣一次修一個 —— ⛔ 而 CLAUDE.md 記過「請盡量批次錯」）。
# ⚠️ 它同時需要 `/srv/repo` 底下**真的有 `.git`** —— 而那是切到 git 部署流程之後才成立的。
RUN apk add --no-cache tini python3 git
ENV NODE_ENV=production \
    GGD_REVIEW_MODE=live \
    GGD_REVIEW_PORT=8790 \
    GGD_REVIEW_ROOT=/srv/repo
WORKDIR /app
COPY tools/review/ ./tools/review/
# 🔴 13 頁對照/設定頁的實時資料面（同樣零外部依賴、零寫檔）。
COPY tools/admin-live/ ./tools/admin-live/
EXPOSE 8790
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8790/healthz').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "tools/review/server.mjs"]
