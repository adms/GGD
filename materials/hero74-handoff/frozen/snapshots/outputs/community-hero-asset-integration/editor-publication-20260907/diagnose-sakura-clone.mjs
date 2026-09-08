import {connect} from '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';import {writeFile} from 'node:fs/promises';
const c=await connect('02B883304E6A5424B24704EA5CAAB195'),wait=ms=>new Promise(r=>setTimeout(r,ms));const exceptions=[];let stop=false,cursor=0;
await c.call('Debugger.enable');await c.call('Debugger.setPauseOnExceptions',{state:'all'});
const monitor=(async()=>{while(!stop){while(cursor<c.events.length){const e=c.events[cursor++];if(e.method==='Debugger.paused'){
const data=e.params.data?.description??'';if(data.includes('clone')){const f=e.params.callFrames[0];const local=f?.scopeChain.find(s=>s.type==='local');const props=local?await c.call('Runtime.getProperties',{objectId:local.object.objectId,ownProperties:true}):null;const detail=await c.call('Debugger.evaluateOnCallFrame',{callFrameId:f.callFrameId,expression:'({targetName:target.name,targetPath:this._targetPath,original:destination[this._targetPath],animationName:this._animation?.name,parent:destination.parent?.name})',returnByValue:true});exceptions.push({detail:detail.result?.value,description:data,frames:e.params.callFrames.map(f=>({functionName:f.functionName,url:f.url,location:f.location})),locals:props?.result?.map(x=>({name:x.name,type:x.value?.type,subtype:x.value?.subtype,description:x.value?.description,value:x.value?.value}))});}
await c.call('Debugger.resume');}}await wait(100);}})();
try{
await c.call('Page.navigate',{url:'http://127.0.0.1:5201/editor/hero-forge'});
for(let i=0;i<180;i++){if(await c.evaluate(`[...document.querySelectorAll('button')].some(e=>e.innerText==='我的作品')`))break;await wait(300);}
await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText==='我的作品').click()`);await wait(900);await c.evaluate(`[...document.querySelectorAll('h2')].find(e=>e.innerText==='庫洛魔法使').parentElement.querySelector('button').click()`);
for(let i=0;i<180;i++){const t=await c.evaluate(`document.querySelector('.vfx-actor-status')?.innerText??''`);if(t.includes('clone')||exceptions.length){await wait(2000);break;}await wait(300);}
await writeFile('/private/tmp/ggd-community37-editor-publish/27/author-preview/clone-target-exception.json',JSON.stringify(exceptions,null,2)+'\n');console.log(JSON.stringify(exceptions,null,2));
}finally{stop=true;await monitor;await c.call('Debugger.setPauseOnExceptions',{state:'none'});await c.call('Debugger.disable');c.close();}
