(function () {
  'use strict';
  if (window.lampa_my_online_v03) return;
  var API = "__API_ORIGIN__";
  var script = document.currentScript;
  if (!API || API === '__API_ORIGIN__') {
    var link = document.createElement('a');
    link.href = script && script.src || '';
    API = link.protocol && link.host ? link.protocol + '//' + link.host : '';
  }
  var L = window.Lampa, $ = window.jQuery;
  function notify(text) { if (L && L.Noty) L.Noty.show(text); }
  if (!L || !$ || !L.Listener || !L.Select || !L.Player) { notify('Мой онлайн: несовместимая версия Lampa'); return; }
  window.lampa_my_online_v03 = true;
  var busy = false;
  function restore() { if (L.Controller) L.Controller.toggle('full_start'); }
  function menu(title, items, callback) {
    L.Select.show({title:title,items:items,onSelect:function (item) {
      L.Select.hide();
      restore();
      try { callback(item); } catch (e) { notify('Мой онлайн: ошибка интерфейса — ' + e.message); }
    },onBack:function () { L.Select.hide(); restore(); }});
  }
  function request(route, callback) {
    if (busy) { notify('Запрос уже выполняется. Подождите.'); return; }
    busy = true;
    notify('Соединение с Render… При первом запросе подождите до 90 секунд.');
    $.ajax({url:API+route,dataType:'json',timeout:90000,cache:false,
      success:function (data) {
        busy = false;
        if (!data || data.ok !== true || data.version !== '0.3.0') { notify('API_MISMATCH: обновите все файлы на Render до v0.3.0'); return; }
        try { callback(data); } catch (e) { notify('CLIENT_ERROR: '+e.message); }
      },error:function (xhr,status) {
        busy = false;
        var code = status === 'timeout' ? 'TIMEOUT' : status === 'parsererror' ? 'INVALID_JSON' : xhr.status ? 'HTTP_'+xhr.status : 'NETWORK';
        notify(code+': '+(xhr.status === 0 || status === 'timeout' ? 'Проверьте интернет и /health. Затем повторите запрос.' : 'Сервер не вернул ожидаемый ответ. Проверьте Render.')+' Адрес: '+API);
      }});
  }
  function playDemo(data) {
    var items = [];
    (data.items || []).forEach(function (item) {
      (item.versions || []).forEach(function (v) { if (/^https:\/\//i.test(v.url || '')) items.push({title:item.title+' / '+v.name,url:v.url}); });
    });
    if (!items.length) { notify('EMPTY_DEMO: тестовый ролик отсутствует'); return; }
    menu('Тест плеера • это не выбранный фильм',items,function (item) {
      if (!L.Player.play) { notify('PLAYER_UNAVAILABLE'); return; }
      L.Player.play({url:item.url,title:item.title});
      if (L.Player.playlist) L.Player.playlist([{url:item.url,title:item.title}]);
    });
  }
  function open(movie) {
    var title = movie.title || movie.name || movie.original_title || 'Фильм';
    menu('Мой онлайн v0.3 • '+title,[
      {title:'Проверить источники фильма',action:'search'},
      {title:'Запустить тестовый ролик',action:'demo'},
      {title:'Диагностика соединения',action:'health'},
      {title:'Проверить вход на Rezka',action:'rezka'},
      {title:'О подключении Rezka',action:'about'}
    ],function (item) {
      if (item.action === 'demo') request('/api/demo',playDemo);
      else if (item.action === 'rezka') request('/api/rezka/status',function (d) { notify('Rezka • '+d.rezka.code+' • '+d.rezka.message); });
      else if (item.action === 'health') request('/health',function (d) { notify('OK • сервер '+d.version+' • плагин 0.3.0 • Rezka не подключена • '+API); });
      else if (item.action === 'search') request('/api/search?q='+encodeURIComponent(title.slice(0,200)),function () { notify('Источники для «'+title+'» не подключены. Выберите «Запустить тестовый ролик». Rezka не подключена.'); });
      else notify('Доступна проверка входа Rezka через настройки Render. Поиск и воспроизведение фильмов ещё не подключены.');
    });
  }
  function add(e) {
    if (e.type !== 'complite' || !e.object || !e.object.activity) return;
    try {
      var root = e.object.activity.render();
      if (root.find('.view--my-online-v03').length) return;
      var box = root.find('.full-start-new__buttons, .full-start__buttons').eq(0);
      if (!box.length) box = root.find('.view--torrent').parent().eq(0);
      if (!box.length) return;
      var btn = $('<div class="full-start__button selector view--my-online-v03"><svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><span>Мой онлайн</span></div>');
      btn.on('hover:enter',function () { try { open(e.data && e.data.movie || {}); } catch (err) { notify('MENU_ERROR: '+err.message); } });
      box.append(btn);
    } catch (err) { notify('BUTTON_ERROR: '+err.message); }
  }
  L.Listener.follow('full',add);
  notify('Мой онлайн v0.3.0 установлен');
})();
