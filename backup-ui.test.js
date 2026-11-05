'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function harness(playing=false){
  const store={my_online_access_code:'test-access-secret-123',my_online_watch_v1:{'646':{translation:'7',season:1,episode:2,updated:10,episodes:{'1:2':{time:123,duration:1000,updated:10}}}},my_online_card_links_v1:{'tmdb:tv:1396':{video:'646',query:'Во все тяжкие',updated:10}},my_online_preferences_v1:{quality:'720p'}};
  const existing=[{className:'view--trailer',unchanged:true},{className:'view--torrent',unchanged:true}],elements=existing.slice(),notices=[],writes=[];
  let follow,menu,ajax;
  const box={length:1,eq(){return this;},prepend:el=>elements.unshift(el),append:el=>elements.push(el)};
  const root={find:selector=>selector.startsWith('.view--my-online')?{length:elements.filter(el=>el.className.split(' ').includes(selector.slice(1))).length}:box};
  function $(html){const el={className:(html.match(/class="([^"]+)"/) || [,''])[1],events:{},on(event,fn){el.events[event]=fn;return el;},after(other){elements.splice(elements.indexOf(el)+1,0,other);}};return el;}
  $.ajax=opts=>{ajax=opts;};
  const L={Storage:{get:(k,f)=>structuredClone(store[k]===undefined?f:store[k]),set:(k,v)=>{writes.push(k);store[k]=structuredClone(v);}},Listener:{follow:(event,fn)=>{if(event==='full') follow=fn;}},Noty:{show:t=>notices.push(t)},Controller:{toggle(){},enabled:()=>({name:'full_start'})},Select:{show:m=>{menu=m;},hide(){}},Player:{opened:()=>playing,playdata:()=>null}};
  const context=vm.createContext({window:{Lampa:L,jQuery:$},document:{currentScript:{src:'https://example.org/plugin.js'},createElement:()=>({set href(v){const u=new URL(v);this.protocol=u.protocol;this.host=u.host;}})}});
  const source=fs.readFileSync(path.join(__dirname,'backup.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'plugin.js'),'utf8');vm.runInContext(source,context);
  const event={type:'complite',object:{activity:{render:()=>root}},data:{movie:{id:1396,name:'Во все тяжкие',first_air_date:'2008-01-01'}}};follow(event);
  function openBackup(){elements[0].events['hover:enter']();menu.onSelect(menu.items.find(i=>i.action==='settings'));menu.onSelect(menu.items.find(i=>i.action==='backup'));}
  return {store,elements,existing,writes,notices,openBackup,again:()=>follow(event),get menu(){return menu;},get ajax(){return ajax;}};
}
test('My online is first and Resume second without changing other plugin buttons or duplicating on rerender',()=>{
  const h=harness();assert.match(h.elements[0].className,/view--my-online-v0101/);assert.match(h.elements[1].className,/view--my-online-resume/);
  assert.equal(h.elements[2],h.existing[0]);assert.equal(h.elements[3],h.existing[1]);h.again();assert.equal(h.elements.length,4);
});
test('TV browser transfer requires confirmation and never sends access code in backup data',()=>{
  const h=harness();h.openBackup();h.menu.onSelect(h.menu.items.find(i=>i.action==='send'));
  assert.equal(h.ajax,undefined);h.menu.onSelect(h.menu.items[0]);
  assert.equal(h.ajax.type,'POST');assert.equal(h.ajax.headers.Authorization,'Bearer test-access-secret-123');
  assert.ok(!h.ajax.data.includes('test-access-secret-123'));assert.equal(JSON.parse(h.ajax.data).data.watch['646'].episodes['1:2'].time,123);
  h.ajax.success({ok:true});assert.match(h.notices.at(-1),/https:\/\/example.org\/backup/);
});
test('restore previews data and waits for explicit merge and final confirmation; secrets remain untouched',()=>{
  const h=harness();h.openBackup();h.menu.onSelect(h.menu.items.find(i=>i.action==='receive'));
  assert.equal(h.ajax.type,'GET');assert.equal(h.writes.length,0);
  h.ajax.success({ok:true,backup:{format:'lampa-my-online-backup',schemaVersion:1,data:{watch:{},links:{},preferences:{quality:'1080p'},my_online_access_code:'malicious'}}});
  assert.equal(h.writes.length,0);h.menu.onSelect(h.menu.items[0]);assert.equal(h.writes.length,0);
  h.menu.onSelect(h.menu.items[0]);assert.equal(h.store.my_online_preferences_v1.quality,'1080p');assert.equal(h.store.my_online_access_code,'test-access-secret-123');
});
test('restore while player is open is refused before any data write',()=>{
  const h=harness(true);h.openBackup();h.menu.onSelect(h.menu.items.find(i=>i.action==='receive'));
  h.ajax.success({ok:true,backup:{format:'lampa-my-online-backup',schemaVersion:1,data:{}}});
  assert.equal(h.writes.length,0);assert.match(h.notices.at(-1),/Закройте видео/);
});
