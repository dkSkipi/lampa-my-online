'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parsePage,parseEpisodes}=require('./player-data');
const {createProbe}=require('./rezka');
const LINK='https://rezka.si/series/thriller/646-vo-vse-tyazhkie-2008-latest.html';
const PAGE='<div class="b-content__main" id="646"><h1>Во все тяжкие</h1><li class="b-translator__item" data-translator_id="7">Озвучка</li></div><script>initCDNSeriesEvents(646, 7, false, {});</script>';
const EPISODES='<ul class="b-simple_episodes__list"><li class="b-simple_episode__item" data-season_id="1" data-episode_id="2">Серия 2</li><li class="b-simple_episode__item" data-season_id="1" data-episode_id="1">Серия 1</li></ul>';
test('series parser validates configured ID and reads only explicit episode attributes',()=>{
  assert.equal(parsePage(PAGE,'646').type,'series');
  assert.throws(()=>parsePage(PAGE,'123'),/PLAYER_NOT_RECOGNIZED/);
  assert.deepEqual(parseEpisodes(EPISODES).map(e=>e.episode),[1,2]);
  assert.throws(()=>parseEpisodes('<li>Серия 1</li>'),/EPISODES_NOT_RECOGNIZED/);
  for(const filmUrl of ['https://evil.invalid/series/drama/646-example.html','https://rezka.si/series/drama/646-example.html?secret=1','http://127.0.0.1/films/action/646-example.html']) assert.throws(()=>createProbe({filmUrl}),/REZKA_FILM_URL/);
});
test('series backend validates availability and gets stream using real season/episode IDs from metadata',async()=>{
  let episodeCalls=0,streamCalls=0;
  const probe=createProbe({filmUrl:LINK,fetchImpl:async(url,options)=>{
    if(!options.method) {assert.equal(url,LINK);return new Response(PAGE);}
    const form=new URLSearchParams(options.body);
    assert.equal(form.get('id'),'646');
    if(form.get('action')==='get_episodes') {episodeCalls++;return new Response(JSON.stringify({success:true,episodes:EPISODES}));}
    streamCalls++;assert.equal(form.get('action'),'get_stream');
    assert.equal(form.get('season'),'1');assert.equal(form.get('episode'),'2');
    assert.equal(options.headers.Referer,LINK);
    return new Response(JSON.stringify({success:true,url:'[720p]https://cdn.example/series.mp4'}));
  }});
  await probe.run();assert.equal(probe.movie().type,'series');
  const items=await probe.episodes('7');assert.equal(items.length,2);
  await assert.rejects(probe.stream('7',{season:1,episode:99}),/EPISODE_NOT_AVAILABLE/);
  const stream=await probe.stream('7',{season:1,episode:2});assert.equal(stream[0].format,'MP4');
  assert.equal(episodeCalls,1);assert.equal(streamCalls,1);
});
