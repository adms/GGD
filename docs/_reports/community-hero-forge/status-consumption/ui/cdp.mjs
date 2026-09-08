export async function connect(targetId) {
  const pages=await fetch('http://127.0.0.1:9235/json/list').then(r=>r.json());
  const page=pages.find(p=>p.type==='page'&&(!targetId||p.id===targetId));if(!page)throw Error('No isolated test page');
  const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((ok,no)=>{socket.onopen=ok;socket.onerror=no});
  let seq=0;const pending=new Map();const events=[];
  socket.onmessage=e=>{const v=JSON.parse(e.data);if(v.id){const p=pending.get(v.id);if(!p)return;pending.delete(v.id);clearTimeout(p.timer);if(v.error)p.reject(Error(JSON.stringify(v.error)));else p.resolve(v.result)}else events.push(v)};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},45000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))});
  const evaluate=async(expression)=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
  await call('Runtime.enable');await call('Page.enable');
  return {call,evaluate,events,close:()=>socket.close()};
}
