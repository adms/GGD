# 逐則對票 · owner 原話全文 2026-08-29

> ⭐ `docs/_daily/2026-08-29.md` 的表格那一格是**截斷**過的,全文在這裡。
> 由 `scripts/message-ledger.sh` 從 session transcript 產生 —— ⛔ 不要手改。
> `scripts/asked-before.sh` 會 grep 這一份找 owner 的原話。

## 00:19

這台 mac mini 有時候會放在同一個區網 網段內 (maybe 192.168.0.x)

## 01:42

請你做完

## 02:10

幫我掃描 192.168.0.133

## 02:18

我可以在 ap 開 port 或 mini 上開 port ，告訴我做法就好

## 02:22

通了

## 02:32

Connection to GenieAccelerdeMac-mini-2.local port 22 [tcp/ssh] succeeded!
✓ 通了
Takuro@iPhone6sProMax GGD % nc -z -G 3 192.168.0.133 22 && echo "✓ 權限已生效"
Connection to 192.168.0.133 port 22 [tcp/ssh] succeeded!
✓ 權限已生效
Takuro@iPhone6sProMax GGD %

## 02:35

LAN 直連           6.51 ms
CF edge          7.62 ms
今天的 GCP          9.84 ms

## 02:40

ping 以外 還有頻寬也是考量吧

## 02:51

請你幫我啟用 因為之後都會從這台部署到 mini

## 03:07

請你測試這台到 mini 另外一條有線路線的 ping 與頻寬

## 03:10

應該是 2.5Gbps 才對

## 03:14

TB再量看看

## 03:18

try tb5

## 03:23

ok 那我們來搬遷吧

## 03:24

等等 wifi 很慢嗎

## 03:30

你要教我如何在 mini 安全的產生 key  讓你可以 ssh 登入

## 03:35

iiuiopiujhyujujjjki8uiklouytrdeswedrftyuiopoiuytrewsrtyi8u765432q2wertyuioiuytreswasdefrtguiopoiuytreswedrftyuiopoiuytreswasdrtyuiop[]\

## 03:38

ok

## 03:39

ok

## 03:40

mini 帳號是 genieacceler

## 03:49

自動登入開了

## 04:11

mini重開機了

## 04:20

rebooted

## 04:23

如果我要從外網啟動，我要打開/port forward 哪些? 還要設定哪些?

## 04:25

我以為 public IP 是 122.116.95.244

## 04:32

Cloudflare Tunnel 你幫我設定

## 04:36

把 adms.ai 加進 Cloudflare
dash.cloudflare.com 
=> why not ggd.adms.ai

## 04:39

教我一步步設定

## 04:48

carrera.ns.cloudflare.com
cesar.ns.cloudflare.com

## 04:52

adms.ai A	114.32.220.203 已經廢除了 沒差

## 04:57

我好了

## 05:08

brew install cloudflared && 

sudo cloudflared service install eyJhIjoiNDViZjBjZmVkZmI4MmZhZDU5ZTVlMmQ5MmQxZDA1ZjAiLCJ0IjoiNzNhNTAyZGUtZDU5MC00ZDhkLWI5YmEtOTdmMzk2NzE4MDU0IiwicyI6IlpURXdOREptTUdRdE5EVTBZaTAwTkRnMkxUazBPV010WTJFME5EZGxPV0ppTmpRMyJ9

## 05:13

加好了

## 05:18

沒問題 我可以同時多一條新線

## 05:26

proxy 關掉 是對的嗎

## 05:28

check again and compare 3 path

## 05:33

check 3 route again and compare lag and bandwidth

## 05:34

路由器轉發還沒設 我已經設定了

## 05:53

try again

## 05:55

早就都加了

## 06:06

好 我現在要將這台 M5 Max 設定為手機網路 請你重新測試一次

## 06:12

我要如何從外網連進來更新 deploy 版本？

## 06:16

那就用 Cloudflare Tunnel 吧 有什麼優缺點？

## 06:18

我可以用 vpn

## 06:21

我連上 vpn 了

## 06:23

透過 VPN 連線傳送所有流量 ok

## 06:25

go

## 06:40

xcode-select: note: install requested for command line developer tools

## 06:51

我設定好 DNS 了 接下來呢？

## 06:55

ok

## 07:02

offsite-backup.sh install /BackupDaily/

## 07:25

dropbox 可以嗎

## 07:26

Cloudflare R2 ok

## 07:33

② 建 API Token

R2 頁面右上 → Manage R2 API Tokens → Create API token
=> 找不到

## 07:42

yes, please check https://ggd.adms.ai/ playable, too.

## 07:55

後台一堆服務都壞了 請你檢查

## 07:59

yes 不要一直問我這種沒有決策點的問題

## 08:04

給我最終搬遷前後各種指標比較差異表

## 08:07

(a) 切到 git pull	你（或授權我）先 push 那 38 個 commit ⇒ 之後與 GCP 同一套流程，⭐ 版本戳問題自動解決

完整前後對照表 是表現 例如處理哪項任務的時間 響應速度 頻寬 等各種實驗結果

