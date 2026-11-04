'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parsePage,parseStreams}=require('./player-data');
const {createProbe}=require('./rezka');
const {createServer}=require('./server');
const PAGE='<div class="b-content__main" id="93568"><h1>Гладиатор</h1><li class="b-translator__item" data-translator_id="7" data-ads="1">Дубляж</li></div><script>initCDNMoviesEvents(93568, 7, false, false, {});</script>';
test('movie metadata, encoded streams, quality labels and premium exclusions',()=>{
  const movie=parsePage(PAGE);assert.equal(movie.translations[0].name,'Дубляж');
  const raw='[720p]https://cdn.example/a.mp4 or https://cdn.example/a.mp4:hls:manifest.m3u8,[<span class="pjs-prem-quality">1080p</span>]https://cdn.example/preview.mp4';
  const streams=parseStreams(raw);
  assert.equal(streams.length,2);assert.equal(streams[1].format,'HLS');
  const encoded='#h'+Buffer.from(raw).toString('base64');
  assert.deepEqual(parseStreams(encoded),streams);
  const salted=encoded.slice(0,10)+'//_//IyMjI14hISMjIUBA'+encoded.slice(10);
  assert.deepEqual(parseStreams(salted),streams);
  assert.throws(()=>parseStreams('#habc//_//unknown'),/STREAM_FORMAT_UNKNOWN/);
  assert.throws(()=>parseStreams('[720p]javascript:alert(1)'),/NO_PLAYABLE_STREAMS/);
  assert.throws(()=>parseStreams('[720p]https://user:password@cdn.example/a.mp4'),/NO_PLAYABLE_STREAMS/);
  assert.throws(()=>parsePage(PAGE.replace('93568,','555,')),/PLAYER_NOT_RECOGNIZED/);
});
test('retained server session supports movie stream request without repeated login',async()=>{
  let calls=[];
  const probe=createProbe({login:'user',password:'secret',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(calls.length===1) return new Response('<form id="loginForm"><input type="password"></form>');
    if(calls.length===2) return new Response('{"success":true}',{headers:{'Set-Cookie':'session=private; Path=/; Secure; HttpOnly'}});
    if(calls.length===3) return new Response(PAGE);
    assert.equal(options.headers.Cookie,'session=private');
    assert.equal(new URLSearchParams(options.body).get('action'),'get_movie');
    assert.equal(new URLSearchParams(options.body).get('is_ads'),'1');
    return new Response(JSON.stringify({success:true,url:'[720p]https://cdn.example/a.mp4'}));
  }});
  await probe.run();assert.equal(probe.status().playerRecognized,true);
  const data=await probe.stream('7');assert.equal(data[0].format,'MP4');
  await probe.stream('7');assert.equal(calls.length,4);
  await assert.rejects(probe.stream('99'),/INVALID_TRANSLATOR/);
  assert.doesNotMatch(JSON.stringify(probe.status()),/private|secret/);
});
test('private API refuses public requests; token is not injected into plugin or status',async()=>{
  let calls=0;
  const token='test-code-123456789';
  const probe={status:()=>({code:'PAGE_AVAILABLE',playerRecognized:true}),movie:()=>{calls++;return {title:'Гладиатор',translations:[{id:'7',name:'Дубляж'}]};},stream:async()=>[{url:'https://cdn.example/a.mp4'}]};
  const server=createServer({base:'https://example.org',token,probe});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  try {
    assert.equal((await fetch(base+'/api/rezka/movie')).status,401);assert.equal(calls,0);
    assert.equal((await fetch(base+'/api/rezka/movie?token='+token)).status,401);
    const result=await fetch(base+'/api/rezka/movie',{headers:{Authorization:'Bearer '+token}});
    assert.equal(result.status,200);assert.equal((await result.json()).movie.title,'Гладиатор');
    assert.equal((await fetch(base+'/api/rezka/stream?translator=x',{headers:{Authorization:'Bearer '+token}})).status,400);
    for(const path of ['/plugin.js','/api/rezka/status','/health']) assert.ok(!(await (await fetch(base+path)).text()).includes(token));
  } finally {await new Promise(r=>server.close(r));}
});
