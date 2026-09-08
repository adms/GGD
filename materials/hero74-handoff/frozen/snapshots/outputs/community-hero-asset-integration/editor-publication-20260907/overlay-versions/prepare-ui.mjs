import {readFileSync,writeFileSync,cpSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {connect} from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
const root='/private/tmp/ggd-overlay-durable-versions';
const base='http://127.0.0.1:8091/api/v1';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'model-reviewer',password:'REDACTED_TEST_PASSWORD'})});assert.equal(login.status,200);
const account=await login.json();
const get=async(path)=>{const r=await fetch(base+path,{headers:{authorization:'Bearer '+account.tokens.accessToken}});assert.equal(r.status,200,path);return r.json()};
const [versions,published,shipped,bundle]=await Promise.all([get('/content-overlay/versions'),get('/hero-works/published'),get('/content-overlay/shipped/champions/sela'),get('/content-overlay/bundle')]);
assert.equal(bundle.generation,7);assert(!bundle.docs['champions/sela']);assert(versions.entries[0].current);
writeFileSync(root+'/ui-before.json',JSON.stringify({versions,published,shipped,bundle},null,2));
cpSync('/private/tmp/ggd-model-upload-acceptance/data/content-overlay',root+'/overlay-before',{recursive:true,errorOnExist:true,force:false});
const c=await connect('B57C2967AF51E696AF49E2A8F7AF6FB4');
await c.evaluate(`(()=>{const input=document.querySelector('input[placeholder="doc id（例：godie-e001.q）"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'sela');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await c.evaluate(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='載入出貨版').click()`);
for(let i=0;i<80;i++){const v=await c.evaluate(`document.querySelector('textarea')?.value||''`);try{const doc=JSON.parse(v);if(doc.id==='sela'){writeFileSync(root+'/sela-form-before.json',JSON.stringify(doc,null,2));console.log(JSON.stringify(doc));break}}catch{}await new Promise(r=>setTimeout(r,150));if(i===79)throw Error('Shipped hero did not load');}
c.close();
