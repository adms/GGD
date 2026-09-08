import{connect}from'file:///Users/Takuro/Dropbox/%E6%88%91%E7%9A%84%20Mac%20(Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge/docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs';
for(const id of process.argv.slice(2)){
 const c=await connect(id);await c.call('Page.navigate',{url:'http://127.0.0.1:60801/admin/'});await new Promise(r=>setTimeout(r,1000));
 await c.evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText.includes('登入 Sign in'))?.click()`);await new Promise(r=>setTimeout(r,300));
 if(await c.evaluate(`!!document.querySelector('input[type="password"]')`)){
  await c.evaluate(`(()=>{for(const [s,v]of [['input[type="text"]','model-reviewer'],['input[type="password"]','REDACTED_TEST_PASSWORD']]){const e=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}[...document.querySelectorAll('button')].find(e=>e.innerText==='Sign in').click();})()`);await new Promise(r=>setTimeout(r,1000));
 }
 console.log(id,await c.evaluate(`document.body.innerText.includes('登入 Sign in')?'login needed':'session restored'`));c.close();
}
