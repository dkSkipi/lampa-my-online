'use strict';
// Independent, fail-closed parser. Never executes JavaScript from a page.
function plain(s) { return s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').trim(); }
function attrs(tag) { const out={}; for(const m of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)) out[m[1]]=m[3]; return out; }
function parsePage(html,expectedId='93568') {
  if(/<input\b[^>]*type=["']password["']/i.test(html)) throw new Error('SESSION_EXPIRED');
  const init=html.match(/initCDN(Movies|Series)Events\(\s*(\d+)\s*,\s*(\d+)\s*,/);
  if(!init || init[2]!==expectedId) throw new Error('PLAYER_NOT_RECOGNIZED');
  const translations=[];
  for(const m of html.matchAll(/<(li|div|a|span)\b([^>]*\bclass=["'][^"']*\bb-translator__item\b[^"']*["'][^>]*)>([\s\S]*?)<\/\1>/g)) {
    const a=attrs(m[2]),id=a['data-translator_id'];
    if(!/^\d+$/.test(id || '') || translations.some(t=>t.id===id)) continue;
    translations.push({id,name:plain(m[3]).slice(0,150)||('Озвучка '+id),ads:a['data-ads']==='1'?'1':'0',camrip:a['data-camrip']==='1'?'1':'0',director:a['data-director']==='1'?'1':'0'});
  }
  if(!translations.some(t=>t.id===init[3])) translations.unshift({id:init[3],name:'Основная озвучка',ads:'0',camrip:'0',director:'0'});
  const name=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return {id:init[2],type:init[1]==='Series'?'series':'movie',title:name?plain(name[1]).slice(0,200):'Проверочное видео Rezka',translations};
}
function decode(value) {
  if(typeof value!=='string' || value.length>1000000) throw new Error('STREAM_FORMAT_UNKNOWN');
  if(value.startsWith('[') || value.startsWith('https://')) return value;
  if(!value.startsWith('#h')) throw new Error('STREAM_FORMAT_UNKNOWN');
  let encoded=value.slice(2);
  const salts=['IyMjI14hISMjIUBA','QEBAQEAhIyMhXl5e','JCQhIUAkJEBeIUAjJCRA','JCQjISFAIyFAIyM=','Xl5eIUAjIyEhIyM='];
  for(let n=0;encoded.includes('//_//') && n<60;n++) {
    const at=encoded.indexOf('//_//'),tail=encoded.slice(at+5),salt=salts.find(s=>tail.startsWith(s));
    if(!salt) throw new Error('STREAM_FORMAT_UNKNOWN');
    encoded=encoded.slice(0,at)+tail.slice(salt.length);
  }
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('STREAM_FORMAT_UNKNOWN');
  return Buffer.from(encoded,'base64').toString('utf8');
}
function parseStreams(raw) {
  const s=decode(raw),items=[];
  const tags=Array.from(s.matchAll(/\[([^\]]+)\]/g));
  const groups=tags.length?tags.map((m,i)=>({label:m[1],urls:s.slice(m.index+m[0].length,tags[i+1]?.index || s.length)})):[{label:'Авто',urls:s}];
  for(const group of groups) {
    // A premium badge can represent a preview rather than an available movie.
    if(/prem-quality|prem-icon/.test(group.label)) continue;
    const quality=plain(group.label).slice(0,60);
    for(let url of group.urls.replace(/,+\s*$/,'').split(/\s+or\s+/)) {
      url=url.trim();
      let u;try { u=new URL(url); } catch(_) { continue; }
      if(u.protocol!=='https:' || u.username || u.password || /[\s<>"']/.test(url)) continue;
      if(!/\.(?:mp4|m3u8)(?:[?#]|$)/i.test(u.pathname)) continue;
      const format=/m3u8/i.test(u.pathname)?'HLS':'MP4';
      if(!items.some(v=>v.url===url)) items.push({quality,format,url,title:quality+' / '+format});
    }
  }
  if(!items.length) throw new Error('NO_PLAYABLE_STREAMS');
  return items;
}
function parseEpisodes(html) {
  if(typeof html!=='string') throw new Error('EPISODES_NOT_RECOGNIZED');
  const items=[];
  for(const m of html.matchAll(/<(li|div|a|span)\b([^>]*\bclass=["'][^"']*\bb-simple_episode__item\b[^"']*["'][^>]*)>([\s\S]*?)<\/\1>/g)) {
    const a=attrs(m[2]),season=Number(a['data-season_id']),episode=Number(a['data-episode_id']);
    if(!Number.isInteger(season) || !Number.isInteger(episode) || season<1 || episode<1 || season>1000 || episode>10000) continue;
    if(!items.some(i=>i.season===season && i.episode===episode)) items.push({season,episode,title:plain(m[3]).slice(0,150)||('Серия '+episode)});
    if(items.length>10000) throw new Error('EPISODES_NOT_RECOGNIZED');
  }
  if(!items.length) throw new Error('EPISODES_NOT_RECOGNIZED');
  return items.sort((a,b)=>a.season-b.season || a.episode-b.episode);
}
module.exports={parsePage,parseStreams,parseEpisodes};
