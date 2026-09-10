import fs from 'node:fs';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const repo=process.cwd(),out='/private/tmp/ggd-catalog-overlay-proof',root='/private/tmp/ggd-model-upload-acceptance/catalog-overlay-proof';
assert(!fs.existsSync(root+'/service-config-private.json'),'Existing services must be inspected, not restarted');
for(const port of [8092,8802,6392,60806,5208]) {
  let output='';try {output=execFileSync('lsof',['-t',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8'})}catch(error){assert.equal(error.status,1)}
  assert.equal(output.trim(),'','Port is already in use: '+port);
}
const existing=JSON.parse(fs.readFileSync('/private/tmp/ggd-model-upload-acceptance/service-config-private.json'));
assert.equal(existing.platform.env.DATA_DIR,'/private/tmp/ggd-model-upload-acceptance/data');
fs.mkdirSync(root+'/data',{recursive:true}); fs.mkdirSync(root+'/redis',{recursive:true});
for(const collection of ['accounts','content-overlay','curation']) fs.cpSync(join(existing.platform.env.DATA_DIR,collection),join(root,'data',collection),{recursive:true});
const original={};for(const file of fs.readdirSync(join(existing.platform.env.DATA_DIR,'hero-works'))) {const p=join(existing.platform.env.DATA_DIR,'hero-works',file);if(fs.statSync(p).isFile()) original[file]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
fs.writeFileSync(out+'/original-published-record-hashes.json',JSON.stringify(original,null,2));
const start=(name,bin,args,cwd,env)=>{const log=fs.openSync(out+'/'+name+'.log','a');const child=spawn(bin,args,{cwd,env:{...process.env,...env},detached:true,stdio:['ignore',log,log]});child.unref();return {pid:child.pid,env};};
const config={};
const secret=randomBytes(32).toString('hex');
config.redis=start('redis','/usr/local/bin/redis-server',['--bind','127.0.0.1','--port','6392','--dir',root+'/redis','--save','','--appendonly','no'],repo,{});
config.importer=start('importer',process.execPath,['--import','tsx','apps/content-api/src/heroImportIndex.ts'],repo,{...existing.importer.env,GGD_PLATFORM_URL:'http://127.0.0.1:8092',GGD_HERO_IMPORT_DIR:root+'/imports',GGD_BUILD_STAMP:'2b27b403-catalog-overlay-working-tree',GGD_HERO_IMPORT_SECRET:secret,HOST:'127.0.0.1',PORT:'8802'});
config.platform=start('platform',out+'/platform',[],repo,{...existing.platform.env,PLATFORM_ADDR:'127.0.0.1:8092',REDIS_ADDR:'127.0.0.1:6392',DATA_DIR:root+'/data',GGD_CONTENT_API_URL:'http://127.0.0.1:8802',GGD_HERO_IMPORT_SECRET:secret,GGD_SLACK_NOTIFY_ENABLED:'0',GGD_SLACK_WEBHOOK_URL:''});
config.admin=start('admin','/usr/local/bin/pnpm',['--filter','@ggd/admin','exec','vite','--host','127.0.0.1','--port','60806','--strictPort'],repo,{VITE_PLATFORM_API_URL:'http://127.0.0.1:8092',VITE_CONTENT_API_URL:'http://127.0.0.1:8810'});
config.client=start('client','/usr/local/bin/pnpm',['--filter','@ggd/client','exec','vite','--host','127.0.0.1','--port','5208','--strictPort'],repo,{VITE_PLATFORM_API_URL:'http://127.0.0.1:8092'});
fs.writeFileSync(root+'/service-config-private.json',JSON.stringify(config,null,2),{mode:0o600});
for(const url of ['http://127.0.0.1:8092/api/v1/healthz','http://127.0.0.1:8802/api/v1/content-import/active/target-profile','http://127.0.0.1:60806/','http://127.0.0.1:5208/']) {
  let ready=false;for(let i=0;i<120;i++){try{const response=await fetch(url);if(response.status===200||(url.includes(':8802/')&&response.status===401)){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,200));}assert(ready,'Service not ready: '+url);
}
fs.writeFileSync(out+'/services-public.json',JSON.stringify({root,pids:Object.fromEntries(Object.entries(config).map(([name,value])=>[name,value.pid])),ports:{platform:8092,importer:8802,redis:6392,admin:60806,client:5208},scope:'Separate localhost services seeded with existing disposable accounts, curation and overlay only. No hero publications, no original test data modifications.'},null,2));
console.log('Separate catalog acceptance services ready');
