# 家人同樂版部署手冊 (Family deploy runbook) — #176

> 給家人玩的私有部署：**全開資源、不分級**，密鑰一次生成、開機硬檢查。
> 一個指令啟動，把網址傳給家人，他們看到的就是你在 localhost 看到的。

這份文件只講「怎麼做」。每個機制「為什麼這樣做」寫在對應檔案的檔頭註解裡
（`docker/compose.family.yaml`、`tools/deploy/ggd-assets.sh`、
`apps/client/src/config/fullAssets.ts`、`packages/shared/src/deployTier.ts`）。

---

## 0. 先決條件

- 這台機器有 `docker`（Docker Desktup / OrbStack 皆可），而且 daemon 有開。
- 這台機器上有 `data/blizzard-overlay/`（556 檔 / 83 MiB）。這是**用 git 傳不到主機**的
  版權疊加資源；沒有它，113 位英雄裡有 40 位會變成通用替身、97 位點下去沒有聲音，
  而且**畫面完全正常、沒有任何錯誤**——這正是本任務要根除的無聲失敗。

---

## 1. 同一台機器（最常見：你的 Mac 就是主機）

```sh
make family-up
```

這一個指令會依序：

1. `make family-secrets` — 產生 `docker/.env`，內含三把 `openssl rand -hex 32` 的強密鑰
   （`REDIS_PASSWORD` / `JWT_SIGNING_SECRET` / `PLATFORM_GAME_SHARED_SECRET`）。
   **已存在就不覆蓋**（重生會讓所有人被登出）。
2. `make family-ship` — 產生資產清單並**深度校驗**（逐檔 sha256）本機的 overlay。
3. `docker compose … build` — 用 `VITE_GGD_FULL_ASSETS=1` 建 client（就是這個旗標讓
   overlay 真的會被請求）。
4. 起 redis，然後**在平台啟動前**用一次性容器跑 `/seed -starter`：新主機 `data/` 是空的，
   而平台的 boot check 會**拒絕以空白名單對外啟動**（exit 1），所以陣容必須先補進 `/data`
   再起服務。冪等——你自己 `data/` 已經有 48 位英雄時它是 no-op。
5. `docker compose … up -d` — 掛上 `nginx/tier/family/` 與 `data/blizzard-overlay/`，
   全部服務起來（platform/game/redis 設 `restart: unless-stopped`，中途掛掉會自動回來；
   edge 故意 `restart: "no"`，見第 6 節）。
6. 印出網址、後台網址、一次性 owner 認領碼。

啟動後 edge 監聽 `0.0.0.0:8088`（`docker/.env` 的 `GGD_BIND` / `GGD_PORT` 可改）。
家人連 `http://<你的區網 IP>:8088/` 即可。

---

## 2. 遠端主機（家人不在你的 wifi）

```sh
make family-ship HOST=user@your-host      # rsync overlay + curation，並在遠端深度校驗
```

`family-ship` 用 `rsync -a --delete --partial`：**增量、可續傳**，中斷後重跑即可；
傳完會把校驗腳本 scp 過去，在**遠端**逐檔比對 sha256（不相信 rsync 的自我報告）。

主機端把 repo 帶過去後（git 能帶的部分），在主機上：

```sh
# docker/.env 由 make family-secrets 在主機上產生（密鑰不要跨機複製）
GGD_OVERLAY_SRC=/srv/ggd/blizzard-overlay make family-up
```

TLS：edge 只講 HTTP。放在會終止 TLS 的通道後面（cloudflared / tailscale funnel /
`ssh -R`）或維持在區網內。家人的密碼會走那一跳。

---

## 3. 建立 owner 帳號 + 發邀請碼（全新主機，照順序做）

第一次啟動、`data/` 全新時，網站還沒有任何管理員。**這時 register 頁會自動切成
「首位管理員設定」畫面**（不是叫你去找管理員要邀請碼——因為管理員就是你，還沒建立）。
按這串做，你就是站長（T0 / #180）：

1. **在主機上讀出一次性 owner 認領碼**（兩個來源，內容一樣）：

   ```sh
   make family-token          # 印出 DATA_DIR/owner-setup-token 的內容
   ```

   或直接看啟動日誌：`make family-logs` 裡那行
   `WARN … THIS DEPLOY HAS NO ADMINISTRATOR …` 的 `ownerToken` 欄位。
   （碼是一次性、mode 0600，只有能碰到這台主機檔案的人讀得到——這就是「主機存取證明」。）