## 08:26

📐 90支技能重製對照
🧑‍⚖️ 一頁批次後台驗收 —— 90 支重製
這一頁相關 0 批 · 待裁決 0
重新讀取
這一頁**還沒有登記過批次**。上線一批成果之後用 pnpm review:register 登記（⭐ 登記時必須寫得出 rollback 開關， 寫不出來就代表那一批違反「留後台開關」的常設指令）。
GET /__live/skill90 → HTTP 500：Error: python3 dump 失敗：Command failed: python3 -c 
import importlib.util, json, os, sys
root = sys.argv[1]
here = os.path.join(root, "tools", "skill-remake")
spec = importlib.util.spec_from_file_location("batch1", os.path.join(here, "batch1.py"))
b = importlib.util.module_from_spec(spec)
sys.modules["batch1"] = b
spec.loader.exec_module(b)   # 只 import：A(...) 填表、load_heroes() 跑閘，不寫檔
rows = []
for e in b.T:
    cid, slot, d = b.build(e)
    rows.append({
        "num": e["num"], "name": e["name"], "cid": cid, "slot": slot, "id": d["id"],
        "spec": {k: e[k] for k in ("cast", "cd", "mp", "rng", "maxRank", "radiusTier", "desc") if k in e},
        "gen": d,
    })
json.dump({"rows": rows, "hero": b.HERO}, sys.stdout, ensure_ascii=False)
 /srv/repo
Traceback (most recent call last):
  File "<string>", line 11, in <module>
    cid, slot, d = b.build(e)
                   ~~~~~~~^^^
  File "/srv/repo/tools/skill-remake/common.py", line 1306, in build
    suffix = slot_suffix(num)
  File "/srv/repo/tools/skill-remake/common.py", line 89, in slot_suffix
    shipped = _shipped_number_to_suffix()
  File "/srv/repo/tools/skill-remake/common.py", line 66, in _shipped_number_to_suffix
    for path in _git("ls-tree", "-r", "--name-only", "HEAD", "content/abilities/").split("\n"):
                ~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/srv/repo/tools/skill-remake/common.py", line 50, in _git
    return subprocess.run(["git", "-C", ROOT, *args],
           ~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                          capture_output=True, text=True, check=True).stdout
                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.14/subprocess.py", line 555, in run
    with Popen(*popenargs, **kwargs) as process:
         ~~~~~^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.14/subprocess.py", line 1039, in __init__
    self._execute_child(args, executable, preexec_fn, close_fds,
    ~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                        pass_fds, cwd, env,
                        ^^^^^^^^^^^^^^^^^^^
    ...<5 lines>...
                        gid, gids, uid, umask,
                        ^^^^^^^^^^^^^^^^^^^^^^
                        start_new_session, process_group)
                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.14/subprocess.py", line 1990, in _execute_child
    raise child_exception_type(errno_num, err_msg, err_filename)
FileNotFoundError: [Errno 2] No such file or directory: 'git'

Traceback (most recent call last):
  File "<string>", line 11, in <module>
    cid, slot, d = b.build(e)
                   ~~~~~~~^^^
  File "/srv/repo/tools/skill-remake/common.py", line 1306, in build
    suffix = slot_suffix(num)
  File "/srv/repo/tools/skill-remake/common.py", line 89, in slot_suffix
    shipped = _shipped_number_to_suffix()
  File "/srv/repo/tools/skill-remake/common.py", line 66, in _shipped_number_to_suffix
    for path in _git("ls-tree", "-r", "--name-only", "HEAD", "content/abilities/").split("\n"):
                ~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/srv/repo/tools/skill-remake/common.py", line 50, in _git
    return subprocess.run(["git", "-C", ROOT, *args],
           ~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                          capture_output=True, text=True, check=True).stdout
                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.14/subprocess.py", line 555, in run
    with Popen(*popenargs, **kwargs) as process:
         ~~~~~^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.14/subprocess.py", line 1039, in __init__
    self._execute_child(args, executable, preexec_fn, close_fds,
    ~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                        pass_fds, cwd, env,
                        ^^^^^^^^^^^^^^^^^^^
    ...<5 lines>...
                        gid, gids, uid, umask,
                        ^^^^^^^^^^^^^^^^^^^^^^
                        start_new_session, process_group)
                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.14/subprocess.py", line 1990, in _execute_child
    raise child_exception_type(errno_num, err_msg, err_filename)
FileNotFoundError: [Errno 2] No such file or directory: 'git'

    at file:///app/tools/admin-live/datasets/skill90.mjs?v=1787961774000:95:32
    at ChildProcess.exithandler (node:child_process:424:5)
    at ChildProcess.emit (node:events:519:28)
    at maybeClose (node:internal/child_process:1101:16)
    at ChildProcess._handle.onexit (node:internal/child_process:304:5)
© 2026 Moriyamouse/Adms 糟糕騎士團

## 08:42

mini 同一個區網玩起來會比較快嗎?

## 08:47

手把 v4 也上線了吧？
