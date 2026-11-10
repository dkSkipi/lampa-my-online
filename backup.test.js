'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Backup=require('./backup');
const {createTransfer}=require('./backup-transfer');
const {createServer}=require('./server');
function example(){return {format:'lampa-my-online-backup',schemaVersion:1,createdAt:'2026-11-05T12:00:00.000Z',data:{watch:{'646':{translation:'7',season:1,episode:2,updated:200,episodes:{'1:1':{time:960,duration:1000,updated:190},'1:2':{time:123.5,duration:1000,updated:200}}}},links:{'tmdb:tv:1396':{video:'646',query:'Во все тяжкие',updated:200}},preferences:{voice:'LostFilm',quality:'1080p'}}};}
function storage(values){const data=structuredClone(values),writes=[];return {data,writes,get:(k,f)=>structuredClone(data[k]===undefined?f:data[k]),set:(k,v)=>{writes.push(k);data[k]=structuredClone(v);}};}

test('backup preserves a search page and discards external cursor URLs',()=>{
  const input=example(),link=input.data.links['tmdb:tv:1396'];
  link.cursor='/search/?q=test&page=2';
  assert.equal(Backup.parse(input).data.links['tmdb:tv:1396'].cursor,link.cursor);
  link.cursor='https://evil.invalid/private';
  assert.equal(Backup.parse(input).data.links['tmdb:tv:1396'].cursor,undefined);
});
test('backup round trip includes only approved fields and never credentials or media URLs',()=>{
  const input=example();input.data.watch['646'].password='secret-password';input.data.watch['646'].episodes['1:2'].url='https://cdn.example/private-token.mp4';input.data.preferences.token='secret-token';input.data.links['tmdb:tv:1396'].cookie='private-cookie';
  const source=storage({my_online_watch_v1:input.data.watch,my_online_card_links_v1:input.data.links,my_online_preferences_v1:input.data.preferences,my_online_access_code:'access-secret',REZKA_PASSWORD:'secret-password'});
  const backup=Backup.create(source),json=JSON.stringify(backup);
  assert.doesNotMatch(json,/secret-password|secret-token|private-cookie|private-token|access-secret|REZKA_PASSWORD/);
  assert.equal(backup.data.watch['646'].episodes['1:2'].time,123.5);
  assert.equal(backup.data.watch['646'].episodes['1:1'].watched,true);
  assert.deepEqual(Backup.summary(backup),{videos:1,episodes:2,links:1});
  const target=storage({my_online_access_code:'destination-secret'});Backup.apply(target,json,'replace');
  assert.equal(target.data.my_online_access_code,'destination-secret');assert.equal(target.data.my_online_preferences_v1.voice,'LostFilm');
  assert.deepEqual(target.writes,['my_online_watch_v1','my_online_card_links_v1','my_online_preferences_v1']);
});
test('merge retains newer local episode progress and combines independent history',()=>{
  const current=example().data;current.watch['646'].updated=300;current.watch['646'].episodes['1:2']={time:400,duration:1000,updated:300};current.preferences.voice='Другая';
  const source=storage({my_online_watch_v1:current.watch,my_online_card_links_v1:current.links,my_online_preferences_v1:current.preferences});
  const backup=example();backup.data.watch['646'].episodes['2:1']={time:200,duration:1000,updated:250};backup.data.preferences={quality:'720p'};
  Backup.apply(source,backup,'merge');
  const restored=source.data.my_online_watch_v1['646'];assert.equal(restored.episodes['1:2'].time,400);assert.equal(restored.episodes['2:1'].time,200);
  assert.equal(source.data.my_online_preferences_v1.voice,'Другая');assert.equal(source.data.my_online_preferences_v1.quality,'720p');
});
test('invalid format, unsupported schema and oversized text do not write storage',()=>{
  const source=storage({my_online_access_code:'keep'});
  for(const input of ['not json',JSON.stringify({...example(),schemaVersion:99}),' '.repeat(Backup.limit+1)]) assert.throws(()=>Backup.apply(source,input,'replace'));
  assert.equal(source.writes.length,0);
  const malicious=example();malicious.data.links=JSON.parse('{"__proto__":{"polluted":true},"tmdb:tv:2":{"video":"2","query":"https://cdn.example/token.mp4"}}');
  assert.equal(Object.keys(Backup.parse(malicious).data.links).length,0);assert.equal({}.polluted,undefined);
});
test('restore rolls back when a storage write fails and preserves access code',()=>{
  const source=storage({my_online_watch_v1:{},my_online_card_links_v1:{},my_online_preferences_v1:{quality:'720p'},my_online_access_code:'keep'}),original=structuredClone(source.data);
  const set=source.set;let once=true;source.set=(k,v)=>{if(k==='my_online_card_links_v1' && once){once=false;throw new Error('quota');}set(k,v);};
  assert.throws(()=>Backup.apply(source,example(),'replace'),/Исходные данные восстановлены/);assert.deepEqual(source.data,original);
});
test('temporary transfer expires and returned snapshots do not mutate server memory',()=>{
  let now=1000000;const transfer=createTransfer(()=>now);transfer.put(example());
  const first=transfer.get();first.backup.data.preferences.voice='changed';assert.equal(transfer.get().backup.data.preferences.voice,'LostFilm');
  now+=300001;assert.throws(()=>transfer.get(),/BACKUP_EXPIRED/);
});
test('backup HTTP transfer is authenticated, sanitized, bounded and supports browser preflight',async()=>{
  const token='test-code-123456789',headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const server=createServer({base:'https://example.org',token,probe:{status:()=>({code:'PAGE_AVAILABLE'})}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal((await fetch(base+'/api/backup')).status,401);
    assert.equal((await fetch(base+'/api/backup',{method:'POST',body:'{}'})).status,401);
    assert.equal((await fetch(base+'/api/backup',{headers})).status,404);
    const input=example();input.data.preferences.password='secret-password';
    const uploaded=await fetch(base+'/api/backup',{method:'POST',headers,body:JSON.stringify(input)});assert.equal(uploaded.status,200);
    const result=await fetch(base+'/api/backup',{headers}),text=await result.text();assert.doesNotMatch(text,/secret-password|test-code-123456789/);assert.equal(JSON.parse(text).backup.data.watch['646'].episodes['1:2'].time,123.5);
    assert.equal(result.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(base+'/api/backup',{method:'POST',headers,body:'{}'})).status,400);
    const large=await fetch(base+'/api/backup',{method:'POST',headers,body:' '.repeat(Backup.limit+1)});assert.equal((await large.json()).error.code,'BACKUP_TOO_LARGE');
    assert.equal((await fetch(base+'/api/backup',{method:'OPTIONS'})).headers.get('access-control-allow-methods').includes('POST'),true);
    const page=await fetch(base+'/backup');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.ok((await page.text()).includes('Код доступа'));
    const js=await (await fetch(base+'/plugin.js')).text();assert.ok(js.includes('MyOnlineBackup'));assert.ok(!js.includes(token));
    assert.equal((await fetch(base+'/backup-page.js')).status,200);assert.equal((await fetch(base+'/backup-lib.js')).status,200);
  }finally{await new Promise(r=>server.close(r));}
});
