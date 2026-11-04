'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {timingSafeEqual}=require('node:crypto');
const VERSION = '0.6.0';
const {createProbe} = require('./rezka');
const DEMO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
function origin(value) {
  const u = new URL(value);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('PUBLIC_BASE_URL must be an HTTP(S) origin');
  return u.origin;
}
function createServer(config = {}) {
  const base = config.base || process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL;
  const publicBase = base ? origin(base) : null;
  const template = fs.readFileSync(path.join(__dirname, 'plugin.js'), 'utf8');
  const probe = config.probe || createProbe({login:process.env.REZKA_LOGIN,password:process.env.REZKA_PASSWORD,filmUrl:process.env.REZKA_FILM_URL});
  // One check per process start. Public status requests cannot trigger logins.
  if (!config.probe) probe.run();
  const token=config.token ?? process.env.MY_ONLINE_TOKEN ?? '';
  const tokenValid=/^[A-Za-z0-9_-]{16,128}$/.test(token);
  return http.createServer(async (req, res) => {
    const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    function send(status, data, type = 'application/json; charset=utf-8') {
      res.writeHead(status, {...headers, 'Content-Type':type});
      res.end(req.method === 'HEAD' ? undefined : typeof data === 'string' ? data : JSON.stringify(data));
    }
    if (req.method === 'OPTIONS') return send(204, '');
    if (!['GET','HEAD'].includes(req.method)) return send(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Используйте GET'}});
    try {
      const u = new URL(req.url, 'http://localhost');
      if (u.pathname === '/health') return send(200,{ok:true,version:VERSION,provider:'rezka-experimental',rezkaConnected:probe.status().streamReady===true});
      if (u.pathname === '/api/rezka/status') return send(200,{ok:true,version:VERSION,rezka:probe.status()});
      if (['/api/rezka/movie','/api/rezka/stream','/api/rezka/episodes'].includes(u.pathname)) {
        if(!tokenValid) return send(503,{ok:false,error:{code:'ACCESS_CODE_NOT_CONFIGURED',message:'Задайте MY_ONLINE_TOKEN: 16–128 латинских букв, цифр, дефисов или подчёркиваний.'}});
        const supplied=(req.headers.authorization || '').replace(/^Bearer /,'');
        const a=Buffer.from(token),b=Buffer.from(supplied);
        if(a.length!==b.length || !timingSafeEqual(a,b)) return send(401,{ok:false,error:{code:'ACCESS_DENIED',message:'Введите код доступа в меню плагина.'}});
        try {
          if(u.pathname === '/api/rezka/movie') return send(200,{ok:true,version:VERSION,movie:probe.movie()});
          const id=u.searchParams.get('translator') || '';
          if(!/^\d{1,12}$/.test(id)) return send(400,{ok:false,error:{code:'INVALID_TRANSLATOR',message:'Выберите озвучку из списка.'}});
          if(u.pathname === '/api/rezka/episodes') return send(200,{ok:true,version:VERSION,items:await probe.episodes(id)});
          const items=await probe.stream(id,{season:Number(u.searchParams.get('season')),episode:Number(u.searchParams.get('episode'))});
          return send(200,{ok:true,version:VERSION,items});
        } catch(error) {
          const safe=['CHECKING','AUTH_REQUIRED','LOGIN_REJECTED','PAGE_UNRECOGNIZED','SESSION_EXPIRED','PLAYER_NOT_RECOGNIZED','INVALID_TRANSLATOR','WAIT_AND_RETRY','STREAM_INVALID_JSON','STREAM_REJECTED','STREAM_FORMAT_UNKNOWN','NO_PLAYABLE_STREAMS','BLOCKED','RATE_LIMITED','REDIRECT_REJECTED','EPISODES_NOT_RECOGNIZED','EPISODE_NOT_AVAILABLE'];
          const code=safe.includes(error.message)?error.message:'PROVIDER_ERROR';
          return send(502,{ok:false,error:{code,message:'Не удалось получить данные плеера. Запишите код ошибки; пароль присылать не нужно.'}});
        }
      }
      if (u.pathname === '/plugin.js') return send(200,template.replace('"__API_ORIGIN__"', JSON.stringify(publicBase)), 'application/javascript; charset=utf-8');
      if (u.pathname === '/api/demo') return send(200,{ok:true,version:VERSION,provider:'demo',items:[{title:'Тестовый ролик: цветы (MDN, CC0)',versions:[{name:'MP4',url:DEMO}]}]});
      if (u.pathname === '/api/search') {
        const q = (u.searchParams.get('q') || '').trim();
        if (!q || q.length > 200) return send(400,{ok:false,error:{code:'INVALID_QUERY',message:'Название должно содержать от 1 до 200 символов'}});
        return send(200,{ok:true,version:VERSION,provider:'demo',items:[],message:'Источники фильма не подключены. Rezka не подключена. Для проверки выберите тестовый ролик.'});
      }
      if (u.pathname === '/') return send(200,'<!doctype html><meta charset="utf-8"><title>Мой онлайн 0.6</title><h1>Мой онлайн v0.6.0</h1><p>Сервер работает. Экспериментальная проверка фильма Rezka доступна в меню Lampa.</p><ul><li><a href="/health">Проверить сервер</a></li><li><a href="/plugin.js">Плагин Lampa</a></li><li><a href="/api/demo">Тестовый каталог</a></li></ul><p>Проверка видео в браузере (не проверяет плеер телевизора):</p><video controls width="480" src="'+DEMO+'"></video>','text/html; charset=utf-8');
      return send(404,{ok:false,error:{code:'NOT_FOUND',message:'Адрес не найден'}});
    } catch (_) { return send(400,{ok:false,error:{code:'BAD_REQUEST',message:'Некорректный запрос'}}); }
  });
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 10000),'0.0.0.0',()=>console.log('Lampa API v'+VERSION+' started'));
module.exports = {createServer};
