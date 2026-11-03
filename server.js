'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const VERSION = '0.2.0';
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
  return http.createServer((req, res) => {
    const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    function send(status, data, type = 'application/json; charset=utf-8') {
      res.writeHead(status, {...headers, 'Content-Type':type});
      res.end(req.method === 'HEAD' ? undefined : typeof data === 'string' ? data : JSON.stringify(data));
    }
    if (req.method === 'OPTIONS') return send(204, '');
    if (!['GET','HEAD'].includes(req.method)) return send(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Используйте GET'}});
    try {
      const u = new URL(req.url, 'http://localhost');
      if (u.pathname === '/health') return send(200,{ok:true,version:VERSION,provider:'demo',rezkaConnected:false});
      if (u.pathname === '/plugin.js') return send(200,template.replace('"__API_ORIGIN__"', JSON.stringify(publicBase)), 'application/javascript; charset=utf-8');
      if (u.pathname === '/api/demo') return send(200,{ok:true,version:VERSION,provider:'demo',items:[{title:'Тестовый ролик: цветы (MDN, CC0)',versions:[{name:'MP4',url:DEMO}]}]});
      if (u.pathname === '/api/search') {
        const q = (u.searchParams.get('q') || '').trim();
        if (!q || q.length > 200) return send(400,{ok:false,error:{code:'INVALID_QUERY',message:'Название должно содержать от 1 до 200 символов'}});
        return send(200,{ok:true,version:VERSION,provider:'demo',items:[],message:'Источники фильма не подключены. Rezka не подключена. Для проверки выберите тестовый ролик.'});
      }
      if (u.pathname === '/') return send(200,'<!doctype html><meta charset="utf-8"><title>Мой онлайн 0.2</title><h1>Мой онлайн v0.2.0</h1><p>Сервер работает. Rezka не подключена.</p><ul><li><a href="/health">Проверить сервер</a></li><li><a href="/plugin.js">Плагин Lampa</a></li><li><a href="/api/demo">Тестовый каталог</a></li></ul><p>Проверка видео в браузере (не проверяет плеер телевизора):</p><video controls width="480" src="'+DEMO+'"></video>','text/html; charset=utf-8');
      return send(404,{ok:false,error:{code:'NOT_FOUND',message:'Адрес не найден'}});
    } catch (_) { return send(400,{ok:false,error:{code:'BAD_REQUEST',message:'Некорректный запрос'}}); }
  });
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 10000),'0.0.0.0',()=>console.log('Lampa API v'+VERSION+' started'));
module.exports = {createServer};
