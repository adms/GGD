#!/usr/bin/env python3
"""Serve a loopback-only resumable upload page for locally supplied assets.

The portal never contacts AWS.  It streams chunks to disk, refuses unsafe paths
and oversize files, resumes by immutable browser file metadata, and records the
final absolute path plus SHA-256.  Its browser UI can inspect a user-selected
Steam library, retain only asset containers and loose media, and preserve each
game's relative paths in a separate intake collection.  Browser permission is
always explicit: a web page cannot silently inspect arbitrary local folders.
"""
import argparse
import hashlib
import json
import secrets
import shutil
import subprocess
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qs, urlparse


DEFAULT_MAX_BYTES = 10 * 1024 ** 3
CHUNK_LIMIT = 64 * 1024 ** 2
ROOT = Path(__file__).resolve().parents[3]
HTML = r'''<!doctype html><meta charset="utf-8"><title>GGD Steam 素材收件器</title>
<style>
body{font:16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:980px;margin:34px auto;padding:0 18px;color:#172033;background:#fafbfe}button,input{font:inherit}button{margin:6px 6px 6px 0;padding:9px 14px;border:0;border-radius:8px;background:#3457d5;color:white;cursor:pointer}button.secondary{background:#566173}section{background:white;border:1px solid #dfe4ee;border-radius:12px;padding:18px;margin:14px 0}progress{width:100%;height:22px}#gameFilter{box-sizing:border-box;width:100%;margin:12px 0 4px;padding:9px 11px;border:1px solid #cbd3e1;border-radius:8px}#games label{display:block;padding:10px 8px;border-bottom:1px solid #edf0f5}.game-title{font-weight:650}.badge{display:inline-block;margin-left:6px;padding:2px 7px;border-radius:999px;background:#e9efff;color:#2647ad;font-size:13px}.badge.priority{background:#fff0d6;color:#8a4b00}.badge.duplicate{background:#ffe3e3;color:#982323}.details{display:block;margin:4px 0 0 25px}.actions{margin-top:10px}#log{white-space:pre-wrap;background:#f4f6fa;padding:14px;border-radius:8px;min-height:96px;max-height:260px;overflow:auto}.muted{color:#5d6675}.warn{color:#a13b00}
</style>
<h1>GGD Steam 素材收件器</h1>
<p>檔案會直接寫入素材處理 Mac。每檔最多 10 GiB，支援續傳；完成後記錄相對路徑與 SHA-256。</p>
<section><h2>同網段的 Steam 電腦</h2><p class=muted>Windows 和素材處理 Mac 在同一個本地網路時，不用上傳整個遊戲庫。Windows GUI 會自動找到分散於各硬碟的 SteamLibrary，讓你勾選要列入的唯讀 share，並顯示使用狀態、速率與歷史 log。</p><a id=shareGui><button>下載 Windows GUI</button></a><a id=shareScript><button class=secondary>下載純指令設定檔</button></a><p class=muted>以系統管理員 PowerShell 執行 GUI。套用後把桌面的 <code>GGD-Steam-Shares.json</code> 用下方「手動選檔」上傳；只有這份小清單會經過公網。</p></section>
<section><h2>自動掃描 Steam</h2><p class=muted>每顆硬碟按一次「加入 Steam 遊戲庫」，選擇 Steam 根目錄、<code>steamapps</code>，或單一遊戲資料夾。頁面會把多個硬碟累加到同一份清單，只挑出模型、貼圖、動畫、特效與音訊容器，不上傳 EXE、DLL 或存檔。JUMP FORCE、KOF 與 Infinity Strash 會標成優先來源，其他遊戲仍全部保留可選。</p>
<input id=steamFolder type=file webkitdirectory multiple hidden><button id=scan>加入 Steam 遊戲庫</button><span class=muted>多個硬碟請逐一加入；同一頁面不要重複選同一個庫。</span><input id=gameFilter placeholder="搜尋遊戲名、App ID、資料夾或硬碟…" style="display:none"><div id=scanSummary class=muted></div><div id=games></div><div class=actions><button id=selectAll class=secondary style="display:none">全選</button><button id=selectPriority class=secondary style="display:none">只選優先來源</button><button id=uploadGames style="display:none">上傳勾選遊戲的素材</button></div></section>
<section><h2>手動選檔</h2><input id=file type=file multiple><br><button id=start class=secondary>開始／續傳選取檔案</button></section>
<progress id=p value=0 max=1></progress><div id=status class=muted>尚未上傳。</div><pre id=log>請選擇 Steam 資料庫或個別檔案。</pre>
<script>
const qs=new URLSearchParams(location.search),token=qs.get('token'),esc=s=>encodeURIComponent(s),chunk=16*1024*1024;
document.querySelector('#shareScript').href='/windows-steam-share.ps1?token='+esc(token||'');
document.querySelector('#shareGui').href='/windows-steam-bridge-gui.ps1?token='+esc(token||'');
const log=x=>{let e=document.querySelector('#log');e.textContent+=(e.textContent?'\n':'')+x;e.scrollTop=e.scrollHeight};
const status=x=>document.querySelector('#status').textContent=x;
const fmt=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KiB':n<1073741824?(n/1048576).toFixed(1)+' MiB':(n/1073741824).toFixed(2)+' GiB';
async function api(path,init={}){let u=path+(path.includes('?')?'&':'?')+'token='+esc(token);let r=await fetch(u,init),d=await r.json().catch(()=>({error:r.statusText}));if(!r.ok)throw new Error(d.error||r.statusText);return d}
const assetExt=new Set(['.pak','.utoc','.ucas','.sig','.vpk','.uasset','.uexp','.ubulk','.uptnl','.assets','.ress','.resource','.bundle','.unity3d','.bnk','.wem','.pck','.cpk','.awb','.acb','.fsb','.bank','.arc','.gar','.g1m','.g1t','.mdl','.vvd','.vtx','.phy','.ani','.bsp','.fbx','.dae','.obj','.gltf','.glb','.dds','.png','.tga','.bmp','.jpg','.jpeg','.wav','.ogg','.mp3','.flac','.wem','.nus3audio']);
const specialNames=new Set(['globalgamemanagers','globalgamemanagers.assets','resources.assets','resources.resource','data.unity3d']);
function candidate(path){let name=path.split('/').pop().toLowerCase(),dot=name.lastIndexOf('.'),ext=dot>=0?name.slice(dot):'';return assetExt.has(ext)||specialNames.has(name)||/^sharedassets\d+\.(assets|resource|ress)$/.test(name)||/^level\d+$/.test(name)}
function slug(s){let x=s.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,'');return x.slice(0,80)||'unknown'}
function sourcePriority(name){let x=name.replace(/[_-]+/g,' ');return /(jump\s*force|jump.*大亂鬥|the\s*king\s*of\s*fighters|\bkof(?:\s*(?:xiv|xv|mi|13|14|15))?\b|infinity\s*strash|達伊的大冒險)/i.test(x)}
function assetKinds(files){let found=new Set();for(const row of files){let p=row.relativePath.toLowerCase(),n=p.split('/').pop(),dot=n.lastIndexOf('.'),x=dot>=0?n.slice(dot):'';if(['.pak','.utoc','.ucas','.sig','.uasset','.uexp','.ubulk','.uptnl'].includes(x))found.add('Unreal');else if(['.assets','.ress','.resource','.bundle','.unity3d'].includes(x)||specialNames.has(n))found.add('Unity');else if(['.bnk','.wem','.pck','.cpk','.awb','.acb','.fsb','.bank','.nus3audio'].includes(x))found.add('音訊');else if(['.fbx','.dae','.obj','.gltf','.glb','.mdl','.g1m'].includes(x))found.add('模型');else if(['.dds','.png','.tga','.bmp','.jpg','.jpeg','.g1t'].includes(x))found.add('貼圖');else found.add('其他容器')}return [...found]}
let steamGroups=[],scanNumber=0;
function duplicateKey(g){return g.manifest?.id?`app:${g.manifest.id}:build:${g.manifest.buildId||'unknown'}`:`dir:${g.dir.toLowerCase()}`}
function renderGames(){let box=document.querySelector('#games'),filter=document.querySelector('#gameFilter').value.trim().toLowerCase(),seen=new Map();box.textContent='';for(const g of steamGroups)seen.set(duplicateKey(g),(seen.get(duplicateKey(g))||0)+1);let shown=0;steamGroups.forEach((g,i)=>{let hay=[g.manifest?.name,g.manifest?.id,g.dir,g.libraryLabel,...g.kinds].filter(Boolean).join(' ').toLowerCase();if(filter&&!hay.includes(filter))return;shown++;let l=document.createElement('label'),check=document.createElement('input'),title=document.createElement('span'),drive=document.createElement('span'),details=document.createElement('span');check.type='checkbox';check.dataset.index=String(i);check.checked=g.selected!==false;check.onchange=()=>g.selected=check.checked;title.className='game-title';title.textContent=' '+(g.manifest?.name||g.dir);drive.className='muted';drive.textContent=` (${g.libraryLabel})`;details.className='details muted';let version=g.manifest?.buildId?`版本 build ${g.manifest.buildId}，`:'';details.textContent=`${version}${g.files.length.toLocaleString()} 個候選素材檔，${fmt(g.bytes)}；${g.kinds.join('、')||'未分類'}`;l.append(check,title,drive);if(g.priority){let badge=document.createElement('span');badge.className='badge priority';badge.textContent='優先來源';l.appendChild(badge)}if(seen.get(duplicateKey(g))>1){let badge=document.createElement('span');badge.className='badge duplicate';badge.textContent='可能重複安裝';l.appendChild(badge)}for(const kind of g.kinds){let badge=document.createElement('span');badge.className='badge';badge.textContent=kind;l.appendChild(badge)}l.appendChild(details);box.appendChild(l)});document.querySelector('#scanSummary').textContent=steamGroups.length?`已累加 ${steamGroups.length} 個遊戲，顯示 ${shown} 個；${steamGroups.reduce((n,g)=>n+g.files.length,0).toLocaleString()} 個候選檔，總計 ${fmt(steamGroups.reduce((n,g)=>n+g.bytes,0))}。`:'';for(const id of ['uploadGames','selectAll','selectPriority','gameFilter'])document.querySelector('#'+id).style.display=steamGroups.length?(id==='gameFilter'?'block':'inline-block'):'none'}
async function scanSteam(files){let manifests=new Map(),libraryId='library-'+(++scanNumber),first=(files[0]?.webkitRelativePath||'選取資料夾').replace(/\\/g,'/'),libraryRoot=first.split('/')[0]||libraryId,libraryLabel=`${libraryRoot} #${scanNumber}`;status(`正在掃描 ${libraryLabel}：${files.length.toLocaleString()} 個檔案項目…`);for(const f of files){let p=(f.webkitRelativePath||f.name).replace(/\\/g,'/');if(/\/appmanifest_\d+\.acf$/i.test('/'+p)&&f.size<2*1024*1024){try{let t=await f.text(),id=(p.match(/appmanifest_(\d+)\.acf/i)||[])[1],dir=(t.match(/"installdir"\s+"([^"]+)"/i)||[])[1],name=(t.match(/"name"\s+"([^"]+)"/i)||[])[1],buildId=(t.match(/"buildid"\s+"([^"]+)"/i)||[])[1],lastUpdated=(t.match(/"LastUpdated"\s+"([^"]+)"/i)||[])[1];if(dir)manifests.set(dir.toLowerCase(),{id,name:name||dir,buildId:buildId||null,lastUpdated:lastUpdated||null,file:f,path:p})}catch(_){}}}
let groups=new Map();for(const f of files){let full=(f.webkitRelativePath||f.name).replace(/\\/g,'/'),parts=full.split('/'),common=parts.findIndex((x,i)=>x.toLowerCase()==='common'&&i&&parts[i-1].toLowerCase()==='steamapps');let game,rel;if(common>=0&&parts[common+1]){game=parts[common+1];rel=parts.slice(common+2).join('/')}else if(!parts.some(x=>x.toLowerCase()==='steamapps')){game=parts[0]||'selected-game';rel=parts.slice(1).join('/')||f.name}else continue;if(!candidate(rel))continue;let g=groups.get(game)||{dir:game,manifest:manifests.get(game.toLowerCase()),files:[],bytes:0};g.files.push({file:f,relativePath:rel});g.bytes+=f.size;groups.set(game,g)}
let added=[...groups.values()];for(const g of added){g.libraryId=libraryId;g.libraryLabel=libraryLabel;g.kinds=assetKinds(g.files);g.priority=sourcePriority((g.manifest?.name||'')+' '+g.dir);g.selected=true;if(g.manifest){g.files.unshift({file:g.manifest.file,relativePath:'steamapps/appmanifest_'+g.manifest.id+'.acf'});g.bytes+=g.manifest.file.size}}added.sort((a,b)=>Number(b.priority)-Number(a.priority)||(a.manifest?.name||a.dir).localeCompare(b.manifest?.name||b.dir));steamGroups.push(...added);renderGames();status(`${libraryLabel}：掃描完成，上傳前可再檢查勾選。`);if(!added.length)log(`${libraryLabel}：沒有找到可辨識的素材容器，可改選單一遊戲資料夾。`);else log(`${libraryLabel}：加入 ${added.length} 個遊戲、${added.reduce((n,g)=>n+g.files.length,0)} 個候選素材檔；其中 ${added.filter(g=>g.priority).length} 個優先來源。`)}
document.querySelector('#scan').onclick=()=>document.querySelector('#steamFolder').click();document.querySelector('#steamFolder').onchange=e=>{let files=[...e.target.files];scanSteam(files).catch(x=>log('掃描失敗：'+x.message));e.target.value=''};
document.querySelector('#gameFilter').oninput=renderGames;
document.querySelector('#selectAll').onclick=()=>{for(const g of steamGroups)g.selected=true;renderGames()};
document.querySelector('#selectPriority').onclick=()=>{for(const g of steamGroups)g.selected=g.priority;renderGames()};
async function uploadOne(f,extra={}){let meta=await api('/api/init',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name,size:f.size,lastModified:f.lastModified,...extra})}),off=meta.received;log(`${extra.relativePath||f.name}: 從 ${fmt(off)} / ${fmt(f.size)} 開始`);while(off<f.size){let end=Math.min(off+chunk,f.size),b=f.slice(off,end),r=await fetch('/api/chunk?token='+esc(token)+'&id='+esc(meta.id),{method:'PUT',headers:{'X-Upload-Offset':String(off)},body:b}),d=await r.json().catch(()=>({error:r.statusText}));if(!r.ok)throw new Error(d.error||r.statusText);off=d.received;document.querySelector('#p').max=f.size||1;document.querySelector('#p').value=off;status(`${extra.relativePath||f.name}：${Math.floor(100*off/Math.max(1,f.size))}%`)}let done=await api('/api/finalize?id='+esc(meta.id),{method:'POST'});log(`完成：${extra.relativePath||f.name}\nSHA-256：${done.sha256}`);return {id:meta.id,receipt:done}}
document.querySelector('#start').onclick=async()=>{let files=[...document.querySelector('#file').files];if(!token)return log('網址缺少 token。');if(!files.length)return log('尚未選擇檔案。');try{for(const f of files)await uploadOne(f);status('手動選取檔案已全部上傳。')}catch(e){log('上傳失敗：'+e.message);status('可按同一按鈕續傳。')}};
document.querySelector('#uploadGames').onclick=async()=>{if(!token)return log('網址缺少 token。');document.querySelectorAll('#games input').forEach(e=>steamGroups[Number(e.dataset.index)].selected=e.checked);let chosen=steamGroups.filter(g=>g.selected);if(!chosen.length)return log('尚未勾選遊戲。');try{for(const g of chosen){let collection='steam-'+(g.manifest?.id||'unknown')+'-'+slug(g.dir)+'-'+g.libraryId,uploads=[];log(`開始 ${g.manifest?.name||g.dir} (${g.libraryLabel})：${g.files.length} 檔`);for(const row of g.files){let done=await uploadOne(row.file,{collection,relativePath:row.relativePath});uploads.push(done.id)}let result=await api('/api/collection/finalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection,libraryLabel:g.libraryLabel,gameName:g.manifest?.name||g.dir,appId:g.manifest?.id||null,installDir:g.dir,buildId:g.manifest?.buildId||null,manifestLastUpdated:g.manifest?.lastUpdated||null,prioritySource:g.priority,detectedAssetKinds:g.kinds,uploads})});log(`遊戲 intake 完成：${result.manifestPath}`)}status('勾選遊戲的素材已全部上傳並建立 intake。')}catch(e){log('上傳失敗：'+e.message);status('可重新按按鈕續傳。')}};
</script>'''


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


