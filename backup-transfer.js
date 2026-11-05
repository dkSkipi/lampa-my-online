'use strict';
const Backup=require('./backup');
function createTransfer(now=()=>Date.now()) {
  let snapshot=null,expires=0,timer=null;
  return {
    put(input){snapshot=Backup.parse(input);expires=now()+5*60*1000;if(timer) clearTimeout(timer);timer=setTimeout(()=>{snapshot=null;},5*60*1000);timer.unref();return {expiresAt:new Date(expires).toISOString(),summary:Backup.summary(snapshot)};},
    get(){if(!snapshot || now()>=expires){snapshot=null;throw new Error('BACKUP_EXPIRED');}return {backup:Backup.parse(snapshot),expiresAt:new Date(expires).toISOString()};}
  };
}
function readBody(req) {
  return new Promise((resolve,reject)=>{
    let length=0,large=false,chunks=[];
    req.on('data',chunk=>{length+=chunk.length;if(length>Backup.limit){large=true;chunks=[];}else if(!large) chunks.push(chunk);});
    req.on('end',()=>{if(large){reject(new Error('BACKUP_TOO_LARGE'));return;}try{resolve(Backup.parse(Buffer.concat(chunks).toString('utf8')));}catch(_){reject(new Error('INVALID_BACKUP'));}});
    req.on('error',()=>reject(new Error('INVALID_BACKUP')));
    req.setTimeout(15000,()=>{reject(new Error('INVALID_BACKUP'));req.destroy();});
  });
}
module.exports={createTransfer,readBody};
