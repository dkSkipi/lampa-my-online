'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {timingSafeEqual}=require('node:crypto');
const VERSION = '0.10.0';
const {createProbe} = require('./rezka');
const {createTransfer,readBody}=require('./backup-transfer');
const DEMO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
function origin(value) {
  const u = new URL(value);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('PUBLIC_BASE_URL must be an HTTP(S) origin');
  return u.origin;
}
function createServer(config = {}) {
  const base = config.base || process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL;
  const publicBase = base ? origin(base) : null;
  const backupScript=fs.readFileSync(path.join(__dirname,'backup.js'),'utf8');
  const template = backupScript+'\n'+fs.readFileSync(path.join(__dirname, 'plugin.js'), 'utf8');
  const transfer=createTransfer();
  const probe = config.probe || createProbe({login:process.env.REZKA_LOGIN,password:process.env.REZKA_PASSWORD,filmUrl:process.env.REZKA_FILM_URL});
  // One check per process start. Public status requests cannot trigger logins.
  if (!config.probe) probe.run();
  const token=config.token ?? process.env.MY_ONLINE_TOKEN ?? '';
  const tokenValid=/^[A-Za-z0-9_-]{16,128}$/.test(token);
  return http.createServer(async (req, res) => {
    const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS, POST','Access-Control-Allow-Headers':'Content-Type, Authorization','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    function send(status, data, type = 'application/json; charset=utf-8') {
      res.writeHead(status, {...headers, 'Content-Type':type});
      res.end(req.method === 'HEAD' ? undefined : typeof data === 'string' ? data : JSON.stringify({apiVersion:1,...data}));
    }
    if (req.method === 'OPTIONS') return send(204, '');
    if (!['GET','HEAD'].includes(req.method) && !(req.method==='POST' && req.url.split('?')[0]==='/api/backup')) return send(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Метод не поддерживается'}});
    try {
      const u = new URL(req.url, 'http://localhost');
      if(['/backup','/backup-page.js','/backup-lib.js'].includes(u.pathname)) {
        const file=u.pathname==='/backup'?'backup-page.html':u.pathname==='/backup-lib.js'?'backup.js':'backup-page.js';
        if(req.method!=='GET' && req.method!=='HEAD') return send(405,{ok:false});
        headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
        headers['Referrer-Policy']='no-referrer';
        return send(200,fs.readFileSync(path.join(__dirname,file),'utf8'),file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8');
      }
      if (u.pathname === '/health') return send(200,{ok:true,version:VERSION,provider:'rezka-experimental',rezkaConnected:probe.status().streamReady===true});
      if (u.pathname === '/api/rezka/status') return send(200,{ok:true,version:VERSION,rezka:probe.status()});
      if (['/api/rezka/movie','/api/rezka/stream','/api/rezka/episodes','/api/rezka/search','/api/backup'].includes(u.pathname)) {
        if(!tokenValid) return send(503,{ok:false,error:{code:'ACCESS_CODE_NOT_CONFIGURED',message:'Задайте MY_ONLINE_TOKEN: 16–128 латинских букв, цифр, дефисов или подчёркиваний.'}});
        const supplied=(req.headers.authorization || '').replace(/^Bearer /,'');
        const a=Buffer.from(token),b=Buffer.from(supplied);
        if(a.length!==b.length || !timingSafeEqual(a,b)) return send(401,{ok:false,error:{code:'ACCESS_DENIED',message:'Введите код доступа в меню плагина.'}});
        if(u.pathname==='/api/backup') {
          try{
            if(req.method==='POST') return send(200,{ok:true,version:VERSION,...transfer.put(await readBody(req))});
            return send(200,{ok:true,version:VERSION,...transfer.get()});
          }catch(error){const code=['BACKUP_EXPIRED','BACKUP_TOO_LARGE'].includes(error.message)?error.message:'INVALID_BACKUP';return send(code==='BACKUP_EXPIRED'?404:400,{ok:false,error:{code,message:code==='BACKUP_EXPIRED'?'Нет подготовленной копии. Подготовьте её снова на другом устройстве.':code==='BACKUP_TOO_LARGE'?'Копия больше 2 МБ.':'Файл не является поддержанной резервной копией.'}});}
        }
        try {
          if(u.pathname === '/api/rezka/search') {
            const q=(u.searchParams.get('q') || '').trim();
            if(!q || q.length>200) return send(400,{ok:false,error:{code:'INVALID_QUERY',message:'Введите название от 1 до 200 символов.'}});
            return send(200,{ok:true,version:VERSION,items:await probe.search(q)});
          }
          const video=u.searchParams.get('video') || undefined;
          if(video && !/^\d{1,12}$/.test(video)) return send(400,{ok:false,error:{code:'INVALID_VIDEO',message:'Выберите видео из результатов поиска.'}});
          if(u.pathname === '/api/rezka/movie') return send(200,{ok:true,version:VERSION,movie:video?await probe.details(video):probe.movie()});
          const id=u.searchParams.get('translator') || '';
          if(!/^\d{1,12}$/.test(id)) return send(400,{ok:false,error:{code:'INVALID_TRANSLATOR',message:'Выберите озвучку из списка.'}});
          if(u.pathname === '/api/rezka/episodes') return send(200,{ok:true,version:VERSION,items:await probe.episodes(id,video)});
          const items=await probe.stream(id,{season:Number(u.searchParams.get('season')),episode:Number(u.searchParams.get('episode'))},video,u.searchParams.get('refresh')==='1');
          return send(200,{ok:true,version:VERSION,items});
        } catch(error) {
          const safe=['CHECKING','AUTH_REQUIRED','LOGIN_REJECTED','PAGE_UNRECOGNIZED','SESSION_EXPIRED','PLAYER_NOT_RECOGNIZED','INVALID_TRANSLATOR','WAIT_AND_RETRY','STREAM_INVALID_JSON','STREAM_REJECTED','STREAM_FORMAT_UNKNOWN','NO_PLAYABLE_STREAMS','BLOCKED','RATE_LIMITED','REDIRECT_REJECTED','EPISODES_NOT_RECOGNIZED','EPISODE_NOT_AVAILABLE','SEARCH_FORMAT_UNKNOWN','INVALID_QUERY','VIDEO_SELECTION_EXPIRED','NETWORK'];
          const code=safe.includes(error.message)?error.message:'PROVIDER_ERROR';
          return send(502,{ok:false,error:{code,message:'Не удалось получить данные плеера. Запишите код ошибки; пароль присылать не нужно.'}});
        }
      }
      if (u.pathname === '/plugin.js') return send(200,template.replace('"__API_ORIGIN__"', JSON.stringify(publicBase)), 'application/javascript; charset=utf-8');
      if (u.pathname === '/api/demo') return send(200,{ok:true,version:VERSION,provider:'demo',items:[{title:'Тестовый ролик: цветы (MDN, CC0)',versions:[{name:'MP4',url:DEMO}]}]});
      if (u.pathname === '/api/search') {
        return send(410,{ok:false,error:{code:'API_MOVED',message:'Используйте защищённый /api/rezka/search в плагине v0.10.'}});
      }
      if (u.pathname === '/') return send(200,'<!doctype html><meta charset="utf-8"><title>Мой онлайн 0.10</title><h1>Мой онлайн v0.10.0</h1><p>Сервер работает. Поиск Rezka доступен в меню «Мой онлайн» в Lampa.</p><ul><li><a href="/health">Проверить сервер</a></li><li><a href="/plugin.js">Плагин Lampa</a></li><li><a href="/backup">Резервная копия</a></li></ul>','text/html; charset=utf-8');
      return send(404,{ok:false,error:{code:'NOT_FOUND',message:'Адрес не найден'}});
    } catch (_) { return send(400,{ok:false,error:{code:'BAD_REQUEST',message:'Некорректный запрос'}}); }
  });
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 10000),'0.0.0.0',()=>console.log('Lampa API v'+VERSION+' started'));
module.exports = {createServer};
