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
RUN apk add --no-cache tini
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