class Portal:
    def __init__(self, output, token, max_bytes, postprocess=True):
        self.output = Path(output).resolve()
        self.parts = self.output / '.partial'
        self.receipts = self.output / 'receipts'
        self.collections = self.output / 'steam-intakes'
        self.token, self.max_bytes = token, max_bytes
        self.postprocess = postprocess
        for path in (self.output, self.parts, self.receipts, self.collections): path.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def safe_name(name):
        name = Path(name).name
        if not name or name in {'.', '..'} or '\x00' in name:
            raise ValueError('Invalid file name')
        return name

    @staticmethod
    def safe_component(value):
        value = str(value).strip()
        if not value or value in {'.', '..'} or any(mark in value for mark in ('/', '\\', '\x00', ':')):
            raise ValueError('Invalid collection name')
        return value

    @staticmethod
    def safe_relative(value):
        value = str(value).replace('\\', '/')
        path = PurePosixPath(value)
        if not value or path.is_absolute() or any(part in {'', '.', '..'} for part in path.parts) or '\x00' in value or ':' in value:
            raise ValueError('Invalid relative path')
        return str(path)

    def state_path(self, upload_id): return self.parts / (upload_id + '.json')
    def receipt_path(self, upload_id): return self.receipts / (upload_id + '.json')
    def read_state(self, upload_id):
        if len(upload_id) != 64 or any(c not in '0123456789abcdef' for c in upload_id): raise ValueError('Invalid upload ID')
        path = self.state_path(upload_id)
        if not path.is_file(): raise ValueError('Unknown upload ID')
        return json.loads(path.read_text())
    def write_state(self, state): self.state_path(state['id']).write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')

    def init(self, data):
        name, size, modified = self.safe_name(str(data.get('name', ''))), data.get('size'), data.get('lastModified')
        collection, relative = data.get('collection'), data.get('relativePath')
        if (collection is None) != (relative is None):
            raise ValueError('Collection and relative path must be supplied together')
        if collection is not None:
            collection, relative = self.safe_component(collection), self.safe_relative(relative)
            if PurePosixPath(relative).name != name:
                raise ValueError('Relative path filename differs from browser filename')
        if not isinstance(size, int) or not isinstance(modified, int) or not 0 <= size <= self.max_bytes: raise ValueError('Invalid file size')
        upload_id = hashlib.sha256(f'{collection or ""}\0{relative or name}\0{size}\0{modified}'.encode()).hexdigest()
        part = self.parts / (upload_id + '.part')
        receipt_path = self.receipt_path(upload_id)
        if receipt_path.is_file():
            receipt = json.loads(receipt_path.read_text())
            target = Path(receipt['absolutePath'])
            if (receipt.get('name'), receipt.get('bytes'), receipt.get('collection'), receipt.get('relativePath')) != (name, size, collection, relative):
                raise ValueError('Completed upload metadata collision')
            if not target.is_file() or target.stat().st_size != size:
                raise ValueError('Completed upload changed outside portal')
            return {'id': upload_id, 'name': name, 'size': size, 'lastModified': modified,
                    'collection': collection, 'relativePath': relative, 'received': size, 'complete': True}
        if self.state_path(upload_id).is_file():
            state = self.read_state(upload_id)
            expected = (name, size, modified, collection, relative)
            actual_meta = (state['name'], state['size'], state['lastModified'], state.get('collection'), state.get('relativePath'))
            if actual_meta != expected: raise ValueError('Upload metadata collision')
            actual = part.stat().st_size if part.exists() else 0
            if actual != state['received']: raise ValueError('Partial upload changed outside portal')
            return state
        state = {'id': upload_id, 'name': name, 'size': size, 'lastModified': modified,
                 'collection': collection, 'relativePath': relative, 'received': 0, 'createdAt': time.time()}
        part.touch(exist_ok=False); self.write_state(state); return state

    def append(self, upload_id, offset, stream, length):
        state = self.read_state(upload_id)
        if not isinstance(offset, int) or offset != state['received']: raise ValueError('Chunk offset does not match saved upload state')
        if not 0 <= length <= CHUNK_LIMIT or offset + length > state['size']: raise ValueError('Invalid chunk size')
        part = self.parts / (upload_id + '.part')
        left = length
        with part.open('r+b') as dest:
            dest.seek(offset)
            while left:
                block = stream.read(min(left, 1024 * 1024))
                if not block: raise ValueError('Unexpected end of upload body')
                dest.write(block); left -= len(block)
        if part.stat().st_size != offset + length: raise ValueError('Partial file length mismatch')
        state['received'] += length; state['updatedAt'] = time.time(); self.write_state(state); return state

    def finalize(self, upload_id):
        receipt_path = self.receipt_path(upload_id)
        if receipt_path.is_file() and not self.state_path(upload_id).is_file():
            receipt = json.loads(receipt_path.read_text())
            target = Path(receipt['absolutePath'])
            if not target.is_file() or target.stat().st_size != receipt['bytes']:
                raise ValueError('Completed upload changed outside portal')
            return {**receipt, 'receiptPath': str(receipt_path)}
        state = self.read_state(upload_id)
        part = self.parts / (upload_id + '.part')
        if state['received'] != state['size'] or part.stat().st_size != state['size']: raise ValueError('Upload is incomplete')
        target = (self.collections / state['collection'] / 'files' / state['relativePath']
                  if state.get('collection') else self.output / state['name'])
        if target.exists(): raise ValueError('Destination already exists; choose a different file name')
        target.parent.mkdir(parents=True, exist_ok=True)
        checksum = sha256(part)
        part.rename(target)
        receipt = {'schema': 'ggd-local-upload-receipt@1', 'uploadId': state['id'], 'name': state['name'],
                   'collection': state.get('collection'), 'relativePath': state.get('relativePath'),
                   'bytes': state['size'], 'sha256': checksum,
                   'absolutePath': str(target), 'receivedAt': time.time(), 'transfer': 'loopback-resumable-upload',
                   's3Uploaded': False, 'sourceRegistration': 'pending-intake-validation'}
        receipt_path = self.receipt_path(state['id'])
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
        self.state_path(upload_id).unlink(); return {**receipt, 'receiptPath': str(receipt_path)}

    @staticmethod
    def family(path):
        suffix = Path(path).suffix.lower()
        if suffix in {'.pak', '.utoc', '.ucas', '.uasset', '.uexp', '.ubulk', '.uptnl'}: return 'unreal'
        if suffix in {'.assets', '.ress', '.resource', '.bundle', '.unity3d'}: return 'unity'
        if suffix in {'.vpk', '.mdl', '.vvd', '.vtx', '.phy', '.bsp'}: return 'source'
        if suffix in {'.bnk', '.wem', '.pck', '.fsb', '.bank', '.awb', '.acb'}: return 'audio-container'
        if suffix in {'.fbx', '.dae', '.obj', '.gltf', '.glb'}: return 'loose-model'
        if suffix in {'.dds', '.png', '.tga', '.bmp', '.jpg', '.jpeg'}: return 'loose-texture'
        if suffix in {'.wav', '.ogg', '.mp3', '.flac', '.nus3audio'}: return 'loose-audio'
        return 'other-asset-container'

    def finalize_collection(self, data):
        collection = self.safe_component(data.get('collection', ''))
        upload_ids = data.get('uploads')
        detected_kinds = data.get('detectedAssetKinds', [])
        if not isinstance(detected_kinds, list) or len(detected_kinds) > 32 or not all(
                isinstance(value, str) and 0 < len(value) <= 80 for value in detected_kinds):
            raise ValueError('Invalid detected asset kinds')
        if not isinstance(data.get('prioritySource', False), bool):
            raise ValueError('Invalid priority source flag')
        if not isinstance(upload_ids, list) or not upload_ids or len(upload_ids) > 200000:
            raise ValueError('Invalid collection upload list')
        if len(upload_ids) != len(set(upload_ids)):
            raise ValueError('Duplicate upload ID in collection')
        receipts = []
        for upload_id in upload_ids:
            if not isinstance(upload_id, str) or len(upload_id) != 64 or any(c not in '0123456789abcdef' for c in upload_id):
                raise ValueError('Invalid upload ID in collection')
            path = self.receipts / (upload_id + '.json')
            if not path.is_file():
                raise ValueError('Collection contains an unfinished upload')
            receipt = json.loads(path.read_text())
            if receipt.get('uploadId') != upload_id or receipt.get('collection') != collection:
                raise ValueError('Upload receipt does not belong to collection')
            receipts.append(receipt)
        records = sorted(({'relativePath': row['relativePath'], 'absolutePath': row['absolutePath'],
                           'bytes': row['bytes'], 'sha256': row['sha256'],
                           'assetFamily': self.family(row['relativePath'])} for row in receipts),
                         key=lambda row: row['relativePath'])
        manifest_path = self.collections / collection / 'steam-library-intake.json'
        if manifest_path.exists():
            prior = json.loads(manifest_path.read_text())
            if prior.get('uploadIds') != upload_ids:
                raise ValueError('Collection manifest already exists with different uploads')
            return {'manifestPath': str(manifest_path), 'fileCount': len(prior['files']),
                    'postProcessing': prior.get('postProcessing')}
        families = {}
        for row in records: families[row['assetFamily']] = families.get(row['assetFamily'], 0) + 1
        document = {'schema': 'ggd-steam-library-intake@1', 'collection': collection,
                    'sourcePlatform': 'user-selected Steam library', 'browserFolderPermissionExplicit': True,
                    'libraryLabel': str(data.get('libraryLabel') or ''), 'gameName': str(data.get('gameName') or ''),
                    'appId': str(data['appId']) if data.get('appId') else None,
                    'buildId': str(data['buildId']) if data.get('buildId') else None,
                    'manifestLastUpdated': str(data['manifestLastUpdated']) if data.get('manifestLastUpdated') else None,
                    'prioritySource': bool(data.get('prioritySource')),
                    'detectedAssetKinds': sorted(set(detected_kinds)),
                    'installDir': str(data.get('installDir') or ''), 'createdAt': time.time(),
                    'uploadIds': upload_ids, 'fileCount': len(records), 'bytes': sum(row['bytes'] for row in records),
                    'assetFamilyCounts': families, 'files': records,
                    'postProcessing': {'state': 'queued', 'safeStaticOnly': True,
                                       'nativeGameOrModCodeExecution': False,
                                       'completeAssetExtractionClaimed': False}}
        manifest_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
        if self.postprocess:
            threading.Thread(target=self.process_collection, args=(manifest_path,), daemon=True).start()
        return {'manifestPath': str(manifest_path), 'fileCount': len(records), 'postProcessing': document['postProcessing']}

    def process_collection(self, manifest_path):
        document = json.loads(manifest_path.read_text())
        document['postProcessing'] = {'state': 'running', 'safeStaticOnly': True,
                                      'nativeGameOrModCodeExecution': False,
                                      'completeAssetExtractionClaimed': False, 'startedAt': time.time()}
        manifest_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
        results = []
        unpacker = Path(__file__).with_name('unpack_plain_unreal_pak.py')
        analysis = manifest_path.parent / 'analysis'
        analysis.mkdir(exist_ok=True)
        for index, row in enumerate(document['files']):
            source = Path(row['absolutePath'])
            suffix = source.suffix.lower()
            try:
                if row['assetFamily'].startswith('loose-'):
                    result = {'relativePath': row['relativePath'], 'state': 'loose-asset-ready-for-standardization'}
                elif suffix == '.pak' and row['bytes'] <= 100_000_000:
                    output = analysis / ('pak-' + str(index).zfill(5))
                    run = subprocess.run(['python3', str(unpacker), str(source), str(output)], text=True,
                                         capture_output=True, timeout=900)
                    result = {'relativePath': row['relativePath'],
                              'state': 'safe-plain-pak-extracted' if run.returncode == 0 else 'pak-preserved-extractor-rejected',
                              'output': str(output) if run.returncode == 0 else None,
                              'diagnostic': (run.stdout + run.stderr)[-4000:]}
                elif suffix == '.pak':
                    result = {'relativePath': row['relativePath'], 'state': 'large-pak-preserved-requires-compatible-toolchain'}
                elif suffix in {'.utoc', '.ucas'}:
                    result = {'relativePath': row['relativePath'], 'state': 'iostore-sidecar-preserved-requires-matched-toolchain'}
                elif suffix == '.vpk':
                    result = {'relativePath': row['relativePath'], 'state': 'vpk-preserved-requires-vrf-or-source-toolchain'}
                elif row['assetFamily'] == 'audio-container':
                    result = {'relativePath': row['relativePath'], 'state': 'audio-container-preserved-requires-format-decoder'}
                else:
                    result = {'relativePath': row['relativePath'], 'state': 'preserved-awaiting-format-specific-extractor'}
            except (OSError, subprocess.SubprocessError) as error:
                result = {'relativePath': row['relativePath'], 'state': 'post-processing-error',
                          'diagnostic': str(error)[:4000]}
            results.append(result)
        document['postProcessing'] = {'state': 'finished-with-gaps' if any('requires' in row['state'] or 'rejected' in row['state'] for row in results) else 'finished',
                                      'safeStaticOnly': True, 'nativeGameOrModCodeExecution': False,
                                      'completeAssetExtractionClaimed': False, 'results': results,
                                      'finishedAt': time.time()}
        manifest_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')

    def resume_postprocessing(self):
        if not self.postprocess:
            return
        for manifest_path in self.collections.glob('*/steam-library-intake.json'):
            try:
                state = json.loads(manifest_path.read_text()).get('postProcessing', {}).get('state')
            except (OSError, ValueError, json.JSONDecodeError):
                continue
            if state in {'queued', 'running'}:
                threading.Thread(target=self.process_collection, args=(manifest_path,), daemon=True).start()


