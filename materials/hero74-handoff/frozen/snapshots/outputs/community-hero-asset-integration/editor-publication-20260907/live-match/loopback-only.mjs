import net from 'node:net';
const listen=net.Server.prototype.listen;
net.Server.prototype.listen=function(...args){if(args[0]===2567){if(typeof args[1]==='string')args[1]='127.0.0.1';else if(args[1]===undefined)args[1]='127.0.0.1';else args.splice(1,0,'127.0.0.1');}return listen.apply(this,args)};
