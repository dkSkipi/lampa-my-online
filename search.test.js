'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseSearch,cardURL}=require('./search-data');
const {createProbe}=require('./rezka');
const {createServer}=require('./server');
function card(id,type,title,year,host='https://rezka.si') {
  return '<div class="b-content__inline_item"><div class="cover"><div><img></div></div><div class="b-content__inline_item-link"><a href="'+host+'/'+type+'/drama/'+id+'-example.html">'+title+'</a><div>'+year+', США, драма</div></div></div>';
}
function page(id,series=false) {return '<div class="b-content__main" id="'+id+'"><h1>Видео '+id+'</h1><li class="b-translator__item" data-translator_id="7">Дубляж</li></div><script>initCDN'+(series?'Series':'Movies')+'Events('+id+', 7, false, {});</script>';}
const RESULTS='<div class="b-content__inline_items">'+card('101','films','Фильм &amp; название','2001')+card('202','series','Сериал','2008')+'</div>';
test('nested search cards retain names/year/type, exclude outside URLs, deduplicate',()=>{
  const items=parseSearch(RESULTS+card('101','films','Дубль','2001')+card('303','films','Внешний','2003','https://evil.invalid'));
  assert.equal(items.length,2);assert.equal(items[0].title,'Фильм & название');assert.equal(items[0].year,'2001');assert.equal(items[1].type,'series');
  assert.equal(cardURL('https://rezka.si@evil.invalid/films/drama/1-test.html'),null);
  assert.equal(cardURL('https://rezka.si/films/drama/1-test.html?q=1'),null);
  assert.deepEqual(parseSearch('<div class="b-content__inline_items"></div>'),[]);
  assert.throws(()=>parseSearch('<h1>Maintenance</h1>'),/SEARCH_FORMAT_UNKNOWN/);
  assert.throws(()=>parseSearch('<form id="loginForm"></form>'),/SESSION_EXPIRED/);
});
test('search to movie/series streams does not mix metadata or caches between titles',async()=>{
  let time=1000000,requests=[];
  const probe=createProbe({now:()=>time,fetchImpl:async(url,options)=>{
    requests.push({url,options});
    const u=new URL(url);
    if(u.pathname==='/search/') {assert.equal(u.searchParams.get('q'),'Фильм & сериал');return new Response(RESULTS);}
    if(!options.method) {const id=u.pathname.match(/\/(\d+)-/)[1];return new Response(page(id,id==='202'));}
    const form=new URLSearchParams(options.body),id=form.get('id');
    assert.equal(options.headers.Referer,'https://rezka.si/'+(id==='202'?'series':'films')+'/drama/'+id+'-example.html');
    if(form.get('action')==='get_episodes') return new Response(JSON.stringify({success:true,episodes:'<li class="b-simple_episode__item" data-season_id="1" data-episode_id="1">Серия 1</li>'}));
    if(id==='202') {assert.equal(form.get('action'),'get_stream');assert.equal(form.get('season'),'1');}
    else assert.equal(form.get('action'),'get_movie');
    return new Response(JSON.stringify({success:true,url:'[720p]https://cdn.example/'+id+'.mp4'}));
  }});
  await probe.run();
  const before=requests.length;await assert.rejects(probe.details('999'),/VIDEO_SELECTION_EXPIRED/);assert.equal(requests.length,before);
  const results=await probe.search('Фильм & сериал');assert.equal(results.length,2);
  const count=requests.length;await probe.search('Фильм & сериал');assert.equal(requests.length,count);
  assert.equal((await probe.details('101')).type,'movie');assert.equal((await probe.details('202')).type,'series');
  assert.equal((await probe.stream('7',{},'101'))[0].url,'https://cdn.example/101.mp4');
  time+=2100;
  assert.equal((await probe.stream('7',{season:1,episode:1},'202'))[0].url,'https://cdn.example/202.mp4');
  assert.equal((await probe.stream('7',{},'101'))[0].url,'https://cdn.example/101.mp4');
  assert.equal(probe.movie().id,'93568');
});
test('search/details API is private, validates inputs and binds title IDs to downstream requests',async()=>{
  const calls=[],token='test-code-123456789';
  const probe={status:()=>({code:'PAGE_AVAILABLE'}),search:async q=>{calls.push(q);return [{id:'101',title:'Фильм',year:'2001'}];},details:async id=>({id,title:'Фильм',translations:[]}),episodes:async(id,video)=>{calls.push([id,video]);return [];},movie:()=>({id:'93568'})};
  const server=createServer({probe,token,base:'https://example.org'});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const headers={Authorization:'Bearer '+token};
  try {
    for(const route of ['/api/rezka/search?q=Film','/api/rezka/movie?video=101','/api/rezka/episodes?translator=7&video=101']) assert.equal((await fetch(base+route)).status,401);
    assert.equal(calls.length,0);
    assert.equal((await fetch(base+'/api/rezka/search',{headers})).status,400);
    const result=await (await fetch(base+'/api/rezka/search?q=Film',{headers})).json();assert.equal(result.items[0].id,'101');
    assert.equal((await fetch(base+'/api/rezka/movie?video=https://evil.invalid',{headers})).status,400);
    const movie=await (await fetch(base+'/api/rezka/movie?video=101',{headers})).json();assert.equal(movie.movie.id,'101');
    await fetch(base+'/api/rezka/episodes?translator=7&video=101',{headers});assert.deepEqual(calls.at(-1),['7','101']);
  } finally {await new Promise(r=>server.close(r));}
});
test('explicit refresh bypasses cached CDN URL and keeps cooldown; no extra login attempt',async()=>{
  let time=1000000,streams=0,pages=0;
  const probe=createProbe({now:()=>time,fetchImpl:async(url,options)=>{
    if(!options.method) {pages++;return new Response(page('93568'));}
    streams++;return new Response(JSON.stringify({success:true,url:'[720p]https://cdn.example/v'+streams+'.mp4'}));
  }});
  await probe.run();
  assert.equal((await probe.stream('7'))[0].url,'https://cdn.example/v1.mp4');
  assert.equal((await probe.stream('7'))[0].url,'https://cdn.example/v1.mp4');
  await assert.rejects(probe.stream('7',{},undefined,true),/WAIT_AND_RETRY/);
  time+=2100;
  assert.equal((await probe.stream('7',{},undefined,true))[0].url,'https://cdn.example/v2.mp4');
  assert.equal(pages,1);assert.equal(streams,2);
});
