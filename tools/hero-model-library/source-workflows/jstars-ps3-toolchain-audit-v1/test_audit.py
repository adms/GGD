#!/usr/bin/env python3
from __future__ import annotations
import importlib.util,struct,tempfile,unittest
from pathlib import Path
P=Path(__file__).with_name("audit.py"); S=importlib.util.spec_from_file_location("audit",P); assert S and S.loader; M=importlib.util.module_from_spec(S); S.loader.exec_module(M)
class AuditTest(unittest.TestCase):
 def test_nested_ch0_is_blocked(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"x"; p.write_bytes(b"$CLH"+struct.pack(">III",1,32,0)+b"$CH0"+b"\0"*12)
   self.assertTrue(M.inspect_cmp(p)["requiresUnimplementedCh0"])
 def test_srd_block_alignment(self):
  raw=b"$ABC"+struct.pack(">III",1,1,0)+b"x"+b"\0"*15+b"y"+b"\0"*15
  row=M.blocks(raw)[0]; self.assertEqual(row["subdataOffset"],32); self.assertEqual(row["subdataBytes"],1)
if __name__=="__main__": unittest.main()
