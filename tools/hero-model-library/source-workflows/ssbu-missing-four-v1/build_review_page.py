#!/usr/bin/env python3
"""Build the local SSBU missing-four native-motion review page."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
AUDIT = REPO / "materials/hero-model-library/priority-evidence/ssbu-missing-four-v1/audit.json"
OUTPUT = REPO / "apps/client/public/ssbu-missing-four-motion-review.html"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def contract() -> dict:
    audit = json.loads(AUDIT.read_text())
    mario = next(row for row in audit["candidates"] if row["fighterId"] == "mario")
    require(mario["reviewEvidence"]["ready"] is True, "Mario review evidence is not ready")
    blocked = []
    seen = set()
    for row in audit["candidates"]:
        if row["fighterId"] == "mario" or row["fighterId"] in seen:
            continue
        seen.add(row["fighterId"])
        blocked.append({
            "fighterId": row["fighterId"],
            "nameZh": row["nameZh"].split("（")[0],
            "expectedPath": row["motionSourceSearch"]["ultimate14ExpectedBodyMotionDirectory"],
            "preciseGap": row["motionSourceSearch"]["preciseGap"],
        })
    return {
        "schema": "ggd.ssbu-missing-four-motion-review@1",
        "source": {"gitPath": str(AUDIT.relative_to(REPO)), "bytes": AUDIT.stat().st_size, "sha256": sha256(AUDIT)},
        "policy": {
            "decisionScope": "independent-native-motion-candidate-visual-review-only",
            "semanticMappingAllowed": False,
            "runtimeBindingAllowed": False,
            "defaultChangeAllowed": False,
        },
        "model": {
            "nameZh": mario["nameZh"],
            "componentId": mario["componentId"],
            "url": "/content/assets/models/community/" + mario["gitModel"]["sha256"] + ".glb",
            "sha256": mario["gitModel"]["sha256"],
            "clips": mario["nativeClipNames"],
            "reviewedImageCount": mario["reviewEvidence"]["reviewedImageCount"],
        },
        "blocked": blocked,
        "summary": {"playableModels": 1, "playableClips": 5, "blockedFighterGroups": 3, "runtimeBindingsChanged": 0},
    }


def render(data: dict) -> bytes:
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\u002f")
    html = r'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SSBU 四組原生動作審查</title>
<style>:root{--bg:#071019;--card:#111d2a;--line:#294158;--fg:#eef6ff;--dim:#a9b8c6;--accent:#66d9ef;--warn:#ffc66d;--ok:#8bd49c;--bad:#ff8b8b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}header{padding:14px 18px;border-bottom:1px solid var(--line)}main{max-width:1180px;margin:auto;padding:18px}.grid{display:grid;grid-template-columns:minmax(480px,2fr) minmax(280px,1fr);gap:14px}.card{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px}canvas{width:100%;aspect-ratio:16/10;background:#090d12;border-radius:8px}.buttons{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}button{border:1px solid var(--line);background:#182a3b;color:var(--fg);padding:7px 10px;border-radius:7px;cursor:pointer}button.active{border-color:var(--accent);color:var(--accent)}.warn{border:1px solid #8d692e;background:#2c2414;padding:10px 12px;border-radius:8px;color:#ffe2a6}.dim{color:var(--dim)}code{font-size:11px;word-break:break-all}li{margin:6px 0}@media(max-width:780px){.grid{grid-template-columns:1fr}}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script></head><body><header><h1>SSBU Mario／Mewtwo／Trainer／Steve・Alex 原生動作審查</h1><div class="dim" id="fingerprint"></div></header><main><p class="warn">此頁只核對獨立原生動作候選的播放外觀。核准不代表 idle／run／attack／cast／hurt／death 語意映射，也不會新增 model@1、改後台預設或建立 runtime 綁定。</p><div class="grid"><section class="card"><h2>Mario：5 段 Ultimate14 社群 MOD 原生特殊動作</h2><canvas id="view"></canvas><div id="clips" class="buttons"></div><div class="buttons"><button id="pause">暫停</button><button id="restart">從頭播放</button><button id="approve">視覺核准當前 clip</button><button id="reject">不核准當前 clip</button><button id="export">下載審查 JSON</button></div><pre id="status" class="dim"></pre></section><aside class="card"><h2>精確缺口</h2><ul id="blocked"></ul><p class="dim">NSandNS2 容器目前仍只有 metadata，payload bytes read = 0。</p></aside></div></main>
<script id="contract" type="application/json">__CONTRACT__</script><script type="module">import * as THREE from 'three';import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';const D=JSON.parse(document.getElementById('contract').textContent),cv=document.getElementById('view'),status=document.getElementById('status');document.getElementById('fingerprint').textContent='資料 SHA-256 '+D.source.sha256;document.getElementById('blocked').innerHTML=D.blocked.map(x=>`<li><b>${x.nameZh}</b><br><code>${x.expectedPath}</code><br><span class="dim">${x.preciseGap}</span></li>`).join('');const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));const scene=new THREE.Scene();scene.background=new THREE.Color(0x090d12);scene.add(new THREE.HemisphereLight(0xffffff,0x334455,2.5));const dl=new THREE.DirectionalLight(0xffffff,2.2);dl.position.set(3,5,4);scene.add(dl);const cam=new THREE.PerspectiveCamera(34,1,.01,500);let mixer,root,current=D.model.clips[0],paused=false,last=performance.now(),decisions={};function resize(){const w=cv.clientWidth,h=cv.clientHeight;if(cv.width!==w*devicePixelRatio||cv.height!==h*devicePixelRatio)renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}function frame(){if(!root)return;const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),ctr=box.getCenter(new THREE.Vector3()),m=Math.max(size.x,size.y,size.z)||1,dist=m/(2*Math.tan(THREE.MathUtils.degToRad(17)))*1.35;cam.position.set(ctr.x+dist*.45,ctr.y+m*.12,ctr.z+dist);cam.lookAt(ctr);cam.near=Math.max(dist/300,.01);cam.far=dist*30;cam.updateProjectionMatrix()}function play(name){current=name;mixer.stopAllAction();const clip=mixer._root.userData.clips.find(x=>x.name===name);mixer.clipAction(clip).reset().play();document.querySelectorAll('[data-clip]').forEach(b=>b.classList.toggle('active',b.dataset.clip===name));status.textContent=`${name}\n視覺收據：${D.model.reviewedImageCount}張 WebGL 抽幀\n裁決：${decisions[name]||'待審'}`}new GLTFLoader().load(D.model.url,g=>{root=g.scene;root.userData.clips=g.animations;scene.add(root);mixer=new THREE.AnimationMixer(root);for(const name of D.model.clips){const b=document.createElement('button');b.dataset.clip=name;b.textContent=name;b.onclick=()=>play(name);document.getElementById('clips').append(b)}play(current);animate()},undefined,e=>status.textContent='載入失敗：'+e.message);function animate(){requestAnimationFrame(animate);resize();const now=performance.now(),dt=Math.min((now-last)/1000,.1);last=now;if(!paused)mixer?.update(dt);frame();renderer.render(scene,cam)}document.getElementById('pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'繼續':'暫停'};document.getElementById('restart').onclick=()=>play(current);for(const [id,value] of [['approve','approve'],['reject','reject']])document.getElementById(id).onclick=()=>{decisions[current]=value;status.textContent=`${current}\n裁決：${value}\n不授權語意映射或 runtime 綁定`};document.getElementById('export').onclick=()=>{const rows=D.model.clips.map(clip=>({clip,decision:decisions[clip]||null,semanticMappingApproved:false,runtimeBindingAuthorized:false})),out={schema:'ggd.ssbu-missing-four-motion-review-decisions@1',sourceSha256:D.source.sha256,complete:rows.every(x=>x.decision),decisions:rows};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)+'\n'],{type:'application/json'}));a.download='ssbu-missing-four-motion-review-decision.json';a.click();URL.revokeObjectURL(a.href)};window.__ssbuMotionReview={contract:D,getDecisions:()=>structuredClone(decisions)};</script></body></html>'''
    return (html.replace("__CONTRACT__", encoded) + "\n").encode()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    output = render(contract())
    if args.write:
        OUTPUT.write_bytes(output)
    else:
        require(OUTPUT.is_file() and OUTPUT.read_bytes() == output, f"stale output: {OUTPUT.relative_to(REPO)}")
    print(json.dumps({"path": str(OUTPUT.relative_to(REPO)), "bytes": len(output), "sha256": hashlib.sha256(output).hexdigest()}))


if __name__ == "__main__":
    main()
