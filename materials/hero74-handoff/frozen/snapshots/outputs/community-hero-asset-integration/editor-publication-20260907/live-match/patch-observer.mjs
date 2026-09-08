import {pathToFileURL}from'node:url';
const {Room}=await import(pathToFileURL(process.cwd()+'/apps/game-server/node_modules/@colyseus/core/build/index.mjs'));
const patch=Room.prototype.broadcastPatch,last=new WeakMap();
Room.prototype.broadcastPatch=function(...args){const now=Date.now(),show=this.state?.communityContentJson&&now-(last.get(this)??0)>2500;const before=show?{room:this.roomId,phase:this.state.phase,tick:this.state.tick,worldTick:this.ctl?.world?.tick,seats:this.state.seats.size,clients:this.clients.map(c=>({state:c.state,view:!!c.view})),patchRate:this.patchRate,changes:this._serializer?.encoder?.hasChanges}:null;const result=patch.apply(this,args);if(show){last.set(this,now);console.log('[proof patch observer]',JSON.stringify({...before,sent:result}));}return result};
