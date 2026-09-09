import os,subprocess
os.environ['GGD_CONTENT_LOCK_HELD']='1'
env=dict(os.environ, GGD_LEDGER_NO_REGEN='1')
subprocess.run(['bash','scripts/product-quarantine.sh','unlock'],check=True)
try:
 for day in ('2026-09-09','2026-09-10'):
  subprocess.run(['bash','scripts/message-ledger.sh','--date',day],env=env,check=True)
 for when,ticket in [('03:21','1129'),('17:00','1159'),('21:14','— 既有公告補發成果回報，未新增工作'),('21:15','1159'),('23:53','1147 1150 1151')]:
  subprocess.run(['python3','scripts/ledger_table.py','--map','docs/_daily/2026-09-09.md',when,ticket],env=env,check=True)
finally:
 subprocess.run(['bash','scripts/product-quarantine.sh','lock'],check=True)
subprocess.run(['python3','scripts/ledger_table.py','--regen','docs/_daily/2026-09-09.md'],check=True)
