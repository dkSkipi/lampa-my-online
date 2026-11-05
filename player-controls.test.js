'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup(series=false) {
  let listener,enter,menu,ajax,play,opened=true,starts=0,events=[],notices=[];
  const button={on:(event,fn)=>{enter=fn;return button;}};
  const box={length:1,eq(){return this;},append(){}};
  const root={find:s=>s==='.view--my-online-v0101'?{length:0}:box};
  const $=()=>button;$.ajax=options=>{ajax=options;};
  const L={Listener:{follow:(event,fn)=>{listener=fn;}},Storage:{get:()=> 'test-access-code-12345'},Noty:{show:s=>notices.push(s)},Controller:{toggle(){}},Select:{show:m=>{menu=m;},hide(){}},Player:{play:p=>{play=p;starts++;},playlist(){},playdata:()=>play,opened:()=>opened},PlayerPanel:{quality:(q,url)=>{},setTracks:()=>{},listener:{send:(event,data)=>{events.push({event,data});play.url=data.url;}}}};
  const context=vm.createContext({window:{Lampa:L,jQuery:$},document:{currentScript:{src:'https://example.org/plugin.js'},createElement:()=>({set href(s){const u=new URL(s);this.protocol=u.protocol;this.host=u.host;}})}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'plugin.js'),'utf8'),context);
  listener({type:'complite',object:{activity:{render:()=>root}},data:{movie:{title:'Фильм'}}});
  enter();menu.onSelect(menu.items.find(i=>i.action==='search'));
  ajax.success({ok:true,version:'0.10.1',items:[{id:'777',title:'Видео',type:series?'series':'movie'}]});
  menu.onSelect(menu.items[0]);
  ajax.success({ok:true,version:'0.10.1',movie:{title:series?'Во все тяжкие':'Гладиатор',type:series?'series':'movie',translations:[{id:'7',name:'Первая'},{id:'8',name:'Вторая'}]}});
  menu.onSelect(menu.items[0]);
  if(series) {
    assert.match(ajax.url,/\/episodes\?translator=7/);
    ajax.success({ok:true,version:'0.10.1',items:[{season:2,episode:3,title:'Серия 3'}]});
    menu.onSelect(menu.items[0]);menu.onSelect(menu.items[0]);
    assert.match(ajax.url,/season=2&episode=3/);
  }
  ajax.success({ok:true,version:'0.10.1',items:[{quality:'720p',format:'MP4',title:'720p / MP4',url:'https://cdn.example/first.mp4'},{quality:'1080p',format:'MP4',title:'1080p / MP4',url:'https://cdn.example/first-hd.mp4'}]});
  return {get play(){return play;},get ajax(){return ajax;},get starts(){return starts;},events,notices,close:()=>{opened=false;}};
}
test('native player gets all qualities and voiceovers; voice switch preserves selected quality without relaunch',()=>{
  const f=setup();
  assert.equal(f.play.quality['1080p / MP4'],'https://cdn.example/first-hd.mp4');
  assert.equal(f.play.voiceovers.length,2);
  assert.equal(f.play.voiceovers[0].selected,true);
  assert.equal(f.play.launch_player,'inner');
  // Simulate a quality change through Lampa itself before selecting another voice.
  f.play.url=f.play.quality['1080p / MP4'];
  f.play.voiceovers[1].onSelect();
  assert.match(f.ajax.url,/translator=8/);
  assert.equal(f.ajax.headers.Authorization,'Bearer test-access-code-12345');
  f.ajax.success({ok:true,version:'0.10.1',items:[{quality:'720p',format:'MP4',url:'https://cdn.example/second.mp4'},{quality:'1080p',format:'MP4',url:'https://cdn.example/second-hd.mp4'}]});
  assert.equal(f.starts,1);
  assert.equal(f.events[0].event,'quality');
  assert.equal(f.events[0].data.url,'https://cdn.example/second-hd.mp4');
  assert.equal(f.play.voiceovers[1].selected,true);
  assert.equal(f.play.title,'Гладиатор / Вторая');
});
test('series selection carries season and episode into native voice switching; no quality dialog before playback',()=>{
  const f=setup(true);
  assert.equal(f.starts,1);assert.equal(f.play.launch_player,'inner');
  assert.match(f.play.title,/S2 E3/);
  f.play.voiceovers[1].onSelect();
  assert.match(f.ajax.url,/translator=8&season=2&episode=3/);
});
test('network failure leaves original URL and selected voice intact',()=>{
  const f=setup(),original=f.play.url;
  f.play.voiceovers[1].onSelect();
  f.ajax.error({status:0},'timeout');
  assert.equal(f.play.url,original);assert.equal(f.events.length,0);
  assert.equal(f.play.voiceovers[0].selected,true);
  assert.equal(f.play.voiceovers[1].selected,false);
});
test('late successful response does not restart a closed player',()=>{
  const f=setup();
  f.play.voiceovers[1].onSelect();f.close();
  f.ajax.success({ok:true,version:'0.10.1',items:[{quality:'720p',format:'MP4',url:'https://cdn.example/second.mp4'}]});
  assert.equal(f.events.length,0);assert.equal(f.starts,1);
});