2. **用瀏覽器打開遊戲網址** `http://<host>:8088/` → 切到「Create account」。
   因為這是全新部署，畫面頂端會出現藍框的 **「首位管理員設定」**，並多出一格
   **「主機 owner 開通碼（在主機 DATA_DIR/owner-setup-token）」**。

3. 填 username / email / password，把第 1 步的碼**貼進那格開通碼**（它是小寫 hex，
   不要當邀請碼、不要大寫），送出 → 你的帳號直接成為 **admin + 已核准**，並立刻登入。
   （碼送出後即被消耗、檔案刪除；之後再貼同一組碼不會再產生第二個 owner。）

4. **發邀請碼給家人**：`http://<host>:8088/admin/` 用剛剛的帳密登入 → 進後台 →
   「邀請碼」頁 → 為每位家人各發一組碼（備註必填）（#174）。

5. **家人註冊**：家人打開遊戲網址 → 「Create account」（此時已不是首位管理員畫面，
   而是一般的「需要邀請碼」畫面）→ 填入你發的碼 → 成為一般玩家 → 登入 → 進大廳開始遊戲。

> **正式主機用「登入 → 大廳」開始遊戲，不是首頁那顆「Play offline vs bots」。**
> 單機直連在有共享密鑰的安全主機上是刻意關閉的（`MatchRoom.ts`），畫面已標註這點。
>
> **本機 localhost = admin 的免登入在主機上不成立**（那是 build flag，正式 bundle 折疊成 false）。
> 主機上你就是要一組真的 admin 帳密。

---

## 4. 忘記 admin 密碼（主機端重設）

```sh
make family-admin-reset USER_NAME=<你的 admin 帳號>
```

底層是 `docker compose exec platform /ownerreset -username <name> -generate`，會產生一組
強密碼並印出一次。授權模型就是「你能在這台機器上跑它」——它不簽任何 token，即使
密鑰壞掉也能用。（`USER_NAME`，不是 `USER`——後者每個 shell 都有值。）

---

## 5. 收工與下次開場（帳號、天梯、錄影都保留）

```sh
make family-down           # 停止；redis volume、data/ 全部保留
# 下一場：
make family-up             # 什麼都不會遺失
```

`family-down` 只做 `docker compose down`，不刪 volume、不動 `data/`。帳號、天梯排名、
對戰錄影（#175）、白名單都在下一次 `family-up` 原樣回來。

---

## 6. 疑難：edge 起不來、直接掛掉

這是**設計行為**，不是壞掉。全開資源的部署若 overlay 缺失或短少，edge 會在啟動 nginx
**之前**印出 FATAL 並 `exit 1`（`docker/edge-entrypoint.d/20-ggd-assert-full-assets.sh`），
而且 `restart: "no"` 讓它保持掛著、看得見。訊息會告訴你缺多少、怎麼修：

```
make family-ship HOST=<host>
```

`make family-logs` 看完整日誌。三個服務（platform / game / edge）開機都會印出
`deployTier=family fullAssets=true`；三行不一致就是設定沒對齊。

---

## 7. 這個版本改了哪些安全預設（提醒，不是待辦）

- 三把密鑰在**對外綁定**時，若為空／過短／是任何開發預設值 → **開機失敗並指名變數**。
  區網/tunnel 綁定 = 對外。loopback 綁定（`.claude/launch.json`）不受影響。
- `REDIS_PASSWORD` 以前**完全沒檢查**（#117 的形狀）——現在納入同一道關卡。
- family compose 只把 **edge** 開到 `0.0.0.0`；redis/platform/game 明確重新釘回 `127.0.0.1`。
  想放行家人時**不要**去刪 `127.0.0.1:` 前綴——那會把 redis 一起開到區網（正是 #117）。
- game-server 的密鑰守衛以前只在 `NODE_ENV=production` 才生效，而 compose 設的是
  `development` → 形同虛設。現在反轉：**除非明確宣告是開發環境，否則一律要真密鑰**，
  family compose 設 `APP_ENV=production` / `NODE_ENV=production`。