def handler(portal):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args): print('%s - %s' % (self.address_string(), fmt % args), flush=True)
        def reply(self, code, data):
            blob = json.dumps(data, ensure_ascii=False).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(blob))); self.end_headers(); self.wfile.write(blob)
        def authorized(self): return parse_qs(urlparse(self.path).query).get('token', [''])[0] == portal.token
        def json_body(self):
            size = int(self.headers.get('Content-Length', '0'))
            if size > 65536: raise ValueError('Metadata body too large')
            return json.loads(self.rfile.read(size))
        def do_GET(self):
            if not self.authorized(): return self.reply(HTTPStatus.FORBIDDEN, {'error': 'Invalid token'})
            if urlparse(self.path).path == '/windows-steam-share.ps1':
                path = Path(__file__).with_name('steam-library-bridge') / 'setup_windows_steam_shares.ps1'
                blob = path.read_bytes(); self.send_response(HTTPStatus.OK)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Content-Disposition', 'attachment; filename="setup_windows_steam_shares.ps1"')
                self.send_header('Content-Length', str(len(blob))); self.end_headers(); self.wfile.write(blob); return
            if urlparse(self.path).path == '/windows-steam-bridge-gui.ps1':
                path = Path(__file__).with_name('steam-library-bridge') / 'steam_bridge_gui.ps1'
                blob = path.read_bytes(); self.send_response(HTTPStatus.OK)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Content-Disposition', 'attachment; filename="steam_bridge_gui.ps1"')
                self.send_header('Content-Length', str(len(blob))); self.end_headers(); self.wfile.write(blob); return
            if urlparse(self.path).path != '/': return self.reply(HTTPStatus.NOT_FOUND, {'error': 'Not found'})
            blob = HTML.encode(); self.send_response(HTTPStatus.OK); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(blob))); self.end_headers(); self.wfile.write(blob)
        def do_POST(self):
            try:
                if not self.authorized(): return self.reply(HTTPStatus.FORBIDDEN, {'error': 'Invalid token'})
                path, query = urlparse(self.path).path, parse_qs(urlparse(self.path).query)
                if path == '/api/init': return self.reply(HTTPStatus.OK, portal.init(self.json_body()))
                if path == '/api/finalize': return self.reply(HTTPStatus.OK, portal.finalize(query.get('id', [''])[0]))
                if path == '/api/collection/finalize': return self.reply(HTTPStatus.OK, portal.finalize_collection(self.json_body()))
                return self.reply(HTTPStatus.NOT_FOUND, {'error': 'Not found'})
            except (ValueError, json.JSONDecodeError) as e: return self.reply(HTTPStatus.BAD_REQUEST, {'error': str(e)})
        def do_PUT(self):
            try:
                if not self.authorized(): return self.reply(HTTPStatus.FORBIDDEN, {'error': 'Invalid token'})
                query = parse_qs(urlparse(self.path).query)
                if urlparse(self.path).path != '/api/chunk': return self.reply(HTTPStatus.NOT_FOUND, {'error': 'Not found'})
                state = portal.append(query.get('id', [''])[0], int(self.headers.get('X-Upload-Offset', '')), self.rfile, int(self.headers.get('Content-Length', '')))
                return self.reply(HTTPStatus.OK, {'received': state['received'], 'size': state['size']})
            except (ValueError, json.JSONDecodeError) as e: return self.reply(HTTPStatus.BAD_REQUEST, {'error': str(e)})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'GGD-Asset-Library/incoming/user-uploads')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--max-bytes', type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument('--token', help='Reuse an existing token when restarting a temporary tunnel endpoint.')
    args = parser.parse_args()
    token = args.token or secrets.token_urlsafe(32); portal = Portal(args.output, token, args.max_bytes)
    portal.resume_postprocessing()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler(portal))
    print('GGD local upload portal:', f'http://127.0.0.1:{args.port}/?token={token}', flush=True)
    print('Destination:', portal.output, 'max bytes per file:', portal.max_bytes, flush=True)
    server.serve_forever()


if __name__ == '__main__': main()
