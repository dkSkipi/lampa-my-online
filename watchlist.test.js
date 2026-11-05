'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const EPISODES=[{season:1,episode:1,title:'Серия 1'},{season:1,episode:2,title:'Серия 2'},{season:2,episode:1,title:'Серия 1'}];
function harness(saved={},timers=false) {
  const store=structuredClone(saved),start=[],videoEvents={},jobs=[],notices=[],components=[],params=[],selectEvents=[];
  let follow,enter,resume,menu,ajax,play=null,opened=false,playlist=[],closed=0,starts=0,requests=0,selectOpen=false;
  const media={currentTime:0,readyState:0,paused:false,seeking:false,error:null};
  const box={length:1,eq(){return this;},append(){}};
  const root={find:s=>s==='.view--my-online-v0101'?{length:0}:box};
  const $=html=>({on:(event,fn)=>{if(html.includes('view--my-online-resume')) resume=fn;else enter=fn;}});
  $.ajax=opts=>{ajax=opts;requests++;};
  const L={Storage:{get:(key,fallback)=>key==='my_online_access_code'?'test-code-123456789':structuredClone(store[key] || fallback),set:(key,value)=>{store[key]=structuredClone(value);}},Listener:{follow:(event,fn)=>{follow=fn;}},Noty:{show(){}},Controller:{toggle(){}},Select:{show:m=>{menu=m;},hide(){}},Player:{play:item=>{play=item;opened=true;starts++;start.forEach(fn=>fn({data:item}));},playdata:()=>play,opened:()=>opened,playlist:items=>{playlist=items;},close:()=>{opened=false;play=null;closed++;},listener:{follow:(event,fn)=>{if(event==='start') start.push(fn);}}},PlayerPanel:{quality(){},setTracks(){},listener:{send:(event,data)=>{play.url=data.url;}}}};
  L.Noty.show=text=>notices.push(text);
  const close=L.Player.close;
  L.Player.close=()=>{if(play && play.timeline) play.timeline.handler(play.timeline.percent,play.timeline.time,play.timeline.duration);selectOpen=false;close();};
  L.Select.listener={follow:(event,fn)=>{if(event==='preshow') selectEvents.push(fn);}};
  L.Select.show=m=>{menu=m;selectOpen=true;selectEvents.forEach(fn=>fn({active:m}));};
  L.Select.hide=()=>{selectOpen=false;};L.Select.opened=()=>selectOpen;
  L.PlayerVideo={video:()=>media,listener:{follow:(event,fn)=>{videoEvents[event]=fn;}}};
  L.SettingsApi={addComponent:c=>components.push(c),addParam:p=>params.push(p)};
  const globals={window:{Lampa:L,jQuery:$},document:{currentScript:{src:'https://example.org/plugin.js'},createElement:()=>({set href(s){const u=new URL(s);this.protocol=u.protocol;this.host=u.host;}})}};
  if(timers) globals.setTimeout=(fn,delay)=>{jobs.push({fn,delay});return jobs.length;};
  const context=vm.createContext(globals);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin.js'),'utf8'),context);
  follow({type:'complite',object:{activity:{render:()=>root}},data:{movie:{name:'Во все тяжкие',first_air_date:'2008-01-01'}}});
  function metadata() {
    enter();assert.equal(menu.items.length,3);
    menu.onSelect(menu.items.find(i=>i.action==='search'));
    ajax.success({ok:true,version:'0.10.1',items:[{id:'646',title:'Во все тяжкие',year:'2008',type:'series'}]});
    menu.onSelect(menu.items[0]);
    ajax.success({ok:true,version:'0.10.1',movie:{id:'646',type:'series',title:'Во все тяжкие',translations:[{id:'7',name:'Первая'},{id:'8',name:'Вторая'}]}});
  }
  function normalStart() {
    metadata();menu.onSelect(menu.items.find(i=>i.id==='7' && !i.resume));
    ajax.success({ok:true,version:'0.10.1',items:EPISODES});
    menu.onSelect(menu.items[0]);menu.onSelect(menu.items[0]);
    resolveStream();
  }
  function resolveStream() {ajax.success({ok:true,version:'0.10.1',items:[{quality:'720p',format:'MP4',url:'https://cdn.example/'+starts+'-episode.mp4'}]});}
  function select(index) {
    const item=playlist[index];
    const done=()=>{L.Player.play(item);if(item.callback) item.callback();};
    if(typeof item.url==='function') item.url(done);else done();
  }
  return {store,metadata,normalStart,resolveStream,select,jobs,notices,components,params,media,
    open:()=>enter(),resume:()=>resume(),close:()=>L.Player.close(),
    time:(time,duration)=>{media.currentTime=time;media.readyState=4;play.timeline.time=time;play.timeline.duration=duration;play.timeline.continued=true;if(videoEvents.timeupdate) videoEvents.timeupdate({current:time,duration});},
    otherMenu:()=>L.Select.show({title:'Качество',items:[]}),get menuOpen(){return selectOpen;},
    event:(event,data)=>videoEvents[event] && videoEvents[event](data),
    get requests(){return requests;},get play(){return play;},get ajax(){return ajax;},get menu(){return menu;},get playlist(){return playlist;},get starts(){return starts;},get closed(){return closed;}};
}
test('episode playlist is lazy, crosses season boundary, remembers only successfully started episode',()=>{
  const h=harness();h.normalStart();
  assert.equal(h.store.my_online_watch_v1['646'].episode,1);
  assert.equal(h.playlist.length,3);
  assert.equal(typeof h.playlist[1].url,'function');
  h.select(1);assert.match(h.ajax.url,/season=1&episode=2&video=646/);
  assert.equal(h.store.my_online_watch_v1['646'].episode,1);
  h.resolveStream();assert.equal(h.play.episode,2);assert.equal(h.play.launch_player,'inner');
  assert.equal(h.store.my_online_watch_v1['646'].episode,2);
  assert.equal(typeof h.playlist[0].url,'function'); // old links are refreshed on revisiting
  h.select(2);assert.match(h.ajax.url,/season=2&episode=1&video=646/);
  h.resolveStream();assert.equal(h.play.season,2);
  assert.equal(h.store.my_online_watch_v1['646'].season,2);
  assert.equal(h.playlist.indexOf(h.play),h.playlist.length-1); // no wraparound after final episode
});
test('fresh plugin session offers explicit resume with saved voice/season/episode',()=>{
  const h=harness({my_online_watch_v1:{'646':{translation:'8',season:1,episode:2,updated:1}}});
  h.metadata();assert.equal(h.menu.items[0].resume,true);
  assert.match(h.menu.items[0].title,/S1 E2/);
  h.menu.onSelect(h.menu.items[0]);assert.match(h.ajax.url,/translator=8/);
  h.ajax.success({ok:true,version:'0.10.1',items:EPISODES});
  assert.match(h.ajax.url,/translator=8&season=1&episode=2&video=646/);
  h.resolveStream();assert.equal(h.play.episode,2);
  assert.equal(h.store.my_online_watch_v1['646'].translation,'8');
});
test('voice change updates remembered preference and subsequent episode requests',()=>{
  const h=harness();h.normalStart();
  h.play.voiceovers[1].onSelect();
  h.resolveStream();assert.equal(h.store.my_online_watch_v1['646'].translation,'8');
  assert.match(h.ajax.url,/\/episodes\?translator=8&video=646/);
  h.ajax.success({ok:true,version:'0.10.1',items:EPISODES});
  h.select(1);assert.match(h.ajax.url,/translator=8&season=1&episode=2/);
  h.resolveStream();assert.equal(h.store.my_online_watch_v1['646'].translation,'8');
});
test('failed next episode closes loading state and never saves or plays the failed episode',()=>{
  const h=harness();h.normalStart();h.select(1);
  h.ajax.error({status:502,responseJSON:{error:{code:'STREAM_REJECTED',message:'Ошибка'}}},'error');
  assert.equal(h.closed,1);assert.equal(h.starts,1);
  assert.equal(h.store.my_online_watch_v1['646'].episode,1);
});
test('closed player ignores a late episode URL and keeps saved selection',()=>{
  const h=harness();h.normalStart();h.select(1);h.close();h.resolveStream();
  assert.equal(h.starts,1);assert.equal(h.store.my_online_watch_v1['646'].episode,1);
});
test('missing saved episode falls back to season menu instead of playing another episode',()=>{
  const h=harness({my_online_watch_v1:{'646':{translation:'7',season:9,episode:99,updated:1}}});
  h.metadata();h.menu.onSelect(h.menu.items[0]);
  h.ajax.success({ok:true,version:'0.10.1',items:EPISODES});
  assert.match(h.menu.title,/сезон/);assert.equal(h.starts,0);
});
test('exact position survives a new plugin session and is passed to native Lampa timeline',()=>{
  const first=harness();first.normalStart();first.time(321.75,1800);first.close();
  assert.equal(first.store.my_online_watch_v1['646'].episodes['1:1'].time,321.75);
  const second=harness(first.store);second.metadata();second.menu.onSelect(second.menu.items[0]);
  second.ajax.success({ok:true,version:'0.10.1',items:EPISODES});second.resolveStream();
  assert.equal(second.play.timeline.time,321.75);assert.equal(second.play.timeline.duration,1800);
  second.play.voiceovers[1].onSelect();second.resolveStream();
  assert.equal(second.play.timeline.time,321.75);
});
test('watched episode gets a mark and Continue chooses next available episode',()=>{
  const first=harness();first.normalStart();first.time(960,1000);first.close();
  assert.equal(first.store.my_online_watch_v1['646'].episodes['1:1'].watched,true);
  const second=harness(first.store);second.metadata();second.menu.onSelect(second.menu.items[0]);
  second.ajax.success({ok:true,version:'0.10.1',items:EPISODES});
  assert.match(second.ajax.url,/season=1&episode=2/);
  const third=harness(first.store);third.metadata();third.menu.onSelect(third.menu.items.find(i=>i.id==='7' && !i.resume));
  third.ajax.success({ok:true,version:'0.10.1',items:EPISODES});third.menu.onSelect(third.menu.items[0]);
  assert.match(third.menu.items[0].title,/^✓/);
});
test('card Resume refreshes search registration then opens stored result without choosing search result again',()=>{
  const first=harness();first.normalStart();first.time(123,1000);first.close();
  const second=harness(first.store);second.resume();assert.match(second.ajax.url,/\/search\?q=/);
  second.ajax.success({ok:true,version:'0.10.1',items:[{id:'646',title:'Во все тяжкие',type:'series'}]});
  assert.match(second.ajax.url,/movie\?video=646/);
  second.ajax.success({ok:true,version:'0.10.1',movie:{id:'646',type:'series',title:'Во все тяжкие',translations:[{id:'7',name:'Первая'}]}});
  assert.match(second.ajax.url,/episodes\?translator=7/);
  second.ajax.success({ok:true,version:'0.10.1',items:EPISODES});second.resolveStream();
  assert.equal(second.play.timeline.time,123);
});
test('preferences select desired voice and initial quality; Lampa settings component is registered',()=>{
  const h=harness({my_online_preferences_v1:{voice:'Втор',quality:'1080p'}});
  assert.equal(h.components[0].component,'my_online');assert.equal(h.params[0].component,'my_online');
  h.metadata();assert.match(h.ajax.url,/episodes\?translator=8/);
  h.ajax.success({ok:true,version:'0.10.1',items:EPISODES});h.menu.onSelect(h.menu.items[0]);h.menu.onSelect(h.menu.items[0]);
  h.ajax.success({ok:true,version:'0.10.1',items:[{quality:'720p',format:'MP4',url:'https://cdn.example/720.mp4'},{quality:'1080p',format:'MP4',url:'https://cdn.example/1080.mp4'}]});
  assert.equal(h.play.url,'https://cdn.example/1080.mp4');
});
test('temporary network failure retries once; credential failures are not retried',()=>{
  const h=harness({},true);h.open();h.menu.onSelect(h.menu.items[0]);const before=h.requests;
  h.ajax.error({status:0},'timeout');assert.equal(h.jobs[0].delay,2500);
  h.jobs.shift().fn();assert.equal(h.requests,before+1);
  h.ajax.error({status:0},'timeout');assert.equal(h.jobs.length,0);
  h.open();h.menu.onSelect(h.menu.items[0]);h.ajax.error({status:401,responseJSON:{error:{code:'ACCESS_DENIED',message:'Код'}}},'error');
  assert.equal(h.jobs.length,0);
});
test('player error offers explicit fresh URL recovery without resetting saved position',()=>{
  const h=harness({},true);h.normalStart();h.time(222,1000);h.media.error={code:3};h.event('error',{fatal:true});
  h.jobs.shift().fn();assert.equal(h.menu.items[0].retry,true);h.menu.onSelect(h.menu.items[0]);
  assert.match(h.ajax.url,/refresh=1/);h.resolveStream();
  assert.equal(h.play.timeline.time,222);assert.equal(h.starts,1);
});
test('compatible API responses accept patch versions with the same apiVersion',()=>{
  const h=harness();h.open();h.menu.onSelect(h.menu.items[0]);
  h.ajax.success({ok:true,version:'0.9.99',apiVersion:1,items:[]});
  assert.match(h.menu.title,/Совпадений нет/);
});
test('ending prior episode does not overwrite last-started next episode; completion threshold is exact',()=>{
  const h=harness();h.normalStart();
  const old=h.play;
  h.time(946,1000);assert.equal(h.store.my_online_watch_v1['646'].episodes['1:1'].watched,false);
  h.select(1);h.resolveStream();
  old.timeline.handler(100,1000,1000);
  assert.equal(h.store.my_online_watch_v1['646'].episode,2);
  assert.equal(h.store.my_online_watch_v1['646'].episodes['1:1'].watched,true);
});
test('recoverable and aborted source errors never open recovery menu',()=>{
  const h=harness({},true);h.normalStart();
  h.event('error',{fatal:false,error:'buffer load'});assert.equal(h.jobs.length,0);
  h.event('error',{});assert.equal(h.jobs.length,0);
  h.media.error={code:1};h.event('error',{fatal:true});assert.equal(h.jobs.length,0);assert.equal(h.menuOpen,false);
});
test('transient fatal error followed by canplay or loadeddata is cancelled before popup',()=>{
  for(const event of ['canplay','loadeddata']) {
    const h=harness({},true);h.normalStart();h.media.error={code:3};h.event('error',{fatal:true});
    assert.equal(h.jobs[0].delay,2000);h.media.error=null;h.media.readyState=4;h.event(event);h.jobs.shift().fn();
    assert.equal(h.menuOpen,false);assert.equal(h.play.my_online_error_shown,false);
  }
});
test('healthy playing or paused video suppresses stale fatal error at confirmation time',()=>{
  for(const paused of [false,true]) {
    const h=harness({},true);h.normalStart();h.media.readyState=4;h.media.paused=paused;
    h.event('error',{fatal:true});h.jobs.shift().fn();assert.equal(h.menuOpen,false);
  }
});
test('slow initial loading gets recovery grace and successful time progress cancels warning',()=>{
  const h=harness({},true);h.normalStart();h.event('error',{fatal:true});
  assert.equal(h.jobs[0].delay,8000);h.time(1,1000);h.jobs.shift().fn();assert.equal(h.menuOpen,false);
});
test('autonext start discards pending error from previous episode',()=>{
  const h=harness({},true);h.normalStart();h.media.error={code:3};h.event('error',{fatal:true});
  h.select(1);h.resolveStream();h.media.error=null;h.media.readyState=4;h.jobs.shift().fn();
  assert.equal(h.play.episode,2);assert.equal(h.menuOpen,false);assert.equal(h.starts,2);
});
test('persistent fatal error still shows recovery once and successful playback dismisses its own menu',()=>{
  const h=harness({},true);h.normalStart();h.media.error={code:3};h.event('error',{fatal:true});h.jobs.shift().fn();
  assert.equal(h.menuOpen,true);assert.equal(h.menu.items[0].retry,true);
  h.event('error',{fatal:true});assert.equal(h.jobs.length,0);
  h.media.error=null;h.media.readyState=4;h.event('canplay');assert.equal(h.menuOpen,false);
});
test('recovery does not dismiss another player menu',()=>{
  const h=harness({},true);h.normalStart();h.media.error={code:3};h.event('error',{fatal:true});h.jobs.shift().fn();
  h.otherMenu();h.media.error=null;h.event('canplay');assert.equal(h.menuOpen,true);assert.equal(h.menu.title,'Качество');
});
test('close or source switch prevents delayed popup; resume dialog is not covered',()=>{
  for(const action of ['close','url','resume']) {
    const h=harness({},true);h.normalStart();h.media.error={code:3};h.event('error',{fatal:true});
    if(action==='close') h.close();else if(action==='url') h.play.url='https://cdn.example/new.mp4';else h.play.timeline.waiting_for_user=true;
    h.jobs.shift().fn();assert.equal(h.menuOpen,false);
  }
});
