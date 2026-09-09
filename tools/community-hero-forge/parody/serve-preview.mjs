// Read-only loopback preview: frozen Editor bundles plus actual runtime assets.
// Vite preview alone does not mount nginx's /content/assets path.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {parseArgs} from 'node:util';
const {values:v}=parseArgs({options:{build:{type:'string'},assets:{type:'string'},port:{type:'string',default:'5202'}}});
if(!v.build||!v.assets)throw Error('--build <frozen editor dist> --assets <content/assets> required');
const build=fs.realpathSync(v.build),assets=fs.realpathSync(v.assets),port=Number(v.port);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.wasm':'application/wasm','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.woff2':'font/woff2'};
http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  const pathname=decodeURIComponent(url.pathname);
  const isAsset=pathname.startsWith('/content/assets/');
  if(!isAsset&&!pathname.startsWith('/editor/')){res.writeHead(404);res.end();return;}
  const root=isAsset?assets:build;
  let relative=pathname.slice(isAsset?'/content/assets/'.length:'/editor/'.length);
  if(!isAsset&&(!relative||!path.extname(relative)))relative='index.html';
  const candidate=path.resolve(root,relative);
  if(!candidate.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const file=fs.realpathSync(candidate);
  if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile()){res.writeHead(403);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Content-Length':fs.statSync(file).size,'Cache-Control':'no-store'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Read-only Editor preview: http://127.0.0.1:${port}/editor/hero-forge`));
