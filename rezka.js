'use strict';
// Confirmed against rezka.si login page, 2026-11-03. No stream API assumed.
const BASE = 'https://rezka.si';
const FILM = '/films/action/93568-gladiator-1986.html';
const {parsePage,parseStreams,parseEpisodes}=require('./player-data');
const MESSAGES = {
  CHECKING:'Проверяется вход на Rezka…',
  NOT_CONFIGURED:'Добавьте REZKA_LOGIN и REZKA_PASSWORD в Environment сервиса Render.',
  CONFIG_INCOMPLETE:'Нужно задать обе переменные: REZKA_LOGIN и REZKA_PASSWORD.',
  AUTH_REQUIRED:'Сайт доступен, но требует входа.',
  LOGIN_REJECTED:'Rezka не подтвердила вход. Проверьте данные самостоятельно на сайте. Автоповторов нет.',
  LOGIN_REQUIRED_AFTER_SUCCESS:'Сайт подтвердил вход, но карточка снова требует авторизации.',
  PAGE_AVAILABLE:'Карточка фильма доступна. Получение видеопотока ещё не реализовано.',
  PAGE_UNRECOGNIZED:'Ответ не похож на подтверждённую карточку фильма. Нужна проверка формата страницы.',
  INVALID_RESPONSE:'Сайт вернул неожиданный ответ при входе.',
  BLOCKED:'Rezka отказала серверу в доступе (HTTP 403).',
  RATE_LIMITED:'Rezka ограничила запросы (HTTP 429). Не повторяйте вход сразу.',
  REDIRECT_REJECTED:'Сайт перенаправил на другой адрес. Авторизация остановлена.',
  UPSTREAM_HTTP:'Сайт вернул ошибку HTTP.',
  NETWORK:'Сервер не смог связаться с Rezka.',
  TOO_LARGE:'Ответ сайта превысил допустимый размер.',
  COOKIE_INVALID:'Сайт вернул неподдерживаемый формат сессионного cookie.'
};
class UpstreamError extends Error { constructor(code) { super(code); this.code=code; } }
function isLogin(html) { return /<form\b[^>]*\bid=["']loginForm["']/i.test(html) || /<input\b[^>]*\btype=["']password["']/i.test(html); }
function isFilm(html,id) { return /b-content__main/.test(html) && html.includes(id) && !isLogin(html); }
function createProbe({login, password, filmUrl=BASE+FILM, fetchImpl=fetch} = {}) {
  const target=new URL(filmUrl);
  const idMatch=target.pathname.match(/^\/(?:films|series)\/[a-z0-9-]+\/(\d+)-[a-z0-9-]+\.html$/i);
  if(target.origin!==BASE || target.username || target.password || target.search || target.hash || !idMatch) throw new Error('REZKA_FILM_URL: required https://rezka.si/films/category/ID-title.html');
  const filmPath=target.pathname,filmId=idMatch[1];
  let state = {code:'NOT_CONFIGURED',message:MESSAGES.NOT_CONFIGURED,checkedAt:null,streamReady:false};
  let started = false;
  // In-memory, same-origin session. Never returned to callers or written to logs.
  const jar = new Map();
  let movieData=null;
  let busy=false,lastRequest=0;
  const streamCache=new Map();
  const episodeCache=new Map();
  function pageAvailable(html) {
    if(!isFilm(html,filmId)) return update('PAGE_UNRECOGNIZED');
    try { movieData=parsePage(html,filmId); } catch (_) { movieData=null; }
    return update('PAGE_AVAILABLE');
  }
  function update(code) { state={code,message:MESSAGES[code],checkedAt:new Date().toISOString(),streamReady:false}; return {...state}; }
  function remember(headers, pathname) {
    for (const line of headers.getSetCookie()) {
      const parts=line.split(';').map(x=>x.trim());
      const sep=parts[0].indexOf('=');
      if (sep<1) throw new UpstreamError('COOKIE_INVALID');
      const name=parts[0].slice(0,sep),value=parts[0].slice(sep+1);
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n;]/.test(value)) throw new UpstreamError('COOKIE_INVALID');
      const attrs={};
      for (const p of parts.slice(1)) { const i=p.indexOf('='); attrs[(i<0?p:p.slice(0,i)).toLowerCase()]=i<0?'':p.slice(i+1); }
      if (attrs.domain && attrs.domain.replace(/^\./,'').toLowerCase()!=='rezka.si') continue;
      const path=attrs.path && attrs.path.startsWith('/') ? attrs.path : pathname.slice(0,pathname.lastIndexOf('/')) || '/';
      const key=name+'|'+path;
      let expires=attrs.expires ? Date.parse(attrs.expires) : Infinity;
      if (attrs['max-age']!==undefined && /^-?\d+$/.test(attrs['max-age'])) expires=Date.now()+Number(attrs['max-age'])*1000;
      jar.set(key,{name,value,path,expires});
    }
  }
  async function read(response) {
    const reader=response.body.getReader(); let length=0; const chunks=[];
    try { for (;;) { const {done,value}=await reader.read(); if(done) break; length+=value.length; if(length>2*1024*1024) throw new UpstreamError('TOO_LARGE'); chunks.push(Buffer.from(value)); } }
    finally { await reader.cancel().catch(()=>{}); }
    return Buffer.concat(chunks).toString('utf8');
  }
  async function request(path, options={}) {
    let url=new URL(path,BASE);
    for (let hop=0;hop<4;hop++) {
      if(url.origin!==BASE) throw new UpstreamError('REDIRECT_REJECTED');
      const cookie=Array.from(jar.values()).filter(c=>c.expires>Date.now() && (url.pathname===c.path || url.pathname.startsWith(c.path.endsWith('/')?c.path:c.path+'/'))).map(c=>c.name+'='+c.value).join('; ');
      const response=await fetchImpl(url.href,{...options,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html,application/json','Referer':BASE+'/',...(cookie?{Cookie:cookie}:{}),...options.headers}});
      remember(response.headers,url.pathname);
      if(response.status>=300 && response.status<400) {
        // Never re-submit credentials on any redirect, even within the site.
        if(options.method==='POST') throw new UpstreamError('REDIRECT_REJECTED');
        const location=response.headers.get('location');
        if(!location) throw new UpstreamError('REDIRECT_REJECTED');
        await response.body?.cancel(); url=new URL(location,url); continue;
      }
      if(response.status!==200) { await response.body?.cancel(); throw new UpstreamError(response.status===403?'BLOCKED':response.status===429?'RATE_LIMITED':'UPSTREAM_HTTP'); }
      return read(response);
    }
    throw new UpstreamError('REDIRECT_REJECTED');
  }
  async function run() {
    if(started) return {...state};
    started=true; update('CHECKING');
    try {
      if(Boolean(login)!==Boolean(password)) return update('CONFIG_INCOMPLETE');
      const html=await request(filmPath);
      if(!isLogin(html)) return pageAvailable(html);
      if(!login || !password) return update('AUTH_REQUIRED');
      const reply=await request('/ajax/login/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Origin':BASE},body:new URLSearchParams({login_name:login,login_password:password,login_not_save:'0'}).toString()});
      let data; try { data=JSON.parse(reply); } catch (_) { return update('INVALID_RESPONSE'); }
      if(!data || (data.success!==true && data.success!==1)) return update('LOGIN_REJECTED');
      const page=await request(filmPath);
      return isLogin(page)?update('LOGIN_REQUIRED_AFTER_SUCCESS'):pageAvailable(page);
    } catch (error) { return update(error instanceof UpstreamError ? error.code : 'NETWORK'); }
    finally { if(state.code!=='PAGE_AVAILABLE') jar.clear(); }
  }
  function movie() {
    if(state.code!=='PAGE_AVAILABLE') throw new Error(state.code);
    if(!movieData) throw new Error('PLAYER_NOT_RECOGNIZED');
    return {id:movieData.id,type:movieData.type,title:movieData.title,translations:movieData.translations.map(t=>({id:t.id,name:t.name}))};
  }
  async function episodes(id) {
    movie();
    if(movieData.type!=='series' || !movieData.translations.some(t=>t.id===id)) throw new Error('INVALID_TRANSLATOR');
    const cached=episodeCache.get(id);
    if(cached && cached.until>Date.now()) return cached.items;
    if(busy) throw new Error('WAIT_AND_RETRY');
    busy=true;
    try {
      const raw=await request('/ajax/get_cdn_series/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Origin':BASE,'Referer':BASE+filmPath},body:new URLSearchParams({id:movieData.id,translator_id:id,action:'get_episodes'}).toString()});
      if(isLogin(raw)) throw new Error('SESSION_EXPIRED');
      let data;try {data=JSON.parse(raw);}catch(_){throw new Error('STREAM_INVALID_JSON');}
      if(data.success===false) throw new Error('STREAM_REJECTED');
      const items=parseEpisodes(data.episodes);
      episodeCache.set(id,{until:Date.now()+300000,items});
      return items;
    } finally {busy=false;}
  }
  async function stream(id,selection={}) {
    movie();
    const t=movieData.translations.find(t=>t.id===id);
    if(!t) throw new Error('INVALID_TRANSLATOR');
    const fields={id:movieData.id,translator_id:id,is_ads:t.ads,is_camrip:t.camrip,is_director:t.director,action:'get_movie'};
    if(movieData.type==='series') {
      const available=await episodes(id);
      if(!available.some(e=>e.season===selection.season && e.episode===selection.episode)) throw new Error('EPISODE_NOT_AVAILABLE');
      fields.action='get_stream';fields.season=String(selection.season);fields.episode=String(selection.episode);
    }
    const cacheKey=id+':'+(fields.season || '')+':'+(fields.episode || '');
    const cached=streamCache.get(cacheKey);
    if(cached && cached.until>Date.now()) return cached.items;
    if(busy || Date.now()-lastRequest<2000) throw new Error('WAIT_AND_RETRY');
    busy=true;lastRequest=Date.now();
    try {
      const raw=await request('/ajax/get_cdn_series/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest','Origin':BASE,'Referer':BASE+filmPath},body:new URLSearchParams(fields).toString()});
      if(isLogin(raw)) throw new Error('SESSION_EXPIRED');
      let data;try { data=JSON.parse(raw); } catch(_) { throw new Error('STREAM_INVALID_JSON'); }
      if(data.success===false) throw new Error('STREAM_REJECTED');
      const items=parseStreams(data.url);
      state.streamReady=true;
      streamCache.set(cacheKey,{until:Date.now()+60000,items});
      return items;
    } finally { busy=false; }
  }
  return {run,status:()=>({...state,playerRecognized:!!movieData}),movie,stream,episodes};
}
module.exports={createProbe};
if(require.main===module) {
  const probe=createProbe({login:process.env.REZKA_LOGIN,password:process.env.REZKA_PASSWORD,filmUrl:process.env.REZKA_FILM_URL});
  probe.run().then(result=>console.log(JSON.stringify(result)));
}
