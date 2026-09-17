#!/usr/bin/env python3
"""Audit public SRD decoders against exact J-STARS PS3 samples.

This deliberately stops at structural inspection.  It never calls a partial
QuickBMS output a decoded model and never emits a runtime candidate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any

SCHEMA = "ggd.jstars-ps3-toolchain-audit@1"

UPSTREAMS = [
    {"name":"QuickBMS","url":"https://github.com/LittleBigBug/QuickBMS","commit":"5315ffe664b88dc09ae783ad17d9dfd252b1c927","license":"GPL-2.0","licenseSha256":"8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643","keySource":"src/unz.c","keySourceSha256":"0b58c1b0a88f910878d8beafc72d2505e47cd52693e926fb90e523e7fc8f099f","evidence":"src/unz.c drv3_srd_dec handles $CLN/$CL1/$CL2 LZ modes; observed nested $CH0 has no matching implementation"},
    {"name":"Danganronpa-Tools","url":"https://github.com/yukinogatari/Danganronpa-Tools","commit":"59d32532224a93251f11489b54c5b8b04b645f0a","license":"WTFNMFPL-1.0","licenseSha256":"014fae580d594a302bf595afc1e822cfe076eb286a5f4f9b8eca68ba7ee1892c","keySource":"drv3/drv3_dec.py","keySourceSha256":"d5b2efa4de75424c79244ddddb21fefbecb39a5b25bf8e8e2889e133c7229d29","evidence":"drv3/drv3_dec.py is the same LZ-only SRD path; srd_ex.py does not parse VTX/MSH/SKL geometry"},
    {"name":"DRV3-Sharp","url":"https://github.com/CaptainSwag101/DRV3-Sharp","commit":"3155b11f225e2223dcdd4cc8555f0e051808e931","license":"GPL-3.0","licenseSha256":"8b1ba204bb69a0ade2bfcf65ef294a920f6bb361b317dba43c7ef29d96332b9b","keySource":"DRV3-Sharp-Library/Formats/Data/SRD/Blocks/BlockSerializer.cs","keySourceSha256":"4ea9e5b2e73a36c4213ebe53cc522386067f19ed3cd971e24cdad96b3cbd7147","evidence":"SRD BlockSerializer uses little-endian BinaryReader payload fields and DRV3 layouts; J-STARS sample is big-endian meshType 0x0702"},
    {"name":"Spiral","url":"https://github.com/SpiralFramework/Spiral","commit":"f43cfdc845deabaecfc1183a16f77370faf8ec60","license":"GPL-3.0","licenseSha256":"3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986","keySource":"formats/src/main/kotlin/info/spiralframework/formats/models/SRDIModel.kt","keySourceSha256":"217db175160459ea011c418b4c22a803299f330e920692fe62be3a8cef40543a","evidence":"VTXEntry and SRDIModel read little-endian payloads and recognize DRV3 mesh types 515-518, not PS3 0x0702"},
]

def sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda:f.read(8*1024*1024),b""): h.update(b)
    return h.hexdigest()

def u16(data: bytes, off: int) -> int: return struct.unpack_from(">H",data,off)[0]
def u32(data: bytes, off: int) -> int: return struct.unpack_from(">I",data,off)[0]
def align16(n:int)->int: return (-n)&15

def blocks(data: bytes, base: int=0, limit: int|None=None) -> list[dict[str,Any]]:
    end=len(data) if limit is None else min(len(data),base+limit)
    cur=base; rows=[]
    while cur+16<=end and data[cur:cur+1]==b"$":
        magic=data[cur:cur+4].decode("ascii",errors="replace")
        dl,sl,pad=u32(data,cur+4),u32(data,cur+8),u32(data,cur+12)
        data_off=cur+16; sub_off=data_off+dl+align16(dl); nxt=sub_off+sl+align16(sl)
        if nxt>end: raise ValueError(f"SRD block exceeds bounds: {magic}@{cur}")
        rows.append({"magic":magic,"offset":cur,"dataOffset":data_off,"dataBytes":dl,"subdataOffset":sub_off,"subdataBytes":sl,"paddingField":pad})
        cur=nxt
    return rows

def inspect_rsi(data:bytes, row:dict[str,Any], resource_bytes:int)->dict[str,Any]|None:
    if row["subdataBytes"]<32: return None
    nested=blocks(data,row["subdataOffset"],row["subdataBytes"])
    if not nested or nested[0]["magic"]!="$RSI": return None
    r=nested[0]; p=r["dataOffset"]; end=p+r["dataBytes"]
    if p+16>end: return {"error":"truncated RSI header"}
    count=data[p+3]; name_off=u32(data,p+12); ranges=[]
    for i in range(count):
        q=p+16+i*16
        if q+16>end: break
        start=u32(data,q)&0x0fffffff; length=u32(data,q+4)
        ranges.append({"start":start,"bytes":length,"inResourceBounds":start+length<=resource_bytes})
    name=None
    if 0<=name_off<r["dataBytes"]:
        q=p+name_off; name=data[q:data.find(b"\0",q,end) if data.find(b"\0",q,end)>=0 else end].decode("ascii",errors="replace")
    return {"name":name,"resourceRangeCount":count,"resourceRanges":ranges}

def inspect_srd(path:Path,srdi:Path)->dict[str,Any]:
    data=path.read_bytes(); size=srdi.stat().st_size; rows=blocks(data); counts=Counter(x["magic"] for x in rows); vertices=[]
    for r in rows:
        if r["magic"]!="$VTX" or r["dataBytes"]<16: continue
        p=r["dataOffset"]
        entry={"offset":r["offset"],"vectorCount":u32(data,p),"meshType":f"0x{u16(data,p+6):04x}","vertexCount":u32(data,p+8),"vertexSectionInfoCount":data[p+15]}
        entry["resourceInfo"]=inspect_rsi(data,r,size)
        rr=(entry["resourceInfo"] or {}).get("resourceRanges") or []
        entry["derivedVertexStride"]=(rr[0]["bytes"]//entry["vertexCount"] if rr and entry["vertexCount"] and rr[0]["bytes"]%entry["vertexCount"]==0 else None)
        vertices.append(entry)
    return {"absolutePath":str(path.resolve()),"bytes":len(data),"sha256":sha256(path),"srdi":{"absolutePath":str(srdi.resolve()),"bytes":size,"sha256":sha256(srdi)},"topLevelBlocks":len(rows),"blockTypes":dict(sorted(counts.items())),"vtx":vertices,"allResourceRangesInBounds":all(x["inResourceBounds"] for v in vertices for x in ((v.get("resourceInfo") or {}).get("resourceRanges") or []))}

def inspect_cmp(path:Path)->dict[str,Any]:
    d=path.read_bytes(); nested=d[16:20].decode("ascii",errors="replace") if d[:4]==b"$CLH" and len(d)>=20 else None
    return {"absolutePath":str(path.resolve()),"bytes":len(d),"sha256":sha256(path),"outerMagic":d[:4].decode("ascii",errors="replace"),"nestedMagic":nested,"requiresUnimplementedCh0":nested=="$CH0"}

def build(root:Path)->dict[str,Any]:
    lib=root.parent/"GGD-Asset-Library"
    minimal=lib/"conversions/jstars-owner-archive-extract-v1/cmp-probe/minimal-unsupported-clh-ch0.bin"
    pak=lib/"conversions/jstars-owner-archive-extract-v1/native-token-members/018/partition_op_character_ps3.cpk/character/model/character_model_018_m.pak"
    partial=lib/"conversions/jstars-owner-archive-extract-v1/cmp-probe/quickbms-partial/character_model_018_m.stp"
    exact=lib/"intake/public-models-20260914/zenhax-jstars-pak-stpk-comparison-v1/extracted/killua/character_model_018_m.stpk"
    model=lib/"conversions/jstars-stpk-research-v1/killua/m/018_killua_01p_PS3.srd"
    srdi=lib/"conversions/jstars-stpk-research-v1/killua/i/018_killua_01p_PS3.srdi"
    declared=u32(pak.read_bytes(),16)
    return {"schema":SCHEMA,"upstreams":UPSTREAMS,"researchReferences":[{"url":"https://zenhax.com/viewtopic.php%40t%3D13160.html","finding":"archived J-STARS thread reports cmp_scz partial decode and RPCS3 RAM-dump workaround; retained exact PAK/STPK pairs originate from this research set"},{"url":"https://steamcommunity.com/sharedfiles/filedetails/?id=2518047198","finding":"public model port credits JosouKitsune for extracted J-STARS files and a Noesis plugin"},{"url":"https://www.deviantart.com/josoukitsune","finding":"author publishes rigged J-STARS model pages with download metadata"}],"noesisPluginSearch":{"publicImplementationFound":False,"status":"referenced by model porters, but no author GitHub or publicly downloadable source/binary was located in the bounded search; not available for reproducible testing"},"samples":{"minimalUnsupported":inspect_cmp(minimal),"killuaCompressed":{"absolutePath":str(pak.resolve()),"bytes":pak.stat().st_size,"sha256":sha256(pak),"declaredDecodedBytes":declared},"quickBmsPartial":{"absolutePath":str(partial.resolve()),"bytes":partial.stat().st_size,"sha256":sha256(partial),"completeNativeDecode":partial.stat().st_size==declared},"killuaExactRamDump":{"absolutePath":str(exact.resolve()),"bytes":exact.stat().st_size,"sha256":sha256(exact),"declaredSizeDelta":declared-exact.stat().st_size},"killuaSrd":inspect_srd(model,srdi)},"result":{"standardizedModels":0,"completeNativeDecodes":0,"status":"structural-probe-complete-conversion-blocked","blockers":["$CH0 entropy stage has no verified implementation in audited public decoders","J-STARS PS3 mesh type 0x0702 vertex attributes and skin weights are not mapped","PS3 SRDV swizzle/texture formats and SKL bone transforms are not validated"],"nextExecutableStep":"implement mesh type 0x0702 vertex layout from the exact Killua SRD/SRDI pair, then verify skeleton weights and render before GLB emission"}}

def main()->None:
    p=argparse.ArgumentParser(description=__doc__); p.add_argument("--repo-root",type=Path,default=Path(__file__).resolve().parents[4]); p.add_argument("--output",type=Path,required=True); a=p.parse_args()
    report=build(a.repo_root.resolve()); a.output.parent.mkdir(parents=True,exist_ok=True); a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2,sort_keys=True)+"\n"); print(json.dumps({"vtx":len(report["samples"]["killuaSrd"]["vtx"]),"status":report["result"]["status"]}))
if __name__=="__main__": main()
